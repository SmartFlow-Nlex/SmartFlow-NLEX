"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The seam between the three predictive modules and the sandbox.
 *
 * Picking a forecast day loads what the traffic, incident and emission models
 * each expect for it, and seeds the simulation's arrival rate from the volume
 * champion's prediction — so a scenario runs against a predicted Saturday rather
 * than against a flat annual average.
 *
 * The day is chosen in the page's top filter row (ForecastDayPicker), not here: the
 * fetch and the chosen day live in useScenarioForecast() so the page can own the
 * picker while this card only shows what the chosen day predicts. The picker runs
 * the full traffic/CO₂ horizon (3 months). The incident
 * model's horizon is shorter: days inside it carry a dot in the calendar, and
 * days past it show incident figures as "no forecast" — never a number borrowed
 * from another day. When the incident horizon grows, the dots follow.
 *
 * Deliberately compact. It sits above a simulation grid that is sized to the
 * viewport, so every row of height taken here is taken from the road the
 * operator is actually watching. The long explanation of what is and is not
 * seeded is behind a disclosure for the same reason.
 *
 * What it does NOT do is compare the simulation to the forecasts. The sim
 * reports CO2 in kg/min across a 280 m stretch; the emission model predicts
 * tonnes/day across the whole corridor. A delta between those would read as a
 * validated result while being arithmetic nonsense. The forecast is the
 * CONDITION the scenario starts from; the meaningful before/after is the
 * sandbox's own baseline against its own intervention.
 */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export type Scenario = {
  date: string;
  availableDates: string[];
  volume: {
    dailyVehicles: number | null;
    segmentSharePct: number | null;
    segmentName: string | null;
    peakHourInflow: number | null;
    /** Corridor-wide vehicles per hour (0-23) — the Traffic page's hourly drill-down for the same model. */
    hourly: (number | null)[] | null;
    /** `hourly` at the segment: the arrival rate the simulation runs at that hour. */
    hourlyInflow: (number | null)[] | null;
    clamped: boolean;
    model: string | null;
    wmape: number | null;
  };
  incidents: {
    covered: boolean;
    coverageEnd: string | null;
    predictedForDate: number | null;
    model: string | null;
    byExit: { exitName: string; km: number; perDay: number }[];
    horizonDays: number;
    /** Whole incidents per hour (0-23), corridor-wide — the Incident page's hourly drill-down for the same model. */
    hourly: number[] | null;
    hourlyModel: string | null;
  };
  emissions: { predictedTonnes: number | null; model: string | null; wmape: number | null };
  /** The fleet-mix model's forecast Class 1 / 2 / 3 shares (fractions) for this date; null outside its ~7-day horizon. */
  fleet: { c1: number; c2: number; c3: number; heavyShare: number; heavySurge: boolean; model: string | null } | null;
  notes: string[];
};

const fmt = (n: number | null | undefined, dp = 0) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * The hour a forecast is read at: the one chosen, otherwise the busiest hour of the chosen day (the same
 * default the hour control opens on).
 */
export function forecastHour(data: Scenario | null, hour: number | null): number | null {
  if (hour != null) return hour;
  const h = data?.volume.hourlyInflow;
  if (!h) return null;
  let best = -1;
  let at = 0;
  h.forEach((v, i) => {
    if (v != null && v > best) {
      best = v;
      at = i;
    }
  });
  return best >= 0 ? at : null;
}

/**
 * The arrival rate the forecast gives at one hour of the chosen day. Falls back to the day's peak-hour
 * figure only when the day has no hourly shape at all, never to another hour's number.
 */
export function forecastInflowAt(data: Scenario | null, hour: number | null): number | null {
  if (!data) return null;
  const hr = forecastHour(data, hour);
  const v = hr != null ? data.volume.hourlyInflow?.[hr] : null;
  return v ?? data.volume.peakHourInflow;
}

/** Whole incidents the forecast expects at one hour of the chosen day, or null when it forecasts none for it. */
export function forecastIncidentsAt(data: Scenario | null, hour: number | null): number | null {
  const hr = forecastHour(data, hour);
  const h = data?.incidents.hourly;
  return h && hr != null ? h[hr] ?? null : null;
}

const hhmm = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Fetches the forecast for the chosen day and holds which day that is, so the
 * page can put the day picker in its top filter row while ScenarioForecastPanel
 * shows the result. `selectDay` also forgets that a forecast was applied — a
 * different day is a different forecast.
 */
export function useScenarioForecast({
  onHotspot,
  onIncidentCoverage,
}: {
  /**
   * The exit the incident model rates most likely to need attention on the
   * chosen day. The sandbox opens there, so the forecast chooses the day and
   * the incident model chooses the place — which is what makes this a
   * prescriptive tool rather than a generic simulator.
   */
  onHotspot?: (exitName: string, km: number) => void;
  /** Whether the chosen day has an incident forecast, so the page never credits one it lacks. */
  onIncidentCoverage?: (covered: boolean) => void;
}) {
  const [data, setData] = useState<Scenario | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  const mounted = useRef(true);
  const reqId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const id = ++reqId.current;
    setBusy(true);
    setFailed(false);
    fetch(`${BACKEND}/api/ai-sandbox/scenario${date ? `?date=${date}` : ""}`)
      .then((r) => r.json())
      .then((j) => {
        if (!mounted.current || reqId.current !== id) return;
        if (j?.success) {
          const d = j.data as Scenario;
          setData(d);
          if (!date) setDate(d.date);
          onIncidentCoverage?.(d.incidents.covered);
          const top = d.incidents.byExit[0];
          if (top && onHotspot) onHotspot(top.exitName, top.km);
        } else setFailed(true);
      })
      .catch(() => {
        if (mounted.current && reqId.current === id) setFailed(true);
      })
      .finally(() => {
        if (mounted.current && reqId.current === id) setBusy(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const selectDay = (d: string) => {
    setDate(d);
    setApplied(null);
  };

  return { data, date, busy, failed, applied, setApplied, selectDay };
}

export type ScenarioForecast = ReturnType<typeof useScenarioForecast>;

export default function ScenarioForecastPanel({
  forecast,
  hour,
  following = false,
  onApplyInflow,
}: {
  forecast: ScenarioForecast;
  /** The hour of day the forecast is read at (the page's shared hour); null until it has one. */
  hour: number | null;
  /** Once loaded, the road keeps following the chosen day and hour, so the button says so instead of offering a reload. */
  following?: boolean;
  /** Hands the arrival rate for the chosen hour, and the day it came from, to the page. */
  onApplyInflow: (vehPerHour: number, forecastDate: string) => void;
}) {
  const { data, busy, failed, applied, setApplied } = forecast;
  const [showHelp, setShowHelp] = useState(false);

  if (failed && !data) return null;

  const v = data?.volume;
  const inc = data?.incidents;
  const isApplied = following || (applied != null && applied === data?.date);
  const hr = forecastHour(data, hour);
  const hourLabel = hr != null && v?.hourly ? hhmm(hr) : null;
  const inflowNow = forecastInflowAt(data, hour);
  const incidentsNow = forecastIncidentsAt(data, hour);
  const canApply = inflowNow != null && !busy && !isApplied;

  // The forecast horizon starts where observed data ends, so the dates on offer
  // sit in the past whenever ingestion has fallen behind. Saying so turns a
  // number that looks broken into a limitation the reader can weigh.
  const lastDay = data?.availableDates[data.availableDates.length - 1];

  // Days past the incident horizon carry traffic and CO₂ only. Dates are
  // zero-padded YYYY-MM-DD, so a string comparison orders them chronologically.
  const coverageEnd = inc?.coverageEnd ?? null;
  const hasPartial = coverageEnd != null && lastDay != null && lastDay > coverageEnd;

  return (
    <article className="sandbox-forecast">
      <div className="sandbox-forecast-head">
        <div className="sandbox-forecast-title">
          <h3>Simulate a Forecast Day</h3>
          <p>Starts the scenario from what the traffic, incident and emission models predict</p>
        </div>

        <button
          className={`sandbox-forecast-apply${isApplied ? " is-applied" : ""}`}
          onClick={() => {
            if (!data || inflowNow == null) return;
            onApplyInflow(inflowNow, data.date);
            setApplied(data.date);
          }}
          disabled={!canApply}
          title={isApplied && following ? "The road follows the forecast day and time chosen above" : undefined}
        >
          {busy ? "Loading…" : isApplied ? (following ? "✓ Following forecast" : "✓ Applied") : "Load into simulation"}
        </button>
      </div>

      {data && inc && (
        <>
          <div className="sandbox-forecast-tiles">
            <Tile
              k={hourLabel ? `Corridor volume · ${hourLabel}` : "Corridor volume"}
              v={`${fmt(hourLabel && hr != null ? v?.hourly?.[hr] : v?.dailyVehicles)} veh`}
              s={`${hourLabel ? `day ${fmt(v?.dailyVehicles)} veh · ` : ""}${v?.model ?? "—"}${v?.wmape != null ? ` · ${v.wmape.toFixed(1)}% WMAPE` : ""}`}
            />
            <Tile
              k={hourLabel ? `Segment inflow · ${hourLabel}` : "Segment inflow"}
              v={`${fmt(inflowNow)} veh/h`}
              s={
                v?.segmentName
                  ? `${v.segmentName} · ${v.segmentSharePct?.toFixed(1)}% of corridor`
                  : hourLabel
                    ? "this hour"
                    : "peak hour"
              }
              accent
            />
            <Tile
              k={inc.covered && incidentsNow != null && hr != null ? `Predicted incidents · ${hhmm(hr)}` : "Predicted incidents"}
              v={inc.covered ? (incidentsNow != null ? fmt(incidentsNow) : fmt(inc.predictedForDate, 1)) : "No forecast"}
              s={
                inc.covered
                  ? `${incidentsNow != null ? `day ${fmt(inc.predictedForDate, 1)} · ` : ""}corridor-wide · ${inc.model ?? "—"}`
                  : coverageEnd
                    ? `incident forecast runs to ${shortDay(coverageEnd)}`
                    : "incident forecast unavailable"
              }
            />
            <Tile
              k="Predicted CO₂"
              v={`${fmt(data.emissions.predictedTonnes, 1)} t`}
              s={`${data.emissions.model ?? "—"}${
                data.emissions.wmape != null ? ` · ${data.emissions.wmape.toFixed(1)}% WMAPE` : ""
              }`}
            />
          </div>

          <div className="sandbox-forecast-foot">
            {data.fleet && (
              <span>
                <b>Fleet mix:</b> Class 1 {(data.fleet.c1 * 100).toFixed(1)}% · Class 2 {(data.fleet.c2 * 100).toFixed(1)}% · Class 3{" "}
                {(data.fleet.c3 * 100).toFixed(1)}%{data.fleet.heavySurge ? " · heavy-vehicle surge day" : ""}
                {data.fleet.model ? ` · ${data.fleet.model}` : ""}
              </span>
            )}
            {inc.byExit.length > 0 && (
              <span>
                <b>Highest risk:</b>{" "}
                {inc.byExit
                  .slice(0, 3)
                  .map((e) => `${e.exitName} (${e.perDay.toFixed(1)}/day)`)
                  .join(", ")}
              </span>
            )}
            <button className="sandbox-forecast-help" onClick={() => setShowHelp((x) => !x)}>
              {showHelp ? "Hide detail" : "What gets loaded?"}
            </button>
          </div>

          {showHelp && (
            <div className="sandbox-forecast-foot" style={{ display: "block" }}>
              The <b>segment inflow</b> for the chosen hour is loaded into the simulation, on each
              carriageway the Carriageway control at the top shows, and the incidents forecast for
              that hour are placed on the road in focus. Both are the same hourly figures the Traffic
              and Incident tabs show for that day; change the day or the time and the road follows.
              Within a week of the last observation the fleet-mix forecast sets how many cars, buses
              and trucks arrive — its daily shares, shaped by the observed hour-to-hour pattern.
              The CO₂ figure is the condition forecast for the day. The simulation&apos;s own CO₂
              rate covers one short stretch and is not comparable to the corridor-wide tonnage.
              {lastDay && (
                <>
                  {" "}
                  Forecasts run from the end of observed data, which is why the horizon ends{" "}
                  {dayLabel(lastDay)}.
                </>
              )}
              {coverageEnd && hasPartial && (
                <>
                  {" "}
                  The incident model currently forecasts through {dayLabel(coverageEnd)}; later days
                  carry traffic and CO₂ forecasts only.
                </>
              )}
            </div>
          )}

          {data.notes.map((n, i) => (
            <p className="sandbox-forecast-note" key={i}>
              {n}
            </p>
          ))}
        </>
      )}
    </article>
  );
}

function Tile({ k, v, s, accent }: { k: string; v: string; s?: string; accent?: boolean }) {
  return (
    <div className={`sandbox-forecast-tile${accent ? " accent" : ""}`}>
      <div className="k">{k}</div>
      <div className="v" title={v}>
        {v}
      </div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}
