#!/usr/bin/env python3
"""
Weekly list of scraped events the verified calendar does not cover yet (12 Nov 2026).

New events reach the dashboard automatically: the scraper outside this repo writes public.philippine_arena_events,
and the backend forecasts every future listing at once, marked "unverified" (normal day x the event model's typical
multiplier). What is NOT automatic is confirming a listing against a public source, which is what lets a night be
LEARNED from (the scraped list has proved to contain many false dates). This script lists, every week, each scraped
date that silver.arena_events_verified has not checked, so someone can confirm it (official venue / promoter / artist /
ticketing page, Billboard or established news; never Wikipedia), add the row with its link to
arena_events_verified.csv, and run load_verified_events.py --write. Read-only; writes only the CSV report.

Usage, from smartflow_scripts:
  python 1_data_loading/events/list_events_to_verify.py
"""
import sys
from pathlib import Path

import pandas as pd
import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "config"))
from db import PG, WORK  # noqa: E402

OUT = Path(WORK) / "outputs" / "events_to_verify.csv"


def main() -> None:
    with psycopg2.connect(PG) as conn:
        conn.set_session(readonly=True)
        df = pd.read_sql("""
            SELECT e.start_date AS date, (array_agg(e.title ORDER BY length(e.title)))[1] AS title,
                   (array_agg(e.venue ORDER BY e.venue NULLS LAST))[1] AS venue, bool_or(e.is_derived) AS inferred
            FROM public.philippine_arena_events e
            WHERE e.start_date >= (now() AT TIME ZONE 'Asia/Manila')::date - 90
              AND e.start_date NOT IN (SELECT show_date FROM silver.arena_events_verified WHERE show_date IS NOT NULL)
            GROUP BY e.start_date ORDER BY e.start_date""", conn)
    df["why"] = df.inferred.map({True: "inferred recurring date (most were wrong when checked)",
                                 False: "new listing, not checked yet"})
    # Adviser (13 Nov 2026): a verified night still marked "scheduled" after its date must be re-checked: did it
    # happen, or was it rescheduled or cancelled? Its status stays "scheduled" until someone confirms it.
    with psycopg2.connect(PG) as conn:
        conn.set_session(readonly=True)
        passed = pd.read_sql("""
            SELECT show_date AS date, COALESCE(NULLIF(event_title, ''), act) AS title, venue
            FROM silver.arena_events_verified
            WHERE status = 'scheduled' AND show_date < (now() AT TIME ZONE 'Asia/Manila')::date
            ORDER BY show_date""", conn)
    passed["inferred"] = False
    passed["why"] = "date has passed: confirm held, rescheduled or cancelled"
    df = pd.concat([df, passed], ignore_index=True).sort_values("date")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT, index=False)
    print(f"{len(df)} scraped date(s) not yet in the verified calendar (last 90 days onward) -> {OUT}")
    for r in df.itertuples():
        print(f"  {r.date}  {str(r.title)[:60]:<60} {r.venue or ''}  [{r.why}]")


if __name__ == "__main__":
    main()
