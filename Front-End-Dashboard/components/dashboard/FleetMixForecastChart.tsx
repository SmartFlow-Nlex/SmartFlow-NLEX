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
import FleetMixNarrative from "./FleetMixNarrative";
import { TriangleAlert } from "lucide-react";
import DashboardChart from "./DashboardChart";
import InfoTooltip from "./InfoTooltip";
import EvidenceModal from "./EvidenceModal";
import ChartSkeleton from "./ChartSkeleton";
import StateNote from "../stage/StateNote";
import { useChartTheme, seriesRamp } from "../../lib/chart-theme";
import { withAlpha } from "../../lib/chart-kit";

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

/** Index and value of the highest and lowest non-null points of `xs` within [i0, i1]; null when there are none. */
function extremesOf(xs: (number | null)[], i0 = 0, i1 = xs.length - 1) {
  let hi = -1;
  let lo = -1;
  for (let i = Math.max(0, i0); i <= Math.min(xs.length - 1, i1); i++) {
    const v = xs[i];
    if (v == null) continue;
    if (hi < 0 || v > (xs[hi] as number)) hi = i;
    if (lo < 0 || v < (xs[lo] as number)) lo = i;
  }
  return hi < 0 ? null : { hi, lo, hiV: xs[hi] as number, loV: xs[lo] as number };
}

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
  /* Zoomed by default (17 Oct 2026, testers EM-10: "small changes and high/low points do not show"). On
     0–100% the heavy classes are a strip along the floor about a fifth of the plot tall, so a 2-point move
     in the heavy share is a couple of pixels. Zoomed, the axis still starts at 0, so the Class 3 and
     Class 2 bands keep their true heights; only the top is cut, inside the Class 1 band, which is drawn
     faint and labelled as running off the top. The full view is one click away.
     A third view, Heavy share (19 Oct 2026, testers EM-10 again: "rescale so small changes and highs/lows
     are visible"), draws the Class 2 + 3 share alone as a line on an axis fitted to it. That is the only
     honest way to drop the zero: a stacked composition cannot start above 0% without drawing its bottom band
     shorter than it is, but one line of one share can. */
  const [scale, setScale] = useState<"heavy" | "zoom" | "full">("zoom");
  const zoom = scale === "zoom";
  /* The date slider's window, in percent of the axis. Held here because the option is rebuilt (notMerge)
     on every render, which would otherwise snap the slider back to the full range. */
  const [win, setWin] = useState<[number, number]>([0, 100]);

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

    /* The heavy share (Class 2 + 3) per day, observed and projected: the top edge of the Class 2 band,
       which is where the chart's movement is. Its extremes are marked, and its peak sets the zoomed axis. */
    const heavyObs = rows.map((r) => (r.is_future || r.actual_c2 == null || r.actual_c3 == null ? null : (r.actual_c2 + r.actual_c3) * 100));
    const heavyProj = rows.map((r) => {
      if (!r.is_future) return null;
      if (r.heavy_pred != null) return r.heavy_pred * 100;
      return r.pred_c2 == null || r.pred_c3 == null ? null : (r.pred_c2 + r.pred_c3) * 100;
    });
    // The zoomed axis is set from the whole series, so dragging the date slider does not rescale it.
    const peak = Math.max(extremesOf(heavyObs)?.hiV ?? 0, extremesOf(heavyProj)?.hiV ?? 0);
    // A few points of headroom, rounded up to a multiple of 5 so the top tick is a round number.
    const zoomMax = Math.min(100, Math.max(10, Math.ceil((peak + 3) / 5) * 5));

    return { rows, dates, firstFuture, observed, projected, champ, surges, heavyObs, heavyProj, zoomMax };
  }, [data]);

  const head = (
    <h3 className="nct-title">
      Forecasted Fleet Composition
      <InfoTooltip text="Share of corridor traffic by toll class, stacked to 100%. Solid is observed; the paler band past the dashed line is projected. Shares are a composition — a point gained by one class is lost by another — so they are modelled jointly rather than as three separate forecasts. Zoomed (the default) stops the axis just above the highest heavy-vehicle share so its movement shows; Heavy share draws the Class 2 + 3 share alone on an axis fitted to it; the slider under the chart narrows the dates. The markers flag the highest and lowest Class 2 + 3 share, observed and projected." />
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

  const { rows, dates, firstFuture, observed, projected, champ, surges, heavyObs, heavyProj, zoomMax } = model;
  const heavyView = scale === "heavy";
  /* The high and low are of the days in the slider's window, so narrowing it to a fortnight marks that
     fortnight's extremes rather than leaving two chips stranded outside the plot. */
  const lastIdx = Math.max(0, dates.length - 1);
  const winLo = Math.floor((win[0] / 100) * lastIdx);
  const winHi = Math.ceil((win[1] / 100) * lastIdx);
  const obsX = extremesOf(heavyObs, winLo, winHi);
  const projX = extremesOf(heavyProj, winLo, winHi);

  /* High and low of the heavy share, observed and projected, each a dot with its value and day on a chip
     (testers EM-10). Placed by value, on the top edge of the Class 2 band, which is the heavy share. */
  const axisMax = zoom ? zoomMax : 100;
  const shortDay = (iso: string) =>
    new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const extremeMarks = (x: typeof obsX, prefix: string, side?: "left") =>
    x
      ? {
          markPoint: {
            silent: true,
            symbol: "circle",
            symbolSize: 7,
            animation: false,
            itemStyle: { color: T.ink, borderColor: T.tooltipBg, borderWidth: 2 },
            data: ([[x.hi, x.hiV, "▲", true], [x.lo, x.loV, "▼", false]] as [number, number, string, boolean][]).map(([i, v, arrow, high]) => ({
              coord: [dates[i], v],
              value: v,
              label: {
                show: true,
                formatter: `${prefix} ${arrow} ${v.toFixed(1)}% · ${shortDay(dates[i])}`,
                // The projection sits at the right edge, so its chips open leftward; a low near the floor
                // opens sideways rather than onto the axis labels.
                // On the fitted Heavy share axis the low sits on the floor by construction, so it always opens sideways.
                position: side ?? (high ? "top" : heavyView || v / axisMax < 0.2 ? "right" : "bottom"),
                distance: 6,
                fontSize: 12,
                fontWeight: 600,
                color: T.ink,
                fontFamily: T.fontFamily,
                backgroundColor: T.tooltipBg,
                padding: [2, 6],
                borderRadius: 4,
              },
            })),
          } as never,
        }
      : {};

  /* The boundary between measured and projected, drawn once (on the first series) so it is not stamped
     three times. Shared by the stacked views and the Heavy share line. */
  const boundary =
    firstFuture >= 0
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
               every band in both themes) and the label sits on a chip; on
               the unfilled Heavy share line it takes the muted ink instead.
               Not labelled NOW: the data ends well before today (the
               staleness line above says by how much). */
            label: {
              formatter: "forecast →", fontSize: 12, fontWeight: 600, color: T.ink, fontFamily: T.fontFamily,
              position: "insideEndTop" as const, backgroundColor: T.tooltipBg, padding: [3, 6], borderRadius: 4,
            },
            lineStyle: { color: heavyView ? T.text : T.tooltipBg, type: "dashed" as const, width: heavyView ? 1 : 2, opacity: 1 },
            data: [{ xAxis: firstFuture }],
          },
        }
      : {};

  /** The slider reports its window as start/end percents, directly or in a batch. */
  const onZoom = (p: { start?: number; end?: number; batch?: { start?: number; end?: number }[] }) => {
    const b = p.batch?.[0] ?? p;
    if (b.start != null && b.end != null) setWin([b.start, b.end]);
  };

  const HEAVY_OBS = "Heavy share (C2+C3)";
  const HEAVY_PROJ = "Heavy share · projected";
  /* The heavy line in the ramp's darkest step, the same colour as Class 3 in the stacked views; the
     projection dashed, as a forecast line is on the CO2 panel above. */
  const heavySeries = [
    {
      name: HEAVY_OBS,
      type: "line" as const,
      data: heavyObs,
      showSymbol: false,
      connectNulls: false,
      itemStyle: { color: colorOf(2) },
      lineStyle: { width: 2, color: colorOf(2) },
      ...boundary,
      ...extremeMarks(obsX, "Heavy"),
    },
    {
      name: HEAVY_PROJ,
      type: "line" as const,
      data: heavyProj,
      showSymbol: false,
      itemStyle: { color: colorOf(2) },
      lineStyle: { width: 2, color: colorOf(2), type: "dashed" as const },
      tooltip: { show: false },
      ...extremeMarks(projX, "Projected", "left"),
    },
  ];

  const option: EChartsOption = {
    // Room at the foot for the legend and, under it, the date slider.
    grid: { left: 52, right: 18, top: 28, bottom: 80 },
    /* A date slider (testers EM-10: "zoom so small changes show"), styled like the CO2 panel's: drag either
       handle to narrow the window, and on Heavy share the fitted axis re-fits to the days left in view. */
    dataZoom: [
      {
        type: "slider",
        start: win[0],
        end: win[1],
        /* Applied on release, not while dragging: the window is held in state, and a re-render mid-drag
           rebuilds the chart (notMerge) under the cursor and drops the handle. */
        realtime: false,
        height: 16,
        bottom: 6,
        borderColor: T.split,
        fillerColor: withAlpha(T.isDark ? "#f4f1ea" : "#0b1220", 0.08),
        backgroundColor: "transparent",
        dataBackground: {
          lineStyle: { color: withAlpha(T.isDark ? "#f4f1ea" : "#0b1220", 0.3), width: 1 },
          areaStyle: { color: withAlpha(T.isDark ? "#f4f1ea" : "#0b1220", 0.06) },
        },
        selectedDataBackground: {
          lineStyle: { color: colorOf(2), width: 1 },
          areaStyle: { color: withAlpha(colorOf(2), 0.18) },
        },
        handleStyle: { color: T.tooltipBg, borderColor: T.text },
        moveHandleStyle: { color: withAlpha(T.isDark ? "#f4f1ea" : "#0b1220", 0.25) },
        textStyle: { color: T.text, fontSize: 12, fontFamily: T.fontFamily },
        labelFormatter: (_: number, v: string) => (v ? shortDay(v) : ""),
      },
    ],
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
        // The heavy share on observed days too, since that is what the high/low markers mark.
        const heavyV = r.is_future
          ? r.heavy_pred
          : r.actual_c2 != null && r.actual_c3 != null ? r.actual_c2 + r.actual_c3 : null;
        const heavy = heavyV != null
          ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid ${T.tooltipBorder};">Heavy (C2+C3) <b>${pct(heavyV)}</b>${r.is_future && r.heavy_surge ? ' <span style="color:var(--color-warning);font-weight:600;">· surge</span>' : ""}</div>`
          : "";
        return `<div style="padding:2px 4px;min-width:220px;">
                  <b style="color:${T.tooltipText};">${r.d}</b>
                  <span style="opacity:.65;font-size:0.85em;"> · ${src}</span>
                  <div style="margin-top:8px;font-size:0.9em;">${vals}</div>${heavy}
                </div>`;
      },
    },
    legend: {
      bottom: 30,
      // Filled swatches, not the default hollow ring: the legend's whole job is
      // to carry the fill colour, and an outline shows almost none of it.
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: heavyView ? 4 : 12,
      itemGap: 18,
      textStyle: { fontSize: 12, color: T.text },
      // Listed lightest-first so the legend reads in the natural order of the
      // classes, even though they are STACKED heaviest-first.
      data: heavyView ? [HEAVY_OBS, HEAVY_PROJ] : [...CLASS_META].reverse().map((c) => c.label),
    },
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: false,
      axisLabel: { fontSize: 12, color: T.text, hideOverlap: true },
      axisTick: { show: false },
    },
    yAxis: heavyView
      ? {
          type: "value",
          /* Fitted to the heavy share (with the slider, to the days in view), a point of padding each side,
             whole percents at the ends. Labelled as starting above zero by the note over the chart. */
          scale: true,
          min: (v: { min: number }) => Math.max(0, Math.floor(v.min - 1)),
          max: (v: { max: number }) => Math.min(100, Math.ceil(v.max + 1)),
          axisLabel: { formatter: "{value}%", fontSize: 12, color: T.text },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: T.split, width: 1 } },
        }
      : {
          type: "value",
          // Always from 0, so no band is drawn taller than it is. Zoomed cuts only the
          // top, inside the Class 1 band (see the zoom note above); 0–100 shows it all.
          max: axisMax,
          min: 0,
          axisLabel: { formatter: "{value}%", fontSize: 12, color: T.text },
          axisLine: { show: false },
          axisTick: { show: false },
          // Hairline, solid, one step off the surface.
          splitLine: { lineStyle: { color: T.split, width: 1 } },
        },
    series: heavyView ? heavySeries : [
      ...CLASS_META.map((c, k) => ({
        name: c.label,
        type: "line" as const,
        stack: "observed",
        // Zoomed, Class 1 runs off the top of the plot, so it is drawn faint: its visible height is not its share.
        areaStyle: { color: colorOf(c.tone), opacity: zoom && c.key === "c1" ? 0.35 : 1 },
        /* The legend swatch takes the series' item colour; without it the
           legend fell back to ECharts' default palette and its three swatches
           did not match the bands they name. */
        itemStyle: { color: colorOf(c.tone) },
        /* The 2px spacer, in the surface colour. A stacked fill is separated
           from its neighbour by a gap, never by a stroke drawn around it. */
        lineStyle: { width: 2, color: T.tooltipBg },
        showSymbol: false,
        data: observed[k],
        // The measured/projected boundary, on the first series only (see `boundary`).
        ...(k === 0 ? boundary : {}),
        // The observed heavy-share extremes, on the Class 2 band whose top edge is that share.
        ...(c.key === "c2" ? extremeMarks(obsX, "Heavy") : {}),
      })),
      ...CLASS_META.map((c, k) => ({
        name: c.label,
        type: "line" as const,
        stack: "projected",
        // Paler, and the only thing separating projection from record besides
        // the divider — so it stays a clear step down, not a subtle one.
        areaStyle: { color: colorOf(c.tone), opacity: zoom && c.key === "c1" ? 0.2 : 0.42 },
        itemStyle: { color: colorOf(c.tone) },
        lineStyle: { width: 2, color: T.tooltipBg },
        showSymbol: false,
        // Suppressed from the legend: these carry the same three names as the
        // observed series, and a six-entry legend listing each class twice
        // implies six things are plotted.
        legendHoverLink: false,
        tooltip: { show: false },
        data: projected[k],
        ...(c.key === "c2" ? extremeMarks(projX, "Projected", "left") : {}),
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
    <article className="chart-card wide nc-em-fc nct-card">
      {/* Laid out like the Traffic tab's forecast cards (16 Oct 2026): title, then the answer as an
          eyebrow, a big figure and a context line, then the chart, then the validation evidence as one
          strip that opens the leaderboard, then the narrative. */}
      <header className="nct-card-head">{head}</header>
      {heavyNowMean != null && heavyEndMean != null && (
        <div className="fc-answer">
          <span className="fc-answer-label">Heavy share (C2+C3) · {HEAVY_WINDOW_DAYS}-day means</span>
          <span className="fc-answer-value">
            {pct(heavyNowMean)} → {pct(heavyEndMean)}
            {heavyDeltaPp != null && (
              <span className="fc-answer-unit">
                {Math.abs(heavyDeltaPp) < 1 ? "no material change" : `${heavyDeltaPp > 0 ? "+" : ""}${heavyDeltaPp.toFixed(1)} pp`}
              </span>
            )}
          </span>
          <span className="fc-answer-context">
            {champ ? <>model <b>{champ.model_name}</b></> : "no model accepted"}
            {data.split?.future_days ? <> · {data.split.future_days}-day projection</> : null}
            {lastObservedDate ? <> · data to <b>{lastObservedDate}</b></> : null}
          </span>
        </div>
      )}

      <div className="fc-row fc-controls" role="group" aria-label="Fleet composition scale">
        <div className="fc-group">
          <span className="fc-label">Scale</span>
          <div className="nc-em-seg">
            <button
              type="button"
              className={heavyView ? "is-on" : ""}
              aria-pressed={heavyView}
              onClick={() => setScale("heavy")}
              title="The Class 2 + 3 share alone, on an axis fitted to it, so small day-to-day changes and the highs and lows show"
            >
              Heavy share
            </button>
            <button
              type="button"
              className={zoom ? "is-on" : ""}
              aria-pressed={zoom}
              onClick={() => setScale("zoom")}
              title={`The axis stops at ${zoomMax}%, just above the highest heavy-vehicle share, so day-to-day movement in Class 2 and 3 shows`}
            >
              Zoomed 0–{zoomMax}%
            </button>
            <button
              type="button"
              className={scale === "full" ? "is-on" : ""}
              aria-pressed={scale === "full"}
              onClick={() => setScale("full")}
              title="The whole mix, stacked to 100%"
            >
              Full 0–100%
            </button>
          </div>
        </div>
        {zoom && (
          <span className="fc-note nc-em-hz-note">
            Class 1 (light) fills the rest of the 100% above the top of this view, so its faint band is cut short.
          </span>
        )}
        {heavyView && (
          <span className="fc-note nc-em-hz-note">
            The axis starts above 0% to show small changes: read the line&apos;s movement, not its height. Drag the slider
            under the chart to zoom into dates.
          </span>
        )}
      </div>

      <DashboardChart option={option} height={344} onEvents={{ datazoom: onZoom as (p: never) => void }} />

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
        <EvidenceModal
          className="nc-em-ev"
          scopeClass="viz-emissions"
          subtitle="Fleet composition forecast: every model's scores, ranked by Aitchison distance against a persistence baseline."
          strip={<>
            <span className="nct-trust-pill"><span className="nct-trust-k">Champion</span>{champ ? champ.model_name : "none accepted"}</span>
            <span className="nct-trust-pill"><span className="nct-trust-k">Validated at</span>{VALIDATED_HORIZON} days</span>
            {champ?.split_label ? <span className="nct-trust-pill"><span className="nct-trust-k">Protocol</span>{champ.split_label}</span> : null}
            {data.split?.updated_at ? <span className="nct-trust-pill"><span className="nct-trust-k">Trained</span>{data.split.updated_at.slice(0, 10)}</span> : null}
          </>}
        >
          <div className="nc-em-table-wrap">
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
        </EvidenceModal>
      )}

      {data.models.length > 0 && (
        <FleetMixNarrative
          models={data.models.map((m) => ({
            model: m.model_name,
            rank: m.rank,
            accepted: m.accepted,
            maePp: m.mae,
            mape: m.mape,
            heavyWmape: m.wmape,
            heavyR2: m.r2,
            skill: m.mase,
            rejectedReason: m.rejected_reason,
            diagnosis: m.diagnosis,
          }))}
          champion={champ?.model_name ?? null}
          heavyNowPct={heavyNowMean != null ? heavyNowMean * 100 : null}
          heavyNextPct={heavyEndMean != null ? heavyEndMean * 100 : null}
          windowDays={HEAVY_WINDOW_DAYS}
          projectionDays={data.split?.future_days ?? null}
          projectionStart={data.split?.future_start?.slice(0, 10) ?? null}
          projectionEnd={data.split?.future_end?.slice(0, 10) ?? null}
          validatedDays={VALIDATED_HORIZON}
          surgeDates={surges.map((x) => x.d.slice(0, 10))}
          dataEnds={lastObservedDate}
          staleDays={staleDays}
        />
      )}
    </article>
  );
}
