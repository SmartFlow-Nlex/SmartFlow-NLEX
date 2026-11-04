"""
Does four years of Waze history make the congestion forecast better?  (4 Nov 2026)

WHY THIS EXISTS
  The served congestion model (train_congestion_horizon.py) learns from the live Waze feed only: 4 Aug 2026 onward,
  about three months. Four years of the same corridor's jams (silver.waze_jam_hourly_exit, 1 Jan 2022 - 19 Apr 2026,
  from the MPTC Partner Hub export) were tried once, in October, as extra training rows for XGBoost, scored on the
  latest 12 days only, and left out because accuracy moved from 64.7% to 63.8%.

  That test could not show what history is for. Twelve ordinary days in October say how well the model follows the
  last few hours; they say nothing about a December, Holy Week or All Saints' Day, none of which the live feed has
  ever seen. And the trainer had no input that could carry a season: hour, day of week, weekend, nothing else.

WHAT THIS RUNS (writes nothing to the database; read-only)
  Four set-ups of the production model (XGBoost, the trainer's own settings and class weights, severe weight 1.5):
    A  live only, current inputs                       what the map is trained like today
    B  live + history rows, current inputs              what --with-history does
    C  live + history rows + seasonal inputs            history as rows AND as inputs
    D  live only + seasonal inputs taken from history   history as inputs only
  Seasonal inputs: month, public holiday, the day before/after one, day type (weekday / Saturday / Sunday-holiday),
  and each exit's four-year typical state for that hour, day type and month (built from history rows only, and never
  from the window being tested).

  Each is scored on four held-out windows, chronological, nothing from a window ever used to fit or to build a profile:
    recent          the latest 12 days of the live feed (the test the hourly trainer uses)
    christmas_2024  16 Dec 2024 - 5 Jan 2025
    holy_week_2025  13 - 21 Apr 2025 (Palm Sunday to Easter Monday)
    all_saints_2025 29 Oct - 4 Nov 2025
  A and D, trained on live weeks only, are applied to the history windows as they would be on those days: the
  question is whether a model that has never seen a holiday season can forecast one.

  Horizons: 1, 2, 3, 6, 12, 18, 24, 36, 48, 72, 96, 120, 144, 168 h for every set-up, so the comparison is like for like
  (the hourly trainer's own set is denser, so its headline accuracy is not this file's).

Usage:  python -u experiment_congestion_history.py     (about 30-60 min on a laptop CPU)
Output: congestion_history_experiment.json beside this file, and a table on stdout.
"""
import json
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from sklearn.metrics import accuracy_score, f1_score, recall_score
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")
T0 = time.monotonic()

_env = {}
for _line in (Path(__file__).resolve().parents[2] / "Back-End" / ".env").read_text().splitlines():
    if "=" in _line and not _line.startswith("#"):
        _k, _v = _line.split("=", 1)
        _env[_k.strip()] = _v.strip().strip('"')
PG = (f"host={_env['PG_HOST']} port={_env.get('PG_PORT', 5432)} dbname={_env['PG_DATABASE']} "
      f"user={_env['PG_USER']} password={_env['PG_PASSWORD']} sslmode=require")

SEVERE_KMH, HEAVY_KMH = 10.0, 20.0          # train_congestion_horizon.py's class cuts
SEVERE_WEIGHT = 1.5                         # the served --severe-weight
DECIDE_W = np.array([1.0, 1.0, SEVERE_WEIGHT])
H = [1, 2, 3, 6, 12, 18, 24, 36, 48, 72, 96, 120, 144, 168]
TEST_DAYS = 12
WINDOWS = {
    "christmas_2024": ("2024-12-16", "2025-01-05"),
    "holy_week_2025": ("2025-04-13", "2025-04-21"),
    "all_saints_2025": ("2025-10-29", "2025-11-04"),
}


def log(msg):
    print(f"[{(time.monotonic() - T0) / 60:5.1f} min] {msg}", flush=True)


conn = psycopg2.connect(PG)
log("reading the live feed and the four-year history")
jams = pd.read_sql_query("""
    SELECT j.date_day::date AS d, j.hour_of_day::int AS h,
           COALESCE(e.exit_name,'id_'||j.nlex_exit_id::text) AS exit_name,
           j.speed_kmh::float AS speed, j.length_meters::float AS len
    FROM silver.fact_waze_jams j
    LEFT JOIN bronze.nlex_exits e ON e.id = j.nlex_exit_id
    WHERE j.speed_kmh IS NOT NULL""", conn)
jams["wlen"] = jams["len"].clip(lower=1.0)
jams["sp_w"] = jams["speed"] * jams["wlen"]
# --active-hours (4 Nov): the live table files each jam under the hour it was FIRST SEEN only, while the four-year
# history counts a jam in every hour it was on the road ("a jam lasting three hours counts three times"). A 3-hour jam
# was one congested hour live and three in history, so the eras disagreed (live 70% of exit-hours jammed, history
# 87-89%) and history looked worse on recent days. With this flag each live jam is counted in every hour from first
# seen to cleared, the history's own definition. Its reported speed and length stand for each of those hours.
ACTIVE_HOURS = "--active-hours" in sys.argv
if ACTIVE_HOURS:
    conn2 = psycopg2.connect(PG)
    jams_lab = pd.read_sql_query("""
        SELECT (t)::date AS d, EXTRACT(HOUR FROM t)::int AS h,
               COALESCE(e.exit_name,'id_'||j.nlex_exit_id::text) AS exit_name,
               j.speed_kmh::float AS speed, j.length_meters::float AS len
        FROM silver.fact_waze_jams j
        LEFT JOIN bronze.nlex_exits e ON e.id = j.nlex_exit_id
        CROSS JOIN LATERAL generate_series(date_trunc('hour', j.first_seen_at AT TIME ZONE 'Asia/Manila'),
                                           date_trunc('hour', COALESCE(j.cleared_at, j.last_seen_at, j.first_seen_at) AT TIME ZONE 'Asia/Manila'),
                                           interval '1 hour') AS t
        WHERE j.speed_kmh IS NOT NULL""", conn2)
    conn2.close()
    jams_lab["wlen"] = jams_lab["len"].clip(lower=1.0)
    jams_lab["sp_w"] = jams_lab["speed"] * jams_lab["wlen"]
else:
    jams_lab = jams
live = (jams_lab.groupby(["d", "h", "exit_name"])
        .agg(sp_w=("sp_w", "sum"), wlen=("wlen", "sum"), n_jams=("speed", "size")).reset_index())
live["speed"] = live.sp_w / live.wlen
live = live[["d", "h", "exit_name", "speed", "n_jams"]]
LIVE_FROM = pd.Timestamp(live.d.min())

hist = pd.read_sql_query("""
    SELECT h.date_day::date AS d, h.hour_of_day::int AS h,
           COALESCE(e.exit_name,'id_'||h.nlex_exit_id::text) AS exit_name,
           SUM(h.length_m_avg * h.jam_snapshots)::real AS wlen,
           SUM(h.speed_kmh_wavg * h.length_m_avg * h.jam_snapshots)::real AS sp_w,
           SUM(h.jams_distinct)::real AS n_jams
      FROM silver.waze_jam_hourly_exit h
      LEFT JOIN bronze.nlex_exits e ON e.id = h.nlex_exit_id
     WHERE h.speed_kmh_wavg IS NOT NULL
     GROUP BY 1, 2, 3""", conn)
hist["speed"] = hist.sp_w / hist.wlen
hist = hist[["d", "h", "exit_name", "speed", "n_jams"]]
hist = hist[~hist.d.isin(set(live.d))]
_scale = live.n_jams.mean() / max(hist.n_jams.mean(), 1e-9)
hist["n_jams"] = hist.n_jams * _scale
holidays = set(pd.to_datetime(pd.read_sql_query("SELECT DISTINCT date_day::date AS d FROM public.ph_holidays", conn).d).dt.date)
_km = pd.read_sql_query("SELECT exit_name, km_post::float AS km FROM gold.exit_km_post", conn)
conn.close()
log(f"live {len(live):,} exit-hours {live.d.min()}..{live.d.max()} | history {len(hist):,} {hist.d.min()}..{hist.d.max()} "
    f"(counts x{_scale:.3f}) | {len(holidays)} holiday dates")

# Trailing ingestion gap, as the trainer trims it.
_ts = pd.to_datetime(jams.d.astype(str)) + pd.to_timedelta(jams.h, unit="h")
_per_hr = jams.assign(ts=_ts).groupby("ts").size().sort_index()
_recent = _per_hr.tail(24 * 14)
_by_hod = _recent.groupby(_recent.index.hour).median()
_expected = pd.Series(_per_hr.index.hour, index=_per_hr.index).map(_by_hod).fillna(_by_hod.median())
LAST_GOOD = _per_hr[_per_hr >= _expected * 0.25].index.max()

exits = sorted(live.exit_name.unique())
hist = hist[hist.exit_name.isin(set(exits))]
cell = pd.concat([hist, live], ignore_index=True)
collected = set(cell.d.unique())
days = pd.date_range(min(cell.d), min(live.d.max(), LAST_GOOD.date()), freq="D").date
df = (pd.MultiIndex.from_product([days, range(24), exits], names=["d", "h", "exit_name"])
      .to_frame(index=False).merge(cell, on=["d", "h", "exit_name"], how="left"))
df["y"] = np.where(df.speed.isna(), 0.0, np.where(df.speed < SEVERE_KMH, 2.0, np.where(df.speed < HEAVY_KMH, 1.0, 0.0)))
df["n_jams"] = df.n_jams.fillna(0)
_unc = ~df.d.isin(collected)
df.loc[_unc, ["y", "n_jams"]] = np.nan
df["ts"] = pd.to_datetime(df.d.astype(str)) + pd.to_timedelta(df.h, unit="h")
df = df[df.ts <= LAST_GOOD]
df = df.sort_values(["exit_name", "ts"]).reset_index(drop=True)
log(f"grid {len(df):,} exit-hours, {_unc.sum() // (24 * len(exits)):,} uncollected days held out")

# Inputs the trainer has today.
df["dow"] = df.ts.dt.dayofweek
df["is_weekend"] = (df.dow >= 5).astype(int)
g = df.groupby("exit_name", sort=False)
df["lag24"] = g.y.shift(24)
df["lag48"] = g.y.shift(48)
df["lag24_jams"] = g.n_jams.shift(24)
for _k in (1, 2, 3, 6):
    df[f"lag{_k}"] = g.y.shift(_k)
df["roll6_y"] = g.y.transform(lambda s_: s_.shift(1).rolling(6, min_periods=1).mean())
df["roll6_jams"] = g.n_jams.transform(lambda s_: s_.shift(1).rolling(6, min_periods=1).mean())
df["roll24_y"] = g.y.transform(lambda s_: s_.shift(1).rolling(24, min_periods=1).mean())
_order = [e for e in _km.sort_values("km").exit_name if e in set(exits)]
_order += [e for e in exits if e not in _order]
_pos = {e: i for i, e in enumerate(_order)}
_prev = {e: (_order[_pos[e] - 1] if _pos[e] > 0 else e) for e in _order}
_next = {e: (_order[_pos[e] + 1] if _pos[e] < len(_order) - 1 else e) for e in _order}
_piv_y = df.pivot(index="ts", columns="exit_name", values="y").sort_index()
_piv_r6 = df.pivot(index="ts", columns="exit_name", values="roll6_y").sort_index()
_lag1 = _piv_y.shift(1)
for _name, _src, _map in (("nb_prev_lag1", _lag1, _prev), ("nb_next_lag1", _lag1, _next),
                          ("nb_prev_roll6", _piv_r6, _prev), ("nb_next_roll6", _piv_r6, _next)):
    _o = pd.DataFrame({e: _src[_map[e]] for e in _order}, index=_src.index)
    df = df.merge(_o.stack().rename(_name).reset_index().rename(columns={"level_1": "exit_name"}),
                  on=["ts", "exit_name"], how="left")

# Seasonal inputs, knowable in advance for any hour.
_date = df.ts.dt.date
df["month"] = df.ts.dt.month
df["is_holiday"] = _date.isin(holidays).astype(int)
df["hol_adj"] = ((df.ts - pd.Timedelta(days=1)).dt.date.isin(holidays) |
                 (df.ts + pd.Timedelta(days=1)).dt.date.isin(holidays)).astype(int)
df["daytype"] = np.where((df.is_holiday == 1) | (df.dow == 6), 2, np.where(df.dow == 5, 1, 0))

yref = df.loc[df.y.notna(), ["exit_name", "ts", "y"]].rename(columns={"ts": "target_ts", "y": "y_target"})
df = df.dropna(subset=["y", "lag24", "lag48", "lag6"]).reset_index(drop=True)
df["exit_code"] = pd.Categorical(df.exit_name, categories=exits).codes
df["is_hist"] = (df.ts < LIVE_FROM)
# Which era a row comes from. Every served forecast is made in the live era (1), so a model given this can keep what the
# four years teach about seasons and still match the live feed's own level.
df["is_live"] = (~df.is_hist).astype(int)

BASE = ["exit_code", "h", "dow", "is_weekend", "lag24", "lag48", "lag24_jams", "lag1", "lag2", "lag3", "lag6",
        "roll6_y", "roll6_jams", "roll24_y", "nb_prev_lag1", "nb_next_lag1", "nb_prev_roll6", "nb_next_roll6",
        "prof_mean", "prof_sev", "horizon"]
SEASON = ["month", "is_holiday", "hol_adj", "daytype", "hprof_mean", "hprof_sev"]
KEEP = list(dict.fromkeys(["ts", "exit_name", "h", "is_weekend", "daytype", "month", "is_hist", "is_live"] +
                          [c for c in BASE + SEASON if c not in ("prof_mean", "prof_sev", "hprof_mean", "hprof_sev", "horizon")]))

rng = np.random.default_rng(20261104)
one_hz = rng.choice(H, size=len(df))


def expand(rows: pd.DataFrame, every: bool, pick=None) -> pd.DataFrame:
    """Rows x horizons, the target looked up by its timestamp (never by shifting rows across a gap)."""
    out = []
    for hz in H:
        f = rows if every else rows[pick == hz]
        f = f[KEEP].copy()
        f["horizon"] = hz
        f["target_ts"] = f.ts + pd.Timedelta(hours=hz)
        out.append(f)
    full = pd.concat(out, ignore_index=True).merge(yref, on=["exit_name", "target_ts"], how="inner")
    full["y_target"] = full.y_target.astype(int)
    return full


_hm = df.is_hist.values
train_pool = pd.concat([expand(df[~_hm], True), expand(df[_hm], False, one_hz[_hm])], ignore_index=True)
log(f"training pool {len(train_pool):,} rows (live every horizon, history one horizon each)")

cut = df.ts.max().normalize() - pd.Timedelta(days=TEST_DAYS - 1)
tests = {"recent": (cut, df.ts.max() + pd.Timedelta(hours=1))}
for k, (a, b) in WINDOWS.items():
    tests[k] = (pd.Timestamp(a), pd.Timestamp(b) + pd.Timedelta(days=1))


def profiles(src: pd.DataFrame, keys, prefix):
    p = (src.assign(sev=(src.y == 2).astype(float)).groupby(keys)
         .agg(**{f"{prefix}_mean": ("y", "mean"), f"{prefix}_sev": ("sev", "mean")}).reset_index())
    return p


def attach(frame, prof, hprof, hprof_coarse, fill):
    f = frame.merge(prof, on=["exit_name", "h", "is_weekend"], how="left")
    f = f.merge(hprof, on=["exit_name", "h", "daytype", "month"], how="left")
    f = f.merge(hprof_coarse, on=["exit_name", "h", "daytype"], how="left", suffixes=("", "_c"))
    for c in ("hprof_mean", "hprof_sev"):
        f[c] = f[c].fillna(f[f"{c}_c"])
    f["prof_mean"] = f.prof_mean.fillna(fill[0])
    f["prof_sev"] = f.prof_sev.fillna(fill[1])
    f["hprof_mean"] = f.hprof_mean.fillna(fill[0])
    f["hprof_sev"] = f.hprof_sev.fillna(fill[1])
    return f


def fit_predict(train, test, feats, live_weight=1.0):
    ytr = train.y_target.values
    cls, cnt = np.unique(ytr, return_counts=True)
    w = {int(c): len(ytr) / (len(cls) * n) for c, n in zip(cls, cnt)}
    m = XGBClassifier(n_estimators=400, max_depth=6, learning_rate=0.08, subsample=0.9, colsample_bytree=0.9,
                      objective="multi:softprob", num_class=3, eval_metric="mlogloss", random_state=42, n_jobs=4)
    sw = np.array([w[int(v)] for v in ytr]) * np.where(train.is_hist.values, 1.0, live_weight)
    m.fit(train[feats], ytr, sample_weight=sw)
    return (m.predict_proba(test[feats]) * DECIDE_W).argmax(1)


def score(y, p, horizon):
    out = {"n": int(len(y)), "accuracy": accuracy_score(y, p), "macro_f1": f1_score(y, p, average="macro"),
           "severe_recall": recall_score(y, p, labels=[2], average="macro", zero_division=0)}
    for name, lo, hi in (("1-6h", 1, 6), ("7-24h", 7, 24), ("25-168h", 25, 168)):
        mk = (horizon >= lo) & (horizon <= hi)
        out[f"acc_{name}"] = accuracy_score(y[mk], p[mk]) if mk.any() else None
    # The naive "same as the exit-hour profile" baseline people compare against.
    return out


CONFIGS = {
    "A_live_only": (False, BASE, 1.0),
    "B_live_plus_history_rows": (True, BASE, 1.0),
    "C_history_rows_plus_seasonal": (True, BASE + SEASON, 1.0),
    "D_live_only_plus_seasonal": (False, BASE + SEASON, 1.0),
}
# --followup (4 Nov, after the first run): history won every holiday window but lost ~3 points on the recent days, the
# sign of two eras that differ a little. The usual remedies, each on its own and together: tell the model the era, and
# count the live weeks more.
if ACTIVE_HOURS:
    CONFIGS["F_history_rows_live_x3"] = (True, BASE, 3.0)
if "--followup" in sys.argv:
    CONFIGS = {
        "A_live_only": (False, BASE, 1.0),
        "E_history_rows_plus_era": (True, BASE + ["is_live"], 1.0),
        "F_history_rows_live_x3": (True, BASE, 3.0),
        "G_history_era_seasonal_live_x3": (True, BASE + SEASON + ["is_live"], 3.0),
    }
results = {}
for tname, (ta, tb) in tests.items():
    in_win = (df.ts >= ta) & (df.ts < tb)
    if tname != "recent":
        cov = df[in_win].ts.dt.date.nunique()
        log(f"--- {tname}: {cov} of {(tb - ta).days} days collected")
    else:
        log(f"--- recent: {ta.date()} .. {(tb - pd.Timedelta(hours=1)).date()}")
    test_rows = df[in_win]
    test = expand(test_rows, True)
    # Out of every fit and every profile: the window, and the two days after it (their lags reach back into it).
    pool = train_pool[~(((train_pool.ts >= ta) & (train_pool.ts < tb + pd.Timedelta(days=2))) |
                        ((train_pool.target_ts >= ta) & (train_pool.target_ts < tb)))]
    if tname == "recent":
        pool = pool[pool.target_ts < ta]
    src_ok = df[~((df.ts >= ta) & (df.ts < tb))]
    hsrc = src_ok[src_ok.is_hist]
    hprof = profiles(hsrc, ["exit_name", "h", "daytype", "month"], "hprof")
    hprof_c = profiles(hsrc, ["exit_name", "h", "daytype"], "hprof")
    results[tname] = {}
    for cname, (with_hist, feats, live_w) in CONFIGS.items():
        tr = pool if with_hist else pool[~pool.is_hist]
        # The trainer's own exit-hour profile input, from this set-up's own training era only.
        psrc = src_ok if with_hist else src_ok[~src_ok.is_hist]
        if tname == "recent":
            psrc = psrc[psrc.ts < ta]
        prof = profiles(psrc, ["exit_name", "h", "is_weekend"], "prof")
        fill = (psrc.y.mean(), (psrc.y == 2).mean())
        trf = attach(tr, prof, hprof, hprof_c, fill)
        tef = attach(test, prof, hprof, hprof_c, fill)
        t1 = time.monotonic()
        pred = fit_predict(trf, tef, feats, live_w)
        s = score(tef.y_target.values, pred, tef.horizon.values)
        s["train_rows"] = int(len(trf))
        s["fit_min"] = round((time.monotonic() - t1) / 60, 1)
        results[tname][cname] = s
        log(f"  {cname:<32} acc {s['accuracy'] * 100:5.1f}%  macroF1 {s['macro_f1']:.3f}  severe recall "
            f"{s['severe_recall'] * 100:5.1f}%  (1-6h {s['acc_1-6h'] * 100:4.1f} | 7-24h {s['acc_7-24h'] * 100:4.1f} | "
            f"25-168h {s['acc_25-168h'] * 100:4.1f})  train {len(trf):,}  {s['fit_min']} min")
    # The exit-hour profile alone, as the floor every model has to beat.
    base_pred = np.rint(attach(test, profiles(src_ok[src_ok.ts < ta] if tname == "recent" else src_ok,
                                               ["exit_name", "h", "is_weekend"], "prof"), hprof, hprof_c,
                               (0, 0)).prof_mean.values).clip(0, 2).astype(int)
    results[tname]["profile_baseline"] = score(test.y_target.values, base_pred, test.horizon.values)
    log(f"  {'exit-hour profile (baseline)':<32} acc {results[tname]['profile_baseline']['accuracy'] * 100:5.1f}%")

out = {
    "run_at": pd.Timestamp.now().isoformat(),
    "live_from": str(LIVE_FROM.date()), "last_hour": str(LAST_GOOD),
    "history": f"{hist.d.min()} .. {hist.d.max()}", "horizons": H, "severe_weight": SEVERE_WEIGHT,
    "windows": {k: [str(a.date()), str((b - pd.Timedelta(days=1)).date())] for k, (a, b) in tests.items()},
    "results": results,
}
Path(__file__).with_name("congestion_history_experiment" + ("_followup" if "--followup" in sys.argv else "")
                          + ("_active_hours" if ACTIVE_HOURS else "") + ".json").write_text(json.dumps(out, indent=2, default=float))
log("written congestion_history_experiment.json")
