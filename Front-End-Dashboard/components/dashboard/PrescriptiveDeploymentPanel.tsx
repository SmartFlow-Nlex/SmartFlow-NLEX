"use client";

import { useEffect, useState } from "react";
import { solve } from "yalps";
import { fmtInt, fmtDateRange } from "./incidentPredictive.shared";
import { Gauge, Radar, Truck } from "lucide-react";
import { Shell, Empty, ActionCard } from "./prescriptiveShell";
// km arrives MEASURED (exits and segment midpoints); shown as the official km post.
import { fmtKm } from "../../lib/km-post";
import { cachedJson } from "../../lib/cached-json";

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
  /** The champion's daily forecast over the same horizon: which days the cards' "When" names. */
  forecastDays: { date: string; predicted: number }[];
};

// Mirrors PredictiveCorridorChart.tsx's own independent fetch of this same
// field — see that file's doc comment for why weather-incident-risk rides a
// separate small fetch rather than threading through the predictive response.
type WeatherIncidentRisk = {
  auc: number | null;
  base_rate: number;
  scenarios: { rain_mm: number; probability: number }[];
  /* What the same model says about its own inputs. Rain was the only scenario shown, under "As rainfall
     rises", while the model reports rain as not significant (p 0.39; 14.0% to 14.3% from 0 to 100 mm) and
     volume as its top driver. Read so the card can say which input actually moves the risk. */
  rainPValue?: number | null;
  rainSignificant?: boolean;
  topDriver?: { feature: string; effectSize: number } | null;
  volumeScenarios?: { volume: number; probability: number }[];
};

const fmtHour = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
/** An official km-post span, from measured ends: "Km 25–30". */
const kmSpan = (lo: number, hi: number) => (Math.abs(hi - lo) < 0.05 ? `Km ${fmtKm(lo)}` : `Km ${fmtKm(lo)}–${fmtKm(hi)}`);

/* The advisory's recommended speed. Nothing in the warehouse records a speed policy, so this is the posted
   NLEX limit, not a model output: 100 km/h for light vehicles, 80 km/h for trucks and buses, 60 km/h minimum.
   The advisory asks for the 60 km/h floor, the lowest speed it can ask for short of closing a lane. Confirm
   against current NLEX traffic operations policy before quoting it as one. */
const POSTED_LIGHT_KMH = 100;
const POSTED_HEAVY_KMH = 80;
const ADVISED_KMH = 60;

/* Density is counted over the same fixed length of road everywhere: predicted incidents within 2.5 km either
   side of a site, per km of corridor in that window (19 Oct 2026, testers IN-13). It used to divide by the
   gap to the neighbouring exits, so two exits 0.6 km apart (the Bocaue pair) or a 0.4 km segment ranked
   hottest from the small denominator alone, the artefact the 80% cutoff below already refuses to rank by. */
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
  const [weatherRisk, setWeatherRisk] = useState<WeatherIncidentRisk | null>(null);
  // Logged incidents per hour of day over the same Range (the Descriptive heatmap, summed over weekdays):
  // the advisory's hours. Corridor-wide; there is no per-site hourly record.
  const [hourTotals, setHourTotals] = useState<number[] | null>(null);
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
          forecastDays: ((json.data.daily ?? []) as { date: string; predicted: number | null; predictionType: string | null }[])
            .filter((d) => d.predictionType === "future" && d.predicted != null)
            .map((d) => ({ date: d.date, predicted: d.predicted as number })),
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
    /* The page's own analytics request, reused rather than repeated: the same URL the incident page builds
       (from and to for a custom range, else months; no weather or source filter, which the page adds only when
       one is set) through the same memo, so this rides on its fetch or its cached body. */
    const aqs = new URLSearchParams();
    if (from && to) {
      aqs.set("from", from);
      aqs.set("to", to);
    } else if (months) {
      aqs.set("months", months);
    }
    cachedJson<{ success: boolean; data?: { heatmap?: { hour: number; v: number }[] } }>(`${BACKEND}/api/incident/analytics?${aqs}`, 5 * 60_000)
      .then((json) => {
        if (cancelled || !json.success) return;
        const totals = Array<number>(24).fill(0);
        for (const r of json.data?.heatmap ?? []) if (r.hour >= 0 && r.hour < 24) totals[r.hour] += r.v;
        setHourTotals(totals.some((v) => v > 0) ? totals : null);
      })
      .catch(() => {
        // Supplementary as well: without it the advisory names its days but not its hours.
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
  // The three densest stretches, each at least one window from the others: the Bocaue pair 0.6 km apart is
  // one stretch to advise, not two of the three.
  const byRate = [...rows].sort((a, b) => b.ratePerKm - a.ratePerKm);
  const speedAdvisoryRows: Row[] = [];
  for (const r of byRate) {
    if (speedAdvisoryRows.length >= 3 || r.ratePerKm <= 0) break;
    if (speedAdvisoryRows.some((p) => Math.abs(p.km - r.km) < DENSITY_WINDOW_KM)) continue;
    speedAdvisoryRows.push(r);
  }
  const stretchOf = (r: Row) => kmSpan(Math.max(r.km - DENSITY_WINDOW_KM / 2, corridorLo), Math.min(r.km + DENSITY_WINDOW_KM / 2, corridorHi));
  const corridorDensity = totalWeight / Math.max(corridorHi - corridorLo, 1e-9);

  // When: the forecast's own busiest days, and the hours incidents cluster in over the same Range.
  const forecastDays = predictive.forecastDays;
  const horizonMean = forecastDays.length > 0 ? forecastDays.reduce((s, d) => s + d.predicted, 0) / forecastDays.length : null;
  const byPredictedDay = [...forecastDays].sort((a, b) => b.predicted - a.predicted);
  const busiestDay = byPredictedDay[0] ?? null;
  // The three highest, read in calendar order.
  const peakDays = byPredictedDay.slice(0, 3).sort((a, b) => (a.date < b.date ? -1 : 1));
  const windowDates = forecastDays.length > 0 ? fmtDateRange(forecastDays[0].date, forecastDays[forecastDays.length - 1].date) : null;
  const peakBlock = (() => {
    if (!hourTotals) return null;
    const all = hourTotals.reduce((s, v) => s + v, 0);
    let best = 0;
    for (let h = 1; h <= 21; h++) if (hourTotals[h] + hourTotals[h + 1] + hourTotals[h + 2] > hourTotals[best] + hourTotals[best + 1] + hourTotals[best + 2]) best = h;
    const share = all > 0 ? (hourTotals[best] + hourTotals[best + 1] + hourTotals[best + 2]) / all : 0;
    return { from: best, to: best + 3, share };
  })();
  // Which input moves the risk model, in its own words: rain only when its test says so.
  const rainMatters = weatherRisk?.rainSignificant === true;
  const volumeDrives = weatherRisk?.topDriver?.feature?.includes("volume") ?? false;
  const rainSpan = weatherRisk && weatherRisk.scenarios.length > 1
    ? { lo: weatherRisk.scenarios[0], hi: weatherRisk.scenarios[weatherRisk.scenarios.length - 1] }
    : null;

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
  /* The span between the southern- and northernmost alert, named by those two sites as well as their posts
     (19 Oct 2026, testers: nearest exit beside every bare km). In the By Km view a site is a segment whose
     label already names its two exits ("Marilao to CDV/PH Arena"), so the end exits are taken from it. */
  const alertSpan = (() => {
    if (alertRows.length === 0) return null;
    const south = alertRows.reduce((a, r) => (r.lo < a.lo ? r : a));
    const north = alertRows.reduce((a, r) => (r.hi > a.hi ? r : a));
    const southName = useKmView ? south.label.split(" to ")[0] : south.label;
    const northName = useKmView ? north.label.split(" to ").slice(-1)[0] : north.label;
    const span = kmSpan(south.lo, north.hi);
    return southName === northName ? `${span} (${southName})` : `${span}, ${southName} to ${northName}`;
  })();
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

      <div className="inc-actions-grid">
        <ActionCard
          icon={Radar}
          title="Hotspot monitoring alert"
          tag={spreadWide ? <span className="inc-pill">Risk spread wide</span> : undefined}
          facts={[
            { label: "Action", value: `Monitor these ${unitWord} closely` },
            {
              label: "Where",
              value: (
                <>
                  <b>{alertRows.length}</b> of {rows.length} {unitWord}
                  {alertSpan ? <>, between <b>{alertSpan}</b></> : null}, listed below with their km posts
                </>
              ),
            },
            {
              label: "When",
              value: windowDates ? (
                <>
                  <b>{windowDates}</b>, the {predictive.corridorForecastDays}-day forecast
                  {busiestDay && <> · busiest day {fmtDay(busiestDay.date)}</>}
                </>
              ) : (
                <>The {predictive.corridorForecastDays}-day forecast window</>
              ),
            },
            { label: "Effect", value: <>Watches <b>{totalWeight > 0 ? ((cumulative / totalWeight) * 100).toFixed(0) : "0"}%</b> of predicted incidents ({fmtInt(cumulative)} of {fmtInt(totalWeight)})</> },
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
              <span>{useKmView ? "Segment" : "Exit"} · km post</span>
              <span>Predicted · share</span>
            </div>
            <div className="ds-scroll-fade" style={{ display: "flex", flexDirection: "column", maxHeight: "220px", overflowY: "auto" }}>
              {alertRows.map((r) => (
                <div key={r.key} className="inc-list-row">
                  <span>
                    {r.label} <span style={{ color: "var(--text-muted)" }}>· {placeOf(r)}</span>
                  </span>
                  <b>
                    {fmtInt(r.predictedIncidents)}
                    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {totalWeight > 0 ? ((r.predictedIncidents / totalWeight) * 100).toFixed(1) : "0"}%</span>
                  </b>
                </div>
              ))}
            </div>
          </div>
        </ActionCard>

        {/* Enriched 19 Oct 2026 (testers IN-13: "add more detail"): each stretch by exit and official km post,
            the speed to ask for, the days and hours to ask for it, and which input the risk model says moves
            the risk. It said "As rainfall rises" before, beside chips that rose 14.0% to 14.3% over 0-100 mm
            from a model that reports rain as not significant. */}
        <ActionCard
          icon={Gauge}
          title={`Advise ${ADVISED_KMH} km/h on ${speedAdvisoryRows.length} stretch${speedAdvisoryRows.length === 1 ? "" : "es"}`}
          lede="The densest stretches of predicted incidents, on the days and hours the forecast and the log put the risk."
          facts={[
            {
              label: "Action",
              value: (
                <>
                  Signs and radio: <b>{ADVISED_KMH} km/h, all vehicles</b> on these stretches{" "}
                  <em>(posted {POSTED_LIGHT_KMH} km/h light vehicles, {POSTED_HEAVY_KMH} km/h trucks and buses)</em>
                </>
              ),
            },
            {
              label: "Where",
              value: (
                <ol className="inc-sites">
                  {speedAdvisoryRows.map((r, i) => (
                    <li key={r.key}>
                      <em>{i + 1}</em>
                      <b>{r.label}</b>
                      <span>
                        {placeOf(r)} · advise {stretchOf(r)} · {fmtInt(r.ratePerKm)} predicted per km in {predictive.corridorForecastDays} days
                        {corridorDensity > 0 ? ` (${(r.ratePerKm / corridorDensity).toFixed(1)}× the corridor)` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              ),
            },
            {
              label: "When",
              value: (
                <>
                  {peakDays.length > 0 ? (
                    <>
                      Highest forecast days{" "}
                      {peakDays.map((d, i) => (
                        <span key={d.date}>
                          {i > 0 ? ", " : ""}
                          <b>{fmtDay(d.date)}</b> ({fmtInt(d.predicted)} predicted
                          {horizonMean ? `, ${d.predicted >= horizonMean ? "+" : ""}${(((d.predicted - horizonMean) / horizonMean) * 100).toFixed(0)}% on the window's mean` : ""})
                        </span>
                      ))}
                    </>
                  ) : (
                    <>Across the {predictive.corridorForecastDays}-day forecast</>
                  )}
                  {peakBlock && (
                    <>
                      {" "}· busiest hours <b>{fmtHour(peakBlock.from)} – {fmtHour(peakBlock.to % 24)}</b> ({(peakBlock.share * 100).toFixed(0)}% of
                      logged incidents, corridor-wide)
                    </>
                  )}
                </>
              ),
            },
            {
              label: "Trigger",
              value: !weatherRisk ? (
                "Risk-model context unavailable right now; advise on the days and hours above"
              ) : rainMatters ? (
                <>Rising rainfall: the risk model finds rain significant (p {weatherRisk.rainPValue?.toFixed(2) ?? "—"})</>
              ) : (
                <>
                  {volumeDrives ? <>Heavy-traffic days, the risk model&apos;s top driver. </> : null}
                  Rain alone barely moves it{weatherRisk.rainPValue != null ? <> (p {weatherRisk.rainPValue.toFixed(2)}, not significant)</> : null}
                  {rainSpan ? <>: {(rainSpan.lo.probability * 100).toFixed(1)}% at {rainSpan.lo.rain_mm} mm, {(rainSpan.hi.probability * 100).toFixed(1)}% at {rainSpan.hi.rain_mm} mm</> : null}
                </>
              ),
            },
            ...(weatherRisk
              ? [
                  {
                    label: "Effect",
                    value: (
                      <>
                        {volumeDrives && (weatherRisk.volumeScenarios?.length ?? 0) > 0 && (
                          <div className="inc-rain-chips" aria-label="Probability of a corridor-wide high-incident day by daily traffic volume">
                            {(weatherRisk.volumeScenarios ?? []).map((s) => (
                              <div key={s.volume} className="inc-rain-chip">
                                <span>{(s.volume / 1e6).toFixed(2)}M vehicles</span>
                                <b>{(s.probability * 100).toFixed(1)}%</b>
                              </div>
                            ))}
                          </div>
                        )}
                        <div
                          className="inc-rain-chips"
                          aria-label="Probability of a corridor-wide high-incident day by rainfall"
                          style={volumeDrives ? { marginTop: 6, opacity: 0.75 } : undefined}
                        >
                          {weatherRisk.scenarios.map((s) => (
                            <div key={s.rain_mm} className="inc-rain-chip">
                              <span>{s.rain_mm}mm rain</span>
                              <b>{(s.probability * 100).toFixed(1)}%</b>
                            </div>
                          ))}
                        </div>
                      </>
                    ),
                  },
                  {
                    label: "Confidence",
                    value: (
                      <>
                        Weather-incident-risk model, <b>AUC {weatherRisk.auc?.toFixed(3) ?? "—"}</b>: the chance of a corridor-wide
                        high-incident day, not of an incident on these stretches
                      </>
                    ),
                  },
                ]
              : []),
            {
              label: "Basis",
              value: (
                <>
                  Predicted incidents per km over the {DENSITY_WINDOW_KM} km centred on each site, from the {modelName}
                  {predictive.corridorForecastDays}-day ranking; stretches at least {DENSITY_WINDOW_KM} km apart
                </>
              ),
            },
          ]}
          details={
            <>
              <p style={{ margin: 0 }}>
                The three densest stretches of predicted incidents (per km, over the {DENSITY_WINDOW_KM} km of road centred on
                each {useKmView ? "segment" : "exit"}, from the same {modelName}{predictive.corridorForecastDays}-day ranking the
                staging plan above uses), at least {DENSITY_WINDOW_KM} km apart so one stretch is not advised twice. Density, not raw
                count, is deliberate: it is a different ranking from the Hotspot alert, which watches whichever locations carry the
                most predicted incidents however spread out they are. A fixed window replaced the gap to the neighbouring exits as
                the denominator, which ranked two exits 600 m apart hottest from the short gap alone.
              </p>
              <p style={{ margin: "8px 0 0" }}>
                {ADVISED_KMH} km/h is the expressway minimum, the lowest an advisory can ask for short of closing a lane; the posted
                limits are {POSTED_LIGHT_KMH} km/h for light vehicles and {POSTED_HEAVY_KMH} km/h for trucks and buses. These are the
                published limits, not a model output: nothing in the warehouse records a speed policy.
              </p>
              <p style={{ margin: "8px 0 0" }}>
                The days are the champion forecast&apos;s highest in the window; the hours are the busiest three-hour block of logged
                incidents over the selected Range, corridor-wide, since no per-location hourly record exists. The percentages are
                the weather-incident-risk model&apos;s own probability of a corridor-wide high-incident day
                {weatherRisk ? ` (AUC ${weatherRisk.auc?.toFixed(3) ?? "—"})` : ""} at each traffic volume and rainfall level.
                {weatherRisk && !rainMatters
                  ? " That model finds traffic volume, not rain, moves the risk, so the advisory is timed on busy days rather than on rainfall."
                  : weatherRisk
                    ? " Higher rainfall raises the probability; use it as the trigger for when to start advising."
                    : " That model is unavailable right now, so the advisory is timed on the forecast days and logged hours alone."}
              </p>
            </>
          }
        />
      </div>
    </Shell>
  );
}
