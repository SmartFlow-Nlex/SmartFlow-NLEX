"""
Congestion state forecasting — a REAL 1-to-168-hour horizon.

WHY THIS REPLACES train_congestion_multi.py
  That script never forecast anything. It built its training frame as

      full = pd.concat([df.assign(horizon=hz) for hz in HORIZONS])

  which duplicates every row twelve times and tags each copy with a horizon,
  but never shifts the TARGET. All twelve copies carry the state at the SAME
  timestamp, so `horizon` had no relationship to the label, the models correctly
  learned to ignore it, and every horizon returned an identical answer. The
  served map showed one prediction twelve times (verified: every segment had
  exactly one distinct state/probability pair across all twelve columns).

  A second, independent bug had the same effect on serving: inside the GRU's
  horizon loop the input window `a[-SEQ_LEN:, :]` was recomputed identically on
  every pass, so it never advanced through the horizons either.

  The reported 78.1% was therefore a NOWCAST accuracy - classifying the current
  hour from lag-24/lag-48 features - mislabelled as a 12-hour forecast.

WHAT THIS DOES INSTEAD
  For each horizon h, the target is the state at ts + h hours for that exit, and
  the features are the ones knowable at ts. Accuracy is reported PER HORIZON,
  because a single number across 1-12h hides exactly the decay that matters.

LEAKAGE
  A training row is kept only if its TARGET timestamp also falls before the test
  cut. Splitting on ts alone would let a row at ts = cut - 1h carry a label from
  inside the test window.

EXPECTATION
  Accuracy will fall well below 78.1%, steeply with horizon. That is not a
  regression; it is the first honest measurement of a harder task.

TESTING, REWRITTEN 10 Nov 2026 (EVALUATION_PROTOCOL.md; the rule below was fixed before any result was seen under it)
  An audit found the test flattering the learned models and deciding the champion by noise:
    1. The baseline was each exit's modal state at the ORIGIN hour, pooled over every horizon. What an exit usually
       does at the TARGET hour (x weekday/weekend) scored 0.6644 on the same 221,040 rows, above every candidate. The
       profile is now keyed on the target hour, named by the same decision rule as the candidates, and persistence
       and "the same hour last week" are scored beside it.
    2. XGBoost's inputs stopped an hour before the origin while persistence, the GRU and the dual-path family saw the
       state AT the origin. XGBoost now has that state (and the neighbours' and the jam count/speed), and the target-
       hour inputs the dual-path family's future branch reads: hour, weekday, holiday, Arena event day, this exit's
       usual state then (training hours only) and its state one week before (always at or before the origin).
    3. Only the 48 fitted horizons were scored though 1-168 are served, so the pooled score leaned on the short ones;
       one 12-day window, plain accuracy, no interval and a 0.005 tie rule chose the map's model. Now every served
       horizon is scored, in four buckets weighed equally (1-6, 7-24, 25-72, 73-168 h), on macro-F1, with a 95%
       moving-block bootstrap interval over origin days.
    4. The dual-path family (refitted weekly) was scored against an XGBoost refitted every hour. Every candidate is now
       fitted on data before the SAME cut: the saved family's own cut when it can be scored, else the last TEST_DAYS.
  Rule: score = mean over the four buckets of macro-F1, every model and baseline named by decide() (same severe weight).
  Eligible = beats the best baseline on the score AND on hours 1-6. Champion = highest score among the eligible; if
  its lead over the runner-up has a 95% interval that includes 0 and the runner-up is simpler, the runner-up wins.
  With none eligible the best baseline is served and the metrics say so. Brier skill against the probabilistic
  target-hour profile, log-loss and plain accuracy are reported for every model; none of them chooses. The champion is
  then refitted on ALL data before it forecasts (XGBoost, forest, GRU, MSTL); the dual-path family serves the weekly
  fit it was tested as. Labels count each jam in every hour it was on the road (now the default; see --active-hours).
"""
import time as _time_mod
import json
import sys
import warnings

# --dry-run: train, score and print everything, but touch nothing in the
# warehouse. Use it to judge a feature change before the leaderboard and the
# served forecast are overwritten. (Also forced by the publish guard below.)
DRY_RUN = "--dry-run" in sys.argv

# --fast: skip SARIMAX. It is ~90% of the runtime (280 model fits at rolling
# origins) and it has never been accepted — it scores near chance because a
# speed forecast one-hot'd into a class is the wrong shape for this task. A
# scheduled hourly refresh cannot afford 25 minutes; without SARIMAX the same
# run takes about two. Leave it on for a full leaderboard, off for a refresh.
# SARIMAX covers only every 12th origin, so it is reported, never eligible.
FAST = "--fast" in sys.argv

# --with-history: train on silver.waze_jam_hourly_exit (Jan 2022 - Apr 2026,
# rolled up from the Partner Hub export) as well as the live feed, which only
# starts 4 Aug 2026. Ported from Hans's 249c25e (reverted in e6c1e43) with two
# fixes, both of which bore on why history scored worse there:
#   1. Targets are looked up by TIMESTAMP, not by shifting rows. The two eras
#      are not contiguous (nobody collected 20 Apr - 3 Aug 2026), and a
#      positional shift paired an April hour with an August answer.
#   2. History counts distinct jams per exit-hour, the live feed counts jam
#      rows, and the scales differ (about 13.6 vs 6.4 a jam-hour). History
#      counts are rescaled to the live scale so the count features mean the
#      same thing in both eras.
# History rows enter the fit with ONE randomly drawn horizon each rather than
# every horizon (four years x every horizon is tens of millions of rows); the
# live weeks keep every horizon, and every horizon is still predicted.
WITH_HISTORY = "--with-history" in sys.argv
# Active-hours labels (4 Nov 2026): count each live jam in EVERY hour it was on the road, first seen to cleared, instead
# of only the hour it was first seen. silver.fact_waze_jams keeps one row per jam filed under its first hour (checked:
# 100% of rows), while the four-year history counts a jam in each hour it lasted ("a jam lasting three hours counts
# three times"). So a 3-hour jam was one congested hour live and three in history: live read 70% of exit-hours jammed,
# history 87-89%, and the two eras could not be trained together honestly. Counted by hours on the road, live reads
# 81.5%, and its 7,780 jams that lasted over an hour (of 188,947) are congested in every hour they were there.
# experiment_congestion_history.py has the before/after.
# Since 10 Nov 2026 this is the DEFAULT, because it is the correct label (a jam on the road at 15:00 makes 15:00
# congested whichever hour it was first seen); --active-hours is still accepted and changes nothing. --first-hour-labels
# turns it off (the old rule). A saved dual-path family records which rule it learned and is scored only under it.
ACTIVE_HOURS = "--first-hour-labels" not in sys.argv
LABELS = "active_hours" if ACTIVE_HOURS else "first_hour"
# --dualpath-dir NAME: save and load the dual-path family in NAME/ instead of dualpath_models/, so a trial
# (--dualpath-train with history) cannot replace the models the hourly refresh serves.
if "--dualpath-dir" in sys.argv:
    __import__("os").environ["SMARTFLOW_DUALPATH_DIR"] = sys.argv[sys.argv.index("--dualpath-dir") + 1]
# --dualpath-train: also fit the adviser's dual-path LSTM family (congestion_dualpath.py) and save it to
# dualpath_models/. Slow (an hour or more on a laptop CPU), so it belongs to the weekly batch; every other run only
# LOADS the saved models and scores them on this run's test rows beside XGBoost, so the hourly refresh stays fast.
# In a dry run (including one forced by the publish guard) it saves to dualpath_models_dryrun/ unless --dualpath-dir
# says otherwise, so a run that publishes nothing never replaces the models a publishing run loads.
DUALPATH_TRAIN = "--dualpath-train" in sys.argv
DUALPATH_KINDS = ("LSTM (1 layer)", "Stacked LSTM", "Dual-Path LSTM", "Dual-Path LSTM + XGBoost")
# --no-qrf: leave the random forest out. It is about 8 of the run's 14 minutes and has been rejected on every
# run (53% against the 58% exit-hour profile), so the hourly refresh skips it; full runs keep it.
NO_QRF = "--no-qrf" in sys.argv
# --skip-if-batch-running: step aside while the Sunday batch (weekly_retrain.py) is training on this machine,
# rather than compete with it for memory; the map keeps the previous forecast and the next hour runs as usual.
SKIP_IF_BATCH = "--skip-if-batch-running" in sys.argv
# --severe-weight W: how a state is chosen from the probabilities, for EVERY candidate alike, in testing and on the
# map. 1 = the likeliest state. W > 1 counts the chance of Severe W times: missing a severe hour costs W false alarms.
# The plain likeliest state named Severe almost never (XGBoost caught ~11% of severe hours; at Meycauayan the
# map showed 0 severe hours of 24 while 13% of real hours were severe), which the client read as complacent.
SEVERE_WEIGHT = float(sys.argv[sys.argv.index("--severe-weight") + 1]) if "--severe-weight" in sys.argv else 1.0
# --no-mstl: leave out the MSTL candidate (the client's method; about 3 minutes a run).
NO_MSTL = "--no-mstl" in sys.argv
# --results-json PATH: write every score, interval and the choice to PATH (any mode, dry runs included). A publishing
# run also writes congestion_results_horizon.json beside this file, as before.
RESULTS_JSON = sys.argv[sys.argv.index("--results-json") + 1] if "--results-json" in sys.argv else None

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from sklearn.isotonic import IsotonicRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score, log_loss, precision_recall_fscore_support
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

# Connection comes from Back-End/.env (PG_* keys), never from this file: the
# original carried the production password in plain text.
import os
from pathlib import Path

# PUBLISH GUARD (10 Nov 2026). Three machines ran this trainer every hour (this laptop, a teammate's laptop and the
# GitHub runner), each with its own copy and model files, and each replaced the map with its own champion, so the map
# flipped between models from hour to hour. Only ONE machine may publish: the one whose environment sets
# CONGESTION_PUBLISHER=1 (the GitHub workflow). Everywhere else the run is a dry run: it trains, tests and prints
# everything, writes nothing to the database (no forecast, metrics or audit entry) and says so.
PUBLISHER = os.environ.get("CONGESTION_PUBLISHER", "").strip().lower() in ("1", "true", "yes")
if not DRY_RUN and not PUBLISHER:
    print("  PUBLISH GUARD: CONGESTION_PUBLISHER is not set to 1 on this machine, so this run is a DRY RUN and writes "
          "nothing to the database. Only the one publishing machine (the GitHub workflow) sets it.")
    DRY_RUN = True
if DUALPATH_TRAIN and DRY_RUN and "--dualpath-dir" not in sys.argv:
    os.environ["SMARTFLOW_DUALPATH_DIR"] = "dualpath_models_dryrun"
    print("  --dualpath-train in a dry run: the family is saved to dualpath_models_dryrun/, never over dualpath_models/")
_env = {}
for _line in (Path(__file__).resolve().parents[2] / "Back-End" / ".env").read_text().splitlines():
    if "=" in _line and not _line.startswith("#"):
        _k, _v = _line.split("=", 1)
        _env[_k.strip()] = _v.strip().strip('"')
PG = (f"host={_env['PG_HOST']} port={_env.get('PG_PORT', 5432)} dbname={_env['PG_DATABASE']} "
      f"user={_env['PG_USER']} password={_env['PG_PASSWORD']} sslmode=require")
def _audit_refresh(outcome, to_status=None, details=None, from_status=None):
    """One audit_logs entry per published (or failed) run, so the Audit Log shows that the hourly
    train-and-test happened and how it scored; before 2026-10-25 nothing recorded it and each run
    overwrote the last. Own connection, never stops the run, and nothing for a --dry-run (it writes
    nothing, so there is nothing to audit)."""
    if DRY_RUN:
        return
    c_ = None
    try:
        c_ = psycopg2.connect(PG)
        with c_, c_.cursor() as k_:
            k_.execute("SELECT to_regclass('public.audit_logs') IS NOT NULL")
            if not k_.fetchone()[0]:
                return
            k_.execute(
                "INSERT INTO audit_logs (user_id, action, target_resource, details, module, entity_type, entity_id, "
                "from_status, to_status, outcome, duration_ms, actor_role, request_id) "
                "VALUES ('system:congestion-refresh', 'model.live_refresh', 'live_refresh:congestion', %s::jsonb, "
                "'model_training', 'live_refresh', 'congestion', %s, %s, %s, %s, 'system', %s)",
                (json.dumps(details or {}, default=str), from_status, to_status, outcome,
                 int((_time_mod.monotonic() - _RUN_T0) * 1000),
                 f"congestion-refresh-{pd.Timestamp.now():%Y%m%d%H%M}"))
    except Exception as e_:                       # the audit log records the run; it is not part of it
        print(f"  (audit log entry not written: {str(e_).splitlines()[0][:120]})")
    finally:
        if c_ is not None:
            c_.close()


def _audit_failure_hook(exc_type, exc, tb):
    _audit_refresh("failed", details={
        "title": "Congestion forecast (hourly, live feed)",
        "reason": f"{exc_type.__name__}: {str(exc).splitlines()[0][:200] if str(exc) else ''} (during {_STEP_T0[0] or 'start-up'})",
        "host": __import__("socket").gethostname()})
    sys.__excepthook__(exc_type, exc, tb)


sys.excepthook = _audit_failure_hook


def _argval(flag, default):
    """--flag N, for experiments that must not require editing the file."""
    return int(sys.argv[sys.argv.index(flag) + 1]) if flag in sys.argv else default


# How far ahead the map forecasts. The card's day view needs 24 and its week
# view needs 168, all served from this one model, which carries `horizon` as a
# feature — so the only cost of extending is training rows.
#
# Training every hour out to 168 means 2.2M rows and nearly eight minutes, too
# heavy for an hourly job. Beyond the first day the frame is thinned to every
# STRIDE-th hour: accuracy is almost flat in horizon (65.9% at +1h, 64.8% at
# +168h — the recurring weekday-and-hour pattern carries the signal, not the
# recent lags), so the model has nothing to learn from 30h that it did not
# learn from 28h. Every hour is still PREDICTED, and since 10 Nov 2026 every
# hour 1-168 is also SCORED; only the fitting frame is thinned.
MAX_HORIZON = _argval("--max-horizon", 168)
HORIZON_STRIDE = _argval("--horizon-stride", 6)
DENSE_TO = 24                     # every hour out to here, then stride
HORIZONS = sorted(set(range(1, min(MAX_HORIZON, DENSE_TO) + 1)) |
                  set(range(DENSE_TO, MAX_HORIZON + 1, HORIZON_STRIDE)))
# Every hour the card can ask for, whether or not it was a fitting horizon.
SERVE_HORIZONS = list(range(1, MAX_HORIZON + 1))
STATES = ["Low", "Med", "High"]
_DECIDE_W = np.array([1.0, 1.0, SEVERE_WEIGHT])


def decide(proba):
    """The state for each probability row (see --severe-weight); a 1-D row gives one state."""
    return (np.asarray(proba) * _DECIDE_W).argmax(-1)

# Class cuts, in km/h of the exit-hour's length-weighted jam speed.
#
# These were 30 and 60: generic expressway free-flow thresholds. Waze only
# reports a jam on this corridor once traffic is ALREADY slow, so 96% of
# reported jams ran under 30 km/h and 99.9% under 60. Every reported exit-hour
# therefore landed in one class: the served map was solid red, Med was never
# once predicted, and the "three-state" model was really answering the single
# question "was a jam reported here at all".
#
# Re-cut at this corridor's own distribution of exit-hour speeds:
#     under 10 km/h    15.3% of reported cells   crawling
#     10 to 20 km/h    51.5%                     heavy
#     20 km/h and over 33.2%   (joins every hour with no jam reported)
#
# Same speeds, same data — cut where this road actually varies rather than
# where a generic advisory scale says. The UI states the thresholds, so the
# reader is never left guessing what a colour means.
SEVERE_KMH, HEAVY_KMH = 10.0, 20.0
# Twelve, not seven. A seven-day-ahead forecast cannot be scored against a
# seven-day test window: at horizon h only origins in [cut, end - h] have a
# known answer, so h=168 would have exactly zero test rows. Twelve days leaves
# 2,400 scored rows at the far end while still giving the fit four fifths of
# the record. (When a saved dual-path family is scored, the window starts at its
# cut instead, so every candidate is fitted on the same data: see STEP 1b.)
TEST_DAYS = _argval("--test-days", 12)
SEQ_LEN = 24
SARIMAX_ORIGIN_STEP = 12          # refit cadence across the test window
# Scoring (10 Nov 2026). Hours-ahead buckets, weighed equally in the score.
BUCKETS = [(1, 6), (7, 24), (25, 72), (73, 168)]
BUCKET_LABELS = [f"{a}-{b}h" for a, b in BUCKETS]
# Bootstrap blocks of whole origin days (consecutive days share targets and weather), resampled circularly.
BLOCK_DAYS = _argval("--block-days", 3)
BOOT_REPS = _argval("--boot-reps", 1000)
# A saved dual-path family older than this (cut vs this run's default cut) is not scored: the shared cut would be stale.
MAX_BUNDLE_AGE_DAYS = _argval("--max-bundle-age-days", 28)
BASELINE_NAMES = ["Majority class", "Persistence (now)", "Same hour last week", "Exit-hour profile"]
# Lower = simpler; a lead that is not significant goes to the simpler model.
COMPLEXITY = {"Majority class": 0, "Persistence (now)": 0, "Same hour last week": 0, "Exit-hour profile": 0,
              "MSTL": 1, "SARIMAX": 1, "XGBoost": 2, "QRF": 2, "GRU": 3, "LSTM (1 layer)": 3,
              "Stacked LSTM": 4, "Dual-Path LSTM": 5, "Dual-Path LSTM + XGBoost": 6}
REPORT_ONLY = {"SARIMAX"}         # scored on every 12th origin only, so never comparable with the rest


_STEP_T0 = [None, None]  # [name, started_at] of the step currently running
_RUN_T0 = _time_mod.monotonic()


def banner(t):
    """Announce a step, and report how long the previous one took.

    Runs were taking anywhere from five to twenty-six minutes with no way to
    tell which part was responsible: the log said what was happening but never
    how long it had taken, so "make it faster" had nothing to aim at. Each
    step now closes with its own duration, and the run closes with a total.
    """
    if _STEP_T0[0] is not None:
        print(f"  [{_STEP_T0[0]} took {_time_mod.monotonic() - _STEP_T0[1]:.1f}s]")
    _STEP_T0[0], _STEP_T0[1] = t.split(":")[0], _time_mod.monotonic()
    print("\n" + "=" * 70 + f"\n  {t}\n" + "=" * 70, flush=True)


def banner_done():
    """Close the last step and print the run total."""
    if _STEP_T0[0] is not None:
        print(f"  [{_STEP_T0[0]} took {_time_mod.monotonic() - _STEP_T0[1]:.1f}s]")
    print(f"  [total {_time_mod.monotonic() - _RUN_T0:.1f}s]")


# ── 1. Data ─────────────────────────────────────────────────────────────────
banner("STEP 1: Data")
print(f"  labels: {'each jam in every hour it was on the road (active hours)' if ACTIVE_HOURS else 'each jam in its first hour only (--first-hour-labels)'}")
conn = psycopg2.connect(PG)
if SKIP_IF_BATCH:
    with conn.cursor() as _c:
        _busy = None
        # A batch is training only while weekly_retrain.py holds its advisory lock (LOCK_KEY 7421090), which the
        # server releases the moment that process dies. The 'running' status alone is not enough: a batch killed by
        # a shutdown (#12, 2026-10-26 08:49) stays 'running' until the next batch tidies it, and every hourly
        # refresh skipped behind it.
        _c.execute("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND classid = 0 "
                   "AND objid = 7421090 AND objsubid = 1 AND granted)")
        _alive = _c.fetchone()[0]
        if _alive:                                  # the batch creates gold.ml_batch_runs before it takes work
            _c.execute("SELECT id, started_at FROM gold.ml_batch_runs WHERE status = 'running' "
                       "ORDER BY id DESC LIMIT 1")
            _busy = _c.fetchone() or ("?", "now")
    conn.rollback()
    if _busy:
        print(f"  weekly batch #{_busy[0]} is training (started {_busy[1]}); skipping this hour, the map keeps "
              "the previous forecast")
        _audit_refresh("skipped", details={
            "title": "Congestion forecast (hourly, live feed)",
            "reason": f"weekly batch #{_busy[0]} was training on this machine; the map kept the previous forecast",
            "host": __import__("socket").gethostname()})
        conn.close()
        sys.exit(0)
jams = pd.read_sql_query("""
    SELECT j.date_day::date AS d, j.hour_of_day::int AS h,
           COALESCE(e.exit_name,'id_'||j.nlex_exit_id::text) AS exit_name,
           j.speed_kmh::float AS speed, j.length_meters::float AS len
    FROM silver.fact_waze_jams j
    LEFT JOIN bronze.nlex_exits e ON e.id = j.nlex_exit_id
    WHERE j.speed_kmh IS NOT NULL
""", conn)
jams["wlen"] = jams["len"].clip(lower=1.0)
jams["sp_w"] = jams["speed"] * jams["wlen"]
if ACTIVE_HOURS:
    _jl = pd.read_sql_query("""
        SELECT (t)::date AS d, EXTRACT(HOUR FROM t)::int AS h,
               COALESCE(e.exit_name,'id_'||j.nlex_exit_id::text) AS exit_name,
               j.speed_kmh::float AS speed, j.length_meters::float AS len
        FROM silver.fact_waze_jams j
        LEFT JOIN bronze.nlex_exits e ON e.id = j.nlex_exit_id
        CROSS JOIN LATERAL generate_series(date_trunc('hour', j.first_seen_at AT TIME ZONE 'Asia/Manila'),
                                           date_trunc('hour', COALESCE(j.cleared_at, j.last_seen_at, j.first_seen_at) AT TIME ZONE 'Asia/Manila'),
                                           interval '1 hour') AS t
        WHERE j.speed_kmh IS NOT NULL
    """, conn)
    _jl["wlen"] = _jl["len"].clip(lower=1.0)
    _jl["sp_w"] = _jl["speed"] * _jl["wlen"]
    print(f"  active hours: {len(jams):,} live jams counted in {len(_jl):,} jam-hours (each hour it was on the road)")
else:
    _jl = jams
# jams (one row per jam, at its first hour) still decides where collection stopped, below; _jl is what is labelled.
cell = (_jl.groupby(["d", "h", "exit_name"])
        .agg(sp_w=("sp_w", "sum"), wlen=("wlen", "sum"), n_jams=("speed", "size")).reset_index())
cell["speed"] = cell.sp_w / cell.wlen
cell = cell[["d", "h", "exit_name", "speed", "n_jams"]]
LIVE_FROM = cell.d.min()

hist_cell = None
if WITH_HISTORY:
    # The stored summary splits each exit-hour by on_corridor / at_exit, so the
    # length-weighted speed is rebuilt from its parts rather than averaged again:
    # sum(len) = length_m_avg * jam_snapshots, sum(speed*len) = wavg * sum(len).
    # All rows, whatever their distance, because the live branch above takes
    # every jam assigned to the exit too; the two labels must mean one thing.
    # Summed in the database, one row per exit-hour, so a quarter fewer rows
    # cross the network -- a million-row pull is the slow part of this run.
    hist = pd.read_sql_query("""
        SELECT h.date_day::date AS d, h.hour_of_day::int AS h,
               COALESCE(e.exit_name,'id_'||h.nlex_exit_id::text) AS exit_name,
               SUM(h.length_m_avg * h.jam_snapshots)::real                    AS wlen,
               SUM(h.speed_kmh_wavg * h.length_m_avg * h.jam_snapshots)::real AS sp_w,
               SUM(h.jams_distinct)::real                                     AS n_jams
          FROM silver.waze_jam_hourly_exit h
          LEFT JOIN bronze.nlex_exits e ON e.id = h.nlex_exit_id
         WHERE h.speed_kmh_wavg IS NOT NULL
         GROUP BY 1, 2, 3
    """, conn)
    hist_cell = (hist.groupby(["d", "h", "exit_name"])
                 .agg(sp_w=("sp_w", "sum"), wlen=("wlen", "sum"), n_jams=("n_jams", "sum")).reset_index())
    hist_cell["speed"] = hist_cell.sp_w / hist_cell.wlen
    hist_cell = hist_cell[["d", "h", "exit_name", "speed", "n_jams"]]
    # Live wins on any overlapping day: it is the finer record.
    hist_cell = hist_cell[~hist_cell.d.isin(set(cell.d))]
    _scale = cell.n_jams.mean() / max(hist_cell.n_jams.mean(), 1e-9)
    print(f"  history jam counts rescaled x{_scale:.3f} "
          f"(mean {hist_cell.n_jams.mean():.2f} -> live mean {cell.n_jams.mean():.2f} a jam-hour)")
    hist_cell["n_jams"] = hist_cell.n_jams * _scale
    print(f"  history: {len(hist_cell):,} exit-hours, {hist_cell.d.min()} .. {hist_cell.d.max()}")
    print(f"  live   : {len(cell):,} exit-hours, {cell.d.min()} .. {cell.d.max()}")

# Trim the trailing INGESTION GAP before building the grid.
#
# The label rule treats "no jam reported" as free flow. That is right for a
# quiet road and badly wrong for an hour that was never collected: the last
# partial day of Waze data had 51 records over 4 hours against ~2,300 over 24 on
# every other day, and the grid turned the missing 20 hours into a fabricated
# empty corridor. The served forecast then read that as "all clear" while the
# preceding week ran 59% severe.
#
# Cut at the last hour whose record count reaches a fraction of the recent
# typical hour, so genuinely quiet hours survive but uncollected ones do not.
# Compared against the norm FOR THAT HOUR OF DAY, not against all hours.
# A flat threshold is dominated by daytime volume, so 3am legitimately falls
# under it and gets discarded as if ingestion had failed — which cost ~19 hours
# of freshness and left the dashboard showing a forecast for a day that had
# already finished. Quiet hours are quiet; missing hours are missing.
_ts = pd.to_datetime(jams.d.astype(str)) + pd.to_timedelta(jams.h, unit="h")
_per_hr = jams.assign(ts=_ts).groupby("ts").size().sort_index()
_recent = _per_hr.tail(24 * 14)
_by_hod = _recent.groupby(_recent.index.hour).median()
_expected = pd.Series(_per_hr.index.hour, index=_per_hr.index).map(_by_hod).fillna(_by_hod.median())
_ok = _per_hr[_per_hr >= _expected * 0.25]
if len(_ok):
    _last_good = _ok.index.max()
    _dropped = (_per_hr.index > _last_good).sum()
    if _dropped:
        print(f"  trimming {_dropped} trailing hour(s) below 25% of their "
              f"hour-of-day norm; last complete hour {_last_good}")
    jams = jams[pd.to_datetime(jams.d.astype(str)) + pd.to_timedelta(jams.h, unit="h") <= _last_good]

exits = sorted(jams.exit_name.unique())
if hist_cell is not None and len(hist_cell):
    # Only exits the live feed knows: the forecast is served for those.
    hist_cell = hist_cell[hist_cell.exit_name.isin(set(exits))]
    cell = pd.concat([hist_cell, cell], ignore_index=True)

# Days on which SOMETHING was collected. "No jam reported" means free flow on a
# collected day and means nothing at all on a day nobody was watching -- and
# between the export (ends 19 Apr 2026) and the live collector (4 Aug 2026)
# there are over a hundred such days. Filling those with free flow would invent
# a clear corridor for three and a half months.
collected = set(cell.d.unique())
days = pd.date_range(min(cell.d), jams.d.max(), freq="D").date
df = (pd.MultiIndex.from_product([days, range(24), exits], names=["d", "h", "exit_name"])
      .to_frame(index=False).merge(cell, on=["d", "h", "exit_name"], how="left"))
df["y"] = np.where(df.speed.isna(), 0.0,
                   np.where(df.speed < SEVERE_KMH, 2.0, np.where(df.speed < HEAVY_KMH, 1.0, 0.0)))
df["n_jams"] = df.n_jams.fillna(0)
df["speed_filled"] = df.speed.fillna(65.0)
# Uncollected days carry NaN, not zero, so every lag or rolling feature that
# reaches into the hole is NaN too and the row is dropped below rather than
# trained on a fiction.
_uncollected = ~df.d.isin(collected)
if _uncollected.any():
    df.loc[_uncollected, ["y", "n_jams", "speed_filled"]] = np.nan
    print(f"  {_uncollected.sum() // (24 * max(1, len(exits))):,} uncollected day(s) held out of the grid")
df["ts"] = pd.to_datetime(df.d.astype(str)) + pd.to_timedelta(df.h, unit="h")
# The MultiIndex spans whole days, so the final day's uncollected hours would
# reappear here as free flow even after trimming the raw jams above.
if len(_ok):
    df = df[df.ts <= _last_good]
df = df.sort_values(["exit_name", "ts"]).reset_index(drop=True)
df["dow"] = df.ts.dt.dayofweek
df["is_weekend"] = (df.dow >= 5).astype(int)
g = df.groupby("exit_name", sort=False)
df["lag24"] = g.y.shift(24)
df["lag48"] = g.y.shift(48)
df["lag24_jams"] = g.n_jams.shift(24)
# Recent state, not just the same hour yesterday. The original feature set
# knew only lag24/lag48, so at +1h the model could not see that the exit was
# jammed sixty minutes ago -- which is why it barely beat the exit-hour
# profile baseline. Everything here is knowable at ts (shift >= 1), so it is
# legitimate for every horizon; its value naturally fades as h grows.
for _k in (1, 2, 3, 6):
    df[f"lag{_k}"] = g.y.shift(_k)
df["roll6_y"] = g.y.transform(lambda s_: s_.shift(1).rolling(6, min_periods=1).mean())
df["roll6_jams"] = g.n_jams.transform(lambda s_: s_.shift(1).rolling(6, min_periods=1).mean())
df["roll24_y"] = g.y.transform(lambda s_: s_.shift(1).rolling(24, min_periods=1).mean())
# Neighbours. Congestion propagates along the carriageway, so the state of
# the next exit down the road an hour ago is a leading indicator the exit's
# own history cannot supply. Exits are ordered by km-post from the same table
# the map uses to order its rows, and each gets its two neighbours' lag-1
# state and 6-hour mean. The two end exits have one neighbour; the missing
# side is filled with their own value so the column is never null.
_km = pd.read_sql_query("SELECT exit_name, km_post::float AS km FROM gold.exit_km_post", conn)
_km_order = [e for e in _km.sort_values("km").exit_name if e in set(exits)]
_km_order += [e for e in exits if e not in _km_order]          # any exit without a km-post goes last
_pos = {e: i for i, e in enumerate(_km_order)}
_prev = {e: (_km_order[_pos[e] - 1] if _pos[e] > 0 else e) for e in _km_order}
_next = {e: (_km_order[_pos[e] + 1] if _pos[e] < len(_km_order) - 1 else e) for e in _km_order}
_piv_y = df.pivot(index="ts", columns="exit_name", values="y").sort_index()
_piv_r6 = df.pivot(index="ts", columns="exit_name", values="roll6_y").sort_index()
_lag1_p = _piv_y.shift(1)
def _nb(col_src, mapping):
    out = pd.DataFrame(index=col_src.index)
    for e in _km_order:
        out[e] = col_src[mapping[e]]
    return out.stack().rename("v").reset_index().rename(columns={"level_1": "exit_name"})
for _name, _src, _map in (("nb_prev_lag1", _lag1_p, _prev), ("nb_next_lag1", _lag1_p, _next),
                          ("nb_prev_roll6", _piv_r6, _prev), ("nb_next_roll6", _piv_r6, _next),
                          # the neighbours' state AT the origin hour (known then, as the exit's own is; 10 Nov 2026)
                          ("nb_prev_now", _piv_y, _prev), ("nb_next_now", _piv_y, _next)):
    _t = _nb(_src, _map).rename(columns={"v": _name})
    df = df.merge(_t, on=["ts", "exit_name"], how="left")

# Holidays and Arena event days: known in advance. The dual-path family's future branch reads them, and since
# 10 Nov 2026 XGBoost does too (feature parity, EVALUATION_PROTOCOL.md section 4).
_hol = pd.read_sql_query("SELECT date_day::date AS d FROM public.ph_holidays", conn)
_evd = pd.read_sql_query("SELECT DISTINCT event_date::date AS d FROM silver.philippine_arena_events_clean "
                         "WHERE event_date IS NOT NULL", conn)
HOL = set(pd.to_datetime(_hol.d)); EVD = set(pd.to_datetime(_evd.d))

# The whole grid, uncollected hours included, for the dual-path family's own windows (step 6b), and every known state
# as one dense [exit, hour] array: the TARGET of a row is looked up by its timestamp (never by shifting rows, which
# across a gap in collection pairs an hour with the wrong answer), and so is the state a week before it. Taken before
# the lag-based drop below, so an hour whose own lags are missing can still be the ANSWER for an earlier row.
_grid = df[["ts", "exit_name", "y", "n_jams", "speed_filled"]].copy()
G0 = _grid.ts.min()
_EXIT_CODE = {e: i for i, e in enumerate(exits)}
_g_hr = ((_grid.ts - G0) // pd.Timedelta(hours=1)).to_numpy(int)
NHR = int(_g_hr.max()) + MAX_HORIZON + 2
YG = np.full((len(exits), NHR), np.nan, np.float32)
YG[_grid.exit_name.map(_EXIT_CODE).to_numpy(), _g_hr] = _grid.y.to_numpy(np.float32)
_days_all = pd.date_range(G0.normalize(), periods=NHR // 24 + 3, freq="D")
HOL_D = np.array([d in HOL for d in _days_all], np.float32)
EV_D = np.array([d in EVD for d in _days_all], np.float32)
DOW0, H0 = int(G0.normalize().dayofweek), int(G0.hour)

df = df.dropna(subset=["y", "lag24", "lag48", "lag6"]).reset_index(drop=True)
df["y"] = df.y.astype(int)
df["exit_code"] = pd.Categorical(df.exit_name, categories=exits).codes
df["hr"] = ((df.ts - G0) // pd.Timedelta(hours=1)).astype(int)
# The state at the origin hour itself, and its jam count and speed: known at ts, as persistence, the GRU and the
# dual-path family all use them (10 Nov 2026; XGBoost's inputs used to stop an hour earlier).
df["y_now"] = df.y.astype(float)
df["jams_now"] = df.n_jams
df["speed_now"] = df.speed_filled
END_TS = df.ts.max()
END_HR = int((END_TS - G0) / pd.Timedelta(hours=1))
print(f"  {len(df):,} exit-hours | {len(exits)} exits | {df.ts.min()} .. {END_TS}")

# ── 1b. The shared cut ──────────────────────────────────────────────────────
# Every candidate is fitted on data before the SAME cut, so none is scored with fresher data than another. A saved
# dual-path family is fitted weekly, before its own cut; when it can be scored, the whole test starts at that cut.
import congestion_dualpath as dp
DEFAULT_CUT = END_TS.normalize() - pd.Timedelta(days=TEST_DAYS - 1)
cut, dp_skip = DEFAULT_CUT, None
if not DUALPATH_TRAIN:
    _dpm, dp_skip = dp.peek()
    if _dpm is not None:
        _bcut = pd.Timestamp(_dpm["cut"])
        if _dpm["labels"] != LABELS:
            dp_skip = f"it learned {_dpm['labels']} labels and this run uses {LABELS}"
        elif list(_dpm["exits"]) != list(exits):
            dp_skip = "it was trained on a different set of exits"
        elif _bcut > DEFAULT_CUT:
            dp_skip = f"it was fitted up to {_bcut}, inside this run's test window"
        elif DEFAULT_CUT - _bcut > pd.Timedelta(days=MAX_BUNDLE_AGE_DAYS):
            dp_skip = f"its cut {_bcut.date()} is over {MAX_BUNDLE_AGE_DAYS} days old"
        else:
            cut = _bcut
if dp_skip:
    print(f"  dual-path family will not be scored: {dp_skip}")
print(f"  shared cut {cut}: every candidate is fitted on targets before it and tested on origins from it"
      + (" (the saved dual-path family's cut)" if cut != DEFAULT_CUT else ""))
CAL_DAYS = 2
cal_cut = cut - pd.Timedelta(days=CAL_DAYS)
CUT_HR = int((cut - G0) / pd.Timedelta(hours=1))
CAL_HR = int((cal_cut - G0) / pd.Timedelta(hours=1))


def profile_arrays(until):
    """What each exit usually does at each hour of the day, weekday vs weekend, from hours before `until` only:
    the share of each state [exit, hour, weekend, 3], its mean state, and the overall shares."""
    h_ = df[df.ts < until]
    cnt = np.zeros((len(exits), 24, 2, 3))
    np.add.at(cnt, (h_.exit_code.to_numpy(), h_.h.to_numpy(), h_.is_weekend.to_numpy(), h_.y.to_numpy()), 1)
    overall = np.bincount(h_.y.to_numpy(), minlength=3) / max(len(h_), 1)
    tot = cnt.sum(-1, keepdims=True)
    shares = np.where(tot > 0, cnt / np.maximum(tot, 1), overall).astype(np.float32)
    return shares, (shares @ np.arange(3.0)).astype(np.float32), overall


# ── 2. Horizon-expanded frames, with the target ACTUALLY shifted ────────────
banner("STEP 2: Building horizon targets")
ORIG_FEATS = ["exit_code", "h", "dow", "is_weekend", "lag24", "lag48", "lag24_jams", "lag1", "lag2", "lag3", "lag6",
              "roll6_y", "roll6_jams", "roll24_y", "nb_prev_lag1", "nb_next_lag1", "nb_prev_roll6", "nb_next_roll6",
              "y_now", "jams_now", "speed_now", "nb_prev_now", "nb_next_now"]
FEATS = ["exit_code", "h", "dow", "is_weekend", "lag24", "lag48", "lag24_jams",
         "lag1", "lag2", "lag3", "lag6", "roll6_y", "roll6_jams", "roll24_y",
         "nb_prev_lag1", "nb_next_lag1", "nb_prev_roll6", "nb_next_roll6",
         "prof_mean", "prof_sev", "horizon",
         # 10 Nov 2026: the state at the origin itself ...
         "y_now", "jams_now", "speed_now", "nb_prev_now", "nb_next_now",
         # ... and what the dual-path family's future branch knows about the TARGET hour
         "tgt_h", "tgt_dow", "tgt_weekend", "tgt_holiday", "tgt_event", "tgt_prof_mean", "tgt_prof_sev", "tgt_lastweek"]
_O = {c: df[c].to_numpy(np.float32) for c in ORIG_FEATS}
_EC, _HR = df.exit_code.to_numpy(), df.hr.to_numpy()
_H, _WK = df.h.to_numpy(), df.is_weekend.to_numpy()


def make_frame(pos, hz, prof, need_target=True):
    """One row per (origin row `pos`, horizon `hz`): the FEATS (float32) and the row's target. Rows whose target is
    unknown (past the data, or an uncollected hour) are dropped when need_target."""
    shares, mean, _ = prof
    pos, hz = np.asarray(pos), np.asarray(hz)
    ec, th = _EC[pos], _HR[pos] + hz
    yt = None
    if need_target:
        yt = YG[ec, np.minimum(th, NHR - 1)]
        keep = ~np.isnan(yt) & (th < NHR)
        pos, hz, ec, th, yt = pos[keep], hz[keep], ec[keep], th[keep], yt[keep].astype(int)
    out = {c: _O[c][pos] for c in ORIG_FEATS}
    oh, ow = _H[pos], _WK[pos]
    out["prof_mean"], out["prof_sev"] = mean[ec, oh, ow], shares[ec, oh, ow, 2]
    out["horizon"] = hz
    tod = (H0 + th) % 24
    tday = (H0 + th) // 24
    tdow = (DOW0 + tday) % 7
    twk = (tdow >= 5).astype(int)
    out.update(tgt_h=tod, tgt_dow=tdow, tgt_weekend=twk, tgt_holiday=HOL_D[tday], tgt_event=EV_D[tday],
               tgt_prof_mean=mean[ec, tod, twk], tgt_prof_sev=shares[ec, tod, twk, 2])
    lw = th - 168                                  # one week before the target: at or before the origin (h <= 168)
    out["tgt_lastweek"] = np.where(lw >= 0, YG[ec, np.maximum(lw, 0)], np.nan)
    # One float32 block (no per-column copies): the training frame is ~2M rows, and this laptop runs out of memory.
    arr = np.empty((len(pos), len(FEATS)), np.float32)
    for j, c in enumerate(FEATS):
        arr[:, j] = out[c]
    X = pd.DataFrame(arr, columns=FEATS, copy=False)
    return X, {"pos": pos, "hz": hz, "ec": ec, "th": th, "tgt_p": shares[ec, tod, twk], "y_target": yt}


# History rows (before the live feed starts) each get ONE horizon, drawn at random but reproducibly; live rows get
# every fitted horizon. See WITH_HISTORY.
_is_hist = (df.ts < pd.Timestamp(LIVE_FROM)).to_numpy()
_hist_hz = np.random.default_rng(20261002).choice(HORIZONS, size=len(df))
if _is_hist.any():
    print(f"  history origins: {_is_hist.sum():,} (one horizon each) | live origins: {(~_is_hist).sum():,}")


def fit_positions(until_hr, cal_from_hr):
    """(origin rows, horizons) to fit on: every TARGET before until_hr (a row whose target lands past the cut would
    leak), live origins at every fitted horizon, history origins at their one drawn horizon. Rows whose target is in
    the calibration days (>= cal_from_hr) come last, so the fit and calibration parts are slices, not copies."""
    live = np.where(~_is_hist & (_HR < until_hr))[0]
    hist_ = np.where(_is_hist & (_HR < until_hr))[0]
    pos = np.concatenate([np.repeat(live, len(HORIZONS)), hist_])
    hz = np.concatenate([np.tile(np.asarray(HORIZONS), len(live)), _hist_hz[hist_]])
    keep = _HR[pos] + hz < until_hr
    pos, hz = pos[keep], hz[keep]
    order = np.argsort(_HR[pos] + hz >= cal_from_hr, kind="stable")
    return pos[order], hz[order]


del jams, _jl, cell, hist_cell, _piv_y, _piv_r6, _lag1_p, _t       # raw tables: the grid and df carry what is needed
__import__("gc").collect()
PROF_EVAL = profile_arrays(cut)
Xtr, mtr = make_frame(*fit_positions(CUT_HR, CAL_HR), PROF_EVAL)
ytr = mtr["y_target"]
# Test rows: every origin hour from the cut, at EVERY served horizon 1-168 whose answer is known.
_te_orig = np.where(df.ts.to_numpy() >= np.datetime64(cut))[0]
Xte, mte = make_frame(np.repeat(_te_orig, MAX_HORIZON), np.tile(np.arange(1, MAX_HORIZON + 1), len(_te_orig)), PROF_EVAL)
yte = mte["y_target"]
te_ts = df.ts.to_numpy()[mte["pos"]]
te_exit = df.exit_name.to_numpy()[mte["pos"]]
print(f"  train {len(Xtr):,} rows (fitted horizons {len(HORIZONS)}) | test {len(Xte):,} rows "
      f"(every horizon 1-{MAX_HORIZON}, origins {pd.Timestamp(te_ts.min())} .. {pd.Timestamp(te_ts.max())})")
print("  test rows per bucket: " + ", ".join(
    f"{lab} {((mte['hz'] >= a) & (mte['hz'] <= b)).sum():,}" for lab, (a, b) in zip(BUCKET_LABELS, BUCKETS)))
print(f"  class balance (test): " +
      ", ".join(f"{STATES[k]} {np.mean(yte == k) * 100:.1f}%" for k in range(3)))
# Sanity: the target must actually MOVE with the horizon. Measure the share of rows whose future state differs from
# the present one, across the series.
_hz_tr, _ynow_tr = mtr["hz"], Xtr.y_now.to_numpy()
_drift = [float((ytr[_hz_tr == hz] != _ynow_tr[_hz_tr == hz]).mean()) for hz in HORIZONS]
print("  sanity — share of rows where state(ts+h) != state(ts): " +
      ", ".join(f"+{hz}h {d * 100:.0f}%" for hz, d in zip(HORIZONS, _drift) if hz in (1, 2, 3, 6, 12, 24, 48, 96, 168)))
assert _drift[-1] > _drift[0] > 0, "target does not move with the horizon - the shift is broken"

# ── 3. Baselines ────────────────────────────────────────────────────────────
banner("STEP 3: Baselines")


def onehot(states):
    """One-hot rows for a state per row; rows with no state (NaN) are flagged."""
    s = np.asarray(states, float)
    ok = ~np.isnan(s)
    out = np.zeros((len(s), 3), np.float32)
    out[np.where(ok)[0], s[ok].astype(int)] = 1.0
    return out, ok


maj = int(np.bincount(ytr, minlength=3).argmax())
results, covered = {}, {}                 # name -> [n_test, 3] probabilities; name -> rows it can score
results["Majority class"] = np.tile(np.eye(3, dtype=np.float32)[maj], (len(yte), 1))
# "Nothing changes": whatever the state is NOW, hz hours from now. It decays with horizon.
results["Persistence (now)"] = onehot(Xte.y_now)[0]
# The same hour one week earlier (always at or before the origin): the seasonal naive.
results["Same hour last week"], covered["Same hour last week"] = onehot(Xte.tgt_lastweek)
# What this exit usually does at the TARGET hour on that kind of day (training hours only), as a probability; its
# state is named by decide(), the same rule as every candidate's.
results["Exit-hour profile"] = mte["tgt_p"].astype(np.float32)
print("  majority class, persistence, same hour last week, and the target-hour profile (exit x hour x weekend);")
print("  scored with the candidates in STEP 8")

# ── 4. Tabular candidates ───────────────────────────────────────────────────
banner("STEP 4: XGBoost")
# Balance the classes.
#
# Severe is 13.5% of the training rows, Heavy 38%, Moving 49%. Left unweighted,
# argmax over the predicted probabilities never once chose Severe: the first
# served forecast under these cuts had 0 severe cells in all 240, while the
# corridor at that hour actually had 3-5 exits crawling under 10 km/h. A model
# that cannot say "severe" is no use for the one state anyone acts on.
#
# Weighting each row by the inverse frequency of its class stops the rare class
# being optimised away. Raw accuracy falls slightly because the majority class
# no longer gets a free ride; macro F1 -- which weights all three states alike,
# and is the number that matters when the rare state is the important one --
# rises. Both are printed below.
#
# Calibrate the probabilities, because the card shows them as a CHANCE.
#
# Raw, the model ran hot: in held-out hours where it said "65% chance of
# congestion" the exit was congested 50% of the time, and at 75% said, 61%
# happened. A weather strip that says 70% and is right half the time is not a
# forecast. So the last CAL_DAYS of the training window are held back from
# the fit and used to learn an isotonic correction per class (one-vs-rest,
# then renormalised). Nothing from the test window touches either step.


class IsoCal:
    """One isotonic curve per class on the raw probabilities, rows renormalised.
    Written out rather than CalibratedClassifierCV because that class dropped
    cv="prefit" between scikit-learn releases and this has to run unattended."""
    def __init__(self, base, X, y):
        self.base = base
        raw_p = base.predict_proba(X)
        self.iso = [IsotonicRegression(out_of_bounds="clip").fit(raw_p[:, k], (y == k).astype(float))
                    for k in range(raw_p.shape[1])]

    def predict_proba(self, X):
        raw_p = self.base.predict_proba(X)
        cal = np.column_stack([self.iso[k].predict(raw_p[:, k]) for k in range(raw_p.shape[1])])
        cal = np.clip(cal, 1e-6, None)
        return cal / cal.sum(axis=1, keepdims=True)


def class_weights(y):
    cls, cnt = np.unique(y, return_counts=True)
    w = {int(c): len(y) / (len(cls) * n) for c, n in zip(cls, cnt)}
    return w, np.array([w[int(v)] for v in y], np.float32)


def fit_xgb(X, y, th, cal_from_hr):
    """XGBoost fitted on targets before cal_from_hr, isotonic calibration on the targets from it (the last
    CAL_DAYS of the window). Returns (calibrated, raw)."""
    w_, wts = class_weights(y)
    fitm = th < cal_from_hr
    k = int(fitm.sum())
    print("  class weights: " + ", ".join(f"{STATES[c]} {v:.2f}" for c, v in w_.items()) +
          f" | fit {k:,} rows | calibration {len(y) - k:,} rows (last {CAL_DAYS} days)")
    assert fitm[:k].all(), "fit_positions puts the calibration rows last"
    raw = XGBClassifier(n_estimators=400, max_depth=6, learning_rate=0.08, subsample=0.9,
                        colsample_bytree=0.9, objective="multi:softprob", num_class=3,
                        eval_metric="mlogloss", random_state=42, n_jobs=4
                        ).fit(X.iloc[:k], y[:k], sample_weight=wts[:k])
    return IsoCal(raw, X.iloc[k:], y[k:]), raw


xgb, xgb_raw = fit_xgb(Xtr, ytr, mtr["th"], CAL_HR)
results["XGBoost"] = xgb.predict_proba(Xte).astype(np.float32)
results_raw_xgb = xgb_raw.predict_proba(Xte)          # kept to show what calibration changed
print("  done.")

banner("STEP 5: Quantile Random Forest")
qrf = None
if NO_QRF:
    print("  SKIPPED: --no-qrf (rejected on every run; about 8 minutes of the hourly refresh)")
else:
    qrf = RandomForestClassifier(n_estimators=300, max_depth=14, min_samples_leaf=5,
                                 class_weight="balanced",   # same reason as XGBoost above
                                 random_state=42, n_jobs=4).fit(Xtr, ytr)
    results["QRF"] = qrf.predict_proba(Xte).astype(np.float32)
    print("  done.")

# ── 5. GRU — one pass, every horizon ────────────────────────────────────────
banner("STEP 6: GRU (multi-horizon head, all 168 hours)")
gru = None
# Live weeks only, with or without --with-history: four years of sliding
# windows is several million sequences, and the history era is separated from
# the live one by an uncollected gap no window may span.
_gdf = df[df.ts >= pd.Timestamp(LIVE_FROM)]
_hrs = pd.date_range(_gdf.ts.min(), _gdf.ts.max(), freq="h")
# Reindexed to every hour, so a missing hour is a NaN (skipped) and never shifts a window or a target by its position.
piv = _gdf.pivot_table(index="ts", columns="exit_code", values="y").sort_index().reindex(_hrs)
jm = _gdf.pivot_table(index="ts", columns="exit_code", values="n_jams").sort_index().reindex(_hrs)
HZ = np.arange(1, MAX_HORIZON + 1)


def gru_seqs(keep, need_y):
    """X is the SEQ_LEN hours ending at t (the state at t is known, as for every candidate); Y is the state at t + 1 ..
    t + 168, so output k is horizon k + 1 (it was the 48 fitted horizons only, so the map's GRU forecast had 48 of the
    168 hours). Windows and targets touching an uncollected hour are left out."""
    arr, jarr = piv.values, jm.values
    X, Y, meta = [], [], []
    for i in range(SEQ_LEN - 1, len(piv)):
        t = piv.index[i]
        if not keep(t):
            continue
        tgt = i + HZ
        if need_y and tgt[-1] >= len(piv):
            continue
        for c in range(arr.shape[1]):
            w = arr[i - SEQ_LEN + 1:i + 1, c]
            if np.isnan(w).any():
                continue
            yv = arr[tgt, c] if need_y else np.zeros(len(HZ))
            if np.isnan(yv).any():
                continue
            X.append(np.stack([w, jarr[i - SEQ_LEN + 1:i + 1, c]], -1))
            Y.append(yv)
            meta.append((t, int(piv.columns[c])))
    return np.array(X, "float32"), np.array(Y, "int32"), meta


def fit_gru(until):
    """A GRU fitted on windows whose whole target block precedes `until`."""
    import tensorflow as tf
    from tensorflow.keras import layers, Sequential
    tf.random.set_seed(42)
    Xs, ys, _ = gru_seqs(lambda t: t + pd.Timedelta(hours=int(HZ[-1])) < until, True)
    m = Sequential([
        layers.Input((SEQ_LEN, 2)), layers.GRU(48), layers.Dropout(0.2),
        layers.Dense(64, activation="relu"),
        layers.Dense(len(HZ) * 3), layers.Reshape((len(HZ), 3)), layers.Softmax(axis=-1),
    ])
    m.compile("adam", "sparse_categorical_crossentropy", metrics=["accuracy"])
    m.fit(Xs, ys, epochs=25, batch_size=128, verbose=0)
    return m, len(Xs)


try:
    gru, _n_gru = fit_gru(cut)
    Xs_te, _, meta_te = gru_seqs(lambda t: t >= cut, False)
    pg_ = gru.predict(Xs_te, verbose=0)                       # (n, 168, 3)
    print(f"  sequences: train {_n_gru:,} | test {len(Xs_te):,} (len {SEQ_LEN}, {len(HZ)} outputs)")
    _gi = {(pd.Timestamp(t), c): i for i, (t, c) in enumerate(meta_te)}
    gi = np.array([_gi.get((pd.Timestamp(t), int(c)), -1) for t, c in zip(df.ts.to_numpy()[mte["pos"]], mte["ec"])])
    covered["GRU"] = gi >= 0
    results["GRU"] = np.where(covered["GRU"][:, None], pg_[np.maximum(gi, 0), mte["hz"] - 1], 1 / 3).astype(np.float32)
    print("  done.")
except Exception as e:
    print(f"  SKIPPED: {type(e).__name__}: {str(e)[:100]}")
    gru = None

# ── 5b. Dual-path LSTM family (adviser's brief, 2026-10-24) ─────────────────
banner("STEP 6b: Dual-path LSTM family (1-layer, stacked, dual-path, dual-path + XGBoost)")
dp_bundle = dp_panel = None
try:
    if DUALPATH_TRAIN:
        _calm = mtr["th"] >= CAL_HR
        _cal_rows = pd.DataFrame({"ts": df.ts.to_numpy()[mtr["pos"][_calm]],
                                  "exit_name": df.exit_name.to_numpy()[mtr["pos"][_calm]], "horizon": mtr["hz"][_calm]})
        dp.train_all(_grid, exits, _prev, _next, cut, cal_cut, _cal_rows, Xtr[_calm].reset_index(drop=True),
                     ytr[_calm], PG, WITH_HISTORY, LABELS)
    if dp_skip is None:
        dp_bundle = dp.load()
    if dp_bundle is not None and pd.Timestamp(dp_bundle["meta"]["cut"]) != cut:
        print(f"  SKIPPED: the loaded family's cut {dp_bundle['meta']['cut']} is not this run's shared cut {cut}")
        dp_bundle = None
    if dp_bundle is not None:
        dp_panel = dp.panel_for(dp_bundle, _grid, exits, _prev, _next, PG)
        _rows = pd.DataFrame({"ts": te_ts, "exit_name": te_exit, "horizon": mte["hz"]})
        _dp_p, _dp_ok = dp.proba(dp_bundle, dp_panel, _rows, Xte)
        for _k in DUALPATH_KINDS:
            results[_k] = _dp_p[_k]
            covered[_k] = _dp_ok
        print(f"  loaded models trained {dp_bundle['meta']['trained_at']} (cut {dp_bundle['meta']['cut']}, fitted to "
              f"{dp_bundle['meta']['val_start']}, labels {dp_bundle['meta']['labels']}, history="
              f"{dp_bundle['meta']['with_history']}); complete inputs for {_dp_ok.mean() * 100:.1f}% of test rows")
    elif dp_skip:
        print(f"  SKIPPED: {dp_skip}")
except Exception as e:
    print(f"  SKIPPED: {type(e).__name__}: {str(e)[:160]}")
    dp_bundle = dp_panel = None
    for _k in DUALPATH_KINDS:
        results.pop(_k, None)
        covered.pop(_k, None)

# ── 6. SARIMAX — refit at rolling origins ───────────────────────────────────
banner("STEP 7: SARIMAX (rolling origins, horizon-matched)")
if FAST:
    print("  SKIPPED: --fast. SARIMAX is ~90% of the runtime and has never been accepted.")
try:
    if FAST:
        raise RuntimeError("skipped by --fast")
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    origins = pd.to_datetime(np.unique(te_ts))[::SARIMAX_ORIGIN_STEP]
    print(f"  {len(origins)} origins x {len(exits)} exits, forecasting {MAX_HORIZON} steps each")
    pred_map = {}
    fits = fails = 0
    for c in range(len(exits)):
        s = df[df.exit_code == c].set_index("ts").speed_filled.sort_index()
        for o in origins:
            hist = s[s.index <= o]                   # standing at o: the speed at o is known
            if len(hist) < 48:
                continue
            try:
                m = SARIMAX(hist, order=(1, 0, 1), seasonal_order=(1, 0, 1, 24),
                            enforce_stationarity=False, enforce_invertibility=False).fit(disp=False)
                fc = np.asarray(m.forecast(MAX_HORIZON))
                fits += 1
            except Exception:
                fc = np.full(MAX_HORIZON, hist.mean())
                fails += 1
            # step hz of a forecast made at o is the hour o + hz (it was indexed by fitted-horizon position, so
            # +30h read step 25)
            for hz in SERVE_HORIZONS:
                pred_map[(o, c, hz)] = fc[hz - 1]
    print(f"  fitted {fits}, fell back {fails}")

    def _onehot_speed(v):
        k = 2 if v < SEVERE_KMH else (1 if v < HEAVY_KMH else 0)
        p = np.full(3, 0.05)
        p[k] = 0.90
        return p

    _keys = list(zip(pd.to_datetime(te_ts), mte["ec"].tolist(), mte["hz"].tolist()))
    covered["SARIMAX"] = np.array([k in pred_map for k in _keys])
    results["SARIMAX"] = np.array([_onehot_speed(pred_map[k]) if k in pred_map else np.full(3, 1 / 3)
                                   for k in _keys], np.float32)
    print(f"  horizon-matched coverage: {covered['SARIMAX'].sum():,}/{len(_keys):,} test rows "
          f"({covered['SARIMAX'].mean() * 100:.1f}%); reported only, never eligible")
except Exception as e:
    print(f"  SKIPPED: {str(e)[:100]}")

# ── 6c. MSTL — the client's method ──────────────────────────────────────────
banner("STEP 7b: MSTL + exponential smoothing (the client's method)")
mstl_state = None
if NO_MSTL:
    print("  SKIPPED: --no-mstl")
else:
    try:
        from statsmodels.tsa.seasonal import MSTL
        from statsmodels.tsa.holtwinters import SimpleExpSmoothing

        # Each exit's hourly jam speed on the live weeks (65 km/h where no jam was reported, as the labels assume;
        # an uncollected stretch is interpolated, since MSTL needs an unbroken series).
        _sp = (_grid[_grid.ts >= pd.Timestamp(LIVE_FROM)]
               .pivot_table(index="ts", columns="exit_name", values="speed_filled").sort_index())
        _sp = _sp.reindex(pd.date_range(_sp.index.min(), _sp.index.max(), freq="h")).interpolate(limit_direction="both")
        MSTL_REFIT_H = 24                     # decomposition refitted once a day; the level follows every new hour

        def mstl_fit(y):
            """Split into trend + daily (24 h) + weekly (168 h) pattern + rest; smooth the de-seasoned series."""
            r = MSTL(y, periods=(24, 168), stl_kwargs={"seasonal_deg": 0}).fit()
            seas = r.seasonal.to_numpy()
            ses = SimpleExpSmoothing((r.trend + r.resid).to_numpy(), initialization_method="estimated").fit()
            return {"s24": seas[-24:, 0], "s168": seas[-168:, 1],
                    "alpha": float(ses.params["smoothing_level"]), "level": float(ses.forecast(1)[0])}

        def seasonal_at(st, k):
            """The repeated daily + weekly pattern k hours after the fit's last hour (k >= 1)."""
            k = np.asarray(k)
            return st["s24"][(k - 1) % 24] + st["s168"][(k - 1) % 168]

        def state_of(v):
            v = np.asarray(v)
            return np.where(v < SEVERE_KMH, 2, np.where(v < HEAVY_KMH, 1, 0))

        t_index = {t: i for i, t in enumerate(_sp.index)}
        levels = {}                           # (exit, origin) -> level after each hour since that origin
        origins = pd.date_range(cut, pd.Timestamp(te_ts.max()), freq=f"{MSTL_REFIT_H}h")
        fits = 0
        for ex in _sp.columns:
            y = _sp[ex]
            for o in origins:
                if o not in t_index:
                    continue
                st = mstl_fit(y.iloc[: t_index[o] + 1]); fits += 1
                lv, lvls = st["level"], [st["level"]]
                for u in range(1, MSTL_REFIT_H):                     # new hours update the level, as ETS does
                    t = o + pd.Timedelta(hours=u)
                    if t not in t_index:
                        break
                    lv = st["alpha"] * (y.iloc[t_index[t]] - seasonal_at(st, u)) + (1 - st["alpha"]) * lv
                    lvls.append(lv)
                levels[(ex, o)] = (st, np.array(lvls))
        probs = np.full((len(yte), 3), 1 / 3, np.float32)
        okm = np.zeros(len(yte), bool)
        _tts = pd.to_datetime(te_ts)
        _o_of = cut + ((_tts - cut) // pd.Timedelta(hours=MSTL_REFIT_H)) * pd.Timedelta(hours=MSTL_REFIT_H)
        _u = ((_tts - _o_of) // pd.Timedelta(hours=1)).to_numpy()
        _grp = pd.DataFrame({"ex": te_exit, "o": _o_of}).groupby(["ex", "o"]).indices
        for (ex, o), idx in _grp.items():
            got = levels.get((ex, pd.Timestamp(o)))
            if got is None:
                continue
            st, lvls = got
            u = _u[idx]
            good = u < len(lvls)
            idx, u = idx[good], u[good]
            k = state_of(lvls[u] + seasonal_at(st, u + mte["hz"][idx]))
            probs[idx] = 0.05
            probs[idx, k] = 0.90
            okm[idx] = True
        results["MSTL"] = probs
        covered["MSTL"] = okm
        mstl_state = {"fit": mstl_fit, "seasonal_at": seasonal_at, "state_of": state_of, "series": _sp}
        print(f"  {fits} fits ({len(_sp.columns)} exits x {len(origins)} daily refits), level updated every hour")
    except Exception as e:
        print(f"  SKIPPED: {type(e).__name__}: {str(e)[:120]}")

# ── 7. Scores, the choice, uncertainty ──────────────────────────────────────
banner("STEP 8: Results (every served horizon, equal weight per bucket)")
# Every model on exactly the same rows: a row any comparable model cannot score is dropped for all.
ROWS = np.ones(len(yte), bool)
for _k, _okm in covered.items():
    if _k not in REPORT_ONLY:
        ROWS &= _okm
print(f"  scored rows: {ROWS.sum():,} of {len(yte):,} (dropped where a model lacked complete inputs: "
      f"{', '.join(f'{k} {(~v).sum():,}' for k, v in covered.items() if (~v).any() and k not in REPORT_ONLY) or 'none'})")
yS = yte[ROWS]
hzS = mte["hz"][ROWS]
bS = np.searchsorted([b for _, b in BUCKETS][:-1], hzS, side="left")
_oday = ((pd.to_datetime(te_ts[ROWS]) - cut) // pd.Timedelta(days=1)).to_numpy()
ND = int(_oday.max()) + 1
NB = len(BUCKETS)


def macro_f1(C):
    """Macro-F1 from confusion counts [..., true, pred]; a class absent from both is left out (as scikit-learn)."""
    tp = np.diagonal(C, axis1=-2, axis2=-1).astype(float)
    fp, fn = C.sum(-2) - tp, C.sum(-1) - tp
    den = 2 * tp + fp + fn
    with np.errstate(invalid="ignore", divide="ignore"):
        f1 = np.where(den > 0, 2 * tp / np.where(den > 0, den, 1), np.nan)
    return np.nanmean(f1, axis=-1)


CONF, BRIER_C, N_C = {}, {}, np.zeros((ND, NB))
np.add.at(N_C, (_oday, bS), 1)
_eye = np.eye(3, dtype=np.float32)
rows = []
for name, proba in results.items():
    P = proba[ROWS]
    pred = decide(P)
    C = np.zeros((ND, NB, 3, 3))
    np.add.at(C, (_oday, bS, yS, pred), 1)
    CONF[name] = C
    br = ((P - _eye[yS]) ** 2).sum(1)
    Bc = np.zeros((ND, NB)); np.add.at(Bc, (_oday, bS), br)
    BRIER_C[name] = Bc
    bf1 = macro_f1(C.sum(0))
    prc = precision_recall_fscore_support(yS, pred, labels=[0, 1, 2], zero_division=0)
    rows.append({
        "model": name,
        "kind": "baseline" if name in BASELINE_NAMES else ("report-only" if name in REPORT_ONLY else "candidate"),
        "score": float(np.nanmean(bf1)),
        "bucket_f1": {lab: float(v) for lab, v in zip(BUCKET_LABELS, bf1)},
        "accuracy": float((pred == yS).mean()),
        "macro_f1": float(f1_score(yS, pred, average="macro")),
        "weighted_f1": float(f1_score(yS, pred, average="weighted")),
        "log_loss": float(log_loss(yS, np.clip(P, 1e-9, 1), labels=[0, 1, 2])),
        "heavy_recall": float(prc[1][1]),
        # Severe is the state anyone acts on and the rarest, so it is the first thing an imbalanced fit stops
        # predicting. Printed so that failure cannot hide behind a healthy-looking overall score.
        "severe_recall": float(prc[1][2]),
        # Per-class precision and recall, so the card can say "when it said severe it was severe X% of the time"
        # and "of the severe hours it caught Y%". Brier is the mean squared error of the probabilities: 0 is
        # perfect, and it is the honest score for a forecast that shows a chance rather than a verdict.
        "per_class": {STATES[k]: {"precision": float(prc[0][k]), "recall": float(prc[1][k]),
                                  "support": int((yS == k).sum())} for k in range(3)},
        "brier": float(br.mean()),
        "bucket_brier": {lab: float(v) for lab, v in zip(BUCKET_LABELS, Bc.sum(0) / N_C.sum(0))},
    })
res = pd.DataFrame(rows)
_pb = res.set_index("model").bucket_brier["Exit-hour profile"]
res["brier_skill"] = [{lab: 1 - b[lab] / _pb[lab] for lab in BUCKET_LABELS} for b in res.bucket_brier]
res["brier_skill_mean"] = [float(np.nanmean(list(d.values()))) for d in res.brier_skill]


def boot(names, reps=BOOT_REPS, block=BLOCK_DAYS, seed=7):
    """Score (mean bucket macro-F1) of each model on `reps` circular moving-block resamples of the origin days."""
    rng = np.random.default_rng(seed)
    nb = int(np.ceil(ND / block))
    W = np.zeros((reps, ND))
    for r in range(reps):
        d = ((rng.integers(0, ND, nb)[:, None] + np.arange(block)[None, :]) % ND).ravel()[:ND]
        W[r] = np.bincount(d, minlength=ND)
    return {k: np.nanmean(macro_f1(np.einsum("rd,dbij->rbij", W, CONF[k])), axis=-1) for k in names}


def ci(bs, a, b):
    d = bs[a] - bs[b]
    return [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))]


BS = boot(list(results))
_score = res.set_index("model").score
_bf = res.set_index("model").bucket_f1
_bases = [b for b in BASELINE_NAMES if b in results]
best_base_name = max(_bases, key=lambda k: _score[k])
best_base = float(_score[best_base_name])
_best_first = max(_bf[b][BUCKET_LABELS[0]] for b in _bases)
_cands = res[res.kind == "candidate"].sort_values("score", ascending=False).model.tolist()
eligible = [k for k in _cands if _score[k] > best_base and _bf[k][BUCKET_LABELS[0]] > _best_first]
selection = {"rule": "mean macro-F1 over buckets " + ", ".join(BUCKET_LABELS) + "; eligible = beats the best baseline "
             "on it and on 1-6h; a lead over the runner-up whose 95% interval includes 0 goes to the simpler model",
             "best_baseline": best_base_name, "best_baseline_score": best_base, "eligible": eligible,
             "block_days": BLOCK_DAYS, "reps": BOOT_REPS, "origin_days": ND, "cut": str(cut),
             "labels": LABELS, "severe_weight": SEVERE_WEIGHT}
SERVE_BASELINE = None
if not eligible:
    SERVE_BASELINE = best_base_name
    champ_name = best_base_name
    selection["note"] = f"no candidate beats the best baseline ({best_base_name}); the baseline is served"
    print(f"  no candidate beats the best baseline ({best_base_name} {best_base:.4f}): it is served")
else:
    champ_name = eligible[0]
    if len(eligible) > 1:
        _ru = eligible[1]
        _c = ci(BS, champ_name, _ru)
        selection.update(runner_up=_ru, vs_runner_up_ci=_c, vs_runner_up_significant=bool(_c[0] > 0))
        if _c[0] <= 0 and COMPLEXITY.get(_ru, 9) < COMPLEXITY.get(champ_name, 9):
            selection["note"] = (f"{champ_name} led {_ru} by {_score[champ_name] - _score[_ru]:.4f}, not significant "
                                 f"(95% interval {_c[0]:+.4f} to {_c[1]:+.4f}); the simpler {_ru} wins the tie")
            print(f"  champion rule: {selection['note']}")
            selection["runner_up"], champ_name = champ_name, _ru
    _cb = ci(BS, champ_name, best_base_name)
    selection.update(vs_best_baseline_ci=_cb, vs_best_baseline_significant=bool(_cb[0] > 0))
selection["champion"] = champ_name
selection["intervals"] = {k: ci(BS, k, best_base_name) for k in results if k != best_base_name}

# Order: the served model first, then candidates by score, then the baselines.
res["accepted"] = res.model.isin(eligible)
res["_o"] = [0 if m == champ_name and SERVE_BASELINE is None else (2 if k == "baseline" else 1)
             for m, k in zip(res.model, res.kind)]
res = res.sort_values(["_o", "score"], ascending=[True, False]).drop(columns="_o").reset_index(drop=True)
_c_rows = res[res.kind != "baseline"].reset_index(drop=True)
res["rank"] = None
for i, m in enumerate(_c_rows.model, 1):
    res.loc[res.model == m, "rank"] = i
if SERVE_BASELINE:
    res.loc[res.model == SERVE_BASELINE, "rank"] = 0

print(f"\n  {'model':<26}{'score':>8}" + "".join(f"{lab:>9}" for lab in BUCKET_LABELS) +
      f"{'acc':>8}{'BrierSk':>9}{'logloss':>9}{'SevRec':>8}  95% vs best baseline   verdict")
for r in res.itertuples():
    _iv = selection["intervals"].get(r.model)
    verdict = ("BASELINE" + (" (SERVED)" if r.model == SERVE_BASELINE else "")) if r.kind == "baseline" else \
              ("report only (partial coverage)" if r.kind == "report-only" else
               ("CHAMPION" if r.model == champ_name else ("eligible" if r.accepted else "rejected")))
    print(f"  {r.model:<26}{r.score:>8.4f}" + "".join(f"{r.bucket_f1[lab]:>9.4f}" for lab in BUCKET_LABELS) +
          f"{r.accuracy:>8.4f}{r.brier_skill_mean:>9.4f}{r.log_loss:>9.4f}{r.severe_recall:>8.4f}  "
          + (f"[{_iv[0]:+.4f}, {_iv[1]:+.4f}]" if _iv else " " * 18) + f"  {verdict}")
print(f"\n  score = mean macro-F1 over the four buckets; best baseline: {best_base_name} {best_base:.4f}; "
      f"intervals: {BOOT_REPS} circular block resamples of {ND} origin days (blocks of {BLOCK_DAYS})")
if "vs_runner_up_ci" in selection:
    print(f"  champion vs runner-up ({selection['runner_up']}): 95% interval "
          f"{selection['vs_runner_up_ci'][0]:+.4f} to {selection['vs_runner_up_ci'][1]:+.4f}")
if "vs_best_baseline_ci" in selection:
    print(f"  champion vs best baseline: 95% interval {selection['vs_best_baseline_ci'][0]:+.4f} to "
          f"{selection['vs_best_baseline_ci'][1]:+.4f} ({'significant' if selection['vs_best_baseline_significant'] else 'NOT significant'})")


# Calibration of the champion's "chance of congestion" (heavy or severe): in
# hours where it said 60-70%, how often was the exit actually congested? A
# weather forecast lives or dies on this, and so does a card that shows a
# percentage instead of a colour.
def calibration_table(proba, y, bins=10):
    p_cong = proba[:, 1] + proba[:, 2]
    actual = (y >= 1).astype(float)
    edges = np.linspace(0, 1, bins + 1)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p_cong >= lo) & (p_cong < hi if hi < 1 else p_cong <= hi)
        if m.sum() == 0:
            continue
        out.append({"lo": float(lo), "hi": float(hi), "n": int(m.sum()),
                    "predicted": float(p_cong[m].mean()), "observed": float(actual[m].mean())})
    return out


_champ_name = champ_name
calib = calibration_table(results[_champ_name][ROWS], yS)


def _print_cal(title, table):
    print(f"\n  {title}")
    print(f"  {'said':>12}{'happened':>10}{'hours':>8}")
    for c in table:
        print(f"  {c['predicted']*100:>11.0f}%{c['observed']*100:>9.0f}%{c['n']:>8,}")


if _champ_name == "XGBoost":
    _print_cal("P(congested), XGBoost BEFORE calibration:", calibration_table(results_raw_xgb[ROWS], yS))
_print_cal(f"P(congested), {_champ_name} as tested:", calib)

# ---------------------------------------------------------------------------
# The REPLAY: what the model said, next to what actually happened.
#
# Accuracy and Brier are summary statistics; neither lets anyone SEE that the
# forecast tracked reality. This rebuilds the held-out week hour by hour as it
# would have been forecast REPLAY_HZ hours in advance, and records the corridor
# total both ways: the model's expected number of congested exits (the sum of
# each exit's calibrated chance, which is the right way to total a probability)
# against the number that actually were. Plotted, the two lines are the answer
# to "why should we believe this forecast".
REPLAY_HZ = 3
_rm = hzS == REPLAY_HZ
_rp = results[_champ_name][ROWS][_rm]
_replay_df = pd.DataFrame({
    "ts": G0 + pd.to_timedelta(mte["th"][ROWS][_rm], unit="h"),
    "chance": _rp[:, 1] + _rp[:, 2],            # P(heavy or severe)
    "pred_cong": (decide(_rp) >= 1).astype(int),
    "act_cong": (yS[_rm] >= 1).astype(int),
    "hit": (decide(_rp) == yS[_rm]).astype(int),
})
_g = (_replay_df.groupby("ts")
      .agg(expected=("chance", "sum"), actual=("act_cong", "sum"),
           predicted=("pred_cong", "sum"), exits=("act_cong", "size"), hit=("hit", "mean"))
      .reset_index().sort_values("ts"))
_gap = (_g.expected - _g.actual).abs()
_replay = {
    "horizon": REPLAY_HZ,
    "exits": int(_g.exits.max()),
    "match_rate": float(_replay_df.hit.mean()),
    "mae_exits": float(_gap.mean()),
    "corr": float(_g.expected.corr(_g.actual)),
    "series": [{"t": t.strftime("%Y-%m-%d %H:00"), "e": round(float(e), 2), "a": int(a), "n": int(n)}
               for t, e, a, n in zip(_g.ts, _g.expected, _g.actual, _g.exits)],
}
# One hour the model called well and one it called badly, so a presenter has a
# concrete example to point at instead of only an average.
_busy = _g[_g.actual >= _g.actual.quantile(0.9)]
_best = _busy.loc[(_busy.expected - _busy.actual).abs().idxmin()] if len(_busy) else None
_worst = _g.loc[_gap.idxmax()]
_replay["examples"] = [
    {"kind": k, "t": r.ts.strftime("%Y-%m-%d %H:00"), "expected": round(float(r.expected), 1),
     "actual": int(r.actual), "exits": int(r.exits)}
    for k, r in (("closest on a busy hour", _best), ("widest miss", _worst)) if r is not None
]
print("")
print(f"  replay at +{REPLAY_HZ}h over the held-out window ({_champ_name}):")
print(f"    {len(_g)} hours | exit-hour label match {_replay['match_rate']*100:.1f}%")
print(f"    corridor congested-exit count: off by {_replay['mae_exits']:.2f} exits on average, correlation {_replay['corr']:.3f}")
for e in _replay["examples"]:
    print(f"    {e['kind']}: {e['t']} — expected {e['expected']} of {e['exits']}, actually {e['actual']}")

banner("STEP 9: Accuracy and macro-F1 BY HORIZON (every served hour)")
per_h = []
_models = [m for m in res.model if m in results]
_pers_hit = (decide(results["Persistence (now)"][ROWS]) == yS)
_hits = {m: (decide(results[m][ROWS]) == yS) for m in _models}
_n_h = np.bincount(hzS, minlength=MAX_HORIZON + 1)
_acc_h = {m: np.bincount(hzS, weights=_hits[m], minlength=MAX_HORIZON + 1) / np.maximum(_n_h, 1) for m in _models}
_f1_h = {}
for m in _models:
    Ch = np.zeros((MAX_HORIZON + 1, 3, 3))
    np.add.at(Ch, (hzS, yS, decide(results[m][ROWS])), 1)
    _f1_h[m] = macro_f1(Ch)
_pers_h = np.bincount(hzS, weights=_pers_hit, minlength=MAX_HORIZON + 1) / np.maximum(_n_h, 1)
for hz in SERVE_HORIZONS:
    row = {"horizon": hz, "n": int(_n_h[hz]), "Persistence": float(_pers_h[hz])}
    for m in _models:
        row[m] = float(_acc_h[m][hz])
        row[f"{m} macro_f1"] = float(_f1_h[m][hz])
    per_h.append(row)
_show = [1, 2, 3, 6, 12, 24, 36, 48, 72, 96, 120, 144, 168]
print("  macro-F1 at selected horizons (every hour 1-168 is stored):")
print(f"  {'h':>4}" + "".join(f"{m[:11]:>12}" for m in _models) + f"{'n':>9}")
for hz in _show:
    if hz <= MAX_HORIZON:
        print(f"  {hz:>4}" + "".join(f"{_f1_h[m][hz]:>12.4f}" for m in _models) + f"{_n_h[hz]:>9,}")

# ── Serve: the champion, refitted on ALL data, from the newest hour ─────────
champ = res[res.model == champ_name].iloc[0]
print(f"\n  champion: {champ_name}{' (a baseline: no candidate beat it)' if SERVE_BASELINE else ''} "
      f"(score {champ.score:.4f}, accuracy {champ.accuracy:.4f})")
out = []
_latest_rows = df[df.ts == END_TS]
_lpos = {e: p for p, e in zip(_latest_rows.index.to_numpy(), _latest_rows.exit_name)}
_lp = np.array([_lpos[e] for e in exits if e in _lpos])
_lex = [e for e in exits if e in _lpos]


def _emit(ex, hz, p_, kk=None):
    kk = int(decide(p_)) if kk is None else int(kk)
    out.append((ex, hz, STATES[kk], float(p_[kk]), float(p_[0]), float(p_[1]), float(p_[2])))


if SERVE_BASELINE:
    PROF_ALL = profile_arrays(END_TS + pd.Timedelta(hours=1))
    if SERVE_BASELINE in ("Persistence (now)", "Same hour last week"):
        # The baseline names the state; its chance is how often the target matched that state in training, by bucket.
        _bcol = "y_now" if SERVE_BASELINE == "Persistence (now)" else "tgt_lastweek"
        _tb = np.searchsorted([b for _, b in BUCKETS][:-1], mtr["hz"], side="left")
        _sv = Xtr[_bcol].to_numpy()
        _cond = np.zeros((3, NB, 3))
        _okc = ~np.isnan(_sv)
        np.add.at(_cond, (_sv[_okc].astype(int), _tb[_okc], ytr[_okc]), 1)
        _cond = _cond / np.maximum(_cond.sum(-1, keepdims=True), 1)
    for hz in SERVE_HORIZONS:
        Xq, mq = make_frame(_lp, np.full(len(_lp), hz), PROF_ALL, need_target=False)
        for i, ex in enumerate(_lex):
            if SERVE_BASELINE == "Exit-hour profile":
                _emit(ex, hz, mq["tgt_p"][i])
            elif SERVE_BASELINE == "Majority class":
                _emit(ex, hz, PROF_ALL[2], maj)
            else:
                s_ = Xq[_bcol].iloc[i]
                s_ = int(s_) if np.isfinite(s_) else int(decide(mq["tgt_p"][i]))
                _emit(ex, hz, _cond[s_, int(np.searchsorted([b for _, b in BUCKETS][:-1], hz))], s_)
elif champ_name in DUALPATH_KINDS and dp_panel is not None:
    # The weekly fit it was tested as. The stacker reads the trainer's features at each horizon (missing exits NaN).
    _allpos = np.array([_lpos.get(e, -1) for e in dp_panel.exits])

    def _feats_at(hz):
        Xq, _ = make_frame(np.maximum(_allpos, 0), np.full(len(_allpos), hz), PROF_EVAL, need_target=False)
        Xq.loc[_allpos < 0, :] = np.nan
        return Xq
    pr_ = dp.serve(dp_bundle, dp_panel, champ_name, _feats_at)              # (exits, 168, 3)
    for c, ex in enumerate(dp_panel.exits):
        for hz in SERVE_HORIZONS:
            _emit(ex, hz, pr_[c, hz - 1])
elif champ_name == "MSTL" and mstl_state is not None:
    for ex in mstl_state["series"].columns:
        st = mstl_state["fit"](mstl_state["series"][ex])
        for hz in SERVE_HORIZONS:
            kk = int(mstl_state["state_of"](st["level"] + mstl_state["seasonal_at"](st, hz)))
            p_ = np.full(3, 0.05); p_[kk] = 0.90
            _emit(ex, hz, p_, kk)
elif champ_name == "GRU" and gru is not None:
    print("  refitting the GRU on every window whose targets are known (all data) ...")
    gru_all, _ = fit_gru(END_TS + pd.Timedelta(hours=1))
    seq = np.stack([piv.values[-SEQ_LEN:, :], jm.values[-SEQ_LEN:, :]], -1)   # (SEQ, exits, 2), ends at the newest hour
    pr_ = gru_all.predict(np.transpose(seq, (1, 0, 2)).astype("float32"), verbose=0)  # (exits, 168, 3)
    for c in range(pr_.shape[0]):
        if np.isnan(seq[:, c]).any():
            continue
        for hz in SERVE_HORIZONS:
            _emit(exits[int(piv.columns[c])], hz, pr_[c, hz - 1])
else:
    # XGBoost / forest, refitted on every row whose target is known (the test window included), with the profile
    # features from all hours, then asked for every hour the card can show: `horizon` is an input.
    print(f"  refitting {champ_name} on all data (targets to {END_TS}) ...")
    PROF_ALL = profile_arrays(END_TS + pd.Timedelta(hours=1))
    del Xte, Xtr, results_raw_xgb                 # memory: the refit frame is as large as the training one
    Xa, ma = make_frame(*fit_positions(END_HR + 1, END_HR + 1 - CAL_DAYS * 24), PROF_ALL)
    if champ_name == "XGBoost":
        mdl, _ = fit_xgb(Xa, ma["y_target"], ma["th"], END_HR + 1 - CAL_DAYS * 24)
    else:
        mdl = RandomForestClassifier(n_estimators=300, max_depth=14, min_samples_leaf=5, class_weight="balanced",
                                     random_state=42, n_jobs=4).fit(Xa, ma["y_target"])
    del Xa
    for hz in SERVE_HORIZONS:
        Xq, _ = make_frame(_lp, np.full(len(_lp), hz), PROF_ALL, need_target=False)
        pr_ = mdl.predict_proba(Xq)
        for i, ex in enumerate(_lex):
            _emit(ex, hz, pr_[i])

_out_hz = sorted({o[1] for o in out})
print(f"  served forecast built: {len(out)} cells, {len({o[0] for o in out})} exits, horizons "
      f"{_out_hz[0]}-{_out_hz[-1]} ({len(_out_hz)} distinct), states "
      f"{dict(pd.Series([o[2] for o in out]).value_counts())}")

def _code_version():
    """The git commit this run's code came from (+ '-dirty' with uncommitted changes); protocol section 8."""
    import subprocess
    try:
        here = str(Path(__file__).resolve().parent)
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=here, capture_output=True, text=True,
                             timeout=10).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "--", "."], cwd=here, capture_output=True, text=True,
                               timeout=10).stdout.strip()
        return (sha + ("-dirty" if dirty else "")) or None
    except Exception:                               # noqa: BLE001 - no git on this machine
        return None


_summary = {
    "generated": str(pd.Timestamp.now()), "code_version": _code_version(), "labels": LABELS, "severe_weight": SEVERE_WEIGHT,
    "cut": str(cut), "test_from": str(pd.Timestamp(te_ts.min())), "test_to": str(END_TS), "origin_days": ND,
    "scored_rows": int(ROWS.sum()), "selection": selection,
    "models": res.drop(columns=["per_class"]).to_dict("records"),
    "per_class": {r.model: r.per_class for r in res.itertuples()},
    "per_horizon": per_h,
    "dualpath": dp_bundle["meta"] if dp_bundle is not None else {"skipped": dp_skip},
}
if RESULTS_JSON:
    Path(RESULTS_JSON).write_text(json.dumps(_summary, indent=1, default=str))
    print(f"  scores written to {RESULTS_JSON}")

# ── 8. Write ────────────────────────────────────────────────────────────────
banner("STEP 10: Writing to AWS")
if DRY_RUN:
    print("  DRY RUN: nothing written. Leaderboard, per-horizon scores and the served")
    print("  forecast in the database are unchanged" + (" (CONGESTION_PUBLISHER is not set on this machine)."
                                                          if not PUBLISHER and "--dry-run" not in sys.argv else "."))
    conn.close()
    banner("DONE (dry run)")
    banner_done()
    sys.exit(0)
try:
    conn.cursor().execute("SELECT 1")
except Exception:
    conn = psycopg2.connect(PG)
cur = conn.cursor()

_cands_res = res[res.kind != "baseline"]
cur.execute("DELETE FROM gold.ml_model_metrics WHERE target = 'Congestion'")
for r in _cands_res.itertuples():
    if r.accepted:
        reason = None
    elif r.kind == "report-only":
        reason = "scored on every 12th origin only, so not comparable; reported, never eligible"
    elif r.score <= best_base:
        reason = (f"mean bucket macro-F1 {r.score:.4f} does not beat the best baseline {best_base:.4f} "
                  f"({best_base_name})")
    else:
        reason = f"does not beat the best baseline on hours 1-6 (macro-F1 {r.bucket_f1[BUCKET_LABELS[0]]:.4f})"
    cur.execute("""INSERT INTO gold.ml_model_metrics
        (model_name,target,r2,mae,rank,accepted,rejected_reason,uses_weather,diagnosis,updated_at)
        VALUES (%s,'Congestion',%s,%s,%s,%s,%s,false,%s,now())""",
        (r.model, float(r.accuracy), float(r.log_loss), int(r.rank), bool(r.accepted), reason,
         f"chosen on mean macro-F1 over {', '.join(BUCKET_LABELS)} (score {r.score:.4f}); r2 holds plain accuracy "
         f"over horizons 1-168, mae the log-loss; see gold.ml_congestion_eval"))
for r in res[res.kind == "baseline"].itertuples():
    # The baseline served when no model is accepted takes rank 0 and readers name it (A4).
    _served = SERVE_BASELINE == r.model
    cur.execute("""INSERT INTO gold.ml_model_metrics
        (model_name,target,r2,rank,accepted,rejected_reason,uses_weather,updated_at)
        VALUES (%s,'Congestion',%s,%s,false,%s,false,now())""",
        (r.model, float(r.accuracy), 0 if _served else None,
         "served: no candidate beat the baselines" if _served else "baseline, not a candidate"))

cur.execute("""
  CREATE TABLE IF NOT EXISTS gold.ml_congestion_horizon_accuracy (
    id serial PRIMARY KEY, model_name text NOT NULL, horizon int NOT NULL,
    accuracy numeric(8,5), n int, persistence_accuracy numeric(8,5),
    updated_at timestamptz DEFAULT now())""")
cur.execute("""COMMENT ON TABLE gold.ml_congestion_horizon_accuracy IS
  'Congestion classification accuracy per forecast horizon (every hour 1-168, scored since 10 Nov 2026; the model is chosen on macro-F1 by horizon bucket, see gold.ml_congestion_eval). The previous run could not produce this: its target was never shifted by the horizon, so all twelve horizons were the same prediction. A single averaged accuracy hides the decay, which is the whole point of a horizon.'""")
cur.execute("DELETE FROM gold.ml_congestion_horizon_accuracy")
execute_values(cur, """INSERT INTO gold.ml_congestion_horizon_accuracy
    (model_name, horizon, accuracy, n, persistence_accuracy) VALUES %s""",
    [(name, row["horizon"], row[name], row["n"], row["Persistence"])
     for row in per_h for name in _cands_res.model if name in row], page_size=1000)

# WHEN the forecast is counted from. Without this "+1h" is a label with no
# referent - a reader cannot tell whether it means one hour from now, from the
# last data drop, or from midnight. It is the last COMPLETE hour of Waze
# ingestion, which is also the last hour the model actually saw.
BASE_TS = END_TS
# ---------------------------------------------------------------------------
# Schema first, on its own transaction.
#
# ADD COLUMN IF NOT EXISTS takes an ACCESS EXCLUSIVE lock even when the column
# is already there and the statement does nothing, and holds it until COMMIT.
# These sat in the same transaction as the write below, so for as long as that
# took - 3,360 single-row inserts across the Atlantic, minutes - every reader
# of this table was blocked. The dashboard's forecast map, its horizon picker
# and its model card all read it, so all three died together once an hour and
# came back on their own, which is a hard fault to catch in the act.
#
# Committing the DDL separately leaves the data write holding only ROW
# EXCLUSIVE, which readers do not queue behind: they keep seeing the previous
# forecast until the new one lands.
# ---------------------------------------------------------------------------
cur.execute("ALTER TABLE gold.ml_predictive_congestion ADD COLUMN IF NOT EXISTS base_ts timestamp")
cur.execute("""COMMENT ON COLUMN gold.ml_predictive_congestion.base_ts IS
  'Last complete hour of Waze ingestion; hours_ahead counts forward from here. Trailing hours with sparse ingestion are trimmed before training, so this is the last hour genuinely observed rather than the last row present.'""")
# The full probability vector travels with each cell, so the card can show a
# chance of congestion rather than only the winning label and its confidence.
for _col in ("p_low", "p_med", "p_high"):
    cur.execute(f"ALTER TABLE gold.ml_predictive_congestion ADD COLUMN IF NOT EXISTS {_col} numeric(6,4)")

# A second copy, in a table only this script writes.
#
# gold.ml_predictive_congestion is shared: four people work on this system at
# once and every checkout of this trainer writes it, each starting with
# DELETE FROM. Checkouts older than "Congestion map: a day and a week ahead"
# still have HORIZONS = range(1, 13), so whenever one of those runs it replaces
# a full week with twelve hours -- observed at 12:00 with base_ts 11:00 on a
# day this machine had not run since 06:00. Nothing written to that table can
# survive it, whatever it is keyed on.
#
# So the dashboard reads this one instead. The shared table is still written
# exactly as before, so a teammate's app sees no change at all.
cur.execute("""CREATE TABLE IF NOT EXISTS gold.ml_congestion_forecast (
    id            serial PRIMARY KEY,
    segment_name  text NOT NULL,
    hours_ahead   int  NOT NULL,
    congestion_state text NOT NULL,
    probability   numeric,
    base_ts       timestamp,
    p_low         numeric(6,4),
    p_med         numeric(6,4),
    p_high        numeric(6,4))""")
cur.execute("""COMMENT ON TABLE gold.ml_congestion_forecast IS
  'Congestion forecast for the dashboard, written only by train_congestion_horizon.py. Same rows as gold.ml_predictive_congestion, which is shared with older checkouts of this trainer that write only twelve horizons.'""")
cur.execute("""CREATE INDEX IF NOT EXISTS ml_congestion_forecast_hours_idx
               ON gold.ml_congestion_forecast (hours_ahead)""")
conn.commit()

# One round trip instead of 3,360. At 168 horizons the row-at-a-time loop was
# the reason the write took long enough to be noticed at all; batched, the
# table is swapped in about a second.
_rows = [(seg, hz, st, pb, BASE_TS.to_pydatetime(), p0, p1, p2)
         for seg, hz, st, pb, p0, p1, p2 in out]
for _table in ("gold.ml_predictive_congestion", "gold.ml_congestion_forecast"):
    cur.execute(f"DELETE FROM {_table}")
    execute_values(
        cur,
        f"""INSERT INTO {_table}
            (segment_name, hours_ahead, congestion_state, probability, base_ts, p_low, p_med, p_high)
            VALUES %s""",
        _rows,
        page_size=500,
    )

# One row of evaluation detail the card reads to explain itself: class
# balance, per-class precision/recall, Brier, and the calibration table.
# The champion before this run, for the audit entry. Checked with to_regclass rather than caught:
# a failed SELECT would abort this transaction, which already holds the new forecast rows.
cur.execute("SELECT to_regclass('gold.ml_congestion_eval') IS NOT NULL")
_prev_champ = None
if cur.fetchone()[0]:
    cur.execute("SELECT payload->>'model' FROM gold.ml_congestion_eval WHERE id = 1")
    _prev_champ = (cur.fetchone() or [None])[0]
cur.execute("""CREATE TABLE IF NOT EXISTS gold.ml_congestion_eval (
    id int PRIMARY KEY DEFAULT 1, payload jsonb NOT NULL, updated_at timestamptz DEFAULT now())""")
_champ_row = champ
_eval = {
    "model": champ_name,
    "code_version": _summary["code_version"],
    "served_baseline": bool(SERVE_BASELINE),
    "test_rows": int(ROWS.sum()),
    "test_days": ND,
    "class_share": {STATES[k]: float(np.mean(yS == k)) for k in range(3)},
    "per_class": _champ_row.per_class,
    "brier": float(_champ_row.brier),
    "macro_f1": float(_champ_row.macro_f1),
    "score": float(_champ_row.score),
    "bucket_macro_f1": _champ_row.bucket_f1,
    "brier_skill": _champ_row.brier_skill,
    "calibration": calib,
    "replay": _replay,
    "selection": selection,
    "thresholds_kmh": {"severe_below": SEVERE_KMH, "heavy_below": HEAVY_KMH},
    "features": FEATS,
    "labels": LABELS,
    # What the model learned from and what it was scored on, so the card can
    # say so instead of leaving the training range to be inferred.
    "with_history": bool(WITH_HISTORY),
    "train_from": str(df.ts.min()),
    "train_to": str(G0 + pd.Timedelta(hours=int(mtr["th"].max()))),
    "train_rows": int(len(ytr)),
    "test_from": str(pd.Timestamp(te_ts.min())),
    "test_to": str(END_TS),
    "served_model_refit_to": str(END_TS) if champ_name in ("XGBoost", "QRF", "GRU", "MSTL") or SERVE_BASELINE
                             else (dp_bundle["meta"]["cut"] if dp_bundle is not None else None),
    "live_from": str(LIVE_FROM),
    "dualpath": dp_bundle["meta"] if dp_bundle is not None else None,
    # Every model on the same test rows, for the card's "Models tested" table (rank 1 is the one served).
    "candidates": [{"model": r.model, "rank": None if r.rank is None else int(r.rank), "accepted": bool(r.accepted),
                    "kind": r.kind, "score": float(r.score), "bucket_macro_f1": r.bucket_f1,
                    "accuracy": float(r.accuracy), "macro_f1": float(r.macro_f1),
                    "brier_skill": float(r.brier_skill_mean),
                    "severe_recall": float(r.severe_recall), "heavy_recall": float(r.heavy_recall)}
                   for r in res.itertuples()],
}
cur.execute("""INSERT INTO gold.ml_congestion_eval (id, payload, updated_at) VALUES (1, %s, now())
               ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()""",
            (json.dumps(_eval, default=str),))
print(f"  forecast base time: {BASE_TS} (+1h = {BASE_TS + pd.Timedelta(hours=1)})")
conn.commit()

# Horizon coverage goes in the log beside the row count. The table has been
# found holding 12 horizons at times when the last completed run wrote 168,
# with the same base_ts on both - so something rewrites it between runs and
# nothing recorded what. Logging what THIS run left behind makes the next
# occurrence attributable to a run or to something outside it.
cur.execute("""SELECT COUNT(*), COUNT(DISTINCT (congestion_state, probability)),
                      MIN(hours_ahead), MAX(hours_ahead), MAX(base_ts)
               FROM gold.ml_congestion_forecast""")
n, distinct, hz_lo, hz_hi, base = cur.fetchone()
print(f"  ml_congestion_forecast: {n} rows, {distinct} distinct (state,probability) pairs, "
      f"horizons {hz_lo}-{hz_hi}, base_ts {base}")

Path(__file__).with_name("congestion_results_horizon.json").write_text(json.dumps(_summary, indent=2, default=str))
print("  congestion_results_horizon.json written")
conn.close()
_hz_acc = {r["horizon"]: r.get(champ_name) for r in per_h}
_audit_refresh(
    "published", to_status=str(champ_name), from_status=_prev_champ,
    details={
        "title": "Congestion forecast (hourly, live feed)",
        "reason": (f"{champ_name} mean bucket macro-F1 {champ.score:.4f} over {ND} test days "
                   f"(best baseline {best_base_name} {best_base:.4f}); forecast from {BASE_TS:%Y-%m-%d %H:00}"),
        "score": round(float(champ.score), 4), "accuracy": round(float(champ.accuracy), 4),
        "macro_f1": round(float(champ.macro_f1), 4), "severe_recall": round(float(champ.severe_recall), 4),
        "accuracy_by_horizon": {h: round(float(_hz_acc[h]), 4) for h in (1, 24, 72, 168) if _hz_acc.get(h) is not None},
        "baseline": {"name": best_base_name, "score": round(float(best_base), 4)},
        "candidates": {r.model: round(float(r.score), 4) for r in res.itertuples()},
        "test_from": str(pd.Timestamp(te_ts.min())), "test_to": str(END_TS), "train_rows": int(len(ytr)),
        "base_ts": str(BASE_TS), "rows_written": int(n), "with_history": bool(WITH_HISTORY), "labels": LABELS,
        "dualpath_models": dp_bundle["meta"]["trained_at"] if dp_bundle is not None else None,
        "host": __import__("socket").gethostname(),
    })
banner("DONE")
banner_done()
