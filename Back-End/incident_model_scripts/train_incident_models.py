#!/usr/bin/env python3
"""
SmartFlow NLEX — daily incident forecast: protocol selection, served refit, and the dashboard tables
=====================================================================================================
Since 10 Nov 2026 the candidates are tested ONLY under EVALUATION_PROTOCOL.md
(smartflow_scripts/3_training_testing), by incident_study.py in this folder:

  * 26 rolling origins, one every 14 days across the 52 weeks to 2026-05-24 (the last day of real traffic volume),
    each model refitted on the days before the origin and forecasting all 90 days recursively, as it is served;
  * volume enters as the traffic study's own out-of-sample forecast from the same origin, never actual volume;
  * observed rain only for days 1-14 (upper bound), the weather-free twin after;
  * three baselines (last week, weekday average, last year scaled), MAE per bucket (1-14, 15-30, 31-60, 61-90);
  * champion = rolling_eval.select_champion(metric="mae"): lowest mean bucket MAE among the models that beat the
    best baseline overall AND on days 1-14, with a moving-block bootstrap; the simpler model wins a tie. If none
    qualifies, the best baseline is served and the metadata says so.

What this script does with that study:
  1. reads the study for the series (_work/cache/incident_study_{series}.csv/.json). If there is none, or it was made
     from different data than the record holds now (its fingerprint must match), the study is run here first, so a
     champion is never chosen from a test of other data. The study reads the traffic study's forecasts
     (traffic_volume/traffic_study.py), which must be current too;
  2. prints the protocol table and the champion, and writes model_results[_accident].txt;
  3. with --write-db (or --dry-run, which runs every query and rolls back):
       - refits the champion and the dashboard's candidates on ALL allowed data (every recorded incident day; for a
         volume-aware model, training rows only where volume is real, i.e. to 2026-05-24) and forecasts the 90 days
         after the record. Volume for those days is the traffic champion's forecast refitted on the real traffic
         record (what the protocol serves for traffic), not the actual volume and not a stale published column.
         No real weather forecast covers days that far back, so every served future day comes from the
         weather-free form, exactly as the study tests days 15-90;
       - writes the Present band ('validation' rows) as the days 1-14 forecasts of the 26 rolling origins, which
         tile 2025-05-26..2026-05-24 without overlap, so the band and the metrics describe the same forecasts;
       - writes ml_daily_actuals, ml_predictive_incidents, ml_training_metadata (and, for the blended series,
         ml_incident_horizon_accuracy: the champion's per-bucket accuracy from the same study) in ONE transaction.

The old one-day-ahead holdout is gone: it fed every day the ACTUAL same-day volume and the actual previous count, so
it described a forecast nobody is shown (it scored the served model at R2 0.36 while the 90-day forecast it served
sat at ~100/day against 128-134 recorded). SARIMAX, the only candidate it scored many steps ahead, is now on the same
footing as the rest.

Usage (from this folder):
    python -u train_incident_models.py                          select + print only (reads the cached study)
    python -u train_incident_models.py --run-study               re-run the study first (hours; faster as parallel
                                                                 groups: incident_study.py --group ... then --merge)
    python -u train_incident_models.py --dry-run                 + refit, build every row, write, ROLL BACK
    python -u train_incident_models.py --write-db                + commit (blended series)
    python -u train_incident_models.py --write-db --series accident
Flags kept for the weekly batch but no longer meaningful under the protocol (accepted, reported, ignored):
--protocol, --holdout-days, --select-by, --volume-mode, --train-years, --extra-candidates.
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
# oneDNN's own startup warning says its custom ops can vary numerically between runs depending on computation
# order — disabled for the reproducibility the fixed seeds below are meant to give.
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import psycopg2  # noqa: E402
import psycopg2.extras  # noqa: E402
import requests  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

SEED = 42
# The served forecast's length: the dashboard's Future control offers up to 3 months, and the study scores every
# one of these 90 days (buckets 1-14, 15-30, 31-60, 61-90), so each stretch carries its own measured accuracy.
FUTURE_DAYS = 90

# Days left out of SCORING — never out of the series. The day stays in ml_daily_actuals as the 0 the source implies
# (so the chart shows exactly what silver holds); as a model INPUT it is filled from the same weekday of the four
# weeks before it and it is never a training target (incident_study.py). Each entry is written to
# metadata.evaluation.excluded_from_scoring, which the dashboard's live accuracy table also reads
# (incident.service.ts), so the trainer and the UI cannot disagree about which days were scored.
EVAL_EXCLUDED_DAYS: dict[str, str] = {
    "2026-04-19": (
        "Suspected data gap, not a real zero: silver.nlex_accident_events_clean and "
        "silver.nlex_breakdown_events_clean both hold no rows for this ordinary Sunday, "
        "while every other day since 2022-01-01 has events. Excluded from evaluation; "
        "the value was not imputed."
    ),
}

# The seven candidate families the dashboard has columns for (INCIDENT_MODELS in src/services/incident.service.ts).
MODEL_NAMES = ["XGBoost", "RandomForest", "Poisson_GLM", "NegBinomial_GLM", "SARIMAX", "LSTM", "GRU"]

# Daily incident counts from the client's own accident/breakdown event exports, matching EVENTS_CTE in
# src/services/incident.service.ts, so the forecast counts the same incidents the descriptive dashboard and the
# severity/clearance models (train_incident_severity_models.py) do (~178,700 events, 2022-01-01..2026-06-30).
DAILY_COUNTS_SQL = """
    WITH all_incidents AS (
        SELECT event_start_date::date AS d FROM silver.nlex_accident_events_clean
        WHERE event_start_date IS NOT NULL
        UNION ALL
        SELECT event_encoded_date::date AS d FROM silver.nlex_breakdown_events_clean
        WHERE event_encoded_date IS NOT NULL
    )
    SELECT d, COUNT(*)::float AS total
    FROM all_incidents
    GROUP BY 1
    ORDER BY 1
"""

# --series accident: the same forecast, fitted on accidents alone. Accidents are ~12% of the daily count, so a fit
# optimised for the blended count is optimised for breakdowns; the accident series gets its own study and champion.
# Breakdowns have no series of their own: the dashboard derives them as blended total - accident.
ACCIDENT_DAILY_COUNTS_SQL = """
    SELECT event_start_date::date AS d, COUNT(*)::float AS total
    FROM silver.nlex_accident_events_clean
    WHERE event_start_date IS NOT NULL
    GROUP BY 1
    ORDER BY 1
"""

# Output-table suffix: "" for the blended series (the original tables, which every existing reader uses),
# "_accident" for --series accident so it writes ALONGSIDE them rather than over them.
TABLE_SUFFIX = ""
SERIES_LABEL = "blended"


def _t(sql: str) -> str:
    """Point a statement's ml_* table names at the active series' tables."""
    for name in ("ml_daily_actuals", "ml_predictive_incidents", "ml_training_metadata"):
        sql = sql.replace(name, name + TABLE_SUFFIX)
    return sql


# Corridor rain per Manila day: the mean of the weather points each hour, summed over the day's hours (5 Nov 2026).
# It was SUM(rainfall) over every (point, hour) row, i.e. the 20 points ADDED, not averaged: about 150 mm/day against
# the real 6-8, the exact inflation retrain_honest.py's note 1 had already fixed for the traffic module. Points are
# taken once per coordinate: from 21 to 31 Oct 2026 three of them are stored under two spellings ("Paso De Blas"/
# "Paso de Blas", "Cdv/Ph Arena"/"CDV/PH Arena", "Sctex"/"SCTEX") at the same place.
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

# Observed daily vehicle volume: actual_volume in gold.ml_predictive_volume is exactly the daily sum of plaza entries
# (gold.daily_traffic_volume_corrected, checked 10 Nov 2026: identical on all 1,642 days), the series the traffic
# study forecasts. Real to 2026-05-24; 25 May - 30 Jun 2026 is broken or synthetic and is never used as an input.
# split_label = '80_20': the traffic module stores each date twice (one row per split arm); actual_volume is the
# same in both, the filter only stops the join doubling every day.
DAILY_VOLUME_SQL = """
    SELECT forecast_date AS d, actual_volume::float AS volume
    FROM gold.ml_predictive_volume
    WHERE actual_volume IS NOT NULL AND split_label = '80_20'
    ORDER BY 1
"""

# The traffic module's PUBLISHED future volume — the same COALESCE the dashboard's volume overlay reads
# (FUTURE_VOLUME_SQL in incident.service.ts). Used only as a fallback when the traffic champion cannot be refitted
# here (--volume-source published, or traffic_study unavailable), and recorded as such in the metadata, because
# this column is not necessarily the traffic champion and was not what the study tested.
FUTURE_VOLUME_SQL = """
    SELECT forecast_date AS d,
           COALESCE(pred_lstm, pred_prophet, pred_sarimax,
                    pred_holtwinters, pred_holts_linear, pred_xgboost)::float AS volume
    FROM gold.ml_predictive_volume
    WHERE is_future AND split_label = '80_20'
          AND COALESCE(pred_lstm, pred_prophet, pred_sarimax,
                       pred_holtwinters, pred_holts_linear, pred_xgboost) IS NOT NULL
    ORDER BY 1
"""

# TensorFlow is imported only when a network is built (incident_study.tf_setup sets deterministic ops and the thread
# count before the first op), so the GLM/tree/SARIMAX work does not carry its ~1 GB.


def set_all_seeds(seed: int = SEED) -> None:
    """Reseeds every RNG the models touch (Python, numpy, and TensorFlow once it is loaded), called before every
    network is built, so a re-run reproduces the same weights. Trees take an explicit random_state; GLM/SARIMAX/ARIMA
    fits are deterministic."""
    random.seed(seed)
    np.random.seed(seed)
    if "tensorflow" in sys.modules:
        sys.modules["tensorflow"].random.set_seed(seed)


set_all_seeds()

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def get_conn():
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
    # Timeout + keepalives: after a network drop a query on a dead socket otherwise waits forever (11 Nov 2026).
    return psycopg2.connect(dsn, sslmode="require", connect_timeout=20, keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=5)


# NLEX corridor coords, matching the OpenWeather extractor's scope (src/etl/extractors/weather.extractor.ts).
NLEX_LAT, NLEX_LON = 14.75, 120.95

# The future days a REAL weather forecast covers (Open-Meteo, the next 16 days from today). Filled by
# fetch_future_rain; a weather-aware model may serve only those days (protocol section 2).
REAL_FORECAST_DATES: set = set()


def fetch_future_rain(future_dates: list) -> dict:
    """Rain (mm) for the future dates a real weather forecast covers (Open-Meteo runs 16 days from today), and
    REAL_FORECAST_DATES. A day that has not happened can only be given weather knowable at the forecast origin;
    rain RECORDED after the origin is never used (5 Nov 2026), and days past the weather forecast get no rain at all:
    the weather-free model forecasts them (no placeholder rain is stored or used)."""
    try:
        resp = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={"latitude": NLEX_LAT, "longitude": NLEX_LON, "daily": "precipitation_sum",
                    "timezone": "Asia/Manila", "forecast_days": 16},
            timeout=10,
        )
        resp.raise_for_status()
        payload = resp.json()["daily"]
        forecast = dict(zip([pd.Timestamp(d).date() for d in payload["time"]], payload["precipitation_sum"]))
    except Exception as e:  # noqa: BLE001
        print(f"  Open-Meteo forecast fetch failed ({e}); no future day has weather")
        forecast = {}
    out = {}
    for d in future_dates:
        f = forecast.get(pd.Timestamp(d).date())
        if f is not None:
            REAL_FORECAST_DATES.add(pd.Timestamp(d).date())
            out[pd.Timestamp(d).date()] = float(f)
    return out


# Column in ml_predictive_incidents that carries each family's series. The dashboard toggles between these the same
# way the traffic chart toggles pred_lstm / pred_prophet / ... in gold.ml_predictive_volume.
PRED_COLUMN = {
    "XGBoost": "pred_xgboost",
    "RandomForest": "pred_randomforest",
    "LSTM": "pred_lstm",
    "GRU": "pred_gru",
    "Poisson_GLM": "pred_poisson_glm",
    "NegBinomial_GLM": "pred_negbinomial_glm",
    "SARIMAX": "pred_sarimax",
}
# Volume-free (_nv) and weather-free (_nw) twins, which the dashboard's Volume and Weather toggles switch to. The
# univariate LSTM/GRU use neither input, so their twins hold the same series (not a bug).
PRED_COLUMN_NV = {m: f"{c}_nv" for m, c in PRED_COLUMN.items()}
PRED_COLUMN_NW = {m: f"{c}_nw" for m, c in PRED_COLUMN.items()}


def ensure_schema(conn, commit: bool = True) -> None:
    with conn.cursor() as cur:
        cur.execute(
            _t("""
            CREATE TABLE IF NOT EXISTS ml_daily_actuals (
                d DATE PRIMARY KEY,
                total DOUBLE PRECISION NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ml_predictive_incidents (
                id SERIAL PRIMARY KEY,
                forecast_date DATE NOT NULL,
                prediction_type TEXT NOT NULL CHECK (prediction_type IN ('validation', 'future')),
                predicted_incident_count DOUBLE PRECISION NOT NULL,
                champion_model TEXT,
                UNIQUE (forecast_date, prediction_type)
            );
            CREATE TABLE IF NOT EXISTS ml_training_metadata (
                id SERIAL PRIMARY KEY,
                metadata_json JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            -- The observed count on the same weekday one year earlier, kept so the dashboard can show what each
            -- forecast reasons from.
            ALTER TABLE ml_predictive_incidents
                ADD COLUMN IF NOT EXISTS same_day_last_year DOUBLE PRECISION;

            -- One column per candidate family, mirroring gold.ml_predictive_volume.
            ALTER TABLE ml_predictive_incidents
                ADD COLUMN IF NOT EXISTS pred_xgboost          DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_randomforest     DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_lstm             DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_gru              DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_poisson_glm      DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_negbinomial_glm  DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_sarimax          DOUBLE PRECISION;

            -- Volume-free twins (the dashboard's Volume toggle).
            ALTER TABLE ml_predictive_incidents
                ADD COLUMN IF NOT EXISTS pred_xgboost_nv          DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_randomforest_nv     DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_lstm_nv             DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_gru_nv              DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_poisson_glm_nv      DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_negbinomial_glm_nv  DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_sarimax_nv          DOUBLE PRECISION;

            -- Weather-free twins (the dashboard's Weather toggle).
            ALTER TABLE ml_predictive_incidents
                ADD COLUMN IF NOT EXISTS pred_xgboost_nw          DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_randomforest_nw     DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_lstm_nw             DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_gru_nw              DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_poisson_glm_nw      DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_negbinomial_glm_nw  DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS pred_sarimax_nw          DOUBLE PRECISION;

            -- Rain (mm) behind each date's forecast: the recorded corridor total for a validation date; for a future
            -- date, a real Open-Meteo forecast or NULL (no weather used: the weather-free model forecast it).
            ALTER TABLE ml_predictive_incidents
                ADD COLUMN IF NOT EXISTS rainfall_mm DOUBLE PRECISION;
            """)
        )
    if commit:
        conn.commit()


HORIZON_TABLE_DDL = """
    CREATE TABLE IF NOT EXISTS ml_incident_horizon_accuracy (
      id serial PRIMARY KEY,
      model_name text NOT NULL,
      h_lo int NOT NULL, h_hi int NOT NULL,
      n int, wmape numeric(10,4), mape numeric(10,4), mase numeric(10,4), mae numeric(14,2),
      baseline_wmape numeric(10,4), usable boolean, note text,
      updated_at timestamptz DEFAULT now())
"""


def ensure_live_conn(conn):
    """A connection opened before a long refit can be dropped by the server while idle; ping it and reopen."""
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return conn
    except psycopg2.Error:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass
        return get_conn()


# ---------------------------------------------------------------------------
# The study: load, check, select
# ---------------------------------------------------------------------------
def _study_module():
    """incident_study imports this file by its module name; when this file is the running script, register it under
    that name first so both share one copy (and one set of globals)."""
    sys.modules.setdefault("train_incident_models", sys.modules[__name__])
    import incident_study as study  # noqa: E402
    return study


def load_study(S, series: str, df: pd.DataFrame, run_inline: bool, allow_stale: bool,
               tag: str = "") -> tuple[pd.DataFrame, dict]:
    """The study for this series, re-run here when it is missing, partial, or made from different data (a new upload):
    a champion must never be chosen from a test of other data. --allow-stale skips the re-run (testing only)."""
    stem = S.CACHE / f"incident_study_{series}{tag}"
    csv, js = stem.with_suffix(".csv"), stem.with_suffix(".json")
    fp_now = S.fingerprint(df)

    def problem() -> str | None:
        if not (csv.exists() and js.exists()):
            return f"no study at {js.name}"
        m = json.loads(js.read_text())
        if not m.get("origins_complete"):
            return f"{js.name} is a partial (smoke) study"
        if m.get("fingerprint") != fp_now:
            diff = {k: (m.get("fingerprint", {}).get(k), v) for k, v in fp_now.items()
                    if m.get("fingerprint", {}).get(k) != v}
            return f"the study was run on different data than the record holds now: {diff}"
        return None

    why = "--run-study" if run_inline else problem()
    if why and allow_stale and not run_inline and csv.exists() and js.exists():
        print(f"  WARNING: {why} (--allow-stale: used anyway)")
    elif why:
        print(f"  {why}: running the study now (about an hour or more per series)")
        S.run(series, "study", None, threads=2, stacked_forms="all")
        again = problem()
        if again:
            sys.exit(f"the study still does not match the record: {again}")
    return pd.read_csv(csv), json.loads(js.read_text())


def protocol_metrics(detail: dict, model: str) -> dict:
    """Days 1-14 of the rolling origins (what the Present band shows) plus the protocol score."""
    d = detail.get(model, {}).get("d1-14", {})
    return {"MAE": _r(d.get("mae")), "RMSE": _r(d.get("rmse")), "WMAPE": _r(d.get("wmape")),
            "MASE": _r(d.get("mase_vs_last_week")), "R2": _r(d.get("r2"))}


def _r(v, n=4):
    return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else round(float(v), n)


def comparison_rows(S, sel: dict, detail: dict, wm_table: dict) -> list[dict]:
    """One row per candidate and baseline (gold.model_evaluation reads model / MAE / RMSE / WMAPE / MASE / R2 from
    here; the dashboard's model table falls back to it). Figures are days 1-14 of the rolling origins, with the
    protocol score (mean of the four bucket MAEs) and every bucket alongside."""
    table = sel["table"]
    rows = []
    for m in sorted(table, key=lambda k: table[k]["score"]):
        fam, vol, wx = S.parse_variant(m)
        rows.append({
            "model": m, "family": fam if fam in MODEL_NAMES else None, "is_baseline": S.is_baseline(m),
            "uses_volume": bool(vol), "uses_weather": bool(wx),
            **protocol_metrics(detail, m),
            "Adjusted_R2": None, "Train_R2": None, "Val_R2": protocol_metrics(detail, m)["R2"], "Gap": None,
            "Diagnosis": None,
            "score_mae": _r(table[m]["score"]), "score_wmape": _r(wm_table.get(m, {}).get("score")),
            "mae_by_bucket": {b: _r(v) for b, v in table[m].items() if b != "score"},
            "eligible": m in sel.get("eligible", []),
        })
    return rows


def horizon_rows(S, champion: str, sel: dict, detail: dict, buckets: list[str]) -> list[tuple]:
    """The champion's accuracy per horizon bucket, in ml_incident_horizon_accuracy's columns. mase = the champion's
    MAE over the seasonal-naive forecast's MAE from the same origins on the same days (out of sample; < 1 beats it);
    baseline_wmape = the best baseline IN THAT BUCKET; usable = beats every baseline in that bucket (protocol 6.5)."""
    base_names = [m for m in sel["table"] if S.is_baseline(m)]
    rows = []
    for b in buckets:
        c = detail.get(champion, {}).get(b)
        if not c:
            continue
        lo, hi = (int(x) for x in b[1:].split("-"))
        best_b = min(base_names, key=lambda m: detail[m][b]["mae"])
        usable = bool(c["mae"] < detail[best_b][b]["mae"]) and not S.is_baseline(champion)
        note = (f"EVALUATION_PROTOCOL rolling origins ({sel['origins']} origins, refitted at each, recursive, volume "
                f"from the traffic forecast): {'beats' if usable else 'does NOT beat'} the best baseline in this "
                f"range ({best_b}, MAE {detail[best_b][b]['mae']:.2f} vs {c['mae']:.2f})")
        if S.is_baseline(champion):
            note = f"no candidate beat the best baseline; {champion} is served. " + note
        rows.append((champion, lo, hi, int(c["n"]), _r(c["wmape"]), _r(c["mape"]), _r(c["mase_vs_last_week"]),
                     _r(c["mae"], 2), _r(detail[best_b][b]["wmape"]), usable, note))
    return rows


def write_horizon_rows(cur, rows: list[tuple]) -> None:
    cur.execute(HORIZON_TABLE_DDL)
    cur.execute(
        "COMMENT ON TABLE ml_incident_horizon_accuracy IS "
        "'How the published incident forecast''s error grows with how far ahead the day was: the champion''s "
        "per-bucket accuracy from the EVALUATION_PROTOCOL rolling-origin study (incident_study.py), written by "
        "train_incident_models.py with the model it describes.'")
    cur.execute("DELETE FROM ml_incident_horizon_accuracy")
    for r in rows:
        cur.execute("""INSERT INTO ml_incident_horizon_accuracy
                       (model_name, h_lo, h_hi, n, wmape, mape, mase, mae, baseline_wmape, usable, note)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", r)


def format_report(S, series: str, meta: dict, sel: dict, detail: dict, wm: dict, notes: list[str]) -> str:
    L = ["=" * 100, f"  INCIDENT FORECAST — EVALUATION_PROTOCOL study ({series})", "=" * 100, ""]
    L.append("  Source        : " + ("silver.nlex_accident_events_clean (accident-only series)" if series == "accident"
                                     else "silver.nlex_accident_events_clean + silver.nlex_breakdown_events_clean"))
    od = list(meta["origins"].values())
    L.append(f"  Origins       : {len(od)} rolling origins, {od[0]} .. {od[-1]}, every 14 days, refitted at each")
    L.append(f"  Horizon       : {meta['horizon']} days, recursive as served; scored to {meta['score_end']}")
    L.append(f"  Volume input  : {meta['volume_input']}")
    L.append(f"  Weather       : {meta['weather']}")
    L.append(f"  Not scored    : {', '.join(meta['excluded_days'])} (no incident rows: a data gap); "
             f"everything after {meta['score_end']} (traffic volume not real)")
    L.append(f"  Study run     : {meta['created']} (code {meta.get('code_version')})")
    for n in notes:
        L.append(f"  Note          : {n}")
    L.append("")
    t = pd.DataFrame(sel["table"]).T
    cols = [c for c in t.columns if c != "score"]
    L.append("  MAE (incidents/day) by horizon bucket; score = mean of buckets; WMAPE score alongside")
    L.append("  " + f"{'model':<42}" + "".join(f"{c:>9}" for c in cols) + f"{'score':>9}{'WMAPE':>9}")
    for m in t.sort_values("score").index:
        tag = " <- champion" if m == sel["champion"] else (" (eligible)" if m in sel["eligible"] else "")
        L.append("  " + f"{m:<42}" + "".join(f"{t.loc[m, c]:>9.2f}" for c in cols) +
                 f"{t.loc[m, 'score']:>9.2f}{wm.get(m, {}).get('score', float('nan')):>8.2f}%" + tag)
    L.append("")
    L.append(f"  Best baseline : {sel['best_baseline']}")
    L.append(f"  Eligible      : {', '.join(sel['eligible']) or 'none'}")
    if "vs_baseline_ci" in sel:
        lo, hi = sel["vs_baseline_ci"]
        L.append(f"  Champion vs best baseline: 95% interval {lo:+.2f} to {hi:+.2f} incidents/day "
                 f"({'significant' if sel['vs_baseline_significant'] else 'NOT significant'})")
    if "vs_runner_up_ci" in sel:
        lo, hi = sel["vs_runner_up_ci"]
        L.append(f"  Champion vs runner-up ({sel['runner_up']}): 95% interval {lo:+.2f} to {hi:+.2f} "
                 f"({'significant' if sel['vs_runner_up_significant'] else 'NOT significant'})")
    if sel.get("note"):
        L.append(f"  Note          : {sel['note']}")
    if sel.get("usable"):
        L.append("  Usable buckets: " + ", ".join(f"{k} {'yes' if v else 'NO'}" for k, v in sel["usable"].items()))
    L.append(f"  CHAMPION      : {sel['champion']}")
    c = detail.get(sel["champion"], {})
    L.append("  Champion mean forecast vs mean actual: " +
             ", ".join(f"{b} {v['mean_forecast']:.1f} vs {v['mean_actual']:.1f}" for b, v in c.items()))
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------------------
# Served forecast
# ---------------------------------------------------------------------------
def served_volume(S, conn, future_start: pd.Timestamp, future_end: pd.Timestamp, source: str) -> dict:
    """Register the volume the served forecast reads for every day after the last real volume day (2026-05-24)."""
    start = S.REAL_END_VOLUME + pd.Timedelta(days=1)
    info: dict = {}
    if source == "traffic-model":
        cache = S.CACHE / "incident_served_volume.json"
        tsel = S.CACHE / "traffic_study.json"
        try:
            champ = json.loads(tsel.read_text())["champion"]
            key = {"champion": champ, "train_end": str(S.REAL_END_VOLUME.date()), "start": str(start.date()),
                   "end": str(future_end.date()), "traffic_study_mtime": tsel.stat().st_mtime}
            got = json.loads(cache.read_text()) if cache.exists() else {}
            if got.get("key") == key:
                s = pd.Series(got["values"], index=pd.to_datetime(got["dates"]))
            else:
                print(f"  refitting the traffic champion ({champ}) on the real record to {S.REAL_END_VOLUME.date()} "
                      f"and forecasting {start.date()}..{future_end.date()}")
                s, champ = S.traffic_champion_forecast(start, future_end, S.REAL_END_VOLUME, champ)
                cache.write_text(json.dumps({"key": key, "dates": [str(d.date()) for d in s.index],
                                             "values": [float(v) for v in s.values]}))
            info = {"source": "traffic study champion, refitted on the real traffic record (protocol section 7)",
                    "traffic_champion": champ, "traffic_train_end": str(S.REAL_END_VOLUME.date()),
                    "forecast_from": str(start.date())}
        except (Exception, SystemExit) as e:  # noqa: BLE001
            print(f"  WARNING: the traffic champion could not be refitted here ({str(e)[:160]}); "
                  "falling back to the traffic module's published forecast")
            source = "published"
    if source == "published":
        pub = pd.read_sql(FUTURE_VOLUME_SQL, conn)
        pub["d"] = pd.to_datetime(pub["d"])
        s = pub.set_index("d")["volume"].astype(float)
        days = pd.date_range(start, future_end, freq="D")
        first = s.index.min()
        fill = {d: float(s.get(first + pd.Timedelta(days=(d - first).days % 7))) for d in days if d < first}
        s = pd.concat([pd.Series(fill, dtype=float), s]).sort_index().reindex(days)
        if not np.isfinite(s.values).all():
            sys.exit("the published traffic forecast does not cover the incident forecast's days")
        info = {"source": "PUBLISHED traffic forecast (gold.ml_predictive_volume COALESCE, the dashboard overlay); "
                          "NOT the configuration the study tested",
                "forecast_from": str(first.date()), "days_before_it_filled_by_weekday": len(fill)}
    S.VOL.register(future_start, s)
    monthly = s[s.index >= future_start].groupby(s[s.index >= future_start].index.to_period("M")).mean()
    info["monthly_mean"] = {str(k): round(float(v)) for k, v in monthly.items()}
    return info


def served_forecasts(S, df: pd.DataFrame, champion: str, names: list[str]) -> tuple[dict, list, int]:
    """Refit each named model on all allowed data and forecast FUTURE_DAYS days after the record."""
    S.TF_THREADS = 1                            # one thread: the served networks reproduce bit for bit
    models, _ = S.build_models()
    last = df.attrs["last_incident_day"]
    train = df[df.ds <= last].reset_index(drop=True)
    fut = df[(df.ds > last) & (df.ds <= last + pd.Timedelta(days=FUTURE_DAYS))].reset_index(drop=True)
    fut = fut[["ds"] + S.KNOWN].copy()
    fut["rain_mm"] = np.nan                     # no weather is known for these days (see fetch_future_rain)
    out = {}
    for n in names:
        if n in out:
            continue
        S.tim.set_all_seeds()
        print(f"  refitting {n} ...", end=" ", flush=True)
        try:
            out[n] = np.asarray(models[n](train, fut), dtype=float)
            print(f"ok (mean {out[n].mean():.1f}/day)")
        except Exception as e:  # noqa: BLE001
            print(f"FAILED ({str(e)[:120]})")
    importance: list = []
    fam, vol, wx = S.parse_variant(champion)
    kind = {f: k for f, k, _ in S.FAMILIES}.get(fam)
    if kind and kind != "sarimax":
        _, mdl, names_ = S.tabular_forecast(kind, train, fut, vol, False, 1, return_model=True)
        if hasattr(mdl, "feature_importances_"):
            imp = mdl.feature_importances_
        else:
            p = np.asarray(mdl.params)
            imp = np.abs(p[1:len(names_) + 1])
        importance = sorted(({"feature": f, "importance": float(v)} for f, v in zip(names_, imp)),
                            key=lambda x: x["importance"], reverse=True)
    n_train = int(train.y.notna().sum()) - S.TRAIN_WARMUP
    if vol:
        n_train = int(((train.ds <= S.REAL_END_VOLUME) & train.y.notna()).sum()) - S.TRAIN_WARMUP
    return out, importance, n_train


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------
def write_to_db(conn, daily: pd.DataFrame, champion: str, champion_series: dict, cols: dict, metadata: dict,
                rain_by_date: dict, yoy: dict, hz_rows: list | None, dry: bool) -> None:
    """One transaction: ml_daily_actuals, ml_predictive_incidents (validation = days 1-14 of the rolling origins,
    future = the refit), ml_training_metadata, and ml_incident_horizon_accuracy (blended only). dry: every query
    runs, then the transaction is rolled back."""
    ensure_schema(conn, commit=False)
    model_cols = [PRED_COLUMN[m] for m in MODEL_NAMES]
    nv_cols = [PRED_COLUMN_NV[m] for m in MODEL_NAMES]
    nw_cols = [PRED_COLUMN_NW[m] for m in MODEL_NAMES]

    def num(v):
        return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else float(v)

    rows = []
    for kind in ("validation", "future"):
        for d in sorted(champion_series[kind]):
            c = cols[kind]
            rows.append((d, kind, float(champion_series[kind][d]), champion, num(yoy.get(d)),
                         *[num(c["main"].get(m, {}).get(d)) for m in MODEL_NAMES], num(rain_by_date.get(d)),
                         *[num(c["nv"].get(m, {}).get(d)) for m in MODEL_NAMES],
                         *[num(c["nw"].get(m, {}).get(d)) for m in MODEL_NAMES]))
    with conn.cursor() as cur:
        # Upsert, not DELETE-then-INSERT of the same keys: behind the pooler a delete and re-insert of one key in a
        # transaction has hit "duplicate key"; rows whose key is no longer produced are deleted by key instead.
        cur.execute(_t("SELECT d FROM ml_daily_actuals"))
        stale = {r[0] for r in cur.fetchall()} - set(daily["d"])
        if stale:
            cur.execute(_t("DELETE FROM ml_daily_actuals WHERE d = ANY(%s)"), (list(stale),))
        psycopg2.extras.execute_values(
            cur, _t("INSERT INTO ml_daily_actuals (d, total) VALUES %s ON CONFLICT (d) DO UPDATE SET total = EXCLUDED.total"),
            list(zip(daily["d"], daily["total"].astype(float))))
        for kind in ("validation", "future"):
            cur.execute(_t("DELETE FROM ml_predictive_incidents WHERE prediction_type = %s AND NOT (forecast_date = ANY(%s))"),
                        (kind, sorted(champion_series[kind])))
        update_cols = ["predicted_incident_count", "champion_model", "same_day_last_year"] + model_cols + \
            ["rainfall_mm"] + nv_cols + nw_cols
        psycopg2.extras.execute_values(
            cur,
            _t("INSERT INTO ml_predictive_incidents (forecast_date, prediction_type, predicted_incident_count, "
               "champion_model, same_day_last_year, " + ", ".join(model_cols) + ", rainfall_mm, " + ", ".join(nv_cols)
               + ", " + ", ".join(nw_cols) + ") VALUES %s ON CONFLICT (forecast_date, prediction_type) DO UPDATE SET "
               + ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)),
            rows)
        cur.execute(_t("DELETE FROM ml_training_metadata"))
        cur.execute(_t("INSERT INTO ml_training_metadata (metadata_json) VALUES (%s)"), [json.dumps(metadata, default=str)])
        if hz_rows is not None:
            write_horizon_rows(cur, hz_rows)
        # Read back inside the transaction, so a dry run proves the rows landed as intended.
        cur.execute(_t("SELECT prediction_type, count(*), min(forecast_date), max(forecast_date), "
                       "avg(predicted_incident_count) FROM ml_predictive_incidents GROUP BY 1 ORDER BY 1"))
        for r in cur.fetchall():
            print(f"    {r[0]:<10} {r[1]:>4} rows  {r[2]} .. {r[3]}  mean {float(r[4]):.1f}/day")
    if dry:
        conn.rollback()
        print("DRY RUN: every query ran, then the transaction was rolled back — no table changed")
    else:
        conn.commit()


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> None:
    global DAILY_COUNTS_SQL, TABLE_SUFFIX, SERIES_LABEL

    p = argparse.ArgumentParser()
    p.add_argument("--write-db", action="store_true", help="Refit, write the champion's tables, and COMMIT")
    p.add_argument("--dry-run", "--dry-write", dest="dry_run", action="store_true",
                   help="Refit and run the entire write path, then ROLL BACK (no table changes)")
    p.add_argument("--series", choices=["blended", "accident"], default="blended",
                   help="blended (default): accidents + breakdowns into the ml_* tables; accident: accidents alone "
                        "into ml_*_accident alongside them")
    p.add_argument("--run-study", action="store_true", help="Run incident_study.py for this series first")
    p.add_argument("--allow-stale", action="store_true",
                   help="Use a study whose data fingerprint differs from today's record (testing only)")
    p.add_argument("--volume-source", choices=["traffic-model", "published"], default="traffic-model",
                   help="Volume for the served forecast: the traffic study's champion refitted on the real record "
                        "(default; what the study tested) or the traffic module's published column (fallback)")
    p.add_argument("--study-tag", default="", help=argparse.SUPPRESS)   # read incident_study_{series}{tag} (tests)
    p.add_argument("--champion", default=None, help="Force a champion (any study model name); recorded as an override")
    p.add_argument("--no-volume", action="store_true", help="Choose the champion among volume-free models only")
    p.add_argument("--no-weather", action="store_true", help="Choose the champion among weather-free models only")
    # Kept so the weekly batch and old commands still run; the protocol fixes what they used to choose.
    p.add_argument("--protocol", default=None, help=argparse.SUPPRESS)
    p.add_argument("--holdout-days", type=int, default=None, help=argparse.SUPPRESS)
    p.add_argument("--select-by", default=None, help=argparse.SUPPRESS)
    p.add_argument("--volume-mode", default=None, help=argparse.SUPPRESS)
    p.add_argument("--train-years", type=float, default=None, help=argparse.SUPPRESS)
    p.add_argument("--extra-candidates", action="store_true", help=argparse.SUPPRESS)
    args = p.parse_args()
    if args.series == "accident":
        DAILY_COUNTS_SQL = ACCIDENT_DAILY_COUNTS_SQL
        TABLE_SUFFIX = "_accident"
        SERIES_LABEL = "accident"
    notes = []
    for flag in ("protocol", "holdout_days", "select_by", "volume_mode", "train_years"):
        if getattr(args, flag) is not None:
            notes.append(f"--{flag.replace('_', '-')} {getattr(args, flag)} ignored: EVALUATION_PROTOCOL fixes the "
                         "origins, horizon, criterion and training window")
    if args.extra_candidates:
        notes.append("--extra-candidates ignored: MSTL_ARIMA and Stacked_LSTM are always in the study")
    for n in notes:
        print("  " + n)

    S = _study_module()
    set_all_seeds()
    conn = get_conn()
    try:
        conn.set_session(readonly=True)
        print(f"Loading the {SERIES_LABEL} series, rain, volume and holidays (read-only)...")
        df, _ = S.load_frame(conn, SERIES_LABEL)
        last = df.attrs["last_incident_day"]
        real = df[df.ds <= last]
        print(f"  {len(real)} days {real.ds.min().date()}..{last.date()}, {int(np.nansum(real.y))} incidents")
        conn.close()

        res_all, meta = load_study(S, SERIES_LABEL, df, args.run_study, args.allow_stale, args.study_tag)
        # The incident record runs to 30 Jun 2026 but traffic volume is real only to 24 May (user, 11 Nov 2026): the
        # served models train, and ml_daily_actuals ends, on the same day as traffic, so the incident and traffic
        # forecasts both start on 25 May. Applied after load_study, whose fingerprint describes the full record (the
        # study never scored past 24 May, so its results are unchanged by the cut).
        record_last = last
        last = min(last, S.REAL_END_VOLUME)
        if last < record_last:
            df.loc[df.ds > last, ["y", "rain_mm"]] = np.nan
            df.attrs["last_incident_day"] = last
            real = df[df.ds <= last]
            notes.append(f"incident days {(last + pd.Timedelta(days=1)).date()}..{record_last.date()} left out of "
                         f"training and actuals: traffic volume is real only to {last.date()}")
            print(f"  record cut to {last.date()} (was {record_last.date()}) to match the traffic record")
        pool = res_all
        if args.no_volume or args.no_weather:
            keep = [m for m in res_all.model.unique()
                    if S.is_baseline(m) or ((not args.no_volume or not S.parse_variant(m)[1])
                                            and (not args.no_weather or not S.parse_variant(m)[2]))]
            pool = res_all[res_all.model.isin(keep)]
            notes.append(f"champion chosen among {'volume-free ' if args.no_volume else ''}"
                         f"{'weather-free ' if args.no_weather else ''}models only")
        sel = S.select_champion(pool, metric="mae", complexity=meta["complexity"])
        wm = S.summarize(pool, metric="wmape").round(4).to_dict(orient="index")
        detail = S.bucket_detail(res_all)
        champion = sel["champion"]
        if args.champion and args.champion != champion:
            if args.champion not in detail:
                sys.exit(f"--champion {args.champion}: not a model in the study")
            notes.append(f"champion overridden: the protocol chose {champion}, --champion forced {args.champion}")
            champion = args.champion
            sel = {**sel, "champion": champion, "override": True}
        text = format_report(S, SERIES_LABEL, meta, sel, detail, wm, notes)
        print("\n" + text)
        report_path = Path(__file__).resolve().parent / ("model_results_accident.txt" if SERIES_LABEL == "accident"
                                                         else "model_results.txt")
        report_path.write_text(text, encoding="utf-8")
        print(f"Report written to {report_path}")

        if not args.write_db and not args.dry_run:
            print("Selection only. --dry-run builds and writes every row then rolls back; --write-db commits.")
            return
        dry = args.dry_run and not args.write_db

        # ── served forecast: refit on all allowed data, forecast the 90 days after the record ──
        conn = get_conn()
        future_start = last + pd.Timedelta(days=1)
        future_end = last + pd.Timedelta(days=FUTURE_DAYS)
        vol_info = served_volume(S, conn, future_start, future_end, args.volume_source)
        print(f"  volume for the served forecast: {vol_info}")
        future_dates = list(pd.date_range(future_start, future_end, freq="D"))
        real_rain = fetch_future_rain(future_dates)
        print(f"  a real weather forecast covers {len(REAL_FORECAST_DATES)} of {FUTURE_DAYS} future days; "
              "every other day is forecast by the weather-free form")
        if REAL_FORECAST_DATES:
            notes.append(f"{len(REAL_FORECAST_DATES)} future days had a real weather forecast but the served forecast "
                         "still uses the weather-free form for them (the weather form is tested for days 1-14 only)")

        fam_names = [f for f, _, _ in S.FAMILIES]
        serve = {S.weather_free_twin(champion)}
        for f in fam_names:
            serve |= {S.variant_name(f, True, False), S.variant_name(f, False, False)}
        serve |= {"LSTM", "GRU"}
        print("Refitting on all allowed data (volume-aware: training rows to "
              f"{S.REAL_END_VOLUME.date()}; volume-free: to {last.date()}) ...")
        fut, importance, n_train = served_forecasts(S, df, champion, sorted(serve, key=lambda n: n != champion))
        champ_future_name = S.weather_free_twin(champion)
        if champ_future_name not in fut:
            sys.exit(f"Champion '{champion}' failed its final refit — nothing safe to write")

        # ── validation rows: days 1-14 of every rolling origin (the forecasts the metrics describe) ──
        d14 = res_all[res_all.h <= 14]
        by_model = {m: dict(zip(pd.to_datetime(g.date).dt.date, g.forecast.astype(float)))
                    for m, g in d14.groupby("model")}
        champ_val = by_model.get(champion, {})
        fdates = [d.date() for d in future_dates]
        champ_fut = dict(zip(fdates, fut[champ_future_name]))

        def fam_cols(kind):
            main, nv, nw = {}, {}, {}
            for f in MODEL_NAMES:
                if f in ("LSTM", "GRU"):
                    src = by_model.get(f) if kind == "validation" else (dict(zip(fdates, fut[f])) if f in fut else None)
                    if src:
                        main[f] = nv[f] = nw[f] = src
                    continue
                if kind == "validation":
                    pairs = ((main, S.variant_name(f, True, True)), (nv, S.variant_name(f, False, True)),
                             (nw, S.variant_name(f, True, False)))
                    for tgt, n in pairs:
                        if n in by_model:
                            tgt[f] = by_model[n]
                else:
                    pairs = ((main, S.variant_name(f, True, False)), (nv, S.variant_name(f, False, False)),
                             (nw, S.variant_name(f, True, False)))
                    for tgt, n in pairs:
                        if n in fut:
                            tgt[f] = dict(zip(fdates, fut[n]))
            return {"main": main, "nv": nv, "nw": nw}

        cols = {"validation": fam_cols("validation"), "future": fam_cols("future")}
        daily = pd.DataFrame({"d": real.ds.dt.date, "total": real.y.fillna(0.0).astype(float)})
        actual = dict(zip(daily.d, daily.total))
        yoy = {d: actual.get(d - timedelta(days=364)) for d in list(champ_val) + fdates}
        rain_by_date = {d.date(): float(r) for d, r in zip(real.ds, real.rain_mm) if d.date() in champ_val}
        rain_by_date.update({d: v for d, v in real_rain.items() if d in REAL_FORECAST_DATES})

        fam, vol, wx = S.parse_variant(champion)
        excluded = [{"date": d, "reason": r, "observed_total": int(actual.get(pd.Timestamp(d).date(), 0)),
                     "next_lowest_total": int(min(v for k, v in actual.items() if str(k) != d))}
                    for d, r in EVAL_EXCLUDED_DAYS.items()]
        val_dates = sorted(champ_val)
        prev = previous_champion(TABLE_SUFFIX)
        metadata = {
            "champion_model": champion,
            "champion_family": fam if fam in MODEL_NAMES else None,
            "champion_is_baseline": bool(S.is_baseline(champion)),
            "series": SERIES_LABEL,
            "data_source": ("silver.nlex_accident_events_clean" if SERIES_LABEL == "accident"
                            else "silver.nlex_accident_events_clean + silver.nlex_breakdown_events_clean"),
            "protocol": "EVALUATION_PROTOCOL.md (10 Nov 2026) via incident_study.py",
            "model_comparison": comparison_rows(S, sel, detail, wm),
            "diagnosis_notes": [
                "Figures are out-of-sample forecasts from 26 rolling origins (refitted at each, 90 days recursive, "
                "volume from the traffic forecast). MAE/RMSE/WMAPE/R2/MASE in each row are days 1-14 (the Present "
                "band); score_mae is the mean of the four bucket MAEs that chose the champion; MASE is relative to "
                "the seasonal-naive forecast from the same origins. No train/validation gap is reported: the "
                "rolling origins measure generalisation directly.",
            ],
            "metrics": {**protocol_metrics(detail, champion), "score_mae": _r(sel["table"][champion]["score"]),
                        "scored": "days 1-14 of 26 rolling origins; score_mae = mean MAE over days 1-14/15-30/31-60/61-90"},
            "feature_importance": importance,
            "evaluation": {
                "protocol": "rolling-origin (EVALUATION_PROTOCOL.md)",
                "origins": len(meta["origins"]), "origin_dates": list(meta["origins"].values()),
                "step_days": 14, "horizon_days": meta["horizon"], "score_end": meta["score_end"],
                "holdout_days": len(val_dates),
                "scored_days": len(val_dates),
                "holdout_window": [str(val_dates[0]), str(val_dates[-1])] if val_dates else None,
                "train_rows": n_train,
                "selected_by": "protocol: lowest mean bucket MAE among models beating the best baseline overall and "
                               "on days 1-14; moving-block bootstrap; the simpler model wins a non-significant tie",
                "excluded_from_scoring": excluded,
                "not_scored": [{"from": str((S.REAL_END_VOLUME + pd.Timedelta(days=1)).date()),
                                "to": str(record_last.date()),
                                "reason": "traffic volume after 2026-05-24 is broken or synthetic; these incident days "
                                          "are neither scored nor used for training, so the incident and traffic "
                                          "forecasts start on the same day"}],
                "record_last_day": str(record_last.date()), "trained_through_day": str(last.date()),
                "best_baseline": sel["best_baseline"], "eligible": sel["eligible"],
                "vs_baseline_ci": sel.get("vs_baseline_ci"), "vs_baseline_significant": sel.get("vs_baseline_significant"),
                "runner_up": sel.get("runner_up"), "vs_runner_up_ci": sel.get("vs_runner_up_ci"),
                "vs_runner_up_significant": sel.get("vs_runner_up_significant"), "selection_note": sel.get("note"),
                "usable_buckets": sel.get("usable"), "by_bucket": detail.get(champion),
                "volume_input_tested": meta["volume_input"], "weather": meta["weather"],
                "study_created": meta["created"], "study_code_version": meta.get("code_version"),
                "note": "The Present band holds the days 1-14 forecasts of the 26 rolling origins (non-overlapping), "
                        "so the band and these metrics describe the same forecasts.",
            },
            "available_models": [m for m in MODEL_NAMES if m in cols["validation"]["main"] or m in cols["future"]["main"]],
            "uses_volume": bool(vol), "volume_features": ["log_volume", "volume_ratio_7"] if vol else [],
            "has_volume_free_twin": True, "uses_weather": bool(wx), "has_weather_free_twin": True,
            "served_volume_input": vol_info,
            "served_forecast": {"name": champ_future_name, "from": str(future_start.date()), "to": str(future_end.date()),
                                "mean_per_day": round(float(np.mean(list(champ_fut.values()))), 2),
                                "trained_through": str((S.REAL_END_VOLUME if vol else last).date())},
            "previous_champion": prev,
            "previous_champion_rescored": (sel["table"].get(prev) if prev else None),
            "code_version": S.git_commit(),
            "notes": notes,
        }
        if S.is_baseline(champion):
            metadata["warning"] = (f"No candidate beat the best baseline under the protocol; {champion} is served.")
        hz = horizon_rows(S, champion, sel, detail, meta["buckets"]) if SERIES_LABEL == "blended" else None
        print(f"  served forecast ({champ_future_name}): mean {metadata['served_forecast']['mean_per_day']}/day "
              f"{future_start.date()}..{future_end.date()}; recorded mean last 90 days "
              f"{np.nanmean(real.y.values[-90:]):.1f}/day")
        print(_t("Writing ml_daily_actuals, ml_predictive_incidents, ml_training_metadata") +
              (" and ml_incident_horizon_accuracy" if hz is not None else "") + " (one transaction)...")
        conn = ensure_live_conn(conn)
        write_to_db(conn, daily, champion, {"validation": champ_val, "future": champ_fut}, cols, metadata,
                    rain_by_date, yoy, hz, dry)
        print("Rolled back (dry run)." if dry else "Committed.")
    except Exception:
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        raise
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass


def previous_champion(suffix: str) -> str | None:
    """The champion currently published, so the metadata can show its score on the same origins (protocol 8)."""
    try:
        conn = get_conn()
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute(f"SELECT metadata_json->>'champion_model' FROM ml_training_metadata{suffix} "
                        "ORDER BY created_at DESC LIMIT 1")
            r = cur.fetchone()
        conn.close()
        return r[0] if r else None
    except Exception:  # noqa: BLE001
        return None


if __name__ == "__main__":
    main()
