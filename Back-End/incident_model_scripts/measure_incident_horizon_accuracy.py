#!/usr/bin/env python3
"""
Rolling-origin horizon-accuracy study for the incident day-level forecast.

WHY THIS EXISTS
  train_incident_models.py's own VALIDATION_DAYS window measures one-step-ahead
  accuracy only: every validation prediction is handed the REAL previous day's
  lag/rolling features, never its own prior guess (see that file's FUTURE_DAYS
  comment). It cannot say how good day 60 of one continuous, blind recursive
  forecast actually is — only how good the model is when it always has
  yesterday's real count to work from. This script answers the question
  VALIDATION_DAYS can't: it reruns the champion's own recursive forecast from
  several real historical cut points, each time pretending the training data
  stopped there, and scores the resulting 90-day-deep forecast against what
  actually happened next (which, for a historical origin, is already known).

  Mirrors smartflow_scripts/3_training_testing/traffic_volume/
  extend_future_volume.py's own rolling-origin methodology — same bucket
  boundaries, same "measured here every run, never transcribed into a
  constant" rule — so the two forecasts' long-horizon caveats read the same
  way on the dashboard. The naive baseline is this pipeline's own lag-7
  convention (see train_incident_models.py's y_naive / "naive seasonal
  (lag-7) baseline"), not traffic's separate climatology baseline, since
  incidents have no weather-driven seasonal-naive equivalent worth adding.

WHY THE CHAMPION ONLY, NOT ALL SEVEN CANDIDATES
  train_incident_models.py already refits every candidate for the dashboard's
  own model-overlay toggle, but a 9-origin x 90-day recursive study is
  expensive to repeat seven times over (LSTM/GRU each retrain a small net per
  origin), and the dashboard's long-horizon caveat only needs to describe the
  series shown by default — the champion's.

WHAT EACH ORIGIN IS ALLOWED TO KNOW (corrected 2026-10-08)
  A forecast made on the origin date knows nothing after it. The first version
  of this study handed every origin the REAL rainfall and the REAL traffic
  volume of the 90 days it was forecasting (fetch_future_rain and
  VOLUME_BY_DATE both prefer an observed value, and for a historical origin
  every "future" day has one). The live forecast never has those: it gets a
  16-day weather forecast and the traffic module's own predicted volume. So
  the study scored a better-informed model than the one on the dashboard.
  Each origin now sees only what was on record at the origin:
    rain    after the origin = the mean daily rain of that calendar month in
            the history before the origin (no archive of past weather
            forecasts exists to replay, and past day 16 the live run has none)
    volume  after the origin = the mean of the same weekday over the last 28
            days before the origin (a stand-in for the traffic forecast; the
            live one is a trained model, so this is the cautious side)

  The naive baseline is the same weekday of the last full week before the
  origin. The first version took the seven days before the origin in REVERSE
  order (day 1 was scored against the origin's eve, day 2 against the day
  before that...), which lines up with the weekday one day in seven -- a
  baseline easier to beat than the lag-7 naive the notes claim it is.

Usage:
    python measure_incident_horizon_accuracy.py               dry run: prints the table, writes nothing
    python measure_incident_horizon_accuracy.py --write-db    also replaces ml_incident_horizon_accuracy

Run train_incident_models.py --write-db first: this script reads the
champion's name from ml_training_metadata rather than re-deriving it, and
exits if that table is empty.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import train_incident_models as tim  # noqa: E402  (after sys.path setup)

HZ_H = 90      # same depth train_incident_models.py now forecasts (FUTURE_DAYS)
HZ_STEP = 30   # days between rolling origins
HZ_N = 9       # number of origins
SEASON = 7     # weekly seasonality -- this pipeline's own "naive" lag
BUCKETS = [(1, 7), (8, 14), (15, 30), (31, 60), (61, 90)]


def origin_inputs(origin_date, future_dates: list, rain_by_date: dict, volume_by_date: dict) -> tuple[dict, dict]:
    """Rain and volume as known ON the origin date: observed up to it, estimated after it (see the module note)."""
    rain = {d: v for d, v in rain_by_date.items() if d <= origin_date}
    by_month: dict[int, list] = {}
    for d, v in rain.items():
        by_month.setdefault(d.month, []).append(float(v))
    overall = float(np.mean(list(rain.values()))) if rain else 0.0
    for fd in future_dates:
        m = by_month.get(fd.month)
        rain[fd] = float(np.mean(m)) if m else overall
    volume = {d: v for d, v in volume_by_date.items() if d <= origin_date}
    if volume:
        recent = [(origin_date - pd.Timedelta(days=k)) for k in range(0, 28)]
        by_dow: dict[int, list] = {}
        for d in recent:
            if d in volume:
                by_dow.setdefault(d.weekday(), []).append(float(volume[d]))
        fallback = float(np.mean([v for vs in by_dow.values() for v in vs])) if by_dow else 0.0
        for fd in future_dates:
            vs = by_dow.get(fd.weekday())
            volume[fd] = float(np.mean(vs)) if vs else fallback
    return rain, volume


def main() -> None:
    write_db = "--write-db" in sys.argv[1:]
    conn = tim.get_conn()
    try:
        print("Loading daily incident counts + rainfall + volume (mirrors train_incident_models.py's own load)...")
        daily = tim.load_daily_counts(conn)
        rain_daily = tim.load_daily_rain(conn)
        daily = daily.merge(rain_daily, on="d", how="left")
        daily["rain_mm"] = daily["rain_mm"].fillna(0.0)
        rain_by_date = dict(zip(rain_daily["d"].dt.date, rain_daily["rain_mm"]))

        vol_daily = tim.load_daily_volume(conn)
        covered = daily["d"].isin(vol_daily["d"])
        if covered.all():
            daily = daily.merge(vol_daily, on="d", how="left")
            tim.VOLUME_BY_DATE = dict(zip(vol_daily["d"].dt.date, vol_daily["volume"]))
            print(f"  volume joined ({len(vol_daily)} days, covers all {len(daily)} incident days)")
        else:
            print("  volume does not cover every incident day; studying the volume-free series "
                  "(matches what train_incident_models.py's own main() falls back to in that case)")
            tim.FEATURE_COLS = [c for c in tim.FEATURE_COLS if c not in tim.VOLUME_COLS]
            tim.EXOG_COLS = [c for c in tim.EXOG_COLS if c not in tim.VOLUME_COLS]

        tim.HOLIDAY_DATES = tim.load_holidays(conn)

        feat = tim.build_features(daily).dropna(subset=tim.FEATURE_COLS).reset_index(drop=True)
        print(f"  {len(feat)} usable rows ({feat['d'].min().date()} .. {feat['d'].max().date()})")

        with conn.cursor() as cur:
            cur.execute("SELECT metadata_json FROM ml_training_metadata ORDER BY created_at DESC LIMIT 1")
            row = cur.fetchone()
        if not row:
            sys.exit("ml_training_metadata is empty -- run train_incident_models.py --write-db first")
        champion = row[0]["champion_model"]
        print(f"\nhorizon study: champion = {champion}")

        # Rolling origins: HZ_N points spaced HZ_STEP apart, each needing HZ_H
        # days of real history left AFTER it to score against, and enough
        # history BEFORE it to actually fit on (same >400-row floor
        # extend_future_volume.py uses, for the same reason: too little
        # training history behind an origin makes its own fit unrepresentative
        # of what the live model is doing today).
        origins = [len(feat) - (HZ_N - i) * HZ_STEP - HZ_H for i in range(HZ_N)]
        origins = [o for o in origins if o > 400]
        if not origins:
            sys.exit(f"Not enough history for any rolling origin (need > 400 rows before an origin; have {len(feat)})")
        print(f"  {len(origins)} origins, h={HZ_H}d, step={HZ_STEP}d")

        actual_by_date = dict(zip(daily["d"].dt.date, daily["total"]))
        saved_future_days = tim.FUTURE_DAYS
        saved_volume = tim.VOLUME_BY_DATE
        all_volume = dict(tim.VOLUME_BY_DATE)
        tim.FUTURE_DAYS = HZ_H
        rows: list[dict] = []
        try:
            for oi, cut in enumerate(origins, 1):
                origin_feat = feat.iloc[:cut].reset_index(drop=True)
                origin_date = origin_feat["d"].iloc[-1].date()
                future_dates = [(origin_date + pd.Timedelta(days=i)) for i in range(1, HZ_H + 1)]
                origin_rain, origin_volume = origin_inputs(origin_date, future_dates, rain_by_date, all_volume)
                tim.VOLUME_BY_DATE = origin_volume
                try:
                    tim.set_all_seeds()
                    _val_pred, future_rows, _imp = tim.build_final_predictions(champion, origin_feat, origin_rain)
                except Exception as e:
                    print(f"    origin {oi}/{len(origins)}  {origin_date}  FAILED ({e}) -- skipped")
                    continue
                # The naive baseline for this origin: the same weekday in the
                # last full week on record at the origin (the origin's own day
                # included), repeated across the horizon -- the lag-7
                # convention train_incident_models.py scores every model
                # against. Day h falls on the weekday of the day
                # (SEASON*ceil(h/SEASON) - h) before the origin.
                scored = 0
                for h, (d, pred) in enumerate(future_rows, start=1):
                    actual = actual_by_date.get(d.date())
                    back = SEASON * -(-h // SEASON) - h
                    naive = actual_by_date.get(origin_date - pd.Timedelta(days=back))
                    if actual is None or naive is None:
                        continue
                    rows.append({"h": h, "a": float(actual), "f": float(pred), "sn": float(naive)})
                    scored += 1
                last_h_date = future_rows[-1][0].date() if future_rows else origin_date
                print(f"    origin {oi}/{len(origins)}  {origin_date} -> {last_h_date}  ({scored}/{len(future_rows)} days scorable)")
        finally:
            tim.FUTURE_DAYS = saved_future_days
            tim.VOLUME_BY_DATE = saved_volume

        hzdf = pd.DataFrame(rows)
        if hzdf.empty:
            sys.exit("Rolling-origin study produced no scorable rows -- nothing to write")

        # Same MASE convention the rest of this pipeline uses (mase_of /
        # y_naive = lag_7): scaled by the lag-7 naive's own MAE, measured on
        # the in-sample history before the FIRST origin so an easy stretch of
        # days inside the study can't flatter its own denominator.
        ins = feat["total"].values[: origins[0]]
        hz_scale = float(np.mean(np.abs(ins[SEASON:] - ins[:-SEASON]))) if len(ins) > SEASON else None
        if hz_scale:
            print(f"\n  MASE denominator (lag-7 naive, {len(ins)} training days): {hz_scale:.3f} incidents/day")
        print(f"  {'range':<10}{'WMAPE%':>9}{'MAPE%':>8}{'MASE':>8}{'MAE':>9}{'baseline%':>11}   verdict")

        study = []
        for lo, hi in BUCKETS:
            g = hzdf[(hzdf.h >= lo) & (hzdf.h <= hi)]
            if g.empty:
                continue
            e = (g.a - g.f).abs()
            a_sum = g.a.sum()
            wm = float(e.sum() / a_sum * 100) if a_sum > 0 else None
            nonzero = g.a.replace(0, np.nan)
            mp = float((e / nonzero).mean() * 100)
            ms = float(e.mean() / hz_scale) if hz_scale else None
            base = float((g.a - g.sn).abs().sum() / a_sum * 100) if a_sum > 0 else None
            ok = bool(wm is not None and base is not None and ms is not None and wm < base and ms < 1.0)
            # No "validated operating range" bucket exists here the way
            # traffic's h<=14 is: VALIDATION_DAYS never scores a multi-step
            # recursive run at ANY depth, so every bucket below is this
            # script's own first measurement of it, not a comparison
            # against a separately-validated range.
            note = (
                "rolling-origin study — clears both gates: beats the lag-7 naive on WMAPE, and MASE is under 1.0"
                if ok else
                "rolling-origin study — fails at least one gate: does not beat the lag-7 naive on WMAPE, "
                "and/or MASE is 1.0 or higher"
            )
            study.append((lo, hi, int(len(g)), wm, mp, ms, float(e.mean()), base, ok, note))
            ms_s = f"{ms:.3f}" if ms is not None else "n/a"
            base_s = f"{base:.2f}" if base is not None else "n/a"
            wm_s = f"{wm:.2f}" if wm is not None else "n/a"
            print(f"  {f'd{lo}-{hi}':<10}{wm_s:>9}{mp:>8.2f}{ms_s:>8}{e.mean():>9.2f}{base_s:>11}   {'USABLE' if ok else 'FAILS GATES'}")

        if not write_db:
            print(f"\ndry run: {len(study)} buckets measured for champion={champion}; "
                  "ml_incident_horizon_accuracy NOT touched (pass --write-db to replace it)")
            return

        with conn.cursor() as cur:
            cur.execute("""
              CREATE TABLE IF NOT EXISTS ml_incident_horizon_accuracy (
                id serial PRIMARY KEY,
                model_name text NOT NULL,
                h_lo int NOT NULL, h_hi int NOT NULL,
                n int, wmape numeric(10,4), mape numeric(10,4), mase numeric(10,4), mae numeric(14,2),
                baseline_wmape numeric(10,4), usable boolean, note text,
                updated_at timestamptz DEFAULT now())""")
            cur.execute(
                "COMMENT ON TABLE ml_incident_horizon_accuracy IS "
                "'How the incident forecast''s error grows with how far ahead the day was. "
                "Measured by a rolling-origin study run inline by measure_incident_horizon_accuracy.py "
                "against the current champion, mirroring extend_future_volume.py''s methodology for "
                "traffic -- not transcribed, not extrapolated from VALIDATION_DAYS (which is "
                "one-step-ahead only; see FUTURE_DAYS''s own comment in train_incident_models.py). "
                "Lets the dashboard label a 90-day projection with the accuracy that actually applies "
                "to each stretch instead of quoting the day-1 figure everywhere.'"
            )
            cur.execute("DELETE FROM ml_incident_horizon_accuracy")

            for lo, hi, n, wm, mp, ms, mae, bw, ok, note in study:
                cur.execute(
                    """INSERT INTO ml_incident_horizon_accuracy
                       (model_name, h_lo, h_hi, n, wmape, mape, mase, mae, baseline_wmape, usable, note)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (champion, lo, hi, n, wm, mp, ms, mae, bw, ok, note),
                )
        conn.commit()
        print(f"\nml_incident_horizon_accuracy: {len(study)} buckets stored for champion={champion}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
