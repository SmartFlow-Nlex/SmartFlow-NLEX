/* The run, as a CSV an operator or the manuscript can use.
 *
 * Every figure the sandbox produces lived only on screen: to put a result in a
 * report or compare two runs away from the machine, it had to be read off and
 * retyped. This writes what the run actually was — the stretch, the demand and
 * where it came from, each carriageway's readings, the interventions and
 * events in force, and the confidence run if one was done — in one file.
 *
 * It is a pure function returning text, kept out of page.tsx for the same
 * reason recommendation.ts is: so the cases it has to get right can be tested.
 *
 * Sectioned CSV rather than one flat table: a run is not one rectangle, and a
 * spreadsheet opens blank-line-separated blocks happily. Rows carry UNITS in
 * the field name, because a column of bare numbers is where a report starts
 * going wrong.
 */
import type { Metrics, RepStat, ReplicationResult } from "./simulation";

export type Direction = "NB" | "SB";

/** One carriageway's state at the moment of export. */
export type ExportDirection = {
  direction: Direction;
  laneCount: number;
  inflowVehPerHour: number;
  /** Where the inflow came from: forecast, record, interchange, operator, assumed. */
  inflowFrom: string;
  /** What the record gives for this stretch and hour, when it gives anything. */
  dataAnchor: number | null;
  metrics: Metrics | null;
  peakUnmetVehPerHour: number;
  closedLanes: readonly boolean[];
  speedLimitKmh: number | null;
  incidentCount: number;
  baselineAvgSpeedKmh: number | null;
  events: readonly ExportEvent[];
};

export type ExportEvent = {
  direction: Direction;
  name: string;
  family: string;
  /** Null before it starts and after it ends. */
  phase: string | null;
  positionKm: number;
  /** The stretch the operator gave, or null when the event is a point. */
  stretchKm: { readonly fromKm: number; readonly toKm: number } | null;
  lane: number | null;
  extraLanes: readonly number[];
  startS: number;
  durationS: number;
};

export type ExportRun = {
  exportedAt: Date;
  /** The simulated clock, as shown ("Wed, Jul 1" / "17:00:40"); null when no forecast day is loaded. */
  simDate: string | null;
  simTime: string | null;
  forecastDay: string | null;
  origin: string;
  destination: string;
  fromKm: number;
  toKm: number;
  view: string;
  simSpeed: number;
  directions: readonly ExportDirection[];
  /** Only for the carriageway a confidence run was done on. */
  replication: { direction: Direction; result: ReplicationResult } | null;
};

/** RFC 4180: quote anything with a comma, quote or newline, and double inner quotes. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (...vals: unknown[]) => vals.map(cell).join(",");
const round = (n: number | null | undefined, dp = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "" : Number(n.toFixed(dp));

/** Lanes are shown to the operator 1-based, so the export says L1, L3 — not 0, 2. */
const laneList = (closed: readonly boolean[]) =>
  closed.map((c, i) => (c ? `L${i + 1}` : null)).filter(Boolean).join(" ") || "none";

export function buildRunCsv(run: ExportRun): string {
  const out: string[] = [];

  out.push("SmartFlow NLEX — Scenario Sandbox run");
  out.push(row("field", "value"));
  out.push(row("exported at", run.exportedAt.toISOString()));
  out.push(row("simulated date", run.simDate ?? "not set"));
  out.push(row("simulated time", run.simTime ?? "not set"));
  out.push(row("forecast day loaded", run.forecastDay ?? "none"));
  out.push(row("route", `${run.origin} -> ${run.destination}`));
  out.push(row("stretch km", `${run.fromKm.toFixed(2)}-${run.toKm.toFixed(2)}`));
  out.push(row("stretch length km", round(run.toKm - run.fromKm, 2)));
  out.push(row("carriageway shown", run.view));
  out.push(row("simulation speed", `${run.simSpeed}x`));

  out.push("");
  out.push("Readings by carriageway");
  out.push(row(
    "carriageway", "lanes", "lanes closed", "speed limit km/h", "incidents placed",
    "inflow veh/h", "inflow source", "record anchor veh/h",
    "warmed up", "elapsed s", "active agents", "avg speed km/h", "baseline speed km/h",
    "throughput veh/min", "density veh/km/lane", "stopped", "longest queue m",
    "CO2 kg/min", "avg travel time s", "unmet demand veh/h", "peak unmet veh/h",
  ));
  for (const d of run.directions) {
    const m = d.metrics;
    out.push(row(
      d.direction, d.laneCount, laneList(d.closedLanes), d.speedLimitKmh ?? "none", d.incidentCount,
      Math.round(d.inflowVehPerHour), d.inflowFrom, d.dataAnchor === null ? "" : Math.round(d.dataAnchor),
      m ? (m.warm ? "yes" : "no — still filling") : "",
      m ? Math.round(m.elapsedS) : "", m?.activeAgents ?? "", round(m?.avgSpeedKmh),
      d.baselineAvgSpeedKmh === null ? "not captured" : round(d.baselineAvgSpeedKmh),
      round(m?.throughputPerMin), round(m?.densityPerKmLane), m?.stoppedCount ?? "",
      m ? Math.round(m.longestQueueM) : "", round(m?.co2RatePerMin, 2),
      m ? Math.round(m.avgTravelTimeS) : "", m ? Math.round(m.unmetVehPerHour) : "",
      Math.round(d.peakUnmetVehPerHour),
    ));
  }

  const events = run.directions.flatMap((d) => d.events);
  out.push("");
  out.push("Scenario events");
  if (events.length === 0) {
    out.push("none");
  } else {
    out.push(row("carriageway", "event", "family", "phase now", "km", "stretch km", "lanes blocked", "starts at s", "duration s"));
    for (const e of events) {
      const lanes = [e.lane, ...e.extraLanes].filter((l): l is number => l !== null);
      out.push(row(
        e.direction, e.name, e.family, e.phase ?? "not running",
        e.positionKm.toFixed(2),
        e.stretchKm ? `${e.stretchKm.fromKm.toFixed(2)}-${e.stretchKm.toKm.toFixed(2)}` : "",
        lanes.length ? lanes.map((l) => `L${l}`).join(" ") : "shoulder",
        Math.round(e.startS), Math.round(e.durationS),
      ));
    }
  }

  out.push("");
  out.push("Confidence run");
  if (!run.replication) {
    out.push("not run");
  } else {
    const { direction, result } = run.replication;
    out.push(row("carriageway", direction));
    out.push(row("runs", result.runs));
    out.push(row("seconds per run", result.secondsPerRun));
    out.push(row("warm-up s", result.warmupS));
    // RepStat carries the HALF-WIDTH of the interval (ci95), not its bounds.
    // The file states the bounds, which is what a reader of the table needs.
    out.push(row("metric", "mean", "95% CI low", "95% CI high", "sd", "runs"));
    const stats: readonly [string, RepStat][] = [
      ["avg speed km/h", result.avgSpeedKmh],
      ["throughput veh/min", result.throughputPerMin],
      ["longest queue m", result.longestQueueM],
      ["CO2 kg/min", result.co2RatePerMin],
      ["avg travel time s", result.avgTravelTimeS],
      ["unmet demand veh/h", result.unmetVehPerHour],
    ];
    for (const [label, st] of stats) {
      out.push(row(label, round(st.mean, 2), round(st.mean - st.ci95, 2), round(st.mean + st.ci95, 2), round(st.sd, 2), st.n));
    }
  }

  out.push("");
  out.push("Readings describe only traffic that got onto the stretch; demand that could not enter queues upstream, outside the model (see 'unmet demand').");
  return out.join("\r\n") + "\r\n";
}

/** `scenario-run_2026-11-03_1712.csv` — sorts chronologically, no colons (Windows). */
export function runFilename(at: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `scenario-run_${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}_${p(at.getHours())}${p(at.getMinutes())}.csv`;
}

/** Browser-only: hand the text to the user as a download. */
export function downloadCsv(filename: string, text: string): void {
  // BOM so Excel reads it as UTF-8 rather than the system codepage.
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
