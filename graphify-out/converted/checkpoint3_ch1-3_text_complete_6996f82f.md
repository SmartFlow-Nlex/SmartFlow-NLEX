<!-- converted from checkpoint3_ch1-3_text_complete.docx -->


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


May 2026S
# Table Of Contents
TABLE OF CONTENTS	1
CHAPTER 1	1
1.1 Definition of Terms	3
1.2 Company Background	5
1.3 Project Context (Business Analytics)	7
1.4 Purpose and Objectives	8
1.4.1 General Objectives	9
1.4.2 Specific Objectives	10
1.5 Scope and Limitations	11
1.5.1 Scope	11
1.5.2 Limitations	14
1.6 Conceptual Framework of Data Integration	17
1.7 Project Milestones/Timeline	18

CHAPTER 2	19
2.1 Review of Related Literature and Studies	19
2.1.1 Intelligent Transportation Systems and Traffic Management	20
2.1.1.1 Traffic Analysis and Management	20
2.1.1.2  Decision-Intelligence Systems	21
2.1.2 Traffic Data Sources and Multisource Integration	23
2.1.2.1 Multisource Data Integration in Traffic Systems	24
2.1.2.2 Crowdsourcing and Real-Time Traffic Data Collection	25
2.1.2.3 External Factors Affecting Traffic Patterns	26
2.1.3 Descriptive Analytics for Traffic Systems	27
2.1.3.1 Traffic Volume Trend Analysis (Time Series Aggregation)	28
2.1.3.1.1 STL (Seasonal-Trend Decomposition using LOESS) & Rolling Mean	29
2.1.3.1.2 ACF and PACF Analysis (Autocorrelation Function and Partial Autocorrelation Function)	30
2.1.3.2  Peak Hour and Congestion Pattern Analysis	31
2.1.3.2.1 Gaussian Mixture Model (GMM) for Traffic Regime Classification	32
2.1.3.2.2 Speed-Flow Fundamental Diagram	33
2.1.3.3 Event-Based and Holiday Traffic Analysis	33
2.1.3.4 Location-Based Hotspot Analysis	34
2.1.3.4.1 Spatial Density Estimation and Hotspot Mapping	34
2.1.3.5 Incident Frequency and Severity Analysis	35
2.1.3.6 Weather-Condition Traffic Impact Analysis	36
2.1.3.6.1 Mejia and Sigua Speed-Reduction Model	37
2.1.3.7 Traffic-Driven Carbon Emission Estimation	37
2.1.3.8 Vehicle Classification and Fleet Mix Analysis	38
2.1.3.9 Descriptive Geospatial Analysis using Heatmaps	39
2.1.4 Predictive Analytics for Traffic Forecasting	40
2.1.4.1 Time-Series Forecasting Models for Traffic, Incident, and Sustainability Data	41
2.1.4.1.1 Prophet Forecasting Model	41
2.1.4.1.2 Seasonal Autoregressive Integrated Moving Average (SARIMA)	42
2.1.4.1.3 SARIMAX Model	43
2.1.4.1.4 Holt’s Linear Trend Model	44
2.1.4.2 Machine Learning Models for Traffic, Incident, and Sustainability Prediction	45
2.1.4.2.1 Random Forest Regression	45
2.1.4.2.2 Quantile Random Forest (QRF)	46
2.1.4.2.3 Extreme Gradient Boosting (XGBoost)	47
2.1.4.2.4 Gradient Boosting Classifier and Regressor (GBR)	48
2.1.4.2.5 Long Short-Term Memory (LSTM)	48
2.1.4.2.6 Spatial and Multivariate LSTM	49
2.1.4.2.7 Gated Recurrent Unit (GRU)	50
2.1.4.2.8 Geographically Weighted Regression (GWR)	51
2.1.4.2.9 Negative Binomial Regression	52
2.1.4.2.10 Ordinal and Logistic Regression	53
2.1.4.2.11 Cox Proportional Hazard (Cox PH)	54
2.1.4.2.12 Dirichlet Regression	54
2.1.4.2.13 Polynomial Regression	55
2.1.4.3 Ensemble Forecasting Models	56
2.1.5 Prescriptive Analytics in Traffic Systems	57
2.1.5.1 Prescriptive Models and Decision Strategies	58
2.1.5.1.1 What-If Analysis and Scenario Simulation	58
2.1.5.1.2 Rule-Based Decision Models	59
2.1.5.1.3 Traffic Optimization Models (Linear Programming)	60
2.1.5.1.4 Fuzzy Rule-Based Decision Models	61
2.1.5.1.5 TOPSIS and Multi-Criteria Decision Analysis (MCDA)	62
2.1.5.1.6 Heuristic-Based Traffic Strategies	63
2.1.5.1.7 Sustainability-Aware Traffic Optimization	64
2.1.5.1.8 Stochastic Linear Programming (SLP)	65
2.1.5.1.9 Monte Carlo Simulation	66
2.1.6 Geospatial Analysis and Traffic Visualization	67
2.1.7 Agent-Based Traffic Simulation	68
2.1.8 Environmental Impact of Traffic Systems	69
2.1.8.1 Carbon Emissions and Traffic Congestion	69
2.1.8.2 Theoretical Framework: National Emission Inventory Methodology	70
2.1.8.3 Baseline Emission Metrics and Vehicle Classification	70
2.1.8.4 Operational Efficiency and the Carbon "Idling Penalty"	71
2.1.8.5 API Integration for Dynamic Emission Factors	72
2.1.9 Model Evaluation and Validation Techniques	74
2.1.9.1 Forecast Error Metrics (MAE, RMSE, MAPE, WMAPE)	74
2.1.9.2 Scale-Independent Metrics (MASE, RMSE)	75
2.1.9.3 Model Selection Criteria (AIC, BIC)	76
2.1.9.4 Validation Techniques	77
2.1.9.4.1 Chronological Train-Test Split Evaluation	77
2.1.9.4.2 Walk-Forward Validation	78
2.1.9.5 Model Benchmarking and Performance Metrics	79
2.1.9.6 System Performance and Load Stress Validation	80
2.1.10 Key Performance Indicators (KPIs) in Traffic Management	81
2.1.10.1 Volume-to-Capacity (V/C) Ratio	81
2.1.10.2 Alert Lead Time and Mean Time to Clear (MTTC)	82
2.1.10.3 Environmental Metrics (CO₂ per class-km)	83
2.1.10.4 Forecast Accuracy Metrics (MAPE and Advisory Accuracy)	84
2.1.11 Feedback Loops and Model Retraining (MLOps Framework)	85
2.1.11.1 Feedback Loop Mechanisms in Machine Learning Systems	85
2.1.11.2 Continuous Model Monitoring and Performance Tracking	86
2.1.11.3 Model Retraining and Adaptive Learning (MLOps)	87
2.1.11.4 User Interaction Feedback Integration (e.g., recommendation validation)	88
2.1.11.5 System Improvement Cycle	89
2.1.12 Large Language Models and Conversational Interfaces	90
2.1.12.1 LLMs for Commuter Conversational Interfaces	90
2.1.12.2 LLM-Driven Scenario Generation in Simulation Sandboxes	91
2.2 Review of Related Systems and Technologies	92
2.2.1 Intelligent Transportation Systems and Infrastructure	92
2.2.1.1 Cloud-Integrated ITS	92
2.2.1.2 Multi-Layered Automated Systems	93
2.2.2 Traffic Monitoring and Navigation Frameworks	94
2.2.2.1 Crowdsourced Reporting	94
2.2.3 Data Engineering and ETL Pipeline Frameworks	95
2.2.3.1 Data Integrity and Cleaning	95
2.2.3.2 Batch and Real-Time Handling	96
2.2.4 Statistical Analysis and Validation (RStudio)	97
2.2.4.1 Correlative Validation	97
2.2.5 Machine Learning and Forecasting Engines (Python)	98
2.2.5.1 Deep Learning Frameworks	98
2.2.6 Mathematical Optimization (Linear Programming)	99
2.2.6.1 Decision Intelligence	99
2.2.7 Agent-Based Simulation	100
2.2.7.1 Autonomous Agent Simulation	100
2.2.8 Database and Data Storage Technologies	101
2.2.8.1 High-Performance Architectures	101
2.2.8.2 Event-Based Reduction	102
2.2.8.3 Redis	103
2.2.9 API Integration and External Data Sources	104
2.2.9.1 Web Scraping	104
2.2.9.2 Open Weather	104
2.2.10 Visualization and System Architecture	105
2.2.10.1 Proactive Management Visualization	105
2.2.10.1.1 Next.js	106
2.2.10.1.2 Typescript	107
2.2.10.1.3 Apache Echarts	108
2.2.10.1.4 Mapbox	109
2.2.10.1.5 Github	110
2.2.10.1.6 Figma	110
2.2.10.1.6 Electron	111
2.2.10.2 End-to-End Pipeline Design	111
2.2.10.2.1 PostGIS	112
2.2.11 Mobile Application Development Frameworks	113
2.3 Synthesis	114

CHAPTER 3	115
3.1 Development Methodology	116
3.2 Business Process	119
3.2.1 Comparison of Existing and Proposed Business Processes	119
3.2.1.1 Process Map	119
3.2.1.1.1 Existing Business Process/es	119
3.2.1.1.2 Proposed Business Process/es	120
3.2.1.2 Data Flow Diagram	139
3.2.1.2.1 Proposed Data Pipeline	140
3.3 Business Solution	148
3.4 Project Risk and Feasibility Studies	149
3.4.1 Risk Management	149
3.4.2 Technological Feasibility	153
3.4.3 Organizational/Cultural Feasibility	155
3.4.4 Economic Feasibility	157
3.5 Business Requirements Overview	160
3.5.1 Functional Requirements	160
3.5.2 Non-Functional Requirements	161
3.6 Key Indicator Performance (KPI) Catalogue	163
3.7 Mock-ups	165
3.7.1 Dashboard	165
3.7.2 Mobile Application	175
3.8 System Generated Outputs	178
3.9 Data Gathering (with ETL)	180
3.9.1 Data Sources	181
3.9.2 Extract	182
3.9.3 Transformation	184
3.9.3.1 Data Cleaning Engine	184
3.9.3.2 Feature Engineering Engine	185
3.9.4 Load and Data Warehouse Layer	191
3.10 Presentation of Schema	192
3.11 Business Analytics Model and Testing	195
3.11.1 Descriptive Analytics	195
3.11.1.1 Data Overview	195
3.11.1.2 STL (Seasonal-Trend decomposition using LOESS)	196
3.11.1.3 Rolling Mean (Moving Average)	196
3.11.1.4 Autocorrelation and Partial Autocorrelation Functions (ACF 
and PACF)	196
3.11.1.5 Gaussian Mixture Model (GMM)	197
3.11.1.6 Speed-Flow Fundamental Diagram (Underwood's Model)	197
3.11.1.7 Speed-Flow Fundamental Diagram (Underwood's Model)	197
3.11.1.8 Control-Day Comparison & Anomaly Detection (2-Sigma Rule)	198
3.11.1.9 Clearance Time Distribution (Log-Normal)	198
3.11.1.10 COPERT IV / EMFAC Emission Framework	198
3.11.1.11 Kernel Density Estimation (KDE) & Network-Constrained KDE (NKDE)	199
3.11.1.12 Getis-Ord Gi*	199
3.11.1.13 Mejia and Sigua Speed-Reduction Model	199
3.11.2 Predictive Analysis	200
3.11.2.1 Data Overview	201
3.11.2.2 SARIMAX (Seasonal AutoRegressive Integrated Moving Average with eXogenous regressors)	201
3.11.2.3  Prophet	202
3.11.2.4 Long Short Term Memory	202
3.11.2.5 eXtreme Gradient Boosting (XGBoost)	202
3.11.2.6 Holt-Winters Exponential Smoothing	203
3.11.2.7 Gated Recurrent Unit (GRU)	203
3.11.2.8 Bidirectional LSTM (Bi-LSTM) & Spatial LSTM	203
3.11.2.9 Quantile Random Forest (QRF)	203
3.11.2.10 Geographically Weighted Regression (GWR)	204
3.11.2.11 Negative Binomial Regression	204
3.11.2.12 Ordinal Logistic Regression	204
3.11.2.13 Cox Proportional Hazard Model	204
3.11.2.14 Dirichlet Regression	205
3.11.2.15 Multiple Linear Regression (MLR)	205
3.11.3 Training and Testing of Models	205
3.11.3.1 MAPE (Mean Absolute Percentage Error)	206
3.11.3.2 RMSE (Root Mean Square Error)	206
3.11.3.3 MASE (Mean Absolute Scaled Error)	207
3.11.3.4 MAE (Mean Absolute Error)	207
3.11.3.5 Model Selection and Validation	208
3.11.4 Prescriptive Analysis	208
3.11.4.1 Data Overview	209
3.11.4.2 Linear Programming (LP)	209
3.11.4.3 Fuzzy Rule-Based	210
3.11.4.4 Weather-Triggered Rule & Rule-Based Surge Alert	210
3.11.4.5 TOPSIS (Technique for Order of Preference by Similarity to Ideal Solution)	210
3.11.4.6 Stochastic Linear Programming (SLP)	211
3.11.4.7 Monte Carlo Simulation	211
3.11.5 Existing Artificial Intelligence Features	212
3.11.5.1 AI Chatbot for Mobile Application	212
3.11.5.1.1 Large Language Model (Anthropic Claude Sonnet)	212
3.11.5.1.2 Retrieval Augmented Generation (RAG)	213
3.11.5.1.3 Upstream Predictive Models (Knowledge Retrieval)	213
3.11.5.2 Agent-Based Simulation Sandbox	214
3.11.5.2.1 Fuzzy Logic Inference	214
3.11.5.2.2 Linear Programming	214
3.11.5.2.3 LLM-Driven Scenario Prompting (Anthropic Claude Sonnet)	215
3.12 Business Analytics Tools, Techniques, and Specific Applications	216
3.12.1 Descriptive Analytics	216
3.12.2 Predictive Analytics	217
3.12.3 Prescriptive Analytics	218
3.13 Software Quality Assurance Plans	219
3.13.1 Unit Test	219
3.13.1.1 Unit Test Criteria	219
3.13.1.2 Unit Test Scenario	220
3.13.2 Stress Test	222
3.13.2.1 Stress Test Criteria	222
3.13.2.2 Stress Test Scenario	223
3.13.3 User-Acceptance Test	225
3.13.3.1 User-Acceptance Test Scenario for NLEX Incident Operators	225
3.13.3.2 User-Acceptance Test Scenario for NLEX Data Analysts	226
3.13.3.3 User-Acceptance Test Scenario for Traffic Control Center (TCC)  Operators	227
3.13.3.4 User-Acceptance Test Scenario for NLEX Commuters & Drivers	228
3.14 Deployment Plans	228
3.14.1 Infrastructure Setup	228
3.14.2 Deployment Stages	229
3.14.3 Rollback & Maintenance Plan	230

Bibliography	231

Appendix	242
A.1 Glossary	242

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
A data-sharing programme through which partner agencies receive Waze users' crowdsourced jam and alert reports. SmartFlow NLEX uses its historical archive and its live feed as indicators of congestion and incidents (Amin-Naseri et al., 2018).
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
The geographic scope is the NLEX main line from the Balintawak toll plaza (Km 12) to the Sta. Ines exit (Km 87) in Mabalacat City, Pampanga, covering the 19 toll plazas with recorded toll transactions. SCTEX, the NLEX Connector, Harbor Link spurs not represented in the data, and connecting local roads are outside the scope.
Multi-Source Data Integration
The system integrates hourly toll transactions by plaza, direction and vehicle class (January 2022 to June 2026); NLEX accident, breakdown and crash records; the Waze for Cities historical archive and live feed; historical hourly weather and air quality; the Philippine holiday calendar; and a Philippine Arena event calendar. The data are stored in a layered PostgreSQL and PostGIS warehouse.

Real-Time Data Monitoring and Visualization
The live Waze feed is refreshed about every two minutes and is shown on the Live Map and the Overview page. Toll and incident records are added in batches as NLEX exports are uploaded. The operator dashboard is delivered as a desktop application, and the commuter interface as a mobile application.
External Factor Integration
The analytics account for factors other than traffic volume that influence expressway behaviour: holidays, Philippine Arena events and weather. These are used to measure past effects, as inputs to selected forecasting models, and as scenario settings in the sandbox.
Predictive Congestion Forecasting
The system forecasts daily corridor volume (validated up to 14 days ahead), the congestion state of each exit from 1 to 168 hours ahead, event-day uplift, daily incidents, clearance times, corridor CO₂ and fleet mix. Each forecast is published only if it outperforms naive baselines on held-out data.
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
Event data are limited to a Philippine Arena calendar collected from the venue's published schedule and updated manually. The system has no access to ticket sales or attendance, so event effects are estimated from past traffic on event days.
Granularity of Emission Calculations
Emissions are estimated with fixed per-class emission factors and do not vary with speed or congestion. Each plaza's counts are applied to the length of corridor allotted to that plaza, because actual trip lengths are unknown. Delay-induced emissions are a lower-bound estimate. The estimates are not validated against roadside measurements.
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
Rainfall also changes traffic-stream behaviour on NLEX itself. Mejia and Sigua (2018) fitted Underwood's exponential speed–density model to NLEX traffic under different rainfall intensities and found that heavier rain lowers free-flow speed and capacity. Their results show that the operating limits of the corridor shift with weather, so analyses and simulations of NLEX should account for rainfall rather than assume fixed road characteristics.
Non-recurring disruptions such as crashes and stalled vehicles are a major source of delay, and their duration depends on incident type, response and conditions. Li, Pereira and Ben-Akiva (2018) review the methods used to analyse and predict incident duration, from hazard-based duration models to machine-learning approaches, and note that duration estimates support decisions on response resources and traveller information.
2.1.1.2  Decision-Intelligence Systems
Decision-support systems extend monitoring by evaluating candidate responses. Chung et al. (2020) developed a decision-support system for integrated active traffic management that uses the METANET macroscopic model to predict near-future conditions on connected freeways and arterials and evaluates combinations of strategies, such as variable speed limits, queue warning and ramp metering, by their effect on travel-time reliability.
The Federal Highway Administration (2021) classifies decision-support tools (DSTs) for traffic management as knowledge-driven, data-driven or model-driven. Knowledge-driven tools apply stored rules and procedures, data-driven tools query historical and current data, and model-driven tools provide “what-if” analysis that predicts the possible outcomes of response strategies on measures such as travel time, throughput and environmental impact before they are deployed.
Model-driven decision support is increasingly delivered through digital twins, virtual replicas of the road network kept in step with observed data. Rudskoy et al. (2021) describe how digital twins can modernize traffic control centres within intelligent transportation systems, and Fujishima et al. (2023) show how a digital-twin traffic simulation can be used to evaluate congestion-mitigation measures before they are implemented.
These studies support integrating fragmented data into a central interface that both describes current conditions and lets operators evaluate responses before acting. SmartFlow NLEX applies this idea by combining a knowledge- and model-driven dashboard with a simulation sandbox, while leaving every decision to the operators.
### 2.1.2 Traffic Data Sources and Multisource Integration
This section reviews why multisource data are needed for corridor analytics. Single sources such as fixed sensors have gaps, while crowdsourced reports and external factors such as weather and events add information that toll counts alone do not capture. Combining these sources is expected to improve the understanding and forecasting of expressway traffic.
2.1.2.1 Multisource Data Integration in Traffic Systems
For dealing with the specific problem of missing data and anomalies, robust data fusion techniques are required. Wang, Hao, and Jin (2021) demonstrate an effective data fusion methodology by combining conventional hardware sensor data with toll collection data. Because raw sensor data frequently suffers from missing values due to faulty equipment, spatiotemporal dependency modeling restores the missing data while utilizing accurate toll logs to validate overall traffic volumes. Leinonen et al. (2024) further point out that relying on single-source data is inadequate for representing complex traffic behaviors; integrating diverse data sources significantly improves the accuracy and reliability of predictive models compared to using isolated datasets.
For high-dimensional tabular data, tree-based ensembles are widely used. Lam (2024) compared random forest, XGBoost and LSTM models on junction vehicle counts and found XGBoost the most accurate and efficient, and Sun et al. (2021) showed that an improved XGBoost model captures spatio-temporal dependencies in segmented traffic-flow prediction.
These studies support fusing heterogeneous sources such as toll counts, crowdsourced reports and weather, and evaluating tree-based ensembles among the candidate models. In SmartFlow NLEX, XGBoost proved most useful for classifying congestion state, while a decomposable time-series model forecasts daily volume best (Section 3.11.2).
2.1.2.2 Crowdsourcing and Real-Time Traffic Data Collection
Crowdsourced reports vary in reliability. Yu et al. (2025) proposed a consortium-blockchain reputation scheme that scores each reporting vehicle so that low-quality reports can be filtered before they affect traffic applications.
Evaluations of Waze data support its use as a supplementary source. Amin-Naseri et al. (2018) found that Waze reports covered a substantial share of crashes and congestion recorded by a traffic management system, were reasonably accurate in location and were often reported earlier. Hoseinzadeh et al. (2020) found that Waze speeds closely tracked Bluetooth ground truth, with lower accuracy at night and on low-volume segments, and Goodall and Lee (2019) compared Waze crash and disabled-vehicle reports with video ground truth. These findings justify SmartFlow NLEX's use of Waze jams and alerts as a live congestion signal, while recognizing that Waze is not a complete or error-free record.


2.1.2.3 External Factors Affecting Traffic Patterns
Mejia and Sigua (2018) showed that rainfall intensity degrades traffic-stream characteristics on NLEX, reducing speed and capacity as rain becomes heavier. U.S. guidance on active traffic management likewise describes managing recurrent and non-recurrent congestion dynamically, including through real-time monitoring of traffic combined with weather conditions (National Academies of Sciences, Engineering, and Medicine, 2024).
Planned events are another external factor. Giuliano and Lu (2021) analysed traffic around a large stadium by comparing event days with comparable control days and found measurable increases in traffic near the venue, showing that event effects can be isolated when the comparison days are chosen independently of the outcome.
Following this approach, SmartFlow NLEX measures the effect of Philippine Arena events and holidays against local control days and estimates per-exit event uplift from a calendar of events, rather than from days selected because traffic was high.
### 2.1.3 Descriptive Analytics for Traffic Systems
In transportation research, descriptive analytics summarizes historical data into structured insights. Bachechi et al. (2022) describe big-data analytics and visual dashboards that aggregate traffic sensor data over space and time, and Attioui and Lahby (2025) note that understanding historical patterns is a foundation for forecasting.
These establish the importance of the project’s initial exploratory phase. By using data summarization and clustering, the study can objectively identify historical traffic trends, creating the necessary baseline for more advanced predictive and prescriptive features.

2.1.3.1 Traffic Volume Trend Analysis (Time Series Aggregation)
Traffic volume trend analysis fundamentally begins with the descriptive analytics and visual aggregation of highly variable spatio-temporal data. To uncover structural patterns within continuous traffic flows, researchers aggregate raw observations across specific temporal dimensions, such as by day of the week, month, or year. This systematic approach allows analysts to isolate recurring routines from irregular fluctuations and effectively map the evolution of traffic over both time and space (Bachechi et al., 2022).
Beyond visual mapping, a deeper analysis of recurring traffic patterns requires formal time-series analysis techniques. Hyndman and Athanasopoulos (2021) establish that raw, high-dimensional traffic volume data can be systematically decomposed into specific structural elements: the underlying long-term trend, seasonal variations, and cyclical components. Understanding these decomposed elements, along with mathematically evaluating their autocorrelation functions (ACF) and partial autocorrelation functions (PACF), provides the necessary mathematical foundation for determining the most appropriate statistical parameters to deploy for future forecasting.
These studies provide the mathematical framework for decomposing NLEX traffic into trends and seasonal cycles. This validates the project’s approach of isolating recurring routines from irregular spikes, ensuring the forecasting model is built on a structured understanding of historical volume patterns.


2.1.3.1.1 STL (Seasonal-Trend Decomposition using LOESS) & Rolling Mean
Seasonal-trend decomposition using LOESS (STL) separates a series into trend, seasonal and remainder components (Hyndman & Athanasopoulos, 2021). Bandara et al. (2025) extended STL to series with several seasonal cycles (MSTL), such as daily and weekly patterns in hourly data.
Decomposition would allow SmartFlow NLEX to separate structural growth in volume from recurring seasonal fluctuations, and a rolling mean smooths short-term noise. In the current version, these techniques are proposed extensions (Section 3.11.1.9). The champion volume model captures trend and seasonality internally.

2.1.3.1.2 ACF and PACF Analysis (Autocorrelation Function and Partial Autocorrelation Function)
Understanding decomposed elements requires formally evaluating their statistical correlation over time. Hyndman and Athanasopoulos (2021) explain that Autocorrelation Function (ACF) and Partial Autocorrelation Function (PACF) analysis mathematically quantifies the linear dependence between current and past observations in a time series.
Applying these mathematical functions provides analysts with the exact parameters needed to configure predictive algorithms. Deretić et al. (2022) corroborate this by demonstrating that evaluating ACF and PACF thresholds is a mandatory prerequisite for successfully configuring SARIMA forecasting engines, ensuring the model understands exactly how many historical lags influence the current traffic state.
In SmartFlow NLEX, ACF and PACF analysis is a proposed extension for choosing candidate orders. The implemented SARIMAX comparator uses fixed orders with a weekly period.
2.1.3.2  Peak Hour and Congestion Pattern Analysis
Peak-hour analysis summarizes when congestion recurs. Aggregating volume by hour of day and day of week reveals distinct morning and evening peaks and differences between weekdays, weekends and holidays, which traffic managers use to time resources (Bachechi et al., 2022).
SmartFlow NLEX applies this through hour-by-weekday profiles of toll entries and incidents, which identify when staffing and patrol coverage are most needed.

2.1.3.2.1 Gaussian Mixture Model (GMM) for Traffic Regime Classification
Clustering methods can classify traffic states from speed and flow observations. Gaussian mixture models fit overlapping probability distributions and assign each observation a probability of belonging to each regime, which suits the gradual transition from free flow to congestion better than hard boundaries.
In SmartFlow NLEX, mixture-model regime classification is a proposed extension. The implemented congestion states are defined by Waze jam-speed thresholds and forecast by a classifier (Section 3.11.2.3).

2.1.3.2.2 Speed-Flow Fundamental Diagram
Macroscopic traffic-flow theory relates speed, density and flow. Afrin and Yodo (2020) discuss these relationships, including the macroscopic fundamental diagram, as measures of congestion.
Fitting a speed–flow relationship to NLEX segments would define their capacity and congestion thresholds. This is a proposed extension. The sandbox currently uses the rain-dependent free-flow speeds that Mejia and Sigua (2018) reported for NLEX.
2.1.3.3 Event-Based and Holiday Traffic Analysis
Planned events and holidays cause non-recurrent changes in demand. Forecasting texts treat such calendar effects as explicit components or regressors, so that they are not mistaken for trend or noise (Hyndman & Athanasopoulos, 2021).
To isolate the effect of a specific event, Giuliano and Lu (2021) compared event days with comparable control days at the same location, which measures the net change attributable to the event.
SmartFlow NLEX implements this as a local control-day comparison: each holiday or event day is compared with the same weekday within 45 days, excluding other holidays and events (Section 3.11.1.3).
2.1.3.4 Location-Based Hotspot Analysis
Geographic information systems and spatial statistics can identify crash hotspots. Alam and Tabassum (2023) used hot-spot analysis to locate statistically significant clusters of severe crashes in Ohio and to prioritize safety interventions.
2.1.3.4.1 Spatial Density Estimation and Hotspot Mapping
Kernel density estimation converts crash points into a continuous density surface (Berhanu et al., 2023), and the Getis-Ord Gi statistic tests whether high values cluster beyond chance (Alam & Tabassum, 2023). SmartFlow NLEX currently ranks five-kilometre segments by incident counts. Kernel density and Gi testing are proposed extensions.
2.1.3.5 Incident Frequency and Severity Analysis
A baseline of incident frequency, severity and clearance time is needed to evaluate incident management. Grigorev et al. (2024) review methods for predicting incident duration, and Islam et al. (2021) model crash clearance time on freeways, showing that clearance time varies with incident and roadway characteristics.
Mapping these clearances into a visual response time distribution, analysts can identify temporal bottlenecks in emergency operations that often lead to further network degradation. Consequently, tracking the secondary incident rate, the percentage of crashes caused by the queue of an existing primary incident, is critical for comprehensive safety evaluation.
SmartFlow NLEX reports incident frequency by type and cause, severity counts, and the mean, median and 90th-percentile clearance time with the share of records that have valid timestamps.

2.1.3.6 Weather-Condition Traffic Impact Analysis
Adverse weather affects traffic flow. Romanowska and Budzyński (2022) used expressway data to quantify how weather and time of day change speed, headway and capacity, and derived weather adjustment factors. Comparing traffic and crash outcomes in wet and dry conditions is a direct way to measure such effects.
Weather impacts both flow and safety by altering driver behavior. These studies about Weather-Condition Traffic Impact supports the project's inclusion of real-time weather data to adjust speed and capacity forecasts, ensuring the system reflects how rain or low visibility actually slows down NLEX traffic.

2.1.3.6.1 Mejia and Sigua Speed-Reduction Model
For NLEX specifically, Mejia and Sigua (2018) provide rain-dependent speed parameters. SmartFlow NLEX uses their reported free-flow speeds as speed limits in the sandbox's rain scenarios, and its descriptive analysis compares crash rates in wet and dry hours (Section 3.11.1.5).
2.1.3.7 Traffic-Driven Carbon Emission Estimation
Estimating the environmental footprint of the corridor requires emission factors by vehicle type. Road-transport emission models such as COPERT provide speed-dependent emission factors by vehicle category (Ntziachristos et al., 2009), while simpler inventories apply fixed per-kilometre factors to vehicle-kilometres travelled. Congestion adds emissions through idling and stop-and-go driving (Afrin & Yodo, 2020).
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
To effectively implement these diverse forecasting horizons, modern Intelligent Transportation Systems rely heavily on advanced deep learning architectures. Processing massive datasets of historical traffic flow and real-time vehicle counts requires specialized neural networks capable of learning sequential dependencies without suffering from severe prediction degradation (Leinonen et al., 2024). Specifically, architectures such as Long Short-Term Memory (LSTM) networks prove essential for analyzing these complex time-series patterns, accurately projecting travel times, and mitigating congestion even under highly volatile conditions (Attioui & Lahby, 2025).
Benchmark studies also caution that complex models do not automatically outperform simpler ones. In the M4 competition, statistical methods and combinations remained highly competitive (Makridakis et al., 2020), and Makridakis et al. (2018) found that several machine-learning methods were less accurate than statistical ones on standard series. SmartFlow NLEX therefore evaluates statistical, machine-learning and deep-learning candidates on held-out data and publishes only those that beat naive baselines.
2.1.4.1 Time-Series Forecasting Models for Traffic, Incident, and Sustainability Data
2.1.4.1.1 Prophet Forecasting Model
Prophet models a time series as the sum of a piecewise-linear trend with changepoints, Fourier seasonal components and holiday effects, and is designed to produce reliable forecasts with little manual tuning (Taylor & Letham, 2018).
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
Exponential smoothing methods forecast by weighting recent observations more heavily. Holt's method adds a trend component, and the Holt-Winters method adds seasonality (Hyndman & Athanasopoulos, 2021). Hyndman et al. (2002) placed these methods in a state-space framework that supports automatic model selection and prediction intervals.
Because they are fast and robust, exponential smoothing methods are standard benchmarks against which more complex models must be justified (Makridakis et al., 2020).
SmartFlow NLEX evaluates Holt's linear trend and additive Holt-Winters with a weekly season as volume candidates and benchmarks. Holt-Winters is currently accepted as a benchmark that beats the seasonal-naive baseline.

2.1.4.2 Machine Learning Models for Traffic, Incident, and Sustainability Prediction
2.1.4.2.1 Random Forest Regression
Processing high-dimensional traffic and emissions data requires ensemble learning algorithms capable of capturing complex non-linear relationships while aggressively avoiding data overfitting. Smelyakov et al. (2023) emphasize that Random Forest (RF) algorithms achieve this by applying an averaging mechanism across multiple, independent decision trees that are fitted on random subsets of the overall dataset.
By averaging many trees, random forests reduce variance and are robust to noise. Lam (2024) included random forests among the models compared for traffic prediction.
SmartFlow NLEX uses random forests as comparators for congestion-state classification and incident counts. They have not been selected as champions.

2.1.4.2.2 Quantile Random Forest (QRF)
Standard models give point forecasts without uncertainty. A quantile regression forest retains the distribution of training targets in each leaf and estimates conditional quantiles (Yao & Graham, 2025).
Yao and Graham (2025) used quantile regression forests to produce prediction intervals for annual average daily traffic on local roads in England and Wales.
Prediction intervals would help operators plan for worst cases. A true quantile regression forest is a proposed extension for SmartFlow NLEX; the implemented random-forest comparator is a standard classifier.

2.1.4.2.3 Extreme Gradient Boosting (XGBoost)
Extreme Gradient Boosting (XGBoost) builds trees sequentially, each correcting the residual errors of the previous ones, with regularization and efficient handling of sparse data (Chen & Guestrin, 2016). Sun et al. (2021) applied an improved XGBoost to spatio-temporal traffic-flow prediction.
Lam (2024) found XGBoost the most accurate and efficient of the models compared for junction traffic prediction.
In SmartFlow NLEX, XGBoost is the champion congestion-state classifier, forecasting low, medium and high states by exit for 1 to 168 hours ahead. It is also a comparator for incident severity and fleet mix. It is not used as the volume model.

2.1.4.2.4 Gradient Boosting Classifier and Regressor (GBR)
Gradient boosting can be applied to regression, by fitting trees to the residuals of a continuous target, or to classification, by optimizing a classification loss (Chen & Guestrin, 2016).
The same framework therefore serves numerical targets such as emissions and categorical targets such as congestion state.
In SmartFlow NLEX, gradient boosting regression is the champion daily CO₂ forecaster, while XGBoost classifies congestion state.
2.1.4.2.5 Long Short-Term Memory (LSTM)
Modern Intelligent Transportation Systems increasingly rely on deep learning architectures to process massive, multi-source datasets spanning long horizons. Leinonen et al. (2024) establish that Long Short-Term Memory (LSTM) networks are specifically engineered to retain complex time-series patterns over extended periods without suffering from severe prediction degradation.
Within this domain, LSTM networks specifically address the vanishing gradient problem found in older neural networks. Attioui and Lahby (2025) demonstrate that by utilizing internal memory cells, LSTMs successfully learn the complex, long-term sequential dependencies that dictate severe traffic disruptions and non-recurrent congestion.
In SmartFlow NLEX, LSTM networks were trained for daily volume and CO₂ but did not beat the baselines, so they are retained as comparators. This is consistent with benchmark evidence that deep networks do not always outperform statistical methods on such series (Makridakis et al., 2018).
2.1.4.2.6 Spatial and Multivariate LSTM
Traffic at one location is influenced by neighbouring locations. Zheng et al. (2019) combined LSTM, autoencoder and convolutional networks in an ensemble that captures temporal and spatial patterns for short-term traffic prediction.
Spatially aware models can therefore represent how conditions at one point propagate to others.
SmartFlow NLEX includes a spatial LSTM for exit-level incident counts that adds the lagged counts of the two nearest exits. Its congestion classifier likewise uses lagged states of neighbouring exits.
2.1.4.2.7 Gated Recurrent Unit (GRU)
While LSTMs are highly capable, handling the computational demands of real-time forecasting requires optimized network architectures. Hewamalage et al. (2021) establish that the Gated Recurrent Unit (GRU) functions as a streamlined recurrent neural network that utilizes an efficient gating mechanism.
This architectural efficiency drastically accelerates model training and inference speeds. Hewamalage et al. (2021) demonstrate that GRUs achieve comparable predictive accuracy to LSTMs but operate with significantly fewer mathematical parameters, significantly reducing the overall computational load on the system.
In SmartFlow NLEX, GRU networks are comparators for congestion state and incident counts. Separate GRU models for wet and dry conditions are a proposed extension.
2.1.4.2.8 Geographically Weighted Regression (GWR)
Global regression assumes that the relationship between predictors and crash frequency is the same everywhere. Geographically weighted regression relaxes this by estimating local coefficients that vary across space, using a distance-weighting kernel.
Local coefficients can show that the same predictor has different effects in different parts of a road network.
SmartFlow NLEX fits a Poisson geographically weighted regression across its 20 exits. With so few locations, the local coefficients are interpreted descriptively.
2.1.4.2.9 Negative Binomial Regression
Crash counts are typically overdispersed, with variance larger than the mean. Lord and Mannering (2010) review crash-frequency models and identify the negative binomial model as a standard choice for such data. Deretić et al. (2022) show that accident counts also have strong seasonality.
Count models with overdispersion therefore give more reliable uncertainty than ordinary regression for incident frequencies.
SmartFlow NLEX uses a negative binomial model as the champion daily incident forecaster, compared with Poisson, tree-based and recurrent models. Its improvement over naive forecasts is modest.
2.1.4.2.10 Ordinal and Logistic Regression
Beyond predicting the sheer frequency of events, assessing subsequent operational impact involves classifying the severity of an expected incident. Grigorev et al. (2024) establish that logistic regression and classification frameworks provide highly robust baselines for calculating binary outcomes, such as the probability of severe traffic delays or total road closures.
Shang et al. (2022) predicted incident duration from incomplete multi-source data with a hybrid deep-learning model, showing that incident outcomes can be estimated from information available at report time.
SmartFlow NLEX applies ordinal logistic regression and XGBoost to classify accident severity. Both currently perform about as well as predicting the most common class, which is reported as a limitation.
2.1.4.2.11 Cox Proportional Hazard (Cox PH)
Survival analysis is the standard framework for incident duration. Nam and Mannering (2000) applied hazard-based duration models to highway incidents, and the Cox proportional hazards model estimates how covariates scale the hazard of clearance without assuming a baseline distribution (Cox, 1972).
The Kaplan–Meier estimator provides the empirical survival curve from observed durations, including censored records (Kaplan & Meier, 1958).
SmartFlow NLEX fits a Cox model to estimate clearance time and uses Kaplan–Meier curves for the dashboard and for the scenarios of the clearance protocol.
2.1.4.2.12 Dirichlet Regression
Vehicle-class shares are compositional data that must sum to one. Dirichlet regression models such proportions jointly (Douma & Weedon, 2019), and Maier (2014) provides an implementation for compositional data.
Modelling the shares jointly keeps the forecast composition consistent.
SmartFlow NLEX uses Dirichlet regression to forecast the daily shares of Class 1, 2 and 3 vehicles, which feed the emission views and the sandbox vehicle mix.
2.1.4.2.13 Polynomial Regression
Network-wide traffic emissions depend on how traffic is distributed, not only on its volume. Zhang S. et al. (2024) estimated network emissions in Ningbo and found that more uneven traffic distribution reduces capacity and increases emissions.
Polynomial regression adds higher-order terms to capture curved relationships between predictors and the target.
SmartFlow NLEX tests a polynomial ridge regression as a CO₂ forecasting comparator. It is not the champion, and the emission inventory itself uses fixed per-class factors without a speed term.
2.1.4.2.14 Monte Carlo Simulation
Monte Carlo methods propagate uncertainty by repeated random sampling. Zhang S. et al. (2024) used Monte Carlo simulation in estimating network-wide traffic emissions.
SmartFlow NLEX uses a related resampling approach: a seeded bootstrap of 400 resamples of observed incidents gives 5th-to-95th-percentile ranges for its emission strategies. These ranges describe sampling uncertainty and do not guarantee a reduction.
2.1.4.3 Ensemble Forecasting Models
The integration of diverse algorithms into hybrid and ensemble frameworks is fundamental for managing traffic data complexities. Liu et al. (2023) demonstrate that fusing foundational statistical baselines with advanced neural networks allows systems to effectively process multimodal data and isolate complex residual errors during non-recurrent congestion.
Forecast combinations performed well in the M4 competition (Makridakis et al., 2020).
SmartFlow NLEX did not adopt forecast combinations, because no combination has yet been tested against the single champions. Combination remains a proposed extension.

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
To handle the inherent uncertainty of real-world traffic data, modern rule-based systems frequently incorporate continuous logic frameworks to avoid rigid, binary failures. M.E.M. Ali et al. (2021) explore how Fuzzy Rule-Based Systems (FRBS) evaluate traffic volume and speed on a continuous spectrum rather than a binary trigger. This nuanced evaluation allows engines to recommend graduated, smoothed responses that adapt seamlessly to evolving congestion states.
SmartFlow NLEX uses rule-based advisories for heavy-vehicle time windows, peak toll differentials and patrol alert windows (Section 3.11.4.8).
2.1.5.1.3 Traffic Optimization Models (Linear Programming)
To mathematically maximize the efficiency of a road network, traffic flow problems are frequently abstracted using mathematical programming. In these frameworks, highway intersections act as vertices, and road segments act as edges with strict capacity constraints based on physical volume limits. This mathematical abstraction allows systems to identify the absolute most efficient routing pathways by systematically eliminating suboptimal vehicle distributions.
Ma et al. (2022) formulated trajectory planning for connected and autonomous vehicles at freeway work zones as a mixed-integer linear program that minimizes delay and fuel use, showing how optimization can manage traffic around capacity drops.
Location models address where to station response resources. The maximal covering location problem places a fixed number of facilities to cover the largest weighted demand within a service distance (Church & ReVelle, 1974; Murray, 2016), and Adler et al. (2014) applied location-allocation models to traffic police patrol vehicles on an interurban network. SmartFlow NLEX uses a maximal covering location model to position patrol units and a linear allocation for toll-booth staffing (Sections 3.11.4.2 and 3.11.4.3).
2.1.5.1.4 Fuzzy Inference Models
Fuzzy set theory represents vague categories such as “high congestion” with degrees of membership rather than hard thresholds (Zadeh, 1965), and fuzzy controllers combine such memberships through linguistic rules (Mamdani & Assilian, 1975).
Ali et al. (2021) and Tunc et al. (2021) applied fuzzy logic to adaptive traffic-signal control, where graded inputs produce smoother responses than fixed thresholds.
SmartFlow NLEX uses a fuzzy inference advisory that grades the urgency of responding to a forecast congestion state (Monitor, Prepare or Act) from its probability and lead time (Section 3.11.4.5).
2.1.5.1.5 TOPSIS and Multi-Criteria Decision Analysis (MCDA)
Many operational decisions balance several criteria. TOPSIS ranks alternatives by their relative closeness to an ideal solution (Hwang & Yoon, 1981) and has been applied widely (Behzadian et al., 2012), including to rank road sections for safety improvement (Fancello et al., 2019).
This ranking methodology evaluates complex interventions based on their simultaneous ability to optimize resource efficiency and minimize negative externalities. Li, X. et al. (2025) emphasize that integrating simulation models with MCDA frameworks like TOPSIS allows policymakers to explicitly evaluate alternative strategies based on their dual ability to mitigate physical congestion and reduce carbon emissions. By systematically scoring each proposed action against these multiple, often conflicting criteria, the algorithm ensures that the most mathematically sound and balanced strategy is surfaced to traffic operators.
SmartFlow NLEX uses TOPSIS to rank event interventions and emission strategies, with weights stated by the proponents (Section 3.11.4.6).
2.1.5.1.6 Heuristic-Based Traffic Strategies
Exact optimization can be computationally demanding for large problems, so heuristics are often used to obtain good solutions quickly (Shaygan et al., 2022).
Chung et al. (2020) evaluated combinations of active traffic management strategies to support real-time decisions.
Heuristic rerouting of emergency vehicles and commuters is a proposed extension for SmartFlow NLEX and is not implemented.
2.1.5.1.7 Sustainability-Aware Traffic Optimization
Sustainability-aware traffic optimization serves as the ultimate prescriptive synthesis of modern intelligent transportation systems. Recognizing the environmental toll of vehicular congestion, researchers explicitly target the reduction of carbon emissions based on dynamic traffic distribution across urban networks. Zhang, S. et al. (2024) demonstrate that investigating the effect of dynamic traffic distribution on network-wide emissions provides empirical evidence that traffic routing directly impacts regional carbon footprints.
Congestion and idling increase emissions, so measures that shorten delays also reduce them (Afrin & Yodo, 2020).
SmartFlow NLEX estimates the CO₂ that shorter lane blockages and faster response in the busiest hours would avoid, compares them with a what-if reduction in the heavy-vehicle share, and identifies where heavy-vehicle time windows or peak toll differentials would apply. Operators evaluate these options; nothing is applied automatically.
2.1.5.1.8 Stochastic Linear Programming (SLP)
Stochastic programming optimizes decisions when some parameters are uncertain by representing them as scenarios with probabilities. In a two-stage model, first-stage decisions are made before the uncertainty is resolved and recourse decisions afterwards, and the value of the stochastic solution measures the benefit of modelling the uncertainty.
Incident clearance time is a natural uncertain parameter for such models, because it varies widely across incidents (Li et al., 2018).
SmartFlow NLEX implements a two-stage stochastic mixed-integer clearance protocol that chooses how many response units to dispatch and when to escalate, using clearance scenarios drawn from the Kaplan–Meier curve (Section 3.11.4.4).








### 2.1.6 Geospatial Analysis and Traffic Visualization
Geospatial analysis serves as the foundational layer of modern transportation decision-intelligence systems, providing the visual framework needed to interpret large volumes of spatio-temporal traffic data. Bachechi et al. (2022) demonstrate that integrating traffic sensor observations into interactive dashboards using heatmaps and color gradients enables operators to efficiently pinpoint congested expressway sections and translate complex spatial data into actionable insights. Li, Z. and Li, D. (2022) further emphasize the integration of WebGIS to allow for dynamic interaction with urban traffic logistics, creating accessible interfaces for continuous infrastructure monitoring.
Berhanu et al. (2023) show that mapping the density of crash locations highlights corridors that need safety interventions. Visual summaries of this kind help operators see where and when congestion and incidents concentrate without reading raw tables.
### 2.1.7 Agent-Based Traffic Simulation
Agent-based models simulate individual travellers or vehicles that follow behavioural rules, so that system-level patterns emerge from their interactions. Bastarianto et al. (2023) review the use of agent-based models in urban transportation and the challenges of calibrating and validating them.
Rundel and De Amicis (2023) coupled the SUMO traffic simulator with a game engine to produce a low-cost digital twin that visualizes simulated traffic, showing how simulation can be made accessible to non-specialists.
Microscopic traffic simulation commonly uses the Intelligent Driver Model for car-following (Treiber et al., 2000) and the MOBIL model for lane changing (Kesting et al., 2007), which together reproduce the formation and spread of congestion from individual driving behaviour. SmartFlow NLEX's Scenario Sandbox implements both models in TypeScript on an HTML5 Canvas, with demand drawn from NLEX toll data, so that operators can see how a lane closure or incident turns into a queue (Section 3.11.5.1).
### 2.1.8 Environmental Impact of Traffic Systems
2.1.8.1 Carbon Emissions and Traffic Congestion
Traffic congestion increases fuel consumption and emissions because of idling and stop-and-go driving (Afrin & Yodo, 2020). Zhang S. et al. (2024) showed that network-wide emissions depend on how traffic is distributed across a network, not only on total volume.
Accurately tracking this pollution requires robust data engineering, as the energy consumption of different travel modes varies significantly based on engine type and load capacity. Failing to segment traffic volume by specific vehicle classes leads to massive underestimations of a corridor's true environmental footprint, necessitating a strict classification-based emission model to compute overall regional degradation accurately.

2.1.8.2 Theoretical Framework: National Emission Inventory Methodology
National greenhouse-gas inventories follow the 2006 IPCC Guidelines. For road transport, the IPCC Tier 1 method estimates CO₂ from the quantity of fuel sold and a default emission factor, while distance-based methods that multiply vehicle-kilometres by emission factors are used at higher tiers and for other gases (Waldron et al., 2006).
The Philippines' plan for implementing its Nationally Determined Contribution sets the country's climate-mitigation roadmap for 2020–2030, including the transport sector (Climate Change Commission & Department of Environment and Natural Resources, 2023).
SmartFlow NLEX does not have fuel-sales data for the corridor, so it uses a distance-based estimate: vehicle-kilometres by class multiplied by fixed per-class CO₂ factors. This makes its results a corridor activity estimate that is consistent in approach with distance-based inventory methods, not a Tier 1 inventory.
2.1.8.3 Baseline Emission Metrics and Vehicle Classification
Emissions differ greatly by vehicle type, so inventories stratify traffic by class. Emission models such as COPERT assign factors by vehicle category and speed (Ntziachristos et al., 2009).
SmartFlow NLEX applies the per-class baseline formula given in Equation 3.9.3.5, using factors of 192, 354 and 1,492 g CO₂/km for Classes 1, 2 and 3.
Applying class-specific factors ensures that heavy vehicles, which are a small share of traffic but a large share of CO₂, are weighted correctly in the corridor total.
2.1.8.4 Operational Efficiency and the Carbon "Idling Penalty"
Distance-only calculations understate the emissions caused by congestion, because vehicles queued behind an incident continue to emit while barely moving (Afrin & Yodo, 2020).
SmartFlow NLEX estimates this excess with a deterministic queueing model: while a lane is blocked for T minutes, arriving vehicles accumulate in a queue whose total delay grows with T², and the delay is multiplied by an idling emission factor (Equation 3.9.3.7). Because the factor is a passenger-car value applied to all classes, the estimate is a lower bound.
Expressing incident delay as excess CO₂ links operational performance to environmental impact and gives operators an additional reason to shorten lane blockages.
2.1.8.5 Emission Factor Sources
Emission factors can be taken from national standards, international emission models or commercial emission-factor databases. Wang et al. (2021) show the value of fusing data from multiple sources for traffic analysis.
SmartFlow NLEX stores its emission factors in a reference table: Class 1 and Class 2 factors from DENR/DOTC standards, and the Class 3 factor cross-checked once against the Climatiq database for heavy diesel trucks. Storing the factors keeps results reproducible and avoids depending on an external service at run time.
If NLEX adopts updated national factors, the reference table can be revised and the inventory recomputed.
### 2.1.9 Model Evaluation and Validation Techniques
2.1.9.1 Forecast Error Metrics (MAE, RMSE, MAPE, WMAPE)
Forecast error metrics quantify the difference between forecasts and observations (Hewamalage et al., 2021). The mean absolute error (MAE) measures the average error magnitude, while the root mean square error (RMSE) squares errors before averaging and so penalizes large errors more. Shang et al. (2022) report both when evaluating incident-duration predictions.
The mean absolute percentage error (MAPE) expresses error relative to actual values but is undefined at zero and unstable for small counts (Kim & Kim, 2016). The weighted MAPE (WMAPE), the ratio of total absolute error to total actual volume, avoids these problems and weights errors by volume (Kolassa & Schütz, 2007).
SmartFlow NLEX ranks regression models by WMAPE and also reports MAPE, RMSE and MAE for daily corridor totals.
2.1.9.2 Scale-Independent Metrics (MASE)
The mean absolute scaled error (MASE) divides a model's error by the in-sample error of a naive forecast, so it is scale-free, defined when values are zero, and comparable across series (Hyndman & Koehler, 2006). A value below 1 indicates that the model beats the naive forecast's in-sample error.
By utilizing this normalized metric, researchers can objectively compare how a unified machine learning architecture performs across completely disparate targets. Hewamalage et al. (2021) establish that scale-independent metrics allow analysts to evaluate multi-variable predictive networks mathematically, ensuring that massive variances in data scale do not skew the overall model evaluation.
SmartFlow NLEX computes MASE with a seasonal-naive (weekly) scale for its volume, CO₂ and incident models, so that targets with different units can be judged on the same basis.
2.1.9.3 Model Selection Criteria (AIC, BIC)
When developing statistical time-series models like ARIMA or SARIMAX, researchers must balance predictive accuracy with model simplicity. Introducing too many exogenous variables into an equation can lead to "overfitting," where the model memorizes historical noise rather than learning true underlying traffic patterns. Deretić et al. (2022) establish that the Akaike Information Criterion (AIC) and the Bayesian Information Criterion (BIC) are employed as rigorous model selection techniques to prevent this mathematical bloat.
To ensure models remain generalizable, both criteria mathematically evaluate the goodness-of-fit of an algorithm while applying a strict penalty for every additional parameter included. The author demonstrates that successfully utilizing SARIMA modeling for traffic forecasting requires minimizing these scores, ensuring that the final architecture remains computationally efficient and highly resilient when exposed to new data.
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
The ultimate validation of a complex, computationally expensive AI architecture (such as an LSTM or XGBoost) is proving that it mathematically outperforms traditional statistical methodologies. Makridakis et al. (2022) establish that in time-series forecasting, complex machine learning models must be strictly benchmarked against established baselines to justify their computational overhead.
If a deep learning algorithm cannot yield a significantly lower Root Mean Square Error (RMSE) or Mean Absolute Percentage Error (MAPE) than a standard statistical model which relies on simpler historical averaging then the advanced AI holds no practical utility. Rigorous benchmarking against these standards ensures that the deployment of complex neural networks is scientifically justified by a definitive, measurable leap in accuracy.
SmartFlow NLEX benchmarks every candidate against seasonal-naive and climatology forecasts. The LSTM models did not beat these baselines and were not adopted, which shows why such benchmarking is necessary.
2.1.9.6 System Performance and Load Stress Validation
Performance testing checks that a system remains responsive under load, including the effect of caching on response times (Kaptosv, 2025).
Jartarghar et al. (2022) compare server-side and client-side rendering in React applications, which affects how quickly pre-rendered content reaches users.
SmartFlow NLEX plans load and stress tests of its API with a scripted load-testing tool against a separate copy of the system (Section 3.13.6).

### 2.1.10 Key Performance Indicators (KPIs) in Traffic Management
2.1.10.1 Volume-to-Capacity (V/C) Ratio
The volume-to-capacity (V/C) ratio compares traffic demand with the capacity of a road section and is a common indicator of how close a section is to breakdown.
Computing V/C requires section flows, passenger-car equivalents and segment capacities.
SmartFlow NLEX does not yet compute V/C, because segment capacities are not in the available data. The fuzzy advisory instead uses forecast congestion-state probabilities. V/C monitoring is a proposed extension.
2.1.10.2 Alert Lead Time and Mean Time to Clear (MTTC)
Incident clearance time is a key measure of incident-management performance, and Islam et al. (2021) model the factors that influence it on freeways.
However, effectively reducing MTTC requires proactive notification systems that dispatch resources before localized congestion compounds. Grigorev et al. (2024) emphasize that maximizing predictive lead time provides traffic operators with the critical buffer window necessary to deploy tow trucks, redirect approaching vehicles, and implement temporary lane management strategies, directly mitigating the severity of secondary crashes.
SmartFlow NLEX reports the mean time to clear (MTTC) by incident type as a baseline (KPI K9). Alert lead time is a proposed KPI, because issued alerts are not yet logged against later conditions.

2.1.10.3 Environmental Metrics (CO₂ per class-km)
Emission KPIs should reflect the different contributions of vehicle classes. Road-transport emission guidance assigns factors by vehicle category (Ntziachristos et al., 2009; Waldron et al., 2006).
Reporting the share of CO₂ that each class contributes, relative to its share of vehicle-kilometres, shows where interventions would have the most effect.
SmartFlow NLEX reports corridor CO₂ intensity (grams per vehicle-kilometre) and the heavy-vehicle shares of vehicle-kilometres and CO₂ (KPI K7). Because its factors are fixed per class, intensity changes only with fleet mix.

2.1.10.4 Forecast Accuracy Metrics (WMAPE, MAPE and MASE)
Forecast accuracy KPIs should be interpretable and robust. Hyndman and Koehler (2006) recommend scaled errors such as MASE over percentage errors when values can be small.
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
To keep LLM answers grounded in reliable data, retrieval-augmented generation supplies retrieved documents to the model (Lewis et al., 2020), and tool use lets a model call external functions or application programming interfaces (APIs) to obtain current values (Schick et al., 2023; Patil et al., 2023).
SmartFlow NLEX's mobile assistant uses a Qwen model with three tools that return current corridor status from the system's API, so every number it reports comes from the system. It does not use retrieval-augmented generation and does not provide forecasts.

2.1.12.2 LLM-Driven Scenario Generation in Simulation Sandboxes
LLMs can also translate natural-language instructions into structured inputs for software, provided that the output is validated against what the software accepts.
Constraining the model to a fixed set of tools or a structured output schema reduces errors in the generated parameters (Patil et al., 2023).
In SmartFlow NLEX's Scenario Sandbox, a GLM model converts an operator's typed command into a structured scenario plan. Every field is validated by the system, and nothing is applied until the operator confirms it (Section 3.11.5.2).

## 2.2 Review of Related Systems and Technologies
This section explores the existing systems, architecture, and tools that implement the proposed decision-intelligence system. The way that many of the integrated technologies, including cloud services and machine learning pipelines, assist in creating an overall efficient means of traffic management, as well as forecasting traffic.
### 2.2.1 Intelligent Transportation Systems and Infrastructure
2.2.1.1 Cloud-Integrated ITS
Intelligent transportation systems increasingly rely on scalable platforms that store and process large volumes of traffic data. Bachechi et al. (2022) describe a big-data platform that integrates traffic sensor data, simulation and visual dashboards for traffic monitoring.
Upon this scalable foundation, integrated architectures further enable the high-speed coordination of sustainable infrastructure. According to Afrin and Yodo (2020), the seamless integration of advanced congestion measures into operational systems is essential for creating sustainable and resilient transportation networks. By gathering and processing traffic information through intelligent techniques, these systems encourage the efficient use of existing road space to regulate vehicular flow and mitigate severe delays.
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
Relational databases with spatial extensions support both analytical queries and geographic operations. PostgreSQL with PostGIS stores geometries such as road segments, jam lines and incident points with spatial indexes (Li & Li, 2022).
SmartFlow NLEX uses PostgreSQL 18 with PostGIS 3.6 on AWS RDS for its warehouse, and Supabase for user authentication.
2.2.8.2 Caching and Precomputation
Analytics dashboards stay responsive by caching frequently requested results and precomputing expensive aggregates instead of recomputing them on every request.
SmartFlow NLEX keeps an in-memory cache of API responses that serves the last result while refreshing it in the background, preloads common responses at start-up, and stores model outputs in the warehouse so that pages read precomputed results.
2.2.8.3 Redis
In-memory data stores such as Redis can reduce database load in high-traffic web applications (Kaptosv, 2025).
An Upstash Redis store was provisioned for SmartFlow NLEX's live map but is not used in the current configuration, because the in-process cache and the database were sufficient.
### 2.2.9 API Integration and External Data Sources
2.2.9.1 Event Data Collection
Event schedules can be collected from venue and ticketing websites. SmartFlow NLEX collected the Philippine Arena event calendar once from the venue's published schedule and updates it manually. An automated scraper is a proposed extension.
2.2.9.2 Weather and Air-Quality Data
Musah et al. (2022) evaluated the accuracy and suitability of the OpenWeatherMap API as an alternative source for weather data by comparing its forecasts against actual measurements recorded by the Brazilian National Institute of Meteorology (INMET) across two cities. The study focused on two key meteorological parameters, temperature and relative humidity, examining both current-day readings and lead-time forecasts spanning one to four days ahead.
Their results inform the use of OpenWeather data. SmartFlow NLEX uses OpenWeather's air-pollution history for measured air quality, while its hourly weather comes from Open-Meteo, ERA5 and JMA archives scored against reference sources.
### 2.2.10 Visualization and System Architecture
2.2.10.1 Proactive Management Visualization
Interactive, spatial visualizations help operators interpret traffic data. Rundel and De Amicis (2023) show how simulated traffic can be visualized in an accessible three-dimensional environment.
Li and Li (2022) built a WebGIS system for urban traffic logistics with interactive maps and data visualization.
SmartFlow NLEX uses interactive charts, heatmaps and a live corridor map so that operators can see where and when congestion and incidents occur.
2.2.10.1.1 Next.js
Jartarghar et al. (2022) compare server-side and client-side rendering in Next.js and React applications.
SmartFlow NLEX uses Next.js 15 with React 19 as a static export, which pre-builds the pages and lets them run inside the Electron desktop application without a web server.

2.2.10.1.2 Typescript
According to Nguyen (2022), TypeScript is a strongly typed superset of JavaScript that improves web application reliability through Static Type Checking. This allows developers to catch logic errors, such as type mismatches, during development rather than at runtime. The author further notes that the use of Interfaces ensures that data structures such as those from a PostgreSQL database remain consistent as they flow through the application. This architectural strictness minimizes crashes when handling complex JSON objects, ensuring a stable and professional user interface under real-time operational pressure. By enforcing strict type definitions, the system safely processes massive multisource data streams, such as toll logs and coordinates, without risking interface crashes. This supports the "Decision-Intelligence" goal by guaranteeing that corridor analytics are based on stable, correctly-mapped data, providing a resilient tool for mission-critical expressway operations.
By enforcing strict type definitions across the codebase, the system will safely process massive multisource data streams, such as toll logs and coordinates, without risking runtime interface crashes. This architectural strictness heavily supports the "Decision-Intelligence" goal by guaranteeing that corridor analytics are based on stable, correctly-mapped data structures.

2.2.10.1.3 Apache Echarts
According to Yu and Yang (2024), Apache ECharts is a browser-based visualization library that aggregates diverse and imperfect data into clear charts and is used in applications such as smart-city displays and rail-transit monitoring.
By providing a clear solution for raw data aggregation and display, ECharts will enable the transformation of the system's raw backend data into actionable insights for the end user. This literature confirms that ECharts possesses the necessary technical robustness to render the complex time-series graphs and emission trends required by the decision-intelligence dashboard.
2.2.10.1.4 Mapbox
A key component of the platform, Mapbox GL JS, has been the subject of numerous performance studies. Zunino et al. (2020) conducted a comparative analysis of three widely used JavaScript web mapping libraries Leaflet, Mapbox GL JS, and OpenLayers using Argentina's Life Quality Index as a case study. Their findings revealed that Mapbox GL JS achieved the best overall performance on mid- and high-end devices when displaying raster or vector maps. This performance advantage was attributed to Mapbox GL JS's use of WebGL-based hardware acceleration, which enables efficient rendering even for data-heavy applications.
SmartFlow NLEX uses Mapbox GL JS to render the corridor, live Waze jams and alerts, forecast congestion states and maintenance closures.
2.2.10.1.5 Github
Version control records every change to a codebase and supports collaboration among developers.
The SmartFlow NLEX team uses Git and GitHub, with personal feature branches and backup branches created before each merge.
2.2.10.1.6 Figma
Du et al. (2025) argued that the development of multi-user collaborative interfaces requires a design methodology that is both task- and role-oriented to maintain operational consistency across shared workspaces. Their research emphasized that activities and identities of different users should have uniform visual indicators, ensuring that collaborators remain synchronized while performing distinct functional duties within the same environment.
By adopting a role-oriented design method, it will ensure that the dashboard provides a seamless transition between high-level traffic analytics and specific incident management tasks.
2.2.10.1.7 Electron
Kosasih W and Engel (2026) compare Electron with Tauri for cross-platform desktop applications; Electron bundles the Chromium engine and Node.js runtime to run web technologies as a desktop application.
SmartFlow NLEX packages its dashboard with Electron as a Windows desktop application that serves the static Next.js build locally and connects to the SmartFlow NLEX API.
2.2.10.2 End-to-End Pipeline Design
Data pipelines need monitoring so that failures and stale data are detected before they affect decisions.
Common practices include logging each load, checking the freshness of live feeds and recording the outputs that were served.
SmartFlow NLEX logs uploads and retraining runs, flags live data older than 30 minutes, and logs served congestion forecasts for later scoring.
2.2.10.2.1 PostGIS
Li and Li (2022) chose PostGIS as the spatial database of their WebGIS traffic-logistics system because it stores and queries large geospatial datasets efficiently.
In SmartFlow NLEX, PostGIS stores corridor segments, Waze jam lines and alert points with spatial indexes, which the live map queries by distance from the corridor.
### 2.2.11 Mobile Application Development Frameworks
According to Nguyen (2025), the evolution of mobile development has shifted toward frameworks that balance high-performance native rendering with developer efficiency. The study highlights React Native as a premier choice for cross-platform development due to its ability to translate JavaScript components into native UI elements. However, to manage the complexity of modern app deployment, Nguyen (2025) emphasizes the role of the Expo ecosystem and Expo Application Services (EAS). These tools provide a managed infrastructure that automates the "heavy lifting" of mobile development, such as credential management and build optimization. By utilizing Expo on top of React Native, developers can maintain a unified codebase while ensuring the application remains scalable and responsive across different operating systems.
SmartFlow NLEX's mobile application is built with Expo and React Native from a single codebase for Android and iOS. It currently runs as development builds; store release through Expo Application Services is planned.
## 2.3 Synthesis
The literature reviewed in Section 2.1 shows that expressway management benefits from moving from reactive observation toward anticipation. Prior studies have established the value of combining multiple data sources (Wang et al., 2021; Leinonen et al., 2025), the usefulness and limits of crowdsourced Waze data (Amin-Naseri et al., 2018; Hoseinzadeh et al., 2020), the effects of rainfall and planned events on traffic (Mejia & Sigua, 2018; Giuliano & Lu, 2021), and a broad set of forecasting methods. Benchmark studies, however, warn that complex models do not reliably outperform simpler ones (Makridakis et al., 2018, 2020), and prescriptive studies tend to address one decision at a time, such as signal control, patrol location or incident duration.
Section 2.2 shows that the technologies for such a system are mature and accessible: layered warehouses with spatial databases, Python forecasting libraries, optimization solvers, microscopic traffic simulation with IDM and MOBIL, web dashboards and cross-platform mobile frameworks, and language models that can be grounded through tool use. In the Philippine context, published NLEX studies have examined electronic toll collection (Gugol et al., 2013), time-series traffic density (Maravilla et al., 2011), rainfall effects on traffic flow (Mejia & Sigua, 2018) and overloaded trucks (Gernale & Juanico, 2023). Each of these addresses a single aspect of the corridor.

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
Comparing the current business process to the proposed business process identifies many opportunities the project aims to improve. The existing business process may be optimized, meaning the comparison will provide a baseline for the path to the project goals the group hopes to achieve. It allows the proponents to justify their technology implementations to support solutions for the operational bottlenecks identified within the organization.
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
Figure 3.2.1.1.2.4 shows the Maintenance and Live Map features. In the Maintenance feature, an authorized user views the schedule table, enters a road-work schedule by exit, direction and official kilometre posts, and confirms it. The system validates and stores the schedule, the mobile application retrieves it and shows it to commuters as a notice. The Live Map (labelled Map Comparison in the design figure) overlays live Waze jams and alerts from the last 60 minutes, the forecast congestion state for a chosen hour up to seven days ahead, and active maintenance closures on one corridor map.


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
In the Extract Layer, historical data were loaded in batches. The 2022–2025 toll and Waze archives and the weather history were loaded by one-off scripts. New NLEX exports are loaded through the dashboard's Data Management upload, which parses the file and runs the validation gates. The live Waze feed is polled about every two minutes by a separate ingestion process and written directly to the database. Redis (Upstash) was provisioned as an optional cache for the live map but holds no data in the current configuration. The live map instead reads PostgreSQL through a 30-second in-memory cache, so the Redis streaming buffer shown in the design figure is not part of the implemented pipeline.
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
| Extract | Scheduled Python batch plus Redis real-time streaming; Gates 1–2 | One-off batch loads; dashboard file upload; live Waze polled about every 2 minutes into PostgreSQL | Partial: Redis provisioned but unused |
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
For data access and caching, the API keeps an in-memory cache of route responses with stale-while-revalidate behaviour and preloads frequently used responses at start-up. Live Waze data are written to PostgreSQL by a polling process about every two minutes. An Upstash Redis store was provisioned for an optional live-map cache but is not used in the current configuration.
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
| Usability | Operators and commuters participating in user-acceptance testing shall achieve a mean System Usability Scale (SUS) score of at least 68, and all interface text shall meet a contrast ratio of at least 3:1. |

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
| Formula | MTTCₖ = (1/\|Iₖ\|) Σ Tᵢ over incidents of type k with valid timestamps, where Tᵢ = site-cleared time − event start; reported with the median, 90th percentile and coverage \|Iₖ\| / \|Iₖ\|. Lane-blockage duration is reported separately. |
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
| Leading / Lagging | Leading (adoption and readiness indicator) |
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
| K11 Sandbox run time | SO1 | Wall-clock seconds per scenario comparison at stated settings | s | ≤ 120 s (design) | Leading |
| K12 Recommendation acceptance | SO1, SO2 | Accepted ÷ all presented recommendations in UAT | % | ≥ 90% (design) | Leading |
| K13 API latency | SO2 (NFR) | 95th-percentile response time at stated concurrency | s | < 3 s cached (design) | Lagging |
| K14 Usability | SO2 | Mean System Usability Scale score from UAT participants | score 0–100 | ≥ 68 (Bangor et al., 2008) | Lagging |


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
Internal data were provided by NLEX Corporation as data exports. The traffic data are hourly toll transactions per plaza, direction (northbound or southbound), entry or exit, and vehicle class (Class 1, 2 or 3) for 19 toll plazas from 1 January 2022 to 30 June 2026 (1,642 days, with no missing days). Average daily traffic and all other volume measures are derived from them. The incident data comprise the accident event export (start, lane-blockage-cleared and site-cleared times, kilometre post and cause), the breakdown event export (vehicle class, cause and response deployments), and road and motorcycle crash reports (date, hour, kilometre post, cause, type, weather and casualties). Records dated 2020–2021 in some incident tables come from files labelled synthetic and are excluded from the analyses. The Apprehension and Undercap table described in the design was not loaded into the warehouse.

External data comprise the Waze for Cities (Partner Hub) feed and contextual sources. The Waze data consist of an hourly historical archive of jams and irregularities from January 2022 to 18 April 2026, filtered from the raw Waze dumps to the corridor, and a live feed of jams and alerts polled about every two minutes since 4 August 2026. Weather is a historical hourly dataset for about 20 locations along the corridor from 2020 to October 2026, combining Open-Meteo, ERA5 and JMA data scored against NASA POWER and NOAA. Historical air quality comes from the OpenWeather Air Pollution service. Event data come from the Philippine Arena calendar, collected once from the venue's published schedule (155 events, 145 after removing duplicates). Holidays come from the Philippine holiday calendar. Community reports from the mobile application are stored separately in Supabase and are not part of the analytics data. Table 3.9.1 summarizes the sources.
Table 3.9.1 Data Sources of SmartFlow NLEX
| Source | Provider | Coverage | Granularity | Refresh | Status |
| --- | --- | --- | --- | --- | --- |
| Toll transactions (traffic volume) | NLEX Corporation | 1 Jan 2022 – 30 Jun 2026; 19 plazas | Hourly × plaza × direction × entry/exit × Class 1–3 | Batch load (2022–2025); dashboard upload (2026) | In use |
| Accident events | NLEX Corporation | 1 Jan 2022 – 30 Jun 2026 | Event (start, blockage-cleared, site-cleared, km post) | Dashboard upload | In use |
| Breakdown events and stalled vehicles | NLEX Corporation | 1 Jan 2022 – 30 Jun 2026 | Event (class, cause, deployments) | Dashboard upload | In use (contains personal fields) |
| Road and motorcycle crash reports | NLEX Corporation | 2022 – Jun 2026 (2020–2021 rows excluded) | Event (date, hour, km post, cause, casualties) | Dashboard upload | In use |
| Live Waze jams and alerts | Waze for Cities (Partner Hub) | 4 Aug 2026 – present | Poll about every 2 min; jam lines and alert points | Continuous polling | In use |
| Historical Waze | Waze raw archive filtered to the corridor | Jan 2022 – 18 Apr 2026 | Hourly × exit | One-off batch | In use (gap 19 Apr – 3 Aug 2026) |
| Weather | Open-Meteo, ERA5, JMA | 2020 – 3 Oct 2026; about 20 locations | Hourly (temperature, rain, wind, humidity, pressure) | One-off load; Open-Meteo forecast for future rain | In use |
| Air quality | OpenWeather Air Pollution | 27 Nov 2020 – 2 Aug 2026; 20 exits | Hourly (AQI, CO, NO₂, O₃, SO₂, PM2.5, PM10) | One-off load | In use (measured AQI) |
| Emission factors | DENR/DOTC standards; Class 3 cross-checked with Climatiq | Static | Per vehicle class (g/km) | Static | In use |
| Events | Philippine Arena calendar | Dec 2020 – Dec 2027 | Event-day, venue, category | Manual | In use |
| Holidays | Philippine holiday calendar and proclamations | 2020 – 2026 | Day | Seed script | In use |
| Corridor geometry | Derived from exit coordinates and official km posts | Km 12 – Km 87; 19 segments (≈ 76 km) | Segment | Manual | In use |
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
⟦EQ⟧ADT_(e,c,g)=1/N_e ∑_(d∈D_e)▒V_(e,c,g,d)    (3.9.3.1)⟦/EQ⟧
where Vₑ,c,g,d is the number of class-c vehicles entering plaza e in direction g on day d, Dₑ is the set of days with valid data for plaza e, and Nₑ is the number of those days. The values are toll-plaza entries, not cross-section counts. The total ADT of a plaza sums the three classes, and the total plaza entries per direction sum all plazas:
⟦EQ⟧ADT_(e,g)=∑_(c=1)^3▒ADT_(e,c,g)    (3.9.3.2)⟦/EQ⟧
⟦EQ⟧V_(corr,g)=∑_(e∈E_g)▒ADT_(e,g)    (3.9.3.3)⟦/EQ⟧
where E_g is the set of plazas recorded for direction g. Plazas whose records carry no direction are summed separately, so the total of northbound and southbound entries does not equal all entries. Holiday and event effects are measured as the percentage deviation of a day's volume from a local control-day baseline:
⟦EQ⟧Δ_d=(V_d-V ̅_d^base)/(V ̅_d^base )×100%    (3.9.3.4)⟦/EQ⟧
where V̅_d^base is the mean volume of the same weekday within ±45 days of day d, excluding holidays and event days, with at least four such days required. The design also specified an exit traffic share and a Volume Deviation Index (a z-score against the full-period mean). These were implemented only in a prototype pipeline run on generated data. The local baseline in Equation 3.9.3.4 replaced them because a full-period mean includes future data and ignores weekly seasonality.


d.) Emission Features
Emission variables estimate the CO₂ released on the corridor. Baseline emissions are calculated from vehicle-kilometres and fixed per-class emission factors:
⟦EQ⟧E^base=∑_e▒∑_h▒∑_g▒∑_(c=1)^3▒N_(e,h,g,c) L_e F_c×10^(-6)    (3.9.3.5)⟦/EQ⟧
where Nₑ,h,g,c is the number of class-c vehicles counted at plaza e in hour h and direction g, Lₑ is the length of corridor allotted to plaza e (half the distance to each neighbouring exit, totalling about 85 km), F_c is the CO₂ emission factor of class c (192, 354 and 1,492 g/km for Classes 1, 2 and 3, from DENR/DOTC standards, with the Class 3 value cross-checked against Climatiq), and 10⁻⁶ converts grams to tonnes. The factors are stored in the warehouse and are not retrieved from an API at run time. The estimate has no speed term and uses the allotted segment length as a proxy for trip length. PM2.5 and NO₂ are estimated in the same way with their own factors.
The additional CO₂ emitted by vehicles queued behind a lane-blocking accident i is estimated from the lane-blockage duration:
⟦EQ⟧T_i=t_i^cleared-t_i^start    (3.9.3.6)⟦/EQ⟧
⟦EQ⟧E_i^idle=φ⋅λ_i/60⋅(T_i^2)/2    (3.9.3.7)⟦/EQ⟧
where tᵢ^cleared is the time the blocked lane was cleared, tᵢ^start the event start time (0 < Tᵢ ≤ 1,440 minutes), λᵢ the mean hourly vehicle flow on the affected segment and direction at the start hour, and φ = 0.0192 kg CO₂ per vehicle-minute an idling factor derived from a passenger-car emission factor. The term λᵢTᵢ²/120 is the total vehicle-minutes of delay in a deterministic queue that builds while the lane is blocked (D/D/1 triangle). Because φ is a passenger-car value applied to all classes and the queue is assumed to discharge instantly, the result is a lower bound. Delay-induced CO₂ is reported as a KPI and is not used as an input feature of the forecasting models.

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
| Descriptive | Exposure-normalized wet-vs-dry crash rate ratio | Analytical technique | Implemented | Incidents – Descriptive |
| Descriptive | Clearance-time summary and Kaplan–Meier estimator | Statistical estimator | Implemented | Incidents – Descriptive, Prescriptive |
| Descriptive | Emission inventory and fleet mix | Deterministic accounting model | Implemented | Emissions – Descriptive |
| Descriptive | STL/MSTL decomposition; ACF/PACF; GMM regimes; Underwood speed–flow fit; KDE/NKDE; Getis-Ord Gi*; log-normal fit; Volume Deviation Index; V/C ratio | Techniques / statistical models | Proposed | — |
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
The descriptive tier uses the hourly toll fact (19 plazas, January 2022 to June 2026), the NLEX accident, breakdown and crash event tables, the historical and live Waze jam and alert facts, hourly weather, the holiday and event calendars, and the emission inventory (Section 3.9). Analyses default to the most recent twelve months of the record and can be set to any range within it.
3.11.1.2 Volume Aggregation and Temporal Profiles
Purpose: to show how much traffic the corridor carries and when demand peaks. Inputs: hourly entries by plaza, direction and class. Procedure: hourly counts are summed to daily and monthly totals by direction, averaged by hour of day and day of week, and ranked by plaza; each figure is compared with the preceding period of equal length. Output: volume trend charts, an hour-by-weekday heatmap, plaza rankings and average daily traffic by class (Equation 3.9.3.1). Interpretation: recurring peaks identify when staffing and patrol coverage are most needed. Feature: Traffic – Descriptive and Overview.
3.11.1.3 Holiday and Event Impact by Local Control-Day Comparison
Purpose: to measure how holidays and Philippine Arena events change traffic. Inputs: daily entries at the relevant plaza, the holiday and event calendars. Formulation: the percentage deviation of the day's volume from the mean of comparable control days (Equation 3.9.3.4). Control days are the same weekday within ±45 days, excluding holidays and other event days, with at least four required. Days with several events are merged into one record. Output: a deviation per holiday or event and its average by year. Interpretation: a positive deviation indicates added demand. A local baseline is used because a global average would mix pandemic-period traffic into every comparison. The control-day design follows Giuliano and Lu (2021). Feature: Traffic – Descriptive (event and holiday panels).
3.11.1.4 Incident Frequency, Severity and Spatial Concentration
Purpose: to identify when and where incidents occur. Inputs: accident and breakdown events and crash reports with kilometre posts, causes and casualty counts. Procedure: incidents are counted by day, hour and weekday, type and cause; injuries and fatalities are summed; and incidents are counted in five-kilometre bins of official kilometre posts to rank segments. Output: incident trends, an hour-by-weekday heatmap, cause and type breakdowns and a ranked list of high-incident segments. Interpretation: segments and hours with persistently high counts are candidates for patrol positioning. Feature: Incidents – Descriptive.
3.11.1.5 Weather-Stratified Crash Rate
Purpose: to compare crash risk in wet and dry conditions. Inputs: crash counts and hourly rainfall. An hour is wet when the mean corridor rainfall exceeds 0.3 mm. Formulation:
⟦EQ⟧RR=(n_wet/H_wet)/(n_dry/H_dry)    (3.11.1.1)⟦/EQ⟧
where n is the number of crashes and H the number of hours in each condition. Output: the crash rate per day in wet and dry hours and their ratio. Interpretation: a ratio above 1 indicates a higher crash rate per hour of exposure in wet conditions. The ratio is not adjusted for traffic volume and is reported without a confidence interval (Romanowska & Budzyński, 2022). Feature: Incidents – Descriptive (Crash Rate in Rain).
3.11.1.6 Clearance-Time Summary and Kaplan–Meier Estimation
Purpose: to describe how long incidents take to clear. Inputs: event start, lane-blockage-cleared and site-cleared times. Procedure: durations outside 0 to 1,440 minutes are excluded. The mean time to clear (MTTC), median and 90th percentile are reported with the share of records that have valid timestamps. The survival function is estimated with the Kaplan–Meier estimator, with durations above 24 hours treated as censored:
⟦EQ⟧S ̂(t)=∏_(t_i≤t)▒(1-d_i/n_i )    (3.11.1.2)⟦/EQ⟧
where dᵢ is the number of incidents cleared at time tᵢ and nᵢ the number still uncleared just before tᵢ. Output: MTTC by incident type and survival curves. Interpretation: the curve gives the probability that an incident is still uncleared after t minutes and supplies the clearance scenarios used in the prescriptive clearance protocol (Kaplan & Meier, 1958). Feature: Incidents – Descriptive and Prescriptive.
3.11.1.7 Emission Inventory and Fleet Mix
Purpose: to estimate the corridor's emissions and the contribution of each vehicle class. Inputs: hourly counts by class, allotted segment lengths and the emission factors. Formulation: Equations 3.9.3.5 to 3.9.3.7. Output: CO₂, PM2.5 and NO₂ by day, exit and class, each class's share of vehicle-kilometres and of CO₂, and delay-induced CO₂. Interpretation: because the factors are fixed per class, changes in the estimate reflect changes in volume and fleet mix, not in driving speed. Feature: Emissions – Descriptive.
3.11.1.8 Live Corridor Status
Purpose: to show current conditions. Inputs: Waze jams and alerts from the last 60 minutes. Procedure: jams and alerts within the corridor tolerance are assigned to the nearest exit and summarized by jam level, speed and alert type; the congestion index is the mean Waze jam level (0 to 5). Output: status by exit on the Overview and the Live Map. Feature: Overview, Live Map and the mobile Dashboard.
3.11.1.9 Proposed Descriptive Methods
The design also specified several descriptive methods that were not implemented in the current version. They remain relevant to the research problem and are retained as proposed extensions:
STL/MSTL decomposition and rolling means to separate trend, weekly and annual seasonality and irregular variation in daily volume (Hyndman & Athanasopoulos, 2021). The champion volume model currently captures these components within its own structure (Section 3.11.2.2).
ACF and PACF analysis to identify candidate autoregressive orders. The current SARIMAX specification uses fixed orders with a weekly period.
Gaussian mixture models to identify traffic regimes from speed–flow data. Congestion states are currently defined by Waze jam-speed thresholds of 10 and 20 km/h.
Underwood speed–flow (fundamental diagram) fitting to estimate free-flow speed and capacity by segment (Mejia & Sigua, 2018). The sandbox currently uses the free-flow speeds that Mejia and Sigua reported for rain conditions as fixed parameters.
*Kernel density estimation, network-constrained KDE and the Getis-Ord Gi statistic** to test whether incident concentrations are statistically significant (Berhanu et al., 2023; Alam & Tabassum, 2023). Segments are currently ranked by counts.
Log-normal fitting of clearance times, the Volume Deviation Index with a two-sigma rule, and the volume-to-capacity ratio (which requires section flows, passenger-car equivalents and segment capacities that are not in the record).
### 3.11.2 Predictive Analysis
The predictive tier forecasts traffic volume, congestion state, event uplift, incidents, clearance time, emissions and fleet mix. For each task, several candidate models are trained and compared against naive baselines on chronologically held-out data, and only a model that beats the baselines is published. The models are trained offline in Python. Their forecasts and held-out metrics are stored in gold tables and read by the dashboard and the mobile application.
3.11.2.1 Data Overview and Validation Design
Volume, CO₂ and fleet-mix models are trained on daily series from 1 January 2022 to 30 June 2026 (1,642 days). They are evaluated by rolling-origin (walk-forward) validation, in which the model is refitted at successive forecast origins and scored on the following 7 or 14 days, so that every test day lies after its training data. Two evaluation windows are reported: the last 20% of the record (“80/20”, 294 days from 10 September 2025) and the last 10% (“90/10”, 140 days). Each candidate is compared with two baselines: a seasonal-naive forecast that repeats the value of the same weekday one week earlier, and a climatology forecast (the average for that day of the year). The congestion classifier is trained on the live Waze feed and tested on the most recent days. The incident models use a chronological holdout of the last 90 days, and the severity models the last 20% of events.
3.11.2.2 Daily Corridor Volume Forecasting
Purpose: to forecast total daily entries on the corridor for staffing and resource planning. Inputs: the daily volume series and weather variables; for future days the weather is the training-period climatology, which prevents future observed weather from entering the forecast. Candidate models: Prophet (Taylor & Letham, 2018), additive Holt-Winters exponential smoothing with a seven-day season, Holt's linear trend, SARIMAX(1,1,1)(1,1,1)₇ with weather regressors (Hyndman & Athanasopoulos, 2021), and a two-layer LSTM (64 and 32 units, 30-day input), each with and without weather. Prophet models the series as a sum of components:
⟦EQ⟧y(t)=g(t)+s(t)+β^⊤ x_t+ε_t    (3.11.2.1)⟦/EQ⟧
where g(t) is a piecewise-linear trend with automatically detected changepoints, s(t) the weekly and yearly seasonality expressed as Fourier series, xₜ the weather regressors and εₜ the error. No holiday or event regressor is used in the volume model. The additive Holt-Winters forecast is:
⟦EQ⟧ŷ_(t+h)=ℓ_t+h b_t+s_(t+h-m(k+1))    (3.11.2.2)⟦/EQ⟧
where ŷₜ₊ₕ is the forecast made at time t for h days ahead, with level ℓₜ, trend bₜ, seasonal component s with period m = 7 and k the integer part of (h − 1)/m. Selection: the candidate with the lowest WMAPE is published if it beats the best baseline on WMAPE and has a MASE below 1 (Section 3.11.3). Output: the daily forecast with the evaluation metrics of every candidate. Forecasts are validated up to 14 days ahead; days beyond this are shown as unvalidated. Feature: Traffic – Predictive, booth staffing and the sandbox demand profile.
3.11.2.3 Congestion-State Classification
Purpose: to forecast whether each exit will be in a low, medium or high congestion state h hours ahead (h = 1 to 168). Target: the state at hour t + h, defined by Waze jam speed (above 20 km/h low, 10 to 20 km/h medium, below 10 km/h high). Inputs: exit, hour, weekday, lagged states and speeds at 1, 2, 3, 6, 24 and 48 hours, 6- and 24-hour rolling means, neighbouring-exit lags, the exit-by-hour historical profile computed from the training period only, and the horizon. Model: an XGBoost classifier (Chen & Guestrin, 2016) with 400 trees, depth 6 and learning rate 0.08, whose probabilities are calibrated by isotonic regression. XGBoost minimizes a regularized loss:
⟦EQ⟧ℒ=∑_i▒l(y_i,ŷ_i )+∑_k▒Ω(f_k ),  Ω(f)=γT+1/2 λ‖w‖^2    (3.11.2.3)⟦/EQ⟧
where l is the multi-class log loss, fₖ the k-th tree, T its number of leaves and w its leaf weights. A random forest and a GRU network are trained as comparators. Persistence, the majority class and the exit-by-hour profile serve as baselines. Training rows whose target time falls after the training cut-off are dropped to prevent leakage. Output: the probability of each state by exit and hour. A cell is shown as congested when the combined probability of the medium and high states is at least 0.5. The model is retrained every hour. Feature: Live Map forecast, Traffic – Predictive, the fuzzy advisory and the mobile Corridor forecast.
3.11.2.4 Event-Day Uplift Estimation
Purpose: to estimate how much a Philippine Arena event raises traffic at each exit. Inputs: the event calendar, the holiday calendar and daily plaza volumes. Procedure: for every event day, the ratio of each exit's volume to its typical volume for the same weekday and month is computed. The median ratio across events is the exit's uplift, and a bootstrap 95% confidence interval is attached. Holidays are treated as a separate regime, and an uplift is considered material only when its interval lies above 1. Event days must come from the calendar. Selecting them by high volume would make the estimate circular. Output: uplift and expected additional vehicles by exit for upcoming events. Feature: Traffic – Predictive and the TOPSIS event ranking.
3.11.2.5 Incident Count Forecasting
Purpose: to forecast daily accident and breakdown counts. Inputs: lagged counts (1, 7, 14 and 364 days), rolling means, calendar and holiday flags, rainfall and log traffic volume. Model: a negative binomial generalized linear model, which allows the variance to exceed the mean (Lord & Mannering, 2010):
⟦EQ⟧log μ_t=β_0+β^⊤ x_t,  Var(y_t )=μ_t+αμ_t^2    (3.11.2.4)⟦/EQ⟧
Poisson regression, random forest, XGBoost, SARIMAX, LSTM and GRU models are trained as comparators. The champion is the model with the highest R² among those with MASE at or below 1 against the seven-day naive forecast. In the holdout, same-day rainfall and volume are observed values, so the holdout error is optimistic relative to true forecasting. Output: daily incident forecasts and per-exit and per-segment expected incidents, which weight the patrol positioning model. Feature: Incidents – Predictive and Prescriptive.
3.11.2.6 Incident Severity and Secondary-Incident Risk
Purpose: to estimate the likely severity of an accident and the risk of a secondary incident. Model: an ordinal logistic regression for the ordered classes property damage only, injury and fatal:
⟦EQ⟧logit P(Y≤k|x)=θ_k-β^⊤ x    (3.11.2.5)⟦/EQ⟧
and an XGBoost classifier as comparator. Both are compared with the majority-class baseline, and injury counts are excluded from the features to avoid target leakage. Secondary-incident risk is estimated by a ridge-penalized logistic regression on a label that marks incidents occurring within 2 km upstream and 30 minutes of an active incident. Feature: Incidents – Predictive.
3.11.2.7 Clearance-Time Modelling
Purpose: to estimate how long an accident will take to clear. Model: a Cox proportional hazards model with a penalty of 0.1:
⟦EQ⟧h(t|x)=h_0 (t) exp(β^⊤ x)    (3.11.2.6)⟦/EQ⟧
where h₀(t) is the baseline hazard and exp(β) the hazard ratios of the covariates (Cox, 1972; Nam & Mannering, 2000). Discrimination is measured by the concordance index. The dashboard's survival curves use the empirical Kaplan–Meier estimator (Equation 3.11.1.2), and the model currently treats all records as uncensored. Feature: Incidents – Predictive.
3.11.2.8 Spatial Incident Models
Purpose: to capture how the relationships between incidents and their predictors vary along the corridor. Model: a Poisson geographically weighted regression across the 20 exits with a fixed bandwidth, in which the coefficients vary with location:
⟦EQ⟧log μ_i=β_0 (u_i,v_i )+∑_k▒β_k (u_i,v_i ) x_ik    (3.11.2.7)⟦/EQ⟧
where (uᵢ, vᵢ) are the coordinates of exit i. A spatial LSTM that adds the lagged counts of the two nearest exits is trained for exit-day incident counts. Both are evaluated against per-exit mean baselines. With only 20 locations, the GWR coefficients are interpreted descriptively. Feature: Incidents – Predictive (spatial risk).
3.11.2.9 Corridor CO₂ Forecasting
Purpose: to forecast daily corridor CO₂ for the next one to seven days. Model: gradient boosting regression (300 trees, depth 3, learning rate 0.05) on weekday, month, lags of up to 28 days, rolling means, rainfall and temperature climatology and holiday flags known in advance. The model builds an additive ensemble of trees:
⟦EQ⟧F_m (x)=F_(m-1) (x)+ν h_m (x)    (3.11.2.8)⟦/EQ⟧
where hₘ is the m-th tree fitted to the residuals and ν the learning rate. Polynomial ridge regression, an LSTM and a volume-derived forecast (forecast volume multiplied by CO₂ per vehicle) are comparators, scored by the same day-by-day projection used to serve the forecast. Because the CO₂ inventory is calculated from volume, this is a forecast of the inventory, not of measured emissions. Feature: Emissions – Predictive.
3.11.2.10 Fleet-Mix Forecasting
Purpose: to forecast the daily shares of Class 1, 2 and 3 vehicles, which must sum to one. Model: Dirichlet regression estimated by maximum likelihood, in which the shares follow a Dirichlet distribution whose parameters depend on the covariates:
⟦EQ⟧(p_1,p_2,p_3 )∼Dir(α_1,α_2,α_3 ),  log α_c=x^⊤ β_c    (3.11.2.9)⟦/EQ⟧
XGBoost, Prophet and a multivariate LSTM in centred log-ratio space are comparators, and acceptance uses the Aitchison distance against the persistence and climatology baselines. Feature: Emissions – Predictive and the sandbox vehicle mix.
3.11.2.11 Methods Evaluated but Not Adopted, and Proposed Methods
Several methods in the design were either evaluated and rejected or not implemented. LSTM networks were trained for volume and CO₂ but did not beat the baselines and are retained only as comparators. SARIMAX with weather was rejected for volume, and weather regressors added little accuracy once future weather was replaced by climatology. The following remain proposed: an XGBoost volume model with event and weather features; a true quantile regression forest for prediction intervals (the current random forest comparator is a standard classifier); GRU models trained separately on wet and dry speed sequences; a bidirectional LSTM with attention for travel time; multiple linear regression for emissions; and forecast combination (ensembles), which was not adopted because no combination was tested against the single champions.
### 3.11.3 Training and Testing of Models
All models are trained and tested chronologically. Randomized k-fold cross-validation is not used because it would let models learn from observations that occur after the test days. Scalers and historical profiles are fitted on training data only, lag features never cross the training cut-off, and future exogenous values are replaced by information available at the forecast origin. Forecast accuracy is measured with the metrics below, where yₜ is the observed value, ŷₜ the forecast and n the number of test points.
3.11.3.1 Mean Absolute Percentage Error (MAPE)
⟦EQ⟧MAPE=100%/n ∑_(t=1)^n▒|(y_t-ŷ_t)/y_t |    (3.11.3.1)⟦/EQ⟧
MAPE is easy to communicate but undefined when yₜ = 0 and unstable for small counts, so it is reported only for daily corridor totals.
3.11.3.2 Weighted Mean Absolute Percentage Error (WMAPE)
⟦EQ⟧WMAPE=(∑_(t=1)^n▒|y_t-ŷ_t |)/(∑_(t=1)^n▒|y_t | )×100%    (3.11.3.2)⟦/EQ⟧
WMAPE weights errors by actual volume, remains defined when individual values are zero, and is the primary ranking metric for regression tasks (Makridakis et al., 2022).
3.11.3.3 Root Mean Square Error (RMSE) and Mean Absolute Error (MAE)
⟦EQ⟧RMSE=√(1/n ∑_(t=1)^n▒(y_t-ŷ_t )^2 )    (3.11.3.3)⟦/EQ⟧
⟦EQ⟧MAE=1/n ∑_(t=1)^n▒|y_t-ŷ_t |    (3.11.3.4)⟦/EQ⟧
Both are in the units of the target. RMSE penalizes large errors more heavily and equals the standard deviation of the errors only when their mean is zero (Hewamalage et al., 2021).
3.11.3.4 Mean Absolute Scaled Error (MASE)
⟦EQ⟧MASE=(1/J ∑_(j=1)^J▒|y_(T+j)-ŷ_(T+j) |)/(1/(T-m) ∑_(t=m+1)^T▒|y_t-y_(t-m) | )    (3.11.3.5)⟦/EQ⟧
where J is the number of test points, T the number of training points and m the seasonal period (m = 7 for daily series). The denominator is the in-sample error of the seasonal-naive forecast, so MASE is scale-free and comparable across targets (Hyndman & Koehler, 2006). A value below 1 means the model's test error is smaller than the seasonal-naive error on the training data.
3.11.3.5 Classification and Survival Metrics
Classifiers are evaluated by accuracy, macro-averaged F1, the multi-class Brier score and the skill score against a reference model:
⟦EQ⟧SS=(acc-acc_ref)/(1-acc_ref )    (3.11.3.6)⟦/EQ⟧
where acc_ref is the accuracy of the best baseline (for congestion, the exit-by-hour profile), so SS > 0 means the model adds information beyond the historical pattern. Severity models are also compared with the majority-class rate. Survival models are evaluated by the concordance index, the probability that, of two incidents, the one predicted to clear sooner actually does. Information criteria (AIC and BIC) are recorded for the statistical volume models but are not used for selection, because they are not comparable across model families.
3.11.3.6 Model Selection, Accuracy Gate and Retraining
For each task, the published model is the candidate with the best held-out metric that also beats every baseline. A weekly retraining batch refits all models on the latest data, keeps a backup of the active models, and publishes a retrained model only if it still beats the baselines, meets the MASE condition and is not more than 25% worse than the previous run; otherwise the backup is restored. The congestion classifier is refitted every hour. Because champions are chosen on the same windows that are reported, the reported accuracy may be slightly optimistic; a separate validation block is planned. No model combination is used.
### 3.11.4 Prescriptive Analysis
The prescriptive tier turns forecasts into recommendations. Three components are mathematical optimization models that return an optimal solution for their stated objective and parameters. The remaining components are rule-based or scenario-based recommendations. All recommendations are computed by the API when the relevant page is viewed and are shown with their assumptions. Operators remain responsible for every decision.
3.11.4.1 Data Overview
The prescriptive models use the champion volume forecast, the hourly plaza and hour shares of traffic, the number of toll booths per plaza (from OpenStreetMap), the predicted incidents by exit and segment, the Kaplan–Meier clearance-time curves, the congestion-state probabilities, the event-uplift estimates and the emission inventory. Economic parameters such as unit and delay costs are operator-adjustable assumptions, not values estimated from NLEX data.
3.11.4.2 Toll-Booth Staffing Allocation
Decision variables: xₚ,ₕ, the booths staffed at plaza p in hour h, and uₚ,ₕ, the unserved demand. Objective and constraints:
⟦EQ⟧min ∑_(p,h)▒u_(p,h)    (3.11.4.1)⟦/EQ⟧
⟦EQ⟧u_(p,h)≥D_(p,h)-μx_(p,h),  0≤x_(p,h)≤min(B_p,⌈D_(p,h)/μ⌉),  ∑_(p,h)▒x_(p,h) ≤P    (3.11.4.2)⟦/EQ⟧
where Dₚ,ₕ is the forecast demand (corridor forecast × plaza share × hour share), μ the throughput per booth-hour (350 vehicles by default, adjustable), Bₚ the booths at the plaza and P an optional staff pool. Because the constraint matrix has an interval structure, assigning each additional booth to the cell with the most unserved demand reaches the linear-programming optimum, so no solver is required. Output: an hourly staffing plan for the next seven days. Feature: Traffic – Prescriptive (Booth Staffing Plan).
3.11.4.3 Patrol Positioning by Maximal Covering Location
Model: the maximal covering location problem (Church & ReVelle, 1974), which positions K patrol units to cover the largest expected incident load within a response radius:
⟦EQ⟧max Z=∑_(i∈I)▒w_i x_i    (3.11.4.3)⟦/EQ⟧
⟦EQ⟧∑_(j∈N_i)▒y_j ≥x_i  ∀i∈I    (3.11.4.4)⟦/EQ⟧
⟦EQ⟧∑_(j∈J)▒y_j ≤K    (3.11.4.5)⟦/EQ⟧
⟦EQ⟧x_i,y_j∈{0,1}    (3.11.4.6)⟦/EQ⟧
where wᵢ is the predicted incidents in zone i, yⱼ = 1 if a unit is stationed at site j, xᵢ = 1 if zone i is covered, and Nᵢ the sites within the radius (8 km along the corridor by default) of zone i. The binary program is solved exactly with the YALPS branch-and-bound solver for the fleet size the operator selects. Feature: Incidents – Prescriptive.
3.11.4.4 Two-Stage Stochastic Clearance Protocol
Purpose: to decide how many response units to dispatch to an incident and whether to escalate when its clearance time is uncertain. Model: a two-stage stochastic mixed-integer program. In the first stage, the number of units x is chosen. Clearance then follows one of four scenarios s (fast, typical, slow, extreme) with probabilities pₛ taken from the Kaplan–Meier curve at its 50th, 80th and 95th percentiles. In the second stage, e additional units may be sent at the decision time:
⟦EQ⟧min ∑_x▒c_x z_x+∑_(s∈S)▒p_s ∑_(x,e)▒q_(x,e,s) w_(x,e,s)    (3.11.4.7)⟦/EQ⟧
⟦EQ⟧∑_x▒z_x =1,  ∑_e▒w_(x,e,s) =z_x  ∀x,s,  z,w∈{0,1}    (3.11.4.8)⟦/EQ⟧
where cₓ is the cost of dispatching x units, and qₓ,ₑ,ₛ the unit-hour cost plus the traffic-delay cost of scenario s. The delay is computed from a deterministic queue in which demand exceeds the reduced capacity during the blockage. The model reports the expected value of perfect information and the value of the stochastic solution. Unit cost, delay cost and the effect of an extra unit are illustrative and adjustable parameters. Feature: Incidents – Prescriptive (Clearance Response Protocol).
3.11.4.5 Fuzzy Congestion-Response Advisory
Purpose: to grade the urgency of responding to a forecast congestion state. Inputs: the forecast probability of high congestion p and the hours ahead h. Each input has three triangular membership functions (low, medium and high probability; soon, mid and far), and nine rules map their combinations to urgency values. The output is a weighted average (zero-order Sugeno inference):
⟦EQ⟧U=(∑_(r=1)^9▒w_r z_r )/(∑_(r=1)^9▒w_r ),  w_r=min(μ_(A_r ) (p),μ_(B_r ) (h))    (3.11.4.9)⟦/EQ⟧
where zᵣ is the urgency value of rule r. Scores of at least 0.7 are labelled Act, at least 0.4 Prepare, and otherwise Monitor, each with a fixed action text (Zadeh, 1965; Ali et al., 2021). The membership functions and rule values were set by the proponents and have not yet been validated with operators. Feature: Traffic – Prescriptive (Congestion Response Advisory).
3.11.4.6 TOPSIS Ranking of Interventions
The Technique for Order of Preference by Similarity to Ideal Solution (Hwang & Yoon, 1981) ranks alternatives by their distance from an ideal and an anti-ideal solution. Criteria values are vector-normalized and weighted, and the closeness score is:
⟦EQ⟧r_ij=x_ij/√(∑_i▒x_ij^2 ),  v_ij=w_j r_ij    (3.11.4.10)⟦/EQ⟧
⟦EQ⟧C_i=(d_i^-)/(d_i^++d_i^- )    (3.11.4.11)⟦/EQ⟧
where dᵢ⁺ and dᵢ⁻ are the Euclidean distances of alternative i from the ideal and anti-ideal points. Event interventions are ranked on extra vehicles, uplift, number of past events and interval width (weights 0.40, 0.25, 0.20 and 0.15). Emission strategies are ranked on expected avoided CO₂, the 5th-percentile avoided CO₂, whether the strategy is bounded by observed performance, and the width of its uncertainty range (weights 0.35, 0.25, 0.25 and 0.15). The weights were chosen by the proponents and have not been sensitivity-tested. Feature: Traffic and Emissions – Prescriptive.
3.11.4.7 Emission Strategy Estimation with Bootstrap Uncertainty
Three emission strategies are estimated. Under shorter lane blockages, each blockage is shortened to the 10th-percentile duration already achieved for its duration band and hour. Faster response in the busiest hours applies the same reduction only to the twelve busiest hours. A lower heavy-vehicle share is a what-if that shifts a share of vehicle-kilometres from Class 3 to Class 2. The two incident-based strategies are given uncertainty ranges from 400 seeded bootstrap resamples of the observed incidents, reported as the 5th to 95th percentile. These ranges describe sampling uncertainty in the record and do not guarantee a reduction. The strategies are scenario estimates, not optimized policies. Feature: Emissions – Prescriptive.
3.11.4.8 Rule-Based Advisories
The system also issues rule-based advisories. A heavy-vehicle time window identifies the peak hours (within 10% of the busiest hour's vehicle-kilometres) and the quietest hours that could absorb the trucks. A peak toll-differential advisory lists the exits and hours with the most Class 3 CO₂; no price elasticity is estimated, so no saving is claimed. A patrol alert window marks the hours of each weekday whose mean incident count exceeds that day's average. These outputs follow fixed rules and are not optimized.
3.11.4.9 Proposed Prescriptive Methods
The design also proposed a weather-triggered speed advisory using PAGASA rainfall thresholds, a surge alert when forecast volume exceeds 80% of capacity, heuristic rerouting of emergency vehicles and commuters, variable speed limits from the fuzzy controller, and price-optimized dynamic tolling. These are not implemented. The weather-triggered advisory was withdrawn after the descriptive analysis showed little difference in high-incident-day probability between rainy and dry conditions, and the capacity-based alert requires segment capacities that are not in the record.
### 3.11.5 Agent-Based Simulation and Language-Model Features
3.11.5.1 Agent-Based Simulation Sandbox
The Scenario Sandbox is a microscopic, agent-based traffic simulation written in TypeScript that runs in the dashboard on an HTML5 Canvas. It is a testing environment in which operators compare interventions with a no-intervention baseline; it does not run the optimization models. Each vehicle is an agent with its own desired speed, time gap, maximum acceleration, politeness and reaction delay. Longitudinal motion follows the Intelligent Driver Model (Treiber et al., 2000):
⟦EQ⟧a=a_max [1-(v/v_0 )^4-((s^* (v,Δv))/s)^2 ]    (3.11.5.1)⟦/EQ⟧
⟦EQ⟧s^* (v,Δv)=s_0+vT+(vΔv)/(2√(a_max b))    (3.11.5.2)⟦/EQ⟧
where v is the speed, v₀ the desired speed, s the gap to the leading vehicle, Δv the approach rate, s₀ the minimum gap, T the time headway and b the comfortable deceleration. Lane changes follow the MOBIL model (Kesting et al., 2007), which accepts a change when the driver's advantage, plus a politeness-weighted effect on neighbouring vehicles, exceeds a threshold and the new follower is not forced to brake harder than a safe limit:
⟦EQ⟧ã_c-a_c+p(ã_n-a_n+ã_o-a_o )>Δa_th    (3.11.5.3)⟦/EQ⟧
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
Exposure-normalized comparison: crash rates in wet and dry hours are compared per hour of exposure.
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
Table 3.13.2.2 Unit Test Scenarios
| Scenario ID | Scenario Name | Criterion ID | Test Input | Expected Output |
| --- | --- | --- | --- | --- |
| UTS-01 | Missing vehicle class | UTC-01 | Toll record with a null vehicle class | Record rejected with reason “invalid vehicle class” |
| UTS-02 | Duplicate upload | UTC-03 | The same toll file uploaded twice | Second load inserts 0 records |
| UTS-03 | Local-baseline deviation | UTC-01 | A day 20% above the mean of its control days | Deviation = +20.0% |
| UTS-04 | Emission calculation | UTC-01 | 100 Class 1 vehicles on a 1-km segment | 19.2 kg CO₂ (100 × 1 km × 192 g/km) |
| UTS-05 | Forecast horizon bound | UTC-05 | Request for 169 hours ahead | Request limited to the published 168-hour horizon |
| UTS-06 | Command plan validation | UTC-01 | Model plan closing a lane beyond the corridor | Plan rejected with an explanation |
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
User-acceptance testing (UAT) determines whether the dashboard and the mobile application meet their users' needs. Participants are selected by purposive sampling: 10 NLEX operators (5 incident operators and 5 TCC operators), 5 NLEX data analysts and 15 commuters and drivers who use the corridor. Nielsen and Landauer (1993) showed that the share of usability problems found grows as 1 − (1 − L)ⁿ, where n is the number of users and L the probability that one user finds a given problem. With the average L of about 0.31, five users reveal about 85% of problems (Nielsen, 2000). Each profile therefore has at least five participants, and testing is run in two rounds. Each participant completes the scenarios for their role. The proponents record task success, time on task and the participant's decision on each recommendation (accept, modify or reject), and participants complete the System Usability Scale (SUS; Brooke, 1996), whose mean is compared with the benchmark of 68 (Bangor et al., 2008). Participation is voluntary, informed consent is obtained, and no personal data beyond role and responses are collected, in accordance with the Data Privacy Act of 2012.
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

# Bibliography
Afrin, T., & Yodo, N. (2020). A Survey of Road Traffic Congestion Measures towards a Sustainable and Resilient Transportation System. Sustainability, 12(11), 4660. https://doi.org/10.3390/su12114660
Alam, M. S., & Tabassum, N. J. (2023). Spatial pattern identification and crash severity analysis of road traffic crash hot spots. Heliyon, 9(3), e16303. https://doi.org/10.1016/j.heliyon.2023.e16303
Attioui, M., & Lahby, M. (2025). A Systematic Literature Review of Traffic Congestion Forecasting: From Machine Learning Techniques to Large Language Models. Vehicles, 7(4), 142. https://doi.org/10.3390/vehicles7040142
Bachechi, C., Po, L., & Rollo, F. (2022). Big Data Analytics and Visualization in Traffic Monitoring. Big Data Research, 27, 100292. https://doi.org/10.1016/j.bdr.2021.100292
Bastarianto, F. F. (2022). Agent-based models in urban transportation planning: A review. Transport Reviews, 43(2), 247–280. https://doi.org/10.1080/01441647.2022.2109264
Bayram, F., Ahmed, B. S., & Kassler, A. (2022). From concept drift to model degradation: An overview on performance-aware drift detectors. Knowledge-Based Systems, 245, 108632. https://doi.org/10.1016/j.knosys.2022.108632
Berhanu, Y., Schroeder, D., Teklu, B., & Alemayehu, E. (2023). Spatial analysis of road traffic accidents: Identifying hotspots for improved road safety in Addis Ababa, Ethiopia. Cogent Engineering, 10(2), 2269655. https://doi.org/10.1080/23311916.2023.2269655
Chung, W., Abdel-Aty, M., Park, H.-C., Cai, Q., Rahman, M., Gong, Y., & Ponnaluri, R. (2020). Development of Decision Support System for Integrated Active Traffic Management Systems Considering Travel Time Reliability. Transportation Research Record, 2674(4), 1-14. https://doi.org/10.1177/0361198120905591
Department of Environment and Natural Resources (DENR) & Climate Change Commission. (2024). Implementation Plan for the Republic of the Philippines Nationally Determined Contribution (NDC) 2020-2030. Republic of the Philippines.
Department of Public Works and Highways. (2024, April 11). DPWH reveals plan to  
	decongest traffic in Metro Manila. Republic of the Philippines. 
	https://www.dpwh.gov.ph/dpwh/news/33434
Deretić, N., Stanimirović, D., Awadh, M. A., Vujanović, N., & Djukić, A. (2022). SARIMA modelling approach for forecasting of traffic accidents. Sustainability, 14(8), 4403. https://doi.org/10.3390/su14084403
Du, X., Yu, M., Zhang, Z., Tong, M., Zhu, Y., & Xue, C. (2025). A task- and Role-Oriented design method for Multi-User collaborative interfaces. Sensors, 25(6), 1760. https://doi.org/10.3390/s25061760
Federal Highway Administration. (2021). Decision Support for Traffic Management Systems Current Practices. FHWA Report No. FHWA-HRT-21-108. https://doi.org/10.21949/1521707
Giuliano, G., & Lu, Y. (2021). Analyzing traffic impacts of planned major events. Transportation Research Record, 2675(9), 297-307. https://doi.org/10.1177/0361198121998710
Grigorev, A., Mihaita, A. S., & Chen, F. (2024). Traffic incident duration prediction: A systematic review of techniques. Journal of Advanced Transportation, 2024, 3748345. https://doi.org/10.1155/2024/3748345
GoodVision. (2024). Reactive, proactive, and predictive traffic engineering. GoodVision 
	Live Traffic Analytics. https://blog.goodvisionlive.com/traffic-engineering-methods
Haowei, M., Shen, Y., Cheng, L., & Ma, J. (2022). Spatial heterogeneity analysis of traffic accident frequency using geographically weighted regression. Accident Analysis & Prevention, 175, 106782. https://doi.org/10.1016/j.aap.2022.106782
Haydari, A., & Yılmaz, Y. (2022). Deep reinforcement learning for intelligent transportation systems: A survey. IEEE Transactions on Intelligent Transportation Systems, 23(1), 11-32. https://doi.org/10.1109/TITS.2020.3005987
Hewamalage, H., Bergmeir, C., & Bandara, K. (2021). Recurrent neural networks for time series forecasting: Current status and future directions. International Journal of Forecasting, 37(1), 388-427. https://doi.org/10.1016/j.ijforecast.2020.06.008
Hyndman, R. J., & Athanasopoulos, G. (2021). Forecasting: Principles and practice (3rd ed.). OTexts. https://otexts.com/fpp3/
International Transport Forum (ITF) & OECD. (2023). Decarbonising the Philippines' Transport Sector. ITF Policy Papers, No. 125, OECD Publishing, Paris. https://doi.org/10.1787/1b590e6a-en

Islam, N., Adanu, E. K., Hainen, A. M., Burdette, S., Smith, R., & Jones, S. (2021). A comparative analysis of freeway crash incident clearance time using random parameter and latent class hazard-based duration model. Accident Analysis & Prevention, 160, 106303. https://doi.org/10.1016/j.aap.2021.106303
Jartarghar, H. A., Salanke, G. R., AR, A. K., GS, S., & Dalali, S. (2022). React Apps with Server-Side Rendering: Next.js. Journal of Telecommunication Electronic and Computer Engineering (JTEC), 14(4), 25–29. https://doi.org/10.54554/jtec.2022.14.04.005
Kaptosv, L. (2025). Using RedIs for caching optimization in High-Traffic Web applications. International Journal of Advanced Multidisciplinary Research and Studies, 5(4), 1714–1722. https://doi.org/10.62225/2583049x.2025.5.4.4839
Leinonen, M., Al-Tachmeesschi, A., Turkmen, N. A., & Ruotsalainen, L. (2024). Long Short Term Memory Based Traffic Prediction Using Multi-Source Data. International Journal of Intelligent Transportation Systems Research. https://doi.org/10.1007/s13177-024-00451-y
Lewis, P., Perez, E., Piktus, A., et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. Advances in Neural Information Processing Systems, 33, 9459–9474. https://proceedings.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html

Li, X., Wang, G., Zhu, Y., & Liu, W. (2025). A system dynamics-based simulation study on urban traffic congestion mitigation and emission reduction policies. Sustainability, 17(20), 9296. https://doi.org/10.3390/su17209296
Li, Z., & Li, D. (2022). Data visualization and interaction of Urban Traffic Logistics Management System using WebGIS. Computational Intelligence and Neuroscience, 2022, 1–12. https://doi.org/10.1155/2022/9347247
Liu, W., Yu, X., Zhao, Q., Cheng, G., Hou, X., & He, S. (2023). Time series forecasting fusion network model based on Prophet and improved LSTM. Computers, Materials & Continua. https://doi.org/10.32604/cmc.2023.032595
Ma, W., Chen, B., Yu, C., & Qi, X. (2022). Trajectory planning for connected and autonomous vehicles at freeway work zones under mixed traffic environment. Transportation Research Record, 2676(10), 207-219. https://doi.org/10.1177/03611981221088214
Makridakis, S., Spiliotis, E., & Assimakopoulos, V. (2022). The M5 accuracy competition: Results, findings and conclusions. International Journal of Forecasting, 38(4), 1346-1364. https://doi.org/10.1016/j.ijforecast.2021.11.013
Manglano-Redondo, P., Paricio-Garcia, A., & Lopez-Carmona, M. A. (2025). Spatio-temporal AI modeling for urban traffic calibration: a SUMO-based approach. SUMO Conference Proceedings, 6, 33-50. https://doi.org/10.52825/scp.v6i.170

M. E. M. Ali, Durdu, A., Celtek, S. A., & Yilmaz, A. (2021). An Adaptive Method for Traffic Signal Control Based on Fuzzy Logic With Webster and Modified Webster Formula Using SUMO Traffic Simulator. IEEE Access, 9, 102985-102997. https://doi.org/10.1109/ACCESS.2021.3094270
Mejia, C. A., & Sigua, R. G. (2018). Effects of rainfall intensity on traffic flow characteristics along the North Luzon Expressway. Proceedings of the Eastern Asia Society for Transportation Studies.
Musah, A., Dutra, L. M. M., Aldosery, A., Browning, E., Ambrizzi, T., Borges, I. V. G., Tunali, M., Başibüyük, S., Yenigün, O., Moreno, G. M. M., Da Silva, A. C. G., Santos, W. P. D., De Lima, C. L., Massoni, T., Jones, K. E., Campos, L. C., & Kostkova, P. (2022). An Evaluation of the OpenWeatherMap API versus INMET Using Weather Data from Two Brazilian Cities: Recife and Campina Grande. Data, 7(8), 106. https://doi.org/10.3390/data7080106
National Academies of Sciences, Engineering, and Medicine. (2024). Active Traffic Management Strategies: A Planning and Evaluation Guide. The National Academies Press. https://doi.org/10.17226/27871
Nguyen, A. (2025). Enhancing the TrekBuddy - Travel Mobile Application - with React Native, Firebase Integration, and EAS Expo Deployment. Theseus. https://www.theseus.fi/handle/10024/886774
Nguyen, N. (2022). Creating a modern web user interface using React and Typescript [Bachelor’s thesis]. Theseus. https://www.theseus.fi/handle/10024/745133
NTT Research and Development. (2023). Digital twins for streamlining road-traffic flow. 
	Nippon Telegraph and Telephone Corporation.  
	https://www.rd.ntt/e/research/JN202302_20942.html
Rengasamy, D., Jafari, M., Rothwell, B., Chen, X., & Figueredo, G. P. (2021). Deep learning with dynamically weighted loss function for sensor-based prognostics and health management. Sensors, 20(3), 723. https://doi.org/10.3390/s20030723
Reyes-Estrope, C. (2025). Holy Week traffic on NLEX seen to peak at 493,000 daily. Philippine Daily Inquirer. https://newsinfo.inquirer.net/2053388/holy-week-traffic-on-nlex-seen-to-peak-at-493000-daily
Rith, M., Fillone, A., & Biona, J. B. M. (2020). Estimating the carbon footprint of Metro Manila's connecting road networks. Transportation Research Interdisciplinary Perspectives, 4, 100096. https://doi.org/10.1016/j.trip.2020.100096
Romanowska, A., & Budzyński, M. (2022). Investigating the impact of weather conditions and time of day on traffic flow characteristics. Weather, Climate, and Society, 14(3), 859-873. https://doi.org/10.1175/WCAS-D-22-0012.1
Rudskoy, A., Ilin, I., & Prokhorov, A. (2021). Digital twins in the intelligent transport systems. Transportation Research Procedia, 54, 927-935. https://doi.org/10.1016/j.trpro.2021.02.152
Ruf, P., Madan, M., Reich, C., & Ould-Abdeslam, D. (2021). Demystifying MLOps and presenting a recipe for the selection of open-source tools. Applied Sciences, 11(19), 8861. https://doi.org/10.3390/app11198861
Rundel, S., & De Amicis, R. (2023). Leveraging digital twin and game-engine for traffic simulations and visualizations. Frontiers in Virtual Reality, 4, 1048753. https://doi.org/10.3389/frvir.2023.1048753
Sagaama, I., Kchiche, A., Trojet, W., & Kamoun, F. (2024). Energy-efficient route navigation (eco-routing) for electric vehicles in SUMO. IEEE Canadian Journal of Electrical and Computer Engineering, 47(4). https://doi.org/10.1109/ICJECE.2024.3425515
Sakr, H. A., El-Afifi, M. I., & PLVAR team. (2023). Intelligent Traffic Management Systems: A review. Nile Journal of Communication & Computer Science, 5(1), 42-56. https://doi.org/10.21608/njccs.2023.308709
Shah, Vaishali et al. (2024). Predictive Analytics for Traffic Management Systems. FHWA Report. https://highways.dot.gov/sites/fhwa.dot.gov/files/FHWA-HRT-24-091.pdf
Shang, Q., Tan, D., Gao, S., Feng, L., & Li, M. (2022). Prediction of Duration of Traffic Incidents by Hybrid Deep Learning Based on Multi-Source Incomplete Data. International Journal of Environmental Research and Public Health, 19(17), 10903. https://doi.org/10.3390/ijerph191710903
Shaygan, M., Meese, C., Li, W., Zhao, X., & Nejad, M. (2022). Traffic prediction using artificial intelligence: Review of recent advances and emerging opportunities. Transportation Research Part C: Emerging Technologies, 145, 103921. https://doi.org/10.1016/j.trc.2022.103921
Smelyakov, K., Klochko, O., & Dudar, Z. (2023). Building Quantile Regression Models for Predicting Traffic Flow. COLINS (1), 117-132.
Sunio, V., Mateo-Babiano, I., & Guillen, M. D. (2023). Minimizing vehicular dwell time and travel delays to curb greenhouse gas emissions. International Journal of Sustainable Transportation, 17(5), 450-462. https://doi.org/10.1080/15568318.2022.2044093
Sun, B., Sun, T., & Jiao, P. (2021). Spatio-temporal segmented traffic flow prediction with ANPRS data based on improved XGBoost. Journal of Advanced Transportation, 2021, 5559562. https://doi.org/10.1155/2021/5559562
Sustainability Directory. (n.d.). Road corridor. https://news.sustainability-directory.com/news/road-corridor/
Tharu, L. (2025). Version Control System and GitHub with its implementation. ResearchGate. https://doi.org/10.13140/rg.2.2.29361.24162
Torres, J. F., Hadjout, D., Sebaa, A., Martínez-Álvarez, F., & Troncoso, A. (2021). Deep learning for time series forecasting: A survey. Big Data, 9(1), 3–21. https://doi.org/10.1089/big.2020.0159
VanDerHorn, E., & Mahadevan, S. (2021). Digital Twin: Generalization, characterization and implementation. Decision Support Systems, 145(0167-9236), 113524. https://doi.org/10.1016/j.dss.2021.113524
Vickerman, R. (2021). Congestion and transport infrastructure capacity. In Transport Economics Elsevier. https://www.sciencedirect.com/science/chapter/edited-volume/abs/pii/B9780128168165000024
W, P. K., & Engel, M. (2026). Performance comparison of Tauri and Electron frameworks in multiplatform desktop application development. bit-Tech, 8(3), 3875–3882. https://doi.org/10.32877/bt.v8i3.3733
Wang, P., Hao, W., & Jin, Y. (2021). Fine-Grained Traffic Flow Prediction of Various Vehicle Types via Fusion of Multisource Data and Deep Learning Approaches. IEEE Transactions on Intelligent Transportation Systems, 22(11), 6921–6930. https://doi.org/10.1109/TITS.2020.2997412
Yao, H., & Graham, R. (2025). Quantile Random Forest for conditional quantile estimation in urban traffic volume forecasting. arXiv preprint arXiv:2501.18548. https://doi.org/10.48550/arXiv.2501.18548
Ye, Z., et al. (2024). Traffic prediction using LSTM, RF, and XGBoost. SciTePress. https://www.scitepress.org/Papers/2024/135156/135156.pdf
Yu, E., Xu, Y., Gao, L., Cao, J., Xiang, Q., & He, L. (2024). R-Manager: Consortium Blockchain-Based Vehicle Reputation Management for High-Quality Reports in Traffic-Oriented Crowdsourcing. IEEE Transactions on Vehicular Technology, 74(1), 984-999. https://doi.org/10.1109/TVT.2024.3458641
Yu, G. (2024). Exploration and Practice of Data Visualization. 2024 5th International Conference on Big Data Economy and Information Management (BDEIM). ACM. https://doi.org/10.1145/3724154.3724292
Zhang, Y., et al. (2022). Urban traffic congestion prediction using spatiotemporal traffic 
	data. Transportation Research Part C: Emerging Technologies, 138, 103584. 
	https://www.sciencedirect.com/science/article/abs/pii/S0968090X22003345
Zhang, S., Shi, J., Huang, Y., Shen, H., He, K., & Chen, H. (2024). Investigating the effect of dynamic traffic distribution on network-wide traffic emissions: An empirical study in Ningbo, China. PLoS ONE, 19(7), e0305481. https://doi.org/10.1371/journal.pone.0305481
Zheng, G., Chai, W. K., & Katos, V. (2020). An ensemble model for short-term traffic prediction in smart city transportation system. Transportation Research Part C, 121, 102829. https://doi.org/10.1016/j.trc.2020.102829
Zunino, A., Velázquez, G., Celemín, J., Mateos, C., Hirsch, M., & Rodriguez, J. (2020). Evaluating the performance of three popular web mapping libraries: a case study using Argentina’s life quality index. ISPRS International Journal of Geo-Information, 9(10), 563. https://doi.org/10.3390/ijgi9100563


# Appendix
## A.1 Glossary
| Term | Meaning | Computation | Where it appears |
| --- | --- | --- | --- |
| Time Series Decomposition (STL) | An analytical method that separates historical data into three additive components: long-term trend, repeating seasonal patterns, and irregular residual noise. | To find the underlying structure of traffic data, the system mathematically breaks down the actual traffic volume into three simple parts and adds them together: the overall long-term growth trend, the repeating daily or weekly seasonal patterns, and any random, unexplainable noise. | A method for "Traffic Volume Trend Analysis" and "Event-Based & Holiday Traffic Analysis". |
| Rolling Mean (Moving Average) | A fixed-window arithmetic smoothing operation that computes the average of the most recent observations. | Suppresses short-term noise and exposes the true underlying traffic volume trends. | Descriptive Analytics |
| Autocorrelation and Partial Autocorrelation Functions (ACF and PACF) | Statistical diagnostic tools measuring lag-correlation coefficients. | Determines the appropriate SARIMA order parameters for the predictive layer by capturing total correlation and isolating the direct contribution of intermediate temporal lags. | Descriptive Analytics |
| Gaussian Mixture Model (GMM) | An unsupervised probabilistic machine learning algorithm that segments observations into distinct traffic regimes (e.g., free-flow vs. congested) by fitting elliptical distributions to data. | Accurately captures the natural, non-linear curves of traffic behavior to define Traffic Performance Index (TPI) classes and congestion severity without relying on arbitrary, hard-coded thresholds. | A model for "Peak Hour and Congestion Pattern Analysis". |
| Speed-Flow Fundamental Diagram (Underwood's Model) | A formula-based calibrated equation that relates speed and flow density. | Physically characterizes congestion baselines without relying on ML estimation. | Descriptive Analytics |
| Control-Day Comparison & Anomaly Detection (2-Sigma Rule) | Statistical techniques used to isolate traffic deviations. | Control-Day matches event days with non-event baseline days, while the 2-sigma rule deterministically flags observations exceeding the historical mean by two standard deviations. | Descriptive Analytics |
| Clearance Time Distribution (Log-Normal) | A descriptive statistical summary that fits a log-normal parametric distribution to observed incident clearance times. | Estimates the location and scale parameters to summarize the historical variability in clearance times for NLEX incidents. | Descriptive Analytics |
| COPERT IV / EMFAC Emission Framework | A standardized lookup table of internationally calibrated vehicle-class emission rates. | Deterministically calculates baseline CO₂ emissions and the excess carbon burden specifically caused by stop-and-go congestion. | Descriptive Analytics |
| Kernel Density Estimation (KDE) & Network-Constrained KDE (NKDE) | Non-parametric procedures that estimate continuous spatial density from point events, with NKDE specifically constraining this density to road geometry. | Visually and topologically maps chronic high-risk incident hotspots along the linear infrastructure of NLEX. | Descriptive Analytics |
| Getis-Ord Gi* | A spatial autocorrelation test that computes a z-score to mathematically prove whether a cluster of incidents is a statistically significant "hotspot" or just random chance. | The system compares the number of crashes in one specific road segment to the overall average number of crashes across the entire expressway network. If a segment's crash rate is mathematically proven to be significantly higher than the surrounding areas, it is flagged as a true hotspot rather than just a random cluster. | Descriptive Analytics |
| Mejia and Sigua Speed-Reduction Model | A descriptive lookup model utilizing regression coefficients calibrated specifically to Philippine highways. | Establishes a baseline of how much traffic speeds degrade as a direct function of rainfall intensity. | Descriptive Analytics |
| Mean Time to Clear (MTTC) | The operational efficiency metric tracks the exact duration required for emergency fleets to reopen the carriageway completely. | calculate the clearance time simply by taking the exact timestamp of when an emergency is fully resolved and the road is reopened, and subtracting the timestamp of when the incident was first reported to the system. | Descriptive Analytics |
| Delay-Induced Carbon Excess (kg) | The excess greenhouse gas emissions produced by vehicles trapped in a standstill, beyond normal travel emissions. | To figure out how much extra carbon is emitted purely because of a traffic jam, the system takes the total number of cars stuck in the standstill and multiplies it by the exact number of minutes they were delayed, factoring in an official API emission rate for idling vehicles. | Descriptive Analytics |
| SARIMAX (Seasonal AutoRegressive Integrated Moving Average with Exogenous Regressors) | A robust statistical time-series model that forecasts traffic by analyzing past cyclical data while factoring in external ("exogenous") variables like weather or holidays. | Forecasts volume trends and capacity utilization by incorporating external weighted regressors like holiday indicators, rainfall intensity, and real-time V/C ratios. | Predictive Analytics |
| Prophet | A Bayesian curve-fitting framework developed by Meta that decomposes time series into additive components. | Deployed for its native capacity to handle irregular NLEX holiday effects, abrupt trend changepoints, and extreme localized volume surges tied to event attendance. | Predictive Analytics |
| Long Short Term Memory (LSTM) | A specialized Recurrent Neural Network (RNN) architecture equipped with gating mechanisms (input, forget, output) designed to retain long-range temporal dependencies. | Serves as the system's primary algorithm for forecasting multi-step volume trends and 7-day CO₂ emission series by analyzing the chronological flow of historical data. | Predictive Analytics |
| eXtreme Gradient Boosting (XGBoost) | A highly efficient supervised ensemble machine learning algorithm utilizing gradient-boosted decision trees. | Serves as the primary classifier and regressor to predict congestion state probabilities, event surge multipliers, continuous delay indices, Class 3 heavy vehicle surges, and weather-related incident probabilities. | Predictive Analytics |
| Holt-Winters Exponential Smoothing | A computationally efficient forecasting method fitting level, trend, and seasonal smoothing parameters. | Serves as a benchmark for short-horizon volume smoothing, complementing the deeper LSTM and SARIMAX models. | Predictive Analytics |
| Gated Recurrent Unit (GRU) | A streamlined recurrent neural network with update and reset gates. | Trains separately on wet-condition and dry-condition speed sequences to accurately capture distinct traffic dynamics under severe rainfall. | Predictive Analytics |
| Geographically Weighted Regression (GWR) | A spatial regression technique applying a geographic kernel weighting function. | Estimates spatially varying coefficients, successfully capturing the spatial non-stationarity of incident-rate predictors across the physical NLEX network. | Predictive Analytics |
| Quantile Random Forest (QRF) | An ensemble machine learning algorithm that retains the full empirical distribution of targets to generate prediction intervals (a probabilistic range of expected congestion) rather than a single deterministic point estimate. | Generates prediction intervals for congestion metrics, producing the Congestion Probability Score as a distributional output. | Predictive Analytics |
| Negative Binomial Regression | A Generalized Linear Model suited for overdispersed count data. | Estimates regression parameters from historical incident frequency records to model incident counts. | Predictive Analytics |
| Ordinal Logistic Regression | A classification model that fits ordered log-odds coefficients. | Models the cumulative probability of a predicted incident's severity falling into specific ordered categories based on labeled training data. | Predictive Analytics |
| Cox Proportional Hazard Model | A foundational survival analysis algorithm that estimates hazard ratio coefficients. | Computes the "clearance survival curve," allowing the system to accurately predict the continuous minutes required to clear an incident from the carriageway. | Predictive Analytics |
| Dirichlet Regression | A Generalized Linear Model designed for compositional outcome variables that must sum to 1. | Estimates regression coefficients for fleet share proportions, predicting the constrained ratios of Class 1, 2, and 3 vehicles. | Predictive Analytics |
| Linear Programming (LP) | A mathematical optimization technique that solves for minimum-cost or maximum-coverage configurations subject to strict linear constraints. | Distributes pre-event patrol/tow resources across exits, and deploys patrol zones to hotspot segments. | Prescriptive Analytics |
| Fuzzy Rule-Based Inference | A deterministic inference procedure applying expert-defined fuzzy membership functions to real-time inputs. | Automatically computes and recommends variable speed limits to operators based on forecasted V/C ratios and congestion states. | Prescriptive Analytics |
| Weather-Triggered Rule & Rule-Based Surge Alert | Deterministic, threshold-based early warning mechanisms. | Automatically issues speed advisories based on PAGASA rainfall thresholds or triggers operator notifications when predicted volume forecasts exceed 80% of road capacity. | Prescriptive Analytics |
| TOPSIS | A Multi-Criteria Decision Analysis (MCDA) geometric procedure (Technique for Order of Preference by Similarity to Ideal Solution). | Mathematically ranks available operational interventions based on their relative closeness to the ideal logistical outcome, ensuring the dashboard recommends the optimal strategy. | Prescriptive Analytics |
| Stochastic Linear Programming (SLP) | An advanced mathematical optimization framework that accounts for inherent uncertainty by evaluating probabilistic scenarios rather than fixed deterministic values. | Formulates dynamic emergency response protocols that remain robust, efficient, and safe even if real-world recovery times deviate from initial predictions. | Prescriptive Analytics |
| Large Language Model (Anthropic Claude Sonnet) | An advanced LLM that functions as the system's core conversational reasoning engine. | Strictly translates structured backend traffic data into clear, natural-language travel advisories tailored for everyday NLEX commuters; also parses operator intents for the Simulation Sandbox. | AI Chatbot / Agent-Based Sandbox |
| Retrieval Augmented Generation (RAG) | An architecture that manages programmatic function calls to securely query, retrieve, and format validated data from the database. | Eliminates the risk of hallucinated or outdated responses by enforcing that every conversational output is anchored to real-time and forecast data within the SmartFlow NLEX Dashboard. | AI Chatbot |
| Agent-Based Modeling (ABM) Sandbox | A simulation technique and 2D visualization environment where vehicle "agents" interact within a virtual NLEX environment. | Provides a risk-free virtual space for operators to manually simulate scenarios such as lane closures, validating AI-generated interventions before executing them in the physical world. | AI Simulation |
| MAPE / RMSE / MASE | Standard forecast error metrics. MAPE (Mean Absolute Percentage Error) expresses error as a percentage; RMSE (Root Mean Square Error) heavily penalizes outlier errors; MASE (Mean Absolute Scaled Error) provides a scale-independent baseline. | To measure how accurate our AI’s traffic predictions are, the system calculates the exact difference between the AI's forecasted vehicle count and the actual vehicle count that occurred. It translates that difference into a simple percentage, and then averages those percentages over time so we can tell operators our exact accuracy rate. | Training and Testing of Models |
| MAE (Mean Absolute Error) | A straightforward error metric that measures the average absolute difference between forecasted and actual values without squaring deviations. | Provides an interpretable baseline of average forecast error magnitude across traffic volume and emission predictions. | Training and Testing of Models |





