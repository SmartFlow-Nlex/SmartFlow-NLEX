---
target: the Traffic page
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\Kiarra Jem Dela Cruz\\Downloads\\Capstone\\Front-and-back-Ver1-Merged-BE-FE\\Front-End-Dashboard\\app\\dashboard\\traffic\\page.tsx"
target_fingerprint: "sha256:7fa7df178f7f56430d60fc0b79720c59d8cc9cae05ed759e11fe5d80800bd0c5"
target_path: "C:\\Users\\Kiarra Jem Dela Cruz\\Downloads\\Capstone\\Front-and-back-Ver1-Merged-BE-FE\\Front-End-Dashboard\\app\\dashboard\\traffic\\page.tsx"
timestamp: 2026-10-03T14-24-35Z
slug: front-end-dashboard-app-dashboard-traffic-page-tsx
---
Method: dual-agent (A: isolated design-review agent · B: isolated detector + browser agent)

# Critique: Traffic page (Front-End-Dashboard/app/dashboard/traffic/page.tsx)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Booth plan and volume forecast show Jul 1–14 2026 as "next 7/14 days" on 3 Oct; "12 mo" silently ends 1 Jan 2026 |
| 2 | Match System / Real World | 2 | Km shown relative ("Balintawak • km 0") rather than NLEX posts (Km 12); "Entry volume · dayly" |
| 3 | User Control and Freedom | 2 | Detail/View-all modals ignore Escape and don't take focus; Direction is disabled until a toggle at the far end of the toolbar is switched |
| 4 | Consistency and Standards | 1 | Five vocabularies for road state; the 10.8 km/h jam speed is painted green; dark theme breaks on one tab |
| 5 | Error Prevention | 2 | Impossible granularities are disabled with a reason; the default 5-exit grid hides all four SEVERE exits |
| 6 | Recognition Rather Than Recall | 2 | Footnotes send you to other tabs; Prescriptive hides Range while the booth plan still depends on it |
| 7 | Flexibility and Efficiency | 2 | Tab, range and filters live only in useState, so nothing can be bookmarked; exits are added one at a time |
| 8 | Aesthetic and Minimalist Design | 2 | Descriptive is clean; the Predictive congestion card stacks about 9 chunks in a half-width column |
| 9 | Error Recovery | 1 | "is the backend running on port 4000?" (page.tsx:711) is developer copy shown to operators; stale data has no error state |
| 10 | Help and Documentation | 3 | Tooltips and methodology notes are excellent; two tooltips promise an hourly breakdown the modal doesn't show |
| **Total** | | **19/40** | **Poor** |

## Design Specificity Verdict

Assessment A: The Descriptive tab could belong to any analytics product. The corridor is never drawn; Volume by Plaza is sorted by size rather than km; trend dips go unannotated despite holiday/event data in the warehouse. The page feels built for NLEX in three places: the exit × hour congestion grid, the "What to act on" rows and the methodology copy. DESIGN.md promises a control room; this page is a card grid with a control room inside one card.

Deterministic scan: CLI found 4 side-tab hits: one real (PrescriptiveTrafficPanels.tsx:307, border-left 4px on rounded cards), one intentional (traffic.module.css:500 KPI bar) and two false positives (InfoTooltip.tsx:98-99 triangle arrow). components/maps was clean. Browser pass found 39/102/54 findings on Descriptive/Predictive/Prescriptive. Signal:
- undersized-ui-text and tiny-text: 9px SVG axes (PredictiveCongestionChart.tsx:334,340; PredictiveEventChart.tsx:135,146); about 10.5px labels.
- low-contrast: #94a3b8 on white at 2.6:1 (PredictiveCongestionChart.tsx:140,155,176); white-on-colour chips at 2.1–3.3:1; avatar at 2.6:1; active tab at 4.4:1.
- skipped-heading: h1 to h3 on every tab.
- line-length: Prescriptive intro paragraphs run about 200 characters per line.

False positives: dark-glow ×11 (canonical tinted shadows), sidebar spotlight and lit edge, overused-font (Inter is documented), ECharts tooltip border.

Overlay: injection succeeded; visible in the "[Human]" Chrome window.

## Overall Impression
The trust layer is the product's best asset, but stale forecasts presented as current, and the two forecast tabs contradicting each other, undermine it. The biggest opportunity is one current, consistent corridor story, then drawing the corridor.

## What's Working
1. Methodology copy: stating capacity gaps, the throughput slider as the only assumption, WMAPE/MASE chips.
2. "What to act on" rows: queue, distance to the toll plaza, window, probability.
3. Descriptive chart craft: click-to-inspect comparisons, minimum-anchored heatmap, ramp-key scrub, disabled granularities with reasons, pinned filters.

## Priority Issues

[P0] Stale forecasts and staffing plans presented as current
- What: on 3 Oct 2026 the booth plan shows "Wed, Jul 1 … next 7 days"; the volume forecast says "Next 14 days … to Jul 14" in success green; "12 mo" ends 1 Jan 2026 without saying so.
- Why: an operator could staff from a three-month-old plan. Breaks principles 1 and 3.
- Fix: compare as-of date and horizon with now; amber stale banner with the forecast's age; drop "next N days"; flag or block the prescriptive plan; add a "Data through" stamp; check the volume refresh.
- Command: /impeccable harden, then /impeccable clarify

[P1] The two forecast tabs contradict each other about the same exits
- What: Marilao 89% SEVERE on Predictive vs 55% PREPARE on Prescriptive; banner vs Add-exit "stays clear" (PredictiveCongestionChart.tsx:1645); default grid slice hides the SEVERE exits (line 980); five vocabularies; SEVERITY palette paints a jam speed green (page.tsx:133).
- Fix: one selector and threshold shared by both tabs; grid ranked by risk; Clear/Slow/Congested everywhere; Prescriptive quotes the same probability.
- Command: /impeccable clarify, then /impeccable layout

[P1] Dark theme unreadable on Predictive
- What: hard-coded #0f172a and light fills in PredictiveCongestionChart.tsx (around 921–2149) and PredictiveEventChart.tsx (322–588).
- Fix: use tokens; in ECharts options, read them through useChartTheme().
- Command: /impeccable harden

[P1] Text-size and contrast floor breached
- What: 9–10.5px text; slate-400 at 2.6:1; chips at 2.1:1; modals without focus or Escape; no aria-pressed; 1px browser focus ring; canvas charts without labels.
- Fix: snap to the type roles with a 0.7rem floor; --text-muted; dark ink on bright chips; modal focus and Escape handling; aria-pressed; 3px accent ring.
- Command: /impeccable typeset, then /impeccable audit

[P2] Insight leads nowhere; "Generate report" is the loudest button
- What: three gradient LLM buttons (NarrativePanel.tsx:152); episode rows without Live Map or advisory links; truncated delay.
- Fix: expandable rows with track record and "View on Live Map" / "Draft advisory" actions; demote "Generate report".
- Command: /impeccable shape, then /impeccable distill

## Persona Red Flags
Alex: no deep links; range resets on reload; one-at-a-time exit adds; tab flipping; no shortcuts.
Sam: modals without focus or Escape; unlabelled canvas charts; fill-only selection; 1px focus ring; clipped tooltip; red/green-only deltas; dark mode invisible.
TCC operator (Marilao advisory): not in the default grid; 89% vs 55%; relative km; truncated delay; "64.6%" unexplained; no advisory action; colliding hour labels.

## Minor Observations
- .spanHalf not reset under 980px (traffic.module.css:774): the 390px view scrolls 656px wide.
- "dayly" (page.tsx:577); tooltips at 978 and 1082 promise an hourly breakdown; 2-week vs 3-month copy (1027 vs 191).
- Emoji in modal headers; border-left at PrescriptiveTrafficPanels.tsx:307; cyan gradient Weather toggle.
- "+0.01" in a red pill; Holiday Impact title truncation and wrong legend; Event Surge empty area.
- Range contradiction on Prescriptive; Prophet default vs HoltWinters champion.
- Topbar clock louder than the data-freshness stamps; h1 to h3; intro paragraphs need max-width.
- DESIGN.md drift: the KPI bar is solid, not fading.

## Questions to Consider
- Why is the corridor never drawn? What if every chart indexed into a Km 12 → 88.25 strip?
- When a forecast is older than its horizon: amber, dark, or refuse to prescribe?
- Marilao tonight: 89% SEVERE or 55% PREPARE, and who owns the line between watch and act?
- Is an LLM paragraph more important to press than "draft advisory"?
