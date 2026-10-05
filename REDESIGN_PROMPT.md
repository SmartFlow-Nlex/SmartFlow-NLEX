# Redesign all of SmartFlow NLEX as "Night Corridor": a cinematic, mascot-led dashboard

You are redesigning the whole SmartFlow NLEX dashboard (`Front-End-Dashboard/`, Next.js 15, React 19,
Tailwind 4, ECharts, MapLibre, three 0.170 already installed). The visual reference is a cinematic
WebGL landing page: a glowing object on a deep-black stage, a slow liquid-light wave shader, rising
particles, thin editorial grid lines with drifting dots, oversized thin serif headlines that blur up
letter by letter, a stories-style progress bar and a white pill button. Bring that world to **every
page and tab** of this dashboard, with the **NLEX mascot car** as the hero object instead of a
bronze statue.

This is a **redesign of an operations tool**, not a marketing site. The look changes completely. The data,
features, behaviour and honesty rules do not change at all. Read the whole brief before editing.

---

## 0. Before you touch anything

1. Load the `impeccable` skill and run its context step (`.claude/skills/impeccable/scripts/impeccable
   context`; on Windows without `sh`, the `.cmd` launcher). Read `PRODUCT.md` and the current `DESIGN.md`.
   This is a **redesign**, so the new world replaces the light-first look described in `DESIGN.md`. The
   product rules in `PRODUCT.md` stay, and they override anything in this brief that conflicts with them.
2. Servers: frontend `http://localhost:3002`, backend `http://localhost:4000`. Check whether they are
   already running before you start them. If you start them, start each in its own window, because
   background tasks time out and kill them. Never delete `.next` while the frontend server is running.
3. Screenshots of logged-in pages need a session. Load `.playwright-cli/auth-state.json` with
   `playwright-cli state-load`, and ask the user to log in again only if it has expired. Never commit
   that file or print what is in it.
4. The dashboard shell scrolls an inner `<main>`, not the window. Anything driven by scroll (dots,
   progress, shader) must read that element's `scrollTop`. Full-page captures must scroll it too.
5. Do not commit or push unless the user asks.
6. **Before the first visual edit, take the feature inventory and baseline described in section 1a.**

## 1. Hard constraints (non-negotiable)

- **Never fabricate data.** Show no invented numbers, accuracies, counts, testimonials or "live" values.
  Every number on screen still comes from the same API call it comes from today. Decorative motion
  never fakes data. Anything illustrative is labelled ILLUSTRATIVE, for example the existing emissions
  Strategy X/Y/Z panel.
- **Design, layout and presentation only.** Do not change existing API calls, data shaping, the 50%
  shown-state rule, forecast logic, role access (`lib/auth-access.ts`), the audit logging, the logout flow (`logActivity` and then
  `signOut`), the maintenance form behaviour (the exit fills in the km, NB/SB swaps start and end),
  or anything in `Back-End/`. Do not write to the database. The only additions allowed are the
  read-only map data reads in section 5c, through the app's existing client code.
- **Exactly three congestion colours plus no-data** on maps, legends and cells: clear, slow, congested,
  no data. Retune them for a dark ground, but never add a fourth or shade within a band. Brand amber
  (the amber X in the NLEX logo) must never be confusable with the "slow" status colour: it lives only
  in the brand mark, the mascot glow and the login story.
- **One domain accent per page** through `--page-accent`: traffic blue, incident amber, emissions
  green. ECharts options take literal colour values, never `var()`; read them through `useChartTheme()`.
- **Gaps stay visible.** Empty, stale and missing data keep their plain-language states. The mascot may
  decorate an empty state, but the words still say what is missing and why.
- **Operators first.** The dashboard keeps the native cursor. Charts and maps need precision, so there
  is no custom cursor inside the dashboard. Text meets WCAG AA contrast on the dark ground, focus rings
  are visible, and every control works from the keyboard. `prefers-reduced-motion` turns off the shader
  animation, particles, letter reveals and the mascot float, and leaves a static frame.
- **Keep the light theme working.** Dark becomes the default. The existing `data-theme` / `prefers-color-scheme`
  mechanism in `app/globals.css` stays, and Light is a derived variant of the same structure, not the
  old design.
- The Electron desktop build must still load.

## 1a. Feature-preservation contract: redesign everything, remove nothing

**The scope is the whole system:**
- every page;
- every tab and sub-tab, including Descriptive / Predictive / Prescriptive on Traffic, Incidents
  and Emissions;
- every chart, map, panel, table, form, dialog and state.

**The goal is the same dashboard with every feature intact**, redesigned, re-laid-out, easier to
read, and with richer maps. Nothing is removed. If an idea anywhere in this brief would remove, hide
or weaken an existing feature, the feature wins: adapt the design and note the conflict in your
report.

**What you may change**
- `className`s, CSS and tokens.
- Wrapper and layout markup (grids, panels, ordering on the page).
- New presentational components: the stage, the mascot, title reveals, grid lines, section
  progress, the chart kit (section 5b) and the map graphics (section 5c).
- Icons and spacing.
- Moving a control to a better position, provided it stays visible at the same breakpoints and is
  reachable with no more clicks than today.
- **Chart styling and form.** You may change a chart's type when the new one shows the same data
  and the same comparisons more clearly; for example, a pie of eight slices can become a ranked bar.
  Every series, filter and tooltip value it had must still be available.
- **Wording, under the copy rules below.**
- **Map additions under section 5c.** They read data the page already loads, or an existing backend
  endpoint through the app's existing client helpers. They are read-only, and nothing in `Back-End/`
  changes.

**Copy rules: less text, with the important parts kept**
- **Never cut these:**
  - numbers and their units, and time windows;
  - how a model was tested, its accuracy against the baseline, and its uncertainty or confidence;
  - live track-record figures;
  - data gaps, staleness and "no data" explanations;
  - data sources;
  - ILLUSTRATIVE and simulation labels;
  - warnings;
  - the recommended action and its basis;
  - anything that names an exit, km post, direction or hour.
- **Cut or shorten these:**
  - intros that repeat the heading;
  - "This chart shows…" sentences;
  - restated legends;
  - filler adjectives;
  - duplicated explanations across cards;
  - long methodology paragraphs.
- **Move, don't delete:** explanations that are true but secondary go into the existing
  `InfoTooltip` or a "How this is measured" disclosure on the same card. A reader can still reach
  every fact in one click or hover.
- **Narrative panels** (`*Narrative.tsx`, `NarrativePanel`, `AiModelInsight`, `FeatureBriefing`):
  - lead with a one-sentence takeaway and at most three short bullets;
  - put the full text behind "Details" on the same card;
  - you may shorten the template strings, but the values they insert, and the logic that picks
    them, do not change.
- **Targets:**
  - page description: 15 words or fewer;
  - visible prose on a card: about 25 words or fewer before "Details";
  - control labels: the shortest form with the same meaning, e.g. "Select forecast horizon"
    becomes "Horizon".
- **Takeaway titles must come from the data.** A card title can state its answer, e.g. "Peak:
  5–7 PM at Balintawak", only when that text is computed from the loaded data at render time.
  Otherwise use a neutral title ("Hourly volume"). Never hardcode a finding.
- **Copy log:** record every wording change in `REDESIGN_INVENTORY.md` under its route: old text,
  then new text, and where any moved text now lives.

**What you must not change**
- Do not remove, hide, merge away or put behind an extra click any of these: page, route, tab, sub-tab,
  sidebar item, button, link, form field, filter, toggle, picker, mode tab, chart, chart series,
  legend, tooltip, map layer, map control, table, table column, sort, pagination, modal, confirm
  dialog, download or export, upload, empty/loading/error state, caption, unit, data-source note,
  disclaimer or label (ILLUSTRATIVE, model or confidence pills).
- Do not change:
  - hooks, state, effects, `fetch`/API calls, request parameters or response handling;
  - routes, URLs or query parameters;
  - `localStorage` keys;
  - role checks;
  - event handlers (`onClick`, `onChange`, `onSubmit` and the rest) and what they do;
  - ids or `aria-*` attributes that code relies on;
  - keyboard behaviour (Esc, focus order, shortcuts);
  - the meaning of any label, unit or message. Shortening follows the copy rules above. All new copy
    must be factual.
- Do not lose a capability on mobile or in the light theme that exists today.

**Inventory and baseline, before the first visual edit**
1. **Inventory every route:** the shell, `/`, and every `app/dashboard/**/page.tsx`, including
   `/dashboard/incident/hourly` and `/dashboard/ai-sandbox`.
   - For each route, list every item from the "must not remove" list above, every API endpoint it
     calls, and its states.
   - Do the same for each role: data-analyst, tcc-operator, incident-operator. Note which tabs each
     role sees.
   - Write it to `REDESIGN_INVENTORY.md` at the repo root, as a checklist with one heading per route.
2. **Baseline screenshots** of every route at 1440×900 and 390×844, in both dark and light themes,
   saved to `.playwright-cli/redesign-baseline/`. That folder is git-ignored and stays out of commits.

**Parity check after each page, and again at the end**
1. **Walk the page's inventory** in the browser and tick every item. Each one must be present and
   working: click it, open it, submit it, toggle it.
   - **A missing or broken item blocks progress.** Fix it before moving on.
2. **Compare against the baseline:** the same controls, the same numbers for the same moment, the
   same states.
3. **Diff guard:**

   ```
   git diff -U0 -- Front-End-Dashboard | grep -E '^-.*(on[A-Z][a-zA-Z]+=|fetch\(|href=|use(State|Effect|Memo|Callback|Ref)\(|router\.|localStorage|aria-|role=)'
   ```

   Every removed line it prints must have an equivalent added line that keeps the behaviour.
   Explain any exception in the report; normally, revert it.
4. **Final report:** include the completed inventory checklist, with every item ticked or explained.

## 2. The mascot

- The asset is ready at `Front-End-Dashboard/public/brand/nlex-mascot.png`, 1107×1161 with real
  transparency. It is a cut-out of the mascot image the user supplied; the original had a painted
  checkerboard, which has been removed. Use it as it is. Do not redraw, recolour or distort the
  character, and do not crop the NLEX cap.
- **The sign-in hero is a real 3D mascot generated with the `img2threejs` skill.** Everywhere else
  the mascot is the PNG, because small sizes gain nothing from 3D and the stage must stay one cheap
  canvas.

### 2a. The 3D mascot (sign-in hero), built with img2threejs

1. **Check that the skill is installed:** `.claude/skills/img2threejs/SKILL.md` must exist and be
   listed as an available skill in this session.
   - If it is missing, stop and ask the user to install it from the official repository
     `https://github.com/img2threejs/img2threejs`. Never use the look-alike websites
     (img2threejs.com, .org, .online and similar).
   - Never upload the mascot image to any website or online converter. It carries the NLEX brand,
     and the whole pipeline runs locally with Python 3.10+, with no API keys.
   - **Use only the skill's core pipeline**, which is pure Python standard library and runs locally.
     - Do **not** install the optional vision adapter in `integrations/vision/`. It pulls in torch,
       transformers and mediapipe, downloads Google landmark models, and needs Python 3.11–3.12,
       while this machine has 3.13. It is not needed, because the face is decalled (step 4).
     - Do not run `scripts/issue_triage.py`. It is the maintainers' GitHub script.
     - Do not follow the skill's suggestion to symlink it into `~/.claude` or `~/.codex`, and do not
       edit anything outside this repo.
2. **Run the skill** on `Front-End-Dashboard/public/brand/nlex-mascot.png` as a **character** subject:
   a stylized cartoon car with a face, wearing a cap. Follow the skill's own pipeline and review
   loop.
   - Write the output to `Front-End-Dashboard/components/stage/mascot/`: the `createNlexMascotModel()`
     factory returning a `THREE.Group`, its JSON sculpt spec, and its README.
   - Use the repo's three 0.170 from npm, not a CDN import map.
3. **Make the geometry named parts:** body shell, windscreen and face panel, cap (crown and brim),
   two mirrors, four wheels with tyres and blue hubs carrying the "N", two headlights, and the bonnet
   "N" badge. The wheels must be separate groups with their pivot on the axle so they can spin.
4. **Do not sculpt the face or the logo; decal them.** The skill reconstructs characters as stylized
   approximations, and an approximate face would read as a different character. Cut exact flat
   textures from the PNG and project them onto the model:
   - the two eyes with brows, the cheeks, and the open smile, onto the face panel;
   - the NLEX logo, onto the cap front;
   - the "N", onto the hubs and badge.

   Then compare the decals' size and placement against the PNG front view until they match.
5. **Materials:**
   - Body: glossy blue paint, close to `#2f7bf0`, sampled from the PNG.
     `MeshPhysicalMaterial`, roughness about 0.28, metalness 0, clearcoat 1, clearcoatRoughness 0.1.
   - Cap: matte fabric, roughness about 0.8, white crown panel and blue brim.
   - Tyres: near-black rubber, roughness 0.9.
   - Headlights: emissive white-blue, so they bloom under ACES tone mapping.
6. **Acceptance:** a front-on render at the PNG's camera angle must read as the same character
   side by side with the PNG: proportions, colours, face and logo placement. Show the user that side
   by side before wiring it into the page.
7. **Behaviour in the stage:**
   - Load the model lazily with the stage.
   - Use the key/rim/fill rig: the key is a white SpotLight at 18 from (4,6,3) with soft shadows; the
     rim is a DirectionalLight in `#5c7aff` at 10 from (-5,3,-4); the fill is warm `#fff3e6` at 0.8
     from (-2,-4,2). Use ACES tone mapping at exposure 2.2.
   - Scale the largest dimension to 3.5, recentre it with the scaled bounding box, and set the pivot
     at `y = -0.4`.
   - **Idle:** the wheels spin slowly, the body bobs 0.03 units on a 4.2 s sine, and the car
     yaws ±10° on a slow 9 s sway.
   - **Pointer:** the pivot turns `y = mouseX * 0.35` and `x = mouseY * 0.12`, eased with lerp 0.05.
   - **Story:** each sign-in story change gives the car a short 0.8 s turn toward the camera and a
     wheel spin-up, eased.
   - **Sign-in:** hovering or focusing the button flashes the headlights. On submit, the wheels spin
     up while the request is pending, and they settle on an error.
8. **Fallback, with no exceptions:** if the model fails to load, WebGL is unavailable, the device
   reports low memory (`navigator.deviceMemory < 4`) or reduced motion is on, use the 2.5D PNG below
   instead. The page must look finished either way.

### 2b. The 2.5D PNG mascot (fallback, and every non-hero appearance)

Build it in three.js as a textured plane with the PNG (`MeshBasicMaterial`, `transparent: true`,
`alphaTest` about 0.02, SRGB colour space), set in front of the wave background. For the small
appearances (session check, Overview header, empty states, sidebar, logout dialog) a plain `<img>`
with CSS transforms is enough. Give it:
  - **Pointer tilt:** the plane rotates `y = mouseX * 0.18` and `x = -mouseY * 0.10` radians, eased
    with lerp 0.05.
  - **Idle float:** a 6 px-equivalent vertical bob on a 4.2 s sine, with a 1.5° roll in counter-phase.
  - **Contact shadow:** a soft blurred ellipse on the "road" beneath the wheels. It scales down
    slightly as the car floats up.
  - **Headlight glow:** two additive radial sprites over the headlights, at roughly (0.22, 0.62) and
    (0.76, 0.70) of the image's width and height. Measure the exact centres. They breathe slowly
    (opacity 0.55 to 0.8, 3 s) and flash once, brighter, when the sign-in button is hovered or focused
    ("flashing your lights").
  - **Blue rim light:** a faint expressway-blue halo behind the silhouette, made from a blurred,
    tinted copy of the alpha. It reads as the rim light in the reference.
### 2c. Where the mascot appears

- **Where the mascot appears.** Its scarcity is what keeps it charming. Use exactly these places:
  1. **Sign-in page (`/`):** the hero, large and centre-stage. This is the 3D model from 2a, with
     the 2.5D fallback.
  2. **Session check ("Checking your session…"):** small, with the headlights pulsing as the loader.
  3. **Overview header:** medium, at the right end of the page header, with the tilt and float. It is
     not shown in any other page header.
  4. **Empty, error and offline states**, wherever they occur:
     - Small, with the headlights dimmed for "no data".
     - Normal, with a small amber hazard-blink sprite for errors.
     - The copy still says plainly what happened.
  5. **Sidebar brand mark:** collapsed, it is a 28 px crop of the mascot's face and cap; expanded, the
     SmartFlow wordmark.
  6. **Logout dialog:** small, with the headlights fading out on confirm.

## 3. The visual world: "Night Corridor"

Write this into a new `DESIGN.md`, replacing the old one and keeping its frontmatter token format. Then
implement it as tokens on `:root` in `app/globals.css`, so no component hardcodes a hex.

**Ground and surfaces (dark, default)**
- Stage: `#03060d`. It is never pure `#000`, so the shader and the shadows have somewhere to fall.
- Surface (cards, panels): `rgba(10, 16, 30, 0.86)` with a 1 px hairline `rgba(255,255,255,0.08)`.
  Do **not** put `backdrop-filter` over the WebGL canvas on data pages; it is too expensive. Use the
  near-opaque fill instead.
- Raised surface (popovers, dialogs, menus): `rgba(14, 22, 40, 0.96)` with hairline
  `rgba(255,255,255,0.12)`.
- Text: primary `#f4f1ea` (warm white, like the reference's `#fff6ed`); secondary `#b9c2d3`; muted
  `#8590a6`. Check the muted colour against AA at the sizes where it is used.
- Brand: expressway blue `#3660ff`, light `#5c7aff`, deep `#2b4fdb`; toll amber `#ea8b0d` (brand only).
- The primary action is the **white pill**, as in the reference: `#ffffff` fill, `#03060d` text,
  radius 999 px, uppercase 11 px with 1 px tracking and weight 600. Its small hollow ring mark sits at
  the trailing edge, and its hover is `scale(1.04)`. At most **one** white pill per view; other
  buttons are hairline ghost buttons.
- Status (dark-tuned, AA on the stage): clear `#2fbf6b`, slow `#f0a03c`, congested `#ff5a4a`, no data
  `#4a5568`. Check that slow and toll amber are distinguishable side by side; if they are not, shift
  slow toward yellow, never toll amber toward slow.

**Typography**, loaded with `next/font/google`, not a CSS `@import`:
- **Italiana** is for display only: page titles, the sign-in story titles and the Overview greeting.
  Never use it for numbers, labels or anything under 32 px.
- **Outfit** (300/400/600) is for all interface text.
- **Numerals** in stat values, tables, km posts and times use tabular figures
  (`font-variant-numeric: tabular-nums`). If Outfit does not support `tnum`, verify it, then keep
  Inter for numeric cells only.
- Scale:
  - Sign-in story title `clamp(56px, 7.5vw, 116px)`, line-height 1.0, tracking 2 px, colour
    `#f4f1ea`.
  - Page title `clamp(40px, 4.6vw, 72px)`.
  - Section headline 20 px Outfit 600.
  - Body 15 px Outfit 300/400, line-height 1.6.
  - Eyebrow/nav 10–11 px uppercase, tracking 2 px.
  - Stat value 32 px tabular.
  - Snap to these; add no new sizes.

**Editorial grid furniture**
- **Horizontal hairline** under the topbar: `rgba(255,255,255,0.10)`, at the topbar's bottom edge.
- **Vertical grid lines:** five lines aligned to the content columns, each with two drifting dots,
  as in the reference. Intensity depends on the page:
  - sign-in `rgba(255,255,255,0.12)`;
  - dashboard pages `0.05`;
  - **off** on the Live Map.
- **Dot drift:** dots move with the `<main>` scroll progress using the reference's formula. The
  starting position is `(i*17)%80+10` percent, the speed is `90+(i*55)%180` and reversed on even `i`,
  and the result wraps 0–100.
- **Section progress:** a vertical stack of thin dashes at the right edge, 2×40 px, gap 12 px, track
  `rgba(255,255,255,0.15)`, fill white. It shows which section of a long page you are in, using the
  page's real section headings, and each dash is a keyboard-focusable jump link. Show it only on pages
  with three or more sections.

**Motion**
- Page title: a letter-by-letter blur-up on route enter, **once**. Each character goes from 50 px
  below, 12 px blur and opacity 0 to rest over 0.8 s on `cubic-bezier(0.25,1,0.5,1)`, staggered
  0.035 s per character. The subtitle follows with a 30 px rise and 0.4 s delay.
  - Split the characters in a React component that keeps an `aria-label` with the whole title.
    Never mutate `innerHTML`.
- Cards: a 12 px rise and fade on first mount, staggered 40 ms and capped at 8 cards. No motion on
  data refresh, because numbers changing must not look like a page load.
- Interactive surfaces only:
  - hover lifts by 2 px and the hairline brightens to `rgba(255,255,255,0.16)` with a faint
    page-accent edge glow;
  - non-interactive cards never react to hover.
- Image and panel reveals use the reference's clip-path wipe: `inset(0 0 100% 0)` to `inset(0)`, 1.8 s,
  `cubic-bezier(0.16,1,0.3,1)`, with the content scaling 1.15 to 1. Use it only for the sign-in story
  and the Overview hero, nowhere else.

## 4. The shared background: one WebGL stage

Build `components/stage/NightCorridorStage.tsx`: a single fixed, full-viewport canvas behind
everything (`z-index: 0`, `pointer-events: none`).
- Mount it **once**: in `app/page.tsx` for sign-in, and in `app/dashboard/layout.tsx` for the
  dashboard. It must never remount on navigation.
- Import three dynamically on the client (`next/dynamic`, `ssr: false`).

**Renderer**
- `antialias: true`, `alpha: false`, `powerPreference: 'high-performance'`.
- Pixel ratio `min(dpr, 2)` on sign-in and `min(dpr, 1.5)` on dashboard pages.
- Cap the dashboard at about 30 fps, and pause the loop entirely on `document.hidden` and when the
  stage is off.
- Under `prefers-reduced-motion`, render one frame and stop.
- If WebGL is unavailable, fall back to a static CSS gradient with the same colours.

**Scene:** stage colour `#03060d`, `FogExp2('#03060d', 0.01)`, a PerspectiveCamera with a 50° field of
view, positioned at (0, 0.2, 3.0).

**Liquid-light wave shader**
- A full-screen plane: `PlaneGeometry(30,30)`, a child of the camera at local z = -8, `renderOrder -10`,
  `depthWrite` and `depthTest` false.
- It is the reference shader with the uniforms and palette changed. Keep the noise, warp, wave-layer
  and lustre maths exactly as in the reference: time ×0.08, frequencies 2.4/3.2/4.0, angles
  0.6/-0.7/1.2, weights 0.50/0.35/0.15, `scrollDeform = scroll*5.0`, crest multiplier 1.4, vignette
  `1.0 - dot(uv,uv)*0.12`.
- Uniforms:
  - `uTime`, `uResolution`, `uMouse` as in the reference.
  - `uScroll`: the sign-in story progress (0 to 1) on `/`, or the `<main>` scroll progress on
    dashboard pages.
  - `uAccent`: a `vec3` of the page's accent, converted from a literal hex in JS.
  - `uIntensity`: overall brightness of waves and crests.
- Replace section 5 of the reference shader with this palette:

```glsl
// Start (t = 0): sodium-lamp amber night, the NLEX logo's amber X
vec3 c0_shadow = vec3(0.0010, 0.0007, 0.0005);
vec3 c0_wave1  = vec3(0.080, 0.042, 0.012);
vec3 c0_wave2  = vec3(0.046, 0.024, 0.008);
vec3 c0_crest  = vec3(0.46, 0.30, 0.10);
// End (t = 1): expressway blue
vec3 c1_shadow = vec3(0.0004, 0.0007, 0.0016);
vec3 c1_wave1  = vec3(0.012, 0.030, 0.095);
vec3 c1_wave2  = vec3(0.007, 0.017, 0.055);
vec3 c1_crest  = vec3(0.20, 0.32, 0.78);
float t = smoothstep(0.0, 1.0, uScroll);
vec3 colCrest = mix(mix(c0_crest, c1_crest, t), uAccent, 0.30); // page accent tints the sheen
// ...same composition as the reference, then:
color = mix(colShadow, color, uIntensity);
```

**Per-page `uScroll` / `uIntensity`**
- Sign-in: `uScroll` follows the story (amber at story 1 to blue at story 4); `uIntensity` 1.0.
- Dashboard pages: `uScroll` is clamped to 0.75–1.0, so they stay blue with only a whisper of amber;
  `uIntensity` 0.55.
- Data Management and Audit Log: `uIntensity` 0.35, because these pages are dense tables.
- **Live Map: the stage is off.** The map is the stage there. Do not run two heavy WebGL loops on
  one page.

**Light-trail particles** (the reference's forge sparks, reread as traffic)
- Use the reference's procedural radial-gradient texture, `PointsMaterial` size 0.025, opacity 0.85,
  additive blending, `depthWrite: false`, vertex colours.
- Count: 450 on sign-in, 140 on dashboard pages, 0 on the Live Map and under reduced motion.
- Two lanes, like a carriageway, in a band below the mascot's wheel line:
  - Northbound: icy headlight white-blue, `rgb(0.62–0.75, 0.84–0.96, 1.0)`, drifting **right**.
  - Southbound: taillight amber-red, `rgb(1.0, 0.35–0.50, 0.05–0.15)`, drifting **left**.
  - Speed is mostly along x (0.3–0.7 units/s), with a small y wobble and the reference's sway. Recycle
    at `|x| > 3.5`.
  - Fast scrolling speeds them up exactly as in the reference: `1 + velocity*9` and turbulence
    `velocity*0.8`.

## 5. Page-by-page

Apply the shell and world to every route. For each page: restyle and re-lay it out, keep every
feature from its inventory (section 1a) and every number,
screenshot it at 1440×900 and 390×844, and fix what you see.

**Sign-in, `/` (`app/page.tsx`): the cinematic page**
- One viewport, no long scroll.
- **Everything on this page today stays, working exactly as it does now.** Only its look and position
  change.
  - **Brand block:**
    - the SmartFlow logo with its light/dark image swap (`SMARTFLOW_LOGO_WHITE.png` /
      `logo-dark-bg.png`);
    - the `<h1>` "SmartFlow NLEX";
    - the subtitle "Decision-Intelligence System";
    - the three brand points with their icons: "Live corridor status", "Predictive volume",
      "Incident intelligence".
  - **Form:**
    - the "Sign In to Dashboard" heading;
    - the username-or-email field;
    - the password field with its show/hide toggle;
    - "Remember me" (on by default);
    - the forgot-password button;
    - the submit button with its loading and disabled state;
    - the error and success messages;
    - the existing submit, validation and redirect logic.
- **Layout on a 25vw column grid**, with the reference's padding `0 60px 40px 60px`:
  - **Top bar:**
    - Left: the existing logo, then the `<h1>` "SmartFlow NLEX" styled as the reference's wordmark
      (uppercase 14 px weight 600 with 5 px tracking; it stays the page's `<h1>`), with
      "Decision-Intelligence System" as a small eyebrow beside it.
    - Centre: four story labels separated by dots, which jump to stories. Hide them on mobile.
    - Right: no white pill. The sign-in button is this view's one white pill.
  - The mascot stands in columns 2–3, slightly left of centre.
  - The sign-in card sits in column 4, as a raised surface.
  - The three brand points sit as a row of small hairline icon chips under the story text. They are
    always visible, and they do not rotate with the story.
- **Login story:** four "slides" in the reference's slide positions, bottom-left. Each has an Italiana
  title that blurs up letter by letter and a short Outfit description.
  - They advance on a **timer** rather than on scroll: 7 s each, so the stories-style dashes are true
    story timers. Clicking a dash jumps to that story.
  - The timer pauses while any form field has focus or the pointer is over the card.
  - Under reduced motion, show story 1 statically.
  - Use this copy verbatim. It is taken from PRODUCT.md; add no claims.
    1. **Forecast, Not Just Live:** "Congestion, incidents, volume and emissions per exit and per
       hour, up to seven days ahead, with the action to take next."
    2. **Honest Validation:** "Every model states how it was tested, how it scores against simple
       baselines, and how its served forecasts compared with what actually happened."
    3. **One Corridor, One View:** "Live Waze jams, Waze history since 2022, toll volumes, incident
       logs, weather and events, joined in one warehouse from Balintawak to Sta. Ines."
    4. **Connected to Drivers:** "Operators publish advisories and decide what the companion
       mobile app shows commuters."
- **Custom double-ring cursor** (the reference's inner snap and outer lerp at 0.2): **on this page
  only**, only under `@media (pointer: fine)`, and the native cursor returns over form fields.
- **Mobile:**
  - mascot on top at 45vh;
  - story title at 56 px, with the description beneath;
  - sign-in card full width below;
  - grid lines reduced to three.

**Session check**
- The stage and a small mascot whose headlights pulse, with the text "Checking your session…". There
  is no spinner.

**Dashboard shell** (`app/dashboard/layout.tsx`)
- **Topbar**, styled like the reference's header. It keeps everything it has today:
  - the menu toggle button, which opens and closes the sidebar, with its `aria-label`;
  - the SmartFlow logo with its light/dark swap;
  - the `ThemeToggle`;
  - the live date and time block.

  Add a breadcrumb of the current group and page with dot separators, e.g. `ANALYTICS · TRAFFIC`, at
  10 px with 2 px tracking, next to the logo. Below the topbar, add the 1 px horizontal hairline.
- **Sidebar.** It keeps everything it has today:
  - the groups Analytics, Operations, Planning and the separate Admin group;
  - every tab, with its label and icon;
  - the active state;
  - the role filtering, exactly as it is (a group the role cannot see stays hidden);
  - the collapse toggle (`ds-shell-collapsed`);
  - the mobile drawer with its backdrop that closes it;
  - the **footer** with the avatar initial, the user's email, the role name and the Log out button,
    which opens the confirm dialog.

  Restyle it:
  - Background: a raised surface over the stage.
  - Group labels: uppercase 10 px eyebrows.
  - Items: 15 px Outfit labels.
  - Active item: a 2 px page-accent edge on the left and a faint accent wash, with the label at full
    white.
  - Collapsed: icons only, with tooltips that carry the labels, and the mascot crop as the brand mark.
  - Log out stays in the footer as a hairline-ghost button.
- **Logout dialog:** keep its structure, focus order, Esc handling and the `logActivity` → `signOut`
  order. Restyle it as a raised surface with the small mascot whose headlights fade out on confirm.
  The danger button keeps the danger colour; it is *not* the white pill.
- **Page header pattern** for every page:
  - an eyebrow (group name);
  - the Italiana page title with the blur-up;
  - a one-line Outfit description of what the page answers;
  - the page's existing controls (horizon pickers, date filters, mode tabs) right-aligned on the same
    baseline, or wrapped below on mobile.

**Overview, `/dashboard`**
- Header with the medium mascot at the right and the title "Overview". Under the title, the corridor
  span `Balintawak Km 12 → Sta. Ines Km 88.25` in tabular numerals.
- Stat cards: big tabular value, label, delta or confidence pill. No sparkline unless one already
  exists.
- The corridor visuals (`components/overview/CorridorScene.tsx`, `OverviewLive.tsx`) get the map
  treatment from section 5c.
- Section progress dashes on the right.

### 5a. Analytics tabs: Traffic, Incidents (and `/incident/hourly`), Emissions

- Accents: traffic blue, incident amber, emissions green.
- **Mode tabs.** Each page has Descriptive / Predictive / Prescriptive tabs. They become one
  segmented control under the page title:
  - an accent underline slides to the active mode;
  - each mode carries a small icon and a 3–4 word hint ("What happened" / "What's next" /
    "What to do");
  - switching mode cross-fades the content in 200 ms;
  - the mode selection logic stays as it is.
- **Filters:** vehicle class, incident type, pollutant, dates and any others. They sit in one sticky
  filter bar under the mode tabs, as pills and selects, with every filter and option kept. Active
  filters show as removable chips.
- **Every card follows one structure, top to bottom:**
  1. **The answer:** one primary number or state, large, with its unit.
  2. **Context:** the comparison the data supports (vs last week, vs baseline, vs typical hour), and
     how fresh the data is.
  3. **The evidence:** the chart.
  4. **The method:** behind `InfoTooltip` or "How this is measured".

  Cards in a row align on these bands.
- **Descriptive (what happened):**
  - a KPI strip of 3–5 stat cards;
  - then the main time series, full width;
  - then the breakdowns (by exit, class, hour, day) in a two-column grid;
  - heatmaps (hour × day, exit × hour) wherever the page already has that data.
- **Predictive (what's next):**
  - a hero forecast chart, with:
    - a "now" line;
    - history solid and forecast dashed;
    - its confidence band;
    - the horizon picker attached.
  - Under it, a **model trust strip** made of compact pills: champion model, test window,
    accuracy vs baseline, live track record. The full validation details open from the strip, with
    every existing figure there.
  - Per-exit and per-hour detail follows.
- **Prescriptive (what to do):**
  - Ranked **action cards**. Each card shows:
    - the action;
    - where it applies (exit, km, direction);
    - when it applies;
    - the expected effect with its basis;
    - its confidence.
  - The basis and full reasoning sit behind "Details".
  - The ILLUSTRATIVE label stays on Emissions' Strategy X/Y/Z, as a hairline amber-outline pill
    beside the title, and never only in a tooltip.
- **`/incident/hourly`** follows the same structure: hour-by-exit heatmap first, then detail.

### 5b. Chart kit: every chart in the app (ECharts and Recharts)

Build one shared theme and set of helpers. Read them through `useChartTheme()` / `useThemeTokens`
using literal colours, then apply them to **every** chart.

**Theme**
- Transparent background.
- Axis text `#8590a6` at 11 px with tabular numerals. No axis lines.
- Gridlines: horizontal only, `rgba(255,255,255,0.06)`.
- Thousands separators and units on axes and tooltips.

**Series**
- Lines 2 px, smooth only where the data is continuous.
- Area fills fade from 28% to 0% opacity.
- Bars have 4 px rounded tops and a 40–60% band width.
- Forecast series are dashed.
- Confidence bands at 18% fill, with no border.

**Markers**
- A "now" marker: a thin white vertical line labelled NOW.
- Gap ranges in the data appear as hatched bands labelled "No data". Never interpolate across a gap.

**Tooltips**
- A raised surface with a hairline.
- Content: time, then value and unit, then the delta vs comparison, then the series name.
- A crosshair on time-series charts.

**Legends**
- Prefer direct labels at the end of the lines. Otherwise use a compact legend of pills that can be
  clicked to toggle series, the same behaviour as today.

**Colour**
- Series keep their categorical hues across themes.
- The status colours are used only for status.
- No 3D charts. No gradients on bars beyond a subtle top highlight.

**Motion**
- A 600 ms draw-in on first render only. No re-animation when data refreshes.

**Containers**
- Every chart sits in a card using the section 5a structure, with a skeleton (hairline shimmer) while
  loading and the existing empty and error text when there is no data.

### 5c. Maps: Live Map (`/dashboard/map-comparison`), predictive map, and Overview corridor

**Rules that do not move**
- Road colouring keeps exactly the current rules:
  - only predicted areas are coloured;
  - NB and SB are coloured separately;
  - three colours plus no-data;
  - the 50% shown-state rule.
- Every existing layer stays: carriageway, its arrows and casing, halo, jam extent, jam tail, the
  fast/mid/slow layers, base scrim and the rest. So do every popup, `WazeLiveModal`,
  `ForecastExpandModal`, `MapLegend`, `ForecastHorizonPicker`, `RampKey`, and the live-vs-forecast
  comparison.
- **Every new graphic is drawn from real values.** Where there is no data, draw nothing, or the
  no-data style. Never draw a plausible-looking default.

**Base**
- The map goes full-bleed under the topbar. The stage, particles and grid lines are off on this
  page.
- In the dark theme, use a dark basemap with muted roads and labels. Choose a free style that needs
  no key, keep its attribution visible, and keep the current style for the light theme.
- The NLEX corridor reads as a lit ribbon: the existing halo and casing, retuned to glow softly
  against the dark basemap.

**New graphics** (additions)
- **Directional flow:** animated dashes travel along each carriageway in its direction of travel, NB
  and SB separately.
  - The dash speed scales with that segment's actual current speed; congested segments crawl.
  - No-data segments get no animation and a static grey dash.
  - Under reduced motion, show the existing static arrows only.
- **Jam callouts:** each jam's real extent pulses softly along the road, from the jam-extent and
  jam-tail data. It carries a small leader-line label with its real values: queue length · delay ·
  direction, e.g. "1.2 km · +8 min · SB".
- **Exit and interchange markers:** custom pins showing the exit name and km post, from
  `nlex-ramps.json` and the existing geometry. They are collision-aware and appear by zoom level
  (major exits at corridor zoom, all exits closer in).
- **Incidents and roadworks**, as icons by type: crash, breakdown, roadwork, hazard. Use them where
  the page already has incident or Waze alert data. Show active maintenance closures from the
  existing `/api/maintenance/list` endpoint as hatched segments between their start and end km, in
  their direction. All of these open the existing popups or modals.
- **Predicted vs live at a glance.** Predicted segments use the same three colours with a distinct
  "forecast" finish: a soft diagonal hatch, a dashed casing and a small clock badge on the selected
  segment. A live segment and a forecast segment can never be confused, even in a screenshot.
- **Horizon timeline:** `ForecastHorizonPicker` becomes a timeline scrubber with one tick per horizon
  the data actually has, plus "Live" at its left end. It keeps its options and behaviour. Show the
  selected horizon's timestamp large on the map.
- **Corridor strip:** a new linear schematic of the corridor, docked under the map (collapsible).
  - It runs from Km 12 Balintawak on the left to Km 88.25 Sta. Ines on the right: NB lane on top,
    SB lane below.
  - It is coloured by the same states for the selected horizon, with exit ticks and names, jams as
    bars of their real length, and incident and closure icons.
  - Hovering the strip highlights the same spot on the map, and the reverse.
  - It gives operators the whole corridor in one line.
- **Optional 3D tilt:** a "3D" toggle tilts the camera (pitch about 50°). It extrudes buildings only
  if the basemap provides them. 2D north-up stays the default.

**Information panels**
- **Selected exit/segment card:**
  - answer first: state, and delay in minutes;
  - then queue length, distance and direction;
  - then last updated, forecast confidence and validation;
  - then the coordinated traffic volume.

  All values are the ones the card already shows. Keep the order of importance, not the order in
  the code.
- **Legend:** compact. Three states plus no-data, and live vs forecast finish. It folds to a pill on
  mobile.
- **Data age badge:** "Live · updated 3 min ago" or "Forecast · +6 h", in the corner, from the real
  timestamps.

**Performance**
- Animate dashes by stepping `line-dasharray` (or a symbol layer) on `requestAnimationFrame`, at 30
  fps at most.
- Pause animation when the tab is hidden or the map is off-screen.
- One map instance per view; no second WebGL stage on this page.

**Maintenance:** keep the form and list behaviour exactly as it is. Restyle it:
- The NB/SB toggle becomes a two-segment pill.
- The status lifecycle uses pills.
- Delete uses the danger ghost button with its confirm.

**Mobile App control centre:** the phone preview sits in a dark device frame. Each control shows what
commuters will see.

**Scenario Sandbox and AI Sandbox (`/dashboard/ai-sandbox`)**
- Both get the full shell and stage. The AI Sandbox stays out of the nav, as it is today.
- Sandbox outputs that are simulations say so in a pill.

**Data Management and Audit Log**
- Stage intensity is 0.35.
- Tables:
  - sticky hairline headers;
  - row hover `rgba(255,255,255,0.03)`;
  - monospace or tabular ids and timestamps;
  - status as pills.
- Upload drop zone: a dashed hairline, with the accent brightening on drag-over.

**Everywhere:** toasts, menus, selects, date pickers, tooltips, scrollbars (thin, dark), skeleton
loaders (hairline shimmer, not grey blocks) and error banners all join the world. Search the codebase
for hardcoded light colours (`#fff`, `#f3f5f9`, `#e7ebf4`, `bg-white`, `text-slate-*`) and move each
one to a token.

## 6. Order of work and checkpoints

0. The feature inventory and baseline screenshots (section 1a). No visual edit happens before this.
1. Tokens and the new `DESIGN.md`. Load the fonts.
2. `NightCorridorStage` (shader, particles, 2.5D mascot plane), mounted in both layouts.
3. The 3D mascot with img2threejs (section 2a). **Checkpoint:** show the user the side-by-side of the
   3D model and the PNG, and get their approval before it replaces the plane on sign-in. If the user
   is not happy after two refinement rounds, ship sign-in with the 2.5D mascot and move on.
4. The sign-in page and the session check.
5. The shell: topbar, sidebar, logout dialog, page header pattern.
6. **Checkpoint: stop and show the user** desktop and mobile screenshots of sign-in, the session
   check and Overview. Get their approval of the direction before rolling it out to the rest.
7. Shared components: cards (with the section 5a structure), stat cards, pills, buttons, the mode
   tabs, the filter bar, inputs, tables, the "Details" disclosure, empty and error states with the
   mascot.
8. The chart kit (section 5b), applied to every chart. Then the maps (section 5c): basemap, flow,
   jam callouts, markers, incident and closure icons, the forecast finish, the horizon timeline,
   the corridor strip, and the panels. **Checkpoint:** show the user the Live Map and one analytics
   tab in all three modes before continuing.
9. The remaining pages, one at a time, every tab and sub-tab. Each one passes the section 1a parity check before the next
   starts, and is verified with one batch of screenshots (desktop and mobile)
   and one fix pass.
10. Final checks:
   - `npx tsc --noEmit -p .` passes;
   - no console errors;
   - Lighthouse performance on Overview is no worse than 10 points below the current build;
   - reduced motion verified;
   - light theme verified;
   - every number on every page matches the pre-redesign screenshot for the same moment;
   - every item in `REDESIGN_INVENTORY.md` is ticked for every route and role;
   - the diff guard from section 1a comes back clean or fully explained;
   - the copy log is complete, and every "never cut" fact is still reachable on its card.
11. Report what changed, what you could not verify, and anything that still looks off. Do not commit
   unless asked.
