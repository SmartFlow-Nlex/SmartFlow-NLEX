"""
ONE FAIR COMPARISON OF EVERY TRAFFIC VOLUME MODEL, AT EVERY HORIZON THE DASHBOARD SHOWS (10 Nov 2026).

Why this exists. Two studies disagreed about the champion:
  * retrain_honest.py scores every model on the same 21 rolling 14-day blocks (294 days) -> HoltWinters 5.17% best;
  * extend_future_volume.py's horizon study scores ONE model at a time on 9 overlapping 90-day windows (63 days at
    d1-7) -> HoltWinters 7.09% at d1-7, worse than the baseline.
They differ in origins, sample size and which models were compared, so neither settles it. This study puts every
candidate through the same origins and the same horizons, and states the rule BEFORE any result is seen.

THE PROTOCOL (fixed before running)
  * Candidates: every model retrain_honest.py trains (SeasonalNaive and Climatology are the baselines), plus one
    declared extra, HoltWinters with a damped trend: the standard variant for long horizons, so Holt-Winters gets
    its fairest form.
  * Data: the real record only, up to 2026-05-24. After that the 2026 file still holds broken, missing and
    synthetic days (client re-extract pending), so scoring against them would grade models on made-up traffic.
  * Origins: every 14 days across the last 52 weeks of real data (a full year, so every holiday season is in the
    test). At each origin every model is refitted on all data before it and forecasts 90 days blind; days past the
    end of the real record are not scored.
  * Future weather for the weather models: day-of-year climatology from the training slice only (as retrain_honest.py
    does), so no model sees the weather of the days it forecasts.
  * Fairness: a model's forecasts are compared only on origins where every candidate produced a forecast.

THE RULE (fixed before running)
  1. Champion = lowest WMAPE over days 1-14 (the range the dashboard validates), among models that beat BOTH
     baselines over days 1-14 and have MASE below 1 there.
  2. Days 15-30, 31-60, 61-90 are reported for every model; they decide how far ahead the dashboard may call the
     forecast usable, not who is champion.
  3. The champion's lead over the runner-up is tested across origins (paired, per-origin d1-14 WMAPE differences,
     t-test and sign test). If it is not significant at 5%, the report says so plainly.

Nothing is written to the database. Results: _work/cache/compare_all_horizons.csv (every forecast) and .json.
Resumable: finished origins are kept in a checkpoint.
"""
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
src = (HERE / "retrain_honest.py").read_text(encoding="utf-8")
head = src.split('banner(f"STEP 2: Rolling-origin evaluation')[0]
g = {"__file__": str(HERE / "retrain_honest.py"), "__name__": "retrain_honest_head"}
exec(compile(head, "retrain_honest_head", "exec"), g)

df = g["df"]
MODELS = dict(g["MODELS"])
WEATHER_COLS = g["WEATHER_COLS"]
SEASON = g["SEASON"]
WORK = Path(g["WORK"])


def m_hw_damped(train, h):
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    fit = ExponentialSmoothing(train["y"].values, trend="add", damped_trend=True, seasonal="add",
                               seasonal_periods=SEASON, initialization_method="estimated").fit()
    return np.asarray(fit.forecast(h), dtype=float), None


MODELS["HoltWinters_damped"] = lambda tr, h, fut: m_hw_damped(tr, h)
BASELINES = ("SeasonalNaive", "Climatology")

REAL_END = pd.Timestamp("2026-05-24")
H = 90
STEP = 14
real = df[df.ds <= REAL_END].reset_index(drop=True)
n = len(real)
starts = list(range(n - 364, n - 13, STEP))          # first forecast day of each origin, last 52 weeks
print(f"\nreal record: {real.ds.min().date()} -> {real.ds.max().date()} ({n} days)")
print(f"origins: {len(starts)} (every {STEP} days), horizon {H} days, models: {', '.join(MODELS)}\n")

CACHE = WORK / "cache"
CACHE.mkdir(parents=True, exist_ok=True)
CKPT = CACHE / "compare_all_horizons.ckpt.json"
rows = []
done = set()
if CKPT.exists():
    ck = json.loads(CKPT.read_text())
    if ck.get("starts") == starts and ck.get("models") == list(MODELS):
        rows, done = ck["rows"], set(ck["done"])
        print(f"resuming: {len(done)} origins already done")

for oi, cut in enumerate(starts, 1):
    if cut in done:
        continue
    train = real.iloc[:cut]
    fut = df[(df.ds >= real.ds.iloc[cut])].head(H).copy()   # the 90 calendar days ahead (dates only matter here)
    clim = train.assign(_k=train.ds.dt.dayofyear).groupby("_k")[WEATHER_COLS].mean()
    for c in WEATHER_COLS:
        fut[c] = [float(clim[c].get(d.dayofyear, train[c].mean())) for d in fut.ds]
    actual = real.set_index("ds").y
    t0 = time.time()
    for name, fn in MODELS.items():
        try:
            out = fn(train, len(fut), fut)
            yh = np.asarray(out[0] if isinstance(out, tuple) else out, dtype=float)
            if yh.shape != (len(fut),) or not np.isfinite(yh).all():
                raise ValueError(f"bad forecast shape/values {yh.shape}")
        except Exception as e:  # noqa: BLE001
            print(f"    {name} failed at origin {oi}: {str(e)[:80]}")
            continue
        for i, d in enumerate(fut.ds):
            if d in actual.index:
                rows.append([oi, name, i + 1, str(d.date()), float(actual[d]), float(yh[i])])
    done.add(cut)
    CKPT.write_text(json.dumps({"starts": starts, "models": list(MODELS), "rows": rows, "done": sorted(done)}))
    print(f"  origin {oi}/{len(starts)}  from {real.ds.iloc[cut].date()}  ({time.time() - t0:.0f}s)", flush=True)

res = pd.DataFrame(rows, columns=["origin", "model", "h", "date", "actual", "forecast"])
res.to_csv(CACHE / "compare_all_horizons.csv", index=False)

# Fairness: only origins where every model forecast.
full = res.groupby("origin").model.nunique()
keep = full[full == len(MODELS)].index
res = res[res.origin.isin(keep)]
print(f"\norigins where every model forecast: {len(keep)} of {len(starts)}")

ins = real.y.values[:starts[0]]
scale = float(np.mean(np.abs(ins[SEASON:] - ins[:-SEASON])))
BUCKETS = [(1, 14), (1, 7), (8, 14), (15, 30), (31, 60), (61, 90)]


def score(g_):
    e = (g_.actual - g_.forecast).abs()
    return e.sum() / g_.actual.sum() * 100, e.mean() / scale, (g_.forecast.sum() / g_.actual.sum() - 1) * 100, len(g_)


table = {}
for m, gm in res.groupby("model"):
    table[m] = {f"d{lo}-{hi}": score(gm[(gm.h >= lo) & (gm.h <= hi)]) for lo, hi in BUCKETS}

print(f"\nWMAPE % by horizon (MASE in brackets; bias = forecast total vs actual), {len(keep)} origins")
print(f"{'model':<20}" + "".join(f"{f'd{lo}-{hi}':>16}" for lo, hi in BUCKETS) + f"{'bias d61-90':>13}")
order = sorted(table, key=lambda m: table[m]["d1-14"][0])
for m in order:
    t = table[m]
    print(f"{m:<20}" + "".join(f"{t[f'd{lo}-{hi}'][0]:>9.2f} ({t[f'd{lo}-{hi}'][1]:.2f})" for lo, hi in BUCKETS)
          + f"{t['d61-90'][2]:>+12.1f}%")

base14 = min(table[b]["d1-14"][0] for b in BASELINES)
eligible = [m for m in order if m not in BASELINES and table[m]["d1-14"][0] < base14 and table[m]["d1-14"][1] < 1]
print(f"\nbaselines d1-14: " + ", ".join(f"{b} {table[b]['d1-14'][0]:.2f}%" for b in BASELINES))
print("eligible (beat both baselines at d1-14, MASE < 1): " + (", ".join(eligible) or "none"))

verdict = {"origins": int(len(keep)), "table": {m: {k: list(map(float, v)) for k, v in t.items()} for m, t in table.items()}}
if eligible:
    champ = eligible[0]
    verdict["champion"] = champ
    print(f"\nCHAMPION by the declared rule: {champ}  (d1-14 WMAPE {table[champ]['d1-14'][0]:.2f}%)")
    if len(eligible) > 1:
        ru = eligible[1]
        d14 = res[res.h <= 14]
        per = d14.groupby(["origin", "model"]).apply(lambda x: (x.actual - x.forecast).abs().sum() / x.actual.sum() * 100).unstack()
        diff = (per[champ] - per[ru]).dropna()
        k = len(diff)
        tstat = diff.mean() / (diff.std(ddof=1) / math.sqrt(k)) if k > 1 and diff.std(ddof=1) > 0 else float("nan")
        from scipy import stats
        p_t = float(2 * stats.t.sf(abs(tstat), k - 1)) if np.isfinite(tstat) else float("nan")
        wins = int((diff < 0).sum())
        p_sign = float(stats.binomtest(wins, k, 0.5).pvalue) if k else float("nan")
        print(f"runner-up: {ru} ({table[ru]['d1-14'][0]:.2f}%). Across {k} origins {champ} was better at {wins}; "
              f"mean difference {diff.mean():+.2f} pts, t-test p = {p_t:.3f}, sign test p = {p_sign:.3f}"
              + ("  -> the lead is NOT statistically significant" if not (p_t < 0.05) else "  -> significant"))
        verdict.update(runner_up=ru, origins_better=wins, mean_diff_pts=float(diff.mean()), p_t=p_t, p_sign=p_sign)
else:
    print("\nNo model beats both baselines over days 1-14.")
(CACHE / "compare_all_horizons.json").write_text(json.dumps(verdict, indent=1))
print("\nwritten: _work/cache/compare_all_horizons.csv and .json  (nothing written to the database)")
