# SmartFlow NLEX — Presenter Script

**A Journey Toward Smarter Traffic Decisions** · Mock Defense and Actual Defense

*SmartFlow NLEX: A Multisource Corridor Analytics and Decision-Intelligence System for Expressway Traffic Management*

## How to use this script

- Estimated length: about 31:05 before Q&A, because the demo explains every card on the Traffic, Incidents and Emissions tabs. No presentation length is documented in the manuscript; if the panel sets a limit, choose cards to skip.
- About 23:55 (77%) goes to the live demonstration, which has exactly one slide (slide 11).
- Presenters: Kiarra, Ysa and Hans. Jertz is not attending and stays on the title slide as a team member.
- Lines that start with a presenter's name are spoken word-for-word. Lines in [brackets] are cues and are never read aloud. "Operator action" lines are for the person at the keyboard.
- Hans operates the laptop while Kiarra or Ysa speaks; Ysa operates while Hans speaks.
- Objective text inside quotation marks is the exact wording of Sections 1.4.1 and 1.4.2. Read it verbatim.
- Demo style: Speak to the whole room, technical and non-technical. On every screen say three things in this order: the question this screen answers, what the audience is looking at, and the decision it helps with. Point at the chart while you say it. Do not read out numbers unless they help the point; a number is never the point.
- Values marked [REHEARSAL: …] change with live data. Read them off the screen on the day, or leave them out.
- Source manuscript: SmartFlow_NLEX_Chapters_1-3_Revised.docx (manuscript-exports/Ch1-3_Revision_2026-10-21, rebuilt 2 Nov 2026).

### Roles

| Presenter | Role | Speaking parts |
|---|---|---|
| Kiarra | Project Manager | Opening, problem, system and team; demo: Login, Overview, Traffic, Live Map, Settings; closing |
| Ysa | Developer | Objectives and how we met them; demo: Incidents, Maintenance, Mobile Control |
| Hans | Lead Developer | Scope and limitations; demo: Emissions, Simulator, Data Management & Audit Log |

Speaking parts are presentation assignments only. They do not indicate who built or tested any feature.

### Timing plan

| Slide | Section | Time | Speaker(s) |
|---|---|---|---|
| 1 | A. Introduction — SmartFlow NLEX (title) | 0:00–0:20 | Kiarra |
| 2 | A. Introduction — Illustrative scenario — Friday, 5:00 PM | 0:20–0:55 | Kiarra |
| 3 | A. Introduction — Two gaps between data and decisions | 0:55–1:40 | Kiarra |
| 4 | A. Introduction — SmartFlow NLEX merges the lanes | 1:40–2:25 | Kiarra |
| 5 | B. Objectives — General objective | 2:25–3:00 | Ysa |
| 6 | B. Objectives — Specific objectives 1–2 | 3:00–3:55 | Ysa |
| 7 | B. Objectives — Specific objectives 3–4 | 3:55–4:25 | Ysa |
| 8 | B. Objectives — How we met each objective | 4:25–5:20 | Ysa |
| 9 | C. Scope and Limitations — Scope — where this route runs | 5:20–5:55 | Hans |
| 10 | C. Scope and Limitations — Limitations — know the road conditions | 5:55–6:30 | Hans |
| 11 | D. Actual System Demonstration | 6:30–30:25 (23:55) | Kiarra, Ysa, Hans |
| 12 | E. Closing — Closing — Friday, 5:00 PM, again | 30:25–31:01 | Kiarra |
| 13 | E. Closing — Thank you — Questions? | 31:01–31:05 | Kiarra |

Approximate spoken words per presenter (~130 words per minute): Kiarra 1553 · Ysa 1141 · Hans 973.

## A. Introduction

### Slide 1 — SmartFlow NLEX (title) · 0:00–0:20

*[Kiarra stands centre. Slide 1 is already showing when the panel is ready.]*

**Kiarra:** Good [morning/afternoon], members of the panel. We are Group 4 of 3ISB, and this is SmartFlow NLEX: A Multisource Corridor Analytics and Decision-Intelligence System for Expressway Traffic Management.

*[Pause]*

**Kiarra:** Let me start with a moment many of us know.

*[Advance slide]*

### Slide 2 — Illustrative scenario — Friday, 5:00 PM · 0:20–0:55

**Kiarra:** Picture this. It is Friday, five in the afternoon, at the start of a long weekend. You are heading north from Balintawak, at kilometre twelve. This is an illustrative scenario, not a recorded event — but it is familiar.

**Kiarra:** Right now, everyone can see the traffic. Navigation apps show red lines.

*[Pause — gesture to the 'In 2 hours' and 'Tomorrow' markers]*

**Kiarra:** But the operator in the control room needs a harder answer. Not "What is happening?" — but "What is likely to happen next, and what should we do before it does?"

*[Advance slide]*

### Slide 3 — Two gaps between data and decisions · 0:55–1:40

**Kiarra:** Behind that question are two gaps.

**Kiarra:** First, the data look backward. Traffic, incident and toll data are shown mainly as summaries of what already happened. There is no forecasting layer to warn about surges from weather, holidays or events.

**Kiarra:** Second, the data travel in separate lanes. Toll records, incident logs, crowdsourced reports, weather and event schedules are kept apart, never combined in one place.

**Kiarra:** And this matters, because NLEX is one road carrying two kinds of trips: goods moving between Metro Manila and the provinces, and the daily commute of workers and students. When the expressway slows, both are delayed together — most of all at rush hour, on long weekends and on holidays.

*[Advance slide]*

### Slide 4 — SmartFlow NLEX merges the lanes · 1:40–2:25

**Kiarra:** So we built SmartFlow NLEX to merge those lanes. It brings six kinds of data into one place — toll, incident, Waze, weather, holiday and event data — and answers four questions. What happened? What is likely next? What should we consider doing? And can we test it before we act?

**Kiarra:** Operators use a desktop dashboard. Commuters use a mobile app. And one rule runs through all of it: the system advises — operators decide.

**Kiarra:** I am Kiarra, the project manager. With me are Ysa, our developer, and Hans, our lead developer. Our quality assurance lead, Jertz, cannot be with us today. Ysa will now show you where this journey is headed.

*[Handoff — Kiarra steps back; Ysa steps forward]*

*[Advance slide]*

## B. Objectives

### Slide 5 — General objective · 2:25–3:00

**Ysa:** Thank you, Kiarra. Every journey needs a destination. Ours is our general objective, which I will read exactly as approved.

*[Read verbatim — do not paraphrase]*

**Ysa:** "The general objective of this capstone project is to develop and evaluate SmartFlow NLEX, a centralized decision-intelligence platform that leverages a 4-year historical NLEX dataset alongside real-time crowdsourced and external data to optimize proactive traffic management and incident response. By reducing traffic congestion, the capstone project proposal will support SDG 9 (Industry, Innovation, and Infrastructure) through lower vehicular carbon emissions."

*[Advance slide]*

### Slide 6 — Specific objectives 1–2 · 3:00–3:55

**Ysa:** To get there, we set four specific objectives. Specific Objective 1:

**Ysa:** "To evaluate response strategies within an Agent-Based Simulation Sandbox in order to minimize expressway downtime and maximize vehicle throughput during incidents or demand surges, providing NLEX management with a risk-free, data-driven environment to test operational decisions before live deployment using a custom HTML5 Canvas-based simulation interface."

**Ysa:** Specific Objective 2:

**Ysa:** "To develop the "SmartFlow NLEX" decision-intelligence system for NLEX operators using a custom-built Next.js and TypeScript web dashboard. This system aims to merge and visualize real-time, multi-source data streams across web and conversational channels. By doing so, we will provide operators with a highly usable, accessible platform that simplifies complex data, streamlines operational decision-making, and ensures widespread user adoption."

*[Advance slide]*

### Slide 7 — Specific objectives 3–4 · 3:55–4:25

**Ysa:** Specific Objective 3:

**Ysa:** "To analyze a 4-year historical NLEX dataset to map and identify recurring systemic inefficiencies and traffic congestion patterns for strategic capacity planning using Python and RStudio."

**Ysa:** Specific Objective 4:

**Ysa:** "To deploy existing multi-source predictive models within the SmartFlow NLEX dashboard that forecast expressway conditions using integrating historical toll records, crowdsourced data, weather inputs, and event schedules using existing machine learning algorithms."

*[Advance slide]*

### Slide 8 — How we met each objective · 4:25–5:20

**Ysa:** Here is how each objective became something you can see — and where you will see it in the demo.

**Ysa:** The general objective became one place that joins all six data sources, with pages that explain the past, forecast the future and suggest responses. You will see it in every tab.

**Ysa:** Objective one became the Simulator: a virtual road where an operator compares a response with doing nothing. Objective two became the dashboard itself — secure sign-in, pages for each role, and a command box you can simply type to.

**Ysa:** Objective three became the Descriptive tabs, built from our analysis of the 2022 to 2025 record. And objective four became the Predictive tabs, where every forecast is tested against a simple rule of thumb before we show it. Hans will tell you the boundaries.

*[Handoff — Ysa steps back; Hans steps forward]*

*[Advance slide]*

## C. Scope and Limitations

### Slide 9 — Scope — where this route runs · 5:20–5:55

**Hans:** Thanks, Ysa. SmartFlow NLEX covers the NLEX main line, from Balintawak at kilometre twelve to Sta. Ines at kilometre eighty-seven — twenty exits, about seventy-six kilometres.

**Hans:** It serves Traffic Control Center operators, incident operators and data analysts on the dashboard, and commuters on the mobile app. It reads toll and incident records from 2022 to 2025, the Waze feed, weather, holidays and an events calendar. And it describes, forecasts, recommends and simulates.

*[Advance slide]*

### Slide 10 — Limitations — know the road conditions · 5:55–6:30

**Hans:** Before we drive, here are the road conditions — the limits to keep in mind during the demo.

**Hans:** The system only advises; it does not control barriers, signs or patrol units. It has not been used in live NLEX operations, so any benefit is estimated from history and simulation. Forecasts and emission figures are estimates, not certainties. And live features need the internet and outside services.

**Hans:** With that, Kiarra will take us into the system.

*[Handoff — Kiarra moves beside the screen; Hans goes to the demo laptop as operator]*

*[Advance slide]*

## D. Actual System Demonstration

### Slide 11 — Actual System Demonstration · 6:30–30:25

*[Slide 11 stays on screen during the lead-in.]*

**Kiarra:** Now let's leave the slides and see it working. We will go tab by tab, the way an operator moves through a shift. For every screen, we will tell you the question it answers and the decision it helps with. Hans is at the keyboard.

*[Switch to live system]*

**Before the defense (checklist):**

- Sign in is part of the demo, so do not sign in beforehand. Use a Data Analyst account: it is the only role that sees every tab, including Emissions, Data Management and Audit Log. Keep the authenticator app ready on Hans's phone.
- Open the dashboard sized to the projector (1920×1080 or 1440×900). Set Settings › Appearance to the Light theme so it matches the slides.
- Warm every tab 15–30 minutes before the defense. The demonstration server is on a free tier and can be slow after a pause; the Live Map needs 20–35 seconds for map tiles the first time.
- Check that the Overview freshness line says "Live", not "Feed stale". If it is stale on the day, say so — do not hide it.
- Descriptive views: set Range to "Custom", 1 Jan 2022 – 31 Dec 2025 (the period the manuscript reports). Do not use "All".
- Data Management: prepare a small sample file in the NLEX export format (for example, a few days of the hourly toll export) and use "Check only", which checks the file without loading it. [REHEARSAL: sample file name.]
- Maintenance and Mobile Control write to the shared system. Prepare the demo text in advance, and after the defense delete the demo maintenance schedule and the demo advisory.
- Rehearsal check: confirm that in the Simulator, "Capture baseline" → Copilot "Apply" → "Play" fills the "Before / after" panel. If the order differs on the day, follow what the screen asks.
- Keep PowerPoint running in Slide Show on slide 11 so Alt+Tab returns to it.

#### Demo 1 — Login · 6:50–7:25 (0:35)

*Speaker: Kiarra · Operator: Hans · Objective: SO 2*

> **Operator action:** Type the Data Analyst email and password, click "Sign In". On "Enter Your Code", type the 6-digit code from the authenticator app (leave "Remember this device for 7 days" unticked), click "Verify".

**Kiarra:** “Every shift starts here. The question this screen answers is simple: is this person allowed in? Signing in takes two steps — a password, and then a six-digit code from an app on the operator's phone. So even if someone learns a password, they still cannot get in.”

**Kiarra:** “What you see after this depends on your job. We are signed in as a data analyst, who sees every tab. Other roles see only the tabs they need.”

#### Demo 2 — Overview · 7:25–8:10 (0:45)

*Speaker: Kiarra · Operator: Hans · Objective: SO 2 · GO*

**Kiarra:** “This is the Overview, and it answers the first question of every shift: how is the expressway right now?”

> **Operator action:** Point at the freshness line under the title, then at the headline card and "Slowest reading on the corridor".

**Kiarra:** “This small line tells you how fresh the information is — here it says Live. Next to it, the system tells you how many exits are congested right now, and where traffic is slowest. You do not have to read a chart; it says it in words.”

> **Operator action:** Scroll down to "Live Corridor Status".

**Kiarra:** “Below, every exit from Balintawak to Sta. Ines is marked congested, slow or clear, each in its own colour. In one look, the operator knows where to pay attention first.”

#### Demo 3 — Traffic › Descriptive · 8:10–11:05 (2:55)

*Speaker: Kiarra · Operator: Hans · Objective: SO 3*

> **Operator action:** Click "Traffic". On "Descriptive", set Range "Custom" (1 Jan 2022 – 31 Dec 2025). Point along the row of summary cards.

**Kiarra:** “Every analytics tab has three parts, shown at the top: what happened, what's next, and what to do. We start with what happened.”

**Kiarra:** “The top row is a quick summary of the period we picked. Total Volume is how many vehicles passed through the NLEX toll plazas. Average Daily Volume is the same thing per day. Peak Hour is the busiest hour on a normal weekday. Busiest Plaza is the toll plaza with the most traffic. And the Congestion Index tells you how bad jams are when they happen, on a scale from one, light, to five, standstill — based on Waze reports.”

> **Operator action:** Point at "Volume Trend".

**Kiarra:** “Volume Trend answers: is traffic going up or down over time? The faint line is each day. The bold line is the seven-day average, which smooths out the daily ups and downs so the direction is easy to see. We can also show one vehicle class, or split northbound and southbound.”

> **Operator action:** Scroll to "Volume by Plaza".

**Kiarra:** “Volume by Plaza answers: which toll plazas carry the most traffic? The longest bars are where extra toll staff matter most. One note: the SCTEX bar counts vehicles entering NLEX from SCTEX — it is not an NLEX exit.”

> **Operator action:** Point at "Holiday Impact vs Normal Days". Then click the "Events" toggle (the title changes to "Arena Event Impact (venue exit entries)"), then back to "Holidays".

**Kiarra:** “This card answers: how different is a holiday from a normal day? Each bar shows how far above or below normal the traffic was, compared with the same weekday in the weeks around it. Switch to Events, and it does the same for event days at the Philippine Arena exit.”

> **Operator action:** Scroll to "Average Volume by Hour and Day".

**Kiarra:** “Average Volume by Hour and Day answers: when is NLEX usually busiest? Each square is one hour of one day of the week. The darker the square, the more vehicles. When the same squares are dark every week, that is a pattern we can plan for, not a surprise.”

> **Operator action:** Point at "Average Speed in Jams by Hour" beside it.

**Kiarra:** “And beside it: when jams happen, how slow are they at each hour of the day? This comes from Waze jam reports, so it shows which hours have the worst jams — not the speed of all traffic.”

#### Demo 4 — Traffic › Predictive · 11:05–13:20 (2:15)

*Speaker: Kiarra · Operator: Hans · Objective: SO 4*

> **Operator action:** Click "Predictive". Point at "Traffic Volume Walk-Forward Forecast".

**Kiarra:** “Now, what's next. The first card answers: how many vehicles should we expect in the coming weeks? The chart has three parts. On the left is the past the model learned from. In the middle is a test period, where we check its forecast against what really happened. On the right is the future.”

**Kiarra:** “We tried five forecasting methods — these buttons. The one selected first did best in the test, and it had to beat a simple rule of thumb: "next week will look like last week."”

> **Operator action:** Click "View" on the "Validation evidence" strip. Close it after the next line.

**Kiarra:** “This box is the proof: which method won, when it was tested, and how far off it usually is. That tells the operator how much to trust the forecast.”

> **Operator action:** Set View to "Daily". Click a day inside the short dashed 48-hour line [REHEARSAL: pick that day]. After the next line, click "← Back to daily".

**Kiarra:** “Clicking a day breaks it down hour by hour. The black line is what really happened. The dashed line is a second, hour-by-hour forecast made just for the next two days.”

> **Operator action:** Scroll to "Predictive Congestion State Map". Set Range to "Next 24 h".

**Kiarra:** “The Predictive Congestion State Map answers: which exits are likely to have a jam, and at what hour? Each row is an exit and each column is an hour ahead. The colour says moving, heavy or severe. It updates every hour and can look up to seven days ahead, and the list beside it names the stretches to act on.”

> **Operator action:** Scroll to "Event Surge Impact by Exit". Open the "Showing" selector to show the choices, then close it.

**Kiarra:** “Event Surge Impact by Exit answers: when there is an event at the Philippine Arena, which exits get the extra traffic, and how much? The longer the bar, the more extra vehicles per day. We can look at past events, or choose an upcoming event date.”

#### Demo 5 — Traffic › Prescriptive · 13:20–14:50 (1:30)

*Speaker: Kiarra · Operator: Hans · Objective: GO · SO 2*

> **Operator action:** Click "Prescriptive". Point at "Staffing Priority". Switch "Week ahead" to "Hour by hour" and back.

**Kiarra:** “And finally, what to do. Staffing Priority answers: where and when will traffic go above normal this week, so we can add toll staff? It compares the forecast with each plaza's usual level, names the plaza and hour to staff first, and says how sure it is. We can see the whole week, or hour by hour.”

> **Operator action:** Point at "Congestion Response Advisory".

**Kiarra:** “The Congestion Response Advisory answers: in the next twelve hours, which stretches need action? "Act" means prepare a counter-flow plan, send an advisory to the mobile app and alert the control room before the jam is expected. "Monitor" means keep watching. It also shows how often its past "Act" calls turned out right — so the operator knows how much weight to give it.”

> **Operator action:** Point at "Event Intervention Ranking".

**Kiarra:** “Event Intervention Ranking answers: on an event day, which exits should get patrols and advisories first? It ranks the exits by the extra traffic we are most confident about, so the top of the list is the safest place to start. All of these are suggestions — the operator decides. Ysa?”

*[Handoff — Ysa speaks; Hans stays at the keyboard]*

#### Demo 6 — Incidents › Descriptive · 14:50–17:25 (2:35)

*Speaker: Ysa · Operator: Hans · Objective: SO 3*

> **Operator action:** Click "Incidents". On "Descriptive", set Range "Custom" (1 Jan 2022 – 31 Dec 2025). Point along the summary cards.

**Ysa:** “Thank you, Kiarra. Incidents follow the same three steps, starting with what happened.”

**Ysa:** “The top row summarises the period. Total Incidents counts accidents and breakdowns. Injuries counts people hurt. Average Response Time is how long breakdowns waited for a response, from the dispatch log. Average Time to Clear is how long it took until the road was clear. Top Hotspot is the five-kilometre stretch with the most incidents. And Crash Rate in Rain tells us how many times more crashes happen when it rains, compared with the same hours when it is dry.”

> **Operator action:** Point at "Incident Trend".

**Ysa:** “Incident Trend answers: are incidents going up or down? Accidents are on top and breakdowns below. Each has its own scale, so compare the shapes, not the heights.”

> **Operator action:** Scroll to "Hotspots by Km Segment".

**Ysa:** “Hotspots by Km Segment answers: where on the expressway do incidents happen most? Each bar is a stretch of road, named after its nearest exit.”

> **Operator action:** Point at the causes card; click "Accident causes", "Breakdown causes", then "Types".

**Ysa:** “This card answers: why do they happen? We can switch between the top causes of accidents, the top causes of breakdowns, and the types of accidents.”

> **Operator action:** Scroll to "Dry vs Wet: Incidents per Day".

**Ysa:** “Dry versus Wet answers: does rain make things worse? It compares incidents per day in dry and in wet weather, adjusted for how many hours were actually wet — so it is a fair comparison.”

> **Operator action:** Point at "Incidents by Hour and Day". Click one dark square.

**Ysa:** “Incidents by Hour and Day answers: at what time do incidents usually happen? Darker squares mean more incidents. Clicking a square shows how many were accidents and how many were breakdowns.”

> **Operator action:** Scroll to "Response Time Breakdown". Switch the group from "By Cause" to "By Service".

**Ysa:** “And Response Time Breakdown answers: which kinds of breakdowns, or which response services, take the longest? We can group by cause or by service, and show the typical response time or the time spent on scene. Longer bars point to where response can improve.”

#### Demo 7 — Incidents › Predictive · 17:25–18:50 (1:25)

*Speaker: Ysa · Operator: Hans · Objective: SO 4*

> **Operator action:** Click "Predictive". Point at "Incident Walk-Forward Forecast".

**Ysa:** “Next, what's likely. The Incident Walk-Forward Forecast answers: how many incidents should we prepare for each day? It reads the same way as the traffic forecast — past, test, future — and it was tested against the same kind of simple rule of thumb before we show it. The evidence box shows that test.”

> **Operator action:** Scroll to "Predicted Incident Hotspots". Keep Horizon at "7d".

**Ysa:** “Predicted Incident Hotspots answers: which exits are likely to have the most incidents in the coming days? The colours rank the exits against each other: High means the top quarter for this period. Grey means there is no history there — unknown, not safe. The first day is the most reliable; later days show the general shape.”

> **Operator action:** Scroll to "Expected Breakdown Response Time". Pick a Day and a Time.

**Ysa:** “And Expected Breakdown Response Time answers: at this day and time, how long does a breakdown response usually take, for each cause or service? It is based on past dispatches at the same time, so the operator can see when response tends to be slow.”

#### Demo 8 — Incidents › Prescriptive · 18:50–20:05 (1:15)

*Speaker: Ysa · Operator: Hans · Objective: GO*

> **Operator action:** Click "Prescriptive". Point at "Resource Staging & Patrol Repositioning".

**Ysa:** “And what to do. Resource Staging answers: where should response units wait? It lists the exits in order — put the first unit here, the second there — and shows how many of the expected incidents three or five units would cover.”

> **Operator action:** Scroll to "Patrol Alert Schedule".

**Ysa:** “The Patrol Alert Schedule answers: at which hours of the week should patrols be on alert? The outlined hours are the ones that have clearly been busier than normal for that day, based on past incidents.”

> **Operator action:** Scroll to "Clearance Response Protocol". Keep Accident and Injury selected.

**Ysa:** “And the Clearance Response Protocol answers: when should a slow incident be escalated? It gives a simple rule — if it is not cleared by this many minutes, there is this much chance it will run much longer, so escalate. The curve shows how many incidents are still not cleared as the minutes pass. Hans will show what all this means for the environment.”

*[Handoff — Hans speaks; Ysa takes the keyboard]*

#### Demo 9 — Emissions › Descriptive · 20:05–22:20 (2:15)

*Speaker: Hans · Operator: Ysa · Objective: GO*

> **Operator action:** Click "Emissions". On "Descriptive", set Range "Custom" (1 Jan 2022 – 31 Dec 2025). Point along the summary cards.

**Hans:** “Thanks, Ysa. Our general objective connects traffic to carbon emissions. One thing first: these are estimates. We calculate them from the distance each toll trip travelled — we do not measure them at the roadside.”

**Hans:** “The top row: Total CO₂ is the estimated carbon dioxide from all trips in the period. Average Daily CO₂ is the same per day. Heavy-Vehicle Impact compares the share of CO₂ from heavy vehicles — Class 2 and 3 — with their share of the distance driven. Peak Emission Hour is the hour with the most CO₂. Delay-Induced CO₂ is the extra CO₂ from vehicles idling behind lane-blocking accidents. And Estimated Air Quality comes from a weather service's model — it covers all sources, not just NLEX.”

> **Operator action:** Point at "CO₂ Emissions Trend by Vehicle Class".

**Hans:** “The trend answers: is CO₂ going up or down, and which vehicle class is it coming from?”

> **Operator action:** Scroll to "When Emissions Happen"; switch "By hour" to "By day" and back.

**Hans:** “When Emissions Happen answers: at which hours, or on which days, is the most CO₂ produced — and are weekdays different from weekends?”

> **Operator action:** Point at "Fleet Mix vs Pollution Load".

**Hans:** “Fleet Mix versus Pollution Load answers: does a vehicle class pollute more than its share of the traffic? It compares each class's share of vehicles with its share of CO₂ and other pollutants.”

> **Operator action:** Point at "Heavy-Vehicle Share of CO₂", then "Estimated Air Quality by Month".

**Hans:** “Heavy-Vehicle Share answers: over time, how much of the CO₂ comes from heavy vehicles? And Air Quality by Month answers: in each month, how often was the estimated air quality good, fair or worse?”

> **Operator action:** Scroll to "CO₂ by Hour and Weekday".

**Hans:** “Finally, this grid answers: in a typical week, which hours produce the most CO₂? Darker squares mean more.”

#### Demo 10 — Emissions › Predictive · 22:20–23:20 (1:00)

*Speaker: Hans · Operator: Ysa · Objective: SO 4*

> **Operator action:** Click "Predictive". Point at "Corridor CO₂ Walk-Forward Forecast". Click "View" on "Validation evidence", then close.

**Hans:** “The CO₂ forecast answers: how much CO₂ should we expect in the coming days? We compared four methods, and the evidence box shows how each one did in the test. We trust it up to seven days ahead; beyond that, the chart shows a warning.”

> **Operator action:** Scroll to "Forecasted Fleet Composition".

**Hans:** “Forecasted Fleet Composition answers: what share of the traffic will be heavy vehicles, Class 2 and 3? The solid part is what we observed, and the paler part is the forecast. If a jump in heavy vehicles is expected, a warning appears — useful, because the largest trucks, Class 3, produce about four times the CO₂ of a car for the same distance.”

#### Demo 11 — Emissions › Prescriptive · 23:20–24:40 (1:20)

*Speaker: Hans · Operator: Ysa · Objective: GO*

> **Operator action:** Click "Prescriptive". Point at the recommendation card.

**Hans:** “And what to do. The main recommendation answers: what is the most practical way to cut CO₂ from incidents? Clear lane blockages as fast as the quickest ten percent of similar cases. The card estimates how much CO₂ that would have saved, looking back, and how much it could save in the coming days — where, when, and where to start. It is a what-if estimate, not a measured saving.”

> **Operator action:** Open "Why Class 3". Then point at the "Advise Class 3 to avoid …" card and the tolling card below it (if shown).

**Hans:** “"Why Class 3" explains why large trucks are the focus: they produce the most CO₂ for every kilometre. The truck advisory answers: which hours should large trucks avoid? Those are the hours expected to be most congested, with the hours they could move to. And the tolling card answers: if a truck surcharge were considered, at which few exits and hours would it matter most. It says where — not how much to charge — and it claims no saving. Kiarra?”

*[Handoff — Kiarra speaks; Hans takes the keyboard]*

#### Demo 12 — Live Map · 24:40–25:30 (0:50)

*Speaker: Kiarra · Operator: Hans · Objective: SO 2 · SO 4*

> **Operator action:** Click "Live Map". Wait for both maps to draw (up to 30 seconds the first time).

**Kiarra:** “The Live Map answers: where is the trouble now, and where will it be? On the left is today, live: jams and alerts reported by drivers on Waze, refreshed about every two minutes. On the right is the forecast for the same road.”

> **Operator action:** On the timeline under the maps, click "Next 24 h". Use "Jump to exit…" to pick the exit the Overview showed as slowest.

**Kiarra:** “With the timeline, the operator moves forward in time and sees traffic that has not happened yet. The percentage beside the forecast shows how closely the model followed past traffic — think of it as a match score, not a guarantee. Ysa?”

*[Handoff — Ysa speaks; Hans stays at the keyboard]*

#### Demo 13 — Maintenance · 25:30–26:20 (0:50)

*Speaker: Ysa · Operator: Hans · Objective: SO 2*

> **Operator action:** Click "Maintenance". Point at the cards "Active Now", "Starting Soon", "Conflicts" and "Next Up".

**Ysa:** “Road works are one of the few causes of congestion the operator can plan. This page answers: what work is happening, what is coming up, and does any of it clash?”

> **Operator action:** Click "Schedule Maintenance". Enter the prepared title, Direction SB, Start Km 20, End Km 21, one lane closed, and a start and end time. Point at the quiet-window hint.

**Ysa:** “When we schedule new work, the system suggests the quietest window for that stretch, based on past traffic, and warns us if it overlaps other work. That way, the lane closure hurts as few drivers as possible.”

> **Operator action:** Click "Schedule maintenance".

**Ysa:** “Once saved, the schedule also reaches drivers through the mobile app — which brings us to the next tab.”

#### Demo 14 — Mobile Control · 26:20–27:05 (0:45)

*Speaker: Ysa · Operator: Hans · Objective: SO 2*

> **Operator action:** Click "Mobile App". Point at a tab's section toggles and at the "Preview" phone.

**Ysa:** “This is the Mobile Control Centre. It answers: what do drivers see on their phones? Each part of the app can be switched on or off here, and the phone on the right previews the result.”

> **Operator action:** Advisories strip → "Manage" → "Add advisory". Paste the prepared message, Tone "Warning", tick "Publish", click "Save & publish".

**Ysa:** “And we can publish an advisory — here, a warning about the lane works we just scheduled. Drivers get it without downloading a new version of the app. Hans will now show how operators can test a decision before making it.”

*[Handoff — Hans speaks; Ysa takes the keyboard]*

#### Demo 15 — Simulator (Scenario Sandbox) · 27:05–28:55 (1:50)

*Speaker: Hans · Operator: Ysa · Objective: SO 1*

> **Operator action:** Click "Scenario Sandbox". Set "Carriageway" to "SB". In Simulation Controls › Corridor, choose "Km range", From km 19 to To km 23, click "Set a km range".

**Hans:** “This is our simulator, and it answers the most important question of all: what happens if we try this — before we try it for real?”

**Hans:** “Every moving dot is a car. Each one keeps a safe distance and changes lanes like a real driver, and the number of cars coming in is based on our real traffic data.”

> **Operator action:** Click "Play", set speed "10×", let it run about 10 seconds, then click "Capture baseline".

**Hans:** “First we let traffic run normally and save it. That is our "do nothing" picture, so we have something to compare against.”

> **Operator action:** Open the "Command" tab. Type: isara lane 4 southbound mula Km 20.1 hanggang 20.4 — click "Execute Command". When the plan appears, click "Apply".

**Hans:** “Now the test. Instead of clicking menus, the operator can simply type an instruction — in English, Filipino or Taglish. I typed, in Filipino, "close lane four southbound from kilometre 20.1 to 20.4". The system shows what it understood and waits for us to approve it. Nothing changes until the operator says yes.”

> **Operator action:** Click "Play" (10×). Let it run 20–30 seconds. Point at the queue at the closure, then at the "Before / after" panel.

**Hans:** “Watch the cars squeeze out of the closed lane, and the line grow behind it. This panel puts the two pictures side by side: how fast cars move, how many get through, how long the line gets, and the CO₂. So before a single cone goes on the road, the operator can see the likely cost — and try a different stretch or a different time instead.”

*[Optional, only if on time: Confidence run — set Runs to 5, click "Run"]*

**Hans:** “[Optional] One run could be lucky, so the simulator can repeat the test several times and show a range we can be confident in.”

#### Demo 16 — Data Management & Audit Log · 28:55–29:55 (1:00)

*Speaker: Hans · Operator: Ysa · Objective: GO · SO 2*

> **Operator action:** Click "Data Management". Click "Select File", choose the prepared sample file, then "Check only".

**Hans:** “Everything you have seen depends on good data, so this page answers: how does new NLEX data get in — safely? The analyst uploads the latest export. Here I chose "Check only": the system checks every row without loading anything.”

> **Operator action:** Point at "Rows in the file", "Set aside" and "ETL Validation Gates"; then scroll to "Weekly model retraining".

**Hans:** “It tells us how many rows are fine and how many were set aside, and why — a wrong plaza name, a missing date. Bad rows never reach the charts. And every week the forecasts are retrained on the new data, but a new version is only used if it passes our accuracy check.”

> **Operator action:** Click "Audit Log". Point at the insight cards, then the table.

**Hans:** “Finally, the Audit Log answers: who did what, and when? Every sign-in, upload, schedule change and model update is recorded. Kiarra will close the shift.”

*[Handoff — Kiarra speaks; Hans takes the keyboard]*

#### Demo 17 — Settings · 29:55–30:25 (0:30)

*Speaker: Kiarra · Operator: Hans · Objective: SO 2*

> **Operator action:** Click "Settings". Point at "Sign out after inactivity", then "This device" and "Appearance".

**Kiarra:** “Last, Settings. It answers: how do I keep my account safe? The operator chooses how soon an idle screen signs itself out, can make the system forget this computer, and can switch between light and dark themes for long shifts.”

> **Operator action:** Click "Log out", then "Log out" in the "Log out of SmartFlow?" dialog.

**Kiarra:** “And that is the end of the shift.”

*[Return to PowerPoint — Hans presses Alt+Tab to the slideshow and advances to slide 12]*

**If something fails during the demo:**

- A tab loads slowly: keep talking about what it will show ("While this loads, this screen answers…"). After 20 seconds, move on and come back if time allows.
- The live feed is stale or the internet drops: say plainly that live features depend on the Waze feed and the connection — a limitation we stated — and continue with the history tabs, which read from our own database.
- The plain-language report or the Copilot is slow or fails: say these use an outside language-model service. Make the same change with the manual controls (Close a lane → Set stretch).
- Someone asks for a number that is not on screen: "We would rather not quote that from memory — we can show it in the system or in the manuscript."

## E. Closing

### Slide 12 — Closing — Friday, 5:00 PM, again · 30:25–31:01

**Kiarra:** Let's go back to Friday, five o'clock, at Balintawak.

**Kiarra:** Before, the only question anyone could answer was: what is happening right now? With SmartFlow NLEX, an operator can also ask: what is likely next, how reliable is that estimate, and what could we test before we act?

**Kiarra:** Our contribution: six data sources in one corridor warehouse; every forecast shown with how well it was tested; and recommendations, with a safe place to try them first.

*[Pause]*

**Kiarra:** Because on an expressway, the best time to manage a queue is before it forms.

*[Advance slide]*

### Slide 13 — Thank you — Questions? · 31:01–31:05

**Kiarra:** Thank you. We would be glad to take your questions.

*[Kiarra, Ysa and Hans stand in line. Keep the live system one Alt+Tab away for questions.]*

## Placeholders to resolve before rehearsal

- [morning/afternoon] in Kiarra's opening line.
- Defense duration: the full walkthrough of every analytics card makes the talk about 31:05 (demo 23:55, about 77%). If the panel sets a shorter limit, tell the team which cards to skip on the day.
- [REHEARSAL: …] notes in the demo mark live values. They change with the data; read them off the screen, or leave them out — the script works without them.
- [REHEARSAL: sample file name] for the Data Management check.
- Usability-test and KPI results are not in the current manuscript (results belong in Chapter 4), so the script quotes none.

## Source discrepancies to know before the defense

- SO 3 says "using Python and RStudio"; no R code exists in the repository (Pending Decisions A4). The objective is shown verbatim, and the "How we met each objective" slide says Python only; be ready for the question.
- The general objective says the project will support SDG 9 "by reducing traffic congestion"; the system is not deployed in live operations, so reductions are estimated, not observed (Limitation: Deployment and Evaluation Scope). The script never claims an observed reduction.
- Mobile app, Dashboard tab: the "Traffic Forecast" card shows delay and travel time, but the manuscript says travel-time estimates are not part of the current version (Section 3.8e, Limitation: AI Knowledge Domain Restriction). The demo does not open the phone app; if the panel asks to see it, use the Corridor tab, and fix the app or the manuscript before the defense.
- Scenario Sandbox: the manuscript lists travel time among the outputs (FR-06, Section 3.8f); the sandbox shows avg speed, throughput, longest queue and CO₂ rate, but no travel time. The script names only the outputs that exist.
- Live Map: the "% accurate" and "ML Confidence" figures are the model's R², not an accuracy measure. Kiarra describes it as a match score with past traffic, not a guarantee.
- Event Surge Impact by Exit: the weekly batch overwrote the event-surge table with the old circular method on 1 Nov (Code Fix List A22). The demo explains what the card is for and quotes no number; check before the defense that its values come from the calendar-based method.
- Date range: the warehouse has records after 31 Dec 2025, but the manuscript reports the NLEX record as Jan 2022 – Dec 2025. The demo sets Custom ranges ending 31 Dec 2025 on descriptive views. Forecast charts may still show 2026 dates as the 'present'.
- Mobile Control Centre: the "Corridor outlook" switch has no effect in the app, and saving needs only a signed-in user (Code Fix List A23). The demo does not use that switch.
- Open code fixes (Code Fix List A1, A3–A18, A22–A29) mean some live screens may differ from Chapter 3 (for example, the "12-hour horizon" wording on the Congestion Response Advisory). Rehearse on the build you will defend with.
- Dashboard changed on 3 Nov (commit 873bcd2): Traffic › Prescriptive now shows "Staffing Priority" (where and when traffic goes above normal) instead of booth counts, and Emissions › Prescriptive no longer ranks emission strategies (TOPSIS removed). FR-07 in the manuscript still says the system recommends toll booths to staff and ranked emission strategies. Align the manuscript or be ready to explain.
- Incidents › Avg Response Time: the KPI tooltip calls it "reported → first responder dispatched", but the Response Time Breakdown card describes the same field as dispatch → arrival. The script says only "how long breakdowns waited for a response, from the dispatch log". Confirm which is right.
- Emissions › Fleet Mix vs Pollution Load: the bar labelled NOx is computed from the NO₂ emission factor. The script says "other pollutants" only.
- Emissions › Estimated Air Quality by Month: the weather service's levels shift sharply between March and April 2025; avoid comparing months across that change.
