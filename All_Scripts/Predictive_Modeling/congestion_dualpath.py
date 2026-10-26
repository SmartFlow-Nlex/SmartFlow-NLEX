"""
Dual-path LSTM candidates for the congestion forecast (thesis adviser's brief, 2026-10-24).

train_congestion_horizon.py builds the exit-hour grid and scores every candidate on the same held-out rows; this
module adds three recurrent candidates to that leaderboard, so the champion is still chosen by accuracy on the
same (hour, exit, horizon) rows as XGBoost:

  LSTM-1     single LSTM(64) on the short window
  LSTM-2     stacked LSTM 64 -> 32 on the short window
  DualPath   short branch LSTM 64 -> 32 (last 72 hours) + long branch LSTM 128 -> 64 -> 32 (last 28 days as daily
             summaries), joined by a trainable gate g = sigmoid(W [h_short, h_long, exit]): h = g*h_short + (1-g)*h_long
  DualPath+XGB  XGBoost on the trainer's own features plus DualPath's probabilities, fitted on the calibration days

Each recurrent model predicts all 168 hours ahead in one pass (direct multi-horizon), as Low / Med / High
probabilities. What it reads, for exit e at origin hour t (the state at t is known, as for every candidate):
  short   [72, 12]  state (one-hot), jam count, jam speed, both neighbours' state, hour/weekday, holiday
  long    [28, 6]   per day: mean state, share severe, share congested, mean jam count, weekday
  future  [168, 12] per forecast hour: hour/weekday, holiday, Arena event day, hours ahead, this exit's usual state
                    at that hour (training hours only), and the state one week before that hour (always <= t)
  exit    learned embedding
Nothing from a forecast hour itself is read; the weather of forecast hours is never an input.

Splits, inside the trainer's own: fitted on targets before val_start (= the trainer's calibration cut minus 4 days),
early-stopped on targets in [val_start, cal_cut), calibrated (isotonic, per class) and the hybrid fitted on the
trainer's calibration rows (targets in [cal_cut, cut)), scored on the trainer's test rows (origins >= cut).

    train_all(...)  run by the trainer with --dualpath-train (the weekly batch); saves to dualpath_models/
    load()          the saved bundle, or None
    proba(...)      probabilities for rows (ts, exit_name, horizon), aligned to the trainer's frames
    serve(...)      [exits, 168, 3] from the newest hour
"""
import json
import os
import time
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
OUT = HERE / "dualpath_models"
H, SHORT, LONG_D = 168, 72, 28
KINDS = ["LSTM (1 layer)", "Stacked LSTM", "Dual-Path LSTM"]
FILE = {"LSTM (1 layer)": "lstm1.keras", "Stacked LSTM": "lstm2.keras", "Dual-Path LSTM": "dualpath.keras"}
MAX_TRAIN_SAMPLES = 120_000
SPEED_MID, SPEED_SCALE = 40.0, 25.0


# ------------------------------------------------------------------------------------------------- the panel
class Panel:
    """The trainer's exit-hour grid as [hours, exits] arrays, plus the calendar out to 168 hours past its end."""

    def __init__(self, grid, exits, prev, nxt, hol_days, ev_days, jam_sd=None, prof=None):
        g = grid.copy()
        g["ts"] = pd.to_datetime(g.ts)
        t0 = g.ts.min().normalize()
        self.idx = pd.date_range(t0, g.ts.max(), freq="h")
        self.exits = list(exits)
        E = len(self.exits)
        pos = {e: i for i, e in enumerate(self.exits)}

        def piv(col):
            p = g.pivot_table(index="ts", columns="exit_name", values=col, aggfunc="first")
            return p.reindex(index=self.idx, columns=self.exits).to_numpy(np.float32)
        self.y = piv("y")                                       # NaN = uncollected
        self.jam = piv("n_jams")
        self.spd = piv("speed_filled")
        self.T = len(self.idx)
        self.miss = np.isnan(self.y)
        self.prev_i = np.array([pos[prev[e]] for e in self.exits])
        self.next_i = np.array([pos[nxt[e]] for e in self.exits])
        # calendar, extended 168 h past the last hour
        cal_idx = pd.date_range(t0, self.idx[-1] + pd.Timedelta(hours=H), freq="h")
        self.cal_idx = cal_idx
        hod, dow = cal_idx.hour.to_numpy(), cal_idx.dayofweek.to_numpy()
        day = cal_idx.normalize()
        self.hol = np.array([d in hol_days for d in day], np.float32)
        self.ev = np.array([d in ev_days for d in day], np.float32)
        self.hod, self.dow = hod, dow
        self.cal4 = np.column_stack([np.sin(2 * np.pi * hod / 24), np.cos(2 * np.pi * hod / 24),
                                     np.sin(2 * np.pi * dow / 7), np.cos(2 * np.pi * dow / 7)]).astype(np.float32)
        self.wk = (dow >= 5).astype(int)
        # scaled inputs (NaN -> 0 in the arrays the model reads; NaN windows are never trained on)
        self.jam_sd = float(np.nanstd(np.log1p(self.jam))) if jam_sd is None else jam_sd
        jl = np.nan_to_num(np.log1p(self.jam) / max(self.jam_sd, 1e-6))
        sp = np.nan_to_num((self.spd - SPEED_MID) / SPEED_SCALE)
        yy = np.nan_to_num(self.y)
        oh = np.eye(3, dtype=np.float32)[np.clip(yy.astype(int), 0, 2)]
        oh[self.miss] = 0
        self.oh = oh                                            # [T,E,3]
        self.hour_feats = np.concatenate([oh, jl[..., None], sp[..., None],
                                          (yy[:, self.prev_i] / 2)[..., None], (yy[:, self.next_i] / 2)[..., None]],
                                         axis=-1).astype(np.float32)   # [T,E,7]
        # daily summaries
        nd = self.T // 24 + (1 if self.T % 24 else 0)
        pad = nd * 24 - self.T
        yp = np.concatenate([self.y, np.full((pad, E), np.nan, np.float32)]).reshape(nd, 24, E)
        jp = np.concatenate([np.log1p(self.jam), np.full((pad, E), np.nan, np.float32)]).reshape(nd, 24, E)
        with np.errstate(invalid="ignore"):
            self.day_miss = np.isnan(yp).any(axis=1)                       # a day with any uncollected hour
            dmean = np.nanmean(yp, axis=1) / 2
            dsev = np.nanmean(yp == 2, axis=1)
            dcong = np.nanmean(yp >= 1, axis=1)
            djam = np.nanmean(jp, axis=1) / max(self.jam_sd, 1e-6)
        ddow = self.idx[::24].dayofweek.to_numpy()
        ddow = np.concatenate([ddow, (ddow[-1:] + 1) % 7]) if len(ddow) < nd else ddow
        self.day_feats = np.concatenate([np.nan_to_num(np.stack([dmean, dsev, dcong, djam], -1)),
                                         np.broadcast_to(np.column_stack([np.sin(2 * np.pi * ddow / 7),
                                                                          np.cos(2 * np.pi * ddow / 7)])[:, None, :],
                                                         (nd, E, 2))], axis=-1).astype(np.float32)
        self._cmh = np.vstack([np.zeros((1, E), int), np.cumsum(self.miss, axis=0)])
        self._cmd = np.vstack([np.zeros((1, E), int), np.cumsum(self.day_miss, axis=0)])
        self.prof = prof                                       # [E, 24, 2(weekday/weekend), 2(mean/2, sev)]

    def fit_profile(self, until):
        """This exit's usual state at each hour, weekday vs weekend, from hours before `until` only."""
        E = len(self.exits)
        prof = np.zeros((E, 24, 2, 2), np.float32)
        y = self.y[:until]; hod = self.hod[:until]; wk = self.wk[:until]
        for w in (0, 1):
            for h in range(24):
                m = (hod == h) & (wk == w)
                with np.errstate(invalid="ignore"):
                    prof[:, h, w, 0] = np.nan_to_num(np.nanmean(y[m], axis=0) / 2, nan=0.5)
                    prof[:, h, w, 1] = np.nan_to_num(np.nanmean(y[m] == 2, axis=0), nan=0.1)
        self.prof = prof

    def complete(self, o, e):
        """Inputs of origin o (state at o known) have no uncollected hour: [o-167, o] and the 28-day window."""
        d0 = o // 24
        lo = np.maximum(o - 167, 0)
        return (o >= 167) & (d0 >= LONG_D) & ((self._cmh[o + 1, e] - self._cmh[lo, e]) == 0) & \
               ((self._cmd[d0, e] - self._cmd[np.maximum(d0 - LONG_D, 0), e]) == 0)

    def batch(self, o, e):
        ts_ = o[:, None] + np.arange(-SHORT + 1, 1)                       # [o-71 .. o]
        short = np.concatenate([self.hour_feats[ts_, e[:, None]], self.cal4[ts_], self.hol[ts_][..., None]], -1)
        td = (o // 24)[:, None] + np.arange(-LONG_D, 0)
        long = self.day_feats[td, e[:, None]]
        tf_ = o[:, None] + np.arange(1, H + 1)                            # forecast hours
        lag = tf_ - 168                                                   # always <= o
        pr = self.prof[e[:, None], self.hod[tf_], self.wk[tf_]]           # [N,H,2]
        hz = np.broadcast_to((np.arange(1, H + 1) / H)[None, :, None], (len(o), H, 1))
        future = np.concatenate([self.cal4[tf_], self.hol[tf_][..., None], self.ev[tf_][..., None], hz, pr,
                                 self.oh[lag, e[:, None]]], -1)
        return {"short": short.astype(np.float32), "long": long.astype(np.float32),
                "future": future.astype(np.float32), "exit": e[:, None].astype(np.int32)}

    def targets(self, o, e, limit):
        """States at o+1..o+168 and a mask: known, and before index `limit`."""
        tf_ = o[:, None] + np.arange(1, H + 1)
        ok = tf_ < min(limit, self.T)
        tfc = np.minimum(tf_, self.T - 1)
        y = self.y[tfc, e[:, None]]
        ok &= ~np.isnan(y)
        return np.nan_to_num(y).astype(np.int32), ok

    def index_of(self, ts):
        return ((pd.to_datetime(ts) - self.idx[0]) / pd.Timedelta(hours=1)).astype(int)


# ------------------------------------------------------------------------------------------------- models
def build(kind, n_exits):
    import keras
    from keras import layers
    short = keras.Input((SHORT, 12), name="short")
    long = keras.Input((LONG_D, 6), name="long")
    future = keras.Input((H, 12), name="future")
    ex = keras.Input((1,), name="exit", dtype="int32")
    emb = layers.Flatten()(layers.Embedding(n_exits, 6)(ex))
    if kind == "LSTM (1 layer)":
        ctx = layers.LSTM(64)(short)
    elif kind == "Stacked LSTM":
        x = layers.LSTM(64, return_sequences=True)(short); x = layers.Dropout(0.1)(x)
        ctx = layers.LSTM(32)(x)
    elif kind == "Dual-Path LSTM":
        s = layers.LSTM(64, return_sequences=True, name="short_lstm1")(short); s = layers.Dropout(0.1)(s)
        s = layers.LSTM(32, name="short_lstm2")(s)
        l = layers.LSTM(128, return_sequences=True, name="long_lstm1")(long); l = layers.Dropout(0.1)(l)
        l = layers.LSTM(64, return_sequences=True, name="long_lstm2")(l); l = layers.Dropout(0.1)(l)
        l = layers.LSTM(32, name="long_lstm3")(l)
        gate = layers.Dense(32, activation="sigmoid", name="fusion_gate")(layers.Concatenate()([s, l, emb]))
        inv = layers.Lambda(lambda g: 1.0 - g, name="one_minus_gate")(gate)
        ctx = layers.Add(name="gated_fusion")([layers.Multiply()([gate, s]), layers.Multiply()([inv, l])])
    else:
        raise ValueError(kind)
    z = layers.RepeatVector(H)(layers.Concatenate()([ctx, emb]))
    z = layers.Concatenate()([z, future])
    z = layers.TimeDistributed(layers.Dense(96, activation="relu"))(z)
    z = layers.TimeDistributed(layers.Dropout(0.1))(z)
    out = layers.TimeDistributed(layers.Dense(3, activation="softmax"))(z)
    m = keras.Model([short, long, future, ex], out, name={"LSTM (1 layer)": "lstm1", "Stacked LSTM": "lstm2", "Dual-Path LSTM": "dualpath"}[kind])
    m.compile(optimizer=keras.optimizers.Adam(1e-3), loss="sparse_categorical_crossentropy",
              weighted_metrics=["accuracy"])
    return m


def _batches(P, o, e, limit, cw, bs=256, shuffle=True):
    import keras

    class B(keras.utils.PyDataset):
        def __init__(self):
            super().__init__()
            self.order = np.random.default_rng(7).permutation(len(o)) if shuffle else np.arange(len(o))

        def __len__(self):
            return int(np.ceil(len(o) / bs))

        def __getitem__(self, i):
            j = self.order[i * bs:(i + 1) * bs]
            X = P.batch(o[j], e[j])
            y, ok = P.targets(o[j], e[j], limit)
            return X, y, (ok * cw[y]).astype(np.float32)

        def on_epoch_end(self):
            if shuffle: np.random.default_rng().shuffle(self.order)
    return B()


class IsoCal:
    """One isotonic curve per class on the raw probabilities, rows renormalised (as the trainer's XGBoost)."""

    def __init__(self, p, y):
        from sklearn.isotonic import IsotonicRegression
        self.iso = [IsotonicRegression(out_of_bounds="clip").fit(p[:, k], (y == k).astype(float)) for k in range(3)]

    def __call__(self, p):
        c = np.clip(np.column_stack([self.iso[k].predict(p[:, k]) for k in range(3)]), 1e-6, None)
        return c / c.sum(axis=1, keepdims=True)


def _calendar(dsn):
    """Holidays and Arena event days, on a connection of its own: the trainer's connection has sat idle through
    XGBoost and the forest (15-20 minutes) by the time this runs, and the server closes it."""
    import psycopg2
    conn = psycopg2.connect(dsn)
    try:
        hol = pd.read_sql("SELECT date_day FROM public.ph_holidays", conn, parse_dates=["date_day"])
        ev = pd.read_sql("SELECT DISTINCT event_date::date AS d FROM silver.philippine_arena_events_clean "
                         "WHERE event_date IS NOT NULL", conn, parse_dates=["d"])
    finally:
        conn.close()
    return set(hol.date_day.dt.normalize()), set(ev.d.dt.normalize())


def _raw_rows(models, P, rows):
    """Raw probabilities per kind for rows (ts, exit_name, horizon): one model pass per distinct (ts, exit)."""
    o_all = P.index_of(rows.ts.values)
    e_all = np.array([P.exits.index(x) for x in rows.exit_name.values])
    key = o_all * 1000 + e_all
    uk, inv = np.unique(key, return_inverse=True)
    uo, ue = uk // 1000, uk % 1000
    ok = P.complete(uo, ue)
    hz = rows.horizon.values.astype(int) - 1
    out = {}
    for kind, m in models.items():
        pu = np.full((len(uk), H, 3), 1 / 3, np.float32)
        if ok.any():
            idx = np.where(ok)[0]
            for i in range(0, len(idx), 2048):
                j = idx[i:i + 2048]
                pu[j] = m.predict(P.batch(uo[j], ue[j]), verbose=0, batch_size=512)
        out[kind] = pu[inv, hz]
    return out, ok[inv]


# ------------------------------------------------------------------------------------------------- weekly fit
def train_all(grid, exits, prev, nxt, cut, cal_cut, cal_rows, feats_cal, y_cal, dsn, with_history):
    """Fits the three recurrent models, the calibrators and the hybrid; saves everything to dualpath_models/."""
    import keras
    import xgboost as xgb
    t_all = time.time()
    hol, ev = _calendar(dsn)
    P = Panel(grid, exits, prev, nxt, hol, ev)
    cut_i, cal_i = int(P.index_of([cut])[0]), int(P.index_of([cal_cut])[0])
    val_i = cal_i - 4 * 24
    P.fit_profile(val_i)
    E = len(exits)
    oo = np.repeat(np.arange(P.T), E); ee = np.tile(np.arange(E), P.T)
    keep = P.complete(np.minimum(oo, P.T - 1), ee)
    fit = keep & (oo < val_i - 1)
    val = keep & (oo >= val_i - 168) & (oo < cal_i - 1)          # targets masked to [.., cal_cut)
    o_f, e_f = oo[fit], ee[fit]
    if len(o_f) > MAX_TRAIN_SAMPLES:
        pick = np.sort(np.random.default_rng(42).choice(len(o_f), MAX_TRAIN_SAMPLES, replace=False))
        o_f, e_f = o_f[pick], e_f[pick]
    o_v, e_v = oo[val], ee[val]
    yv_all, okv_all = P.targets(o_v, e_v, cal_i)
    # validation targets must not reach back into the fit window
    okv_all &= (o_v[:, None] + np.arange(1, H + 1)) >= val_i
    yf, okf = P.targets(o_f, e_f, val_i)
    cnt = np.bincount(yf[okf], minlength=3).astype(float)
    cw = (cnt.sum() / (3 * np.maximum(cnt, 1))).astype(np.float32)
    Xv = P.batch(o_v, e_v)
    wv = (okv_all * cw[yv_all]).astype(np.float32)
    print(f"  dual-path family: fit samples {len(o_f):,} (targets before {P.idx[val_i]}), "
          f"validation {len(o_v):,} (targets {P.idx[val_i]} .. {P.idx[cal_i]}), class weights {np.round(cw, 2).tolist()}")
    OUT.mkdir(exist_ok=True)
    log = {}
    models = {}
    for kind in KINDS:
        keras.utils.set_random_seed(42)
        m = build(kind, E)
        t0 = time.time()
        hist = m.fit(_batches(P, o_f, e_f, val_i, cw), validation_data=(Xv, yv_all, wv), epochs=30, verbose=2,
                     callbacks=[keras.callbacks.EarlyStopping(patience=3, restore_best_weights=True),
                                keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=1)])
        m.save(OUT / FILE[kind])
        models[kind] = m
        log[kind] = {"params": int(m.count_params()), "epochs": len(hist.history["loss"]),
                     "best_val_loss": float(min(hist.history["val_loss"])), "train_sec": round(time.time() - t0)}
        print(f"  {kind}: {log[kind]}", flush=True)
    # calibration and hybrid on the trainer's calibration rows (targets in [cal_cut, cut)), unseen by the fits
    raw, okc = _raw_rows(models, P, cal_rows)
    cals = {k: IsoCal(raw[k][okc], y_cal[okc]) for k in KINDS}
    import pickle
    stack_X = np.column_stack([feats_cal, raw["Dual-Path LSTM"]])
    stacker = xgb.XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.06, subsample=0.9, colsample_bytree=0.9,
                                objective="multi:softprob", num_class=3, eval_metric="mlogloss", random_state=42, n_jobs=4)
    stacker.fit(stack_X[okc], y_cal[okc])
    with open(OUT / "calibration.pkl", "wb") as fh:
        pickle.dump({"cals": cals, "stacker": stacker}, fh)
    np.savez(OUT / "panel_fit.npz", prof=P.prof, jam_sd=P.jam_sd, exits=np.array(exits))
    meta = {"trained_at": pd.Timestamp.now().isoformat(timespec="seconds"), "cut": str(cut), "cal_cut": str(cal_cut),
            "val_start": str(P.idx[val_i]), "with_history": bool(with_history), "train_from": str(P.idx[0]),
            "fit_samples": int(len(o_f)), "class_weights": cw.tolist(), "models": log,
            "minutes": round((time.time() - t_all) / 60, 1)}
    (OUT / "bundle.json").write_text(json.dumps(meta, indent=1))
    print(f"  dual-path family saved to {OUT} ({meta['minutes']} min)")
    return meta


# ------------------------------------------------------------------------------------------------- hourly use
def load():
    """The saved bundle, or None when it was never trained here or a file is missing/unreadable."""
    try:
        meta = json.loads((OUT / "bundle.json").read_text())
        import keras
        import pickle
        models = {k: keras.models.load_model(OUT / FILE[k], safe_mode=False) for k in KINDS}
        with open(OUT / "calibration.pkl", "rb") as fh:
            cal = pickle.load(fh)
        fitp = np.load(OUT / "panel_fit.npz", allow_pickle=True)
        return {"meta": meta, "models": models, "cals": cal["cals"], "stacker": cal["stacker"],
                "prof": fitp["prof"], "jam_sd": float(fitp["jam_sd"]), "exits": list(fitp["exits"])}
    except Exception as e:                               # noqa: BLE001 - absent or broken bundle: no candidates
        print(f"  dual-path family not loaded ({type(e).__name__}: {str(e)[:120]})")
        return None


def panel_for(bundle, grid, exits, prev, nxt, dsn):
    hol, ev = _calendar(dsn)
    return Panel(grid, exits, prev, nxt, hol, ev, jam_sd=bundle["jam_sd"], prof=bundle["prof"])


def proba(bundle, P, rows, feats):
    """Calibrated probabilities per candidate for the trainer's rows; rows whose inputs are incomplete get 1/3."""
    raw, ok = _raw_rows(bundle["models"], P, rows)
    out = {k: np.where(ok[:, None], bundle["cals"][k](raw[k]), 1 / 3) for k in KINDS}
    out["Dual-Path LSTM + XGBoost"] = np.where(ok[:, None], bundle["stacker"].predict_proba(np.column_stack([feats, raw["Dual-Path LSTM"]])), 1 / 3)
    return out, ok


def serve(bundle, P, kind, feats_by_h=None):
    """[exits, 168, 3] from the newest hour of the panel."""
    E = len(P.exits)
    o = np.full(E, P.T - 1); e = np.arange(E)
    base = "Dual-Path LSTM" if kind == "Dual-Path LSTM + XGBoost" else kind
    raw = bundle["models"][base].predict(P.batch(o, e), verbose=0)          # [E,H,3]
    if kind == "Dual-Path LSTM + XGBoost":
        out = np.zeros_like(raw)
        for h in range(H):
            out[:, h] = bundle["stacker"].predict_proba(np.column_stack([feats_by_h(h + 1), raw[:, h]]))
        return out
    cal = bundle["cals"][kind]
    return cal(raw.reshape(-1, 3)).reshape(E, H, 3)
