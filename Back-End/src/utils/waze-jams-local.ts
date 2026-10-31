/* The historical Waze jam table, on Manila time, in one place.
 *
 * public.fact_hourly_jams (silver.waze_hourly_jams_clean, from the Waze
 * Partner Hub export in bronze.waze_hourly_jams) keys each row by date_day and
 * hour_of_day in UTC. Every query here read them as Manila time, so the
 * corridor's jams sat eight hours early: the export's busiest hours were "2:00"
 * and "9:00" and its quietest "15:00" to "20:00", the opposite of the live feed
 * and of the toll counts. Lined up hour by hour against
 * silver.waze_jam_hourly_exit (the same export, already on Manila time), the
 * correlation is 1.000 at +8 h and -0.20 at 0 h (2025, checked 28 Oct 2026).
 *
 * Read the table through this subquery, never directly, so the speed-by-hour
 * chart, the congestion index and the wet/dry joins all see local hours. A day
 * now starts at its Manila midnight, so the first export day begins at 08:00
 * and the last one runs to 07:00 of the next local day.
 */
export const FACT_HOURLY_JAMS_LOCAL = `(
  SELECT (u.ts)::date AS date_day,
         EXTRACT(hour FROM u.ts)::int AS hour_of_day,
         u.avg_speed_kmh, u.avg_jam_level, u.total_jam_reports
    FROM (SELECT date_day + make_interval(hours => hour_of_day) + interval '8 hours' AS ts,
                 avg_speed_kmh, avg_jam_level, total_jam_reports
            FROM fact_hourly_jams) u
)`;
