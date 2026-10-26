"""
SmartFlow NLEX - 48-hour forecast: choose the production model from the 2025 backtest, refit it on the real record,
and calibrate its uncertainty band.

    python train_production.py                 # select (metrics.json), refit, calibrate -> production.json
    python train_production.py --model stacked # force a candidate

Selection (out-of-sample 2025 backtest, evaluate.py): lowest series-level WAPE over all 48 hours; a simpler candidate
within 1% (relative) of the best is preferred (lstm1 < stacked < dualpath < hybrid), and a learned model must beat
both the seasonal naive and the current method, otherwise the current method stays in production.

Refit: the same configuration on the real record only (2026 is synthetic), training origins 2022-02-28 ..
2025-09-30, early stopping on 2025-10-08 .. 2025-12-29, scalers on hours before 2025-10-02. The hybrid's XGBoost
correction is refitted on the same validation window.

Band: split conformal on the selected model's own 2025 backtest forecasts. Per series, horizon and class, the 10th and
90th percentiles of log1p(actual) - log1p(forecast) give an 80% band. Calibrated on January-June origins and checked
on July-December (reported as coverage); the served band uses all of 2025. The corridor total has its own band.
"""
import argparse, json, os, sys, time
from datetime import datetime
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "config"))
from db import WORK  # noqa: E402
from features import H, Batches_for, Features, apply_hybrid, hybrid_features  # noqa: E402

CACHE = Path(WORK) / "cache" / "traffic_hourly_48h"
SIMPLER = ["lstm1", "stacked", "dualpath", "hybrid"]
LEVEL = 0.80


def select(metrics):
    m = metrics["models"]
    wape = {k: m[k]["series"]["all"]["WAPE"] for k in m}
    bar = min(wape.get("snaive", np.inf), wape.get("profile", np.inf))
    learned = [k for k in SIMPLER if k in wape]
    if not learned or min(wape[k] for k in learned) >= bar:
        return "profile", wape, "no learned model beat the seasonal naive and the current method"
    best = min(learned, key=lambda k: wape[k])
    for k in learned:                                         # simplest first
        if wape[k] <= wape[best] * 1.01:
            why = (f"lowest WAPE ({wape[k]:.2f}%)" if k == best else
                   f"within 1% of the best ({wape[k]:.2f}% vs {best} {wape[best]:.2f}%) and simpler")
            return k, wape, why
    return best, wape, "lowest WAPE"


def calibrate(name, D):
    z = np.load(CACHE / f"preds_{name}.npz")
    S = len(D["keys"]); n = len(z["origins"]) // S
    p = z["pred"].reshape(n, S, H, 3).astype(np.float64); t = z["truth"].reshape(n, S, H, 3).astype(np.float64)
    comp = z["complete"].reshape(n, S); orig = z["origins"][::S]
    ts = pd.to_datetime(D["ts"]); gap = D["corridor_gap"]
    ok = (~gap[orig[:, None] + np.arange(H)])[:, None, :, None] & comp[:, :, None, None]
    ok = np.broadcast_to(ok, p.shape)
    r = np.where(ok, np.log1p(t) - np.log1p(p), np.nan)
    first = ts[orig].month.to_numpy() <= 6
    lo_q, hi_q = (1 - LEVEL) / 2, 1 - (1 - LEVEL) / 2

    def bands(rr):
        return np.nanquantile(rr, lo_q, axis=0), np.nanquantile(rr, hi_q, axis=0)          # [S,H,3]

    def cover(lo, hi, rr):
        v = ~np.isnan(rr)
        return float(((rr >= lo) & (rr <= hi))[v].mean())
    lo1, hi1 = bands(r[first])
    cov_series = cover(lo1, hi1, r[~first])
    # corridor total: its own residuals (the sum of per-series bands would be far too wide)
    full = comp.all(axis=1)
    cp, ct = p.sum(axis=(1, 3)), t.sum(axis=(1, 3))
    cr = np.where(full[:, None] & ~gap[orig[:, None] + np.arange(H)], np.log1p(ct) - np.log1p(cp), np.nan)
    clo1, chi1 = np.nanquantile(cr[first], lo_q, axis=0), np.nanquantile(cr[first], hi_q, axis=0)
    cov_corr = cover(clo1, chi1, cr[~first])
    # by condition on the check half: holiday hours are where the band is least reliable
    hol = D["cal"][orig[:, None] + np.arange(H), 13] > 0
    hol_b = np.broadcast_to(hol[:, None, :, None], r.shape)
    rr2 = r[~first]; hb = hol_b[~first]
    cov_hol = float(((rr2 >= lo1) & (rr2 <= hi1))[hb & ~np.isnan(rr2)].mean()) if (hb & ~np.isnan(rr2)).any() else None
    cov_nonhol = float(((rr2 >= lo1) & (rr2 <= hi1))[~hb & ~np.isnan(rr2)].mean())
    # a series' all-class total (what the dashboard plots for one plaza)
    okt = ok[..., 0]
    rt = np.where(okt, np.log1p(t.sum(axis=3)) - np.log1p(p.sum(axis=3)), np.nan)           # [n,S,H]
    tlo1, thi1 = np.nanquantile(rt[first], lo_q, axis=0), np.nanquantile(rt[first], hi_q, axis=0)
    cov_total = cover(tlo1, thi1, rt[~first])
    lo, hi = bands(r)
    tlo, thi = np.nanquantile(rt, lo_q, axis=0), np.nanquantile(rt, hi_q, axis=0)
    clo, chi = np.nanquantile(cr, lo_q, axis=0), np.nanquantile(cr, hi_q, axis=0)
    np.savez(CACHE / "intervals.npz", lo=np.nan_to_num(lo), hi=np.nan_to_num(hi), tot_lo=np.nan_to_num(tlo),
             tot_hi=np.nan_to_num(thi), corr_lo=clo, corr_hi=chi, level=LEVEL)
    return {"level": LEVEL, "method": "split conformal on log residuals, per series x horizon x class",
            "calibrated_on": "2025 origins Jan-Jun", "checked_on": "2025 origins Jul-Dec",
            "coverage_series": round(cov_series, 4), "coverage_series_total": round(cov_total, 4),
            "coverage_corridor": round(cov_corr, 4),
            "coverage_series_holiday_hours": None if cov_hol is None else round(cov_hol, 4),
            "coverage_series_other_hours": round(cov_nonhol, 4), "served_band_from": "all 2025 origins"}


def refit(kind, D, log):
    import keras
    from models import build
    ts = pd.to_datetime(D["ts"]); hour_of = {t: i for i, t in enumerate(ts)}
    gap = D["corridor_gap"]
    fit_until = hour_of[pd.Timestamp("2025-10-02 00:00")]
    F = Features(D, fit_until)

    def origins(a, b, step=7):
        o = np.arange(hour_of[pd.Timestamp(a)], hour_of[pd.Timestamp(b)] + 1, step)
        return o[[not gap[i:i + H].any() for i in o]]

    def pairs(orig):
        o = np.repeat(orig, F.S); s = np.tile(np.arange(F.S), len(orig))
        k = F.complete(o, s)
        return o[k], s[k]
    o_tr, s_tr = pairs(origins("2022-02-28 00:00", "2025-09-30 00:00"))
    o_va, s_va = pairs(origins("2025-10-08 00:00", "2025-12-29 00:00"))
    Xva, yva = F.batch(o_va, s_va)
    base = "dualpath" if kind == "hybrid" else kind
    keras.utils.set_random_seed(42)
    m = build(base, F.S, Xva["short"].shape[1:], Xva["long"].shape[1:], Xva["future"].shape[1:])
    t0 = time.time()
    hist = m.fit(Batches_for(F, o_tr, s_tr), validation_data=(Xva, yva), epochs=40, verbose=2,
                 callbacks=[keras.callbacks.EarlyStopping(patience=4, restore_best_weights=True),
                            keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=2)])
    m.save(CACHE / "models" / f"prod_{base}.keras")
    zva = F.predict(m, o_va, s_va)
    out = {"model_file": f"models/prod_{base}.keras", "train_samples": int(len(o_tr)), "val_samples": int(len(o_va)),
           "epochs": len(hist.history["loss"]), "best_val_loss": float(min(hist.history["val_loss"])),
           "train_sec": round(time.time() - t0), "params": int(m.count_params()),
           "fit_window": "origins 2022-02-28 .. 2025-09-30", "early_stopping_window": "origins 2025-10-08 .. 2025-12-29"}
    if kind == "hybrid":
        import xgboost as xgb
        F_va = hybrid_features(Xva, zva)
        rva = np.concatenate([(yva[..., c] - zva[..., c]).ravel() for c in range(3)])
        reg = xgb.XGBRegressor(n_estimators=400, max_depth=6, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8,
                               tree_method="hist", random_state=42, n_jobs=-1)
        reg.fit(F_va, rva)
        reg.save_model(str(CACHE / "models" / "prod_hybrid_xgb.json"))
        out["xgb_file"] = "models/prod_hybrid_xgb.json"
        zva = apply_hybrid(reg, Xva, zva)
    pv, tv = F.to_counts(zva, s_va), F.Y[o_va[:, None] + np.arange(H), s_va[:, None]]
    out["q4_2025_wape_in_sample_stopping"] = round(float(np.abs(pv - tv).sum() / tv.sum() * 100), 2)
    np.savez(CACHE / "scaler_prod.npz", **F.scaler)
    out["scaler_file"] = "scaler_prod.npz"
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="auto")
    args = ap.parse_args()
    D = dict(np.load(CACHE / "dataset.npz", allow_pickle=True))
    metrics = json.loads((CACHE / "metrics.json").read_text())
    if args.model == "auto":
        kind, wape, why = select(metrics)
    else:
        kind, wape, why = args.model, {k: v["series"]["all"]["WAPE"] for k, v in metrics["models"].items()}, "forced"
    print(f"selected: {kind} ({why})", flush=True)
    prod = {"model": kind, "label": metrics["models"][kind]["label"], "why": why, "backtest_wape": wape,
            "backtest": {k: metrics["models"][kind][k] for k in ("series", "corridor", "horizon", "horizon_corridor",
                                                                  "monthly_wape_sd", "by_class")},
            "naive_backtest": {"series": metrics["models"]["snaive"]["series"]["all"],
                               "corridor": metrics["models"]["snaive"]["corridor"]["all"]},
            "current_method_backtest": {"series": metrics["models"]["profile"]["series"]["all"],
                                        "corridor": metrics["models"]["profile"]["corridor"]["all"]},
            "test_window": metrics["test"], "selected_at": datetime.now().isoformat(timespec="seconds"),
            "trained_through": "2025-12-31 (real record; 2026 is synthetic and never trained on)"}
    if kind in SIMPLER:
        prod["refit"] = refit(kind, D, prod)
    prod["intervals"] = calibrate(kind, D)
    print(json.dumps(prod["intervals"], indent=1))
    (CACHE / "production.json").write_text(json.dumps(prod, indent=1))
    print("saved", CACHE / "production.json")


if __name__ == "__main__":
    main()
