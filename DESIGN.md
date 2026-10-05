---
name: SmartFlow NLEX — Night Corridor
description: Decision-intelligence dashboard for the NLEX corridor, Balintawak (Km 12) to Sta. Ines (Km 88.25), drawn as a night drive on a dark WebGL stage.
colors:
  stage: "#03060d"
  surface: "rgba(10, 16, 30, 0.86)"
  surface-raised: "rgba(14, 22, 40, 0.96)"
  hairline: "rgba(255, 255, 255, 0.08)"
  hairline-raised: "rgba(255, 255, 255, 0.12)"
  hairline-hover: "rgba(255, 255, 255, 0.16)"
  rule-topbar: "rgba(255, 255, 255, 0.10)"
  ink: "#f4f1ea"
  ink-secondary: "#b9c2d3"
  ink-muted: "#8590a6"
  expressway-blue: "#3660ff"
  expressway-blue-light: "#5c7aff"
  expressway-blue-deep: "#2b4fdb"
  toll-amber: "#ea8b0d"
  pill: "#ffffff"
  pill-ink: "#03060d"
  status-clear: "#2fbf6b"
  status-slow: "#f6c544"
  status-congested: "#ff5a4a"
  status-no-data: "#586377"
  accent-traffic: "#4f8dff"
  accent-incident: "#f7a86b"
  accent-emissions: "#4fd1a5"
  model-violet: "#ab9dff"
  danger: "#ff5a4a"
  light-stage: "#eceff5"
  light-surface: "rgba(255, 255, 255, 0.86)"
  light-ink: "#0b1220"
  light-ink-secondary: "#3a4458"
  light-ink-muted: "#5a6478"
  light-status-clear: "#12804a"
  light-status-slow: "#946500"
  light-status-congested: "#c8322a"
  light-status-no-data: "#7d8799"
  light-accent-traffic: "#2357d8"
  light-accent-incident: "#b05a14"
  light-accent-emissions: "#0b8460"
typography:
  story:
    fontFamily: "Italiana, serif"
    fontSize: "clamp(56px, 7.5vw, 116px)"
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: "2px"
  page-title:
    fontFamily: "Italiana, serif"
    fontSize: "clamp(40px, 4.6vw, 72px)"
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: "1px"
  section:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 300
    lineHeight: 1.6
  stat:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "'tnum' 1"
  eyebrow:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "2px"
  micro:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "2px"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "18px"
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
    backgroundColor: "{colors.pill}"
    textColor: "{colors.pill-ink}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.full}"
    padding: "14px 22px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "9px 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.stage}"
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
    backgroundColor: "rgba(255, 255, 255, 0.03)"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "11px 14px"
---

# Design System: SmartFlow NLEX — Night Corridor

## Overview

**Creative North Star: "Night Corridor"**

SmartFlow is the expressway at night, seen from the control room: a deep-black stage, a slow liquid light
moving over it like sodium lamps on wet asphalt, two lanes of light trails (headlights drifting one way,
taillights the other) and the work laid on top in near-opaque panels. The mascot, the blue NLEX car in its
cap, is the one character in the world. It is scarce on purpose: a real 3D model centre-stage on sign-in and
in the Overview hero, the small PNG in a few states (session check, empty and error states, the collapsed
sidebar, the logout dialog), and absent from every other page.

The world lends the dashboard four things and nothing else: the stage, the type (an oversized thin serif for
titles, a light geometric sans for everything an operator reads), the palette, and one signature move, the
letter-by-letter blur-up of a page title on arrival. Navigation, controls, tables and charts stay the
standard ones operators already know. Data is never decorated: motion is ornament around the work, never on
the numbers.

**Key Characteristics:**
- One fixed WebGL stage behind everything (`components/stage/NightCorridorStage.tsx`), mounted once per
  layout; off on the Live Map, where the map is the stage.
- Near-opaque surfaces over the stage, separated by 1 px hairlines, never by blur (no `backdrop-filter` over
  the canvas: too expensive on data pages).
- Italiana for page titles, story titles and the Overview greeting only; Outfit for all interface text;
  tabular figures for every number that sits in a column, ticks in place or is compared.
- One white pill per view for the primary action; every other button is a hairline ghost.
- Exactly three road states plus no data, retuned for the dark ground; brand amber never stands in for "slow".
- One domain accent per page through `--page-accent`: traffic blue, incident amber, emissions green.
- Dark is the default; Light is the same structure on a paper ground, not the previous design.

## Colors

The palette is night: a near-black stage with a faint blue cast, warm-white ink, expressway blue for the
brand, and the road's three states. Colour does real jobs only: page identity (the accent), road state,
chart series and the one action.

### Ground and surfaces
- **Stage** (`stage`, `#03060d`): never pure black, so the wave field and shadows have somewhere to fall.
  Light theme: porcelain `#eceff5`, crossed by the same waves drawn as coloured silk bands (warm at the
  amber end, expressway blue elsewhere) with pearl highlights on their cores, so light mode keeps the dark
  one's depth instead of a faded wash.
- **Surface** (`surface`, 86% `#0a101e`): cards and panels, with a 1 px `hairline` (white at 8%).
- **Raised** (`surface-raised`, 96% `#0e1628`): popovers, dialogs, menus, tooltips, the sidebar; hairline at 12%.
- **Topbar rule** (`rule-topbar`, white at 10%): the one horizontal hairline under the topbar.

### Ink
- **Ink** (`ink`, `#f4f1ea`): a warm white, like the reference's `#fff6ed`. 16.7:1 on surface.
- **Secondary** (`ink-secondary`, `#b9c2d3`): 10.5:1. **Muted** (`ink-muted`, `#8590a6`): 5.9:1, so it holds
  AA even at the 11 px eyebrow size.

### Brand
- **Expressway Blue** (`#3660ff`, light `#5c7aff`, deep `#2b4fdb`): links, focus, the brand wash in the stage.
- **Toll Amber** (`toll-amber`, `#ea8b0d`): the amber X of the NLEX logo. It lives only in the brand mark,
  the mascot's glow and hazard lights, and the sign-in story's amber start. Never a status, never an accent.

### Road state (the Three Words Rule)
- **Clear** `#2fbf6b`, **Slow** `#f6c544`, **Congested** `#ff5a4a`, **No data** `#586377` (dark);
  `#12804a`, `#946500`, `#c8322a`, `#7d8799` (light).
- Slow was moved from the brief's `#f0a03c` toward yellow: at `#f0a03c` it sat only ΔE 5.1 (OKLab ×100) from
  toll amber, too close to tell apart side by side; `#f6c544` is ΔE 13.9 away.
- No data was moved from `#4a5568` (2.7:1 on the stage) to `#586377` (3.3:1), so a grey segment still meets
  the 3:1 floor for graphics.
- These four, and only these, colour maps, legends, status cells and counts. No fourth colour, no shading
  inside a band. `lib/map-palette.ts` holds the map's copy; the CSS holds `--signal-*`.

### Domain accents (the One Accent Rule)
- **Traffic** `#4f8dff`, **Incidents** `#f7a86b`, **Emissions** `#4fd1a5` (dark); `#2357d8`, `#b05a14`,
  `#0b8460` (light). Set once per page as `--page-accent` (via `.viz-*` on the page section or
  `data-accent` on the page header) and inherited by the header, mode-tab underline, active nav edge, focus
  rings and card edge glow. The incident amber is lighter and pinker than toll amber (ΔE 8.6) and the
  emissions green leans mint, away from status clear (ΔE 8.6).
- ECharts and the WebGL stage take literal values, read through `useChartTheme()` / `useThemeTokens()`,
  never `var()`.

### Semantic
- **Danger** `#ff5a4a` (destructive buttons, errors), **Model violet** `#ab9dff` (model and forecast
  labels, so a forecast never reads as a road state).

## Typography

**Display:** Italiana. **Interface:** Outfit 300 / 400 / 600. Both are self-hosted from `Front-End-Dashboard/app/fonts` through `@font-face` in `globals.css` (OFL; `next/font` rejects the production `assetPrefix: './'` the Electron build needs).
**Numerals:** Outfit with `font-variant-numeric: tabular-nums`. Outfit ships a real `tnum` feature (checked
in its GSUB table on 4 Oct 2026; its default digits are proportional), so no second face is needed.

### Scale (snap to these; add no sizes)
- **Story** (Italiana, `clamp(56px, 7.5vw, 116px)`, 1.0, 2 px tracking): the four sign-in story titles.
- **Page title** (Italiana, `clamp(40px, 4.6vw, 72px)`): every page header, blurred up letter by letter on
  arrival.
- **Section** (Outfit 600, 20 px): card and section headlines.
- **Body** (Outfit 300/400, 15 px, 1.6): prose, table cells, form fields.
- **Stat** (Outfit 400, 32 px, tabular): the answer on a stat card.
- **Eyebrow** (Outfit 600, 11 px, uppercase, 2 px tracking): group names, labels, table headers, pills.
- **Micro** (Outfit 600, 10 px, uppercase, 2 px tracking): the breadcrumb and nav group labels.

### Named rules
**The Display Rule.** Italiana never sets a number, a label or anything under 32 px.
**The Tabular Rule.** Stat values, tables, km posts and times use tabular figures.

## Layout

The shell is a sidebar beside a main column. The main column holds the topbar, its 1 px rule, and the
scrolling `<main class="ds-main">` (the document itself never scrolls, so everything scroll-driven reads
`main.scrollTop`). Five vertical grid hairlines sit on the content columns at 5% white (12% on sign-in,
off on the Live Map), each carrying two dots that drift with scroll progress. Long pages carry a column of
section-progress dashes at the right edge that double as jump links.

Every page opens with the same header: an eyebrow with its group, the Italiana title, a one-line
description of what the page answers (15 words or fewer), and its controls right-aligned on the same
baseline. Analytics pages follow it with the mode switch (Descriptive / Predictive / Prescriptive, each with
a three-word hint), a sticky filter bar, then cards.

Every card reads top to bottom as **answer** (one number or state, with its unit), **context** (the
comparison the data supports, and its freshness), **evidence** (the chart), and **method** (behind
`InfoTooltip` or a "How this is measured" disclosure).

Sign-in is one viewport on a 25vw column grid with 60 px side padding: the mascot in columns 2–3, the
sign-in card in column 4, the story bottom-left.

The Overview opens on a full-height hero after the reference the user chose: the 3D car centre-right on
the stage (the stage draws it over the hero's `[data-stage-anchor="mascot"]` box and follows it as
`<main>` scrolls), the wave warm amber at the top cooling to expressway blue as the reader scrolls, an
oversized Italiana "Overview" bottom-left over two short columns of live status (freshness and the
computed headline; the slowest reading and the links onward), and a scroll cue. Below: the counts, the
ranked hotspots, the corridor at true scale, then Live Corridor Status drawn as a night road (deep asphalt,
faintly lit shoulders, each vehicle a headlight glow ahead and a taillight glow behind).

## Elevation & Depth

Depth comes from the stage, not from shadows. Panels are near-opaque fills with hairlines; the stage glows
behind them. Overlays (dialogs, popovers, tooltips) are raised surfaces with a single soft shadow
`0 24px 60px rgba(0, 0, 0, 0.55)`. Interactive surfaces lift 2 px on hover and their hairline brightens to
16% with a faint page-accent edge glow; non-interactive surfaces never react to hover.

## Motion

- **Title blur-up** (the signature): each character rises from 50 px below with a 12 px blur over 0.8 s
  on `cubic-bezier(0.25, 1, 0.5, 1)`, staggered 35 ms; the description follows with a 30 px rise after
  0.4 s. Once per route.
- **Cards**: a 12 px rise and fade on first mount, staggered 40 ms, capped at 8. No motion on data refresh.
- **Clip-path wipe** (`inset(0 0 100% 0)` → `inset(0)`, 1.8 s, `cubic-bezier(0.16, 1, 0.3, 1)`, content
  scaling 1.15 → 1): the sign-in story and the Overview hero only.
- **Stage**: about 30 fps on dashboard pages (full rate while the Overview's car is on screen, so it
  keeps pace with the hero as it scrolls), paused when the tab is hidden. The wave field is mostly the dark
  stage, with colour gathering into soft glowing bands with bright cores.
- `prefers-reduced-motion` stops the shader, the particles, the letter reveals and the mascot float, and
  leaves one still frame.

## Shapes

Corners are soft but not round: 6 px for small controls, 10 px for inputs and popovers, 14 px for cards,
18 px for dialogs, fully round for pills, the primary button and segmented controls. Lines are 1 px
hairlines; the active nav item carries a 2 px accent edge, the only thicker line in the shell.

## Components

### Buttons
- **Primary (the white pill):** white fill, stage-colour text, uppercase 11 px at 600 with 1 px tracking, a
  small hollow ring mark at the trailing edge, `scale(1.04)` on hover. At most one per view. In the light
  theme it inverts to ink fill and white text.
- **Ghost:** transparent with a hairline, ink text; hover brightens the hairline and lifts 2 px.
- **Danger:** danger-red fill; never the white pill.

### Cards and stat cards
Surface fill, 14 px corners, hairline. Stat cards: eyebrow label, a 32 px tabular value with its unit, then
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
rest with their hub "N" upright and spin only on a story change or a pending sign-in. Since the
character-sheet rebuild (v3) the face is drawn, so it blinks, follows the pointer and changes
expression; the car drives in and turns to the reader on arrival, fidgets now and then, and hops
and winks when clicked. It falls back to the
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
- **Do** use the white pill once per view, for the action the view exists for.
- **Do** colour road state only with the four state tokens.

### Don't:
- **Don't** put `backdrop-filter` over the stage on data pages.
- **Don't** use toll amber anywhere but the brand mark, the mascot's lights and the sign-in story.
- **Don't** set Italiana under 32 px, or on a number.
- **Don't** add a custom cursor inside the dashboard; the double-ring cursor is sign-in only.
- **Don't** animate on data refresh, or let decorative motion imitate live data.
