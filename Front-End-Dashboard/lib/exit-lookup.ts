import { displayExitName, type NlexExit } from "./nlex-exits";
import { KM_POST_START, kmMeasured } from "./km-post";

/**
 * km -> nearest exit name, in one place.
 *
 * Every place on the Incident tab that shows a km value (hotspot chart, its
 * tooltip, the Top Hotspot tile, the detail modal, the full ranking) asks this
 * instead of printing a bare number.
 *
 * Units matter here, and there are three (lib/km-post.ts):
 *   - a hotspot bin (`km_bin`) is an OFFICIAL km post, the number on the
 *     roadside marker: 5-km bins starting at Km 12 (Balintawak), with bin 0 for
 *     everything recorded south of Km 12, where NLEX has no posts;
 *   - the exit list (lib/nlex-exits.ts) is in MEASURED km, Balintawak 12 plus
 *     the distance along the road;
 *   - `corridor_km`, what the warehouse stores per event, is the distance from
 *     Balintawak (Balintawak = 0): measured km minus CORRIDOR_KM_OFFSET.
 * Matching one against another without converting names an exit kilometres up
 * the road from where the incident happened.
 *
 * (Jertz-Commit-9 wrote this for Balintawak = 0 bins, labelled "Km 0–4 (post
 * 12–16)". The backend has since moved the bins onto the official posts, so a
 * bin is labelled with its posts alone and no Km 0 is ever shown; 19 Oct 2026.)
 */
export const CORRIDOR_KM_OFFSET = 12;

/** Bin 0 is the group south of Km 12; every other bin is an official post. */
export const SOUTH_OF_CORRIDOR_BIN = 0;

/** Official posts a bin covers: Km 12–14 for the first (the corridor starts at 12), then 15–19, 20–24 … */
const binEnd = (binStart: number, width = 5) => (binStart === KM_POST_START ? 14 : binStart + width - 1);

/** "15–19": the official km-post range of a hotspot bin ("below 12" for the group south of the corridor). */
export const postRangeForBin = (binStart: number, width = 5) =>
  binStart === SOUTH_OF_CORRIDOR_BIN ? `below ${KM_POST_START}` : `${binStart}–${binEnd(binStart, width)}`;

/** A measured km as the distance from Balintawak, trimmed like the exit list ("0", "1.63"). A real road distance. */
export const corridorKmFromPost = (measuredKm: number) =>
  String(Number((measuredKm - CORRIDOR_KM_OFFSET).toFixed(2)));

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
  /** Nearest exit to the middle of a hotspot bin (an official km post; 0 = south of Km 12). */
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
    const measured = corridorKm + CORRIDOR_KM_OFFSET;
    let best = first;
    for (const x of sorted) if (Math.abs(x.km - measured) < Math.abs(best.km - measured)) best = x;
    const beyond = measured < first.km - OFF_CORRIDOR_KM ? "before" : measured > last.km + OFF_CORRIDOR_KM ? "after" : null;
    return { name: displayExitName(best.exit_name), distanceKm: Math.abs(best.km - measured), beyond };
  };

  const forBin = (binStart: number, width = 5) => {
    // South of Km 12: a point well before Balintawak, so it reads "Before Balintawak".
    if (binStart === SOUTH_OF_CORRIDOR_BIN) return forCorridorKm(-2 * OFF_CORRIDOR_KM);
    // The middle of the bin's posts, as a measured position, as a distance from Balintawak.
    const midPost = (binStart + binEnd(binStart, width) + 1) / 2;
    return forCorridorKm(kmMeasured(midPost) - CORRIDOR_KM_OFFSET);
  };

  const nameForBin = (binStart: number, width = 5): string | null => {
    const e = forBin(binStart, width);
    if (!e) return null;
    if (e.beyond === "before") return `Before ${e.name}`;
    if (e.beyond === "after") return `Past ${e.name}`;
    return e.name;
  };

  return { forCorridorKm, forBin, nameForBin };
}

/**
 * The exits either end of a stretch, for printing beside its km range: "near Pulilan" when one exit is
 * nearest to both ends, "Pulilan to San Simon" otherwise, south to north. Both ends in MEASURED km (what a
 * maintenance row stores); a km range alone made a reader look the exits up (UAT, Overview / Live Map /
 * Maintenance). Empty while the exit list has not loaded.
 */
export function nearExitsText(exits: NlexExit[], aMeasured: number, bMeasured: number): string {
  if (exits.length === 0 || !Number.isFinite(aMeasured) || !Number.isFinite(bMeasured)) return "";
  const at = (km: number) =>
    exits.reduce((best, x) => (Math.abs(x.km - km) < Math.abs(best.km - km) ? x : best));
  const lo = at(Math.min(aMeasured, bMeasured));
  const hi = at(Math.max(aMeasured, bMeasured));
  return lo === hi ? `near ${displayExitName(lo.exit_name)}` : `${displayExitName(lo.exit_name)} to ${displayExitName(hi.exit_name)}`;
}
