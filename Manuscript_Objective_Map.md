# SmartFlow NLEX — Objectives → Findings → Conclusions Map

*Prepared 15 October 2026 from the revised CP-1 manuscript (Chapters 1–3, 258 pages) and `Chapter4_Complete.md`
(8 October), checked against the running system and warehouse on 15 October. Figures marked **current** were
read from the live endpoints that draw the dashboard.*

---

## 0. The short version

| Objective (Ch. 1.4) | Ch. 4 evidence today | Verdict | Biggest gap |
| --- | --- | --- | --- |
| **GO** — develop **and evaluate** a decision-intelligence platform; support SDG 9 via lower emissions | 4.1 results + 4.2 implementation | **Partly evidenced** | No evaluation results (no UAT, stress or unit-test results); "reducing congestion" is not demonstrated, only modelled |
| **SO1** — evaluate response strategies in the agent-based sandbox | One screenshot (Fig. 4.1.31) | **Under-reported** | No sandbox results at all, though the sandbox is the most-tested part of the build |
| **SO2** — Next.js/TypeScript dashboard, multi-source, usable, adopted | 4.2.1–4.2.5 | **Evidenced (build)** | "Highly usable … widespread adoption" needs UAT results |
| **SO3** — analyse the 4-year dataset for recurring inefficiencies (Python and RStudio) | 4.1.3 | **Evidenced** | Several numbers now stale; GMM/Underwood/Gi\* promised in Ch. 3 not delivered |
| **SO4** — deploy multi-source predictive models in the dashboard | 4.1.4 | **Evidenced** | Champion differs from FR-05 (Prophet, not LSTM/XGBoost); three model outputs await the weekly retrain |
| *(no objective)* — **prescriptive analytics** | 4.1.5 | **Orphaned** | Prescriptive work is reported but no specific objective asks for it |

**Three structural problems to fix before anything else:**
1. **Chapter 4 has no "Summary of Findings / Conclusions" section mapped to the objectives.** It ends with
   implementation notes. Section 5 of this file drafts one.
2. **Prescriptive analytics has no specific objective.** Ch. 1.3 and the GO describe it; SO1–SO4 don't. Either
   widen SO1 ("evaluate response strategies … *and generate prescriptive recommendations*") or add an SO5.
3. **Chapter 3's test plans (3.13: unit, stress, UAT) and KPI catalogue (3.6) have no results in Chapter 4.**
   A panel will ask for both. Sections 2 and 4 below show what exists and what is missing.

---

## 1. Objective-by-objective map

### GO — Develop and evaluate SmartFlow NLEX on a 4-year dataset plus real-time data; support SDG 9 through lower emissions

| Chapter 1–3 commitment | Chapter 4 finding (with current figure) | Status |
| --- | --- | --- |
| "4-year historical dataset" | Record is **1 Jan 2022 – 30 Jun 2026 = 1,642 days (4.5 years)** | Reword to "4.5-year" or "2022–2026" |
| Real-time crowdsourced data (Waze Partner Hub) | 358,998 jam / 315,783 alert records; jam data **ends 18 Apr 2026** | Disclose the jam-data end date |
| "Develop **and evaluate**" | Built and benchmarked models (Table 4.1.4) | Evaluation of the *system* (UAT/stress) missing |
| "By reducing traffic congestion … lower vehicular carbon emissions" | System quantifies levers (Sec. 4.1.5) but has not been deployed, so no reduction was *observed* | Conclusion must say "estimates/supports", not "reduces" |

### SO1 — Evaluate response strategies within the Agent-Based Simulation Sandbox (HTML5 Canvas)

| Ch. 1–3 commitment | What the build has (not yet in Ch. 4) | Status |
| --- | --- | --- |
| Risk-free what-if testing of interventions (Ch. 1.5.1 g, FR-06) | Lane closures, speed limits, scenario events (crash, breakdown, roadworks, flood, …), events over a km stretch and at a clock time | **Delivered, not reported** |
| Minimise downtime / maximise throughput (SO1 wording) | Baseline capture vs. after-intervention comparison (speed, throughput, queue, CO₂), trend charts | **Delivered, not reported** |
| UAT-TC-4: "Close 2 lanes at Bocaue Exit" → predicts tailback length and delay | Queue length and travel-time readouts exist | Run and record the scenario |
| KPI 3.6.4: simulation ≤ 120 s per scenario; operator acceptance ≥ 90 % | **Not measured** | Measure run time; acceptance needs UAT |
| Fuzzy speed advice and LP lane staffing *inside* the sandbox (3.11.5.2) | Fuzzy advisory and booth staffing live on the Traffic Prescriptive tab | Say where they live |
| LLM scenario prompting with **Anthropic Claude Sonnet** (3.11.5.2.3) | Copilot built on **GLM via OpenRouter**; 80/80 command-eval cases pass | **Ch. 3 names the wrong model**, fix Ch. 3 or disclose |
| Tools: Python **Mesa**, **Scikit-Fuzzy**, **Three.js** (3.12.3) | TypeScript IDM/MOBIL traffic engine on HTML5 Canvas | Fix 3.12.3 |
| Verification | `verify.ts`: **1,507 automated checks** (1 known UI-text failure); 60-case scene review | Report as the sandbox's validation evidence |

**Recommended Chapter 4 addition:** a section 4.1.6 "Simulation Sandbox Results" with: one worked scenario
(e.g. two-lane closure at Bocaue) showing baseline vs. intervention speed/throughput/queue; run time; and the
1,507-check verification figure.

### SO2 — Develop the Next.js/TypeScript dashboard: multi-source, usable, accessible, widely adopted

| Ch. 1–3 commitment | Chapter 4 evidence | Status |
| --- | --- | --- |
| Next.js + TypeScript dashboard | 4.2.1 design system, 4.2.2 environment, 4.2.3 repository | **Evidenced** |
| Merge multi-source streams | Table 4.1.1 sources; ETL gates | **Evidenced** |
| "Web **and conversational** channels" | Copilot in sandbox; per-chart AI narrative reports | Add to Ch. 4 (the narratives are not mentioned) |
| "Highly usable … widespread adoption" | Design-system validation (4.2.1.5) only | **Needs UAT (3.13.3)** |
| Security NFR | 4.2.4 auth, roles, MFA (two-step sign-in) | **Evidenced** |
| Availability "three nines" (NFR) | Not measured; database restarted/throttled several times in October | Report honestly or drop the target |
| Performance NFR / STC-01 p95 < 3 s at 500 users | Not run (no k6 results) | **Missing**; first loads after a restart take 15–78 s (now preloaded) |

### SO3 — Analyse the 4-year dataset for recurring inefficiencies and congestion patterns (Python and RStudio)

| Chapter 3 technique | Chapter 4 (delivered) | Status |
| --- | --- | --- |
| Volume trend, STL, rolling mean | Trend + weekly cycle reported | Evidenced |
| ACF/PACF | Not reported | Report or drop |
| GMM regimes; Underwood speed-flow fit | **Not delivered** (Ch. 4 says so) | Move to future work |
| Control-day comparison (2-sigma), holiday impact | Delivered: 20 of 21 holidays **below** baseline | Evidenced (direction reversed vs. draft) |
| Clearance time distribution (log-normal) | MTTC 57.4 min (accident 22.1, breakdown 72.0), **36.7 % coverage** | Evidenced, caveat stated |
| KDE / NKDE / Getis-Ord Gi\* | **Segments ranked by count** | Reword or compute |
| Mejia–Sigua speed reduction | Observed jam speed *higher* when wet | Label as model, not observation |
| COPERT IV / EMFAC (speed-based) | **Fixed per-class factors 192 / 354 / 1,492 g/km, no speed term** | **Ch. 1.5.1 f, 3.8 c, 3.11.1.10, 3.12.3 all promise speed-based emissions; fix them** |
| RStudio (SO3 wording) | No R code in the repository | Drop "RStudio" or add the R work |

### SO4 — Deploy multi-source predictive models in the dashboard

| Ch. 1–3 commitment | Chapter 4 / current system | Status |
| --- | --- | --- |
| FR-05: **LSTM and XGBoost**, 7-day volume | **Prophet** champion (MAPE 7.45 %, MASE 0.989); LSTM rank 7 of 8 | **Contradicts FR-05**: update FR-05 to "candidate models, champion by held-out test" |
| 3.8 b / FR-10 / KPI 3.6.1: **48-hour** forecast | Daily forecast validated at 7 days; congestion classifier 1–168 h | Align the horizon wording |
| Incident probability | NegBinomial GLM (WMAPE 9.75 %, MASE 0.718, **overfitting flag** disclosed) | Evidenced |
| Severity / clearance survival | XGBoost severity; Cox PH MAE 16.5 min | Evidenced, **but see stale item S5** |
| Fleet distribution | Dirichlet (MASE 0.602) | Evidenced |
| Environmental projection | GBR CO₂ (WMAPE 7.49 %, MASE 0.908); 7-day horizon study fails | Evidenced; improved model pending (S8) |
| Event surge | Per-exit uplift (WMAPE 9.44 %, R² 0.899) | Evidenced |
| Ensembles adopted when better (3.11.3.5) | None adopted | Say none beat the single champion |
| FR-08 accuracy display | Metrics table on every predictive panel | Evidenced |
| Feedback loop / MLOps (2.1.11, architecture) | Weekly retrain batch with gate and rollback; live-forecast feedback check added | **Not in Ch. 4**: add a short section |

### (Orphaned) Prescriptive analytics — Ch. 1.3, GO, 3.11.4, 3.12.3

| Chapter 3 method | Delivered | Ch. 4 says | Correct statement |
| --- | --- | --- | --- |
| LP toll-lane staffing | Booth Staffing Plan | Delivered | ✔ |
| LP patrol deployment | Maximal Covering Location (exact MILP) | Delivered | ✔ |
| Fuzzy rule-based speed advice | Congestion Response Advisory | Delivered | ✔ |
| Weather-triggered rule (PAGASA 15/30 mm/h) | Withdrawn: rain moves risk 14.0 → 14.3 % | Withdrawn | ✔ |
| **TOPSIS** | **Implemented** (emissions ranking; event ranking in traffic prescriptive code) | "Not implemented" | **Stale: now implemented** |
| **Monte Carlo** | **Implemented** (400-run bootstrap ranges on both incident strategies) | "Not implemented" | **Stale: now implemented** |
| Stochastic LP | Not implemented | — | Future work |
| CO₂ per class-km KPI (2.1.10.3) | **Implemented** (table) | Absent | Add |
| Heavy-vehicle window advisory | **Implemented** | "considered" only | Add |
| Dynamic tolling recommendation | **Implemented** (where/when, no claimed saving) | Absent | Add |

---

## 2. KPI catalogue (Ch. 3.6) against delivered results

| KPI | Target (Green) | Delivered | Verdict |
| --- | --- | --- | --- |
| 3.6.1 Volume forecast accuracy | MAPE ≤ 12 % on **48-h**, per plaza per **15 min**, 20 % holdout | **7.45 %** MAPE, **daily corridor**, 80/20 holdout | Green on its own terms, **but grain and horizon differ**: restate the KPI or the result |
| 3.6.2 Incident MTTR | ≤ 10 min stall / ≤ 30 min crash; baseline 21.2 / 60 | Crash **22.1 min** (green); breakdown **72.0 min** (red, 36.7 % coverage) | The KPI measures a *reduction from AI-assisted SOP retrieval*; **no SOP retrieval exists**, so report baseline only |
| 3.6.3 CO₂ estimation accuracy | MAPE ≤ 15 % vs. **sampled reference measurements**; 100 % segment coverage | **No reference measurements exist.** Ch. 4 uses the *forecast* MAPE (9.63 %) instead, which is a different quantity | **Mismatch**: reword KPI to forecast accuracy or state it was not measurable |
| 3.6.4 Sandbox throughput and acceptance | ≤ 120 s per run; ≥ 90 % acceptance | Not measured | **Missing** |

## 3. Functional requirements (Ch. 3.5.1)

| FR | Status | Note |
| --- | --- | --- |
| FR-01 Multisource ingestion | ✔ | toll, incidents, weather, Waze, events |
| FR-02 Event scraping (schedules and attendance) | Partial | 155 events; attendance from venue capacity (matches limitation 1.5.2 c) |
| FR-03 Data validation | ✔ | Gates 1–4 on upload |
| FR-04 Emission tracker | ✔ | |
| FR-05 LSTM + XGBoost 7-day volume | ✘ as worded | Prophet champion |
| FR-06 Agent-based sandbox | ✔ | Not reported in Ch. 4 |
| FR-07 Smart response (lanes, patrol units) | ✔ | Booth staffing, MCLP patrol |
| FR-08 Model accuracy display | ✔ | |
| FR-09 Incident map | ✔ | Map page |
| FR-10 48-h time-slider (app) | ? | Mobile app is outside this repository; verify with the mobile owner |
| FR-11 ML assistant (app) | ? | Same; Ch. 3 says Claude Sonnet |
| FR-12 Proactive alerts (app) | ? | Same |
| FR-13 Community feedback loop | ✘ | **No community reports in the warehouse** (Ch. 4 already notes this) |

## 4. Test plans (Ch. 3.13): results Chapter 4 must report

| Plan | Exists in the build | Missing in Ch. 4 |
| --- | --- | --- |
| Unit tests UTC-01…05 / UTS-01…07 | Sandbox `verify.ts` (1,507 checks); Copilot check (54) and eval (80/80); auth verification (4.2.4.7); maintenance verification (4.2.5.5) | A results table keyed to UTS-01…07 |
| Stress tests STC-01…05 (k6, 500 VUs) | **Not run** | Run k6 or move to limitations |
| UAT (30 participants) | **Not run** | Run, or report as pending |

---

## 5. Stale figures in Chapter 4 (changed since 8 October)

| # | Ch. 4 says | Now | Why it changed |
| --- | --- | --- | --- |
| S1 | Default window CY2025 (traffic, emissions) / Jul 2025–Jun 2026 (incidents) | **Every module's "12 mo" = 1 Jul 2025 – 30 Jun 2026**; "All" = Jan 2022–Jun 2026 | Ranges unified to end at the record's last day |
| S2 | Traffic 127,433,038 (+1.2 %) | **128,768,371 (+1.5 %)** for Jul 2025–Jun 2026; 127.4 M stays correct *for CY2025* | Window (S1) |
| S3 | Incidents 45,521 (5,024 / 40,497) | **45,424 (5,010 / 40,414)**; injuries 805, fatalities 12 unchanged | 12-month window was 366 days; corrected to 365 |
| S4 | CO₂ 161,224.7 t (−1.2 %) | **163,219.8 t (+0.15 %)** Jul 2025–Jun 2026; 161,224.7 stays correct *for CY2025* | Window (S1) |
| S5 | Register #10: "no scene-cleared timestamp exists; time to clear is report-to-response" | **Wrong now**: the Cox model trains on `site_cleared − event_start_date`, a real scene-cleared time | Trainer was updated |
| S6 | Delay carbon **1,151.5 t, 0.71 %**, 62 long incidents = 72.5 % | **606.4 t, 0.37 %**, 33 long = **77.6 %** (Jul 2025–Jun 2026); CY2025: **376.7 t, 0.23 %**, 26 long = 65 % | Queue time now **lane-blockage** time, not site-clearance time (the old method was ~3× too high) |
| S7 | Strategies 3.39 % / 0.48 % / 0.33 % | **3.38 % / 0.23 % / 0.18 %** (5,516 t / 374 t / 300 t), with Monte Carlo ranges; "faster clearance" renamed **"Shorter lane blockages"**; the policy bar is now labelled **"What-if only"** | S6 plus window |
| S8 | TOPSIS and Monte Carlo "not implemented" | **Both implemented**; TOPSIS score 1.00 / 0.76 / 0.00 | Built 14 Oct |
| S9 | Congestion XGBoost 66.7 % vs. profile 60.5 % | **63.6 % vs. 58.0 %** | Congestion model retrains hourly |
| S10 | Incident horizon d1–7 WMAPE 10.19 % "usable" | **11.92 %** once the corrected study publishes (baseline-alignment and future-rain leak fixed) | Awaiting the weekly retrain |
| S11 | CO₂ 7-day horizon "not usable" | Improved model (holiday inputs) passes every horizon in testing (7-day WMAPE 5.66 %) | **Not yet published**: needs the weekly retrain |
| S12 | Weather-speed model | Trained 3 Sep on pre-2026 data; retraining pending (database throughput) | — |
| S13 | Sandbox | Since 8 Oct: km-stretch and clock-time events, scenes from real traffic, trend charts, baseline comparison, larger vehicles | Add to SO1 section |
| S14 | Emissions panel layout | Recommendation cards with boxes; ranking, class-km, truck window, tolling in one tabbed card | Re-take Figure 4.1.30 |

*Holiday, hotspot, cause and hour-of-day figures in 4.1.3 were computed on CY2025 or other windows; recheck
them if the chapter adopts the dashboard default window.*

## 6. Contradictions between Chapters 1–3 and the delivered system

| Where | Manuscript says | System does | Fix |
| --- | --- | --- | --- |
| Ch. 1.5.1 a, 3.6.3, 3.12.1, 4.1.1.1 | **105 km** corridor | Exit km posts run **Km 12 (Balintawak) to Km 88.25 (Sta. Ines) ≈ 76 km** | Verify the length with NLEX; state the source |
| GO, SO3 | "4-year" dataset | 4.5 years (Jan 2022 – Jun 2026) | Reword |
| 1.5.1 f, 3.8 c, 3.11.1.10, 3.12.3 | Emissions from speed / COPERT IV | Fixed per-class factors, no speed term | Reword; delay penalty handled by the idling model |
| 3.11.5.1.1, 3.11.5.2.3 | Anthropic **Claude Sonnet** | Copilot and narratives use **GLM via OpenRouter** | Fix Ch. 3 |
| 3.12.3 | Mesa, Scikit-Fuzzy, Three.js | TypeScript engine on HTML5 Canvas; fuzzy logic in the backend | Fix Ch. 3 |
| FR-05, 3.8 b, 3.12.2 | LSTM / XGBoost volume engine | Prophet champion | Fix FR-05 wording |
| 3.6.1, 3.8 b, FR-10, UTS-05 | 48-hour forecast | 7-day validated daily forecast; 1–168 h congestion | Pick one horizon wording |
| 3.6.2 | MTTR reduction via SOP retrieval | No SOP retrieval feature | Reword KPI |
| SO3 | Python **and RStudio** | Python only | Drop RStudio or add R work |
| 3.11.4.6 | Stochastic LP | Not implemented | Future work |

---

## 7. Draft "Summary of Findings and Conclusions" for Chapter 4

*Written to match what the system actually shows. Replace bracketed choices before use.*

**SO1 — Agent-based simulation sandbox.** The proponents developed a browser-based agent-based sandbox in which
vehicle agents follow established car-following and lane-changing rules on the NLEX carriageway, and operators
can stage lane closures, speed limits and incident scenarios at a chosen kilometre stretch and time. A baseline
captured before an intervention is compared with the road after it on speed, throughput, queue length and CO₂.
The sandbox's behaviour is verified by 1,507 automated checks. *Conclusion:* the sandbox provides a risk-free
environment to compare response strategies before deployment; operator acceptance of its recommendations
[was / remains to be] measured through user-acceptance testing.

**SO2 — Decision-intelligence dashboard.** A Next.js and TypeScript dashboard integrates toll, incident,
weather, crowdsourced Waze and event data behind role-based, two-step authentication, presenting descriptive,
predictive and prescriptive views for the traffic, incident and emission modules, each with its model
accuracy and a plain-language narrative. *Conclusion:* the platform unifies the previously siloed sources into
one operator interface; its usability [is supported by UAT results / will be confirmed through UAT].

**SO3 — Historical analysis.** Across 1 July 2025 – 30 June 2026 the corridor carried 128.8 million entries,
concentrated at three southern toll points (Bocaue Barrier, Balintawak, Harbor Link, about half of all
entries), with an evening weekday peak and Friday the busiest day. Declared holidays *suppress* rather than
raise demand. Stalled vehicles outnumber crashes about eight to one, and incidents concentrate at the southern
end of the corridor. Wet weather raises the crash rate by about a fifth without raising total incidents. Heavy
vehicles are 9.5 % of vehicle-kilometres but 42 % of CO₂. *Conclusion:* the corridor's recurring
inefficiencies are spatially concentrated and largely mechanical in origin, which points to staging and
towing capacity rather than enforcement as the main lever.

**SO4 — Predictive models.** Each forecasting task selected its model by held-out test performance against a
naive baseline: Prophet for daily volume (MAPE 7.45 %, MASE 0.989), a negative-binomial model for incidents
(MASE 0.718), gradient boosting for CO₂ (WMAPE 7.49 %), Dirichlet regression for fleet mix, a per-exit uplift
for events (WMAPE 9.44 %), and XGBoost for congestion state (63.6 % vs. 58.0 %). Models are retrained weekly
behind an accuracy gate with automatic rollback. *Conclusion:* the deployed models beat their baselines at the
horizons they were validated for (7 days); longer horizons are offered only once a retrained model passes.

**Prescriptive analytics (map to SO1 or a new SO5).** The system recommends booth staffing, patrol positions
(exact covering-location solution), congestion responses (fuzzy rules), and emission levers ranked by TOPSIS
with Monte Carlo ranges. Shortening lane blockages to the fastest 10 % already achieved would avoid about
374 t CO₂ a year (likely 194–623 t), concentrated in a small number of long blockages; a one-point fall in the
heavy-vehicle share would avoid about 5,516 t, but is a what-if that requires company policy. *Conclusion:*
the operational levers are real but modest (well under 1 % of corridor CO₂); the large lever is fleet
composition, which lies outside the control room.

**General objective.** SmartFlow NLEX was developed and evaluated on a 4.5-year record. It quantifies where
congestion and emissions arise and which interventions would reduce them. Because it was not deployed on the
live corridor, the study demonstrates *estimated* rather than *observed* reductions, consistent with
limitation 1.5.2 f.

---

## 8. Action list

1. Add Chapter 4 **Summary of Findings and Conclusions** per objective (Section 7 above as a starting draft).
2. Decide where prescriptive analytics belongs: widen **SO1** or add an **SO5**.
3. Add a **sandbox results** section (SO1).
4. Report **test plans** (3.13): unit results available now; run stress (k6) and **UAT**, or state as pending.
5. Report the **KPI catalogue** results (Section 2), rewording 3.6.1–3.6.3 where the KPI no longer matches the build.
6. Update the **stale figures** S1–S14, and fix register item #10 (S5).
7. Fix the **Chapter 1–3 contradictions** (Section 6), especially 105 km, Claude Sonnet, COPERT/speed, FR-05.
8. Run the **weekly retrain** so S10–S12 can be stated as published, not pending.
9. Ask the mobile-app owner to confirm **FR-10, FR-11 and FR-12**.
