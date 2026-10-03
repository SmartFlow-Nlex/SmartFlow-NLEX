# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Staff at NLEX (North Luzon Expressway) operating the corridor from Balintawak (Km 12) to Sta. Ines (Km 88.25). Three roles exist in the product today, enforced by `Front-End-Dashboard/lib/auth-access.ts`:

- **TCC operator** (Traffic Control Center): watches the corridor, anticipates congestion, publishes advisories.
- **Incident operator**: plans and coordinates response to crashes, breakdowns and roadworks.
- **Data analyst**: the widest access; reviews models, data quality, uploads, audit history.

The product is also a capstone project (CP-Grp4), but design decisions serve the operators first.

## Product Purpose

SmartFlow NLEX tells operators what the corridor is doing, what it is about to do, and what to do about it: descriptive, predictive and prescriptive analytics for traffic, incidents and emissions, per exit and per hour. Success is an operator acting earlier and with more confidence than live monitoring alone allows, without being misled by a number the system cannot back up.

## Positioning

- **Forecast, not just live.** Predicts congestion, incidents, volume and emissions per exit and hour ahead, out to seven days, and prescribes actions, rather than only mirroring current conditions.
- **Honest validation.** Every model states how it was tested, its real accuracy against simple baselines, its uncertainty, and its live track record once served forecasts are scored against what happened.
- **Fused data for one corridor.** Live Waze jams, four years of Waze history, toll volumes, incident logs, weather and events, joined in one warehouse and one view.
- **Connects to drivers.** Operators publish advisories and control what the companion mobile app (repo `SmartFlow-NLEX/Main-Mobile`) shows commuters, via `/api/mobile-config`.

## Operating Context

- Dashboard: Next.js app in `Front-End-Dashboard/` (also packaged as an Electron desktop build); backend: Express + TypeScript in `Back-End/`; data: AWS RDS PostgreSQL with a bronze/silver/gold medallion warehouse; auth: Supabase sessions with role-based route access.
- Areas: Overview, Traffic, Incidents, Emissions (analytics); Live Map with live-vs-forecast comparison, Maintenance scheduler, Mobile App control centre (operations); Scenario Sandbox (planning); Data Management and Audit Log (admin).
- Models are retrained by an hourly scheduled refresh; served congestion forecasts are archived and scored against outcomes (`gold.ml_congestion_forecast_log`).
- Corridor positions use NLEX km posts (Balintawak Km 12 to Sta. Ines Km 88.25), northbound up the posts, southbound down.

## Capabilities and Constraints

- **Never fabricate data.** No invented metrics, accuracies, testimonials or mock data presented as real. Mock or illustrative content must be labelled as such (the emissions "Strategy X/Y/Z" panel is the standing example).
- **Shared live database.** One AWS warehouse that four teammates' scripts also write to; no destructive or schema-breaking change without coordination. Dependent views exist that other people own.
- Data gaps are real and must be shown, not smoothed: Waze history covers Jan 2022 – Apr 2026 with holes (19 Dec 2025 – 2 Jan 2026, 20 Apr – 3 Aug 2026); live Waze from 4 Aug 2026; toll volume 2022–2025; SCTEX has no toll volume.
- Undecided: primary device class (desktop vs mobile web) and a formal accessibility standard were not confirmed; do not assume either.

## Evidence on Hand

- Real model evaluation: per-model leaderboards, held-out test windows, calibration tables and live forecast scoring stored in the warehouse (`gold.ml_model_metrics`, `gold.ml_congestion_eval`, `gold.v_congestion_forecast_score`).
- Real corridor geometry, exit list with km posts and access, and four years of jam history.
- No customer testimonials, adoption figures, press or deployment claims exist; none may be invented.

## Product Principles

1. **Earn trust before asking for action.** A forecast is shown with how sure it is and how it was checked; a confident colour never outruns the evidence behind it.
2. **Specific beats general.** Name the exit, the hour, the carriageway, the queue length and the minutes lost; a whole-segment colour or a corridor average is a fallback, not the answer.
3. **Gaps are information.** Missing, stale or uncollected data is stated plainly, never filled with a plausible-looking default.
4. **One truth across views.** The card, the map, the list and the mobile app apply the same rule to the same data and cannot disagree.
5. **From insight to action.** Every analysis should point to what an operator can do next: deploy, advise, schedule, or wait.
