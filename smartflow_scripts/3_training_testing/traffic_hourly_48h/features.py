"""
Inputs of the 48-hour models, shared by the backtest, the production refit and the served forecast, so a served
forecast is built exactly the way the tested ones were.

    F = Features(dataset, fit_until_hour)      # scalers fitted on active hours before fit_until_hour
    X, y = F.batch(origins, series)            # model inputs and scaled targets
    counts = F.to_counts(z, series)            # model output back to vehicles/hour (never negative)

origin = index of the first forecast hour; every input is read from hours before it.
  short   [72, 10]  last 72 h: 3 scaled classes, rain, hod sin/cos, dow sin/cos, holiday, event day
  long    [56, 5]   last 56 days: 3 scaled daily class totals, dow sin/cos
  future  [48, 22]  the 48 forecast hours: 16 calendar features + the same hour 1 and 2 weeks earlier (3 classes each)
  series  [1]       series index (learned embedding)
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

H, SHORT, LONG_D = 48, 72, 56
SHORT_CAL = [0, 1, 2, 3, 13, 15]          # hod sin/cos, dow sin/cos, holiday, event_day (build_dataset.cal_names)
MIN_FIT_DAYS = 60

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "config"))
sys.path.insert(0, str(HERE.parent))
from db import WORK  # noqa: E402
from common.rolling_eval import REAL_END_VOLUME  # noqa: E402  (protocol section 1: the last day of REAL traffic data)

LIVE_CACHE = Path(WORK) / "cache" / "traffic_hourly_48h"
LEARNED = ["lstm1", "stacked", "dualpath", "hybrid"]          # simplest first: a non-significant tie goes left
BASELINES = ["snaive", "profile"]
COMPLEXITY = {"snaive": 0, "profile": 0, "lstm1": 1, "stacked": 2, "dualpath": 3, "hybrid": 4}
LABEL = {"snaive": "Seasonal naive (same hour last week)", "profile": "Current method (daily x hourly profile)",
         "lstm1": "Single-layer LSTM", "stacked": "Stacked LSTM", "dualpath": "Dual-Path LSTM",
         "hybrid": "Dual-Path LSTM + XGBoost"}
BUCKETS = [(1, 6), (7, 24), (25, 48)]                          # hours ahead; the score weighs each bucket equally
BLOCK_DAYS = 7                                                 # bootstrap block: a week of daily origins

# The 2025 backtest fits of 24 Oct / 2 Nov 2026 (models/<kind>.keras, hybrid_xgb.json): fitted on origins
# 2022-02-28 .. 2024-09-30, early-stopped on 2024-10-08 .. 2024-12-29, scaler on hours before 2024-10-03 (a series
# short of 60 active days there took its first 60 active days before 2025-01-01). They saw nothing after 2024-12-31,
# so they are legitimate VALIDATION forecasters for any window that starts later. Recorded here because those files
# predate the per-fit records (models/<name>.fit.json) every new fit writes.
LEGACY_VAL_FIT = {"fit": ["2022-02-28 00:00", "2024-09-30 00:00"], "es": ["2024-10-08 00:00", "2024-12-29 00:00"],
                  "scaler_until": "2024-10-03 00:00", "fallback_until": "2025-01-01 00:00", "step": 7,
                  "source": "2025 backtest fits of 24 Oct / 2 Nov 2026 (before per-fit records)"}


def cache_dir(dry_run):
    """Where a run reads and writes its files. A --dry-run works in a folder of its own, so nothing the weekly batch
    or forecast_48h.py --write-db reads (dataset, models, production.json, bands) is touched."""
    d = LIVE_CACHE / "dryrun" if dry_run else LIVE_CACHE
    (d / "models").mkdir(parents=True, exist_ok=True)
    return d


def windows(real_end, test_weeks=20, val_weeks=52, es_weeks=12, step=7, fit_start="2022-02-28"):
    """Every window, derived from the last real day R (nothing hard-coded, so each weekly run moves with the data).

    Origins are the hour a forecast starts. A served forecast starts at 00:00 the day after the last uploaded day, so
    VALIDATION and TEST origins are every day at 00:00 (all weekdays alike), and a 48-hour forecast is used only if all
    of its hours are on or before the window's end:
      test        T0 = R - 7*test_weeks + 1 day .. R - 1 day             never used for any choice
      validation  V0 = T0 - val_weeks weeks   .. T0 - 2 days             model choice and the band's calibration
    A model whose first scored origin is X is fitted on origins every `step` hours from fit_start to X - es_weeks - 2
    days, early-stopped on origins X - es_weeks .. X - 2 days, with its scaler on hours before X - es_weeks:
      validation fit  X = V0;  test fit  X = T0;  production fit  X = R + 1 day (all real data, served)."""
    R = pd.Timestamp(real_end).normalize()
    day = pd.Timedelta(days=1)
    T0 = R - pd.Timedelta(days=7 * test_weeks) + day
    V0 = T0 - pd.Timedelta(weeks=val_weeks)

    def fit(X):
        es0 = X - pd.Timedelta(weeks=es_weeks)
        return {"fit": [str(pd.Timestamp(fit_start)), str(es0 - 2 * day)], "es": [str(es0), str(X - 2 * day)],
                "scaler_until": str(es0), "fallback_until": str(X), "step": step, "first_scored_origin": str(X)}
    return {"real_end": str(R.date()), "test": [str(T0), str(R - day)], "validation": [str(V0), str(T0 - 2 * day)],
            "val_fit": fit(V0), "test_fit": fit(T0), "prod_fit": fit(R + day),
            "params": {"test_weeks": test_weeks, "val_weeks": val_weeks, "es_weeks": es_weeks, "step": step}}


def daily_origins(TS, a, b):
    """Row index of every 00:00 from a to b inclusive."""
    hour_of = pd.Index(TS)
    return hour_of.get_indexer(pd.date_range(pd.Timestamp(a), pd.Timestamp(b), freq="D"))


def step_origins(TS, gap, a, b, step):
    """Every `step` hours from a to b; windows touching a corridor-empty hour (toll holiday, broken day) dropped."""
    hour_of = pd.Index(TS)
    o = np.arange(hour_of.get_loc(pd.Timestamp(a)), hour_of.get_loc(pd.Timestamp(b)) + 1, step)
    return o[[not gap[i:i + H].any() for i in o]]


def fit_record(path):
    """The windows a saved model was fitted on (models/<name>.fit.json), or None."""
    p = Path(str(path).replace(".keras", "").replace(".json", "") + ".fit.json")
    return json.loads(p.read_text()) if p.exists() else None


def save_fit_record(path, rec):
    Path(str(path).replace(".keras", "").replace(".json", "") + ".fit.json").write_text(json.dumps(rec, indent=1))


class Features:
    def __init__(self, D, fit_until_hour, scaler=None, fallback_until=None):
        self.Y, self.CAL, self.RAIN = D["Y"], D["cal"], D["rain"]
        self.TS = pd.to_datetime(D["ts"])
        self.T, self.S, _ = self.Y.shape
        Y, S = self.Y, self.S
        # A plaza carrying thousands of trips a day never has a real zero day: a series-day with no trips is MISSING
        # data (CDV/PH Arena SB entry is absent before 2024-11-03; four entries miss 3 days in 2025).
        self.DAILY = Y.reshape(-1, 24, S, 3).sum(axis=1)
        self.MISS_D = self.DAILY.sum(axis=2) <= 0
        if "is_future" in D:
            self.MISS_D[np.asarray(D["is_future"])[::24]] = True
        self.MISS_H = np.repeat(self.MISS_D, 24, axis=0)
        self._cmh = np.vstack([np.zeros((1, S), int), np.cumsum(self.MISS_H, axis=0)])
        self._cmd = np.vstack([np.zeros((1, S), int), np.cumsum(self.MISS_D, axis=0)])
        LY, LD = np.log1p(Y), np.log1p(self.DAILY)
        if scaler is None:
            scaler = self.fit_scaler(LY, LD, fit_until_hour, fallback_until)
        self.scaler = scaler
        MU, SD, DMU, DSD = scaler["MU"], scaler["SD"], scaler["DMU"], scaler["DSD"]
        self.MU, self.SD = MU, SD
        self.YS = ((LY - MU) / SD).astype(np.float32)
        self.DS = ((LD - DMU) / DSD).astype(np.float32)
        dow = self.TS[::24].dayofweek
        self.DAY_DOW = np.column_stack([np.sin(2 * np.pi * dow / 7), np.cos(2 * np.pi * dow / 7)]).astype(np.float32)
        self.RAIN_S = (np.log1p(self.RAIN) / float(scaler["rain_sd"])).astype(np.float32)

    def fit_scaler(self, LY, LD, until, fallback_until=None):
        """log1p, then per series and class z-score on the series' active hours before `until`. A series with fewer
        than 60 active days there takes its first 60 active days (before `fallback_until`, the test start) instead."""
        S = self.S
        MU = np.zeros((S, 3), np.float32); SD = np.ones((S, 3), np.float32)
        DMU = np.zeros((S, 3), np.float32); DSD = np.ones((S, 3), np.float32)
        src = []
        for j in range(S):
            act = ~self.MISS_H[:, j]
            hrs = np.where(act[:until])[0]; how = "fit window"
            if len(hrs) < MIN_FIT_DAYS * 24:
                hrs = np.where(act[:fallback_until])[0][:MIN_FIT_DAYS * 24]; how = f"first {MIN_FIT_DAYS} active days"
            days = np.unique(hrs // 24)
            MU[j], SD[j] = LY[hrs, j].mean(axis=0), LY[hrs, j].std(axis=0) + 0.05
            DMU[j], DSD[j] = LD[days, j].mean(axis=0), LD[days, j].std(axis=0) + 0.05
            src.append(how)
        return {"MU": MU, "SD": SD, "DMU": DMU, "DSD": DSD, "rain_sd": np.log1p(self.RAIN[:until]).std(),
                "scaler_source": np.array(src)}

    def complete(self, o, s):
        """No missing hour for the series in [o-336, o+48) and no missing day in the 56-day window."""
        d0 = o // 24
        return ((self._cmh[o + H, s] - self._cmh[o - 336, s]) == 0) & ((self._cmd[d0, s] - self._cmd[d0 - LONG_D, s]) == 0)

    def history_complete(self, o, s):
        """As complete(), for a forecast whose target hours are not recorded yet."""
        d0 = o // 24
        return ((self._cmh[o, s] - self._cmh[o - 336, s]) == 0) & ((self._cmd[d0, s] - self._cmd[d0 - LONG_D, s]) == 0)

    def batch(self, o, s):
        ts_ = o[:, None] + np.arange(-SHORT, 0)
        short = np.concatenate([self.YS[ts_, s[:, None]], self.RAIN_S[ts_][..., None], self.CAL[ts_][..., SHORT_CAL]], axis=-1)
        td = (o // 24)[:, None] + np.arange(-LONG_D, 0)
        long = np.concatenate([self.DS[td, s[:, None]], self.DAY_DOW[td]], axis=-1)
        tf_ = o[:, None] + np.arange(H)
        future = np.concatenate([self.CAL[tf_], self.YS[tf_ - 168, s[:, None]], self.YS[tf_ - 336, s[:, None]]], axis=-1)
        return ({"short": short.astype(np.float32), "long": long.astype(np.float32),
                 "future": future.astype(np.float32), "series": s[:, None].astype(np.int32)},
                self.YS[tf_, s[:, None]].astype(np.float32))

    def to_counts(self, z, s):
        return np.clip(np.expm1(z * self.SD[s][:, None, :] + self.MU[s][:, None, :]), 0, None)

    def profile(self, o, s):
        """The current dashboard method: same weekday last week's day total spread by the hour's share of the day
        on the last 4 same weekdays."""
        tf_ = o[:, None] + np.arange(H)
        day, hod = tf_ // 24, tf_ % 24
        total = self.DAILY[day - 7, s[:, None]]
        shares = np.zeros_like(total)
        for w in (1, 2, 3, 4):
            d = day - 7 * w
            shares += self.Y[d * 24 + hod, s[:, None]] / np.maximum(self.DAILY[d, s[:, None]], 1)
        return total * shares / 4

    def snaive(self, o, s):
        """Seasonal naive: the same hour one week earlier (always before the origin for a 48-hour forecast)."""
        tf_ = o[:, None] + np.arange(H)
        return self.Y[tf_ - 168, s[:, None]].astype(np.float64)

    def truth(self, o, s):
        tf_ = o[:, None] + np.arange(H)
        return self.Y[tf_, s[:, None]]

    def pairs(self, orig, only_complete=True):
        """(origin, series) for every series at each origin; only those whose inputs and targets are complete."""
        o = np.repeat(orig, self.S); s = np.tile(np.arange(self.S), len(orig))
        if only_complete:
            k = self.complete(o, s); o, s = o[k], s[k]
        return o, s

    def predict(self, m, o, s, chunk=4096):
        return np.concatenate([m.predict(self.batch(o[i:i + chunk], s[i:i + chunk])[0], batch_size=1024, verbose=0)
                               for i in range(0, len(o), chunk)])


def hybrid_features(X, z):
    """Rows for the XGBoost residual model: one per (sample, hour, class)."""
    n = len(X["series"])
    s = X["series"][:, 0]
    hgrid = np.broadcast_to(np.arange(H), (n, H))
    f = X["future"]
    rows = []
    for c in range(3):
        rows.append(np.column_stack([
            hgrid.ravel(), np.full(n * H, c), np.repeat(s, H),
            f[..., 0].ravel(), f[..., 1].ravel(), f[..., 2].ravel(), f[..., 3].ravel(),
            f[..., 13].ravel(), f[..., 14].ravel(), f[..., 15].ravel(),
            z[..., c].ravel(), f[..., 16 + c].ravel(), f[..., 19 + c].ravel(),
            np.repeat(X["short"][:, -1, c], H)]))
    return np.vstack(rows)


def apply_hybrid(reg, X, z):
    return z + reg.predict(hybrid_features(X, z)).reshape(3, len(z), H).transpose(1, 2, 0)


def Batches_for(F, o, s, bs=256, shuffle=True):
    """Minibatches built on the fly (the full training tensor would need ~1 GB)."""
    import keras

    class _B(keras.utils.PyDataset):
        def __init__(self):
            super().__init__()
            self.order = np.random.default_rng(42).permutation(len(o)) if shuffle else np.arange(len(o))

        def __len__(self):
            return int(np.ceil(len(o) / bs))

        def __getitem__(self, i):
            j = self.order[i * bs:(i + 1) * bs]
            return F.batch(o[j], s[j])

        def on_epoch_end(self):
            if shuffle: np.random.default_rng().shuffle(self.order)
    return _B()
