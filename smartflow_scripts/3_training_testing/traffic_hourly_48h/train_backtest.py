"""
SmartFlow NLEX - 48-hour hourly forecast: VALIDATION and TEST forecasts on windows derived from the data, with the
model chosen on validation only (EVALUATION_PROTOCOL.md; rewritten 10 Nov 2026).

    python train_backtest.py                      # validation forecasts of all four learned models, the choice on
                                                  # validation, then the chosen model's test fit
    python train_backtest.py --models selected    # the weekly batch: the same, refitting only what is missing/stale
    python train_backtest.py --models stacked     # validation + test for named models only (baselines always)
    python train_backtest.py --test-all           # also test-fit every learned model (reported; never chooses)
    python train_backtest.py --refit-validation   # refit the validation fits on the derived windows (slow)
    python train_backtest.py --dry-run            # all of it in the dryrun/ folder; nothing live is touched

Why it changed: every window and the end of the real record (2025-12-31) were hard-coded, so each weekly run repeated
the same fit and ignored the real 2026 data loaded on 6 Nov; the model was chosen on the 2025 test itself; and the
served model (refitted to 2025-09-30) was never scored out of sample - the 12.8% described the backtest model.

Splits, all derived from the last real day R (features.windows; R = 2026-05-24 until the client re-extracts June):
  test        every day 00:00 over the last 20 weeks to R          the served configuration, never used for a choice
  validation  every day 00:00 over the 52 weeks before the test    model choice (evaluate.select) and the 80% band
  fits        a model scored from origin X is fitted on origins up to X - 12 weeks, early-stopped on the 12 weeks
              before X, scaled on hours before X - 12 weeks; the test fit is exactly the production recipe moved
              back to the test start, so the test measures the served configuration.
Validation forecasts may come from any fit that saw nothing after the validation start: the 2025 backtest fits of
24 Oct / 2 Nov (fitted to 2024-09-30, stopped on Q4 2024) qualify and are reused rather than refitted (an hour of CPU
each); --refit-validation refits them on the derived windows instead.
Candidates: snaive and profile (baselines); lstm1, stacked, dualpath (models.py); hybrid = dualpath + an XGBoost
correction fitted on the early-stopping residuals.
Outputs: preds_val_<model>.npz, preds_test_<model>.npz, models/val_*.keras, models/test_*.keras (+ .fit.json and
.scaler.npz each), windows.json, selection.json, train_log.json.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import (H, LABEL, LEARNED, LEGACY_VAL_FIT, LIVE_CACHE, Batches_for, Features, apply_hybrid,  # noqa: E402
                      cache_dir, daily_origins, fit_record, hybrid_features, save_fit_record, step_origins, windows)
import evaluate  # noqa: E402


def hour(TS, t):
    return int(pd.Index(TS).get_loc(pd.Timestamp(t)))


def fingerprint(D, rec):
    """Totals of the counts a fit reads (fit + early-stopping windows), so a corrected upload forces a refit."""
    TS = pd.to_datetime(D["ts"])
    a, b = hour(TS, rec["fit"][0]) - 56 * 24, hour(TS, rec["es"][1]) + H
    return round(float(D["Y"][max(a, 0):b].astype(np.float64).sum()), 1)


def save_preds(cache, split, name, F, orig, pred_fn):
    o, s = F.pairs(orig, only_complete=False)
    pred = pred_fn(o, s)
    np.savez_compressed(cache / f"preds_{split}_{name}.npz", pred=pred.astype(np.float32), origins=o, series=s,
                        truth=F.truth(o, s), complete=F.complete(o, s))


def predict_counts(F, m, o, s, reg=None):
    out = []
    for i in range(0, len(o), 4096):
        X, _ = F.batch(o[i:i + 4096], s[i:i + 4096])
        z = m.predict(X, batch_size=1024, verbose=0)
        if reg is not None:
            z = apply_hybrid(reg, X, z)
        out.append(F.to_counts(z, s[i:i + 4096]))
    return np.concatenate(out)


def fit_model(kind, D, rec, path, log, tag):
    """Fit lstm1 / stacked / dualpath on the windows in rec; save the model, its scaler and its fit record."""
    import keras
    from models import build
    TS = pd.to_datetime(D["ts"]); gap = D["corridor_gap"]
    F = Features(D, hour(TS, rec["scaler_until"]), fallback_until=hour(TS, rec["fallback_until"]))
    o_tr, s_tr = F.pairs(step_origins(TS, gap, *rec["fit"], rec["step"]))
    o_va, s_va = F.pairs(step_origins(TS, gap, *rec["es"], rec["step"]))
    Xva, yva = F.batch(o_va, s_va)
    keras.utils.set_random_seed(42)
    m = build(kind, F.S, Xva["short"].shape[1:], Xva["long"].shape[1:], Xva["future"].shape[1:])
    t0 = time.time()
    print(f"  {tag} {kind}: fit origins {rec['fit'][0][:10]} .. {rec['fit'][1][:10]} ({len(o_tr):,} samples), "
          f"early stopping {rec['es'][0][:10]} .. {rec['es'][1][:10]} ({len(o_va):,})", flush=True)
    hist = m.fit(Batches_for(F, o_tr, s_tr), validation_data=(Xva, yva), epochs=40, verbose=2,
                 callbacks=[keras.callbacks.EarlyStopping(patience=4, restore_best_weights=True),
                            keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=2)])
    m.save(path)
    np.savez(str(path).replace(".keras", ".scaler.npz"), **F.scaler)
    info = {**rec, "kind": kind, "params": int(m.count_params()), "epochs": len(hist.history["loss"]),
            "best_val_loss": float(min(hist.history["val_loss"])), "train_sec": round(time.time() - t0),
            "train_samples": int(len(o_tr)), "es_samples": int(len(o_va)), "data_fingerprint": fingerprint(D, rec),
            "trained_at": pd.Timestamp.now().isoformat(timespec="seconds")}
    save_fit_record(path, info)
    log[f"{tag}_{kind}"] = info
    return m, F, (Xva, yva)


def fit_hybrid_xgb(m, es, path):
    """XGBoost on the dual-path model's early-stopping residuals (scaled space): the hybrid's correction."""
    import xgboost as xgb
    Xva, yva = es
    zva = m.predict(Xva, batch_size=1024, verbose=0)
    rva = np.concatenate([(yva[..., c] - zva[..., c]).ravel() for c in range(3)])
    reg = xgb.XGBRegressor(n_estimators=400, max_depth=6, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8,
                           tree_method="hist", random_state=42, n_jobs=-1)
    reg.fit(hybrid_features(Xva, zva), rva)
    reg.save_model(str(path))
    return reg


def load_fit(D, model_path, rec):
    """A saved fit with the Features (scaler) it was trained with."""
    import keras
    TS = pd.to_datetime(D["ts"])
    sp = Path(str(model_path).replace(".keras", ".scaler.npz"))
    scaler = dict(np.load(sp, allow_pickle=True)) if sp.exists() else None
    F = Features(D, hour(TS, rec["scaler_until"]), scaler=scaler, fallback_until=hour(TS, rec["fallback_until"]))
    return keras.models.load_model(model_path, safe_mode=False), F


def es_set(D, F, rec):
    TS = pd.to_datetime(D["ts"])
    o, s = F.pairs(step_origins(TS, D["corridor_gap"], *rec["es"], rec["step"]))
    return F.batch(o, s)


class NoFit(Exception):
    pass


def get_fit(kind, D, cache, rec, tag, log, allow_legacy, refit, may_train=True):
    """(model, Features, xgb-or-None, record) for `kind` fitted on windows that end before rec's first scored origin.
    Reuses a saved fit when its record matches (same windows, same data); trains otherwise (NoFit if may_train=False)."""
    import xgboost as xgb
    base = "dualpath" if kind == "hybrid" else kind
    path = cache / "models" / f"{tag}_{base}.keras"
    xgb_path = cache / "models" / f"{tag}_hybrid_xgb.json"
    m = F = None
    have = fit_record(path)
    if not refit and have and all(have.get(k) == rec[k] for k in ("fit", "es", "scaler_until", "fallback_until")) \
            and have.get("data_fingerprint") == fingerprint(D, rec):
        m, F = load_fit(D, path, have)
        used = have
        print(f"  {tag} {base}: reusing the fit of {have['trained_at']} (same windows, same data)")
    elif tag == "val" and allow_legacy and not refit:
        # the 2025 backtest fits: valid validation forecasters when they saw nothing after the validation start
        for d in (cache, LIVE_CACHE):
            lp = d / "models" / f"{base}.keras"
            if lp.exists() and pd.Timestamp(LEGACY_VAL_FIT["es"][1]) + pd.Timedelta(hours=H) <= pd.Timestamp(rec["first_scored_origin"]):
                m, F = load_fit(D, lp, LEGACY_VAL_FIT)
                used = {**LEGACY_VAL_FIT, "file": str(lp)}
                xgb_path = d / "models" / "hybrid_xgb.json"
                print(f"  val {base}: the 2025 backtest fit ({lp.name}, fitted to 2024-09-30, stopped on Q4 2024)")
                break
    if m is None:
        if not may_train:
            raise NoFit(kind)
        m, F, es = fit_model(base, D, rec, path, log, tag)
        used = fit_record(path)
        reg = fit_hybrid_xgb(m, es, xgb_path) if kind == "hybrid" else None
        return m, F, reg, used
    reg = None
    if kind == "hybrid":
        if xgb_path.exists() and (used.get("source") or (xgb_path.stat().st_mtime >= path.stat().st_mtime)):
            reg = xgb.XGBRegressor(); reg.load_model(str(xgb_path))
        else:
            reg = fit_hybrid_xgb(m, es_set(D, F, used), cache / "models" / f"{tag}_hybrid_xgb.json")
    return m, F, reg, used


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="lstm1,stacked,dualpath,hybrid")
    ap.add_argument("--test-all", action="store_true", help="test-fit every learned model (reported, never chooses)")
    ap.add_argument("--refit-validation", action="store_true", help="refit the validation fits on the derived windows")
    ap.add_argument("--dry-run", action="store_true", help="read and write the dryrun/ folder only")
    ap.add_argument("--test-weeks", type=int, default=20)
    ap.add_argument("--val-weeks", type=int, default=52)
    args = ap.parse_args()
    cache = cache_dir(args.dry_run)
    D = dict(np.load(cache / "dataset.npz", allow_pickle=True))
    TS = pd.to_datetime(D["ts"]); gap = D["corridor_gap"]
    real_end = str(D["real_end"]) if "real_end" in D else str(TS[int(D["n_hist"]) - 1].date())
    W = windows(real_end, test_weeks=args.test_weeks, val_weeks=args.val_weeks)
    (cache / "windows.json").write_text(json.dumps(W, indent=1))
    V = daily_origins(TS, *W["validation"]); T = daily_origins(TS, *W["test"])
    assert (V >= 0).all() and (T >= 0).all() and T[-1] + H <= int(D["n_hist"]), "windows run past the real record"
    print(f"last real day {real_end}: validation {W['validation'][0][:10]} .. {W['validation'][1][:10]} ({len(V)} origins), "
          f"test {W['test'][0][:10]} .. {W['test'][1][:10]} ({len(T)} origins, 00:00 daily)", flush=True)

    logf = cache / "train_log.json"
    log = json.loads(logf.read_text()) if logf.exists() else {}
    F0 = Features(D, hour(TS, W["val_fit"]["scaler_until"]))
    for split, orig in (("val", V), ("test", T)):
        save_preds(cache, split, "snaive", F0, orig, F0.snaive)
        save_preds(cache, split, "profile", F0, orig, F0.profile)

    wanted = args.models.split(",")
    # --models selected (the weekly batch): every learned model whose validation fit exists or can be reused joins the
    # choice; only the previous production model (stacked when none) is trained when its fit is missing.
    cheap_only = wanted == ["selected"]
    prev = None
    if cheap_only:
        wanted = list(LEARNED)
        pf = cache / "production.json"
        prev = json.loads(pf.read_text()).get("model") if pf.exists() else None
        prev = prev if prev in LEARNED else "stacked"
    # 1. validation forecasts
    for kind in LEARNED:
        if kind not in wanted:
            continue
        rec = W["val_fit"]
        try:
            m, F, reg, used = get_fit(kind, D, cache, rec, "val", log, allow_legacy=True, refit=args.refit_validation,
                                      may_train=not cheap_only or kind == prev)
        except NoFit:
            print(f"  val {kind}: no validation fit on disk (--models selected trains none); left out of the choice")
            wanted.remove(kind)
            continue
        save_preds(cache, "val", kind, F, V, lambda o, s: predict_counts(F, m, o, s, reg))
        log[f"val_{kind}_used"] = {k: v for k, v in used.items() if k != "data_fingerprint"}
        logf.write_text(json.dumps(log, indent=1, default=str))

    # 2. the choice, on validation only
    S = len(D["keys"])
    vruns, vorig = evaluate.load_split(cache, "val", S, names=["snaive", "profile"] + [k for k in LEARNED if k in wanted])
    sel = evaluate.select(vruns, vorig, gap, TS)
    sel["windows"] = W
    (cache / "selection.json").write_text(json.dumps(sel, indent=1, default=str))
    print(f"\nchosen on validation: {sel['model']} - {sel['why']}", flush=True)
    for k in sorted(sel["table"], key=lambda k: sel["table"][k]["score"]):
        print(f"  {LABEL[k]:40s} score {sel['table'][k]['score']:6.2f}  " +
              "  ".join(f"{b} {v:6.2f}" for b, v in sel["table"][k].items() if b != "score"))

    # 3. test fits: the chosen model (the served configuration), and every learned model with --test-all
    test_kinds = [sel["model"]] if sel["model"] in LEARNED else []
    if args.test_all:
        test_kinds = [k for k in LEARNED if k in wanted]
    for old in cache.glob("preds_test_*.npz"):                 # a stale test file must not join this comparison
        if old.stem.replace("preds_test_", "") not in test_kinds + ["snaive", "profile"]:
            old.unlink()
    for kind in test_kinds:
        print(f"\n=== test fit: {kind}", flush=True)
        m, F, reg, used = get_fit(kind, D, cache, W["test_fit"], "test", log, allow_legacy=False, refit=False)
        save_preds(cache, "test", kind, F, T, lambda o, s: predict_counts(F, m, o, s, reg))
        logf.write_text(json.dumps(log, indent=1, default=str))
    print("\ndone; run evaluate.py for the scores", flush=True)


if __name__ == "__main__":
    main()
