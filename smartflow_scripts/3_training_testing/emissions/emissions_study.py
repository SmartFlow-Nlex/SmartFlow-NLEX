"""
Daily corridor CO2: every candidate under EVALUATION_PROTOCOL.md (10 Nov 2026). Test-only; writes no table.

TARGET  gold.fact_emissions_hourly summed per day (tonnes). It is traffic counts x real trip km x fixed per-class
        factors, so it is only as real as the counts: scored days end at 2026-05-24, the volume study's cut (protocol
        section 1). No day inside the real period is a broken upload (checked 10 Nov 2026: the lowest day against its
        28-day median is 2024-07-24 at 0.36, the Carina typhoon; every other day below 0.5 is a typhoon or a holiday,
        all real), so no day is excluded.

CANDIDATES, declared before the run. The system's six, with the 10 Nov audit's defects fixed (one trend clock for
training and forecasting; the same calendar offered to every model), and the fair versions feature parity asks for:
  GBR                       recursive gradient boosting (the trainer's settings) on lags 1-28, 7/28-day means,
                            yesterday's Class 3 share, trend and the calendar (weekday, yearly position, holidays and
                            whether the lag days were holidays). GBR + weather adds observed rain and temperature.
  Polynomial                degree-2 ridge on trend, lag 1, lag 7, the rolling means and weekday, with the calendar as
                            linear terms. Polynomial + weather adds rain to the degree-2 part.
  LSTM                      univariate and recursive, as the system trains it. LSTM + calendar: the same network, each
                            step also given the next day's calendar.
  Derived                   the traffic-volume champion's OWN out-of-sample forecast from the same origin (refitted on
                            the traffic rows before it) x CO2 per vehicle by weekday over the 8 weeks before the origin.
                            Derived + calendar ratio: CO2 per vehicle from weekday, yearly and holiday terms instead.
                            If the volume champion reads weather, its weather-free twin feeds "Derived" and the
                            champion itself feeds "Derived + weather" (and the same for the calendar-ratio version).
  MSTL                      weekly + yearly seasonal decomposition, ARIMA(1,1,1) on the rest. MSTL + holidays adds the
                            holiday flags as ARIMA regressors.
  Stacked LSTM              two LSTM layers over 8 weeks with each day's calendar, a week at a time.
  Baselines                 last week, weekday average, last year (scaled) (protocol section 3).

WEATHER (protocol section 2). A "+ weather" model is given the OBSERVED weather of days 1-14 (an upper bound of a
perfect forecast) and its weather-free twin's forecast after. Each is tested against that twin on days 1-14; the champion
is chosen among the models that may be served, so a weather model that does not significantly beat its twin drops out.

Writes _work/cache/emissions_study.csv (every scored forecast) and emissions_study.json (scores, champion, intervals,
weather tests, fingerprint, code version). Nothing is written to the database.

    python emissions_study.py                        # the full study (26 origins x 90 days)
    python emissions_study.py --origins 2            # smoke test on the last 2 origins (separate output files)
    python emissions_study.py --volume-model "Prophet (no weather)"   # override the traffic champion
    python emissions_study.py --part A               # only the models that do not need the traffic champion
    python emissions_study.py --part B               # only the Derived models (needs the traffic champion)
    python emissions_study.py --interim              # score what the checkpoints hold so far (not for publishing)
"""
from __future__ import annotations

import contextlib
import hashlib
import importlib
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
from common.rolling_eval import (BASELINES, DAILY_BUCKETS, REAL_END_VOLUME, calendar_frame, is_baseline,  # noqa: E402
                                 load_holidays, report, run_study, select_champion, yearly_origins)

CACHE = WORK / "cache"
CACHE.mkdir(parents=True, exist_ok=True)
HORIZON = 90
SCORE_END = REAL_END_VOLUME
EXCLUDE: list = []                     # no broken day inside the real period (see the docstring)
EPOCH = pd.Timestamp("2022-01-01")     # the trend clock: days since this date, the same in training and forecasting
LAGS = [1, 2, 3, 7, 14, 28]
WX_GBR = ["total_rain", "avg_temp"]    # the weather the system's GBR read (rain, temperature)
WX_POLY = ["total_rain"]               # and its Polynomial (rain)
DEFAULT_VOLUME_MODEL = "Prophet (no weather)"

YEAR = ["doy_sin1", "doy_cos1", "doy_sin2", "doy_cos2", "doy_sin3", "doy_cos3"]
HOLFLAGS = ["is_holiday", "holiday_eve", "holiday_after", "holy_week", "xmas_season", "all_saints"]
LAGHOL = ["hol_lag7", "hol_in_last7", "hol_in_next3"]
DOW1H = [f"dow_{k}" for k in range(1, 7)]
# Every calendar input any candidate reads. All are known in advance, so all reach every forecast day.
KNOWN = ["t", "dow", "is_weekend", "month", "dow_sin", "dow_cos"] + DOW1H + YEAR + HOLFLAGS + LAGHOL

TAB_CAL = ["t", "dow", "is_weekend", "month"] + YEAR + HOLFLAGS + LAGHOL
TAB_DYN = [f"lag{L}" for L in LAGS] + ["roll7", "roll28", "heavy_share"]
ROW_CAL = TAB_CAL + DOW1H              # the calendar columns a tabular row carries (each model picks its own)
POLY_CORE = ["t", "roll7", "roll28", "lag1", "lag7", "dow"]
POLY_LIN = DOW1H + YEAR + HOLFLAGS + LAGHOL
SEQ_CAL = ["dow_sin", "dow_cos", "doy_sin1", "doy_cos1"] + HOLFLAGS
CPV_X = DOW1H + HOLFLAGS + ["doy_sin1", "doy_cos1", "doy_sin2", "doy_cos2"]

# Lower = simpler; a simpler model wins a tie whose lead is not significant (protocol section 6.4). Declared before
# the results.
COMPLEXITY = {"Polynomial": 2, "MSTL": 2, "MSTL + holidays": 2, "Derived": 3, "Derived + calendar ratio": 3,
              "GBR": 3, "LSTM": 4, "LSTM + calendar": 4, "Stacked LSTM": 5,
              "Polynomial + weather": 3, "GBR + weather": 4, "Derived + weather": 4,
              "Derived + calendar ratio + weather": 4}
TWIN = {"GBR + weather": "GBR", "Polynomial + weather": "Polynomial", "Derived + weather": "Derived",
        "Derived + calendar ratio + weather": "Derived + calendar ratio"}
# The dashboard's CO2 table has one forecast column per family (gold.ml_predictive_emissions).
FAMILY = {"GBR": "GBR", "GBR + weather": "GBR", "Polynomial": "Polynomial", "Polynomial + weather": "Polynomial",
          "LSTM": "LSTM", "LSTM + calendar": "LSTM", "Derived": "Derived", "Derived + calendar ratio": "Derived",
          "Derived + weather": "Derived", "Derived + calendar ratio + weather": "Derived"}


def sha(*parts) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p if isinstance(p, bytes) else str(p).encode())
    return h.hexdigest()


def file_hash(p: Path) -> str:
    return sha(Path(p).read_bytes())[:16]


def code_version() -> str:
    """The git commit, plus '+uncommitted' when the files that produce these results differ from it."""
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


# ─── Calendar ────────────────────────────────────────────────────────────────

def calendar_plus(dates, hol: pd.DataFrame) -> pd.DataFrame:
    """calendar_frame plus the extra known-in-advance columns the tabular and sequence models read."""
    cal = calendar_frame(dates, hol)
    d = pd.DatetimeIndex(cal.ds)
    hs = set(hol["date"].dt.normalize())
    one = pd.Timedelta(days=1)
    cal["t"] = (d - EPOCH).days.astype(float)
    cal["is_weekend"] = (d.dayofweek >= 5).astype(int)
    cal["month"] = d.month
    cal["dow_sin"] = np.sin(2 * np.pi * d.dayofweek / 7)
    cal["dow_cos"] = np.cos(2 * np.pi * d.dayofweek / 7)
    for k in range(1, 7):
        cal[f"dow_{k}"] = (d.dayofweek == k).astype(int)
    cal["hol_lag7"] = [int((x - 7 * one) in hs) for x in d]
    cal["hol_in_last7"] = [sum(int((x - k * one) in hs) for k in range(1, 8)) for x in d]
    cal["hol_in_next3"] = [sum(int((x + k * one) in hs) for k in range(0, 4)) for x in d]
    return cal


# ─── Context: data, traffic module, fingerprints ─────────────────────────────

class Ctx:
    pass


C = Ctx()
_loaded = False


def load(vol_override: str | None = None, log=print) -> Ctx:
    """Load everything once: the CO2 series, the traffic study's module and frame (weather, volume), holidays."""
    global _loaded
    if _loaded:
        return C
    t0 = time.time()
    sys.path.insert(0, str(TT / "traffic_volume"))
    with contextlib.redirect_stdout(io.StringIO()):
        ts = importlib.import_module("traffic_study")
    C.ts = ts
    C.HOL = ts.HOL
    import psycopg2
    with psycopg2.connect(PG) as conn:
        conn.set_session(readonly=True)
        co2 = pd.read_sql_query("""
            SELECT date AS ds, SUM(co2_tonnes::numeric)::float AS y, SUM(total)::float AS veh,
                   SUM(class_3)::float AS heavy
            FROM gold.fact_emissions_hourly GROUP BY date ORDER BY date""", conn)
    # co2_tonnes is double precision: summed as floats, the order Postgres adds them in changes the last bits from one
    # query to the next, which moved GBR's split choices (up to 0.5 pp WMAPE on one origin) and changed every
    # fingerprint. Summed as numeric, the total is exact and the same every time.
    co2["ds"] = pd.to_datetime(co2.ds)
    # Weather as the volume module builds it (station mean per hour, then the day); the same days as traffic.
    co2 = co2.merge(ts.df[["ds"] + ts.WEATHER], on="ds", how="left")
    C.data_end = co2.ds.max()
    C.WX_ALL = list(ts.WEATHER)
    # Calendar for every day from the first record to well past the last forecast window, so a window that runs past
    # the end of the data still has its calendar (run_study takes known columns from this frame).
    C.CAL = calendar_plus(pd.date_range(co2.ds.min(), C.data_end + pd.Timedelta(days=HORIZON + 30)), C.HOL)
    C.CAL_IDX = C.CAL.set_index("ds")
    C.F = C.CAL.merge(co2, on="ds", how="left").sort_values("ds").reset_index(drop=True)
    C.co2 = co2
    # Traffic frame for the Derived candidate: the traffic study's own frame, calendar for any day from the same
    # calendar_frame and holidays it uses.
    C.TDF = ts.df.sort_values("ds").reset_index(drop=True)
    C.TCAL = calendar_frame(pd.date_range(C.TDF.ds.min(), C.TDF.ds.max() + pd.Timedelta(days=HORIZON + 400)),
                            C.HOL).set_index("ds")
    C.T_KNOWN = ["dow"] + list(ts.YEAR_HOL)
    # Which volume model feeds Derived: the traffic study's champion (protocol section 2: another model's output
    # enters as that model's own out-of-sample forecast).
    if vol_override:
        C.vol_name, C.vol_src = vol_override, "override"
    elif (CACHE / "traffic_study.json").exists():
        C.vol_name, C.vol_src = json.loads((CACHE / "traffic_study.json").read_text())["champion"], "traffic_study.json"
    else:
        C.vol_name, C.vol_src = DEFAULT_VOLUME_MODEL, "fallback: traffic_study.json not found"
    if C.vol_name not in ts.MODELS:
        raise SystemExit(f"volume model {C.vol_name!r} is not in traffic_study.MODELS")
    twin = C.vol_name.replace(" + weather", " (no weather)")
    C.vol_twin = twin if (twin != C.vol_name and twin in ts.MODELS) else None
    C.vol_weather = " + weather" in C.vol_name
    # Fingerprints: the data and the code that produce a forecast. A cache or checkpoint is reused only on a match.
    C.code = {"emissions_study.py": file_hash(Path(__file__)), "rolling_eval.py": file_hash(Path(RE.__file__)),
              "traffic_study.py": file_hash(TT / "traffic_volume" / "traffic_study.py")}
    C.fp_traffic = sha(C.TDF[["ds", "y"] + ts.WEATHER].to_csv(index=False), C.HOL.to_csv(index=False),
                       C.code["traffic_study.py"], C.code["rolling_eval.py"])[:16]
    # Part A (every model but Derived) depends on the CO2 series, holidays and this code only; the full study also on
    # the traffic series, the traffic code and which volume model feeds Derived.
    C.fp_a = sha(co2.to_csv(index=False), C.HOL.to_csv(index=False), C.code["emissions_study.py"],
                 C.code["rolling_eval.py"])[:16]
    C.fp = sha(C.fp_a, C.fp_traffic, C.code["traffic_study.py"], C.vol_name)[:16]
    C.vcache_path = CACHE / "emissions_volume_inputs.json"
    try:
        C.vcache = json.loads(C.vcache_path.read_text()) if C.vcache_path.exists() else {}
    except Exception:  # noqa: BLE001
        C.vcache = {}
    _loaded = True
    log(f"  loaded in {time.time() - t0:.0f}s: CO2 {len(co2)} days {co2.ds.min().date()}..{C.data_end.date()}; "
        f"volume model for Derived: {C.vol_name} ({C.vol_src}){'; twin ' + C.vol_twin if C.vol_twin else ''}")
    return C


# ─── Per-origin cache (a "+ weather" model reuses its twin's forecast for days 15-90) ────────────────────────────

_ocache: dict = {}


def cached(key, train, fn):
    k = (key, str(train.ds.iloc[-1].date()), len(train))
    if k not in _ocache:
        if len(_ocache) > 60:
            _ocache.clear()
        _ocache[k] = np.asarray(fn(), dtype=float)
    return _ocache[k]


def _with_twin(twin_fn, weather_fn):
    """Days 1-14 from the weather model given observed weather, days 15-90 from its weather-free twin (as served)."""
    def f(tr, fu):
        nw = twin_fn(tr, fu)
        w = weather_fn(tr, fu.iloc[:14].reset_index(drop=True))
        return np.concatenate([np.asarray(w, dtype=float)[:14], nw[14:]])
    return f


# ─── Tabular recursive models (GBR, Polynomial) ──────────────────────────────

def _train_matrix(tr: pd.DataFrame, wx: list[str]):
    s = tr["y"].astype(float).reset_index(drop=True)
    X = tr[ROW_CAL].reset_index(drop=True).astype(float).copy()
    for L in LAGS:
        X[f"lag{L}"] = s.shift(L)
    X["roll7"] = s.shift(1).rolling(7).mean()
    X["roll28"] = s.shift(1).rolling(28).mean()
    X["heavy_share"] = (tr["heavy"] / tr["veh"]).reset_index(drop=True).shift(1)
    for c in wx:
        X[c] = tr[c].astype(float).values
    ok = X.notna().all(axis=1)
    return X[ok], s[ok]


def _future_share(tr: pd.DataFrame, fu: pd.DataFrame) -> list[float]:
    """Yesterday's Class 3 share for each forecast day. Day 1's yesterday is the last training day (known); after
    that, what that weekday has lately been on ordinary days (median over the 8 weeks before the origin)."""
    sh = (tr["heavy"] / tr["veh"]).values
    recent = tr.tail(56)
    ordinary = recent[(recent[HOLFLAGS] == 0).all(axis=1)]
    s = ordinary["heavy"] / ordinary["veh"]
    by = s.groupby(ordinary.ds.dt.dayofweek).median().to_dict()
    allm = float(s.median()) if len(s) else float(sh[-1])
    out = [float(sh[-1])]
    for d in pd.to_datetime(fu.ds).iloc[1:]:
        out.append(float(by.get((d - pd.Timedelta(days=1)).dayofweek, allm)))
    return out


def _recursive(model, tr, fu, feats, wx, h):
    y = list(tr["y"].astype(float).values)
    share = _future_share(tr, fu)
    cal = fu[ROW_CAL].astype(float).to_dict("records")
    wxr = fu[wx].astype(float).to_dict("records") if wx else None
    out = []
    for k in range(h):
        r = dict(cal[k])
        n = len(y)
        for L in LAGS:
            r[f"lag{L}"] = y[n - L]
        r["roll7"] = float(np.mean(y[-7:]))
        r["roll28"] = float(np.mean(y[-28:]))
        r["heavy_share"] = share[k]
        if wx:
            r.update(wxr[k])
        p = float(model.predict(pd.DataFrame([r])[feats])[0])
        y.append(p)
        out.append(p)
    return np.array(out)


def _gbr(tr, fu, wx):
    from sklearn.ensemble import GradientBoostingRegressor
    X, s = _train_matrix(tr, wx)
    feats = TAB_CAL + TAB_DYN + wx
    m = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.9,
                                  random_state=42).fit(X[feats], s)
    return _recursive(m, tr, fu, feats, wx, len(fu))


class PolyRidge:
    """Degree-2 terms of a compact core (standardised), the calendar as linear terms, ridge (alpha 1)."""

    def __init__(self, core, lin):
        self.core, self.lin = core, lin

    def fit(self, X, y):
        from sklearn.linear_model import Ridge
        from sklearn.preprocessing import PolynomialFeatures, StandardScaler
        self.sc = StandardScaler().fit(X[self.core].values)
        self.pf = PolynomialFeatures(degree=2, include_bias=False).fit(self.sc.transform(X[self.core].values))
        self.sl = StandardScaler().fit(X[self.lin].values)
        self.r = Ridge(alpha=1.0).fit(self._z(X), y)
        return self

    def _z(self, X):
        return np.hstack([self.pf.transform(self.sc.transform(X[self.core].values)), self.sl.transform(X[self.lin].values)])

    def predict(self, X):
        return self.r.predict(self._z(X))


def _poly(tr, fu, wx):
    X, s = _train_matrix(tr, wx)
    core = POLY_CORE + wx
    feats = list(dict.fromkeys(core + POLY_LIN))
    m = PolyRidge(core, POLY_LIN).fit(X, s.values)
    return _recursive(m, tr, fu, feats, wx, len(fu))


def m_gbr(tr, fu):
    return cached("gbr", tr, lambda: _gbr(tr, fu, []))


def m_poly(tr, fu):
    return cached("poly", tr, lambda: _poly(tr, fu, []))


# ─── Sequence models ─────────────────────────────────────────────────────────

def _tf():
    import tensorflow as tf
    tf.keras.backend.clear_session()
    # Seeds alone left the LSTMs' scores varying between processes (multi-threaded reductions); deterministic ops make
    # a re-run give the same forecast.
    tf.keras.utils.set_random_seed(42)
    try:
        tf.config.experimental.enable_op_determinism()
    except Exception:  # noqa: BLE001
        pass
    return tf


def m_lstm(tr, fu):
    """As the system trains it: univariate, 28-day window, LSTM(32), 30 epochs, recursive."""
    tf = _tf()
    from tensorflow.keras import Sequential, layers
    SEQ = 28
    s = tr["y"].values.astype("float32")
    mu, sd = float(s.mean()), float(s.std() or 1.0)
    z = (s - mu) / sd
    X = np.array([z[i - SEQ:i] for i in range(SEQ, len(z))])[..., None]
    Y = z[SEQ:]
    m = Sequential([layers.Input((SEQ, 1)), layers.LSTM(32), layers.Dense(1)])
    m.compile("adam", "mse")
    m.fit(X, Y, epochs=30, batch_size=32, verbose=0)
    win, out = list(z[-SEQ:]), []
    for _ in range(len(fu)):
        p = float(m(np.array(win[-SEQ:], dtype="float32")[None, :, None], training=False).numpy()[0, 0])
        out.append(p)
        win.append(p)
    del m
    tf.keras.backend.clear_session()
    return np.array(out) * sd + mu


def m_lstm_cal(tr, fu):
    """The same network; each step also carries the NEXT day's calendar, so the day being forecast is known."""
    tf = _tf()
    from tensorflow.keras import Sequential, layers
    SEQ = 28
    s = tr["y"].values.astype("float32")
    mu, sd = float(s.mean()), float(s.std() or 1.0)
    z = (s - mu) / sd
    n, h = len(z), len(fu)
    cal = np.vstack([tr[SEQ_CAL].values, fu[SEQ_CAL].values]).astype("float32")      # rows 0..n+h-1
    # step j holds z[j] and the calendar of day j+1
    X = np.array([np.column_stack([z[i - SEQ:i], cal[i - SEQ + 1:i + 1]]) for i in range(SEQ, n)])
    Y = z[SEQ:]
    m = Sequential([layers.Input((SEQ, 1 + len(SEQ_CAL))), layers.LSTM(32), layers.Dense(1)])
    m.compile("adam", "mse")
    m.fit(X, Y, epochs=30, batch_size=32, verbose=0)
    zz = list(z)
    out = []
    for k in range(h):
        i = n + k
        w = np.column_stack([np.array(zz[i - SEQ:i], dtype="float32"), cal[i - SEQ + 1:i + 1]])
        p = float(m(w[None], training=False).numpy()[0, 0])
        zz.append(p)
        out.append(p)
    del m
    tf.keras.backend.clear_session()
    return np.array(out) * sd + mu


STACK_SEQ, STACK_OUT = 56, 7


def m_stacked(tr, fu):
    """Two stacked LSTM layers (64 -> 32) over the last 8 weeks with each day's calendar, plus the calendar of the week
    being forecast and the same days a year earlier, predicting a week at a time (the trainer's Stacked_LSTM with the
    full calendar)."""
    tf = _tf()
    from tensorflow.keras import Model, layers
    from tensorflow.keras.callbacks import EarlyStopping
    y = tr["y"].values.astype("float32")
    n, h = len(y), len(fu)
    end = pd.to_datetime(fu.ds).max()
    ds_all = list(pd.to_datetime(tr.ds)) + list(pd.to_datetime(fu.ds)) + [end + pd.Timedelta(days=k) for k in range(1, STACK_OUT + 1)]
    cal = C.CAL_IDX.loc[pd.DatetimeIndex(ds_all), SEQ_CAL].values.astype("float32")
    lo, hi = float(y.min()), float(y.max())
    span = max(hi - lo, 1e-6)
    z = np.concatenate([(y - lo) / span, np.zeros(h + STACK_OUT, dtype="float32")])

    def sample(t):
        seq = np.column_stack([z[t - STACK_SEQ:t], cal[t - STACK_SEQ:t]])
        nxt = np.concatenate([cal[t:t + STACK_OUT].ravel(), z[t - 364:t - 364 + STACK_OUT]])
        return seq, nxt

    ts_ = list(range(max(STACK_SEQ, 364), n - STACK_OUT + 1))
    Xs, Xn, Y = zip(*[(*sample(t), z[t:t + STACK_OUT]) for t in ts_])
    Xs, Xn, Y = np.stack(Xs), np.stack(Xn), np.stack(Y)
    a = layers.Input(Xs.shape[1:])
    b = layers.Input(Xn.shape[1:])
    x = layers.LSTM(64, return_sequences=True)(a)
    x = layers.Dropout(0.2)(x)
    x = layers.LSTM(32)(x)
    x = layers.Concatenate()([x, b])
    x = layers.Dense(32, activation="relu")(x)
    m = Model([a, b], layers.Dense(STACK_OUT)(x))
    m.compile("adam", "mse")
    m.fit([Xs, Xn], Y, epochs=60, batch_size=32, verbose=0, validation_split=0.1,
          callbacks=[EarlyStopping(patience=6, restore_best_weights=True)])
    t = n
    while t < n + h:
        seq, nxt = sample(t)
        p = m([seq[None], nxt[None]], training=False).numpy()[0]
        k = min(STACK_OUT, n + h - t)
        z[t:t + k] = p[:k]
        t += k
    del m
    tf.keras.backend.clear_session()
    return z[n:n + h] * span + lo


# ─── MSTL ────────────────────────────────────────────────────────────────────

def _mstl(tr, fu, holidays: bool):
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.seasonal import MSTL
    y = tr["y"].values.astype(float)
    n, h = len(y), len(fu)
    seas = np.asarray(MSTL(y, periods=(7, 365)).fit().seasonal)
    weekly = np.array([seas[n + i - 7 * ((i // 7) + 1), 0] for i in range(h)])
    yearly = np.array([seas[n + i - 365, 1] for i in range(h)])
    rest = y - seas.sum(axis=1)
    if holidays:
        fit = ARIMA(rest, exog=tr[HOLFLAGS].values.astype(float), order=(1, 1, 1)).fit()
        fc = np.asarray(fit.forecast(h, exog=fu[HOLFLAGS].values.astype(float)))
    else:
        fc = np.asarray(ARIMA(rest, order=(1, 1, 1)).fit().forecast(h))
    return fc + weekly + yearly


def m_mstl(tr, fu):
    return _mstl(tr, fu, False)


def m_mstl_hol(tr, fu):
    return _mstl(tr, fu, True)


# ─── Derived: the volume model's own forecast x CO2 per vehicle ──────────────

def _save_vcache():
    tmp = C.vcache_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(C.vcache))
    tmp.replace(C.vcache_path)


def volume_forecast(name: str, origin: pd.Timestamp, h: int, oracle: bool = True) -> np.ndarray:
    """The traffic model `name` refitted on the traffic rows before `origin` and forecast h days, exactly as the traffic
    study forecasts (calendar for every day; observed weather for days 1-14 only when oracle). Cached on disk under the
    traffic data and code fingerprint."""
    origin = pd.Timestamp(origin)
    key = f"{name}|{origin.date()}|{h}|{int(oracle)}|{C.fp_traffic}"
    if key in C.vcache:
        return np.asarray(C.vcache[key], dtype=float)
    ts = C.ts
    train = C.TDF[C.TDF.ds < origin].reset_index(drop=True)
    dates = pd.date_range(origin, periods=h, freq="D")
    fut = C.TCAL.loc[dates, C.T_KNOWN].reset_index().rename(columns={"index": "ds"})
    ob = C.TDF.set_index("ds").reindex(dates)[ts.WEATHER]
    for c in ts.WEATHER:
        fut[c] = [ob[c].iloc[i] if (oracle and i < 14) else np.nan for i in range(h)]
    with contextlib.redirect_stdout(io.StringIO()):
        yh = np.asarray(ts.MODELS[name](train, fut.copy()), dtype=float)
    if yh.shape != (h,) or not np.isfinite(yh).all():
        raise ValueError(f"volume model {name} gave a bad forecast")
    C.vcache[key] = [float(v) for v in yh]
    _save_vcache()
    return yh


def cpv_weekday(tr, fu):
    last = tr.tail(56)
    g = last.groupby(last.ds.dt.dayofweek)
    r = (g["y"].sum() / g["veh"].sum()).to_dict()
    return np.array([r[d.dayofweek] for d in pd.to_datetime(fu.ds)])


def cpv_calendar(tr, fu):
    """log(CO2 per vehicle) on weekday, holiday and yearly terms over the last 3 years, anchored to the level of the
    last 8 weeks (mean residual), so a holiday's lighter or heavier fleet carries into the ratio."""
    from sklearn.linear_model import Ridge
    t = tr.tail(3 * 365)
    r = np.log(t["y"] / t["veh"]).values
    m = Ridge(alpha=1.0).fit(t[CPV_X].values.astype(float), r)
    level = float((r - m.predict(t[CPV_X].values.astype(float)))[-56:].mean())
    return np.exp(m.predict(fu[CPV_X].values.astype(float)) + level)


def make_derived(vol_name: str, ratio: str):
    def f(tr, fu):
        vol = volume_forecast(vol_name, pd.to_datetime(fu.ds).iloc[0], len(fu))
        cpv = cpv_weekday(tr, fu) if ratio == "weekday" else cpv_calendar(tr, fu)
        return vol * cpv
    return f


# ─── The candidate set ───────────────────────────────────────────────────────

def build_models() -> dict:
    M = {**BASELINES("y")}
    M["GBR"] = m_gbr
    M["GBR + weather"] = _with_twin(m_gbr, lambda tr, fu: _gbr(tr, fu, WX_GBR))
    M["Polynomial"] = m_poly
    M["Polynomial + weather"] = _with_twin(m_poly, lambda tr, fu: _poly(tr, fu, WX_POLY))
    M["LSTM"] = m_lstm
    M["LSTM + calendar"] = m_lstm_cal
    free = C.vol_twin if C.vol_weather else C.vol_name          # the weather-free volume model
    M["Derived"] = make_derived(free, "weekday")
    M["Derived + calendar ratio"] = make_derived(free, "calendar")
    if C.vol_weather:
        M["Derived + weather"] = make_derived(C.vol_name, "weekday")
        M["Derived + calendar ratio + weather"] = make_derived(C.vol_name, "calendar")
    M["MSTL"] = m_mstl
    M["MSTL + holidays"] = m_mstl_hol
    M["Stacked LSTM"] = m_stacked
    return M


def served_volume_model() -> str:
    """The volume model Derived is served with: weather-free, since no weather forecast covers a window that starts
    after the record ends."""
    return C.vol_twin if C.vol_weather else C.vol_name


def uses_weather(name: str) -> bool:
    return "+ weather" in name


# ─── Scores beyond the selection metric ──────────────────────────────────────

def bucket_metrics(res: pd.DataFrame, buckets=DAILY_BUCKETS) -> pd.DataFrame:
    """Per model x bucket: n, WMAPE, MAPE, MAE, RMSE, R2 (from the same scored rows)."""
    r = res.copy()
    r["bucket"] = RE._bucket(r.h, buckets)
    r = r.dropna(subset=["bucket"])
    r["e"] = r.forecast - r.actual
    out = []
    for (m, b), g in r.groupby(["model", "bucket"]):
        ae = g.e.abs()
        sst = float(((g.actual - g.actual.mean()) ** 2).sum())
        out.append({"model": m, "bucket": b, "n": len(g), "wmape": ae.sum() / g.actual.abs().sum() * 100,
                    "mape": float((ae / g.actual.abs()).mean() * 100), "mae": float(ae.mean()),
                    "rmse": float(np.sqrt((g.e ** 2).mean())),
                    "r2": float(1 - (g.e ** 2).sum() / sst) if sst > 0 else np.nan})
    return pd.DataFrame(out)


def settle_tie(sel: dict, res: pd.DataFrame, buckets=DAILY_BUCKETS, metric: str = "wmape") -> dict:
    """common/rolling_eval.select_champion computes the champion-vs-baseline interval BEFORE a simpler runner-up takes
    a non-significant tie, so after that swap the interval describes the old leader (reported as a harness bug,
    10 Nov 2026). Recompute both intervals for the champion actually chosen: vs the best baseline, and champion minus
    runner-up."""
    if not sel.get("note") or sel.get("champion_is_baseline") or not sel.get("runner_up"):
        return sel
    cells = RE._cells(res, buckets)
    lo, hi = RE._boot_diff(cells, sel["champion"], sel["best_baseline"], buckets, metric, sel["block"])
    sel["vs_baseline_ci"], sel["vs_baseline_significant"] = [lo, hi], bool(hi < 0)
    rlo, rhi = RE._boot_diff(cells, sel["champion"], sel["runner_up"], buckets, metric, sel["block"])
    sel["vs_runner_up_ci"], sel["vs_runner_up_significant"] = [rlo, rhi], bool(rhi < 0)
    sel["intervals_recomputed_after_tie"] = True
    return sel


def weather_tests(res: pd.DataFrame) -> dict:
    """Protocol section 2: does a weather model, given the observed weather (a perfect forecast), significantly beat
    its weather-free twin on days 1-14 (the only days they differ)? Moving-block bootstrap over origins."""
    cells = RE._cells(res, [(1, 14)])
    t = RE.summarize(res, [(1, 14)], "wmape")
    out = {}
    for w, twin in TWIN.items():
        if w in t.index and twin in t.index:
            lo, hi = RE._boot_diff(cells, w, twin, [(1, 14)], "wmape", block=1)
            out[w] = {"twin": twin, "weather_d1_14": float(t.loc[w, "d1-14"]), "twin_d1_14": float(t.loc[twin, "d1-14"]),
                      "diff_ci": [lo, hi], "significant": bool(hi < 0)}
    return out


# ─── The study ───────────────────────────────────────────────────────────────

def outputs(tag: str):
    return CACHE / f"{tag}.csv", CACHE / f"{tag}.json"


def _from_ckpt(path: Path, order: list[int]) -> pd.DataFrame:
    """The scored rows a run_study checkpoint holds so far (for --interim)."""
    cols = ["origin", "model", "h", "date", "actual", "forecast"]
    if not path.exists():
        return pd.DataFrame(columns=cols)
    ck = json.loads(path.read_text())
    if ck.get("origins") != order:
        return pd.DataFrame(columns=cols)
    return pd.DataFrame(ck["rows"], columns=cols)


def run(n_origins: int | None = None, vol_override: str | None = None, part: str = "all", interim: bool = False,
        log=print) -> dict | None:
    """part 'A' runs every model except Derived (they do not depend on the traffic champion) and stops; 'B' runs only
    the Derived models (so they can run in a second process once the traffic champion is known) and stops; 'all'
    runs or resumes both from their checkpoints, then scores everything together. interim scores only what the two
    checkpoints already hold (written as emissions_study_interim.*, which the trainer does not accept)."""
    load(vol_override, log)
    models = build_models()
    derived = [m for m in models if m.startswith("Derived")]
    models_a = {k: v for k, v in models.items() if k not in derived}
    models_b = {k: v for k, v in models.items() if k in derived}
    F = C.F
    origins = yearly_origins(F.ds, SCORE_END)
    all_origins = len(origins)
    if n_origins:
        origins = origins[-n_origins:]
    # Every other origin first, then the rest: a run stopped part-way still spans the whole year (28-day spacing).
    # Origins are renumbered in date order before scoring, so the moving-block bootstrap sees them in time order.
    order = origins[0::2] + origins[1::2]
    chron = {i + 1: origins.index(c) + 1 for i, c in enumerate(order)}
    tag = "emissions_study" if not n_origins else f"emissions_study_smoke{n_origins}"
    ck_a, ck_b = CACHE / f"{tag}.A.{C.fp_a}.ckpt.json", CACHE / f"{tag}.B.{C.fp}.ckpt.json"
    log(f"\n  CO2: real record to {SCORE_END.date()}; {len(origins)} of {all_origins} origins "
        f"{F.ds.iloc[origins[0]].date()} .. {F.ds.iloc[origins[-1]].date()}; {HORIZON}-day horizon; "
        f"{len(models)} models; fingerprint {C.fp}")
    t0 = time.time()
    kw = dict(known_cols=KNOWN, oracle_cols=C.WX_ALL, score_end=SCORE_END, exclude_dates=EXCLUDE, log=log)
    if interim:
        res_a, res_b = _from_ckpt(ck_a, order), _from_ckpt(ck_b, order)
        tag += "_interim"
    elif part == "B":
        log(f"  part B only: {len(models_b)} Derived models through {C.vol_name}, checkpoint {ck_b.name}")
        run_study(F, "y", models_b, HORIZON, order, ckpt=ck_b, **kw)
        log(f"  part B done ({(time.time() - t0) / 60:.0f} min)")
        return None
    else:
        log(f"  part A: {len(models_a)} models (all but Derived), checkpoint {ck_a.name}")
        res_a = run_study(F, "y", models_a, HORIZON, order, ckpt=ck_a, **kw)
        if part == "A":
            log(f"  part A done ({(time.time() - t0) / 60:.0f} min); run again without --part A for Derived and scores")
            return None
        log(f"  part B: {len(models_b)} Derived models through {C.vol_name}, checkpoint {ck_b.name}")
        res_b = run_study(F, "y", models_b, HORIZON, order, ckpt=ck_b, **kw)
    # Protocol section 2: every candidate and baseline on exactly the same origins. An origin dropped in either part
    # (a model failed there), or not yet run in an interim score, is left out for all models.
    common = set(res_a.origin) & set(res_b.origin)
    res = pd.concat([res_a, res_b], ignore_index=True)
    res = res[res.origin.isin(common)].reset_index(drop=True)
    if res.empty:
        log("  nothing scored yet")
        return None
    res["origin"] = res.origin.map(chron).astype(int)
    minutes = (time.time() - t0) / 60
    origin_dates = {i + 1: str(F.ds.iloc[c].date()) for i, c in enumerate(origins)}
    kept = sorted(int(o) for o in res.origin.unique())
    sel_all = settle_tie(select_champion(res, DAILY_BUCKETS, "wmape", complexity=COMPLEXITY), res)
    wt = weather_tests(res)
    # Protocol section 2: a weather model that does not significantly beat its twin with a PERFECT weather forecast
    # is not served, so it does not take part in choosing the champion.
    drop = [w for w, v in wt.items() if not v["significant"]]
    sel = settle_tie(select_champion(res[~res.model.isin(drop)], DAILY_BUCKETS, "wmape", complexity=COMPLEXITY),
                     res[~res.model.isin(drop)])
    bm = bucket_metrics(res)
    out = {
        "target": "Corridor CO2 (tonnes/day)", "protocol": "EVALUATION_PROTOCOL.md (10 Nov 2026)",
        "generated": pd.Timestamp.now().isoformat(timespec="seconds"), "code_version": code_version(),
        "fingerprint": C.fp, "code_hashes": C.code, "score_end": str(SCORE_END.date()),
        "data_end": str(C.data_end.date()), "horizon": HORIZON, "buckets": [list(b) for b in DAILY_BUCKETS],
        "origins": origin_dates, "origins_scored": kept,
        "origins_dropped": [] if interim else [o for o in origin_dates if int(o) not in kept],
        "smoke": bool(n_origins), "interim": bool(interim), "minutes": round(minutes, 1),
        "volume_model": {"champion": C.vol_name, "source": C.vol_src, "twin": C.vol_twin,
                         "served": served_volume_model()},
        "complexity": COMPLEXITY, "weather_tests": wt, "not_servable_weather": drop,
        "selection_all_candidates": sel_all, "selection": sel, "champion": sel["champion"],
        "bucket_metrics": bm.round(5).to_dict(orient="records"),
    }
    csv, js = outputs(tag)
    res.to_csv(csv, index=False)
    js.write_text(json.dumps(out, indent=1, default=str))
    log(f"\n  ALL CANDIDATES (weather models with observed weather days 1-14) - {len(kept)} origins"
        + (" (INTERIM)" if interim else f", {minutes:.0f} min"))
    report(sel_all, log)
    log("\n  weather vs twin, days 1-14 (observed weather = upper bound of a perfect forecast):")
    for w, v in wt.items():
        log(f"    {w:<36} {v['weather_d1_14']:6.2f}% vs {v['twin']} {v['twin_d1_14']:6.2f}%  diff 95% "
            f"[{v['diff_ci'][0]:+.2f}, {v['diff_ci'][1]:+.2f}]  "
            f"{'significant' if v['significant'] else 'NOT significant -> twin served'}")
    if drop:
        log(f"\n  SELECTION among servable models (dropped: {', '.join(drop)})")
        report(sel, log)
    log(f"\n  written: {csv.name}, {js.name} (nothing written to the database)")
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    n = int(a[a.index("--origins") + 1]) if "--origins" in a else None
    v = a[a.index("--volume-model") + 1] if "--volume-model" in a else None
    run(n, v, part=a[a.index("--part") + 1] if "--part" in a else "all", interim="--interim" in a)
