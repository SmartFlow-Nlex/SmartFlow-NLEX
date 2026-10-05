"use client";

/**
 * Forecasted fleet composition — the modelling diagram's second Emission
 * Forecasting box.
 *
 * Every number comes from GET /api/emissions/fleet-mix, which serves
 * gold.ml_predictive_fleet_mix, written by
 * smartflow_scripts/3_training_testing/fleet_mix/train_fleet_mix.py.
 *
 * WHY A STACKED AREA AND NOT THREE LINES
 *
 *   The three class shares are a composition: they sum to 100% by definition,
 *   so they are not three independent series that happen to share an axis. Drawn
 *   as separate lines, a reader has to add them up mentally to see that Class 1
 *   giving up a point is Class 2 or 3 taking it. Stacked to 100%, that trade is
 *   the shape of the chart.
 *
 * WHY THE FORECAST IS A SEPARATE, PALER BAND
 *
 *   Actuals and predictions on one continuous surface read as one measured
 *   series, which is exactly the claim the panel must not make. The projection
 *   is drawn in the same colours at reduced opacity with a marked boundary, so
 *   where the evidence stops is visible without reading a legend.
 */

import type { EChartsOption } from "echarts";
import { useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import DashboardChart from "./DashboardChart";
import InfoTooltip from "./InfoTooltip";
import ChartSkeleton from "./ChartSkeleton";
import StateNote from "../stage/StateNote";
import { useChartTheme, seriesRamp } from "../../lib/chart-theme";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/** Must match HORIZON in train_fleet_mix.py — the stretch that was validated. */
/* Days averaged on each side of the heavy-share comparison. Matched to the
 * projection length so like is compared with like, and long enough to span
 * several weekly cycles — the series is strongly day-of-week seasonal, so a
 * shorter window would just re-import the cherry-picking problem. */
const HEAVY_WINDOW_DAYS = 30;

const VALIDATED_HORIZON = 7;

type Row = {
  d: string;
  actual_c1: number | null; actual_c2: number | null; actual_c3: number | null;
  pred_c1: number | null; pred_c2: number | null; pred_c3: number | null;
  heavy_pred: number | null; heavy_surge: boolean;
  champion_model: string | null;
  is_holdout: boolean; is_future: boolean;
};

type ModelRow = {
  model_name: string; rank: number | null; accepted: boolean;
  mae: number | null; rmse: number | null; wmape: number | null;
  r2: number | null; mase: number | null; mape: number | null;
  rejected_reason: string | null; diagnosis: string | null; split_label: string | null;
};

type Payload = {
  champion: string | null;
  series: Row[];
  split: {
    context_days: number; holdout_days: number; future_days: number;
    surge_days: number; future_start: string | null; future_end: string | null;
    updated_at: string | null;
  } | null;
  models: ModelRow[];
};

/* Class colours match the simulation canvas and the Fleet Mix vs Pollution Load
 * card, so a reader moving between tabs does not have to relearn which colour
 * is a truck. Red is avoided throughout — it marks a hazard elsewhere. */
const CLASS_META = [
  /* Heaviest FIRST, because the series drawn against the baseline is the only
   * one whose shape can be read accurately — everything stacked above it
   * inherits the wobble of everything below. The heavy share is this card's
   * headline ("19.54% → 21.90%"), and it was floating on top of an 80% block
   * of Class 1, which is the one place its movement is invisible.
   *
   * Colour is the emissions tab's ORDINAL ramp, not three categorical hues.
   * Vehicle classes are an ordered scale (light → medium → heavy), and a ramp
   * is what an ordered scale takes; three unrelated hues implied three
   * unrelated things. Validated light and dark: monotone lightness, ΔL ≥ 0.06
   * between steps, single hue, light end clear of the surface.
   *
   * `tone` indexes seriesRamp(): 2 = darkest = heaviest. */
  { key: "c3", label: "Class 3 · heavy", tone: 2 },
  { key: "c2", label: "Class 2 · medium", tone: 1 },
  { key: "c1", label: "Class 1 · light", tone: 0 },
] as const;

const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(2)}%`;

export default function FleetMixForecastChart() {
  /* The card was written with light-mode greys baked in (var(--text-primary), var(--text-muted),
     var(--border-default)), so in dark mode its axes and tooltip were invisible against the
     surface. Everything chrome-coloured now comes from the theme. */
  const T = useChartTheme();
  const RAMP = seriesRamp("emissions", T);
  const colorOf = (tone: number) => RAMP[tone];
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${BACKEND}/api/emissions/fleet-mix?days=180`);
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || !j.success) throw new Error(j.message ?? `HTTP ${r.status}`);
        setData(j.data as Payload);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the fleet-mix forecast");
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  const model = useMemo(() => {
    if (!data || data.series.length === 0) return null;
    const rows = data.series;

    const dates = rows.map((r) => r.d);
    const firstFuture = rows.findIndex((r) => r.is_future);

    /* Observed and projected are built as separate series over the same axis,
     * each padded with nulls outside its own span, rather than one series that
     * switches meaning partway along. ECharts then cannot join them into a
     * single surface, which is the visual claim being avoided. */
    const observed = CLASS_META.map((c) =>
      rows.map((r) => {
        const v = r[`actual_${c.key}` as "actual_c1"];
        return v == null ? null : v * 100;
      }),
    );
    const projected = CLASS_META.map((c) =>
      rows.map((r) => {
        if (!r.is_future) return null;
        const v = r[`pred_${c.key}` as "pred_c1"];
        return v == null ? null : v * 100;
      }),
    );

    const champ = data.models.find((m) => m.accepted && m.rank === 1) ?? null;
    const surges = rows.filter((r) => r.heavy_surge && r.is_future);

    return { rows, dates, firstFuture, observed, projected, champ, surges };
  }, [data]);

  const head = (
    <h3>
      Forecasted Fleet Composition
      <InfoTooltip text="Share of corridor traffic by toll class, stacked to 100%. Solid is observed; the paler band past the dashed line is projected. Shares are a composition — a point gained by one class is lost by another — so they are modelled jointly rather than as three separate forecasts." />
    </h3>
  );

  if (error) {
    return (
      <article className="chart-card wide nc-em-fc">
        {head}
        <StateNote kind="error" role="alert">
          {error}
          <span className="nc-em-state-action">
            <button
              type="button"
              className="btn-primary"
              onClick={() => { setError(null); setAttempt((a) => a + 1); }}
            >Try again</button>
          </span>
        </StateNote>
      </article>
    );
  }

  if (!data) {
    return (
      <article className="chart-card wide nc-em-fc">
        {head}
        <p className="nc-em-loading">Loading…</p>
        <div className="nc-em-skeleton"><ChartSkeleton /></div>
      </article>
    );
  }

  /* The forecast has never been published. Distinct from an error, and worth
   * saying plainly: an empty chart with no explanation is the thing that sends
   * someone hunting for a bug that is not there. */
  if (!model) {
    return (
      <article className="chart-card wide nc-em-fc">
        {head}
        <StateNote kind="nodata">
          No fleet-mix forecast has been published yet. Run{" "}
          <code>smartflow_scripts/3_training_testing/fleet_mix/train_fleet_mix.py</code> to generate one.
        </StateNote>
      </article>
    );
  }

  const { rows, dates, firstFuture, observed, projected, champ, surges } = model;

  const option: EChartsOption = {
    grid: { left: 52, right: 18, top: 28, bottom: 58 },
    tooltip: {
      trigger: "axis",
      confine: true,
      // A crosshair, because reading a stacked area means reading a DATE first.
      axisPointer: { type: "line" as const, lineStyle: { color: T.text, width: 1, type: "dashed" as const } },
      extraCssText: "max-width: 320px;",
      formatter: (params: unknown) => {
        const ps = params as { dataIndex: number }[];
        if (!ps.length) return "";
        const i = ps[0].dataIndex;
        const r = rows[i];
        const src = r.is_future ? "projected" : "observed";
        const vals = CLASS_META.map((c, k) => {
          const v = r.is_future ? r[`pred_${c.key}` as "pred_c1"] : r[`actual_${c.key}` as "actual_c1"];
          return `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${colorOf(c.tone)};margin-right:6px;"></span>${c.label}<span style="float:right;font-weight:600;margin-left:16px;">${pct(v)}</span>`;
        }).join("<br/>");
        const heavy = r.is_future && r.heavy_pred != null
          ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid ${T.tooltipBorder};">Heavy (C2+C3) <b>${pct(r.heavy_pred)}</b>${r.heavy_surge ? ' <span style="color:var(--color-warning);font-weight:600;">· surge</span>' : ""}</div>`
          : "";
        return `<div style="padding:2px 4px;min-width:220px;">
                  <b style="color:${T.tooltipText};">${r.d}</b>
                  <span style="opacity:.65;font-size:0.85em;"> · ${src}</span>
                  <div style="margin-top:8px;font-size:0.9em;">${vals}</div>${heavy}
                </div>`;
      },
    },
    legend: {
      bottom: 0,
      // Filled swatches, not the default hollow ring: the legend's whole job is
      // to carry the fill colour, and an outline shows almost none of it.
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 18,
      textStyle: { fontSize: 11, color: T.text },
      // Listed lightest-first so the legend reads in the natural order of the
      // classes, even though they are STACKED heaviest-first.
      data: [...CLASS_META].reverse().map((c) => c.label),
    },
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: false,
      axisLabel: { fontSize: 11, color: T.text, hideOverlap: true },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      // 0–100 stays. Truncating a composition axis is the classic way to make a
      // share look like it moved more than it did, and this card already has a
      // headline number for the magnitude.
      max: 100,
      min: 0,
      axisLabel: { formatter: "{value}%", fontSize: 11, color: T.text },
      axisLine: { show: false },
      axisTick: { show: false },
      // Hairline, solid, one step off the surface.
      splitLine: { lineStyle: { color: T.split, width: 1 } },
    },
    series: [
      ...CLASS_META.map((c, k) => ({
        name: c.label,
        type: "line" as const,
        stack: "observed",
        areaStyle: { color: colorOf(c.tone), opacity: 1 },
        /* The legend swatch takes the series' item colour; without it the
           legend fell back to ECharts' default palette and its three swatches
           did not match the bands they name. */
        itemStyle: { color: colorOf(c.tone) },
        /* The 2px spacer, in the surface colour. A stacked fill is separated
           from its neighbour by a gap, never by a stroke drawn around it. */
        lineStyle: { width: 2, color: T.tooltipBg },
        showSymbol: false,
        data: observed[k],
        // The boundary between measured and projected, drawn once on the first
        // series so it is not stamped three times.
        ...(k === 0 && firstFuture >= 0
          ? {
              markLine: {
                silent: true,
                symbol: "none" as const,
                animation: false,
                /* Dashed is right HERE and wrong on a gridline: it marks the
                   boundary between what was measured and what is projected,
                   which is exactly what a dash conventionally means (and what
                   the card's tooltip promises). The plot is filled edge to
                   edge, so the line takes the surface colour (it reads against
                   every band in both themes) and the label sits on a chip.
                   Not labelled NOW: the data ends well before today (the
                   staleness line above says by how much). */
                label: {
                  formatter: "forecast →", fontSize: 11, fontWeight: 600, color: T.ink, fontFamily: T.fontFamily,
                  position: "insideEndTop" as const, backgroundColor: T.tooltipBg, padding: [3, 6], borderRadius: 4,
                },
                lineStyle: { color: T.tooltipBg, type: "dashed" as const, width: 2, opacity: 1 },
                data: [{ xAxis: firstFuture }],
              },
            }
          : {}),
      })),
      ...CLASS_META.map((c, k) => ({
        name: c.label,
        type: "line" as const,
        stack: "projected",
        // Paler, and the only thing separating projection from record besides
        // the divider — so it stays a clear step down, not a subtle one.
        areaStyle: { color: colorOf(c.tone), opacity: 0.42 },
        itemStyle: { color: colorOf(c.tone) },
        lineStyle: { width: 2, color: T.tooltipBg },
        showSymbol: false,
        // Suppressed from the legend: these carry the same three names as the
        // observed series, and a six-entry legend listing each class twice
        // implies six things are plotted.
        legendHoverLink: false,
        tooltip: { show: false },
        data: projected[k],
      })),
    ],
  };

  /* Heavy share: MEANS, not two cherry-picked days.
   *
   * This used to read the last observed day against the last projected day.
   * Both swing hard — observed heavy share ranges 5.45% to 29.43% across the
   * series — so the comparison was two points off a wiggly line. It was worse
   * than arbitrary: the last observed day is 2025-12-31, New Year's Eve, when
   * freight barely runs. That single day reads 10.94% against a 21.85% mean,
   * so the card announced heavy share "10.94% -> 22.57%", implying it doubles.
   *
   * Mean against mean, the model actually predicts 21.85% -> 21.90%: no
   * material change. A reader acting on the old figure would have been
   * resourcing for a surge the forecast never called. */
  /* How far behind today the underlying data actually ends. */
  const lastObservedRow = rows.filter((r) => !r.is_future && r.actual_c2 != null).slice(-1)[0];
  const lastObservedDate = lastObservedRow?.d?.slice(0, 10) ?? null;
  const staleDays = lastObservedDate
    ? Math.floor((Date.now() - new Date(lastObservedDate).getTime()) / 86_400_000)
    : null;

  const recentObserved = rows.filter((r) => !r.is_future && r.actual_c2 != null).slice(-HEAVY_WINDOW_DAYS);
  const futureRows = rows.filter((r) => r.is_future && r.heavy_pred != null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const heavyNowMean = mean(recentObserved.map((r) => (r.actual_c2 ?? 0) + (r.actual_c3 ?? 0)));
  const heavyEndMean = mean(futureRows.map((r) => r.heavy_pred as number));
  const heavyDeltaPp =
    heavyNowMean != null && heavyEndMean != null ? (heavyEndMean - heavyNowMean) * 100 : null;

  return (
    <article className="chart-card wide nc-em-fc">
      {/* Answer (the heavy share, mean against mean), then context (champion,
          projection length, validation, vintage and staleness), then the
          evidence, then the method. */}
      <header className="nc-em-fc-head">
        {head}
        {heavyNowMean != null && heavyEndMean != null && (
          <div className="nc-em-fc-answer">
            <p className="nc-em-answer">
              <b>{pct(heavyNowMean)} → {pct(heavyEndMean)}</b>
              {heavyDeltaPp != null && (
                <span
                  className={`nc-em-delta ${Math.abs(heavyDeltaPp) < 1 ? "is-flat" : heavyDeltaPp > 0 ? "is-up" : "is-down"}`}
                >
                  {Math.abs(heavyDeltaPp) < 1
                    ? "no material change"
                    : `${heavyDeltaPp > 0 ? "+" : ""}${heavyDeltaPp.toFixed(1)} pp`}
                </span>
              )}
            </p>
            <p className="nc-em-answer-label">Heavy share (C2+C3) · {HEAVY_WINDOW_DAYS}-day means</p>
          </div>
        )}
        <div className="nc-em-trust" role="group" aria-label="Model">
          {champ
            ? <span className="pill purple">Champion · {champ.model_name}</span>
            : <span className="pill">No model accepted</span>}
          {data.split?.future_days ? <span className="pill">{data.split.future_days}-day projection</span> : null}
          <span className="pill">Validated at {VALIDATED_HORIZON} days</span>
          {data.split?.updated_at ? <span className="pill">Trained {data.split.updated_at.slice(0, 10)}</span> : null}
        </div>
        {/* Data vintage, not run date.
            "updated <date>" meant "the script ran then", which on a card whose
            forecast window has already passed reads as "this is current". The
            observed series ends when the warehouse ends; if that is well
            behind today, the projection covers days that have already
            happened and the reader should be told plainly rather than left to
            infer it from the axis. */}
        {staleDays != null && staleDays > 45 && (
          <p className="nc-em-stale">
            <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
            <span>
              <b>Data ends {lastObservedDate} — {staleDays} days ago.</b> This projection covers a
              period that has already passed; refresh the warehouse to forecast forward.
            </span>
          </p>
        )}
      </header>

      <DashboardChart option={option} height={320} />

      {surges.length > 0 && (
        <div className="nc-em-banner">
          <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" />
          <span>
            <b>Heavy-vehicle surge predicted</b> on {surges.length} day{surges.length === 1 ? "" : "s"} —{" "}
            {surges.slice(0, 4).map((s) => s.d).join(", ")}{surges.length > 4 ? ` and ${surges.length - 4} more` : ""}.
            <details className="nc-details">
              <summary>How a surge is flagged</summary>
              <p>A day is flagged when the projected Class 2+3 share runs more than 1.5 standard deviations above its training mean.</p>
            </details>
          </span>
        </div>
      )}

      {/* The leaderboard travels with the chart for the same reason it does on
          the CO2 panel: a forecast without the evidence that it beat a trivial
          baseline is a line on a chart, not a result. Rejected models are shown
          WITH their reason rather than omitted. */}
      {data.models.length > 0 && (
        <div className="nc-em-table-wrap">
          {/* How the leaderboard was scored, as facts above it; the reasoning
              is under "How this is measured" below. */}
          <div className="nc-em-trust nc-em-trust-quiet" role="group" aria-label="How the models were ranked">
            <span className="pill">Ranked by Aitchison distance</span>
            {champ?.split_label ? <span className="pill">Protocol · {champ.split_label}</span> : null}
            <span className="pill" title="SKILL is the ratio against a persistence baseline; below 1 means the model beats assuming the mix does not change.">SKILL &lt; 1 beats persistence</span>
          </div>
          <table className="nc-em-table">
            <thead>
              <tr>
                <th>MODEL</th>
                <th className="num">MAE (pp)</th>
                <th className="num">MAPE</th>
                <th className="num">HEAVY WMAPE</th>
                <th className="num">HEAVY R²</th>
                <th className="num">SKILL</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m) => (
                <tr key={m.model_name}>
                  <td className="nc-em-model-cell">
                    {m.model_name}{" "}
                    {m.accepted
                      ? <span className="nc-em-status is-ok">accepted{m.rank === 1 ? " · champion" : ""}</span>
                      : <span className="nc-em-status is-muted" title={m.rejected_reason ?? m.diagnosis ?? undefined}>
                          {m.rejected_reason ? "rejected" : "baseline"}
                        </span>}
                  </td>
                  <td className="num">{m.mae?.toFixed(2) ?? "—"}</td>
                  <td className="num">{m.mape != null ? `${m.mape.toFixed(2)}%` : "—"}</td>
                  <td className="num">{m.wmape != null ? `${m.wmape.toFixed(2)}%` : "—"}</td>
                  <td className="num">{m.r2?.toFixed(3) ?? "—"}</td>
                  <td className={`num nc-em-strong ${(m.mase ?? 1) < 1 ? "is-ok" : "is-warn"}`}>
                    {m.mase?.toFixed(3) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <details className="nc-details">
            <summary>How this is measured</summary>
            <p>
              Ranked by Aitchison distance, the standard metric for compositional data — MAPE divides by the actual
              value, so on a fleet that is ~79% Class 1 and ~9% Class 3 it scores the same absolute miss ten times
              harder on the rarest class. <b>SKILL</b> is the ratio against a persistence baseline; below 1 means the
              model beats assuming the mix does not change. {champ?.split_label ? `Protocol: ${champ.split_label}.` : ""}
            </p>
          </details>
        </div>
      )}
    </article>
  );
}
