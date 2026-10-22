#!/usr/bin/env python3
"""
Keep public.hourly_weather current from Open-Meteo (free, no key).

The weather history (2020-01-01 onward, 20 points, one at each NLEX exit from Balintawak to Sta. Ines) came from
Open-Meteo, each variable labelled with the model it was read from: "open_meteo" (Open-Meteo's default blend) or
"jma" (its JMA model). The loader that built it is not in this repo, and it was run by hand in four batches, the
last on 2026-10-03, leaving 12-18 Aug, 30 Aug - 22 Sep and everything after 3 Oct empty. The incident forecast
reads observed rain for its forecast days from this table ("kept current through now"), so those gaps became 0 mm.

This script fills every missing hour and is meant to run every hour:
  - the same two Open-Meteo models, per exit and per variable as that exit's own recent rows use them, so new rows
    continue the series instead of switching source (checked on 2-3 Oct 2026: about 0.06 C off the stored rows);
  - only finished hours, never forecast hours: this table holds what happened;
  - a missing hour is filled, an existing one is never changed (UNIQUE (location_name, timestamp_utc));
  - every row it writes carries validation_notes = MARKER, so `--undo` removes exactly its rows and nothing else.
Each run looks back LOOKBACK_DAYS (120), so a run missed while this PC was off is made up by the next one.

Usage, from smartflow_scripts:
  python 1_data_loading/weather/fetch_weather_open_meteo.py              dry run: what would be added
  python 1_data_loading/weather/fetch_weather_open_meteo.py --write      add the missing hours
  python 1_data_loading/weather/fetch_weather_open_meteo.py --write --fix-names
                                                                         also folds the three misspelled exit names
                                                                         (Cdv/Ph Arena, Paso De Blas Valenzuela, Sctex)
                                                                         into the names the other 6 years use
  python 1_data_loading/weather/fetch_weather_open_meteo.py --undo       delete every row this script added
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
import requests
from psycopg2.extras import execute_values

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "config"))
from db import PG  # noqa: E402

# The historical-forecast service: the same model runs the forecast service serves, archived, with no blank hours
# (the forecast service itself kept only about 66 days on 2026-10-23, so it could not reach the 12-17 Aug gap).
# On 20-21 Aug 2026 it matched the stored rows exactly (0.00 C, 0.00 mm). Free for non-commercial use, no key.
API = "https://historical-forecast-api.open-meteo.com/v1/forecast"
MARKER = "loader=fetch_weather_open_meteo.py"
LOOKBACK_DAYS = 120
MODELS = {"open_meteo": "best_match", "jma": "jma_seamless"}

# Three exits were written under other spellings in the Aug-Oct 2026 batches. Joins by name (the location dimension
# behind public.fact_hourly_weather) missed them.
NAME_FIX = {"Cdv/Ph Arena": "CDV/PH Arena", "Paso De Blas Valenzuela": "Paso de Blas Valenzuela", "Sctex": "SCTEX"}

# column -> (Open-Meteo hourly variable, its *_source column)
VARS = {
    "temperature": ("temperature_2m", "temperature_source"),
    "rainfall": ("precipitation", "rainfall_source"),
    "wind_speed": ("wind_speed_10m", "wind_speed_source"),
    "wind_gusts": ("wind_gusts_10m", "wind_gusts_source"),
    "humidity": ("relative_humidity_2m", "humidity_source"),
    "dew_point": ("dew_point_2m", "dew_point_source"),
    "surface_pressure": ("surface_pressure", "surface_pressure_source"),
}

# WMO weather codes, worded as the stored rows word them.
WMO = {0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Depositing rime fog",
       51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle", 56: "Light freezing drizzle",
       57: "Dense freezing drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
       66: "Light freezing rain", 67: "Heavy freezing rain", 80: "Slight rain showers", 81: "Moderate rain showers",
       82: "Violent rain showers", 95: "Thunderstorm", 96: "Thunderstorm with slight hail",
       99: "Thunderstorm with heavy hail"}


def locations(cur) -> list[dict]:
    """The 20 exit points, with each one's coordinates and the source it used last for every variable."""
    cur.execute("""
        SELECT location_name, avg(latitude)::float, avg(longitude)::float
        FROM public.hourly_weather WHERE timestamp_utc < '2026-01-01' GROUP BY 1 ORDER BY 2""")
    locs = [{"name": n, "lat": la, "lon": lo} for n, la, lo in cur.fetchall()]
    spellings = {canon: [canon] + [k for k, v in NAME_FIX.items() if v == canon] for canon in (l["name"] for l in locs)}
    for loc in locs:
        src_cols = ", ".join(s for _, s in VARS.values())
        cur.execute(f"""
            SELECT {src_cols} FROM public.hourly_weather
            WHERE location_name = ANY(%s) AND timestamp_utc > now() - interval '120 days'""", (spellings[loc["name"]],))
        rows = cur.fetchall()
        loc["source"] = {}
        for i, col in enumerate(VARS):
            known = Counter(r[i] for r in rows if r[i] in MODELS)
            loc["source"][col] = known.most_common(1)[0][0] if known else "open_meteo"
    return locs


def fetch(locs: list[dict], model: str, start: str, end: str) -> list[dict]:
    hourly = ",".join(v for v, _ in VARS.values()) + ",weather_code"
    r = requests.get(API, timeout=60, params={
        "latitude": ",".join(f"{l['lat']:.6f}" for l in locs),
        "longitude": ",".join(f"{l['lon']:.6f}" for l in locs),
        "hourly": hourly, "timezone": "GMT", "start_date": start, "end_date": end, "models": model,
    })
    r.raise_for_status()
    out = r.json()
    return out if isinstance(out, list) else [out]


def build_rows(locs, start, end, last_full_hour):
    data = {key: fetch(locs, model, start, end) for key, model in MODELS.items()}
    now = datetime.now(timezone.utc)
    rows = []
    for i, loc in enumerate(locs):
        h = {key: data[key][i]["hourly"] for key in MODELS}
        for j, t in enumerate(h["open_meteo"]["time"]):
            ts = datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
            if ts > last_full_hour:
                continue
            vals, srcs, ok = {}, {}, True
            for col, (var, _) in VARS.items():
                src = loc["source"][col]
                v = h[src][var][j]
                if v is None and src != "open_meteo":       # model gap: fall back to the default blend, labelled so
                    src, v = "open_meteo", h["open_meteo"][var][j]
                vals[col], srcs[col] = v, src
            if vals["temperature"] is None or vals["rainfall"] is None:
                ok = False
            if not ok:
                continue
            code = h["open_meteo"]["weather_code"][j]
            rows.append((
                loc["name"], ts, loc["lat"], loc["lon"],
                vals["temperature"], srcs["temperature"], vals["rainfall"], srcs["rainfall"],
                vals["wind_speed"], srcs["wind_speed"], vals["wind_gusts"], srcs["wind_gusts"],
                vals["humidity"], srcs["humidity"], vals["dew_point"], srcs["dew_point"],
                vals["surface_pressure"], srcs["surface_pressure"],
                WMO.get(code, None) if code is not None else None, "open_meteo",
                "pending", False, False, MARKER, now,
            ))
    return rows


INSERT = """
INSERT INTO public.hourly_weather (location_name, timestamp_utc, latitude, longitude,
  temperature, temperature_source, rainfall, rainfall_source, wind_speed, wind_speed_source,
  wind_gusts, wind_gusts_source, humidity, humidity_source, dew_point, dew_point_source,
  surface_pressure, surface_pressure_source, weather_description, weather_desc_source,
  validation_status, is_imputed, original_missing, validation_notes, ingested_at)
VALUES %s
ON CONFLICT (location_name, timestamp_utc) DO NOTHING
RETURNING location_name, timestamp_utc"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="add the missing hours (default: dry run)")
    ap.add_argument("--fix-names", action="store_true", help="fold the three misspelled exit names into the canonical ones")
    ap.add_argument("--undo", action="store_true", help="delete every row this script added")
    a = ap.parse_args()

    conn = psycopg2.connect(PG)
    cur = conn.cursor()
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    if a.undo:
        cur.execute("DELETE FROM public.hourly_weather WHERE validation_notes = %s", (MARKER,))
        print(f"{stamp}  undo: deleted {cur.rowcount} rows added by this script")
        conn.commit()
        return

    if a.fix_names:
        for wrong, right in NAME_FIX.items():
            cur.execute("""UPDATE public.hourly_weather w SET location_name = %s
                           WHERE location_name = %s AND NOT EXISTS (SELECT 1 FROM public.hourly_weather x
                             WHERE x.location_name = %s AND x.timestamp_utc = w.timestamp_utc)""", (right, wrong, right))
            print(f"{stamp}  names: {wrong!r} -> {right!r}: {cur.rowcount} rows" + ("" if a.write else " (dry run)"))

    locs = locations(cur)
    now = datetime.now(timezone.utc)
    last_full_hour = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    start = (now - timedelta(days=LOOKBACK_DAYS)).date().isoformat()
    end = now.date().isoformat()

    rows = build_rows(locs, start, end, last_full_hour)
    cur.execute("""SELECT location_name, timestamp_utc FROM public.hourly_weather
                   WHERE timestamp_utc >= %s""", (start,))
    have = {(NAME_FIX.get(n, n), t) for n, t in cur.fetchall()}
    new = [r for r in rows if (r[0], r[1]) not in have]
    by_day = Counter(r[1].date() for r in new)
    print(f"{stamp}  {len(locs)} exit points, {start} .. {last_full_hour:%Y-%m-%d %H}:00 UTC: "
          f"{len(rows)} hours from Open-Meteo, {len(new)} missing in the table")
    if by_day:
        days = sorted(by_day)
        print(f"          missing days: {len(days)} ({days[0]} .. {days[-1]})")

    if not a.write:
        conn.rollback()
        print("          dry run: nothing written (add --write)")
        return
    added = execute_values(cur, INSERT, new, page_size=2000, fetch=True) if new else []
    conn.commit()
    print(f"{stamp}  wrote {len(added)} rows")


if __name__ == "__main__":
    main()
