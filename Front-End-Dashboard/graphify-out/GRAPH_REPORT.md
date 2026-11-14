# Graph Report - Front-End-Dashboard  (2026-11-04)

## Corpus Check
- Large corpus: 252 files · ~560,850 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2889 nodes · 7138 edges · 116 communities (100 shown, 16 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 94 edges (avg confidence: 0.85)
- Token cost: 114,022 input · 0 output

## Community Hubs (Navigation)
- Analytics Tab Pages
- Sandbox Zipper Merge Planning
- Scenario Intervention Composer
- Scenario Catalogue & Assumptions
- Incident Risk Model Panels
- Scenario Sandbox Page
- Duration Sampler & Calibration
- Sandbox Scene Art
- Data Management & Mobile Control
- Scenario Event Panel
- 3D Mascot Model Builder
- Direction Sim & No-Event Twin
- Facility Art & Replay
- Traffic Simulation Engine (IDM/MOBIL)
- Emissions Forecast Charts
- Congestion Forecast Map
- Toll Facility Engine
- Maintenance Scheduler
- Model Narrative Panels
- Chart Theme & Event Charts
- Live Map Panels
- Two-Step Sign-In
- Corridor Live Status
- Dashboard Shell & Role Access
- Vehicle Paint & Motorcycles
- Sandbox Design Docs
- App Layout, Theme & Toasts
- Volume Forecast & Evidence
- Incident Calibration Builder (Py)
- Incident Forecast Chart
- Toll Plaza & Lane Builders (Py)
- Waze Live Modal & Legend
- Login 3D Scene
- Settings Page
- Live Map Page & Horizon Picker
- Dev Dependencies
- Overview Hero
- Facility Geometry
- Sim Replication & Stats
- Runtime Dependencies
- Facility Layout & Toll Plazas
- Carriageway Drawing
- Corridor Centreline Shape
- Canvas Recorder
- Event Ranking Helpers
- Traffic Prescriptive Panels
- Sandbox Trend Charts
- Both-Direction Rendering
- Clearance Response Panel
- Login Stage & Effects
- Interactive Road Map
- Forecast Incident Scenarios
- Incident Heatmaps
- Resource Staging Panel
- Audit Log Page
- Mascot Stage Actor & Face
- Patrol Alert Schedule
- Corridor Strip & Exit Lookup
- Navie Greeting & Stage Bus
- TypeScript Config
- Night Corridor Stage & Theme Toggle
- Hourly Incident Page
- Sandbox Analysis Scripts (Py)
- Maintenance Form Tests
- Prescriptive Service Tests
- Replay Buffer
- Emissions Prescriptive Panel
- Vehicle Spawning & Exits
- Electron Main Process
- Electron Builder Config
- Date Filter
- Km-Post Conversion
- Login Art Layer Builder (Py)
- Motorcycle Recorder
- Scenario Forecast Panel
- Mascot Body Loft
- Forecast Day Picker
- Login Toll Plaza Model
- Places List
- Overview Hot-List Tests
- Incident Rain & Hotspot Tests
- Facility Admission
- Auth Activity Logging
- Login Traffic
- Settings & Queue Tests
- Both-Direction Metrics
- ESLint & Next Config
- Mascot Design Docs
- NPM Scripts
- Forecast API Route & DB Pool
- Sandbox Recommendation
- Carriageway Projection
- Mascot Face Controller
- Sandbox Km Bounds Tests
- Corridor Places Geometry
- Fuel Station Placement
- NSIS Installer Config
- Layout Builder
- Active Closures Hook
- Fonts & Desktop Build Docs
- Cached JSON Fetch
- Table Sorting
- Traffic Period Change Tests
- Seeded Random & Barriers
- Electron Preload
- Legacy ESLint Config
- Dashboard Stub
- Sandbox Command Prompt Docs
- Electron Global Types
- CSS Module Types
- Replay Recording Doc

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
- `MapComparisonPage()` --calls--> `Box`  [EXTRACTED]
  app/dashboard/map-comparison/page.tsx → components/maps/livemap-graphics.ts
- `mapLog()` --calls--> `fmtKmRange()`  [EXTRACTED]
  app/dashboard/audit-log/page.tsx → lib/km-post.ts
- `AuditLogPage()` --calls--> `PageHeader()`  [EXTRACTED]
  app/dashboard/audit-log/page.tsx → components/dashboard/PageHeader.tsx
- `AuditLogPage()` --calls--> `StateNote()`  [EXTRACTED]
  app/dashboard/audit-log/page.tsx → components/stage/StateNote.tsx
- `AuditLogPage()` --calls--> `authedJson()`  [EXTRACTED]
  app/dashboard/audit-log/page.tsx → lib/api.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Scenario sandbox pipeline: catalogue -> sampler -> adapter -> engine** — front_end_dashboard_app_dashboard_scenario_sandbox_scenarios_readme_catalogue_ts, front_end_dashboard_app_dashboard_scenario_sandbox_scenarios_readme_sampler_ts, front_end_dashboard_app_dashboard_scenario_sandbox_scenarios_readme_calibration_json, front_end_dashboard_app_dashboard_scenario_sandbox_scenarios_readme_adapter_ts_composeinterventions, front_end_dashboard_app_dashboard_scenario_sandbox_scenarios_readme_simulation_ts_interventions [EXTRACTED 1.00]
- **NLEX mascot 3D rendering stack** — front_end_dashboard_components_stage_mascot_readme_createnlexmascotmodel, front_end_dashboard_components_stage_mascot_readme_face_ts, front_end_dashboard_components_stage_mascot_readme_mascot3d_ts, front_end_dashboard_components_stage_mascot_readme_nlexmascothandles [EXTRACTED 1.00]

## Communities (116 total, 16 thin omitted)

### Community 0 - "Analytics Tab Pages"
Cohesion: 0.04
Nodes (97): Analytics, CAUSE_MODES, CauseMode, Detail, DOW_LABELS, DOW_ORDER, fmt1(), fmtHour() (+89 more)

### Community 1 - "Sandbox Zipper Merge Planning"
Cohesion: 0.03
Nodes (85): accidentVariants, ALL_SPECS, allEntries, at1, at1e6, at400, boothSpec(), busFuel (+77 more)

### Community 2 - "Scenario Intervention Composer"
Cohesion: 0.05
Nodes (80): FamilyIcon(), ActiveEvent, addEvent(), addEventToBucket(), AddResult, blockedLanes(), boundaryTimes(), BREAKDOWN_LEAD_S (+72 more)

### Community 3 - "Scenario Catalogue & Assumptions"
Cohesion: 0.03
Nodes (69): appKmToChainageKm(), Assumption, AssumptionId, ASSUMPTIONS, BreakdownFamilyKey, ByClosureFamily, ByFamily, CHAINAGE_DERIVATION (+61 more)

### Community 4 - "Incident Risk Model Panels"
Cohesion: 0.05
Nodes (69): blockLabel(), BreakdownResponseData, BreakdownResponseModel(), DAY_NAMES, DAY_ORDER, fmtHour(), GroupStat, manilaNow() (+61 more)

### Community 5 - "Scenario Sandbox Page"
Cohesion: 0.05
Nodes (71): DirectionPill(), AiSandboxPage(), Baseline, BaselineSteps(), ClosureHint(), CommandAction, CommandLookup, CommandPlan (+63 more)

### Community 6 - "Duration Sampler & Calibration"
Cohesion: 0.06
Nodes (71): BREAKDOWN_CAUSES, BREAKDOWN_FAMILIES, BREAKDOWN_VEHICLES, CalibratedVariant, calibratedVariantOf(), CALIBRATION_KEYS, CalibrationKey, causeKey() (+63 more)

### Community 7 - "Sandbox Scene Art"
Cohesion: 0.07
Nodes (68): markFor(), PHASES, ScenePreview(), SceneMark, RainIntensity, VehicleKind, assertNeverFamily(), by() (+60 more)

### Community 8 - "Data Management & Mobile Control"
Cohesion: 0.05
Nodes (55): BackendDown, clock(), Comparison, ComparisonPanel(), DataManagementPage(), confirmUndo(), confirmUpload(), postUndo() (+47 more)

### Community 9 - "Scenario Event Panel"
Cohesion: 0.06
Nodes (58): DIRECTION_NAME, Candidate, candidatesFrom(), HOTSPOT_FAMILIES, Hotspots, norm(), PickResult, PlaceMode (+50 more)

### Community 10 - "3D Mascot Model Builder"
Cohesion: 0.06
Nodes (53): BODY_KEYS, BodyKey, buildCapBackTexture(), buildCapFrontPanelGeometry(), buildCapNTexture(), buildCrownGeometry(), buildFacePanelGeometry(), buildGlassTexture() (+45 more)

### Community 11 - "Direction Sim & No-Event Twin"
Cohesion: 0.06
Nodes (42): SkipView, Live, NoEventTwin, movementKm(), southboundFromBarrier(), CLASSES, ClassShares, HourOfDemand (+34 more)

### Community 12 - "Facility Art & Replay"
Cohesion: 0.07
Nodes (50): Facility, APRON_ROLES, apronOutline(), BARRIER_ROLES, baseLengthPx(), BRAND, brandName(), brandOf() (+42 more)

### Community 13 - "Traffic Simulation Engine (IDM/MOBIL)"
Cohesion: 0.09
Nodes (4): measure(), hash01(), TrafficSim, visualLane()

### Community 14 - "Emissions Forecast Charts"
Cohesion: 0.07
Nodes (45): fadeArea(), AggInput, AggOutput, aggregateSeries(), bucketLength(), bucketOf(), Granularity, maxOf() (+37 more)

### Community 15 - "Congestion Forecast Map"
Cohesion: 0.07
Nodes (47): Alert, baseLabel(), CellItem, CongestionEval, DayCell, EvBlock(), fmtChance(), fmtDelay() (+39 more)

### Community 16 - "Toll Facility Engine"
Cohesion: 0.12
Nodes (4): FacilityEngine, FacilityHost, poseAt(), Vehicle

### Community 17 - "Maintenance Scheduler"
Cohesion: 0.08
Nodes (44): analyse(), canBecomeKmPost(), closedLanes(), closureRank(), closureSeverity(), closureText(), CONFLICT_LABEL, ConflictKind (+36 more)

### Community 18 - "Model Narrative Panels"
Cohesion: 0.08
Nodes (32): AiModelInsight(), Insight, InsightMetric, Props, ClearanceNarrative(), CongestionNarrative(), CongestionNarrativeHorizon, CongestionNarrativeModel (+24 more)

### Community 19 - "Chart Theme & Event Charts"
Cohesion: 0.08
Nodes (39): Props, DeploymentTimeStat, EventBreakdownData, EventBreakdownPanel(), fmtInt(), fullServiceName(), Metric, METRICS (+31 more)

### Community 20 - "Live Map Panels"
Cohesion: 0.09
Nodes (38): addNightCorridorImages(), Box, buildSnapshot(), carriagewayShift(), CorridorSnapshot, createJamCallouts(), dashAt(), dashPhase() (+30 more)

### Community 21 - "Two-Step Sign-In"
Cohesion: 0.12
Nodes (35): Home(), afterResetVerified(), backToPassword(), goToDashboard(), handleCodeChange(), handleCodeSubmit(), handleResetEmailSubmit(), handleResetMfaSubmit() (+27 more)

### Community 22 - "Corridor Live Status"
Cohesion: 0.11
Nodes (31): Feed, HeroLiveStatus(), RealtimeFC, Status, useCountUp(), useCorridorStatus(), KmExit, KmScale (+23 more)

### Community 23 - "Dashboard Shell & Role Access"
Cohesion: 0.10
Nodes (26): DashboardLayout(), NightCorridorStage, IdleGuard(), LoadingGate(), NlexEnvironment(), Mascot(), MascotMood, Section (+18 more)

### Community 24 - "Vehicle Paint & Motorcycles"
Cohesion: 0.08
Nodes (34): BikeCtx, dot(), drawMotorcycle(), paleBody(), rr(), BUS_PAINTS, CAB_PAINTS, CAR_PAINTS (+26 more)

### Community 25 - "Sandbox Design Docs"
Cohesion: 0.06
Nodes (27): Real NLEX Incident Scenarios README, adapter.ts composeInterventions, AI Simulation Sandbox, assumptions.ts (recorded Assumptions), bothMetrics.ts corridor totals, Calibrated vs Manual-Only Scenario Families, calibration.json (duration quantiles), catalogue.ts (9 ScenarioTemplates) (+19 more)

### Community 26 - "App Layout, Theme & Toasts"
Cohesion: 0.07
Nodes (18): metadata, RootLayout(), applyChoice(), systemPrefersDark(), THEME_INIT_SCRIPT, THEME_STORAGE_KEY, ThemeChoice, ThemeContext (+10 more)

### Community 27 - "Volume Forecast & Evidence"
Cohesion: 0.10
Nodes (29): ChartData, extremeLabel(), fmtHour(), fmtVeh(), ForecastRow, HorizonBucket, hourExtreme(), HourlyForecast (+21 more)

### Community 28 - "Incident Calibration Builder (Py)"
Cohesion: 0.13
Nodes (19): accident_entry(), block(), breakdown_entry(), build(), cause_of(), chainage_offset(), classify(), etl_accept() (+11 more)

### Community 29 - "Incident Forecast Chart"
Cohesion: 0.11
Nodes (24): HOW_IT_WORKS, IncidentNarrative(), MetricHint(), metricHintFor(), modelHintFor(), ACTUAL_COLOR, CorridorForecastPoint, DailyPoint (+16 more)

### Community 30 - "Toll Plaza & Lane Builders (Py)"
Cohesion: 0.12
Nodes (11): load(), main(), measure(), project(), xy(), attach(), fetch(), load_network() (+3 more)

### Community 31 - "Waze Live Modal & Legend"
Cohesion: 0.12
Nodes (25): MapLegend(), agoText(), CORRIDOR, LEVELS, levelWord(), notDisputed(), onCorridor(), Overview (+17 more)

### Community 32 - "Login 3D Scene"
Cohesion: 0.12
Nodes (23): clamp01(), createLoginScene(), animates(), applyPose(), frame(), loop(), maybeReady(), resize() (+15 more)

### Community 33 - "Settings Page"
Cohesion: 0.17
Nodes (26): adopt(), fmtDate(), fmtDay(), passwordProblem(), ROLE_NAME, Section(), SettingsPage(), forgetEmail() (+18 more)

### Community 34 - "Live Map Page & Horizon Picker"
Cohesion: 0.15
Nodes (25): CORRIDOR, ExitHit, MapComparisonPage(), fetchStats(), StripHover, ForecastExpandModal(), Segment, STATE_LABEL (+17 more)

### Community 35 - "Dev Dependencies"
Cohesion: 0.10
Nodes (28): description, devDependencies, concurrently@^9.1.2, electron-builder@^25.1.8, eslint@^9.24.0, eslint-config-next@^15.2.4, @types/node@^22.15.18, @types/pg@^8.20.0 (+20 more)

### Community 36 - "Overview Hero"
Cohesion: 0.12
Nodes (18): dynamic, fallbackRealtime, DashboardHomePage(), PageGroupName(), LABEL, SignalGlyph(), SignalState, ageText() (+10 more)

### Community 37 - "Facility Geometry"
Cohesion: 0.10
Nodes (25): arcIn(), arcOut(), bodyW(), BOOTH_MOVE_UP_S, buildFacility(), convM(), DRAW_W_FRAC, FAC_LANE (+17 more)

### Community 38 - "Sim Replication & Stats"
Cohesion: 0.08
Nodes (25): FacilityStats, Arrival, CLASS, CLASS_META, CrashKind, CrashScene, DriverProfile, laneAllowsClass() (+17 more)

### Community 39 - "Runtime Dependencies"
Cohesion: 0.07
Nodes (27): dependencies, echarts@^6.0.0, echarts-for-react@^3.0.6, @heroicons/react@^2.2.0, lucide-react@^1.14.0, mapbox-gl@^3.23.0, maplibre-gl@^5.24.0, next@^15.2.4 (+19 more)

### Community 40 - "Facility Layout & Toll Plazas"
Cohesion: 0.11
Nodes (24): boothDwellFor(), FacilitySpec, SERVICE_DWELL_S, SERVICE_PUMPS, SERVICE_PUMPS_AT_M, awayText(), boothsFor(), boothSource() (+16 more)

### Community 41 - "Carriageway Drawing"
Cohesion: 0.12
Nodes (26): facilityWetAreas(), displaceStateOf(), dot(), drawCarriageway(), drawDropGhost(), drawHazardLamps(), drawLabelProbe(), drawPlanGhosts() (+18 more)

### Community 42 - "Corridor Centreline Shape"
Cohesion: 0.14
Nodes (25): directionOfReport(), buildCentreline(), buildCentrelineUncached(), centrelines, CORRIDOR_TOLERANCE_M, corridorGuard(), despike(), directionFromStreet() (+17 more)

### Community 44 - "Event Ranking Helpers"
Cohesion: 0.10
Nodes (21): championValue(), CongestionAdvice, CongestionCalibration, CongestionRow, EventRow, ExitImpact, exitsFromEvents(), exitsFromUpcoming() (+13 more)

### Community 45 - "Traffic Prescriptive Panels"
Cohesion: 0.23
Nodes (24): fetchJsonWithRetry(), loadForecast(), loadPrescriptive(), ActionCard(), Banner(), BoothStaffingPanel(), chanceText(), CongestionResponsePanel() (+16 more)

### Community 46 - "Sandbox Trend Charts"
Cohesion: 0.13
Nodes (22): clockOf(), fmtNum(), MetricDef, MetricKey, METRICS, niceScale(), PAD, pad2() (+14 more)

### Community 47 - "Both-Direction Rendering"
Cohesion: 0.13
Nodes (24): facilityDepth(), gutterLanePx(), hasBarrier(), builtLanes(), daylightAsphalt(), drawBarrierRun(), drawLentRoad(), drawMedian() (+16 more)

### Community 48 - "Clearance Response Panel"
Cohesion: 0.11
Nodes (22): abortableWait(), Chance, ClearanceInsufficientData, ClearanceOk, ClearanceResponsePanel(), ClearanceResult, ClearanceType, fetchClearance() (+14 more)

### Community 49 - "Login Stage & Effects"
Cohesion: 0.13
Nodes (19): Cloud, CloudLayer(), FAR, MID, NEAR, Scene, LightsCue, LoginScene (+11 more)

### Community 50 - "Interactive Road Map"
Cohesion: 0.13
Nodes (21): Band, buildLookup(), CAR_LANES, CAR_SPEED, carJourney(), CLEAR, COLOR_CLASS, CorridorStatus (+13 more)

### Community 51 - "Forecast Incident Scenarios"
Cohesion: 0.14
Nodes (20): NewEventSpec, BreakdownCause, CollisionLabel, ScenarioVariant, breakdownPairs(), DIRECTION_SHARE, drawForecastEvents(), Entry (+12 more)

### Community 52 - "Incident Heatmaps"
Cohesion: 0.20
Nodes (19): DOW_LABELS, DOW_ORDER, fmt1(), fmtHour(), fmtInt(), HeatCell, HeatKey(), HourDayHeatmapGrid() (+11 more)

### Community 53 - "Resource Staging Panel"
Cohesion: 0.13
Nodes (18): CorridorForecastPoint, CorridorStrip(), KmSegmentForecastPoint, kmSpan(), Placed, placementOrder(), PredictiveSlice, PrescriptiveDeploymentPanel() (+10 more)

### Community 54 - "Audit Log Page"
Cohesion: 0.19
Nodes (20): ago(), AuditLogPage(), Bars(), cap(), dayLabel(), everyDay(), HourlyModel, Insights (+12 more)

### Community 55 - "Mascot Stage Actor & Face"
Cohesion: 0.11
Nodes (13): ART, Mascot3DActor, ROAD_LANE, STORY_FACES, clamp(), createMascotFace(), FaceExpression, KEYS (+5 more)

### Community 56 - "Patrol Alert Schedule"
Cohesion: 0.15
Nodes (19): AnalyticsSlice, buildProfile(), ciCache, DayRow, DOW_FULL, DOW_LABELS, DOW_ORDER, fmtHour() (+11 more)

### Community 57 - "Corridor Strip & Exit Lookup"
Cohesion: 0.18
Nodes (17): corridorKm(), CorridorStrip(), Dir, LegendKey(), calloutText(), fmtDelayShort(), fmtDistance(), levelWord() (+9 more)

### Community 58 - "Navie Greeting & Stage Bus"
Cohesion: 0.19
Nodes (16): clickLines(), introLines(), JUST_SIGNED_IN, Live, liveLine(), NavieGreeting(), sayOnClick(), pick() (+8 more)

### Community 59 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+10 more)

### Community 60 - "Night Corridor Stage & Theme Toggle"
Cohesion: 0.19
Nodes (15): OPTIONS, ThemeToggle(), createMascot3D(), configFor(), lightThemeNow(), NightCorridorStage(), prefersReducedMotion(), createMascotPlane() (+7 more)

### Community 61 - "Hourly Incident Page"
Cohesion: 0.17
Nodes (15): CHIPS, fmtHour(), fmtShortDate(), HourlyData, HourlyIncidentContent(), HourlyIncidentPage(), HourPoint, META (+7 more)

### Community 62 - "Sandbox Analysis Scripts (Py)"
Cohesion: 0.18
Nodes (4): main(), main(), load_generator(), main()

### Community 63 - "Maintenance Form Tests"
Cohesion: 0.14
Nodes (12): apiBody(), conflictsBody, DAY_AFTER, existing(), helpers, iso(), page, src (+4 more)

### Community 64 - "Prescriptive Service Tests"
Cohesion: 0.16
Nodes (9): { placementOrder }, rows, src, { buildProfile, poissonCi, primaryOf, windowSpanHours }, primaryExpr, SHAPE, src, src (+1 more)

### Community 66 - "Emissions Prescriptive Panel"
Cohesion: 0.20
Nodes (14): ACTION_HEAD, ClassKm, dayRange(), explainFailure(), fmtT(), forecastStamp(), HeavyWindow, MONTH() (+6 more)

### Community 67 - "Vehicle Spawning & Exits"
Cohesion: 0.22
Nodes (4): gauss(), makeDriver(), mixHex(), varyColor()

### Community 68 - "Electron Main Process"
Cohesion: 0.16
Nodes (10): { app, BrowserWindow, dialog }, createWindow(), fs, http, MIME, OUT_DIR, path, resolveInOut() (+2 more)

### Community 69 - "Electron Builder Config"
Cohesion: 0.14
Nodes (14): build, appId, asar, copyright, directories, extraMetadata, files, productName (+6 more)

### Community 70 - "Date Filter"
Cohesion: 0.22
Nodes (11): DateFilter(), DAY_HEADERS, daysInMonth(), firstDayOfMonth(), formatLabel(), isBetween(), isSameDay(), MONTH_NAMES (+3 more)

### Community 71 - "Km-Post Conversion"
Cohesion: 0.22
Nodes (11): kmRange(), KmInput(), ANCHORS, BY_KEY, exitKmPost(), exitMeasuredKm(), fmtKm(), keyOf() (+3 more)

### Community 72 - "Login Art Layer Builder (Py)"
Cohesion: 0.24
Nodes (5): parse_deployments(), dash_mask(), patch(), post_curve(), rail()

### Community 74 - "Scenario Forecast Panel"
Cohesion: 0.28
Nodes (12): dayLabel(), fmt(), forecastHour(), forecastIncidentsAt(), forecastInflowAt(), hhmm(), Scenario, ScenarioForecast (+4 more)

### Community 75 - "Mascot Body Loft"
Cohesion: 0.24
Nodes (6): BodyLoft, buildBodyGeometry(), buildBrimGeometry(), buildRearWindowGeometry(), smoothstep(), warpedSamples()

### Community 76 - "Forecast Day Picker"
Cohesion: 0.30
Nodes (10): ForecastDayPicker(), longLabel(), monthKey(), monthTitle(), pad(), parse(), Parts, shortLabel() (+2 more)

### Community 77 - "Login Toll Plaza Model"
Cohesion: 0.23
Nodes (11): AMBER, BARRIER_Z, createPlaza(), GREEN, ISLANDS, LOGO_ART, logoDisc(), Plaza (+3 more)

### Community 78 - "Places List"
Cohesion: 0.20
Nodes (10): Junction, Place, PlacesList(), Row, Span, Toll, TOLL_LABEL, FacilityKind (+2 more)

### Community 80 - "Overview Hot-List Tests"
Cohesion: 0.18
Nodes (8): emptyMarkup, filterArg, hotBlock, seeAllCond, { SHOWN, severity, isHot, cmp, showSeeAll, windowOf }, sortArg, src, windowDecl

### Community 81 - "Incident Rain & Hotspot Tests"
Cohesion: 0.20
Nodes (7): block, { flagged }, src, block, { rain }, src, tileFmt

### Community 83 - "Auth Activity Logging"
Cohesion: 0.38
Nodes (9): saveIdle(), saveName(), handleNewPasswordSubmit(), deviceTrustHeader(), installBackendAuth(), logActivity(), logPageView(), notifyPasswordChanged() (+1 more)

### Community 84 - "Login Traffic"
Cohesion: 0.24
Nodes (9): createTraffic(), FLEET, inset(), Kind, Lane, LANES, profile(), SHAPES (+1 more)

### Community 85 - "Settings & Queue Tests"
Cohesion: 0.22
Nodes (5): k, stretch, checks, { pwError }, src

### Community 86 - "Both-Direction Metrics"
Cohesion: 0.28
Nodes (8): BaselineFigures, combineBaselines(), combineMetrics(), CorridorBaseline, CorridorMetrics, flowWeightedSpeed(), SpeedAndFlow, Metrics

### Community 87 - "ESLint & Next Config"
Cohesion: 0.25
Nodes (3): compat, config, nextConfig

### Community 88 - "Mascot Design Docs"
Cohesion: 0.25
Nodes (9): NLEX Mascot 3D README, createNlexMascotModel.ts factory, face.ts (drawn animated face), img2threejs Pipeline (silhouette IoU passes), mascot3d.ts stage actor, Mascot Design Iterations v2-v8, public/brand/nlex-mascot.png (Mascot.tsx PNG), NlexMascotHandles interface (+1 more)

### Community 89 - "NPM Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, dev:desktop, dev:web, dist, lint, start (+1 more)

### Community 90 - "Forecast API Route & DB Pool"
Cohesion: 0.32
Nodes (6): dynamic, fallbackForecast, GET(), getDbPool(), pg@^8.20.0, pg

### Community 91 - "Sandbox Recommendation"
Cohesion: 0.32
Nodes (7): CLOSURE_LANE_CAPACITY_VEH_H, fmt(), getRecommendation(), InflowFrom, plural(), Recommendation, Supply

### Community 92 - "Carriageway Projection"
Cohesion: 0.54
Nodes (8): classify(), carriageway(), is_nlex(), length(), oneway(), reach(), project(), xy()

### Community 94 - "Sandbox Km Bounds Tests"
Cohesion: 0.25
Nodes (7): commitBody, kms, limits, routeFromKm, routeToKm, src, { typedWindowFrom, MIN_SEG_M, MAX_SEG_M }

### Community 95 - "Corridor Places Geometry"
Cohesion: 0.43
Nodes (7): barrierFanM(), boothLineAtM(), footprintM(), corridorPlaces(), frameFor(), frameSpan(), spanKm()

### Community 96 - "Fuel Station Placement"
Cohesion: 0.38
Nodes (6): corridorKmAt(), FUEL_STATIONS, FuelStation, PlacedFuelStation, placeFuelStations(), toXY()

### Community 97 - "NSIS Installer Config"
Cohesion: 0.29
Nodes (7): nsis, allowToChangeInstallationDirectory, createDesktopShortcut, createStartMenuShortcut, oneClick, perMachine, shortcutName

### Community 99 - "Active Closures Hook"
Cohesion: 0.40
Nodes (5): Body, Closure, listeners, load(), useActiveClosures()

### Community 100 - "Fonts & Desktop Build Docs"
Cohesion: 0.33
Nodes (5): Fonts README, Inter Variable Font, Saira Variable Font, SmartFlow NLEX Dashboard README, Electron Desktop App Build

### Community 101 - "Cached JSON Fetch"
Cohesion: 0.33
Nodes (4): Entry, inflight, request(), store

### Community 102 - "Table Sorting"
Cohesion: 0.40
Nodes (5): compare(), SortDir, SortState, SortValue, useTableSort()

### Community 103 - "Traffic Period Change Tests"
Cohesion: 0.33
Nodes (4): { delta, fmtPct }, deltaLines, src, tile

### Community 105 - "Electron Preload"
Cohesion: 0.50
Nodes (3): { contextBridge }, electron@^33.0.0, electron

### Community 106 - "Legacy ESLint Config"
Cohesion: 0.50
Nodes (3): extends, next/core-web-vitals, next/typescript

### Community 108 - "Sandbox Command Prompt Docs"
Cohesion: 0.67
Nodes (3): Event Stretch (stretchKm, not a point), Command Prompt (GLM via OpenRouter), Back-End sandbox-command.service.ts

## Knowledge Gaps
- **23 isolated node(s):** `next/core-web-vitals`, `next/typescript`, `SmartFlow NLEX Dashboard README`, `Real NLEX Incident Scenarios README`, `catalogue.ts (9 ScenarioTemplates)` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1037 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Volume Forecast & Evidence` to `Analytics Tab Pages`, `Incident Risk Model Panels`, `Scenario Sandbox Page`, `Sandbox Scene Art`, `Data Management & Mobile Control`, `Scenario Event Panel`, `Direction Sim & No-Event Twin`, `Emissions Forecast Charts`, `Congestion Forecast Map`, `Maintenance Scheduler`, `Model Narrative Panels`, `Chart Theme & Event Charts`, `Live Map Panels`, `Two-Step Sign-In`, `Corridor Live Status`, `Dashboard Shell & Role Access`, `App Layout, Theme & Toasts`, `Incident Forecast Chart`, `Waze Live Modal & Legend`, `Settings Page`, `Live Map Page & Horizon Picker`, `Dev Dependencies`, `Overview Hero`, `Runtime Dependencies`, `Traffic Prescriptive Panels`, `Sandbox Trend Charts`, `Clearance Response Panel`, `Login Stage & Effects`, `Interactive Road Map`, `Incident Heatmaps`, `Resource Staging Panel`, `Audit Log Page`, `Patrol Alert Schedule`, `Corridor Strip & Exit Lookup`, `Navie Greeting & Stage Bus`, `Night Corridor Stage & Theme Toggle`, `Hourly Incident Page`, `Emissions Prescriptive Panel`, `Date Filter`, `Scenario Forecast Panel`, `Forecast Day Picker`, `Places List`, `Active Closures Hook`, `Table Sorting`?**
  _High betweenness centrality (0.285) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `AiSandboxPage()` (e.g. with `.facilityStats()` and `.metrics()`) actually correct?**
  _`AiSandboxPage()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `next/core-web-vitals`, `next/typescript`, `SmartFlow NLEX Dashboard README` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Analytics Tab Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.04037966537966538 - nodes in this community are weakly interconnected._
- **Should `Sandbox Zipper Merge Planning` be split into smaller, more focused modules?**
  _Cohesion score 0.025979843225083985 - nodes in this community are weakly interconnected._
- **Should `Scenario Intervention Composer` be split into smaller, more focused modules?**
  _Cohesion score 0.0461357625624449 - nodes in this community are weakly interconnected._
- **Should `Scenario Catalogue & Assumptions` be split into smaller, more focused modules?**
  _Cohesion score 0.028708133971291867 - nodes in this community are weakly interconnected._