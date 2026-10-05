# Redesign inventory: Night Corridor

The feature-preservation contract for the Night Corridor redesign (see `REDESIGN_PROMPT.md`, section 1a).
Every item below existed before the first visual edit (taken 4 Oct 2026 on branch `dashboard-redesign`,
uncommitted tree included). The redesign may restyle, re-lay-out and shorten copy under the brief's copy
rules; it may not remove, hide, merge away or put behind an extra click anything listed here.

How to read it:
- `- [ ]` an item to verify in the browser after that page is redesigned; `- [x]` verified present and working;
  `- [~]` changed on purpose, with the reason beside it.
- `file:line` references point at the pre-redesign source (`Front-End-Dashboard/` is the root for paths).
- Baseline screenshots: `.playwright-cli/redesign-baseline/<theme>-<desktop|mobile>/<view>.png` (full page)
  and `<view>-fold.png` (first viewport), 1440×900 and 390×844, dark and light. Git-ignored.
- The copy log is at the end, one heading per route.

## Role matrix

| Route | data-analyst | tcc-operator | incident-operator |
|---|---|---|---|
| `/` sign-in | public | public | public |
| `/dashboard` Overview | yes | yes | yes |
| `/dashboard/traffic` | yes | yes | yes |
| `/dashboard/incident` (+ `/hourly`) | yes | yes | yes |
| `/dashboard/sustainability` Emissions | yes | denied → `/dashboard` | denied → `/dashboard` |
| `/dashboard/map-comparison` Live Map | yes | yes | yes |
| `/dashboard/maintenance` | yes | yes | yes |
| `/dashboard/mobile` | yes | yes | yes |
| `/dashboard/scenario-sandbox` | yes | yes | denied → `/dashboard` |
| `/dashboard/ai-sandbox` (redirect) | → scenario-sandbox | → scenario-sandbox | denied → `/dashboard` |
| `/dashboard/data-management` | yes | denied | denied |
| `/dashboard/audit-log` | yes | denied | denied |

Sidebar per role: data-analyst sees Analytics (4) · Operations (3) · Planning (1) · Admin (2);
tcc-operator sees Analytics (Overview, Traffic, Incidents) · Operations · Planning; incident-operator sees
Analytics (Overview, Traffic, Incidents) · Operations (the Planning group disappears because it is empty).
Inside the pages, no tab or panel changes by role (each route section says so). Role rules:
`lib/auth-access.ts`. Screenshots could only be taken as the signed-in account; the per-role lists above are
derived from the code.

## Pre-existing issues found while taking the inventory (not changed by the redesign)

These were found by reading the code. The brief forbids behaviour, API and backend changes, so they are
reported here, not fixed.
- Maintenance: southbound saves fail. The form requires end km < start km for SB, but the backend validator
  demands `endKm >= startKm` (`Back-End/.../maintenance.validator.ts:35-38`), so every SB save returns 400.
- Emissions: the brief's "Strategy X/Y/Z" panel no longer exists. The Prescriptive bars are computed from the
  backend and the policy-target bar is drawn hollow and labelled "Policy target". There is no ILLUSTRATIVE label
  on the page to preserve. The forecast's "CO₂ is not measured…" caveat is passed to `ModelNarrative` but never
  rendered.
- Sign-in: "Remember me" and "Forgot password?" are on screen but do nothing.
- Overview: the jam-level tooltip says "1 to 5" while the dialog says "0 to 5".
- Traffic: one request (the hourly drill-down) hard-codes `localhost:4000`; the plaza filter is sent to the API
  but has no control on screen; two tooltips promise an hourly breakdown on click but open a summary popup.
- Incidents: ten panel components are not rendered by either route (orphaned); the "Avg Response Time" KPI
  tooltip points to a Predictive card that is not rendered; the Response Time Breakdown ignores Range/Weather.
- Live Map: uses mapbox-gl (not MapLibre) with `attributionControl: false`; there is no per-segment speed (only
  per-jam speed); the live freshness `feed` object is fetched but never read; Waze has no "breakdown" alert type.
- Mobile: `PUT /api/mobile-config` has no auth check, so any role can save.
- Data Management: the upload "drop zone" is click-to-pick only (no drag and drop); the server allows 500 MB
  while its comment says 100 MB; the upload dialog says "This page cannot undo a load" while Recent uploads has Undo.
- Audit Log: no pagination; at most 500 entries load.
- Scenario Sandbox: `scenarios/verify.ts` checks the page source with ~134 text patterns, so its markup and
  class names must not be renamed; the full-screen hint says keys 1–4 set speed but 3 and 4 do nothing.


---


Paths are relative to `Front-End-Dashboard/`. Line refs are `file:line` as of branch `dashboard-redesign` @ 527abba (plus uncommitted tree, 4 Oct 2026).
`BACKEND` = `process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"` everywhere below.

---

## Shell — Dashboard shell (wraps every /dashboard/* route)

Sources: `app/dashboard/layout.tsx`, `components/dashboard/ThemeToggle.tsx`, `app/dashboard/loading.tsx`, `app/layout.tsx` (root providers), `lib/theme.tsx`, `lib/toast.tsx`, `lib/auth-access.ts`, `lib/backend-auth.ts`, `lib/api.ts` (SESSION_LOST_EVENT), `lib/supabase.ts`.

**Roles:** all three roles get the shell. Role-dependent content:
- Sidebar links are filtered by `canAccess(role, href)` (layout.tsx:177-180), same rule set as the route guard (auth-access.ts:28-44, 63-67; matches on segment boundary, so `/x/...` children are denied with the parent).
- data-analyst sees: Analytics (Overview, Traffic, Incidents, Emissions) · Operations (Live Map, Maintenance, Mobile App) · Planning (Scenario Sandbox) · Admin (Data Management, Audit Log).
- tcc-operator sees: Analytics (Overview, Traffic, Incidents) · Operations (all 3) · Planning (Scenario Sandbox). No Admin group.
- incident-operator sees: Analytics (Overview, Traffic, Incidents) · Operations (all 3). Planning group disappears (empty group returns null, layout.tsx:314). No Admin group.
- Role name in footer + logout dialog: "TCC Operator", "Incident Operator", "Data Analyst", fallback "Administrator" (layout.tsx:267-272).
- Session with no/invalid `user_metadata.role` gets `FALLBACK_ROLE = "incident-operator"` (auth-access.ts:25; layout.tsx:100).
- Denied route sends the user to `FALLBACK_ROUTE = "/dashboard"`; no session sends them to `LOGIN_ROUTE = "/"` (auth-access.ts:47, 50).

**Tabs / modes:** none (sidebar is navigation, see below).

**Checklist**

**Auth gate / session states**
- [ ] Shell renders nothing (no sidebar, topbar or page) until session and role are known AND the role may open the path; it shows a gate instead (layout.tsx:284-297)
- [ ] Gate text while checking: "Checking your session…" (layout.tsx:287)
- [ ] Gate text with no session: "Redirecting to sign in…" (layout.tsx:289)
- [ ] Gate text on a forbidden route: "You do not have access to that page. Returning to the overview…" (layout.tsx:290)
- [ ] Gate container `role="status"` `aria-live="polite"`, spinner `aria-hidden="true"` (`.ds-auth-gate`, `.ds-auth-gate-spinner`) (layout.tsx:292-293)
- [ ] No session triggers `router.replace("/")` (replace, not push) (layout.tsx:138-140)
- [ ] Forbidden route triggers `router.replace("/dashboard")` so the refused page is not in history (layout.tsx:182-187)
- [ ] `supabase.auth.onAuthStateChange` keeps the shell in sync (sign-out in another tab, token refresh) (layout.tsx:113-117)
- [ ] Listens for `"smartflow:session-lost"` (SESSION_LOST_EVENT) and drops to anon, then redirects (layout.tsx:129-135; api.ts:50)
- [ ] `installBackendAuth()` runs at module load: every fetch to BACKEND gets `authorization: Bearer <token>` (layout.tsx:40; backend-auth.ts:35-47)
- [ ] Page-view audit `logPageView(pathname)` on every allowed route once authed (layout.tsx:190-192)

**Sidebar nav** (layout.tsx:45-59, 309-340)
- [ ] Group label "Analytics"
- [ ] Group label "Operations"
- [ ] Group label "Planning"
- [ ] Group label "Admin", rendered last in its own block `.ds-nav-group-admin`, only if the role has an Admin link (layout.tsx:329-339)
- [ ] Link "Overview" → `/dashboard` (Home icon)
- [ ] Link "Traffic" → `/dashboard/traffic` (TrendingUp icon)
- [ ] Link "Incidents" → `/dashboard/incident` (AlertTriangle icon)
- [ ] Link "Emissions" → `/dashboard/sustainability` (Leaf icon)
- [ ] Link "Live Map" → `/dashboard/map-comparison` (Map icon)
- [ ] Link "Maintenance" → `/dashboard/maintenance` (Wrench icon)
- [ ] Link "Mobile App" → `/dashboard/mobile` (Smartphone icon)
- [ ] Link "Scenario Sandbox" → `/dashboard/scenario-sandbox` (Car icon)
- [ ] Link "Data Management" → `/dashboard/data-management` (Brain icon)
- [ ] Link "Audit Log" → `/dashboard/audit-log` (ClipboardList icon)
- [ ] Active link gets class `active` on exact `pathname === href` (layout.tsx:319, 333)
- [ ] `prefetch={true}` on every nav Link (layout.tsx:319, 333)
- [ ] Empty group hidden entirely (layout.tsx:314)
- [ ] (Note) Icons `Calendar`, `ChevronDown`, `Menu`, `User`, `X` are imported but render nothing (layout.tsx:10,12,18,21,23)

**Sidebar footer** (layout.tsx:342-353)
- [ ] Avatar circle: first letter of full name (else email), fallback "A" (layout.tsx:266, 344)
- [ ] User email (layout.tsx:346)
- [ ] Role display name (layout.tsx:347)
- [ ] Button "Log out" (LogOut icon) opens the confirm dialog (layout.tsx:350-352)

**Topbar** (layout.tsx:357-400)
- [ ] Menu button `aria-label="Toggle menu"` (three bar spans), toggles sidebar: collapse on desktop, drawer on mobile (layout.tsx:359-363)
- [ ] Brand logo light: `/SMARTFLOW_LOGO_WHITE.png` alt "SmartFlow NLEX", class `is-light` (layout.tsx:371-378)
- [ ] Brand logo dark: `/logo-dark-bg.png` alt "", class `is-dark`; swap is CSS, not JS, so an explicit theme beats the OS with no flash (layout.tsx:365-386)
- [ ] Wordmark text "SmartFlow NLEX" (layout.tsx:387)
- [ ] ThemeToggle (layout.tsx:392)
- [ ] Live date: `toLocaleDateString("en-US", {weekday:"long", month:"long", day:"numeric", year:"numeric"})`, e.g. "Sunday, October 4, 2026" (layout.tsx:246-251, 396)
- [ ] Live time: `toLocaleTimeString("en-US", {hour:"2-digit", minute:"2-digit", second:"2-digit"})`, ticks every 1000 ms (layout.tsx:241-257, 397)
- [ ] `suppressHydrationWarning` on both clock nodes (layout.tsx:396-397)
- [ ] ResizeObserver publishes `--ds-topbar-h` on `<main>`; pages pin their filter rows under it (layout.tsx:226-239)

**Mobile drawer / collapse**
- [ ] Breakpoint `MOBILE_BREAKPOINT = 980` (`window.innerWidth <= 980`) (layout.tsx:64, 197)
- [ ] Mobile open adds `ds-mobile-open`; desktop closed adds `ds-shell-collapsed` (layout.tsx:259-264)
- [ ] Mobile backdrop `.ds-sidebar-backdrop` (aria-hidden) closes the drawer on click (layout.tsx:301-307)
- [ ] Drawer auto-closes on route change on mobile (layout.tsx:209-214)
- [ ] Above breakpoint the sidebar is forced open on resize (layout.tsx:199-201)
- [ ] Below 1100px ThemeToggle labels hide and it shows icons only (globals.css:5309-5316)

**Logout confirm dialog** (layout.tsx:405-459)
- [ ] Backdrop `.ds-modal-backdrop` click closes (not while logging out) (layout.tsx:406-408)
- [ ] `role="alertdialog"` `aria-modal="true"` `aria-labelledby="logout-title"` `aria-describedby="logout-desc"` (layout.tsx:412-415)
- [ ] Title (id `logout-title`): "Log out of SmartFlow?" (layout.tsx:423)
- [ ] Body (id `logout-desc`): "You'll need to sign in again to open the dashboard." (layout.tsx:424)
- [ ] Account chip (only if email): avatar letter, email, role name (layout.tsx:425-433)
- [ ] Button "Cancel": receives focus when the dialog opens (layout.tsx:163-167, 437-445)
- [ ] Danger button "Log out", label becomes "Logging out…" while busy, `aria-busy` (layout.tsx:446-455)
- [ ] Both buttons disabled while logging out (layout.tsx:442, 450)
- [ ] Esc closes the dialog (not while logging out) (layout.tsx:168-170)
- [ ] Logout order: audit `session.logout`, then `supabase.auth.signOut()`, then `router.replace("/")` even if signOut throws (layout.tsx:151-161)

**ThemeToggle** (ThemeToggle.tsx)
- [ ] `role="radiogroup"`, aria-label `` `Colour theme — currently ${choice}${choice === "system" ? ` (${resolved})` : ""}` `` (ThemeToggle.tsx:24-28)
- [ ] Radio "Light" (Sun icon) (ThemeToggle.tsx:15)
- [ ] Radio "Dark" (Moon icon) (ThemeToggle.tsx:16)
- [ ] Radio "System" (Monitor icon) (ThemeToggle.tsx:17)
- [ ] Each button `role="radio"` + `aria-checked`, active class `active` (ThemeToggle.tsx:35-37)
- [ ] `title` = label, or `` `Follow system (${resolved})` `` for System (ThemeToggle.tsx:39)
- [ ] Choice writes `<html data-theme>` (removed for "system"), `colorScheme`, localStorage, and dispatches `"smartflow:themechange"` (charts and 3D corridor rebuild on it) (theme.tsx:40-47, 78-90)
- [ ] Default choice "system" (follows OS, OS changes tracked live) (theme.tsx:52, 69-76)
- [ ] Inline `THEME_INIT_SCRIPT` in `<head>` before the stylesheet prevents the wrong theme flashing (app/layout.tsx:24-26; theme.tsx:117-122)

**Route loading state** (loading.tsx)
- [ ] Spinner + "Loading dashboard data..." (three ASCII dots) (loading.tsx:5-6)

**Toasts (global, mounted in root layout; not used by shell/Overview themselves)** (lib/toast.tsx; app/layout.tsx:33)
- [ ] Viewport `.ds-toast-viewport` `aria-live="polite"` `aria-atomic="false"` (toast.tsx:107)
- [ ] Kinds success / error / info with icons "✓", "!", "i" (toast.tsx:103)
- [ ] Error toast `role="alert"`, others `role="status"` (toast.tsx:113)
- [ ] Message line + optional detail line (toast.tsx:119-120)
- [ ] Dismiss button "×" `aria-label="Dismiss notification"` (toast.tsx:122-129)
- [ ] Auto-dismiss: success 4000 ms, info 5000 ms, error never (stays until dismissed) (toast.tsx:41-45)
- [ ] At most 4 visible; oldest dropped (toast.tsx:48, 67)

**Root document** (app/layout.tsx)
- [ ] `<title>` "SmartFlow NLEX — Decision Intelligence Dashboard" (app/layout.tsx:7)
- [ ] meta description "SmartFlow NLEX Decision-Intelligence dashboard for traffic monitoring, incident analysis, and AI-powered predictions." (app/layout.tsx:8)
- [ ] `<html lang="en" data-scroll-behavior="smooth">`, Archivo font from Google Fonts (app/layout.tsx:22, 29)

**API endpoints**
- `POST ${BACKEND}/api/audit-log/activity` body `{type:"page.viewed", path}`: `logPageView` from layout effect, at most once per path per 10 min per tab; 5 s abort (backend-auth.ts:59-87; layout.tsx:191)
- `POST ${BACKEND}/api/audit-log/activity` body `{type:"session.logout"}`: `confirmLogout` (layout.tsx:154)
- Supabase auth (SDK, no app paths): `getSession`, `onAuthStateChange`, `signOut` (layout.tsx:111, 115, 156)
- Global fetch wrapper adds Bearer token to any URL starting with BACKEND (backend-auth.ts:40-46)
- Polling: clock only, 1000 ms (layout.tsx:242)

**localStorage / sessionStorage**
- localStorage `"smartflow-theme"` = light|dark|system (theme.tsx:20, 59, 83; read again by THEME_INIT_SCRIPT)
- sessionStorage `` `audit:viewed:${path}` `` = timestamp (backend-auth.ts:78-82)
- Supabase session in localStorage (supabase-js default key `sb-<project-ref>-auth-token`; `persistSession: true`, `autoRefreshToken: true`) (supabase.ts:29-39)

**"Never cut" facts**
- Role labels "TCC Operator" / "Incident Operator" / "Data Analyst" / "Administrator" (layout.tsx:268-271)
- The three gate messages, quoted above (layout.tsx:287-290)
- Nav group names and order: "Analytics", "Operations", "Planning", then "Admin" pinned last (layout.tsx:62, 328-339)
- Logout is a real `signOut` (shared operator PC rationale, layout.tsx:142-150)

**Visible prose likely to be shortened**
- layout.tsx:424 "You'll need to sign in again to open the dashboard."
- layout.tsx:290 "You do not have access to that page. Returning to the overview…"

---

## / — Sign in

Sources: `app/page.tsx`, `lib/supabase.ts`, `lib/backend-auth.ts`.

**Roles:** public, outside the dashboard shell and route guard; no role content. A signed-in user who opens `/` still sees the form (no auto-redirect).

**Tabs / modes:** none.

**Checklist**

**Decoration**
- [ ] Animated four-lane SVG backdrop `.login-flow` (paths `l1`–`l4`), `aria-hidden`, stops under prefers-reduced-motion (page.tsx:58-70)

**Brand panel** (`<section aria-label="SmartFlow branding">`, page.tsx:72)
- [ ] Logo light `/SMARTFLOW_LOGO_WHITE.png` alt "SmartFlow NLEX" (`is-light`, `unoptimized`, `priority`) (page.tsx:80-88)
- [ ] Logo dark `/logo-dark-bg.png` alt "" (`is-dark`) (page.tsx:89-97)
- [ ] `<h1>` "SmartFlow NLEX" with "NLEX" in a `<span>` (page.tsx:105)
- [ ] Tagline "Decision-Intelligence System" (page.tsx:106)
- [ ] Point "Live corridor status" (Activity icon) (page.tsx:114)
- [ ] Point "Predictive volume" (TrendingUp icon) (page.tsx:115)
- [ ] Point "Incident intelligence" (TriangleAlert icon) (page.tsx:116)

**Sign-in form** (`<section aria-label="Sign in form">`, page.tsx:121)
- [ ] `<h2>` "Sign In to Dashboard" (page.tsx:123)
- [ ] Error alert `.login-alert.danger`: shows Supabase `error.message` verbatim (page.tsx:41, 126)
- [ ] Error fallback text "An unexpected error occurred. Please try again." (page.tsx:51)
- [ ] Success alert `.login-alert.success` (state exists, never set) (page.tsx:127)
- [ ] Field label "Username / Email", input `type="text"` `name="username"`, placeholder "Enter your username or email", required, User icon; value is sent as `email` (page.tsx:129-143, 36)
- [ ] Field label "Password", input `name="password"`, placeholder "Enter your password", required, Lock icon (page.tsx:145-157)
- [ ] Show/hide password button, aria-label "Show password" / "Hide password", Eye / EyeOff icon (page.tsx:158-166)
- [ ] Checkbox "Remember me", default checked (state only, not wired) (page.tsx:11, 171-179)
- [ ] Button "Forgot password?" (no handler) (page.tsx:181-183)
- [ ] Submit "Sign In"; label "Signing In..." while loading (page.tsx:186-188)
- [ ] All inputs and buttons disabled while loading; double-submit guard (page.tsx:28, 140, 156, 163, 176, 181, 186)
- [ ] Footer "© 2026 SmartFlow NLEX. All rights reserved." (page.tsx:192)

**API endpoints**
- Supabase `auth.signInWithPassword({ email, password })` (page.tsx:35-38)
- `POST ${BACKEND}/api/audit-log/activity` body `{type:"session.login"}` with the new access token, raced against a 1500 ms timeout (page.tsx:48)
- Then a full-page `window.location.assign('/dashboard')` (page.tsx:23, 49)
- No polling.

**localStorage / sessionStorage**
- Supabase session only (supabase-js default key). No app keys.

**"Never cut" facts**
- Product name "SmartFlow NLEX" and tagline "Decision-Intelligence System" (page.tsx:105-106)
- Three capability points, quoted above (page.tsx:114-116)

**Visible prose likely to be shortened**
- page.tsx:106 "Decision-Intelligence System"
- page.tsx:192 "© 2026 SmartFlow NLEX. All rights reserved."

---

## /dashboard — Overview

Sources: `app/dashboard/page.tsx`, `components/overview/OverviewLive.tsx`, `components/overview/CorridorScene.tsx`, `app/dashboard/components/InteractiveRoadMap.tsx`, `components/dashboard/PageHeader.tsx`, `components/dashboard/SignalGlyph.tsx`, `lib/use-corridor-live.ts`, `lib/corridor-status.ts`, `lib/nlex-exits.ts`, `lib/cached-json.ts`, `lib/map-palette.ts`, `lib/chart-theme.ts` (useChartTheme → isDark).
Not rendered: `app/dashboard/components/HeroLiveStatus.tsx` (see last section).

**Roles:** all three (also the fallback target for any denied route). No role-dependent content.

**Tabs / modes:** none. (The old hard-coded "LIVE / +1HR / +2HR" datasets were removed; InteractiveRoadMap.tsx:194-197.)

**Checklist**

**Page header** (page.tsx:20-24; PageHeader.tsx)
- [ ] Home icon, `<h1>` "Overview" (page.tsx:21-22)
- [ ] Subtitle "Balintawak Km 12 to Sta. Ines Km 88.25, both carriageways" (page.tsx:23)
- [ ] No `data-accent` on this page (PageHeader.tsx:24)

**Freshness strip** (`.ov-fresh`, `role="status"`, OverviewLive.tsx:66-80)
- [ ] Failed: "none" glyph + "**Live feed unreachable.** Counts and the corridor are not current." (OverviewLive.tsx:68)
- [ ] Loading: "none" glyph + "Reading the live feed…" (OverviewLive.tsx:70)
- [ ] OK: glyph "slow" if stale else "clear"; bold "Feed stale" or "Live"; then " · Waze jam reports · " + age; then `` ` · ${live.windowMinutes}-minute window` `` if present (OverviewLive.tsx:73-77)
- [ ] Age wording: "age unknown" / "just now" / `` `${Math.round(min)} min old` `` / `` `${Math.floor(min / 60)} h ${Math.round(min % 60)} min old` `` (OverviewLive.tsx:18-23)

**3D corridor** (CorridorScene.tsx; mounted OverviewLive.tsx:82)
- [ ] Client-only dynamic import; placeholder "Loading the 3D corridor…" (OverviewLive.tsx:10-13)
- [ ] WebGL failure text "3D view unavailable on this device. The km ruler and the corridor panel below show the same live state." (CorridorScene.tsx:285-288)
- [ ] Canvas `aria-hidden`; horizontal drag moves the car 0.04 km per px, clamped 12–88.25, pointer capture, pointercancel ends drag (CorridorScene.tsx:249-260, 290-298)
- [ ] Hint "Drag the road, or use the km ruler, to read any point on the corridor" (CorridorScene.tsx:300)
- [ ] Both carriageways at true km (12 scene units per km), NB and SB roads, lane lines, median, ground grid every 5 km from 15 to 85, fog (CorridorScene.tsx:24-30, 121-134)
- [ ] Per-direction status strip beside each road: clear base (grey "none" while waiting) (CorridorScene.tsx:138-140)
- [ ] Queue blocks for slow/congested exits, centred on the exit, length = longest queue m ÷ 1000, minimum 0.35 km (CorridorScene.tsx:141-146, 30)
- [ ] Gantry over every exit with an NB and an SB sign coloured congested / slow / clear / none; "none" while waiting or where the direction has "No Access" (CorridorScene.tsx:149-160)
- [ ] Car = km cursor, not a vehicle in the data; camera rides behind it (CorridorScene.tsx:13-15, 162-196)
- [ ] Signal colours stay bright in both themes; car colour from `--action` (CorridorScene.tsx:37-48)
- [ ] Floating gantry labels for up to 5 exits ahead: `<em>{km.toFixed(1)}</em>` + exit name, overlap-avoided, `aria-hidden` (CorridorScene.tsx:199-211, 301-307)
- [ ] Readout card line 1: `` `KM ${km.toFixed(1)} · NEAREST EXIT KM ${nearest.km.toFixed(1)}` `` (CorridorScene.tsx:314)
- [ ] Readout card line 2: nearest exit display name (CorridorScene.tsx:315)
- [ ] Readout rows "NB" and "SB": SignalGlyph + direction + word + detail (CorridorScene.tsx:316-327)
- [ ] Readout words: "No access", "No report yet" (waiting), "Clear", "Clear, no report", "Slow", "Congested" (CorridorScene.tsx:270, 272, 279)
- [ ] Readout detail joined " · ": `` `${Math.round(s.longestQueueMeters)} m queue` ``, `` `${Math.max(1, Math.round(s.delaySeconds / 60))} min delay` ``, `` `${Math.round(s.speedKmh)} km/h` `` (CorridorScene.tsx:276-278)
- [ ] Readout card `aria-hidden`; x clamped between 150 px and width − 150 px (CorridorScene.tsx:309-312)
- [ ] Scene rebuilds on `"smartflow:themechange"` and on OS colour-scheme change (CorridorScene.tsx:227-237)
- [ ] Car starts 1 km before the slowest reading's exit (min km 12), else at Balintawak km 12 (OverviewLive.tsx:32-40)

**Km ruler** (OverviewLive.tsx:84-107)
- [ ] Km tick labels 15, 20, 25 … 85 (OverviewLive.tsx:86-88)
- [ ] Tick per exit at true km (OverviewLive.tsx:89-91)
- [ ] Flag per non-clear exit: class `is-congested` if either direction is congested, else `is-slow` (OverviewLive.tsx:52-57, 92-94)
- [ ] Range input min 12, max 88.25, step 0.1, synced with the 3D car (OverviewLive.tsx:96-103)
- [ ] `aria-label="Km along the corridor"` (OverviewLive.tsx:104)
- [ ] `aria-valuetext` `` `Km ${km.toFixed(1)}, nearest exit ${displayExitName(nearest.exit_name)}: northbound ${stateAt("NB")}, southbound ${stateAt("SB")}` `` (else `` `Km ${km.toFixed(1)}` ``) (OverviewLive.tsx:60-62, 105)
- [ ] stateAt words: "no data", "no access", "clear" / "slow" / "congested" (OverviewLive.tsx:46-51)
- [ ] Keyboard: native range arrow / Home / End keys

**Corridor counts** (`<section aria-label="Exit-directions by state, last feed window">`, OverviewLive.tsx:109-129)
- [ ] Tile congested: SignalGlyph 40 px, value, label "exit-directions congested" (OverviewLive.tsx:110-117)
- [ ] Tile slow: label "slow" (OverviewLive.tsx:115)
- [ ] Tile clear: label "clear" (OverviewLive.tsx:115)
- [ ] Value placeholder "–" until the tally exists (OverviewLive.tsx:114)
- [ ] Label "Slowest reading on the corridor" (OverviewLive.tsx:120)
- [ ] Value `{displayExitName(slowest.exit)} · <span>{Math.round(slowest.speedKmh)} km/h</span>` (OverviewLive.tsx:122-124)
- [ ] Empty value "Waiting for the feed" (loading) / "No speed reported" (OverviewLive.tsx:126)

**SignalGlyph vocabulary** (SignalGlyph.tsx; used by strip, 3D readout, counts)
- [ ] clear = green downward arrow; slow = amber diagonal arrow; congested = red cross; none = hollow ring (SignalGlyph.tsx:4-7, 47-52)
- [ ] Accessible names "Clear", "Slow", "Congested", "No report"; `title=""` makes it `aria-hidden` (used when a word sits beside it) (SignalGlyph.tsx:15-20, 36-45)
- [ ] Stroke from `--signal-clear|slow|congested|none` CSS vars (SignalGlyph.tsx:37)
- [ ] Rule: state is always glyph + word, never colour alone (SignalGlyph.tsx:9-11)

**Live Corridor Status panel: header** (InteractiveRoadMap.tsx, abbreviated IRM)
- [ ] `<section id="nlex-roadmap" class="ds-rd">` (IRM:782)
- [ ] `<h2>` "Live Corridor Status" (IRM:786)
- [ ] Stale pill "Stale feed", title "The Waze ingester has not written a row recently" (IRM:787-791)
- [ ] Subline on error: "Feed unavailable — is the backend running on port 4000?" (IRM:499)
- [ ] Subline loading: "Reading the Waze feed…" (IRM:501)
- [ ] Subline OK: `` `${corridor.feed.stale ? "Feed may be stale · last" : "Last"} report ${ageMinutes < 1 ? "just now" : `${ageMinutes} min ago`} · ${corridor.windowMinutes}-minute window` `` (IRM:502-507)
- [ ] Subline when no newest report: "No jam reports on the corridor right now" (IRM:508)
- [ ] Window defaults to 60 min if the feed omits it (IRM:369)
- [ ] Tally chips, `aria-label="Corridor summary, both directions"`: `` `${tally.congested} congested` ``, `` `${tally.slow} slow` ``, `` `${tally.clear} clear` `` (IRM:797-801)

**Live Corridor Status panel: detail rail** (`aria-live="polite"`, IRM:806-855)
- [ ] Idle hint "Hover an exit for its access and speed, or a coloured stretch for how long that queue is." (IRM:852)
- [ ] Exit focus: exit name + `` `km ${focused.exit.km.toFixed(1)}` `` (IRM:841-844)
- [ ] Exit focus, per "NB" and "SB": "No ramp in this direction" when the direction has no access (IRM:514-515)
- [ ] Exit focus status word "CLEAR" / "SLOW" / "CONGESTED" (IRM:518, 325)
- [ ] Exit focus speed `` `${s.speedKmh} km/h` ``, "—" if missing, "Free flowing" for an exit with no report (IRM:269, 326, 519)
- [ ] Exit focus `` `Jam level ${data.level} of 5 · ${JAM_LEVEL_LABEL[data.level] ?? "unknown"}` ``, title "Waze grades every jam 1 to 5 by how badly traffic is moving" (IRM:520-524)
- [ ] Exit focus jam count "No active jams" / `` `${n} active jam${n === 1 ? "" : "s"}` `` (IRM:525-529)
- [ ] Jam hover/focus: exit name + `<em>{dir}</em>`, status word (IRM:812-821)
- [ ] Jam hover queue, title "The longest single queue Waze reported here. Reports overlap, so they are not added together." (IRM:822-826)
- [ ] Jam hover delay, title "Waze's own estimate of the time lost to this queue, against free-flow speed." (IRM:827-831)
- [ ] Jam hover `` `Jam level ${hoveredJam.level} of 5` `` (IRM:832-834)
- [ ] Queue format `` `${(m / 1000).toFixed(1)} km queued` `` (≥1000 m) / `` `${m} m queued` ``; hidden when null or ≤0 (IRM:303-304)
- [ ] Delay format "under a minute lost" / `` `~${mins} min lost` `` / `` `~${Math.floor(mins / 60)} h ${mins % 60} min lost` ``; hidden when null or ≤0 (IRM:307-313)

**Live Corridor Status panel: road diagram** (IRM:857-933)
- [ ] Revealed on scroll (IntersectionObserver threshold 0.1 adds `is-visible`) (IRM:409-418, 857)
- [ ] Horizontal scroll container; track min-width 940 px (globals.css:3780-3788)
- [ ] Top caption "← Southbound (SB) · to Metro Manila" (IRM:871-873)
- [ ] Bottom caption "→ Northbound (NB) · to Central Luzon" (IRM:908-910)
- [ ] SB on top, NB below (Philippine right-hand traffic) (IRM:860-870)
- [ ] One even-width block per exit per carriageway, `data-status` ("no-ramp" / "seg-green" / "seg-orange" / "seg-red") and `data-exit` attributes, `no-ramp` class, `is-active` on hover (IRM:701-727)
- [ ] Queue band `<i class="ds-rd-jam seg-*">`: width = queue ÷ stretch length, floor 9%; anchored left going NB, right going SB; terminal exits measured on the approach stretch (IRM:550-587, 733-735)
- [ ] Band is keyboard-focusable: `tabIndex={0}` `role="button"`, aria-label `` `${displayExitName(exit)} ${dir}, ${status}${queue ? `, ${queue}` : ""}${delay ? `, ${delay}` : ""}` `` (IRM:739-741)
- [ ] Band hover/focus fills the rail; leave/blur clears it (IRM:742-755)
- [ ] No native `title` tooltip on blocks (deliberate) (IRM:721-726)
- [ ] Decorative lane and flow layers `.ds-rd-lanes`, `.ds-rd-flow` (IRM:762-763)
- [ ] Animated vehicles, 12 per carriageway: lane 1 five cars, lane 2 cars + vans, lane 3 buses + trucks; no motorcycles; `aria-hidden` (IRM:68-84, 764-776)
- [ ] Vehicles slow over bands: red 0.12×, amber 0.4×, clear 1× of a 17000 ms clear run; position kept across feed updates; stopped under prefers-reduced-motion (IRM:41, 87, 612-664)
- [ ] Median stop per exit: button `.ds-rd-hit` with hexagon road glyph + km `{km.toFixed(1)}` (IRM:878-905)
- [ ] Stop aria-label `` `${displayExitName(name)}, km ${km.toFixed(1)}. Northbound ${no ramp | status}. Southbound ${no ramp | status}.` `` (IRM:895-897)
- [ ] Stop hover/focus sets the active exit; `no-ramp` class when both directions closed (IRM:880-894)
- [ ] Exit-name label row under the diagram (buttons `tabIndex={-1}` `aria-hidden`, hover sets active) (IRM:913-930)

**Live Corridor Status panel: footer + jam-level dialog**
- [ ] Legend "Congested", "Slow", "Clear" swatches (IRM:937-939)
- [ ] Button "? Jam levels" opens the scale dialog (IRM:940-942)
- [ ] Footer note "Waze jam reports matched to the nearest exit; direction from jam bearing. An exit with no report is flowing freely." (IRM:944-947)
- [ ] Dialog `role="dialog"` `aria-modal="true"` `aria-label="Waze jam level scale"`; backdrop click closes (IRM:950-957)
- [ ] Esc closes the dialog (IRM:490-495)
- [ ] Dialog title "Waze jam levels" (IRM:960)
- [ ] Close button "×" `aria-label="Close"` (IRM:961)
- [ ] Dialog intro text, quoted under prose (IRM:964-967)
- [ ] Scale row 0 "100–80% of free-flow speed" "free flow" (IRM:254)
- [ ] Scale row 1 "80–61%" "light" (IRM:255)
- [ ] Scale row 2 "60–41%" "moderate" (IRM:256)
- [ ] Scale row 3 "40–21%" "heavy" (IRM:257)
- [ ] Scale row 4 "20–1%" "severe" (IRM:258)
- [ ] Scale row 5 "blocked road" "blocked" (IRM:259)
- [ ] Each row's chip coloured from `mapPalette(isDark).level[n]` (same colours as the Live Map) (IRM:291-292, 972; map-palette.ts:60-62)

**Data rules behind the display**
- [ ] Classification: no level and no speed → clear; level 0 → clear; level ≥3 or speed <10 km/h → congested; otherwise slow (corridor-status.ts:51-56)
- [ ] Per exit+direction: worst level, slowest speed, longest single queue, worst single delay, newest observed_at, jam count (corridor-status.ts:137-149)
- [ ] Jam attributed to the exit nearest its midpoint; only `feature_type === "jam"` LineStrings that pass the corridor guard (corridor-status.ts:109-128)
- [ ] Tally counts exit-directions and skips "No Access" directions (corridor-status.ts:232-249)
- [ ] Exits with no report count as clear (absence = free flow) (IRM:205-207; corridor-status.ts:92-93)
- [ ] Display-name fixes: "CDV/PH Arena", "SCTEX", "Paso de Blas Valenzuela" (nlex-exits.ts:159-169)
- [ ] 20-exit `FALLBACK_EXITS` so the corridor never renders empty (nlex-exits.ts:77-98, 127-143)

**API endpoints**
- `GET ${BACKEND}/api/map-comparison/real-time`: `cachedJson` with 25 000 ms TTL (stale-while-revalidate, concurrent callers share one request), polled every 60 000 ms. Called by `useCorridorLive` (use-corridor-live.ts:61, 82; starts once exits are loaded) AND by `useCorridorStatus` in InteractiveRoadMap (IRM:364-365, 386). Same URL, so they share the memo. Fields read: `features[].properties.{feature_type, level, speed, street, observed_at, length_m, delay_seconds}`, `features[].geometry` (LineString), `feed.{newestAt, ageMinutes, stale, windowMinutes}`.
- `GET ${BACKEND}/api/map-comparison/exits`: plain `fetch`, once per page load, module-cached; falls back to FALLBACK_EXITS if empty, km-less or failed. Called by `useNlexExits` (nlex-exits.ts:111-122).
- `POST ${BACKEND}/api/audit-log/activity` `{type:"page.viewed", path:"/dashboard"}` from the shell.

**localStorage / sessionStorage**
- None on this page directly (theme key is read through the shell's ThemeProvider / useChartTheme).

**"Never cut" facts**
- "Balintawak Km 12 to Sta. Ines Km 88.25, both carriageways" (page.tsx:23); ruler range 12–88.25, step 0.1 (OverviewLive.tsx:15-16, 99-101)
- Source: "Waze jam reports" (OverviewLive.tsx:75); "Waze jam reports matched to the nearest exit; direction from jam bearing." (IRM:945)
- Window: `` `${windowMinutes}-minute window` `` (OverviewLive.tsx:76; IRM:507); default 60 (IRM:369)
- Staleness strings: "Feed stale", "Stale feed", "Feed may be stale · last", "Live feed unreachable.", "Counts and the corridor are not current." (OverviewLive.tsx:68, 75; IRM:503, 789)
- Error string naming the port: "Feed unavailable — is the backend running on port 4000?" (IRM:499)
- Queue is the longest single report, never a sum: "Reports overlap, so they are not added together." (IRM:823). Code basis: summing overstated by 49% to 520%, about 6× at Tabang Guiguinto (corridor-status.ts:34-41)
- Delay basis: "Waze's own estimate of the time lost to this queue, against free-flow speed." (IRM:828)
- Jam level scale 0–5 with bands (IRM:253-260); "Waze publishes the scale as 0 to 5." (IRM:966). The rail tooltip still says "1 to 5" (IRM:521). Both strings exist today.
- "An exit with no report is flowing freely." (IRM:946)
- Readout units: "m queue", "min delay", "km/h", "KM", "NEAREST EXIT KM" (CorridorScene.tsx:276-278, 314)
- Count label "exit-directions congested" (the unit is exit-directions, not exits) (OverviewLive.tsx:115)
- Direction captions "Southbound (SB) · to Metro Manila", "Northbound (NB) · to Central Luzon" (IRM:872, 909)
- Vehicle speeds are illustrative, not measured (code comment only, not on screen) (IRM:36-39)

**Visible prose likely to be shortened**
- page.tsx:23 "Balintawak Km 12 to Sta. Ines Km 88.25, both carriageways"
- OverviewLive.tsx:68 "Live feed unreachable. Counts and the corridor are not current."
- CorridorScene.tsx:287 "3D view unavailable on this device. The km ruler and the corridor panel below show the same live state."
- CorridorScene.tsx:300 "Drag the road, or use the km ruler, to read any point on the corridor"
- IRM:852 "Hover an exit for its access and speed, or a coloured stretch for how long that queue is."
- IRM:945-946 "Waze jam reports matched to the nearest exit; direction from jam bearing. An exit with no report is flowing freely."
- IRM:965-966 "A level is how far traffic has fallen below free-flow speed on that stretch — not a count of vehicles. Waze publishes the scale as 0 to 5."
- IRM:521 (title) "Waze grades every jam 1 to 5 by how badly traffic is moving"
- IRM:788 (title) "The Waze ingester has not written a row recently"
- IRM:823 (title) "The longest single queue Waze reported here. Reports overlap, so they are not added together."
- IRM:828 (title) "Waze's own estimate of the time lost to this queue, against free-flow speed."

---

## /dashboard/ai-sandbox — AI Sandbox (legacy redirect)

Sources: `app/dashboard/ai-sandbox/page.tsx`, `lib/auth-access.ts`.

**Roles:** data-analyst and tcc-operator: client redirect to `/dashboard/scenario-sandbox`. incident-operator: denied by the shell first (auth-access.ts:40), sees "You do not have access to that page. Returning to the overview…" and is sent to `/dashboard`.

**Tabs / modes:** none. Not in the sidebar.

**Checklist**
- [ ] Route file kept so old bookmarks still work; renders `null` (ai-sandbox/page.tsx:10-18)
- [ ] `router.replace("/dashboard/scenario-sandbox")` in an effect (replace, so no history entry) (ai-sandbox/page.tsx:13-15)
- [ ] Client redirect on purpose: `output: 'export'` runs no server-side `redirects()` (ai-sandbox/page.tsx:6-9)
- [ ] `"/dashboard/ai-sandbox"` stays in incident-operator's DENIED list next to `"/dashboard/scenario-sandbox"` (auth-access.ts:36-40)

**API endpoints:** none (shell logs a page view for `/dashboard/ai-sandbox` before the redirect).

**localStorage / sessionStorage:** none (shell's `audit:viewed:/dashboard/ai-sandbox`).

**"Never cut" facts:** target path `/dashboard/scenario-sandbox`.

**Visible prose likely to be shortened:** none.

---

## Unmounted components in scope (nothing to preserve on screen today)

- [ ] `app/dashboard/components/HeroLiveStatus.tsx` is not imported anywhere (grep 4 Oct 2026). If it is brought back, its strings are: `aria-label="Live corridor status"` (:120); kicker `` `${s.stale ? "Feed stale" : "Live"} · ${age}` `` with age "—" / "just now" / `` `${Math.round(m)} min ago` `` (:117, :124); headline "Corridor flowing" / `` `${n} point${n === 1 ? "" : "s"} congested` `` (:113-115); stats "congested" (title "Exit-directions crawling"), "slow" (title "Exit-directions running below normal"), "clear" (title "Exit-directions with no reported jam") (:130-141); `slowest <b>{name}</b> {speed.toFixed(0)} km/h` (title "The slowest reading anywhere on the corridor right now") (:143-148); 900 ms count-up on first load only; same `/api/map-comparison/real-time` call, 25 s memo, 60 s poll (:85, :99).
- [ ] `app/dashboard/components/DateFilter.tsx` is not imported anywhere (out of scope; noted only).
- [ ] Hero banner images `/smartflow-nlex-hero-dark.png` and `/smartflow-nlex-hero-light.png` stay in `public/` but are not rendered (removed 3 Oct 2026 at the user's request) (page.tsx:13-15).

---

## /dashboard/traffic — Traffic

**Source files** (all paths under `Front-End-Dashboard/`): `app/dashboard/traffic/page.tsx` · `app/dashboard/traffic/components/DateRangePicker.tsx` · `app/dashboard/traffic/traffic.module.css` · `components/dashboard/{PageHeader, InfoTooltip, CustomSelect, RampKey, ChartSkeleton, CountUpValue, DashboardChart, PredictiveVolumeChart, ModelNarrative, AiModelInsight, NarrativePanel, WeatherEvidencePanel, PredictiveCongestionChart, CongestionNarrative, PredictiveEventChart, EventSurgeNarrative, PrescriptiveTrafficPanels, SignalGlyph}.tsx` · `components/dashboard/{prescriptiveTraffic.shared, replayViz, aggregateSeries, useThemeTokens}.ts` · `lib/{cached-json, chart-click, chart-theme, granularity, nlex-exits}.ts`.
Not used by this page: `app/dashboard/components/DateFilter.tsx`, ScenarioForecastPanel, ForecastDayPicker, FleetMixForecastChart, PredictiveCorridorChart, FeatureBriefing.

### Roles
- All three roles can open it: `data-analyst`, `tcc-operator`, `incident-operator`. `/dashboard/traffic` is on no DENIED list (`lib/auth-access.ts:28-44`). FALLBACK_ROLE is `incident-operator` (`auth-access.ts:25`), so it is also reachable with no role set.
- Nav entry: label "Traffic", group "Analytics", icon TrendingUp (`app/dashboard/layout.tsx:47`). Audit-log route label "Traffic" (`app/dashboard/audit-log/page.tsx:79`).
- **No content inside the page depends on role.** None of the page's components reads the role.

### Tabs / sub-tabs / modes
- Mode tabs (segmented, top-right of filter row): **"Descriptive"**, **"Predictive"**, **"Prescriptive"** (`page.tsx:818-823`, `913-918`). Active tab shows a check-mark SVG before its label.
- Storage: React `useState` only (`activeTab`, default "Descriptive", `page.tsx:137`). **Not** in the URL, localStorage or sessionStorage; resets to Descriptive on every navigation/reload. All filters are also plain component state.
- Filter state is shared across tabs: Range (`rangeMode`, default "12"), custom dates and Weather (`weather`, default "all") set on Descriptive are passed into the Predictive volume chart (`page.tsx:829-834`). Predictive shows no Weather control, and its Range group has no "Custom" button, but a Custom range or Dry/Wet chosen on Descriptive still reaches the forecast fetch.
- Sub-modes inside cards:
  - Descriptive impact card: "Events" / "Holidays" (default "Holidays", `page.tsx:153`).
  - Predictive volume card: View "Daily" / "Weekly" / "Monthly" (default Weekly); Ahead "2 wk" / "1 mo" / "2 mo" / "3 mo" (default 14 d); daily view ↔ "Hourly Breakdown" drill-down screen (state `drillDate`).
  - Predictive congestion card: range "Next 12 h" / "Next 24 h" / "Next 7 days" (default 12h); week view swaps to a day grid.
  - Predictive event card: "Showing" select = "Past events…" (observed) or an upcoming dated event.
  - Prescriptive booth panel: "Week ahead" / "Hour by hour" (default week).

---

### Checklist

#### Page shell (all tabs)
- [ ] PageHeader: icon TrendingUp, accent "traffic", title "Traffic Overview", subtitle "Volume, congestion, and speed patterns across NLEX" (`page.tsx:791`, `867`)
- [ ] Section wrapper class `viz-traffic` (sets the tab's colour family) (`page.tsx:790`, `866`)
- [ ] Mode tab buttons "Descriptive" / "Predictive" / "Prescriptive", with the check-mark on the active one (`page.tsx:817-824`, `912-919`)

#### Descriptive tab

**Row A — global filters** (`page.tsx:870-920`)
- [ ] "Range" label + calendar icon; segmented buttons "3 mo" / "12 mo" / "All" / "Custom" (default "12 mo") (`:873-881`)
- [ ] Custom range → DateRangePicker shown only when "Custom" is active; no fetch until both dates are set (`:164`, `:882-893`)
- [ ] DateRangePicker trigger: two date blocks "mm/dd/yyyy" placeholder, "—" between, calendar icon (`DateRangePicker.tsx:132-144`)
- [ ] DateRangePicker popover: prev/next chevron buttons (±1 month; ±10 years in year view) (`:149`, `:166`); month-name button → 12-month grid ("Jan"…"Dec") (`:153-158`, `:222-233`); year button → 12-year grid (`:159-164`, `:236-250`)
- [ ] DateRangePicker days grid: weekday header "Su Mo Tu We Th Fr Sa"; days outside `data.meta.minDate`/`maxDate` disabled (`disabled` + `aria-disabled`); range start/end/in-range highlighting with hover preview (both directions) (`:171-219`)
- [ ] DateRangePicker presets "Last 7 days" / "Last 30 days", counted back from the data's maxDate, not today; clamped to minDate (`:258-275`)
- [ ] DateRangePicker: two clicks complete a range (reversed order is swapped); auto-closes on completion; click outside closes (`:58-89`)
- [ ] "Weather" label + cloud icon; segmented "All" / "Dry" / "Wet" (default All) (`:896-907`)
- [ ] "Updating…" indicator while refetching with data on screen (`:909`)
- [ ] (Hidden state) plaza multi-select `plazaSel` exists and is sent as `plazas=`, but no control renders it (`:143`, `:175`). Record only.

**Row B — KPI tiles** (`page.tsx:923-974`). Each loads with KpiSkeleton; the number counts up once (CountUpValue)
- [ ] "Total Volume" tile: Activity icon, InfoTooltip, compact value (e.g. "1.2M"), hover `title` "{n} vehicles", delta "+x.x%" coloured up/down + "vs previous period" (`:924-936`)
- [ ] "Avg Daily Volume" tile: CalendarClock icon, InfoTooltip, integer value, 30-day sparkline mini chart (`:937-944`, sparkline `:542-550`)
- [ ] "Peak Hour (Weekdays)" tile: Clock icon, InfoTooltip, hour value (e.g. "5 PM"), hint "{n} vehicles/hr avg" (`:945-950`)
- [ ] "Busiest Plaza" tile: Building2 icon, InfoTooltip, plaza name, hint "{x.x}% of selected volume" (`:951-958`)
- [ ] "Congestion Index" tile: Gauge icon, InfoTooltip, "{x.xx} / 5", delta coloured (lower = good) + "vs prev · Waze jam level"; fallback "no prior data" (`:959-973`)
- [ ] KPI fallback "—" when no value (`:785`)

**Row C — "Volume Trend" hero card** (`page.tsx:977-1060`)
- [ ] Title "Volume Trend" + InfoTooltip (`:980`)
- [ ] "Direction" segmented "Both" / "NB" / "SB": disabled until Split is on, with title "Turn on Split NB / SB to choose a direction" (`:985-1002`)
- [ ] "Class" CustomSelect: options "All classes" / "Class 1" / "Class 2" / "Class 3" (sent as `vehicleClass`) (`:1006-1016`); CustomSelect has `aria-expanded`, click-outside close, check on selected (`CustomSelect.tsx:44-72`)
- [ ] "Granularity" segmented "Hourly" / "Daily" / "Weekly" / "Monthly" (default Daily) (`:1020-1038`)
- [ ] Hourly disabled unless the API returned hourly rows; title "Hourly detail is available for ranges up to 2 weeks" (`:1026-1030`)
- [ ] Other grains disabled when the range is too short; title "Needs at least {two days|two weeks|two months} of data — this range is {n} day(s)" (`lib/granularity.ts:43-50`); impossible grain auto-demoted (`page.tsx:209-214`)
- [ ] "Split NB / SB" toggle switch (checkbox); turning it off resets Direction to Both (`:1041-1056`)
- [ ] Chart, unsplit, daily/hourly: series "Daily volume" / "Hourly volume" (faint) + "7-day average" / "24-hour average" (bold); legend shown (`:282-286`)
- [ ] Chart, unsplit, weekly/monthly: single series "Volume" (circle markers when ≤24 points), no legend (`:287`)
- [ ] Chart, split: "Northbound" / "Southbound" lines with end labels "NB" / "SB"; Direction picks one line or both; legend only when both are drawn (`:275-281`, `:291`, `:309`)
- [ ] X labels only where the period changes; y axis compact ("12K", "1.2M"), not zero-based (`:264-302`)
- [ ] Tooltip (axis): bucket label (e.g. "Mon, Jan 5, 2026" / "Week of Jan 5, 2026" / "January 2026" / "Jan 5, 2026, 2 PM") + values as integers, "—" for null (`:303`, `granularity.ts:103-122`)
- [ ] Click anywhere on the chart (category fallback) → detail modal: title "{Weekday}, {date}" / "Week of {date}" / month; subtitle "Entry volume · {grain}"; rows "Total volume", "Northbound" ({n} ({%})), "Southbound", "vs range average", "vs previous {hour|day|week|month}", "Rank in range" ("#{r} of {n} {period}s by volume"); note = filtersNote (`:555-581`)
- [ ] Empty: "No volume data for the selected filters" (`:1059`)

**Row D-1 — "Average Volume by Hour × Day of Week" heatmap** (`page.tsx:1063-1079`)
- [ ] Title + InfoTooltip (`:1066`)
- [ ] Heatmap 24 hours (labels every 3rd, "12 AM"…) × Mon–Sun (Mon on top); 7-step colour ramp anchored at the observed minimum (`:314-356`)
- [ ] Tooltip: "{Day} {hour}" + "**{n}** vehicles/hr on average" (`:334`)
- [ ] Click a cell → detail modal: title "{Day} · {hour}"; subtitle "Average entry volume for this hour-slot"; rows "Average volume", "Share of weekly peak", "Rank" ("#{r} of {n} hour-slots"), "Weekday avg at {hour}", "Weekend avg at {hour}"; note filtersNote (`:583-601`)
- [ ] RampKey colour scale: ends "Quieter" / "Busier"; hover readout "{compact} vehicles" with swatch; hovering highlights the matching band of cells (selectDataRange); `role="img"` `aria-label="Colour scale from … to …"` (`:1070-1078`, `RampKey.tsx:80-106`)
- [ ] Empty: "No data for the selected filters" (`:1069`)

**Row D-2 — "Volume by Plaza"** (`page.tsx:1081-1101`)
- [ ] Title + InfoTooltip (`:1084`)
- [ ] Sort button (icon only): `title` "Sorted highest first — click for lowest first" / "Sorted lowest first — click for highest first"; `aria-label` "Sort order: {highest|lowest} first. Activate to reverse." (`:1086-1094`)
- [ ] "View all plazas" button (chevron) → full-ranking modal (`:1095-1098`)
- [ ] Horizontal bar chart: top 10 plazas + residual bar "Others ({n})" pinned at the bottom in neutral grey; every plaza name shown; 4-step shading by size; no legend (`:358-416`)
- [ ] Tooltip: "{n} vehicles" (`:388`)
- [ ] Click a bar → modal: plaza → title {plaza}, subtitle "Toll plaza entry volume", rows "Volume in range", "Share of selected volume", "Avg per day", "Rank" ("#{r} of {n} plazas"); Others → subtitle "{n} remaining plazas combined", rows "Combined volume", "Share of selected volume", "Avg per day", "Includes" (first 5 + "+n more"), note `Use "View all plazas" for the full ranking. {filtersNote}` (`:603-635`)
- [ ] Empty: "No data for the selected filters" (`:1100`)

**Row E-1 — "Average Speed in Jams by Hour"** (`page.tsx:1104-1120`)
- [ ] Title + InfoTooltip (`:1107`)
- [ ] Smoothed line with circle markers; y axis named "km/h", framed on the data (not zero); colour by speed (Traffic blue ramp, slowest deepest) (`:418-460`)
- [ ] Tooltip: "{hour}" / "Avg speed in jams: **{x} km/h**" / "Avg jam level: {x} / 5" (`:435`)
- [ ] Click → modal: title "{hour} — jam conditions"; subtitle "Averages across Waze jam reports in the selected range"; rows "Avg speed in jams", "Avg jam level" ("{x} / 5"), "vs 20 km/h threshold", "Fastest hour", "Slowest hour"; note "Jam data covers the whole expressway (not filterable by plaza or vehicle class)." (`:637-655`)
- [ ] RampKey: ends "Slower" / "Faster", readout "{n} km/h", scrub highlights matching points (`:1111-1119`)
- [ ] Empty: "No congestion data in the selected range" (`:1110`)

**Row E-2 — Impact card ("Holiday Impact vs Normal Days" / "Arena Event Impact (venue exit entries)")** (`page.tsx:1122-1150`)
- [ ] Title switches with mode; InfoTooltip (`:1125`)
- [ ] Sort button (same title/aria-label pattern as plaza) (`:1127-1135`)
- [ ] "View all" button → full-list modal (`:1136-1139`)
- [ ] Segmented "Events" / "Holidays" (default Holidays) (`:1140-1147`)
- [ ] Diverging bar chart of % deviation: 9 most-deviant entries; labels truncated (events "{label…} · MM-DD", holidays to 22 chars); zero markLine; x axis "%" (`:472-539`)
- [ ] Legend "Above baseline" / "Below baseline" (not clickable, `selectedMode:false`) (`:515-520`)
- [ ] Tooltip: "**{full label}**" / "{±x.x%} vs same-weekday baseline" / "Baseline: **{n}** vehicles" / "Actual: **{n}** vehicles" (`:494-505`)
- [ ] Click bar → event modal (title label; subtitle "{n} events|Event · {Weekday}, {date}"; rows "{plaza} entries that day", "Same-weekday baseline", "Deviation", optional "Reported attendance", "Days behind baseline", "Note: This date is also a holiday"; baseline note) (`:657-675`) or holiday modal (subtitle "Holiday traffic vs normal days"; rows optional "Holiday type", "Avg holiday volume", "Same-weekday baseline", "Avg deviation (all years)", one row per year "{±%} · {n} vehicles"; methodology note) (`:677-691`)
- [ ] Empty: "No impact data available" (`:1149`)

**Modals** (`page.tsx:1152-1293`)
- [ ] Detail modal: `role="dialog"` `aria-modal="true"` `aria-label={title}`; accent bar, TrendingUp icon, title/subtitle, "Close" button (`aria-label="Close"`), zebra key/value rows, footer note with info icon; backdrop click closes (no Esc handler) (`:1153-1183`)
- [ ] "All plazas" modal (`aria-label="All plazas"`): title "Volume by Plaza — Full Ranking", subtitle "{n} toll plazas"; table columns "#", "Plaza", "Volume", "Share"; Close button (`:1186-1219`)
- [ ] Events full list (`aria-label="All events"`): title "Arena Events — Full List", subtitle "{n} events vs same-weekday baseline · click a row for details"; columns "Date", "Event", "Plaza volume", "Baseline", "Deviation" (coloured +/-); rows clickable → event detail modal (`:1222-1265`)
- [ ] Holidays full list (`aria-label="All holidays"`): title "Holidays — Full List", subtitle "{n} holidays · click a row for details"; columns "Holiday", "Avg volume", "Baseline", "Deviation", "Days"; sorted by deviation desc; rows clickable → holiday modal (`:1266-1288`)

**States (all Descriptive charts)**
- [ ] Loading with no data: ChartSkeleton (chart-shaped bars, `aria-hidden`) (`:713`, `ChartSkeleton.tsx`)
- [ ] Error: "Live data unavailable — is the backend running on port 4000?" (`:714`)
- [ ] Footer filter note in every modal: `Filters: {n plaza(s)|all plazas} · {all classes|Class n} · {from} to {to}` (`:553`)

#### Predictive tab

**Filter row** (`page.tsx:792-825`)
- [ ] "Range" label + icon; segmented "3 mo" / "12 mo" / "All" only (no Custom); sets the history shown on the volume card (`:796-809`)
- [ ] No Weather control on this tab; the Descriptive weather value is still sent (`:793-795`, `:833`)

**Card 1 — "Traffic Volume Walk-Forward Forecast"** (`PredictiveVolumeChart.tsx`, full width)
- [ ] Loading (no data yet): "Loading ML forecast from AWS…". There is no separate error state; a failed fetch stays on this message (`:584-590`)
- [ ] Title "Traffic Volume Walk-Forward Forecast" + InfoTooltip (`:1405-1408`)
- [ ] Finding banner: "**Next {N} days** · **{avg}** vehicles/day on average · peak {day|week|month} **{date}** ({n}) · typical error **{x%}**" + red " · failed acceptance, shown for comparison" when model not accepted (`:1412-1422`)
- [ ] "Models" toolbar label + icon; pill toggles "LSTM", "Prophet", "Holt-Winters", "SARIMAX", "Holts Linear", each tinted its series colour when on; `aria-pressed`; at least one must stay on (title "At least one model must stay selected"); title "{Show|Hide} {label}" (`:442-495`)
- [ ] Holt-Winters and Holts Linear disabled while Weather is on; title "{label} uses no weather inputs — turn Weather off to show it" (`:465-472`)
- [ ] Default model selection = API `championModel` (falls back to LSTM until it arrives); user choice is never overridden (`:203-207`, `:285-294`)
- [ ] "Weather on" / "Weather off" toggle (default on); title "Showing the weather-aware forecasts and rainfall bars" / "Showing the weather-free forecasts"; switches to the weather-free model variants (`_nw`) and changes the metrics table (`:1428-1439`)
- [ ] "View" segmented "Daily" / "Weekly" / "Monthly" (default Weekly); titles "One point per day — the resolution the models actually forecast" / "Averaged per {week|month} — a viewing aid, not a separate forecast"; Daily trims past to 90 d; Monthly forces ≥28 d ahead (`:1443-1460`)
- [ ] "Ahead" pills "2 wk" (14) / "1 mo" (28) / "2 mo" (60) / "3 mo" (90); disabled titles "Monthly view needs at least one month ahead" / "Beyond the stored forecast" (`:1462-1474`)
- [ ] Zone key row: swatch "**Past** trained · {n}d shown"; "**Present** tested on real counts · {n}d"; "**Future** forecast · {n}d · to {date}" + " · whole {weeks|months} shown" when a partial tail is trimmed (`:1479-1510`)
- [ ] Chart: series "Actual Volume" (neutral line), one "{Model label} Prediction" per visible model, "Rainfall (mm)" bars on right axis (weather on) (`:986-1077`)
- [ ] Chart zones (markArea) labelled "Past" / "Present" / "Future" + dashed dividers at test start and forecast start (`:1003-1023`)
- [ ] Period dividers "W1, W2…" (Weekly) / "M1, M2…" (Monthly), thinned to ~12 (`:1029-1059`)
- [ ] Aggregated badge (graphic text) "every point = 7-day mean" / "every point = monthly mean" (`:898-906`)
- [ ] Y axis "Total Vehicle Volume" (daily) / "Avg daily volume" (aggregated), "k" labels; right axis "Daily rainfall (mm)" / "Avg daily rainfall, mm" (`:957-985`)
- [ ] X axis month-start ticks, forecast start and end always labelled; year on second line when range spans years (`:806-861`, `:929-956`)
- [ ] Legend (bottom, circle icons): "Actual Volume", "{Model} Prediction"…, "Rainfall (mm)" (`:907-921`)
- [ ] dataZoom slider under the chart (0–100%) (`:922-928`)
- [ ] Tooltip: date; "{Series}: **{n}**"; rainfall "Rainfall: **{x} mm** · {band}" or aggregated "Rainfall: **{x} mm/day** mean, wettest day **{y} mm** - {band}"; footer "Click to view hourly" / "Switch to Daily to open a day" (`:865-897`)
- [ ] Click a point or x-axis label (Daily view only) → Hourly Breakdown screen (`:669-676`, `:1514`)
- [ ] Rainfall key (weather on): "Rainfall" (title "Taller bar = wetter day." / "Bar height is the {week|month}'s mean rainfall; bar colour is its wettest single day."), bands "Light < 7.5 mm", "Moderate 7.5–15 mm", "Heavy 15–30 mm", "Intense ≥ 30 mm" (`:1518-1528`, bands `:772-777`)
- [ ] Narrative Explanation (ModelNarrative): collapsed = "Generate report" button (FileText icon) (`ModelNarrative.tsx:177`, `NarrativePanel.tsx:140-152`)
- [ ] Narrative open: Sparkles tile, heading "Narrative Explanation", "Hide report" button; context line "Generated from the stored validation metrics for the models currently selected · {n} scored days, {start} to {end}, forecasting 14 days ahead · weather-driven variants|weather-free variants" (`ModelNarrative.tsx:179-276`)
- [ ] AI read-out (AiModelInsight): loading "Reading the metrics" (+ " — {n}s so far; the free tier can take up to a minute" after 8 s), `role="status"`; summary paragraph; per-model bullet list "{Model} — {verdict}"; amber caveat box; disclaimer line; error row `role="alert"` with "Try again" button (`AiModelInsight.tsx:168-229`)
- [ ] "Validation evidence" disclosure (`<details>`, `.evidence-summary`): ShieldCheck tile, chip "{Model} · WMAPE {x%} · MASE {y}", "Show"/"Hide" + chevron (`:1549-1575`)
- [ ] Evidence → "Held-out accuracy" heading + InfoTooltip; "Show secondary metrics" / "Hide secondary metrics" toggle (`:497-509`)
- [ ] Metrics table, one row per selected model: "Model" (colour dot, label, note "Rank #{r} of {N}" green or "Rejected" red; sticky column), "WMAPE", "MASE" (title "Error relative to repeating last week. Below 1.0 beats it."; green <1, red ≥1), "MAE (veh)", "RMSE (veh)", "R²" (`:510-579`)
- [ ] Secondary columns: "MAPE", "sMAPE", "RMSSE", "Train R²", "Gap" (Gap red >0.15, green otherwise) (`:520-575`)
- [ ] Metrics show "—" before fetch/failure (no hardcoded fallback numbers) (`:47-53`)
- [ ] Evidence → WeatherEvidencePanel (only when Weather on; renders nothing while loading/error): heading "Does weather change the forecast?" + InfoTooltip; verdict sentence; per-model bars "Error with weather" / "Error without" with %; per-model delta "{x} pts better with weather" / "{x} pts worse with weather" / "no difference"; caption "Shorter bar = more accurate."; "How much each weather signal moves with traffic" chips "{variable} {almost none|weak|moderate|strong|no data}" + "on chart" tag, chip title "Correlation with daily volume r = {r}" (`WeatherEvidencePanel.tsx:75-177`)

**Card 1b — Hourly Breakdown (drill-down replacing card 1)** (`PredictiveVolumeChart.tsx:1230-1367`)
- [ ] Title "Hourly Breakdown — {date}" + InfoTooltip; weekday pill; green "Forecast" pill for future days (`:1235-1248`)
- [ ] Summary line: forecast day "Forecast day: each model's daily total spread over a typical {weekday}." or observed "Peak **{h · n}** · quietest **{h · n}** · {Model} was **{x}% under|over** the day's actual"; weather "rain **{x} mm** (heaviest {hour})" / "no rain recorded" · "{min}–{max}°C" (`:1249-1276`)
- [ ] Weather-filter notes (when Dry/Wet carried from Descriptive): see Never-cut (`:1277-1283`)
- [ ] "← Back to daily" button (`:1285-1294`)
- [ ] Models toolbar (same pills) + "Weather" toggle with sun icons (`:1297-1322`)
- [ ] Chart: "Actual Volume" (area line, only if the day has actuals), "{Model} Prediction" lines, "Rainfall (mm)" bars; y "Vehicles per hour"; right "Rainfall (mm)"; tooltip "{hour} · {temp}°C" + series values; legend (`:1127-1228`)
- [ ] States: "Loading hourly breakdown…"; error text (server message / "Request failed" / "Failed to load hourly data") in red (`:1324-1332`)
- [ ] Stat tiles: "Day Actual"; "{Model} Predicted" + "{±x.x}% vs actual"; "Peak Hour"; "Quietest Hour" ("{hour} · {n}") (`:1334-1365`)

**Card 2 — "Predictive Congestion State Map"** (`PredictiveCongestionChart.tsx`, half width)
- [ ] Loading: "Loading ML congestion forecast from AWS…" (`:966`)
- [ ] Error state: title + InfoTooltip, red error text ("No congestion forecast in the payload" / "Forecast unavailable" / HTTP message), "Try again" button (re-runs 3-try load) (`:945-964`, `:572`, `:578`)
- [ ] Title "Predictive Congestion State Map" + InfoTooltip (`:1516-1519`)
- [ ] Model pill "{model} · {acc}%" (+ " · not accepted", title = rejected reason) (`:1521-1531`)
- [ ] Stale pill "⚠ refresh overdue · {n}h old" when base > 2 h old (title names the scheduled task and log) (`:1532-1542`)
- [ ] Expired pill "⚠ expired · {n}h old" when no hours remain (title points to README) (`:1543-1555`)
- [ ] Subtitle "Forecast made **{Sat, 4 Oct, 2 PM}**, next {n} hours|next {n} days · renews every hour" + amber " · {n} hours not yet forecast"; expired variant "No hours left in this forecast · last covered **{…}**"; hidden help `title` span (`:1558-1568`)
- [ ] Range group (`role="group"` `aria-label="Forecast range"`): "Next 12 h" / "Next 24 h" / "Next 7 days", `aria-pressed`, `title` = help text (`:1576-1596`, `:20-24`)
- [ ] Finding banner (red/amber/green by severity): headline + "Worst:/Heaviest: …" lead line (hidden in week view) (`:1599-1609`)
- [ ] 2×2 stats: "{n} of {N}" "exits with a jam"/"all moving"; "km {a}–{b}" "{n} km affected"/"none predicted" (title "One continuous stretch" / "Not contiguous — clear exits sit between the affected ones"); "{n} of {h}h"/"all {h}h" "at the worst exit"/"same every hour" (week: "{n} h/day" "at the worst exit"); "{x}%" "average jam chance" (or confidence range "confidence · some cells under 80%" / "confidence across congested cells") (`:1616-1649`)
- [ ] Exit picker: "{n} of {N} exits"; `<select>` "Add exit…" / "⚠ Add exit…" (amber, title "Some hidden exits turn severe sooner than any shown"), options "{exit} — severe at +{h}h" / "{exit} — stays clear"; "All {N}" button; "reset" link. Default shows 5 southernmost exits (`:1658-1684`, `:524`)
- [ ] Legend (hourly): "Moving no jam / >20", "Heavy 10–20", "Severe <10", "km/h"; Heavy dimmed with title "No exit-hour in this forecast falls in the 10-20 km/h band" when absent; "* km-post estimated" (title "No surveyed km-post for this exit; the distance is interpolated from its neighbours.") (`:1706-1731`)
- [ ] Legend (week): "none", "1-2 h", "3-5 h", "6-8 h", "9 h+" + "expected congested hours per day" (`:1696-1705`)
- [ ] Hourly heatmap "Predicted congestion state": rows = exits "{exit} · km {km}" ordered by km-post (Balintawak top); columns "now|+{n}h" over clock time ("3PM"); elapsed hours greyed; header labels thinned past 14/20 columns; blank "Pending" cells for hours not yet forecast (`:1147-1364`)
- [ ] Bar strip "Segments congested" under the grid: axis title "Exits congested at each hour ahead, of {N}", y labels "0" / "{N} exits", peak bar highlighted, value labels (`:1285-1387`)
- [ ] Cell tooltip: exit · km, hour; "Chance of congestion **{>95%|<5%|n%}**"; per-state rows Severe/Heavy/Moving with speed band and chance; close-call or "* the leading state is under 80% sure" note; fallback "Predicted state / Meaning / Confidence ({n}% · indicative)"; "Typical traffic ~{n} veh/h · {x}× · {busyness}" + quiet/busy note; "Expected jam"/"If a jam forms" block (where, "Queue length", "Est. delay", "Speed in the queue", "3 in 4 under …" tails, basis line) (`:1173-1247`, `:129-179`)
- [ ] Pending-cell tooltip and strip tooltip "Not yet forecast — …" / "{n} of {N} segments congested" (`:1175-1188`)
- [ ] Week heatmap "Congested hours per day": columns "{Sat}\n{Oct 4}", number printed in each cell; tooltip exit · km, day, "Expected congested hours **{x.x}** of {known}", "Of those, crawling {n} h", "First likely from {clock}", partial-day and "added up" notes (`:1055-1145`)
- [ ] "What to act on · {n} episodes · {n} severe, {n} heavy" + "View all {n}" button (when >4) (`:1741-1759`)
- [ ] Episode rows (first 4): pill "SEVERE"/"HEAVY"; exit + "km {km}"; jam summary line "~{queue} queue {where} · ~{delay} delay" (title "Typical for this exit at this hour, from four years of Waze jam history") + " · quiet hour, check for incidents" / " · {x}× usual traffic"; window "now → +{n}h · {span}h"; confidence "{n}%" (amber <80%) (`:1403-1444`)
- [ ] Empty episodes: "No heavy or severe congestion predicted in the next {n} hours." (`:1761-1764`)
- [ ] Narrative Explanation (CongestionNarrative → NarrativePanel): "Generate report" → heading, "Hide report", chips "{model} {x}% accurate", "still beats no-change at +{h}h" / "no better than no-change by +{h}h"; context line; AI read-out (same states as card 1) (`CongestionNarrative.tsx:54-112`)
- [ ] "Validation evidence" disclosure (only when ≥2 horizon rows): summary chip "{accuracy fades with distance|improves|holds across the horizon} · {x}% at +1h → {y}% at +{h}h · {beats no-change|no better than no-change}"; Show/Hide (`:1798-1834`)
- [ ] Evidence 1 "How it was tested" (`:1840-1847`)
- [ ] Evidence 2 "Did past predictions match what really happened?" + InfoTooltip + ReplayChart (SVG; legend "Actually congested" solid / "Model expected" dashed; end labels "Actual"/"Expected"; day ticks; hover crosshair + box "Model expected {x} of {n}" / "Actually congested {n} of {n}"; `role="img"` aria-label); stats "{x} exits" "average gap between the lines", "{r}" "correlation · 1.00 traces perfectly", "{x}%" "exit-hours with the exact state right"; example lines (`:1850-1883`, `:292-396`)
- [ ] Evidence 3 "What {x}% means": bars for "{model} (this card)", "Assume each exit does what it usually does at this hour", "Assume nothing changes from now (+1h)", "Assume nothing changes from now (+{h}h)", `Always say "Moving"` (`:1887-1911`)
- [ ] Evidence 4 "How much to trust each colour": table "State", "Share of real hours", "When the card shows it, it is right", "Of the real hours, it catches" (colour-graded) + severe-recall warning (`:1914-1953`)
- [ ] Evidence 5 "Is a 60% chance really 60%?": calibration chips "said {x}% → happened {y}%" (green/amber/red by gap; title "{n} unseen exit-hours"); "Green: within 5 points · Brier {x}" + InfoTooltip (`:1957-1985`)
- [ ] Evidence 6 "Does it hold up 12 hours out?": mini bar per horizon (green where it beats no-change; title "+{h}h — model {x}, "nothing changes" {y}"); caption (`:1988-2002`)
- [ ] Evidence 7 "How exact are the queue and delay figures?": table "Typical error" / "This card" / "One corridor-wide figure", rows "Queue length · real median {m}", "Delay · real median {s} s"; caption (`:2006-2048`)
- [ ] Evidence 8 "Does it line up with traffic volume?": jam-rate bars "{band} usual volume"; "This forecast, by the same measure…" rows "Quiet hours (under 0.7×)", "Usual hours (0.7–1.3×)", "Busy hours (1.3× and over)" with "· {n} cells"; captions (`:2053-2105`)
- [ ] Evidence 9 "Checked against what happened": live-score table "Hours ahead" / "Jam / no jam right" / "Old colouring" / "Exact state right" or pending paragraph (`:2109-2153`)
- [ ] Evidence footnote "States from Waze jam speeds · Severe under {10}, Heavy {10}–{20}, Moving above that or no jam" + InfoTooltip + " · no Heavy hour in the current forecast" (`:2155-2160`)
- [ ] Episodes modal: `role="dialog"` `aria-modal` `aria-label="All predicted congestion episodes"`; title "Predicted congestion · next {n} hours"; subtitle "{n} episodes across {n} segments · {n} severe, {n} heavy · grouped by location"; per-exit groups "{exit} km {km} … {n} episode(s)"; "✕" close (`aria-label="Close"`); backdrop click; **Esc closes**; body scroll locked; footer note (`:2167-2204`, `:592-602`)

**Card 3 — "Event Surge Impact by Exit"** (`PredictiveEventChart.tsx`, half width)
- [ ] Loading: "Loading ML event surge forecast from AWS…" (also shown if the fetch fails) (`:272-278`)
- [ ] Title "Event Surge Impact by Exit" + InfoTooltip (`:391-394`)
- [ ] Mode pill "Observed · {n} past event days" (green) or "Forecast · {Sat, Oct 4, 2026}" (`:396-404`)
- [ ] Model pill "✓ tested · {x}% error held-out" / "failed test · …" (title = diagnosis) (`:405-417`)
- [ ] "Showing" select: "Past events — what {event} days did" + one option per upcoming event "{Sat, Oct 4, 2026} — {act}{ (day n)}{ · venue if not Arena}" (`:424-451`)
- [ ] Baseline InfoTooltip beside the select (`:452-456`)
- [ ] Finding banner: observed "On a **{event}** day, **{exit}** takes {x}% of the surge — {m}× a normal day, +{n} vehicles." / upcoming "During **{act}** (inferred) at {venue} ({n} capacity) on **{date}** · in {n} days: expect **+{n}** extra vehicles. **{exit}** takes {x}% of it, {m}× its normal {weekday}." (`:460-484`)
- [ ] 2×2 stats: "+{n}" "extra vehicles"; "{n} of {N}" "exits with a material rise"; "+{x}%" "uplift at those exits"; "{x}%" "carried by the top {2}" (`:489-494`)
- [ ] Bar chart "Added by event": exits with ≥4% share of the surge; x axis "Extra vehicles per day" ("+12k"); bar labels "+{n}  +{x}%"; tooltip "Added by event +{n} (+{x}%)", "Normal day", "With event", "Share of surge" (`:290-356`, `:497-499`)
- [ ] Narrative Explanation (EventSurgeNarrative): chips "{model} {x}% error", "beats ignoring the event" / "no better than ignoring the event"; context line; AI read-out (`EventSurgeNarrative.tsx:65-123`)
- [ ] "Validation evidence" disclosure: chip "{model} · {x}% on held-out events · vs {y}% ignoring the event"; "the other {n} exits" note; Show/Hide (`:535-574`)
- [ ] Evidence: "Did past predictions match what really happened?" + "**{n} event days the model never saw**, in date order · the gap is the error" + EventReplayChart (dumbbell SVG; legend "Actually arrived" / "Model predicted"; "vertical axis zoomed to these days"; first/last date labels; hover box "Predicted {n}" / "Actually {n}" / "off by {x}%"; `role="img"` aria-label) (`:577-585`, `:89-166`)
- [ ] Evidence stats "{x}%" "off on the typical event day", "{x}%" "error across all exit-days", "{x}%" "if you ignored the event"; example lines "{Kind} — **{date}**: predicted {n}, actually {n}." (`:586-609`)
- [ ] Evidence caption "{n} Philippine Arena dates · attendance is not in the calendar, the largest remaining source of error" + InfoTooltip (`:610-620`)
- [ ] Evidence model table "Model" / "Error on held-out events", first row tagged "used", italic row "Ignoring the event"; caption (`:624-660`)
- [ ] Evidence chip row: minor exits "{exit} +{n}" (title "… — too small to chart"), unchanged exits "{exit} no change" (title "… vehicles/day, no material event effect"), first 8 then "+{n} more" / "fewer" toggle, "· {n} barriers/ramps excluded" (title lists them) (`:662-691`)

#### Prescriptive tab

**Filter row** (`page.tsx:810-815`)
- [ ] Note "Staffing, congestion response and event ranking, computed from the Predictive tab's own forecast — Range does not apply." (no Range control) (`:811-814`)

**Panel 1 — "Booth Staffing Plan"** (`PrescriptiveTrafficPanels.tsx:153-375`, full width)
- [ ] States: "Prescriptive traffic unavailable: {error}"; "Computing the staffing plan…"; "No future days in the volume forecast."; "No plaza volumes are recorded to apportion the forecast with." (`:159-162`)
- [ ] Title "Booth Staffing Plan" + InfoTooltip (`:218-219`)
- [ ] View toggle "Week ahead" / "Hour by hour" (`:198-214`)
- [ ] Throughput slider "One booth serves **{n} veh/hr**", range 150–800, step 25, default 350 (refetches) (`:223-229`)
- [ ] Info banner: "**{Sat, Oct 4}: open {n} booths across the corridor at the peak** — {±n} versus a typical day. The largest change is at **{plaza}** ({a} → {b}, peak {hour}). {n} of the next {N} days need more than typical staffing somewhere on the corridor." / "No day in the next {N} exceeds typical staffing anywhere." (`:233-244`)
- [ ] Alert banner "**Not enough booths.** …" + "{n} more plaza-day(s) this week run past their booths too, marked **!** below." (`:246-257`)
- [ ] Week table columns "Plaza", "Peak hour", "Booths" (title = booth basis or "No toll booths mapped in OpenStreetMap: not capped"; "—" when none), "Typical", one column per day "{Sat}/{Oct 4}"; cells show booths + "+n"/"-n" delta (red/green) + red "!" for over-capacity (cell title explains the queue) (`:294-344`)
- [ ] Hour view: intro text; per plaza row name + "{x}% of corridor", 24-cell HourStrip (peak hour solid, red hatching = need beyond booths; cell title "{hour} — {n} booths for {n} vehicles; {n} can open, so about {n} vehicles queue"), right column "peak **{n}** of {booths} at {hour}" + red "{n}/h queue at {hour}" + "{where} full" (`:259-292`, `:116-148`)
- [ ] "Show all {n} plazas" / "Show the 8 busiest" toggle (when >8) (`:347-354`)
- [ ] Footnote (champion, WMAPE, acceptance, stale-forecast warning, profile window, booth source) (`:356-372`)

**Panel 2 — "Congestion Response Advisory"** (`PrescriptiveTrafficPanels.tsx:380-502`)
- [ ] States: "Prescriptive traffic unavailable: {error}"; "Ranking segments…"; "No congestion forecast available." (`:405-407`)
- [ ] Title "Congestion Response Advisory" + InfoTooltip (`:427-428`)
- [ ] Banner variants: "**Operator alert:** severe congestion predicted within **{n}h** — counter-flow advisory for **{segments}**. {n} more segment(s) elevated but not advised." / "**No segment reaches Act.** {n} at Prepare — stage, don't intervene." / "**No forecast segment crosses Prepare** inside the 12-hour horizon, but {n} segment(s) have no forecast at all." / "**Corridor clear.** No segment crosses Prepare inside the 12-hour horizon." (`:430-445`)
- [ ] Top-3 cards: "{i}. {segment}"; SignalGlyph (Act=congested red cross, Prepare=slow amber arrow, Monitor=ring) + label "ACT"/"PREPARE"/"MONITOR"; "First High **+{n}h**" · "Peak **{x}%** at +{n}h" or "Never reaches High inside the horizon"; action sentence (`:447-470`)
- [ ] "Show|Hide the {n} elevated segment(s) not advised" toggle → chips "{Label} · {segment} · +{n}h" (`:472-487`)
- [ ] Missing-forecast note "**No forecast:** {list}. Not ranked, and not clear either: treat it/them as unknown until the congestion model next runs." (`:489-494`)
- [ ] Footnote on volume-to-capacity ratio (`:496-499`)

**Panel 3 — "Event Intervention Ranking"** (`PrescriptiveTrafficPanels.tsx:507-582`)
- [ ] States: "Forecast unavailable: {error}"; "Loading forecast…"; "No event surge forecast available." (`:511-513`)
- [ ] Title "Event Intervention Ranking" + InfoTooltip (`:527-528`)
- [ ] Banner "**Event traffic management plan: {top 3 exits}.** On an event day these three exits carry **{n}** extra vehicles between them. Deploy patrol and advisory resources here first — the surge is anchored on {exit}. Next up: **{act}** on **{Saturday, October 4}** (recurring, inferred)." (`:530-539`)
- [ ] Table (top 10, top 3 highlighted): "#", "Exit", "Extra vehicles", "Uplift" ("{x.xx}×"), "Events seen", "Estimate" ("firm|fair|loose (±{x})"), "Score" (closeness 0–1) (`:541-568`)
- [ ] Footnote: weights, Estimate thresholds, link to Predictive Event Surge card (`:575-579`)

---

### API endpoints
| # | Method + path | Query / body | Caller | Caching / polling |
|---|---|---|---|---|
| 1 | GET `${BACKEND}/api/traffic/analytics` | `months=3\|12\|all` **or** `from=YYYY-MM-DD&to=YYYY-MM-DD`; optional `plazas=a,b` (never set, no UI), `vehicleClass=Class 1\|Class 2\|Class 3`, `weather=dry\|wet` | `page.tsx:168-181` (Descriptive) | `cachedJson`, 5-min TTL, stale-while-revalidate, keyed by URL (`lib/cached-json.ts:32`). No polling |
| 2 | GET `${BACKEND}/api/traffic/forecast` | `months=3\|12\|all` or `from&to` (custom carried from Descriptive), `split=80_20` (always), optional `weather=dry\|wet` | `PredictiveVolumeChart.tsx:312-325` | plain fetch on every prop change. Reads `volumes`, `championModel`, `modelMetrics`/`metrics`, `horizonAccuracy`, `split` |
| 3 | GET `http://localhost:4000/api/traffic/forecast/hourly` (**hard-coded host, not BACKEND**) | `date=YYYY-MM-DD&model={LSTM\|Prophet\|HoltWinters\|SARIMAX\|HoltsLinear}&weather={all\|dry\|wet}`; one request per selected model | `PredictiveVolumeChart.tsx:409-416` (drill-down) | refetches when date/models/weather change |
| 4 | GET `${BACKEND}/api/traffic/weather-evidence` | none | `WeatherEvidencePanel.tsx:62` | once per mount |
| 5 | GET `${BACKEND}/api/traffic/forecast?months=all` | none | `loadForecast()` `prescriptiveTraffic.shared.ts:112-140`: used by PredictiveCongestionChart (`:556`), PredictiveEventChart (`:193`), EventInterventionPanel (`useForecast`, `:24-35`) | module-scope promise cache for the session (no TTL); failure not cached. Congestion card retries up to 3 times (waits 1 s, then 3 s) and has a manual "Try again". Reads `congestion`, `events`, `upcomingEvents`, `championModel`, `mlConfidence`, and extras `congestionModel`, `congestionEval`, `congestionJamEval`, `congestionVolumeEval`, `congestionLiveScore`, `congestionHorizonAccuracy`, `eventSurgeMetrics`, `eventSurgeEval` |
| 6 | GET `${BACKEND}/api/traffic/prescriptive` | `throughput={150..800}` (Booth panel slider) / `throughput=350` (Congestion Response panel) | `loadPrescriptive()` `prescriptiveTraffic.shared.ts:231-251` | cached per throughput value for the session; failure not cached |
| 7 | POST `${BACKEND}/api/ai-insight/model-narrative` | JSON `{quantity:"volume", metrics[], horizonDays:14, scoredDays, windowStart, windowEnd, weatherMode:"with"\|"without"}` | `AiModelInsight.tsx:96-113` via ModelNarrative (only after "Generate report") | 100 s abort timeout; re-requested when model set / weather changes; 1 s elapsed ticker (not polling) |
| 8 | POST `${BACKEND}/api/ai-insight/congestion-narrative` | `{models:[{model,accuracy,accepted,rejectedReason}], baseline, horizons:[{horizon,accuracy,persistence}], situation:{exitsTotal,exitsSevere,hoursCovered,neverPredictsHeavy}}` | `CongestionNarrative.tsx:59`, `95-111` | same as #7 |
| 9 | POST `${BACKEND}/api/ai-insight/event-surge-narrative` | `{models[], noAdjustment, coverage:{eventDays,firstEvent,lastEvent}, situation:{mode,eventTitle,eventDate,venue,exitsMaterial,exitsTotal,totalAdded,upliftPct,topExit,topAdded,topSharePct,top2SharePct}}` | `EventSurgeNarrative.tsx:69`, `99-122` | same as #7 |

`BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"`. **No polling anywhere on this page**: the congestion card's "renews every hour" refers to the server-side refresh, and the client never refetches on a timer.

### localStorage / sessionStorage keys
- None. No file in scope reads or writes localStorage or sessionStorage, and none uses URL params (`useSearchParams`/router).

### "Never cut" facts on this page
**Descriptive**
- KPI definitions: "All vehicles counted at NLEX toll plazas over the selected Range, compared with the equivalent prior period." (`page.tsx:926`); Congestion Index "0 (free flow) to 5 (standstill)" with value format `${x.toFixed(2)} / 5` (`:961-962`).
- Comparison window: "vs previous period" (equal-length prior period) (`:934`); "vs prev · Waze jam level" (`:969`).
- Peak Hour is weekday-only: "Peak Hour (Weekdays)", "{n} vehicles/hr avg" (`:947-949`).
- Rolling windows: "7-day average" (daily), "24-hour average" (hourly) (`:118`, `:285`).
- Hourly only when the API ships hourly rows: "Hourly detail is available for ranges up to 2 weeks" (`:1029`). Grain minimums: daily 2 d, weekly 14 d, monthly 60 d (`granularity.ts:26-30`).
- Plaza chart = top 10 + `Others (${n})`; impact chart = 9 most-deviant entries (`:364-375`, `:482-485`).
- Speed: "vs 20 km/h threshold" (`:649`); "Jam data covers the whole expressway (not filterable by plaza or vehicle class)." (`:653`); "Averages across Waze jam reports in the selected range" (`:645`); units "km/h", "{x} / 5".
- Baseline method (event): "Baseline = average entries at ${plaza ?? "the same exit"} on the same weekday within ±45 days, excluding other event days and holidays. Figures are NLEX entries, so they capture traffic joining the expressway at the venue's own exit rather than arrivals." + holiday overlap warning "This date is also a public holiday, so the deviation reflects the holiday as much as the event. " (`:669-673`).
- Baseline method (holiday): "…same weekday within ±45 days of that date, excluding holidays and event days. Comparing locally rather than against all-history keeps the 2020–2021 pandemic period from distorting other years." (`:689`).
- Impact tooltip: "{±x.x%} vs same-weekday baseline", "Baseline: {n} vehicles", "Actual: {n} vehicles" (`:497-503`).
- Event title qualifier "Arena Event Impact (venue exit entries)" (`:1125`).
- Filters footnote template: `Filters: ${n} plaza(s)|all plazas · {all classes|Class n} · ${from} to ${to}` (`:553`).
- Error: "Live data unavailable — is the backend running on port 4000?" (`:714`).

**Predictive: volume**
- Model test method: chronological split arm `80_20` always requested (`PredictiveVolumeChart.tsx:70`, `:321`); zones "Past trained", "Present tested on real counts", "Future forecast" with day counts (`:1479-1510`).
- Validated horizon 14 days → "forecasting {14} days ahead" (`:84`, `ModelNarrative.tsx:271-272`).
- Accuracy vs baseline: MASE header title "Error relative to repeating last week. Below 1.0 beats it." (`:516`); held-out tooltip "Scored on the Present zone: real daily counts the model never trained on. WMAPE is the headline error; MASE below 1 beats repeating last week's pattern. Show more adds the secondary error measures." (`:501`).
- Rank/acceptance labels `Rank #${rank} of ${total}` / "Rejected" (`:275`); finding suffix " · failed acceptance, shown for comparison" (`:1420`); evidence chip `{label} · WMAPE {x} · MASE {y}` (`:1568`).
- Uncertainty at range: "typical error **{rangeErr}**" taken from the rolling-origin horizon bucket for the chosen Ahead window (falls back to the headline WMAPE) (`:1381-1382`, `:1419`).
- Weather: Holt-Winters/Holts Linear "uses no weather inputs — turn Weather off to show it" (`:472`); Weather on/off swaps to `_nw` model variants (`:592-594`).
- Rainfall bands (PAGASA): Light <7.5, Moderate 7.5–15, Heavy 15–30, Intense ≥30 mm; aggregated tooltip "Rainfall: **{x} mm/day** mean, wettest day **{y} mm** - {band}" (`:772-777`, `:885`).
- Data gap: `No ${weather} hours recorded for this date — weather data only covers up to 1 Jul 2026. Bars are hidden; the model curve is unaffected.` and `Showing ${weather} hours only (${n} of 24). The models carry no weather dimension, so their curves are unfiltered.` (`:1280-1281`).
- Aggregation honesty: "every point = 7-day mean" / "monthly mean"; "Avg daily volume"; "Switch to Daily to open a day"; " · whole {weeks|months} shown" (`:902`, `:960`, `:894`, `:1505`).
- Hourly drill error/accuracy: "{Model} was **{x}% under|over** the day's actual" (green ≤5%) (`:1260`); "{x}% vs actual" (`:1349`).
- AI disclaimer: "Written by the language model from the validation metrics shown on this card. Check any figure against the numbers above before acting on it." (`AiModelInsight.tsx:226`).
- AI errors: "The model took too long to answer. The free tier queues under load -- try again." / "Could not reach the explanation service." / "The explanation service answered {status}." / "The explanation service is busy — it allows only so many requests a minute. Wait a moment and try again." / "The model did not answer in time. The free tier queues under load, so a second attempt usually gets through." / "Could not reach the explanation service. The rest of this page is unaffected — the figures above come from the warehouse, not from it." (`AiModelInsight.tsx:118-161`).
- Weather verdicts: "Weather inputs were not tested for the models on the chart." / "No. Adding weather data does not make this forecast more accurate." / `A little. With weather data, ${model}'s error drops from ${x}% to ${y}%.` / `A little. Weather data makes every model on the chart slightly more accurate; ${model} gains the most.` / `Only for some. Weather data helps ${n} of ${N} models on the chart; ${model} gains the most.` (`WeatherEvidencePanel.tsx:100-105`).

**Predictive: congestion**
- Window: "Next 12 h" / "Next 24 h" / "Next 7 days" (168 h) (`PredictiveCongestionChart.tsx:20-24`); subtitle "Forecast made {base}, next {n} hours · renews every hour" + "{n} hours not yet forecast" (`:1561-1566`).
- Staleness: `⚠ refresh overdue · ${h}h old` when >2 h, title `The hourly refresh has not published since ${baseTs}. Check the Scheduled Task "SmartFlow congestion refresh" and All_Scripts/Predictive_Modeling/refresh_congestion.log.` (`:1532-1541`); `⚠ expired · ${h}h old`, title `This forecast was generated from data ending ${baseTs} and its whole ${n}-hour window has now passed. The hourly refresh task should replace it; see All_Scripts/Predictive_Modeling/README_congestion.md.` (`:1543-1554`); "No hours left in this forecast · last covered …" (`:1560`).
- Model pill `${model} · ${acc}%` + " · not accepted" (`:1530`).
- State bands: Moving "no jam, or over 20 km/h", Heavy "10–20 km/h", Severe "under 10 km/h"; week bands "none", "1-2 h", "3-5 h", "6-8 h", "9 h+" (`:219-250`).
- Chance display: ">95%" / "<5%" caps; 50% rule for jam vs no jam; 80% low-confidence threshold "* the leading state is under 80% sure"; close call within 12 points: `Close call — ${A} and ${B} are within ${n} points.` (`:69-73`, `:55-61`, `:251`, `:1232-1235`).
- Volume context: "A jam in a quiet hour is usually an incident or roadworks rather than demand." / "Fits the traffic: this is one of the exit's busiest hours." / busyness words "a peak hour here", "busier than usual here", "a usual hour here", "quieter than usual here", "a quiet hour here" (`:77-78`, `:133-135`).
- Jam basis: `Typical for ${exit} at this hour on this kind of day · ${n} past jam-hours, Waze 2022–2026` / `Typical for ${exit} at any hour; too few past jams at this hour to be specific · ${n} jam-hours` / `Corridor-wide typical: ${exit} has too few past jams near its plaza to describe on its own` (`:161-165`).
- Headline templates: `Traffic is forecast to keep moving at every exit for the next ${n} hours.` / `Congestion builds: ${a} of ${N} exit(s) congested at +1h, rising to ${b} by +${h}h. By the peak it is ${who}, with ${n} crawling under 10 km/h.` / `${Who} — congested from the first hour and holding for the whole ${n}-hour window, ${n} of them crawling under 10 km/h at some point|, none of it severe.`; who = "every exit on the corridor" / `all but ${n} exit(s) (${list} keep(s) moving)` / `${n} neighbouring exits over about ${km} km, km ${a} to ${b}` / `${n} of ${N} exits (${list})` (`:1460-1476`).
- Lead line: `${"Worst"|"Heaviest"}: ${exit} ${"from now"|"from 3PM"|"from +nh"}, typically a ~{queue} queue {where} · ~{delay} delay.` (`:1483-1489`).
- Week math: "Each hour's chance of congestion, added up — not a count of hours." / `Part of a day — only ${n} forecast hours fall on it.` (`:1094-1095`).
- Episode action hints: " · quiet hour, check for incidents" / `${x}× usual traffic` (`:1423`).
- Evidence numbers: test window `last ${test_days} days it never saw — ${test_rows} exit-hours` (`:1842-1843`); replay "{h} hours in advance", MAE exits, correlation, match rate (`:1854-1864`); baselines vs no-model guesses (`:1893-1898`); per-state precision/recall; calibration chips + "Brier {x}" with tooltip "…0 is perfect and 0.667 is a coin toss between the three states." (`:1982`); horizon accuracy "{x} at +1h → {y} at +{h}h · green where it beats assuming nothing changes, which falls to {z} by +{h}h" (`:1999-2000`); queue/delay error table; volume jam-rate bands; live track record table + "Early figures rest on few hours and will steady as runs accumulate." (`:2144`).
- Severe-recall warning: "Severe hours are rare and the model names them cautiously, so it misses most of them as a label — check the **severe %** in each cell's tooltip rather than waiting for a red cell." (`:1949`).
- Episodes modal footer: "Confidence is the model's certainty in its classification, not the probability of congestion. Press Esc to close." (`:2200`).
- Narrative chips: `${pct} accurate`, `still beats no-change at +${h}h` / `no better than no-change by +${h}h`; context `Read from this model's held-out accuracy per hour ahead · {a} at +{h}h to {b} at +{h}h · benchmark {model} {pct}` (`CongestionNarrative.tsx:63-93`).

**Predictive: event surge**
- Observed vs forecast pills: `Observed · ${n} past event days` / `Forecast · ${date}`; `✓ tested|failed test · ${x}% error held-out` (`PredictiveEventChart.tsx:398-415`).
- Baseline tooltip: "Baseline is the same weekday and month on non-event days, so events cannot inflate their own baseline. Events span {first} to {last}." (`:453-455`).
- "(inferred)" with title "A recurring event the ETL inferred from prior years, not an announced date." (`:469`).
- Materiality: charted exits carry ≥4% of the surge; smaller ones listed as chips "— too small to chart"; "no material event effect"; `${n} barriers/ramps excluded` (`:261-264`, `:665-687`).
- Evidence: `${events_test} event days the model never saw`; "off on the typical event day" / "error across all exit-days" / "if you ignored the event"; `${events_total} Philippine Arena dates · attendance is not in the calendar, the largest remaining source of error`; holiday factor sentence; "Attendance is not recorded, so a sold-out concert and a small exhibition get the same prediction." (`:583-619`).
- Venue caveat: "It was measured on Philippine Arena days; this event is at the {venue}, a smaller venue in the same complex, so treat the figures as an upper bound." and "the uplift does not yet vary with the act or its capacity." (`:655-656`).
- Model table baseline row "Ignoring the event"; chip "{model} · {x}% on held-out events · vs {y}% ignoring the event" (`:560-561`, `:646`).
- Narrative context `Read from the held-out event-day error · measured on ${n} past event days · ignoring the event scores ${x}%` (`EventSurgeNarrative.tsx:92-96`).

**Prescriptive**
- Booth throughput default 350 veh/hr, range 150–800, step 25 (`PrescriptiveTrafficPanels.tsx:154`, `:227`).
- Over-capacity action: "Staffing cannot clear that; divert traffic or post an advisory there." with `{date} at {hour}, {plaza}'s {where} booths would need {n}, and there are {n}: about {n} vehicles an hour queue with every one of them open.` (`:249-251`).
- Champion basis: `Volume is the ${model} forecast (WMAPE ${x}%), which did not pass its acceptance gate — the staffing SHAPE comes from measured profiles, the level it is scaled to is less certain.` (`:357-359`).
- Stale forecast: `Its first day, ${forecastFrom}, is already inside the record, which now runs to ${profileTo}: the model was trained before the latest traffic was loaded, so this plan is for days already past. Retrain the volume models to plan the coming week.` vs `Its first day, ${forecastFrom}, follows the last recorded day.` (`:360-366`).
- Data sources: "Profiles measured over {from} to {to} across {n} plazas. Booth counts are from {boothsFrom}, since the warehouse holds none…"; OpenStreetMap booths; "{list} has/have none mapped, so it is/they are not capped" (`:367-371`).
- Recommended actions: Act "Deploy counter-flow and post VMS advisories before the first High hour."; Prepare "Stage units nearby; hold the advisory until probability firms up."; Monitor "No action; re-check next cycle." (`:418-422`). Advisory goes to the top 3 only; horizon "12-hour" (`:411`, `:441-443`).
- Missing data: "Not ranked, and not clear either: treat {it|them} as unknown until the congestion model next runs." (`:491-492`); V/C ratio footnote (`:497-498`).
- TOPSIS weights "0.40 vehicles / 0.25 uplift / 0.20 evidence / 0.15 interval width"; "firm under ±0.025, fair under ±0.06" (`:576-577`).
- Event plan banner names top-3 exits, total extra vehicles, anchor exit, next event date + " (recurring, inferred)" (`:531-537`).
- ILLUSTRATIVE/simulation labels: **none on this page.** All three Prescriptive panels are computed from warehouse/forecast data, not mocks.

### Visible prose likely to be shortened (verbatim)
**Page / Descriptive (`app/dashboard/traffic/page.tsx`)**
- :791/:867 subtitle — "Volume, congestion, and speed patterns across NLEX"
- :812-813 — "Staffing, congestion response and event ranking, computed from the Predictive tab's own forecast — Range does not apply."
- :926 — "All vehicles counted at NLEX toll plazas over the selected Range, compared with the equivalent prior period."
- :939 — "Total volume divided by the number of days in the Range — the corridor's typical day."
- :947 — "The hour of a weekday that carries the most vehicles on average across the Range."
- :953 — "The toll plaza with the largest share of the Range's volume."
- :961 — "Average Waze jam severity on the corridor, 0 (free flow) to 5 (standstill), over the Range."
- :980 — "Vehicles per day, week or month over the Range, with the 7-day average smoothing out weekday swings. Click a point to see that period's hourly breakdown." (click actually opens the summary modal, not an hourly breakdown)
- :1066 — "Typical vehicles per hour for each day of the week — darker cells are busier. Shows when the corridor peaks."
- :1084 — "Share of the Range's volume handled by each toll plaza. Click a bar for its hourly profile." (click actually opens the plaza summary modal)
- :1107 — "Mean speed reported inside Waze jams for each hour of the day — lower means slower-moving jams at that hour."
- :1125 — "How volume on Philippine Arena event days or public holidays compares with the normal days around them (±45-day local baseline). Toggle Events / Holidays above."
- :619 — `Use "View all plazas" for the full ranking. ${filtersNote}`
- :645 — "Averages across Waze jam reports in the selected range"
- :653 — "Jam data covers the whole expressway (not filterable by plaza or vehicle class)."
- :669-673 — "This date is also a public holiday, so the deviation reflects the holiday as much as the event. Baseline = average entries at ${e.plaza ?? "the same exit"} on the same weekday within ±45 days, excluding other event days and holidays. Figures are NLEX entries, so they capture traffic joining the expressway at the venue's own exit rather than arrivals."
- :689 — "Each occurrence is compared with its own local baseline: the average volume on the same weekday within ±45 days of that date, excluding holidays and event days. Comparing locally rather than against all-history keeps the 2020–2021 pandemic period from distorting other years."

**PredictiveVolumeChart.tsx**
- :501 — "Scored on the Present zone: real daily counts the model never trained on. WMAPE is the headline error; MASE below 1 beats repeating last week's pattern. Show more adds the secondary error measures."
- :1237 — "Blue bars are the vehicles counted at the toll plazas in each hour of this day. The model line is that model's daily prediction spread across the day in the shape of a typical same-weekday, so you can see where the day ran above or below expectation." (actuals are drawn as a line now)
- :1256 — "Forecast day: each model's daily total spread over a typical {weekday}."
- :1407 — "Daily corridor volume: the model's past fit, its held-out test period against real counts, and the forecast ahead. Pick a model above; the champion is preselected."
- :1454 — "One point per day — the resolution the models actually forecast" / "Averaged per {week|month} — a viewing aid, not a separate forecast"
- :1520 — "Taller bar = wetter day." / "Bar height is the {week|month}'s mean rainfall; bar colour is its wettest single day."

**ModelNarrative / NarrativePanel / AiModelInsight**
- ModelNarrative.tsx:267-275 — "Generated from the stored validation metrics for the models currently selected · {n} scored days, {start} to {end}, forecasting {14} days ahead · weather-driven variants|weather-free variants"
- AiModelInsight.tsx:173-176 — "Reading the metrics — {n}s so far; the free tier can take up to a minute"
- AiModelInsight.tsx:226 — "Written by the language model from the validation metrics shown on this card. Check any figure against the numbers above before acting on it."
- (ModelNarrative.tsx:96-100 HOW_IT_WORKS, :114-120 maseSentence and :202-247 collapsed chips are defined in the file but never render.)

**WeatherEvidencePanel.tsx**
- :112 — "The same model trained with and without weather inputs, compared on held-out error; lower is better. The chips grade how closely each daily weather variable moves with daily corridor volume over {n} days; hover one for the correlation. Holt-Winters and Holts Linear take no external inputs, so they are not tested. Rainfall is the variable drawn on the chart because it is the easiest to read."

**PredictiveCongestionChart.tsx**
- :949/:1518 — "Predicted jam state at each exit for the next 12 hours, from Waze jam reports. Red = crawling under 10 km/h, amber = heavy at 10-20 km/h, blue = moving freely or no jam reported. The cuts are this corridor's own: a generic 30 km/h threshold put every reported jam in one class. Hover a cell for the typical queue length, its distance from the toll plaza and the delay, from four years of Waze jam history at that exit and hour."
- :21-23 range help — "Hour by hour, the rest of this shift." / "Hour by hour, a full day ahead." / "One column per day: how many hours each exit is expected to spend congested."
- :1567 hidden title — "Rows are exits ordered north-bound by km-post. Hover any cell for the model's confidence. The base time is the last complete hour of Waze ingestion."
- :1842-1845 — "Trained on the earlier Waze weeks, scored only on the last {n} days it never saw — {n} exit-hours." / "Trained on the earlier Waze weeks, scored only on the final days it never saw."
- :1853-1855 — "That unseen week, hour by hour, forecast {h} hours in advance — how many of the {n} exits were congested" + tooltip "The expected line adds up each exit's individual chance of being congested in that hour, so it is a sum of probabilities rather than a count of exits the model labelled congested."
- :1889-1890 — "{n} of every 100 exit-hours got the right state — against what you would score with no model at all:"
- :1949 — "Severe hours are rare and the model names them cautiously, so it misses most of them as a label — check the severe % in each cell's tooltip rather than waiting for a red cell."
- :1960-1961 — "Yes — calibrated on held-back hours, like a rain forecast. Each chip is what the card said, next to what actually happened:"
- :1982 — "Brier score is the average squared error of the probabilities themselves, not of the state the card names: 0 is perfect and 0.667 is a coin toss between the three states."
- :2009-2013 — "They are what jams at that exit, hour and day type typically looked like over {n past jam-hours|four years of Waze history} ({yyyy}–{Mon yyyy}). Checked against {n} live jam-hours since {Mon d} that the history never saw:"
- :2039-2044 — "The queue length is specific to the exit and hour, and that detail more than halves the error. The delay is not: jams on this corridor cost about two minutes almost everywhere, so read it as “about 2 min” rather than to the second. {n} live hours fall at exits with too few near-plaza jams in the history and were left out of this check; those cells show the corridor-wide typical, labelled as such."
- :2068-2069 — "The model only sees Waze jam reports, never a vehicle count, so this is an outside check. In the toll data ({yyyy}–{yyyy}), jams get more common as an exit gets busier:"
- :2083-2084 — "Share of exit-hours with a jam at the plaza. It peaks at 1.5–2× and eases at the very busiest hours, which usually run heavy but moving."
- :2088 — "This forecast, by the same measure — average chance of a jam it gives:"
- :2098-2099 — "Rising from quiet to busy hours is what the traffic says should happen. A forecast that put its jams in the quiet hours would be one to doubt. Hover a cell for its typical volume."
- :2116-2118 — "Every forecast this card serves is now kept and scored once its hours have passed. So far {n} exit-hours from {n} hourly runs:"
- :2143-2144 — "“Old colouring” is the likeliest-of-three rule this card used before; the current one colours a cell congested when the chance of a jam is 50% or more. Early figures rest on few hours and will steady as runs accumulate."
- :2149-2150 — "Every forecast this card serves is now kept (next 24 hours of each hourly run) and will be scored against the jams Waze reports once those hours pass. The first scores appear here within a few hours."
- :2158 — "The cuts are this corridor's own speed distribution, not a national standard, so they describe what counts as a jam on NLEX rather than anywhere else."
- :2200 — "Confidence is the model's certainty in its classification, not the probability of congestion. Press Esc to close."

**PredictiveEventChart.tsx**
- :393 — "Extra vehicles each exit takes on a Philippine Arena event day versus a normal day. Choose a past pattern or an upcoming event above."
- :453-455 — "Baseline is the same weekday and month on non-event days, so events cannot inflate their own baseline. Events span {first} to {last}."
- :614-618 — "Event days are read from the Philippine Arena calendar, never inferred from how busy the road was, so the model cannot credit itself with a jam it did not predict. {n} of them fall on a public holiday, which is measured separately — a holiday runs about {x}% of an ordinary day, so the event effect is read on top of that rather than being credited with it. Attendance is not recorded, so a sold-out concert and a small exhibition get the same prediction."
- :653-657 — "Fitted on earlier events, scored on later ones it never saw ({diagnosis}). The day shown applies each exit's uplift to its normal same-weekday, same-month volume; the uplift does not yet vary with the act or its capacity. It was measured on Philippine Arena days; this event is at the {venue}, a smaller venue in the same complex, so treat the figures as an upper bound." / "Choose an upcoming date above to see the forecast for it."

**PrescriptiveTrafficPanels.tsx**
- :219 — "Corridor forecast apportioned to each plaza by its measured share of volume, then across the day by that plaza's own hourly profile, split weekday from weekend. Divided by what one booth serves, and capped at the booths each plaza has (OpenStreetMap): demand beyond them is shown as queuing, not as booths that do not exist. Throughput is the one figure you set; the rest is measured."
- :262-264 — "Booths needed hour by hour on {Sat, Oct 4} ({weekday|weekend}). Plazas do not peak together — the tallest bar is each plaza's own busiest hour. Red hatching is need beyond the booths the plaza has."
- :357-371 — "Volume is the {model} forecast (WMAPE {x}%), which did not pass its acceptance gate — the staffing SHAPE comes from measured profiles, the level it is scaled to is less certain. {stale-or-follows sentence} Profiles measured over {from} to {to} across {n} plazas. Booth counts are from {source}, since the warehouse holds none: each plaza's booths for the movement that pays there, per carriageway where known; {list} have none mapped, so they are not capped. Booth throughput is the one figure that is yours to set."
- :428 — "Ranks segments by how likely High congestion is and how soon, through a fuzzy controller so a segment near a threshold reads as near a threshold rather than flipping an alert on and off. Counter-flow is disruptive and scarce, so the advisory goes to the three most urgent; the rest are listed, not alerted."
- :497-498 — "A volume-to-capacity ratio is not shown: it needs lane capacity, and no capacity or lane-count column exists anywhere in the warehouse. The predicted congestion state is what the data supports."
- :528 — "Ranks exits for event-day intervention by closeness to an ideal option across four criteria: vehicles moved, uplift over baseline, how many events the estimate rests on, and the width of its confidence interval as a penalty (TOPSIS)."
- :576-578 — "Criteria weighted 0.40 vehicles / 0.25 uplift / 0.20 evidence / 0.15 interval width. “Estimate” reads the uplift interval: firm under ±0.025, fair under ±0.06. The per-exit forecast for each upcoming Arena date is on the Predictive tab's Event Surge card; this ranking is the deployment order for whichever date is chosen there."

---


Paths are relative to `Front-End-Dashboard/`. "PIC" = `components/dashboard/PredictiveIncidentChart.tsx`.

**Components named in the brief that these routes do NOT render** (verified: no import chain from either page): `IncidentSeverityModels`, `IncidentDurationModelsPanel`, `CorridorRiskModelsPanel`, `CorridorRiskNarrative`, `HighIncidentDayRiskPanel`, `HighIncidentDayNarrative`, `SecondaryIncidentRiskPanel`, `ClearanceNarrative`, `IncidentModelsNarrative`, `FeatureBriefing`. `DateFilter` does not exist. Their files are orphaned, so nothing from them is on screen today. The page *does* render `PredictiveCorridorChart`, `EventBreakdownPanel`, `CountUpValue`, `DateRangePicker` (traffic), `PageHeader`, `DashboardChart`, `AiModelInsight` (via `IncidentNarrative`/`NarrativePanel`), which the brief did not list.

---

## /dashboard/incident — Incident Overview

**Source files:** `app/dashboard/incident/page.tsx`; `components/dashboard/{PredictiveIncidentChart, PredictiveCorridorChart, BreakdownResponseModel, PrescriptiveDeploymentPanel, prescriptiveShell, PatrolAlertWindowPanel, EventBreakdownPanel, IncidentNarrative, NarrativePanel, AiModelInsight, InfoTooltip, CustomSelect, ChartSkeleton, PageHeader, DashboardChart, CountUpValue, incidentPredictive.shared, aggregateSeries, useThemeTokens}`; `app/dashboard/traffic/components/DateRangePicker.tsx`; `app/dashboard/traffic/traffic.module.css`; `lib/{cached-json, chart-click, chart-theme, granularity}.ts`.

### Roles
- All three roles (`data-analyst`, `tcc-operator`, `incident-operator`) can open it. `/dashboard/incident` is in no DENIED list (`lib/auth-access.ts:28-44`).
- Sidebar entry: label "Incidents", group "Analytics", icon AlertTriangle (`app/dashboard/layout.tsx:48`). Audit-log page label map: `"/dashboard/incident": "Incidents"` (`app/dashboard/audit-log/page.tsx:80`).
- No role-dependent content inside the page or its components.

### Tabs / modes
- Mode tabs (exact labels): "Descriptive" | "Predictive" | "Prescriptive" (`page.tsx:815`, `:890`). The active tab shows a check-mark SVG. Default is "Descriptive" (`:116`).
- Storage: React `useState` only (`:116`). Nothing in localStorage. The page never writes the URL.
- URL params read once on mount (`:156-167`): `tab` (Descriptive|Predictive|Prescriptive), `weather` (all|dry|wet), `from`+`to` (both needed, which forces Range = Custom), `months` (3|12|all). They exist so the hourly page's "Back to daily" link can restore the view.
- Predictive and Prescriptive share one shell (`:801-875`), so the filter row differs by tab: Predictive shows Range + Weather (`:806-811`), Prescriptive shows Range only (`:812`), and Descriptive shows Range + Weather + "Updating…" (`:883-886`).
- Card sub-toggles: Incident Trend granularity (Daily/Weekly/Monthly); When Incidents Happen ("By hour"/"By day"); causes mode ("Accident causes"/"Breakdown causes"/"Types"); Response Time Breakdown ("By Cause"/"By Service"); PIC "Total"/"Accident / Breakdown", "Volume", "Weather", GRANULARITY (Daily/Weekly/Monthly), Future (1 wk/2 wk/1 mo); BreakdownResponseModel ("By Cause"/"By Service"); Deployment ("By Exit"/"By Km"). All are React state.
- **How /incident/hourly is reached:** on the Predictive tab, clicking any point or x-axis label of the "Incident Walk-Forward Forecast" chart while GRANULARITY = Daily runs `router.push('/dashboard/incident/hourly?date=YYYY-MM-DD&months=&from=&to=&weather=')` (PIC `:275-293`). Clicks do nothing while aggregated (Weekly/Monthly). There is no sidebar or other link.

### Checklist

**Shared — page header (all tabs)**
- [ ] PageHeader title "Incident Overview", icon AlertTriangle, `accent="incident"` (sets `data-accent`, which drives --page-accent) (`page.tsx:804`, `:879`)
- [ ] Subtitle "Road crashes, hazards, and response patterns across NLEX" (`:804`, `:879`)
- [ ] Section class `viz-incident` (sets --page-accent and --kpi-1..5 in `app/globals.css:5628`) (`:803`, `:878`)

**Shared — filter row**
- [ ] Range group: calendar icon + label "Range" + segmented buttons "3 mo" | "12 mo" | "All" | "Custom"; default "12 mo"; active one shows a check SVG (`:758-783`)
- [ ] Range Custom: DateRangePicker appears only when Custom is selected, bounded by `data.meta.minDate`/`maxDate` from the analytics response (`:770-781`)
- [ ] DateRangePicker trigger shows "mm/dd/yyyy — mm/dd/yyyy" (start — end), Calendar icon (`DateRangePicker.tsx:132-144`)
- [ ] DateRangePicker popover: prev/next chevron buttons (±1 month, or ±10 years in year view), a month-name button (toggles months grid), a year button (toggles years grid) (`:148-169`)
- [ ] DateRangePicker day grid with weekday headers "Su Mo Tu We Th Fr Sa"; out-of-range days disabled (`aria-disabled`); hover preview of the range; two clicks pick start then end, in either order; closes on completion (`:171-219`, `:74-89`)
- [ ] DateRangePicker months grid "Jan…Dec" and years grid (12 years) (`:222-251`)
- [ ] DateRangePicker presets "Last 7 days", "Last 30 days", counted back from maxDate and clamped to minDate (`:258-275`)
- [ ] DateRangePicker closes on outside click (`:58-66`)
- [ ] Weather group: cloud icon + label "Weather" + "All" | "Dry" | "Wet"; default All (`:785-798`). Shown on Descriptive and Predictive, not on Prescriptive
- [ ] "Updating…" indicator while refetching with data already shown (Descriptive only) (`:886`)
- [ ] Mode tabs "Descriptive" / "Predictive" / "Prescriptive", right-aligned after a spacer (`:813-821`, `:887-896`)

**Descriptive — KPI row** (`:900-964`; values in CountUpValue, a one-time count-up that respects reduced-motion; KpiSkeleton while loading)
- [ ] Tile "Total Incidents" (icon AlertTriangle) + InfoTooltip (`:904-905`); value = total, integer (`:907`); hint `{±x.x%} vs previous period`, green (deltaUp) when ≤0, red otherwise (`:908-913`)
- [ ] Tile "Injuries" (HeartPulse) + InfoTooltip (`:918-919`); hint `{n} fatalities in range` (`:922`)
- [ ] Tile "Avg Response Time" (Timer) + InfoTooltip (`:927-928`); value `{min} min` or "—" (`:931`); hint "breakdowns only" + ` · {n} of {totalBreakdowns} logged` (`:933-938`)
- [ ] Tile "Top Hotspot" (MapPin) + InfoTooltip (`:943-944`); value `Km {bin}–{bin+4}` (`:946`); hint `{x.x}% of located incidents` (`:947-951`)
- [ ] Tile "Crash Rate in Rain" (CloudRain) + InfoTooltip (`:956-957`); value `{x.xx}×` (`:959`); hint `{wet} vs {dry} crashes/day, wet vs dry` (`:960-962`)

**Descriptive — "Incident Trend" (hero card)** (`:967-1009`)
- [ ] Title "Incident Trend" + InfoTooltip (`:971-972`)
- [ ] Filter "Incident type": CustomSelect with options "All types" / "Accidents" / "Breakdowns" (values all|accident|breakdown). It sets `source`, which scopes the whole analytics fetch, so every Descriptive card and KPI changes (`:978-987`)
- [ ] CustomSelect: trigger has `aria-expanded`, the selected option shows a check, closes on outside click (`CustomSelect.tsx:44-72`)
- [ ] Filter "Granularity": "Daily" | "Weekly" | "Monthly", default Monthly. A button the range is too short for is disabled with a `title` reason (`lib/granularity.ts:48`: `Needs at least {two days|two weeks|two months} of data — this range is {n} day(s)`). An impossible selection is demoted automatically (`:212-217`, `:991-1006`)
- [ ] Chart: small multiples, two stacked panels "Accidents" and "Breakdowns", each with its own y-axis and a coloured panel title; smooth lines + 10% area fill; no legend (`:304-371`)
- [ ] Series names "Accidents", "Breakdowns" (`:305-306`)
- [ ] Partial first/last week or month buckets trimmed (`:255-283`)
- [ ] X labels only on the bottom panel, one per month boundary (`axisLabelFor`) (`:335-338`)
- [ ] Tooltip: axis-linked across panels; header via `bucketLabelFor` ("January 2026" / "Week of Jan 5, 2026" / "Mon, Jan 5, 2026"); integer values, "—" when null (`:347-356`)
- [ ] Click anywhere (`attachCategoryClick` fallback) opens the detail modal: title (`{Weekday}, {date}` / `Week of {date}` / `{YYYY-MM}`), subtitle `Incidents · {day|week|month}ly`, rows "Total incidents", "Accidents", "Breakdowns", "vs range average" (±%), "Rank in range" `#{r} of {n} {period}s`, note = filtersNote (`:598-618`)
- [ ] Empty note "No incident data for the selected filters" (`:1008`)

**Descriptive — "When Incidents Happen"** (`:1012-1031`)
- [ ] Title + InfoTooltip (`:1016-1017`)
- [ ] Takeaway subtitle `Peak around {h} · quietest around {h} · busiest day: {Day}` (`:410-412`, `:1019`)
- [ ] Toggle "By hour" | "By day", default By hour (`:1021-1028`)
- [ ] By hour: lines "Weekdays", "Weekends"; markPoint label `Peak · {hour}`; y name "avg incidents / day"; x labels every 3h ("12 AM"…); bottom legend; tooltip `{x.x} / day` (`:417-452`)
- [ ] By day: bars Mon…Sun, busiest bar highlighted and labelled; tooltip `<b>{Day}</b> {x.x} incidents per {Day} on average / {n} total across {n} {Day}s` (`:455-477`)
- [ ] Click (hour): modal `{h} – {h+1}`, subtitle "Incident frequency in this hour of day", rows "Avg on a weekday", "Avg on a weekend day", "Total in range", "Rank among hours" `#{r} of 24` (`:622-636`)
- [ ] Click (day): modal `{Day}`, subtitle "Incident frequency on this day of week", rows "Avg per day", "Total in range" `{n} across {n} {Day}s`, "Rank among days" `#{r} of 7` (`:637-651`)
- [ ] Empty note "No data for the selected filters" (`:1030`)

**Descriptive — "Hotspots by Km Segment"** (`:1033-1056`)
- [ ] Title + InfoTooltip (`:1037-1038`)
- [ ] Sort button (icon only); `title` "Sorted highest first — click for lowest first" / "Sorted lowest first — click for highest first"; `aria-label` `Sort order: {highest first|lowest first}. Activate to reverse.` (`:1041-1049`)
- [ ] Button "View all" + chevron, opens the full-ranking modal (`:1050-1053`)
- [ ] Horizontal bar chart, top 10 five-km segments, y labels `Km X–Y`, bars shaded by magnitude, series "Incidents by segment", no legend (`:480-517`)
- [ ] Tooltip `<b>Km X–Y</b> {n} incidents · {n} injured · {n} fatalities` (`:493-497`)
- [ ] Click opens modal `Km X–Y`, subtitle "Incident hotspot (5-km segment)", rows "Total incidents", "Accidents", "Breakdowns", "Injuries", "Fatalities", "Share of located incidents"; note `Km-post parsed from the operations log location field. {filtersNote}` (`:654-669`)
- [ ] Empty note "No located incidents in range" (`:1055`)

**Descriptive — Causes / Types card** (`:1059-1090`)
- [ ] Dynamic title "Top Accident Causes" / "Top Breakdown Causes" / "Top Accident Types" + InfoTooltip (`:1063-1068`)
- [ ] Sort button (same title/aria-label pattern as hotspots) (`:1071-1079`)
- [ ] Mode toggle "Accident causes" | "Breakdown causes" | "Types", default Accident causes (`:40`, `:1080-1087`)
- [ ] Horizontal bars, top 9, labels cut to 24 chars + "…", series "Incidents", no legend (`:530-563`)
- [ ] Tooltip `<b>{label}</b> {n} incidents · {n} injured · {n} fatalities` (`:542-548`)
- [ ] Click opens modal `{label}`, subtitle "Reported cause (crashes)" / "Reported fault (breakdowns)" / "Accident type (crashes only)", rows "Incidents", "Share", "Injuries", "Fatalities" (`:676-698`)
- [ ] Empty note "No data for the selected filters" (`:1089`)

**Descriptive — "Incidents per Day: Dry vs Wet Weather"** (`:1092-1102`)
- [ ] Title + InfoTooltip (`:1096-1097`)
- [ ] Grouped bars, categories "Accidents", "Breakdowns"; series "Dry weather", "Wet weather"; bottom legend; y name "avg incidents / day" (`:565-593`)
- [ ] Tooltip `<b>{cat}</b> Dry weather: {r} per day — {n} incidents over {h} dry hrs / Wet weather: {r} per day — {n} incidents over {h} wet hrs` (`:584`)
- [ ] Click opens modal `{Accidents|Breakdowns} — weather impact`, subtitle "Wet = expressway-average rainfall > 0.3 mm in that hour", rows "Incidents in dry hours", "Incidents in wet hours", "Rate in dry weather", "Rate in wet weather", "Avg jam speed (dry)" `{n} km/h`, "Avg jam speed (wet)", plus the exposure-normalisation note (`:700-718`)
- [ ] Empty note "No weather data in range" (`:1101`)

**Descriptive — "Response Time Breakdown" (EventBreakdownPanel)** (`page.tsx:1105`; `EventBreakdownPanel.tsx`)
- [ ] Rendered with no props, so it is always 12 months and ignores the page Range and Weather (`page.tsx:1105`, `EventBreakdownPanel.tsx:39`)
- [ ] Title "Response Time Breakdown" + InfoTooltip (`:123-124`)
- [ ] Sub-heading "Median Dispatch Response Time" (`:129`)
- [ ] Toggle "By Cause" | "By Service", default By Cause (`:131-144`)
- [ ] Horizontal bars, top 10 groups with a non-null median; x name "median response (min)" (`:92-118`)
- [ ] Tooltip `<b>{group}</b> Median response: {m} min / Avg response: {m} min / Avg on-scene service time: {m} min / {n} dispatches` (`:106-108`)
- [ ] Caption on breakdown_data per-dispatch records and the 24h exclusion (`:149-150`)
- [ ] Loading "Loading event breakdown…" (`:74`); unavailable "Response time breakdown unavailable" + error or "No breakdown dispatch data has been ingested yet." (`:83-85`)

**Descriptive — modals**
- [ ] Detail modal: `role="dialog" aria-modal="true" aria-label={title}`; Siren icon; h3 title; subtitle; zebra key/value rows; info-icon footer note; Close button `aria-label="Close"`; backdrop click closes; no Escape handler (`:1108-1138`)
- [ ] filtersNote text: `{All weather | Wet hours only (rainfall > 0.3 mm) | Dry hours only} · {from} to {to}` (`:596`)
- [ ] View-all modal: `aria-label="All hotspots"`; MapPin icon; title "Hotspots — Full Ranking"; subtitle `{n} five-km segments · click a row for details`; Close `aria-label="Close"` (`:1141-1154`)
- [ ] View-all table columns "#", "Segment", "Total", "Accident", "Breakdown", "Injured", "Fatal"; every segment listed (not just top 10); clicking a row closes this modal and opens the detail modal (`:1155-1173`)

**Descriptive — loading / error states**
- [ ] ChartSkeleton in every chart while first loading (`:721`)
- [ ] Error placeholder "Live data unavailable — is the backend running on port 4000?" (`:722`)

**Predictive — "Incident Walk-Forward Forecast" (PIC)** (`page.tsx:823-835`)
- [ ] Gets Range (Custom sends `months=all` + from/to) and Weather from the page (`page.tsx:825-833`)
- [ ] Loading "Loading ML forecast from AWS…", first load only (`PIC:232-238`)
- [ ] Error: "Predictive analytics unavailable" + API message or "Database not reachable" (`PIC:240-249`)
- [ ] Title "Incident Walk-Forward Forecast" + InfoTooltip (`:1235-1236`)
- [ ] Subtitle "Click any point to view that day's hourly breakdown" (`:1239`)
- [ ] Split toggle "Total" | "Accident / Breakdown" (`aria-pressed`); shown only when `data.accidentSplit` exists; wrapper `title` "Total: the blended forecast with every candidate model. Split: a dedicated accident forecast, with breakdowns derived as blended total minus accidents." (`:1243-1263`)
- [ ] "Volume" pill toggle, default OFF, car icon; 4 `title` variants (`:1267-1294`)
- [ ] "Weather" pill toggle, default ON, cloud-rain icon; 4 `title` variants (`:1299-1327`)
- [ ] Both toggles re-query the API (`volumeToggle=off` / `weatherToggle=off`) and switch to the volume-free / weather-free model twins when they exist (`:178-179`, `:370-375`)
- [ ] "Models" label + model chips, one per model with a stored series: "XGBoost", "Random Forest", "Poisson GLM", "Neg. Binomial GLM", "SARIMAX", "LSTM", "GRU"; each tinted its own colour; `aria-pressed`; title `Hide {m}`/`Show {m}` or "At least one model must stay selected"; at least one always stays on; opens on the champion (first load only) (`:1018-1065`, `:149-155`, `:211-215`; colours `incidentPredictive.shared.ts:18-29`)
- [ ] In split view the model row is replaced by the note `Model picker not used in this view — the accident forecast is {label}, fitted on accidents alone; breakdowns are derived as blended total minus accidents.` (`:1338-1348`)
- [ ] Badge `Each point = {7-day|~30-day} mean, not a total`, shown only when aggregated (`:1354-1366`)
- [ ] "GRANULARITY" pill: "Daily" | "Weekly" | "Monthly" (active shows `✓ {g}`); titles "One point per day — the resolution the models actually forecast" / `Averaged per {week|month} — a viewing aid, not a separate forecast` (`:1375-1406`)
- [ ] "Past" chip `{n}d trained · {x.xx}% · showing last {n}d` (`:1409-1422`)
- [ ] "Present" chip `{n}d scored · {x.xx}% · fixed by evaluation` (`:1425-1436`)
- [ ] "Future" chip with preset buttons "1 wk" (7d), "2 wk" (14d), "1 mo" (28d). A preset longer than the stored horizon is disabled at 0.4 opacity with title `The forecast only runs {n} day(s) ahead — retrain the incident pipeline with a longer horizon to use this`; otherwise `Show {d} days of forecast`. Trailing `· validated at {n}d`. The chip is hidden when there are no future rows (`:88-92`, `:1441-1481`)
- [ ] Chart, 450px tall, pointer cursor; a click on a point or x-axis label opens hourly (`triggerEvent:true`) (`:1484-1486`, `:290-293`, `:911`)
- [ ] Total view series: "Rainfall" (bars coloured by intensity band), "Vehicle Volume" (line + area, drawn only across the Past band, `connectNulls:false`), "Actual Count" (line), `{Model} Prediction` (one line per selected model, Present + Future only) (`:690-713`, `:962-1013`, `:430-431`)
- [ ] Total view y-axes "Incident Count", "Rainfall (mm)" (right, hidden when Weather is off), "Vehicle Volume" (right, offset, `k` formatter, hidden when Volume is off) (`:915-961`)
- [ ] Split view: two panels titled "Accidents" / "Breakdowns", each with series "Actual" (solid) and "Forecast" (dashed); Rainfall and Volume overlaid on both panels; axes "Rainfall (mm)", "Volume" (`:619-645`, `:755-883`)
- [ ] Legend: total view `["Actual Count", "{M} Prediction"…, "Rainfall", "Vehicle Volume"]`; split view "Actual" (solid swatch), "Forecast" (dashed swatch), "Rainfall", "Vehicle Volume" (`:652-662`)
- [ ] Past / Present / Future zone bands (markArea) with labels "Past"/"Present"/"Future" (a label is hidden below 6% width unless that band is the widest) and dashed dividers (`:433-511`)
- [ ] Period dividers `W1, W2…` / `M1, M2…` at Weekly/Monthly, thinned to ≤12 (`:537-567`)
- [ ] dataZoom: slider (bottom) + inside (wheel/pinch), reset to 0–100 on every option build (`:722-739`)
- [ ] Tooltip: date header; each series value (Rainfall `{x.x} mm`, Vehicle Volume `{n} vehicles`, others integer); footer "Click to view hourly breakdown", or "Switch to Daily to open a day" when aggregated (`:666-683`)
- [ ] Rain intensity key (shown when Weather is on): "Daily rainfall"; "Light" `< 7.5 mm`, "Moderate" `7.5–15 mm`, "Heavy" `15–30 mm`, "Intense" `≥ 30 mm`; "Taller bar = wetter day" (`:574-579`, `:1495-1520`)
- [ ] Split-view disclaimer box "Accident forecast — …" (full text in Never-cut) (`:1522-1536`)
- [ ] Table "Real-World ML Validation Metrics" with columns "Model", "RMSE", "MAE", "WMAPE", "MASE", "R² Score". Lists only the selected models. Colour dot per model; WMAPE `{x.xx}%`; RMSE/MAE/MASE to 3 dp; R² to 4 dp in the model colour (`:1083-1150`)
- [ ] Each metric header is a MetricHint showing its formula on hover/focus (`tabIndex=0`, portal `role="tooltip"`) (`:1095-1099`; `IncidentNarrative.tsx:82-213`)
- [ ] Each model name is a MetricHint with its "how it works" text (`:1111`; `IncidentNarrative.tsx:51-59`)
- [ ] "Champion" label, title "Selected on the full holdout window when the model was trained, not on the currently visible Range/Weather slice" (`:1112-1119`)
- [ ] "(full holdout)" label, title "No scored days in the current Range/Weather selection — showing the pipeline's full-holdout numbers instead" (`:1120-1127`)
- [ ] R² cell title `R² is hidden below 30 scored days ({n} here)` (`:1139`)
- [ ] Weather panel (when the API returns `weatherMetrics`): heading `Accuracy on {wet|dry} days only`; caption `{d} of {scored} holdout days · wet = expressway-average rainfall > 0.3 mm`; columns "Model", "MAE", "RMSE", "R² Score"; "Champion" label; empty `No {weather} days in the scored window.`; wet uses a blue tint, dry an amber tint (`:1155-1226`)
- [ ] Narrative (IncidentNarrative): collapsed shows only the "Generate report" button (`NarrativePanel.tsx:140-153`). Opened shows heading "Narrative Explanation", "Hide report" button, the scoringCaption line (+ ` · scored on {weather} days only`), and the AiModelInsight body (`IncidentNarrative.tsx:255-377`)
- [ ] AiModelInsight states: "Reading the metrics" spinner (`role="status"`), plus ` — {n}s so far; the free tier can take up to a minute` after 8 s; error row (`role="alert"`, raw message in `title`) with a "Try again" button; result = summary paragraph, per-model `{label} — {verdict}` list, amber caveat box; footer disclaimer (`AiModelInsight.tsx:168-228`)

**Predictive — "Predicted Incidents Ranking" (PredictiveCorridorChart)** (`page.tsx:836-849`)
- [ ] Fed from PIC's response; makes no fetch of its own (`page.tsx:145-153`, `PIC:197-205`)
- [ ] Loading "Loading corridor breakdown…" (`:117`); unavailable "Corridor breakdown unavailable" + "No incidents in the current Range had a location that could be matched to a corridor segment." (`:126-128`)
- [ ] Title "Predicted Incidents Ranking" + InfoTooltip (`:281-282`)
- [ ] Pills `Model: {label}`, `Volume: ON|OFF`, `Weather: ON|OFF`; group title "Matches the Volume/Weather toggles on the forecast chart above" (`:287-302`, `:262-275`)
- [ ] Unclassified note `{x.x}% of logged locations in this Range couldn't be matched to a specific segment and are excluded from the split.`, shown when >0 (`:304-308`)
- [ ] Headline sentence (leader, top-3 share, concentration verdict) (`:309-327`)
- [ ] Labels "Segment forecast ranking"; `Predicted incidents · next {h} days`; swatch "darker = more predicted"; "Hover a row to inspect its numbers" (`:331-344`)
- [ ] Group heading `Top {n}` (rows 1–5) and `Next {n}` (code exists but is never reached, since INLINE_LIMIT = TOP_TIER = 5) (`:347-367`, `:59-60`)
- [ ] Row: rank number, segment label (ellipsis + `title`), shaded bar (amber ramp `shadeFor`), value pill; "Highest" badge on the top row (`:171-258`)
- [ ] Row hover tooltip (mouse only, no keyboard): `{label}` / `{n} predicted incidents · next {h}d` / `Historical share: {x.x}% ({n} logged)` (`:229-245`)
- [ ] Axis ticks at 0/25/50/75/100% of max; caption `Predicted incidents (next {h}d)` (`:369-385`)
- [ ] Button `See {n} more segment(s)` (`:387-399`)
- [ ] Modal `role="dialog" aria-modal="true" aria-label="All ranked segments"`; title "All segments, ranked"; `Ranks 6–{N} of {N} · predicted incidents, next {h}d`; "✕" Close `aria-label="Close"`; backdrop closes (`:430-472`)
- [ ] NarrativePanel: "Generate report" opens "Narrative Explanation" + "Hide report" + contextLine `Predicted incidents across {n} corridor segments, next {h} days.` + AiModelInsight (`:407-428`; `NarrativePanel.tsx:46-111`)

**Predictive — "Response Time Breakdown" (BreakdownResponseModel)** (`page.tsx:850-854`)
- [ ] Not tied to Range or Weather (fetch takes no params) (`:71`)
- [ ] Loading "Loading response-time model…" (`:92`); unavailable "Response-time model unavailable" + error or "The breakdown response-time pipeline hasn't written its output yet — run train_breakdown_response_models.py --write-db." (`:101-103`)
- [ ] Title "Response Time Breakdown" (same title as the Descriptive card) + InfoTooltip (`:170-171`)
- [ ] Pill `Model: {champion}` with title `Champion model: {c} -- MAE {x.x} min on {n} held-out dispatches, {r² | concordance} {v}` (`:173-185`)
- [ ] Stat tiles "Held-out MAE" `{x.x} min`; "R²" (XGBoost) or "Concordance" (Cox PH), 3 dp; "Trained" date (`:188-205`)
- [ ] Sub-heading "Predicted Median Response Time" + toggle "By Cause" | "By Service" (`:209-225`)
- [ ] Bar chart, top 8 groups, series "Predicted", bar labels `{v}m`, x name "predicted median response (min)", no legend (`:127-164`)
- [ ] Tooltip `<b>{group}</b> Predicted median: {v} min / {n} held-out dispatches` (`:148`)
- [ ] Caption `Top {n} {causes|services} by held-out evidence…` (`:232-235`)
- [ ] Empty `No {cause|service} groups met the training script's evidence cutoff.` (`:228`)
- [ ] NarrativePanel contextLine `Predicted median response time across {n} {causes|services} · {champion}.`; regenerates when By Cause/By Service changes (`:248-266`)

**Prescriptive — "Resource Staging & Patrol Repositioning" (PrescriptiveDeploymentPanel)** (`page.tsx:855-863`)
- [ ] Gets Range (Custom sends `months=all` + from/to) (`page.tsx:857-861`)
- [ ] Loading "Loading patrol deployment…" (`:151`); unavailable `Patrol deployment unavailable: {error ?? "no Predicted Incidents Ranking data — check the Predictive tab's corridor card."}` (`:174`)
- [ ] Title "Resource Staging & Patrol Repositioning" + InfoTooltip (hint) (`:222-223`, `:149`; `prescriptiveShell.tsx:12-26`)
- [ ] Toggle "By Exit" | "By Km" (By Km disabled when there is no km data), default By Exit (`:226-242`)
- [ ] Slider "Fleet size", range 1..min(12, rows), default 4, readout `{n} units` (native `<input type="range">`) (`:244`, `:210-218`)
- [ ] Slider "Coverage radius", range 1..40, default 8, readout `{n} km` (`:245`)
- [ ] Banner "Recommended staging: {labels}." + coverage sentence (`:250-258`)
- [ ] Table columns "{Exit|Segment}", "Km", "Predicted incidents", "Rate /km", "Status" ("● STAFFED" or "—"); staffed rows tinted; busiest first; 8 rows by default (`:260-295`)
- [ ] Toggle button `Show all {n} {exits|segments}` / "Show the 8 busiest" (shown when >8 rows) (`:297-307`)
- [ ] Sub-card "Hotspot monitoring alert": paragraph, list header "{Exit|Segment}" / "Predicted incidents", scroll list (max 220px, `ds-scroll-fade`) of rows reaching 80% cumulative coverage (`:310-332`)
- [ ] Sub-card "Proactive speed advisory": paragraph with `(AUC {x.xxx})`; top 3 rows by density `{label} — Km {km}, {x.xx} incidents/km`; rain-scenario chips `{mm}mm rain` / `{p}%` (`:333-358`)
- [ ] Foot (forecast model + days, fleet disclaimer) (`:361-365`)
- [ ] The MCLP is solved in the browser with `yalps` on every slider or toggle change (`:51-81`, `:180`)

**Prescriptive — "Patrol Alert Schedule" (PatrolAlertWindowPanel)** (`page.tsx:864-872`)
- [ ] Gets Range (`page.tsx:866-870`)
- [ ] Loading "Loading patrol alert schedule…" (`:145`); unavailable `Patrol alert schedule unavailable: {error ?? "no hourly incident data for this Range."}` (`:147`); "Patrol alert schedule unavailable: no days in the selected Range have incident data." (`:175`)
- [ ] Title "Patrol Alert Schedule" + InfoTooltip (hint) (`:183-184`)
- [ ] Banner naming the day with the longest window, the window, its hours and the peak (`:186-190`)
- [ ] Table columns "Day", "Alert window", "Peak hour", "Shape (12 AM – 12 AM)"; rows Mon→Sun; the widest day's window is in accent colour and bold (`:192-260`)
- [ ] Shape cell: 24 mini bars (height = magnitude, shade = percentile rank across all 168 cells); each bar's `title` is `{hour}: {v.vv} incidents/day avg` (`:225-252`)
- [ ] Day with no data shows `No {Day} in this Range` (`:206-212`)
- [ ] Foot listing day counts `Mon {n}, Tue {n}, …` (`:262-266`)

### API endpoints
(`installBackendAuth()` in `app/dashboard/layout.tsx:40` patches fetch so every request carries the signed-in user.)
- `GET {BACKEND}/api/incident/analytics?months=3|12|all` or `?from=&to=`, plus `weather=dry|wet` (omitted for all) and `source=accident|breakdown` (omitted for all). Made by `page.tsx:190` via `cachedJson` (5-min TTL, stale-while-revalidate, shared in-flight request; `lib/cached-json.ts:32`). It runs on every tab, including Predictive and Prescriptive (it supplies the Custom date bounds).
- `GET {BACKEND}/api/incident/event-breakdown?months=12`, plain `fetch` with `no-store` (`EventBreakdownPanel.tsx:55`). Page passes no props.
- `GET {BACKEND}/api/incident/predictive?months=&weather=&from=&to=&volumeToggle=off&weatherToggle=off`, `no-store` (`PIC:168-184`). `weather` is always sent, including "all". The toggle params are sent only when that toggle is off.
- `GET {BACKEND}/api/incident/breakdown-response`, no params, `no-store` (`BreakdownResponseModel.tsx:71`)
- `GET {BACKEND}/api/incident/predictive?months=&from=&to=`, `no-store` (`PrescriptiveDeploymentPanel.tsx:113`). A second, separate predictive fetch with no weather param.
- `GET {BACKEND}/api/incident/weather-speed`, `no-store`; reads `data.metadata.weather_incident_risk`; failure is silent (`PrescriptiveDeploymentPanel.tsx:132-142`)
- `GET {BACKEND}/api/incident/analytics?months=&from=&to=`, `no-store`, no weather/source (`PatrolAlertWindowPanel.tsx:126`)
- `POST {BACKEND}/api/ai-insight/model-narrative`, body `{quantity:"incidents", metrics[{model,wmape,mae,rmse,r2,mase,rank:null,accepted:true,diagnosis}], horizonDays, scoredDays:null, windowStart:null, windowEnd:null, weatherMode: null|"with"}` (`AiModelInsight.tsx:96-113` via `IncidentNarrative.tsx:351-373`)
- `POST {BACKEND}/api/ai-insight/ranking-narrative`, body `{cardTitle:"Predicted Incidents Ranking", groupBy:"segment", metricLabel:"Predicted incidents", metricUnit:"count", metricDescription, horizonDays, totalLabel, rows[{label,value,sharePct}]}` (`PredictiveCorridorChart.tsx:407-428`)
- `POST {BACKEND}/api/ai-insight/breakdown-response-narrative`, body `{dimension, championModel, maeMinutes, trainedAt, groups[{group,n,predictedMedianMin}]}` (`BreakdownResponseModel.tsx:249-265`)
- AI requests fire only after "Generate report", one per subject key. Client timeout 100 s; the elapsed counter ticks every 1 s (`AiModelInsight.tsx:28`, `:92`).
- **Polling:** none. No interval refetch on this route.

### localStorage / sessionStorage
- None on this route or in any component it renders. Per-tab caching is in-memory only (`lib/cached-json.ts`, module-scope Map).

### Never-cut facts
- Wet threshold "rainfall > 0.3 mm" (`page.tsx:596`), "Wet = expressway-average rainfall > 0.3 mm in that hour" (`:707`), "wet = expressway-average rainfall &gt; 0.3 mm" (`PIC:1175`)
- Exposure-normalised rates: `(incidents / hours) × 24` (`page.tsx:234-235`, `:573`); note "Rates are exposure-normalized: incidents ÷ hours with that weather, scaled to a 24-hour day. Wet hours are much rarer than dry, so raw counts can't be compared directly." (`:716`)
- Avg Response Time covers breakdowns only, shown as `breakdowns only · {n} of {total} logged` (`:933-938`)
- KPI tooltip names a "Secondary Incident Risk card" on the Predictive tab that is not rendered (`:928`)
- Hotspot = 5-km segment, `Km {b}–{b+4}`; top 10 on the card, all in the modal; "Km-post parsed from the operations log location field." (`:92`, `:482`, `:667`)
- Causes: top 9 (`:534`); accident causes and breakdown faults kept as separate rankings (`:62-71`)
- Granularity minimums: daily 2 days, weekly 14, monthly 60 (`lib/granularity.ts:26-30`)
- Response-time data: "responses over 24h are treated as data-entry noise and excluded" (`EventBreakdownPanel.tsx:149-150`, `BreakdownResponseModel.tsx:233-234`); "only the subset of breakdowns with a logged AAP/Patrol Vehicle/RAMFA dispatch are included" (`EventBreakdownPanel.tsx:149`)
- Model roster (7): XGBoost, Random Forest, Poisson GLM, Neg. Binomial GLM, SARIMAX, LSTM, GRU; no Prophet or Holt-Winters for incidents (`incidentPredictive.shared.ts:6-29`)
- Forecast horizon: the pipeline writes 7 future days; "1 mo"/"2 wk" stay disabled until then (`PIC:84-92`)
- Zone semantics (InfoTooltip `PIC:1236`): "Past = training history, Present = the model's held-out accuracy check (never trained on), Future = the published forecast for days that haven't happened yet."
- `{n}d trained · {x.xx}% · showing last {n}d`; `{n}d scored · {x.xx}% · fixed by evaluation`; `· validated at {n}d` (`PIC:1418`, `:1433`, `:1478`)
- scoringCaption: `Scored on {n} validation day(s) ({start} – {end})` or `Full-holdout metrics from the last training run ({trainedAt})` (`PIC:1079-1081`). Shown only inside the opened narrative (`IncidentNarrative.tsx:345`).
- Champion rule (code comment): eligible when MASE ≤ 1.0, then highest R² or lowest MAE (`IncidentNarrative.tsx:28-30`)
- MASE baseline is a naive "same day last week" forecast: "Below 1.0 beats that baseline; at or above 1.0 does not." (`IncidentNarrative.tsx:201-205`)
- R² hidden below 30 scored days (`PIC:1139`)
- Metric formulas (MetricHint, `IncidentNarrative.tsx:186-209`): WMAPE "= Σ|actual − predicted| ÷ Σ|actual| × 100"; MAE "= average of |actual − predicted| … Same units as the forecast (incidents/day)."; RMSE "= √(average of (actual − predicted)²)"; R² "= 1 − (Σ squared error ÷ Σ squared deviation from the actual mean) … 1.0 = perfect fit, 0 = no better than always predicting the average, negative = worse than that."; MASE "= this model's MAE ÷ MAE of a naive “same day last week” forecast" (+ `= {mae} ÷ {naive} = {mase}` when computable)
- Model descriptions (`IncidentNarrative.tsx:51-59`): XGBoost "Gradient-boosted decision trees over lag, rolling-mean and calendar features — each new tree corrects the previous ensemble's errors."; RandomForest "An ensemble of decision trees, each trained on a bootstrapped sample of days, averaged together."; Poisson_GLM "Generalized linear model with a Poisson link — assumes the variance of daily incident counts equals their mean."; NegBinomial_GLM "Generalized linear model with a negative-binomial link — like the Poisson GLM but lets variance exceed the mean, the usual case for real count data."; SARIMAX "Seasonal ARIMA(1,0,1)(1,0,1,7) — autocorrelation plus a weekly cycle, with calendar flags and rainfall as exogenous inputs."; LSTM "Small recurrent neural network reading the last 14 days of counts. Predicts one day at a time and feeds its own output back in for the days after."; GRU "Gated recurrent unit, a lighter cousin of the LSTM with fewer internal gates, over the same 14-day lookback window."
- Split disclaimer, verbatim (`PIC:1524-1534`): "**Accident forecast** — {model}, fitted on accidents alone (last trained {date}). Held-out MAE **{x}** incidents/day, R² **{x}**. Accidents are only ~12% of daily incidents, so a fit tuned to the combined count is tuned to breakdowns: on the current holdout, scaling the blended forecast down to an accident estimate does worse than simply assuming the historical average, and this dedicated model beats it clearly. Its own skill is modest, though — without traffic volume it is not clearly better than the historical average (re-measured 2026-09-21). **Breakdowns are derived, not separately modeled** (blended forecast minus accident forecast): a dedicated breakdown model was tested and did no better than the blended fit. Metrics below describe the blended forecast."
- Volume toggle titles (`PIC:1272-1276`): "Volume ON: forecasts fitted WITH traffic volume, overlay shown. Click to switch to the volume-free models." / "Volume OFF: forecasts fitted WITHOUT traffic volume. Click to use the volume-aware models and show the overlay." / "Hide the volume overlay (this training run stored no volume-free models, so the forecast lines do not change)" / "Show the volume overlay (this training run stored no volume-free models, so the forecast lines do not change)"
- Weather toggle titles (`PIC:1304-1308`): "Weather ON: forecasts fitted WITH rainfall, overlay shown. Click to switch to the weather-free models." / "Weather OFF: forecasts fitted WITHOUT rainfall. Click to use the weather-aware models and show the overlay." / "Hide the rainfall overlay (this training run stored no weather-free models, so the forecast lines do not change)" / "Show the rainfall overlay (this training run stored no weather-free models, so the forecast lines do not change)"
- Rain bands: Light < 7.5 mm, Moderate 7.5–15, Heavy 15–30, Intense ≥ 30 (PAGASA-advisory thresholds per comment) (`PIC:569-579`)
- Volume overlay is drawn only across the Past band (training context) (`PIC:423-431`)
- Corridor ranking is "Derived, not separately modeled… there's no per-segment trained model behind this chart. Always apportioned from the pipeline's champion model; follows the Volume/Weather toggles above" (`PredictiveCorridorChart.tsx:282`); unclassified-location exclusion sentence (`:306`)
- Corridor headline (`:312-322`): "The **{label}** stretch leads the corridor at **{n}** predicted incidents — **{x}%** of the {total}-incident total on its own. The top {N} segments together account for **{x}%** of the whole corridor's forecast — {"response resources concentrated at just a few stretches would cover most of what's expected" if ≥50% | "risk is spread wider than a handful of hotspots"}."
- Breakdown response model: "Cox PH vs XGBoost, whichever scores lower held-out error… scored against the actual measured median on a chronological, event-grouped holdout" (`BreakdownResponseModel.tsx:171`); top 8 groups = training script's TOP_N_GROUPS (`:55-58`)
- Deployment recommendation (`PrescriptiveDeploymentPanel.tsx:251-257`): "**Recommended staging: {labels}.** Pre-position patrol and tow-truck units at these {k} {segments|exits} — a {r}km radius from each covers **{x}%** of the ranking's {total}-incident forecast ({covered} of {total}) — {"this fleet size/radius combination reaches most of the ranking's predicted risk." if ≥80% | "a larger fleet or wider radius would be needed to cover most of the ranking's predicted risk."}"
- Basis: an exact Maximal Covering Location Problem MILP (YALPS, branch-and-cut); distance = |km_i − km_j| along the corridor (`:32-48`); defaults fleet 4 units, radius 8 km (`:98-99`)
- Fleet disclaimer: "Fleet size and coverage radius are yours to set — nothing in the warehouse records NLEX's actual patrol fleet." (`:149`, `:363-364`)
- Hotspot alert = 80% cumulative predicted-incident coverage, "not an arbitrary top-N"; when it takes >half the rows: "That takes {n} of {N} — risk here is spread across most of the corridor rather than concentrated in a handful of spots, so the cutoff genuinely needs this many." (`:194-206`, `:313-318`)
- Speed advisory: top 3 by predicted incidents per km; percentages are the weather-incident-risk model's probability of a corridor-wide high-incident day at each rainfall level, `(AUC {x.xxx})` (`:207-208`, `:336-338`)
- Deployment Foot: `Built from the {model} {days}-day forecast, apportioned the same way as the ranking above.` (`:362-363`)
- Patrol window rule: "any run of hours whose average incident count sits above that specific day's own mean" (`PatrolAlertWindowPanel.tsx:184`); banner (`:187-189`): "**{Day}** needs the longest alert window: **{h – h}** ({n}h), peaking around **{h}**. Every other day's own window is in the table below — none of them share a single rush-hour assumption."
- Patrol Foot (`:263-265`): "Each day's window is measured over however many of that weekday fell in the selected Range ({Mon n, …}) and recomputed from that day's own hourly rhythm — it is not a fixed rush-hour assumption shared across days."
- AI disclaimer: "Written by the language model from the validation metrics shown on this card. Check any figure against the numbers above before acting on it." (`AiModelInsight.tsx:226`)
- AI error texts: "The explanation service is busy — it allows only so many requests a minute. Wait a moment and try again." / "The model did not answer in time. The free tier queues under load, so a second attempt usually gets through." / "Could not reach the explanation service. The rest of this page is unaffected — the figures above come from the warehouse, not from it." / `The explanation service answered {status}.` (`AiModelInsight.tsx:118`, `:149-161`)

### Visible prose likely to be shortened (verbatim)
- `page.tsx:905` "All logged incidents — accidents and breakdowns — in the selected Range, compared to the equivalent prior period."
- `page.tsx:919` "Total people injured across all incidents in the Range, including incidents that also had a fatality."
- `page.tsx:928` "Breakdowns only: average minutes from a breakdown being reported to the first responder being dispatched. Accidents have no per-dispatch record to measure this from, so they aren't included — see \"Predicted clearance time\" on the Predictive tab's Secondary Incident Risk card for an accident-side figure instead."
- `page.tsx:944` "The 5km corridor segment with the most incidents in the Range, among segments whose location could be resolved."
- `page.tsx:957` "Road and motorcycle crashes per day during rainy hours vs. dry hours, normalized for how often each occurs. Above 1× means rain sees more crashes per hour of exposure."
- `page.tsx:972` "Incident counts over the selected Range, by type (accidents, breakdowns). Daily, weekly, or monthly — click a point to see that period's breakdown."
- `page.tsx:1017` "Average incidents per day by hour (weekdays vs. weekends) or by day of week, normalized for how many of each day type are actually in the Range — so 5 weekdays vs. 2 weekend days compare fairly."
- `page.tsx:1038` "Top 10 km segments by total located incidents in the Range. Hover a bar for its injury and fatality counts."
- `page.tsx:1068` "Top 9 logged causes or collision types by incident count in the Range, with injuries and fatalities on hover. Toggle between Causes and Types on the right."
- `page.tsx:1097` "Average incidents per day by type, dry vs. wet hours — normalized by hours of exposure (× 24) so rare wet hours compare fairly against far more abundant dry ones, not raw counts."
- `EventBreakdownPanel.tsx:124` "Dispatch response times (AAP, Patrol Vehicle, RAMFA, and others) from the breakdown log, by cause or by service."
- `EventBreakdownPanel.tsx:149-150` "Built from breakdown_data's per-dispatch records — only the subset of breakdowns with a logged AAP/ Patrol Vehicle/RAMFA dispatch are included; responses over 24h are treated as data-entry noise and excluded."
- `PIC:1236` "Daily incident forecast, scored against real held-out data. Past = training history, Present = the model's held-out accuracy check (never trained on), Future = the published forecast for days that haven't happened yet."
- `PIC:1239` "Click any point to view that day's hourly breakdown"
- `PIC:1341-1343` "Model picker not used in this view — the accident forecast is {label}, fitted on accidents alone; breakdowns are derived as blended total minus accidents."
- `PIC:1524-1534` split disclaimer (quoted in full under Never-cut)
- `PredictiveCorridorChart.tsx:282` "Derived, not separately modeled: splits the total forecast above across fixed 5km corridor segments by each one's historical share of incidents — there's no per-segment trained model behind this chart. Always apportioned from the pipeline's champion model; follows the Volume/Weather toggles above, so switching either re-derives it from that selection's own forecast."
- `PredictiveCorridorChart.tsx:306` "{x}% of logged locations in this Range couldn't be matched to a specific segment and are excluded from the split."
- `PredictiveCorridorChart.tsx:312-322` headline sentence (quoted under Never-cut)
- `BreakdownResponseModel.tsx:171` "Predicted dispatch response time (AAP, Patrol Vehicle, RAMFA, and others), by cause or by service -- a trained model (Cox PH vs XGBoost, whichever scores lower held-out error) predicting a deployment's response_time_min from pre-dispatch context, scored against the actual measured median on a chronological, event-grouped holdout. The descriptive counterpart to this card (Descriptive tab) shows the same two groupings from measured history alone, with no model behind it."
- `BreakdownResponseModel.tsx:233-234` "Top {n} {causes|services} by held-out evidence. Built from breakdown_data's per-dispatch records; responses over 24h are treated as data-entry noise and excluded, same as the Descriptive tab's own figures."
- `PrescriptiveDeploymentPanel.tsx:149` "A solution for the Predictive tab's own Predicted Incidents Ranking: an exact linear program (Maximal Covering Location solve) that recommends exactly where to pre-position patrol and tow-truck units — which exits or km segments to station them at — to cover as much predicted incident risk as possible, cutting response time during high-risk windows. Fleet size and coverage radius are yours to set — nothing in the warehouse records NLEX's actual patrol fleet."
- `PrescriptiveDeploymentPanel.tsx:313-314` "{Segments|Exits} carrying at least 80% of the ranking's predicted incident total between them — same evidence-coverage cutoff used on the ranking cards above, not an arbitrary top-N."
- `PrescriptiveDeploymentPanel.tsx:336-338` "Top 3 hotspots by density (predicted incidents per km) — advise reduced speed here first as rainfall rises. The percentages below are the weather-incident-risk model's own probability of a corridor-wide high-incident day at each rainfall level (AUC {x})."
- `PrescriptiveDeploymentPanel.tsx:362-364` Foot (quoted under Never-cut)
- `PatrolAlertWindowPanel.tsx:184` "Hours patrol should treat as elevated-risk, one row per day of the week, from the Descriptive tab's own Hour x Day-of-week incident frequency — the same table its Time-of-Day chart draws Weekday/Weekend lines from, broken out further here since different weekdays (and Saturday vs Sunday) don't share one rhythm. A window is any run of hours whose average incident count sits above that specific day's own mean, so it's sized to this corridor's measured rhythm rather than a fixed span like 'rush hour.'"
- `PatrolAlertWindowPanel.tsx:187-189` banner and `:263-265` Foot (quoted under Never-cut)
- `AiModelInsight.tsx:173-175` "Reading the metrics — {n}s so far; the free tier can take up to a minute"
- `AiModelInsight.tsx:226` AI disclaimer (quoted under Never-cut)

---

## /dashboard/incident/hourly — Hourly Breakdown

**Source files:** `app/dashboard/incident/hourly/page.tsx`; `components/dashboard/{PageHeader, DashboardChart}`; `app/dashboard/traffic/traffic.module.css`; `next/link`.

### Roles
- All three roles can open it. No DENIED entry matches `/dashboard/incident/hourly` (`lib/auth-access.ts:28-44`).
- It has no sidebar entry. No role-dependent content.

### Tabs / modes
- No mode tabs.
- Reached only from the Predictive tab's "Incident Walk-Forward Forecast" chart (click a point or x-axis label at Daily granularity; `PIC:275-293`).
- Query params read (`hourly/page.tsx:107-117`): `date` (required, must match `YYYY-MM-DD`, regex `:96`), `months`, `from`, `to`, `weather` (seeds the Weather chip; default All).
- Not a dynamic `[date]` segment because of the static export (`output: 'export'` for the Electron bundle) (`:103-106`).
- State: weather chip, selected models, Rain & Temp overlay, all `useState`. Nothing persisted.
- Wrapped in `<Suspense>` (required for `useSearchParams` under static export) (`:619-638`).

### Checklist

**Header and navigation**
- [ ] PageHeader title `Hourly Breakdown — {Mon D, YYYY}`, icon AlertTriangle, `accent="incident"` (`:373-376`)
- [ ] Subtitle, weekday-profile variant: `No hourly ground truth exists for this date — each model's daily total is distributed over the typical {weekday} shape from the last 90 days.` (`:380`)
- [ ] Subtitle, observed variant: "Observed hourly incidents for this day, with each model's daily prediction distributed over the typical shape for this weekday." (`:381`); while loading "Loading…" (`:382`)
- [ ] "Back to daily" link (chevron, `secondaryButton`) in header actions, to `/dashboard/incident?tab=Predictive&months=&from=&to=&weather=` (`:128-135`, `:182-189`)

**Invalid / missing date state** (`:191-211`)
- [ ] Header title "Hourly Breakdown", subtitle "No day selected", Back link (`:194`)
- [ ] Empty state (`ds-empty-state`, AlertTriangle 28px): h4 "That date could not be read" or "Pick a day to break down" (`:199`)
- [ ] Body `“{date}” is not a valid date — this page expects YYYY-MM-DD.` or "This view drills into a single day of the incident forecast. Choose a day on the forecast chart and it will open here." (`:201-203`), plus Back link (`:205`)

**Suspense fallback**
- [ ] Header "Hourly Breakdown" + placeholder "Loading…" (`:625-633`)

**Filter row**
- [ ] Weather group: cloud icon + "Weather" + chips "All" | "Dry" | "Wet". A chip with no matching hours is disabled with title `No {dry|wet} hours recorded on this day` (`:389-422`)
- [ ] Unknown-weather hours drop out of both Dry and Wet (`:213-216`)
- [ ] Info line `{weekday} · wet = rainfall > {threshold} mm/hr · {in-sample fitted | walk-forward validation | forecast | no model prediction for this day}` (`:423-434`)

**Chart card — toolbar**
- [ ] "Models" label + chips "XGBoost", "Random Forest", "Poisson GLM", "Neg. Binomial GLM", "SARIMAX", "LSTM", "GRU" (`:27-35`, `:441-492`)
- [ ] Chip behaviour: `aria-pressed`; disabled when the day has no stored prediction (title "No stored prediction for this day — the pipeline has not written a row for this date"); last selected is locked ("At least one model must stay selected"); otherwise `Hide {m}`/`Show {m}`; opens on the champion, if it has a prediction (`:153-160`, `:174-180`, `:455-491`)
- [ ] "Rain & Temp" overlay toggle, default ON, `aria-pressed`, title "Overlay recorded rainfall and temperature" (`:494-513`)

**Chart card — banners**
- [ ] No-log warning (amber, AlertTriangle): "No incident log covers this date — the operations log ends **{lastLogged | earlier}**. Weather and the model curves are shown; the absent bars mean **no data**, not zero incidents." (`:517-532`)
- [ ] Partial-coverage note (blue, ℹ️): `Partial coverage: {Road crashes | Motorcycle crashes | Stalled vehicles …} {is|are} not logged this far (ends {date}). Bars include only the sources that are.` (`:534-552`, labels `:84-88`)

**Chart card — chart** (`DashboardChart`, height 420)
- [ ] Loading "Loading hourly breakdown…" (`:555`); error `Hourly breakdown unavailable — {error}` (`:556`)
- [ ] Series "Actual Incidents" (bars). Hours filtered out are null, so no bar is drawn, which differs from a zero (`:294-312`)
- [ ] Wet-hour shading band (markArea, light blue) behind each wet hour, always on (`:305-311`)
- [ ] Series `{Model} Prediction`, a line per selected model, `connectNulls` (`:313-324`)
- [ ] Series "Rainfall (mm)" (bars, right axis) and "Temperature (°C)" (dashed line, right axis), present only when Rain & Temp is on (`:325-349`)
- [ ] Y axes "Incidents" (left, integer ticks) and "Rainfall (mm) / Temp (°C)" (right, hidden when overlay is off) (`:268-292`)
- [ ] X axis "12 AM"…"11 PM", rotated 45°, every other label (`:261-267`)
- [ ] Legend (bottom, circle icons): "Actual Incidents", `{M} Prediction`…, "Rainfall (mm)", "Temperature (°C)" (`:230-240`)
- [ ] Tooltip: `<b>{hour}</b> ({wet hour | dry hour | no reading})`; each series value with " mm" / " °C" units; footer `Road {n} · Moto {n} · Stalled {n}` when the hour has incidents (`:241-259`)

**Chart card — tiles** (`:560-597`)
- [ ] "Day Actual" / `Actual ({dry|wet})`: value or "—"; hint "incidents logged" / "no log for this date" (`:567-571`)
- [ ] `{Model} Predicted` per selected model: value to 1 dp in the model colour; hint "daily total · champion" / "daily total" (`:572-584`)
- [ ] "Peak Hour": hour or "—"; hint `{n} incident(s)` / "no incidents in view" (`:585-589`)
- [ ] "Quietest Hour": hour or "—"; same hints (`:590-594`)
- [ ] "Rainfall": `{mm} mm`; hint `{wet} wet · {dry} dry hrs` (`:595`)

**Chart card — footnotes**
- [ ] Unknown-weather note `{n} incident(s) fell in hours with no weather reading, so they appear under All but in neither Dry nor Wet.` (`:599-604`)
- [ ] Derived-shape note "Model curves are a **derived** hourly shape, not an hourly forecast: the pipeline predicts one total per day, spread here across the typical {weekday} profile. Weather is recorded observation from `hourly_weather` ({n} of 24 hours reported), not forecast." (`:606-611`)

### API endpoints
- `GET {BACKEND}/api/incident/hourly?date=YYYY-MM-DD`, plain `fetch` with `cache: "no-store"` (`hourly/page.tsx:146`). Only `date` is sent; months/from/to/weather go only into the back link.
- No polling. No AI calls.

### localStorage / sessionStorage
- None.

### Never-cut facts
- The weekday profile comes from "the last 90 days" (`:380`)
- Prediction-type labels: "in-sample fitted" (train), "walk-forward validation", "forecast", "no model prediction for this day" (`:426-432`)
- Wet threshold is read from the API, `wet = rainfall > {threshold} mm/hr` (`:425`)
- Absent bars mean "no data, not zero incidents" (`:527-529`)
- Partial-coverage sources: Road crashes, Motorcycle crashes, Stalled vehicles (`:84-88`)
- "Model curves are a derived hourly shape, not an hourly forecast" and weather is recorded observation from `hourly_weather` (`{n} of 24 hours reported`), "not forecast" (`:608-610`)
- The page keeps its own MODELS copy: Random Forest is `#f59e0b` here vs `#a21caf` on the daily chart (`hourly/page.tsx:29` vs `incidentPredictive.shared.ts:23`). Actual `#2563eb`, rain `#38bdf8`, temperature `#f97316`, wet band `rgba(56,189,248,0.14)` (`:38-44`)
- Disabled-chip reasons: `No {dry|wet} hours recorded on this day`; "No stored prediction for this day — the pipeline has not written a row for this date" (`:409`, `:467`)

### Visible prose likely to be shortened (verbatim)
- `hourly/page.tsx:380` "No hourly ground truth exists for this date — each model's daily total is distributed over the typical {weekday} shape from the last 90 days."
- `hourly/page.tsx:381` "Observed hourly incidents for this day, with each model's daily prediction distributed over the typical shape for this weekday."
- `hourly/page.tsx:203` "This view drills into a single day of the incident forecast. Choose a day on the forecast chart and it will open here."
- `hourly/page.tsx:527-529` "No incident log covers this date — the operations log ends {date}. Weather and the model curves are shown; the absent bars mean no data, not zero incidents."
- `hourly/page.tsx:544-549` "Partial coverage: {sources} {is|are} not logged this far (ends {date}). Bars include only the sources that are."
- `hourly/page.tsx:601-602` "{n} incident(s) fell in hours with no weather reading, so they appear under All but in neither Dry nor Wet."
- `hourly/page.tsx:608-610` "Model curves are a derived hourly shape, not an hourly forecast: the pipeline predicts one total per day, spread here across the typical {weekday} profile. Weather is recorded observation from hourly_weather ({n} of 24 hours reported), not forecast."

---

## Implementation hooks the redesign must keep (both routes)
- [ ] Class `viz-incident` on the page section (`page.tsx:803`, `:878`) and `PageHeader accent="incident"`, which sets `data-accent` (`PageHeader.tsx:24`)
- [ ] Global classes used by components: `chart-card wide`, `ds-rise`, `ds-empty-state`, `ds-scroll-fade`, `ds-narrative-cta`, `ds-narrative-btn`, `ds-narrative-loading`, `ds-narrative-spinner`, `ds-narrative-error`, `ds-page-header*`
- [ ] InfoTooltip: `role="button"`, `tabIndex=0`, `aria-label={full text}`; opens on hover or focus; portal into `document.body` with `role="tooltip"` (`InfoTooltip.tsx:47-106`)
- [ ] MetricHint: `tabIndex=0`, hover or focus, portal `role="tooltip"` (`IncidentNarrative.tsx:112-174`)
- [ ] `attachCategoryClick` keeps clicks working on symbol-less line charts (`lib/chart-click.ts:45`, used at `page.tsx:735-739`)
- [ ] ECharts options take literal colours from `useThemeTokens()` / `useChartTheme()`, not `var()` (`PIC:139-144`)
- [ ] Every dialog: `role="dialog"`, `aria-modal="true"`, `aria-label`, Close button `aria-label="Close"`, backdrop click closes; no Escape-key handler exists anywhere on these routes
- [ ] Toggle chips use `aria-pressed` (PIC split/model chips; hourly model chips and Rain & Temp)

---

## /dashboard/sustainability — Emissions

Source files (paths relative to `Front-End-Dashboard/`): `app/dashboard/sustainability/page.tsx` (1016 lines) · `components/dashboard/PredictiveEmissionChart.tsx` · `components/dashboard/FleetMixForecastChart.tsx` · `components/dashboard/PrescriptiveEmissionsPanel.tsx` · `components/dashboard/ModelNarrative.tsx` · `components/dashboard/AiModelInsight.tsx` · `components/dashboard/NarrativePanel.tsx` (only `GenerateReportButton`) · `components/dashboard/PageHeader.tsx` · `components/dashboard/InfoTooltip.tsx` · `components/dashboard/CustomSelect.tsx` · `components/dashboard/ChartSkeleton.tsx` (+`KpiSkeleton`) · `components/dashboard/CountUpValue.tsx` · `components/dashboard/DashboardChart.tsx` · `components/dashboard/aggregateSeries.ts` · `components/dashboard/useThemeTokens.ts` · `app/dashboard/traffic/components/DateRangePicker.tsx` · `app/dashboard/traffic/traffic.module.css` (imported as `styles`, page.tsx:20) · `lib/cached-json.ts` · `lib/chart-click.ts` · `lib/granularity.ts` · `lib/chart-theme.ts`. Strategy labels come from `Back-End/src/services/emissions-prescriptive.service.ts`.

Not used on this page: FeatureBriefing, NarrativePanel (default export), DateFilter. `DashboardChart` is imported in page.tsx:10 but never used there; the child components do use it.

**Correction to the brief:** `PrescriptiveEmissionsPanel` **no longer has** a hardcoded Strategy X/Y/Z panel or an ILLUSTRATIVE chip. The header comment (PrescriptiveEmissionsPanel.tsx:12-14) says the computed `/api/emissions/prescriptive` strategies replaced the literals "Strategy X/Y/Z" (8/14/22). No "ILLUSTRATIVE" string appears anywhere in scope. Its replacement is the solid-versus-hollow bar encoding plus a "Policy target" line (see Prescriptive).

### Roles
- Who can open it: **data-analyst only**. `tcc-operator` and `incident-operator` both have `/dashboard/sustainability` in `DENIED` (lib/auth-access.ts:29-43).
- Enforcement: the sidebar entry `{ label: "Emissions", href: "/dashboard/sustainability", icon: Leaf, group: "Analytics" }` (app/dashboard/layout.tsx:49) is filtered by `canAccess` (layout.tsx:179). Opening the URL directly redirects to `/dashboard` (layout.tsx:186). The audit log names the page "Emissions" (audit-log/page.tsx:81).
- Role-dependent content inside the page: **none**. No role checks in any file in scope.

### Tabs / sub-tabs / modes
- Mode tabs (exact labels): `"Descriptive"` · `"Predictive"` · `"Prescriptive"` (page.tsx:727, 805). The active tab shows a check-mark SVG. Plain `<button>`s with no role="tab" and no aria-selected.
- Storage: React `useState` `activeTab`, default `"Descriptive"` (page.tsx:96). **Not** in a URL param, localStorage or sessionStorage, so it resets to Descriptive on every navigation.
- Range, Class, Show, Granularity and By hour/By day are all `useState` too (page.tsx:99-107). Defaults: Range `"12"`, Granularity `"monthly"`, timeView `"hour"`, Class/Show `"All"`.
- Predictive inner state (all useState): granularity `"Weekly"`, history `All`, future `7` days, selected models = API champion (PredictiveEmissionChart.tsx:153-166).
- Layout per tab: Descriptive returns its own JSX tree (page.tsx:772-1015). Predictive and Prescriptive share a shell (page.tsx:719-770).

### Checklist

**Shared shell (all three tabs)**
- [ ] `<section>` with classes `styles.page` + global `viz-emissions`. That class sets `--page-accent` and the `--kpi-*` colours (globals.css:5629-5639) (page.tsx:721, 773)
- [ ] PageHeader `accent="emissions"`, icon `Leaf`, title `"Emissions Overview"`, subtitle `"Vehicle emissions and air quality trends across NLEX"` (page.tsx:722, 774)
- [ ] Mode tab group `"Descriptive" / "Predictive" / "Prescriptive"`, active check-mark SVG (page.tsx:726-733, 804-811)
- [ ] `styles.filterRow` with `styles.spacer` pushing the mode tabs right (page.tsx:723-725, 777-802)

**Range control (Descriptive + Prescriptive; absent on Predictive)** (page.tsx:691-716)
- [ ] Calendar icon + label `"Range"` (page.tsx:693-694)
- [ ] Segmented buttons `"3 mo"` (`3`), `"12 mo"` (`12`, default), `"All"` (`all`), `"Custom"` (`custom`). Active one has class `active` and a check-mark SVG (page.tsx:696-700)
- [ ] `"Custom"` reveals DateRangePicker, bounded by `minDate={data?.meta.minDate}` / `maxDate={data?.meta.maxDate}` (page.tsx:703-714)
- [ ] Custom with only one date: the Descriptive fetch is skipped (page.tsx:115). Prescriptive falls back to `months=12` (page.tsx:761-763, PrescriptiveEmissionsPanel.tsx:86-91)

**DateRangePicker (Custom range)** (traffic/components/DateRangePicker.tsx)
- [ ] Trigger button: Calendar icon, start `"mm/dd/yyyy"` placeholder or `MM/DD/YYYY`, separator `"—"`, then the end date (lines 132-144)
- [ ] Popover header: ChevronLeft/ChevronRight. They step a month, or 10 years in years view (149-168)
- [ ] Month-name button toggles the months grid. Year button toggles the years grid (153-164)
- [ ] Day grid with weekday headers `"Su" "Mo" "Tu" "We" "Th" "Fr" "Sa"` (26, 171-175)
- [ ] Days outside minDate/maxDate are `disabled` + `aria-disabled` and do not drive the hover preview (192-213)
- [ ] Two-click selection: the first click sets the start, the second completes. Clicking an earlier date second swaps the order. Auto-closes when complete (74-89)
- [ ] Hover range preview, forwards and backwards (183-190)
- [ ] Months grid `"Jan"…"Dec"` and years grid of 12 years, each returning to the day view (222-251)
- [ ] Presets `"Last 7 days"`, `"Last 30 days"`, counted back from `maxDate` (not today) and clamped to `minDate` (258-275)
- [ ] Click outside closes (58-66)

---

**DESCRIPTIVE TAB**

**Descriptive · filter row** (page.tsx:777-812)
- [ ] Range control (page.tsx:778)
- [ ] Label `"Class"` + CustomSelect. Options `"All classes"` (All), `"Class 1 · Light"` (1), `"Class 2 · Medium"` (2), `"Class 3 · Heavy"` (3). It refetches with `vehicleClass`, and any non-All pick resets the hero's Show to All (page.tsx:784-798)
- [ ] Indicator `"Updating…"` while refetching with data already present (`loading && data`) (page.tsx:801)
- [ ] Mode tabs (page.tsx:804-811)

**Descriptive · KPI row** (`styles.kpiRow` + `ds-rise`, 6 tiles; icons `aria-hidden`) (page.tsx:815-875)
- [ ] All values: `KpiSkeleton` while first loading, `"—"` when null, `CountUpValue` counts up once. Only single-number strings animate, and it honours `prefers-reduced-motion` (page.tsx:683-684, CountUpValue.tsx:29-74)
- [ ] Tile 1 `"Total CO₂ (Modeled)"` + InfoTooltip, Leaf icon (page.tsx:816-818)
- [ ] Tile 1 value `` `${fmtCompact(totalCo2T)} t` `` with hover title `` `${fmtInt(totalCo2T)} tonnes` `` (page.tsx:819-820)
- [ ] Tile 1 hint: coloured delta `fmtPct(deltaPct)` (`deltaUp` when ≤0, `deltaDown` when >0) + `" vs previous period"` (page.tsx:822-827)
- [ ] Tile 2 `"Avg Daily CO₂"` + InfoTooltip, CalendarClock icon, value `` `${fmtInt(avgDailyT)} t` `` (page.tsx:829-832)
- [ ] Tile 2 sparkline: 7-day rolling mean of daily total CO₂, no axes or tooltip, needs ≥2 days (page.tsx:527-541, 833-835)
- [ ] Tile 3 `"Heavy-Vehicle Impact"` + InfoTooltip, Truck icon, value `` `${heavyCo2Pct.toFixed(1)}%` `` (page.tsx:837-840)
- [ ] Tile 3 hint `` `of CO₂ from just ${heavyVolPct.toFixed(1)}% of traffic` `` (page.tsx:842)
- [ ] Tile 4 `"Peak Emission Hour"` + InfoTooltip, Clock icon, value `fmtHour(peakHour)` (e.g. "5 PM") (page.tsx:845-848)
- [ ] Tile 4 hint `` `${fmt1(allHour[peakHour])} t/day in that hour` `` (page.tsx:850)
- [ ] Tile 5 `"Delay-Induced CO₂"` + InfoTooltip, Timer icon, value `` `${fmtInt(delayCarbonT)} t` `` (page.tsx:853-856)
- [ ] Tile 5 hint `` `${delayCarbonPct.toFixed(2)}% of CO₂ · ${delayLongSharePct.toFixed(0)}% from ${fmtInt(delayLongIncidents)} incidents over 3 h` `` (page.tsx:858-860)
- [ ] Tile 6 `"Measured Air Quality"` + InfoTooltip, Wind icon, value `` `${avgAqi.toFixed(1)} / 5` `` (page.tsx:863-868)
- [ ] Tile 6 hint `` `${aqiWord} · avg PM2.5 ${fmt1(avgPm25)|"—"} µg/m³` ``, or `"no station readings in range"` (page.tsx:870-872)
- [ ] Tile 6 aqiWord bands: `"Good"` <1.5, `"Fair"` <2.5, `"Moderate"` <3.5, `"Poor"` <4.5, else `"Very poor"` (page.tsx:685)

**Descriptive · Hero card "CO₂ Emissions Trend by Vehicle Class"** (`chart1 hero`) (page.tsx:878-931)
- [ ] Title + InfoTooltip (page.tsx:881)
- [ ] `"Show"` CustomSelect (series visibility only, no refetch). Options `"All classes"`, `"Class 1 · Light"`, `"Class 2 · Medium"`, `"Class 3 · Heavy"` (page.tsx:886-905)
- [ ] Show is disabled while Class ≠ All, with title `"The tab is filtered to one class — set Class back to all to choose what this chart shows"` (page.tsx:893-898)
- [ ] `styles.heroFilterDivider` between the two control groups (page.tsx:907)
- [ ] `"Granularity"` segmented: `"Hourly"`, `"Daily"`, `"Weekly"`, `"Monthly"` (default Monthly), active check-mark (page.tsx:909-926)
- [ ] Hourly is disabled when the API omits `hourlyTrend` (range >14 days), title `"Hourly detail is available for ranges up to 2 weeks"` (page.tsx:915-918)
- [ ] Daily/Weekly/Monthly are disabled with title `` `Needs at least ${"two days"|"two weeks"|"two months"} of data — this range is ${days} day(s)` `` (min 2/14/60 days) (page.tsx:915-919, granularity.ts:26-50)
- [ ] Auto-demote: an impossible grain switches to `bestGrainFor` (page.tsx:154-159)
- [ ] Chart: stacked area lines, series `"Class 1 · Light"`, `"Class 2 · Medium"`, `"Class 3 · Heavy"`, filtered by Show (page.tsx:227-261)
- [ ] Y-axis name `"tonnes CO₂"`, compact tick labels (page.tsx:242)
- [ ] X labels only at month boundaries: `"Jan 2026"`-style, `"Jan 5"` when hourly (page.tsx:224-241, granularity.ts:75-93)
- [ ] Tooltip head: bucket label (`"January 2026"` / `"Week of Jan 5, 2026"` / `"Mon, Jan 5, 2026"` / `"Jan 5, 2026, 2 PM"`) (page.tsx:243-251, granularity.ts:103-122)
- [ ] Tooltip body: `` `${seriesName}: ${n} t` `` per series + `` `Total: ${n} t` `` (page.tsx:243-251)
- [ ] Legend shown only when Show = All (page.tsx:257)
- [ ] Partial first/last buckets trimmed for weekly/monthly (page.tsx:208-217)
- [ ] Click anywhere on the plot opens the trend detail modal. Works via `attachCategoryClick` because lines have `symbol:"none"` (page.tsx:657-679, lib/chart-click.ts)
- [ ] Empty `"No emissions data for the selected range"` (page.tsx:930)

**Descriptive · "When Emissions Happen"** (`chart2`) (page.tsx:934-950)
- [ ] Title + InfoTooltip (page.tsx:937)
- [ ] Takeaway subtitle `` `Peak around ${fmtHour(peakHour)} · quietest around ${fmtHour(quietHour)} · heaviest day: ${DOW}` `` (page.tsx:299-301, 938)
- [ ] Toggle `"By hour"` (default) / `"By day"`, active check-mark (page.tsx:940-947)
- [ ] By hour: smooth lines `"Weekdays"` and `"Weekends"`, avg t CO₂ per day for each hour (page.tsx:314-340)
- [ ] By hour: markPoint label `` `Peak · ${fmtHour(peakIdx)}` `` on the weekday peak (page.tsx:323-329)
- [ ] By hour axes: x `"12 AM"…"11 PM"` labelled every 3 h; y `"avg t CO₂ / day"` (page.tsx:310-311)
- [ ] By hour tooltip `"X.X t"` (or `"—"`); legend (page.tsx:312-313)
- [ ] By day: bars `"Mon"…"Sun"` of average per day; the busiest bar is highlighted with a value label (page.tsx:344-366)
- [ ] By day tooltip `` `<b>${DOW}</b><br/>${avg} t CO₂ per ${DOW} on average<br/>${total} t total across ${n} ${DOW}s` `` (page.tsx:349-353)
- [ ] Click → hour or day detail modal (page.tsx:571-603, 949)
- [ ] Empty `"No data for the selected range"` (page.tsx:949)

**Descriptive · "Fleet Mix vs Pollution Load"** (`chart3`) (page.tsx:952-960)
- [ ] Title + InfoTooltip (page.tsx:955)
- [ ] Takeaway `` `Heavy vehicles (Class 2–3): ${heavyVolPct}% of traffic → ${heavyCo2Pct}% of CO₂` `` (page.tsx:388-391, 956)
- [ ] Horizontal 100%-stacked bars. Rows top to bottom: `"Traffic volume"` (vehicles), `"CO₂"` (t), `"NO₂"` (kg), `"PM2.5"` (kg) (page.tsx:379-384, 395)
- [ ] Series `"Class 1 · Light"`, `"Class 2 · Medium"`, `"Class 3 · Heavy"`; x 0–100% in steps of 25; legend (page.tsx:398, 412-420)
- [ ] Tooltip (shadow pointer) `` `${class}: ${x.x}% (${compact value} ${unit})` `` under a bold row label (page.tsx:400-411)
- [ ] Click → fleet detail modal (page.tsx:605-619)
- [ ] Empty `"No data for the selected range"` (page.tsx:959)

**Descriptive · "Heavy-Vehicle Share of CO₂"** (`chart4`) (page.tsx:963-971)
- [ ] Title + InfoTooltip (page.tsx:966)
- [ ] Takeaway `` `Now ${last}% — ${"rising"|"falling"|"steady"} across the range (from ${first}%)` ``. Direction threshold ±0.5 pp (page.tsx:433-439, 967)
- [ ] Single line `"Heavy-vehicle share of CO₂"`, no legend; follows the hero Granularity and Class (built from `trendRows`) (page.tsx:426-431, 467-475)
- [ ] Dashed average markLine labelled `` `avg ${avg}%` ``; y-axis `%` padded ±2 (page.tsx:450-456, 476-482)
- [ ] Tooltip `` `<b>${r.label}</b><br/>Heavy-vehicle share: <b>${v}%</b><br/>${c2+c3} t of ${total} t CO₂` `` (page.tsx:457-463)
- [ ] Click → heavy-share detail modal (page.tsx:621-637)
- [ ] Empty `"No data for the selected range"` (page.tsx:970)

**Descriptive · "Measured Air Quality by Month"** (`chart5`) (page.tsx:973-980)
- [ ] Title + InfoTooltip (page.tsx:976)
- [ ] Monthly 100%-stacked bars, series `"Good (AQI 1–2)"`, `"Moderate (AQI 3)"`, `"Poor (AQI 4–5)"`; x labels like `"Jan 26"`; legend (page.tsx:26, 490-523)
- [ ] Tooltip: `` `${band}: ${pct}% (${n} readings)` `` per band + `` `Avg PM2.5: ${x} µg/m³` `` or `"—"` (page.tsx:501-513)
- [ ] Click → AQI detail modal (page.tsx:639-655)
- [ ] Empty `"No station readings in the selected range"` (page.tsx:979)

**Descriptive · shared chart states** (`chartFrame`, page.tsx:657-679)
- [ ] `ChartSkeleton` (12 fixed bars, `aria-hidden`) on first load (page.tsx:658)
- [ ] Error `"Live data unavailable — is the backend running on port 4000?"` (page.tsx:659)
- [ ] Per-card empty note in `styles.placeholder` (page.tsx:660)

**Descriptive · click-to-inspect detail modal** (page.tsx:983-1013)
- [ ] Backdrop `role="dialog"`, `aria-modal="true"`, `aria-label={detail.title}`. Backdrop click closes; inner `stopPropagation` (page.tsx:984-985)
- [ ] Accent bar, Leaf icon (`aria-hidden`), `<h3>` title, optional subtitle `<p>` (page.tsx:986-992)
- [ ] Close button `aria-label="Close"` (X SVG) (page.tsx:993-995)
- [ ] Zebra key/value rows (`detailRowAlt` on even rows) (page.tsx:997-1004)
- [ ] Footer note with info icon (page.tsx:1005-1010)
- [ ] No Escape-key handler today (keyboard close is absent)
- [ ] Trend variant, title: `r.label` or `` `Week of ${label}` `` (page.tsx:553)
- [ ] Trend variant, subtitle `` `Modeled CO₂ · ${periodWord}ly` ``. As coded this renders "dayly" for daily, and hourly reads "monthly" (page.tsx:552-556)
- [ ] Trend variant, rows: `"Total CO₂"`, the three classes (t), `"Northbound / Southbound"` `` `${nb} t / ${sb} t` `` (page.tsx:558-562)
- [ ] Trend variant, rows (cont.): conditional `"Plazas not split by direction"`, `"vs range average"` ±%, `"Rank in range"` `` `#${rank} of ${n} ${periodWord}s` `` (page.tsx:563-565)
- [ ] Trend variant, note `` `Range: ${from} to ${to}` `` (page.tsx:544, 567)
- [ ] Hour variant: title `` `${fmtHour(h)} – ${fmtHour(h+1)}` ``, subtitle `"Modeled CO₂ in this hour of day"` (page.tsx:577-579)
- [ ] Hour variant rows: `"Avg on a weekday"`, `"Avg on a weekend day"`, `"Total in range"`, `"Rank among hours"` `` `#${rank} of 24` `` (page.tsx:580-585)
- [ ] Day variant: title `"Mon"`…, subtitle `"Modeled CO₂ on this day of week"` (page.tsx:592-594)
- [ ] Day variant rows: `"Avg per day"`, `"Total in range"` `` `${t} t across ${n} ${DOW}s` ``, `"Rank among days"` `` `#${rank} of 7` `` (page.tsx:595-599)
- [ ] Fleet variant: title = row label, subtitle `"Share by vehicle class"`, rows per class `` `${pct}% · ${compact} ${unit}` `` (page.tsx:610-616)
- [ ] Fleet variant note `` `Emission factors (CO₂ g/km): Class 1: ${g} · Class 2: ${g} · Class 3: ${g}. Range: …` `` (page.tsx:617)
- [ ] Heavy-share variant: subtitle `"Heavy-vehicle share of modeled CO₂"`; rows `"Heavy-vehicle share"`, Class 2, Class 3, Class 1, `"Total CO₂"` (page.tsx:625-634)
- [ ] Heavy-share variant note `"Heavy = Class 2 + Class 3 (buses, trucks). Range: …"` (page.tsx:635)
- [ ] AQI variant: title `"Jan 26"`, subtitle `"Measured air quality (OpenWeatherMap, hourly station readings)"` (page.tsx:645-646)
- [ ] AQI variant rows: three bands `` `${n} readings (${pct}%)` `` + `"Avg PM2.5"` (page.tsx:647-652)
- [ ] AQI variant note `"AQI is the 1–5 OpenWeatherMap scale measured at expressway stations — the observed counterpart to the modeled emissions. Range: …"` (page.tsx:653)

---

**PREDICTIVE TAB**

**Predictive · filter row** (page.tsx:723-734)
- [ ] Mode tabs only. No Range or Class control here (page.tsx:724)

**Predictive · Card 1 "Corridor CO₂ Walk-Forward Forecast"** (`spanFull`, `chart-card wide`) (PredictiveEmissionChart.tsx)
- [ ] Loading text `"Loading CO₂ forecast from AWS…"`; while retrying `"Database slow to respond — retrying…"` (558)
- [ ] Error card: title + InfoTooltip, red error message (`json.message` or `` `HTTP ${status}` `` or `"Forecast unavailable"`) (523-530)
- [ ] Error card note `"Three attempts were made. This instance is shared, so a connection can be slow to establish while the training pipelines run — the stored forecast itself is unaffected."` (531-534)
- [ ] Error card button `"Try again"`, which refetches (535-549)
- [ ] Title `"Corridor CO₂ Walk-Forward Forecast"` + InfoTooltip (778-779)
- [ ] Subtitle, aggregated: `"Every point is a {meanLabel} — the average of that {bucketNoun}'s days, not a total · Toggle models to overlay predictions"` (782-786)
- [ ] Subtitle, daily: `"Tonnes of CO₂ per day across the whole corridor · Toggle models to overlay predictions"` (788)
- [ ] Toolbar label `"Models"` with trend icon (565-578)
- [ ] Model chips `"Volume-derived"`, `"Polynomial"`, `"Gradient Boosting"`, `"LSTM"`. `aria-pressed`, check-mark when on, tinted with the series colour (587-611)
- [ ] Chip title `` `${on?"Hide":"Show"} ${label}` ``, or `"At least one model must stay selected"` on the last selected chip (595)
- [ ] `"★"` on the champion chip; `"="` on co-champion chips when tied (612-616)
- [ ] Default selection = API `championModel`, falling back to Polynomial (191)
- [ ] Aggregation pill (only when aggregated) `"⌀ Each point = {meanLabel} averaged, not totalled"` (813-829)
- [ ] Aggregation pill title `"Each plotted point is the arithmetic mean of the days in its {bucketNoun} — for the actual series and for every model line. Totals are never plotted: a sum would make a short {bucketNoun} look like a dip."` (815)
- [ ] `"GRANULARITY"` label (832-835)
- [ ] `"Hourly"` shown disabled (span, not-allowed), title `"The CO₂ models forecast daily totals — there is no hourly prediction to drill into"` (844-852)
- [ ] Granularity buttons `"Daily"`, `"Weekly"` (default), `"Monthly"`; active shown as `"✓ {g}"` (853-876)
- [ ] Daily title `"One point per day — the resolution the models actually forecast"`; others `` `Averaged per ${week|month} — a viewing aid, not a separate forecast` `` (862-866)
- [ ] Picking Daily sets history to 90 days (no button highlights then); picking another grain sets history to All (856-861)
- [ ] `"HISTORY"` label + buttons `"60d"`, `"1y"`, `"All"` (default); active `"✓ …"` (883-911)
- [ ] HISTORY titles `"All context back to 2022 — the 7-day forecast will be a sliver"` / `` `Show the last ${label} of context before the scored window, so the forecast is legible` `` (897-901)
- [ ] Zone row, Past: swatch, `"Past"`, `` `${trainDays}d trained · ${trainPct}%` `` + warning `` ` · showing last ${pastDays}d` `` when trimmed (925-942)
- [ ] Zone row, Present: swatch, `"Present"`, `` `${holdoutDays}d scored · ${holdoutPct}% · fixed by evaluation` `` (945-952)
- [ ] Zone row, Future: swatch, `"Future"`, buttons `"7 d"` (default), `"2 wk"`, `"1 mo"`, `"2 mo"`, `"3 mo"` (955-1000)
- [ ] Future buttons: a step is hidden when every horizon bucket it adds is unusable; disabled when longer than `split.futureDays` (976-995)
- [ ] Future suffix `"· validated at 7d"` (1001)
- [ ] Horizon warning banner (⚠) when future > 7 d: plain-language drift paragraph (1009-1031)
- [ ] Banner weak-stretch line `"Days {hLo}–{hHi} are the least reliable — in that stretch you would do better just repeating last week"` + `". It steadies again after day {hHi+1}."` (1032-1044)
- [ ] Weak-stretch title `` `MASE ${mase} — above 1.0 means it loses to a seasonal-naive benchmark (copy the same weekday from last week)` `` (1036)
- [ ] Banner line `"Typical error: days {hLo}–{hHi} {wmape}% off · …"`. Unusable buckets are warning-coloured (1049-1058)
- [ ] Typical-error title `"WMAPE — total absolute error as a share of total actual CO₂, measured by rolling-origin over 9 origins"` (1046)
- [ ] Chart (450 px): series `"Actual CO₂"` (solid) + one dashed series per selected model, named by its label (482-519)
- [ ] Model series show markers only over the Future block (513-514)
- [ ] Zone bands labelled with chips `"Past"`, `"Present"`, `"Future"` (356-369)
- [ ] Hatched weak-horizon band labelled `` `⚠ days ${hLo}-${hHi}` `` (from `horizonAccuracy`) (375-395)
- [ ] Dashed markLines at the holdout and future boundaries (495-502)
- [ ] Legend with formatter `` `${name}  ·  ${meanLabel}` `` (442-449)
- [ ] Tooltip head: date, or `` `${label} · mean of ${n} day(s)` `` (414-417)
- [ ] Tooltip zone line: `"Future — no actual to compare"` / `"Holdout — scored against actual"` / `"Past — training context"` (410-413)
- [ ] Tooltip rows: each series `"{v} t"` + ±% vs actual (418-434)
- [ ] dataZoom: `inside` (throttle 60) + `slider` (height 16) (450-461)
- [ ] Y-axis `` `tonnes CO₂ / day (${meanLabel})` `` or `"tonnes CO₂ / day"`, not zero-based (470-481)
- [ ] X labels: `"Jan 5"`, `"Jan 26"` for monthly, `"2026"` for yearly (349-354)
- [ ] Metrics block `"Real-World ML Validation Metrics"` + toggle `"Show All Metrics"` / `"Show Less"` (632-645)
- [ ] Metrics columns `"Model"`, `"RMSE (t)"`, `"MAE (t)"`, `"WMAPE"`, `"R² Score"`, `"MASE"`; expanded adds `"MAPE"`, `"Rank"` (661-677)
- [ ] MASE header title `"Error relative to a seasonal-naive forecast. Below 1.0 beats it; above 1.0 does not."` (668)
- [ ] Rows only for selected models, each with a colour dot (681-688)
- [ ] Row status: `` `accepted · rank #${rank}` `` / `"accepted · co-champion"` / `"rejected"` / `"no metrics"` (695-701)
- [ ] Number formats: RMSE/MAE 2 dp, WMAPE `x.xx%`, R² 4 dp, MASE 3 dp (green <1, red ≥1), MAPE `x.xx%` (705-735)
- [ ] Caption `"Scored on {holdoutDays} held-out days at a {horizonDays}-day horizon · volume validates at 14d, so the two are not directly comparable."` (752-753)
- [ ] Caption, when tied: bold `"{A and B} are within the run-to-run jitter of each other, so neither is the winner."` (754-761)
- [ ] ModelNarrative collapsed: button `"Generate report"` with FileText icon (`ds-narrative-cta` / `ds-narrative-btn`) (ModelNarrative.tsx:177, NarrativePanel.tsx:140-152)
- [ ] ModelNarrative open: Sparkles icon, `"Narrative Explanation"`, button `"Hide report"` (ModelNarrative.tsx:193-262)
- [ ] ModelNarrative open: `"Generated from the stored validation metrics for the models currently selected · {scoredDays} scored days, {start} to {end}, forecasting {horizonDays} days ahead"` (ModelNarrative.tsx:267-276)
- [ ] AiModelInsight loading (`role="status"`, spinner): `"Reading the metrics"` + after 8 s `" — {n}s so far; the free tier can take up to a minute"` (AiModelInsight.tsx:168-179)
- [ ] AiModelInsight error (`role="alert"`, raw error on hover title) + button `"Try again"` (AiModelInsight.tsx:182-196)
- [ ] AiModelInsight error texts: busy `"The explanation service is busy — it allows only so many requests a minute. Wait a moment and try again."` (AiModelInsight.tsx:149)
- [ ] AiModelInsight error texts: timeout `"The model did not answer in time. The free tier queues under load, so a second attempt usually gets through."` (AiModelInsight.tsx:155)
- [ ] AiModelInsight error texts: unreachable `"Could not reach the explanation service. The rest of this page is unaffected — the figures above come from the warehouse, not from it."` (AiModelInsight.tsx:161)
- [ ] AiModelInsight result: summary paragraph, per-model list `"{label} — {verdict}"`, amber caveat box (AiModelInsight.tsx:201-223)
- [ ] AiModelInsight footer `"Written by the language model from the validation metrics shown on this card. Check any figure against the numbers above before acting on it."` (AiModelInsight.tsx:225-227)
- [ ] NOTE: the collapsed-state chips (`"RANK #n"` / `"CO-CHAMPION"` / `"REJECTED"`, WMAPE, `"MASE x.xx"`) and the `"Plain-language read-out of how … performed"` line (ModelNarrative.tsx:202-247) are **unreachable**. The early `return` at :177 renders only the button. Nothing visible to preserve.
- [ ] NOTE: the `quantityNote` prop (CO₂-is-derived caveat, PredictiveEmissionChart.tsx:1082-1087) is passed to ModelNarrative but **never rendered**. Today that caveat is not visible anywhere (see "Never cut").

**Predictive · Card 2 "Forecasted Fleet Composition"** (`spanFull`, `chart-card wide`) (FleetMixForecastChart.tsx)
- [ ] Loading: title + `"Loading…"` (171-177)
- [ ] Error: title + error text (default `"Could not load the fleet-mix forecast"`) + button `"Try again"` (155-168)
- [ ] Empty: `"No fleet-mix forecast has been published yet. Run smartflow_scripts/3_training_testing/fleet_mix/train_fleet_mix.py to generate one."` (183-192)
- [ ] Title `"Forecasted Fleet Composition"` + InfoTooltip (342-343)
- [ ] Subtitle `"Champion {model_name}"` or `"No model accepted"`, then `" · {future_days}-day projection"`, `" · validated at 7 days"`, `" · trained {YYYY-MM-DD}"` (345-350)
- [ ] Staleness warning when the last observed day is >45 days old: `"Data ends {date} — {n} days ago. This projection covers a period that has already passed; refresh the warehouse to forecast forward."` (358-363)
- [ ] Headline `"Heavy share (C2+C3) · 30-day means"` with `"{now%} → {end%}"` (365-369)
- [ ] Headline change: `"no material change"` (<1 pp) or `"+x.x pp"` / `"-x.x pp"` (warning colour if up, success if down) (370-381)
- [ ] Chart (320 px): 100%-stacked area, y 0–100% (not truncated), series `"Class 3 · heavy"`, `"Class 2 · medium"`, `"Class 1 · light"` (88-90, 250-307)
- [ ] Observed band solid; projected band paler (opacity 0.42). Projected series have no tooltip and share names, so the legend shows 3 entries, lightest first (229-241, 291-306)
- [ ] Dashed boundary markLine labelled `"forecast →"` (276-289)
- [ ] Tooltip (crosshair): `"{date} · observed|projected"` + per class `x.xx%` (199-227)
- [ ] Tooltip, projected days: `"Heavy (C2+C3) x.xx%"` + `"· surge"` (199-227)
- [ ] Surge banner `"Heavy-vehicle surge predicted on {n} day(s) — {first 4 dates}{ and N more}. A day is flagged when the projected Class 2+3 share runs more than 1.5 standard deviations above its training mean."` (389-395)
- [ ] Leaderboard columns `"MODEL"`, `"MAE (pp)"`, `"MAPE"`, `"HEAVY WMAPE"`, `"HEAVY R²"`, `"SKILL"` (403-412)
- [ ] Leaderboard status `"accepted"` / `"accepted · champion"` / `"rejected"` / `"baseline"`, with the rejection reason or diagnosis on hover (415-423)
- [ ] Leaderboard formats: MAE 2 dp, MAPE/WMAPE `x.xx%`, R² 3 dp, SKILL 3 dp (green <1, warning ≥1) (425-431)
- [ ] Leaderboard caption: Aitchison distance / SKILL explanation + `` `Protocol: ${champ.split_label}.` `` (436-441)

---

**PRESCRIPTIVE TAB**

**Prescriptive · filter row** (page.tsx:723-734)
- [ ] Range control (`"3 mo" "12 mo" "All" "Custom"` + DateRangePicker). No Class filter and no `"Updating…"` (page.tsx:724)
- [ ] Mode tabs

**Prescriptive · card "Projected % Emission Reduction by Strategy"** (`chartCard chart1`, body `height:auto`) (page.tsx:745-766)
- [ ] Title + InfoTooltip (page.tsx:748)
- [ ] Intro `"CO₂ avoided per strategy, as a share of what the corridor actually emitted over the Range."` (page.tsx:749-751)
- [ ] Panel takes `months` / `from` / `to` from the Range control (page.tsx:760-764)
- [ ] Loading `"Computing strategies…"` (PrescriptiveEmissionsPanel.tsx:111)
- [ ] Error `"Strategies unavailable"` + message or `"No data returned."` (PrescriptiveEmissionsPanel.tsx:112-121)
- [ ] No-data `"No emissions data in this Range"` + server `noData` text (PrescriptiveEmissionsPanel.tsx:124-133)
- [ ] Recommendation box: left border green when a lead exists, otherwise warning (PrescriptiveEmissionsPanel.tsx:235-241)
- [ ] `"Do this"` line (largest evidence-bounded strategy) (PrescriptiveEmissionsPanel.tsx:242-249)
- [ ] `"Nothing to do yet"` line: `"No evidence-bounded strategy can be computed for this Range. {reason}"` (PrescriptiveEmissionsPanel.tsx:250-253)
- [ ] `"Then"` line (second evidence-bounded strategy) with bold `"Do not add these two together."` (PrescriptiveEmissionsPanel.tsx:256-262)
- [ ] `"Not on this evidence"` line (policy-target scenario) + `evidenceNote` (PrescriptiveEmissionsPanel.tsx:264-269)
- [ ] Bar chart (280 px): one bar per strategy, sorted largest first; x labels = strategy labels (wrap at 130 px) (PrescriptiveEmissionsPanel.tsx:138-146)
- [ ] Y-axis `"% of corridor CO₂"`, ticks `"{v}%"`; bar-top labels `"x.xx%"` (PrescriptiveEmissionsPanel.tsx:147-154, 191-197)
- [ ] Encoding: evidence-bounded bars solid teal; policy-target bar **hollow dashed outline**. This replaces the old ILLUSTRATIVE chip (PrescriptiveEmissionsPanel.tsx:180-189)
- [ ] Tooltip: `"{label}"`, `"{pct}% of corridor CO₂ · {t} t avoided"` (PrescriptiveEmissionsPanel.tsx:155-164)
- [ ] Tooltip (cont.): `"Monte Carlo range (5th–95th of {runs} runs): {lo}–{hi} t"`, then `{lever}` (PrescriptiveEmissionsPanel.tsx:165-168)
- [ ] Tooltip (cont.): `"Bounded by what this corridor has already achieved."` or bold `"Policy target — not demonstrated by any observed change."` (PrescriptiveEmissionsPanel.tsx:169-171)
- [ ] Basis note `"Against {t} t actually emitted over {from} to {to}."` (PrescriptiveEmissionsPanel.tsx:274-275)
- [ ] Basis note, incidents: `"Not computed for this Range: {labels}. {reason}"`, or `"Incident-based strategies use {n} cleared incidents in the same window."` (PrescriptiveEmissionsPanel.tsx:276-285)
- [ ] Basis note, scenario: `"{scenario} is drawn hollow because it is a policy target, not a demonstrated change. The other two are bounded by response times already delivered on this corridor, and their ranges come from a Monte Carlo resampling of the incidents."` (PrescriptiveEmissionsPanel.tsx:286-293)
- [ ] Strategy labels from the API: `"Faster incident clearance"`, `"Response capacity at the busiest hours"`, `` `Heavy-vehicle share down ${deltaPp} pp` `` (Back-End emissions-prescriptive.service.ts:322, 339, 354)
- [ ] (The API also returns `assumptions[]` per strategy. These are **not rendered** today.)

### API endpoints
`BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"`. All calls are plain `fetch` or `cachedJson`, with **no auth header**. No `apiFetch` or `authedJson`. **No polling** anywhere.
- `GET ${BACKEND}/api/emissions/analytics?months={3|12|all}` or `?from=YYYY-MM-DD&to=YYYY-MM-DD`, plus `&vehicleClass={1|2|3}` when Class ≠ All. Called by the page through `cachedJson`: 5-minute TTL, stale-while-revalidate, in-memory, keyed by URL (page.tsx:119-130, lib/cached-json.ts:32-41). It refetches when Range, custom dates or Class change.
- `GET ${BACKEND}/api/emissions/forecast`, from PredictiveEmissionChart. Up to 3 tries with 1 s and 3 s backoff; retries only when `json.retryable` or status 503. `"Try again"` refetches (PredictiveEmissionChart.tsx:175-224).
- `GET ${BACKEND}/api/emissions/fleet-mix?days=180`, from FleetMixForecastChart. One attempt; `"Try again"` refetches (FleetMixForecastChart.tsx:107-122).
- `GET ${BACKEND}/api/emissions/prescriptive?months={3|12|all}` or `?from=&to=`, with `cache:"no-store"`, from PrescriptiveEmissionsPanel (PrescriptiveEmissionsPanel.tsx:82-109).
- `POST ${BACKEND}/api/ai-insight/model-narrative`, from AiModelInsight, only after `"Generate report"` is pressed. Body `{quantity:"emissions", metrics:[{model,wmape,mae,rmse,r2,mase,rank,accepted,rejectedReason,diagnosis}], horizonDays, scoredDays, windowStart, windowEnd, weatherMode:null}` (AiModelInsight.tsx:96-113).
  - It aborts after 100 s and re-requests once per change of selected models. The 1 s `setInterval` only drives the elapsed-seconds counter (AiModelInsight.tsx:28, 81, 92, 137-141).

### localStorage / sessionStorage keys
- **None** in any file in scope. All page and tab state is `useState`, and nothing is in the URL. The only persistence is the module-scope `cachedJson` memory cache (lost on reload).

### "Never cut" facts
- Units: `"tonnes CO₂"`, `"t"`, `"avg t CO₂ / day"`, `"tonnes CO₂ / day"`, `"t/day in that hour"`, `"µg/m³"`, `"/ 5"` (AQI), `"kg"` (NO₂, PM2.5), `"vehicles"`, `"CO₂ g/km"`, `"pp"`, `"% of corridor CO₂"`, `"MAE (pp)"`, `"RMSE (t)"`, `"MAE (t)"`
- Modeled-not-measured: KPI `"Total CO₂ (Modeled)"`. Tooltip: `"…hourly toll counts at every exit × that exit's segment length × the DENR/DOTC factor for each vehicle class. Modeled, not a sensor reading — and the same record the CO₂ forecast is trained on, so the two agree."` (page.tsx:818)
- Delay CO₂ method: `"…area λ×T²/2 at that segment's vehicles per hour… Moving vehicles' CO₂ does not change with speed in this model: this is the part a delay adds."` (page.tsx:855)
- Delay CO₂ hint threshold: `"incidents over 3 h"` (page.tsx:859)
- Comparison basis: `"vs previous period"` (page.tsx:826)
- Heavy definition: `"Heavy = Class 2 + Class 3 (buses, trucks)."` (page.tsx:635) and `"Heavy vehicles (Class 2–3)"` (page.tsx:390)
- AQI source: `"Measured air quality (OpenWeatherMap, hourly station readings)"` and `"AQI is the 1–5 OpenWeatherMap scale measured at expressway stations — the observed counterpart to the modeled emissions."` (page.tsx:646, 653)
- AQI band definitions: `"Good (AQI 1–2)"`, `"Moderate (AQI 3)"`, `"Poor (AQI 4–5)"` (page.tsx:26)
- Direction split: `"Northbound / Southbound"` and `"Plazas not split by direction"` (page.tsx:562-563)
- Emission factors note: `"Emission factors (CO₂ g/km): Class 1: … · Class 2: … · Class 3: …"` (page.tsx:617)
- Hourly limit: `"Hourly detail is available for ranges up to 2 weeks"` (page.tsx:918)
- Grain minimums: `"Needs at least two days|two weeks|two months of data — this range is N days"` (granularity.ts:48)
- Forecast horizon: `VALIDATED_HORIZON = 7`, shown as `"· validated at 7d"` and `"validated at 7 days"` (PredictiveEmissionChart.tsx:39, 1001; FleetMixForecastChart.tsx:42, 348)
- Volume comparison: `"volume validates at 14d, so the two are not directly comparable."` (PredictiveEmissionChart.tsx:752-753)
- Test method: `"Scored on {holdoutDays} held-out days at a {horizonDays}-day horizon"` (PredictiveEmissionChart.tsx:752)
- Split counts: `"{trainDays}d trained · {trainPct}%"`, `"{holdoutDays}d scored · {holdoutPct}% · fixed by evaluation"` (PredictiveEmissionChart.tsx:934-950)
- Accuracy vs baseline: MASE column title `"Below 1.0 beats it; above 1.0 does not."` (PredictiveEmissionChart.tsx:668)
- Weak-stretch title: `"above 1.0 means it loses to a seasonal-naive benchmark (copy the same weekday from last week)"` (PredictiveEmissionChart.tsx:1036)
- SKILL: `"SKILL is the ratio against a persistence baseline; below 1 means the model beats assuming the mix does not change."` (FleetMixForecastChart.tsx:439-440)
- Champion and ties: `"★"` / `"="` chips, `"accepted · rank #N"`, `"accepted · co-champion"`, `"rejected"`, `"no metrics"`, and the tie sentence `"…are within the run-to-run jitter of each other, so neither is the winner."` (PredictiveEmissionChart.tsx:614-616, 695-701, 758)
- Uncertainty, horizon: per-bucket `"Typical error: days a–b N% off"`, measured `"by rolling-origin over 9 origins"`; hatch `"⚠ days a-b"` (PredictiveEmissionChart.tsx:1046-1058, 390)
- Uncertainty, weak stretch: `"Days a–b are the least reliable — in that stretch you would do better just repeating last week"` (PredictiveEmissionChart.tsx:1039-1040)
- Beyond-horizon disclaimer: `"Only the first 7 days were checked against what actually happened. … Nothing is invented: the measured history stays exactly as recorded, and no actual value is ever filled in for a future date. But forecasts built on forecasts drift, so from here the line describes the usual shape for that time of year rather than any particular day."` (PredictiveEmissionChart.tsx:1025-1031)
- Averaging disclosure: `"Each point = {meanLabel} averaged, not totalled"` and `"Totals are never plotted: a sum would make a short {bucketNoun} look like a dip."` (PredictiveEmissionChart.tsx:815-827)
- Tooltip zone semantics: `"Future — no actual to compare"`, `"Holdout — scored against actual"`, `"Past — training context"` (PredictiveEmissionChart.tsx:411-413)
- Hourly unavailable: `"The CO₂ models forecast daily totals — there is no hourly prediction to drill into"` (PredictiveEmissionChart.tsx:845)
- History floor: `"All context back to 2022"` (PredictiveEmissionChart.tsx:899)
- Staleness: `"Data ends {date} — {n} days ago. This projection covers a period that has already passed; refresh the warehouse to forecast forward."` (>45 days) (FleetMixForecastChart.tsx:358-362)
- Fleet-mix headline window: `"Heavy share (C2+C3) · 30-day means"`; `"no material change"` below 1 pp (FleetMixForecastChart.tsx:40, 367, 377-379)
- Surge rule: `"A day is flagged when the projected Class 2+3 share runs more than 1.5 standard deviations above its training mean."` (FleetMixForecastChart.tsx:393)
- Fleet ranking method: `"Ranked by Aitchison distance, the standard metric for compositional data — MAPE divides by the actual value, so on a fleet that is ~79% Class 1 and ~9% Class 3 it scores the same absolute miss ten times harder on the rarest class."` (FleetMixForecastChart.tsx:437-439)
- Fleet protocol: `` `Protocol: ${champ.split_label}.` `` (FleetMixForecastChart.tsx:440)
- Fleet provenance: `"trained {date}"` and the train script path in the empty state (FleetMixForecastChart.tsx:189, 349)
- Data source text: `"Loading CO₂ forecast from AWS…"` and `"…the stored forecast itself is unaffected."` (PredictiveEmissionChart.tsx:533, 558)
- AI disclaimer: `"Written by the language model from the validation metrics shown on this card. Check any figure against the numbers above before acting on it."` (AiModelInsight.tsx:226)
- AI independence: `"…the figures above come from the warehouse, not from it."` (AiModelInsight.tsx:161)
- Prescriptive basis: `"Against {t} t actually emitted over {from} to {to}."` and `"Incident-based strategies use {n} cleared incidents in the same window."` (PrescriptiveEmissionsPanel.tsx:275, 282-283)
- Prescriptive period wording: `over()` gives `"a year"`, `"over these N months"` or `"over these N days"`. This replaced a hardcoded "a year" (PrescriptiveEmissionsPanel.tsx:60-66)
- Recommended action, lead: `"Do this — {label}. {lever}. Worth {t} t of CO₂ {period} (likely {lo}–{hi} t): {pct}% of what the corridor emitted. Bounded by response times this corridor has already delivered, so it asks for no capability it does not have."` (PrescriptiveEmissionsPanel.tsx:243-249)
- Recommended action, second: `"Then — {label} — {lever} — worth {t} t. Do not add these two together. This one applies the same clearance floor to fewer hours, so it is a subset of the first, not an addition to it."` (PrescriptiveEmissionsPanel.tsx:257-261)
- Recommended action, scenario: `"Not on this evidence — {label} would be worth {t} t — far the largest figure here — but it is a policy question for MPTC, not an operational one. {evidenceNote}"` (PrescriptiveEmissionsPanel.tsx:265-268)
- Policy-target label: `"Policy target — not demonstrated by any observed change."`; scenario bar drawn hollow (PrescriptiveEmissionsPanel.tsx:171, 182-189)
- Monte Carlo: `"Monte Carlo range (5th–95th of {runs} runs): {lo}–{hi} t"` (PrescriptiveEmissionsPanel.tsx:166)
- Strategy levers (API): `"every clearance band pulled to the fastest 10% already achieved in that band"`, `"same total capacity, concentrated on the 12 hours with the most vehicles exposed"` (service.ts:327, 344)
- Strategy lever, fleet (API): `"{deltaPp} pp of Class-3 vehicle-km moved to Class 2 (from {x}% in this Range) — a policy target, not an observed change"` (service.ts:358)
- Unavailable reason (API): `"No cleared incidents are recorded between {lo} and {hi}, and this strategy is computed from them."` (service.ts:380)
- Strategy rationale tooltip: `"…Faster clearance and peak deployment are bounded by response times this corridor has already achieved; the heavy-vehicle bar is a policy target and is drawn hollow to say so. Emissions here are linear in volume with no congestion term, so shifting trips between hours saves nothing and is deliberately not offered as a strategy."` (page.tsx:748)
- Not rendered today (risk): the CO₂ forecast caveat passed as `quantityNote` never reaches the screen. Text: `"CO₂ is not measured: it is derived from the same traffic series the volume forecast uses, times the per-class DENR/DOTC emission factors and each exit's corridor segment, so the two panels reconcile by construction. The factors themselves are unvalidated, so an error in them shifts every tonnage without changing any accuracy figure. Weather over the forecast window is day-of-year climatology in both scoring and projection, never observation."` (PredictiveEmissionChart.tsx:1083-1086)
- Model descriptions: the `HOW_IT_WORKS` strings (PredictiveEmissionChart.tsx:116-123) feed the narrative vocab but are not rendered directly.

### Visible prose likely to be shortened
- Page subtitle: "Vehicle emissions and air quality trends across NLEX" — page.tsx:722, 774
- KPI tooltip, Total CO₂: "Tonnes of CO₂ over the Range: the hourly toll counts at every exit × that exit's segment length × the DENR/DOTC factor for each vehicle class. Modeled, not a sensor reading — and the same record the CO₂ forecast is trained on, so the two agree." — page.tsx:818
- KPI tooltip, Avg Daily: "Modeled CO₂ divided by the number of days in the Range." — page.tsx:831
- KPI tooltip, Heavy-Vehicle Impact: "How much of the modeled CO₂ comes from trucks and buses versus their share of traffic — heavy classes emit far more per vehicle." — page.tsx:839
- KPI tooltip, Peak Emission Hour: "The hour of the day with the highest modeled CO₂, which follows the volume peak weighted by fleet mix." — page.tsx:847
- KPI tooltip, Delay-Induced CO₂: "Idling CO₂ from the queues behind accidents in the Range. Each queue builds while the incident is live and drains as it clears (area λ×T²/2 at that segment's vehicles per hour), so long incidents carry most of it. Moving vehicles' CO₂ does not change with speed in this model: this is the part a delay adds." — page.tsx:855
- KPI tooltip, Measured Air Quality: "Latest measured pollutant readings near the corridor, shown alongside the modeled CO₂ for context." — page.tsx:865
- Hero tooltip: "Modeled CO₂ per day, week or month, split by vehicle class so you can see which classes drive the total." — page.tsx:881
- When tooltip: "Modeled CO₂ by hour of day and day of week — when the corridor's emissions concentrate." — page.tsx:937
- Fleet Mix tooltip: "Each vehicle class's share of traffic next to its share of CO₂ — the gap shows which classes pollute out of proportion to their numbers." — page.tsx:955
- Heavy Share tooltip: "The fraction of modeled CO₂ attributable to heavy vehicles over the Range." — page.tsx:966
- AQI-by-month tooltip: "Monthly measured pollutant levels near the corridor, for comparison against the modeled emissions." — page.tsx:976
- Prescriptive card tooltip: "Computed from the warehouse over the selected Range. Faster clearance and peak deployment are bounded by response times this corridor has already achieved; the heavy-vehicle bar is a policy target and is drawn hollow to say so. Emissions here are linear in volume with no congestion term, so shifting trips between hours saves nothing and is deliberately not offered as a strategy." — page.tsx:748
- Prescriptive card intro: "CO₂ avoided per strategy, as a share of what the corridor actually emitted over the Range." — page.tsx:750
- Forecast tooltip: "Modeled daily CO₂ for the corridor: the model's past fit, its held-out test period, and the forecast ahead. Pick a model above." — PredictiveEmissionChart.tsx:528, 779
- Forecast subtitle, aggregated: "Every point is a {meanLabel} — the average of that {bucketNoun}'s days, not a total · Toggle models to overlay predictions" — PredictiveEmissionChart.tsx:784-785
- Forecast subtitle, daily: "Tonnes of CO₂ per day across the whole corridor · Toggle models to overlay predictions" — PredictiveEmissionChart.tsx:788
- Forecast error note: "Three attempts were made. This instance is shared, so a connection can be slow to establish while the training pipelines run — the stored forecast itself is unaffected." — PredictiveEmissionChart.tsx:532-533
- Beyond-horizon banner: "Only the first 7 days were checked against what actually happened. To predict a day, the model reads the days just before it — and past day 7 those days are themselves still in the future, so it reads its own earlier forecasts instead of measurements. Nothing is invented: the measured history stays exactly as recorded, and no actual value is ever filled in for a future date. But forecasts built on forecasts drift, so from here the line describes the usual shape for that time of year rather than any particular day." — PredictiveEmissionChart.tsx:1025-1031
- Metrics caption: "Scored on {N} held-out days at a {H}-day horizon · volume validates at 14d, so the two are not directly comparable." — PredictiveEmissionChart.tsx:752-753
- Narrative header line: "Generated from the stored validation metrics for the models currently selected · {N} scored days, {start} to {end}, forecasting {H} days ahead" — ModelNarrative.tsx:268-272
- AI footer: "Written by the language model from the validation metrics shown on this card. Check any figure against the numbers above before acting on it." — AiModelInsight.tsx:226
- Fleet-mix tooltip: "Share of corridor traffic by toll class, stacked to 100%. Solid is observed; the paler band past the dashed line is projected. Shares are a composition — a point gained by one class is lost by another — so they are modelled jointly rather than as three separate forecasts." — FleetMixForecastChart.tsx:343
- Fleet-mix leaderboard caption: "Ranked by Aitchison distance, the standard metric for compositional data — MAPE divides by the actual value, so on a fleet that is ~79% Class 1 and ~9% Class 3 it scores the same absolute miss ten times harder on the rarest class. SKILL is the ratio against a persistence baseline; below 1 means the model beats assuming the mix does not change. Protocol: {split_label}." — FleetMixForecastChart.tsx:437-440
- Surge banner: "Heavy-vehicle surge predicted on {n} days — {dates}. A day is flagged when the projected Class 2+3 share runs more than 1.5 standard deviations above its training mean." — FleetMixForecastChart.tsx:391-393
- Prescriptive recommendation lines ("Do this" / "Then" / "Not on this evidence"): quoted above — PrescriptiveEmissionsPanel.tsx:243-269
- Prescriptive basis note: "Against {t} t actually emitted over {from} to {to}. Incident-based strategies use {n} cleared incidents in the same window. {scenario} is drawn hollow because it is a policy target, not a demonstrated change. The other two are bounded by response times already delivered on this corridor, and their ranges come from a Monte Carlo resampling of the incidents." — PrescriptiveEmissionsPanel.tsx:275-292
- Takeaway subtitles (template prose): When `"Peak around … · quietest around … · heaviest day: …"` (page.tsx:300); Fleet `"Heavy vehicles (Class 2–3): …% of traffic → …% of CO₂"` (page.tsx:390); Heavy Share `"Now …% — rising|falling|steady across the range (from …%)"` (page.tsx:438)

### Keyboard / a11y hooks the code relies on
- InfoTooltip trigger: `tabIndex={0}`, `role="button"`, `aria-label={text}`; opens on focus or hover, closes on blur or leave. The popup is a body portal with `role="tooltip"` (InfoTooltip.tsx:47-106)
- CustomSelect: trigger has `aria-expanded`, `disabled` and `title`; closes on mousedown outside. No arrow-key navigation (CustomSelect.tsx:31-73)
- Detail modal: `role="dialog"`, `aria-modal="true"`, `aria-label`; Close button `aria-label="Close"`. No Esc and no focus trap (page.tsx:984-993)
- Model chips use `aria-pressed` (PredictiveEmissionChart.tsx:594)
- AiModelInsight uses `role="status"` while loading and `role="alert"` on error (AiModelInsight.tsx:170, 188)
- Skeletons are `aria-hidden="true"` (ChartSkeleton.tsx:21, 38)
- Day buttons outside the data range carry `aria-disabled` (DateRangePicker.tsx:207)
- Global classes relied on: `viz-emissions`, `ds-rise`, `chart-card wide`, `ds-narrative-cta`, `ds-narrative-btn`, `ds-narrative-loading`, `ds-narrative-spinner`, `ds-narrative-error`, `ds-page-header` (+`data-accent`)

---


Read-only source inventory, taken 2026-10-04 on branch `dashboard-redesign`. All paths are relative to `Front-End-Dashboard/` unless they start with `Back-End/`.

Abbreviations: **P** = `app/dashboard/map-comparison/page.tsx`, **TMP** = `components/maps/TrafficMapPanel.tsx`, **WLM** = `components/maps/WazeLiveModal.tsx`, **FEM** = `components/maps/ForecastExpandModal.tsx`, **FHP** = `components/maps/ForecastHorizonPicker.tsx`, **ML** = `components/maps/MapLegend.tsx`, **MP** = `lib/map-palette.ts`, **PQ** = `lib/predicted-queues.ts`, **CS** = `lib/corridor-shape.ts`, **CST** = `lib/corridor-status.ts`, **WR** = `lib/waze-reports.ts`, **WRL** = `lib/waze-report-look.tsx`, **NE** = `lib/nlex-exits.ts`, **M** = `app/dashboard/maintenance/page.tsx`.

---

## /dashboard/map-comparison — Live Map

**Source files rendered by this route:** P; TMP (mounted twice on the page, and once more inside each modal); WLM; FEM; FHP; ML; `components/dashboard/PageHeader.tsx`. Libraries used: MP, PQ, CS, CST (`corridorSegmentLevels`), WR, WRL, NE, `lib/cached-json.ts`, `lib/chart-theme.ts` (`useChartTheme`); data file `components/maps/nlex-geometry.json` (a LineString of 2,559 points).

**Files named in the brief that this route does NOT render:**
- `components/dashboard/RampKey.tsx`: used only by `app/dashboard/traffic/page.tsx:13,1070,1111`.
- `lib/nlex-toll-plazas.ts`, `lib/nlex-fuel-stations.ts`, `lib/nlex-lanes.ts`: used only by scenario-sandbox.
- `components/maps/nlex-ramps.json`: imported by nothing. TMP:788-791 records that "the 39 OSM ramp spurs" were removed from the map.

Field notes for those files are in §9.

The map library is **mapbox-gl**, not MapLibre (TMP:3-4).

### 1. Route / sidebar
- Sidebar entry: label "Live Map", href `/dashboard/map-comparison`, icon `Map`, group "Operations" (`app/dashboard/layout.tsx:51`).
- Audit-log label: "Live Map" (`app/dashboard/audit-log/page.tsx:82`).

### 2. Roles
- All three roles can open it: data-analyst, tcc-operator and incident-operator. It is not in `DENIED` (`lib/auth-access.ts:28-44`).
- Nothing inside the page depends on role.
- All fetches are plain `fetch` / `cachedJson` calls with no auth header.

### 3. Tabs / modes / panels
- **No tabs.** The page is a two-panel grid, `.map-grid.mc-map-grid` (P:257).
  - Left panel: "Waze Real-Time Traffic" (live).
  - Right panel: "Forecasted Traffic" (forecast).
- **Mode is chosen by endpoint string.** `endpoint.includes("real-time")` gives live; anything else gives forecast (TMP:314, 357, 418, 737).
- **Expanded live view:** `WazeLiveModal`. Open state is `wazeMax` (React state, P:35). The live panel gets `paused={wazeMax}` (P:280).
- **Expanded forecast view:** `ForecastExpandModal`. Open state is `forecastMax` (P:36).
- **Horizon state** lives in the page and is shared with the expanded view:
  - `horizon` defaults to 1 (P:44).
  - `horizonRange` defaults to `"12h"` (P:45).
  - Both are passed to FEM (P:434-443), so changing the hour in either place moves both.
- **Exit picker state:** `selectedExit` (P:69) and `exitOpen` (P:70), both React state only.
- **Report detail panel:** `selectedReport`, local state in each TMP (TMP:223). It only opens on the live instance (TMP:357-361).
- **Map status:** `status: "ok" | "no-token" | "error"` (TMP:219).
- Nothing is persisted to storage or the URL.

### 4. Checklist

**Header (PageHeader)**
- [ ] Icon `Map`, title "Live Map" (P:174-175)
- [ ] Subtitle "Live Waze conditions beside the model's forecast, NLEX corridor" (P:176)

**Exit picker (header actions)**
- [ ] `Milestone` icon plus toggle button with `aria-haspopup="listbox"` and `aria-expanded={exitOpen}`; text is `{selectedExit || "Jump to exit…"}` with a ChevronDown (P:179-194)
- [ ] Dropdown `<ul role="listbox">`, max height 320 px, scrolls (P:196-205)
- [ ] First row button "Whole corridor", which calls `resetView` and dispatches `nlex:resetview` (P:82-86, 206-218)
- [ ] Empty state "Exit list unavailable" (P:219-222)
- [ ] One `<li role="option" aria-selected>` per exit, showing `exit_id`, `displayExitName(exit_name)` and `Km {x.km}`; the selected row is bold (P:224-249)
- [ ] Picking an exit calls `flyToExit`, which dispatches `nlex:flyto` with `{lng, lat, name}` to both maps (P:72-80)
- [ ] Exits come from `useNlexExits()` in geographic order, Balintawak to Sta. Ines (P:64-68)
- [ ] The list has no outside-click close and no Esc close; only the button toggles it (as built)

**Live panel (left), TMP props**
- [ ] title "Waze Real-Time Traffic", subtitle "Live traffic conditions" (P:261-262)
- [ ] Badge: green dot `.mc-dot.green` plus `LIVE | {timeStr || "Loading..."}`. The clock is en-US `h:mm:ss AM`, ticking every 1 s (P:89-103, 265-266)
- [ ] Button "Expand" (`Maximize2` icon, class `mc-maximise`); opens WazeLiveModal (P:267-274)
- [ ] `layerColor="#4a6ff2"`, `tone="blue"` (header class `map-head blue`) (P:278-279)
- [ ] Legend `<details class="mc-legend-card waze-legend">` with `<summary>Legend</summary>` and `<MapLegend />`; collapsed by default (P:288-291)

**Live footer stats**
- [ ] "Toll Plazas" = `20`, hardcoded (P:297-298)
- [ ] "Active Reports" = `activeReports ?? "—"` (P:301-302)
- [ ] "Avg Speed" = `${avgSpeed} km/h` or "—" (P:305-306)

**Forecast panel (right), TMP props**
- [ ] title "Forecasted Traffic", subtitle "Predictive analysis" (P:314-315)
- [ ] Badge "PREDICTED" plus button "Expand" (`Maximize2`); opens FEM (P:318-326)
- [ ] `endpoint=/api/map-comparison/forecast?hours=${horizon}`, `layerColor="#a855f7"`, `tone="purple"` (P:329-331)
- [ ] Controls overlay `.mc-forecast-controls` (P:334) holding the ForecastHorizonPicker, non-compact (P:335-341)
- [ ] Model card heading: Clock icon plus "Forecast model" (P:344-346)
- [ ] Model name with `<em>{N}% accurate</em>` (P:349-354)
- [ ] `Trained {D Mon YYYY}`, or "Training date unknown" when missing (P:356-358)
- [ ] ` · beat {rejectedCount} others`, shown only when the count is above 0 (P:359)
- [ ] `Varies across {horizons} h ahead`, or "Same outlook for every hour ahead" (P:363-367)
- [ ] Fallback "Model details unavailable" (P:370)
- [ ] Icon buttons `.mc-icon-btn`: `Navigation`, `ZoomIn`, `ZoomOut` in `.mc-zoom-group`. **No onClick and no aria-label: inert** (P:373-377)
- [ ] Legend `<details class="mc-legend-card forecast-legend">`, `<summary>Legend</summary>` (P:381-382)
  - [ ] Sub-label "Predicted congestion", then FORECAST_KEY rows Clear/Slow/Congested with swatches taken from `mapPalette(isDark).status` (P:384-395)
  - [ ] Sub-label "On the map": `.mc-legend-pin` plus "NLEX exit" (P:398-401)

**Forecast footer stats**
- [ ] "NLEX Exits" = `20`, hardcoded (P:410-411)
- [ ] "ML Confidence" = `${round(accuracy*100)}%` or "—" (P:414-419)
- [ ] "Forecast Window" = `+${horizon} h` (P:422-423)

**Map controls (each TMP instance)**
- [ ] `NavigationControl({ showCompass: false })` at top-right, which gives Mapbox's own zoom in/out buttons (TMP:329)
- [ ] Initial view `center [120.79, 14.94]`, `zoom 9.2`, `minZoom 9.0`, `maxBounds [[120.4,14.5],[121.2,15.3]]`, `pitch 0`, `bearing 0` (TMP:285-294)
- [ ] `attributionControl: false`: no attribution text is rendered. The Mapbox logo is not disabled in code (TMP:295)
- [ ] No style switcher and no layer toggles. The basemap follows the app theme: the map rebuilds when `isDark` changes (TMP:240, 2441)
- [ ] `nlex:flyto` flies to `zoom 12.5` over 900 ms (TMP:333-337)
- [ ] `nlex:resetview` flies back to the opening view over 900 ms (TMP:339-341)
- [ ] `nlex:showreport` flies to `zoom 13` over 900 ms. The camera moves on both panels; the detail panel opens on live only (TMP:357-365)
- [ ] Clicking an alert marker flies to `zoom max(current, 12)` over 600 ms (TMP:2344)
- [ ] `ResizeObserver` calls `map.resize()` (TMP:391-394)
- [ ] On `style.load`, every base layer whose id includes road/bridge/tunnel, or whose `source-layer` is `road`, is hidden (TMP:375-389)

**Basemap**
- [ ] Light style: `mapbox://styles/mapbox/light-v11` (MP:22)
- [ ] Dark style: `mapbox://styles/mapbox/dark-v11` (MP:21)
- [ ] Token from `NEXT_PUBLIC_MAPBOX_TOKEN`; it must start with `pk.` (TMP:234-238)
- [ ] Attribution: none rendered (see controls)

**Map sources** (added in `map.on("load")`, TMP:733+)
- [ ] `"traffic"`: GeoJSON of the endpoint payload after `withPredictedQueues` and `onlyOnCorridor` (TMP:735, 739-742). It holds feature types `jam`, `jam_mark`, `jam_tail` (forecast only), `alert` (live), `forecast`, and `carriageway` (live; undrawn)
- [ ] `"nlex-corridor"`: 19 segments × NB/SB = 38 ribbons on the real alignment, built client-side and coloured by `corridorWithState` (TMP:610-630, 766-769)

**Map layers, in add order** (ids that code relies on)
- [ ] `base-scrim`: background wash; `PALETTE.scrim` at `scrimOpacity` (TMP:775-782)
- [ ] `nlex-halo`: line on nlex-corridor; soft blurred tint under the corridor (TMP:792-803)
- [ ] `nlex-casing`: line; white (light) or near-black (dark) roadway casing, offset per direction (TMP:805-816)
- [ ] `carriageway`: line; the per-direction ribbon. Live: flat `status.clear`. Forecast: `match` on `level` (TMP:818-872)
- [ ] `carriageway-flow-{nb|sb}-{fast|mid|slow}`: line-pattern pulse. Live gets the `fast` tier only and filters by direction only. Forecast filters by direction and `level in tier.levels` (TMP:991-1031)
- [ ] `jam-tail`: line on traffic, `feature_type == "jam_tail"`, dashed `[1.2, 1]`, opacity 0.55. The predicted p75 "may extend to" stretch; forecast only (TMP:1059-1077)
- [ ] `jam-casing`: line; casing under each snapped queue (`feature_type == jam` and has `direction_source`) (TMP:1079-1095)
- [ ] `jam-extent`: line; each queue over its real length, coloured by level (TMP:1097-1127)
- [ ] `jam-mark-nb` and `jam-mark-sb`: circles at each queue head (`feature_type == jam_mark`), white ring, translated onto their carriageway, faded out by z13.2 (TMP:1175-1207)
- [ ] `jam-flow-{nb|sb}-queue-slow` (levels 1-2, 2600 ms) and `jam-flow-{nb|sb}-queue-heavy` (levels 3-4, 6000 ms): queue pulse inserted before `jam-mark-nb`. Level 5 gets no flow on purpose (TMP:1218-1258)
- [ ] `carriageway-arrows`: symbol layer, chevron `"❯"` (❯) placed along the line; NB rotated -90, SB +90; `PALETTE.arrow` at opacity 0.85 (TMP:1263-1287)

**Animated style images** (`map.addImage` with `render()`)
- [ ] `flow-{nb|sb}-{fast|mid|slow}`: 32×8 px pulse. Cycles: fast 1100 ms at 0.55, mid 2600 ms at 0.5, slow 6000 ms at 0.45. Tier levels: fast [0,1], mid [2,3], slow [4,5] (TMP:897-901)
- [ ] `flow-{nb|sb}-queue-slow` and `flow-{nb|sb}-queue-heavy` (TMP:1223-1235)
- [ ] NB scrolls `sign -1`, SB `+1` (TMP:963)
- [ ] Throttled to 30 fps (writes skipped under 33 ms) (TMP:982)
- [ ] `render()` returns false while paused (TMP:975)
- [ ] Un-pausing nudges `triggerRepaint` (TMP:211-216)

**Markers (HTML `mapboxgl.Marker`)**
- [ ] Toll plaza pins: 20, on BOTH maps (TMP:1531-1826)
  - DOM: `.custom-toll-marker > .toll-pin > .toll-pin-dot` (building SVG) plus `span.toll-pin-name` (`displayExitName(shortName)`), z-index 6
  - Declutter writes `data-tier` (far/mid/near), `data-side` (east/west), `--lead` px, `data-ring` (on/off) and `data-queue` (slow/congested); globals.css:9783-9888 styles those attributes (TMP:1997-2191)
  - Re-run on `zoom` and `move` (TMP:2195-2196)
- [ ] Waze alert markers: live only (TMP:2204-2352)
  - DOM: `.waze-alert-marker` (plus `.unconfirmed`), 28×28 px, z-index 5, containing `.pulsing-marker-container > .pulsing-marker-glow.{type} + .pulsing-marker-core.{type}`
  - Core is a 20 px circle in the type colour, with a 2 px white border that is dashed when unconfirmed, and the type's SVG icon
  - `anchor:"center"`
  - JAM-type alerts are skipped (TMP:2215)

**Popups** (`mapboxgl.Popup`: `closeButton:false`, `closeOnClick:false`, `offset:18`, class `mjp-pop`; anchor left or right depending on which half of the screen the point is on, TMP:1317-1335)
- [ ] **Live queue hover card** (TMP:1472-1487), opened from jam-extent, jam-mark-nb, jam-mark-sb or jam-tail (TMP:1495-1498)
  - Head: `LEVEL_WORD` (0 Clear, 1-2 Slow, 3-4 Congested, 5 Standstill, else "Reported"), with `{direction} · km {round(rel_km)}`
  - Where line: `startsLine`
  - Rows, each omitted when Waze did not send the field: "Queue length", "Est. delay", "Speed" `{n} km/h`, "Going on for"
- [ ] **Predicted queue hover card** (TMP:1432-1470)
  - Head: `Predicted · {Congested|Slow}` with `km {n}`
  - Where line: startsLine, or nearest_exit, or "NLEX"
  - Rows: "Chance of a jam" `{n}%` (`>95` / `<5`), "Queue length" `~{len}`, "May extend to" `~{p75}`, "Est. delay" `~{mins}`, "Speed" `~{n} km/h`, "Typical traffic" `~{veh/h rounded to 10} veh/h · {vol_rel.toFixed(1)}×`
  - Warning in amber, shown when `vol_rel < 0.7`
  - Basis line plus side-share line (verbatim in §7)
- [ ] **Plaza hover card** (TMP:1761-1819)
  - Head (class `is-exit`): `displayExitName(name)` with `km {round(km)}`, or the plaza type when no km is known
  - Where line: location
  - Rows: "Access" (`{x}, both ways` | `NB {x} · SB {y}` | `NB {x}` | `SB {y}`) and "Toll" (`Open system` / `Closed system`)
  - `p.mjp-note` description, shown only when it adds words the name and location do not already say
- [ ] Queue card closes the plaza card, so the queue wins (TMP:1426)
- [ ] **Report hover summary**, live only (TMP:2292-2303, 2317-2318): `.nlex-pop` with `--pop-accent`, icon, `look.label`, the sub line `{Northbound|Southbound} · {N m|X.X km} from {exit}` (or `near {exit}`, the street, or "On the corridor"), and foot "Click for the full report"

**Report detail panel** (React, inside the map container; live only)
- [ ] `div.wz-report-detail` with `role="dialog"` and `aria-label="Waze report detail"` (TMP:2491-2492)
- [ ] Type in upper case with `_` replaced by spaces, plus subtype in lower case (TMP:2495-2498)
- [ ] Close button `aria-label="Close report detail"` (TMP:2500)
- [ ] Where line: `{street ?? "NLEX"} · {city}` (TMP:2507-2510)
- [ ] `Reported {sinceLabel}` plus the local timestamp (TMP:2512-2517)
- [ ] "First report" with a timestamp and either `{n} reports here since then` or "no earlier report on record here" (TMP:2534-2552)
- [ ] Grid rows, each shown only when present (TMP:2554-2653):
  - [ ] "Reliability" `{n}/10`
  - [ ] "Confidence" `{n}/10`
  - [ ] "Rating" `{n}/5`
  - [ ] "Nearest exit", worded at / past / before / midway, or the fallback `{exit} {N m away|X.X km away}`
  - [ ] "Direction": Northbound/Southbound plus " from road name" or " from heading"
  - [ ] "Heading" (e.g. `NNE (23°)`)
  - [ ] "Road type" (ROAD_TYPE_LABEL TMP:61-64, else `Type {n}`)
  - [ ] "Source": "Municipality account" or "Waze driver"
  - [ ] "Coordinates" (`lat.toFixed(5), lon.toFixed(5)`)
- [ ] `Waze ID {uuid}` (TMP:2655)
- [ ] Opened by clicking a marker (TMP:2319-2345) or by the `nlex:showreport` event from the WLM alert list (TMP:358-365)

**Panel chrome and fallback states (TMP)**
- [ ] `article.map-card` (plus `.chromeless`). Header `header.map-head.{tone}` with h3 title, p subtitle and the badge span, hidden when chromeless (TMP:2444-2455)
- [ ] Map container `div.map-canvas.mapbox` (TMP:2457)
- [ ] no-token state: "Map unavailable", followed by body text (§8) (TMP:2464-2473)
- [ ] error state (401/403 or init failure): "Map token rejected", followed by body text (§8) (TMP:2474-2482)

**Legends (ML)**
- [ ] Live variant (WLM and the live panel) (ML:57-84):
  - h4 "Traffic", rows Clear/Slow/Congested with `palette.status` swatches
  - h4 "Waze reports", rows for the five WAZE_REPORT_TYPES with chips: "Accident", "Hazard on road", "Road construction", "Road closed", "Police activity"
- [ ] Forecast variant (FEM) (ML:40-55):
  - h4 "Predicted congestion": Clear/Slow/Congested
  - h4 "On the map": `.mc-legend-pin` plus "NLEX exit"

**Horizon picker (FHP), used in the panel and in FEM (compact)**
- [ ] Heading: Clock icon plus "Forecast time", hidden when compact (FHP:167-171)
- [ ] Range group `role="group"` `aria-label="Forecast range"` (FHP:173), with buttons "Next 12 h", "Next 24 h", "Next 7 days" (FHP:21-25)
  - [ ] Each has `aria-pressed`
  - [ ] Each is disabled when `maxHorizon < hours`
  - [ ] Title when enabled: `Pick any hour within {label lower}` (FHP:174-196)
  - [ ] Title when disabled: see §7
- [ ] Clicking a range calls `setRange(key)` and `setHorizon(min(horizon, hours))` (FHP:189-192)
- [ ] Native `<select>` with sr-only label "Forecast hour" (FHP:200-202)
  - Hourly mode: one `<optgroup label={day}>` per day ("Today" / "Tomorrow" / `{weekday long, Mon D}`), each option `{h:mm AM}  ·  +{h} h` (FHP:220-228)
  - 7-day peaks mode: options `{day}  ·  {time}  ·  {N congested | clear}` (FHP:203-219)
- [ ] Day hint `.mc-horizon-when` = `dayOf(chosen)`, shown when not compact and not in peaks mode (FHP:236)
- [ ] Options come from `horizonOptionsFor(range, maxHorizon)`: steps of 1 / 2 / 6 h, clamped to maxHorizon, and always ending on the reach (FHP:60-69)
- [ ] If the chosen hour is no longer offered, it falls back to `offered[0]` (FHP:159-161)
- [ ] Peaks are fetched only while range is `7d`; on failure the picker falls back to the hourly list (FHP:109-126)

**WazeLiveModal (expanded live view)**
- [ ] Backdrop `.wz-backdrop` with `role="dialog"`, `aria-modal="true"`, `aria-label="Waze real-time traffic"`. Clicking the backdrop closes it (WLM:190-191)
- [ ] Radio icon, h2 "Waze Real-Time Traffic", p "Live traffic conditions" (WLM:194-197)
- [ ] Pill `.wz-live` (plus `.stale`): `{STALE|LIVE}` with `<b>{clock}</b>`; en-US `hh:mm:ss`, 1 s tick (WLM:169-173, 201-203)
- [ ] Button "Refresh" (`RefreshCw`, spins while loading, disabled while loading) (WLM:204-206)
- [ ] Close button `aria-label="Close"` (WLM:207)
- [ ] Chromeless TMP on `/real-time` with `.wz-legend > <MapLegend/>` (WLM:215-228)
- [ ] Aside h3 "Corridor Overview" (WLM:232)
- [ ] Error text: §7 (WLM:235)
- [ ] KPI "Avg speed in jams" `{avg ?? "—"}` with em "km/h" and a Gauge icon (WLM:239-242)
- [ ] KPI "Active reports" = count of corridor alerts after the 200 m and not-disputed filters (WLM:243-250)
- [ ] KPI "Current delay": `{h}h {m}m` or `{m}m` or "—" (WLM:251-257)
- [ ] h4 "Traffic density" with a density bar and a marker at `100 - avg/50*100` % (WLM:187, 260-264)
- [ ] Note: `{jamCount} jams across {exits.length} exits · worst is {band}`, or "No jams reported on the corridor" (WLM:265-269). Bands: ≥40 Light, ≥25 Moderate, ≥12 Heavy, else Severe (WLM:129-134)
- [ ] h4 `Current alerts ({n})` (WLM:275-277)
- [ ] Alert rows (WLM:279-328):
  - Button `.wz-alert-row`, disabled when there is no position
  - Title "Show this report on the map" / "Waze gave no position for this report"
  - Chip (tone, plus `.unconfirmed`), `<b>{label}</b>`, `<em>{whereText}</em>`, age
  - Click dispatches `nlex:showreport` with the full record
- [ ] Empty row "No alerts on the corridor right now" (WLM:329)
- [ ] "Slowest stretch" card: TrendingUp icon, exit name, `Avg speed {n} km/h · {n} jam(s)` (WLM:332-338)
- [ ] Footer `Jams {ago} · alerts {ago} · {windowMinutes}-min window` (WLM:340-344). Age wording from `agoText`: "—", "Just now", `{m} min ago`, `{h}h {m}m ago` (WLM:112)
- [ ] Esc closes (window keydown) (WLM:174)

**ForecastExpandModal (expanded forecast view)**
- [ ] Backdrop with `role="dialog"`, `aria-modal`, `aria-label="Forecasted traffic"`. Clicking the backdrop closes it (FEM:107-114)
- [ ] Badge "Predicted", h2 "Forecasted Traffic" (FEM:117-119)
- [ ] Subtitle `+{h} h · around {clockFor(h)}` + ` · {model.name}` + ` · {N}% accurate` (FEM:120-124)
- [ ] Compact horizon picker (FEM:128-135)
- [ ] Close button `aria-label="Close"` (FEM:136)
- [ ] Chromeless TMP on the same forecast endpoint, with `<MapLegend variant="forecast"/>` (FEM:144-155)
- [ ] Aside h3 `Corridor at {clockFor(h)}` plus a spinner while loading (FEM:159-162)
- [ ] Error / empty text: §7 (FEM:164-171)
- [ ] Tally: for High/Med/Low, `<b>{count}</b>` with the label Congested/Slow/Clear (FEM:174-181)
- [ ] Segment list, ranked High, Med, Low and then by probability descending (FEM:96-100, 186-197). Each row shows `fc-dot`, `segment_id` (with `title={corridor_segment}`), the state label and `{round(probability*100)}%`
- [ ] Esc closes (document keydown) (FEM:85-92)

**Colouring rules (quoted)**
- [ ] Three status colours (MP:75-77):
  ```
  status: isDark
    ? { clear: "#34d17f", slow: "#ffb21e", congested: "#ff5c5c" }
    : { clear: "#13834a", slow: "#a65f00", congested: "#c42a2a" },
  ```
- [ ] No data (MP:34): `noData: isDark ? "#5d6f96" : "#b9c5da",`
- [ ] Forecast ribbon (TMP:844-867):
  ```
  "line-color": isRealtimeEndpoint
    ? PALETTE.status.clear
    : [ "match", ["get", "level"],
        0, PALETTE.status.clear,
        [1, 2], PALETTE.status.slow,
        [3, 4, 5], PALETTE.status.congested,
        PALETTE.noData ],
  ```
- [ ] Queues (`jam-extent`, TMP:1112-1118) and marks (TMP:1167-1173) use the same match: 0 clear, 1-2 slow, 3-5 congested, else noData.
- [ ] `jam-tail` (TMP:1066-1071): 1-2 slow, 3-5 congested, else noData.
- [ ] Forecast state to level (TMP:658-664 and PQ:32): `Low: 0, Med: 2, Medium: 2, High: 4, Severe: 5`.
- [ ] Silence means different things per source (TMP:721): `const unreported = isRealtimeEndpoint ? 0 : NO_READING;` with `NO_READING = -1` (TMP:606). Live silence is green; forecast silence is grey.
- [ ] A forecast segment with a typical queue is drawn green, with the queue drawn over it (TMP:707): `const lvl = q.jam_queue_m != null ? 0 : FORECAST_LEVEL[shownForecastState(q)] ?? 0;`
- [ ] **NB/SB separately.** One centreline, offset in pixels (TMP:254-256): `const side = (px: number) => ["case", ["==", ["get", "direction"], "NB"], px, -px];`. OFFSET stops are `9→7 px, 15→7 px, 18→24 px`, exponential 2 (TMP:257-278).
- [ ] Forecast segments colour both directions the same (`bySegment.set(order+":NB")` and `":SB"`, TMP:708-709). Live segment levels are kept per direction via `corridorSegmentLevels` (CST:181-215).
- [ ] Predicted queues are drawn only on the side(s) carrying at least 40% of the exit's jam-hours (`SIDE_CUT = 0.4`, PQ:35; `sidesToDraw`, PQ:62-68).
- [ ] **50% shown-state rule** (PQ:44-50):
  ```
  export function shownForecastState(p: Record<string, unknown>): string {
    const pm = p.p_med == null ? null : Number(p.p_med);
    const ph = p.p_high == null ? null : Number(p.p_high);
    if (pm == null || ph == null) return String(p.congestion_state ?? "");
    if (pm + ph < 0.5) return "Low";
    return ph >= pm ? "High" : "Med";
  }
  ```
  - Used at TMP:707, and at PQ:114-115 (only Med/High become predicted queues).
  - Backend mirror at `Back-End/src/services/map-comparison.service.ts:282-285`: `r.p_med + r.p_high >= 0.5 ? (r.p_high >= r.p_med ? "High" : "Med") : "Low"`.
  - Peaks count with the same 0.5 rule (same file:351).
- [ ] Exit-plate colour (TMP:2187-2189): `data-queue` is `congested` for level ≥3 and `slow` for ≥1. It is set when a queue lies within `EXIT_QUEUE_M = 450` m of the exit on the ground (TMP:1995, 2028-2043).
- [ ] Draw order is worst on top: features are sorted by level, then longer first (TMP:587-601).

**Animation and dev handles**
- [ ] Flow uses animated StyleImages, not `requestAnimationFrame`. `flowFrameRef` is only cancelled in cleanup and never started (TMP:207, 2419-2422).
- [ ] `line-dasharray` is static, on `jam-tail` only (TMP:1074). Animated dasharray was abandoned; see TMP:877-891.
- [ ] Alert marker classes `pulsing-marker-*`. CSS dims unconfirmed reports (globals.css:6366-6368).
- [ ] No `prefers-reduced-motion` handling in the map code.
- [ ] Dev handle in non-production builds: `window.__nlexMaps.live` / `window.__nlexMaps.forecast` = map instance (TMP:311-316).
- [ ] Window events the page relies on: `nlex:flyto`, `nlex:resetview`, `nlex:showreport` (TMP:367-369). Theme follows `smartflow:themechange` and the OS colour scheme (`lib/chart-theme.ts:71-73`).

**Feed filtering rules (visible effects)**
- [ ] Only jams and alerts on the corridor survive: every vertex must be within `CORRIDOR_TOLERANCE_M = 200` m (CS:365, 539), and jams must pass `isNlexStreet` (CS:631).
- [ ] Alert types: ACCIDENT, HAZARD, CONSTRUCTION, ROAD_CLOSED, POLICE (WR:27-33). Disputed reports are dropped (reliability <5 or confidence ≤-1, WR:71-76). Unconfirmed reports (reliability ≤5 and confidence ≤0) get a dashed or faint style (WR:83-88).
- [ ] Jam snapping, with direction from the street name first and bearing as fallback (CS:572-597). Unresolved jams have no `direction_source` and are not drawn.
- [ ] The page's Active Reports and Avg Speed run the same corridor guard (P:27-30, 127, 137-155).

**Keyboard**
- [ ] Esc closes WLM (WLM:174) and FEM (FEM:87-91).
- [ ] No Esc handling for the exit dropdown or the report detail panel.
- [ ] The horizon picker is a native select; range buttons are native buttons.

### 5. API endpoints
- `GET {BACKEND}/api/map-comparison/real-time`
  - Page stats: `cachedJson` with 25 s TTL, polled every 15 s (P:118, 167).
  - Each live TMP: `fetch(endpoint, {cache:"no-store"})` on load, then every 15000 ms (TMP:734, 2378-2407). Data is only re-set when the signature changes (TMP:751-757).
  - Server: route cache 30 s and warmer 25 s (`Back-End/src/middleware/route-cache.ts:57,66`; `server.ts:55`).
- `GET {BACKEND}/api/map-comparison/forecast?hours={horizon}`
  - Forecast TMP: load, then every 15 s. The map rebuilds whenever `endpoint` changes (TMP:2441).
  - FEM: fetched on open and on horizon change, not polled (FEM:61-83).
  - Page model info: `cachedJson .../forecast?hours=1` with 10 min TTL, reading `j.model` (P:107-108).
  - Server TTL 60 s. `hours` must be an integer from 1 to 336 (controller:20-24).
- `GET {BACKEND}/api/map-comparison/forecast/peaks`: FHP, only when range is `7d`, no-store (FHP:112).
- `GET {BACKEND}/api/map-comparison/live-overview`: WLM, no-store, every 30 s while open only (WLM:148, 162-167).
- `GET {BACKEND}/api/map-comparison/exits`: `useNlexExits` (NE:111). Fetched once per page load and memoised at module scope; falls back to FALLBACK_EXITS.
- Mapbox style and tiles via the `mapbox://` style URLs (MP:20-22).

### 6. localStorage / sessionStorage
- None in P, TMP, WLM, FEM, FHP, ML or the libs used. Theme comes from the `data-theme` attribute and matchMedia, not from storage.
- `cachedJson` is an in-memory Map at module scope (`lib/cached-json.ts:15-16`).

### 7. "Never cut" facts (verbatim)
- Hardcoded counts: "Toll Plazas" `20` (P:298), "NLEX Exits" `20` (P:411).
- "ML Confidence" shows `forecastModel.accuracy`, which is R² from `gold.ml_model_metrics.r2` for the accepted Congestion model (backend service:161-191), as `{N}%` (P:416-418).
- The same number appears as `{N}% accurate` (P:352; FEM:123).
- `Trained {date}`; `· beat {rejectedCount} others`, where rejectedCount = number of non-accepted Congestion models (service:163-164).
- `Varies across {horizons} h ahead` / "Same outlook for every hour ahead" (P:364-366).
- "Forecast Window" `+{h} h` (P:423); `+{h} h · around {clockFor(h)}` (FEM:121).
- `clockFor` rounds down to the hour, because the model forecasts an hour bucket (FHP:29-37).
- Ranges: "Next 12 h" step 1, "Next 24 h" step 2, "Next 7 days" = 168 h in 6 h steps, or one peak per day (FHP:21-25).
- Disabled-range title: `` `The forecast currently reaches +${reach} h. Run the congestion pipeline further ahead to use this.` `` (FHP:187). With `maxHorizon` null, reach is 0 and all three ranges are disabled (FHP:175-176).
- Peak option: `` `${dayOf(t)}  ·  ${timeOf(t)}  ·  ${p.congested > 0 ? `${p.congested} congested` : "clear"}` `` (FHP:211-216).
- Predicted chance is never shown as 100%: `pc >= 0.95 ? ">95" : pc <= 0.05 ? "<5"` (TMP:1436). Comment: "the cells the model put at 100% jammed 86% of the time" (TMP:1433-1434).
- Basis strings (TMP:1438-1440):
  - "Typical for this exit at this hour, from Waze jams 2022–2026"
  - "Typical for this exit at any hour, from Waze jams 2022–2026"
  - "Corridor-wide typical; this exit has too little history of its own"
- Side text (TMP:1463-1465): `` `${Math.round(side_share*100)}% of jams here at this time of day are on this side${dir_jam_hours != null ? ` (${dir_jam_hours} live jam-hours)` : ""}; the other side is drawn only if it carries 40% or more.` `` or "No live jams here yet to say which side, so both are drawn."
- Quiet-hour warning: "A jam in a quiet hour is usually an incident or roadworks." (when `vol_rel < 0.7`) (TMP:1457-1458).
- "Typical traffic" `` `~${Math.round(vol_median / 10) * 10} veh/h · ${vol_rel.toFixed(1)}×` `` (TMP:1455).
- Queue start wording (TMP:1392-1402):
  - `Starts at {X Toll Plaza}`
  - `Starts {d} past {X Toll Plaza}`
  - `Starts {d} before {X Toll Plaza}`
  - `Starts midway between {A} and {B}`
  - Fallbacks: `Starts near {X}` / `Starts at {X}` (under 100 m) / `Starts {d} from {X}`
- Thresholds: "at" means under 80 m (TMP:169); "midway" means 0.33-0.67 of the span (TMP:177).
- `plazaLabel` appends " Toll Plaza" (NE:186-190).
- Distance format: `` m >= 1000 ? `${(m/1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m` `` (TMP:1353-1354).
- Duration format: "under a minute" / `{m} min` / `{h} h {m} min` (TMP:1355-1361).
- Report detail: "Reliability" /10, "Confidence" /10, "Rating" /5 (TMP:2556-2566).
- "First report" with `${n} reports here since then` / "no earlier report on record here" (TMP:2541-2547). It is a fact about the place, unwindowed, within 150 m (backend map-live.service:448-469).
- `Reported {Just now | N min ago | Hh Mm ago | Nd Nh ago}` (TMP:188-195).
- "Source": "Municipality account" / "Waze driver" (TMP:2644). "Direction": " from road name" / " from heading" (TMP:2626).
- Live feed window is 60 min (`WINDOW_MINUTES = 60`, map-live.service:18), shown as `{windowMinutes}-min window` (WLM:343).
- STALE when the newest jam is more than 30 min old (map-live.service:274) (WLM:202).
- Avg Speed is the mean speed of on-corridor jams with speed above 0. It shows "—" when there are none (no invented 45 km/h) (P:146-155).
- WLM data notes: "Avg speed in jams" is speed within jams, not corridor speed (map-live.service:221-224). There is no travel time on purpose (WLM:44-46).
- Density strip scale: 0-50 km/h (WLM:187).
- WLM error: "Live feed unavailable — is the backend running on port 4000?" (WLM:235).
- WLM empty: "No jams reported on the corridor" (WLM:268); "No alerts on the corridor right now" (WLM:329).
- FEM error: "Forecast unavailable — is the backend running on port 4000?" (FEM:166).
- FEM empty: `Nothing forecast at +{horizon} h. The pipeline has not written this far ahead yet.` (FEM:170).
- Forecast covers 7 of 19 segments; grey means not forecast (TMP:714-720).
- Km posts run from Balintawak km 12 to Sta. Ines km 88.25 (NE:77-97); the corridor is 76.25 km long.
- Plaza descriptions that carry real information (TMP:1538-1709):
  - "Southern terminus of NLEX."
  - "Exit for Marilao, Bulacan. End of open toll system."
  - "Main toll barrier. Transition from open to closed system."
  - "Connects to SCTEX. Major junction for Clark & Subic."
  - "Northern terminus of NLEX."
  - Rates: "Open system toll" for the first seven, "Closed system toll" from Bocaue Interchange north.
- Access labels: "Entry & Exit" / "Entry Only" / "Exit Only" / "No Access". Toll barrier gives null (NE:37-45).

### 8. Visible prose likely to be shortened (verbatim)
- TMP:2467-2471: "No Mapbox token is set. Put your token (it starts with `pk.`) in `NEXT_PUBLIC_MAPBOX_TOKEN` inside `Front-End-Dashboard/.env.local`, then restart the dev server. The committed `.env` ships a placeholder, which does not count as a token."
- TMP:2478-2480: "Mapbox refused the token. It may be revoked, from another account, or restricted to URLs that do not include this one. Check the browser console for the exact error."
- TMP:1460-1466: predicted-card basis plus side-share paragraph (§7).
- TMP:2301: "Click for the full report".
- P:364-366: "Same outlook for every hour ahead" / `Varies across {n} h ahead`.
- P:370: "Model details unavailable"; P:358: "Training date unknown".
- FHP:186-187: range button titles (§7).
- FEM:170: `Nothing forecast at +{horizon} h. The pipeline has not written this far ahead yet.`
- WLM:267: `${data.jamCount} jams across ${data.exits.length} exits · worst is ${band(...).label.toLowerCase()}`.
- WLM:293: "Show this report on the map" / "Waze gave no position for this report".
- WLM:341-343: `Jams {ago} · alerts {ago} · {n}-min window`.

### 9. Data already in memory for new read-only map graphics
- **Per-segment current speed:**
  - The `nlex-corridor` ribbons carry only `level` (TMP:610-630, 723-729). There is **no per-segment speed** on them.
  - Per-jam speed is `properties.speed` (km/h, Waze `speed_kmh`) on `traffic` jam features (TMP:1416; backend map-live.service:500).
  - Backend `feature_type:"carriageway"` features also arrive in the live payload, inside the `traffic` source but undrawn. They carry `segment_order`, `segment_name`, `direction`, `level`, `speed` (MIN jam speed, or null) and `jams` (map-live.service:637-647). **Caveat:** TMP:678-692 documents that these use off-corridor jams and bearing-based direction, so they disagree with the drawn jams.
  - Other speeds in memory:
    - Page `avgSpeed` (P:61).
    - WLM `data.speed.avgInJamsKmh` / `slowestKmh`, `data.exits[].avgSpeedKmh` (per exit, no direction), and `data.timeline[]` `{at, avgSpeedKmh, jams}`, which is fetched but not rendered (WLM:53-71).
    - `corridorStatusFromFeed()` gives `speedKmh` (slowest) per exit and direction (CST:95-166); not used on this route.
  - Current flow speed comes from the level tiers `FLOW_TIERS` (TMP:897-901), not from speed.
- **Jam extent geometry and values:**
  - `traffic` features with `feature_type:"jam"` and `direction_source`. Geometry is the snapped centreline slice, always in south-to-north order (TMP:515-572).
  - Properties: `level`, `length_m`, `delay_seconds`, `speed`, `running_min`, `direction` ("NB"/"SB"), `direction_source` ("street"/"bearing"), `rel_kind` / `rel_a` / `rel_b` / `rel_m` / `rel_km`, `starts_at`, `starts_m`, `nearest_exit`, `street`, `city`.
  - The queue head is `coords[last]` for SB and `coords[0]` for NB (TMP:545).
  - Head points are `feature_type:"jam_mark"` (TMP:556-560).
  - In-effect arrays: `queuePins: {at, line, level}[]` (TMP:430) and `segmentState: {line, level}[]` (TMP:450).
- **Predicted jams (forecast):** built by PQ:137-159.
  - Properties: `predicted:true`, `street` "NLEX N"/"NLEX S", `nearest_exit`, `level` (2/4/5), `length_m`, `length_p75_m`, `delay_seconds`, `speed`, `p_congested`, `vol_median`, `vol_rel`, `side_share`, `dir_jam_hours`, `jam_basis`, `jam_basis_hours`, and `uuid` `forecast-{exit}-{dir}`.
  - **Jam tail:** `feature_type:"jam_tail"`, the same props plus `direction`, with uuid `forecast-tail-{exit}-{dir}` (PQ:166-177). Drawn only when p75 > 1.1 × the median.
- **Exit names and km posts:**
  - `FALLBACK_EXITS` (NE:77-98): `exit_id`, `exit_name`, `latitude`, `longitude`, `km`, `nb_entry`, `nb_exit`, `sb_entry`, `sb_exit`, `node_type`.
  - `useNlexExits().exits` in P (P:68).
  - `CORRIDOR_BY_KM` (TMP:88).
  - Inline `tollPlazas[]` (TMP:1531-1712): `name`, `shortName`, `location`, `type`, `rates`, `description`, `coordinates`.
  - `displayExitName` (NE:167), `plazaLabel` (NE:186), `exitNearestKm` (NE:193), `CORRIDOR_KM` (NE:101).
  - `nlex-ramps.json`: a FeatureCollection of 39 LineStrings with `properties {ramp_id:number, interchange:string, length_m:number}`. It has no km post or exit_id; join on the `interchange` name.
- **Incidents / Waze alerts:**
  - `traffic` features with `feature_type:"alert"`. Properties: `type` (ACCIDENT, HAZARD, CONSTRUCTION, ROAD_CLOSED, POLICE), `subtype`, `street`, `city`, `reliability`, `confidence`, `nearest_exit`, `uuid`, `report_rating`, `road_type`, `by_municipality`, `heading`, `reported_at`, `first_report_at`, `reports_here`, `exit_distance_m`, `lon`, `lat` (map-live.service:522-545).
  - Filtered at TMP:508-514. Marker positions are in `reportPins` (TMP:1506).
  - The look per type comes from `ALERT_LOOK` / `lookOf` (WRL:39-81). There is also a WEATHERHAZARD look, but that type is not counted.
  - There is **no "breakdown" type**; the Waze `subtype` string is carried as-is.
  - WLM `corridorAlerts` (WLM:140) carry the Overview `alerts[]` fields (WLM:60-69).
- **Predicted vs live state:**
  - `isRealtimeEndpoint` (TMP:418).
  - `nlex-corridor` `level` per `segment_order` and direction. Live levels come from `corridorSegmentLevels`, with silence = 0. Forecast levels come from `FORECAST_LEVEL[shownForecastState]`, or 0 when the segment has a queue, or -1 when nothing was forecast (TMP:667-731).
  - Raw forecast props: `segment_id`, `corridor_segment`, `hours_ahead`, `horizon`, `congestion_state` (already passed through the 50% rule), `model_state`, `probability`, `p_congested`, `p_med`, `p_high`, `jam_queue_m`, `jam_queue_p75_m`, `jam_delay_s`, `jam_dist_m`, `jam_speed_kmh`, `front_nb_m`, `front_sb_m`, `nb_share`, `sb_share`, `vol_median`, `vol_rel`, `dir_jam_hours` (service:268-313).
  - FEM keeps `segments`, `ranked` and `counts` (FEM:56, 96-104).
- **Horizon list and timestamps:**
  - `HORIZON_RANGES` (FHP:21); `options = horizonOptionsFor(range, maxHorizon)` (FHP:98); `groups` (FHP:135); `offered` (FHP:152).
  - `peaks: DailyPeak[]` with `{day, hoursAhead, at (ISO), congested, confidence}` (FHP:10-16, 107).
  - `forecastModel.{minHorizon, maxHorizon, horizons, horizonVaries, trainedAt}` (P:47-58).
  - Wall-clock times are computed client-side as now + h, floored to the hour (`hourOf` / `clockFor`, FHP:33-57). The `/forecast` payload carries **no base_ts**.
- **Last-updated timestamps:**
  - `/real-time` returns a top-level `feed: {windowMinutes, newestAt, ageMinutes, stale}` (controller:126-130; map-live.service:291-312). The page's `cachedJson` result and TMP both receive it but **do not read it**.
  - `/live-overview` `feed: {jamsAt, alertsAt, jamsAgeMinutes, alertsAgeMinutes, stale}` plus `generatedAt` and `windowMinutes` (map-live.service:217-278). The WLM `Overview` type declares only the age and stale fields.
  - Also in memory: per-alert `reported_at` / `first_report_at`; per-jam `running_min`; the page clock `timeStr` (wall clock, not data time).
- **Maintenance closures (`/api/maintenance/list`):**
  - Called only in M:292 with plain `fetch(..., {cache:"no-store"})`. There is no shared client helper, no `cachedJson` and no `apiFetch`, and the map route never calls it.
  - Response: `{ success: true, source: "database", data: Schedule[] }`. Each Schedule has `id` (uuid), `title`, `description|null`, `start_km` (float), `end_km` (float), `direction` "NB"|"SB"|"Both", `lane_closure`, `starts_at`, `ends_at`, `status`, `status_reason|null`, `created_at`, `updated_at` (`Back-End/src/services/maintenance.service.ts:30-31`).
  - Optional `?status=scheduled|in_progress|completed|cancelled|all` (validator:66-68).
  - Server order: in_progress, scheduled, completed, cancelled, then `starts_at DESC` (service:56-59).
  - 503 body: `{success:false, message:"Could not load schedules: database not reachable"}`. Server cache TTL 15 s (route-cache:58,67). No auth.

---

## /dashboard/maintenance — Maintenance Overview

**Source files:** M (993 lines); `components/dashboard/PageHeader.tsx`; `app/dashboard/traffic/traffic.module.css` (styles); `lib/toast.tsx` (`useToast`); `lib/table-sort.tsx` (`SortableTh`, `useTableSort`); NE (`useNlexExits`, `exitNearestKm`, `displayExitName`, `CORRIDOR_KM`); `lib/supabase.ts` (session email).

**Backend:** `Back-End/src/routes/maintenance.routes.ts`, `controllers/maintenance.controller.ts`, `validators/maintenance.validator.ts`, `services/maintenance.service.ts`.

### 1. Route / sidebar
- Sidebar entry: label "Maintenance", href `/dashboard/maintenance`, icon `Wrench`, group "Operations" (`app/dashboard/layout.tsx:52`).
- Audit-log label: "Maintenance".

### 2. Roles
- All three roles can open it; it is not in `DENIED` (`lib/auth-access.ts:28-44`).
- No role-dependent content.
- The actor for the `x-user` header is the Supabase session email, else `"dashboard"` (M:265-271).
- Backend endpoints are unauthenticated.

### 3. Tabs / modes / panels
- **No tabs.** Rows on the page: (A) filters plus search, (B) four KPI tiles, (C) the schedule table.
- **Modals (React state only):**
  - Detail: `detail` (M:264)
  - Form: `formOpen` and `editId`, where `editId` set means edit mode (M:258-259)
  - Cancel: `cancelTarget` (M:272)
  - Delete: `deleteTarget` (M:286)
- **Filters:** `statusFilter`, default `"all"` (M:255); `searchQuery` (M:256).
- **Sort:** `useTableSort`, default `{key:"window", dir:"asc"}` (M:348-359).
- Nothing is persisted to storage or the URL.

### 4. Checklist

**Header**
- [ ] Icon `Wrench`, title "Maintenance Overview", subtitle "Scheduled roadworks, closures, and asset upkeep across NLEX" (M:557)

**Filters (row A)**
- [ ] Filter icon plus label "Status" (M:562-563)
- [ ] Segmented buttons "All", "Scheduled", "In Progress", "Completed", "Cancelled"; the active one has class `active` and a check icon (M:564-571)
- [ ] Search box `.ms-search-bar` with a Search icon and placeholder "Search schedules…". It matches title, description, `Km a–b` text and direction (M:330-342, 574-577)

**KPI tiles (row B)**
- [ ] "In Progress": count. Hint `${km.toFixed(1)} km under work right now` or "no active roadwork", where km = sum of |end−start| over in-progress rows (M:322-328, 582-586)
- [ ] "Scheduled": count. Hint `next: {Mon D} · Km a–b` or "nothing upcoming"; next = the soonest future row with status scheduled (M:315-320, 587-595)
- [ ] "Completed": count, hint "all time" (M:596-600)
- [ ] "Cancelled": count, hint "all time" (M:601-605)
- [ ] Each value shows "…" while loading (M:584, 589, 598, 603)

**Schedule list (row C)**
- [ ] Card title "Maintenance Schedules" (M:612)
- [ ] Subtitle "Loading…" or `{visible.length} of {schedules.length} shown` (M:613-615)
- [ ] Primary button "Schedule Maintenance" (Plus icon, class `ms-btn-primary`). Opens an empty form (M:617-619)
- [ ] Error: "Live data unavailable — is the backend running on port 4000?" (M:622-623)
- [ ] Empty: "No maintenance scheduled yet — create the first one." (M:624-625)
- [ ] Filtered empty: "Nothing matches the current filters." (M:626-627)
- [ ] Table columns (each a `SortableTh` with `aria-sort`, a title tooltip and arrows ▲ ▼ ⇅) (M:633-636; `lib/table-sort.tsx:88-127`): "Status", "Work", "Location", "Window"
- [ ] Sorting: clicking cycles asc, desc, then cleared (API order) (`lib/table-sort.tsx:57-64`)
  - Status sorts by lifecycle rank: scheduled 0, in_progress 1, completed 2, cancelled 3 (M:347-351)
  - Work sorts by title; Location by `start_km`; Window by `starts_at`
- [ ] Status cell: `StatusControl` badge button (`ms-badge {blue|yellow|green|red}`, title "Change status", `aria-expanded`). The menu lists allowed transitions plus a danger item "Cancel schedule…" (M:144-223, 643-648)
- [ ] Work cell: `<strong>{title}</strong>` plus the description truncated at 380 px (M:650-657)
- [ ] Location cell: `Km {start}[–{end}] · {direction}` plus `lane_closure` on a second line (M:658-661)
- [ ] Window cell: `fmtWindow`, which gives `{Mon D, h:mm AM} → {Mon D, h:mm PM}` (M:64-67, 662)
- [ ] Clicking a row opens the detail modal (`styles.clickableRow`) (M:641)
- [ ] Inline action error under the table (red, clears after 5 s) (M:669-671)
- [ ] **No pagination.** All rows are rendered (M:629-667)

**Status lifecycle (UI)** (M:44-62)
- [ ] Labels: scheduled "Scheduled" (blue), in_progress "In Progress" (yellow), completed "Completed" (green), cancelled "Cancelled" (red)
- [ ] scheduled → "Start work" (in_progress)
- [ ] in_progress → "Mark completed" or "Revert to scheduled"
- [ ] completed → "Reopen work" (in_progress)
- [ ] cancelled → "Restore schedule" (scheduled)
- [ ] Cancel is allowed only from scheduled or in_progress and needs a reason (M:169, 721)
- [ ] Backend transitions also allow scheduled → completed, which the UI does not offer (service:24-29)

**Detail modal**
- [ ] Backdrop with `role="dialog"`, `aria-modal`, `aria-label={detail.title}`. Clicking the backdrop closes it (M:676)
- [ ] Icon 🛠️, h3 title, status badge (M:680-684)
- [ ] Close button `aria-label="Close"` (M:685)
- [ ] Rows, alternating shading (M:690-703):
  - "Location"
  - "Near" `{exit} → {exit}`
  - "Lane closure"
  - "Window"
  - "Description" (or "—")
  - "Reason" (only when `status_reason` is set)
  - "Created" (`Mon D, YYYY, h:mm AM`)
- [ ] Inline action error (M:705)
- [ ] Button "Edit details", for scheduled or in_progress only (M:711-715)
- [ ] One button per NEXT_ACTION label; shows "Saving…" while mutating (M:716-720)
- [ ] Button "Cancel schedule", for scheduled or in_progress only (M:721-729)
- [ ] Button "Delete" (red, pushed right), available for every status (M:730-737)

**Delete confirm modal**
- [ ] `aria-label="Delete schedule"`, icon 🗑️, h3 "Delete this schedule?", sub `{title} · Km a–b` (M:750-757)
- [ ] Close button `aria-label="Close"` (M:759)
- [ ] Body text: §8 (M:764-768)
- [ ] Button "Delete permanently" ("Deleting…" while running) and "Keep it" (M:772-781)
- [ ] Footer "This cannot be undone." (M:785)

**Cancel modal**
- [ ] `aria-label="Cancel schedule"`, icon ⚠️, h3 "Cancel this schedule?", sub `{title} · Km a–b` (M:793-800)
- [ ] Close button `aria-label="Close"` (M:802)
- [ ] Textarea labelled "Cancellation reason" with required mark `*`, placeholder "Why is this work being cancelled?" (M:807-816)
- [ ] Button "Cancel schedule" ("Cancelling…" while running), disabled until the reason is non-empty; and "Keep it" (M:820-829)
- [ ] Footer "This cannot be undone." (M:833)

**Schedule form modal (create and edit)**
- [ ] `aria-label="Schedule maintenance"`. Clicking the backdrop closes it unless saving (M:841)
- [ ] h3 "Edit Maintenance" or "Schedule Maintenance" (M:847)
- [ ] Close button `aria-label="Close"` (M:849)
- [ ] **Title** * (text): placeholder "e.g. Road resurfacing, toll booth repair…" (M:855-864)
- [ ] Section label "Location" (M:866)
- [ ] **Direction** *: segmented NB "Northbound" and SB "Southbound", with `aria-pressed` and a check icon. **No "Both" option** (M:869-886). Quoted code at M:16-23:
  ```
  /* A closure is on one carriageway, so the form asks for one. "Both" is no
     longer offered for new work; rows saved with it before still display as
     such (see Schedule.direction), and editing one asks for a side. */
  const DIRECTIONS = ["NB", "SB"] as const;
  ```
  When editing a legacy "Both" row (M:433): `direction: s.direction === "Both" ? (s.end_km >= s.start_km ? "NB" : "SB") : s.direction,`
- [ ] **Start exit** *: custom Select. Placeholder "Where it begins, going north…" (NB) or "Where it begins, going south…" (SB). Options are listed in travel order (M:889-897)
- [ ] **Start Km**: number input, step 0.01, `min=KM_MIN`, `max=KM_MAX`, placeholder "auto", title "Filled from the exit. Adjust only if the works start between two exits." (M:898-906)
- [ ] **End exit** *: custom Select. Placeholder "Pick the start first…" or "Where it ends…". Only exits at or ahead of the start (in travel order) are offered (M:907-915)
- [ ] **End Km**: number input, title "Filled from the exit. Adjust only if the works end between two exits." (M:916-924)
- [ ] **Choosing an exit fills its km.** The option's value IS the km post (M:521):
  ```
  const exitOption = (x: NlexExit) => ({ label: `${displayExitName(x.exit_name)} · Km ${x.km}`, value: String(x.km) });
  ```
  - The Select is bound to `value={form.startKm}` / `form.endKm` (M:892, 910). `pickStart` clears an end that would now lie behind the start (M:528-536).
  - Travel order (M:520): `const inTravelOrder = form.direction === "NB" ? byKm : [...byKm].reverse();`
  - End options are filtered at M:524-526.
- [ ] **Switching NB/SB swaps start and end** (M:541-542):
  ```
  const setDirection = (d: (typeof DIRECTIONS)[number]) =>
    setForm((f) => (f.direction === d ? f : { ...f, direction: d, startKm: f.endKm, endKm: f.startKm }));
  ```
- [ ] Segment note: MapPin icon plus `{Northbound|Southbound} · {len.toFixed(1)} km · near {exit} → {exit}` (M:544-547, 927-931)
- [ ] **Lane closure**: Select with options "None", "Shoulder only", "1 lane", "2 lanes", "Full closure". Default "Shoulder only"; placeholder "Select lane closure" (M:24, 240, 933-943)
- [ ] Section label "Window" (M:945)
- [ ] **Start date** * (date input) (M:947-950)
- [ ] **Start time** (time input, default 08:00) (M:242, 951-954)
- [ ] **End date** * (date input, `min` = start date) (M:955-958)
- [ ] **End time** (time input, default 17:00) (M:244, 959-962)
- [ ] **Description** (textarea): placeholder "Scope of work, crew, equipment, traffic advisory notes…" (M:965-974)
- [ ] Inline form error in red (M:976)
- [ ] Submit button: Calendar icon plus "Schedule Maintenance", or "Save changes" when editing, or "Saving…" while saving (M:980-983)
- [ ] Button "Discard" (M:984-986)
- [ ] Custom Select (M:79-141): closes on outside mousedown; `aria-expanded`; check mark on the selected option; no listbox roles

**Validation messages** (M:449-465, in order)
- [ ] "Give the work a short title (at least 3 characters)."
- [ ] "Pick a start exit and an end exit."
- [ ] `` `Km posts on this corridor run from ${KM_MIN} (${firstExit}) to ${KM_MAX} (${lastExit}).` ``
- [ ] "Northbound runs up the km posts, so the end must be at a higher km than the start." (fires only when end < start; equal is allowed)
- [ ] "Southbound runs down the km posts, so the end must be at a lower km than the start." (fires only when end > start)
- [ ] "Start and end date are required."
- [ ] "The window must end after it starts."
- [ ] Server message, or "Save failed", or "Save failed — is the backend running?" (M:485, 498)
- [ ] **Backend conflict (as built):** the validator refines `endKm >= startKm` with the message "endKm must be the same as or greater than startKm" (validator:35-38). A southbound entry whose end is below its start therefore gets a 400 with that message, shown inline and in a toast. The backend km bounds are 0-100 (validator:13-14).

**Toasts** (`useToast`; the error variant uses `role="alert"`, others `role="status"`; viewport `aria-live="polite"`)
- [ ] Status change success: `` `"${s.title}" is now ${label.toLowerCase()}.` `` (M:378)
- [ ] Status change error: `` `Could not update "${s.title}".` `` plus the message (M:385)
- [ ] Delete success: `` `"${s.title}" was deleted.` `` (M:408)
- [ ] Delete error: `` `Could not delete "${s.title}".` `` plus the message (M:414)
- [ ] Save success: `` `Updated "${title}".` `` / `` `Scheduled "${title}".` `` with detail `` `${direction} · Km ${startKm}–${endKm} · ${laneClosure}` `` (M:491-494)
- [ ] Save error: "Could not save your changes." / "Could not schedule the work." plus the message (M:500)
- [ ] A DELETE that returns 404 is treated as success and the list refreshes (M:401-404)
- [ ] Every mutation refreshes the list, on success and on failure (M:374, 381, 405, 410, 487)
- [ ] Double submits are ignored while `mutating` (M:363, 392)

**Keyboard**
- [ ] No Esc handling on any maintenance modal. Backdrop click and Close buttons only.

### 5. API endpoints
All are plain `fetch`, no auth, from M. Server route cache is 15 s.
- `GET {BACKEND}/api/maintenance/list`, `cache:"no-store"`. Called on mount and after every mutation; not polled (M:290-306).
- `POST {BACKEND}/api/maintenance/schedule` with headers `Content-Type: application/json` and `x-user`. Body: `{title, description?, startKm, endKm, direction, laneClosure, startsAt (ISO), endsAt (ISO)}` (M:470-483). Returns 201, 400 or 503.
- `PUT {BACKEND}/api/maintenance/{id}`: same body, edit mode (M:470-471). Returns 200, 400, 404 or 503.
- `PATCH {BACKEND}/api/maintenance/{id}/status` with body `{status}` or `{status, reason}` (M:367-371). Returns 200, 400, 404, 409 or 503. 409 messages (controller:125-131): `This schedule is already {to}` / `A {from} schedule can no longer be changed to {to}`.
- `DELETE {BACKEND}/api/maintenance/{id}` with header `x-user` (M:396-399). Returns 200 `{message:"Deleted"}`, 404 or 503.
- `GET {BACKEND}/api/map-comparison/exits` via `useNlexExits` (NE:111).
- Supabase `auth.getSession()` for the actor email (M:268).

### 6. localStorage / sessionStorage
- None written by M.
- Only Supabase's own session storage is read indirectly, through `supabase.auth.getSession()` (M:268).

### 7. "Never cut" facts (verbatim)
- Km posts on the corridor run from Balintawak 12 to Sta. Ines 88.25 (M:509-515; NE:77-97).
- Exit option format: `{Exit} · Km {km}` (M:521).
- Direction rule (M:454-456): "Start is where traffic reaches the works first: northbound runs up the km posts, southbound down them."
- Lane closure options: "None", "Shoulder only", "1 lane", "2 lanes", "Full closure" (M:24). These match the backend enum (validator:5).
- Default window is 08:00 to 17:00 (M:242-244).
- Every audited action is recorded with the actor from `x-user`: `maintenance.schedule_created`, `.schedule_edited`, `.status_changed`, `.schedule_deleted` (controller:46, 87, 133, 157).
- The data is also consumed by the mobile app, so the row shape and status vocabulary must stay stable (service:5-6; validator:7-8).
- "This cannot be undone." appears on both the Delete modal and the Cancel modal (M:785, 833).
- `kmUnderWork` is the sum of |end_km − start_km| over in-progress rows (M:322-328).

### 8. Visible prose likely to be shortened (verbatim)
- M:765-767: "This removes the record entirely. If the work was planned and then called off, use **Cancel schedule** instead — that keeps the entry and its reason on the corridor record."
- M:903 / M:921: "Filled from the exit. Adjust only if the works start between two exits." / "… end between two exits."
- M:893: "Where it begins, going north…" / "Where it begins, going south…"; M:911: "Pick the start first…" / "Where it ends…".
- M:970: "Scope of work, crew, equipment, traffic advisory notes…"
- M:459-460: the two direction validation sentences (§4).
- M:453: the km-range validation template (§4).
- M:625: "No maintenance scheduled yet — create the first one."
- M:623: "Live data unavailable — is the backend running on port 4000?"

---


All paths relative to `Front-End-Dashboard/` unless prefixed `Back-End/`. Line refs are to the files as of branch `dashboard-redesign` (commit 527abba + uncommitted). None of the three pages use `lib/toast.tsx`, `CustomSelect`, `InfoTooltip`, `DateFilter` or `DateRangePicker` (grep: no matches). See "Shared helpers" at the end.

---

## /dashboard/mobile — Mobile Control Centre

**Source:** `app/dashboard/mobile/page.tsx` (950 lines, single file, no sub-components). Uses `components/dashboard/PageHeader.tsx`. Styles: `app/globals.css` (`.ds-mc-*`, `.ds-phone-*`, `.ds-adv-*`, `.ds-switch`, `.ds-modal*`, `.ds-toast*`).

**Roles:** Open to all three roles (not in any DENIED list, `lib/auth-access.ts:28-44`). Sidebar label "Mobile App", group "Operations" (`app/dashboard/layout.tsx:53`). No role-dependent content inside the page. Backend: GET is public, PUT has NO auth middleware (`Back-End/src/routes/mobile-config.routes.ts:42-43`) — any role (any caller) can save. Server writes audit event `mobile_config.updated` with per-switch and per-advisory text diffs (`Back-End/src/controllers/mobile-config.controller.ts:93-98`).

**Tabs / sub-tabs / panels** (all selection is React state only; nothing persisted):
- Accordion of 5 app tabs in left panel; `open` state, default `"dashboard"` (page.tsx:188); single-open (opening one closes another; clicking open one closes it).
- Phone preview tab; `previewTab` state, default `"dashboard"` (page.tsx:189). Accordion click, phone tab-bar click and hidden-tab jump pill all set BOTH `previewTab` and `open` (505-509, 686-689, 708-711).
- Advisory dialog; `advisoryOpen` state (208).
- Draft vs saved: `draft` (edits) vs `saved` (last server copy); `dirty` = sections or advisories differ (255-262). Preview renders from `draft` ("Unsaved changes included").
- App tabs (key / visible label / blurb) and their sections (key / label / blurb), page.tsx:73-128. Labels are "the wording the traveller actually sees" (66-72):
  - `dashboard` "Dashboard" — "The screen the app opens on." → `statusSummary` "Network status" ("The live corridor summary at the top of the screen."), `segmentForecast` "Traffic forecast" ("Pick a route and hour, get a predicted state."), `corridorOutlook` "Corridor outlook" ("The Today / This Week strip."), `eventForecasts` "Event forecasts" ("Upcoming events and the surge each is expected to bring."), `mlHotspots` "ML hotspots" ("Model-ranked risk locations.")
  - `map` "Corridor" — "The live map. Reads the same real-time feed as the Live Map page here." → `liveStatus` "Live view" ("Current readings, straight from the feed."), `forecastView` "Forecast view" ("Modelled state ahead of now.")
  - `community` "Community" — "Traveller-submitted reports." → `shareUpdate` "Share an update" ("Lets a traveller post a general update."), `reportIncident` "Report an incident" ("The incident-reporting form."), `filters` "Feed filters" ("The tabs that narrow the feed by type.")
  - `assistant` "Assistant" — "Conversational lookup of corridor conditions." → `quickQuestions` "Quick questions" ("Suggested prompts above the input."), `capabilities` "What it can answer" ("The list shown before the first question.")
  - `alerts` "Alerts" — "Notices, and any advisory you publish." → `traffic` "Traffic alerts" ("Congestion, events and incidents."), `maintenance` "Maintenance notices" ("Scheduled roadworks and closures.")

### Checklist

**Header**
- [ ] PageHeader icon Smartphone, title "Mobile Control Centre" (391)
- [ ] Subtitle "What the SmartFlow mobile app shows to travellers" (392)
- [ ] Header action button "Reload" (RotateCcw icon), disabled while loading or saving, re-GETs config (394-396)

**Provenance banner**
- [ ] Warning banner `role="status"` shown when `meta.source === "defaults"` and not loading (403-412)
- [ ] Banner bold "Showing built-in defaults, not saved settings." + body naming `Back-End/scripts/mobile-config.sql` (407-409)

**Toasts (`.ds-toasts`, `aria-live="polite"`, 414)**
- [ ] Error toast `role="alert"` with message text (416-418)
- [ ] Error toast dismiss button `aria-label="Dismiss"` (419)
- [ ] Success toast `role="status"`: "Saved — the app picks this up on its next launch or refresh." auto-clears after 5000 ms (360-361, 424-429)

**Advisory strip (above grid, 436-472)**
- [ ] Megaphone icon; class `is-live` when ≥1 published (436)
- [ ] Label "Advisories" (442)
- [ ] Counts "{n} published" + " · {m} draft" (only when any advisories exist; draft part only when m>0) (443-449)
- [ ] One chip per live published advisory: tone dot `is-{tone}` + message, `title` = full message (453-458)
- [ ] Empty text "Nothing published. Travellers see only the app's own notices." (461)
- [ ] Button "Manage" (disabled while loading) opens advisory dialog (464-471)

**Left panel "What travellers get" (476-596)**
- [ ] Panel heading h2 "What travellers get" (479)
- [ ] Scrolling list `ul.ds-mc-features` with `ref`, `onScroll` edge measuring, `data-fade-top="true"` / `data-fade-bottom="true"` (CSS hooks globals.css:8410-8411) (483-489)
- [ ] ResizeObserver re-measures fade edges on list/children resize (233-241)
- [ ] 5 tab rows, `li` class `is-on`/`is-off` + `is-open` (498)
- [ ] Row disclosure button with `aria-expanded` and `aria-controls="sections-{key}"` (500-504)
- [ ] Row shows tab icon, bold label, blurb (520-526)
- [ ] State pill "{on}/{total} on" (`.ds-mc-pill.is-shown`) when any section on (531-534)
- [ ] State pill "Hidden" with EyeOff icon (`.ds-mc-pill.is-hidden`) when none on (535-538)
- [ ] ChevronDown indicator (540)
- [ ] Opening a row smooth-scrolls it into view (`scrollIntoView({block:"nearest"})` after rAF) (514-517)
- [ ] Expanded region `id="sections-{key}"` (546)
- [ ] Bulk caption "{label} is visible in the app." / "{label} is hidden — nothing inside it is on." (549-551)
- [ ] Bulk link-button "Turn all off" / "Turn all on" (sets every section of that tab), disabled while loading (553-560)
- [ ] Per-section row: icon, bold label, blurb (567-573)
- [ ] Per-section switch (checkbox in `label.ds-switch.is-small`; `input` must precede `.ds-switch-track` for `:checked +` CSS), disabled while loading (574-583)
- [ ] Per-section sr-only label "{tab label}: {section label}" (584)
- [ ] 14 section switches total across 5 tabs (one per section listed above)
- [ ] No separate tab-level on/off switch: a tab is shown iff any section on (`tabShown`, 156-158) — visibility pill is a readout, not a control

**Right panel "Preview" (603-723)**
- [ ] Heading h2 "Preview" (607)
- [ ] Caption "Tap a tab below to see inside it. Unsaved changes included." (608)
- [ ] Phone wrapper `aria-label="Mobile app preview"` (612)
- [ ] Phone frame + notch (aria-hidden) (613-614)
- [ ] Status bar (aria-hidden): clock "9:41", Signal / Wifi / BatteryFull icons (616-623)
- [ ] App bar showing previewed tab label + dot (625-628)
- [ ] Hidden-tab screen: EyeOff, "{label} is hidden", "Nothing inside it is switched on, so the tab is not in the app." (631-636)
- [ ] Advisories rendered at top of phone body ONLY when previewing Alerts, one per live published advisory, class `is-{tone}` (641-653)
- [ ] Advisory heading by tone: critical → "Critical", warning → "Advisory", info → "Notice" (645-649)
- [ ] One card per switched-on section: icon + section label + two placeholder bars `w80`, `w55` (no invented figures) (655-672)
- [ ] Bottom tab bar `nav aria-label="Preview a tab"` with 5 buttons (677-695)
- [ ] Tab bar button: icon + small label, `title="Preview {label}"`, class `is-current` when previewed (679-693)
- [ ] Hidden tabs get `is-gone` (CSS `display:none`, globals.css:7799) — dropped from bar, not greyed (682)
- [ ] Jump pills below phone for each hidden tab: EyeOff + label, `.ds-mc-pill.is-hidden.is-clickable`, sets preview + opens accordion (702-716)
- [ ] Note "Hidden tabs are dropped from the bar entirely rather than greyed out, so the remaining ones spread to fill it — exactly as the app does it." (718-721)

**Advisory dialog (726-913)**
- [ ] Backdrop `role="presentation"`; closes only on click on backdrop itself (730-734)
- [ ] Dialog `role="dialog"`, `aria-modal="true"`, `aria-labelledby="advisory-title"`, class `ds-modal is-wide` (736-741)
- [ ] Escape closes dialog (document keydown listener) (246-253)
- [ ] Closing via Escape / backdrop / Close does NOT revert edits; only "Cancel" reverts advisories
- [ ] Header: Megaphone icon, h2 `id="advisory-title"` "Advisories" (744-747)
- [ ] Header counts "{n} published · {m} draft" (748-754)
- [ ] Close button `aria-label="Close"` (X icon) (756-763)
- [ ] Empty state: Megaphone, "No advisories yet", explanatory text (768-775)
- [ ] Advisory list `ul.ds-adv-list`, each `li` class `tone-{tone}` + `is-live` (777-783)
- [ ] Per-advisory state label "Published" / "Draft" with dot (`is-{tone}` when live, else `is-idle`) (786-792) — reflects SAVED state, not draft switch
- [ ] Per-advisory pending chip: "new, will publish" / "new draft" / "will publish" / "will withdraw" / "edited" (319-329, 793)
- [ ] Delete button `aria-label="Delete advisory"` (Trash2), no confirm (794-801)
- [ ] Message textarea rows=2, `maxLength=280`, placeholder "e.g. Lane closure at Km 15.2 southbound until 06:00." (806-812)
- [ ] Character counter "{len}/280", class `is-near` when > 250 (813-817)
- [ ] Tone group `role="group"` `aria-label="Tone"` with buttons "Info", "Warning", "Critical", `aria-pressed`, class `is-{tone}` + `is-active` (822-834)
- [ ] Hint "{k} more to publish" when message non-empty and < 8 chars (836-838)
- [ ] "Publish" switch per advisory; disabled until message ≥ 8 trimmed chars; title "Mark this to go live on the next save" / "Write more first" (840-856)
- [ ] Auto-unpublish: trimming a message below 8 chars turns its Publish switch off (268-277)
- [ ] Button "Add advisory" (Plus icon); becomes "Limit reached" and disabled at 6 advisories (864-874)
- [ ] New advisory defaults: draft (active=false), tone "info", empty message, id `adv-{base36 time}-{5 random}` (143-144, 279-290)
- [ ] Footer note: blocked reason, else "{n} change(s) to send", else "Unsaved changes elsewhere on the page", else "Nothing to send" (883-890)
- [ ] Footer button "Cancel": reverts ONLY advisories to saved (keeps section edits), closes (891-901)
- [ ] Footer button "Save & publish" (Save icon) / "Saving…"; disabled when saving, not dirty, or blocked; saves sections + advisories, then closes (even if save errored) (902-909)

**Save bar (918-947)**
- [ ] Sticky save bar `.ds-mc-savebar`, `is-open` when dirty and dialog closed; `aria-hidden` otherwise (918-921)
- [ ] Text: blocked reason with AlertTriangle (`.is-blocked`) or "Unsaved changes." (923-929)
- [ ] Button "Discard": reverts whole draft (sections + advisories) to saved, no confirm; disabled when saving or not dirty (932-938)
- [ ] Button "Save & publish" / "Saving…"; disabled when saving, not dirty, or blocked (939-945)

**Validation / blocked reasons (shown instead of letting the API refuse)**
- [ ] "A published advisory needs at least 8 characters." (338)
- [ ] "Everything is switched off — the app would open to nothing." (340)

**Error / loading text**
- [ ] "Could not read configuration" (216)
- [ ] "Could not reach the dashboard API" (221)
- [ ] "Save failed ({status})" (356) and "Save failed" (363)
- [ ] Server messages surfaced verbatim in error toast, e.g. "Could not save configuration: database not reachable", "At least one section somewhere must stay on, or the app opens to nothing.", "At most 6 advisories can be held at once", "Two advisories share an id", "Invalid configuration" (Back-End validator:107,115,123,205; controller:43,52)
- [ ] All switches / bulk buttons / Manage disabled while `loading` (no separate spinner text)

**Data fetched but not rendered (do not assume a lost feature)**
- [ ] `meta.updatedAt` / `meta.updatedBy` are stored (219, 359) but never displayed
- [ ] `TONES[].hint` ("General notice", "Plan around it", "Act now") defined (130-134) but not rendered

### API endpoints
- `GET ${NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"}/api/mobile-config`, plain `fetch`, `cache: "no-store"`; on mount and on "Reload" (214, 227-229, 394). Response `{success, data:{features, sections, advisories, advisory}, meta:{source:"db"|"defaults", updatedAt, updatedBy}}`. `advisory` (legacy single) ignored by page (56-57).
- `PUT .../api/mobile-config`, JSON body `{sections, advisories}` (features NOT sent; server derives) (349-354). Same response shape. Triggered by both "Save & publish" buttons.
- Global `installBackendAuth` (layout) adds the Supabase bearer to these fetches; page does not use `apiFetch`.
- No polling.

### localStorage / sessionStorage
- None in page. Layout `logPageView` writes sessionStorage `audit:viewed:/dashboard/mobile` (10-min throttle; `lib/backend-auth.ts:77-86`).

### "Never cut" facts
- Message max "280" characters (136), min "8" to publish (138), max "6" advisories (141) — all mirror the API.
- Placeholder names a km/direction/hour: "e.g. Lane closure at Km 15.2 southbound until 06:00." (810)
- Saves take effect "on its next launch or refresh" (360).
- Corridor tab "Reads the same real-time feed as the Live Map page here." (91)
- Defaults banner: app "is currently being served every feature switched on"; fix script `Back-End/scripts/mobile-config.sql` (407-409).
- Advisories appear in the app only on the Alerts screen, pinned above the app's own notices (139-141, 639-641).
- Tab keys are the Expo route names in the mobile app's `(tabs)` group (43-46); mobile app repo SmartFlow-NLEX/Main-Mobile reads `/api/mobile-config`.
- Preview clock "9:41"; preview bars are deliberately not figures (664-666).

### Visible prose likely to be shortened (verbatim)
- page.tsx:392 "What the SmartFlow mobile app shows to travellers"
- page.tsx:407-409 "**Showing built-in defaults, not saved settings.** The configuration row could not be read, so the app is currently being served every feature switched on. Saving from here will create it. If this persists, run `Back-End/scripts/mobile-config.sql`."
- page.tsx:461 "Nothing published. Travellers see only the app's own notices."
- page.tsx:608 "Tap a tab below to see inside it. Unsaved changes included."
- page.tsx:635 "Nothing inside it is switched on, so the tab is not in the app."
- page.tsx:719-720 "Hidden tabs are dropped from the bar entirely rather than greyed out, so the remaining ones spread to fill it — exactly as the app does it."
- page.tsx:772-773 "An advisory is a message you put on every phone: a closure, an event, a warning. Add one and it stays a draft until you publish it."
- page.tsx:78-125 all 5 tab blurbs and 14 section blurbs (listed under Tabs above).

---

## /dashboard/data-management — Data Management

**Source:** `app/dashboard/data-management/page.tsx` (907 lines; local component `ComparisonPanel` 180-240, helper `rowPreview` 243-249, `retrainPill` 136-142, `getData` 148-164). Uses `components/dashboard/PageHeader.tsx`, `lib/api.ts` (`apiFetch`, `BACKEND`).

**Roles:** data-analyst only (denied to tcc-operator and incident-operator, `lib/auth-access.ts:31,41`; layout redirects to `/dashboard`). Sidebar label "Data Management", group "Admin" (layout.tsx:57). Backend enforces data-analyst on every `/api/upload/*` route (`Back-End/src/routes/upload.routes.ts:67-68`). No role-dependent content inside; 401/403 produce messages (see Errors).

**Tabs / sub-tabs / panels:** No tabs. Vertical stack: header → backend-down alert → upload zone → [confirm-upload dialog] → [undo dialog] → "What happens" steps (only before any result/error) → error panel → result block (result panel, comparison, mini-stats, gates table, rejected rows, errors/notes) → "What can I upload?" `<details>` (collapsed by default) → "Recent uploads" table → "Weekly model retraining". All state is React state; nothing persisted.

### Checklist

**Header**
- [ ] PageHeader icon Brain, title "Data Management" (461)
- [ ] Subtitle "Upload datasets — the ETL pipeline classifies, validates, and loads them into the AWS database" (462)
- [ ] Header status pill "ETL Pipeline Ready" (blue) / "Backend offline" (red) (463)

**Backend-down alert (466-476)**
- [ ] Panel `role="alert"`, danger border, shown when any request found no backend
- [ ] Heading "The backend is not answering" (468)
- [ ] Body naming `{BACKEND}` URL, `npm run dev`, `Back-End` folder; "Nothing has been deleted" (469-473)
- [ ] Button "Try again" → reloads formats, retraining, history (474)

**Upload zone (478-503)**
- [ ] `article.upload-zone` with UploadCloud icon (30px) (481)
- [ ] Heading "Upload Batch Dataset" (482)
- [ ] Intro paragraph (484-485, verbatim below)
- [ ] File picker label-button "Select File" / "Checking..." / "Loading..." (cursor `wait`, 0.7 opacity while busy) (487-488)
- [ ] Hidden `<input type="file" accept=".csv,.tsv,.json,.xlsx,.xls">`, single file, disabled while busy (489-495)
- [ ] Input value reset after pick so the same file can be re-picked (380-381)
- [ ] Not drag-and-drop: no onDrop/onDragOver handlers exist (click-to-pick only)
- [ ] Caption: last sent file name or "No file selected yet" (497)
- [ ] Progress line "{Checking|Loading} {fileName}: {elapsed} s. A year of hourly toll data takes one to two minutes." (elapsed ticks every 1 s) (365-372, 498-502)
- [ ] No client-side size limit; server limit 500 MB, 1 file (`Back-End/src/middleware/upload.middleware.ts:20,50-53`; header comment there says 100MB but code is 500MB)
- [ ] Server rejects other extensions: "Unsupported file type: {ext}. Accepted: .csv, .tsv, .json, .xlsx, .xls" (upload.middleware.ts:41)

**Confirm-upload dialog (505-543) — picking a file never sends it**
- [ ] Backdrop `role="presentation"`, click on backdrop cancels (506-512)
- [ ] Escape cancels (window keydown) (356-363)
- [ ] Dialog `role="dialog"` `aria-modal="true"` `aria-labelledby="upload-confirm-title"`, width min(500px,100%) (514)
- [ ] Title h2 `id="upload-confirm-title"` "What should happen to this file?" (516)
- [ ] File name (bold, break-all) + size formatted "{n} B" / "{n.n} KB" / "{n.n} MB" (129-130, 519-523)
- [ ] Explanatory note on Check only vs Upload & load (524-528, verbatim below)
- [ ] Button "Cancel" (531)
- [ ] Button "Check only" — `autoFocus`, sends `?mode=check` (534-536)
- [ ] Button "Upload & load" (primary) (537-539)

**"What happens after you upload" steps (590-613; shown only when no result and no error)**
- [ ] `ol.ds-steps` `aria-label="What happens after you upload"`
- [ ] Step "Classify" (ScanSearch icon) + text (593-595)
- [ ] Step "Validate" (CheckCircle2) + text (598-600)
- [ ] Step "Load & publish" (Database) + text (603-605)
- [ ] Step "Retrain weekly" (CalendarClock) + text (608-610)

**Upload error panel (615-620)**
- [ ] Heading "Pipeline Error" + message in `.bad`
- [ ] "Your session is no longer valid for uploading. Sign in again as a Data Analyst." (fallback for 401/403) (410)
- [ ] "An error occurred during upload." (415)
- [ ] "Upload failed without additional details." (422)
- [ ] "The backend at {BACKEND} is not answering, so the file was not sent. Start it with npm run dev in the Back-End folder, then try again." (429)
- [ ] "Unable to process the uploaded file." (431)

**Result panel (622-648)**
- [ ] Heading "Check result — nothing was written" (dry run) / "Loaded" / "Not loaded" (625)
- [ ] Classification reason line, `.ok` or `.bad` (626)
- [ ] Unknown layout text "This file does not match any layout the pipeline accepts. See “What can I upload?” below." (628)
- [ ] "Detected: {layout label} ({confidence}% of its columns)" (631)
- [ ] " · would load into / loaded into `{destination}`" (632)
- [ ] " · then `{table}` ({rows})" per published table (633)
- [ ] " · shows on {page names}" (634)
- [ ] Retrain line "The models pick these rows up in the weekly retrain, next on **{date}**" (fallback " on Sunday night") — only after a real load that wrote rows (637-642)
- [ ] " Wrong file? Undo it in Recent uploads below." when `can_undo` (640)
- [ ] Button "Load it now" after a passing check — re-sends last file with mode=load, disabled while busy (643-647)

**Comparison panel "Compared with what's loaded" (180-240)**
- [ ] Heading "Compared with what's loaded" (184, 195)
- [ ] Records kind: "None of these records is loaded yet." / "{matched} of these records are already loaded: {changed} would change|changed, {identical} identical." (186-188)
- [ ] Toll kind: "All {plazaDays} plaza-days are new: nothing already loaded would be|was replaced." (198)
- [ ] Toll kind: "{replaced} of {plazaDays} plaza-days are already loaded. Their total would go|went from {loaded} to {file} ({±x.x%})." (199)
- [ ] Warning border when any plaza-day flagged (194)
- [ ] Flag warning "{n} plaza-day changes|days change by more than {threshold}%." (204)
- [ ] Flag advice "Make sure this is the right file before loading it." (check) / "If this was the wrong file, undo it in Recent uploads." (load) (205)
- [ ] Flagged-examples table columns "DATE", "PLAZA", "LOADED", "IN THE FILE", "CHANGE" (last three right-aligned, tabular nums) (211-215)
- [ ] Footnote "The {k} largest changes of {flagged}." when more flagged than shown (231-235)

**Mini stats (652-671)**
- [ ] Card "Rows in the file": total parsed; "{accepted} passed the gates · {rejected} set aside" (654-656)
- [ ] Card "Would be written (AWS)" (check) / "Written (AWS)" (load): inserted (green); "{updated} updated · {already} already loaded" + " · {failed} refused" (red, when >0) (659-664)
- [ ] Card "Set aside": rejected count (red when >0); "{duration} s · {FILE FORMAT uppercase}" (667-669)

**Gates table (673-701)**
- [ ] Heading "ETL Validation Gates" (674)
- [ ] Columns "GATE", "STATUS", "DETAILS" (679-681)
- [ ] Status pills "PASSED" (green) / "FAILED" (red) (689-693)

**Rejected rows table (703-727; only when sample non-empty)**
- [ ] Heading "Rows set aside (first {k} of {rejected})" (705-707)
- [ ] Columns "WHY", "ROW" (712-713)
- [ ] ROW preview = first 5 non-empty fields "key: value" (values cut to 40 chars) joined " · " (243-249)

**Errors / notes (729-750)**
- [ ] Heading "Pipeline Errors" (red), first 10 + "...and {n} more errors" (733-737)
- [ ] Heading "Notes" (amber), first 10 warnings + "...and {n} more" (742-746)

**"What can I upload?" (754-789)**
- [ ] Failure line "What can I upload? — not loaded: {error}" or backend-down variant (754-758)
- [ ] `<details class="panel dm-formats">` collapsed by default (761)
- [ ] Summary "What can I upload? — {n} layouts; rows dated after {record end date} (the record's end) are set aside, except air-quality readings" (762-768)
- [ ] Groups (each `section aria-label={title}`, `is-wide` when >2 items): "Traffic", "Incidents", "Emissions & air quality", "Not accepted" (170-175, 770-786)
- [ ] Each layout: bold label + "Shows on {pages}." (accepted) or reason text with `is-off` (not accepted) (777-781)

**Recent uploads (791-847)**
- [ ] Heading "Recent uploads" (792)
- [ ] Undo result note, `.ok` / `.bad` (793-795)
- [ ] Columns "#", "FILE", "LAYOUT", "STATUS", "ROWS WRITTEN" (right), "WHEN", empty header `aria-label="Undo"` (800-806)
- [ ] LAYOUT = matched format label, else dataset_type, else "—" (823)
- [ ] STATUS pill: green "processed", red "failed", amber otherwise; text = raw status (824)
- [ ] WHEN formatted en-PH "Mon D, YYYY, h:mm AM" (131-132, 826)
- [ ] Row button "Undo" shown when `undo` is "available" or "blocked"; disabled when blocked or another undo open (828-839)
- [ ] Undo title "Undo #{blocker ?? "the later upload"} first: it changed the same data after this one" / "Put the data back as it was before this upload" (834)
- [ ] Loading row "Loading…" (814)
- [ ] Error row "Not loaded: {error}" / "Not loaded: the backend is not answering (see above)." (354, 812)
- [ ] Empty row "No uploads recorded yet. Checks are not recorded: they change nothing." (817)
- [ ] 12 most recent only (`limit=12`); no sort, no pagination, no filters

**Undo dialog (545-588)**
- [ ] Opening runs a dry-run undo (`?mode=check`) to preview (320-332)
- [ ] Backdrop click cancels unless busy; no Escape handler (548-551)
- [ ] Dialog `aria-labelledby="undo-title"`, title "Undo upload #{id}?" (553-555)
- [ ] File name (556-560)
- [ ] Busy text "Working out what it would change…" (562)
- [ ] Preview error in `.bad` (564)
- [ ] Preview "This takes out the {removed} rows this upload wrote and puts back the {restored} it replaced, everywhere they were published. The data is then as it was before the upload." (567-569)
- [ ] Button "Cancel" (disabled while busy) (574-576)
- [ ] Button "Undo upload" / "Undoing…", disabled while busy, no preview, or preview error (577-584)
- [ ] Result note "Upload #{id} undone: {removed} rows taken out, {restored} put back.{server note}" / "Upload #{id} was not undone." (341-343)
- [ ] Undo errors "The backend at {BACKEND} is not answering." (313), "Undo answered {status}" (316)

**Weekly model retraining (849-904)**
- [ ] Heading "Weekly model retraining" (850)
- [ ] Intro prose + " Next batch: **{date}**." (851-855)
- [ ] States "Loading…" / "Not loaded: {error}" (backend-down variant) / "No batch has run yet." (856-861)
- [ ] Last-batch line "Last batch #{id} · {start} to {finish clock} · {trigger} [status pill] · {summary}" (864-869)
- [ ] Table columns "MODEL GROUP", "RESULT", "DETAIL" (874-876)
- [ ] RESULT pill colours: "retrained" green; "running" blue; "failed"/"restore failed" red; "kept previous"/"cannot run here"/"needs attention"/"interrupted" amber (136-142)
- [ ] DETAIL: reason, each comparison line, up to 2 "Data: {change}" lines unless status "unchanged" (884-888)
- [ ] "Earlier: #{id} {date} — {status}" for older runs (up to 5 more; `limit=6`) (894-900)

**Shared error text from `getData` (148-164)**
- [ ] 401/403: "{server message} — sign in again" (401) or "not authorized ({status})" (157)
- [ ] 404 hint " (restart the backend to pick up this page's endpoints)" (161)

### API endpoints (all via `apiFetch` → bearer token, 401 refresh+replay; all data-analyst-only server-side)
- `GET /api/upload/formats` → `{recordEnd, formats[]}`; on mount + "Try again" (288-290).
- `GET /api/upload/retraining?limit=6` → `{schedule:{day,time,timezone,next}, runs[]}`; on mount + "Try again" (291-293).
- `GET /api/upload/history?limit=12`; on mount, "Try again", after every mode=load upload, after every undo (279-281, 435, 350).
- `POST /api/upload/file` or `/api/upload/file?mode=check`, multipart `FormData` field `"file"` (393-403).
- `POST /api/upload/{id}/undo?mode=check` (preview) then `POST /api/upload/{id}/undo` (confirm) (307-318).
- Not called by page but exists: `POST /api/upload/trigger-training` (upload.routes.ts:87).
- No polling (only the 1 s elapsed counter while uploading).

### localStorage / sessionStorage
- None in page. Layout writes sessionStorage `audit:viewed:/dashboard/data-management`.

### "Never cut" facts
- Accepted types ".csv,.tsv,.json,.xlsx,.xls" (491); intro says "CSV, JSON or Excel" (484).
- "A year of hourly toll data takes one to two minutes." (500)
- Retrain schedule "Every Sunday at 10:00 PM" (852); fallback "on Sunday night" (639); step text "Every Sunday night one batch retrains and re-tests the models whose data changed, and keeps the new ones only if they pass." (610)
- "Loading does not retrain the models." (610) / "Uploads do not retrain the models." (852)
- Record-end rule: "rows dated after {date} (the record's end) are set aside, except air-quality readings" (765-766)
- Destination is "the AWS database" (462); stat labels "(AWS)" (659)
- "Rows already loaded are skipped." (605); "uploading the same file again never doubles it." (526-527)
- "Checks are not recorded: they change nothing." (817)
- Flag threshold comes from server (`threshold`, shown as %), compared per plaza-day (204)
- Observed text inconsistency to keep in mind (not a design note): confirm dialog says "This page cannot undo a load" (526) while the Recent uploads table offers "Undo".

### Visible prose likely to be shortened (verbatim)
- page.tsx:462 "Upload datasets — the ETL pipeline classifies, validates, and loads them into the AWS database"
- page.tsx:470-472 "Nothing replied at `{BACKEND}`, so the upload layouts, the upload history and the retraining status cannot load, and an upload would not go through. Nothing has been deleted: they are in the database. Start the backend with `npm run dev` in the `Back-End` folder, then try again."
- page.tsx:484-485 "Choose a CSV, JSON or Excel file. The pipeline recognises its layout, validates every row, and loads it where the dashboards read it. Check a file first to see exactly what a load would do."
- page.tsx:525-527 "**Check only** runs every step against the warehouse, then undoes it: you see what would load, what would be skipped and why, and nothing is written. **Upload & load** writes it. This page cannot undo a load, though uploading the same file again never doubles it."
- page.tsx:595 "The file is matched against the layouts below by its columns. An unrecognised file is rejected here rather than half-loaded."
- page.tsx:600 "Each quality gate runs in turn: rows off the corridor, unreadable, or after the record's end are set aside with the reason."
- page.tsx:605 "Rows are written, then published to the tables the dashboards read, in one transaction. Rows already loaded are skipped."
- page.tsx:610 "Loading does not retrain the models. Every Sunday night one batch retrains and re-tests the models whose data changed, and keeps the new ones only if they pass."
- page.tsx:852-853 "Uploads do not retrain the models. Every Sunday at 10:00 PM one batch retrains and re-tests each model group whose data changed since it was last trained. New models go live only if they pass the tests; otherwise last week's stay."
- page.tsx:567-569 undo preview sentence (quoted in checklist).

---

## /dashboard/audit-log — Audit Log

**Source:** `app/dashboard/audit-log/page.tsx` (506 lines; local `mapLog` 111-148, `Bars` 151-165, `everyDay` 168-175, `InsightsSection` 177-255). Uses `components/dashboard/PageHeader.tsx`, `lib/table-sort.tsx` (`SortableTh`, `useTableSort`), `lib/cached-json.ts` (`cachedJson`), `lib/backend-auth.ts` (`logActivity`).

**Roles:** data-analyst only (denied to tcc-operator and incident-operator, `lib/auth-access.ts:32,42`). Sidebar label "Audit Log", group "Admin" (layout.tsx:58). No role-dependent content inside (the actor's role is shown as data). Backend `/list` and `/summary` are public reads; `/export` (unused by page) is data-analyst only (`Back-End/src/routes/audit-log.routes.ts:98-110`).

**Tabs / sub-tabs / panels:** No tabs. Stack: header (with insights-period select) → 4 KPI cards → insights error → 6 insight cards → log table with toolbar. State: `days` (default 30), `searchText`, `selectedCategory` ("All"), `selectedSeverity` ("All"), `selectedDateRange` ("All Time"), sort (null = API order). Nothing persisted.

### Checklist

**Header**
- [ ] PageHeader icon ClipboardList, title "Audit Log" (359)
- [ ] Subtitle "Who did what, when, and how the work moves through the system" (360)
- [ ] Header native `<select aria-label="Insights period">`: "Last 7 days" (7), "Last 30 days" (30, default), "Last 90 days" (90) — drives KPIs + insight cards only, not the table (362-366)

**KPI cards (369-398, `.tab-stat-grid.compact`)**
- [ ] "Actions" (Activity icon, tone-blue) (372)
- [ ] "Active users" (Users, tone-green) (379)
- [ ] "Page views" (Eye, tone-purple) (386)
- [ ] "Uploads loaded" (Upload, tone-red) (393)
- [ ] Each shows "—" until summary loads (373, 380, 387, 394)

**Insights**
- [ ] Error line "Insights unavailable: {error}" with AlertCircle, class `audit-warn` (400-402)
- [ ] Card "Activity per day": stacked daily bars (views + actions), every day in period zero-filled (Manila UTC+8 day) (168-175, 185-197)
- [ ] Daily chart `role="img"` `aria-label="Actions and page views per day"`; per-day title "{YYYY-MM-DD}: {a} actions, {v} page views" (189-191)
- [ ] Daily legend "actions" / "page views" with key swatches (198)
- [ ] Card "Activity by module": bars by module label (201-204)
- [ ] Card "Most-used pages": bars by page label, value text "{views} · {users} user|users" (206-209)
- [ ] Card "Where maintenance waits": bars per status, "{span} avg" (211-213)
- [ ] Maintenance note "Scheduled to completed: **{span}** ({completed}) · {open} open" + " · {n} past planned end" + " · {n} late to start" (warn) (214-218)
- [ ] Up to 3 flagged maintenance items "{title}: {flag}, {status} for {age}" (warn) (219-221)
- [ ] Card "Uploads & retraining": "{loaded} loaded · {failed} failed · {undone} undone · {checked} checked" (225-226)
- [ ] "Average load: **{span}**" (227)
- [ ] "Waiting for the weekly retrain: **{n}** (oldest {age}) · next {date}" (228-231)
- [ ] "Last batch {date}: **{status}**" or "No weekly batch has run yet." (232-236)
- [ ] Up to 4 model-group lines "{title}: {outcome}, {date}" (237-239)
- [ ] Card "Most active users": bars "{user} ({role})" (242-248)
- [ ] Empty "No signed-in activity yet." (245)
- [ ] Note "{n} older actions have no user: they were logged before sign-in was recorded." (249-251)
- [ ] Bars empty state "Nothing recorded yet." (153, 187)
- [ ] Bars: label with `title` tooltip, track/fill width relative to max, value text (155-162)

**Table toolbar (406-443)**
- [ ] Search input placeholder "Search logs..." — case-insensitive match on user, details, action (407-411, 305-310)
- [ ] Category select: "All Categories" + one option per category present in loaded rows, sorted A-Z (412-417, 291-294)
- [ ] Severity select: "All Severities", "Info", "Warning", "Critical" (418-423)
- [ ] Date range select: "All Time", "Today", "Last 7 Days", "Last 30 Days" (local-time day starts; 7 days = today−6, 30 = today−29) (424-429, 298-320)
- [ ] Button "Export JSON" (btn-primary) (431)
- [ ] Button "Clear" (btn-danger): resets search + 3 selects (not sort, not insights period) (432-442)

**Table (444-502)**
- [ ] Sortable columns (SortableTh): "ID", "TIMESTAMP", "USER", "CATEGORY", "ACTION", "DETAILS", "SEVERITY" (448-454)
- [ ] Sort cycle per header: asc → desc → cleared (API order) (table-sort.tsx:58-64)
- [ ] Header `aria-sort` ascending/descending/none; arrows "▲" / "▼" / "⇅" (table-sort.tsx:105, 121-123)
- [ ] Header titles "Sort by {label}" / "Sorted by {label}, ascending — click for descending" / "Sorted by {label}, descending — click to clear" (table-sort.tsx:112-118)
- [ ] Empty values sort last in both directions; numeric-aware string compare (table-sort.tsx:24-40)
- [ ] SEVERITY sorts by rank Critical(0) < Warning(1) < Info(2), not A-Z (327, 335)
- [ ] TIMESTAMP sorts as Date (330)
- [ ] ID cell "#{id zero-padded to 3}" monospace (469)
- [ ] TIMESTAMP cell en-US `dateStyle: "medium", timeStyle: "medium"` (470)
- [ ] USER cell: user id + muted role sub-line when `actor_role` present (471-474)
- [ ] CATEGORY cell: lowercase badge; colours: "Sign-in"/"Audit Log" info, "Navigation" purple, "Data Management"/"Model Training" success, "Mobile App" warning, else danger (token pairs, not hex) (475-494)
- [ ] ACTION cell: humanised action + " ({outcome})" when outcome not success/passed (114, 144, 495)
- [ ] DETAILS cell: composed " · " list (title, filename, "Km {start}–{end}", "{from} → {to}" / "→ {to}", duration, "after {span} {from}" for maintenance.status_changed, "{n} rows", "reason: {reason}", page label for page.viewed), fallback target_resource (115-129, 145, 496)
- [ ] SEVERITY pill: "Critical" red, "Warning" amber, "Info" blue (497)
- [ ] Severity rules: Critical = outcome "restore failed" or action `model.restore_failed`; Warning = outcome failed/refused/kept previous/cannot run here/cancelled, to-status cancelled, or action containing "deleted"; else Info (130-137)
- [ ] Loading row "Loading…" (458-460)
- [ ] Error row "Live data unavailable — is the backend running on port 4000?" (461-463)
- [ ] Empty row "No audit events yet — actions like scheduling maintenance will appear here." (also shown when filters match nothing) (464-466)
- [ ] No pagination: up to 500 most recent entries rendered at once (272)

**Export / download**
- [ ] "Export JSON" downloads `audit_logs_{YYYY-MM-DD}.json` (UTC date), MIME `application/json`, pretty-printed (2-space) (338-348)
- [ ] Export contents = rows currently visible (filtered + sorted), in on-screen order, in mapped shape `{id, timestamp, user, role, category, action, details, severity}` (339-340)
- [ ] Export logs activity `{type:"audit.exported", rows, format:"json"}` (349)

**Label maps (drive visible text)**
- [ ] MODULE_LABEL: data_management/upload → "Data Management", maintenance → "Maintenance", mobile_app/mobile_config → "Mobile App", model_training → "Model Training", navigation → "Navigation", session → "Sign-in", audit_log → "Audit Log"; unknown → capitalised domain (65-75, 113)
- [ ] PAGE_LABEL: /dashboard "Overview", traffic "Traffic", incident "Incidents", sustainability "Emissions", map-comparison "Live Map", maintenance "Maintenance", mobile "Mobile App", scenario-sandbox "Scenario Sandbox", data-management "Data Management", audit-log "Audit Log", ai-sandbox "AI Sandbox" (77-89)
- [ ] Duration format `span()`: "{n} s" (<60 s), "{n} min" (<1 h), "{n.n} h" (<48 h), "{n.n} d" (94-103)
- [ ] Insight dates en-PH "Mon D, h:mm AM" (106)

**Data fetched but not rendered**
- [ ] `uploads.undoRefused` and `uploads.lastTrained` in summary type (50-51) are not displayed

### API endpoints
- `cachedJson GET ${BACKEND}/api/audit-log/list?limit=500`, TTL 15 000 ms, stale-while-revalidate; on mount only (271-279). Does not pass `include_views`, so server excludes `page.viewed` rows (`Back-End/src/services/audit-log.service.ts:20`).
- `cachedJson GET ${BACKEND}/api/audit-log/summary?days={7|30|90}`, TTL 15 000 ms; on mount and when period changes (281-289). Server accepts days 1-365, default 30.
- `POST ${BACKEND}/api/audit-log/activity` via `logActivity` (5 s abort) on export (`lib/backend-auth.ts:59-74`).
- Exists, unused by page: `GET /api/audit-log/export` (server file `audit_export.json`, data-analyst only).
- No polling.

### localStorage / sessionStorage
- None in page. Layout writes sessionStorage `audit:viewed:/dashboard/audit-log`. `cached-json` keeps an in-memory module map keyed by URL (not storage).

### "Never cut" facts
- Table holds the latest "500" entries (`limit=500`) (272); insights windows "7 / 30 / 90" days (363-365).
- Date-range filter windows "Today", "Last 7 Days", "Last 30 Days" (local time) vs insights period (separate control).
- Backend port named in error: "port 4000" (462).
- "older actions have no user: they were logged before sign-in was recorded." (250)
- Maintenance flags: "past planned end", "late to start" (216-217); "Km {start}–{end}" in details (119).
- Activity-per-day uses Manila day (UTC+8) and shows quiet days as zeros (167, 170).
- Export filename `audit_logs_YYYY-MM-DD.json` (346).

### Visible prose likely to be shortened (verbatim)
- page.tsx:360 "Who did what, when, and how the work moves through the system"
- page.tsx:250 "{n} older actions have no user: they were logged before sign-in was recorded."
- page.tsx:462 "Live data unavailable — is the backend running on port 4000?"
- page.tsx:465 "No audit events yet — actions like scheduling maintenance will appear here."
- page.tsx:214-218 "Scheduled to completed: {span} ({completed}) · {open} open · {n} past planned end · {n} late to start"

---

## Shared helpers used by these three routes

- `components/dashboard/PageHeader.tsx` (35 lines): props `icon`, `title`, `subtitle`, `actions`, `accent`; renders `header.ds-page-header[data-accent]`, `h1.ds-page-title`, `p.ds-page-subtitle`, `.ds-page-header-actions`. None of the three pages pass `accent`. Mobile passes a "Reload" button, Data Management a status pill, Audit Log the "Insights period" select.
- `lib/table-sort.tsx` (127 lines): Audit Log only. `useTableSort(rows, accessors, initial=null)`; `SortableTh` renders `<th aria-sort>` containing `button.ds-th-sort(.active)` with `title` and arrow span `.ds-th-arrow`.
- `lib/cached-json.ts`: Audit Log only; module-scope cache, TTL, stale-while-revalidate, in-flight de-dupe, failures not stored.
- `lib/api.ts` `apiFetch`/`BACKEND`: Data Management only; attaches Supabase bearer, refreshes once on 401, fires `smartflow:session-lost` window event if refresh fails.
- `lib/backend-auth.ts`: `logActivity` (Audit Log export); `installBackendAuth` (layout) adds bearer to every `fetch` to BACKEND (covers Mobile's plain fetch); `logPageView` sessionStorage `audit:viewed:{path}`, 10-minute throttle, for every route.
- Shared modal markup/classes (Mobile advisory dialog, both Data Management dialogs): `.ds-modal-backdrop[role=presentation]` > `.ds-modal[role=dialog][aria-modal][aria-labelledby]` > `.ds-modal-head` / `.ds-modal-body` / `.ds-modal-foot` (+ `.ds-modal-note`, `.ds-modal-close`, `.ds-modal-foot-note`).
- NOT used by these routes: `lib/toast.tsx` (Mobile has its own inline `.ds-toasts`), `CustomSelect` (Audit uses native `<select>`), `InfoTooltip`, `DateFilter`/`DateRangePicker`.

---


Paths are relative to `Front-End-Dashboard/`. "P" = `app/dashboard/scenario-sandbox/page.tsx`, "SP" = `app/dashboard/scenario-sandbox/components/ScenarioPanel.tsx`, "PL" = `.../components/PlacesList.tsx`, "SFP" = `components/dashboard/ScenarioForecastPanel.tsx`, "FDP" = `components/dashboard/ForecastDayPicker.tsx`.

---

## /dashboard/scenario-sandbox — Scenario Sandbox

**Source files**
- `app/dashboard/scenario-sandbox/page.tsx` (5561 lines; default export `AiSandboxPage`, P:472). It also defines these in the same file: `KmInput` (P:3045), `ZipperControl` (P:3100), `MetricTileBoth` (P:3198), `DirectionPanel` (P:3250), `InterventionControls` (P:3267), `BaselineSteps` (P:3408), `CompareBlock` (P:3483), `DirectionNotes` (P:3538), `MetricTile` (P:3560), `RailSection` (P:3613), `InfoLabel` (P:3781), `ClosureHint` (P:3806), and the canvas renderers `render`/`renderBoth`/`drawCarriageway`/probe/drop-ghost.
- `components/ScenarioPanel.tsx` (1220): the Add-event form, `TimeField`/`TimeSegment`, `NumberField`, `SkipControl`, `EventRow`, `ResolutionBlock`.
- `components/ScenePreview.tsx` (130): animated 2D preview canvas. `components/PlacesList.tsx` (162). `components/FamilyIcon.tsx` (91, decorative SVG icons, `aria-hidden`). `components/DirectionPill.tsx` (17). `components/placement.ts` (258: hotspot fetch, place resolution, `stationLabel`).
- Logic modules the UI shows text from: `useDirectionSim.ts` (per-direction state + 3 fetches), `recommendation.ts` (recommendation text), `zipper.ts` (`REALLOCATION_NAME` = "Lane reallocation" + refusal reasons), `bothMetrics.ts`, `replay.ts`, `scenarios/catalogue.ts` (scenario templates), `scenarios/adapter.ts` (phase, owner and refusal text), `scenarios/assumptions.ts` (numbers), `facilityArt.ts`/`sceneArt.ts` (canvas text), `simulation.ts` (engine).
- Shared imports: `components/dashboard/PageHeader.tsx`, `components/dashboard/ScenarioForecastPanel.tsx` (+ `useScenarioForecast`, `forecastInflowAt`, `forecastIncidentsAt`), `components/dashboard/ForecastDayPicker.tsx`, `components/dashboard/InfoTooltip.tsx`, `lib/nlex-exits.ts` (`useNlexExits`, `displayExitName`), `lib/nlex-lanes.ts` (`lanesForSegment`, `laneSources`), `app/dashboard/traffic/traffic.module.css` (`filterGroup`/`filterLabel`/`segmented`), lucide `Car`.
- **Test coupling:** `scenarios/verify.ts` reads page.tsx and ScenarioPanel.tsx **as source text** and runs regexes against them: 98 `.test(pageSource)` and 36 `.test(panelSource)`. Examples: `data-legend="motorcycle"` plus "from NLEX&apos;s records" (verify:2275); `data-km={testId}`, `testId="realloc-from"`, `data-zipper-note="stretch-error"` (verify:2293); `data-scn="direction-pick"` placed after `className="sandbox-scn-families"` (verify:2311); `data-scn-intensity={o.id}` (verify:2360); exactly one `onClick={() => chooseFocus(dn)}` (verify:2183). A redesign that renames markup will break `verify.ts`.

**Roles**
- Can open: data-analyst, tcc-operator. incident-operator is denied (`lib/auth-access.ts:39`) and redirected to `/dashboard`.
- Sidebar entry: `app/dashboard/layout.tsx:55`, label "Scenario Sandbox", group "Planning", icon `Car`. The audit-log route label is "Scenario Sandbox" (`app/dashboard/audit-log/page.tsx:85`).
- No role-dependent content inside the page. Every fetch is a plain `fetch()` with no auth header (it does not use `apiFetch`/`authedJson`).

**Tabs / sub-tabs / modes / steps** (all React state; nothing goes to the URL or to storage)
- Carriageway view `view`: "Both (NB + SB)" | "Northbound" | "Southbound" (P:105). Default "Both" (P:576). Titles: "Both carriageways at once, median-separated — the whole road" / "Northbound only" / "Southbound only" (P:106-107). Full-screen keys B/N/S also set it.
- Focused carriageway `focusedDirection` (Both mode only; default "NB", P:587). It is set by "Commands apply to", "Add to", a click on the road while a placing tool is armed, and framing a place.
- Side-rail mode `sideMode`: tabs "Controls" | "Command" (P:2459-2476). Default "controls". The rail heading switches between "Simulation Controls" and "Command Prompt" (P:2458).
- Rail accordion `openSection` (at most one open; clicking an open one closes it): "Corridor" (opens by default), "Interventions", "Scenario events", "Baseline comparison", "Confidence run" (P:597-600). Each header shows a summary line while collapsed (P:3641-3646).
- Docked vs full screen `expanded` (P:507). In full screen: rail `railOpen` (default true) and notes `notesOpen` (default false).
- Live vs replay `replayIndex` (null = live, P:772).
- Baseline steps: 1 "Let the road settle" → 2 "Capture the “before”" → 3 "Change something, then read the difference". They tick themselves off (P:3416-3471).
- Scenario "Where" modes `placeMode`: "Most frequent" | "Pick on road" | "At a plaza" | "Km". Default "data" (Most frequent) (SP:614).
- Duration modes `choice`: "Sampled" | "Median" | "90th pct" | "Manual" (SP:149-154). Default "Sampled".
- Sim speed `simSpeed`: 0.5× / 1× / 5× / 10× (P:399). Default 1×.
- Lane reallocation: radio "Off" | "NB +1" | "NB +2" | "SB +1" | "SB +2" (P:3123-3175). Both mode only.
- Forecast following `forecastFollowing`: off until "Load into simulation" is pressed (P:755, P:2093).

### Checklist

**Page header**
- [ ] Title "Scenario Sandbox", icon Car (P:2049-2051)
- [ ] Subtitle template `Agent-based what-if simulation · ${origin} → ${destination} · Km ${fromKm.toFixed(2)}–${toKm.toFixed(2)}` (P:2052)

**Top row (`.sandbox-toprow`, P:2058-2081)**
- [ ] Label "Carriageway" with lane-icon SVG (P:2060-2061)
- [ ] Segmented control `role="tablist"` `aria-label="Carriageway view"`: buttons `role="tab"` with `aria-selected`, check-mark on the active one, labels from `viewLabel`, titles from `viewTitle` (P:2062-2068)
- [ ] Label "Forecast day" + ForecastDayPicker (value, dates, coverageEnd; disabled until forecast data arrives) (P:2072-2079)

**ForecastDayPicker** (`components/dashboard/ForecastDayPicker.tsx`)
- [ ] Trigger button `aria-label="Forecast day"`, `aria-haspopup="dialog"`, `aria-expanded`. Text is the long date or "Pick a day" (FDP:145-158)
- [ ] Popover `role="dialog"` `aria-label="Choose a forecast day"`, position fixed (FDP:161-167)
- [ ] "Previous month" / "Next month" nav buttons (aria-labels). Navigation stops at the first and last covered month (FDP:169-187)
- [ ] Month title, weekday header "Su Mo Tu We Th Fr Sa" (FDP:24, 178)
- [ ] Day buttons: only covered days are enabled, `aria-pressed` marks the selected day. Title `${date} · traffic, incidents & CO₂` / `· traffic & CO₂ only` / "Not in the forecast" (FDP:202-220)
- [ ] Incident-coverage dot on days ≤ coverageEnd (FDP:219)
- [ ] Legend "incidents, traffic & CO₂ (to {date})" / "no dot: traffic & CO₂ only" (shown when coverage is partial) (FDP:226-233)
- [ ] Range "Forecast days: {first} – {last}" (FDP:235-238)
- [ ] Closes on outside click or Escape and returns focus to the trigger (FDP:108-128)

**Forecast card "Simulate a Forecast Day"** (`components/dashboard/ScenarioForecastPanel.tsx`)
- [ ] h3 "Simulate a Forecast Day" and lede "Starts the scenario from what the traffic, incident and emission models predict" (SFP:238-239)
- [ ] Button "Load into simulation" / "Loading…" / "✓ Applied" / "✓ Following forecast". Its title while following: "The road follows the forecast day and time chosen above". Disabled when there is nothing to apply (SFP:242-253)
- [ ] Tile "Corridor volume[ · HH:00]": value `{n} veh`, sub `day {n} veh · {model} · {wmape}% WMAPE` (SFP:259-263)
- [ ] Tile "Segment inflow[ · HH:00]" (accent): `{n} veh/h`, sub `{segmentName} · {share}% of corridor` | "this hour" | "peak hour" (SFP:264-275)
- [ ] Tile "Predicted incidents[ · HH:00]": number, or "No forecast". Sub `day {n} · corridor-wide · {model}` | `incident forecast runs to {date}` | "incident forecast unavailable" (SFP:276-286)
- [ ] Tile "Predicted CO₂": `{n} t`, sub `{model} · {wmape}% WMAPE` (SFP:287-293)
- [ ] Foot "Fleet mix: Class 1 x% · Class 2 x% · Class 3 x%[ · heavy-vehicle surge day][ · model]" (SFP:297-303)
- [ ] Foot "Highest risk:" top 3 exits `{exit} ({n}/day)` (SFP:304-312)
- [ ] Toggle "What gets loaded?" / "Hide detail" (SFP:313-315), revealing the help paragraph (SFP:318-343)
- [ ] Backend `notes[]`, each rendered as a `.sandbox-forecast-note` paragraph (SFP:345-349)
- [ ] Error state: the whole card is hidden when the fetch failed and no data exists (SFP:213)
- [ ] Following the forecast also drives hotspot auto-framing and the incident-coverage flag (P:915-928)

**Metric tiles** (docked above the grid; inside the card in full screen; P:1949-2045, 2096)
- [ ] Both-mode caption: "Corridor totals with NB and SB beneath. **Average speed is flow-weighted** — each direction's speed weighted by its throughput, not a plain mean of the two. Longest queue is the worse of the two; density has no total." (P:1956-1959)
- [ ] Both tile "Active agents", tag "total", title "Vehicles on the road now, both carriageways added." (P:1963-1969)
- [ ] Both tile "Avg speed", tag "flow-weighted", title "Each direction's average speed weighted by its throughput (vehicles per minute) — not the plain mean of the two." Value `{n} km/h` or "—" (P:1970-1982)
- [ ] Both tile "Throughput", tag "total", title "Vehicles per minute completing the segment, both carriageways added." Value `{n}/min` (P:1983-1991)
- [ ] Both tile "Longest queue", tag "max", title "The longer of the two queues. Queues do not add across carriageways: two 80 m queues are not a 160 m one." Value `{n} m` (P:1992-1999)
- [ ] Both tile "CO₂ rate", tag "total", title "kg of CO₂ per minute, both carriageways added." Value `{n.1} kg/min` (P:2000-2007)
- [ ] Both tile "Density", tag "per direction", title "Vehicles per km per lane on two separate carriageways has no meaningful total or mean, so none is shown." Total shows "no total". Rows `{n}/km/ln` (P:2008-2014, 3227)
- [ ] Both tile internals: per-direction rows (DirectionPill + value + delta chip "+N%" / "≈"), headline delta "+N% vs baseline" / "≈ baseline". Tones up/down/muted; `goodWhenUp` for speed and throughput (P:3216-3245)
- [ ] Single-direction tiles: "Active agents", "Avg speed", "Throughput", "Longest queue", "CO₂ rate", "Density", with the same units and "+N% vs baseline" / "≈ baseline" deltas (P:2017-2042, 3560-3591)
- [ ] Loading placeholder "…" in every tile (P:1967ff)

**Simulation card head** (P:2118-2203)
- [ ] h2 "Traffic Simulation" (P:2120)
- [ ] Live clock (only once an hour is set): label "Simulation time", weekday date (e.g. "Mon, Jan 5", rolls past midnight), editable `TimeField` HH:MM:SS from 00:00:00 to 23:59:59, step 1 s, `scn="sim-time"`. Editing the hour reseeds that hour's demand; minutes and seconds only move the start point (P:2121-2141)
- [ ] Speed buttons "0.5×" "1×" "5×" "10×" (active class) (P:2143-2149)
- [ ] Primary button "Play" / "Pause" / "Back to live" (while reviewing it jumps to live and resumes) (P:2150-2160)
- [ ] "⟲ Replay incident", title "Replay the last incident or closure on this carriageway". Shown only when the recording holds an event or review is active. It starts 8 frames before the event (P:2165-2181)
- [ ] "Reset", title "Back to a clean start: scenarios, closures, speed limits, incidents, baselines and any lane reallocation are all cleared". Keeps route, Lanes/Inflow sliders and view (P:2182-2184, 1101-1127)
- [ ] Full screen only: "Hide controls" / "Controls", title "Show or hide the controls (C)", `aria-pressed` (P:2185-2194)
- [ ] "Full screen" / "Exit full screen". Titles "Expand the road to fill the screen" / "Exit full screen (Esc)" (P:2195-2201)

**Replay review row** (only while reviewing; P:2212-2258)
- [ ] Badge "Reviewing" (P:2227)
- [ ] "◀" title "One frame back"; "▶" title "One frame forward" (P:2229-2241)
- [ ] Range slider 0..replayLen-1, `aria-label="Scrub through the recording"` (P:2231-2239)
- [ ] Status "reviewing" / "at the latest frame" / `{x.x}s behind live` (P:2246-2252)
- [ ] "Back to live" button (P:2254-2256)
- [ ] One recording per carriageway; the engine keeps running underneath (P:768-771, 1289-1297)

**Full-screen HUD row** (P:2266-2308)
- [ ] Carriageway tablist `aria-label="Carriageway view, full screen"`, "Carriageway" label, same 3 buttons (P:2269-2285)
- [ ] "Forecast day" + second ForecastDayPicker (P:2286-2295)
- [ ] Key hint "**Space** play/pause · **1–4** speed · **B/N/S** carriageway · **C** controls · **Esc** exit" (P:2296-2298)
- [ ] Toggle "Notes, legend & recommendation" / "Hide notes", `aria-expanded` (P:2299-2305)
- [ ] `--fs-top` CSS var set from the HUD's measured height (P:516-528); a placeholder holds the docked height (P:2100); page scroll is locked while open (P:821-826)

**Notes above the canvas**
- [ ] Placement note `[data-place-note]` (Both mode, docked only) (P:2310-2314). Strings: "Click a lane, a booth or a pump on the {northbound|southbound} carriageway." (P:1456, 2812); "That is the median, the km axis or the verge — click a lane on either carriageway." (P:1503); drop result `${line}.` (P:1620); "Open Scenario events to place one." (P:1623)
- [ ] Both-mode explainer `.sandbox-live-note` (P:2315-2323; quoted in Prose)

**Main canvas: road simulation (2D `<canvas>`, not 3D)** (P:2343-2375)
- [ ] `canvas.sandbox-canvas`, plus class `placing` when armed and `is-drop-target` while a chip is dragged. Docked min-height is computed from the lanes and gutters (P:2345-2361)
- [ ] Click: places a closure (two clicks, start then end), resolves a "Pick on road" pick, or pins/unpins a vehicle's speed bubble (P:1446-1587, 1323-1333)
- [ ] Hover: vehicle probe bubble `{n} km/h`, `{Car|Bus|Truck|Motorcycle} · Lane n` (or the plaza name), "click to pin" / "click to unpin". Cursor is a pointer over a vehicle (P:3705-3769, 1200-1207)
- [ ] Mouse move previews the closure stretch after the first click (P:1628-1641)
- [ ] Drag-over/drop of scenario chips (type `application/x-smartflow-scenario`) with a drop-ghost ring and text: `{name}: drop it on a lane, a booth or a pump` / `{name} happens on a lane, not at {facility}` / `{name} → {facility} · {booth|pump n | on the ramp}` / `{name} → {Northbound|Southbound} · Lane n · Km x.xx` (P:1591-1625, 5303-5332)
- [ ] Single direction: one carriageway drawn full height. Both: SB above and NB below a median stripe, lane 1 against the median on each side (P:1262-1314, 228-307)
- [ ] Lane tags "L1".."Ln" (red when closed; a lent lane reads "NB L1"/"SB L1") (P:4482-4498)
- [ ] Km axis chips + "KM POST" label (single: outside the road; Both: shared in the median) (P:4876-4932, 5378-5389)
- [ ] Flow label "▶ traffic flow" (NB/single) / "traffic flow ◀" (SB) (P:5049, 5174, 5206)
- [ ] Corner location label. Single: `{Northbound|Southbound} · Km a–b · x.xx km · near {exit}` (P:713-715). Both: "Northbound"/"Southbound" (P:5175, 5207)
- [ ] Exit ramp tags `{exit} · Km {km}` (P:4848)
- [ ] Closure preview "Closure stretch · close a lane to apply" (P:4317); draft label `Km a → click the end` / `Km a – b` (P:4352)
- [ ] Red congestion bands per lane below 8 m/s (~29 km/h), darker when slower (P:4386-4410)
- [ ] Operator incidents as a red "!" dot (P:4712-4726); scenario events as an amber hazard "!" triangle (faint while pending) plus label `{name} · {Starts in m:ss | Running | {phase} · m:ss left}` (P:3825-3920; adapter:1397-1402)
- [ ] Scene art: stalled/crashed vehicles, responders, cones, work zone, flood water, rain, speed-limit sign with km/h number (sceneArt.ts:1309)
- [ ] Toll plazas / service areas in the gutter. Labels: `Service area: {name}`, `{in} in · {open}/{total} pumps`, `{name} · Km x.xx`, `{open}/{n} booths`, `{q} queued`/"no queue", `wait {t}`. Colour turns red when booths are shut and amber at ≥6 queued (facilityArt.ts:650-681); "SHOP" (facilityArt.ts:463); highlight outline while the panel targets a facility (P:727, 739-741)
- [ ] Lane reallocation drawing: movable barrier, crossovers, borrowed lanes labelled "REALLOCATED", median banner `LANE REALLOCATION · {NB} +n lane(s), {SB} −n · Km a–b · {NB} CROSSES INTO {SB} LANE 1 / LANES 1–2 AT EACH END` (P:5135-5153, 5199)
- [ ] Day/night asphalt (night `#20293a`, dawn, day, dusk keyframes) driven by the sim clock (P:3939-3977)
- [ ] Motorcycles drawn for 1.28% of Class 1 (P:2416)
- [ ] Vehicle sprite colours by class; brake lights

**Footbar under the canvas** (`.sandbox-footbar`, folded in full screen unless notes are open; P:2383-2452)
- [ ] Warm-up note: "Warming up — the road is still filling, so these figures are not yet the scenario. {n}s to go." (P:2396-2401). Both mode: one per direction with a pill (P:3543-3548)
- [ ] Unmet-demand warning (`.warn`): "{n} veh/h of demand cannot enter: the segment is at capacity and the queue for it forms upstream, outside this model. The speeds shown describe only the traffic that got on." (P:2402-2408, 3549-3555)
- [ ] Legend: "Class 1 · light (car)", "Class 2 · medium (bus)", "Class 3 · heavy (truck)", `Motorcycle · {1.3}% of Class 1, from NLEX's records` `[data-legend="motorcycle"]`, red "stopped / incident", amber "scenario event" (P:2411-2420)
- [ ] Before/after table `CompareBlock`: header "[pill] Baseline vs now", `{takenWith} → {interventionSummary}`; columns "Before" / "After"; rows "Avg speed" (km/h), "Throughput" (/min), "Longest queue" (m), "CO₂ rate" (kg/min, 1 dp); delta "+N%" coloured good/bad per metric direction, or "—" (P:3483-3535)
- [ ] Both-mode empty state per direction: "[pill] no before/after yet — capture a baseline, then change something on this carriageway." `[data-compare-none]` (P:2428-2430)
- [ ] "Prescriptive recommendation" box with tone class good/warn/bad and the text from `recommendation.ts`. Both mode: one per direction with a long pill `[data-reco]` (P:2437-2451)

**Side rail header** (P:2457-2477)
- [ ] h2 "Simulation Controls" / "Command Prompt"; tabs "Controls" / "Command" (`role="tab"`, `aria-selected`)

**Rail section "Corridor"** (summary `{origin} → {dest} · {view} · {n} lanes · {inflow} veh/hr`; P:2481-2747)
- [ ] Select "Origin": options `{exit} (Km {km})`, sorted by km; the current destination is disabled (P:2490-2499)
- [ ] Select "Destination": same format; the current origin is disabled (P:2500-2509)
- [ ] Inflow slider: label "Inflow" or `Inflow (NB|SB)` with an info tooltip that reads `Loaded from the forecast for {Mon d, yyyy}.` / `Observed NLEX peak ≈ {n} veh/hr.` / "Vehicle entry rate.". Value `{n} veh/hr`. Range **1000–8000 veh/hr, step 100**, default 4500 (P:2511-2536)
- [ ] Both mode: second Inflow slider for the other direction, same range (P:2542-2561)
- [ ] Collapsible "Along the route" button (`aria-expanded`, chevron); value shows the focused direction's name (P:2569-2584)
- [ ] PlacesList key: "Toll plaza" Entry / Exit / Barrier; "Service area" Fuel (PL:249-260)
- [ ] PlacesList list (`role="list"`, aria-label `Junctions and service areas, {direction}`): row km (1 dp), name button, kind chips. Titles `Frame the window on {name} (Km x)…` / "Click again to cancel" / `Show the road from Km a to Km b`. Rows on screen get class `is-on`; the anchor gets `is-anchor`; auto-scrolls to the on-screen row (PL:261-305)
- [ ] Two-click junction span (first click frames, second spans, same one cancels) (P:665-675)
- [ ] Button "Fit whole route", title "Widen the drawn window to the whole origin-to-destination route, as far as it can still be drawn legibly." (P:2599-2602)
- [ ] Hint `Km {x} picked. Click another junction to show the road between them, or the same one to cancel.` / the default hint with the OSM credit (P:2604-2608)
- [ ] Read-only "Carriageway" status with a long info tooltip. Value `Both (focused: Northbound|Southbound)` or the direction name (P:2619-2628)
- [ ] "Segment" label with info `Route runs Km a–b.[ Nearest exit: X.] Changing the segment resets the run.`. Value `{x.xx} km` (P:2630-2640)
- [ ] "From km" / "To km" number inputs (`KmInput`, step 0.05, commit on blur/Enter, Esc reverts; `data-km="window-from"` / `"window-to"`) (P:2641-2662, 3045-3094)
- [ ] Segment hints: hotspot open note, too-fine-to-draw note, 3 km cap note (P:2666-2679; quoted in Facts)
- [ ] "Lanes" label with info `laneInfo` (P:1851). Value green when it comes from the road, amber otherwise; `NB n · SB n` in Both (P:2684-2690)
- [ ] Lanes provenance note `[data-lanes-note]` (4 variants, P:1843-1850)
- [ ] "Change lanes" / "Done" toggle (`aria-expanded`) (P:2693-2695)
- [ ] "Back to the road's", title "Put each carriageway back to the lane count the road has here" (only when set by hand) (P:2696-2700)
- [ ] Lanes slider(s) `Lanes` / `Lanes (NB|SB)`. Range **2–5, step 1** (max becomes 6 while a reallocation is on). Both mode adds a second slider (P:2703-2745, 1009)

**Rail section "Interventions"** (summary `[Lane reallocation: NB +n · ]{summary}` or `NB: … · SB: …`; summary text is `L1, L2 closed · Km a–b · n incidents · N km/h zone · {event — phase}` or "none applied"; P:2749-2787)
- [ ] Both mode: one panel per direction (DirectionPill + info "every control in this panel changes this carriageway only") (P:2762-2767, 3250-3260)
- [ ] "Close a lane (traffic must merge out)" + tooltip "A closure applies to closed lanes only — pick L1 to L4 above to apply it." (P:3281-3284)
- [ ] Lane toggle buttons "L1".."Ln" (class `closed`). Disabled when locked by an event, with title `Driven by: {event — phase}` (P:3285-3297)
- [ ] Label "Closed from Km a to Km b · {n} m" (P:3300-3303)
- [ ] Locked note "Driven by: {owner}. The stretch is locked. You can close more lanes on it; the lanes the event blocks stay closed until it moves on." (P:3304-3309)
- [ ] Closure "From km" / "To km" KmInputs (disabled while an event owns the closure) (P:3310-3319)
- [ ] Button "Set stretch" / "Click start…" / "Click end…", title "Traffic merges out before the start and the lane reopens after the end. Type the Km range above, or press this and click the road twice — start, then end." (P:3332-3339)
- [ ] Button "Clear incidents ({n})" (only when n > 0) (P:3340-3344)
- [ ] Closure hint "Click the road where the closure starts · Esc to cancel" / `Starts at Km x.xx — now click where it ends · Esc to cancel` (P:3806-3812)
- [ ] "Speed limit zone": value "off" or `{n} km/h` (P:3350-3353)
- [ ] Speed-zone locked note "Driven by: {owner}. The zone and its limit are locked until the event ends." (P:3355-3359)
- [ ] Speed slider **20–100 km/h, step 5; 100 = off**, title "Slide to 100 to disable the zone." (P:3360-3371)
- [ ] "Zone from km" / "Zone to km" KmInputs (only while a limit is set) (P:3376-3391)

**Lane reallocation (`ZipperControl`, Both mode only, inside Interventions; P:3100-3186)**
- [ ] Label "Lane reallocation" + info `REALLOCATION_INFO` (P:3132, 3791-3796). Value "off" / `NB +n`
- [ ] Stretch "From km" / "To km" KmInputs (`data-km="realloc-from"` / `"realloc-to"`) (P:3137-3147)
- [ ] Stretch error `[data-zipper-note="stretch-error"]`: zipper.ts reasons ("Enter a km post for both ends of the stretch.", `The stretch must lie inside the route, Km a to Km b.`, `The stretch must be at least 0.10 km (it is x km).`, `The sandbox simulates at most 3.00 km at once; x km is too long.`) (P:3148-3152; zipper.ts:113-121)
- [ ] Radiogroup `aria-label="Move lanes between the carriageways"`: "Off", "NB +1", "NB +2", "SB +1", "SB +2". Disabled with the reason as title (`{X} would drop to n lanes; a carriageway keeps at least 2.` / `would rise to n lanes; the most a carriageway takes here is 6.`), else `{NB} takes n lane(s) from {SB}` (P:3154-3176; zipper.ts:44-50)
- [ ] Active-state hint `Km a–b: NB n lanes · SB n lanes (was a + b). {X}'s lane 1 is the reallocated lane, against the barrier. Changing either Lanes slider ends it.` (P:3179-3183)
- [ ] Turning it on moves the simulated window to the stretch; Off restores the window (P:1027-1060)

**Rail section "Scenario events" (ScenarioPanel; summary `none` / `n events · NB n · SB n` / `n events · {active text | none running}`; P:2789-2826)**
- [ ] Label "Add a real-incident scenario" + hint "Drag one onto the road to put it there, or choose it and set where below." (SP:816-819)
- [ ] Family chips (draggable buttons with icon, title `Drag onto the road to place {name} there`), in this order: "Breakdown in a lane", "Breakdown on the shoulder", "Minor collision", "Multi-vehicle collision", "Self accident", "Overturned vehicle", "Rain", "Flooding", "Scheduled roadworks" (SP:820-841; catalogue.ts:463-474)
- [ ] Unsupported-family slot: disabled chip + "Not yet built" badge, title `Not yet built: {needs}` (the list is currently empty) (SP:842-847; catalogue.ts:600, 608)
- [ ] Both mode "Add to" tablist `aria-label="Add the event to which carriageway"`: "Both" (rain and flooding only) / "Northbound" / "Southbound". Note "This happens on one carriageway: choose which." / "Applies to both carriageways: one event is added to each, at the same place and time." / `Only {X}. Choose Both to add it to each carriageway.` (SP:849-881)
- [ ] ScenePreview canvas (`aria-label="Preview of the selected scenario"`): an animated 3-lane, 120 m 2D preview that cycles phases every 3.6 s and freezes under prefers-reduced-motion (ScenePreview:34-47, 85, 102, 146)
- [ ] Info "i" button: `aria-label="About {name}"`, `aria-expanded`, title "Hide the description" / `About {name}`. Popover `role="note"` with name + description; Esc closes (SP:883-906)
- [ ] Rain only: radiogroup `aria-label="Rain intensity"`, "How hard is it raining?", "Light" / "Moderate" / "Heavy", each titled `Caps traffic at N km/h`, plus the cap note (SP:908-929)
- [ ] Breakdowns: "Vehicle" select ("Car / light vehicle", "Bus", "Truck") and "Cause" select ("Tire failure", "Engine fault", "Mechanical fault", "Out of fuel", "Electrical / battery") (SP:932-950; catalogue.ts:286-295)
- [ ] Minor collision: "Collision type" select ("Rear-end", "Side-swipe", "Hit and run") (SP:952-960)
- [ ] "Where" radiogroup `aria-label="Where the event happens"`: "Most frequent" (title "Where the incident log records this kind of event most often on this stretch"), "Pick on road" ("Click a lane, a toll booth or a pump on the road"), "At a plaza" ("At a toll plaza's booths, a service area's pumps, or on a ramp"; disabled title "No toll plaza, ramp or service area on this stretch for this carriageway — widen the window, or frame one from the Corridor section."), "Km" (SP:963-988)
- [ ] Hotspot candidates (top 5 buttons): label `Km a–b · Lane n` or `{plaza} · booth n` / " · before the booths" / " · on the ramp"; detail `{n} recorded, x% of those in a lane were in Lane n` / `{n} recorded at {name} ({toll plaza|interchange|service area})` (SP:990-1001; placement.ts:136-183)
- [ ] Hotspot source line `{n} recorded on this stretch of the {northbound|southbound} carriageway, {from} to {to}. Source: {source}. {note}` (SP:1002-1007)
- [ ] Pick button "Pick on road" / "Pick again" / "Cancel picking" (SP:1011-1017)
- [ ] At a plaza: "Place" select `{name} · Km x.xx`; station checkboxes `Booth n (nearest the expressway)` / `(median side)` / `(outer side)` / `Pump n`; approach checkbox "Before the booths (the plaza's approach)" / `On the ramp before the {pumps|booths} — blocks all of them`; untolled hint "An untolled ramp: the event blocks the ramp itself, single file, so everything using it stops." (SP:1019-1050; placement.ts:254-258)
- [ ] Km mode: "Position (km)" number field (window range, step 0.05, 2 dp) (SP:1052-1059)
- [ ] Place notes: "Reading the incident log…", "Nothing of this kind is recorded on this stretch — pick a place yourself.", "Click a lane, a booth or a pump on the road.", `Picked: …`, "Busiest 100 m of this stretch for this kind of event in the incident log.", `Where the log records this kind of event most…`, "No toll plaza, ramp or service area on this stretch for this carriageway.", hotspot fetch errors (SP:1060-1061; placement.ts:101-104, 143, 178-180, 209-231)
- [ ] "Lane" select "Lane 1".."Lane n" (not for shoulder breakdowns, rain or site events) (SP:1064-1075)
- [ ] "Extra lanes" (multi-vehicle, overturned, flood, roadworks; shown after a lane is picked) with tooltip; per-lane select, "×" remove (`aria-label="Remove lane n"`), "+ Add lane" (SP:1076-1126)
- [ ] "Start (time of day)": TimeField HH:MM (Hour/Minute segments with ▲▼ buttons labelled "Hour up"/"Hour down" etc., ArrowUp/Down keys). Minimum is the clock start, maximum 23:59. Title `The road is simulated at the flow of the hour chosen in Hour of day, so the clock starts at HH:MM: an event can start then or later that day.` Default start is 1 min after the clock start (SP:1127-1138, 215-334, 580)
- [ ] "Duration" with the 4 choice buttons, or the manual-only note (SP:1139-1152)
- [ ] "Redraw" (Sampled only), title "Draw again from the same calibrated distribution" (SP:1153-1157)
- [ ] "Minutes" field (Manual): **0.1–1440, step 1**, default 30 (SP:1158-1163, 581)
- [ ] Resolution block: headline `{x} min · {sampled|median|90th percentile|entered by you}`, `Level: {cause × vehicle|cause|vehicle|collision type|family} · n = N`; badges "No NLEX calibration data — duration is operator-set.", `Low sample (n = N)`, `Capped at x min (from level)`; detail `Drew x min. The cap is the 99th percentile of the {level} level (n = N).` (SP:380-396; adapter.ts:1267-1284)
- [ ] Preview phase list `{phase} — x min` / `— 0 min (skipped)` (SP:1165-1171; adapter.ts:243)
- [ ] Refusal warning (live verdict or last refusal), e.g. `Cannot add "{name}": …`, `{NB|SB}: Clear your manual lane closure first — this event needs the closure stretch.` (SP:1173-1178; adapter.ts:84-89, 601-635, 669-679)
- [ ] Add button "Add event" / `Add to {Northbound|Southbound}` / "Add to both carriageways"; disabled while refused (SP:1179-1183)
- [ ] Events list heading `Events · time of day, the clock starts at HH:MM` (" next day" after midnight); in Both mode it is grouped per direction (long pill + `n event(s)`) (SP:1185-1217, 198-205)
- [ ] "Skip to next phase", title "Fast-forward without drawing to the next phase change of any event.", with estimate `≤ ~{45 s | 2 min 40 s | 1 h 12 min}` (class `is-heavy` when > 2 min) (SP:479-497)
- [ ] Skip confirm (estimate > 120 s): "This skip may take up to about {t} of real time" + explanation + "Skip anyway" / "Not now" (SP:451-477)
- [ ] Skip progress "Skipping · {label}" + "Cancel" + progress bar (`role="progressbar"`) + `{x} of {y} simulated min done · {z} min left` (SP:411-428, 398-407)
- [ ] Event row: [pill in Both], name, status chip "Not running" / `Starts in m:ss` / "Finished" / "Active", "Remove" button (SP:544-552)
- [ ] Event meta `{Lane n | Shoulder | Corridor-wide · N km/h cap | {facility} · {booth n | on the ramp | before the booths}} · Km x.xx · starts HH:MM` (SP:530-542)
- [ ] Event progress bar with phase ticks; active line `{phase} · m:ss left · m:ss left in the event` (SP:554-560)
- [ ] Per-event resolution block + phase list (current phase `is-now`, skipped phases `is-skipped`) (SP:561-568)
- [ ] Suspended notes "Speed zone suspended — operator speed limit active" / "Closure suspended — operator lane closure active"; "Not running: {problems}" (SP:569-574; adapter.ts:777-786)

**Rail section "Baseline comparison"** (summary `{n} km/h · {n}/min captured` / "not captured" / `NB captured · SB not captured`; P:2828-2856)
- [ ] Lede "Measures what an intervention costs, by comparing the road before and after it." (P:2844-2846)
- [ ] Both mode: one panel per direction, info "its own warm-up, baseline and before/after" (P:2849)
- [ ] Step 1 "Let the road settle" + "Throughput counts vehicles finishing the segment, so it needs about a minute of running before it means anything. {n}s to go." (P:3416-3428)
- [ ] Step 2 "Capture the “before”": "Recorded {n} km/h · {n}/min with {takenWith}." (takenWith defaults to "a clear road") / "Freezes the current numbers for comparison. Nothing in the simulation changes." (P:3430-3441; useDirectionSim.ts:729-737)
- [ ] Button "Capture baseline" / "Re-capture" (disabled with no metrics); "Clear" (P:3442-3451)
- [ ] Step 3 "Change something, then read the difference": "Comparing {takenWith} → {summary}. The before/after table is under the road." / "Close a lane or set a speed limit in Interventions above. A before/after table then appears under the road." (P:3455-3471)
- [ ] Step markers "1"/"2"/"3" → "✓", classes `is-done` / `is-now` (P:3413-3417)

**Rail section "Confidence run"** (summary `running N%` / `{runs} runs · {mean} ± {ci} km/h` / "not run"; P:2858-2934)
- [ ] Lede "Re-runs the current scenario on independent seeds and reports a 95% confidence interval, so you can tell a real effect from noise." (P:2873-2876)
- [ ] "Runs" slider **3–20, step 1, default 10**, disabled while running; value in bold (P:2877-2885)
- [ ] Button "Run" / "Stop". Disabled in Both mode or when timed events exist. Progress `N%` (P:2887-2897)
- [ ] Warnings "Confidence runs support one carriageway at a time." `[data-reps="both-disabled"]` / "Confidence runs don't yet support timed events." (P:2899-2905)
- [ ] Results table rows: "Avg speed" (km/h, 1 dp), "Throughput" (/min, 1 dp), "Longest queue" (m, 0 dp), "CO₂ rate" (kg/min, 2 dp), each `mean ± ci95 unit` (P:2906-2920)
- [ ] Unmet warning "{n} veh/h of demand could not enter the segment — the queue for it forms upstream, outside this model, so the speeds above describe only the traffic that got on." (P:2921-2927)
- [ ] Method note "{runs} runs × {secondsPerRun}s, first {warmupS}s discarded as warm-up. Intervals are Student's t at 95%." (P:2928-2931)

**Command tab (natural-language agent; P:2937-3026)**
- [ ] Lede "Type natural-language commands to control traffic on the NLEX corridor." (P:2939-2941)
- [ ] Both mode: "Commands apply to" tablist `aria-label="Carriageway the command applies to"`, buttons "Northbound" / "Southbound" (P:2946-2963)
- [ ] Textarea (4 rows), placeholder `Try: "From Balintawak close lane 4" or "Set 2 lanes open"` (P:2964-2970)
- [ ] Button "Execute Command" / "Interpreting…"; disabled when empty or busy (P:2971-2977)
- [ ] Error line: backend `message`, `Request failed ({status}).` or "Could not reach the backend. Is it running on port 4000?" (P:2979, 1720, 1726)
- [ ] Proposal card: Both-mode target "[pill] proposal — Apply changes this carriageway only" `[data-plan-direction]`; model reply; action list (from describeAction: `Close lane …`, `Reopen lane …`, "Remove the speed limit", `Set a N km/h speed limit`, `Place an incident in lane n, x% along the segment`, "Clear all incidents", `Set inflow to N veh/h`, `Rebuild the road with n lanes`, `Set the route A → B`) or "No actions to apply."; `Not applied: {unsupported}`; warnings (P:2983-3008, 444-468)
- [ ] Buttons "Apply" (disabled with no actions) and "Discard" (P:3009-3020)
- [ ] Result note: `Applied: … .` / "Nothing to apply." / ` Not applied: … .`; resize special case `Applied: n lanes. Rebuilding the road clears existing interventions, so n other action(s) … not applied — re-issue them now.`; owner refusals `Lane n stays closed (driven by …)` / `The speed zone is driven by …` (P:3024, 1747-1822)

**Keyboard / interaction**
- [ ] Full screen: Space play/pause; 1–4 speed; B/N/S view; C rail; Esc exit. Keys are ignored while typing in an input (Esc blurs it) (P:793-817)
- [ ] Esc disarms any armed placing tool (P:1662-1673)
- [ ] KmInput/NumberField: Enter commits, Esc reverts; TimeSegment ArrowUp/ArrowDown step; ForecastDayPicker Esc closes; scenario info popover Esc closes
- [ ] Only one placing tool armed at a time; changing focus disarms (P:966-994)

**ids / data-* / aria the code and tests rely on**
- [ ] `data-metric-caption`, `data-metric`, `data-metric-tag`, `data-metric-dir`, `data-place-note`, `data-compare-none`, `data-compare`, `data-reco`, `data-note`, `data-legend="motorcycle"`, `data-both`, `data-places`, `data-lanes`, `data-lanes-note`, `data-km` (window-from / window-to / realloc-from / realloc-to), `data-zipper`, `data-zipper-stretch`, `data-zipper-note` (stretch-error / state), `data-zipper-option`, `data-cmd="direction"`, `data-plan-direction`, `data-reps="both-disabled"`, `data-dir-panel`, `data-dir` (pill), `data-place` (PlacesList)
- [ ] ScenarioPanel `data-scn` values: panel, drag-hint, direction-pick, direction-note, info, description, intensity, rain-cap, vehicle, cause, label, place, hotspots, hot-source, pick-arm, site, site-id, stations, site-approach, km, place-note, lane, extra-lanes, extra-lane-i, remove-extra-lane-i, add-extra-lane, start-h/-m, manual-only-note, redraw, manual-min, preview-phases, refusal, add, skip, skip-est, skip-warn, skip-confirm, skip-decline, skip-progress, skip-cancel, skip-text, remove, event-time, suspended, badge-no-cal, badge-low, badge-capped, preview-canvas, sim-time-h/-m/-s. Also `data-scn-family`, `data-scn-dir`, `data-scn-intensity`, `data-scn-place`, `data-scn-hot`, `data-scn-station`, `data-scn-duration`, `data-scn-event`, `data-scn-group`, `data-scn-skip-est`
- [ ] CSS hooks used by layout code: `--fs-top`, `--range-pct`, classes `is-expanded`, `with-rail`, `is-both`, `is-folded`, `sandbox-hud-top` (`display: contents` while docked)

**Behaviour notes (existing facts, not proposals)**
- [ ] The key hint says "1–4 speed", but the handler maps 1→0.5, 2→1, 3→2, 4→4 and applies only values in SPEED_STEPS [0.5, 1, 5, 10]. Keys 3 and 4 do nothing (P:805-809)
- [ ] The placement note renders only in Both mode while docked (P:2310). In single-direction mode, pick and refusal notes are not shown
- [ ] The too-fine hint promises a "density view", but no density renderer was found in page.tsx
- [ ] The Start field title refers to an "Hour of day" control. The hour is now set via the "Simulation time" clock

### API endpoints (all plain `fetch`, no auth header, `BACKEND = NEXT_PUBLIC_BACKEND_URL ?? http://localhost:4000`; no setInterval polling)
| # | Method + path | Params / body | Caller | When |
|---|---|---|---|---|
| 1 | GET `/api/map-comparison/exits` | — | `lib/nlex-exits.ts:111` (`useNlexExits`) | once per page load (module cache); falls back to `FALLBACK_EXITS` on failure or a malformed response |
| 2 | GET `/api/emissions/fleet-profile` | `cache: no-store` | P:871 | on mount; reads `data.factors[].vehicle_class/co2_g_per_km`, `data.mix`; fails silently (sim defaults) |
| 3 | GET `/api/ai-sandbox/scenario[?date=YYYY-MM-DD]` | date | `ScenarioForecastPanel.tsx:164` (`useScenarioForecast`) | on mount + every forecast-day change |
| 4 | GET `/api/ai-sandbox/demand-profile?exit={nearest exit}&direction=NB\|SB` | `no-store` | `useDirectionSim.ts:196` (×2, one per direction) | when the nearest exit changes; the first `peakHour` seeds the hour |
| 5 | GET `/api/ai-sandbox/plaza-flows?direction=NB\|SB` | `no-store` | `useDirectionSim.ts:220` (×2) | on mount |
| 6 | GET `/api/traffic/analytics?months=12&direction=NB\|SB` | `no-store` | `useDirectionSim.ts:284` (×2) | on mount; uses `byPlaza[].plaza/v`, `kpis.days` |
| 7 | GET `/api/ai-sandbox/hotspots?family&direction&fromKm&toKm` | `no-store` | `placement.ts:96` (`useHotspots`) | in "Most frequent" mode for the 6 logged families; on family/direction/window change |
| 8 | POST `/api/ai-sandbox/command` | JSON `{command, context:{laneCount, segmentLengthM, closedLanes (1-based), speedLimitKmh, incidentCount, exits:[{exit_id, exit_name}]}}` → `data:{actions, reply, unsupported, warnings}` | P:1694 (`runCommand`) | on "Execute Command"; parsed by GLM server-side (`Back-End/src/services/sandbox-command.service.ts`, P:831-835) |
- Engine metrics refresh every 0.25 s of real time inside the rAF loop (P:1249-1258). The physics step is 0.05 s.

### localStorage / sessionStorage keys
- None. The only cache is in-memory (nlex-exits module cache). Full screen sets `document.body.style.overflow = "hidden"` temporarily.

### "Never cut" facts
- Outputs that are **simulation** (agent-based engine, one seed per animation): all metric tiles, the canvas, the before/after table, confidence results, the recommendation, and facility queues and waits. Outputs that are **real data or model forecasts**: the forecast card tiles (model + WMAPE), incident hotspots (incident log, with source and period), exit list, lane counts (OpenStreetMap, read 2026-10-03), demand/plaza flows/analytics (observed), fleet CO₂ factors and mix (warehouse), duration calibration (n, level).
- Simulation/what-if labels verbatim: "Agent-based what-if simulation" (P:2052); "Traffic Simulation" (P:2120); "Simulation time" (P:2126); "Simulation Controls" (P:2458); "Simulate a Forecast Day" / "Load into simulation" (SFP:238, 252); "Nothing in the simulation changes." (P:3440); "simulated min done" / "simulated minutes" (SP:424, 456); `…inflow is assumed, not observed: read this as a what-if.` (recommendation.ts:73); "The sandbox simulates only this stretch (100 m to 3 km) … the road either side is not simulated." (P:3794); "The simulation's own CO₂ rate covers one short stretch and is not comparable to the corridor-wide tonnage." (SFP:326-327). **No "ILLUSTRATIVE" label exists on this page.**
- Window limits: default 600 m drawn (P:75); maximum drawn 3 km (`Drawing is capped at 3.0 km. Narrow the range to study a longer route in parts.`, P:2676); minimum 100 m (P:83); legibility floor 3 px per 4.5 m car (P:130-132).
- Too-fine hint: `At {x.xx} km a car is {x.x} px wide, so the road switches to a density view — colour is mean speed, green running to red stopped. Narrow to roughly {x.x} km or less to see individual vehicles.` (P:2674)
- Hotspot hint: `Opened at {exit} — the highest incident risk on this route for the selected day. ` / `Opened at {exit}, chosen on an earlier forecast day — the selected day has no incident forecast yet. ` (P:2670-2671)
- Warm-up 60 s (P:397). Confidence runs: 300 s each, 60 s discarded, Student's t 95%, 3–20 runs (P:1158).
- Inflow 1000–8000 veh/hr, step 100, default 4500 (P:2528-2530; useDirectionSim:155). Data anchor ceiling = lanes × 2,200 veh/h; floor 300 (forecast floor 100; plaza-volume fallback floor 600, × 1.6 peak factor) (useDirectionSim:297-314).
- Lanes 2–5 (6 under reallocation). Reallocation: min 2 / max 6 lanes, move ≤ 2, suggested stretch 1 km, crossover 150 m (assumptions.ts:282-289).
- Speed zone 20–100 km/h, step 5; 100 = off.
- Skip estimate = simulated s / 0.05 × step cost × 2.5 (× 2 when both carriageways skip); a warning appears above 120 s (P:412, 1890; SP:80).
- Recommendation basis (recommendation.ts): `CLOSURE_LANE_CAPACITY_VEH_H = 1550` per open lane (measured 1,470–1,640); turned-away threshold ≥ 50 veh/h and ≥ 3% of inflow; incident + queue > 120 m → "Deploy responders…"; closure + speed < 20 km/h or > 30% drop → "flow has collapsed…"; > 6 stopped or queue > 80 m → "Congestion is building…"; closure absorbed → `about {use}% of the ~{cap} they can take` (warn at ≥ 85%); speed limit + > 40 km/h → "zone is holding flow smooth…"; default "Flow is stable at {n} km/h and {n} vehicles/min clearing the segment. Maintain the current configuration."; before data "Warming up the simulation…"; not warm "Advice follows once the road has filled and the readings describe the scenario."; all-closed "Every lane is closed, so nothing gets through… Reopen a lane, or close the carriageway upstream and divert traffic before it reaches the closure."; turned away "Demand is beyond what {n} open lanes can take… Meter the on-ramps and post a diversion advisory upstream."; caveats for assumed / interchange inflow (recommendation.ts:63-158).
- Motorcycle share 1.28% (944 of 73,662 Class 1 breakdown records, 2022–2026; drawn only, not modelled) (assumptions.ts:291-293).
- Rain caps: light 100, moderate 100, heavy 96 km/h, scaled from Mejia & Sigua (2018) NLEx free-flow speeds. Caveat "A cap does not lengthen following headways, so capacity loss is understated." (SP:927; assumptions.ts:265-266)
- Default event placement 55% along the segment (assumptions.ts:394-396). Flood closes 150 m and roadworks 120 m (catalogue descriptions).
- Calibrated families: breakdown in lane, breakdown on shoulder, minor collision, multi-vehicle, self accident. Manual-only: overturned, rain, flooding, roadworks ("No NLEX record of this family exists, so there is nothing to sample from — enter the duration yourself.", SP:1142).
- Congestion shading below 8 m/s ≈ 29 km/h (P:4392). Day/night: dawn 05–07, day 07–17, dusk 17–19 (P:3939-3945).
- Data-source notes: "Plazas: OpenStreetMap (© OpenStreetMap contributors), or estimated from the toll record." (P:2607); laneInfo OSM credit + `Source: {provenance}` (P:1851); hotspot `Source: {source}` (SP:1005); legend "from NLEX's records" (P:2416); forecast help text "Forecasts run from the end of observed data, which is why the horizon ends {date}." / "The incident model currently forecasts through {date}; later days carry traffic and CO₂ forecasts only." (SFP:331-339).
- Lane provenance notes (P:1845-1850): `From the road for Km a–b (OpenStreetMap). They follow the stretch on screen.` / `Set by hand. The road here has {…}.` / `Lane reallocation {NB} +n (in Interventions). The road here has {…}; changing lanes ends it.` / "This stretch is not in the corridor's lane table, so the count shown is assumed. Use Change lanes to set it."
- Corridor geography: "NLEX runs Balintawak (Km 0) north to Sta. Ines"; Km 0 always on screen-left; SB traffic runs right to left (P:2621).

### Visible prose likely to be shortened (verbatim)
- P:2052 subtitle: see Page header.
- P:2124 clock title: "The simulated date and time of day. Ticks forward with the simulation (paused when it's paused, faster at higher speeds) — edit it to jump the clock to a different hour, minute or second; the hour reseeds the road's demand for that hour, the minute and second just move the starting point."
- P:2316-2322: "Both carriageways run together, median-separated, lane 1 against the median on each side. Every control, event and readout below belongs to one carriageway and says which. The few things that can address only one road at a time — the Command prompt and the Add-event picker — each carry their own NB / SB choice; with a placing tool armed, clicking a lane on either road changes that road."
- P:1957-1958: Both-mode metric caption (see tiles).
- P:2621 Carriageway info: "NLEX runs Balintawak (Km 0) north to Sta. Ines. Choose the carriageway with the Carriageway control at the top of the page. The km axis is fixed — Km 0 is always on-screen-left — and it is the TRAFFIC that runs right to left when southbound; each direction's inflow anchors to its own observed volume, independently. Both mode draws the two carriageways stacked with a median between them, Southbound above and Northbound below, sharing this one axis — lane 1 sits against the median on both sides."
- P:1851 laneInfo: "Each carriageway's through lanes over the stretch on screen, from the lane tags in OpenStreetMap (© OpenStreetMap contributors), measured per direction between interchanges (lib/nlex-lanes.ts). Where the stretch crosses a change in width, the narrowest is used: that is where queues form. Changing lanes resets the run.[ Source: …]"
- P:2607 places hint: "Click a name to frame it; click two junctions to see the road between them. Only what lies between your origin and destination is listed. Plazas: OpenStreetMap (© OpenStreetMap contributors), or estimated from the toll record."
- P:3791-3796 REALLOCATION_INFO: "One carriageway borrows 1 or 2 of the other's inner lanes over the stretch you give — usually about a kilometre, not the whole corridor. Its traffic crosses the median at an opening at each end of the stretch and drives the borrowed lanes coned off from the other carriageway's traffic, which keeps its remaining lanes. Drivers get in or out only at those openings (within 150 m of each end), and anyone leaving the expressway before the far opening stays out. The sandbox simulates only this stretch (100 m to 3 km) and reallocates the lanes along all of it; the road either side is not simulated. Changing it restarts BOTH carriageways: clocks, baselines, and hand-set closures, speed limits and incidents are cleared. Scenario events stay and replay from their start. The simulated window becomes the stretch (Off puts it back)."
- P:2844-2846 baseline lede; P:3422-3424, 3440, 3461-3467 step texts (quoted above).
- P:2873-2876 confidence lede; P:2928-2931 method note.
- P:2939-2941 command lede.
- SFP:239 forecast lede; SFP:320-341 help: "The segment inflow for the chosen hour is loaded into the simulation, on each carriageway the Carriageway control at the top shows, and the incidents forecast for that hour are placed on the road in focus. Both are the same hourly figures the Traffic and Incident tabs show for that day; change the day or the time and the road follows. Within a week of the last observation the fleet-mix forecast sets how many cars, buses and trucks arrive — its daily shares, shaped by the observed hour-to-hour pattern. The CO₂ figure is the condition forecast for the day. The simulation's own CO₂ rate covers one short stretch and is not comparable to the corridor-wide tonnage. [Forecasts run from the end of observed data, which is why the horizon ends {date}.] [The incident model currently forecasts through {date}; later days carry traffic and CO₂ forecasts only.]"
- SP:927 rain cap: "Caps traffic at {N} km/h — scaled from free-flow speeds measured on the NLEx in rain (Mejia & Sigua 2018). A cap does not lengthen following headways, so capacity loss is understated."
- SP:454-458 skip warning: "This skip may take up to about {t} of real time" / "{label}: {x} simulated minutes. The figure is a cautious upper bound from how fast this machine is stepping now — a queue that is still building makes it slower, one draining makes it faster. The page stays responsive and you can cancel part-way, but this carriageway will not animate until it is done."
- SP:1081 Extra lanes tooltip: "This family can plausibly block more than one lane. Add the specific lanes it also closes, beyond the primary Lane above — replaces the automatic guess for this event."
- Scenario descriptions (shown in the "i" popover, SP:904), catalogue.ts:308-448:
  - Breakdown in a lane (catalogue:308): "A vehicle stalls in a running lane and stays there until the patrol has finished with it: first waiting for the responder, then service or tow. Modelled as a stopped obstacle in that lane (a bus or truck uses several of the engine's 5 m obstacle slots) for the whole event, removed when it ends. Traffic behind it queues and works around it."
  - Breakdown on the shoulder (catalogue:327): "A vehicle stops on the shoulder and waits for the responder, then is served or towed. No lane is blocked, but passing traffic slows to look. Modelled as a speed zone around the location for the whole event. The engine has a single speed zone, so this cannot run alongside a hand-set speed limit."
  - Minor collision (catalogue:346): "A rear-end, side-swipe or hit-and-run that blocks its lane until the vehicles are moved, then clears the scene. Modelled by closing the lane from a short distance upstream of the wreck to its far end, and reopening it when the lane-blocked share of the duration has passed. The engine has a single closure stretch, so it cannot overlap another collision."
  - Multi-vehicle collision (catalogue:369): "Three or more vehicles. Two lanes are blocked at first, reduced to one while the tow works, then reopened while the scene is cleared. Modelled through the engine's single closure stretch, so it cannot overlap another collision."
  - Self accident (catalogue:387): "A single vehicle loses control. The slowest accident family to clear in the data. The lane stays blocked while awaiting response and during the tow, then reopens while the scene is cleared. Modelled through the engine's single closure stretch, so it cannot overlap another collision."
  - Overturned vehicle (catalogue:405): "…NLEX's own accident logs have no category for this (no "Overturned" or "Rollover" event type exists in the data), so there is no calibrated duration to sample from: the operator enters the duration directly…"
  - Flooding (catalogue:422): "Standing water makes a lane impassable until it drains. NLEX has no flood record of any kind (no event type, no duration, no lane count), so this is a simplification: modelled as a single lane closed over a longer stretch than a wreck (150 m, against 60-100 m for a collision), for a duration the operator enters directly. A real flood can be a partial-width, reduced-speed hazard rather than a full closure; the engine has no lever for that, so a closed lane is the closest honest approximation with what exists today."
  - Scheduled roadworks (catalogue:435): "A planned lane closure for maintenance, for a duration the operator enters directly (NLEX has no roadworks record to sample from…). Modelled as a single lane closed over a work-zone-sized stretch (120 m). This is ONE planned window, not a recurring schedule: add it again at a later start time to represent a second occurrence."
  - Rain (catalogue:448): "Light, moderate or heavy rain: a speed zone across the WHOLE simulated stretch… The caps are scaled from free-flow speeds measured on the NLEx in rain (Mejia & Sigua 2018…)… there is no calibrated duration. A speed cap is a proxy: rain mostly lengthens following headways, which the engine cannot vary, so capacity loss is understated. No lane is blocked. The engine has a single speed zone, so this cannot run alongside a hand-set speed limit or a shoulder breakdown's gawk zone."
- Phase labels (catalogue:252-453): "Waiting for responder", "Service / tow", "Lane blocked: awaiting response", "Scene clearing: lane reopened", "Lanes blocked: awaiting response", "Tow in progress", "Scene clearing: lanes reopened", "Vehicle in lane: awaiting response", "Vehicle overturned: awaiting response", "Righting and tow in progress", "Flooded: lane closed", "Roadworks: lane closed", "Raining".

---

## /dashboard/ai-sandbox — AI Sandbox (legacy redirect)

**Source files:** `app/dashboard/ai-sandbox/page.tsx` (18 lines, `AiSandboxRedirect`).

**Roles:** It is a redirect, so in effect the same roles as scenario-sandbox. incident-operator is explicitly denied (`lib/auth-access.ts:40`; the comment at :36-38 explains both paths must stay listed). It is not in the sidebar. The audit-log route label is "AI Sandbox" (`app/dashboard/audit-log/page.tsx:88`).

**Tabs / modes:** none. It renders `null`.

### Checklist
- [ ] Client-side `router.replace("/dashboard/scenario-sandbox")` in `useEffect` (page.tsx:13-15). It is a client redirect on purpose, because `output: 'export'` does not run server redirects (page.tsx:6-9)
- [ ] Both `/dashboard/ai-sandbox` and `/dashboard/scenario-sandbox` stay in incident-operator's DENIED list (auth-access.ts:36-40)
- [ ] Audit-log path label "AI Sandbox" (audit-log/page.tsx:88)
- [ ] Backend API namespace stays `/api/ai-sandbox/*` (scenario, demand-profile, plaza-flows, hotspots, command), used by the new route

### API endpoints
- None (redirect only).

### localStorage / sessionStorage keys
- None.

### "Never cut" facts
- Old bookmarks must keep landing on the real page (page.tsx:6-9).

### Visible prose likely to be shortened
- None (renders nothing).

---

# Copy log

Every wording change, by route: old text → new text, and where any moved text now lives.

## Shared (all Predictive tabs)
- Narrative Explanation body (components/dashboard/AiModelInsight.tsx): the model's text is unchanged, but only its first sentence and the first three per-model verdicts show by default; the rest of the summary and any further verdicts moved behind "Details" on the same card. The caveat and "Written by the language model from the validation metrics shown on this card. Check any figure against the numbers above before acting on it." stay visible, verbatim.
- NarrativePanel / "Generate report" / "Hide report" / "Narrative Explanation": unchanged text.

## Shell
- Added (new, factual): topbar breadcrumb "<Group> · <Page>" (e.g. "Analytics · Overview"), read from the same nav list as the sidebar (lib/nav.ts).
- Added (new): sidebar brand mark "SmartFlow NLEX" wordmark (expanded) / mascot face crop (collapsed). The topbar keeps its own logo and "SmartFlow NLEX" text.
- Added (new): collapsed-rail tooltips repeat each link's existing label ("Traffic", "Log out" …); labels stay in the DOM.
- Session gate: the three messages are unchanged ("Checking your session…", "Redirecting to sign in…", "You do not have access to that page. Returning to the overview…"); the spinner is replaced by the mascot whose headlights pulse (brief §5), hazard lights on the forbidden-route message.
- Logout dialog: no wording change ("Log out of SmartFlow?", "You'll need to sign in again to open the dashboard.", "Cancel", "Log out" / "Logging out…"); the LogOut icon tile is replaced by the small mascot.
- Route loading: "Loading dashboard data..." unchanged; spinner replaced by the mascot loader.
- Toasts: no wording change; the text glyphs ✓ ! i × became drawn icons; "Dismiss notification" label unchanged.
- Visual only: "Log out" and theme option labels render uppercase through CSS (text unchanged).

## / (sign-in)
- Added (verbatim from the brief, taken from PRODUCT.md): four story titles and descriptions — "Forecast, Not Just Live" / "Congestion, incidents, volume and emissions per exit and per hour, up to seven days ahead, with the action to take next."; "Honest Validation" / "Every model states how it was tested, how it scores against simple baselines, and how its served forecasts compared with what actually happened."; "One Corridor, One View" / "Live Waze jams, Waze history since 2022, toll volumes, incident logs, weather and events, joined in one warehouse from Balintawak to Sta. Ines."; "Connected to Drivers" / "Operators publish advisories and decide what the companion mobile app shows commuters."
- Added: story labels in the top bar "Forecast · Validation · Corridor · Drivers"; dash labels "Story N of 4: <title>"; pause control "Pause stories" / "Play stories" (WCAG 2.2.2 for auto-advancing content).
- Unchanged text: "SmartFlow NLEX" (h1), "Decision-Intelligence System", the three points, "Sign In to Dashboard", field labels and placeholders, "Remember me", "Forgot password?", "Sign In" / "Signing In...", both error messages, "© 2026 SmartFlow NLEX. All rights reserved." (the submit label and copyright render uppercase through CSS).
- Removed decoration (no text): the animated four-lane SVG backdrop, replaced by the WebGL stage's two lanes of light trails.

## /dashboard (Overview)
- Page description: "Balintawak Km 12 to Sta. Ines Km 88.25, both carriageways" → "Balintawak **Km 12** → Sta. Ines **Km 88.25** · both carriageways" (the arrow is aria-hidden with a screen-reader "to"; km in tabular figures).
- Added (decoration): the medium mascot at the right end of the header (the only page header that carries it).
- **Removed at the user's request (4 Oct 2026, "remove the 3d corridor make it better"):** the 3D corridor (CorridorScene: gantries, the car km cursor, floating exit labels, the NB/SB readout card, "Loading the 3D corridor…", "3D view unavailable on this device…", "Drag the road, or use the km ruler, to read any point on the corridor") and its km ruler (range input "Km along the corridor" with its aria-valuetext, km ticks, exit ticks and congestion flags). `components/overview/CorridorScene.tsx` is deleted.
- Where that reading lives now: every slow or congested exit-direction is listed with its queue, delay and speed ("Slow and congested now", same format strings as the old readout: "N m queue" / "N.N km queue", "N min delay", "N km/h"); every exit's NB/SB state stays one hover or Tab away on the Live Corridor Status stops; the ruler's congestion flags are now jam bars on "The corridor at true scale".
- Added (computed from the tally at render time, never hardcoded): headline "N exit-direction(s) congested" / "N exit-direction(s) slow" / "Corridor flowing" / "Reading the live feed…" / "Live feed unreachable".
- Added (new, factual): card titles "Slow and congested now" and "The corridor at true scale" with InfoTooltips stating the ranking rule, the longest-single-report queue rule and the 0.35 km minimum bar; empty text "No slow or congested exit-direction in the last N minutes. An exit with no report is flowing freely." (the second sentence is the existing Live Corridor Status note); "+N more in the Live Corridor Status below."; carriageway labels "NB → to Central Luzon" / "← SB to Metro Manila"; links "Open Live Map" and "Traffic forecast".
- Unchanged text: the freshness strip, "Slowest reading on the corridor" and its value and empty texts, the three count labels, the whole Live Corridor Status panel and jam-level dialog.
- **Hero (5 Oct 2026, at the user's request, after their reference image):** the page header became a full-height hero. The h1 "Overview", the group eyebrow and the corridor span ("Balintawak Km 12 → Sta. Ines Km 88.25 · both carriageways") moved into it; the header mascot (PNG) was replaced by the 3D mascot drawn by the stage, centre-right. Added: the scroll cue "Live corridor" (a button that scrolls to the counts). The freshness strip, the computed headline and the slowest reading now sit in the hero's two columns; the counts, the hotspot list, the corridor at true scale and Live Corridor Status follow below. No wording changed in the moved elements.

## /dashboard/traffic
<!-- COPY:traffic:BEGIN -->
_From the Traffic agent's report (result-traffic.md)._

#### /dashboard/traffic — page and Descriptive (`page.tsx`)
- Subtitle unchanged: "Volume, congestion, and speed patterns across NLEX" (7 words).
- Mode tabs gain hints (via ModeTabLabel): "What happened" / "What's next" / "What to do". Labels unchanged.
- "Staffing, congestion response and event ranking, computed from the Predictive tab's own forecast — Range does not apply." →
  "Staffing, congestion response and event ranking use the Predictive tab's own forecast. Range does not apply."
- Volume Trend (i): "…Click a point to see that period's hourly breakdown." → "…Click a point for that period's summary."
  (corrects the inaccuracy recorded in the inventory: the click opens the summary popup).
- Volume by Plaza (i): "…Click a bar for its hourly profile." → "…Click a bar for that plaza's summary." (same correction).
- New filter chips (only when a filter is off its default): "RANGE 3 mo / All / {from} to {to} / Custom, pick two dates",
  "WEATHER Dry/Wet", "CLASS Class n"; × button aria-label "Clear {Range|Weather|Class} filter". Range and Weather chips also show on
  Predictive, where those values still reach the forecast fetch.
- New computed answer lines (from the loaded payload at render time): Volume Trend "{from} to {to} · entry volume, {grain}";
  Plaza "Top 3 plazas carry {x}% of the selected volume"; Impact "Furthest from normal: {label} {±x%}"; Heatmap
  "Busiest: {Day hour} · {n} vehicles/hr on average"; Speed "Slowest: {hour} · {x} km/h inside jams".
- Avg Daily Volume tile: new caption "Last 30 days" under the sparkline (it plots `dailyTrend.slice(-30)`).
- Volume Trend chart: y axis named "vehicles"; tooltip values "{n}" → "{n} vehicles" ("—" for null kept).
- Empty/error texts unchanged ("No volume data for the selected filters", "No data for the selected filters", "No congestion data in
  the selected range", "No impact data available", "Live data unavailable — is the backend running on port 4000?"), now in StateNote.

#### PredictiveVolumeChart
- Finding "**Next {N} days** · **{avg}** vehicles/day on average · peak {day|week|month} **{date}** ({n}) · typical error **{x}**" →
  answer block: label "NEXT {N} DAYS · AVERAGE", value "{avg} vehicles/day", context "peak {day|week|month} {date} ({n}) · typical
  error {x}" + " · failed acceptance, shown for comparison" (kept, danger) when the model is not accepted.
- Validation summary chip "{Model} · WMAPE {x} · MASE {y}" kept verbatim inside the new trust strip; strip pills added:
  "CHAMPION {API championModel}", "TESTED ON {n} unseen days · {start} to {end}" (the Present zone), "ACCURACY {chip}" +
  " · beats repeating last week" / " · no better than repeating last week" (MASE < 1 / ≥ 1), "AT {N}D AHEAD typical error {x}"
  (the rolling-origin figure already in the finding). Title "Validation evidence" and Show/Hide kept.
- New pill (only when the stored forecast's last day is before today): "Stored forecast ends {date}, before today".
- Hourly drill (i): "Blue bars are the vehicles counted at the toll plazas in each hour of this day. The model line is…" → "The line is
  the vehicles counted at the toll plazas in each hour of this day. Each model line is…" (actuals are drawn as a line; rest verbatim).
- Tooltips: model/actual values gain units: "{n} vehicles" (daily), "{n} vehicles/hr" (hourly).
- "Models" toolbar icon dropped (label kept). Hourly "Forecast" pill: green → model violet (same text).

#### ModelNarrative (also renders on Emissions; props unchanged)
- "Generated from the stored validation metrics for the models currently selected · {n} scored days, {start} to {end}, forecasting
  {h} days ahead · weather-driven variants" → "From the stored validation metrics of the selected models · {n} scored days, {start}
  to {end}, forecasting {h} days ahead · weather-driven variants" (values and their logic unchanged).
- Removed unreachable JSX inside the open branch (a collapsed-state subtitle and chips guarded by `!open` after `if (!open) return`;
  the inventory already notes they never render). Shell now `.nc-narrative`, same as NarrativePanel.

#### WeatherEvidencePanel
- No wording change. Correlation words ("almost none / weak / moderate / strong") now differ by ink weight instead of green/amber.

#### PredictiveCongestionChart
- New group label "RANGE" before Next 12 h / Next 24 h / Next 7 days. Exit select gains aria-label "Add exit".
- No other wording change (headline, lead, stats, legend, pills, episodes, evidence, modal and footnotes verbatim).

#### PredictiveEventChart
- No wording change. "Observed · …" pill green → neutral; "Forecast · …" pill → model violet; "✓ tested · …" pill info → green
  (pass/fail is a status); "used" tag → violet pill.

#### PrescriptiveTrafficPanels
- Booth banner "**{day}: open {n} booths across the corridor at the peak** — {±n} versus a typical day. The largest change is at
  **{plaza}** ({a} → {b}, peak {hour}). {n} of the next {N} days need more than typical staffing somewhere on the corridor." →
  action card: kicker "STAFFING", rank 1, headline "Open {n} booths across the corridor at the peak", facts "WHEN {day}",
  "CHANGE {±n} versus a typical day", "LARGEST CHANGE {plaza} ({a} → {b}, peak {hour})", "WEEK AHEAD {n} of the next {N} days need
  more than typical staffing somewhere on the corridor." / "No day in the next {N} exceeds typical staffing anywhere."
- Congestion top-3 cards "{i}. {segment}" + label + "First High +{n}h · Peak {x}% at +{n}h" + action sentence → ranked action
  cards: rank, glyph + "ACT/PREPARE/MONITOR", headline = the action sentence (verbatim), facts "WHERE {segment} · km {km}" (km from
  the same payload), "WHEN First High +{n}h" / "Never reaches High inside the horizon", "CONFIDENCE Peak {x}% at +{n}h"; new
  Details: "Ranked by the fuzzy controller from how likely High congestion is and how soon (urgency {u}), from the congestion
  forecast on the Predictive tab. Counter-flow goes to the three most urgent segments only." (urgency is `congestion[].urgency` from
  the same response; the sentence restates the panel's (i)).
- Event banner "**Event traffic management plan: {top 3}.** On an event day these three exits carry **{n}** extra vehicles between
  them. Deploy patrol and advisory resources here first — the surge is anchored on {exit}. Next up: **{act}** on **{date}**
  (recurring, inferred)." → action card: kicker "EVENT PLAN", headline "Event traffic management plan: {top 3}.", lead "Deploy patrol
  and advisory resources here first — the surge is anchored on {exit}.", facts "EXPECTED LOAD On an event day these three exits
  carry {n} extra vehicles between them.", "NEXT UP {act} on {date} (recurring, inferred).", new "ESTIMATE {exit}: {firm|fair|loose}
  · …" (the table's own Estimate column for the top three).
- Booth footnote: missing spaces restored after "follows the last recorded day." and "…plan the coming week." (typo fix only).
- "Show the {n} elevated segment(s) not advised" gains aria-expanded. Empty/loading/error texts verbatim, in StateNote.

### Second pass (wording and structure)

Files touched again: `page.tsx`, `PredictiveVolumeChart.tsx`, `PredictiveCongestionChart.tsx`, `PredictiveEventChart.tsx`,
`PrescriptiveTrafficPanels.tsx`, `nc-traffic.css`. Same rules: no data, logic, hook, fetch or handler change; every never-cut fact
is still on its card, visible or one click away in an InfoTooltip or a "How this is measured" disclosure.

##### Copy log (second pass)

###### /dashboard/traffic — Descriptive (`page.tsx`)
- "Average Volume by Hour × Day of Week" → "Average Volume by Hour and Day" (title ≤ 6 words; its (i) unchanged).

###### PredictiveCongestionChart
- Finding: the exit list leaves the sentence and becomes a labelled chip row. Variant selection is identical; only the
  parenthetical moves. E.g. "…By the peak it is all but 5 exits (Sta. Ines, Dau, Angeles, Mexico, Bocaue Barrier keep moving), with
  4 crawling under 10 km/h." → "…By the peak it is all but 5 exits, with 4 crawling under 10 km/h." + row "KEEP MOVING [Sta. Ines]
  [Dau] [Angeles] [Mexico] [Bocaue Barrier]". The "{n} of {N} exits ({list})" variant likewise → "{n} of {N} exits" + row
  "CONGESTED [exits…]". The "every exit" and "{n} neighbouring exits over about {km} km, km a to b" variants are unchanged.
- Lead line "Worst: {exit} from 7AM, typically a ~200 m queue ~190 m from {plaza} · ~2 min delay." → labelled row "WORST {exit}
  from 7AM · typically a ~200 m queue ~190 m from {plaza} · ~2 min delay." ("Heaviest" variant the same).

###### PredictiveEventChart
- Upcoming finding "During {act} (inferred) at {venue} ({n} capacity) on {date} · in {n} days: expect +{n} extra vehicles. {exit}
  takes {x}% of it, {m}× its normal {weekday}." → "Expect +{n} extra vehicles during {act} (inferred)." + rows "WHEN {date} · in
  {n} days · at {venue} ({n} capacity)" (venue only off the Arena, as before) and "TOP EXIT {exit} takes {x}% of it, {m}× its
  normal {weekday}". The observed finding is unchanged.

###### PredictiveVolumeChart — Hourly Breakdown
- Summary sentence "Peak {h · n} · quietest {h · n} · {Model} was {x}% under the day's actual · rain {x} mm (heaviest {h}) ·
  {a}–{b}°C" → pills "{Model} was {x}% under the day's actual", "Rain {x} mm · heaviest {h}" / "No rain recorded", "{a}–{b}°C".
  Peak and quietest are not repeated: they are the Peak Hour / Quietest Hour tiles on the same card. The forecast-day sentence and
  the weather-filter notes are unchanged.

###### PrescriptiveTrafficPanels
- "Not enough booths" banner ("Not enough booths. {day} at {hour}, {plaza}'s {where} booths would need {n}, and there are {n}: about
  {n} vehicles an hour queue with every one of them open. Staffing cannot clear that; divert traffic or post an advisory there.
  {n} more plaza-days this week run past their booths too, marked ! below.") → alert action card: kicker "NOT ENOUGH BOOTHS",
  headline "Divert traffic or post an advisory at {plaza}", rows WHEN "{day} at {hour}", WHERE "{plaza}'s {where} booths", EFFECT
  "About {n} vehicles an hour queue with every one of them open", BASIS "Would need {n} booths; there are {n}. Staffing cannot clear
  that.", THIS WEEK "{n} more plaza-days run past their booths too, marked ! below".
- Hour view intro "Booths needed hour by hour on {day} ({type}). Plazas do not peak together — the tallest bar is each plaza's own
  busiest hour. Red hatching is need beyond the booths the plaza has." → "Booths needed hour by hour on {day} ({type})" + (i) holding
  the other two sentences (the hatching one still only when some plaza runs short) + a key: "Peak hour" / "Other hours" / "Need
  beyond booths".
- Booth footnote (≈90 words, visible) → visible row "BASIS {model} forecast · WMAPE {x}%" + pill "Failed its acceptance gate ·
  level less certain" (only when not accepted) + the stale warning as an alert banner "Its first day, {d}, is already inside the
  record, which now runs to {d}: this plan is for days already past. Retrain the volume models to plan the coming week." (only when
  stale); the whole original footnote, word for word, now sits under "How this is measured" on the same card.
- Congestion Response footnote (volume-to-capacity ratio) → under "How this is measured", word for word.
- Event Intervention footnote (TOPSIS weights, Estimate thresholds, pointer to the Predictive card) → under "How this is measured",
  word for word.

##### Inventory changes (second pass)
- [~] Descriptive heatmap title shortened (see copy log); (i), chart, modal, RampKey unchanged.
- [~] Congestion finding banner: exit list as chips, lead line as a labelled row (same values, same variant logic).
- [~] Event finding (upcoming variant): answer + WHEN / TOP EXIT rows; "(inferred)" keeps its title.
- [~] Hourly Breakdown summary line → pills (peak/quietest stay in the tiles).
- [~] Booth alert banner → alert action card; hour-view intro → line + (i) + key; footnote → BASIS row + warnings visible, full text
  under "How this is measured".
- [~] Congestion Response V/C footnote and Event Intervention weights footnote → "How this is measured".
- [~] Prescriptive layout: Booth plan full width; Congestion Response (4 of 12 columns) beside Event Intervention (8 of 12) at ≥ 1280 px,
  stacked below that.
- Everything else from the first-pass inventory is unchanged and still present.

##### Diff guard (second pass)
Re-run on the owned files: 44 flagged removed lines; 43 are the first-pass lines explained above (unchanged). The one new line,
`if (!open) return <GenerateReportButton onClick={() => setOpen(true)} />;` in ModelNarrative, is not my edit: another agent made
ModelNarrative render `quantityNote` as a "How this is measured" disclosure (the Emissions caveat the inventory listed as never
rendered); the same `onClick` is re-added on the line below it. The volume card passes no quantityNote, so Traffic is unaffected.
From my second pass: no removed handler, hook, fetch, aria or role. The only removed JSX in this pass is
prose (the booth alert sentence, the hour intro, the three footnotes moved into `<details>`, the hourly summary sentence, the event
upcoming sentence), all re-added in the new structure. No dependency array changed.

##### Light theme
Checked all three modes in light at both widths: tokens carry it; tints use `color-mix` on the state/accent tokens, tables and pills
use the hairline tokens, chart furniture comes from `useChartTheme()` / the palette hook, so the lead's light-token upgrade flows
through without page changes.

##### Screenshots (second pass)
Final: `.playwright-cli/redesign-after/<dark|light>-<desktop|mobile>/traffic-{descriptive,predictive,prescriptive}.png` (descriptive from the second-pass round; predictive and prescriptive re-shot after the fix pass). Interaction shots: `scratchpad/traffic/parity/event-upcoming-{dark,light}.png`, `booth-hour-{dark,light}.png` (hour view + "How this is measured" open; the disclosure holds the booth source and profile window, verified).

Typecheck after the second pass: `npx tsc --noEmit -p .` → 0 errors.
<!-- COPY:traffic:END -->

## /dashboard/incident
<!-- COPY:incident:BEGIN -->
_From the Incidents and /incident/hourly agent's report (result-incident.md)._

#### /dashboard/incident

Page and filter bar
- Mode switch labels gain the shared three-word hints ("What happened" / "What's next" / "What to do") via ModeTabLabel; the check-mark SVG on the active tab is gone (the sliding accent underline marks it).
- "Incident type" + its select moved from the Incident Trend card's strip into the sticky filter bar (Descriptive only), label unchanged. (moved: filter bar)
- "Granularity" label kept, moved into the Incident Trend card header.
- New: active-filter chips, `Active` + `Range 3 mo` / `Range All` / `{from} – {to}` / `Custom range` / `Wet hours` / `Dry hours` / `Accidents` / `Breakdowns`, each with ×; accessible name `Remove filter: {label}`.
- New: filter-bar readout `Data {Mon D, YYYY} – {Mon D, YYYY}` (Descriptive only; from `data.range`, the resolved analytics window).
- Range / Weather / segmented buttons: check-mark SVGs removed (active state is the accent fill); labels unchanged.

Descriptive cards (new answer lines, all computed from loaded data at render time)
- Incident Trend: new answer `{n} incidents in {bucket label}, the busiest {month|week|day} shown` (max of the drawn buckets); new context line = the page's existing filtersNote (`All weather · {from} to {to}` etc.).
- "Peak around {h} · quietest around {h} · busiest day: {Day}" → answer `{h}` + `peak · quietest around {h} · busiest day: {Day}` (same three values, same logic).
- Hotspots: new answer `Km X–Y` + `{n} incidents · {x.x}% of located` (same figures as the Top Hotspot KPI).
- Causes: new answer `{n}` + `incidents · {label}, the top {accident cause|breakdown cause|accident type}`. The 3-way toggle moved to its own row under the title so the dynamic title is not truncated.
- Dry vs Wet: new answer `{x.xx}×` + `crash rate in wet vs dry hours · breakdowns {wet} vs {dry} per day` (crash multiplier = the KPI's; breakdown rates = the chart's own (n / hours) × 24).
- New card "Incidents by Hour and Day" (heat grid of the analytics `heatmap`, averaged per weekday in the Range); answer `{Day} {h}` + `busiest hour of the week · {x.x} incidents per {Day} on average`; tooltip `{Day} · {h} – {h+1}` / `{x.x} incidents per {Day} on average` / `{n} total across {n} {Day}s`; key `0 … {max} incidents / day`; greyed rows say `No {Day} in this Range` (caption `No {Days} in this Range, so those rows are greyed out as no data.`). InfoTooltip: "Average incidents in each hour of each weekday, normalized for how many of that weekday the Range contains. Same Hour × Day table as When Incidents Happen; follows Range, Weather and Incident type."
- Response Time Breakdown (Descriptive): new answer `{m} min` + `slowest median dispatch · {group}, {n} dispatches`; caption kept verbatim and extended with "Fixed 12-month window: this card does not follow Range or Weather." (a true statement of existing behaviour). "Median Dispatch Response Time" kept as a sub-heading. Axis ticks now read `{v} min`.
- Unavailable states keep their words, now beside the mascot (StateNote).

Predictive — Incident Walk-Forward Forecast
- New answer: `{n} days of published forecast, {first} to {last} · champion {model}` (from the response's future rows and champion).
- "GRANULARITY" → "Granularity" (same word; the old ✓ prefix on the active option is gone).
- New model trust strip (pills): `Champion {model}`; `Test window {n} days {start} – {end}` (or `Full holdout · trained {date}`); `vs last-week baseline MASE {x.xxx} beats it | does not beat it` (rule: MASE < 1 beats, as the MASE formula hint says); `Held-out error MAE {x.xxx} incidents/day · WMAPE {x.xx}%`. Each pill scrolls to and focuses the validation section below (still on the card). Titles carry the champion rule / scoringCaption / formula hints.
- Forecast-origin marker labelled `FORECAST` at the Present/Future boundary (see For the lead: not "NOW").
- Split-view disclaimer reordered, all facts and values kept: visible = "Accident forecast — {model}, fitted on accidents alone (last trained {date}). Held-out MAE {x} incidents/day, R² {x}. Its own skill is modest, though — without traffic volume it is not clearly better than the historical average (re-measured 2026-09-21). Breakdowns are derived, not separately modeled (blended forecast minus accident forecast). Metrics below describe the blended forecast." (moved: behind "Details" on the same box) "Accidents are only ~12% of daily incidents, so a fit tuned to the combined count is tuned to breakdowns: on the current holdout, scaling the blended forecast down to an accident estimate does worse than simply assuming the historical average, and this dedicated model beats it clearly. A dedicated breakdown model was tested and did no better than the blended fit." (the last sentence was "…: a dedicated breakdown model was tested and did no better than the blended fit.")
- Dry-days weather panel lost its amber tint (neutral hairline); wet keeps the info-blue tint.

Predictive — Predicted Incidents Ranking
- Headline sentence → answer `{n}` + `predicted incidents on {label}, the leading stretch`, then `{x}% of the {total}-incident total on its own. The top {N} segments together account for {x}% of the whole corridor's forecast — {verdict}.` ("The {label} stretch leads the corridor at {n} predicted incidents —" became the answer line; verdict strings unchanged.)
- "darker = more predicted" → "stronger shade = more predicted" (the ramp is now theme-aware: pale-to-deep in light, dim-to-bright in dark).
- See-more dialog close "✕" glyph → drawn X icon (aria-label "Close" unchanged).

Predictive — Response Time Breakdown (model)
- Stat tiles restyled; axis name now centred under the axis, ticks `{v} min`. Text unchanged.

Prescriptive — Resource Staging & Patrol Repositioning
- Banner → action card. Title `Recommended staging: {labels}.`; lede `Pre-position patrol and tow-truck units at these {k} {exits|segments} — {verdict}`; facts:
  `Where` (staffed sites ranked by predicted incidents: `{n} {label} Km {km} · {n} predicted`),
  `When` `Across the {days}-day forecast window`,
  `Expected effect` `{x}% of the ranking's {total}-incident forecast within {r} km of a unit ({covered} of {total})`,
  `Confidence` `Solved as an exact covering program; the forecast it covers is apportioned by historical share, not modelled per site`.
  (moved: behind "Details") the original banner sentence verbatim + a method line (MCLP, YALPS branch-and-cut, |km_i − km_j|, weighted by predicted incidents). The InfoTooltip hint is unchanged.
- "● STAFFED" → `Staffed` pill with a drawn dot (uppercase by CSS).
- Hotspot monitoring alert → action card: lede `{Exits|Segments} carrying at least 80% of the ranking's predicted incident total between them.` + the unchanged spread sentence when it applies; facts `Where {n} of {N} {exits}, listed below`, `When Across the {days}-day forecast window`, `Expected effect Watches at least 80% of the predicted incident total`; (moved: Details) "The same evidence-coverage cutoff used on the ranking cards above, not an arbitrary top-N: … added busiest first until they carry 80% …".
- Proactive speed advisory → action card: lede "Advise reduced speed at these hotspots first as rainfall rises."; facts `Where` (top 3, `{label} — Km {km}, {x.xx} incidents/km`), `When As rainfall rises`, `Confidence Weather-incident-risk model, AUC {x.xxx}`; rain chips unchanged; (moved: Details) the original paragraph verbatim.
- Foot unchanged.

Prescriptive — Patrol Alert Schedule
- Banner → action card: title `{Day} needs the longest alert window: {h – h} ({n}h), peaking around {h}.`; lede "Every other day's own window is in the table below — none of them share a single rush-hour assumption." (verbatim); facts `Where The whole corridor: every logged incident in the selected Range`, `When {Day} {window}; each day's own window below`, `Basis Hours whose average incident count sits above that day's own mean`, `Measured over Mon n, Tue n, …`; (moved: Details) the InfoTooltip hint text (also still in the InfoTooltip). Table and Foot unchanged.

#### /dashboard/incident/hourly
- Title `Hourly Breakdown — {Mon D, YYYY}` → `Hourly Breakdown`, with the date moved to the start of the subtitle in bold tabular figures (Italiana must not set numbers). (moved: subtitle)
- Subtitle, weekday-profile variant: "No hourly ground truth exists for this date — each model's daily total is distributed over the typical {weekday} shape from the last 90 days." → `{date} · No hourly ground truth: model totals spread over a typical {weekday}.` (moved: full sentence, incl. "the last 90 days", into "How this is measured" on the chart card)
- Subtitle, observed variant: "Observed hourly incidents for this day, with each model's daily prediction distributed over the typical shape for this weekday." → `{date} · Observed incidents per hour; model totals spread over this weekday's shape.` (moved: full sentence into "How this is measured")
- No-log warning and partial-coverage note moved above the cards (they explain gaps in both the new heat grid and the chart); text unchanged; the ℹ️ emoji → drawn Info icon.
- New card "Incidents by Hour and Source" (Road crashes / Motorcycle crashes / Stalled vehicles × 24 h, the per-hour counts the tooltip already lists); answer `{n}` + `{source}, the largest source in view`; no-data (grey) cells say why in the tooltip: `No incident log covers this date` / `{source} are not logged this far` / `No weather reading for this hour` / `Outside the {wet|dry} slice`; empty-day line `No incident log covers this date, so every cell is greyed out as no data.` (or `None of the three sources is logged this far, …`).
- Chart card gets the neutral title "Hourly Incidents and Model Shape".
- New active-filter chip `Wet hours` / `Dry hours` (× → All).
- Invalid-date state: AlertTriangle icon → mascot (StateNote); heading/body text unchanged.

### Second pass (wording and structure)

Goal (user, via lead): less wording, more structure, especially Predictive and Prescriptive. Same rules: no data, logic or handler changes; never-cut facts stay one click away on the same card.

##### Copy log

/dashboard/incident: Prescriptive
- Action cards now use labelled rows (Action / Where / When / Effect / Basis / Confidence) in a two-column layout (one column on phones). No visible paragraphs remain; every former sentence sits verbatim under that card's "Details".
- Staging card: title `Recommended staging: {labels}.` → `Stage units at {k} {exits|segments}` (computed). The site names stay visible as the ranked Where rows (1…k by predicted incidents, each `Km {km} · {n} predicted`). The verdict sentence becomes a pill beside the title: `Reaches most risk` / `Larger fleet or radius needed` (same ≥ 80% rule). Rows:
  - Action: `Pre-position patrol and tow-truck units`
  - When: `The {days}-day forecast window`
  - Effect: `{x}% of {total} predicted incidents within {r} km ({covered} covered)`
  - Basis: `Exact covering solve over the {model} {days}-day ranking`
  - Confidence: `Forecast apportioned by historical share, not modelled per site`
  - Details: the full banner sentence (`Recommended staging: …`), the method, and the old Foot text.
- Deployment Foot `Built from the {model} {days}-day forecast, apportioned the same way as the ranking above. Fleet size and coverage radius are yours to set — nothing in the warehouse records NLEX's actual patrol fleet.`:
  - The fleet warning stays visible right under the controls: `Fleet size and radius are yours to set — nothing in the warehouse records NLEX's actual patrol fleet.`
  - The source moved to the Basis row; the full text is under the staging card's Details.
- Hotspot monitoring alert: the paragraph is now rows:
  - Action: `Monitor these {exits} closely`
  - Where: `{n} of {N} {exits}, listed below`
  - When: the forecast window
  - Effect: `Watches at least 80% of predicted incidents`
  - Basis: `80% cumulative cutoff, not a fixed top-N`
  - Pill `Risk spread wide` when the cutoff needs more than half the rows.
  - Details: both original sentences verbatim.
- Proactive speed advisory:
  - Action: `Advise reduced speed here first`
  - Where: the top 3 by density, `Km {km} · {x.xx} incidents/km`
  - When: `As rainfall rises`
  - Effect: the rain chips
  - Confidence: `Weather-incident-risk model, AUC {x.xxx}`
  - Details: the original paragraph verbatim.
- Patrol Alert Schedule: title `{Day} needs the longest alert window: …` → `{Day}: longest alert window` (computed). Rows:
  - Action: `Treat these hours as elevated-risk for patrol`
  - Where: `Whole corridor, all logged incidents`
  - When: `{window} ({n}h), peaking around {h}`
  - Basis: `Hours above that day's own mean`
  - Confidence: `Measured over Mon n, Tue n, … days`
  - Details: the banner sentence, the full hint, and the old Foot (the Foot was duplicated by the Confidence row, so it is no longer shown separately).

/dashboard/incident: Predictive
- Split-view model note: `Model picker not used in this view — the accident forecast is {model}, fitted on accidents alone; breakdowns are derived as blended total minus accidents.` → `Model picker off in this view: accidents use {model}; breakdowns = total − accidents.` The full sentence moved into an InfoTooltip beside it.
- Split-view disclaimer → a labelled strip:
  - `Accident forecast {model} · accidents only · trained {date}`
  - `Held-out MAE {x} incidents/day · R² {x}`
  - `Skill: Modest: not clearly better than the historical average without volume (re-measured 2026-09-21)`
  - `Breakdowns: Derived, not separately modeled: blended − accident forecast`
  - `Metrics below: Blended forecast`
  - Details (unchanged): the ~12% / scaling / breakdown-model reasoning.
- Predicted Incidents Ranking: the context sentence becomes a strip:
  - `Share of total {x}% of {total}`
  - `Top {N} share {x}%`
  - `Read: Concentrated: a few stretches cover most` / `Spread wider than a few hotspots` (same ≥ 50% rule)
  - Details: the full original headline sentence verbatim.
  - Unclassified note: `{x}% of logged locations in this Range couldn't be matched to a specific segment and are excluded from the split.` → `{x}% of logged locations matched no segment and are excluded from the split.`
  - `Hover a row to inspect its numbers` → `Hover a row for its numbers`.
- Response Time Breakdown (model): the caption keeps `Top {n} {causes|services} by held-out evidence.` visible; `Built from breakdown_data's per-dispatch records; responses over 24h are treated as data-entry noise and excluded, same as the Descriptive tab's own figures.` moved to "How this is measured".

/dashboard/incident: Descriptive
- `Incidents per Day: Dry vs Wet Weather` → `Dry vs Wet: Incidents per Day` (6 words).
- Response Time Breakdown caption: `Last 12 months; does not follow Range or Weather.` stays visible; the breakdown_data / dispatch-subset / 24h-exclusion sentence moved to "How this is measured".

/dashboard/incident/hourly
- No-log warning: `… the operations log ends {date}. Weather and the model curves are shown; the absent bars mean no data, not zero incidents.` → `No incident log covers this date (the operations log ends {date}). Absent bars mean no data, not zero incidents.` (dropped the clause that restated what is on screen).
- Unknown-weather note: `{n} incident(s) fell in hours with no weather reading, so they appear under All but in neither Dry nor Wet.` → `{n} incident(s) had no weather reading: counted under All, not Dry or Wet.`
- Derived-shape note → a labelled strip:
  - `Model curves: Derived · one daily total spread over a typical {weekday}, not an hourly forecast`
  - `Weather: Observed · {n} of 24 hours reported, not forecast`
  - The full sentence (with `hourly_weather`) is under "How this is measured", next to the long subtitle text.

Model colours (categorical only; no visible text names a model by its colour)
- `incidentPredictive.shared.ts`: XGBoost #16a34a (green) → #6366f1 (indigo); SARIMAX #ef4444 (red) → #0d9488 (deep teal).
- Hourly page's own MODELS copy: the same two changes, plus Random Forest #f59e0b (amber) → #a21caf, so all seven models now match the daily chart. The hourly file's own comment requires matching colours; the old mismatch was a bug.
- On the dark card these sit at roughly 4.3:1 (indigo) and 5:1 (teal), so lines stay legible.

##### Inventory changes (second pass)
- [~] Staging banner → action card with labelled rows; `Recommended staging: {labels}.` sentence verbatim under Details; labels visible as ranked Where rows.
- [~] Deployment Foot → fleet warning visible under the controls; source in the Basis row; full text under Details.
- [~] Hotspot alert / speed advisory paragraphs → labelled rows + Details (verbatim). List, rain chips and AUC are still visible.
- [~] Patrol banner and Foot → action card rows + Details (verbatim). Day counts still visible (Confidence row).
- [~] Split disclaimer and model note → labelled strip + InfoTooltip/Details. Every figure and caveat still visible or one click away.
- [~] Corridor headline → labelled strip; verbatim sentence under Details.
- [~] Response-time captions (both tabs) → short visible line + "How this is measured".
- [~] Weather card title shortened (see copy log).
- [~] Hourly notes shortened or turned into a labelled strip; full text under "How this is measured".
- [~] Model hues for XGBoost, SARIMAX and the hourly Random Forest changed (inventory "never-cut" note about the hourly copy's Random Forest colour superseded at the lead's request).
- Everything else as in the first-pass inventory. No control, chart, series, table, dialog or state was removed.

##### Diff guard (second pass)
Same command over the same 11 owned files, compared against HEAD. The output is byte-identical to the first-pass list above (41 lines, explained there). The second pass added and removed no handler, `aria-*`, `role`, `href`, fetch, hook, router or storage line. tsc: 0 errors for the whole project.

##### Screenshots (second pass)
- `.playwright-cli/redesign-after/{dark,light}-{desktop,mobile}/incident-{descriptive,predictive,prescriptive}.png` (re-taken, 0 console errors).
- `.playwright-cli/redesign-after/{dark,light}-{desktop,mobile}/incident-hourly-day.png` (2026-06-12, re-taken after one timeout).
- Fix pass: the five hourly stat tiles took one row each on phones → 2 columns at ≤ 640 px.

##### Notes for the lead
- The action cards are in the page's existing order (staging, monitoring, speed advisory, patrol windows). I did not number the cards because nothing in the data ranks one action above another. The ranking inside the cards is data-driven: staged sites by predicted incidents, the top 3 by density, hotspots by predicted incidents.
- `VOLUME_COLOR` (#f59e0b amber, the exposure overlay on the forecast chart) is also close to the slow road-state hue. It is used only when Volume is on, and I left it as is. Say if you want it moved too (a neutral warm grey would work).
- Light theme checked on all three tabs and the hourly page: no washed-out areas with the current tokens.

##### Volume overlay colour (lead request)
- Forecast chart volume overlay (line, area, Volume axis labels and axis line, both views): amber #f59e0b → the theme's muted ink (useThemeTokens textMuted: #8590a6 dark, #5a6478 light), so it cannot read as the slow road state. Legend name "Vehicle Volume", axis names and the tooltip text ("{n} vehicles") are unchanged. `VOLUME_COLOR` in incidentPredictive.shared.ts is now unused and left in place. tsc: 0 errors. The overlay is drawn only across the Past band and the model lines only across Present/Future, so the grey volume line never overlaps the slate GRU line.
<!-- COPY:incident:END -->

## /dashboard/incident/hourly

## /dashboard/sustainability (Emissions)
<!-- COPY:emissions:BEGIN -->
_From the Emissions agent's report (result-emissions.md)._

#### /dashboard/sustainability (Emissions)

Page / shell
- Page subtitle unchanged: "Vehicle emissions and air quality trends across NLEX" (8 words).
- Mode buttons: "Descriptive" / "Predictive" / "Prescriptive" → same names + hints "What happened" / "What's next" / "What to do" (ModeTabLabel). Check-mark SVG → sliding accent underline + `aria-pressed`.
- Added filter chips (sticky bar, right side): "Range 3 mo" / "Range All dates" / "Range {from} – {to}" / "Range Custom · pick dates", "Class {Class n · …}"; × buttons labelled "Clear range filter, back to 12 mo" / "Clear class filter, back to all classes" (title "Back to …").
- Chart error/empty notes: text unchanged ("Live data unavailable — is the backend running on port 4000?", "No emissions data for the selected range", "No data for the selected range", "No station readings in the selected range"); now inside StateNote (mascot).

Descriptive
- KPI "Avg Daily CO₂": added caption under the sparkline "7-day rolling mean of daily CO₂" (what the sparkline already drew).
- Hero "CO₂ Emissions Trend by Vehicle Class": added answer "{n} t · CO₂ in the latest {month|week|day|hour} · {bucket label}" and context "{±x.x%} vs the range average · Range: {from} to {to}" (computed from the loaded trend rows; follows Show).
- Hero y-axis ticks "15K" → "15K t" (axis name "tonnes CO₂" kept).
- "When Emissions Happen": takeaway "Peak around {h} · quietest around {h} · heaviest day: {DOW}" → answer "{h}" + "peak hour, all days"; context "Quietest around {h} · heaviest day: {DOW}". Same values, same logic.
- When chart y ticks "30" → "30 t"; By-day highlighted bar label "{v}" → "{v} t".
- "Fleet Mix vs Pollution Load": takeaway "Heavy vehicles (Class 2–3): {v}% of traffic → {c}% of CO₂" → answer "{c}%" + "of CO₂ from heavy vehicles (Class 2–3)"; context "From just {v}% of traffic".
- "Heavy-Vehicle Share of CO₂": takeaway "Now {last}% — {rising|falling|steady} across the range (from {first}%)" → answer "{last}%" + "now, latest {period}"; context "{Rising|Falling|Steady} across the range (from {first}%)". Threshold ±0.5 pp unchanged.
- "Measured Air Quality by Month": added answer "{p}% of readings Good (AQI 1–2)" + context "{n} station readings · {Mon YY} – {Mon YY}" (sums of the loaded aqiMonthly rows).
- NEW card (heat grid of the `heatmap` rows the page already loads): title "CO₂ by Hour and Weekday"; ⓘ "Average modeled CO₂ in each hour of each weekday over the Range: that slot's total divided by the number of those weekdays in the Range."; answer "{Day · h}" + "busiest hour of the week, {x} t on average"; context "Quietest: {Day · h}, {x} t · Range: {from} to {to}"; tooltip "{Day · h – h+1} / {x} t CO₂ on an average {Day} / {n} t total across {n} {Day}s"; key "{min} t … {max} t · avg t CO₂ in the hour".

Predictive — "Corridor CO₂ Walk-Forward Forecast"
- Subtitle (aggregated) "Every point is a {meanLabel} — the average of that {bucketNoun}'s days, not a total · Toggle models to overlay predictions" → "Tonnes of CO₂ per day across the whole corridor · toggle models to overlay predictions · measured to {holdoutEnd}, forecast from {futureStart}" (moved: the averaging fact stays visible in the "Each point = {meanLabel} averaged, not totalled" pill + its hover text, the y-axis name and the legend). Daily variant: same sentence plus the dates.
- Added answer "{n} t · CO₂ per day, mean forecast · {start} – {end} · {champion}" (mean of the champion's stored forecast over the drawn future window).
- "GRANULARITY" / "HISTORY" → "Granularity" / "History" (still rendered uppercase). The Future buttons now sit under the label "Horizon" in the same control bar (moved from the zone row); "· validated at 7d" → "validated at 7d".
- Active granularity/history "✓ {g}" → "{g}" shown as the accent pill, with `aria-pressed`.
- Zone row "Future" (had only buttons) → "Future  {n}d projected".
- "★" on the champion chip → star icon + sr-only "champion" (title "Champion"); "=" kept (title "Co-champion").
- "⌀" in the averaging pill → Diameter icon; "⚠" before the horizon banner → TriangleAlert icon (chart label "⚠ days a-b" kept on the canvas).
- NEW model trust strip (pills, every figure from the same payload): "Champion · {model}" | "Co-champions · {A = B}" | "No champion"; "Tested · {n} held-out days · {start} – {end}"; "Horizon · {n} days"; "MASE {x} · beats|loses to seasonal-naive" (title = MASE header title); "WMAPE {x}%".
- Chart: forecast boundary labelled "forecast →"; a "NOW" marker is drawn only when today falls on the axis (today does not, data ends 30 Jun 2026).
- Loading card: title added above "Loading CO₂ forecast from AWS…" / "Database slow to respond — retrying…" (text unchanged) + skeleton.
- Error card: same title, message, note and "Try again"; inside StateNote.

Predictive — "Forecasted Fleet Composition"
- Headline block "Heavy share (C2+C3) · 30-day means / {now} → {end} {delta}" → answer "{now} → {end}" + delta pill, label "Heavy share (C2+C3) · 30-day means" (verbatim) under it, moved from the right of the header to under the title.
- Leaderboard caption "Ranked by Aitchison distance, the standard metric for compositional data — MAPE divides by the actual value, so on a fleet that is ~79% Class 1 and ~9% Class 3 it scores the same absolute miss ten times harder on the rarest class. SKILL is … Protocol: …" → visible "Ranked by Aitchison distance. SKILL is the ratio against a persistence baseline; below 1 means the model beats assuming the mix does not change. Protocol: {split_label}." (moved: the MAPE rationale sentence, verbatim, into "How this is measured" on the same card).
- Staleness line and surge banner: text unchanged, TriangleAlert icon added.
- Loading: title + "Loading…" (unchanged) + skeleton. Error/empty: same text in StateNote.

Prescriptive — "Projected % Emission Reduction by Strategy"
- Title, ⓘ and intro unchanged.
- The recommendation box became ranked action rows. Visible per row: tag ("Do this" / "Then" / "Not on this evidence" / "Nothing to do yet", unchanged), pill "Evidence-bounded" or "Policy target" (new), action = strategy label, lever sentence, meta "Where Corridor-wide" / "When Estimated over {from} to {to}" / "Confidence Likely {lo}–{hi} t · 5th–95th of {runs} Monte Carlo runs" (or "Bounded by what this corridor has already achieved" / "Policy target — not demonstrated by any observed change"), effect "{t} t · CO₂ {period} · {pct}% of what the corridor emitted" (new labels).
  - "Do this — {label}. {lever}. Worth {t} t of CO₂ {period} (likely {lo}–{hi} t): {pct}% of what the corridor emitted. Bounded by response times this corridor has already delivered, so it asks for no capability it does not have." → moved verbatim into the row's Details (its numbers are visible in effect/confidence).
  - "Then — …": "Do not add these two together. This one applies the same clearance floor to fewer hours, so it is a subset of the first, not an addition to it." stays visible verbatim (warning); full sentence also in Details.
  - "Not on this evidence — {label} would be worth {t} t — far the largest figure here — but it is a policy question for MPTC, not an operational one. {evidenceNote}" → visible "Far the largest figure here, but a policy question for MPTC, not an operational one."; full sentence + evidenceNote + "Policy target — not demonstrated by any observed change." verbatim in Details.
  - "Nothing to do yet": "No evidence-bounded strategy can be computed for this Range. {reason}" unchanged, visible.
  - NEW: each Details also lists the API's `assumptions[]` for that strategy (returned before, never rendered).
- Chart caption added: "Ranked by size"; key "Evidence-bounded" / "Policy target (hollow)".
- Basis note: "Against … Incident-based strategies use … / Not computed for this Range: …" visible unchanged; "{scenario} is drawn hollow because it is a policy target, not a demonstrated change. The other two are bounded by response times already delivered on this corridor, and their ranges come from a Monte Carlo resampling of the incidents." → moved verbatim into "How this is measured" on the same card.
- States: "Computing strategies…", "Strategies unavailable" + message / "No data returned.", "No emissions data in this Range" + server text: unchanged (error/no-data in StateNote).

### Second pass (wording and structure)

Same five files. Goal: less prose, more structure (mainly Predictive and Prescriptive), KPI rhythm, light theme, the zone-chip overlap.

##### Copy log (second pass)

Prescriptive
- The action rows became **ranked action cards** (one card per strategy, outside the evidence card, no nesting). Left: rank, tag ("Do this" / "Then" / "Not on this evidence" / "Nothing to do yet"), "Evidence-bounded" or dashed "Policy target" pill, the strategy label, and the answer "{t} t · CO₂ avoided {period}". Right: labelled rows **Action** (lever) / **Where** "Corridor-wide" / **When** "Estimated over {from} to {to}" / **Effect** (small inline bar scaled to the largest strategy, hollow for the policy target) "{pct}% of what the corridor emitted" / **Basis** "Bounded by response times this corridor has already delivered" or "Policy target — not demonstrated by any observed change" / **Confidence** "Likely {lo}–{hi} t · 5th–95th of {runs} Monte Carlo runs" (or "No Monte Carlo range returned for this strategy") / **Note** (warning ink).
  - "Then" note: "Do not add these two together. This one applies the same clearance floor to fewer hours, so it is a subset of the first, not an addition to it." → "**Do not add these two together.** It is a subset of #1, not an addition." (full sentence verbatim in Details)
  - Scenario note: "Far the largest figure here, but a policy question for MPTC, not an operational one." → "Far the largest figure, but a policy question for MPTC, not an operational one." (full sentence + evidenceNote + "Policy target — not demonstrated…" in Details)
  - Effect/answer labels: "CO₂ {period}" → "CO₂ avoided {period}".
- Evidence card (chart): the title, ⓘ and intro moved from page.tsx into the panel (text unchanged) so the loading/error/no-data states keep them.
- Basis paragraph "Against {t} t actually emitted over {from} to {to}. Incident-based strategies use {n} cleared incidents in the same window." → labelled rows "Actually emitted · {t} t over {from} to {to}" and "Incidents · {n} cleared incidents in the same window" (or "Not computed · Not computed for this Range: …"); the original sentences, verbatim, plus the "drawn hollow" explanation, are in "How this is measured".

Predictive · CO₂ forecast
- Answer "{n} t · CO₂ per day, mean forecast · {start} – {end} · {model}" → answer "{n} t · CO₂ per day, mean forecast" + labelled facts **Window** {start} – {end} / **Model** {champion} / **Measured to** {holdoutEnd} / **Scope** "Whole corridor, t CO₂ / day".
- Context sentence "Tonnes of CO₂ per day across the whole corridor · toggle models to overlay predictions · measured to …, forecast from …" → removed as prose: scope and dates are now the facts above; "Toggle models to overlay predictions" moved to the title of the "Models" label (the ⓘ already says "Pick a model above").
- Scoring caption "Scored on {n} held-out days at a {h}-day horizon · volume validates at 14d, so the two are not directly comparable." → moved verbatim into a "How it was tested" disclosure under the table (its figures are also in the trust pills). The tie sentence stays visible when there is a tie. (Named "How it was tested" so it is not confused with ModelNarrative's own "How this is measured".)
- Past-horizon banner (when the horizon is longer than 7 d): visible = "Only the first 7 days were checked against what actually happened." + the weak-stretch line (unchanged) + "Typical error" as one row per horizon bucket with a small bar (scaled to the largest WMAPE shown) and "{n}% off"; the full drift paragraph, verbatim, behind "Details". Hover titles (MASE, WMAPE) unchanged.
- Chart: the "Future" zone chip now sits just above the plot (it collided with "Present" on narrow screens); the legend is a single scrolling line (paging arrows on phones) instead of wrapping onto the axis labels.

Predictive · Fleet composition
- Context "Champion {m} · {n}-day projection · validated at 7 days · trained {date}" → pills "Champion · {m}" / "{n}-day projection" / "Validated at 7 days" / "Trained {date}".
- Staleness: same text, the fact in bold ("**Data ends {date} — {n} days ago.** This projection covers…").
- Surge banner (when present): dates visible; "A day is flagged when the projected Class 2+3 share runs more than 1.5 standard deviations above its training mean." → "How a surge is flagged" disclosure.
- Leaderboard caption: the visible "Ranked by Aitchison distance. SKILL is … Protocol: …" → pills above the table "Ranked by Aitchison distance" / "Protocol · {split_label}" / "SKILL < 1 beats persistence" (title = the full SKILL sentence). The full caption, verbatim (Aitchison rationale + SKILL + Protocol), is in "How this is measured".

Descriptive
- No copy changes. KPI row rhythm: at ≥1200 px the row is 4 columns with "Total CO₂ (Modeled)" and "Measured Air Quality" as wide bookend tiles (2+1+1 / 1+1+2). Same six tiles, same order; 3 columns below 1200 px, 2 below 980 px.

##### Inventory changes (second pass)
- [~] Prescriptive recommendation: now separate ranked action cards with labelled rows; every sentence the rows replaced is verbatim in that card's Details; `assumptions[]` stay in Details. Verified: 3 cards in recommendation order, rows Action/Where/When/Effect/Basis/Confidence, Details shows the full sentence + assumptions.
- [~] Prescriptive evidence card: title/ⓘ/intro now rendered by the panel (also on loading/error/no-data); horizontal ranked bars, hollow policy bar, tooltip unchanged; basis as labelled rows + "How this is measured". Verified: Range 3 mo refetches ("40,461 t … 2025-01-01 to 2025-03-31").
- [~] CO₂ forecast: answer + labelled facts; scoring caption behind "How it was tested" (verified opens with "volume validates at 14d"); the horizon banner is restructured (code path unchanged; not reachable with today's data since only "7 d" is offered); Future chip above the plot; scrolling legend (same entries, still click-to-toggle).
- [~] Fleet composition: context pills, scoring pills, caption and surge rule behind disclosures (verified).
- [~] KPI row: bookend layout at ≥1200 px (verified 6 tiles).
- All first-pass items unchanged otherwise. No data, fetch, state, effect or handler changes.

##### Diff guard (second pass)
Same command as above: 19 removed lines, identical to the first-pass list (all with equivalent added lines). The second pass removed no handler, aria, role, fetch or hook lines. The panel's page.tsx wrapper `<article>` (title/ⓘ/intro) moved into PrescriptiveEmissionsPanel unchanged; the panel's props/fetch are unchanged. `npx tsc --noEmit -p .`: exit 0. Parity: `scratchpad/emissions/parity4.mjs`, 10/10 pass, 0 page errors.

##### Screenshots (second pass)
`.playwright-cli/redesign-after/{dark,light}-{desktop,mobile}/emissions-{descriptive,predictive,prescriptive}.png` (full round; predictive re-shot after the legend fix). Light theme checked: cards, pills, rows and the hollow policy bar read cleanly; I found no washed-out areas on this page.

##### For the lead (second pass)
- ModelNarrative's quantityNote disclosure is now visible on the CO₂ card; first-pass item 1 is resolved by your change.
- Still true: no confidence band or live track record in the CO₂ API (not drawn); no NOW line because the data ends 30 Jun 2026; the pre-existing click-to-inspect closure issue (from first-pass item 7) is untouched.
<!-- COPY:emissions:END -->

## /dashboard/map-comparison (Live Map)
<!-- COPY:livemap:BEGIN -->
_From the Live Map agent's report (result-livemap.md)._

#### /dashboard/map-comparison (Live Map)
No existing string was cut or reworded. Changes:
- Queue hover cards (live and predicted): rows reordered by importance (Est. delay first, then Queue length / May extend to / where line / Speed, then Chance of a jam + basis + side-share note, then Typical traffic + quiet-hour warning). Same labels, values and sentences. (moved: same card)
- "A jam in a quiet hour is usually an incident or roadworks." : inline amber `#b45309` style → `.mjp-warn` class (ink, "!" marker). Text unchanged.
- Forecast legend (panel and `MapLegend variant="forecast"`): added row "No data" (grey: a stretch nobody forecast).
- Badges: "LIVE | {time}" and "PREDICTED" wrapped in a tag pill (text unchanged; the live dot now sits inside the pill).
- ForecastHorizonPicker moved from the forecast map's top-right overlay to a timeline docked under both maps (still inside a `.mc-forecast-controls` element). Heading "Forecast time", the three range buttons, their titles, the select and the day hint are unchanged.
- New copy (all factual, all from data):
  - "Live · updated N min ago" / "Stale · updated N min ago" (from `/real-time` `feed.newestAt`, `feed.stale`); "Forecast · +N h" (from the rows' `hours_ahead`).
  - Large forecast time on the forecast map: "4:00 AM" + "Today" (same hour rule as `clockFor`).
  - Header button "3D" (title "Tilt the maps (3D)").
  - Timeline: "Live" chip with the live age; ticks "+N h" (7-day peaks: short weekday).
  - Strip: "Corridor", "Km 12 Balintawak → Km 88.25 Sta. Ines" (from the exit list), mode "Live" / "Forecast +N h", "Hide"/"Show", lane tags "NB →" / "← SB", readout "Km 44.9 · NB · near Pulilan", "Waiting for the map…".
  - Key: "Clear / Slow / Congested / No data", "Live" (solid) / "Forecast" (hatched, dashed edge); on phones it folds to a "Legend" pill.
  - Jam callouts: "428 m · +1 min · NB"; predicted: "~190 m · +~2 min · SB".
  - Closure card: "Maintenance", "Northbound · km 76.25–73.23", title, "Lanes closed", "Status: In progress", "Scheduled: Aug 16, 8:00 AM – Aug 17, 8:00 AM".
  - Clock badge on the selected forecast segment: "+N h".

### Second pass (wording and structure)

What changed (same files; no new files; nothing in shared files or Back-End):
- **The map is the stage, both themes.** New layer `lm-ribbon-glow` (wide, blurred expressway-blue light under the halo, NB ribbons only so it is not doubled). The light theme's halo is now a luminous blue wash (`#3660ff`, 16%), no longer a dark shadow, and the light scrim is paper at 64% so the Mapbox light roads and labels go quiet. A soft stage-coloured vignette sits inside the map canvas, under the markers and controls: it darkens the edges at night and lightens them on paper. Colouring rules, the 50% rule and every existing layer, popup and modal are unchanged.
- **Calmer chrome.** Panel heads, footers, the timeline and the strip sit on the stage, not on cards.
- **Cards: fewer words, more structure.**
  - Exit card: the location is now a labelled "Where" row, next to Access and Toll.
  - Predicted queue card: the basis-and-side paragraph is now labelled rows ("Basis", "Source", "This side") plus one short line. All facts and numbers are kept.
  - Rows are split by hairlines.
- **Jam callouts** are capped at corridor zoom: the worst 4 below z10.5, 8 below z12, all of them closer in. Every queue keeps its glow and its card. The predicted delay now reads "~2 min", matching the card.
- **Timeline:** the chosen hour floats large above its tick ("2:00 AM · TODAY"); the large time on the forecast map stays.
- **Corridor strip as an instrument.**
  - One field: northbound lane, a dashed median, southbound lane. Lanes are 16 px pills with rounded ends.
  - An exit grid crosses both lanes, with longer ticks for named exits.
  - Jams are raised bars with a soft glow in their state colour.
  - A km ruler: minor ticks every 5 km, labels every 10 km, and "Km 12" / "Km 88.25" at the ends.
  - A floating cursor chip ("Km 44.9 · NB · near Pulilan").
  - A Live / "+N h" badge: green dot for live, violet ring for forecast.
  - Forecast mode keeps its hatch and dashed violet lane frames.
- **Mobile: the map first, with a sheet.** Each map is `clamp(340px, 60vh, 540px)` tall. Its overlays become a sheet under it: rounded top, grabber, then the data-age badge or forecast time, then the model card with the inert buttons, then the Legend pill. No overlay covers the mobile map any more.
- **Robustness:** the map's load handler now stops if that map was replaced (new hour or theme) or unmounted while its feed was loading. Before, it kept drawing on a removed map and threw "Cannot read properties of undefined (reading 'addEventListener')".

##### Copy log (second pass)
- Exit hover card: location line → row "Where: {location}" (same value).
- Predicted queue card: "{basis}. {n}% of jams here at this time of day are on this side ({h} live jam-hours); the other side is drawn only if it carries 40% or more." → rows "Basis: This exit, this hour | This exit, any hour | Corridor-wide (too little history here)", "Source: Waze jams 2022–2026" (only for the two per-exit bases, which named that source), "This side: {n}% of jams at this time ({h} live jam-hours)", then "The other side is drawn only at 40% or more." The no-shares wording "No live jams here yet to say which side, so both are drawn." → "No live jams here yet to pick a side, so both are drawn."
- Predicted callout delay "+~2 min" → "~2 min".
- New: the chosen time above its timeline tick ("{time} {day}"); strip ruler labels ("Km 12", "20" … "80", "Km 88.25"); badge "Live" / "+N h".

##### Inventory changes (second pass)
- [~] Predicted queue card: basis and side-share are now labelled rows. Every fact, number and data source is still on the card.
- [~] Exit card: location moved into a "Where" row.
- [~] Jam callouts: capped at corridor zoom (4, then 8, then all). Every queue still has its glow, its dot and its card.
- [~] Mobile: overlays move into a sheet under the map. Same controls and data, no extra clicks; the legend stays a `<details>` pill.
- [x] Everything else is as listed in the first-pass inventory. Re-walked in dark after these changes: layers, flow dashes moving, strip ↔ map hover, horizon tick, Live chip, ranges 12h/24h/7d (12/13/8 ticks), 3D 50°/0°, exit fly-to 12.5 and reset, predicted card, closure card, WazeLiveModal (Esc closes), ForecastExpandModal (backdrop closes), strip collapse, legend rows. 0 console errors.
- Light: the first light walk reached and screenshotted both modals (`ix2/light-07-wlm.png`, `ix2/light-08-fem.png`). The run then lost its session mid-walk; that is what raised the one page error, and the guard above now covers that path.

##### Diff guard and tsc (second pass)
- Diff guard over my files: empty output (no removed handler / fetch / hook / aria / role line).
- `npx tsc --noEmit -p .`: whole project clean (exit 0).

##### Screenshots (second pass)
- `.playwright-cli/redesign-after/{dark,light}-{desktop,mobile}/livemap.png` / `livemap-fold.png`: confirm round, 0 console errors, all four views.
- Interactions: `scratchpad/livemap/ix2/dark-*.png` (full walk), `ix2/light-07-wlm.png`, `ix2/light-08-fem.png`.

##### For the lead (second pass)
- **The login session is gone.** `session-refresh-once.mjs` now reports "SESSION LOST at /"; my read-only walks each spent the single-use refresh token. Any further screenshots need a fresh sign-in. So the last fix was not re-captured in the browser: a CSS tweak moving the strip's Live/+N h badge into the ruler row and pinning the first and last exit names to the strip ends. tsc is clean.
- `shots.mjs` ignores `--wait` for livemap (the view sets `wait: 14000`). On a slow first load the dark maps sometimes have not fired `load` by then (CARTO plus Mapbox's `load` waits for tiles); the full-page resize then shows them blank. Using `style.load` would draw the corridor sooner, but it changes when the map draws, so I left it.
<!-- COPY:livemap:END -->

## /dashboard/maintenance
<!-- COPY:ops:BEGIN -->
_From the Maintenance and Mobile App agent's report (result-ops.md)._

#### /dashboard/maintenance
- No visible wording changed. Subtitle kept (8 words): "Scheduled roadworks, closures, and asset upkeep across NLEX".
- Emoji icons replaced by drawn lucide icons (no text change): detail and form dialog 🛠️ → Wrench; delete dialog 🗑️ → Trash2;
  cancel dialog ⚠️ → AlertTriangle. Footer info glyph (inline SVG) → lucide Info.
- "Delete" (detail dialog) gains a Trash2 icon; wording unchanged.
- Added an sr-only accessible name "Search schedules" on the search input (was placeholder-only). Not visible.
- On ≤760 px the table becomes stacked rows; each stacked row shows the existing column names "Location" / "Window" as
  captions (CSS `attr(data-label)`), the same words as the column headers.
- Lane-closure sub-line and table labels render uppercase via CSS (`text-transform`); the wording is unchanged.

#### /dashboard/mobile
- No visible wording changed. Subtitle kept (8 words): "What the SmartFlow mobile app shows to travellers".
- Defaults banner: same words; "Showing built-in defaults, not saved settings." is now the StateNote title (own line) and the
  rest ("The configuration row could not be read, … run `Back-End/scripts/mobile-config.sql`.") its body. The AlertTriangle
  icon is replaced by the mascot (StateNote, offline mood).
<!-- COPY:ops:END -->

## /dashboard/mobile

## /dashboard/scenario-sandbox
<!-- COPY:admin:BEGIN -->
_From the Scenario Sandbox, AI Sandbox redirect, Data Management, Audit Log agent's report (result-admin.md)._

#### /dashboard/scenario-sandbox
- "Corridor totals with NB and SB beneath. **Average speed is flow-weighted** — each direction's speed weighted by its throughput, not a plain mean of the two. Longest queue is the worse of the two; density has no total." → "Corridor totals with NB and SB beneath." (moved: the rest, word for word, into an InfoTooltip on the same caption; `data-metric-caption` kept)
- Both-mode explainer "Both carriageways run together, median-separated, … clicking a lane on either road changes that road." → unchanged text (moved: behind a `.nc-details` "Details" disclosure at the top of the Traffic Simulation card)
- New label: "Simulation" (`nc-tag-illustrative`) on the metric strip and on every "Prescriptive recommendation" box (Both mode: one per direction)
- New label: "Model forecast" (`pill purple`) beside "Simulate a Forecast Day", so model output is never read as simulation
- New summary text: "Details" (the disclosure above)
#### /dashboard/ai-sandbox
- None (still renders nothing and redirects).
#### /dashboard/data-management
- No wording changes. "The backend is not answering" and "Pipeline Error" moved from `<h2>` headings to StateNote titles (same words).
#### /dashboard/audit-log
- No visible wording changes. Screen-reader labels added to unlabeled controls: `aria-label` "Search logs", "Category", "Severity", "Date range".
- The insights error lost its AlertCircle glyph. The StateNote mascot carries the error now; the text "Insights unavailable: {error}" is unchanged.
<!-- COPY:admin:END -->

## /dashboard/data-management

## /dashboard/audit-log

<!-- PARITY:BEGIN -->

---

# Parity check after the redesign

Every route was walked in the browser after its redesign (read-only: nothing was saved, published, uploaded or deleted; one deliberately wrong sign-in exercised the error state). Items are ticked `[x]` when present and working, `[~]` when changed on purpose with the reason beside them. Counts below include the agents' grouped items.

| Area | Verified [x] | Changed on purpose [~] | Open [ ] |
|---|---|---|---|
| Shell, sign-in, Overview (lead) | 52 | 0 | 0 |
| Traffic | 99 | 11 | 0 |
| Incidents and /incident/hourly | 111 | 41 | 0 |
| Emissions | 124 | 31 | 0 |
| Live Map | 96 | 15 | 0 |
| Maintenance and Mobile App | 63 | 11 | 0 |
| Scenario Sandbox, AI Sandbox redirect, Data Management, Audit Log | 84 | 23 | 0 |

### Shell, sign-in and Overview (lead)

Browser walk `parity-core.mjs` (4 Oct 2026, data-analyst session, dark, 1440×900): 52/52 checks passed, 0 console or page errors. Shell states verified separately: session check (mascot loader), collapsed icon rail with label tooltips, logout dialog (focus on Cancel, Esc closes, never confirmed), mobile drawer; reduced motion (story 1 static, no trails, one still frame) and light theme.

- [x] h1 SmartFlow NLEX
- [x] tagline
- [x] brand point "Live corridor status"
- [x] brand point "Predictive volume"
- [x] brand point "Incident intelligence"
- [x] logo light/dark images present
- [x] h2 "Sign In to Dashboard"
- [x] username field + placeholder
- [x] password field + placeholder
- [x] show/hide toggles type
- [x] remember me default checked
- [x] forgot password button
- [x] copyright
- [x] story labels (4)
- [x] story nav jumps
- [x] story dash jumps
- [x] pause control
- [x] stage canvas mounted
- [x] mascot ready on stage
- [x] submit pending label/disabled — Signing In...
- [x] error alert shows Supabase message — Invalid login credentials
- [x] no page errors on sign-in
- [x] nav group "Analytics"
- [x] nav group "Operations"
- [x] nav group "Planning"
- [x] nav group "Admin"
- [x] 10 sidebar links with hrefs — Overview, Traffic, Incidents, Emissions, Live Map, Maintenance, Mobile App, Scenario Sandbox, Data Management, Audit Log
- [x] active link is Overview
- [x] footer email + role
- [x] menu button aria-label "Toggle menu"
- [x] topbar logo + wordmark
- [x] breadcrumb
- [x] theme radios (3)
- [x] theme Light applies
- [x] theme Dark applies + stored
- [x] clock date + time
- [x] h1 "Overview" (accessible name)
- [x] corridor span subtitle
- [x] freshness strip
- [x] 3D canvas or fallback
- [x] drag hint
- [x] ruler keyboard moves km — 82.1 → 83.1
- [x] ruler valuetext names the exit
- [x] counts: 3 tiles + slowest
- [x] Live Corridor Status h2
- [x] SB / NB captions
- [x] legend + footer note
- [x] jam levels dialog opens
- [x] jam levels dialog closes on Esc
- [x] section progress (3 dashes)
- [x] section dash jumps (main scrolls) — scrollTop 699
- [x] no console/page errors on Overview

Changed on purpose (still available or replaced at the user's request):
- [~] Session-check spinner → the mascot whose headlights pulse (brief §5); the three gate messages unchanged.
- [~] Login four-lane SVG backdrop → the WebGL stage's two lanes of light trails (decoration only).
- [~] Page-header icon tile → the same icon inside the group eyebrow.
- [~] Overview 3D corridor and km ruler → removed at the user's request (4 Oct 2026); their readings live in the hotspot list and the Live Corridor Status stops (see the Overview copy log).
- [~] Overview page header → the hero (5 Oct 2026, user request); h1, eyebrow and corridor span moved into it, the header PNG mascot replaced by the 3D mascot.
- [~] Collapsed sidebar → an icon rail with tooltips instead of fully hidden (brief §5); the toggle and `ds-shell-collapsed` unchanged.


### Traffic

_From result-traffic.md._

Parity walk: `scratchpad/traffic/parity.mjs` + `recheck.mjs` (Playwright, msedge, read-only session, dark 1440×900), plus the
12-shot round. Console errors during the walk: 0; page errors: 0. `parity-dark.json` (final run) has 29 PASS and 2 FAIL;
both FAILs are harness artefacts (a case-sensitive /Share/ regex against the uppercase table head; a single click that missed a
line point) and both steps PASS in `recheck.mjs` (`recheck.json`: 6/6 PASS, incl. the hourly drill-down and backdrop close).

##### Page shell (all tabs)
- [x] PageHeader: icon TrendingUp, accent "traffic", title "Traffic Overview", subtitle unchanged
- [x] Section wrapper `viz-traffic`
- [~] Mode tab buttons Descriptive / Predictive / Prescriptive — moved directly under the header as their own row; the check-mark is
  replaced by the sliding accent underline + icon + hint (per kit); same onClick, aria-pressed added

##### Descriptive — Row A filters (now the sticky bar under the mode switch)
- [x] "Range" label; 3 mo / 12 mo / All / Custom (default 12 mo) — [~] calendar icon hidden by the shared module CSS (lead's layer)
- [x] Custom → DateRangePicker only when Custom; no fetch until both dates (logic untouched)
- [x] DateRangePicker trigger / popover / days grid / presets / two-click range / outside-click close (component untouched; trigger verified)
- [x] "Weather" All / Dry / Wet (default All) — [~] cloud icon hidden by the shared module CSS
- [x] "Updating…" while refetching with data on screen
- [x] (Hidden) plaza multi-select state still sent, still no control (recorded only)
- [x] NEW: active non-default filters as removable chips (Range, Weather, Class); × resets to the default via the existing setter

##### Descriptive — Row B KPI tiles
- [x] Total Volume: icon, (i), compact value, hover title "{n} vehicles", delta badge + "vs previous period"
- [x] Avg Daily Volume: icon, (i), integer value, 30-day sparkline (now through applyChartTheme, kit area fade) + "Last 30 days"
- [x] Peak Hour (Weekdays): icon, (i), hour, "{n} vehicles/hr avg"
- [x] Busiest Plaza: icon, (i), plaza name, "{x}% of selected volume"
- [x] Congestion Index: icon, (i), "{x.xx} / 5", delta (lower = good) + "vs prev · Waze jam level"; "no prior data" fallback
- [x] KPI fallback "—"

##### Descriptive — Row C Volume Trend (full width)
- [x] Title + (i); Direction Both/NB/SB disabled until Split with its title; Class CustomSelect (4 options, aria-expanded, outside-click)
- [x] Granularity Hourly/Daily/Weekly/Monthly (default Daily); Hourly disabled + title; grain-minimum titles; auto-demote (logic untouched)
- [x] Split NB/SB toggle; off resets Direction to Both (verified)
- [x] Series: Daily/Hourly volume (faint) + 7-day/24-hour average; weekly/monthly single "Volume"; split NB/SB with end labels; legend rules unchanged
- [x] X labels only where the period changes; compact y axis, not zero-based (now named "vehicles")
- [x] Axis tooltip with bucket label and integer values, "—" for null (unit "vehicles" added)
- [x] Click → detail modal with title/subtitle/6 rows/filters note (verified)
- [x] Empty "No volume data for the selected filters"

##### Descriptive — heatmap (now the hour row, left)
- [x] Title + (i); 24 h × Mon–Sun, Mon on top, 7-step ramp from the observed minimum (cells now gapped on the card surface)
- [x] Tooltip "{Day} {hour}" + "{n} vehicles/hr on average"
- [x] Click cell → modal (title, subtitle, 5 rows, filters note); backdrop closes (verified)
- [x] RampKey "Quieter"/"Busier", hover readout, band highlight, role="img" aria-label (2 keys found)
- [x] Empty "No data for the selected filters"

##### Descriptive — Volume by Plaza (now breakdown row, left)
- [x] Title + (i); sort button title/aria-label pattern (toggles, verified); "View all plazas" → full-ranking modal (verified)
- [x] Top 10 + "Others ({n})" pinned at the bottom in neutral grey (it was transparent in the shared dark layer; now visible)
- [x] Tooltip "{n} vehicles"; click bar → plaza / Others modal (verified)
- [x] Empty "No data for the selected filters"

##### Descriptive — Average Speed in Jams by Hour (now the hour row, right)
- [x] Title + (i); smoothed line with circle markers, y "km/h", framed on the data, blue ramp by speed (line 2 px)
- [x] Tooltip "{hour}" / "Avg speed in jams: {x} km/h" / "Avg jam level: {x} / 5"
- [x] Click → modal "{hour} — jam conditions", 5 rows incl. "vs 20 km/h threshold", whole-expressway note (verified)
- [x] RampKey "Slower"/"Faster"; empty "No congestion data in the selected range"

##### Descriptive — Impact card (now breakdown row, right)
- [x] Title switches with mode; (i); sort button; "View all" → list modal; Events / Holidays (default Holidays) (verified)
- [x] Diverging bars, 9 most-deviant, truncated labels, zero markLine (now visible), x "%"
- [x] Legend "Above baseline" / "Below baseline", not clickable
- [x] Tooltip full label / ±% vs same-weekday baseline / Baseline / Actual
- [x] Click bar / list row → event or holiday modal with baseline notes (verified)
- [x] Empty "No impact data available"

##### Descriptive — modals and states
- [x] Detail modal role/aria-modal/aria-label, icon, title/subtitle, Close (aria-label), zebra rows, footer note; backdrop closes; no Esc (unchanged)
- [x] "All plazas" modal: title, subtitle, columns #/Plaza/Volume/Share, Close
- [x] Events full list (5 columns, ± deviation, rows → event modal) — [~] deviation colour now ink + a swatch in the chart's own colour (was orange/blue hex)
- [x] Holidays full list (5 columns, sorted desc, rows → holiday modal)
- [x] Loading ChartSkeleton; error "Live data unavailable — is the backend running on port 4000?" (now in StateNote); filters footnote in every modal

##### Predictive — filter row
- [x] Range 3 mo / 12 mo / All only (no Custom); sets the history on the volume card (verified)
- [x] No Weather control on this tab; the Descriptive weather value is still sent (now also visible as a removable chip)

##### Predictive — Card 1 Traffic Volume Walk-Forward Forecast
- [x] Loading "Loading ML forecast from AWS…" (StateNote), no separate error state (unchanged)
- [x] Title + (i)
- [~] Finding banner → answer block (all values and the failed-acceptance suffix kept; see copy log)
- [x] Models toolbar: label, 5 pills tinted their series colour when on, aria-pressed, keep-one rule title, Show/Hide titles (verified)
- [x] Holt-Winters / Holts Linear disabled with Weather on, with their title
- [x] Default selection = API champion (logic untouched)
- [x] Weather on/off toggle with its titles; swaps to `_nw` variants (verified)
- [x] View Daily/Weekly/Monthly with titles and side effects; Ahead 2 wk/1 mo/2 mo/3 mo with disabled titles (verified)
- [x] Zone key Past/Present/Future with day counts, "to {date}", " · whole {weeks|months} shown" (swatches now match the chart's zone tints)
- [x] Chart series Actual Volume, "{Model} Prediction" per model, Rainfall bars on the right axis — [~] each model is drawn as two
  series of one name (solid to the forecast start, dashed after); the legend pill toggles both; the tooltip lists each model once
- [x] Zones Past/Present/Future + dashed dividers; period dividers W/M thinned to ~12; aggregated badge
- [x] Y axes "Total Vehicle Volume"/"Avg daily volume" and rainfall axis; month ticks, forecast start/end labelled
- [x] Legend (bottom); dataZoom slider; tooltip incl. rainfall band text and footer
- [x] Click point / x label (Daily) → Hourly Breakdown — verified in `recheck.mjs` (see Screenshots)
- [x] Rainfall key (title texts, 4 PAGASA bands)
- [x] Narrative: "Generate report" → "Narrative Explanation", "Hide report", context line, AI read-out (verified; AI states unchanged)
- [x] Validation evidence disclosure (`<details>`, `.evidence-summary`), ShieldCheck, chip, Show/Hide — [~] now the trust strip
- [x] Held-out accuracy heading + (i); Show/Hide secondary metrics (verified)
- [x] Metrics table columns Model (dot, label, Rank #r of N / Rejected, sticky), WMAPE, MASE (title, green <1 / red ≥1), MAE, RMSE, R²
- [x] Secondary MAPE, sMAPE, RMSSE, Train R², Gap (red >0.15); "—" before fetch
- [x] WeatherEvidencePanel heading + (i), verdict, per-model bars and deltas, caption, signal chips with titles and "on chart"

##### Predictive — Card 1b Hourly Breakdown
- [x] Title + (i) + weekday pill + Forecast pill (violet); summary line variants; weather-filter notes; "← Back to daily"
- [x] Models toolbar + Weather toggle with sun icons; chart series/axes/tooltip/legend (var() colours fixed to theme literals)
- [x] "Loading hourly breakdown…" / error text (StateNote); stat tiles Day Actual / {Model} Predicted + % vs actual / Peak / Quietest

##### Predictive — Card 2 Predictive Congestion State Map
- [x] Loading text; error state with title, (i), error text, "Try again" (re-runs the 3-try load)
- [x] Title + (i); model pill (+ not accepted, title); stale "⚠ refresh overdue" and "⚠ expired" pills with their titles
- [x] Subtitle variants incl. "{n} hours not yet forecast"; hidden help title span
- [x] Range group role="group" aria-label="Forecast range", aria-pressed, help titles (verified 12h/24h/7 days)
- [x] Finding banner by severity (headline + lead line, lead hidden in week view) — now with the road's signal glyph
- [x] 2×2 stats with their titles and tones
- [x] Exit picker "{n} of {N} exits", select ("⚠ Add exit…" + title), options, "All {N}", "reset" (verified)
- [x] Legend hourly (Moving/Heavy/Severe/km/h, Heavy dimmed + title, "* km-post estimated" + title); week legend 5 bands + caption
- [~] Hourly heatmap: Moving / Heavy / Severe now use `--signal-clear / -slow / -congested` (was blue/amber/red) per the three-state rule;
  pending cells blank; rows, columns, thinning, elapsed-hour greying unchanged
- [x] Bar strip "Segments congested" with axis title, "0"/"{N} exits", peak highlighted, value labels (var() colours fixed)
- [x] Cell tooltip (all blocks) and pending/strip tooltips (raised theme surface)
- [~] Week heatmap: bands keep their labels and thresholds; colours now the Traffic accent heat ramp (a count, not a state); number in every cell (contrast-picked ink)
- [x] "What to act on · {n} episodes · …" + "View all {n}"; episode rows (SEVERE/HEAVY pill, exit + km, jam line + title, window, confidence)
- [x] Empty episodes text
- [x] CongestionNarrative chips/context/AI read-out (unchanged component)
- [x] Validation evidence disclosure + summary chip + Show/Hide; evidence 1–9 and footnote (all figures, captions, tooltips kept) (verified open)
- [x] Episodes modal: role/aria-modal/aria-label, title, subtitle, groups, ✕ (aria-label Close), backdrop, Esc closes (verified), body scroll lock, footer — [~] now portaled to `<body>` (inside `.viz-traffic`) so no animated ancestor can trap it

##### Predictive — Card 3 Event Surge Impact by Exit
- [x] Loading text; title + (i); mode pill (Observed neutral / Forecast violet); model pill (tested/failed + diagnosis title)
- [x] "Showing" select (past + upcoming options) + baseline (i) (verified: 14 options, switching shows the Forecast pill)
- [x] Finding sentence (observed / upcoming variants, "(inferred)" title)
- [x] 2×2 stats; bar chart "Added by event" (≥4% share), x "Extra vehicles per day", bar labels, tooltip (accent per theme)
- [x] EventSurgeNarrative (unchanged)
- [x] Validation evidence disclosure: chip, "the other {n} exits", Show/Hide; replay dumbbell (legend, zoom note, hover box); stats;
  examples; Arena caption + (i); model table with "used" and "Ignoring the event"; caption; chip row with titles, "+{n} more"/"fewer",
  barriers/ramps excluded (verified open + more/fewer)

##### Prescriptive
- [x] Filter-row note (shortened, see copy log); no Range control (verified)
- [x] Booth panel: states (StateNote, same words); title + (i); Week ahead / Hour by hour (verified); throughput slider 150–800 step
  25 default 350 (verified: → 375 refetches); info banner → action card (all text kept); "Not enough booths" alert banner (+ more
  plaza-days, "!"); week table columns and cell deltas/"!"/titles; hour view intro, rows, HourStrip (accent), peak/queue column;
  "Show all {n} plazas" / "Show the 8 busiest" (verified); footnote (champion, WMAPE, acceptance, stale-forecast warning, profiles,
  booth source) visible
- [x] Congestion Response: states; title + (i); banner variants; top-3 → ranked action cards (glyph + ACT/PREPARE/MONITOR, First
  High, Peak, action sentence) + Details; "Show|Hide the {n} elevated segment(s) not advised" → chips (verified, 12 chips);
  missing-forecast note; V/C footnote
- [x] Event Intervention: states; title + (i); banner → action card (all text kept); table top 10, top 3 highlighted, 7 columns
  (verified); footnote (weights, Estimate thresholds, pointer to the Predictive card)

##### API endpoints (unchanged; no request touched)
- [x] /api/traffic/analytics, /api/traffic/forecast (+ hourly, hard-coded host unchanged), /api/traffic/weather-evidence,
  /api/traffic/forecast?months=all (shared loader), /api/traffic/prescriptive, the three /api/ai-insight POSTs
- [x] localStorage/sessionStorage/URL params: none, still none

#### Diff guard

Command (owned files only):
`git diff -U0 -- <page.tsx, PredictiveVolumeChart, PredictiveCongestionChart, PredictiveEventChart, PrescriptiveTrafficPanels,
prescriptiveTraffic.shared.ts, CongestionNarrative, EventSurgeNarrative, WeatherEvidencePanel, RampKey, ModelNarrative> | grep -E
'^-.*(on[A-Z][a-zA-Z]+=|fetch\(|href=|use(State|Effect|Memo|Callback|Ref)\(|router\.|localStorage|aria-|role=)'`
→ 43 removed lines (full output: `scratchpad/traffic/diffguard.txt`). Every one has an equivalent added line:
- page.tsx — Range / Weather / Events-Holidays / mode-tab buttons `onClick={() => setRangeMode(m)}` / `setWeather(w)` /
  `setImpactMode(m)` / `setActiveTab(t)`: re-added verbatim in the single render tree (aria-pressed added). DateRangePicker
  `onChange`, CustomSelect `onChange`, split checkbox `onChange`, Direction / Granularity `onClick`, both RampKey `onScrub`, both
  "View all" `onClick`: re-added verbatim. Both sort buttons' `onClick` + `title` + `aria-label`: moved into a `sortButton()` helper,
  identical. The five KPI icon `aria-hidden="true"` spans: re-added verbatim (re-indented).
- ModelNarrative — `onClick={() => setOpen((v) => !v)}`: re-added on the "Hide report" button.
- PredictiveCongestionChart — "Try again" `onClick`, `role="group" aria-label="Forecast range"`, "All {N}" / "reset" /
  "View all" `onClick`, the flex-break `aria-hidden` span, the modal's `stopPropagation` and ✕ `onClick` + `aria-label="Close"`:
  all re-added with classes instead of inline styles (dialog now portaled).
- PredictiveEventChart — "+{n} more"/"fewer" `onClick` and the flex-break `aria-hidden` span: re-added.
- PredictiveVolumeChart — secondary-metrics `onClick`, `closeDrill`, both Weather `onClick`, Ahead `onClick` + `disabled`:
  re-added. `horizonDays={VALIDATED_HORIZON}` is a false positive (the regex matches "onDays="); it is re-added unchanged.
- PrescriptiveTrafficPanels — slider `onChange` (its inline accentColor moved to CSS), "Show all" and "Show the elevated" `onClick`:
  re-added (aria-expanded added to the latter).
No hook, fetch, effect, state, dependency array, route, query param or storage key was removed or changed. Additions only: aria-
pressed / aria-label / aria-expanded attributes; the chip × handlers (existing setters with their defaults); a theme-reading hook
`useTrafficPalette()` (useChartTheme + useMemo, presentation only) in the three predictive cards and `useChartTheme()` in the
volume card, the same pattern the kit prescribes for literal chart colours.

Typecheck: `npx tsc --noEmit -p .` → 0 errors (whole project, at the time of the final run).

#### Second pass

Files touched again: `page.tsx`, `PredictiveVolumeChart.tsx`, `PredictiveCongestionChart.tsx`, `PredictiveEventChart.tsx`,
`PrescriptiveTrafficPanels.tsx`, `nc-traffic.css`. Same rules: no data, logic, hook, fetch or handler change; every never-cut fact
is still on its card, visible or one click away in an InfoTooltip or a "How this is measured" disclosure.

###### Copy log (second pass)

####### /dashboard/traffic — Descriptive (`page.tsx`)
- "Average Volume by Hour × Day of Week" → "Average Volume by Hour and Day" (title ≤ 6 words; its (i) unchanged).

####### PredictiveCongestionChart
- Finding: the exit list leaves the sentence and becomes a labelled chip row. Variant selection is identical; only the
  parenthetical moves. E.g. "…By the peak it is all but 5 exits (Sta. Ines, Dau, Angeles, Mexico, Bocaue Barrier keep moving), with
  4 crawling under 10 km/h." → "…By the peak it is all but 5 exits, with 4 crawling under 10 km/h." + row "KEEP MOVING [Sta. Ines]
  [Dau] [Angeles] [Mexico] [Bocaue Barrier]". The "{n} of {N} exits ({list})" variant likewise → "{n} of {N} exits" + row
  "CONGESTED [exits…]". The "every exit" and "{n} neighbouring exits over about {km} km, km a to b" variants are unchanged.
- Lead line "Worst: {exit} from 7AM, typically a ~200 m queue ~190 m from {plaza} · ~2 min delay." → labelled row "WORST {exit}
  from 7AM · typically a ~200 m queue ~190 m from {plaza} · ~2 min delay." ("Heaviest" variant the same).

####### PredictiveEventChart
- Upcoming finding "During {act} (inferred) at {venue} ({n} capacity) on {date} · in {n} days: expect +{n} extra vehicles. {exit}
  takes {x}% of it, {m}× its normal {weekday}." → "Expect +{n} extra vehicles during {act} (inferred)." + rows "WHEN {date} · in
  {n} days · at {venue} ({n} capacity)" (venue only off the Arena, as before) and "TOP EXIT {exit} takes {x}% of it, {m}× its
  normal {weekday}". The observed finding is unchanged.

####### PredictiveVolumeChart — Hourly Breakdown
- Summary sentence "Peak {h · n} · quietest {h · n} · {Model} was {x}% under the day's actual · rain {x} mm (heaviest {h}) ·
  {a}–{b}°C" → pills "{Model} was {x}% under the day's actual", "Rain {x} mm · heaviest {h}" / "No rain recorded", "{a}–{b}°C".
  Peak and quietest are not repeated: they are the Peak Hour / Quietest Hour tiles on the same card. The forecast-day sentence and
  the weather-filter notes are unchanged.

####### PrescriptiveTrafficPanels
- "Not enough booths" banner ("Not enough booths. {day} at {hour}, {plaza}'s {where} booths would need {n}, and there are {n}: about
  {n} vehicles an hour queue with every one of them open. Staffing cannot clear that; divert traffic or post an advisory there.
  {n} more plaza-days this week run past their booths too, marked ! below.") → alert action card: kicker "NOT ENOUGH BOOTHS",
  headline "Divert traffic or post an advisory at {plaza}", rows WHEN "{day} at {hour}", WHERE "{plaza}'s {where} booths", EFFECT
  "About {n} vehicles an hour queue with every one of them open", BASIS "Would need {n} booths; there are {n}. Staffing cannot clear
  that.", THIS WEEK "{n} more plaza-days run past their booths too, marked ! below".
- Hour view intro "Booths needed hour by hour on {day} ({type}). Plazas do not peak together — the tallest bar is each plaza's own
  busiest hour. Red hatching is need beyond the booths the plaza has." → "Booths needed hour by hour on {day} ({type})" + (i) holding
  the other two sentences (the hatching one still only when some plaza runs short) + a key: "Peak hour" / "Other hours" / "Need
  beyond booths".
- Booth footnote (≈90 words, visible) → visible row "BASIS {model} forecast · WMAPE {x}%" + pill "Failed its acceptance gate ·
  level less certain" (only when not accepted) + the stale warning as an alert banner "Its first day, {d}, is already inside the
  record, which now runs to {d}: this plan is for days already past. Retrain the volume models to plan the coming week." (only when
  stale); the whole original footnote, word for word, now sits under "How this is measured" on the same card.
- Congestion Response footnote (volume-to-capacity ratio) → under "How this is measured", word for word.
- Event Intervention footnote (TOPSIS weights, Estimate thresholds, pointer to the Predictive card) → under "How this is measured",
  word for word.

###### Inventory changes (second pass)
- [~] Descriptive heatmap title shortened (see copy log); (i), chart, modal, RampKey unchanged.
- [~] Congestion finding banner: exit list as chips, lead line as a labelled row (same values, same variant logic).
- [~] Event finding (upcoming variant): answer + WHEN / TOP EXIT rows; "(inferred)" keeps its title.
- [~] Hourly Breakdown summary line → pills (peak/quietest stay in the tiles).
- [~] Booth alert banner → alert action card; hour-view intro → line + (i) + key; footnote → BASIS row + warnings visible, full text
  under "How this is measured".
- [~] Congestion Response V/C footnote and Event Intervention weights footnote → "How this is measured".
- [~] Prescriptive layout: Booth plan full width; Congestion Response (4 of 12 columns) beside Event Intervention (8 of 12) at ≥ 1280 px,
  stacked below that.
- Everything else from the first-pass inventory is unchanged and still present.

###### Diff guard (second pass)
Re-run on the owned files: 44 flagged removed lines; 43 are the first-pass lines explained above (unchanged). The one new line,
`if (!open) return <GenerateReportButton onClick={() => setOpen(true)} />;` in ModelNarrative, is not my edit: another agent made
ModelNarrative render `quantityNote` as a "How this is measured" disclosure (the Emissions caveat the inventory listed as never
rendered); the same `onClick` is re-added on the line below it. The volume card passes no quantityNote, so Traffic is unaffected.
From my second pass: no removed handler, hook, fetch, aria or role. The only removed JSX in this pass is
prose (the booth alert sentence, the hour intro, the three footnotes moved into `<details>`, the hourly summary sentence, the event
upcoming sentence), all re-added in the new structure. No dependency array changed.

###### Light theme
Checked all three modes in light at both widths: tokens carry it; tints use `color-mix` on the state/accent tokens, tables and pills
use the hairline tokens, chart furniture comes from `useChartTheme()` / the palette hook, so the lead's light-token upgrade flows
through without page changes.

###### Screenshots (second pass)
Final: `.playwright-cli/redesign-after/<dark|light>-<desktop|mobile>/traffic-{descriptive,predictive,prescriptive}.png` (descriptive from the second-pass round; predictive and prescriptive re-shot after the fix pass). Interaction shots: `scratchpad/traffic/parity/event-upcoming-{dark,light}.png`, `booth-hour-{dark,light}.png` (hour view + "How this is measured" open; the disclosure holds the booth source and profile window, verified).

Typecheck after the second pass: `npx tsc --noEmit -p .` → 0 errors.


### Incidents and /incident/hourly

_From result-incident.md._

##### /dashboard/incident

Shared header and filter row
- [x] PageHeader "Incident Overview", AlertTriangle, accent="incident" (data-accent)
- [x] Subtitle "Road crashes, hazards, and response patterns across NLEX" (8 words)
- [x] Section class `viz-incident`
- [~] Range group: label + "3 mo" | "12 mo" | "All" | "Custom", default 12 mo — check SVG replaced by accent fill (+ aria-pressed); calendar icon was already hidden by the shared CSS and is removed
- [x] Custom → DateRangePicker bounded by data.meta min/max (picker itself is the lead's, untouched)
- [x] DateRangePicker trigger / popover / day grid / months & years / presets / outside click (shared component, unchanged; opened in parity walk)
- [~] Weather group "All" | "Dry" | "Wet" on Descriptive + Predictive, not Prescriptive — cloud icon removed (hidden by shared CSS already), check SVG → accent fill
- [x] "Updating…" while refetching (Descriptive only)
- [~] Mode tabs — moved out of the filter row to their own row directly under the header (brief 5a), with icon + hint + sliding underline; same onClick, now aria-pressed

Descriptive — KPI row
- [x] Total Incidents + tooltip, value, `{±x.x%} vs previous period` (green ≤0, red otherwise) — 45,521 / +12.1% (matches baseline)
- [x] Injuries + tooltip, `{n} fatalities in range` — 805 / 12
- [x] Avg Response Time + tooltip (text unchanged, incl. the Secondary Incident Risk reference), `breakdowns only · {n} of {total} logged` — 27.1 min (hint may take 3 lines on phones now instead of being clipped)
- [x] Top Hotspot + tooltip, `Km X–Y`, `{x.x}% of located incidents` — Km 0–4 / 14.1%
- [x] Crash Rate in Rain + tooltip, `{x.xx}×`, `{wet} vs {dry} crashes/day, wet vs dry` — 1.19× / 15.7 vs 13.2

Descriptive — Incident Trend
- [x] Title + InfoTooltip
- [~] Incident type CustomSelect (All types / Accidents / Breakdowns, scopes the whole fetch) — moved to the sticky filter bar; chip shows when not All
- [x] CustomSelect behaviour (aria-expanded, check, outside click)
- [~] Granularity Daily | Weekly | Monthly, default Monthly, disabled-with-title when too short, auto-demote — moved into the card header; check SVG → fill
- [x] Small multiples Accidents / Breakdowns, own y-axes, coloured panel titles, smooth lines; area fill now the kit's 28%→0 fade
- [x] Series names, partial-bucket trim, bottom-panel-only x labels, linked axis tooltip, "—" for null
- [x] Click opens detail modal (title, subtitle, 5 rows, filtersNote) — verified
- [x] Empty note "No incident data for the selected filters"

Descriptive — When Incidents Happen
- [x] Title + InfoTooltip
- [~] Takeaway `Peak around … · quietest around … · busiest day: …` — same three values as answer line + context
- [x] By hour | By day toggle (default By hour)
- [x] By hour lines Weekdays/Weekends, `Peak · {h}` markPoint, y name, every-3h labels, bottom legend, `{x.x} / day` tooltip
- [x] By day bars, busiest highlighted + labelled, tooltip text
- [x] Click modals (hour / day) unchanged
- [x] Empty note

Descriptive — Hotspots by Km Segment
- [x] Title + InfoTooltip; sort button (title + aria-label unchanged); "View all" + chevron
- [x] Top-10 horizontal bars, `Km X–Y`, magnitude shading, no legend, tooltip text
- [x] Click → detail modal with note; empty note

Descriptive — Causes / Types
- [x] Dynamic title + InfoTooltip; sort button
- [~] Mode toggle "Accident causes" | "Breakdown causes" | "Types" — moved to its own row under the title (title no longer truncated)
- [x] Top-9 bars, 24-char cut, series "Incidents", tooltip; click modal; empty note

Descriptive — Dry vs Wet
- [x] Title + InfoTooltip; grouped bars, series, legend, y name, tooltip; click modal incl. exposure note; empty note

Descriptive — Response Time Breakdown (EventBreakdownPanel)
- [x] Rendered with no props (fixed 12 mo)
- [x] Title + InfoTooltip; "Median Dispatch Response Time"; By Cause | By Service (aria-pressed); top-10 bars, x name; tooltip; caption; loading / unavailable texts
- [~] Card is now half width (paired with the new heat grid) instead of full width

Descriptive — modals and states
- [x] Detail modal role/aria-modal/aria-label, Siren icon, rows, footer note, Close aria-label, backdrop closes, no Escape (unchanged)
- [x] filtersNote text
- [x] View-all modal, title, subtitle, Close, table columns, every segment, row → detail — verified (20 rows)
- [x] ChartSkeleton while first loading; error placeholder text

Predictive — Incident Walk-Forward Forecast
- [x] Range (Custom → months=all + from/to) and Weather passed through (props unchanged)
- [x] Loading "Loading ML forecast from AWS…"; error "Predictive analytics unavailable" + message / "Database not reachable" (now StateNote)
- [x] Title + InfoTooltip; subtitle "Click any point to view that day's hourly breakdown"
- [x] Split toggle Total | Accident / Breakdown (aria-pressed, wrapper title), only with accidentSplit
- [x] Volume toggle (default off, car icon, 4 titles); Weather toggle (default on, rain icon, 4 titles); both now aria-pressed
- [x] Toggles re-query with volumeToggle/weatherToggle (fetch untouched)
- [~] Models label + chips, one per stored model, aria-pressed, titles, ≥1 stays on, opens on champion — restyled as hairline chips with each model's hue as a dot/tint (were solid colour fills)
- [x] Split-view model note text
- [x] "Each point = {7-day|~30-day} mean, not a total" badge when aggregated
- [~] GRANULARITY Daily | Weekly | Monthly with titles — active shown by fill, "✓ " prefix removed
- [x] Past chip `{n}d trained · {x.xx}% · showing last {n}d` — 1,186d · 92.95% · 248d (matches)
- [x] Present chip `{n}d scored · {x.xx}% · fixed by evaluation` — 90d · 7.05%
- [x] Future chip 1 wk / 2 wk / 1 mo, disabled + title when beyond horizon, `· validated at {n}d`; hidden with no future rows — now the end of the toolbar row directly on the chart
- [x] Chart 450 px, pointer cursor, click on point / x label opens hourly — verified
- [~] Series Rainfall / Vehicle Volume / Actual Count / `{Model} Prediction` — prediction lines now dashed (kit: model output dashed, record solid); Actual and model lines no longer bridge null days (connectNulls off, kit "never interpolate across a gap")
- [x] y-axes Incident Count / Rainfall (mm) / Vehicle Volume (k)
- [~] Split view panels Accidents / Breakdowns, Actual solid + Forecast dashed, overlays — lines no longer bridge nulls
- [~] Legend entries unchanged; total view now uses the split view's line swatches (solid = Actual Count, dashed = predictions) instead of circles
- [x] Past / Present / Future bands + labels (6% rule) + dashed Past/Present divider
- [~] Present/Future divider is now the kit's solid ink marker labelled FORECAST
- [x] W1…/M1… period dividers thinned to ≤12 (neutral theme colours instead of blue/green washes)
- [~] dataZoom slider + inside, reset to 0–100 — slider now neutral ink instead of amber/sky blue
- [x] Tooltip date header, units (mm, vehicles), footer "Click to view hourly breakdown" / "Switch to Daily to open a day"
- [x] Rain key "Daily rainfall", four bands with mm ranges, "Taller bar = wetter day"
- [~] Split disclaimer — every fact kept; reordered so the skill caveat stays visible, the why behind Details (see copy log)
- [x] "Real-World ML Validation Metrics" table, columns, selected models only, colour dot, WMAPE %, 3 dp, R² 4 dp in model colour — Poisson GLM 18.269 / 13.899 / 10.49% / 0.880 / 0.1405 (matches)
- [x] MetricHint formula headers (tabIndex 0, portal role=tooltip) and model-name hints — restyled as raised surface
- [x] "Champion" label + title; "(full holdout)" + title; R² hidden title
- [x] Weather panel heading/caption/columns/Champion/empty text (wet info tint; dry tint now neutral)
- [x] IncidentNarrative: "Generate report" only until pressed; opened → "Narrative Explanation", "Hide report", scoringCaption (+ weather), AiModelInsight (now the shared nc-narrative shell)
- [x] AiModelInsight states (lead's component, untouched)
- [~] New: model trust strip (champion, test window, MASE vs baseline, MAE/WMAPE) jumping to the validation section; no live track record pill (no such data on this response)

Predictive — Predicted Incidents Ranking
- [x] Fed from PIC's response, no fetch
- [x] Loading / unavailable texts (unavailable now StateNote)
- [x] Title + InfoTooltip (text unchanged)
- [x] Pills Model / Volume ON|OFF / Weather ON|OFF + group title
- [x] Unclassified note (>0)
- [~] Headline sentence → answer + context, same values and verdict logic
- [x] "Segment forecast ranking", `Predicted incidents · next {h} days`, shade key, "Hover a row to inspect its numbers"
- [x] `Top {n}` / `Next {n}` group headings
- [~] Row: rank, label (ellipsis + title), shaded bar, value, "Highest" badge — bar ramp violet + theme-aware (was amber), value no longer in a bordered box, badge in page accent (was warning amber)
- [x] Row hover tooltip text (mouse only, as before)
- [x] Axis ticks 0/25/50/75/100%, caption
- [x] `See {n} more segment(s)` → dialog (role/aria-modal/aria-label, title, ranks line, Close aria-label, backdrop closes) — verified
- [x] NarrativePanel contextLine and payload unchanged

Predictive — Response Time Breakdown (model)
- [x] No params; loading / unavailable texts (unavailable now StateNote)
- [x] Title + InfoTooltip; `Model: {champion}` pill + title — Model: CoxPH
- [x] Tiles Held-out MAE / R² or Concordance / Trained — 18.8 min / 0.563 / Sep 30, 2026 (matches)
- [x] Sub-heading + By Cause | By Service (aria-pressed)
- [x] Top-8 bars, series "Predicted", `{v}m` labels, x name, no legend, tooltip
- [x] Caption; empty text; NarrativePanel contextLine (regenerates by view)

Prescriptive — Resource Staging & Patrol Repositioning
- [x] Range passed (props unchanged)
- [x] Loading / unavailable texts (unavailable now StateNote)
- [x] Title + InfoTooltip (hint unchanged)
- [x] By Exit | By Km (By Km disabled without km data), default By Exit
- [x] Fleet size slider 1..min(12, rows), default 4, `{n} units`; Coverage radius 1..40, default 8, `{n} km` (native range inputs; keyboard re-solves — verified)
- [~] Banner "Recommended staging: {labels}." + coverage sentence — now an action card (title + structured facts); the full sentence is under Details verbatim
- [x] Table columns {Exit|Segment} / Km / Predicted incidents / Rate /km / Status; staffed rows tinted; busiest first; 8 rows — matches baseline (Balintawak 1,136 …)
- [~] "● STAFFED" → "Staffed" pill with a drawn dot
- [x] Show all {n} / Show the 8 busiest
- [~] Hotspot monitoring alert sub-card → action card; paragraph split into lede + Details; header row and scroll list (220 px, ds-scroll-fade) kept; values no longer in warning amber (page accent)
- [~] Proactive speed advisory → action card; paragraph under Details; top-3 rows and rain chips kept; AUC shown as Confidence
- [x] Foot (model + days, fleet disclaimer) visible
- [x] MCLP solved in the browser on every change (logic untouched)

Prescriptive — Patrol Alert Schedule
- [x] Range passed; loading / unavailable texts (unavailable now StateNote)
- [x] Title + InfoTooltip
- [~] Banner → action card (same sentence as the title/lede; rule under Details)
- [x] Table Day / Alert window / Peak hour / Shape; Mon→Sun; widest day's window in accent + bold — Thu 7 AM – 6 PM (matches)
- [~] Shape cell: 24 bars, height = magnitude, shade = percentile rank, per-bar title — ramp now the theme-aware violet (navy vanished on dark)
- [x] `No {Day} in this Range`; Foot with day counts

API endpoints / storage / polling
- [x] All fetches, params and caching untouched (no fetch/useEffect/useState line changed); no localStorage; no polling

##### /dashboard/incident/hourly
- [~] PageHeader `Hourly Breakdown — {date}` — date moved to the subtitle (Display Rule); AlertTriangle, accent incident kept
- [~] Subtitle variants — shortened to ≤15 words; full sentences under "How this is measured" on the chart card; "Loading…" kept
- [x] "Back to daily" link to `/dashboard/incident?tab=Predictive&…` — verified it restores the Predictive tab
- [x] Invalid/missing date: "Hourly Breakdown" / "No day selected" / Back link
- [~] Empty state `ds-empty-state` kept; AlertTriangle 28 px → mascot (StateNote); heading + body text unchanged (heading is now StateNote's strong, not an h4)
- [x] Suspense fallback "Hourly Breakdown" + "Loading…"
- [x] Weather chips All | Dry | Wet, disabled + `No {dry|wet} hours recorded on this day` (now aria-pressed; check SVG → fill)
- [x] Unknown-weather hours drop out of Dry and Wet (logic untouched)
- [x] Info line `{weekday} · wet = rainfall > {t} mm/hr · {prediction type}`
- [~] Models label + 7 chips, aria-pressed, disabled reason, lock, Hide/Show titles, opens on champion — restyled as hue-dot chips
- [x] "Rain & Temp" toggle, default on, aria-pressed, title
- [x] No-log warning text (moved above the cards); partial-coverage note text (moved above the cards; emoji → icon)
- [x] Loading / error texts in the chart body
- [x] Series Actual Incidents (null = no bar), wet-hour band, `{Model} Prediction` (now dashed), Rainfall (mm), Temperature (°C) dashed
- [x] Y axes Incidents (integer) / Rainfall (mm) / Temp (°C) (hidden when overlay off); x 12 AM…11 PM rotated, every other label
- [~] Legend entries unchanged; icons now the kit's pills (were circles)
- [x] Tooltip `<b>{hour}</b> ({wet hour | dry hour | no reading})`, units, `Road · Moto · Stalled` footer (greys now theme tokens)
- [x] Tiles Day Actual / {Model} Predicted (model colour, champion hint) / Peak Hour / Quietest Hour / Rainfall
- [x] Unknown-weather note; derived-shape note (`hourly_weather`, `{n} of 24 hours reported`, "not forecast")
- [~] New: hour × source heat grid first (brief: "hour-by-exit heatmap first" — this endpoint has no exit dimension, so the grid is by logged source)

##### Implementation hooks (both routes)
- [x] `viz-incident` on the page section (now also on the hourly page) and PageHeader accent="incident"
- [x] Global classes: `chart-card wide`, `ds-rise`, `ds-empty-state`, `ds-scroll-fade`, `ds-narrative-cta`/`btn`/`loading`/`spinner`/`error` (via the shared narrative components), `ds-page-header*`
- [x] InfoTooltip (shared, unchanged)
- [x] MetricHint tabIndex 0, hover/focus, portal role=tooltip
- [x] `attachCategoryClick` on the Descriptive line charts (chartFrame untouched)
- [x] ECharts colours are literals from useThemeTokens/useChartTheme (no var() inside options; tooltip HTML may use var(), it is DOM)
- [x] Every dialog: role, aria-modal, aria-label, Close aria-label, backdrop closes, no Escape handler (unchanged)
- [x] Toggle chips use aria-pressed (PIC split/model chips, hourly model chips and Rain & Temp; plus new aria-pressed on other toggles)

#### Diff guard

Command (over the 11 owned files that existed before; `IncidentHeatmaps.tsx` and `nc-incident.css` are new/CSS):
`git diff -U0 -- <files> | grep -E '^-.*(on[A-Z][a-zA-Z]+=|fetch\(|href=|use(State|Effect|Memo|Callback|Ref)\(|router\.|localStorage|aria-|role=)'` → 41 lines:

```
-              <AlertTriangle size={28} aria-hidden="true" />
-                    onClick={() => available && toggleModel(m.key)}
-                    aria-pressed={on}
-              <AlertTriangle size={16} style={{ flexShrink: 0, color: "var(--color-warning)" }} aria-hidden="true" />
-          <button key={m} className={rangeMode === m ? "active" : ""} onClick={() => setRangeMode(m)}>
-          <button key={w} className={weather === w ? "active" : ""} onClick={() => setWeather(w)}>
-              <button key={t} className={`${styles.modeTab} ${activeTab === t ? styles.modeTabActive : ""}`} onClick={() => setActiveTab(t)}>
-              onDataBoundsChange={setPredictiveDataBounds}
-              onWeatherApplicableChange={setWeatherApplicable}
-              onCorridorForecastChange={setCorridorData}
-              unclassifiedLocationShare={corridorData?.unclassifiedLocationShare ?? null}
-            <button key={t} className={`${styles.modeTab} ${activeTab === t ? styles.modeTabActive : ""}`} onClick={() => setActiveTab(t)}>
-          <span className={styles.kpiIcon} aria-hidden="true"><AlertTriangle size={15} /></span>
-          <span className={styles.kpiIcon} aria-hidden="true"><HeartPulse size={15} /></span>
-          <span className={styles.kpiIcon} aria-hidden="true"><Timer size={15} /></span>
-          <span className={styles.kpiIcon} aria-hidden="true"><MapPin size={15} /></span>
-          <span className={styles.kpiIcon} aria-hidden="true"><CloudRain size={15} /></span>
-              onChange={(v) => setSource(v as SourceFilter)}
-                  onClick={() => setGrain(g)}
-              <button key={v} className={timeView === v ? "active" : ""} onClick={() => setTimeView(v)}>
-            onClick={() => setHotspotSort(hotspotSort === "desc" ? "asc" : "desc")}
-            aria-label={`Sort order: ${hotspotSort === "desc" ? "highest first" : "lowest first"}. Activate to reverse.`}
-          <button className={styles.secondaryButton} onClick={() => setAllHotspotsOpen(true)}>
-            onClick={() => setCauseSort(causeSort === "desc" ? "asc" : "desc")}
-            aria-label={`Sort order: ${causeSort === "desc" ? "highest first" : "lowest first"}. Activate to reverse.`}
-              <button key={m} className={causeMode === m ? "active" : ""} onClick={() => setCauseMode(m)}>
-                onClick={() => setView(v)}
-                onClick={() => setResponseView(v)}
-          onClick={() => setOpen((v) => !v)}
-            onClick={() => setSeeMoreOpen(true)}
-            onClick={(e) => e.stopPropagation()}
-                onClick={() => setSeeMoreOpen(false)}
-                aria-label="Close"
-              onClick={() => toggleModel(m.key)}
-              aria-pressed={on}
-                  onClick={() => setSplitView(on)}
-                  aria-pressed={splitView === on}
-                  onClick={() => setFutureDays(item.d)}
-        horizonDays={modelInfo.forecastHorizon}
-      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--page-accent, var(--action))" }} 
-          onClick={() => setShowAll((v) => !v)}
```

Explanation (every line has an equivalent added line keeping the behaviour; nothing reverted):
- `page.tsx` mode-tab buttons (2 lines): the two returns were merged into one; the same `onClick={() => setActiveTab(t)}` now lives on the one mode switch under the header, plus `aria-pressed`.
- `page.tsx` Range / Weather buttons, `setGrain`, `setTimeView`, `setCauseMode`, both sort buttons (+ their unchanged `aria-label`), `setAllHotspotsOpen(true)`, `onChange={(v) => setSource(...)}`, the five `kpiIcon … aria-hidden` spans, and the PIC/corridor props `onDataBoundsChange`, `onWeatherApplicableChange`, `onCorridorForecastChange`, `unclassifiedLocationShare`: re-indented into the single return (and the Incident type select moved to the filter bar); identical handlers and values on the added lines. Check SVGs inside some buttons were removed (active = fill).
- `PredictiveIncidentChart.tsx` model chip `onClick={() => toggleModel(m.key)}` + `aria-pressed={on}`, split toggle `onClick={() => setSplitView(on)}` + `aria-pressed`, `onClick={() => setFutureDays(item.d)}`, `horizonDays={modelInfo.forecastHorizon}`: same handlers re-emitted in the new markup (inline styles → classes).
- `BreakdownResponseModel.tsx` `onClick={() => setView(v)}`, `EventBreakdownPanel.tsx` `onClick={() => setResponseView(v)}`: same handlers, now with `aria-pressed`.
- `IncidentNarrative.tsx` `onClick={() => setOpen((v) => !v)}` (Hide report): same handler on the restyled button.
- `PredictiveCorridorChart.tsx` `setSeeMoreOpen(true)`, dialog `stopPropagation`, close `setSeeMoreOpen(false)` + `aria-label="Close"`: same, restyled (backdrop click still closes; ✕ glyph → icon).
- `PrescriptiveDeploymentPanel.tsx` By Exit/By Km `onClick={() => setView(v)}`, slider `onChange={(e) => onChange(Number(e.target.value))}` (inline accentColor style moved to CSS), `setShowAll`: same handlers in the new markup.
- `hourly/page.tsx` model chip `onClick={() => available && toggleModel(m.key)}` + `aria-pressed={on}`: same; `AlertTriangle size={28} aria-hidden` removed (empty state now uses the StateNote mascot); `AlertTriangle size={16} … aria-hidden` re-emitted on the moved no-log notice.

Other behavioural notes, not caught by the grep pattern:
- `page.tsx`: four `useMemo` dependency arrays gained `chartTheme` (`timeOption`, `hotspotChart`, `causeChart`, `weatherChart`) so their series colours rebuild when the theme flips (they read RAMP/SEQ/chartTheme but did not list it). No data or fetch involved; flag if you would rather revert.
- No `fetch`, `useState`, `useEffect`, `useCallback`, `useRef`, `router`, `localStorage` line was added or removed. Request params, response handling and the MCLP solve are untouched.
- Chart drawing: model prediction lines are dashed and Actual/model lines no longer bridge null days (`connectNulls` false) per the chart kit; values unchanged.
- tsc: `npx tsc --noEmit -p .` → 0 errors for the whole project. ESLint (legacy config) on my files: 0 errors, 12 warnings, all pre-existing unused vars / exhaustive-deps notes.

#### Second pass

Goal (user, via lead): less wording, more structure, especially Predictive and Prescriptive. Same rules: no data, logic or handler changes; never-cut facts stay one click away on the same card.

###### Copy log

/dashboard/incident: Prescriptive
- Action cards now use labelled rows (Action / Where / When / Effect / Basis / Confidence) in a two-column layout (one column on phones). No visible paragraphs remain; every former sentence sits verbatim under that card's "Details".
- Staging card: title `Recommended staging: {labels}.` → `Stage units at {k} {exits|segments}` (computed). The site names stay visible as the ranked Where rows (1…k by predicted incidents, each `Km {km} · {n} predicted`). The verdict sentence becomes a pill beside the title: `Reaches most risk` / `Larger fleet or radius needed` (same ≥ 80% rule). Rows:
  - Action: `Pre-position patrol and tow-truck units`
  - When: `The {days}-day forecast window`
  - Effect: `{x}% of {total} predicted incidents within {r} km ({covered} covered)`
  - Basis: `Exact covering solve over the {model} {days}-day ranking`
  - Confidence: `Forecast apportioned by historical share, not modelled per site`
  - Details: the full banner sentence (`Recommended staging: …`), the method, and the old Foot text.
- Deployment Foot `Built from the {model} {days}-day forecast, apportioned the same way as the ranking above. Fleet size and coverage radius are yours to set — nothing in the warehouse records NLEX's actual patrol fleet.`:
  - The fleet warning stays visible right under the controls: `Fleet size and radius are yours to set — nothing in the warehouse records NLEX's actual patrol fleet.`
  - The source moved to the Basis row; the full text is under the staging card's Details.
- Hotspot monitoring alert: the paragraph is now rows:
  - Action: `Monitor these {exits} closely`
  - Where: `{n} of {N} {exits}, listed below`
  - When: the forecast window
  - Effect: `Watches at least 80% of predicted incidents`
  - Basis: `80% cumulative cutoff, not a fixed top-N`
  - Pill `Risk spread wide` when the cutoff needs more than half the rows.
  - Details: both original sentences verbatim.
- Proactive speed advisory:
  - Action: `Advise reduced speed here first`
  - Where: the top 3 by density, `Km {km} · {x.xx} incidents/km`
  - When: `As rainfall rises`
  - Effect: the rain chips
  - Confidence: `Weather-incident-risk model, AUC {x.xxx}`
  - Details: the original paragraph verbatim.
- Patrol Alert Schedule: title `{Day} needs the longest alert window: …` → `{Day}: longest alert window` (computed). Rows:
  - Action: `Treat these hours as elevated-risk for patrol`
  - Where: `Whole corridor, all logged incidents`
  - When: `{window} ({n}h), peaking around {h}`
  - Basis: `Hours above that day's own mean`
  - Confidence: `Measured over Mon n, Tue n, … days`
  - Details: the banner sentence, the full hint, and the old Foot (the Foot was duplicated by the Confidence row, so it is no longer shown separately).

/dashboard/incident: Predictive
- Split-view model note: `Model picker not used in this view — the accident forecast is {model}, fitted on accidents alone; breakdowns are derived as blended total minus accidents.` → `Model picker off in this view: accidents use {model}; breakdowns = total − accidents.` The full sentence moved into an InfoTooltip beside it.
- Split-view disclaimer → a labelled strip:
  - `Accident forecast {model} · accidents only · trained {date}`
  - `Held-out MAE {x} incidents/day · R² {x}`
  - `Skill: Modest: not clearly better than the historical average without volume (re-measured 2026-09-21)`
  - `Breakdowns: Derived, not separately modeled: blended − accident forecast`
  - `Metrics below: Blended forecast`
  - Details (unchanged): the ~12% / scaling / breakdown-model reasoning.
- Predicted Incidents Ranking: the context sentence becomes a strip:
  - `Share of total {x}% of {total}`
  - `Top {N} share {x}%`
  - `Read: Concentrated: a few stretches cover most` / `Spread wider than a few hotspots` (same ≥ 50% rule)
  - Details: the full original headline sentence verbatim.
  - Unclassified note: `{x}% of logged locations in this Range couldn't be matched to a specific segment and are excluded from the split.` → `{x}% of logged locations matched no segment and are excluded from the split.`
  - `Hover a row to inspect its numbers` → `Hover a row for its numbers`.
- Response Time Breakdown (model): the caption keeps `Top {n} {causes|services} by held-out evidence.` visible; `Built from breakdown_data's per-dispatch records; responses over 24h are treated as data-entry noise and excluded, same as the Descriptive tab's own figures.` moved to "How this is measured".

/dashboard/incident: Descriptive
- `Incidents per Day: Dry vs Wet Weather` → `Dry vs Wet: Incidents per Day` (6 words).
- Response Time Breakdown caption: `Last 12 months; does not follow Range or Weather.` stays visible; the breakdown_data / dispatch-subset / 24h-exclusion sentence moved to "How this is measured".

/dashboard/incident/hourly
- No-log warning: `… the operations log ends {date}. Weather and the model curves are shown; the absent bars mean no data, not zero incidents.` → `No incident log covers this date (the operations log ends {date}). Absent bars mean no data, not zero incidents.` (dropped the clause that restated what is on screen).
- Unknown-weather note: `{n} incident(s) fell in hours with no weather reading, so they appear under All but in neither Dry nor Wet.` → `{n} incident(s) had no weather reading: counted under All, not Dry or Wet.`
- Derived-shape note → a labelled strip:
  - `Model curves: Derived · one daily total spread over a typical {weekday}, not an hourly forecast`
  - `Weather: Observed · {n} of 24 hours reported, not forecast`
  - The full sentence (with `hourly_weather`) is under "How this is measured", next to the long subtitle text.

Model colours (categorical only; no visible text names a model by its colour)
- `incidentPredictive.shared.ts`: XGBoost #16a34a (green) → #6366f1 (indigo); SARIMAX #ef4444 (red) → #0d9488 (deep teal).
- Hourly page's own MODELS copy: the same two changes, plus Random Forest #f59e0b (amber) → #a21caf, so all seven models now match the daily chart. The hourly file's own comment requires matching colours; the old mismatch was a bug.
- On the dark card these sit at roughly 4.3:1 (indigo) and 5:1 (teal), so lines stay legible.

###### Inventory changes (second pass)
- [~] Staging banner → action card with labelled rows; `Recommended staging: {labels}.` sentence verbatim under Details; labels visible as ranked Where rows.
- [~] Deployment Foot → fleet warning visible under the controls; source in the Basis row; full text under Details.
- [~] Hotspot alert / speed advisory paragraphs → labelled rows + Details (verbatim). List, rain chips and AUC are still visible.
- [~] Patrol banner and Foot → action card rows + Details (verbatim). Day counts still visible (Confidence row).
- [~] Split disclaimer and model note → labelled strip + InfoTooltip/Details. Every figure and caveat still visible or one click away.
- [~] Corridor headline → labelled strip; verbatim sentence under Details.
- [~] Response-time captions (both tabs) → short visible line + "How this is measured".
- [~] Weather card title shortened (see copy log).
- [~] Hourly notes shortened or turned into a labelled strip; full text under "How this is measured".
- [~] Model hues for XGBoost, SARIMAX and the hourly Random Forest changed (inventory "never-cut" note about the hourly copy's Random Forest colour superseded at the lead's request).
- Everything else as in the first-pass inventory. No control, chart, series, table, dialog or state was removed.

###### Diff guard (second pass)
Same command over the same 11 owned files, compared against HEAD. The output is byte-identical to the first-pass list above (41 lines, explained there). The second pass added and removed no handler, `aria-*`, `role`, `href`, fetch, hook, router or storage line. tsc: 0 errors for the whole project.

###### Screenshots (second pass)
- `.playwright-cli/redesign-after/{dark,light}-{desktop,mobile}/incident-{descriptive,predictive,prescriptive}.png` (re-taken, 0 console errors).
- `.playwright-cli/redesign-after/{dark,light}-{desktop,mobile}/incident-hourly-day.png` (2026-06-12, re-taken after one timeout).
- Fix pass: the five hourly stat tiles took one row each on phones → 2 columns at ≤ 640 px.

###### Notes for the lead
- The action cards are in the page's existing order (staging, monitoring, speed advisory, patrol windows). I did not number the cards because nothing in the data ranks one action above another. The ranking inside the cards is data-driven: staged sites by predicted incidents, the top 3 by density, hotspots by predicted incidents.
- `VOLUME_COLOR` (#f59e0b amber, the exposure overlay on the forecast chart) is also close to the slow road-state hue. It is used only when Volume is on, and I left it as is. Say if you want it moved too (a neutral warm grey would work).
- Light theme checked on all three tabs and the hourly page: no washed-out areas with the current tokens.

###### Volume overlay colour (lead request)
- Forecast chart volume overlay (line, area, Volume axis labels and axis line, both views): amber #f59e0b → the theme's muted ink (useThemeTokens textMuted: #8590a6 dark, #5a6478 light), so it cannot read as the slow road state. Legend name "Vehicle Volume", axis names and the tooltip text ("{n} vehicles") are unchanged. `VOLUME_COLOR` in incidentPredictive.shared.ts is now unused and left in place. tsc: 0 errors. The overlay is drawn only across the Past band and the model lines only across Present/Future, so the grey volume line never overlaps the slate GRU line.


### Emissions

_From result-emissions.md._

##### /dashboard/sustainability — Emissions (verified 4 Oct 2026, data-analyst session, dark/light × 1440/390)

Shared shell
- [x] `<section>` `styles.page` + `viz-emissions` (now also `nc-em-page`); `--page-accent` = emissions green
- [x] PageHeader accent "emissions", Leaf, "Emissions Overview", subtitle unchanged
- [~] Mode tabs Descriptive / Predictive / Prescriptive — now the full-width segmented control directly under the header (icons, hints, sliding underline, `aria-pressed`); check-mark SVG replaced by the underline; same onClick
- [~] `styles.filterRow` with `styles.spacer` — still the sticky bar; the mode tabs moved out of it (brief 5a); spacer now pushes the active-filter chips right

Range control (Descriptive + Prescriptive; absent on Predictive)
- [x] Label "Range" (calendar icon hidden by the shared module CSS, as on Traffic)
- [x] "3 mo" / "12 mo" (default) / "All" / "Custom"; active = accent pill (+ `aria-pressed`), check SVG hidden by shared CSS
- [x] "Custom" reveals DateRangePicker with minDate/maxDate (verified)
- [x] One-date custom skips the Descriptive fetch; Prescriptive falls back to months=12 (logic untouched)
- [x] NEW: non-default Range shown as a removable chip; × → `setRangeMode("12")` (verified: back to 12 mo)

DateRangePicker (shared component, not edited)
- [x] Trigger "mm/dd/yyyy" — "—" (verified present); [x] month/10-year stepping; [x] month/year grids; [x] weekday headers; [x] disabled out-of-range days with aria-disabled; [x] two-click selection/swap/auto-close; [x] hover preview; [x] presets "Last 7 days"/"Last 30 days"; [x] click outside closes — all unchanged code

Descriptive · filter row
- [x] Range control
- [x] "Class" CustomSelect, 4 options, refetch with vehicleClass; non-All resets Show (verified: Show disabled while Class 3 picked)
- [x] NEW: Class chip; × → `setClassFilter("All")` (verified: chip gone, Show re-enabled)
- [x] "Updating…" while refetching with data
- [~] Mode tabs — moved above the bar (see shell)

Descriptive · KPI row (6 tiles, `ds-rise`, icons aria-hidden)
- [x] KpiSkeleton / "—" / CountUpValue
- [x] Tile 1 "Total CO₂ (Modeled)" + ⓘ, `{compact} t`, title `{int} tonnes`, delta pill + "vs previous period" (161.2K t, −1.2% = baseline)
- [x] Tile 2 "Avg Daily CO₂" + ⓘ, `{int} t` (442 t = baseline), sparkline 7-day rolling mean (now themed via applyChartTheme + 28%→0 fade); [~] caption "7-day rolling mean of daily CO₂" added
- [x] Tile 3 "Heavy-Vehicle Impact" 55.7%, "of CO₂ from just 22.0% of traffic"
- [x] Tile 4 "Peak Emission Hour" 4 PM, "21.1 t/day in that hour"
- [x] Tile 5 "Delay-Induced CO₂" 1,152 t, "0.71% of CO₂ · 73% from 62 incidents over 3 h"
- [x] Tile 6 "Measured Air Quality" 1.5 / 5, "Fair · avg PM2.5 9.1 µg/m³" / "no station readings in range"; aqiWord bands unchanged
- [~] Six tiles kept (brief says 3–5; removing one is not allowed): 6 → 3+3 → 2 columns

Descriptive · Hero
- [x] Title + ⓘ
- [~] NEW answer + context bands (computed, see copy log)
- [x] "Show" select, 4 options, disabled + title while Class ≠ All (verified)
- [x] heroFilterDivider
- [x] Granularity Hourly/Daily/Weekly/Monthly (default Monthly), active accent pill (+ aria-pressed)
- [x] Hourly disabled with "Hourly detail is available for ranges up to 2 weeks" (verified disabled at 12 mo)
- [x] Daily/Weekly/Monthly disabled titles; auto-demote (logic untouched)
- [x] Stacked area series Class 1/2/3 filtered by Show
- [x] Y-axis "tonnes CO₂", compact ticks (now "15K t")
- [x] Month-boundary x labels
- [x] Tooltip head bucket label; rows `{series}: {n} t` + `Total: {n} t`
- [x] Legend only when Show = All
- [x] Partial edge buckets trimmed
- [x] Click anywhere opens trend modal (verified: "2025-08")
- [x] Empty "No emissions data for the selected range" (StateNote)

Descriptive · When Emissions Happen (now half-width, 6/12)
- [x] Title + ⓘ
- [~] Takeaway split into answer "{peak h} peak hour, all days" + context "Quietest around … · heaviest day: …" (same values)
- [x] "By hour" / "By day" toggle (verified, aria-pressed)
- [x] Weekdays/Weekends smooth lines; [x] "Peak · {h}" markPoint; [x] axes "12 AM…11 PM" every 3 h, "avg t CO₂ / day" (ticks now "{v} t"); [x] tooltip "x.x t"; legend
- [x] By day bars, busiest highlighted with value label (now "{v} t"); tooltip text unchanged
- [x] Click → hour/day modal (verified "1 PM – 2 PM")
- [x] Empty note

Descriptive · Fleet Mix vs Pollution Load (half-width)
- [x] Title + ⓘ
- [~] Takeaway split into answer "{c}% of CO₂ from heavy vehicles (Class 2–3)" + context "From just {v}% of traffic"
- [x] 100%-stacked horizontal bars: Traffic volume / CO₂ / NO₂ / PM2.5; series Class 1/2/3; 0–100% step 25; legend
- [x] Tooltip `{class}: x.x% ({compact} {unit})`
- [x] Click → fleet modal with emission-factor note (verified, on a bar; clicks in the gap between bars resolve to nothing, as before)
- [x] Empty note

Descriptive · Heavy-Vehicle Share of CO₂
- [x] Title + ⓘ
- [~] Takeaway split into answer "{last}% now, latest {period}" + context "{Dir} across the range (from {first}%)"
- [x] Single line, no legend, follows grain + Class (now with 28%→0 area fade)
- [x] Dashed "avg x%" markLine (was invisible in dark: colour was the transparent axis token; now muted ink); y % padded ±2
- [x] Tooltip unchanged
- [x] Click → heavy-share modal (verified "2025-07")
- [x] Empty note

Descriptive · Measured Air Quality by Month
- [x] Title + ⓘ
- [~] NEW answer/context (share of readings Good, reading count, month span)
- [x] Monthly 100%-stacked bars, three bands, "Jan 26" labels, legend
- [x] Tooltip per band + Avg PM2.5
- [x] Click → AQI modal (verified "Aug 25")
- [x] Empty "No station readings in the selected range"

Descriptive · NEW heat grid "CO₂ by Hour and Weekday" (from the existing `heatmap` rows; tooltip only, no click)

Descriptive · shared chart states
- [x] ChartSkeleton on first load
- [~] Error text unchanged, now in StateNote (mascot, hazard blink)
- [~] Per-card empty note text unchanged, now in StateNote instead of `styles.placeholder`

Descriptive · detail modal
- [x] role="dialog", aria-modal, aria-label; backdrop closes; stopPropagation
- [x] Leaf icon, h3, subtitle (accent bar hidden by the shared module, as on Traffic)
- [x] Close aria-label="Close" (verified)
- [x] Zebra rows; footer note with icon
- [x] No Esc handler (unchanged, as before)
- [x] All variants (trend incl. "Northbound / Southbound", "vs range average", "Rank in range", "dayly" quirk; hour; day; fleet incl. emission factors; heavy-share incl. "Heavy = Class 2 + Class 3 (buses, trucks)."; AQI incl. OpenWeatherMap notes) — builders untouched
- [x] Now rendered only on the Descriptive tab, as before

Predictive · filter row
- [x] No Range/Class control (no filter bar on Predictive now, since the mode tabs moved out)

Predictive · CO₂ forecast card
- [x] Loading "Loading CO₂ forecast from AWS…" / "Database slow to respond — retrying…" (+ title, skeleton)
- [x] Error card: title + ⓘ, error message, "Three attempts were made…" note, "Try again" refetches (StateNote; not forced in the browser)
- [x] Title + ⓘ
- [~] Subtitle: aggregated sentence shortened (averaging fact lives in the pill/title/axis/legend); freshness dates added
- [x] "Models" + 4 chips, `aria-pressed`, titles incl. "At least one model must stay selected" (verified toggle LSTM on/off; table row follows)
- [~] "★" now a star icon (+ sr-only "champion"); "=" kept
- [x] Default selection = API champion (Gradient Boosting)
- [x] Aggregation pill "Each point = {meanLabel} averaged, not totalled" + its full hover title
- [x] Granularity label; Hourly disabled span with its title (+ aria-disabled); Daily/Weekly(default)/Monthly; [~] "✓ {g}" → accent pill + aria-pressed
- [x] Daily/Weekly/Monthly titles unchanged
- [x] Daily → history 90 d, no history button active; other grains → All (verified, incl. "showing last 90d" warning)
- [x] History 60d / 1y / All (default) with titles (verified 1y)
- [x] Zone row Past `{train}d trained · {pct}%` (+ warning "showing last Nd")
- [x] Zone row Present `{holdout}d scored · {pct}% · fixed by evaluation`
- [~] Future buttons "7 d" / "2 wk" / "1 mo" / "2 mo" / "3 mo" moved into the control bar as "Horizon" (attached to the chart); hide/disable rules unchanged (today only "7 d" shows: every horizon bucket is flagged unusable); Future zone shows "{n}d projected"
- [x] "validated at 7d" suffix
- [x] Horizon banner (> 7 d) with drift paragraph, weak-stretch line + MASE title, typical-error line + WMAPE title (code path unchanged; not reachable with today's data because only 7 d is offered)
- [x] Chart 450 px: "Actual CO₂" solid (now primary ink, 2 px) + dashed model series; markers only over Future
- [x] Zone bands with Past/Present/Future chips (now 11 px, pill radius)
- [~] Weak-horizon band "⚠ days a-b" — now the chart-kit hatch with the label in warning ink (label colour was `var(--color-warning)`, which a canvas cannot read)
- [~] Boundary markLines: holdout dashed divider kept; future boundary dashed in primary ink, labelled "forecast →"; NOW marker only when today is on the axis
- [x] Legend formatter `{name} · {meanLabel}`
- [x] Tooltip head, zone line, rows with ±% vs actual (now themed raised tooltip)
- [x] dataZoom inside (throttle 60) + slider (16 px), restyled neutral
- [x] Y-axis name unchanged, thousands-separated ticks, not zero-based
- [x] X labels "Jan 5" / "Jan 26" / "2026"
- [x] "Real-World ML Validation Metrics" + "Show All Metrics"/"Show Less" (verified adds MAPE + Rank)
- [x] Columns Model, RMSE (t), MAE (t), WMAPE, R² Score, MASE (+ MAPE, Rank); MASE header title
- [x] Rows for selected models with colour dot; status "accepted · rank #N" / "accepted · co-champion" / "rejected" / "no metrics"
- [x] Number formats unchanged; MASE green < 1 / red ≥ 1 (WMAPE/R² now ink instead of series colour)
- [x] Caption "Scored on … held-out days at a 7-day horizon · volume validates at 14d…" + tie sentence
- [~] NEW model trust strip at the head of the validation section (pills); the table stays visible beneath it
- [x] ModelNarrative "Generate report" button present (not pressed: it POSTs to the AI service); open state / AiModelInsight states unchanged code (owned by Traffic agent / lead)
- [x] NOTE (unreachable collapsed chips) — unchanged
- [x] quantityNote caveat — restored by the lead: ModelNarrative now renders it in a "How this is measured" disclosure on the forecast card (it was declared but unrendered before the redesign)

Predictive · Fleet composition card
- [x] Loading title + "Loading…" (+ skeleton)
- [x] Error text + "Try again" (StateNote; not forced)
- [x] Empty "No fleet-mix forecast has been published yet. Run … train_fleet_mix.py …" (StateNote)
- [x] Title + ⓘ
- [x] "Champion {model} · {n}-day projection · validated at 7 days · trained {date}"
- [x] Staleness warning (> 45 days): showing "Data ends 2026-06-30 — 95 days ago…"
- [~] Headline "Heavy share (C2+C3) · 30-day means" + "{now} → {end}" moved under the title as the answer; [x] "no material change" / "±x.x pp" with warning/success colours
- [x] 320 px 100%-stacked area 0–100%, series Class 3/2/1
- [x] Observed solid, projected 0.42 opacity, legend 3 entries lightest first; [~] legend swatches now match the bands (series itemStyle added; they showed ECharts' default palette before)
- [~] Dashed "forecast →" boundary: now surface-coloured with a chip label so it reads on every band (was near-invisible over the pale Class 1 band in dark)
- [x] Tooltip "{date} · observed|projected" + per class; "Heavy (C2+C3)" + "· surge"
- [x] Surge banner (code unchanged; no surge days in today's data)
- [x] Leaderboard columns MODEL, MAE (pp), MAPE, HEAVY WMAPE, HEAVY R², SKILL
- [x] Status accepted / accepted · champion / rejected / baseline with reason on hover
- [x] Formats; SKILL green < 1 / warning ≥ 1
- [~] Caption: "Ranked by Aitchison distance." + SKILL + Protocol visible; MAPE rationale moved to "How this is measured" (verified opens)

Prescriptive · filter row
- [x] Range control (+ DateRangePicker); no Class, no "Updating…"
- [~] Mode tabs moved above (shell)
- [x] NEW Range chip (verified "3 mo" chip; × back to 12 mo)

Prescriptive · card
- [x] Title + ⓘ; [x] intro unchanged
- [x] months/from/to from Range (verified 3 mo refetch: "Against 40,461 t … 2025-01-01 to 2025-03-31")
- [x] "Computing strategies…"; [x] "Strategies unavailable" + message / "No data returned."; [x] "No emissions data in this Range" + server text
- [~] Recommendation box (green/warning left border) → ranked action rows with coloured tags (lead green, scenario/none warning)
- [x] "Do this" (largest evidence-bounded) — action, lever, effect, confidence visible; full sentence in Details
- [x] "Nothing to do yet" line
- [x] "Then" with bold "Do not add these two together." (visible)
- [x] "Not on this evidence" + evidenceNote (evidenceNote in Details)
- [~] Bar chart now horizontal ranked bars (largest first, labels beside bars, wrap at 120 px); height follows bar count
- [~] X-axis (was y) "% of corridor CO₂", ticks "{v}%"; bar labels "x.xx%"
- [x] Evidence-bounded bars solid teal; policy-target bar hollow dashed (same colour, from the ramp)
- [x] Tooltip label, pct · t avoided, Monte Carlo range, lever, bounded/policy line — unchanged
- [x] Basis "Against {t} t actually emitted over {from} to {to}."
- [x] Basis incidents / "Not computed for this Range:" line
- [~] Basis scenario "drawn hollow…" sentence → "How this is measured" on the same card
- [x] Strategy labels from the API (verified: "Faster incident clearance", "Response capacity at the busiest hours", "Heavy-vehicle share down 1 pp")
- [~] `assumptions[]` — now rendered inside each row's Details (was not rendered)

API endpoints / storage / a11y
- [x] Same four GETs + the AI POST, same params, same retry/backoff; no fetch/state/effect changed
- [x] No localStorage/sessionStorage (none added)
- [x] InfoTooltip, CustomSelect, dialog, model chips aria-pressed, AiModelInsight roles, skeletons aria-hidden, DateRangePicker aria-disabled — unchanged; added aria-pressed on mode tabs, Range, Granularity, By hour/By day, forecast Granularity/History/Horizon buttons, aria-disabled on the Hourly span, labelled chip × buttons

ILLUSTRATIVE check
- [x] Confirmed: no "Strategy X/Y/Z", no ILLUSTRATIVE label and no hardcoded strategy figure. PrescriptiveEmissionsPanel's header comment records the replacement; all bars come from `/api/emissions/prescriptive`. The policy-target bar stays hollow and now also carries a dashed "Policy target" pill. No `nc-tag-illustrative` added (nothing qualifies).

#### Diff guard

Command (repo root):
```
git diff -U0 -- Front-End-Dashboard/app/dashboard/sustainability/page.tsx Front-End-Dashboard/components/dashboard/PredictiveEmissionChart.tsx Front-End-Dashboard/components/dashboard/PrescriptiveEmissionsPanel.tsx Front-End-Dashboard/components/dashboard/FleetMixForecastChart.tsx Front-End-Dashboard/app/styles/nc-emissions.css | grep -E '^-.*(on[A-Z][a-zA-Z]+=|fetch\(|href=|use(State|Effect|Memo|Callback|Ref)\(|router\.|localStorage|aria-|role=)'
```
Output and explanation (every line has an equivalent added line, checked by grepping the `+` side):
```
-          <button key={m} className={rangeMode === m ? "active" : ""} onClick={() => setRangeMode(m)}>
```
Same button + same onClick; `aria-pressed` added.
```
-              <button key={t} className={`${styles.modeTab} ...`} onClick={() => setActiveTab(t)}>
-            <button key={t} className={`${styles.modeTab} ...`} onClick={() => setActiveTab(t)}>
```
The two copies (one per old return branch) became one mode-tab block with the same onClick + `aria-pressed`.
```
-              onChange={(v) => {
-              onChange={(v) => setClassView(v as ClassChoice)}
```
Class and Show CustomSelects re-indented into the single return; handlers identical.
```
-          <span className={styles.kpiIcon} aria-hidden="true"><Leaf size={15} /></span>   (×6 tiles)
```
Re-indented; identical lines on the + side.
```
-                  onClick={() => setGrain(g)}
-              <button key={v} className={timeView === v ? "active" : ""} onClick={() => setTimeView(v)}>
```
Same handlers; `aria-pressed` added.
```
-            onClick={() => { setError(null); setAttempt((a) => a + 1); }}      (FleetMix Try again)
-            onClick={() => {                                                   (CO₂ Try again)
-          onClick={() => setShowAllMetrics(!showAllMetrics)}
-                  onClick={() => {                                             (Granularity: setGranularity + setPastDays)
-                  onClick={() => setPastDays(wd.days)}
-                onClick={() => setFutureDays(it.d)}
```
All present verbatim on the + side (buttons restyled with classes instead of inline styles; Future buttons moved into the "Horizon" control).

Hook-dependency note (not caught by the guard): `trendOption`, `timeOption`, `aqiOption`, `sparkOption` now list `chartTheme` in their deps, and PredictiveEmissionChart adds `const CT = useChartTheme()` (read-only theme hook) used by the chart-kit helpers. These only make the charts recolour on a theme switch. One new presentational `useMemo` (`heatGrid`) builds the heat grid option from `data.heatmap`.

Typecheck: `npx tsc --noEmit -p .` — exit 0, whole project clean.

#### Second pass

Same five files. Goal: less prose, more structure (mainly Predictive and Prescriptive), KPI rhythm, light theme, the zone-chip overlap.

###### Copy log (second pass)

Prescriptive
- The action rows became **ranked action cards** (one card per strategy, outside the evidence card, no nesting). Left: rank, tag ("Do this" / "Then" / "Not on this evidence" / "Nothing to do yet"), "Evidence-bounded" or dashed "Policy target" pill, the strategy label, and the answer "{t} t · CO₂ avoided {period}". Right: labelled rows **Action** (lever) / **Where** "Corridor-wide" / **When** "Estimated over {from} to {to}" / **Effect** (small inline bar scaled to the largest strategy, hollow for the policy target) "{pct}% of what the corridor emitted" / **Basis** "Bounded by response times this corridor has already delivered" or "Policy target — not demonstrated by any observed change" / **Confidence** "Likely {lo}–{hi} t · 5th–95th of {runs} Monte Carlo runs" (or "No Monte Carlo range returned for this strategy") / **Note** (warning ink).
  - "Then" note: "Do not add these two together. This one applies the same clearance floor to fewer hours, so it is a subset of the first, not an addition to it." → "**Do not add these two together.** It is a subset of #1, not an addition." (full sentence verbatim in Details)
  - Scenario note: "Far the largest figure here, but a policy question for MPTC, not an operational one." → "Far the largest figure, but a policy question for MPTC, not an operational one." (full sentence + evidenceNote + "Policy target — not demonstrated…" in Details)
  - Effect/answer labels: "CO₂ {period}" → "CO₂ avoided {period}".
- Evidence card (chart): the title, ⓘ and intro moved from page.tsx into the panel (text unchanged) so the loading/error/no-data states keep them.
- Basis paragraph "Against {t} t actually emitted over {from} to {to}. Incident-based strategies use {n} cleared incidents in the same window." → labelled rows "Actually emitted · {t} t over {from} to {to}" and "Incidents · {n} cleared incidents in the same window" (or "Not computed · Not computed for this Range: …"); the original sentences, verbatim, plus the "drawn hollow" explanation, are in "How this is measured".

Predictive · CO₂ forecast
- Answer "{n} t · CO₂ per day, mean forecast · {start} – {end} · {model}" → answer "{n} t · CO₂ per day, mean forecast" + labelled facts **Window** {start} – {end} / **Model** {champion} / **Measured to** {holdoutEnd} / **Scope** "Whole corridor, t CO₂ / day".
- Context sentence "Tonnes of CO₂ per day across the whole corridor · toggle models to overlay predictions · measured to …, forecast from …" → removed as prose: scope and dates are now the facts above; "Toggle models to overlay predictions" moved to the title of the "Models" label (the ⓘ already says "Pick a model above").
- Scoring caption "Scored on {n} held-out days at a {h}-day horizon · volume validates at 14d, so the two are not directly comparable." → moved verbatim into a "How it was tested" disclosure under the table (its figures are also in the trust pills). The tie sentence stays visible when there is a tie. (Named "How it was tested" so it is not confused with ModelNarrative's own "How this is measured".)
- Past-horizon banner (when the horizon is longer than 7 d): visible = "Only the first 7 days were checked against what actually happened." + the weak-stretch line (unchanged) + "Typical error" as one row per horizon bucket with a small bar (scaled to the largest WMAPE shown) and "{n}% off"; the full drift paragraph, verbatim, behind "Details". Hover titles (MASE, WMAPE) unchanged.
- Chart: the "Future" zone chip now sits just above the plot (it collided with "Present" on narrow screens); the legend is a single scrolling line (paging arrows on phones) instead of wrapping onto the axis labels.

Predictive · Fleet composition
- Context "Champion {m} · {n}-day projection · validated at 7 days · trained {date}" → pills "Champion · {m}" / "{n}-day projection" / "Validated at 7 days" / "Trained {date}".
- Staleness: same text, the fact in bold ("**Data ends {date} — {n} days ago.** This projection covers…").
- Surge banner (when present): dates visible; "A day is flagged when the projected Class 2+3 share runs more than 1.5 standard deviations above its training mean." → "How a surge is flagged" disclosure.
- Leaderboard caption: the visible "Ranked by Aitchison distance. SKILL is … Protocol: …" → pills above the table "Ranked by Aitchison distance" / "Protocol · {split_label}" / "SKILL < 1 beats persistence" (title = the full SKILL sentence). The full caption, verbatim (Aitchison rationale + SKILL + Protocol), is in "How this is measured".

Descriptive
- No copy changes. KPI row rhythm: at ≥1200 px the row is 4 columns with "Total CO₂ (Modeled)" and "Measured Air Quality" as wide bookend tiles (2+1+1 / 1+1+2). Same six tiles, same order; 3 columns below 1200 px, 2 below 980 px.

###### Inventory changes (second pass)
- [~] Prescriptive recommendation: now separate ranked action cards with labelled rows; every sentence the rows replaced is verbatim in that card's Details; `assumptions[]` stay in Details. Verified: 3 cards in recommendation order, rows Action/Where/When/Effect/Basis/Confidence, Details shows the full sentence + assumptions.
- [~] Prescriptive evidence card: title/ⓘ/intro now rendered by the panel (also on loading/error/no-data); horizontal ranked bars, hollow policy bar, tooltip unchanged; basis as labelled rows + "How this is measured". Verified: Range 3 mo refetches ("40,461 t … 2025-01-01 to 2025-03-31").
- [~] CO₂ forecast: answer + labelled facts; scoring caption behind "How it was tested" (verified opens with "volume validates at 14d"); the horizon banner is restructured (code path unchanged; not reachable with today's data since only "7 d" is offered); Future chip above the plot; scrolling legend (same entries, still click-to-toggle).
- [~] Fleet composition: context pills, scoring pills, caption and surge rule behind disclosures (verified).
- [~] KPI row: bookend layout at ≥1200 px (verified 6 tiles).
- All first-pass items unchanged otherwise. No data, fetch, state, effect or handler changes.

###### Diff guard (second pass)
Same command as above: 19 removed lines, identical to the first-pass list (all with equivalent added lines). The second pass removed no handler, aria, role, fetch or hook lines. The panel's page.tsx wrapper `<article>` (title/ⓘ/intro) moved into PrescriptiveEmissionsPanel unchanged; the panel's props/fetch are unchanged. `npx tsc --noEmit -p .`: exit 0. Parity: `scratchpad/emissions/parity4.mjs`, 10/10 pass, 0 page errors.

###### Screenshots (second pass)
`.playwright-cli/redesign-after/{dark,light}-{desktop,mobile}/emissions-{descriptive,predictive,prescriptive}.png` (full round; predictive re-shot after the legend fix). Light theme checked: cards, pills, rows and the hollow policy bar read cleanly; I found no washed-out areas on this page.

###### For the lead (second pass)
- ModelNarrative's quantityNote disclosure is now visible on the CO₂ card; first-pass item 1 is resolved by your change.
- Still true: no confidence band or live track record in the CO₂ API (not drawn); no NOW line because the data ends 30 Jun 2026; the pre-existing click-to-inspect closure issue (from first-pass item 7) is untouched.


### Live Map

_From result-livemap.md._

##### /dashboard/map-comparison — Live Map
Verified with `scratchpad/livemap/interact.mjs` (dark, and light + reduced motion), the probe, and the confirm screenshots. 0 console errors in the confirm round.

**Route / roles**
- [x] Sidebar "Live Map", Operations group; audit label unchanged (shell files not touched)
- [x] All three roles; nothing role-dependent inside the page (unchanged)

**Header**
- [x] Icon Map, title "Live Map"
- [x] Subtitle "Live Waze conditions beside the model's forecast, NLEX corridor" (10 words, kept)

**Exit picker**
- [x] Milestone icon + toggle button with `aria-haspopup="listbox"` / `aria-expanded`, text `{selectedExit || "Jump to exit…"}` + ChevronDown (inline styles moved to classes)
- [x] `<ul role="listbox">`, max 320 px, scrolls; now a raised popover. Fixed: it was painting under the map (stacking); header now sits above the map stage
- [x] "Whole corridor" → `resetView` + `nlex:resetview` (verified: zoom back to 9.20)
- [x] "Exit list unavailable" empty state (markup kept)
- [x] One `<li role="option" aria-selected>` per exit with exit_id, name, "Km {km}"; selected row bold (verified 20 options)
- [x] Pick → `flyToExit` → `nlex:flyto` on both maps (verified zoom 12.50 on both). New: the picked exit's pin is marked on both maps
- [x] Exits from `useNlexExits()`, south to north
- [x] No outside-click / Esc close (as built, unchanged)

**Live panel**
- [x] Title "Waze Real-Time Traffic", subtitle "Live traffic conditions"
- [x] Badge: green dot + `LIVE | {timeStr}` ticking 1 s
- [x] "Expand" (Maximize2, `.mc-maximise`) opens WazeLiveModal (verified)
- [x] `layerColor="#4a6ff2"`, `tone="blue"`
- [x] `<details class="mc-legend-card waze-legend">` "Legend" + `<MapLegend/>`, collapsed by default (verified 8 rows)

**Live footer stats**
- [x] "Toll Plazas" 20
- [x] "Active Reports" `activeReports ?? "—"` (0 at test time)
- [x] "Avg Speed" `{n} km/h` / "—" (21 km/h at test time)

**Forecast panel**
- [x] Title "Forecasted Traffic", subtitle "Predictive analysis"
- [x] Badge "PREDICTED" + "Expand" opens FEM (verified)
- [x] Endpoint `/forecast?hours=${horizon}`, `layerColor="#a855f7"`, `tone="purple"`
- [~] `.mc-forecast-controls` overlay holding the picker — the picker now lives in the timeline dock under the maps (element still carries `.mc-forecast-controls`), non-compact; the overlay keeps the model card and icon buttons. Visible at the same breakpoints, no extra click
- [x] Model card: Clock + "Forecast model"; name + `<em>{N}% accurate</em>`; "Trained {date}" / "Training date unknown"; " · beat {n} others"; "Varies across {n} h ahead" / "Same outlook…"; "Model details unavailable" fallback
- [x] Icon buttons Navigation / ZoomIn / ZoomOut — still inert (pre-existing), restyled
- [x] Forecast legend details: "Predicted congestion" + Clear/Slow/Congested from `mapPalette(isDark).status` (+ new "No data" row); "On the map" + pin "NLEX exit"

**Forecast footer stats**
- [x] "NLEX Exits" 20; "ML Confidence" `{N}%` (64%); "Forecast Window" `+{h} h` (verified +6 h after a tick)

**Map controls**
- [x] NavigationControl (no compass) top-right
- [x] Initial view center [120.79, 14.94], zoom 9.2, minZoom 9, maxBounds, pitch 0, bearing 0 (constructor unchanged)
- [~] `attributionControl: false` — still false in the constructor, but an `AttributionControl({compact:false})` is now added bottom-right: the brief requires the free basemap's attribution to be visible ("© CARTO, © OpenStreetMap contributors"; light shows Mapbox's)
- [x] No style switcher / layer toggles; basemap follows theme (rebuild on `isDark`)
- [x] `nlex:flyto` zoom 12.5 / 900 ms; `nlex:resetview` 900 ms; `nlex:showreport` zoom 13 (code unchanged)
- [x] Alert-marker click flies to max(current,12) / 600 ms (code unchanged; 0 alerts at test time)
- [x] ResizeObserver → `map.resize()`
- [x] `style.load` hides road/bridge/tunnel layers (works unchanged on the CARTO style, whose road layers are all named road_/tunnel_/bridge_)

**Basemap**
- [x] Light `mapbox://styles/mapbox/light-v11`
- [~] Dark `mapbox://styles/mapbox/dark-v11` → CARTO Dark Matter GL (free, no key), per brief 5c; labels drawn locally in Outfit (`localFontFamily`, dark only) because CARTO's glyph server lacks several of the style's fonts (each was a console CORS error)
- [x] Token from `NEXT_PUBLIC_MAPBOX_TOKEN`, must start `pk.`
- [~] Attribution: now rendered (see above)

**Map sources**
- [x] `traffic` (after withPredictedQueues + onlyOnCorridor)
- [x] `nlex-corridor` (38 ribbons via corridorWithState). New: `lm-closures`

**Map layers (all still present, same ids, same order; new `lm-*` layers interleaved — layer list printed by interact.mjs)**
- [x] `base-scrim` (retuned: stage colour on dark, paper on light)
- [x] `nlex-halo` (retuned to a soft expressway-blue glow on dark)
- [x] `nlex-casing`
- [x] `carriageway` (same match expression; colours are now the state tokens)
- [x] `carriageway-flow-{nb|sb}-{fast|mid|slow}` (same filters; now also paused under reduced motion / off-screen)
- [x] `jam-tail` (dashed, forecast only)
- [x] `jam-casing`
- [x] `jam-extent`
- [x] `jam-mark-nb` / `jam-mark-sb`
- [x] `jam-flow-{nb|sb}-queue-slow|heavy` (before `jam-mark-nb`; level 5 still no flow)
- [~] `carriageway-arrows` — same symbol layer, placement, spacing, colour; drawn with icon images (`lm-chevron-fwd/back`) instead of the "❯" glyph, which the CARTO glyph server does not have (it would have drawn nothing in dark)

**Animated style images**
- [x] `flow-{nb|sb}-{fast|mid|slow}` 32×8, same cycles/opacity/tiers
- [x] `flow-{nb|sb}-queue-slow|heavy`
- [x] NB sign −1, SB +1
- [x] 30 fps throttle
- [x] `render()` false while paused (now also under reduced motion and when the map is off-screen)
- [x] Un-pausing nudges `triggerRepaint`

**Markers**
- [x] Toll plaza pins, 20, both maps; `.custom-toll-marker > .toll-pin > .toll-pin-dot` + `span.toll-pin-name`, z 6. Plate now also carries `span.toll-pin-km` ("Km 12")
- [x] Declutter writes data-tier / data-side / --lead / data-ring / data-queue (+ new data-label, data-major, data-selected); re-run on zoom and move
- [x] Waze alert markers, live only, `.waze-alert-marker`(+`.unconfirmed`), core with type icon, JAM skipped (code unchanged; 0 corridor alerts at test time, so not seen on screen)

**Popups**
- [x] Live queue card (head word + direction · km; where; Queue length / Est. delay / Speed / Going on for, each omitted when absent) — [~] rows reordered, delay first
- [x] Predicted queue card (verified text: "Predicted · Slow … Est. delay ~4 min, Queue length ~843 m, May extend to ~1.3 km, Bocaue Interchange, Speed ~13 km/h, Chance of a jam 70%, basis + 89% side-share (134 live jam-hours), Typical traffic ~600 veh/h · 1.4×") — [~] rows reordered
- [x] Plaza card (name + km, location, Access, Toll, note) unchanged
- [x] Queue card closes the plaza card
- [x] Report hover summary `.nlex-pop` + "Click for the full report" (unchanged)

**Report detail panel**
- [x] `div.wz-report-detail` role=dialog, aria-label; type/subtype; close `aria-label="Close report detail"`; where; Reported…; First report…; grid rows Reliability/Confidence/Rating/Nearest exit/Direction/Heading/Road type/Source/Coordinates; Waze ID (markup unchanged, restyled; not openable at test time: no corridor alerts)
- [x] Opened by marker click or `nlex:showreport` (new strip report icons dispatch the same event)

**Panel chrome / fallback**
- [x] `article.map-card` (+chromeless), `header.map-head.{tone}` (now also `data-kind`)
- [x] `div.map-canvas.mapbox`
- [x] "Map unavailable" + body; "Map token rejected" + body (text unchanged)

**Legends (MapLegend)**
- [x] Live variant: "Traffic" Clear/Slow/Congested + "Waze reports" five types
- [x] Forecast variant: "Predicted congestion" Clear/Slow/Congested (+ "No data") + "On the map" NLEX exit

**Horizon picker**
- [x] Clock + "Forecast time" heading (non-compact)
- [x] Range group `aria-label="Forecast range"`: "Next 12 h/24 h/7 days", `aria-pressed`, disabled when `maxHorizon < hours`, both titles
- [x] Range click → `setRange` + `setHorizon(min(…))` (verified 12h → 12 ticks, 24h → 13, 7d → 8 peaks)
- [x] Native select, sr-only "Forecast hour", optgroups per day / peaks options (verified value 6 after a tick)
- [x] `.mc-horizon-when` day hint
- [x] Options from `horizonOptionsFor`; fallback to `offered[0]`; peaks fetched only for 7d
- New: timeline ticks (one per offered hour) call the same `setHorizon`; "Live" chip at the left end

**WazeLiveModal**
- [x] Backdrop dialog, closes on click; Radio + h2 + p; `.wz-live` LIVE/STALE + clock; Refresh (spin/disabled); Close; chromeless map + legend; "Corridor Overview"; error text; KPIs (verified "20.6 km/h · 0 · 3m"); Traffic density bar + marker (gradient now the three state colours only, no orange); jam note; Current alerts list + rows + empty row; Slowest stretch; footer ages; Esc closes (verified)

**ForecastExpandModal**
- [x] Backdrop dialog closes on click (verified); "Predicted" badge + h2; subtitle `+h · around … · model · N% accurate`; compact picker; Close; chromeless map + forecast legend; "Corridor at …" + spinner; error/empty text; tally (verified "1 Congested 11 Slow 7 Clear"); ranked list; Esc (code unchanged)

**Colouring rules**
- [~] Three status colours: values changed to the Night Corridor state tokens (dark #2fbf6b/#f6c544/#ff5a4a, light #12804a/#946500/#c8322a), as the task requires; the rule (3 colours) unchanged
- [~] No data: #5d6f96/#b9c5da → #586377/#7d8799 (= `--signal-none`)
- [x] Forecast ribbon match, queue/mark match, jam-tail match — expressions unchanged
- [x] State → level (Low 0, Med 2, High 4, Severe 5); live silence green / forecast silence grey
- [x] Forecast segment with a typical queue drawn green with the queue over it
- [x] NB/SB separately via the same pixel OFFSET
- [x] Forecast colours both directions; live per direction
- [x] SIDE_CUT 0.4
- [x] 50% shown-state rule (predicted-queues.ts untouched)
- [x] Exit-plate colour within 450 m
- [x] Worst on top
- [~] `palette.level`: the two shades inside each band are flattened to the band's one colour (brief: no in-band shading). Also read by the Overview's InteractiveRoadMap (see For the lead)

**Animation / dev handles**
- [~] Flow uses animated StyleImages, not rAF — still true for the existing pulse; the new flow dashes are stepped by a rAF loop (≤30 fps, paused when hidden / off-screen / covered / reduced motion), as the brief specifies
- [~] Static dasharray only on jam-tail — new `lm-flow-*` layers step `line-dasharray`; `lm-lane-dash-*` and forecast edges are static dashes
- [x] `pulsing-marker-*` classes; unconfirmed dimmed
- [~] "No prefers-reduced-motion handling" — now handled: pulse images freeze, flow dashes hidden (static arrows remain), jam glow static (verified: no dasharray change, visibility none)
- [x] `window.__nlexMaps.live/forecast`
- [x] Window events `nlex:flyto` / `nlex:resetview` / `nlex:showreport`; theme via `smartflow:themechange`

**Feed filtering**
- [x] 200 m corridor guard, isNlexStreet, alert types, disputed dropped, unconfirmed styled, snapping/direction, page stats use the same guard (all unchanged)

**Keyboard**
- [x] Esc closes WLM and FEM
- [x] No Esc for dropdown / detail panel (as built)
- [x] Native select and range buttons. New: strip lanes are focusable, arrows walk 1 km, Esc releases; timeline ticks, Live chip, strip mode/collapse, 3D are buttons

**API endpoints**
- [x] `/real-time`, `/forecast?hours=`, `/forecast/peaks`, `/live-overview`, `/exits` — same calls, same params. New read-only: `GET /api/maintenance/list` via `authedJson` (one shared request, 60 s refresh)
- [x] No localStorage / sessionStorage added

#### Diff guard

Command: `git diff -U0 -- <page.tsx, TrafficMapPanel.tsx, WazeLiveModal.tsx, ForecastExpandModal.tsx, MapLegend.tsx, ForecastHorizonPicker.tsx, map-palette.ts, nc-livemap.css> | grep -E '^-.*(on[A-Z][a-zA-Z]+=|fetch\(|href=|use(State|Effect|Memo|Callback|Ref)\(|router\.|localStorage|aria-|role=)'`
Output: empty (no removed line matches). New files are untracked and add only. tsc: whole project clean (exit 0).

#### Second pass

What changed (same files; no new files; nothing in shared files or Back-End):
- **The map is the stage, both themes.** New layer `lm-ribbon-glow` (wide, blurred expressway-blue light under the halo, NB ribbons only so it is not doubled). The light theme's halo is now a luminous blue wash (`#3660ff`, 16%), no longer a dark shadow, and the light scrim is paper at 64% so the Mapbox light roads and labels go quiet. A soft stage-coloured vignette sits inside the map canvas, under the markers and controls: it darkens the edges at night and lightens them on paper. Colouring rules, the 50% rule and every existing layer, popup and modal are unchanged.
- **Calmer chrome.** Panel heads, footers, the timeline and the strip sit on the stage, not on cards.
- **Cards: fewer words, more structure.**
  - Exit card: the location is now a labelled "Where" row, next to Access and Toll.
  - Predicted queue card: the basis-and-side paragraph is now labelled rows ("Basis", "Source", "This side") plus one short line. All facts and numbers are kept.
  - Rows are split by hairlines.
- **Jam callouts** are capped at corridor zoom: the worst 4 below z10.5, 8 below z12, all of them closer in. Every queue keeps its glow and its card. The predicted delay now reads "~2 min", matching the card.
- **Timeline:** the chosen hour floats large above its tick ("2:00 AM · TODAY"); the large time on the forecast map stays.
- **Corridor strip as an instrument.**
  - One field: northbound lane, a dashed median, southbound lane. Lanes are 16 px pills with rounded ends.
  - An exit grid crosses both lanes, with longer ticks for named exits.
  - Jams are raised bars with a soft glow in their state colour.
  - A km ruler: minor ticks every 5 km, labels every 10 km, and "Km 12" / "Km 88.25" at the ends.
  - A floating cursor chip ("Km 44.9 · NB · near Pulilan").
  - A Live / "+N h" badge: green dot for live, violet ring for forecast.
  - Forecast mode keeps its hatch and dashed violet lane frames.
- **Mobile: the map first, with a sheet.** Each map is `clamp(340px, 60vh, 540px)` tall. Its overlays become a sheet under it: rounded top, grabber, then the data-age badge or forecast time, then the model card with the inert buttons, then the Legend pill. No overlay covers the mobile map any more.
- **Robustness:** the map's load handler now stops if that map was replaced (new hour or theme) or unmounted while its feed was loading. Before, it kept drawing on a removed map and threw "Cannot read properties of undefined (reading 'addEventListener')".

###### Copy log (second pass)
- Exit hover card: location line → row "Where: {location}" (same value).
- Predicted queue card: "{basis}. {n}% of jams here at this time of day are on this side ({h} live jam-hours); the other side is drawn only if it carries 40% or more." → rows "Basis: This exit, this hour | This exit, any hour | Corridor-wide (too little history here)", "Source: Waze jams 2022–2026" (only for the two per-exit bases, which named that source), "This side: {n}% of jams at this time ({h} live jam-hours)", then "The other side is drawn only at 40% or more." The no-shares wording "No live jams here yet to say which side, so both are drawn." → "No live jams here yet to pick a side, so both are drawn."
- Predicted callout delay "+~2 min" → "~2 min".
- New: the chosen time above its timeline tick ("{time} {day}"); strip ruler labels ("Km 12", "20" … "80", "Km 88.25"); badge "Live" / "+N h".

###### Inventory changes (second pass)
- [~] Predicted queue card: basis and side-share are now labelled rows. Every fact, number and data source is still on the card.
- [~] Exit card: location moved into a "Where" row.
- [~] Jam callouts: capped at corridor zoom (4, then 8, then all). Every queue still has its glow, its dot and its card.
- [~] Mobile: overlays move into a sheet under the map. Same controls and data, no extra clicks; the legend stays a `<details>` pill.
- [x] Everything else is as listed in the first-pass inventory. Re-walked in dark after these changes: layers, flow dashes moving, strip ↔ map hover, horizon tick, Live chip, ranges 12h/24h/7d (12/13/8 ticks), 3D 50°/0°, exit fly-to 12.5 and reset, predicted card, closure card, WazeLiveModal (Esc closes), ForecastExpandModal (backdrop closes), strip collapse, legend rows. 0 console errors.
- Light: the first light walk reached and screenshotted both modals (`ix2/light-07-wlm.png`, `ix2/light-08-fem.png`). The run then lost its session mid-walk; that is what raised the one page error, and the guard above now covers that path.

###### Diff guard and tsc (second pass)
- Diff guard over my files: empty output (no removed handler / fetch / hook / aria / role line).
- `npx tsc --noEmit -p .`: whole project clean (exit 0).

###### Screenshots (second pass)
- `.playwright-cli/redesign-after/{dark,light}-{desktop,mobile}/livemap.png` / `livemap-fold.png`: confirm round, 0 console errors, all four views.
- Interactions: `scratchpad/livemap/ix2/dark-*.png` (full walk), `ix2/light-07-wlm.png`, `ix2/light-08-fem.png`.

###### For the lead (second pass)
- **The login session is gone.** `session-refresh-once.mjs` now reports "SESSION LOST at /"; my read-only walks each spent the single-use refresh token. Any further screenshots need a fresh sign-in. So the last fix was not re-captured in the browser: a CSS tweak moving the strip's Live/+N h badge into the ruler row and pinning the first and last exit names to the strip ends. tsc is clean.
- `shots.mjs` ignores `--wait` for livemap (the view sets `wait: 14000`). On a slow first load the dark maps sometimes have not fired `load` by then (CARTO plus Mapbox's `load` waits for tiles); the full-page resize then shows them blank. Using `style.load` would draw the corridor sooner, but it changes when the map draws, so I left it.


### Maintenance and Mobile App

_From result-ops.md._

##### /dashboard/maintenance
**Header**
- [x] Icon Wrench (in the PageHeader eyebrow), title "Maintenance Overview", subtitle unchanged

**Filters (row A)**
- [~] Filter icon + label "Status": label present; the filter icon is hidden by the lead's shared module rule `.filterGroup > svg { display:none }`
- [x] Segmented "All / Scheduled / In Progress / Completed / Cancelled"; active has class `active` and the check icon (re-shown on this page); `aria-pressed` added
- [x] Search box `.ms-search-bar` with Search icon, placeholder "Search schedules…"; matches title/description/Km/direction (verified: "toll" → "1 of 2 shown")

**KPI tiles (row B)**
- [x] In Progress (count + "3.0 km under work right now" / "no active roadwork") — matches baseline (1, 3.0 km)
- [x] Scheduled (count + "next: …" / "nothing upcoming") — matches baseline (1, nothing upcoming)
- [x] Completed "all time" (0) · [x] Cancelled "all time" (0)
- [x] "…" while loading (code unchanged; load too fast to capture)

**Schedule list (row C)**
- [x] Card title "Maintenance Schedules" · [x] subtitle "Loading…" / "x of y shown" (2 of 2, as baseline)
- [~] "Schedule Maintenance" (Plus icon) opens an empty form — now the accent ghost `.btn-primary` instead of `ms-btn-primary`; the view's one white pill is the form's submit. Verified opens.
- [~] Error "Live data unavailable — is the backend running on port 4000?" — words unchanged, now StateNote (offline). Verified by code (backend up).
- [~] Empty "No maintenance scheduled yet — create the first one." — words unchanged, StateNote (nodata). By code.
- [~] Filtered empty "Nothing matches the current filters." — words unchanged, StateNote (nodata). Verified live (Completed filter).
- [x] Columns Status / Work / Location / Window, each `SortableTh` with `aria-sort`, title tooltip, ▲▼⇅
- [x] Sort cycles asc → desc → cleared (verified on Status); Status by lifecycle rank, others by title / start_km / starts_at (code unchanged)
- [x] Status cell `StatusControl` (`ms-badge {blue|yellow|green|red}`, title "Change status", `aria-expanded`); menu lists transitions + danger "Cancel schedule…" (verified; opening it does not open the row)
- [x] Work cell title + description clipped at 380 px · [x] Location `Km a–b · dir` + lane closure line · [x] Window `fmtWindow`
- [x] Row click opens the detail dialog (verified) · [x] inline action error under the table (code; class only) · [x] no pagination
- [~] Mobile (≤760 px): rows stack (work + status, then Location, then Window); the sort headers stay as a row of pills. Every column and sort remains.

**Status lifecycle**
- [x] Labels/colours scheduled blue, in_progress yellow, completed green, cancelled red (pills with a dot)
- [x] scheduled → "Start work"; in_progress → "Mark completed" / "Revert to scheduled" (verified); completed → "Reopen work"; cancelled → "Restore schedule" (NEXT_ACTIONS unchanged)
- [x] Cancel only from scheduled / in_progress, needs a reason · [x] backend scheduled→completed not offered (unchanged)

**Detail dialog**
- [x] Backdrop `role="dialog"`, `aria-modal`, `aria-label={title}`; backdrop click closes
- [~] Icon 🛠️ → drawn Wrench icon; h3 title; status pill
- [x] Close `aria-label="Close"` · [x] rows Location / Near / Lane closure / Window / Description / (Reason) / Created (verified)
- [x] Inline action error · [x] "Edit details" (scheduled/in_progress) · [x] NEXT_ACTION buttons with "Saving…" · [x] "Cancel schedule"
- [x] "Delete" for every status — danger ghost `btn-danger`, pushed right; opens the existing confirm (verified, not confirmed)

**Delete confirm**
- [x] `aria-label="Delete schedule"`, h3 "Delete this schedule?", sub `{title} · Km a–b` · [~] icon 🗑️ → Trash2
- [x] Close · [x] body text verbatim · [x] "Delete permanently" ("Deleting…") — solid danger, NOT clicked · [x] "Keep it" (verified closes) · [x] footer "This cannot be undone."

**Cancel dialog**
- [x] `aria-label="Cancel schedule"`, h3, sub · [~] icon ⚠️ → AlertTriangle · [x] Close (verified)
- [x] Textarea "Cancellation reason *", placeholder unchanged; label now associated (`htmlFor`/`id`)
- [x] "Cancel schedule" ("Cancelling…") disabled until a reason is typed (verified disabled), NOT clicked · [x] "Keep it" · [x] footer "This cannot be undone."

**Schedule form (create/edit)**
- [x] `aria-label="Schedule maintenance"`; backdrop closes unless saving · [x] h3 "Edit Maintenance" / "Schedule Maintenance" · [x] Close
- [x] Title * with placeholder · [x] section label "Location"
- [x] Direction *: NB "Northbound" / SB "Southbound" as one two-segment pill (sliding thumb), `aria-pressed`, check icon, no "Both" (verified); legacy "Both" mapping unchanged
- [x] Start exit * placeholders (NB/SB) · [x] Start Km (step 0.01, min/max, "auto", title tooltip) · [x] End exit * placeholders, options ahead of start only · [x] End Km
- [x] Choosing an exit fills its km (verified: "Paso de Blas Valenzuela · Km 15.44" → 15.44; "CDV/PH Arena · Km 26.05" → 26.05)
- [x] Switching NB→SB swaps start and end (verified: 15.44→26.05 became 26.05→15.44)
- [x] Segment note "Northbound · 10.6 km · near … → …" (verified) · [x] Lane closure (5 options, default "Shoulder only")
- [x] Section label "Window" · [x] Start date * · [x] Start time 08:00 · [x] End date * (min = start) · [x] End time 17:00 · [x] Description
- [x] Inline form error · [x] Submit (Calendar icon, "Schedule Maintenance" / "Save changes" / "Saving…") — the white pill `nc-pill`; NOT clicked
- [x] "Discard" (verified closes) · [x] custom Select: outside-mousedown close, `aria-expanded`, check on selected option
- [~] On ≤760 px the 4-column location and window grids become 2-column (exit + km, date + time)

**Validation, toasts, keyboard**
- [x] All seven validation messages and the server/"Save failed" fallbacks: code unchanged (not triggered — nothing submitted)
- [x] Backend SB conflict (`endKm >= startKm`): pre-existing, unchanged, not fixed (as instructed)
- [x] Toasts (status change / delete / save, success and error; 404-as-success; refresh after every mutation; `mutating` double-submit guard): code unchanged (not triggered)
- [x] No Esc handling on maintenance dialogs (unchanged)

##### /dashboard/mobile
**Header**
- [x] Smartphone icon (eyebrow), title "Mobile Control Centre", subtitle unchanged · [x] "Reload" (btn-muted), disabled while loading/saving

**Provenance banner**
- [~] Shown when `meta.source === "defaults"` && !loading; now StateNote (offline mood, warning tint) with `role="status"` passed through; words unchanged. Not observed live (source is "db"); by code.

**Toasts**
- [x] Error toast `role="alert"` + dismiss `aria-label="Dismiss"` · [x] success toast `role="status"` 5 s — markup unchanged, restyled (the old dark-red/green text colours were unreadable on dark); not triggered (nothing saved)

**Advisory strip**
- [x] Megaphone, `is-live` · [x] "Advisories" · [x] counts "1 published · 1 draft" (matches baseline) · [x] chip per live advisory with tone dot + title · [x] empty text (code) · [x] "Manage" opens the dialog (verified)

**Left panel "What travellers get"**
- [x] h2 · [x] `ul.ds-mc-features` with ref, onScroll, `data-fade-top/bottom` — on desktop (≥1101 px) the list scrolls inside the panel, sized to the phone, with its edge fades
- [~] ≤1100 px: the list flows with the page (no inner scroll); every row reachable
- [x] ResizeObserver (unchanged) · [x] 5 rows `is-on/is-off` + `is-open` · [x] disclosure `aria-expanded` + `aria-controls` · [x] icon, label, blurb
- [x] Pill "{on}/{total} on" · [x] pill "Hidden" + EyeOff · [x] chevron (now rotates when open) · [x] scrollIntoView on open (unchanged)
- [x] Region `id="sections-{key}"` · [x] bulk caption · [x] "Turn all off" / "Turn all on" (verified on Assistant, then discarded)
- [x] Per-section icon, label, blurb (blurbs now wrap instead of being ellipsised; stacked under the label below 760 px)
- [x] Per-section switch (`input` before `.ds-switch-track`), disabled while loading, sr-only "{tab}: {section}" · [x] 14 switches · [x] no tab-level switch
- [+] New, presentational: hovering or focusing a section row highlights its card in the phone; a tab row highlights its tab in the bar (CSS `:has()` + `data-mc-control` / `data-mc-preview` attributes; no state or handlers added)

**Preview**
- [x] h2 "Preview" + caption · [x] `aria-label="Mobile app preview"` · [x] frame + notch (now a dark handset in both themes; screen follows the theme)
- [x] Status bar "9:41" + Signal/Wifi/Battery · [x] app bar label + dot · [x] hidden-tab screen (verified "Assistant is hidden …")
- [x] Advisories only on Alerts, by tone, headings Critical/Advisory/Notice (verified on Alerts) · [x] one card per on section, two placeholder bars, no figures (verified 5 → 4 when a switch goes off)
- [x] `nav aria-label="Preview a tab"`, 5 buttons, `title`, `is-current` · [x] `is-gone` hides emptied tabs (verified display:none) · [x] jump pills (verified) · [x] note (verbatim)

**Advisory dialog**
- [x] Backdrop `role="presentation"`, closes on its own click · [x] `role="dialog"`, `aria-modal`, `aria-labelledby="advisory-title"`, `is-wide` · [x] Escape closes (verified)
- [x] Closing does not revert (code) · [x] header Megaphone + h2 "Advisories" + counts · [x] Close
- [x] Empty state (code; 2 advisories exist) · [x] list `tone-{tone}` + `is-live` · [x] state "Published"/"Draft" with dot · [x] pending chip
- [x] Delete advisory (Trash2, `aria-label`, no confirm) — present, not clicked · [x] textarea 280 / placeholder · [x] counter `is-near` · [x] Tone group `role="group"` `aria-label="Tone"` (verified)
- [x] "{k} more to publish" · [x] Publish switch (disabled < 8 chars, titles) · [x] auto-unpublish (code) · [x] "Add advisory" / "Limit reached" — present, not clicked
- [~] Tone shown by a dot, the tone control and a tone-tinted card when live, instead of the old 4 px coloured left edge (craft floor bans thick coloured edges)
- [x] Footer note (verified "Nothing to send") · [x] "Cancel" (reverts advisories only) · [x] "Save & publish" — now the dialog's one white pill; NOT clicked

**Save bar**
- [x] Sticky `.ds-mc-savebar`, `is-open` when dirty and the dialog is closed, `aria-hidden` otherwise (verified opens on a switch change)
- [x] Blocked reason / "Unsaved changes." · [x] "Discard" (verified reverts the draft, local only) · [x] "Save & publish" — white pill, NOT clicked

**Validation / errors / data**
- [x] "A published advisory needs at least 8 characters." · [x] "Everything is switched off — the app would open to nothing." (code unchanged)
- [x] "Could not read configuration" / "Could not reach the dashboard API" / "Save failed ({status})" / "Save failed" / server messages verbatim (code unchanged)
- [x] Controls disabled while loading · [x] `meta.updatedAt/By` and `TONES[].hint` still not rendered (unchanged)

#### Diff guard

Command: `git diff -U0 -- <my 3 files> | grep -E '^-.*(on[A-Z][a-zA-Z]+=|fetch\(|href=|use(State|Effect|Memo|Callback|Ref)\(|router\.|localStorage|aria-|role=)'`

Output (24 removed lines), each with the equivalent added line:
- `<div className={styles.customSelectWrap} ref={ref} onClick={(e) => e.stopPropagation()}>` → same element, `className` adds `nc-ops-status`; same `ref`, same `onClick`.
- Status filter `<button key={s} … onClick={() => setStatusFilter(s)}>` → same `onClick`; `aria-pressed` added.
- `<button className="ms-btn-primary" style=… onClick={() => { setFormError(null); setEditId(null); setForm(emptyForm); setFormOpen(true); }}>` → `className="btn-primary nc-ops-new"`, identical `onClick`.
- 4× `<div className={styles.detailBackdrop} role="dialog" aria-modal="true" aria-label=… onClick=…>` (detail, delete, cancel, form) → same `role`, `aria-modal`, `aria-label`, `onClick`; `className` adds `nc-ops-backdrop`.
- 4× `<div className={styles.detailModal} [style=…] onClick={(e) => e.stopPropagation()}>` → same `onClick`; inline width moved to `nc-ops-modal is-*` classes.
- `ms-btn-cancel` / `ms-btn-submit` buttons (Edit details, NEXT_ACTIONS, Keep it ×2, Discard, Submit) → identical `onClick`/`disabled`; classes now `btn-muted` / `btn-primary` / `nc-pill`.
- 4× date/time `<input … onChange={(e) => set(…)}>` → identical, `id` added for label association.
- `<div className="ds-mc-banner is-warn" role="status">` → `<div className="ds-mc-banner is-warn nc-ops-banner">` wrapping `<StateNote … role="status">`; the status role moves to the StateNote root, which holds the same text.
- `<AlertTriangle size={16} aria-hidden="true" />` (banner) → replaced by StateNote's decorative mascot (also `aria-hidden`).
No hook, state, effect, fetch, route, storage key or handler body changed. Removed only: the `SECTION_STYLE` constant (inline style, now CSS) and inline `style` props.

Typecheck: `npx tsc --noEmit -p .` → 0 errors (whole project, at the time of the run).


### Scenario Sandbox, AI Sandbox redirect, Data Management, Audit Log

_From result-admin.md._

##### /dashboard/scenario-sandbox
**Page header**
- [x] Title "Scenario Sandbox", icon Car
- [x] Subtitle template `Agent-based what-if simulation · {origin} → {destination} · Km a–b` (about 8 words, under the limit)
**Top row**
- [x] "Carriageway" label + lane icon; tablist `aria-label="Carriageway view"`, role=tab + aria-selected, check mark, labels and titles (switched to Northbound and back in the parity walk)
- [x] "Forecast day" + ForecastDayPicker (disabled until data arrives)
**ForecastDayPicker** (restyled module: hairline pill trigger, raised popover, accent selected day, model-violet coverage dot)
- [x] Trigger aria-label/aria-haspopup/aria-expanded, long date or "Pick a day"
- [x] Popover role=dialog `aria-label="Choose a forecast day"`, fixed (opened in the parity walk)
- [x] Previous/Next month buttons, stop at covered range
- [x] Month title, weekday header
- [x] Day buttons: covered days enabled, aria-pressed, titles
- [x] Incident-coverage dot; legend; "Forecast days: first – last"
- [x] Closes on Escape (verified) and on outside click, focus returns to trigger (logic unchanged)
**Forecast card "Simulate a Forecast Day"**
- [x] h3 + lede (unchanged); [~] "Model forecast" pill added
- [x] "Load into simulation" / "Loading…" / "✓ Applied" / "✓ Following forecast" + title + disabled. Restyled as an accent ghost pill; the white pill is Play
- [x] Tiles: Corridor volume, Segment inflow (accent), Predicted incidents, Predicted CO₂, all values and subs unchanged (32 px tabular)
- [x] Foot: Fleet mix, Highest risk
- [x] "What gets loaded?" / "Hide detail" toggle reveals the help paragraph (verified)
- [x] Backend notes; card hidden on fetch failure with no data (logic unchanged)
- [x] Following the forecast drives auto-framing and coverage (logic unchanged)
**Metric tiles**
- [~] Both-mode caption: first sentence visible, method in an InfoTooltip (copy log); "Simulation" pill added beside it
- [x] Six Both tiles with tags and titles (Active agents/total, Avg speed/flow-weighted, Throughput/total, Longest queue/max, CO₂ rate/total, Density/per direction with "no total"), per-direction rows, delta chips, "vs baseline"/"≈ baseline", tones. Values at 32 px from 1600 px wide, 20 px below that so "18.7 kg/min" fits
- [x] Single-direction tiles and deltas (markup unchanged)
- [x] Loading "…" placeholders
**Simulation card head**
- [x] h2 "Traffic Simulation"
- [x] Live clock "Simulation time", date, editable TimeField (restyled as a hairline capsule)
- [x] Speed buttons 0.5×/1×/5×/10× with active state (all four checked one by one)
- [~] Play/Pause/Back to live: same handler, now `nc-pill` (the view's one white pill; toggled Pause→Play in the walk)
- [x] "⟲ Replay incident" (shown only when the recording holds an event)
- [x] Reset with title
- [x] Full screen: "Hide controls"/"Controls" with aria-pressed; "Full screen"/"Exit full screen" (opened, then Esc exits: verified)
**Replay review row**
- [~] Badge "Reviewing", ◀/▶, scrub slider `aria-label`, status text, "Back to live". Same markup and handlers. The 3 px brand left edge is gone; the row is a raised hairline panel with accent text (no event was recorded during the walk, so the row itself was not opened)
- [x] One recording per carriageway (logic unchanged)
**Full-screen HUD**
- [x] Carriageway tablist (full screen), Forecast day picker, key hints, notes toggle with aria-expanded, `--fs-top`, page scroll lock (all present in the full-screen capture)
- [~] Full screen now sits above the sidebar. The shell's new `.ds-main { isolation: isolate }` had trapped the fixed card under the sidebar, hiding its title and Play. I added a scoped `.ds-main:has(.sandbox-main.is-expanded) { isolation: auto }` in nc-sandbox.css. The full-screen rail now runs full height with square corners
**Notes above the canvas**
- [x] Placement note `[data-place-note]` and all its strings (markup unchanged; now in accent instead of error red)
- [~] Both-mode explainer behind "Details" (verified it opens)
**Canvas**
- [x] Every canvas item: classes `placing`/`is-drop-target`, click/hover/probe, drag/drop ghost, lane tags, km axis, flow labels, corner labels, ramp tags, closure preview, congestion bands, incident and scenario marks, scene art, facilities, reallocation drawing, day/night asphalt, motorcycles, sprite colours. Drawing code untouched; only the card's spacing and radius changed
**Footbar**
- [x] Warm-up notes (one per direction in Both mode), unmet-demand warning (warning hairline)
- [x] Legend incl. `data-legend="motorcycle"` "…from NLEX's records". The red/amber swatch literals stay because they key the canvas marks
- [x] Before/after CompareBlock (head, Before/After, 4 rows, good/bad deltas in tokens)
- [x] Both-mode `data-compare-none` per direction
- [~] Prescriptive recommendation(s) with tone class and `data-reco`. Text and tone logic unchanged. The 4 px coloured edge and tinted slab are replaced by a tone hairline and tone label; a "Simulation" pill sits on the label
**Side rail**
- [x] h2 "Simulation Controls"/"Command Prompt"; tabs Controls/Command with role=tab + aria-selected (switched in the walk)
**Rail "Corridor"**
- [x] Origin/Destination selects (other end disabled), Inflow slider(s) 1000–8000 step 100 + InfoLabel texts, second Both-mode slider
- [x] "Along the route" toggle (aria-expanded) + PlacesList (key, list role/aria-label, titles, is-on/is-anchor, auto-scroll) + two-click span + "Fit whole route" + hints with OSM credit
- [x] Carriageway read-only status + long info; Segment + info; From/To km KmInputs (`data-km` window-from/to); segment hints (hotspot, too fine, 3 km cap)
- [x] Lanes value: green from the road, amber otherwise (now `--color-success`/`--color-warning`); `[data-lanes-note]`; Change lanes/Done; "Back to the road's"; Lanes slider(s) 2–5 (6 under reallocation)
- [~] Slider value colours: the segment length (was violet), speed zone (was orange) and reallocation state (was amber) read in ink; the inflow readout uses the page accent. All sliders share the page accent (they were blue, green and orange). Values unchanged
**Rail "Interventions"**
- [x] Per-direction DirectionPanel with pill + info. [~] The 3 px coloured left edge was removed; the pill names the road
- [x] "Close a lane…" + tooltip, L1..Ln toggles (closed = danger), locked titles, closed-stretch label, locked note, closure KmInputs, Set stretch/Click start…/Click end…, Clear incidents (n), closure hint
- [x] Speed limit zone value, locked note, slider 20–100 step 5 (100 = off) with title, zone KmInputs
**Lane reallocation (Both only)**
- [x] Label + `REALLOCATION_INFO`, value off/`NB +n`, stretch KmInputs (`data-km` realloc-from/to), `data-zipper-note="stretch-error"`, radiogroup Off/NB +1/NB +2/SB +1/SB +2 with disabled titles, state hint, window move/restore (markup and logic unchanged; verify.ts patterns pass)
**Rail "Scenario events" (ScenarioPanel: file not edited)**
- [x] Every item (drag hint, 9 family chips, unsupported slot, Add-to tablist + notes, ScenePreview, the "i" popover, rain intensity, vehicle/cause/collision selects, Where radiogroup, hotspot candidates + source line, pick buttons, plaza place/stations/approach, Km field, place notes, Lane select, Extra lanes, Start TimeField, Duration choices, Redraw, Minutes, resolution block + badges, preview phases, refusal, Add button, events list, Skip + estimate + confirm + progress, event rows/meta/progress/phase lists, suspended notes). The section opened in the walk; restyled through CSS only (chips, badges now on tokens)
**Rail "Baseline comparison"**
- [x] Lede, per-direction panels, steps 1–3 with texts, Capture baseline/Re-capture, Clear, step markers ✓ with is-done/is-now (opened in the walk)
**Rail "Confidence run"**
- [x] Lede, Runs slider 3–20, Run/Stop (disabled in Both mode / with events), progress, both warnings incl. `data-reps="both-disabled"` (seen in the full-screen capture), results table, unmet warning, method note
**Command tab**
- [x] Lede, Both-mode "Commands apply to" tablist, textarea + placeholder, "Execute Command"/"Interpreting…" (accent ghost pill, no longer a gradient), error line, proposal card (target pill, reply, actions, Not applied, warnings), Apply (accent ghost)/Discard (hairline ghost), result note. Not executed: it calls the server LLM. Tab and prompt verified visible
**Keyboard / interaction**
- [x] Full-screen keys and Esc (Esc exit verified), Esc disarms placing, KmInput/NumberField/TimeSegment keys, picker Esc (verified), one placing tool at a time (logic unchanged)
**ids / data-* / aria / CSS hooks**
- [x] Every listed `data-*`, `data-scn*`, aria attribute and CSS hook (`--fs-top`, `--range-pct`, `is-expanded`, `with-rail`, `is-both`, `is-folded`, `sandbox-hud-top`) is untouched. verify.ts confirms its 134 patterns
**Behaviour notes (pre-existing, unchanged)**
- [x] "1–4 speed" hint vs keys 3/4 doing nothing; placement note only in Both mode docked; "density view" promise; Start-field title mentions "Hour of day"
- [~] Layout fix: on phones the controls card used to cover the simulation card's lower half (road, notes, recommendation). This was already in the baseline capture. Cause: `.sandbox-grid` was `flex: 1 1 0%; min-height: 0` inside the flex-column page, so it collapsed to 0 px with 34 px rows. Fixed with `.sandbox-grid { flex: none }` in nc-sandbox.css (desktop grid now 1479 px tall, mobile cards stack cleanly)

##### /dashboard/ai-sandbox
- [x] Route file kept, renders null; `router.replace("/dashboard/scenario-sandbox")` in an effect (walk: landed on /dashboard/scenario-sandbox)
- [x] Client redirect on purpose (`output: 'export'`); file unchanged
- [x] Stays in incident-operator's DENIED list (auth-access.ts untouched)
- [x] Audit-log path label "AI Sandbox" (PAGE_LABEL unchanged)
- [x] Backend namespace `/api/ai-sandbox/*` unchanged

##### /dashboard/data-management
**Header**
- [x] Icon Brain, title "Data Management"
- [x] Subtitle unchanged (14 words)
- [x] Status pill "ETL Pipeline Ready" (blue) / "Backend offline" (red)
**Backend-down alert**
- [~] Now a StateNote kind="offline" with `role="alert"` (kept). Heading text is the StateNote title, the body is unchanged (URL, `npm run dev`, `Back-End`, "Nothing has been deleted"), and "Try again" still calls `loadAll`. Not triggered live: the backend is up
**Upload zone**
- [x] `article.upload-zone` with the UploadCloud icon (now a hairline ring), heading, intro paragraph
- [~] File picker label "Select File"/"Checking..."/"Loading..." (wait cursor, 0.7 opacity) is now the view's white pill (`nc-pill`)
- [~] Hidden input `accept=".csv,.tsv,.json,.xlsx,.xls"`, single file, disabled while busy: now `className="sr-only"` instead of `display:none`. Tab reaches it, Space/Enter opens the picker, and the pill shows a focus ring (verified it takes focus). Before this, keyboard users could not reach it
- [x] Input value reset after pick (handler unchanged)
- [x] Click-to-pick only, no drop handlers (verified). The brief's "accent brightening on drag-over" was NOT added: there is no drop handling, and lighting up on drag-over would promise a drop that does nothing. The zone is a dashed hairline (verified `dashed`) that brightens to the accent on hover and keyboard focus
- [x] Caption "No file selected yet" / file name; progress line with 1 s elapsed counter (accent, tabular)
- [x] Server limits and messages (backend untouched)
**Confirm-upload dialog**
- [x] Backdrop role=presentation (click cancels), Escape cancels (verified), dialog role/aria-modal/aria-labelledby, title id, name + size ("8 B" seen), note, Cancel / Check only (autoFocus) / Upload & load. Opened by picking a file, then cancelled; nothing was sent, and upload POSTs were blocked in the walk anyway
- [~] Dialogs now dim the sidebar too. The same `.ds-main` isolation trap left the sidebar bright above the backdrop; fixed with a scoped `:has()` rule in nc-admin.css (verified in capture)
**Steps** (shown when there is no result and no error)
- [~] `ol.ds-steps` with its aria-label, four steps (Classify/Validate/Load & publish/Retrain weekly), icons and texts unchanged. Now one hairline strip divided by hairlines; the 3 px accent edge per card is gone
**Upload error panel**
- [~] "Pipeline Error" + message is now a StateNote kind="error" (title same words); all five message strings come from unchanged handlers. Not triggered (would need an upload)
**Result panel / comparison / mini stats / gates / rejected rows / errors-notes**
- [x] All markup present and unchanged in logic. [~] Literal colours moved to tokens: inserted green and rejected/refused red via `.ok`/`.bad`; gate pills are now `pill green`/`pill red` with the same PASSED/FAILED text; the "Pipeline Errors"/"Notes" headings use `.bad`/`.warn`. Not rendered live: a result needs an upload, which is forbidden
**"What can I upload?"**
- [x] Failure line variant (unchanged), `<details class="panel dm-formats">` collapsed by default, summary with layout count and record-end rule, groups with `aria-label`, is-wide, accepted/not-accepted items (opened in the walk)
**Recent uploads**
- [x] Heading, undo note, columns #/FILE/LAYOUT/STATUS/ROWS WRITTEN/WHEN/[Undo aria-label] (7 verified), LAYOUT fallback, STATUS pills, WHEN format, Undo button + titles + disabled rules (no undoable rows exist right now), "Loading…" row, 12 most recent
- [x] Sticky hairline header (verified `sticky`), row hover at 3%, tabular figures
- [~] Error row "Not loaded: …" and empty row "No uploads recorded yet. Checks are not recorded: they change nothing." now render inside a StateNote in the cell (same words)
**Undo dialog**
- [x] All markup, preview text, buttons and disabled rules unchanged. Not opened: no row offers Undo now, and opening it runs a dry-run POST
**Weekly model retraining**
- [x] Heading, intro + "Next batch: date", last batch line + status pill + summary, table MODEL GROUP/RESULT/DETAIL, retrainPill colours, DETAIL lines, "Earlier: …"
- [~] "Not loaded: …" and "No batch has run yet." are StateNotes (same words); "Loading…" stays plain text
**Shared error text from getData**
- [x] Unchanged

##### /dashboard/audit-log
**Header**
- [x] Icon ClipboardList, title "Audit Log", subtitle unchanged (12 words)
- [x] `<select aria-label="Insights period">` 7/30/90 (switched to 7 in the walk)
**KPI cards**
- [x] Actions, Active users, Page views, Uploads loaded, "—" until loaded
- [~] Icon tones (blue/green/purple/red) replaced by one neutral hairline ring. The red and green were status colours standing in for categories ("Uploads loaded" sat in danger red). Icons unchanged
**Insights**
- [~] Error line "Insights unavailable: {error}" now inside a StateNote (class `audit-warn` kept; AlertCircle glyph dropped)
- [x] Activity per day: stacked daily bars, zero-filled Manila days, role=img + aria-label, per-day titles, legend. Restyled: actions in the accent, views in model violet at 55% (they were a near-invisible 13% tint), on a hairline baseline
- [x] Activity by module, Most-used pages ("{views} · {users} user(s)"), Where maintenance waits (+ note, warn flags, up to 3 items), Uploads & retraining (all four lines + model groups), Most active users + empty "No signed-in activity yet." + unidentified note, Bars empty state "Nothing recorded yet.", bar label titles/track/fill/value
**Table toolbar**
- [x] Search (now also `aria-label="Search logs"`), Category / Severity / Date range selects (aria-labels added), filtering verified (Warning: 73 → 21 rows)
- [~] "Export JSON" is now the view's white pill (`nc-pill`). It downloaded `audit_logs_2026-10-03.json`; the activity POST was blocked in the walk so nothing was written
- [x] "Clear" (btn-danger) resets search + 3 selects (verified back to 73 rows)
**Table**
- [x] 7 SortableTh headers with aria-sort; asc → desc → cleared verified on ID; titles and arrows from table-sort.tsx; severity rank and date sorting (logic unchanged)
- [~] ID cell "#{id padded to 3}": was Tailwind `font-mono text-xs text-gray-500`, now `audit-id` (tabular Outfit, muted). TIMESTAMP is tabular and nowrap
- [x] USER + role sub-line, ACTION, DETAILS composition, SEVERITY pills red/amber/blue, severity rules
- [~] CATEGORY badge: same lowercase text, now a neutral hairline pill. Colour on the row is reserved for Severity; the old map made Maintenance danger red, a status colour used for a category. The category is still in the text and still filterable
- [~] Sticky hairline header (verified) inside a bounded scroller (`max-height: min(72vh, 860px)`, 70vh on phones), so column names stay in view across 500 rows. DETAILS wraps (220–320 px) instead of pushing the table sideways
- [x] "Loading…" row; no pagination, up to 500 rows (73 loaded)
- [~] Error row "Live data unavailable — is the backend running on port 4000?" and empty row "No audit events yet — actions like scheduling maintenance will appear here." now sit inside a StateNote in the cell, same words (empty state verified via a no-match search)
**Export**
- [x] Filename `audit_logs_{UTC date}.json`, visible rows in on-screen order, mapped shape, `logActivity({type:"audit.exported",…})` call unchanged
**Label maps / formats / unrendered summary fields**
- [x] MODULE_LABEL, PAGE_LABEL, span(), insight date format: unchanged; `undoRefused`/`lastTrained` still not displayed

#### Diff guard

Command: `git diff -U0 -- <my tracked files> | grep -E '^-.*(on[A-Z][a-zA-Z]+=|fetch\(|href=|use(State|Effect|Memo|Callback|Ref)\(|router\.|localStorage|aria-|role=)'`
```
-          <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
-          <select value={selectedSeverity} onChange={(event) => setSelectedSeverity(event.target.value)}>
-          <select value={selectedDateRange} onChange={(event) => setSelectedDateRange(event.target.value)}>
-          <button className="btn-primary" onClick={exportJSON}>Export JSON</button>
-        <section className="panel" role="alert" style={{ marginBottom: 16, borderColor: "var(--color-danger-border)" }}>
-          <button type="button" className="btn-muted" onClick={loadAll}>Try again</button>
```
- The three selects: re-added unchanged, plus a new `aria-label` (`<select aria-label="Category" value={selectedCategory} onChange={…same…}>`, likewise Severity / Date range).
- Export JSON: re-added as `<button className="nc-pill audit-export" onClick={exportJSON}>`, same handler.
- `role="alert"` section: the role moved onto the StateNote (`<StateNote kind="offline" role="alert" …>`), so screen readers still get the alert.
- Try again: re-added one level deeper inside the StateNote with the same `onClick={loadAll}`.
- `ai-sandbox/page.tsx` has no diff. ScenarioPanel.tsx and ForecastDayPicker.tsx are unchanged. The sandbox page diff touches only classNames, inline presentational styles, one disclosure wrapper and the pills.

<!-- PARITY:END -->

---

# Changes after the final report (5 Oct 2026, user requests)

Nothing removed; every control and figure below is still on its page.

- **3D car (v2).** Reworked body, bumpers, side windows, taillights, headlights with glow, egg-shaped mirrors, a cap with a longer brim, studio reflections, a sky-blue rim light, and wheels that rest with the hub "N" upright. Details in `components/stage/mascot/README.md`.
- **Overview, first load.** Placeholder bars replace "Reading the live feed…" in the headline, freshness line and slowest reading (the words stay, for screen readers). The flat stand-in picture stays hidden while the 3D car loads; it still shows after 6 s if the car never arrives, or at once without WebGL. The car fades in and is built when the browser is idle. The same applies on sign-in.
- **Overview, Live Corridor Status.** Road v2: taller carriageway on textured asphalt, edge lines, dashed lane lines, a green shoulder on clear stretches, a concrete median holding the km posts, larger vehicles. Same queues, hover rail, labels and legend.
- **Emissions, Descriptive.** The six KPI tiles sit in one row at 1400 px and wider (1180 px with the sidebar collapsed), an even 3 + 3 below that, and 2 + 2 + 2 under 980 px. Replaces the 2 + 1 + 1 / 1 + 1 + 2 rhythm.
- **Live Map.** The two maps are separate cards with a 16 px gutter; the stats under each map are 20 px readouts; the timeline and the corridor strip share one card, with the exact-hour picker at the right of the first row. Road on both maps: one road surface with edge lines and a dashed median under the two direction lanes, and a softer glow. Queues, forecast hatching, closures and flow animation unchanged.
- **Validation evidence opens in a modal** (`components/dashboard/EvidenceModal.tsx`): Traffic Predictive (Volume, Congestion, Events), Incidents Predictive (the trust pills and a new "Validation evidence" button open the metrics table and rainfall evidence), Emissions Predictive (the metrics table and "How it was tested"). The strips keep their headline figures on the card; Esc, the close button or the backdrop close the modal, and focus returns to what opened it. The model narratives stay on the cards.

## Second round (5 Oct 2026, user requests)

- **Live Map, forecast map.** The three icon buttons beside the model card (a compass arrow, zoom in, zoom out) were never wired to anything and duplicated Mapbox's own +/−; removed. The forecast hour and the model card moved off the map into a band under it (the live card's band holds its feed age), so each map carries only its legend and +/−; both cards share their rows, so the two maps stay the same size.
- **Mobile App preview.** The phone keeps a real 9 : 19 screen (it was a fixed 470 px tall), a little wider, and scales down as a whole on short windows.
- **Info tooltips (all pages).** The popup measures itself and stays inside the content column (it ran under the sidebar beside the first KPI tile), flipping below the icon when there is no room above. The icon is glued to the end of its title, and KPI labels keep the icon beside the text.
- **Forecast cards share one layout** (`app/styles/nc-forecast.css`): answer (eyebrow, value + unit, one context line) → models with the overlay toggles at the right → controls (Show / View / History / Ahead, "validated at") → key (Past / Present / Future, notices at the right) → chart → validation-evidence strip. Traffic volume, Incidents and Emissions now follow it; Incidents' trust pills became the same evidence strip as the others; Emissions' header facts became the answer's context line. "Granularity" is labelled "View" and "Horizon" is "Ahead" everywhere. No control or figure removed.
- **Overview.** "The corridor at true scale" removed (user request; Live Corridor Status carries the same per-exit queues). The counts and "Slow and congested now" are one aligned block; the list shows the three worst and "See all N" opens every one in a modal.
- **Live Corridor Status.** The hover rail is taller (the facts line was clipped), exit names run vertically in columns under their km posts, and the vehicles are top-down SVG sprites (car, van, bus, container truck) in whites, silvers, slate and blues, with headlight and taillight glows.

## Third round (5 Oct 2026, user requests)

- **3D mascot rebuilt from the team's character sheets** (v3 then v4; details in `components/stage/mascot/README.md`): a drawn face that blinks, follows the pointer and has the sheet's six expressions; sheet palette; bigger wheels in fenders moulded into the body; headlights on the bonnet with light-blue rings; framed front and rear side windows; chunky bumpers; rounded red and amber taillights, a blue "N" plate, rear window, door handles; a fuller cap with the white panel centred and the strap opening at the back.
- **The mascot moves** (Overview and sign-in): drives in from the right and turns to the reader, bobs and sways, fidgets every 8–14 s (hop, look around, wink, blush), reacts to hover (excited face, bounce, yellow accent lines) and to a click (hop, wink, wheel spin; a hand cursor shows it can be clicked). Sign-in reactions kept: a different face per story, headlight flash on the button, a focused face while signing in, a surprised face and a shake on an error. Reduced motion shows one still, smiling frame.
- **Background effects switch** (`lib/effects.ts`, `EffectsToggle.tsx`): "Effects On/Off" in the dashboard top bar (not on the Live Map, where the stage is already off) and on the sign-in top bar. Off removes the moving wave, light trails, grid lines and the sign-in cursor; the 3D car stays. Remembered per browser and applied before first paint.
- **Traffic.** Congestion forecast hover card redesigned: exit and hour with a state pill, the chance of congestion large, a stacked bar of the three states with their figures, a traffic line, and the expected jam as a small card with queue / delay / speed side by side; same figures as before. "Holidays — Full List" widened to 720 px with no sideways scroll. "Furthest from normal" sits on one line under the card header.
- **Mascot v5** (compared side by side with the sheet): wheels tucked under the body, blue pillars round the face, a larger face, a proper cap peak, softer lighting and deeper, bluer eyes.
- **Info tooltips** open below the icon when the sticky top bar is in the way (they used to draw over it).
- **Mascot v6** ("looks weird, not cute"): widened to the sheet's squat proportions, shorter nose, cap raised off the brows, face redrawn in the sheet's style (heavy-outlined eyes, big pupils, short thick brows, bigger smile), flush headlights, mirrors tucked in, and shown a little from above.
- **Background: aurora** (replaces the liquid-light wave): three folding curtains of green, cyan and violet light with drifting rays over a starry night sky in dark mode; pastel mint, sky and lavender veils on porcelain in light mode. Scroll (and the sign-in story) shifts it toward blue-violet; the pointer nudges it; the Effects switch still turns it off; reduced motion shows one still frame; the no-WebGL fallback is a still aurora gradient.
- **Background: one stream of light** (replaces the aurora): a braided ribbon with a white-hot core, a coloured glow and pulses running along it like traffic, drawn in page space so it runs the whole length of each page and moves exactly with the scroll; blue glass with a white thread in light mode. The light trails are off. The Effects switch, reduced motion (one still frame) and the no-WebGL fallback (a still diagonal band) all still apply.
- **Stream of light, as fibres** (user's reference): the stream is now a bundle of two dozen fine glowing fibres fanning from a bright source at the top left of each page and flowing down its whole length (lime-gold with cyan, glitter, soft particles, a faint haze); light mode draws them in deep green and blue inside a pale lime glow with pale particles. Sign-in runs it at 0.82 strength so the story text holds.
- **Background reverted to the original wave and light trails** (user request), smoothed: soft-edged bands instead of thin contour lines, a slow broad grain instead of the fast crawling one, calmer motion, a stable (non-sin) noise, dithering against banding in the dark gradients, page/accent/theme changes that fade over ~0.3 s instead of snapping, and full frame rate on every page (pages without the car render the wave at 1x to pay for it). The aurora and the stream are gone.
- **Mascot v7, from the animated reference** (`Downloads/Mascot/Reference.mp4`, frames read locally): round "N" badge on a cap that hugs the roof, the "N" emblem above a bigger smile, warm ivory headlights beside it, a thicker bumper, softer mid-blue paint. New motion: rocking up onto two wheels with a laugh, twinkling sparkles (replacing the yellow accent lines), a chattering laugh. Hover now reacts to where the pointer really is, and a fixed-step spring stops the car flicking between squashed and stretched when a frame hitches.
- **Mascot reverted to the v2 design** (user request): the model is v2's (PNG face and "NLEX" cap logo, reshaped body, side windows, taillights, glowing headlights), with v2's lighting and a straight-on view. The motion added since is kept: drive-in, bob and sway, rocking onto two wheels, sparkles, hover and click reactions, sign-in reactions. The face no longer blinks or changes expression (it is the PNG's). v7 is kept in the session backups.
- **Mascot v2, made cuter** (user request, with the reference sheet for every side): the drawn, animated face is back (eyes redrawn in the sheet's style, no goggle outline); chubbier proportions; the cap down on the roof, brows visible; short-stalked mirrors; thin-rimmed headlights clear of the tyres, a fuller bumper, no reflection smear; the sheet's sides and back (framed side windows, door handles, rear window, red-and-amber taillights, "N" plate, cap strap).
- **Sign-in: no 3D car** (user request): the stage draws no mascot there; the flat mascot artwork shows in its place from the first paint.
- **Sign-in: no mascot at all** (user request): the flat artwork is gone too; the grid's middle row is open space, so the story and card keep their places (phones: more room above the title).
- **Sign-in: theme toggle** (user request): Light / Dark / System beside the Effects switch in the top bar, the same control as the dashboard's; both toggles now show on phones (icons only, under the brand). The choice is shared with the dashboard and remembered.
- **Fonts: racing type** (user request, Formula 1 references): Saira expanded and bold for titles (sign-in story, Overview hero, page titles; sizes reduced for the wide face), Saira at 95% width for the interface (matches the old Outfit metrics, so layouts did not move; tabular figures checked), JetBrains Mono for small live readouts (page eyebrows, the top-bar clock, data-age badges, the Overview freshness line). Italiana and Outfit removed; files and sources in `app/fonts/README.md`.
- **Fonts: motorsport type, matched to the references** (user request, four F1 references; replaces the all-Saira pass): candidates were set beside crops of the references. Inter for headlines and the interface (its display cut, tracked tight, matches "Silverstone England", "1m 11.160s", "Circuit (BIC)"; drawn at 93% so lines set to the old lengths and no layout moved); wide Saira only for brand moments (the wordmarks, the Overview hero), the closest to "Formula 1"; Space Mono for telemetry readouts (page eyebrows, the clock, data-age badges, the Overview freshness line), the closest to "BOX BOX BOX". Big numbers are bold and tight everywhere. JetBrains Mono removed.
- **Fonts, checked on every page** (dark and light at 1440 px, dark at 390 px; 17 views each): every page renders Inter / Saira / Space Mono, no sideways scroll, no console errors. Fixes from the check: the top bar's page name no longer runs into the Effects button (it truncates, drops its group under 1360 px, and the theme control shows icons only under 1560 px), the date sits on one line, the top-bar wordmark uses the brand face; Mapbox's own Helvetica on the Live Map (popups, controls, pin labels) now follows the system font, which also stopped the pin labels clipping.
- **Background: motorsport stage** (user request, to match the car-theme dashboard and the Formula 1 references; replaces the liquid-light wave): a carbon-fibre twill ground lit by soft racing-red and teal colour pools (the page accent between them), with a slow light gliding over the weave and a faint spot under the pointer; a glowing race circuit (an original layout of straights and real corners, tilted like a map on a table) with a chequered start line and two sector rings; two cars lapping it from a lap simulation (they brake for corners and power out), each lighting the track behind it, the sector rings flashing purple or green as they cross; the light trails redrawn as motion-blurred headlight and taillight streaks (red taillights, a few amber) along the bottom of the screen, stretching when the page scrolls fast. Light mode draws the same parts on porcelain: pressed-in twill, pastel pools, a clean red circuit line, ink streaks. The circuit is bold on sign-in and the Overview and faint behind data pages (red means congestion in the charts). The Effects switch, reduced motion (one still frame, cars parked mid-lap) and the no-WebGL fallback (a still gradient of the two pools) all apply. Checked live in dark and light: sign-in, Overview, Traffic, Incidents, Emissions and Data Management at 1440 px, and sign-in, Overview and Traffic at 390 px; no console errors.

## Fourth round: NLEX Daylight (7 Oct 2026, the user's brief and mascot reference)

A visual and UX theme upgrade only: no route, API call, calculation, data source or feature changed, and no data is invented.

- **Theme** (`app/styles/nlex-daylight.css`, loaded last): NLEX blue, white and sky; deep-navy ink instead of black; coral-red kept for congestion and alerts; soft gold accent strokes. Light is now the default theme (`lib/theme.tsx`); a stored choice is still respected, and dark is the same system on navy. Works through the existing tokens, so every page moved with it.
- **Background**: the user's artwork, `public/light_bg.png` (day) and `public/dark_bg.png` (night), served as WebP copies (~70 KB each), anchored bottom right so the skyline sits right of the page title, its top edge fading into a matching sky colour. Over it, three depths of drifting clouds (procedural sprites in `public/environment/`, generator in `scripts/environment-clouds.py`) and a slowly moving soft light. Only the clouds move; the art does not follow the pointer (user request). Shown at the same strength on every page, tab and sub-tab, the Live Map included. Effects Off and reduced motion hold it still. (Built first as an SVG expressway with moving light streaks; replaced by the user's artwork the same day.)
- **WebGL**: the stage now only draws the 3D mascot, on a transparent canvas, on the Overview; the carbon ground, race circuit and speed streaks were removed, and every other route switches the canvas off. Sign-in no longer mounts it.
- **Shell**: an NLEX-blue gradient navigation rail with white icons and a glowing white active tile; a solid white header with a blue brand and sky-blue active chips on the Theme and Effects controls; the header continues behind a slim, clear page scrollbar.
- **Cards and controls**: white rounded cards (18 px) with a soft blue shadow that deepens on hover; primary buttons NLEX blue with white text, secondary buttons white with a blue border; buttons lift on hover and press to 97%; filter dropdowns open with a small spring; KPI tiles share the card shadow. The analytics filter row is clear in place and fades to the header colour once pinned.
- **Overview hero**: same data, now as cards: a pulsing live dot; the headline in a state-tinted card (soft coral when congested) with a car icon; the slowest reading in a white card; both carry a chevron that jumps to the hotspot list; the two links got icons; "Overview" in heavy NLEX-blue Saira with gold accent strokes; the 3D car stands on the artwork's road.
- **Type**: Space Mono retired; readouts (eyebrows, the clock, data-age badges) use Inter. Saira stays for brand moments.
- **Checked**: every page and sub-tab in light at 1440 px (no console errors, no sideways scroll); dark at 1440 px on Overview, Traffic, Incidents, Emissions, Data Management, Maintenance and Mobile; phones (390 px) on sign-in, Overview, Traffic and Incidents in both themes; motion states (normal, reduced motion, Effects Off) on Overview and Traffic; the header and bottom edges at 1366x650 and 1440x900. Not measured reliably: frame rate (headless dev-mode readings swung from 30 to 66 fps on identical runs).

- **Mascot v8, rebuilt to the user's two reference sheets** (7 Oct 2026; details in `components/stage/mascot/README.md`): longer, lower hatchback body; straight chunky wheels at the corners; bigger chrome-ringed headlights; a thick bumper band; big round mirrors at eye height; the cap level on the roof with the visor joined to the crown; a circled-"N" cap badge instead of the NLEX wordmark (user request); the face redrawn: round eyes peeking over the fascia, deep blue glossy irises, a smaller rounded smile (user request). Every animation, reaction and handle kept (blink, expressions, look, talk, hover, click, fidgets, two-wheel rock, sparkles, springs, sign-in events).
- **Mascot arrival drives along the painted road**: the car appears small up the road in the background art, follows the lane round the bend, grows with perspective, its nose following the road and its wheels rolling at its ground speed, then pulls up on its spot, turns to face the reader and settles. The path is mapped from the art's pixels with the same rules the CSS uses to place the art, so it lines up at any window size and in both themes (the two arts share one composition); narrow screens get a short approach instead. A theme switch mid-arrival does not restart it. Checked live at 1440x900 in both themes and at 390 px.
- **Sign-in card** a little bigger, the copyright line centred under it (user request).
- **Mascot follow-ups** (user requests): cap badge redrawn crisper and bolder (deep blue ring and "N", whole on a wider white panel); a small, cute smile, then a little wider; subtle surface texture without changing shapes or colours (orange-peel paint, woven cap fabric, rubber grain).
- **Mascot, facing and showcase** (user requests): the car now faces the reader squarely wherever it stands on screen (it used to show its inner side because it sits right of centre), leans only slightly toward the pointer and its eyes settle on the reader; the mouth and cheeks are drawn flatter so they do not look stretched on the sloping bonnet. Hold the car and drag to turn it all the way round or tip it to see the roof (it coasts a little when let go); click it while turned and it swings back to face the reader; a click at rest still gives the hop and wink. On touch, a sideways swipe turns it and a vertical swipe still scrolls.
- **Mascot body details** (user requests): side and rear windows rebuilt to the reference's side view (clean rounded panes on a straight belt line, a raked front edge, a thin dark-blue seal, glass with a soft sky gradient and highlight instead of a dark glossy blob, softer reflections); door panel lines; a rounded fender lip round each arch; the bumpers are now a smooth swell of the body itself, not a separate tube; the lower corners are fuller so the blue body covers the tyres' inner shoulders; the wheel wells were deepened so the tyres no longer cut the well wall (the jagged line).
- **Filter bar joins the header** (user requests): as the Range/Weather bar pins, the header gives up its shadow and hairline so the two read as one header with a single shadow; the strip behind the page scrollbar grows to cover the bar too, so no sliver of background shows at the right edge.
- **Mascot wheel corners** (user request): the stair-stepped edge where the body curves into each wheel well and the thin line beside the tyres are gone: a finer body mesh, a smoothly curved, slightly roomier well, no separate arch rim, and tread blocks sitting flush so the tyres' outline stays smooth.
- **Mascot fender flares** (user request, after a photo): the body swells out round each wheel and rolls in over the arch's edge, built into the body surface so it is one smooth piece; the body mesh is spent where it turns sharply (the arches) so the edge stays smooth; the tyre tread is now pressed into the rubber (a normal map) instead of separate blocks, so the tyre outline is clean.
