import { displayExitName, type NlexExit } from "./nlex-exits";

/**
 * km -> nearest exit name, in one place.
 *
 * Every place on the Incident tab that shows a km value (hotspot chart, its
 * tooltip, the Top Hotspot tile, the detail modal, the full ranking) asks this
 * instead of printing a bare number.
 *
 * Units matter here. Incident hotspots are binned on `corridor_km`, the
 * distance from Balintawak (Balintawak = 0), because that is what the
 * warehouse stores for each event. The exit list (lib/nlex-exits.ts) is in
 * km-posts, the number on the roadside marker (Balintawak = 12). The two differ
 * by CORRIDOR_KM_OFFSET, and matching one against the other without it would
 * name an exit 12 km up the road from where the incident happened.
 */
export const CORRIDOR_KM_OFFSET = 12;

/** "12–16": the km-post range of a hotspot bin, the secondary label beside "Km 0–4". */
export const postRangeForBin = (binStart: number, width = 5) =>
  `${binStart + CORRIDOR_KM_OFFSET}–${binStart + width - 1 + CORRIDOR_KM_OFFSET}`;

/** A km-post as distance from Balintawak, trimmed like the exit list ("0", "1.63"). */
export const corridorKmFromPost = (post: number) =>
  String(Number((post - CORRIDOR_KM_OFFSET).toFixed(2)));

/** Past this distance beyond the first/last exit the point is off the corridor. */
const OFF_CORRIDOR_KM = 2.5;

export type KmExit = {
  /** Display name, acronyms restored. */
  name: string;
  /** Distance to that exit, in km. */
  distanceKm: number;
  /** Set when the point lies beyond the first or last exit rather than between exits. */
  beyond: "before" | "after" | null;
};

export type ExitLookup = {
  /** Nearest exit to a corridor_km value (Balintawak = 0). */
  forCorridorKm: (corridorKm: number) => KmExit | null;
  /** Nearest exit to the middle of a 5-km hotspot bin. */
  forBin: (binStart: number, width?: number) => KmExit | null;
  /** The text to print beside a bin: "Balintawak", "Before Balintawak", "Past Sta. Ines". */
  nameForBin: (binStart: number, width?: number) => string | null;
};

export function createExitLookup(exits: NlexExit[]): ExitLookup {
  const sorted = [...exits].sort((a, b) => a.km - b.km);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const forCorridorKm = (corridorKm: number): KmExit | null => {
    if (!first || !last || !Number.isFinite(corridorKm)) return null;
    const post = corridorKm + CORRIDOR_KM_OFFSET;
    let best = first;
    for (const x of sorted) if (Math.abs(x.km - post) < Math.abs(best.km - post)) best = x;
    const beyond = post < first.km - OFF_CORRIDOR_KM ? "before" : post > last.km + OFF_CORRIDOR_KM ? "after" : null;
    return { name: displayExitName(best.exit_name), distanceKm: Math.abs(best.km - post), beyond };
  };

  const forBin = (binStart: number, width = 5) => forCorridorKm(binStart + width / 2);

  const nameForBin = (binStart: number, width = 5): string | null => {
    const e = forBin(binStart, width);
    if (!e) return null;
    if (e.beyond === "before") return `Before ${e.name}`;
    if (e.beyond === "after") return `Past ${e.name}`;
    return e.name;
  };

  return { forCorridorKm, forBin, nameForBin };
}
