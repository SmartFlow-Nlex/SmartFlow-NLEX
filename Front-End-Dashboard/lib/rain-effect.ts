"use client";

import { useEffect, useState } from "react";

/**
 * Rain's association with traffic, crashes and jams, like for like (GET /api/traffic/rain-effect, 9 Nov 2026).
 * One fetch shared by the Traffic and Incident pages, and the same wording everywhere: "associated with", never
 * "causes" — traffic cannot cause rain, so the difference is not reverse causation, but it is still an association.
 */

export type DayEffect = {
  band: string; mmFrom: number; mmTo: number | null; days: number; months: number;
  effectPct: number | null; lowPct: number | null; highPct: number | null;
};
export type HourEffect = {
  band: string; mmPerHourFrom: number; mmPerHourTo: number | null; exitHours: number; days: number;
  jamPct: number | null; dryJamPct: number | null; jamDiffPts: number | null; jamLowPts: number | null; jamHighPts: number | null;
  delayMin: number | null; dryDelayMin: number | null; delayDiffMin: number | null; delayLowMin: number | null; delayHighMin: number | null;
};
export type FloodEffect = {
  exitHours: number; days: number; jamPct: number | null; rainyJamPct: number | null; jamLowPts: number | null; jamHighPts: number | null;
  delayMin: number | null; rainyDelayMin: number | null; delayLowMin: number | null; delayHighMin: number | null;
};
export type RainEffect = {
  volume: DayEffect[];
  accidents: { anyRain: DayEffect; bands: DayEffect[] };
  allIncidents: { anyRain: DayEffect };
  jams: { from: string; to: string | null; bands: HourEffect[]; flood: FloodEffect };
  method: { dryDayMm: number; wetHourMm: number; baselineWindowDays: number; recordThrough: string; daysUsed: number; dryDays: number };
};

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
let pending: Promise<RainEffect | null> | null = null;

function load(): Promise<RainEffect | null> {
  if (!pending) {
    pending = fetch(`${BACKEND}/api/traffic/rain-effect`)
      .then((r) => r.json())
      .then((j) => (j?.success ? (j.data as RainEffect) : null))
      .catch(() => null)
      .then((d) => {
        if (!d) pending = null; // a failed load may be retried on the next mount
        return d;
      });
  }
  return pending;
}

export function useRainEffect(enabled = true): RainEffect | null {
  const [data, setData] = useState<RainEffect | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    load().then((d) => live && setData(d));
    return () => { live = false; };
  }, [enabled]);
  return data;
}

/** The range leaves out zero: the difference is clear at the 95% level. */
export const isClear = (lo: number | null, hi: number | null) => lo != null && hi != null && (lo > 0 || hi < 0);

const signed = (v: number, dp = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}`;

/** "−12.1% (−21.0 to −3.9)" */
export function fmtEffect(e: { effectPct: number | null; lowPct: number | null; highPct: number | null }): string {
  if (e.effectPct == null) return "—";
  const range = e.lowPct != null && e.highPct != null ? ` (${signed(e.lowPct)} to ${signed(e.highPct)})` : "";
  return `${signed(e.effectPct)}%${range}`;
}

export const bandLabel = (b: DayEffect) =>
  b.mmTo == null ? `${b.band[0].toUpperCase()}${b.band.slice(1)} (${b.mmFrom} mm+)` : `${b.band[0].toUpperCase()}${b.band.slice(1)} (${b.mmFrom}–${b.mmTo} mm)`;

export const METHOD_NOTE =
  "Each rainy day is compared with dry days (under 1 mm) of the same weekday within six weeks, so the season is held fixed. Holidays and the day either side, 24 Dec–2 Jan, Arena event days and the unfinished 2026 data after 24 May are left out. Ranges are 95%, resampling whole months because rainy days come in spells. Traffic cannot cause rain, so this is not reverse causation; it is still an association, not proof.";
