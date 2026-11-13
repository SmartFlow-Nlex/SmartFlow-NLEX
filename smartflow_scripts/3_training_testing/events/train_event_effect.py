"""
Publish the event forecast the study chose (EVALUATION_PROTOCOL.md section 9). Replaces
All_Scripts/Predictive_Modeling/build_event_surge.py, which read the scraped calendar (mostly false dates) and listed a
Gradient Boosting reference the dashboard could not serve as its "used" model.

STEPS
  1. Run event_study.py on silver.arena_events_verified (verified show nights only, real toll days to 2026-05-24).
  2. Serve the protocol's champion. Servable now: no adjustment, flat uplift, per-exit uplift. The structured
     candidates (venue + day, + class, + run) need the backend to compute an event's strength; if one of them wins a
     later run, this script stops and keeps the published table rather than serve something the dashboard cannot draw.
  3. Writes (not with --dry-run):
       gold.ml_event_surge_forecast   one row per exit per venue group (bulacan = Arena + Stadium, clark): the served
                                      multiplier and its 95% interval, holiday factor, typical normal day
       gold.ml_event_normal           each exit's normal day per weekday at the end of the real record
       gold.ml_model_metrics          target 'Event Surge': every candidate's held-out score, rank, interval
       gold.ml_event_surge_eval       the replay of held-out nights + the basis (calendar, sources, what event types did)

Usage (from smartflow_scripts/3_training_testing/events):
  python train_event_effect.py --dry-run          run the study, print what would be written
  python train_event_effect.py                    run the study and publish
  python train_event_effect.py --skip-study       publish from the saved study (must match the verified table)
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "config"))
from db import PG, WORK  # noqa: E402

ARGS = sys.argv[1:]
DRY = "--dry-run" in ARGS
CACHE = Path(WORK) / "cache"
GROUP_RANGE = {"bulacan": (20, 39), "clark": (72, 88)}
ANCHOR = {"bulacan": "CDV/PH Arena", "clark": "Dau"}
GROUP_LABEL = {"bulacan": "Philippine Arena / Philippine Sports Stadium event", "clark": "Clark Global City event"}


def banner(t):
    print("\n" + "=" * 78 + f"\n  {t}\n" + "=" * 78, flush=True)


# ── 1. The study ──
if "--skip-study" not in ARGS:
    banner("STEP 1: event_study.py on silver.arena_events_verified")
    r = subprocess.run([sys.executable, "-u", str(HERE / "event_study.py")], cwd=HERE)
    if r.returncode:
        raise SystemExit("the study failed; nothing published")
S = json.loads((CACHE / "event_study.json").read_text())
P = pd.read_csv(CACHE / "event_study.csv", parse_dates=["date"])
if S["calendar"] != "silver.arena_events_verified":
    raise SystemExit(f"the saved study read {S['calendar']}, not the verified table: re-run without --skip-study")
champ = int(S["champion_id"])
print(f"  champion: {S['champion']} ({S['note']})")

# ── 2. Served multipliers ──
banner("STEP 2: served multiplier per exit")
TREE = champ in (8, 9)
if champ not in (1, 2, 3, 8, 9, 10):
    raise SystemExit(f"{S['champion']} won, but the dashboard cannot serve it yet (needs event-strength support in "
                     "the backend). The published table is left as it is.")
rows = []
for k, e in S["exits"].items():
    km = e["km"]
    for g, (a, b) in GROUP_RANGE.items():
        near = km is not None and a <= km <= b
        is_venue_exit = k == {"bulacan": "cdvpharena", "clark": "dau"}[g]
        if TREE:
            # The tree model's typical multiplier for this exit (past nights), with its held-out 80% range.
            up = S["typical"].get(g, {}).get(k, 1.0) if near else 1.0
            lo, hi = (up * S["band"][0], up * S["band"][1]) if near else (1.0, 1.0)
        elif champ == 1 or not near or (champ == 10 and not is_venue_exit):
            up, lo, hi = 1.0, 1.0, 1.0
        elif champ in (2, 10):
            up, lo, hi = S["served"]["flat"]
        else:
            pe = S["served"]["per_exit"].get(g, {}).get(k)
            if pe:
                up, lo, hi = pe["median"], pe["ci"][0], pe["ci"][1]
            else:
                up, lo, hi = S["served"]["flat"]
        normals = [v for v in e["normal_by_weekday"].values() if v]
        base = float(np.mean(normals)) if normals else None
        rows.append(dict(exit_name=e["name"], venue_group=g, event_name=GROUP_LABEL[g],
                         baseline_volume=None if base is None else int(round(base)),
                         surge_volume=None if base is None else int(round(base * up)),
                         uplift=up, uplift_lo=lo, uplift_hi=hi,
                         extra_vehicles=None if base is None else int(round(base * (up - 1))),
                         n_events=S["event_nights_scored"],
                         material=bool(near and (TREE or (champ != 1 and lo > 1.0))),
                         anchor_exit=ANCHOR[g], first_event=S["calendar_counts"]["first"],
                         last_event=S["calendar_counts"]["last"], holiday_factor=e["holiday_factor"]))
R = pd.DataFrame(rows)
METHOD = (f"Protocol section 9 (verified calendar, {S['event_nights_scored']} real show nights to {S['real_end']}): "
          f"{S['champion']} - {S['note']}. Normal day = same weekday over the last 8 real weeks (non-event, "
          "non-holiday days), times the exit's holiday factor on a public holiday; applied to the exits near the "
          "venue (km 20-39 for Arena/Stadium, km 72-88 for Clark).")
R["method"] = METHOD
print(R[R.material][["exit_name", "venue_group", "baseline_volume", "uplift", "uplift_lo", "uplift_hi",
                     "extra_vehicles"]].to_string(index=False))
normal_rows = [(e["name"], int(w), v) for e in S["exits"].values() for w, v in e["normal_by_weekday"].items() if v]

# ── 3. Leaderboard and replay ──
NAMES = {1: "No adjustment (baseline)", 2: "Flat uplift (baseline)", 3: "Per-exit uplift", 4: "Venue + day",
         5: "+ event class", 6: "+ run", 8: "Gradient Boosting", 9: "Random Forest", 10: "Event uplift at the venue exit"}
order = [champ] + sorted((m for m in NAMES if m != champ and NAMES[m] in S["table"]),
                         key=lambda m: S["table"][NAMES[m]]["near the venue"])
metrics = []
for rank, m in enumerate(order, start=1):
    name = NAMES[m]
    sc = S["table"][name]
    iv = S["intervals"].get(name)
    diag = (f"held-out WMAPE near the venue {sc['near the venue']:.2f}% (CDV/Dau {sc['CDV/Dau anchor']:.2f}%, all exits "
            f"{sc['all exits']:.2f}%)")
    if iv:
        diag += (f"; difference vs no adjustment {iv['vs_no_adjustment'][0]:+.2f} to {iv['vs_no_adjustment'][1]:+.2f}, "
                 f"vs flat {iv['vs_flat'][0]:+.2f} to {iv['vs_flat'][1]:+.2f} (95%, {iv['nights']} nights)")
    accepted = bool(iv and iv["vs_no_adjustment"][1] < 0 and iv["vs_flat"][1] < 0)
    metrics.append((name, sc["near the venue"], rank, accepted or m == champ,
                    None if (accepted or m == champ) else "does not beat both baselines with a 95% interval", diag))

T = P[(P.m == champ) & P.near].groupby("date").agg(p=("pred", "sum"), a=("v", "sum"), n=("k", "size")).reset_index()
T["err"] = (T.p - T.a).abs() / T.a * 100
best, worst = T.loc[T.err.idxmin()], T.loc[T.err.idxmax()]
NA = P[(P.m == 1) & P.near]
desc = S["description"]
payload = {
    "model": S["champion"], "events_total": S["calendar_counts"]["held_nights_at_venues"],
    "events_train": S["event_nights_scored"] - S["test_nights"], "events_test": S["test_nights"],
    "test_from": S["test_from"], "exit_days_scored": int(len(P[(P.m == champ) & P.near])),
    "wmape": S["table"][S["champion"]]["near the venue"],
    "baseline_wmape": float(np.abs(NA.pred - NA.v).sum() / NA.v.sum() * 100),
    "median_day_error_pct": float(T.err.median()),
    "series": [{"t": r.date.strftime("%Y-%m-%d"), "p": int(round(r.p)), "a": int(round(r.a)), "n": int(r.n)}
               for r in T.itertuples()],
    "examples": [{"kind": "closest call", "t": best.date.strftime("%Y-%m-%d"), "predicted": int(best.p), "actual": int(best.a)},
                 {"kind": "widest miss", "t": worst.date.strftime("%Y-%m-%d"), "predicted": int(worst.p), "actual": int(worst.a)}],
    "anchor_exit": "CDV/PH Arena",
    "anchor_uplift": (S["typical"]["bulacan"].get("cdvpharena") if TREE else
                      float(S["served"]["flat"][0]) if champ in (2, 10) else None),
    "material_exits": int(R[(R.venue_group == "bulacan") & R.material].shape[0]),
    "total_exits": int(R[R.venue_group == "bulacan"].shape[0]),
    "method": METHOD,
    "basis": {
        "protocol": S["protocol"], "calendar": "silver.arena_events_verified",
        "calendar_counts": S["calendar_counts"],
        "sources": "official venue / promoter / artist / ticketing pages, Billboard, established Philippine news "
                   "outlets; never Wikipedia; one source link per show night",
        "by_venue": desc.get("venue"), "by_origin": desc.get("act origin"), "by_format": desc.get("format"),
        "by_weekend": desc.get("weekend"), "near_all_nights": desc.get("flat_near_all_nights"),
        "per_1000_attendees": S.get("per_1000_attendees"), "attendance_test": S.get("attendance_test"),
        "far_normal": S.get("far_normal"), "far_normal_choice": S.get("far_normal_choice"),
        "intervals": S.get("intervals"), "baseline_tie": S.get("baseline_tie"),
    },
}
print(f"\n  replay: {len(T)} held-out nights, typical night off by {payload['median_day_error_pct']:.1f}% "
      f"(near-venue exits); ignoring the event {payload['baseline_wmape']:.2f}% vs served {payload['wmape']:.2f}%")

def clean(o):
    """JSON for PostgreSQL: NaN / infinity (e.g. a group with one night has no interval) become null."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (float, np.floating)):
        return float(o) if np.isfinite(o) else None
    if isinstance(o, np.integer):
        return int(o)
    return o


payload = clean(payload)
json.dumps(payload, allow_nan=False)   # fails here, before any write, if anything non-finite is left

if DRY:
    print("\n  --dry-run: nothing written")
    raise SystemExit(0)

# ── 4. Write, one transaction ──
banner("STEP 3: publishing")
with psycopg2.connect(PG) as conn, conn.cursor() as cur:
    # The table is kept (not dropped): two columns are added if missing and its rows are replaced, all in this one
    # transaction, so a failure anywhere leaves the published rows as they were.
    cur.execute("""CREATE TABLE IF NOT EXISTS gold.ml_event_surge_forecast (
        id serial PRIMARY KEY, exit_name text NOT NULL, event_name text NOT NULL,
        baseline_volume int, surge_volume int, uplift numeric(8,4), uplift_lo numeric(8,4), uplift_hi numeric(8,4),
        extra_vehicles int, n_events int, material boolean, method text, anchor_exit text, threshold numeric(6,3),
        first_event date, last_event date, updated_at timestamptz DEFAULT now())""")
    cur.execute("""ALTER TABLE gold.ml_event_surge_forecast ADD COLUMN IF NOT EXISTS venue_group text,
                   ADD COLUMN IF NOT EXISTS holiday_factor numeric(8,4)""")
    cur.execute("DELETE FROM gold.ml_event_surge_forecast")
    cur.execute("""COMMENT ON TABLE gold.ml_event_surge_forecast IS 'Served event multiplier per exit and venue group,
        from verified show nights (silver.arena_events_verified) under EVALUATION_PROTOCOL.md section 9. Written by
        smartflow_scripts/3_training_testing/events/train_event_effect.py.'""")
    for r in R.itertuples():
        cur.execute("""INSERT INTO gold.ml_event_surge_forecast (exit_name, venue_group, event_name, baseline_volume,
            surge_volume, uplift, uplift_lo, uplift_hi, extra_vehicles, n_events, material, method, anchor_exit,
            first_event, last_event, holiday_factor) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (r.exit_name, r.venue_group, r.event_name, r.baseline_volume, r.surge_volume, r.uplift,
                     r.uplift_lo, r.uplift_hi, r.extra_vehicles, r.n_events, r.material, r.method, r.anchor_exit,
                     r.first_event, r.last_event, r.holiday_factor))
    # Per-event forecasts (a tree champion gives each upcoming verified night its own multiplier per exit).
    cur.execute("""CREATE TABLE IF NOT EXISTS gold.ml_event_forecast_dated (event_date date, act text, title text,
        venue text, venue_group text, exit_name text, multiplier numeric(8,4), mult_lo numeric(8,4),
        mult_hi numeric(8,4), model text, source_url text, updated_at timestamptz DEFAULT now(),
        PRIMARY KEY (event_date, venue_group, exit_name))""")
    cur.execute("DELETE FROM gold.ml_event_forecast_dated")
    if TREE:
        for ev in S["dated"]:
            a_, b_ = {"bulacan": (20, 39), "clark": (72, 88)}[ev["grp"]]
            for k, m in ev["exits"].items():
                km = S["exits"][k]["km"]
                if km is None or not a_ <= km <= b_:
                    continue
                cur.execute("""INSERT INTO gold.ml_event_forecast_dated (event_date, act, title, venue, venue_group,
                    exit_name, multiplier, mult_lo, mult_hi, model, source_url) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                            (ev["date"], ev["act"], ev["title"], ev["venue"], ev["grp"], S["exits"][k]["name"], m,
                             m * S["band"][0], m * S["band"][1], S["champion"], ev["source"]))
    cur.execute("""CREATE TABLE IF NOT EXISTS gold.ml_event_normal (exit_name text, dow int, normal int,
        real_end date, updated_at timestamptz DEFAULT now(), PRIMARY KEY (exit_name, dow))""")
    cur.execute("TRUNCATE gold.ml_event_normal")
    for name, dow, v in normal_rows:
        # dow as Python's weekday (Monday 0); stored as PostgreSQL's EXTRACT(DOW) (Sunday 0).
        cur.execute("INSERT INTO gold.ml_event_normal (exit_name, dow, normal, real_end) VALUES (%s,%s,%s,%s)",
                    (name, (dow + 1) % 7, v, S["real_end"]))
    cur.execute("DELETE FROM gold.ml_model_metrics WHERE target = 'Event Surge'")
    for name, wm, rank, acc, reason, diag in metrics:
        cur.execute("""INSERT INTO gold.ml_model_metrics (model_name, target, wmape, rank, accepted, rejected_reason,
            diagnosis, updated_at) VALUES (%s, 'Event Surge', %s, %s, %s, %s, %s, now())""",
                    (name, wm, rank, acc, reason, diag))
    cur.execute("""CREATE TABLE IF NOT EXISTS gold.ml_event_surge_eval (
        id int PRIMARY KEY DEFAULT 1, payload jsonb NOT NULL, updated_at timestamptz DEFAULT now())""")
    cur.execute("""INSERT INTO gold.ml_event_surge_eval (id, payload, updated_at) VALUES (1, %s, now())
        ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()""", (json.dumps(payload),))
print(f"  written: {len(R)} exit rows, {len(normal_rows)} normal-day rows, {len(metrics)} leaderboard rows, replay + basis")
