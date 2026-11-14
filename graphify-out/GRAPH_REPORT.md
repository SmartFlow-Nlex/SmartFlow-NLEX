# Graph Report - Front-and-back-Ver1-Merged-BE-FE  (2026-11-04)

## Corpus Check
- Large corpus: 252 files · ~560,850 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 4477 nodes · 10679 edges · 158 communities (143 shown, 15 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 237 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Incident Predictive Charts
- Analytics Tab Pages
- Sandbox Verify & Recommendation
- Prescriptive Incident & Emissions Panels
- Live Corridor Status & Hero
- Scenario Event Adapter
- Incident Count Model Training
- Sandbox Facilities & Places
- Scenario Sandbox Page
- Traffic Simulation Engine
- Congestion Forecast Chart
- Traffic API (controller/service)
- Scenario Panel & Placement
- Scenario Sampler & Calibration
- Volume & Emission Forecast Charts
- Scenario Catalogue
- Sandbox Command Parser
- AI Insight Narratives (GLM)
- Facility Engine (toll/ramps)
- 3D Mascot Model Factory
- Back-End Dependencies
- Event Twin & Direction Sim
- AI Model Narrative Cards
- Prescriptive Traffic Panels (TOPSIS)
- Maintenance Scheduler Page
- Sign-in & Settings Pages
- Live Map Graphics & Km Scale
- Auth Middleware & Health
- DB Init & Seed Scripts
- Incident API (controller/validator)
- Calibration & Login Art Builders
- Waze Live & Map Comparison
- Incident Analytics Service
- Incident Spatial LSTM Training
- Toll ETL & Vehicle-Km
- Facility Artwork
- Clearance Protocol Service
- Toll Plaza & Lane Geometry Tools
- Scene Art (vehicles & crews)
- Incident Heatmaps & Breakdown Panel
- Emissions Prescriptive Service
- Traffic Prescriptive Service
- Dashboard Shell & Nav Access
- App Root Layout, Theme & Toasts
- Km Posts & Exit Segments
- Maintenance API
- Vehicle & Motorcycle Painting
- Breakdown Response Model Training
- Severity Model & Horizon Accuracy
- Integration Test Harness
- AI Insight API
- Route Cache & TTL Cache
- Map Comparison API
- Navie Greeting & Stage Bus
- Weather-Speed Model Training
- ETL Orchestration & Compare
- Unit Tests (traffic/incident rules)
- Sandbox Assumptions Register
- Sandbox Command Eval Scripts
- Mobile Config API
- Data Management Page
- Canonical Exits & Trip Km
- Source-Extract Test Support
- Exit Lookup & Corridor Strip
- 3D Login Scene
- Sandbox Demand & Hotspots API
- Simulation Replay
- Front-End Dev Tooling
- Upload & Audit Insights
- Upload Publish & Undo
- Sandbox Trend Charts
- Simulation Vehicle Classes
- Front-End Dependencies
- Audit Log Page
- Login Stage & Cloud Effects
- Corridor Centreline Shape
- AI Explain Service
- Canvas Recorder (verify)
- Sandbox Barrier & Lane Drawing
- Predictive Pipeline Runner
- AI Sandbox API
- Audit Log API
- ETL Extractors & Parser
- Carriageway & Hazard Drawing
- Forecast-Driven Incidents
- Corridor Status API
- Device Trust & Account
- Mascot 3D Stage
- DB Pool & 48h Forecast
- Mailer (email)
- Emissions API
- Forecast Source & Jam Profile
- Front-End TS Config
- Dataset Classifier
- Zipper Lane Contraflow
- Forecast Horizon Picker
- PH Holidays Seed
- Incident Predictive Service
- Mobile Config Page
- Mascot Body Loft
- Electron Desktop Shell
- ETL Cleaner
- ETL Transformer
- Hourly Incident Page
- API Client & Session Lost
- Motorcycle & P99 Tools
- Electron Build Config
- Date Filter
- Bike Recorder (verify)
- Scenario Forecast Panel
- Two-Step Sign-in (MFA)
- Maintenance Form Tests
- Back-End TS Config
- Scene Preview Marks
- Driver & Arrival Sampling
- Forecast Day Picker
- Login Toll Plaza
- Mascot & Reset Email Docs
- Severity/Spatial/Response Results
- Back-End NPM Scripts
- Sandbox README: Dual Carriageway
- Back-End README & Routes
- Sandbox README: Calibration
- Emergency Vehicle Art
- Login Traffic
- Upload Middleware (multer)
- Both-Direction Metrics
- ESLint & Next Config
- Front-End NPM Scripts
- Weather-Speed Results
- Incident KPI SQL Tests
- Mascot Face
- Sandbox Km Bounds Tests
- Accident/Breakdown Ingest Script
- Installer (NSIS) Config
- Incident Count Results
- date-holidays Types
- Next Forecast Route
- Imminent Scene Drawing
- Fonts & Front-End README
- Active Closures Hook
- OSM Toll Plazas Data
- Next Realtime Route
- Sandbox README: Event Twin
- Debris & Skid Drawing
- Operations Integration Test
- Sandbox README: Interventions
- Legacy ESLint Config
- API Result Types
- Dashboard Stub
- Electron Window Types
- CSS Module Types
- tw-animate-css
- Sandbox README: Replay

## God Nodes (most connected - your core abstractions)
1. `AiSandboxPage()` - 92 edges
2. `TrafficSim` - 89 edges
3. `react` - 89 edges
4. `InfoTooltip()` - 55 edges
5. `fmtKm()` - 51 edges
6. `lucide-react` - 50 edges
7. `FacilityEngine` - 49 edges
8. `drawCarriageway()` - 43 edges
9. `MaintenancePage()` - 42 edges
10. `TrafficPage()` - 41 edges

## Surprising Connections (you probably didn't know these)
- `Cox PH Clearance-Time Survival (C=0.625)` --semantically_similar_to--> `calibration.json (duration quantiles)`  [INFERRED] [semantically similar]
  Back-End/incident_model_scripts/model_results_severity.txt → Front-End-Dashboard/app/dashboard/scenario-sandbox/scenarios/README.md
- `XGBoost Daily Speed Forecast (selected, MAE 3.779)` --semantically_similar_to--> `Rain Intensity Speed Cap (100/100/96 km/h)`  [INFERRED] [semantically similar]
  Back-End/incident_model_scripts/model_results_weather_speed.txt → Front-End-Dashboard/app/dashboard/scenario-sandbox/scenarios/README.md
- `Navie, the SmartFlow NLEX Mascot` --semantically_similar_to--> `public/brand/nlex-mascot.png (Mascot.tsx PNG)`  [INFERRED] [semantically similar]
  Back-End/email-templates/supabase-reset-password.paste.html → Front-End-Dashboard/components/stage/mascot/README.md
- `Forecast Incidents on the Stretch (forecastIncidents.ts)` --conceptually_related_to--> `Incident Count Forecasting Results`  [INFERRED]
  Front-End-Dashboard/app/dashboard/scenario-sandbox/scenarios/README.md → Back-End/incident_model_scripts/model_results.txt
- `page` --calls--> `declaration()`  [EXTRACTED]
  Front-End-Dashboard/tests/unit/maintenance-form.test.ts → Back-End/tests/support/source-extract.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Scenario sandbox pipeline: catalogue -> sampler -> adapter -> engine** — front_end_dashboard_app_dashboard_scenario_sandbox_scenarios_readme_catalogue_ts, front_end_dashboard_app_dashboard_scenario_sandbox_scenarios_readme_sampler_ts, front_end_dashboard_app_dashboard_scenario_sandbox_scenarios_readme_calibration_json, front_end_dashboard_app_dashboard_scenario_sandbox_scenarios_readme_adapter_ts_composeinterventions, front_end_dashboard_app_dashboard_scenario_sandbox_scenarios_readme_simulation_ts_interventions [EXTRACTED 1.00]
- **Incident model evaluation reports** — back_end_incident_model_scripts_model_results, back_end_incident_model_scripts_model_results_accident, back_end_incident_model_scripts_model_results_breakdown_response, back_end_incident_model_scripts_model_results_severity, back_end_incident_model_scripts_model_results_spatial, back_end_incident_model_scripts_model_results_weather_speed [INFERRED 0.85]
- **NLEX mascot 3D rendering stack** — front_end_dashboard_components_stage_mascot_readme_createnlexmascotmodel, front_end_dashboard_components_stage_mascot_readme_face_ts, front_end_dashboard_components_stage_mascot_readme_mascot3d_ts, front_end_dashboard_components_stage_mascot_readme_nlexmascothandles [EXTRACTED 1.00]

## Communities (158 total, 15 thin omitted)

### Community 0 - "Incident Predictive Charts"
Cohesion: 0.04
Nodes (106): blockLabel(), BreakdownResponseData, BreakdownResponseModel(), DAY_NAMES, DAY_ORDER, fmtHour(), GroupStat, manilaNow() (+98 more)

### Community 1 - "Analytics Tab Pages"
Cohesion: 0.04
Nodes (106): Analytics, CAUSE_MODES, CauseMode, Detail, DOW_LABELS, DOW_ORDER, fmt1(), fmtHour() (+98 more)

### Community 2 - "Sandbox Verify & Recommendation"
Cohesion: 0.03
Nodes (80): CLOSURE_LANE_CAPACITY_VEH_H, fmt(), getRecommendation(), InflowFrom, plural(), Recommendation, Supply, accidentVariants (+72 more)

### Community 3 - "Prescriptive Incident & Emissions Panels"
Cohesion: 0.04
Nodes (78): abortableWait(), Chance, ClearanceInsufficientData, ClearanceOk, ClearanceResponsePanel(), ClearanceResult, ClearanceType, fetchClearance() (+70 more)

### Community 4 - "Live Corridor Status & Hero"
Cohesion: 0.05
Nodes (69): Feed, HeroLiveStatus(), RealtimeFC, Status, useCountUp(), Band, buildLookup(), CAR_LANES (+61 more)

### Community 5 - "Scenario Event Adapter"
Cohesion: 0.05
Nodes (78): ActiveEvent, addEvent(), addEventToBucket(), AddResult, blockedLanes(), boundaryTimes(), BREAKDOWN_LEAD_S, breakdownVehicle() (+70 more)

### Community 6 - "Incident Count Model Training"
Cohesion: 0.05
Nodes (43): main(), build_all_final_predictions(), build_features(), build_final_predictions(), calendar_features(), cv_negbinomial_glm(), cv_poisson_glm(), cv_random_forest() (+35 more)

### Community 7 - "Sandbox Facilities & Places"
Cohesion: 0.05
Nodes (67): Junction, Place, Row, Span, Toll, TOLL_LABEL, arcIn(), arcOut() (+59 more)

### Community 8 - "Scenario Sandbox Page"
Cohesion: 0.05
Nodes (72): DirectionPill(), AiSandboxPage(), Baseline, BaselineSteps(), ClosureHint(), CommandAction, CommandLookup, CommandPlan (+64 more)

### Community 9 - "Traffic Simulation Engine"
Cohesion: 0.07
Nodes (7): measure(), hash01(), laneAllowsClass(), mulberry32(), occupiesLane(), TrafficSim, visualLane()

### Community 10 - "Congestion Forecast Chart"
Cohesion: 0.05
Nodes (60): CongestionNarrative(), CongestionNarrativeHorizon, CongestionNarrativeModel, Alert, baseLabel(), CellItem, CongestionEval, DayCell (+52 more)

### Community 11 - "Traffic API (controller/service)"
Cohesion: 0.06
Nodes (59): getForecast(), getForecastHourly(), getIncidents(), getRealtimeTraffic(), getTrafficAnalytics(), getTrafficPrescriptiveHandler(), getVolumeAdt(), getWeatherEvidence() (+51 more)

### Community 12 - "Scenario Panel & Placement"
Cohesion: 0.06
Nodes (59): Candidate, candidatesFrom(), HOTSPOT_FAMILIES, Hotspots, norm(), PickResult, PlaceMode, ResolvedPlace (+51 more)

### Community 13 - "Scenario Sampler & Calibration"
Cohesion: 0.07
Nodes (60): BREAKDOWN_CAUSES, BREAKDOWN_FAMILIES, BREAKDOWN_VEHICLES, CalibratedVariant, calibratedVariantOf(), CALIBRATION_KEYS, CalibrationKey, EntryKey (+52 more)

### Community 14 - "Volume & Emission Forecast Charts"
Cohesion: 0.05
Nodes (56): AggInput, AggOutput, aggregateSeries(), bucketLength(), bucketOf(), Granularity, maxOf(), meanOf() (+48 more)

### Community 15 - "Scenario Catalogue"
Cohesion: 0.04
Nodes (53): FamilyIcon(), assertNever(), BREAKDOWN_IN_LANE, BREAKDOWN_SHOULDER, BreakdownCommon, BreakdownInLaneTemplate, BreakdownShoulderTemplate, calibrationKeyFor() (+45 more)

### Community 16 - "Sandbox Command Parser"
Cohesion: 0.06
Nodes (56): plan(), kmMeasured(), answerInMeasuredKm(), asDir(), CAUSES, checkActions(), clamp(), Clock (+48 more)

### Community 17 - "AI Insight Narratives (GLM)"
Cohesion: 0.09
Nodes (52): congestionNarrative(), chat(), send(), extractJson(), GlmError, BreakdownResponseInsightRequest, buildBreakdownResponseMessage(), buildClearanceMessage() (+44 more)

### Community 18 - "Facility Engine (toll/ramps)"
Cohesion: 0.10
Nodes (4): FacilityEngine, FacilityHost, poseAt(), Vehicle

### Community 19 - "3D Mascot Model Factory"
Cohesion: 0.06
Nodes (51): BODY_KEYS, BodyKey, buildCapBackTexture(), buildCapFrontPanelGeometry(), buildCapNTexture(), buildCrownGeometry(), buildFacePanelGeometry(), buildGlassTexture() (+43 more)

### Community 20 - "Back-End Dependencies"
Cohesion: 0.05
Nodes (51): dependencies, compression@^1.8.1, cors@^2.8.5, csv-parse@^7.0.1, dotenv@^16.4.7, express@^4.21.2, express-rate-limit@^8.5.2, morgan@^1.10.0 (+43 more)

### Community 21 - "Event Twin & Direction Sim"
Cohesion: 0.06
Nodes (38): Live, NoEventTwin, FacilityPlan, CLASSES, ClassShares, HourOfDemand, shapeForecastMix(), applyAtBoundary() (+30 more)

### Community 22 - "AI Model Narrative Cards"
Cohesion: 0.06
Nodes (39): AiModelInsight(), Insight, InsightMetric, Props, EventSurgeNarrative(), EventSurgeValidationRow, EvidenceModal(), CLASS_META (+31 more)

### Community 23 - "Prescriptive Traffic Panels (TOPSIS)"
Cohesion: 0.09
Nodes (46): SourceBadge(), championValue(), CongestionAdvice, CongestionCalibration, CongestionRow, EventRow, ExitImpact, exitsFromEvents() (+38 more)

### Community 24 - "Maintenance Scheduler Page"
Cohesion: 0.08
Nodes (46): analyse(), canBecomeKmPost(), closedLanes(), closureRank(), closureSeverity(), closureText(), CONFLICT_LABEL, ConflictKind (+38 more)

### Community 25 - "Sign-in & Settings Pages"
Cohesion: 0.11
Nodes (44): fmtDay(), passwordProblem(), SettingsPage(), forgetEmail(), forgetThisDevice(), saveIdle(), saveName(), savePassword() (+36 more)

### Community 26 - "Live Map Graphics & Km Scale"
Cohesion: 0.07
Nodes (43): corridorKm(), KmExit, KmScale, addNightCorridorImages(), Box, buildSnapshot(), carriagewayShift(), createJamCallouts() (+35 more)

### Community 27 - "Auth Middleware & Health"
Cohesion: 0.11
Nodes (31): dataManagementController(), healthController(), parseSandboxCommand(), scenarioContext(), trustRevokedAt(), accepted, authenticateToken(), authorizeRoles() (+23 more)

### Community 28 - "DB Init & Seed Scripts"
Cohesion: 0.07
Nodes (30): confirmed, db, LEGACY_TABLES, RECREATE_DDL, APP_TABLES, db, verifyOnly, WAREHOUSE_READS (+22 more)

### Community 29 - "Incident API (controller/validator)"
Cohesion: 0.06
Nodes (40): BreakdownResponseQuerySchema, EventBreakdownQuerySchema, getClearanceProtocol(), getEventBreakdown(), getIncidentBreakdownResponse(), getIncidentHourly(), getIncidentList(), getIncidentMetrics() (+32 more)

### Community 30 - "Calibration & Login Art Builders"
Cohesion: 0.09
Nodes (25): accident_entry(), block(), breakdown_entry(), build(), cause_of(), chainage_offset(), classify(), etl_accept() (+17 more)

### Community 31 - "Waze Live & Map Comparison"
Cohesion: 0.11
Nodes (37): CORRIDOR, ExitHit, MapComparisonPage(), fetchStats(), LegendKey(), setForecastBase(), FORECAST_KEY, MapLegend() (+29 more)

### Community 32 - "Incident Analytics Service"
Cohesion: 0.06
Nodes (41): getIncidentAnalytics(), kmPostSql(), AlignedValidationRow, buildCorridorForecast(), buildIncidentPredictiveResponse(), buildKmSegmentForecast(), CacheEntry, ComputedModelMetrics (+33 more)

### Community 33 - "Incident Spatial LSTM Training"
Cohesion: 0.09
Nodes (20): build_panel(), _build_sequences(), calendar_features(), ensure_schema(), fit_gwr(), fit_spatial_lstm(), get_conn(), load_daily_rain() (+12 more)

### Community 34 - "Toll ETL & Vehicle-Km"
Cohesion: 0.09
Nodes (34): compare(), FACTORS, hourlyRows(), km(), [mode, ...files], aggregateTollHourly(), Cutoff, DAY_KEY (+26 more)

### Community 35 - "Facility Artwork"
Cohesion: 0.10
Nodes (39): APRON_ROLES, apronOutline(), BARRIER_ROLES, baseLengthPx(), BRAND, brandName(), brandOf(), clipToFacilitySide() (+31 more)

### Community 36 - "Clearance Protocol Service"
Cohesion: 0.09
Nodes (36): buildScenarios(), CacheEntry, Chance, Checkpoint, checkpointAt(), clearanceCache, ClearanceProtocolFilters, ClearanceProtocolInsufficientData (+28 more)

### Community 37 - "Toll Plaza & Lane Geometry Tools"
Cohesion: 0.11
Nodes (19): load(), main(), measure(), project(), xy(), attach(), classify(), carriageway() (+11 more)

### Community 38 - "Scene Art (vehicles & crews)"
Cohesion: 0.10
Nodes (37): CarStyle, Cast, CIVILIAN_SHIRTS, clamp01(), CRASH_FAMILIES, drawArrowBoard(), drawBarrel(), drawBorrowedLanes() (+29 more)

### Community 39 - "Incident Heatmaps & Breakdown Panel"
Cohesion: 0.10
Nodes (35): DeploymentTimeStat, EventBreakdownData, EventBreakdownPanel(), fmtInt(), fullServiceName(), Metric, METRICS, Props (+27 more)

### Community 40 - "Emissions Prescriptive Service"
Cohesion: 0.09
Nodes (35): P(), P2(), getEmissionsPrescriptive(), exitDisplayName(), fmtKm(), kmPost(), nearestExitName(), cache (+27 more)

### Community 41 - "Traffic Prescriptive Service"
Cohesion: 0.08
Nodes (37): exitKmValuesSql(), kmKeySql(), ACTION, byCertainty(), CalBin, calibrate(), CalibrationEvidence, CongestionAdvice (+29 more)

### Community 42 - "Dashboard Shell & Nav Access"
Cohesion: 0.10
Nodes (26): DashboardLayout(), NightCorridorStage, IdleGuard(), LoadingGate(), PageGroupName(), Mascot(), Section, SectionProgress() (+18 more)

### Community 43 - "App Root Layout, Theme & Toasts"
Cohesion: 0.07
Nodes (21): metadata, RootLayout(), OPTIONS, ThemeToggle(), applyChoice(), systemPrefersDark(), THEME_INIT_SCRIPT, THEME_STORAGE_KEY (+13 more)

### Community 44 - "Km Posts & Exit Segments"
Cohesion: 0.08
Nodes (32): getIncidentSeverity(), getIncidentSpatial(), buildExitToExitSegments(), ExitRef, ExitToExitSegment, segmentIndexForKm(), ANCHORS, BY_KEY (+24 more)

### Community 45 - "Maintenance API"
Cohesion: 0.10
Nodes (31): audit(), conflictResponse(), createSchedule(), deleteSchedule(), kmText(), listSchedules(), pastStartResponse(), updateSchedule() (+23 more)

### Community 46 - "Vehicle & Motorcycle Painting"
Cohesion: 0.08
Nodes (34): BikeCtx, dot(), drawMotorcycle(), paleBody(), rr(), BUS_PAINTS, CAB_PAINTS, CAR_PAINTS (+26 more)

### Community 47 - "Breakdown Response Model Training"
Cohesion: 0.10
Nodes (20): build_curves(), group_curve(), build_design_matrix(), build_features(), empirical_curve(), ensure_schema(), event_grouped_holdout_split(), fit_cox_ph() (+12 more)

### Community 48 - "Severity Model & Horizon Accuracy"
Cohesion: 0.12
Nodes (17): origin_inputs(), build_design_matrix(), build_features(), ensure_schema(), fit_cox_ph(), empirical_curve(), group_curve(), fit_secondary_risk() (+9 more)

### Community 49 - "Integration Test Harness"
Cohesion: 0.13
Nodes (25): app, { corridorStatusFromFeed, tallyExitStatuses }, { FALLBACK_EXITS }, requireFe, T, call(), get(), Reply (+17 more)

### Community 50 - "AI Insight API"
Cohesion: 0.11
Nodes (29): breakdownResponseNarrative, clearanceNarrative, corridorRiskNarrative, eventSurgeNarrative(), fleetMixNarrative(), highIncidentDayNarrative, incidentModelsNarrative, insightStatus() (+21 more)

### Community 51 - "Route Cache & TTL Cache"
Cohesion: 0.09
Nodes (28): verifyDbConnection(), Entry, FORECAST_PREFIXES, generation, generationOf(), inflight, invalidatePrefix(), isEmptyPayload() (+20 more)

### Community 52 - "Map Comparison API"
Cohesion: 0.12
Nodes (27): fallbackForecast, fallbackRealtime, ForecastHorizonSchema, getMapForecastPeaks(), getMapLiveOverview(), getMapRealtime(), isNlexCorridor(), parseWktLineString() (+19 more)

### Community 53 - "Navie Greeting & Stage Bus"
Cohesion: 0.12
Nodes (28): clickLines(), introLines(), JUST_SIGNED_IN, Live, liveLine(), NavieGreeting(), sayOnClick(), pick() (+20 more)

### Community 54 - "Weather-Speed Model Training"
Cohesion: 0.12
Nodes (19): add_lag_features(), calendar_features(), ensure_schema(), fit_contour(), fit_daily_models(), fit_logistic_kpi(), _fit_rnn(), get_conn() (+11 more)

### Community 55 - "ETL Orchestration & Compare"
Cohesion: 0.15
Nodes (29): ClassifyResult, DatasetType, compareRecords(), compareToll(), DIFF_THRESHOLD, q(), UploadComparison, SourceType (+21 more)

### Community 56 - "Unit Tests (traffic/incident rules)"
Cohesion: 0.09
Nodes (22): evaluate(), readSource(), block, { flagged }, src, block, { rain }, src (+14 more)

### Community 57 - "Sandbox Assumptions Register"
Cohesion: 0.06
Nodes (28): appKmToChainageKm(), Assumption, AssumptionId, ASSUMPTIONS, BreakdownFamilyKey, ByClosureFamily, ByFamily, CHAINAGE_DERIVATION (+20 more)

### Community 58 - "Sandbox Command Eval Scripts"
Cohesion: 0.08
Nodes (17): ctx, failures, EXITS, sandboxTestContext(), A, Case, CASES, clearNB() (+9 more)

### Community 59 - "Mobile Config API"
Cohesion: 0.09
Nodes (28): audit(), readMobileConfig(), writeMobileConfig(), getMobileConfigFromDb(), MobileConfigRead, saveMobileConfigInDb(), AdvisoriesSchema, ADVISORY_TONES (+20 more)

### Community 60 - "Data Management Page"
Cohesion: 0.10
Nodes (29): BackendDown, clock(), Comparison, ComparisonPanel(), DataManagementPage(), confirmUndo(), confirmUpload(), postUndo() (+21 more)

### Community 61 - "Canonical Exits & Trip Km"
Cohesion: 0.11
Nodes (24): swap(), CONNECTING, Direction, extractDirection(), extractRole(), NLEX_ALIASES, normalize(), PlazaRole (+16 more)

### Community 62 - "Source-Extract Test Support"
Cohesion: 0.10
Nodes (25): argument(), between(), bodyOpenAfterParams(), declaration(), groupAfter(), indexOfOrThrow(), matchClose(), OPEN (+17 more)

### Community 63 - "Exit Lookup & Corridor Strip"
Cohesion: 0.11
Nodes (26): PlacesList(), describeAction(), CorridorStrip(), Dir, StripHover, calloutText(), CorridorSnapshot, fmtDelayShort() (+18 more)

### Community 64 - "3D Login Scene"
Cohesion: 0.12
Nodes (23): clamp01(), createLoginScene(), animates(), applyPose(), frame(), loop(), maybeReady(), resize() (+15 more)

### Community 65 - "Sandbox Demand & Hotspots API"
Cohesion: 0.12
Nodes (26): demandExits(), demandProfile(), HOTSPOT_FAMILIES, hotspots(), plazaFlows(), buildPlazaFlows(), DemandHour, DemandProfile (+18 more)

### Community 66 - "Simulation Replay"
Cohesion: 0.09
Nodes (14): Facility, FacAgentView, FacilityView, facilityView(), REPLAY_HZ, ReplayBuffer, ReplayFrame, ReplayVehicle (+6 more)

### Community 67 - "Front-End Dev Tooling"
Cohesion: 0.10
Nodes (28): description, devDependencies, concurrently@^9.1.2, electron-builder@^25.1.8, eslint@^9.24.0, eslint-config-next@^15.2.4, @types/node@^22.15.18, @types/pg@^8.20.0 (+20 more)

### Community 68 - "Upload & Audit Insights"
Cohesion: 0.13
Nodes (22): [file, mode], t, db, getAuditSummary(), getRetraining(), getUploadFormats(), getUploadHistory(), handleFileUpload() (+14 more)

### Community 69 - "Upload Publish & Undo"
Cohesion: 0.13
Nodes (19): undoUploadHandler(), accidents(), airQuality(), breakdowns(), EVENT_KEY, incidents(), PUBLISHERS, theoreticalEmissions() (+11 more)

### Community 70 - "Sandbox Trend Charts"
Cohesion: 0.12
Nodes (24): DIRECTION_NAME, clockOf(), fmtNum(), MetricDef, MetricKey, METRICS, niceScale(), PAD (+16 more)

### Community 71 - "Simulation Vehicle Classes"
Cohesion: 0.08
Nodes (25): FacilityStats, FacState, Arrival, CLASS, CLASS_META, CrashKind, CrashScene, DriverProfile (+17 more)

### Community 72 - "Front-End Dependencies"
Cohesion: 0.07
Nodes (27): dependencies, echarts@^6.0.0, echarts-for-react@^3.0.6, @heroicons/react@^2.2.0, lucide-react@^1.14.0, maplibre-gl@^5.24.0, next@^15.2.4, pg@^8.20.0 (+19 more)

### Community 73 - "Audit Log Page"
Cohesion: 0.14
Nodes (24): ago(), AuditLogPage(), Bars(), cap(), dayLabel(), everyDay(), HourlyModel, Insights (+16 more)

### Community 74 - "Login Stage & Cloud Effects"
Cohesion: 0.13
Nodes (21): EffectsToggle(), Cloud, CloudLayer(), FAR, MID, NEAR, NlexEnvironment(), Scene (+13 more)

### Community 75 - "Corridor Centreline Shape"
Cohesion: 0.14
Nodes (25): directionOfReport(), buildCentreline(), buildCentrelineUncached(), centrelines, CORRIDOR_TOLERANCE_M, corridorGuard(), despike(), directionFromStreet() (+17 more)

### Community 76 - "AI Explain Service"
Cohesion: 0.17
Nodes (22): explainFeature(), fmtKmRange(), nearExitsText(), buildCorridor(), buildEmissions(), buildMaintenance(), buildOverview(), buildTraffic() (+14 more)

### Community 78 - "Sandbox Barrier & Lane Drawing"
Cohesion: 0.14
Nodes (23): facilityDepth(), gutterLanePx(), hasBarrier(), builtLanes(), daylightAsphalt(), drawBarrierRun(), drawLentRoad(), drawMedian() (+15 more)

### Community 79 - "Predictive Pipeline Runner"
Cohesion: 0.14
Nodes (8): build_features(), calendar_features(), ensure_schema(), forecast_future(), get_conn(), load_daily_counts(), load_holidays(), main()

### Community 80 - "AI Sandbox API"
Cohesion: 0.12
Nodes (15): zod@^3.24.1, configLanes(), getResults(), triggerSimulation(), getSimulationResultsFromDb(), triggerSimulationInDb(), ConfigLaneSchema, Dir (+7 more)

### Community 81 - "Audit Log API"
Cohesion: 0.19
Nodes (17): exportAuditLogs(), listAuditLogs(), recordActivity(), writeAuditEvent(), Actor, actorOf(), audit(), AuditEvent (+9 more)

### Community 82 - "ETL Extractors & Parser"
Cohesion: 0.23
Nodes (15): extractFromEvents(), extractFromFile(), ExtractionResult, extractFromWazeAlerts(), extractFromWazeHistorical(), extractFromWazeJams(), extractFromWeatherApi(), detectFormat() (+7 more)

### Community 83 - "Carriageway & Hazard Drawing"
Cohesion: 0.15
Nodes (22): facilityWetAreas(), displaceStateOf(), dot(), drawCarriageway(), drawDropGhost(), drawHazardLamps(), drawLabelProbe(), drawPlanGhosts() (+14 more)

### Community 84 - "Forecast-Driven Incidents"
Cohesion: 0.14
Nodes (20): NewEventSpec, BreakdownCause, CollisionLabel, ScenarioVariant, breakdownPairs(), DIRECTION_SHARE, drawForecastEvents(), Entry (+12 more)

### Community 85 - "Corridor Status API"
Cohesion: 0.17
Nodes (18): corridorStatusController(), corridorStatusFullController(), dashboardController(), dashboardOverviewController(), router, accessLabel(), classify(), DirectionStatus (+10 more)

### Community 86 - "Device Trust & Account"
Cohesion: 0.17
Nodes (18): adopt(), fmtDate(), ROLE_NAME, Section(), cooldownMessage(), DEFAULT_IDLE_MINUTES, DeviceTrust, deviceTrust() (+10 more)

### Community 87 - "Mascot 3D Stage"
Cohesion: 0.11
Nodes (13): ART, Mascot3DActor, ROAD_LANE, STORY_FACES, clamp(), createMascotFace(), FaceExpression, KEYS (+5 more)

### Community 88 - "DB Pool & 48h Forecast"
Cohesion: 0.13
Nodes (16): buildSslConfig(), connectTimeouts, createPool(), current, noteFailure(), getForecast48hHandler(), Forecast48hHour, Forecast48hQuery (+8 more)

### Community 89 - "Mailer (email)"
Cohesion: 0.22
Nodes (18): nodemailer@^10.1.7, EmailParts, esc(), fmt(), fmtDay(), frame(), here, mailConfigured() (+10 more)

### Community 90 - "Emissions API"
Cohesion: 0.15
Nodes (18): EmissionForecastQuerySchema, EmissionsAnalyticsQuerySchema, EmissionsDescriptiveQuerySchema, FleetMixQuerySchema, getClimateResilience(), getEmissionsAnalytics(), getEmissionsForecast(), getEmissionsIndex() (+10 more)

### Community 91 - "Forecast Source & Jam Profile"
Cohesion: 0.22
Nodes (14): getMapForecast(), ForecastTable, forecastTable(), OWNED_TABLE, SHARED_TABLE, directionSql(), jamProfileAvailable(), jamProfileSql() (+6 more)

### Community 92 - "Front-End TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+10 more)

### Community 93 - "Dataset Classifier"
Cohesion: 0.19
Nodes (15): ACCIDENT_DATA_SIGNALS, BREAKDOWN_DATA_SIGNALS, classifyDataset(), countMatches(), EMISSION_AQI_SIGNALS, EMISSION_SIGNALS, MOTORCYCLE_SIGNALS, ROAD_CRASH_SIGNALS (+7 more)

### Community 94 - "Zipper Lane Contraflow"
Cohesion: 0.15
Nodes (16): DualLanes, heldZipper(), borrowedLanes(), crossoverM(), defaultStretch(), km2(), other(), planStretch() (+8 more)

### Community 95 - "Forecast Horizon Picker"
Cohesion: 0.26
Nodes (15): ForecastExpandModal(), Segment, STATE_LABEL, STATE_ORDER, clockFor(), DailyPeak, dayOf(), dayTimeFor() (+7 more)

### Community 96 - "PH Holidays Seed"
Cohesion: 0.17
Nodes (14): date-holidays@^3.34.1, args, db, main(), buildPhHolidays(), daysApart(), EXCLUDED_NAMES, HolidayType (+6 more)

### Community 97 - "Incident Predictive Service"
Cohesion: 0.24
Nodes (15): getIncidentPredictive(), getIncidentHourlyFromDb(), getIncidentPredictiveAnchors(), getIncidentPredictiveFromDb(), resolveIncidentHistoricalWindow(), subtractDays(), getFleetMixForDate(), getScenarioContext() (+7 more)

### Community 98 - "Mobile Config Page"
Cohesion: 0.15
Nodes (14): Advisory, AdvisoryTone, FALLBACK, Icon, Meta, MobileConfig, MobileControlPage(), newAdvisoryId() (+6 more)

### Community 99 - "Mascot Body Loft"
Cohesion: 0.19
Nodes (8): BodyLoft, buildBodyGeometry(), buildBrimGeometry(), buildRearWindowGeometry(), buildSideStripGeometry(), buildSideWindowGeometry(), smoothstep(), warpedSamples()

### Community 100 - "Electron Desktop Shell"
Cohesion: 0.14
Nodes (13): { app, BrowserWindow, dialog }, createWindow(), fs, http, MIME, OUT_DIR, path, resolveInOut() (+5 more)

### Community 101 - "ETL Cleaner"
Cohesion: 0.24
Nodes (14): cleanAccidentBreakdownEvent(), cleanData(), cleanEmissions(), cleanIncident(), CleanResult, isNlexKmPost(), isNlexPlaza(), NLEX_PLAZA_NORMALIZED (+6 more)

### Community 102 - "ETL Transformer"
Cohesion: 0.32
Nodes (14): extractKmPost(), combineDateTime(), epochSeconds(), minutesBetween(), parseDeployments(), parseVehicleClass(), toInt(), toNumOrNull() (+6 more)

### Community 103 - "Hourly Incident Page"
Cohesion: 0.16
Nodes (14): CHIPS, fmtHour(), fmtShortDate(), HourlyData, HourlyIncidentContent(), HourlyIncidentPage(), HourPoint, META (+6 more)

### Community 104 - "API Client & Session Lost"
Cohesion: 0.22
Nodes (11): Briefing, FeatureBriefing(), announceSessionLost(), apiFetch(), AuthCode, authedJson(), AuthError, currentToken() (+3 more)

### Community 105 - "Motorcycle & P99 Tools"
Cohesion: 0.22
Nodes (3): main(), load_generator(), main()

### Community 106 - "Electron Build Config"
Cohesion: 0.14
Nodes (14): build, appId, asar, copyright, directories, extraMetadata, files, productName (+6 more)

### Community 107 - "Date Filter"
Cohesion: 0.22
Nodes (11): DateFilter(), DAY_HEADERS, daysInMonth(), firstDayOfMonth(), formatLabel(), isBetween(), isSameDay(), MONTH_NAMES (+3 more)

### Community 109 - "Scenario Forecast Panel"
Cohesion: 0.28
Nodes (12): dayLabel(), fmt(), forecastHour(), forecastIncidentsAt(), forecastInflowAt(), hhmm(), Scenario, ScenarioForecast (+4 more)

### Community 110 - "Two-Step Sign-in (MFA)"
Cohesion: 0.26
Nodes (10): asDataUrl(), beginSecondStep(), claimOf(), groupKey(), isFullySignedIn(), passedCode(), SecondStep, setupQr() (+2 more)

### Community 111 - "Maintenance Form Tests"
Cohesion: 0.18
Nodes (11): apiBody(), conflictsBody, DAY_AFTER, existing(), helpers, iso(), src, stepBody (+3 more)

### Community 112 - "Back-End TS Config"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, rootDir, skipLibCheck (+3 more)

### Community 113 - "Scene Preview Marks"
Cohesion: 0.21
Nodes (11): markFor(), PHASES, ScenePreview(), SceneMark, FamilyKey, RainIntensity, VehicleKind, drawSpeedSign() (+3 more)

### Community 114 - "Driver & Arrival Sampling"
Cohesion: 0.27
Nodes (4): gauss(), makeDriver(), mixHex(), varyColor()

### Community 115 - "Forecast Day Picker"
Cohesion: 0.30
Nodes (10): ForecastDayPicker(), longLabel(), monthKey(), monthTitle(), pad(), parse(), Parts, shortLabel() (+2 more)

### Community 116 - "Login Toll Plaza"
Cohesion: 0.23
Nodes (11): AMBER, BARRIER_Z, createPlaza(), GREEN, ISLANDS, LOGO_ART, logoDisc(), Plaza (+3 more)

### Community 117 - "Mascot & Reset Email Docs"
Cohesion: 0.20
Nodes (11): Supabase Reset Password Email Template (Navie), Navie, the SmartFlow NLEX Mascot, NLEX Mascot 3D README, createNlexMascotModel.ts factory, face.ts (drawn animated face), img2threejs Pipeline (silhouette IoU passes), mascot3d.ts stage actor, Mascot Design Iterations v2-v8 (+3 more)

### Community 118 - "Severity/Spatial/Response Results"
Cohesion: 0.20
Nodes (11): Breakdown Dispatch Response-Time Results, Cox PH Response-Time Survival (selected, C=0.563), Incident Severity / Clearance Results, Cox PH Clearance-Time Survival (C=0.625), Secondary Incident Risk Logistic (AUC 0.620), XGBoost Severity Classifier (selected, acc 0.902), Incident Spatial Model Results, GWR per-exit model (in-sample, LOEO MAE 2.838) (+3 more)

### Community 119 - "Back-End NPM Scripts"
Cohesion: 0.18
Nodes (11): scripts, build, check-command, dev, eval-command, init-db, lint, seed-holidays (+3 more)

### Community 120 - "Sandbox README: Dual Carriageway"
Cohesion: 0.18
Nodes (7): bothMetrics.ts corridor totals, Dual-Carriageway View (NB / SB / Both), Lane Reallocation (opposite-bound lane transfer), Lanes from the Road (lib/nlex-lanes.ts, OpenStreetMap), scenario-sandbox page.tsx, useDirectionSim.ts hook, zipper.ts (lane reallocation rules)

### Community 121 - "Back-End README & Routes"
Cohesion: 0.20
Nodes (9): SmartFlow Back-End README, Back-End API Routes (/api/health, dashboard, traffic, incident, emissions, ...), Back-End Layered Structure (config/routes/controllers/services/validators), PostGIS Integration (ST_AsGeoJSON FeatureCollection), Real NLEX Incident Scenarios README, AI Simulation Sandbox, Event Stretch (stretchKm, not a point), Command Prompt (GLM via OpenRouter) (+1 more)

### Community 122 - "Sandbox README: Calibration"
Cohesion: 0.20
Nodes (8): assumptions.ts (recorded Assumptions), Calibrated vs Manual-Only Scenario Families, calibration.json (duration quantiles), catalogue.ts (9 ScenarioTemplates), Open Questions for NLEX (LANE1_IS_INNERMOST, CHAINAGE_OFFSET_KM, buffers, MULTI_DEPLOYMENT_RULE), gold.fact_traffic_hourly, Forecast Incidents on the Stretch (forecastIncidents.ts), sampler.ts resolveDuration

### Community 123 - "Emergency Vehicle Art"
Cohesion: 0.42
Nodes (10): drawAmbulance(), drawPolice(), drawPreviewVehicles(), drawTow(), inFrame(), paintCar(), paintHazards(), paintLightBar() (+2 more)

### Community 124 - "Login Traffic"
Cohesion: 0.24
Nodes (9): createTraffic(), FLEET, inset(), Kind, Lane, LANES, profile(), SHAPES (+1 more)

### Community 125 - "Upload Middleware (multer)"
Cohesion: 0.22
Nodes (6): multer@^2.2.0, ACCEPTED_EXTENSIONS, ACCEPTED_MIMES, storage, uploadMiddleware, multer

### Community 126 - "Both-Direction Metrics"
Cohesion: 0.28
Nodes (8): BaselineFigures, combineBaselines(), combineMetrics(), CorridorBaseline, CorridorMetrics, flowWeightedSpeed(), SpeedAndFlow, Metrics

### Community 127 - "ESLint & Next Config"
Cohesion: 0.25
Nodes (3): compat, config, nextConfig

### Community 128 - "Front-End NPM Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, dev:desktop, dev:web, dist, lint, start (+1 more)

### Community 129 - "Weather-Speed Results"
Cohesion: 0.25
Nodes (7): Weather-Adjusted Speed Model Results, Contour (exit x hour) XGBoost, Road Closure Probability Logistic (AUC 0.897, driver is_holiday), Weather Incident Risk Logistic (AUC 0.670, rain significant), XGBoost Daily Speed Forecast (selected, MAE 3.779), HCM 2000 / FHWA Road Weather Management (corroboration), Mejia & Sigua (2018) Rainfall Impacts on NLEx Traffic Flow

### Community 130 - "Incident KPI SQL Tests"
Cohesion: 0.25
Nodes (6): accidentAvg, breakdownQuery, DURATIONS, service, silver, silverClearance

### Community 132 - "Sandbox Km Bounds Tests"
Cohesion: 0.25
Nodes (7): commitBody, kms, limits, routeFromKm, routeToKm, src, { typedWindowFrom, MIN_SEG_M, MAX_SEG_M }

### Community 133 - "Accident/Breakdown Ingest Script"
Cohesion: 0.33
Nodes (4): FILES, main(), uploadFile(), UploadStats

### Community 134 - "Installer (NSIS) Config"
Cohesion: 0.29
Nodes (7): nsis, allowToChangeInstallationDirectory, createDesktopShortcut, createStartMenuShortcut, oneClick, perMachine, shortcutName

### Community 135 - "Incident Count Results"
Cohesion: 0.47
Nodes (6): Incident Count Forecasting Results, Accident-Only Forecasting Results, Poisson GLM accident model (selected, JUST RIGHT), Negative Binomial GLM (selected, R2 0.328), silver.nlex_accident_events_clean / nlex_breakdown_events_clean, Split R2 Adviser Diagnostic (overfit/underfit)

### Community 136 - "date-holidays Types"
Cohesion: 0.33
Nodes (3): date-holidays, HolidayItem, Holidays

### Community 137 - "Next Forecast Route"
Cohesion: 0.47
Nodes (4): dynamic, fallbackForecast, GET(), getDbPool()

### Community 139 - "Imminent Scene Drawing"
Cohesion: 0.47
Nodes (6): assertNeverFamily(), drawImminent(), drawScenes(), hasSceneArt(), imminence(), isImminent()

### Community 140 - "Fonts & Front-End README"
Cohesion: 0.33
Nodes (5): Fonts README, Inter Variable Font, Saira Variable Font, SmartFlow NLEX Dashboard README, Electron Desktop App Build

### Community 141 - "Active Closures Hook"
Cohesion: 0.40
Nodes (5): Body, listeners, load(), useActiveClosures(), BACKEND

### Community 142 - "OSM Toll Plazas Data"
Cohesion: 0.40
Nodes (4): OSM_TOLL_PLAZAS, OSM_TOLL_PLAZAS_AWAY, OSM_TOLL_PLAZAS_READ, OsmTollPlaza

### Community 144 - "Sandbox README: Event Twin"
Cohesion: 0.50
Nodes (4): eventTwin.ts NoEventTwin, Scenes Made of the Traffic (SCENE_LEAD_S run-up), simulation.ts Interventions / TrafficSim engine, No Limit on Simultaneous Events (multiple closures/speed zones)

### Community 145 - "Debris & Skid Drawing"
Cohesion: 0.50
Nodes (5): by(), castOf(), drawDebris(), drawSceneGround(), skidBehind()

### Community 147 - "Sandbox README: Interventions"
Cohesion: 0.67
Nodes (4): adapter.ts composeInterventions, sceneArt.ts (event drawing), sceneMarks / SceneMark (closure ownership drawing), verify.ts test suite (1,431 checks)

### Community 148 - "Legacy ESLint Config"
Cohesion: 0.50
Nodes (3): extends, next/core-web-vitals, next/typescript

## Knowledge Gaps
- **30 isolated node(s):** `next/core-web-vitals`, `next/typescript`, `SmartFlow NLEX Dashboard README`, `Real NLEX Incident Scenarios README`, `catalogue.ts (9 ScenarioTemplates)` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1585 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Prescriptive Incident & Emissions Panels` to `Incident Predictive Charts`, `Analytics Tab Pages`, `Live Corridor Status & Hero`, `Sandbox Facilities & Places`, `Scenario Sandbox Page`, `Congestion Forecast Chart`, `Scenario Panel & Placement`, `Active Closures Hook`, `Volume & Emission Forecast Charts`, `Event Twin & Direction Sim`, `AI Model Narrative Cards`, `Prescriptive Traffic Panels (TOPSIS)`, `Maintenance Scheduler Page`, `Sign-in & Settings Pages`, `Live Map Graphics & Km Scale`, `Waze Live & Map Comparison`, `Incident Heatmaps & Breakdown Panel`, `Dashboard Shell & Nav Access`, `App Root Layout, Theme & Toasts`, `Navie Greeting & Stage Bus`, `Data Management Page`, `Exit Lookup & Corridor Strip`, `Front-End Dev Tooling`, `Sandbox Trend Charts`, `Front-End Dependencies`, `Audit Log Page`, `Login Stage & Cloud Effects`, `Device Trust & Account`, `Forecast Horizon Picker`, `Mobile Config Page`, `Hourly Incident Page`, `API Client & Session Lost`, `Date Filter`, `Scenario Forecast Panel`, `Scene Preview Marks`, `Forecast Day Picker`?**
  _High betweenness centrality (0.225) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `AiSandboxPage()` (e.g. with `.facilityStats()` and `.metrics()`) actually correct?**
  _`AiSandboxPage()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `next/core-web-vitals`, `next/typescript`, `SmartFlow NLEX Dashboard README` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Incident Predictive Charts` be split into smaller, more focused modules?**
  _Cohesion score 0.03518700787401575 - nodes in this community are weakly interconnected._
- **Why does `verify.ts test suite (1,431 checks)` connect `Sandbox README: Interventions` to `Sandbox README: Dual Carriageway`, `Sandbox README: Calibration`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **Should `Analytics Tab Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.03894571203776554 - nodes in this community are weakly interconnected._
- **Why does `sampler.ts resolveDuration` connect `Sandbox README: Calibration` to `Sandbox README: Interventions`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._