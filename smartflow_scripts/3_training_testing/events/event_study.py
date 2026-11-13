"""
Event effect on NLEX daily volume, under EVALUATION_PROTOCOL.md section 9 (written 11 Nov 2026, before any of these
candidates was scored). Test-only: writes _work/cache/event_study.json/.csv and nothing to the database.

WHAT IS MEASURED
  For every verified show night (silver.arena_events_verified, or the CSV given with --calendar), at every exit:
      ratio = that night's daily volume / the exit's NORMAL day
  NORMAL = median of the same weekday over the previous 8 weeks, ordinary days only (not a verified event night, not
  a holiday, not a broken toll day), at least 4 of 8; on a holiday, times the exit's holiday factor.
  Only real toll days (to 2026-05-24). Traffic never decides whether a date was an event.

CANDIDATES (all servable as normal x multiplier)
  1 No adjustment (baseline)          multiplier 1
  2 Flat uplift (baseline)            one median ratio
  3 Per-exit uplift                   each exit's median ratio (the dashboard's method)
  4 Venue + day                       log ratio_e = sensitivity_e x strength(venue, weekend)
  5 + event class                     ... + act origin + format
  6 + run                             ... + nights in run + first night
  7 + reported attendance             ... + log attendance per night (scored on nights that have it, vs 5 there)
  Strength: Huber regression of the anchor exit's log ratio (CDV/PH Arena; Dau for Clark) on the features.
  Sensitivity: least squares through the origin of each exit's log ratio on the anchor's, same venue group.

TEST
  Leave-future-out: each event night in the later 40% by date is predicted by models fitted only on nights at least
  one day before it. WMAPE of vehicles over the exits near the venue (km 20-39 Arena/Stadium, km 72-88 Clark); also
  CDV alone and all exits. Bootstrap 95% intervals over event nights; section 6 / 9 rules choose.

ALSO
  * extra vehicles per 1,000 reported attendees, with a bootstrap interval (plausibility of candidate 7);
  * the normal day for FAR future dates: trailing 8-week median vs same-day-last-year scaled, on ordinary days 90-300
    days ahead.

Usage:
  python event_study.py --calendar path/to/arena_events_verified.csv     # before the table exists
  python event_study.py                                                   # reads silver.arena_events_verified
"""
import json
import re
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import HuberRegressor

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "config"))
from common.rolling_eval import REAL_END_VOLUME  # noqa: E402
from db import PG, WORK  # noqa: E402

ARGS = sys.argv[1:]
CAL_PATH = ARGS[ARGS.index("--calendar") + 1] if "--calendar" in ARGS else None
CACHE = Path(WORK) / "cache"
CACHE.mkdir(parents=True, exist_ok=True)
RNG = np.random.default_rng(42)
BOOT = 2000
# --weeks W: sensitivity check of the normal-day window (default 8, protocol section 9); at least half must be usable.
NORMAL_WEEKS = int(ARGS[ARGS.index("--weeks") + 1]) if "--weeks" in ARGS else 8
NORMAL_MIN = max(2, NORMAL_WEEKS // 2)
TAG = "" if NORMAL_WEEKS == 8 else f"_w{NORMAL_WEEKS}"
BROKEN_SHARE = 0.5
TEST_SHARE = 0.40
VENUES = {"Philippine Arena": "arena", "Philippine Sports Stadium": "stadium", "Clark Global City": "clark"}
GROUP = {"arena": "bulacan", "stadium": "bulacan", "clark": "clark"}
ANCHOR = {"bulacan": "cdvpharena", "clark": "dau"}
KM_RANGE = {"bulacan": (20, 39), "clark": (72, 88)}
NAMES = {1: "No adjustment (baseline)", 2: "Flat uplift (baseline)", 3: "Per-exit uplift",
         4: "Venue + day", 5: "+ event class", 6: "+ run", 7: "+ reported attendance",
         8: "Gradient Boosting", 9: "Random Forest", 10: "Event uplift at the venue exit"}
# Candidates 8-9 (added 12 Nov 2026, protocol section 9 correction 2): one row per exit-night, the class/run features
# plus where the exit is and how big its normal day is; fixed settings, never tuned on the test nights.
TREE_FEATURES = ["v_stadium", "v_clark", "weekend", "o_filipino", "o_mixed", "f_showcase", "f_festival", "f_sports",
                 "f_other", "run_multi", "first_night", "km_from_venue", "is_anchor_i", "log_normal", "is_hol_i"]
FEATURES = {4: ["v_stadium", "v_clark", "weekend"],
            5: ["v_stadium", "v_clark", "weekend", "o_filipino", "o_mixed", "f_showcase", "f_festival", "f_sports",
                "f_other"],
            6: ["v_stadium", "v_clark", "weekend", "o_filipino", "o_mixed", "f_showcase", "f_festival", "f_sports",
                "f_other", "run_multi", "first_night"]}
FEATURES[7] = FEATURES[5] + ["log_att"]


def key(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def banner(t):
    print("\n" + "=" * 78 + f"\n  {t}\n" + "=" * 78, flush=True)


# ── 1. Data ──────────────────────────────────────────────────────────────────────────────────────────────────────
banner("STEP 1: data")
conn = psycopg2.connect(PG)
conn.set_session(readonly=True)
d = pd.read_sql("SELECT date, exit_canonical AS ex, SUM(total)::float AS v FROM gold.fact_traffic_hourly "
                "WHERE date <= %s GROUP BY 1, 2", conn, params=(REAL_END_VOLUME.date(),))
d["date"] = pd.to_datetime(d.date)
hol = set(pd.to_datetime(pd.read_sql("SELECT DISTINCT date_day::date d FROM public.ph_holidays", conn).d))
if CAL_PATH:
    cal = pd.read_csv(CAL_PATH)
    cal_src = CAL_PATH
else:
    cal = pd.read_sql("SELECT * FROM silver.arena_events_verified", conn)
    cal_src = "silver.arena_events_verified"
conn.close()

exits_ts = (HERE.parents[2] / "Front-End-Dashboard" / "lib" / "nlex-exits.ts").read_text(encoding="utf-8")
KM = {key(n): float(k) for n, k in re.findall(r'exit_name: "([^"]+)",[^}]*?km: ([\d.]+)', exits_ts)}
d["k"] = d.ex.map(key)
d["km"] = d.k.map(KM)
missing_km = sorted(d.loc[d.km.isna(), "ex"].unique())
if missing_km:
    print(f"  no km post for: {missing_km} (left out of the near-venue sets)")

corr = d.groupby("date").v.sum().sort_index()
corr = corr.reindex(pd.date_range(corr.index.min(), corr.index.max(), freq="D"))
trail = corr.shift(1).rolling(28, min_periods=14).median()
BROKEN = set(corr.index[(corr < BROKEN_SHARE * trail) | corr.isna()])
d = d[~d.date.isin(BROKEN)].copy()
print(f"  toll: {d.date.min().date()}..{d.date.max().date()} real days, {d.ex.nunique()} exits, "
      f"{len(BROKEN)} broken/missing days left out")

cal["show_date"] = pd.to_datetime(cal.show_date, errors="coerce")
CAL_ALL = cal.copy()                       # scheduled nights too: the publisher forecasts them
cal = cal[cal.status.astype(str).str.lower().eq("held") & cal.show_date.notna()].copy()
cal["vk"] = cal.venue.map(VENUES)
other_venue = cal[cal.vk.isna()]
cal = cal[cal.vk.notna()].copy()
print(f"  verified calendar ({cal_src}): {len(cal)} held show nights at the three venues "
      f"({len(other_venue)} elsewhere, not used)")

# Attendance per night: a run total is split evenly over the run's verified nights.
cal["act_k"] = cal.act.map(key)
cal = cal.sort_values("show_date")
# A run = the same act at the same venue with no more than 7 days between nights.
run_of = {}
for (a, vk), g in cal.groupby(["act_k", "vk"]):
    run_id, prev = 0, None
    for idx, t in g.show_date.sort_values().items():
        if prev is not None and (t - prev).days > 7:
            run_id += 1
        run_of[idx] = f"{a}|{vk}|{run_id}"
        prev = t
cal["run"] = pd.Series(run_of)
cal["nights_in_run"] = cal.groupby("run").show_date.transform("nunique")
cal["first_night"] = (cal.show_date == cal.groupby("run").show_date.transform("min")).astype(int)


def att_per_night(r):
    m = re.search(r"[\d,.]+", str(r.reported_attendance)) if pd.notna(r.reported_attendance) else None
    if not m:
        return np.nan
    n = float(m.group().replace(",", ""))
    if n <= 0:
        return np.nan
    return n / r.nights_in_run if str(r.attendance_scope).strip().lower() == "total_run" else n


cal["att"] = cal.apply(att_per_night, axis=1)

# One row per event night (a night with two venues keeps the Arena row; flagged).
cal = cal.sort_values(["show_date", "vk"])
multi = cal[cal.duplicated("show_date", keep=False)]
nights = cal.drop_duplicates("show_date", keep="first").copy()
if len(multi):
    print(f"  {multi.show_date.nunique()} night(s) with two venues: kept {', '.join(sorted(set(nights[nights.show_date.isin(multi.show_date)].vk)))}")
EVENT_DAYS = set(nights.show_date)

# ── normal day per exit-day ──
wide = d.pivot_table(index="date", columns="k", values="v")
wide = wide.reindex(pd.date_range(wide.index.min(), wide.index.max(), freq="D"))
ordinary = wide.copy()
ordinary.loc[ordinary.index.isin(EVENT_DAYS) | ordinary.index.isin(hol) | ordinary.index.isin(BROKEN)] = np.nan
# Level shifts (protocol section 9 correction, 12 Nov 2026): an exit whose count jumps and stays (CDV/PH Arena doubled
# on 2024-11-04) must not have a normal that mixes the two levels. Detected the same way for every exit: the median of
# the 28 days from t differs from the median of the 28 days before t by >= 1.5x, and days t+28..t+55 confirm it.
SHIFT = 1.5
seg = pd.DataFrame(0, index=wide.index, columns=wide.columns)
BREAKS = {}
for k in wide.columns:
    s = ordinary[k]
    before = s.rolling(28, min_periods=14).median().shift(1)
    after = s[::-1].rolling(28, min_periods=14).median()[::-1]
    after2 = after.shift(-28)
    r1, r2 = after / before, after2 / before
    flag = ((r1 >= SHIFT) & (r2 >= SHIFT)) | ((r1 <= 1 / SHIFT) & (r2 <= 1 / SHIFT))
    days, last = [], None
    for t in flag.index[flag.fillna(False).values]:
        if last is None or (t - last).days > 56:          # one break per run of flagged days: the strongest day
            run = flag.loc[t:t + pd.Timedelta(days=56)]
            run = run[run.fillna(False)]
            score = (np.log(r1.loc[run.index])).abs()
            days.append(score.idxmax())
            last = t
    if days:
        BREAKS[k] = [str(x.date()) for x in days]
        for x in days:
            seg.loc[x:, k] += 1
print("  lasting level shifts (normal days never mix the two sides):",
      ", ".join(f"{k} {v}" for k, v in BREAKS.items()) or "none")
stack = np.stack([ordinary.shift(7 * k).where(seg.shift(7 * k) == seg).values for k in range(1, NORMAL_WEEKS + 1)])
cnt = np.isfinite(stack).sum(axis=0)
med = np.nanmedian(stack, axis=0)
med[cnt < NORMAL_MIN] = np.nan
NORMAL = pd.DataFrame(med, index=wide.index, columns=wide.columns)
# Holiday factor per exit: median volume / normal on ordinary (non-event) holidays.
hd = [t for t in hol if t in wide.index and t not in EVENT_DAYS and t not in BROKEN]
HF = (wide.loc[hd] / NORMAL.loc[hd]).median()
# Seasonal factor (protocol section 9 correction 3, 12 Nov 2026): on ordinary days the trailing normal is biased by
# season (January about 3.6% below it, December about 5.5% above). For an exit and a night t, the factor is the median
# of actual / normal over that exit's ordinary days in the same calendar month strictly before t (>= 8 days, else 1).
ORD_RATIO = (wide / NORMAL).where(ordinary.notna())
_season_cache = {}


def season_factor(k, t):
    key_ = (k, t)
    if key_ not in _season_cache:
        col = ORD_RATIO[k]
        sel = col[(col.index.month == t.month) & (col.index < t)].dropna()
        _season_cache[key_] = float(sel.median()) if len(sel) >= 8 else 1.0
    return _season_cache[key_]



rows = []
for _, r in nights.iterrows():
    t = r.show_date
    if t not in wide.index or t in BROKEN or t > REAL_END_VOLUME:
        continue
    for k in wide.columns:
        v, n = wide.at[t, k], NORMAL.at[t, k]
        if not (np.isfinite(v) and np.isfinite(n) and n > 0):
            continue
        exp_ = n * (HF.get(k, 1.0) if t in hol else 1.0) * season_factor(k, t)
        rows.append(dict(date=t, k=k, v=v, exp=exp_, y=np.log(v / exp_), vk=r.vk, grp=GROUP[r.vk],
                         weekend=int(t.dayofweek >= 5), origin=str(r.act_origin).lower(),
                         fmt=str(r.format).lower(), nights=int(r.nights_in_run), first=int(r.first_night),
                         att=r.att, act=r.act))
E = pd.DataFrame(rows)
E["km"] = E.k.map(KM)
E["near"] = [KM_RANGE[g][0] <= km <= KM_RANGE[g][1] if np.isfinite(km) else False for g, km in zip(E.grp, E.km)]
E["is_anchor"] = [k == ANCHOR[g] for k, g in zip(E.k, E.grp)]
for c, val in [("v_stadium", "stadium"), ("v_clark", "clark")]:
    E[c] = (E.vk == val).astype(int)
E["o_filipino"] = (E.origin == "filipino").astype(int)
E["o_mixed"] = (E.origin == "mixed").astype(int)
E["f_showcase"] = (E.fmt == "multi_artist_showcase").astype(int)
E["f_festival"] = (E.fmt == "festival").astype(int)
E["f_sports"] = (E.fmt == "sports").astype(int)
E["f_other"] = (~E.fmt.isin(["solo_concert", "multi_artist_showcase", "festival", "sports"])).astype(int)
E["run_multi"] = (E.nights > 1).astype(int)
E["first_night"] = E["first"]
E["log_att"] = np.log(E.att)
VENUE_KM = {"bulacan": KM.get("cdvpharena", 26.05), "clark": KM.get("dau", 83.05)}
E["km_from_venue"] = [abs(km - VENUE_KM[g]) if np.isfinite(km) else 99.0 for km, g in zip(E.km, E.grp)]
E["is_anchor_i"] = E.is_anchor.astype(int)
E["log_normal"] = np.log(E.exp)
E["is_hol_i"] = E.date.isin(hol).astype(int)
NIGHTS = sorted(E.date.unique())
print(f"  scored event nights (real toll days, normal available): {len(NIGHTS)}  "
      f"{pd.Timestamp(NIGHTS[0]).date()}..{pd.Timestamp(NIGHTS[-1]).date()}")
print("  by venue:", E.drop_duplicates("date").vk.value_counts().to_dict(),
      "| with reported attendance:", int(E.drop_duplicates("date").att.notna().sum()))


# ── 2. Models ────────────────────────────────────────────────────────────────────────────────────────────────────
def fit_predict(m: int, train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    """Multiplier for every row of `test` (one event night, all exits), fitted on `train` only."""
    if m == 1:
        return np.ones(len(test))
    near = train[train.near]
    if m == 2:
        return np.full(len(test), float(np.exp(near.y.median())) if len(near) else 1.0)
    if m == 3:
        flat = float(np.exp(near.y.median())) if len(near) else 1.0
        per = train.groupby(["grp", "k"]).y.median().map(np.exp)
        return np.array([per.get((g, k), flat) for g, k in zip(test.grp, test.k)])
    if m in (8, 9):
        mdl = (GradientBoostingRegressor(n_estimators=200, max_depth=2, learning_rate=0.05, subsample=0.8, random_state=42)
               if m == 8 else RandomForestRegressor(n_estimators=300, min_samples_leaf=5, random_state=42, n_jobs=-1))
        mdl.fit(train[TREE_FEATURES].values.astype(float), train.y.values)
        return np.exp(mdl.predict(test[TREE_FEATURES].values.astype(float)))
    if m == 10:
        flat = float(np.exp(near.y.median())) if len(near) else 1.0
        return np.where(test.is_anchor.values, flat, 1.0)
    feats = FEATURES[m]
    tr = train if m != 7 else train[train.att.notna()]
    anc = tr[tr.is_anchor].drop_duplicates("date")
    if len(anc) < len(feats) + 3:
        raise ValueError(f"too few training nights ({len(anc)}) for {len(feats)} features")
    X = anc[feats].values.astype(float)
    keep = X.std(axis=0) > 0                       # a feature that never varies in training is dropped, not guessed
    hub = HuberRegressor(max_iter=1000).fit(X[:, keep], anc.y.values)
    xt = test.drop_duplicates("date")[feats].values.astype(float)[:, keep]
    strength = float(hub.predict(xt)[0])
    # Sensitivity of each exit to the anchor, within the venue group, through the origin.
    sens = {}
    s_anchor = anc.set_index("date").y
    for (g, k), grp_rows in tr.groupby(["grp", "k"]):
        s = s_anchor.reindex(grp_rows.date).values
        ok = np.isfinite(s)
        den = float(np.sum(s[ok] ** 2))
        sens[(g, k)] = float(np.sum(s[ok] * grp_rows.y.values[ok]) / den) if den > 0 else 0.0
    return np.array([np.exp(sens.get((g, k), 0.0) * strength) for g, k in zip(test.grp, test.k)])


# ── 3. Leave-future-out ──────────────────────────────────────────────────────────────────────────────────────────
banner("STEP 2: leave-future-out test")
n_test = int(round(len(NIGHTS) * TEST_SHARE))
TEST_NIGHTS = NIGHTS[-n_test:]
print(f"  test nights: {len(TEST_NIGHTS)} ({pd.Timestamp(TEST_NIGHTS[0]).date()}..{pd.Timestamp(TEST_NIGHTS[-1]).date()}),"
      f" each predicted from nights at least one day before it")
preds = []
for t in TEST_NIGHTS:
    train = E[E.date <= pd.Timestamp(t) - pd.Timedelta(days=1)]
    test = E[E.date == t]
    for m in NAMES:
        if m == 7 and not np.isfinite(test.att.iloc[0]):
            continue
        try:
            mult = fit_predict(m, train, test)
        except ValueError as e:
            print(f"  {pd.Timestamp(t).date()} candidate {m}: not fitted ({e})")
            continue
        preds.append(pd.DataFrame({"date": t, "k": test.k.values, "m": m, "v": test.v.values,
                                   "pred": test.exp.values * mult, "near": test.near.values,
                                   "anchor": test.is_anchor.values}))
P = pd.concat(preds, ignore_index=True)
P.to_csv(CACHE / f"event_study{TAG}.csv", index=False)


def wm(df):
    return float(np.abs(df.pred - df.v).sum() / df.v.sum() * 100)


def boot_diff(df, a, b, scope):
    """95% interval of WMAPE(a) - WMAPE(b), resampling event nights."""
    sub = df[scope(df)]
    nights_ = sub.date.unique()
    ga = {n: g for n, g in sub[sub.m == a].groupby("date")}
    gb = {n: g for n, g in sub[sub.m == b].groupby("date")}
    common = [n for n in nights_ if n in ga and n in gb]
    ea = np.array([np.abs(ga[n].pred - ga[n].v).sum() for n in common])
    eb = np.array([np.abs(gb[n].pred - gb[n].v).sum() for n in common])
    va = np.array([ga[n].v.sum() for n in common])
    diffs = []
    for _ in range(BOOT):
        i = RNG.integers(0, len(common), len(common))
        diffs.append((ea[i].sum() - eb[i].sum()) / va[i].sum() * 100)
    return float(np.percentile(diffs, 2.5)), float(np.percentile(diffs, 97.5)), len(common)


SCOPES = {"near the venue": lambda df: df.near, "CDV/Dau anchor": lambda df: df.anchor, "all exits": lambda df: df.v > -1}
table = {}
for m in NAMES:
    if m == 7:
        continue
    table[NAMES[m]] = {s: round(wm(P[(P.m == m) & f(P)]), 3) for s, f in SCOPES.items()}
print("\n  WMAPE % on the held-out event nights (lower is better)")
print(f"  {'candidate':<28}" + "".join(f"{s:>18}" for s in SCOPES))
for n_, r in table.items():
    print(f"  {n_:<28}" + "".join(f"{r[s]:>18.2f}" for s in SCOPES))

# ── 4. Selection (section 9) ──
banner("STEP 3: choosing")
near = SCOPES["near the venue"]
base = {1: table[NAMES[1]]["near the venue"], 2: table[NAMES[2]]["near the venue"]}
best_base = min(base, key=base.get)
eligible, ci = [], {}
for m in (3, 4, 5, 6, 8, 9, 10):
    if NAMES[m] not in table:
        continue
    lo1, hi1, n1 = boot_diff(P, m, 1, near)
    lo2, hi2, n2 = boot_diff(P, m, 2, near)
    ci[m] = {"vs_no_adjustment": [round(lo1, 3), round(hi1, 3)], "vs_flat": [round(lo2, 3), round(hi2, 3)], "nights": n1}
    ok = hi1 < 0 and hi2 < 0
    print(f"  {NAMES[m]:<24} vs no adjustment {lo1:+.2f}..{hi1:+.2f}   vs flat {lo2:+.2f}..{hi2:+.2f}   "
          f"-> {'ELIGIBLE' if ok else 'not eligible'}")
    if ok:
        eligible.append(m)
# Section 6.4 between the two baselines, per exit group (correction 1, 12 Nov 2026): the flat uplift is served where
# its lead over "no adjustment" is significant, and nowhere else.
tie = {}
for label, scope in (("venue exit", lambda df: df.anchor), ("other nearby exits", lambda df: df.near & ~df.anchor)):
    lo_, hi_, n_ = boot_diff(P, 2, 1, scope)
    tie[label] = {"flat_minus_none": [round(lo_, 3), round(hi_, 3)], "nights": n_, "flat_serves": bool(hi_ < 0)}
    print(f"  flat uplift vs no adjustment, {label}: {lo_:+.2f}..{hi_:+.2f} -> "
          f"{'flat significantly better' if hi_ < 0 else 'not significant: no adjustment (simpler)'}")
if tie["venue exit"]["flat_serves"] and not tie["other nearby exits"]["flat_serves"]:
    champion, note = 10, "nothing beat both baselines; the flat uplift beats no adjustment only at the venue exit"
elif tie["venue exit"]["flat_serves"] and tie["other nearby exits"]["flat_serves"]:
    champion, note = 2, "nothing beat both baselines; the flat uplift beats no adjustment at every nearby exit"
else:
    champion, note = 1, "nothing beat both baselines, and the flat uplift does not beat no adjustment significantly"
if eligible:
    champion = min(eligible, key=lambda m: table[NAMES[m]]["near the venue"])
    note = f"lowest score among eligible: {NAMES[champion]}"
    # A non-significant lead goes to the simpler eligible candidate.
    for simpler in sorted(m for m in eligible if m < champion):
        lo, hi, _ = boot_diff(P, champion, simpler, near)
        if not hi < 0:
            note += f"; its lead over {NAMES[simpler]} is not significant ({lo:+.2f}..{hi:+.2f}), so the simpler wins"
            champion = simpler
            break
print(f"  CHAMPION: {NAMES[champion]}  ({note})")

# Candidate 7 on the nights that have attendance, against 5 on the same nights.
att_result = None
if (P.m == 7).any():
    nights7 = set(P[P.m == 7].date)
    sub = P[P.date.isin(nights7)]
    s5, s7 = wm(sub[(sub.m == 5) & sub.near]), wm(sub[(sub.m == 7) & sub.near])
    lo, hi, n7 = boot_diff(sub, 7, 5, near)
    att_result = {"nights": n7, "wmape_class_model": round(s5, 3), "wmape_with_attendance": round(s7, 3),
                  "diff_ci": [round(lo, 3), round(hi, 3)], "significant": bool(hi < 0)}
    print(f"\n  + reported attendance, on the {n7} held-out nights that have it: {s7:.2f}% vs {s5:.2f}% "
          f"(difference {lo:+.2f}..{hi:+.2f}) -> {'better' if hi < 0 else 'NOT significantly better'}")

# ── 5. Plausibility: extra vehicles per 1,000 attendees ──
banner("STEP 4: extra vehicles per 1,000 reported attendees (near-venue exits, Arena and Stadium)")
X = E[E.near & (E.grp == "bulacan")].groupby("date").agg(extra=("v", "sum"), exp=("exp", "sum"), att=("att", "first"))
X["extra"] = X.extra - X.exp
X = X[X.att.notna()]
X.assign(act=E.drop_duplicates("date").set_index("date").act).to_csv(CACHE / f"event_attendance_points{TAG}.csv")
per1000 = None
if len(X) >= 8:
    def slope(df):
        return float(np.sum(df.att * df.extra) / np.sum(df.att ** 2) * 1000)
    s = slope(X)
    bs = [slope(X.iloc[RNG.integers(0, len(X), len(X))]) for _ in range(BOOT)]
    per1000 = {"nights": len(X), "per_1000": round(s, 1), "ci": [round(float(np.percentile(bs, 2.5)), 1),
                                                                  round(float(np.percentile(bs, 97.5)), 1)],
               "nights_below_normal": int((X.extra < 0).sum())}
    print(f"  {len(X)} nights: {s:.0f} extra vehicles per 1,000 attendees "
          f"(95% interval {per1000['ci'][0]:.0f} to {per1000['ci'][1]:.0f}); physically possible: 0 to 1,000")
else:
    print(f"  only {len(X)} nights with reported attendance at the near exits: too few to estimate")

# ── 6. Normal day for far future dates ──
banner("STEP 5: normal day for dates 90-300 days past the record (ordinary days)")
ordw = wide.copy()
ordw.loc[ordw.index.isin(EVENT_DAYS) | ordw.index.isin(hol) | ordw.index.isin(BROKEN)] = np.nan
near_cols = [k for k in ordw.columns if np.isfinite(KM.get(k, np.nan)) and 20 <= KM[k] <= 39]
errs = {f"trailing {NORMAL_WEEKS}-week median": [0.0, 0.0], "same day last year, scaled": [0.0, 0.0]}
origins = pd.date_range(REAL_END_VOLUME - pd.Timedelta(days=300 + 364), REAL_END_VOLUME - pd.Timedelta(days=90),
                        freq="28D")
for T in origins:
    hist = ordw.loc[:T]
    for h in range(90, 301, 3):
        t = T + pd.Timedelta(days=h)
        if t > REAL_END_VOLUME or t not in ordw.index:
            continue
        act = ordw.loc[t, near_cols]
        if act.isna().all():
            continue
        same_wd = hist[hist.index.dayofweek == t.dayofweek].tail(NORMAL_WEEKS)
        pa = same_wd[near_cols].median()
        ly = t - pd.Timedelta(days=364)
        last8 = hist.tail(56)[near_cols].sum()
        prev8 = ordw.loc[T - pd.Timedelta(days=364 + 55):T - pd.Timedelta(days=364), near_cols].sum()
        pb = ordw.loc[ly, near_cols] * (last8 / prev8) if ly in ordw.index else pa * np.nan
        ok = act.notna() & pa.notna() & pb.notna()
        for name, p in ((f"trailing {NORMAL_WEEKS}-week median", pa), ("same day last year, scaled", pb)):
            errs[name][0] += float(np.abs(p[ok] - act[ok]).sum())
            errs[name][1] += float(act[ok].sum())
far = {n: round(e / a * 100, 3) for n, (e, a) in errs.items() if a > 0}
for n_, w in far.items():
    print(f"  {n_:<28} WMAPE {w:.2f}%")
far_choice = min(far, key=far.get) if far else None
print(f"  -> normal day beyond the traffic forecast window: {far_choice}")

# ── 6b. A tree champion: final fit on every scored night, and a forecast for each verified upcoming night ──
DATED, TYPICAL, BAND = [], {}, None
if champion in (8, 9):
    banner(f"STEP 3b: {NAMES[champion]} - final fit on all {len(NIGHTS)} nights, forecasts for upcoming nights")
    final = (GradientBoostingRegressor(n_estimators=200, max_depth=2, learning_rate=0.05, subsample=0.8, random_state=42)
             if champion == 8 else RandomForestRegressor(n_estimators=300, min_samples_leaf=5, random_state=42, n_jobs=-1))
    final.fit(E[TREE_FEATURES].values.astype(float), E.y.values)
    # Typical multiplier per exit (the card's past-events view): the median fitted multiplier over the past nights.
    E["fit_mult"] = np.exp(final.predict(E[TREE_FEATURES].values.astype(float)))
    for (g, k), r_ in E.groupby(["grp", "k"]):
        TYPICAL.setdefault(g, {})[k] = round(float(r_.fit_mult.median()), 4)
    # Range: the 10th-90th percentile of how far held-out nights landed from the model's forecast (near-venue exits).
    hp = P[(P.m == champion) & P.near]
    q = np.log(hp.v / hp.pred)
    BAND = [round(float(np.exp(np.percentile(q, 10))), 4), round(float(np.exp(np.percentile(q, 90))), 4)]
    up = CAL_ALL[CAL_ALL.status.astype(str).str.lower().eq("scheduled") & CAL_ALL.show_date.notna()].copy()
    up["show_date"] = pd.to_datetime(up.show_date)
    up = up[up.show_date > REAL_END_VOLUME]
    up["vk"] = up.venue.map(VENUES)
    up = up[up.vk.notna()].sort_values("show_date")
    up["act_k"] = up.act.map(key)
    lastw = ordinary.loc[REAL_END_VOLUME - pd.Timedelta(days=7 * NORMAL_WEEKS - 1):REAL_END_VOLUME]
    norm_wd = {k: lastw[k].groupby(lastw.index.dayofweek).median() for k in wide.columns}
    for (a_, vk_), g_ in up.groupby(["act_k", "vk"]):
        dates_ = sorted(g_.show_date.unique())
        for i_, t_ in enumerate(dates_):
            r_ = g_[g_.show_date == t_].iloc[0]
            run_n = sum(1 for x in dates_ if abs((pd.Timestamp(x) - pd.Timestamp(t_)).days) <= 7)
            first = int(all(pd.Timestamp(x) >= pd.Timestamp(t_) for x in dates_ if abs((pd.Timestamp(x) - pd.Timestamp(t_)).days) <= 7))
            grp_ = GROUP[vk_]
            rows_ = []
            for k in wide.columns:
                nv = norm_wd[k].get(pd.Timestamp(t_).dayofweek, np.nan)
                km_ = KM.get(k, np.nan)
                if not np.isfinite(nv) or nv <= 0:
                    continue
                fmt_, org_ = str(r_.format).lower(), str(r_.act_origin).lower()
                rows_.append({"k": k, "v_stadium": int(vk_ == "stadium"), "v_clark": int(vk_ == "clark"),
                              "weekend": int(pd.Timestamp(t_).dayofweek >= 5), "o_filipino": int(org_ == "filipino"),
                              "o_mixed": int(org_ == "mixed"), "f_showcase": int(fmt_ == "multi_artist_showcase"),
                              "f_festival": int(fmt_ == "festival"), "f_sports": int(fmt_ == "sports"),
                              "f_other": int(fmt_ not in ("solo_concert", "multi_artist_showcase", "festival", "sports")),
                              "run_multi": int(run_n > 1), "first_night": first,
                              "km_from_venue": abs(km_ - VENUE_KM[grp_]) if np.isfinite(km_) else 99.0,
                              "is_anchor_i": int(k == ANCHOR[grp_]), "log_normal": float(np.log(nv)),
                              "is_hol_i": int(pd.Timestamp(t_) in hol)})
            F = pd.DataFrame(rows_)
            mult = np.exp(final.predict(F[TREE_FEATURES].values.astype(float)))
            DATED.append({"date": str(pd.Timestamp(t_).date()), "act": r_.act, "title": r_.event_title, "venue": r_.venue,
                          "grp": grp_, "source": r_.date_source_url,
                          "exits": {k: round(float(m_), 4) for k, m_ in zip(F.k, mult)}})
    print(f"  {len(DATED)} upcoming verified nights forecast; held-out 80% range of actual/forecast: "
          f"{BAND[0]:.3f}-{BAND[1]:.3f}")
    for d_ in sorted(DATED, key=lambda x: x["date"]):
        cdv = d_["exits"].get(ANCHOR[d_["grp"]])
        print(f"    {d_['date']}  {str(d_['act'])[:30]:<30} venue exit x{cdv:.3f}")

# ── 7. Description on all verified nights (not a model choice; reported so the effect can be read) ──
banner("STEP 6: what event nights did, all verified nights (description)")


def med_ci(x):
    x = np.asarray(x, float)
    if len(x) < 3:
        return float(np.median(x)) if len(x) else float("nan"), float("nan"), float("nan")
    bs = [np.median(x[RNG.integers(0, len(x), len(x))]) for _ in range(BOOT)]
    return float(np.median(x)), float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))


nearE = E[E.near]
flat_all = med_ci(np.exp(nearE.y))
print(f"  near-venue exits, every night: median {flat_all[0]:.3f}x (95% {flat_all[1]:.3f}-{flat_all[2]:.3f})")
anchorE = E[E.is_anchor].copy()
anchorE["ratio"] = np.exp(anchorE.y)
desc = {"flat_near_all_nights": [round(v, 4) for v in flat_all]}
for label, col in (("venue", "vk"), ("weekend", "weekend"), ("act origin", "origin"), ("format", "fmt")):
    print(f"  anchor exit (CDV/PH Arena; Dau for Clark) by {label}:")
    desc[label] = {}
    for val, g in anchorE.groupby(col):
        m_, lo_, hi_ = med_ci(g.ratio)
        desc[label][str(val)] = {"n": int(len(g)), "median": round(m_, 4), "ci": [round(lo_, 4), round(hi_, 4)]}
        print(f"    {str(val):<24} n={len(g):>3}  median {m_:.3f}x  (95% {lo_:.3f}-{hi_:.3f})")
top = anchorE.sort_values("ratio", ascending=False)[["date", "act", "vk", "ratio"]].head(8)
print("  biggest nights at the anchor:")
for _, r in top.iterrows():
    print(f"    {pd.Timestamp(r.date).date()}  {str(r.act)[:44]:<44} {r.vk:<8} {r.ratio:.2f}x")

# ── 8. Write ──
out = {"protocol": "EVALUATION_PROTOCOL.md section 9 (11 Nov 2026; corrections 12 Nov 2026)", "baseline_tie": tie, "normal_weeks": NORMAL_WEEKS, "calendar": cal_src,
       "real_end": str(REAL_END_VOLUME.date()), "event_nights_scored": len(NIGHTS), "test_nights": len(TEST_NIGHTS),
       "test_from": str(pd.Timestamp(TEST_NIGHTS[0]).date()), "table": table, "intervals": {NAMES[m]: v for m, v in ci.items()},
       "champion": NAMES[champion], "champion_id": champion, "note": note, "attendance_test": att_result,
       "per_1000_attendees": per1000, "dated": DATED, "typical": TYPICAL, "band": BAND, "far_normal": far, "far_normal_choice": far_choice, "description": desc}
# For the publisher: names, km, holiday factor, and each exit's normal day per weekday at the end of the real record
# (median of that weekday's ordinary days in the last 8 weeks) - the normal the far-date test chose.
last8 = ordinary.loc[REAL_END_VOLUME - pd.Timedelta(days=7 * NORMAL_WEEKS - 1):REAL_END_VOLUME]
out["exits"] = {k: {"name": str(d.loc[d.k == k, "ex"].iloc[0]), "km": KM.get(k),
                    "holiday_factor": None if not np.isfinite(HF.get(k, np.nan)) else round(float(HF[k]), 4),
                    "normal_by_weekday": {str(w): (None if not np.isfinite(v) else round(float(v)))
                                          for w, v in last8[k].groupby(last8.index.dayofweek).median().items()}}
                for k in wide.columns}
# Served parameters, refitted on ALL scored nights (protocol section 7): the flat uplift, and each exit's median.
out["served"] = {"flat": [round(v, 4) for v in flat_all], "per_exit": {}}
for (g, k), grp_rows in E.groupby(["grp", "k"]):
    m_, lo_, hi_ = med_ci(np.exp(grp_rows.y))
    out["served"]["per_exit"].setdefault(g, {})[k] = {"median": round(m_, 4), "ci": [round(lo_, 4), round(hi_, 4)],
                                                     "n": int(len(grp_rows)), "near": bool(grp_rows.near.iloc[0])}
out["season"] = {k: {str(m_): (lambda sel: round(float(sel.median()), 4) if len(sel) >= 8 else 1.0)(
    ORD_RATIO[k][ORD_RATIO[k].index.month == m_].dropna()) for m_ in range(1, 13)} for k in wide.columns}
out["calendar_counts"] = {"held_nights_at_venues": int(len(nights)), "scored_nights": len(NIGHTS),
                          "nights_with_attendance": int(E.drop_duplicates("date").att.notna().sum()),
                          "first": str(pd.Timestamp(NIGHTS[0]).date()), "last": str(pd.Timestamp(NIGHTS[-1]).date())}
(CACHE / f"event_study{TAG}.json").write_text(json.dumps(out, indent=2))
print(f"\n  written: {CACHE / 'event_study.json'} and event_study.csv (nothing written to the database)")
