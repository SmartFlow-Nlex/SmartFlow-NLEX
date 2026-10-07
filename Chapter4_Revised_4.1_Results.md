# Chapter 4 — Section 4.1, revised against the delivered system

*Prepared 8 October 2026. Every bracketed placeholder in the draft has been replaced with a value
read from the warehouse or from the endpoint that renders the corresponding dashboard panel. Where
the real data contradicts the direction the draft's sentence assumed, the sentence has been rewritten
rather than back-filled, which is what Note 1 asked for. Section 4.1.6 at the end is a register of
every such reversal, so the group can see what changed and why.*

*Unless stated otherwise, descriptive figures are for the dashboard's default analysis window —
calendar year 2025 for the traffic and emission modules, and 1 July 2025 to 30 June 2026 for the
incident module — while coverage and record counts span the full warehouse, 1 January 2022 to
30 June 2026.*

---

## 4.1.1 Source of Raw Data

The raw data used in this project was drawn from four distinct input streams, consistent with the
Source Layer defined in Section 3.9.1. Internal operational data was formally requested from and
provided by NLEX Corporation, comprising the Road Crash Table, the Stalled Vehicle Table, and the
Northbound and Southbound Traffic Reports Tables. Third-party contextual data was retrieved
programmatically from a weather data API and from scraped event and ticketing schedules covering
venues within the corridor's catchment area, most notably the Philippine Arena. Crowdsourced data
was accessed through the Waze Partner Hub integration maintained with the Metro Pacific Tollways
Corporation, which supplied geolocated jam records, anomaly feeds, and incident markers in near real
time.

**Table 4.1.1** *Summary of Raw Data Sources*

| Data Stream | Dataset | Provider / Source | Format | Records ingested | Coverage |
| --- | --- | --- | --- | --- | --- |
| Internal | Traffic Reports (NB/SB) | NLEX Corporation | .xlsx | 2,086,512 | Jan 2022 – Jun 2026 |
| Internal | Road Crash Table | NLEX Corporation | .xlsx | 21,820 | Jan 2022 – Jun 2026 |
| Internal | Stalled Vehicle Table | NLEX Corporation | .xlsx | 156,925 | Jan 2022 – Jun 2026 |
| Third-Party API | Hourly weather observations | Weather API | JSON | 1,152,960 | Jan 2022 – Jun 2026 |
| Third-Party API | Event and ticketing schedules | Ticketing sites (Philippine Arena) | JSON / HTML | 155 | Dec 2020 – Dec 2027 |
| Third-Party Data | Waze jam and alert feeds (hourly) | Waze Partner Hub via MPTC | JSON | 358,998 jams / 315,783 alerts | rolling |
| Third-Party Data | Waze raw alert and jam snapshots | Waze Partner Hub via MPTC | JSON | 44,623 each | rolling |
| Internal | Emission activity records | Derived from volume × factors | — | 978,796 | Jan 2022 – Jun 2026 |

**Two corrections to this table as drafted.** The Apprehension and Undercap Table is listed in the
draft as an internal stream, but no corresponding table exists in the warehouse and no variable
derived from it reaches any dashboard panel. It should be removed from Table 4.1.1 and from Table
4.1.2, or the chapter should state that it was obtained but not ingested. Likewise, the mobile
application's community reporting feature appears in the draft as a user-ingested stream; the mobile
application is joined to the dashboard through a configuration endpoint, but no community report
records are present in the warehouse. Reporting either stream as a data source would claim an input
the system does not have.

### 4.1.1.1 Description of the Raw Data

The consolidated raw dataset covered the North Luzon Expressway corridor from Balintawak to Sta.
Ines, Mabalacat, Pampanga, spanning approximately 105 kilometres of expressway and its associated
toll plazas and exits, resolved across **19 toll points** and **20 recorded exits**. The internal
traffic reports were provided as vehicle entry counts disaggregated by toll exit, direction, and
vehicle classification, from which Average Daily Traffic volumes were derived, while the
incident-related tables were provided as event-level records in which each row represented a single
crash or stalling occurrence.

In total, the proponents obtained **2,086,512** traffic volume records, **21,820** road crash
records, and **156,925** stalled vehicle records across the observation window of **1 January 2022
to 30 June 2026**, a span of **1,642 days**. The external streams contributed **1,152,960** hourly
weather observations, **155** scheduled event entries, and **358,998** hourly Waze jam records
together with **315,783** hourly alert records, retrieved at **hourly** intervals throughout the
collection period.

The datasets differed considerably in temporal granularity, which had direct implications for how
they could be aligned during transformation. The internal traffic reports were aggregated to the
hour per exit, direction, and vehicle class, the Waze and weather feeds were available at hourly
resolution, and the incident logs were timestamped to the minute. This heterogeneity necessitated the
resampling and temporal alignment procedures discussed in Section 4.1.2 before any cross-source
analysis could be performed.

### 4.1.1.2 Variables in the Raw Data

**Table 4.1.2** *Variables Extracted from Each Raw Dataset*

| Source Dataset | Key Variables | Analytical Role |
| --- | --- | --- |
| Traffic Reports (NB/SB) | date, hour, exit, direction, role, toll system, Class 1 / 2 / 3 counts | Primary volume series for the traffic module and the activity basis for emission computation |
| Road Crash Table | event number, start date, direction, location, km value, corridor km, type of event, main and sub cause, detection, weather condition, vehicles involved, injuries, fatalities, blockage cleared, site cleared, clearance minutes, deployment count | Incident frequency, severity, and hotspot analysis |
| Stalled Vehicle Table | event number, encoded date, direction, location, km value, corridor km, vehicle type and class, main and sub cause, detection, trouble description, deployment count | Non-crash obstruction analysis and clearance modelling |
| Weather API | recorded at, cell, temperature, feels-like, pressure, humidity, dew point, UV index, cloud cover, visibility, wind speed and direction, condition, precipitation probability, rain in last hour | Exogenous regressor for volume, incident, and speed models |
| Ticketing Scrapes | event name, venue, date, start time, attendance | Exogenous regressor for event-driven surge forecasting |
| Waze Partner Hub | alert type, coordinates, jam speed, jam level, jam length, delay, reliability | Ground-truth validation set and real-time congestion state input |

### 4.1.1.3 Initial Observations

An initial inspection of the raw datasets revealed several data quality concerns that justified the
multi-gate validation architecture adopted in the pipeline. The internal incident tables contained
free-text entries in the cause and trouble-description fields, producing inconsistent spellings and
non-standard abbreviations for what were substantively the same categories. Kilometre post values
were recorded in mixed formats across tables, with some entries expressed as decimals and others as
text strings containing directional qualifiers. Duplicate records were observed within the Waze feed,
where the same physical anomaly was reported multiple times under separate alert identifiers within a
short interval, a pattern consistent with the crowdsourced nature of the source.

A quantified instance of the location problem survives into the delivered system and is reported on
the dashboard rather than hidden: in the incident predictive panel, **0.9 %** of logged locations in
the active range could not be matched to a specific exit and are excluded from the per-exit split,
with the exclusion stated on the panel itself.

Beyond these quality issues, the raw data exhibited substantive patterns later confirmed by the
descriptive tier. Traffic volume displayed a pronounced weekly cycle, and incident counts clustered
at particular kilometre ranges rather than distributing uniformly along the corridor. **The draft's
third preliminary observation — that wet conditions showed a higher daily incident count than dry
conditions — is not supported once the records are joined to the weather series, and is corrected in
Section 4.1.3.2.**

---

## 4.1.2 Implementation of Data Cleaning and Preprocessing

*The architectural description in the draft is accurate and is retained. Only the quantified outcome
is restated here.*

The cumulative effect of the cleaning and preprocessing stage is summarised in Table 4.1.3. Retention
is high across the internal tables because the inbound records were already structured; the large
reduction in the traffic stream is a **change of grain**, not a loss, since raw per-transaction rows
are aggregated to exit-hour facts.

**Table 4.1.3** *Record Counts Before and After Data Cleaning and Validation*

| Dataset | Raw records | Retained | Retention | Note |
| --- | --- | --- | --- | --- |
| Road Crash Table | 21,820 | 21,804 | 99.93 % | 16 rows dropped on unrecoverable date or location |
| Stalled Vehicle Table | 156,925 | 156,901 | 99.98 % | 24 rows dropped |
| Emission activity records | 978,796 | 977,356 | 99.85 % | 1,440 rows dropped |
| Traffic Reports (NB/SB) | 2,086,512 | 1,254,192 exit-hour facts | — | aggregation, not exclusion |
| Weather observations | 1,152,960 | 1,152,960 | 100 % | — |
| Waze jams | 358,998 hourly | 136,520 silver jam facts | — | deduplicated to one record per physical jam-hour |
| Incident log (unified) | — | 19,141 | — | crash and stall events combined on one schema |

The principal causes of record exclusion were unrecoverable location fields and timestamps falling
outside the declared coverage window. **The draft's single aggregate retention sentence should be
replaced by the per-dataset figures above**, because one blended percentage over streams with
different grains is not a meaningful number.

---

## 4.1.3 Descriptive Analysis

### 4.1.3.1 Traffic Module

**Traffic Volume Trend.** Across calendar year 2025 the corridor carried **127,433,038** vehicle
entries over **365** days, a **1.2 %** increase on the preceding equivalent period (125,860,216).
Over the full warehouse window the corridor carried **545,565,505** entries across 1,642 days, a
daily mean of **332,257**. The decomposed series shows a **mildly rising** underlying trend with the
seasonal component reproducing a consistent weekly cycle of period seven. The busiest single day in
the record was **14 February 2026 at 434,670 entries**.

**Average Volume by Hour and Day of Week.** The weekday profile peaks in the evening. Mean weekday
volume is highest at **18:00 (6 PM)**, followed by 19:00 and 17:00, with a secondary morning
concentration at **07:00**. **Friday** carries the highest mean daily volume of any day at
**358,514** entries, narrowly ahead of Saturday at 356,768, which is consistent with the pre-weekend
outbound movement NLEX already anticipates through calendar-based planning. **Sunday** is the
quietest day at **282,076**, some 21 % below Friday.

**Traffic Volume by Plaza.** Demand is heavily concentrated at the southern end of the corridor.

| Plaza | 2025 volume | Share |
| --- | --- | --- |
| Bocaue Barrier | 23,895,236 | 18.8 % |
| Balintawak | 23,393,616 | 18.4 % |
| NLEX Harbor Link | 18,487,121 | 14.5 % |
| San Fernando | 8,058,985 | 6.3 % |
| CDV / PH Arena | 6,546,055 | 5.1 % |
| Meycauayan | 5,894,482 | 4.6 % |

The three busiest toll points together account for **51.7 %** of all entries, while the northernmost
plazas toward Sta. Ines register substantially lower throughput. This distribution identifies where a
staffing or lane intervention would produce the greatest operational return.

**Average Speed in Jams by Hour.** Using jam speed values supplied by the Waze Partner Hub, mean
speed during congested conditions falls to a minimum of **7.1 km/h at 04:00** and rises to a maximum
of **10.7 km/h at 21:00**. The corridor-wide congestion index for 2025 stands at **2.74 of 5**,
against 2.73 in the preceding period.

> **Scope correction.** The draft reports a Gaussian Mixture Model separating free-flow, transitional
> and congested regimes, and an Underwood speed-flow fit yielding a free-flow speed and critical
> density. **The delivered build renders neither.** The note already placed beneath Figure 4.1.5 in
> the draft records that no speed-flow fundamental diagram exists on the page. The GMM and Underwood
> sentences should be removed from 4.1.3.1, or moved to Chapter 5 as future work. Reporting a
> critical density the system never computes is the single most checkable claim in this section.

**Holiday Impact versus Normal Days.** Each holiday is compared against a local baseline built from
the ±45 days surrounding it, rather than against a global annual mean, so that seasonality is not
mistaken for holiday effect.

**This result runs opposite to the direction the draft assumed.** Of the **21** holidays evaluated,
**20 fall below** their control-day baseline and only one rises above it:

| Holiday | Deviation | Occurrences |
| --- | --- | --- |
| Good Friday | **−49.0 %** | 5 |
| New Year's Eve | −37.0 % | 4 |
| All Saints' Day | −31.6 % | 4 |
| New Year's Day | −31.0 % | 5 |
| Bonifacio Day | −4.2 % | 4 |
| Immaculate Conception | −1.3 % | 4 |
| EDSA People Power Anniversary | **+2.5 %** | 4 |

The corridor is therefore **emptier** on declared holidays, not busier. This is readily explained —
NLEX is a commuter and freight corridor, and a declared non-working holiday removes exactly the trips
that dominate it — but it means the draft's framing of a "calendar-driven surge that NLEX currently
manages heuristically" must be inverted. The operationally useful statement is that holiday demand is
**predictably suppressed**, and that the surges worth forecasting are the non-calendar events treated
in Section 4.1.4.1.

### 4.1.3.2 Incident Module

**Incident Trend.** Over the twelve months to 30 June 2026 the corridor recorded **45,521**
incidents, comprising **5,024** road crashes and **40,497** stalled-vehicle events — an increase on
the **40,616** recorded in the preceding equivalent period. The records carry **805** injuries and
**12** fatalities. Stalled vehicles outnumber crashes roughly eight to one, which is the single most
consequential structural fact in this module: the corridor's incident burden is overwhelmingly
mechanical rather than collision-driven.

**Incident Occurrence and Clearance.** Mean time to first responder is **27.1 minutes** across 12,243
scored events. Mean time to clear is **57.4 minutes** overall, decomposing into **22.1 minutes** for
accidents and **72.0 minutes** for breakdowns.

> **Measurement caveat that belongs in the chapter.** Clearance coverage is **36.7 %** — of 40,497
> breakdowns only 11,803 carry a usable clearance duration, against 4,893 of 5,024 accidents. The
> breakdown figure is therefore computed on roughly a quarter of the events it describes. The draft's
> log-normal median and ninetieth-percentile sentence should state this coverage, or the claim rests
> on a silent majority of missing values.

**Incident Hotspots by Segment.** Incidents cluster sharply at the southern end:

| Segment | Incidents | Share | Crashes | Breakdowns |
| --- | --- | --- | --- | --- |
| Km 0–4 | 6,411 | 14.1 % | 921 | 5,490 |
| Km 5–9 | 5,575 | 12.2 % | 876 | 4,699 |
| Km 15–19 | 4,183 | 9.2 % | 480 | 3,703 |
| Km 10–14 | 3,877 | 8.5 % | 468 | 3,409 |
| Km 40–44 | 2,717 | 6.0 % | 166 | 2,551 |

The five densest segments account for **50.0 %** of all recorded incidents across **25 km**, or about
24 % of the corridor's length. The most severe concentration is **Km 0–4 near Balintawak**, which
alone carries 14.1 % of incidents over roughly 4 % of corridor length.

> The draft attributes these clusters to a Getis-Ord Gi\* analysis at a stated confidence level and to
> a network-constrained kernel density surface. **The delivered build ranks segments by count**, as
> the note beneath Figure 4.1.9 already records. Either the statistic should be computed, or the
> sentence should describe ranking by observed density, which is what the panel shows.

**Top Incident Causes.** After the free-text cause fields were normalised, the leading contributors
separate cleanly by event type. Among **breakdowns**, the leading cause is **Flat Tire at 12,637
events**, followed by engine and overheating faults. Among **crashes**, the leading cause is
**Miscalculation at 2,326 events** (classified under Human Error, carrying 170 injuries and 1
fatality), and the leading collision type is **Rear End at 1,697 events** (228 injuries, 5
fatalities). Tyre and mechanical failures dominating the breakdown population is operationally
significant, because such events are addressable through pre-positioned towing capacity rather than
through enforcement.

**Incidents under Dry versus Wet Conditions.** Joining the incident records to the hourly weather
series gives **1,853 wet hours** against **6,931 dry hours**, with 9,575 incidents in wet hours and
35,946 in dry.

**The draft's claim is half right, and the half that is wrong is the half it states.**

| Measure | Wet | Dry | Direction |
| --- | --- | --- | --- |
| All incidents per hour | 5.167 | 5.186 | wet marginally **lower** (−0.4 %) |
| Crashes per hour | 0.656 | 0.550 | wet **19.3 % higher** |
| Mean jam speed | 8.8 km/h | 8.3 km/h | wet **faster** |

Wet weather raises the **crash** rate by roughly a fifth, which is the finding worth reporting and
which supports the weather-conditioned predictive work. It does **not** raise the overall incident
rate, because breakdowns — eight times more numerous — are slightly less frequent in wet hours, and
the two effects cancel. The draft's sentence, which asserts a higher daily incident count under wet
conditions, should be rewritten to say *crash* rate.

The accompanying claim that the Mejia and Sigua model estimated a mean speed reduction under wet
pavement should also be reviewed: observed mean jam speed is **higher** in wet hours (8.8 against
8.3 km/h), so any stated reduction is a model coefficient and not an observation, and must be
labelled as such.

### 4.1.3.3 Environmental Impact (Emission) Module

**Corridor CO₂ Baseline Trend.** Total corridor emissions for calendar year 2025 amounted to
**161,224.7 tonnes of CO₂**, against 163,180.7 tonnes in the preceding equivalent period — a
**1.2 % decrease** even as volume rose 1.2 %, which reflects fleet-mix movement rather than reduced
activity. Mean ambient air quality index over 170,400 samples was **1.54**, with mean PM2.5 at
**9.1 µg/m³**.

> **Version warning for the group.** Earlier drafts circulated a corridor total of ~143,000 tonnes,
> and a later revision ~188,000 tonnes. Neither matches the current figure because the underlying
> emission computation was corrected during development and because the two earlier numbers covered
> different windows. **161,224.7 tonnes is the figure for calendar year 2025 in the delivered
> system.** Any emission total copied from a draft older than this chapter is stale.

**Emissions by Vehicle Class and Fleet Mix.** The disproportionality the draft anticipates is real
and is larger than the sentence implies:

| Class | Factor | Volume | Volume share | CO₂ | Emission share |
| --- | --- | --- | --- | --- | --- |
| Class 1 (light) | 192 g/km | 99,387,369 | **78.0 %** | 71,435.5 t | **44.3 %** |
| Class 2 | 354 g/km | 17,238,111 | 13.5 % | 22,005.0 t | 13.6 % |
| Class 3 (heavy) | 1,492 g/km | 10,807,557 | **8.5 %** | 67,784.3 t | **42.0 %** |

Class 1 vehicles constitute 78.0 % of corridor volume but account for only 44.3 % of emissions,
whereas Class 3 vehicles represent **8.5 % of volume and 42.0 % of emissions** — a per-vehicle
emission factor **7.8 times** that of a light vehicle. This confirms the premise stated in Section
3.3 that heavy vehicles dictate environmental burden along the corridor, and establishes the rationale
for the heavy-vehicle window restriction considered in the prescriptive tier.

**Delay-Induced Carbon Excess.** The idling penalty attributable to incident-induced delay totals
**1,151.5 tonnes**, or **0.71 %** of corridor emissions for the period, arising from **3,931** delay
incidents. Of these, **62 long-duration incidents** account for **72.5 %** of the excess.

That last figure is the one worth putting in front of a panel: **under 2 % of delay incidents produce
nearly three-quarters of the delay-induced carbon**, which is a far stronger argument for faster
clearance than the aggregate 0.71 % suggests. The draft's framing — that delay excess concentrates in
a few segments — is directionally right but understates the case by distributing it spatially rather
than by incident duration.

---

## 4.1.4 Predictive Analysis

**Table 4.1.4** *Model Benchmarking Results on the Held-Out Test Partition*

Read from `gold.ml_model_metrics`. Candidate models are retained with their verdicts, since the
rejections are evidence that selection was competitive rather than decorative.

| Forecasting task | Model | MAPE | RMSE | MASE | Verdict |
| --- | --- | --- | --- | --- | --- |
| Traffic volume (80/20) | **Prophet** | **7.45 %** | 35,518 | **0.989** | **Accepted — champion** |
| Traffic volume (80/20) | Prophet (no weather) | 7.49 % | 35,351 | 0.994 | Accepted |
| Traffic volume (80/20) | HoltWinters | 8.48 % | 42,204 | 1.153 | Rejected — MASE ≥ 1 |
| Traffic volume (80/20) | SARIMAX (no weather) | 8.54 % | 41,444 | 1.158 | Rejected — MASE ≥ 1 |
| Traffic volume (80/20) | SARIMAX | 8.99 % | 44,785 | 1.237 | Rejected — WMAPE below baseline |
| Traffic volume (80/20) | Holt's Linear | 10.61 % | 45,501 | 1.445 | Rejected |
| Traffic volume (80/20) | **LSTM** | 11.51 % | 47,749 | **1.634** | **Rejected — rank 7 of 8** |
| Traffic volume (80/20) | LSTM (no weather) | 11.54 % | 47,951 | 1.643 | Rejected |
| Incident count | **NegBinomial GLM** | WMAPE 9.75 % | 16.93 | **0.718** | **Accepted — champion** |
| Incident severity | **XGBoost** | — | — | — | Champion (ordinal) |
| Time to clear | Cox Proportional Hazard | MAE 16.5 min | — | — | Concordance 0.625 |
| Corridor CO₂ | **GBR** | **9.63 %** | 54.8 | **0.908** | **Accepted — champion** |
| Corridor CO₂ | Derived | 10.70 % | 60.0 | 1.017 | Rejected — MASE ≥ 1 |
| Corridor CO₂ | LSTM | 10.85 % | 58.8 | 1.073 | Rejected — MASE ≥ 1 |
| Corridor CO₂ | Polynomial | 11.70 % | 62.8 | 1.179 | Rejected — MASE ≥ 1 |
| Fleet composition | **Dirichlet** | 11.80 % | 2.0 | **0.602** | **Accepted — champion** |
| Fleet composition | Prophet | 10.25 % | 1.8 | 0.641 | Rejected — Aitchison below baseline |
| Congestion state | **XGBoost** | accuracy **0.667** | — | — | **Accepted — champion** |
| Congestion state | GRU | accuracy 0.631 | — | — | Accepted |
| Congestion state | QRF | accuracy 0.603 | — | — | Rejected — below 0.605 baseline |
| Event surge | **Per-exit uplift** | WMAPE **9.44 %** | — | — | **Accepted — champion** |
| Event surge | XGBoost | WMAPE 9.86 % | — | — | Accepted |

**Three things in this table change the draft materially.**

First, **the volume champion is Prophet, not LSTM.** LSTM ranks **seventh of eight** with a MASE of
1.634, meaning it performs worse than a seasonal naive forecast. The draft leaves the champion as a
placeholder; the dashboard screenshot reproduced as Figure 4.1.15 shows LSTM selected in the model
toolbar and labelled **Rejected**, which will read as a contradiction unless the caption explains
that the toolbar is a user selection and the verdict is the pipeline's.

Second, **at the 90/10 split no volume model is accepted at all** — every candidate, Prophet
included, records MASE ≥ 1. Only the 80/20 split yields a champion. Reporting a single accuracy
figure without naming the split overstates what was achieved.

Third, **the incident champion carries an explicit `OVERFITTING` diagnosis** in the metrics table,
with a training R² of 0.514 against a test R² of 0.262 — a gap of 0.252. It is still the best
candidate and still beats its baseline, but the chapter should say so rather than present R² 0.262 as
a clean result.

### 4.1.4.1 Traffic Module

**Traffic Volume Walk-Forward Forecast.** The selected volume model, **Prophet**, achieved a test-set
**MAPE of 7.45 %**, an **RMSE of 35,518 vehicles**, and a **MASE of 0.989** on the 80/20 chronological
split — marginally better than a seasonal naive baseline, which is what MASE just below 1 means.
Weather is used as an exogenous regressor; the no-weather variant scores 7.49 %, so **weather
contributes approximately 0.04 percentage points of MAPE**, which is a negligible improvement and
should be reported as such rather than as evidence that weather drives volume.

**Predictive Congestion State Map.** The congestion classifier predicts a discrete state per
exit-hour from 1 to 168 hours ahead, scored over **33,480** exit-hours. The champion, **XGBoost**,
achieves **66.7 % accuracy**, against an exit-hour profile baseline of **60.5 %** and a majority-class
baseline of 50.0 %. GRU is also accepted at 63.1 %; QRF is rejected at 60.3 % for failing to beat the
profile baseline. At the horizon shown on the delivered panel, **5 of 20 segments** are classified
severe, concentrated from **Sta. Rita Guiguinto through Mexico**.

The honest reading is that the classifier beats a seasonal profile by about **six percentage points**.
That is a real gain and it is not a large one, and the chapter is stronger for saying so.

**Event Surge Impact by Exit.** The per-exit uplift model is the champion at **WMAPE 9.44 %** and
R² 0.899, ahead of XGBoost at 9.86 %. Of **118** scheduled events evaluated, **80 raise volume above
their local baseline and 38 fall below it** — so an event is not automatically a surge, and the model
earns its place by telling the two apart.

For the largest observed case, a **BLACKPINK concert at the Philippine Arena**, volume at the
**CDV / PH Arena** toll point reached **+100 %** against its ±45-day baseline. A representative
forecast case shown on the delivered panel attributes **+4,874 vehicles (+86 %)** to **Bocaue
Interchange**, which absorbs **69 %** of the event's total **+7,080** vehicle uplift, with Balagtas
(+1,414, +9 %) and Marilao (+792, +16 %) taking the remainder; **3 of 19** toll points are affected
and the other 16 run normally.

> **Correction carried forward.** An earlier draft reported an arena uplift of **1.59×**. That figure
> was obtained by selecting the events that showed the largest increases and averaging them, which
> selects on the outcome. Computed over all events against local baselines, the representative uplift
> is **1.16×**. The 1.59× figure must not be reinstated.

### 4.1.4.2 Incident Module

**Incident Walk-Forward Forecast.** Incident counts are modelled with a **Negative Binomial GLM** to
account for overdispersion, with weather, volume, and calendar indicators as covariates. On a 90-day
scored window against 1,186 training days the champion records **WMAPE 9.75 %**, **MAE 12.92
incidents/day**, **RMSE 16.93**, **MASE 0.718**, and **R² 0.262**. Rolling-origin validation at the
1–7 day horizon gives **WMAPE 10.19 %** against a baseline of 18.95 %, and is marked **usable**. The
model forecasts **10,097** incidents over the next seven days, with peak risk on **3 July 2026**.

The strongest single predictor is **`volume_ratio_7`** at **0.463 importance** — that is, recent
volume relative to its seven-day norm — which is a more defensible driver than precipitation and
should replace the draft's assertion that precipitation is the most influential covariate.

**Predicted Incidents Ranking.** Segment-level risk is apportioned from the corridor forecast by each
exit's historical share. **Sta. Rita Guiguinto** leads at **174 predicted incidents**, **21 %** of the
845-incident corridor total on its own, followed by Meycauayan (107) and Balagtas (90); the top three
together account for **44 %** of the corridor forecast.

> The draft describes Geographically Weighted Regression producing segment-level scores. The
> delivered panel states plainly that the ranking is **derived, not separately modelled** — the
> corridor forecast split by historical share. The chapter must match the panel, which already
> discloses this.

**Secondary Incident Risk.** The system estimates the probability that a primary incident induces a
second within **2 km** while the first is still being responded to, using a **30-minute** buffer. On
**4,361** scored incidents the model records **AUC 0.620** against a base rate of **11.5 %**, with a
mean predicted secondary risk of **10.3 %**. Risk is highest at **San Fernando (14.5 %, n = 159)**.

An AUC of 0.620 is modest — meaningfully better than chance (0.5), well short of strong discrimination
— and the chapter should characterise it that way rather than as an established empirical basis.

**Severity and Time to Clear.** The severity model, champion **XGBoost**, predicts **4,321** Property
Damage Only events against **3,926** actual. The Cox Proportional Hazard model reports a
**concordance index of 0.625** and **MAE 16.5 minutes** on **18,724** scored events with **85.9 %**
coverage, giving a **mean predicted clearance of 20.3 minutes**.

> **Two definitional cautions.** The survival model is built from **report-to-response** duration,
> because no scene-cleared timestamp exists in the warehouse; the panel says so and the chapter must
> too, since "time to clear" otherwise means something the data cannot support. Separately, the
> fatality class is too rare for the model to predict — **11 fatal events** in the holdout, which no
> candidate model ever predicts — so reported accuracy is carried by the dominant class.

### 4.1.4.3 Environmental Impact (Emission) Module

**Seven-Day Corridor CO₂ Forecast.** A **Gradient Boosting Regressor** trained on 1,320 days and
scored on a 294-day chronological holdout achieves **MAPE 9.63 %**, **WMAPE 7.49 %**, **RMSE 54.8
tonnes/day**, **MASE 0.908**, and **R² 0.577**. At 9.63 % the model **satisfies** the fifteen percent
green threshold specified in the Corridor CO₂ Emission Estimation Accuracy indicator in Table 3.6.3.

> **But the seven-day horizon specifically does not validate.** Rolling-origin accuracy at the 1–7 day
> horizon records **MASE 1.176** against a baseline WMAPE of 7.77 %, and the system marks that horizon
> **not usable**. The aggregate holdout result is sound; the seven-day claim the section is built
> around is not yet supported. The chapter should report the holdout figure and state the horizon
> limitation, which is materially more defensible than reporting the headline alone.

**Forecasted Fleet Composition.** Dirichlet regression on compositional shares is the champion at
**MAPE 11.80 %** and **MASE 0.602**, validated over **42 rolling origins at a 7-day horizon**. Prophet
and XGBoost score lower MAPE but are rejected for failing to beat the climatology baseline on
Aitchison distance — the appropriate metric for compositional data, since shares must sum to unity.
That rejection is worth one sentence in the chapter: it is a case where the obvious metric and the
correct metric disagree, and the pipeline followed the correct one.

---

## 4.1.5 Prescriptive Analysis

The prescriptive tier converts the forecasts of Section 4.1.4 into resource-constrained
recommendations.

**Patrol and Tow Resource Deployment.** An exact Maximal Covering Location solve distributes patrol
units across exits to cover as much predicted risk as possible. With a **fleet of 4 units** at an
**8 km coverage radius**, the solution staffs 4 of 20 exits and covers **100 %** of the ranking's
844-incident forecast (842 of 844). Fleet size and radius are operator inputs, because the warehouse
records nothing about NLEX's actual patrol fleet — the panel states this, and the chapter should.

**Response Prioritisation.** The delivered build ranks candidate zones through a **Secondary Risk
Priority Matrix**, crossing secondary-incident risk against predicted clearance time. **3 of 12**
exits combine above-median risk (≥ 1.69 %) with above-median clearance (≥ 86 min), led by **Angeles
(3.27 % risk, 86.1 min, n = 128)**, then Pulilan (2.18 %, 88.3 min) and Balagtas (1.81 %, 86.8 min).

> The draft reports a **TOPSIS** ranking with closeness coefficients. The build implements the
> quadrant matrix above, as the note beneath Figure 4.1.28 already records. Either name the delivered
> method or implement TOPSIS; a closeness coefficient cannot be reported for a method that was not run.

**Proactive Speed Advisory.** The weather-incident risk model gives a high-incident-day probability
rising from **14.0 % at 0 mm rain to 14.3 % at 100 mm**, with **AUC 0.704** against a base rate of
26.9 %.

That spread — **three tenths of a percentage point across the full rainfall range** — does not support
a weather-triggered advisory, and the chapter should not claim one. The AUC indicates the model
separates high-incident days using its other features; rainfall is not the lever.

### Items the chapter currently claims that the build does not implement

These are collected rather than scattered, because each is individually checkable by a panel:

| Draft claim | Delivered state |
| --- | --- |
| Gaussian Mixture Model regimes; Underwood speed-flow fit; critical density | Not rendered on any page |
| Getis-Ord Gi\* hotspot significance; network-constrained KDE | Segments ranked by count |
| Geographically Weighted Regression for segment risk | Corridor forecast split by historical share |
| Linear-programming **toll lane staffing** optimiser | **Now delivered** as the Booth Staffing Plan panel |
| TOPSIS closeness coefficients | Not implemented; prioritisation is delivered as Resource Staging and the Patrol Alert Schedule |
| Fuzzy rule-based Variable Speed Limit | **Now delivered** as the Congestion Response Advisory panel |
| Weather-triggered / surge alert rules | Delivered within the Congestion Response Advisory and the Patrol Alert Schedule |
| Monte Carlo emission scenario bands | Not implemented |
| Emission reduction strategy evaluation | **Now computed**, not illustrative — see below |

**The emission panel has been rebuilt since the draft was written, and the draft's screenshot is
stale.** The old "Projected Impact of Strategies (Throughput Gain)" card showed three placeholder
bars labelled Strategy A, B and C. It is gone. The delivered panel is *Projected % Emission Reduction
by Strategy*, computed in `emissions-prescriptive.service.ts` from corridor data, and it reports:
heavy-vehicle share reduced by one percentage point at **3.39 %** of corridor CO₂, faster incident
clearance at **0.48 %**, and added response capacity at the busiest hours at **0.33 %**.

The first bar is drawn dashed because it is a **policy target the reader sets**, not an observation —
the panel accepts a heavy-share shift of up to 4.2 percentage points and recomputes. The other two
are derived from the delay-carbon figures reported in Section 4.1.3.3. The figure should therefore be
reproduced from the current build, and the sentence that called it illustrative withdrawn.

The honest reading of the magnitudes is still worth stating: the largest modelled intervention moves
**3.39 %** of corridor carbon, and the two operational levers move well under one percent each. The
prescriptive tier's value is in ranking interventions, not in promising large reductions.

### A disclosure the chapter does not currently make

The warehouse's own model evaluation records state, against every speed-based model, that they were
*"scored on `bronze.nlex_traffic_volume`, whose speed column is synthetic capstone data."*

Every speed figure in this chapter that does **not** come from the Waze feed therefore rests on
generated values. The Waze-derived jam speeds quoted in 4.1.3.1 and 4.1.3.2 are real observations;
the weather-speed models in `gold.ml_weather_speed_metadata` are not. **This distinction must appear
in Chapter 4.** A panel that discovers it unaided will question every other number in the chapter;
a chapter that states it plainly loses one claim and keeps its credibility.

---

## 4.1.6 Register of Corrections

| # | Draft statement | Delivered data | Action |
| --- | --- | --- | --- |
| 1 | Holiday-adjacent days register volumes **above** the control-day mean | 20 of 21 holidays fall **below**; Good Friday −49.0 % | Direction reversed |
| 2 | Higher daily **incident** count in wet conditions | Overall rate marginally lower (5.167 vs 5.186 /h); **crashes** 19.3 % higher | Narrowed to crashes |
| 3 | Mean speed **reduction** under wet pavement | Observed jam speed **higher** in wet (8.8 vs 8.3 km/h) | Label as model coefficient, not observation |
| 4 | Volume champion unspecified; LSTM shown selected | **Prophet** champion; LSTM rank 7 of 8, MASE 1.634, rejected | Champion named; caption explained |
| 5 | Single volume accuracy figure | 80/20 yields a champion; **90/10 accepts nothing** | Split must be named |
| 6 | Incident model result presented cleanly | Champion carries `OVERFITTING`, train R² 0.514 vs test 0.262 | Disclosed |
| 7 | Precipitation the most influential incident covariate | `volume_ratio_7` at 0.463 importance | Predictor corrected |
| 8 | Segment risk from Geographically Weighted Regression | Derived by historical share; panel says so | Method corrected |
| 9 | Secondary risk an "empirical basis" | AUC 0.620, base rate 11.5 % | Characterised as modest |
| 10 | "Time to clear" | Built from **report-to-response**; no scene-cleared timestamp exists | Definition stated |
| 11 | CO₂ seven-day forecast satisfies threshold | Holdout MAPE 9.63 % passes; **7-day horizon MASE 1.176, marked unusable** | Horizon caveat added |
| 12 | Corridor CO₂ total | **161,224.7 t** (CY2025); earlier 143k and 188k figures are stale | Figure replaced |
| 13 | Emission reduction strategies called a mock | **Rebuilt and now computed**: 3.39 % / 0.48 % / 0.33 %, Strategy A a user-set policy target | Criticism withdrawn; screenshot re-taken |
| 14 | Weather-triggered advisory | 14.0 %→14.3 % across 0–100 mm rain | Claim withdrawn |
| 15 | Apprehension and Undercap Table; mobile community reports | Neither present in the warehouse | Remove from Tables 4.1.1–4.1.2 |
| 16 | Speed analyses presented as empirical | Non-Waze speed is **synthetic capstone data** per the warehouse's own records | Disclosure added |

---

## Additions to Notes for the Group

*Proposed as items 7 to 10, following the six in the draft.*

7. **Sixteen corrections are listed in Section 4.1.6, of which five reverse the direction of a claim.**
   The most visible are the holiday effect, which is negative rather than positive, and the wet-weather
   effect, which holds for crashes but not for incidents overall. Note 1 anticipated exactly this; the
   sentences have been rewritten rather than back-filled.

8. **Nine analyses named in the draft are not implemented in the build** (Section 4.1.5, final table).
   The group should decide, per row, whether to implement, to reword to the delivered method, or to
   move to Chapter 5 as future work. The proponents recommend rewording, since every one of these is
   checkable against the screenshots already embedded in the chapter.

9. **Three panels named as missing in an earlier review have since been built** — Booth Staffing Plan,
   Congestion Response Advisory, and the computed emission-reduction strategies. Any review note
   predating 8 October that calls these absent or illustrative is stale. Conversely, the Secondary
   Incident Risk and Time to Clear cards reproduced in the draft's Figures 4.1.20 and 4.1.21 **no
   longer exist as separate panels**; that material is now consolidated into Response Time Breakdown
   and Predicted Median Response Time, so those two screenshots must be replaced.

10. **Speed data that does not come from Waze is synthetic**, per the warehouse's own evaluation
    records. The proponents recommend stating this once, plainly, in 4.1.3.1. A limitation disclosed
    is a limitation defended.
