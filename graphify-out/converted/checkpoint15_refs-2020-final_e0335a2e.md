<!-- converted from checkpoint15_refs-2020-final.docx -->


SmartFlow NLEX: A Multisource Corridor Analytics and Decision-Intelligence System for Expressway Traffic Management

A Capstone Project
presented to the
Department of Information Systems
College of Information and Computing Sciences
University of Santo Tomas

In partial fulfillment
of the requirements for the degree of
Bachelor of Science in Information Systems

Dela Cruz, Kiarra Jem U.
Jabagat, Ysabela B.
Naval, Jertz Avryll M.
Rocillo, Hans E.
Fernando, Caesar Gabriel M.


May 2026
# Table Of Contents
Table Of Contents	1
CHAPTER 1	1
1.1 Definition of Terms	2
1.2 Company Background	7
1.3 Project Context (Business Analytics)	8
1.4. Purpose and Objectives	10
1.4.1. General Objective	10
1.4.2. Specific Objectives	11
1.4.3. Alignment of Objectives with System Features and Evaluation	12
1.5 Scope and Limitations	13
1.6 Conceptual Framework of Data Integration	20
1.7 Project Milestones/Timeline	21
CHAPTER 2	22
2.1 Review of Related Literature and Studies	23
2.1.1 Intelligent Transportation Systems and Traffic Management	23
2.1.1.1 Traffic Analysis and Management	23
2.1.1.2  Decision-Intelligence Systems	24
2.1.2 Traffic Data Sources and Multisource Integration	25
2.1.2.1 Multisource Data Integration in Traffic Systems	26
2.1.2.2 Crowdsourcing and Real-Time Traffic Data Collection	27
2.1.2.3 External Factors Affecting Traffic Patterns	28
2.1.3 Descriptive Analytics for Traffic Systems	28
2.1.3.1 Traffic Volume Trend Analysis (Time Series Aggregation)	30
2.1.3.2  Peak Hour and Congestion Pattern Analysis	31
2.1.3.3 Event-Based and Holiday Traffic Analysis	32
2.1.3.4 Location-Based Hotspot Analysis	32
2.1.3.4.1 Spatial Density Estimation and Hotspot Mapping	32
2.1.3.5 Incident Frequency and Severity Analysis	33
2.1.3.6 Weather-Condition Traffic Impact Analysis	34
2.1.3.6.1 Mejia and Sigua Speed-Reduction Model	35
2.1.3.7 Traffic-Driven Carbon Emission Estimation	35
2.1.3.8 Vehicle Classification and Fleet Mix Analysis	35
2.1.3.9 Descriptive Geospatial Analysis using Heatmaps	36
2.1.4 Predictive Analytics for Traffic Forecasting	37
2.1.4.1 Time-Series Forecasting Models for Traffic, Incident, and Sustainability Data	38
2.1.4.1.1 Prophet Forecasting Model	38
2.1.4.1.2 Seasonal Autoregressive Integrated Moving Average (SARIMA)	39
2.1.4.1.3 SARIMAX Model	40
2.1.4.1.4 Holt’s Linear Trend and Holt-Winters Exponential Smoothing	41
2.1.4.2 Machine Learning Models for Traffic, Incident, and Sustainability Prediction	42
2.1.4.2.1 Random Forest Regression	42
2.1.4.2.2 Extreme Gradient Boosting (XGBoost)	43
2.1.4.2.3 Gradient Boosting Classifier and Regressor (GBR)	44
2.1.4.2.4 Long Short-Term Memory (LSTM)	44
2.1.4.2.5 Spatial and Multivariate LSTM	45
2.1.4.2.6 Gated Recurrent Unit (GRU)	46
2.1.4.2.7 Geographically Weighted Regression (GWR)	46
2.1.4.2.8 Negative Binomial Regression	47
2.1.4.2.9 Ordinal and Logistic Regression	48
2.1.4.2.10 Cox Proportional Hazard (Cox PH)	49
2.1.4.2.11 Dirichlet Regression	49
2.1.4.2.12 Monte Carlo Simulation and Bootstrap Resampling	50
2.1.5 Prescriptive Analytics in Traffic Systems	51
2.1.5.1 Prescriptive Models and Decision Strategies	52
2.1.5.1.1 What-If Analysis and Scenario Simulation	52
2.1.5.1.2 Rule-Based Decision Models	53
2.1.5.1.3 Traffic Optimization Models (Linear Programming)	53
2.1.5.1.4 Fuzzy Inference Models	54
2.1.5.1.5 TOPSIS and Multi-Criteria Decision Analysis (MCDA)	55
2.1.5.1.6 Sustainability-Aware Traffic Optimization	56
2.1.5.1.7 Two-Stage Stochastic Programming	57
2.1.6 Geospatial Analysis and Traffic Visualization	58
2.1.7 Agent-Based Traffic Simulation	59
2.1.8 Environmental Impact of Traffic Systems	59
2.1.8.1 Carbon Emissions and Traffic Congestion	59
2.1.8.2 Theoretical Framework: National Emission Inventory Methodology	61
2.1.8.3 Baseline Emission Metrics and Vehicle Classification	61
2.1.8.4 Operational Efficiency and the Carbon "Idling Penalty"	62
2.1.8.5 Emission Factor Sources	62
2.1.9 Model Evaluation and Validation Techniques	63
2.1.9.1 Forecast Error Metrics (MAE, RMSE, MAPE, WMAPE)	63
2.1.9.2 Scale-Independent Metrics (MASE)	64
2.1.9.3 Model Selection Criteria (AIC, BIC)	65
2.1.9.4 Validation Techniques	65
2.1.9.4.1 Chronological Train-Test Split Evaluation	66
2.1.9.4.2 Walk-Forward Validation	66
2.1.9.5 Model Benchmarking and Performance Metrics	67
2.1.9.6 System Performance and Load Stress Validation	67
2.1.10 Key Performance Indicators (KPIs) in Traffic Management	69
2.1.10.1 Alert Lead Time and Mean Time to Clear (MTTC)	69
2.1.10.2 Environmental Metrics (CO₂ per class-km)	70
2.1.10.3 Forecast Accuracy Metrics (WMAPE, MAPE and MASE)	71
2.1.11 Feedback Loops and Model Retraining (MLOps Framework)	72
2.1.11.1 Feedback Loop Mechanisms in Machine Learning Systems	72
2.1.11.2 Continuous Model Monitoring and Performance Tracking	73
2.1.11.3 Model Retraining and Adaptive Learning (MLOps)	74
2.1.11.4 User Interaction Feedback	74
2.1.11.5 System Improvement Cycle	75
2.1.12 Large Language Models and Conversational Interfaces	75
2.1.12.1 LLMs for Commuter Conversational Interfaces	75
2.1.12.2 LLM-Driven Scenario Generation in Simulation Sandboxes	76
2.1.13 Methods Considered for Future Work	77
2.2 Review of Related Systems and Technologies	79
2.2.1 Intelligent Transportation Systems and Infrastructure	79
2.2.1.1 Cloud-Integrated ITS	79
2.2.1.2 Multi-Layered Automated Systems	79
2.2.2 Traffic Monitoring and Navigation Frameworks	80
2.2.2.1 Crowdsourced Reporting	80
2.2.3 Data Engineering and ETL Pipeline Frameworks	80
2.2.3.1 Data Integrity and Cleaning	80
2.2.3.2 Batch and Real-Time Handling	81
2.2.4 Statistical Analysis and Validation	81
2.2.4.1 Correlative Validation	81
2.2.5 Machine Learning and Forecasting Engines (Python)	82
2.2.5.1 Deep Learning Frameworks	82
2.2.6 Mathematical Optimization (Linear Programming)	83
2.2.6.1 Decision Intelligence	83
2.2.7 Agent-Based Simulation	83
2.2.7.1 Autonomous Agent Simulation	83
2.2.8 Database and Data Storage Technologies	84
2.2.8.1 High-Performance Architectures	84
2.2.8.2 Caching and Precomputation	84
2.2.8.3 Redis	85
2.2.9 API Integration and External Data Sources	85
2.2.9.1 Event Data Collection	85
2.2.9.2 Weather and Air-Quality Data	86
2.2.10 Visualization and System Architecture	86
2.2.10.1 Proactive Management Visualization	86
2.2.10.1.1 Next.js	87
2.2.10.1.2 TypeScript	87
2.2.10.1.3 Apache ECharts	88
2.2.10.1.4 Mapbox	88
2.2.10.1.5 GitHub	89
2.2.10.1.6 Figma	89
2.2.10.1.7 Electron	90
2.2.10.2 End-to-End Pipeline Design	90
2.2.10.2.1 PostGIS	90
2.2.11 Mobile Application Development Frameworks	91
2.3 Synthesis	91
CHAPTER 3	93
3.1 Development Methodology	93
3.2 Business Process	98
3.2.1 Comparison of Existing and Proposed Business Processes	98
3.2.1.1 Process Map	98
3.2.1.1.1 Existing Business Process/es	98
3.2.1.1.2 Proposed Business Process/es	100
3.2.1.2 Data Flow Diagram	119
3.2.1.2.1 Proposed Data Pipeline	120
3.3 Business Solution	130
3.4 Project Risk and Feasibility Studies	131
3.4.1 Risk Management	131
3.4.2 Technological Feasibility	137
3.4.3 Organizational/Cultural Feasibility	139
3.4.4 Economic Feasibility	141
3.5 Business Requirements Overview	144
3.5.1 Functional Requirements	144
3.5.2 Non-Functional Requirements	147
3.6 Key Performance Indicator (KPI) Catalogue	149
3.7 Mock-ups	155
3.7.1 Dashboard	155
3.7.2 Mobile Application	166
3.8 System Generated Outputs	170
3.9 Data Gathering (with ETL)	174
3.9.1 Data Sources	175
3.9.2 Extract	178
3.9.3 Transformation	180
3.9.3.1 Data Cleaning Engine	180
3.9.3.2 Feature Engineering Engine	181
3.9.4 Load and Data Warehouse Layer	187
3.10 Presentation of Schema	187
3.11 Business Analytics Models and Testing	191
3.11.1 Descriptive Analytics	194
3.11.1.1 Data Overview	194
3.11.1.2 Volume Aggregation and Temporal Profiles	195
3.11.1.3 Holiday and Event Impact by Local Control-Day Comparison	195
3.11.1.4 Incident Frequency, Severity and Spatial Concentration	196
3.11.1.5 Weather-Stratified Crash Rate	196
3.11.1.6 Clearance-Time Summary and Kaplan–Meier Estimation	197
3.11.1.7 Emission Inventory and Fleet Mix	198
3.11.1.8 Live Corridor Status	198
3.11.1.9 Proposed Descriptive Methods	199
3.11.2 Predictive Analysis	200
3.11.2.1 Data Overview and Validation Design	201
3.11.2.2 Daily Corridor Volume Forecasting	202
3.11.2.3 Congestion-State Classification	203
3.11.2.4 Event-Day Uplift Estimation	205
3.11.2.5 Incident Count Forecasting	205
3.11.2.6 Incident Severity and Secondary-Incident Risk	206
3.11.2.7 Clearance-Time Modelling	207
3.11.2.8 Spatial Incident Models	207
3.11.2.9 Corridor CO₂ Forecasting	208
3.11.2.10 Fleet-Mix Forecasting	209
3.11.2.11 Methods Evaluated but Not Adopted, and Proposed Methods	210
3.11.3 Training and Testing of Models	210
3.11.3.1 Mean Absolute Percentage Error (MAPE)	211
3.11.3.2 Weighted Mean Absolute Percentage Error (WMAPE)	211
3.11.3.3 Root Mean Square Error (RMSE) and Mean Absolute Error (MAE)	211
3.11.3.4 Mean Absolute Scaled Error (MASE)	212
3.11.3.5 Classification and Survival Metrics	212
3.11.3.6 Model Selection, Accuracy Gate and Retraining	213
3.11.4 Prescriptive Analysis	214
3.11.4.1 Data Overview	214
3.11.4.2 Toll-Booth Staffing Allocation	214
3.11.4.3 Patrol Positioning by Maximal Covering Location	215
3.11.4.4 Two-Stage Stochastic Clearance Protocol	216
3.11.4.5 Fuzzy Congestion-Response Advisory	217
3.11.4.6 TOPSIS Ranking of Interventions	218
3.11.4.7 Emission Strategy Estimation with Bootstrap Uncertainty	219
3.11.4.8 Rule-Based Advisories	220
3.11.4.9 Proposed Prescriptive Methods	220
3.11.5 Agent-Based Simulation and Language-Model Features	221
3.11.5.1 Agent-Based Simulation Sandbox	221
3.11.5.2 Language-Model Features	224
3.11.5.2.1 Sandbox Command Interpretation	224
3.11.5.2.2 Model Narratives	224
3.11.5.2.3 Mobile Assistant	225
3.12 Business Analytics Tools, Techniques, and Specific Applications	226
3.12.1 Descriptive Analytics	226
3.12.2 Predictive Analytics	227
3.12.3 Prescriptive Analytics	227
3.13 Software Quality Assurance Plans	228
3.13.1 Verification Performed During Development	229
3.13.2 Unit Test	230
3.13.3 Integration Test	232
3.13.4 Model and Data Validation	232
3.13.5 Security Test	233
3.13.6 Stress Test	233
3.13.7 User-Acceptance Test	235
3.14 Deployment Plans	237
3.14.1 Current Deployment (Capstone Demonstration)	238
3.14.2 Release Procedure	239
3.14.3 Rollback and Maintenance	239
3.14.4 Proposed Production Deployment for NLEX	239
References	241
Appendix	261
A.1 Glossary	261


# CHAPTER 1
INTRODUCTION
The North Luzon Expressway (NLEX) is the main expressway connecting Metro Manila to Central and Northern Luzon. Its operator describes it as spanning 105 kilometres, with the main line running from Balintawak in Quezon City to Sta. Ines in Mabalacat City, Pampanga (Metro Pacific Tollways Corporation, n.d.-b). Together with the Subic–Clark–Tarlac Expressway (SCTEX) and the NLEX Connector, it shortens travel between the capital and the provinces of Central and Northern Luzon.
NLEX links the growing regions of Central and Northern Luzon with Metro Manila and helps spread economic activity beyond the capital. It carries manufactured goods, raw materials and agricultural products between Metro Manila markets and provincial producers, so smooth traffic on NLEX means faster deliveries and lower transport costs for logistics companies. It is also a daily route for many employees and students who commute between nearby provinces and Metro Manila, so congestion or disruption on the expressway quickly delays both freight and commuters.
Traffic congestion has been a significant challenge along NLEX. Congestion occurs when demand for road use exceeds the capacity of the road, resulting in slower traffic and longer travel times (Afrin & Yodo, 2020). Motorists and commuters frequently experience delays during peak hours, and congestion intensifies during long weekends and major holidays. For Holy Week 2025, traffic on NLEX, SCTEX and the NLEX Connector was projected to peak at 493,000 vehicles per day, against regular NLEX traffic of about 350,000 vehicles per day (Reyes-Estrope, 2025). Navigation applications and social media give drivers information on current conditions, but they offer little guidance on how congestion is likely to develop in the hours or days ahead.
To address congestion and the limited availability of forward-looking information, this capstone project proposes SmartFlow NLEX, an analytics and decision-intelligence system for the NLEX corridor. It integrates NLEX toll and incident records with crowdsourced Waze data, weather, holiday and event calendars, and applies descriptive, predictive and prescriptive analytics to explain past traffic patterns, forecast volume and congestion, and recommend operational responses.
The project also includes a mobile application that gives drivers and commuters live corridor status, congestion forecasts by exit and operator advisories. Through these, SmartFlow NLEX aims to support proactive traffic management by NLEX operators while helping road users make more informed travel decisions.
## 1.1 Definition of Terms
The following terms are defined according to their use in this study:
a.) Agent-Based Simulation Sandbox
A computational traffic simulation in which individual vehicles are modelled as agents that follow car-following and lane-changing rules, so that congestion emerges from their interactions (Bastarianto et al., 2023). In SmartFlow NLEX it is the Scenario Sandbox, where operators compare an intervention such as a lane closure with a no-intervention baseline in a risk-free virtual environment before acting on the road.
b.) Carbon Dioxide (CO₂) Emissions
The release of greenhouse gases into the atmosphere is primarily caused by the combustion of fossil fuels from motorized vehicles. In the context of traffic systems, these emissions significantly escalate during recurring and nonrecurring congestion due to prolonged vehicle delays and excessive fuel consumption (Afrin & Yodo, 2020).
c.) Champion Model
The candidate forecasting model that achieves the lowest error on chronologically held-out data while also outperforming naive baseline forecasts. The champion is the model whose forecasts are published to the dashboard. It is re-selected whenever the models are retrained.
d.) Corridor
A continuous stretch of road managed as a single unit for traffic operations. In this study, the corridor is the NLEX main line from Balintawak (Km 12) to Sta. Ines (Km 87), covering the toll plazas recorded in the data, which is about 76 kilometres of measured centreline.
e.) Decision Intelligence
The use of data, forecasts and decision models to recommend and evaluate operational actions, combining descriptive, predictive and prescriptive analytics with human judgement. In this study, the system advises and the operators decide.
f.) Medallion Architecture
A layered data-warehouse design in which raw data are stored in a bronze layer, cleaned and standardized data in a silver layer, and analysis-ready aggregates and model outputs in a gold layer (Armbrust et al., 2021).
g.) NLEX Commuters and Drivers
The primary end users of the mobile application, who use NLEX for personal or professional travel and use corridor status and forecasts to plan their trips.
h.) NLEX Data Analysts
Technical staff who interpret historical data to identify traffic trends and system performance. In SmartFlow NLEX they also manage data uploads, review model accuracy and audit system activity.
i.) NLEX Incident Operators
Specialized personnel focused on the documentation, verification, and management of road crashes, vehicle breakdowns, and other non-recurring traffic events.
j.) NLEX Traffic Control Center (TCC) Operators
The personnel responsible for monitoring expressway operations, resource deployment, and emergency response coordination.

k.) Reactive and Proactive
Reactive refers to responding to a problem after it has already occurred, while proactive refers to anticipating and addressing a problem before it takes place.
l.) Rush Hour
The busy part of the day when roads are crowded, typically in the morning when people travel to work and in the evening when they travel home (Cambridge University Press, n.d.). In this study it is used interchangeably with peak hours.
m.) Traffic Congestion
A condition in which vehicle movement on the road is slower due to various factors, including reaching maximum road capacity, occurring incidents, or extreme weather conditions, which may result in increased travel time, accident rates, and carbon emissions (Shaygan et al., 2022).
n.) Waze for Cities (Partner Hub) Feed
A data-sharing programme through which partner agencies receive Waze users' crowdsourced jam and alert reports. SmartFlow NLEX uses its historical archive and its live feed as indicators of congestion and incidents (Hoseinzadeh et al., 2020; Liu et al., 2024).
## 1.2 Company Background
NLEX Corporation, formerly the Manila North Tollways Corporation (MNTC), is the builder-concessionaire and operator of the North Luzon Expressway, the Subic–Clark–Tarlac Expressway and the NLEX Connector (Metro Pacific Tollways Corporation, n.d.-b). Its work covers the development, design, construction, financing, operation and maintenance of toll roads.
NLEX Corporation belongs to the Metro Pacific Tollways Corporation (MPTC) group. MPTC is a subsidiary of Metro Pacific Investments Corporation and describes itself as the Philippines' leading toll-road developer and operator, with the largest expressway network in the country by traffic volume, revenue and asset base, and as the first Filipino private toll-road company with major stakes in Indonesia and Vietnam (Metro Pacific Tollways Corporation, n.d.-a). Its other Philippine concessions include the Manila–Cavite Expressway (CAVITEX), the Cavite–Laguna Expressway (CALAX) and the Cebu–Cordova Link Expressway (CCLEX).
The operator also supports electronic toll collection through Easytrip RFID accounts, which motorists use and reload at the toll plazas (Reyes-Estrope, 2025). SmartFlow NLEX is developed independently by the proponents as an academic project and is not an NLEX Corporation system.

## 1.3 Project Context (Business Analytics)
NLEX Corporation already plans ahead for predictable, calendar-based demand, positioning resources before Friday rush periods, long weekends and declared holidays. This proactivity is limited in scope. Traffic, incident and toll data are collected continuously, but they are presented mainly as summaries of current or past conditions. When surges arise from factors outside the standard calendar, such as sudden weather, uncleared incidents or large events at the Philippine Arena, operators have little data-driven forewarning and no structured way to test an intervention before deploying it. Traffic engineering that relies mainly on past observations inevitably responds with some lag after conditions change (GoodVision, 2023). Congestion also raises vehicle emissions through idling and stop-and-go driving (Afrin & Yodo, 2020). The data needed to anticipate such compound surges already exist in toll records, incident logs, crowdsourced reports, weather records and event schedules, but they are held separately and are not combined in a single analytical pipeline.
To address this, the proponents develop SmartFlow NLEX, a decision-intelligence system that integrates hourly toll records, incident records, Waze jam and alert data, weather, holidays and event schedules. Descriptive analytics identify recurring congestion and incident patterns. Predictive analytics forecast traffic volume, congestion state, incidents and emissions, and every forecast is evaluated against naive baselines. Prescriptive analytics recommend operational responses such as toll-booth staffing, patrol positioning and incident response.
The system also includes an agent-based simulation sandbox in which operators can test interventions in a virtual corridor before executing them on the road. This approach follows the use of digital-twin traffic simulation to evaluate congestion measures before implementation (Fujishima et al., 2023). Through these capabilities, the proponents seek to extend NLEX's existing proactive management beyond scheduled peak-day planning toward a data-driven approach that prepares operators for both predictable and unpredictable conditions.



## 1.4. Purpose and Objectives
The proponents aim to develop SmartFlow NLEX, a centralized decision-intelligence system that addresses two specific pain points identified within NLEX Corporation's current traffic management practice. The first pain point is the absence of in-depth predictive and prescriptive intelligence. The current system lacks a machine learning forecasting layer, so operators cannot anticipate volume surges from weather, holidays, or regional events before they materialize into congestion. The second pain point is siloed and underutilized data. Toll records, weather data, incident logs, and crowdsourced reports exist independently and are never fused into a unified analytical pipeline, leaving critical cross-source insights untapped.
## 1.4.1. General Objective
The general objective of this capstone project is to develop and evaluate SmartFlow NLEX, a centralized decision-intelligence platform that leverages a 4-year historical NLEX dataset alongside real-time crowdsourced and external data to optimize proactive traffic management and incident response. By reducing traffic congestion, the capstone project proposal will support SDG 9 (Industry, Innovation, and Infrastructure) through lower vehicular carbon emissions.





## 1.4.2. Specific Objectives
To achieve the general objective, the project aims to fulfill the following specific objectives:
To evaluate response strategies within an Agent-Based Simulation Sandbox in order to minimize expressway downtime and maximize vehicle throughput during incidents or demand surges, providing NLEX management with a risk-free, data-driven environment to test operational decisions before live deployment using a custom HTML5 Canvas-based simulation interface.
To develop the "SmartFlow NLEX" decision-intelligence system for NLEX operators using a custom-built Next.js and TypeScript web dashboard. This system aims to merge and visualize real-time, multi-source data streams across web and conversational channels. By doing so, we will provide operators with a highly usable, accessible platform that simplifies complex data, streamlines operational decision-making, and ensures widespread user adoption.
To analyze a 4-year historical NLEX dataset to map and identify recurring systemic inefficiencies and traffic congestion patterns for strategic capacity planning using Python and RStudio.
To deploy existing multi-source predictive models within the SmartFlow NLEX dashboard that forecast expressway conditions using integrating historical toll records, crowdsourced data, weather inputs, and event schedules using existing machine learning algorithms.
## 1.4.3. Alignment of Objectives with System Features and Evaluation
Table 1.4.3.1 links each objective to the system functions that address it, the expected output and the criterion by which it is evaluated. Prescriptive analytics, described in Section 1.3, support the general objective and Specific Objectives 1 and 2.
Table 1.4.3.1 Objectives, System Features, Outputs and Evaluation Criteria
| Objective | System functionality | Expected output | Evaluation criterion |
| --- | --- | --- | --- |
| General Objective | Integrated warehouse of toll, incident, Waze, weather, holiday and event data; descriptive, predictive and prescriptive modules; emission estimation | Operator dashboard and mobile application that present validated forecasts, recommendations and emission estimates | KPIs K1–K14 (Table 3.6.5); FR-01 to FR-21 (Table 3.5.1.1); UAT acceptance |
| Specific Objective 1 (agent-based simulation sandbox) | Scenario Sandbox (IDM/MOBIL microsimulation on HTML5 Canvas); natural-language scenario commands; prescriptive models on the Traffic and Incident pages | Comparison of an intervention with a no-intervention baseline (speed, throughput, queue, travel time, CO₂) with confidence intervals | Sandbox intervention effect (K10), run time (K11), operator acceptance (K12); engine verification checks |
| Specific Objective 2 (Next.js and TypeScript dashboard) | Next.js/TypeScript dashboard with role-based access, live map, analytics pages, maintenance, data management, audit log, model narratives; mobile application | A single interface that combines the integrated data, forecasts and recommendations | System Usability Scale (K14), API latency (K13), functional and security tests (Section 3.13) |
| Specific Objective 3 (historical analysis) | Descriptive analytics on the January 2022 – June 2026 record: temporal profiles, holiday and event impact, incident hotspots, wet-versus-dry crash rates, clearance times, emissions | Baselines of recurring congestion, incident and emission patterns | Coverage and reproducibility of the descriptive measures; MTTC baseline (K9); emission baselines (K7, K8) |
| Specific Objective 4 (multi-source predictive models) | Candidate models for volume, congestion state, event uplift, incidents, severity, clearance time, CO₂ and fleet mix, with weekly retraining and an accuracy gate | Published champion forecasts with their held-out accuracy | Forecast error against naive baselines (K1–K5) |
## 1.5 Scope and Limitations
This study covers the development of a decision-intelligence system for the NLEX corridor. The system is delivered as an operator dashboard and a commuter mobile application. It integrates historical and live data, analyses traffic, incidents and emissions, and provides forecasts, recommendations and simulation for operators and commuters. Its scope and limitations are defined below.
1.5.1 Scope
The functional boundaries and core features of the system are defined by the following areas:
Corridor Coverage
The geographic scope is the NLEX main line from the Balintawak toll plaza (Km 12) to the Sta. Ines exit (Km 87) in Mabalacat City, Pampanga, covering its 20 exits, including the SCTEX interchange at Km 85. All 20 exits are covered by the live map, the congestion forecasts and the emission estimates. Toll-volume analytics cover 19 of them, because the SCTEX interchange's toll data were not loaded into the warehouse. The SCTEX expressway itself, the NLEX Connector, Harbor Link spurs not represented in the data, and connecting local roads are outside the scope.
Multi-Source Data Integration
The system integrates hourly toll transactions by plaza, direction and vehicle class (January 2022 to June 2026); NLEX accident, breakdown and crash records; the Waze for Cities historical archive and live feed; historical hourly weather and air quality; the Philippine holiday calendar; and a Philippine Arena event calendar. The data are stored in a layered PostgreSQL and PostGIS warehouse.

Real-Time Data Monitoring and Visualization
The live Waze feed is refreshed about every two minutes and is shown on the Live Map and the Overview page. Toll and incident records are added in batches as NLEX exports are uploaded. The operator dashboard is delivered as a desktop application, and the commuter interface as a mobile application.
External Factor Integration
The analytics account for factors other than traffic volume that influence expressway behaviour: holidays, Philippine Arena events and weather. These are used to measure past effects, as inputs to selected forecasting models, and as scenario settings in the sandbox.
Predictive Forecasting
The system forecasts the congestion state of each exit from 1 to 168 hours ahead (refreshed hourly), daily corridor volume (validated up to 14 days ahead; longer horizons are shown as unvalidated), event-day uplift at the Philippine Arena exit, daily incident counts, incident clearance time, daily corridor CO₂ (validated up to 7 days ahead) and the vehicle-class mix. Every model is compared with naive baseline forecasts on held-out data, its accuracy is displayed with the forecast, and the weekly retraining is designed to publish a retrained model only when it passes this accuracy check (Section 3.11.3.6).
Carbon Emission Monitoring
The system estimates CO₂, PM2.5 and NO₂ emissions by multiplying vehicle-kilometres by fixed per-class emission factors, and estimates the additional CO₂ emitted by vehicles queued behind lane-blocking incidents.
Agent-Based Sandbox Simulation
The system includes a virtual simulation environment in which vehicle agents follow car-following and lane-changing rules on a chosen stretch of the corridor. Operators can run what-if scenarios, such as lane closures, speed limits, counterflow and incidents, and compare them with a no-intervention baseline before applying them on the road.
User-Facing Decision-Intelligence Interfaces
The platform delivers its outputs through two interfaces. The Operator Dashboard is a desktop console for NLEX personnel that provides analytics, forecasts, recommendations, a live map, maintenance scheduling, data management and the simulation sandbox. The Commuter Mobile Application provides live corridor status, congestion forecasts by exit up to seven days ahead, maintenance notices, community reports and a conversational assistant that answers questions about current corridor conditions.
1.5.2 Limitations
The operational execution and technical performance of the platform are governed by the following constraints:
Data Integrity and Availability
The accuracy of all analyses and forecasts depends on the quality and completeness of the data supplied by NLEX Corporation and third parties. The toll and incident record used in this study ends on 30 June 2026. Some incident records lack clearance timestamps, and the Waze history has gaps, notably from 19 April to 3 August 2026. Incident records dated 2020–2021 that come from synthetic files are excluded.
Connectivity and Network Dependence
The interfaces require a continuous internet connection. Commuters in low-coverage areas may experience delays, and the demonstration API runs on a free hosting tier that may take several seconds to respond after a period of inactivity.
Event Scraping Restrictions
Event data are limited to a calendar of 159 events at three venues near the corridor (the Philippine Arena, the Philippine Sports Stadium and Clark Global City). The calendar was collected once from the venues' published schedules in August 2026; later events have been added by hand, because no automated event feed or scraper runs. Capacity is recorded for every event and a stated attendance for 63 of them, as free text, but the system has no ticket-sales data and its models do not use attendance: event effects are estimated from past traffic on event days.
Granularity of Emission Calculations
The carbon monitoring feature provides corridor-level estimates. Emissions are calculated by exit and vehicle class using fixed emission factors, so they cannot isolate short road sections or reflect changes in driving speed. They are estimates and are not validated against roadside measurements.
Third-Party API Uptime
Live features depend on external services: the Waze feed, the identity provider, the language-model providers and the map-tile provider. Outages or changes at these providers can interrupt the live map, the assistant, scenario commands or model narratives.
Lack of Operational Autonomy
The system is purely advisory. It does not control toll barriers, change roadside signs, or dispatch patrol, ambulance or towing units. All recommendations require an operator's decision.
AI Knowledge Domain Restriction
The mobile assistant answers only questions about NLEX corridor conditions, using live corridor data from the system. It declines general-knowledge questions and does not give travel-time estimates or departure recommendations.
Geographic Boundaries
The system's monitoring and forecasting do not extend beyond the NLEX main line. Connecting local roads, SCTEX and the NLEX Connector are not analysed.
Deployment and Evaluation Scope
SmartFlow NLEX is evaluated as a capstone demonstration and is not deployed in live NLEX operations. Reductions in congestion, clearance time or emissions are therefore estimated from historical data and simulation, not observed in operation.
Model Skill
Several models improve only modestly on naive baselines, and some candidate models (for example, the LSTM volume model) did not beat them. Forecasts beyond the validated horizons are shown as unvalidated.

## 1.6 Conceptual Framework of Data Integration

Figure 1.6.1 IPO Conceptual Framework of the SmartFlow NLEX
The Input phase (Figure 1.6.1) collects the internal NLEX data (hourly toll transactions and incident records), the Waze for Cities historical archive and live feed, historical weather and air quality, the holiday calendar and a Philippine Arena event calendar. The figure labels the event source “External Scraper”. As implemented, the calendar was collected once from the venue's published schedule. Community reports are submitted through the mobile application and shown in its feed.
In the Process phase, the ETL pipeline validates, cleans and integrates the data into a layered warehouse. Descriptive analytics establish baselines for traffic, incidents and emissions. Predictive models, each compared with naive baselines on held-out data, forecast volume, congestion, incidents and emissions. Prescriptive models then recommend staffing, patrol positions, incident responses and emission strategies, and operators can test interventions in the simulation sandbox.
The Output phase delivers the results to two audiences. NLEX operators use the dashboard, which includes the simulation sandbox, and commuters use the mobile application, which includes a conversational assistant and community reports. The framework is iterative: new NLEX data are loaded through the dashboard, the models are retrained weekly and republished only if they pass the accuracy gate, and operator feedback from user-acceptance testing informs later refinements.
## 1.7 Project Milestones/Timeline
To ensure timely completion, this timeline tracks each project phase from start to finish, highlighting key tasks and deadlines.



Figure 1.7.1 Project Timeline

# CHAPTER 2
REVIEW OF RELATED LITERATURE, STUDIES, SYSTEMS, AND TECHNOLOGIES
This chapter reviews the literature, studies, systems and technologies relevant to the development of SmartFlow NLEX: A Multisource Corridor Analytics and Decision-Intelligence System for Expressway Traffic Management. It examines prior findings and methods, explains how each relates to SmartFlow NLEX, and identifies the gap that the project addresses.
## 2.1 Review of Related Literature and Studies
This section reviews the literature and studies relevant to SmartFlow NLEX: A Multisource Corridor Analytics and Decision-Intelligence System for Expressway Traffic Management.
### 2.1.1 Intelligent Transportation Systems and Traffic Management
2.1.1.1 Traffic Analysis and Management
Afrin and Yodo (2020) emphasize that traffic congestion is mostly influenced by the increase in vehicle numbers and define it as a condition where travel demand exceeds road capacity. The authors divide this problem into two subcategories: "recurring" traffic congestion influenced by predictable peak hour volumes, and "non-recurring" congestion influenced by unpredictable events such as accidents or adverse weather. Because both categories lead to significant socio-economic losses, the authors argue that modern traffic management requires proactive and continuous monitoring.
Rainfall also changes traffic-stream behaviour on expressways. The Highway Capacity Manual applies larger reductions in free-flow speed and capacity as rain intensity increases (National Academies of Sciences, Engineering, and Medicine, 2022). The operating limits of a corridor therefore shift with weather, so analyses and simulations of NLEX should account for rainfall rather than assume fixed road characteristics.
Non-recurring disruptions such as crashes and stalled vehicles are a major source of delay, and their duration depends on incident type, response and conditions. Korkmaz and Erturk (2024) review the statistical and machine-learning methods used to analyse and predict incident duration, and Grigorev et al. (2022) note that accurate duration predictions help operators manage non-recurring congestion and help drivers choose routes.
2.1.1.2  Decision-Intelligence Systems
Decision-support systems extend monitoring by evaluating candidate responses. Chung et al. (2020) developed a decision-support system for integrated active traffic management that uses the METANET macroscopic model to predict near-future conditions on connected freeways and arterials and evaluates combinations of strategies, such as variable speed limits, queue warning and ramp metering, by their effect on travel-time reliability.
In a Federal Highway Administration report, Miller et al. (2021) classify decision-support tools (DSTs) for traffic management as knowledge-driven, data-driven or model-driven. Knowledge-driven tools apply stored rules and procedures, data-driven tools query historical and current data, and model-driven tools provide “what-if” analysis that predicts the possible outcomes of response strategies on measures such as travel time, throughput and environmental impact before they are deployed.
Model-driven decision support is increasingly delivered through digital twins, virtual replicas of the road network kept in step with observed data. Rudskoy et al. (2021) describe how digital twins can modernize traffic control centres within intelligent transportation systems, and Fujishima et al. (2023) show how a digital-twin traffic simulation can be used to evaluate congestion-mitigation measures before they are implemented.
These studies support integrating fragmented data into a central interface that both describes current conditions and lets operators evaluate responses before acting. SmartFlow NLEX applies this idea by combining a knowledge- and model-driven dashboard with a simulation sandbox, while leaving every decision to the operators.
### 2.1.2 Traffic Data Sources and Multisource Integration
This section reviews why multisource data are needed for corridor analytics. Single sources such as fixed sensors have gaps, while crowdsourced reports and external factors such as weather and events add information that toll counts alone do not capture. Combining these sources is expected to improve the understanding and forecasting of expressway traffic.
2.1.2.1 Multisource Data Integration in Traffic Systems
For dealing with the specific problem of missing data and anomalies, robust data fusion techniques are required. P. Wang et al. (2021) demonstrate an effective data fusion methodology by combining conventional hardware sensor data with toll collection data. Because raw sensor data frequently suffers from missing values due to faulty equipment, spatiotemporal dependency modeling restores the missing data while utilizing accurate toll logs to validate overall traffic volumes. Leinonen et al. (2025) further point out that relying on single-source data is inadequate for representing complex traffic behaviors; integrating diverse data sources significantly improves the accuracy and reliability of predictive models compared to using isolated datasets.
For high-dimensional tabular data, tree-based ensembles are widely used. Lam (2024) compared random forest, XGBoost and LSTM models on junction vehicle counts and found XGBoost the most accurate and efficient, and Sun et al. (2021) showed that an improved XGBoost model captures spatio-temporal dependencies in segmented traffic-flow prediction.
These studies support fusing heterogeneous sources such as toll counts, crowdsourced reports and weather, and evaluating tree-based ensembles among the candidate models. In SmartFlow NLEX, XGBoost proved most useful for classifying congestion state, while a decomposable time-series model forecasts daily volume best (Section 3.11.2).
2.1.2.2 Crowdsourcing and Real-Time Traffic Data Collection
Crowdsourced reports vary in reliability. Yu et al. (2025) proposed a consortium-blockchain reputation scheme that scores each reporting vehicle so that low-quality reports can be filtered before they affect traffic applications.
Evaluations of Waze data support its use as a supplementary source. Hoseinzadeh et al. (2020) found that Waze speeds closely tracked Bluetooth ground truth, with lower accuracy at night and on low-volume segments, and Liu et al. (2024) compared Waze crash and stopped-vehicle reports from 2018 to 2021 with official state incident records, finding that Waze covered a varying share of the recorded incidents, that more than half of the matched crashes appeared in Waze first and that location differences averaged less than half a mile. These findings justify SmartFlow NLEX's use of Waze jams and alerts as a live congestion signal, while recognizing that Waze is not a complete or error-free record.


2.1.2.3 External Factors Affecting Traffic Patterns
Rainfall degrades traffic-stream characteristics on freeways, reducing free-flow speed and capacity as rain becomes heavier (National Academies of Sciences, Engineering, and Medicine, 2022). U.S. guidance on active traffic management likewise describes managing recurrent and non-recurrent congestion dynamically, including through real-time monitoring of traffic combined with weather conditions (National Academies of Sciences, Engineering, and Medicine, 2024).
Planned events are another external factor. Giuliano and Lu (2021) analysed traffic around a large stadium by comparing event days with comparable control days and found measurable increases in traffic near the venue, showing that event effects can be isolated when the comparison days are chosen independently of the outcome.
Following this approach, SmartFlow NLEX measures the effect of Philippine Arena events and holidays against local control days and estimates per-exit event uplift from a calendar of events, rather than from days selected because traffic was high.
### 2.1.3 Descriptive Analytics for Traffic Systems
In transportation research, descriptive analytics summarizes historical data into structured insights. Bachechi et al. (2022) describe big-data analytics and visual dashboards that aggregate traffic sensor data over space and time, and Attioui and Lahby (2025) note that understanding historical patterns is a foundation for forecasting.
These establish the importance of the project’s initial exploratory phase. By using data summarization and clustering, the study can objectively identify historical traffic trends, creating the necessary baseline for more advanced predictive and prescriptive features.

2.1.3.1 Traffic Volume Trend Analysis (Time Series Aggregation)
Traffic volume trend analysis fundamentally begins with the descriptive analytics and visual aggregation of highly variable spatio-temporal data. To uncover structural patterns within continuous traffic flows, researchers aggregate raw observations across specific temporal dimensions, such as by day of the week, month, or year. This systematic approach allows analysts to isolate recurring routines from irregular fluctuations and effectively map the evolution of traffic over both time and space (Bachechi et al., 2022).
Beyond visual mapping, recurring traffic patterns can be analysed with formal time-series methods. Hyndman and Athanasopoulos (2021) show how a series can be decomposed into trend, seasonal and remainder components, and how autocorrelation (ACF) and partial autocorrelation (PACF) functions help identify candidate model orders.
These methods provide a framework for separating NLEX traffic into trend and seasonal cycles, so that recurring routines can be distinguished from irregular spikes.


2.1.3.2  Peak Hour and Congestion Pattern Analysis
Peak-hour analysis summarizes when congestion recurs. Aggregating volume by hour of day and day of week reveals distinct morning and evening peaks and differences between weekdays, weekends and holidays, which traffic managers use to time resources (Bachechi et al., 2022).
SmartFlow NLEX applies this through hour-by-weekday profiles of toll entries and incidents, which identify when staffing and patrol coverage are most needed.

2.1.3.3 Event-Based and Holiday Traffic Analysis
Planned events and holidays cause non-recurrent changes in demand. Forecasting texts treat such calendar effects as explicit components or regressors, so that they are not mistaken for trend or noise (Hyndman & Athanasopoulos, 2021).
To isolate the effect of a specific event, Giuliano and Lu (2021) compared event days with comparable control days at the same location, which measures the net change attributable to the event.
SmartFlow NLEX implements this as a local control-day comparison: each holiday or event day is compared with the same weekday within 45 days, excluding other holidays and events (Section 3.11.1.3).
2.1.3.4 Location-Based Hotspot Analysis
Geographic information systems and spatial statistics can identify crash hotspots. Alam and Tabassum (2023) used hot-spot analysis to locate statistically significant clusters of severe crashes in Ohio and to prioritize safety interventions.
2.1.3.4.1 Spatial Density Estimation and Hotspot Mapping
Kernel density estimation converts crash points into a continuous density surface (Berhanu et al., 2023), and the Getis-Ord Gi∗ statistic tests whether high values cluster beyond chance (Alam & Tabassum, 2023). SmartFlow NLEX currently ranks five-kilometre segments by incident counts. Kernel density and Gi∗ testing are proposed extensions.
2.1.3.5 Incident Frequency and Severity Analysis
A baseline of incident frequency, severity and clearance time is needed to evaluate incident management. Grigorev et al. (2024) review methods for predicting incident duration, and Islam et al. (2021) model crash clearance time on freeways, showing that clearance time varies with incident and roadway characteristics.
Mapping these clearances into a visual response time distribution, analysts can identify temporal bottlenecks in emergency operations that often lead to further network degradation. Consequently, tracking the secondary incident rate, the percentage of crashes caused by the queue of an existing primary incident, is critical for comprehensive safety evaluation.
SmartFlow NLEX reports incident frequency by type and cause, severity counts, and the mean, median and 90th-percentile clearance time with the share of records that have valid timestamps.

2.1.3.6 Weather-Condition Traffic Impact Analysis
Adverse weather affects traffic flow. Romanowska and Budzyński (2022) used expressway data to quantify how weather and time of day change speed, headway and capacity, and derived weather adjustment factors. Comparing traffic and crash outcomes in wet and dry conditions is a direct way to measure such effects.
Weather affects both flow and safety by changing driver behaviour, which supports including weather data in the analysis of NLEX traffic and incidents.

2.1.3.6.1 Mejia and Sigua Speed-Reduction Model
For NLEX specifically, Mejia and Sigua (2018) provide rain-dependent speed parameters. SmartFlow NLEX uses their reported free-flow speeds as speed limits in the sandbox's rain scenarios, and its descriptive analysis compares crash rates in wet and dry hours (Section 3.11.1.5).
2.1.3.7 Traffic-Driven Carbon Emission Estimation
Estimating the environmental footprint of the corridor requires emission factors by vehicle type. Road-transport emission models such as COPERT provide speed-dependent emission factors by vehicle category (Ntziachristos & Samaras, 2023), while simpler inventories apply fixed per-kilometre factors to vehicle-kilometres travelled. Congestion adds emissions through idling and stop-and-go driving (Afrin & Yodo, 2020).
SmartFlow NLEX applies fixed per-class factors to vehicle-kilometres, estimates the additional CO₂ from vehicles queued behind lane-blocking incidents as a lower bound, and reports daily, hourly and monthly totals (Section 3.9.3).
2.1.3.8 Vehicle Classification and Fleet Mix Analysis
The composition of the vehicle fleet shapes both traffic flow and emissions. Heavy vehicles accelerate more slowly, occupy more road space and emit several times more CO₂ per kilometre than passenger cars.
SmartFlow NLEX therefore tracks the shares of Class 1, 2 and 3 vehicles in traffic and in emissions, and forecasts the class mix (Section 3.11.2.10).

2.1.3.9 Descriptive Geospatial Analysis using Heatmaps
Descriptive geospatial analysis relies heavily on advanced visualization techniques to interpret massive volumes of spatio-temporal data for continuous traffic management. By integrating traffic sensor observations into interactive decision-support dashboards, researchers and public authorities can visually track the geographic evolution of traffic conditions over time. These geospatial visualizations, often utilizing color gradients or heatmaps to represent data intensity, enable analysts to efficiently pinpoint congested expressway sections, monitor dynamic traffic flows, and translate complex spatial data into actionable insights for infrastructure monitoring (Bachechi et al., 2022).
In the realm of transportation safety and incident management, geospatial analysis is frequently applied to visualize the spatial distribution of adverse traffic events. By employing point density techniques and geographic mapping, researchers can generate heatmaps that clearly highlight high-risk accident hotspots across a regional road network. This method of visually clustering event data not only simplifies the interpretation of complex geographic patterns but also provides the critical, location-based evidence necessary to prioritize specific corridors for targeted safety interventions and infrastructural improvements (Berhanu et al., 2023).
SmartFlow NLEX uses hour-by-weekday heatmaps for traffic, incidents and emissions, and a live corridor map that shows Waze jams and alerts by exit.
### 2.1.4 Predictive Analytics for Traffic Forecasting
The ability to accurately predict traffic conditions represents a core element of contemporary Intelligent Transportation Systems (ITS), shifting urban traffic management from reactive observation to proactive mitigation (Shaygan et al., 2022). While predictive algorithms efficiently handle short-term route planning using continuous streaming data, long-term forecasting projects network conditions weeks into the future. This extended horizon requires robust analytical models capable of addressing highly complex, non-linear spatiotemporal dependencies and sudden, non-recurrent anomalies (Attioui & Lahby, 2025).
Deep-learning architectures such as long short-term memory (LSTM) networks can learn sequential dependencies in large traffic datasets and are widely used for traffic and travel-time prediction (Leinonen et al., 2025; Attioui & Lahby, 2025).
Benchmark studies also caution that complex models do not automatically outperform simpler ones. In the M4 competition, statistical methods and combinations remained highly competitive (Makridakis et al., 2020), and Manibardo et al. (2022) found in a benchmark of short-term road-traffic forecasting that deep learning was not the best choice in every case. SmartFlow NLEX therefore evaluates statistical, machine-learning and deep-learning candidates on held-out data and publishes only those that beat naive baselines.
2.1.4.1 Time-Series Forecasting Models for Traffic, Incident, and Sustainability Data
2.1.4.1.1 Prophet Forecasting Model
Prophet models a time series as the sum of a piecewise-linear trend with changepoints, Fourier seasonal components and holiday effects, and is designed to produce forecasts with little manual tuning (Hyndman & Athanasopoulos, 2021).
When this architecture is fused with deep learning approaches, the Prophet forecasting model operates as an advanced filtering mechanism. Liu et al. (2023) demonstrate that Prophet efficiently isolates macro-level seasonal volume trends, leaving only the complex, non-linear residual errors for complex neural networks to process.
In SmartFlow NLEX, Prophet with weather regressors is the current champion for daily corridor volume, selected over Holt-Winters, SARIMAX and LSTM by held-out accuracy. Holiday and event effects are not yet included as regressors in the volume model and are estimated separately.

2.1.4.1.2 Seasonal Autoregressive Integrated Moving Average (SARIMA)
Forecasting the frequency of accidents and general highway volumes requires addressing pronounced seasonal unevenness and temporal volatility. Deretić et al. (2022) establish that the Seasonal Autoregressive Integrated Moving Average (SARIMA) model serves as an ideal analytical tool for this task by systematically modeling non-stationarity both within distinct seasonal periods and between them.
By applying mathematical differencing to smooth out erratic data points, the model extracts pure linear relationships and recurring cyclical trends from highly volatile traffic datasets. Hyndman and Athanasopoulos (2021) corroborate this, demonstrating that autoregressive techniques provide the foundational statistics necessary to separate underlying trend signals from random, non-recurrent traffic noise.
In SmartFlow NLEX, a seasonal-naive forecast (the value one week earlier) serves as the baseline that every volume model must beat, and SARIMA-family models are candidates.

2.1.4.1.3 SARIMAX Model
While standard time-series models handle internal historical data effectively, they are completely blind to outside environmental forces. Hyndman and Athanasopoulos (2021) establish that extending traditional frameworks into SARIMAX architectures addresses this limitation by allowing for the explicit integration of exogenous variables, or external regressors, directly into the forecasting equation.
Romanowska and Budzyński (2022) derived adjustment factors that quantify how weather and time of day change traffic-flow characteristics, which supports treating weather as an exogenous input.
SmartFlow NLEX tests SARIMAX(1,1,1)(1,1,1)₇ with weather regressors. Once future weather is replaced by climatology to avoid leakage, weather adds little accuracy, and SARIMAX is currently not accepted for daily volume.

2.1.4.1.4 Holt’s Linear Trend and Holt-Winters Exponential Smoothing
Exponential smoothing methods forecast by weighting recent observations more heavily. Holt's method adds a trend component, and the Holt-Winters method adds seasonality (Hyndman & Athanasopoulos, 2021). Hyndman and Athanasopoulos (2021) also present these methods as innovations state-space (ETS) models, which give the same point forecasts, produce prediction intervals and support automatic model selection by minimising the AICc.
Because they are fast and robust, exponential smoothing methods are standard benchmarks against which more complex models must be justified (Makridakis et al., 2020).
SmartFlow NLEX evaluates Holt's linear trend and additive Holt-Winters with a weekly season as volume candidates and benchmarks. Holt-Winters is currently accepted as a benchmark that beats the seasonal-naive baseline.

2.1.4.2 Machine Learning Models for Traffic, Incident, and Sustainability Prediction
2.1.4.2.1 Random Forest Regression
Processing high-dimensional traffic and emissions data requires ensemble learning algorithms capable of capturing complex non-linear relationships while aggressively avoiding data overfitting. Smelyakov et al. (2023) emphasize that Random Forest (RF) algorithms achieve this by applying an averaging mechanism across multiple, independent decision trees that are fitted on random subsets of the overall dataset.
By averaging many trees, random forests reduce variance and are robust to noise. Lam (2024) included random forests among the models compared for traffic prediction.
SmartFlow NLEX uses random forests as comparators for congestion-state classification and incident counts. They have not been selected as champions.

2.1.4.2.2 Extreme Gradient Boosting (XGBoost)
Extreme Gradient Boosting (XGBoost) builds trees sequentially, each correcting the residual errors of the previous ones, with regularization and efficient handling of sparse data (Bentéjac et al., 2021). Sun et al. (2021) applied an improved XGBoost to spatio-temporal traffic-flow prediction.
Lam (2024) found XGBoost the most accurate and efficient of the models compared for junction traffic prediction.
In SmartFlow NLEX, XGBoost is the champion congestion-state classifier, forecasting low, medium and high states by exit for 1 to 168 hours ahead. It is also a comparator for incident severity and fleet mix. It is not used as the volume model.

2.1.4.2.3 Gradient Boosting Classifier and Regressor (GBR)
Gradient boosting builds an additive model in stages, fitting each new regression tree to the negative gradient of a loss function, which for squared error is the residual of the current model (Bentéjac et al., 2021). Changing the loss adapts the same procedure to regression or classification, and XGBoost is a regularized, scalable implementation of it (Bentéjac et al., 2021).
The method has been applied to transport emissions. Li et al. (2022) compared ordinary least squares, support vector machines and gradient boosting regression for forecasting transportation CO₂ emissions in the 30 highest-emitting countries and found gradient boosting the most accurate, and Wen et al. (2021) used gradient boosting regression to predict the on-road CO₂ emissions of light diesel vehicles.
In SmartFlow NLEX, gradient boosting regression is the champion daily CO₂ forecaster, while XGBoost classifies congestion state.
2.1.4.2.4 Long Short-Term Memory (LSTM)
Modern Intelligent Transportation Systems increasingly rely on deep learning architectures to process massive, multi-source datasets spanning long horizons. Leinonen et al. (2025) establish that Long Short-Term Memory (LSTM) networks are specifically engineered to retain complex time-series patterns over extended periods without suffering from severe prediction degradation.
Within this domain, LSTM networks specifically address the vanishing gradient problem found in older neural networks. Attioui and Lahby (2025) demonstrate that by utilizing internal memory cells, LSTMs successfully learn the complex, long-term sequential dependencies that dictate severe traffic disruptions and non-recurrent congestion.
In SmartFlow NLEX, LSTM networks were trained for daily volume and CO₂ but did not beat the baselines, so they are retained as comparators. This is consistent with benchmark evidence that deep networks do not always outperform simpler methods on traffic series (Manibardo et al., 2022).
2.1.4.2.5 Spatial and Multivariate LSTM
Traffic at one location is influenced by neighbouring locations. Bogaerts et al. (2020) combined graph convolution and LSTM in a single network that captures spatial and temporal patterns for short- and long-term traffic forecasting.
Spatially aware models can therefore represent how conditions at one point propagate to others.
SmartFlow NLEX includes a spatial LSTM for exit-level incident counts that adds the lagged counts of the two nearest exits. Its congestion classifier likewise uses lagged states of neighbouring exits.
2.1.4.2.6 Gated Recurrent Unit (GRU)
While LSTMs are highly capable, handling the computational demands of real-time forecasting requires optimized network architectures. Hewamalage et al. (2021) establish that the Gated Recurrent Unit (GRU) functions as a streamlined recurrent neural network that utilizes an efficient gating mechanism.
This simpler design reduces training and inference time. Hewamalage et al. (2021) report that GRUs can achieve accuracy comparable to LSTMs with fewer parameters.
In SmartFlow NLEX, GRU networks are comparators for congestion state and incident counts. Separate GRU models for wet and dry conditions are a proposed extension.
2.1.4.2.7 Geographically Weighted Regression (GWR)
Global regression assumes that the relationship between predictors and crash frequency is the same everywhere. Geographically weighted regression relaxes this by estimating local coefficients that vary across space, using a distance-weighting kernel (Al-Hasani et al., 2021; Comber et al., 2023).
Soroori et al. (2021) compared geographically weighted Poisson and negative binomial regressions with global negative binomial models of injury crashes across 253 traffic analysis zones and found that the geographically weighted models captured spatially varying effects of road, socioeconomic, demographic and land-use factors and outperformed the global models.
SmartFlow NLEX fits a Poisson geographically weighted regression across its 20 exits. With so few locations, the local coefficients are interpreted descriptively.
2.1.4.2.8 Negative Binomial Regression
Crash counts are typically overdispersed, with variance larger than the mean. Lord et al. (2021) review crash-frequency models and identify the negative binomial model as a standard choice for such data. Deretić et al. (2022) show that accident counts also have strong seasonality.
Count models with overdispersion therefore give more reliable uncertainty than ordinary regression for incident frequencies.
SmartFlow NLEX uses a negative binomial model as the champion daily incident forecaster, compared with Poisson, tree-based and recurrent models. Its improvement over naive forecasts is modest.
2.1.4.2.9 Ordinal and Logistic Regression
Incident severity is an ordered outcome, from property damage only to injury and fatal, so it is commonly modelled with ordered-response models that use the ordering of the categories without assigning them numeric scores (Washington et al., 2020). Mo et al. (2024) analysed crashes at mainline toll plazas, which act as bottlenecks, and found that crash likelihood rose with upstream occupancy and with speed and occupancy differences between the upstream and downstream sides and fell as the share of electronic toll collection lanes increased, which is relevant to a tolled expressway.
Logistic regression is likewise used for binary incident outcomes. Salek et al. (2021) used logistic regression to estimate the likelihood of secondary crashes on freeways and found that traffic conditions (peak periods and AADT), lighting and characteristics of the primary crash, such as a rear-end collision, affected that likelihood. More broadly, Grigorev et al. (2024) review the techniques used to predict incident duration, and Shang et al. (2022) showed that incident outcomes can be estimated from incomplete multi-source data available at report time.
SmartFlow NLEX applies ordinal logistic regression and XGBoost to classify accident severity, and a ridge-penalized logistic regression to estimate secondary-incident risk. The severity models currently perform about as well as predicting the most common class, which is reported as a limitation.
2.1.4.2.10 Cox Proportional Hazard (Cox PH)
Survival analysis is the standard framework for incident duration. Li et al. (2020) applied hazard-based (survival) duration models to highway incidents and found that predictions improve as incident information accumulates, and the Cox proportional hazards model estimates how covariates scale the hazard of clearance without assuming a baseline distribution (Collett, 2023).
The Kaplan–Meier estimator provides the empirical survival curve from observed durations, including censored records (James et al., 2021).
SmartFlow NLEX fits a Cox model to estimate clearance time and uses Kaplan–Meier curves for the dashboard and for the scenarios of the clearance protocol.
2.1.4.2.11 Dirichlet Regression
Vehicle-class shares are compositional data that must sum to one. Dirichlet regression models such proportions jointly, without transforming them (Martínez-Minaya et al., 2023).
Modelling the shares jointly keeps the forecast composition consistent.
SmartFlow NLEX uses Dirichlet regression to forecast the daily shares of Class 1, 2 and 3 vehicles, which feed the emission views and the sandbox vehicle mix.
2.1.4.2.12 Monte Carlo Simulation and Bootstrap Resampling
Monte Carlo methods propagate uncertainty by repeated random sampling. Zhang et al. (2024) used Monte Carlo simulation in estimating network-wide traffic emissions. The bootstrap is a related resampling method that approximates the sampling distribution of a statistic by repeatedly resampling the observed data with replacement, and the percentiles of the resampled statistic give a simple uncertainty interval (Efron & Hastie, 2021).
SmartFlow NLEX uses a related resampling approach: a seeded bootstrap of 400 resamples of observed incidents gives 5th-to-95th-percentile ranges for its emission strategies. These ranges describe sampling uncertainty and do not guarantee a reduction.
### 2.1.5 Prescriptive Analytics in Traffic Systems
While descriptive analytics identifies historical patterns and predictive analytics forecasts future states, prescriptive analytics represents the pinnacle of the data maturity model. In the context of Intelligent Transportation Systems (ITS), prescriptive analytics merges predictive machine learning outputs with advanced mathematical optimization to recommend specific, optimal courses of action. The transition from prediction to action is the defining characteristic of modern prescriptive frameworks. According to Haydari and Yılmaz (2022) in their comprehensive review, the integration of Deep Reinforcement Learning (DRL) allows traffic systems to move beyond passive observation. By processing real-time predictive data, DRL agents can dynamically generate and disseminate traffic signal controls and routing decisions that actively mitigate real-world volatility.
SmartFlow NLEX applies prescriptive analytics through optimization models, rule-based advisories and scenario estimates (Section 3.11.4). Its recommendations are advisory, and operators decide whether to act on them.

2.1.5.1 Prescriptive Models and Decision Strategies
2.1.5.1.1 What-If Analysis and Scenario Simulation
Scenario simulation is a foundational decision-support mechanism that allows traffic operators to safely test hypothetical strategies in a virtual environment before real-world deployment. According to Rudskoy et al. (2021), it is heavily integrated through ITS virtual simulation platforms. These platforms maintain a synchronized virtual replica of the physical road system, enabling runtime "what-if" explorations. When a predictive model flags a sudden environmental shift, the virtual replica reconstructs the current traffic state to perform accelerated policy simulation.
Expanding on the environmental utility of simulation, microscopic platforms serve a vital role in validating sustainability interventions. Sagaama et al. (2024) demonstrate how simulation environments like SUMO are utilized for prescriptive emissions testing. By running "what-if" scenarios, researchers explicitly measure how dynamic eco-routing techniques impact vehicular energy consumption, proving that prescribing optimized routes significantly reduces network-wide emissions prior to physical execution.
SmartFlow NLEX applies this idea in its Scenario Sandbox, where operators compare an intervention with a no-intervention baseline in a microscopic simulation before deciding whether to apply it.
2.1.5.1.2 Rule-Based Decision Models
Knowledge-driven decision-support tools apply stored facts, rules and procedures to emulate expert reasoning with more consistent results (Shah et al., 2024).
Fuzzy rule-based systems evaluate inputs such as traffic volume and speed on a continuous scale rather than with a single threshold. Ali et al. (2021) showed that this produces graded responses that adapt to changing congestion in traffic-signal control.
SmartFlow NLEX uses rule-based advisories for heavy-vehicle time windows, peak toll differentials and patrol alert windows (Section 3.11.4.8).
2.1.5.1.3 Traffic Optimization Models (Linear Programming)
Traffic-flow problems can be expressed as mathematical programs in which intersections or interchanges are nodes and road segments are links with capacity constraints, so that an optimizer can find the best feasible allocation of flows.
Ma et al. (2022) formulated trajectory planning for connected and autonomous vehicles at freeway work zones as a mixed-integer linear program that minimizes delay and fuel use, showing how optimization can manage traffic around capacity drops.
Location models address where to station response resources. The maximal covering location problem places a fixed number of facilities to cover the largest weighted demand within a service distance (Baldomero-Naranjo et al., 2022), and Atik and Hajibabai (2023) applied a location-allocation model that maximises the coverage of incident demand to position incident responders on a road network. Toll-booth staffing is commonly treated as a queueing problem: Bari et al. (2022) modelled toll-plaza delay from queue waiting and service times that vary with approach volume and traffic composition and linked level-of-service thresholds to the number of tollbooths required, and P. Wang et al. (2020) combined a queueing-based service level with a neural-network forecast of queue length to schedule the number of open toll lanes. SmartFlow NLEX uses a maximal covering location model to position patrol units and a linear allocation for toll-booth staffing (Sections 3.11.4.2 and 3.11.4.3).
2.1.5.1.4 Fuzzy Inference Models
Fuzzy set theory represents vague categories such as “high congestion” with degrees of membership rather than hard thresholds, and Mamdani-type fuzzy systems combine such memberships through linguistic rules (Varshney & Torra, 2023). In the Takagi–Sugeno model, the consequent of each rule is a function of the inputs rather than a fuzzy set (Varshney & Torra, 2023). Its zero-order form, in which each consequent is a constant, is the simplest case.
Ali et al. (2021) and Tunc et al. (2021) applied fuzzy logic to adaptive traffic-signal control, where graded inputs produce smoother responses than fixed thresholds.
SmartFlow NLEX uses a zero-order Takagi–Sugeno advisory that grades the urgency of responding to a forecast congestion state (Monitor, Prepare or Act) from its probability and lead time (Section 3.11.4.5).
2.1.5.1.5 TOPSIS and Multi-Criteria Decision Analysis (MCDA)
Many operational decisions balance several criteria. TOPSIS ranks alternatives by their relative closeness to an ideal solution (Chakraborty, 2022) and is one of the most widely used multi-criteria methods (Çelikbilek & Tüysüz, 2020), including to prioritise safety improvements along a road section (Trivedi et al., 2024).
Li et al. (2025) combined a system-dynamics simulation of urban traffic with TOPSIS to rank policy combinations by their ability to reduce both congestion and emissions. TOPSIS ranks the alternatives by closeness to the ideal; decision makers then choose from the ranked list.
SmartFlow NLEX uses TOPSIS to rank event interventions and emission strategies, with weights stated by the proponents (Section 3.11.4.6).
2.1.5.1.6 Sustainability-Aware Traffic Optimization
Sustainability-aware traffic optimization serves as the ultimate prescriptive synthesis of modern intelligent transportation systems. Recognizing the environmental toll of vehicular congestion, researchers explicitly target the reduction of carbon emissions based on dynamic traffic distribution across urban networks. Zhang et al. (2024) demonstrate that investigating the effect of dynamic traffic distribution on network-wide emissions provides empirical evidence that traffic routing directly impacts regional carbon footprints.
Congestion and idling increase emissions, so measures that shorten delays also reduce them (Afrin & Yodo, 2020).
SmartFlow NLEX estimates the CO₂ that shorter lane blockages and faster response in the busiest hours would avoid, compares them with a what-if reduction in the heavy-vehicle share, and identifies where heavy-vehicle time windows or peak toll differentials would apply. Operators evaluate these options; nothing is applied automatically.
2.1.5.1.7 Two-Stage Stochastic Programming
Stochastic programming optimizes decisions when some parameters are uncertain by representing them as scenarios with probabilities. In a two-stage model, first-stage decisions are made before the uncertainty is resolved and recourse decisions afterwards, and the value of the stochastic solution measures the benefit of modelling the uncertainty (Li & Grossmann, 2021).
Incident clearance time is a natural uncertain parameter for such models, because incidents are stochastic and their durations are hard to predict (Grigorev et al., 2022). Y. Wang et al. (2021) formulated the pre-positioning of disaster supplies as a two-stage stochastic program in which facility location and supply decisions are made before uncertain demand is realised, and J. Wang et al. (2024) used discrete-event simulation of predicted incidents to allocate a limited fleet of safety service patrol vehicles across highway segments.
SmartFlow NLEX implements a two-stage stochastic mixed-integer clearance protocol that chooses how many response units to dispatch and when to escalate, using clearance scenarios drawn from the Kaplan–Meier curve (Section 3.11.4.4).








### 2.1.6 Geospatial Analysis and Traffic Visualization
Geospatial analysis serves as the foundational layer of modern transportation decision-intelligence systems, providing the visual framework needed to interpret large volumes of spatio-temporal traffic data. Bachechi et al. (2022) demonstrate that integrating traffic sensor observations into interactive dashboards using heatmaps and color gradients enables operators to efficiently pinpoint congested expressway sections and translate complex spatial data into actionable insights. Li, Z. and Li, D. (2022) further emphasize the integration of WebGIS to allow for dynamic interaction with urban traffic logistics, creating accessible interfaces for continuous infrastructure monitoring.
Berhanu et al. (2023) show that mapping the density of crash locations highlights corridors that need safety interventions. Visual summaries of this kind help operators see where and when congestion and incidents concentrate without reading raw tables.
### 2.1.7 Agent-Based Traffic Simulation
Agent-based models simulate individual travellers or vehicles that follow behavioural rules, so that system-level patterns emerge from their interactions. Bastarianto et al. (2023) review the use of agent-based models in urban transportation and the challenges of calibrating and validating them.
Rundel and De Amicis (2023) coupled the SUMO traffic simulator with a game engine to produce a low-cost digital twin that visualizes simulated traffic, showing how simulation can be made accessible to non-specialists.
Microscopic traffic simulation commonly pairs the Intelligent Driver Model for car-following with the MOBIL model for lane changing, both used to simulate traffic flow from individual driving behaviour (Sunberg & Kochenderfer, 2022; Treiber & Kesting, 2025). SmartFlow NLEX's Scenario Sandbox implements both models in TypeScript on an HTML5 Canvas, with demand drawn from NLEX toll data, so that operators can see how a lane closure or incident turns into a queue (Section 3.11.5.1).
### 2.1.8 Environmental Impact of Traffic Systems
2.1.8.1 Carbon Emissions and Traffic Congestion
Traffic congestion increases fuel consumption and emissions because of idling and stop-and-go driving (Afrin & Yodo, 2020). Zhang et al. (2024) showed that network-wide emissions depend on how traffic is distributed across a network, not only on total volume.
Tracking these emissions requires segmenting traffic by vehicle class, because energy use and emissions differ widely with engine type and load. Ignoring class differences would understate the contribution of heavy vehicles.

2.1.8.2 Theoretical Framework: National Emission Inventory Methodology
National emission inventories estimate road-transport emissions in tiers. At Tier 1, emissions are estimated from the quantity of fuel consumed and default fuel-based emission factors, while higher tiers multiply vehicle-kilometres by vehicle-category emission factors, which at Tier 3 also depend on average speed (Ntziachristos & Samaras, 2023).
The Philippines' plan for implementing its Nationally Determined Contribution sets the country's climate-mitigation roadmap for 2020–2030, including the transport sector (Climate Change Commission & Department of Environment and Natural Resources, 2023).
SmartFlow NLEX does not have fuel-sales data for the corridor, so it uses a distance-based estimate: vehicle-kilometres by class multiplied by fixed per-class CO₂ factors. This makes its results a corridor activity estimate that is consistent in approach with distance-based inventory methods, not a Tier 1 inventory.
2.1.8.3 Baseline Emission Metrics and Vehicle Classification
Emissions differ greatly by vehicle type, so inventories stratify traffic by class. Emission models such as COPERT assign factors by vehicle category and speed (Ntziachristos & Samaras, 2023).
SmartFlow NLEX applies the per-class baseline formula given in Equation 3.9.3.5, using factors of 192, 354 and 1,492 g CO₂/km for Classes 1, 2 and 3.
Applying class-specific factors ensures that heavy vehicles, which are a small share of traffic but a large share of CO₂, are weighted correctly in the corridor total.
2.1.8.4 Operational Efficiency and the Carbon "Idling Penalty"
Distance-only calculations understate the emissions caused by congestion, because vehicles queued behind an incident continue to emit while barely moving (Afrin & Yodo, 2020).
SmartFlow NLEX estimates this excess with a deterministic queueing model: while a lane is blocked for T minutes, arriving vehicles accumulate in a queue whose total delay grows with T², and the delay is multiplied by an idling emission factor (Equation 3.9.3.7). Because the factor is a passenger-car value applied to all classes, the estimate is a lower bound.
Expressing incident delay as excess CO₂ links operational performance to environmental impact and gives operators an additional reason to shorten lane blockages.
2.1.8.5 Emission Factor Sources
Emission factors can be taken from national standards, international emission models or commercial emission-factor databases. P. Wang et al. (2021) show the value of fusing data from multiple sources for traffic analysis.
SmartFlow NLEX stores its emission factors in a reference table: Class 1 and Class 2 factors from DENR/DOTC standards, and the Class 3 factor cross-checked once against the Climatiq database for heavy diesel trucks. Storing the factors keeps results reproducible and avoids depending on an external service at run time.
If NLEX adopts updated national factors, the reference table can be revised and the inventory recomputed.
### 2.1.9 Model Evaluation and Validation Techniques
2.1.9.1 Forecast Error Metrics (MAE, RMSE, MAPE, WMAPE)
Forecast error metrics quantify the difference between forecasts and observations (Hewamalage et al., 2021). The mean absolute error (MAE) measures the average error magnitude, while the root mean square error (RMSE) squares errors before averaging and so penalizes large errors more. Shang et al. (2022) report both when evaluating incident-duration predictions.
The mean absolute percentage error (MAPE) expresses error relative to actual values but is undefined at zero and unstable for small counts (Hewamalage et al., 2023). The weighted MAPE (WMAPE, also called WAPE), the ratio of total absolute error to total actual volume, is undefined only when all actual values are zero, so it avoids these problems and weights errors by volume (Hewamalage et al., 2023).
SmartFlow NLEX ranks regression models by WMAPE and also reports MAPE, RMSE and MAE for daily corridor totals.
2.1.9.2 Scale-Independent Metrics (MASE)
The mean absolute scaled error (MASE) divides a model's error by the in-sample error of a naive forecast, so it is scale-free, does not divide by individual actual values (which may be zero), and is comparable across series (Hyndman & Athanasopoulos, 2021). A value below 1 indicates that the model beats the naive forecast's in-sample error.
Because MASE is scale-free, it allows the same evaluation standard to be applied to targets with different units, such as daily vehicles and tonnes of CO₂ (Hewamalage et al., 2021).
SmartFlow NLEX computes MASE with a seasonal-naive (weekly) scale for its volume, CO₂ and incident models, so that targets with different units can be judged on the same basis.
2.1.9.3 Model Selection Criteria (AIC, BIC)
When developing statistical time-series models like ARIMA or SARIMAX, researchers must balance predictive accuracy with model simplicity. Introducing too many exogenous variables into an equation can lead to "overfitting," where the model memorizes historical noise rather than learning true underlying traffic patterns. Deretić et al. (2022) establish that the Akaike Information Criterion (AIC) and the Bayesian Information Criterion (BIC) are employed as rigorous model selection techniques to prevent this mathematical bloat.
Both criteria reward goodness of fit while penalizing each additional parameter, which discourages overfitting among models of the same family fitted to the same data.
SmartFlow NLEX records AIC for its statistical volume models but selects among model families by held-out error, because information criteria are not comparable across different model types.
2.1.9.4 Validation Techniques
Standard machine learning validation techniques, such as randomized k-fold cross-validation, are fundamentally invalid for traffic analytics because they violate the sequential integrity of time-series data, leading to severe data leakage. Hyndman and Athanasopoulos (2021) establish that evaluating traffic models requires strict temporal validation methods to ensure that algorithms do not artificially look into the future during the training phase.
2.1.9.4.1 Chronological Train-Test Split Evaluation
To maintain temporal integrity, models are trained on earlier data and tested on later, unseen data. Rolling-origin evaluation repeats this at successive forecast origins so that every test day follows its training data (Hewamalage et al., 2023).

The size of the test window involves a trade-off: a larger window covers more seasonal conditions, while a smaller one leaves more data for training.
SmartFlow NLEX reports two evaluation windows, the last 20% of the record (80/20) and the last 10% (90/10), and uses the 80/20 window for the published metrics. Results that differ between the windows are reported as a limitation.
2.1.9.4.2 Walk-Forward Validation
To further validate performance in highly dynamic environments like expressways, researchers utilize Walk-Forward Validation, also known as Time-Series Cross-Validation. Hyndman and Athanasopoulos (2021) detail that in this approach, the training window progressively slides forward in time, continuously updating the model with recent data before forecasting the next immediate step. This technique accurately simulates the continuous data flow of a real-world operational environment.
SmartFlow NLEX uses rolling-origin evaluation for its volume, CO₂ and fleet-mix models, which simulates repeatedly forecasting the next one to two weeks as new data arrive.
2.1.9.5 Model Benchmarking and Performance Metrics
A complex, computationally expensive model such as an LSTM or XGBoost is justified only if it outperforms simpler statistical benchmarks on held-out data (Makridakis et al., 2022).
If a complex model does not achieve a meaningfully lower error than a simpler benchmark, its added complexity is not justified. Benchmarking against such standards confirms whether the extra cost buys a measurable gain in accuracy.
SmartFlow NLEX benchmarks every candidate against seasonal-naive and climatology forecasts. The LSTM models did not beat these baselines and were not adopted, which shows why such benchmarking is necessary.
2.1.9.6 System Performance and Load Stress Validation
Performance testing checks that a system remains responsive under load, and caching is one of the main techniques for reducing web application response times, so its effect should be part of that testing (Zulfa et al., 2020).
Kermo and Dželihodžić (2026) compare server-side, client-side and hybrid rendering in otherwise identical web front ends and find that server-side rendering cuts First Contentful Paint by about 65% relative to client-side rendering, which affects how quickly pre-rendered content reaches users.
SmartFlow NLEX plans load and stress tests of its API with a scripted load-testing tool against a separate copy of the system (Section 3.13.6).

### 2.1.10 Key Performance Indicators (KPIs) in Traffic Management
2.1.10.1 Alert Lead Time and Mean Time to Clear (MTTC)
Incident clearance time is a key measure of incident-management performance, and Islam et al. (2021) model the factors that influence it on freeways.
However, effectively reducing MTTC requires proactive notification systems that dispatch resources before localized congestion compounds. Grigorev et al. (2024) emphasize that maximizing predictive lead time provides traffic operators with the critical buffer window necessary to deploy tow trucks, redirect approaching vehicles, and implement temporary lane management strategies, directly mitigating the severity of secondary crashes.
SmartFlow NLEX reports the mean time to clear (MTTC) by incident type as a baseline (KPI K9). Alert lead time is a proposed KPI, because issued alerts are not yet logged against later conditions.

2.1.10.2 Environmental Metrics (CO₂ per class-km)
Emission KPIs should reflect the different contributions of vehicle classes. Road-transport emission guidance assigns factors by vehicle category (Ntziachristos & Samaras, 2023).
Reporting the share of CO₂ that each class contributes, relative to its share of vehicle-kilometres, shows where interventions would have the most effect.
SmartFlow NLEX reports corridor CO₂ intensity (grams per vehicle-kilometre) and the heavy-vehicle shares of vehicle-kilometres and CO₂ (KPI K7). Because its factors are fixed per class, intensity changes only with fleet mix.

2.1.10.3 Forecast Accuracy Metrics (WMAPE, MAPE and MASE)
Forecast accuracy KPIs should be interpretable and robust. Hyndman and Athanasopoulos (2021) present scaled errors such as MASE as an alternative to percentage errors, which are undefined when an actual value is zero and extreme when it is close to zero.
Accuracy should be reported with the forecast grain, horizon and evaluation window, so that users know what the figure refers to.
SmartFlow NLEX reports WMAPE and MASE against naive baselines for its forecasts (KPIs K1, K3 and K5). A weather-advisory accuracy KPI was dropped because the weather-triggered advisory was withdrawn.

### 2.1.11 Feedback Loops and Model Retraining (MLOps Framework)
2.1.11.1 Feedback Loop Mechanisms in Machine Learning Systems
Machine-learning operations (MLOps) practices keep deployed models reliable as data change, through automated pipelines for training, validation, deployment and monitoring (Ruf et al., 2021).
A feedback loop compares forecasts with the outcomes that later occur and uses the differences to decide when a model needs retraining.
SmartFlow NLEX logs every served congestion forecast and scores it against the jams later observed. A feedback table for the other forecasts exists, but it holds no records yet, because the toll record ends on 30 June 2026.

2.1.11.2 Continuous Model Monitoring and Performance Tracking
To successfully manage an expressway, system administrators cannot wait for a catastrophic failure to realize a model is outdated; they must continuously track model degradation in real-time. Bayram et al. (2022) demonstrate that continuous monitoring frameworks achieve this by utilizing performance-aware drift detectors that constantly calculate the model’s real-time error metrics, such as MAE and RMSE.
This continuous surveillance provides immediate alerts when a system's calculations become statistically unreliable. The authors explain that if the tracking system detects that the AI is suddenly failing to accurately predict the volume of heavy-duty vehicles, and the forecast error breaches a pre-defined acceptable threshold, the monitoring module automatically flags the system for concept drift.
SmartFlow NLEX does not yet run a drift detector. Its weekly retraining batch re-evaluates every model against baselines and restores the previous model if a retrained one performs worse.

2.1.11.3 Model Retraining and Adaptive Learning (MLOps)
Ruf et al. (2021) review open-source MLOps tools that automate model retraining and validation across the pipeline stages.
Validating a retrained model against held-out data before deployment protects the system from publishing a worse model.
SmartFlow NLEX applies this through its weekly retraining batch, which backs up the active models, retrains them, applies an accuracy gate and restores the backup when the gate fails.




2.1.11.4 User Interaction Feedback
Prescriptive systems should also learn from how their users respond, for example by recording whether operators accept, modify or reject recommendations.
Such records show whether recommendations are practical and help calibrate rules and parameters.
SmartFlow NLEX will record operator decisions on recommendations during user-acceptance testing (KPI K12). Capturing them routinely in the dashboard is a proposed extension.

2.1.11.5 System Improvement Cycle
An improvement cycle links data, models and decisions: new observations update the models, and the results of decisions become new observations.
Ruf et al. (2021) describe MLOps pipelines in which retraining is triggered by new data or degraded performance.
In SmartFlow NLEX, the cycle consists of loading new NLEX data, weekly retraining with an accuracy gate, and operator review of recommendations. Because the system is advisory, its effect on the corridor depends on operators' decisions.
### 2.1.12 Large Language Models and Conversational Interfaces
2.1.12.1 LLMs for Commuter Conversational Interfaces
Numerical forecasts can be hard for non-specialists to interpret. Attioui and Lahby (2025) review the growing use of large language models (LLMs) in traffic forecasting research, including their ability to work with textual and contextual information.
To keep LLM answers grounded in reliable data, retrieval-augmented generation supplies retrieved documents to the model (Lewis et al., 2020), and tool use lets a model call external functions or application programming interfaces (APIs) to obtain current values (Schick et al., 2023; Patil et al., 2024).
SmartFlow NLEX's mobile assistant uses a Qwen model with three tools that return current corridor status from the system's API, so every number it reports comes from the system. It does not use retrieval-augmented generation and does not provide forecasts.

2.1.12.2 LLM-Driven Scenario Generation in Simulation Sandboxes
LLMs can also translate natural-language instructions into structured inputs for software, provided that the output is validated against what the software accepts.
Constraining the model to a fixed set of tools or a structured output schema reduces errors in the generated parameters (Patil et al., 2024).
In SmartFlow NLEX's Scenario Sandbox, a GLM model converts an operator's typed command into a structured scenario plan. Every field is validated by the system, and nothing is applied until the operator confirms it (Section 3.11.5.2).
### 2.1.13 Methods Considered for Future Work
Several established techniques were reviewed during the design of SmartFlow NLEX but are not part of the current system, and they are retained here as directions for future work. For descriptive analysis, seasonal-trend decomposition using LOESS separates a series into trend, seasonal and remainder components (Hyndman & Athanasopoulos, 2021), and its extension to several seasonal cycles (Bandara et al., 2025) would separate the daily and weekly patterns in hourly toll data explicitly. Autocorrelation and partial autocorrelation analysis would guide the choice of autoregressive orders, as Deretić et al. (2022) showed for traffic-accident series. Mixture models could identify traffic regimes from speed and flow observations, and fitting a speed–flow relationship to NLEX segments, as the Highway Capacity Manual does for basic freeway segments (National Academies of Sciences, Engineering, and Medicine, 2022), would estimate segment capacities. Kernel density estimation and the Getis-Ord Gi* statistic would test whether incident concentrations are statistically significant rather than ranking segments by counts (Berhanu et al., 2023; Alam & Tabassum, 2023).
For prediction, quantile regression forests would provide prediction intervals instead of point forecasts (Yao & Graham, 2025), and gated recurrent networks trained separately on wet and dry conditions could capture weather-specific speed dynamics (Hewamalage et al., 2021). Forecast combinations, which performed well in large forecasting competitions (Makridakis et al., 2020), could be tested against the current single champion models. Finally, volume-to-capacity monitoring and capacity-based alerts would become possible once segment capacities and passenger-car equivalents are available, and heuristic rerouting of emergency vehicles and commuters could extend the prescriptive tier. Each of these methods would be adopted only if it improves on the current models when evaluated against the same baselines.

## 2.2 Review of Related Systems and Technologies
This section explores the existing systems, architecture, and tools that implement the proposed decision-intelligence system. The way that many of the integrated technologies, including cloud services and machine learning pipelines, assist in creating an overall efficient means of traffic management, as well as forecasting traffic.
### 2.2.1 Intelligent Transportation Systems and Infrastructure
2.2.1.1 Cloud-Integrated ITS
Intelligent transportation systems increasingly rely on scalable platforms that store and process large volumes of traffic data. Bachechi et al. (2022) describe a big-data platform that integrates traffic sensor data, simulation and visual dashboards for traffic monitoring.
Afrin and Yodo (2020) argue that integrating congestion measures into operational systems supports more sustainable and resilient transportation networks and more efficient use of existing road space.
SmartFlow NLEX stores its integrated data in a managed PostgreSQL database with PostGIS on AWS, organized in bronze, silver and gold layers, so that historical and live data for the whole corridor are available to the analytics.
2.2.1.2 Multi-Layered Automated Systems
Traffic-management platforms are commonly organized in layers for data collection, analytics and presentation.
Separating these layers allows each to be developed and maintained independently.
SmartFlow NLEX follows this layering: ingestion into the warehouse, offline model training and an API that serves the dashboard and mobile application (Section 3.2.1.2).
### 2.2.2 Traffic Monitoring and Navigation Frameworks
2.2.2.1 Crowdsourced Reporting
Large volumes of crowdsourced reports must be filtered and prioritized. In software testing, Ling et al. (2025) used an LLM with clustering to prioritize crowdsourced test reports and reduce redundancy.
A similar approach could be used to prioritize commuter road reports. In the current version, SmartFlow NLEX shows community reports in the mobile feed without automated prioritization, which is a proposed extension.
### 2.2.3 Data Engineering and ETL Pipeline Frameworks
2.2.3.1 Data Integrity and Cleaning
Layered warehouse designs separate raw, cleaned and analysis-ready data. The lakehouse pattern unifies data warehousing and advanced analytics on open platforms (Armbrust et al., 2021).
Clean, consistent data are also needed to calibrate traffic simulations. Manglano-Redondo et al. (2025) calibrated origin–destination demand for SUMO simulations with a spatio-temporal neural network.
SmartFlow NLEX's pipeline validates, cleans and layers its data before analysis, and its sandbox draws demand from the cleaned hourly toll data.
2.2.3.2 Batch and Real-Time Handling
Traffic data can arrive in scheduled batches or continuously as feeds are polled or streamed.
SmartFlow NLEX combines batch loading of NLEX exports with polling of the live Waze feed about every two minutes.
### 2.2.4 Statistical Analysis and Validation
2.2.4.1 Correlative Validation
Statistical validation checks that data and model results behave as expected, for example by comparing related variables and by testing models against baselines. SmartFlow NLEX performs its statistical modelling and validation in Python (statsmodels, SciPy and scikit-learn).
Its validation consists of range and consistency checks in the ETL pipeline and baseline-relative evaluation of every model (Sections 3.9 and 3.11.3).
### 2.2.5 Machine Learning and Forecasting Engines (Python)
2.2.5.1 Deep Learning Frameworks
Recurrent neural networks such as LSTM and GRU are widely used for time-series forecasting (Hewamalage et al., 2021).
Python provides mature libraries for statistical and machine-learning forecasting.
SmartFlow NLEX trains its models in Python with statsmodels, Prophet, scikit-learn, XGBoost, TensorFlow/Keras, PyTorch, lifelines and mgwr, and stores their outputs in the warehouse.

### 2.2.6 Mathematical Optimization (Linear Programming)
2.2.6.1 Decision Intelligence
Decision support for traffic management follows an analytics path from descriptive and diagnostic to predictive and prescriptive analysis, helping operators monitor conditions, detect incidents and evaluate responses (Shah et al., 2024).
SmartFlow NLEX follows this path. Its prescriptive models are solved with the YALPS linear and mixed-integer programming solver and are presented with their assumptions so that operators can judge them.
### 2.2.7 Agent-Based Simulation
2.2.7.1 Autonomous Agent Simulation
Bastarianto et al. (2023) review agent-based models in urban transportation, covering their use for evaluating transport policies and services before implementation.
SmartFlow NLEX's sandbox applies agent-based simulation to the expressway, using IDM car-following and MOBIL lane changing (Section 3.11.5.1).
### 2.2.8 Database and Data Storage Technologies
2.2.8.1 High-Performance Architectures
Relational databases with spatial extensions support both analytical queries and geographic operations. PostgreSQL with PostGIS stores geometries such as road segments, jam lines and incident points with spatial indexes (Bachechi et al., 2022; Makris et al., 2021).
SmartFlow NLEX uses PostgreSQL 18 with PostGIS 3.6 on AWS RDS for its warehouse, and Supabase for user authentication.
2.2.8.2 Caching and Precomputation
Analytics dashboards stay responsive by caching frequently requested results and precomputing expensive aggregates instead of recomputing them on every request.
SmartFlow NLEX keeps an in-memory cache of API responses that serves the last result while refreshing it in the background, preloads common responses at start-up, and stores model outputs in the warehouse so that pages read precomputed results.
2.2.8.3 Redis
In-memory key-value stores such as Redis keep data in main memory, which gives high throughput and low latency for real-time web workloads (Yang et al., 2021), but main memory is volatile, so data can be lost on failure unless a separate persistence mechanism is used (Gong et al., 2022). Each key can be given a time to live, after which Redis deletes it automatically, and writing a key with SET replaces both its value and any earlier expiry (Redis, n.d.-a, n.d.-b). Upstash offers Redis as a managed service reached through an HTTP REST interface, which suits serverless functions (Upstash, n.d.).
In SmartFlow NLEX, the Waze ingestion process polls the feed every two minutes, writes it to the PostgreSQL warehouse, and overwrites a snapshot of the active jams and alerts in an Upstash Redis store with a ten-minute expiry, so a stalled feed is not presented as current. Because memory is volatile, the warehouse remains the system of record, and the dashboard's live map reads it through a short in-memory cache.
### 2.2.9 API Integration and External Data Sources
2.2.9.1 Event Data Collection
Event schedules can be collected from venue and ticketing websites. SmartFlow NLEX collected the Philippine Arena event calendar once from the venue's published schedule and updates it manually. An automated scraper is a proposed extension.
2.2.9.2 Weather and Air-Quality Data
Musah et al. (2022) evaluated the accuracy and suitability of the OpenWeatherMap API as an alternative source for weather data by comparing its forecasts against actual measurements recorded by the Brazilian National Institute of Meteorology (INMET) across two cities. The study focused on two key meteorological parameters, temperature and relative humidity, examining both current-day readings and lead-time forecasts spanning one to four days ahead.
Their results inform the use of OpenWeather data. SmartFlow NLEX uses OpenWeather's air-pollution history for measured air quality, while its hourly weather comes from Open-Meteo, ERA5 and JMA archives scored against reference sources.
### 2.2.10 Visualization and System Architecture
2.2.10.1 Proactive Management Visualization
Interactive, spatial visualizations help operators interpret traffic data. Rundel and De Amicis (2023) show how simulated traffic can be visualized in an accessible three-dimensional environment.
Bachechi et al. (2022) built a web-based urban traffic-monitoring dashboard with interactive maps and data visualization.
SmartFlow NLEX uses interactive charts, heatmaps and a live corridor map so that operators can see where and when congestion and incidents occur.
2.2.10.1.1 Next.js
Kermo and Dželihodžić (2026) compare server-side and client-side rendering in modern web applications, and Savenko and Babii (2025) evaluate Next.js optimization strategies, including server-side rendering and incremental static regeneration, against Core Web Vitals.
SmartFlow NLEX uses Next.js 15 with React 19 as a static export, which pre-builds the pages and lets them run inside the Electron desktop application without a web server.

2.2.10.1.2 TypeScript
According to Nguyen (2022), TypeScript is a strongly typed superset of JavaScript that improves web-application reliability through static type checking, catching errors such as type mismatches during development rather than at run time. Interfaces keep data structures, such as records returned by a database, consistent as they pass through an application.
SmartFlow NLEX uses TypeScript in both the dashboard and the API, so that data passed from the warehouse to the charts and maps follows shared type definitions. This reduces, but does not eliminate, run-time errors.

2.2.10.1.3 Apache ECharts
According to Yu and Yang (2024), Apache ECharts is a browser-based visualization library that aggregates diverse and imperfect data into clear charts and is used in applications such as smart-city displays and rail-transit monitoring.
By providing a clear solution for raw data aggregation and display, ECharts will enable the transformation of the system's raw backend data into actionable insights for the end user. This literature confirms that ECharts possesses the necessary technical robustness to render the complex time-series graphs and emission trends required by the decision-intelligence dashboard.
2.2.10.1.4 Mapbox
A key component of the platform, Mapbox GL JS, has been the subject of numerous performance studies. Zunino et al. (2020) conducted a comparative analysis of three widely used JavaScript web mapping libraries Leaflet, Mapbox GL JS, and OpenLayers using Argentina's Life Quality Index as a case study. Their findings revealed that Mapbox GL JS achieved the best overall performance on mid- and high-end devices when displaying raster or vector maps. This performance advantage was attributed to Mapbox GL JS's use of WebGL-based hardware acceleration, which enables efficient rendering even for data-heavy applications.
SmartFlow NLEX uses Mapbox GL JS to render the corridor, live Waze jams and alerts, forecast congestion states and maintenance closures.
2.2.10.1.5 GitHub
Version control records every change to a codebase and supports collaboration among developers.
The SmartFlow NLEX team uses Git and GitHub, with personal feature branches and backup branches created before each merge.
2.2.10.1.6 Figma
Du et al. (2025) argued that the development of multi-user collaborative interfaces requires a design methodology that is both task- and role-oriented to maintain operational consistency across shared workspaces. Their research emphasized that activities and identities of different users should have uniform visual indicators, ensuring that collaborators remain synchronized while performing distinct functional duties within the same environment.
SmartFlow NLEX follows this role-oriented approach: each operator role sees only the modules it needs, with consistent layouts across the traffic, incident and emission pages.
2.2.10.1.7 Electron
Electron combines the Chromium engine and the Node.js runtime into a single runtime so that web technologies can run as a cross-platform desktop application (Scoccia & Autili, 2020).
SmartFlow NLEX packages its dashboard with Electron as a Windows desktop application that serves the static Next.js build locally and connects to the SmartFlow NLEX API.
2.2.10.2 End-to-End Pipeline Design
Data pipelines need monitoring so that failures and stale data are detected before they affect decisions.
Common practices include logging each load, checking the freshness of live feeds and recording the outputs that were served.
SmartFlow NLEX logs uploads and retraining runs, flags live data older than 30 minutes, and logs served congestion forecasts for later scoring.
2.2.10.2.1 PostGIS
PostgreSQL with PostGIS has been used as the spatial database of a web-based urban traffic dashboard (Bachechi et al., 2022) and outperformed MongoDB on almost all spatio-temporal queries over a large vessel-tracking dataset (Makris et al., 2021).
In SmartFlow NLEX, PostGIS stores corridor segments, Waze jam lines and alert points with spatial indexes, which the live map queries by distance from the corridor.
### 2.2.11 Mobile Application Development Frameworks
According to Nguyen (2025), the evolution of mobile development has shifted toward frameworks that balance high-performance native rendering with developer efficiency. The study highlights React Native as a premier choice for cross-platform development due to its ability to translate JavaScript components into native UI elements. However, to manage the complexity of modern app deployment, Nguyen (2025) emphasizes the role of the Expo ecosystem and Expo Application Services (EAS). These tools provide a managed infrastructure that automates the "heavy lifting" of mobile development, such as credential management and build optimization. By utilizing Expo on top of React Native, developers can maintain a unified codebase while ensuring the application remains scalable and responsive across different operating systems.
SmartFlow NLEX's mobile application is built with Expo and React Native from a single codebase for Android and iOS. It currently runs as development builds; store release through Expo Application Services is planned.
## 2.3 Synthesis
The literature reviewed in Section 2.1 shows that expressway management benefits from moving from reactive observation toward anticipation. Prior studies have established the value of combining multiple data sources (Leinonen et al., 2025; P. Wang et al., 2021), the usefulness and limits of crowdsourced Waze data (Hoseinzadeh et al., 2020; Liu et al., 2024), the effects of rainfall and planned events on traffic (Giuliano & Lu, 2021; National Academies of Sciences, Engineering, and Medicine, 2022), and a broad set of forecasting methods. Benchmark studies, however, warn that complex models do not reliably outperform simpler ones (Makridakis et al., 2020; Manibardo et al., 2022), and prescriptive studies tend to address one decision at a time, such as signal control, patrol location or incident duration.
Section 2.2 shows that the technologies for such a system are mature and accessible: layered warehouses with spatial databases, Python forecasting libraries, optimization solvers, microscopic traffic simulation with IDM and MOBIL, web dashboards and cross-platform mobile frameworks, and language models that can be grounded through tool use. In the Philippine context, recent published research on NLEX is limited: Gernale and Juanico (2023) examined overloaded trucks on the corridor, which addresses a single aspect of its operation.

The gap that SmartFlow NLEX addresses is therefore not a new algorithm but the integration of these elements for one Philippine expressway corridor. It combines NLEX toll and incident records with Waze, weather, holiday and event data in one warehouse. It evaluates every forecast against naive baselines before publishing it, and it links validated forecasts to recommendations for staffing, patrol positioning, incident response and emissions. Operators can test interventions in an agent-based simulation, and commuters receive the same information through a mobile application. The project's contribution lies in this decision-support workflow, its transparent reporting of model accuracy and limitations, and its application to NLEX. Its value to operations remains to be confirmed through user-acceptance testing and, eventually, live deployment.

# CHAPTER 3
METHODOLOGY
This chapter presents the approach used to develop SmartFlow NLEX and documents the system as it has been built. It describes the CRISP-DM and Kanban-based Agile development process, compares the existing and proposed business processes, and explains the data pipeline that integrates NLEX toll and incident records with crowdsourced Waze data, historical weather, holidays and event calendars. It then sets out the project risks and feasibility, the system requirements and key performance indicators, the descriptive, predictive and prescriptive analytics models with their validation procedures, the agent-based simulation sandbox and language-model features, the quality assurance plan and the deployment plan. Throughout the chapter, each capability is identified as implemented, partially implemented or proposed, so that the methodology describes the system that was actually evaluated. Technical terms used in the analytics sections are defined in Appendix A.1 (Glossary).

## 3.1 Development Methodology
a.) Data Mining Process Model
CRISP-DM
The project follows the Cross-Industry Standard Process for Data Mining (CRISP-DM), which organizes analytics work into six phases: business understanding, data understanding, data preparation, modeling, evaluation and deployment. In SmartFlow NLEX, business understanding defined the operational questions of the NLEX Traffic Control Center; data understanding profiled the toll, incident, Waze, weather and event data; data preparation produced the bronze, silver and gold layers of the warehouse; modeling trained candidate forecasting, classification and optimization models; evaluation compared every candidate with naive baselines on chronologically held-out data; and deployment published the accepted model outputs to the dashboard and mobile application. Because new data and model results repeatedly sent the team back to earlier phases, the cycle was iterated rather than executed once.

Figure 3.1.1 CRISP-DM Process for Data Mining

b.) Iterative Development Framework
Agile Methodology
Agile methodology is a management framework that promotes a flexible, incremental approach to developing system modules through continuous delivery, frequent testing, rapid prototyping and the ability to respond to change. Rather than organizing work into fixed-length sprints, the project adopts a Kanban-based approach in which tasks are visualized on a board and pulled through the stages Backlog, In Progress, Testing and Done. Work is grouped into five cadences that follow the CRISP-DM phases (Table 3.1.1). Each team member develops a module on a personal feature branch; before every merge into the shared Main-Dashboard branch, the integrator creates a backup branch so that a merge can be reverted, and the merged build is smoke-tested locally before it is pushed.

Figure 3.1.2 Agile Development Methodology

Table 3.1.1. Mapping Table
| Cadence | CRISP-DM Phase | Analytics Focus | System Focus | Output |
| --- | --- | --- | --- | --- |
| Cadence 1 | Business and Data Understanding | Define operational questions and KPIs; profile toll, incident, Waze, weather and event data and record data gaps. | Provision the AWS RDS PostgreSQL/PostGIS database and Supabase authentication; define the warehouse layers. | Data inventory and exploratory analysis report |
| Cadence 2 | Data Preparation | Load, clean and integrate the sources into bronze, silver and gold layers; derive time, incident, traffic, emission and spatial features. | Build the batch loaders and the dashboard upload pipeline with validation gates and undo. | Integrated multisource warehouse |
| Cadence 3 | Modeling | Train candidate statistical, machine-learning and deep-learning models for volume, congestion, incidents, fleet mix and CO₂; build prescriptive models. | Build the dashboard analytics pages, the Live Map and the agent-based simulation sandbox. | Candidate models and prescriptive modules |
| Cadence 4 | Evaluation | Evaluate models chronologically against naive baselines using WMAPE, MASE, RMSE and classification accuracy; select champions. | Integrate model outputs, accuracy displays and plain-language narratives; verify the sandbox engine. | Model evaluation results and verification logs |
| Cadence 5 | Deployment | Publish accepted model outputs and schedule refresh and weekly retraining with an accuracy gate. | Package the dashboard as a desktop application, connect the mobile application and run system tests and user-acceptance testing. | Demonstration deployment of the decision-intelligence platform |

## 3.2 Business Process
### 3.2.1 Comparison of Existing and Proposed Business Processes
Comparing the existing and proposed business processes identifies where the current process can be improved. The existing process serves as the baseline against which the proposed process and its supporting technologies are justified.
3.2.1.1 Process Map
3.2.1.1.1 Existing Business Process/es

Figure 3.2.1.1.1.1 Flowchart Diagram (Existing Business Process)
The current NLEX business process involves The Central IT and Central Operations Maintenance and Management units at NLEX work in tandem to transform raw expressway data into operational intelligence through a structured data pipeline. Central IT manages the foundational infrastructure, using Apache NiFi and Kubernetes to ingest heterogeneous data from toll systems and lane alarms into a MinIO and Amazon S3 storage environment. This data is processed through a medallion architecture on Databricks, where the engineering team maintains the Bronze (raw) and Silver (cleansed) layers to ensure high data quality and reliability.
Transitioning to the analytical phase, the Big Data Analytics (BDA) team within Central Operations curates the Gold layer by applying specific business logic to create datasets optimized for traffic demand and road quality reports. The process culminates in the dissemination of validated insights via Microsoft Power BI and spreadsheet models, providing executive leadership with the necessary tools for data-driven decision-making.
This description of the existing process is based on the proponents' consultation with NLEX personnel and has not been independently verified against internal NLEX documentation. SmartFlow NLEX does not connect to the NLEX Databricks environment. For the capstone, NLEX data exports were loaded into a separate PostgreSQL warehouse that follows the same bronze, silver and gold layering, so the proposed process can be evaluated without modifying NLEX production systems.
3.2.1.1.2 Proposed Business Process/es
The proposed business process defines the users of the system and the actions each role may perform. Every user signs in with an email address and password followed by a six-digit time-based one-time password (TOTP) generated by an authenticator application. The second factor is enforced by the application programming interface (API), which rejects any session that has not completed it. Operators may mark a device as trusted for seven days, and idle sessions are signed out automatically after a configurable period (15 minutes by default).



Table 3.2.1.1.2.1 System Users
| User Role | Description | Responsibilities | Modules Access | Permissions | Authentication |
| --- | --- | --- | --- | --- | --- |
| SmartFlow NLEX Dashboard | SmartFlow NLEX Dashboard | SmartFlow NLEX Dashboard | SmartFlow NLEX Dashboard | SmartFlow NLEX Dashboard | SmartFlow NLEX Dashboard |
| Data Analyst | Administrator of the analytics platform | Manage data uploads and undo, review model accuracy, audit system activity, and configure the mobile application | All modules: Overview, Traffic, Incidents, Emissions, Live Map, Maintenance, Mobile App, Scenario Sandbox, Data Management, Audit Log, Settings | Create, Read, Update and Delete | Email + password + authenticator (TOTP) |
| NLEX Traffic Control Center (TCC) Operator | Operations staff responsible for corridor-wide traffic flow | Monitor live corridor conditions, review forecasts and recommendations, run what-if scenarios, and schedule road maintenance | Overview, Traffic, Incidents, Live Map, Maintenance, Mobile App, Scenario Sandbox, Settings | Read; Create, Update and Delete for maintenance schedules | Email + password + authenticator (TOTP) |
| Incident Operator | Operations staff dedicated to incident management | Monitor incidents and live Waze alerts, and review incident analytics and response recommendations | Overview, Traffic, Incidents, Live Map, Maintenance (view), Mobile App, Settings | Read | Email + password + authenticator (TOTP) |
| SmartFlow NLEX Mobile | SmartFlow NLEX Mobile | SmartFlow NLEX Mobile | SmartFlow NLEX Mobile | SmartFlow NLEX Mobile | SmartFlow NLEX Mobile |
| Commuters / Drivers | End users of the mobile application | View corridor status and congestion forecasts, read alerts, post community reports, and ask the assistant | Dashboard, Corridor, Community, Assistant, Alerts | Read; Create for community posts | Email + password + authenticator (TOTP) |


A. Dashboard Swimlane Diagrams

Figure 3.2.1.1.2.1 Dashboard Login and Home Feature Swimlane Diagram (Proposed Business Process)
The Login Feature (Figure 3.2.1.1.2.1) is the system's security gateway. The user enters an email address and password or starts the Forgot Password sequence, which sends a reset link by email. After the credentials are accepted, the system requests the six-digit code from the user's authenticator application (shown as “OTP” in the figure). The API accepts only sessions that have completed this second factor, unless the device was marked as trusted within the last seven days. Role-based access control then determines which modules appear. The Overview page is the landing page and shows live corridor status by exit, derived from the Waze feed, together with navigation to every module the role may open.

Figure 3.2.1.1.2.2 Dashboard Traffic and Incident Feature Swimlane Diagram (Proposed Business Process)

Figure 3.2.1.1.2.2 shows that the Traffic and Incident features follow the same three-tier structure. Selecting a tab opens its Descriptive, Predictive and Prescriptive views. The descriptive view presents historical patterns computed from the warehouse: volume trends, hour-by-weekday profiles, holiday and event impacts, incident frequency, hotspots by kilometre post, wet-versus-dry crash rates and clearance times. The predictive view presents stored outputs of the champion models, such as daily volume, congestion state by exit and hour, incident counts and clearance-time estimates, together with each model's held-out accuracy. The prescriptive view presents recommendations computed from those forecasts: toll-booth staffing, congestion-response urgency, patrol positioning and the incident clearance protocol. Each chart can be accompanied by a plain-language narrative generated from the values already displayed.

Figure 3.2.1.1.2.3 Dashboard Emission and Agent Based Simulation Feature Swimlane Diagram (Proposed Business Process)
Figure 3.2.1.1.2.3 shows the Emission feature and the agent-based simulation feature. The Emissions tab presents descriptive estimates of corridor CO₂, PM2.5 and NO₂ by vehicle class and exit, a CO₂ forecast and a fleet-mix forecast, and prescriptive emission strategies ranked by the Technique for Order of Preference by Similarity to Ideal Solution (TOPSIS) with bootstrap uncertainty ranges. The Scenario Sandbox (labelled AI Sandbox in the design figure) lets an operator choose a kilometre stretch, direction and time, stage interventions such as lane closures, speed limits, counterflow and incidents, either with on-screen controls or by typing a command that a language model converts into scenario settings, and then run a microscopic traffic simulation that compares the intervention with a no-intervention baseline.

Figure 3.2.1.1.2.4 Dashboard Maintenance and Map Comparison Feature Swimlane Diagram (Proposed Business Process)
Figure 3.2.1.1.2.4 shows the Maintenance and Live Map features. In the Maintenance feature, an authorized user views the schedule table, enters a road-work schedule by exit, direction and official kilometre posts, and confirms it. The system validates and stores the schedule, the mobile application retrieves it and shows it to commuters as a notice. The Live Map (labelled Map Comparison in the design figure) keeps the side-by-side comparison: the left map shows live Waze jams and alerts from the last 60 minutes, and the right map shows the forecast congestion state for a chosen hour up to seven days ahead, together with the model that produced it. Active maintenance closures are drawn on both maps, and a corridor strip below them summarizes either view by exit.


Figure 3.2.1.1.2.5 Dashboard Data Management and Audit Log Feature Swimlane Diagram (Proposed Business Process)
Figure 3.2.1.1.2.5 shows the Data Management and Audit Log features. A data analyst uploads a CSV or XLSX export of toll, accident or breakdown records. The system classifies the file, runs it through the cleaning, transformation and validation gates, and either reports the result without saving (check mode) or loads it into the warehouse in a single transaction that can later be undone. Accepted data becomes available to the weekly retraining batch; uploading does not retrain models immediately. The Audit Log records sign-ins, sign-outs, idle time-outs, page views, uploads, maintenance changes and model retraining events, and lets the analyst filter them by category, severity and time and export them.


Figure 3.2.1.1.2.6 Dashboard High Level Swimlane Diagram (Proposed Business Process)
Figure 3.2.1.1.2.6 presents the high-level dashboard swimlane across the three operator roles. All users pass the same sign-in and authenticator check, after which role-based access control determines the visible modules. Incident Operators reach the analytics pages, the Live Map and the maintenance schedule in read-only form. TCC Operators additionally reach the Scenario Sandbox and may edit maintenance schedules. Data Analysts reach every module, including Emissions, Data Management and the Audit Log. All features draw on the same warehouse, which is populated by the ingestion pipeline and by the scheduled model jobs.

B. Mobile Swimlane Diagrams

Figure 3.2.1.1.2.7 Mobile Login and Dashboard Feature Based Swimlane Diagram (Proposed Business Process)

Figure 3.2.1.1.2.7 shows the login and dashboard workflow of the mobile application across two swimlanes, Commuters & Drivers and System. A commuter signs in with an email address and password and then the six-digit code from an authenticator application (the figure shows this step as an SMS OTP; the implemented second factor is TOTP). The commuter may also reset a forgotten password through an emailed link.
After signing in, the Dashboard tab shows the corridor's live status, the volume and congestion outlook, upcoming maintenance notices and recent incidents, all retrieved from the SmartFlow NLEX API that also serves the operator dashboard. Operators control which sections appear in the application through the Mobile App page of the dashboard, so that advisories can be published to commuters without releasing a new version of the application.






Figure 3.2.1.1.2.8 Mobile Map and Community Feature Based Swimlane Diagram (Proposed Business Process)
Figure 3.2.1.1.2.8 shows the Corridor (Map) and Community features. In the Corridor tab, the commuter switches between the live view and the forecast view and chooses a forecast hour. The application then retrieves the predicted congestion state of each exit for that hour, up to the model's published horizon of 168 hours. In the Community tab, the commuter reads and posts community updates and incident reports with optional photos. Community posts are stored in the application's own Supabase database and shown in the application feed. In the current version they are not loaded into the analytics warehouse and are not used by the forecasting models.


Figure 3.2.1.1.2.9 Mobile AI Chatbot and Alert Feature Based Swimlane Diagram (Proposed Business Process)
Figure 3.2.1.1.2.9 shows the Assistant and Alert features. The Assistant answers questions about the NLEX corridor in English, Tagalog or a mix of both. A large language model (Qwen, accessed through OpenRouter) interprets the question and calls three tools that return live corridor status, a corridor overview and the list of exits from the SmartFlow NLEX API. It then phrases the answer in plain language. The assistant does not produce forecasts of its own and declines questions outside the NLEX corridor. In the Alert feature, the user enables or disables notifications. When notifications are enabled, the application schedules notifications on the device for operator advisories, scheduled maintenance and new incident reports while the application is in use. Server-sent push notifications are not implemented in the current version.

Figure 3.2.1.1.2.10 Mobile High Level Swimlane Diagram (Proposed Business Process)
The mobile high-level swimlane diagram (Figure 3.2.1.1.2.10) summarizes the end-to-end interaction of the mobile application across the Commuters & Drivers and System swimlanes. The workflow starts with sign-in, in which the system validates the credentials and the authenticator code and either returns the user to the login screen or opens the mobile dashboard.
From the dashboard, the user reaches five modules: Dashboard, Corridor, Community, Assistant and Alerts. The Dashboard, Corridor and Alert modules read live status, forecasts, maintenance schedules and advisories from the SmartFlow NLEX API. Community posts and authentication use Supabase. The Assistant uses a language model with tool access to the live corridor data. The machine-learning models themselves run in the operator-side pipeline and are retrained weekly. The mobile application consumes their stored outputs and does not train or modify models.
3.2.1.2 Data Flow Diagram
The SmartFlow NLEX data pipeline moves data from its sources through staging, transformation and a layered warehouse to the analytics models and the user interfaces. Figure 3.2.1.2.1.1 presents the pipeline as designed. The paragraphs below describe each layer as implemented and note where the implementation differs from the design. The differences are summarized in Table 3.2.1.2.1.
3.2.1.2.1 Proposed Data Pipeline

Figure 3.2.1.2.1.1 Data Pipeline
a.) Source Layer
The Source Layer gathers data from six origins. The first is NLEX Corporation exports: hourly toll transactions by plaza, direction and vehicle class, and accident, breakdown and crash records. The second is the Waze for Cities (Partner Hub) feed, both as a historical archive and as a live feed. The third is historical hourly weather from Open-Meteo, ERA5 and the Japan Meteorological Agency (JMA), with historical air quality from the OpenWeather Air Pollution service. The fourth is a Philippine Arena event calendar collected once from the venue's published schedule, and the fifth is the Philippine holiday calendar. The sixth is community reports submitted through the mobile application, which are stored separately and are not yet part of the analytics pipeline.

b.) Extract Layer
In the Extract Layer, historical data were loaded in batches. The 2022–2025 toll and Waze archives and the weather history were loaded by one-off scripts. New NLEX exports are loaded through the dashboard's Data Management upload, which parses the file and runs the validation gates. The live Waze feed is polled every two minutes by a separate ingestion process on AWS in the Asia Pacific (Singapore) region. Each cycle writes the feed to the database and also overwrites a short-lived snapshot of active jams and alerts in an Upstash Redis store, which expires after ten minutes so that a stalled feed is not presented as current. Redis therefore holds the latest snapshot rather than buffering records before they reach the database, and the dashboard's live map reads the more complete PostgreSQL copy through a 30-second in-memory cache.
c.) Staging Layer
Extracted records are stored first in the bronze schema of an Amazon Web Services (AWS) Relational Database Service (RDS) PostgreSQL 18 database with the PostGIS 3.6 extension, which keeps each source in its received form. Before records move on, the upload pipeline checks that the file parses and is non-empty, classifies it by its header signature, rejects records without a valid date, location or kilometre post, holds back dates after the end of the record, and skips duplicates by natural key. The design's personally identifiable information (PII) detection gate is not implemented. Breakdown records keep plate-number and driver fields in the warehouse, and masking them is listed as a required improvement.

d.) Transform Layer
The Transform Layer cleans and standardizes the staged records. Exit names are resolved to canonical names, dates and times are normalized, values outside physical ranges are removed (for example, clearance times outside 0–1,440 minutes and negative casualty counts), and the most reliable weather reading per hour is retained. Feature engineering derives calendar features (hour, weekday, month, weekend and holiday flags), traffic aggregates by exit, direction and class, incident durations and kilometre positions, per-class emission estimates and event and weather indicators. Imputation is applied only by the weather source, which flags imputed rows; the warehouse excludes those rows rather than interpolating.
e.) Load & Data Warehouse Layer
Validated records are published to the silver schema (cleaned records) and the gold schema (analysis-ready facts, aggregates and model outputs). The main fact table is gold.fact_traffic_hourly, which holds hourly toll entries and exits by plaza, direction and class. Supporting tables include the emission fact, incident event tables, Waze jam and alert facts with PostGIS geometries, and dimension tables for time, location and incident type. Model outputs and accuracy metrics are written to dedicated gold tables (Section 3.10). The gold layer serves the dashboard and the mobile application through the API. No retrieval-augmented generation (RAG) index was built on it.

f.) Analytics and Machine Learning Layer
The analytics layer reads the gold layer. Descriptive analytics are computed on request by SQL queries in the API. Predictive models are trained offline in Python, and their forecasts and held-out metrics are stored in gold tables. The congestion-state model is refreshed every hour. The other models are retrained in a weekly batch that keeps a backup of the current models and publishes a new model only if it passes an accuracy gate against naive baselines; otherwise the previous model is restored. Prescriptive models (staffing, patrol positioning, clearance protocol, congestion urgency and emission strategy ranking) are computed by the API from the stored forecasts when a page is viewed.
g.) Consumption Layer
The Consumption Layer comprises two interfaces. Operators use a Next.js 15 and React 19 dashboard built as a static export and packaged as a Windows desktop application with Electron, which uses Apache ECharts for charts and Mapbox GL JS for the corridor map. Commuters use a mobile application built with Expo and React Native, which provides corridor status and forecasts, community reports, alerts and a conversational assistant.

h.) Orchestration, Monitoring, and Security Layer
The Orchestration, Monitoring and Security Layer supports the whole pipeline. Orchestration consists of Windows scheduled tasks that run the hourly congestion refresh and the weekly retraining batch on a project workstation; no central workflow server is used. Monitoring consists of the audit log, the retraining batch log, a feed-freshness check that flags live data older than 30 minutes, and a log of served congestion forecasts that is later scored against observed jams. Security consists of authenticator-based sign-in, role-based access control on administrative and write endpoints, rate limiting and encrypted connections to the database. Gaps in the current implementation are discussed in Section 3.4.1 and Section 3.14.
Table 3.2.1.2.1. Data Pipeline Design Compared with the Implemented Pipeline
| Layer | Design (Figure 3.2.1.2.1.1) | Implemented | Status |
| --- | --- | --- | --- |
| Source | NLEX data, weather API, ticketing scraper, Waze Partner Hub, community reports | NLEX exports; Waze archive and live feed; Open-Meteo/ERA5/JMA weather history; OpenWeather air-quality history; one-off Philippine Arena calendar; holiday calendar | Partial: no live weather API, no recurring scraper, community reports not ingested |
| Extract | Scheduled Python batch plus Redis real-time streaming; Gates 1–2 | One-off batch loads; dashboard file upload; live Waze polled every 2 minutes into PostgreSQL, with a 10-minute Redis snapshot of active jams and alerts | Partial: Redis holds a short-lived snapshot, not a buffer in front of the database; the dashboard reads PostgreSQL |
| Staging | PostgreSQL bronze layer; Gate 3 with PII detection | AWS RDS PostgreSQL 18 + PostGIS bronze schema; parse, classify, required-field, date and duplicate checks | Partial: no PII detection or masking |
| Transform | Cleaning and feature engineering; Gate 4 | Canonical exits, normalization, physical-range and business rules, calendar, traffic, incident, emission and spatial features | Implemented |
| Load / Warehouse | PostGIS silver warehouse; gold datamart used as RAG source | Silver and gold schemas; gold fact and model-output tables; PostGIS geometry for Waze and segments | Implemented; no RAG index |
| Analytics / ML | Descriptive, predictive and prescriptive engines; MLOps loop with Gate 5 | SQL descriptive queries; offline Python training; hourly congestion refresh; weekly retrain with accuracy gate and restore; API-computed prescriptive models | Implemented (single-workstation scheduler) |
| Consumption | Next.js + Electron dashboard; Expo mobile app with AI chatbot | Next.js static export in Electron; Expo/React Native app; GLM narratives and sandbox commands; Qwen tool-calling assistant | Implemented |
| Orchestration, monitoring, security | Audit logs, drift monitoring, MFA, encryption, masking | Windows scheduled tasks; audit log; feed freshness; forecast log; TOTP MFA; role checks; TLS to database without certificate verification | Partial: no masking, no alerting |

Figure 3.2.1.2.2.2 Data Pipeline - Modeling Layer
Figure 3.2.1.2.2.2 presents the modeling layer, which organizes the analytics into three tiers. Descriptive analytics establish historical baselines, predictive analytics anticipate future conditions, and prescriptive analytics recommend or evaluate interventions. The layer covers three operational domains. The figure reflects the original design. The methods that were implemented, partially implemented or deferred are listed in Section 3.11 and in Table 3.11.1.
In the Traffic Volume and Congestion domain, the descriptive tier aggregates hourly toll entries into daily, hourly and hour-by-weekday patterns and measures holiday and event effects against local control-day baselines. The predictive tier forecasts daily corridor volume with candidate statistical, machine-learning and deep-learning models evaluated by rolling-origin validation (Prophet is the current champion). It also classifies the congestion state of each exit for 1 to 168 hours ahead with an XGBoost classifier trained on the live Waze feed, and estimates event-day uplift at the Philippine Arena exit. The prescriptive tier converts these forecasts into an hourly toll-booth staffing plan, a fuzzy-rule congestion-response urgency (Monitor, Prepare or Act) and a TOPSIS ranking of event interventions.
In the Incident Management and Safety domain, the descriptive tier counts incidents by type, cause, hour and five-kilometre segment, compares crash rates in wet and dry hours, and summarizes clearance times with means, percentiles and Kaplan–Meier curves. The predictive tier forecasts daily incident counts with a negative binomial regression, estimates severity and clearance time (ordinal logistic regression, XGBoost and a Cox proportional hazards model), and models spatial variation with geographically weighted regression and a spatial LSTM. The prescriptive tier positions patrol units with a maximal covering location model and recommends how many response units to dispatch and when to escalate with a two-stage stochastic mixed-integer program that accounts for uncertain clearance times.
In the Environmental Impact domain, the descriptive tier estimates CO₂, PM2.5 and NO₂ by multiplying vehicle-kilometres by fixed per-class emission factors and estimates the additional CO₂ emitted by vehicles queued behind lane-blocking incidents. The predictive tier forecasts corridor CO₂ with gradient boosting regression and the vehicle-class mix with Dirichlet regression. The prescriptive tier compares three strategies: shorter lane blockages, faster response in the busiest hours and a lower heavy-vehicle share (a what-if only). It attaches bootstrap uncertainty ranges and ranks the strategies with TOPSIS, and also identifies the exits and hours where a heavy-vehicle time window or a peak toll differential would apply. Operators can test such interventions in the Scenario Sandbox before considering them on the road.
## 3.3 Business Solution
SmartFlow NLEX is a decision-intelligence system intended to help NLEX operators move from reactive monitoring to anticipatory traffic management, particularly for non-routine conditions such as incidents, adverse weather, holidays and large events. It integrates NLEX toll and incident records with crowdsourced Waze data, weather, holiday and event calendars in one warehouse. On top of that warehouse it provides descriptive baselines, validated forecasts and recommendations, and it reports the accuracy of every forecast so that operators can judge how far to rely on it.
The solution is delivered through two connected products. The first is an operator dashboard for the Traffic Control Center that presents traffic, incident and emission analytics, a live corridor map and maintenance scheduling. It also includes a scenario sandbox in which operators can simulate interventions such as lane closures or counterflow on a chosen stretch before applying them on the road. The second is a mobile application for commuters that shows live corridor status, congestion forecasts by exit for up to seven days, maintenance notices and community reports, and offers a conversational assistant for corridor questions. Together, the products are intended to help operators prepare for predictable and unpredictable demand and to help commuters plan trips around expected congestion. The system is advisory: all operational decisions remain with NLEX personnel.
## 3.4 Project Risk and Feasibility Studies
This section examines whether the SmartFlow NLEX project is realistic and feasible. It covers risks that could arise during development, including whether the required technology is available, whether the system aligns with NLEX's operations, and whether the costs are manageable. The goal is to ensure the project can be built within the capstone period and used beyond it.
### 3.4.1 Risk Management
Like any software project, SmartFlow NLEX faces a number of risks from issues with data sources and APIs in the Source Layer, to problems with the pipeline's Transform and Validation processes, and even team-related concerns. The proponents identified the most likely risks and planned how to handle each one before it became a bigger problem.

The risks are evaluated using two factors: how likely they are to occur (Probability) and how severe their impact would be on the project if they did (Impact). Both are rated on a 1–5 scale, where 1 is low and 5 is high. The Risk Level is then determined based on the combination of these two scores, as shown in the matrix, Table 3.4.1.1.
Table 3.4.1.1. Risk Management Impact
|  | LOW (IMPACT) | MEDIUM (IMPACT) | HIGH (IMPACT) |
| --- | --- | --- | --- |
| LOW (PROBABILITY) | LOW | LOW | MEDIUM |
| MEDIUM (PROBABILITY) | LOW | MEDIUM | HIGH |
| HIGH (PROBABILITY) | MEDIUM | HIGH | HIGH |
Table 3.4.1.2 Risk Management Legend
| LEGEND | LEGEND | LEGEND |
| --- | --- | --- |
| Impact | Probability (Likelihood) | Impact (Severity) |
| 1 (Low) | Unlikely: Rare occurrence; less than 20% chance of happening during the development cycle. | Minor: Small problem; easy to fix without delaying the project. |
| 3 (Medium) | Possible: Moderate likelihood; 20% to 50% chance of occurrence. May have happened in similar capstone projects. | Moderate: Will affect a specific part of the pipeline and may require adjusting the timeline or reassigning tasks. |
| 5 (High) | Likely: Frequent or expected occurrence; over 50% chance. High probability due to external dependencies (APIs, web structures). | Critical: Serious problem that could prevent the project from being completed or break a core layer of the pipeline. |

Table 3.4.1.3. Risk Management Table
| Risk ID | Potential Risk Factor | Prob. (1-5) | Impact (1-5) | Risk Level | Mitigation & Contingency Action Plan |
| --- | --- | --- | --- | --- | --- |
| R01 | Event data becomes outdated: the Philippine Arena calendar was collected once and is not refreshed automatically. | 5 | 3 | HIGH | Mitigation: assign an owner to update the event table before each month. Contingency: rely on holiday and weekday seasonality, and label event forecasts as unavailable for events not in the calendar. |
| R02 | Live data interruption: the Waze feed or its ingestion process stops, so live map and congestion inputs become stale. | 3 | 5 | HIGH | Mitigation: feed-freshness check flags data older than 30 minutes, and congestion forecasts are marked expired after 12 hours. Contingency: show the last available data with its timestamp and fall back to historical profiles. |
| R03 | Incomplete or unverified NLEX data: missing clearance timestamps, gaps in Waze history, and 2020–2021 records from files labelled synthetic. | 5 | 5 | HIGH | Mitigation: restrict analyses to January 2022 onward, report coverage with each KPI, and exclude invalid durations. Contingency: confirm data provenance with NLEX and document remaining gaps as limitations. |
| R04 | Low model accuracy: candidate models fail to beat naive baselines (as LSTM did for volume). | 5 | 3 | HIGH | Mitigation: rolling-origin evaluation against seasonal-naive and climatology baselines, and a weekly retraining gate. Contingency: keep the previously accepted model or present the baseline when no model passes. |
| R05 | Team member unavailability or single-machine dependence: the hourly and weekly jobs run on one workstation. | 3 | 3 | MEDIUM | Mitigation: version-control all code and document job registration. Contingency: move scheduled jobs to a shared server or cloud scheduler, and redistribute tasks. |
| R06 | Scope creep: new features are added beyond the approved scope. | 5 | 3 | HIGH | Mitigation: adviser approval before backlog additions. Contingency: freeze the scope after Cadence 3 and move non-essential items to the post-capstone roadmap. |
| R07 | Cloud and API cost overrun: AWS RDS, language-model APIs, Render and Mapbox usage exceed the project budget. | 3 | 3 | MEDIUM | Mitigation: use free tiers where available, cache API responses, and monitor billing monthly. Contingency: downgrade the database instance or use a local PostgreSQL for development. |
| R08 | Security weaknesses: user-editable roles with open sign-up, unauthenticated write endpoints, public repositories that expose infrastructure details, and unmasked PII. | 3 | 5 | HIGH | Mitigation: store roles in server-controlled metadata, disable public sign-up, require authentication on all write endpoints, mask PII, and restrict database network access. Contingency: rotate credentials and inform the NLEX focal person within 24 hours of any compromise. |
| R09 | Shared-database write contention: several developers run jobs that delete and rewrite the same tables. | 5 | 3 | HIGH | Mitigation: give each job its own output table and use a staging database for development. Contingency: restore from the model backup schema. |
| R10 | Language-model provider dependency: latency, credit limits or provider changes affect narratives, sandbox commands and the assistant. | 3 | 3 | MEDIUM | Mitigation: template fallbacks for narratives and validation of every model response. Contingency: switch providers through configuration. |
| R11 | Data-sharing and privacy compliance: NLEX data and personal fields are processed outside NLEX systems. | 3 | 5 | HIGH | Mitigation: keep repositories private, mask personal fields, and document the data-sharing agreement. Contingency: remove affected data and notify the NLEX data owner. |

### 3.4.2 Technological Feasibility
SmartFlow NLEX is built with widely used, well-documented and mostly open-source technologies, which makes it technically feasible within the budget and time of a capstone project. The technologies listed below are the ones actually used in the implemented system.
For analytics and machine learning, the system uses Python with pandas and NumPy for data processing, statsmodels for SARIMAX, Holt-Winters and generalized linear models, Prophet for decomposable time-series forecasting, scikit-learn and XGBoost for tree-based models, TensorFlow/Keras and PyTorch for the recurrent neural network comparators, lifelines for survival analysis, and mgwr for geographically weighted regression. Optimization models are solved with the YALPS linear and mixed-integer programming solver in TypeScript.
For data access and caching, the API keeps an in-memory cache of route responses with stale-while-revalidate behaviour and preloads frequently used responses at start-up. Live Waze data are written to PostgreSQL every two minutes by a polling process on AWS, which also refreshes a ten-minute Upstash Redis snapshot of active jams and alerts. The dashboard reads the database copy.
For data storage, the system uses PostgreSQL 18 with the PostGIS 3.6 spatial extension on AWS RDS in the Asia Pacific (Singapore) region. The warehouse is organized into bronze, silver and gold schemas. Supabase provides user authentication, including authenticator-based multi-factor authentication, and stores the mobile application's community posts.
For data sources, the system uses NLEX toll and incident exports, the Waze for Cities (Partner Hub) feed, historical weather from Open-Meteo, ERA5 and JMA, historical air quality from OpenWeather, a Philippine Arena event calendar and the Philippine holiday calendar. Event data were collected once from the venue's published calendar; an automated ticketing-site scraper was planned but not built.
For the interfaces, the operator dashboard is built with Next.js 15, React 19 and TypeScript, uses Apache ECharts and Mapbox GL JS, and is packaged with Electron as a Windows desktop application. The API is built with Node.js, Express and TypeScript. The Scenario Sandbox runs a TypeScript traffic simulation on an HTML5 Canvas inside the dashboard. The mobile application is built with Expo and React Native for Android and iOS. Language-model features use GLM models from Z.ai (dashboard narratives and sandbox commands) and Qwen models through OpenRouter (mobile assistant), both through OpenAI-compatible APIs.
All of these components are free, open-source or available on free tiers during development, except the AWS RDS database and the language-model APIs, which are usage-billed. The team was able to learn and use all of them within the capstone timeline.
### 3.4.3 Organizational/Cultural Feasibility
SmartFlow NLEX will fit well with how NLEX Corporation already operates and where it is headed as a company. NLEX has already been moving toward digital solutions through tools like the Easytrip cashless payment system and the MPT DriveHub app under MPTC, so adding a data-driven traffic management system will be a natural next step for them.
The Web Dashboard will be designed specifically for NLEX operators at the Traffic Control Center (TCC). It will give them a centralized interface for monitoring current traffic conditions, reviewing historical trend data, and viewing predictive forecasts that anticipate how traffic will behave in the coming hours. Beyond visibility, the dashboard will also surface actionable guidance through the prescriptive analytics engine, which will generate recommended strategies such as lane management changes, and incident response protocols based on predicted traffic conditions. Operators will also be able to test scenarios before committing to any action using the What-If Simulation feature through the Agent-Based Simulation Sandbox, allowing them to evaluate the projected impact of different interventions in a risk-free environment. Throughout all of this, the system will only provide suggestions, and final decisions will remain with the operators managing the expressway. This design will make it easier for staff to trust and adopt the system without feeling like it is replacing their judgment.
The community feature of the mobile application builds on commuters' familiarity with crowdsourced reporting in applications such as Waze. In the current version, community posts are shown in the application feed and are not merged with the Waze feed or the analytics warehouse. Using them as an additional data source would first require moderation and validation rules.
The project responds to operational gaps that NLEX personnel described to the proponents, in particular the limited use of forecasts for non-routine conditions and the separation of toll, incident, weather and event data. By integrating these sources and adding forecasts and recommendations to a single interface, SmartFlow NLEX addresses those gaps without replacing existing NLEX systems.
### 3.4.4 Economic Feasibility
SmartFlow NLEX is inexpensive to build because most of its technology stack is open-source or available on free tiers during development. The main usage-billed items are the AWS RDS database and the language-model APIs.
After deployment, costs would rise because the system would need production hosting, monitoring, paid API tiers and staff time for maintenance. The figures below are planning estimates and have not been quoted by vendors. Items marked “to be confirmed” depend on the provider's billing tier and should be confirmed from the project accounts.
Table 3.4.4.1 will compare the expected costs during the development phase versus what it will cost to maintain the system after it is deployed.



Table 3.4.4.1. During and After Deployment Expected Cost Table
| Expense Item | Estimated Cost | Notes |
| --- | --- | --- |
| During Development (Capstone Period, 2025–2026) | During Development (Capstone Period, 2025–2026) | During Development (Capstone Period, 2025–2026) |
| Python libraries (pandas, NumPy, statsmodels, Prophet, scikit-learn, XGBoost, TensorFlow/Keras, PyTorch, lifelines, mgwr) | Free | Open-source libraries for data processing, modeling and evaluation |
| Node.js, Express, Next.js, React, Electron, ECharts, YALPS | Free | Open-source frameworks for the API, dashboard and optimization |
| AWS RDS for PostgreSQL + PostGIS (Singapore) | To be confirmed | Managed database for the warehouse; billing tier to be confirmed from the AWS account |
| Supabase (authentication, mobile community posts) | Free tier | Two projects (dashboard and mobile) |
| Language-model APIs (Z.ai GLM; Qwen via OpenRouter) | To be confirmed | Usage-billed; free or low-cost models used during development |
| Waze for Cities (Partner Hub) feed | Free | Access through partner credentials; agreement to be documented |
| Weather and air quality (Open-Meteo, ERA5, JMA, OpenWeather Air Pollution) | Free | Historical data loaded once |
| Mapbox GL JS map tiles | Free tier | Development usage within free limits |
| Render (demonstration API for the mobile app) | Free tier | Free instance with cold starts |
| Expo (mobile application) | Free | Open-source framework for Android and iOS |
| Figma (UI/UX design) | Free | Free plan for student design work |
| GitHub (version control) | Free | Free plan for team repositories |
| Printing, documentation and travel | ~₱3,000 total | Research materials, adviser meetings and stakeholder coordination |
| Estimated Development Total | ~₱3,000 plus usage-billed items | Usage-billed items to be confirmed |
| After Deployment (Monthly and Annual Costs) | After Deployment (Monthly and Annual Costs) | After Deployment (Monthly and Annual Costs) |
| Production database hosting (managed PostgreSQL with backups) | ₱3,000 – ₱8,000/mo | Dedicated instance with automated backups |
| API and job hosting (container service and scheduler) | To be confirmed | Replaces the development workstation for scheduled jobs |
| Language-model APIs (production volume) | To be confirmed | Depends on the number of narratives, commands and assistant queries |
| Mapbox (production map tile requests) | ₱2,000 – ₱5,000/mo | Free tier insufficient for production usage |
| Google Play and Apple App Store fees | ~₱6,500/year | Google Play ~₱1,500 one-time; App Store ~₱5,000/year |
| Windows code-signing certificate for the desktop installer | To be confirmed | Annual certificate |
| IT staff for maintenance and monitoring | ₱10,000 – ₱20,000/mo | Updates, bug fixes, pipeline error handling and security patches |
| ML model retraining compute | ₱5,000 – ₱12,000/mo | Weekly retraining batch and hourly congestion refresh |
| Data storage and backups | ₱1,500 – ₱4,000/mo | Growing historical traffic and incident data |
| Annual security audit | ~₱20,000/year | Third-party check of authentication, access control and OWASP compliance |
| Estimated Monthly Total (Post-Deployment) | ~₱21,500 – ₱49,000/mo plus items to be confirmed | To be covered by NLEX Corporation's IT budget upon deployment |

As shown in Table 3.4.4.1, development costs are low because most components are open-source or on free tiers, with the database and language-model APIs as the main usage-billed items. Post-deployment costs are higher and depend on several vendor quotations that remain to be confirmed. Whether these costs are justified would need to be assessed by NLEX against measured operational benefits, which this capstone estimates but does not observe in live operation.
## 3.5 Business Requirements Overview
The business requirements for SmartFlow NLEX are categorized into functional requirements, the specific features and tasks the system must perform. And non-functional requirements, which define the system's performance and quality standards.
### 3.5.1 Functional Requirements
Table 3.5.1.1 Functional Requirements
| ID | Functionality | Description | Status |
| --- | --- | --- | --- |
| FR-01 | Multisource Ingestion | The system shall load hourly toll volume per plaza, direction and class, NLEX accident and breakdown records, Waze jams and alerts, historical weather, holidays and the event calendar into the bronze layer, and record each load’s source, row count and time. | Partial (live Waze automated; other sources batch) |
| FR-02 | Event Calendar | The system shall maintain an event calendar (name, venue, date, category) for venues that affect the corridor, loaded from a maintained file or upload and validated against the event schema. | Partial (one-off scrape; no automated scraper) |
| FR-03 | Data Validation | Each uploaded record shall be rejected or flagged if its plaza is not an NLEX plaza, its kilometre post is outside the corridor, a required field is missing, or a value fails its type check; the upload report shall give counts per rejection reason. | Implemented |
| FR-04 | Emission Estimation | The system shall estimate corridor CO₂, PM2.5 and NO₂ per day, exit and vehicle class from vehicle-kilometres and fixed per-class emission factors, and the additional CO₂ from incident queues, showing the factors and date window used. | Implemented |
| FR-05 | Volume Forecasting | The system shall produce a daily corridor volume forecast from the candidate model with the lowest held-out WMAPE that also beats the seasonal-naive baseline, report each candidate’s accuracy, and refresh the forecast weekly. | Implemented |
| FR-06 | Agent-Based Sandbox | The sandbox shall simulate lane closures, speed limits, counterflow and incidents on a chosen kilometre stretch, direction and time with vehicle agents whose demand is drawn from warehouse data, and report speed, throughput, queue length, travel time and CO₂ with and without the intervention. | Implemented |
| FR-07 | Prescriptive Recommendations | The system shall recommend toll booths to staff per plaza and hour, patrol positions, the number of response units to dispatch for an incident, a congestion-response urgency and ranked emission strategies, showing the assumptions behind each. | Implemented |
| FR-08 | Model Accuracy Display | Each predictive view shall display the held-out accuracy of the active model and its baseline, the evaluation window and the last retraining date. | Implemented |
| FR-09 | Incident and Live Map | The dashboard shall plot Waze jams and alerts from the last 60 minutes and active maintenance closures on the corridor map, and provide historical NLEX incident analytics filterable by date, type and exit. | Implemented |
| FR-10 | Forecast Time Selection (Mobile) | The mobile application shall let users choose a forecast hour up to the model’s published horizon (168 hours) and show the predicted congestion state per exit. | Implemented |
| FR-11 | Conversational Assistant (Mobile) | The mobile assistant shall answer NLEX corridor questions in English or Tagalog using tools that read live corridor status, state the data age, and decline questions outside its scope. | Partial (no forecast or departure-time advice) |
| FR-12 | Travel Alerts (Mobile) | The mobile application shall show alerts for operator advisories, scheduled maintenance and new incidents while the application is in use. | Partial (on-device notifications only) |
| FR-13 | Community Reports (Mobile) | Signed-in users shall post road reports with location and optional photo; cross-checking reports against Waze and forecasts is proposed future work. | Partial (posting implemented; cross-checking proposed) |
| FR-14 | Authentication and Access Control | Users shall sign in with password and authenticator code (TOTP), may trust a device for seven days, are signed out after inactivity, and see only the modules permitted to their role. | Implemented |
| FR-15 | Maintenance Scheduling | Authorized users shall create, edit, cancel and delete road-maintenance schedules by exit, direction and official kilometre posts, with validation of the kilometre range. | Implemented |
| FR-16 | Data Management | Data analysts shall upload CSV or XLSX exports, run a check-only validation, load accepted records in one transaction and undo a previous upload. | Implemented |
| FR-17 | Audit Log | The system shall record user sessions, page views and data, maintenance and model events, and let data analysts filter and export them. | Implemented |
| FR-18 | Mobile Configuration | Operators shall switch mobile application sections on or off and publish advisories from the dashboard without releasing a new application version. | Implemented |
| FR-19 | Model Narratives | The dashboard shall generate plain-language explanations of displayed model results using only the values shown, with a template fallback when the language model is unavailable. | Implemented |
| FR-20 | Congestion-State Forecast | The system shall forecast the congestion state (low, medium, high) of each exit for 1 to 168 hours ahead and refresh the forecast hourly. | Implemented |
| FR-21 | Scheduled Retraining | The system shall retrain the forecasting models weekly, keep a backup of the active models and publish a retrained model only if it passes the accuracy gate. | Implemented |

### 3.5.2 Non-Functional Requirements
Table 3.5.2.1 Non-Functional Requirements
| Non-Functional Requirement | Description |
| --- | --- |
| Accuracy | Each published forecast shall have a lower held-out WMAPE than its naive baseline (seasonal naive or climatology) on the same evaluation window, and the congestion-state classifier shall exceed the accuracy of the exit-by-hour historical profile. Metrics shall be reported with their grain, horizon and evaluation window. |
| Performance | Cached analytics reads shall return within 3 seconds at the 95th percentile and uncached (cold) reads within 10 seconds with up to 25 concurrent users; the live map shall show data no older than 60 seconds beyond the feed interval. |
| Scalability | The system shall support at least 50 concurrent operator sessions with 95th-percentile response time under 3 seconds and an error rate under 1%; the degradation point shall be measured in stress testing. |
| Availability | The API health endpoint shall achieve at least 99.5% monthly availability measured by an external probe in production; planned system downtime shall be announced to users in advance. |
| Security | All client-server and server-database traffic shall use TLS; passwords shall be stored only by the identity provider; every write or administrative endpoint shall require an authenticated session with the second factor and an authorized role; personal fields shall be masked in the analytics layers; and security-relevant actions shall be audit-logged. |
| Usability | Operators and commuters participating in user-acceptance testing shall achieve a mean System Usability Scale (SUS) score of at least 68, and body text shall meet a contrast ratio of at least 4.5:1 and large text at least 3:1, following the WCAG 2.1 Level AA criterion (World Wide Web Consortium, 2025). |

## 3.6 Key Performance Indicator (KPI) Catalogue
The KPI catalogue defines how the project measures whether SmartFlow NLEX meets its objectives. Each KPI states its link to an objective, its formula, unit, data source, target and whether it is leading or lagging. Targets that come from published references are cited. Targets the proponents set without an external reference are labelled design targets. Where the record does not yet allow a defensible target, the KPI first establishes a baseline. Tables 3.6.1 to 3.6.4 detail the four primary KPIs, and Table 3.6.5 lists the full catalogue. Results are reported in Chapter 4.
Table 3.6.1 Volume Forecast Accuracy KPI Catalogue
| Volume Forecast Accuracy | Volume Forecast Accuracy |
| --- | --- |
| Linked Objective | Specific Objective 4 (multi-source predictive models deployed in the dashboard) |
| Strategic Objective | Ensure that the daily corridor volume forecast used for booth staffing and resource planning is more accurate than a naive forecast and accurate enough to plan with. |
| Formula | WMAPE = Σ\|yₜ − ŷₜ\| / Σ\|yₜ\| × 100%, computed on rolling-origin holdout days (Equation 3.11.3.2). MASE is computed with the seasonal-naive (lag-7) scale. Grain: daily corridor total entries; horizon: 1–14 days. |
| Data Source | gold.fact_traffic_hourly aggregated to daily totals; gold.ml_model_metrics and gold.ml_horizon_accuracy (split 80/20) |
| Target (RAG) | Green: WMAPE below the seasonal-naive WMAPE on the same days and ≤ 12% (design target). Amber: below the baseline but > 12%. Red: not below the baseline. |
| Leading / Lagging | Lagging (measures model quality after the fact); the forecast it qualifies is a leading input to operations. |

Table 3.6.2 Incident Clearance Time (MTTC) KPI Catalogue
| Incident Clearance Time (MTTC) | Incident Clearance Time (MTTC) |
| --- | --- |
| Linked Objective | Specific Objective 3 (recurring inefficiencies) and prescriptive incident response |
| Strategic Objective | Establish a defensible baseline of how long incidents occupy the carriageway, by incident type, against which future response improvements can be measured. |
| Formula | MTTCₖ = (1/\|Iₖ∗\|) Σ Tᵢˢⁱᵗᵉ over i ∈ Iₖ∗, where Iₖ∗ is the set of type-k incidents with valid start and site-cleared times, Iₖ is all type-k incidents, and Tᵢˢⁱᵗᵉ = site-cleared time − event start; reported with the median, 90th percentile and coverage \|Iₖ∗\| / \|Iₖ\|. Lane-blockage duration is reported separately. |
| Data Source | silver.nlex_accident_events_clean and silver.nlex_breakdown_events_clean (NLEX event exports, 2022–June 2026) |
| Target (RAG) | Baseline to be established from the record. A reduction target will be agreed with NLEX; an improvement cannot be attributed to SmartFlow NLEX without a before-and-after deployment study. |
| Leading / Lagging | Lagging |


Table 3.6.3 Corridor CO₂ Forecast Accuracy and Inventory Coverage KPI Catalogue
| Corridor CO₂ Forecast Accuracy and Inventory Coverage | Corridor CO₂ Forecast Accuracy and Inventory Coverage |
| --- | --- |
| Linked Objective | General Objective (emissions) and Specific Objective 4 |
| Strategic Objective | Ensure that the corridor CO₂ estimate covers the whole tolled corridor and that its forecast is reliable enough to plan emission interventions. SmartFlow NLEX has no roadside emission sensors, so the CO₂ inventory is a calculated estimate; the KPI therefore measures forecast accuracy against that inventory and the coverage of the inventory, not agreement with measured emissions. |
| Formula | Forecast: WMAPE and MASE of the daily CO₂ forecast against the inventory (Equation 3.9.3.5). Coverage = plaza-hours with class-resolved counts ÷ all plaza-hours × 100%. |
| Data Source | gold.fact_emissions_hourly; silver.nlex_emission_factors; gold.ml_predictive_emissions; gold.ml_model_metrics |
| Target (RAG) | Green: forecast WMAPE below the seasonal-naive baseline and ≤ 15% (design target), and coverage = 100% (design target). Amber: below the baseline but > 15%, or coverage 95–99%. Red: not below the baseline, or coverage < 95%. |
| Leading / Lagging | Lagging |

Table 3.6.4 Scenario Sandbox Run Time and Recommendation Acceptance KPI Catalogue
| Scenario Sandbox Run Time and Recommendation Acceptance | Scenario Sandbox Run Time and Recommendation Acceptance |
| --- | --- |
| Linked Objective | Specific Objective 1 (evaluate response strategies in the agent-based sandbox) and Specific Objective 2 (usable decision support) |
| Strategic Objective | Confirm that a what-if scenario can be evaluated within the time available to an operator, and that operators judge the system’s recommendations acceptable. |
| Formula | Run time = wall-clock seconds to complete a scenario comparison (intervention and baseline replications) at stated settings (stretch length, simulated duration, number of replications). Acceptance rate = accepted ÷ (accepted + modified + rejected) recommendations × 100%, recorded with a rubric during user-acceptance testing. |
| Data Source | Timed sandbox runs on the demonstration machine; UAT decision records from TCC and incident operators |
| Target (RAG) | Run time — Green ≤ 120 s, Amber 120–200 s, Red > 200 s (design targets). Acceptance — Green ≥ 90%, Amber 75–89%, Red < 75% (design targets). Acceptance indicates operator agreement, not correctness, and is reported with the reasons for rejection. |
| Leading / Lagging | Run time: system-performance measure (neither leading nor lagging). Acceptance: leading (adoption indicator). |
Table 3.6.5 SmartFlow NLEX KPI Catalogue Summary
| KPI | Linked Objective | Definition and Formula | Unit | Target | Lead/Lag |
| --- | --- | --- | --- | --- | --- |
| K1 Volume forecast error | SO4 | WMAPE and seasonal MASE of the daily corridor volume forecast, 1–14-day rolling origin | %, ratio | Below seasonal naive; ≤ 12% (design) | Lagging |
| K2 Congestion-state skill | SO4 | Accuracy, macro-F1 and skill score (acc − accₚᵣₒᶠ)/(1 − accₚᵣₒᶠ) against the exit-by-hour profile, by horizon band | ratio | Skill > 0 | Lagging |
| K3 Incident count forecast error | SO4 | WMAPE and MASE of the daily incident forecast | %, ratio | MASE < 1 | Lagging |
| K4 Clearance-time discrimination | SO4 | Concordance index (C-index) and mean absolute error of the clearance-time model | ratio, min | C-index > 0.5 | Lagging |
| K5 CO₂ forecast error | GO, SO4 | WMAPE and MASE of the daily CO₂ forecast against the inventory | %, ratio | Below seasonal naive; ≤ 15% (design) | Lagging |
| K6 Emission inventory coverage | GO | Plaza-hours with class-resolved counts ÷ all plaza-hours | % | 100% (design) | Lagging |
| K7 Corridor CO₂ intensity | GO | Σ CO₂ ÷ Σ vehicle-km; heavy-vehicle share of vehicle-km and of CO₂ | g/vkm, % | Baseline to be established | Lagging |
| K8 Delay-induced CO₂ | GO | Σ idle CO₂ from lane-blocking incidents (Equation 3.9.3.7); a lower bound | t/yr, % | Baseline to be established | Lagging |
| K9 MTTC | SO3 | Mean, median and p90 of site-clearance and lane-blockage times by type, with coverage | min, % | Baseline to be established | Lagging |
| K10 Sandbox intervention effect | SO1 | Change in throughput, maximum queue, mean speed and travel time versus the baseline, mean of seeded replications with 95% CI | veh/min, m, km/h, s | Baseline per scenario | Leading |
| K11 Sandbox run time | SO1 | Wall-clock seconds per scenario comparison at stated settings | s | ≤ 120 s (design) | System performance |
| K12 Recommendation acceptance | SO1, SO2 | Accepted ÷ all presented recommendations in UAT | % | ≥ 90% (design) | Leading |
| K13 API latency | SO2 (NFR) | 95th-percentile response time at stated concurrency | s | < 3 s cached (design) | Lagging |
| K14 Usability | SO2 | Mean System Usability Scale score from UAT participants | score 0–100 | ≥ 68 (design target; the commonly used SUS benchmark, Hyzy et al., 2022) | Lagging |
| K15 Incident response time | SO3 | Mean, median and p90 time from report to first responder, with coverage | min, % | Baseline to be established | Lagging |
| K16 Secondary incident rate | SO3 | Incidents within 2 km upstream and 30 min of an active incident ÷ primary incidents | % | Baseline to be established | Lagging |


## 3.7 Mock-ups
The mock-ups below were produced in Figma during the design stage and show the intended layout of each screen. The implemented interfaces follow the same module structure but differ in places. The AI Sandbox became the Scenario Sandbox, Map Comparison became the Live Map, a Mobile App configuration page and a Settings page were added, and sign-in uses an authenticator code instead of a one-time password sent by email or SMS. Screens of the implemented system are presented in Chapter 4.
### 3.7.1 Dashboard

Figure 3.7.1.1 Login Page

Figure 3.7.1.2 Home Page



Figure 3.7.1.3 Traffic Page Descriptive


Figure 3.7.1.4 Traffic Page Predictive

Figure 3.7.1.5 Traffic Page Prescriptive


Figure 3.7.1.6 Incident Page Descriptive

Figure 3.7.1.7 Incident Page Predictive

Figure 3.7.1.8 Incident Page Prescriptive


Figure 3.7.1.9 Emission Page Descriptive

Figure 3.7.1.10 Emission Page Predictive

Figure 3.7.1.11 Emission Page Prescriptive

Figure 3.7.1.12 AI Sandbox Page


Figure 3.7.1.13 Maintenance Page

Figure 3.7.1.14 Map Comparison Page

Figure 3.7.1.15 Data Management Page

Figure 3.7.1.16 Audit Log Page
### 3.7.2 Mobile Application

Figure 3.7.2.1 Home Page

Figure 3.7.2.2 Map (Corridor) Page

Figure 3.7.2.3 Community Page

Figure 3.7.2.4 Assistant Page

Figure 3.7.2.5 Alert Page
## 3.8 System Generated Outputs
This section describes the outputs generated by SmartFlow NLEX and identifies how each is produced. Each output is either computed from historical records, predicted by a model, recommended by a prescriptive model or simulated in the sandbox.
a.) Traffic Situation and Incident Summary
This descriptive output combines hourly toll records, NLEX incident records and the live Waze feed. It presents volume trends, hour-by-weekday heatmaps, holiday and event effects against local baselines, incident counts by type, cause and five-kilometre segment, wet-versus-dry crash rates, clearance times, and a live corridor map of Waze jams and alerts. It allows TCC operators to see recurring congestion periods and incident concentrations along the corridor from Balintawak (Km 12) to Sta. Ines (Km 87).
b.) Predictive Traffic Outlook (Daily Volume and Hourly Congestion Forecast)
This predictive output presents the daily corridor volume forecast from the champion model (currently Prophet), selected weekly by held-out accuracy against naive baselines. It also presents the congestion-state forecast (low, medium or high) for each exit and hour from 1 to 168 hours ahead, produced by an XGBoost classifier that is refreshed every hour, and the expected uplift on Philippine Arena event days. Each forecast is shown with its evaluation window and accuracy so that operators can judge its reliability. The output supports planning of toll-booth staffing and patrol deployment ahead of expected demand.
c.) Carbon Emission and Environmental Sustainability
This output estimates the corridor's CO₂, PM2.5 and NO₂ emissions by vehicle class and exit. The estimates are calculated from vehicle-kilometres and fixed per-class emission factors (192, 354 and 1,492 g CO₂/km for Classes 1, 2 and 3) and do not depend on speed. The output adds the CO₂ emitted by vehicles queued behind lane-blocking incidents and shows the CO₂ and fleet-mix forecasts. Measured air-quality readings are shown separately from the calculated estimates.
d.) Smart Response Recommendation
This prescriptive output is computed from the stored forecasts when an operator opens the Traffic or Incident prescriptive view. It is not issued automatically as an alert. It comprises an hourly toll-booth staffing plan per plaza, a congestion-response urgency (Monitor, Prepare or Act) for each exit and hour, recommended patrol positions from a maximal covering location model, and an incident clearance protocol that states how many response units to dispatch and when to escalate. Each recommendation is shown with its assumptions so that operators can judge it before acting.

e.) Commuter Trip Advisory
This output is generated for the mobile application. It translates the congestion-state forecast into a corridor view in which the commuter chooses an hour, up to 168 hours ahead, and sees the expected condition at each exit, alongside live corridor status, maintenance notices and community reports. Travel-time estimates and “best time to leave” recommendations are proposed features and are not part of the current version.
f.) Scenario Comparison Report
This simulated output is produced by the Scenario Sandbox. For a chosen kilometre stretch, direction and time, it compares an intervention with a no-intervention baseline. The comparison covers average speed, throughput, longest queue, travel time, unmet demand and CO₂ rate, reported as the mean of seeded replications with a 95% confidence interval. The output estimates the likely effect of an intervention and does not observe it.
g.) Model Narratives
For each predictive and prescriptive chart, the dashboard can generate a short plain-language explanation using a language model. The explanation is built only from the values already displayed, falls back to a fixed template when the language model is unavailable, and never changes a model's result.
## 3.9 Data Gathering (with ETL)
Data gathering follows the Extract, Transform and Load (ETL) process shown in Figure 3.9.1, which is the design of the pipeline. Historical records were loaded in batches, new NLEX exports are loaded through the dashboard's upload pipeline with validation gates, and the live Waze feed is polled continuously. All data are stored in a layered PostgreSQL warehouse (bronze, silver and gold) that supports the descriptive, predictive and prescriptive analytics. The subsections below describe the sources, the extraction and validation that are implemented, the transformations and the warehouse.

Figure 3.9.1 ETL Process Diagram
### 3.9.1 Data Sources
Internal data were provided by NLEX Corporation as data exports. The traffic data are hourly toll transactions per plaza, direction (northbound or southbound), entry or exit, and vehicle class (Class 1, 2 or 3) for 19 of the corridor's 20 exits from 1 January 2022 to 30 June 2026 (1,642 days, with no missing days); the SCTEX interchange is the exit whose toll data were not loaded. Average daily traffic and all other volume measures are derived from them. The incident data comprise the accident event export (start, lane-blockage-cleared and site-cleared times, kilometre post and cause), the breakdown event export (vehicle class, cause and response deployments), and road and motorcycle crash reports (date, hour, kilometre post, cause, type, weather and casualties). Records dated 2020–2021 in some incident tables come from files labelled synthetic and are excluded from the analyses. The Apprehension and Undercap table described in the design was not loaded into the warehouse.

External data comprise the Waze for Cities (Partner Hub) feed and contextual sources. The Waze data consist of an hourly historical archive of jams and irregularities from January 2022 to 18 April 2026, filtered from the raw Waze dumps to the corridor, and a live feed of jams and alerts polled about every two minutes since 4 August 2026. Weather is a historical hourly dataset for about 20 locations along the corridor from 2020 to October 2026, combining Open-Meteo, ERA5 and JMA data scored against NASA POWER and NOAA. Historical air quality comes from the OpenWeather Air Pollution service. Event data come from a calendar of 159 events at the Philippine Arena (119), the Philippine Sports Stadium (33) and Clark Global City (7), collected once from the venues' published schedules in August 2026 and since extended by hand; it records each event's capacity and, for 63 events, a stated attendance. Holidays come from the Philippine holiday calendar. Community reports from the mobile application are stored separately in Supabase and are not part of the analytics data. Table 3.9.1 summarizes the sources.
Table 3.9.1 Data Sources of SmartFlow NLEX
| Source | Provider | Coverage | Granularity | Refresh | Status |
| --- | --- | --- | --- | --- | --- |
| Toll transactions (traffic volume) | NLEX Corporation | 1 Jan 2022 – 30 Jun 2026; 19 of 20 exits (SCTEX interchange not loaded) | Hourly × plaza × direction × entry/exit × Class 1–3 | Batch load (2022–2025); dashboard upload (2026) | In use |
| Accident events | NLEX Corporation | 1 Jan 2022 – 30 Jun 2026 | Event (start, blockage-cleared, site-cleared, km post) | Dashboard upload | In use |
| Breakdown events and stalled vehicles | NLEX Corporation | 1 Jan 2022 – 30 Jun 2026 | Event (class, cause, deployments) | Dashboard upload | In use (contains personal fields) |
| Road and motorcycle crash reports | NLEX Corporation | 2022 – Jun 2026 (2020–2021 rows excluded) | Event (date, hour, km post, cause, casualties) | Dashboard upload | In use |
| Live Waze jams and alerts | Waze for Cities (Partner Hub) | 4 Aug 2026 – present | Poll about every 2 min; jam lines and alert points | Continuous polling | In use |
| Historical Waze | Waze raw archive filtered to the corridor | Jan 2022 – 18 Apr 2026 | Hourly × exit | One-off batch | In use (gap 19 Apr – 3 Aug 2026) |
| Weather | Open-Meteo, ERA5, JMA | 2020 – 3 Oct 2026; about 20 locations | Hourly (temperature, rain, wind, humidity, pressure) | One-off load; Open-Meteo forecast for future rain | In use |
| Air quality | OpenWeather Air Pollution | 27 Nov 2020 – 2 Aug 2026; 20 exits | Hourly (AQI, CO, NO₂, O₃, SO₂, PM2.5, PM10) | One-off load | In use (measured AQI) |
| Emission factors | DENR/DOTC standards; Class 3 cross-checked with Climatiq | Static | Per vehicle class (g/km) | Static | In use |
| Events | Calendar of the Philippine Arena, Philippine Sports Stadium and Clark Global City (159 events) | Dec 2020 – Dec 2027 | Event-day, venue, category, capacity; attendance for 63 events | One-time collection (Aug 2026); later additions by hand | In use |
| Holidays | Philippine holiday calendar and proclamations | 2020 – 2026 | Day | Seed script | In use |
| Corridor geometry | Derived from exit coordinates and official km posts | Km 12 – Km 87; 20 exits, 19 segments (≈ 76 km) | Segment | Manual | In use |
| Community reports | SmartFlow mobile users | — | Post | Real time (app) | Not ingested into the warehouse |
| Apprehension and undercap | NLEX Corporation | — | — | — | Not loaded |
### 3.9.2 Extract
Extraction follows three paths. Historical toll records for 2022–2025, the Waze archive, the weather and air-quality histories, the event calendar and the emission factors were loaded once by batch scripts. New NLEX exports are loaded by data analysts through the Data Management page, which passes every file through the ETL pipeline described below. The live Waze feed is polled about every two minutes by a separate ingestion process that writes directly to the bronze tables.
In the upload pipeline, the first gate confirms that the file can be parsed and is not empty, and classifies it as toll, accident or breakdown data from its column headers. The second gate validates each record. Dates and times must be valid, required fields (date, location and kilometre post) must be present, vehicle class must be 1, 2 or 3, the location must be an NLEX plaza or a kilometre post inside the corridor, and dates after the end of the record or after the current date are held back. An analyst can run these checks in check-only mode, which reports the results by rejection reason without saving any data.
Records that pass are written to the bronze layer of the AWS RDS PostgreSQL warehouse in a single transaction, with duplicates skipped by natural key, and every load is recorded so that it can be undone. The live Waze feed bypasses the upload gates. Its records are written as received and are filtered to the corridor when they are published to the silver layer.
Several checks in the original gate design are not implemented. These are source token validation, encoding checks, schema-drift detection, automated cross-source consistency checks, volume-anomaly detection, and detection and masking of personally identifiable information. Cross-layer consistency is instead checked manually with a verification script that reconciles row counts and key uniqueness across the bronze, silver and gold layers. Masking of the plate-number and driver fields in breakdown records is a required improvement before any production use.
### 3.9.3 Transformation
Validated bronze records are transformed in two steps, cleaning and feature engineering, before they are published to the silver and gold layers.
3.9.3.1 Data Cleaning Engine
The cleaning step resolves every plaza and exit name to a canonical name, normalizes date and time formats, parses kilometre posts, and removes duplicates by natural key. It applies business rules such as non-negative casualty counts, clearance times between 0 and 1,440 minutes, AQI values between 1 and 5, physically plausible weather values and finalized event status. Missing values are not imputed in the warehouse. Weather rows flagged as imputed by the source are excluded, and records without valid timestamps are left out of the duration-based KPIs, which report their coverage.

3.9.3.2 Feature Engineering Engine
The feature-engineering step derives the analytical variables used by the models. The variables are grouped into six categories: time, incident, traffic, emission, external and spatial features.
a.) Time Features
Temporal variables are derived from timestamps and the time dimension: hour of day, day of week, month, quarter, weekend flag and holiday flag. The time dimension covers every hour from 2020 to 2027.
b.) Incident Features
Incident variables describe each event's type, cause, severity class (property damage only, injury or fatal, derived from casualty counts), kilometre position, start time, lane-blockage duration and site-clearance duration. Waze alerts are mapped to a common incident-type dimension.

c.) Traffic Features
Traffic variables are derived from the hourly toll records. The average daily traffic (ADT) for plaza e, vehicle class c and direction g is the mean daily count over the days with valid data:

where Vₑ,c,g,d is the number of class-c vehicles entering plaza e in direction g on day d, Dₑ is the set of days with valid data for plaza e, and Nₑ is the number of those days. The values are toll-plaza entries, not cross-section counts. The total ADT of a plaza sums the three classes, and the total plaza entries per direction sum all plazas:


where E_g is the set of plazas recorded for direction g. Plazas whose records carry no direction are summed separately, so the total of northbound and southbound entries does not equal all entries. Holiday and event effects are measured as the percentage deviation of a day's volume from a local control-day baseline:

where V̅_dᵇᵃˢᵉ is the mean volume of the same weekday within ±45 days of day d, excluding holidays and event days, with at least four such days required. The design also specified an exit traffic share and a Volume Deviation Index (a z-score against the full-period mean). These were implemented only in a prototype pipeline run on generated data. The local baseline in Equation 3.9.3.4 replaced them because a full-period mean includes future data and ignores weekly seasonality.


d.) Emission Features
Emission variables estimate the CO₂ released on the corridor. Baseline emissions are calculated from vehicle-kilometres and fixed per-class emission factors:

where Nₑ,h,g,c is the number of class-c toll transactions recorded at plaza e (entries at open-system barrier plazas, exits at closed-system plazas; a vehicle that pays at more than one toll point is counted at each) in hour h and direction g, Lₑ is the length of corridor allotted to plaza e (half the distance to each neighbouring exit; the end segments extend beyond the first and last plazas, so the allotted lengths total 85.4 km, more than the ≈ 76 km between the end plazas), F_c is the CO₂ emission factor of class c (192, 354 and 1,492 g/km for Classes 1, 2 and 3, from DENR/DOTC standards, with the Class 3 value cross-checked against Climatiq), and 10⁻⁶ converts grams to tonnes. The factors are stored in the warehouse and are not retrieved from an API at run time. The estimate has no speed term and uses the allotted segment length as a proxy for trip length. PM2.5 and NO₂ are estimated in the same way, with per-class factors of 0.005, 0.03 and 0.02 g/km (PM2.5) and 0.46, 3.17 and 6.95 g/km (NO₂) for Classes 1, 2 and 3 from the same reference table.
The additional CO₂ emitted by vehicles queued behind a lane-blocking accident i is estimated from the lane-blockage duration:


where tᵢᶜˡᵉᵃʳᵉᵈ is the time the blocked lane was cleared, tᵢˢᵗᵃʳᵗ the event start time (0 < Tᵢ ≤ 1,440 minutes), λᵢ the mean hourly vehicle flow [veh/h] on the affected segment and direction at the start hour, and φ = 0.0192 kg CO₂ per vehicle-minute an idling factor derived from a passenger-car emission factor. The term λᵢTᵢ²/120 is the total vehicle-minutes of delay in a deterministic queue that builds while the lane is blocked (D/D/1 triangle), with Eᵢ^idle in kg CO₂. Because φ is a passenger-car value applied to all classes and the queue is assumed to clear as soon as the lane reopens, the result is a lower bound. Delay-induced CO₂ is reported as a KPI and is not used as an input feature of the forecasting models.

e.) External Features
External variables include hourly temperature, rainfall, wind and humidity, a wet-hour flag (mean corridor rainfall above 0.3 mm in the hour), holiday flags and Philippine Arena event-day flags. For forecasts, future weather is replaced by the day-of-year climatology of the training data, or by the Open-Meteo forecast for near-term rain, so that no observed future value enters a model.
f.) Spatial Features
Spatial variables encode each plaza's official kilometre post (Km 12 at Balintawak to Km 87 at Sta. Ines), the measured position along the corridor centreline, the allotted segment length, and the PostGIS geometries of the 19 corridor segments, Waze jam lines and Waze alert points. Kilometre positions are stored as measured distances and shown to users as official posts. Lane counts used by the simulation sandbox come from OpenStreetMap.
Before publication, the silver layer applies the business rules listed above, and the gold layer is rebuilt from the silver records. Referential integrity between fact and dimension tables is not enforced by foreign keys. It is checked by the manual verification script.

### 3.9.4 Load and Data Warehouse Layer
The cleaned records are stored in AWS RDS PostgreSQL 18 with the PostGIS 3.6 extension, organized into a medallion architecture. The bronze schema keeps each source as received. The silver schema holds cleaned and standardized records, including the corridor segments, Waze jam and alert facts with PostGIS geometries (with spatial indexes) and the NLEX incident event tables. The gold schema holds analysis-ready facts and aggregates, such as hourly traffic, hourly emissions, daily weather, jam profiles and volume profiles, together with model outputs, accuracy metrics, retraining logs and the log of served forecasts. Serving views in the public schema expose these tables to the API.
The gold layer is the single source of truth for the dashboard and the mobile application. The API computes descriptive analytics from the gold facts on request, reads stored forecasts and metrics for the predictive views, and computes prescriptive recommendations from those forecasts. The design proposed the gold layer as a retrieval-augmented generation (RAG) source for the chatbot. That retrieval index was not built. The language-model features instead receive the relevant values directly or call API tools (Section 3.11.5).
## 3.10 Presentation of Schema
During design, the operational data were modelled as a fact constellation schema with two fact tables (traffic volume and incident log) sharing six dimension tables (Figure 3.10.1). In the implemented warehouse, the same analytical roles are filled by the tables listed in Table 3.10.1, organized by medallion layer.

Figure 3.10.1 Conceptual Dimensional Model of the SmartFlow NLEX Warehouse (Design)
The conceptual model separates continuous traffic measurements from discrete incidents. Keeping them in separate fact tables prevents incident records from distorting the volume series used for forecasting while still allowing both to be analysed by time, location and weather.
In the implementation, the traffic fact is gold.fact_traffic_hourly. It records entries and exits per plaza, hour, direction and vehicle class, and emissions are stored in a parallel table, gold.fact_emissions_hourly. Speeds are not stored with the toll counts because they come only from Waze. The incident fact is split by source: silver.fact_incident_log holds live Waze alerts with PostGIS points, while NLEX accident and breakdown events are held in silver.nlex_accident_events_clean and silver.nlex_breakdown_events_clean, with their timestamps and kilometre posts.

The six design dimensions map to the implemented warehouse as follows:
dim_location: implemented as silver.dim_location, with 19 corridor segments stored as PostGIS LINESTRING geometries with spatial indexes, supported by the official kilometre-post and segment-length tables.
dim_time: implemented as public.dim_time, with one row per hour from 2020 to 2027 and hour, weekday, month, quarter, weekend and holiday attributes.
dim_vehicle_class: represented by silver.nlex_emission_factors, which holds the three vehicle classes and their emission factors.
dim_weather: represented by the hourly weather tables (public.hourly_weather, silver.hourly_weather_clean) and the daily summary gold.daily_weather_summary.
dim_external_events: represented by public.philippine_arena_events and the holiday calendar public.ph_holidays.
dim_incident_type: implemented as silver.dim_incident_type, which currently classifies Waze alert types; NLEX incident types are stored as attributes of the event tables.
A star-style view, public.v_nlex_galaxy_hourly, joins the time, location, weather, jam, incident and event data at hourly grain and is the closest implemented equivalent of the conceptual constellation. Model outputs and evaluation results are stored in dedicated gold tables, including the volume, congestion, emission, fleet-mix and incident forecasts, the model metrics, the horizon accuracy, the retraining batch log and the served-forecast log, with backups of every model output kept in a separate schema.
Table 3.10.1 Implemented Warehouse Objects by Layer
| Layer | Main objects | Role |
| --- | --- | --- |
| Bronze | nlex_accident_data, nlex_breakdown_data, nlex_incidents, waze_raw_jams, waze_raw_alerts, waze_hourly_jams, nlex_emissions, nlex_emission_factors, philippine_arena_events | Raw records as received from each source |
| Silver | nlex_accident_events_clean, nlex_breakdown_events_clean, nlex_incidents_clean, fact_waze_jams (LINESTRING), fact_incident_log (POINT), waze_jam_hourly_exit, hourly_weather_clean, nlex_emissions_clean, dim_location, dim_incident_type, nlex_emission_factors, philippine_arena_events_clean | Cleaned, standardized and spatially indexed records |
| Gold (facts and aggregates) | fact_traffic_hourly, fact_traffic_hourly_origin, fact_emissions_hourly, daily_traffic_volume_corrected, daily_weather_summary, daily_emissions_summary, exit_km_post, exit_segment_km, congestion_jam_profile, exit_volume_profile | Analysis-ready facts, profiles and reference tables |
| Gold (model outputs) | ml_predictive_volume, ml_congestion_forecast, ml_predictive_emissions, ml_predictive_fleet_mix, ml_event_surge_forecast, incident and weather-speed outputs, ml_model_metrics, ml_horizon_accuracy, ml_batch_runs, ml_congestion_forecast_log | Forecasts, accuracy metrics, retraining log and served-forecast log |
| Public | dim_time, ph_holidays, hourly_weather, philippine_arena_events, audit_logs, data_uploads, nlex_maintenance_schedules, nlex_mobile_config, serving views | Shared dimensions, application tables and views used by the API |

## 3.11 Business Analytics Models and Testing
This section documents the analytics models of SmartFlow NLEX in three tiers: descriptive, predictive and prescriptive. It also covers model training and testing, the agent-based simulation sandbox and the language-model features. For every method, it states the purpose, inputs, formulation, procedure, output, interpretation and the system feature that uses it. Table 3.11.1 classifies every method named in the design and gives its implementation status, so that methods proposed in the design but not yet built are kept and identified as proposed.
Table 3.11.1 Analytics Method Inventory and Implementation Status
| Tier | Method | Classification | Status | System feature |
| --- | --- | --- | --- | --- |
| Descriptive | Volume aggregation and hour-by-weekday profiles | Data transformation / KPI | Implemented | Traffic – Descriptive |
| Descriptive | Local control-day comparison (holidays, events) | Analytical technique | Implemented | Traffic – Descriptive |
| Descriptive | Incident frequency, severity and 5-km segment counts | KPI / aggregation | Implemented | Incidents – Descriptive |
| Descriptive | Wet-vs-dry crash rate ratio (per hour) | Descriptive metric (rate ratio) | Implemented | Incidents – Descriptive |
| Descriptive | Clearance-time summary and Kaplan–Meier estimator | Statistical estimator | Implemented | Incidents – Descriptive, Prescriptive |
| Descriptive | Emission inventory and fleet mix | Deterministic accounting model | Implemented | Emissions – Descriptive |
| Descriptive | STL/MSTL, ACF/PACF, KDE/NKDE, Getis-Ord Gi∗ | Analytical techniques / statistical tests | Proposed | — |
| Descriptive | GMM regimes; speed–flow (fundamental diagram) fit; log-normal fit | Statistical models | Proposed | — |
| Descriptive | Volume Deviation Index; V/C ratio | Derived anomaly score; KPI | Proposed | — |
| Predictive | Prophet (champion), Holt-Winters, Holt’s linear, SARIMAX, LSTM; seasonal-naive and climatology baselines | Statistical / deep-learning models | Implemented (LSTM, SARIMAX rejected) | Traffic – Predictive |
| Predictive | XGBoost congestion-state classifier (1–168 h); random forest and GRU comparators | Machine-learning models | Implemented | Live Map, Traffic, Mobile Corridor |
| Predictive | Per-exit event uplift with bootstrap interval | Statistical estimator | Implemented | Traffic – Predictive |
| Predictive | Negative binomial incident counts (Poisson, RF, XGBoost, SARIMAX, LSTM, GRU comparators) | Statistical / ML models | Implemented | Incidents – Predictive |
| Predictive | Ordinal logistic and XGBoost severity; Cox PH clearance time; logistic secondary-incident risk | Statistical / ML models | Implemented | Incidents – Predictive |
| Predictive | Geographically weighted regression; spatial LSTM | Statistical / deep-learning models | Implemented | Incidents – Predictive |
| Predictive | Gradient boosting CO₂ forecast (polynomial, LSTM, derived comparators) | Machine-learning model | Implemented | Emissions – Predictive |
| Predictive | Dirichlet regression fleet mix (XGBoost, Prophet, LSTM comparators) | Statistical model | Implemented | Emissions – Predictive, Sandbox |
| Predictive | XGBoost volume model; quantile random forest; GRU wet/dry speed models; Bi-LSTM with attention; multiple linear regression; forecast ensembles | ML / statistical models | Proposed (not implemented) | — |
| Prescriptive | Toll-booth staffing allocation | Optimization (linear allocation, exact greedy solution) | Implemented | Traffic – Prescriptive |
| Prescriptive | Maximal covering location model for patrol positions | Optimization (binary integer program) | Implemented | Incidents – Prescriptive |
| Prescriptive | Two-stage stochastic clearance protocol | Optimization (stochastic mixed-integer program) | Implemented | Incidents – Prescriptive |
| Prescriptive | Fuzzy congestion-response advisory | Rule-based inference | Implemented | Traffic – Prescriptive |
| Prescriptive | TOPSIS ranking of event interventions and emission strategies | Multi-criteria decision analysis | Implemented | Traffic, Emissions – Prescriptive |
| Prescriptive | Emission strategy estimates with seeded bootstrap ranges | Scenario estimation / uncertainty analysis | Implemented | Emissions – Prescriptive |
| Prescriptive | Weather-triggered speed advisory; capacity-based surge alert; heuristic rerouting; variable speed limits; price-optimized tolling | Rules / optimization | Proposed (not implemented) | — |
| Simulation | Agent-based microsimulation (IDM car-following, MOBIL lane changing) | Simulation methodology | Implemented | Scenario Sandbox |
| Language model | GLM command interpretation and narratives; Qwen tool-calling assistant | Interface (natural-language processing) | Implemented | Sandbox, dashboard narratives, mobile Assistant |
### 3.11.1 Descriptive Analytics
The descriptive tier summarizes the historical record to establish baselines for traffic, incidents and emissions. All descriptive measures are computed by SQL queries in the API on request for the date range the operator selects, so they always reflect the current warehouse.
3.11.1.1 Data Overview
The descriptive tier uses the hourly toll fact (19 of the 20 exits, January 2022 to June 2026), the NLEX accident, breakdown and crash event tables, the historical and live Waze jam and alert facts, hourly weather, the holiday and event calendars, and the emission inventory (Section 3.9). Analyses default to the most recent twelve months of the record and can be set to any range within it.
3.11.1.2 Volume Aggregation and Temporal Profiles
Purpose: to show how much traffic the corridor carries and when demand peaks. Inputs: hourly entries by plaza, direction and class. Procedure: hourly counts are summed to daily and monthly totals by direction, averaged by hour of day and day of week, and ranked by plaza; each figure is compared with the preceding period of equal length. Output: volume trend charts, an hour-by-weekday heatmap, plaza rankings and average daily traffic by class (Equation 3.9.3.1). Interpretation: recurring peaks identify when staffing and patrol coverage are most needed. Feature: Traffic – Descriptive and Overview.
3.11.1.3 Holiday and Event Impact by Local Control-Day Comparison
Purpose: to measure how holidays and Philippine Arena events change traffic. Inputs: daily entries at the relevant plaza, the holiday and event calendars. Formulation: the percentage deviation of the day's volume from the mean of comparable control days (Equation 3.9.3.4). Control days are the same weekday within ±45 days, excluding holidays and other event days, with at least four required. Days with several events are merged into one record. Output: a deviation per holiday or event and its average by year. Interpretation: a positive deviation indicates added demand. A local baseline is used because a global average would mix pandemic-period traffic into every comparison. The control-day design follows Giuliano and Lu (2021). Feature: Traffic – Descriptive (event and holiday panels).
3.11.1.4 Incident Frequency, Severity and Spatial Concentration
Purpose: to identify when and where incidents occur. Inputs: accident and breakdown events and crash reports with kilometre posts, causes and casualty counts. Procedure: incidents are counted by day, hour and weekday, type and cause; injuries and fatalities are summed; and incidents are counted in five-kilometre bins of official kilometre posts to rank segments. Output: incident trends, an hour-by-weekday heatmap, cause and type breakdowns and a ranked list of high-incident segments. Interpretation: segments and hours with persistently high counts are candidates for patrol positioning. Feature: Incidents – Descriptive.
3.11.1.5 Weather-Stratified Crash Rate
Purpose: to compare crash risk in wet and dry conditions. Inputs: crash counts and hourly rainfall. An hour is wet when the mean corridor rainfall exceeds 0.3 mm. Formulation:

where n is the number of crashes and H the number of hours in each condition. Output: the crash rate per hour in wet and dry conditions and their ratio, with an approximate Poisson 95% confidence interval exp(ln RR ± 1.96√(1/n_wet + 1/n_dry)), which is too narrow if wet hours are clustered. Interpretation: a ratio above 1 indicates a higher crash rate per hour of exposure in wet conditions. The ratio is not normalized by hours of exposure, not by traffic volume (Romanowska & Budzyński, 2022). Feature: Incidents – Descriptive (Crash Rate in Rain).
3.11.1.6 Clearance-Time Summary and Kaplan–Meier Estimation
Purpose: to describe how long incidents take to clear. Inputs: event start, lane-blockage-cleared and site-cleared times. Procedure: for the mean time to clear (MTTC), durations outside 0 to 1,440 minutes are excluded, and the MTTC, median and 90th percentile are reported with the share of records that have valid timestamps. For survival analysis, durations of 0 or less are excluded and the survival function is estimated with the Kaplan–Meier estimator, with durations above 1,440 minutes treated as censored at 1,440 minutes:

where dᵢ is the number of incidents cleared at time tᵢ and nᵢ the number still uncleared just before tᵢ. Output: MTTC by incident type and survival curves. Interpretation: the curve gives the probability that an incident is still uncleared after t minutes and supplies the clearance scenarios used in the prescriptive clearance protocol (James et al., 2021). Feature: Incidents – Descriptive and Prescriptive.
3.11.1.7 Emission Inventory and Fleet Mix
Purpose: to estimate the corridor's emissions and the contribution of each vehicle class. Inputs: hourly counts by class, allotted segment lengths and the emission factors. Formulation: Equations 3.9.3.5 to 3.9.3.7. Output: CO₂, PM2.5 and NO₂ by day, exit and class, each class's share of vehicle-kilometres and of CO₂, and delay-induced CO₂. Interpretation: because the factors are fixed per class, changes in the estimate reflect changes in volume and fleet mix, not in driving speed. Feature: Emissions – Descriptive.
3.11.1.8 Live Corridor Status
Purpose: to show current conditions. Inputs: Waze jams and alerts from the last 60 minutes. Procedure: jams and alerts within the corridor tolerance are assigned to the nearest exit and summarized by jam level, speed and alert type; the congestion index is the mean Waze jam level (0 to 5). Output: status by exit on the Overview and the Live Map. Feature: Overview, Live Map and the mobile Dashboard.
3.11.1.9 Proposed Descriptive Methods
The design also specified several descriptive methods that were not implemented in the current version. They remain relevant to the research problem and are retained as proposed extensions:
STL/MSTL decomposition and rolling means to separate trend, weekly and annual seasonality and irregular variation in daily volume (Hyndman & Athanasopoulos, 2021). The champion volume model currently captures these components within its own structure (Section 3.11.2.2).
ACF and PACF analysis to identify candidate autoregressive orders. The current SARIMAX specification uses fixed orders with a weekly period.
Gaussian mixture models to identify traffic regimes from speed–flow data. Congestion states are currently defined by Waze jam-speed thresholds of 10 and 20 km/h.
Speed–flow (fundamental diagram) fitting to estimate free-flow speed and capacity by segment (National Academies of Sciences, Engineering, and Medicine, 2022; Treiber & Kesting, 2025). The sandbox currently uses the free-flow speeds that Mejia and Sigua (2018) reported for rain conditions as fixed parameters.
Kernel density estimation, network-constrained KDE and the Getis-Ord Gi∗ statistic to test whether incident concentrations are statistically significant (Berhanu et al., 2023; Alam & Tabassum, 2023). Segments are currently ranked by counts.
Log-normal fitting of clearance times, the Volume Deviation Index with a two-sigma rule, and the volume-to-capacity ratio (which requires section flows, passenger-car equivalents and segment capacities that are not in the record).
### 3.11.2 Predictive Analysis
The predictive tier forecasts traffic volume, congestion state, event uplift, incidents, clearance time, emissions and fleet mix. For each task, several candidate models are trained and compared against naive baselines on chronologically held-out data, and only a model that beats the baselines is published. The models are trained offline in Python. Their forecasts and held-out metrics are stored in gold tables and read by the dashboard and the mobile application.
3.11.2.1 Data Overview and Validation Design
Volume, CO₂ and fleet-mix models are trained on daily series from 1 January 2022 to 30 June 2026 (1,642 days). They are evaluated by rolling-origin (walk-forward) validation, in which the model is refitted at successive forecast origins and scored on the following 7 or 14 days, so that every test day lies after its training data. Two evaluation windows are reported: the last 294 days (“80/20”, about 18% of the 1,642-day record, from 10 September 2025) and the last 140 days (“90/10”, about 9%); the rest of each nominal share is taken up by lag features at the start of the series. Each candidate is compared with two baselines: a seasonal-naive forecast that repeats the value of the same weekday one week earlier, and a climatology forecast (the average for that day of the year). The congestion classifier is trained on the live Waze feed and tested on the most recent days. The incident models use a chronological holdout of the last 90 days, and the severity models the last 20% of events.
3.11.2.2 Daily Corridor Volume Forecasting
Purpose: to forecast total daily entries on the corridor for staffing and resource planning. Inputs: the daily volume series and weather variables; for future days the weather is the training-period climatology, which prevents future observed weather from entering the forecast. Candidate models: Prophet, additive Holt-Winters exponential smoothing with a seven-day season, Holt's linear trend, SARIMAX(1,1,1)(1,1,1)₇ with weather regressors (Hyndman & Athanasopoulos, 2021), and a two-layer LSTM (64 and 32 units, 30-day input), each with and without weather. Prophet models the series as a sum of components:

where g(t) is a piecewise-linear trend with automatically detected changepoints, s(t) the weekly and yearly seasonality expressed as Fourier series, xₜ the weather regressors and εₜ the error. No holiday or event regressor is used in the volume model. The additive Holt-Winters forecast is:

where ŷₜ₊ₕ is the forecast made at time t for h days ahead, with level ℓₜ, trend bₜ, seasonal component s with period m = 7 and k the integer part of (h − 1)/m. Selection: the candidate with the lowest WMAPE is published if it beats the best baseline on WMAPE and has a MASE below 1 (Section 3.11.3). Output: the daily forecast with the evaluation metrics of every candidate. Forecasts are validated up to 14 days ahead; days beyond this are shown as unvalidated. Feature: Traffic – Predictive, booth staffing and the sandbox demand profile.
3.11.2.3 Congestion-State Classification
Purpose: to forecast whether each exit will be in a low, medium or high congestion state h hours ahead (h = 1 to 168). Target: the state at hour t + h, defined by Waze jam speed (above 20 km/h low, 10 to 20 km/h medium, below 10 km/h high). Inputs: exit, hour, weekday, lagged states and speeds at 1, 2, 3, 6, 24 and 48 hours, 6- and 24-hour rolling means, neighbouring-exit lags, the exit-by-hour historical profile computed from the training period only, and the horizon. Model: an XGBoost classifier (Bentéjac et al., 2021) with 400 trees, depth 6 and learning rate 0.08, whose probabilities are calibrated by isotonic regression. XGBoost minimizes a regularized loss:

where l is the multi-class log loss, fₖ the k-th tree, T its number of leaves and w its leaf weights. A random forest and a GRU network are trained as comparators. Persistence, the majority class and the exit-by-hour profile serve as baselines. Training rows whose target time falls after the training cut-off are dropped to prevent leakage. Output: the probability of each state by exit and hour. A cell is shown as congested when the combined probability of the medium and high states is at least 0.5. The model is retrained every hour. Feature: Live Map forecast, Traffic – Predictive, the fuzzy advisory and the mobile Corridor forecast.
3.11.2.4 Event-Day Uplift Estimation
Purpose: to estimate how much a Philippine Arena event raises traffic at each exit. Inputs: the event calendar, the holiday calendar and daily plaza volumes. Procedure: for every event day, the ratio of each exit's volume to its typical volume for the same weekday and month is computed; this forecasting baseline differs from the ±45-day control days used descriptively in Section 3.11.1.3. The median ratio across event days is the exit's uplift, Uₑ = medianₖ (Vₑ,ₖ / Ṽₑ,ₖ), where Ṽₑ,ₖ is the weekday-month median volume, and a percentile-bootstrap 95% confidence interval is attached. Holidays are treated as a separate regime, and an uplift is considered material only when its interval lies above 1. Event days must come from the calendar. Selecting them by high volume would make the estimate circular. Output: uplift and expected additional vehicles by exit for upcoming events. Feature: Traffic – Predictive and the TOPSIS event ranking.
3.11.2.5 Incident Count Forecasting
Purpose: to forecast daily accident and breakdown counts. Inputs: lagged counts (1, 7, 14 and 364 days), rolling means, calendar and holiday flags, rainfall and log traffic volume. Model: a negative binomial generalized linear model, which allows the variance to exceed the mean (Lord et al., 2021):

Poisson regression, random forest, XGBoost, SARIMAX, LSTM and GRU models are trained as comparators. In the current code, the champion is the model with the highest R² among those with MASE at or below 1 against the seven-day naive forecast, a rule that differs from the WMAPE-based selection used for the volume and CO₂ models. In the holdout, same-day rainfall and volume are observed values, so the holdout error is optimistic relative to true forecasting. Output: daily incident forecasts and per-exit and per-segment expected incidents, which weight the patrol positioning model. Feature: Incidents – Predictive and Prescriptive.
3.11.2.6 Incident Severity and Secondary-Incident Risk
Purpose: to estimate the likely severity of an accident and the risk of a secondary incident. Model: an ordinal logistic regression (Washington et al., 2020) for the ordered classes property damage only, injury and fatal:

and an XGBoost classifier as comparator. Both are compared with the majority-class baseline, and injury counts are excluded from the features to avoid target leakage. Secondary-incident risk is estimated by a ridge-penalized logistic regression on a label that marks incidents occurring within 2 km upstream and 30 minutes of an active incident; logistic regression has been used to estimate the likelihood of freeway secondary crashes (Salek et al., 2021). Feature: Incidents – Predictive.
3.11.2.7 Clearance-Time Modelling
Purpose: to estimate how long an accident will take to clear. Model: a Cox proportional hazards model with a penalty of 0.1:

where h₀(t) is the baseline hazard and exp(β) the hazard ratios of the covariates (Collett, 2023; Washington et al., 2020). Discrimination is measured by the concordance index. The dashboard's survival curves use the empirical Kaplan–Meier estimator (Equation 3.11.1.2), and the model currently treats all records as uncensored. Feature: Incidents – Predictive.
3.11.2.8 Spatial Incident Models
Purpose: to capture how the relationships between incidents and their predictors vary along the corridor. Model: a Poisson geographically weighted regression (Al-Hasani et al., 2021; Soroori et al., 2021) across the 20 exits with a fixed bandwidth, in which the coefficients vary with location:

where (uᵢ, vᵢ) are the coordinates of exit i. A spatial LSTM that adds the lagged counts of the two nearest exits is trained for exit-day incident counts. Both are evaluated against per-exit mean baselines. With only 20 locations, the GWR coefficients are interpreted descriptively. Feature: Incidents – Predictive (spatial risk).
3.11.2.9 Corridor CO₂ Forecasting
Purpose: to forecast daily corridor CO₂ for the next one to seven days. Model: gradient boosting regression (Bentéjac et al., 2021) with 300 trees, depth 3 and learning rate 0.05, trained on weekday, month, lags of up to 28 days, rolling means, rainfall and temperature climatology and holiday flags known in advance. The model builds an additive ensemble of trees:

where hₘ is the m-th tree fitted to the residuals and ν the learning rate. Polynomial ridge regression, an LSTM and a volume-derived forecast (forecast volume multiplied by CO₂ per vehicle) are comparators, scored by the same day-by-day projection used to serve the forecast. Because the CO₂ inventory is calculated from volume, this is a forecast of the inventory, not of measured emissions. Feature: Emissions – Predictive.
3.11.2.10 Fleet-Mix Forecasting
Purpose: to forecast the daily shares of Class 1, 2 and 3 vehicles, which must sum to one. Model: Dirichlet regression estimated by maximum likelihood, in which the shares follow a Dirichlet distribution whose parameters depend on the covariates:

XGBoost, Prophet and a multivariate LSTM in centred log-ratio space are comparators, and acceptance uses the Aitchison distance against the persistence and climatology baselines. Feature: Emissions – Predictive and the sandbox vehicle mix.
3.11.2.11 Methods Evaluated but Not Adopted, and Proposed Methods
Several methods in the design were either evaluated and rejected or not implemented. LSTM networks were trained for volume and CO₂ but did not beat the baselines and are retained only as comparators. SARIMAX with weather was rejected for volume, and weather regressors added little accuracy once future weather was replaced by climatology. The following remain proposed: an XGBoost volume model with event and weather features; a true quantile regression forest for prediction intervals (the current random forest comparator is a standard classifier); GRU models trained separately on wet and dry speed sequences; a bidirectional LSTM with attention for travel time; multiple linear regression for emissions; and forecast combination (ensembles), which was not adopted because no combination was tested against the single champions.
### 3.11.3 Training and Testing of Models
Symbols in this chapter are defined locally for each group of equations. All models are trained and tested chronologically. Randomized k-fold cross-validation is not used because it would let models learn from observations that occur after the test days. Scalers and historical profiles are fitted on training data only, lag features never cross the training cut-off, and future exogenous values are replaced by information available at the forecast origin, except in the incident-count holdout, which uses observed same-day rainfall and volume and is therefore optimistic (Section 3.11.2.5). Forecast accuracy is measured with the metrics below, where yₜ is the observed value, ŷₜ the forecast and n the number of test points.
3.11.3.1 Mean Absolute Percentage Error (MAPE)

MAPE is easy to communicate but undefined when yₜ = 0 and unstable for small counts, so it is reported only for daily corridor totals.
3.11.3.2 Weighted Mean Absolute Percentage Error (WMAPE)

WMAPE weights errors by actual volume, remains defined when individual values are zero, and is the primary ranking metric for regression tasks (Makridakis et al., 2022).
3.11.3.3 Root Mean Square Error (RMSE) and Mean Absolute Error (MAE)


Both are in the units of the target. RMSE penalizes large errors more heavily and equals the standard deviation of the errors only when their mean is zero (Hewamalage et al., 2021).
3.11.3.4 Mean Absolute Scaled Error (MASE)

where J is the number of test points, T the number of training points and m the seasonal period (m = 7 for daily series). The denominator is the in-sample error of the seasonal-naive forecast, so MASE is scale-free and comparable across targets (Hyndman & Athanasopoulos, 2021). A value below 1 means the model's test error is smaller than the seasonal-naive error on the training data.
3.11.3.5 Classification and Survival Metrics
Classifiers are evaluated by accuracy, macro-averaged F1, the multi-class Brier score and the skill score against a reference model:

where acc_ref is the accuracy of the best baseline (for congestion, the exit-by-hour profile), so SS > 0 means the model adds information beyond the historical pattern. Severity models are also compared with the majority-class rate. Survival models are evaluated by the concordance index, the probability that, of two incidents, the one predicted to clear sooner actually does. Information criteria (AIC and BIC) are recorded for the statistical volume models but are not used for selection, because they are not comparable across model families.
3.11.3.6 Model Selection, Accuracy Gate and Retraining
For each task, the published model is the candidate with the best held-out metric that also beats every baseline. A weekly retraining batch refits all models on the latest data, keeps a backup of the active models, and publishes a retrained model only if it still beats the baselines, meets the MASE condition and is not more than 25% worse than the previous run; otherwise the backup is restored. The congestion classifier is refitted every hour. Because champions are chosen on the same windows that are reported, the reported accuracy may be slightly optimistic; a separate validation block is planned. No model combination is used.
### 3.11.4 Prescriptive Analysis
The prescriptive tier turns forecasts into recommendations. Three components are mathematical optimization models that return an optimal solution for their stated objective and parameters. The remaining components are rule-based or scenario-based recommendations. All recommendations are computed by the API when the relevant page is viewed and are shown with their assumptions. Operators remain responsible for every decision.
3.11.4.1 Data Overview
The prescriptive models use the champion volume forecast, the hourly plaza and hour shares of traffic, the number of toll booths per plaza (from OpenStreetMap), the predicted incidents by exit and segment, the Kaplan–Meier clearance-time curves, the congestion-state probabilities, the event-uplift estimates and the emission inventory. Economic parameters such as unit and delay costs are operator-adjustable assumptions, not values estimated from NLEX data.
3.11.4.2 Toll-Booth Staffing Allocation
Decision variables: xₚ,ₕ, the booths staffed at plaza p in hour h, and uₚ,ₕ, the unserved demand. Objective and constraints:


where Dₚ,ₕ is the forecast demand (corridor forecast × plaza share × hour share), κ the throughput per booth-hour (350 vehicles by default, adjustable), Bₚ the booths at the plaza and P an optional staff pool. Because the objective is separable and each additional booth reduces a cell's unserved demand by a non-increasing amount, assigning booths one at a time to the cell with the largest reduction is optimal under the single pool constraint, so no solver is required. Output: an hourly staffing plan for the next seven days. Unlike queueing-based booth staffing (Bari et al., 2022; P. Wang et al., 2020), the allocation uses a fixed throughput per booth-hour and does not model queues. Feature: Traffic – Prescriptive (Booth Staffing Plan).
3.11.4.3 Patrol Positioning by Maximal Covering Location
Model: the maximal covering location problem (Baldomero-Naranjo et al., 2022), which positions K patrol units to cover the largest expected incident load within a response radius:




where wᵢ is the predicted incidents in zone i, yⱼ = 1 if a unit is stationed at site j, xᵢ = 1 if zone i is covered, and Nᵢ the sites within the radius (8 km along the corridor by default) of zone i. The binary program is solved exactly with the YALPS branch-and-bound solver for the fleet size the operator selects. Feature: Incidents – Prescriptive.
3.11.4.4 Two-Stage Stochastic Clearance Protocol
Purpose: to decide how many response units to dispatch to an incident and whether to escalate when its clearance time is uncertain. Model: a two-stage stochastic mixed-integer program (Li & Grossmann, 2021). In the first stage, the number of units x is chosen. Clearance then follows one of four scenarios s (fast, typical, slow, extreme) defined by the Kaplan–Meier intervals up to the 50th percentile, 50th–80th, 80th–95th and above the 95th, so that pₛ = 0.50, 0.30, 0.15 and 0.05; each scenario's duration is the conditional median of its interval. In the second stage, e additional units may be sent at the decision time:


where cₓ is the cost of dispatching x units, and qₓ,ₑ,ₛ the unit-hour cost plus the traffic-delay cost of scenario s. The delay is computed from a deterministic queue in which demand exceeds the reduced capacity during the blockage. The model reports the expected value of perfect information and the value of the stochastic solution. Unit cost, delay cost and the effect of an extra unit are illustrative and adjustable parameters. Feature: Incidents – Prescriptive (Clearance Response Protocol).
3.11.4.5 Fuzzy Congestion-Response Advisory
Purpose: to grade the urgency of responding to a forecast congestion state. Inputs: the forecast probability of high congestion p and the hours ahead h. Each input has three triangular membership functions (low, medium and high probability; soon, mid and far), and nine rules map their combinations to urgency values. The output is a weighted average, the zero-order (constant-consequent) form of Takagi–Sugeno inference:

where zᵣ is the urgency value of rule r. Scores of at least 0.7 are labelled Act, at least 0.4 Prepare, and otherwise Monitor, each with a fixed action text. The membership functions and rule values were set by the proponents and have not yet been validated with operators. Feature: Traffic – Prescriptive (Congestion Response Advisory).
3.11.4.6 TOPSIS Ranking of Interventions
The Technique for Order of Preference by Similarity to Ideal Solution (Chakraborty, 2022) ranks alternatives by their distance from an ideal and an anti-ideal solution. Criteria values are vector-normalized and weighted, and the closeness score is:


where the ideal point vⱼ⁺ takes the best value of criterion j (the maximum for benefit criteria and the minimum for cost criteria), the anti-ideal vⱼ⁻ takes the worst, and dᵢ⁺ and dᵢ⁻ are the distances of alternative i from them. Interval width and uncertainty width are cost criteria; the others are benefit criteria. Event interventions are ranked on extra vehicles, uplift, number of past events and interval width (weights 0.40, 0.25, 0.20 and 0.15). Emission strategies are ranked on expected avoided CO₂, the 5th-percentile avoided CO₂, whether the strategy is bounded by observed performance, and the width of its uncertainty range (weights 0.35, 0.25, 0.25 and 0.15). The weights were chosen by the proponents and have not been sensitivity-tested. Feature: Traffic and Emissions – Prescriptive.
3.11.4.7 Emission Strategy Estimation with Bootstrap Uncertainty
Three emission strategies are estimated. Under shorter lane blockages, each blockage is shortened to the 10th-percentile duration already achieved for its duration band and hour. Faster response in the busiest hours applies the same reduction only to the twelve busiest hours. A lower heavy-vehicle share is a what-if that shifts a share of vehicle-kilometres from Class 3 to Class 2. The two incident-based strategies are given uncertainty ranges from 400 seeded bootstrap resamples (Efron & Hastie, 2021) of the observed incidents, reported as the 5th to 95th percentile. These ranges describe the likely spread of outcomes in the record, not a guaranteed reduction. The strategies are scenario estimates, not optimized policies. Feature: Emissions – Prescriptive.
3.11.4.8 Rule-Based Advisories
The system also issues rule-based advisories. A heavy-vehicle time window identifies the peak hours (within 10% of the busiest hour's vehicle-kilometres) and the quietest hours that could absorb the trucks. A peak toll-differential advisory lists the exits and hours with the most Class 3 CO₂; no price elasticity is estimated, so no saving is claimed. A patrol alert window marks the hours of each weekday whose mean incident count exceeds that day's average. These outputs follow fixed rules and are not optimized.
3.11.4.9 Proposed Prescriptive Methods
The design also proposed a weather-triggered speed advisory using PAGASA rainfall thresholds, a surge alert when forecast volume exceeds 80% of capacity, heuristic rerouting of emergency vehicles and commuters, variable speed limits from the fuzzy controller, and price-optimized dynamic tolling. These are not implemented. The weather-triggered advisory was withdrawn after the descriptive analysis showed little difference in high-incident-day probability between rainy and dry conditions, and the capacity-based alert requires segment capacities that are not in the record.
### 3.11.5 Agent-Based Simulation and Language-Model Features
3.11.5.1 Agent-Based Simulation Sandbox
The Scenario Sandbox is a microscopic, agent-based traffic simulation written in TypeScript that runs in the dashboard on an HTML5 Canvas. It is a testing environment in which operators compare interventions with a no-intervention baseline; it does not run the optimization models. Each vehicle is an agent with its own desired speed, time gap, maximum acceleration, politeness and reaction delay. Longitudinal motion follows the Intelligent Driver Model (Albeaik et al., 2022; Treiber & Kesting, 2025):


where v is the speed, v₀ the desired speed, s the gap to the leading vehicle, Δv the approach rate, s₀ the minimum gap, T the time headway and b the comfortable deceleration. Lane changes follow the MOBIL model (Sunberg & Kochenderfer, 2022), which accepts a change when the driver's advantage, plus a politeness-weighted effect on neighbouring vehicles, exceeds a threshold and the new follower is not forced to brake harder than a safe limit:

where a and ã are accelerations before and after the change for the changing vehicle (c), its new follower (n) and its old follower (o), π is the politeness factor, Δa_th the switching threshold and b_safe the maximum safe deceleration.
Agents and network: Class 1, 2 and 3 vehicles and motorcycles, plus wrecks and responders (ambulance, police, tow and work crews). The two carriageways of a chosen kilometre stretch are simulated with lane counts from OpenStreetMap, toll plazas, ramps and facilities. Demand: hourly entries by exit, direction and class from the warehouse, or the champion forecasts for a future date, with the forecast fleet mix. Interventions: lane closures over a stretch, speed limits and zones, counterflow lane reallocation, booth closures, and nine incident templates (including breakdown, collision, overturn, flood and road works) with durations drawn from calibrated NLEX clearance distributions. Interventions can also be entered as typed commands (Section 3.11.5.2). Outputs: average speed, throughput per minute, density, stopped vehicles, longest queue, travel time, unmet demand and CO₂ rate, compared with the baseline as the mean of seeded replications with a Student-t 95% confidence interval. Verification: an automated script checks the engine's calibration, scenario catalogue, closure geometry and assumptions (1,532 checks passed on 21 October 2026). Limitations: the two carriageways are simulated independently, lane data come from volunteer mapping, the CO₂ rate uses a speed-dependent multiplier that differs from the fixed-factor inventory, and the simulated queues have not yet been compared with observed incident queues.
3.11.5.2 Language-Model Features
SmartFlow NLEX uses large language models only as an interface layer. The models do not produce forecasts or solve optimization problems, and every number they present comes from the system's models or warehouse. Three features use them.
3.11.5.2.1 Sandbox Command Interpretation
In the Scenario Sandbox, an operator can type a command in English, Tagalog or a mixture, such as closing two lanes at a given kilometre during heavy rain. A GLM model from Z.ai, called through an OpenAI-compatible API and optionally routed through OpenRouter with zero data retention, converts the command into a structured plan of up to 21 action types. The API checks every field of the plan against the current scenario and the corridor limits, rejects unsupported or unsafe requests, and shows the plan to the operator. Nothing is applied until the operator confirms it. An offline check of the validation logic passed 65 of 65 cases on 21 October 2026.
3.11.5.2.2 Model Narratives
On the predictive and prescriptive pages, a GLM model writes short plain-language explanations of the displayed results. It receives only the values already shown on screen. Its answer is checked for percentages that do not appear in the input, and a fixed template is used if the model is unavailable or the check fails.
3.11.5.2.3 Mobile Assistant
The mobile Assistant uses a Qwen model through OpenRouter with tool calling (Schick et al., 2023). The model chooses among three tools that return the current corridor status, a corridor overview and the list of exits from the SmartFlow NLEX API, and it phrases the result for the commuter. A topic filter and the system instructions restrict it to the NLEX corridor. It does not access forecasts, give travel-time estimates or recommend departure times. These are proposed extensions. No retrieval-augmented generation index is used.

## 3.12 Business Analytics Tools, Techniques, and Specific Applications
### 3.12.1 Descriptive Analytics
Tools: PostgreSQL 18 with PostGIS (SQL aggregation and spatial queries), Node.js/TypeScript API, Apache ECharts and Mapbox GL JS.
Temporal aggregation: hourly toll counts are summed to daily, weekly and monthly totals and averaged by hour of day and weekday to reveal recurring peaks.
Local control-day comparison: holiday and event days are compared with same-weekday days within ±45 days to measure their effect.
Segment ranking: incidents are counted in five-kilometre bins of official kilometre posts to rank high-incident segments.
Time-normalized comparison: crash rates per hour in wet and dry conditions are compared.
Survival analysis: Kaplan–Meier curves summarize clearance times.
Emission accounting: vehicle-kilometres are multiplied by per-class emission factors.
Visualization: time-series charts, hour-by-weekday heatmaps and a live corridor map.
### 3.12.2 Predictive Analytics
Tools: Python with pandas and NumPy, statsmodels, Prophet, scikit-learn, XGBoost, TensorFlow/Keras, PyTorch, lifelines, mgwr and SciPy; results stored in PostgreSQL and displayed with ECharts.
Time-series forecasting: Prophet, Holt-Winters, Holt's linear trend, SARIMAX and LSTM for daily volume, with seasonal-naive and climatology baselines.
Classification: XGBoost (with random forest and GRU comparators) for congestion state; ordinal logistic regression and XGBoost for severity; logistic regression for secondary risk.
Count, survival and compositional models: negative binomial regression for incident counts, Cox proportional hazards for clearance time, Dirichlet regression for fleet mix, and geographically weighted regression for spatial variation.
Machine-learning regression: gradient boosting for corridor CO₂.
Evaluation: rolling-origin validation with WMAPE, MAPE, RMSE, MAE, MASE, accuracy, macro-F1, Brier score and concordance index, and a weekly retraining gate.
### 3.12.3 Prescriptive Analytics
Tools: TypeScript services, the YALPS linear and mixed-integer programming solver, and the TypeScript simulation engine on HTML5 Canvas.
Optimization: linear booth-staffing allocation, the maximal covering location model for patrols, and the two-stage stochastic mixed-integer clearance protocol.
Rule-based inference: a fuzzy congestion-response advisory and rule-based heavy-vehicle, tolling and patrol-window advisories.
Multi-criteria ranking: TOPSIS for event interventions and emission strategies.
Uncertainty analysis: seeded bootstrap ranges for emission strategies.
Simulation: the agent-based Scenario Sandbox (IDM and MOBIL) for what-if comparison of interventions.
Language-model interface: GLM (Z.ai) for sandbox commands and narratives; Qwen (OpenRouter) for the mobile assistant.


## 3.13 Software Quality Assurance Plans
This section defines how SmartFlow NLEX is verified and validated. It separates the verification already performed during development, with its evidence, from the tests planned for the evaluation phase. Tests that write data are run against a copy of the database, never the shared warehouse, because the shared tables are used by several developers and scheduled jobs.
### 3.13.1 Verification Performed During Development
Table 3.13.1.1 lists the verification carried out so far. The project has no automated unit-test framework or continuous-integration pipeline. Verification relies on self-checking scripts, model evaluation tables and manual reconciliation.
Table 3.13.1.1 Verification Performed During Development
| Verification | Scope | Size / Result | Evidence |
| --- | --- | --- | --- |
| Sandbox engine verification | Calibration samplers, incident fallbacks, scenario catalogue, closure geometry, consistency of shared constants | 1,532 checks, 0 failed (run 21 Oct 2026) | scenario-sandbox/scenarios/verify.ts |
| Sandbox command safety checks | Validation of language-model plans (sound, incomplete and hostile answers); kilometre-post conversion | 65 checks, 0 failed (run 21 Oct 2026) | Back-End/scripts/sandbox-command-check.ts |
| Sandbox command evaluation | Live model interpretation of commands in English, Tagalog and Taglish | 80 of 80 cases passed (7 Oct 2026; not re-run) | Back-End/scripts/sandbox-command-eval.ts |
| Clearance protocol verification | Kaplan–Meier, queue-delay formula, known optimum of the stochastic program, EVPI and VSS non-negativity | 28 checks (requires database; to be re-run and recorded) | Back-End/scripts/verify-clearance-protocol.ts |
| Model validation | Rolling-origin holdout of every candidate against baselines | Stored per model and window | gold.ml_model_metrics, gold.ml_horizon_accuracy |
| Warehouse reconciliation | Layer row counts, duplicate keys and lineage across bronze, silver and gold | Manual run | Back-End/scripts/medallion/05-verify.sql |
### 3.13.2 Unit Test
Unit tests check individual functions in isolation against expected values. The criteria in Table 3.13.2.1 apply to every unit test, and the scenarios in Table 3.13.2.2 cover the functions whose errors would most affect the reported results.
Table 3.13.2.1 Unit Test Criteria
| Criterion ID | Criterion Name | Description | Pass/Fail Criteria |
| --- | --- | --- | --- |
| UTC-01 | Computational Correctness | Deterministic calculations (emissions, ADT, deviation, metrics, optimization objective) match an independent hand or spreadsheet calculation. | Pass: difference ≤ 0.5% (or exact for integers). Fail: otherwise. |
| UTC-02 | Response Time | Execution time of pure functions and of database-backed endpoints on the demonstration machine. | Pass: pure functions ≤ 50 ms; cached endpoints ≤ 500 ms (p95). Fail: otherwise. |
| UTC-03 | Data Integrity | Loading the same file twice does not create duplicate records. | Pass: 0 duplicate natural keys after load. Fail: any duplicate. |
| UTC-04 | Access Control | Requests without a valid session, without the second factor or with an unauthorized role are refused. | Pass: 401 for missing/invalid token or missing second factor; 403 for a role not permitted. Fail: any other response. |
| UTC-05 | Corridor Boundary Logic | Records outside the corridor are rejected using plaza names and kilometre posts. | Pass: all boundary cases classified correctly. Fail: any misclassification. |
| UTC-06 | Input Validation | Invalid inputs (missing fields, out-of-range values, unsupported requests) are rejected with a stated reason. | Pass: every invalid input rejected with the correct reason. Fail: any invalid input accepted. |
Table 3.13.2.2 Unit Test Scenarios
| Scenario ID | Scenario Name | Criterion ID | Test Input | Expected Output |
| --- | --- | --- | --- | --- |
| UTS-01 | Missing vehicle class | UTC-06 | Toll record with a null vehicle class | Record rejected with reason “invalid vehicle class” |
| UTS-02 | Duplicate upload | UTC-03 | The same toll file uploaded twice | Second load inserts 0 records |
| UTS-03 | Local-baseline deviation | UTC-01 | A day 20% above the mean of its control days | Deviation = +20.0% |
| UTS-04 | Emission calculation | UTC-01 | 100 Class 1 vehicles on a 1-km segment | 19.2 kg CO₂ (100 × 1 km × 192 g/km) |
| UTS-05 | Forecast horizon bound | UTC-06 | Request for 169 hours ahead | Request limited to the published 168-hour horizon |
| UTS-06 | Command plan validation | UTC-06 | Model plan closing a lane beyond the corridor | Plan rejected with an explanation |
| UTS-07 | Unauthorized write | UTC-04 | Maintenance write without a token; with an Incident Operator token | 401 token_missing; 403 role_denied |
| UTS-08 | Corridor boundary | UTC-05 | Kilometre posts 11.9, 12.0, 87.0 and 89.1 | Outside, inside, inside, outside |
### 3.13.3 Integration Test
Integration tests confirm that data flow correctly between components. The planned scenarios are as follows. (1) An upload in check mode, then in load mode, appears in the silver and gold layers and in the corresponding dashboard chart. (2) A live Waze alert appears on the Live Map within the feed interval. (3) A maintenance schedule saved on the dashboard appears in the mobile application. (4) A section switched off on the Mobile App page disappears from the mobile application. (5) A weekly retraining run that fails the accuracy gate restores the previous model.
### 3.13.4 Model and Data Validation
Model validation follows Section 3.11.3: chronological rolling-origin evaluation, comparison with seasonal-naive and climatology baselines, and the weekly accuracy gate. Results are reported per task with their grain, horizon and evaluation window. Data validation checks completeness (missing days and timestamp coverage), uniqueness of natural keys, valid ranges (kilometre posts, durations, AQI), consistent exit names and the freshness of live feeds, and records known gaps in a data-gap register.
### 3.13.5 Security Test
Security testing covers a role-by-endpoint access matrix, attempts to bypass the second factor, tampered tokens, attempts to change one's own role, injection inputs on validated endpoints, rate limiting, a dependency vulnerability audit, a secrets scan of the repositories, and verification that the database connection is encrypted. Findings are rated by severity and must be resolved or documented before user-acceptance testing.
### 3.13.6 Stress Test
Stress tests measure performance under load with a scripted load-testing tool such as k6, against a separate copy of the API and database. The load model is derived from the expected users: up to 50 concurrent operators and several hundred mobile users reading forecasts.
Table 3.13.6.1 Stress Test Criteria
| Criterion ID | Criterion Name | Description | Pass/Fail Criteria |
| --- | --- | --- | --- |
| STC-01 | Latency (p95) | Response time of analytics and forecast endpoints under load | Pass: p95 < 3 s for cached reads and < 10 s for cold reads at 50 concurrent users |
| STC-02 | Error Rate | Share of failed requests (HTTP 5xx or time-outs) | Pass: < 1% |
| STC-03 | Recovery | Availability after the load ends | Pass: service responds normally within 60 s without a manual restart |
| STC-04 | Resource Ceiling | CPU and memory of the API host and database connections in use | Pass: CPU and memory ≤ 80%; database connections below the configured maximum |
Table 3.13.6.2 Stress Test Scenarios
| Scenario ID | Scenario Name | Criterion ID | Test Input | Expected Output |
| --- | --- | --- | --- | --- |
| STS-01 | Operator ramp-up | STC-01, STC-02 | 0 to 50 virtual users over 10 minutes on dashboard endpoints | Criteria met at every step |
| STS-02 | Mobile forecast load | STC-01, STC-02 | Up to 500 virtual users requesting corridor status and forecasts | Cached responses served; error rate < 1% |
| STS-03 | Large upload | STC-03, STC-04 | A full-year toll export uploaded in check mode | Completes without exhausting connections; service remains responsive |
| STS-04 | Run to failure | STC-03 | Load increased until the error rate exceeds 1% | Degradation point recorded; service recovers |
### 3.13.7 User-Acceptance Test
User-acceptance testing (UAT) determines whether the dashboard and the mobile application meet their users' needs. Participants are selected by purposive sampling: 10 NLEX operators (5 incident operators and 5 TCC operators), 5 NLEX data analysts and 15 commuters and drivers who use the corridor. Under the problem-discovery model summarized by Budiu (2021), the share of usability problems found grows as 1 − (1 − L)ⁿ, where n is the number of users and L the probability that one user finds a given problem. With the average L of about 0.31, five users reveal about 85% of problems (Budiu, 2021). Each profile therefore has at least five participants, and testing is run in two rounds. Each participant completes the scenarios for their role. The proponents record task success, time on task and the participant's decision on each recommendation (accept, modify or reject), and participants complete the 10-item System Usability Scale (SUS), whose mean score on the 0–100 scale is compared with the commonly used benchmark of 68 (Hyzy et al., 2022). Participation is voluntary, informed consent is obtained, and no personal data beyond role and responses are collected, in accordance with the Data Privacy Act of 2012.
Table 3.13.7.1 User-Acceptance Test Scenarios for Incident Operators
| Scenario ID | Scenario Name | Description | Test Input | Expected Output |
| --- | --- | --- | --- | --- |
| UAT-IO-1 | Locate a live incident | Find a live Waze alert on the Live Map and identify its exit and kilometre post | Current live feed | Alert located with correct exit and km post within 60 s |
| UAT-IO-2 | Review patrol positioning | Run patrol positioning for four units and interpret the covered zones | Fleet size 4, radius 8 km | Participant explains the recommended positions; decision recorded |
| UAT-IO-3 | Review the clearance protocol | Read the recommended dispatch and escalation for a typical accident | Accident, default costs | Participant states the units to dispatch and when to escalate; decision recorded |
Table 3.13.7.2 User-Acceptance Test Scenarios for Data Analysts
| Scenario ID | Scenario Name | Description | Test Input | Expected Output |
| --- | --- | --- | --- | --- |
| UAT-DA-1 | Verify an emission total | Compare one month of corridor CO₂ on the Emissions page with an independent calculation | One month of toll data and the emission factors | Values agree within 0.5% |
| UAT-DA-2 | Upload in check mode | Upload a toll export in check-only mode and interpret the rejection report | Sample export with deliberate errors | All deliberate errors reported with correct reasons; nothing saved |
| UAT-DA-3 | Review event impact | Identify the largest event-day deviations for the past year | Event panel, last 12 months | Deviations and their baselines correctly interpreted |
Table 3.13.7.3 User-Acceptance Test Scenarios for TCC Operators
| Scenario ID | Scenario Name | Description | Test Input | Expected Output |
| --- | --- | --- | --- | --- |
| UAT-TC-1 | Plan for a forecast peak | Select the next day’s peak hour on the congestion forecast and read the exits at risk | Forecast picker | Forecast rendered within 5 s; exits at risk identified |
| UAT-TC-2 | Review booth staffing | Read the staffing plan for the busiest plaza and judge its acceptability | Default throughput 350 veh/booth-h | Decision (accept, modify or reject) and reasons recorded |
| UAT-TC-3 | Corridor overview | View the status of the whole corridor at once | Live Map, full extent | All exits from Km 12 to Km 87 visible with their status |
| UAT-TC-4 | What-if lane closure | Simulate a two-lane closure at Bocaue and compare it with the baseline | Two lanes closed, 1 hour, weekday peak | Change in queue length, travel time and throughput reported with confidence intervals |
Table 3.13.7.4 User-Acceptance Test Scenarios for Commuters and Drivers
| Scenario ID | Scenario Name | Description | Test Input | Expected Output |
| --- | --- | --- | --- | --- |
| UAT-CM-1 | Check the corridor | Find the current condition at a chosen exit | Dashboard and Corridor tabs | Condition found within 60 s |
| UAT-CM-2 | Plan with the forecast | Choose a time tomorrow and read the expected condition at the destination exit | Corridor forecast view | Expected condition correctly read |
| UAT-CM-3 | Post a report | Post a road report with location and photo | Community tab | Report appears in the feed |
| UAT-CM-4 | Ask the assistant | Ask about current conditions in English or Tagalog, and ask an off-topic question | Assistant tab | Correct live status returned; off-topic question declined |

## 3.14 Deployment Plans
This section describes how SmartFlow NLEX is deployed for the capstone demonstration and how it would be deployed in production for NLEX. The two are kept separate: the first describes what is running, and the second is a proposal.
### 3.14.1 Current Deployment (Capstone Demonstration)
Table 3.14.1.1 Components and Hosts of the Current Deployment
| Component | Technology | Host |
| --- | --- | --- |
| Operator dashboard | Next.js 15 static export, React 19, TypeScript, packaged with Electron | Operator workstation (Windows desktop application); local development server during development |
| API | Node.js, Express, TypeScript | Developer workstation; a demonstration instance on Render (free tier) used by the mobile application |
| Data warehouse | PostgreSQL 18 with PostGIS 3.6 | AWS RDS, Asia Pacific (Singapore) region; one shared instance |
| Authentication | Supabase Auth with TOTP multi-factor authentication | Supabase cloud (separate projects for the dashboard and the mobile application) |
| Model training and refresh | Python scripts | Windows scheduled tasks on a project workstation: hourly congestion refresh, weekly retraining batch |
| Live Waze ingestion | Polling process | Separate ingestion host (about every 2 minutes) |
| Language models | GLM (Z.ai); Qwen (OpenRouter) | Provider APIs |
| Mobile application | Expo and React Native | Development builds on Android and iOS devices |
### 3.14.2 Release Procedure
Each member develops on a feature branch. Before integrating, the integrator creates a backup branch of the shared Main-Dashboard branch, merges the feature branch, runs the verification scripts and a local smoke test of every page, and then pushes the merged branch to the team repository. Database changes are applied with versioned SQL scripts. The desktop installer is built with electron-builder once the build has passed these checks.
### 3.14.3 Rollback and Maintenance
If a release causes a critical defect, the code is rolled back by restoring the backup branch created before the merge. Model outputs are rolled back by the weekly retraining batch, which restores the previous models whenever a retrained model fails the accuracy gate. Maintenance consists of monitoring the retraining log, the audit log, the freshness of the live feed and the served-forecast log, updating the event calendar, and loading new NLEX exports through the Data Management page. Automated database snapshots and alerting are not yet configured.
### 3.14.4 Proposed Production Deployment for NLEX
For production use, the proponents propose the following measures:
Host the database on a dedicated managed PostgreSQL instance with automated backups, point-in-time recovery, certificate-verified TLS, least-privilege roles for the API and the jobs, and private network access.
Run the API on a managed container service behind HTTPS, with authentication on every write endpoint, security headers and correct handling of proxy addresses for rate limiting.
Move scheduled jobs from workstations to a server scheduler with failure alerts, and give each job its own output tables.
Add a staging environment and automated build, type-check and test runs on every change.
Store roles in server-controlled metadata, disable public sign-up, and mask personal fields in the analytics layers.
Distribute a code-signed desktop installer with automatic updates, publish the mobile application to the app stores with server push notifications, and monitor uptime and performance.

# References
Afrin, T., & Yodo, N. (2020). A survey of road traffic congestion measures towards a sustainable and resilient transportation system. Sustainability, 12(11), Article 4660. https://doi.org/10.3390/su12114660
Alam, M. S., & Tabassum, N. J. (2023). Spatial pattern identification and crash severity analysis of road traffic crash hot spots in Ohio. Heliyon, 9(5), Article e16303. https://doi.org/10.1016/j.heliyon.2023.e16303
Albeaik, S., Bayen, A., Chiri, M. T., Gong, X., Hayat, A., Kardous, N., Keimer, A., McQuade, S. T., Piccoli, B., & You, Y. (2022). Limitations and improvements of the intelligent driver model (IDM). SIAM Journal on Applied Dynamical Systems, 21(3), 1862–1892. https://doi.org/10.1137/21M1406477
Al-Hasani, G., Asaduzzaman, M., & Soliman, A.-H. (2021). Geographically weighted Poisson regression models with different kernels: Application to road traffic accident data. Communications in Statistics: Case Studies, Data Analysis and Applications, 7(2), 166–181. https://doi.org/10.1080/23737484.2020.1869628
Ali, M. E. M., Durdu, A., Celtek, S. A., & Yilmaz, A. (2021). An adaptive method for traffic signal control based on fuzzy logic with Webster and modified Webster formula using SUMO traffic simulator. IEEE Access, 9, 102985–102997. https://doi.org/10.1109/ACCESS.2021.3094270
Armbrust, M., Ghodsi, A., Xin, R., & Zaharia, M. (2021). Lakehouse: A new generation of open platforms that unify data warehousing and advanced analytics. In Conference on Innovative Data Systems Research (CIDR 2021). https://www.cidrdb.org/cidr2021/papers/cidr2021_paper17.pdf
Atik, A., & Hajibabai, L. (2023). Joint column generation and Lagrangian relaxation technique for incident respondent location and allocation. Computer-Aided Civil and Infrastructure Engineering, 38(18), 2597–2613. https://doi.org/10.1111/mice.13016
Attioui, M., & Lahby, M. (2025). A systematic literature review of traffic congestion forecasting: From machine learning techniques to large language models. Vehicles, 7(4), Article 142. https://doi.org/10.3390/vehicles7040142
Bachechi, C., Po, L., & Rollo, F. (2022). Big data analytics and visualization in traffic monitoring. Big Data Research, 27, Article 100292. https://doi.org/10.1016/j.bdr.2021.100292
Baldomero-Naranjo, M., Kalcsics, J., Marín, A., & Rodríguez-Chía, A. M. (2022). Upgrading edges in the maximal covering location problem. European Journal of Operational Research, 303(1), 14–36. https://doi.org/10.1016/j.ejor.2022.02.001
Bandara, K., Hyndman, R. J., & Bergmeir, C. (2025). MSTL: A seasonal-trend decomposition algorithm for time series with multiple seasonal patterns. International Journal of Operational Research, 52(1), 79–98. https://doi.org/10.1504/IJOR.2025.143957
Bari, C. S., Navandar, Y. V., & Dhamaniya, A. (2022). Delay modelling at manually operated toll plazas under mixed traffic conditions. International Journal of Transportation Science and Technology, 11(1), 17–31. https://doi.org/10.1016/j.ijtst.2020.10.001
Bastarianto, F. F., Hancock, T. O., Choudhury, C. F., & Manley, E. (2023). Agent-based models in urban transportation: Review, challenges, and opportunities. European Transport Research Review, 15(1), Article 19. https://doi.org/10.1186/s12544-023-00590-5
Bayram, F., Ahmed, B. S., & Kassler, A. (2022). From concept drift to model degradation: An overview on performance-aware drift detectors. Knowledge-Based Systems, 245, Article 108632. https://doi.org/10.1016/j.knosys.2022.108632
Bentéjac, C., Csörgő, A., & Martínez-Muñoz, G. (2021). A comparative analysis of gradient boosting algorithms. Artificial Intelligence Review, 54(3), 1937–1967. https://doi.org/10.1007/s10462-020-09896-5
Berhanu, Y., Schroeder, D., Teklu, B., & Alemayehu, E. (2023). Spatial analysis of road traffic accidents: Identifying hotspots for improved road safety in Addis Ababa, Ethiopia. Cogent Engineering, 10(2), Article 2269655. https://doi.org/10.1080/23311916.2023.2269655
Bogaerts, T., Masegosa, A. D., Angarita-Zapata, J. S., Onieva, E., & Hellinckx, P. (2020). A graph CNN-LSTM neural network for short and long-term traffic forecasting based on trajectory data. Transportation Research Part C: Emerging Technologies, 112, 62–77. https://doi.org/10.1016/j.trc.2020.01.010
Budiu, R. (2021, July 11). Why 5 participants are okay in a qualitative study, but not in a quantitative one. Nielsen Norman Group. https://www.nngroup.com/articles/5-test-users-qual-quant/
Cambridge University Press. (n.d.). Rush hour. In Cambridge Dictionary. Retrieved October 22, 2026, from https://dictionary.cambridge.org/dictionary/english/rush-hour
Çelikbilek, Y., & Tüysüz, F. (2020). An in-depth review of theory of the TOPSIS method: An experimental analysis. Journal of Management Analytics, 7(2), 281–300. https://doi.org/10.1080/23270012.2020.1748528
Chakraborty, S. (2022). TOPSIS and modified TOPSIS: A comparative analysis. Decision Analytics Journal, 2, Article 100021. https://doi.org/10.1016/j.dajour.2021.100021
Chung, W., Abdel-Aty, M., Park, H.-C., Cai, Q., Rahman, M., Gong, Y., & Ponnaluri, R. (2020). Development of decision support system for integrated active traffic management systems considering travel time reliability. Transportation Research Record, 2674(2), 167–180. https://doi.org/10.1177/0361198120905591
Climate Change Commission & Department of Environment and Natural Resources. (2023). Implementation plan for the Republic of the Philippines nationally determined contribution (NDC) 2020–2030. https://climate.gov.ph/public/ckfinder/userfiles/files/Knowledge/The%20Philippines'%20NDC%20Implementation%20Plan%20-%20072024.pdf
Collett, D. (2023). Modelling survival data in medical research (4th ed.). Chapman and Hall/CRC. https://doi.org/10.1201/9781003282525
Comber, A., Brunsdon, C., Charlton, M., Dong, G., Harris, R., Lu, B., Lü, Y., Murakami, D., Nakaya, T., Wang, Y., & Harris, P. (2023). A route map for successful applications of geographically weighted regression. Geographical Analysis, 55(1), 155–178. https://doi.org/10.1111/gean.12316
Deretić, N., Stanimirović, D., Al Awadh, M., Vujanović, N., & Djukić, A. (2022). SARIMA modelling approach for forecasting of traffic accidents. Sustainability, 14(8), Article 4403. https://doi.org/10.3390/su14084403
Du, X., Yu, M., Zhang, Z., Tong, M., Zhu, Y., & Xue, C. (2025). A task- and role-oriented design method for multi-user collaborative interfaces. Sensors, 25(6), Article 1760. https://doi.org/10.3390/s25061760
Efron, B., & Hastie, T. (2021). Computer age statistical inference: Algorithms, evidence, and data science (Student ed.). Cambridge University Press. https://doi.org/10.1017/9781108914062
Fujishima, M., Takagi, M., Yokoya, M., & Nakada, R. (2023). Digital twins for streamlining road-traffic flow. NTT Technical Review, 21(4), 32–37. https://doi.org/10.53829/ntr202304fa4
Gernale, A. C. C., & Juanico, D. E. O. (2023). Classification and prediction of overloaded trucks passing the southbound lane of North-Luzon Expressway using artificial neural network. In 2023 9th International Conference on Control, Decision and Information Technologies (CoDIT) (pp. 2229–2234). IEEE. https://doi.org/10.1109/CoDIT58514.2023.10284146
Giuliano, G., & Lu, Y. (2021). Analyzing traffic impacts of planned major events. Transportation Research Record, 2675(8), 432–442. https://doi.org/10.1177/0361198121998710
Gong, C., Tian, C., Wang, Z., Wang, S., Wang, X., Fu, Q., Qin, W., Qian, L., Chen, R., Qi, J., Wang, R., Zhu, G., Yang, C., Zhang, W., & Li, F. (2022). Tair-PMem: A fully durable non-volatile memory database. Proceedings of the VLDB Endowment, 15(12), 3346–3358. https://doi.org/10.14778/3554821.3554827
GoodVision. (2023, October 30). Proactive, predictive, or reactive? Discussing different approaches to traffic engineering. GoodVision Blog. https://blog.goodvisionlive.com/traffic-engineering-methods
Grigorev, A., Mihaita, A.-S., & Chen, F. (2024). Traffic incident duration prediction: A systematic review of techniques. Journal of Advanced Transportation, 2024(1), Article 3748345. https://doi.org/10.1155/atr/3748345
Grigorev, A., Mihaita, A.-S., Lee, S., & Chen, F. (2022). Incident duration prediction using a bi-level machine learning framework with outlier removal and intra–extra joint optimisation. Transportation Research Part C: Emerging Technologies, 141, Article 103721. https://doi.org/10.1016/j.trc.2022.103721
Haydari, A., & Yılmaz, Y. (2022). Deep reinforcement learning for intelligent transportation systems: A survey. IEEE Transactions on Intelligent Transportation Systems, 23(1), 11–32. https://doi.org/10.1109/TITS.2020.3008612
Hewamalage, H., Ackermann, K., & Bergmeir, C. (2023). Forecast evaluation for data scientists: Common pitfalls and best practices. Data Mining and Knowledge Discovery, 37(2), 788–832. https://doi.org/10.1007/s10618-022-00894-5
Hewamalage, H., Bergmeir, C., & Bandara, K. (2021). Recurrent neural networks for time series forecasting: Current status and future directions. International Journal of Forecasting, 37(1), 388–427. https://doi.org/10.1016/j.ijforecast.2020.06.008
Hoseinzadeh, N., Liu, Y., Han, L. D., Brakewood, C., & Mohammadnazar, A. (2020). Quality of location-based crowdsourced speed data on surface streets: A case study of Waze and Bluetooth speed data in Sevierville, TN. Computers, Environment and Urban Systems, 83, Article 101518. https://doi.org/10.1016/j.compenvurbsys.2020.101518
Hyndman, R. J., & Athanasopoulos, G. (2021). Forecasting: Principles and practice (3rd ed.). OTexts. https://otexts.com/fpp3/
Hyzy, M., Bond, R., Mulvenna, M., Bai, L., Dix, A., Leigh, S., & Hunt, S. (2022). System Usability Scale benchmarking for digital health apps: Meta-analysis. JMIR mHealth and uHealth, 10(8), Article e37290. https://doi.org/10.2196/37290
Islam, N., Adanu, E. K., Hainen, A. M., Burdette, S., Smith, R., & Jones, S. (2021). A comparative analysis of freeway crash incident clearance time using random parameter and latent class hazard-based duration model. Accident Analysis & Prevention, 160, Article 106303. https://doi.org/10.1016/j.aap.2021.106303
James, G., Witten, D., Hastie, T., & Tibshirani, R. (2021). An introduction to statistical learning: With applications in R (2nd ed.). Springer. https://doi.org/10.1007/978-1-0716-1418-1
Kermo, S., & Dželihodžić, A. (2026). Comparative analysis of server-side, client-side, and hybrid rendering approaches in modern web applications. In 2026 25th International Symposium INFOTEH-JAHORINA (INFOTEH) (pp. 1–6). IEEE. https://doi.org/10.1109/INFOTEH68759.2026.11477683
Korkmaz, H., & Erturk, M. A. (2024). Prediction of the traffic incident duration using statistical and machine-learning methods: A systematic literature review. Technological Forecasting and Social Change, 207, Article 123621. https://doi.org/10.1016/j.techfore.2024.123621
Lam, K. N. (2024). Traffic prediction using LSTM, RF and XGBoost. In Proceedings of the 2nd International Conference on Data Analysis and Machine Learning – Volume 1: DAML (pp. 267–274). SciTePress. https://doi.org/10.5220/0013515600004619
Leinonen, M., Al-Tachmeesschi, A., Turkmen, B., Atashi, N., & Ruotsalainen, L. (2025). Long short term memory based traffic prediction using multi-source data. International Journal of Intelligent Transportation Systems Research, 23(1), 354–371. https://doi.org/10.1007/s13177-024-00451-y
Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., Küttler, H., Lewis, M., Yih, W.-t., Rocktäschel, T., Riedel, S., & Kiela, D. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. Advances in Neural Information Processing Systems, 33, 9459–9474. https://proceedings.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html
Li, C., & Grossmann, I. E. (2021). A review of stochastic programming methods for optimization of process systems under uncertainty. Frontiers in Chemical Engineering, 2, Article 622241. https://doi.org/10.3389/fceng.2020.622241
Li, X., Liu, J., Khattak, A., & Nambisan, S. (2020). Sequential prediction for large-scale traffic incident duration: Application and comparison of survival models. Transportation Research Record, 2674(1), 79–93. https://doi.org/10.1177/0361198119899041
Li, X., Ren, A., & Li, Q. (2022). Exploring patterns of transportation-related CO2 emissions using machine learning methods. Sustainability, 14(8), Article 4588. https://doi.org/10.3390/su14084588
Li, X., Wang, G., Zhu, Y., & Liu, W. (2025). A system dynamics-based simulation study on urban traffic congestion mitigation and emission reduction policies. Sustainability, 17(20), Article 9296. https://doi.org/10.3390/su17209296
Ling, Y., Yu, S., Fang, C., Pan, G., Wang, J., & Liu, J. (2025). Redefining crowdsourced test report prioritization: An innovative approach with large language model. Information and Software Technology, 179, Article 107629. https://doi.org/10.1016/j.infsof.2024.107629
Liu, W., Yu, X., Zhao, Q., Cheng, G., Hou, X., & He, S. (2023). Time series forecasting fusion network model based on Prophet and improved LSTM. Computers, Materials & Continua, 74(2), 3199–3219. https://doi.org/10.32604/cmc.2023.032595
Liu, Y., Hoseinzadeh, N., Gu, Y., Han, L. D., Brakewood, C., & Zhang, Z. (2024). Evaluating the coverage and spatiotemporal accuracy of crowdsourced reports over time: A case study of Waze event reports in Tennessee. Transportation Research Record, 2678(4), 468–481. https://doi.org/10.1177/03611981231185144
Lord, D., Qin, X., & Geedipally, S. R. (2021). Crash-frequency modeling. In Highway safety analytics and modeling (pp. 59–101). Elsevier. https://doi.org/10.1016/B978-0-12-816818-9.00007-X
Ma, W., Chen, B., Yu, C., & Qi, X. (2022). Trajectory planning for connected and autonomous vehicles at freeway work zones under mixed traffic environment. Transportation Research Record, 2676(10), 207–219. https://doi.org/10.1177/03611981221088766
Makridakis, S., Spiliotis, E., & Assimakopoulos, V. (2020). The M4 Competition: 100,000 time series and 61 forecasting methods. International Journal of Forecasting, 36(1), 54–74. https://doi.org/10.1016/j.ijforecast.2019.04.014
Makridakis, S., Spiliotis, E., & Assimakopoulos, V. (2022). M5 accuracy competition: Results, findings, and conclusions. International Journal of Forecasting, 38(4), 1346–1364. https://doi.org/10.1016/j.ijforecast.2021.11.013
Makris, A., Tserpes, K., Spiliopoulos, G., Zissis, D., & Anagnostopoulos, D. (2021). MongoDB vs PostgreSQL: A comparative study on performance aspects. GeoInformatica, 25(2), 243–268. https://doi.org/10.1007/s10707-020-00407-w
Manglano-Redondo, P., Paricio-Garcia, A., & Lopez-Carmona, M. A. (2025). Spatio-temporal AI modeling for urban traffic calibration: A SUMO-based approach. SUMO Conference Proceedings, 6, 33–50. https://doi.org/10.52825/scp.v6i.2628
Manibardo, E. L., Laña, I., & Del Ser, J. (2022). Deep learning for road traffic forecasting: Does it make a difference? IEEE Transactions on Intelligent Transportation Systems, 23(7), 6164–6188. https://doi.org/10.1109/TITS.2021.3083957
Martínez-Minaya, J., Lindgren, F., López-Quílez, A., Simpson, D., & Conesa, D. (2023). The integrated nested Laplace approximation for fitting Dirichlet regression models. Journal of Computational and Graphical Statistics, 32(3), 805–823. https://doi.org/10.1080/10618600.2022.2144330
Mejia, H. N., & Sigua, R. G. (2018). Impacts of different rainfall intensities on key traffic flow parameters at North Luzon Expressway using Underwood's exponential model. Philippine Transportation Journal, 1(2). http://ncts.upd.edu.ph/tssp/wp-content/uploads/2018/08/Mejia18.pdf
Metro Pacific Tollways Corporation. (n.d.-a). Home. Retrieved October 22, 2026, from https://www.mptc.com.ph/
Metro Pacific Tollways Corporation. (n.d.-b). NLEX Corporation. Retrieved October 22, 2026, from https://www.mptc.com.ph/index.php/nlex-corp
Miller, K., Horner, J., Adler, J., & Sanchez, R. (2021). Decision support for traffic management systems—Current practices (Report No. FHWA-HRT-21-108). Federal Highway Administration. https://doi.org/10.21949/1521707
Mo, W., Lee, J., Abdel-Aty, M., Mao, S., & Jiang, Q. (2024). Dynamic short-term crash analysis and prediction at toll plazas for proactive safety management. Accident Analysis & Prevention, 197, Article 107456. https://doi.org/10.1016/j.aap.2024.107456
Musah, A., Dutra, L. M. M., Aldosery, A., Browning, E., Ambrizzi, T., Borges, I. V. G., Tunali, M., Başibüyük, S., Yenigün, O., Moreno, G. M. M., da Silva, A. C. G., dos Santos, W. P., de Lima, C. L., Massoni, T., Jones, K. E., Campos, L. C., & Kostkova, P. (2022). An evaluation of the OpenWeatherMap API versus INMET using weather data from two Brazilian cities: Recife and Campina Grande. Data, 7(8), Article 106. https://doi.org/10.3390/data7080106
National Academies of Sciences, Engineering, and Medicine. (2022). Highway capacity manual: A guide for multimodal mobility analysis (7th ed.). The National Academies Press. https://doi.org/10.17226/26432
National Academies of Sciences, Engineering, and Medicine. (2024). Active traffic management strategies: A planning and evaluation guide (NCHRP Research Report 1120). The National Academies Press. https://doi.org/10.17226/27871
Nguyen, A. (2025). Enhancing the TrekBuddy—Travel mobile application—with React Native, Firebase integration, and EAS Expo deployment [Bachelor's thesis]. Theseus. https://urn.fi/URN:NBN:fi:amk-2025051411874
Nguyen, N. (2022). Creating a modern web user interface using React and TypeScript [Bachelor's thesis, Vaasa University of Applied Sciences]. Theseus. https://urn.fi/URN:NBN:fi:amk-202204265988
Ntziachristos, L., & Samaras, Z. (2023). 1.A.3.b.i-iv Road transport. In European Environment Agency, EMEP/EEA air pollutant emission inventory guidebook 2023: Technical guidance to prepare national emission inventories (EEA Report No. 06/2023). Publications Office of the European Union. https://doi.org/10.2800/795737
Patil, S. G., Zhang, T., Wang, X., & Gonzalez, J. E. (2024). Gorilla: Large language model connected with massive APIs. Advances in Neural Information Processing Systems, 37, 126544–126565. https://doi.org/10.52202/079017-4020
Redis. (n.d.-a). EXPIRE. Retrieved October 24, 2026, from https://redis.io/docs/latest/commands/expire/
Redis. (n.d.-b). SET. Retrieved October 24, 2026, from https://redis.io/docs/latest/commands/set/
Reyes-Estrope, C. (2025, April 17). Holy Week traffic on NLEX seen to peak at 493,000 daily. Philippine Daily Inquirer. https://newsinfo.inquirer.net/2053388/holy-week-traffic-on-nlex-seen-to-peak-at-493000-daily
Romanowska, A., & Budzyński, M. (2022). Investigating the impact of weather conditions and time of day on traffic flow characteristics. Weather, Climate, and Society, 14(3), 823–833. https://doi.org/10.1175/WCAS-D-22-0012.1
Rudskoy, A., Ilin, I., & Prokhorov, A. (2021). Digital twins in the intelligent transport systems. Transportation Research Procedia, 54, 927–935. https://doi.org/10.1016/j.trpro.2021.02.152
Ruf, P., Madan, M., Reich, C., & Ould-Abdeslam, D. (2021). Demystifying MLOps and presenting a recipe for the selection of open-source tools. Applied Sciences, 11(19), Article 8861. https://doi.org/10.3390/app11198861
Rundel, S., & De Amicis, R. (2023). Leveraging digital twin and game-engine for traffic simulations and visualizations. Frontiers in Virtual Reality, 4, Article 1048753. https://doi.org/10.3389/frvir.2023.1048753
Sagaama, I., Kchiche, A., Trojet, W., & Kamoun, F. (2024). Energy-efficient route navigation (eco-routing) for electric vehicles in SUMO. IEEE Canadian Journal of Electrical and Computer Engineering, 47(4), 187–198. https://doi.org/10.1109/ICJECE.2024.3425515
Salek, M. S., Jin, W., Khan, S. M., Chowdhury, M., Gerard, P., Basnet, S. B., Torkjazi, M., & Huynh, N. (2021). Assessing the likelihood of secondary crashes on freeways with Adaptive Signal Control System deployed on alternate routes. Journal of Safety Research, 76, 314–326. https://doi.org/10.1016/j.jsr.2020.12.020
Savenko, M., & Babii, K. (2025). Performance optimization strategies for large-scale web applications using Next.js. IEEE Access, 13, 217376–217386. https://doi.org/10.1109/ACCESS.2025.3647563
Schick, T., Dwivedi-Yu, J., Dessì, R., Raileanu, R., Lomeli, M., Hambro, E., Zettlemoyer, L., Cancedda, N., & Scialom, T. (2023). Toolformer: Language models can teach themselves to use tools. Advances in Neural Information Processing Systems, 36, 68539–68551. https://doi.org/10.52202/075280-2997
Scoccia, G. L., & Autili, M. (2020). Web frameworks for desktop apps: An exploratory study. In Proceedings of the 14th ACM/IEEE International Symposium on Empirical Software Engineering and Measurement (ESEM) (pp. 1–6). Association for Computing Machinery. https://doi.org/10.1145/3382494.3422171
Shah, V., Pecheux, B., Kraemer, S., & Ledbetter, G. (2024). Predictive analytics for traffic management systems (Report No. FHWA-HRT-24-091). Federal Highway Administration. https://doi.org/10.21949/1521763
Shang, Q., Xie, T., & Yu, Y. (2022). Prediction of duration of traffic incidents by hybrid deep learning based on multi-source incomplete data. International Journal of Environmental Research and Public Health, 19(17), Article 10903. https://doi.org/10.3390/ijerph191710903
Shaygan, M., Meese, C., Li, W., Zhao, X., & Nejad, M. (2022). Traffic prediction using artificial intelligence: Review of recent advances and emerging opportunities. Transportation Research Part C: Emerging Technologies, 145, Article 103921. https://doi.org/10.1016/j.trc.2022.103921
Smelyakov, K., Klochko, O., & Dudar, Z. (2023). Building quantile regression models for predicting traffic flow. In V. Lytvyn, A. Kowalska-Styczen, & V. Vysotska (Eds.), Proceedings of the 7th International Conference on Computational Linguistics and Intelligent Systems (CoLInS 2023), Volume I: Machine Learning Workshop (CEUR Workshop Proceedings, Vol. 3387, pp. 117–132). CEUR-WS.org. https://ceur-ws.org/Vol-3387/paper10.pdf
Soroori, E., Mohammadzadeh Moghaddam, A., & Salehi, M. (2021). Modeling spatial nonstationary and overdispersed crash data: Development and comparative analysis of global and geographically weighted regression models applied to macrolevel injury crash data. Journal of Transportation Safety & Security, 13(9), 1000–1024. https://doi.org/10.1080/19439962.2020.1712671
Sun, B., Sun, T., & Jiao, P. (2021). Spatio-temporal segmented traffic flow prediction with ANPRS data based on improved XGBoost. Journal of Advanced Transportation, 2021, Article 5559562. https://doi.org/10.1155/2021/5559562
Sunberg, Z. N., & Kochenderfer, M. J. (2022). Improving automated driving through POMDP planning with human internal states. IEEE Transactions on Intelligent Transportation Systems, 23(11), 20073–20083. https://doi.org/10.1109/TITS.2022.3182687
Treiber, M., & Kesting, A. (2025). Traffic flow dynamics: Data, models and simulation (2nd ed.). Springer. https://doi.org/10.1007/978-3-031-93922-8
Trivedi, P. U., Shah, J. H., Čep, R., Abualigah, L., & Kalita, K. (2024). A hybrid best-worst method (BWM)—technique for order of preference by similarity to ideal solution (TOPSIS) approach for prioritizing road safety improvements. IEEE Access, 12, 30054–30065. https://doi.org/10.1109/ACCESS.2024.3368395
Tunc, I., Yesilyurt, A. Y., & Soylemez, M. T. (2021). Different fuzzy logic control strategies for traffic signal timing control with state inputs. IFAC-PapersOnLine, 54(2), 265–270. https://doi.org/10.1016/j.ifacol.2021.06.032
Upstash. (n.d.). Upstash Redis REST API. Retrieved October 24, 2026, from https://upstash.com/docs/redis/features/restapi
Varshney, A. K., & Torra, V. (2023). Literature review of the recent trends and applications in various fuzzy rule-based systems. International Journal of Fuzzy Systems, 25(6), 2163–2186. https://doi.org/10.1007/s40815-023-01534-w
Wang, J., Cetin, M., Yang, H., Xie, K., Zhai, G., & Ishak, S. (2024). Improving effectiveness of the safety service patrol programs: A discrete event-based simulation approach. Transportation Research Record, 2678(12), 1026–1041. https://doi.org/10.1177/03611981241248652
Wang, P., Hao, W., & Jin, Y. (2021). Fine-grained traffic flow prediction of various vehicle types via fusion of multisource data and deep learning approaches. IEEE Transactions on Intelligent Transportation Systems, 22(11), 6921–6930. https://doi.org/10.1109/TITS.2020.2997412
Wang, P., Zhao, J., Gao, Y., Sotelo, M. A., & Li, Z. (2020). Lane work-schedule of toll station based on queuing theory and PSO-LSTM model. IEEE Access, 8, 84434–84443. https://doi.org/10.1109/ACCESS.2020.2992070
Wang, Y., Dong, Z. S., & Hu, S. (2021). A stochastic prepositioning model for distribution of disaster supplies considering lateral transshipment. Socio-Economic Planning Sciences, 74, Article 100930. https://doi.org/10.1016/j.seps.2020.100930
Washington, S., Karlaftis, M. G., Mannering, F., & Anastasopoulos, P. (2020). Statistical and econometric methods for transportation data analysis (3rd ed.). Chapman and Hall/CRC. https://doi.org/10.1201/9780429244018
Wen, H.-T., Lu, J.-H., & Jhang, D.-S. (2021). Features importance analysis of diesel vehicles' NOx and CO2 emission predictions in real road driving based on gradient boosting regression model. International Journal of Environmental Research and Public Health, 18(24), Article 13044. https://doi.org/10.3390/ijerph182413044
World Wide Web Consortium. (2025, May 6). Web content accessibility guidelines (WCAG) 2.1 [W3C Recommendation]. https://www.w3.org/TR/WCAG21/
Yang, J., Yue, Y., & Rashmi, K. V. (2021). A large-scale analysis of hundreds of in-memory key-value cache clusters at Twitter. ACM Transactions on Storage, 17(3), 1–35. https://doi.org/10.1145/3468521
Yao, Y., & Graham, D. J. (2025). Interval prediction of annual average daily traffic on local roads via quantile random forest with high-dimensional spatial data (arXiv:2510.18548) [Preprint]. arXiv. https://doi.org/10.48550/arXiv.2510.18548
Yu, E., Xu, Y., Gao, L., Cao, J., Xiang, Q., & He, L. (2025). R-Manager: Consortium blockchain-based vehicle reputation management for high-quality reports in traffic-oriented crowdsourcing. IEEE Transactions on Vehicular Technology, 74(1), 984–999. https://doi.org/10.1109/TVT.2024.3458080
Yu, G., & Yang, S. (2024). Exploration and practice of data visualization. In Proceedings of the 2024 5th International Conference on Big Data Economy and Information Management (pp. 834–838). ACM. https://doi.org/10.1145/3724154.3724292
Zhang, S., Shi, J., Huang, Y., Shen, H., He, K., & Chen, H. (2024). Investigating the effect of dynamic traffic distribution on network-wide traffic emissions: An empirical study in Ningbo, China. PLOS ONE, 19(7), Article e0305481. https://doi.org/10.1371/journal.pone.0305481
Zulfa, M. I., Hartanto, R., & Permanasari, A. E. (2020). Caching strategy for Web application – a systematic literature review. International Journal of Web Information Systems, 16(5), 545–569. https://doi.org/10.1108/IJWIS-06-2020-0032
Zunino, A., Velázquez, G., Celemín, J., Mateos, C., Hirsch, M., & Rodriguez, J. (2020). Evaluating the performance of three popular web mapping libraries: A case study using Argentina's life quality index. ISPRS International Journal of Geo-Information, 9(10), Article 563. https://doi.org/10.3390/ijgi9100563


# Appendix
## A.1 Glossary
| Term | Meaning | Computation | Where it appears |
| --- | --- | --- | --- |
| Local control-day comparison | Measures how much a holiday or event changes traffic. | Percentage deviation of the day’s volume from the mean of the same weekday within ±45 days, excluding holidays and events (Eq. 3.9.3.4). | Descriptive analytics (3.11.1.3) |
| Average daily traffic (ADT) | Mean daily toll-plaza entries. | Sum of daily entries over valid days divided by the number of valid days (Eq. 3.9.3.1). | Data gathering (3.9.3) |
| Exposure-normalized crash rate ratio | Compares crash risk in wet and dry hours. | Crashes per wet hour divided by crashes per dry hour (Eq. 3.11.1.1). | Descriptive analytics (3.11.1.5) |
| Mean Time to Clear (MTTC) | Average time an incident occupies the carriageway. | Mean of site-cleared time minus event start for incidents with valid timestamps, reported with median, 90th percentile and coverage. | KPI K9; descriptive analytics (3.11.1.6) |
| Kaplan–Meier estimator | Empirical probability that an incident is still uncleared after t minutes. | Product over clearance times of (1 − cleared / still uncleared) (Eq. 3.11.1.2). | Descriptive and prescriptive analytics |
| Baseline emissions | Estimated CO₂ from vehicle travel on the corridor. | Counts × allotted segment length × fixed per-class factor (192/354/1,492 g/km) (Eq. 3.9.3.5). | Emission features (3.9.3); Emissions page |
| Delay-induced CO₂ | Additional CO₂ from vehicles queued behind a lane-blocking incident; a lower bound. | φ × (flow/60) × T²/2 per incident, with T the lane-blockage minutes (Eq. 3.9.3.7). | KPI K8; Emissions page |
| Prophet | Decomposable time-series model with trend, seasonality and regressors. | y(t) = g(t) + s(t) + βᵀxₜ + εₜ (Eq. 3.11.2.1). | Champion daily volume model (3.11.2.2) |
| Holt-Winters exponential smoothing | Forecasting method with level, trend and seasonal components. | Additive form with a seven-day season (Eq. 3.11.2.2). | Volume benchmark (3.11.2.2) |
| SARIMAX | Seasonal ARIMA with external regressors. | SARIMAX(1,1,1)(1,1,1)₇ with weather regressors. | Volume comparator (rejected) |
| LSTM / GRU | Recurrent neural networks for sequences. | Trained on lagged series; compared with baselines. | Comparators (not adopted for volume or CO₂) |
| XGBoost | Gradient-boosted decision trees with regularization. | Minimizes a regularized loss over trees (Eq. 3.11.2.3). | Congestion-state classifier (3.11.2.3) |
| Negative binomial regression | Count model for overdispersed data. | log μ = β₀ + βᵀx; Var = μ + αμ² (Eq. 3.11.2.4). | Incident count forecast (3.11.2.5) |
| Ordinal logistic regression | Model for ordered categories. | logit P(Y ≤ k) = θₖ − βᵀx (Eq. 3.11.2.5). | Severity classification (3.11.2.6) |
| Cox proportional hazards model | Survival model for time to clearance. | h(t\|x) = h₀(t) exp(βᵀx) (Eq. 3.11.2.6); evaluated by the concordance index. | Clearance-time model (3.11.2.7) |
| Geographically weighted regression (GWR) | Regression with coefficients that vary by location. | Local Poisson regression across the 20 exits (Eq. 3.11.2.7). | Spatial incident model (3.11.2.8) |
| Gradient boosting regression | Additive ensemble of regression trees. | Fₘ = Fₘ₋₁ + νhₘ (Eq. 3.11.2.8). | Champion CO₂ forecast (3.11.2.9) |
| Dirichlet regression | Model for proportions that sum to one. | Shares ~ Dirichlet(α), log α_c = xᵀβ_c (Eq. 3.11.2.9). | Fleet-mix forecast (3.11.2.10) |
| WMAPE | Weighted mean absolute percentage error. | Σ\|y − ŷ\| / Σ\|y\| × 100% (Eq. 3.11.3.2). | Primary ranking metric (3.11.3) |
| MAPE / RMSE / MAE | Standard forecast error metrics. | Equations 3.11.3.1, 3.11.3.3 and 3.11.3.4. | Model evaluation (3.11.3) |
| MASE | Scale-free error relative to the seasonal-naive forecast. | Test MAE divided by in-sample seasonal-naive MAE with m = 7 (Eq. 3.11.3.5). | Model evaluation and accuracy gate |
| Skill score | Improvement of a classifier over a reference. | (accuracy − reference accuracy) / (1 − reference accuracy) (Eq. 3.11.3.6). | Congestion classifier evaluation (KPI K2) |
| Seasonal-naive and climatology baselines | Simple forecasts every model must beat. | Value one week earlier; average for the same day of the year. | Model selection (3.11.2.1) |
| Rolling-origin evaluation | Chronological testing at successive forecast origins. | Refit at each origin and score the next 7–14 days. | Model evaluation (3.11.2.1) |
| Accuracy gate | Rule that decides whether a retrained model is published. | Must beat the baselines, meet the MASE condition and be no more than 25% worse than the previous run. | Weekly retraining (3.11.3.6) |
| Booth staffing allocation | Linear allocation of toll booths to demand. | Minimize unserved demand subject to booth and staff limits (Eqs. 3.11.4.1–3.11.4.2). | Traffic – Prescriptive |
| Maximal covering location problem (MCLP) | Places patrol units to cover the most expected incidents. | Binary integer program (Eqs. 3.11.4.3–3.11.4.6). | Incidents – Prescriptive |
| Two-stage stochastic program | Optimization under uncertain clearance times. | Dispatch decision, then recourse escalation over four scenarios (Eqs. 3.11.4.7–3.11.4.8). | Clearance Response Protocol |
| Fuzzy inference advisory | Grades the urgency of a congestion response. | Weighted average of nine rule outputs (Eq. 3.11.4.9). | Congestion Response Advisory |
| TOPSIS | Ranks alternatives by closeness to an ideal solution. | C = d⁻ / (d⁺ + d⁻) (Eqs. 3.11.4.10–3.11.4.11). | Event and emission strategy ranking |
| Bootstrap uncertainty range | Sampling uncertainty of a strategy estimate. | 400 seeded resamples of observed incidents; 5th–95th percentile. | Emission strategies (3.11.4.7) |
| Intelligent Driver Model (IDM) and MOBIL | Car-following and lane-changing rules of the simulated vehicles. | Equations 3.11.5.1–3.11.5.3. | Scenario Sandbox (3.11.5.1) |
| Language-model interface | Interprets commands or explains results; does not forecast or optimize. | GLM (sandbox, narratives); Qwen with tool calling (mobile assistant); outputs validated by the system. | Section 3.11.5.2 |
| Medallion architecture | Layered warehouse design. | Bronze (raw), silver (cleaned), gold (analysis-ready and model outputs). | Sections 3.9–3.10 |





