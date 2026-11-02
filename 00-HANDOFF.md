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
- **Commits:** named `Ysa-Commit-N` (the last one is **Ysa-Commit-11**, so next is **Ysa-Commit-12**), pushed **straight to `Main-Mobile`** on `github.com/SmartFlow-Nlex/SmartFlow-NLEX`. **Never create a new branch.** Teammates also push to `Main-Mobile`, so **always fetch first** and build on top of theirs.
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
| **The app opens on Sign In unless "Remember me for 7 days" was ticked** — without it, a session left from the last run is ended, never resumed. With it (28 Oct), a session that passed BOTH steps (password + authenticator code) is resumed for 7 days on that phone, no password or code; Log Out, a password reset, or day 7 ends it (`frontend/auth/AuthProvider.tsx`, key `authRememberUntil`). | "the user need to sign in first", 13 Oct; "Remember me for 7 days ... so they don't have to put the code again and again", 28 Oct. |
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

### 20 Oct — Ysa-Commit-9 (reset link fixes)
- **The reset screen said "Open the reset link…" although it had been opened from the link.** Expo's `Linking.useURL()` only returns the URL the app was *launched* with plus later events; with the app already open, the link's event fired before the reset screen mounted. `frontend/auth/recoveryLink.ts` now catches reset links app-wide from startup (`useRecoveryUrl`).
- "Error sending recovery email" from Supabase now reads as a plain sentence in the app.
- **Where Supabase says why an email failed:** Logs → **Auth** (the API Gateway log only shows the 500). On 20 Oct it was Gmail `534 5.7.14 … Please log in via your web browser` — Google blocking a new server, fixed by approving the security alert and https://accounts.google.com/DisplayUnlockCaptcha. Not the HTML template.
- The reset email template is Ysa's own HTML (Supabase → Authentication → Emails → Reset Password). Its mascot image must use the public URL `https://jzkghkoaojdkusbjttgw.supabase.co/storage/v1/object/public/Mascot/navie-email.png`, not a dashboard link.
- On campus Wi-Fi the Expo server runs as a tunnel (~100 KB/s, ~2 min per app load); tunnel addresses are names, so reset links work there without nip.io.

### 21 Oct — Ysa-Commit-10 (one name and email everywhere)
- Ysa: check that Settings' profile name and email never mismatch, for every account. They could: Settings read them from `/api/users/current` on an old local server (`EXPO_PUBLIC_API_HOST:3000`) whose backend route is a **mock** answering "NLEX Traveler / user1@example.com" to everyone — it only showed the right person when unreachable (with an error under the name), and Edit Profile "saved" to the same mock.
- Now the signed-in Supabase user is the only source: Settings reads `session.fullName` / `session.email`; Edit Profile saves through `updateFullName` → `supabase.auth.updateUser({ data: { full_name } })`, and the greeting, Navie, Community and Settings change together. `frontend/hooks/useUserProfile.ts` is deleted. Community posts use `nameForUser` too (an account with no name saved posted as "bela.jabagat" while its profile said "Bela Jabagat").
- Still the case: old Community posts keep the name they were posted with, and the profile **photo** is not stored anywhere (it lasts while Settings is open). The backend's mock `/api/users` route still exists but nothing calls it.

### 22–23 Oct — Navie answers about every screen; profile and sign-in touches
- Ysa: Navie "should answer all other features that is in our mobile like in the dashboard, in the community, in the maintenance and all other in the alerts and the traffic also on the map". New tools in `backend/src/routes/assistant.ts` (names in `shared/types` `ASSISTANT_TOOLS`, labels in `frontend/lib/assistantApi.ts`): `get_road_reports` (Waze alerts), `get_maintenance`, `get_community_posts`, `get_event_forecasts`, `get_incident_hotspots`, `get_traffic_forecast` (a later hour). The prompt has an APP GUIDE for how-to questions and the current Manila time.
- **One set of rules for app and Navie:** the reading code of forecastApi / maintenanceApi / insightsApi / roadReportsApi moved into `frontend/lib/feeds/*.ts` (no React Native, no network), and the backend imports those plus `routeForecast.ts` and `constants/nlexSegments.ts` directly (backend tsconfig rootDir is the repo root, so `npm run build` emits them into `backend/dist/frontend/...`). Checked old vs new on live data: identical. **Keep those files free of React Native imports** or the backend build breaks.
- **Community needs two Render env vars:** `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the app's EXPO_PUBLIC_SUPABASE_* values; `render.yaml` lists them as sync:false). Posts are readable by signed-in users only, so the app sends the user's own Supabase token with each question and the backend reads with it. Without the vars Navie says it cannot see Community posts.
- Traps found while testing: the model passed "NLEX" as an exit and the matcher folded it into "NLEX Harbor Link" (fixed: `WHOLE_ROAD` words are never an exit); it answered "how about at 8 pm?" from its last reply (fixed: a time word with no lookup is sent back to `get_traffic_forecast`, not for small talk); it translated "Fri" as "Lunes" (fixed: tool dates carry no weekday). Each tool result starts with a one-line `fact` the model phrases - given only lists, it once said "walang ginagawa" over seven maintenance notices.
- **No trip planning (24 Oct, Ysa: "navie should not suggest when to leave and give an arrival time, our mobile should not do that!"):** a `get_trip_forecast` tool was built and then removed the same day. Navie gives no travel times, arrival times or departure advice; asked, it says the app does not give them and offers to check the traffic at the exits named (rule 3b in the prompt). `TRIP_WORDS` stops the time send-back from forcing a forecast lookup on such questions. Manila / QC = Balintawak, Clark = Dau, Philippine Arena = CDV / Ph. Arena (`PLACE_EXITS` in appData.ts, and in rule 3b). The Dashboard Traffic Forecast card still shows a forecast travel time - ask Ysa before changing it.
- "Say these words" orders ("repeat after me", "sabihin mo na...", "ulitin mo", "reply with exactly") are declined in code (`isSayThisOrder`) - the sorter let one through now and then.
- Also: Edit Profile has no Username box any more (email only); the sign-in wordmark is a darker navy by day (`authBrandText`).

### 24 Oct — Navie's Road Trip (Arcade game, Chapter 1)
- Ysa's professor's brief (pasted 24 Oct): a character-driven road adventure built around the existing mascot, EverWing-style companions/power-ups/patterns/progression, one complete chapter. It is the first card in Navie's Arcade (`app/arcade/index.tsx` -> `app/arcade/road-trip.tsx`, swipe-back off in `app/_layout.tsx`).
- **How it is built:** the whole game is one HTML page (canvas + HTML menus) in a full-screen WebView, written in TypeScript under `frontend/games/roadTrip/` - `core/` (pure: simulation, fairness check, missions, progression, saves, dialogue; also imported by the RN host and the tests), `web/` (art, renderer, input, audio, screens), `host/` (AsyncStorage save per account, forecast snapshot). **`node scripts/build-road-trip.js` must be run after any change** - the app loads `generated/roadTripHtml.ts`, not the sources. Tests: `node scripts/test-road-trip.js` (52 then; 76 after the Tollbound Heroes upgrade below). Plan and architecture: `frontend/games/roadTrip/DESIGN.md`; audit record with evidence and open items: `AUDIT.md`.
- Story: Navie leaves the Balintawak garage for the Arena Fiesta; meets **Kuya Jepoy** (jeepney, Taglish big brother: shield / pick-up magnet) and **Kiko** (shy multicab with his Lola's parols: early warnings / spare parts); finale against **Haring Barrikada**, a fictional road-works machine jamming Bocaue Barrier. Missions: journey (with tutorial), convoy + lay-by rescue, three-phase finale; garage grows (team board, workshop, postcards, fiesta). Optional Snapshot Challenge reads one SmartFlow forecast (`host/snapshot.ts` via `lib/forecastApi`) or labelled synthetic data.
- All in-game art is drawn in code; **Navie is a drawing matched to `mascot-loading.png`**, since no rear view or expression sheet of the mascot exists - designer renders would be needed for an exact match. No new npm packages; palette got one token, `gameStage`.
- Not yet done: played by a person on a phone, real-device frame rates, VoiceOver/TalkBack. Pushed in Ysa-Commit-11.
- **Second brief, same day (Kiko's Convoy revision):** Kiko now drives *behind* Navie and follows the path Navie actually drove (convoy camera shows both cars and the road ahead); fairness checks the delay between the two cars; the shield covers both; Kiko pulls alongside at the end and gives Navie Lola's parol (it hangs in the garage). New HUD (labelled Navie/Kiko condition, one message slot, onboarding cards on the first convoy run, four-state shield button, "Go!" for half a second), tap-to-step on the drag pad, richer roadside (`web/art/roadside.ts`, Road Trip only so Grand Prix is unchanged), story scenes restaged (`web/story.ts`, roadside-assistance lay-by, reactions, Kiko's cough). Tests now 62. Details and evidence: `AUDIT.md` section H.

### 24 Oct — Upgraded to Expo SDK 58
- iPhone Expo Go updated itself to SDK 58 and then closed instantly on our SDK 57 project (the App Store Expo Go only runs the newest SDK). Upgraded with `npx expo install expo@^58.0.0 --fix` plus the same bumps in `frontend/package.json` (that workspace pinned its own expo 57), a clean `npm install` (fresh `package-lock.json`), and `expo-font` + `expo-constants` installed directly (expo-doctor). React Native 0.88, React 19.3, Skia 2.14, WebView 14, Reanimated 4.7, gesture-handler 3.3.
- Type fixes for the new types under our non-strict tsconfig: `id={undefined}` on the root Stack and Tabs, `useRef<WebView<{}>>` in the two Arcade screens, `ScrollViewInstance` refs (assistant, ScreenShell), expo-image's own source type in AlphaVideo. `tsc` clean; the iOS bundle builds (2325 modules).
- SDK 58 tunnels are `*.on.expo.app`, not `exp.direct` - the QR changes. Teammates need to `npm install` after pulling.

### 24 Oct — Navie Grand Prix (second Arcade game, racing)
- Ysa: "a racing game but the user character is navie", rivals "just normal cars" (no names), "a new game, don't change anything to that [Road Trip]". Second card in the Arcade -> `app/arcade/grand-prix.tsx`; everything in `frontend/games/grandPrix/` (see its README.md). Own build `node scripts/build-grand-prix.js`, tests `node scripts/test-grand-prix.js` (17), save key `smartflow.grandPrix.<email>`.
- A 3-race cup with 5 numbered rival cars (each drives differently), time trials against your ghost, a Pit with capped upgrades. Closed tracks only (rice fields, a parol-lit night circuit, Sierra Madre ridge) - never NLEX traffic.
- It only reads Road Trip's drawing kit (Navie etc.); no Road Trip file was changed. Not yet played on a phone. Pushed in Ysa-Commit-11.

### 2 Nov — Ysa-Commit-11 (everything since Ysa-Commit-10)
- Rush Hour, Grand Prix, Tollbound Heroes, Remember me for 7 days, Navie's data tools and the upgrade to Expo SDK 58 all went up together. **After pulling, run `npm install`:** the SDK changed.
- Navie reads Community posts only once `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set on the Render service (`render.yaml` lists them with `sync: false`, so Render does not fill them in).

### 2 Nov — Tollbound Heroes: less text
- Ysa asked for fewer words, one screen at a time: Settings and Collection are tap-to-open rows, Team and Endless are cut down. Story mission briefings are still the long ones.
- Headless Chrome has no notch, so layouts must also be judged with `--safe-top` and `--safe-bottom` set. That is how the Team line-up and the crushed results screens got through.

### 2 Nov — Live corridor now shows the dashboard's numbers
- Ysa asked for the live corridor to be the same as the dashboard. The phone was re-grading every exit (`readTrafficByStretch`), so it showed 5/21/14 where the dashboard showed 3/12/25. That step is gone: statuses and counts are read as sent. Rows and maps still draw every queue where it physically sits.
- Backend: `queueMetres` is the longest single Waze report and `delaySeconds` the worst single delay (the dashboard's `longestQueueMeters` and `delaySeconds`), and the feed age is worked out from `newestAt`, because the dashboard's own age figure freezes inside its cached reply. Pushed in Ysa-Commit-11.
- The road is coloured from each Waze report as it came (`reports`), worst last, like the dashboard's map. A merged queue (`jams`) took its worst report's colour, so 9.6 km went red where only 6.5 km was level 3; `jams` now only feeds the queue list. A long red band beside one "congested" exit is correct: a queue counts at its nearest exit, the road shows where it stands, and the dashboard's map does the same. An exit a queue merely passes through says so (`passingQueue`: "Tambubong queue", "In queue") instead of "Clear". The tally still counts it clear, so the counts stay the dashboard's; the dashboard itself still says Clear there. Navie still reads those exits as clear.
- Checked by running the dashboard's code from `origin/Main-Dashboard` on the live feed against a local copy of this backend: 0 of 40 differences. Do not re-derive these numbers in the app.

### 2 Nov — Tollbound Heroes: the whole road, no chapters, 12 sidekicks
- Ysa: "put all the exits here in this game like no more chapter chapter in the story then can u add more sidekicks to unlock".
- One journey, Balintawak to Sta. Ines: 16 missions (`JOURNEY`), all 20 exits on a scrolling map (`JOURNEY_EXITS`, tested against `nlexSegments.ts`). Harbor Link, Paso de Blas and Marilao are driven past on missions 1 and 2 rather than being their own levels.
- New bosses Prinsipe Barrikada (San Fernando) and Reyna Barrikada (Sta. Ines): the same fight in new colours. New sidekicks Walis, Barya, Sibat, Tala, Ilaw, Maso. Old saves keep their progress.
- Details in `frontend/games/roadTrip/DESIGN.md` section 12 and `AUDIT.md` section K. Autopilot and headless Chrome only so far: not played by a person or on a phone. Pushed in Ysa-Commit-11.

### 3 Nov — Panel review comments
- **Sign-in brand:** no white tile. The logo sits on a soft glow (`auth-logo-glow.png`), the wordmark is white over a deeper sky (`auth-sky-tint.png`, day only), and the copyright is full-strength text. The mirrored sky is stretched so only sky shows (`SKY_ART_PX`), with 1 pt of overlap to hide the line where it met the picture. Regenerating the two PNGs is not needed; they are plain soft gradients.
- **Remember me** starts unticked. Sign-up no longer remembers the account silently either, since it has no box to opt in with.
- **Wording:** the wrong-code message (`mfa.ts`) and the reset-link message (`forgot-password.tsx`) use the panel's exact text. "TRAFFIC INTELLIGENCE" is gone from the tab header.
- **Welcome email:** `sendWelcomeEmail` (`frontend/auth/welcomeEmail.ts`) runs once `register` succeeds, and calls a Google Apps Script running as navie.smartflow@gmail.com (`supabase/welcome-email.gs`, which has the setup steps). The backend cannot send it: Render's free tier blocks outgoing SMTP. The script takes the session token, asks Supabase whose it is, and writes only to that address, once, within 15 minutes of the account's creation. Without `EXPO_PUBLIC_WELCOME_EMAIL_URL` in `.env`, nothing is sent and sign-up still works.

### 25–26 Oct — Road Trip becomes TOLLBOUND HEROES (professor's third brief)
- Player-facing name everywhere (Arcade card, title logo, garage/map/settings headers, help, page title). Code folder, save key `smartflow.roadTrip.<email>` and the `/arcade/road-trip` route are kept; the new `/arcade/tollbound-heroes` route re-exports it.
- **Hero + two sidekicks:** pick Navie / Kuya Jepoy / Kiko as the hero (own handling, automatic horn, one signature button) and two of six sidekicks (Pip, Mila, Bantay, Kumpuni, Bumbo, Silip) that fly in formation and act on their own; XP + Gear Cores + Bolts evolve them once. Power-ups, checkpoints with 3 temporary upgrades, road goals, an Endless Expressway mode, a rebuilt Barrikada finale (big gears, phase banners, Jam meter counting down, TEAM HONK). New Team and Collection screens; results lead with the celebration.
- **Save v2** with an explicit v1 -> v2 migration (old players keep everything and get the heroes/sidekicks they earned plus a one-time garage intro). The app screen now remounts from the latest stored save if Android kills the page (it used to reload from the save read at launch - could lose progress); settings changes now really save.
- Four separate audits (sidekicks + boss fairness, progression + saves, UI + accessibility, visuals + full journey) and their fixes: `frontend/games/roadTrip/AUDIT.md` section I. Design: `DESIGN.md` section 10. Human playtest plan: `PLAYTEST.md`. Tests now 76 (`node scripts/test-road-trip.js`); Grand Prix untouched (17/17, its bundle unchanged).
- Not played on a phone yet; the brief's video was never attached, so its dialogue could not be reviewed. Pushed in Ysa-Commit-11.

---

## 3. Open issues

| Issue | Who / what fixes it |
|---|---|
| The **Map tab's forecast paints both carriageways the same**, while the Dashboard's Traffic Forecast counts a predicted queue only on the side the dashboard would draw it. The two can disagree for one direction. | Apply the same side rule in `ForecastCorridorView.tsx` if Ysa wants them to match (offered, not asked for yet). |
| The dashboard's forecast table is sometimes rewritten with **only 12 hours** (a teammate's older trainer), and for ~10 min after a run its cache mixes runs: +12h/+24h can say "no forecast". | Dashboard team (`train_congestion_horizon.py` checkouts). |
| Two small Assistant reply mascots (clear, alert) have a blended "ghost" frame near the end of their loop. | Re-loop them from the source videos if anyone notices. |
| Unused, kept for now: `MascotGreeting.tsx` + `mascot-hello.*` (the re-cut greeting), `HeroMascot.tsx` + `mascot-car.png`, and the old `trafficModel.ts` functions (only its `CongestionLevel` type is used). | Delete when sure nothing needs them. |
| **ML Hotspots forecast still covers Jul 1–28**, not today (checked 8 Oct): the dashboard's incident data ends 30 Jun 2026. | Teammate: upload newer NLEX accident + breakdown logs on the dashboard's upload page, then retrain (`python weekly_retrain.py --only incident_spatial`, or the Sunday 22:00 run). The app updates by itself. |
| **Southbound maintenance notices likely fail to save on the dashboard**: its form makes the end km lower than the start; its API rejects that. | Dashboard team. |
| Maintenance rows saved before 3 Oct use the old km scale. Only affects expired rows. | Nothing needed unless reused. |
| `frontend/lib/nlexReportCorridor.json` is the dashboard's corridor line (from `Main-Dashboard @3d148af`), used to match its Current-alerts list. | Regenerate if the dashboard's road geometry or exit list changes. |
| Waze sends `delay_seconds: -1` for "not measurable"; the backend counts it as a real number. | Backend fix. |
| **Welcome emails are not going out until the Apps Script is deployed**, and it has only been tested against stand-ins for Google and Supabase. | Deploy `supabase/welcome-email.gs` as navie.smartflow@gmail.com, put its URL in `.env`, restart Expo, then sign up with a real address. |
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
