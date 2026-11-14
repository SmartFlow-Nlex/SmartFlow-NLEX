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

## 9. Event effect (Philippine Arena, Philippine Sports Stadium, Clark) — added 11 Nov 2026
Written before the verified calendar existed and before any candidate below was scored. Disclosed: on 11 Nov, on the
UNVERIFIED calendar, I looked at CDV event-day ratios by venue, weekend, run length and reported attendance (Arena
1.08x / Stadium 1.02x / Clark 0.98x; weekend 1.13x / weekday 1.03x; attendance tiers 1.02-1.13x, not significant).
Those looks are why these candidates are declared; none of them is assumed to win.

* **Event days come from the verified calendar only** (`silver.arena_events_verified`): one row per real show night,
  each with a public source link (official venue / promoter / artist / ticketing page, Billboard, or an established
  news outlet; never Wikipedia or its copies). A date in the scraped calendar with no such evidence is not an event
  day. Traffic is never used to decide whether a date was an event.
* **Real toll days only** (section 1): event nights after 2026-05-24 are not scored; broken days are not scored.
* **Normal day** for an exit-day = median of that exit on the same weekday over the previous 8 weeks, counting only
  ordinary days (not a verified event night, not a holiday, not broken), at least 4 of 8. Holidays keep their own
  factor (median ratio to the normal on non-event holidays).
* **Target**: the event night's daily volume at each exit. Scored exits, fixed now: the exits near the venue —
  Meycauayan to Sta. Rita Guiguinto (km 20-39) for Arena and Stadium nights, Mexico to Sta. Ines (km 72-88) for Clark
  nights. Also reported: CDV/PH Arena alone, and every exit.
* **Candidates** (all of the form normal day x multiplier, so the dashboard can serve them):
  1. *No adjustment* (baseline): multiplier 1.
  2. *Flat uplift* (baseline): one median ratio for every exit and event.
  3. *Per-exit uplift*: each exit's median ratio (what the dashboard serves now).
  4. *Venue + day*: an event-strength term from venue and weekend/weekday, times each exit's sensitivity.
  5. *+ event class*: adds act origin (Filipino / international / mixed) and format (solo concert / showcase /
     festival / sports / other).
  6. *+ run*: adds nights in the run and first-night flag.
  7. *+ reported attendance* (log per-night attendance): scored only on the event nights that have a sourced
     attendance figure, against candidate 5 on the same nights.
  Candidates 4-7 are log-linear: log(ratio at exit e) = sensitivity_e x event strength, event strength fitted by Huber
  regression at the venue's anchor exit (CDV/PH Arena; Dau for Clark), sensitivity_e by least squares through the
  origin. Robust (Huber), because a few nights are 2x and one bad night must not set the rule.
* **Test**: leave-future-out. Each event night in the later 40% (by date) is predicted by models fitted only on event
  nights at least one day before it. Score = WMAPE of vehicles over the scored exit-days.
* **Choosing**: the same rules as section 6 — eligible only if it beats BOTH baselines with a 95% bootstrap interval
  (resampling event nights) that excludes 0; among eligible, lower score wins, and a non-significant lead goes to the
  simpler candidate (order 3 < 4 < 5 < 6 < 7). If nothing is eligible, the better baseline is served and labelled so.
* **Plausibility (attendance)**: candidate 7 is accepted only if, besides winning, its implied extra vehicles per
  1,000 attendees has a 95% interval above 0 and within a physically possible range (at most one vehicle per
  attendee).
* **Correction, 12 Nov 2026 (after the first results, made in the open):** checking the calendar's completeness showed
  that CDV/PH Arena's daily toll count doubled on 2024-11-04 (about 8,000 -> 16,000-17,000 a day) and stayed there,
  while its neighbours did not move: a change in how that plaza is counted or reached, not traffic events. A trailing
  normal built across that step called every CDV day for a month about 2x "normal", including two event nights (Dua
  Lipa 2024-11-13, Stray Kids 2024-11-23). Rule added: **a normal day never mixes days from before and after a lasting
  level shift at that exit.** A shift is detected the same way for every exit: the median of the 28 days from a date
  differs from the median of the 28 days before it by a factor of 1.5 or more, and the next 28 days confirm it. The
  study is re-run for every candidate with this rule.
* **Corrections, 12 Nov 2026 (after results, made in the open):**
  1. *Tie between the two baselines.* The first run served the flat uplift because it scored lower than "no
     adjustment", without testing that lead; section 6.4 gives a non-significant lead to the simpler method. Now the
     flat uplift is served at an exit group only where its lead over "no adjustment" is significant. Result on the
     verified nights, for every normal-day window tried (4, 6, 8, 12 weeks): significant at the venue's own exit
     (CDV/PH Arena; Dau for Clark), not significant across the other nearby exits. So the multiplier is applied at
     the venue exit only. Reason it differs: event traffic leaves at the venue exit, while the other nearby plazas
     (e.g. Bocaue Barrier) carry large through-traffic whose ordinary day-to-day swings hide the event.
  2. *Gradient Boosting and Random Forest added as candidates 8 and 9.* The 2026-11-10 build listed Gradient
     Boosting as a reference; the first verified run left it out. Both are now scored the same way (leave-future-out,
     same nights, same scopes), on the same features as candidate 6 plus the exit and its normal-day volume, fixed
     settings (no tuning on the test nights). If one wins, its forecast for each upcoming event night is computed by
     the publisher and stored, so the dashboard can serve it.
  3. *Seasonal adjustment of the normal day.* With the tree models in, the forecast for BTS (Stadium, March 2027)
     showed the outer nearby exits about 5% BELOW normal. Five of the eight Stadium nights in the record fall in
     January, and on ORDINARY days the trailing 8-week normal is biased by season: January days run 3.6% below it
     (it still holds the Christmas weeks), December 5.5% above, November 2.5% above, other months within 1.5%. Rule
     added: the normal is multiplied by the exit's seasonal factor for that calendar month, the median of
     actual / normal on that exit's ordinary days of the same month, using only days before the night being
     measured or predicted (at least 8 such days, else 1). Re-run for every candidate.
  4. *Event class and mean vs median (adviser, 13 Nov 2026), declared before these candidates were scored.* Each
     verified night gets a class: **annual** = the same event series (name without years or brackets) held in two
     or more different calendar years by a Filipino or mixed lineup (e.g. Summer Blast, the New Year Countdown,
     Clark Aurora); **international** = an international act, not annual; **other** = everything else. New
     candidates, all applied at the venue exit only like the current one: the uplift as the MEAN instead of the
     median; the uplift per class (median and mean); and the venue exit's OWN ratios instead of the pool of nearby
     exits (median and mean, overall and per class). A class with fewer than 3 training nights falls back to the
     overall value. A candidate replaces the served uplift only if it is significantly more accurate at the venue
     exit (95% interval of the WMAPE difference below 0) and not significantly worse across the nearby exits;
     among several, the lowest venue-exit error wins, and a non-significant lead goes to the simpler (no class
     before class). Mean against median is also reported head to head.
  5. *Uplift at every exit with a real rise (user, 13 Nov 2026), declared before it was scored.* On all 57 nights,
     five nearby exits rose by an amount whose 95% interval excludes zero (Tambubong, CDV/PH Arena, Marilao, Bocaue
     Interchange, Bocaue Barrier), while four did not. New candidates: each exit's own median (and, separately, mean)
     ratio, applied only at exits whose bootstrap 95% interval over the TRAINING nights before the test night lies
     above 1; no adjustment elsewhere. It replaces the served uplift only if it is significantly more accurate across
     the nearby exits and not significantly worse at the venue exit; median before mean on a non-significant tie.
  6. *More test nights (13 Nov 2026), declared before it was run.* The newest-40% split leaves 23 test nights, too
     few to decide per exit (Tambubong and Marilao improved on average, with intervals just crossing zero). The test
     now walks forward through every night that has at least 10 earlier scored nights: each is predicted from the
     nights before it only. Every candidate is re-scored on these nights and the same selection rules apply.
  7. *Event hours (13 Nov 2026), declared before it was run.* Whole-day totals mix the event with 12 or more
     ordinary hours. A second study uses the traffic from 12:00 to 23:59 Manila time on the event day (arrivals and
     the first part of the exodus), with the same normal-day construction on that window. Per exit, the exit's own
     median ratio (candidate 3's form) is tested against no adjustment AT THAT EXIT on the walk-forward nights; an
     exit whose 95% interval of the error difference lies below 0 is "proven". The served forecast then adds, at
     every proven exit, its window normal times (its median window ratio - 1) to the daily normal; unproven exits
     keep the currently served forecast (so the venue exit keeps its tested uplift unless it is proven here too).
     This assembled forecast is scored on whole-day traffic against the served one, and it
     replaces the served one only if it is not significantly worse across the nearby exits or at the venue exit.
  8. *Per-exit average vs per-exit median (adviser, 13 Nov 2026), declared before it was run.* Candidate 3 uses each
     exit's own MEDIAN ratio. A twin uses each exit's own MEAN ratio, scored on the same walk-forward nights. The
     mean replaces the median only if it is significantly more accurate across the nearby exits (95% interval of
     the difference below 0) and not significantly worse at the venue exit; otherwise the median, declared first,
     is kept. The comparison is reported either way.
     *Result (47 walk-forward nights, 13 Nov 2026):* median nearby 8.27% vs mean 9.04% (mean minus median +0.18..+1.32),
     venue exit 13.63% vs 14.45% (+0.03..+1.59): the median is significantly better at both and is kept. Why: a few
     extreme nights move the mean both ways. At CDV and Tambubong the biggest concerts pull it up (BLACKPINK
     2023-03-26 at 2.02x normal); at the other nearby exits New Year's Eve nights pull it down (0.54-0.82x normal on
     31 Dec 2023/2024/2025). The median is not moved by a few extreme nights. Open item, not acted on: the normal day
     does not capture the New Year's Eve drop at the nearby exits.
* **Normal day for a future event date**: inside the traffic forecast window, the published daily corridor forecast
  times the exit's share (same weekday, last 8 real weeks); beyond it, the section 3 "same day last year, scaled"
  baseline, which is tested here on ordinary days at 90-300 days ahead against the plain trailing 8-week median.
