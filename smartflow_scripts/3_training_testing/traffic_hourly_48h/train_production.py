"""
SmartFlow NLEX - 48-hour forecast: refit the model chosen on VALIDATION on all real data, and calibrate its band.

    python train_production.py                 # the validation choice (metrics.json), refit, band -> production.json
    python train_production.py --model stacked # force a candidate (recorded as forced)
    python train_production.py --dry-run       # the same in the dryrun/ folder; nothing live is touched

Choice: made on validation only (evaluate.select; the rule is in evaluate.py). The test never chooses anything: it
reports how the served configuration did on the last weeks of real data, against both baselines, with intervals.
Refit: the chosen configuration on every real day to the last real day R (features.windows "prod_fit": fitted on
origins to R - 12 weeks, early-stopped on the last 12 weeks, scaled on hours before R - 12 weeks). It is exactly the
recipe the test fit followed from the test start, so the test scores what is served. The hybrid's XGBoost correction
refits on the same early-stopping window. A fit whose windows and data are unchanged is reused, not repeated.
Band (80%): split conformal on log1p(actual) - log1p(forecast), per series x hour ahead x class (and per series total,
and for the corridor). Coverage is measured out of sample: calibrated on the chosen model's VALIDATION forecasts and
checked on the TEST forecasts of the served configuration (it used to be calibrated and checked on the backtest model
alone). The served band is made by the same procedure one step on - calibrated on the most recent 52 weeks of
out-of-sample forecasts (the end of validation and the test) - so the measured coverage describes the procedure that
made it.
"""
import argparse, json, os, shutil, sys
from datetime import datetime
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import H, LABEL, LEARNED, cache_dir  # noqa: E402
import evaluate  # noqa: E402

SIMPLER = LEARNED
LEVEL = 0.80


def code_version():
    """The git commit this code came from (+ '-dirty' with uncommitted changes here); protocol section 8."""
    import subprocess
    here = str(Path(__file__).resolve().parent)
    try:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=here, capture_output=True, text=True,
                             timeout=10).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "--", "."], cwd=here, capture_output=True, text=True,
                               timeout=10).stdout.strip()
        return (sha + ("-dirty" if dirty else "")) or None
    except Exception:                                # noqa: BLE001 - no git here
        return None


def residuals(run, D):
    """Log residuals where scored: per series x hour x class [n,S,H,3], per series total [n,S,H], corridor [n,H]."""
    gap = D["corridor_gap"]
    orig = run["origins"]
    p, t, comp = run["pred"], run["truth"], run["complete"]
    okh = ~gap[orig[:, None] + np.arange(H)]                                   # [n,H]
    ok = comp[:, :, None] & okh[:, None, :]                                    # [n,S,H]
    r = np.where(ok[..., None], np.log1p(t) - np.log1p(p), np.nan)
    rt = np.where(ok, np.log1p(t.sum(axis=3)) - np.log1p(p.sum(axis=3)), np.nan)
    full = comp.all(axis=1)
    cr = np.where(full[:, None] & okh, np.log1p(t.sum(axis=(1, 3))) - np.log1p(p.sum(axis=(1, 3))), np.nan)
    hol = D["cal"][orig[:, None] + np.arange(H), 13] > 0                       # [n,H]
    return r, rt, cr, hol


def calibrate(kind, D, cache, W):
    val = evaluate.load(cache, "val", kind, len(D["keys"]))
    test = evaluate.load(cache, "test", kind, len(D["keys"]))
    lo_q, hi_q = (1 - LEVEL) / 2, 1 - (1 - LEVEL) / 2
    q = lambda a: (np.nanquantile(a, lo_q, axis=0), np.nanquantile(a, hi_q, axis=0))   # noqa: E731

    def cover(lo, hi, rr, mask=None):
        v = ~np.isnan(rr) if mask is None else (~np.isnan(rr) & mask)
        return round(float(((rr >= lo) & (rr <= hi))[v].mean()), 4) if v.any() else None
    vr, vrt, vcr, _ = residuals(val, D)
    out = {"level": LEVEL, "method": "split conformal on log residuals, per series x horizon x class"}
    if test is not None:
        tr, trt, tcr, thol = residuals(test, D)
        lo, hi = q(vr); tlo, thi = q(vrt); clo, chi = q(vcr)
        holb = np.broadcast_to(thol[:, None, :, None], tr.shape)
        out.update({
            "calibrated_on": f"validation forecasts {W['validation'][0][:10]} .. {W['validation'][1][:10]}",
            "checked_on": f"test forecasts of the served configuration {W['test'][0][:10]} .. {W['test'][1][:10]}",
            "coverage_series": cover(lo, hi, tr), "coverage_series_total": cover(tlo, thi, trt),
            "coverage_corridor": cover(clo, chi, tcr),
            "coverage_series_holiday_hours": cover(lo, hi, tr, holb),
            "coverage_series_other_hours": cover(lo, hi, tr, ~holb)})
    # The served band: the same procedure on the latest 52 weeks of out-of-sample forecasts.
    R = pd.Timestamp(W["real_end"])
    ts = pd.to_datetime(D["ts"])
    keep_v = ts[val["origins"]] >= R + pd.Timedelta(days=1) - pd.Timedelta(weeks=52)
    parts = [(vr[keep_v], vrt[keep_v], vcr[keep_v])] + ([(tr, trt, tcr)] if test is not None else [])
    r_all = np.concatenate([a for a, _, _ in parts]); rt_all = np.concatenate([b for _, b, _ in parts])
    cr_all = np.concatenate([c for _, _, c in parts])
    lo, hi = q(r_all); tlo, thi = q(rt_all); clo, chi = q(cr_all)
    np.savez(cache / "intervals.npz", lo=np.nan_to_num(lo), hi=np.nan_to_num(hi), tot_lo=np.nan_to_num(tlo),
             tot_hi=np.nan_to_num(thi), corr_lo=np.nan_to_num(clo), corr_hi=np.nan_to_num(chi), level=LEVEL)
    out["served_band_from"] = (f"the latest 52 weeks of out-of-sample forecasts ({int(keep_v.sum())} validation + "
                               f"{0 if test is None else len(test['origins'])} test origins)")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="auto")
    ap.add_argument("--dry-run", action="store_true", help="read and write the dryrun/ folder only")
    args = ap.parse_args()
    cache = cache_dir(args.dry_run)
    D = dict(np.load(cache / "dataset.npz", allow_pickle=True))
    metrics = json.loads((cache / "metrics.json").read_text())
    W = metrics["windows"]
    sel = metrics["selection"]
    kind, why = (sel["model"], sel["why"]) if args.model == "auto" else (args.model, "forced (--model)")
    print(f"selected: {kind} ({why})", flush=True)
    tm = metrics["models"]
    prod = {"model": kind, "label": LABEL.get(kind, kind), "why": why,
            "backtest_wape": {k: v["score"] for k, v in sel["table"].items()},
            "selection": sel, "windows": W,
            # the served configuration's TEST (out of sample, never used for a choice), beside both baselines
            "backtest": ({k: tm[kind][k] for k in ("series", "corridor", "horizon", "horizon_corridor", "buckets",
                                                    "monthly_wape_sd", "by_class")} if kind in tm else None),
            "naive_backtest": {"series": tm["snaive"]["series"]["all"], "corridor": tm["snaive"]["corridor"]["all"],
                               "buckets": tm["snaive"]["buckets"]},
            "current_method_backtest": {"series": tm["profile"]["series"]["all"],
                                        "corridor": tm["profile"]["corridor"]["all"], "buckets": tm["profile"]["buckets"]},
            "test_vs_baselines": metrics.get("test_vs_baselines", {}).get(kind),
            "test_window": metrics["test"], "selected_at": datetime.now().isoformat(timespec="seconds"),
            "real_end": W["real_end"], "code_version": code_version(),
            "trained_through": (f"{W['real_end']} (the last day of real toll data; later days in the warehouse are "
                                f"broken, missing or synthetic and are treated as unknown)")}
    if kind in SIMPLER:
        import train_backtest as tb
        log = {}
        m, F, reg, rec = tb.get_fit(kind, D, cache, W["prod_fit"], "prod", log, allow_legacy=False, refit=False)
        base = "dualpath" if kind == "hybrid" else kind
        shutil.copyfile(cache / "models" / f"prod_{base}.scaler.npz", cache / "scaler_prod.npz")
        prod["refit"] = {"model_file": f"models/prod_{base}.keras", "scaler_file": "scaler_prod.npz",
                         "fit_window": f"origins {rec['fit'][0][:10]} .. {rec['fit'][1][:10]}",
                         "early_stopping_window": f"origins {rec['es'][0][:10]} .. {rec['es'][1][:10]}",
                         **{k: rec.get(k) for k in ("train_samples", "es_samples", "epochs", "best_val_loss",
                                                     "train_sec", "params", "trained_at")}}
        if kind == "hybrid":
            prod["refit"]["xgb_file"] = "models/prod_hybrid_xgb.json"
    prod["intervals"] = calibrate(kind, D, cache, W)
    print(json.dumps(prod["intervals"], indent=1))
    (cache / "production.json").write_text(json.dumps(prod, indent=1, default=str))
    print("saved", cache / "production.json")


if __name__ == "__main__":
    main()
