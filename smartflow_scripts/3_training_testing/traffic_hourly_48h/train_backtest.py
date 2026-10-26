"""
SmartFlow NLEX - 48-hour hourly forecast: train and backtest every candidate on the same data and the same test.

    python train_backtest.py                      # all models
    python train_backtest.py --models dualpath    # one model (baselines are cheap and always recomputed)
    python train_backtest.py --models selected    # the production model only (the weekly batch)

Splits (by the hours a forecast covers; nothing from a later period is ever used to fit an earlier one):
  train      origins 2022-02-28 .. 2024-09-30, every 7 hours (so origins fall on every hour of the day)
  validation origins 2024-10-08 .. 2024-12-29 (early stopping, and fitting the XGBoost correction)
  test       origins 2025-01-08 .. 2025-12-29, every 5 hours: the real 2025 counts. 2026 is synthetic and never used.
Scaling: log1p, then a per-series, per-class z-score fitted on the training hours only (see the scaler note below).
Missing series-days (no trips at all) are data gaps: no forecast is trained or scored whose inputs or targets touch one.

Candidates:
  snaive     the same hour one week earlier
  profile    the current dashboard method: a day's total (same weekday last week) spread by that plaza's usual hourly
             shape for that weekday (last 4 weeks)
  lstm1, stacked, dualpath   (models.py)
  hybrid     dualpath + XGBoost fitted on the validation residuals (residual correction)
Outputs (in _work/cache/traffic_hourly_48h/): preds_<model>.npz with the 2025 forecasts, models/<model>.keras,
scaler.npz, and train_log.json.
"""
import argparse, json, os, sys, time
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "config"))
from db import WORK  # noqa: E402

CACHE = Path(WORK) / "cache" / "traffic_hourly_48h"
(CACHE / "models").mkdir(parents=True, exist_ok=True)
H, SHORT, LONG_D = 48, 72, 56
SHORT_CAL = [0, 1, 2, 3, 13, 15]          # hod sin/cos, dow sin/cos, holiday, event_day (see build_dataset.cal_names)


# ----------------------------------------------------------------------------------------------------------- data
D = np.load(CACHE / "dataset.npz", allow_pickle=True)
Y, CAL, RAIN = D["Y"], D["cal"], D["rain"]
TS = pd.to_datetime(D["ts"])
GAP, SYN = D["corridor_gap"], D["is_synthetic"]
T, S, _ = Y.shape
hour_of = {t: i for i, t in enumerate(TS)}


def origins(a, b, step):
    i0, i1 = hour_of[pd.Timestamp(a)], hour_of[pd.Timestamp(b)]
    return np.arange(i0, i1 + 1, step)


def no_gap(o):                                   # drop windows that touch a corridor-empty hour (toll holidays)
    return o[[not GAP[i:i + H].any() for i in o]]


TRAIN_O = no_gap(origins("2022-02-28 00:00", "2024-09-30 00:00", 7))
VAL_O = no_gap(origins("2024-10-08 00:00", "2024-12-29 00:00", 7))
TEST_O = origins("2025-01-08 00:00", "2025-12-29 23:00", 5)
assert not SYN[TEST_O.max() + H - 1], "test window reaches synthetic hours"

# A plaza carrying thousands of trips a day never has a real zero day: a series-day with no trips is MISSING data
# (CDV/PH Arena SB entry is absent from the client's files before 2024-11-03; four entries miss 3 days in 2025).
DAILY = Y.reshape(-1, 24, S, 3).sum(axis=1)                                        # [days,S,3]
MISS_D = DAILY.sum(axis=2) <= 0                                                    # [days,S]
MISS_H = np.repeat(MISS_D, 24, axis=0)                                             # [T,S]
_cmh = np.vstack([np.zeros((1, S), int), np.cumsum(MISS_H, axis=0)])
_cmd = np.vstack([np.zeros((1, S), int), np.cumsum(MISS_D, axis=0)])


def complete(o, s):
    """True where the series has no missing hour in [o-336, o+48) (inputs, lags, targets) nor missing day in the
    56-day long window."""
    d0 = o // 24
    return ((_cmh[o + H, s] - _cmh[o - 336, s]) == 0) & ((_cmd[d0, s] - _cmd[d0 - LONG_D, s]) == 0)


# Scalers: log1p, then per series and class z-score on the series' active TRAINING hours. A series with under 60
# active training days (CDV/PH Arena SB) takes its first 60 active days instead, all before the 2025 test period.
TRAIN_END = hour_of[pd.Timestamp("2024-10-02 23:00")] + 1
TEST_START = hour_of[pd.Timestamp("2025-01-01 00:00")]
LY = np.log1p(Y)
LD = np.log1p(DAILY)
MU = np.zeros((S, 3), np.float32); SD = np.ones((S, 3), np.float32)
DMU = np.zeros((S, 3), np.float32); DSD = np.ones((S, 3), np.float32)
SCALER_SRC = []
for j in range(S):
    act = ~MISS_H[:, j]; hrs = np.where(act[:TRAIN_END])[0]; src = "train"
    if len(hrs) < 60 * 24:
        hrs = np.where(act[:TEST_START])[0][:60 * 24]; src = "first 60 active days (pre-test)"
    days = np.unique(hrs // 24)
    MU[j], SD[j] = LY[hrs, j].mean(axis=0), LY[hrs, j].std(axis=0) + 0.05
    DMU[j], DSD[j] = LD[days, j].mean(axis=0), LD[days, j].std(axis=0) + 0.05
    SCALER_SRC.append(src)
YS = ((LY - MU) / SD).astype(np.float32)
DS = ((LD - DMU) / DSD).astype(np.float32)
DAY_DOW = np.column_stack([np.sin(2 * np.pi * TS[::24].dayofweek / 7), np.cos(2 * np.pi * TS[::24].dayofweek / 7)]).astype(np.float32)
RAIN_S = (np.log1p(RAIN) / np.log1p(RAIN[:TRAIN_END]).std()).astype(np.float32)
np.savez(CACHE / "scaler.npz", MU=MU, SD=SD, DMU=DMU, DSD=DSD, rain_sd=np.log1p(RAIN[:TRAIN_END]).std(), keys=D["keys"],
         scaler_source=np.array(SCALER_SRC))


def batch(o, s):
    """Inputs for origins o (first forecast hour) and series s; everything before o is history."""
    ts_ = o[:, None] + np.arange(-SHORT, 0)
    short = np.concatenate([YS[ts_, s[:, None]], RAIN_S[ts_][..., None], CAL[ts_][..., SHORT_CAL]], axis=-1)
    d0 = o // 24
    td = d0[:, None] + np.arange(-LONG_D, 0)
    long = np.concatenate([DS[td, s[:, None]], DAY_DOW[td]], axis=-1)
    tf_ = o[:, None] + np.arange(H)
    future = np.concatenate([CAL[tf_], YS[tf_ - 168, s[:, None]], YS[tf_ - 336, s[:, None]]], axis=-1)
    return {"short": short.astype(np.float32), "long": long.astype(np.float32),
            "future": future.astype(np.float32), "series": s[:, None].astype(np.int32)}, YS[tf_, s[:, None]].astype(np.float32)


def pairs(orig, only_complete=False):
    o = np.repeat(orig, S); s = np.tile(np.arange(S), len(orig))
    if only_complete:
        k = complete(o, s); o, s = o[k], s[k]
    return o, s


class Batches:
    """Builds minibatches on the fly (the full training tensor would need ~1 GB)."""
    def __new__(cls, o, s, bs=256, shuffle=True):
        import keras

        class _B(keras.utils.PyDataset):
            def __init__(self):
                super().__init__()
                self.o, self.s, self.bs, self.shuffle = o, s, bs, shuffle
                self.order = np.random.default_rng(42).permutation(len(o)) if shuffle else np.arange(len(o))

            def __len__(self):
                return int(np.ceil(len(self.o) / self.bs))

            def __getitem__(self, i):
                j = self.order[i * self.bs:(i + 1) * self.bs]
                return batch(self.o[j], self.s[j])

            def on_epoch_end(self):
                if self.shuffle: np.random.default_rng().shuffle(self.order)
        return _B()


def predict(m, o, s):
    return np.concatenate([m.predict(batch(o[i:i + 4096], s[i:i + 4096])[0], batch_size=1024, verbose=0)
                           for i in range(0, len(o), 4096)])


def to_counts(z, s):
    return np.clip(np.expm1(z * SD[s][:, None, :] + MU[s][:, None, :]), 0, None)


def truth(o, s):
    tf_ = o[:, None] + np.arange(H)
    return Y[tf_, s[:, None]]


# -------------------------------------------------------------------------------------------------------- baselines
def pred_snaive(o, s):
    tf_ = o[:, None] + np.arange(H)
    return Y[tf_ - 168, s[:, None]]


def pred_profile(o, s):
    tf_ = o[:, None] + np.arange(H)
    day = tf_ // 24; hod = tf_ % 24
    total = DAILY[day - 7, s[:, None]]                                             # same weekday last week [N,H,3]
    shares = np.zeros_like(total)
    for w in (1, 2, 3, 4):                                                          # that hour's share, last 4 same weekdays
        d = day - 7 * w
        shares += Y[d * 24 + hod, s[:, None]] / np.maximum(DAILY[d, s[:, None]], 1)
    return total * shares / 4


# ----------------------------------------------------------------------------------------------------------- train
def train_model(kind, log):
    import keras
    from models import build
    keras.utils.set_random_seed(42)
    o_tr, s_tr = pairs(TRAIN_O, True); o_va, s_va = pairs(VAL_O, True)
    Xva, yva = batch(o_va, s_va)
    m = build(kind, S, Xva["short"].shape[1:], Xva["long"].shape[1:], Xva["future"].shape[1:])
    t0 = time.time()
    hist = m.fit(Batches(o_tr, s_tr), validation_data=(Xva, yva), epochs=40, verbose=2,
                 callbacks=[keras.callbacks.EarlyStopping(patience=4, restore_best_weights=True),
                            keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=2)])
    m.save(CACHE / "models" / f"{kind}.keras")
    log[kind] = {"params": int(m.count_params()), "epochs": len(hist.history["loss"]), "train_sec": round(time.time() - t0),
                 "best_val_loss": float(min(hist.history["val_loss"])), "train_samples": int(len(o_tr))}
    o_te, s_te = pairs(TEST_O)
    t1 = time.time()
    z = predict(m, o_te, s_te)
    log[kind]["predict_sec_per_1000"] = round((time.time() - t1) / len(o_te) * 1000, 3)
    return m, to_counts(z, s_te), (Xva, yva, o_va, s_va)


def fit_hybrid(m, val, log):
    """XGBoost on the dual-path model's validation residuals (scaled space), then applied to its 2025 forecasts."""
    import xgboost as xgb
    Xva, yva, o_va, s_va = val
    zva = m.predict(Xva, batch_size=1024, verbose=0)

    def feats(X, z, o, s):
        n = len(o)
        hgrid = np.broadcast_to(np.arange(H), (n, H))
        rows = []
        for c in range(3):
            rows.append(np.column_stack([
                hgrid.ravel(), np.full(n * H, c), np.repeat(s, H),
                X["future"][..., 0].ravel(), X["future"][..., 1].ravel(), X["future"][..., 2].ravel(), X["future"][..., 3].ravel(),
                X["future"][..., 13].ravel(), X["future"][..., 14].ravel(), X["future"][..., 15].ravel(),
                z[..., c].ravel(), X["future"][..., 16 + c].ravel(), X["future"][..., 19 + c].ravel(),
                np.repeat(X["short"][:, -1, c], H)]))
        return np.vstack(rows)
    Fva = feats(Xva, zva, o_va, s_va)
    rva = np.concatenate([(yva[..., c] - zva[..., c]).ravel() for c in range(3)])
    reg = xgb.XGBRegressor(n_estimators=400, max_depth=6, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8,
                           tree_method="hist", random_state=42, n_jobs=-1)
    reg.fit(Fva, rva)
    reg.save_model(str(CACHE / "models" / "hybrid_xgb.json"))
    o_te, s_te = pairs(TEST_O)
    zte = predict(m, o_te, s_te)
    corr = np.concatenate([reg.predict(feats(batch(o_te[i:i + 4096], s_te[i:i + 4096])[0], zte[i:i + 4096],
                                             o_te[i:i + 4096], s_te[i:i + 4096])).reshape(3, -1, H).transpose(1, 2, 0)
                           for i in range(0, len(o_te), 4096)])
    log["hybrid"] = {"xgb_rows": int(len(rva)), "base": "dualpath"}
    return to_counts(zte + corr, s_te)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="lstm1,stacked,dualpath,hybrid")
    args = ap.parse_args()
    wanted = args.models.split(",")
    if wanted == ["selected"]:                    # the weekly batch: only the model in production (+ the baselines)
        pf = CACHE / "production.json"
        # No production.json on a fresh machine (a cloud runner whose cache was evicted): fall back to the model the
        # full comparison selected on 2026-10-24 (stacked LSTM, 12.79% WAPE on 2025), so the weekly run still refits
        # the served model rather than a different one.
        sel = json.loads(pf.read_text())["model"] if pf.exists() else "stacked"
        wanted = [] if sel not in ("lstm1", "stacked", "dualpath", "hybrid") else [sel]
    logf = CACHE / "train_log.json"
    log = json.loads(logf.read_text()) if logf.exists() else {}
    o_te, s_te = pairs(TEST_O)
    meta = dict(origins=o_te, series=s_te, truth=truth(o_te, s_te), complete=complete(o_te, s_te))
    np.savez_compressed(CACHE / "preds_snaive.npz", pred=pred_snaive(o_te, s_te), **meta)
    np.savez_compressed(CACHE / "preds_profile.npz", pred=pred_profile(o_te, s_te), **meta)
    print(f"test: {len(TEST_O)} origins x {S} series; train origins {len(TRAIN_O)}, validation {len(VAL_O)}", flush=True)
    dual = None
    for kind in ("lstm1", "stacked", "dualpath"):
        if kind in wanted or (kind == "dualpath" and "hybrid" in wanted):
            print(f"\n=== training {kind}", flush=True)
            m, pred, val = train_model(kind, log)
            np.savez_compressed(CACHE / f"preds_{kind}.npz", pred=pred, **meta)
            if kind == "dualpath": dual = (m, val)
            logf.write_text(json.dumps(log, indent=1))
    if "hybrid" in wanted and dual:
        print("\n=== fitting the XGBoost residual correction", flush=True)
        np.savez_compressed(CACHE / "preds_hybrid.npz", pred=fit_hybrid(dual[0], dual[1], log), **meta)
        logf.write_text(json.dumps(log, indent=1))
    print("\ndone:", json.dumps(log, indent=1))


if __name__ == "__main__":
    main()
