"""
SmartFlow NLEX - 48-hour forecast: score the VALIDATION and TEST forecasts the same way, choose the model on validation
only, and report the test with 95% intervals (reads preds_val_<model>.npz and preds_test_<model>.npz).

    python evaluate.py              -> prints the tables, writes metrics.json
    python evaluate.py --dry-run    -> the same in the dryrun/ folder (nothing live is touched)

Rule, fixed on 10 Nov 2026 BEFORE any forecast was scored under it (EVALUATION_PROTOCOL.md section 6, in hours):
  * Origins are every day at 00:00, as served (the forecast starts the hour after the last uploaded day). Every model
    is scored on exactly the same (origin, series, hour) cells: a series whose inputs or targets touch a missing day is
    dropped for every model, and corridor-empty hours (toll holidays, broken uploads) are never scored.
  * Score = series-level WAPE (sum |error| / sum actual over plaza x direction x class hours), in three buckets of
    hours ahead, 1-6, 7-24 and 25-48; the score is the mean of the three, so each bucket weighs the same.
  * Eligible = beats the best baseline (same hour last week, or the current daily x hourly profile) on the score AND on
    hours 1-6. Champion = the lowest score among the eligible, on VALIDATION. If its lead over the runner-up has a 95%
    moving-block bootstrap interval (blocks of 7 daily origins) that includes 0, the simpler model wins (single-layer
    LSTM < stacked < dual-path < dual-path + XGBoost). With none eligible the current method is served.
  * The TEST (the last weeks of real data, never used for a choice) reports the served configuration against both
    baselines, with the same bootstrap intervals; it decides nothing.

Levels: series (one plaza x direction x class, hour by hour) and corridor (all series and classes summed per hour).
Metrics: WAPE, MAE and RMSE (vehicles/hour), MAPE on hours with >= 50 vehicles, MASE-48 = MAE / MAE of the seasonal
naive on the same cells, R2. Slices of the test: hours ahead, weekday / weekend / holiday / heavy rain / event day, month.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import BASELINES, BLOCK_DAYS, BUCKETS, COMPLEXITY, H, LABEL, LEARNED, cache_dir  # noqa: E402

HEAVY_RAIN = 2.5          # mm/h, corridor mean of the weather points (a heavy shower at most of them)
ORDER = BASELINES + LEARNED
BLAB = [f"h{a}-{b}" for a, b in BUCKETS]


# ------------------------------------------------------------------------------------------------------ loading
def load(cache, split, name, S):
    f = cache / f"preds_{split}_{name}.npz"
    if not f.exists():
        return None
    z = np.load(f)
    n = len(z["origins"]) // S
    shape = (n, S, H, 3)
    return {"pred": z["pred"].reshape(shape).astype(np.float64), "truth": z["truth"].reshape(shape).astype(np.float64),
            "origins": z["origins"][::S], "complete": z["complete"].reshape(n, S)}


def load_split(cache, split, S, names=ORDER):
    runs = {k: r for k in names if (r := load(cache, split, k, S)) is not None}
    if not runs:
        return {}, None
    o0 = next(iter(runs.values()))["origins"]
    runs = {k: r for k, r in runs.items() if np.array_equal(r["origins"], o0)}     # same origins, or not compared
    return runs, o0


def scored_mask(runs, orig, gap):
    """[n,S,H]: complete for EVERY model and not a corridor-empty hour."""
    comp = np.logical_and.reduce([r["complete"] for r in runs.values()])
    ok = ~gap[orig[:, None] + np.arange(H)]
    return comp[:, :, None] & ok[:, None, :]


# ------------------------------------------------------------------------------------------------------ scores
def cells(run, mask):
    """Per origin and bucket: sum |error| and sum actual (series level, all classes). [n,B] each."""
    e = np.abs(run["pred"] - run["truth"]).sum(axis=3)              # [n,S,H]
    a = run["truth"].sum(axis=3)
    ae = np.zeros((len(e), len(BUCKETS))); act = np.zeros_like(ae)
    for b, (lo, hi) in enumerate(BUCKETS):
        m = mask[:, :, lo - 1:hi]
        ae[:, b] = (e[:, :, lo - 1:hi] * m).sum(axis=(1, 2))
        act[:, b] = (a[:, :, lo - 1:hi] * m).sum(axis=(1, 2))
    return ae, act


def bucket_scores(ae, act, rows=None):
    if rows is not None:
        ae, act = ae[rows], act[rows]
    w = ae.sum(axis=0) / act.sum(axis=0) * 100
    return w, float(w.mean())


def boot_ci(aeA, aeB, act, block=BLOCK_DAYS, reps=2000, seed=7):
    """95% interval of score(A) - score(B) by a circular moving-block bootstrap over origins (blocks of `block`
    consecutive daily origins: a 48-hour forecast overlaps the next day's, and traffic runs in weeks)."""
    n = len(act)
    rng = np.random.default_rng(seed)
    nb = int(np.ceil(n / block))
    d = np.empty(reps)
    for r in range(reps):
        rows = ((rng.integers(0, n, nb)[:, None] + np.arange(block)[None, :]) % n).ravel()[:n]
        d[r] = bucket_scores(aeA, act, rows)[1] - bucket_scores(aeB, act, rows)[1]
    return [round(float(np.percentile(d, 2.5)), 3), round(float(np.percentile(d, 97.5)), 3)]


def table(runs, mask):
    out, cl = {}, {}
    for k, r in runs.items():
        ae, act = cells(r, mask)
        w, sc = bucket_scores(ae, act)
        out[k] = {**{BLAB[i]: round(float(w[i]), 4) for i in range(len(BUCKETS))}, "score": round(sc, 4)}
        cl[k] = (ae, act)
    return out, cl


def select(runs, orig, gap, TS):
    """The champion on VALIDATION (rule in the module docstring)."""
    mask = scored_mask(runs, orig, gap)
    tab, cl = table(runs, mask)
    base = [k for k in BASELINES if k in tab]
    best_base = min(base, key=lambda k: tab[k]["score"])
    first = BLAB[0]
    best_first = min(tab[k][first] for k in base)
    cand = sorted([k for k in LEARNED if k in tab], key=lambda k: tab[k]["score"])
    eligible = [k for k in cand if tab[k]["score"] < tab[best_base]["score"] and tab[k][first] < best_first]
    sel = {"split": "validation", "origins": int(len(orig)), "first": str(TS[orig[0]]),
           "last": str(TS[orig[-1]]), "table": tab, "best_baseline": best_base, "candidates": cand,
           "eligible": eligible, "rule": "lowest mean bucket WAPE among models beating the best baseline overall and "
           "on hours 1-6; a non-significant lead over the runner-up goes to the simpler model"}
    if not eligible:
        sel.update(model="profile", why=f"no learned model beat the best baseline ({LABEL[best_base]}) on validation")
        return sel
    champ = eligible[0]
    act = cl[champ][1]
    sel["vs_best_baseline_ci"] = boot_ci(cl[champ][0], cl[best_base][0], act)
    why = f"lowest validation score ({tab[champ]['score']:.2f}% mean bucket WAPE)"
    if len(eligible) > 1:
        ru = eligible[1]
        ci = boot_ci(cl[champ][0], cl[ru][0], act)
        sel.update(runner_up=ru, vs_runner_up_ci=ci, vs_runner_up_significant=bool(ci[1] < 0))
        if ci[1] >= 0 and COMPLEXITY[ru] < COMPLEXITY[champ]:
            why = (f"{LABEL[champ]} led {LABEL[ru]} by {tab[ru]['score'] - tab[champ]['score']:.2f} points, not "
                   f"significant (95% interval {ci[0]:+.2f} to {ci[1]:+.2f}); the simpler {LABEL[ru]} wins the tie")
            sel["runner_up"], champ = champ, ru
            sel["vs_best_baseline_ci"] = boot_ci(cl[champ][0], cl[best_base][0], act)
    sel.update(model=champ, why=why)
    return sel


# ------------------------------------------------------------------------------------------------------ detail
def metrics(p, t, base_mae=None, mape_min=50):
    e = p - t
    mae = np.abs(e).mean(); rmse = np.sqrt((e ** 2).mean())
    m = t >= mape_min
    r2 = 1 - (e ** 2).sum() / ((t - t.mean()) ** 2).sum()
    out = {"MAE": mae, "RMSE": rmse, "R2": r2, "WAPE": np.abs(e).sum() / t.sum() * 100,
           "MAPE": (np.abs(e[m]) / t[m]).mean() * 100 if m.any() else None, "n": int(t.size)}
    if base_mae is not None:
        out["MASE"] = mae / base_mae
    return {k: (round(float(v), 4) if isinstance(v, (float, np.floating)) else v) for k, v in out.items()}


def detail(runs, orig, mask, D, TS):
    """Per model: overall, by condition, by hours ahead, by month, by class (series level) and the corridor total."""
    CAL, RAIN, GAP = D["cal"], D["rain"], D["corridor_gap"]
    hrs = orig[:, None] + np.arange(H)
    dow = TS[hrs.ravel()].dayofweek.to_numpy().reshape(hrs.shape)
    hol = CAL[hrs, 13] > 0; ev = CAL[hrs, 15] > 0; rain = RAIN[hrs] >= HEAVY_RAIN
    okh = ~GAP[hrs]
    slices = {"all": okh, "weekday": okh & (dow < 5) & ~hol, "weekend": okh & (dow >= 5) & ~hol, "holiday": okh & hol,
              "heavy rain": okh & rain, "event day": okh & ev}
    full = mask.any(axis=2).all(axis=1)                                   # origins where every series is scored
    month = TS[orig].month.to_numpy()
    sn = runs["snaive"]["pred"] if "snaive" in runs else None
    res = {}
    for name, r in runs.items():
        pred, t = r["pred"], r["truth"]
        corr_p, corr_t = pred.sum(axis=(1, 3)), t.sum(axis=(1, 3))
        sn_c = sn.sum(axis=(1, 3)) if sn is not None else None
        out = {"label": LABEL[name], "series": {}, "corridor": {}, "horizon": {}, "horizon_corridor": {}, "monthly_wape": {}}
        for sl, msk in slices.items():
            ms = np.broadcast_to((mask & msk[:, None, :])[..., None], pred.shape)
            if not ms.any():
                continue
            base = np.abs(sn - t)[ms].mean() if sn is not None else None
            out["series"][sl] = metrics(pred[ms], t[ms], base)
            mc = msk & full[:, None]
            if mc.any():
                out["corridor"][sl] = metrics(corr_p[mc], corr_t[mc],
                                              np.abs(sn_c - corr_t)[mc].mean() if sn_c is not None else None, 0)
        for h in (1, 6, 12, 24, 48):
            m2 = np.broadcast_to(mask[:, :, h - 1][..., None], pred[:, :, h - 1].shape)
            out["horizon"][h] = metrics(pred[:, :, h - 1][m2], t[:, :, h - 1][m2],
                                        np.abs(sn - t)[:, :, h - 1][m2].mean() if sn is not None else None)
            mc = full & okh[:, h - 1]
            out["horizon_corridor"][h] = metrics(corr_p[mc, h - 1], corr_t[mc, h - 1],
                                                 np.abs(sn_c - corr_t)[mc, h - 1].mean() if sn_c is not None else None, 0)
        for mo in sorted(set(month)):
            ms = np.broadcast_to((mask & (month == mo)[:, None, None])[..., None], pred.shape)
            out["monthly_wape"][int(mo)] = round(float(np.abs(pred - t)[ms].sum() / t[ms].sum() * 100), 2)
        out["monthly_wape_sd"] = round(float(np.std(list(out["monthly_wape"].values()))), 2)
        ms3 = mask
        out["by_class"] = {cn: metrics(pred[..., c][ms3], t[..., c][ms3]) for c, cn in enumerate(("class_1", "class_2", "class_3"))}
        ae, act = cells(r, mask)
        w, sc = bucket_scores(ae, act)
        out["buckets"] = {**{BLAB[i]: round(float(w[i]), 4) for i in range(len(BUCKETS))}, "score": round(sc, 4)}
        res[name] = out
    return res, {k: int(v.sum()) for k, v in slices.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="read and write the dryrun/ folder")
    args = ap.parse_args()
    cache = cache_dir(args.dry_run)
    D = dict(np.load(cache / "dataset.npz", allow_pickle=True))
    TS = pd.to_datetime(D["ts"])
    S = len(D["keys"]); gap = D["corridor_gap"]
    win = json.loads((cache / "windows.json").read_text())

    sf = cache / "selection.json"
    prev_sel = json.loads(sf.read_text()) if sf.exists() else None
    names = BASELINES + prev_sel["candidates"] if prev_sel else ORDER       # the models the choice was made among
    vruns, vorig = load_split(cache, "val", S, names=names)
    sel = select(vruns, vorig, gap, TS)
    if prev_sel and prev_sel.get("model") != sel["model"]:
        raise SystemExit(f"selection.json says {prev_sel['model']}, the validation files say {sel['model']}: rerun train_backtest.py")
    vmask = scored_mask(vruns, vorig, gap)
    vdet, _ = detail(vruns, vorig, vmask, D, TS)

    truns, torig = load_split(cache, "test", S)
    tmask = scored_mask(truns, torig, gap)
    tdet, slice_hours = detail(truns, torig, tmask, D, TS)
    _, tcl = table(truns, tmask)
    sig = {}
    for k in truns:
        if k in BASELINES:
            continue
        sig[k] = {}
        for b in BASELINES:
            if b in truns:
                ci = boot_ci(tcl[k][0], tcl[b][0], tcl[k][1])
                sig[k][b] = {"score_diff": round(tdet[k]["buckets"]["score"] - tdet[b]["buckets"]["score"], 3),
                             "ci95": ci, "significant": bool(ci[1] < 0)}
    comp = tmask.any(axis=2)
    res = {"protocol": __doc__.split("Rule,")[1].split("Levels:")[0].strip(), "windows": win,
           "real_end": str(D.get("real_end", "")), "broken_days": [str(x) for x in D.get("broken_days", [])],
           "selection": sel, "validation_models": vdet,
           "test": {"origins": int(len(torig)), "first": str(TS[torig[0]]), "last": str(TS[torig[-1]]),
                    "origin_hour": "00:00 every day, as served", "series_forecasts_complete": int(comp.sum()),
                    "series_forecasts": int(comp.size), "origins_all_series_complete": int(comp.all(axis=1).sum()),
                    "forecast_hours_scored": int(tmask.any(axis=1).sum()), "series": S, "slice_hours": slice_hours,
                    "heavy_rain_mm_h": HEAVY_RAIN, "fit": win["test_fit"],
                    "note": "the served configuration fitted on data before the test window only; never used for a choice"},
           "models": tdet, "test_vs_baselines": sig}
    (cache / "metrics.json").write_text(json.dumps(res, indent=1, default=str))

    print(f"VALIDATION {sel['first']} .. {sel['last']} ({sel['origins']} daily origins) - the model is chosen here")
    print(f"{'model':42s}" + "".join(f"{b:>9s}" for b in BLAB) + f"{'score':>9s}")
    for k in sorted(sel["table"], key=lambda k: sel["table"][k]["score"]):
        row = sel["table"][k]
        print(f"{LABEL[k]:42s}" + "".join(f"{row[b]:9.2f}" for b in BLAB) + f"{row['score']:9.2f}"
              + ("  <- chosen" if k == sel["model"] else ""))
    print(f"best baseline: {LABEL[sel['best_baseline']]}; eligible: {', '.join(sel['eligible']) or 'none'}")
    if "vs_runner_up_ci" in sel:
        print(f"chosen vs runner-up ({sel['runner_up']}): 95% interval {sel['vs_runner_up_ci']}")
    print(f"chosen: {sel['model']} - {sel['why']}")

    print(f"\nTEST {res['test']['first']} .. {res['test']['last']} ({len(torig)} daily origins) - never used for a choice")
    print(f"{'model':42s}" + "".join(f"{b:>9s}" for b in BLAB) + f"{'score':>9s}{'corrWAPE':>9s}{'MASE':>7s}")
    for k in sorted(tdet, key=lambda k: tdet[k]["buckets"]["score"]):
        r = tdet[k]
        print(f"{LABEL[k]:42s}" + "".join(f"{r['buckets'][b]:9.2f}" for b in BLAB) + f"{r['buckets']['score']:9.2f}"
              f"{r['corridor']['all']['WAPE']:9.2f}{r['series']['all'].get('MASE') or float('nan'):7.3f}")
    for k, v in sig.items():
        for b, s in v.items():
            print(f"  {LABEL[k]} minus {LABEL[b]}: {s['score_diff']:+.2f} points, 95% interval {s['ci95']} "
                  f"({'significant' if s['significant'] else 'NOT significant'})")
    print("\nTest series WAPE % by condition")
    sl = [s for s in slice_hours if s != "all"]
    print(f"{'model':42s}" + "".join(f"{s:>11s}" for s in sl))
    for k, r in tdet.items():
        print(f"{r['label']:42s}" + "".join(f"{r['series'][s]['WAPE']:11.2f}" if s in r["series"] else f"{'-':>11s}" for s in sl))
    print("saved", cache / "metrics.json")


if __name__ == "__main__":
    main()
