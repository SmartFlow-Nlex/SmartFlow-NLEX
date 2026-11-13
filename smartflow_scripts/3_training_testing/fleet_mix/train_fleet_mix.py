"""
Daily fleet-mix forecast (Class 1 / 2 / 3 shares): the served model and its published metrics, under
EVALUATION_PROTOCOL.md (10 Nov 2026).

The testing is fleet_mix_study.py; this file publishes what it found. Rewritten 10 Nov 2026 after an audit found the
previous version tested 7 days but served 30 with no horizon study, scored synthetic days after 2026-05-24, compared
the models with baselines too weak to be the bar (persistence ignored the weekday; a same-weekday average over 8 weeks
tied its Dirichlet champion, Aitchison 0.1191 against 0.1190), never stored the metric it chose on (the wmape column
held the heavy-vehicle WMAPE and mase a persistence ratio, so the dashboard and the weekly gate ranked on something
else), flagged surges against the mean of the whole series including the days being forecast, and described a
4-year, 7-day setup that no longer matched it. The previous version is in git.

WHY COMPOSITIONS. The target is three shares that must be positive and sum to 1. Every candidate predicts on the
simplex (Dirichlet) or in centred log-ratio space mapped back through the inverse CLR, so each forecast is a valid
fleet mix by construction. Aitchison distance (Euclidean distance between CLR coordinates) is the selection metric:
it treats a proportional miss on the rare Class 3 like the same proportional miss on Class 1, which MAPE does not.

STEPS
  1. The study. _work/cache/fleet_mix_study.json is used when its fingerprint (the shares, holidays and code) matches;
     otherwise the study runs here: 8 candidates and 3 baselines, 26 rolling origins across the last real year,
     30 days each (buckets 1-7, 8-14, 15-30), nothing after 2026-05-24 scored.
  2. The champion: the protocol's rule on Aitchison distance (lowest mean over the buckets among the models that beat
     the best baseline overall AND on days 1-7; a simpler model wins a tie whose lead is not significant). If nothing
     qualifies, the best baseline is served and published as such.
  3. The previous champion, re-scored on the same origins, must not be significantly better (protocol section 8).
  4. The champion is refitted on every day of the record and forecasts 30 days from the day after it ends.
  5. Writes (not with --dry-run): gold.ml_model_metrics (target 'Fleet Mix'), gold.ml_predictive_fleet_mix (the
     PRESENT band is every origin's days 1-14, the forecasts the metrics came from; then the 30-day future),
     gold.ml_horizon_accuracy (target 'Fleet Mix', per bucket: mase = Aitchison over the best baseline's, wmape =
     heavy-share WMAPE, raw distance in note; no dashboard route reads these rows yet) and
     fleet_mix_results.json beside this file (with the code version).

COLUMNS (gold.ml_model_metrics; the panel labels them MAE (pp), MAPE, HEAVY WMAPE, HEAVY R2, SKILL)
  mase   SKILL: the selection score (mean bucket Aitchison distance) divided by the best baseline's. Below 1 beats
         every baseline; sorting on it is sorting on the selection metric. The raw distance is in diagnosis.
  wmape  heavy-vehicle (Class 2+3) share WMAPE;  r2 heavy-share R2;  mae / rmse  class-share error in percentage
         points;  mape  per-class MAPE. All are the mean of the three buckets.
  rank   1 = the champion, then by score; NULL for baselines.   accepted = eligible under the protocol.

SURGE. A served day is flagged as a heavy-vehicle surge when its forecast Class 2+3 share exceeds the mean of the
TRAINING days before its forecast origin by 1.5 standard deviations (each PRESENT day against its own origin's
training data; the future against the whole record).

FLAGS  --dry-run (everything up to the writes; rows rendered, nothing written)   --rerun-study
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import fleet_mix_study as S  # noqa: E402
from common import rolling_eval as RE  # noqa: E402
from common.rolling_eval import is_baseline  # noqa: E402

TARGET = "Fleet Mix"
FUTURE_DAYS = S.HORIZON
SURGE_SIGMA = 1.5
ARGS = sys.argv[1:]
DRY_RUN = "--dry-run" in ARGS
RERUN = "--rerun-study" in ARGS
# --smoke-study N: test the publishing path on a smoke study (N origins); dry-run only.
SMOKE = int(ARGS[ARGS.index("--smoke-study") + 1]) if "--smoke-study" in ARGS else None
if SMOKE and not DRY_RUN:
    raise SystemExit("--smoke-study only tests the publishing path: add --dry-run")


def banner(t):
    print("\n" + "=" * 78 + f"\n  {t}\n" + "=" * 78)


# ── 1. The study ─────────────────────────────────────────────────────────────
banner("STEP 1: The study (fleet_mix_study.py)")
ctx = S.load()
csv_path, json_path = S.outputs("fleet_mix_study" if not SMOKE else f"fleet_mix_study_smoke{SMOKE}")
study = None
if json_path.exists() and csv_path.exists() and not RERUN:
    j = json.loads(json_path.read_text())
    if j.get("fingerprint") == ctx.fp and bool(j.get("smoke")) == bool(SMOKE):
        study = j
        print(f"  using the saved study ({json_path.name}, {j['generated']}, fingerprint {ctx.fp})")
    else:
        print(f"  saved study does not match the current data/code (saved {j.get('fingerprint')}, now {ctx.fp})")
if study is None:
    print("  running the study now (resumable)")
    study = S.run(SMOKE)
res = pd.read_csv(csv_path, parse_dates=["date"])
n_origins = res.origin.nunique()
sel = study["selection"]
table = pd.DataFrame(sel["table"]).T
CHAMPION = sel["champion"]
best_base = sel["best_baseline"]
base_score = float(table.loc[best_base, "score"])
labs = [f"d{lo}-{hi}" for lo, hi in S.BUCKETS]

# ── 2. The champion ──────────────────────────────────────────────────────────
banner("STEP 2: The champion (Aitchison distance)")
S.print_selection(sel)
if sel.get("champion_is_baseline"):
    print(f"  NO candidate beats the best baseline; the protocol serves {CHAMPION}")

# ── 3. The previous champion (protocol section 8) ────────────────────────────
banner("STEP 3: Previous champion")
import psycopg2  # noqa: E402
with psycopg2.connect(S.PG) as conn:
    conn.set_session(readonly=True)
    cur = conn.cursor()
    cur.execute("SELECT model_name FROM gold.ml_model_metrics WHERE target = %s AND accepted AND rank IS NOT NULL "
                "ORDER BY rank LIMIT 1", (TARGET,))
    row = cur.fetchone()
prev = row[0] if row else None
prev_ok, prev_note = True, "no previous champion"
if prev:
    if prev not in table.index or prev == CHAMPION:
        prev_note = f"previous champion {prev}: " + ("the same model" if prev == CHAMPION else "not in this study")
    else:
        cells = RE._cells(S.as_error(res, "aitchison"), S.BUCKETS)
        lo, hi = RE._boot_diff(cells, prev, CHAMPION, S.BUCKETS, "mae", sel["block"])
        # Only an eligible model (it beats every baseline overall and on days 1-7) can outrank the new champion.
        better = (prev in sel["eligible"] and float(table.loc[prev, "score"]) < float(table.loc[CHAMPION, "score"])
                  and hi < 0)
        prev_ok = not better
        prev_note = (f"previous champion {prev} re-scored: Aitchison {table.loc[prev, 'score']:.4f} vs {CHAMPION} "
                     f"{table.loc[CHAMPION, 'score']:.4f} (difference 95% interval {lo:+.4f} to {hi:+.4f}) -> "
                     + ("significantly better: the new run must NOT replace it" if better else "not better"))
print("  " + prev_note)

# ── 4. The served forecast ───────────────────────────────────────────────────
banner(f"STEP 4: Refit {CHAMPION} on the whole record and forecast {FUTURE_DAYS} days")
F = ctx.F
# Real record only (user, 11 Nov 2026: every model's dates aligned): 25 May - 30 Jun 2026 hold broken and synthetic
# toll days, so the refit ends on 24 May and the forecast starts on 25 May, the same day as traffic and incidents.
hist = F[F.c1.notna() & (F.ds <= S.REAL_END_VOLUME)].reset_index(drop=True)
last = hist.ds.max()
fut_ds = pd.date_range(last + pd.Timedelta(days=1), periods=FUTURE_DAYS, freq="D")
future = pd.DataFrame({"ds": fut_ds}).merge(F[["ds"] + S.KNOWN], on="ds", how="left")
MODELS = S.build_models()
publish_problems = [] if prev_ok else [prev_note]
try:
    P = np.asarray(MODELS[CHAMPION](hist.copy(), future.copy()), dtype=float)
    if P.shape != (FUTURE_DAYS, 3) or not np.isfinite(P).all() or (P <= 0).any():
        raise ValueError("not a valid composition")
    print(f"  {fut_ds[0].date()} .. {fut_ds[-1].date()}  mean mix C1 {P[:, 0].mean() * 100:.2f}%  "
          f"C2 {P[:, 1].mean() * 100:.2f}%  C3 {P[:, 2].mean() * 100:.2f}%")
except Exception as e:  # noqa: BLE001
    P = None
    publish_problems.append(f"the champion's projection failed: {e}")
    print(f"  projection FAILED: {e}")

# ── 5. Rows ──────────────────────────────────────────────────────────────────
banner("STEP 5: Rows to publish")
bm = pd.DataFrame(study["bucket_metrics"])
bm = bm[bm.bucket.isin(labs)]
mean_m = bm.groupby("model")[["heavy_wmape", "heavy_r2", "mae_pp", "rmse_pp", "mape", "tvd_pct"]].mean()
first = labs[0]
base_models = [m for m in table.index if is_baseline(m)]
base_first = float(table.loc[base_models, first].min())
ranked = ([] if is_baseline(CHAMPION) else [CHAMPION]) + [m for m in table.sort_values("score").index
                                                          if not is_baseline(m) and m != CHAMPION]
split_label = f"rolling origin {n_origins} x {S.HORIZON} d, step 14, to {S.SCORE_END.date()}"
ru = sel.get("runner_up")
metric_rows = []
for m in table.index:
    sc = float(table.loc[m, "score"])
    base = is_baseline(m)
    accepted = m in sel["eligible"]
    reason, diag = None, [f"Aitchison {sc:.4f} (mean of {', '.join(labs)})"]
    if base:
        reason = "baseline, not a candidate" + (" - SERVED: no candidate beats it" if m == CHAMPION else "")
    elif not accepted:
        w = []
        if sc >= base_score:
            w.append(f"Aitchison {sc:.4f} does not beat the best baseline ({best_base}) {base_score:.4f}")
        if float(table.loc[m, first]) >= base_first:
            w.append(f"days 1-7 Aitchison {table.loc[m, first]:.4f} does not beat the best baseline {base_first:.4f}")
        reason = "; ".join(w) or "not chosen"
    if ru and not sel.get("vs_runner_up_significant", True) and m in (CHAMPION, ru):
        lo, hi = sel["vs_runner_up_ci"]
        other = ru if m == CHAMPION else CHAMPION
        diag.append(f"tied with {other} - lead not significant (95% interval {lo:+.4f} to {hi:+.4f})")
    mm = mean_m.loc[m]
    metric_rows.append(dict(
        model_name=m, rmse=float(mm.rmse_pp), mae=float(mm.mae_pp), wmape=float(mm.heavy_wmape),
        r2=float(mm.heavy_r2), mase=sc / base_score, mape=float(mm.mape),
        rank=None if base else ranked.index(m) + 1, accepted=bool(accepted), rejected_reason=reason,
        diagnosis="; ".join(diag), split_label=split_label))
mt = pd.DataFrame(metric_rows).sort_values("rank", na_position="last")
print(mt[["model_name", "rank", "accepted", "mase", "wmape", "mae", "r2"]].to_string(
    index=False, float_format=lambda v: f"{v:,.4f}"))

# PRESENT band: the champion's days 1-14 from each origin; surges against that origin's training days.
origins = {int(k): pd.Timestamp(v) for k, v in study["origins"].items()}
present = res[(res.model == CHAMPION) & (res.h <= 14)]
served, thr = {}, {}
heavy_all = hist.set_index("ds").heavy
for r in present.itertuples():
    served[r.date] = np.array([r.f1, r.f2, r.f3])
    o = origins[int(r.origin)]
    tr = heavy_all[heavy_all.index < o]
    thr[r.date] = float(tr.mean() + SURGE_SIGMA * tr.std())
fut_thr = float(heavy_all.mean() + SURGE_SIGMA * heavy_all.std())
if P is not None:
    for i, ds in enumerate(fut_ds):
        served[ds] = P[i]
        thr[ds] = fut_thr
ctx_from = min(origins.values())
actual = hist.set_index("ds")[S.PARTS]
pred_rows, n_surge, fut_set = [], 0, set(fut_ds)
for ds in sorted(set(hist[hist.ds >= ctx_from].ds) | set(served)):
    a = actual.loc[ds].values if ds in actual.index else [None] * 3
    p = served.get(ds)
    hp = None if p is None else float(p[1] + p[2])
    surge = bool(hp is not None and hp > thr[ds])
    n_surge += surge and ds in fut_set
    pred_rows.append((ds.date(), *[None if v is None else float(v) for v in a],
                      *([None] * 3 if p is None else [float(v) for v in p]), hp, surge, CHAMPION,
                      bool(p is not None and ds in actual.index), bool(ds not in actual.index)))
print(f"\n  ml_predictive_fleet_mix: {len(pred_rows)} rows from {ctx_from.date()} "
      f"({sum(r[10] for r in pred_rows)} present, {sum(r[11] for r in pred_rows)} future); "
      f"future surge threshold {fut_thr * 100:.2f}% heavy share, {n_surge} future day(s) flagged")

# Horizon accuracy for the served model, per bucket.
hb = bm.set_index(["model", "bucket"])
hz_rows = []
for lo, hi in S.BUCKETS:
    lab = f"d{lo}-{hi}"
    c = hb.loc[(CHAMPION, lab)]
    ba = {b: float(table.loc[b, lab]) for b in base_models}
    bname = min(ba, key=ba.get)
    bw = float(min(hb.loc[(b, lab)].heavy_wmape for b in base_models))
    usable = bool(sel.get("usable", {}).get(lab, False)) if not is_baseline(CHAMPION) else False
    note = (f"Aitchison {float(c.aitchison):.4f} vs best baseline {bname} {ba[bname]:.4f}: "
            + ("beats every baseline" if usable else "does not beat the best baseline here")
            + ". Columns: mase = Aitchison over the best baseline's, wmape = heavy-share WMAPE, baseline_wmape = "
              "the best baseline heavy-share WMAPE, mae = class-share MAE (pp), mape = per-class MAPE")
    hz_rows.append((CHAMPION, lo, hi, int(c.n), float(c.heavy_wmape), float(c.mape), float(c.aitchison) / ba[bname],
                    float(c.mae_pp), bw, usable, note))
print(f"\n  ml_horizon_accuracy ({TARGET}, {CHAMPION}):")
for r in hz_rows:
    print(f"    days {r[1]:>2}-{r[2]:<3} n={r[3]:<4} Aitchison x{r[6]:.3f} best baseline  heavy WMAPE "
          f"{r[4]:.2f}% (best baseline {r[8]:.2f}%)  {'usable' if r[9] else 'NOT usable'}")

results = {
    "generated": pd.Timestamp.now().isoformat(timespec="seconds"), "code_version": S.code_version(),
    "protocol": "EVALUATION_PROTOCOL.md (10 Nov 2026)",
    "study": {"file": json_path.name, "fingerprint": study["fingerprint"], "generated": study["generated"]},
    "champion": CHAMPION, "champion_is_baseline": bool(sel.get("champion_is_baseline")),
    "baseline": {"name": best_base, "aitchison": base_score}, "selection": sel,
    "previous_champion": prev_note, "publish_problems": publish_problems,
    "models": mt.to_dict("records"), "surge_threshold_future": fut_thr,
    "horizon_accuracy": [dict(zip(["model", "h_lo", "h_hi", "n", "heavy_wmape", "mape", "aitchison_vs_best_baseline",
                                   "mae_pp", "baseline_heavy_wmape", "usable", "note"], r)) for r in hz_rows],
}

METRIC_SQL = """INSERT INTO gold.ml_model_metrics
      (model_name,target,rmse,mae,wmape,r2,mase,mape,rank,accepted,rejected_reason,uses_weather,diagnosis,split_label,
       updated_at)
    VALUES (%s,'Fleet Mix',%s,%s,%s,%s,%s,%s,%s,%s,%s,false,%s,%s,now())"""
PRED_SQL = """INSERT INTO gold.ml_predictive_fleet_mix
      (forecast_date,actual_c1,actual_c2,actual_c3,pred_c1,pred_c2,pred_c3,heavy_pred,heavy_surge,champion_model,
       is_holdout,is_future)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""
HZ_SQL = """INSERT INTO gold.ml_horizon_accuracy
      (target, model_name, h_lo, h_hi, n, wmape, mape, mase, mae, baseline_wmape, usable, note)
    VALUES ('Fleet Mix',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""


def nn(v):
    return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else v


def metric_params(r):
    return (r["model_name"], nn(r["rmse"]), nn(r["mae"]), nn(r["wmape"]), nn(r["r2"]), nn(r["mase"]), nn(r["mape"]),
            None if r["rank"] is None or pd.isna(r["rank"]) else int(r["rank"]), r["accepted"], r["rejected_reason"],
            r["diagnosis"], r["split_label"])


if DRY_RUN:
    banner("DRY RUN: nothing written")
    with psycopg2.connect(S.PG) as conn:
        conn.set_session(readonly=True)
        cur = conn.cursor()
        for t, cols in (("ml_model_metrics", ["model_name", "target", "rmse", "mae", "wmape", "r2", "mase", "mape",
                                              "rank", "accepted", "rejected_reason", "uses_weather", "diagnosis",
                                              "split_label"]),
                        ("ml_predictive_fleet_mix", ["forecast_date", "actual_c1", "actual_c2", "actual_c3", "pred_c1",
                                                     "pred_c2", "pred_c3", "heavy_pred", "heavy_surge",
                                                     "champion_model", "is_holdout", "is_future"]),
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
    print("  publish: " + ("BLOCKED - " + " | ".join(publish_problems) if publish_problems else "would publish"))
    print("  gold.ml_model_metrics, gold.ml_predictive_fleet_mix and gold.ml_horizon_accuracy are unchanged.")
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
    CREATE TABLE IF NOT EXISTS gold.ml_predictive_fleet_mix (
        id serial PRIMARY KEY, forecast_date date NOT NULL,
        actual_c1 numeric(7,5), actual_c2 numeric(7,5), actual_c3 numeric(7,5),
        pred_c1 numeric(7,5), pred_c2 numeric(7,5), pred_c3 numeric(7,5),
        heavy_pred numeric(7,5), heavy_surge boolean, champion_model text,
        is_holdout boolean, is_future boolean, updated_at timestamptz DEFAULT now())""")
    cur.execute("""COMMENT ON TABLE gold.ml_predictive_fleet_mix IS
      'Daily Class 1/2/3 share forecast (fractions summing to 1). is_holdout = days 1-14 of each rolling origin
       (EVALUATION_PROTOCOL.md), the forecasts the published metrics came from; is_future = the 30-day projection
       refitted on the whole record. Written by train_fleet_mix.py.'""")
    cur.execute("DELETE FROM gold.ml_predictive_fleet_mix")
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
out = HERE / "fleet_mix_results.json"
out.write_text(json.dumps(results, indent=2, default=str))
print(f"  published {CHAMPION}; {out.name} written")
banner("DONE")
