# SmartFlow NLEX — Live Demo Run Sheet

Slide 11 (Actual System Demonstration) · 6:30–30:25 (23:55, about 77%) of an estimated 31:05 talk. Hans operates the laptop while Kiarra or Ysa speaks; Ysa operates while Hans speaks.

| # | Clock | Duration | Speaker | Operator | Screen | Action | Purpose (the question it answers) |
|---|---|---|---|---|---|---|---|
| 0 | 6:30 | 0:20 | Kiarra | — | Slide 11 | Lead-in, then switch to the live system | Set up the tab-by-tab tour |
| 1 | 6:50–7:25 | 0:35 | Kiarra | Hans | Login | Email + Password → "Sign In" → "Enter Your Code" → "Verify" | Show that only the right people get in |
| 2 | 7:25–8:10 | 0:45 | Kiarra | Hans | Overview | Point at the freshness line, the headline card and "Slowest reading on the corridor"; scroll to "Live Corridor Status" | Answer "What is happening right now?" at a glance |
| 3 | 8:10–11:05 | 2:55 | Kiarra | Hans | Traffic › Descriptive | Sidebar → Traffic; "Descriptive"; Range "Custom" (1 Jan 2022 – 31 Dec 2025); KPI row → Volume Trend → Volume by Plaza → Holiday/Event card → Average Volume by Hour and Day → Average Speed in Jams by Hour | What happened: the traffic patterns that repeat |
| 4 | 11:05–13:20 | 2:15 | Kiarra | Hans | Traffic › Predictive | "Predictive"; Traffic Volume Walk-Forward Forecast → "Validation evidence" View → View "Daily" → click a day → "← Back to daily"; Predictive Congestion State Map; Event Surge Impact by Exit | What's next: expected traffic, likely jams, event surges — and how far to trust them |
| 5 | 13:20–14:50 | 1:30 | Kiarra | Hans | Traffic › Prescriptive | "Prescriptive"; Staffing Priority (Week ahead / Hour by hour) → Congestion Response Advisory → Event Intervention Ranking | What to do: staff, respond and deploy ahead of demand |
| 6 | 14:50–17:25 | 2:35 | Ysa | Hans | Incidents › Descriptive | Sidebar → Incidents; "Descriptive"; Range "Custom" (1 Jan 2022 – 31 Dec 2025); KPI row → Incident Trend → Hotspots by Km Segment → causes card → Dry vs Wet → Incidents by Hour and Day → Response Time Breakdown | What happened: where, when and why incidents occur |
| 7 | 17:25–18:50 | 1:25 | Ysa | Hans | Incidents › Predictive | "Predictive"; Incident Walk-Forward Forecast → "Validation evidence" View; Predicted Incident Hotspots (Horizon "7d"); Expected Breakdown Response Time (Day, Time) | What's next: how many incidents, where, and how long response may take |
| 8 | 18:50–20:05 | 1:15 | Ysa | Hans | Incidents › Prescriptive | "Prescriptive"; Resource Staging & Patrol Repositioning → Patrol Alert Schedule → Clearance Response Protocol (Accident · Injury · All weather) | What to do: place units, time patrols, know when to escalate |
| 9 | 20:05–22:20 | 2:15 | Hans | Ysa | Emissions › Descriptive | Sidebar → Emissions; "Descriptive"; Range "Custom" (1 Jan 2022 – 31 Dec 2025); KPI row → CO₂ Trend by Vehicle Class → When Emissions Happen → Fleet Mix vs Pollution Load → Heavy-Vehicle Share of CO₂ → Estimated Air Quality by Month → CO₂ by Hour and Weekday | What happened: how much CO₂, from which vehicles, at what time |
| 10 | 22:20–23:20 | 1:00 | Hans | Ysa | Emissions › Predictive | "Predictive"; Corridor CO₂ Walk-Forward Forecast → "Validation evidence" View; Forecasted Fleet Composition | What's next: expected CO₂ and the expected mix of vehicles |
| 11 | 23:20–24:40 | 1:20 | Hans | Ysa | Emissions › Prescriptive | "Prescriptive"; recommendation card ("Clear blockages as fast as the fastest 10% of comparable ones") → "Why Class 3" → Class 3 window advisory → Tolling recommendation | What to do: practical ways to cut CO₂ |
| 12 | 24:40–25:30 | 0:50 | Kiarra | Hans | Live Map | Sidebar → Live Map; compare "Waze Real-Time Traffic" with "Forecasted Traffic"; timeline "Next 24 h"; "Jump to exit…" | Put now and next side by side on a map |
| 13 | 25:30–26:20 | 0:50 | Ysa | Hans | Maintenance | Sidebar → Maintenance; KPI cards; "Schedule Maintenance"; fill Title, Direction, Start Km, End Km, Lanes closed, Starts/Ends; read the quiet-window hint; "Schedule maintenance" | Plan road works at the quietest time |
| 14 | 26:20–27:05 | 0:45 | Ysa | Hans | Mobile Control | Sidebar → Mobile App ("Mobile Control Centre"); section toggles + "Preview"; Advisories → "Manage" → "Add advisory" → Tone "Warning" → tick "Publish" → "Save & publish" | Control what commuters see, without an app update |
| 15 | 27:05–28:55 | 1:50 | Hans | Ysa | Simulator (Scenario Sandbox) | Sidebar → Scenario Sandbox; Carriageway "SB"; Km range ~19–23 → "Set a km range"; "Play" 10× → "Capture baseline"; "Command" → type closure → "Execute Command" → "Apply"; "Play"; read "Before / after" | Try a lane closure on a virtual road before doing it for real |
| 16 | 28:55–29:55 | 1:00 | Hans | Ysa | Data Management & Audit Log | Sidebar → Data Management; "Select File" (sample) → "Check only"; read "Rows in the file", "Set aside", "ETL Validation Gates"; "Weekly model retraining"; Sidebar → Audit Log; insight cards; table | Show how new data gets in safely, and that every action is recorded |
| 17 | 29:55–30:25 | 0:30 | Kiarra | Hans | Settings | Sidebar → Settings; "Sign out after inactivity"; "This device"; "Appearance"; "Log out" → "Log out of SmartFlow?" → "Log out" | Show personal safety settings and end the shift |
| — | 30:25 | — | Kiarra | Hans | PowerPoint slide 12 | Return to PowerPoint | Close the story |

**Total demo time:** 0:20 lead-in + 23:35 of tabs = 23:55

## Pre-flight checklist

- [ ] Sign in is part of the demo, so do not sign in beforehand. Use a Data Analyst account: it is the only role that sees every tab, including Emissions, Data Management and Audit Log. Keep the authenticator app ready on Hans's phone.
- [ ] Open the dashboard sized to the projector (1920×1080 or 1440×900). Set Settings › Appearance to the Light theme so it matches the slides.
- [ ] Warm every tab 15–30 minutes before the defense. The demonstration server is on a free tier and can be slow after a pause; the Live Map needs 20–35 seconds for map tiles the first time.
- [ ] Check that the Overview freshness line says "Live", not "Feed stale". If it is stale on the day, say so — do not hide it.
- [ ] Descriptive views: set Range to "Custom", 1 Jan 2022 – 31 Dec 2025 (the period the manuscript reports). Do not use "All".
- [ ] Data Management: prepare a small sample file in the NLEX export format (for example, a few days of the hourly toll export) and use "Check only", which checks the file without loading it. [REHEARSAL: sample file name.]
- [ ] Maintenance and Mobile Control write to the shared system. Prepare the demo text in advance, and after the defense delete the demo maintenance schedule and the demo advisory.
- [ ] Rehearsal check: confirm that in the Simulator, "Capture baseline" → Copilot "Apply" → "Play" fills the "Before / after" panel. If the order differs on the day, follow what the screen asks.
- [ ] Keep PowerPoint running in Slide Show on slide 11 so Alt+Tab returns to it.

## Time checks

Whoever is neither speaking nor operating gives a hand signal at 14:50 (should be starting Incidents), 24:40 (should be starting Live Map) and 27:05 (should be starting the Simulator). Lines marked Optional are not counted in the timing. If behind at the Simulator, skip the Confidence run; if behind at Data Management, show only the Audit Log table.

## Fallbacks

- A tab loads slowly: keep talking about what it will show ("While this loads, this screen answers…"). After 20 seconds, move on and come back if time allows.
- The live feed is stale or the internet drops: say plainly that live features depend on the Waze feed and the connection — a limitation we stated — and continue with the history tabs, which read from our own database.
- The plain-language report or the Copilot is slow or fails: say these use an outside language-model service. Make the same change with the manual controls (Close a lane → Set stretch).
- Someone asks for a number that is not on screen: "We would rather not quote that from memory — we can show it in the system or in the manuscript."

## Rehearsal placeholders

- [morning/afternoon] in Kiarra's opening line.
- Defense duration: the full walkthrough of every analytics card makes the talk about 31:05 (demo 23:55, about 77%). If the panel sets a shorter limit, tell the team which cards to skip on the day.
- [REHEARSAL: …] notes in the demo mark live values. They change with the data; read them off the screen, or leave them out — the script works without them.
- [REHEARSAL: sample file name] for the Data Management check.
- Usability-test and KPI results are not in the current manuscript (results belong in Chapter 4), so the script quotes none.
