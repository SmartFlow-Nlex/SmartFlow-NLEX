"""
Shared rolling-origin evaluation for every SmartFlow forecasting model (EVALUATION_PROTOCOL.md, 10 Nov 2026).

One harness, so every model group is tested the same way: the same origins across a full year of real data, the full
served horizon, the same baselines, the same buckets, the champion rule fixed in advance, and a moving-block bootstrap
for whether a lead is real. Trainers supply their candidate models as callables; nothing here writes to the database.

    from common.rolling_eval import (REAL_END_VOLUME, calendar_frame, load_holidays, yearly_origins,
                                      BASELINES, run_study, summarize, select_champion, report)

A model callable is   fn(train: DataFrame, future: DataFrame) -> array of len(future)
  train  : every row before the origin (all columns, including the target)
  future : the forecast days, with ONLY the columns the caller declared as known in advance (date, calendar, and
           for weather-aware models the observed weather of days 1-14 as the protocol's upper bound). The target is
           never in it.
"""
from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Callable, Iterable

import numpy as np
import pandas as pd

# Last day of REAL traffic data (25 May - 30 Jun 2026 still holds broken/synthetic days; protocol section 1).
REAL_END_VOLUME = pd.Timestamp("2026-05-24")

DAILY_BUCKETS = [(1, 14), (15, 30), (31, 60), (61, 90)]
SHORT_BUCKETS = [(1, 7), (8, 14), (15, 30)]


# ─── Calendar ────────────────────────────────────────────────────────────────

def load_holidays(conn) -> pd.DataFrame:
    """Philippine holidays (public.ph_holidays): date, name, type. Known in advance, so a legitimate input."""
    q = "SELECT date_day::date AS date, holiday_name AS name, holiday_type AS type FROM public.ph_holidays ORDER BY 1"
    h = pd.read_sql_query(q, conn) if hasattr(conn, "cursor") else conn
    h["date"] = pd.to_datetime(h["date"])
    return h


def calendar_frame(dates: Iterable, holidays: pd.DataFrame) -> pd.DataFrame:
    """Known-in-advance calendar features for any dates: weekday, yearly position, holidays and their neighbours,
    and the seasons NLEX is known to move with (Holy Week, Christmas to New Year, All Saints)."""
    d = pd.DatetimeIndex(pd.to_datetime(list(dates)))
    hol = set(holidays["date"].dt.normalize())
    names = holidays.groupby(holidays["date"].dt.normalize())["name"].agg(lambda s: " | ".join(map(str, s)))
    out = pd.DataFrame({"ds": d})
    out["dow"] = d.dayofweek
    doy = d.dayofyear
    for k in (1, 2, 3):
        out[f"doy_sin{k}"] = np.sin(2 * np.pi * k * doy / 365.25)
        out[f"doy_cos{k}"] = np.cos(2 * np.pi * k * doy / 365.25)
    out["is_holiday"] = [int(x in hol) for x in d]
    out["holiday_eve"] = [int((x + pd.Timedelta(days=1)) in hol and x not in hol) for x in d]
    out["holiday_after"] = [int((x - pd.Timedelta(days=1)) in hol and x not in hol) for x in d]
    lab = [names.get(x, "") for x in d]
    out["holy_week"] = [int(any(w in s.lower() for w in ("maundy", "good friday", "black saturday", "holy"))) for s in lab]
    md = d.strftime("%m-%d")
    out["xmas_season"] = [int(m >= "12-20" or m <= "01-02") for m in md]
    out["all_saints"] = [int(m in ("10-31", "11-01", "11-02")) for m in md]
    return out


# ─── Origins ─────────────────────────────────────────────────────────────────

def yearly_origins(dates: pd.Series, score_end: pd.Timestamp, step: int = 14, weeks: int = 52) -> list[int]:
    """Row positions where a forecast starts: every `step` days across the last `weeks` weeks before score_end.
    `dates` must be sorted, one row per day."""
    dates = pd.to_datetime(dates).reset_index(drop=True)
    last = int(np.searchsorted(dates.values, np.datetime64(score_end), side="right")) - 1
    first = last - weeks * 7 + 1
    return list(range(first, last - 13 + 1, step))


# ─── Baselines (protocol section 3) ──────────────────────────────────────────

def _series(train: pd.DataFrame, target: str) -> pd.Series:
    return train.set_index("ds")[target].astype(float)


def baseline_last_week(target: str) -> Callable:
    def f(train, future):
        s = _series(train, target)
        last = s.iloc[-7:].values
        return np.array([last[i % 7] for i in range(len(future))], dtype=float)
    return f


def baseline_weekday_avg(target: str, weeks: int = 8) -> Callable:
    def f(train, future):
        s = _series(train, target).iloc[-7 * weeks:]
        m = s.groupby(s.index.dayofweek).mean()
        return np.array([m.get(d.dayofweek, s.mean()) for d in pd.to_datetime(future["ds"])], dtype=float)
    return f


def baseline_last_year(target: str, weeks: int = 8) -> Callable:
    def f(train, future):
        s = _series(train, target)
        origin = pd.to_datetime(future["ds"]).iloc[0]
        recent = s[s.index >= origin - pd.Timedelta(days=7 * weeks)]
        ly = s[(s.index >= origin - pd.Timedelta(days=364 + 7 * weeks)) & (s.index < origin - pd.Timedelta(days=364))]
        k = recent.mean() / ly.mean() if len(ly) and ly.mean() > 0 else 1.0
        fallback = baseline_weekday_avg(target)(train, future)
        out = []
        for i, d in enumerate(pd.to_datetime(future["ds"])):
            v = s.get(d - pd.Timedelta(days=364))
            out.append(float(v) * k if v is not None and np.isfinite(v) else fallback[i])
        return np.array(out, dtype=float)
    return f


def BASELINES(target: str) -> dict[str, Callable]:
    return {
        "Baseline: last week": baseline_last_week(target),
        "Baseline: weekday average": baseline_weekday_avg(target),
        "Baseline: last year (scaled)": baseline_last_year(target),
    }


def is_baseline(name: str) -> bool:
    return name.startswith("Baseline:")


# ─── The study ───────────────────────────────────────────────────────────────

def run_study(df: pd.DataFrame, target: str, models: dict[str, Callable], horizon: int, origins: list[int],
              known_cols: list[str], score_end: pd.Timestamp, oracle_cols: list[str] | None = None,
              oracle_days: int = 14, exclude_dates: Iterable = (), ckpt: Path | None = None,
              log: Callable = print) -> pd.DataFrame:
    """Every model forecasts `horizon` days from every origin, refitted on the rows before it.

    Returns one row per (origin, model, h) for days that are scored (real, <= score_end, not excluded).
    `known_cols` reach the model for every future day; `oracle_cols` (observed weather) only for days 1..oracle_days,
    NaN after (protocol section 2). An origin where any model fails is dropped for all models.
    """
    df = df.sort_values("ds").reset_index(drop=True)
    excl = set(pd.to_datetime(list(exclude_dates)))
    rows, done = [], set()
    if ckpt and Path(ckpt).exists():
        ck = json.loads(Path(ckpt).read_text())
        if ck.get("origins") == origins and ck.get("models") == list(models) and ck.get("horizon") == horizon:
            rows, done = ck["rows"], set(ck["done"])
            log(f"  resuming: {len(done)} of {len(origins)} origins already done")
    for oi, cut in enumerate(origins, 1):
        if cut in done:
            continue
        t0 = time.time()
        train = df.iloc[:cut].copy()
        fut_full = df.iloc[cut:cut + horizon]
        start = df.ds.iloc[cut]
        dates = pd.date_range(start, periods=horizon, freq="D")
        future = pd.DataFrame({"ds": dates}).merge(df[["ds"] + known_cols], on="ds", how="left")
        if oracle_cols:
            ob = pd.DataFrame({"ds": dates}).merge(df[["ds"] + oracle_cols], on="ds", how="left")
            for c in oracle_cols:
                future[c] = [ob[c].iloc[i] if i < oracle_days else np.nan for i in range(horizon)]
        actual = df.set_index("ds")[target]
        got, failed = {}, []
        for name, fn in models.items():
            try:
                yh = np.asarray(fn(train, future.copy()), dtype=float)
                if yh.shape != (horizon,) or not np.isfinite(yh).all():
                    raise ValueError(f"bad forecast {yh.shape}")
                got[name] = yh
            except Exception as e:  # noqa: BLE001
                failed.append(f"{name}: {str(e)[:90]}")
        if failed:
            log(f"  origin {oi}/{len(origins)} DROPPED for all models ({'; '.join(failed)})")
        else:
            for name, yh in got.items():
                for i, d in enumerate(dates):
                    if d <= score_end and d in actual.index and d not in excl and np.isfinite(actual[d]):
                        rows.append([oi, name, i + 1, str(d.date()), float(actual[d]), float(yh[i])])
            log(f"  origin {oi}/{len(origins)} from {start.date()} ({time.time() - t0:.0f}s)")
        done.add(cut)
        if ckpt:
            Path(ckpt).write_text(json.dumps({"origins": origins, "models": list(models), "horizon": horizon,
                                               "rows": rows, "done": sorted(done)}))
    return pd.DataFrame(rows, columns=["origin", "model", "h", "date", "actual", "forecast"])


# ─── Scores, champion, uncertainty ───────────────────────────────────────────

def _bucket(h: pd.Series, buckets) -> pd.Series:
    lab = pd.Series(index=h.index, dtype=object)
    for lo, hi in buckets:
        lab[(h >= lo) & (h <= hi)] = f"d{lo}-{hi}"
    return lab


def _cells(res: pd.DataFrame, buckets) -> pd.DataFrame:
    """Per (model, origin, bucket): sum |error|, sum actual, n. Everything else is computed from these."""
    r = res.copy()
    r["bucket"] = _bucket(r.h, buckets)
    r = r.dropna(subset=["bucket"])
    r["ae"] = (r.actual - r.forecast).abs()
    return r.groupby(["model", "origin", "bucket"]).agg(ae=("ae", "sum"), act=("actual", "sum"), n=("ae", "size")).reset_index()


def _score(cells: pd.DataFrame, metric: str) -> pd.Series:
    g = cells.groupby(["model", "bucket"])[["ae", "act", "n"]].sum()
    return (g.ae / g.act * 100) if metric == "wmape" else (g.ae / g.n)


def summarize(res: pd.DataFrame, buckets=DAILY_BUCKETS, metric: str = "wmape") -> pd.DataFrame:
    """Model x bucket score table, plus 'score' = mean over buckets (protocol section 6.1)."""
    t = _score(_cells(res, buckets), metric).unstack("bucket")
    cols = [f"d{lo}-{hi}" for lo, hi in buckets if f"d{lo}-{hi}" in t.columns]
    t = t[cols]
    t["score"] = t[cols].mean(axis=1)
    return t.sort_values("score")


def _boot_diff(cells, a, b, buckets, metric, block, reps=2000, seed=7):
    origins = sorted(cells.origin.unique())
    k = len(origins)
    rng = np.random.default_rng(seed)
    ca = cells[cells.model == a].set_index(["origin", "bucket"])
    cb = cells[cells.model == b].set_index(["origin", "bucket"])
    labs = [f"d{lo}-{hi}" for lo, hi in buckets]
    diffs = []
    nb = math.ceil(k / block)
    for _ in range(reps):
        starts = rng.integers(0, max(1, k - block + 1), nb)
        pick = [origins[s + j] for s in starts for j in range(block) if s + j < k][:k]
        sa, sb = [], []
        for lab in labs:
            ia = [(o, lab) for o in pick if (o, lab) in ca.index]
            ib = [(o, lab) for o in pick if (o, lab) in cb.index]
            if not ia or not ib:
                continue
            A, B = ca.loc[ia], cb.loc[ib]
            if metric == "wmape":
                sa.append(A.ae.sum() / A.act.sum() * 100); sb.append(B.ae.sum() / B.act.sum() * 100)
            else:
                sa.append(A.ae.sum() / A.n.sum()); sb.append(B.ae.sum() / B.n.sum())
        if sa:
            diffs.append(np.mean(sa) - np.mean(sb))
    diffs = np.array(diffs)
    return float(np.percentile(diffs, 2.5)), float(np.percentile(diffs, 97.5))


def select_champion(res: pd.DataFrame, buckets=DAILY_BUCKETS, metric: str = "wmape", block: int | None = None,
                    complexity: dict[str, int] | None = None) -> dict:
    """Protocol section 6. complexity: lower = simpler (wins a non-significant tie)."""
    table = summarize(res, buckets, metric)
    cells = _cells(res, buckets)
    first = f"d{buckets[0][0]}-{buckets[0][1]}"
    base = [m for m in table.index if is_baseline(m)]
    best_base = table.loc[base, "score"].idxmin()
    best_base_first = table.loc[base, first].min()
    cand = [m for m in table.index if not is_baseline(m)]
    eligible = [m for m in cand if table.loc[m, "score"] < table.loc[best_base, "score"] and table.loc[m, first] < best_base_first]
    if block is None:
        span = max(hi for _, hi in buckets)
        step = 14
        block = max(1, math.ceil(span / step))
    out = {"metric": metric, "table": table.round(4).to_dict(orient="index"), "best_baseline": best_base,
           "eligible": eligible, "block": block, "origins": int(res.origin.nunique())}
    usable = {}
    if not eligible:
        out.update(champion=best_base, champion_is_baseline=True,
                   note="No candidate beats the best baseline; the baseline is served.")
        return out
    champ = eligible[0]
    lo, hi = _boot_diff(cells, champ, best_base, buckets, metric, block)
    out["vs_baseline_ci"] = [lo, hi]
    out["vs_baseline_significant"] = hi < 0
    if len(eligible) > 1:
        ru = eligible[1]
        rlo, rhi = _boot_diff(cells, champ, ru, buckets, metric, block)
        out.update(runner_up=ru, vs_runner_up_ci=[rlo, rhi], vs_runner_up_significant=rhi < 0)
        if rhi >= 0 and complexity and complexity.get(ru, 9) < complexity.get(champ, 9):
            out["note"] = f"{champ} led {ru} without a significant margin; the simpler {ru} wins the tie."
            champ, ru = ru, champ
            out["runner_up"] = ru
    out["champion"] = champ
    for lo_, hi_ in buckets:
        lab = f"d{lo_}-{hi_}"
        if lab in table.columns:
            usable[lab] = bool(table.loc[champ, lab] < table.loc[base, lab].min())
    out["usable"] = usable
    return out


def report(sel: dict, log: Callable = print) -> None:
    t = pd.DataFrame(sel["table"]).T
    cols = [c for c in t.columns if c != "score"] + ["score"]
    unit = "%" if sel["metric"] == "wmape" else ""
    log(f"\n  {sel['metric'].upper()} by horizon, {sel['origins']} origins (score = mean of buckets)")
    log("  " + f"{'model':<34}" + "".join(f"{c:>11}" for c in cols))
    for m in t.sort_values("score").index:
        mark = " <- champion" if m == sel["champion"] else ""
        log("  " + f"{m:<34}" + "".join(f"{t.loc[m, c]:>10.2f}{unit if unit else ' '}" for c in cols) + mark)
    log(f"\n  best baseline: {sel['best_baseline']};  eligible: {', '.join(sel['eligible']) or 'none'}")
    if "vs_baseline_ci" in sel:
        lo, hi = sel["vs_baseline_ci"]
        log(f"  champion vs best baseline: 95% interval {lo:+.2f} to {hi:+.2f}  ({'significant' if sel['vs_baseline_significant'] else 'NOT significant'})")
    if "vs_runner_up_ci" in sel:
        lo, hi = sel["vs_runner_up_ci"]
        log(f"  champion vs runner-up ({sel['runner_up']}): 95% interval {lo:+.2f} to {hi:+.2f}  ({'significant' if sel['vs_runner_up_significant'] else 'NOT significant'})")
    if sel.get("note"):
        log(f"  note: {sel['note']}")
    if sel.get("usable"):
        log("  usable on the dashboard: " + ", ".join(f"{k} {'yes' if v else 'NO'}" for k, v in sel["usable"].items()))
