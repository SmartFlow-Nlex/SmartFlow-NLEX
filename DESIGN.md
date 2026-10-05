---
name: SmartFlow NLEX — NLEX Daylight
description: Decision-intelligence dashboard for the NLEX corridor, Balintawak (Km 12) to Sta. Ines (Km 88.25): a bright NLEX-blue control centre over the user's expressway artwork, with the blue NLEX car mascot as its companion.
colors:
  nlex-blue: "#1f5fe0"
  nlex-blue-bright: "#2f74f5"
  nlex-blue-deep: "#1746b8"
  nlex-sky: "#e8f2ff"
  nlex-gold: "#ffc531"
  nlex-coral: "#f0506e"
  stage: "#eef5fd"
  surface: "rgba(255, 255, 255, 0.92)"
  surface-raised: "#ffffff"
  topbar: "#fbfdff"
  hairline: "rgba(31, 95, 224, 0.12)"
  hairline-raised: "rgba(31, 95, 224, 0.22)"
  hairline-hover: "rgba(31, 95, 224, 0.38)"
  ink: "#10275a"
  ink-secondary: "#3e5683"
  ink-muted: "#61769f"
  status-clear: "#15935b"
  status-slow: "#b7730d"
  status-congested: "#e0405e"
  status-no-data: "#8090ad"
  accent-traffic: "#1f5fe0"
  accent-incident: "#c4620f"
  accent-emissions: "#0f8a63"
  model-violet: "#5b47c9"
  toll-amber: "#ea8b0d"
  dark-stage: "#0a1838"
  dark-surface: "rgba(13, 29, 64, 0.9)"
  dark-raised: "#10234d"
  dark-ink: "#eef3ff"
  dark-ink-secondary: "#b8c7e6"
  dark-ink-muted: "#8a9dc4"
  dark-status-clear: "#2fbf6b"
  dark-status-slow: "#f6c544"
  dark-status-congested: "#ff5a4a"
typography:
  story:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(50px, 6.4vw, 100px)"
    fontWeight: 560
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  brand-display:
    fontFamily: "Saira, sans-serif"
    fontSize: "clamp(44px, 5.9vw, 88px)"
    fontWeight: 700
    fontStretch: "125%"
    lineHeight: 0.95
  page-title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(34px, 3.8vw, 58px)"
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: "-0.035em"
  section:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 300
    lineHeight: 1.6
  stat:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "'tnum' 1"
  eyebrow:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "2px"
  micro:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "2px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
  xl: "28px"
  gutter: "60px"
components:
  button-primary:
    backgroundColor: "{colors.nlex-blue}"
    textColor: "#ffffff"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.full}"
    padding: "14px 22px"
  button-secondary:
    backgroundColor: "#ffffff"
    textColor: "{colors.nlex-blue}"
    rounded: "{rounded.full}"
    padding: "9px 16px"
  button-danger:
    backgroundColor: "{colors.status-congested}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    padding: "10px 18px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.stat}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
  popover:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  mode-tab-active:
    textColor: "{colors.ink}"
    typography: "{typography.eyebrow}"
  pill:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  input:
    backgroundColor: "#f6f9ff"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "11px 14px"
---

# Design System: SmartFlow NLEX — NLEX Daylight

## Overview

**Creative North Star: "Smart traffic intelligence, but friendly"** (NLEX Daylight, 7 Oct 2026, from
the user's brief and mascot reference; it replaced the dark "Night Corridor" design.)

SmartFlow is a bright NLEX control centre overlooking a living expressway: the user's own artwork of the
NLEX curving under an elevated road and a skyline (a morning version and a night version), soft clouds
drifting over it, and the work laid on top in clean white cards. The mascot, the blue NLEX car in its cap,
is the system's companion: a real 3D model standing on the expressway in the Overview hero, the small PNG
in a few states (session check, empty and error states, the collapsed sidebar, the logout dialog), and
absent from every other page. The mascot gives the friendliness; the analytics give the intelligence; the
environment gives the identity; the interface stays professional.

The world lends the dashboard four things and nothing else: the environment, the type (Inter for the
interface, wide heavy Saira for the brand and the Overview title), the palette (NLEX blue, white, sky,
soft gold accents, coral only for congestion and alerts), and one signature move, the letter-by-letter
blur-up of a page title on arrival. Navigation, controls, tables and charts stay the standard ones
operators already know. Data is never decorated: motion is ornament around the work, never on the numbers.

**Key Characteristics:**
- The NLEX environment behind every page, tab and sub-tab (`components/environment/NlexEnvironment.tsx`,
  `app/styles/nlex-environment.css`): the artwork plus three depths of drifting clouds; only the clouds
  move.
- A transparent WebGL canvas (`components/stage/NightCorridorStage.tsx`) that draws only the 3D mascot, on
  the Overview; every other route switches it off.
- White, rounded cards with a soft blue shadow; an NLEX-blue navigation rail; a solid white header.
- Inter for titles and interface text, readouts included; wide heavy Saira only for the wordmarks and the
  Overview title; tabular figures for every number that sits in a column, ticks in place or is compared.
- Primary buttons are NLEX blue with white text; secondary buttons are white with a blue border and text.
- Exactly three road states plus no data; coral-red is congestion and alerts, never decoration.
- One domain accent per page through `--page-accent`: traffic blue, incident orange, emissions green.
- Light is the default (`lib/theme.tsx`); dark is the same system at night, on navy, never black.
- The theme lives in `app/styles/nlex-daylight.css`, loaded last; it works through the tokens every rule
  already reads, so page logic and markup did not change.

## Colors

The palette is daylight: white and sky blue, NLEX blue for the brand and every action, soft gold for the
mascot's little accent strokes, coral-red only for congestion and alerts. Colour does real jobs only: page
identity (the accent), road state, chart series and the one action.

### Ground and surfaces
- **Environment**: the user's artwork, `Front-End-Dashboard/public/light_bg.png` by day and `dark_bg.png` at
  night (served as the WebP copies beside them, about 70 KB each), anchored bottom right and at least 170vh
  wide so on a laptop the skyline starts to the right of the page title; above it the sky colour carries
  on (`#5fb4fc` by day, `#031d4e` at night, matched to the art's top edge, which fades into it). Over it:
  a soft light that slowly drifts and breathes, three depths of procedural clouds
  (`public/environment/cloud-*.webp`, generated by `scripts/environment-clouds.py`) and a light veil on the
  left where titles sit. No WebGL needed.
- **Stage** (`stage`, `#eef5fd`; night `#0a1838`): the page colour wherever the environment is not drawn.
- **Surface** (`surface`, white at 92%; night navy at 90%): cards and panels, with a 1 px blue-tinted
  hairline and the card shadow.
- **Raised** (`surface-raised`, `#ffffff`; night `#10234d`): popovers, dialogs, menus, tooltips.
- **Topbar** (`topbar`, solid `#fbfdff`; night `#0b1a3d`): the header, with a blue-tinted rule and a soft
  shadow; it continues behind the page scrollbar so it runs edge to edge.
- **Sidebar**: a vertical NLEX-blue gradient (`#2a6cf0` → `#1f5fe0` → `#1749bd`; night `#132c66` →
  `#0b1b42`) with white icons and labels.
- (History: Night Corridor's liquid-light wave, then a carbon ground with a race circuit, then an SVG
  expressway, all before 7 Oct 2026; see REDESIGN_INVENTORY.md.)

### Ink
- **Ink** (`ink`, `#10275a`): a deep navy blue, never black. **Secondary** (`ink-secondary`, `#3e5683`),
  **Muted** (`ink-muted`, `#61769f`). Night: `#eef3ff`, `#b8c7e6`, `#8a9dc4`.

### Brand
- **NLEX Blue** (`#1f5fe0`, bright `#2f74f5`, deep `#1746b8`): the brand, the sidebar, primary buttons,
  links, focus, the Overview title. **Sky** (`#e8f2ff`): active chips and hovers. **Gold** (`#ffc531`): the
  mascot-style accent strokes by the Overview title and the "NLEX" in the sidebar wordmark.
- **Toll Amber** (`toll-amber`, `#ea8b0d`): the amber X of the NLEX logo. It lives only in the brand mark,
  the mascot's glow and hazard lights, and the sign-in story's amber start. Never a status, never an accent.

### Road state (the Three Words Rule)
- **Clear** `#15935b`, **Slow** `#b7730d`, **Congested** `#e0405e`, **No data** `#8090ad` (light, the
  default); `#2fbf6b`, `#f6c544`, `#ff5a4a`, `#586377` (dark).
- Slow was moved from the brief's `#f0a03c` toward yellow: at `#f0a03c` it sat only ΔE 5.1 (OKLab ×100) from
  toll amber, too close to tell apart side by side; `#f6c544` is ΔE 13.9 away.
- No data was moved from `#4a5568` (2.7:1 on the stage) to `#586377` (3.3:1), so a grey segment still meets
  the 3:1 floor for graphics.
- These four, and only these, colour maps, legends, status cells and counts. No fourth colour, no shading
  inside a band. `lib/map-palette.ts` holds the map's copy; the CSS holds `--signal-*`.

### Domain accents (the One Accent Rule)
- **Traffic** `#1f5fe0`, **Incidents** `#c4620f`, **Emissions** `#0f8a63` (light); `#4f8dff`, `#f7a86b`,
  `#4fd1a5` (dark). Set once per page as `--page-accent` (via `.viz-*` on the page section or
  `data-accent` on the page header) and inherited by the header, mode-tab underline, active nav edge, focus
  rings and card edge glow. The incident amber is lighter and pinker than toll amber (ΔE 8.6) and the
  emissions green leans mint, away from status clear (ΔE 8.6).
- ECharts and the WebGL stage take literal values, read through `useChartTheme()` / `useThemeTokens()`,
  never `var()`.

### Semantic
- **Danger** `#ff5a4a` (destructive buttons, errors), **Model violet** `#ab9dff` (model and forecast
  labels, so a forecast never reads as a road state).

## Typography

Motorsport type since 6 Oct 2026, chosen by setting candidates beside crops of the user's four Formula 1
references (Italiana and Outfit before it, then briefly Saira throughout).
**Headlines and interface:** Inter. At large sizes its optical-size axis gives the display cut, tracked
tight (−0.035em): the neo-grotesk of "Silverstone England", "F1 Racing" and "Circuit (BIC)". Inter is
drawn at 93% (`size-adjust`), so a line sets to the same length as the old Outfit and no layout moved.
**Brand moments:** Saira expanded (125%) and bold, like "Formula 1": the wordmarks and the Overview hero.
**Readouts** (page eyebrows, the clock, data-age badges): Inter too since 7 Oct 2026 (Space Mono, the
telemetry face, was retired with the motorsport look).
All self-hosted from `Front-End-Dashboard/app/fonts` through `@font-face` in `globals.css` (OFL;
`next/font` rejects the production `assetPrefix: './'` the Electron build needs).
**Numerals:** Inter with `font-variant-numeric: tabular-nums`; big numbers are bold and tight
(`--numeral-weight` 650, `--numeral-tracking` −0.02em), like "360.5 km/h" and "12 PTS".

### Scale (snap to these; add no sizes)
- **Story** (Inter 560, `clamp(50px, 6.4vw, 100px)`, 0.98, −0.035em): the sign-in story titles.
- **Brand display** (Saira 700 expanded, `clamp(44px, 5.9vw, 88px)`): the Overview hero.
- **Page title** (Inter 700, `clamp(34px, 3.8vw, 58px)`, −0.035em): every page header, blurred up letter by
  letter on arrival.
- **Section** (Inter 600, 20 px): card and section headlines.
- **Body** (Inter 300/400, 15 px, 1.6): prose, table cells, form fields.
- **Stat** (Inter 650, 32 px, tabular, −0.02em): the answer on a stat card.
- **Eyebrow** (Inter 600, 11 px, uppercase, 2 px tracking): labels, table headers, pills; the page
  eyebrow above a title is Inter 700 in the page accent.
- **Micro** (Inter 600, 10 px, uppercase, 2 px tracking): the breadcrumb and nav group labels.

### Named rules
**The Display Rule.** The wide Saira is for brand moments only (wordmarks, the Overview hero), never body text
or a label.
**The Tabular Rule.** Stat values, tables, km posts and times use tabular figures.

## Layout

The shell is an NLEX-blue sidebar (a full list, or a 76 px icon rail when collapsed) beside a main
column. The main column holds the white header and the scrolling `<main class="ds-main">` (the document
itself never scrolls, so everything scroll-driven reads `main.scrollTop`); its scrollbar is slim, with a
clear track and a soft blue thumb. The analytics pages' filter row is clear while it sits in place and
fades to the header colour as it pins under the header. Long pages carry a column of section-progress
dashes at the right edge that double as jump links. (The Night Corridor's vertical grid hairlines are
hidden.)

Every page opens with the same header: an eyebrow with its group, the display title, a one-line
description of what the page answers (15 words or fewer), and its controls right-aligned on the same
baseline. Analytics pages follow it with the mode switch (Descriptive / Predictive / Prescriptive, each with
a three-word hint), a sticky filter bar, then cards.

Every card reads top to bottom as **answer** (one number or state, with its unit), **context** (the
comparison the data supports, and its freshness), **evidence** (the chart), and **method** (behind
`InfoTooltip` or a "How this is measured" disclosure).

Sign-in is one viewport on a 25vw column grid with 60 px side padding over the NLEX environment: the
sign-in card in column 4, the story bottom-left, the expressway artwork between.

The Overview opens on a full-height hero after the user's mascot reference. Left: the "ANALYTICS"
eyebrow, "Overview" in heavy wide Saira in NLEX blue with three gold accent strokes, the corridor span,
then the live answers as cards in two columns: a soft blue card with a pulsing green dot for the feed's
freshness, the computed headline in a card tinted by its state (soft coral with a car icon when
congested) whose chevron jumps to the hotspot list, the slowest reading in a white card with the same
chevron, and the two links (Open Live Map, Traffic forecast) as white secondary buttons with icons.
Right: the 3D car on the artwork's expressway. A blue "Live corridor" pill with the live dot scrolls on.
Below: the counts, the ranked hotspots, then Live Corridor Status.

## Elevation & Depth

Depth comes from the environment and from soft blue shadows. Cards float over the sky with
`0 1px 2px rgba(16,39,90,.04), 0 12px 30px -16px rgba(31,95,224,.28)` and deepen a little on hover;
interactive cards also lift 2 px. Overlays (dialogs, popovers, tooltips, menus) are white raised surfaces
with `0 28px 70px -18px rgba(16,39,90,.3)`. Night uses darker, neutral shadows.

## Motion

- **Title blur-up** (the signature): each character rises from 50 px below with a 12 px blur over 0.8 s
  on `cubic-bezier(0.25, 1, 0.5, 1)`, staggered 35 ms; the description follows with a 30 px rise after
  0.4 s. Once per route.
- **Cards**: a 12 px rise and fade on first mount, staggered 40 ms, capped at 8. No motion on data refresh.
- **Clip-path wipe** (`inset(0 0 100% 0)` → `inset(0)`, 1.8 s, `cubic-bezier(0.16, 1, 0.3, 1)`, content
  scaling 1.15 → 1): the sign-in story and the Overview hero only.
- **Environment**: only the clouds move: three depths drifting right to left at 520 s, 330 s and 210 s a
  screen (each cloud its own small layer, looping without a reset), plus a soft light that drifts and
  breathes on unrelated 47 s and 31 s periods. The artwork stays still and does not follow the pointer.
  The Effects switch and reduced motion hold it all still; the scene stays.
- **Microinteractions**: buttons lift 2 px with a slightly deeper shadow and press to 97%; nav icons nudge
  on hover; filter dropdowns open with a small spring; the live dot pulses gently; KPI numbers count to
  new values; cards rise in once.
- **Mascot**: the existing idle (bob, sway, blink, fidgets), drive-in, hover and click reactions, on the
  Overview only.
- `prefers-reduced-motion` stops the clouds, the light, the letter reveals, the live pulse and the mascot's
  motion (the 2.5D plane shows one still frame).

## Shapes

Corners are rounded and friendly: 8 px for small controls, 12 px for inputs and popovers, 18 px for cards,
24 px for dialogs, 14 px for nav items, fully round for pills, buttons and segmented controls. Lines are
1 px blue-tinted hairlines; the active nav item is a translucent white tile with a white inner outline and
a soft glow.

## Components

### Buttons
- **Primary:** NLEX-blue gradient fill (`#2f74f5` → `#1f5fe0`), white uppercase 11 px text, a soft blue
  shadow; hover lifts 2 px and brightens a touch; pressed scales to 97%. (The sign-in button and the
  `.nc-pill` keep their ring mark, now NLEX blue.)
- **Secondary:** white fill, blue border and text; hover fills sky blue and lifts. In a filter group the
  active choice fills NLEX blue.
- **Danger:** coral outline, coral fill on hover.

### Cards and stat cards
White surface, 18 px corners, blue-tinted hairline, soft blue shadow. Stat cards: eyebrow label, a 32 px tabular value with its unit, then
a delta or confidence pill. Cards in a row align on the answer / context / evidence / method bands.

### Pills
Hairline outline, 11 px uppercase, tinted by meaning (model violet, status colours, page accent). The
ILLUSTRATIVE and simulation labels are amber-outline pills beside the title, never only in a tooltip.

### Mode switch
One segmented control under the page title: icon, mode name, and a three-word hint; an accent underline
slides to the active mode; content cross-fades in 200 ms.

### Tables
Sticky hairline headers in eyebrow type, rows hover at white 3%, tabular ids and timestamps, status as pills.

### The mascot
The 3D model (`components/stage/mascot/`, built with img2threejs; face and logos are decals cut from the
PNG) is drawn by the stage on sign-in and in the Overview hero, with the brief's key and fill, a sky-blue rim
(`#6fa8ff`, softer than the brief's `#5c7aff`, which turned the paint indigo) and a soft studio environment
for the glossy toy-plastic reflections; its exposure is 1.35 so the paint keeps the PNG's azure. The wheels
rest with their hub "N" upright and spin only on a story change or a pending sign-in. The design is
v2 made cuter (6 Oct 2026): the drawn face blinks, follows the pointer and changes expression;
the car drives in and turns to the reader, rocks up onto two wheels now and then and on hover,
twinkles with sparkles, and hops when clicked. The 3D car is on the Overview only (sign-in shows no mascot). Since 7 Oct 2026 it is v8, rebuilt to the
user's two reference sheets (circled-"N" cap badge, round peeking eyes, a small rounded smile), and it
arrives by driving toward the reader along the road painted in the background art, then turns to face
the reader and settles. It falls back to the
2.5D PNG plane when the model fails, the device has under 4 GB of memory, or reduced motion is on.
`components/stage/Mascot.tsx` (PNG) everywhere small: session check (headlights pulsing as the loader),
empty states (headlights dimmed), errors (hazard blink at the mirrors), sidebar mark (a 28 px crop of the
face and cap, collapsed), logout dialog (headlights fade on confirm). Never redrawn, recoloured or cropped
below the cap.

## Do's and Don'ts

### Do:
- **Do** read `--page-accent` for any domain colour, and literal values from `useChartTheme()` inside chart
  options.
- **Do** keep every number, unit, time window, data source, gap and ILLUSTRATIVE label visible or one
  click away on the same card.
- **Do** keep coral-red for congestion, warnings and alerts only.
- **Do** colour road state only with the four state tokens.

### Don't:
- **Don't** put `backdrop-filter` over the environment on data pages, or make the artwork move.
- **Don't** use toll amber anywhere but the brand mark, the mascot's lights and the sign-in story.
- **Don't** set the wide Saira on body text or a label.
- **Don't** add a custom cursor inside the dashboard; the double-ring cursor is sign-in only.
- **Don't** animate on data refresh, or let decorative motion imitate live data.
