---
target: whole dashboard (pre-redesign)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 10
target_identity: "file:C:\\Users\\Kiarra Jem Dela Cruz\\Downloads\\Capstone\\Front-and-back-Ver1-Merged-BE-FE\\Front-End-Dashboard\\app\\dashboard"
timestamp: 2026-10-03T15-31-06Z
slug: front-end-dashboard-app-dashboard
---
Method: dual-agent (A: isolated design review over 66 screenshots · B: isolated detector, 113 files plus overlays on 4 pages)

# Critique: whole dashboard (Front-End-Dashboard/app/dashboard), before redesign

## Design Health Score (app-wide)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Stale forecasts and maintenance read as current |
| 2 | Match system / real world | 3 | Km posts, NB/SB and plaza names are strong; walk-forward, WMAPE and Dirichlet are unexplained |
| 3 | User control and freedom | 2 | Status pills edit inline; red "Clear" sits beside Export; no undo |
| 4 | Consistency and standards | 1 | 4 KPI tile styles, about 20 button classes, about 12 segmented controls; nav labels differ from page titles |
| 5 | Error prevention | 2 | Pills that are secretly dropdowns; Clear-log next to Export; advisory at "KM. 1" |
| 6 | Recognition rather than recall | 2 | Unlabelled percentages; model names without meaning |
| 7 | Flexibility and efficiency | 1 | No shortcuts, saved views or deep links (except incident ?tab=) |
| 8 | Aesthetic and minimalist design | 1 | Decoration, hero banner, paragraphs inside cards, chip soup |
| 9 | Error recovery | 2 | Upload failures not explained inline |
| 10 | Help and documentation | 3 | Generous, honest tooltips and footnotes, but long |
| **Total** | | **19/40** | **Poor** |

## Deterministic evidence
- CLI: 34 findings (side-tab 25 with 4 false positives as tooltip arrows; layout-transition 6; overused-font 3). Static scan does not flag gradients or glass.
- Counts:
  - 133 distinct hard-coded hex colours in .tsx (880 uses; #64748b 89, #94a3b8 82, #4f46e5 74)
  - 63 distinct font sizes
  - 40 distinct radii
  - 104 distinct box-shadows
  - 73 gradients
  - 20 backdrop-filter
  - 14 emoji
- Browser findings: Overview 42, Incidents 34, Live Map 100 (40 toll-pin transitions and labels at 10px), Data Management 23 (status pills at 3.9–4.2:1). Repeated on every page: 10.56px nav labels, 2.6:1 avatar, header-icon glow, sidebar radial glow.

## Top 10 generic problems
1. Overview opens on a raster marketing banner (tagline, brain logo) with a live card colliding into the wordmark; the corridor sits below the fold. Ask before removing the banner.
2. Every analytics page is the same template recoloured (Incidents, Maintenance and Emissions import traffic.module.css).
3. The textbook AI KPI tile (fading bar, radial wash, icon square, 900 numerals, lift); 4 variants.
4. Decoration everywhere: 73 gradients, 20 glass blurs, 104 shadows, glowing nav, purple gradient map banners.
5. Colour sprawl (133 hex, Tailwind indigo default) and misuse (six selected colours in one panel, red for a neutral category, rainbow speed gradient).
6. Emoji dialog icons, sparkle tiles, Brain icon.
7. Data Management is a SaaS onboarding page; the ledger is buried.
8. Freshness is hidden in footnotes: Jul 2026 "next 14 days", Jul 1 booth plan, August maintenance shown as "now".
9. Predictive chip soup (up to 16 controls) and unlabelled model percentages; three tinted time bands.
10. Type: all Inter at 700–900, 63 sizes, inverted hierarchy, rotated truncated exit labels.

## Strengths to keep
Honesty content; corridor-native spatial language (km posts, NB/SB, lanes, per-plaza grid); a sound token and theme plumbing.

## Persona red flags
Alex: no URL state, saved views or shortcuts; truncations. Sam: no skip link; tabs lack role/aria-selected; colour-only selection; sub-0.68rem text; rotated labels. Night-shift operator: dark keeps light buttons; glass and washes add haze; stale figures; no alarm hierarchy.

## Data checks (not design)
Km 0–4, Km 1.63–11.73 and "KM. 1 Balintawak" sit outside Km 12–88.25 while Prescriptive puts Balintawak at Km 12.
