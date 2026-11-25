"use client";

import { useEffect, useRef, useState } from "react";
import InfoTooltip from "./InfoTooltip";
import { Car, Gauge, Leaf, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

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
    /** Corridor-wide vehicles per hour (0-23) — the Traffic page's hourly drill-down for the same model. */
    hourly: (number | null)[] | null;
    /** The corridor's mean vehicles at each hour over every day in the record. */
    typicalHourly: number[] | null;
    /** `hourly` / `typicalHourly`: what each stretch's own recorded flow for the hour is multiplied by. */
    hourlyScale: (number | null)[] | null;
    /** The day's forecast total against the record's mean day, for a date with no hourly shape. */
    dayScale: number | null;
    model: string | null;
    wmape: number | null;
  };
  incidents: {
    covered: boolean;
    coverageEnd: string | null;
    predictedForDate: number | null;
    model: string | null;
    /** km is MEASURED (Balintawak = 12); print it through fmtKm. */
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
  const h = data?.volume.hourly;
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

/** What the forecast does to the road at one hour: the factor each stretch's recorded flow is multiplied by, and the
 *  two corridor figures it comes from (null when the date has no hourly shape and the day's factor is used). */
export type ForecastScale = { readonly factor: number; readonly corridorForecast: number | null; readonly corridorTypical: number | null };

/**
 * How busy the forecast says the corridor is at one hour of the chosen day against how busy it usually is at that
 * hour. The sandbox multiplies each stretch's own recorded flow, in each direction, by it. Falls back to the day's
 * factor only when the day has no hourly shape at all, never to another hour's number.
 */
export function forecastScaleAt(data: Scenario | null, hour: number | null): ForecastScale | null {
  if (!data) return null;
  const hr = forecastHour(data, hour);
  const v = data.volume;
  const factor = hr != null ? v.hourlyScale?.[hr] ?? null : null;
  if (factor != null && hr != null) return { factor, corridorForecast: v.hourly?.[hr] ?? null, corridorTypical: v.typicalHourly?.[hr] ?? null };
  return v.dayScale != null ? { factor: v.dayScale, corridorForecast: null, corridorTypical: null } : null;
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
  inflowHere = null,
  onApplyInflow,
  tab = "forecast",
  onTab,
  live = null,
  liveNote,
  liveAction = null,
}: {
  forecast: ScenarioForecast;
  /** The hour of day the forecast is read at (the page's shared hour); null until it has one. */
  hour: number | null;
  /** Once loaded, the road keeps following the chosen day and hour, so the button says so instead of offering a reload. */
  following?: boolean;
  /** What the forecast puts on the stretch and carriageway in focus at this hour (veh/h), and where that is; null when
   *  the stretch has no recorded flow to scale. Each stretch and direction gets its own, so the page works it out. */
  inflowHere?: { readonly vehPerHour: number; readonly where: string } | null;
  /** Tells the page to load the chosen day; the inflow itself is worked out per carriageway from the scale. */
  onApplyInflow: (forecastDate: string) => void;
  /** The deck's tab (24 Nov 2026 redesign): the model forecast, or the simulation's live readings passed in `live`. */
  tab?: "forecast" | "live";
  onTab?: (t: "forecast" | "live") => void;
  live?: ReactNode;
  /** The Live tab's "i" text, and its control on the right (the NB / SB toggle). */
  liveNote?: string;
  liveAction?: ReactNode;
}) {
  const { data, busy, failed, applied, setApplied } = forecast;

  if (failed && !data) return null;

  const v = data?.volume;
  const inc = data?.incidents;
  const isApplied = following || (applied != null && applied === data?.date);
  const hr = forecastHour(data, hour);
  const hourLabel = hr != null && v?.hourly ? hhmm(hr) : null;
  const scaleNow = forecastScaleAt(data, hour);
  const incidentsNow = forecastIncidentsAt(data, hour);
  const canApply = scaleNow != null && !busy && !isApplied;
  const scaleText = scaleNow ? `${scaleNow.factor.toFixed(2)} times a usual ${hourLabel ?? "day"}` : null;

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
        {/* Forecast = model output for the day; Live simulation = the engine's own readings. Kept apart so a forecast
            figure is never read as a simulated one. */}
        <div className="sandbox-deck-tabs" role="tablist" aria-label="Figures shown">
          <button type="button" role="tab" aria-selected={tab === "live"} className={tab === "live" ? "active" : ""} onClick={() => onTab?.("live")}>
            Live simulation
          </button>
          <button type="button" role="tab" aria-selected={tab === "forecast"} className={tab === "forecast" ? "active" : ""} onClick={() => onTab?.("forecast")}>
            Forecast
          </button>
        </div>
        <span className="sandbox-deck-note">
          {tab === "forecast" ? "Model forecast for the day" : "Simulation readings"}
          <InfoTooltip
            text={
              tab === "forecast"
                ? "What the traffic, incident and emission models predict for the day and hour chosen above. Load it to start the scenario from it. Hover a card for its model and test score."
                : liveNote ?? "Read live from the agent-based simulation of the stretch on screen, not from the models."
            }
          />
        </span>

        {tab === "live" && liveAction && <span className="sandbox-deck-action">{liveAction}</span>}
        {/* Loading the forecast belongs to the Forecast tab only. */}
        {tab === "forecast" && (
        <button
          className={`sandbox-forecast-apply${isApplied ? " is-applied" : ""}`}
          onClick={() => {
            if (!data || scaleNow == null) return;
            onApplyInflow(data.date);
            setApplied(data.date);
          }}
          disabled={!canApply}
          title={isApplied && following ? "The road follows the forecast day and time chosen above" : undefined}
        >
          {busy ? "Loading…" : isApplied ? (following ? "✓ Following forecast" : "✓ Applied") : "Load into simulation"}
        </button>
        )}
      </div>

      {tab === "live" && live}

      {tab === "forecast" && data && inc && (
        <>
          <div className="sandbox-forecast-tiles">
            <Tile
              icon={Car}
              info="Vehicles forecast to use the whole corridor in this hour; the line below is the day's total."
              k={hourLabel ? `Corridor volume · ${hourLabel}` : "Corridor volume"}
              v={`${fmt(hourLabel && hr != null ? v?.hourly?.[hr] : v?.dailyVehicles)} veh`}
              s={hourLabel ? `day ${fmt(v?.dailyVehicles)} veh` : undefined}
              hint={`${v?.model ?? "—"}${v?.wmape != null ? ` · ${v.wmape.toFixed(1)}% WMAPE` : ""}`}
            />
            <Tile
              icon={Gauge}
              info="Vehicles per hour the forecast puts on this stretch and carriageway: its own recorded flow for this hour times the forecast's factor."
              k={hourLabel ? `Inflow here · ${hourLabel}` : "Inflow here"}
              v={inflowHere ? `${fmt(inflowHere.vehPerHour)} veh/h` : scaleNow ? `${scaleNow.factor.toFixed(2)} times usual` : "—"}
              s={
                inflowHere
                  ? `${inflowHere.where}${scaleText ? ` · ${scaleText}` : ""}`
                  : scaleText
                    ? `${scaleText}; this stretch has no recorded flow to scale`
                    : "no forecast for this hour"
              }
            />
            <Tile
              icon={TriangleAlert}
              info="Incidents forecast on the whole corridor for this hour; the line below is the day's total."
              k={inc.covered && incidentsNow != null && hr != null ? `Predicted incidents · ${hhmm(hr)}` : "Predicted incidents"}
              v={inc.covered ? (incidentsNow != null ? fmt(incidentsNow) : fmt(inc.predictedForDate, 1)) : "No forecast"}
              s={
                inc.covered
                  ? `${incidentsNow != null ? `day ${fmt(inc.predictedForDate, 1)} · ` : ""}corridor-wide`
                  : coverageEnd
                    ? `incident forecast runs to ${shortDay(coverageEnd)}`
                    : "incident forecast unavailable"
              }
              hint={inc.covered ? inc.model ?? undefined : undefined}
            />
            <Tile
              icon={Leaf}
              info="CO₂ forecast for the whole corridor over the day, from forecast traffic and emission factors."
              k="Predicted CO₂"
              v={`${fmt(data.emissions.predictedTonnes, 1)} t`}
              s="for the day, corridor-wide"
              hint={`${data.emissions.model ?? "—"}${data.emissions.wmape != null ? ` · ${data.emissions.wmape.toFixed(1)}% WMAPE` : ""}`}
            />
          </div>

          <div className="sandbox-forecast-foot">
            {data.fleet && (
              <span>
                <b>Fleet mix:</b> Class 1 {(data.fleet.c1 * 100).toFixed(1)}% · Class 2 {(data.fleet.c2 * 100).toFixed(1)}% · Class 3{" "}
                {(data.fleet.c3 * 100).toFixed(1)}%{data.fleet.heavySurge ? " · heavy-vehicle surge day" : ""}
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
            {/* The how-it-loads explanation, cut to its points and kept behind the "i" (24 Nov 2026: a paragraph nobody read). */}
            <span className="sandbox-forecast-help">
              What gets loaded
              <InfoTooltip
                text={`Inflow: each stretch's recorded flow for this hour and direction × the forecast's "times a usual" factor. Incidents: the corridor forecast for the hour, shared out to this stretch and added as scenario events. Fleet mix: the forecast's daily shares, within a week of the last observation. CO₂: the day's corridor forecast; the simulation's own CO₂ rate covers one short stretch, so the two do not compare.${lastDay ? ` Forecasts run to ${dayLabel(lastDay)}.` : ""}${coverageEnd && hasPartial ? ` Incidents only to ${dayLabel(coverageEnd)}.` : ""}`}
              />
            </span>
          </div>

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

/** `hint`: the model and its test score, on hover rather than printed on the tile (24 Nov 2026, "not that overwhelming"). */
function Tile({ k, v, s, accent, hint, icon: Icon, info }: { k: string; v: string; s?: string; accent?: boolean; hint?: string; icon?: LucideIcon; info?: string }) {
  return (
    <div className={`sandbox-forecast-tile${accent ? " accent" : ""}`} title={hint ? `Model: ${hint}` : undefined}>
      {Icon && <span className="sandbox-forecast-icon" aria-hidden="true"><Icon size={20} strokeWidth={2} /></span>}
      <div className="sandbox-forecast-text">
        <div className="k">{k}{info && <InfoTooltip text={info} />}</div>
        <div className="v" title={v}>
          {v}
        </div>
        {s && <div className="s">{s}</div>}
      </div>
    </div>
  );
}
