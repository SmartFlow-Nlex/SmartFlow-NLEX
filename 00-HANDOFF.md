# SmartFlow NLEX Mobile — Handoff (18 Oct 2026)

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
- **Commits:** named `Ysa-Commit-N` (the last one is **Ysa-Commit-8**, so next is **Ysa-Commit-9**), pushed **straight to `Main-Mobile`** on `github.com/SmartFlow-Nlex/SmartFlow-NLEX`. **Never create a new branch.** Teammates also push to `Main-Mobile`, so **always fetch first** and build on top of theirs.
- **"Make the server up":** start Metro from the **repo root**, then give the `exp://` address and a QR code (see §1). Check the phone can really load the bundle, not just the manifest.
- Never commit `.env` (it holds keys; it is in `.gitignore`).
- Use real data only — no mock traffic data, no fake posts.
- **Check mascot art properly before saying it is done:** every frame, on the dark *and* the light theme, and the motion (Ysa asked "did u check it on dark mode on and off, is it smooth"). White studio background left in the gaps beside the mirrors and cap is the usual flaw.
- **Ask before swapping one mascot animation for another** — "fix this animation" means fix it, not replace it.

### Design decisions from our chats (do not undo these)
| Decision | Why / when |
|---|---|
| **The assistant and mascot are called Navie** — Lex until 19 Oct. Every visible string, screen-reader label and model prompt says Navie; the prompt tells the model old chats may still say "Lex". Phone storage keys stay `smartflow.lex.*` (renaming them would lose saved chats and the language pick), except the pre-written next greeting, now `smartflow.navie.nextGreeting` so a stored "I'm Lex" welcome is never shown. | "change the name of the traffic assistance to Navie instead of Lex", 19 Oct. |
| **NLEX blue / navy / sky palette**, white glass cards, deep-blue sky behind a **white header** on every tab | Ysa's redesign spec, 7 Oct (5 mockups: Dashboard, Corridor, Community, Assistant, Alerts). |
| Every tab's background is the **team dashboard's own art** (`frontend/assets/scenes/expressway-{day,night}.jpg`, cropped from `Main-Dashboard:Front-End-Dashboard/public/{light,dark}_bg.png`, art by teammate Kiarra) framed per tab, with Skia icons on top (bell + radar, pins, chat bubbles, swooshes, a winding road with a light trail) | "copy the background… make it identical", 7 Oct. |
| Hero titles, Navie's position, header size and card positions were **measured from the mockups** on a 414 pt grid — each tab has its own title size (~31–43 pt) | "make it identical", 7 Oct. Numbers live in each screen's `<PageHero>` props. |
| Fonts: **Inter** for text, **Nunito Black** for titles/wordmark, gold **sparkle** after titles | Copied from the dashboard, 5 Oct. *Saira was tried and rejected* — Nunito Black was identified from Ysa's screenshot. |
| The dashboard's **"Night Corridor" colours were rejected** ("i don't like the colour", 5 Oct). The later blue palette was explicitly requested. | |
| **Navie is now the "N"-cap car from Ysa's own videos** (`Downloadsmascot`): the waving Navie in the hero of Dashboard, Community, Alerts and the Assistant (`WavingMascot.tsx`), and the hopping Navie as the loading indicator everywhere (`LoadingMascot.tsx`). The old still `mascot-car.png` is no longer shown. | Ysa supplied `waving.mp4` / `loading.mp4`, 11–13 Oct. The Assistant's `hello.mp4` greeting was re-cut twice and still looked glitchy (the video itself morphs), so Ysa chose the wave there too. |
| **No yellow sparkle strokes behind the mascot** in the tab backgrounds (the `Twinkle` motif was deleted from `SceneArt.tsx`). The gold sparkle after titles stays. | "remove the yellow lines behind the mascot in every tab", 12 Oct. |
| **The app always opens on Sign In** — a session left from the last run is ended, never resumed; "Remember me" now only keeps the email filled in. Side effect: every reload in Expo Go means signing in again. | "the user need to sign in first", 13 Oct. |
| Sign-in background is Ysa's **`sign in.png`** (Navie driving up the expressway). The picture is **slid down, not zoomed**, so Navie shows whole under the card; the strip above is the same sky mirrored. Drawn at 0.88 of screen-filling. No "Decision-Intelligence System" tagline. The card is compact (28 pt margins). | 13–14 Oct: "can u not zoom in too much", "zoom it out a little more", "make the glass card little smaller". |
| Dashboard has **no Corridor Outlook** (Today / This Week graph) | Removed at Ysa's request, 12 Oct. |
| **Exception — the floating assistant button** (bottom right) is the designer's "Cheerful Traffic Guide Car" (`frontend/assets/mascot-guide.png`, from Ysa's `Downloads\mascot` folder): the N-cap car with a "Check traffic along your route!" bubble, as in the Dashboard mockup | Ysa asked for it, 8 Oct. It is **fixed** at the bottom right (no longer draggable — Ysa's request) and stands on a Skia road drawn to the mockup's shape (a lane receding left behind the bubble, bending down toward the viewer under the car, two white edges). Size/position measured from the mockup in `AIAssistantFAB.tsx` (156 pt wide, 10 pt from the right, 14 pt above the tab bar). |
| On Community, Navie is **fully visible**, standing on the post card (the mockup tucks him behind it) | "the mascot is not seen here", 7 Oct. |
| **No art inside the Corridor road panel** (behind the two carriageways) — it stays plain white | "can u not put the background here", 7 Oct. |
| Settings gear (top right) replaced the avatar and opens Profile; the tab-bar peek mascot is retired; the Dashboard's "Heaviest right now" row opens Corridor; the Assistant shows the spec's four quick questions in one sideways row | Redesign, 7 Oct. |
| Alerts are **in-app only** (banner + badge), polled every minute — no push | Ysa's choice, 6 Oct. |

### Code map (the redesign)
- `frontend/components/ui/ScreenShell.tsx` — the frame every tab uses: scene behind a see-through header that frosts blue on scroll, white status bar while a tab is focused, scroll content in a 20 pt gutter, optional footer/keyboard handling (Assistant).
- `frontend/components/ui/PageHero.tsx` — title (+ optional `name` line for the greeting), subtitle, Navie. Per-tab props: `titleScale`, `offsetTop`, `mascotPlacement`, `mascotWidth`, `minHeight` (= where the next card starts).
- `frontend/components/ui/SceneArt.tsx` + `SceneBackground.tsx` — the backgrounds. `FRAMES` in SceneArt holds each tab's framing, clouds and icons; the art is decoded once (`useExpresswayArt`). Drawn vector scenes remain as the fallback while the art loads.
- `frontend/components/ui/Cards.tsx` (GlassCard, BlueStatusCard, StatusPill, MetricCard, SectionTitle, CountBadge), `SegmentedControl.tsx` (`tone="white"` on Community), `HeroMascot.tsx`.
- Theme: `frontend/theme/palette.ts` (all colours, light + dark), `frontend/theme/tokens.ts` (spacing, radii, shadows).
- Mascots: `AlphaVideo.tsx` (packed colour + alpha video through a Skia shader; `poster` shows the first frame until the video starts), `ui/WavingMascot.tsx` (two sizes; only the focused tab plays), `ui/LoadingMascot.tsx` (two sizes; system spinner under Reduce Motion).
- Assistant chat history: `lib/chatHistory.ts` (`useChatHistory` — past chats in AsyncStorage, one list per signed-in email, max 50) and `components/assistant/ChatHistory.tsx` (the History sheet + the rows reused as "Recent chats" on the empty chat).
- Assistant reply language: `backend/src/routes/assistant.ts` decides it in code (`replyLanguageFor`), and after the model answers `inReplyLanguage` checks the reply; a reply in the wrong language is rewritten once (`rewriteInLanguage`). The model ignored the prompt's language rules often enough that the check is needed.
- Live data on the Dashboard: `lib/corridorSummary.ts` (Current Status card, from the shared corridor feed + Alerts' incident list), `lib/routeForecast.ts` + `hooks/useRouteForecast.ts` (Traffic Forecast card, from the dashboard's model — the same feed as the Map tab's forecast).

### Repo traps (each one cost a debugging cycle)
1. **The router entry is root `app/`**, whose files re-export the real screens in `frontend/app/`. A new screen needs both. **Run Expo from the repo root** — `npm run frontend` / `npm run dev` start a stale second app.
2. **Never hardcode colours** or import `Colors`; use `useThemedStyles(makeStyles)` + palette tokens. `primary` is a brand *surface*, `accent` is brand *text/icons*, `textInverse` is text *on* a brand surface.
3. `frontend/constants/nlexSegments.ts` is the canonical 20-exit list (north→south). `nlexExits.ts` is an older, different list.
4. React Native 0.86: `StyleSheet.absoluteFillObject` is gone — use `...StyleSheet.absoluteFill`. The **root** `app.json` is the real config (`frontend/app.json` is stale); it must keep `"userInterfaceStyle": "automatic"` or dark mode breaks.
5. Two type-checks: `npx tsc --noEmit -p .` (what Expo uses, must be clean) and `npx tsc --noEmit -p frontend` (strict; two old unused-variable warnings are known — `worst`, `here`).
6. The mascot animations are alpha-packed H.264 videos recombined by a Skia shader (`AlphaVideo.tsx`, `MascotGreeting.tsx`, `MoodMascot.tsx`) — animated WebP stuttered on the iPhone.
7. **The dashboard's forecast times are Manila clock times sent with a "Z"** (a naive column on a UTC server): read literally, every forecast hour is 8 h late. `manilaInstant` in `frontend/lib/forecastApi.ts` corrects it — if forecast hours ever look 8 h off the other way, the dashboard fixed its side.
8. Visual checks without a phone: the scenes were rendered offline with Skia's headless build + `canvaskit-wasm` in Node (get `Skia` from `getSkiaExports()`, shim `vec`), then composed against the mockups with Python/PIL.

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
- All five tabs rebuilt on it and matched to Ysa's mockups by measurement: header (34 pt logo tile, 17 pt wordmark, 40 pt gear), per-tab title sizes and positions, Navie placements, switch heights and colours, card positions.
- Backgrounds: the dashboard's expressway art on every tab, framed per mockup, with Skia icons; night version in dark mode.
- Dashboard: "Good evening, *name*" with the sparkle after the name; status card no longer cuts off "Active Incidents" or wraps "NLEX Traffic".
- Community: Navie fully visible; switch, composer placeholder and post meta no longer cut off.
- Assistant: Navie raised, capability card tinted, four quick questions in one scrolling row, smaller input bar.
- Corridor: winding road + light trail in the hero, bigger SB / NB labels in the road panel.
- **Fix:** the Mobile Control Centre settings (`/api/mobile-config`) are now read from the dashboard directly. They were asked of our own backend, which has no such route, so every switch and advisory set in the dashboard was ignored.

### 8 Oct — dark mode fixed (after Ysa-Commit-4)
- **Root cause:** the root `app.json` had no `userInterfaceStyle`, and Expo's default is `light` — the app was locked to light, so **Profile → Dark Mode → System never followed the phone** into dark, and the keyboard/alerts stayed light. Now `"userInterfaceStyle": "automatic"`. (`frontend/app.json` says `"dark"` but is the stale copy — ignore it.)
- On / Off / System now also set the phone's appearance for the app (`Appearance.setColorScheme` in `frontend/theme/ThemeProvider.tsx`), so the keyboard, alerts and switches match the choice; System hands control back to the phone and follows it live.
- No more light-then-dark flash at launch: the app waits for the saved choice (`isReady`) before drawing.
- The interchange map uses Mapbox's dark style in dark mode; the picker says what each option does and which way System is right now.
- Dark-mode backgrounds showed the **daylight** art after switching from light: Skia's `useImage` keeps its last image for a render after its source changes, and the shared cache stored that day picture as the night one. Day and night now have one `useImage` each (`useExpresswayArt` in `SceneBackground.tsx`). At night the clouds are faint (`sceneCloudAlpha`) and the light accents glow soft blue (`sceneGlow`) instead of turning dark.
- Faster, more reliable switching: both the day and night art load as soon as the first tab opens, so switching is instant; and the phone's setting is tracked with an `Appearance` listener plus a re-read whenever the app returns to the front (iOS flips appearance while backgrounded for snapshots, so `useColorScheme` sometimes missed a change until a JS reload).
- An `app.json` change needs a full reload in Expo Go (close the project and reopen it), not just a refresh.

### 8 Oct — Sign In / Sign Up redesign
- Both screens sit on Ysa's artwork **"Cheerful NLEX Mascot City Drive"** (from `Downloads\mascot`): blue sky, clouds, soft skyline, a ground-level road and Navie peeking over the kerb — Navie is painted into the picture, so there is no separate mascot layer. Day: `frontend/assets/scenes/auth-day.jpg`; dark mode uses `auth-night.jpg`, the same picture graded to night (Navie kept bright).
- Shared frame: `frontend/components/auth/AuthScreen.tsx` (art scaled to cover and pinned to the bottom, logo + "SmartFlow NLEX" + "Decision-Intelligence System", white card, copyright; `useAuthMetrics` scales every size from the mockup measured over the art, with comfortable minimums). The form is placed to end above Navie's cap; on a short phone (iPhone SE) the page scrolls and the card passes in front of him. iOS keeps the focused field above the keyboard (`automaticallyAdjustKeyboardInsets`).
- The card is **frosted glass** (Ysa's second brief, same day): `expo-blur` BlurView (Apple's `systemUltraThinMaterial` on iOS; Android shows the tint without blur) under a white-to-sky tint (~75% opaque), a 1 pt edge that brightens along the top, a fine blue accent line, a drawn soft shadow and faint light halo, compact spacing (20 pt margins, 18–20 pt between rows). Tokens `authGlass*`, `authField*`, `authFocus*`, `authButton*` in `palette.ts`.
- `AuthField`: fields a little more solid than the glass (82% white), 18 pt corners, blue border + faint ring while focused. The button is a horizontal blue gradient with a soft blue shadow. Sign-in/up logic, remember-me, the forgot-password message and navigation are unchanged.
- **New package:** `expo-blur` (~57.0.3, in Expo Go). After pulling, run `npm install`.
- The blue gear in Ysa's mockup is Expo Go's developer button, not part of the app — there is no settings button on these screens.

### 8 Oct — Assistant's waving Navie re-cut
- `frontend/assets/mascot-hello.mp4` was rebuilt from the original cut-out frames: pale background blocks on the cap's sides (white in dark mode) and bites out of the cap's top (missing parts in light mode) are fixed, sparkle/floor crumbs along the lower outline removed, and the loop now runs frames 30–179 with a 3-frame blend (the old 8-frame cross-fade showed a see-through double car). Same 300×318 frames, 147 frames at 24 fps.
- In light mode Navie gets a faint edge shadow (`edgeColor` on `AlphaVideo`, palette `mascotEdge`) so the white cap doesn't melt into the pale sky.
- The working frames and scripts (`v24/combined`, `fix_hello.py`, ffmpeg) are on the old laptop's temp folder only — not in the repo.

### 9–14 Oct — Ysa-Commit-5 (live data, mascots, sign-in)
- **Dashboard → Current Status is live:** congestion pill, Avg Delay and "Heaviest right now" from the live corridor feed (the Corridor tab's own reading), Active Incidents from Waze accidents/hazards + Community incident reports. The ticking clock was replaced by the feed's real update time. Tapping "Heaviest right now" opens that interchange.
- **Dashboard → Traffic Forecast is live:** the team's model forecast for the chosen route and hour, per carriageway (the dashboard's side rule: a side counts at ≥40% of an exit's queue-hours). Shows chance of a queue, typical delay, travel time and where the likeliest queue is.
- **Forecast times fixed** for the Map tab too (§0 trap 7): its forecast had been showing each prediction 8 hours late.
- **Corridor Outlook removed** from the Dashboard (`OutlookStrip.tsx` deleted; the web Control Centre's switch for it now does nothing).
- **Mascots:** loading Navie replaces the spinners; waving Navie in the heroes (Assistant uses a larger copy); the small reply mascots in the Assistant were cleaned (white rim, studio-white patches). All mascot videos were checked frame by frame on dark and light.
- **Sign In / Sign Up:** always the first screen; new background; tagline removed; smaller card; "Remember me" keeps the email.
- **Tab backgrounds:** yellow sparkle strokes behind the mascot removed.

### 18 Oct — Ysa-Commit-6 (Assistant history, reply language)
- **Chat history** (Ysa: "the user can see the past convo like there is a history"): a clock button beside EN/TL opens past chats grouped Today / Yesterday / Previous 7 days / Older; tap one to reopen it and carry on (Navie gets its earlier messages). The empty chat lists the 3 latest under "Recent chats". The old trash button is now **New chat** — the chat on screen stays in the history. Each chat can be deleted (with a confirm), plus "Clear all chats". A day label shows where a reopened chat crosses into another day. Kept **on the phone only**, per account; not synced between phones (Supabase would be the way, if Ysa asks).
- A reply that lands after the user moved to another chat is saved to the chat it was asked in.
- **TL / EN switch fixed** ("i pick english first … when i switch to tagalog … it still answer english"): the app sent the choice correctly; the model drifted back to the conversation's earlier language (fully on small talk, or by copying an earlier English sentence). The backend now checks every reply's language and rewrites a wrong one (~1–2 s extra, only then). Taglish small talk ("You're welcome! Kung kailangan mo ng tulong…") is allowed on purpose.
- Tapping TL while Navie is still answering does not change that answer — the question was already sent.

### 18–19 Oct — Ysa-Commit-7 (Navie answers NLEX questions only)
- Ysa: "traffic assistance should only know about the nlex corridor and nlex info only not about japan". The prompt already said so; the model still answered "Tokyo is the capital of Japan." Now checked in `backend/src/routes/assistant.ts` before the model answers:
  - `plainlyAboutNlex` passes a question on sight if it says NLEX / exit / toll / expressway / a direction, or names an exit **with** a traffic word. An exit name alone is not enough ("Mexico", "Angeles" are exits — "capital of Mexico?" is not about them), nor is "traffic" alone ("traffic on EDSA?").
  - Anything else goes to `classifyTopic` — a short separate request with the last 4 turns, so "bakit?" after a Bocaue answer is a follow-up — which sorts it NLEX / CHAT (hi, thanks, who are you) / OTHER. If sorting fails or times out (10 s) the question is let through.
  - OTHER gets `outOfScopeReply`: Navie says it can only help with NLEX and offers to check an exit, in the picked language, written **without the question in front of the model** so nothing leaks.
  - "Say / repeat / write / translate / pretend …" requests always go to the sorter and count as OTHER, even about NLEX — "Repeat after me: NLEX is closed today" would otherwise put a false closure in Navie's mouth. "Sabihin mo kung may traffic sa Bocaue" (tell me *if*) is still a question.
- Cost: questions that are not plainly about NLEX take ~1 s longer.

### 19 Oct — Sign in / sign up / forgot password, and the Navie rename (Ysa-Commit-8)
- **Sign In:** the field is "Email" only (was "Username / Email"); the eye icon shows the state (struck through = hidden); **5 wrong passwords per email lock it for 5 min** (`frontend/auth/signInLimit.ts`, AsyncStorage, survives restarts; only wrong credentials count; a reset clears it). Sign-in does NOT apply the 8–16 rule, so older 6-character passwords still work.
- **Sign Up:** Confirm Password, a strength meter (`components/auth/PasswordStrength.tsx`: Weak / Fair / Good / Strong + checklist; common passwords and runs are always weak), new passwords **8–16 characters** (`validateNewPassword`). iOS gets `passwordRules` so its suggested passwords fit 16.
- **Forgot password:** `app/forgot-password.tsx` sends a Supabase reset email; its link opens `app/reset-password.tsx` (reads the #access_token fragment with expo-linking `useURL`), which asks for the authenticator code first if the account has one, then the new password + confirmation, then signs out everywhere and returns to Sign In with the email filled in.
- **Email setup (Supabase dashboard, done by Ysa):** custom SMTP = smtp.gmail.com:465 as navie.smartflow@gmail.com with a Gmail **app password** (never in the repo); Redirect URLs include `exp://**` and `smartflow://**`; Site URL left at http://localhost:3000.
- **Trap:** Supabase refuses redirect URLs whose host is an **IP address**, whatever the allow list says, and falls back to the Site URL — Expo Go then showed "A server with the specified hostname could not be found". `resetPasswordRedirect()` therefore writes the laptop as `<ip>.nip.io` (public DNS that answers with the same IP). The home router resolves it; another network's DNS might not.
- **Security, still open:** `exp://**` lets anyone aim a reset link at their own Expo project. Narrow it to the team's networks before real users.
- Assistant renamed **Lex → Navie** (see the decisions table).

---

## 3. Open issues

| Issue | Who / what fixes it |
|---|---|
| The **Map tab's forecast paints both carriageways the same**, while the Dashboard's Traffic Forecast counts a predicted queue only on the side the dashboard would draw it. The two can disagree for one direction. | Apply the same side rule in `ForecastCorridorView.tsx` if Ysa wants them to match (offered, not asked for yet). |
| The dashboard's forecast table is sometimes rewritten with **only 12 hours** (a teammate's older trainer), and for ~10 min after a run its cache mixes runs: +12h/+24h can say "no forecast". | Dashboard team (`train_congestion_horizon.py` checkouts). |
| Two small Assistant reply mascots (clear, alert) have a blended "ghost" frame near the end of their loop. | Re-loop them from the source videos if anyone notices. |
| Unused, kept for now: `MascotGreeting.tsx` + `mascot-hello.*` (the re-cut greeting), `HeroMascot.tsx` + `mascot-car.png`, and the old `trafficModel.ts` functions (only its `CongestionLevel` type is used). | Delete when sure nothing needs them. |
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
