import type { Pool } from "pg";

/**
 * What a jam at an exit typically looks like at a given hour: queue length,
 * distance from the plaza, delay, speed. From four years of Waze history, in
 * gold.congestion_jam_profile (scripts/medallion/11-gold-congestion-jam-profile.sql,
 * which also scores it against the live weeks).
 *
 * Shared by the congestion card (/traffic/forecast) and the forecast map
 * (/map-comparison/forecast) so the two describe a predicted jam identically.
 *
 * The forecast row's own state picks the profile, so a severe hour gets severe
 * jams. A row the model expects to keep moving still gets the profile of the
 * likelier congested state, which the card shows as "if it jams". Fallbacks run
 * from specific to general, trusting only rows built on at least 12 hours:
 *   hour      this exit, this hour and day type, this severity
 *   exit      this exit, any hour, this severity (then any severity)
 *   corridor  the whole corridor at this severity, for an exit with no
 *             near-plaza history of its own (Mexico); labelled as such
 */

/** Guarded by to_regclass so a database that has not run the script yet still
 *  serves the forecast, just without the detail. */
export async function jamProfileAvailable(db: Pool): Promise<boolean> {
  try {
    const { rows } = await db.query(
      `SELECT to_regclass('gold.congestion_jam_profile') IS NOT NULL AS ok`);
    return Boolean(rows[0]?.ok);
  } catch {
    return false;
  }
}

/**
 * Typical traffic volume at the exit for the forecast hour: median vehicles per
 * hour (entries + exits, both directions) for that exit, day type and hour,
 * Jan 2022 - Dec 2025, and that figure relative to the exit's median hour.
 * From gold.exit_volume_profile (scripts/medallion/12-gold-exit-volume-profile.sql).
 * Lets a predicted jam be read against demand: a jam in a 1.8x hour is the
 * rush; one in a 0.4x hour is more likely an incident or roadworks.
 * Must follow jamProfileSql's join, which defines `jt`. Empty when the table
 * is absent.
 */
export async function volumeProfileSql(db: Pool): Promise<{ cols: string; join: string }> {
  try {
    const { rows } = await db.query(
      `SELECT to_regclass('gold.exit_volume_profile') IS NOT NULL AS ok`);
    if (!rows[0]?.ok) return { cols: "", join: "" };
  } catch {
    return { cols: "", join: "" };
  }
  return {
    cols: `, vp.vol_median AS "volMedian", vp.vol_p75 AS "volP75", vp.vol_rel::float AS "volRel"`,
    join: `LEFT JOIN gold.exit_volume_profile vp
                  ON lower(vp.exit_name) = lower(c.segment_name)
                 AND vp.day_type = jt.day_type AND vp.hour = jt.hr`,
  };
}

/**
 * Which carriageway(s) jam at this exit at this time of day: the share of the
 * exit's jam-hours with a heavy/severe jam on each side, from live jams in
 * gold.congestion_queue_direction. The model predicts a jam at an exit, not on
 * a side; most exits are lopsided (Balintawak 98% northbound, Bocaue Barrier
 * 98% southbound), so drawing both sides was wrong more often than right.
 * Uses the time-of-day row when it rests on at least 30 jam-hours, else the
 * exit's all-day row. Must follow jamProfileSql's join, which defines `jt`.
 */
export async function directionSql(db: Pool): Promise<{ cols: string; join: string }> {
  try {
    const { rows } = await db.query(
      `SELECT to_regclass('gold.congestion_queue_direction') IS NOT NULL AS ok`);
    if (!rows[0]?.ok) return { cols: "", join: "" };
  } catch {
    return { cols: "", join: "" };
  }
  return {
    cols: `, COALESCE(qdp.nb_share, qda.nb_share)::float AS nb_share,
             COALESCE(qdp.sb_share, qda.sb_share)::float AS sb_share,
             COALESCE(qdp.jam_hours, qda.jam_hours) AS dir_jam_hours`,
    join: `LEFT JOIN gold.congestion_queue_direction qdp
                  ON qdp.exit_name = c.segment_name AND qdp.jam_hours >= 30
                 AND qdp.period = CASE WHEN jt.hr BETWEEN 5 AND 9 THEN 'am'
                                       WHEN jt.hr BETWEEN 10 AND 15 THEN 'midday'
                                       WHEN jt.hr BETWEEN 16 AND 20 THEN 'pm' ELSE 'night' END
           LEFT JOIN gold.congestion_queue_direction qda
                  ON qda.exit_name = c.segment_name AND qda.period = 'all'`,
  };
}

/**
 * Where a predicted queue sits relative to its plaza, per carriageway: the
 * median signed distance from the plaza to the queue's front (negative before
 * the plaza, positive past it), measured from live jams in
 * gold.congestion_queue_placement. Queues on this corridor mostly straddle the
 * plaza and end past it; "before the plaza" was right for only 9% of them.
 *
 * An exit's own median is used where it rests on at least 20 queues and sits
 * within 1 km of the plaza; otherwise the corridor-wide median for that
 * direction. Returns empty strings when the table is absent.
 */
export async function queuePlacementSql(db: Pool): Promise<{ cols: string; join: string }> {
  try {
    const { rows } = await db.query(
      `SELECT to_regclass('gold.congestion_queue_placement') IS NOT NULL AS ok`);
    if (!rows[0]?.ok) return { cols: "", join: "" };
  } catch {
    return { cols: "", join: "" };
  }
  const side = (alias: string, dir: "NB" | "SB") =>
    `LEFT JOIN gold.congestion_queue_placement ${alias}
            ON ${alias}.exit_name = c.segment_name AND ${alias}.dir = '${dir}'
           AND ${alias}.n_jams >= 20 AND ABS(${alias}.front_offset_m) <= 1000
     LEFT JOIN gold.congestion_queue_placement ${alias}a
            ON ${alias}a.exit_name = 'ALL' AND ${alias}a.dir = '${dir}'`;
  return {
    cols: `, COALESCE(qn.front_offset_m, qna.front_offset_m) AS front_nb_m,
             COALESCE(qs.front_offset_m, qsa.front_offset_m) AS front_sb_m,
             (qn.exit_name IS NOT NULL) AS front_nb_own,
             (qs.exit_name IS NOT NULL) AS front_sb_own`,
    join: `${side("qn", "NB")} ${side("qs", "SB")}`,
  };
}

/**
 * Columns and joins to add to a query over a forecast table aliased `c`
 * (segment_name, hours_ahead, base_ts, congestion_state, p_high, p_med).
 *
 * Four equality joins rather than one lateral with OR-ed conditions: the
 * lateral said the same thing but could not use the index and took ~30 s for
 * 3,360 rows.
 */
export function jamProfileSql(): { cols: string; join: string } {
  const pick = (col: string) =>
    `CASE WHEN jp1.exit_name IS NOT NULL THEN jp1.${col}
          WHEN jp2.exit_name IS NOT NULL THEN jp2.${col}
          WHEN jp3.exit_name IS NOT NULL THEN jp3.${col}
          ELSE jp4.${col} END`;
  return {
    cols: `, ${pick("queue_m")} AS "jamQueueM", ${pick("queue_p75_m")} AS "jamQueueP75M",
             ${pick("delay_s")} AS "jamDelayS", ${pick("delay_p75_s")} AS "jamDelayP75S",
             ${pick("dist_m")} AS "jamDistM", (${pick("speed_kmh")})::float AS "jamSpeedKmh",
             ${pick("n_hours")} AS "jamBasisHours",
             CASE WHEN jp1.exit_name IS NOT NULL THEN 'hour'
                  WHEN jp2.exit_name IS NOT NULL OR jp3.exit_name IS NOT NULL THEN 'exit'
                  WHEN jp4.exit_name IS NOT NULL THEN 'corridor' END AS "jamBasis"`,
    join: `CROSS JOIN LATERAL (
             SELECT CASE WHEN EXTRACT(ISODOW FROM c.base_ts + c.hours_ahead * interval '1 hour') IN (6, 7)
                         THEN 'weekend' ELSE 'weekday' END AS day_type,
                    EXTRACT(HOUR FROM c.base_ts + c.hours_ahead * interval '1 hour')::int AS hr,
                    CASE WHEN c.congestion_state IN ('High', 'Med') THEN c.congestion_state
                         WHEN COALESCE(c.p_high, 0) >= COALESCE(c.p_med, 0) THEN 'High'
                         ELSE 'Med' END AS jam_state
           ) jt
           LEFT JOIN gold.congestion_jam_profile jp1
                  ON jp1.exit_name = c.segment_name AND jp1.day_type = jt.day_type
                 AND jp1.hour_of_day = jt.hr AND jp1.state = jt.jam_state AND jp1.n_hours >= 12
           LEFT JOIN gold.congestion_jam_profile jp2
                  ON jp2.exit_name = c.segment_name AND jp2.day_type = 'all'
                 AND jp2.hour_of_day IS NULL AND jp2.state = jt.jam_state AND jp2.n_hours >= 12
           LEFT JOIN gold.congestion_jam_profile jp3
                  ON jp3.exit_name = c.segment_name AND jp3.day_type = 'all'
                 AND jp3.hour_of_day IS NULL AND jp3.state = 'Any'
           LEFT JOIN gold.congestion_jam_profile jp4
                  ON jp4.exit_name = 'ALL' AND jp4.day_type = 'all'
                 AND jp4.hour_of_day IS NULL AND jp4.state = jt.jam_state`,
  };
}
