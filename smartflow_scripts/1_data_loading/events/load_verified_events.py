#!/usr/bin/env python3
"""
Load the VERIFIED event calendar (arena_events_verified.csv, beside this file) into silver.arena_events_verified.

Why a second calendar (11 Nov 2026): public.philippine_arena_events is filled by a scraper outside this repo (a
teammate's job; the backend's ETL only receives its rows, Back-End/src/etl/extractors/events.extractor.ts). Checked
against the toll record it lists many dates that were not show nights (a 6-date entry for a tour that played once,
dates that match ticket on-sales or other cities), and its "capacity" is the venue's size, not the event's. Those
false dates diluted every event-effect estimate. The scraped table is left untouched (other models read it); this
table holds one row per REAL show night, each with a public source:
  official venue / promoter / artist / ticketing pages, Billboard, or established news outlets. Never Wikipedia or
  its copies.
Traffic is never used to decide whether a date was an event (that was the circular bug of the 2026-09 version).

Checks before writing: required columns, valid dates and statuses, a source URL on every held/scheduled night, no
Wikipedia-family URL anywhere, attendance only as a sourced number (never a venue capacity).

Usage, from smartflow_scripts:
  python 1_data_loading/events/load_verified_events.py            dry run: validate and show what would be written
  python 1_data_loading/events/load_verified_events.py --write    replace silver.arena_events_verified
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "config"))
from db import PG  # noqa: E402

CSV = Path(__file__).with_name("arena_events_verified.csv")
COLS = ["act", "event_title", "show_date", "venue", "status", "act_origin", "format", "reported_attendance",
        "attendance_scope", "attendance_source_url", "date_source_url", "date_source_type", "evidence", "notes"]
STATUS = {"held", "scheduled", "cancelled", "postponed", "not_found"}
ORIGIN = {"filipino", "international", "mixed", "n/a"}
FORMAT = {"solo_concert", "multi_artist_showcase", "festival", "award_show", "sports", "religious", "fan_meeting",
          "other"}
VENUE = {"Philippine Arena", "Philippine Sports Stadium", "Clark Global City", "other"}
BANNED = re.compile(r"wikipedia\.org|wikiwand|fandom\.com|wikia\.|dbpedia|wiki\.", re.I)
# The scraped calendar's "capacity" per venue. An attendance equal to its own venue's capacity is refused unless the
# evidence quotes a crowd ("150,000 people attending" at Clark Aurora 2022 is a reported two-day total, not a size).
CAPACITY = {"Philippine Arena": 55000, "Philippine Sports Stadium": 20000, "Clark Global City": 150000}
CROWD_WORDS = re.compile(r"attend|people|fans|crowd|tickets|spectators|audience", re.I)

DDL = """
CREATE TABLE IF NOT EXISTS silver.arena_events_verified (
  id serial PRIMARY KEY,
  act text NOT NULL, event_title text, show_date date, venue text NOT NULL, status text NOT NULL,
  act_origin text, format text, reported_attendance integer, attendance_scope text, attendance_source_url text,
  date_source_url text, date_source_type text, evidence text, notes text,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE silver.arena_events_verified IS
  'One row per REAL show night at Philippine Arena / Philippine Sports Stadium / Clark Global City, each with a public
   source (official venue/promoter/artist/ticketing page, Billboard or established news; never Wikipedia). Loaded from
   smartflow_scripts/1_data_loading/events/arena_events_verified.csv by load_verified_events.py. The scraped
   public.philippine_arena_events is left as it is. Event-effect models read this table only.';
"""


def validate(df: pd.DataFrame) -> list[str]:
    problems = []
    missing = [c for c in COLS if c not in df.columns]
    if missing:
        return [f"missing columns: {missing}"]
    for i, r in df.iterrows():
        tag = f"row {i + 2} ({r.act} {r.show_date})"
        if r.status not in STATUS:
            problems.append(f"{tag}: status {r.status!r}")
        if r.status in ("held", "scheduled"):
            if pd.isna(pd.to_datetime(r.show_date, errors="coerce")):
                problems.append(f"{tag}: no valid show_date")
            if not str(r.date_source_url or "").startswith("http"):
                problems.append(f"{tag}: no date source URL")
        if r.venue not in VENUE:
            problems.append(f"{tag}: venue {r.venue!r}")
        if str(r.act_origin) not in ORIGIN and pd.notna(r.act_origin):
            problems.append(f"{tag}: act_origin {r.act_origin!r}")
        if str(r.format) not in FORMAT and pd.notna(r.format):
            problems.append(f"{tag}: format {r.format!r}")
        for c in ("date_source_url", "attendance_source_url", "evidence", "notes"):
            if pd.notna(r[c]) and BANNED.search(str(r[c])):
                problems.append(f"{tag}: {c} cites a Wikipedia-family source")
        if pd.notna(r.reported_attendance) and str(r.reported_attendance).strip() != "":
            n = re.sub(r"[^\d]", "", str(r.reported_attendance))
            quoted = CROWD_WORDS.search(f"{r.evidence} {r.notes}")
            if n and CAPACITY.get(r.venue) == int(n) and not quoted:
                problems.append(f"{tag}: attendance equals the venue capacity and no crowd figure is quoted")
            if not str(r.attendance_source_url or "").startswith("http"):
                problems.append(f"{tag}: attendance has no source URL")
    return problems


def main() -> None:
    write = "--write" in sys.argv
    df = pd.read_csv(CSV, dtype=str).fillna(pd.NA)
    df.columns = [c.strip() for c in df.columns]
    problems = validate(df)
    print(f"{CSV.name}: {len(df)} rows; status {df.status.value_counts().to_dict()}; "
          f"venues {df.venue.value_counts().to_dict()}")
    print(f"  with reported attendance: {int(df.reported_attendance.notna().sum())}")
    if problems:
        print(f"  {len(problems)} problem(s):")
        for p in problems[:40]:
            print("   -", p)
        raise SystemExit("not written: fix the CSV first")
    print("  checks passed")
    if not write:
        print("  dry run: nothing written (add --write)")
        return

    def num(v):
        m = re.search(r"[\d,]+", str(v)) if pd.notna(v) else None
        return int(m.group().replace(",", "")) if m else None

    rows = [(r.act, r.event_title, None if pd.isna(r.show_date) else r.show_date, r.venue, r.status, r.act_origin,
             r.format, num(r.reported_attendance), r.attendance_scope, r.attendance_source_url, r.date_source_url,
             r.date_source_type, r.evidence, r.notes) for r in df.itertuples()]
    rows = [tuple(None if (isinstance(x, float) and pd.isna(x)) or x is pd.NA else x for x in r) for r in rows]
    with psycopg2.connect(PG) as conn, conn.cursor() as cur:
        cur.execute(DDL)
        cur.execute("TRUNCATE silver.arena_events_verified RESTART IDENTITY")
        execute_values(cur, f"INSERT INTO silver.arena_events_verified ({', '.join(COLS)}) VALUES %s", rows)
    print(f"  written: {len(rows)} rows to silver.arena_events_verified")


if __name__ == "__main__":
    main()
