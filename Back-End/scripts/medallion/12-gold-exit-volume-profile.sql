-- GOLD: typical traffic volume at each exit, hour and day type, and how it
-- relates to jams.
--
-- The congestion forecast is built from Waze jam reports alone; it has never
-- seen a vehicle count. The toll data says how many vehicles actually use each
-- exit in each hour (gold.fact_traffic_hourly, Jan 2022 - Dec 2025). Putting
-- the two side by side lets the card say whether a predicted jam falls in a
-- busy hour (demand) or a quiet one (more likely an incident or roadwork),
-- and lets the relationship itself be checked.
--
-- gold.exit_volume_profile: for each exit x weekday/weekend x hour, the median
-- vehicles per hour (entries + exits, both directions) and that figure
-- relative to the exit's own median hour, so 1.6 reads as "a busy hour for
-- this exit". SCTEX has no toll volume in the warehouse and gets no rows.
--
-- gold.exit_volume_jam_eval: over the years both sources cover (Jan 2022 -
-- Dec 2025), how often a near-plaza NLEX jam was reported in an exit-hour, by
-- that hour's volume relative to the exit's median. One row, JSON.
--
-- Idempotent. Re-run after a volume reload:
--   npx tsx scripts/run-sql.ts scripts/medallion/12-gold-exit-volume-profile.sql

DROP TABLE IF EXISTS gold.exit_volume_profile;

CREATE TABLE gold.exit_volume_profile AS
WITH v AS (
  SELECT date, hour::int AS hour, exit_canonical AS exit_name,
         CASE WHEN EXTRACT(ISODOW FROM date) IN (6, 7) THEN 'weekend' ELSE 'weekday' END AS day_type,
         SUM(total) AS vol
  FROM gold.fact_traffic_hourly
  GROUP BY 1, 2, 3, 4
), exit_med AS (
  SELECT exit_name, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vol) AS m
  FROM v GROUP BY 1
)
SELECT v.exit_name, v.day_type, v.hour,
       COUNT(*)::int AS n_days,
       ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY v.vol))::int AS vol_median,
       ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY v.vol))::int AS vol_p25,
       ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY v.vol))::int AS vol_p75,
       ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.vol) / NULLIF(MAX(m.m), 0))::numeric, 2) AS vol_rel,
       MIN(v.date) AS first_day, MAX(v.date) AS last_day
FROM v JOIN exit_med m USING (exit_name)
GROUP BY v.exit_name, v.day_type, v.hour;

CREATE INDEX exit_volume_profile_key ON gold.exit_volume_profile (exit_name, day_type, hour);

COMMENT ON TABLE gold.exit_volume_profile IS
  'Median vehicles per hour at each exit (entries + exits, both directions) by day type and hour, Jan 2022 - Dec 2025, and that median relative to the exit''s median hour. Built by Back-End/scripts/medallion/12-gold-exit-volume-profile.sql.';


DROP TABLE IF EXISTS gold.exit_volume_jam_eval;

CREATE TABLE gold.exit_volume_jam_eval AS
WITH v AS (
  SELECT date, hour::int AS hour, exit_canonical AS exit_name, SUM(total) AS vol
  FROM gold.fact_traffic_hourly GROUP BY 1, 2, 3
), med AS (
  SELECT exit_name, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vol) AS m FROM v GROUP BY 1
), vn AS (
  SELECT v.*, v.vol / NULLIF(med.m, 0) AS rel FROM v JOIN med USING (exit_name)
), w AS (
  -- Same jams the queue profile uses: NLEX mainline, near the plaza.
  SELECT w.date_day, w.hour_of_day::int AS hour, e.exit_name,
         SUM(w.speed_kmh_wavg * w.jam_snapshots) / NULLIF(SUM(w.jam_snapshots), 0) AS spd
  FROM silver.waze_jam_hourly_exit w JOIN bronze.nlex_exits e ON e.id = w.nlex_exit_id
  WHERE w.on_corridor AND w.distance_m_avg <= 600
  GROUP BY 1, 2, 3
), j AS (
  SELECT vn.rel, w.spd
  FROM vn
  LEFT JOIN w ON w.date_day = vn.date AND w.hour = vn.hour AND lower(w.exit_name) = lower(vn.exit_name)
  -- Only days the jam history covers, so a missing jam means no jam.
  WHERE vn.date IN (SELECT DISTINCT date_day FROM silver.waze_jam_hourly_exit)
), b AS (
  SELECT CASE WHEN rel < 0.5 THEN 1 WHEN rel < 1.0 THEN 2 WHEN rel < 1.5 THEN 3
              WHEN rel < 2.0 THEN 4 ELSE 5 END AS band,
         COUNT(*) AS exit_hours,
         AVG((spd IS NOT NULL)::int) AS jam_rate,
         AVG((spd < 10)::int) FILTER (WHERE spd IS NOT NULL) AS severe_share
  FROM j GROUP BY 1
)
SELECT 1 AS id,
       jsonb_build_object(
         'from', (SELECT MIN(date) FROM gold.fact_traffic_hourly),
         'to',   (SELECT MAX(date) FROM gold.fact_traffic_hourly),
         'bands', jsonb_agg(jsonb_build_object(
            'band', band,
            'label', CASE band WHEN 1 THEN 'under 0.5x' WHEN 2 THEN '0.5-1x' WHEN 3 THEN '1-1.5x'
                               WHEN 4 THEN '1.5-2x' ELSE '2x and over' END,
            'exit_hours', exit_hours,
            'jam_rate', ROUND(jam_rate::numeric, 4),
            'severe_share', ROUND(severe_share::numeric, 4)) ORDER BY band)
       ) AS payload,
       NOW() AS updated_at
FROM b;

SELECT jsonb_pretty(payload) FROM gold.exit_volume_jam_eval;
