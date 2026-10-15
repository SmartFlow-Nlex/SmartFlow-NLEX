## 4.3 Testing and Validation

Section 3.13 specifies unit, stress, and user-acceptance testing. This section reports the testing
actually carried out against the delivered system, the results obtained, and the one category of
testing that remains outstanding.

### 4.3.1 Functional and Boundary Testing

Testing was directed at the two modules that write to the warehouse or guard access to it, since a
fault in either is consequential in a way a visualisation fault is not.

**Table 4.3.1** *Access Control Test Results*

| # | Scenario | Expected | Observed |
| --- | --- | --- | --- |
| 1 | Sign-in, valid credentials and authenticator code | Session issued at aal2 | Issued; access token valid 3,600 s |
| 2 | Protected endpoint, valid token, permitted role | Served | 200 |
| 3 | Sign-in, unknown account | Refused | 400, generic message |
| 4 | Sign-in, wrong password | Refused | 400, identical message |
| 5 | Protected endpoint, no token | Refused | 401 `token_missing` |
| 6 | Protected endpoint, malformed token | Refused | 401 `token_invalid` |
| 7 | Upload endpoint, no token | Refused | 401 `token_missing` |
| 8 | Protected endpoint, valid token, wrong role | Refused, not retried | 403 `role_denied` |
| 9 | Refused request, refreshed, replayed | Succeeds without re-authentication | 401 → refresh → 200 |
| 10 | Public analytics endpoint | Served | 200 |
| 11 | Public endpoint, repeated | Served from cache | 200, `X-Cache: HIT` |
| 12 | Protected endpoint, repeated | Never served from cache | No cache header present |

Scenarios 3 and 4 return an identical message. This is deliberate: a response distinguishing "no such
account" from "wrong password" would allow an attacker to establish which addresses are registered.

Scenario 8 is the result that justifies the status-code design described in Section 4.2.4. A session
holding a valid, current token was refused with 403 rather than 401, so a client implementing silent
renewal does not attempt a refresh that could not change the outcome.

**Table 4.3.2** *Maintenance Scheduler Test Results*

| Group | Scenarios | Result |
| --- | --- | --- |
| Field validation | Empty submission; title below and at the minimum length; title at and beyond the maximum; description beyond the maximum; negative kilometre; kilometre beyond the corridor; end before start, in both time and distance; work at a single marker | All refused or accepted as specified |
| Temporal validation | Zero-length window; naive timestamp without offset; unparseable timestamp | All refused with the offending field named |
| Input handling | Script markup, SQL payload, and Unicode in free-text fields | Stored verbatim; parameterised queries intact; escaped on render |
| Identifier handling | Malformed identifier; path traversal; well-formed identifier matching no row | All answered 404 |
| State transitions | Advance, cancel without a reason, cancel with a reason, reopen a completed entry, invalid status value | All behaved as specified |
| Lifecycle, through the interface | Create, appear in list, open detail, edit, confirm deletion, removal persists across reload | All passed |

Forty checks were executed in total: sixteen against the endpoints, twenty-four adversarial, and ten
driven through the delivered interface with a signed-in operator. All passed following the
corrections recorded in Section 4.2.5.4.

### 4.3.2 Accessibility and Presentation Testing

Every dashboard page was audited in both the light and dark presentations. Each text-bearing element
was measured against the surface it is painted on, walking up the document tree where a background is
transparent, and compared against the 3:1 minimum specified for large text in WCAG 2.1.

**Table 4.3.3** *Contrast Audit Coverage and Result*

| Measure | Value |
| --- | --- |
| Pages audited | 10 |
| Presentations | Light and dark |
| Text-bearing elements measured | Approximately 10,000 |
| Elements below 3:1 | **0** |
| Elements not scored (painted over a gradient or image) | 4 to 6 per page |

The elements that could not be scored sit over a gradient or a background image, for which a single
computed background colour does not represent what is behind the text. These require visual
inspection rather than measurement, and are reported rather than counted as passes.

A standalone static analysis step was also established: the project declares ESLint 9, and the
project now carries a flat configuration so that linting runs outside the build. The current state is
**zero errors and 83 warnings**, the warnings being unused identifiers and exhaustive-dependency
advisories rather than defects.

### 4.3.3 Testing Not Yet Performed

Two categories named in Section 3.13 are outstanding and are reported as such.

**Stress testing.** No load or concurrency testing has been carried out. The system has been
exercised by its developers and by scripted clients, never by many simultaneous operators, and no
claim about behaviour under load is made in this chapter.

**User-acceptance testing.** Two modules carry a UAT acceptance criterion. The Data Management module
records its user-acceptance subtask as complete. The Maintenance Scheduler's does not: its criterion
requires that maintenance coordinators evaluate the scheduling interface and confirm they can plan
and organise roadwork with it, and no such evaluation has been held. Heuristic evaluation by the
proponents is not a substitute and is not reported as one.

The proponents recommend that a short structured session be held with two or three evaluators who
were not involved in building the system, each given a realistic scheduling task and observed, with
the evaluators named in the record. Three questions already identified as likely to arise are
recorded in Section 4.5.3.

---

## 4.4 Attainment of the Objectives

This section maps each objective stated in Section 1.4 to the evidence in this chapter. Each
objective is assessed against what the delivered system demonstrably does, not against what it was
intended to do.

### 4.4.1 Specific Objective 1 — Agent-Based Simulation Sandbox

> *To evaluate response strategies within an Agent-Based Simulation Sandbox in order to minimise
> expressway downtime and maximise vehicle throughput during incidents or demand surges, providing
> NLEX management with a risk-free, data-driven environment to test operational decisions before live
> deployment using a custom HTML5 Canvas-based simulation interface.*

**Attained.**

The Scenario Sandbox is implemented as a custom agent-based simulation rendered on an HTML5 canvas,
operating over a selectable corridor segment — Balintawak to Marilao, Km 12.00 to 12.60 in the
configuration shown — with northbound and southbound carriageways simulated separately and reported
both individually and as a corridor total.

The simulation reports the quantities the objective names. In the reference run, the sandbox tracked
**52 active agents** (31 northbound, 21 southbound) and reported **throughput of 143 vehicles per
minute** (75 northbound, 68 southbound), a flow-weighted **average speed of 97 km/h**, a **longest
queue of 0 m**, lane **density of 13 and 9 vehicles per kilometre per lane**, and a **carbon rate of
19.2 kg per minute**. Throughput and queue length are the direct measures of the objective's
"maximise vehicle throughput" and "minimise expressway downtime"; the carbon rate connects the module
to the general objective.

The sandbox is *risk-free* in the sense the objective requires: it operates on a simulated corridor
and writes nothing to the warehouse.

It is *data-driven* in a stronger sense than the objective requires, and this is the finding most
worth putting before a panel. The scenario is not seeded with assumed values but with the output of
the predictive tier reported in Section 4.1.4: corridor volume of **349,702 vehicles** from the
Prophet volume model, segment inflow of **4,372 vehicles per hour** at Bocaue Barrier, **3 predicted
incidents** at 19:00 from the Negative Binomial GLM, and **500.1 tonnes** of predicted CO₂ from the
Gradient Boosting Regressor. Each figure is labelled on the panel with its source model and that
model's held-out error. Specific Objective 1 therefore consumes Specific Objective 4 rather than
standing beside it.

*Evidence: Section 4.1.5; Figure 4.1.31.*

**Limitation.** The sandbox measures a scenario; this chapter does not report a controlled comparison
between two response strategies run over the same scenario. The capability to evaluate strategies
exists and the metrics to compare them are produced, but a before-and-after experiment is not
reported. Section 4.5.1 records this.

### 4.4.2 Specific Objective 2 — The Decision-Intelligence System

> *To develop the "SmartFlow NLEX" decision-intelligence system for NLEX operators using a
> custom-built Next.js and TypeScript web dashboard... merge and visualise real-time, multi-source
> data streams across web and conversational channels... a highly usable, accessible platform.*

**Attained.**

| Clause in the objective | Evidence |
| --- | --- |
| Custom-built Next.js and TypeScript dashboard | Next.js 15 with TypeScript throughout, delivered as a static export and packaged as a desktop application (Section 4.2.2) |
| Merge multi-source data streams | Four streams joined in one warehouse: toll records, Waze crowdsourced feeds, weather, and event schedules (Section 4.1.1) |
| Real-time | Live corridor map and Waze jam feeds, refreshed through a cached read path (Sections 4.1.3, 4.2.2) |
| Web channel | Ten dashboard pages across three analytical tiers and three operational modules |
| Conversational channel | Natural-language narrative generation on the analytical panels, and a command interface on the Scenario Sandbox |
| Usable and accessible | Design token system with a dark presentation (Section 4.2.1); contrast audit returning zero failures across ten pages in both presentations (Section 4.3.2) |
| For NLEX operators | Role-based access across three operator roles, enforced on the server (Section 4.2.4) |

*Evidence: Sections 4.2.1 through 4.2.5; Tables 4.3.1 and 4.3.3; Figures 4.1.32 and 4.1.33.*

**Limitation.** "Ensures widespread user adoption" cannot be evidenced by a system that has not been
deployed to its intended users. The objective's accessibility and usability clauses are supported;
the adoption clause is not, and no claim about adoption is made.

### 4.4.3 Specific Objective 3 — Historical Analysis

> *To analyse a 4-year historical NLEX dataset to map and identify recurring systemic inefficiencies
> and traffic congestion patterns for strategic capacity planning using Python and RStudio.*

**Attained in substance; one stated tool was not used.**

The dataset analysed spans **1 January 2022 to 30 June 2026**, which is **1,642 days, or four and a
half years** — the objective's four-year requirement is met and exceeded. It comprises 2,086,512
traffic volume records, 21,820 road crash records, 156,925 stalled-vehicle records, 1,152,960 hourly
weather observations, and 358,998 hourly Waze jam records.

The recurring patterns identified, each of which bears on capacity planning, are:

| Pattern | Finding |
| --- | --- |
| Weekly cycle | Friday carries the highest mean daily volume at 358,514 entries; Sunday the lowest at 282,076, a 21 % spread |
| Daily cycle | Weekday demand peaks at 18:00, with a secondary morning concentration at 07:00 |
| Spatial concentration of demand | The three busiest toll points carry 51.7 % of all entries |
| Spatial concentration of incidents | The five densest segments carry 50.0 % of incidents over 24 % of corridor length; Km 0–4 alone carries 14.1 % |
| Incident composition | Stalled vehicles outnumber crashes approximately eight to one, so the corridor's incident burden is mechanical rather than collision-driven |
| Calendar effect | Declared holidays *suppress* demand — 20 of 21 fall below their local baseline, Good Friday by 49.0 % |
| Weather effect | Wet conditions raise the crash rate by 19.3 % per hour while leaving the overall incident rate unchanged |
| Carbon concentration | 62 long-duration incidents produce 72.5 % of all delay-induced carbon |

The last three are the ones that change an operating assumption rather than confirming one, and the
holiday finding in particular inverts the intuition that a holiday brings a surge.

**Analysis was performed in Python.** The repository contains 174 Python analysis and pipeline
scripts covering extraction, cleaning, feature engineering, model training, and evaluation.
**RStudio was not used**, and the repository contains no R sources. The objective names a tool that
the delivered work did not require. The proponents recommend that Section 1.4.2 be amended to state
Python alone, rather than that R analysis be retrofitted to satisfy a tool list; the analytical
requirement of the objective is met either way.

*Evidence: Sections 4.1.1 through 4.1.3; Figures 4.1.2 to 4.1.14b.*

### 4.4.4 Specific Objective 4 — Predictive Models

> *To deploy existing multi-source predictive models within the SmartFlow NLEX dashboard that
> forecast expressway conditions using integrating historical toll records, crowdsourced data,
> weather inputs, and event schedules using existing machine learning algorithms.*

**Attained.**

Five forecasting targets are deployed in the dashboard, each selected competitively from a field of
candidates on held-out performance, with the losing candidates and their rejection reasons retained:

| Target | Champion | Held-out performance | Candidates evaluated |
| --- | --- | --- | --- |
| Corridor traffic volume | Prophet | MAPE 7.45 %, MASE 0.989 | 8 |
| Daily incident count | Negative Binomial GLM | WMAPE 9.75 %, MASE 0.718 | 7 |
| Congestion state per exit-hour | XGBoost | Accuracy 66.7 % against a 60.5 % profile baseline | 6 |
| Corridor CO₂ | Gradient Boosting Regressor | MAPE 9.63 %, MASE 0.908 | 6 |
| Fleet composition | Dirichlet regression | MAPE 11.80 %, MASE 0.602 | 6 |
| Event surge by exit | Per-exit uplift | WMAPE 9.44 % | 8 |

All four input streams the objective names are integrated: toll records as the volume series,
crowdsourced Waze records as the congestion-state ground truth, weather as an exogenous regressor in
the volume, incident, and emission models, and event schedules as the driver of the surge model.

Model selection was competitive rather than nominal. Of the candidates evaluated, the majority were
rejected — including, for the volume target, every neural candidate. This is reported in full in
Table 4.1.4 because a selection process that rejects nothing is not a selection process.

*Evidence: Section 4.1.4; Table 4.1.4; Figures 4.1.15 to 4.1.23.*

**Limitations.** Three are stated in Section 4.5.2: no volume model is accepted at the 90/10 split;
the incident champion carries an overfitting diagnosis; and the corridor CO₂ model, while accepted on
its holdout, is not validated at the seven-day horizon.

### 4.4.5 General Objective and SDG 9

> *To develop and evaluate SmartFlow NLEX, a centralised decision-intelligence platform that leverages
> a 4-year historical NLEX dataset alongside real-time crowdsourced and external data to optimise
> proactive traffic management and incident response. By reducing traffic congestion, the capstone
> project will support SDG 9 through lower vehicular carbon emissions.*

**The platform is attained. The emission reduction is quantified and projected, not measured in the
field.**

The platform exists, is centralised, and leverages both the historical dataset and real-time
crowdsourced and external data; Sections 4.4.1 to 4.4.4 evidence each clause. Proactive management is
supported in the specific sense that the system forecasts conditions ahead of them occurring and
ranks interventions against those forecasts.

On the carbon claim, the chapter reports the following chain:

1. Corridor emissions for calendar year 2025 total **161,224.7 tonnes of CO₂**.
2. Of this, **1,151.5 tonnes (0.71 %)** is delay-induced carbon — the excess attributable to vehicles
   held below free-flow speed by incidents.
3. **72.5 %** of that excess arises from just **62 long-duration incidents**, so the carbon cost of
   congestion is concentrated in a small number of slow clearances rather than spread evenly.
4. The prescriptive tier projects the reduction available from three interventions: reducing the
   heavy-vehicle share by one percentage point at **3.39 %** of corridor CO₂, faster incident
   clearance at **0.48 %**, and added response capacity at the busiest hours at **0.33 %**.

The honest statement of the general objective's attainment is therefore this: **the system
establishes that congestion-attributable carbon on the corridor is concentrated and therefore
addressable, and quantifies what three specific interventions would save — but no intervention has
been deployed on the corridor and no reduction has been measured.** The contribution to SDG 9 is the
decision-support capability and the quantified case for intervention, not a realised reduction.

Stating this plainly is also the stronger position. A capstone that claims a measured carbon
reduction it cannot evidence invites exactly one question; a capstone that quantifies the available
reduction and names what would be required to realise it does not.

**Table 4.4.1** *Summary of Objective Attainment*

| Objective | Status | Principal evidence |
| --- | --- | --- |
| SO1 — Agent-Based Simulation Sandbox | Attained | §4.1.5; Fig. 4.1.31; throughput 143/min, queue 0 m, 52 agents, seeded from the forecast models |
| SO2 — Decision-intelligence system | Attained | §4.2.1–4.2.5; §4.3.2; zero contrast failures across 10 pages, both presentations |
| SO3 — Historical analysis | Attained in substance; RStudio not used | §4.1.1–4.1.3; 1,642 days, 4.5 years; eight recurring patterns identified |
| SO4 — Predictive models | Attained | §4.1.4; Table 4.1.4; five targets, six model families, competitive selection |
| General — Platform and SDG 9 | Platform attained; carbon reduction projected, not measured | §4.1.3.3, §4.1.5; 161,224.7 t baseline; 3.39 % / 0.48 % / 0.33 % projected |

---

## 4.5 Limitations

The limitations below are stated so that the findings in this chapter are read against their proper
scope. They are grouped by what they constrain.

### 4.5.1 Limitations of Scope

**No controlled strategy comparison in the sandbox.** The simulation produces the metrics by which two
response strategies could be compared, and the comparison is not reported (Section 4.4.1).

**No field deployment.** No intervention recommended by the prescriptive tier has been applied to the
corridor, so no projected saving has been confirmed against an observed one (Section 4.4.5).

**No stress testing, and one outstanding user-acceptance evaluation** (Section 4.3.3).

**Analyses described in Chapter 3 that the delivered system does not implement.** Four are recorded:
a Gaussian Mixture Model separating operating regimes and an Underwood speed-flow fit yielding a
critical density; Getis-Ord Gi\* significance testing and a network-constrained kernel density
surface for incident hotspots; Geographically Weighted Regression for segment-level incident risk;
and TOPSIS closeness-coefficient ranking of response strategies. In each case the delivered system
provides an equivalent output by a simpler method — ranked densities, corridor forecasts apportioned
by historical share, and a quadrant prioritisation — which is reported in this chapter in place of
the method named in Chapter 3. The proponents recommend that Chapter 3 be reconciled to the delivered
methods rather than the methods retrofitted.

### 4.5.2 Limitations of the Models

**Volume forecasting is split-dependent.** At the 80/20 chronological split, Prophet is accepted with
MASE 0.989 — marginally better than a seasonal naive forecast. At the 90/10 split no candidate is
accepted, every model recording MASE at or above 1. Any single accuracy figure quoted for volume
forecasting must name its split.

**The incident model is diagnosed as overfitting.** The Negative Binomial GLM records a training R² of
0.514 against a test R² of 0.262. It remains the best candidate and beats its baseline at the one-to-
seven-day horizon, and the diagnosis is reported alongside the result rather than omitted.

**The corridor CO₂ model is not validated at the horizon it is presented at.** It is accepted on its
294-day holdout at MAPE 9.63 %, satisfying the fifteen percent threshold in Table 3.6.3, but
rolling-origin validation at the one-to-seven-day horizon records MASE 1.176 and the pipeline marks
that horizon unusable. The holdout result stands; the seven-day claim does not yet.

**Secondary incident risk discriminates modestly.** AUC 0.620 against a base rate of 11.5 % is better
than chance and short of strong discrimination.

**Rainfall is not a usable trigger.** The weather-incident model's predicted probability of a
high-incident day moves from 14.0 % at zero rainfall to 14.3 % at 100 mm. The model separates
high-incident days using its other features; rainfall is not the lever, and no rainfall-triggered
advisory is claimed.

### 4.5.3 Limitations of the Data

**Speed data that does not originate from the Waze feed is synthetic.** The warehouse's own model
evaluation records state that the weather-speed models were scored against a volume table whose speed
column is generated capstone data. The jam speeds reported in Sections 4.1.3.1 and 4.1.3.2 are real
Waze observations; the weather-speed models are not, and no operational claim rests on them.

**Clearance-time coverage is partial.** Mean time to clear is computed on 36.7 % of incidents: 11,803
of 40,497 breakdowns carry a usable duration, against 4,893 of 5,024 accidents. The breakdown figure
describes a minority of the events it covers.

**"Time to clear" is measured as report-to-response.** No scene-cleared timestamp exists in the
warehouse, so the survival model is built from the interval between report and responder attendance,
which is the best available proxy and not the same quantity.

**Fatal incidents are too rare to predict.** Eleven fatal events appear in the severity holdout and no
candidate model predicts that class; reported severity accuracy is carried by the dominant class.

**A proportion of incident locations cannot be resolved to an exit.** 0.9 % of logged locations in the
active range are excluded from the per-exit split, and the exclusion is stated on the panel itself.

**Two streams named in Chapter 3 are not present in the warehouse.** The Apprehension and Undercap
Table and the mobile application's community reports do not appear as data sources and contribute no
variable to any result in this chapter.

**One environment serves all stages.** A single warehouse instance backs development and operational
use, so no stage is isolated from operational data.
