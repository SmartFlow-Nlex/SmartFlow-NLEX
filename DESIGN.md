---
name: SmartFlow NLEX
description: Decision-intelligence dashboard for the NLEX corridor, Balintawak (Km 12) to Sta. Ines (Km 88.25).
colors:
  expressway-blue: "#3660ff"
  expressway-blue-light: "#5c7aff"
  expressway-blue-deep: "#2b4fdb"
  signal-violet: "#7c5cff"
  toll-amber: "#ea8b0d"
  night-corridor-navy: "#0a2240"
  night-corridor-lit: "#123b6b"
  page-ground: "#f3f5f9"
  surface: "#ffffff"
  surface-hover: "#f8f9fc"
  border-default: "#e7ebf4"
  border-strong: "#d4dbea"
  ink: "#071a44"
  ink-secondary: "#4b5e7d"
  ink-muted: "#627188"
  muted-fill: "#e7ecf5"
  muted-ink: "#3b4f6b"
  success: "#0c8231"
  success-bg: "#e8f8ec"
  warning: "#c2490a"
  warning-bg: "#fff5dc"
  danger: "#dc2626"
  danger-bg: "#fef0f0"
  info: "#2f57ea"
  info-bg: "#edf3ff"
  model-purple: "#7c3aed"
  model-purple-bg: "#ece0ff"
  accent-traffic: "#2a78d6"
  accent-incident: "#b8760a"
  accent-emissions: "#0f8a4a"
  status-clear: "#23a55a"
  status-slow: "#e08a2e"
  status-congested: "#e04434"
  status-no-data: "#cbd5e1"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(2.1rem, 3.4vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  numeral:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.88rem"
    fontWeight: 500
    lineHeight: 1.5
  caption:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 500
    lineHeight: 1.3
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.07em"
rounded:
  sm: "8px"
  control: "10px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
  content: "24px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.expressway-blue}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.expressway-blue-deep}"
  button-muted:
    backgroundColor: "{colors.muted-fill}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  mode-tab-active:
    backgroundColor: "{colors.expressway-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  nav-tab-active:
    backgroundColor: "{colors.night-corridor-lit}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.numeral}"
    rounded: "{rounded.lg}"
    padding: "16px 16px 16px 20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 34px 8px 12px"
  pill-success:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  pill-warning:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  pill-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  pill-model:
    backgroundColor: "{colors.model-purple-bg}"
    textColor: "{colors.model-purple}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: SmartFlow NLEX

## Overview

**Creative North Star: "The Corridor Control Room"**

SmartFlow is the room a TCC operator sits in: a dark navy wall of navigation on the left, bright work surfaces in front, and a road that changes colour as it fills. The shell stays steady and the data moves. Colour does two jobs only. It names the analytics domain you are in (Traffic blue, Incidents amber, Emissions green) and it reports the state of the corridor (clear, slow, congested, no data). Everything else is ink on white or ink on navy.

The surfaces have physical presence. Cards sit on a page ground washed with faint blue and violet light. They carry a soft shadow and rise under the cursor. The active nav item gets a lit edge, the topbar is frosted glass that content scrolls beneath, and primary actions use a blue-to-violet gradient with a coloured shadow. That depth is spent on hierarchy, to mark what is selected, what can be pressed and what to read first. It is never spread evenly across the page.

The interface is dense and built for operators who return to it all day. Pages pack KPI tiles, chart grids, maps and tables into one scroll. Type is Inter throughout, weighted heavily (700 is the default for anything that is not running text), with big tabular numerals for the readings that matter. Light and dark themes are both first-class. Only tokens change between them, and no component rule needs to know which theme is active.

**Key Characteristics:**
- Navy shell, bright work surface, with colour reserved for domain identity and corridor state.
- Tactile depth: layered shadows, hover lift, a lit active edge, glass topbar, gradient primary actions.
- Inter at heavy weights, with oversized tabular numerals for KPIs.
- One accent per page, `--page-accent`, inherited from the page header down to every card, tab and focus ring.
- Light and dark are token swaps; series hues keep their meaning in both.

## Colors

The palette is cool and blue-led: Expressway Blue for action, deep Night Corridor Navy for the shell, and a strict traffic-light vocabulary for road state.

### Primary
- **Expressway Blue** (`expressway-blue`): primary actions, the active mode tab, focus rings when a page declares no accent, links. Lightens to `expressway-blue-light` in dark mode so it holds contrast on near-black.
- **Signal Violet** (`signal-violet`): appears only as the far stop of the primary gradient and in the second ground wash. Never used as a flat fill.

### Secondary
- **Toll Amber** (`toll-amber`): the brand's second voice, used for the "NLEX" highlight in the wordmark and the warm wash on the login page. It is not a status colour; congestion uses `status-slow`.

### Domain Accents
- **Traffic Blue** (`accent-traffic`), **Incident Amber** (`accent-incident`), **Emissions Green** (`accent-emissions`): set once on `.ds-page-header[data-accent]` as `--page-accent` and inherited down the page. They tint the header icon tile, the stat-card leading bar, card washes, row hover and select focus. Chart series for each domain come from the same hue families in `lib/chart-theme.ts`.

### Corridor State
- **Clear** (`status-clear`), **Slow** (`status-slow`), **Congested** (`status-congested`): the only three colours a road segment, exit marker or status count may wear. Defined in `lib/map-palette.ts` and shared by the live map, the comparison map and the corridor status panel. Dark mode brightens them (`#34d399`, `#f59e0b`, `#ef4444`).
- **No Data** (`status-no-data`): a stretch the feed said nothing about. It is a neutral slate on purpose, because "not reported" is not a traffic condition.

### Semantic
- **Success / Warning / Danger / Info** (`success`, `warning`, `danger`, `info` with their `-bg` tints): message banners, pills and validation. Light values were darkened to clear WCAG AA 4.5:1 on both surface and ground.
- **Model Purple** (`model-purple`): marks model and AI content, such as model badges, insight callouts and champion labels.

### Neutral
- **Night Corridor Navy** (`night-corridor-navy`): the sidebar, drawn as a vertical gradient that darkens toward the footer, with a faint blue light thrown from the top-left corner. `night-corridor-lit` is the hover and active ground inside it.
- **Page Ground** (`page-ground`): the canvas behind cards, carrying two fixed radial washes (blue at the top left, violet at the top right).
- **Surface** (`surface`) and **Surface Hover** (`surface-hover`): cards, the topbar and table headers.
- **Ink** (`ink`, `ink-secondary`, `ink-muted`): text in three steps. All three pass AA on surface and on ground.
- **Borders** (`border-default`, `border-strong`): hairlines on cards and controls; the strong step is for hover.

Dark theme values live in `Front-End-Dashboard/app/globals.css` under both `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`. Ground `#0d1117`, surface `#161b22`, ink `#e6edf3`.

### Named Rules
**The Three Words Rule.** The road is clear, slow or congested, plus grey for no data. No fourth colour, no in-band shading on a map read at a glance, and the map, the panel and the mobile app paint the same three values.

**The One Accent Rule.** A page carries exactly one domain accent, read from `--page-accent`. A component that wants colour reads the variable with a fallback to Expressway Blue. It never hardcodes a domain hue.

**The Themed Furniture Rule.** Chart text, axes, gridlines and tooltips follow the theme through `useChartTheme()`. Series hues do not change between themes, because they are categorical identity. ECharts options take literal values, never `var()`.

## Typography

**Display Font:** Inter (with ui-sans-serif, system-ui, Segoe UI, Roboto)
**Body Font:** Inter
**Label/Mono Font:** Inter, with tabular numerals for figures

**Character:** One family carried by weight. Headings and numbers are heavy (800–900) and tightly tracked, labels are bold and tracked out in caps, and running text sits at 500. It reads like instrument labelling, not editorial prose.

### Hierarchy
- **Display** (800, clamp(2.1rem → 3rem), 1.05): the login wordmark only.
- **Numeral** (900, 2rem, 1): KPI values on stat cards and hero stats. Always tabular.
- **Headline** (800, 1.3rem, 1.2, −0.025em): the page title in `PageHeader`. Steps down to 1.15rem below 980px.
- **Title** (700, 0.95rem, 1.3): card and chart headings (`.chart-head h3`).
- **Body** (500, 0.88rem, 1.5): card copy, narratives, table cells (0.86rem).
- **Caption** (500, 0.78rem, 1.3): page subtitles, chart footnotes, model notes, timestamps.
- **Label** (800, 0.7rem, 0.07em, uppercase): table headers, sidebar section kickers (0.14em), eyebrow text.

### Named Rules
**The Snap Rule.** The stylesheet holds more than 25 distinct sizes between 0.6rem and 1.3rem. New work snaps to the seven roles above. Nothing below 0.68rem carries information an operator must read.

**The Tabular Rule.** Any number that sits in a column, ticks in place or is compared with a neighbour uses `font-variant-numeric: tabular-nums`.

## Layout

The shell is a two-column grid: a sticky full-height sidebar (280px, or 240px at ≤1300px) beside a main column holding a 64px sticky glass topbar and the scrolling content area. The page scrolls an inner `<main>`, not `body`. At ≤980px the sidebar becomes a fixed 280px overlay drawer, and at ≤640px the topbar wraps.

Content padding is 24px (`spacing.content`), then 18px at ≤980px and 14px at ≤640px. Pages follow one order: `PageHeader` (icon tile, title, subtitle, actions on the right), then the mode tabs (Descriptive / Predictive / Prescriptive) where the page has them, then a four-up KPI grid, then a two-column chart grid in which `.wide` cards span both columns. Gaps between tiles are 14px (`spacing.md`).

The spacing scale is 4 / 8 / 14 / 20 / 28. The 14px middle step is a deliberate choice, not an 8px-grid error, and new work keeps it. Breakpoints in use are 1300, 1100, 980 and 640px.

## Elevation & Depth

The system is layered. Depth comes from three stacked sources: a lit ground (radial washes fixed to the viewport), soft cool shadows under every card, and accent-tinted shadows that appear on interaction. The glass topbar (82% surface, 14px blur, 1.3 saturation) shows content passing under it. In dark mode shadows turn to black at 0.4–0.55 alpha, and borders do more of the separation work.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06)`): chart cards and panels at rest.
- **Stat rest** (`box-shadow: 0 1px 2px rgba(15, 28, 58, 0.04), 0 8px 24px rgba(15, 28, 58, 0.05)`): KPI tiles, as a two-layer ambient shadow.
- **Hover lift** (`box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08)`): any card under the cursor.
- **Accent lift** (`box-shadow: 0 14px 30px color-mix(in srgb, var(--page-accent) 16%, transparent), 0 2px 6px rgba(15, 28, 58, 0.06)`): stat cards on hover, combined with `translateY(-3px)`.
- **Action throw** (`box-shadow: 0 4px 14px color-mix(in srgb, var(--brand-primary) 30%, transparent)`): gradient primary buttons.
- **Icon throw** (`box-shadow: 0 6px 18px color-mix(in srgb, var(--page-accent) 34%, transparent)`): the page-header icon tile.
- **Modal** (`box-shadow: 0 10px 24px rgba(15, 23, 42, 0.10)`): dialogs and popovers.

### Named Rules
**The Earned Lift Rule.** Things that can be pressed or opened rise on hover: stat cards by 3px, buttons by 1px, nav items by 2px toward the content. Things that cannot be pressed do not move. Every lift is cancelled under `prefers-reduced-motion`.

**The Tinted Shadow Rule.** Interactive shadows take the colour of what cast them (page accent, brand blue or danger red). Rest shadows stay a cool neutral navy and never go pure black in light mode.

## Shapes

Corners are rounded but firm. Controls use 8–10px, cards 16px and segmented tabs and pills are fully round. Borders are 1px hairlines in `border-default`. Accents attach as inset strips rather than outlines: the 4px leading bar on stat cards fades down the card's height, and the 3px lit edge on the active nav item has a rounded right side only. Map markers and status dots are circles.

The radius scale is sm 8px (inputs, small buttons), control 10px (selects, toolbar buttons), md 12px (icon tiles, inner panels), lg 16px (cards, stat tiles), xl 20px (modals, hero panels) and full (pills, mode tabs, toggles).

## Components

### Buttons
Confident, filled and pressable.
- **Shape:** gently rounded (10px).
- **Primary:** a 135° gradient from Expressway Blue to a 62% mix with Signal Violet, white 700-weight text, 8px × 14px padding, and the Action throw shadow. Hover lifts 1px and brightens 4%.
- **Muted:** a pale blue-grey fill with slate ink, for secondary actions that sit beside a primary.
- **Danger:** a 135° gradient from Danger red toward a deep wine, with a red-tinted throw.
- **Focus:** a 3px ring in the page accent at 22% alpha.
- **Disabled:** reduced opacity and no lift.

### Mode Tabs
- **Style:** a pill track on surface with a hairline border and a small shadow. Buttons sit inside at 8px × 16px, weight 600, in secondary ink.
- **Active:** a solid Expressway Blue fill with white 700-weight text. Hover on an inactive tab is a pale fill.

### Pills
- **Style:** fully round, 4px × 10px, 0.78rem at 700, a tinted background with ink from the same family (success, warning, danger, info, model purple).
- **Use:** status, confidence and model labels. A pill states a fact; it is never a button.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** surface, with a 1px `border-default` hairline.
- **Shadow Strategy:** Card rest, moving to Hover lift (see Elevation & Depth).
- **Internal Padding:** 16px.
- **Chart cards:** minimum height 280px. The header row holds a Title on the left and pills or controls on the right.

### Stat Cards (signature)
The KPI tile is the system's most recognisable element. It has a 16px radius, a 4px leading bar in `--page-accent` that fades to 35% down its height, and a radial accent wash thrown from the top-right corner. The label sits above in secondary 600 text, the Numeral below in ink, and an optional caption line follows. On hover it rises 3px under the Accent lift. Tiles sit four-up in a 14px-gap grid.

### Inputs / Fields
- **Style:** surface background, 1px hairline, 8px radius, 10px × 14px padding, 0.95rem text.
- **Selects:** native `<select>` with `appearance: none` and a drawn chevron in currentColor, 10px radius and 600-weight text. They stay native for keyboard and mobile pickers.
- **Focus:** the border turns the page accent and a 3px accent ring appears at 15–22% alpha.

### Navigation
- **Sidebar:** Night Corridor Navy gradient. Section kickers are uppercase, tracked at 0.14em and set at 55% opacity. Items are white-on-navy with an icon.
- **Hover:** a 6–8% white fill and a 2px nudge to the right.
- **Active:** a horizontal gradient of brand blue from 42% to 16% alpha, an inset 1px white highlight, a 3px lit bar on the left edge that scales in over 260ms, and an icon glow.
- **Mobile:** below 980px the sidebar is a fixed overlay drawer that slides in from the left.

### Page Header (signature)
A 38px icon tile filled with the page accent gradient (accent to a 62% mix with white), with white glyph and the Icon throw, beside a Headline title and a Caption subtitle. Actions align right. Setting `data-accent` on this element sets `--page-accent` for the page.

### Corridor Map
Mapbox light or dark base, dimmed by a scrim (`#f1f5f9` at 60% in light, `#070b14` at 55% in dark) so NLEX is the subject. The corridor is drawn as two carriageway ribbons on a casing, coloured only in the Three Words palette.

## Do's and Don'ts

### Do:
- **Do** read `--page-accent` (falling back to `--brand-primary`) for any domain colour on a card, tab, focus ring or row hover.
- **Do** use the gradient primary button with its tinted throw for the one main action in a region, and muted buttons for the rest.
- **Do** give anything clickable a hover response: lift, tinted shadow or fill. Cancel the motion under `prefers-reduced-motion`.
- **Do** colour road state only with the clear, slow, congested and no-data tokens from `lib/map-palette.ts`, the same values in every view.
- **Do** set KPI values in the Numeral role with tabular figures, and label them with the caption or title role, not with a second number.
- **Do** define any new colour as a token in both dark blocks of `globals.css`, then read it in ECharts through `useChartTheme()`.

### Don't:
- **Don't** hardcode a hex in a component rule. The pre-token borders (`#dce2ef`, `#e7ecf5`) and pill tints are drift to migrate, not precedent.
- **Don't** introduce a fourth congestion colour or shade within a band on the map.
- **Don't** use Toll Amber or Signal Violet as status colours or as flat fills.
- **Don't** add a new font size. Snap to the seven typography roles.
- **Don't** make a non-interactive surface lift or glow on hover.
- **Don't** pass `var(--…)` into an ECharts option, because ECharts cannot resolve it.
