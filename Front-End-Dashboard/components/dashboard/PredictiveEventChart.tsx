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
import EvBlock from "./EvBlock";
import { GenerateReportButton } from "./NarrativePanel";
import GroupMenu, { type GroupMenuGroup } from "./GroupMenu";
import { ChevronRight, ShieldCheck } from "lucide-react";

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

// One upcoming event NIGHT with its dated per-exit forecast, as served on
// /api/traffic/forecast.upcomingEvents (see getUpcomingEventSurge). Baseline is
// that exit's normal day (same weekday, last 8 real weeks, holiday-adjusted),
// times the tested multiplier (EVALUATION_PROTOCOL.md section 9).
type UpcomingExit = { exit: string; baseline: number; surge: number; surgeLo: number; surgeHi: number; uplift: number; nEvents: number };
type UpcomingEvent = {
  date: string; title: string; isDerived: boolean; capacity: number | null; venue: string | null;
  /** In the verified calendar (a public source confirms the night); false = a new scraped listing not yet checked. */
  verified?: boolean; sourceUrl?: string | null;
  exits: UpcomingExit[];
};
type GroupStat = { n: number; median: number; ci: [number, number] };
/** What the forecast stands on (train_event_effect.py): the verified calendar, what event types did, the
 *  attendance link and the normal-day test. */
type EventBasis = {
  protocol: string;
  calendar_counts: { held_nights_at_venues: number; scored_nights: number; nights_with_attendance: number; first: string; last: string };
  sources: string;
  by_venue?: Record<string, GroupStat>; by_origin?: Record<string, GroupStat>; by_format?: Record<string, GroupStat>;
  per_1000_attendees?: { nights: number; per_1000: number; ci: [number, number]; nights_below_normal?: number } | null;
  attendance_test?: { nights: number; significant: boolean; wmape_class_model: number; wmape_with_attendance: number } | null;
  far_normal?: Record<string, number>; far_normal_choice?: string | null;
};

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
const fmtK = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

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
  basis?: EventBasis;
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
  // The report and the validation details open from the card's foot line (13 Nov 2026), as on the other cards.
  const [reportOpen, setReportOpen] = useState(false);
  // A quick year filter beside the menu (13 Nov 2026, user request): "all" or one year of upcoming nights.
  const [eventYear, setEventYear] = useState<string>("all");
  const [evidenceOpen, setEvidenceOpen] = useState(false);

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
  const upcomingYears = useMemo(() => [...new Set(upcoming.map((u) => u.date.slice(0, 4)))].sort(), [upcoming]);

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

  const { affected, rows, minorAffected, otherExits, otherPoints, totalAdded, affectedBaseline, totalPlazas } = model;
  const top = affected[0];
  const multiple = top.surge / top.baseline;

  // Sorted bar of the ADDED vehicles only, every bar starting at zero.
  // The previous stacked form began each red segment at that exit's baseline —
  // three different x positions — so comparing the surges meant judging
  // floating lengths, the one thing bar charts are bad at. Length from a common
  // zero is the most accurate comparison available, and it stops the smallest
  // exit collapsing into a sliver.
  const impactOption: EChartsOption = {
    grid: { left: 132, right: 120, top: 8, bottom: 44 },
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
      splitNumber: 4,
      splitLine: { show: true, lineStyle: { color: K.hover, type: "dashed" } },
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
        barMaxWidth: 22,
        showBackground: true,
        backgroundStyle: { color: K.hover, borderRadius: [0, 4, 4, 0] },
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
            ctx: { color: K.muted, fontSize: 11, lineHeight: 14 },
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
  // The leaderboard comes in rank order with the served method first (it may be a baseline: the protocol serves the
  // better baseline when no candidate beats both).
  const champ = val[0] ?? null;
  const noAdj = val.find((v) => /no (event )?adjustment/i.test(v.model)) ?? null;
  const others = val.filter((v) => v.model !== champ?.model && v.model !== noAdj?.model);
  const basis = evalInfo?.basis ?? null;
  const pctUp = (r: number) => `${r >= 1 ? "+" : "−"}${Math.abs((r - 1) * 100).toFixed(0)}%`;
  const GROUP_LABEL: Record<string, string> = {
    arena: "Philippine Arena (CDV exit)", stadium: "Philippine Sports Stadium (CDV exit)", clark: "Clark Global City (Dau exit)",
    international: "International acts", filipino: "Filipino acts", mixed: "Mixed lineups",
    solo_concert: "Solo concerts", festival: "Festivals", multi_artist_showcase: "Multi-artist showcases", sports: "Sports",
  };
  const impactHeight = Math.max(rows.length * 46 + 72, 150);
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

  /* The "Showing" menu (13 Nov 2026): past events first, then each upcoming night under its year. One menu with
     year headings replaces the separate Year select, which only filtered this list. */
  const menuGroups: GroupMenuGroup[] = [
    { items: [{ value: "", main: "Typical event day (past events)", side: meta?.nEvents ? `${meta.nEvents} nights` : undefined }] },
    ...(eventYear !== "all" && !upcomingYears.includes(eventYear)
      ? [{ label: eventYear, items: [{ value: "__none", main: "No nights listed for this year yet", side: undefined }] }]
      : []),
    ...upcomingYears.filter((y) => eventYear === "all" || y === eventYear).map((year) => ({
      label: year,
      items: upcoming.flatMap((u, i) => {
        if (!u.date.startsWith(year)) return [];
        // Group nights by the act, not the full title: the source spells one tour two ways.
        const act = shortTitle(u.title);
        const nth = upcoming.slice(0, i + 1).filter((x) => shortTitle(x.title) === act).length;
        const multi = upcoming.filter((x) => shortTitle(x.title) === act).length > 1;
        const d = new Date(`${u.date}T00:00:00`);
        const lead = Math.round((d.getTime() - Date.now()) / 86400000);
        const tags: { label: string; tone?: "muted" | "warn" | "accent" }[] = [];
        if (multi) tags.push({ label: `Day ${nth}`, tone: "accent" });
        if (!isArena(u.venue) && u.venue) tags.push({ label: u.venue.replace(/^Philippine /, ""), tone: "muted" });
        if (u.verified === false) tags.push({ label: "Unverified", tone: "warn" });
        return [{
          value: String(i),
          main: <><b className="gm-date">{d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</b>{act}</>,
          side: lead >= 0 ? (lead === 0 ? "today" : `in ${lead} d`) : undefined,
          tags,
        }];
      }),
    })),
  ];

  /* Layout (13 Nov 2026, user request, in the shape of the other Predictive cards): title and status, one
     controls panel, the finding, the four numbers beside the chart, then a foot line with Generate report and
     View validation details. */
  return (
    <article className="chart-card wide nct-card ev-card">
      <div className="nct-card-head-split">
        <h3 className="nct-title">
          Event Surge Impact by Exit
          <InfoTooltip text="Extra vehicles each exit takes on an event day at the Philippine Arena complex, against a normal day. Choose the typical event day or an upcoming night." />
        </h3>
        <div className="nct-pill-row">
          {chosen ? (
            <span className="pill purple">Forecast · {chosenDate}</span>
          ) : (
            <span className="pill">Observed{meta?.nEvents ? ` · ${meta.nEvents} past event days` : ""}</span>
          )}
          {champ?.wmape != null && (
            <span title={champ.diagnosis ?? undefined} className={`pill ${champ.accepted ? "green" : "red"}`}>
              {champ.accepted ? "✓ Tested" : "Failed test"} · {champ.wmape.toFixed(1)}% error held-out
            </span>
          )}
        </div>
      </div>

      <div className="fc2-controls ev-controls">
        <div className="fc2-row">
          {/* Year, as a dropdown (13 Nov 2026, user request): every year with listed nights, and the next two years
              even before anything is listed, so a planner can look ahead. */}
          {(() => {
            const now = new Date().getFullYear();
            const years = [...new Set([...upcomingYears, String(now), String(now + 1), String(now + 2)])].sort();
            return (
              <>
                <span className="fc-label">Year</span>
                <GroupMenu
                  value={eventYear}
                  onChange={(y) => {
                    setEventYear(y);
                    // A night from another year is no longer listed: back to the typical event day.
                    if (y !== "all" && selUpcoming != null && !upcoming[selUpcoming]?.date.startsWith(y)) setSelUpcoming(null);
                  }}
                  ariaLabel="Year"
                  minWidth={130}
                  menuWidth={220}
                  groups={[{
                    items: [
                      { value: "all", main: "All years", side: `${upcoming.length} nights` },
                      ...years.map((y) => {
                        const n = upcoming.filter((u) => u.date.startsWith(y)).length;
                        return { value: y, main: y, side: n ? `${n} night${n === 1 ? "" : "s"}` : "none listed yet" };
                      }),
                    ],
                  }]}
                />
                <span className="fc2-sep" aria-hidden="true" />
              </>
            );
          })()}
          <span className="fc-label">Showing</span>
          <GroupMenu
            value={selUpcoming == null ? "" : String(selUpcoming)}
            onChange={(v) => { if (v !== "__none") setSelUpcoming(v === "" ? null : Number(v)); }}
            groups={menuGroups}
            ariaLabel="Event shown"
            minWidth={300}
            menuWidth={440}
            buttonLabel={chosen
              ? <><b className="gm-date">{chosenDate}</b>{shortTitle(chosen.title)}</>
              : "Typical event day (past events)"}
          />
          <InfoTooltip
            text={`Normal day = each exit's median on the same weekday over the last 8 weeks of real toll data, counting only days with no event and no holiday, so events cannot inflate their own baseline. The event effect is measured on verified show nights only${
              meta?.firstEvent && meta?.lastEvent ? `, ${meta.firstEvent} to ${meta.lastEvent}` : ""
            }.`}
          />
        </div>
      </div>

      {/* The event, as a banner (13 Nov 2026, user request): a date badge, the event's name with its facts as chips,
          and the effect on the right. It was one long sentence; the vehicle total is in the figures just below. */}
      {(() => {
        const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "source"; } };
        const d = chosen ? new Date(`${chosen.date}T00:00:00`) : null;
        return (
          <div className={`ev-banner${chosen ? " is-upcoming" : " is-typical"}`}>
            {d ? (
              <div className="ev-date" aria-hidden="true">
                <span>{d.toLocaleDateString("en-US", { month: "short" })}</span>
                <b>{d.getDate()}</b>
                <em>{d.toLocaleDateString("en-US", { weekday: "short" })}</em>
              </div>
            ) : (
              /* The same three lines as the calendar badge (13 Nov 2026): label, number, unit. */
              <div className="ev-date is-typical" title={`Measured over ${meta?.nEvents ?? "the"} past show nights`}>
                <span>Past</span>
                <b>{meta?.nEvents ?? "—"}</b>
                <em>nights</em>
              </div>
            )}
            <div className="ev-banner-main">
              <span className="ev-banner-k">{chosen ? "Upcoming event" : "Typical event day"}</span>
              <h4 className="ev-banner-title">{chosen ? shortTitle(chosen.title) : "What a show night at the Arena complex does"}</h4>
              <div className="ev-banner-chips">
                {chosen ? (
                  <>
                    <span className="ev-chip">{chosenDateLong}</span>
                    {chosenLead != null && chosenLead >= 0 && (
                      <span className="ev-chip is-accent">{chosenLead === 0 ? "Today" : `In ${chosenLead} day${chosenLead === 1 ? "" : "s"}`}</span>
                    )}
                    {chosen.venue && <span className="ev-chip">{chosen.venue}{chosen.capacity ? ` · ${fmtVeh(chosen.capacity)} seats` : ""}</span>}
                    {chosen.isDerived && <span className="ev-chip is-warn" title="A recurring event inferred from prior years, not an announced date.">Inferred date</span>}
                    {chosen.verified === false && <span className="ev-chip is-warn" title="A new listing from the scraped calendar, not yet checked against a public source.">Unverified</span>}
                    {chosen.sourceUrl && (
                      <a className="ev-chip is-link" href={chosen.sourceUrl} target="_blank" rel="noopener noreferrer">
                        Source: {host(chosen.sourceUrl)}
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    {meta?.firstEvent && meta?.lastEvent && (() => {
                      const my = (iso: string) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); };
                      return <span className="ev-chip">{my(meta.firstEvent)} – {my(meta.lastEvent)}</span>;
                    })()}
                    <span className="ev-chip">Verified show nights only</span>
                  </>
                )}
              </div>
            </div>
            <div className="ev-banner-effect">
              <span className="ev-banner-k">Biggest effect</span>
              <b>{top.exit}</b>
              <span>{top.shareOfSurge.toFixed(0)}% of the rise · {multiple.toFixed(1)}× a normal day</span>
            </div>
          </div>
        );
      })()}

      <div className="nct-split is-event ev-body">
        <div className="nct-stats">
          {stat(`+${fmtVeh(totalAdded)}`, "extra vehicles")}
          {stat(`${affected.length} of ${totalPlazas}`, "exits with a clear rise")}
          {stat(`+${((totalAdded / affectedBaseline) * 100).toFixed(0)}%`, "uplift at those exits")}
          {stat(`${top2Share.toFixed(0)}%`, `carried by the top ${Math.min(2, affected.length)}`)}
        </div>
        <div className="ev-chart">
          <div className="ev-chart-head">
            <span>Extra vehicles by exit</span>
            {(minorAffected.length > 0) && <em>{minorAffected.length} smaller rise{minorAffected.length === 1 ? "" : "s"} in the details</em>}
          </div>
          <div style={{ height: `${impactHeight}px` }}>
            <DashboardChart option={impactOption} height={impactHeight} />
          </div>
        </div>
      </div>

      {/* The foot line, as on the volume forecast and the congestion map. */}
      <div className="fc2-foot cg-foot ev-foot">
        {!reportOpen && champ && <GenerateReportButton onClick={() => setReportOpen(true)} />}
        {champ?.wmape != null && (
          <button type="button" className="cg-ev-btn" aria-haspopup="dialog" onClick={() => setEvidenceOpen(true)}>
            <ShieldCheck size={16} aria-hidden="true" className="cg-ev-icon" />
            <span className="cg-ev-title">View validation details</span>
            <ChevronRight size={16} aria-hidden="true" className="cg-ev-chev" />
          </button>
        )}
      </div>

      {champ && (
        <EventSurgeNarrative
          compact
          open={reportOpen}
          onOpenChange={setReportOpen}
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
        subtitle="How well the event estimate held up on events it never saw, and what it is built from."
        hideTrigger
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
      >
        {/* Numbered steps that open on a click, as on the congestion map (13 Nov 2026, user request): the first is open,
            the rest stay folded until wanted. */}
        <div className="nct-evidence nct-ev-blocks ev-evidence">
          {evalInfo?.series && evalInfo.series.length > 1 && (
            <EvBlock n={0 + 1} title="Did past predictions match what happened?">
              <p className="ev-lead">
                {evalInfo.events_test} event days the model never saw. Each line joins the prediction to what arrived; a short line is a close call.
              </p>
              <EventReplayChart series={evalInfo.series} />
              <div className="ev-figs">
                <div><b>{evalInfo.median_day_error_pct.toFixed(1)}%</b><span>off on a typical event day</span></div>
                <div><b>{evalInfo.wmape.toFixed(1)}%</b><span>error with the event estimate</span></div>
                <div className="is-muted"><b>{evalInfo.baseline_wmape.toFixed(1)}%</b><span>error if the event is ignored</span></div>
              </div>
            </EvBlock>
          )}

          {basis && (
            <EvBlock n={(evalInfo?.series && evalInfo.series.length > 1 ? 1 : 0) + 1} title="What it is built from">
              <p className="ev-lead">
                {basis.calendar_counts.held_nights_at_venues} show nights ({basis.calendar_counts.first} to {basis.calendar_counts.last}),
                each confirmed by an official or news source.
              </p>
              {(() => {
                const table = (label: string, groups: Record<string, GroupStat> | undefined) => {
                  const list = groups ? Object.entries(groups).filter(([, v]) => v.n >= 3).sort((x, y) => y[1].median - x[1].median) : [];
                  if (!list.length) return null;
                  return (
                    <table className="nct-table ev-table">
                      <thead>
                        <tr><th>{label}</th><th>Nights</th><th>Typical rise</th></tr>
                      </thead>
                      <tbody>
                        {list.map(([k, v]) => (
                          <tr key={k}>
                            <td>{GROUP_LABEL[k] ?? k}</td>
                            <td>{v.n}</td>
                            <td><b>{pctUp(v.median)}</b> <span>({pctUp(v.ci[0])} to {pctUp(v.ci[1])})</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                };
                const more = [table("By act", basis.by_origin), table("By format", basis.by_format)].filter(Boolean);
                return (
                  <>
                    {table("By venue", basis.by_venue)}
                    {more.length > 0 && (
                      <details className="ev-more">
                        <summary>More breakdowns (by act and format)</summary>
                        {more}
                      </details>
                    )}
                  </>
                );
              })()}
            </EvBlock>
          )}

          {champ?.wmape != null && (
            <EvBlock n={(evalInfo?.series && evalInfo.series.length > 1 ? 1 : 0) + (basis ? 1 : 0) + 1} title="Which method is used">
              <table className="nct-table ev-table">
                <thead><tr><th>Method</th><th>Error on unseen events</th></tr></thead>
                <tbody>
                  {[champ, ...others].map((m, i) => (
                    <tr key={m.model} className={i === 0 ? "is-used" : undefined}>
                      <td>{m.model}{i === 0 && <span className="pill purple ev-used">used</span>}</td>
                      <td>{m.wmape != null ? `${m.wmape.toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                  {noAdj?.wmape != null && (
                    <tr className="is-muted"><td>Ignoring the event</td><td>{noAdj.wmape.toFixed(1)}%</td></tr>
                  )}
                </tbody>
              </table>
              <p className="ev-note">
                Fitted on earlier events and scored on later ones. {chosen
                  ? "The forecast for a chosen night is each exit's normal day for that weekday, times the method's estimate for the event."
                  : "Choose an upcoming night to see its forecast."}
              </p>
            </EvBlock>
          )}

          {(minorAffected.length > 0 || otherExits.length > 0) && (
            <EvBlock n={(evalInfo?.series && evalInfo.series.length > 1 ? 1 : 0) + (basis ? 1 : 0) + (champ?.wmape != null ? 1 : 0) + 1} title="The other exits">
              <div className="ev-chips">
                {minorAffected.map((r) => (
                  <span key={r.exit} title={`${r.exit}: +${fmtVeh(r.added)} vehicles, ${r.shareOfSurge.toFixed(1)}% of the surge`} className="nct-mini-chip is-accent">
                    {r.exit}<b>+{fmtVeh(r.added)}</b>
                  </span>
                ))}
                {shownOthers.map((o) => (
                  <span key={o.exit} title={`${o.exit}: ${fmtVeh(o.baseline)} vehicles/day, no clear event effect`} className="nct-mini-chip">
                    {o.exit}<span>no change</span>
                  </span>
                ))}
                {otherExits.length > VISIBLE_OTHERS && (
                  <button type="button" onClick={() => setShowAllOthers((v) => !v)} className="nct-mini-chip">
                    {showAllOthers ? "Fewer" : `+${otherExits.length - VISIBLE_OTHERS} more`}
                  </button>
                )}
              </div>
              {otherPoints.length > 0 && (
                <p className="ev-note" title={otherPoints.map((x) => x.exit).join(", ")}>
                  {otherPoints.length} barriers and ramps are left out: they are toll points, not exits.
                </p>
              )}
            </EvBlock>
          )}
        </div>
      </EvidenceModal>
    </article>
  );
}
