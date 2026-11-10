# SmartFlow NLEX — evaluation protocol for every forecasting model

Written 10 Nov 2026, BEFORE any model was re-scored under it. The user's rule: no bias towards any model; the
training and testing must be correct, strong and valid for how each forecast is served. Every trainer that feeds a
dashboard graph uses this protocol through `common/rolling_eval.py`. Changing a rule below after seeing results is
not allowed; a rule that turns out to be wrong is corrected in the open, with the reason, and re-run for every model.

## 1. Test data must be real
* Scored days end at the last day of REAL data. Traffic volume: **2026-05-24** (25 May - 30 Jun 2026 still holds broken,
  missing and synthetic days until the client re-extracts it). A model that uses traffic volume as an input is scored
  on the same cut. Incident and Waze records are real and use their own last day, unless an input they need is not.
* Days known to be broken inside the real period (zero-filled or near-empty uploads) are not scored.
* Training may use every day the model is allowed to see; nothing after the forecast origin.

## 2. Test the way the forecast is served
* **Rolling origins**: an origin every 14 days across the last 52 weeks of real data (a full year, so every holiday
  season is tested). At each origin every model is re-fitted on data before the origin only.
* **Served horizon**: each model forecasts the full horizon its graph shows (daily volume, CO2, incidents: 90 days;
  fleet mix: 30 days), the way it is served (recursive models feed their own forecasts back, never actuals).
* **Inputs known at forecast time only**:
  * Calendar (weekday, day of year, Philippine holidays from `public.ph_holidays`) is known in advance and allowed.
  * Weather after the origin is NOT known. Weather-aware models are served only while a real forecast exists (16
    days). They are tested with the OBSERVED weather for days 1-14 as an upper bound of what a perfect forecast could
    give; if even that does not significantly beat the model's weather-free twin, the weather-free twin is served.
  * Another model's output (e.g. traffic volume inside the incident model) enters as that model's own out-of-sample
    forecast from the same origin, never the actual value.
* **Every candidate and every baseline is scored on exactly the same origins, days and horizons.** An origin where a
  model fails is dropped for all models.

## 3. Baselines (always scored)
* **Same weekday last week** (seasonal naive, lag 7).
* **Weekday average of the last 8 weeks.**
* **Same day last year** (lag 364, same weekday), scaled by the ratio of the last 8 weeks to the same 8 weeks a year
  earlier: the honest long-horizon baseline, because it already carries the yearly pattern.

## 4. Feature parity
Every candidate is offered the same known-in-advance information where its form allows: weekly pattern, yearly
pattern and holidays. A model is not judged weak because it was never given information the others had.

## 5. Scores
* Per horizon bucket: days 1-14, 15-30, 31-60, 61-90 (fleet mix: 1-7, 8-14, 15-30).
* Continuous targets (volume, CO2): **WMAPE** (sum |error| / sum actual). Counts (incidents): **MAE** and WMAPE.
  Shares (fleet mix): Aitchison distance and heavy-vehicle-share WMAPE. Classes: macro-F1 and log-loss / Brier skill
  against the class prior, never plain accuracy.
* **Skill** = 1 - (model score / best baseline score) in the same bucket.

## 6. Choosing the champion (fixed before results)
1. Score = mean of the bucket scores (equal weight per bucket, so the long horizons do not dominate by day count).
2. Eligible = beats the best baseline on that score AND in the days 1-14 bucket.
3. Champion = lowest score among the eligible. If none is eligible, the best baseline is served and the dashboard says so.
4. Uncertainty: the champion's lead over the runner-up and over the best baseline is given a 95% interval by a
   moving-block bootstrap over origins (block = enough origins to cover the 90-day overlap). If the interval includes
   0, the report says the lead is not significant; the lower-complexity model wins a non-significant tie.
5. A bucket is labelled usable on the dashboard only if the champion beats the best baseline there.

## 7. Final model
The champion is re-fitted on all allowed data and forecasts forward. The chart's "present" band shows its days 1-14
forecasts from the rolling origins (non-overlapping), so the band and the metrics describe the same forecasts.

## 8. Publishing
A new run replaces the published model only if it passes this protocol AND the previous champion, re-scored on the
same origins, is not better. Every publish records the code version (git commit) that produced it.
