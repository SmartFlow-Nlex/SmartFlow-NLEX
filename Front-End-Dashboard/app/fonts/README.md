# Fonts

Self-hosted (see DESIGN.md), loaded by the `@font-face` rules at the top of `app/globals.css`.
Chosen on 6 Oct 2026 by setting candidates beside crops of the user's four Formula 1 references;
downloaded from Google Fonts; all SIL Open Font Licence 1.1.

| File | Family | Use | Source |
|---|---|---|---|
| `inter-var-latin.woff2` | Inter variable (weight 100–900, optical size 14–32), latin | headlines, interface and readouts | https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcviYwY.woff2 |
| `inter-var-latin-ext.woff2` | Inter variable, latin-ext | | https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcvsYwYL8g.woff2 |
| `saira-var-latin.woff2` | Saira variable (weight 100–900, width 50–125%), latin | brand moments (wordmarks, Overview hero), expanded | https://fonts.gstatic.com/s/saira/v23/memwYa2wxmKQyNknTZM.woff2 |
| `saira-var-latin-ext.woff2` | Saira variable, latin-ext | | https://fonts.gstatic.com/s/saira/v23/memwYa2wxmKQyNkpTZMtUw.woff2 |

Inter is drawn at 93% (`size-adjust`), so a line sets to the same length as the Outfit it replaced and
no layout moved. `next/font` is not used because it rejects the production `assetPrefix: './'` that the
Electron build needs. History: Italiana + Outfit (until 6 Oct 2026), then briefly Saira + JetBrains Mono,
then Space Mono for telemetry readouts until the NLEX daylight theme (7 Oct 2026) set them in Inter.
