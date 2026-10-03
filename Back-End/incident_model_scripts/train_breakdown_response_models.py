#!/usr/bin/env python3
"""
SmartFlow NLEX — Breakdown Dispatch Response-Time Model
=========================================================
Per-DEPLOYMENT model: predicts how long a dispatched unit (AAP, Patrol
Vehicle, RAMFA, etc.) takes to respond to a breakdown, from pre-dispatch
context (cause, service, corridor position, time, traffic volume) alone.

This is the trained-model counterpart to the Descriptive tab's Response Time
Breakdown card (getEventBreakdownFromDb / /api/incident/event-breakdown),
which reports the same two groupings (by cause, by service) but as measured
history only — no model behind it. This script adds the "predicted" half:
an Actual-vs-Predicted median response time per group, the same shape the
severity pipeline already reports for Actual-vs-Predicted severity counts
(train_incident_severity_models.py's fit_severity_models).

Data source: breakdown_data (silver.nlex_breakdown_events_clean) only —
accident_data carries no dispatch/response records at all (accidents have no
per-dispatch log; see incident.service.ts's avgTimeToFirstResponder comment).
The grain here is one row per DEPLOYMENT, not per breakdown event: a single
breakdown can carry several deployments (AAP + Patrol Vehicle + RAMFA all
sent to the same event), each with its own response_time_min, so the event
and its deployments are not interchangeable rows.

Two duration models compete on predicting a deployment's response_time_min,
the same "let two candidates compete, report both" convention
fit_severity_models uses:
  1. Cox Proportional Hazards — survival-analyses response_time_min the same
     way fit_cox_ph analyses accident clearance_min. Its predict_median is
     also what a future "response time still open" curve would read from,
     if this card ever grows one.
  2. XGBoost (regression) — a plain gradient-boosted regressor on the same
     design matrix, predicting response_time_min directly rather than
     through a survival likelihood.
Champion = whichever holds up better (lower MAE) on a chronological holdout.

No weather covariate: unlike accident_data, breakdown_data carries no
weather_condition column at all (verified against
scripts/medallion/10-bronze-accident-breakdown.sql's silver.
nlex_breakdown_events_clean projection) — there's nothing to include even if
weather turned out to matter here the way it does for accident clearance.

Usage:
    python train_breakdown_response_models.py                  # train + report only
    python train_breakdown_response_models.py --write-db        # + write to gold.*
    python train_breakdown_response_models.py --dry-write        # rehearse the write, then roll back
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
from dotenv import load_dotenv
from lifelines import CoxPHFitter
from sklearn.metrics import mean_absolute_error, r2_score
from xgboost import XGBRegressor

SEED = 42
# Same chronological "score on the most recent slice" protocol as
# train_incident_severity_models.py's default.
HOLDOUT_FRACTION = 0.2
# How many of the most frequent cause/service groups get their own reported
# row — an evidence cutoff, not a round number, same reasoning
# fit_cox_ph's KM_QUANTILE_GROUPS documents: main_cause/service both carry a
# long tail of rare values, and a group with a handful of deployments behind
# it is a weak basis for an Actual-vs-Predicted comparison. 8 keeps the
# reported table readable while still covering the groups this dashboard's
# own Response Time Breakdown card already shows top-10 of.
TOP_N_GROUPS = 8


def set_all_seeds(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)


def json_safe(obj):
    """Postgres's JSONB rejects the literal tokens Infinity/-Infinity/NaN
    that Python's json.dumps happily emits for non-finite floats — Python's
    json module is permissive there by default, JSON the spec is not. Hit in
    practice here: cph.summary's -log2(p) column (part of metadata's
    coefficients table below) is genuinely Infinity whenever a coefficient's
    p-value underflows to exactly 0.0, which a large-n, strongly-significant
    coefficient does. Walks the whole metadata tree and nulls only the
    non-finite values, rather than dropping the coefficient row or column
    entirely."""
    if isinstance(obj, float):
        return obj if np.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [json_safe(v) for v in obj]
    return obj


set_all_seeds()
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def get_conn():
    """Mirrors train_incident_severity_models.py's get_conn() — kept in sync by hand."""
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
    return psycopg2.connect(dsn, sslmode="require")


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
# One row per (breakdown event, deployment) pair via jsonb_array_elements —
# the same lateral-join shape incident-events.service.ts's
# getEventBreakdownFromDb already uses for its own by-service/by-cause
# stats, so this script's training population matches what the descriptive
# card's own numbers are built from. The response_time_min validity cap
# (0-1440, NULLing not dropping the *record*, but excluded here since a Cox
# PH duration can't be NULL) mirrors that same service's RESPONSE_MIN guard —
# 6 of 51,082 deployment records there carry data-entry-corrupt values in the
# millions, not real durations.
POOLED_DEPLOYMENTS_SQL = """
    SELECT b.event_number, b.event_encoded_date, b.event_encoded_date::date AS d,
           b.main_cause, b.km_value,
           dep->>'service' AS service,
           NULLIF(dep->>'response_time_min', '')::numeric AS response_time_min
    FROM silver.nlex_breakdown_events_clean b, jsonb_array_elements(b.deployments) dep
    WHERE b.event_encoded_date IS NOT NULL AND b.km_value IS NOT NULL
      AND b.main_cause IS NOT NULL
      AND dep->>'service' IS NOT NULL
      AND NULLIF(dep->>'response_time_min', '')::numeric BETWEEN 0 AND 1440
"""


def load_holidays(conn) -> set:
    df = pd.read_sql("SELECT date_day FROM dim_holiday WHERE is_holiday", conn)
    return set(pd.to_datetime(df["date_day"]).dt.date)


def load_deployments(conn) -> pd.DataFrame:
    df = pd.read_sql(POOLED_DEPLOYMENTS_SQL, conn)
    df["d"] = pd.to_datetime(df["d"])
    return df


# split_label = '80_20': same gold.ml_predictive_volume convention
# train_incident_severity_models.py's load_daily_volume already documents —
# kept in sync by hand.
DAILY_VOLUME_SQL = """
    SELECT forecast_date AS d, actual_volume::float AS volume
    FROM gold.ml_predictive_volume
    WHERE actual_volume IS NOT NULL AND split_label = '80_20'
    ORDER BY 1
"""


def load_daily_volume(conn) -> pd.DataFrame:
    df = pd.read_sql(DAILY_VOLUME_SQL, conn)
    df["d"] = pd.to_datetime(df["d"])
    return df


# ---------------------------------------------------------------------------
# Feature/label construction
# ---------------------------------------------------------------------------
def build_features(df: pd.DataFrame, holidays: set) -> pd.DataFrame:
    out = df.copy()

    # Cox PH's log-hazard blows up at exactly zero, same floor
    # train_incident_severity_models.py's duration_min uses.
    out["duration_min"] = out["response_time_min"].clip(lower=0.5)
    out["event_encoded_date"] = pd.to_datetime(out["event_encoded_date"])
    out["hour_of_day"] = out["event_encoded_date"].dt.hour
    out["corridor_km"] = out["km_value"] - 12.0  # Balintawak-relative, see silver's own derivation

    out["log_volume"] = np.log1p(out["volume"])

    dow = out["d"].dt.dayofweek
    doy = out["d"].dt.dayofyear
    out["dow"] = dow
    out["is_weekend"] = dow.isin([5, 6]).astype(int)
    out["is_holiday"] = out["d"].dt.date.map(lambda x: int(x in holidays))
    out["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    out["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)

    # Sorted by event time, THEN by event_number so multiple deployments of
    # the very same breakdown stay adjacent — load-bearing for the
    # event-grouped holdout split below, not just tidiness.
    return out.sort_values(["event_encoded_date", "event_number"]).reset_index(drop=True)


CATEGORICAL_COLS = ["main_cause", "service"]
NUMERIC_COLS = ["corridor_km", "hour_of_day", "dow", "is_weekend", "is_holiday", "doy_sin", "doy_cos", "log_volume"]


def build_design_matrix(
    df: pd.DataFrame, dummy_columns: list[str] | None = None
) -> pd.DataFrame:
    """Pre-dispatch-context features only. `dummy_columns` pins the one-hot
    column set (fit on train, reindexed onto holdout) so a cause/service
    category absent from one split can't silently shift every other column's
    position in X — same contract as train_incident_severity_models.py's own
    build_design_matrix."""
    X = pd.get_dummies(df[CATEGORICAL_COLS], drop_first=True)
    X = pd.concat([df[NUMERIC_COLS], X], axis=1)
    X = X.astype(float)
    if dummy_columns is not None:
        X = X.reindex(columns=dummy_columns, fill_value=0.0)
    return X


def event_grouped_holdout_split(df: pd.DataFrame, holdout_fraction: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Same chronological holdout protocol as every other script in this
    pipeline, but cut on the EVENT boundary, not the row boundary: a
    breakdown's several deployments (AAP + Patrol Vehicle + RAMFA, all sent
    to the same event) would otherwise straddle the train/holdout cut,
    letting the model see one deployment of an event during training and get
    scored on a sibling deployment of that same event during holdout — an
    easier, leakier task than scoring on a genuinely unseen event. df is
    already sorted by (event_encoded_date, event_number) (build_features'
    last step), so the events in first-seen order double as a chronological
    event list to cut."""
    event_order = df["event_number"].drop_duplicates().reset_index(drop=True)
    cut = int(len(event_order) * (1 - holdout_fraction))
    train_events = set(event_order.iloc[:cut])
    is_train = df["event_number"].isin(train_events)
    return df[is_train].reset_index(drop=True), df[~is_train].reset_index(drop=True)


# ---------------------------------------------------------------------------
# Model: Cox PH vs XGBoost regression on response_time_min
# ---------------------------------------------------------------------------
def fit_cox_ph(train: pd.DataFrame, holdout: pd.DataFrame) -> dict:
    # Same volume-coverage-subset fit train_incident_severity_models.py's
    # fit_cox_ph uses: volume tracking starts 2022-01-01, breakdown_data runs
    # further back than that, so log_volume is NaN on the earliest rows —
    # fit and scored on the volume-covered subset only, honestly reported via
    # cox_n/cox_coverage_pct rather than silently smaller.
    train_covered = train[train["volume"].notna()]
    holdout_covered = holdout[holdout["volume"].notna()]

    X_train = build_design_matrix(train_covered)
    X_holdout_covered = build_design_matrix(holdout_covered, dummy_columns=list(X_train.columns))

    cox_train = X_train.copy()
    cox_train["duration_min"] = train_covered["duration_min"].values
    # No censoring: every deployment in this table has a logged
    # response_time_min by construction (the SQL filter above requires it),
    # so there is no "still waiting" row to censor.
    cox_train["event"] = 1.0

    cph = CoxPHFitter(penalizer=0.1)
    cph.fit(cox_train, duration_col="duration_min", event_col="event")

    pred_median_covered = cph.predict_median(X_holdout_covered)
    pred_expectation_covered = cph.predict_expectation(X_holdout_covered)
    pred_median_covered = pred_median_covered.where(np.isfinite(pred_median_covered), pred_expectation_covered)

    pred_median = pred_median_covered.reindex(holdout.index)
    pred_mean = pred_expectation_covered.reindex(holdout.index)

    finite_mask = np.isfinite(pred_median.values)
    mae = float(mean_absolute_error(
        holdout["duration_min"].values[finite_mask], pred_median.values[finite_mask]
    )) if finite_mask.any() else None
    cox_n = int(len(train_covered)) + int(len(holdout_covered))

    return {
        "concordance_index": float(cph.concordance_index_),
        "mae_minutes": mae,
        "n": int(len(holdout)),
        "cox_n": cox_n,
        "cox_coverage_pct": float(cox_n / (len(train) + len(holdout)) * 100),
        "pred_median": pred_median,
        "pred_mean": pred_mean,
        "coefficients": cph.summary.reset_index().rename(columns={"index": "variable"}).to_dict("records"),
    }


def fit_xgb_regressor(train: pd.DataFrame, holdout: pd.DataFrame) -> dict:
    """The Cox PH model's challenger — same design matrix, no volume-coverage
    restriction (XGBoost has no trouble with the full column set; log_volume
    simply carries NaN for the pre-2022 rows and the tree splits around it),
    predicting duration_min directly rather than through a survival
    likelihood."""
    X_train = build_design_matrix(train)
    X_holdout = build_design_matrix(holdout, dummy_columns=list(X_train.columns))
    y_train, y_holdout = train["duration_min"].values, holdout["duration_min"].values

    model = XGBRegressor(
        n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.9,
        colsample_bytree=0.9, objective="reg:squarederror", random_state=SEED,
    )
    model.fit(X_train, y_train)
    pred = model.predict(X_holdout)

    return {
        "mae_minutes": float(mean_absolute_error(y_holdout, pred)),
        "r2": float(r2_score(y_holdout, pred)),
        "n": int(len(holdout)),
        "pred": pd.Series(pred, index=holdout.index),
    }


def group_actual_vs_predicted(holdout: pd.DataFrame, pred_median: pd.Series, group_col: str, top_n: int) -> list[dict]:
    """Actual vs Predicted median response minutes, by whichever of
    main_cause/service `group_col` names — the same Actual/Predicted shape
    train_incident_severity_models.py's fit_severity_models reports for
    severity counts, adapted to a continuous duration: median (not mean) of
    both actual and predicted, since response_time_min is right-skewed the
    same way clearance_min is (see fit_cox_ph's own median-vs-mean doc
    comment) and a mean would be dragged by the same long tail.
    Top-N by evidence, matching TOP_N_GROUPS's own doc comment."""
    top_groups = holdout[group_col].value_counts().head(top_n).index.tolist()
    rows = []
    for g in top_groups:
        mask = holdout[group_col] == g
        actual = holdout.loc[mask, "duration_min"]
        predicted = pred_median.loc[holdout.index[mask]].dropna()
        rows.append({
            "group": g,
            "n": int(mask.sum()),
            "actual_median_min": float(actual.median()) if len(actual) else None,
            "predicted_median_min": float(predicted.median()) if len(predicted) else None,
        })
    return rows


# ---------------------------------------------------------------------------
# Survival curves — baseline + top-N by cause, top-N by service
# ---------------------------------------------------------------------------
def empirical_curve(durations: np.ndarray) -> tuple[list[float], list[float]]:
    """Kaplan-Meier with no censoring collapses to the plain empirical
    survival function — same choice, same reasoning, as
    train_incident_severity_models.py's fit_cox_ph.empirical_curve (see its
    doc comment for why group curves are never routed through the
    regularized, collinear Cox model itself)."""
    d = np.sort(durations)
    n = len(d)
    times = np.unique(d).tolist()
    survival = [float((d > t).sum() / n) for t in times]
    return times, survival


def build_curves(train: pd.DataFrame, top_n: int) -> list[dict]:
    def group_curve(mask: pd.Series, label: str, dimension: str) -> dict | None:
        subset = train.loc[mask, "duration_min"].values
        if len(subset) == 0:
            return None
        times, survival = empirical_curve(subset)
        return {"group": label, "dimension": dimension, "times": times, "survival": survival, "n": int(len(subset))}

    base_times, base_survival = empirical_curve(train["duration_min"].values)
    curves = [{
        "group": "Baseline (average dispatch)", "dimension": "baseline",
        "times": base_times, "survival": base_survival, "n": int(len(train)),
    }]

    for cause in train["main_cause"].value_counts().head(top_n).index:
        c = group_curve(train["main_cause"] == cause, cause, "cause")
        if c:
            curves.append(c)

    for service in train["service"].value_counts().head(top_n).index:
        c = group_curve(train["service"] == service, service, "service")
        if c:
            curves.append(c)

    return curves


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------
def ensure_schema(conn, commit: bool = True) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE SCHEMA IF NOT EXISTS gold;

            CREATE TABLE IF NOT EXISTS gold.ml_breakdown_response_predictions (
                id SERIAL PRIMARY KEY,
                event_number INT NOT NULL,
                event_date DATE NOT NULL,
                reported_at TIMESTAMPTZ NOT NULL,
                main_cause TEXT NOT NULL,
                service TEXT NOT NULL,
                actual_response_min DOUBLE PRECISION NOT NULL,
                predicted_response_min DOUBLE PRECISION,
                predicted_response_mean_min DOUBLE PRECISION,
                response_model TEXT NOT NULL,
                trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS gold.ml_breakdown_response_curve (
                id SERIAL PRIMARY KEY,
                group_label TEXT NOT NULL,
                dimension TEXT NOT NULL,
                time_min DOUBLE PRECISION NOT NULL,
                survival_probability DOUBLE PRECISION NOT NULL,
                n INT,
                trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS gold.ml_breakdown_response_group_stats (
                id SERIAL PRIMARY KEY,
                dimension TEXT NOT NULL,
                group_label TEXT NOT NULL,
                n INT NOT NULL,
                actual_median_min DOUBLE PRECISION,
                predicted_median_min DOUBLE PRECISION,
                trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS gold.ml_breakdown_response_metadata (
                id SERIAL PRIMARY KEY,
                metadata_json JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
    if commit:
        conn.commit()


def write_to_db(conn, holdout: pd.DataFrame, champion: str, cox_out: dict, xgb_out: dict,
                 group_by_cause: list[dict], group_by_service: list[dict], curves: list[dict],
                 metadata: dict, dry: bool = False) -> None:
    ensure_schema(conn, commit=not dry)

    holdout = holdout.reset_index(drop=True)
    champion_pred = (cox_out["pred_median"] if champion == "CoxPH" else xgb_out["pred"]).reset_index(drop=True)
    # Mean-based figure alongside the median-based one only exists for Cox PH
    # (predict_expectation vs predict_median, same duality
    # train_incident_severity_models.py's clearance columns use) — XGBoost's
    # regression is a single point estimate with no separate mean variant,
    # so this column is honestly null rather than borrowing Cox's number
    # when XGBoost is champion.
    cox_mean = cox_out["pred_mean"].reset_index(drop=True) if champion == "CoxPH" else None

    def num(v):
        return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else float(v)

    rows = []
    for i in range(len(holdout)):
        rows.append((
            int(holdout.loc[i, "event_number"]), holdout.loc[i, "d"].date(), holdout.loc[i, "event_encoded_date"],
            holdout.loc[i, "main_cause"], holdout.loc[i, "service"], float(holdout.loc[i, "duration_min"]),
            num(champion_pred.iloc[i]), num(cox_mean.iloc[i]) if cox_mean is not None else None,
            champion,
        ))

    with conn.cursor() as cur:
        cur.execute("DELETE FROM gold.ml_breakdown_response_predictions")
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO gold.ml_breakdown_response_predictions
               (event_number, event_date, reported_at, main_cause, service, actual_response_min,
                predicted_response_min, predicted_response_mean_min, response_model) VALUES %s""",
            rows,
        )

        cur.execute("DELETE FROM gold.ml_breakdown_response_curve")
        curve_rows = [
            (c["group"], c["dimension"], t, s, c["n"])
            for c in curves
            for t, s in zip(c["times"], c["survival"])
        ]
        psycopg2.extras.execute_values(
            cur,
            "INSERT INTO gold.ml_breakdown_response_curve (group_label, dimension, time_min, survival_probability, n) VALUES %s",
            curve_rows,
        )

        cur.execute("DELETE FROM gold.ml_breakdown_response_group_stats")
        stats_rows = [
            (dim, r["group"], r["n"], r["actual_median_min"], r["predicted_median_min"])
            for dim, group in [("cause", group_by_cause), ("service", group_by_service)]
            for r in group
        ]
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO gold.ml_breakdown_response_group_stats
               (dimension, group_label, n, actual_median_min, predicted_median_min) VALUES %s""",
            stats_rows,
        )

        cur.execute("DELETE FROM gold.ml_breakdown_response_metadata")
        cur.execute("INSERT INTO gold.ml_breakdown_response_metadata (metadata_json) VALUES (%s)",
                    [json.dumps(json_safe(metadata), default=str)])

    if dry:
        conn.rollback()
        print("DRY WRITE: every query ran, transaction rolled back — gold.* is unchanged")
    else:
        conn.commit()


def print_report(champion: str, cox_out: dict, xgb_out: dict, group_by_cause: list[dict], group_by_service: list[dict]) -> str:
    L = []
    L.append("=" * 80)
    L.append("  BREAKDOWN DISPATCH RESPONSE-TIME MODEL (per-deployment)")
    L.append("=" * 80)
    L.append("")
    L.append("  Cox PH — response-time survival")
    L.append(f"    concordance index = {cox_out['concordance_index']:.3f}")
    L.append(f"    MAE (minutes)     = {cox_out['mae_minutes']:.2f}" if cox_out["mae_minutes"] is not None else "    MAE (minutes)     = n/a")
    L.append(f"    n (holdout)       = {cox_out['n']}")
    L.append(f"    trained+scored on = {cox_out['cox_n']} deployments with known daily volume ({cox_out['cox_coverage_pct']:.1f}%)")
    L.append(f"    {'[SELECTED]' if champion == 'CoxPH' else ''}")
    L.append("")
    L.append("  XGBoost regression — response-time")
    L.append(f"    MAE (minutes) = {xgb_out['mae_minutes']:.2f}")
    L.append(f"    R^2           = {xgb_out['r2']:.3f}")
    L.append(f"    n (holdout)   = {xgb_out['n']}")
    L.append(f"    {'[SELECTED]' if champion == 'XGBoost' else ''}")
    L.append("")
    L.append("  Actual vs Predicted median response (min), by cause")
    for r in group_by_cause:
        L.append(f"    {r['group']:<28} actual={r['actual_median_min']}  predicted={r['predicted_median_min']}  n={r['n']}")
    L.append("")
    L.append("  Actual vs Predicted median response (min), by service")
    for r in group_by_service:
        L.append(f"    {r['group']:<28} actual={r['actual_median_min']}  predicted={r['predicted_median_min']}  n={r['n']}")
    L.append("=" * 80)
    return "\n".join(L)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-db", action="store_true")
    parser.add_argument("--dry-write", action="store_true")
    args = parser.parse_args()

    conn = get_conn()
    try:
        print("Loading breakdown deployments...")
        raw = load_deployments(conn)
        print(f"  {len(raw)} deployment records across {raw['event_number'].nunique()} breakdown events")

        volume = load_daily_volume(conn)
        raw = raw.merge(volume, on="d", how="left")
        covered = int(raw["volume"].notna().sum())
        print(f"  {covered} of {len(raw)} deployments ({covered / len(raw) * 100:.1f}%) fall on a date with known "
              f"traffic volume (tracking starts {volume['d'].min().date()})")

        holidays = load_holidays(conn)
        feat = build_features(raw, holidays)

        train, holdout = event_grouped_holdout_split(feat, HOLDOUT_FRACTION)
        print(f"  train={len(train)} deployments / {train['event_number'].nunique()} events  "
              f"holdout={len(holdout)} deployments / {holdout['event_number'].nunique()} events")

        print("\nFitting Cox PH...")
        cox_out = fit_cox_ph(train, holdout)

        print("Fitting XGBoost regressor...")
        xgb_out = fit_xgb_regressor(train, holdout)

        cox_mae = cox_out["mae_minutes"] if cox_out["mae_minutes"] is not None else float("inf")
        champion = "CoxPH" if cox_mae <= xgb_out["mae_minutes"] else "XGBoost"
        champion_pred = cox_out["pred_median"] if champion == "CoxPH" else xgb_out["pred"]

        group_by_cause = group_actual_vs_predicted(holdout, champion_pred, "main_cause", TOP_N_GROUPS)
        group_by_service = group_actual_vs_predicted(holdout, champion_pred, "service", TOP_N_GROUPS)
        curves = build_curves(train, TOP_N_GROUPS)

        report = print_report(champion, cox_out, xgb_out, group_by_cause, group_by_service)
        print("\n" + report)
        report_path = Path(__file__).resolve().parent / "model_results_breakdown_response.txt"
        report_path.write_text(report, encoding="utf-8")
        print(f"\nFull report written to {report_path}")

        if not args.write_db and not args.dry_write:
            print("\nTraining complete. Re-run with --write-db once you've reviewed the report above.")
            return

        metadata = {
            "champion": champion,
            "cox_ph": {"concordance_index": cox_out["concordance_index"], "mae_minutes": cox_out["mae_minutes"],
                       "n": cox_out["n"], "cox_n": cox_out["cox_n"], "cox_coverage_pct": cox_out["cox_coverage_pct"],
                       "coefficients": cox_out["coefficients"]},
            "xgboost": {"mae_minutes": xgb_out["mae_minutes"], "r2": xgb_out["r2"], "n": xgb_out["n"]},
            "top_n_groups": TOP_N_GROUPS,
            "holdout_fraction": HOLDOUT_FRACTION,
            "trained_at": pd.Timestamp.utcnow().isoformat(),
        }
        print("\nWriting gold.ml_breakdown_response_predictions / _curve / _group_stats / _metadata...")
        write_to_db(conn, holdout, champion, cox_out, xgb_out, group_by_cause, group_by_service, curves,
                    metadata, dry=args.dry_write and not args.write_db)
        print("Rolled back (dry write)." if (args.dry_write and not args.write_db) else "Committed.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
