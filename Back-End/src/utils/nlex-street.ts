/* "On NLEX", as SQL, in one place.
 *
 * corridor_match only says a jam is near an exit, and near is not enough: the
 * local road network runs within metres of the corridor for most of its length.
 * A live sample had two jams at a dead stop on "Tulaoc", a barangay road 133 m
 * off the expressway, surfacing in the Corridor Overview as
 * "Slowest stretch: San Simon, avg speed 0 km/h" while the map beside it drew
 * San Simon green. The map was right. It applies this test; the overview did
 * not.
 *
 * This is isNlexCorridorStreet from the dashboard's lib/nlex-corridor.ts
 * written as SQL, because the aggregation happens in the query. The three
 * places that count jams share it so they cannot drift: corridor-status,
 * getLiveCorridorOverview, and the map feed itself.
 *
 * The exclusions are all roads Waze brands with the expressway's own name
 * while not being the mainline -- service roads, crossings, exit roads, the
 * spur roads, and the other tollways that connect to it.
 */
const EXCLUDED = [
  "service",
  "crossing",
  "exit rd",
  "halili",
  "dulalia",
  "tullahan",
  "libtong",
  "slex",
  "skyway",
  "sctex",
  "tplex",
  "cavitex",
] as const;

/**
 * A SQL boolean for "this row's street is the NLEX mainline".
 *
 * @param col the street column, qualified if the query aliases the table
 *            (`"j.street"`), bare otherwise (`"street"`).
 */
export function nlexStreetSql(col: string): string {
  const not = EXCLUDED.map((word) => `LOWER(${col}) NOT LIKE '%${word}%'`).join("\n           AND ");
  return `((LOWER(${col}) LIKE '%nlex%' OR LOWER(${col}) LIKE '%north luzon%')
           AND ${not})`;
}

/**
 * The corridor's live jams, deduplicated, as a CTE named `live_jams`.
 *
 * Waze re-issues a queue under a NEW jam_id when it briefly loses and
 * re-detects it, and the superseded row keeps its last_seen_at inside the
 * window. A 213 m queue below Bocaue was present twice, byte-identical
 * geometry, two ids, last seen 28 minutes apart -- so the map drew it twice,
 * the overview counted it twice, and neither was wrong about any single row.
 *
 * Deduplicated on the geometry itself, keeping the most recently seen row,
 * because that is what identifies a stretch of road; jam_id identifies a
 * Waze record, and the whole problem is that one queue had two of those.
 * ST_AsBinary rather than the geometry `=` operator: exact bytes, with no
 * dependence on how PostGIS decides two shapes are equal.
 *
 * Prepend to a query and select `FROM live_jams j` in place of the table.
 *
 * `snapshot` keeps only the jams in the LATEST feed: seen within
 * LIVE_SNAPSHOT_MINUTES of the newest fetch. Without it the map drew every jam
 * seen in the last hour -- about thirty fetches of the 2-minute feed stacked on
 * one map, cleared queues included. Rebuilt for 14 Nov 2026 11:06 it drew 50
 * jam lines, 167 km of line over 53 km of road, and only 22 of the 50 were
 * still there. Anchored to the newest fetch rather than to NOW(), so a stalled
 * feed still shows its last picture (the feed's stale flag says how old).
 * The timeline keeps the plain window: it is meant to show the last hours.
 */
export const LIVE_SNAPSHOT_MINUTES = 6;

export function liveNlexJamsCte(windowMinutes: number, opts: { snapshot?: boolean } = {}): string {
  const latest = opts.snapshot
    ? `AND j.last_seen_at > (SELECT MAX(last_seen_at) FROM silver.fact_waze_jams) - interval '${LIVE_SNAPSHOT_MINUTES} minutes'`
    : "";
  return `WITH live_jams AS (
    SELECT DISTINCT ON (ST_AsBinary(j.geom)) j.*
    FROM silver.fact_waze_jams j
    WHERE j.corridor_match IN ('ON_CORRIDOR', 'NEAR_CORRIDOR')
      AND j.last_seen_at > NOW() - interval '${windowMinutes} minutes'
      ${latest}
      AND j.geom IS NOT NULL
      AND ${nlexStreetSql("j.street")}
    ORDER BY ST_AsBinary(j.geom), j.last_seen_at DESC
  )`;
}

/* The congestion model's own class cuts (train_congestion_horizon.py SEVERE_KMH / HEAVY_KMH): under 10 km/h is
   Congested (High), 10-20 is Slow (Med), 20 and over is Low. */
export const SEVERE_KMH = 10;
export const HEAVY_KMH = 20;

/**
 * A live jam's colour on the model's scale, as the map palette's level: 4 red, 2 amber, 0 clear.
 *
 * The live map coloured by Waze's grade (1-2 amber, 3-5 red) while the forecast map beside it colours by these speed
 * cuts, so the two maps called different things "slow". On the mainline over 30 days (to 15 Nov 2026) Waze grade 1
 * averaged 49 km/h and 98% of it ran at 20+ km/h, grade 2 averaged 22 km/h (56% at 20+): long moving slowdowns
 * (3.8 km and 1.8 km on average) that the model by definition calls not congested. Those were the long amber
 * stretches on the live map. A jam with no speed falls back to its grade (4-5 red, 3 amber, 1-2 clear), which is
 * where those grades' speeds sit.
 */
export function speedClassLevelSql(speedCol: string, levelCol: string): string {
  return `(CASE WHEN ${speedCol} IS NULL THEN
                  CASE WHEN ${levelCol} >= 4 THEN 4 WHEN ${levelCol} = 3 THEN 2 ELSE 0 END
                WHEN ${speedCol} < ${SEVERE_KMH} THEN 4
                WHEN ${speedCol} < ${HEAVY_KMH} THEN 2
                ELSE 0 END)`;
}
