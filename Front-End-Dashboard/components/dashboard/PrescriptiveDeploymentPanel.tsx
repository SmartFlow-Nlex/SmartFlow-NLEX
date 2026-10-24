"use client";

import { useEffect, useState } from "react";
import { solve } from "yalps";
import { fmtInt } from "./incidentPredictive.shared";
import { Truck } from "lucide-react";
import { Shell, Empty, ActionCard } from "./prescriptiveShell";
// km arrives MEASURED (exits and segment midpoints); shown as the official km post.
import { fmtKm } from "../../lib/km-post";

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

/** An official km-post span, from measured ends: "Km 25–30". */
const kmSpan = (lo: number, hi: number) => (Math.abs(hi - lo) < 0.05 ? `Km ${fmtKm(lo)}` : `Km ${fmtKm(lo)}–${fmtKm(hi)}`);

/* Density is counted over the same fixed length of road everywhere: predicted incidents within 2.5 km either
   side of a site, per km of corridor in that window (19 Oct 2026, testers IN-13). It used to divide by the
   gap to the neighbouring exits, so two exits 0.6 km apart (the Bocaue pair) or a 0.4 km segment ranked
   hottest from the small denominator alone -- still used by the evidence table's "Per km" column below. */
const DENSITY_WINDOW_KM = 5;

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
/** km, lo and hi are MEASURED. An exit is a point (lo = hi = km); a segment spans lo to hi, km its middle. */
type Row = { key: string; label: string; km: number; lo: number; hi: number; predictedIncidents: number; ratePerKm: number };

/** Predicted incidents per km over the DENSITY_WINDOW_KM of corridor centred on `centre`. Segment totals are
    spread evenly along their length; the window is clipped to the corridor so an end site is not diluted. */
function windowDensity(centre: number, all: Row[], corridorLo: number, corridorHi: number): number {
  const lo = Math.max(centre - DENSITY_WINDOW_KM / 2, corridorLo);
  const hi = Math.min(centre + DENSITY_WINDOW_KM / 2, corridorHi);
  const len = hi - lo;
  if (len <= 0) return 0;
  let mass = 0;
  for (const r of all) {
    if (r.hi - r.lo < 1e-9) {
      if (r.km >= lo && r.km <= hi) mass += r.predictedIncidents;
    } else {
      mass += (r.predictedIncidents * Math.max(0, Math.min(hi, r.hi) - Math.max(lo, r.lo))) / (r.hi - r.lo);
    }
  }
  return mass / len;
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Cleared here, not just on success -- otherwise a retry after a control
    // change renders as a stale-refresh warning (the PREVIOUS attempt's
    // error) while it's still in flight, instead of "Updating…".
    setError(null);
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
    return () => {
      cancelled = true;
    };
  }, [months, from, to]);

  const hint =
    "A solution for the Predictive tab's own Predicted Incidents Ranking: an exact linear program (Maximal Covering Location solve) that recommends exactly where to pre-position patrol and tow-truck units — which exits or km segments to station them at — to cover as much predicted incident risk as possible, cutting response time during high-risk windows. Fleet size and coverage radius are yours to set — nothing in the warehouse records NLEX's actual patrol fleet.";

  if (loading && predictive === null) {
    return (
      <Shell title="Resource Staging & Patrol Repositioning" hint={hint}>
        <Empty msg="Loading patrol deployment…" />
      </Shell>
    );
  }

  const useKmView = view === "km" && predictive?.kmSegmentForecast != null && predictive.kmSegmentForecast.length > 0;
  const exitRows: Row[] = (predictive?.corridorForecast ?? [])
    .slice()
    .sort((a, b) => a.km - b.km)
    .map((x) => ({
      key: `exit-${x.exitId}`, label: x.exitName, km: x.km, lo: x.km, hi: x.km, predictedIncidents: x.predictedIncidents, ratePerKm: 0,
    }));
  const kmRows: Row[] = (predictive?.kmSegmentForecast ?? []).map((x) => ({
    key: `seg-${x.segmentStart}`, label: x.label, km: (x.segmentStart + x.segmentEnd) / 2, lo: x.segmentStart, hi: x.segmentEnd,
    predictedIncidents: x.predictedIncidents, ratePerKm: 0,
  }));
  const baseRows = useKmView ? kmRows : exitRows;
  const corridorLo = Math.min(...baseRows.map((r) => r.lo));
  const corridorHi = Math.max(...baseRows.map((r) => r.hi));
  const rows: Row[] = baseRows.map((r) => ({ ...r, ratePerKm: windowDensity(r.km, baseRows, corridorLo, corridorHi) }));
  /** Where a row is, as the operator reads it: an exit's post, or a segment's span of posts. */
  const placeOf = (r: Row) => kmSpan(r.lo, r.hi);

  // Only reachable with no successful load yet -- predictive === null -- or a
  // genuinely empty ranking, so there is nothing stale to fall back to; a
  // later refresh failure with data already loaded is handled below instead
  // of wiping the panel.
  if (!predictive || rows.length === 0) {
    return (
      <Shell title="Resource Staging & Patrol Repositioning" hint={hint}>
        <Empty kind={error ? "error" : "nodata"} msg={`Patrol deployment unavailable: ${error ?? "no Predicted Incidents Ranking data — check the Predictive tab's corridor card."}`} />
      </Shell>
    );
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
  const modelName = predictive.corridorForecastModel ? `${predictive.corridorForecastModel} ` : "";

  return (
    <Shell
      title="Resource Staging & Patrol Repositioning"
      hint={hint}
      updating={loading && !error}
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
      {error && (
        <div role="alert" style={{ fontSize: "0.78rem", color: "var(--color-warning)" }}>
          Couldn&apos;t refresh with the current Range ({error}) — showing the last loaded result.
        </div>
      )}
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
                      {placeOf(r)} · {fmtInt(r.predictedIncidents)} predicted
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
              <th>Km post</th>
              <th>Predicted incidents</th>
              <th title={`Predicted incidents per km over the ${DENSITY_WINDOW_KM} km centred on this site`}>Per km ({DENSITY_WINDOW_KM} km window)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} className={r.staffed ? "is-staffed" : undefined}>
                <td style={{ whiteSpace: "nowrap" }}>{r.label}</td>
                {/* Official km post (lib/km-post.ts); this printed the measured km raw before (19 Oct 2026, testers IN-5). */}
                <td className="is-muted" style={{ whiteSpace: "nowrap" }}>{placeOf(r).replace("Km ", "")}</td>
                <td style={{ fontWeight: 600 }}>{fmtInt(r.predictedIncidents)}</td>
                <td className="is-muted">{r.ratePerKm.toFixed(1)}</td>
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
    </Shell>
  );
}

