"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowLeftRight, ArrowRight, CalendarDays, Flame, History, Lightbulb, ListOrdered, MapPin, Network, TrendingDown, TrendingUp, X } from "lucide-react";
import InfoTooltip from "./InfoTooltip";
import type { EChartsOption } from "echarts";
import DashboardChart from "./DashboardChart";
import { useThemeTokens } from "./useThemeTokens";
import { withAlpha } from "../../lib/chart-kit";
import CorridorRiskNarrative from "./CorridorRiskNarrative";
import { fmtInt, fmtNum, fmtDate, fmtDateFull, fmtDateRange } from "./incidentPredictive.shared";
import { useNlexExits, accessLabel, displayExitName } from "../../lib/nlex-exits";
import { corridorKmFromPost } from "../../lib/exit-lookup";
import { fmtKm as fmtKmPost } from "../../lib/km-post";
import { hotspotServed } from "../../lib/hotspot-served";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

// Reads /api/incident/spatial -- the two per-exit models from
// train_incident_spatial_models.py (GWR + Spatial LSTM). This replaces the
// old apportionment-based "Predicted Incidents Ranking" (which split the
// day-level forecast's total across fixed 5km segments by historical share,
// not a per-location model) with the corridor's genuine per-EXIT forecast:
// the Spatial LSTM is trained on each exit's own history plus its
// neighbors', held out in time. See incident-spatial.service.ts's own doc
// comment for the full rationale.
type GwrCoefficient = {
  exitId: number; exitName: string; km: number; variable: string;
  coefficient: number; stdError: number | null; tValue: number | null; significant: boolean | null;
};
type SegmentRisk = {
  exitId: number; exitName: string; km: number; forecastDate: string;
  // 1 = the real next-24h model output; 2..horizonDays is a recursive
  // rollout (each day's own prediction feeds the next day's input).
  horizonDay: number;
  predictedIncidents: number; lastObservedCount: number | null; rank: number;
  historyEventCount: number | null; hasData: boolean;
};
type GwrMetrics = { MAE: number; Poisson_Deviance: number; n: number; loocv_mae: number | null; loocv_n: number };
type LstmMetrics = { MAE: number; Poisson_Deviance: number; n?: number; epochs?: number };
type Metadata = {
  gwr?: { bandwidth: number; metrics: GwrMetrics; variables: string[] };
  spatial_lstm?: {
    metrics: LstmMetrics; seq_len: number; n_neighbors: number; horizon_days?: number; rollout_assumptions?: string;
    /** What the map shows: a baseline when no model beat it (lib/hotspot-served.ts). */
    served_model?: string;
  };
};
type SpatialData = {
  coefficients: GwrCoefficient[];
  segmentRisk: SegmentRisk[];
  metadata: Metadata | null;
  trainedAt: string | null;
};

const VARIABLE_LABEL: Record<string, string> = {
  km: "Corridor position",
  access_count: "Access-point count",
  mean_log_volume: "Typical traffic volume",
};

const HORIZON_PRESETS = [1, 7, 14, 28] as const;
const INLINE_LIMIT = 5;

// Four semantic bands rather than a continuous ramp, matching the spec's own
// LOW/MODERATE/ELEVATED/HIGH hierarchy. Cut points are quartiles recomputed
// from whichever exits actually have incident history every time the horizon
// changes -- never a fixed number -- so "High" always means "top quarter of
// this corridor, this window," not a threshold picked in advance.
// Colours are the dashboard's own theme tokens (NLEX Daylight, merged 7 Oct 2026), so the bands
// follow light and dark mode: clear, slow, the incident orange, and congested coral.
const RISK_BANDS = [
  { key: "low" as const, label: "Low", color: "var(--signal-clear)" },
  { key: "moderate" as const, label: "Moderate", color: "var(--signal-slow)" },
  { key: "elevated" as const, label: "Elevated", color: "var(--accent-incident)" },
  { key: "high" as const, label: "High", color: "var(--signal-congested)" },
];
type RiskKey = (typeof RISK_BANDS)[number]["key"];
const RISK_META = Object.fromEntries(RISK_BANDS.map((b) => [b.key, b])) as Record<RiskKey, (typeof RISK_BANDS)[number]>;
// Slate, never a ramp color -- an exit the model never saw an incident at is
// unknown, not "safe," and must never read as the green end of the scale.
const NO_DATA_COLOR = "var(--signal-none)";

function riskBandFor(value: number, sortedPool: number[]): RiskKey {
  if (sortedPool.length === 0) return "low";
  const at = (p: number) => sortedPool[Math.min(sortedPool.length - 1, Math.floor(p * sortedPool.length))];
  if (value >= at(0.75)) return "high";
  if (value >= at(0.5)) return "elevated";
  if (value >= at(0.25)) return "moderate";
  return "low";
}

// km arrives MEASURED (the API and the exit list); shown as the official km post (lib/km-post.ts).
const fmtKm = (km: number, digits = 1) => fmtKmPost(km, digits);

function ordinal(n: number): string {
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

// Sequential amber ramp for the ranked-list bars -- Incident's own domain
// color (see the family note this replaced in the old file), kept distinct
// from the traffic-light risk bands on the corridor strip itself: the bars
// show relative MAGNITUDE among the ranked exits, the strip shows a risk
// STATE, and conflating the two palettes would blur that difference.
const RAMP_LIGHT = { r: 217, g: 119, b: 6 };
const RAMP_DARK = { r: 69, g: 26, b: 3 };
export function shadeFor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const eased = Math.sqrt(clamped);
  const scaled = 0.15 + eased * 0.85;
  const r = Math.round(RAMP_LIGHT.r + (RAMP_DARK.r - RAMP_LIGHT.r) * scaled);
  const g = Math.round(RAMP_LIGHT.g + (RAMP_DARK.g - RAMP_LIGHT.g) * scaled);
  const b = Math.round(RAMP_LIGHT.b + (RAMP_DARK.b - RAMP_LIGHT.b) * scaled);
  return `rgb(${r}, ${g}, ${b})`;
}

type ExitRow = {
  exitId: number; exitName: string; km: number; hasData: boolean;
  historyEventCount: number | null;
  day1Predicted: number | null; lastObserved: number | null;
  sumPredicted: number;
};

export default function PredictiveCorridorChart() {
  const [data, setData] = useState<SpatialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizonDays, setHorizonDays] = useState<number>(7);
  const [selectedExitId, setSelectedExitId] = useState<number | null>(null);
  const [hoveredExitId, setHoveredExitId] = useState<number | null>(null);
  const [seeMoreOpen, setSeeMoreOpen] = useState(false);
  // Drill-down: nothing is shown until an exit is clicked -- no default
  // top-hotspot panel sitting open on load. Separate from selectedExitId's
  // own highlight (the ring on the corridor/ranked-list stays lit after the
  // modal closes, so a reader can see what they last looked at) so closing
  // the modal doesn't also clear the highlight.
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const { exits: nlexExits } = useNlexExits();
  // Chart text and tooltip colours for the pop-up's day chart (ECharts needs literal colours, not var()).
  const T = useThemeTokens();

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND}/api/incident/spatial`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setData(json.data as SpatialData);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load corridor risk models");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* The two dialogs (testers IN-11: "fix the pop-up modal"). They were drawn inside the card, under the
     Predictive stage, whose fade-in animation makes it a stacking context: the sticky filter bar and the
     header shelf painted over the top of the dialog whatever its z-index. They now render into <body>
     (as Traffic's episode list does), close on Escape as well as on the backdrop and the close button,
     and use the icon set's X instead of a text glyph. */
  useEffect(() => {
    // Rows inside a dialog set the hover too, and unmounting them sends no mouseleave: clear on every
    // open and close so the rail never describes an exit the pointer is no longer on.
    setHoveredExitId(null);
    if (!seeMoreOpen && !drillDownOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSeeMoreOpen(false);
      setDrillDownOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seeMoreOpen, drillDownOpen]);

  // Hooks above this line always run; everything below may legitimately see
  // data === null, so each derivation below null-guards internally instead
  // of sitting after an early return.
  const availableDays = useMemo(
    () => (data ? data.segmentRisk.reduce((m, r) => Math.max(m, r.horizonDay), 1) : 7),
    [data],
  );
  const effectiveHorizon = Math.min(horizonDays, availableDays);

  // SegmentRisk's own km is the spatial pipeline's distance-from-Balintawak
  // convention (Balintawak = 0) -- an older measurement the rest of the
  // dashboard has since moved off of in favor of the real km-post (see
  // nlex-exits.ts's own doc comment: Balintawak reads 12 on the actual road
  // signage, not 0). Resolved here, once, so every display below shows the
  // same number the Live Corridor Status and every other tab would.
  const kmPostFor = (exitName: string, fallback: number): number => {
    const match = nlexExits.find((e) => e.exit_name.toLowerCase().trim() === exitName.toLowerCase().trim());
    return match ? match.km : fallback;
  };

  const byExit = useMemo<ExitRow[]>(() => {
    if (!data) return [];
    const map = new Map<number, ExitRow>();
    for (const r of data.segmentRisk) {
      if (r.horizonDay > effectiveHorizon) continue;
      const cur = map.get(r.exitId);
      if (!cur) {
        map.set(r.exitId, {
          exitId: r.exitId, exitName: r.exitName, km: kmPostFor(r.exitName, r.km), hasData: r.hasData,
          historyEventCount: r.historyEventCount,
          day1Predicted: r.horizonDay === 1 ? r.predictedIncidents : null,
          lastObserved: r.horizonDay === 1 ? r.lastObservedCount : null,
          sumPredicted: r.predictedIncidents,
        });
      } else {
        cur.sumPredicted += r.predictedIncidents;
        if (r.horizonDay === 1) {
          cur.day1Predicted = r.predictedIncidents;
          cur.lastObserved = r.lastObservedCount;
        }
      }
    }
    return [...map.values()];
  }, [data, effectiveHorizon, nlexExits]);

  const day1Rows = useMemo(
    () => (data ? data.segmentRisk.filter((r) => r.horizonDay === 1).sort((a, b) => a.rank - b.rank) : []),
    [data],
  );

  // The actual calendar date(s) a prediction applies to -- feature-test
  // feedback asked for this explicitly rather than only a relative "7d"/
  // "Today" label. Read off segmentRisk's own forecastDate per horizonDay
  // (every exit shares one date per day, same training run) rather than
  // computed from "today" client-side, so this can never drift from what
  // the pipeline actually forecast. horizonDay is 1-indexed and contiguous,
  // so day N's date is the end of an N-day-deep window starting at day 1.
  const horizonDateRange = useMemo(() => {
    if (!data) return null;
    const start = data.segmentRisk.find((r) => r.horizonDay === 1)?.forecastDate ?? null;
    const end = data.segmentRisk.find((r) => r.horizonDay === effectiveHorizon)?.forecastDate ?? start;
    if (!start) return null;
    return { start, end };
  }, [data, effectiveHorizon]);

  const corridorOrder = useMemo(() => [...byExit].sort((a, b) => a.km - b.km), [byExit]);
  const riskPool = useMemo(
    () => byExit.filter((x) => x.hasData).map((x) => x.sumPredicted).sort((a, b) => a - b),
    [byExit],
  );
  /* How many exits change band between Today and the chosen horizon (testers IN-11: "the visual does not
     update with the data"). It does update: the totals and bar lengths are re-summed per horizon. But the
     bands are each exit's quarter AGAINST THE OTHERS, and the Spatial LSTM forecasts every exit almost flat
     day to day (Paso de Blas 12.7, 12.3, 12.3 ... a day), so a longer window scales every exit together
     and the order, and so the colours, barely move. Counting the moves says that in the card instead of
     leaving a static strip to read as a stuck one. */
  const bandMoves = useMemo(() => {
    if (!data || effectiveHorizon === 1) return null;
    const day1 = new Map<number, number>();
    for (const r of data.segmentRisk) if (r.horizonDay === 1 && r.hasData) day1.set(r.exitId, r.predictedIncidents);
    const pool1 = [...day1.values()].sort((a, b) => a - b);
    let moved = 0;
    for (const x of byExit) {
      const v1 = day1.get(x.exitId);
      if (!x.hasData || v1 == null) continue;
      if (riskBandFor(v1, pool1) !== riskBandFor(x.sumPredicted, riskPool)) moved++;
    }
    return moved;
  }, [data, effectiveHorizon, byExit, riskPool]);
  const rankedRows = useMemo(
    () => byExit.filter((x) => x.hasData).sort((a, b) => b.sumPredicted - a.sumPredicted),
    [byExit],
  );
  const noDataCount = byExit.length - rankedRows.length;

  const sigByExit = useMemo(() => {
    const map = new Map<number, GwrCoefficient[]>();
    if (!data) return map;
    for (const c of data.coefficients) {
      if (c.variable === "intercept" || !c.significant) continue;
      const arr = map.get(c.exitId) ?? [];
      arr.push(c);
      map.set(c.exitId, arr);
    }
    return map;
  }, [data]);

  const historyRank = useMemo(() => {
    const withHistory = byExit.filter((x) => x.historyEventCount != null) as (ExitRow & { historyEventCount: number })[];
    const sorted = [...withHistory].sort((a, b) => b.historyEventCount - a.historyEventCount);
    const map = new Map<number, number>();
    sorted.forEach((x, i) => map.set(x.exitId, i + 1));
    return map;
  }, [byExit]);

  const nlexExitFor = (exitName: string) =>
    nlexExits.find((e) => e.exit_name.toLowerCase().trim() === exitName.toLowerCase().trim());

  const accessOf = (exitName: string, dir: "NB" | "SB"): string | null => {
    const match = nlexExitFor(exitName);
    if (!match) return null;
    if (match.node_type === "toll-barrier") return "Toll barrier, through traffic only";
    return accessLabel(match, dir) ?? "No access";
  };

  // Raw entry/exit flags, with one override: a toll-barrier node (Bocaue
  // Barrier) has no interchange ramp in either direction by definition --
  // every one of its four entry/exit flags can read false -- but the
  // MAINLINE still runs through it both ways; it is not a dead end. Hatching
  // it out as "no ramp" the same way a true dead ramp would be is wrong (it
  // rendered as an unexplained solid block), so a barrier always has access;
  // only a genuine interchange's own flags decide the hatch.
  const hasAccess = (exitName: string, dir: "NB" | "SB"): boolean => {
    const m = nlexExitFor(exitName);
    if (!m) return true; // unmatched -- don't falsely hatch out an exit we can't check
    if (m.node_type === "toll-barrier") return true;
    return dir === "NB" ? m.nb_entry || m.nb_exit : m.sb_entry || m.sb_exit;
  };

  if (loading && data === null) {
    return (
      <article className="chart-card wide" style={{ height: "320px", padding: "20px", display: "grid", placeItems: "center" }}>
        <div style={{ color: "var(--text-muted)" }}>Loading corridor hotspot forecast…</div>
      </article>
    );
  }

  if (error || !data || data.segmentRisk.length === 0) {
    return (
      <article className="chart-card wide" style={{ height: "260px", padding: "20px", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", maxWidth: "420px" }}>
          <div style={{ fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}>Corridor hotspot forecast unavailable</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {error ?? "The spatial pipeline hasn't written its output yet — run train_incident_spatial_models.py --write-db."}
          </div>
        </div>
      </article>
    );
  }

  const lstmMeta = data.metadata?.spatial_lstm;
  const served = hotspotServed(lstmMeta);
  const gwrMeta = data.metadata?.gwr;

  // No default -- the drill-down only shows an exit once the reader clicks
  // one, rather than opening on the top hotspot by itself.
  const detailRow = corridorOrder.find((r) => r.exitId === selectedExitId) ?? null;
  const hoveredRow = corridorOrder.find((r) => r.exitId === hoveredExitId) ?? null;
  const detailRank = detailRow ? rankedRows.findIndex((r) => r.exitId === detailRow.exitId) : -1;
  const detailCoefs = detailRow ? sigByExit.get(detailRow.exitId) ?? [] : [];
  // The selected exit's own forecast, day by day over the window (the pop-up's small chart).
  const detailDays = detailRow
    ? data.segmentRisk
        .filter((r) => r.exitId === detailRow.exitId && r.horizonDay <= effectiveHorizon)
        .sort((x, y) => x.horizonDay - y.horizonDay)
    : [];

  /* The hover rail is cleared when a dialog opens (19 Oct 2026, testers IN-11: "hover stays stuck"). The
     dialog covers the strip under a still pointer, so no mouseleave ever reached the exit that was hovered,
     and the rail went on describing it after the dialog closed. */
  const openDrillDown = (exitId: number) => {
    setSelectedExitId(exitId);
    setHoveredExitId(null);
    setDrillDownOpen(true);
  };
  const clearHover = () => setHoveredExitId(null);

  const riskOf = (row: ExitRow) => (row.hasData ? RISK_META[riskBandFor(row.sumPredicted, riskPool)] : { label: "No data", color: NO_DATA_COLOR });

  const maxRanked = Math.max(...rankedRows.map((r) => r.sumPredicted), 1e-9);

  /* Layout from the user's reference (20 Nov 2026): a header with the horizon on the right, a summary strip (the
     window, the corridor's total, one computed insight), the corridor as two direction strips with the risk colour
     running along each, and the ranking as two side-by-side panels. Every figure is read off this response: the
     reference's "vs previous 7 days" change is left out (this payload carries no per-exit history for the days before
     the forecast), and the ranking is one list split 1-5 / 6-10, because the model forecasts one value per exit, not
     per direction, so a separate southbound and northbound ranking would be invented. */
  const corridorTotal = rankedRows.reduce((s, r) => s + r.sumPredicted, 0);
  const top5Share = corridorTotal > 0 ? (rankedRows.slice(0, 5).reduce((s, r) => s + r.sumPredicted, 0) / corridorTotal) * 100 : null;
  const highCount = rankedRows.filter((r) => riskBandFor(r.sumPredicted, riskPool) === "high").length;
  // The window by its length, not "next": the forecast starts the day after the last recorded one, which is past by
  // now when the data has not been refreshed (audit 20 Nov 2026). The dates sit beside it.
  const windowLabel = effectiveHorizon === 1 ? "Forecast day 1" : `${effectiveHorizon}-day forecast window`;
  const windowDates = horizonDateRange
    ? horizonDateRange.start === horizonDateRange.end
      ? fmtDateFull(horizonDateRange.start)
      : fmtDateRange(horizonDateRange.start, horizonDateRange.end)
    : null;
  const topRow = rankedRows[0] ?? null;
  const bandMovesText =
    bandMoves == null
      ? ""
      : bandMoves === 0
        ? ` Over ${effectiveHorizon} days the totals grow, but no exit changes colour from the first forecast day: the model forecasts each exit almost flat day to day.`
        : ` ${bandMoves} exit${bandMoves === 1 ? "" : "s"} change colour from the first forecast day over ${effectiveHorizon} days.`;

  const renderRankRow = (row: ExitRow, rank: number) => {
    const pct = maxRanked > 0 ? Math.max((row.sumPredicted / maxRanked) * 100, 2) : 0;
    const risk = riskOf(row);
    const isSelected = detailRow?.exitId === row.exitId;
    return (
      <button
        type="button"
        key={row.exitId}
        className={`hs-row${isSelected ? " is-on" : ""}${hoveredExitId === row.exitId ? " is-hover" : ""}`}
        style={{ ["--rc" as string]: risk.color }}
        onClick={() => openDrillDown(row.exitId)}
        onMouseEnter={() => setHoveredExitId(row.exitId)}
        onMouseLeave={() => setHoveredExitId((k) => (k === row.exitId ? null : k))}
      >
        <span className="hs-rank">{rank}</span>
        <span className="hs-name" title={`${displayExitName(row.exitName)}, Km ${fmtKm(row.km)} (${corridorKmFromPost(row.km)} from Balintawak)`}>
          {displayExitName(row.exitName)} <span className="hs-name-km">– Km {fmtKm(row.km, 0)}</span>
        </span>
        {/* The bar wears its exit's risk band, the colour that exit has on the strips (testers IN-11). */}
        <span className="hs-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${pct / 100})` }} />
        </span>
        <span className="hs-val" title={`${fmtNum(row.sumPredicted, 2)} expected incidents (exact)`}>{fmtInt(row.sumPredicted)}</span>
        <span className="hs-badge">{risk.label}</span>
      </button>
    );
  };

  const rankHead = (
    <div className="hs-row hs-row-head" aria-hidden="true">
      <span className="hs-rank">#</span>
      <span className="hs-name">Exit</span>
      <span />
      <span className="hs-val">{effectiveHorizon}d</span>
      <span className="hs-badge-head">Risk</span>
    </div>
  );

  const legend = (
    <div className="hs-legend">
      {RISK_BANDS.map((b) => (
        <span key={b.key}><i style={{ background: b.color }} />{b.label}</span>
      ))}
      <span><i style={{ background: NO_DATA_COLOR }} />No history{noDataCount > 0 ? ` (${noDataCount})` : ""}</span>
      <InfoTooltip text={`Each exit's colour is its quarter of this window's forecast against the other exits, recomputed per horizon, not a fixed threshold.${bandMovesText} The forecast gives one value per exit, not per direction, so an exit is the same colour on both strips; what differs is access: a hollow grey dot means no on/off ramp that way (Bocaue Barrier is southbound only).`} />
    </div>
  );

  // One direction: the risk colour runs along the road, blending from exit to exit, with a stop at each exit.
  // Exits are spaced evenly, not by true km (several sit under a km apart), as Live Corridor Status spaces them.
  const renderStrip = (dir: "NB" | "SB") => {
    const n = corridorOrder.length;
    const stops = corridorOrder.map((row, i) => `${riskOf(row).color} ${(((i + 0.5) / n) * 100).toFixed(2)}%`).join(", ");
    return (
      <div className="hs-dir">
        <div className="hs-dir-head">
          <span className={`hs-dir-chip is-${dir.toLowerCase()}`} aria-hidden="true">
            {dir === "SB" ? <ArrowLeft size={18} strokeWidth={2.4} /> : <ArrowRight size={18} strokeWidth={2.4} />}
          </span>
          <h4>{dir === "SB" ? "Southbound (SB) – to Metro Manila" : "Northbound (NB) – to Central Luzon"}</h4>
          {dir === "SB" && legend}
        </div>
        <div className="hs-track-wrap">
          <div className="hs-track" style={{ background: `linear-gradient(to right, ${stops})` }} />
          <div className="hs-stops" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {corridorOrder.map((row) => {
              const risk = riskOf(row);
              const ok = hasAccess(row.exitName, dir);
              const isSelected = detailRow?.exitId === row.exitId;
              return (
                <button
                  type="button"
                  key={`${dir}-${row.exitId}`}
                  className={`hs-stop${ok ? "" : " is-noramp"}${isSelected ? " is-on" : ""}${hoveredExitId === row.exitId ? " is-hover" : ""}`}
                  style={{ ["--rc" as string]: risk.color }}
                  onClick={() => openDrillDown(row.exitId)}
                  onMouseEnter={() => setHoveredExitId(row.exitId)}
                  onMouseLeave={() => setHoveredExitId((k) => (k === row.exitId ? null : k))}
                  aria-label={`${displayExitName(row.exitName)} ${dir}, Km ${fmtKm(row.km)}, ${ok ? `${risk.label}${risk.label !== "No data" ? " risk" : ""}` : "no ramp this direction"}`}
                >
                  <i className="hs-dot" />
                  <span className="hs-stop-km">Km {fmtKm(row.km, 0)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <article className="chart-card wide nct-card hs-card">
      <div className="nct-card-head-split">
        <div className="nc-head-main">
          <div className="nct-head-text">
            <h3 className="nct-title">
              Predicted Incident Hotspots
              <InfoTooltip
                text={
                  (served.isBaseline
                    ? `A per-exit forecast, held out in time — not an apportionment of the day-level forecast by historical share. The Spatial LSTM and simpler baselines were scored on rolling origins over the last 52 weeks; none of the models beat each exit's ${served.name.toLowerCase()}${served.lstmMae != null && served.mae != null ? ` (MAE ${served.mae.toFixed(3)} vs the Spatial LSTM's ${served.lstmMae.toFixed(3)})` : ""}, so that baseline is what this map shows.`
                    : "A genuine per-exit forecast from the Spatial LSTM (trained on each exit's own history plus its neighbors', held out in time) — not an apportionment of the day-level forecast by historical share. Day 1 is the real next-24h output; later days in a longer window are a recursive rollout, so treat them as a shape rather than a commitment.") +
                  " One value per exit per day: there are no hourly predictions. A model forecast, so the page's Range does not change it." +
                  (data.trainedAt ? ` Last trained ${new Date(data.trainedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.` : "")
                }
              />
            </h3>
          </div>
        </div>
        <div className="hs-horizon">
          <span className="hs-horizon-label">
            Forecast Horizon
            <InfoTooltip
              text={
                served.isBaseline
                  ? `Each day comes from the exit's ${served.name.toLowerCase()}, so a longer window adds those days up; the rolling test scored it up to 28 days ahead.`
                  : `Day 1 is the real next-24h forecast. Later days in a longer window are a recursive rollout — each day's own prediction feeds the next day's input${lstmMeta?.rollout_assumptions ? `, holding two inputs flat rather than forecasting them: ${lstmMeta.rollout_assumptions}` : ""}. The further from day 1, the more the rollout's own error compounds — treat a multi-day total as a shape, not a commitment.`
              }
            />
          </span>
          <div className="nct-pills" role="group" aria-label="Forecast horizon">
            {HORIZON_PRESETS.map((d) => {
              const disabled = d > availableDays;
              const active = effectiveHorizon === d;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  className={`nct-pill-btn${active ? " is-on" : ""}`}
                  onClick={() => { setHorizonDays(d); setHoveredExitId(null); }}
                  title={
                    disabled
                      ? `The pipeline has only published ${availableDays} future days so far`
                      : d === 1
                        ? `The first forecast day${horizonDateRange ? `, ${fmtDateFull(horizonDateRange.start)}` : ""}${served.isBaseline ? "" : " — the model's own next-day forecast, not a rollout day"}`
                        : undefined
                  }
                >
                  {d === 1 ? "1d" : `${d}d`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* The window, the corridor's total over it, and one computed insight. */}
      <div className="hs-summary">
        <div className="hs-sum-item">
          <span className="hs-sum-icon" aria-hidden="true"><CalendarDays size={22} strokeWidth={2} /></span>
          <span>
            <b className="hs-sum-value">{windowDates ?? "—"}</b>
            <span className="hs-sum-label">{windowLabel}</span>
          </span>
        </div>
        <div className="hs-sum-item">
          <span>
            <b className="hs-sum-value hs-sum-accent" title={`${fmtNum(corridorTotal, 2)} (exact)`}>{fmtInt(corridorTotal)}</b>
            <span className="hs-sum-label">expected incidents across {rankedRows.length} exits</span>
          </span>
        </div>
        {topRow && (
          <p className="hs-sum-insight">
            <Lightbulb size={20} strokeWidth={2} aria-hidden="true" />
            <span>
              <b>{displayExitName(topRow.exitName)}</b> leads with {fmtInt(topRow.sumPredicted)} expected
              {top5Share != null ? <>; the top 5 exits carry <b>{Math.round(top5Share)}%</b> of the corridor&apos;s total</> : null}
              {highCount > 0 ? <>, {highCount} in the High band</> : null}.
            </span>
          </p>
        )}
      </div>

      {/* The corridor, one strip per direction. Leaving the panel clears the hover line, which a fast pointer
          leaving through a gap could otherwise miss. */}
      <div className="hs-panel" onMouseLeave={clearHover}>
        <div className="hs-strips">
          {renderStrip("SB")}
          {renderStrip("NB")}
        </div>
        <p className="hs-readout" aria-live="polite">
          {hoveredRow ? (
            <>
              <b>{displayExitName(hoveredRow.exitName)}</b>
              <span className="hs-readout-dim">Km {fmtKm(hoveredRow.km)} ({corridorKmFromPost(hoveredRow.km)} from Balintawak)</span>
              <b style={{ color: riskOf(hoveredRow).color }}>{riskOf(hoveredRow).label}{riskOf(hoveredRow).label !== "No data" ? " risk" : ""}</b>
              {hoveredRow.hasData ? (
                <span title={`${fmtNum(hoveredRow.sumPredicted, 2)} (exact)`}>
                  {fmtInt(hoveredRow.sumPredicted)} expected {effectiveHorizon === 1 ? "on forecast day 1" : `over the ${effectiveHorizon}-day window`}
                  {hoveredRow.lastObserved != null ? ` · last observed day: ${fmtInt(hoveredRow.lastObserved)}` : ""}
                </span>
              ) : (
                <span className="hs-readout-dim">No incident history — forecast uninformative</span>
              )}
            </>
          ) : (
            <span className="hs-readout-dim">Point at an exit for its forecast; click it for the full detail.</span>
          )}
        </p>
      </div>

      {/* The ranking, one list in two panels (ranks 1-5 and 6-10); View All opens every ranked exit. */}
      <div className={`hs-ranks${rankedRows.length > INLINE_LIMIT ? "" : " is-single"}`} onMouseLeave={clearHover}>
        <section className="hs-panel">
          <div className="hs-panel-head">
            <span className="hs-dir-chip" aria-hidden="true"><Flame size={18} strokeWidth={2.2} /></span>
            <h4>
              Top Predicted Hotspots
              <InfoTooltip text="Each number is the exit's expected incidents — the model's statistical average, not a discrete tally — summed across the selected horizon's days and rounded. Hover a number for the exact figure; click a row for the exit's detail." />
            </h4>
            {rankedRows.length > INLINE_LIMIT && (
              <button type="button" className="hs-viewall" onClick={() => { setSeeMoreOpen(true); setHoveredExitId(null); }}>
                View All ({rankedRows.length})
              </button>
            )}
          </div>
          {rankHead}
          {rankedRows.slice(0, INLINE_LIMIT).map((row, i) => renderRankRow(row, i + 1))}
        </section>
        {rankedRows.length > INLINE_LIMIT && (
          <section className="hs-panel">
            <div className="hs-panel-head">
              <span className="hs-dir-chip is-quiet" aria-hidden="true"><ListOrdered size={18} strokeWidth={2.2} /></span>
              <h4>Next {Math.min(INLINE_LIMIT, rankedRows.length - INLINE_LIMIT)} Hotspots</h4>
            </div>
            {rankHead}
            {rankedRows.slice(INLINE_LIMIT, INLINE_LIMIT * 2).map((row, i) => renderRankRow(row, i + INLINE_LIMIT + 1))}
          </section>
        )}
      </div>

      <CorridorRiskNarrative
        gwr={
          gwrMeta
            ? {
                bandwidth: gwrMeta.bandwidth ?? null,
                mae: gwrMeta.metrics?.MAE ?? null,
                loocvMae: gwrMeta.metrics?.loocv_mae ?? null,
                loocvN: gwrMeta.metrics?.loocv_n ?? null,
                poissonDeviance: gwrMeta.metrics?.Poisson_Deviance ?? null,
                n: gwrMeta.metrics?.n ?? null,
                variables: (gwrMeta.variables ?? []).map((v) => VARIABLE_LABEL[v] ?? v),
                coefficients: data.coefficients.map((c) => ({
                  exitName: c.exitName, km: c.km ?? null, variable: VARIABLE_LABEL[c.variable] ?? c.variable,
                  coefficient: c.coefficient, tValue: c.tValue ?? null, significant: c.significant ?? null,
                })),
              }
            : null
        }
        spatialLstm={
          lstmMeta
            ? {
                mae: served.mae,
                servedModel: served.isBaseline ? served.name : null,
                lstmMae: served.lstmMae,
                poissonDeviance: lstmMeta.metrics?.Poisson_Deviance ?? null,
                n: lstmMeta.metrics?.n ?? null,
                epochs: lstmMeta.metrics?.epochs ?? null,
                seqLen: lstmMeta.seq_len ?? null,
                nNeighbors: lstmMeta.n_neighbors ?? null,
                // Always day 1, regardless of the Horizon toggle above: the
                // narrative's own prompt is fixed to "next 24 hours," so it
                // is fed exactly that, never a multi-day sum that would make
                // its wording describe the wrong window.
                forecastDate: day1Rows[0]?.forecastDate ?? null,
                topExits: day1Rows.map((s) => ({
                  exitName: s.exitName, km: s.km ?? null, rank: s.rank,
                  predictedIncidents: s.predictedIncidents, lastObservedCount: s.lastObservedCount ?? null,
                })),
              }
            : null
        }
        trainedAt={data.trainedAt}
      />

      {seeMoreOpen && typeof document !== "undefined" && createPortal(
        <div className="viz-incident hs-card">
        <div
          role="dialog" aria-modal="true" aria-label="All ranked exits" onClick={() => setSeeMoreOpen(false)}
          className="ds-modal-backdrop"
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)", maxHeight: "84vh", display: "flex", flexDirection: "column",
              background: "var(--bg-raised)", borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)",
              boxShadow: "var(--shadow-lg)", overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "18px 22px", borderBottom: "1px solid var(--border-default)" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>All exits, ranked</h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {rankedRows.length} exits · expected incidents, summed over the {effectiveHorizon}-day forecast window, rounded (hover a number for the exact figure)
                  {noDataCount > 0 ? ` · ${noDataCount} exit${noDataCount === 1 ? "" : "s"} with no history not ranked` : ""}
                </p>
              </div>
              <button
                onClick={() => setSeeMoreOpen(false)} aria-label="Close"
                style={{ flex: "none", width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center", fontSize: "1rem", lineHeight: 1 }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div style={{ overflowY: "auto", padding: "10px 22px 20px" }}>
              <div className="hs-modal-list" onMouseLeave={clearHover}>
                {rankHead}
                {rankedRows.map((row, i) => renderRankRow(row, i + 1))}
              </div>
            </div>
          </div>
        </div>
      </div>, document.body)}

      {/* Exit detail (20 Nov 2026, user: "improve the pop up"): the name with its risk, the road facts as chips, the
          window's figures as four even tiles, the exit's own forecast day by day (the totals are sums of these),
          and the reasons as an icon list. Same figures as before, from the same response. */}
      {drillDownOpen && detailRow && typeof document !== "undefined" && createPortal(
        <div className="viz-incident hs-card">
        <div
          role="dialog" aria-modal="true" aria-label={`${displayExitName(detailRow.exitName)} detail`} onClick={() => setDrillDownOpen(false)}
          className="ds-modal-backdrop"
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", padding: 24 }}
        >
          {(() => {
            const risk = riskOf(detailRow);
            const accessNB = accessOf(detailRow.exitName, "NB");
            const accessSB = accessOf(detailRow.exitName, "SB");
            const dayAvg = detailDays.length ? detailDays.reduce((s, d) => s + d.predictedIncidents, 0) / detailDays.length : null;
            const peakIdx = detailDays.reduce((best, d, i) => (d.predictedIncidents > detailDays[best].predictedIncidents ? i : best), 0);
            const lowIdx = detailDays.reduce((best, d, i) => (d.predictedIncidents < detailDays[best].predictedIncidents ? i : best), 0);
            /* A chart, not bare bars: a zero-based axis with values, the dates along the bottom, the window's average
               as a dashed line, the busiest day in the full risk colour, and a hover reading for every day. The bars
               were unlabelled and, for an exit forecast almost flat (Mexico 6-7.5 a day), read as one block. */
            const cssVar = (c: string) => {
              const m = /^var\((--[^),\s]+)/.exec(c);
              if (!m || typeof window === "undefined") return c;
              return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || T.accent;
            };
            const barInk = cssVar(risk.color);
            const n = detailDays.length;
            const dayOption: EChartsOption = {
              grid: { left: 34, right: 58, top: 16, bottom: 26 },
              xAxis: {
                type: "category",
                data: detailDays.map((d) => fmtDate(d.forecastDate)),
                axisTick: { show: false },
                axisLine: { lineStyle: { color: T.chartAxis } },
                axisLabel: { color: T.chartText, fontSize: 11, interval: n > 14 ? 6 : n > 7 ? 1 : 0 },
              },
              yAxis: {
                type: "value", min: 0, splitNumber: 3,
                axisLabel: { color: T.chartText, fontSize: 11 },
                splitLine: { lineStyle: { color: T.chartSplit } },
              },
              tooltip: {
                trigger: "axis",
                axisPointer: { type: "none" },
                backgroundColor: T.tooltipBg,
                borderColor: T.border,
                textStyle: { color: T.tooltipText },
                formatter: (params: unknown) => {
                  const i = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0;
                  const d = detailDays[i];
                  if (!d) return "";
                  const note = i === peakIdx ? " · busiest day" : i === lowIdx ? " · quietest day" : "";
                  return `<b>${fmtDateFull(d.forecastDate)}</b>${note}<br/>${fmtNum(d.predictedIncidents, 1)} expected incidents` +
                    (i === 0 && !served.isBaseline ? `<br/><span style="opacity:.75">The model's own next-day forecast</span>` : "");
                },
              },
              series: [{
                type: "bar",
                barMaxWidth: 30,
                data: detailDays.map((d, i) => ({
                  value: Number(d.predictedIncidents.toFixed(2)),
                  itemStyle: { color: i === peakIdx ? barInk : withAlpha(barInk, T.isDark ? 0.6 : 0.62), borderRadius: [4, 4, 0, 0] },
                })),
                emphasis: { focus: "self" },
                blur: { itemStyle: { opacity: 0.45 } },
                markLine: dayAvg == null ? undefined : {
                  silent: true, symbol: "none",
                  lineStyle: { type: "dashed", color: T.textMuted, width: 1.5 },
                  label: { position: "end", formatter: `avg ${fmtNum(dayAvg, 1)}`, color: T.textMuted, fontSize: 11 },
                  data: [{ yAxis: dayAvg }],
                },
              }],
            };
            return (
              <div className="hs-dd" onClick={(e) => e.stopPropagation()} style={{ ["--rc" as string]: risk.color }}>
                <header className="hs-dd-head">
                  <span className="hs-dd-icon" aria-hidden="true"><MapPin size={20} strokeWidth={2.2} /></span>
                  <div className="hs-dd-title">
                    <h3>
                      {displayExitName(detailRow.exitName)}
                      <span className="hs-badge">{risk.label}{risk.label !== "No data" ? " risk" : ""}</span>
                    </h3>
                    <p>Km {fmtKm(detailRow.km)} · {corridorKmFromPost(detailRow.km)} km from Balintawak</p>
                  </div>
                  <button type="button" className="hs-dd-close" onClick={() => setDrillDownOpen(false)} aria-label="Close">
                    <X size={16} aria-hidden="true" />
                  </button>
                </header>

                <div className="hs-dd-body">
                  {(accessNB || accessSB) && (
                    <div className="hs-dd-chips">
                      {accessNB === accessSB ? (
                        <span className="hs-dd-chip"><ArrowLeftRight size={14} aria-hidden="true" />{accessNB}</span>
                      ) : (
                        <>
                          <span className="hs-dd-chip"><ArrowRight size={14} aria-hidden="true" />NB: {accessNB}</span>
                          <span className="hs-dd-chip"><ArrowLeft size={14} aria-hidden="true" />SB: {accessSB}</span>
                        </>
                      )}
                    </div>
                  )}

                  <div className="hs-dd-stats">
                    <div className="hs-dd-stat">
                      <span className="hs-dd-k">
                        Expected · {effectiveHorizon === 1 ? "24h" : `${effectiveHorizon}d`}
                        <InfoTooltip text="Sum of each day's forecast over the window. Each day's number is a statistical expectation, not a whole-number tally, so the sum is rounded here; hover the number for the exact figure." />
                      </span>
                      <b title={detailRow.hasData ? `${fmtNum(detailRow.sumPredicted, 2)} (exact)` : undefined}>{detailRow.hasData ? fmtInt(detailRow.sumPredicted) : "—"}</b>
                      <small>{windowDates ?? "—"}</small>
                    </div>
                    <div className="hs-dd-stat">
                      <span className="hs-dd-k">Forecast day 1</span>
                      <b title={detailRow.day1Predicted != null ? `${fmtNum(detailRow.day1Predicted, 2)} (exact)` : undefined}>{detailRow.day1Predicted != null ? fmtInt(detailRow.day1Predicted) : "—"}</b>
                      <small>{horizonDateRange?.start ? fmtDateFull(horizonDateRange.start) : "—"}</small>
                    </div>
                    <div className="hs-dd-stat">
                      <span className="hs-dd-k">Last observed day</span>
                      <b>{detailRow.lastObserved != null ? fmtInt(detailRow.lastObserved) : "—"}</b>
                      <small>incidents logged</small>
                    </div>
                    <div className="hs-dd-stat">
                      <span className="hs-dd-k">Rank this window</span>
                      <b>{detailRank >= 0 ? `#${detailRank + 1}` : "—"}</b>
                      <small>of {rankedRows.length} exits</small>
                    </div>
                  </div>

                  {detailDays.length > 1 && (
                    <section className="hs-dd-section hs-dd-chart">
                      <div className="hs-dd-chart-head">
                        <h4>Expected incidents per day</h4>
                        <div className="hs-dd-facts">
                          <span><i className="is-peak" />Busiest <b>{fmtDate(detailDays[peakIdx].forecastDate)}</b> · {fmtNum(detailDays[peakIdx].predictedIncidents, 1)}</span>
                          <span>Quietest <b>{fmtDate(detailDays[lowIdx].forecastDate)}</b> · {fmtNum(detailDays[lowIdx].predictedIncidents, 1)}</span>
                          {dayAvg != null && <span><i className="is-avg" />Average <b>{fmtNum(dayAvg, 1)}</b></span>}
                        </div>
                      </div>
                      <DashboardChart option={dayOption} height={170} />
                    </section>
                  )}

                  {!detailRow.hasData && (
                    <p className="hs-dd-warn">
                      The model has no logged incident history at this exit — its forecast number is uninformative, not a sign the exit is actually safe.
                    </p>
                  )}

                  <section className="hs-dd-section">
                    <h4>Why this rating</h4>
                    <ul className="hs-dd-why">
                      {detailRow.historyEventCount != null && (
                        <li>
                          <span className="hs-dd-why-icon" aria-hidden="true"><History size={16} strokeWidth={2.2} /></span>
                          <span>
                            <b>{fmtInt(detailRow.historyEventCount)}</b> incidents logged here since records began
                            {historyRank.has(detailRow.exitId) ? <>, the <b>{ordinal(historyRank.get(detailRow.exitId)!)}</b> busiest of {historyRank.size} exits.</> : "."}
                          </span>
                        </li>
                      )}
                      {served.isBaseline && detailCoefs.length > 0 && (
                        <li>
                          <span className="hs-dd-why-icon" aria-hidden="true"><Network size={16} strokeWidth={2.2} /></span>
                          <span>The number is this exit&apos;s <b>{served.name.toLowerCase()}</b>, which beat the trained models in the rolling test.</span>
                        </li>
                      )}
                      {detailCoefs.length > 0 ? (
                        detailCoefs.map((c) => (
                          <li key={c.variable}>
                            <span className="hs-dd-why-icon" aria-hidden="true">
                              {c.coefficient > 0 ? <TrendingUp size={16} strokeWidth={2.2} /> : <TrendingDown size={16} strokeWidth={2.2} />}
                            </span>
                            <span>
                              <b>{VARIABLE_LABEL[c.variable] ?? c.variable}</b> is linked to {c.coefficient > 0 ? "more" : "fewer"} incidents at this exit ({c.coefficient > 0 ? "+" : ""}{fmtNum(c.coefficient, 2)}
                              in the GWR map, a separate descriptive fit{served.isBaseline ? ", not an input to the forecast shown" : ""}).
                            </span>
                          </li>
                        ))
                      ) : (
                        <li>
                          <span className="hs-dd-why-icon" aria-hidden="true"><Network size={16} strokeWidth={2.2} /></span>
                          <span>
                            {served.isBaseline
                              ? <>The number is this exit&apos;s <b>{served.name.toLowerCase()}</b>, which beat the trained models in the rolling test; no road trait stands out here in the GWR map.</>
                              : <>No single road trait stands out here in the GWR map: the forecast follows this exit&apos;s own incident history and its neighbours&apos; recent counts.</>}
                          </span>
                        </li>
                      )}
                    </ul>
                  </section>
                </div>
              </div>
            );
          })()}
        </div>
      </div>, document.body)}
    </article>
  );
}
