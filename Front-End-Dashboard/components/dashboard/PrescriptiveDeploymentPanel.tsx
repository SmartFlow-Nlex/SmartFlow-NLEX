"use client";

import { useEffect, useState } from "react";
import { solve } from "yalps";
import { fmtInt } from "./incidentPredictive.shared";
import { Gauge, Radar, Truck } from "lucide-react";
import { Shell, Empty, ActionCard } from "./prescriptiveShell";

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
    return <Empty kind={error ? "error" : "nodata"} msg={`Patrol deployment unavailable: ${error ?? "no Predicted Incidents Ranking data — check the Predictive tab's corridor card."}`} />;
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
    <label className="inc-slider">
      <span className="inc-slider-top">
        <span>{label}</span>
        <b>{value}{suffix}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );

  const unitWord = useKmView ? "segments" : "exits";
  // The staffed sites, busiest first: the order the table ranks them in.
  const staffedRows = displayRows.filter((r) => r.staffed);
  const reachesMost = coverageShare >= 0.8;
  const verdict = reachesMost
    ? "this fleet size/radius combination reaches most of the ranking's predicted risk."
    : "a larger fleet or wider radius would be needed to cover most of the ranking's predicted risk.";
  const spreadWide = alertRows.length > rows.length / 2;
  const modelName = predictive.corridorForecastModel ? `${predictive.corridorForecastModel} ` : "";

  return (
    <Shell
      title="Resource Staging & Patrol Repositioning"
      hint={hint}
      right={
        <div className="inc-controls">
          <div className="inc-seg" role="group" aria-label="Group by">
            {(["exit", "km"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                disabled={v === "km" && (predictive.kmSegmentForecast == null || predictive.kmSegmentForecast.length === 0)}
                aria-pressed={view === v}
                className={view === v ? "is-on" : ""}
              >
                {v === "exit" ? "By Exit" : "By Km"}
              </button>
            ))}
          </div>
          {slider("Fleet size", fleetSize, 1, Math.min(12, rows.length), 1, setFleetSize, " units")}
          {slider("Coverage radius", radiusKm, 1, 40, 1, setRadiusKm, " km")}
        </div>
      }
    >
      {/* The fleet disclaimer stays visible, beside the controls it qualifies. */}
      <p className="inc-caption" style={{ marginTop: -6 }}>
        Fleet size and radius are yours to set — nothing in the warehouse records NLEX&apos;s actual patrol fleet.
      </p>

      {/* The recommended action, as labelled rows; the reasoning behind Details. */}
      <ActionCard
        lead
        icon={Truck}
        title={`Stage units at ${staffedCount} ${unitWord}`}
        tag={<span className={`inc-pill${reachesMost ? " is-on" : ""}`}><i aria-hidden="true" />{reachesMost ? "Reaches most risk" : "Larger fleet or radius needed"}</span>}
        facts={[
          { label: "Action", value: "Pre-position patrol and tow-truck units" },
          {
            label: "Where",
            value: (
              <ol className="inc-sites">
                {staffedRows.map((r, i) => (
                  <li key={r.key}>
                    <em>{i + 1}</em>
                    <b>{r.label}</b>
                    <span>
                      Km {r.km} · {fmtInt(r.predictedIncidents)} predicted
                    </span>
                  </li>
                ))}
              </ol>
            ),
          },
          { label: "When", value: <>The <b>{predictive.corridorForecastDays}-day</b> forecast window</> },
          {
            label: "Effect",
            value: (
              <>
                <b>{(coverageShare * 100).toFixed(0)}%</b> of {fmtInt(totalWeight)} predicted incidents within {radiusKm} km ({fmtInt(coveredWeight)} covered)
              </>
            ),
          },
          { label: "Basis", value: <>Exact covering solve over the {modelName}{predictive.corridorForecastDays}-day ranking</> },
          { label: "Confidence", value: "Forecast apportioned by historical share, not modelled per site" },
        ]}
        details={
          <>
            <p style={{ margin: 0 }}>
              <strong>Recommended staging: {chosen.map((j) => rows[j].label).join(", ")}.</strong> Pre-position patrol
              and tow-truck units at these {staffedCount} {unitWord} — a {radiusKm}km radius from
              each covers <strong>{(coverageShare * 100).toFixed(0)}%</strong> of the ranking&apos;s{" "}
              {fmtInt(totalWeight)}-incident forecast ({fmtInt(coveredWeight)} of {fmtInt(totalWeight)}) — {verdict}
            </p>
            <p style={{ margin: "8px 0 0" }}>
              Method: a Maximal Covering Location Problem solved as an integer linear program (YALPS, branch-and-cut). Each candidate{" "}
              {useKmView ? "segment" : "exit"} covers every zone within the coverage radius, measured along the corridor (|km_i − km_j|),
              weighted by that zone&apos;s predicted incidents from the Predictive tab&apos;s ranking.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              Built from the {modelName}
              {predictive.corridorForecastDays}-day forecast, apportioned the same way as the ranking above. Fleet size and
              coverage radius are yours to set — nothing in the warehouse records NLEX&apos;s actual patrol fleet.
            </p>
          </>
        }
      />

      {/* Evidence: every candidate site, busiest first. */}
      <div className="inc-table-wrap">
        <table className="inc-table">
          <thead>
            <tr>
              <th>{useKmView ? "Segment" : "Exit"}</th>
              <th>Km</th>
              <th>Predicted incidents</th>
              <th>Rate /km</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} className={r.staffed ? "is-staffed" : undefined}>
                <td style={{ whiteSpace: "nowrap" }}>{r.label}</td>
                <td className="is-muted">{r.km}</td>
                <td style={{ fontWeight: 600 }}>{fmtInt(r.predictedIncidents)}</td>
                <td className="is-muted">{r.ratePerKm.toFixed(2)}</td>
                <td>{r.staffed ? <span className="inc-staffed">Staffed</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {displayRows.length > 8 && (
        <button onClick={() => setShowAll((v) => !v)} className="inc-ghost-btn">
          {showAll ? "Show the 8 busiest" : `Show all ${displayRows.length} ${useKmView ? "segments" : "exits"}`}
        </button>
      )}

      <div className="inc-actions-grid">
        <ActionCard
          icon={Radar}
          title="Hotspot monitoring alert"
          tag={spreadWide ? <span className="inc-pill">Risk spread wide</span> : undefined}
          facts={[
            { label: "Action", value: `Monitor these ${unitWord} closely` },
            { label: "Where", value: <><b>{alertRows.length}</b> of {rows.length} {unitWord}, listed below</> },
            { label: "When", value: <>The {predictive.corridorForecastDays}-day forecast window</> },
            { label: "Effect", value: <>Watches at least <b>80%</b> of predicted incidents</> },
            { label: "Basis", value: "80% cumulative cutoff, not a fixed top-N" },
          ]}
          details={
            <>
              {useKmView ? "Segments" : "Exits"} carrying at least 80% of the ranking&apos;s predicted incident total
              between them — same evidence-coverage cutoff used on the ranking cards above, not an arbitrary top-N.
              {spreadWide && (
                <> That takes {alertRows.length} of {rows.length} — risk here is spread across most of the corridor
                rather than concentrated in a handful of spots, so the cutoff genuinely needs this many.</>
              )}
            </>
          }
        >
          <div className="inc-list">
            <div className="inc-list-head">
              <span>{useKmView ? "Segment" : "Exit"}</span>
              <span>Predicted incidents</span>
            </div>
            <div className="ds-scroll-fade" style={{ display: "flex", flexDirection: "column", maxHeight: "220px", overflowY: "auto" }}>
              {alertRows.map((r) => (
                <div key={r.key} className="inc-list-row">
                  <span>{r.label}</span>
                  <b>{fmtInt(r.predictedIncidents)}</b>
                </div>
              ))}
            </div>
          </div>
        </ActionCard>

        <ActionCard
          icon={Gauge}
          title="Proactive speed advisory"
          facts={[
            { label: "Action", value: "Advise reduced speed here first" },
            {
              label: "Where",
              value: (
                <ol className="inc-sites">
                  {speedAdvisoryRows.map((r, i) => (
                    <li key={r.key}>
                      <em>{i + 1}</em>
                      <b>{r.label}</b>
                      <span>
                        {useKmView ? "" : `Km ${r.km} · `}{r.ratePerKm.toFixed(2)} incidents/km
                      </span>
                    </li>
                  ))}
                </ol>
              ),
            },
            { label: "When", value: "As rainfall rises" },
            ...(weatherRisk
              ? [
                  {
                    label: "Effect",
                    value: (
                      <div className="inc-rain-chips" aria-label="Probability of a corridor-wide high-incident day by rainfall">
                        {weatherRisk.scenarios.map((s) => (
                          <div key={s.rain_mm} className="inc-rain-chip">
                            <span>{s.rain_mm}mm rain</span>
                            <b>{(s.probability * 100).toFixed(1)}%</b>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                  { label: "Confidence", value: <>Weather-incident-risk model, <b>AUC {weatherRisk.auc?.toFixed(3) ?? "—"}</b></> },
                ]
              : []),
          ]}
          details={
            <>
              Top 3 hotspots by density (predicted incidents per km) — advise reduced speed here first as rainfall
              rises. The percentages below are the weather-incident-risk model&apos;s own probability of a
              corridor-wide high-incident day at each rainfall level{weatherRisk ? ` (AUC ${weatherRisk.auc?.toFixed(3) ?? "—"})` : ""}.
            </>
          }
        />
      </div>
    </Shell>
  );
}
