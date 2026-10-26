import { db } from "../config/db.js";

/* The 48-hour hourly traffic forecast (smartflow_scripts/3_training_testing/traffic_hourly_48h).
 *
 * forecast_48h.py writes one run per issue: 32 plaza series x 48 hours x 3 classes, plus a 'corridor' row per hour
 * that is the sum of the series. This reads the latest run and answers one selection:
 *   no filter            the corridor (calibrated 80% band)
 *   exit and/or direction the series that match, summed; a band only when exactly one series matches, because a band
 *                        is calibrated per series and the sum of bands is not the band of a sum
 * Recorded counts come from gold.fact_traffic_hourly (the table the model trained on): the 72 hours before the
 * forecast, and any of the 48 forecast hours that have been recorded since. */

export type Forecast48hQuery = { exit?: string; direction?: "NB" | "SB" };

export type Forecast48hHour = {
  ts: string; horizon: number;
  class1: number; class2: number; class3: number; total: number;
  lo: number | null; hi: number | null;
  classBands: { lo1: number; hi1: number; lo2: number; hi2: number; lo3: number; hi3: number } | null;
  actual: number | null;
};

const STALE_AFTER_H = 48;

// A plain local timestamp from pg ('YYYY-MM-DD HH:MM:SS') — these are Manila wall-clock hours with no zone.
const TS = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS')`;

export async function getForecast48h(q: Forecast48hQuery) {
  if (!db) return null;
  try {
    const runRes = await db.query(
      `SELECT run_id, issued_at, ${TS("origin_ts")} AS origin_ts, ${TS("history_end")} AS history_end,
              history_synthetic, model, model_label, status, series_model, series_fallback,
              interval_level::float AS interval_level, info,
              EXTRACT(epoch FROM ((now() AT TIME ZONE 'Asia/Manila') - history_end)) / 3600 AS hours_since
         FROM gold.ml_forecast_48h_runs ORDER BY run_id DESC LIMIT 1`
    );
    if (!runRes.rows.length) return null;
    const run = runRes.rows[0];

    const seriesRes = await db.query(
      `SELECT DISTINCT series_key, exit_canonical, direction, role, toll_system, method
         FROM gold.ml_forecast_hourly_48h WHERE run_id = $1 AND series_key <> 'corridor'
        ORDER BY exit_canonical, direction`,
      [run.run_id]
    );
    const all = seriesRes.rows as { series_key: string; exit_canonical: string; direction: string | null; role: string | null; toll_system: string | null; method: string }[];
    const picked = all.filter((s) => (!q.exit || s.exit_canonical === q.exit) && (!q.direction || s.direction === q.direction));
    const corridor = !q.exit && !q.direction;
    const single = !corridor && picked.length === 1;
    if (!corridor && picked.length === 0) {
      return { run: shapeRun(run), selection: { exit: q.exit ?? null, direction: q.direction ?? null, matched: 0 }, series: all.map(shapeSeries), hours: [], history: [] };
    }
    const keys = corridor ? ["corridor"] : picked.map((s) => s.series_key);

    const [fcRes, recRes] = await Promise.all([
      db.query(
        `SELECT ${TS("forecast_ts")} AS ts, horizon_h,
                SUM(class_1)::float c1, SUM(class_2)::float c2, SUM(class_3)::float c3, SUM(total)::float total,
                MAX(lo_total)::float lo, MAX(hi_total)::float hi,
                MAX(lo_1)::float lo1, MAX(hi_1)::float hi1, MAX(lo_2)::float lo2, MAX(hi_2)::float hi2,
                MAX(lo_3)::float lo3, MAX(hi_3)::float hi3
           FROM gold.ml_forecast_hourly_48h
          WHERE run_id = $1 AND series_key = ANY($2::text[])
          GROUP BY forecast_ts, horizon_h ORDER BY forecast_ts`,
        [run.run_id, keys]
      ),
      // Recorded hours: 72 before the origin through the end of the forecast window.
      db.query(
        `SELECT ${TS("date + hour * interval '1 hour'")} AS ts,
                SUM(class_1)::float c1, SUM(class_2)::float c2, SUM(class_3)::float c3
           FROM gold.fact_traffic_hourly
          WHERE status = 'nlex'
            AND date BETWEEN ($1::timestamp - interval '72 hours')::date AND ($1::timestamp + interval '48 hours')::date
            AND date + hour * interval '1 hour' >= $1::timestamp - interval '72 hours'
            AND date + hour * interval '1 hour' <  $1::timestamp + interval '48 hours'
            AND ($2::text[] IS NULL OR
                 exit_canonical || '|' || COALESCE(direction,'-') || '|' || COALESCE(role,'-') || '|' || COALESCE(toll_system,'-') = ANY($2::text[]))
          GROUP BY 1 ORDER BY 1`,
        [run.origin_ts, corridor ? null : keys]
      ),
    ]);

    const rec = new Map<string, { c1: number; c2: number; c3: number }>();
    for (const r of recRes.rows) rec.set(r.ts, { c1: r.c1, c2: r.c2, c3: r.c3 });
    const hours: Forecast48hHour[] = fcRes.rows.map((r) => {
      const a = rec.get(r.ts);
      const banded = corridor || single;
      return {
        ts: r.ts, horizon: r.horizon_h,
        class1: r.c1, class2: r.c2, class3: r.c3, total: r.total,
        lo: banded ? r.lo : null, hi: banded ? r.hi : null,
        classBands: single && r.lo1 != null
          ? { lo1: r.lo1, hi1: r.hi1, lo2: r.lo2, hi2: r.hi2, lo3: r.lo3, hi3: r.hi3 } : null,
        actual: a ? a.c1 + a.c2 + a.c3 : null,
      };
    });
    const history = recRes.rows
      .filter((r) => r.ts < run.origin_ts)
      .map((r) => ({ ts: r.ts, class1: r.c1, class2: r.c2, class3: r.c3, total: r.c1 + r.c2 + r.c3 }));

    return {
      run: shapeRun(run),
      selection: {
        exit: q.exit ?? null, direction: q.direction ?? null, matched: corridor ? all.length : picked.length,
        corridor, bandAvailable: (corridor || single) && hours.some((h) => h.lo != null),
        methods: [...new Set((corridor ? all : picked).map((s) => s.method))],
        // Direction totals leave out the plazas the record does not split by direction.
        unsplitExcluded: q.direction && !q.exit ? all.filter((s) => s.direction !== "NB" && s.direction !== "SB").map((s) => s.exit_canonical) : [],
      },
      series: all.map(shapeSeries),
      hours,
      history,
    };
  } catch (err) {
    // Thrown, not null: null means "no run issued yet" (404), and a database that is briefly unreachable must not
    // read as that, or the dashboard stops asking (it did, 2026-10-26).
    console.error("getForecast48h", err);
    throw err;
  }
}

function shapeSeries(s: { series_key: string; exit_canonical: string; direction: string | null; role: string | null; toll_system: string | null; method: string }) {
  return { key: s.series_key, exit: s.exit_canonical, direction: s.direction, role: s.role, tollSystem: s.toll_system, method: s.method };
}

function shapeRun(run: Record<string, any>) {
  const hoursSince = Number(run.hours_since);
  const info = run.info ?? {};
  const bt = info.backtest ?? {};
  return {
    runId: run.run_id,
    issuedAt: run.issued_at,
    originTs: run.origin_ts,
    historyEnd: run.history_end,
    historySynthetic: run.history_synthetic,
    model: run.model,
    modelLabel: run.model_label,
    status: run.status as "ok" | "partial_fallback" | "fallback",
    seriesModel: run.series_model,
    seriesFallback: run.series_fallback,
    fallbackReasons: info.fallback_reasons ?? {},
    intervalLevel: run.interval_level,
    freshness: {
      hoursSinceHistoryEnd: Math.round(hoursSince),
      stale: hoursSince > STALE_AFTER_H,
      // the whole 48-hour window is already behind the clock: the record stops at the latest upload
      windowPast: hoursSince > 48 + 1,
    },
    backtest: bt.series ? {
      window: info.test_window ? { first: info.test_window.first, last: info.test_window.last } : null,
      seriesWape: bt.series.all?.WAPE ?? null,
      seriesMae: bt.series.all?.MAE ?? null,
      corridorWape: bt.corridor?.all?.WAPE ?? null,
      corridorMape: bt.corridor?.all?.MAPE ?? null,
      byHorizon: Object.fromEntries(Object.entries(bt.horizon ?? {}).map(([h, m]: [string, any]) => [h, m.WAPE])),
      naiveSeriesWape: info.naive_backtest?.series?.WAPE ?? null,
      currentSeriesWape: info.current_method_backtest?.series?.WAPE ?? null,
      bandCoverage: info.intervals?.coverage_series_total ?? null,
      corridorBandCoverage: info.intervals?.coverage_corridor ?? null,
      trainedThrough: info.trained_through ?? null,
      why: info.why ?? null,
      // Every learned candidate of the same 2025 test, for the forecast card's evidence table (forecast_48h.py).
      comparison: Array.isArray(info.comparison)
        ? info.comparison.map((c: Record<string, any>) => ({
            model: c.model, label: c.label, served: Boolean(c.served),
            wape: c.wape ?? null, corridorWape: c.corridor_wape ?? null,
            mase: c.mase ?? null, mae: c.mae ?? null, rmse: c.rmse ?? null, r2: c.r2 ?? null, mape: c.mape ?? null,
            byHorizon: c.by_horizon ?? {}, byCondition: c.by_condition ?? {},
          }))
        : [],
    } : null,
  };
}
