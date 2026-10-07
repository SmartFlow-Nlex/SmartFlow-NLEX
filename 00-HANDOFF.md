# SmartFlow NLEX Mobile — Handoff (8 Oct 2026)

How to run the app on another laptop, what has been built, the decisions behind it, and what is still open.
The older guides (`00-START-HERE.md`, `README.md`, `QUICK_REFERENCE.md`) date from May 2026 and are out of date — use this one.

> **Starting Claude Code on a new laptop?** Open it in the repo root and say:
> *"Read 00-HANDOFF.md first — it has the context of the project and our previous chats."*
> Section 0 is written for Claude; sections 1–4 are for anyone.

---

## 0. Context for Claude Code (read this first)

### The project and the person
- **SmartFlow NLEX** is a student team project: traffic intelligence for the North Luzon Expressway (NLEX). This repo is the **mobile app for commuters/drivers** (not operators): Expo SDK 57, React Native 0.86 (new architecture), expo-router 57, TypeScript.
- The team's **web dashboard** ("the system") lives in the same GitHub repo on branch **`Main-Dashboard`**, deployed at `https://smartflow-nlex.onrender.com`. Our own backend (`backend/`, Express + the AI assistant) is deployed at `https://smartflow-backend-9t19.onrender.com`; Render builds it from **`Main-Mobile`**.
- The user is **Ysa** (git user `ysa_jabagat`). They write informally and short ("make the server up so i can open on expo go"); answer in plain words, not jargon. They test on an **iPhone (414 pt wide, iPhone 11-class)** with **Expo Go signed in as `daonliwannn`**.
- They work from **mockup screenshots** and expect the app to match them closely ("make it identical"), then send phone screenshots of what is wrong.

### How Ysa wants things done
- **Commits:** named `Ysa-Commit-N` (the last one is **Ysa-Commit-4**, so next is **Ysa-Commit-5**), pushed **straight to `Main-Mobile`** on `github.com/SmartFlow-Nlex/SmartFlow-NLEX`. **Never create a new branch.** Teammates also push to `Main-Mobile`, so **always fetch first** and build on top of theirs.
- **"Make the server up":** start Metro from the **repo root**, then give the `exp://` address and a QR code (see §1). Check the phone can really load the bundle, not just the manifest.
- Never commit `.env` (it holds keys; it is in `.gitignore`).
- Use real data only — no mock traffic data, no fake posts.

### Design decisions from our chats (do not undo these)
| Decision | Why / when |
|---|---|
| **NLEX blue / navy / sky palette**, white glass cards, deep-blue sky behind a **white header** on every tab | Ysa's redesign spec, 7 Oct (5 mockups: Dashboard, Corridor, Community, Assistant, Alerts). |
| Every tab's background is the **team dashboard's own art** (`frontend/assets/scenes/expressway-{day,night}.jpg`, cropped from `Main-Dashboard:Front-End-Dashboard/public/{light,dark}_bg.png`, art by teammate Kiarra) framed per tab, with Skia icons on top (bell + radar, pins, chat bubbles, swooshes, a winding road with a light trail) | "copy the background… make it identical", 7 Oct. |
| Hero titles, Lex's position, header size and card positions were **measured from the mockups** on a 414 pt grid — each tab has its own title size (~31–43 pt) | "make it identical", 7 Oct. Numbers live in each screen's `<PageHero>` props. |
| Fonts: **Inter** for text, **Nunito Black** for titles/wordmark, gold **sparkle** after titles | Copied from the dashboard, 5 Oct. *Saira was tried and rejected* — Nunito Black was identified from Ysa's screenshot. |
| The dashboard's **"Night Corridor" colours were rejected** ("i don't like the colour", 5 Oct). The later blue palette was explicitly requested. | |
| **Lex stays the app's own mascot** (`mascot-car.png`, the "NLEX"-cap car), even though the mockups show the dashboard's "N"-cap mascot | Ysa said early on: copy the dashboard's design/font, *not its mascot*. Ask before switching. |
| On Community, Lex is **fully visible**, standing on the post card (the mockup tucks him behind it) | "the mascot is not seen here", 7 Oct. |
| **No art inside the Corridor road panel** (behind the two carriageways) — it stays plain white | "can u not put the background here", 7 Oct. |
| Settings gear (top right) replaced the avatar and opens Profile; the tab-bar peek mascot is retired; the Dashboard's "Heaviest right now" row opens Corridor; the Assistant shows the spec's four quick questions in one sideways row | Redesign, 7 Oct. |
| Alerts are **in-app only** (banner + badge), polled every minute — no push | Ysa's choice, 6 Oct. |

### Code map (the redesign)
- `frontend/components/ui/ScreenShell.tsx` — the frame every tab uses: scene behind a see-through header that frosts blue on scroll, white status bar while a tab is focused, scroll content in a 20 pt gutter, optional footer/keyboard handling (Assistant).
- `frontend/components/ui/PageHero.tsx` — title (+ optional `name` line for the greeting), subtitle, Lex. Per-tab props: `titleScale`, `offsetTop`, `mascotPlacement`, `mascotWidth`, `minHeight` (= where the next card starts).
- `frontend/components/ui/SceneArt.tsx` + `SceneBackground.tsx` — the backgrounds. `FRAMES` in SceneArt holds each tab's framing, clouds and icons; the art is decoded once (`useExpresswayArt`). Drawn vector scenes remain as the fallback while the art loads.
- `frontend/components/ui/Cards.tsx` (GlassCard, BlueStatusCard, StatusPill, MetricCard, SectionTitle, CountBadge), `SegmentedControl.tsx` (`tone="white"` on Community), `HeroMascot.tsx`.
- Theme: `frontend/theme/palette.ts` (all colours, light + dark), `frontend/theme/tokens.ts` (spacing, radii, shadows).

### Repo traps (each one cost a debugging cycle)
1. **The router entry is root `app/`**, whose files re-export the real screens in `frontend/app/`. A new screen needs both. **Run Expo from the repo root** — `npm run frontend` / `npm run dev` start a stale second app.
2. **Never hardcode colours** or import `Colors`; use `useThemedStyles(makeStyles)` + palette tokens. `primary` is a brand *surface*, `accent` is brand *text/icons*, `textInverse` is text *on* a brand surface.
3. `frontend/constants/nlexSegments.ts` is the canonical 20-exit list (north→south). `nlexExits.ts` is an older, different list.
4. React Native 0.86: `StyleSheet.absoluteFillObject` is gone — use `...StyleSheet.absoluteFill`.
5. Two type-checks: `npx tsc --noEmit -p .` (what Expo uses, must be clean) and `npx tsc --noEmit -p frontend` (strict; two old unused-variable warnings are known — `worst`, `here`).
6. The mascot animations are alpha-packed H.264 videos recombined by a Skia shader (`AlphaVideo.tsx`, `MascotGreeting.tsx`, `MoodMascot.tsx`) — animated WebP stuttered on the iPhone.
7. Visual checks without a phone: the scenes were rendered offline with Skia's headless build + `canvaskit-wasm` in Node (get `Skia` from `getSkiaExports()`, shim `vec`), then composed against the mockups with Python/PIL.

### Servers and networks (non-obvious)
- **Render free tier sleeps after ~15 min.** First request takes 20–45 s. Our backend **cannot** wake the dashboard (it gets HTTP 429); a request from the phone does — the app pings it.
- **Home network** (laptop on Ethernet, `192.168.2.196`): use **LAN** mode (§1). **Phone hotspot / campus Wi-Fi:** use `--tunnel`.
- An Expo tunnel can be **too slow to carry the 12 MB bundle** (ran at ~9 KB/s on 7 Oct): Expo Go then shows *"Could not connect to development server"* even though the manifest loaded. Test the whole bundle through the tunnel, or use LAN.
- The home ISP (PLDT) once blocked Render on port 443; it has worked since 28 Sep. Test with a long timeout before blaming the network.
- A **blue gear floating at the top right** in screenshots is Expo Go's own developer button, not the app's.

---

## 1. Run it on a new laptop

### Before you start
- **Node 22** and Git.
- **Expo Go** on the phone, updated for **SDK 57**, signed in to the **same Expo account as the laptop** (see below).
- **The `.env` file.** It is not in Git (it holds keys). Copy it from the old laptop's repo root, privately — not through the repo. It must define:

  | Variable | What it is |
  |---|---|
  | `EXPO_PUBLIC_BACKEND_API_URL` | Our backend on Render (assistant) |
  | `EXPO_PUBLIC_CORRIDOR_API_URL` | Same backend (live corridor feed) |
  | `EXPO_PUBLIC_API_HOST` | Old LAN fallback (only the Profile screen's unused local server reads it) |
  | `EXPO_PUBLIC_MAPBOX_TOKEN` | Map |
  | `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Sign-in and Community |

  The dashboard's address (`https://smartflow-nlex.onrender.com`) is built in; `EXPO_PUBLIC_TRAFFIC_SOURCE_URL` overrides it.

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
If the laptop has both Wi-Fi and Ethernet, pin the hostname to the one that is actually connected.

**Campus Wi-Fi or phone hotspot** (LAN usually blocked):
```powershell
Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
npx expo start --tunnel
```
If Expo Go says "Could not connect to development server" after the tunnel came up, the tunnel is too slow — retry later or switch networks.

**After `git pull` brings new packages:** run `npm install`, then start with `--clear`. Metro does not notice newly installed packages and fails with "Unable to resolve module" until restarted.

### Expo Go must match the laptop's Expo account
Expo Go refuses the project unless its sign-in matches the CLI's **exactly** (signed out counts as different).
- Check the laptop: `npx expo whoami` (log in with `npx expo login`; Ysa's phone uses **daonliwannn**). Never `npx expo logout`.
- A phone signed in to a different Expo account can use a second, signed-out server:
  ```powershell
  New-Item -ItemType Directory -Force "$env:TEMP\expo-anon" | Out-Null
  $env:__UNSAFE_EXPO_HOME_DIRECTORY = "$env:TEMP\expo-anon"
  npx expo start --lan --port 8082
  ```
  Clear that variable before starting the normal signed-in server again.

### The first load can take ~30–70 s
The dashboard and our backend sleep after 15 minutes on Render's free tier. Screens show a loading state meanwhile — pull down to refresh if one gave up.

---

## 2. Progress

### Up to 6 Oct — Ysa-Commit-2 and -3 (real data, fonts)
All data comes from the **team dashboard** or Supabase; sample/placeholder data was removed.
- **Dashboard → Event Forecasts**: the dashboard's event-surge model for the Philippine Arena schedule (date, exits expected ≥20% busier, vehicles vs a normal day, capacity). Source `GET /api/traffic/forecast` → `upcomingEvents`. Code `frontend/lib/insightsApi.ts`, `frontend/hooks/useDashboardInsights.ts`.
- **Dashboard → ML Hotspots**: the dashboard's Spatial LSTM incident forecast (exits above the corridor average). Source `GET /api/incident/spatial` → `segmentRisk`.
- **Alerts → Maintenance**: notices created on the dashboard's Maintenance page. Source `GET /api/maintenance/list` (+ `/api/map-comparison/exits` for names). Code `frontend/lib/maintenanceApi.ts`.
- **Alerts → Smart Alerts**: Waze accidents/hazards/police — the same list as the dashboard Live Map's "Current alerts" (verified report-for-report) — plus Community incident reports by *other* users from the last 3 hours. In-app **banner** for new reports (`frontend/alerts/AlertBanner.tsx`). Re-read every minute and when the tab opens (`frontend/hooks/usePolledList.ts`). Testing the banner needs two phones on two SmartFlow accounts.
- **Fonts**: Inter + Nunito Black + gold sparkle (`frontend/theme/fonts.ts`, `TitleSparkle.tsx`).

### 7–8 Oct — Ysa-Commit-4 (full visual redesign)
- New design system (§0 code map): `ScreenShell`, `PageHero`, glass cards, blue status cards, segmented switches, NLEX-blue palette (light + dark).
- All five tabs rebuilt on it and matched to Ysa's mockups by measurement: header (34 pt logo tile, 17 pt wordmark, 40 pt gear), per-tab title sizes and positions, Lex placements, switch heights and colours, card positions.
- Backgrounds: the dashboard's expressway art on every tab, framed per mockup, with Skia icons; night version in dark mode.
- Dashboard: "Good evening, *name*" with the sparkle after the name; status card no longer cuts off "Active Incidents" or wraps "NLEX Traffic".
- Community: Lex fully visible; switch, composer placeholder and post meta no longer cut off.
- Assistant: Lex raised, capability card tinted, four quick questions in one scrolling row, smaller input bar.
- Corridor: winding road + light trail in the hero, bigger SB / NB labels in the road panel.
- **Fix:** the Mobile Control Centre settings (`/api/mobile-config`) are now read from the dashboard directly. They were asked of our own backend, which has no such route, so every switch and advisory set in the dashboard was ignored.

---

## 3. Open issues

| Issue | Who / what fixes it |
|---|---|
| **Not yet seen on the phone after the last pass:** Dashboard, Alerts and Assistant (Community and Corridor were checked by screenshot). | Ask Ysa for screenshots of all five tabs and fine-tune against the mockups. |
| **ML Hotspots forecast still covers Jul 1–28**, not today (checked 8 Oct): the dashboard's incident data ends 30 Jun 2026. | Teammate: upload newer NLEX accident + breakdown logs on the dashboard's upload page, then retrain (`python weekly_retrain.py --only incident_spatial`, or the Sunday 22:00 run). The app updates by itself. |
| **Profile shows "Loading profile…" then an error** under the name: `useUserProfile` calls an old local community server (`EXPO_PUBLIC_API_HOST:3000`) that does not exist. The name still shows. | Point it at Supabase or drop the request. Predates the redesign. |
| **Southbound maintenance notices likely fail to save on the dashboard**: its form makes the end km lower than the start; its API rejects that. | Dashboard team. |
| Maintenance rows saved before 3 Oct use the old km scale. Only affects expired rows. | Nothing needed unless reused. |
| `frontend/lib/nlexReportCorridor.json` is the dashboard's corridor line (from `Main-Dashboard @3d148af`), used to match its Current-alerts list. | Regenerate if the dashboard's road geometry or exit list changes. |
| Waze sends `delay_seconds: -1` for "not measurable"; the backend counts it as a real number. | Backend fix. |
| Read/unread on the Alerts tab resets when the app restarts. | Small change if wanted (store read ids). |
| Unused after the redesign, kept for now: `PageHeading.tsx`, `AvatarButton.tsx`, `TabPeekMascot.tsx`. | Delete when sure nothing needs them. |
| Expo has a patch update (57.0.19 → 57.0.27) not yet applied. | `npx expo install --check` when convenient. |
| Two old TypeScript warnings in the strict check (`worst`, `here`). | Unused variables; harmless. |

---

## 4. Before you push
- `git fetch` first — teammates push to `Main-Mobile` too. Build on their latest commit; never force-push.
- Include **new files** (check `git status` for untracked ones — new screens, assets and components are easy to miss, and the app will not build on another laptop without them).
- Run both type-checks (§0, trap 5).
- **Never commit `.env`.**
- Commit as `Ysa-Commit-N`, push to `Main-Mobile`.
