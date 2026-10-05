---
version: 1
slug: "front-end-dashboard-app-dashboard-page-tsx"
primary_target: "Front-End-Dashboard/app/dashboard/page.tsx"
related_targets: ["Front-End-Dashboard/app/dashboard/layout.tsx","Front-End-Dashboard/app/globals.css","Front-End-Dashboard/app/page.tsx"]
---

# Surface brief: SmartFlow NLEX dashboard (all pages), Night Corridor redesign

Scope: the whole Front-End-Dashboard, every route and every Descriptive / Predictive / Prescriptive tab, plus sign-in. Operate mode for the dashboard; sign-in is the one cinematic page. Source brief: REDESIGN_PROMPT.md (4 Oct 2026), which pins the world in full and replaces the Lane Signal direction; the user asked for no checkpoint stops ("don't ask any questions just go until you accomplish").

Audience and job: TCC operators (night shifts, dim control room), incident operators, data analysts. Read corridor state and forecasts per exit and hour, decide what to do.

Constraints: design, layout and copy only (copy rules in the brief); never change API calls, data shaping, the 50% shown-state rule, role access, audit logging, the logout order, maintenance form behaviour or Back-End; never fabricate data; three road states plus no data; one accent per page; keep the light theme; feature inventory in REDESIGN_INVENTORY.md is the parity contract; Scenario Sandbox markup is pattern-checked by scenarios/verify.ts, so restyle it through CSS.

## Direction contract

THESIS: The corridor at night: a slow liquid-light wave and two lanes of light trails on a deep-black stage, the mascot car as the only character, work laid on near-opaque hairline panels; refuses the light-first card-grid SaaS dashboard and the neon-glow dark template.

OWN-WORLD: Stage #03060d, surfaces rgba(10,16,30,0.86) with white-8% hairlines, warm-white ink #f4f1ea. Italiana display titles that blur up letter by letter; Outfit 300/400/600 interface with tabular figures. One white pill per view, hairline ghosts elsewhere. Expressway blue brand, toll amber only in the brand mark, mascot lights and sign-in story. Five vertical grid hairlines with drifting dots; section-progress dashes.

STORY: Sign-in tells four true stories (forecast, honest validation, one corridor, connected to drivers) while the mascot waits; inside, every page answers one question in its header and every card leads with the answer, then context, evidence and method.

FIRST VIEWPORT: Sign-in: top bar (logo, SmartFlow NLEX wordmark h1, story labels), mascot centre-left in columns 2-3, raised sign-in card in column 4 with the white pill, story title bottom-left over three hairline capability chips. Dashboard: raised sidebar, topbar with breadcrumb and hairline, Italiana page title with eyebrow and one-line description, controls on its baseline.

FORM: Night Corridor, brief-pinned (no concept roll: a user-pinned direction beats the roll), position 1, seed key: none (pinned by REDESIGN_PROMPT.md).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
