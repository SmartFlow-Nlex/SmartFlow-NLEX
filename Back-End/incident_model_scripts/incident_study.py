#!/usr/bin/env python3
"""
Daily incident counts: every candidate under EVALUATION_PROTOCOL.md (10 Nov 2026). Test-only: it reads the
database and writes only smartflow_scripts/_work/cache/incident_study_{series}.csv / .json. No table is written.

Two series, the same candidates, the same rules:
  blended   accidents + breakdowns (silver.nlex_accident_events_clean + silver.nlex_breakdown_events_clean)
  accident  accidents alone

What the protocol fixes (smartflow_scripts/3_training_testing/EVALUATION_PROTOCOL.md, common/rolling_eval.py):
  * Origins every 14 days across the 52 weeks before 2026-05-24 (yearly_origins). 2026-05-24 is the last day of REAL
    traffic volume; the volume-aware candidates need it, and every candidate is scored on the same days, so every
    model's score ends there. 2026-04-19 holds no incident rows at all (a data gap, not a zero) and is never scored.
  * Every model is refitted at every origin on the days before it and forecasts all 90 days the dashboard shows,
    the way it is served: recursive models feed their own forecasts back as lags, never actual counts.
  * Volume enters as the TRAFFIC study's own out-of-sample forecast from the same origin (its champion), never the
    actual volume of a day after the origin. The previous holdout handed every day its ACTUAL volume.
  * Weather after the origin is not known. A "+ weather" model is served only while a real 16-day weather forecast
    exists, so it is tested as served: days 1-14 from the weather model given the OBSERVED rain (an upper bound of a
    perfect forecast), days 15-90 from its weather-free twin.
  * Every candidate is offered the same calendar (weekday, yearly position, Philippine holidays and their
    neighbours, Holy Week, Christmas, All Saints) in a form it can use.
  * Baselines: last week, weekday average of 8 weeks, same day last year scaled (rolling_eval.BASELINES).
  * Score = MAE in incidents/day per bucket (1-14, 15-30, 31-60, 61-90), mean of buckets; WMAPE reported alongside.
    Champion by rolling_eval.select_champion(metric="mae") with a moving-block bootstrap over origins.

Candidates, declared before the run (none chosen by looking at results):
  As the system trains them, with their twins
    Poisson_GLM, NegBinomial_GLM, RandomForest, XGBoost, SARIMAX     each in four forms: "+ volume + weather" (the
        served form, named by the family alone), "(no weather)", "(no volume)", "(no volume, no weather)". Inputs: the
        trainer's lags (1, 7, 14 days; 7/14/28-day means; same weekday last year; 5-day mean around it) + calendar,
        and where named, log volume and the 7-day volume ratio (traffic forecast) and daily rain (observed, days 1-14).
    LSTM, GRU                     univariate 14-day window, 16 units, as train_incident_models.py built them
  Fair versions (feature parity)
    LSTM + calendar, GRU + calendar   the same nets, each step also carrying the next day's calendar
    MSTL_ARIMA, MSTL_ARIMA + holidays weekly + yearly MSTL, ARIMA(1,1,1) on the rest (+ holiday regressors)
    Stacked_LSTM (four forms as above) the 23 Oct design: 2 x LSTM over 56 days + the target day's known inputs
  Fixes made in the candidates' favour (each was a handicap, not a choice): SARIMAX has an intercept (without one its
  90-day forecast decays towards zero) and gets volume_ratio_7 as the others do; the GLMs get weekday dummies (a GLM
  cannot use a 0-6 weekday number); a known gap day is filled, as an INPUT only, from the same weekday of the four
  weeks before it and is never a training target.

Usage (from this folder):
  python -u incident_study.py --series both                       full study (about 1-2 h on this laptop)
  python -u incident_study.py --series blended --origins 1,26     smoke test on two origins (separate output files)
  python -u incident_study.py --vol-source dev ...                development only: volume from the older
                                                                  compare_all_horizons.csv (Prophet_nw)
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import subprocess
import sys
import time
import warnings
from datetime import datetime, timedelta
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SCRIPTS = REPO / "smartflow_scripts"
TT = SCRIPTS / "3_training_testing"
CACHE = SCRIPTS / "_work" / "cache"
for _p in (str(HERE), str(TT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from common.rolling_eval import (BASELINES, DAILY_BUCKETS, REAL_END_VOLUME, calendar_frame,  # noqa: E402
                                 is_baseline, load_holidays, report, run_study, select_champion, summarize,
                                 yearly_origins)

# train_incident_models.py keeps the SQL, the connection and the list of known gap days; this module adds the
# protocol on top. When the trainer itself is the running script it registers itself under its module name before
# importing this file, so the two share one copy.
import train_incident_models as tim  # noqa: E402

warnings.filterwarnings("ignore")

SERIES = ("blended", "accident")
HORIZON = 90
SCORE_END = REAL_END_VOLUME                       # 2026-05-24: last day of real traffic volume
GAP_DAYS = sorted(pd.Timestamp(d) for d in tim.EVAL_EXCLUDED_DAYS)   # no incident rows at all (a gap, not a zero)
WEATHER_DAYS = 14                                 # protocol: observed weather for days 1-14 only (upper bound)
TRAIN_WARMUP = 366                                # same-weekday-last-year inputs need a year of history first
SEQ_LEN = 14                                      # LSTM/GRU window, as built
STACK_SEQ = 56                                    # Stacked LSTM window, as built (23 Oct pilot)

CAL_TREE = ["dow", "is_weekend", "month", "doy_sin1", "doy_cos1", "doy_sin2", "doy_cos2", "doy_sin3", "doy_cos3",
            "is_holiday", "holiday_eve", "holiday_after", "holy_week", "xmas_season", "all_saints"]
CAL_GLM = ["dow_1", "dow_2", "dow_3", "dow_4", "dow_5", "dow_6"] + CAL_TREE[3:]
YEAR_HOL = CAL_TREE[3:]                            # yearly position + holidays (weekly handled per model)
HOL_COLS = ["is_holiday", "holiday_eve", "holiday_after", "holy_week", "xmas_season", "all_saints"]
KNOWN = CAL_TREE + ["dow_1", "dow_2", "dow_3", "dow_4", "dow_5", "dow_6", "dow_sin", "dow_cos"]
LAG_NAMES = ["lag_1", "lag_7", "lag_14", "roll_mean_7", "roll_mean_14", "roll_mean_28", "lag_364", "yoy_mean_5"]
VOL_NAMES = ["log_volume", "volume_ratio_7"]

FAMILIES = [("Poisson_GLM", "poisson", 1), ("NegBinomial_GLM", "negbin", 1), ("RandomForest", "rf", 3),
            ("XGBoost", "xgb", 3), ("SARIMAX", "sarimax", 2)]


def log(msg: str = "") -> None:
    print(msg, flush=True)


def variant_name(family: str, vol: bool, wx: bool) -> str:
    """The family name alone is the served form (volume + weather), matching the dashboard's primary column."""
    if vol and wx:
        return family
    if vol:
        return f"{family} (no weather)"
    if wx:
        return f"{family} (no volume)"
    return f"{family} (no volume, no weather)"


def parse_variant(name: str) -> tuple[str, bool, bool]:
    """(family, uses_volume, uses_weather) for any candidate name; baselines and univariate nets use neither."""
    for suffix, vol, wx in ((" (no volume, no weather)", False, False), (" (no weather)", True, False),
                            (" (no volume)", False, True)):
        if name.endswith(suffix):
            return name[: -len(suffix)], vol, wx
    if name in {f for f, _, _ in FAMILIES} or name == "Stacked_LSTM":
        return name, True, True
    return name, False, False


def weather_free_twin(name: str) -> str:
    """What a weather-aware candidate serves on days no real weather forecast covers."""
    fam, vol, wx = parse_variant(name)
    return variant_name(fam, vol, False) if wx else name


# ─── Data ────────────────────────────────────────────────────────────────────

def connect():
    conn = tim.get_conn()
    conn.set_session(readonly=True)   # nothing in this study writes; the session says so
    return conn


def load_frame(conn, series: str, extend_to: str = "2026-12-31") -> tuple[pd.DataFrame, pd.DataFrame]:
    """One row per day from the first incident day to `extend_to`.

    y        daily count; 0 on a day with no event row (as the trainer counts), NaN on the known gap days; NaN after
             the last recorded day (calendar rows only, so a forecast can reach past the record)
    rain_mm  corridor rain per Manila day: hourly corridor average (one value per coordinate per hour) summed over
             the day (DAILY_RAIN_SQL, the 5 Nov 2026 fix)
    volume   daily corridor entries; NaN after 2026-05-24, where the record is broken or synthetic
    calendar calendar_frame() plus weekday dummies and the weekday as sin/cos
    """
    sql = tim.ACCIDENT_DAILY_COUNTS_SQL if series == "accident" else tim.DAILY_COUNTS_SQL
    c = pd.read_sql(sql, conn)
    c["d"] = pd.to_datetime(c["d"])
    last = c["d"].max()
    ds = pd.date_range(c["d"].min(), max(last, pd.Timestamp(extend_to)), freq="D")
    df = pd.DataFrame({"ds": ds}).merge(c.rename(columns={"d": "ds", "total": "y"}), on="ds", how="left")
    df.loc[df.ds <= last, "y"] = df.loc[df.ds <= last, "y"].fillna(0.0)
    df.loc[df.ds.isin(GAP_DAYS), "y"] = np.nan
    rain = pd.read_sql(tim.DAILY_RAIN_SQL, conn)
    rain["d"] = pd.to_datetime(rain["d"])
    df = df.merge(rain.rename(columns={"d": "ds"}), on="ds", how="left")
    df.loc[df.ds <= last, "rain_mm"] = df.loc[df.ds <= last, "rain_mm"].fillna(0.0)
    vol = pd.read_sql(tim.DAILY_VOLUME_SQL, conn)
    vol["d"] = pd.to_datetime(vol["d"])
    df = df.merge(vol.rename(columns={"d": "ds"}), on="ds", how="left")
    df.loc[df.ds > REAL_END_VOLUME, "volume"] = np.nan
    hol = load_holidays(conn)
    df = df.merge(calendar_frame(df.ds, hol), on="ds")
    df["is_weekend"] = (df.dow >= 5).astype(int)
    df["month"] = df.ds.dt.month
    for k in range(1, 7):
        df[f"dow_{k}"] = (df.dow == k).astype(int)
    df["dow_sin"], df["dow_cos"] = np.sin(2 * np.pi * df.dow / 7), np.cos(2 * np.pi * df.dow / 7)
    df.attrs["last_incident_day"] = last
    df.attrs["series"] = series
    return df, hol


def fingerprint(df: pd.DataFrame) -> dict:
    """What the study was run on, so the trainer can refuse a study made from different data."""
    last = df.attrs["last_incident_day"]
    real = df[df.ds <= last]
    sc = real[real.ds <= SCORE_END]
    return {"series": df.attrs["series"], "first_day": str(real.ds.min().date()), "last_day": str(last.date()),
            "days": int(len(real)), "events_total": float(np.nansum(real.y)),
            "events_to_score_end": float(np.nansum(sc.y)), "gap_days": [str(d.date()) for d in GAP_DAYS],
            "volume_last_real_day": str(REAL_END_VOLUME.date()),
            "volume_sum_to_score_end": float(np.nansum(sc.volume)),
            "rain_sum_to_score_end": round(float(np.nansum(sc.rain_mm)), 3)}


# ─── Volume forecasts (the traffic study's champion, from the same origin) ──────

class VolumeForecasts:
    """Daily corridor volume after an origin, as the traffic model forecast it from that origin.

    Keyed by the first forecast day. In the study each key is an incident origin; for the served forecast it is the
    day after the incident record ends, and the series covers every day from the last real volume day onward.
    """

    def __init__(self):
        self.by_start: dict[pd.Timestamp, pd.Series] = {}
        self.info: dict = {}

    def series(self, start) -> pd.Series:
        start = pd.Timestamp(start)
        if start not in self.by_start:
            raise KeyError(f"no traffic forecast registered for a forecast starting {start.date()}")
        return self.by_start[start]

    def register(self, start, s: pd.Series) -> None:
        self.by_start[pd.Timestamp(start)] = s.astype(float)

    def load_study_csv(self, csv: Path, model: str, source: str) -> None:
        """Rows of a rolling-origin study file (origin, model, h, date, actual, forecast). The traffic study keeps only
        scored days (<= 2026-05-24); later days of the last origins are never scored here either, and get the
        forecast's own last stored week repeated, so a recursion past them has a finite input."""
        t = pd.read_csv(csv, parse_dates=["date"])
        t = t[t.model == model].copy()
        if t.empty:
            raise SystemExit(f"{csv.name} holds no rows for model {model!r}")
        t["start"] = t["date"] - pd.to_timedelta(t["h"] - 1, unit="D")
        filled = 0
        for start, g in t.groupby("start"):
            s = g.set_index("date")["forecast"].sort_index()
            full = pd.date_range(start, periods=HORIZON, freq="D")
            s = s.reindex(full)
            for i, d in enumerate(full):
                if not np.isfinite(s.iloc[i]):
                    k = 7
                    while i - k >= 0 and not np.isfinite(s.iloc[i - k]):
                        k += 7
                    if i - k < 0 or d <= SCORE_END:
                        raise SystemExit(f"traffic forecast from {start.date()} lacks {d.date()} (needed for scoring)")
                    s.iloc[i] = s.iloc[i - k]
                    filled += 1
            self.register(start, s)
        self.info = {"source": source, "file": str(csv.name), "model": model, "origins": len(self.by_start),
                     "days_filled_after_score_end": int(filled)}


def git_commit() -> str | None:
    try:
        sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True,
                             timeout=10).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "--", str(HERE.relative_to(REPO))], cwd=REPO,
                               capture_output=True, text=True, timeout=20).stdout.strip()
        return (sha + ("+uncommitted" if dirty else "")) or None
    except Exception:  # noqa: BLE001
        return None


def traffic_champion_forecast(start, end, train_end=REAL_END_VOLUME, champion: str | None = None) -> tuple[pd.Series, str]:
    """The traffic study's champion, refitted on the real traffic record up to train_end, forecasting start..end.
    This is what the protocol serves for traffic (section 7), so the served incident forecast reads the same thing
    its volume input was tested with. Imported lazily: traffic_study loads its own data when imported."""
    sel_path = CACHE / "traffic_study.json"
    if champion is None:
        if not sel_path.exists():
            raise SystemExit("traffic_study.json not found: run traffic_volume/traffic_study.py first")
        champion = json.loads(sel_path.read_text())["champion"]
    tdir = str(TT / "traffic_volume")
    if tdir not in sys.path:
        sys.path.insert(0, tdir)
    with contextlib.redirect_stdout(io.StringIO()):
        import traffic_study as ts  # noqa: E402
    start, end, train_end = pd.Timestamp(start), pd.Timestamp(end), pd.Timestamp(train_end)
    train = ts.df[ts.df.ds <= min(train_end, start - pd.Timedelta(days=1))].reset_index(drop=True)
    dates = pd.date_range(start, end, freq="D")
    fut = calendar_frame(dates, ts.HOL)
    wx = pd.DataFrame({"ds": dates}).merge(ts.df[["ds"] + ts.WEATHER], on="ds", how="left")
    for c in ts.WEATHER:
        fut[c] = [wx[c].iloc[i] if i < WEATHER_DAYS else np.nan for i in range(len(dates))]
    with contextlib.redirect_stdout(io.StringIO()):
        yh = np.asarray(ts.MODELS[champion](train, fut.copy()), dtype=float)
    if yh.shape != (len(dates),) or not np.isfinite(yh).all():
        raise SystemExit(f"traffic champion {champion} gave no finite forecast for {start.date()}..{end.date()}")
    return pd.Series(yh, index=dates), champion


VOL = VolumeForecasts()


# ─── One origin's timeline ───────────────────────────────────────────────────

def _y_input(y: np.ndarray) -> np.ndarray:
    """The count as an INPUT: a gap day takes the mean of the same weekday over the four weeks before it (earlier
    days only, nothing after the gap leaks in). It is never a training target."""
    out = np.asarray(y, dtype=float).copy()
    for i in np.where(~np.isfinite(out))[0]:
        prev = [out[i - 7 * k] for k in range(1, 5) if i - 7 * k >= 0 and np.isfinite(out[i - 7 * k])]
        out[i] = float(np.mean(prev)) if prev else (float(np.nanmean(out[:i])) if i else 0.0)
    return out


class TL:
    """Training rows followed by the forecast days, as arrays indexed by position."""

    def __init__(self, train: pd.DataFrame, future: pd.DataFrame, need_vol: bool):
        self.n, self.H = len(train), len(future)
        self.ds = pd.DatetimeIndex(list(train.ds) + list(future.ds))
        self.origin = pd.Timestamp(future.ds.iloc[0])
        yt = train.y.values.astype(float)
        self.y_target = np.concatenate([yt, np.full(self.H, np.nan)])
        self.y = np.concatenate([_y_input(yt), np.full(self.H, np.nan)])
        self.cal = pd.concat([train[KNOWN], future[KNOWN]], ignore_index=True).astype(float)
        fr = future["rain_mm"].values.astype(float) if "rain_mm" in future else np.full(self.H, np.nan)
        self.rain = np.concatenate([train.rain_mm.values.astype(float), fr])
        self.vol_obs = np.concatenate([train.volume.values.astype(float), np.full(self.H, np.nan)])
        self.vol = None
        if need_vol:
            fc = VOL.series(self.origin)
            v = self.vol_obs.copy()
            miss = ~np.isfinite(v)
            v[miss] = fc.reindex(self.ds[miss]).values
            if not np.isfinite(v[self.n - 6:]).all():
                raise ValueError(f"no traffic forecast for some day after {self.origin.date()}")
            self.vol = v
        first = train.ds.iloc[0] + pd.Timedelta(days=TRAIN_WARMUP)
        self.p0 = int(np.searchsorted(self.ds.values, np.datetime64(first)))
        self.cap = 5.0 * float(np.nanmax(yt))   # keeps one exploding model from voiding an origin for everyone

    def obs_vol_ok(self, idx: np.ndarray) -> np.ndarray:
        """True where the day and the six before it have OBSERVED volume (a training row may not rest on a forecast)."""
        ok = np.isfinite(self.vol_obs)
        c = np.concatenate([[0], np.cumsum(~ok)])
        return (c[idx + 1] - c[idx - 6]) == 0


def _lagX(y: np.ndarray, idx: np.ndarray) -> np.ndarray:
    """The trainer's lag block for each position: lag 1/7/14, means of the last 7/14/28 days, the same weekday 364
    days earlier and the 5-day mean around it (days t-366..t-362)."""
    c = np.concatenate([[0.0], np.cumsum(y[: int(idx.max())])])

    def m(a, b):
        return (c[b] - c[a]) / (b - a)
    return np.column_stack([y[idx - 1], y[idx - 7], y[idx - 14], m(idx - 7, idx), m(idx - 14, idx),
                            m(idx - 28, idx), y[idx - 364], m(idx - 366, idx - 361)])


def _volX(v: np.ndarray, idx: np.ndarray) -> np.ndarray:
    m7 = np.array([np.mean(v[i - 6:i + 1]) for i in idx])
    return np.column_stack([np.log(np.clip(v[idx], 1.0, None)), v[idx] / np.clip(m7, 1.0, None)])


def _design(tl: TL, idx: np.ndarray, kind: str, vol: bool, wx: bool, vol_arr=None) -> np.ndarray:
    cols = CAL_GLM if kind in ("poisson", "negbin") else CAL_TREE
    parts = [_lagX(tl.y, idx), tl.cal[cols].values[idx]]
    if wx:
        parts.append(tl.rain[idx][:, None])
    if vol:
        parts.append(_volX(tl.vol_obs if vol_arr is None else vol_arr, idx))
    return np.column_stack(parts)


def feature_names(kind: str, vol: bool, wx: bool) -> list[str]:
    return LAG_NAMES + (CAL_GLM if kind in ("poisson", "negbin") else CAL_TREE) + (["rain_mm"] if wx else []) + \
        (VOL_NAMES if vol else [])


def _train_idx(tl: TL, start: int, vol: bool) -> np.ndarray:
    idx = np.arange(max(start, 366), tl.n)
    idx = idx[np.isfinite(tl.y_target[idx])]
    if vol:
        idx = idx[tl.obs_vol_ok(idx)]
    return idx


# ─── Tabular candidates (GLMs, trees), recursive ─────────────────────────────

def _fit_tabular(kind: str, X: np.ndarray, y: np.ndarray):
    import statsmodels.api as sm
    if kind == "poisson":
        res = sm.GLM(y, np.column_stack([np.ones(len(X)), X]), family=sm.families.Poisson()).fit()
        b = np.asarray(res.params)
        return lambda x: np.exp(np.clip(b[0] + x @ b[1:], -30, 30)), res
    if kind == "negbin":
        from statsmodels.discrete.discrete_model import NegativeBinomial
        Xc = np.column_stack([np.ones(len(X)), X])
        res = NegativeBinomial(y, Xc).fit(disp=0, maxiter=200)
        if not (res.mle_retvals.get("converged", True) and np.isfinite(res.params).all()):
            res = NegativeBinomial(y, Xc).fit(disp=0, maxiter=2000, method="nm", start_params=res.params)
            res = NegativeBinomial(y, Xc).fit(disp=0, maxiter=500, start_params=res.params)
        if not np.isfinite(res.params).all():
            raise ValueError("negative binomial fit did not converge")
        b = np.asarray(res.params)[:-1]    # last parameter is alpha
        return lambda x: np.exp(np.clip(b[0] + x @ b[1:], -30, 30)), res
    if kind == "rf":
        from sklearn.ensemble import RandomForestRegressor
        m = RandomForestRegressor(n_estimators=300, max_depth=8, random_state=42, n_jobs=2).fit(X, y)
        m.n_jobs = 1                       # one row at a time in the recursion: threads only add overhead
        return m.predict, m
    if kind == "xgb":
        from xgboost import XGBRegressor
        m = XGBRegressor(n_estimators=200, max_depth=4, learning_rate=0.05, subsample=0.9, colsample_bytree=0.9,
                         random_state=42, n_jobs=2).fit(X, y)
        bst = m.get_booster()
        return lambda x: bst.inplace_predict(x), m
    raise ValueError(kind)


def tabular_forecast(kind, train, future, vol, wx, h, return_model=False):
    tl = TL(train, future, vol)
    idx = _train_idx(tl, tl.p0, vol)
    X = _design(tl, idx, kind, vol, wx)
    pred, model = _fit_tabular(kind, X, tl.y_target[idx])
    out = np.empty(h)
    for i in range(h):
        t = tl.n + i
        x = _design(tl, np.array([t]), kind, vol, wx, vol_arr=tl.vol)
        if not np.isfinite(x).all():
            raise ValueError("a forecast day lacks an input (weather beyond the observed days, or volume)")
        p = float(np.clip(np.asarray(pred(x), dtype=float)[0], 0.0, tl.cap))
        tl.y[t] = p
        out[i] = p
    if return_model:
        return out, model, feature_names(kind, vol, wx)
    return out


# ─── SARIMAX ─────────────────────────────────────────────────────────────────

SARIMAX_CAL = ["is_weekend"] + YEAR_HOL


def _sarimax_exog(tl: TL, idx: np.ndarray, vol: bool, wx: bool, vol_arr) -> np.ndarray:
    parts = [tl.cal[SARIMAX_CAL].values[idx]]
    if wx:
        parts.append(tl.rain[idx][:, None])
    if vol:
        parts.append(_volX(vol_arr, idx))
    return np.column_stack(parts)


def sarimax_forecast(train, future, vol, wx, h):
    """The trainer's SARIMAX(1,0,1)(1,0,1,7), now with an intercept and every known input as exog (weekend, yearly
    harmonics, holidays; the volume level AND its 7-day ratio when it uses volume; rain when it uses weather). It is
    fitted on the days whose volume is observed and then filtered (parameters fixed) through any later days before
    forecasting, so the forecast starts from the last recorded count."""
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    tl = TL(train, future, vol)
    idx = np.arange(tl.p0, tl.n)
    fit_idx = idx
    if vol:
        ok = tl.obs_vol_ok(idx)
        last_ok = int(idx[ok].max())
        fit_idx = idx[idx <= last_ok]
    va = tl.vol if vol else None
    y = tl.y_target
    ex_fit = _sarimax_exog(tl, fit_idx, vol, wx, tl.vol_obs)
    mod = SARIMAX(y[fit_idx], exog=ex_fit, order=(1, 0, 1), seasonal_order=(1, 0, 1, 7), trend="c",
                  enforce_stationarity=False, enforce_invertibility=False)
    res = mod.fit(disp=False)
    tail = idx[idx > fit_idx[-1]]
    if len(tail):
        res = res.append(y[tail], exog=_sarimax_exog(tl, tail, vol, wx, va), refit=False)
    fidx = np.arange(tl.n, tl.n + h)
    ex_f = _sarimax_exog(tl, fidx, vol, wx, va)
    if not np.isfinite(ex_f).all():
        raise ValueError("SARIMAX forecast inputs missing (weather beyond the observed days?)")
    fc = np.asarray(res.forecast(steps=h, exog=ex_f), dtype=float)
    return np.clip(fc, 0.0, tl.cap)


# ─── MSTL + ARIMA ────────────────────────────────────────────────────────────

def mstl_forecast(train, future, h, holidays=False):
    """MSTL (weekly + yearly) on the training days, the seasonal shapes carried forward (7 and 365 days back),
    ARIMA(1,1,1) on what is left; with holidays=True the ARIMA also takes the holiday flags as regressors."""
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.seasonal import MSTL
    tl = TL(train, future, False)
    sl = slice(tl.p0, tl.n)
    y = tl.y[sl]
    seas = np.asarray(MSTL(y, periods=(7, 365)).fit().seasonal)
    m = len(y)
    weekly, yearly = np.empty(m + h), np.empty(m + h)
    weekly[:m], yearly[:m] = seas[:, 0], seas[:, 1]
    for i in range(m, m + h):
        weekly[i], yearly[i] = weekly[i - 7], yearly[i - 365]
    rest = tl.y_target[sl] - weekly[:m] - yearly[:m]          # NaN on a gap day: ARIMA treats it as missing
    ex = tl.cal[HOL_COLS].values[tl.p0:tl.n] if holidays else None
    exf = tl.cal[HOL_COLS].values[tl.n:tl.n + h] if holidays else None
    res = ARIMA(rest, exog=ex, order=(1, 1, 1)).fit()
    fc = np.asarray(res.forecast(h, exog=exf), dtype=float) + weekly[m:] + yearly[m:]
    return np.clip(fc, 0.0, tl.cap)


# ─── Neural nets ─────────────────────────────────────────────────────────────

_TF_READY = False
TF_THREADS = 2          # the trainer sets 1 for its served refit (bit-for-bit reruns)
# Several training steps per graph call: the same batches and updates in the same order, without Keras's per-step
# Python overhead, which dominated these small nets (an LSTM(16) fit took 60-150 s at one step per call).
STEPS_PER_EXECUTION = 32


def tf_setup(threads: int | None = None) -> None:
    """Import TensorFlow on first use with deterministic ops and a fixed thread count (set before any op runs)."""
    global _TF_READY
    if _TF_READY:
        return
    import tensorflow as tf
    try:
        tf.config.threading.set_inter_op_parallelism_threads(1)
        tf.config.threading.set_intra_op_parallelism_threads(int(threads or TF_THREADS))
    except RuntimeError:
        pass
    tf.config.experimental.enable_op_determinism()
    _TF_READY = True


def _keras_reset():
    tf_setup()
    import tensorflow as tf
    tf.keras.backend.clear_session()
    tim.set_all_seeds()


RNN_CAL = ["dow_sin", "dow_cos", "doy_sin1", "doy_cos1", "is_holiday", "holiday_eve", "holiday_after", "holy_week",
           "xmas_season", "all_saints"]


def rnn_forecast(kind: str, train, future, h, calendar=False):
    """kind LSTM/GRU, 16 units over a 14-day window, MinMax-scaled on the training days, 30 epochs with early
    stopping (as train_incident_models.py built them), forecasting recursively. calendar=True: every step also
    carries the calendar of the day after it, so the last step tells the net which day it is predicting."""
    from tensorflow.keras.callbacks import EarlyStopping
    from tensorflow.keras.layers import GRU, LSTM, Dense, Input
    from tensorflow.keras.models import Sequential
    _keras_reset()
    tl = TL(train, future, False)
    lo, hi = float(np.min(tl.y[tl.p0:tl.n])), float(np.max(tl.y[tl.p0:tl.n]))
    span = max(hi - lo, 1e-6)
    z = (tl.y - lo) / span
    N = tl.n + h
    if calendar:
        nxt = np.vstack([tl.cal[RNN_CAL].values[1:N], np.zeros((1, len(RNN_CAL)))])
        F = lambda: np.column_stack([z[:N], nxt])          # noqa: E731
    else:
        F = lambda: z[:N, None]                            # noqa: E731
    feats = F()
    tgt = np.arange(tl.p0 + SEQ_LEN, tl.n)
    tgt = tgt[np.isfinite(tl.y_target[tgt])]
    X = np.stack([feats[t - SEQ_LEN:t] for t in tgt]).astype("float32")
    Y = z[tgt].astype("float32")
    layer = LSTM if kind == "LSTM" else GRU
    m = Sequential([Input((SEQ_LEN, feats.shape[1])), layer(16), Dense(1)])
    m.compile(optimizer="adam", loss="mse", steps_per_execution=STEPS_PER_EXECUTION)
    m.fit(X, Y, epochs=30, batch_size=32, verbose=0, validation_split=0.1,
          callbacks=[EarlyStopping(patience=5, restore_best_weights=True)])
    out = np.empty(h)
    for i in range(h):
        t = tl.n + i
        w = (np.column_stack([z[t - SEQ_LEN:t], nxt[t - SEQ_LEN:t]]) if calendar else z[t - SEQ_LEN:t, None])
        pz = float(m(w[None].astype("float32"), training=False).numpy()[0, 0])
        p = float(np.clip(pz * span + lo, 0.0, tl.cap))
        z[t] = (p - lo) / span
        out[i] = p
    return out


STACK_STAT_CAL = ["is_weekend", "is_holiday", "holiday_eve", "holiday_after", "holy_week", "xmas_season",
                  "all_saints", "doy_sin1", "doy_cos1", "doy_sin2", "doy_cos2"]


def stacked_lstm_forecast(train, future, h, vol, wx):
    """Two stacked LSTM layers (64 -> 32) over the last 56 days (count, holiday, weekday) joined with what is known
    about the day being forecast (calendar, the same weekday a year ago and the 5-day mean around it, and the volume
    and/or rain where this form uses them); 60 epochs with early stopping, as built on 23 Oct. Recursive."""
    from tensorflow.keras import Model, layers
    from tensorflow.keras.callbacks import EarlyStopping
    _keras_reset()
    tl = TL(train, future, vol)
    N = tl.n + h
    lo, hi = float(np.min(tl.y[tl.p0:tl.n])), float(np.max(tl.y[tl.p0:tl.n]))
    span = max(hi - lo, 1e-6)
    z = (tl.y - lo) / span
    cal = tl.cal
    seq_extra = np.column_stack([cal["is_holiday"].values, cal["dow_sin"].values, cal["dow_cos"].values])[:N]
    tgt = np.arange(max(tl.p0 + STACK_SEQ, 366), tl.n)
    tgt = tgt[np.isfinite(tl.y_target[tgt])]
    if vol:
        tgt = tgt[tl.obs_vol_ok(tgt)]
    # standardisers from the training rows only
    stats = {}
    if wx:
        r = tl.rain[tgt]
        stats["rain"] = (float(np.mean(r)), float(np.std(r)) or 1.0)
    if vol:
        vx = _volX(tl.vol_obs, tgt)
        stats["vol"] = (vx.mean(axis=0), np.where(vx.std(axis=0) > 0, vx.std(axis=0), 1.0))

    def stat(idx, vol_arr):
        lag = _lagX(tl.y, idx)[:, 6:8]                       # lag_364, yoy_mean_5
        parts = [cal[STACK_STAT_CAL].values[idx], (lag - lo) / span]
        if wx:
            parts.append(((tl.rain[idx] - stats["rain"][0]) / stats["rain"][1])[:, None])
        if vol:
            parts.append((_volX(vol_arr, idx) - stats["vol"][0]) / stats["vol"][1])
        parts.append(cal[["dow_sin", "dow_cos"]].values[idx])
        return np.column_stack(parts).astype("float32")

    def seq(t):
        return np.column_stack([z[t - STACK_SEQ:t], seq_extra[t - STACK_SEQ:t]]).astype("float32")

    Xs = np.stack([seq(t) for t in tgt])
    Xt = stat(tgt, tl.vol_obs)
    Y = z[tgt].astype("float32")
    a = layers.Input((STACK_SEQ, Xs.shape[2]))
    b = layers.Input((Xt.shape[1],))
    x = layers.LSTM(64, return_sequences=True)(a)
    x = layers.Dropout(0.2)(x)
    x = layers.LSTM(32)(x)
    x = layers.Concatenate()([x, b])
    x = layers.Dense(32, activation="relu")(x)
    m = Model([a, b], layers.Dense(1)(x))
    m.compile(optimizer="adam", loss="mse", steps_per_execution=STEPS_PER_EXECUTION)
    m.fit([Xs, Xt], Y, epochs=60, batch_size=32, verbose=0, validation_split=0.1,
          callbacks=[EarlyStopping(patience=6, restore_best_weights=True)])
    out = np.empty(h)
    for i in range(h):
        t = tl.n + i
        st = stat(np.array([t]), tl.vol)
        if not np.isfinite(st).all():
            raise ValueError("Stacked LSTM inputs missing for a forecast day")
        pz = float(m([seq(t)[None], st], training=False).numpy()[0, 0])
        p = float(np.clip(pz * span + lo, 0.0, tl.cap))
        z[t] = (p - lo) / span
        out[i] = p
    return out


# ─── Registry ────────────────────────────────────────────────────────────────

_cache: dict = {}
TIMING: dict[str, float] = {}


def cached(key, future, fn):
    """Per-origin cache, so a "+ weather" model reuses its weather-free twin's forecast instead of refitting it."""
    k = (key, str(pd.Timestamp(future.ds.iloc[0]).date()), len(future))
    if k not in _cache:
        if len(_cache) > 60:
            _cache.clear()
        _cache[k] = fn()
    return _cache[k]


def _check_weather(fu):
    r = fu["rain_mm"].values[:WEATHER_DAYS] if "rain_mm" in fu else np.array([np.nan])
    if not np.isfinite(r).all():
        raise ValueError("weather-aware form called without observed weather for days 1-14")


def _family_fn(fam: str, kind: str, vol: bool, wx: bool):
    def base(tr, fu, use_wx, h):
        if kind == "sarimax":
            return sarimax_forecast(tr, fu, vol, use_wx, h)
        return tabular_forecast(kind, tr, fu, vol, use_wx, h)

    def fn(tr, fu):
        twin = cached((fam, vol, False), fu, lambda: base(tr, fu, False, len(fu)))
        if not wx:
            return twin
        _check_weather(fu)
        w = base(tr, fu, True, WEATHER_DAYS)
        return np.concatenate([w, twin[WEATHER_DAYS:]])
    return fn


def _stacked_fn(vol: bool, wx: bool):
    def fn(tr, fu):
        twin = cached(("Stacked_LSTM", vol, False), fu, lambda: stacked_lstm_forecast(tr, fu, len(fu), vol, False))
        if not wx:
            return twin
        _check_weather(fu)
        w = stacked_lstm_forecast(tr, fu, WEATHER_DAYS, vol, True)
        return np.concatenate([w, twin[WEATHER_DAYS:]])
    return fn


def _timed(name, fn):
    def g(tr, fu):
        t0 = time.time()
        try:
            return fn(tr, fu)
        finally:
            dt = time.time() - t0
            TIMING[name] = TIMING.get(name, 0.0) + dt
            if dt > 45:
                log(f"    ({name}: {dt:.0f}s)")
    return g


# Run as separate processes in parallel and merged on identical origins and days. "_vol" groups need the traffic
# study's forecasts; the others can run before it finishes.
GROUPS = ("stats", "stats_vol", "nets", "stacked", "stacked_vol")
REQUIRED_GROUPS = ("stats", "stats_vol", "nets")


def model_group(name: str) -> str:
    kind = "stacked" if name.startswith("Stacked_LSTM") else "nets" if any(k in name for k in ("LSTM", "GRU")) \
        else "stats"
    return kind + ("_vol" if parse_variant(name)[1] else "")


def build_models(stacked_forms: str = "all", group: str = "all") -> tuple[dict, dict]:
    """Every candidate and baseline, and complexity ranks (lower = simpler; wins a non-significant tie). Using
    another model's forecast (volume) or a weather feed counts as one step more complex. group 'stats' / 'nets'
    keeps the baselines plus one half, so the halves can run as parallel processes; each model's forecasts depend
    only on its own fit, so splitting the list changes no number."""
    M, C = _all_models(stacked_forms)
    keep = [k for k in M if group == "all" or is_baseline(k) or model_group(k) == group]
    return {k: _timed(k, M[k]) for k in keep}, {k: C[k] for k in keep if k in C}


def _all_models(stacked_forms: str) -> tuple[dict, dict]:
    M, C = dict(BASELINES("y")), {}
    for fam, kind, base in FAMILIES:
        for vol in (True, False):
            for wx in (True, False):
                n = variant_name(fam, vol, wx)
                M[n] = _family_fn(fam, kind, vol, wx)
                C[n] = base + int(vol) + int(wx)
    M["LSTM"] = lambda tr, fu: rnn_forecast("LSTM", tr, fu, len(fu))
    M["GRU"] = lambda tr, fu: rnn_forecast("GRU", tr, fu, len(fu))
    M["LSTM + calendar"] = lambda tr, fu: rnn_forecast("LSTM", tr, fu, len(fu), calendar=True)
    M["GRU + calendar"] = lambda tr, fu: rnn_forecast("GRU", tr, fu, len(fu), calendar=True)
    C.update({"LSTM": 4, "GRU": 4, "LSTM + calendar": 4, "GRU + calendar": 4})
    M["MSTL_ARIMA"] = lambda tr, fu: mstl_forecast(tr, fu, len(fu))
    M["MSTL_ARIMA + holidays"] = lambda tr, fu: mstl_forecast(tr, fu, len(fu), holidays=True)
    C.update({"MSTL_ARIMA": 2, "MSTL_ARIMA + holidays": 2})
    forms = [(True, True), (True, False), (False, True), (False, False)] if stacked_forms == "all" else \
        [(True, False), (False, False)]
    for vol, wx in forms:
        n = variant_name("Stacked_LSTM", vol, wx)
        M[n] = _stacked_fn(vol, wx)
        C[n] = 5 + int(vol) + int(wx)
    return M, C


# ─── Scores beyond the harness table ─────────────────────────────────────────

def bucket_detail(res: pd.DataFrame, buckets=DAILY_BUCKETS) -> dict:
    """Per model and bucket: n, MAE, RMSE, WMAPE, MAPE, R2, and the MAE relative to the seasonal-naive forecast made
    from the same origins on the same days (an out-of-sample MASE; < 1 beats it)."""
    r = res.copy()
    r["e"] = r.actual - r.forecast
    out: dict = {}
    naive = r[r.model == "Baseline: last week"].set_index(["origin", "h"])["e"].abs()
    for m, g0 in r.groupby("model"):
        d = {}
        for lo, hi in buckets:
            g = g0[(g0.h >= lo) & (g0.h <= hi)]
            if g.empty:
                continue
            ae = g.e.abs()
            sst = float(((g.actual - g.actual.mean()) ** 2).sum())
            nz = g.actual > 0
            nv = naive.reindex(list(zip(g.origin, g.h))).values
            d[f"d{lo}-{hi}"] = {
                "n": int(len(g)), "mae": float(ae.mean()), "rmse": float(np.sqrt((g.e ** 2).mean())),
                "wmape": float(ae.sum() / g.actual.sum() * 100), "mape": float((ae[nz] / g.actual[nz]).mean() * 100),
                "r2": float(1 - (g.e ** 2).sum() / sst) if sst > 0 else None,
                "mase_vs_last_week": float(ae.mean() / np.mean(nv)) if np.mean(nv) > 0 else None,
                "mean_actual": float(g.actual.mean()), "mean_forecast": float(g.forecast.mean()),
            }
        out[m] = d
    return out


def _prepare(series: str, vol_source: str, origin_pick: list[int] | None, need_vol: bool = True):
    conn = connect()
    try:
        df, _ = load_frame(conn, series)
    finally:
        conn.close()
    origins_all = yearly_origins(df.ds, SCORE_END)
    origin_dates = {i + 1: str(df.ds.iloc[c].date()) for i, c in enumerate(origins_all)}
    origins = [origins_all[i - 1] for i in origin_pick] if origin_pick else origins_all
    log(f"\n=== incident study: {series} ===  record {df.ds.iloc[0].date()}..{df.attrs['last_incident_day'].date()}; "
        f"scored to {SCORE_END.date()}; {len(origins)} of {len(origins_all)} origins "
        f"({df.ds.iloc[origins[0]].date()} .. {df.ds.iloc[origins[-1]].date()}); {HORIZON}-day horizon")
    VOL.by_start.clear()
    VOL.info = {}
    if not need_vol:
        VOL.info = {"source": "none: no model in this group reads volume"}
        return df, origin_dates, origins
    if vol_source == "study":
        sel_path, csv = CACHE / "traffic_study.json", CACHE / "traffic_study.csv"
        if not (sel_path.exists() and csv.exists()):
            raise SystemExit("traffic_study.csv/.json not found: run traffic_volume/traffic_study.py first "
                             "(or --vol-source dev for a development run)")
        tsel = json.loads(sel_path.read_text())
        VOL.load_study_csv(csv, tsel["champion"], "traffic_study")
        VOL.info["traffic_champion_is_baseline"] = bool(tsel.get("champion_is_baseline", False))
        tor = CACHE / "traffic_origins.json"
        if tor.exists():
            t_or = {int(k): v for k, v in json.loads(tor.read_text()).items()}
            if t_or != origin_dates:
                raise SystemExit("traffic study origins differ from the incident origins; the volume input would not "
                                 "come from the same origin")
    elif vol_source == "dev":
        VOL.load_study_csv(CACHE / "compare_all_horizons.csv", "Prophet_nw", "compare_all_horizons (development)")
    else:
        raise SystemExit(f"unknown --vol-source {vol_source}")
    missing = [origin_dates[i + 1] for i, c in enumerate(origins_all) if c in origins
               and pd.Timestamp(origin_dates[i + 1]) not in VOL.by_start]
    if missing:
        raise SystemExit(f"no traffic forecast for incident origins {missing}")
    log(f"  volume input: {VOL.info}")
    return df, origin_dates, origins


def run(series: str, vol_source: str, origin_pick: list[int] | None, threads: int, stacked_forms: str,
        tag: str = "", group: str = "all") -> dict:
    """Run the study (or one group of it) for one series. A group run writes ..._{group}.csv/.json for merge()."""
    global TF_THREADS
    TF_THREADS = threads
    t_start = time.time()
    df, origin_dates, origins = _prepare(series, vol_source, origin_pick,
                                         need_vol=group == "all" or group.endswith("_vol"))
    models, complexity = build_models(stacked_forms, group)
    log(f"  {len(models)} models ({group}): {', '.join(models)}")
    TIMING.clear()
    _cache.clear()
    CACHE.mkdir(parents=True, exist_ok=True)
    stem = CACHE / (f"incident_study_{series}{tag}" + ("" if group == "all" else f"_{group}"))
    res = run_study(df, "y", models, HORIZON, origins, known_cols=KNOWN, score_end=SCORE_END,
                    oracle_cols=["rain_mm"], oracle_days=WEATHER_DAYS, exclude_dates=GAP_DAYS,
                    ckpt=stem.with_suffix(".ckpt.json"), log=log)
    if origin_pick:
        # run_study numbers origins 1..k within the run; store the protocol's own origin numbers
        res["origin"] = res["origin"].map({k + 1: v for k, v in enumerate(origin_pick)})
    res.to_csv(stem.with_suffix(".csv"), index=False)
    meta = {
        "series": series, "created": datetime.now().isoformat(timespec="seconds"), "code_version": git_commit(),
        "protocol": "EVALUATION_PROTOCOL.md (10 Nov 2026)", "score_end": str(SCORE_END.date()), "horizon": HORIZON,
        "buckets": [f"d{lo}-{hi}" for lo, hi in DAILY_BUCKETS], "metric": "mae",
        "origins": {str(k): origin_dates[k] for k in (origin_pick or origin_dates)},
        "origins_complete": not origin_pick, "excluded_days": [str(d.date()) for d in GAP_DAYS],
        "volume_input": VOL.info,
        "weather": f"observed rain for days 1-{WEATHER_DAYS} (upper bound), weather-free twin after",
        "fingerprint": fingerprint(df), "complexity": complexity, "group": group,
        "seconds_by_model": {k: round(v, 1) for k, v in TIMING.items()},
        "minutes": round((time.time() - t_start) / 60, 1),
    }
    if group != "all":
        stem.with_suffix(".json").write_text(json.dumps(meta, indent=1, default=str))
        log(f"\n  written: {stem.name}.csv / .json ({meta['minutes']} min); merge with --merge when every group is done")
        return meta
    return finalize(res, meta, stem)


def finalize(res: pd.DataFrame, meta: dict, stem: Path) -> dict:
    sel = select_champion(res, metric="mae", complexity=meta["complexity"])
    report(sel, log=log)
    wm = summarize(res, metric="wmape")
    log("\n  WMAPE by horizon (same forecasts)")
    log("  " + f"{'model':<42}" + "".join(f"{c:>10}" for c in wm.columns))
    for m in wm.index:
        log("  " + f"{m:<42}" + "".join(f"{wm.loc[m, c]:>9.2f}%" for c in wm.columns))
    detail = bucket_detail(res)
    champ = sel["champion"]
    log(f"\n  champion {champ}: mean forecast vs actual per bucket: " + ", ".join(
        f"{b} {v['mean_forecast']:.1f} vs {v['mean_actual']:.1f}" for b, v in detail[champ].items()))
    out = {**meta, "champion": champ, "selection": sel, "wmape_table": wm.round(4).to_dict(orient="index"),
           "detail": detail}
    res.to_csv(stem.with_suffix(".csv"), index=False)
    stem.with_suffix(".json").write_text(json.dumps(out, indent=1, default=str))
    log(f"\n  written: _work/cache/{stem.name}.csv / .json (nothing written to the database)")
    slow = sorted(meta.get("seconds_by_model", {}).items(), key=lambda kv: -kv[1])[:8]
    log("  slowest: " + ", ".join(f"{k} {v:.0f}s" for k, v in slow))
    return out


def merge(series: str, tag: str = "") -> dict:
    """Join the group runs of one series into the study. They must share origins, data and volume input; an origin
    that any group dropped is dropped for every model (protocol section 2). The baselines run in every group and must
    agree exactly (a check that the groups saw the same data)."""
    have = [g for g in GROUPS if (CACHE / f"incident_study_{series}{tag}_{g}.json").exists()
            and (CACHE / f"incident_study_{series}{tag}_{g}.csv").exists()]
    missing = [g for g in REQUIRED_GROUPS if g not in have]
    if missing:
        raise SystemExit(f"missing group runs: {missing}")
    not_run = [g for g in GROUPS if g not in have]
    if not_run:
        log(f"  NOTE: groups not run, their candidates are absent from this study: {not_run}")
    parts = [CACHE / f"incident_study_{series}{tag}_{g}" for g in have]
    metas = [json.loads(p.with_suffix(".json").read_text()) for p in parts]
    for k in ("origins", "fingerprint", "origins_complete", "score_end", "horizon"):
        if any(m[k] != metas[0][k] for m in metas[1:]):
            raise SystemExit(f"group runs differ in {k}; re-run them on the same data")
    vol_metas = [m for m in metas if m["group"].endswith("_vol")]
    if any(m["volume_input"] != vol_metas[0]["volume_input"] for m in vol_metas[1:]):
        raise SystemExit("the volume-aware group runs read different traffic forecasts")
    frames = [pd.read_csv(p.with_suffix(".csv")) for p in parts]
    b0 = frames[0][frames[0].model.map(is_baseline)].set_index(["origin", "model", "h"]).forecast
    for f in frames[1:]:
        b = f[f.model.map(is_baseline)].set_index(["origin", "model", "h"]).forecast
        common_idx = b0.index.intersection(b.index)
        if len(common_idx) and float((b0[common_idx] - b[common_idx]).abs().max()) > 1e-9:
            raise SystemExit("the baselines differ between group runs: they did not see the same data")
    common = set.intersection(*[set(f.origin.unique()) for f in frames])
    dropped = sorted(set().union(*[set(f.origin.unique()) for f in frames]) - common)
    res = pd.concat([frames[0][frames[0].model.map(is_baseline)]] +
                    [f[~f.model.map(is_baseline)] for f in frames], ignore_index=True)
    res = res[res.origin.isin(common)].sort_values(["origin", "model", "h"]).reset_index(drop=True)
    meta = {**metas[0], "group": "merged: " + ", ".join(have), "groups_not_run": not_run,
            "candidates_not_run": [m for m in _all_models("all")[0] if model_group(m) in not_run and not is_baseline(m)],
            "created": max(m["created"] for m in metas),
            "volume_input": vol_metas[0]["volume_input"],
            "complexity": {k: v for m in metas for k, v in m["complexity"].items()},
            "seconds_by_model": {k: v for m in metas for k, v in m["seconds_by_model"].items()},
            "minutes": max(m["minutes"] for m in metas), "dropped_origins": [int(o) for o in dropped]}
    if dropped:
        log(f"  origins dropped by a group run, dropped for all: {dropped}")
    log(f"\n=== merged incident study: {series} ({len(common)} origins, {res.model.nunique()} models) ===")
    return finalize(res, meta, CACHE / f"incident_study_{series}{tag}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--series", choices=["blended", "accident", "both"], default="both")
    ap.add_argument("--origins", default="", help="comma-separated origin numbers (1-26) for a smoke test")
    ap.add_argument("--vol-source", choices=["study", "dev"], default="study")
    ap.add_argument("--tf-threads", type=int, default=2)
    ap.add_argument("--stacked-forms", choices=["all", "noweather"], default="all")
    ap.add_argument("--group", choices=["all"] + list(GROUPS), default="all",
                    help="run only the statistical/tree models or only the neural nets (parallel processes)")
    ap.add_argument("--merge", action="store_true", help="join finished --group runs into the study")
    a = ap.parse_args()
    pick = [int(x) for x in a.origins.split(",") if x.strip()] or None
    tag = ("_smoke" if pick else "") + ("_dev" if a.vol_source == "dev" else "")
    for s in (SERIES if a.series == "both" else [a.series]):
        if a.merge:
            merge(s, tag)
        else:
            run(s, a.vol_source, pick, a.tf_threads, a.stacked_forms, tag, a.group)


if __name__ == "__main__":
    main()
