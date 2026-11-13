"""
SmartFlow NLEX - 48-hour hourly traffic forecast: dataset builder
=================================================================
Builds one tensor of hourly toll counts for every NLEX series and the known-in-advance calendar features that the
Dual-Path LSTM (train_dual_path.py) and the baselines read. Read-only on the database.

Series: one per (exit, direction, role, toll system) in gold.fact_traffic_hourly with status 'nlex' (32 series), each
with Class 1, 2 and 3 counts. A trip is counted once, where it paid, so the 32 series add up to the corridor exactly and
a class split adds up to its plaza.

Data provenance:
  - 2022-2024: the client's hourly export, level-scaled to his daily files (gold.toll_level_adjustment v2). Real hourly
    pattern, adjusted level.
  - 2025 and 2026-01-01 .. 2026-05-24: the client's hourly exports as delivered (real; 2026 loaded 6 Nov 2026).
  - After 2026-05-24 the warehouse still holds broken, missing and synthetic days (25 May - 30 Jun 2026) until the client
    re-extracts them. Those days are treated as UNKNOWN: the tensor's history ends at the last real day R
    (EVALUATION_PROTOCOL.md section 1; common.rolling_eval.REAL_END_VOLUME, or --real-end), and the served forecast
    starts the hour after R. The run says so (real_end, db_latest_day, unknown_days).
  - Inside the real period a day whose corridor total is under a quarter of the usual same weekday (median of the 8
    weeks before; holidays and the year-end week never flagged) is a broken upload: it is zeroed for every series, so
    it is MISSING (never an input, never a target, never scored) and listed in broken_days.
Missing plaza-hours (no row) are zero traffic; hours where the whole corridor is empty (toll holidays) are flagged
`corridor_gap` and excluded from scoring.

Features known in advance for any hour (so they may describe the 48 forecast hours without leakage): hour of day and
day of week (cyclic), day of year (cyclic), Philippine holiday, year-end week, and an event-day flag (Philippine Arena /
Philippine Sports Stadium / Clark events). Observed rainfall is included for PAST hours only; a forecast never sees the
weather of the hours it predicts (no archive of issued forecasts exists in the warehouse).

History runs to the latest uploaded day; the tensor then carries 48 more hours (calendar features only) so a
forecast issued after the latest upload can read the known calendar of the hours it predicts.

    python build_dataset.py                       # writes _work/cache/traffic_hourly_48h/dataset.npz
    python build_dataset.py --dry-run             # same, into _work/cache/traffic_hourly_48h/dryrun/ (nothing live)
    python build_dataset.py --real-end 2026-06-30 # a later last real day, once the client re-extracts June

Output: dataset.npz (read-only on the database).
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "config"))
from db import POSTGRES_URL  # noqa: E402
from features import REAL_END_VOLUME, cache_dir  # noqa: E402

START = "2022-01-01"
H = 48
BROKEN_SHARE = 0.25          # a day under 25% of its usual same weekday is a broken upload, not a quiet day


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="write into the dryrun/ folder; nothing live is touched")
    ap.add_argument("--real-end", default=str(REAL_END_VOLUME.date()), help="last day of REAL traffic data")
    args = ap.parse_args()
    OUT = cache_dir(args.dry_run)
    conn = psycopg2.connect(POSTGRES_URL)
    cur = conn.cursor()
    cur.execute("SELECT max(date)::text FROM gold.fact_traffic_hourly WHERE status = 'nlex'")
    DB_END = cur.fetchone()[0]                                # the latest upload (may run past the real record)
    END = min(pd.Timestamp(DB_END), pd.Timestamp(args.real_end)).strftime("%Y-%m-%d")   # history ends at the last REAL day
    cur.execute("SELECT count(DISTINCT date) FROM gold.fact_traffic_hourly WHERE status = 'nlex' AND date > %s", (END,))
    UNKNOWN_DAYS = int(cur.fetchone()[0])
    fact = pd.read_sql(
        f"""SELECT date, hour, exit_canonical, COALESCE(direction,'-') AS direction, COALESCE(role,'-') AS role,
                   COALESCE(toll_system,'-') AS toll_system, class_1, class_2, class_3
            FROM gold.fact_traffic_hourly
            WHERE status = 'nlex' AND date BETWEEN '{START}' AND '{END}'""", conn)
    hol = pd.read_sql("SELECT date_day FROM public.ph_holidays", conn, parse_dates=["date_day"])
    ev = pd.read_sql("""SELECT DISTINCT event_date::date AS d FROM silver.philippine_arena_events_clean
                        WHERE event_date IS NOT NULL""", conn, parse_dates=["d"])
    # mean over the corridor's weather points, in Manila local time (naive, like the toll hours)
    rain = pd.read_sql(f"""SELECT date_trunc('hour', timestamp_utc AT TIME ZONE 'Asia/Manila') AS ts, AVG(rainfall)::float8 AS rain
                           FROM public.hourly_weather
                           WHERE (timestamp_utc AT TIME ZONE 'Asia/Manila') BETWEEN '{START}' AND '{END} 23:59'
                           GROUP BY 1""", conn, parse_dates=["ts"])
    conn.close()

    fact["ts"] = pd.to_datetime(fact["date"]) + pd.to_timedelta(fact["hour"], unit="h")
    fact["key"] = fact.exit_canonical + "|" + fact.direction + "|" + fact.role + "|" + fact.toll_system
    keys = sorted(fact.key.unique())
    # History through END, then the 48 forecast hours (calendar only; their counts stay 0 and are never read).
    idx = pd.date_range(START, pd.Timestamp(f"{END} 23:00") + pd.Timedelta(hours=H), freq="h")
    n_hist = len(idx) - H
    T, S = len(idx), len(keys)
    Y = np.zeros((T, S, 3), dtype=np.float32)
    pos_t = idx.get_indexer(fact.ts)
    pos_s = pd.Index(keys).get_indexer(fact.key)
    for c, col in enumerate(("class_1", "class_2", "class_3")):
        np.add.at(Y[:, :, c], (pos_t, pos_s), fact[col].to_numpy(np.float32))

    hols = set(hol.date_day.dt.normalize())
    # Broken uploads inside the real period: zeroed for every series, so they are missing everywhere downstream.
    dtot = pd.Series(Y[:n_hist].sum(axis=(1, 2)).reshape(-1, 24).sum(axis=1), index=idx[:n_hist:24])
    broken = []
    for d, v in dtot.items():
        same = dtot[(dtot.index < d) & (dtot.index >= d - pd.Timedelta(weeks=8)) & (dtot.index.dayofweek == d.dayofweek)]
        same = same[[x not in hols and x.strftime("%Y-%m-%d") not in broken for x in same.index]]
        yearend = (d.month == 12 and d.day >= 24) or (d.month == 1 and d.day <= 1)
        if len(same) >= 4 and v < BROKEN_SHARE * same.median() and d not in hols and not yearend:
            broken.append(d.strftime("%Y-%m-%d"))
    for d in broken:
        i = idx.get_loc(pd.Timestamp(d))
        Y[i:i + 24] = 0
    corridor = Y.sum(axis=(1, 2))
    corridor_gap = corridor <= 0
    corridor_gap[n_hist:] = False
    is_synth = np.zeros(T, dtype=bool)                        # every history hour is real (2022-24 level-adjusted)
    is_future = np.arange(T) >= n_hist

    evs = set(ev.d.dt.normalize())
    day = idx.normalize()
    how = idx.hour.to_numpy()
    dow = idx.dayofweek.to_numpy()
    doy = idx.dayofyear.to_numpy()
    cal = np.column_stack([
        np.sin(2 * np.pi * how / 24), np.cos(2 * np.pi * how / 24),
        np.sin(2 * np.pi * dow / 7), np.cos(2 * np.pi * dow / 7),
        np.eye(7)[dow],
        np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25),
        np.array([d in hols for d in day], dtype=float),
        np.array([(d.month == 12 and d.day >= 23) or (d.month == 1 and d.day <= 2) for d in day], dtype=float),
        np.array([d in evs for d in day], dtype=float),
    ]).astype(np.float32)
    cal_names = ["hod_sin", "hod_cos", "dow_sin", "dow_cos"] + [f"dow_{i}" for i in range(7)] + \
                ["doy_sin", "doy_cos", "holiday", "yearend", "event_day"]
    r = rain.set_index("ts")["rain"].reindex(idx).interpolate(limit=3).fillna(0).to_numpy(np.float32)
    r[n_hist:] = 0                                            # observed rain of forecast hours is never an input

    np.savez_compressed(OUT / "dataset.npz", Y=Y, cal=cal, rain=r, ts=idx.astype("int64").to_numpy(),
                        keys=np.array(keys), cal_names=np.array(cal_names),
                        corridor_gap=corridor_gap, is_synthetic=is_synth, is_future=is_future, n_hist=n_hist,
                        history_end=str(idx[n_hist - 1]), real_end=END, db_latest_day=DB_END,
                        unknown_days=UNKNOWN_DAYS, broken_days=np.array(broken, dtype=str))
    real = ~is_synth & ~is_future
    print(f"series {S}, history {idx[0]} -> {idx[n_hist - 1]} (real {real.sum()} h), +{H} forecast hours")
    print(f"last real day {END}; the warehouse runs to {DB_END}: {UNKNOWN_DAYS} later day(s) treated as unknown "
          f"(broken/synthetic until re-extracted); broken days inside the real period: {broken or 'none'}")
    print(f"rain: hours matched {rain.ts.isin(idx).sum()}/{T}, wet hours {(r > 0).mean():.1%}, mean {r.mean():.3f} mm/h")
    print(f"corridor-empty hours: {corridor_gap[real].sum()}; mean trips/day 2025: "
          f"{Y[(idx.year == 2025)].sum() / 365:,.0f}")
    print("saved", OUT / "dataset.npz")


if __name__ == "__main__":
    main()
