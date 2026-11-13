"""
Daily corridor traffic volume: every candidate under EVALUATION_PROTOCOL.md (10 Nov 2026). Test-only; writes no table.

Candidates, declared before the run:
  As the system trains them      Prophet + weather, Prophet (no weather), SARIMAX + weather, SARIMAX (no weather),
                                 Holt-Winters, Holt's Linear, LSTM + weather, LSTM (no weather)
  Fair versions (feature parity) Holt-Winters (damped), Prophet + holidays, SARIMAX + yearly + holidays,
                                 LSTM + calendar, Gradient boosting + calendar
  Baselines                      last week, weekday average, last year (scaled)
A "+ weather" model is served only while a real 16-day weather forecast exists, so it is tested as served: days 1-14
from the weather model given the OBSERVED weather (an upper bound of a perfect forecast), days 15-90 from its
weather-free twin.

Writes _work/cache/traffic_study.csv (every scored forecast), traffic_study.json (scores, champion, intervals) and
traffic_origins.json (origin dates), which the incident and emissions studies use for their volume inputs.
"""
import contextlib
import io
import json
import logging
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
logging.getLogger("cmdstanpy").disabled = True
logging.getLogger("prophet").disabled = True

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from common.rolling_eval import (BASELINES, REAL_END_VOLUME, calendar_frame, load_holidays, report,  # noqa: E402
                                 run_study, select_champion, yearly_origins)

src = (HERE / "retrain_honest.py").read_text(encoding="utf-8")
head = src.split('banner(f"STEP 2: Rolling-origin evaluation')[0]
g = {"__file__": str(HERE / "retrain_honest.py"), "__name__": "retrain_honest_head"}
exec(compile(head, "retrain_honest_head", "exec"), g)
df0, WEATHER, WORK, PG = g["df"], g["WEATHER_COLS"], Path(g["WORK"]), g["PG"]
LSTM_SEQ, LSTM_EPOCHS = g["LSTM_SEQ"], g["LSTM_EPOCHS"]

import psycopg2  # noqa: E402
with psycopg2.connect(PG) as conn:
    HOL = load_holidays(conn)

# The calendar is known in advance, so it runs 90 days past the record: the last origins forecast into July-August,
# and without these rows their calendar inputs were empty and those origins were dropped (bug found 11 Nov 2026).
_ext = pd.date_range(df0.ds.max() + pd.Timedelta(days=1), periods=90, freq="D")
cal = calendar_frame(pd.concat([df0.ds, pd.Series(_ext)]), HOL)
CAL_COLS = [c for c in cal.columns if c != "ds"]
df = cal.merge(df0.drop(columns=[c for c in df0.columns if c in CAL_COLS]), on="ds", how="left")
QUIET = contextlib.redirect_stdout(io.StringIO())


def _prophet(train, dates, weather=None, holidays=False):
    from prophet import Prophet
    kw = {}
    if holidays:
        h = HOL.rename(columns={"date": "ds", "name": "holiday"})[["ds", "holiday"]].copy()
        h["lower_window"], h["upper_window"] = -1, 1
        kw["holidays"] = h
    m = Prophet(weekly_seasonality=True, yearly_seasonality=True, daily_seasonality=False, **kw)
    cols = ["ds", "y"]
    if weather is not None:
        for c in WEATHER:
            m.add_regressor(c)
        cols += WEATHER
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        m.fit(train[cols])
    fut = pd.DataFrame({"ds": dates})
    if weather is not None:
        for c in WEATHER:
            fut[c] = weather[c].values
    return m.predict(fut)["yhat"].values


def _sarimax(train, h, exog_tr=None, exog_fu=None):
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    fit = SARIMAX(train["y"].values, exog=exog_tr, order=(1, 1, 1), seasonal_order=(1, 1, 1, 7),
                  enforce_stationarity=False, enforce_invertibility=False).fit(disp=False)
    return np.asarray(fit.forecast(steps=h, exog=exog_fu), dtype=float)


def _lstm(train, future, extra_cols, h):
    """Recursive LSTM as retrain_honest.py builds it; extra_cols are known-in-advance inputs fed for every day."""
    from sklearn.preprocessing import MinMaxScaler
    from tensorflow.keras.layers import LSTM, Dense, Dropout
    from tensorflow.keras.models import Sequential
    feats = ["y"] + extra_cols
    sc = MinMaxScaler()
    scaled = sc.fit_transform(train[feats].values)
    X = np.array([scaled[i - LSTM_SEQ:i] for i in range(LSTM_SEQ, len(scaled))])
    Y = scaled[LSTM_SEQ:, 0]
    mdl = Sequential([LSTM(64, return_sequences=True, input_shape=(LSTM_SEQ, len(feats))), Dropout(0.2),
                      LSTM(32), Dropout(0.2), Dense(1)])
    mdl.compile(optimizer="adam", loss="mse")
    mdl.fit(X, Y, epochs=LSTM_EPOCHS, batch_size=32, verbose=0)
    ex = sc.transform(np.column_stack([np.zeros(h)] + [future[c].values[:h] for c in extra_cols]))[:, 1:] if extra_cols else None
    w = scaled[-LSTM_SEQ:].copy()
    out = []
    for i in range(h):
        p = float(mdl.predict(w[np.newaxis, ...], verbose=0)[0, 0])
        out.append(p)
        w = np.vstack([w[1:], np.concatenate([[p], ex[i]]) if extra_cols else [[p]]])
    pad = np.zeros((h, len(feats)))
    pad[:, 0] = out
    return sc.inverse_transform(pad)[:, 0]


# Per-origin cache, so a "+ weather" model reuses its twin's forecast instead of refitting it.
_cache: dict = {}


def cached(key, train, fn):
    k = (key, str(train.ds.iloc[-1].date()))
    if k not in _cache:
        _cache.clear() if len(_cache) > 40 else None
        _cache[k] = fn()
    return _cache[k]


def m_prophet_nw(tr, fu):
    return cached("prophet_nw", tr, lambda: _prophet(tr, fu.ds))


def m_prophet_w(tr, fu):
    nw = m_prophet_nw(tr, fu)
    w = _prophet(tr, fu.ds.iloc[:14], weather=fu.iloc[:14][WEATHER])
    return np.concatenate([w, nw[14:]])


def m_prophet_hol(tr, fu):
    return _prophet(tr, fu.ds, holidays=True)


def m_sarimax_nw(tr, fu):
    return cached("sarimax_nw", tr, lambda: _sarimax(tr, len(fu)))


def m_sarimax_w(tr, fu):
    nw = m_sarimax_nw(tr, fu)
    w = _sarimax(tr, 14, tr[WEATHER].values, fu.iloc[:14][WEATHER].values)
    return np.concatenate([w, nw[14:]])


YEAR_HOL = ["doy_sin1", "doy_cos1", "doy_sin2", "doy_cos2", "doy_sin3", "doy_cos3",
            "is_holiday", "holiday_eve", "holiday_after", "holy_week", "xmas_season", "all_saints"]


def _dhr_exog(d):
    dd = pd.DatetimeIndex(d.ds)
    wk = np.column_stack([f(2 * np.pi * k * dd.dayofweek / 7) for k in (1, 2, 3) for f in (np.sin, np.cos)])
    return np.column_stack([wk, d[YEAR_HOL].values.astype(float)])


def m_sarimax_yh(tr, fu):
    """Dynamic harmonic regression, the standard way to give an ARIMA model several seasonal patterns and holidays:
    weekly and yearly Fourier terms plus holiday flags as regressors, ARIMA(1,1,1) errors. (A seasonal-differenced
    SARIMA with the same regressors was mis-specified: 24% on a smoke-test origin, 10 Nov 2026.)"""
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    fit = SARIMAX(tr["y"].values, exog=_dhr_exog(tr), order=(1, 1, 1),
                  enforce_stationarity=False, enforce_invertibility=False).fit(disp=False)
    return np.asarray(fit.forecast(steps=len(fu), exog=_dhr_exog(fu)), dtype=float)


def m_hw(tr, fu, damped=False):
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    fit = ExponentialSmoothing(tr["y"].values, trend="add", damped_trend=damped, seasonal="add",
                               seasonal_periods=7, initialization_method="estimated").fit()
    return np.asarray(fit.forecast(len(fu)), dtype=float)


def m_holt(tr, fu):
    from statsmodels.tsa.holtwinters import Holt
    return np.asarray(Holt(tr["y"].values, initialization_method="estimated").fit(optimized=True).forecast(len(fu)), dtype=float)


def m_lstm_nw(tr, fu):
    return cached("lstm_nw", tr, lambda: _lstm(tr, fu, [], len(fu)))


def m_lstm_w(tr, fu):
    nw = m_lstm_nw(tr, fu)
    w = _lstm(tr, fu.iloc[:14], WEATHER, 14)
    return np.concatenate([w, nw[14:]])


LSTM_CAL = ["doy_sin1", "doy_cos1", "is_holiday", "holiday_eve", "holiday_after", "holy_week", "xmas_season"]


def m_lstm_cal(tr, fu):
    t2 = tr.copy()
    f2 = fu.copy()
    for d in (t2, f2):
        dd = pd.DatetimeIndex(d.ds)
        d["dow_sin"], d["dow_cos"] = np.sin(2 * np.pi * dd.dayofweek / 7), np.cos(2 * np.pi * dd.dayofweek / 7)
    return _lstm(t2, f2, ["dow_sin", "dow_cos"] + LSTM_CAL, len(fu))


GB_FEATS = ["dow"] + YEAR_HOL


def m_gbm(tr, fu):
    """Direct model of y / level, the level being the mean of days t-147..t-91: known 91 days ahead, so every day of
    a 90-day forecast has it without seeing the forecast window."""
    from sklearn.ensemble import HistGradientBoostingRegressor
    s = tr.set_index("ds")["y"].astype(float)
    full = pd.concat([s, pd.Series(np.nan, index=pd.DatetimeIndex(fu.ds))])
    level = full.shift(91).rolling(56, min_periods=40).mean()
    t = tr.assign(level=level.loc[tr.ds].values).dropna(subset=["level"])
    t = t[t.ds >= t.ds.max() - pd.Timedelta(days=3 * 365)]
    mdl = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, max_leaf_nodes=31, random_state=0)
    mdl.fit(t[GB_FEATS].values.astype(float), (t.y / t.level).values)
    lv = level.loc[pd.DatetimeIndex(fu.ds)].values
    return mdl.predict(fu[GB_FEATS].values.astype(float)) * lv


MODELS = {
    **BASELINES("y"),
    "Prophet + weather": m_prophet_w,
    "Prophet (no weather)": m_prophet_nw,
    "Prophet + holidays": m_prophet_hol,
    "SARIMAX + weather": m_sarimax_w,
    "SARIMAX (no weather)": m_sarimax_nw,
    "Regression + ARIMA errors (weekly, yearly, holidays)": m_sarimax_yh,
    "Holt-Winters": m_hw,
    "Holt-Winters (damped)": lambda tr, fu: m_hw(tr, fu, damped=True),
    "Holt's Linear": m_holt,
    "LSTM + weather": m_lstm_w,
    "LSTM (no weather)": m_lstm_nw,
    "LSTM + calendar": m_lstm_cal,
    "Gradient boosting + calendar": m_gbm,
}
COMPLEXITY = {"Holt-Winters": 1, "Holt-Winters (damped)": 1, "Holt's Linear": 1, "Prophet (no weather)": 2,
              "Prophet + holidays": 2, "Prophet + weather": 3, "SARIMAX (no weather)": 2, "SARIMAX + weather": 3,
              "Regression + ARIMA errors (weekly, yearly, holidays)": 3, "Gradient boosting + calendar": 3, "LSTM (no weather)": 4,
              "LSTM + weather": 5, "LSTM + calendar": 4}

if __name__ == "__main__":
    origins = yearly_origins(df.ds, REAL_END_VOLUME)
    print(f"\nreal record to {REAL_END_VOLUME.date()}; {len(origins)} origins "
          f"{df.ds.iloc[origins[0]].date()} .. {df.ds.iloc[origins[-1]].date()}; 90-day horizon; {len(MODELS)} models")
    cache = WORK / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    res = run_study(df, "y", MODELS, 90, origins, known_cols=["dow"] + YEAR_HOL,
                    oracle_cols=WEATHER, score_end=REAL_END_VOLUME, ckpt=cache / "traffic_study.ckpt.json")
    res.to_csv(cache / "traffic_study.csv", index=False)
    (cache / "traffic_origins.json").write_text(json.dumps({i + 1: str(df.ds.iloc[c].date()) for i, c in enumerate(origins)}))
    sel = select_champion(res, complexity=COMPLEXITY)
    report(sel)
    (cache / "traffic_study.json").write_text(json.dumps(sel, indent=1, default=str))
    print("\nwritten: _work/cache/traffic_study.csv / .json / traffic_origins.json (nothing written to the database)")
