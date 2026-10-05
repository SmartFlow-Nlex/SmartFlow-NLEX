"use client";

import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import DashboardChart from "./DashboardChart";
import { useChartTheme } from "../../lib/chart-theme";
import InfoTooltip from "./InfoTooltip";
import EventSurgeNarrative from "./EventSurgeNarrative";
import { loadForecast } from "./prescriptiveTraffic.shared";
import { REPLAY_ACTUAL, REPLAY_FORECAST, useMeasuredWidth } from "./replayViz";
import { useTrafficPalette } from "./trafficPalette";
import StateNote from "../stage/StateNote";
import EvidenceModal from "./EvidenceModal";

type RawRow = {
  exit: string;
  event: string | null;
  baseline: number | string;
  surge: number | string | null;
  uplift: number | string | null;
  upliftLo?: number | string | null;
  upliftHi?: number | string | null;
  nEvents?: number | null;
  material?: boolean | null;
  method?: string | null;
  anchorExit?: string | null;
  firstEvent?: string | null;
  lastEvent?: string | null;
};

type Row = {
  exit: string;
  baseline: number;
  surge: number;
  added: number;
  pct: number;
  shareOfSurge: number;
};

// One upcoming Arena event DAY with its dated per-exit forecast, as served on
// /api/traffic/forecast.upcomingEvents (see getUpcomingEventSurge). Baseline is
// that exit's median volume on the same weekday in the same month, times the
// measured uplift -- the same construction the observed rows use, applied to a
// real date.
type UpcomingExit = { exit: string; baseline: number; surge: number; surgeLo: number; surgeHi: number; uplift: number; nEvents: number };
type UpcomingEvent = { date: string; title: string; isDerived: boolean; capacity: number | null; venue: string | null; exits: UpcomingExit[] };

// The uplift was measured on Philippine Arena days. Events elsewhere in the
// same complex reach the same exit but not at the same scale, so the card
// names the venue whenever it is not the Arena.
const isArena = (venue: string | null) => !venue || /arena/i.test(venue);

/* The surge series is the Traffic page's own accent, not red.
   An arena event is planned, expected demand — a concert night, not a hazard —
   and rose-600 read as an alarm to anyone scanning the tab. It also competed
   with the Predictive Congestion State Map beside it, where red genuinely means
   Severe. Keeping red for severity alone means a red mark on this tab now has
   exactly one meaning. This component renders only on the Traffic page, so it
   takes that page's accent hex directly. */
// Resolved per theme from the page accent (see `SURGE` in the component).

const fmtVeh = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n));

// Mainline barriers, ramps and spur roads are toll points, not exits people
// leave the expressway from — worth separating so "Bocaue Barrier" is not
// mistaken for the "Bocaue Interchange" that the event actually hits.
const NON_EXIT = /barrier|ramp|spur/i;


/** How the event-surge model was scored, plus the held-out replay: one point
 *  per event day the model never saw. Written by build_event_surge.py. */
type EventSurgeEval = {
  model: string;
  events_total: number; events_train: number; events_test: number;
  test_from: string; exit_days_scored: number;
  wmape: number; baseline_wmape: number; median_day_error_pct: number;
  series: { t: string; p: number; a: number; n: number }[];
  examples: { kind: string; t: string; predicted: number; actual: number }[];
  anchor_exit: string; anchor_uplift: number | null;
  material_exits: number; total_exits: number;
  holiday_factor?: number; holiday_event_days?: number;
  method: string;
};

/** Held-out event days as a dumbbell plot: for each event the model never saw,
 *  what it predicted the corridor would carry and what actually arrived. Event
 *  dates are irregular, so the slots are evenly spaced in date ORDER rather
 *  than on a calendar axis — connecting them as a time series would draw a
 *  trend through gaps where nothing was measured. */
function EventReplayChart({ series }: { series: { t: string; p: number; a: number; n: number }[] }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const padL = 42, padR = 10, padT = 10, padB = 20;
  const H = 156;
  const w = Math.max(width, 260);
  const plotW = Math.max(w - padL - padR, 10);
  const plotH = H - padT - padB;
  const vals = series.flatMap((d) => [d.p, d.a]);
  const lo = Math.min(...vals) * 0.96;
  const hi = Math.max(...vals) * 1.02;
  const x = (i: number) => padL + ((i + 0.5) / series.length) * plotW;
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const k = (v: number) => `${Math.round(v / 1000)}k`;

  const hv = hover != null ? series[hover] : null;
  const hvLeft = hover != null ? Math.min(Math.max(x(hover), 78), w - 78) : 0;
  const hvTop = hv && Math.max(hv.a, hv.p) > lo + (hi - lo) * 0.55 ? H - 52 : 4;
  const fmtDay = (t: string) =>
    new Date(t + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", overflowX: "auto" }}>
      <div className="nct-key" style={{ justifyContent: "flex-end", marginBottom: 2 }}>
        {[{ c: REPLAY_ACTUAL, fill: true, label: "Actually arrived" },
          { c: REPLAY_FORECAST, fill: false, label: "Model predicted" }].map((l) => (
          <span key={l.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <svg width={11} height={11} aria-hidden="true">
              <circle cx={5.5} cy={5.5} r={4} fill={l.fill ? l.c : "var(--bg-surface-solid)"} stroke={l.c} strokeWidth={2} />
            </svg>
            {l.label}
          </span>
        ))}
      </div>
      {width > 0 && (
        <svg width={w} height={H} role="img"
             aria-label={`Predicted against actual corridor volume for ${series.length} held-out event days`}
             onMouseLeave={() => setHover(null)}
             onMouseMove={(ev) => {
               const box = ev.currentTarget.getBoundingClientRect();
               const i = Math.floor(((ev.clientX - box.left - padL) / plotW) * series.length);
               setHover(Math.min(Math.max(i, 0), series.length - 1));
             }}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={w - padR} y1={y(lo + (hi - lo) * f)} y2={y(lo + (hi - lo) * f)} strokeWidth={1} style={{ stroke: "var(--chart-split)" }} />
              <text x={padL - 6} y={y(lo + (hi - lo) * f) + 3} textAnchor="end" fontSize={11} style={{ fill: "var(--text-muted)" }}>{k(lo + (hi - lo) * f)}</text>
            </g>
          ))}
          {series.map((d, i) => (
            <g key={d.t} opacity={hover == null || hover === i ? 1 : 0.45}>
              {/* The gap IS the error, so it gets a mark of its own. */}
              <line x1={x(i)} x2={x(i)} y1={y(d.p)} y2={y(d.a)} strokeWidth={2} strokeLinecap="round" style={{ stroke: "var(--text-muted)" }} />
              <circle cx={x(i)} cy={y(d.p)} r={3.6} stroke={REPLAY_FORECAST} strokeWidth={2} style={{ fill: "var(--bg-surface-solid)" }} />
              <circle cx={x(i)} cy={y(d.a)} r={3.6} fill={REPLAY_ACTUAL} strokeWidth={1.5} style={{ stroke: "var(--bg-surface-solid)" }} />
            </g>
          ))}
          <text x={padL} y={H - 5} fontSize={11} style={{ fill: "var(--text-muted)" }}>{fmtDay(series[0].t)}</text>
          <text x={padL + plotW / 2} y={H - 5} textAnchor="middle" fontSize={11} style={{ fill: "var(--text-muted)" }}>vertical axis zoomed to these days</text>
          <text x={w - padR} y={H - 5} textAnchor="end" fontSize={11} style={{ fill: "var(--text-muted)" }}>{fmtDay(series[series.length - 1].t)}</text>
        </svg>
      )}
      {hv && (
        <div style={{
          position: "absolute", left: hvLeft, top: hvTop, transform: "translateX(-50%)", pointerEvents: "none",
          background: "var(--bg-raised)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: "8px 11px",
          boxShadow: "var(--shadow-lg)", fontSize: "var(--fs-body)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", zIndex: 2,
        }}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>{fmtDay(hv.t)}</div>
          <div style={{ color: REPLAY_FORECAST, fontWeight: 600 }}>Predicted {hv.p.toLocaleString()}</div>
          <div style={{ color: REPLAY_ACTUAL, fontWeight: 600 }}>Actually {hv.a.toLocaleString()}</div>
          <div style={{ color: "var(--text-secondary)" }}>off by {Math.abs((hv.p - hv.a) / hv.a * 100).toFixed(1)}%</div>
        </div>
      )}
    </div>
  );
}

export default function PredictiveEventChart() {
  // Theme-aware literals for the ECharts option (canvas cannot read CSS vars).
  const chartTheme = useChartTheme();
  const P = useTrafficPalette();
  // Night Corridor literals for the canvas (theme ink steps and hairlines).
  const K = { surface: P.surface, ink: P.ink, ink2: P.ink2, muted: P.muted, faint: P.neutral, faint2: P.neutral, border: P.hairline, hover: chartTheme.split };
  // The surge series is the Traffic accent for the active theme.
  const SURGE = P.accent;
  const [raw, setRaw] = useState<RawRow[] | null>(null);
  // Out-of-sample leaderboard from build_event_surge.py. The uplift table
  // itself is descriptive; this is the separate check that it predicts unseen
  // events. (It used to come from eval_event_surge.py, a second script that
  // could drift from the one that built the table; both are now one file.)
  const [val, setVal] = useState<{ model: string; wmape: number | null; accepted: boolean; diagnosis: string | null }[]>([]);
  const [showAllOthers, setShowAllOthers] = useState(false);
  const [evalInfo, setEvalInfo] = useState<EventSurgeEval | null>(null);
  // The schedule of upcoming Arena days, and which one is open. null means the
  // card shows what PAST events did (the observed uplift); an index means it
  // shows the forecast for that specific day.
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [selUpcoming, setSelUpcoming] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Shared, cached fetch -- see prescriptiveTraffic.shared. This card used to
    // request the same ~600 KB payload the volume and congestion cards had
    // already asked for.
    loadForecast()
      .then((fc) => {
        if (cancelled || fc.events.length === 0) return;
        setRaw(fc.events as unknown as RawRow[]);
        if (Array.isArray(fc.extras.eventSurgeMetrics)) setVal(fc.extras.eventSurgeMetrics as typeof val);
        setEvalInfo((fc.extras.eventSurgeEval as EventSurgeEval | null | undefined) ?? null);
        setUpcoming(fc.upcomingEvents as unknown as UpcomingEvent[]);
      })
      .catch((err) => console.error("Failed to fetch ML event surge forecast", err));
    return () => {
      cancelled = true;
    };
  }, []);

  const chosen = selUpcoming != null ? upcoming[selUpcoming] ?? null : null;

  /* When an upcoming day is chosen, its dated rows take the place of the
     observed ones and everything below -- bars, share, KPIs, banner -- follows
     with no second code path. Exits the forecast does not list (uplift not
     material) are kept from the observed set with surge nulled, so the "no
     forecast change" list beneath stays populated and nothing disappears. */
  const effectiveRaw = useMemo<RawRow[] | null>(() => {
    if (!raw) return null;
    if (!chosen) return raw;
    const dated = new Map(chosen.exits.map((x) => [x.exit, x]));
    return raw.map((r) => {
      const x = dated.get(r.exit);
      return x
        ? { ...r, event: chosen.title, baseline: x.baseline, surge: x.surge, uplift: x.uplift, material: true, nEvents: x.nEvents }
        : { ...r, baseline: r.baseline, surge: null, material: false };
    });
  }, [raw, chosen]);

  const model = useMemo(() => {
    const raw = effectiveRaw;
    if (!raw || raw.length === 0) return null;

    const affected: Row[] = raw
      // `material` is set by build_event_surge.py: the lower quartile of the
      // observed uplift must still be above normal. An exit whose IQR straddles
      // 1.0 rose on some event days and fell on others, which is noise, not an
      // effect — listing it as "affected" would overstate the corridor's spread.
      .filter((d) => d.surge != null && d.material !== false)
      .map((d) => {
        const baseline = Number(d.baseline);
        const surge = Number(d.surge);
        const added = surge - baseline;
        return { exit: d.exit, baseline, surge, added, pct: baseline > 0 ? (added / baseline) * 100 : 0, shareOfSurge: 0 };
      })
      .sort((a, b) => b.added - a.added);
    if (affected.length === 0) return null;

    const totalAdded = affected.reduce((s, r) => s + r.added, 0);
    affected.forEach((r) => (r.shareOfSurge = totalAdded > 0 ? (r.added / totalAdded) * 100 : 0));

    const rest = raw
      .filter((d) => d.surge == null || d.material === false)
      .map((d) => ({ exit: d.exit, baseline: Number(d.baseline) }))
      .sort((a, b) => b.baseline - a.baseline);

    return {
      affected,
      // ECharts lays a category axis out bottom-up.
      //
      // Only the exits carrying a MEANINGFUL share are plotted. Thirteen bars,
      // seven of them under 4% of the surge, buried the two that carry half of
      // it — the long tail cost as much vertical space as the finding. The rest
      // are still listed below the chart, so nothing disappears.
      rows: [...affected.filter((r) => r.shareOfSurge >= 4)].reverse(),
      minorAffected: affected.filter((r) => r.shareOfSurge < 4),
      otherExits: rest.filter((r) => !NON_EXIT.test(r.exit)),
      otherPoints: rest.filter((r) => NON_EXIT.test(r.exit)),
      totalAdded,
      affectedBaseline: affected.reduce((s, r) => s + r.baseline, 0),
      eventName: raw.find((d) => d.event)?.event ?? "the upcoming event",
      totalPlazas: raw.length,
    };
  }, [effectiveRaw]);

  if (!model) {
    return (
      <article className="chart-card wide nct-card">
        <StateNote kind="loading">Loading ML event surge forecast from AWS…</StateNote>
      </article>
    );
  }

  const { affected, rows, minorAffected, otherExits, otherPoints, totalAdded, affectedBaseline, eventName, totalPlazas } = model;
  const top = affected[0];
  const multiple = top.surge / top.baseline;

  // Sorted bar of the ADDED vehicles only, every bar starting at zero.
  // The previous stacked form began each red segment at that exit's baseline —
  // three different x positions — so comparing the surges meant judging
  // floating lengths, the one thing bar charts are bad at. Length from a common
  // zero is the most accurate comparison available, and it stops the smallest
  // exit collapsing into a sliver.
  const impactOption: EChartsOption = {
    grid: { left: 152, right: 150, top: 10, bottom: 40 },
    tooltip: {
      trigger: "item",
      confine: true,
      extraCssText: P.tooltipCss,
      formatter: (params: unknown) => {
        const r = rows[(params as { dataIndex: number }).dataIndex];
        return `
          <div style="padding:2px 4px; min-width:225px;">
            <b style="font-size:1.05em; color:var(--text-primary);">${r.exit}</b>
            <div style="margin-top:8px; display:grid; grid-template-columns:auto 1fr; gap:5px 12px; font-size:0.9em;">
              <span style="color:var(--text-secondary);">Added by event</span><span style="font-weight:600; color:${SURGE};">+${fmtVeh(r.added)} (+${r.pct.toFixed(0)}%)</span>
              <span style="color:var(--text-secondary);">Normal day</span><span style="font-weight:600;">${fmtVeh(r.baseline)}</span>
              <span style="color:var(--text-secondary);">With event</span><span style="font-weight:600; color:${SURGE};">${fmtVeh(r.surge)}</span>
              <span style="color:var(--text-secondary);">Share of surge</span><span style="font-weight:500;">${r.shareOfSurge.toFixed(0)}%</span>
            </div>
          </div>`;
      },
    },
    xAxis: {
      type: "value",
      name: "Extra vehicles per day",
      nameLocation: "middle",
      nameGap: 26,
      nameTextStyle: { color: K.muted, fontSize: 11 },
      axisLabel: { color: K.muted, formatter: (v: number) => (v === 0 ? "0" : `+${fmtK(v)}`), fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      type: "category",
      data: rows.map((r) => r.exit),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: K.ink, fontWeight: 600, fontSize: 11 },
    },
    series: [
      {
        name: "Added by event",
        type: "bar",
        barMaxWidth: 26,
        data: rows.map((r) => r.added),
        itemStyle: { color: SURGE, borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: "right",
          distance: 10,
          formatter: (params: unknown) => {
            const r = rows[(params as { dataIndex: number }).dataIndex];
            // The "50,890 -> 63,119 · 1.2x normal" second line repeated on
            // every bar and is already in the tooltip. The bar carries the
            // two numbers a reader actually scans for.
            return `{add|+${fmtVeh(r.added)}}  {pct|+${r.pct.toFixed(0)}%}`;
          },
          rich: {
            add: { color: K.ink, fontWeight: 600, fontSize: 13, lineHeight: 17 },
            pct: { color: K.ink2, fontWeight: 400, fontSize: 11, lineHeight: 17 },
            ctx: { color: K.muted, fontSize: 10, lineHeight: 14 },
          },
        },
      },
    ],
  };

  // Provenance travels on the rows; take it from the first that has it.
  const meta = (raw ?? []).find((r) => r.nEvents != null) ?? null;
  const chosenDate = chosen ? new Date(`${chosen.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";
  const chosenDateLong = chosen ? new Date(`${chosen.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
  const chosenLead = chosen ? Math.round((new Date(`${chosen.date}T00:00:00`).getTime() - Date.now()) / 86400000) : null;
  const champ = val.find((v) => !/baseline/i.test(v.model)) ?? null;
  const noAdj = val.find((v) => /no event/i.test(v.model)) ?? null;
  const others = val.filter((v) => !/baseline/i.test(v.model) && v.model !== champ?.model);
  const impactHeight = Math.max(rows.length * 56 + 62, 220);
  const VISIBLE_OTHERS = 8;
  const shownOthers = showAllOthers ? otherExits : otherExits.slice(0, VISIBLE_OTHERS);
  // How concentrated the surge is: the share the two biggest exits carry
  // between them. Replaces a stacked strip plus a thirteen-item key that said
  // the same thing at ten times the height.
  const top2Share = affected.slice(0, 2).reduce((a, r) => a + r.shareOfSurge, 0);
  const shortTitle = (t: string) => t.split(" - ")[0];

  /* Layout, from top: what am I looking at (title, mode, controls) -> the one
     sentence that is the finding -> four numbers -> the chart -> everything
     else behind a single disclosure. The previous card stacked ten regions --
     a banner, four tiles and a share legend all restating the top exit -- and
     read as a pile. Each fact now appears once, at the level it earns. */
  const stat = (value: string, label: string, tone?: string) => (
    <div className="nct-stat">
      <span className="nct-stat-value" style={tone ? { color: tone } : undefined}>{value}</span>
      <span className="nct-stat-label">{label}</span>
    </div>
  );

  return (
    <article className="chart-card wide nct-card">
      {/* Row 1: title on the left, provenance on the right. */}
      <div className="nct-card-head-split">
        <h3 className="nct-title">
          Event Surge Impact by Exit
          <InfoTooltip text="Extra vehicles each exit takes on a Philippine Arena event day versus a normal day. Choose a past pattern or an upcoming event above." />
        </h3>
        <div className="nct-pill-row">
          {/* Forecast and model labels wear model violet, so a forecast never
              reads as a road state; observed history is a plain pill. */}
          {chosen ? (
            <span className="pill purple">
              Forecast · {chosenDate}
            </span>
          ) : (
            <span className="pill">
              Observed{meta?.nEvents ? ` · ${meta.nEvents} past event days` : ""}
            </span>
          )}
          {champ?.wmape != null && (
            <span
              title={champ.diagnosis ?? undefined}
              className={`pill ${champ.accepted ? "green" : "red"}`}
            >
              {champ.accepted ? "✓ tested" : "failed test"} · {champ.wmape.toFixed(1)}% error held-out
            </span>
          )}
        </div>
      </div>

      {/* Row 2: what is shown. A select, not seven pills -- the pills wrapped to
          three lines and pushed the finding below the fold. */}
      <div className="nct-toolbar">
        <label className="nct-group">
          <span className="nct-group-label">Showing</span>
          <select
            value={selUpcoming == null ? "" : String(selUpcoming)}
            onChange={(e) => setSelUpcoming(e.target.value === "" ? null : Number(e.target.value))}
            className="nct-select"
            style={{ maxWidth: 360 }}
          >
            <option value="">Past events — what {eventName === "the upcoming event" ? "event" : eventName} days did</option>
            {upcoming.map((u, i) => {
              // Group nights by the act, not the full title: the source spells
              // BTS's three nights two different ways ("BTS - Arirang World
              // Tour", "BTS - BTS WORLD TOUR 'ARIRANG'"), which by full title
              // read as one lone night plus a two-night run.
              const act = shortTitle(u.title);
              const nth = upcoming.slice(0, i + 1).filter((x) => shortTitle(x.title) === act).length;
              const multi = upcoming.filter((x) => shortTitle(x.title) === act).length > 1;
              const d = new Date(`${u.date}T00:00:00`);
              return (
                <option key={u.date} value={String(i)}>
                  {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })} — {shortTitle(u.title)}{multi ? ` (day ${nth})` : ""}{isArena(u.venue) ? "" : ` · ${u.venue}`}
                </option>
              );
            })}
          </select>
        </label>
        <InfoTooltip
          text={`Baseline is the same weekday and month on non-event days, so events cannot inflate their own baseline.${
            meta?.firstEvent && meta?.lastEvent ? ` Events span ${meta.firstEvent} to ${meta.lastEvent}.` : ""
          }`}
        />
      </div>

      {/* Row 3: the finding, in one sentence, event first. */}
      <div className="nct-finding nct-finding-text" data-tone="accent">
        {chosen ? (
          /* An upcoming day, as the answer then two labelled rows. */
          <>
            Expect <b>+{fmtVeh(totalAdded)}</b> extra vehicles during <b>{shortTitle(chosen.title)}</b>
            {chosen.isDerived && <span title="A recurring event the ETL inferred from prior years, not an announced date." className="nct-soft"> (inferred)</span>}.
            <span className="nct-finding-kv">
              <span className="nct-kv-k">When</span>
              <span>
                <b>{chosenDateLong}</b>
                {chosenLead != null && chosenLead >= 0 && <> · in {chosenLead} day{chosenLead === 1 ? "" : "s"}</>}
                {!isArena(chosen.venue) && (
                  <span className="nct-soft"> · at {chosen.venue}{chosen.capacity ? ` (${fmtVeh(chosen.capacity)} capacity)` : ""}</span>
                )}
              </span>
            </span>
            <span className="nct-finding-kv">
              <span className="nct-kv-k">Top exit</span>
              <span>
                <b>{top.exit}</b> takes {top.shareOfSurge.toFixed(0)}% of it, {multiple.toFixed(1)}× its normal{" "}
                {new Date(`${chosen.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" })}
              </span>
            </span>
          </>
        ) : (
          <>
            On a <b>{eventName}</b> day, <b>{top.exit}</b> takes {top.shareOfSurge.toFixed(0)}% of the surge —{" "}
            {multiple.toFixed(1)}× a normal day, +{fmtVeh(top.added)} vehicles.
          </>
        )}
      </div>

      {/* Row 4: the numbers, once each, on one line. */}
      {/* Two by two, not auto-fit: in a half-width card four stats wrapped 3+1
          and left the last one orphaned on its own line. */}
      <div className="nct-stats">
        {stat(`+${fmtVeh(totalAdded)}`, "extra vehicles")}
        {stat(`${affected.length} of ${totalPlazas}`, "exits with a material rise")}
        {stat(`+${((totalAdded / affectedBaseline) * 100).toFixed(0)}%`, "uplift at those exits")}
        {stat(`${top2Share.toFixed(0)}%`, `carried by the top ${Math.min(2, affected.length)}`)}
      </div>

      {/* Row 5: the chart, with the room the strip and tiles were taking. */}
      <div style={{ width: "100%", height: `${impactHeight}px` }}>
        <DashboardChart option={impactOption} height={impactHeight} />
      </div>

      {/* Row 6: what a reviewer needs and an operator does not need first.
          Validation as a table, matching how the volume card above shows its
          models; the long tail and unchanged exits as one chip row, there so
          "13 of 19" can be checked, not to be read. */}
      {/* The model's own read-out, in the open: the control that asks for it
          has to be visible, and it is the same panel the other Predictive
          cards carry so the tab reads as one system. */}
      {champ && (
        <EventSurgeNarrative
          models={[champ, ...others].map((m) => ({
            model: m.model,
            wmape: m.wmape ?? null,
            accepted: m.accepted ?? null,
            diagnosis: m.diagnosis ?? null,
          }))}
          noAdjustment={noAdj?.wmape != null ? { model: noAdj.model, wmape: noAdj.wmape } : null}
          eventDays={meta?.nEvents ?? null}
          firstEvent={meta?.firstEvent ?? null}
          lastEvent={meta?.lastEvent ?? null}
          mode={chosen ? "upcoming" : "observed"}
          eventTitle={chosen ? chosen.title : null}
          eventDate={chosen ? chosenDateLong : null}
          venue={chosen ? chosen.venue : null}
          exitsMaterial={affected.length}
          exitsTotal={totalPlazas}
          totalAdded={totalAdded}
          upliftPct={affectedBaseline > 0 ? (totalAdded / affectedBaseline) * 100 : null}
          topExit={top?.exit ?? null}
          topAdded={top?.added ?? null}
          topSharePct={top?.shareOfSurge ?? null}
          top2SharePct={top2Share}
        />
      )}

      <EvidenceModal
        subtitle="Event surge model: its error on held-out events, and the exits it covers."
        strip={<>
          {champ?.wmape != null && (
            <span className="nct-trust-pill" style={{ order: 4 }}>
              {champ.model} · {champ.wmape.toFixed(2)}% on held-out events
              {noAdj?.wmape != null && <> · vs {noAdj.wmape.toFixed(2)}% ignoring the event</>}
            </span>
          )}
          {(minorAffected.length > 0 || otherExits.length > 0) && (
            <span className="nct-dim" style={{ order: 5, fontSize: "var(--fs-body)" }}>
              the other {minorAffected.length + otherExits.length} exits
            </span>
          )}
        </>}
      >

        <div className="nct-evidence nct-ev-body">
          {evalInfo?.series && evalInfo.series.length > 1 && (
            <div>
              <div className="nct-ev-title">
                Did past predictions match what really happened?
              </div>
              <p style={{ margin: "0 0 2px", fontSize: "var(--fs-body)", lineHeight: 1.55, color: "var(--text-secondary)" }}>
                <b>{evalInfo.events_test} event days the model never saw</b>, in date order · the gap is the error
              </p>
              <EventReplayChart series={evalInfo.series} />
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 8, marginTop: 8,
                padding: "8px 10px", borderRadius: 8, background: "color-mix(in srgb, var(--text-primary) 4%, transparent)", border: "1px solid var(--border-default)",
              }}>
                {[[`${evalInfo.median_day_error_pct.toFixed(1)}%`, "off on the typical event day"],
                  [`${evalInfo.wmape.toFixed(1)}%`, "error across all exit-days"],
                  [`${evalInfo.baseline_wmape.toFixed(1)}%`, "if you ignored the event"]].map(([v, l]) => (
                  <div key={l} style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "var(--fs-title)", fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{v}</span>
                    <span style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)" }}>{l}</span>
                  </div>
                ))}
              </div>
              {evalInfo.examples?.length > 0 && (
                <div style={{ display: "grid", gap: 3, marginTop: 7, fontSize: "var(--fs-label)", color: "var(--text-secondary)" }}>
                  {evalInfo.examples.map((ex) => (
                    <div key={ex.kind}>
                      {ex.kind.charAt(0).toUpperCase() + ex.kind.slice(1)} —{" "}
                      <b style={{ color: "var(--text-primary)" }}>{new Date(ex.t + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</b>:
                      {" "}predicted {ex.predicted.toLocaleString()}, actually {ex.actual.toLocaleString()}.
                    </div>
                  ))}
                </div>
              )}
              <p style={{ margin: "7px 0 0", fontSize: "var(--fs-label)", lineHeight: 1.5, color: "var(--text-muted)" }}>
                {evalInfo.events_total} Philippine Arena dates · attendance is not in the calendar, the largest
                remaining source of error
                <InfoTooltip
                  text={`Event days are read from the Philippine Arena calendar, never inferred from how busy the road was, so the model cannot credit itself with a jam it did not predict.${
                    evalInfo.holiday_event_days
                      ? ` ${evalInfo.holiday_event_days} of them fall on a public holiday, which is measured separately — a holiday runs about ${Math.round((evalInfo.holiday_factor ?? 1) * 100)}% of an ordinary day, so the event effect is read on top of that rather than being credited with it.`
                      : ""
                  } Attendance is not recorded, so a sold-out concert and a small exhibition get the same prediction.`}
                />
              </p>
            </div>
          )}

          {champ?.wmape != null && (
            <div>
              <table className="nct-table">
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-muted)", borderBottom: "1px solid var(--border-default)" }}>
                    <th style={{ padding: "4px 6px", fontWeight: 600 }}>Model</th>
                    <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>Error on held-out events</th>
                  </tr>
                </thead>
                <tbody>
                  {[champ, ...others].map((m, i) => (
                    <tr key={m.model} style={{ borderBottom: "1px solid var(--border-default)", color: i === 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      <td style={{ padding: "4px 6px", fontWeight: i === 0 ? 700 : 500 }}>
                        {m.model}{i === 0 && <span className="pill purple" style={{ marginLeft: 8, padding: "1px 8px" }}>used</span>}
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: i === 0 ? 700 : 500 }}>
                        {m.wmape != null ? `${m.wmape.toFixed(2)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                  {noAdj?.wmape != null && (
                    <tr style={{ color: "var(--text-muted)" }}>
                      <td style={{ padding: "4px 6px", fontStyle: "italic" }}>Ignoring the event</td>
                      <td style={{ padding: "4px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{noAdj.wmape.toFixed(2)}%</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p style={{ margin: "6px 0 0", lineHeight: 1.5, color: "var(--text-muted)" }}>
                Fitted on earlier events, scored on later ones it never saw{champ.diagnosis ? ` (${champ.diagnosis})` : ""}.{" "}
                {chosen
                  ? <>The day shown applies each exit&apos;s uplift to its normal same-weekday, same-month volume; the uplift does not yet vary with the act or its capacity.
                      {!isArena(chosen.venue) && <> It was measured on Philippine Arena days; this event is at the {chosen.venue}, a smaller venue in the same complex, so treat the figures as an upper bound.</>}</>
                  : <>Choose an upcoming date above to see the forecast for it.</>}
              </p>
            </div>
          )}

          {(minorAffected.length > 0 || otherExits.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {minorAffected.map((r) => (
                <span key={r.exit} title={`${r.exit}: +${fmtVeh(r.added)} vehicles, ${r.shareOfSurge.toFixed(1)}% of the surge — too small to chart`} className="nct-mini-chip is-accent">
                  {r.exit}<b>+{fmtVeh(r.added)}</b>
                </span>
              ))}
              {shownOthers.map((o) => (
                <span key={o.exit} title={`${o.exit}: ${fmtVeh(o.baseline)} vehicles/day, no material event effect`} className="nct-mini-chip">
                  {o.exit}<span>no change</span>
                </span>
              ))}
              {otherExits.length > VISIBLE_OTHERS && (
                <button type="button" onClick={() => setShowAllOthers((v) => !v)} className="nct-mini-chip">
                  {showAllOthers ? "fewer" : `+${otherExits.length - VISIBLE_OTHERS} more`}
                </button>
              )}
              {otherPoints.length > 0 && (
                <span className="nct-dim" style={{ alignSelf: "center" }} title={otherPoints.map((x) => x.exit).join(", ")}>
                  · {otherPoints.length} barriers/ramps excluded
                </span>
              )}
            </div>
          )}
        </div>
      </EvidenceModal>
    </article>
  );
}
