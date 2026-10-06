# SmartFlow NLEX Mobile — Handoff (6 Oct 2026)

How to run the app on another laptop, what changed this week, and what is still open.
The older guides (`00-START-HERE.md`, `README.md`, `QUICK_REFERENCE.md`) date from May 2026 and are out of date — use this one.

---

## 1. Run it on a new laptop

### Before you start
- **Node 22** (this laptop runs 22.15) and Git.
- **Expo Go** on the phone, updated to support **SDK 57**.
- **The `.env` file.** It is not in Git (it holds keys). Copy it from this laptop's repo root, privately — not through the repo. It must define:

  | Variable | What it is |
  |---|---|
  | `EXPO_PUBLIC_BACKEND_API_URL` | Our backend on Render (chatbot) |
  | `EXPO_PUBLIC_CORRIDOR_API_URL` | Same backend (corridor/map feed) |
  | `EXPO_PUBLIC_API_HOST` | LAN fallback host |
  | `EXPO_PUBLIC_MAPBOX_TOKEN` | Map |
  | `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Sign-in and Community |

### Get the code
```powershell
git clone https://github.com/SmartFlow-Nlex/SmartFlow-NLEX.git
cd SmartFlow-NLEX
git checkout Main-Mobile
# put the .env file in this folder (the repo root)
npm install
```

### Start the server — always from the repo ROOT
> Do **not** use `npm run frontend` / `npm run dev`: they start an old, separate copy of the app in `frontend/`.

**Home Wi-Fi / Ethernet (phone on the same router):**
```powershell
ipconfig                                   # note the laptop's IPv4, e.g. 192.168.2.196
$env:REACT_NATIVE_PACKAGER_HOSTNAME = '192.168.x.x'
npx expo start --lan --port 8081
```
Then in Expo Go: scan the QR code, or "Enter URL manually" → `exp://192.168.x.x:8081`.

**Campus Wi-Fi or phone hotspot** (LAN usually blocked):
```powershell
Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
npx expo start --tunnel
```

**After `git pull` brings new packages:** run `npm install`, then start with `--clear` (`npx expo start --lan --port 8081 --clear`). Metro does not notice newly installed packages and fails with "Unable to resolve module" until restarted.

### Expo Go must match the laptop's Expo account
Expo Go refuses the project unless its sign-in matches the CLI's **exactly** (signed out counts as different).
- Check the laptop: `npx expo whoami` (log in with `npx expo login`; this laptop uses **daonliwannn**).
- A phone signed in to a different Expo account can use a second, signed-out server:
  ```powershell
  New-Item -ItemType Directory -Force "$env:TEMP\expo-anon" | Out-Null
  $env:__UNSAFE_EXPO_HOME_DIRECTORY = "$env:TEMP\expo-anon"
  npx expo start --lan --port 8082
  ```
  Clear that variable before starting the normal signed-in server again.

### The first load can take ~30–70 s
The team dashboard and our backend are on Render's free tier and **sleep after 15 minutes**. The first request wakes them; after that everything answers in under a second. Screens show a loading state meanwhile — pull down to refresh if one gave up.

---

## 2. What changed this week

All data below comes from the **team dashboard** (`https://smartflow-nlex.onrender.com`, repo `SmartFlow-NLEX`, branch `Main-Dashboard`) or Supabase. Sample/placeholder data was removed — nothing on these screens is made up any more.

### Dashboard tab — Event Forecasts & ML Hotspots (real data)
- **Event Forecasts**: the dashboard's event-surge model for the Philippine Arena schedule (13 event days, Nov 2026 – Dec 2027): date, exits expected ≥20% busier (e.g. CDV/Ph. Arena +66%), vehicles vs a normal day, venue capacity. Also adds event load to the route forecast on event days.
  Source: `GET /api/traffic/forecast` → `upcomingEvents`.
- **ML Hotspots**: the dashboard's Spatial LSTM incident forecast; exits above the corridor average, with predicted incidents/day and incidents on record.
  Source: `GET /api/incident/spatial` → `segmentRisk`.
- Code: `frontend/lib/insightsApi.ts`, `frontend/hooks/useDashboardInsights.ts`, cards in `frontend/components/dashboard/`.

### Alerts tab — Maintenance (real data)
- Notices an operator creates on the dashboard's Maintenance page appear under **Alerts → Maintenance** (scheduled or in progress, not yet ended), with place, km, direction, lane closure and time window.
- Source: `GET /api/maintenance/list`; place names from `GET /api/map-comparison/exits`.
- Code: `frontend/lib/maintenanceApi.ts`.

### Alerts tab — Smart Alerts (real data) + in-app banner
- **Waze reports**: accidents, hazards and police on NLEX — the same reports as the dashboard Live Map's **Current alerts** list (verified report-for-report), minus road closures and construction (those come in as maintenance). A report leaves the list when Waze drops it.
  Source: `GET /api/map-comparison/live-overview` → `alerts`. Code: `frontend/lib/roadReportsApi.ts`.
- **Community incident reports** by *other* users from the last 3 hours (Supabase `community_posts`, `kind = 'incident'`). Code: `fetchCommunityIncidentAlerts` in `frontend/lib/communityApi.ts`.
- **Banner**: a new report after the app has loaded drops a banner over any screen; tap → Alerts. Code: `frontend/alerts/AlertBanner.tsx`.
- Everything on the Alerts tab is re-read **every minute** and **immediately when the tab is opened** (`frontend/hooks/usePolledList.ts`).
- **To test the banner** you need two phones signed in to two different SmartFlow accounts: post an incident in Community on one, keep the other open — it shows the banner within a minute. You are never alerted about your own report.

### Look — fonts copied from the dashboard (colours unchanged)
- **Inter** for all text; **Nunito Black** for the wordmark, page titles and the Dashboard greeting, with the dashboard's gold **sparkle** next to titles.
- Code: `frontend/theme/fonts.ts` (applied automatically through `useThemedStyles`), `frontend/components/TitleSparkle.tsx`.
- New packages: `@expo-google-fonts/inter`, `@expo-google-fonts/nunito`.
- The dashboard's colour palette was tried and **rejected** — the app keeps its navy palette.

---

## 3. Open issues

| Issue | Who / what fixes it |
|---|---|
| **ML Hotspots forecast covers Jul 1–28**, not today: the dashboard's incident data ends 30 Jun 2026. | Teammate: upload newer NLEX accident + breakdown logs on the dashboard's upload page, then retrain (`python weekly_retrain.py --only incident_spatial`, or wait for the Sunday 22:00 run). The app updates by itself. |
| **Mobile Control Centre switches and advisories don't reach the app.** The app asks our backend for `/api/mobile-config`, which returns 404, so the app falls back to "everything on". | Our backend: add a route that passes the dashboard's `/api/mobile-config` through, then redeploy (Render builds it from `SmartFlow-NLEX` → `Main-Mobile`). |
| **Southbound maintenance notices likely fail to save on the dashboard**: its form makes the end km lower than the start, its API rejects that. | Dashboard team. |
| Maintenance rows saved before 3 Oct use the old km scale (distance from Balintawak, not km posts). Only affects expired rows. | Nothing needed unless they are reused. |
| `frontend/lib/nlexReportCorridor.json` is the dashboard's corridor line (generated from `Main-Dashboard @3d148af`) used to match its Current-alerts list. | Regenerate if the dashboard's road geometry or exit list changes: run its `corridorGuard(nlex-geometry.json, FALLBACK_EXITS).centreline` and save it here. |
| Read/unread on the Alerts tab resets when the app restarts. | Small change if wanted (store read ids). |
| Two old TypeScript warnings (`worst` in `app/corridor/[exitId].tsx`, `here` in `lib/corridorGeometry.ts`). | Unused variables; harmless. |

---

## 4. Before you push
- **Include the new files** (they are untracked): `frontend/alerts/AlertBanner.tsx`, `frontend/alerts/tone.ts`, `frontend/components/TitleSparkle.tsx`, `frontend/hooks/useDashboardInsights.ts`, `frontend/hooks/useMaintenanceNotices.ts`, `frontend/hooks/usePolledList.ts`, `frontend/lib/forecastApi.ts`, `frontend/lib/insightsApi.ts`, `frontend/lib/maintenanceApi.ts`, `frontend/lib/roadReportsApi.ts`, `frontend/lib/nlexReportCorridor.json`, `frontend/theme/fonts.ts` — and this file.
- **Include the deletion** of `frontend/constants/dashboardData.ts` (the old sample data).
- Other untracked files are from earlier mascot work — `frontend/assets/mascot-*` (videos/images), `frontend/components/AlphaVideo.tsx`, `MascotGreeting.tsx`, `MoodMascot.tsx`, `TabPeekMascot.tsx`, and `scripts/`. Modified screens already use them, so the app will not build on the other laptop without them: include them.
- **Never commit `.env`** (it is in `.gitignore`).
- `package.json` / `package-lock.json` changed (font packages) — commit both.
