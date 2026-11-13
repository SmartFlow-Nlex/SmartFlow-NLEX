"""
Event surge per exit — measured against the real Philippine Arena calendar.

WHY THIS REPLACES THE 2026-09 VERSION
  The previous build_event_surge.py identified event days FROM TRAFFIC, because
  when it was written no event calendar was available:

      event_days = days where the CDV/PH Arena exit ran >= 1.45x its own
                   weekday+month median

  It then measured the uplift at that same exit on those same days. That is
  circular: a day qualifies BECAUSE the anchor was busy, so the anchor's uplift
  cannot come out near 1.0 no matter what the arena did. It reported 1.59x.

  Measured against the arena's actual calendar the same exit rises 1.15x. The
  old figure was roughly four times the real effect, and the 48 "event days" it
  reported were never checked against the calendar at all — any holiday, long
  weekend or diversion that pushed CDV above the threshold became a
  "Philippine Arena event day". The dashboard then labelled them as such.

  The calendar now exists — silver.philippine_arena_events_clean, which the
  backend already uses to forecast UPCOMING events. So the pipeline was
  internally inconsistent: upcoming forecasts used real event dates, multiplied
  by an uplift measured on inferred ones.

WHAT THIS DOES INSTEAD
  Event days come from the calendar. Nothing selects a day by how busy it was,
  so the measured uplift is free to be small - and at most exits it is.

THE NORMAL DAY IS LOCAL IN TIME (10 Nov 2026)
  Each exit-day's normal is the MEDIAN of that exit on the same weekday over the
  8 weeks BEFORE it (at least 4 of the 8 usable), counting only days that are
  neither an Arena event, a holiday, nor a broken toll day. It was a 2022-2024
  median by exit x weekday x month; traffic grew ~25% since, and non-event days
  after the test cut ran 1.108x that old normal, so most of the measured "event
  uplift" on recent events was growth, not the arena.

  Holidays are a separate regime (a concert on New Year's Eve is not a normal
  Tuesday with a concert on it): each exit gets a holiday factor, its median
  ratio to its own trailing normal on non-event holidays, and a holiday's
  expected volume is the trailing normal times that factor. Uplift is the
  median ratio of event-day volume to that expectation, with a bootstrap 95%
  interval; an exit counts as materially affected only when the lower bound
  clears 1.0.

HOW IT IS TESTED
  Event days are split CHRONOLOGICALLY: the earlier ones fit the uplift, the
  later ones are held out. Only REAL toll days are used: days after 2026-05-24
  (25 May - 30 Jun 2026 hold broken and synthetic days; the 2026-06-27 event
  was one) and near-empty days inside the record are left out. Every candidate
  and baseline is scored by WMAPE on the same held-out exit-days.

  Acceptance (fixed before results): a method is accepted only if it beats BOTH
  baselines a person could use without any model — predict the normal day and
  ignore the event, and apply one corridor-wide multiplier — AND the dashboard
  can serve it. The champion is the best accepted method, with a bootstrap 95%
  interval (over held-out event days) for its lead over the runner-up and over
  the better baseline; a lead whose interval includes 0 goes to the simpler
  method. If nothing is accepted, the better baseline is what gets written.

  What the dashboard serves (Back-End/src/services/traffic.service.ts,
  getMLEventSurge / getUpcomingEventSurge): a baseline per exit times the
  `uplift` this script writes. So only "normal x a per-exit multiplier" methods
  are servable; the gradient-boosting comparator is scored as a reference and
  cannot be champion (the backend has no way to run it). The backend's CURRENT
  baseline is the all-history weekday x month median, which this run also
  scores ("Served today ..."): it carries the same growth bias, and the change
  it needs is printed at the end (STEP 7).

  The run also writes a REPLAY - every held-out event day, predicted corridor
  volume next to what actually arrived - so the card can show the comparison
  rather than only assert an error rate.

LIMITS, carried into the table so the panel can show them
  - Attendance is not in the calendar, so a sold-out concert and a small
    exhibition carry the same prediction. This is the largest single source of
    remaining error.
  - The uplift is an average of what past events did. It is a planning input,
    not a promise about one future night.
  - The test builds each event's normal from the 8 weeks before it; an upcoming
    event months past the last toll day can only use the last 8 weeks there are.
  - Exits far from the arena show no reliable effect; they are reported as
    not material rather than given a decorative multiplier.

Usage:
    python build_event_surge.py --dry-run     # compute, score and print everything; write NOTHING (read-only DB session)
    python build_event_surge.py               # + replace gold.ml_event_surge_forecast / Event Surge metrics / eval
"""
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from sklearn.ensemble import GradientBoostingRegressor

warnings.filterwarnings("ignore")

# --dry-run: compute, score and print everything, write nothing.
DRY_RUN = "--dry-run" in sys.argv

# Credentials come from Back-End/.env, never from this file: the version of
# this script in commit 54087f4 carried the production password in plain text.
_env = {}
for _line in (Path(__file__).resolve().parents[2] / "Back-End" / ".env").read_text().splitlines():
    if "=" in _line and not _line.startswith("#"):
        _k, _v = _line.split("=", 1)
        _env[_k.strip()] = _v.strip().strip('"')
PG = (f"host={_env['PG_HOST']} port={_env.get('PG_PORT', 5432)} dbname={_env['PG_DATABASE']} "
      f"user={_env['PG_USER']} password={_env['PG_PASSWORD']} sslmode=require")

ANCHOR_HINT = "CDV"        # the exit serving the Philippine Arena
TEST_FRACTION = 0.30       # share of event days held out, chronologically
MIN_EVENTS = 8             # an exit needs this many clean event days to be judged
BOOTSTRAP = 2000
RNG = np.random.default_rng(42)
# Last day of REAL toll data (smartflow_scripts/3_training_testing/EVALUATION_PROTOCOL.md section 1).
try:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "smartflow_scripts" / "3_training_testing"))
    from common.rolling_eval import REAL_END_VOLUME
except Exception:
    REAL_END_VOLUME = pd.Timestamp("2026-05-24")
NORMAL_WEEKS = 8           # the trailing normal: same weekday over the previous 8 weeks
NORMAL_MIN = 4             # ... of which at least 4 must be usable days
BROKEN_SHARE = 0.5         # a corridor day under half its trailing 28-day median is a broken upload, not traffic
K_SHRINK = 12.0
NAME_NONE = "No event adjustment (baseline)"
NAME_FLAT = "Flat uplift (baseline)"
NAME_PER = "Per-exit uplift"
NAME_SHRUNK = "Per-exit uplift, shrunk"
NAME_GB = "Gradient Boosting (reference, not servable)"
NAME_PER_MAT = "Per-exit uplift, material exits only"
NAME_SERVED_TODAY = "Served today: weekday x month median x per-exit uplift"
NAME_SERVED_TODAY_MAT = "Served today, upcoming-events path (material exits only)"
# The upcoming-events card (getUpcomingEventSurge) shows a surge only at MATERIAL exits (interval clears 1.0) and
# leaves every other exit at its normal day; the single-date card applies every exit's uplift. Both are scored.
SERVABLE = {NAME_PER, NAME_SHRUNK, NAME_PER_MAT}
COMPLEXITY = {NAME_NONE: 0, NAME_FLAT: 1, NAME_PER: 2, NAME_PER_MAT: 3, NAME_SHRUNK: 4}


def banner(t):
    print("\n" + "=" * 72 + f"\n  {t}\n" + "=" * 72)


def wmape(pred, actual):
    """Weighted MAPE: total absolute error as a share of total actual volume.
    Weighted, so a big exit's miss counts for more than a small one's."""
    denom = np.sum(np.abs(actual))
    return float(np.sum(np.abs(pred - actual)) / denom * 100) if denom else float("nan")


conn = psycopg2.connect(PG)
if DRY_RUN:
    conn.set_session(readonly=True)  # the server refuses any write on this session

# ── 1. Data ─────────────────────────────────────────────────────────────────
banner("STEP 1: Daily volume per exit, and the event calendar")
d = pd.read_sql_query("""
    SELECT date, exit_canonical AS ex, SUM(total)::float AS v
    FROM gold.fact_traffic_hourly GROUP BY 1, 2 ORDER BY 1""", conn)
d["date"] = pd.to_datetime(d.date)
print(f"  {len(d):,} exit-days | {d.date.min().date()} -> {d.date.max().date()} | {d.ex.nunique()} exits")
# Real days only: after REAL_END_VOLUME the record still holds broken and synthetic days.
d = d[d.date <= REAL_END_VOLUME].copy()
corr = d.groupby("date").v.sum().sort_index()
corr = corr.reindex(pd.date_range(corr.index.min(), corr.index.max(), freq="D"))
trail = corr.shift(1).rolling(28, min_periods=14).median()
BROKEN = set(corr.index[(corr < BROKEN_SHARE * trail) | corr.isna()])
print(f"  real days only: to {REAL_END_VOLUME.date()}; {len(BROKEN)} broken or missing day(s) inside it left out"
      + (f" ({', '.join(str(x.date()) for x in sorted(BROKEN)[:12])}{' ...' if len(BROKEN) > 12 else ''})" if BROKEN else ""))
d = d[~d.date.isin(BROKEN)].copy()
d["dow"] = d.date.dt.dayofweek
d["m"] = d.date.dt.month

cal = pd.read_sql_query("""
    SELECT DISTINCT event_date::date AS d FROM silver.philippine_arena_events_clean
    WHERE event_date IS NOT NULL ORDER BY 1""", conn)
cal["d"] = pd.to_datetime(cal.d)
all_events = sorted(cal.d)
ALL_EV = set(all_events)  # every calendar event, so none can inflate a normal day
dropped_ev = [t for t in all_events if d.date.min() <= t and (t > REAL_END_VOLUME or t in BROKEN)]
hol = pd.read_sql_query("SELECT DISTINCT date_day::date AS d FROM public.ph_holidays", conn)
hol["d"] = pd.to_datetime(hol.d)
HOLIDAYS = set(hol.d)
d["is_hol"] = d.date.isin(HOLIDAYS)
anchor_name = sorted(x for x in d.ex.unique() if ANCHOR_HINT.lower() in x.lower())[0]

# ── The trailing normal for every exit-day ─────────────────────────────────
# Median of the same weekday over the previous NORMAL_WEEKS weeks, using only ordinary days (not an event, not a
# holiday, not broken): known the day before, and local enough that growth does not leak into the "uplift".
wide = d.pivot_table(index="date", columns="ex", values="v")
wide = wide.reindex(pd.date_range(wide.index.min(), wide.index.max(), freq="D"))
ordinary = wide.copy()
ordinary.loc[ordinary.index.isin(ALL_EV) | ordinary.index.isin(HOLIDAYS)] = np.nan
stack = np.stack([ordinary.shift(7 * k).values for k in range(1, NORMAL_WEEKS + 1)])
count = np.isfinite(stack).sum(axis=0)
with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    med = np.nanmedian(stack, axis=0)
med[count < NORMAL_MIN] = np.nan
normal = pd.DataFrame(med, index=wide.index, columns=wide.columns).stack().rename("normal").reset_index()
normal.columns = ["date", "ex", "normal"]
d = d.merge(normal, on=["date", "ex"], how="left")

events = [t for t in all_events if t in set(d.date) and t not in BROKEN]
events = [t for t in events if d.loc[d.date == t, "normal"].notna().any()]
print(f"  calendar: {len(all_events)} event days total, {len(events)} on real toll days with a trailing normal; "
      f"left out: {', '.join(str(t.date()) for t in dropped_ev) or 'none'} (not real toll days)")
print("  event days come from silver.philippine_arena_events_clean — nothing is inferred from traffic")
print(f"  anchor exit (serves the arena): {anchor_name}")
print(f"  holidays: {len(HOLIDAYS)} dates from public.ph_holidays; "
      f"{len([t for t in events if t in HOLIDAYS])} event days fall on one")
print(f"  normal day = median of the same weekday over the previous {NORMAL_WEEKS} weeks (>= {NORMAL_MIN} ordinary days)")
if len(events) < MIN_EVENTS * 2:
    raise SystemExit(f"only {len(events)} usable event days — too few to fit and test honestly")

# ── 2. Chronological split ──────────────────────────────────────────────────
banner("STEP 2: Splitting the event days in time")
n_test = max(MIN_EVENTS, int(round(len(events) * TEST_FRACTION)))
train_ev, test_ev = set(events[:-n_test]), set(events[-n_test:])
cut = min(test_ev)
print(f"  fit  {len(train_ev)} events  {min(train_ev).date()} -> {max(train_ev).date()}")
print(f"  test {len(test_ev)} events  {cut.date()} -> {max(test_ev).date()}  (never seen while fitting)")


def holiday_factor(pool):
    """Per-exit holiday factor: on non-event holidays in `pool`, the median ratio of volume to the trailing
    normal. Keeping holidays separate stops a holiday from being charged to the event."""
    h = pool[pool.is_hol & ~pool.date.isin(ALL_EV) & pool.normal.notna() & (pool.normal > 0)]
    hf = (h.v / h.normal).groupby(h.ex).median() if len(h) else pd.Series(dtype=float)
    return hf, (float(hf.median()) if len(hf) else 1.0), len(h)


def expect(frame, hf, hf0):
    out = frame[frame.normal.notna() & (frame.normal > 0)].copy()
    out["exp"] = out.normal.values * np.where(out.is_hol.values, out.ex.map(hf).fillna(hf0).values, 1.0)
    return out


# Holiday factor from days before the cut only, so no test-window information reaches it.
hf_pre, hf0_pre, n_hol_pre = holiday_factor(d[d.date < cut])
print(f"  pre-cut holiday factor: {hf0_pre:.2f}x (median across exits, {n_hol_pre:,} non-event holiday exit-days)")
TR = expect(d[d.date.isin(train_ev)], hf_pre, hf0_pre)
TE = expect(d[d.date.isin(test_ev)], hf_pre, hf0_pre)
TR["ratio"] = TR.v / TR["exp"]
TE["ratio"] = TE.v / TE["exp"]
TE = TE.sort_values(["date", "ex"]).reset_index(drop=True)
print(f"  {len(TR):,} exit-days to fit | {len(TE):,} exit-days to score")
# How much of the old "uplift" was growth: ordinary days after the cut against the old 2022-cut normal.
old_pool = d[(d.date < cut) & ~d.date.isin(ALL_EV) & ~d.is_hol]
old_nrm = old_pool.groupby(["ex", "dow", "m"]).v.median().rename("old_exp").reset_index()
post_ord = d[(d.date >= cut) & ~d.date.isin(ALL_EV) & ~d.is_hol].merge(old_nrm, on=["ex", "dow", "m"], how="inner")
drift_old = float(post_ord.v.sum() / post_ord.old_exp.sum())
post_ord2 = post_ord[post_ord.normal.notna()]
drift_new = float(post_ord2.v.sum() / post_ord2.normal.sum())
print(f"  ordinary (non-event, non-holiday) days after the cut run {drift_old:.3f}x the old weekday x month normal "
      f"and {drift_new:.3f}x the trailing normal")

# ── 3. Candidate models ─────────────────────────────────────────────────────
banner("STEP 3: Candidates, scored on held-out event days")


def boot_ci(x):
    """Bootstrap 95% interval for the median ratio. With effects this small the
    question 'is this rise real?' has to be answered by an interval, not by a
    quartile that happens to sit above 1."""
    if len(x) < 3:
        return float("nan"), float("nan")
    draws = RNG.choice(x, size=(BOOTSTRAP, len(x)), replace=True)
    meds = np.median(draws, axis=1)
    return float(np.percentile(meds, 2.5)), float(np.percentile(meds, 97.5))


flat_uplift = float(TR.ratio.median())
per_exit = TR.groupby("ex").ratio.median()
n_by_exit = TR.groupby("ex").ratio.size()
# Shrinkage: an exit with 6 clean event days should not be trusted as far as
# one with 70. Each exit's multiplier is pulled toward the corridor-wide one in
# proportion to how little evidence it has (James-Stein in spirit; k is the
# number of events at which own-evidence and corridor evidence weigh equally).
shrunk = {ex: (n_by_exit[ex] * per_exit[ex] + K_SHRINK * flat_uplift) / (n_by_exit[ex] + K_SHRINK)
          for ex in per_exit.index}
# Material on the TRAINING events only (the same rule STEP 4 applies to all events): the interval clears 1.0.
material_train = {ex for ex, grp in TR.groupby("ex") if len(grp) >= MIN_EVENTS and boot_ci(grp.ratio.values)[0] > 1.0}
print(f"  material on the training events: {', '.join(sorted(material_train)) or 'none'}")

preds = {
    NAME_NONE: TE["exp"].values,
    NAME_FLAT: TE["exp"].values * flat_uplift,
    NAME_PER: TE["exp"].values * TE.ex.map(per_exit).fillna(flat_uplift).values,
    NAME_SHRUNK: TE["exp"].values * TE.ex.map(shrunk).fillna(flat_uplift).values,
    NAME_PER_MAT: TE["exp"].values * np.where(TE.ex.isin(material_train), TE.ex.map(per_exit).fillna(1.0).values, 1.0),
}

# What the backend serves TODAY, replayed on the test events: its baseline is the median of ordinary days (no
# event, no holiday) with the same weekday and month over all history it has (here: before the cut), with NO
# holiday factor, times the table's per-exit uplift - measured the way the previous version of this script did
# (event-day volume against that same weekday x month normal, holiday-adjusted, on the training events).
_old = d[(d.date < cut)]
_ord = _old[~_old.date.isin(ALL_EV) & ~_old.is_hol]
_nrm = _ord.groupby(["ex", "dow", "m"]).v.median().rename("wm").reset_index()
_hd = _old[_old.is_hol & ~_old.date.isin(ALL_EV)].merge(_nrm, on=["ex", "dow", "m"], how="inner")
_hf_old = (_hd.v / _hd.wm).groupby(_hd.ex).median()
_hf0_old = float(_hf_old.median()) if len(_hf_old) else 1.0
_tr_old = d[d.date.isin(train_ev)].merge(_nrm, on=["ex", "dow", "m"], how="inner")
_tr_old["e"] = _tr_old.wm * np.where(_tr_old.is_hol, _tr_old.ex.map(_hf_old).fillna(_hf0_old), 1.0)
_uplift_old = (_tr_old.v / _tr_old.e).groupby(_tr_old.ex).median()
_te_wm = TE[["ex", "dow", "m"]].merge(_nrm, on=["ex", "dow", "m"], how="left")["wm"].values
preds[NAME_SERVED_TODAY] = _te_wm * TE.ex.map(_uplift_old).fillna(float(_uplift_old.median())).values
_mat_old = {ex for ex, grp in _tr_old.assign(r=_tr_old.v / _tr_old.e).groupby("ex")
            if len(grp) >= MIN_EVENTS and boot_ci(grp.r.values)[0] > 1.0}
preds[NAME_SERVED_TODAY_MAT] = _te_wm * np.where(TE.ex.isin(_mat_old), TE.ex.map(_uplift_old).fillna(1.0).values, 1.0)

# A learned comparator, given the same information the multipliers get plus the calendar features, fitted on every
# day before the cut so it can learn what an ordinary day looks like as well as an event one. Scored as a
# reference: the backend cannot serve it.
fit_src = expect(d[d.date < cut], hf_pre, hf0_pre)
ex_codes = {e: i for i, e in enumerate(sorted(d.ex.unique()))}


def feats(frame):
    return np.column_stack([
        frame.ex.map(ex_codes).fillna(-1).values,
        frame.dow.values, frame.m.values, frame["exp"].values,
        frame.date.isin(ALL_EV).astype(float).values,
        frame.is_hol.astype(float).values,
    ])


gb = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, random_state=42)
gb.fit(feats(fit_src), fit_src.v.values)
preds[NAME_GB] = gb.predict(feats(TE))
print(f"  Gradient Boosting fitted on {len(fit_src):,} exit-days before {cut.date()}")

actual = TE.v.values
ok = np.all([np.isfinite(p) for p in preds.values()], axis=0)
if (~ok).any():
    print(f"  {int((~ok).sum())} held-out exit-day(s) without a weekday x month normal are left out for every method")
TE, actual = TE[ok].reset_index(drop=True), actual[ok]
preds = {k: v[ok] for k, v in preds.items()}

rows = [{"model": k, "wmape": wmape(p, actual),
         "mae": float(np.mean(np.abs(p - actual))),
         "mape": float(np.mean(np.abs(p - actual) / np.where(actual == 0, np.nan, actual)) * 100)}
        for k, p in preds.items()]
res = pd.DataFrame(rows).sort_values("wmape").reset_index(drop=True)
score = dict(zip(res.model, res.wmape))
best_base = min((NAME_NONE, NAME_FLAT), key=lambda k: score[k])
# Acceptance (fixed before results): beats BOTH baselines, and the backend can serve it.
res["accepted"] = res.model.isin(SERVABLE) & (res.wmape < score[NAME_NONE]) & (res.wmape < score[NAME_FLAT])

# Bootstrap over held-out EVENT DAYS (an event day's exits move together, so they are drawn together).
_days = TE.date.values
_uniq = np.unique(_days)
_idx = [np.where(_days == u)[0] for u in _uniq]


def boot_diff(a, b, reps=BOOTSTRAP):
    """95% interval of WMAPE(a) - WMAPE(b), resampling held-out event days (negative = a better)."""
    pa, pb = preds[a], preds[b]
    out = []
    for _ in range(reps):
        ix = np.concatenate([_idx[i] for i in RNG.integers(0, len(_idx), len(_idx))])
        out.append(wmape(pa[ix], actual[ix]) - wmape(pb[ix], actual[ix]))
    return float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))


accepted = list(res[res.accepted].model)
selection = {"rule": "accepted = servable AND beats both baselines; champion = lowest WMAPE; a lead over the "
                     "runner-up whose 95% interval includes 0 goes to the simpler method",
             "best_baseline": best_base, "accepted": accepted}
if accepted:
    champ_name = accepted[0]
    if len(accepted) > 1:
        ru = accepted[1]
        ci = boot_diff(champ_name, ru)
        selection.update(runner_up=ru, vs_runner_up_ci=list(ci), vs_runner_up_significant=bool(ci[1] < 0))
        if ci[1] >= 0 and COMPLEXITY.get(ru, 9) < COMPLEXITY.get(champ_name, 9):
            selection["note"] = f"{champ_name} led {ru} without a significant margin; the simpler {ru} wins"
            champ_name, selection["runner_up"] = ru, champ_name
    ci = boot_diff(champ_name, best_base)
    selection.update(vs_baseline_ci=list(ci), vs_baseline_significant=bool(ci[1] < 0))
else:
    champ_name = best_base
    selection["note"] = "no servable method beats both baselines; the better baseline is served"
selection["champion"] = champ_name
selection["vs_gradient_boosting_ci"] = list(boot_diff(champ_name, NAME_GB))
selection["served_today_vs_champion_ci"] = list(boot_diff(NAME_SERVED_TODAY, champ_name))
for _m in (NAME_PER, NAME_PER_MAT, NAME_SHRUNK):
    if _m != champ_name:
        selection[f"{_m} minus champion"] = list(boot_diff(_m, champ_name))
res["rank"] = None
order = [champ_name] + [m for m in accepted if m != champ_name]
for i, m in enumerate(order, 1):
    res.loc[res.model == m, "rank"] = i
if champ_name not in accepted:
    res.loc[res.model == champ_name, "accepted"] = True  # the served fallback

print(f"  {'model':<56}{'WMAPE':>9}{'MAE':>9}   verdict")
for r in res.itertuples():
    verdict = ("SERVED" if r.model == champ_name else "ACCEPTED" if r.accepted else
               "baseline" if "baseline" in r.model else "reference" if r.model in (NAME_GB, NAME_SERVED_TODAY, NAME_SERVED_TODAY_MAT)
               else "rejected")
    print(f"  {r.model:<56}{r.wmape:>8.3f}%{r.mae:>9,.0f}   {verdict}")
champ = res[res.model == champ_name].iloc[0]
no_adj = score[NAME_NONE]
print(f"\n  champion: {champ_name} at {champ.wmape:.3f}% vs {no_adj:.3f}% ignoring the event and "
      f"{score[NAME_FLAT]:.3f}% with one corridor multiplier")
for k, lab in (("vs_runner_up_ci", f"vs runner-up ({selection.get('runner_up')})"), ("vs_baseline_ci", f"vs {best_base}"),
               ("vs_gradient_boosting_ci", "vs Gradient Boosting (reference)"),
               ("served_today_vs_champion_ci", "served-today minus champion"),
               *[(f"{_m} minus champion", f"{_m} minus champion") for _m in (NAME_PER, NAME_PER_MAT, NAME_SHRUNK)]):
    if k in selection:
        lo, hi = selection[k]
        sig = "significant" if (hi < 0 or lo > 0) else "NOT significant"
        print(f"  {lab}: WMAPE difference 95% interval [{lo:+.3f}, {hi:+.3f}] points ({sig})")
if selection.get("note"):
    print(f"  note: {selection['note']}")

# ── 4. Uplift per exit, with an honest interval ─────────────────────────────
banner("STEP 4: Uplift per exit, over every usable calendar event day")
hf_all, hf0_all, n_hol_all = holiday_factor(d)
E = expect(d[d.date.isin(set(events))], hf_all, hf0_all)
E["ratio"] = E.v / E["exp"]
E["extra"] = E.v - E["exp"]
print(f"  full-history holiday factor {hf0_all:.2f}x ({n_hol_all:,} non-event holiday exit-days)")


flat_all = float(E.ratio.median())
g = []
for ex, grp in E.groupby("ex"):
    lo, hi = boot_ci(grp.ratio.values)
    measured = float(grp.ratio.median())
    n = len(grp)
    # The SERVED multiplier is the champion's, refitted on every usable event (protocol section 7).
    material_ex = (lo > 1.0) and n >= MIN_EVENTS
    served = {NAME_PER: measured,
              NAME_PER_MAT: measured if material_ex else 1.0,
              NAME_SHRUNK: (n * measured + K_SHRINK * flat_all) / (n + K_SHRINK),
              NAME_FLAT: flat_all,
              NAME_NONE: 1.0}[champ_name]
    g.append({"ex": ex, "n": n, "measured": measured, "uplift": served,
              "lo": lo, "hi": hi, "extra": float(grp.extra.median()),
              "baseline": float(grp["exp"].median()), "surge": float(grp.v.median()),
              "holiday_factor": float(hf_all.get(ex, hf0_all))})
g = pd.DataFrame(g)
# Material only when the whole 95% interval sits above a normal day AND there
# is enough evidence to have formed one.
g["material"] = (g.lo > 1.0) & (g.n >= MIN_EVENTS) & (champ_name != NAME_NONE)
g = g.sort_values("extra", ascending=False)

print(f"  {'exit':<26}{'n':>5}{'measured':>10}{'served':>9}{'95% CI':>14}{'extra veh/day':>15}   material")
for r in g.itertuples():
    ci = f"{r.lo:.2f}-{r.hi:.2f}" if np.isfinite(r.lo) else "--"
    print(f"  {r.ex:<26}{r.n:>5}{r.measured:>9.3f}x{r.uplift:>8.3f}x{ci:>14}{r.extra:>15,.0f}   {'YES' if r.material else 'no'}")
tot = g.loc[g.material, "extra"].sum()
print(f"\n  corridor-wide extra on an event day: {tot:,.0f} vehicles across "
      f"{int(g.material.sum())} of {len(g)} exits")

# ── 5. The replay: every held-out event day, predicted vs actual ────────────
banner("STEP 5: Replay of the held-out events")
best_pred = preds[champ_name]
rep = TE[["date", "ex"]].copy()
rep["pred"] = best_pred
rep["act"] = actual
day = (rep.groupby("date").agg(p=("pred", "sum"), a=("act", "sum"), n=("ex", "size"))
       .reset_index().sort_values("date"))
day_err = (day.p - day.a).abs() / day.a * 100
METHOD = ("event days from silver.philippine_arena_events_clean, real toll days only; normal day = median of the "
          f"same weekday over the previous {NORMAL_WEEKS} weeks (non-event, non-holiday days), times a per-exit "
          "holiday factor on public holidays; uplift = median event-day ratio with a bootstrap 95% interval; "
          f"served multiplier = {champ_name}")
replay = {
    "model": str(champ_name),
    "events_total": len(events), "events_train": len(train_ev), "events_test": len(test_ev),
    "test_from": cut.strftime("%Y-%m-%d"),
    "exit_days_scored": int(len(TE)),
    "wmape": float(champ.wmape), "baseline_wmape": no_adj,
    "flat_baseline_wmape": float(score[NAME_FLAT]),
    "served_today_wmape": float(score[NAME_SERVED_TODAY]),
    "served_today_upcoming_path_wmape": float(score[NAME_SERVED_TODAY_MAT]),
    "gradient_boosting_wmape": float(score[NAME_GB]),
    "selection": selection,
    "growth_check": {"post_cut_ordinary_vs_old_normal": drift_old, "post_cut_ordinary_vs_trailing_normal": drift_new},
    "excluded_event_days": [str(t.date()) for t in dropped_ev],
    "median_day_error_pct": float(day_err.median()),
    "series": [{"t": t.strftime("%Y-%m-%d"), "p": int(round(p)), "a": int(round(a)), "n": int(n)}
               for t, p, a, n in zip(day.date, day.p, day.a, day.n)],
    "anchor_exit": anchor_name,
    "anchor_uplift": float(g.loc[g.ex == anchor_name, "uplift"].iloc[0]) if (g.ex == anchor_name).any() else None,
    "material_exits": int(g.material.sum()), "total_exits": int(len(g)),
    "holiday_factor": round(hf0_all, 3),
    "holiday_event_days": len([t for t in events if t in HOLIDAYS]),
    "method": METHOD,
}
print(f"  {len(day)} held-out event days | corridor total off by a median of "
      f"{replay['median_day_error_pct']:.2f}% per event day")
_best = day.loc[day_err.idxmin()]
_worst = day.loc[day_err.idxmax()]
replay["examples"] = [
    {"kind": "closest call", "t": _best.date.strftime("%Y-%m-%d"), "predicted": int(_best.p), "actual": int(_best.a)},
    {"kind": "widest miss", "t": _worst.date.strftime("%Y-%m-%d"), "predicted": int(_worst.p), "actual": int(_worst.a)},
]
for e in replay["examples"]:
    print(f"    {e['kind']}: {e['t']} — predicted {e['predicted']:,}, actually {e['actual']:,}")

# ── 7 (printed before the write so a dry run shows it). What the backend needs ───────────────────────────
banner("STEP 7: What the dashboard serves, and the backend change it needs")
print(f"""  The backend multiplies `uplift` by ITS OWN baseline: the all-history median of ordinary days with the same
  weekday and month (traffic.service.ts getMLEventSurge / getUpcomingEventSurge). Replayed on these events that is
  "{NAME_SERVED_TODAY}": {score[NAME_SERVED_TODAY]:.3f}% WMAPE (upcoming-events path, material exits only:
  {score[NAME_SERVED_TODAY_MAT]:.3f}%) vs {champ.wmape:.3f}% for the champion — the
  baseline carries the traffic growth since 2022 and has no holiday factor. To serve what this run tests, the
  backend's `norm` CTE (both functions) should become the median of the exit's daily totals on the same weekday
  over the {NORMAL_WEEKS} weeks before the target date (or before the last toll day, for a date beyond it), counting
  only days that are not Arena events or holidays, times the exit's holiday factor (written to the new
  `holiday_factor` column) when the target is a holiday. For getUpcomingEventSurge:

    norm AS (
      SELECT u.d, t.plaza, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.v)::int AS baseline
      FROM up u
      JOIN daily t ON EXTRACT(DOW FROM t.date) = EXTRACT(DOW FROM u.d)
                  AND t.date <  LEAST(u.d, (SELECT MAX(date) + 1 FROM daily))
                  AND t.date >= LEAST(u.d, (SELECT MAX(date) + 1 FROM daily)) - {NORMAL_WEEKS * 7}
      GROUP BY 1, 2
    )

  and in the SELECT: n.baseline * f.uplift * CASE WHEN u.d IN (SELECT date_day FROM public.ph_holidays)
  THEN f.holiday_factor ELSE 1 END (same for surgeLo/surgeHi). getMLEventSurge's single-date `norm` CTE takes the
  same window relative to $1 instead of the weekday x month filter. `daily` already excludes event days and
  holidays; add `AND date <= '{REAL_END_VOLUME.date()}'` while the record's tail is synthetic. No other change: the
  per-exit multiplier written to `uplift` is the champion's. With no event adjustment served (uplift 1.0, no
  exit material), getUpcomingEventSurge's `JOIN ... AND f.material` returns no exits for any event: the card
  needs to show the normal day instead (a frontend/backend decision, not made here).""")

# ── 6. Write ────────────────────────────────────────────────────────────────
banner("STEP 6: Writing to AWS")
if DRY_RUN:
    print("  --dry-run: nothing written (read-only session). Rerun without the flag to publish.")
    conn.close()
    banner("DONE (dry run)")
    raise SystemExit(0)

cur = conn.cursor()
cur.execute("DROP TABLE IF EXISTS gold.ml_event_surge_forecast")
cur.execute("""
  CREATE TABLE gold.ml_event_surge_forecast (
    id serial PRIMARY KEY,
    exit_name text NOT NULL,
    event_name text NOT NULL,
    baseline_volume int, surge_volume int,
    uplift numeric(8,4), uplift_lo numeric(8,4), uplift_hi numeric(8,4),
    extra_vehicles int, n_events int, material boolean,
    method text, anchor_exit text, threshold numeric(6,3),
    first_event date, last_event date, updated_at timestamptz DEFAULT now(),
    measured_uplift numeric(8,4), holiday_factor numeric(8,4))""")
cur.execute("""COMMENT ON TABLE gold.ml_event_surge_forecast IS
  'Event-day uplift per exit, measured against the real Philippine Arena calendar (silver.philippine_arena_events_clean) on real toll days. The normal day is the median of the same weekday over the previous 8 weeks (non-event, non-holiday days), holiday-adjusted. uplift = the SERVED multiplier (the chosen method; see method), measured_uplift = the raw median ratio, uplift_lo/uplift_hi = its bootstrap 95% interval; material is true only when that interval clears 1.0. Written by All_Scripts/Predictive_Modeling/build_event_surge.py (10 Nov 2026: was a 2022-2024 weekday x month normal, which counted traffic growth as event uplift).'""")

label = "Philippine Arena event"
for r in g.itertuples():
    cur.execute("""INSERT INTO gold.ml_event_surge_forecast
        (exit_name, event_name, baseline_volume, surge_volume, uplift, uplift_lo, uplift_hi,
         extra_vehicles, n_events, material, method, anchor_exit, threshold, first_event, last_event, measured_uplift,
         holiday_factor)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (r.ex, label, int(round(r.baseline)), int(round(r.surge)),
         float(r.uplift), None if not np.isfinite(r.lo) else float(r.lo),
         None if not np.isfinite(r.hi) else float(r.hi),
         int(round(r.extra)), int(r.n), bool(r.material),
         METHOD, anchor_name, None, min(events).date(), max(events).date(), float(r.measured),
         float(r.holiday_factor)))

cur.execute("DELETE FROM gold.ml_model_metrics WHERE target = 'Event Surge'")
note = (f"held out {len(test_ev)} of {len(events)} calendar event days chronologically "
        f"({cut.date()} onward); {len(TE):,} exit-days scored")
for r in res.itertuples():
    reason = None
    if not r.accepted:
        reason = (f"{note}; " + ("reference only: the backend cannot serve it" if r.model == NAME_GB
                                 else "reference: the backend's current baseline" if r.model in (NAME_SERVED_TODAY, NAME_SERVED_TODAY_MAT)
                                 else "baseline" if "baseline" in r.model else "does not beat both baselines"))
    cur.execute("""INSERT INTO gold.ml_model_metrics
        (model_name, target, wmape, mape, mae, rank, accepted, rejected_reason, updated_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s, now())""",
        (r.model, "Event Surge", float(r.wmape), float(r.mape), float(r.mae),
         int(r.rank) if r.rank else None, bool(r.accepted), reason))

cur.execute("""CREATE TABLE IF NOT EXISTS gold.ml_event_surge_eval (
    id int PRIMARY KEY DEFAULT 1, payload jsonb NOT NULL, updated_at timestamptz DEFAULT now())""")
cur.execute("""INSERT INTO gold.ml_event_surge_eval (id, payload, updated_at) VALUES (1, %s, now())
               ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()""",
            (json.dumps(replay, default=float),))
conn.commit()
cur.execute("SELECT COUNT(*), COUNT(*) FILTER (WHERE material) FROM gold.ml_event_surge_forecast")
n, mat = cur.fetchone()
print(f"  wrote {n} exits ({mat} material), {len(res)} scored candidates, and the replay")
conn.close()
banner("DONE")
