-- GOLD: keep every congestion forecast, and score it against what happened.
--
-- gold.ml_congestion_forecast is replaced every hour by the refresh task (on
-- whichever machine runs it), so until now no forecast the map has shown was
-- ever checked against the jams that followed. The model's accuracy figure
-- comes from one held-out week inside the training script, which is a test of
-- the model, not of the map as served.
--
-- gold.ml_congestion_forecast_log: an AFTER INSERT trigger copies the next 24
-- hours of each new forecast here (480 rows an hour; the 7-day tail is not
-- kept, it changes every hour anyway). The trigger lives in the database, so
-- it works whichever machine writes the forecast, and it swallows its own
-- errors: a logging problem can never make the refresh fail.
--
-- gold.v_congestion_forecast_score: each logged prediction next to what Waze
-- actually reported for that exit and hour, labelled exactly as the training
-- script labels it (length-weighted speed of the hour's jams at the exit:
-- under 10 km/h High, under 20 Med, otherwise or no jam Low). Hours are only
-- scored once they are complete and the feed was alive in them.
--
-- Two decision rules are scored side by side:
--   argmax  the likeliest of Low/Med/High (what the card coloured until now)
--   shown   congested when P(Med) + P(High) >= 0.5 (what it colours now)
--
-- Idempotent; the log itself is never dropped.
--   npx tsx scripts/run-sql.ts scripts/medallion/13-gold-congestion-forecast-log.sql

CREATE TABLE IF NOT EXISTS gold.ml_congestion_forecast_log (
  base_ts          timestamp NOT NULL,
  segment_name     text      NOT NULL,
  hours_ahead      int       NOT NULL,
  congestion_state text,
  probability      numeric,
  p_low            numeric,
  p_med            numeric,
  p_high           numeric,
  logged_at        timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (base_ts, segment_name, hours_ahead)
);

COMMENT ON TABLE gold.ml_congestion_forecast_log IS
  'Every congestion forecast for the next 24 hours, as served, kept for scoring against what happened. Filled by trigger trg_log_congestion_forecast on gold.ml_congestion_forecast. See 13-gold-congestion-forecast-log.sql.';

CREATE OR REPLACE FUNCTION gold.log_congestion_forecast() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hours_ahead <= 24 AND NEW.base_ts IS NOT NULL THEN
    BEGIN
      INSERT INTO gold.ml_congestion_forecast_log
        (base_ts, segment_name, hours_ahead, congestion_state, probability, p_low, p_med, p_high)
      VALUES
        (NEW.base_ts, NEW.segment_name, NEW.hours_ahead, NEW.congestion_state, NEW.probability,
         NEW.p_low, NEW.p_med, NEW.p_high)
      ON CONFLICT (base_ts, segment_name, hours_ahead) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Never let logging break the forecast refresh.
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_congestion_forecast ON gold.ml_congestion_forecast;
CREATE TRIGGER trg_log_congestion_forecast
  AFTER INSERT ON gold.ml_congestion_forecast
  FOR EACH ROW EXECUTE FUNCTION gold.log_congestion_forecast();

-- Keep the run that is live right now, so scoring starts today.
INSERT INTO gold.ml_congestion_forecast_log
  (base_ts, segment_name, hours_ahead, congestion_state, probability, p_low, p_med, p_high)
SELECT base_ts, segment_name, hours_ahead, congestion_state, probability, p_low, p_med, p_high
FROM gold.ml_congestion_forecast
WHERE hours_ahead <= 24 AND base_ts IS NOT NULL
ON CONFLICT DO NOTHING;


CREATE OR REPLACE VIEW gold.v_congestion_forecast_score AS
WITH lg AS (
  SELECT l.*, l.base_ts + l.hours_ahead * interval '1 hour' AS target_ts
  FROM gold.ml_congestion_forecast_log l
), feed AS (
  -- Hours the live feed actually covered (any jam anywhere), and the newest
  -- complete hour. An hour with no record at all is uncollected, not clear.
  SELECT date_day + hour_of_day * interval '1 hour' AS ts, COUNT(*) AS n
  FROM silver.fact_waze_jams GROUP BY 1
), last_complete AS (
  SELECT MAX(ts) - interval '1 hour' AS ts FROM feed
), actual AS (
  SELECT j.date_day + j.hour_of_day * interval '1 hour' AS ts, e.exit_name,
         SUM(j.speed_kmh * GREATEST(j.length_meters, 1)) / SUM(GREATEST(j.length_meters, 1)) AS spd
  FROM silver.fact_waze_jams j JOIN bronze.nlex_exits e ON e.id = j.nlex_exit_id
  WHERE j.speed_kmh IS NOT NULL
  GROUP BY 1, 2
)
SELECT lg.base_ts, lg.segment_name, lg.hours_ahead, lg.target_ts,
       COALESCE(lg.p_med, 0) + COALESCE(lg.p_high, 0) AS p_cong,
       lg.congestion_state AS argmax_state,
       CASE WHEN COALESCE(lg.p_med, 0) + COALESCE(lg.p_high, 0) >= 0.5
            THEN CASE WHEN COALESCE(lg.p_high, 0) >= COALESCE(lg.p_med, 0) THEN 'High' ELSE 'Med' END
            ELSE 'Low' END AS shown_state,
       CASE WHEN a.spd IS NULL THEN 'Low' WHEN a.spd < 10 THEN 'High' WHEN a.spd < 20 THEN 'Med' ELSE 'Low' END AS actual_state
FROM lg
JOIN feed f ON f.ts = lg.target_ts
CROSS JOIN last_complete lc
LEFT JOIN actual a ON a.ts = lg.target_ts AND lower(a.exit_name) = lower(lg.segment_name)
WHERE lg.target_ts <= lc.ts;

COMMENT ON VIEW gold.v_congestion_forecast_score IS
  'Logged congestion forecasts next to the state Waze actually reported, for hours that are complete. See 13-gold-congestion-forecast-log.sql.';

SELECT COUNT(*) AS logged_rows, COUNT(DISTINCT base_ts) AS runs FROM gold.ml_congestion_forecast_log;
SELECT COUNT(*) AS scorable_rows FROM gold.v_congestion_forecast_score;
