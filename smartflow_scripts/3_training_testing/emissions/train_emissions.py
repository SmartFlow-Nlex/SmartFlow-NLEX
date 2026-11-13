"""
Daily corridor CO2 forecast: the served model and its published metrics, under EVALUATION_PROTOCOL.md (10 Nov 2026).

The testing is emissions_study.py; this file publishes what it found. Rewritten 10 Nov 2026 after an audit found the
previous version picked its champion on days 1-7 but served 90 days, studied the horizon for the champion alone, gated
on MASE < 1 (out of reach at long horizons, and unlike the volume module's relative rule), scored 26 synthetic days
after 2026-05-24, fed a trend 28 days off to every forecast (t counted rows before the lag warm-up was dropped in
training, after it in project()), gave holidays to GBR only, scored a model that failed at an origin on fewer days than
the rest, and reused cached predictions keyed only on the row count and last date. The previous version is in git.

STEPS
  1. The study. _work/cache/emissions_study.json is used when its fingerprint (the CO2 series, holidays, the traffic
     series behind Derived, the volume model and the code) matches the current data; otherwise the study is run here.
     Every candidate, the three baselines and every horizon (days 1-14, 15-30, 31-60, 61-90) on 26 rolling origins
     across the last real year, the forecast served the way it is drawn. Nothing after 2026-05-24 is scored.
  2. The champion: the protocol's rule (lowest mean bucket WMAPE among the models that beat the best baseline overall
     AND on days 1-14; a simpler model wins a tie whose lead is not significant), among the models that can be served.
     A weather model is served only while a real weather forecast exists; the window served here starts the day after
     the record ends, which no weather forecast covers, so weather models are reported (as an upper bound) but never
     served, and Derived is served through the weather-free volume model.
  3. The previous champion, re-scored on the same origins, must not be significantly better (protocol section 8).
  4. Each family the dashboard draws (GBR, Polynomial, LSTM, Derived; one column each in gold.ml_predictive_emissions)
     is refitted on every day of the record and forecasts 90 days from the day after it ends. The family's line is its
     best-scoring servable variant, or the champion where the champion belongs to it.
  5. Writes (not with --dry-run): gold.ml_model_metrics (target 'Corridor CO2'), gold.ml_predictive_emissions (the
     record; the PRESENT band is every origin's days 1-14, the forecasts the metrics were computed from; then the
     90-day future), gold.ml_horizon_accuracy (target 'Corridor CO2', the champion per bucket) and
     _work/outputs/emissions_results.json (with the code version).

COLUMNS (gold.ml_model_metrics, as the dashboard reads them)
  wmape  the protocol score: mean of the four bucket WMAPEs (%)
  mase   that score divided by the best baseline's: below 1 beats every baseline on the days it was tested.
         (Not the in-sample-scaled MASE, which exceeds 1 at long horizons for any model and is no gate.)
  mae, rmse, mape, r2   the mean of the same four buckets
  rank   1 = the champion, then by score; NULL for baselines.   accepted = eligible under the protocol.

FLAGS
  --dry-run            everything up to the writes; the rows are rendered (and the target columns checked read-only)
                       but nothing is written
  --rerun-study        run the study even if a matching one is saved
  --volume-model NAME  the traffic model behind Derived (default: traffic_study.json's champion)
  --no-weather, --extra-candidates   accepted for older callers; no effect (weather models are never served, and
                                     MSTL and the stacked LSTM are always candidates now)
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import emissions_study as S  # noqa: E402
from common import rolling_eval as RE  # noqa: E402
from common.rolling_eval import DAILY_BUCKETS, is_baseline, select_champion  # noqa: E402

TARGET = "Corridor CO2"
FUTURE_DAYS = S.HORIZON
FAMILIES = ["GBR", "Polynomial", "LSTM", "Derived"]
COLUMN = {"GBR": "pred_gbr", "Polynomial": "pred_polynomial", "LSTM": "pred_lstm", "Derived": "pred_derived"}
ARGS = sys.argv[1:]
DRY_RUN = "--dry-run" in ARGS
RERUN = "--rerun-study" in ARGS
# --smoke-study N: test the publishing path on a smoke study (N origins); dry-run only.
SMOKE = int(ARGS[ARGS.index("--smoke-study") + 1]) if "--smoke-study" in ARGS else None
if SMOKE and not DRY_RUN:
    raise SystemExit("--smoke-study only tests the publishing path: add --dry-run")
VOL = ARGS[ARGS.index("--volume-model") + 1] if "--volume-model" in ARGS else None


def banner(t):
    print("\n" + "=" * 78 + f"\n  {t}\n" + "=" * 78)


for flag in ("--no-weather", "--extra-candidates"):
    if flag in ARGS:
        print(f"  {flag}: no effect now (see the docstring)")

# ── 1. The study ─────────────────────────────────────────────────────────────
banner("STEP 1: The study (emissions_study.py)")
ctx = S.load(VOL)
csv_path, json_path = S.outputs("emissions_study" if not SMOKE else f"emissions_study_smoke{SMOKE}")
study = None
if json_path.exists() and csv_path.exists() and not RERUN:
    j = json.loads(json_path.read_text())
    if j.get("fingerprint") == ctx.fp and bool(j.get("smoke")) == bool(SMOKE) and not j.get("interim"):
        study = j
        print(f"  using the saved study ({json_path.name}, {j['generated']}, fingerprint {ctx.fp})")
    else:
        print(f"  saved study does not match the current data/code (saved {j.get('fingerprint')}, now {ctx.fp})")
if study is None:
    print("  running the study now (about an hour; resumable)")
    study = S.run(SMOKE, VOL)
res = pd.read_csv(csv_path, parse_dates=["date"])
n_origins = res.origin.nunique()

# ── 2. The champion among the servable models ────────────────────────────────
banner("STEP 2: The champion")
weather_models = [m for m in res.model.unique() if S.uses_weather(m)]
servable = res[~res.model.isin(weather_models)]
sel = S.settle_tie(select_champion(servable, DAILY_BUCKETS, "wmape", complexity=S.COMPLEXITY), servable)
RE.report(sel)
table = pd.DataFrame(sel["table"]).T
table_all = pd.DataFrame(study["selection_all_candidates"]["table"]).T
CHAMPION = sel["champion"]
best_base = sel["best_baseline"]
base_score = float(table.loc[best_base, "score"])
if study["selection"]["champion"] != CHAMPION:
    print(f"  note: with weather models allowed the study's champion is {study['selection']['champion']}; no weather "
          f"forecast covers the served window, so {CHAMPION} is served")
if sel.get("champion_is_baseline"):
    print(f"  NO candidate beats the best baseline; the protocol serves {CHAMPION}")

# ── 3. The previous champion, re-scored on the same origins (protocol section 8) ──
banner("STEP 3: Previous champion")
import psycopg2  # noqa: E402
with psycopg2.connect(S.PG) as conn:
    conn.set_session(readonly=True)
    cur = conn.cursor()
    cur.execute("SELECT model_name, diagnosis FROM gold.ml_model_metrics WHERE target = %s AND accepted "
                "AND rank IS NOT NULL ORDER BY rank LIMIT 1", (TARGET,))
    row = cur.fetchone()
prev = row[0] if row else None
prev_ok, prev_note = True, "no previous champion"
if prev:
    # A family's served variant is stored under the family name, with "study model: X" in its diagnosis.
    named = [p.split("study model: ", 1)[1].strip() for p in str(row[1] or "").split("; ") if "study model: " in p]
    prev_study = named[0] if named and named[0] in table.index else (prev if prev in table.index else None)
    if prev_study is None or prev_study == CHAMPION:
        prev_note = f"previous champion {prev}: " + ("the same model" if prev_study == CHAMPION else "not in this study")
    else:
        cells = RE._cells(servable, DAILY_BUCKETS)
        lo, hi = RE._boot_diff(cells, prev_study, CHAMPION, DAILY_BUCKETS, "wmape", sel["block"])
        # Only an eligible model (it beats every baseline overall and on days 1-14) can outrank the new champion.
        better = (prev_study in sel["eligible"] and float(table.loc[prev_study, "score"]) < float(
            table.loc[CHAMPION, "score"]) and hi < 0)
        prev_ok = not better
        prev_note = (f"previous champion {prev} re-scored: {table.loc[prev_study, 'score']:.2f}% vs {CHAMPION} "
                     f"{table.loc[CHAMPION, 'score']:.2f}% (difference 95% interval {lo:+.2f} to {hi:+.2f}) -> "
                     + ("significantly better: the new run must NOT replace it" if better else "not better"))
print("  " + prev_note)

# ── 4. Each family's served line, refitted on the whole record ───────────────
banner(f"STEP 4: Refit on the whole record and forecast {FUTURE_DAYS} days")
cands = [m for m in table.index if not is_baseline(m)]
served_variant = {}
for fam in FAMILIES:
    members = [m for m in cands if S.FAMILY.get(m) == fam]
    if CHAMPION in members:
        served_variant[fam] = CHAMPION
    elif members:
        served_variant[fam] = min(members, key=lambda m: float(table.loc[m, "score"]))
champ_family = S.FAMILY.get(CHAMPION) if not S.uses_weather(CHAMPION) else None
F = ctx.F
# Real record only (user, 11 Nov 2026: every model's dates aligned): 25 May - 30 Jun 2026 hold broken and synthetic
# toll days, so the refit ends on 24 May and the forecast starts on 25 May, the same day as traffic and incidents.
hist = F[F.y.notna() & (F.ds <= S.REAL_END_VOLUME)].reset_index(drop=True)
last = hist.ds.max()
fut_ds = pd.date_range(last + pd.Timedelta(days=1), periods=FUTURE_DAYS, freq="D")
future = pd.DataFrame({"ds": fut_ds}).merge(F[["ds"] + S.KNOWN], on="ds", how="left")
for c in ctx.WX_ALL:
    future[c] = np.nan                         # weather after the origin is not known
MODELS = S.build_models()
fut_pred, fut_note = {}, {}
mean_y = float(hist.y.mean())
to_fit = dict(served_variant)
if champ_family is None:
    to_fit["champion"] = CHAMPION
for fam, name in to_fit.items():
    try:
        yh = np.asarray(MODELS[name](hist.copy(), future.copy()), dtype=float)
        if yh.shape != (FUTURE_DAYS,) or not np.isfinite(yh).all():
            raise ValueError("non-finite forecast")
        lo_, hi_ = float(yh.min()), float(yh.max())
        if lo_ < mean_y / 3 or hi_ > 3 * mean_y:
            raise ValueError(f"left the plausible range ({lo_:.0f} to {hi_:.0f} t/day against a mean of {mean_y:.0f})")
        fut_pred[fam] = yh
        print(f"  {fam:<11} {name:<28} {fut_ds[0].date()} .. {fut_ds[-1].date()}  mean {yh.mean():7.1f} t/day")
    except Exception as e:  # noqa: BLE001
        fut_pred[fam] = None
        fut_note[fam] = f"90-day projection not drawn: {e}"
        print(f"  {fam:<11} {name:<28} projection FAILED: {e}")

publish_problems = []
if not prev_ok:
    publish_problems.append(prev_note)
if champ_family is None:
    publish_problems.append(f"the champion {CHAMPION} has no forecast column in gold.ml_predictive_emissions (the "
                            f"dashboard draws GBR, Polynomial, LSTM and Derived only); serving it needs a Back-End change")
elif fut_pred.get(champ_family) is None:
    publish_problems.append(f"the champion's projection failed: {fut_note.get(champ_family)}")

# ── 5. Rows ──────────────────────────────────────────────────────────────────
banner("STEP 5: Rows to publish")
bm = pd.DataFrame(study["bucket_metrics"])
labs = [f"d{lo}-{hi}" for lo, hi in DAILY_BUCKETS]
bm = bm[bm.bucket.isin(labs)]
mean_m = bm.groupby("model")[["mae", "rmse", "mape", "r2"]].mean()
all_models = list(table_all.index)


def stored_name(m):
    """The family's served variant carries the family's name (the dashboard looks rows up by it); the others keep
    their own, renamed only where they would collide with it."""
    fam = S.FAMILY.get(m)
    if fam and served_variant.get(fam) == m:
        return fam
    if m == "LSTM":
        return "LSTM (univariate)"
    if m == "Derived":
        return "Derived (weekday ratio)"
    return m


ranked = [CHAMPION] + [m for m in table_all.sort_values("score").index if not is_baseline(m) and m != CHAMPION]
split_label = f"rolling origin {n_origins} x {S.HORIZON} d, step 14, scored to {S.SCORE_END.date()}"
first = labs[0]
base_first = float(table_all.loc[[m for m in table_all.index if is_baseline(m)], first].min())
ru = sel.get("runner_up")
metric_rows = []
for m in all_models:
    sc = float(table_all.loc[m, "score"])
    base = is_baseline(m)
    wx = S.uses_weather(m)
    accepted = (m in sel["eligible"]) and not wx
    reason, diag = None, []
    if base:
        reason = "baseline, not a candidate"
    elif not accepted:
        w = []
        if wx:
            v = study["weather_tests"].get(m, {})
            w.append(f"reads weather: served only while a real weather forecast exists, which no window after the "
                     f"record end has (days 1-14 with OBSERVED weather {v.get('weather_d1_14', float('nan')):.2f}% vs "
                     f"its twin {v.get('twin_d1_14', float('nan')):.2f}%, "
                     f"{'significant' if v.get('significant') else 'not significant'})")
        if sc >= base_score:
            w.append(f"mean WMAPE {sc:.2f}% does not beat the best baseline ({best_base}) {base_score:.2f}%")
        if float(table_all.loc[m, first]) >= base_first:
            w.append(f"days 1-14 WMAPE {table_all.loc[m, first]:.2f}% does not beat the best baseline {base_first:.2f}%")
        reason = "; ".join(w) or "not chosen"
    if m == CHAMPION and ru and not sel.get("vs_runner_up_significant", True):
        lo, hi = sel["vs_runner_up_ci"]
        diag.append(f"tied with {stored_name(ru)} - lead not significant (95% interval {lo:+.2f} to {hi:+.2f} pp)")
    if m == ru and not sel.get("vs_runner_up_significant", True):
        lo, hi = sel["vs_runner_up_ci"]
        diag.append(f"tied with {stored_name(CHAMPION)} - lead not significant (95% interval {lo:+.2f} to {hi:+.2f} pp)")
    if stored_name(m) != m:
        diag.append(f"study model: {m}")
    fam = S.FAMILY.get(m)
    if fam and served_variant.get(fam) == m and fut_note.get(fam):
        diag.append(fut_note[fam])
    mm = mean_m.loc[m] if m in mean_m.index else pd.Series(dtype=float)
    metric_rows.append(dict(
        model_name=stored_name(m), rmse=float(mm.get("rmse", np.nan)), mae=float(mm.get("mae", np.nan)),
        wmape=sc, r2=float(mm.get("r2", np.nan)), mase=sc / base_score, mape=float(mm.get("mape", np.nan)),
        rank=None if base else ranked.index(m) + 1, accepted=bool(accepted), rejected_reason=reason,
        uses_weather=bool(wx),
        diagnosis="; ".join(diag) or None, split_label=split_label))
mt = pd.DataFrame(metric_rows).sort_values("rank", na_position="last")
print(mt[["model_name", "rank", "accepted", "wmape", "mase", "mae", "r2"]].to_string(
    index=False, float_format=lambda v: f"{v:,.3f}"))

# The PRESENT band: every origin's days 1-14 (origins are 14 days apart, so they tile without overlap).
present = res[res.h <= 14]
band = {}
for fam, name in served_variant.items():
    s = present[present.model == name].set_index("date").forecast
    band[fam] = s[~s.index.duplicated()].to_dict()
band_days = set().union(*[set(v) for v in band.values()]) if band else set()
pred_rows = []
for r in hist.itertuples():
    pv = {fam: band.get(fam, {}).get(r.ds) for fam in FAMILIES}
    pred_rows.append((r.ds.date(), float(r.y), *[pv[f] for f in FAMILIES], champ_family or CHAMPION,
                      r.ds in band_days, False))
for i, ds in enumerate(fut_ds):
    pv = [None if fut_pred.get(f) is None else float(fut_pred[f][i]) for f in FAMILIES]
    pred_rows.append((ds.date(), None, *pv, champ_family or CHAMPION, False, True))
print(f"\n  ml_predictive_emissions: {sum(not r[7] and not r[8] for r in pred_rows)} past + "
      f"{sum(r[7] for r in pred_rows)} present (days 1-14 of {n_origins} origins) + {sum(r[8] for r in pred_rows)} future")

# Horizon accuracy for the champion: what each stretch of the projection is worth.
hz_rows = []
hb = bm.set_index(["model", "bucket"])
base_models = [m for m in table_all.index if is_baseline(m)]
for lo, hi in DAILY_BUCKETS:
    lab = f"d{lo}-{hi}"
    if (CHAMPION, lab) not in hb.index:
        continue
    c = hb.loc[(CHAMPION, lab)]
    bw = {b: float(table_all.loc[b, lab]) for b in base_models}
    bname = min(bw, key=bw.get)
    usable = bool(sel.get("usable", {}).get(lab, False))
    note = (f"beats every baseline (best: {bname} {bw[bname]:.2f}%)" if usable else
            f"loses to {bname} ({bw[bname]:.2f}%): the baseline is the better guide for these days")
    hz_rows.append((champ_family or CHAMPION, lo, hi, int(c.n), float(c.wmape), float(c.mape),
                    float(c.wmape) / bw[bname], float(c.mae), bw[bname], usable, note))
print(f"\n  ml_horizon_accuracy ({TARGET}, {CHAMPION}):")
for r in hz_rows:
    print(f"    days {r[1]:>2}-{r[2]:<3} n={r[3]:<4} WMAPE {r[4]:6.2f}%  best baseline {r[8]:6.2f}%  "
          f"{'usable' if r[9] else 'NOT usable'}")

results = {
    "generated": str(pd.Timestamp.now().isoformat(timespec="seconds")), "code_version": S.code_version(),
    "protocol": "EVALUATION_PROTOCOL.md (10 Nov 2026)", "study": {"file": json_path.name,
                                                                 "fingerprint": study["fingerprint"],
                                                                 "generated": study["generated"]},
    "source": "gold.fact_emissions_hourly", "series": {"days": int(len(hist)), "from": str(hist.ds.min().date()),
                                                       "to": str(last.date()), "scored_to": str(S.SCORE_END.date())},
    "origins": n_origins, "horizon": S.HORIZON, "champion": CHAMPION, "champion_column": champ_family,
    "served_variants": served_variant, "volume_model": study["volume_model"], "best_baseline": best_base,
    "selection": sel, "weather_tests": study["weather_tests"], "previous_champion": prev_note,
    "publish_problems": publish_problems, "metrics": mt.to_dict("records"),
    "horizon_accuracy": [dict(zip(["model", "h_lo", "h_hi", "n", "wmape", "mape", "mase", "mae", "baseline_wmape",
                                   "usable", "note"], r)) for r in hz_rows],
}

METRIC_SQL = """INSERT INTO gold.ml_model_metrics
      (model_name,target,rmse,mae,wmape,r2,mase,mape,rank,accepted,rejected_reason,uses_weather,diagnosis,split_label,
       updated_at)
    VALUES (%s,'Corridor CO2',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())"""
PRED_SQL = """INSERT INTO gold.ml_predictive_emissions
      (forecast_date, actual_co2, pred_gbr, pred_polynomial, pred_lstm, pred_derived, champion_model, is_holdout, is_future)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)"""
HZ_SQL = """INSERT INTO gold.ml_horizon_accuracy
      (target, model_name, h_lo, h_hi, n, wmape, mape, mase, mae, baseline_wmape, usable, note)
    VALUES ('Corridor CO2',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""


def nn(v):
    return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else v


def metric_params(r):
    return (r["model_name"], nn(r["rmse"]), nn(r["mae"]), nn(r["wmape"]), nn(r["r2"]), nn(r["mase"]), nn(r["mape"]),
            None if r["rank"] is None or pd.isna(r["rank"]) else int(r["rank"]), r["accepted"], r["rejected_reason"],
            r["uses_weather"], r["diagnosis"], r["split_label"])


if DRY_RUN:
    banner("DRY RUN: nothing written")
    with psycopg2.connect(S.PG) as conn:
        conn.set_session(readonly=True)
        cur = conn.cursor()
        for t, cols in (("ml_model_metrics", ["model_name", "target", "rmse", "mae", "wmape", "r2", "mase", "mape",
                                              "rank", "accepted", "rejected_reason", "uses_weather", "diagnosis",
                                              "split_label"]),
                        ("ml_predictive_emissions", ["forecast_date", "actual_co2", "pred_gbr", "pred_polynomial",
                                                     "pred_lstm", "pred_derived", "champion_model", "is_holdout",
                                                     "is_future"]),
                        ("ml_horizon_accuracy", ["target", "model_name", "h_lo", "h_hi", "n", "wmape", "mape", "mase",
                                                 "mae", "baseline_wmape", "usable", "note"])):
            cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='gold' AND table_name=%s",
                        (t,))
            have = {x[0] for x in cur.fetchall()}
            missing = [c for c in cols if c not in have]
            print(f"  gold.{t}: {'all target columns present' if not missing else 'MISSING ' + ', '.join(missing)}")
        n_sql = 0
        for r in mt.to_dict("records"):
            cur.mogrify(METRIC_SQL, metric_params(r)); n_sql += 1
        for r in pred_rows:
            cur.mogrify(PRED_SQL, r); n_sql += 1
        for r in hz_rows:
            cur.mogrify(HZ_SQL, r); n_sql += 1
        print(f"  {n_sql} statements rendered (not executed)")
    results["dry_run"] = True
    print("  publish: " + ("BLOCKED - " + " | ".join(publish_problems) if publish_problems else "would publish"))
    print("  gold.ml_model_metrics, gold.ml_predictive_emissions and gold.ml_horizon_accuracy are unchanged.")
    raise SystemExit(0)

if publish_problems:
    banner("NOT PUBLISHED")
    for p in publish_problems:
        print("  " + p)
    raise SystemExit(2)

banner("STEP 6: Writing (one transaction)")
conn = psycopg2.connect(S.PG)
try:
    cur = conn.cursor()
    cur.execute("DELETE FROM gold.ml_model_metrics WHERE target = %s", (TARGET,))
    for r in mt.to_dict("records"):
        cur.execute(METRIC_SQL, metric_params(r))
    cur.execute("""
      CREATE TABLE IF NOT EXISTS gold.ml_predictive_emissions (
        id serial PRIMARY KEY, forecast_date date NOT NULL, actual_co2 numeric(12,3),
        pred_gbr numeric(12,3), pred_polynomial numeric(12,3), pred_lstm numeric(12,3), pred_derived numeric(12,3),
        champion_model text, is_holdout boolean DEFAULT false, is_future boolean DEFAULT false,
        updated_at timestamptz DEFAULT now())""")
    cur.execute("""COMMENT ON TABLE gold.ml_predictive_emissions IS
      'Daily corridor CO2 (tonnes). PRESENT (is_holdout) = days 1-14 of each rolling origin (EVALUATION_PROTOCOL.md),
       the forecasts the published metrics were computed from; FUTURE = 90 days refitted on the whole record.
       Actuals roll up from gold.fact_emissions_hourly. Written by train_emissions.py.'""")
    cur.execute("TRUNCATE gold.ml_predictive_emissions RESTART IDENTITY")
    for r in pred_rows:
        cur.execute(PRED_SQL, r)
    cur.execute("""
      CREATE TABLE IF NOT EXISTS gold.ml_horizon_accuracy (
        id serial PRIMARY KEY, target text NOT NULL, model_name text NOT NULL, h_lo int NOT NULL, h_hi int NOT NULL,
        n int, wmape numeric(10,4), mape numeric(10,4), mase numeric(10,4), mae numeric(14,2),
        baseline_wmape numeric(10,4), usable boolean, note text, updated_at timestamptz DEFAULT now())""")
    cur.execute("DELETE FROM gold.ml_horizon_accuracy WHERE target = %s", (TARGET,))
    for r in hz_rows:
        cur.execute(HZ_SQL, r)
    conn.commit()
finally:
    conn.close()
out = S.WORK / "outputs" / "emissions_results.json"
out.write_text(json.dumps(results, indent=2, default=str))
print(f"  published {CHAMPION} ({champ_family}); {out.name} written")
banner("DONE")
