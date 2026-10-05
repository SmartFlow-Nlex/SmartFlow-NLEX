# Fonts

Self-hosted for the Night Corridor design (see DESIGN.md), loaded by the `@font-face` rules at the top of
`app/globals.css`. Downloaded from Google Fonts on 5 Oct 2026; both families are licensed under the SIL Open
Font Licence 1.1.

| File | Family | Source |
|---|---|---|
| `italiana-400-latin.woff2` | Italiana 400, latin | https://fonts.gstatic.com/s/italiana/v21/QldNNTtLsx4E__B0XQmWaXw.woff2 |
| `outfit-var-latin.woff2` | Outfit variable (100–900), latin | https://fonts.gstatic.com/s/outfit/v15/QGYvz_MVcBeNP4NJtEtq.woff2 |
| `outfit-var-latin-ext.woff2` | Outfit variable (100–900), latin-ext | https://fonts.gstatic.com/s/outfit/v15/QGYvz_MVcBeNP4NJuktqQ4E.woff2 |

`next/font` is not used because it rejects the production `assetPrefix: './'` that the Electron build needs.
