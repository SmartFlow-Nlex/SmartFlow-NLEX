"use client";

import { useEffect, useMemo, useState } from "react";
import { useThemeTokens } from "./useThemeTokens";
import InfoTooltip from "./InfoTooltip";
import CorridorRiskNarrative from "./CorridorRiskNarrative";
import { fmtInt, fmtNum } from "./incidentPredictive.shared";
import { useNlexExits, accessLabel, displayExitName } from "../../lib/nlex-exits";

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
  spatial_lstm?: { metrics: LstmMetrics; seq_len: number; n_neighbors: number; horizon_days?: number; rollout_assumptions?: string };
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

const fmtKm = (km: number) => km.toFixed(2).replace(/\.?0+$/, "");

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
  const T = useThemeTokens();
  const { exits: nlexExits } = useNlexExits();

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

  const corridorOrder = useMemo(() => [...byExit].sort((a, b) => a.km - b.km), [byExit]);
  const riskPool = useMemo(
    () => byExit.filter((x) => x.hasData).map((x) => x.sumPredicted).sort((a, b) => a - b),
    [byExit],
  );
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

  const accessSummaryFor = (exitName: string): string | null => {
    const match = nlexExitFor(exitName);
    if (!match) return null;
    if (match.node_type === "toll-barrier") return "Toll barrier — through-traffic only, no interchange access";
    const nb = accessLabel(match, "NB");
    const sb = accessLabel(match, "SB");
    return `NB: ${nb ?? "No access"} · SB: ${sb ?? "No access"}`;
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
  const gwrMeta = data.metadata?.gwr;
  const accentInk = T.isDark
    ? "color-mix(in srgb, var(--page-accent, #4f46e5) 36%, #ffffff)"
    : "color-mix(in srgb, var(--page-accent, #4f46e5) 72%, #0b1020)";

  // No default -- the drill-down only shows an exit once the reader clicks
  // one, rather than opening on the top hotspot by itself.
  const detailRow = corridorOrder.find((r) => r.exitId === selectedExitId) ?? null;
  const hoveredRow = corridorOrder.find((r) => r.exitId === hoveredExitId) ?? null;
  const detailRank = detailRow ? rankedRows.findIndex((r) => r.exitId === detailRow.exitId) : -1;
  const detailCoefs = detailRow ? sigByExit.get(detailRow.exitId) ?? [] : [];

  const openDrillDown = (exitId: number) => {
    setSelectedExitId(exitId);
    setDrillDownOpen(true);
  };

  const riskOf = (row: ExitRow) => (row.hasData ? RISK_META[riskBandFor(row.sumPredicted, riskPool)] : { label: "No data", color: NO_DATA_COLOR });

  const maxRanked = Math.max(...rankedRows.map((r) => r.sumPredicted), 1e-9);

  const renderHotspotRow = (row: ExitRow, rank: number) => {
    const pct = maxRanked > 0 ? Math.max((row.sumPredicted / maxRanked) * 100, 2) : 0;
    const risk = riskOf(row);
    const isSelected = detailRow?.exitId === row.exitId;
    return (
      <div
        key={row.exitId}
        onClick={() => openDrillDown(row.exitId)}
        onMouseEnter={() => setHoveredExitId(row.exitId)}
        onMouseLeave={() => setHoveredExitId((k) => (k === row.exitId ? null : k))}
        style={{
          display: "grid", gridTemplateColumns: "26px minmax(120px, 220px) 1fr 64px", columnGap: "10px",
          alignItems: "center", padding: "4px 8px", borderRadius: "8px", cursor: "pointer",
          background: isSelected ? "color-mix(in srgb, var(--page-accent, #4f46e5) 9%, transparent)" : hoveredExitId === row.exitId ? "color-mix(in srgb, var(--page-accent) 6%, transparent)" : "transparent",
        }}
      >
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textAlign: "right" }}>{rank}</span>
        <span title={`${displayExitName(row.exitName)} — Km ${fmtKm(row.km)}`} style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayExitName(row.exitName)} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>· Km {fmtKm(row.km)}</span>
        </span>
        <div style={{ height: 14, borderRadius: "999px", background: "var(--bg-surface-hover)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: "999px", background: "linear-gradient(90deg, color-mix(in srgb, var(--page-accent) 55%, transparent), var(--page-accent))", transition: "width 0.2s ease" }} />
        </div>
        <span style={{ justifySelf: "end", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
          <span title={`${fmtNum(row.sumPredicted, 2)} expected incidents (exact)`} style={{ fontSize: "0.76rem", fontWeight: 700, color: accentInk }}>{fmtInt(row.sumPredicted)}</span>
          <span style={{ fontSize: "0.6rem", fontWeight: 700, color: risk.color }}>{risk.label}</span>
        </span>
      </div>
    );
  };

  const inlineRanked = rankedRows.slice(0, INLINE_LIMIT);
  const restRanked = rankedRows.slice(INLINE_LIMIT);

  // One carriageway, built the same way InteractiveRoadMap.tsx (the Home
  // tab's "Live Corridor Status") builds its own: dark asphalt base, white
  // shoulder lines, equal-width columns (that component spaces exits evenly
  // on purpose -- several sit under a km apart, so a true-to-scale axis
  // piles labels at the Metro Manila end and leaves the rest empty -- see
  // its own "Exits are spaced evenly rather than by true km" comment), and
  // dashed lane dividers drawn OVER the colour so the road still reads as a
  // road under the forecast rather than a row of flat chips.
  //
  // Risk is color-mixed INTO the asphalt rather than painted as a flat
  // fill -- a tint on the tarmac, not a solid block -- and only the
  // selected exit gets an outline; nothing is enlarged.
  const ASPHALT = "#2c313a";
  const renderCarriageway = (dir: "NB" | "SB") => (
    <div style={{ position: "relative", height: "40px", overflow: "hidden", background: ASPHALT, borderRadius: dir === "SB" ? "10px 10px 0 0" : "0 0 10px 10px" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: "4px", height: "2px", background: "rgba(255,255,255,0.5)", zIndex: 3 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "4px", height: "2px", background: "rgba(255,255,255,0.5)", zIndex: 3 }} />

      <div style={{ position: "absolute", inset: "6px 0", display: "grid", gridTemplateColumns: `repeat(${corridorOrder.length}, minmax(0, 1fr))` }}>
        {corridorOrder.map((row) => {
          const risk = riskOf(row);
          const ok = hasAccess(row.exitName, dir);
          const isSelected = detailRow?.exitId === row.exitId;
          return (
            <button
              key={`${dir}-${row.exitId}`}
              onClick={() => openDrillDown(row.exitId)}
              onMouseEnter={() => setHoveredExitId(row.exitId)}
              onMouseLeave={() => setHoveredExitId((k) => (k === row.exitId ? null : k))}
              aria-label={`${displayExitName(row.exitName)} ${dir}, ${ok ? `${risk.label}${risk.label !== "No data" ? " risk" : ""}` : "no ramp this direction"}`}
              style={{
                position: "relative", border: "none", padding: 0, cursor: "pointer",
                background: ok
                  ? `color-mix(in srgb, ${risk.color} 58%, ${ASPHALT})`
                  : `repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 4px, transparent 4px, transparent 8px)`,
                boxShadow: isSelected ? "inset 0 0 0 2px #fff, inset 0 0 0 4px var(--page-accent, #4f46e5)" : "none",
                transition: "background 140ms ease",
              }}
            />
          );
        })}
      </div>

      {/* Lane dashes, above the tint -- two dividers, matching the live
          carriageway's own three-lane spacing scaled to this road's height. */}
      <div style={{ position: "absolute", inset: "6px 0", zIndex: 3, pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: "33%", height: "2px", background: "repeating-linear-gradient(to right, rgba(255,255,255,0.85) 0 14px, transparent 14px 30px)" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: "66%", height: "2px", background: "repeating-linear-gradient(to right, rgba(255,255,255,0.85) 0 14px, transparent 14px 30px)" }} />
      </div>
    </div>
  );

  return (
    <article className="chart-card wide" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: "1.05rem", color: "var(--text-primary)", fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
            Predicted Incident Hotspots
            <InfoTooltip text="A genuine per-exit forecast from the Spatial LSTM (trained on each exit's own history plus its neighbors', held out in time) — not an apportionment of the day-level forecast by historical share. Day 1 is the real next-24h output; later days in a longer window are a recursive rollout, so treat them as a shape rather than a commitment." />
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", margin: "4px 0 0 0" }}>
            Forecast where incidents are most likely to occur along NLEX.
            {data.trainedAt ? ` Last trained ${new Date(data.trainedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.` : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600, display: "flex", alignItems: "center" }}>
            Horizon
            <InfoTooltip
              text={`Day 1 is the real next-24h forecast. Later days in a longer window are a recursive rollout — each day's own prediction feeds the next day's input${lstmMeta?.rollout_assumptions ? `, holding two inputs flat rather than forecasting them: ${lstmMeta.rollout_assumptions}` : ""}. The further from day 1, the more the rollout's own error compounds — treat a multi-day total as a shape, not a commitment.`}
            />
          </span>
          <div style={{ display: "inline-flex", gap: "2px", padding: "3px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "999px" }}>
            {HORIZON_PRESETS.map((d) => {
              const disabled = d > availableDays;
              const active = effectiveHorizon === d;
              return (
                <button
                  key={d}
                  disabled={disabled}
                  onClick={() => setHorizonDays(d)}
                  title={disabled ? `The pipeline has only published ${availableDays} future days so far` : d === 1 ? "The real next-24h forecast — not a rollout day" : undefined}
                  style={{
                    padding: "4px 12px", borderRadius: "999px", border: "none", cursor: disabled ? "not-allowed" : "pointer",
                    background: active ? "var(--page-accent, #4f46e5)" : "transparent",
                    color: disabled ? "var(--text-muted)" : active ? "var(--text-on-dark)" : "var(--text-secondary)",
                    fontWeight: 600, fontSize: "0.72rem", opacity: disabled ? 0.5 : 1,
                  }}
                >
                  {d === 1 ? "Today" : `${d}d`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reserved info rail -- hover facts land here instead of in a floating
          tooltip. A tooltip positioned above its anchor got clipped by the
          scroll container's overflowY: hidden (needed so the corridor only
          scrolls sideways) whenever there wasn't enough room above it; the
          Home tab's Live Corridor Status solves the same problem the same
          way, with a reserved rail rather than a floating box. */}
      <div
        style={{
          minHeight: "46px", display: "flex", alignItems: "center", padding: "8px 12px",
          borderRadius: "10px", background: "var(--bg-surface-hover)", border: "1px solid var(--border-default)",
        }}
      >
        {hoveredRow ? (
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", fontSize: "0.78rem" }}>
            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
              {displayExitName(hoveredRow.exitName)} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>· Km {fmtKm(hoveredRow.km)}</span>
            </span>
            <span style={{ fontWeight: 800, color: riskOf(hoveredRow).color }}>
              {riskOf(hoveredRow).label}{riskOf(hoveredRow).label !== "No data" ? " risk" : ""}
            </span>
            {hoveredRow.hasData ? (
              <>
                <span title={`${fmtNum(hoveredRow.sumPredicted, 2)} (exact)`} style={{ color: "var(--text-secondary)" }}>
                  {fmtInt(hoveredRow.sumPredicted)} expected · next {effectiveHorizon}d
                </span>
                {hoveredRow.lastObserved != null && (
                  <span style={{ color: "var(--text-muted)" }}>Last observed day: {fmtInt(hoveredRow.lastObserved)}</span>
                )}
              </>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>No incident history — forecast uninformative</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Hover an exit for its forecast, or click for full details.
          </span>
        )}
      </div>

      {/* Corridor strip -- the hero, styled as the same divided highway as
          the Home tab's Live Corridor Status: southbound lane on top,
          northbound below, km markers in the median, exit names under the
          whole diagram. Exits ordered by true km position, columns aligned
          across all four rows so a given exit sits at the same x in each.

          The lanes are NOT two independent readings, unlike the live map's:
          the Spatial LSTM forecasts one risk value per EXIT, not per
          direction, so a given exit's two lane-blocks always share the same
          colour. What genuinely differs lane to lane is ACCESS -- Bocaue
          Barrier, for instance, really is southbound-only -- and that's
          real data (nb/sb entry/exit flags), not a fabricated split, so a
          hatched block marks "no ramp this way" rather than a risk colour. */}
      <div style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: "6px" }}>
        {/* 940px, the same track width Live Corridor Status scrolls its own
            20 exits at -- so this reads as the same corridor at the same
            scale, not a wider or narrower one. */}
        <div style={{ minWidth: "940px" }}>
          <p style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 0 7px 0", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-secondary)", justifyContent: "flex-end" }}>
            Southbound (SB) · to Metro Manila <span aria-hidden="true" style={{ fontSize: "1.25em", fontWeight: 800, color: "var(--page-accent, #4f46e5)" }}>←</span>
            <InfoTooltip text="The Spatial LSTM forecasts one risk value per exit, not per direction — a given exit's SB and NB lane blocks are always the same colour. Where the two lanes genuinely differ is access: a hatched block means this exit has no on/off ramp in that direction (e.g. Bocaue Barrier is southbound-only), which is real road structure, not a forecast." />
          </p>
          {renderCarriageway("SB")}

          {/* Median -- one set of km markers serving both lanes, same grid as
              the carriageways above and below it so a marker sits exactly
              under the stretch of road it names. */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${corridorOrder.length}, minmax(0, 1fr))`, background: "var(--bg-surface-hover)", borderLeft: "1px solid var(--border-default)", borderRight: "1px solid var(--border-default)" }}>
            {corridorOrder.map((row) => {
              const risk = riskOf(row);
              const isSelected = detailRow?.exitId === row.exitId;
              return (
                <button
                  key={`km-${row.exitId}`}
                  onClick={() => openDrillDown(row.exitId)}
                  onMouseEnter={() => setHoveredExitId(row.exitId)}
                  onMouseLeave={() => setHoveredExitId((k) => (k === row.exitId ? null : k))}
                  aria-label={`${displayExitName(row.exitName)}, Km ${fmtKm(row.km)}, ${risk.label}${risk.label !== "No data" ? " risk" : ""}`}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "1px", width: "100%",
                    position: "relative", background: "none", border: "none", cursor: "pointer", padding: "5px 0 6px",
                  }}
                >
                  <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, color: isSelected ? "var(--page-accent, #4f46e5)" : risk.color, transform: isSelected ? "scale(1.16)" : "none", transition: "color 150ms ease, transform 150ms ease" }}>
                    <svg width="19" height="19" viewBox="0 0 32 32" aria-hidden="true">
                      <polygon points="16,2 30,10 30,22 16,30 2,22 2,10" fill="var(--bg-surface)" stroke="currentColor" strokeWidth="3" />
                    </svg>
                  </span>
                  <span style={{ fontSize: "0.62rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isSelected ? "var(--text-primary)" : "var(--text-muted)" }}>{fmtKm(row.km)}</span>
                </button>
              );
            })}
          </div>

          {renderCarriageway("NB")}
          <p style={{ display: "flex", alignItems: "center", gap: "8px", margin: "7px 0 0 0", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-secondary)" }}>
            <span aria-hidden="true" style={{ fontSize: "1.25em", fontWeight: 800, color: "var(--page-accent, #4f46e5)" }}>→</span> Northbound (NB) · to Central Luzon
          </p>

          {/* Names under the whole diagram, shared by both lanes -- upright
              rather than angled, same as the live corridor, so twenty fit
              however long the names are without colliding. */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${corridorOrder.length}, minmax(0, 1fr))`, margin: "8px 0 0" }}>
            {corridorOrder.map((row) => {
              const isSelected = detailRow?.exitId === row.exitId;
              return (
                <div key={`lbl-${row.exitId}`} style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => openDrillDown(row.exitId)}
                    onMouseEnter={() => setHoveredExitId(row.exitId)}
                    onMouseLeave={() => setHoveredExitId((k) => (k === row.exitId ? null : k))}
                    style={{
                      writingMode: "vertical-rl", transform: "rotate(180deg)", height: "110px", padding: 0, border: "none", background: "none",
                      font: "inherit", fontSize: "0.7rem", fontWeight: isSelected ? 800 : 600,
                      color: isSelected ? "var(--page-accent, #4f46e5)" : "var(--text-secondary)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer",
                    }}
                  >
                    {displayExitName(row.exitName)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend -- rect swatches to match Live Corridor Status's own key,
          labeled as risk rather than reusing its Congested/Slow/Clear
          wording, which describes live traffic, not a forecast. */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", fontSize: "0.72rem", fontWeight: 600, color: "var(--text-secondary)" }}>
        <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>Predicted incident risk</span>
        {RISK_BANDS.map((b) => (
          <span key={b.key} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <i style={{ width: 15, height: 7, borderRadius: 2, background: b.color, display: "inline-block" }} />
            {b.label}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <i style={{ width: 15, height: 7, borderRadius: 2, background: NO_DATA_COLOR, display: "inline-block" }} />
          No history{noDataCount > 0 ? ` (${noDataCount})` : ""}
        </span>
        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>· quartiles of this window&apos;s forecast, recomputed per horizon — not fixed thresholds</span>
      </div>

      {/* Top predicted hotspots */}
      <div>
        <div style={{ display: "flex", alignItems: "center", fontSize: "0.68rem", fontWeight: 800, color: "var(--page-accent, #4f46e5)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "6px" }}>
          Top predicted hotspots
          <InfoTooltip text="Each number is the exit's expected incidents — the model's statistical average, not a discrete tally — summed across all the selected horizon's days and rounded for display. Hover a number for the exact figure." />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "26px minmax(120px, 220px) 1fr 64px", columnGap: "10px", padding: "0 8px 2px" }}>
          <span />
          <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Exit</span>
          <span />
          <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", textAlign: "right" }}>
            Expected, {effectiveHorizon}d
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          {inlineRanked.map((row, i) => renderHotspotRow(row, i + 1))}
        </div>
        {restRanked.length > 0 && (
          <button
            type="button"
            onClick={() => setSeeMoreOpen(true)}
            style={{
              marginTop: "10px", width: "100%", padding: "8px 12px", borderRadius: "8px",
              border: "1px dashed var(--border-default)", background: "var(--bg-surface-hover)",
              color: accentInk, fontWeight: 600, fontSize: "0.78rem", cursor: "pointer",
            }}
          >
            See {restRanked.length} more exit{restRanked.length === 1 ? "" : "s"}
          </button>
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
                mae: lstmMeta.metrics?.MAE ?? null,
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

      {seeMoreOpen && (
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
                  Ranks {INLINE_LIMIT + 1}–{rankedRows.length} of {rankedRows.length} · expected incidents, summed over the next {effectiveHorizon} day{effectiveHorizon === 1 ? "" : "s"}, rounded (hover a number for the exact figure)
                  {noDataCount > 0 ? ` · ${noDataCount} exit${noDataCount === 1 ? "" : "s"} with no history not ranked` : ""}
                </p>
              </div>
              <button
                onClick={() => setSeeMoreOpen(false)} aria-label="Close"
                style={{ flex: "none", width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center", fontSize: "1rem", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            <div style={{ overflowY: "auto", padding: "10px 22px 20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                {restRanked.map((row, i) => renderHotspotRow(row, i + INLINE_LIMIT + 1))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drill-down -- opens only on click (corridor segment, km marker,
          exit name, or a ranked-list row), replacing the panel that used to
          sit permanently open on the top hotspot. */}
      {drillDownOpen && detailRow && (
        <div
          role="dialog" aria-modal="true" aria-label={`${displayExitName(detailRow.exitName)} detail`} onClick={() => setDrillDownOpen(false)}
          className="ds-modal-backdrop"
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)", maxHeight: "84vh", display: "flex", flexDirection: "column",
              background: "var(--bg-raised)", borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)",
              boxShadow: "var(--shadow-lg)", overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "18px 22px", borderBottom: "1px solid var(--border-default)" }}>
              <div>
                <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Selected hotspot</div>
                <h3 style={{ margin: "2px 0 0 0", fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>{displayExitName(detailRow.exitName)}</h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Km {fmtKm(detailRow.km)}{accessSummaryFor(detailRow.exitName) ? ` · ${accessSummaryFor(detailRow.exitName)}` : ""}
                </p>
              </div>
              <button
                onClick={() => setDrillDownOpen(false)} aria-label="Close"
                style={{ flex: "none", width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center", fontSize: "1rem", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <div style={{ overflowY: "auto", padding: "16px 22px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span
                style={{
                  alignSelf: "flex-start", padding: "4px 12px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 800,
                  color: riskOf(detailRow).color,
                  background: `color-mix(in srgb, ${riskOf(detailRow).color} 14%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${riskOf(detailRow).color} 40%, transparent)`,
                }}
              >
                {riskOf(detailRow).label.toUpperCase()}{riskOf(detailRow).label !== "No data" ? " RISK" : ""}
              </span>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 150px", padding: "10px 12px", borderRadius: "10px", background: "var(--bg-surface-hover)", border: "1px solid var(--border-default)" }}>
                  <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "2px" }}>
                    Expected incidents · {effectiveHorizon}d
                    <InfoTooltip text="Sum of each day's forecast over the window. Each day's own number is a statistical expectation, not a whole-number tally, so the sum stays fractional even though it's not an average — rounded here for readability; hover the number for the exact figure." />
                  </div>
                  <div title={detailRow.hasData ? `${fmtNum(detailRow.sumPredicted, 2)} (exact)` : undefined} style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>{detailRow.hasData ? fmtInt(detailRow.sumPredicted) : "—"}</div>
                </div>
                <div style={{ flex: "1 1 150px", padding: "10px 12px", borderRadius: "10px", background: "var(--bg-surface-hover)", border: "1px solid var(--border-default)" }}>
                  <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Expected · next 24h</div>
                  <div title={detailRow.day1Predicted != null ? `${fmtNum(detailRow.day1Predicted, 2)} (exact)` : undefined} style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>{detailRow.day1Predicted != null ? fmtInt(detailRow.day1Predicted) : "—"}</div>
                </div>
                <div style={{ flex: "1 1 150px", padding: "10px 12px", borderRadius: "10px", background: "var(--bg-surface-hover)", border: "1px solid var(--border-default)" }}>
                  <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Last observed day</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>{detailRow.lastObserved != null ? fmtInt(detailRow.lastObserved) : "—"}</div>
                </div>
                <div style={{ flex: "1 1 150px", padding: "10px 12px", borderRadius: "10px", background: "var(--bg-surface-hover)", border: "1px solid var(--border-default)" }}>
                  <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Rank this window</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>{detailRank >= 0 ? `#${detailRank + 1} of ${rankedRows.length}` : "—"}</div>
                </div>
              </div>

              {!detailRow.hasData && (
                <div style={{ padding: "8px 12px", borderRadius: "8px", background: `color-mix(in srgb, ${NO_DATA_COLOR} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${NO_DATA_COLOR} 40%, transparent)`, fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  The model has no logged incident history at this exit — its forecast number is uninformative, not a sign the exit is actually safe.
                </div>
              )}

              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>Why is this exit flagged?</div>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                  {detailRow.historyEventCount != null && (
                    <li>
                      Logged <strong style={{ color: "var(--text-secondary)" }}>{fmtInt(detailRow.historyEventCount)}</strong> incidents at this exit since records began
                      {historyRank.has(detailRow.exitId) ? ` — ${ordinal(historyRank.get(detailRow.exitId)!)} busiest of ${historyRank.size} exits by lifetime count.` : "."}
                    </li>
                  )}
                  {detailCoefs.length > 0 ? (
                    detailCoefs.map((c) => (
                      <li key={c.variable}>
                        {VARIABLE_LABEL[c.variable] ?? c.variable} is locally significant here ({c.coefficient > 0 ? "+" : ""}{fmtNum(c.coefficient, 2)}) — {c.coefficient > 0 ? "higher values are associated with more incidents" : "higher values are associated with fewer incidents"} at this specific exit in the GWR fit.
                      </li>
                    ))
                  ) : (
                    <li>No locally significant structural factor for this exit in the GWR fit — its risk here tracks its own incident history and its neighbors&apos; recent counts (the Spatial LSTM&apos;s own inputs), not one measured corridor trait.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
