"""
Daily fleet mix (Class 1 / 2 / 3 shares of corridor traffic): every candidate under EVALUATION_PROTOCOL.md (10 Nov 2026).
Test-only; writes no table.

TARGET  gold.fact_traffic_hourly, class counts summed per day and closed to shares. The counts are real to 2026-05-24
        (protocol section 1), so no later day is scored. No day inside the real period is a broken upload (checked
        10 Nov 2026, see emissions_study.py), so no day is excluded.

SERVED  30 days ahead (the dashboard's fleet-mix projection), every model refitted at each origin on the days before it,
        each forecasting the whole 30 days with nothing after the origin (the LSTMs feed their own forecasts back).

CANDIDATES, declared before the run. The trainer's four as it trains them, and their fair versions (feature parity:
weekday, yearly position and holidays for every model whose form allows):
  Dirichlet            Dirichlet regression by maximum likelihood on trend + weekday (as trained)
  Dirichlet + calendar ... plus yearly Fourier terms and the holiday flags
  XGBoost              one regressor per CLR coordinate, trend + weekday (as trained)
  XGBoost + calendar   ... plus yearly and holidays
  LSTM                 multivariate LSTM over the three CLR series, recursive (as trained)
  LSTM + calendar      the same network, each step also given the next day's calendar
  Prophet              one Prophet per CLR coordinate, weekly + yearly (as trained)
  Prophet + holidays   ... plus the Philippine holidays (and the day either side)
Baselines, the protocol's three rules applied to the composition (section 3):
  Baseline: last week            each class share on the same weekday last week
  Baseline: weekday average      the mean share for that weekday over the last 8 weeks
  Baseline: last year (scaled)   the shares 364 days earlier, each class scaled by its last-8-weeks over
                                 same-8-weeks-a-year-earlier ratio, then closed to sum to 1

SCORES (section 5). Primary: Aitchison distance (Euclidean distance between centred log-ratios, the standard metric
for compositions; lower is better), averaged per bucket (days 1-7, 8-14, 15-30). Also the heavy-vehicle share
(Class 2 + 3) WMAPE. The champion rule (section 6) is the harness's own select_champion, fed each day's Aitchison
distance as the error: score = mean over buckets; must beat the best baseline overall and in days 1-7;
moving-block bootstrap over origins; a simpler model wins a tie whose lead is not significant.

Writes _work/cache/fleet_mix_study.csv (every scored forecast) and fleet_mix_study.json. Nothing to the database.

    python fleet_mix_study.py              # the full study (26 origins x 30 days)
    python fleet_mix_study.py --origins 2  # smoke test (separate output files)
"""
from __future__ import annotations

import contextlib
import hashlib
import io
import json
import logging
import os
import subprocess
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
logging.getLogger("cmdstanpy").disabled = True
logging.getLogger("prophet").disabled = True

HERE = Path(__file__).resolve().parent
TT = HERE.parent
sys.path.insert(0, str(TT))
sys.path.insert(0, str(TT.parent / "config"))
from db import PG, WORK  # noqa: E402
from common import rolling_eval as RE  # noqa: E402
from common.rolling_eval import (REAL_END_VOLUME, SHORT_BUCKETS, calendar_frame, is_baseline,  # noqa: E402
                                 load_holidays, report, select_champion, summarize, yearly_origins)

CACHE = WORK / "cache"
CACHE.mkdir(parents=True, exist_ok=True)
HORIZON = 30
BUCKETS = SHORT_BUCKETS
SCORE_END = REAL_END_VOLUME
EXCLUDE: list = []
PARTS = ["c1", "c2", "c3"]
YEAR = ["doy_sin1", "doy_cos1", "doy_sin2", "doy_cos2", "doy_sin3", "doy_cos3"]
HOLFLAGS = ["is_holiday", "holiday_eve", "holiday_after", "holy_week", "xmas_season", "all_saints"]
DOW1H = [f"dow_{k}" for k in range(1, 7)]
SEQ_CAL = ["dow_sin", "dow_cos", "doy_sin1", "doy_cos1"] + HOLFLAGS
KNOWN = ["dow", "dow_sin", "dow_cos"] + DOW1H + YEAR + HOLFLAGS
COMPLEXITY = {"Dirichlet": 1, "Dirichlet + calendar": 1, "Prophet": 2, "Prophet + holidays": 2,
              "XGBoost": 3, "XGBoost + calendar": 3, "LSTM": 4, "LSTM + calendar": 4}


# ─── Compositions ────────────────────────────────────────────────────────────

def closure(P):
    """Rows onto the simplex, off its boundary (a zero share is a reporting gap, not an absence)."""
    P = np.asarray(P, dtype=float)
    P = np.where(P <= 0, 1e-6, P)
    return P / P.sum(axis=1, keepdims=True)


def clr(P):
    L = np.log(closure(P))
    return L - L.mean(axis=1, keepdims=True)


def inv_clr(Z):
    Z = np.asarray(Z, dtype=float)
    E = np.exp(Z - Z.max(axis=1, keepdims=True))
    return E / E.sum(axis=1, keepdims=True)


def aitchison(P, Q):
    return np.sqrt(((clr(P) - clr(Q)) ** 2).sum(axis=1))


def tvd(P, Q):
    return 0.5 * np.abs(closure(P) - closure(Q)).sum(axis=1)


# ─── Context ─────────────────────────────────────────────────────────────────

def sha(*parts) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p if isinstance(p, bytes) else str(p).encode())
    return h.hexdigest()


def file_hash(p: Path) -> str:
    return sha(Path(p).read_bytes())[:16]


def code_version() -> str:
    root = TT.parents[1]
    try:
        head = subprocess.run(["git", "-C", str(root), "rev-parse", "--short", "HEAD"], capture_output=True,
                              text=True, timeout=20).stdout.strip()
        dirty = subprocess.run(["git", "-C", str(root), "status", "--porcelain", "--",
                                "smartflow_scripts/3_training_testing"], capture_output=True, text=True,
                               timeout=20).stdout.strip()
        return head + ("+uncommitted" if dirty else "")
    except Exception:  # noqa: BLE001
        return "unknown"


class Ctx:
    pass


C = Ctx()
_loaded = False


def calendar_plus(dates, hol):
    cal = calendar_frame(dates, hol)
    d = pd.DatetimeIndex(cal.ds)
    cal["dow_sin"] = np.sin(2 * np.pi * d.dayofweek / 7)
    cal["dow_cos"] = np.cos(2 * np.pi * d.dayofweek / 7)
    for k in range(1, 7):
        cal[f"dow_{k}"] = (d.dayofweek == k).astype(int)
    return cal


def load(log=print) -> Ctx:
    global _loaded
    if _loaded:
        return C
    import psycopg2
    with psycopg2.connect(PG) as conn:
        conn.set_session(readonly=True)
        d = pd.read_sql_query("""
            SELECT date::date AS ds, SUM(class_1)::float AS c1, SUM(class_2)::float AS c2, SUM(class_3)::float AS c3
            FROM gold.fact_traffic_hourly GROUP BY 1 HAVING SUM(class_1 + class_2 + class_3) > 0 ORDER BY 1""", conn)
        C.HOL = load_holidays(conn)
    d["ds"] = pd.to_datetime(d.ds)
    tot = d[PARTS].sum(axis=1)
    for c in PARTS:
        d[c] = d[c] / tot
    d["heavy"] = d.c2 + d.c3
    C.mix = d
    C.data_end = d.ds.max()
    C.CAL = calendar_plus(pd.date_range(d.ds.min(), C.data_end + pd.Timedelta(days=HORIZON + 60)), C.HOL)
    C.F = C.CAL.merge(d, on="ds", how="left").sort_values("ds").reset_index(drop=True)
    C.code = {"fleet_mix_study.py": file_hash(Path(__file__)), "rolling_eval.py": file_hash(Path(RE.__file__))}
    C.fp = sha(d.to_csv(index=False), C.HOL.to_csv(index=False), json.dumps(C.code, sort_keys=True))[:16]
    _loaded = True
    log(f"  fleet mix: {len(d)} days {d.ds.min().date()}..{C.data_end.date()}; fingerprint {C.fp}")
    return C


# ─── Candidates ──────────────────────────────────────────────────────────────

def design(fr: pd.DataFrame, t0: pd.Timestamp, calendar: bool) -> np.ndarray:
    """Intercept, trend (years since the first training day) and weekday dummies, as the trainer builds them; with
    calendar, also yearly Fourier terms and the holiday flags. Deterministic, so day 30 is forecast as directly as day 1."""
    ds = pd.to_datetime(fr.ds)
    trend = ((ds - t0).dt.days.values / 365.25).reshape(-1, 1)
    cols = [np.ones((len(fr), 1)), trend, fr[DOW1H].values.astype(float)]
    if calendar:
        cols += [fr[YEAR].values.astype(float), fr[HOLFLAGS].values.astype(float)]
    return np.hstack(cols)


def _dirichlet(tr, fu, calendar):
    """Dirichlet regression by maximum likelihood: alpha_k(x) = exp(x @ B_k), mean composition alpha / sum(alpha). The
    likelihood is on the simplex itself, so no transform is needed. Analytic gradient (the trainer's version used
    finite differences; same model and optimum)."""
    from scipy.optimize import minimize
    from scipy.special import digamma, gammaln
    t0 = tr.ds.min()
    X, Y = design(tr, t0, calendar), closure(tr[PARTS].values)
    n, p = X.shape
    logY = np.log(Y)

    def nll(b):
        Z = X @ b.reshape(p, 3)
        inside = (Z > -6) & (Z < 6)
        A = np.exp(np.clip(Z, -6, 6))
        a0 = A.sum(axis=1)
        ll = gammaln(a0).sum() - gammaln(A).sum() + ((A - 1.0) * logY).sum()
        G = (digamma(a0)[:, None] - digamma(A) + logY) * A * inside
        return -ll / n, -(X.T @ G).ravel() / n

    b0 = np.zeros((p, 3))
    b0[0] = np.log(np.clip(Y.mean(axis=0) * 40, 1e-3, None))
    r = minimize(nll, b0.ravel(), jac=True, method="L-BFGS-B", options={"maxiter": 2000})
    A = np.exp(np.clip(design(fu, t0, calendar) @ r.x.reshape(p, 3), -6, 6))
    return A / A.sum(axis=1, keepdims=True)


def _xgb(tr, fu, calendar):
    from xgboost import XGBRegressor
    t0 = tr.ds.min()
    X, Z = design(tr, t0, calendar), clr(tr[PARTS].values)
    Xf = design(fu, t0, calendar)
    out = np.column_stack([
        XGBRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.9, random_state=42,
                     verbosity=0, n_jobs=4).fit(X, Z[:, k]).predict(Xf)
        for k in range(3)])
    return inv_clr(out)


def _tf():
    import tensorflow as tf
    tf.keras.backend.clear_session()
    tf.random.set_seed(42)
    np.random.seed(42)
    return tf


def _lstm(tr, fu, calendar):
    """Multivariate LSTM over the three CLR series (z-scored), 28-day window, LSTM(32) -> Dense(3), 30 epochs, recursive.
    With calendar, each step also carries the next day's calendar."""
    tf = _tf()
    from tensorflow.keras import Sequential, layers
    SEQ = 28
    Z = clr(tr[PARTS].values).astype("float32")
    mu, sd = Z.mean(axis=0), np.where(Z.std(axis=0) == 0, 1.0, Z.std(axis=0))
    z = ((Z - mu) / sd).astype("float32")
    n, h = len(z), len(fu)
    k = 3 + (len(SEQ_CAL) if calendar else 0)
    cal = np.vstack([tr[SEQ_CAL].values, fu[SEQ_CAL].values]).astype("float32") if calendar else None

    def window(zz, i):
        w = np.asarray(zz[i - SEQ:i], dtype="float32")
        return np.column_stack([w, cal[i - SEQ + 1:i + 1]]) if calendar else w

    X = np.array([window(z, i) for i in range(SEQ, n)])
    Y = z[SEQ:]
    m = Sequential([layers.Input((SEQ, k)), layers.LSTM(32), layers.Dense(3)])
    m.compile("adam", "mse")
    m.fit(X, Y, epochs=30, batch_size=32, verbose=0)
    zz = list(z)
    out = []
    for j in range(h):
        p = m(window(zz, n + j)[None], training=False).numpy()[0]
        zz.append(p)
        out.append(p)
    del m
    tf.keras.backend.clear_session()
    return inv_clr(np.array(out) * sd + mu)


def _prophet(tr, fu, holidays):
    from prophet import Prophet
    Z = clr(tr[PARTS].values)
    kw = {}
    if holidays:
        hh = C.HOL.rename(columns={"date": "ds", "name": "holiday"})[["ds", "holiday"]].copy()
        hh["lower_window"], hh["upper_window"] = -1, 1
        kw["holidays"] = hh
    cols = []
    for j in range(3):
        m = Prophet(weekly_seasonality=True, yearly_seasonality=True, daily_seasonality=False, **kw)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            m.fit(pd.DataFrame({"ds": tr.ds.values, "y": Z[:, j]}))
        cols.append(m.predict(pd.DataFrame({"ds": pd.to_datetime(fu.ds).values}))["yhat"].values)
    return inv_clr(np.column_stack(cols))


# ─── Baselines (protocol section 3, for a composition) ───────────────────────

def b_last_week(tr, fu):
    last = tr[PARTS].values[-7:]
    return closure(np.array([last[i % 7] for i in range(len(fu))]))


def b_weekday_avg(tr, fu, weeks=8):
    s = tr.tail(7 * weeks)
    m = s.groupby(s.ds.dt.dayofweek)[PARTS].mean()
    allm = s[PARTS].mean().values
    return closure(np.array([m.loc[d.dayofweek].values if d.dayofweek in m.index else allm
                             for d in pd.to_datetime(fu.ds)]))


def b_last_year(tr, fu, weeks=8):
    s = tr.set_index("ds")[PARTS]
    origin = pd.to_datetime(fu.ds).iloc[0]
    recent = s[s.index >= origin - pd.Timedelta(days=7 * weeks)]
    ly = s[(s.index >= origin - pd.Timedelta(days=364 + 7 * weeks)) & (s.index < origin - pd.Timedelta(days=364))]
    k = (recent.mean() / ly.mean()).values if len(ly) else np.ones(3)
    fb = b_weekday_avg(tr, fu, weeks)
    out = []
    for i, d in enumerate(pd.to_datetime(fu.ds)):
        key = d - pd.Timedelta(days=364)
        out.append(s.loc[key].values * k if key in s.index else fb[i])
    return closure(np.array(out))


def build_models() -> dict:
    return {
        "Baseline: last week": b_last_week,
        "Baseline: weekday average": b_weekday_avg,
        "Baseline: last year (scaled)": b_last_year,
        "Dirichlet": lambda tr, fu: _dirichlet(tr, fu, False),
        "Dirichlet + calendar": lambda tr, fu: _dirichlet(tr, fu, True),
        "XGBoost": lambda tr, fu: _xgb(tr, fu, False),
        "XGBoost + calendar": lambda tr, fu: _xgb(tr, fu, True),
        "LSTM": lambda tr, fu: _lstm(tr, fu, False),
        "LSTM + calendar": lambda tr, fu: _lstm(tr, fu, True),
        "Prophet": lambda tr, fu: _prophet(tr, fu, False),
        "Prophet + holidays": lambda tr, fu: _prophet(tr, fu, True),
    }


# ─── The study: run_study's rules, for a three-part composition ──────────────

def run_shares(df, models, horizon, origins, score_end, exclude=(), ckpt=None, log=print) -> pd.DataFrame:
    """Every model forecasts `horizon` days of shares from every origin, refitted on the rows before it. Same rules as
    rolling_eval.run_study: only calendar columns reach the forecast; scored days are real (<= score_end, not
    excluded); an origin where any model fails is dropped for ALL models."""
    df = df.sort_values("ds").reset_index(drop=True)
    excl = set(pd.to_datetime(list(exclude)))
    rows, done = [], set()
    if ckpt and Path(ckpt).exists():
        ck = json.loads(Path(ckpt).read_text())
        if ck.get("origins") == origins and ck.get("models") == list(models) and ck.get("horizon") == horizon:
            rows, done = ck["rows"], set(ck["done"])
            log(f"  resuming: {len(done)} of {len(origins)} origins already done")
    actual = df.set_index("ds")[PARTS]
    for oi, cut in enumerate(origins, 1):
        if cut in done:
            continue
        t0 = time.time()
        train = df.iloc[:cut].copy()
        start = df.ds.iloc[cut]
        dates = pd.date_range(start, periods=horizon, freq="D")
        future = pd.DataFrame({"ds": dates}).merge(df[["ds"] + KNOWN], on="ds", how="left")
        got, failed = {}, []
        for name, fn in models.items():
            try:
                P = np.asarray(fn(train, future.copy()), dtype=float)
                if P.shape != (horizon, 3) or not np.isfinite(P).all() or (P <= 0).any() \
                        or np.abs(P.sum(axis=1) - 1).max() > 1e-6:
                    raise ValueError(f"bad forecast {P.shape}")
                got[name] = P
            except Exception as e:  # noqa: BLE001
                failed.append(f"{name}: {str(e)[:90]}")
        if failed:
            log(f"  origin {oi}/{len(origins)} DROPPED for all models ({'; '.join(failed)})")
        else:
            for name, P in got.items():
                for i, d in enumerate(dates):
                    if d <= score_end and d in actual.index and d not in excl and np.isfinite(actual.loc[d].values).all():
                        a = actual.loc[d].values
                        rows.append([oi, name, i + 1, str(d.date()), *map(float, a), *map(float, P[i])])
            log(f"  origin {oi}/{len(origins)} from {start.date()} ({time.time() - t0:.0f}s)")
        done.add(cut)
        if ckpt:
            Path(ckpt).write_text(json.dumps({"origins": origins, "models": list(models), "horizon": horizon,
                                              "rows": rows, "done": sorted(done)}))
    res = pd.DataFrame(rows, columns=["origin", "model", "h", "date", "a1", "a2", "a3", "f1", "f2", "f3"])
    A, P = res[["a1", "a2", "a3"]].values, res[["f1", "f2", "f3"]].values
    res["aitchison"] = aitchison(A, P) if len(res) else []
    res["heavy_a"], res["heavy_f"] = res.a2 + res.a3, res.f2 + res.f3
    return res


def as_error(res: pd.DataFrame, kind: str) -> pd.DataFrame:
    """The harness's (origin, model, h, date, actual, forecast) shape. 'aitchison': |actual - forecast| is the day's
    Aitchison distance (scored with metric 'mae' = mean distance). 'heavy': the Class 2+3 share (metric 'wmape')."""
    r = res[["origin", "model", "h", "date"]].copy()
    if kind == "aitchison":
        r["actual"], r["forecast"] = 0.0, res["aitchison"].values
    else:
        r["actual"], r["forecast"] = res["heavy_a"].values, res["heavy_f"].values
    return r


def bucket_metrics(res: pd.DataFrame, buckets=BUCKETS) -> pd.DataFrame:
    """Per model x bucket: Aitchison, heavy-share WMAPE and R2, class-share MAE/RMSE (percentage points), MAPE, TVD."""
    r = res.copy()
    r["bucket"] = RE._bucket(r.h, buckets)
    r = r.dropna(subset=["bucket"])
    out = []
    for (m, b), g in r.groupby(["model", "bucket"]):
        A, P = g[["a1", "a2", "a3"]].values, g[["f1", "f2", "f3"]].values
        ha, hf = g.heavy_a.values, g.heavy_f.values
        sst = float(((ha - ha.mean()) ** 2).sum())
        out.append({"model": m, "bucket": b, "n": len(g), "aitchison": float(g.aitchison.mean()),
                    "heavy_wmape": float(np.abs(ha - hf).sum() / ha.sum() * 100),
                    "heavy_r2": float(1 - ((ha - hf) ** 2).sum() / sst) if sst > 0 else np.nan,
                    "mae_pp": float(np.abs(A - P).mean() * 100), "rmse_pp": float(np.sqrt(((A - P) ** 2).mean()) * 100),
                    "mape": float((np.abs(A - P) / A).mean() * 100), "tvd_pct": float(tvd(A, P).mean() * 100)})
    return pd.DataFrame(out)


def settle_tie(sel: dict, err: pd.DataFrame) -> dict:
    """common/rolling_eval.select_champion computes the champion-vs-baseline interval BEFORE a simpler runner-up takes
    a non-significant tie, so after that swap it describes the old leader (reported as a harness bug, 10 Nov 2026).
    Recompute both intervals for the champion actually chosen (vs the best baseline; champion minus runner-up)."""
    if not sel.get("note") or sel.get("champion_is_baseline") or not sel.get("runner_up"):
        return sel
    cells = RE._cells(err, BUCKETS)
    lo, hi = RE._boot_diff(cells, sel["champion"], sel["best_baseline"], BUCKETS, "mae", sel["block"])
    sel["vs_baseline_ci"], sel["vs_baseline_significant"] = [lo, hi], bool(hi < 0)
    rlo, rhi = RE._boot_diff(cells, sel["champion"], sel["runner_up"], BUCKETS, "mae", sel["block"])
    sel["vs_runner_up_ci"], sel["vs_runner_up_significant"] = [rlo, rhi], bool(rhi < 0)
    sel["intervals_recomputed_after_tie"] = True
    return sel


def print_selection(sel: dict, log=print) -> None:
    """The harness's report() at 4 decimals (Aitchison distances are around 0.03-0.1)."""
    t = pd.DataFrame(sel["table"]).T
    cols = [c for c in t.columns if c != "score"] + ["score"]
    log(f"\n  AITCHISON DISTANCE by horizon, {sel['origins']} origins (score = mean of buckets)")
    log("  " + f"{'model':<34}" + "".join(f"{c:>10}" for c in cols))
    for m in t.sort_values("score").index:
        log("  " + f"{m:<34}" + "".join(f"{t.loc[m, c]:>10.4f}" for c in cols)
            + (" <- champion" if m == sel["champion"] else ""))
    log(f"\n  best baseline: {sel['best_baseline']};  eligible: {', '.join(sel['eligible']) or 'none'}")
    for k, lab in (("vs_baseline", "champion vs best baseline"),
                   ("vs_runner_up", f"champion vs runner-up ({sel.get('runner_up')})")):
        if f"{k}_ci" in sel:
            lo, hi = sel[f"{k}_ci"]
            log(f"  {lab}: 95% interval {lo:+.4f} to {hi:+.4f}  "
                f"({'significant' if sel[f'{k}_significant'] else 'NOT significant'})")
    if sel.get("note"):
        log(f"  note: {sel['note']}")
    if sel.get("usable"):
        log("  usable on the dashboard: " + ", ".join(f"{k} {'yes' if v else 'NO'}" for k, v in sel["usable"].items()))


def outputs(tag):
    return CACHE / f"{tag}.csv", CACHE / f"{tag}.json"


def run(n_origins: int | None = None, log=print) -> dict:
    load(log)
    models = build_models()
    F = C.F
    origins = yearly_origins(F.ds, SCORE_END)
    all_origins = len(origins)
    if n_origins:
        origins = origins[-n_origins:]
    tag = "fleet_mix_study" if not n_origins else f"fleet_mix_study_smoke{n_origins}"
    log(f"\n  fleet mix: real record to {SCORE_END.date()}; {len(origins)} of {all_origins} origins "
        f"{F.ds.iloc[origins[0]].date()} .. {F.ds.iloc[origins[-1]].date()}; {HORIZON}-day horizon; {len(models)} models")
    t0 = time.time()
    res = run_shares(F, models, HORIZON, origins, SCORE_END, EXCLUDE, ckpt=CACHE / f"{tag}.{C.fp}.ckpt.json", log=log)
    minutes = (time.time() - t0) / 60
    origin_dates = {i + 1: str(F.ds.iloc[c].date()) for i, c in enumerate(origins)}
    kept = sorted(int(o) for o in res.origin.unique())
    err = as_error(res, "aitchison")
    sel = settle_tie(select_champion(err, BUCKETS, metric="mae", complexity=COMPLEXITY), err)
    sel["metric"] = "aitchison"
    heavy = summarize(as_error(res, "heavy"), BUCKETS, "wmape")
    bm = bucket_metrics(res)
    out = {
        "target": "Fleet mix (Class 1/2/3 shares per day)", "protocol": "EVALUATION_PROTOCOL.md (10 Nov 2026)",
        "generated": pd.Timestamp.now().isoformat(timespec="seconds"), "code_version": code_version(),
        "fingerprint": C.fp, "code_hashes": C.code, "score_end": str(SCORE_END.date()),
        "data_end": str(C.data_end.date()), "horizon": HORIZON, "buckets": [list(b) for b in BUCKETS],
        "origins": origin_dates, "origins_scored": kept, "origins_dropped": [o for o in origin_dates if int(o) not in kept],
        "smoke": bool(n_origins), "minutes": round(minutes, 1), "complexity": COMPLEXITY,
        "selection": sel, "champion": sel["champion"],
        "heavy_wmape_table": heavy.round(4).to_dict(orient="index"),
        "bucket_metrics": bm.round(6).to_dict(orient="records"),
    }
    csv, js = outputs(tag)
    res.to_csv(csv, index=False)
    js.write_text(json.dumps(out, indent=1, default=str))
    log(f"\n  ({minutes:.0f} min)")
    print_selection(sel, log)
    log("\n  heavy-vehicle (Class 2+3) share WMAPE by horizon (%)")
    log("  " + f"{'model':<34}" + "".join(f"{c:>11}" for c in heavy.columns))
    for m in heavy.index:
        log("  " + f"{m:<34}" + "".join(f"{heavy.loc[m, c]:>11.2f}" for c in heavy.columns))
    log(f"\n  written: {csv.name}, {js.name} (nothing written to the database)")
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    run(int(a[a.index("--origins") + 1]) if "--origins" in a else None)
