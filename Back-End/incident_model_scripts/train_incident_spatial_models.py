#!/usr/bin/env python3
"""
SmartFlow NLEX — Incident Spatial Models (Block 1: Incident Probability Prediction)
====================================================================================
Two per-EXIT models, sibling to train_incident_models.py's per-DAY pipeline:

  1. GWR (Geographically Weighted Regression) — one row per exit (N=20), a
     genuinely spatial regression: does the local relationship between an
     exit's incident concentration and its structural traits (corridor
     position, access-point count, typical traffic volume) vary along the
     corridor? Fit once, explanatory rather than a day-ahead forecaster —
     see the doc comment on fit_gwr() for why it is scored in-sample.

  2. Spatial LSTM — a single LSTM (shared weights across all 20 exits, one
     training example per exit-day) that sees each exit's own recent incident
     history AND a spatial-lag feature (its nearest neighbours' recent
     counts), trained with a Poisson loss and genuinely holdout-validated.
     This is the one that produces the 24-hour high-risk segment ranking.

Why a second script rather than extending train_incident_models.py: that
pipeline works at daily-national granularity (one row per calendar day) and
has no spatial dimension at all. GWR and a spatial LSTM need per-exit
geography, which is a different data shape end to end — a new script keeps
that shape change from leaking into the (working, unrelated) 7-model daily
comparison.

Why PyTorch instead of the TensorFlow/Keras the daily pipeline's LSTM/GRU
use: this machine's Python (3.14) has no TensorFlow wheel yet — the daily
pipeline's own LSTM/GRU already can't run here either, a pre-existing gap
this script does not attempt to fix. PyTorch publishes cp314 wheels, so it is
what makes a real (not simulated) LSTM possible in this environment today.

Several small helpers here (get_conn, load_daily_rain, calendar_features,
the exit-reference SQL) mirror code that already lives in
train_incident_models.py and src/services/map-comparison.service.ts.
Duplicated rather than imported — importing train_incident_models would
pull in its module-level `import tensorflow`, which fails outright in this
environment — and kept in sync by hand, the same convention this codebase
already uses everywhere a Python/TS pair needs to agree (see e.g.
PRED_COLUMN's sync comment in train_incident_models.py).

Incident source: silver.nlex_accident_events_clean / nlex_breakdown_events_clean
(the client's real accident/breakdown exports), resolved to an exit by
nearest corridor_km — migrated off the legacy nlex_road_crashes/
nlex_motorcycle_crashes/nlex_stalled_vehicles free-text `location` join,
which parsed "Km N" out of location strings using the DPWH km-post
convention and compared it directly against the Balintawak-relative exit
list with no offset correction (the same bug already found and fixed in
incident-severity.service.ts). corridor_km is a plain numeric column on the
client tables, already on the exit list's scale, so this needed no regex
and has no unresolved-location case any more.

How it is tested (10 Nov 2026, EVALUATION_PROTOCOL.md):
  * Spatial LSTM, tested the way it is SERVED: from rolling origins every 14 days across the last 52 weeks of
    real data, a 28-day recursive rollout with rain set to 0 and volume held at each exit's last-week level (the
    served assumptions), re-fitted on the data before each origin. It used to be scored one day ahead on actual
    history over a single 60-day holdout, and early stopping picked its epoch ON that holdout. Early stopping now
    uses a 60-day validation slice cut from the end of the training data, before the test.
  * Baselines on the same origins, days and exits: the protocol's three (last week, weekday average of the last 8
    weeks, same day last year scaled), each exit's trailing-365-day mean (it scored 2.150 against the LSTM's 2.166
    on the old holdout), each exit's same-weekday mean over the trailing 52 weeks, each exit's whole-history
    mean (the old baseline; ~25% level drift since 2022 makes it weak), and zero. Champion rule fixed before
    results (common/rolling_eval.select_champion): it must beat the best baseline overall AND in days 1-7, with a
    moving-block bootstrap interval; if nothing does, the best baseline's forecast is what gets written.
  * Volume is an input, so scored days end at REAL_END_VOLUME (2026-05-24); after it the panel's volume is each
    exit's last real level carried forward (25 May - 30 Jun hold broken/synthetic toll days).
  * GWR: the bandwidth is now chosen INSIDE each leave-one-exit-out fold (it was chosen once on all 20 exits and
    reused, so the held-out exit had helped pick it). Scored against the mean of the other exits, the mean of the
    two nearest exits, and a global (non-local) Poisson GLM on the same three covariates.

Usage:
    python train_incident_spatial_models.py                 # train + report only (writes the report .txt)
    python train_incident_spatial_models.py --dry-run       # train + report, writes NOTHING (no file, read-only DB session)
    python train_incident_spatial_models.py --write-db       # + write to gold.*
    python train_incident_spatial_models.py --dry-write       # rehearse the write, then roll back
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import warnings
from datetime import date, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras
import torch
import torch.nn as nn
from dotenv import load_dotenv
from mgwr.gwr import GWR
from mgwr.gwr import Poisson as GWRPoisson
from mgwr.sel_bw import Sel_BW

from honest_eval import REAL_END_VOLUME, block_bootstrap_ci, json_safe

# The shared rolling-origin harness (scoring, champion rule, bootstrap); read-only, nothing in it writes.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "smartflow_scripts" / "3_training_testing"))
from common.rolling_eval import BASELINES as PROTOCOL_BASELINES  # noqa: E402
from common.rolling_eval import report as protocol_report  # noqa: E402
from common.rolling_eval import select_champion, yearly_origins  # noqa: E402

SEED = 42
# Rolling-origin test (protocol section 2): an origin every 14 days over the last 52 weeks of real data, each a
# 28-day recursive rollout, scored in these horizon buckets.
ORIGIN_STEP_DAYS = 14
TEST_WEEKS = 52
SPATIAL_BUCKETS = [(1, 7), (8, 14), (15, 28)]
# Early-stopping validation slice: the last 60 days before the data a model is fitted on ends.
EARLY_STOP_DAYS = 60
# Shorter than train_incident_models.py's 90-day VALIDATION_DAYS: this panel
# is 20x sparser per unit time (one exit's daily count, not the whole
# corridor's), so a 90-day-wide per-exit holdout would leave many exits with
# almost no validation events at all. 60 was the narrowest window where every
# exit still has at least one non-zero holdout day.
VALIDATION_DAYS = 60
SEQ_LEN = 14  # LSTM lookback, matches train_incident_models.py's SEQ_LEN
# How many nearest-by-km exits feed the spatial-lag feature. 2 (one on each
# side, typically) keeps the lag local to "this stretch of corridor" rather
# than smearing in exits far enough away to be a different traffic regime.
N_NEIGHBORS = 2
EPOCHS = 60
PATIENCE = 8
# How many days the per-exit hotspot grid reaches. Matches the main daily
# pipeline's own FUTURE_DAYS=28 ("1 month") write -- the frontend's own
# Week/Month toggle shows either the first 7 of these or all 28, so one
# rollout has to reach the longer of the two. Every day past the first is a
# RECURSIVE rollout (see rollout_spatial_lstm): each exit's own prediction is
# fed back in as next day's "count" input, so error compounds day over day
# the way it does for any walk-forward forecast -- the frontend caveats days
# past 1 for exactly this reason, more insistently the further out they are.
HORIZON_DAYS = 28


def set_all_seeds(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


set_all_seeds()
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def get_conn(readonly: bool = False):
    """Mirrors train_incident_models.py's get_conn() — kept in sync by hand. readonly=True (--dry-run) makes the
    server refuse any write on this session."""
    dsn = os.environ.get("PGURL") or os.environ.get("POSTGRES_URL")
    if not dsn:
        host = os.environ.get("PG_HOST")
        if not host:
            sys.exit("PGURL/POSTGRES_URL or PG_HOST must be set (checked Back-End/.env)")
        dsn = (
            f"host={host} port={os.environ.get('PG_PORT', 5432)} "
            f"dbname={os.environ.get('PG_DATABASE')} user={os.environ.get('PG_USER')} "
            f"password={os.environ.get('PG_PASSWORD')}"
        )
    # TCP keep-alives: on this RDS link a connection can die mid-query without either side being told, and the
    # script then waited on it forever (2026-10-15: idle 40 min after the server had finished). With these a dead
    # link raises within about a minute and the run fails visibly instead of hanging.
    conn = psycopg2.connect(dsn, sslmode="require", keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5)
    if readonly:
        conn.set_session(readonly=True)
    return conn


# ---------------------------------------------------------------------------
# The corridor's one authoritative exit list — same km-derivation (cumulative
# dim_location segment length) as src/services/map-comparison.service.ts's
# searchExitsInDb, copied verbatim with no ILIKE filter so every exit comes
# back. See that function's own doc comment for why km is derived rather
# than hardcoded.
# ---------------------------------------------------------------------------
EXIT_REFERENCE_SQL = """
WITH seg AS (
  SELECT segment_order, start_node, end_node, length_meters,
         COALESCE(SUM(length_meters) OVER (
           ORDER BY segment_order
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS m_before
  FROM dim_location
  WHERE segment_order IS NOT NULL
), nodes AS (
  SELECT start_node AS node, m_before AS m FROM seg
  UNION ALL
  SELECT end_node, m_before + length_meters
  FROM seg WHERE segment_order = (SELECT MAX(segment_order) FROM seg)
)
SELECT x.exit_id, x.exit_name, x.latitude, x.longitude,
       ROUND((n.m / 1000.0)::numeric, 2)::float AS km,
       COALESCE(r.nb_entry, true) AS nb_entry,
       COALESCE(r.nb_exit,  true) AS nb_exit,
       COALESCE(r.sb_entry, true) AS sb_entry,
       COALESCE(r.sb_exit,  true) AS sb_exit,
       CASE WHEN x.exit_name ILIKE '%%barrier%%' THEN 'toll-barrier' ELSE 'interchange' END AS node_type
FROM nlex_exits x
LEFT JOIN nodes n ON n.node = x.exit_name
LEFT JOIN silver.nlex_exit_reference r ON r.exit_name = x.exit_name
ORDER BY x.exit_id
"""

# Same client tables as train_incident_models.py's DAILY_COUNTS_SQL and
# train_incident_severity_models.py's POOLED_INCIDENTS_SQL — migrated off
# the legacy nlex_road_crashes/nlex_motorcycle_crashes/nlex_stalled_vehicles
# free-text `location` join (see the git history: this used to carry
# `location` per row and resolve it to an exit via regex-parsed "Km N" text
# matched against the Balintawak-relative exit list, with no correction for
# km_value's DPWH km-post convention (Balintawak ~ km 12) — the same offset
# bug found and fixed in incident-severity.service.ts, still live in
# src/services/incident.service.ts's corridor-forecast code at the time this
# comment was written). corridor_km is selected directly instead: a plain
# numeric column, already Balintawak-relative, no text parsing or unresolved
# rows possible.
INCIDENT_LOCATIONS_SQL = """
    SELECT event_start_date::date AS d, corridor_km
    FROM silver.nlex_accident_events_clean
    WHERE event_start_date IS NOT NULL AND corridor_km IS NOT NULL
    UNION ALL
    SELECT event_encoded_date::date AS d, corridor_km
    FROM silver.nlex_breakdown_events_clean
    WHERE event_encoded_date IS NOT NULL AND corridor_km IS NOT NULL
"""

# Mirrors train_incident_models.py's DAILY_RAIN_SQL — one corridor-wide
# reading (NLEX_LAT/LON), so this is a temporal control shared by every exit
# rather than a spatially-varying covariate.
# Corridor rain per Manila day: the weather points averaged each hour (once per coordinate), then summed over the
# day. It was SUM over every (point, hour) row, i.e. the 20 points ADDED: about 20x the real rain (5 Nov 2026; the
# same fix as train_incident_models.py's DAILY_RAIN_SQL and retrain_honest.py's note 1).
DAILY_RAIN_SQL = """
    WITH pts AS (
        SELECT timestamp_utc, round(latitude::numeric, 3) AS la, round(longitude::numeric, 3) AS lo,
               AVG(rainfall) AS rainfall
        FROM hourly_weather
        GROUP BY 1, 2, 3
    ),
    hourly AS (
        SELECT timestamp_utc, AVG(rainfall) AS rain FROM pts GROUP BY 1
    )
    SELECT (timestamp_utc + interval '8 hours')::date AS d, SUM(rain)::float AS rain_mm
    FROM hourly
    GROUP BY 1
    ORDER BY 1
"""

# Each exit's daily volume from the toll record every other model reads
# (gold.fact_traffic_hourly, trips at the plaza where they paid), matched to
# nlex_exits by name as train_incident_weather_speed_models.py does. It used to
# be bronze.nlex_traffic_volume, the old synthetic wide table: 2.4-11x the real
# levels, per-exit shares unlike the record (Bocaue Interchange 8.7% of volume
# against a real 3.2%) and no Bocaue Barrier or Tambubong rows at all (28 Oct
# 2026). 19 of 20 exits match; SCTEX has no paid-at rows by construction and
# takes the typical exit's volume in main().
EXIT_VOLUME_SQL = """
    SELECT x.exit_id, f.date AS d, SUM(f.total)::float AS volume
    FROM gold.fact_traffic_hourly f
    JOIN nlex_exits x ON x.exit_name = f.exit_canonical
    GROUP BY x.exit_id, f.date
"""


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def load_exit_reference(conn) -> pd.DataFrame:
    df = pd.read_sql(EXIT_REFERENCE_SQL, conn)
    df["access_count"] = (
        df["nb_entry"].astype(int) + df["nb_exit"].astype(int)
        + df["sb_entry"].astype(int) + df["sb_exit"].astype(int)
    )
    return df


def load_daily_rain(conn) -> pd.DataFrame:
    df = pd.read_sql(DAILY_RAIN_SQL, conn)
    df["d"] = pd.to_datetime(df["d"])
    return df


def load_exit_volume(conn) -> pd.DataFrame:
    df = pd.read_sql(EXIT_VOLUME_SQL, conn)
    df["d"] = pd.to_datetime(df["d"])
    return df


def load_holidays(conn) -> set:
    # ph_holidays, the validated calendar every other model reads; dim_holiday is the old view inferred from the
    # synthetic wide table's is_holiday flag.
    df = pd.read_sql("SELECT date_day FROM public.ph_holidays", conn)
    return set(pd.to_datetime(df["date_day"]).dt.date)


def calendar_features(dates: pd.Series, holiday_dates: set) -> pd.DataFrame:
    """Mirrors train_incident_models.py's calendar_features — kept in sync by hand."""
    dow = dates.dt.dayofweek
    doy = dates.dt.dayofyear
    return pd.DataFrame(
        {
            "dow": dow,
            "is_weekend": dow.isin([5, 6]).astype(int),
            "is_holiday": dates.dt.date.map(lambda x: int(x in holiday_dates)),
            "doy_sin": np.sin(2 * np.pi * doy / 365.25),
            "doy_cos": np.cos(2 * np.pi * doy / 365.25),
        },
        index=dates.index,
    )


def load_incident_exit_counts(conn, exits_df: pd.DataFrame) -> pd.DataFrame:
    """One row per (date, exit_id) with the resolved incident count, zero-filled
    over the full calendar range x every exit — most exit-days have no
    incident at all, and an absent row must read as 0, not as missing.

    Resolution is a nearest-neighbour match on corridor_km (both sides
    already on the same Balintawak-relative scale), via merge_asof rather
    than a per-row Python loop — vectorized, and every row resolves (no
    free-text ambiguity left to produce an "unresolved" row the way the old
    location-text matching could)."""
    raw = pd.read_sql(INCIDENT_LOCATIONS_SQL, conn)
    raw["d"] = pd.to_datetime(raw["d"])

    exits_by_km = exits_df[["exit_id", "km"]].sort_values("km").reset_index(drop=True)
    raw_by_km = raw.sort_values("corridor_km").reset_index(drop=True)
    matched = pd.merge_asof(
        raw_by_km, exits_by_km, left_on="corridor_km", right_on="km", direction="nearest"
    )
    print(f"  {len(matched)} incident rows resolved to an exit by nearest corridor_km")

    counts = matched.groupby(["d", "exit_id"]).size().rename("count").reset_index()

    full_dates = pd.date_range(raw["d"].min(), raw["d"].max(), freq="D")
    panel_index = pd.MultiIndex.from_product(
        [full_dates, exits_df["exit_id"]], names=["d", "exit_id"]
    )
    panel = (
        counts.set_index(["d", "exit_id"])
        .reindex(panel_index, fill_value=0)
        .rename_axis(["d", "exit_id"])
        .reset_index()
    )
    return panel


def build_panel(conn, exits_df: pd.DataFrame) -> pd.DataFrame:
    """The full per-(exit, day) feature panel every model below reads from."""
    print("Loading incidents and resolving each to an exit...")
    panel = load_incident_exit_counts(conn, exits_df)
    # Incidents run to 30 Jun 2026 but traffic volume is real only to REAL_END_VOLUME (user, 11 Nov 2026): the panel
    # ends there too, so the served rollout starts on 25 May like the traffic and daily incident forecasts.
    record_last = panel["d"].max()
    panel = panel[panel["d"] <= REAL_END_VOLUME].reset_index(drop=True)
    if record_last > REAL_END_VOLUME:
        print(f"  incident panel cut to {REAL_END_VOLUME.date()} (record runs to {record_last.date()}) "
              "to match the real traffic record")

    rain = load_daily_rain(conn)
    panel = panel.merge(rain, on="d", how="left")
    panel["rain_mm"] = panel["rain_mm"].fillna(0.0)

    print("Loading per-exit daily volume (gold.fact_traffic_hourly by exit)...")
    vol = load_exit_volume(conn)
    # Real volume only (10 Nov 2026): 25 May - 30 Jun 2026 still hold broken and synthetic toll days. After
    # REAL_END_VOLUME each exit's volume is its own mean over its last 28 real days carried forward — the same
    # "hold the recent level flat" the served rollout uses for the future.
    vol = vol[vol["d"] <= REAL_END_VOLUME]
    last_level = vol[vol["d"] > REAL_END_VOLUME - pd.Timedelta(days=28)].groupby("exit_id")["volume"].mean()
    panel = panel.merge(vol, on=["d", "exit_id"], how="left")
    after = panel["d"] > REAL_END_VOLUME
    panel.loc[after, "volume"] = panel.loc[after, "exit_id"].map(last_level)
    # One exit's typical day, not the corridor's: the fallback is for a single
    # exit, and the corridor total (what .sum() gave) credited an exit without
    # its own series with every exit's traffic at once.
    typical_exit_volume = vol.groupby("d")["volume"].mean().mean()
    covered = panel.loc[~after, "volume"].notna().mean()
    print(f"  {covered * 100:.0f}% of exit-days to {REAL_END_VOLUME.date()} have their own volume reading; "
          f"the rest fall back to the typical exit's daily volume ({typical_exit_volume:,.0f}); after "
          f"{REAL_END_VOLUME.date()} each exit's last 28 real days' level is carried forward")
    panel["volume"] = panel["volume"].fillna(typical_exit_volume)
    panel["log_volume"] = np.log(panel["volume"].clip(lower=1.0))

    holidays = load_holidays(conn)
    panel = panel.merge(calendar_features(panel["d"], holidays), left_index=True, right_index=True)

    panel = panel.merge(
        exits_df[["exit_id", "exit_name", "latitude", "longitude", "km", "access_count", "node_type"]],
        on="exit_id", how="left",
    )

    panel = panel.sort_values(["exit_id", "d"]).reset_index(drop=True)
    panel["lag_1"] = panel.groupby("exit_id")["count"].shift(1)
    panel["lag_7"] = panel.groupby("exit_id")["count"].shift(7)
    panel["roll_mean_7"] = panel.groupby("exit_id")["count"].transform(
        lambda s: s.shift(1).rolling(7, min_periods=1).mean()
    )

    # Spatial lag: each exit's own lag_1, blended with its N_NEIGHBORS
    # nearest-by-km exits' lag_1 for that same day. This is the one feature
    # that makes the LSTM "spatial" rather than 20 independent univariate
    # models sharing weights by coincidence.
    km_by_exit = exits_df.set_index("exit_id")["km"]
    neighbors_by_exit = {}
    for eid in exits_df["exit_id"]:
        dists = (km_by_exit - km_by_exit.loc[eid]).abs().drop(eid)
        neighbors_by_exit[eid] = dists.nsmallest(N_NEIGHBORS).index.tolist()

    lag1_by_exit_day = panel.pivot(index="d", columns="exit_id", values="lag_1")
    neighbor_lag = pd.DataFrame(index=lag1_by_exit_day.index)
    for eid, neighbors in neighbors_by_exit.items():
        neighbor_lag[eid] = lag1_by_exit_day[neighbors].mean(axis=1)
    neighbor_long = neighbor_lag.stack().rename("neighbor_lag_1").reset_index()
    neighbor_long.columns = ["d", "exit_id", "neighbor_lag_1"]
    panel = panel.merge(neighbor_long, on=["d", "exit_id"], how="left")

    return panel


# ---------------------------------------------------------------------------
# Shared metric helpers — same definitions as train_incident_models.py's
# full_metrics (MAE, Poisson deviance), kept in sync by hand so a number
# called "Poisson deviance" means the same formula everywhere in this module.
# ---------------------------------------------------------------------------
def mae_of(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs(np.asarray(y_true, dtype=float) - np.asarray(y_pred, dtype=float))))


def poisson_deviance_of(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    safe_pred = np.clip(np.asarray(y_pred, dtype=float), 1e-9, None)
    ratio = np.where(y_true > 0, y_true * np.log(np.where(y_true > 0, y_true, 1) / safe_pred), 0.0)
    return float(2 * np.mean(ratio - (y_true - safe_pred)))


# ---------------------------------------------------------------------------
# Model 1: GWR — one row per exit, explanatory rather than day-ahead.
# ---------------------------------------------------------------------------
GWR_VARIABLES = ["km", "access_count", "mean_log_volume"]


def fit_gwr(exits_df: pd.DataFrame, panel: pd.DataFrame) -> dict:
    """Fits one GWR: does the local relationship between an exit's mean daily
    incident rate and its structural traits vary along the corridor?

    Every exit is observed over the identical date range, so exposure (days
    observed) is a constant across the N=20 units — it folds entirely into
    the intercept under a log link and leaves every other coefficient
    unchanged (log(count) = log(rate) + log(days), and log(days) is the same
    number for every row). The response is scaled to a per-day RATE rather
    than a 6.5-year total purely so the coefficients and MAE below read on
    the same "incidents per day" scale as the Spatial LSTM's — the fit
    itself is identical either way, only the intercept and its units shift.

    Scored IN-SAMPLE (fit and evaluated on the same 20 rows) and reported as
    such — with only 20 spatial units there is no meaningful held-out subset
    to score against, unlike the Spatial LSTM below. GWR's job here is the
    coefficient map, not a validated forecast.
    """
    n_days = panel["d"].nunique()
    totals = panel.groupby("exit_id").agg(total_count=("count", "sum")).reset_index()
    # Typical volume from REAL days only (the carried-forward tail after REAL_END_VOLUME is not a reading).
    real = panel[panel["d"] <= REAL_END_VOLUME]
    totals = totals.merge(real.groupby("exit_id")["log_volume"].mean().rename("mean_log_volume").reset_index(),
                          on="exit_id", how="left")
    totals["daily_rate"] = totals["total_count"] / n_days
    cross = exits_df.merge(totals, on="exit_id")

    coords = list(zip(cross["longitude"], cross["latitude"]))
    y = cross["daily_rate"].values.reshape(-1, 1).astype(float)
    X = cross[["km", "access_count", "mean_log_volume"]].values.astype(float)

    # Fixed (continuous-distance) bandwidth, not the adaptive nearest-neighbour-
    # count kernel mgwr defaults to: with N=20 points, the default adaptive
    # search's own bandwidth floor (40 + 2*n_vars neighbours) exceeds the
    # sample size and raises outright. A fixed kernel's search bounds are
    # continuous distances, which stay well-defined at any N — except the
    # golden-section search still tries the degenerate low end first (half
    # the minimum pairwise distance, here ~0.002 degrees), where the bisquare
    # kernel gives non-negligible weight to only 1-2 exits and the local
    # weighted design matrix is singular for 4 parameters (intercept + 3
    # covariates). bw_min floors the search at the median pairwise distance
    # instead, which is small enough to still express real local variation
    # (half the corridor's 20 exits closer than it, half farther) while
    # guaranteeing enough weighted support to fit the model everywhere.
    from scipy.spatial.distance import pdist
    bw_min = float(np.median(pdist(np.array(coords))))
    selector = Sel_BW(coords, y, X, family=GWRPoisson(), fixed=True)
    bw = selector.search(bw_min=bw_min)
    model = GWR(coords, y, X, bw, family=GWRPoisson(), fixed=True)
    results = model.fit()

    # .predictions requires calling .predict() separately (a held-out-point
    # API this in-sample fit has no use for); the fitted values are already
    # available as y - resid_response, GWRResults' own residual.
    actual = y.flatten()
    pred = actual - np.asarray(results.resid_response).flatten()
    metrics = {
        "MAE": mae_of(actual, pred),
        "Poisson_Deviance": poisson_deviance_of(actual, pred),
        "n": len(actual),
        "bandwidth_km": None,  # fixed-kernel bw is in coordinate (degree) units, not km — see note below
    }

    # Leave-one-exit-out MAE, reported alongside (not instead of) the
    # in-sample fit above. N=20 is too thin for a fixed train/test split (the
    # reasoning in this function's own docstring for why one isn't used), but
    # LOOCV needs no such split — every exit gets its turn as the held-out
    # point, refit on the other 19. GWR.predict()'s own `.predictions`
    # attribute turned out NOT to be on the response scale for a Poisson
    # family (verified directly: produced negative values for a count-rate
    # target, which is impossible) — `.mu`, the GLM mean response, is the
    # correct field; found by comparing both against a known in-sample point.
    #
    # The bandwidth is chosen INSIDE each fold, on the 19 training exits only (10 Nov 2026). It used to be the
    # one chosen on all 20, so the held-out exit had helped choose the kernel it was then predicted with.
    # Scored next to, on the same folds: the mean of the other exits (baseline), the mean of the two nearest exits
    # by km (a spatial baseline), and a global Poisson GLM on the same three covariates (the non-local version of
    # GWR, so the report shows whether letting the coefficients vary along the corridor adds anything).
    import statsmodels.api as sm
    km_arr = cross["km"].values.astype(float)
    loo = {"GWR": [], "Global Poisson GLM": [], "Mean of the other exits (baseline)": [],
           "Mean of the 2 nearest exits (baseline)": []}
    loo_actual, fold_bw, failed = [], [], 0
    for i in range(len(cross)):
        mask = np.ones(len(cross), dtype=bool)
        mask[i] = False
        tr_coords = [coords[j] for j in range(len(coords)) if mask[j]]
        try:
            fold_bw_min = float(np.median(pdist(np.array(tr_coords))))
            b = Sel_BW(tr_coords, y[mask], X[mask], family=GWRPoisson(), fixed=True).search(bw_min=fold_bw_min)
            fold_result = GWR(tr_coords, y[mask], X[mask], b, family=GWRPoisson(), fixed=True).predict(
                np.array([coords[i]]), X[[i]])
            gwr_pred = float(np.asarray(fold_result.mu).flatten()[0])
            glm = sm.GLM(y[mask].ravel(), sm.add_constant(X[mask], has_constant="add"),
                         family=sm.families.Poisson()).fit()
            glm_pred = float(np.asarray(glm.predict(sm.add_constant(X[[i]], has_constant="add"))).ravel()[0])
        except Exception:
            failed += 1  # a fold that fails is dropped for EVERY method below, so all are scored on the same folds
            continue
        others = y[mask].ravel()
        near = np.argsort(np.abs(km_arr[mask] - km_arr[i]))[:2]
        loo["GWR"].append(gwr_pred)
        loo["Global Poisson GLM"].append(glm_pred)
        loo["Mean of the other exits (baseline)"].append(float(others.mean()))
        loo["Mean of the 2 nearest exits (baseline)"].append(float(others[near].mean()))
        loo_actual.append(float(y[i, 0]))
        fold_bw.append(float(b))
    a = np.array(loo_actual)
    metrics["loocv_mae"] = mae_of(a, np.array(loo["GWR"])) if loo_actual else None
    metrics["loocv_n"] = len(loo_actual)
    metrics["loocv_failed_folds"] = failed
    metrics["loocv_bandwidth_range"] = [min(fold_bw), max(fold_bw)] if fold_bw else None
    metrics["loocv_comparison"] = {k: mae_of(a, np.array(v)) for k, v in loo.items()} if loo_actual else {}
    if loo_actual:
        err = {k: np.abs(a - np.array(v)) for k, v in loo.items()}
        best_b = min((k for k in loo if k.endswith("(baseline)")), key=lambda k: err[k].mean())
        metrics["loocv_best_baseline"] = best_b
        metrics["loocv_beats_best_baseline"] = bool(err["GWR"].mean() < err[best_b].mean())
        # Paired bootstrap over exits (each fold is one exit; block = 1).
        metrics["loocv_gwr_minus_best_baseline_ci"] = list(block_bootstrap_ci(
            np.arange(len(a)), lambda ix: float(err["GWR"][ix].mean() - err[best_b][ix].mean()), block=1))
        metrics["loocv_gwr_minus_glm_ci"] = list(block_bootstrap_ci(
            np.arange(len(a)), lambda ix: float(err["GWR"][ix].mean() - err["Global Poisson GLM"][ix].mean()), block=1))

    # results.params columns are [const, km, access_count, mean_log_volume] —
    # constant=True (mgwr's default) prepends the intercept itself.
    var_names = ["intercept"] + GWR_VARIABLES
    coefficients = []
    for i, row in cross.iterrows():
        for j, var in enumerate(var_names):
            coefficients.append({
                "exit_id": int(row["exit_id"]),
                "exit_name": row["exit_name"],
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "km": float(row["km"]),
                "variable": var,
                "coefficient": float(results.params[i, j]),
                "std_error": float(results.bse[i, j]),
                "t_value": float(results.tvalues[i, j]),
                # |t| > ~1.96 is the conventional 95% two-sided cutoff; local
                # GWR standard errors are approximate (no small-sample
                # correction here), so this is a rough signal, not a p-value.
                "significant": bool(abs(results.tvalues[i, j]) > 1.96),
            })

    return {
        "bw": float(bw),
        "metrics": metrics,
        "coefficients": coefficients,
        "cross_section": cross,
    }


# ---------------------------------------------------------------------------
# Model 2: Spatial LSTM — pooled across exits, real temporal holdout,
# Poisson loss, produces the next-24h per-exit risk ranking.
# ---------------------------------------------------------------------------
SEQ_FEATURES = ["count", "neighbor_lag_1", "log_volume", "rain_mm"]
STATIC_FEATURES = ["km", "access_count"]


class SpatialLSTM(nn.Module):
    def __init__(self, seq_features: int, static_features: int, hidden: int = 16):
        super().__init__()
        self.lstm = nn.LSTM(input_size=seq_features, hidden_size=hidden, batch_first=True)
        self.head = nn.Linear(hidden + static_features, 1)

    def forward(self, seq: torch.Tensor, static: torch.Tensor) -> torch.Tensor:
        out, _ = self.lstm(seq)
        last = out[:, -1, :]
        combined = torch.cat([last, static], dim=1)
        # Log-rate output: paired with PoissonNLLLoss(log_input=True) below,
        # and exp()'d wherever a count is actually needed.
        return self.head(combined).squeeze(-1)


def _build_sequences(panel: pd.DataFrame, exits_df: pd.DataFrame, seq_mean, seq_std, seq_features=None):
    """One example per (exit, day) whose trailing SEQ_LEN days are all
    present (no NaN lag/rolling warm-up). Returns tensors plus the exit_id
    and date each row came from, so callers can split by date or look up
    "the most recent window per exit" for inference."""
    seq_features = seq_features or SEQ_FEATURES
    seq_arr, static_arr, y_arr, meta = [], [], [], []
    static_km_mean, static_km_std = exits_df["km"].mean(), exits_df["km"].std() or 1.0

    for eid, g in panel.groupby("exit_id"):
        g = g.sort_values("d").reset_index(drop=True)
        feats = g[seq_features].values.astype("float32")
        feats = (feats - seq_mean) / seq_std
        static_row = g[STATIC_FEATURES].iloc[0]
        static_vec = np.array([
            (static_row["km"] - static_km_mean) / static_km_std,
            static_row["access_count"] / 4.0,
        ], dtype="float32")

        counts = g["count"].values.astype("float32")
        valid = g[seq_features].notna().all(axis=1).values
        for i in range(SEQ_LEN, len(g)):
            if not valid[i - SEQ_LEN : i + 1].all():
                continue
            seq_arr.append(feats[i - SEQ_LEN : i])
            static_arr.append(static_vec)
            y_arr.append(counts[i])
            meta.append((eid, g["d"].iloc[i]))

    return (
        torch.tensor(np.array(seq_arr)),
        torch.tensor(np.array(static_arr)),
        torch.tensor(np.array(y_arr)),
        meta,
    )


# Variants offered the same history: the served LSTM (rain and volume as inputs, served with rain = 0 and volume
# held flat), and its twin without the rain input (no rainfall forecast reaches the rollout, so a model that never
# learned to lean on rain is the fair comparison: protocol section 2's weather-free twin).
LSTM_VARIANTS = {
    "Spatial LSTM": ["count", "neighbor_lag_1", "log_volume", "rain_mm"],
    "Spatial LSTM (no rain input)": ["count", "neighbor_lag_1", "log_volume"],
}
BATCH_SIZE = 512


def _train_epochs(seq_tr, static_tr, y_tr, n_features: int, epochs: int, val=None):
    """Mini-batch Adam with a Poisson loss. With `val` = (seq, static, y) it early-stops on that slice (patience
    PATIENCE) and returns (model, best_epoch); without it, it trains exactly `epochs` epochs."""
    set_all_seeds()
    model = SpatialLSTM(seq_features=n_features, static_features=len(STATIC_FEATURES))
    # Head bias starts at log(mean training count) rather than 0. The output
    # is a log-rate, so a zero start means "predict 1 incident per exit-day"
    # — fine when this panel's mean was ~1.3 (the old three-table source),
    # badly off at ~5.3 (the full accident+breakdown population).
    with torch.no_grad():
        model.head.bias.fill_(float(np.log(max(y_tr.mean().item(), 1e-3))))
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    # PoissonNLLLoss(log_input=True): model outputs log(lambda).
    loss_fn = nn.PoissonNLLLoss(log_input=True)
    n_train = len(y_tr)
    best_val, best_state, best_epoch, patience_left = float("inf"), None, epochs, PATIENCE
    for epoch in range(epochs):
        model.train()
        perm = torch.randperm(n_train)
        for start in range(0, n_train, BATCH_SIZE):
            b = perm[start:start + BATCH_SIZE]
            optimizer.zero_grad()
            loss_fn(model(seq_tr[b], static_tr[b]), y_tr[b]).backward()
            optimizer.step()
        if val is None:
            continue
        model.eval()
        with torch.no_grad():
            v = loss_fn(model(val[0], val[1]), val[2]).item()
        if v < best_val - 1e-4:
            best_val, best_epoch, patience_left = v, epoch + 1, PATIENCE
            best_state = {k: t.clone() for k, t in model.state_dict().items()}
        else:
            patience_left -= 1
            if patience_left <= 0:
                break
    if val is not None and best_state is not None:
        model.load_state_dict(best_state)
    model.eval()
    return model, best_epoch


def fit_lstm_before(panel: pd.DataFrame, exits_df: pd.DataFrame, end: pd.Timestamp, seq_features: list[str]):
    """Fit one LSTM on every example whose target day is before `end` (nothing on or after it is seen).

    1. Early stopping: train on targets before end - EARLY_STOP_DAYS, stop on the last EARLY_STOP_DAYS days before
       `end` (a validation slice; it used to stop on the test days themselves).
    2. Refit from the same start on ALL targets before `end` for the chosen number of epochs, so the most recent
       60 days also shape the weights."""
    hist = panel[panel["d"] < end]
    seq_mean = hist[seq_features].mean().values.astype("float32")
    seq_std = hist[seq_features].std().replace(0, 1.0).values.astype("float32")
    seq, static, y, meta = _build_sequences(hist, exits_df, seq_mean, seq_std, seq_features)
    dates = np.array([m[1] for m in meta], dtype="datetime64[ns]")
    val_start = np.datetime64(end - pd.Timedelta(days=EARLY_STOP_DAYS))
    tr = torch.tensor(dates < val_start)
    _, best_epoch = _train_epochs(seq[tr], static[tr], y[tr], len(seq_features), EPOCHS,
                                  val=(seq[~tr], static[~tr], y[~tr]))
    model, _ = _train_epochs(seq, static, y, len(seq_features), best_epoch)
    return model, seq_mean, seq_std, {"best_epoch": int(best_epoch), "train_examples": int(len(y)),
                                      "val_start": str(pd.Timestamp(val_start).date())}


def _baseline_forecasts(hist: pd.DataFrame, dates: pd.DatetimeIndex) -> dict[str, dict[int, np.ndarray]]:
    """Per-exit baseline forecasts for `dates`, from `hist` (days before the origin) only."""
    out: dict[str, dict[int, np.ndarray]] = {}
    future = pd.DataFrame({"ds": dates})
    proto = PROTOCOL_BASELINES("count")
    origin = dates[0]
    for eid, g in hist.groupby("exit_id"):
        s = g.sort_values("d")
        tr = pd.DataFrame({"ds": s["d"].values, "count": s["count"].values.astype(float)})
        for name, fn in proto.items():
            out.setdefault(name, {})[eid] = np.asarray(fn(tr, future), dtype=float)
        last365 = s[s["d"] >= origin - pd.Timedelta(days=365)]
        out.setdefault("Baseline: trailing 365-day mean", {})[eid] = np.full(len(dates), float(last365["count"].mean()))
        wk = last365.groupby(last365["d"].dt.dayofweek)["count"].mean()
        out.setdefault("Baseline: same weekday, trailing 52 weeks", {})[eid] = np.array(
            [float(wk.get(d.dayofweek, last365["count"].mean())) for d in dates])
        out.setdefault("Baseline: whole-history mean", {})[eid] = np.full(len(dates), float(s["count"].mean()))
        out.setdefault("Baseline: zero", {})[eid] = np.zeros(len(dates))
    return out


def rolling_test(panel: pd.DataFrame, exits_df: pd.DataFrame, variants: dict[str, list[str]], log=print,
                 refit_every: int = 4) -> dict:
    """Protocol section 2 for the hotspot forecast: origins every ORIGIN_STEP_DAYS over the last TEST_WEEKS weeks
    of REAL data (volume is an input, so scored days end at REAL_END_VOLUME); from every origin each LSTM variant is
    rolled out HORIZON_DAYS days exactly as served (rain 0, volume flat, its own predictions fed back) from the
    actual history before that origin; the baselines are computed from the same days. Then
    rolling_eval.select_champion.

    Re-fitting: one LSTM fit (validation fit + refit) takes 1.5-3 minutes on this PC, so the weights are re-fitted
    at every `refit_every`-th origin (default 4 = every 8 weeks) and reused for the origins up to the next refit.
    Every forecast still uses only data before its own origin (the weights come from data before an earlier or the
    same origin); `refit_every=1` is the protocol's literal refit-at-every-origin."""
    import time
    days = pd.Series(np.sort(panel["d"].unique()))
    origins = yearly_origins(days, REAL_END_VOLUME, step=ORIGIN_STEP_DAYS, weeks=TEST_WEEKS)
    ids_with_history = set(panel.groupby("exit_id")["count"].sum().loc[lambda s: s > 0].index)
    actual = panel.set_index(["d", "exit_id"])["count"]
    rows, fit_info = [], []
    fitted: dict[str, tuple] = {}
    for oi, pos in enumerate(origins, 1):
        t0 = time.time()
        origin = pd.Timestamp(days.iloc[pos])
        dates = pd.date_range(origin, periods=HORIZON_DAYS, freq="D")
        hist = panel[panel["d"] < origin]
        fc: dict[str, dict[int, np.ndarray]] = _baseline_forecasts(hist, dates)
        for name, feats in variants.items():
            if (oi - 1) % max(1, refit_every) == 0 or name not in fitted:
                model, mu, sd, info = fit_lstm_before(panel, exits_df, origin, feats)
                info.update(origin=str(origin.date()), model=name)
                fit_info.append(info)
                fitted[name] = (model, mu, sd)
            model, mu, sd = fitted[name]
            roll = rollout_spatial_lstm(model, hist, exits_df, mu, sd, HORIZON_DAYS, seq_features=feats)
            fc[name] = {}
            for r in roll:
                fc[name].setdefault(r["exit_id"], np.zeros(HORIZON_DAYS))[r["horizon_day"] - 1] = r["predicted_incidents"]
        for name, per_exit in fc.items():
            for eid, yh in per_exit.items():
                if eid not in ids_with_history:
                    continue
                for h, d in enumerate(dates, 1):
                    if d > REAL_END_VOLUME or (d, eid) not in actual.index:
                        continue
                    rows.append([oi, name, h, str(d.date()), int(eid), float(actual[(d, eid)]), float(yh[h - 1])])
        log(f"  origin {oi}/{len(origins)} from {origin.date()} ({time.time() - t0:.0f}s)", flush=True)
    res = pd.DataFrame(rows, columns=["origin", "model", "h", "date", "exit_id", "actual", "forecast"])
    # Lower = simpler: fewer inputs first; a lead that is not significant goes to the simpler model.
    complexity = {name: 1 + i for i, name in enumerate(sorted(variants, key=lambda n: len(variants[n])))}
    sel = select_champion(res, buckets=SPATIAL_BUCKETS, metric="mae", complexity=complexity)
    return {"results": res, "selection": sel, "origins": [str(pd.Timestamp(days.iloc[p]).date()) for p in origins],
            "fit_info": fit_info, "n_exits": len(ids_with_history)}


def fit_spatial_lstm(panel: pd.DataFrame, exits_df: pd.DataFrame, variants: dict[str, list[str]],
                     refit_every: int = 4) -> dict:
    """Rolling test, then the FINAL forecast from the champion, fitted on all the data (protocol section 7).
    If no LSTM beats the best baseline, the best baseline's 28-day forecast is what gets written."""
    print(f"  rolling test: origins every {ORIGIN_STEP_DAYS} days over the last {TEST_WEEKS} weeks to "
          f"{REAL_END_VOLUME.date()}, {HORIZON_DAYS}-day served rollout, weights refitted every {refit_every} origin(s)", flush=True)
    test = rolling_test(panel, exits_df, variants, refit_every=refit_every)
    sel = test["selection"]
    table = pd.DataFrame(sel["table"]).T
    res = test["results"]
    champion = sel["champion"]

    end = panel["d"].max() + pd.Timedelta(days=1)
    dates = pd.date_range(end, periods=HORIZON_DAYS, freq="D")
    final_info = None
    if champion in variants:
        feats = variants[champion]
        model, mu, sd, final_info = fit_lstm_before(panel, exits_df, end, feats)
        forecasts = rollout_spatial_lstm(model, panel, exits_df, mu, sd, HORIZON_DAYS, seq_features=feats)
    else:
        per_exit = _baseline_forecasts(panel, dates)[champion]
        last_obs = panel.sort_values("d").groupby("exit_id")["count"].last()
        forecasts = []
        for h, d in enumerate(dates, 1):
            day = [{"exit_id": int(e), "forecast_date": d.date(), "horizon_day": h,
                    "predicted_incidents": float(max(v[h - 1], 0.0)),
                    "last_observed_count": float(last_obs.get(e, np.nan)) if h == 1 else None}
                   for e, v in per_exit.items()]
            day.sort(key=lambda r: r["predicted_incidents"], reverse=True)
            for rank, r in enumerate(day, 1):
                r["rank"] = rank
            forecasts.extend(day)

    def score(name):
        return float(table.loc[name, "score"]) if name in table.index else None

    lstm_name = "Spatial LSTM"
    sub = res[res["model"] == lstm_name]
    with_history = set(panel.groupby("exit_id")["count"].sum().loc[lambda s: s > 0].index)
    metrics = {
        # MAE = the protocol score: mean of the horizon-bucket MAEs (days 1-7, 8-14, 15-28) over the rolling origins.
        "MAE": score(lstm_name),
        "Poisson_Deviance": poisson_deviance_of(sub["actual"].values, sub["forecast"].values) if len(sub) else None,
        "baseline_mae_per_exit_mean": score("Baseline: whole-history mean"),
        "baseline_mae_zero": score("Baseline: zero"),
        "baseline_mae_trailing_365": score("Baseline: trailing 365-day mean"),
        "baseline_mae_same_weekday_52w": score("Baseline: same weekday, trailing 52 weeks"),
        "by_model": {m: {k: float(v) for k, v in table.loc[m].items()} for m in table.index},
        "champion": champion,
        "champion_is_baseline": bool(sel.get("champion_is_baseline", False)),
        "selection": {k: v for k, v in sel.items() if k != "table"},
        "n": int(len(sub)),
        "n_exits": test["n_exits"],
        "origins": test["origins"],
        "test_window": [str(res["date"].min()), str(res["date"].max())],
        "excluded_exits": exits_df[~exits_df["exit_id"].isin(with_history)]["exit_name"].tolist(),
        "epochs_trained": final_info["best_epoch"] if final_info else None,
        "protocol": ("rolling origins every 14 days over the last 52 weeks of real volume, each a 28-day recursive "
                     f"rollout as served (rain 0, volume held at the last week's level); weights refitted every {refit_every} "
                     "origin(s) on data before that origin, early stopping on the 60 days before it"),
        "refit_every_origins": refit_every,
        "fits": test["fit_info"],
    }
    return {"metrics": metrics, "forecasts": forecasts, "results": res, "selection": sel}


def rollout_spatial_lstm(model: "SpatialLSTM", panel: pd.DataFrame, exits_df: pd.DataFrame,
                          seq_mean: np.ndarray, seq_std: np.ndarray, horizon_days: int,
                          seq_features: list[str] | None = None) -> list[dict]:
    """Recursive HORIZON_DAYS-ahead forecast, jointly across all exits, from the day after `panel` ends.

    The model itself only ever took one step (see the SpatialLSTM/
    _build_sequences docstrings above) — day h+1 is produced the same way a
    single next-24h forecast always was, but day h+1's prediction is then fed
    back in as day h+1's own "count" input so day h+2 can be forecast from
    it, and so on for `horizon_days`. This is the same walk-forward idea
    train_incident_models.py's own multi-day models already use for the main
    Forecast chart's Future zone, applied per-exit here instead of
    corridor-wide. The rolling test (rolling_test) calls this same function, so
    what is scored is exactly what is served.

    Inputs with no real future value:
      - neighbor_lag_1 is rebuilt each rollout day from the neighbouring exits'
        counts of the PREVIOUS day (observed for the first step, this rollout's
        own predictions after that). It used to take the neighbours' SAME-day
        predictions, one day off from how the feature is built in training
        (lag 1); corrected 10 Nov 2026.
      - log_volume and rain_mm have no per-exit, multi-day forecast of their
        own anywhere in this warehouse. Held flat for the whole rollout
        instead of guessed fresh each day: log_volume at that exit's own
        mean over its last 7 OBSERVED days (its typical recent level),
        rain_mm at 0 (a dry-day assumption — there is no rainfall forecast
        to read instead). Both choices are named in ml_incident_spatial_metadata
        so the frontend can caveat them rather than present day 4-7 as resting
        on the same footing as day 1.

    Returns a flat list of {exit_id, forecast_date, horizon_day,
    predicted_incidents, last_observed_count, rank} — last_observed_count and
    rank are per-horizon_day (rank 1 = highest-predicted exit on THAT day,
    not across the whole week), and last_observed_count is only ever real
    (non-null) on horizon_day 1; later days have no corresponding observation
    to report.
    """
    seq_features = seq_features or SEQ_FEATURES
    static_km_mean, static_km_std = exits_df["km"].mean(), exits_df["km"].std() or 1.0
    km_by_exit = exits_df.set_index("exit_id")["km"]
    neighbors_by_exit: dict[int, list[int]] = {}
    for eid in exits_df["exit_id"]:
        dists = (km_by_exit - km_by_exit.loc[eid]).abs().drop(eid)
        neighbors_by_exit[eid] = dists.nsmallest(N_NEIGHBORS).index.tolist()

    static_vec_by_exit: dict[int, np.ndarray] = {}
    windows: dict[int, np.ndarray] = {}
    last_date_by_exit: dict[int, pd.Timestamp] = {}
    last_observed_by_exit: dict[int, float] = {}
    typical_log_volume: dict[int, float] = {}

    for eid, g in panel.groupby("exit_id"):
        g = g.sort_values("d").reset_index(drop=True)
        if len(g) < SEQ_LEN or g[seq_features].tail(SEQ_LEN).isna().any().any():
            continue
        windows[eid] = g[seq_features].tail(SEQ_LEN).values.astype("float64")
        last_date_by_exit[eid] = g["d"].iloc[-1]
        last_observed_by_exit[eid] = float(g["count"].iloc[-1])
        typical_log_volume[eid] = float(g["log_volume"].tail(7).mean())
        static_row = g[STATIC_FEATURES].iloc[0]
        static_vec_by_exit[eid] = np.array([
            (static_row["km"] - static_km_mean) / static_km_std,
            static_row["access_count"] / 4.0,
        ], dtype="float32")

    usable_exits = list(windows.keys())
    forecasts: list[dict] = []
    if not usable_exits:
        return forecasts
    static_t = torch.tensor(np.stack([static_vec_by_exit[e] for e in usable_exits]))
    prev_counts = dict(last_observed_by_exit)  # each exit's count on the day before the next appended row

    for h in range(1, horizon_days + 1):
        # One batched step for every exit (it used to be one forward pass per exit).
        batch = np.stack([windows[e] for e in usable_exits]).astype("float32")
        with torch.no_grad():
            out = torch.exp(model(torch.tensor((batch - seq_mean) / seq_std), static_t)).numpy()
        preds_this_day = {e: max(float(v), 0.0) for e, v in zip(usable_exits, out)}

        day_rows = [
            {
                "exit_id": int(eid),
                "forecast_date": (last_date_by_exit[eid] + pd.Timedelta(days=h)).date(),
                "horizon_day": h,
                "predicted_incidents": preds_this_day[eid],
                "last_observed_count": last_observed_by_exit[eid] if h == 1 else None,
            }
            for eid in usable_exits
        ]
        day_rows.sort(key=lambda r: r["predicted_incidents"], reverse=True)
        for rank, row in enumerate(day_rows, start=1):
            row["rank"] = rank
        forecasts.extend(day_rows)

        if h == horizon_days:
            break
        # Slide every exit's window forward one day. The appended row is day h: its count is this day's
        # prediction and its neighbour lag is the neighbours' count on day h-1 (the feature is a lag-1).
        for eid in usable_exits:
            neighbor_vals = [prev_counts[n] for n in neighbors_by_exit.get(eid, []) if n in prev_counts]
            values = {"count": preds_this_day[eid],
                      "neighbor_lag_1": float(np.mean(neighbor_vals)) if neighbor_vals else 0.0,
                      "log_volume": typical_log_volume[eid], "rain_mm": 0.0}
            new_row = np.array([[values[f] for f in seq_features]])
            windows[eid] = np.vstack([windows[eid][1:], new_row])
        prev_counts = dict(preds_this_day)

    return forecasts


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------


def ensure_schema(conn, commit: bool = True) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE SCHEMA IF NOT EXISTS gold;

            CREATE TABLE IF NOT EXISTS gold.ml_incident_spatial_coefficients (
                id SERIAL PRIMARY KEY,
                exit_id INT NOT NULL,
                exit_name TEXT NOT NULL,
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                km DOUBLE PRECISION NOT NULL,
                variable TEXT NOT NULL,
                coefficient DOUBLE PRECISION NOT NULL,
                std_error DOUBLE PRECISION,
                t_value DOUBLE PRECISION,
                significant BOOLEAN,
                trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (exit_id, variable)
            );

            CREATE TABLE IF NOT EXISTS gold.ml_incident_segment_risk (
                id SERIAL PRIMARY KEY,
                exit_id INT NOT NULL,
                exit_name TEXT NOT NULL,
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                km DOUBLE PRECISION NOT NULL,
                forecast_date DATE NOT NULL,
                predicted_incidents DOUBLE PRECISION NOT NULL,
                last_observed_count DOUBLE PRECISION,
                risk_rank INT NOT NULL,
                trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            -- One row per exit per day-ahead now (rollout_spatial_lstm),
            -- not one row per exit -- UNIQUE(exit_id) predates the multi-day
            -- grid and is dropped in favor of UNIQUE(exit_id, horizon_day).
            -- horizon_day=1 is still the real next-24h figure every earlier
            -- caller of this table read; 2-7 are the recursive rollout.
            ALTER TABLE gold.ml_incident_segment_risk
                ADD COLUMN IF NOT EXISTS horizon_day INT NOT NULL DEFAULT 1;
            ALTER TABLE gold.ml_incident_segment_risk
                DROP CONSTRAINT IF EXISTS ml_incident_segment_risk_exit_id_key;
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'ml_incident_segment_risk_exit_horizon_key'
                ) THEN
                    ALTER TABLE gold.ml_incident_segment_risk
                        ADD CONSTRAINT ml_incident_segment_risk_exit_horizon_key UNIQUE (exit_id, horizon_day);
                END IF;
            END $$;

            CREATE TABLE IF NOT EXISTS gold.ml_incident_spatial_metadata (
                id SERIAL PRIMARY KEY,
                metadata_json JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
    if commit:
        conn.commit()


def write_to_db(conn, gwr_out: dict, lstm_out: dict, metadata: dict, dry: bool = False) -> None:
    ensure_schema(conn, commit=not dry)

    with conn.cursor() as cur:
        cur.execute("DELETE FROM gold.ml_incident_spatial_coefficients")
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO gold.ml_incident_spatial_coefficients
               (exit_id, exit_name, latitude, longitude, km, variable, coefficient,
                std_error, t_value, significant) VALUES %s""",
            [
                (c["exit_id"], c["exit_name"], c["latitude"], c["longitude"], c["km"],
                 c["variable"], c["coefficient"], c["std_error"], c["t_value"], c["significant"])
                for c in gwr_out["coefficients"]
            ],
        )

        cur.execute("DELETE FROM gold.ml_incident_segment_risk")
        exits_by_id = {c["exit_id"]: c for c in gwr_out["coefficients"]}
        rows = []
        for f in lstm_out["forecasts"]:
            ref = exits_by_id.get(f["exit_id"])
            if ref is None:
                continue
            rows.append((
                f["exit_id"], ref["exit_name"], ref["latitude"], ref["longitude"], ref["km"],
                f["forecast_date"], f["predicted_incidents"], f["last_observed_count"], f["rank"], f["horizon_day"],
            ))
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO gold.ml_incident_segment_risk
               (exit_id, exit_name, latitude, longitude, km, forecast_date,
                predicted_incidents, last_observed_count, risk_rank, horizon_day) VALUES %s""",
            rows,
        )

        cur.execute("DELETE FROM gold.ml_incident_spatial_metadata")
        cur.execute("INSERT INTO gold.ml_incident_spatial_metadata (metadata_json) VALUES (%s)",
                    [json.dumps(metadata, default=str)])

    if dry:
        conn.rollback()
        print("DRY WRITE: every query ran, transaction rolled back — gold.* is unchanged")
    else:
        conn.commit()


def print_report(gwr_out: dict, lstm_out: dict) -> str:
    L = []
    L.append("=" * 80)
    L.append("  INCIDENT SPATIAL MODELS (per-exit)")
    L.append("=" * 80)
    L.append("")
    gm = gwr_out["metrics"]
    L.append("  GWR — cross-section over 20 exits (explanatory: the coefficient map)")
    L.append(f"    bandwidth (fixed, degrees) = {gwr_out['bw']:.4f}  (full fit; in-sample MAE {gm['MAE']:.3f}, "
             f"deviance {gm['Poisson_Deviance']:.3f}, n {gm['n']})")
    if gm.get("loocv_mae") is not None:
        rng = gm.get("loocv_bandwidth_range") or [float("nan")] * 2
        L.append(f"    Leave-one-exit-out ({gm['loocv_n']} folds, {gm.get('loocv_failed_folds', 0)} failed; bandwidth "
                 f"re-chosen in every fold, {rng[0]:.3f}-{rng[1]:.3f}), mean daily incidents per exit:")
        for name, v in sorted(gm["loocv_comparison"].items(), key=lambda kv: kv[1]):
            L.append(f"      {name:<42} MAE = {v:.3f}")
        lo, hi = gm["loocv_gwr_minus_best_baseline_ci"]
        L.append(f"    GWR {'beats' if gm['loocv_beats_best_baseline'] else 'does NOT beat'} the best baseline "
                 f"({gm['loocv_best_baseline']}); GWR - baseline 95% interval [{lo:+.3f}, {hi:+.3f}]")
        lo, hi = gm["loocv_gwr_minus_glm_ci"]
        L.append(f"    GWR - global Poisson GLM 95% interval [{lo:+.3f}, {hi:+.3f}] (does letting coefficients vary help?)")
    else:
        L.append("    Leave-one-exit-out MAE = n/a (every fold failed)")
    sig = [c for c in gwr_out["coefficients"] if c["variable"] != "intercept" and c["significant"]]
    L.append(f"    {len(sig)} of {len([c for c in gwr_out['coefficients'] if c['variable'] != 'intercept'])} "
             f"non-intercept (exit, variable) coefficients are locally significant (|t| > 1.96)")
    L.append("")
    m = lstm_out["metrics"]
    L.append("  Daily incidents per exit — tested as served")
    L.append(f"    {m['protocol']}")
    L.append(f"    {len(m['origins'])} origins {m['origins'][0]}..{m['origins'][-1]}; scored days {m['test_window'][0]}.."
             f"{m['test_window'][1]}; {m['n_exits']} exits")
    protocol_report(lstm_out["selection"], log=L.append)
    L.append(f"    served: {m['champion']}" + ("  (a baseline: no LSTM beat the best baseline)" if m["champion_is_baseline"] else ""))
    if m["excluded_exits"]:
        L.append(f"    not scored: {', '.join(m['excluded_exits'])} (no incident history)")
    if m.get("epochs_trained"):
        L.append(f"    final model epochs = {m['epochs_trained']} (chosen on the last {EARLY_STOP_DAYS} days before the data end)")
    L.append("")
    L.append(f"  Next-24h high-risk segments (top 5 of the {HORIZON_DAYS}-day forecast written, day 1):")
    for f in lstm_out["forecasts"]:
        if f["horizon_day"] != 1 or f["rank"] > 5:
            continue
        L.append(f"    #{f['rank']:<2} exit_id={f['exit_id']:<3} "
                 f"predicted={f['predicted_incidents']:.3f}  last_observed={f['last_observed_count']:.0f}")
    day_last = min((f for f in lstm_out["forecasts"] if f["horizon_day"] == HORIZON_DAYS), key=lambda f: f["rank"])
    L.append(f"  Day {HORIZON_DAYS} top exit: exit_id={day_last['exit_id']} predicted={day_last['predicted_incidents']:.3f}")
    L.append("=" * 80)
    return "\n".join(L)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-db", action="store_true")
    parser.add_argument("--dry-write", action="store_true")
    parser.add_argument("--dry-run", action="store_true",
                        help="train and report only; write nothing (no report file, read-only DB session)")
    # Kept so existing callers do not break; the single holdout it sized is replaced by the rolling test.
    parser.add_argument("--holdout-days", type=int, default=VALIDATION_DAYS,
                        help="ignored since 10 Nov 2026 (the rolling-origin test replaced the single holdout)")
    parser.add_argument("--refit-every", type=int, default=4,
                        help="re-fit the LSTM weights every N rolling origins (1 = every origin; default 4 = 8 weeks)")
    parser.add_argument("--no-twin", action="store_true",
                        help="test only the served LSTM, not also its no-rain twin (halves the run time)")
    args = parser.parse_args()
    if args.dry_run and (args.write_db or args.dry_write):
        sys.exit("--dry-run writes nothing; it cannot be combined with --write-db or --dry-write")
    variants = {k: v for k, v in LSTM_VARIANTS.items() if not (args.no_twin and k != "Spatial LSTM")}

    conn = get_conn(readonly=args.dry_run)
    try:
        print("Loading exit reference (nlex_exits x dim_location, km-derived)...")
        exits_df = load_exit_reference(conn)
        print(f"  {len(exits_df)} exits")

        panel = build_panel(conn, exits_df)
        print(f"  panel: {len(panel)} exit-day rows, "
              f"{panel['d'].min().date()} .. {panel['d'].max().date()}, "
              f"{int(panel['count'].sum())} total resolved incidents")

        print("\nFitting GWR...")
        gwr_out = fit_gwr(exits_df, panel)

        print("\nFitting Spatial LSTM...")
        lstm_out = fit_spatial_lstm(panel, exits_df, variants, refit_every=args.refit_every)

        report = print_report(gwr_out, lstm_out)
        print("\n" + report)
        if args.dry_run:
            print("\n--dry-run: nothing written (no report file, no database rows).")
            return
        report_path = Path(__file__).resolve().parent / "model_results_spatial.txt"
        report_path.write_text(report, encoding="utf-8")
        print(f"\nFull report written to {report_path}")

        if not args.write_db and not args.dry_write:
            print("\nTraining complete. Re-run with --write-db once you've reviewed the report above.")
            return

        champ = lstm_out["metrics"]["champion"]
        metadata = {
            "data_source": "silver.nlex_accident_events_clean + silver.nlex_breakdown_events_clean",
            "gwr": {"bandwidth": gwr_out["bw"], "metrics": gwr_out["metrics"], "variables": GWR_VARIABLES},
            "spatial_lstm": {
                "metrics": lstm_out["metrics"], "seq_len": SEQ_LEN, "n_neighbors": N_NEIGHBORS,
                "seq_features": variants.get(champ, SEQ_FEATURES), "static_features": STATIC_FEATURES,
                "horizon_days": HORIZON_DAYS,
                # Which forecast gold.ml_incident_segment_risk holds: an LSTM's, or the best baseline's when no
                # LSTM beat it in the rolling test.
                "served_model": champ,
                # Only day 1 is a direct model output; days 2-HORIZON_DAYS are
                # a recursive rollout (see rollout_spatial_lstm's own doc
                # comment) that also holds two inputs flat for the whole
                # window rather than forecasting them: log_volume at each
                # exit's own last-7-observed-day mean, rain_mm at 0. Carried
                # here so the frontend can caveat days past 1 instead of
                # showing them with day 1's own confidence.
                "rollout_assumptions": "log_volume held at each exit's own recent (7-day) mean; rain_mm assumed 0 (no rainfall forecast exists to use instead)",
            },
            "trained_at": pd.Timestamp.utcnow().isoformat(),
        }
        print("\nWriting gold.ml_incident_spatial_coefficients / ml_incident_segment_risk / ml_incident_spatial_metadata...")
        write_to_db(conn, gwr_out, lstm_out, json_safe(metadata), dry=args.dry_write and not args.write_db)
        print("Rolled back (dry write)." if (args.dry_write and not args.write_db) else "Committed.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
