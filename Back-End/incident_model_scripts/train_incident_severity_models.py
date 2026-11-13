#!/usr/bin/env python3
"""
SmartFlow NLEX — Incident Severity/Clearance Models (Block 2: Secondary Incident Risk)
========================================================================================
Per-INCIDENT models, a third grain alongside train_incident_models.py's per-day
pipeline and train_incident_spatial_models.py's per-exit one:

  1. Ordinal Logistic Regression + XGBoost — compete on predicting an
     incident's SEVERITY (Property-Damage-Only / Injury / Fatal), from
     pre-incident context only (cause, type, weather, corridor position,
     time). Champion = whichever holds up better on a chronological holdout.

  2. Cox Proportional Hazards — survival-analyses the CLEARANCE duration
     (site_cleared - event_start_date, a real elapsed time now — see the
     data-source note below), the source for the clearance survival curve
     and the predicted-clearance-time output.

  3. A small logistic regression scoring "secondary incident risk": did
     another incident start nearby, before this one's clearance window
     closed? That label doesn't exist in the source data — it is derived
     here from a spatiotemporal self-join (see label_secondary_incidents()).

Data source (rebuilt on the accident_data event export — see below for the
two gaps this closes relative to the old nlex_road_crashes/
nlex_motorcycle_crashes source):
  silver.nlex_accident_events_clean carries REAL, recorded
  number_of_injured / number_of_fatality counts (unlike nlex_road_crashes /
  nlex_motorcycle_crashes, whose `severity` column is 100% NULL on every
  row). Severity is still DERIVED from those counts (0 -> PDO, injuries only
  -> Injury, any fatality -> Fatal, the standard KABCO-style taxonomy), but
  the counts themselves are now genuine, not an always-empty placeholder.
  Those same injury/fatality columns are consequences of the accident, not
  causes, so they stay excluded from the FEATURE set below on pain of
  leaking the label into its own predictors.

  This table also carries a real scene-cleared timestamp, site_cleared —
  unlike the old tables, which had no clearance column at all (only
  reported_time/response_time, the same pair
  src/services/incident.service.ts's RESPONSE_MIN computes minutes from for
  the descriptive dashboard, and which this script used to reuse as a
  "time to clear" proxy). `duration_min` below is now
  site_cleared - event_start_date: a real elapsed-time-to-clear, not a
  proxy — every caption downstream can honestly say "clearance time"
  instead of "response duration".

Only accident_data (silver.nlex_accident_events_clean) feeds this script.
breakdown_data (silver.nlex_breakdown_events_clean) is excluded: mechanical
breakdowns carry no injury/fatality information at all, so mixing it in
would just be rows of missing severity labels — the same reason
nlex_stalled_vehicles was excluded from the old version of this script. Its
per-service dispatch/response records (`deployments`) feed a separate,
purely descriptive analysis (getEventBreakdownFromDb / /api/incident/event-breakdown)
rather than this trained-model pipeline.

How it is tested (10 Nov 2026, EVALUATION_PROTOCOL.md applied to classes and durations):
  * Severity: plain accuracy was the selection metric and it equalled the share of the commonest class (0.9005 vs
    0.9003): "always Property Damage Only" scored the same. Candidates are now chosen on macro-F1 and must ALSO beat
    the class prior on log-loss; balanced accuracy, Brier skill and per-class recall are reported, and the class
    prior is scored on the same rows. Plain argmax almost never names a rare class, so each classifier's decision
    weights are tuned for macro-F1 on a validation slice cut from the END of the training period (never the test).
  * Clearance: the Cox model's concordance used to be its TRAINING c-index; it is now computed on the test rows.
    Its MAE is reported next to a constant training median and a per-(type x cause) training-median lookup, and
    the served clearance figure is the Cox model only if it beats the better of the two (else that baseline).
  * Volume enters as the mean of the 7 days BEFORE the incident (known at the time), not the incident day's own
    total, and only real volume (to REAL_END_VOLUME) is used: clearance is scored on incidents up to that day.
  * Every "A beats B" carries a 95% moving-block bootstrap interval over days.

Usage:
    python train_incident_severity_models.py                 # train + report only (writes the report .txt)
    python train_incident_severity_models.py --dry-run       # train + report, writes NOTHING (no file, read-only DB session)
    python train_incident_severity_models.py --write-db       # + write to gold.*
    python train_incident_severity_models.py --dry-write       # rehearse the write, then roll back
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras
import statsmodels.api as sm
from dotenv import load_dotenv
from lifelines import CoxPHFitter
from sklearn.metrics import mean_absolute_error
from statsmodels.miscmodels.ordinal_model import OrderedModel
from xgboost import XGBClassifier

from honest_eval import (REAL_END_VOLUME, binary_report, block_bootstrap_ci, concordance_on, fmt_ci, json_safe,
                         log_loss_rows, macro_f1_from, median_lookup, multiclass_report, pick_champion,
                         tune_class_weights)

SEED = 42
# Chronological holdout, same "score on the most recent slice" protocol as
# train_incident_models.py's default (protocol="holdout") — trains on the
# older ~80%, scores on the most recent ~20% of incidents by report time.
HOLDOUT_FRACTION = 0.2
# The last 15% of the TRAINING incidents (by time) is the validation slice the severity decision weights are tuned
# on; the classifiers are then refitted on the whole training period. The test rows are never used for tuning.
VALIDATION_FRACTION = 0.15
# Moving-block bootstrap block, in days, for every interval below.
BOOT_BLOCK_DAYS = 7
# A per-group clearance median needs this many training incidents, else it falls back to the coarser group.
MIN_GROUP_N = 20
# How close two incidents' km-posts have to be to count as "nearby" for the
# secondary-incident label. NLEX's 20 exits average ~4km apart, so 2km is
# roughly "the same immediate stretch of corridor", not the whole highway.
SECONDARY_KM_RADIUS = 2.0
# Extra minutes added past a primary incident's own clearance duration before
# its "secondary incident" window closes — a following incident during the
# clearance itself, plus a short tail after the scene is reported cleared.
SECONDARY_BUFFER_MIN = 30


def set_all_seeds(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)


set_all_seeds()
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def get_conn(readonly: bool = False):
    """Mirrors train_incident_models.py's get_conn() — kept in sync by hand. readonly=True (--dry-run) makes the
    server refuse any INSERT/UPDATE/DELETE/DDL on this session, so a dry run cannot write even by mistake."""
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
    conn = psycopg2.connect(dsn, sslmode="require")
    if readonly:
        conn.set_session(readonly=True)
    return conn


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
# event_start_date/site_cleared are already full, trustworthy timestamps (no
# date/time-of-day split to reconstruct, unlike the old road/moto tables) —
# see build_features for what that simplifies. clearance_min is silver's own
# derivation (NULLed, not row-dropped, when outside 0-1440 minutes).
POOLED_INCIDENTS_SQL = """
    SELECT event_start_date::date AS d, event_start_date, site_cleared, clearance_min,
           main_cause, sub_cause, type_of_event, weather_condition,
           damage_to_property, km_value, number_of_vehicles,
           number_of_injured AS injuries, number_of_fatality AS fatalities,
           'accident' AS source
    FROM silver.nlex_accident_events_clean
    WHERE event_start_date IS NOT NULL AND km_value IS NOT NULL
      AND site_cleared IS NOT NULL
"""


def load_holidays(conn) -> set:
    df = pd.read_sql("SELECT date_day FROM public.ph_holidays", conn)  # validated calendar; dim_holiday stops 2026-07-25
    return set(pd.to_datetime(df["date_day"]).dt.date)


def load_incidents(conn) -> pd.DataFrame:
    df = pd.read_sql(POOLED_INCIDENTS_SQL, conn)
    df["d"] = pd.to_datetime(df["d"])
    return df


# split_label = '80_20': mirrors train_incident_models.py's own
# DAILY_VOLUME_SQL, kept in sync by hand — that table stores each date twice
# (an '80_20' and a '90_10' row), and an unfiltered join silently doubles
# every value. See that script's own doc comment for the full incident.
DAILY_VOLUME_SQL = """
    SELECT forecast_date AS d, actual_volume::float AS volume
    FROM gold.ml_predictive_volume
    WHERE actual_volume IS NOT NULL AND split_label = '80_20'
    ORDER BY 1
"""


def load_daily_volume(conn) -> pd.DataFrame:
    """Volume covers 2022-01-01 onward; accident_data starts right around the
    same date, so coverage is now high (89.0% of accidents, verified) rather
    than the ~28%-missing gap the old road/moto-crash source (which ran back
    to 2020) had — but it is not total, and the remaining gap is not papered
    over with an imputed value. Rows outside coverage carry volume=NaN and
    are excluded from any grouping that needs it, the same way a handful of
    null predicted_clearance_min rows already get excluded from that average
    elsewhere in this pipeline rather than filled in.

    Returned as the volume an incident's dispatcher could know: the mean daily total over the 7 days BEFORE the
    incident day (10 Nov 2026). It was the incident day's own total, which is not complete until the day ends.
    Only real volume counts: days after REAL_END_VOLUME (25 May - 30 Jun 2026 still hold broken and synthetic
    days) are blank, so an incident whose previous week touches them has no volume and is not scored by a model
    that needs it."""
    df = pd.read_sql(DAILY_VOLUME_SQL, conn)
    df["d"] = pd.to_datetime(df["d"])
    s = df.groupby("d")["volume"].mean()
    s = s[s.index <= REAL_END_VOLUME]
    full = pd.date_range(s.index.min(), REAL_END_VOLUME + pd.Timedelta(days=1), freq="D")
    s = s.reindex(full)
    prev7 = s.rolling(7, min_periods=7).mean().shift(1)
    return pd.DataFrame({"d": prev7.index, "volume": prev7.values})


# ---------------------------------------------------------------------------
# Feature/label construction
# ---------------------------------------------------------------------------
def build_features(df: pd.DataFrame, holidays: set) -> pd.DataFrame:
    out = df.copy()

    # event_start_date/site_cleared are already full, trustworthy timestamps
    # (unlike the old reported_time/response_time pair, which carried only a
    # time-of-day and had to be re-anchored onto `d` by hand) — clearance_min
    # is silver's own site_cleared - event_start_date derivation, already
    # NULLed there when it fell outside 0-1440 minutes. A handful of
    # exact-zero durations are plausible (an immediate clear logged to the
    # same minute); Cox PH's log-hazard blows up at exactly zero, so this
    # floors them at 30 seconds rather than dropping real rows.
    out["duration_min"] = out["clearance_min"].clip(lower=0.5)
    out["event_start_date"] = pd.to_datetime(out["event_start_date"])
    out["hour_of_day"] = out["event_start_date"].dt.hour

    # Log-transformed to match train_incident_models.py's own log_volume
    # feature (same reasoning: incident counts/response times relate to
    # volume multiplicatively, not linearly). `volume` is the mean of the 7
    # days BEFORE the incident (load_daily_volume), so it is known when the
    # incident is reported. NaN where that week is not fully real volume —
    # left as NaN rather than filled, since fit_cox_ph filters on it directly
    # rather than silently training on a guessed value.
    out["log_volume"] = np.log1p(out["volume"])

    # Severity: derived from real recorded injury/fatality counts (0 -> PDO,
    # injuries only -> Injury, any fatality -> Fatal, KABCO-style) — see the
    # module docstring for how this differs from the old, always-NULL source
    # column. injuries/fatalities are kept on the frame for this derivation
    # only; build_design_matrix below excludes both from the feature set.
    out["severity_code"] = np.select(
        [out["fatalities"] > 0, out["injuries"] > 0],
        [2, 1],
        default=0,
    )

    dow = out["d"].dt.dayofweek
    doy = out["d"].dt.dayofyear
    out["dow"] = dow
    out["is_weekend"] = dow.isin([5, 6]).astype(int)
    out["is_holiday"] = out["d"].dt.date.map(lambda x: int(x in holidays))
    out["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    out["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)

    # duration_min is NaN on the handful of rows silver already NULLed as
    # outside a plausible 0-1440-minute clearance window — not dropped here
    # (severity classification and secondary-incident labeling don't need a
    # valid duration), the same "filter locally, at the model that actually
    # needs the value" approach fit_cox_ph already uses for volume below.
    return out.sort_values("event_start_date").reset_index(drop=True)


def label_secondary_incidents(df: pd.DataFrame) -> pd.Series:
    """For each incident, did another incident start within
    SECONDARY_KM_RADIUS of it and within [its own report time, its own
    report time + clearance duration + SECONDARY_BUFFER_MIN]?

    O(n log n) via a time-sorted search rather than an O(n^2) pairwise scan:
    df is already sorted by event_start_date (build_features' last step), so
    for each row the candidate window is a contiguous slice found by
    searchsorted, and only THAT slice is checked against the km radius.
    """
    times = df["event_start_date"].values
    kms = df["km_value"].values
    # duration_min is NaN on the rare row silver couldn't derive a plausible
    # clearance for (see build_features) — falls back to just the buffer
    # window rather than propagating NaT, so those incidents still get a
    # secondary-incident check instead of silently never being flagged.
    duration = df["duration_min"].fillna(0)
    window_end = (df["event_start_date"] + pd.to_timedelta(duration + SECONDARY_BUFFER_MIN, unit="m")).values

    has_secondary = np.zeros(len(df), dtype=bool)
    lo_idx = np.searchsorted(times, times, side="right")  # first candidate strictly after this row
    for i in range(len(df)):
        hi = np.searchsorted(times, window_end[i], side="right")
        lo = lo_idx[i]
        if hi <= lo:
            continue
        nearby = np.abs(kms[lo:hi] - kms[i]) <= SECONDARY_KM_RADIUS
        has_secondary[i] = bool(nearby.any())
    return pd.Series(has_secondary, index=df.index, name="had_secondary")


# `source` and `damage_to_property` are deliberately excluded: source is now
# constant ('accident' — see POOLED_INCIDENTS_SQL, kept only as gold-table
# metadata) and damage_to_property is an outcome of the incident, not
# pre-incident context (same leakage reasoning that excludes
# injuries/fatalities below) — it's used only as a Cox-curve grouping
# dimension, not a model feature (see fit_cox_ph).
#
# `main_cause` is ALSO excluded, not just redundant-but-harmless: it's a
# strict coarsening of `sub_cause` (verified — every one of the 20 sub_cause
# values maps to exactly one main_cause, 0 exceptions), so one-hot-encoding
# both together makes their combined dummy columns perfectly collinear.
# statsmodels' OrderedModel actively rejects that ("There should not be a
# constant in the model" — an implicit-constant rank check, not a literal
# constant column) rather than silently dropping the redundant df like
# XGBoost would. sub_cause alone carries at least as much signal.
CATEGORICAL_COLS = ["sub_cause", "type_of_event", "weather_condition"]
NUMERIC_COLS = ["km_value", "number_of_vehicles", "hour_of_day", "dow", "is_weekend", "is_holiday", "doy_sin", "doy_cos"]


def build_design_matrix(
    df: pd.DataFrame, dummy_columns: list[str] | None = None, numeric_cols: list[str] | None = None
) -> pd.DataFrame:
    """Pre-incident-context features only — no injuries/fatalities/duration/
    severity_code/had_secondary, all of which are outcomes of the incident,
    not context available before or at the moment it was reported.

    `dummy_columns` pins the one-hot column set (fit on train, reindexed onto
    validation/holdout) so a category absent from one split can't silently
    shift every other column's position in X.

    `numeric_cols` overrides the module-level NUMERIC_COLS — used by
    fit_cox_ph to add log_volume for the rows that actually have it, without
    forcing severity/secondary-risk (which run on the full, not
    volume-filtered, dataset) to carry a column full of NaN for the ~28% of
    incidents that predate volume tracking.

    Keeps df's own index on the result (order-preserving, so a caller that
    filtered df to a subset can reindex predictions back onto the original
    frame afterward) rather than resetting to 0..n-1.
    """
    cols = numeric_cols if numeric_cols is not None else NUMERIC_COLS
    X = pd.get_dummies(df[CATEGORICAL_COLS], drop_first=True)
    X = pd.concat([df[cols], X], axis=1)
    X = X.astype(float)
    if dummy_columns is not None:
        X = X.reindex(columns=dummy_columns, fill_value=0.0)
    return X


# ---------------------------------------------------------------------------
# Model 1: Severity — Ordinal Logistic Regression vs XGBoost
# ---------------------------------------------------------------------------
SEVERITY_LABELS = {0: "Property Damage Only", 1: "Injury", 2: "Fatal"}
# Replaces the old road-vs-motorcycle SOURCE_LABELS: with a single accident
# source table there's no source split left to report, but damage_to_property
# is a real, validated 2-way split in this data (median clearance 4min vs
# 12min — see the module docstring / migration notes) and fills the same
# role for the Cox-curve cross-comparison below.
DAMAGE_LABELS = {"NO": "No Property Damage", "YES": "Property Damage"}


N_CLASSES = 3
SEVERITY_BASELINE = "Class prior (baseline)"
# Lower = simpler; the simpler model wins a lead that is not significant (protocol section 6.4).
SEVERITY_COMPLEXITY = {SEVERITY_BASELINE: 0, "OrdinalLogistic": 1, "XGBoost": 2}


def _fit_predict_ordinal(X_fit: pd.DataFrame, y_fit: np.ndarray, X_pred: pd.DataFrame) -> np.ndarray:
    # Numeric columns standardised on the fitting rows (the one-hot columns are already 0/1): BFGS stopped at its
    # iteration cap on the raw scales (km 0-90 next to 0/1 dummies), so the fit was not converged.
    num = [c for c in NUMERIC_COLS if c in X_fit.columns]
    mu, sd = X_fit[num].mean(), X_fit[num].std().replace(0, 1.0)
    Xf, Xp = X_fit.copy(), X_pred.copy()
    Xf[num] = (Xf[num] - mu) / sd
    Xp[num] = (Xp[num] - mu) / sd
    # A one-hot column that is all zero in the fitting rows has no information and makes the design rank-deficient.
    keep = [c for c in Xf.columns if c in num or Xf[c].abs().sum() > 0]
    res = OrderedModel(y_fit, Xf[keep], distr="logit").fit(method="bfgs", disp=False, maxiter=1000)
    return np.asarray(res.predict(Xp[keep]))


def _fit_predict_xgb(X_fit: pd.DataFrame, y_fit: np.ndarray, X_pred: pd.DataFrame) -> np.ndarray:
    xgb = XGBClassifier(
        n_estimators=200, max_depth=4, learning_rate=0.05, subsample=0.9,
        colsample_bytree=0.9, objective="multi:softprob", num_class=N_CLASSES, random_state=SEED, n_jobs=3,
    )
    xgb.fit(X_fit, y_fit)
    return np.asarray(xgb.predict_proba(X_pred))


def fit_severity_models(train: pd.DataFrame, holdout: pd.DataFrame) -> dict:
    """Ordinal logistic vs XGBoost vs the class prior, on the same holdout rows.

    1. Validation: fit each classifier on the first 85% of the training period, predict the last 15%, and choose
       its decision weights (pred = argmax(proba * w)) for macro-F1 there.
    2. Refit on the whole training period, predict the holdout, apply those weights.
    3. Champion (rule fixed before results): eligible = beats the class prior on BOTH macro-F1 and log-loss; the
       champion is the highest macro-F1 among the eligible; a lead over the runner-up whose 95% interval includes 0
       goes to the simpler model. None eligible -> the class prior ("always the commonest class") is served.
    """
    X_train = build_design_matrix(train)
    X_holdout = build_design_matrix(holdout, dummy_columns=list(X_train.columns))
    y_train, y_holdout = train["severity_code"].values.astype(int), holdout["severity_code"].values.astype(int)

    n_fit = int(len(train) * (1 - VALIDATION_FRACTION))
    X_fit, X_val = X_train.iloc[:n_fit], X_train.iloc[n_fit:]
    y_fit, y_val = y_train[:n_fit], y_train[n_fit:]

    prior = np.bincount(y_train, minlength=N_CLASSES) / len(y_train)
    prior_proba = np.tile(prior, (len(y_holdout), 1))

    fitters = {"OrdinalLogistic": _fit_predict_ordinal, "XGBoost": _fit_predict_xgb}
    proba, pred, weights = {}, {}, {}
    for name, fn in fitters.items():
        w = tune_class_weights(y_val, fn(X_fit, y_fit, X_val), N_CLASSES)
        p = fn(X_train, y_train, X_holdout)
        proba[name], weights[name] = p, w
        pred[name] = (p * w).argmax(axis=1)
    proba[SEVERITY_BASELINE] = prior_proba
    pred[SEVERITY_BASELINE] = np.full(len(y_holdout), int(prior.argmax()))
    weights[SEVERITY_BASELINE] = np.ones(N_CLASSES)

    metrics = {}
    for name in pred:
        m = multiclass_report(y_holdout, proba[name], pred[name], N_CLASSES, prior_proba)
        # Ordinal codes are a real ordering (PDO < Injury < Fatal), so a miss of one class away from the truth is
        # a smaller error than a miss of two; kept as a secondary figure.
        m["MAE_ordinal"] = float(mean_absolute_error(y_holdout, pred[name]))
        m["decision_weights"] = [float(x) for x in weights[name]]
        metrics[name] = m

    # Champion rule (fixed before results; see the docstring).
    days = holdout["d"].values
    base = metrics[SEVERITY_BASELINE]
    eligible = sorted(
        [m for m in fitters if metrics[m]["macro_f1"] > base["macro_f1"] and metrics[m]["log_loss"] < base["log_loss"]],
        key=lambda m: -metrics[m]["macro_f1"],
    )

    def f1_diff(a: str, b: str):
        pa, pb = pred[a], pred[b]
        return block_bootstrap_ci(
            days, lambda i: macro_f1_from(y_holdout[i], pa[i], N_CLASSES) - macro_f1_from(y_holdout[i], pb[i], N_CLASSES),
            block=BOOT_BLOCK_DAYS)

    def ll_diff(a: str, b: str):
        la, lb = log_loss_rows(y_holdout, proba[a]), log_loss_rows(y_holdout, proba[b])
        return block_bootstrap_ci(days, lambda i: float(la[i].mean() - lb[i].mean()), block=BOOT_BLOCK_DAYS)

    selection: dict = {"rule": "eligible = beats the class prior on macro-F1 AND log-loss; champion = highest "
                               "macro-F1; a non-significant lead goes to the simpler model",
                       "eligible": eligible}
    if not eligible:
        champion = SEVERITY_BASELINE
        selection["note"] = "no classifier beats the class prior on both macro-F1 and log-loss; the prior is served"
    else:
        champion = eligible[0]
        if len(eligible) > 1:
            runner = eligible[1]
            ci = f1_diff(champion, runner)
            selection.update(runner_up=runner, macro_f1_vs_runner_up_ci=list(ci),
                             macro_f1_vs_runner_up_significant=bool(ci[0] > 0))
            if ci[0] <= 0 and SEVERITY_COMPLEXITY[runner] < SEVERITY_COMPLEXITY[champion]:
                selection["note"] = f"{champion} led {runner} on macro-F1 without a significant margin; the simpler {runner} wins"
                champion, selection["runner_up"] = runner, champion
        selection["macro_f1_vs_prior_ci"] = list(f1_diff(champion, SEVERITY_BASELINE))
        selection["log_loss_vs_prior_ci"] = list(ll_diff(champion, SEVERITY_BASELINE))
    selection["champion"] = champion

    holdout_predictions = holdout[["d", "event_start_date", "km_value", "source", "severity_code"]].copy()
    holdout_predictions["pred_ordinal"] = pred["OrdinalLogistic"]
    holdout_predictions["pred_xgboost"] = pred["XGBoost"]
    holdout_predictions["pred_champion"] = pred[champion]

    return {
        "champion": champion,
        # Candidates only under "metrics" (gold.model_evaluation lists every key there as a model); the class prior
        # is reported under "baseline" next to them.
        "metrics": {k: v for k, v in metrics.items() if k != SEVERITY_BASELINE},
        "baseline": {SEVERITY_BASELINE: metrics[SEVERITY_BASELINE]},
        "selection": selection,
        "class_prior": [float(x) for x in prior],
        "holdout_predictions": holdout_predictions,
        "feature_columns": list(X_train.columns),
    }


# ---------------------------------------------------------------------------
# Model 2: Cox PH — response-duration survival, feeds the clearance curve
# ---------------------------------------------------------------------------
def fit_cox_ph(train: pd.DataFrame, holdout: pd.DataFrame) -> dict:
    # weather_condition is already in CATEGORICAL_COLS (100% coverage, no
    # filtering needed) — already a trained covariate here, moving every
    # predicted_clearance_min below. Volume is not, and can't just be added
    # to NUMERIC_COLS: accident_data starts 2021-12-31/2022-01-01, almost
    # exactly when volume tracking does, so coverage is now high (89.0% —
    # 19,076 of 21,428 incidents, verified) but not total, and Cox PH can't
    # fit through a NaN column.
    #
    # Rather than impute a guessed volume for those rows (fabricating a
    # feature value the incident never actually had) or drop them from every
    # model in this script (severity/secondary-risk don't need volume and
    # would lose real training data for no reason), the Cox regression is
    # fit and scored on the volume-covered subset only — a real train/test
    # split on the rows that genuinely have the feature, honestly reported
    # via cox_n/cox_coverage below rather than silently smaller. Holdout
    # rows outside that coverage simply get predicted_clearance_min=None:
    # an honest "can't score this one," not a value borrowed from a model
    # that never saw a comparable row. A row with no valid duration_min
    # (silver NULLed it — see build_features) is excluded from this fit for
    # the same reason: Cox PH cannot fit a NaN duration.
    cox_numeric_cols = NUMERIC_COLS + ["log_volume"]
    train_covered = train[train["volume"].notna() & train["duration_min"].notna()]
    holdout_covered = holdout[holdout["volume"].notna() & holdout["duration_min"].notna()]

    X_train = build_design_matrix(train_covered, numeric_cols=cox_numeric_cols)
    X_holdout_covered = build_design_matrix(holdout_covered, dummy_columns=list(X_train.columns), numeric_cols=cox_numeric_cols)

    cox_train = X_train.copy()
    cox_train["duration_min"] = train_covered["duration_min"].values
    # No censoring signal exists in this data (train_covered already requires
    # a valid duration_min, i.e. a real recorded site_cleared) — event=1
    # throughout. A genuinely open, not-yet-cleared incident would be the
    # honest place to introduce censoring, and there are none of those in a
    # historical training table.
    cox_train["event"] = 1.0

    cph = CoxPHFitter(penalizer=0.1)  # small L2 penalty: several one-hot columns are near-collinear (cause x type)
    cph.fit(cox_train, duration_col="duration_min", event_col="event")

    pred_median_covered = cph.predict_median(X_holdout_covered)
    # predict_median returns inf when a row's estimated survival never drops
    # below 0.5 within the observed follow-up window — falls back to that
    # row's expected value (still finite) rather than leaving an
    # unusable infinity in what gets written to the DB.
    pred_expectation_covered = cph.predict_expectation(X_holdout_covered)
    pred_clearance_covered = pred_median_covered.where(np.isfinite(pred_median_covered), pred_expectation_covered)
    # Reindexed back onto the FULL holdout (build_design_matrix keeps the
    # input's own index, so this lines up row-for-row) — every holdout row
    # gets a slot, volume-covered or not, which is what write_to_db's
    # positional loop over the full holdout requires; rows outside coverage
    # land as NaN here and become a null predicted_clearance_min there.
    pred_clearance = pred_clearance_covered.reindex(holdout.index)

    # A second per-row statistic alongside the median-based predicted_clearance
    # above: the model's own expected value (restricted mean survival time),
    # which integrates the whole fitted survival curve including its long
    # right tail instead of just locating the 50%-survival crossing point.
    # duration_min is heavily right-skewed (median ~4-5min, mean ~19-23min —
    # see the dashboard's clearance-panel reconciliation), so a median-based
    # per-row prediction and a mean-based one diverge sharply even though
    # both come from the exact same fitted cph. Reindexed the same way
    # pred_clearance is, so both land on the full holdout, covered rows or not.
    pred_mean_clearance = pred_expectation_covered.reindex(holdout.index)

    # ---- Scoring: the Cox model against two baselines on exactly the same holdout rows (10 Nov 2026) ----------
    # Scored rows = holdout incidents with a real duration and a real previous-week volume (to REAL_END_VOLUME).
    y_sc = holdout_covered["duration_min"].values.astype(float)
    cox_sc = pred_clearance_covered.reindex(holdout_covered.index).values.astype(float)
    levels = [["type_of_event", "main_cause"], ["type_of_event"]]
    preds_sc = {
        "CoxPH": cox_sc,
        "Constant training median (baseline)": np.full(len(y_sc), float(train_covered["duration_min"].median())),
        "Per type x cause median (baseline)": median_lookup(train_covered, holdout_covered, "duration_min", levels, MIN_GROUP_N),
    }
    means_sc = {
        "Constant training median (baseline)": np.full(len(y_sc), float(train_covered["duration_min"].mean())),
        "Per type x cause median (baseline)": median_lookup(train_covered, holdout_covered, "duration_min", levels,
                                                             MIN_GROUP_N, agg="mean"),
    }
    ok = np.isfinite(cox_sc)
    losses = {k: np.abs(v[ok] - y_sc[ok]) for k, v in preds_sc.items()}
    scores = {k: float(l.mean()) for k, l in losses.items()}
    baselines = [k for k in preds_sc if k.endswith("(baseline)")]
    sel = pick_champion(scores, baselines, holdout_covered["d"].values[ok], losses,
                        complexity={baselines[0]: 0, baselines[1]: 1, "CoxPH": 2}, block=BOOT_BLOCK_DAYS)
    # Test-set concordance (it was the TRAINING c-index): higher predicted duration should go with longer clearance.
    # The Cox model ranks by -partial hazard (no ties); baselines by their own lookups (ties count half).
    hazard = np.asarray(cph.predict_partial_hazard(X_holdout_covered)).ravel()
    concord = {"CoxPH": concordance_on(y_sc, -hazard)}
    for b in baselines:
        concord[b] = concordance_on(y_sc, preds_sc[b])
    clearance_eval = {
        "metric": "MAE (minutes)", "scores": scores, "concordance_test": concord, "n_scored": int(ok.sum()),
        "scored_window": [str(holdout_covered["d"].min().date()), str(holdout_covered["d"].max().date())],
        "volume_input": "mean daily volume of the 7 days before the incident, real volume only (to "
                        f"{REAL_END_VOLUME.date()})",
        **sel,
    }

    # What is served is the champion: the Cox prediction if it beats both baselines, else the better baseline
    # (median for predicted_clearance_min, the same group's training mean for predicted_clearance_mean_min).
    if not sel["champion_is_baseline"]:
        served = pred_clearance
        served_mean = pred_mean_clearance
    else:
        b = sel["champion"]
        served = pd.Series(preds_sc[b], index=holdout_covered.index).reindex(holdout.index)
        served_mean = pd.Series(means_sc[b], index=holdout_covered.index).reindex(holdout.index)

    finite_mask = np.isfinite(pred_clearance.values)
    mae = float(mean_absolute_error(
        holdout["duration_min"].values[finite_mask], pred_clearance.values[finite_mask]
    )) if finite_mask.any() else None
    mean_finite_mask = np.isfinite(served_mean.values)
    mean_clearance_minutes = float(np.mean(served_mean.values[mean_finite_mask])) if mean_finite_mask.any() else None
    cox_n = int(len(train_covered)) + int(len(holdout_covered))

    # Representative survival curves for the clearance-survival-curve
    # visualization: the corridor-wide baseline, plus one curve per severity
    # class and one per damage_to_property value. Built from the EMPIRICAL
    # data (Kaplan-Meier), not from the Cox model, and that choice is
    # load-bearing, not stylistic:
    #
    # A prior version of this script (over the old road/moto-crash source)
    # built each group's curve by averaging that group's covariates into one
    # "representative profile" and scoring THAT through
    # cph.predict_survival_function — a known statistical trap for a
    # non-linear model, caught there by cross-checking averaged-then-predicted
    # medians against the model's own per-row predict_median on real holdout
    # rows and against the exact raw (zero-censoring) medians: averaging first
    # was quietly wrong by tens of minutes. That risk is structural to Cox PH,
    # not specific to the old data, so the same fix carries forward here:
    # group curves are never routed through the regularized, collinear
    # covariate model. With event=1 on every row (no incident here is still
    # open), Kaplan-Meier collapses to the plain empirical survival function,
    # which is simple, exact by construction, and unaffected by whatever the
    # model's fit does elsewhere. The Cox model itself is untouched for what
    # it's actually suited to — the per-incident predicted_clearance_min
    # above, the concordance KPI, and the coefficient table — this only
    # changes how the DISPLAYED group curves are built.
    def empirical_curve(durations: np.ndarray) -> tuple[list[float], list[float]]:
        d = np.sort(durations)
        n = len(d)
        times = np.unique(d).tolist()
        survival = [float((d > t).sum() / n) for t in times]
        return times, survival

    def group_curve(mask: pd.Series, label: str, dimension: str) -> dict | None:
        subset = train.loc[mask, "duration_min"].values
        if len(subset) == 0:
            return None
        times, survival = empirical_curve(subset)
        # n travels with every curve, not just the crossed ones — the
        # crossed cells are the thinnest (as low as 25), but a reader
        # comparing across views has no way to know that unless every curve
        # states its own sample size, not only the ones that happen to need it.
        return {"group": label, "dimension": dimension, "times": times, "survival": survival, "n": int(len(subset))}

    base_times, base_survival = empirical_curve(train["duration_min"].values)
    curves = [{
        "group": "Baseline (average incident)", "dimension": "baseline",
        "times": base_times, "survival": base_survival, "n": int(len(train)),
    }]

    for code, label in SEVERITY_LABELS.items():
        c = group_curve(train["severity_code"] == code, label, "severity")
        if c:
            curves.append(c)

    # A second factor alongside severity — damage_to_property (NO/YES) — is a
    # real, verified clearance-time split in this data: median 4min (NO,
    # n=18,962) vs 12min (YES, n=2,466), mean 19.1 vs 50.9 (checked against
    # the live warehouse). weather_condition was checked too and ruled out
    # (Fair vs Rainy medians 5min vs 6min — not a real split), the same
    # "is this real" scrutiny that rules stalled vehicles out of this script
    # entirely (that table's response-time field is near-uniform random noise
    # over 0-8 minutes, not a genuine duration signal).
    for dmg, label in DAMAGE_LABELS.items():
        c = group_curve(train["damage_to_property"] == dmg, label, "damage_to_property")
        if c:
            curves.append(c)

    # Both factors crossed — 2 damage values x 3 severities. Smallest cross
    # cell in the full ingested dataset is n=15 (Property Damage x Fatal,
    # verified against the live warehouse) — thin, but real; n travels with
    # each curve's group label so the frontend can show it rather than let a
    # 15-incident curve read with the same implied confidence as a
    # thousands-incident one.
    for dmg, dmg_label in DAMAGE_LABELS.items():
        for code, sev_label in SEVERITY_LABELS.items():
            mask = (train["damage_to_property"] == dmg) & (train["severity_code"] == code)
            c = group_curve(mask, f"{dmg_label} — {sev_label}", "both")
            if c:
                curves.append(c)

    # Km position along the corridor — a fourth factor, rendered by the
    # frontend as a bar chart of each segment's median rather than more
    # overlaid survival curves (six "both" lines is already close to the
    # limit of what one chart can show).
    #
    # corridor_km, not raw km_value: km_value follows the Philippine DPWH
    # km-post convention (Balintawak ~ km 12), not this dashboard's
    # Balintawak-as-km-0 scale — see silver.nlex_accident_events_clean's own
    # corridor_km derivation (scripts/medallion/10-bronze-accident-breakdown.sql)
    # and the km-offset investigation that found this. Quantiling/labeling on
    # raw km_value here (the bug this replaces) produced "Km 12-34"-style
    # labels sitting ~12km off the exit list every other by-Km view on this
    # tab already reads from (SecondaryIncidentRiskPanel's By Exit/By Km,
    # corrected at read time in incident-severity.service.ts). This one can't
    # be corrected at read time the same way: the label is a formatted string
    # baked in at training time, not a live numeric column — so it's fixed
    # here instead, and the raw km_lo/km_hi bounds are now stored alongside
    # the label (see write_to_db) so a future convention change only needs a
    # read-time reformat, not another retrain.
    #
    # km_value is now near-continuous (946 distinct values across ~21K
    # accidents, verified — StartKM is recorded to the nearest 100m, not
    # snapped to coarse waypoints the way the old crash tables were), so
    # fixed-width bins would be a reasonable option here too; quantile bins
    # are kept anyway for the same guarantee they gave the old, coarser data
    # — equal INCIDENT COUNT per segment, unequal km width — so every segment
    # has comparable statistical power, and the label states the actual km
    # range each one covers so the unequal width is never hidden.
    KM_OFFSET = 12.0
    KM_QUANTILE_GROUPS = 4
    train_by_corridor_km = train.assign(corridor_km=train["km_value"] - KM_OFFSET).sort_values("corridor_km")
    n_train = len(train_by_corridor_km)
    group_size = n_train // KM_QUANTILE_GROUPS
    for i in range(KM_QUANTILE_GROUPS):
        lo = i * group_size
        hi = (i + 1) * group_size if i < KM_QUANTILE_GROUPS - 1 else n_train
        chunk = train_by_corridor_km.iloc[lo:hi]
        km_lo, km_hi = float(chunk["corridor_km"].min()), float(chunk["corridor_km"].max())
        mask = pd.Series(train.index.isin(chunk.index), index=train.index)
        c = group_curve(mask, f"Km {km_lo:.0f}–{km_hi:.0f}", "km")
        if c:
            c["km_lo"], c["km_hi"] = km_lo, km_hi
            curves.append(c)

    return {
        # On the TEST rows (it was cph.concordance_index_, the training-set figure, until 10 Nov 2026).
        "concordance_index": concord["CoxPH"],
        "concordance_index_train": float(cph.concordance_index_),
        "mae_minutes": mae,
        "clearance_eval": clearance_eval,
        "served_model": sel["champion"],
        "served_pred": served,
        "served_mean": served_mean,
        "n": int(ok.sum()),
        # The model now trains and scores on the volume-covered subset only
        # (see the doc comment at the top of this function) — cox_n/
        # cox_coverage_pct report that real, smaller sample honestly rather
        # than letting the headline "n" above imply the full holdout was used.
        "cox_n": cox_n,
        "cox_coverage_pct": float(cox_n / (len(train) + len(holdout)) * 100),
        "pred_clearance": pred_clearance,
        "pred_mean_clearance": pred_mean_clearance,
        "mean_clearance_minutes": mean_clearance_minutes,
        "curves": curves,
        "coefficients": cph.summary.reset_index().rename(columns={"index": "variable"}).to_dict("records"),
    }


# ---------------------------------------------------------------------------
# Model 3: Secondary incident risk — small logistic regression
# ---------------------------------------------------------------------------
def fit_secondary_risk(train: pd.DataFrame, holdout: pd.DataFrame) -> dict:
    # Purge: a training incident whose label window (its clearance + buffer) runs past the first holdout incident
    # was labelled with incidents from the test period. Those few rows are left out of the fit (10 Nov 2026).
    cut_time = holdout["event_start_date"].min()
    window_end = train["event_start_date"] + pd.to_timedelta(train["duration_min"].fillna(0) + SECONDARY_BUFFER_MIN, unit="m")
    purged = int((window_end >= cut_time).sum())
    train = train[window_end < cut_time]
    X_train = build_design_matrix(train)
    X_holdout = build_design_matrix(holdout, dummy_columns=list(X_train.columns))
    y_train, y_holdout = train["had_secondary"].astype(int).values, holdout["had_secondary"].astype(int).values

    Xtr_c = sm.add_constant(X_train, has_constant="add")
    Xho_c = sm.add_constant(X_holdout, has_constant="add")
    # A tiny ridge penalty (alpha 1e-4), not a plain sm.Logit MLE. The one-hot columns
    # include categories whose rows ALL have had_secondary = 0 (sub_cause_Environment,
    # type_of_event_Hit Animal, and one-row sub_causes such as Overspeeding/Electrical) —
    # perfect separation, so the unpenalised maximum-likelihood coefficient does not
    # exist. It "worked" before only because the optimiser ran that coefficient off to
    # about -92 and the Hessian happened to invert; when the ETL's km cap was raised
    # (2026-09-21, +320 training rows) it stopped inverting: LinAlgError, singular
    # matrix. The penalty makes the fit well-posed with no visible change in skill
    # (holdout AUC 0.6214 vs 0.6222 unpenalised on the pre-change data; 0.6203 on the
    # current data) and keeps every coefficient sane (min about -2.7).
    model = sm.GLM(y_train, Xtr_c, family=sm.families.Binomial()).fit_regularized(
        alpha=1e-4, L1_wt=0.0, maxiter=500
    )
    proba = np.asarray(model.predict(Xho_c))

    # AUC with a 95% interval, plus log-loss and Brier skill against the training base rate (the class prior,
    # which scores AUC 0.5 by construction) on the same holdout rows.
    rep = binary_report(y_holdout, proba, prior=float(y_train.mean()), clusters=holdout["d"].values, block=BOOT_BLOCK_DAYS)

    return {
        "auc": rep["auc"],
        "auc_ci": rep["auc_ci"],
        "log_loss_skill": rep["log_loss_skill"],
        "brier_skill": rep["brier_skill"],
        "positives": rep["positives"],
        "baseline": "training base rate (AUC 0.5)",
        "purged_train_rows": purged,
        "base_rate": float(y_holdout.mean()),
        "n": int(len(y_holdout)),
        "holdout_scores": proba,
    }


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------
def ensure_schema(conn, commit: bool = True) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE SCHEMA IF NOT EXISTS gold;

            CREATE TABLE IF NOT EXISTS gold.ml_incident_severity_predictions (
                id SERIAL PRIMARY KEY,
                incident_date DATE NOT NULL,
                reported_at TIMESTAMPTZ NOT NULL,
                km_value DOUBLE PRECISION NOT NULL,
                source TEXT NOT NULL,
                actual_severity_code INT NOT NULL,
                predicted_severity_code INT NOT NULL,
                severity_model TEXT NOT NULL,
                predicted_clearance_min DOUBLE PRECISION,
                secondary_incident_risk DOUBLE PRECISION,
                actual_had_secondary BOOLEAN,
                trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            -- The model's expected-value (restricted mean survival time)
            -- prediction, alongside predicted_clearance_min's median-based
            -- one — the dashboard's clearance panel shows both rather than
            -- letting one stand in for "the" predicted clearance time on a
            -- distribution where median and mean diverge sharply.
            ALTER TABLE gold.ml_incident_severity_predictions
                ADD COLUMN IF NOT EXISTS predicted_clearance_mean_min DOUBLE PRECISION;

            CREATE TABLE IF NOT EXISTS gold.ml_incident_survival_curve (
                id SERIAL PRIMARY KEY,
                group_label TEXT NOT NULL,
                time_min DOUBLE PRECISION NOT NULL,
                survival_probability DOUBLE PRECISION NOT NULL,
                trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            -- Which factor a curve is grouped by ('baseline' / 'severity' /
            -- 'damage_to_property' / 'km' / 'both') — lets the dashboard
            -- offer toggled views instead of every curve on one chart. Added
            -- via ALTER because the table predates the crossed curves; the
            -- dimension's own values changed from 'source' to
            -- 'damage_to_property' when this script moved to accident_data
            -- (see fit_cox_ph), which needed no schema change — dimension
            -- and group_label were already plain TEXT.
            ALTER TABLE gold.ml_incident_survival_curve
                ADD COLUMN IF NOT EXISTS dimension TEXT NOT NULL DEFAULT 'severity';

            -- How many incidents this one curve is built from — the 'both'
            -- (severity x damage_to_property) cross has cells as thin as 15,
            -- and a reader has no way to know that unless every curve states
            -- its own sample size.
            ALTER TABLE gold.ml_incident_survival_curve
                ADD COLUMN IF NOT EXISTS n INT;

            -- Raw numeric bounds for the 'km' dimension's quantile segments,
            -- alongside the formatted "Km {lo}-{hi}" group_label — so a future
            -- km-convention change (like the corridor_km fix this migration
            -- itself is) can be corrected by reformatting these numbers at
            -- read time instead of requiring another retrain. NULL for every
            -- non-'km' curve.
            ALTER TABLE gold.ml_incident_survival_curve
                ADD COLUMN IF NOT EXISTS km_lo DOUBLE PRECISION;
            ALTER TABLE gold.ml_incident_survival_curve
                ADD COLUMN IF NOT EXISTS km_hi DOUBLE PRECISION;

            CREATE TABLE IF NOT EXISTS gold.ml_incident_severity_metadata (
                id SERIAL PRIMARY KEY,
                metadata_json JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
    if commit:
        conn.commit()


def write_to_db(conn, holdout: pd.DataFrame, severity_out: dict, cox_out: dict,
                 secondary_out: dict, metadata: dict, dry: bool = False) -> None:
    ensure_schema(conn, commit=not dry)

    preds = severity_out["holdout_predictions"].reset_index(drop=True)
    # The SERVED clearance: the Cox model's when it beats both baselines, else the better baseline's (fit_cox_ph).
    clearance = cox_out["served_pred"].reset_index(drop=True)
    mean_clearance = cox_out["served_mean"].reset_index(drop=True)
    secondary_scores = secondary_out["holdout_scores"]
    actual_secondary = holdout["had_secondary"].reset_index(drop=True)

    def num(v):
        return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else float(v)

    rows = []
    for i in range(len(preds)):
        rows.append((
            preds.loc[i, "d"].date(), preds.loc[i, "event_start_date"], float(preds.loc[i, "km_value"]),
            preds.loc[i, "source"], int(preds.loc[i, "severity_code"]), int(preds.loc[i, "pred_champion"]),
            severity_out["champion"], num(clearance.iloc[i]), num(secondary_scores[i]), bool(actual_secondary.iloc[i]),
            num(mean_clearance.iloc[i]),
        ))

    with conn.cursor() as cur:
        cur.execute("DELETE FROM gold.ml_incident_severity_predictions")
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO gold.ml_incident_severity_predictions
               (incident_date, reported_at, km_value, source, actual_severity_code,
                predicted_severity_code, severity_model, predicted_clearance_min,
                secondary_incident_risk, actual_had_secondary, predicted_clearance_mean_min) VALUES %s""",
            rows,
        )

        cur.execute("DELETE FROM gold.ml_incident_survival_curve")
        curve_rows = [
            (c["group"], c["dimension"], t, s, c["n"], c.get("km_lo"), c.get("km_hi"))
            for c in cox_out["curves"]
            for t, s in zip(c["times"], c["survival"])
        ]
        psycopg2.extras.execute_values(
            cur,
            "INSERT INTO gold.ml_incident_survival_curve (group_label, dimension, time_min, survival_probability, n, km_lo, km_hi) VALUES %s",
            curve_rows,
        )

        cur.execute("DELETE FROM gold.ml_incident_severity_metadata")
        cur.execute("INSERT INTO gold.ml_incident_severity_metadata (metadata_json) VALUES (%s)",
                    [json.dumps(json_safe(metadata), default=str)])

    if dry:
        conn.rollback()
        print("DRY WRITE: every query ran, transaction rolled back — gold.* is unchanged")
    else:
        conn.commit()


def print_report(severity_out: dict, cox_out: dict, secondary_out: dict) -> str:
    L = []
    L.append("=" * 80)
    L.append("  INCIDENT SEVERITY / CLEARANCE MODELS (per-incident)")
    L.append("=" * 80)
    L.append("")
    L.append("  Severity — chronological holdout (selection on macro-F1; must also beat the class prior on log-loss)")
    rows = {**severity_out["metrics"], **severity_out["baseline"]}
    L.append(f"    {'model':<24}{'macroF1':>8}{'balAcc':>8}{'logloss':>9}{'LLskill':>9}{'Brier sk':>9}{'acc':>7}"
             f"   recall PDO/Inj/Fatal   predicted PDO/Inj/Fatal")
    for name, m in rows.items():
        tag = "  [SELECTED]" if name == severity_out["champion"] else ""
        pc = m["per_class"]
        rec = "/".join(f"{pc[c]['recall']:.2f}" for c in range(N_CLASSES))
        prd = "/".join(str(pc[c]["predicted"]) for c in range(N_CLASSES))
        L.append(f"    {name:<24}{m['macro_f1']:>8.3f}{m['balanced_accuracy']:>8.3f}{m['log_loss']:>9.4f}"
                 f"{m['log_loss_skill']:>9.4f}{m['brier_skill']:>9.4f}{m['accuracy']:>7.3f}   {rec:<22} {prd}{tag}")
    any_m = next(iter(rows.values()))
    sup = "/".join(str(any_m["per_class"][c]["support"]) for c in range(N_CLASSES))
    L.append(f"    holdout classes PDO/Injury/Fatal = {sup} (n={any_m['n']})")
    sel = severity_out["selection"]
    L.append(f"    eligible: {', '.join(sel['eligible']) or 'none'}")
    if "macro_f1_vs_prior_ci" in sel:
        lo, hi = sel["macro_f1_vs_prior_ci"]
        L.append(f"    champion - prior, macro-F1: 95% interval [{lo:+.3f}, {hi:+.3f}]")
        lo, hi = sel["log_loss_vs_prior_ci"]
        L.append(f"    champion - prior, log-loss: 95% interval [{lo:+.4f}, {hi:+.4f}] (negative = champion better)")
    if "macro_f1_vs_runner_up_ci" in sel:
        lo, hi = sel["macro_f1_vs_runner_up_ci"]
        L.append(f"    champion vs runner-up ({sel['runner_up']}), macro-F1: 95% interval [{lo:+.3f}, {hi:+.3f}]")
    if sel.get("note"):
        L.append(f"    note: {sel['note']}")
    L.append("")
    ce = cox_out["clearance_eval"]
    L.append("  Clearance time (site_cleared - event_start_date) — Cox PH vs baselines, same holdout rows")
    L.append(f"    scored: {ce['n_scored']} incidents {ce['scored_window'][0]}..{ce['scored_window'][1]} "
             f"(volume input = {ce['volume_input']})")
    for name, s in sorted(ce["scores"].items(), key=lambda kv: kv[1]):
        c = ce["concordance_test"].get(name)
        tag = "  [SERVED]" if name == ce["champion"] else ""
        L.append(f"    {name:<38} MAE={s:7.2f} min   test c-index={c:.3f}{tag}" if c is not None
                 else f"    {name:<38} MAE={s:7.2f} min{tag}")
    L.append(f"    best baseline: {ce['best_baseline']};  Cox vs best baseline MAE difference: {fmt_ci(ce.get('vs_baseline_ci'))}"
             if not ce["champion_is_baseline"] else
             f"    best baseline: {ce['best_baseline']} — the Cox model does not beat it, so the baseline is served")
    L.append(f"    Cox training c-index (for reference only) = {cox_out['concordance_index_train']:.3f}")
    L.append(f"    served mean-based avg = {cox_out['mean_clearance_minutes']:.2f} min"
             if cox_out["mean_clearance_minutes"] is not None else "    served mean-based avg = n/a")
    L.append(f"    trained+scored on = {cox_out['cox_n']} incidents with a real previous-week volume "
             f"({cox_out['cox_coverage_pct']:.1f}% of all incidents)")
    L.append("")
    L.append("  Secondary incident risk — logistic regression (baseline: the training base rate, AUC 0.5)")
    if secondary_out["auc"] is not None:
        ci = secondary_out["auc_ci"]
        L.append(f"    AUC       = {secondary_out['auc']:.3f}  95% interval [{ci[0]:.3f}, {ci[1]:.3f}]" if ci
                 else f"    AUC       = {secondary_out['auc']:.3f}")
    else:
        L.append("    AUC       = n/a")
    L.append(f"    log-loss skill = {secondary_out['log_loss_skill']:+.4f}   Brier skill = {secondary_out['brier_skill']:+.4f}  (vs the base rate)")
    L.append(f"    base rate = {secondary_out['base_rate'] * 100:.1f}% of holdout incidents had a secondary incident follow "
             f"({secondary_out['positives']} of {secondary_out['n']})")
    L.append(f"    {secondary_out['purged_train_rows']} training rows purged (their label window ran into the holdout)")
    L.append("=" * 80)
    return "\n".join(L)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-db", action="store_true")
    parser.add_argument("--dry-write", action="store_true")
    parser.add_argument("--dry-run", action="store_true",
                        help="train and report only; write nothing (no report file, read-only DB session)")
    args = parser.parse_args()
    if args.dry_run and (args.write_db or args.dry_write):
        sys.exit("--dry-run writes nothing; it cannot be combined with --write-db or --dry-write")

    conn = get_conn(readonly=args.dry_run)
    try:
        print("Loading accident events...")
        raw = load_incidents(conn)
        print(f"  {len(raw)} accidents (accident_data only; breakdown_data excluded — no severity data)")

        volume = load_daily_volume(conn)
        raw = raw.merge(volume, on="d", how="left")
        covered = int(raw["volume"].notna().sum())
        print(f"  {covered} of {len(raw)} incidents ({covered / len(raw) * 100:.1f}%) have a real previous-week "
              f"traffic volume (real volume ends {REAL_END_VOLUME.date()}) and can feed it into the Cox PH "
              f"clearance model below; the rest are excluded from that fit rather than backfilled with a guess")

        holidays = load_holidays(conn)
        feat = build_features(raw, holidays)

        print("Labeling secondary incidents (spatiotemporal self-join)...")
        feat["had_secondary"] = label_secondary_incidents(feat)
        print(f"  {feat['had_secondary'].sum()} of {len(feat)} incidents ({feat['had_secondary'].mean() * 100:.1f}%) "
              f"had another incident start within {SECONDARY_KM_RADIUS}km during their clearance window")

        cut = int(len(feat) * (1 - HOLDOUT_FRACTION))
        train, holdout = feat.iloc[:cut].reset_index(drop=True), feat.iloc[cut:].reset_index(drop=True)
        print(f"  train={len(train)} ({train['d'].min().date()}..{train['d'].max().date()})  "
              f"holdout={len(holdout)} ({holdout['d'].min().date()}..{holdout['d'].max().date()})")

        print("\nFitting severity models (Ordinal Logistic vs XGBoost)...")
        severity_out = fit_severity_models(train, holdout)

        print("Fitting Cox PH...")
        cox_out = fit_cox_ph(train, holdout)

        print("Fitting secondary-incident-risk logistic regression...")
        secondary_out = fit_secondary_risk(train, holdout)

        report = print_report(severity_out, cox_out, secondary_out)
        print("\n" + report)
        if args.dry_run:
            print("\n--dry-run: nothing written (no report file, no database rows).")
            return
        report_path = Path(__file__).resolve().parent / "model_results_severity.txt"
        report_path.write_text(report, encoding="utf-8")
        print(f"\nFull report written to {report_path}")

        if not args.write_db and not args.dry_write:
            print("\nTraining complete. Re-run with --write-db once you've reviewed the report above.")
            return

        metadata = {
            "severity": {"champion": severity_out["champion"], "metrics": severity_out["metrics"],
                         "baseline": severity_out["baseline"], "selection": severity_out["selection"],
                         "class_prior": severity_out["class_prior"],
                         "feature_columns": severity_out["feature_columns"]},
            "cox_ph": {"concordance_index": cox_out["concordance_index"],
                       "concordance_index_train": cox_out["concordance_index_train"],
                       "mae_minutes": cox_out["mae_minutes"],
                       "mean_clearance_minutes": cox_out["mean_clearance_minutes"],
                       "served_model": cox_out["served_model"], "clearance_eval": cox_out["clearance_eval"],
                       "n": cox_out["n"], "cox_n": cox_out["cox_n"], "cox_coverage_pct": cox_out["cox_coverage_pct"],
                       "coefficients": cox_out["coefficients"]},
            "secondary_risk": {k: secondary_out[k] for k in ("auc", "auc_ci", "log_loss_skill", "brier_skill",
                                                             "positives", "baseline", "purged_train_rows",
                                                             "base_rate", "n")},
            "secondary_km_radius": SECONDARY_KM_RADIUS,
            "secondary_buffer_min": SECONDARY_BUFFER_MIN,
            "holdout_fraction": HOLDOUT_FRACTION,
            "trained_at": pd.Timestamp.utcnow().isoformat(),
        }
        print("\nWriting gold.ml_incident_severity_predictions / ml_incident_survival_curve / ml_incident_severity_metadata...")
        write_to_db(conn, holdout, severity_out, cox_out, secondary_out, metadata,
                    dry=args.dry_write and not args.write_db)
        print("Rolled back (dry write)." if (args.dry_write and not args.write_db) else "Committed.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
