/**
 * The one congestion rule for a live Waze jam, for every frontend view of the live corridor.
 *
 * Mirrors the backend's classify() (Back-End/src/services/corridor-status.service.ts) and speedClassLevelSql()
 * (Back-End/src/utils/nlex-street.ts), which /corridor-status/full, the Live Map's feed, the forecast map and the
 * mobile app already use. These are the congestion model's class cuts (train_congestion_horizon.py):
 *   under 10 km/h  congested
 *   10-20 km/h     slow
 *   20+ km/h       clear
 * A jam with no speed falls back to Waze's grade: 4-5 congested, 3 slow, 0-2 clear.
 *
 * Until 21 Nov 2026 the Overview graded jams by Waze's grade (3+ congested, 1-2 slow), while the map beside it used
 * speed. Measured on the live feed, 4 of 11 jams came out differently: three grade-4 jams at 11-13 km/h were
 * "congested" on the Overview and "slow" on the map, and a grade-1 jam at 30 km/h was "slow" on the Overview and
 * clear on the map (audit 2026-11-19, P8-03). Every frontend caller now asks this file.
 */

export const SEVERE_KMH = 10;
export const HEAVY_KMH = 20;

export type SegmentStatus = "clear" | "slow" | "congested";

/** The map palette's level for each state: 0 clear, 2 amber, 4 red (lib/map-palette.ts bands 0 / 1-2 / 3-5). */
export const STATUS_LEVEL: Record<SegmentStatus, 0 | 2 | 4> = { clear: 0, slow: 2, congested: 4 };

/** A palette level back to its state. Levels 1-2 are slow and 3-5 congested, the bands the map is painted in. */
export function statusOfLevel(level: number): SegmentStatus {
  if (!Number.isFinite(level) || level < 1) return "clear";
  return level >= 3 ? "congested" : "slow";
}

/** The rule itself, on a speed (km/h) and Waze's 0-5 grade. Either may be missing. */
export function classifyJam(speedKmh: number | null, wazeGrade: number | null): SegmentStatus {
  if (speedKmh != null && Number.isFinite(speedKmh)) {
    if (speedKmh < SEVERE_KMH) return "congested";
    if (speedKmh < HEAVY_KMH) return "slow";
    return "clear";
  }
  if (wazeGrade == null || !Number.isFinite(wazeGrade)) return "clear";
  if (wazeGrade >= 4) return "congested";
  if (wazeGrade === 3) return "slow";
  return "clear";
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Waze's own 0-5 grade for a feed jam, for the "Jam level N of 5" wording only. Never the state. */
export function wazeGradeOf(p: Record<string, unknown> | null | undefined): number | null {
  if (!p) return null;
  // Since 15 Nov 2026 the grade travels as waze_level and `level` is the speed class. Older payloads had only `level`.
  return "waze_level" in p ? num(p.waze_level) : num(p.level);
}

/**
 * One jam from GET /api/map-comparison/real-time, classified.
 *
 * Since 15 Nov 2026 the feed carries Waze's grade as `waze_level`, and its `level` is already this rule's answer,
 * worked out in SQL (speedClassLevelSql). That answer is used as it is, because only the SQL can still tell a missing
 * speed from a standstill: the JSON writes a missing speed as 0. A payload without `waze_level` is the older shape,
 * whose `level` is Waze's grade, so the rule is applied here to its speed and grade.
 */
export function jamStatus(p: Record<string, unknown> | null | undefined): SegmentStatus {
  if (!p) return "clear";
  if ("waze_level" in p) {
    const lvl = num(p.level);
    if (lvl != null) return statusOfLevel(lvl);
  }
  return classifyJam(num(p.speed), wazeGradeOf(p));
}

/** The same answer as a palette level (0 / 2 / 4), which is what the map and the corridor ribbons paint with. */
export function jamLevel(p: Record<string, unknown> | null | undefined): 0 | 2 | 4 {
  return STATUS_LEVEL[jamStatus(p)];
}
