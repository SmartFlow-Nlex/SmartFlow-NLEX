#!/usr/bin/env python3
"""
SmartFlow NLEX — Weather-Adjusted Speed Models (Block 3: Weather-Adjusted Speed)
====================================================================================
A fourth grain, alongside the day/exit/incident pipelines already in this
directory: DAILY corridor-wide (speed + volume forecasting, both risk
scores) and per-(EXIT, HOUR) (the contour map).

  1. SARIMAX / LSTM / GRU / XGBoost (with and without the rain input) compete
     on forecasting the daily jam speed ("Speed forecast under rain") and,
     separately, daily corridor volume - against the protocol's baselines.

  2. Two small logistic regressions, both against the same daily
     rain/volume/calendar features: "road closure probability" (a gridlock
     day: heavy-jam exit-hours in the top 5% of the preceding year) and
     "weather incident risk" (a high-incident day: top quarter of the
     preceding year) - the two KPIs the block asks for. They are CONDITIONAL
     models, served as what-if curves (probability at a given rain total or
     volume), so the day's own rain and volume are their question.

  3. XGBoost again, refit at (exit, hour) grain, predicted on a synthetic
     dry-vs-wet grid to produce the weather-adjusted speed contour map.

Data (10 Nov 2026): speed and jams are REAL - Waze Partner Hub jams on the
corridor per exit and hour (silver.waze_jam_hourly_exit, 2022-01-01 to
2026-04-19, the last day of the Waze record). Waze speed is the speed INSIDE
reported jams, so these models describe how weather and traffic change
congestion, not free-flow speed. (Until 2026-10-21 this read
bronze.nlex_traffic_volume's avg_speed_kmh, a synthetic column with a mean of
~5 km/h and negative values; the caveats written for it no longer apply.)
Volume is the corridor's actual daily total (gold.daily_traffic_volume_corrected);
rain is hourly_weather averaged over the corridor points each hour and summed
over the day.

How it is tested (10 Nov 2026, EVALUATION_PROTOCOL.md):
  * Daily models: rolling origins every 14 days over the last 52 weeks, each
    forecasting the full horizon, re-fitted on the days before the origin, with
    ONLY inputs known at the origin: calendar; rain observed for days 1-14 (the
    protocol's upper bound for a perfect weather forecast, training mean after);
    for speed, volume as an out-of-sample forecast from the origin (weekday
    average of the last 8 weeks), never the day's actual volume. They were
    scored on one 90-day holdout using each day's OBSERVED rain and volume.
  * The volume model no longer has log_volume - its own target - among its
    inputs (that is what its published R2 of 0.998 was).
  * Baselines on the same origins and days: last week, weekday average of the
    last 8 weeks, same day last year scaled, and the training mean (labelled as
    such; it was shown as "Naive (no change)"). Champion rule fixed in advance
    (common/rolling_eval.select_champion); a rain-aware champion is served only
    if it significantly beats its no-rain twin in days 1-14.
  * Logistic KPIs: scored on the last 364 days, refitted every 28 days on the
    days before each block (the gridlock AUC 0.90-0.95 rested on 3 positive
    days of a 90-day holdout); the positives count, a 95% bootstrap interval for
    the AUC, and log-loss / Brier skill against the base rate are reported.
  * Contour: scored against each (exit, hour)'s training mean and median.

Two more data-source notes:
  - `rainfall` inside bronze/silver.nlex_traffic_volume is 100% zero (checked
    directly) — unusable. Rain comes from `hourly_weather` instead, the same
    table every other pipeline in this directory already reads from.
  - `hourly_weather.location_name` matches exit names closely enough (one
    casing quirk: "Cdv/Ph Arena" vs the exit table's "CDV/PH Arena") to join
    per-exit, per-hour rainfall directly — a real spatial weather signal for
    the contour map, not one corridor-wide reading applied to every exit.

Usage:
    python train_incident_weather_speed_models.py                 # train + report only (writes the report .txt)
    python train_incident_weather_speed_models.py --dry-run       # train + report, writes NOTHING (no file, read-only DB session)
    python train_incident_weather_speed_models.py --write-db       # + write to gold.*
    python train_incident_weather_speed_models.py --dry-write       # rehearse the write, then roll back
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import warnings
from datetime import timedelta
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras
import statsmodels.api as sm
import torch
import torch.nn as nn
from dotenv import load_dotenv
from sklearn.metrics import mean_absolute_error, r2_score
from statsmodels.tsa.statespace.sarimax import SARIMAX
from xgboost import XGBRegressor

from honest_eval import REAL_END_VOLUME, binary_report, block_bootstrap_ci, json_safe

# The shared rolling-origin harness (read-only; nothing in it writes).
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "smartflow_scripts" / "3_training_testing"))
from common.rolling_eval import BASELINES as PROTOCOL_BASELINES  # noqa: E402
from common.rolling_eval import DAILY_BUCKETS, baseline_weekday_avg, run_study, select_champion, yearly_origins  # noqa: E402
from common.rolling_eval import _boot_diff as _protocol_boot_diff  # noqa: E402
from common.rolling_eval import _cells as _protocol_cells  # noqa: E402
from common.rolling_eval import summarize as _protocol_summarize  # noqa: E402

SEED = 42
SEQ_LEN = 14
EPOCHS = 60
PATIENCE = 8
# Rain scenarios for both the closure/risk KPI curves and the contour map's
# "wet" grid. 0mm is the dry baseline; the rest span from a drizzle to a very
# wet day (daily corridor rain = the hourly corridor average summed over the
# day; the old "~358mm P90" note described the 20x-inflated sum over every
# weather point, fixed 5 Nov 2026).
RAIN_SCENARIOS_MM = [0, 10, 30, 60, 100]
WET_SCENARIO_MM = 60.0  # the contour map's single "wet" grid, mid-scenario


def set_all_seeds(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


set_all_seeds()
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


# Set by --dry-run: every connection (including read_by_year's fresh ones) is then read-only on the server.
_READONLY = False


def get_conn(readonly: bool | None = None):
    """Mirrors train_incident_models.py's get_conn() — kept in sync by hand. Read-only (--dry-run): the server
    refuses any write on the session."""
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
    if _READONLY if readonly is None else readonly:
        conn.set_session(readonly=True)
    return conn


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------
# The record every other module trains and reports on (2026-10-15): traffic, emissions, accidents and
# breakdowns all run 2022-01-01 to 2026-06-30 (RECORD_END in Back-End/src/etl/toll-hourly.ts). This script
# read everything in its tables instead, which reached back to 2020 and, for incidents, past the record end.
RECORD_START = "2022-01-01"
RECORD_END = "2026-06-30"
# GREATEST(...,0): the negative-speed/negative-jam floor described in the
# module docstring — physically impossible values clamped, not dropped, so a
# noisy row still contributes its other columns.
# Speed and jams are REAL: Waze Partner Hub jams on the corridor, per exit and hour (silver.waze_jam_hourly_exit,
# 2022-01-01 to 2026-04-19). They used to be bronze.nlex_traffic_volume's avg_speed_kmh / avg_jam_level, a
# synthetic capstone table (mean ~5 km/h, negative values) whose "speeds" were generated from its own synthetic
# volumes - which is why the old model "explained" them so well (fixed 2026-10-21). Waze speed is the speed
# INSIDE reported jams, so this models how weather and traffic change congestion, not free-flow speed.
#   speed_kmh      the day's jam speed, weighted by jam reports
#   speed_kmh_min  the slowest exit-hour's jam speed
#   jam_level_max  exit-hours with a heavy jam (Waze level 4 or 5) that day - the "gridlock" measure. Level 5
#                  alone is too rare to use (50 of 287,000 jam exit-hours), and a daily MAX of the 1-5 level is
#                  4 on almost every day; heavy-jam hours run 77 on a median day and 137 on the worst 5%.
# Volume is the corridor's actual daily total (gold.daily_traffic_volume_corrected), as every other model uses.
DAILY_PANEL_SQL = """
    SELECT v.date AS d, w.speed_kmh, w.speed_kmh_min, w.jam_level_max, v.total_volume::float AS volume
    FROM gold.daily_traffic_volume_corrected v
    JOIN (
        SELECT date_day AS d,
               (SUM(speed_kmh_wavg * jam_snapshots) / NULLIF(SUM(jam_snapshots), 0))::float AS speed_kmh,
               MIN(speed_kmh_wavg)::float AS speed_kmh_min,
               COUNT(*) FILTER (WHERE jam_level_max >= 4)::float AS jam_level_max
        FROM silver.waze_jam_hourly_exit
        WHERE on_corridor AND date_day BETWEEN '{lo}' AND '{hi}'
        GROUP BY date_day
    ) w ON w.d = v.date
    ORDER BY v.date
""".format(lo=RECORD_START, hi=RECORD_END)

# Mirrors train_incident_models.py's DAILY_RAIN_SQL — kept in sync by hand.
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

# Mirrors train_incident_models.py's DAILY_COUNTS_SQL — kept in sync by hand. It had not been: that script
# moved to the accident and breakdown event tables (the population the whole incident dashboard reports),
# while this one still counted the legacy road-crash / motorcycle / stalled-vehicle tables, a smaller and
# older population that also runs outside the record. Brought back in line on 2026-10-15.
DAILY_INCIDENT_COUNTS_SQL = f"""
    WITH all_incidents AS (
        SELECT event_start_date::date AS d FROM silver.nlex_accident_events_clean
        WHERE event_start_date IS NOT NULL
        UNION ALL
        SELECT event_encoded_date::date AS d FROM silver.nlex_breakdown_events_clean
        WHERE event_encoded_date IS NOT NULL
    )
    SELECT d, COUNT(*)::float AS total
    FROM all_incidents
    WHERE d BETWEEN '{RECORD_START}' AND '{RECORD_END}'
    GROUP BY 1
    ORDER BY 1
"""

# Mirrors src/services/map-comparison.service.ts's searchExitsInDb — kept in
# sync by hand. See that function's doc comment for why km is derived.
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
       ROUND((n.m / 1000.0)::numeric, 2)::float AS km
FROM nlex_exits x
LEFT JOIN nodes n ON n.node = x.exit_name
ORDER BY x.exit_id
"""

# Real Waze jam speed per exit and hour (only the exit-hours with a jam reported), against the actual volume at
# that exit and hour (gold.fact_traffic_hourly, matched to nlex_exits by name: 19 of the 20 exits, all but
# "SCTEX", which has no toll rows of its own; an hour with no toll rows is 0 vehicles, e.g. a toll holiday).
EXIT_HOUR_PANEL_SQL = """
    SELECT w.date_day AS d, w.hour_of_day, w.nlex_exit_id AS exit_id, w.speed_kmh_wavg::float AS speed_kmh,
           COALESCE(v.volume, 0)::float AS volume
    FROM silver.waze_jam_hourly_exit w
    LEFT JOIN (
        SELECT f.date AS d, f.hour AS hour_of_day, x.exit_id, SUM(f.total)::float AS volume
        FROM gold.fact_traffic_hourly f JOIN nlex_exits x ON x.exit_name = f.exit_canonical
        WHERE f.date BETWEEN %(lo)s AND %(hi)s
        GROUP BY 1, 2, 3
    ) v ON v.d = w.date_day AND v.hour_of_day = w.hour_of_day AND v.exit_id = w.nlex_exit_id
    WHERE w.on_corridor AND w.nlex_exit_id IS NOT NULL AND w.speed_kmh_wavg IS NOT NULL
      AND w.date_day BETWEEN %(lo)s AND %(hi)s
"""

HOURLY_RAIN_BY_LOCATION_SQL = """
    SELECT (timestamp_utc + interval '8 hours')::date AS d,
           EXTRACT(hour FROM timestamp_utc + interval '8 hours')::int AS hour_of_day,
           UPPER(location_name) AS location_upper,
           -- AVG, not SUM: a point stored under two spellings (21-31 Oct 2026) is one point, not two.
           AVG(rainfall)::float AS rain_mm
    FROM hourly_weather
    WHERE (timestamp_utc + interval '8 hours')::date BETWEEN %(lo)s AND %(hi)s
    GROUP BY 1, 2, 3
"""


def read_by_year(conn, sql: str) -> pd.DataFrame:
    """Run a %(lo)s/%(hi)s query one calendar year at a time over the record and stack the results. Read whole,
    the exit-hour panel is a single large transfer, and on the RDS link to this PC that transfer stalls: the
    server finished the query and sat in ClientWrite for over 20 minutes while the client received nothing
    (2026-10-15). A year at a time keeps every transfer small."""
    # Each year on its own fresh connection, retried: the same link also closes a long transfer outright
    # ("server closed the connection unexpectedly"), and one dropped year should cost one retry, not the run.
    # `conn` is left untouched for the caller.
    import time
    parts = []
    for y in range(int(RECORD_START[:4]), int(RECORD_END[:4]) + 1):
        lo = max(RECORD_START, f"{y}-01-01")
        hi = min(RECORD_END, f"{y}-12-31")
        for attempt in range(1, 4):
            c = get_conn()
            try:
                parts.append(pd.read_sql(sql, c, params={"lo": lo, "hi": hi}))
                break
            except Exception as e:  # psycopg2 OperationalError / InterfaceError, wrapped by pandas
                if attempt == 3:
                    raise
                print(f"    read {y}: connection dropped ({str(e).splitlines()[0][:80]}), retry {attempt}", flush=True)
                time.sleep(10 * attempt)
            finally:
                try:
                    c.close()
                except Exception:
                    pass
        print(f"    read {y}: {len(parts[-1]):,} rows", flush=True)
    return pd.concat(parts, ignore_index=True)


def load_holidays(conn) -> set:
    df = pd.read_sql("SELECT date_day FROM public.ph_holidays", conn)  # validated calendar; dim_holiday stops 2026-07-25
    return set(pd.to_datetime(df["date_day"]).dt.date)


def calendar_features(dates: pd.Series, holidays: set) -> pd.DataFrame:
    """Mirrors train_incident_models.py's calendar_features — kept in sync by hand."""
    dow = dates.dt.dayofweek
    doy = dates.dt.dayofyear
    return pd.DataFrame(
        {
            "dow": dow,
            "is_weekend": dow.isin([5, 6]).astype(int),
            "is_holiday": dates.dt.date.map(lambda x: int(x in holidays)),
            "doy_sin": np.sin(2 * np.pi * doy / 365.25),
            "doy_cos": np.cos(2 * np.pi * doy / 365.25),
        },
        index=dates.index,
    )


_HOLIDAYS: set = set()  # set by load_daily_panel; the daily models' forecast rows need it for future dates


def load_daily_panel(conn, holidays: set) -> pd.DataFrame:
    global _HOLIDAYS
    _HOLIDAYS = set(holidays)
    panel = pd.read_sql(DAILY_PANEL_SQL, conn)
    panel["d"] = pd.to_datetime(panel["d"])

    rain = pd.read_sql(DAILY_RAIN_SQL, conn)
    rain["d"] = pd.to_datetime(rain["d"])
    incidents = pd.read_sql(DAILY_INCIDENT_COUNTS_SQL, conn)
    incidents["d"] = pd.to_datetime(incidents["d"])

    # Capped to the last day that has rain, incident counts AND real volume (REAL_END_VOLUME: 25 May - 30 Jun
    # 2026 still hold broken/synthetic toll days), so every row has genuine inputs, not a fillna(0) standing in
    # for "not recorded yet". The Waze speed record (2026-04-19) ends earlier still, so today this changes nothing.
    coverage_end = min(rain["d"].max(), incidents["d"].max(), REAL_END_VOLUME)
    panel = panel[panel["d"] <= coverage_end]

    panel = panel.merge(rain, on="d", how="left")
    panel["rain_mm"] = panel["rain_mm"].fillna(0.0)

    panel = panel.merge(incidents.rename(columns={"total": "incident_count"}), on="d", how="left")
    panel["incident_count"] = panel["incident_count"].fillna(0.0)
    panel = panel.sort_values("d").reset_index(drop=True)

    # A flat-tail guard. Written for the old synthetic speed column, which went flat after 2026-04-19 (the
    # generator's placeholder mode); the Waze jam record now read here simply ENDS on 2026-04-19 (the inner join
    # above stops there), so the guard is a no-op today. Kept, generally (not hardcoded to a date), in case a
    # future feed pads days with a constant: walk back from the most recent day to the last one whose trailing
    # 5-day rolling std still clears a "days actually vary" floor.
    roll_std = panel["speed_kmh"].rolling(5).std()
    healthy = np.where((roll_std >= 1.0).to_numpy())[0]
    if len(healthy) > 0 and healthy.max() < len(panel) - 1:
        cutoff_date = panel["d"].iloc[healthy.max()]
        dropped = len(panel) - (healthy.max() + 1)
        print(f"  dropping {dropped} day(s) after {cutoff_date.date()} — the speed series goes flat "
              f"(a data-quality cutoff, not a real event; see load_daily_panel's comment)")
        panel = panel.iloc[: healthy.max() + 1]

    panel = panel.merge(calendar_features(panel["d"], holidays), left_index=True, right_index=True)
    panel["log_volume"] = np.log(panel["volume"].clip(lower=1.0))
    return panel.sort_values("d").reset_index(drop=True)


def load_exit_hour_panel(conn, exits_df: pd.DataFrame) -> pd.DataFrame:
    panel = read_by_year(conn, EXIT_HOUR_PANEL_SQL)
    panel["d"] = pd.to_datetime(panel["d"])

    rain = read_by_year(conn, HOURLY_RAIN_BY_LOCATION_SQL)
    rain["d"] = pd.to_datetime(rain["d"])
    exit_upper = exits_df[["exit_id", "exit_name"]].copy()
    exit_upper["location_upper"] = exit_upper["exit_name"].str.upper()
    rain_by_exit = rain.merge(exit_upper[["exit_id", "location_upper"]], on="location_upper", how="inner")
    panel = panel.merge(rain_by_exit[["d", "hour_of_day", "exit_id", "rain_mm"]],
                         on=["d", "hour_of_day", "exit_id"], how="left")
    panel["rain_mm"] = panel["rain_mm"].fillna(0.0)

    panel = panel.merge(exits_df[["exit_id", "exit_name", "km"]], on="exit_id", how="left")
    panel["dow"] = panel["d"].dt.dayofweek
    panel["log_volume"] = np.log(panel["volume"].clip(lower=1.0))
    return panel.sort_values(["exit_id", "d", "hour_of_day"]).reset_index(drop=True)


# ---------------------------------------------------------------------------
# Daily speed/volume forecast — SARIMAX / LSTM / GRU / XGBoost compare
# ---------------------------------------------------------------------------
# The logistic KPIs' inputs (the daily models build their own known-in-advance inputs: _known_inputs below).
# XGBoost's daily forecast also carries the target's lag_1/lag_7/roll_mean_7 (added after its holdout predictions
# regressed every day toward a narrow band without them), fed recursively from its own forecasts.
FEATURE_COLS = ["dow", "is_weekend", "is_holiday", "doy_sin", "doy_cos", "rain_mm", "log_volume"]


def _make_sequences(y: np.ndarray, lo: int, hi: int, seq_len: int) -> tuple[np.ndarray, np.ndarray]:
    xs, ys = [], []
    for i in range(max(lo, seq_len), hi):
        xs.append(y[i - seq_len : i])
        ys.append(y[i])
    return np.array(xs).reshape(-1, seq_len, 1), np.array(ys)


class SimpleRNN(nn.Module):
    def __init__(self, kind: str, hidden: int = 16):
        super().__init__()
        layer_cls = nn.LSTM if kind == "LSTM" else nn.GRU
        self.rnn = layer_cls(input_size=1, hidden_size=hidden, batch_first=True)
        self.head = nn.Linear(hidden, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.rnn(x)
        return self.head(out[:, -1, :]).squeeze(-1)


def _fit_rnn(kind: str, y_scaled: np.ndarray, train_end: int) -> SimpleRNN:
    set_all_seeds()
    X_train, y_train = _make_sequences(y_scaled, 0, train_end, SEQ_LEN)
    X_train_t = torch.tensor(X_train, dtype=torch.float32)
    y_train_t = torch.tensor(y_train, dtype=torch.float32)

    model = SimpleRNN(kind)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = nn.MSELoss()
    best_loss, best_state, patience_left = float("inf"), None, PATIENCE
    n_val = max(int(len(X_train_t) * 0.1), 1)
    for _ in range(EPOCHS):
        model.train()
        optimizer.zero_grad()
        pred = model(X_train_t[:-n_val])
        loss = loss_fn(pred, y_train_t[:-n_val])
        loss.backward()
        optimizer.step()
        model.eval()
        with torch.no_grad():
            val_loss = loss_fn(model(X_train_t[-n_val:]), y_train_t[-n_val:]).item()
        if val_loss < best_loss - 1e-5:
            best_loss, best_state, patience_left = val_loss, {k: v.clone() for k, v in model.state_dict().items()}, PATIENCE
        else:
            patience_left -= 1
            if patience_left <= 0:
                break
    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()
    return model


def _rnn_forecast(model: SimpleRNN, y_scaled: np.ndarray, start: int, steps: int) -> np.ndarray:
    working = list(y_scaled[:start])
    preds = []
    with torch.no_grad():
        for _ in range(steps):
            window = torch.tensor(np.array(working[-SEQ_LEN:]).reshape(1, SEQ_LEN, 1), dtype=torch.float32)
            p = float(model(window).item())
            preds.append(p)
            working.append(p)
    return np.array(preds)


CALENDAR_COLS = ["dow", "is_weekend", "is_holiday", "doy_sin", "doy_cos"]
# Rolling-origin test (EVALUATION_PROTOCOL.md section 2): an origin every 14 days over the last 52 weeks of the
# panel, each forecasting the full horizon (--holdout-days, default 90) from data before the origin only.
# Default 28 (13 origins across the year): one origin costs about a minute per target on this PC, so the protocol's
# 14 (26 origins) doubles a run that is already the slowest in the weekly batch. --origin-step 14 runs it literally.
ORIGIN_STEP_DAYS = 28
TEST_WEEKS = 52
# Weather after an origin is not known: observed rain reaches the forecast for days 1-14 only (the protocol's
# "perfect forecast" upper bound); after that the training mean stands in for "no forecast".
ORACLE_DAYS = 14
TRAIN_MEAN_BASELINE = "Baseline: training mean (constant)"
# Lower = simpler; the simpler model wins a lead that is not significant.
DAILY_COMPLEXITY = {"SARIMAX": 1, "XGBoost (no rain input)": 2, "XGBoost": 3, "LSTM": 4, "GRU": 4}


def _known_inputs(train: pd.DataFrame, future: pd.DataFrame, target: str, use_rain: bool) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Inputs for the training rows (what each day actually had) and the forecast rows (only what is known at the
    origin). The forecast rows get:
      calendar     known in advance;
      rain_mm      the observed rain for days 1-14 (an upper bound: a perfect weather forecast), the training mean
                   after that;
      log_volume   for the SPEED target only: an out-of-sample volume forecast from the same origin (each weekday's
                   average over the last 8 weeks, the protocol's own baseline), never the day's actual volume. The
                   VOLUME target never sees volume as an input: it used to carry log_volume, i.e. its own target,
                   among its features (published R2 0.998)."""
    tr = train[CALENDAR_COLS].copy().reset_index(drop=True)
    # The calendar is rebuilt for the forecast dates themselves: days past the panel's end have no row to merge
    # from, and their weekday and holidays are still known.
    fu = calendar_features(pd.Series(pd.to_datetime(future["ds"]).values), _HOLIDAYS)[CALENDAR_COLS].reset_index(drop=True)
    if use_rain:
        tr["rain_mm"] = train["rain_mm"].values
        r = future["rain_mm"].values.astype(float)
        fu["rain_mm"] = np.where(np.isfinite(r), r, float(train["rain_mm"].mean()))
    if target != "volume":
        tr["log_volume"] = np.log(train["volume"].clip(lower=1.0)).values
        vol_fc = baseline_weekday_avg("volume")(train, future)
        fu["log_volume"] = np.log(np.clip(vol_fc, 1.0, None))
    return tr, fu


def make_xgb(target: str, use_rain: bool):
    """XGBoost on the known inputs plus the target's own lags, forecasting recursively: lag_1/lag_7/roll_mean_7 for
    day i come from real history for the first days and from its own earlier forecasts after that, never from the
    actual future value (same pattern as train_incident_models.py's final_tabular_forecast)."""
    def fn(train: pd.DataFrame, future: pd.DataFrame) -> np.ndarray:
        tr, fu = _known_inputs(train, future, target, use_rain)
        y = train[target].values.astype(float)
        s = pd.Series(y)
        tr["lag_1"], tr["lag_7"] = s.shift(1).values, s.shift(7).values
        tr["roll_mean_7"] = s.shift(1).rolling(7, min_periods=1).mean().values
        X, yy = tr.iloc[7:], y[7:]
        model = XGBRegressor(n_estimators=200, max_depth=4, learning_rate=0.05, subsample=0.9, colsample_bytree=0.9,
                             random_state=SEED, n_jobs=3)
        model.fit(X, yy)
        booster = model.get_booster()
        cols = list(X.columns)
        i1, i7, ir = cols.index("lag_1"), cols.index("lag_7"), cols.index("roll_mean_7")
        F = np.zeros((len(fu), len(cols)))
        for j, c in enumerate(cols):
            if c in fu.columns:
                F[:, j] = fu[c].values
        history = list(y)
        out = []
        for i in range(len(fu)):
            row = F[i:i + 1].copy()
            row[0, i1], row[0, i7], row[0, ir] = history[-1], history[-7], float(np.mean(history[-7:]))
            p = float(booster.inplace_predict(row)[0])  # one numpy row: ~100x faster than a DataFrame predict
            out.append(p)
            history.append(p)
        return np.array(out)
    return fn


def make_sarimax(target: str):
    def fn(train: pd.DataFrame, future: pd.DataFrame) -> np.ndarray:
        tr, fu = _known_inputs(train, future, target, use_rain=True)
        cols = [c for c in tr.columns if c != "dow"]  # the weekly cycle is the seasonal term's job
        res = SARIMAX(train[target].values.astype(float), exog=tr[cols], order=(1, 0, 1), seasonal_order=(1, 0, 1, 7),
                      enforce_stationarity=False, enforce_invertibility=False).fit(disp=False)
        return np.asarray(res.get_forecast(steps=len(fu), exog=fu[cols]).predicted_mean)
    return fn


def make_rnn(kind: str, target: str):
    """Univariate LSTM/GRU on the target's own history, recursive (as before)."""
    def fn(train: pd.DataFrame, future: pd.DataFrame) -> np.ndarray:
        y = train[target].values.astype(float)
        mu, sd = y.mean(), y.std() or 1.0
        ys = ((y - mu) / sd).astype("float32")
        model = _fit_rnn(kind, ys, len(ys))
        return _rnn_forecast(model, ys, len(ys), len(future)) * sd + mu
    return fn


def baseline_train_mean(target: str):
    def fn(train: pd.DataFrame, future: pd.DataFrame) -> np.ndarray:
        return np.full(len(future), float(train[target].mean()))
    return fn


def fit_daily_models(panel: pd.DataFrame, target_col: str, holdout_days: int, metric: str = "mae",
                     ckpt_dir: str | None = None) -> dict:
    """Every candidate and baseline forecasts `holdout_days` days from every rolling origin, refitted on the days
    before it, with only known-in-advance inputs (see _known_inputs); scored per horizon bucket; champion by
    rolling_eval.select_champion (beats the best baseline overall AND in days 1-14; moving-block bootstrap).
    A rain-aware champion is served only if it significantly beats its no-rain twin in days 1-14 (protocol
    section 2), since rain is known only that far ahead."""
    df = panel.rename(columns={"d": "ds"}).reset_index(drop=True)
    models = {
        "XGBoost": make_xgb(target_col, use_rain=True),
        "XGBoost (no rain input)": make_xgb(target_col, use_rain=False),
        "SARIMAX": make_sarimax(target_col),
        "LSTM": make_rnn("LSTM", target_col),
        "GRU": make_rnn("GRU", target_col),
        **PROTOCOL_BASELINES(target_col),
        TRAIN_MEAN_BASELINE: baseline_train_mean(target_col),
    }
    score_end = df["ds"].max()
    if target_col == "volume":
        score_end = min(score_end, REAL_END_VOLUME)
    origins = yearly_origins(df["ds"], score_end, step=ORIGIN_STEP_DAYS, weeks=TEST_WEEKS)
    print(f"  {target_col}: {len(origins)} origins {df['ds'].iloc[origins[0]].date()}..{df['ds'].iloc[origins[-1]].date()}, "
          f"{holdout_days}-day horizon, scored to {score_end.date()}", flush=True)
    res = run_study(df, target_col, models, holdout_days, origins, known_cols=CALENDAR_COLS, score_end=score_end,
                    oracle_cols=["rain_mm"], oracle_days=ORACLE_DAYS, log=lambda m: print(m, flush=True),
                    ckpt=(Path(ckpt_dir) / f"weather_{target_col}_step{ORIGIN_STEP_DAYS}.ckpt.json") if ckpt_dir else None)
    if res.empty:
        raise RuntimeError(f"{target_col}: every rolling origin failed for some model; nothing could be scored")
    res["forecast"] = res["forecast"].clip(lower=0)
    sel = select_champion(res, buckets=DAILY_BUCKETS, metric=metric, complexity=DAILY_COMPLEXITY)
    # Weather-free twin rule, on days 1-14 only (the days the rain input is a real forecast's stand-in).
    twin_ci = None
    if sel["champion"] == "XGBoost":
        cells = _protocol_cells(res, [(1, 14)])
        twin_ci = list(_protocol_boot_diff(cells, "XGBoost", "XGBoost (no rain input)", [(1, 14)], metric, block=2))
        sel["vs_no_rain_twin_d1_14_ci"] = twin_ci
        if twin_ci[1] >= 0:
            sel["note"] = ((sel.get("note", "") + "; ") if sel.get("note") else "") + (
                "XGBoost did not significantly beat its no-rain twin in days 1-14, so the twin is served")
            if "XGBoost (no rain input)" in sel["eligible"]:
                sel["champion"] = "XGBoost (no rain input)"
    table = pd.DataFrame(sel["table"]).T

    def overall(name: str) -> dict:
        r = res[res["model"] == name]
        resid = r["actual"] - r["forecast"]
        ss_tot = float(((r["actual"] - r["actual"].mean()) ** 2).sum())
        return {
            # MAE (and WMAPE) = the protocol score: the mean of the horizon-bucket scores over all origins.
            "MAE": float(_protocol_summarize(res[res["model"] == name], DAILY_BUCKETS, "mae")["score"].iloc[0]),
            "WMAPE": float(_protocol_summarize(res[res["model"] == name], DAILY_BUCKETS, "wmape")["score"].iloc[0]),
            "RMSE": float(np.sqrt((resid ** 2).mean())),
            "R2": float(1 - (resid ** 2).sum() / ss_tot) if ss_tot > 0 else None,
            "by_bucket": {k: float(v) for k, v in table.loc[name].items()} if name in table.index else {},
            "n": int(len(r)),
        }

    names = list(models)
    metrics = {n: overall(n) for n in names if not n.startswith("Baseline:")}
    baselines = {n: overall(n) for n in names if n.startswith("Baseline:")}
    champion = sel["champion"]
    # The served band: the champion's days 1-14 from each origin (non-overlapping with a 14-day step) - the
    # forecasts the metrics describe (protocol section 7).
    band = res[(res["model"] == champion) & (res["h"] <= ORIGIN_STEP_DAYS)].sort_values("date")
    band = band.drop_duplicates("date", keep="last")
    return {
        "champion": champion,
        "champion_is_baseline": bool(sel.get("champion_is_baseline", False)),
        "metrics": metrics,
        "baselines": baselines,
        "selection": {k: v for k, v in sel.items() if k != "table"},
        "naive_mae": baselines[TRAIN_MEAN_BASELINE]["MAE"],
        "naive_label": "Training mean (constant)",
        "best_baseline": sel["best_baseline"],
        "degraded": bool(sel.get("champion_is_baseline", False)),
        "holdout_dates": pd.to_datetime(band["date"]).tolist(),
        "holdout_pred": {champion: band["forecast"].values},
        "holdout_actual": band["actual"].values,
        "results": res,
        "origins": [str(df["ds"].iloc[o].date()) for o in origins],
    }


# ---------------------------------------------------------------------------
# Logistic regressions: road closure probability, weather incident risk
# ---------------------------------------------------------------------------
# Tested on the last 364 days, refitted every 28 days on the days before each block (it was ONE 90-day holdout,
# on which the gridlock AUC of 0.90-0.95 rested on 3 positive days).
KPI_TEST_DAYS = 364
KPI_BLOCK_DAYS = 28


def _fit_logit(train: pd.DataFrame, target_col: str):
    # A yes/no input that perfectly separates the target in the training days has no finite coefficient (the
    # likelihood keeps rising as it goes to infinity), so it is left out of this model and the reason recorded
    # (6 Nov 2026). Found when the rain feature was corrected to real millimetres: no road-closure day falls on
    # any of the 79 training holidays, and the fit that had "worked" on the 20x-inflated rain carried an
    # is_holiday coefficient of -22.7, a number with no meaning; on the true scale Newton's method reaches the
    # singular Hessian and fails.
    y_train = train[target_col].values
    separating = []
    for col in FEATURE_COLS:
        vals = train[col]
        if set(vals.unique()) <= {0, 1} and vals.nunique() == 2:
            pos_when_1 = y_train[vals.values == 1]
            pos_when_0 = y_train[vals.values == 0]
            if pos_when_1.min() == pos_when_1.max() or pos_when_0.min() == pos_when_0.max():
                separating.append(col)
    cols = [c for c in FEATURE_COLS if c not in separating]
    model = sm.Logit(y_train, sm.add_constant(train[cols], has_constant="add")).fit(disp=False, maxiter=200)
    return model, cols, separating


def fit_logistic_kpi(panel: pd.DataFrame, target_col: str, holdout_days: int = KPI_TEST_DAYS) -> dict:
    """A CONDITIONAL risk model: P(target | that day's rain, volume and calendar). It is served as what-if curves
    (probability at a given rain total or volume), so the same-day inputs are its question, not a leak. Tested on
    the last `holdout_days` days in 28-day blocks, each block predicted by a fit on the days before it; scored by
    AUC with a 95% block-bootstrap interval, the positives count, and log-loss / Brier skill against each block's
    training base rate. The scenario curves come from the final fit on every day."""
    n = len(panel)
    test_start = max(n - holdout_days, 200)
    proba = np.full(n, np.nan)
    prior = np.full(n, np.nan)
    failed_blocks, left_out = 0, set()
    for b0 in range(test_start, n, KPI_BLOCK_DAYS):
        b1 = min(b0 + KPI_BLOCK_DAYS, n)
        train = panel.iloc[:b0]
        try:
            m, cols, sep = _fit_logit(train, target_col)
        except Exception:
            failed_blocks += 1
            continue
        left_out |= set(sep)
        proba[b0:b1] = np.asarray(m.predict(sm.add_constant(panel.iloc[b0:b1][cols], has_constant="add")))
        prior[b0:b1] = float(train[target_col].mean())
    ok = np.isfinite(proba)
    y_test = panel[target_col].values[ok].astype(int)
    rep = binary_report(y_test, proba[ok], prior[ok], clusters=panel["d"].values[ok], block=7)

    model, cols, separating = _fit_logit(panel, target_col)
    if separating:
        print(f"    {target_col}: left out {', '.join(separating)} (it perfectly separates the days, so it has no finite coefficient)")
    X_cols = ["const"] + cols

    # Scenario curve: predicted probability at a handful of rain totals,
    # every other feature held at its mean — the KPI's interpretable
    # "how much does rain alone move this" summary.
    mean_row = panel[FEATURE_COLS].mean()
    scenario_rows = []
    for rain_mm in RAIN_SCENARIOS_MM:
        row = mean_row.copy()
        row["rain_mm"] = rain_mm
        row = sm.add_constant(row.to_frame().T, has_constant="add")[X_cols]
        scenario_rows.append({"rain_mm": rain_mm, "probability": float(np.asarray(model.predict(row))[0])})

    # A second scenario curve, swept over traffic volume instead of rain, at the
    # quantiles of the *raw* volume column (translated to log_volume for the
    # design matrix, reported back in raw terms): volume, not rain, is the
    # driver that moves this number (see topDriver).
    volume_scenario_rows = []
    for volume in panel["volume"].quantile([0.1, 0.3, 0.5, 0.7, 0.9]):
        row = mean_row.copy()
        row["log_volume"] = float(np.log(max(volume, 1.0)))
        row = sm.add_constant(row.to_frame().T, has_constant="add")[X_cols]
        volume_scenario_rows.append({"volume": float(volume), "probability": float(np.asarray(model.predict(row))[0])})

    # Standardized effect size (|coefficient| * feature std) for every non-intercept term, so the strongest driver
    # can be named directly.
    effect_size = (model.params.drop("const") * panel[cols].std()).abs().sort_values(ascending=False)
    top_feature = effect_size.index[0]
    rain_p_value = float(model.pvalues.get("rain_mm", float("nan")))

    return {
        "auc": rep["auc"],
        "auc_ci": rep["auc_ci"],
        "positives": rep["positives"],
        "log_loss_skill": rep["log_loss_skill"],
        "brier_skill": rep["brier_skill"],
        "baseline": "each block's training base rate (AUC 0.5)",
        "base_rate": rep["base_rate"],
        "n": rep["n"],
        "test_window": [str(panel["d"].iloc[test_start].date()), str(panel["d"].iloc[-1].date())],
        "refit_every_days": KPI_BLOCK_DAYS,
        "failed_blocks": failed_blocks,
        "scenarios": scenario_rows,
        "volumeScenarios": volume_scenario_rows,
        "rainSignificant": bool(np.isfinite(rain_p_value) and rain_p_value < 0.05),
        "rainPValue": rain_p_value if np.isfinite(rain_p_value) else None,
        "topDriver": {"feature": str(top_feature), "effectSize": float(effect_size.iloc[0])},
        # Inputs left out because they perfectly separate the days (see _fit_logit); empty when none.
        "leftOut": sorted(set(separating) | left_out),
    }


# ---------------------------------------------------------------------------
# Contour: XGBoost at (exit, hour) grain, predicted on a dry/wet grid
# ---------------------------------------------------------------------------


CONTOUR_FEATURES = ["hour_of_day", "km", "dow", "log_volume", "rain_mm"]


def fit_contour(panel: pd.DataFrame, exits_df: pd.DataFrame, holdout_days: int) -> dict:
    cutoff = panel["d"].max() - pd.Timedelta(days=holdout_days)
    train, holdout = panel[panel["d"] < cutoff], panel[panel["d"] >= cutoff]

    model = XGBRegressor(n_estimators=200, max_depth=5, learning_rate=0.05, subsample=0.9, colsample_bytree=0.9,
                         random_state=SEED, n_jobs=3)
    model.fit(train[CONTOUR_FEATURES], train["speed_kmh"])
    holdout_pred = model.predict(holdout[CONTOUR_FEATURES])
    # A conditional (what-if) model: it is served as a dry-vs-wet grid at typical volume, so the hour's own rain and
    # volume are its question. Baselines on the same rows (10 Nov 2026): each (exit, hour)'s training mean and
    # median jam speed, i.e. what the map would show with no model at all.
    keys = ["exit_id", "hour_of_day"]
    base = {}
    for agg in ("mean", "median"):
        lut = train.groupby(keys)["speed_kmh"].agg(agg).rename("b").reset_index()
        b = holdout[keys].merge(lut, on=keys, how="left")["b"].fillna(float(getattr(train["speed_kmh"], agg)())).values
        base[f"Per exit x hour training {agg} (baseline)"] = float(mean_absolute_error(holdout["speed_kmh"], b))
    err_m = np.abs(holdout["speed_kmh"].values - holdout_pred)
    lut = train.groupby(keys)["speed_kmh"].mean().rename("b").reset_index()
    b_mean = holdout[keys].merge(lut, on=keys, how="left")["b"].fillna(float(train["speed_kmh"].mean())).values
    err_b = np.abs(holdout["speed_kmh"].values - b_mean)
    metrics = {
        "MAE": float(mean_absolute_error(holdout["speed_kmh"], holdout_pred)),
        "R2": float(r2_score(holdout["speed_kmh"], holdout_pred)),
        "n": int(len(holdout)),
        "baselines": base,
        "beats_best_baseline": bool(err_m.mean() < min(base.values())),
        "minus_exit_hour_mean_ci": list(block_bootstrap_ci(holdout["d"].values,
                                                           lambda i: float(err_m[i].mean() - err_b[i].mean()), block=7)),
        "test_window": [str(holdout["d"].min().date()), str(holdout["d"].max().date())],
    }

    # Synthetic grid: every (exit, hour) combination, volume/dow held at
    # their training-set means — a "typical day" backdrop so the dry vs wet
    # comparison isolates rain's effect rather than mixing in which hours
    # happen to be busiest.
    mean_log_volume = train["log_volume"].mean()
    mean_dow = train["dow"].mean()
    grid_rows = []
    for _, exit_row in exits_df.iterrows():
        for hour in range(24):
            for scenario, rain_mm in (("dry", 0.0), ("wet", WET_SCENARIO_MM)):
                grid_rows.append({
                    "exit_id": exit_row["exit_id"], "exit_name": exit_row["exit_name"], "km": exit_row["km"],
                    "hour_of_day": hour, "scenario": scenario, "rain_mm": rain_mm,
                    "dow": mean_dow, "log_volume": mean_log_volume,
                })
    grid = pd.DataFrame(grid_rows)
    grid["predicted_speed_kmh"] = np.clip(model.predict(grid[CONTOUR_FEATURES]), 0, None)

    return {"metrics": metrics, "grid": grid}


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------
def ensure_schema(conn, commit: bool = True) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE SCHEMA IF NOT EXISTS gold;

            CREATE TABLE IF NOT EXISTS gold.ml_weather_speed_forecast (
                id SERIAL PRIMARY KEY,
                forecast_date DATE NOT NULL,
                actual_speed_kmh DOUBLE PRECISION,
                predicted_speed_kmh DOUBLE PRECISION NOT NULL,
                speed_model TEXT NOT NULL,
                actual_volume DOUBLE PRECISION,
                predicted_volume DOUBLE PRECISION,
                rain_mm DOUBLE PRECISION,
                trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (forecast_date)
            );

            CREATE TABLE IF NOT EXISTS gold.ml_weather_speed_contour (
                id SERIAL PRIMARY KEY,
                exit_id INT NOT NULL,
                exit_name TEXT NOT NULL,
                km DOUBLE PRECISION NOT NULL,
                hour_of_day INT NOT NULL,
                scenario TEXT NOT NULL,
                predicted_speed_kmh DOUBLE PRECISION NOT NULL,
                trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (exit_id, hour_of_day, scenario)
            );

            CREATE TABLE IF NOT EXISTS gold.ml_weather_speed_metadata (
                id SERIAL PRIMARY KEY,
                metadata_json JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
    if commit:
        conn.commit()


def write_to_db(conn, panel: pd.DataFrame, speed_out: dict, volume_pred: np.ndarray,
                 contour_out: dict, metadata: dict, dry: bool = False) -> None:
    ensure_schema(conn, commit=not dry)

    # The served band (10 Nov 2026): the champion's days 1-14 forecasts from every rolling origin, which do not
    # overlap, so forecast_date stays unique; it was one 90-day holdout forecast built on observed inputs.
    dates = speed_out["holdout_dates"]
    champ_pred_speed = speed_out["holdout_pred"][speed_out["champion"]]
    actual_speed = speed_out["holdout_actual"]
    rain_by_date = dict(zip(panel["d"], panel["rain_mm"]))
    actual_volume = panel.set_index("d").reindex(dates)["volume"].values

    def num(v):
        return None if v is None or (isinstance(v, (float, np.floating)) and not np.isfinite(v)) else float(v)

    rows = [
        (d.date(), num(actual_speed[i]), num(champ_pred_speed[i]), speed_out["champion"],
         num(actual_volume[i]), num(volume_pred[i]), num(rain_by_date.get(d)))
        for i, d in enumerate(dates)
    ]

    with conn.cursor() as cur:
        cur.execute("DELETE FROM gold.ml_weather_speed_forecast")
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO gold.ml_weather_speed_forecast
               (forecast_date, actual_speed_kmh, predicted_speed_kmh, speed_model,
                actual_volume, predicted_volume, rain_mm) VALUES %s""",
            rows,
        )

        cur.execute("DELETE FROM gold.ml_weather_speed_contour")
        grid = contour_out["grid"]
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO gold.ml_weather_speed_contour
               (exit_id, exit_name, km, hour_of_day, scenario, predicted_speed_kmh) VALUES %s""",
            [(int(r.exit_id), r.exit_name, float(r.km), int(r.hour_of_day), r.scenario, float(r.predicted_speed_kmh))
             for r in grid.itertuples()],
        )

        cur.execute("DELETE FROM gold.ml_weather_speed_metadata")
        cur.execute("INSERT INTO gold.ml_weather_speed_metadata (metadata_json) VALUES (%s)",
                    [json.dumps(json_safe(metadata), default=str)])

    if dry:
        conn.rollback()
        print("DRY WRITE: every query ran, transaction rolled back — gold.* is unchanged")
    else:
        conn.commit()


def _daily_table(L: list, out: dict, unit: str) -> None:
    sel = out["selection"]
    rows = {**out["metrics"], **out["baselines"]}
    buckets = [c for c in next(iter(rows.values()))["by_bucket"] if c != "score"]
    L.append(f"    {'model':<36}" + "".join(f"{b:>9}" for b in buckets) + f"{'score':>9}{'RMSE':>11}{'R2':>8}{'WMAPE%':>8}")
    for name, m in sorted(rows.items(), key=lambda kv: kv[1]["by_bucket"].get("score", np.inf)):
        bb = m["by_bucket"]
        tag = "  <- served" if name == out["champion"] else ""
        r2 = f"{m['R2']:.3f}" if m["R2"] is not None else "n/a"
        L.append(f"    {name:<36}" + "".join(f"{bb.get(b, np.nan):>9.3f}" for b in buckets)
                 + f"{bb.get('score', np.nan):>9.3f}{m['RMSE']:>11.4g}{r2:>8}{m['WMAPE']:>8.2f}{tag}")
    L.append(f"    ({unit}; score = mean of the bucket {sel['metric'].upper()}s; {sel['origins']} origins "
             f"{out['origins'][0]}..{out['origins'][-1]})")
    L.append(f"    best baseline: {sel['best_baseline']};  eligible: {', '.join(sel['eligible']) or 'none'}")
    if "vs_baseline_ci" in sel:
        lo, hi = sel["vs_baseline_ci"]
        L.append(f"    champion - best baseline: 95% interval {lo:+.3f} to {hi:+.3f} "
                 f"({'significant' if sel['vs_baseline_significant'] else 'NOT significant'})")
    if "vs_runner_up_ci" in sel:
        lo, hi = sel["vs_runner_up_ci"]
        L.append(f"    champion - runner-up ({sel['runner_up']}): 95% interval {lo:+.3f} to {hi:+.3f} "
                 f"({'significant' if sel['vs_runner_up_significant'] else 'NOT significant'})")
    if "vs_no_rain_twin_d1_14_ci" in sel:
        lo, hi = sel["vs_no_rain_twin_d1_14_ci"]
        L.append(f"    XGBoost - its no-rain twin, days 1-14: 95% interval {lo:+.3f} to {hi:+.3f}")
    if sel.get("note"):
        L.append(f"    note: {sel['note']}")
    L.append(f"    served: {out['champion']}" + ("  (a baseline: no model beat the best baseline)" if out["champion_is_baseline"] else ""))


def _kpi_block(L: list, title: str, out: dict, label: str) -> None:
    L.append(f"  {title} — logistic regression (conditional on the day's rain, volume and calendar)")
    if out["auc"] is not None:
        ci = out["auc_ci"]
        L.append(f"    AUC = {out['auc']:.3f}  95% interval [{ci[0]:.3f}, {ci[1]:.3f}]  on {out['positives']} positive "
                 f"day(s) of {out['n']} ({out['test_window'][0]}..{out['test_window'][1]}, refit every "
                 f"{out['refit_every_days']} days)")
    else:
        L.append(f"    AUC = n/a ({out['positives']} positive day(s) of {out['n']})")
    L.append(f"    log-loss skill = {out['log_loss_skill']:+.4f}   Brier skill = {out['brier_skill']:+.4f}  "
             f"(vs {out['baseline']})")
    if out.get("failed_blocks"):
        L.append(f"    {out['failed_blocks']} block fit(s) failed and were not scored")
    L.append(f"    top driver = {out['topDriver']['feature']} (effect size {out['topDriver']['effectSize']:.3f})"
             f"  |  rain_mm significant at p<0.05: {out['rainSignificant']} (p={out['rainPValue']:.3f})"
             if out["rainPValue"] is not None else "    rain_mm p-value = n/a")
    for s in out["scenarios"]:
        L.append(f"      rain={s['rain_mm']:>4}mm -> P({label}) = {s['probability']:.3f}")
    for s in out["volumeScenarios"]:
        L.append(f"      volume={s['volume']:>8,.0f} -> P({label}) = {s['probability']:.3f}")


def print_report(speed_out: dict, closure_out: dict, risk_out: dict, contour_out: dict, volume_out: dict | None = None) -> str:
    L = []
    L.append("=" * 80)
    L.append("  WEATHER-ADJUSTED SPEED MODELS")
    L.append("=" * 80)
    L.append("")
    L.append("  Daily jam speed (Waze) — rolling origins, known-in-advance inputs only (rain observed days 1-14 = upper bound)")
    _daily_table(L, speed_out, "km/h")
    L.append("")
    if volume_out is not None:
        L.append("  Daily corridor volume (weather pipeline) — same origins; volume is NOT among its own inputs any more")
        _daily_table(L, volume_out, "vehicles/day")
        L.append("")
    _kpi_block(L, "Gridlock (road closure) day", closure_out, "gridlock")
    L.append("")
    _kpi_block(L, "High-incident day (weather incident risk)", risk_out, "high-incident day")
    L.append("")
    cm = contour_out["metrics"]
    L.append("  Contour (exit x hour jam speed) — XGBoost, conditional on the hour's rain and volume; last 90 days")
    L.append(f"    MAE={cm['MAE']:.3f}  R2={cm['R2']:.3f}  n={cm['n']}  ({cm['test_window'][0]}..{cm['test_window'][1]})")
    for k, v in cm["baselines"].items():
        L.append(f"    {k:<46} MAE={v:.3f}")
    lo, hi = cm["minus_exit_hour_mean_ci"]
    L.append(f"    XGBoost {'beats' if cm['beats_best_baseline'] else 'does NOT beat'} the best baseline; "
             f"XGBoost - exit x hour mean: 95% interval [{lo:+.3f}, {hi:+.3f}]")
    L.append("=" * 80)
    return "\n".join(L)


def main() -> None:
    global ORIGIN_STEP_DAYS, _READONLY
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-db", action="store_true")
    parser.add_argument("--dry-write", action="store_true")
    parser.add_argument("--dry-run", action="store_true",
                        help="train and report only; write nothing (no report file, read-only DB session)")
    # The forecast horizon of the daily models from every rolling origin (it was the single holdout's length).
    parser.add_argument("--holdout-days", type=int, default=90)
    parser.add_argument("--origin-step", type=int, default=ORIGIN_STEP_DAYS,
                        help="days between rolling origins for the daily models (protocol: 14; default 28)")
    # Optional resume file for the rolling studies (OFF unless given: a dry run otherwise writes nothing).
    parser.add_argument("--ckpt-dir", default=None,
                        help="directory for resumable rolling-study checkpoints (off by default)")
    args = parser.parse_args()
    ORIGIN_STEP_DAYS = args.origin_step
    if args.dry_run and (args.write_db or args.dry_write):
        sys.exit("--dry-run writes nothing; it cannot be combined with --write-db or --dry-write")

    _READONLY = args.dry_run
    conn = get_conn(readonly=args.dry_run)
    try:
        print("Loading daily corridor-wide panel (speed/volume/rain/incidents)...")
        holidays = load_holidays(conn)
        daily = load_daily_panel(conn, holidays)
        print(f"  {len(daily)} days ({daily['d'].min().date()}..{daily['d'].max().date()})")

        print("\nDaily jam-speed models (XGBoost x2 / SARIMAX / LSTM / GRU vs baselines), rolling origins...")
        speed_out = fit_daily_models(daily, "speed_kmh", args.holdout_days, metric="mae", ckpt_dir=args.ckpt_dir)

        print("\nDaily volume, the same candidates and origins (no volume input)...")
        volume_out = fit_daily_models(daily, "volume", args.holdout_days, metric="wmape", ckpt_dir=args.ckpt_dir)
        vres = volume_out["results"]
        vband = vres[(vres["model"] == volume_out["champion"]) & (vres["h"] <= ORIGIN_STEP_DAYS)]
        vmap = dict(zip(pd.to_datetime(vband["date"]), vband["forecast"]))
        volume_pred = np.array([vmap.get(d, np.nan) for d in speed_out["holdout_dates"]], dtype=float)

        print("\nFitting road-closure and weather-incident-risk logistic regressions...")
        # Training-set-derived threshold, not a fixed guess — jam level alone (the heavy-jam exit-hours a day
        # carries), not the OR-with-speed-floor rule an earlier version of this script used on the old synthetic
        # speed column (2026-10-21: speed is the real Waze jam record now). Only the first half-year of labels uses this fallback; it is taken from the days BEFORE
        # the logistic test window, so no test day shapes any label.
        train_slice = daily.iloc[: max(len(daily) - KPI_TEST_DAYS, 1)]
        # Relative to the preceding year, as the high-incident day below: Waze's report volume falls from 2024 on,
        # so one fixed line (the training 95th percentile of heavy-jam hours) caught no day at all in the 2026
        # holdout (2026-10-21). A day is a gridlock day when its heavy-jam hours are in the top 5% of the 365
        # days before it - past days only; the first half-year falls back to the training 95th percentile.
        jam_ceiling = train_slice["jam_level_max"].quantile(0.95)
        jam_trailing = daily["jam_level_max"].shift(1).rolling(365, min_periods=180).quantile(0.95)
        daily["road_closure"] = (daily["jam_level_max"] >= jam_trailing.fillna(jam_ceiling)).astype(int)
        hold_c = daily["road_closure"].iloc[len(daily) - KPI_TEST_DAYS:]
        print(f"  closure rule: heavy-jam exit-hours in the top 5% of the preceding 365 days "
              f"({daily['road_closure'].mean() * 100:.1f}% of all days, {hold_c.mean() * 100:.1f}% of the test year, "
              f"{int(hold_c.sum())} days)")

        # "Any incident" is not a usable target here — the corridor logs at
        # least 2 incidents on every single day in this data (median 26),
        # so a >0 threshold is a constant column and the logistic fit is
        # singular. "High incident day" is what "weather incident risk" can actually mean on
        # a corridor this busy: not "will anything happen" but "will today
        # run unusually heavy".
        # Relative to the preceding year, not to the whole training span: incident logging runs higher in 2026
        # than in 2022-2025, so one fixed line (the training top quartile) marked 67% of the 2026 holdout days
        # "heavy" and the AUC fell to 0.47 (2026-10-20). A day is high-incident when it is in the top quarter of
        # the 365 days BEFORE it - past days only, so nothing from the test leaks into a training label. The
        # first days, with under half a year behind them, fall back to the pre-test top quartile.
        incident_ceiling = train_slice["incident_count"].quantile(0.75)
        trailing = daily["incident_count"].shift(1).rolling(365, min_periods=180).quantile(0.75)
        ceiling_by_day = trailing.fillna(incident_ceiling)
        daily["high_incident_day"] = (daily["incident_count"] >= ceiling_by_day).astype(int)
        hold = daily["high_incident_day"].iloc[len(daily) - KPI_TEST_DAYS:]
        print(f"  high-incident-day rule: incident_count in the top quarter of the preceding 365 days "
              f"({daily['high_incident_day'].mean() * 100:.1f}% of all days, {hold.mean() * 100:.1f}% of the test year)")

        closure_out = fit_logistic_kpi(daily, "road_closure", KPI_TEST_DAYS)
        risk_out = fit_logistic_kpi(daily, "high_incident_day", KPI_TEST_DAYS)

        print("\nLoading exit reference and per-(exit, hour) panel...")
        # The daily studies above take tens of minutes; on this RDS link the idle main connection can be dropped
        # in that time without either side noticing until the next query (11 Nov 2026), so a fresh one is opened
        # here and used for the rest of the run (including the write).
        try:
            conn.close()
        except Exception:
            pass
        conn = get_conn()
        exits_df = pd.read_sql(EXIT_REFERENCE_SQL, conn)
        exit_hour_panel = load_exit_hour_panel(conn, exits_df)
        # The daily panel stops where the Waze speed record does (load_daily_panel); this panel did
        # not, so its holdout was those dead days and its MAE read 6.24 against 1.0 (2026-10-20). Same cutoff.
        exit_hour_panel = exit_hour_panel[exit_hour_panel["d"] <= daily["d"].max()].reset_index(drop=True)
        print(f"  {len(exit_hour_panel)} exit-hour-day rows across {exits_df['exit_id'].nunique()} exits "
              f"(to {daily['d'].max().date()}, the daily panel's last day with usable speed)")

        print("Fitting weather-adjusted speed contour (XGBoost)...")
        contour_out = fit_contour(exit_hour_panel, exits_df, args.holdout_days)

        report = print_report(speed_out, closure_out, risk_out, contour_out, volume_out)
        print("\n" + report)
        if args.dry_run:
            print("\n--dry-run: nothing written (no report file, no database rows).")
            return
        report_path = Path(__file__).resolve().parent / "model_results_weather_speed.txt"
        report_path.write_text(report, encoding="utf-8")
        print(f"\nFull report written to {report_path}")

        if not args.write_db and not args.dry_write:
            print("\nTraining complete. Re-run with --write-db once you've reviewed the report above.")
            return

        sc = speed_out["champion"]
        kpi_keys = ("auc", "auc_ci", "positives", "log_loss_skill", "brier_skill", "baseline", "base_rate", "n",
                    "test_window", "refit_every_days", "failed_blocks", "scenarios", "volumeScenarios",
                    "rainSignificant", "rainPValue", "topDriver", "leftOut")
        metadata = {
            "speed": {"champion": sc, "champion_is_baseline": speed_out["champion_is_baseline"],
                      "metrics": speed_out["metrics"], "baselines": speed_out["baselines"],
                      "selection": speed_out["selection"], "best_baseline": speed_out["best_baseline"],
                      # naive_mae is the TRAINING MEAN's score (a constant), not a no-change forecast; the label
                      # travels with it.
                      "naive_mae": speed_out["naive_mae"], "naive_label": speed_out["naive_label"],
                      "degraded": speed_out["degraded"], "origins": speed_out["origins"]},
            "volume_refit_of": sc,
            "volume_metrics": volume_out["metrics"].get(sc) or volume_out["baselines"].get(sc),
            "volume": {"champion": volume_out["champion"], "metrics": volume_out["metrics"],
                       "baselines": volume_out["baselines"], "selection": volume_out["selection"],
                       "inputs": "calendar and rain only; volume is not among its own inputs (it was, R2 0.998)"},
            "road_closure": {**{k: closure_out[k] for k in kpi_keys}, "jam_ceiling": float(jam_ceiling)},
            "weather_incident_risk": {k: risk_out[k] for k in kpi_keys},
            "contour": {"metrics": contour_out["metrics"], "wet_scenario_mm": WET_SCENARIO_MM},
            "holdout_days": args.holdout_days,
            "protocol": (f"daily models: origins every {ORIGIN_STEP_DAYS} days over the last {TEST_WEEKS} weeks, "
                         f"{args.holdout_days}-day horizon, refit at every origin, inputs known at the origin only "
                         f"(calendar; rain observed for days 1-{ORACLE_DAYS} as an upper bound; volume as an "
                         "out-of-sample weekday-average forecast); logistic KPIs: last 364 days, refit every 28 days"),
            "trained_at": pd.Timestamp.utcnow().isoformat(),
        }
        print("\nWriting gold.ml_weather_speed_forecast / ml_weather_speed_contour / ml_weather_speed_metadata...")
        write_to_db(conn, daily, speed_out, volume_pred, contour_out, metadata,
                    dry=args.dry_write and not args.write_db)
        print("Rolled back (dry write)." if (args.dry_write and not args.write_db) else "Committed.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
