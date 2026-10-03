"use client";

import { useEffect, useState } from "react";
import { solve } from "yalps";
import { fmtInt } from "./incidentPredictive.shared";
import { Shell, Banner, Foot, Empty } from "./prescriptiveShell";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

// Built directly on top of the Predictive tab's own "Predicted Incidents
// Ranking" numbers, not a separately-modeled hotspot table — this panel's
// whole point is to be a solution FOR that ranking, so it reads the exact
// same corridorForecast/kmSegmentForecast /api/incident/predictive already
// returns (and PredictiveCorridorChart already renders) rather than an
// independent per-exit prediction that could show a different top corridor
// than what the user already saw. Mirrors incidentPredictive.shared.ts's
// CorridorForecastPoint/KmSegmentForecastPoint shapes; kept in sync by hand.
type CorridorForecastPoint = { exitId: number; exitName: string; km: number; predictedIncidents: number };
type KmSegmentForecastPoint = { segmentStart: number; segmentEnd: number; label: string; predictedIncidents: number };
type PredictiveSlice = {
  corridorForecast: CorridorForecastPoint[] | null;
  kmSegmentForecast: KmSegmentForecastPoint[] | null;
  corridorForecastModel: string | null;
  corridorForecastDays: number;
};

// Mirrors PredictiveCorridorChart.tsx's own independent fetch of this same
// field — see that file's doc comment for why weather-incident-risk rides a
// separate small fetch rather than threading through the predictive response.
type WeatherIncidentRisk = { auc: number | null; base_rate: number; scenarios: { rain_mm: number; probability: number }[] };

// The optimization: a Maximal Covering Location Problem (MCLP), a classic
// 0/1 integer linear program —
//   maximize   sum_i w_i * x_i
//   subject to sum_{j in N(i)} y_j >= x_i   for every demand zone i
//              sum_j y_j <= K
//              x_i, y_j in {0,1}
// where w_i is zone i's predicted-incidents weight (straight from the
// ranking above), y_j = 1 means a patrol unit is stationed at zone j,
// x_i = 1 means zone i ends up covered, K is the fleet size, and N(i) is the
// set of zones within `radiusKm` of zone i measured along the corridor
// (|km_i - km_j|, not straight-line distance — this is a roadway, not open
// terrain). Solved as an actual Mixed-Integer Linear Program — simplex on
// the LP relaxation plus branch-and-cut for the binary variables, via YALPS
// (https://github.com/IanManske/YALPS) — rather than enumerating every
// C(n, K) site combination by hand. Still exact (branch-and-cut proves
// optimality, it doesn't approximate it), but it's the solver doing linear
// programming now, not a bespoke search.
type Row = { key: string; label: string; km: number; predictedIncidents: number; ratePerKm: number };

function solveMclp(weights: number[], covers: number[][], k: number): { chosen: number[]; coveredWeight: number } {
  const n = weights.length;

  // One binary y_j per candidate site (staffed or not) and one binary x_i
  // per demand zone (covered or not) — the MCLP above, translated directly
  // into YALPS's { constraints, variables } form. "fleet" caps sum(y_j) at
  // K; each zone's own "cov{i}" constraint enforces x_i <= sum of y_j over
  // the sites that can reach it (covers[j] already lists, from radiusKm,
  // which zones site j reaches).
  const constraints: Record<string, { min?: number; max?: number }> = { fleet: { max: k } };
  for (let i = 0; i < n; i++) constraints[`cov${i}`] = { min: 0 };

  const variables: Record<string, Record<string, number>> = {};
  for (let j = 0; j < n; j++) {
    const coeffs: Record<string, number> = { fleet: 1 };
    for (const i of covers[j]) coeffs[`cov${i}`] = 1;
    variables[`y${j}`] = coeffs;
  }
  for (let i = 0; i < n; i++) variables[`x${i}`] = { coverage: weights[i], [`cov${i}`]: -1 };

  const solution = solve({ direction: "maximize", objective: "coverage", constraints, variables, binaries: true });
  const chosen = solution.variables.filter(([key, v]) => key[0] === "y" && v > 0.5).map(([key]) => Number(key.slice(1)));
  // solution.result IS the covered weight (x_i's objective coefficients are
  // exactly the zone weights) — only recomputed if the solver ever returns a
  // non-"optimal" status, so the UI never shows an impossible number.
  const coveredWeight =
    solution.status === "optimal"
      ? solution.result
      : Array.from(new Set(chosen.flatMap((j) => covers[j]))).reduce((s, i) => s + weights[i], 0);
  return { chosen, coveredWeight };
}

type Props = {
  // The Prescriptive tab's own Range control, threaded through the same way
  // PredictiveIncidentChart takes it — corridorForecast's apportionment
  // shares are computed from incidents within this window (verified: the
  // per-exit split shifts a few points between 3mo/12mo/all, even though the
  // published total forecast itself doesn't), so which exits this panel
  // recommends staffing genuinely can move with Range. Defaults to 12mo,
  // this panel's original fixed window, when unset.
  months?: "3" | "12" | "all";
  from?: string;
  to?: string;
};

export default function PrescriptiveDeploymentPanel({ months = "12", from, to }: Props) {
  const [view, setView] = useState<"exit" | "km">("exit");
  const [fleetSize, setFleetSize] = useState(4);
  const [radiusKm, setRadiusKm] = useState(8);
  const [predictive, setPredictive] = useState<PredictiveSlice | null>(null);
  const [weatherRisk, setWeatherRisk] = useState<WeatherIncidentRisk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams();
    if (months) qs.set("months", months);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`${BACKEND}/api/incident/predictive?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setPredictive({
          corridorForecast: json.data.corridorForecast,
          kmSegmentForecast: json.data.kmSegmentForecast,
          corridorForecastModel: json.data.corridorForecastModel,
          corridorForecastDays: json.data.corridorForecastDays,
        });
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the predicted-incidents ranking");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    fetch(`${BACKEND}/api/incident/weather-speed`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled || !json.success) return;
        const risk = json.data?.metadata?.weather_incident_risk as WeatherIncidentRisk | undefined;
        if (risk) setWeatherRisk(risk);
      })
      .catch(() => {
        // Supplementary — the deployment plan is the point of this card, so a
        // failed fetch here just omits the speed-advisory rain context.
      });
    return () => {
      cancelled = true;
    };
  }, [months, from, to]);

  const hint =
    "A solution for the Predictive tab's own Predicted Incidents Ranking: an exact linear program (Maximal Covering Location solve) that recommends exactly where to pre-position patrol and tow-truck units — which exits or km segments to station them at — to cover as much predicted incident risk as possible, cutting response time during high-risk windows. Fleet size and coverage radius are yours to set — nothing in the warehouse records NLEX's actual patrol fleet.";

  if (loading && predictive === null) return <Empty msg="Loading patrol deployment…" />;

  const useKmView = view === "km" && predictive?.kmSegmentForecast != null && predictive.kmSegmentForecast.length > 0;
  const exitRows: Row[] = (predictive?.corridorForecast ?? [])
    .slice()
    .sort((a, b) => a.km - b.km)
    .map((x, i, arr) => {
      const prevKm = i > 0 ? arr[i - 1].km : null;
      const nextKm = i < arr.length - 1 ? arr[i + 1].km : null;
      const widthKm =
        prevKm != null && nextKm != null ? (nextKm - prevKm) / 2 : prevKm != null ? x.km - prevKm : nextKm != null ? nextKm - x.km : null;
      return {
        key: `exit-${x.exitId}`, label: x.exitName, km: x.km, predictedIncidents: x.predictedIncidents,
        ratePerKm: widthKm && widthKm > 0 ? x.predictedIncidents / widthKm : x.predictedIncidents,
      };
    });
  const kmRows: Row[] = (predictive?.kmSegmentForecast ?? []).map((x) => ({
    key: `seg-${x.segmentStart}`, label: x.label, km: (x.segmentStart + x.segmentEnd) / 2, predictedIncidents: x.predictedIncidents,
    ratePerKm: x.predictedIncidents / Math.max(x.segmentEnd - x.segmentStart, 1e-9),
  }));
  const rows = useKmView ? kmRows : exitRows;

  if (error || !predictive || rows.length === 0) {
    return <Empty msg={`Patrol deployment unavailable: ${error ?? "no Predicted Incidents Ranking data — check the Predictive tab's corridor card."}`} />;
  }

  const clampedFleet = Math.max(1, Math.min(fleetSize, rows.length));
  const covers = rows.map((site) => rows.map((z, i) => ({ i, d: Math.abs(site.km - z.km) })).filter((x) => x.d <= radiusKm).map((x) => x.i));
  const weights = rows.map((r) => r.predictedIncidents);
  const { chosen, coveredWeight } = solveMclp(weights, covers, clampedFleet);
  const chosenSet = new Set(chosen);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const coverageShare = totalWeight > 0 ? coveredWeight / totalWeight : 0;
  const staffedCount = chosen.length;

  // Busiest-first for the table, same framing Booth Staffing Plan uses
  // ("show the N busiest"); `idx` keeps each row's position in `rows` so the
  // LP's own chosen-site indices still resolve correctly after sorting.
  const displayRows = rows
    .map((r, idx) => ({ ...r, idx, staffed: chosenSet.has(idx) }))
    .sort((a, b) => b.predictedIncidents - a.predictedIncidents);
  const visible = showAll ? displayRows : displayRows.slice(0, 8);

  // 80%-evidence-coverage cutoff, same rule the ranking/secondary-risk cards
  // use: rank by the SAME quantity being accumulated (predictedIncidents —
  // the LP's own weight), not by rate/km, since rate is width-normalized and
  // would rank a zone between two closely-spaced exits "hottest" purely from
  // a small denominator.
  const byPredicted = [...rows].sort((a, b) => b.predictedIncidents - a.predictedIncidents);
  let cumulative = 0;
  const alertRows: Row[] = [];
  for (const r of byPredicted) {
    if (cumulative >= totalWeight * 0.8) break;
    alertRows.push(r);
    cumulative += r.predictedIncidents;
  }
  const byRate = [...rows].sort((a, b) => b.ratePerKm - a.ratePerKm);
  const speedAdvisoryRows = byRate.slice(0, Math.min(3, byRate.length));

  const slider = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, suffix: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "150px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-secondary)" }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--page-accent, var(--action))" }} />
    </div>
  );

  return (
    <Shell
      title="Resource Staging & Patrol Repositioning"
      hint={hint}
      right={
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
          <div style={{ display: "inline-flex", gap: "2px", padding: "3px", background: "var(--bg-surface)", border: "1px solid var(--border-strong)", borderRadius: "999px" }}>
            {(["exit", "km"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                disabled={v === "km" && (predictive.kmSegmentForecast == null || predictive.kmSegmentForecast.length === 0)}
                style={{
                  padding: "4px 12px", borderRadius: "999px", border: "none", cursor: "pointer",
                  background: view === v ? "var(--action)" : "transparent",
                  color: view === v ? "var(--action-ink)" : "var(--text-secondary)",
                  fontWeight: 600, fontSize: "0.72rem", whiteSpace: "nowrap",
                }}
              >
                {v === "exit" ? "By Exit" : "By Km"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "16px" }}>
            {slider("Fleet size", fleetSize, 1, Math.min(12, rows.length), 1, setFleetSize, " units")}
            {slider("Coverage radius", radiusKm, 1, 40, 1, setRadiusKm, " km")}
          </div>
        </div>
      }
    >
      <Banner>
        <strong>Recommended staging: {chosen.map((j) => rows[j].label).join(", ")}.</strong> Pre-position patrol
        and tow-truck units at these {staffedCount} {useKmView ? "segments" : "exits"} — a {radiusKm}km radius from
        each covers <strong>{(coverageShare * 100).toFixed(0)}%</strong> of the ranking&apos;s{" "}
        {fmtInt(totalWeight)}-incident forecast ({fmtInt(coveredWeight)} of {fmtInt(totalWeight)}) —{" "}
        {coverageShare >= 0.8
          ? "this fleet size/radius combination reaches most of the ranking's predicted risk."
          : "a larger fleet or wider radius would be needed to cover most of the ranking's predicted risk."}
      </Banner>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)", borderBottom: "1px solid var(--border-default)" }}>
              <th style={{ padding: "6px 8px", fontWeight: 700 }}>{useKmView ? "Segment" : "Exit"}</th>
              <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>Km</th>
              <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>Predicted incidents</th>
              <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>Rate /km</th>
              <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.key}
                style={{
                  borderBottom: "1px solid var(--border-default)",
                  background: r.staffed ? "color-mix(in srgb, var(--page-accent, var(--action)) 7%, transparent)" : undefined,
                }}
              >
                <td style={{ padding: "6px 8px", fontWeight: r.staffed ? 700 : 600, whiteSpace: "nowrap" }}>{r.label}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{r.km}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmtInt(r.predictedIncidents)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{r.ratePerKm.toFixed(2)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>
                  {r.staffed ? (
                    <span style={{ fontWeight: 800, fontSize: "0.68rem", letterSpacing: "0.03em", color: "var(--page-accent, var(--action))" }}>● STAFFED</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {displayRows.length > 8 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          style={{
            alignSelf: "flex-start", border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-secondary)",
            borderRadius: 999, padding: "4px 12px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
          }}
        >
          {showAll ? "Show the 8 busiest" : `Show all ${displayRows.length} ${useKmView ? "segments" : "exits"}`}
        </button>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
        <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "12px" }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 700 }}>Hotspot monitoring alert</h4>
          <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", margin: "0 0 8px 0" }}>
            {useKmView ? "Segments" : "Exits"} carrying at least 80% of the ranking&apos;s predicted incident total
            between them — same evidence-coverage cutoff used on the ranking cards above, not an arbitrary top-N.
            {alertRows.length > rows.length / 2 && (
              <> That takes {alertRows.length} of {rows.length} — risk here is spread across most of the corridor
              rather than concentrated in a handful of spots, so the cutoff genuinely needs this many.</>
            )}
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600, padding: "0 0 3px 0" }}>
            <span>{useKmView ? "Segment" : "Exit"}</span>
            <span>Predicted incidents</span>
          </div>
          <div className="ds-scroll-fade" style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto" }}>
            {alertRows.map((r) => (
              <div key={r.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", padding: "3px 0", borderTop: "1px solid var(--border-default)" }}>
                <span style={{ color: "var(--text-primary)" }}>{r.label}</span>
                <span style={{ color: "var(--color-warning)", fontWeight: 700 }}>{fmtInt(r.predictedIncidents)}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "12px" }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 700 }}>Proactive speed advisory</h4>
          <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", margin: "0 0 8px 0" }}>
            Top 3 hotspots by density (predicted incidents per km) — advise reduced speed here first as rainfall
            rises. The percentages below are the weather-incident-risk model&apos;s own probability of a
            corridor-wide high-incident day at each rainfall level{weatherRisk ? ` (AUC ${weatherRisk.auc?.toFixed(3) ?? "—"})` : ""}.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {speedAdvisoryRows.map((r) => (
              <div key={r.key} style={{ fontSize: "0.78rem", padding: "3px 0", borderTop: "1px solid var(--border-default)" }}>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{r.label}</span>
                <span style={{ color: "var(--text-muted)" }}> — {useKmView ? "" : `Km ${r.km}, `}{r.ratePerKm.toFixed(2)} incidents/km</span>
              </div>
            ))}
          </div>
          {weatherRisk && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
              {weatherRisk.scenarios.map((s) => (
                <div key={s.rain_mm} style={{ padding: "4px 8px", borderRadius: "6px", background: "var(--bg-surface-hover)", border: "1px solid var(--border-default)", fontSize: "0.68rem" }}>
                  <div style={{ color: "var(--text-muted)" }}>{s.rain_mm}mm rain</div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{(s.probability * 100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Foot>
        Built from the {predictive.corridorForecastModel ? `${predictive.corridorForecastModel} ` : ""}
        {predictive.corridorForecastDays}-day forecast, apportioned the same way as the ranking above. Fleet size and
        coverage radius are yours to set — nothing in the warehouse records NLEX&apos;s actual patrol fleet.
      </Foot>
    </Shell>
  );
}
