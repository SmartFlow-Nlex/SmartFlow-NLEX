/**
 * Forecast map: a predicted jam drawn over the stretch it would occupy.
 *
 * The model predicts one state per exit, and the forecast map used to paint
 * that state over the whole exit-to-exit segment -- kilometres of red for what,
 * at the plaza, is usually a 200-600 m queue. The live map beside it draws each
 * jam over its own length, so the two panels could not be compared.
 *
 * Each predicted jam now carries, from the API:
 *   - the typical queue length for that exit, hour and severity, from four
 *     years of Waze history (gold.congestion_jam_profile), and its 75th
 *     percentile;
 *   - where on each carriageway queues at that plaza usually end
 *     (gold.congestion_queue_placement, live jams);
 *   - which carriageway(s) that exit jams on at that time of day
 *     (gold.congestion_queue_direction, live jams).
 * This lays each predicted queue onto the centreline from those. The features
 * are shaped like live jams (feature_type "jam", a street naming the
 * carriageway) so the map passes them through the same snap, marker,
 * "starts ... before" wording and plate colouring as a real one.
 *
 * Kept out of TrafficMapPanel so it can be run, and checked, on its own.
 */

export type LngLat = [number, number];

const M_LON = 111320 * Math.cos((15 * Math.PI) / 180);
const M_LAT = 110574;
const groundM = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT);

/** Waze levels for a forecast state: the shared map palette's 2 amber, 4 red. */
export const FORECAST_LEVEL: Record<string, number> = { Low: 0, Med: 2, Medium: 2, High: 4, Severe: 5 };

/** A side is drawn when it carries at least this share of the exit's jam-hours. */
export const SIDE_CUT = 0.4;

/**
 * The state a forecast exit is SHOWN as -- the same rule as the congestion
 * card, so the two cannot disagree about which exits jam: a jam when the chance
 * of one (heavy + severe) is 50% or more, its severity whichever of the two is
 * likelier. The API already sends congestion_state this way; this re-derives it
 * from the probabilities so an older payload is read the same.
 */
export function shownForecastState(p: Record<string, unknown>): string {
  const pm = p.p_med == null ? null : Number(p.p_med);
  const ph = p.p_high == null ? null : Number(p.p_high);
  if (pm == null || ph == null) return String(p.congestion_state ?? "");
  if (pm + ph < 0.5) return "Low";
  return ph >= pm ? "High" : "Med";
}

/**
 * Which side(s) to draw. The model says an exit will jam, not which
 * carriageway; drawing both everywhere made every exit look the same, and most
 * exits are lopsided (Balintawak 98% northbound, Bocaue Barrier 98%
 * southbound). A side is drawn when it carries at least 40% of the exit's
 * jam-hours at this time of day, and the likelier side always is. Scored on
 * live jams that is right for 72% of the sides drawn against 56% for "both",
 * and still draws 88% of the sides that really jam. No shares (an exit with no
 * live jams yet): both.
 */
export function sidesToDraw(nbShare: number | null, sbShare: number | null): ("NB" | "SB")[] {
  if (nbShare == null || sbShare == null) return ["NB", "SB"];
  const out: ("NB" | "SB")[] = [];
  if (nbShare >= SIDE_CUT || nbShare >= sbShare) out.push("NB");
  if (sbShare >= SIDE_CUT || sbShare > nbShare) out.push("SB");
  return out;
}

export function makePredictedQueues(centreline: LngLat[], exits: { exit_name: string; longitude: number; latitude: number }[]) {
  const centre = centreline;
  const arc: number[] = [0];
  for (let i = 1; i < centre.length; i++) arc.push(arc[i - 1] + groundM(centre[i - 1], centre[i]));
  const corridorLength = arc[arc.length - 1] ?? 0;

  const exitArc = new Map<string, number>();
  for (const e of exits) {
    let best = 0;
    let bestD = Infinity;
    centre.forEach((c, i) => {
      const d = groundM(c, [e.longitude, e.latitude]);
      if (d < bestD) { bestD = d; best = i; }
    });
    exitArc.set(e.exit_name.toLowerCase(), arc[best]);
  }

  /** The centreline between two distances along it, ends interpolated. */
  const sliceArc = (from: number, to: number): LngLat[] => {
    const lo = Math.max(0, Math.min(from, to));
    const hi = Math.min(corridorLength, Math.max(from, to));
    const at = (s: number): LngLat => {
      let i = 1;
      while (i < arc.length - 1 && arc[i] < s) i++;
      const span = arc[i] - arc[i - 1] || 1;
      const t = Math.min(1, Math.max(0, (s - arc[i - 1]) / span));
      return [
        centre[i - 1][0] + (centre[i][0] - centre[i - 1][0]) * t,
        centre[i - 1][1] + (centre[i][1] - centre[i - 1][1]) * t,
      ];
    };
    const pts: LngLat[] = [at(lo)];
    for (let i = 0; i < arc.length; i++) if (arc[i] > lo && arc[i] < hi) pts.push(centre[i]);
    pts.push(at(hi));
    return pts;
  };

  /** The forecast feed plus a queue (and faint tail) per drawn side per jam. */
  const withPredictedQueues = (fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection => {
    if (!fc?.features) return fc;
    const queues: GeoJSON.Feature[] = [];
    for (const f of fc.features) {
      const p = f.properties as Record<string, unknown> | null;
      if (p?.feature_type !== "forecast") continue;
      const state = shownForecastState(p);
      if (state !== "Med" && state !== "High") continue;
      const exit = String(p.segment_id ?? "");
      const s0 = exitArc.get(exit.toLowerCase());
      const q = Number(p.jam_queue_m);
      if (s0 == null || !(q > 0)) continue;

      const nbS = p.nb_share == null ? null : Number(p.nb_share);
      const sbS = p.sb_share == null ? null : Number(p.sb_share);
      for (const dir of sidesToDraw(nbS, sbS)) {
        /* Where the queue's FRONT sits: the measured median signed distance
           from this plaza to the front of real queues on this carriageway
           (positive = past the plaza). The queue runs back upstream from there
           for its typical length. The corridor is ordered south to north, so
           "past the plaza" is north for northbound traffic and south for
           southbound. An earlier version put every queue wholly BEFORE the
           plaza, which live jams contradict: most straddle it and end past it. */
        const front = Number((dir === "NB" ? p.front_nb_m : p.front_sb_m) ?? 0) || 0;
        const coords = dir === "NB"
          ? sliceArc(s0 + front - q, s0 + front)
          : sliceArc(s0 - front, s0 - front + q);
        if (coords.length < 2) continue;
        const p75 = Number(p.jam_queue_p75_m);
        const props = {
          predicted: true,
          street: dir === "NB" ? "NLEX N" : "NLEX S",
          nearest_exit: exit,
          level: FORECAST_LEVEL[state] ?? 2,
          length_m: Math.round(q),
          length_p75_m: p75 > q ? Math.round(p75) : null,
          delay_seconds: p.jam_delay_s ?? null,
          speed: p.jam_speed_kmh != null ? Math.round(Number(p.jam_speed_kmh)) : null,
          p_congested: p.p_congested ?? null,
          vol_median: p.vol_median ?? null,
          vol_rel: p.vol_rel ?? null,
          // This side's share of the exit's jam-hours, for the hover card.
          side_share: dir === "NB" ? nbS : sbS,
          dir_jam_hours: p.dir_jam_hours ?? null,
          jam_basis: p.jam_basis ?? null,
          jam_basis_hours: p.jam_basis_hours ?? null,
        };
        queues.push({
          type: "Feature",
          properties: { ...props, feature_type: "jam", uuid: `forecast-${exit}-${dir}` },
          geometry: { type: "LineString", coordinates: coords },
        });

        /* "May extend to": the typical queue is the median, and one in four
           real queues here run longer than the 75th percentile. That extra
           stretch is drawn faint and dashed behind the queue, upstream, where a
           longer queue would grow. Its own feature type, so it never counts as a
           queue: no marker, no plate colour. */
        if (p75 > q * 1.1) {
          const tail = dir === "NB"
            ? sliceArc(s0 + front - p75, s0 + front - q)
            : sliceArc(s0 - front + q, s0 - front + p75);
          if (tail.length >= 2) {
            queues.push({
              type: "Feature",
              properties: { ...props, feature_type: "jam_tail", direction: dir, uuid: `forecast-tail-${exit}-${dir}` },
              geometry: { type: "LineString", coordinates: tail },
            });
          }
        }
      }
    }
    return { ...fc, features: [...fc.features, ...queues] };
  };

  return { withPredictedQueues, sliceArc, exitArc };
}
