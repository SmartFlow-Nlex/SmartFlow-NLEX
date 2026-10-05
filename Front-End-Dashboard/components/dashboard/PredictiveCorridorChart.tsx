"use client";

import { useState } from "react";
import { X } from "lucide-react";
import InfoTooltip from "./InfoTooltip";
import StateNote from "../stage/StateNote";
import NarrativePanel from "./NarrativePanel";
import type { CorridorForecastPoint, KmSegmentForecastPoint } from "./incidentPredictive.shared";
import { fmtInt } from "./incidentPredictive.shared";

// Sequential ramp (amber, light -> dark) for a magnitude job: each bar's
// shade tracks its own rank so the highest-risk segments read heavier at a
// glance, without a legend — the axis labels already name every category, and
// a single-series bar chart needs no legend box (see the dataviz skill: a
// legend is for telling series apart, and there is only one here).
//
// Amber because this ramp is Incident's, and only Incident's: its three
// consumers (the corridor ranking, SecondaryIncidentRiskPanel and
// PrescriptiveDeploymentPanel) all render on /dashboard/incident. It used to
// be indigo, which made every bar on the page the same colour as every other
// domain's — the page identity (Traffic blue / Incident amber / Emissions
// green) stopped at the tab strip and never reached the data.
//
// amber-600 rather than a paler step, for the reason the indigo version had a
// floor: validated against the card surface, the light end has to stay dark
// enough to read as a bar at all. amber-600 lands at 3.19:1 on white — better
// than the indigo-400 it replaces, which sat at 2.91:1 and was accepted only
// because the bars carry visible labels (they still do). The flat floor in
// shadeFor keeps even the smallest bar at least this dark rather than fading
// toward the surface.
const RAMP_LIGHT = { r: 217, g: 119, b: 6 }; // amber-600 -- the accessibility floor, see below
const RAMP_DARK = { r: 69, g: 26, b: 3 }; // amber-950 -- deepened from amber-900 for a wider visible range

// Exported so SecondaryIncidentRiskPanel's per-segment ranked bars can shade
// themselves the same way, rather than a second hand-tuned ramp that could
// silently drift from this one.
export function shadeFor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  // Square-root eased, not linear: these rankings are routinely long-tailed
  // (one segment can carry 30%+ of a corridor's forecast on its own), so a
  // linear map crowded every row past the top one or two into
  // indistinguishable near-identical shades -- three rows tying at 20% of
  // max used to render as literally the same colour. Easing stretches the
  // low-to-mid range across more of the ramp so intensity differences read
  // across the whole list, not just at the peak.
  const eased = Math.sqrt(clamped);
  // Floor at 0.15 (post-easing) so the smallest bar in a wide-range set
  // never reads as washed out — the ramp still tracks magnitude, just never
  // below this.
  const scaled = 0.15 + eased * 0.85;
  const r = Math.round(RAMP_LIGHT.r + (RAMP_DARK.r - RAMP_LIGHT.r) * scaled);
  const g = Math.round(RAMP_LIGHT.g + (RAMP_DARK.g - RAMP_LIGHT.g) * scaled);
  const b = Math.round(RAMP_LIGHT.b + (RAMP_DARK.b - RAMP_LIGHT.b) * scaled);
  return `rgb(${r}, ${g}, ${b})`;
}

// Night Corridor: the shade this card draws its ranked bars with. Same easing
// and floor as shadeFor above, but on the incident magnitude ramp
// (--inc-heat-lo -> --inc-heat-hi in app/styles/nc-incident.css), which is
// violet rather than amber -- amber now reads as the "slow" road state -- and
// is theme-aware: pale-to-deep on paper, dim-to-bright on the dark stage.
// shadeFor stays exported, unchanged, for the panels that still import it.
function barShade(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = 0.15 + Math.sqrt(clamped) * 0.85;
  return `color-mix(in oklab, var(--inc-heat-hi) ${(scaled * 100).toFixed(1)}%, var(--inc-heat-lo))`;
}

// Inline rows shown before the reader has to reach for "See more" — kept
// small enough that the card's height doesn't dominate the tab, with the
// full ranking still one click away rather than gone.
const INLINE_LIMIT = 5;
const TOP_TIER = 5;

type Props = {
  corridorForecast: CorridorForecastPoint[] | null;
  // Same apportionment as corridorForecast, grouped by fixed 5km corridor
  // segments instead of nearest exit -- this is the only grouping the card
  // renders now (see the doc comment on buildKmSegmentForecast for why
  // segments, not exits: the corridor's inter-exit gaps run up to ~11.6km,
  // and an exit-only view snaps every incident in that whole stretch to
  // whichever endpoint is nearest). corridorForecast is kept on the props
  // only as the loading/availability signal, in lockstep with this one.
  kmSegmentForecast: KmSegmentForecastPoint[] | null;
  unclassifiedLocationShare: number | null;
  forecastHorizon: number;
  // The chart's own Volume/Weather toggle state — the backend re-derives
  // corridorForecast's total from the corresponding volume-free/weather-free
  // series whenever either is off, so this card's number moves with the
  // toggles above it instead of always describing the full-feature forecast.
  showVolume: boolean;
  showWeather: boolean;
  // Pretty label of whichever model this was apportioned from -- always the
  // pipeline's champion (see incident.service.ts: corridorForecastModel is
  // never per-request), not whatever's toggled in the Models chips above.
  // Null only alongside a null corridorForecast.
  forecastModelLabel: string | null;
  loading: boolean;
};

// Mostly presentational — no fetch of its own for corridorForecast, which is
// part of the same /api/incident/predictive response PredictiveIncidentChart
// already fetches (Range/Weather/Volume/Weather-scoped the same way), lifted
// here via a callback prop so this card doesn't duplicate that network call.
export default function PredictiveCorridorChart({
  corridorForecast,
  kmSegmentForecast,
  unclassifiedLocationShare,
  forecastHorizon,
  showVolume,
  showWeather,
  forecastModelLabel,
  loading,
}: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [seeMoreOpen, setSeeMoreOpen] = useState(false);

  if (loading && corridorForecast === null) {
    return (
      <article className="chart-card wide inc-card" style={{ minHeight: "260px", justifyContent: "center" }}>
        <div className="inc-loading" role="status">Loading corridor breakdown…</div>
      </article>
    );
  }

  if (corridorForecast === null || corridorForecast.length === 0 || kmSegmentForecast == null || kmSegmentForecast.length === 0) {
    return (
      <article className="chart-card wide inc-card" style={{ minHeight: "260px", justifyContent: "center" }}>
        <StateNote kind="nodata" title="Corridor breakdown unavailable">
          No incidents in the current Range had a location that could be matched to a corridor segment.
        </StateNote>
      </article>
    );
  }

  type Row = { key: string; label: string; predictedIncidents: number; historicalShare: number; historicalCount: number };
  const rows: Row[] = kmSegmentForecast.map((x) => ({
    key: `seg-${x.segmentStart}`, label: x.label,
    predictedIncidents: x.predictedIncidents, historicalShare: x.historicalShare, historicalCount: x.historicalCount,
  }));
  const maxPredicted = Math.max(...rows.map((x) => x.predictedIncidents), 1);
  // Summed from the bars themselves rather than trusting totalPredictedNext7Days
  // to still match — that prop is summary.totalPredictedNext7Days, the fixed
  // full-horizon primary total, while these bars now reflect whatever
  // Volume/Weather/Future window was actually apportioned. Deriving the
  // caption's number from what's on screen means the two can never disagree.
  const displayedTotal = rows.reduce((s, x) => s + x.predictedIncidents, 0);

  // The headline this card is actually for: WHERE is the forecast
  // concentrated. Recomputed on every render from whatever the current
  // Range/Weather/Volume toggles produced, so it's never a stale finding
  // left over from a previous selection.
  const byValue = [...rows].sort((a, b) => b.predictedIncidents - a.predictedIncidents);
  const topRow = byValue[0];
  const topShare = topRow && displayedTotal > 0 ? topRow.predictedIncidents / displayedTotal : 0;
  const topN = Math.min(3, byValue.length);
  const topNShare =
    displayedTotal > 0 ? byValue.slice(0, topN).reduce((s, x) => s + x.predictedIncidents, 0) / displayedTotal : 0;

  // A leaderboard, ranked by value (busiest first) — the card's whole job is
  // "ranking," so with only one grouping left, this is the natural order.
  // Only the first INLINE_LIMIT rows show on the card itself; the rest sit
  // behind "See more" rather than crowding the card with a 19-segment list.
  const orderedRows = byValue;
  const inlineRows = orderedRows.slice(0, INLINE_LIMIT);
  const restRows = orderedRows.slice(INLINE_LIMIT);
  const topTierRows = inlineRows.slice(0, TOP_TIER);
  const remainingInlineRows = inlineRows.slice(TOP_TIER);
  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxPredicted * f));

  const renderRow = (row: Row, displayIndex: number, tier: "top" | "remaining") => {
    const pct = maxPredicted > 0 ? Math.max((row.predictedIncidents / maxPredicted) * 100, row.predictedIncidents > 0 ? 2 : 0) : 0;
    const isHighest = topRow != null && row.key === topRow.key;
    const isTop = tier === "top";
    return (
      <div
        key={row.key}
        onMouseEnter={() => setHoveredKey(row.key)}
        onMouseLeave={() => setHoveredKey((k) => (k === row.key ? null : k))}
        className={`inc-rank-grid inc-rank-row${isTop ? "" : " is-compact"}${hoveredKey === row.key ? " is-hover" : ""}`}
      >
        <span className="inc-rank-n">{displayIndex}</span>
        <span className="inc-rank-label" title={row.label}>
          {row.label}
        </span>
        <div className="inc-rank-track">
          <div className="inc-rank-bar">
            <div className="inc-rank-fill" style={{ width: `${pct}%`, background: barShade(row.predictedIncidents / maxPredicted) }} />
          </div>
          {isHighest && (
            <span className="inc-rank-flag" style={{ left: `${Math.min(pct, 88)}%` }}>
              Highest
            </span>
          )}
          {hoveredKey === row.key && (
            <div className="inc-rank-tip">
              <b>{row.label}</b>
              <div>{fmtInt(row.predictedIncidents)} predicted incidents · next {forecastHorizon}d</div>
              <span>
                Historical share: {(row.historicalShare * 100).toFixed(1)}% ({fmtInt(row.historicalCount)} logged)
              </span>
            </div>
          )}
        </div>
        <span className="inc-rank-val">{fmtInt(row.predictedIncidents)}</span>
      </div>
    );
  };

  const unclassifiedPct = unclassifiedLocationShare != null ? (unclassifiedLocationShare * 100).toFixed(1) : null;

  const badge = (label: string, on: boolean) => (
    <span className={`inc-pill${on ? " is-on" : ""}`}>
      <i aria-hidden="true" />
      {label}: {on ? "ON" : "OFF"}
    </span>
  );

  return (
    <article className="chart-card wide inc-card">
      <div className="inc-card-head">
        <div className="inc-card-titles">
          <h3 className="inc-card-title">
            Predicted Incidents Ranking
            <InfoTooltip text="Derived, not separately modeled: splits the total forecast above across fixed 5km corridor segments by each one's historical share of incidents — there's no per-segment trained model behind this chart. Always apportioned from the pipeline's champion model; follows the Volume/Weather toggles above, so switching either re-derives it from that selection's own forecast." />
          </h3>
        </div>
        {/* Which forecast this was apportioned from, pinned on the title row. */}
        <div className="inc-pills" title="Matches the Volume/Weather toggles on the forecast chart above">
          {forecastModelLabel && <span className="inc-pill">Model: {forecastModelLabel}</span>}
          {badge("Volume", showVolume)}
          {badge("Weather", showWeather)}
        </div>
      </div>

      {/* The answer: where the forecast is concentrated. */}
      {topRow && (
        <div>
          <p className="inc-answer">
            <span className="inc-answer-value">{fmtInt(topRow.predictedIncidents)}</span>
            <span className="inc-answer-label">
              predicted incidents on <b>{topRow.label}</b>, the leading stretch
            </span>
          </p>
          <dl className="inc-kv" style={{ marginTop: 12 }}>
            <div>
              <dt>Share of total</dt>
              <dd>
                <b>{(topShare * 100).toFixed(0)}%</b> <em>of {fmtInt(displayedTotal)}</em>
              </dd>
            </div>
            {topN > 1 && (
              <div>
                <dt>Top {topN} share</dt>
                <dd>
                  <b>{(topNShare * 100).toFixed(0)}%</b>
                </dd>
              </div>
            )}
            {topN > 1 && (
              <div>
                <dt>Read</dt>
                <dd>{topNShare >= 0.5 ? "Concentrated: a few stretches cover most" : "Spread wider than a few hotspots"}</dd>
              </div>
            )}
          </dl>
          <details className="nc-details">
            <summary>Details</summary>
            <p style={{ margin: 0 }}>
              The <strong>{topRow.label}</strong> stretch leads the corridor at <strong>{fmtInt(topRow.predictedIncidents)}</strong> predicted
              incidents — <strong>{(topShare * 100).toFixed(0)}%</strong> of the {fmtInt(displayedTotal)}-incident total on its own.
              {topN > 1 && (
                <>
                  {" "}
                  The top {topN} segments together account for <strong>{(topNShare * 100).toFixed(0)}%</strong> of the whole corridor&apos;s forecast —{" "}
                  {topNShare >= 0.5
                    ? "response resources concentrated at just a few stretches would cover most of what's expected"
                    : "risk is spread wider than a handful of hotspots"}.
                </>
              )}
            </p>
          </details>
        </div>
      )}
      {unclassifiedPct != null && Number(unclassifiedPct) > 0 && (
        <p className="inc-caption">
          {unclassifiedPct}% of logged locations matched no segment and are excluded from the split.
        </p>
      )}

      <div style={{ width: "100%" }}>
        <div className="inc-rank-head">
          <div>
            <p className="inc-subhead">Segment forecast ranking</p>
            <p className="inc-caption">Predicted incidents · next {forecastHorizon} days</p>
          </div>
          <div className="inc-rank-key">
            <span>
              <i aria-hidden="true" />
              stronger shade = more predicted
            </span>
            <span>Hover a row for its numbers</span>
          </div>
        </div>

        {topTierRows.length > 0 && (
          <>
            <p className="inc-rank-group">Top {topTierRows.length}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {topTierRows.map((row, i) => renderRow(row, i + 1, "top"))}
            </div>
          </>
        )}

        {remainingInlineRows.length > 0 && (
          <>
            <p className="inc-rank-group">Next {remainingInlineRows.length}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              {remainingInlineRows.map((row, i) => renderRow(row, i + TOP_TIER + 1, "remaining"))}
            </div>
          </>
        )}

        <div className="inc-rank-grid" style={{ marginTop: "6px", padding: "0 8px" }}>
          <span />
          <span />
          <div className="inc-rank-axis">
            {axisTicks.map((t, i) => (
              <span key={i}>{fmtInt(t)}</span>
            ))}
          </div>
          <span />
          {/* Centered under the whole row (rank + label + track + value). */}
          <div className="inc-rank-caption">Predicted incidents (next {forecastHorizon}d)</div>
        </div>

        {restRows.length > 0 && (
          <button type="button" className="inc-more" onClick={() => setSeeMoreOpen(true)}>
            See {restRows.length} more segment{restRows.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {/* Ranked rows are the AI's only input -- same read-only contract as
          the forecast chart's own Narrative Explanation. Sent as one
          shared ranking-narrative payload rather than the forecast-error
          shape model-narrative expects, since "predicted incidents per
          segment" isn't a candidate-model comparison. */}
      <NarrativePanel
        metrics={orderedRows.map((r) => ({ model: r.label }))}
        endpoint="/api/ai-insight/ranking-narrative"
        subjectKey={JSON.stringify(["corridor-ranking", showVolume, showWeather, forecastModelLabel, orderedRows.map((r) => [r.key, r.predictedIncidents])])}
        horizonDays={forecastHorizon}
        contextLine={`Predicted incidents across ${orderedRows.length} corridor segments, next ${forecastHorizon} days.`}
        buildBody={() => ({
          cardTitle: "Predicted Incidents Ranking",
          groupBy: "segment",
          metricLabel: "Predicted incidents",
          metricUnit: "count",
          metricDescription:
            `Apportionment of the corridor's ${fmtInt(displayedTotal)}-incident, ${forecastHorizon}-day forecast across fixed 5km segments by each one's historical share of incidents — derived, not a per-segment trained model.`,
          horizonDays: forecastHorizon,
          totalLabel: `${fmtInt(displayedTotal)} incidents over the next ${forecastHorizon} days`,
          rows: orderedRows.map((r) => ({
            label: r.label,
            value: r.predictedIncidents,
            sharePct: displayedTotal > 0 ? (r.predictedIncidents / displayedTotal) * 100 : null,
          })),
        })}
      />

      {seeMoreOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="All ranked segments"
          onClick={() => setSeeMoreOpen(false)}
          className="inc-dialog-backdrop"
        >
          <div onClick={(e) => e.stopPropagation()} className="inc-dialog">
            <div className="inc-dialog-head">
              <div>
                <h3>All segments, ranked</h3>
                <p>
                  Ranks {INLINE_LIMIT + 1}–{orderedRows.length} of {orderedRows.length} · predicted incidents, next {forecastHorizon}d
                </p>
              </div>
              <button onClick={() => setSeeMoreOpen(false)} aria-label="Close" className="inc-dialog-close">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="inc-dialog-body">
              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                {restRows.map((row, i) => renderRow(row, i + INLINE_LIMIT + 1, "remaining"))}
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
