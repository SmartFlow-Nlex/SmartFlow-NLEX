# Chapter 4: Implementation, Results, and Discussion

This chapter presents the empirical results produced by SmartFlow NLEX following the full
implementation of the data pipeline and the analytics engines described in Chapter 3, and documents
the system that produces and delivers them. Section 4.1 reports the descriptive, predictive and
prescriptive outputs of the three operational modules, each alongside the dashboard visualisation
that renders it. Section 4.2 documents the implementation itself: the interface design system, the
environment and repository, authentication and session management, and the maintenance scheduler.

## 4.1 Presentation of Results

*Provenance note. Prepared 8 October 2026. Every bracketed placeholder in the earlier draft has been replaced with a value
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

![Traffic Volume Trend along the NLEX Corridor](manuscript-figures/web/Figure_4.1.2.jpg)

**Figure 4.1.2** *Traffic Volume Trend along the NLEX Corridor*


**Average Volume by Hour and Day of Week.** The weekday profile peaks in the evening. Mean weekday
volume is highest at **18:00 (6 PM)**, followed by 19:00 and 17:00, with a secondary morning
concentration at **07:00**. **Friday** carries the highest mean daily volume of any day at
**358,514** entries, narrowly ahead of Saturday at 356,768, which is consistent with the pre-weekend
outbound movement NLEX already anticipates through calendar-based planning. **Sunday** is the
quietest day at **282,076**, some 21 % below Friday.

![Average Traffic Volume by Hour and Day of Week](manuscript-figures/web/Figure_4.1.3.jpg)

**Figure 4.1.3** *Average Traffic Volume by Hour and Day of Week*


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

![Traffic Volume Distribution by Toll Plaza](manuscript-figures/web/Figure_4.1.4.jpg)

**Figure 4.1.4** *Traffic Volume Distribution by Toll Plaza*


**Average Speed in Jams by Hour.** Using jam speed values supplied by the Waze Partner Hub, mean
speed during congested conditions falls to a minimum of **7.1 km/h at 04:00** and rises to a maximum
of **10.7 km/h at 21:00**. The corridor-wide congestion index for 2025 stands at **2.74 of 5**,
against 2.73 in the preceding period.

![Average Speed in Jams by Hour](manuscript-figures/web/Figure_4.1.5.jpg)

**Figure 4.1.5** *Average Speed in Jams by Hour*


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

![Holiday Impact on Traffic Volume Relative to Control Days](manuscript-figures/web/Figure_4.1.6.jpg)

**Figure 4.1.6** *Holiday Impact on Traffic Volume Relative to Control Days*

in Section 4.1.4.1.

### 4.1.3.2 Incident Module

**Incident Trend.** Over the twelve months to 30 June 2026 the corridor recorded **45,521**
incidents, comprising **5,024** road crashes and **40,497** stalled-vehicle events — an increase on
the **40,616** recorded in the preceding equivalent period. The records carry **805** injuries and
**12** fatalities. Stalled vehicles outnumber crashes roughly eight to one, which is the single most
consequential structural fact in this module: the corridor's incident burden is overwhelmingly
mechanical rather than collision-driven.

![Incident Trend along the NLEX Corridor](manuscript-figures/web/Figure_4.1.7.jpg)

**Figure 4.1.7** *Incident Trend along the NLEX Corridor*


**Incident Occurrence and Clearance.** Mean time to first responder is **27.1 minutes** across 12,243
scored events. Mean time to clear is **57.4 minutes** overall, decomposing into **22.1 minutes** for
accidents and **72.0 minutes** for breakdowns.

> **Measurement caveat that belongs in the chapter.** Clearance coverage is **36.7 %** — of 40,497
> breakdowns only 11,803 carry a usable clearance duration, against 4,893 of 5,024 accidents. The
> breakdown figure is therefore computed on roughly a quarter of the events it describes. The draft's
> log-normal median and ninetieth-percentile sentence should state this coverage, or the claim rests
> on a silent majority of missing values.

![Incident Occurrence by Time of Day](manuscript-figures/web/Figure_4.1.8.jpg)

**Figure 4.1.8** *Incident Occurrence by Time of Day*


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

![Incident Hotspots by Corridor Segment](manuscript-figures/web/Figure_4.1.9.jpg)

**Figure 4.1.9** *Incident Hotspots by Corridor Segment*

![Response Time Breakdown (Descriptive)](manuscript-figures/web/Figure_4.1.11b.jpg)

**Figure 4.1.11b** *Response Time Breakdown (Descriptive)*


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

![Distribution of Incident Causes](manuscript-figures/web/Figure_4.1.10.jpg)

**Figure 4.1.10** *Distribution of Incident Causes*


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

![Daily Incident Frequency under Dry and Wet Weather](manuscript-figures/web/Figure_4.1.11.jpg)

**Figure 4.1.11** *Daily Incident Frequency under Dry and Wet Weather*


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

![Corridor Carbon Dioxide Emission Trend by Vehicle Class](manuscript-figures/web/Figure_4.1.12.jpg)

**Figure 4.1.12** *Corridor Carbon Dioxide Emission Trend by Vehicle Class*


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

![Fleet Composition against Pollution Load by Vehicle Class](manuscript-figures/web/Figure_4.1.13.jpg)

**Figure 4.1.13** *Fleet Composition against Pollution Load by Vehicle Class*


**Delay-Induced Carbon Excess.** The idling penalty attributable to incident-induced delay totals
**1,151.5 tonnes**, or **0.71 %** of corridor emissions for the period, arising from **3,931** delay
incidents. Of these, **62 long-duration incidents** account for **72.5 %** of the excess.

That last figure is the one worth putting in front of a panel: **under 2 % of delay incidents produce
nearly three-quarters of the delay-induced carbon**, which is a far stronger argument for faster
clearance than the aggregate 0.71 % suggests. The draft's framing — that delay excess concentrates in
a few segments — is directionally right but understates the case by distributing it spatially rather
than by incident duration.

![Emission Concentration by Hour and Weekday](manuscript-figures/web/Figure_4.1.14.jpg)

**Figure 4.1.14** *Emission Concentration by Hour and Weekday*

![Heavy-Vehicle Share of Corridor Carbon Dioxide](manuscript-figures/web/Figure_4.1.13b.jpg)

**Figure 4.1.13b** *Heavy-Vehicle Share of Corridor Carbon Dioxide*


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

![Traffic Volume Walk-Forward Forecast](manuscript-figures/web/Figure_4.1.15.jpg)

**Figure 4.1.15** *Traffic Volume Walk-Forward Forecast*

![Measured Air Quality by Month](manuscript-figures/web/Figure_4.1.14b.jpg)

**Figure 4.1.14b** *Measured Air Quality by Month*


**Predictive Congestion State Map.** The congestion classifier predicts a discrete state per
exit-hour from 1 to 168 hours ahead, scored over **33,480** exit-hours. The champion, **XGBoost**,
achieves **66.7 % accuracy**, against an exit-hour profile baseline of **60.5 %** and a majority-class
baseline of 50.0 %. GRU is also accepted at 63.1 %; QRF is rejected at 60.3 % for failing to beat the
profile baseline. At the horizon shown on the delivered panel, **5 of 20 segments** are classified
severe, concentrated from **Sta. Rita Guiguinto through Mexico**.

The honest reading is that the classifier beats a seasonal profile by about **six percentage points**.
That is a real gain and it is not a large one, and the chapter is stronger for saying so.

![Predicted Congestion State of the NLEX Corridor](manuscript-figures/web/Figure_4.1.16.jpg)

**Figure 4.1.16** *Predicted Congestion State of the NLEX Corridor*


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

![Forecasted Event Surge Impact by Toll Exit](manuscript-figures/web/Figure_4.1.17.jpg)

**Figure 4.1.17** *Forecasted Event Surge Impact by Toll Exit*

![Live and Forecast Corridor Map](manuscript-figures/web/Figure_4.1.16b.jpg)

**Figure 4.1.16b** *Live and Forecast Corridor Map*


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

![Incident Count Walk-Forward Forecast](manuscript-figures/web/Figure_4.1.18.jpg)

**Figure 4.1.18** *Incident Count Walk-Forward Forecast*


**Predicted Incidents Ranking.** Segment-level risk is apportioned from the corridor forecast by each
exit's historical share. **Sta. Rita Guiguinto** leads at **174 predicted incidents**, **21 %** of the
845-incident corridor total on its own, followed by Meycauayan (107) and Balagtas (90); the top three
together account for **44 %** of the corridor forecast.

> The draft describes Geographically Weighted Regression producing segment-level scores. The
> delivered panel states plainly that the ranking is **derived, not separately modelled** — the
> corridor forecast split by historical share. The chapter must match the panel, which already
> discloses this.

![Predicted Incident Hotspots](manuscript-figures/web/Figure_4.1.19.jpg)

**Figure 4.1.19** *Predicted Incident Hotspots*


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

![Predicted Response Time Breakdown](manuscript-figures/web/Figure_4.1.20.jpg)

**Figure 4.1.20** *Predicted Response Time Breakdown*


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

![Corridor Carbon Dioxide Walk-Forward Forecast](manuscript-figures/web/Figure_4.1.22.jpg)

**Figure 4.1.22** *Corridor Carbon Dioxide Walk-Forward Forecast*

![Predicted Median Response Time](manuscript-figures/web/Figure_4.1.21.jpg)

**Figure 4.1.21** *Predicted Median Response Time*


**Forecasted Fleet Composition.** Dirichlet regression on compositional shares is the champion at
**MAPE 11.80 %** and **MASE 0.602**, validated over **42 rolling origins at a 7-day horizon**. Prophet
and XGBoost score lower MAPE but are rejected for failing to beat the climatology baseline on
Aitchison distance — the appropriate metric for compositional data, since shares must sum to unity.
That rejection is worth one sentence in the chapter: it is a case where the obvious metric and the
correct metric disagree, and the pipeline followed the correct one.

![Forecasted Vehicle Class Composition](manuscript-figures/web/Figure_4.1.23.jpg)

**Figure 4.1.23** *Forecasted Vehicle Class Composition*


---

## 4.1.5 Prescriptive Analysis

The prescriptive tier converts the forecasts of Section 4.1.4 into resource-constrained
recommendations.

**Patrol and Tow Resource Deployment.** An exact Maximal Covering Location solve distributes patrol
units across exits to cover as much predicted risk as possible. With a **fleet of 4 units** at an
**8 km coverage radius**, the solution staffs 4 of 20 exits and covers **100 %** of the ranking's
844-incident forecast (842 of 844). Fleet size and radius are operator inputs, because the warehouse
records nothing about NLEX's actual patrol fleet — the panel states this, and the chapter should.

![Resource Staging and Patrol Repositioning](manuscript-figures/web/Figure_4.1.27.jpg)

**Figure 4.1.27** *Resource Staging and Patrol Repositioning*


**Response Prioritisation.** The delivered build ranks candidate zones through a **Secondary Risk
Priority Matrix**, crossing secondary-incident risk against predicted clearance time. **3 of 12**
exits combine above-median risk (≥ 1.69 %) with above-median clearance (≥ 86 min), led by **Angeles
(3.27 % risk, 86.1 min, n = 128)**, then Pulilan (2.18 %, 88.3 min) and Balagtas (1.81 %, 86.8 min).

![Booth Staffing Plan](manuscript-figures/web/Figure_4.1.24.jpg)

**Figure 4.1.24** *Booth Staffing Plan*

![Patrol Alert Schedule](manuscript-figures/web/Figure_4.1.28.jpg)

**Figure 4.1.28** *Patrol Alert Schedule*


> The draft reports a **TOPSIS** ranking with closeness coefficients. The build implements the
> quadrant matrix above, as the note beneath Figure 4.1.28 already records. Either name the delivered
> method or implement TOPSIS; a closeness coefficient cannot be reported for a method that was not run.

**Proactive Speed Advisory.** The weather-incident risk model gives a high-incident-day probability
rising from **14.0 % at 0 mm rain to 14.3 % at 100 mm**, with **AUC 0.704** against a base rate of
26.9 %.

That spread — **three tenths of a percentage point across the full rainfall range** — does not support
a weather-triggered advisory, and the chapter should not claim one. The AUC indicates the model
separates high-incident days using its other features; rainfall is not the lever.


![Agent-Based Simulation Sandbox](manuscript-figures/web/Figure_4.1.31.jpg)

**Figure 4.1.31** *Agent-Based Simulation Sandbox*

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

![Projected Percentage Emission Reduction by Strategy](manuscript-figures/web/Figure_4.1.30.jpg)

**Figure 4.1.30** *Projected Percentage Emission Reduction by Strategy*

![Congestion Response Advisory](manuscript-figures/web/Figure_4.1.25.jpg)

**Figure 4.1.25** *Congestion Response Advisory*


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

## 4.1.7 Additions to Notes for the Group

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



---

# 4.2 System Implementation

*This section documents the implementation of the system that produces the results reported in Section 4.1: the interface they are rendered through, the environment and repository they are built in, the authentication that guards them, and the one module through which operators write back to the warehouse.*



## 4.2.1 Global UI/UX Design System

The Decision-Intelligence dashboard through which the results in Section 4.1 are
rendered was implemented on a centralized design system rather than through
per-component styling. All visual constants — colour, typography, spacing,
elevation, corner radius, and transition timing — were declared once as CSS
custom properties on the document root and consumed by reference throughout the
application. The proponents adopted this arrangement so that a change to the
visual identity would propagate across every page without editing the components
themselves, and so that the same declarations could be redefined under an
alternative theme without duplicating the component layer.

### 4.2.1.1 Design Tokens

Fifty-six design tokens were declared, organized into eleven families. Table
4.2.1 summarizes each family and its role in the interface.

**Table 4.2.1** *Design Token Families Implemented in the Global Stylesheet*

| Token Family | Count | Representative Tokens | Role in the Interface |
| --- | --- | --- | --- |
| Brand | 4 | `--brand-primary` (#3660ff), `--brand-accent` (#ea8b0d) | Primary identity colour and the accent applied for emphasis |
| Background | 8 | `--bg-body`, `--bg-surface`, `--bg-sidebar` | Page, card, and navigation surfaces |
| Text | 5 | `--text-primary` (#071a44), `--text-secondary`, `--text-muted` | Three-level type hierarchy, with on-dark variants |
| Border | 2 | `--border-default`, `--border-strong` | Card edges and separators |
| Semantic Colour | 14 | `--color-success`, `--color-warning`, `--color-danger`, each with `-bg` and `-border` | Status communication, held constant across all modules |
| Chart | 6 | `--chart-text`, `--chart-axis`, `--chart-split`, `--chart-tooltip-bg` | Visualization chrome (see Section 4.2.1.4) |
| Spacing | 5 | `--space-xs` (4px) through `--space-xl` (28px) | Fixed spacing scale in place of arbitrary values |
| Radius | 5 | `--radius-sm` (8px) through `--radius-full` (999px) | Corner treatment by component class |
| Shadow | 4 | `--shadow-sm`, `--shadow-card`, `--shadow-lg` | Elevation hierarchy |
| Transition | 2 | `--transition-fast` (150ms), `--transition-base` (220ms) | Consistent motion timing |
| Layout | 1 | `--sidebar-width` (280px) | Navigation geometry |

The semantic colour family was deliberately excluded from the per-module accent
mechanism described in Section 4.2.1.2. Success, warning, and danger communicate
meaning rather than identity, and allowing them to vary by module would have
caused a red indicator to signify different conditions on different pages.

### 4.2.1.2 Typography and Module Identity

Typography was standardized on the Inter typeface, applied at the document body
and inherited throughout, with a system font stack (`ui-sans-serif`,
`system-ui`, `-apple-system`, `Segoe UI`, `Roboto`) specified as fallback so
that the interface degrades predictably where the web font fails to load.

Module identity is carried by a single token, `--page-accent`, declared on the
page header and inherited by every descendant element on that page. Three values
were defined, corresponding to the system's three operational modules.

**Table 4.2.2** *Per-Module Accent Values*

| Module | Class | `--page-accent` |
| --- | --- | --- |
| Traffic | `.viz-traffic` | #2a78d6 (blue) |
| Incident | `.viz-incident` | #b8760a (amber) |
| Environmental Impact | `.viz-emissions` | #0f8a4a (green) |

Because the token is declared on the header and inherits downward, a panel
authored against `var(--page-accent)` renders correctly on all three modules
without conditional logic. Components appearing on only one module reference
that module's value directly, no inheritance being available to them.

### 4.2.1.3 Theme Implementation

A dark presentation mode was implemented by redefining the token values rather
than by overriding component styles. The same custom property names are
re-declared under two selectors: `:root[data-theme="dark"]`, which serves an
explicit operator selection, and a `prefers-color-scheme: dark` media query
guarded by `:root:not([data-theme="light"])`, which serves the operating system
preference while allowing an explicit light selection to take precedence.
Forty-one explicit dark-theme declarations and twenty media-query declarations
were required.

The consequence of this approach is that a component authored against tokens
requires no theme-specific code of its own, whereas a component authored against
literal colour values does not participate in the mechanism at all. Section
4.2.1.5 reports the measured effect of that distinction.

### 4.2.1.4 Charting Layer

As stated in Section 4.1.3, the analytical outputs are rendered as Apache
ECharts visualizations and Mapbox geospatial layers. ECharts constructs its own
canvas and does not participate in CSS inheritance, so a chart configuration
object cannot reference a custom property; the declaration is passed through
uninterpreted and the chart reverts to its library defaults.

A dedicated hook was therefore implemented to bridge the two systems. It reads
the computed values of the chart token family from the document root and returns
them as literal colour strings for use within chart configuration. The hook
re-reads on both paths by which the theme can change — a mutation observer on
the theme attribute, and a listener on the colour-scheme media query — so that
charts re-theme in step with the surrounding interface rather than requiring a
page reload.

The resulting convention is that document markup references tokens directly,
while chart configuration consumes the resolved literals returned by the hook.

### 4.2.1.5 Validation of the Design System

The design system was validated by migrating a set of panels authored before its
adoption. The four panels comprising the Incident module's Predictive tab —
reported in Section 4.1.4.2 as Figures 4.1.18 through 4.1.21 — contained 186
hardcoded colour literals between them. Because those literals bypassed the token
layer, the panels retained their light-mode palette when the interface was
switched to dark presentation.

The effect was measured in two ways: by counting the literals removed from
source, and by an automated contrast audit that measures every text element
against the surface it is painted on and compares the result against the 3:1
minimum specified for large text in WCAG 2.1.

**Table 4.2.3** *Design System Migration, Incident Predictive Tab*

| Measure | Value |
| --- | --- |
| Hardcoded colour literals removed | 186, across four panels |
| Text elements below 3:1 in dark presentation, after migration | 0 |
| Light presentation after migration | Unchanged |

The severity of the pre-migration condition is best conveyed by a single case
rather than an aggregate count. A panel heading was authored as `#0f172a`, the
literal value carried by `--text-primary` under the light theme. Against the
dark theme's card surface of `#161b22`, that pairing yields a contrast ratio of
1.03:1 — text and background of near-identical relative luminance, which is to
say the heading was not legible at all. The ratio follows directly from the two
colour values and is independently recomputable.

A controlled comparison remains available within the delivered system, because
the migration was not applied uniformly. The Traffic module's Predictive tab
retains 244 hardcoded literals across two panels and continues to fail the same
audit in dark presentation, while the migrated Incident tab passes it without
exception. The two tabs differ in no other respect relevant to theming.


![Interface Panels Rendered Without Design Tokens in Dark Presentation](manuscript-figures/web/Figure_4.1.32_without-design-tokens-dark.jpg)

**Figure 4.1.32_without-design-tokens-dark** *Interface Panels Rendered Without Design Tokens in Dark Presentation*


**Figure 4.1.32** *Interface Panels Rendered Without Design Tokens in Dark Presentation*


![Equivalent Panels Rendered Through the Design Token System](manuscript-figures/web/Figure_4.1.33_with-design-tokens-dark.jpg)

**Figure 4.1.33_with-design-tokens-dark** *Equivalent Panels Rendered Through the Design Token System*


**Figure 4.1.33** *Equivalent Panels Rendered Through the Design Token System*

Absolute failure counts are not reported in Table 4.2.3 because they vary
between measurements — the number of rendered elements depends on the data
present at the time of capture — and because the audit tool returns false
positives against elements whose background is a gradient rather than a solid
colour, which it cannot resolve. The literal counts and the 1.03:1 ratio are
stable and were preferred on that basis.

### 4.2.1.6 Deviation from the Planned Implementation

Section 3.7 specified that global design tokens would be configured through a
Tailwind CSS theme configuration file. The delivered system does not use that
file, and the deviation is recorded here rather than reconciled.

Tailwind CSS version 4 is present among the project dependencies and registered
as a PostCSS plugin, but two conditions prevent it from functioning as the design
system in practice. First, version 4 replaced the JavaScript configuration file
with CSS-based configuration, so `tailwind.config.js` is not generated by that
version and its absence is expected rather than an omission. Second, the global
stylesheet does not import the Tailwind layer and the component markup does not
employ Tailwind utility classes; the interface is styled through CSS Modules and
the custom property system documented in Sections 4.2.1.1 through 4.2.1.4.

The objective expressed in Section 3.7 — a single source of truth for brand
colour, typography, and spacing applied uniformly across every page — is met by
the implemented token system. The mechanism differs from the one specified. The
proponents recommend that the unused dependency be removed, or the configuration
completed, so that the delivered system and its documentation agree.


## 4.2.2 Environment Configuration

The system is deployed as two independently hosted services — a statically
exported Next.js dashboard and an Express application server — which draw on a
shared PostgreSQL/PostGIS warehouse and five external providers. Because no
credential may be committed to the repository and because the two services are
configured by different mechanisms, the proponents specified the configuration
surface explicitly rather than allowing it to accumulate as each provider was
introduced.

### 4.2.2.1 Delivery Stages

The dashboard is delivered as an **installed desktop application** rather than as
a published website. It is packaged with Electron, which loads the static export
described in Section 4.2.2.4 and presents it in its own window. The proponents
adopted this form because the system is an operations console for the traffic
control centre: its users are a known set of operators at known workstations, and
an installed application neither requires a public address nor exposes the
corridor data to one.

Three stages follow from that. Table 4.2.4 states what each comprises.

**Table 4.2.4** *Delivery Stages and Their Hosts*

| Stage | Dashboard | Application Server | Warehouse |
| --- | --- | --- | --- |
| Development | Local development server, port 3002 | Local watch process, port 4000 | AWS RDS |
| Desktop, unpackaged | Static export served locally and loaded by the desktop shell | Local application server | AWS RDS |
| Desktop, installed | Windows installer produced by the packaging step | A host reachable from the operator workstation | AWS RDS |

A single warehouse instance serves all three stages. The proponents adopted this
arrangement because the system draws on one corridor dataset assembled by the
extract-transform-load pipeline described in Section 4.1.1, and a duplicated
instance would diverge from it as the pipeline continued to run against only one.
The limitation this imposes is recorded rather than resolved: there is no stage
isolated from operational data, and none is therefore suitable for exercising
operations that write to or delete from the warehouse.

### 4.2.2.2 Configuration Parameters

Application-server parameters are supplied through an environment file in
development and through the environment of the host that runs the application
server in a desktop deployment. Table 4.2.5 states each parameter and the value class it carries
per stage.

**Table 4.2.5** *Application Server Configuration Parameters*

| Parameter | Development | Desktop deployment | Function |
| --- | --- | --- | --- |
| `PORT` | 4000 | Assigned by the host | The hosting platform injects the port at container start; a fixed value renders the service unreachable |
| `NODE_ENV` | Unset | `production` | Selects production behaviour in the server framework |
| `FRONTEND_ORIGIN` | Local dashboard origin | Deployed dashboard origin for that stage | Cross-origin request allow-list |
| `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD` | Warehouse instance | Same instance | Assembled into a connection string at startup, with the password percent-encoded |
| `PG_SSL_MODE` | `relaxed` | `relaxed` | Transport security mode; see Section 4.2.2.3 |
| `REDIS_REST_URL`, `REDIS_REST_TOKEN` | Cache provider | Same provider | Live incident feed cache |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Auth provider | Same provider | Operator authentication and audit logging |
| `CLIMATIQ_API_KEY` | Emissions provider | Same provider | Emission factor lookup, Section 4.1.5 |
| `GLM_API_KEY`, `GLM_MODEL`, `GLM_BASE_URL` | Language model provider | Same provider | Narrative generation layer, Section 4.1.7 |

Dashboard parameters number two: the application server's base address and the
geospatial rendering token. Both are declared under the framework's public prefix
and are therefore compiled into the browser bundle.

### 4.2.2.3 Transport Security to the Warehouse

The managed warehouse requires that all connections be encrypted, and refuses
unencrypted ones. It presents a certificate issued by a regional authority that
the application runtime does not carry in its default trust store, so full
certificate-chain verification fails even though the connection is encrypted.

Two resolutions are available. The runtime may be supplied with the provider's
certificate authority bundle, after which full verification succeeds; or
verification may be relaxed while encryption is retained. The delivered system
takes the second, selected by a configuration parameter that also admits the
first. The proponents record the distinction because the two are frequently
conflated: the connection is encrypted in transit under both settings, and what
the relaxed setting forgoes is verification of the server's identity, which
leaves the connection exposed to interception by an intermediary rather than to
passive observation.

### 4.2.2.4 The Consequence of Static Export

The dashboard is produced by static export, which resolves every public
configuration value at build time and writes it into the emitted JavaScript. No
server process reads configuration at request time, because none exists.

Two operational consequences follow, both of which the proponents encountered
before the mechanism was understood. A value altered after a build has no effect
until the application is rebuilt, there being nothing running to re-read it. And
the address of the application server is frozen into the installer, so every
machine that receives it will ask for that same address.

The failure mode is not self-announcing. A build carrying the development address
directs each workstation to port 4000 on itself, which succeeds only on the
machine that produced the build and presents everywhere else as an unavailable
application server rather than as a configuration error. The build order in
Table 4.2.6 exists to prevent it.

**Table 4.2.6** *Build Sequence*

| Step | Action |
| --- | --- |
| 1 | Start the application server where the installed application will reach it, and record that address |
| 2 | Add the dashboard's origin to the application server's cross-origin allow-list |
| 3 | Set the application server address in the dashboard's build configuration |
| 4 | Build and package the desktop application |
| 5 | Install it on a machine other than the one that built it and open a data-bearing page |

Steps 3 and 4 are ordered rather than interchangeable, and step 5 is performed on
a second machine deliberately: the failure described above is invisible on the
build machine.

### 4.2.2.5 Outstanding Work in the Packaged Build

Two items stand between the current state and a distributable installer, and are
recorded rather than deferred silently.

The unpackaged desktop run serves the exported files over a local HTTP address
that the application server's allow-list already admits, and works. The packaged
application instead loads its pages directly from the file system, and a page
loaded that way presents a null origin on each request. The allow-list does not
admit it, so an installed copy would render its interface and fail every data
call. Serving the exported files locally in the packaged application as well —
one code path for both runs, reusing an origin already configured — is the
proponents' recommended resolution.

The packaging configuration itself is also absent: the project declares the
packaging tool and the command that invokes it, but not the application
identifier, file manifest, or icon that the tool requires to produce a correct
installer.

Neither item affects the system as demonstrated from a development or unpackaged
desktop run, which is how the results in Section 4.1 were produced.

### 4.2.2.6 Secret Handling

No credential value appears in the repository. Two template files — one per
service — declare the parameter names with commentary and no values, so that a
new working copy can be configured without recourse to a team member's machine.

The treatment of the two services' environment files is deliberately asymmetric,
and the asymmetry is stated here because it reads as an inconsistency otherwise.
The application server's environment file is never committed: it carries
warehouse credentials, provider tokens, and API keys. The dashboard's environment
file is committed, because it carries only values under the framework's public
prefix, which are compiled into the browser bundle and are therefore disclosed to
every visitor the moment the site is served. Withholding them from the repository
would conceal nothing while making a fresh working copy harder to build.

It follows that no value requiring secrecy can be held in a dashboard parameter.
The geospatial rendering token is public of necessity and is constrained by
origin restriction in the provider's console — a control that operates on where
the token may be used rather than on who holds it, which is the only control
available to a credential shipped to a browser.

*[Figure to be captured — see Notes for the Group.]*

**Figure 4.1.34** *Application Server Configuration Parameters*

---

## 4.2.3 Repository and Version Control

### 4.2.3.1 Repository Arrangement

The project is tracked in Git across two remote repositories serving distinct
purposes. The first receives day-to-day work: each proponent pushes their own
feature branches to it. The second holds integration and handoff, and carries
exactly two long-lived branches — one for the web application comprising the
dashboard and application server, and one for the mobile application described in
Section 3.13.

The mobile application is held on a separate branch rather than in a
subdirectory of the same tree. It has an independent toolchain and release cycle
and shares nothing with the dashboard except the application programming
interface contract through which it retrieves its configuration.

### 4.2.3.2 Branch Naming and Ownership

Feature branches are named by area and owner, so that the owner of any branch is
readable from its name without consulting the commit log. Table 4.2.7 gives
representative branches from the delivered repository.

**Table 4.2.7** *Feature Branch Naming Convention*

| Branch | Owner | Area |
| --- | --- | --- |
| `Incident-Predictive-Jertz5` | Jertz | Incident predictive analytics |
| `Improved-simulator-ysa` | Ysa | Agent-based simulation sandbox |
| `Fixed-Map-Kia` | Kiarra | Live corridor map |
| `Incident-Prescriptive-Jertz` | Jertz | Incident prescriptive panels |

A numeric suffix denotes a successive attempt at the same area rather than a
different feature, which keeps the history of one iteration together instead of
distributing it across unrelated names.

### 4.2.3.3 Integration Procedure

Integration is performed by one proponent rather than by each in turn. With four
contributors working across a shared dashboard, concurrent merging produced
conflicts faster than they were resolved, and the arrangement was adopted in
response to that.

Before any feature branch is merged, a branch is created at the current
integration head and named for the merge it precedes. The merge is then
performed, the result is run locally, and the affected pages are exercised before
the integration branch is published.

These preceding branches constitute the rollback mechanism. Six were created
over the course of development, one per significant merge. Where a merge is later
found to have introduced a regression, the state before it is recoverable by
checkout, rather than by reverting a merge commit with multiple parents — an
operation that is error-prone and that complicates any subsequent merge of the
same branch. Eight further branches record successive full-stack integrations of
the application server and dashboard and are retained as checkpoints.

**Table 4.2.8** *Version Control Practices and Their Status*

| Practice | Status |
| --- | --- |
| Feature branches named by area and owner | In use |
| Single-integrator merging | In use |
| Rollback branch created before each integration merge | In use, six recorded |
| Credentials excluded by ignore rules, with template files retained | In use, verified |
| Branch protection on the integration branches | **Not configured** |
| Pull request and review required before merge | **Not configured** |

*[Figure to be captured — see Notes for the Group.]*

**Figure 4.1.35** *Repository Branch Structure*

### 4.2.3.4 Limitation in the Version Control Configuration

The final two rows of Table 4.2.8 are reported as not configured rather than
omitted from the table.

Branch protection is not enabled on the integration repository. Direct pushes to
the integration branches remain possible and pull requests are not required
before merging. The integration procedure described in Section 4.2.3.3 is
therefore observed by the proponents' agreement and not enforced by the
repository, which is a materially weaker guarantee: it holds while the convention
is remembered and fails silently when it is not.

The proponents record this as an outstanding item rather than as a completed
practice. Enabling protection on both integration branches, requiring a pull
request, and requiring one approving review would close it, and none of the three
requires any change to the delivered system.


## 4.2.4 Authentication and Session Management

Access to the Decision-Intelligence dashboard is restricted to authenticated
operators, and the operational modules visible to each depend on the role that
operator holds. This subsection documents how a session is established, where it
is held, how it is renewed before it lapses, and where authorization is decided.
It also records six defects found when the implementation was examined against
these requirements, because several of them had the property that the interface
appeared to enforce a restriction it was not in fact enforcing.

### 4.2.4.1 Identity Provider and Token Issuance

Authentication is delegated to Supabase, which issues a signed JSON Web Token on
a successful email-and-password exchange. The proponents did not implement
password storage, hashing, or reset flows; delegating them removes the most
error-prone part of an authentication system from the project's own code.

A successful sign-in returns two tokens. The **access token** is the short-lived
credential presented on each request to the application server, and is valid for
3,600 seconds. The **refresh token** is longer-lived and is used only to obtain a
new access token. The division is what allows a session to outlast the access
token without the operator signing in again, and it is the mechanism behind
Section 4.2.4.4.

The one-hour lifetime is the consequential figure: an operator monitoring the
corridor through a shift will cross it several times, so the renewal path in
Section 4.2.4.4 is exercised in ordinary use rather than only at the edges.

### 4.2.4.2 Session Storage

The browser client is configured to persist the session and to renew it
automatically. Persistence places the token pair in the browser's local storage
for the application's origin, so that a reload or a reopened window resumes the
session rather than returning the operator to the sign-in screen.

Local storage is readable by any script running on the same origin, which makes
it unsuitable for a credential in an application that embeds third-party script.
The dashboard embeds none: its dependencies are compiled into its own bundle.
The proponents record the trade-off rather than claiming it does not exist — an
HTTP-only cookie is not readable by script and would be the stronger choice, but
it requires a server to set it, and Section 4.2.2.4 explains why this application
has none.

### 4.2.4.3 Role Model

Three roles are defined, carried in the Supabase user record and read from the
token on each request.

**Table 4.2.9** *Roles and the Modules They May Reach*

| Role | May reach | May not reach |
| --- | --- | --- |
| Data Analyst | All modules | — |
| TCC Operator | Traffic, Incidents, Live Map, Maintenance, Mobile, Scenario Sandbox | Environmental Impact, Data Management, Audit Log |
| Incident Operator | Traffic, Incidents, Live Map, Maintenance, Mobile | Environmental Impact, Scenario Sandbox, Data Management, Audit Log |

A session whose record carries no role is treated as an Incident Operator, the
least privileged of the three. This is a correction: the implementation
previously defaulted to Data Analyst, the most privileged, so an incomplete user
record silently received administrative navigation.

### 4.2.4.4 Session Renewal

Renewal happens at two levels, and both are needed.

The browser client renews the access token on its own schedule before it
expires, which covers an operator reading a dashboard for longer than one token
lifetime. That alone does not cover a request that is already in flight when a
token lapses, nor one made after a laptop resumes from sleep with a token that
expired while it was suspended.

The second level handles those. All authenticated calls to the application
server pass through a single module which attaches the current access token,
and, if the server answers 401, requests a new token once and replays the
original request. The operator observes nothing. Where the refresh itself fails —
the refresh token having been revoked or expired — the module raises an
application event and the interface returns the operator to the sign-in screen,
rather than leaving them on a dashboard whose panels have quietly stopped
filling.

**Figure 4.1.36** *Session Lifecycle and Silent Renewal*

```
  Operator                Dashboard                 Application Server      Supabase
     |                        |                              |                  |
     |---- credentials ------>|                              |                  |
     |                        |------------- sign in ---------------------->    |
     |                        |<-------- access + refresh token ------------    |
     |                        | store session                |                  |
     |<--- dashboard ---------|                              |                  |
     |                        |                              |                  |
     |--- opens a module ---->|                              |                  |
     |                        |--- request + access token -->|                  |
     |                        |                              |--- verify ------>|
     |                        |                              |<--- identity ----|
     |                        |<--------- 200 data ----------|                  |
     |                        |                              |                  |
     |                 ... access token expires ...           |                  |
     |                        |                              |                  |
     |--- opens a module ---->|                              |                  |
     |                        |--- request + stale token --->|                  |
     |                        |<--- 401 token_expired -------|                  |
     |                        |------- refresh token ----------------------->   |
     |                        |<-------- new access token ------------------    |
     |                        |--- SAME request, new token ->|                  |
     |                        |<--------- 200 data ----------|                  |
     |<--- data, no prompt ---|                              |                  |
     |                        |                              |                  |
     |                 ... refresh token also invalid ...     |                  |
     |                        |------- refresh token ----------------------->   |
     |                        |<----------- refused ------------------------    |
     |<-- returned to sign-in-|                              |                  |
```

### 4.2.4.5 Where Authorization Is Decided

Authorization is enforced on the application server. Each protected route
verifies the token, resolves the role, and compares it against the roles the
route admits.

The dashboard also restricts navigation: it hides modules a role may not use and
redirects an operator who reaches such a route directly. This is an interface
convenience and **not** a security control, for a reason specific to this
system's architecture. The dashboard is a static export (Section 4.2.2.4), so no
server stands between the operator and the page; every guard it applies runs in
the operator's own browser, where it can be bypassed. A reader should take the
server-side check as the boundary and the client-side guard as the means of not
presenting a door that will not open.

The two share one rule set rather than two copies of it. The navigation filter
and the route guard previously restated the same role-to-route list separately,
which permitted the two to disagree — a hidden link and a reachable route is
protection in appearance only.

The server distinguishes two refusals, which the client depends on:

**Table 4.2.10** *Refusal Semantics*

| Condition | Status | Code | Client behaviour |
| --- | --- | --- | --- |
| No token presented | 401 | `token_missing` | Treat as signed out |
| Token expired | 401 | `token_expired` | Refresh once, replay request |
| Token invalid | 401 | `token_invalid` | Refresh once, replay request |
| Token genuine, second step not passed | 401 | `mfa_required` | Treat as signed out; do not refresh (Section 4.2.4.9) |
| Role not permitted | 403 | `role_denied` | Stop; do not retry |
| Provider not configured | 503 | `auth_unconfigured` | Stop; server fault |

Both refusals previously returned 403, which made an expired token
indistinguishable from a forbidden role. A client cannot implement silent
renewal against that, because it has no way to know whether retrying is
meaningful; separating them is what makes Section 4.2.4.4 possible.

### 4.2.4.6 Defects Identified and Corrected

Examining the implementation against the requirements above revealed six
defects. They are reported because each produced an appearance of enforcement
that did not correspond to an actual one, which is the class of fault least
likely to be noticed in use.

**Table 4.2.11** *Access Control Defects and Their Correction*

| # | Defect | Consequence | Correction |
| --- | --- | --- | --- |
| 1 | The dashboard tested for a role but never for a session, and the role defaulted to Data Analyst | A visitor who had not signed in reached the dashboard and was presented the full administrative navigation, Data Management and Audit Log included | A session is resolved before the interface renders; absent one, the operator is returned to sign-in. The default role is now the least privileged |
| 2 | The role guard ran as an effect, after first paint | An operator who opened a forbidden module directly saw its contents render before the redirect | The shell renders nothing until the session and role are known, and a forbidden module is never constructed |
| 3 | The dashboard never sent an authorization header | Every protected endpoint was unreachable from the product; the interface appeared to work only because each page read the public routes mounted ahead of the middleware | A single module attaches the token to all authenticated calls |
| 4 | The file-upload and model-training endpoints carried no authentication | Either could be invoked without a credential, and neither is reversible from the dashboard | Both now require the Data Analyst role |
| 5 | The response cache was mounted ahead of the authorization middleware and keyed on URL alone | A protected response, once cached for an authorised operator, was served from the cache to any later caller without a token | Protected paths bypass the cache, and no response to a request bearing an authorization header is stored |
| 6 | The identity provider's URL and key were hardcoded as fallbacks in both applications | A deployment configured with neither still started and authenticated against the development project, with no indication that it had | Both are read from configuration only, and a server that cannot verify tokens refuses protected routes rather than guessing |

Defect 5 is the one the proponents consider most instructive. The authorization
middleware was correct, and reviewing it in isolation would not have revealed
anything: the fault lay in a caching layer that answered before the middleware
ran, so the protected route's own code was never reached. It is a reminder that
an access control is only as strong as the order of the layers in front of it.

Defect 6 had a second consequence found during testing. The application server's
configuration file contained the key name with an empty value, so the server had
been relying entirely on the hardcoded fallback. Removing the fallback caused
every protected route to refuse service — correctly, and visibly — which is how
the empty value was discovered.

### 4.2.4.7 Verification

**Table 4.2.12** *Access Control Test Results*

Testing used three accounts provisioned for the purpose, one per role in Table
4.2.9.

| # | Scenario | Expected | Observed |
| --- | --- | --- | --- |
| 1 | Sign-in, valid credentials | Access and refresh tokens issued | 200; both issued, access token valid 3,600 s, role present |
| 2 | Protected endpoint, valid token, permitted role | 200, served | 200, served |
| 3 | Sign-in, unknown account | Refused | 400 `invalid_credentials` |
| 4 | Sign-in, wrong password | Refused | 400 `invalid_credentials` |
| 5 | Protected endpoint, no token | 401, refused | 401 `token_missing` |
| 6 | Protected endpoint, malformed token | 401, refused | 401 `token_invalid` |
| 7 | Upload endpoint, no token | 401, refused | 401 `token_missing` |
| 8 | Protected endpoint, valid token, **wrong role** | 403, refused, not retried | 403 `role_denied` |
| 9 | Refused request → refresh → replay | New token obtained, request succeeds | 401 → refresh 200 → replay 200 |
| 10 | Public analytics endpoint | 200, served | 200 |
| 11 | Public endpoint, repeated | Served from cache | 200, `X-Cache: HIT` |
| 12 | Protected endpoint, repeated | Never served from cache | No cache header present |

Scenarios 3 and 4 return an identical message. This is deliberate on the
provider's part and desirable: a response distinguishing "no such account" from
"wrong password" allows an attacker to establish which addresses are registered.

Scenario 8 is the one that justifies the distinction drawn in Table 4.2.10. The
Incident Operator presented a valid, current token and was refused with 403
rather than 401, so a client implementing Section 4.2.4.4 does not attempt a
renewal that could not have changed the outcome.

Scenario 9 is the renewal path end to end: a refused request, a token obtained
with the refresh token, and the original request replayed successfully, with no
re-authentication by the operator. One qualification is owed. The refusal was
induced by presenting a tampered token rather than by waiting out the one-hour
lifetime, so the observed code was `token_invalid` rather than `token_expired`.
Both are 401 and both take the same branch, so the path exercised is the one a
genuine expiry would take; what the test does not independently establish is the
provider's expiry timing, which is the provider's behaviour rather than this
system's.

### 4.2.4.8 Limitations

Three limitations are recorded.

Route guarding in the dashboard is advisory, for the architectural reason given
in Section 4.2.4.5. The server-side check is the control.

The session is held in browser local storage rather than an HTTP-only cookie,
for the reason given in Section 4.2.4.2.

One identity project serves all environments, consistent with the single
warehouse described in Section 4.2.2.1. An account created for testing is
therefore an account that exists in the environment the panel will see.

### 4.2.4.9 Two-Step Sign-In (added 7 October 2026)

A password is no longer sufficient to sign in. After the password is accepted,
the operator must enter a six-digit, time-based code (TOTP, RFC 6238) from an
authenticator application on their phone. An account that has no authenticator
is made to add one at its first sign-in, by scanning a QR code or typing a setup
key, and does not reach the dashboard until the first code from the new
application is accepted. No account is left on a password alone.

The identity provider records how far a session has progressed in the token's
`aal` claim: `aal1` after the password, `aal2` after the code. The rule is
applied in three places, which are not equivalent:

| Where | What it does | Is it a control? |
| --- | --- | --- |
| Sign-in page | Asks for the code, or runs first-time setup | No. Runs in the operator's browser |
| Dashboard shell | Ends and refuses a session still at `aal1` | No. Runs in the operator's browser |
| Application server | Refuses a token whose `aal` is not `aal2`, with 401 `mfa_required` | **Yes** |

The first two exist so that the interface behaves; the third is the boundary,
for the reason given in Section 4.2.4.5. A person who holds a stolen password
can obtain an `aal1` token from the provider directly, without ever loading the
sign-in page. The server check is what makes that token worthless.

A session that stopped after the password is never resumed. Reloading the
sign-in page, or being returned to it from the dashboard, ends that session and
starts again from the password, so a half-finished sign-in left on a shared
workstation cannot be completed by the next person.

The audit log follows the same rule: an entry is attributed to an operator only
when the token presented is at `aal2`. Adding an authenticator is itself
recorded (`session.authenticator_added`), because on an account that has none
it is the one action a stolen password would permit.

**Table 4.2.13** *Two-Step Sign-In Test Results (both accounts, real provider and server)*

| # | Scenario | Expected | Observed |
| --- | --- | --- | --- |
| 1 | Password accepted | Token at `aal1` | `aal1` |
| 2 | Protected endpoint, genuine `aal1` token | 401, refused | 401 `mfa_required` |
| 3 | Token edited to claim `aal2`, signature unchanged | 401, refused | 401 `token_invalid` |
| 4 | Wrong code | Refused; session stays `aal1` | `mfa_verification_failed`; `aal1` |
| 5 | Right code | Token at `aal2`, methods password and TOTP | `aal2`; `password+totp` |
| 6 | Protected endpoint, `aal2` token, permitted role | 200 | 200 |
| 7 | Protected endpoint, `aal2` token, wrong role | 403, refused | 403 `role_denied` |
| 8 | Earlier `aal1` token, after the same user reached `aal2` | Still refused | 401 `mfa_required` |
| 9 | Second sign-in | Code requested; setup not offered again | Code step shown |
| 10 | `aal1` session opened at `/dashboard` (provider replies simulated in the test browser) | Returned to sign-in, session ended | Returned; no session left |
| 11 | QR code on the card, read back by a decoder at both card sizes | Same key as printed | Matched at 140 px and 104 px |

Scenario 11 records a defect found in testing. The provider's own QR picture is
69 squares across, which at the size of the sign-in card is under two pixels a
square and could not be read back at all. The card now draws its own code from
the same address, omitting only the settings that restate the standard, which
yields a code of about 41 squares that reads at both sizes.

Three limitations are specific to this feature. First enrolment is trust on
first use: until an account's owner has added their authenticator, whoever
holds its password can add theirs, so new accounts should complete a first
sign-in promptly. The provider issues no recovery codes, so a lost phone is
resolved by an administrator removing the authenticator in the provider's
console, after which the operator sets up again at the next sign-in. And the
second step protects only what the server requires a token for; the routes
that are served without one are unaffected by it.


## 4.2.5 Maintenance Scheduler

Planned roadwork is the one source of corridor disruption the operator knows
about in advance. The Maintenance Scheduler is where that knowledge is recorded:
what work is planned, which stretch of carriageway it occupies, in which
direction, how much of the roadway it closes, and when. Unlike the analytical
modules reported in Section 4.1, which read the warehouse, this module writes to
it — it is the system's only operator-authored data source, and the mobile
application described in Section 3.13 consumes the same records.

### 4.2.5.1 Data Captured

A schedule is located on the corridor by kilometre marker rather than by exit
name. Markers are continuous and exits are not: work frequently occupies a
stretch between two exits, which an exit-based field cannot express.

**Table 4.2.13** *Maintenance Schedule Fields*

| Field | Type | Constraint |
| --- | --- | --- |
| Title | Text | 3–120 characters, required |
| Description | Text | Optional, up to 2,000 characters |
| Start KM / End KM | Decimal | 0–100; end must be at or beyond start |
| Direction | Enumeration | Northbound, Southbound, or Both |
| Lane closure | Enumeration | None, Shoulder only, 1 lane, 2 lanes, Full closure |
| Start / End date-time | Timestamp with offset | End must be after start |
| Status | Enumeration | Scheduled, In progress, Completed, Cancelled |

Direction and lane closure are enumerations rather than free text because both
are read by the corridor model, not only by a human. A closure recorded as "one
lane" in one entry and "1 lane" in another would be two values to the database
and one value to the reader.


![Maintenance Scheduling Form with Kilometre Markers](manuscript-figures/web/Figure_4.1.37_maintenance-schedule-form.jpg)

**Figure 4.1.37_maintenance-schedule-form** *Maintenance Scheduling Form with Kilometre Markers*


**Figure 4.1.37** *Maintenance Scheduling Form with Kilometre Markers*

### 4.2.5.2 Interface

The page presents the schedule as a filterable list with a status chip on each
row, a counter per status, and a detail panel opened from any row. From that
panel an operator can edit the entry, advance its status, cancel it with a
reason, or delete it.

Cancelling and deleting are offered separately and are not alternatives:

- **Cancelling** keeps the row, marks it cancelled, and records a reason. This
  is correct for work that was genuinely planned and then called off — the
  corridor record should still show that a closure was intended for that window,
  because a reader asking why traffic behaved unusually that night is entitled to
  find it.
- **Deleting** removes the row. This is correct only for an entry that should
  never have existed: a duplicate, or a typed mistake.

The distinction is stated in the confirmation dialog rather than left to the
operator to infer, because two destructive-sounding actions side by side is
otherwise a guess.


![Delete Confirmation, Distinguishing Deletion from Cancellation](manuscript-figures/web/Figure_4.1.38_maintenance-delete-confirmation.jpg)

**Figure 4.1.38_maintenance-delete-confirmation** *Delete Confirmation, Distinguishing Deletion from Cancellation*


**Figure 4.1.38** *Delete Confirmation, Distinguishing Deletion from Cancellation*

### 4.2.5.3 Interface to the Application Server

Five endpoints back the page. All validation is performed on the server; the
form's own checks are a convenience, and the server does not trust them.

**Table 4.2.14** *Maintenance Endpoints*

| Method | Path | Purpose | Answers |
| --- | --- | --- | --- |
| POST | `/api/maintenance/schedule` | Create | 201 created, 400 invalid, 503 database unreachable |
| GET | `/api/maintenance/list` | List, filterable by status | 200, 503 |
| PUT | `/api/maintenance/:id` | Replace an entry | 200, 400, 404, 503 |
| PATCH | `/api/maintenance/:id/status` | Advance or cancel | 200, 400, 404, 409 invalid transition, 503 |
| DELETE | `/api/maintenance/:id` | Remove an entry | 200, 404, 503 |

Two properties of this interface are worth recording.

**No mock fallback.** Where the database cannot be reached, every endpoint
answers 503 and says so. None substitutes placeholder data. The mobile
application consumes these same endpoints, and a fabricated success there would
place a closure on an operator's screen that does not exist in the warehouse.

**Every mutation is audited.** Creation, edit, status change, and deletion each
write an entry to the audit log described in Section 4.1.8, recording the actor
and what changed. The write is fire-and-forget: a failure in the audit path never
fails the operation the operator requested.

### 4.2.5.4 Defects Identified and Corrected

Exercising the endpoints against their acceptance criteria revealed two faults.
Both concerned the boundaries of valid input rather than the main path, which is
why neither had surfaced in ordinary use.

**Table 4.2.15** *Maintenance Scheduler Defects*

| # | Defect | Consequence | Correction |
| --- | --- | --- | --- |
| 1 | The kilometre range was not ordered | A job could be saved running from Km 40 to Km 10. Every consumer reads the pair as a span, so a reversed entry yields a negative length: the dashboard draws nothing and the mobile application reports a closure of less than zero kilometres | The server now requires the end marker to be at or beyond the start. Equality is still permitted, since work at a single marker is a legitimate entry |
| 2 | Deletion did not check whether a row was removed | A `DELETE` against an identifier that did not exist answered 200 "Deleted" and wrote an audit entry for a deletion that never happened — the audit log recording an event the database never saw | Deletion now distinguishes the three outcomes and answers 404 where no row matched |
| 3 | A malformed identifier was reported as a database outage | The identifier reached the database, which rejected it as badly formed. The service treats every query failure alike and reports the database unreachable, so a mistyped identifier answered 503 — telling the operator the warehouse was down while it was healthy, and raising an infrastructure alarm for what was a bad request | The identifier is checked before the database is consulted, and an unparseable one answers 404 |

Defect 1 was not hypothetical. A record already in the table — a toll booth
repair entered as Km 76.25 to Km 73.23 — carries a reversed range and is in the
`in progress` state. The validation now prevents another, but the existing row
predates it and requires correction by hand.

Defect 2 is the more instructive of the two. The update path had always
distinguished a missing row and answered 404; the delete path, written alongside
it, discarded the row count and reported success unconditionally. The two sat in
the same file. An interface can be inconsistent with itself in a way that no
single reading of either half reveals.

### 4.2.5.5 Verification

The module was tested at two levels: the endpoints directly, and the delivered
interface driven through a browser with a signed-in operator account.

**Table 4.2.16** *Maintenance Scheduler Test Results*

| # | Scenario | Expected | Observed |
| --- | --- | --- | --- |
| 1 | Submit with empty fields | Rejected | 400, field named |
| 2 | Title shorter than three characters | Rejected | 400 |
| 3 | Negative kilometre marker | Rejected | 400 |
| 4 | Kilometre marker beyond the corridor | Rejected | 400 |
| 5 | End time before start time | Rejected | 400 |
| 6 | End marker before start marker | Rejected | 400 |
| 7 | Direction outside the enumeration | Rejected | 400 |
| 8 | Work at a single marker (start equals end) | Accepted | 201 |
| 9 | Valid submission | Created | 201, row returned |
| 10 | Edit an existing entry | Updated | 200 |
| 11 | Advance status | Updated | 200 |
| 12 | Cancel without a reason | Rejected | 400 |
| 13 | Cancel with a reason | Updated | 200 |
| 14 | Delete an existing entry | Removed | 200, absent from the list |
| 15 | Delete the same entry again | Rejected | 404 |
| 16 | Edit an entry that does not exist | Rejected | 404 |

Ten further checks were performed through the interface itself, signed in as a
Data Analyst: the scheduling form opened and accepted a complete entry; the saved
job appeared in the list; the detail panel opened; the entry was edited and the
change persisted; deletion asked for confirmation before acting; the deleted
entry left the list; and it remained absent after the page was reloaded, which
confirms the removal reached the database rather than only the browser's copy of
the list.

All twenty-six checks passed after the corrections in Section 4.2.5.4. A further
adversarial pass of twenty-four checks — boundary values at both ends of every
numeric and text field, malformed and absent timestamps, script and SQL payloads
in free-text fields, malformed identifiers, and every invalid status transition —
passed in full once defect 3 was corrected.

### 4.2.5.6 Limitation: Status Is Not Reconciled with the Clock

A schedule's status is whatever an operator last set. Nothing advances it when
its window begins, and nothing closes it when the window passes.

The consequence is visible in the delivered system. Both records presently in the
table have windows that closed in August. One is still marked *in progress*, so
the page's summary reports three kilometres of carriageway "under work right
now" for work that finished forty-six days ago. The other is still marked
*scheduled*, which places a count of one beside a caption reading "nothing
upcoming" — the two disagree because the only scheduled item is in the past.

This is a design gap rather than bad data, and the proponents record it as such:
no amount of correcting these two rows prevents the third. Two resolutions are
available. A status could be *derived* for display — a window that has closed
shown as elapsed regardless of the stored value — which changes no data and no
interface contract. Alternatively a scheduled task could advance statuses as
windows open and close, which is closer to how an operations system should
behave but alters records the mobile application also reads, and so is the larger
change.

The proponents recommend the derived presentation as the immediate measure,
because a dashboard that reports current roadwork which ended six weeks ago is
wrong in the way most likely to be noticed and least likely to be forgiven.




---

# Notes for the Group

*Items 1 to 6 are carried from the original draft. The items below were identified while revising this chapter against the delivered system.*

7. Section 3.7 specifies a Tailwind CSS theme configuration as the design token
   mechanism. The delivered interface implements tokens as CSS custom properties
   instead, for the reasons given in Section 4.2.1.6. This follows the same
   convention already applied to Figures 4.1.9, 4.1.24, and 4.1.28, where the
   note beneath each screenshot records that the build differs from what the
   outline anticipated. The group should decide whether to record the deviation
   as written, revise Section 3.7 to match the delivered system, or complete the
   Tailwind configuration before submission.

8. Section 4.2.3.4 records that branch protection and pull-request review are not
   configured on the integration repository. This is a practice gap rather than a
   defect in the delivered system, and it can be closed before submission by
   changing three repository settings. The group should decide whether to close
   it and revise the section, or to submit it as recorded. The proponents note
   that a limitation stated plainly is defensible in a panel review, whereas a
   practice claimed and not implemented is not.

9. Three accounts were provisioned to produce Table 4.2.12, one per role, using
   addresses on a `.test` domain. They exist in the same identity project the
   panel will see, for the reason given in Section 4.2.4.8. The group should
   decide whether to keep them for the demonstration — they are what makes the
   role restrictions in Table 4.2.9 demonstrable — or remove them before
   submission. If they are kept, the shared password should be changed first.

   Section 4.2.4.6 records six corrected defects. If the group prefers Chapter 4
   to report only the delivered state, the table can be reduced to its
   right-hand column, though the proponents recommend against it, as the defects
   evidence the testing that found them.

10. Section 4.2.5.4 records an existing maintenance record whose kilometre range
    runs backwards (Km 76.25 to Km 73.23) and which is currently in progress.
    The new validation prevents another from being created but does not repair
    this one. The group should correct it before the demonstration, since it is
    the kind of entry a panel notices on screen, and decide whether the
    corridor-facing views should additionally ignore any row whose range is
    reversed, as a defence against records created before the rule existed.

