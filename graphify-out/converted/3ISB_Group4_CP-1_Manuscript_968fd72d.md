<!-- converted from 3ISB_Group4_CP-1_Manuscript.docx -->


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
The North Luzon Expressway (NLEX) is a 105-kilometer modern infrastructure project that serves as the main artery connecting Metro Manila to Central and Northern Luzon (NLEX Corporation, 2026). As a "showcase for world-class highways," it has revolutionized regional travel, enabling motorists to reach destinations such as Baguio and La Union in significantly shorter travel times than in previous decades (NLEX Corporation, 2026).
An important route that connects the growing regions of Central and Northern Luzon with the congested National Capital Region is the NLEX. As the main highway connecting these areas, NLEX helps spread economic growth beyond Metro Manila into the provinces. The expressway is crucial to businesses and the logistics industry. It facilitates the easy movement of large quantities of manufactured goods, raw materials, and agricultural products between Metro Manila markets and provincial farms or enterprises. For delivery trucks and logistics companies, smooth traffic on NLEX means faster deliveries, lower fuel consumption, and reduced transportation costs, which helps stabilize the country's trade and supply chain (Philippine Institute for Development Studies, 2015). For people who commute every day, NLEX is important. A large number of employees and students commute daily to Metro Manila from provinces nearby. Maintaining good traffic flow is essential because so many people and businesses rely on this route. Heavy traffic or disruptions on the expressway immediately delay both important deliveries and commuters' daily schedules (Asian Development Bank, 2012).
Traffic congestion has been a significant challenge along the North Luzon Expressway (NLEX), one of the primary expressways connecting Metro Manila to the provinces of Central and Northern Luzon. This occurs when demand for road use exceeds the capacity of the transportation infrastructure, resulting in slower traffic and longer travel times for road users (Vickerman, 2021). As the number of vehicles continues to increase each day, motorists and commuters frequently experience delays, particularly during peak hours. Reports and articles indicate that the congestion tends to intensify during peak travel periods and major holidays, when a larger volume of vehicles uses the expressway. The traffic volume can reach hundreds of thousands of vehicles per day, with projections of up to 493,000 daily during peak season, such as Holy Week (Reyes-Estrope, 2025). Despite the availability of traffic updates across navigation apps and social media platforms, many drivers primarily receive information on current traffic conditions rather than forecasts of future congestion. Most navigation systems rely on real-time data collected from GPS devices and user reports to provide traffic updates, but may offer limited predictive insights for travel planning (Zhang et al., 2022).
To address the increasing challenges of traffic congestion and limited predictive traveler information, this capstone project proposes an analytics and decision-intelligence system, SmartFlow NLEX, to forecast traffic patterns along the North Luzon Expressway. It utilizes various multisource data, including historical traffic data, toll transaction data, incident data, real-time data, and weather and event data. It uses data analytics and machine learning to analyze traffic patterns, forecast congestion, and provide users with insights.
Furthermore, this project aims to develop a mobile application that provides real-time insights, predictive congestion forecasts, and early warning alerts to drivers and commuters using the expressway. With predictive analytics, SmartFlow NLEX aims to support proactive traffic management for NLEX operators while enabling road users to make more informed travel decisions.
## 1.1 Definition of Terms
To properly understand the entire concept of this project and the system, the following terms listed below are defined according to the context of this paper:
a.) Agent-Based Visual Sandbox Simulation
A computational modeling approach where individual agents follow defined behavioral rules to simulate collective traffic dynamics. Within this platform, it is utilized as a "what-if" visualizer, enabling traffic controllers to simulate impending congestion and test the effectiveness of proposed countermeasures in a risk-free, virtual environment before applying them to the actual expressway (VanDerHorn & Mahadevan, 2021).
b.) Carbon Dioxide (CO₂) Emissions
The release of greenhouse gases into the atmosphere is primarily caused by the combustion of fossil fuels from motorized vehicles. In the context of traffic systems, these emissions significantly escalate during recurring and nonrecurring congestion due to prolonged vehicle delays and excessive fuel consumption (Afrin & Yodo, 2020).
c.) Corridor
A designated strip of land that includes the roadway and its adjacent managed right-of-way area, serving not only for vehicle movement but also containing utility lines, drainage systems, and ecological barriers or pathways (Sustainability Directory, n.d.).
d.) NLEX Commuters and Drivers
The primary end users of the mobile application who use the North Luzon Expressway for personal or professional travel and require predictive information to optimize travel time.
e.) NLEX Data Analysts
Technical staff tasked with interpreting historical data to identify long-term traffic trends and system performance metrics.
f.) NLEX Incident Operators
Specialized personnel focused on the documentation, verification, and management of road crashes, vehicle breakdowns, and other non-recurring traffic events.
g.) NLEX Traffic Control Center (TCC) Operators
The personnel responsible for monitoring expressway operations, resource deployment, and emergency response coordination.

h.) Reactive and Proactive
Reactive refers to responding to a problem after it has already occurred, while proactive refers to anticipating and addressing a problem before it takes place.
i.) Rush Hour
Used interchangeably with Peak Hours, it refers to the busiest time of day where there is an increase in the volume of vehicles, typically occurring in the morning and evening (Cambridge Dictionary, 2023).
j.) Traffic Congestion
A condition in which vehicle movement on the road is slower due to various factors, including reaching maximum road capacity, occurring incidents, or extreme weather conditions, which may result in increased travel time, accident rates, and carbon emissions (Shaygan et al., 2022).
## 1.2 Company Background
NLEX Corporation stands as a cornerstone of Philippine infrastructure, recognized as a premier company specializing in the comprehensive lifecycle of toll road projects spanning development, design, construction, and finance to long-term operation and management (NLEX Corporation, 2026). Headquartered in Caloocan, the company was incorporated in 1997, originally operating under the name Manila North Tollways Corporation (MNTC) before rebranding to its current name to better align with its flagship asset (InfraPPP, 2022). Over more than two decades, the organization has established a proven track record, evolving from a local tollway operator into a national showcase for world-class highway management.
The company operates as a key subsidiary of the Metro Pacific Tollways Corporation (MPTC), the undisputed leader in toll road development in the Philippines. As the infrastructure arm of Metro Pacific Investments Corporation (MPIC), NLEX Corporation is part of a broader corporate lineage that includes Hong Kong-based First Pacific Co. Ltd. (MPTC, 2024). This association provides NLEX Corporation with robust institutional support and positions it within the country’s largest expressway network, which includes other major arteries such as the Subic-Clark-Tarlac Expressway (SCTEX), Manila–Cavite Expressway (CAVITEX), and Cavite-Laguna Expressway (CALAX) (MPTC, 2024). Furthermore, through MPTC’s regional investments, NLEX Corporation is part of an international network with significant infrastructure stakes in Indonesia and Vietnam, marking it as a player in the broader ASEAN infrastructure landscape (MPTC, 2024).
Driven by a commitment to innovation and nation-building, NLEX Corporation has transitioned beyond traditional road maintenance toward "smart mobility" solutions. Through its parent company’s divisions, such as MPT Mobility and MPT Digital, the corporation integrates advanced technologies, including the Easytrip cashless payment system and the MPT DriveHub mobile application, to enhance the customer experience (MPTC, 2024).

## 1.3 Project Context (Business Analytics)
The North Luzon Expressway Corporation already employs a degree of proactive traffic management for predictable, calendar-based demand patterns, pre-positioning resources ahead of known high-traffic days such as Friday rush periods, long weekends, and declared holidays. However, this proactivity is limited in scope. The existing system collects daily data on vehicle counts, travel times, and incident reports across its 105-kilometer corridor, but presents this information primarily as snapshots of current conditions. When surges arise from factors outside the standard calendar, such as sudden weather disturbances, uncleared road incidents, or large regional events like concerts at the Philippine Arena, operators have no data-driven forewarning and no structured mechanism to evaluate the impact of a potential intervention before deploying it. Furthermore, traffic congestion increases emissions by causing idling and stop-and-go driving, worsening air quality and fuel consumption. As GoodVision (2024) highlights, traffic control centers that rely on retrospective observation are forced to respond to these non-routine congestion events only after gridlock has already materialized. As the DPWH (2024) has underscored, managing the country's growing vehicle population requires modern, data-driven solutions that go beyond calendar-based planning. The data NLEX needs to anticipate these compound, multi-factor surges already exists in toll logs, incident records, weather feeds, and event schedules, but it is currently siloed and not fused into a unified predictive pipeline.
To address this, the proponents will develop SmartFlow NLEX, a decision-intelligence system that integrates multisource data, including historical toll records, incident logs, weather conditions, and event schedules, to forecast traffic flow trends beyond what calendar-based planning alone can anticipate. Descriptive analytics will be used to identify existing congestion patterns, predictive analytics will forecast future traffic volumes and incident probabilities driven by external and environmental factors, and prescriptive analytics will generate actionable operational recommendations.
Moreover, the proposed system will incorporate an Agent-Based Simulation Sandbox, enabling operators to test interventions virtually before executing them in the physical world (NTT Research and Development, 2023). Through these capabilities, the proponents seek to extend NLEX's existing proactive management capability, moving it beyond scheduled peak-day planning into a fully data-driven, multi-factor intelligence platform that prepares operators for both the predictable and the unpredictable.



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
## 1.5 Scope and Limitations
This focuses on developing a decision-intelligence dashboard in at least a web application to provide predictive traffic congestion information for operators, commuters, and drivers. The system includes external factors such as accidents and weather, and uses this information to provide immediate alerts. The scope is restricted to the corridor of the North Luzon Expressway (NLEX). The application is limited in its capacity to collect all real-time events.
1.5.1 Scope
The functional boundaries and core features of the system are defined by the following areas:
Corridor Coverage
The geographic scope of the system is exclusively restricted to the continuous main corridor of the North Luzon Expressway (NLEX), spanning from the Balintawak Interchange to the Sta. Ines Exit in Mabalacat, Pampanga.
Multi-Source Data Integration
The system aggregates and processes diverse data streams that feed across the analytical layers. These streams include, but are not limited to, historical toll transaction records, documented incident logs, real-time environmental and weather data via external APIs, and event data gathered from public ticketing platforms.

Real-Time Data Monitoring and Visualization
The system continuously processes incoming data feeds to maintain live situational awareness. The web-based operator dashboard automatically updates to reflect current traffic volumes, active incidents, and weather disruptions.The web dashboard is the least requirement for this project but is not limited to it.
External Factor Integration
The analytical engine accounts for non-traffic variables that significantly influence expressway behavior. The system considers, among others, the historical and real-time impacts of major holidays, localized special events, and fluctuating weather conditions to refine its descriptive and predictive outputs.
Predictive Congestion Forecasting
By evaluating historical trends alongside active conditions, the system models traffic behavior and related operational indicators to project future bottleneck formations. This forecasting capability aims to mitigate the risk of secondary crashes and assists both operators and commuters in avoiding peak congestion.
Carbon Emission Monitoring
The system incorporates an environmental tracking layer. It estimates gas emissions by applying standardized calculation models and vehicle classification weights against observed traffic volumes and average segment velocities.
Agent-Based Sandbox Simulation
The system includes a virtual simulation environment that mimics real-world expressway dynamics. This features allows traffic operators to execute hypothetical "What-If" scenarios to visualize how potential interventions will influence traffic flow before implementing them on the road.
User-Facing Decision-Intelligence Interfaces
The platform delivers its analytical outputs through at least but not limited to the Operator Dashboard, a web-based console for internal NLEX management to monitor the expressway and allocate resources; the Consumer Mobile Application, a commuter-facing interface delivering ETA calculations, trip updates, and scheduling guidance to help users minimize fuel consumption and avoid delays and the AI Conversational Assistant, a natural-language interface that translates forecasts, weather conditions, and incident statistics into accessible travel advisories for public users.
1.5.2 Limitations
The operational execution and technical performance of the platform are governed by the following constraints:
Data Integrity and Availability
The accuracy and reliability of all system forecasts are entirely dependent on the quality, completeness, and timeliness of the raw data provided by NLEX Corporation and associated external data suppliers.
Connectivity and Network Dependence
The platform’s user-facing interfaces perform optimally with a continuous internet connection. Commuters traveling through low-coverage or dead zones along the expressway corridor may experience temporary latencies in map updates.
Event Scraping Restrictions
The system's data-gathering capabilities are confined to public event listings impacting the NLEX corridor. The platform cannot retrieve granular internal metrics such as real-time ticket sales or remaining venue capacities, and instead relies on generalized estimates based on venue sizes and event types.
Granularity of Emission Calculations
The carbon monitoring feature is limited to macro-level assessments. It cannot isolate specific emissions for minor, isolated road segments, environmental metrics are aggregated broadly by vehicle class across major sections.
Third-Party API Uptime
Real-time environmental and external-data validation relies significantly on external platforms. Because these data sources are outside the exclusive control of the development team, any third-party server outages or service interruptions may impact the live update features of the platform.
Lack of Operational Autonomy
The system functions purely primarily as an advisory and decision-intelligence tool. In its current form, it does not automatically control toll barriers, modify digital roadside signage, or dispatch emergency field personnel, ambulances, or towing services,
AI Knowledge Domain Restriction
The embedded conversational assistant is restricted to a narrow knowledge base. It is configured to respond exclusively to inquiries regarding NLEX traffic data and immediate system operations, and will not answer general-knowledge queries or discuss areas outside the NLEX corridor.
Geographic Boundaries
The system's predictive and monitoring capabilities do not extend beyond the designated NLEX mainline. It does not track, analyze, or forecast traffic conditions for intersecting local city streets, urban access roads, or connecting expressways.

## 1.6 Conceptual Framework of Data Integration

Figure 1.6.1 IPO Conceptual Framework of the SmartFlow NLEX
The system begins with the Input Phase, collecting data from NLEX Corporation (traffic and incidents), Weather APIs (local weather), and ticketing websites (upcoming events). It also uses real-time reports from the Waze Partner Hub and direct updates from commuters to understand current road conditions.
In the Process Phase, the analytical engine cleans the raw data to ensure it is accurate. Using Machine Learning, the system identifies past traffic trends, forecasts future flow and possible accidents, and suggests the best response strategies for operators. This allows the management team to test different "what-if" scenarios before taking action.
The Output Phase provides easy-to-use tools for different users. NLEX operators use a Web Dashboard with a simulation sandbox for planning. Meanwhile, the public can access a mobile application featuring an AI assistant and community updates. This setup creates a loop in which user feedback continually improves the system's predictions.
## 1.7 Project Milestones/Timeline
To ensure timely completion, this timeline tracks each project phase from start to finish, highlighting key tasks and deadlines.



Figure 1.7.1 Project Timeline

# CHAPTER 2
REVIEW OF RELATED LITERATURE, STUDIES, SYSTEMS, AND TECHNOLOGIES
This chapter presents a comprehensive review and analysis of related literature, studies, systems, and technologies relevant to the development of SmartFlow NLEX: A Multi-Source Corridor Decision-Intelligence System for Forecasting Expressway Traffic Conditions. It integrates previous findings, methodologies, and conclusions to provide a deeper understanding of the project. Through extensive research, this chapter establishes a solid foundation by examining similar and relevant works, enabling the researchers to contextualize the study and identify key insights that support its development.
## 2.1 Review of Related Literature and Studies
This section presents a comprehensive review of existing literature and related studies relevant to the development of SmartFlow NLEX: A Multi-Source Corridor Decision-Intelligence System for Forecasting Expressway Traffic Conditions.
### 2.1.1 Intelligent Transportation Systems and Traffic Management
2.1.1.1 Traffic Analysis and Management
Afrin and Yodo (2020) emphasize that traffic congestion is mostly influenced by the increase in vehicle numbers and define it as a condition where travel demand exceeds road capacity. The authors divide this problem into two subcategories: "recurring" traffic congestion influenced by predictable peak hour volumes, and "non-recurring" congestion influenced by unpredictable events such as accidents or adverse weather. Because both categories lead to significant socio-economic losses, the authors argue that modern traffic management requires proactive and continuous monitoring.
To comprehend the dynamics of traffic congestion analytically, it is imperative to understand the mathematical relationships among vehicle speed, density, and flow rate. Mejia and Sigua (2018) apply Underwood's Exponential Model to perform statistical regression analysis on traffic stream parameters, including non-recurring congestion events. Their data-driven analytics demonstrate that external factors, such as varying rainfall intensities, mathematically alter the fundamental limits of a road, reducing its theoretical capacity by as much as 17.44% and lowering the free-flow speed. Applying such exponential models will allow the system to precisely model dynamically shifting capacity thresholds, providing highly accurate analytics to understand congestion dynamics without requiring physical infrastructural interventions.
Furthermore, Sakr et al. (2023) state that urban traffic operates as a highly chaotic system prone to the "butterfly effect," whereby a minor anomaly such as a collision or a stalled vehicle quickly leads to widespread network-wide traffic jams. To address this, the authors highlight the importance of utilizing specialized Traffic Incident Management (TIM) systems with computer vision analytics and edge processing. Through the direct analysis of live feeds at the edge of the network, these models recognize anomalies and react programmatically to reroute surrounding traffic flow.
2.1.1.2  Decision-Intelligence Systems
To take centralized visualizations beyond mere observation, advanced Decision-Intelligence Systems (DIS) now include predictive analytics engines to actively manage and control traffic flow. Chung et al. (2020) detail the development of Integrated Active Traffic Management (IATM) systems that use macroscopic traffic flow models, such as the METANET algorithm, to simulate and predict near-future traffic conditions across a network of connected freeways. By leveraging this predictive analytics capability, a DIS automatically assesses the effectiveness of automated response strategies, utilizing travel time reliability as the primary analytical goal.
The Federal Highway Administration (2021) categorizes Decision-Intelligence Tools (DITs) into various operational frameworks, distinguishing between data-driven and model-driven DITs. In contrast to data-driven tools that query databases to inject statistical data into operations, model-driven DITs use complex mathematical models and simulation tools to perform "what-if" analyses. These analytics simulate a range of hypothetical response strategies, ensuring that travel times, traffic volumes, and environmental consequences can be accurately predicted before physically deploying traffic control strategies.
To execute these intricate model-based simulations in real-time, increasingly turn toward advanced virtual replica technologies. Sakr et al. (2023) define these virtual environments as replicas of the physical road network operating in real-time, achieved through the aggregation of continuous data streams from IoT devices and connected sensors. This virtual environment relies on advanced Machine Learning techniques to generate highly optimized and adaptive control decisions. Establishing this virtual testing environment will support the system’s objective of moving beyond simple observation to perform "what-if" analyses, ensuring that prescriptive recommendations ensure travel time reliability along the NLEX corridor.
By establishing the need for 'smart city dashboards' and 'advanced virtual simulations’, the research validates the study’s approach of integrating fragmented data into a centralized visual interface. This supports the objective of moving beyond simple observation to perform "what-if" analyses, allowing the system to test traffic management strategies in a virtual environment before actual implementation. Ultimately, these studies anchor the project’s goal of providing actionable, prescriptive recommendations to ensure travel time reliability along the NLEX corridor.
### 2.1.2 Traffic Data Sources and Multisource Integration
This section provides the technical justification for the multisource architecture of the SmartFlow NLEX system, specifically addressing the limitations of single-source monitoring. By establishing that traditional sensors often suffer from data gaps, the literature supports the study’s use of spatiotemporal data fusion to create a more reliable dataset for the NLEX corridor. The integration of crowdsourced data (such as Waze) and external variables (such as the rainfall impact studies on NLEX) proves that forecasting accuracy depends on capturing both real-time road conditions and outside factors like weather and social intent. Furthermore, the shift toward ensemble machine learning models like XGBoost and Random Forest provides the algorithmic evidence needed to handle the project's complex, high-dimensional data without the lag of heavier systems. These references validate the study’s approach by combining decentralized user reports with physical road data and environmental factors, the system can overcome data fragmentation to provide the "actionable knowledge" required for proactive expressway management.
2.1.2.1 Multisource Data Integration in Traffic Systems
For dealing with the specific problem of missing data and anomalies, robust data fusion techniques are required. Wang, Hao, and Jin (2021) demonstrate an effective data fusion methodology by combining conventional hardware sensor data with toll collection data. Because raw sensor data frequently suffers from missing values due to faulty equipment, spatiotemporal dependency modeling restores the missing data while utilizing accurate toll logs to validate overall traffic volumes. Leinonen et al. (2024) further point out that relying on single-source data is inadequate for representing complex traffic behaviors; integrating diverse data sources significantly improves the accuracy and reliability of predictive models compared to using isolated datasets.
Beyond traditional statistical equations, processing high-dimensional, multisource tabular data requires the robust implementation of ensemble machine learning techniques. Ye et al. (2024) emphasize the efficacy of tree-based ensemble models in capturing the complex, non-linear relationships present in traffic datasets without the computational overhead associated with deep neural networks. Furthermore, Sun et al. (2021) highlight that Extreme Gradient Boosting (XGBoost) architectures successfully capture intricate spatiotemporal dependencies when trained on high-resolution data. Utilizing these gradient-boosting methodologies will allow the system to reliably handle missing sensor values and high-dimensional features, ensuring robust, high-speed predictive capabilities for expressway forecasting.
The studies provide the technical validation for multisource data architecture, specifically supporting the decision to fuse diverse datasets to overcome the limitations of single-source monitoring. By establishing that data fusion and ensemble machine learning models such as XGBoost and Random Forest are highly effective at handling fragmented or missing information, the literature justifies the study’s data engineering pipeline. These studies prove that integrating heterogeneous sources like toll logs and external data is essential for capturing the complex, non-linear relationships of expressway traffic. Ultimately, this anchors the project’s predictive engine in industry-standard methodologies, ensuring that the system can reliably process high-dimensional data to achieve accurate vehicle count and congestion forecasts.
2.1.2.2 Crowdsourcing and Real-Time Traffic Data Collection
To reduce the inconsistency of information obtained through crowdsourcing, Yu et al. (2024) proposed a decentralized blockchain-based reputation scheme. Through the continuous update of a dynamic reputation score of each mobile user, this consensus algorithm can automatically verify the accuracy of the information, such that any malicious or erroneous information is filtered out before it affects the prediction models.
These studies validate the use of crowdsourced data for faster incident detection compared to traditional sensors. Integrating reputation filtering will allow the system to reliably identify accidents and road anomalies in real-time, providing a mathematically verified basis for user-reported NLEX information.


2.1.2.3 External Factors Affecting Traffic Patterns
Mejia and Sigua (2018) determine that rainfall intensity results in a significant degradation of critical traffic stream characteristics along the North Luzon Expressway (NLEX). Their research quantifies that heavy rainfall reduces average vehicle speeds by as much as 7.4% and reduces overall road capacity by up to 17.44%, emphasizing the significance of rainfall as an external variable in forecasting expressway traffic. Furthermore, current national guidelines underscore the need for active traffic management (ATM) strategies to incorporate non-recurrent factors, including severe weather and unplanned events, using real-time information to optimize lane use and speed limits (National Academies of Sciences, Engineering, and Medicine, 2024). This proactive approach mathematically adjusts capacity forecasts, ensuring that predictions remain accurate during non-typical road conditions.
Beyond environmental conditions, planned regional events serve as critical external variables that drastically alter normal expressway operations. Giuliano and Lu (2021) demonstrate that large planned events, such as stadium concerts or sports matches, generate localized, non-recurrent congestion surges that purely historical time-series models systematically fail to predict. Their research emphasizes that accurately estimating these impacts requires integrating event-specific metadata such as event schedules and venue capacities directly into the predictive architecture.
Incorporating this Social Intent Data as an exogenous input will enable the SmartFlow NLEX system to proactively anticipate severe volume spikes around major corridor venues (such as the Philippine Arena). This will ensure the forecasting engine remains mathematically accurate even during severe weather and massive non-standard cultural events.
### 2.1.3 Descriptive Analytics for Traffic Systems
In transportation research, descriptive analytics acts as an essential exploratory phase that transforms raw urban sensor data into structured insights for understanding historical traffic dynamics. Through techniques like data summarization and visual analytics, researchers effectively map traffic volumes and isolate recurring congestion trends over space and time (Bachechi et al., 2022) Furthermore, utilizing unsupervised machine learning methods like clustering allows for the objective categorization of these traffic states without researcher bias. Ultimately, this systematic analysis reduces computational complexity and establishes the foundational baseline required to build robust, advanced forecasting and decision-support systems (Attioui & Lahby, 2025).
These establish the importance of the project’s initial exploratory phase. By using data summarization and clustering, the study can objectively identify historical traffic trends, creating the necessary baseline for more advanced predictive and prescriptive features.

2.1.3.1 Traffic Volume Trend Analysis (Time Series Aggregation)
Traffic volume trend analysis fundamentally begins with the descriptive analytics and visual aggregation of highly variable spatio-temporal data. To uncover structural patterns within continuous traffic flows, researchers aggregate raw observations across specific temporal dimensions, such as by day of the week, month, or year. This systematic approach allows analysts to isolate recurring routines from irregular fluctuations and effectively map the evolution of traffic over both time and space (Bachechi et al., 2022).
Beyond visual mapping, a deeper analysis of recurring traffic patterns requires formal time-series analysis techniques. Hyndman and Athanasopoulos (2021) establish that raw, high-dimensional traffic volume data can be systematically decomposed into specific structural elements: the underlying long-term trend, seasonal variations, and cyclical components. Understanding these decomposed elements, along with mathematically evaluating their autocorrelation functions (ACF) and partial autocorrelation functions (PACF), provides the necessary mathematical foundation for determining the most appropriate statistical parameters to deploy for future forecasting.
These studies provide the mathematical framework for decomposing NLEX traffic into trends and seasonal cycles. This validates the project’s approach of isolating recurring routines from irregular spikes, ensuring the forecasting model is built on a structured understanding of historical volume patterns.


2.1.3.1.1 STL (Seasonal-Trend Decomposition using LOESS) & Rolling Mean
To handle high-frequency time series data, Hyndman and Athanasopoulos (2021) extend the classical Seasonal-Trend Decomposition using LOESS (STL) into the Multiple Seasonal-Trend decomposition (MSTL) framework. Their research demonstrates its effectiveness on traffic counts that exhibit multiple overlapping seasonal cycles simultaneously, such as daily peak-hour patterns and weekly holiday surges.
By isolating these components, SmartFlow NLEX will objectively distinguish between the structural growth DMANin vehicle volume and recurring seasonal fluctuations, providing a clean baseline for downstream forecasting. Furthermore, the author defines the Rolling Mean as a fixed-window arithmetic smoothing operation that averages recent observations. Because NLEX traffic data is characterized by high short-term volatility from lane incidents, applying a rolling mean will effectively suppress noise and expose the true underlying traffic trend.

2.1.3.1.2 ACF and PACF Analysis (Autocorrelation Function and Partial Autocorrelation Function)
Understanding decomposed elements requires formally evaluating their statistical correlation over time. Hyndman and Athanasopoulos (2021) explain that Autocorrelation Function (ACF) and Partial Autocorrelation Function (PACF) analysis mathematically quantifies the linear dependence between current and past observations in a time series.
Applying these mathematical functions provides analysts with the exact parameters needed to configure predictive algorithms. Deretić et al. (2022) corroborate this by demonstrating that evaluating ACF and PACF thresholds is a mandatory prerequisite for successfully configuring SARIMA forecasting engines, ensuring the model understands exactly how many historical lags influence the current traffic state.
By applying ACF and PACF analysis, the system will accurately determine the optimal lag intervals and cyclical thresholds needed to configure the predictive engines. This will ensure that historical NLEX traffic patterns are mathematically mapped and validated before any forecasting algorithm begins processing.
2.1.3.2  Peak Hour and Congestion Pattern Analysis
Bachechi et al. (2022) demonstrate that macroscopic traffic congestion can be systematically categorized into distinct daily patterns by analyzing time-varying Traffic Performance Index (TPI) data. By utilizing clustering algorithms, researchers can map out specific congestion profiles driven by peak hour behaviors, separating them into distinct categories such as ordinary weekdays, congested weekdays, weekends, and holidays. For example, these patterns reveal that certain days (like Mondays) are characterized by prominent morning peaks, while others (like Fridays) exhibit dominant evening peaks. Understanding these structured, time-varying peak patterns is essential for traffic managers to accurately predict severe congestion dates and deploy targeted control measures across the urban road network.
The use of clustering to categorize NLEX congestion profiles, such as morning versus evening peaks supports the system’s ability to account for spatiotemporal variations, ensuring that management strategies are targeted toward specific bottleneck locations during peak travel times.

2.1.3.2.1 Gaussian Mixture Model (GMM) for Traffic Regime Classification
While cluster-based methods like k-means are commonly applied to categorize traffic states, they impose rigid, spherical cluster boundaries that fail to capture the naturally continuous and overlapping transitions between traffic regimes such as the gradual degradation from free-flow to congested conditions. To address this limitation, the Gaussian Mixture Model (GMM) provides a more mathematically rigorous unsupervised classification framework. As demonstrated by Smelyakov et al. (2023) in their analysis of building advanced regression and classification models for traffic flow, continuous algorithms fit a weighted combination of distributions to observed speed-flow data, enabling the model to probabilistically assign each observation to a distinct traffic regime without imposing hard boundaries.
This approach allows the system to discover the natural statistical structure of NLEX's congestion severity levels defining Traffic Performance Index (TPI) classes such as free-flow, transitional, and congested states directly from the data rather than from arbitrarily pre-defined thresholds. By grounding the congestion classification in the empirical distribution of historical speed-flow observations, the GMM-derived regime boundaries serve as a statistically validated foundation for the predictive and prescriptive models in subsequent analytical phases.

2.1.3.2.2 Speed-Flow Fundamental Diagram
To visually and mathematically define the boundaries of traffic congestion, researchers rely on established macroscopic traffic flow theory. Afrin and Yodo (2020) demonstrate that the Macroscopic Fundamental Diagram (MFD) effectively captures the network-wide relationship between traffic density, flow rate, and average speed.
Utilizing a speed-flow fundamental diagram will allow the system to map the exact operational capacity of the NLEX corridor, providing operators with a clear visual and mathematical threshold of exactly when traffic degrades from a free-flow regime into a congested state.
2.1.3.3 Event-Based and Holiday Traffic Analysis
Planned major events and holidays serve as key sources of localized, non-recurrent congestion that disrupt normal traffic operations. To effectively analyze these variations, Makridakis et al. (2022) demonstrate that applying STL calendar decomposition successfully isolates specific holiday travel behaviors from long-term structural traffic trends.
Furthermore, to quantitatively isolate the traffic impact of a specific regional arena event, Giuliano and Lu (2021) apply a Control-Day Comparison methodology. Their research shows that pairing each event day with a statistically equivalent non-event baseline day effectively measures net incremental volume surges. To complement this, automated anomaly detection isolates sudden, unexpected volume spikes, while Poisson regression provides a robust statistical framework for modeling the frequency of these discrete traffic surges over time.
Implementing these combined methodologies will enable the SmartFlow NLEX system to mathematically calculate event volume uplift percentages and anticipate peak hour shifts, transforming unpredictable holiday anomalies into manageable data patterns.
2.1.3.4 Location-Based Hotspot Analysis
Utilizing Geographic Information Systems (GIS) and spatial autocorrelation techniques allows proponents to systematically map historical crash data to uncover underlying spatial patterns. By evaluating how accident locations relate to surrounding geography, this analytical approach pinpoints specific highway segments with statistically significant clusters of severe crashes, prioritizing areas that require targeted safety interventions (Alam & Tabassum, 2023).
2.1.3.4.1 Spatial Density Estimation and Hotspot Mapping
Converting discrete incident data into a continuous spatial density surface requires non-parametric kernel estimation. Berhanu et al. (2023) establish that Network-Constrained Kernel Density Estimation (NKDE) restricts density estimation to the actual road network topology, ensuring that estimated density propagates only along connected road segments, which will produce a topologically accurate representation of chronic incident hotspots along the NLEX corridor. To validate these findings, Alam and Tabassum (2023) demonstrate that the Getis-Ord Gi* statistic computes a z-score for each segment, identifying areas where high incident rates cluster beyond random chance, resulting in a spatially validated map of high-risk zones for expressway operators.
2.1.3.5 Incident Frequency and Severity Analysis
To establish a baseline for proactive traffic management, descriptive analytics must first quantify historical crash patterns and recovery metrics. Evaluating the historical frequency distribution of incidents alongside their severity levels provides a structured understanding of network vulnerability (Grigorev et all., 2024). To measure operational efficiency, Islam et al. (2021) highlight the importance of tracking the Mean Time to Clear (MTTC) per incident type as a core metric for evaluating freeway incident resolution.
Mapping these clearances into a visual response time distribution, analysts can identify temporal bottlenecks in emergency operations that often lead to further network degradation. Consequently, tracking the secondary incident rate, the percentage of crashes caused by the queue of an existing primary incident, is critical for comprehensive safety evaluation.
By combining these metrics into a Severity-Weighted Incident Index, the SmartFlow NLEX system will systematically categorize historical disruptions, ensuring that downstream predictive models accurately weigh high-impact, long-duration events heavier than minor anomalies.

2.1.3.6 Weather-Condition Traffic Impact Analysis
To understand the exact operational degradation caused by adverse weather, descriptive analytics must quantify how varying precipitation levels impact macroscopic traffic stream characteristics. By employing weather-stratified volume analysis, researchers can mathematically isolate and compare traffic behaviors across specific environmental states (Romanowska & Budzyński, 2022). Beyond volume reductions, evaluating corridor safety requires rainfall-incident correlation analysis to map how precipitation dynamically interacts with crash frequencies. By generating a rainfall-incident correlation matrix, the system will visually expose these dependencies and calculate a Relative Incident Risk Ratio, explicitly comparing crash probabilities under wet versus dry conditions.
Weather impacts both flow and safety by altering driver behavior. These studies about Weather-Condition Traffic Impact supports the project's inclusion of real-time weather data to adjust speed and capacity forecasts, ensuring the system reflects how rain or low visibility actually slows down NLEX traffic.

2.1.3.6.1 Mejia and Sigua Speed-Reduction Model
Applying generalized weather impacts to a localized environment requires tailored mathematical constants. Specifically for the NLEX corridor, integrating the Mejia and Sigua (2018) speed-reduction model allows analysts to empirically calculate how escalating rainfall intensity proportionately degrades free-flow speeds and overall road capacity. Implementing this localized model will enable the SmartFlow NLEX system to automatically output a speed reduction table segmented by rainfall band, providing operators with precise, data-driven thresholds for predicting weather-related traffic bottlenecks.
2.1.3.7 Traffic-Driven Carbon Emission Estimation
To accurately evaluate the environmental footprint of expressway operations, descriptive analytics must establish a robust baseline of historical carbon outputs. By utilizing real-time traffic volume data alongside the Macroscopic Fundamental Diagram (MFD), transportation managers can continuously monitor how fluctuating traffic states directly influence the total volume of carbon emissions. Precise quantification requires integrating standardized frameworks like COPERT IV or EMFAC emission factors, which assign distinct emission coefficients based on vehicle classifications and speeds. However, traditional calculations often underestimate the environmental impact of severe congestion by only measuring travel distance. Incorporating delay-weighted emission accounting solves this by capturing the excess greenhouse gases produced during prolonged idling and stop-and-go conditions (Afrin & Yodo, 2020).
By applying these combined methods, the SmartFlow NLEX system will calculate the exact Delay-Induced Carbon Excess (kg) and visualize these fluctuations through an Hourly Emission Profile Curve, ultimately generating a comprehensive monthly total corridor CO₂ summary for operators.
2.1.3.8 Vehicle Classification and Fleet Mix Analysis
Understanding the specific composition of a fleet mix is essential because the interactions between different vehicle classes fundamentally alter overall traffic dynamics and driver behavior. Under mixed traffic conditions, varying proportions of heavy vehicles, passenger cars, and smaller transport significantly impact the headways drivers maintain. For instance, an increased share of slower or heavy vehicles often leads to the frequent formation of platoons, as drivers of different vehicle classes adjust their following distances based on the size, braking dynamics, and specific lead-lag combinations of the surrounding fleet.
Consequently, analyzing the fleet mix provides critical insights into the microscopic interactions that dictate macroscopic traffic flow and capacity limitations ((Wang, P. et al., 2021). Through the "fleet mix" (the ratio of cars to heavy trucks), the project can better account for the microscopic interactions, such as platoon formation, that dictate the overall capacity of the NLEX corridor.

2.1.3.9 Descriptive Geospatial Analysis using Heatmaps
Descriptive geospatial analysis relies heavily on advanced visualization techniques to interpret massive volumes of spatio-temporal data for continuous traffic management. By integrating traffic sensor observations into interactive decision-support dashboards, researchers and public authorities can visually track the geographic evolution of traffic conditions over time. These geospatial visualizations, often utilizing color gradients or heatmaps to represent data intensity, enable analysts to efficiently pinpoint congested expressway sections, monitor dynamic traffic flows, and translate complex spatial data into actionable insights for infrastructure monitoring (Bachechi et al., 2022).
In the realm of transportation safety and incident management, geospatial analysis is frequently applied to visualize the spatial distribution of adverse traffic events. By employing point density techniques and geographic mapping, researchers can generate heatmaps that clearly highlight high-risk accident hotspots across a regional road network. This method of visually clustering event data not only simplifies the interpretation of complex geographic patterns but also provides the critical, location-based evidence necessary to prioritize specific corridors for targeted safety interventions and infrastructural improvements (Berhanu et al., 2023).
Through the use of heatmaps and color gradients in the SmartFlow Dashboard these visual tools will be essential for translating complex spatio-temporal data into "actionable insights," allowing operators to instantly see where congestion or accidents are concentrating.
### 2.1.4 Predictive Analytics for Traffic Forecasting
The ability to accurately predict traffic conditions represents a core element of contemporary Intelligent Transportation Systems (ITS), shifting urban traffic management from reactive observation to proactive mitigation (Shaygan et al., 2022). While predictive algorithms efficiently handle short-term route planning using continuous streaming data, long-term forecasting projects network conditions weeks into the future. This extended horizon requires robust analytical models capable of addressing highly complex, non-linear spatiotemporal dependencies and sudden, non-recurrent anomalies (Attioui & Lahby, 2025).
To effectively implement these diverse forecasting horizons, modern Intelligent Transportation Systems rely heavily on advanced deep learning architectures. Processing massive datasets of historical traffic flow and real-time vehicle counts requires specialized neural networks capable of learning sequential dependencies without suffering from severe prediction degradation (Leinonen et al., 2024). Specifically, architectures such as Long Short-Term Memory (LSTM) networks prove essential for analyzing these complex time-series patterns, accurately projecting travel times, and mitigating congestion even under highly volatile conditions (Attioui & Lahby, 2025).
By distinguishing between short-term streaming data and long-term historical patterns, the SmartFlow NLEX system will provide both immediate route-planning insights and robust multi-day traffic projections. Furthermore, the integration of advanced neural networks will allow the predictive engine to effectively handle the complex, non-linear dependencies of expressway traffic. Anchored in modern ITS standards, these methodologies will ensure that the system successfully transforms raw time-series data into highly reliable, proactive forecasts for the NLEX corridor.
2.1.4.1 Time-Series Forecasting Models for Traffic, Incident, and Sustainability Data
2.1.4.1.1 Prophet Forecasting Model
To establish a foundation for volume forecasting, literature emphasizes the use of models that can mathematically decompose structural seasonality from irregular temporal fluctuations. Torres et al. (2021) establish that deep learning approaches often require advanced filtering mechanisms to handle massive temporal volatility in time-series data without suffering from severe prediction degradation.
When this architecture is fused with deep learning approaches, the Prophet forecasting model operates as an advanced filtering mechanism. Liu et al. (2023) demonstrate that Prophet efficiently isolates macro-level seasonal volume trends, leaving only the complex, non-linear residual errors for complex neural networks to process.
Traditional statistical models frequently break down and produce severe errors during sudden, non-recurrent traffic surges. To counteract this, the SmartFlow NLEX system will deploy the Prophet architecture as its primary event-aware engine. Integrating this model will ensure the predictive backend maintains high mathematical accuracy around non-standard days, specifically targeting unpredictable volume surges during the Holy Week exodus or major scheduled events at the Philippine Arena.

2.1.4.1.2 Seasonal Autoregressive Integrated Moving Average (SARIMA)
Forecasting the frequency of accidents and general highway volumes requires addressing pronounced seasonal unevenness and temporal volatility. Deretić et al. (2022) establish that the Seasonal Autoregressive Integrated Moving Average (SARIMA) model serves as an ideal analytical tool for this task by systematically modeling non-stationarity both within distinct seasonal periods and between them.
By applying mathematical differencing to smooth out erratic data points, the model extracts pure linear relationships and recurring cyclical trends from highly volatile traffic datasets. Hyndman and Athanasopoulos (2021) corroborate this, demonstrating that autoregressive techniques provide the foundational statistics necessary to separate underlying trend signals from random, non-recurrent traffic noise.
Traffic crashes and congestion patterns follow distinct seasonal timelines rather than occurring entirely at random. Recognizing this, the SmartFlow system will rely on specifically tuned SARIMA configurations. Utilizing this model will provide the architecture with the necessary mathematical foundation to successfully separate "normal" seasonal fluctuations such as Friday rush hours from sudden, unpredictable expressway anomalies.

2.1.4.1.3 SARIMAX Model
While standard time-series models handle internal historical data effectively, they are completely blind to outside environmental forces. Hyndman and Athanasopoulos (2021) establish that extending traditional frameworks into SARIMAX architectures addresses this limitation by allowing for the explicit integration of exogenous variables, or external regressors, directly into the forecasting equation.
This multivariate approach allows analysts to mathematically map how outside factors actively alter historical trends. Romanowska and Budzyński (2022) demonstrate that integrating specific external variables, such as adverse weather conditions and time of day, vastly improves the predictive accuracy of models evaluating macroscopic traffic flow characteristics.
Expressway volumes and accident risks are heavily dictated by external environmental conditions that standard historical models cannot foresee. Implementing the SARIMAX model will serve as a critical integration point for the system's weather data to bridge this gap. This architecture will ensure that varying rainfall intensities are mathematically factored into the predictive engine, allowing the system to automatically generate weather-adjusted dynamic volume forecasts.

2.1.4.1.4 Holt’s Linear Trend Model
Addressing continuous traffic data requires statistical methods capable of separating signal from noise. Hyndman and Athanasopoulos (2021) establish that the Holt-Winters method provides a robust mathematical baseline for capturing underlying trends and seasonal fluctuations in continuous time-series data without requiring the complex computational overhead associated with deep learning.
By applying distinct smoothing constants for the baseline level, the overarching trend, and the seasonal cyclicity, the algorithm isolates the fundamental growth trajectory of a dataset. Makridakis et al. (2022) emphasize that establishing a reliable, computationally lightweight baseline using methods like Holt-Winters is a necessary prerequisite to effectively benchmark resource-heavy machine learning layers.
Establishing a reliable, computationally lightweight baseline is a necessary prerequisite before applying resource-heavy machine learning. Consequently, the project will utilize the Holt-Winters method as its foundational forecasting layer. Deploying this statistical algorithm will allow the system to rapidly establish fundamental 24-hour volume projections, serving as the mathematical anchor for all subsequent predictive analytics across the expressway.

2.1.4.2 Machine Learning Models for Traffic, Incident, and Sustainability Prediction
2.1.4.2.1 Random Forest Regression
Processing high-dimensional traffic and emissions data requires ensemble learning algorithms capable of capturing complex non-linear relationships while aggressively avoiding data overfitting. Smelyakov et al. (2023) emphasize that Random Forest (RF) algorithms achieve this by applying an averaging mechanism across multiple, independent decision trees that are fitted on random subsets of the overall dataset.
By forcing these diverse trees to "vote" on the final output, the model drastically reduces prediction variance and effectively neutralizes anomalous sensor noise. Ye et al. (2024) corroborate this, confirming that tree-based ensemble models successfully capture complex, non-linear relationships present in fragmented traffic datasets without the severe computational overhead associated with deep neural networks.
Processing thousands of daily vehicle records across multiple toll gates requires robust, high-dimensional filtering that resists anomalous sensor noise. Deploying Random Forest will allow the SmartFlow backend to reliably classify spatial incident risks and predict baseline volume disruptions without suffering from the severe overfitting common in standard, single-tree regression models.

2.1.4.2.2 Quantile Random Forest (QRF)
Standard predictive approaches typically yield only single point estimates, producing exact expected values that fail to reflect the inherent underlying uncertainty in dynamic traffic conditions. Yao and Graham (2025) establish that to address this operational gap, the Quantile Random Forest (QRF) algorithm extends the traditional framework by retaining the full empirical distribution of target values.
Instead of yielding a single deterministic number, this algorithm generates comprehensive prediction intervals. Yao and Graham (2025) further demonstrate that this provides a probabilistic range of expected outcomes, effectively mapping the statistical likelihood of extreme traffic volumes occurring simultaneously across an urban corridor.
Providing a single forecasted number is often insufficient for risk-aware, proactive traffic management. Utilizing QRF will provide NLEX operators with a mathematically grounded prediction interval to solve this limitation. This approach will allow the system to output the absolute minimum and maximum expected traffic bounds, enabling authorities to better prepare emergency resources for worst-case scenarios.

2.1.4.2.3 Extreme Gradient Boosting (XGBoost)
For superior computational efficiency and sequential learning, gradient boosting algorithms are utilized across modern Intelligent Transportation Systems. Sun et al. (2021) detail how Extreme Gradient Boosting (XGBoost) architectures systematically build decision trees that specifically target and mathematically correct the residual errors left by previous iterations.
This aggressive, iterative error-correction process allows the model to capture highly intricate spatiotemporal dependencies with exceptional processing speed. Ye et al. (2024) reinforce this, confirming that XGBoost consistently achieves high predictive accuracy while maintaining minimal computational overhead when analyzing multidimensional traffic parameters.
Real-time mobile applications require backend models that compute and return queries rapidly to maintain usability. Deploying XGBoost will ensure the SmartFlow system minimizes user latency while maintaining precision. This boosting framework will provide high-speed, highly accurate predictive capabilities across both the network's volume forecasting engine and its incident severity classifier.

2.1.4.2.4 Gradient Boosting Classifier and Regressor (GBR)
Applying the gradient boosting framework to specialized tasks requires distinct mathematical objective functions based on the desired output. Ye et al. (2024) establish that Gradient Boosting Regressors (GBR) maintain the sequential error-correction logic of XGBoost but are specifically tuned to forecast continuous, numerical outputs.
In contrast, Gradient Boosting Classifiers are utilized to target discrete, categorical outcomes. Ye et al. (2024) demonstrate that utilizing these distinct frameworks simultaneously enables comprehensive system performance, allowing a single architecture to mathematically handle vastly different predictive targets.
SmartFlow must predict two entirely different data types simultaneously, necessitating distinct mathematical approaches. Integrating these specific architectural variations will allow the system to accurately calculate both continuous sustainability metrics, such as fluctuating CO₂ tonnage, and discrete categorical safety flags, such as specific accident severity levels.
2.1.4.2.5 Long Short-Term Memory (LSTM)
Modern Intelligent Transportation Systems increasingly rely on deep learning architectures to process massive, multi-source datasets spanning long horizons. Leinonen et al. (2024) establish that Long Short-Term Memory (LSTM) networks are specifically engineered to retain complex time-series patterns over extended periods without suffering from severe prediction degradation.
Within this domain, LSTM networks specifically address the vanishing gradient problem found in older neural networks. Attioui and Lahby (2025) demonstrate that by utilizing internal memory cells, LSTMs successfully learn the complex, long-term sequential dependencies that dictate severe traffic disruptions and non-recurrent congestion.
Traditional mathematical models routinely fail over extended forecasting horizons due to massive spatiotemporal complexities. Deploying this specific deep learning architecture will power the system's most advanced analytical tier to overcome these limitations. The LSTM networks will execute the system's core capability to generate highly accurate multi-day volume and emission forecasts required for long-term NLEX operational planning.
2.1.4.2.6 Spatial and Multivariate LSTM
Standard deep learning models process single-variable sequences, but urban traffic operates as a heavily interdependent physical network. Zheng et al. (2020) demonstrate that Spatial LSTMs and Multivariate LSTMs extend standard recurrent networks by allowing the direct mathematical incorporation of the physical road network topology.
This multidimensional capability enables the direct integration of diverse, simultaneous variables like vehicle counts, fleet mix classifications, and localized sensor data. Zheng et al. (2020) emphasize that this approach accurately captures how a bottleneck at one specific node mathematically impacts the nodes situated miles behind it, creating network-wide ripple effects.
An accident at one specific toll gate mathematically impacts the gates situated miles behind it. Implementing these advanced network architectures will enable the forecasting engine to model the expressway as a connected graph. This will allow the system to accurately account for multidirectional congestion propagation, predicting exactly how traffic shockwaves cascade across the NLEX corridor.
2.1.4.2.7 Gated Recurrent Unit (GRU)
While LSTMs are highly capable, handling the computational demands of real-time forecasting requires optimized network architectures. Hewamalage et al. (2021) establish that the Gated Recurrent Unit (GRU) functions as a streamlined recurrent neural network that utilizes an efficient gating mechanism.
This architectural efficiency drastically accelerates model training and inference speeds. Hewamalage et al. (2021) demonstrate that GRUs achieve comparable predictive accuracy to LSTMs but operate with significantly fewer mathematical parameters, significantly reducing the overall computational load on the system.
Heavy deep learning models can easily bottleneck application response times and drain server resources. Utilizing GRUs will ensure the system maintains high performance without sacrificing predictive power. This streamlined architecture will allow the backend to rapidly compute dynamic, weather-adjusted speed contours without causing excessive processing delay in the mobile user interface.
2.1.4.2.8 Geographically Weighted Regression (GWR)
Accurately predicting the lifecycle of highway incidents requires identifying the exact physical locations most vulnerable to disruption. Traditional global regression models assume that the relationship between accident predictors and crash frequency remains constant across an entire road network, which fails to account for localized geographic variations. Haowei et al. (2022) establish that Geographically Weighted Regression (GWR) directly addresses this limitation by effectively capturing the spatial non-stationarity of crash predictors.
To achieve this localized accuracy, the GWR model applies a spatial weighting kernel that allows regression coefficients to vary continuously across the actual physical landscape. Haowei et al. (2022) demonstrate that this mathematical approach explicitly acknowledges that physical road geometry, such as specific curve radiuses or merge lanes, fundamentally alters accident probability. By evaluating the local rather than global relationships between traffic volume, weather, and road design, GWR produces highly localized risk coefficients that accurately reflect the unique hazards of specific highway segments.
Physical road geometry dictates that not all segments of a highway are equally dangerous under identical weather or volume conditions. Implementing this spatial modeling framework will serve as a critical localization tool for the platform. Utilizing GWR will allow the system to output precise, segment-specific high-risk lists, adjusting predictive models based on the unique, localized geometric and environmental factors of different NLEX zones.
2.1.4.2.9 Negative Binomial Regression
Estimating the actual frequency of discrete crash counts requires addressing inherent statistical anomalies and spatial clustering in highway data. Deretić et al. (2022) demonstrate that traffic incident counts are highly volatile and exhibit pronounced temporal unevenness, requiring specialized statistical modeling to capture sudden accident spikes accurately.
Because crashes often cluster together during specific events, creating severe data overdispersion, researchers apply targeted spatial and statistical techniques. Alam and Tabassum (2023) emphasize that effectively modeling these discrete incident frequencies requires accounting for spatial pattern identification to successfully capture the true operational risk of specific highway hotspots.
Highway accident data is inherently skewed and highly volatile, rendering standard statistical distributions inadequate. Applying these targeted crash-frequency models will provide the SmartFlow predictive engine with a mathematically sound foundation to handle this variance. It will ensure the system accurately models the exact probability of future incident spikes, especially during severe weather events.
2.1.4.2.10 Ordinal and Logistic Regression
Beyond predicting the sheer frequency of events, assessing subsequent operational impact involves classifying the severity of an expected incident. Grigorev et al. (2024) establish that logistic regression and classification frameworks provide highly robust baselines for calculating binary outcomes, such as the probability of severe traffic delays or total road closures.
When evaluating the specific duration of traffic incidents, researchers must categorize the expected disruption accurately. Shang et al. (2022) demonstrate that applying robust classification models to multi-source incomplete data successfully predicts incident severity and clearance categories, allowing operators to deploy appropriate resources.
Operators must programmatically determine if an impending incident represents a minor shoulder stall or a major multi-lane collision to dispatch appropriate units. Integrating these classification models will allow the system to accurately classify expected severity levels and compute the binary probability of total road closures for any forecasted disruption.
2.1.4.2.11 Cox Proportional Hazard (Cox PH)
To actively project the network's recovery timeline after a disruption occurs, survival analysis methodologies are employed. Islam et al. (2021) demonstrate that the Cox Proportional Hazard (Cox PH) model operates as the standard mathematical framework for estimating highway incident clearance times.
This specific survival model estimates how external covariates multiplicatively accelerate or decelerate the total time required to clear an incident. Islam et al. (2021) establish that variables such as weather intensity or the number of vehicles involved directly alter the survival function of a traffic blockage.
The primary operational question following an accident is determining exactly when the corridor will reopen to regular traffic flow. Utilizing this survival framework will seamlessly generate probabilistically grounded clearance time predictions, providing operators with dynamic Mean Time to Clear (MTTC) countdowns for active expressway incidents.
2.1.4.2.12 Dirichlet Regression
Predicting the continuous evolution of transportation sustainability requires compositional outputs that must simultaneously sum to exactly one hundred percent. Dirichlet Regression explicitly addresses this mathematical constraint by treating fleet share proportions as a Dirichlet-distributed response variable, fitting coefficients to predict concentration parameters based on temporal shifts (Wang, P. et al., 2021).
Because the combined percentages of these vehicle classifications must always equal the total volume, researchers apply specialized compositional frameworks. The International Transport Forum and OECD (2023) reinforce this necessity, demonstrating that accurate environmental forecasting in the Philippines demands strict mathematical accounting of the heavy-duty fleet share.
The system cannot accurately forecast aggregate carbon emissions without first knowing the exact ratio of passenger cars to heavy diesel trucks. Implementing this compositional modeling approach will accurately predict the expected proportional ratios of NLEX vehicle classifications, enabling dynamic heavy vehicle surge predictions.
2.1.4.2.13 Polynomial Regression
When the relationship between dependent and independent variables is inherently non-linear, standard linear baselines fail to capture reality. Sunio et al. (2023) demonstrate that the relationship between vehicular traffic speed and greenhouse gas emissions is highly complex, as emissions spike severely during low-speed, stop-and-go congestion.
Polynomial Regression mathematically models these complex trajectories by introducing higher-order terms into the regression equation. Zhang, S. et al. (2024) establish that applying flexible, non-linear modeling frameworks successfully captures these extremes, providing an accurate representation of dynamic traffic emissions across varying congestion states.
Vehicular carbon emissions do not scale in a straight line; they spike severely during low-speed congestion as well as at extreme high speeds. Utilizing this polynomial framework will ensure the underlying baseline models accurately trace the complex, U-shaped curvature of traffic-driven carbon emissions along the corridor.
2.1.4.2.14 Monte Carlo Simulation
Evaluating the long-term effectiveness of sustainability policies requires testing against volatile and unpredictable variables through repeated sampling and statistical modeling. These simulation methodologies allow researchers to compute the exact probability distribution of complex outcomes, such as vehicular energy consumption and emission rates, under varying traffic conditions (Sagaama et al., 2024). By running thousands of iterations of different fleet mix combinations and pricing thresholds, these system-dynamics models provide a highly reliable virtual platform to validate mobility solutions and emission reduction policies before real-world deployment (Li et al., 2025).
Expressway carbon emissions fluctuate violently based on uncontrollable external factors, rendering a single deterministic forecast insufficient for policy making. Deploying Monte Carlo-style simulation approaches will allow the prescriptive engine to aggressively stress-test dynamic tolling recommendations and emission interventions. This will ensure that the SmartFlow system mathematically guarantees a reduction in CO₂ per class-km across a vast majority of randomized traffic scenarios.
2.1.4.3 Ensemble Forecasting Models
The integration of diverse algorithms into hybrid and ensemble frameworks is fundamental for managing traffic data complexities. Liu et al. (2023) demonstrate that fusing foundational statistical baselines with advanced neural networks allows systems to effectively process multimodal data and isolate complex residual errors during non-recurrent congestion.
Furthermore, utilizing ensemble learners effectively mitigates information variance and captures highly non-linear spatiotemporal dependencies. Ye et al. (2024) confirm that combining distinct algorithms, such as aggregated decision trees and LSTMs, systematically outperforms standalone models across large-scale transportation networks.
Relying on a single mathematical algorithm often yields fragile predictions during extreme, volatile traffic events. By integrating these advanced ensemble and hybrid techniques, the SmartFlow NLEX architecture will ensure its predictive engine cross-validates multiple data streams simultaneously, guaranteeing highly resilient and accurate real-time forecasts for both routine expressway congestion and sudden incident shockwaves.

### 2.1.5 Prescriptive Analytics in Traffic Systems
While descriptive analytics identifies historical patterns and predictive analytics forecasts future states, prescriptive analytics represents the pinnacle of the data maturity model. In the context of Intelligent Transportation Systems (ITS), prescriptive analytics merges predictive machine learning outputs with advanced mathematical optimization to recommend specific, optimal courses of action. The transition from prediction to action is the defining characteristic of modern prescriptive frameworks. According to Haydari and Yılmaz (2022) in their comprehensive review, the integration of Deep Reinforcement Learning (DRL) allows traffic systems to move beyond passive observation. By processing real-time predictive data, DRL agents can dynamically generate and disseminate traffic signal controls and routing decisions that actively mitigate real-world volatility.
By merging predictive outputs with mathematical optimization, the SmartFlow NLEX system will provide specific "optimal courses of action" for operators. This focus on programmatic intervention will ensure the system's prescriptive engine can recommend real-time countermeasures, such as dynamic rerouting or lane adjustments, to minimize total network delay times and reduce localized emissions. Ultimately, executing this framework will prove that the project follows the highest level of the data maturity model, turning traffic "insight" into actionable "intervention."

2.1.5.1 Prescriptive Models and Decision Strategies
2.1.5.1.1 What-If Analysis and Scenario Simulation
Scenario simulation is a foundational decision-support mechanism that allows traffic operators to safely test hypothetical strategies in a virtual environment before real-world deployment. According to Rudskoy et al. (2021), it is heavily integrated through ITS virtual simulation platforms. These platforms maintain a synchronized virtual replica of the physical road system, enabling runtime "what-if" explorations. When a predictive model flags a sudden environmental shift, the virtual replica reconstructs the current traffic state to perform accelerated policy simulation.
Expanding on the environmental utility of simulation, microscopic platforms serve a vital role in validating sustainability interventions. Sagaama et al. (2024) demonstrate how simulation environments like SUMO are utilized for prescriptive emissions testing. By running "what-if" scenarios, researchers explicitly measure how dynamic eco-routing techniques impact vehicular energy consumption, proving that prescribing optimized routes significantly reduces network-wide emissions prior to physical execution.
Utilizing this technology to test hypothetical lane closures, the SmartFlow Visual Sandbox will provide a virtual environment where operators can safely validate strategies before real-world deployment. This capability will ensure that prescribed interventions effectively mitigate congestion without risking physical road safety or exacerbating carbon emissions.
2.1.5.1.2 Rule-Based Decision Models
Rule-based decision models rely on pre-programmed operational thresholds and domain expertise to automate immediate responses to dynamic traffic conditions. As highlighted by Shah et al. (2024), knowledge-driven decision support tools provide deterministic, high-speed decision-making. If sensors detect that traffic volume exceeds a specific threshold, the rule-based system instantly evaluates the scenario and triggers response plans, acting as a highly reliable backbone for the critical initial minutes of incident response.
To handle the inherent uncertainty of real-world traffic data, modern rule-based systems frequently incorporate continuous logic frameworks to avoid rigid, binary failures. M.E.M. Ali et al. (2021) explore how Fuzzy Rule-Based Systems (FRBS) evaluate traffic volume and speed on a continuous spectrum rather than a binary trigger. This nuanced evaluation allows engines to recommend graduated, smoothed responses that adapt seamlessly to evolving congestion states.
By incorporating Fuzzy Logic algorithms, the project will reliably recommend graduated responses such as slowly reducing speed limits leading into a congestion zone. This automated, rule-based approach will smooth out abrupt traffic shockwaves, providing a deterministic backbone for the system’s real-time alerts while directly reducing the idling associated with high vehicular carbon emissions.
2.1.5.1.3 Traffic Optimization Models (Linear Programming)
To mathematically maximize the efficiency of a road network, traffic flow problems are frequently abstracted using mathematical programming. In these frameworks, highway intersections act as vertices, and road segments act as edges with strict capacity constraints based on physical volume limits. This mathematical abstraction allows systems to identify the absolute most efficient routing pathways by systematically eliminating suboptimal vehicle distributions.
Applying these deterministic concepts to active traffic management, researchers utilize specific linear frameworks to handle complex vehicle maneuvers. Ma et al. (2022) apply Mixed-Integer Linear Programming (MILP) to formulate trajectory and routing as an optimization problem with strict penalties for inefficiency. In cases of sudden capacity drops, MILP computes optimal traffic redistribution across lanes to avoid congestion and streamline mixed traffic environments.
Applying these deterministic optimization frameworks to the NLEX corridor will allow the SmartFlow system to calculate the exact, optimal distribution of vehicles required to maximize throughput. By representing the expressway as a mathematically constrained network, the system will generate highly efficient routing decisions that prevent bottlenecks and minimize the overall corridor carbon footprint.
2.1.5.1.4 Fuzzy Rule-Based Decision Models
Rule-based decision models rely on pre-programmed operational thresholds to automate immediate responses to dynamic traffic conditions. Shah et al. (2024) emphasize that knowledge-driven decision support tools provide deterministic, high-speed decision-making during critical incident response. If sensors detect that traffic volume exceeds a specific threshold, the rule-based system instantly evaluates the scenario and triggers predefined response plans, acting as a highly reliable backbone for traffic management.
To handle the inherent uncertainty of real-world traffic data, modern rule-based systems frequently incorporate continuous logic frameworks to avoid rigid, binary failures. M.E.M. Ali et al. (2021) explore how Fuzzy Rule-Based Systems (FRBS) evaluate traffic volume and speed on a continuous spectrum rather than a rigid trigger. This nuanced evaluation allows algorithmic engines to recommend graduated, smoothed responses that adapt seamlessly to evolving congestion states rather than deploying abrupt, disruptive interventions.
By incorporating Fuzzy Logic algorithms, the SmartFlow NLEX system will reliably evaluate peak Volume-to-Capacity (V/C) ratios to trigger graduated interventions. This automated approach will smooth out abrupt traffic shockwaves by issuing precisely timed counter-flow lane advisories and severe congestion operator alerts before bottlenecks reach critical network capacity.
2.1.5.1.5 TOPSIS and Multi-Criteria Decision Analysis (MCDA)
Managing major expressway operations requires balancing conflicting operational goals, such as maximizing incident clearance speed while minimizing overall environmental impact. The National Academies of Sciences, Engineering, and Medicine (2024) establish that Multi-Criteria Decision Analysis (MCDA) frameworks systematically evaluate these competing factors to formulate optimal active traffic management strategies. To operationalize this filtering process during critical decision-making, Grigorev et al. (2024) demonstrate that utilizing the TOPSIS (Technique for Order of Preference by Similarity to Ideal Solution) framework allows systems to strictly rank various traffic intervention strategies based on their mathematical proximity to the best possible outcome.
This ranking methodology evaluates complex interventions based on their simultaneous ability to optimize resource efficiency and minimize negative externalities. Li, X. et al. (2025) emphasize that integrating simulation models with MCDA frameworks like TOPSIS allows policymakers to explicitly evaluate alternative strategies based on their dual ability to mitigate physical congestion and reduce carbon emissions. By systematically scoring each proposed action against these multiple, often conflicting criteria, the algorithm ensures that the most mathematically sound and balanced strategy is surfaced to traffic operators.
Implementing TOPSIS as a core ranking mechanism will allow the SmartFlow Dashboard to automatically filter and prioritize a wide array of operational strategies across the platform. Whether calculating the most efficient patrol deployment map to minimize alert lead times or ranking heavy-vehicle lane restrictions for the sustainability dashboard, the system will ensure that prescribed interventions perfectly balance emergency response efficiency with overarching CO₂ reduction targets.
2.1.5.1.6 Heuristic-Based Traffic Strategies
While mathematical programming provides optimal solutions, it often requires massive computational power that is impractical for real-time adjustments across a sprawling expressway network. To solve complex optimization problems rapidly, modern traffic systems employ artificial intelligence and heuristic algorithms to generate viable traffic control strategies under severe time constraints (Shaygan et al., 2022).
The flexibility of heuristic-driven decision support systems makes them particularly suited for active traffic management during sudden emergencies. Chung et al. (2020) demonstrate that these rapid-response frameworks continuously update prescriptive paths as underlying traffic volumes shift. This allows responders and commuters to bypass bottlenecks efficiently without waiting for exhaustive linear computations to finish.
While linear programming provides precise mathematical minimums, heuristic algorithms are essential for rapid incident response. Integrating these methods will support the system’s ability to instantly generate viable rerouting measures for emergency vehicles and commuters during sudden crashes, where computational speed is vastly more critical than absolute mathematical perfection.
2.1.5.1.7 Sustainability-Aware Traffic Optimization
Sustainability-aware traffic optimization serves as the ultimate prescriptive synthesis of modern intelligent transportation systems. Recognizing the environmental toll of vehicular congestion, researchers explicitly target the reduction of carbon emissions based on dynamic traffic distribution across urban networks. Zhang, S. et al. (2024) demonstrate that investigating the effect of dynamic traffic distribution on network-wide emissions provides empirical evidence that traffic routing directly impacts regional carbon footprints.
Furthermore, evaluating the potential for reducing carbon emissions from urban traffic requires data-driven strategies that optimize vehicular flow to reduce an infrastructure's overall life-cycle environmental impact. Sunio et al. (2023) emphasize that minimizing vehicular dwell time and travel delays directly curbs greenhouse gas emissions, proving that active traffic management is inherently linked to environmental sustainability.
For the SmartFlow Dashboard, utilizing these predictive frameworks will prove that operators can evaluate real-world data and manually prescribe targeted interventions. This will empower management to implement dynamic toll strategies or prioritize heavy-duty vehicle flow to successfully enforce long-term sustainability targets without relying on fully autonomous AI execution.
2.1.5.1.8 Stochastic Linear Programming (SLP)
Standard optimization relies on deterministic variables, but modern transportation planning addresses the inherent unpredictability of traffic demand and incident outcomes by introducing probability distributions into mathematical frameworks. Stochastic modeling allows systems to account for significant uncertainty in incident clearance times and travel reliability (Islam et al., 2021). By assessing the expected value of information across probabilistic scenarios, these frameworks identify robust operational strategies such as optimal trajectory planning for mixed traffic that remain efficient despite sudden capacity drops (Ma et al., 2022)
By assessing the expected value of information across these probabilistic scenarios, these frameworks identify robust operational strategies that remain efficient despite sudden capacity drops. Ma et al. (2022) apply this mathematical rigor to formulate trajectory planning for connected vehicles, showing that optimization models must account for mixed traffic environments and unpredictable work zones to prevent secondary bottlenecks.
Incident clearance times and secondary accident risks on NLEX are highly probabilistic. By utilizing Stochastic LP within the prescriptive tier, the system will calculate dynamic response protocols that explicitly account for this uncertainty. This mathematical approach will ensure that the recommended patrol zone deployments remain optimal even if an incident takes longer to clear than initially predicted.








### 2.1.6 Geospatial Analysis and Traffic Visualization
Geospatial analysis serves as the foundational layer of modern transportation decision-intelligence systems, providing the visual framework needed to interpret large volumes of spatio-temporal traffic data. Bachechi et al. (2022) demonstrate that integrating traffic sensor observations into interactive dashboards using heatmaps and color gradients enables operators to efficiently pinpoint congested expressway sections and translate complex spatial data into actionable insights. Li, Z. and Li, D. (2022) further emphasize the integration of WebGIS to allow for dynamic interaction with urban traffic logistics, creating accessible interfaces for continuous infrastructure monitoring.
In the realm of transportation safety and incident management, geospatial analysis is frequently applied to visualize the spatial distribution of adverse traffic events. Berhanu et al. (2023) show that point density mapping of traffic events generates spatially validated hotspot visualizations, providing the location-based evidence necessary to prioritize specific corridors for targeted safety interventions. By using heatmaps and AI-driven virtual simulations, the system will reduce cognitive load for NLEX operators, bridging the gap between complex raw data and the proactive visualization needed for effective corridor management.
### 2.1.7 Agent-Based Traffic Simulation
Translating numerical forecasts into actionable strategies requires advanced spatial visualization, leading to the introduction of Agent-Based Modeling (ABM) to bridge the gap between data forecasting and physical traffic behavior (Bastarianto, 2022). This simulation methodology treats commuters as autonomous agents with specific mobility needs, allowing researchers to reconstruct complex travel patterns and emergent behaviors from individual-level rules.
By linking these traffic simulations with virtual replica platforms and game-engine visualizers, individual autonomous agents can be programmed to follow localized spatial rules. Rundel and De Amicis (2023) demonstrate that this integration allows system operators to visually observe how macroscopic congestion physically manifests at the microscopic level, effectively illustrating how individual vehicle decisions generate network-wide bottlenecks.
Numerical forecasts require visual context to be fully actionable. By deploying ABM within the dashboard, the project will successfully translate raw numbers into a visual simulation of digital vehicles. This spatial capability will allow NLEX operators to see exactly how individual driver behaviors, such as tailgating or sudden lane changes, physically create the predicted traffic jams.
### 2.1.8 Environmental Impact of Traffic Systems
2.1.8.1 Carbon Emissions and Traffic Congestion
Traffic congestion results in a substantial, measurable increase in environmental degradation due to excessive fuel consumption and the high levels of carbon emissions caused by long queues of idling vehicles (Afrin & Yodo, 2020). To properly estimate the environmental impact of a transportation network, Zhang, S. et al. (2024) emphasize the necessity of utilizing dynamic traffic distribution models that actively target the reduction of network-wide traffic emissions based on varying states of congestion.
Accurately tracking this pollution requires robust data engineering, as the energy consumption of different travel modes varies significantly based on engine type and load capacity. Failing to segment traffic volume by specific vehicle classes leads to massive underestimations of a corridor's true environmental footprint, necessitating a strict classification-based emission model to compute overall regional degradation accurately.

2.1.8.2 Theoretical Framework: National Emission Inventory Methodology
To translate this classification theory into actionable analytics, the overarching mathematical framework utilized by the system's backend is anchored on the Tier 1 methodology established by the Intergovernmental Panel on Climate Change (IPCC). Computed as the product of vehicle volume, distance traveled, and specific vehicle emission factors, this specific equation is legally mandated for transport sector emissions tracking.
According to the Implementation Plan for the Republic of the Philippines Nationally Determined Contribution (NDC) 2020-2030, this methodology serves as the official roadmap for the country's climate change mitigation (DENR & Climate Change Commission, 2024).
Adopting this exact computational standard will ensure that the SmartFlow system's environmental algorithms are legally and technically aligned with current Philippine national standards, providing highly defensible metrics for expressway operators.
2.1.8.3 Baseline Emission Metrics and Vehicle Classification
Guaranteeing the accuracy of environmental analytics requires stratifying traffic volumes into distinct vehicle classifications. The International Transport Forum and OECD (2023) demonstrate in a comprehensive Philippine transport study that heavy-duty freight vehicles (Class 3) require significantly higher emission multipliers due to the country's heavy reliance on older, diesel-powered logistics fleets.
Conversely, the baseline carbon footprint for private passenger vehicles (Class 1) requires distinct modeling. Rith et al. (2020) validate this approach in studies of Metro Manila's connecting networks, calculating the standard carbon footprint based on normal traffic volume across a specific segment distance (D) using the following baseline emissions formula:

By applying these localized, fleet-specific calculations, the SmartFlow NLEX system will generate a comprehensive environmental baseline for operators. The dashboard will categorize NLEX traffic volume strictly by class to ensure that heavy logistics vehicles are correctly weighted in the corridor's total carbon footprint.
2.1.8.4 Operational Efficiency and the Carbon "Idling Penalty"
Traditional calculations often underestimate the true environmental impact of severe congestion by only measuring travel distance under ideal conditions. Sunio et al. (2023) emphasize that measuring the excess greenhouse gases produced during prolonged vehicular dwell times and travel delays is essential for curbing overall highway emissions, as vehicles emit far more pollution during stop-and-go conditions than in free-flow traffic.
To operationalize this, transport systems calculate an "Idling Penalty" by determining the exact duration of a standstill (Tdelay) = Tcleared - Treported. Sunio et al. (2023) prove that applying a specific idling emission factor to this delay duration mathematically links operational dispatch efficiency to total greenhouse gas output using the following equation:

By mathematically translating operational dispatch efficiency into a scientifically backed reduction in excess carbon output, the dashboard will successfully enforce proactive environmental management. The system will calculate the exact Delay-Induced Carbon Excess caused by traffic incidents, visualizing these penalties for NLEX administrators.
2.1.8.5 API Integration for Dynamic Emission Factors
To avoid reliance on static estimations that quickly become outdated, modern environmental tracking requires robust data integration pipelines. Wang, P. et al. (2021) demonstrate that handling multi-source data fusion, such as combining live traffic metrics with continuously updated external databases, prevents analytical models from degrading and becoming misaligned with actual physical conditions over time.
Instead of manually referencing static agency documents, advanced backend architectures query centralized servers via standard REST APIs. Leinonen et al. (2024) establish that utilizing continuous API requests to retrieve external variables ensures that the underlying scientific constants driving predictive models remain perfectly aligned with current, real-world data.factors  and idling multipliers . This continuous integration allows the platform to accurately execute the baseline carbon footprint equations established by Rith et al. (2020) and the dwell-time penalty metrics formulated by Sunio et al. (2023) without relying on outdated manual inputs.
Utilizing the Climatiq API for this dynamic retrieval will ensure the variables utilized in the SmartFlow mathematical models remain continuously updated to the latest environmental regulations. This backend architecture guarantees that the dashboard computes the exact carbon footprint dynamically, entirely eliminating the need for manual code refactoring by system administrators.
### 2.1.9 Model Evaluation and Validation Techniques
2.1.9.1 Forecast Error Metrics (MAE, RMSE, MAPE, WMAPE)
According to Hewamalage et al. (2021), forecast error metrics are the primary mathematical tools used to quantify the variance between predicted model outputs and actual observed traffic conditions. The Mean Absolute Error (MAE) measures the average magnitude of prediction errors without considering their direction, making it highly effective for establishing baseline accuracy. Conversely, the Root Mean Square Error (RMSE) aggressively penalizes large forecasting errors by squaring them before averaging. Shang et al. (2022) establish that utilizing RMSE is particularly critical when forecasting Traffic Incident Duration (TID), as underestimating a major accident by 30 minutes has exponentially worse consequences for localized carbon emissions than underestimating by 5 minutes.
To interpret errors as percentages relative to the actual traffic volume, the Mean Absolute Percentage Error (MAPE) is frequently deployed. However, because MAPE yields undefined or infinite values when actual traffic volumes drop to zero (such as during nighttime highway closures), researchers often utilize the Weighted Mean Absolute Percentage Error (WMAPE). Makridakis et al. (2022) emphasize that WMAPE overcomes this zero-value limitation by weighting the errors according to total actual volume, providing a highly robust metric for evaluating expressway networks with drastically fluctuating peak and off-peak vehicle fleets.
By using RMSE, the project will ensure that the model is extra sensitive to large errors in incident duration, which is critical for preventing gridlock. Furthermore, the use of WMAPE will allow the system to remain mathematically stable even during nighttime hours when vehicle volume is near zero, providing a reliable accuracy report across a full 24-hour cycle.
2.1.9.2 Scale-Independent Metrics (MASE, RMSE)
When evaluating models across heterogeneous datasets with vastly different numerical scales, such as comparing thousands of daily vehicles against minor decimal fractions of metric tons of CO₂ emissions, traditional error metrics often fail to provide a comparable baseline. Makridakis et al. (2022) demonstrate that contemporary forecasting methodologies rely on the Mean Absolute Scaled Error (MASE) to address this issue. This scale-independent metric normalizes the forecasting error by dividing it by the in-sample error of a simple benchmark, providing a unified evaluation standard.
By utilizing this normalized metric, researchers can objectively compare how a unified machine learning architecture performs across completely disparate targets. Hewamalage et al. (2021) establish that scale-independent metrics allow analysts to evaluate multi-variable predictive networks mathematically, ensuring that massive variances in data scale do not skew the overall model evaluation.
By incorporating MASE into its evaluation framework, the SmartFlow NLEX system will be able to objectively validate the performance of its predictive engines across entirely different data domains. This will ensure that the LSTM models forecasting macro-level traffic volumes and the XGBoost models calculating micro-level carbon emissions are held to the exact same rigorous standard of baseline improvement, mathematically justifying the system's multi-source architecture.
2.1.9.3 Model Selection Criteria (AIC, BIC)
When developing statistical time-series models like ARIMA or SARIMAX, researchers must balance predictive accuracy with model simplicity. Introducing too many exogenous variables into an equation can lead to "overfitting," where the model memorizes historical noise rather than learning true underlying traffic patterns. Deretić et al. (2022) establish that the Akaike Information Criterion (AIC) and the Bayesian Information Criterion (BIC) are employed as rigorous model selection techniques to prevent this mathematical bloat.
To ensure models remain generalizable, both criteria mathematically evaluate the goodness-of-fit of an algorithm while applying a strict penalty for every additional parameter included. The author demonstrates that successfully utilizing SARIMA modeling for traffic forecasting requires minimizing these scores, ensuring that the final architecture remains computationally efficient and highly resilient when exposed to new data.
By minimizing AIC and BIC scores, the study will ensure that statistical models like SARIMAX stay mathematically streamlined and do not become overly complex. This strict selection process will prevent overfitting, ensuring that the SmartFlow system actually learns true NLEX traffic patterns rather than just memorizing historical noise.
2.1.9.4 Validation Techniques
Standard machine learning validation techniques, such as randomized k-fold cross-validation, are fundamentally invalid for traffic analytics because they violate the sequential integrity of time-series data, leading to severe data leakage. Hyndman and Athanasopoulos (2021) establish that evaluating traffic models requires strict temporal validation methods to ensure that algorithms do not artificially look into the future during the training phase.
2.1.9.4.1 Chronological Train-Test Split Evaluation
To maintain temporal integrity, researchers utilize a chronologically ordered Train-Test Split. In this framework, earlier historical data is used exclusively to train the model, while strictly future, unseen data is used to test it. When developing deep learning architectures for traffic forecasting, determining the optimal data partitioning ratio, specifically evaluating between an 80/20 and a 90/10 chronological split is a critical methodological step.

An 80/20 split is widely established as a robust baseline, providing the algorithm with substantial historical data while reserving a statistically significant 20% chunk to rigorously test for overfitting across varying seasonal conditions. Conversely, a 90/10 split is frequently utilized when handling massive, high-frequency datasets; this maximizes the training volume (90%) to help the neural network capture intricate micro-patterns, provided the remaining 10% still encompasses a sufficiently diverse time frame for validation.
To guarantee optimal model performance, the SmartFlow NLEX system will empirically evaluate both an 80/20 and a 90/10 chronological split during its initial training phase. By testing both ratios, the researchers will mathematically determine the exact threshold that provides the deep learning engines with enough historical data to recognize long-term spatiotemporal patterns, while maintaining a large enough testing window to rigorously prove the model's predictive accuracy on unseen future data.
2.1.9.4.2 Walk-Forward Validation
To further validate performance in highly dynamic environments like expressways, researchers utilize Walk-Forward Validation, also known as Time-Series Cross-Validation. Hyndman and Athanasopoulos (2021) detail that in this approach, the training window progressively slides forward in time, continuously updating the model with recent data before forecasting the next immediate step. This technique accurately simulates the continuous data flow of a real-world operational environment.
By combining the initial chronological split with Walk-Forward Validation, the researchers will accurately simulate a real-world Traffic Management Center environment. This sliding-window testing protocol will prove that the SmartFlow models can continuously adapt to new data, shifting seasonal trends, and sudden accident patterns without losing their predictive edge over time.
2.1.9.5 Model Benchmarking and Performance Metrics
The ultimate validation of a complex, computationally expensive AI architecture (such as an LSTM or XGBoost) is proving that it mathematically outperforms traditional statistical methodologies. Makridakis et al. (2022) establish that in time-series forecasting, complex machine learning models must be strictly benchmarked against established baselines to justify their computational overhead.
If a deep learning algorithm cannot yield a significantly lower Root Mean Square Error (RMSE) or Mean Absolute Percentage Error (MAPE) than a standard statistical model which relies on simpler historical averaging then the advanced AI holds no practical utility. Rigorous benchmarking against these standards ensures that the deployment of complex neural networks is scientifically justified by a definitive, measurable leap in accuracy.
By benchmarking the system's deep learning engines against traditional baseline models like SARIMA, the research will ensure that the project’s technical complexity is scientifically justified. It will prove that the advanced AI provides a measurable leap in predictive accuracy, confirming its operational value and reliability for NLEX administrators.
2.1.9.6 System Performance and Load Stress Validation
To ensure the operational reliability of a decision-intelligence system, the underlying technical architecture must be validated against high-concurrency demands and data ingestion spikes. Kaptosv (2025) establishes that performance testing is critical for ensuring the responsiveness of high-traffic web applications, particularly when dealing with complex, in-memory caching layers like Redis during peak user loads.
Validating these architectures requires simulating heavy network activity to ensure interface stability. Jartarghar et al. (2022) demonstrate that rigorous performance validation guarantees that frontend frameworks relying on Server-Side Rendering can maintain near-instant delivery of pre-rendered metrics. This ensures that a system's API endpoints and database queries remain stable under the unusually heavy loads typical of a major expressway management environment.
By utilizing rigorous load stress validation methodologies, the study will justify an automated approach to simulating high-concurrency demands from thousands of NLEX sensors and concurrent users. This performance testing will ensure the dashboard remains responsive and the predictive models avoid latency during critical data spikes, guaranteeing mission-critical reliability.

### 2.1.10 Key Performance Indicators (KPIs) in Traffic Management
2.1.10.1 Volume-to-Capacity (V/C) Ratio
Evaluating the physical limits of an expressway network requires establishing a definitive mathematical relationship between current traffic demand and maximum road design capacity. Wang, P. et al. (2021) demonstrate that the Volume-to-Capacity (V/C) ratio serves as the fundamental macroscopic metric for this evaluation, providing a standardized decimal value that represents exactly how close a specific highway segment is to operational failure.
When the V/C ratio approaches critical thresholds (typically 0.85 to 1.0), the likelihood of traffic shockwaves and sudden standstill gridlock increases exponentially. Shah et al. (2024) establish that modern intelligent transportation systems rely continuously on this ratio to trigger automated decision-support tools, ensuring that active traffic management strategies are deployed just before the network exceeds its physical limits.
By continuously monitoring the Peak V/C ratio target, the SmartFlow NLEX system will actively gauge the corridor's congestion state. The system will utilize this specific metric as the primary input for its Fuzzy rule-based engine, triggering counter-flow lane advisories and operator alerts precisely when the simulated volume threatens to breach NLEX's physical capacity.
2.1.10.2 Alert Lead Time and Mean Time to Clear (MTTC)
In the context of incident management, the primary goal of an intelligent transportation system is to minimize the duration of carriageway blockages. Islam et al. (2021) highlight that tracking the Mean Time to Clear (MTTC), the exact duration from the moment an incident is reported to the moment the road is completely reopened, is the ultimate KPI for evaluating the efficiency of emergency response fleets.
However, effectively reducing MTTC requires proactive notification systems that dispatch resources before localized congestion compounds. Grigorev et al. (2024) emphasize that maximizing predictive lead time provides traffic operators with the critical buffer window necessary to deploy tow trucks, redirect approaching vehicles, and implement temporary lane management strategies, directly mitigating the severity of secondary crashes.
By integrating these metrics, the SmartFlow Dashboard will systematically track both MTTC and Alert Lead Time (hours) to evaluate operational efficiency. Utilizing TOPSIS ranking algorithms will ensure that the system prioritizes patrol deployments and event management plans that mathematically maximize lead time and minimize overall clearance delays.

2.1.10.3 Environmental Metrics (CO₂ per class-km)
Standardizing the environmental impact of highway operations requires metrics that account for the massive disparities in fuel consumption across different vehicle sizes. The International Transport Forum and OECD (2023) emphasize that relying on generalized traffic volume counts fails to capture a corridor's true carbon footprint, necessitating a strict measurement of emissions distributed across specific vehicle classifications per kilometer traveled.
To effectively curb these emissions, transportation planners must target the specific vehicle types contributing the most environmental degradation. Sunio et al. (2023) demonstrate that measuring the excess greenhouse gases produced by heavy-duty logistics fleets during prolonged delays provides empirical evidence that active traffic management directly limits regional environmental impact.
By tracking CO₂ per class-km as a primary prescriptive KPI, the SmartFlow NLEX system will successfully enforce long-term sustainability targets. The dashboard will utilize this metric to rank emission interventions, specifically empowering operators to evaluate heavy vehicle window restrictions and prioritize fleet-mix flows without relying on generalized, inaccurate emission estimates.

2.1.10.4 Forecast Accuracy Metrics (MAPE and Advisory Accuracy)
The operational utility of an AI-driven traffic platform is entirely dependent on the statistical reliability of its forecasts. Makridakis et al. (2022) establish that the Mean Absolute Percentage Error (MAPE) serves as the industry-standard metric for translating raw mathematical forecast errors into an interpretable percentage, allowing non-technical operators to instantly gauge the trustworthiness of predictive volume and emission models.
Beyond numeric volume forecasting, the reliability of environmental warnings dictates driver compliance. Romanowska and Budzyński (2022) emphasize that tracking the accuracy rate of weather-triggered advisories ensures that automated speed reductions correspond precisely with actual hazardous conditions, preventing the phenomenon of "warning fatigue" where drivers ignore systemic alerts.
By strictly benchmarking its LSTM and XGBoost models against a target MAPE, the project will guarantee high-fidelity volume and emission predictions. Furthermore, tracking Weather Advisory Accuracy (%) will ensure that the system's 15/30 mm/h automated rainfall alerts maintain high credibility and compliance among NLEX commuters.

### 2.1.11 Feedback Loops and Model Retraining (MLOps Framework)
2.1.11.1 Feedback Loop Mechanisms in Machine Learning Systems
According to Rengasamy et al. (2021), Feedback loops are the fundamental architectural components that allow an AI system to learn from its own real-world operational mistakes. In a traffic management context, a feedback loop mathematically captures the "delta" or variance between the AI’s forecast and the physical reality.
To operationalize this, systems systematically ingest ground-truth data back into their databases. Rengasamy et al. (2021) detail that by capturing the actual clearance time recorded by highway patrols against the model's initial prediction, the feedback mechanism creates a continuous, automated pipeline of historical records. The AI utilizes this variance data to iteratively correct its future clearance and emission estimations.
By mathematically capturing the variance between AI forecasts and actual recorded events, the project will ensure a continuous flow of ground-truth data. This architectural capability will support the objective of creating a self-correcting system that improves its incident clearance and emission estimations as it processes more real-world NLEX data

2.1.11.2 Continuous Model Monitoring and Performance Tracking
To successfully manage an expressway, system administrators cannot wait for a catastrophic failure to realize a model is outdated; they must continuously track model degradation in real-time. Bayram et al. (2022) demonstrate that continuous monitoring frameworks achieve this by utilizing performance-aware drift detectors that constantly calculate the model’s real-time error metrics, such as MAE and RMSE.
This continuous surveillance provides immediate alerts when a system's calculations become statistically unreliable. The authors explain that if the tracking system detects that the AI is suddenly failing to accurately predict the volume of heavy-duty vehicles, and the forecast error breaches a pre-defined acceptable threshold, the monitoring module automatically flags the system for concept drift.
By integrating drift detectors that track metrics like MAE and RMSE, the SmartFlow Dashboard will actively identify when the model’s accuracy begins to degrade. This continuous monitoring will ensure that transportation managers are immediately alerted if the carbon emission baseline calculations become statistically unreliable due to shifting NLEX traffic trends.

2.1.11.3 Model Retraining and Adaptive Learning (MLOps)
Once severe concept drift is detected by the monitoring module, modern architectures initiate automated model retraining. Ruf et al. (2021) emphasize that modern MLOps pipelines eliminate the need for manual, offline data science interventions. Instead, the adaptive learning system automatically queries the most recent expressway data, capturing new seasonal patterns, updated road geometries, or shifting fleet mixes and retrains the predictive algorithm based on this fresh context.
Following the retraining phase, the system ensures quality control before updating the live dashboard. The author establishes that an effective MLOps pipeline automatically validates the newly trained model against current holdout data. If the updated model achieves a superior accuracy score compared to the degrading production model, it is seamlessly deployed into the live Traffic Management Center without causing system downtime.
Implementing this automated MLOps pipeline will ensure that the system remains continuously adaptive to new NLEX patterns, such as updated road geometries or changes in the vehicle fleet mix. It will seamlessly update its internal network weights to maintain peak predictive performance indefinitely without requiring offline manual adjustments.




2.1.11.4 User Interaction Feedback Integration (e.g., recommendation validation)
Beyond automated sensor data, successful prescriptive analytics requires validation from the humans who execute the system's recommendations. A purely algorithmic system that ignores whether operators and drivers actually follow its suggestions risks severe miscalibration over time. Ruf et al. (2021) establish that an effective MLOps improvement cycle must incorporate the real-world outcomes of deployed interventions, including tracking cases where human operators override AI recommendations to ensure that the system learns from its behavioral blind spots.to refine its prescriptive strategies to be more practical and aligned with actual human behavior.
To ensure this feedback loop is grounded in verifiable reality, modern systems utilize strict architectural constraints. Lewis et al. (2020) provide the foundation for grounding AI outputs directly in validated system data through Retrieval-Augmented Generation (RAG). By tethering every AI recommendation to a verified database record and tracking operator compliance against that specific record, this framework transforms static recommendation engines into continuously self-calibrating platforms that respect actual human workflows.
These studies on feedback and validation will support SmartFlow NLEX's prescriptive refinement architecture. Ensuring that operator compliance and real-world outcomes are fed back into the system will systematically align the MLOps pipeline with the operational realities and judgment patterns of the actual NLEX management team.

2.1.11.5 System Improvement Cycle
This section provides the overarching logic for the project's sustainability, the Signal-to-Action loop. The culmination of the MLOps framework is the continuous System Improvement Cycle, which operates as an infinite loop of traffic optimization. As outlined by Ruf et al. (2021) in their architectural review of MLOps, the cycle begins with a Signal (live traffic volume and incident data captured by sensors).
This action is not isolated; it generates immediate consequences that feed back into the origin of the loop. Ruf et al. (2021) demonstrate that as the prescriptive action physically alters the expressway environment, it generates a new signal, such as updated traffic flow and reduced emissions, which is immediately ingested by the sensors. This self-sustaining cycle ensures that the intelligent transportation system becomes progressively smarter and highly resilient to anomalies over time.
By framing the system as an infinite cycle of optimization, the SmartFlow NLEX system will act as a living, resilient framework rather than a static tool. The AI will physically alter the expressway environment through its prescriptive interventions and then learn from the results, becoming progressively more accurate in meeting NLEX's long-term environmental targets.
### 2.1.12 Large Language Models and Conversational Interfaces
2.1.12.1 LLMs for Commuter Conversational Interfaces
While advanced predictive algorithms such as Long Short-Term Memory (LSTM) networks and XGBoost are highly effective at generating numerical traffic forecasts, these raw mathematical outputs often suffer from poor interpretability for the average commuter. Attioui and Lahby (2025) establish that integrating Large Language Models (LLMs) is highly effective at addressing this barrier by understanding deep semantic context, allowing them to translate massive volumes of complex structured reports into accessible insights.
To ensure the reliability of these systems and prevent the AI from generating erroneous hallucinations, modern conversational interfaces are tethered directly to validated system databases. Lewis et al. (2020) demonstrate that utilizing Retrieval-Augmented Generation (RAG) architectures forces the LLM to act purely as a semantic translation layer. By employing programmatic function calling, the model retrieves exact numerical forecasts from the predictive engines and formats those validated numbers into natural language advisories.
By integrating Anthropic's Claude Sonnet through a LangChain RAG pipeline, the SmartFlow NLEX mobile chatbot will securely retrieve 48-hour volume forecasts and weather-impacted delay metrics directly from the PostgreSQL database. Acting strictly as a conversational interface, Claude Sonnet will seamlessly translate these validated backend predictions into clear, personalized travel advisories for commuters, ensuring no unvalidated internet knowledge is communicated.

2.1.12.2 LLM-Driven Scenario Generation in Simulation Sandboxes
Beyond commuter-facing applications, Large Language Models are transforming how traffic operators interact with complex backend simulation software. Shah et al. (2024) emphasize that integrating natural language processing into active decision-support tools accelerates the deployment of traffic interventions during high-stress emergencies by bypassing the need for manual, multi-step technical configurations.
In the context of virtual simulation sandboxes, this semantic capability translates plain-text operator intent directly into complex simulation parameters. Attioui and Lahby (2025) highlight that by operating strictly as an intent-parsing engine, an LLM can immediately process conversational commands into the exact numerical constraints, capacity limits, and spatial logic required by underlying agent-based models, enabling rapid scenario generation.
By utilizing Anthropic’s Claude Sonnet for natural language prompting, the SmartFlow NLEX Agent-Based Sandbox will drastically streamline the "What-If" configuration workflow for TCC operators. This conversational interface will enable operators to simply type intuitive commands, such as simulating a two-lane closure at the Candaba Viaduct during heavy rainfall, allowing the system to instantly configure and render the virtual intervention for visual testing without technical delays.

## 2.2 Review of Related Systems and Technologies
This section explores the existing systems, architecture, and tools that implement the proposed decision-intelligence system. The way that many of the integrated technologies, including cloud services and machine learning pipelines, assist in creating an overall efficient means of traffic management, as well as forecasting traffic.
### 2.2.1 Intelligent Transportation Systems and Infrastructure
2.2.1.1 Cloud-Integrated ITS
According to Sakr et al. (2023), the most effective Intelligent Transportation Systems (ITS) architectures are those that integrate robust, scalable computing to store and process massive amounts of multisource traffic data. Their review demonstrates that modern platforms must possess the capability to scale beyond localized zones to cover much larger expressway networks than traditional systems. This foundational scalability is a principle the SmartFlow NLEX system will operationalize by utilizing high-performance data storage to handle continuous crowdsourced and historical data streams across its entire 105-kilometer extent.
Upon this scalable foundation, integrated architectures further enable the high-speed coordination of sustainable infrastructure. According to Afrin and Yodo (2020), the seamless integration of advanced congestion measures into operational systems is essential for creating sustainable and resilient transportation networks. By gathering and processing traffic information through intelligent techniques, these systems encourage the efficient use of existing road space to regulate vehicular flow and mitigate severe delays.
By adopting these principles, the SmartFlow NLEX system will operationalize foundational scalability by utilizing high-performance cloud storage to handle continuous crowdsourced and historical data streams across its entire 105-kilometer extent. This will facilitate the transition from fragmented monitoring to a sustainable, corridor-wide regulatory framework that optimizes current NLEX infrastructure without the need for physical expansion.
2.2.1.2 Multi-Layered Automated Systems
To understand the internal logic of these environments, researchers emphasize the necessity of structured connectivity. Chung et al. (2020)  states that building a modern ITS involves creating a multi-layered architecture that connects physical sensors to cloud-based units to monitor vehicle density and adjust traffic parameters automatically. The multi-layered approach described is a foundational element that connects physical and external data streams to cloud-processing units to enable automated parameter adjustments during forecasted surges.
Building upon this structural connectivity, the hierarchical organization of these layers is critical for achieving high-fidelity predictive performance. The author states, modern traffic management architectures utilize multi-layered systems consisting of data collection (cameras/sensors), algorithmic implementation (ML/DL), and result evaluation. This hierarchical structure allows for a significant performance improvement, up to 93.5%, in anticipating intersections and vehicle movements.
The multi-layered approach described will serve as a foundational element for the SmartFlow architecture, connecting external data streams to cloud-processing units to enable automated parameter adjustments during forecasted surges. By strictly adhering to this hierarchical data-to-evaluation structure, the project will ensure that decision-support outputs are derived from a robust, tiered analytical pipeline capable of high-accuracy vehicle movement anticipation.
### 2.2.2 Traffic Monitoring and Navigation Frameworks
2.2.2.1 Crowdsourced Reporting
To improve the efficiency of managing large-scale user contributions, recent research explores moving beyond manual review processes toward automated intelligence. Attioui and Lahby (2025) introduce LLM Prior, a framework that utilizes large language models to address the labor-intensive nature of evaluating crowdsourced reports. While previous models often missed the deep semantic context of textual descriptions, the authors demonstrate that applying prompt engineering and a cluster-based prioritization strategy allows for more accurate bug identification and redundancy reduction. By organizing reports into a hierarchical cluster tree, the system ensures that diverse and high-impact reports are prioritized over repetitive ones.
This approach proves more reliable and efficient than traditional natural language processing methods, offering a feasible solution for developers to quickly navigate through massive volumes of crowdsourced data. The LLM Prior framework will serve as a foundational reference in addressing the challenge of processing and prioritizing large volumes of crowdsourced traffic incident reports within the NLEX corridor. The integration of cluster-based prioritization will directly inform how the system filters redundant reports and elevates high-impact incidents along the Balintawak to Sta. Ines segment.
### 2.2.3 Data Engineering and ETL Pipeline Frameworks
2.2.3.1 Data Integrity and Cleaning
According to Bayram et al. (2022), the Extract, Transform, Load (ETL) pipeline is the essential backbone of traffic monitoring, managing the transition from raw, often incomplete sensor data to validated analytical sets. The transition from raw observations to trustworthy analytical sets by a robust ETL pipeline, which serves as the primary safeguard for data integrity.
Beyond vehicle counting, crowdsourced data allows for the rapid identification of non-recurrent anomalies that traditional sensors may miss. According to Manglano-Redondo et al. (2025), emerging data cleaning and fusion techniques are critical for traffic model calibration. Their research emphasizes that integrating publicly accessible datasets into a unified cleaning pipeline allows practitioners to address the unique needs of traffic microsimulation, ensuring high-fidelity data for analysis. Publicly accessible feeds into a unified cleaning process, which provides the high-fidelity input necessary for accurate microsimulation and corridor-wide traffic calibration.
The transition from raw observations to trustworthy analytical sets will be managed by a robust ETL pipeline, acting as the primary safeguard for SmartFlow's data integrity. By utilizing a unified cleaning process for publicly accessible feeds, the system will secure the high-fidelity input mathematically necessary for accurate microsimulation and continuous corridor-wide traffic calibration.
2.2.3.2 Batch and Real-Time Handling
According to Bachechi et al. (2022), modern traffic management utilizes protocols like MQTT to facilitate scalable, real-time communication between distributed edge devices and central databases. This architecture supports the rapid storage and analysis of traffic data, enabling immediate response to violations and congestion.
By integrating these real-time communication protocols, the system will achieve the rapid data transmission necessary for live expressway monitoring. This architecture will ensure that the central database receives continuous, low-latency updates from distributed sources, allowing NLEX administrators to execute immediate mitigation strategies during sudden traffic anomalies.
### 2.2.4 Statistical Analysis and Validation (RStudio)
2.2.4.1 Correlative Validation
According to Hyndman and Athanasopoulos (2021), validation rules in R can incorporate statistical functions such as correlation to verify expected relationships between variables. For instance, a rule may evaluate whether the correlation between two variables exceeds a predefined threshold, ensuring that the dataset aligns with domain expectations. This approach highlights how correlation analysis can be integrated into validation frameworks to strengthen data integrity and support reliable statistical outcomes. These correlative validation rules ensure that the relationships between fused variables, such as traffic volume and speed, remain consistent with historical patterns before they are processed by the machine learning engine.
The SmartFlow system will implement these correlative validation rules to ensure that the mathematical relationships between fused variables remain robust. By validating parameters such as traffic volume against speed before they enter the pipeline, the system will guarantee that the data remains consistent with historical patterns before being processed by the machine learning engines.
### 2.2.5 Machine Learning and Forecasting Engines (Python)
2.2.5.1 Deep Learning Frameworks
According to Ye et al (2024), modern traffic forecasting relies on Python-based frameworks like RNNs and LSTMs for temporal patterns and GCNs to map spatial connections between road sections. Utilizing these architectures, effectively captures the intricate spatiotemporal dependencies, providing a mathematically sound basis for its traffic projections.
The implementation of robust forecasting engines for high-volume expressway corridors necessitates a computational infrastructure capable of integrating diverse data streams, such as real-time speed indices, event metadata, and environmental variables. According to Leinonen et al. (2024), Python-based deep learning environments, specifically TensorFlow and Keras, provide the necessary flexibility and scalability to manage these multisource inputs with minimal latency.
By fusing high-dimensional input variables into single predictive engines, these Python-based frameworks will facilitate the system's identification of recurring congestion patterns and live traffic anomalies. This technical foundation will ensure that the SmartFlow forecasting models can achieve the high-speed processing required to deliver accurate, multi-day traffic projections and enhanced situational awareness for modern transportation stakeholders.

### 2.2.6 Mathematical Optimization (Linear Programming)
2.2.6.1 Decision Intelligence
The implementation of Decision Intelligence (DI) serves as the technological bridge between predictive forecasting and strategic execution. According to Shah et al. (2024), Decision Intelligence for traffic management systems transcends traditional data analysis by structuring the entire decision lifecycle from raw data ingestion to the evaluation of outcomes. This framework supports the development of the system's prescriptive analytics engine, ensuring that operational recommendations for the corridor are grounded in a logic that is both mathematically sound and interpretable by human managers.
This framework will strictly guide the development of the system's prescriptive analytics engine. By structuring the decision lifecycle, the project will ensure that all operational recommendations and mitigation strategies for the NLEX corridor are grounded in logic that is both mathematically sound and highly interpretable by human traffic managers.
### 2.2.7 Agent-Based Simulation
2.2.7.1 Autonomous Agent Simulation
To optimize urban mobility through behavioral analysis, modern frameworks utilize simulation to reconstruct complex travel patterns. Bastarianto (2022) demonstrates that agent-based modeling (ABM) is essential for simulating demand-responsive transit by treating commuters as autonomous agents with specific mobility needs. While traditional transit systems often struggle with rigid scheduling, the author highlights that ABM allows for the reconstruction of thousands of individual requests to test the efficiency of flexible, city-scale transport schemes. Recognizing the need for data-driven planning, this approach leverages simulated agent interactions to evaluate infrastructure performance and minimize operational waste before physical deployment.
Recognizing the need for data-driven planning, this approach leverages simulated agent interactions to evaluate infrastructure performance and minimize operational waste before physical deployment. The agent-based modeling framework will directly inform the simulation and stress-testing approach of the NLEX corridor monitoring system prior to live deployment. By treating individual commuters and heavy vehicles as autonomous agents with distinct mobility behaviors, the sandbox will be able to accurately simulate high-volume traffic scenarios and test prescriptive interventions safely.
### 2.2.8 Database and Data Storage Technologies
2.2.8.1 High-Performance Architectures
To handle the massive concurrent data flow of an expressway corridor, high-performance database architectures are required. According to Ruf et al. (2021), leveraging Supabase facilitates an efficient data lifecycle by utilizing a PostgreSQL architecture to maintain high performance for operational analytics. This architecture is particularly effective in high-load environments because it combines the transactional power of PostgreSQL with real-time "listeners" (Postgres Changes) that allow for instant data synchronization.
Recent performance benchmarks show that this setup can handle millions of concurrent records with sub-millisecond execution times for complex SELECT queries, making it roughly 9 to 13 times faster than traditional relational setups in continuous data-streaming scenarios. This high-performance PostgreSQL architecture allows for managing millions of concurrent traffic records with the sub-millisecond speed required for real-time situational awareness and operational analytics.
2.2.8.2 Event-Based Reduction
Maintaining this speed during peak operations, data processing must be prioritized based on significance. According to Grigorev et al. (2024),"event-based" prediction is a vital alternative to continuous forecasting, demonstrating that focusing on high-impact anomalies can reduce data volume by 50% while maintaining accuracy. By shifting from constant periodic updates to a trigger-based system where processing only occurs when a significant traffic "event" or anomaly is detected, systems can substantially decrease the computational load on the cloud-integrated infrastructure. This selective data ingestion ensures that the machine learning pipeline (LSTM/XGBoost) remains efficient and highly responsive to non-recurrent traffic surges without being overwhelmed by redundant, steady-state data points.
This selective data ingestion methodology will ensure that the SmartFlow machine learning pipeline (LSTM/XGBoost) remains highly efficient. By reducing the overall computational load, the system will remain highly responsive to non-recurrent traffic surges without being overwhelmed by redundant, steady-state data points during off-peak hours.
2.2.8.3 Redis
Kaptosv (2025) stated that Redis served as a vital component for optimizing high-traffic web applications by providing an advanced in-memory layer that significantly reduced database latency and improved throughput. This in-memory architecture will be utilized for real-time streaming extraction, acting as a high-speed buffer that captures raw data feeds before they reach the persistent database. By utilizing Redis in this capacity, the system will avoid the bottlenecks that typically slow down traditional extraction processes.
This in-memory architecture will be directly utilized for the system's real-time streaming extraction, acting as a high-speed buffer that captures raw crowdsourced and sensor data feeds before they reach the persistent database. By integrating Redis in this capacity, the SmartFlow architecture will successfully avoid the transaction bottlenecks that typically slow down traditional extraction processes during peak highway congestion.
### 2.2.9 API Integration and External Data Sources
2.2.9.1 Web Scraping
To gather data from The importance of the need for real-time data transmission for corridor decision intelligence is pointed out by Leinonen et al. (2024). The authors call for the application of a strategy that combines web scraping using Python programming language with incremental data collection. According to their research, it is critical for platforms operating on vast amounts of information from multiple sources to be able to extract only the data that has been newly generated or changed after the last extraction process. In doing so, they minimize computational costs and avoid unnecessary processing, ensuring an uninterrupted data flow for the forecasting model. By adopting these incremental collection techniques, it ensures an uninterrupted and computationally efficient data flow for its forecasting models.
2.2.9.2 Open Weather
Musah et al. (2022) evaluated the accuracy and suitability of the OpenWeatherMap API as an alternative source for weather data by comparing its forecasts against actual measurements recorded by the Brazilian National Institute of Meteorology (INMET) across two cities. The study focused on two key meteorological parameters, temperature and relative humidity, examining both current-day readings and lead-time forecasts spanning one to four days ahead.
The findings will serve as an important methodological reference in evaluating the reliability of the OpenWeatherMap API as the primary weather data source for the NLEX corridor monitoring system. Given that the study confirmed the API's high accuracy in retrieving temperature data, the system will confidently utilize these metrics to adjust its localized traffic volume and speed-reduction forecasts during adverse weather events.
### 2.2.10 Visualization and System Architecture
2.2.10.1 Proactive Management Visualization
According to Rundel and De Amicis (2023), the integration of advanced virtual replicas and game-engine visualizations with predictive analytics represents a shift from reactive data handling to proactive management. These high-fidelity visualizations move beyond simple bar charts to include spatial mapping that allows operators to distinguish between peak and off-peak anomalies in real-time. The system adopts these high-fidelity visual patterns to move beyond static observation and enable operators to identify anomalies dynamically.
To further support this transition to proactivity, visual analytics must bridge the gap between data and strategy. According to Li and Li (2022), the implementation of high-end visual analytics serves as a critical scaffold for moving traffic management from a reactive to a proactive state. By utilizing spatiotemporal visualizations, such as heat maps for density identification and parallel coordinate charts for multi-variable analysis, operators can determine the volume-to-capacity ratio at specific road junctions.
The system will adopt these high-fidelity visual patterns, such as spatiotemporal heatmaps, to move beyond static observation and enable operators to identify volume-to-capacity anomalies dynamically. This visual integration will empower decision-makers to monitor specific ratios across the corridor, facilitating early intervention before localized bottlenecks reach critical gridlock thresholds.
2.2.10.1.1 Next.js
To support the rapid delivery of these proactive visualizations, the system requires a robust frontend architecture capable of handling real-time data hydration. Jartarghar et al. (2022) emphasize that Next.js addresses the latency issues inherent in standard Client-Side Rendering (CSR) by leveraging Server-Side Rendering (SSR). This architectural choice is critical for the SmartFlow NLEX dashboard, as it enables the near-instant delivery of pre-rendered HTML content, ensuring that traffic operators can access real-time metrics without the delays typically associated with basic React applications. The framework maintains the high responsiveness required to manage the extensive NLEX corridor.
This architectural choice will be critical for the SmartFlow NLEX dashboard, as it enables the near-instant delivery of pre-rendered HTML content. By leveraging SSR, the framework will maintain the high responsiveness required to manage the extensive NLEX corridor, ensuring that traffic operators can access real-time metrics without the delays typically associated with basic React applications.

2.2.10.1.2 Typescript
According to Nguyen (2022), TypeScript is a strongly typed superset of JavaScript that improves web application reliability through Static Type Checking. This allows developers to catch logic errors, such as type mismatches, during development rather than at runtime. The author further notes that the use of Interfaces ensures that data structures such as those from a PostgreSQL database remain consistent as they flow through the application. This architectural strictness minimizes crashes when handling complex JSON objects, ensuring a stable and professional user interface under real-time operational pressure. By enforcing strict type definitions, the system safely processes massive multisource data streams, such as toll logs and coordinates, without risking interface crashes. This supports the "Decision-Intelligence" goal by guaranteeing that corridor analytics are based on stable, correctly-mapped data, providing a resilient tool for mission-critical expressway operations.
By enforcing strict type definitions across the codebase, the system will safely process massive multisource data streams, such as toll logs and coordinates, without risking runtime interface crashes. This architectural strictness heavily supports the "Decision-Intelligence" goal by guaranteeing that corridor analytics are based on stable, correctly-mapped data structures.

2.2.10.1.3 Apache Echarts
According to Yu (2024), Apache ECharts is a powerful, browser-based visualization tool capable of rendering complex datasets through an intuitive and scalable framework. One of its primary technical strengths is its ability to handle "scattered and low-quality data" by aggregating it into clear, visual applications. Yu (2024) highlights that ECharts is particularly effective in industries such as smart city displays and rail transit monitoring, where data sources are diverse but require a unified visual output. The framework supports a wide array of typical visualization applications ranging from time-series line graphs to spatial maps allowing developers to build interactive websites that facilitate deeper data exploration.
By providing a clear solution for raw data aggregation and display, ECharts will enable the transformation of the system's raw backend data into actionable insights for the end user. This literature confirms that ECharts possesses the necessary technical robustness to render the complex time-series graphs and emission trends required by the decision-intelligence dashboard.
2.2.10.1.4 Mapbox
A key component of the platform, Mapbox GL JS, has been the subject of numerous performance studies. Zunino et al. (2020) conducted a comparative analysis of three widely used JavaScript web mapping libraries Leaflet, Mapbox GL JS, and OpenLayers using Argentina's Life Quality Index as a case study. Their findings revealed that Mapbox GL JS achieved the best overall performance on mid- and high-end devices when displaying raster or vector maps. This performance advantage was attributed to Mapbox GL JS's use of WebGL-based hardware acceleration, which enables efficient rendering even for data-heavy applications.
These proven performance characteristics will be essential in constructing the platform's central map interface. By utilizing Mapbox GL JS's hardware acceleration, the system will efficiently handle the real-time rendering demands of plotting continuous traffic volume data, active incident overlays, and dynamic visual alerts sourced from multiple toll plazas along the corridor.
2.2.10.1.5 Github
Tharu (2025) argued that the implementation of a Version Control System through GitHub served as a foundational infrastructure for managing the software development lifecycle, providing a centralized repository that facilitated both history tracking and collaborative integrity. This platform enables developers to document every iteration of their codebase, effectively safeguarding against data loss and technical overlaps during the integration of various system modules.
GitHub will be utilized to synchronize the concurrent development of the predictive traffic models and 2D visualization layers. By leveraging these versioning mechanisms, the team will ensure that all technical contributions for the corridor dashboard are integrated seamlessly, allowing for safe experimentation and stable deployment throughout the project’s iterative sprints.
2.2.10.1.6 Figma
Du et al. (2025) argued that the development of multi-user collaborative interfaces requires a design methodology that is both task- and role-oriented to maintain operational consistency across shared workspaces. Their research emphasized that activities and identities of different users should have uniform visual indicators, ensuring that collaborators remain synchronized while performing distinct functional duties within the same environment.
By adopting a role-oriented design method, it will ensure that the dashboard provides a seamless transition between high-level traffic analytics and specific incident management tasks.
2.2.10.1.6 Electron
W and Engel (2026) argued that the Electron framework remained a dominant technology for building cross-platform desktop applications because it effectively unified web technologies into a native executable by bundling a full Chromium browser engine and Node.js runtime.
This specific architecture will be utilized to compile and deploy the standalone analytical dashboard for control room terminals. By wrapping the web technologies in Electron, the system will maintain a highly stable, persistent connection with the high-velocity Redis and PostGIS layers, ensuring that traffic operators receive near-instant notifications and reliable 2D visualization updates outside of a standard browser environment.
2.2.10.2 End-to-End Pipeline Design
To maintain the quality of these visualizations, the underlying pipeline must be consistently monitored for performance. Bayram et al. (2022)  state that maintaining continuous data quality in complex analytics systems requires an end-to-end pipeline observability framework. Their research highlights that traditional monitoring is no longer sufficient for modern, real-time traffic pipelines; instead, the architecture must incorporate multi-layered visibility across the ingestion, transformation, and storage stages.
This necessity for high-integrity observability is further amplified by the evolution of data engineering paradigms. According to Bachechi et al. (2022), modern data engineering has evolved from static pipelines to AI-enabled platforms where execution efficiency is the primary performance metric. Recent simulations indicate that transitioning from traditional batch-based ETL to real-time streaming frameworks can increase data processing speeds by up to 67%.
By integrating these observability frameworks and event-driven data flows, the system will proactively identify "data drift" and schema evolution issues. This strict pipeline design ensures that the final predictive models are consistently fed with trustworthy, high-integrity data, maintaining continuous auto-refresh dashboards that support instantaneous operational decision-making.
2.2.10.2.1 PostGIS
According to Z. Li and Li (2022), the selection of PostGIS for traffic management systems ensured that large-scale geospatial data could be loaded and processed without compromising the structural integrity of the logistics framework. PostGIS will be positioned as the load layer of the ETL pipeline. This architectural choice will allow the system to ingest raw data feeds. By utilizing PostGIS in this capacity, the system will ensure that the data warehouse will maintain high-speed query performance for the corridor’s historical records.
PostGIS will be officially positioned as the load layer of the system's spatial ETL pipeline. This architectural choice will allow the backend database to natively ingest and index complex raw geospatial feeds, ensuring that the data warehouse maintains high-speed query performance for the corridor’s historical coordinate records.
### 2.2.11 Mobile Application Development Frameworks
According to Nguyen (2025), the evolution of mobile development has shifted toward frameworks that balance high-performance native rendering with developer efficiency. The study highlights React Native as a premier choice for cross-platform development due to its ability to translate JavaScript components into native UI elements. However, to manage the complexity of modern app deployment, Nguyen (2025) emphasizes the role of the Expo ecosystem and Expo Application Services (EAS). These tools provide a managed infrastructure that automates the "heavy lifting" of mobile development, such as credential management and build optimization. By utilizing Expo on top of React Native, developers can maintain a unified codebase while ensuring the application remains scalable and responsive across different operating systems.
To operationalize the mobile component of the SmartFlow NLEX system, the project will utilize React Native paired with the Expo ecosystem. By adopting this managed infrastructure, the development team will efficiently maintain a unified, cross-platform codebase. This architectural decision ensures that the commuter-facing mobile application can be rapidly deployed, remaining highly scalable and responsive across both Android and iOS operating systems without the need for separate, native development cycles.
## 2.3 Synthesis
The comprehensive review of related literature establishes that modern expressway management must transition from reactive observation to proactive, data-driven mitigation. Section 2.1 grounds the study in rigorous analytical theory, demonstrating that capturing the chaotic, non-recurrent nature of highway congestion requires advanced predictive architectures. By validating the use of deep learning frameworks such as Long Short-Term Memory (LSTM) networks and Extreme Gradient Boosting (XGBoost), the literature confirms that accurate traffic forecasting depends on fusing multidimensional variables, including weather disruptions, fleet mix compositions, and holiday anomalies. Furthermore, the integration of prescriptive analytics and sustainability-aware optimization ensures that systems can mathematically compute actionable interventions to minimize both travel delays and delay-induced carbon emissions.
To operationalize these complex mathematical theories, Section 2.2 explores the specific system architectures required for high-velocity execution. The literature proves that deploying resource-heavy machine learning models necessitates a highly resilient data engineering backbone. Cloud-integrated Intelligent Transportation Systems (ITS) rely on automated Extract, Transform, Load (ETL) pipelines backed by high-performance PostgreSQL and PostGIS databases. Coupled with in-memory caching layers like Redis, these event-driven architectures ensure that massive, concurrent streams of multi-source data from toll logs to crowdsourced API feeds are processed with sub-millisecond latency, preventing system bottlenecks during peak expressway surges.

Ultimately, the convergence of these theoretical models and advanced technologies provides the definitive justification for the SmartFlow NLEX architecture. By bridging the gap between raw backend computations and human decision-making, the system utilizes robust frontend frameworks like Next.js, Apache ECharts, and Mapbox GL JS to translate complex probability intervals into proactive visual dashboards. Extending this capability through a React Native mobile application ensures that actionable intelligence reaches both Traffic Control Center operators and daily commuters. This synthesis confirms that SmartFlow NLEX is scientifically and architecturally positioned to deliver a resilient, multi-source decision-intelligence platform capable of optimizing corridor flow, predicting incident life-cycles, and enforcing sustainable environmental practices.

# CHAPTER 3
METHODOLOGY
This chapter presents the systematic approach and technical framework used to develop SmartFlow NLEX. It details the Agile development lifecycle, the transition from current to proposed business processes, and the data engineering pipeline used to process multi-source traffic data. Furthermore, this section outlines the risk assessment strategies, system requirements, and the specific business analytics models, descriptive, predictive, and prescriptive, that empower the platform to transform reactive traffic management into a proactive, simulation-driven decision-intelligence system. Finally, technical terms utilized throughout the models-layer figures and analytical frameworks are defined in Appendix A: Glossary of Models-Layer Terms.

## 3.1 Development Methodology
a.) Data Mining Process Model
CRISP-DM
The proposed capstone project will utilize a structured methodology, known as the Cross-Industry Standard Process for Data Mining (CRISP-DM), which ensures that all phases, from initial observation through to final implementation, are aligned with the project's main objectives and goals.

Figure 3.1.1 CRISP-DM Process for Data Mining

b.) Iterative Development Framework
Agile Methodology
Agile methodology is a management framework that promotes a flexible, incremental approach to developing system modules through continuous, flow-based delivery cycles, emphasizing ongoing testing, rapid prototyping, and the ability to respond to change without the constraints of fixed iteration lengths. Rather than organizing work into time-boxed sprints, this project adopts a Kanban-based Agile approach, where tasks are visualized on a Kanban board and pulled through development stages such as Backlog, In Progress, Testing, and Done. Work will begin with the stabilization of the data extraction and spatial warehousing layers, followed by the development of predictive analysis components to enable continual adjustment of the models used to forecast vehicle movement based on historical data. The operator dashboard will then be built and refined to ensure it remains user-friendly and fully functional, while integration tasks connecting the data pipeline to the back-end analytics system will be managed as a continuous work stream, enabling the processing and display of community reports and incident alerts to support operational decision-making along the NLEX corridor.

Figure 3.1.2 Agile Development Methodology

Table 3.1.1. Mapping Table
| AGILE | CRISP-DM PHASE | Analytics Focus | System Focus | Output |
| --- | --- | --- | --- | --- |
| Cadence 1 | Business & Data Understanding | Determine traffic patterns and incidents for each corridor, along with corresponding KPIs. | Design system architecture and set up a cloud environment using Supabase/ PostgreSQL. | Initial Exploratory Data Analysis Report. |
| Cadence 2 | Data Preparation | Perform ETL processes, data cleansing, and combine NLEX and Waze data into a single dataset from multiple sources. | Develop an automated pipeline for the ingestion of data and build APIs for integration | Cleaned Multi-Source Data Set. |
| Cadence 3 | Modeling | Training and configuring predictive engines with LSTM and XGBoost. | Building the Dashboard UI and Real-Time visualization Layer. | Trained predictive models. |
| Cadence 4 | Evaluation | Statistical validation of the models for RMSE and MAPE. | Implementation of prescriptive features and providing a spatial AI sandbox. | Model Evaluation Results |
| Cadence 5 | Deployment | Completed analytics into a live production | Completed system testing and release for the mobile app. | Deployed Decision Intelligence Platform |

## 3.2 Business Process
### 3.2.1 Comparison of Existing and Proposed Business Processes
Comparing the current business process to the proposed business process identifies many opportunities the project aims to improve. The existing business process may be optimized, meaning the comparison will provide a baseline for the path to the project goals the group hopes to achieve. It allows the proponents to justify their technology implementations to support solutions for the operational bottlenecks identified within the organization.
3.2.1.1 Process Map
3.2.1.1.1 Existing Business Process/es

Figure 3.2.1.1.1.1 Flowchart Diagram (Existing Business Process)
The current NLEX business process involves The Central IT and Central Operations Maintenance and Management units at NLEX work in tandem to transform raw expressway data into operational intelligence through a structured data pipeline. Central IT manages the foundational infrastructure, using Apache NiFi and Kubernetes to ingest heterogeneous data from toll systems and lane alarms into a MinIO and Amazon S3 storage environment. This data is processed through a medallion architecture on Databricks, where the engineering team maintains the Bronze (raw) and Silver (cleansed) layers to ensure high data quality and reliability.
Transitioning to the analytical phase, the Big Data Analytics (BDA) team within Central Operations curates the Gold layer by applying specific business logic to create datasets optimized for traffic demand and road quality reports. The process culminates in the dissemination of validated insights via Microsoft Power BI and spreadsheet models, providing executive leadership with the necessary tools for data-driven decision-making.
3.2.1.1.2 Proposed Business Process/es
The proposed business process includes the users of the system as well as the actions they can perform within the system by their role. All users must log in using valid credentials with a One-Time Password (OTP) to confirm their credentials.



Table 3.2.1.1.2.1 System Users
| User Role | Description | Responsibilities | Modules Access | Permissions (CRUD) | Authentication |
| --- | --- | --- | --- | --- | --- |
| SmartFlow NLEX Dashboard | SmartFlow NLEX Dashboard | SmartFlow NLEX Dashboard | SmartFlow NLEX Dashboard | SmartFlow NLEX Dashboard | SmartFlow NLEX Dashboard |
| Data Analyst | Highest access of the system | Manage user authentication, oversee the maintenance, and audit all system logs | All Modules | Create, Read, Update, and Delete | Email + Password + Email OTP |
| NLEX Traffic Control Center (TCC) Operators | Operations staff focused on corridor-wide traffic flow | Perform real-time monitoring of the expressway corridor, validate forecasts, and oversee traffic flow. | Home, Traffic, Incident, Map Comparison, AI Sandbox, and Maintenance Tab | Read and Update | Email + Password + Email OTP |
| Incident Operator | Operations staff dedicated to road emergency management | Monitor accidents, verify community-sourced incident reports, and update road-status in real-time | Home, Traffic, Incident, Map Comparison, and Maintenance Tab | Read and Update | Email + Password + Email OTP |
| SmartFlow NLEX Mobile | SmartFlow NLEX Mobile | SmartFlow NLEX Mobile | SmartFlow NLEX Mobile | SmartFlow NLEX Mobile | SmartFlow NLEX Mobile |
| Commuters/ Drivers | End-user accessing the system via mobile app | Receive alerts and create user submitted community sourced reports | Dashboard, Map, AI Assistant, Alert, and Community | Read and Create | Email + Password + SMS OTP |


A. Dashboard Swimlane Diagrams

Figure 3.2.1.1.2.1 Dashboard Login and Home Feature Swimlane Diagram (Proposed Business Process)
The Login Feature serves as the system's primary security gateway, wherein users either enter credentials directly or initiate a Forgot Password sequence, and the System validates the submission through a "Credentials Valid?" decision point, requests an email-based One-Time Password (OTP), and upon successful OTP verification, enforces RBAC to confirm the user's role before redirecting them to the Home Page, the Home Feature then functions as the central navigational dashboard, where the System renders Display Traffic KPIs and Display Key Features panels, providing users with a real-time operational overview and navigational access to all role-appropriate modules throughout the session.

Figure 3.2.1.1.2.2 Dashboard Traffic and Incident Feature Swimlane Diagram (Proposed Business Process)

In Figure 3.2.1.1.2.2, it shows the Traffic and Incident Features follow identical three-tier analytical structures, each initiated by clicking their respective tabs, which activate corresponding Metrics and Summary Insights components in the System lane that converge into a central Analytics module, Traffic Analytics or Incident Analytics, from which three parallel branches are rendered Descriptive Analytics presenting historical patterns such as traffic volume trends, congestion analysis, hotspot locations, and incident severity, Predictive Analytics generating forward-looking forecasts across the same dimensions; and Prescriptive Analytics delivering actionable Recommendations and Strategies, collectively equipping operators and analysts with a comprehensive intelligence framework for data-driven traffic management and incident response decision-making.

Figure 3.2.1.1.2.3 Dashboard Emission and Agent Based Simulation Feature Swimlane Diagram (Proposed Business Process)
In Figure 3.2.1.1.2.3, it shows the Emission Feature extends the system's analytical scope to environmental sustainability, wherein clicking the Emission Tab activates Emission Metrics and Summary Insights that feed into the Emission Analytics module, producing Descriptive Analytics covering carbon emission estimation and fleet mix analysis, Predictive Analytics generating corresponding forecasts, and Prescriptive Analytics delivering emission reduction strategies; the Agent-Based Simulation Feature complements this by providing a high-fidelity modeling environment accessible via the AI Sandbox Tab, where users configure simulation parameters including route configuration, traffic direction, and lane capacity sliders before executing a Run Traffic Simulation sequence that the system processes through Virtual Environment Initialization, Agent Behavior Processing, and Visual Traffic Generation, enabling stakeholders to evaluate traffic management strategies under controlled, risk-free simulated conditions.

Figure 3.2.1.1.2.4 Dashboard Maintenance and Map Comparison Feature Swimlane Diagram (Proposed Business Process)
Figure 3.2.1.1.2.4 shows the Maintenance Feature facilitates structured road maintenance scheduling through a linear user workflow of View Schedule Table, Set Maintenance Schedule, Click Confirm, and Map Comparison, after which the System stores the schedule and pushes it to a companion mobile application for field personnel dissemination; the Map Comparison Feature then provides a geospatial interface where users may simultaneously observe Waze Real-Time Traffic and Monitor Forecasted Traffic, with the System rendering these alongside a Show Scheduled Maintenance overlay through side-by-side visualizations, enabling operators to cross-reference live conditions, predictive traffic models, and planned maintenance disruptions within a single unified spatial interface to support informed operational decision-making.


Figure 3.2.1.1.2.5 Dashboard Data Management and Audit Log Feature Swimlane Diagram (Proposed Business Process)
Figure 3.2.1.1.2.5 shows the Data Management Feature governs raw data ingestion by allowing users to upload CSV or XLSX files, which the System automatically processes through an Execute Ingestion Pipeline, Run Data Validation, and Perform Feature Engineering sequence to produce model-ready datasets that underpin all analytical modules; the Audit Log Feature complements this by maintaining a comprehensive record of all system activities, wherein users may view log summaries, filter activities by Category, Severity, or Time, and export reports, while the System continuously queries security logs, retrieves action history, and monitors system and data status, collectively ensuring data integrity, regulatory compliance, and full traceability of all user interactions across the platform.


Figure 3.2.1.1.2.6 Dashboard High Level Swimlane Diagram (Proposed Business Process)
In Figure 3.2.1.1.2.6, it shows the Dashboard High-Level swimlane diagram presents the overarching access and navigation structure of the proposed NLEX TCC Intelligence System across three user roles Incident Operators, Data Analysts, and TCC Operators each beginning with a universal login process wherein the System validates credentials and enforces Role-Based Access Control (RBAC) before directing users to their respective Home Page dashboards with role-differentiated feature access; Incident Operators access Traffic, Incident, Map Comparison, and Maintenance modules, TCC Operators additionally access the AI Sandbox, and Data Analysts are afforded full system access including Emission, Data Management, and Audit Log, with all feature interactions supported by a backend ETL Pipeline feeding a central Database that powers an Analytics-to-Display pipeline delivering processed outputs to each user's interface.

B. Mobile Swimlane Diagrams

Figure 3.2.1.1.2.7 Mobile Login and Dashboard Feature Based Swimlane Diagram (Proposed Business Process)

Figure 3.2.1.1.2.7 shows the Mobile Login and Dashboard Feature swimlane diagrams collectively illustrate the entry and primary navigation workflow of the SmartFlow NLEX mobile application, both organized across two swimlanes, Commuters & Drivers, representing user-facing actions, and System, representing the backend logic of the SmartFlow NLEX Dashboard System. The login workflow begins when the user either submits credentials or initiates a forgotten password request, after which the system evaluates validity through a Credentials Valid? decision node, dispatches an SMS-based One-Time Password (OTP), and upon successful Valid OTP? verification, updates the database and grants the user access to the Home Page.
Upon login, the dashboard workflow is activated when the user selects View Dashboard, branching into four navigational options, View Traffic Forecast, Click Events, Click Maintenance, and Click Incidents, each triggering corresponding backend modules including Traffic Analytics, Maintenance Feature, and Incident Analytics, which produce predictive outputs such as congestion pattern forecasts, scheduled maintenance data, and incident hotspot forecasts that are dynamically rendered back to the user interface. Together, these two diagrams establish the foundational access and information delivery pipeline of the system, ensuring that authenticated users are immediately presented with organized, data-driven traffic intelligence upon entry.






Figure 3.2.1.1.2.8 Mobile Map and Community Feature Based Swimlane Diagram (Proposed Business Process)
In Figure 3.2.1.1.2.8, it shows the Mobile Map and Community Feature swimlane diagrams illustrate two complementary data consumption and contribution workflows within the SmartFlow NLEX application, both structured across the Commuters & Drivers and System swimlanes to capture the interaction between user actions and backend data processing. In the Map Feature, the workflow begins when the user selects the Map Tab, prompting the system to activate the Map Feature module, retrieve Forecasted Traffic data, and return a Rendered Map Visualization to the user as a predictive time-slider map, enabling commuters to anticipate traffic conditions along NLEX corridors at various projected time intervals. In the Community Feature, the user navigates to the Community module and selects from four options, View Community Updates, Post a Community Update, View Recent Incidents, and Report an Incident, with user-submitted inputs forwarded to the system's Real-Time Streaming Extraction process, passed through the ETL Pipeline, stored in the Database, and subsequently rendered back to the user interface as community updates. Taken together, these diagrams demonstrate the system's capacity to deliver both machine-generated geospatial forecasts and crowdsourced community intelligence, reinforcing SmartFlow NLEX's dual approach to real-time and predictive traffic awareness.


Figure 3.2.1.1.2.9 Mobile AI Chatbot and Alert Feature Based Swimlane Diagram (Proposed Business Process)
Figure 3.2.1.1.2.9 shows the Mobile AI Chatbot and Alert Feature swimlane diagrams illustrate the intelligent assistance and notification management components of the SmartFlow NLEX application, both organized across the Commuters & Drivers and System swimlanes to define how personalized, real-time information is delivered to users. In the Chatbot Feature, the workflow begins when the user engages with the AI Chatbot module, initiating an iterative, multi-turn conversational session on topics such as traffic conditions and travel guidance, while the system concurrently processes queries through Traffic Analytics and Incident Analytics modules that converge to produce Insights relayed back to the user as natural language responses. In the Alert Feature, the user navigates to the Alert module and opts to either enable or disable smart alerts; when enabled, the system evaluates incoming Push Notifications through an Enabled Push Notifications? decision node, routing confirmed notifications to the user's View Notifications interface, while a negative evaluation halts delivery and reflects the disabled state. Together, these diagrams demonstrate how the system provides both proactive and on-demand intelligence delivery, enabling commuters to receive timely, data-driven traffic advisories either through conversational AI interaction or automated push notification alerts.

Figure 3.2.1.1.2.10 Mobile High Level Swimlane Diagram (Proposed Business Process)
The Mobile High-Level swimlane diagram provides a comprehensive overview of the end-to-end user interaction flow within the SmartFlow NLEX mobile application, organized across two swimlanes, Commuters & Drivers, representing the user-facing navigational actions, and System, representing the backend authentication logic and the SmartFlow NLEX Dashboard System infrastructure. The workflow begins at the START node, where the user initiates a login through the mobile application; the system then evaluates the submitted credentials through a Credentials Valid? decision node, looping the user back to the login screen upon failure or, upon successful validation, directing them to the Mobile Dashboard.
From the dashboard, the user gains access to five core functional modules: View Dashboard, View Map, Converse with AI Assistant, View Alert, and View Community, each representing a distinct feature of the application. All user interactions across these modules are processed through the SmartFlow NLEX Dashboard System, which serves as the central backend engine, and are further supported by an MLOps layer that underpins the system's machine learning and predictive analytics capabilities. Dashed feedback arrows from each module back to the user swimlane indicate the continuous and iterative nature of user engagement across features. This high-level diagram thus establishes the architectural overview of the SmartFlow NLEX mobile application, demonstrating how authenticated user access, multi-feature navigation, and a unified backend system collectively support the delivery of intelligent, data-driven traffic management services to commuters and drivers.
3.2.1.2 Data Flow Diagram
The SmartFlow NLEX system utilizes a highly scalable, multi-layered data pipeline designed to handle the continuous, high-velocity ingestion of complex traffic parameters. To achieve true Decision-Intelligence, the architecture systematically routes data through distinct operational layers
3.2.1.2.1 Proposed Data Pipeline

Figure 3.2.1.2.1.1 Data Pipeline
a.) Source Layer
The pipeline begins at the Source Layer, which gathers raw information from multiple distinct origins. Internal traffic and incident datasets are provided directly by the NLEX Corporation. To provide external context, the system connects to Third-Party APIs (such as OpenWeather), scrapes regional ticketing websites for major event schedules, and retrieves crowdsourced traffic reports from the Waze Partner Hub (MPTC). Additionally, the system captures direct user inputs from community reports submitted via the mobile application.

b.) Extract Layer
Before any data is pulled into the system, it must first pass through Validation Gate 1, which acts as a preliminary security check to verify source availability, schema format, and token validity. Once cleared, the data is pulled using a dual-ingestion strategy: standard Python scripts handle the scheduled extraction of historical batch data, while a Redis server handles the high-speed, real-time streaming extraction of live reports. Finally, the extracted data passes through Validation Gate 2, which checks for basic data health, such as row counts, correct data types, and timestamp freshness, ensuring no corrupted files enter the database.
c.) Staging Layer
The extracted data is then securely loaded into a central PostgreSQL database, specifically designated as the system's "Bronze Layer." At this stage, all raw internal and external records are temporarily housed in their original formats. Before moving forward, the data must pass Validation Gate 3. This critical checkpoint scans for duplicate records, detects unexpected volume anomalies, and actively flags any sensitive Personally Identifiable Information (PII) from user reports. This ensures the data is safe, legal, and consistent before any analytical cleaning begins.

d.) Transform Layer
The Transform Layer acts as the primary engine for converting raw "Bronze" records into high-quality analytical sets. Within this layer, a Data Cleaning Engine removes duplicate entries, standardizes formats, and fills in missing values to ensure consistency across the multi-source data. Simultaneously, a Feature Engineering Engine calculates the specific variables required for the models, such as time-series trends, road geometry patterns, and carbon emission factors. This refined data must then pass Validation Gate 4, which strictly enforces business rules and ensures that combined data points, like weather and traffic volume are mathematically aligned before they are stored.
e.) Load & Data Warehouse Layer
Once validated, the data is loaded into the PostGIS-enabled PostgreSQL database, representing the system’s "Silver Layer" or Data Warehouse. Here, the information is organized into Fact and Dimension tables to support efficient spatial and historical queries. For specialized high-level insights, data is further optimized into a Gold Layer (Datamart). This tier serves as the specific retrieval source for the RAG (Retrieval-Augmented Generation) engine, ensuring the AI chatbot provides commuters with travel advice based only on verified, historical system records.

f.) Analytics and Machine Learning Layer
The refined data from the warehouse feeds into a three-part analytics engine. The Descriptive Analytics engine identifies historical trends and incident patterns, while the Predictive Analytics engine uses machine learning to forecast traffic conditions and incident probabilities. Finally, the Prescriptive Analytics engine generates recommendations and "What-If" simulations. To keep these models accurate, an MLOps Feedback Loop Engine monitors performance through Validation Gate 5. If accuracy levels drop, the system automatically triggers a retraining process to update the models with fresh data
g.) Consumption Layer
The Consumption Layer provides the final interface for NLEX operators and commuters. Operators access a web-based dashboard built on Next.js and Electron, which uses Apache ECharts and Mapbox GL JS to display time-series graphs and traffic heatmaps. Commuters interact with the system through a mobile application developed with Expo and React Native, which provides real-time incident reporting and an AI Chatbot assistant for natural language travel support.

h.) Orchestration, Monitoring, and Security Layer
This final layer provides the horizontal support needed to maintain the entire pipeline. Orchestration manages automated error handling and audit logs, while Monitoring tracks the health of the pipeline and detects model drift to ensure the forecasts remain reliable. The Security framework safeguards the system through multi-factor authentication, data encryption, and masking, ensuring the platform is protected against technical vulnerabilities and unauthorized access.

Figure 3.2.1.2.2.2 Data Pipeline - Modeling Layer
To effectively manage the NLEX corridor, the SmartFlow modeling architecture processes data through a strict, three-tier analytical layer. Raw data is first organized to establish historical baselines (Descriptive), processed via machine learning to anticipate future conditions (Predictive), and finally evaluated through mathematical optimization to recommend concrete interventions (Prescriptive). This structured layer is applied across three core operational domains.
Within the Traffic Volume and Congestion Dynamics domain, the system manages routine flows alongside unpredictable surges. For overarching traffic trends, the descriptive layer applies STL Decomposition and Rolling Means to isolate true vehicle growth from daily noise. This baseline feeds predictive time-series models (SARIMAX, LSTMs) to generate accurate 24-hour forecasts, which the prescriptive layer utilizes via linear programming to recommend optimal toll staffing and automated surge alerts. To manage daily bottlenecks, Gaussian Mixture Models (GMM) empirically map speed-flow relationships to define historical congestion states. XGBoost and Quantile Random Forests calculate the probability of these states occurring, enabling a fuzzy rule-based engine to prescribe graduated responses, such as counter-flow lane advisories. During massive planned events, control-day comparisons establish historical volume uplifts, allowing event-aware models (Prophet) to forecast localized surges. Finally, TOPSIS decision analysis ranks and prescribes the most efficient event traffic management plans.
The Incident Management and Safety Analytics domain focuses on spatial risks, accident lifecycles, and weather degradation. The descriptive layer applies Kernel Density Estimation (KDE) to historical crash coordinates to map chronic risk hotspots. Geographically Weighted Regression (GWR) evaluates these hotspots against real-time variables to predict a dynamic list of high-risk segments, allowing linear programming to prescribe optimal emergency patrol deployments. For specific traffic disruptions, the descriptive layer tracks the historical Mean Time to Clear (MTTC). Upon detecting an incident, ordinal logistic regression instantly classifies its severity, while a Cox Proportional Hazard model predicts its exact clearance timeline. Because emergency recovery involves uncertainty, stochastic linear programming formulates a dynamic response protocol that safely manages queues even if clearance times fluctuate. Additionally, the Mejia and Sigua model empirically calculates historical capacity drops during rainfall. Multivariate LSTMs use this data to project weather-adjusted speed contours, prompting rule-based engines to automatically prescribe localized speed reductions and commuter advisories.
The Environmental Impact and Fleet Sustainability domain ensures the corridor meets ecological mandates by mitigating traffic-driven emissions. The descriptive layer calculates the baseline footprint by dynamically retrieving class-specific multipliers via the Climatiq API, using delay-weighted accounting to measure historical delay-induced carbon excess. Non-linear Gradient Boosting Regressors (GBR) then forecast dynamic, 7-day corridor CO₂ tonnage. To actively curb these emissions, Monte Carlo simulates stress-test scenarios, allowing the prescriptive engine to recommend dynamic tolling interventions that mathematically minimize CO₂ per class-km. Because heavy vehicles dictate capacity and emissions, the descriptive layer first establishes the historical proportional share of different vehicle classes. Dirichlet Regression algorithms then forecast this compositional data to predict upcoming heavy vehicle surges. If a massive logistics surge is anticipated, operators can use the Agent-Based Simulation Sandbox to virtually test heavy-vehicle window restrictions, visually validating the emission reduction strategy prior to real-world enforcement.
## 3.3 Business Solution
SmartFlow NLEX serves as a centralized Decision-Intelligence System (DIS) designed to modernize traffic management within the North Luzon Expressway by shifting from a reactive monitoring model to a proactive, predictive framework, specifically designed to anticipate non-routine disruptions such as incidents, extreme weather, and major events. By integrating high-velocity internal toll operation datasets with these external variables, the platform utilizes a refined modeling layer to provide actionable foresight for both operators and the public.
This solution is delivered through two synchronized products, starting with an operations dashboard tailored for Traffic Management Centers that features a segment-informed Agent-Based Sandbox to allow operators to perform risk-free "What-If" simulations of intervention scenarios such as counter-flow deployments or lane closures before real-world execution. Complementing the operator dashboard is a dedicated mobile application designed to directly empower daily commuters. By delivering predictive volume estimates, proactive travel advisories, and probability-based incident warnings straight to their devices, the app enables users to effectively plan their daily trips, avoid anticipated congestion before it happens, and ensure a more predictable and efficient journey across the NLEX corridor.
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
| R01 | Scraper Failure: The Philippine Arena or SM Tickets website changes its HTML layout, breaking the External Scraper in the Source Layer. | 5 | 3 | MEDIUM | Mitigation: Use flexible CSS selectors in the scraper and run weekly health checks on the scraping module. Contingency: Manually enter major event data or pull from secondary news APIs as a backup data source. |
| R02 | API and Real-Time Downtime: Third-party APIs and Real-Time Sources, like Weather Data API and Waze Partner Hub, go offline unexpectedly, cutting off live data to the Extract Layer. | 3 | 5 | HIGH | Mitigation: Use Redis to cache the last valid API response so the Real-Time Streaming Extraction can continue running on cached data. Contingency: Display a data-unavailability alert on the Web Dashboard and continue forecasting using the last cached values from the Bronze Layer. |
| R03 | Incomplete NLEX Dataset: The Traffic Dataset or Incident Dataset from the Internal Data source has too many missing values, affecting the quality of data entering the Bronze Layer. | 3 | 5 | HIGH | Mitigation: Apply the Data Cleaning Engine's fix-missing-values and normalization steps during the Transform & Validation Layer. Contingency: Use statistical interpolation based on neighboring time periods or similar segments to fill in the gaps before loading into the Silver Layer. |
| R04 | Low Model Accuracy: The models in the Predictive Analytics Engine, particularly Traffic Forecasting and Incident Probability Prediction, do not reach the target accuracy during the Evaluation Metrics Engine stage. | 3 | 5 | HIGH | Mitigation: Run multiple training iterations using the MLOps Feedback Loop Engine and tune hyperparameters during each sprint. Contingency: Use the Model Selection Engine to fall back to a simpler but validated model (e.g., SARIMAX) while the LSTM is being retrained. |
| R05 | Team Member Unavailability: A group member becomes unable to continue due to personal or academic reasons, leaving certain pipeline modules unfinished. | 3 | 3 | MEDIUM | Mitigation: Keep all code and pipeline configurations documented and version-controlled on a shared GitHub repository so any member can take over any module. Contingency: Redistribute tasks during the next sprint using the buffer time built into the project timeline. |
| R06 | Scope Creep: New features keep being added, such as expanding coverage beyond NLEX, which delays completing the core pipeline layers. | 5 | 3 | MEDIUM | Mitigation: Any new feature must be formally approved by the adviser before it is added to the development backlog. Contingency: Freeze the scope after Sprint 3 and move non-essential additions to a post-capstone roadmap. |
| R07 | Cloud Cost Overrun: Usage of PostGIS/PostgreSQL hosted on Google Cloud or Redis streaming layer exceeds what the team can afford during the capstone period. | 1 | 3 | LOW | Mitigation: Set up budget alerts at 80% usage and monitor the specific cloud dashboard monthly. Contingency: Switch to a lower-tier plan or run a local PostgreSQL instance for development while keeping cloud deployment only for the final demo. |
| R08 | Security Vulnerabilities: API endpoints connecting the Source Layer to the Extract Layer, or the dashboard's data connections, are left unsecured. | 1 | 5 | MEDIUM | Mitigation: Apply the security measures defined in the Security Layer: HTTPS encryption, data hashing, data masking, OTP-based, etc. Contingency: Immediately revoke compromised credentials, rotate API keys, and notify the NLEX stakeholder representative within 24 hours. |

### 3.4.2 Technological Feasibility
SmartFlow NLEX will be built using technologies that are widely used, well-documented, and mostly free to use. This will make the project technically feasible even within the budget and time constraints of a capstone project.
For the backend and machine learning side, the system will use Python along with libraries like Pandas and NumPy for data processing, Scikit-Learn for classical ML models, and TensorFlow and Keras for the LSTM deep learning model. These are all open-source tools that the team is already familiar with from their IS courses. The XGBoost model will also serve as a popular and well-tested algorithm that will handle the kind of tabular, multi-source data that SmartFlow will use.
For real-time data streaming and caching, Redis will be embedded in the Extract Layer to power the Real-Time Streaming Extraction module. It will cache live Waze Partner Hub data and OpenWeatherMap API responses to maintain pipeline continuity even during brief API outages, addressing Risk R02 directly.
For data storage and management, the system will utilize PostgreSQL. As a powerful, open-source relational database, PostgreSQL will be highly capable of handling the complex, multi-source data structures required for the system's traffic, incident, and emissions logs. It will be completely free to use, highly reliable, and well-documented, ensuring the team will be able to securely store, query, and integrate the system's extensive datasets without incurring licensing costs during the development phase.
For external data, the system will collect data from three main origins: internal NLEX data (the Traffic Dataset and Incident Dataset), third-party APIs (Weather Data API), and user-generated data (Waze Partner Hub reports from MPTC and Community Reports submitted through the mobile app). The external event data will be gathered by an External Scraper that will pull metadata from ticketing websites like SM Tickets and Ticketnet using Python's BeautifulSoup library.
For the outputs, the system will have two interfaces built using ECharts, Mapbox, Next.js, and Electron for the Web Dashboard (used by NLEX operators), and Expo for the cross-platform Mobile Application (used by commuters and drivers). The Agent-Based Simulation Sandbox is embedded within this dashboard, enabling What-If scenario testing. The cross-platform Mobile Application is built with Expo (React Native), supporting both iOS and Android, and includes the AI Chatbot Assistant and Community Report/Updates feature.
Overall, everything the system will need is either free or affordable, and all the tools are ones that the team will be able to realistically learn and use within the capstone timeline.
### 3.4.3 Organizational/Cultural Feasibility
SmartFlow NLEX will fit well with how NLEX Corporation already operates and where it is headed as a company. NLEX has already been moving toward digital solutions through tools like the Easytrip cashless payment system and the MPT DriveHub app under MPTC, so adding a data-driven traffic management system will be a natural next step for them.
The Web Dashboard will be designed specifically for NLEX operators at the Traffic Control Center (TCC). It will give them a centralized interface for monitoring current traffic conditions, reviewing historical trend data, and viewing predictive forecasts that anticipate how traffic will behave in the coming hours. Beyond visibility, the dashboard will also surface actionable guidance through the prescriptive analytics engine, which will generate recommended strategies such as lane management changes, and incident response protocols based on predicted traffic conditions. Operators will also be able to test scenarios before committing to any action using the What-If Simulation feature through the Agent-Based Simulation Sandbox, allowing them to evaluate the projected impact of different interventions in a risk-free environment. Throughout all of this, the system will only provide suggestions, and final decisions will remain with the operators managing the expressway. This design will make it easier for staff to trust and adopt the system without feeling like it is replacing their judgment.
The Community Report/Updates feature in the mobile app will also fit well with how Filipino commuters already behave. Users of Waze are already used to reporting incidents and road conditions in real time, so the concept of user-generated traffic data will not be unfamiliar to them. SmartFlow will build on that familiarity by integrating those reports directly into the Waze User Ingest stream in the Source Layer, making the data more useful for the whole pipeline.
The project will be developed in response to actual operational gaps in how NLEX currently monitors traffic, mainly that their existing process is reactive and relies on manual phone call reports. SmartFlow will address those exact gaps with automated data ingestion, predictive forecasting, and a centralized dashboard, which will make it a much easier sell to the organization compared to a system that solves problems they do not actually have.
### 3.4.4 Economic Feasibility
One of the strengths of SmartFlow NLEX will be that it is affordable to build. Almost the entire technology stack will be either open-source or available for free during development. The highest potential costs will come from optional cloud upgrades and API subscriptions, but even those will be kept within the free tier limits for most of the capstone period.
After deployment, the costs will go up because the system will need to run at a larger scale to support real users. This will include things like paying for more server capacity, production-level API access, and having someone maintain and update the system regularly. These will be standard costs for any live software system, and in the context of NLEX Corporation, a company that handles hundreds of thousands of toll transactions daily, they will be manageable.
Table 3.4.4.1 will compare the expected costs during the development phase versus what it will cost to maintain the system after it is deployed.



Table 3.4.4.1. During and After Deployment Expected Cost Table
| Expense Item | Estimated Cost | Notes |
| --- | --- | --- |
| During Development (Capstone Period, 2025–2026) | During Development (Capstone Period, 2025–2026) | During Development (Capstone Period, 2025–2026) |
| Python (Pandas, NumPy, Scikit-Learn, TensorFlow, Keras, XGBoost, BeautifulSoup) | Free | Open-source libraries used for data processing, ML modeling, and web scraping |
| PostgreSQL (database for traffic, incident, and emissions data) | Free | Open-source relational database; no licensing cost during development |
| Redis (Upstash free tier – 10,000 req/day) | Free | Real-time data caching for streaming extraction; free tier covers development load |
| Weather Data API (OpenWeather) | Free – ₱1,500/mo | Free developer tier is sufficient for testing and development |
| Waze Partner Hub (crowdsourced incident and speed data) | Free | Accessed through NLEX's existing MPTC partnership at no cost |
| ECharts + Mapbox (dashboard data visualization and maps) | Free | Open-source or free tiers used for the Web Dashboard |
| Next.js + Electron (Web Dashboard framework) | Free | Open-source frameworks; no licensing fees |
| Expo (cross-platform Mobile Application) | Free | Open-source framework for building both iOS and Android versions |
| Figma (UI/UX design and prototyping) | Free | Figma's free tier covers all design needs for a student project |
| GitHub (version control and collaboration) | Free | GitHub Free plan for student team repositories and CI/CD pipelines |
| Domain & SSL certificate (demo deployment) | ~₱1,500 one-time | One domain for the capstone demonstration period |
| Printing, documentation, and travel | ~₱3,000 total | Research materials, adviser meetings, and stakeholder coordination |
| Estimated Development Total | ~₱4,500 – ₱6,000 | Almost entirely free; costs are only the domain and incidental expenses |
| After Deployment (Monthly and Annual Costs) | After Deployment (Monthly and Annual Costs) | After Deployment (Monthly and Annual Costs) |
| PostgreSQL hosting (production server) | ₱3,000 – ₱8,000/mo | Needs dedicated cloud hosting to handle real users and continuous data ingestion |
| Redis hosting (Upstash Pay-as-you-go or Redis Cloud) | ₱1,500 – ₱4,000/mo | Sustained real-time stream caching for Waze ingest and API fallback at production scale |
| Weather Data API (production tier) | ₱2,500 – ₱5,000/mo | Higher API call limits required for 24/7 live operations |
| Waze Partner Hub (sustained access) | ₱0 – ₱3,000/mo | Depends on NLEX's continued partnership agreement with MPTC |
| Mapbox (production map tile requests) | ₱2,000 – ₱5,000/mo | Free tier insufficient for production-level dashboard map usage |
| Google Play & Apple App Store fees | ~₱6,500/year | Google Play: ~₱1,500 one-time; App Store: ~₱5,000/year |
| IT staff for maintenance and monitoring | ₱10,000 – ₱20,000/mo | Covers system updates, bug fixes, pipeline error handling, and security patch deployment |
| ML model retraining compute | ₱5,000 – ₱12,000/mo | Periodic retraining triggered by the MLOps Feedback Loop Engine as new NLEX traffic data accumulates |
| Data storage and backups | ₱1,500 – ₱4,000/mo | Growing historical traffic and incident data stored in the database |
| Annual security audit | ~₱20,000/year | Third-party check to verify encryption, authentication, and OWASP compliance |
| Figma (continued design work) | Free – ₱1,100/mo | Free tier may be sufficient; paid plan needed if more team members are added |
| Estimated Monthly Total (Post-Deployment) | ~₱26,000 – ₱63,600/mo | To be covered by NLEX Corporation's IT budget upon deployment |

As shown in Table 3.4.4.1., the development phase is nearly cost-free because the team uses free and open-source tools throughout. The post-deployment costs are higher but manageable for NLEX Corporation. The improvements SmartFlow NLEX brings in terms of faster incident response, reduced congestion, and better resource planning more than justify the operational costs of keeping the system running.
## 3.5 Business Requirements Overview
The business requirements for SmartFlow NLEX are categorized into functional requirements, the specific features and tasks the system must perform. And non-functional requirements, which define the system's performance and quality standards.
### 3.5.1 Functional Requirements
| ID | Functionality | Description |
| --- | --- | --- |
| FR-01 | Multisource Ingestion | The system shall ingest real-time and historical data from toll operations, Waze Partner Hub (incidents), OpenWeather (weather), and social intent scrapers (event metadata). |
| FR-02 | Automated Web Scraping | The system shall employ automated scripts to extract event schedules and attendance estimates from ticketing platforms (e.g., SM Tickets) and event venues. |
| FR-03 | Data Validation | The system shall validate all incoming data to ensure it falls within the NLEX geographic scope and conforms to required data types before storage. |
| FR-04 | Emission Tracker | The system shall track the total carbon emissions from cars that pass through NLEX. |
| FR-05 | ML Forecasting | The system shall use LSTM and XGBoost models to generate 7-days volume predictions from the fused dataset. |
| FR-06 | Agent-Based Sandbox | The dashboard shall provide a simulation environment using Agent-Based Modeling to test the impact of physical interventions (e.g., lane closures). |
| FR-07 | Prescriptive Analytics | The system shall provide "Smart Response" recommendations, such as suggesting the number of additional toll lanes or patrol units needed to address predicted surges. |
| FR-08 | Model Accuracy Display | The dashboard shall visualize real-time performance metrics (MAPE/RMSE) to allow operators to verify the reliability of current forecasts. |
| FR-09 | Incident Visualization | The dashboard shall plot real-time incidents from Waze and internal logs onto a geospatial map for situational awareness. |
| FR-10 | Predictive Time-Slider | The app shall feature a 48-hour time-slider allowing users to visualize future congestion levels (Moderate, Heavy, etc.) for specific NLEX segments. |
| FR-11 | ML-Powered Assistant | The app shall include a natural language assistant that provides travel advice and departure time recommendations based on ML predictions. |
| FR-12 | Proactive Travel Alerts | The system shall push notifications to users regarding predicted event-driven surges or maintenance schedules before they begin their trip. |
| FR-13 | Community Feedback Loop | The app shall allow users to report real-time road conditions, which are then cross-referenced with the dashboard's data for ground-truth validation. |

### 3.5.2 Non-Functional Requirements
| Non-Functional Requirement | Description |
| --- | --- |
| Accuracy | The system must ensure high precision in data processing. Predictive models and AI-driven outputs must meet statistical quality thresholds validated against held-out test data and benchmarked against a Seasonal Naïve baseline. |
| Performance | The system shall prioritize speed and responsiveness. All user-facing queries and page loads must respond within acceptable time limits under normal network conditions, and real-time data pipelines must maintain a consistent refresh rate. |
| Scalability | The architecture is designed to handle growth. The system must remain stable and performant as the database scales and as the number of concurrent users increases, without degradation in response time or reliability. |
| Availability | The system should be accessible to authorized users at all times. It targets "Three Nines" uptime, with all maintenance scheduled during off-peak hours and communicated to users in advance. |
| Security | To protect operational and user data, the system must implement end-to-end encryption and secure authentication protocols. All data in transit must be encrypted, and user credentials must be stored using approved hashing algorithms to prevent unauthorized access. |

## 3.6 Key Indicator Performance (KPI) Catalogue
Table 3.6.1 Traffic Volume Forecast Accuracy KPI Catalogue
| Traffic Volume Forecast Accuracy | Traffic Volume Forecast Accuracy |
| --- | --- |
| Strategic Objective | Ensure the ML forecasting engine produces corridor-wide traffic volume predictions that are operationally actionable and accurate enough to support pre-positioning decisions for NLEX patrol teams. |
| Formula | MAPE = (1/n) × Σ \|(Actual − Forecast) / Actual\| × 100% Computed per toll plaza segment per 15-min interval on holdout set. |
| Data Source | NLEX toll transaction logs fused with Waze Partner Hub crowdsource feeds |
| Target (RAG) | Green MAPE ≤ 12% on 48-hr horizon. Amber 12–18%. Red > 18%. Statistical validity: holdout test on 20% unseen corridor data. Decision coupling: model retraining gate. |
| Leading / Lagging | Leading |

Table 3.6.2 Incident Mean Time to Resolve KPI Catalogue
| Incident Mean Time to Resolve | Incident Mean Time to Resolve |
| --- | --- |
| Strategic Objective | Measure the reduction in incident clearance time achieved by AI-assisted SOP retrieval, ensuring that NLEX response teams restore corridor flow faster than the pre-system baseline. |
| Formula | MTTR = Total time from incident detection to full clearance ÷ Number of resolved incidents Segmented by incident type: stalled vehicle vs. crash.. |
| Data Source | NLEX incident logs from Traffic Control Center (TCC) operational records |
| Target (RAG) | Green MTTR ≤ 10 min (stall) / ≤ 30 min (crash). Amber 10–18 min / 30–45 min. Red > 18 min / > 45 min. Baseline: stalled 21.2 min, crash 60 min. Decision coupling: SOP retrieval latency gate (< 8 sec). |
| Leading / Lagging | Lagging |


Table 3.6.3 Corridor CO₂ Emission Estimation Accuracy KPI Catalogue
| Corridor CO₂ Emission Estimation Accuracy | Corridor CO₂ Emission Estimation Accuracy |
| --- | --- |
| Strategic Objective | Ensure the carbon analytics module accurately estimates vehicle emissions across all 105 km of NLEX segments without physical air sensors, supporting ESG reporting obligations. |
| Formula | CO₂ (kg) = Σ [Volume × Vehicle Class Emission Factor × (Distance + Delay-Weighted Idling Factor)] MAPE computed against sampled reference emission measurements. |
| Data Source | NLEX toll plaza vehicle classification logs; Climatiq |
| Target (RAG) | Green Emission MAPE ≤ 15%; 100% corridor segment coverage. Amber 15–25%; partial coverage. Red > 25% or coverage gaps. Baseline: 25–30% |
| Leading / Lagging | Lagging |

Table 3.6.4 Agent-Based Simulation Throughput & Acceptance KPI Catalogue
| Agent-Based Simulation Throughput & Acceptance | Agent-Based Simulation Throughput & Acceptance |
| --- | --- |
| Strategic Objective | Validate that the AI Sandbox completes simulations within operational time limits and that system-generated strategies achieve high acceptance from NLEX traffic operators. |
| Formula | Throughput: Simulation completion time (seconds) per what-if scenario run. Acceptance Rate = (Strategies approved by operators ÷ Total strategies generated) × 100%. |
| Data Source | System-generated simulation logs; operator decision records from NLEX TCC dashboard; |
| Target (RAG) | Green Simulation ≤ 120 sec; acceptance ≥ 90%. Amber 120–200 sec; 75–89%. Red > 200 sec or acceptance < 75%. Baseline: no simulation tool (0% pre-validated decisions). |
| Leading / Lagging | Leading |


## 3.7 Mock-ups
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

Figure 3.7.1.1 Home Page

Figure 3.7.1.2 Map Page

Figure 3.7.1.3 Community Page

Figure 3.7.1.4 Assistant Page

Figure 3.7.1.5 Alert Page
## 3.8 System Generated Outputs
This section details the various outputs generated by the SmartFlow NLEX system. These visualizations shall serve as visual evidence of traffic conditions, environmental impact, and predictive insights, facilitating data-driven decision-making for both expressway management and motorists.
a.) Traffic Situation and Incident Summary
This is a descriptive output generated through the integration of toll plaza logs and multisource incident data. This report translates raw traffic coordinates and volume counts into geospatial heatmaps and interactive charts, allowing NLEX Traffic Control Center (TCC) operators to visually identify recurring periods of congestion and high-risk accident hotspots. By summarizing historical performance along the 105km corridor, this system-generated view provides management with the necessary context to evaluate road efficiency and document localized traffic trends.
b.) Predictive Traffic Outlook (48-Hour Forecast)
This is an advanced analytical graphical representation produced by the system’s LSTM and XGBoost engines. Rather than providing static data, this shall generate dynamic visualizations of projected vehicle volumes, specifically highlighting anticipated "surges" caused by external factors such as weather intensity and social events. This automated output serves as a strategic planning tool for NLEX Corporation, enabling them to anticipate demand peaks and allocate operational resources, such as additional toll tellers or patrol units, in advance.
c.) Carbon Emission and Environmental Sustainability
This feature shall generate a localized view of the expressway’s environmental impact by correlating vehicle classification and travel speeds with estimated CO₂ emissions per vehicle class based on observed traffic volumes and average corridor speeds.
d.) Smart Response Recommendation
This shall represent the system's prescriptive output, automatically generated when the system’s decision-intelligence engine detects that specific operational thresholds have been exceeded. When the data pipeline identifies a critical intersection of high traffic volume and adverse conditions, such as heavy rainfall or a reported incident, the system generates this structured form to suggest immediate tactical actions. These recommendations include the optimal number of patrol units to deploy, suggested lane management strategies, and estimated recovery times for the affected segment. By providing a standardized digital action plan, this output serves as a real-time decision-intelligence tool, helping NLEX TCC operators react consistently and efficiently to restore free-flow conditions along the corridor.

e.) Commuter Trip Advisory
This is an output generated specifically for the mobile application to assist motorists in proactive trip planning. This shall translate complex predictive analytics into a user-friendly format, featuring an interactive time-slider that shows the "best time to leave" based on 48-hour volume forecasts. By providing personalized travel time estimates and weather-impact warnings, the system generates actionable insights that empower commuters to avoid peak congestion, effectively helping to balance the traffic load across the expressway.
## 3.9 Data Gathering (with ETL)
The data gathering of the system, shown in Figure 3.9.1, will employ an Extract, Transform, and Load (ETL) architecture designed to process multisource, heterogeneous data across four distinct pipeline layers. This pipeline will ensure that raw historical logs, real-time crowdsourced reports, and external environmental variables are systematically ingested, validated, standardized, and spatially warehoused to support the system's descriptive, predictive, and prescriptive analytics engines. Each layer will be equipped with dedicated Validation Gate Engines that will enforce data quality at every transition point, ensuring only reliable, well-formed data advances through the pipeline.

Figure 3.9.1 ETL Process Diagram
### 3.9.1 Data Sources
The Source Layer will establish the foundational datasets required for comprehensive traffic analytics, categorized into four distinct input streams. Internal Data will be acquired directly from NLEX Corporation and will comprise the Road Crash Table, which will record each incident with timestamps, kilometer location, lane, vehicles involved, driver demographics, accident cause and type, weather condition, pavement type, and casualty counts; the Stalled Vehicle Table, which will log stalling events with timestamps, entry point, kilometer location, driver gender, and assistance rendered; the Apprehension and Undercap Table, which will capture enforcement records including violations and actions taken; and the Traffic Reports Tables, which will provide Northbound and Southbound daily vehicle entry counts disaggregated by toll exit and vehicle classification, from which Average Daily Traffic volumes will be derived.

Third-Party APIs will be utilized to retrieve external environmental and contextual variables, specifically real-time and historical weather conditions sourced from a Weather Data API and event or ticketing schedules scraped from Ticketing Websites. These variables will be incorporated as contextual features that historically correlate with expressway congestion patterns. Third-Party Data will additionally be ingested through the Waze Partner Hub integrated with the Metro Pacific Tollways Corporation (MPTC), providing access to crowd-verified, geolocated traffic anomaly feeds, jam severity records, and incident markers in near real-time. Complementing these external streams, User-Ingested Data will capture community-generated incident reports submitted directly through the system's integrated mobile application, providing bottom-up, real-time ground truth from road users experiencing active conditions.
### 3.9.2 Extract
The Extract Layer will employ a dual-ingestion architecture governed by a pre-extraction validation gate to securely retrieve and quality-check raw data before it enters the pipeline. Prior to any data extraction, the pipeline will execute Validation Gate Engine 1, an automated pre-extraction validation gate that will enforce six checks: source availability, response schema conformity, token validity, timestamp freshness, null payload detection, and duplicate source trigger prevention. Only data sources that pass all six checks will be permitted to advance to the extraction stage.
Following successful validation, static and historical records will be ingested through a Batch Data Extraction process executed via Python scripts, handling structured datasets from NLEX Corporation, weather APIs, and ticketing sources by retrieving large-volume historical records in scheduled intervals. Concurrently, live crowdsourced metrics and dynamic incident updates will be captured through a Real-Time Streaming Extraction pipeline facilitated by Redis, processing continuous data feeds from the Waze Partner Hub and the mobile community reporting interface to ensure that time-sensitive events are ingested with minimal latency.
Upon completion of extraction, Validation Gate Engine 2 will be applied to the raw ingested data before it is committed to the staging database. This gate will enforce a row count threshold check, field completeness check, data type conformity check, timestamp range check, encoding and character set check, and a real-time versus batch synchronization check to validate consistency between streaming and batch records originating from the same source. Data that successfully passes this gate will be committed to the Bronze Layer, implemented as a PostgreSQL database that will consolidate all ingested raw data into a unified store encompassing Internal Data from NLEX, Weather API data, ticketing website scrapes, Waze and MPTC stream records, and user-ingested community reports. The Bronze Layer will serve as the system's immutable raw data archive, preserving source-fidelity before any transformations are applied.
Before the data is released into the Transform Layer, Validation Gate Engine 3 will be applied to the staged Bronze Layer data. This gate will perform a referential integrity check, schema drift detection, cross-source consistency check, duplicate record check, volume anomaly check, and PII and sensitive field detection to identify and flag any personally identifiable or sensitive information that will require masking prior to further processing. Only Bronze Layer data that passes all Validation Gate Engine 3 checks will be released into the Transform Layer.
### 3.9.3 Transformation
Once validated and cleared from the Bronze Layer, the raw staged data will enter a Python-based transformation environment for comprehensive standardization and feature enrichment. This layer will operate through two sequential processing engines followed by a pre-load validation gate.
3.9.3.1 Data Cleaning Engine
The Data Cleaning Engine will resolve inconsistencies and prepare the raw data for analytical use by removing duplicate records across all source streams, fixing missing values through imputation or interpolation strategies appropriate to each field type, and applying normalization and standardization procedures to ensure uniform formatting, units, and categorical encodings across all datasets.

3.9.3.2 Feature Engineering Engine
The Feature Engineering Engine will then enrich the cleaned dataset by deriving advanced analytical variables required by the system's machine learning models across six feature categories. Time Features will consist of temporal variables derived from timestamps, including hour of day, day of week, month, holiday flags, and peak and off-peak period indicators. Incident Features will consist of encoded variables describing incident type, severity, location, and historical recurrence patterns derived from the Road Crash, Stalled Vehicle, and Apprehension and Undercap tables.
a.) Time Features
Temporal variables will be derived from timestamps, including hour of day, day of week, month, holiday flags, and peak/off-peak period indicators.
b.) Incident Features
Encoded variables will describe incident type, severity, location, and historical recurrence patterns derived from the Road Crash, Stalled Vehicle, and Apprehension and Undercap tables.

c.) Traffic Features
Traffic Features will consist of aggregated and derived metrics representing traffic volume, flow rate, density, congestion index, and incident-adjusted throughput per expressway segment and direction. The engine will compute the core traffic variables from the NLEX directional traffic reports beginning with the Average Daily Traffic (ADT) per exit and vehicle class, calculated as:

Where  is the recorded daily vehicle entry count for a specific toll exit and vehicle classification (Class 1, Class 2, or Class 3), and  is the number of days in the observation period. The Total Average Daily Traffic across all vehicle classes for a given exit will then be aggregated as:



To measure the expressway-wide directional traffic load, the Total Corridor Volume per direction will be derived by summing ADT values across all exits for that direction:

Where direction denotes either Northbound or Southbound. To quantify the proportion of traffic contributed by each exit relative to the total corridor volume, the Exit Traffic Share will be computed as:

Finally, to detect and flag abnormal traffic behavior, a Volume Deviation Index (VDI) will be derived for each exit-day observation:

Where  is the observed daily volume for a specific exit on day d,  is the historical average for that exit, and  is the standard deviation of daily volumes for that exit across the full observation period. A VDI value exceeding an established threshold will be flagged as a traffic anomaly for cross-validation against concurrent incident records.
d.) Emission Features
Emission Features will consist of programmatically computed environmental variables that will quantify carbon output under both normal and incident-affected traffic conditions. The engine will derive the Baseline Emissions (E_baseline) representing the carbon footprint of standard daily operations using the following formulation:

Where  will denote the normal traffic volume for a specific vehicle classification across a given segment, D will represent the physical distance of that NLEX expressway segment, and  will be the vehicle-class-specific emission factor retrieved via API. To further quantify the environmental cost of traffic disruption, the engine will compute the Idling Penalty (), representing the excess greenhouse gas emissions produced by vehicles trapped during an incident. The total delay duration will first be calculated as:

The idling penalty will then be derived using:

Where  will represent the total vehicular volume trapped within the affected segment;  will be the continuous standstill duration; and  will be the idling-specific emission factor retrieved via API. These programmatically derived emission variables will subsequently be fed as continuous input features into the system's predictive models.

e.) External Features
Contextual variables sourced from weather API data and ticketing or event schedules will reflect environmental and social conditions that influence traffic patterns.
f.) Spatial Features
Geospatial variables will encode expressway segment identifiers, GPS-based kilometer coordinates (e.g., KM 16+800), lane designations, segment topology, and proximity relationships between toll gates and interchange nodes, leveraged by the PostGIS-enabled data warehouse.
Prior to loading into the data warehouse, the transformed dataset will undergo Validation Gate Engine 4, a final quality enforcement stage that will verify quality and confidence score thresholds, enforce business rules, check feature completeness, detect outliers, validate normalization ranges, perform cross-source validation pass/fail checks, and confirm fact and dimension referential integrity to ensure that all foreign key references within the transformed data will correctly correspond to valid entries in the dimension tables of the target warehouse. Only records that pass all checks in Validation Gate Engine 4 will be committed to the Silver Layer.

### 3.9.4 Load and Data Warehouse Layer
The Load Layer will serve as the final stage of the ETL pipeline, where the fully transformed, enriched, and validated dataset will be persistently stored in the system's production data warehouse. To accommodate the inherently geospatial nature of expressway analytics, the Silver Layer will be implemented on PostgreSQL augmented with the PostGIS spatial extension, enabling native storage, indexing, and querying of geographic objects such as segment geometries, incident coordinates, and toll gate locations. The warehouse will be structured into three principal table categories: Fact Tables, which will store quantitative transactional records such as traffic volume observations, incident logs, and emission computations; Dimension Tables, which will store descriptive reference data including segment metadata, vehicle classifications, time hierarchies, and weather condition codes; and Feedback and Model Output Tables, which will store the inference results and performance feedback generated by the deployed machine learning models, enabling continuous retraining and model evaluation cycles.
Downstream of the Silver Layer, a Gold Layer Datamart will be derived to serve the system's Decision-Intelligence dashboard and reporting interfaces. This aggregated, query-optimized layer will expose pre-computed analytical summaries, KPI metrics, and trend outputs directly to the prescriptive analytics components. Additionally, the Gold Layer will function as a Retrieval-Augmented Generation (RAG) retrieval source, providing structured contextual data to support any language model-assisted query interfaces or advisory outputs integrated within the system. Together, the Silver and Gold Layers will constitute the system's single source of truth, ensuring that information is efficiently stored, spatially indexed, and rapidly accessible for querying by the predictive forecasting models and the prescriptive Decision-Intelligence dashboard.
## 3.10 Presentation of Schema
During the data modeling phase, the operational data is restructured into a Fact Constellation Schema to make it highly efficient for analysis. This model comprises two central fact tables, one for traffic volume and one for incident logs, which are supported by six shared dimensional tables. This organized structure enables the systematic capture, storage, and fast retrieval of essential daily expressway data required by the system's predictive models and dashboard.

Figure 3.10.1 Database Schema
The proposed system employs a Fact Constellation Schema to restructure multisource operational data into an analytically efficient format. This architecture utilizes two central fact tables supported by six shared dimension tables, enabling the rapid OLAP querying required for both predictive machine learning and real-time dashboard visualization.
At the core of this schema are the two fact tables. The fact_traffic_volume table captures continuous operational metrics, such as total vehicle counts, average speeds, and computed carbon emissions, serving as the numerical foundation for traffic forecasting. Conversely, the fact_incident_log isolates discrete traffic anomalies to track specific operational KPIs, including Mean Time to Clear (MTTC) and physical impact length. Separating these metrics ensures continuous traffic forecasting remains uncorrupted by discrete crash data.

These fact tables are contextualized by six unified dimension tables:
dim_location: Provides the spatial backbone (including PostGIS geometries) required for the dashboard's virtual map and prescriptive routing.
dim_time: Supplies the strict temporal hierarchy necessary for the LSTM networks to predict seasonal and hourly volume peaks.
dim_vehicle_class: Stores fleet descriptions and emission factors required to calculate localized gEnvironmental impact.
dim_weather: Logs rainfall and temperature to compute weather-conditioned incident probabilities.
dim_external_events: Captures scheduled ticketing data to help predictive models anticipate localized, event-driven volume surges.
dim_incident_type: Categorizes anomalies by severity and reporting source (e.g., Waze and NLEX) for cross-validation.
Together, this multidimensional design seamlessly integrates spatial, temporal, and categorical data, providing a highly optimized foundation for advanced Business Intelligence and proactive traffic management.

## 3.11 Business Analytics Model and Testing
### 3.11.1 Descriptive Analytics
The descriptive analytics tier aggregates historical and real-time data to establish comprehensive baseline performance metrics across traffic volume, incident safety, and environmental impact. This multidimensional analysis is presented visually through interactive dashboards and geospatial heatmaps, allowing operators to objectively identify recurring congestion patterns, pinpoint high-risk accident hotspots, and quantify delay-induced carbon emissions at specific segments along the NLEX corridor.
3.11.1.1 Data Overview
The descriptive analytics phase relies on a synthesized dataset derived from internal NLEX operations and external integrations. Primary toll transaction records provide precise entry and exit volumes categorized by vehicle Classes 1, 2, and 3 to establish historical traffic baselines. To map network vulnerability, the system integrates NLEX Road Crash and Stalled Vehicle logs detailing event severity, spatial coordinates, and clearance durations enriched by real-time crowdsourced anomaly reports from the Waze Partner Hub. Finally, to quantify environmental impacts and external disruptions, the dataset incorporates historical weather metrics, scheduled event data, and dynamic emission factors retrieved to accurately compute the corridor's baseline carbon footprint and delay-induced emission penalties.
3.11.1.2 STL (Seasonal-Trend decomposition using LOESS)
An analytical signal-processing procedure that separates historical volume time series into additive components (long-run trend, periodic seasonal pattern, and irregular fluctuations) without parameter learning. The system uses it to analyze baseline volume trends and isolate holiday seasonal effects on NLEX segments.
3.11.1.3 Rolling Mean (Moving Average)
fixed-window arithmetic smoothing operation that computes the average of the most recent observations. The system applies this to suppress short-term noise and expose the true underlying traffic volume trends.
3.11.1.4 Autocorrelation and Partial Autocorrelation Functions (ACF 
and PACF)
Statistical diagnostic tools measuring lag-correlation coefficients. The system uses these to determine the appropriate SARIMA order parameters for the predictive layer by capturing total correlation and isolating the direct contribution of intermediate temporal lags.
3.11.1.5 Gaussian Mixture Model (GMM)
An unsupervised probabilistic machine learning algorithm that mathematically discovers and segments observations into distinct physical traffic regimes by fitting flexible, elliptical distributions to historical speed-flow data. Unlike rigid centroid-based clustering, it allows the system to accurately capture the natural, non-linear curves of traffic behavior along NLEX to define Traffic Performance Index (TPI) classes and congestion severity without relying on arbitrary, hard-coded thresholds.
3.11.1.6 Speed-Flow Fundamental Diagram (Underwood's Model)
A formula-based calibrated equation that relates speed and flow density. The system uses this theoretically derived exponential model to physically characterize congestion baselines without relying on ML estimation.
3.11.1.7 Speed-Flow Fundamental Diagram (Underwood's Model)
A formula-based calibrated equation that relates speed and flow density. The system uses this theoretically derived exponential model to physically characterize congestion baselines without relying on ML estimation.
3.11.1.8 Control-Day Comparison & Anomaly Detection (2-Sigma Rule)
Statistical techniques used to isolate traffic deviations. Control-Day matches event days with non-event baseline days, while the 2-sigma rule deterministically flags observations exceeding the historical mean by two standard deviations. The system uses these to quantify volume anomalies caused by regional events and holidays.
3.11.1.9 Clearance Time Distribution (Log-Normal)
A descriptive statistical summary that fits a log-normal parametric distribution to observed incident clearance times. It estimates the location and scale parameters to summarize the historical variability in clearance times for NLEX incidents.
3.11.1.10 COPERT IV / EMFAC Emission Framework
A standardized lookup table of internationally calibrated vehicle-class emission rates. The system multiplies these coefficients by observed vehicle-kilometers traveled and delay minutes to deterministically calculate baseline CO₂ emissions and the excess carbon burden specifically caused by stop-and-go congestion.
3.11.1.11 Kernel Density Estimation (KDE) & Network-Constrained KDE (NKDE)
Non-parametric procedures that estimate continuous spatial density from point events, with NKDE specifically constraining this density to road geometry. The system uses these to visually and topologically map chronic high-risk incident hotspots along the linear infrastructure of NLEX.
3.11.1.12 Getis-Ord Gi*
A spatial autocorrelation statistical test that computes z-scores based on a spatial weights matrix. The system applies it to identify segments with statistically significant concentrations of high incident rates compared to their neighboring segments.
3.11.1.13 Mejia and Sigua Speed-Reduction Model
A descriptive lookup model utilizing regression coefficients calibrated specifically to Philippine highways. The system uses it to establish a baseline of how much traffic speeds degrade as a direct function of rainfall intensity.
### 3.11.2 Predictive Analysis
The predictive analysis phase transitions the system from a reactive posture to one of proactive operational foresight. By integrating a multi-dimensional ensemble of machine learning and statistical models, this phase interprets historical data in conjunction with exogenous features, such as weather patterns, holiday schedules, and event attendance to forecast future states of the expressway corridor. The objective is not limited to anticipating traffic volume; rather, the predictive framework is engineered to model the entire operational landscape. This includes quantifying the probability of safety incidents, estimating clearance survival curves for road obstructions, predicting vehicle fleet distributions, and projecting localized environmental impacts. By synthesizing these diverse outputs, the system provides NLEX operators with a comprehensive, evidence-based roadmap for anticipatory management across safety, volume, and sustainability domains.

3.11.2.1 Data Overview
To enable accurate forecasting across volume, safety, and environmental domains, this phase utilizes a synthesized time-series dataset derived from both historical traffic volumes and official incident logs. The precise entry and exit volumes of vehicle Classes 1, 2, and 3 are aggregated to analyze dynamic traffic density, while historical incident records detailing event severity, vehicular involvement, and clearance durations, are integrated to establish baseline risk profiles across specific highway segments. To enhance the machine learning algorithms, this core dataset is further enriched with exogenous variables, such as national holiday schedules, weather forecasts, and major regional events, which serve as weighted predictive features. Following a chronological split for model training and testing, the crowdsourced Waze Partner Hub data is isolated as a ground-truth validation set to statistically verify the system's predicted anomalies and incident risks against real-world reports.
3.11.2.2 SARIMAX (Seasonal AutoRegressive Integrated Moving Average with eXogenous regressors)
A time-series model fitting autoregressive, moving average, differencing, and seasonal parameters using maximum likelihood estimation. The system utilizes it to forecast volume trends and capacity utilization by incorporating external weighted regressors like holiday indicators, rainfall intensity, and real-time V/C ratios.

3.11.2.3  Prophet
A Bayesian curve-fitting framework developed by Meta that decomposes time series into additive components. The system deploys it for its native capacity to handle irregular NLEX holiday effects, abrupt trend changepoints, and extreme localized volume surges tied to event attendance (e.g., Philippine Arena concerts).
3.11.2.4 Long Short Term Memory
A specialized Recurrent Neural Network (RNN) architecture equipped with gating mechanisms (input, forget, output) designed to retain long-range temporal dependencies. Configured as a sequence-to-sequence model, it serves as the system's primary algorithm for forecasting multi-step volume trends and 7-day CO₂ emission series by analyzing the chronological flow of historical data.
3.11.2.5 eXtreme Gradient Boosting (XGBoost)
A highly efficient supervised ensemble machine learning algorithm utilizing gradient-boosted decision trees. It serves as the primary classifier and regressor across multiple system tracks: predicting congestion state probabilities, event surge multipliers, continuous delay indices, Class 3 heavy vehicle surges, and weather-related incident probabilities.



3.11.2.6 Holt-Winters Exponential Smoothing
A computationally efficient forecasting method fitting level, trend, and seasonal smoothing parameters. It serves as a benchmark for short-horizon volume smoothing, complementing the deeper LSTM and SARIMAX models.
3.11.2.7 Gated Recurrent Unit (GRU)
A streamlined recurrent neural network with update and reset gates. The system trains GRU models separately on wet-condition and dry-condition speed sequences to accurately capture distinct traffic dynamics under severe rainfall.
3.11.2.8 Bidirectional LSTM (Bi-LSTM) & Spatial LSTM
Bi-LSTM processes sequences in both forward and backward directions (incorporating future context) and uses attention mechanisms for travel time and secondary incident risk prediction. The Spatial LSTM extends this by incorporating road segment graph topology to learn spatially correlated temporal patterns for hotspot risk prediction.
3.11.2.9 Quantile Random Forest (QRF)
An extension of the standard Random Forest algorithm that retains the full empirical distribution of training targets. The system uses it to generate prediction intervals for congestion metrics, producing the Congestion Probability Score as a distributional output rather than a simple point estimate.
3.11.2.10 Geographically Weighted Regression (GWR)
A spatial regression technique applying a geographic kernel weighting function. The system uses it to estimate spatially varying coefficients, successfully capturing the spatial non-stationarity of incident-rate predictors across the physical NLEX network.
3.11.2.11 Negative Binomial Regression
A Generalized Linear Model suited for overdispersed count data. The system uses it to estimate regression parameters from historical incident frequency records to model incident counts.
3.11.2.12 Ordinal Logistic Regression
A classification model that fits ordered log-odds coefficients. The system uses it to model the cumulative probability of a predicted incident's severity falling into specific ordered categories based on labeled training data.
3.11.2.13 Cox Proportional Hazard Model
A foundational survival analysis algorithm that estimates hazard ratio coefficients. By analyzing variables such as crash type and vehicle count, it computes the "clearance survival curve," allowing the system to accurately predict the continuous minutes required to clear an incident from the carriageway.


3.11.2.14 Dirichlet Regression
A Generalized Linear Model designed for compositional outcome variables that must sum to 1. The system uses it to estimate regression coefficients for fleet share proportions, predicting the constrained ratios of Class 1, 2, and 3 vehicles.
3.11.2.15 Multiple Linear Regression (MLR)
An Ordinary Least Squares regression model. It is used to model the linear relationship between traffic activity variables and CO₂ emissions.
3.11.2.16 Monte Carlo Simulation
A stochastic testing and uncertainty propagation procedure that utilizes repeated random sampling to model complex, unpredictable variables. Within the system's prescriptive tier, it is employed to rigorously stress-test proposed sustainability policies and dynamic tolling interventions. By running thousands of simulated iterations across fluctuating traffic volumes, varying fleet mixes, and environmental conditions, the system calculates the exact probability distributions and uncertainty bands (low, base, and high) for corridor carbon emissions. This ensures that any prescribed emission reduction strategy is mathematically validated to succeed across a vast majority of randomized, real-world scenarios before physical deployment on the NLEX corridor.
### 3.11.3 Training and Testing of Models
To ensure predictive accuracy, the system will employ a rigorous holdout validation framework. The historical traffic and incident datasets will be chronologically partitioned into distinct training and testing subsets. The primary portion of the historical data will be utilized to train the machine learning  models to identify underlying congestion patterns, volume trends, and incident correlations. The remaining portion of unseen data will then serve as the testing environment to evaluate the model’s forecasting accuracy against real-world conditions. This validation process ensures the system's mathematical reliability before any prescriptive recommendations are generated.

3.11.3.1 MAPE (Mean Absolute Percentage Error)
An error metric expressing forecast error as an average absolute percentage deviation. The system uses it as the primary predictive accuracy measure for continuous volume and emission forecasts.

Where n is the number of observations,  is the actual observed value, and  is the forecasted value.
3.11.3.2 RMSE (Root Mean Square Error)
An error metric that squares deviations, penalizing large individual forecast errors. It is used to evaluate predictive models where outlier failures carry severe operational consequences in real-time traffic management.

Where n represents the sample size,  represents the ground-truth actuals, and   represents the model's predictions.

3.11.3.3 MASE (Mean Absolute Scaled Error)
A scale-independent error metric normalized by a naive forecast baseline, used by the system to compare forecasting accuracy across different model families (e.g., SARIMA vs. LSTM).

Where the numerator is the Mean Absolute Error (MAE) of the forecast over J test samples, and the denominator is the MAE of a naive random-walk forecast computed over T training samples.
3.11.3.4 MAE (Mean Absolute Error)
A straightforward error metric that measures the average absolute difference between forecasted and actual values without squaring deviations, making it less sensitive to outliers than RMSE. The system will use MAE as a supplementary accuracy measure to provide an interpretable baseline of average forecast error magnitude across traffic volume and emission predictions.

Where n is the number of observations, yi is the actual observed value, and ŷi is the forecasted value.
3.11.3.5 Model Selection and Validation
Following the evaluation on the held-out test partition, the best-performing model for each forecasting task is selected based on the primary metric most operationally relevant to that task. Where ensemble or model combination approaches yield lower test errors than any individual model for example, combining SARIMA and LSTM volume forecasts through a weighted average the combined output is adopted as the system's operative prediction. All model selection decisions are made exclusively on the basis of held-out test performance, and no model adjustments are made after test evaluation to prevent post-hoc overfitting to the test set. This validation process ensures the system's mathematical reliability and generalization integrity before any outputs are consumed by the prescriptive layer for actionable recommendation generation.
### 3.11.4 Prescriptive Analysis
As the final step of the analytical framework, the prescriptive analysis phase translates predictive foresight into actionable, resource-optimized interventions. By evaluating forecasted traffic states and incident probabilities against the expressway’s available operational resources, the system generates optimized dispatch strategies and incident response protocols. Crucially, this phase incorporates a spatial "sandbox" environment, powered by the system's agent-based modeling (ABM) frameworks, allowing operators to safely simulate, stress-test, and validate manual traffic control plans before executing them in the physical world.

3.11.4.1 Data Overview
To transition predictive forecasts into actionable dispatch strategies, this phase synthesizes the generated output variables from the predictive models with specific logistical constraints from the historical incident dataset. Key operational metrics extracted for this analysis include incident severity indicators such as the number of vehicles involved and casualty potential alongside administrative response records, including required tow truck classifications and specific emergency actions taken. By integrating these logistical constraints with forecasted spatial traffic volumes, the system establishes the mathematical boundaries for the agent-based sandbox. This data synthesis allows operators to compute exact hardware and personnel requirements, enabling the virtual simulation of manual interventions (e.g., lane closures or counterflow deployments) prior to real-world deployment on the NLEX corridor.
3.11.4.2 Linear Programming (LP)
A mathematical optimization technique that solves for minimum-cost or maximum-coverage configurations subject to strict linear constraints. The system uses it for three critical operational tasks: optimizing toll lane staffing schedules, distributing pre-event patrol/tow resources across exits, and deploying patrol zones to hotspot segments.

3.11.4.3 Fuzzy Rule-Based
A deterministic inference procedure applying expert-defined fuzzy membership functions to real-time inputs. It automatically computes and recommends variable speed limits to operators based on forecasted V/C ratios and congestion states.
3.11.4.4 Weather-Triggered Rule & Rule-Based Surge Alert
Deterministic, threshold-based early warning mechanisms. They automatically issue speed advisories or road closure recommendations based on PAGASA rainfall thresholds (15/30 mm/h) or trigger operator notifications when predicted volume forecasts exceed 80% of road capacity.
3.11.4.5 TOPSIS (Technique for Order of Preference by Similarity to Ideal Solution)
A Multi-Criteria Decision Analysis (MCDA) geometric procedure. The system uses it to mathematically rank available operational interventions (for events/holidays and CO₂ emission reductions) based on their relative closeness to the ideal logistical outcome, ensuring the dashboard recommends the optimal strategy.
3.11.4.6 Stochastic Linear Programming (SLP)
An advanced mathematical optimization framework that accounts for inherent uncertainty by evaluating probabilistic scenarios rather than fixed deterministic values. Because incident clearance times and secondary accident risks on the expressway fluctuate unpredictably, the system uses SLP to formulate dynamic emergency response protocols. This ensures that recommended patrol zone deployments and lane management strategies remain robust, efficient, and safe even if real-world recovery times deviate from the initial predictions.

### 3.11.5 Existing Artificial Intelligence Features
3.11.5.1 AI Chatbot for Mobile Application
The SmartFlow NLEX Mobile Chatbot is a conversational AI assistant designed exclusively to serve commuters through the SmartFlow NLEX mobile application. Its knowledge is strictly scoped to the SmartFlow NLEX Dashboard, meaning all responses are derived solely from live and predictive data managed within the system, it does not access general internet knowledge, external sources, or unvalidated information.
3.11.5.1.1 Large Language Model (Anthropic Claude Sonnet)
The chatbot is powered by Anthropic's Claude Sonnet, an advanced Large Language Model (LLM) that functions as the system's core conversational reasoning engine. Claude Sonnet was specifically selected for its exceptionally low-latency processing speed and its high reliability in following strict system instructions. Rather than providing general-purpose or creative responses, Claude's role is highly constrained: it strictly translates structured backend traffic data such as volume forecasts, congestion indices, and weather-adjusted delay estimates into clear, natural-language travel advisories tailored for everyday NLEX commuters. Claude Sonnet does not generate traffic predictions independently; it only interprets and communicates outputs already validated by the system's mathematical models.

3.11.5.1.2 Retrieval Augmented Generation (RAG)
To ensure all chatbot responses are factually grounded within the SmartFlow NLEX ecosystem, the system employs a Retrieval-Augmented Generation (RAG) architecture. An orchestration layer, implemented via a framework such as LangChain, manages programmatic function calls that instruct the LLM on how to securely query, retrieve, and format validated data from the system's PostgreSQL database. This architecture eliminates the risk of hallucinated or outdated responses by enforcing that every conversational output is anchored to real-time and forecast data residing within the SmartFlow NLEX Dashboard, and nothing beyond it.
3.11.5.1.3 Upstream Predictive Models (Knowledge Retrieval)
The chatbot functions strictly as a conversational interface to the SmartFlow NLEX decision-intelligence system; it does not independently generate predictions. Instead, it executes targeted queries against the outputs of the system's validated upstream models: weekly traffic volume forecasts from the LSTM model, and weather-impacted delay estimates from the XGBoost model. This design ensures that every alert, advisory, or forecast communicated to the user is traceable to a mathematically validated model output within the SmartFlow NLEX platform.

3.11.5.2 Agent-Based Simulation Sandbox
The Agent-Based Simulation Sandbox functions exclusively as a 2D visualization and testing environment, rather than a prescriptive algorithm. Serving as a virtual testing ground, it provides a risk-free virtual space for operators to manually simulate scenarios such as lane closures. While the Sandbox renders these "What-If" scenarios, the actual mathematical optimization is executed by a coordinated suite of prescriptive models that activate within the simulation. This architecture allows operators to visually validate AI-generated traffic interventions before executing them in the real world.
3.11.5.2.1 Fuzzy Logic Inference
Operating as a prescriptive execution model during operator "What-If" scenarios, this deterministic procedure acts as the virtual traffic controller. It automatically computes and prescribes dynamic variable speed limits based on the specific volume-to-capacity (V/C) ratios generated during the simulation.
3.11.5.2.2 Linear Programming
Triggered by sandbox stress-tests, this mathematical optimization technique solves for the exact minimum-cost configuration. When an operator simulates a "What-If" intervention, such as a manual toll lane closure this model prescribes the most efficient toll lane staffing schedules to mitigate the virtual bottleneck.
3.11.5.2.3 LLM-Driven Scenario Prompting (Anthropic Claude Sonnet)
To accelerate the configuration of complex "What-If" simulations, the Sandbox integrates a natural language prompt feature powered by Anthropic’s Claude Sonnet. Rather than forcing operators to manually adjust multiple sliders, nodes, and capacity metrics during a high-stress crisis, this conversational interface allows them to type intuitive commands, such as "Simulate a two-lane closure at the Candaba Viaduct due to heavy rain." Operating strictly as an intent-parsing engine, Claude Sonnet translates these natural language prompts into the exact numerical constraints and spatial parameters required by the underlying agent-based models. By utilizing Claude Sonnet for scenario generation, the SmartFlow NLEX system will drastically streamline the simulation workflow for TCC operators, enabling rapid, error-free configuration of virtual interventions during active expressway emergencies.

## 3.12 Business Analytics Tools, Techniques, and Specific Applications
### 3.12.1 Descriptive Analytics
Tools: SQL (PostgreSQL), Python (Pandas, NumPy), Apache ECharts, Mapbox
Techniques:
Historical Volume Trend Aggregation - Using Python, the system aggregates toll plaza transaction logs to identify peak periods, seasonal surges, and baseline "normal" traffic conditions and reveal patterns by time of day, day of week, and week of month.
Corridor Segmentation - The 105km NLEX corridor is divided into logical segments. Descriptive statistics are applied to each segment to identify recurring bottlenecks and high-traffic zones.
Spatial Clustering – Incident data from Waze and internal logs are grouped geographically to highlight "Incident Hotspots," enabling a better understanding of where accidents frequently occur.
Carbon Footprint Baseline Calculation – Applies mathematical formulation to real-time volume and speed data to summarize the current environmental impact (CO₂ emissions) of the entire expressway.
Visualization – Mapbox and Apache ECharts are used to present real-time situational awareness via geospatial heatmaps, speed gauges, and historical-comparison graphs.

### 3.12.2 Predictive Analytics
Tools: Python(Scikit-Learn, Keras, XGBoost, etc.), PostgreSQL, Apache ECharts
Techniques:
Time Series Forecasting
LSTM (Long Short-Term Memory) – A deep learning model used to process chronological sequences of traffic volume. It detects long-term temporal dependencies, enabling accurate weekly forecasts in the mobile app’s time-slider.
Machine Learning Forecasting
XGBoost Regression – Utilized to incorporate "Weighted External Variables." It analyzes how non-traffic factors, such as weather intensity (rainfall) and social intent (event attendance estimates), affect predicted volume surges.
Forecast Evaluation
Train-Test Split – Historical NLEX data is partitioned into training and testing sets to validate the model's ability to predict unseen future traffic scenarios.
Mean Absolute Percentage Error (MAPE) – The primary metric used to express forecasting error as a percentage, making it interpretable for NLEX operators to gauge model reliability.
Root Mean Squared Error (RMSE) – Measures the standard deviation of prediction errors, providing insight into the magnitude of volume deviations in vehicle counts.
### 3.12.3 Prescriptive Analytics
Tools: Python (Mesa, Scikit-Fuzzy), PostgreSQL, Three.js
Techniques:
COPERT IV Methodology – A specialized prescriptive technique used to calculate road transport emissions. By entering vehicle category, speed, and mileage into the COPERT IV algorithm, the system calculates the environmental costs of different traffic management strategies.
Fuzzy Logic Inference System – Used for the "Smart Response" engine. It processes "fuzzy" inputs (e.g., Traffic=Heavy, Weather=Stormy) through a set of heuristic rules to prescribe precise operational actions, such as the exact number of additional toll lanes to open.
Agent-Based Modeling (ABM) Sandbox – A simulation technique where vehicle "agents" interact within a 2D NLEX environment. It is used to prescribe the outcome of "What-If" scenarios, such as the impact of a 2-hour lane closure on the total corridor delay.
Constraint-Based Optimization – Identifies the best traffic diversion plans when predicted volumes exceed the physical design capacity of specific NLEX segments, ensuring operational continuity.


## 3.13 Software Quality Assurance Plans
This section shall govern the verification and validation lifecycle of SmartFlow NLEX.
### 3.13.1 Unit Test
This is a micro-scale quality assurance process in which developers examine the smallest components of the source code, such as specific ML functions for carbon calculation or data scraping, to ensure they operate correctly in isolation. By applying detailed knowledge of the internal design and logic, the development team can identify and resolve bugs at the granular level before these separate building blocks are integrated. This foundational step is essential for verifying that each core algorithm is technically sound and fit for use, ensuring the stability of the entire decision-intelligence framework.
3.13.1.1 Unit Test Criteria
The following specific benchmarks each individual function must meet to pass the Quality Assurance audit:
3.13.1.1.1 Unit Test Criteria Table
| Criterion ID | Criterion Name | Description | Pass/Fail Criteria |
| --- | --- | --- | --- |
| UTC-01 | Function Accuracy | Validates the mathematical precision of automated logic (emissions, accuracy math). | Pass: Accuracy ≥ 95% Fail: Accuracy < 95% |
| UTC-02 | Response Speed | Measures the execution latency of individual backend and database functions. | Pass: Execution time ≤ 500ms Fail: Execution time > 500ms |
| UTC-03 | Data Integrity | Ensures the cleaning engine removes noise without losing critical data. | Pass: ≤ 0.1% duplicate records post-ETL Fail: > 0.1% duplicate records post-ETL |
| UTC-04 | Security Validation | Checks if sensitive user data is encrypted using industry-standard hashing. | Pass: ≥ 98% of sampled credential fields confirmed non-plaintext in audit Fail: Any plaintext credential field detected |
| UTC-05 | Geofencing Logic | Validates spatial coordinate filtering for the 105km NLEX corridor. | Pass: Coordinate precision error ≤ 10m Fail: Coordinate precision error > 10m |

3.13.1.2 Unit Test Scenario
These scenarios isolate building blocks to ensure reliability before full system integration.
Table 3.13.1.2.1 Unit Test Scenario Table
| Scenario ID | Scenario Name | Criterion ID | Description | Test Input | Expected Output |
| --- | --- | --- | --- | --- | --- |
| UTS-01 | Missing Value Check | UTC-03 | Verify the cleaning engine flags incomplete toll records. | Toll record with null "Vehicle Class." | Record flagged/ filled |
| UTS-02 | Multi-Source Format | UTC-03 | Test conversion of JSON/XML into standard DB format. | Raw Waze XML + Weather JSON. | Unified SQL-ready object produced |
| UTS-03 | Anomaly Trigger | UTC-01 | Verify if the 2-Sigma rule detects volume spikes. | Traffic count > 3 Std Dev from mean. | Anomaly flag triggered |
| UTS-04 | Emission Math | UTC-01 | Validate CO₂ logic against COPERT IV tables. | 100 Class-1 vehicles. | Output matches lookup table within ±1% variance |
| UTS-05 | Slider Boundary | UTC-01 | Ensure the weekly forecast limit is enforced. | Input: 50 hours in the future. | System snaps to weekly upper bound |
| UTS-06 | Intent Routing | UTC-01 | Test NLP routing of location-based queries. | "How is Balintawak now?" | Route to Volume DB |
| UTS-07 | Unauthorized Access | UTC-04 | Check rejection of requests without valid tokens. | "Submit Report" with null token. | 403 Forbidden response code |


### 3.13.2 Stress Test
3.13.2.1 Stress Test Criteria
The following benchmarks define the non-functional requirements for scalability and performance under extreme operational loads.
Table 3.13.2.1.1 Stress Test Criteria Table
| Criterion ID | Criterion Name | Description | Pass/Fail Criteria |
| --- | --- | --- | --- |
| STC-01 | Latency (p95) | Measures the duration of HTTP requests during high concurrent traffic. | Pass: 95% of requests completed in < 3.0s at 500 VUs Fail: p95 latency ≥ 3.0s |
| STC-02 | Transaction Handling | Evaluates the ingestion and query capacity for massive traffic datasets. | Pass: ≤ 0.5% of transactions result in 5xx errors Fail: 5xx error rate > 0.5% |
| STC-03 | Success Rate | Monitors the ratio of successful requests against total attempts. | Pass: HTTP failure/error rate < 1% Fail: HTTP error rate ≥ 1% |
| STC-04 | System Stability | Assesses the recovery and availability of the system post-load. | Pass: ≥ 99.5% uptime with no manual restart required during test window Fail: Uptime < 99.5% or manual restart needed |
| STC-05 | Resource Ceiling | Tracks the hardware utilization of the cloud/analytical server. | Pass: CPU and Memory utilization ≤ 80% at peak Fail: CPU or Memory utilization > 80% |

3.13.2.2 Stress Test Scenario
This phase evaluates system resilience by using k6 to simulate extreme operational demands, such as peak holiday traffic (493,000 daily transactions) and high concurrent user loads. As established by Vaidyanathan (2024), high-performance data systems require rigorous load testing to identify latent performance bottlenecks and ensure that asynchronous backend architectures, like the one used in SmartFlow NLEX, can maintain sub-second execution speeds under heavy load. By utilizing k6’s scripting capabilities, the research simulates real-world stress conditions to validate that the system’s "Decision-Intelligence" remains reliable even when data throughput reaches maximum capacity.
Table 3.13.2.2.1 Stress Test Scenario Table
| Scenario ID | Scenario Name | Criterion ID | Description | Test Input | Expected Output |
| --- | --- | --- | --- | --- | --- |
| STS-01 | Holy Week Surge | STC-01, STC-02 | Ramp-up test simulating peak NLEX holiday traffic influx. | 0 to 500 Virtual Users (VUs) via k6. | Models process volume without lag |
| STS-02 | Sandbox Simulation | STC-05 | Stressing PostGIS with simultaneous complex spatial queries. | 50 concurrent "What-if" sandbox tests. | Database remains stable |
| STS-03 | Slider Endurance | STC-01, STC-03 | Rapid forecast requests from mobile users via the 7 days slider. | High-frequency GET requests to forecast API. | Cached/live data served |
| STS-04 | API Flooding | STC-02 | Heavy ingestion of mock sensor and incident data. | Large volume POST requests to ingestion endpoints. | Data moves to Silver Layer without queuing delays |
| STS-05 | Bulk Processing | STC-04, STC-05 | Simultaneous execution of all ML models on historical data. | Execution of LSTM, SARIMAX, and XGBoost on 1-year data. | Server completes task without crashing |


### 3.13.3 User-Acceptance Test
This test is the final step in testing the Dashboard and Mobile Application against the end user or customer's specifications. Furthermore, this test is conducted to determine whether the system meets its acceptance criteria and to enable the customer to decide whether to accept the system. This is done through end users' hands-on use of the product. The study utilizes a purposive sampling method to select a total of 30 participants, consisting of 10 NLEX Incident and TCC Operators, 5 NLEX Data Analysts, and 15 NLEX Commuters and Drivers. While the NLEX corridor serves thousands of daily motorists, the selection of 15 respondents for the commuter profile is scientifically supported by usability engineering literature (Nielsen, 2012), which establishes that a sample size of 15 users per specific profile is sufficient to identify over 90% of core system usability issues. This targeted approach ensures that the system is evaluated by high-value stakeholders who are most impacted by the expressway's operational efficiency and predictive accuracy.
3.13.3.1 User-Acceptance Test Scenario for NLEX Incident Operators
Table 3.13.3.1 User-Acceptance Test Scenario Table for NLEX Incident Operators
| Scenario ID | Scenario Name | Description | Test Input | Expected Output |
| --- | --- | --- | --- | --- |
| UAT-IO-1 | Incident Pinpointing | Validates the accuracy of the map for locating reported road crashes. | Coordinate data from a simulated "Vehicle Fire" report. | Map zooms to the exact segment |
| UAT-IO-2 | Patrol Dispatch Suggestion | Tests the system’s ability to recommend the nearest patrol unit based on GPS. | Active incident at Candaba Viaduct. | System identifies the 3 closest units with estimated arrival times |
| UAT-IO-3 | Incident Status Update | Tests the workflow of closing an incident and clearing it from the live map. | Manual input: "Incident Cleared" for a stalled vehicle. | Map icon disappears |

3.13.3.2 User-Acceptance Test Scenario for NLEX Data Analysts
Table 3.13.3.2 User-Acceptance Test Scenario Table for NLEX Data Analysts
| Scenario ID | Scenario Name | Description | Test Input | Expected Output |
| --- | --- | --- | --- | --- |
| UAT-DA-1 | Emission Trend Analysis | Verifies the accuracy of aggregated CO₂ | 1 month of historical volume data. | ECharts renders a clear, interactive time-series trend line |
| UAT-DA-2 | Multisource Sync | Checks if Waze data and Toll transaction data are aligned correctly. | Comparative query: Waze incidents vs. Toll volume surges. | Correlation displayed with ≥ 98% schema field alignment |
| UAT-DA-3 | Anomaly Verification | Validates that the system correctly identifies non-recurrent congestion. | Query of the "2-Sigma" anomaly log for the past week. | List shows correct event-driven spikes (e.g., concert day) |
3.13.3.3 User-Acceptance Test Scenario for Traffic Control Center (TCC)  Operators
Table 3.13.3.2 User-Acceptance Test Scenario Table for TCC
| Scenario ID | Scenario Name | Description | Test Input | Expected Output |
| --- | --- | --- | --- | --- |
| UAT-TC-1 | Weekly Forecast Use | Tests the TCC's ability to plan for future surges using the slider. | Moving the 7 day Slider to the next day’s peak hour. | System renders predicted bottlenecks within ≤ 5 seconds |
| UAT-TC-2 | SOP Recommendation | Validates "Smart Response" logic for lane management. | Simulated "Heavy Rain" alert during peak hour. | System suggests a lane plan confirmed as SOP-aligned by ≥ 90% of TCC operator participants |
| UAT-TC-3 | Corridor-Wide Overview | Checks if the operator can see the status of all 105km at once. | Zooming out to the "Whole Corridor" view. | All segment status colors (Green/Yellow/Red) are visible at once. |
| UAT-TC-4 | "What-If" Sandbox Test | Tests the 2D Sandbox for simulating a lane closure. | Input: "Close 2 lanes at Bocaue Exit" in Sandbox mode. | The system predicts the resulting tailback length and delay time. |

## 3.14 Deployment Plans
The deployment plan outlines the transition of SmartFlow NLEX from a local development environment to a production-ready cloud infrastructure. This plan ensures that the multisource data integration, machine learning forecasting, and 2D spatial simulations remain consistent, scalable, and accessible to both NLEX operators and commuters.
### 3.14.1 Infrastructure Setup
Cloud Hosting – Deploying the web dashboard and API services to a scalable cloud provider (e.g., AWS, Azure, or Google Cloud) as specified in your technical architecture.
Database Migration – Moving the PostgreSQL/PostGIS schema from the local/test environment to the production instance (e.g., Supabase), ensuring all spatial indices for NLEX coordinates are optimized.
SSL/Security – Implementing HTTPS and Bcrypt encryption for all user authentication endpoints before the public release
### 3.14.2 Deployment Stages
Stage 1: Production Data Ingestion
Action – Activate the live scrapers and API listeners for NLEX toll data, Waze Partner Hub, and OpenWeather.
QA Check – Verify that the "Silver Layer" of the data warehouse begins populating with real-time, clean data.
Stage 2: Model Deployment (MLOps)
Action – Push the trained weights of the predictive models to the production server.
QA Check – Run a "Smoke Test" to ensure the LSTM model generates a forecast based on the first hour of live production data.
Stage 3: Dashboard & App Release
Action – Deploy the React-based Dashboard for operators and the Flutter/React Native Mobile App for commuters.
QA Check – Perform a final check to ensure the 48-hour Predictive Slider reflects the live model outputs correctly.
### 3.14.3 Rollback & Maintenance Plan
a.) Rollback Strategy
If a critical "Showstopper" bug is found within the first 4 hours of deployment, the system will revert to the previous stable build using version control (Git).
b.) Post-Deployment Monitoring
Monitor the k6 performance logs during the first "Real-World" traffic peak to ensure the system doesn't exceed the 3-second response threshold.

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





