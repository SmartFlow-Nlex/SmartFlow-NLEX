# Tollbound Heroes (formerly Navie's Road Trip) - audit record

Cycle used: inspect -> design -> implement -> run -> inspect visually -> play through -> audit -> fix ->
re-run. Evidence comes from the Node test suite (`node scripts/test-road-trip.js`), a headless
Chrome harness at iPhone size (390x844 CSS px, 2x) plus 320x568, 844x390 and 140% text, and Metro
bundling of the real app. Nothing here was played by a person on a phone yet - see "Not verified".

Severity: **critical** (blocks the chapter or loses progress), **major** (breaks a requirement or a
screen), **minor** (polish).

## A. Identity and visual consistency

| # | Finding | Sev. | Evidence | Correction | Status |
| --- | --- | --- | --- | --- | --- |
| A1 | First drawn Navie had a cap ~40% of the height, small dark eyes, darker body than the render | major | side-by-side with `frontend/assets/mascot-loading.png` | re-proportioned cap, larger face panel and eyes, lighter iris and body blue measured from the render | fixed |
| A2 | Open-mouth expressions drew a ring under the mouth (outline traced the tongue path) | major | expression sheet | rebuild the mouth path before stroking | fixed |
| A3 | Brows hidden under the cap brim (render shows a thin brow line) | minor | expression sheet | cap raised 10 units, eyes lowered | partly - brows still tuck under the brim at rest; visible when they lift |
| A4 | Barrikada's boom arms ran off-frame with odd ends | minor | expression sheet | shorter booms with round stop-sign tips | fixed |
| A5 | Barrikada's radio portrait showed its chest gears, not its face | minor | finale screenshot | portrait framed on the lens head | fixed |
| A6 | Garage cast overlapped (Jepoy over Navie); toolbox drawn over Kiko | major | garage screenshots | back row for friends (smaller, higher), toolbox moved to the back wall | fixed |
| A7 | Mountains were crude triangles with a hard vertical edge | minor | drive screenshot | smooth ridges with an east-rising envelope (Sierra Madre) and mist | fixed |
| A8 | **No canonical rear view or expression sheet of Navie exists** - the in-game Navie (all angles, all eight expressions) is a project-native drawing matched to the render | - | inspection | documented; canonical render kept on the Arcade card and as the reference | **open: exact match needs designer renders (front expressions + rear) - external blocker** |

## B. Controls and game feel

| # | Finding | Sev. | Evidence | Correction | Status |
| --- | --- | --- | --- | --- | --- |
| B1 | Keyboard: holding Left steers, release stops | - | checks: x 0.00 -> -1.12, vx 0 after release | - | pass |
| B2 | Drag pad is below the car (finger never covers car or road ahead) | - | checks: pad top 641 px, car baseline 608 px | - | pass |
| B3 | Drag maps one lane of finger travel to one lane of car travel at sensitivity 1 | - | checks: -1.13 -> -0.13 for a 113 px drag | - | pass |
| B4 | Cancelled pointer leaves no steering | - | checks: synthetic pointercancel then move: x unchanged | - | pass |
| B5 | Lane buttons: one tap = one lane, 84x84 px | - | checks | - | pass |
| B6 | Ability button fires (92x92 px), Space/Shift/E on keyboard | - | checks: shield 3.82 s after tap | - | pass |
| B7 | One collision = one dent; post-hit protection | - | tests `collisions:*` | - | pass |
| B8 | Finale telegraph chevrons pointed away from the player | minor | phase screenshots | amber "v" chevrons come at you where things roll; green "^" arrows up the open lane | fixed |
| B9 | Game feel (speed, steering weight) is tuned by numbers and autopilot only | - | - | - | **open: needs human playtesting** |

## C. Mission logic and fairness

| # | Finding | Sev. | Evidence | Correction | Status |
| --- | --- | --- | --- | --- | --- |
| C1 | Every placed pattern is re-checked independently as fair | - | test `fairness: every pattern...` (40+ placements) | - | pass |
| C2 | Hazards never appear nearer than the spawn line | - | test `spawning:*`; first version could place the first pattern 8 units ahead | clamp to SPAWN_Z | fixed |
| C3 | Pattern variants shuffled with `Array.sort(random)` - different per JS engine, so seeds would not reproduce across Chrome and iOS | major | code review | seeded Fisher-Yates | fixed |
| C4 | Convoy: Kiko follows Navie's lane with a delay; fairness had to cover both cars | - | design + test `convoy:*` | "Kiko shadows" in the director: Kiko's hazards become earlier, wider constraints on Navie | pass |
| C5 | All missions completable on Story/Relaxed/Standard with starter equipment; Expert on most seeds | - | test `playthrough:*` (8 seeds x 3 missions x 4 presets; 10 seeds in the stats run: all wins, also with a 0.35 s-replanning bot) | - | pass |
| C6 | Finale was ~50 s, too short for three phases | minor | stats run | machine toughness up, sparks spaced, gear hits drop Bolts; now ~70-75 s | fixed |
| C7 | Story mode can never fail, including a driver who never steers | - | test `story:*` | - | pass |
| C8 | Rescue had no visible lay-by | major | rescue screenshot | marked bay, decorative cones, Navie-footprint target that fills while aligned | fixed |

## D. Narrative and progression

| # | Finding | Sev. | Evidence | Correction | Status |
| --- | --- | --- | --- | --- | --- |
| D1 | Story beats: opening -> meet Jepoy -> meet Kiko -> Arena (complication) -> machine reveal -> resolution with Chapter 2 hook | - | tour screenshots 02, 14, 18, 26, 32 | - | pass |
| D2 | Befriending changes the game: Jepoy -> Team board + shield/magnet; Kiko -> Workshop + lookout/repair; finale -> fiesta garage | - | tour: garage arrivals 15, 23, 33 | - | pass |
| D3 | Rewards: first clear vs replay, once per run id, postcard once, failure half Bolts | - | tests `reward:*`; checks: triple-tapped Continue paid once, survives reload | - | pass |
| D4 | Bolt pick-ups dominate a run's total (~90 of ~185) | minor | results screenshot | kept: generous, no grind; all upgrades (610) need roughly one full chapter plus a few replays | accepted |
| D5 | Radio chatter suppressed when the road is busy; essential lines always show | - | tests `radio:*` | - | pass |

## E. Accessibility and responsive layout

| # | Finding | Sev. | Evidence | Correction | Status |
| --- | --- | --- | --- | --- | --- |
| E1 | Radio/objective/meter stack covered the far road on 320x568 and at 140% text | major | layout screenshots | fixed-maximum stack (radio 3 lines, objective 2), meters moved to the stats column, camera horizon pushed below the reserved space (`Hud.reservedTop`) | fixed |
| E2 | Stats column pushed off-screen on narrow phones | major | 320x568 screenshot | progress bar may shrink (`min-width: 0`) | fixed |
| E3 | Settings switches 64x40 px | minor | checks touch-target scan | 72x48 px | fixed |
| E4 | All buttons and sliders >= 44 px on every screen (project target 48 for primary controls: met) | - | checks: 11 screens scanned | - | pass |
| E5 | Keyboard focus visible (3 px yellow outline + navy ring) | - | checks | - | pass |
| E6 | Map nodes overlapped the details sheet; titles truncated on small phones | major | map screenshots | route confined above the sheet, short labels; titles may wrap under 360 px | fixed |
| E7 | Map nodes were stretched full-screen by a CSS class clash (`.mission`) | major | probe: node height 468-555 px | renamed to `node-*` classes | fixed |
| E8 | Long sheets hid the Start/Continue buttons below the fold | minor | small-screen briefing | sticky action row | fixed |
| E9 | Screen-reader support: menus are HTML buttons; radio lines go to a live region; story text has a hidden live copy | - | code + DOM | - | implemented, **not tested with VoiceOver/TalkBack** |

## F. Engineering and integration

| # | Finding | Sev. | Evidence | Correction | Status |
| --- | --- | --- | --- | --- | --- |
| F1 | Hidden page pauses, stops the loop, no time jump on return | - | checks: 0 frames while hidden, +0.00 s sim time | - | pass |
| F2 | Focus loss pauses; resume needs a countdown; nothing held | - | checks | - | pass |
| F3 | Repeated mission entry/exit: one canvas, one loop, heap flat | - | checks: 20 missions, 9.5 -> 9.5 MB, 1 recurring loop | - | pass |
| F4 | Corrupt / newer / missing save handled; host backs up unreadable saves | - | tests `save:*`, checks corrupt save | - | pass |
| F5 | Storage unavailable: player told on the title screen | - | checks | - | pass |
| F6 | Root tsconfig (non-strict) could not narrow `canBuy`'s union | major | `tsc -p .` at repo root | single-shape `BuyCheck` | fixed |
| F7 | Campaign needs no network; Snapshot Challenge falls back to labelled synthetic data | - | checks | - | pass |
| F8 | App bundle builds with the new route and the 603 KB page | - | Metro iOS bundle HTTP 200, 13.3 MB dev | - | pass |

## G. Complete player journey

Fresh start -> title -> opening story -> garage -> map -> briefing -> tutorial -> Mission 1 -> results
(first-clear payout) -> Jepoy scene -> garage arrival -> team -> Mission 2 (convoy, lay-by rescue)
-> results -> Kiko arrival -> workshop purchase -> Mission 3 (three phases, Team Honk) -> results ->
resolution -> fiesta garage -> map with Chapter 2 shown as "coming later". Run by the headless tour
with the autopilot: all three missions succeeded, no page errors (`tour.js`, 35 screenshots).
Reload keeps progress; replay pays the replay reward once.

## H. Second brief: Kiko's Convoy revision (24 Oct)

The professor reviewed two iPhone screenshots (the meet-Kiko scene and the convoy start) and asked
for a better world, restaged story scenes, a clearer HUD, a convoy that really follows Navie,
better input and a fuller chapter arc. Before/after pairs at the same states:
`scratchpad/roadtrip/cmp-*.png` (story, convoy start, driving, lay-by, results, Mission 1).

**What the screenshots showed (before):** the green truck ahead of Navie *was* Kiko, drawn 9 units
ahead and moving to Navie's lane one second later (so the radio's "one second behind" contradicted
the picture); "N N N" were unlabelled dent slots and the green circles Kiko's engine; Kiko's radio
line, the yellow objective banner and "Go!" all sat over the road at once; white route text sat on
a translucent panel over clouds; the story was half empty sky with the cast in a flat row and
Log/Skip under the Expo dev button.

| # | Finding | Sev. | Correction | Status |
| --- | --- | --- | --- | --- |
| H1 | Convoy did not follow Navie's path; Kiko ahead hid the hazards' order | major | Kiko trails 6.5 units behind on Navie's recorded path (trail by distance), slower steering, strain feedback; convoy camera (depth 30) frames both cars and the road ahead | fixed; tests `convoy:*` |
| H2 | Collision/failure rules unspecified for two cars | major | written in `sim.ts` (collide/hitKiko) and DESIGN.md: one hit per hazard per car, spent for both after a hit or shield block, per-car protection, shield covers both, run fails at Kiko's engine 0 (never in Story) | fixed; tests `convoy collisions:*`, `convoy failure:*` |
| H3 | Fairness for the delay between the two cars | major | Kiko shadows timed by gap/speed (traffic further ahead, lane changes sooner) and the sweep at Kiko's steering speed | fixed; audit pass 1 found the lag padded the wrong side (H10) |
| H4 | HUD: unlabelled icons, three messages at once, weak contrast | major | compact top: route with Navie/Kiko markers, chips "Navie ▮▮▮", "Kiko ▮▮▮", Bolts; one message slot (onboarding card, else radio, else a 2-line Goal); solid navy under all white text (14.7:1 measured) | fixed; convoy-checks |
| H5 | Shield states unclear | major | Ready (yellow ring, "Ready · tap", glow), Active (blue, "On · 4 s", ring drains), Recharge (grey face, ring fills, "Recharge 9 s"), Unavailable (dashed, dimmed, reason) - class, words and colour together | fixed; convoy-checks |
| H6 | Onboarding: radio + banner overlapped | major | 2-3 player-paced cards with diagrams before the first convoy run (Next/Enter, Skip/Escape; pause-safe), then countdown; later runs go straight to the countdown | fixed; convoy-checks |
| H7 | "Go!" lingered over the road | minor | countdown numbers, "Go!" for 0.6 s, feedback toasts moved above the controls | fixed |
| H8 | Story scenes flat and distant | major | `web/story.ts`: closer camera, roadside-assistance lay-by (kiosk, SOS box, guardrail, trees), staged depth/facing, per-line reactions, Kiko's cough (shake, puffs, sfx) and uneven idle, hops and Jepoy's horn, mouth moves only while text types, punctuation pauses, speaker chevron + box pointer, line counter, Log/Skip/Next in the box, solid title pill; dialogue rewritten shorter | fixed |
| H9 | World thin | major | `web/art/roadside.ts` (Road Trip only - Grand Prix shares scenery.ts): layered mango/acacia/bamboo/banana/palm, hedges, nipa huts, pylons, km posts, SOS boxes, readable signs; median barrier with amber reflectors and W-beam guardrail; verge; tree line; distance haze; warm light; ground shadows | fixed |
| H10 | (audit 1) Kiko's steering lag puts his path *later* along the road, but the shadow was lengthened instead of moved earlier: a placement could be "fair" for the assumed escape yet hit Kiko | high | shadow shifted earlier by the maximum lag, padded to the minimum | fixed; new test runs the checker's own escape at the closest accepted distance, 3 presets x 2 directions: no hits. Autopilot Kiko hits on Expert 0.2/run -> 0 |
| H11 | (audit 1) After the lay-by Kiko chased positions recorded while stopping | medium | trail restarted at the jump-start | fixed; test |
| H12 | (audit 1) Alongside target flip-flopped as Navie wobbled | medium | side chosen once, switched only if Navie moves into it | fixed; test |
| H13 | (audit 1) Cars overlapped on short/landscape screens | medium | convoy camera solved from Kiko's row; car size shrinks to keep Kiko clear of Navie; landscape drag pad is a side zone | fixed; convoy-checks at 390x844, 320x568, 844x390 |
| H14 | (audit 1) Goal cut off; shield label orphan; Bolts chip wrapped at 320; sign text overflow; Jepoy hidden | low | 2-line Goal, shorter labels, narrow-phone chips, text fitted to its board, restaged | fixed |
| H15 | (audit 1) Traffic parked beside the convoy in the lay-by; Kiko drove through a car that dented Navie | low | traffic keeps its own speed while the convoy is stopped; bumped traffic steers off to the shoulder | fixed |
| H18 | (audit 2) Letting traffic drive on in the lay-by (H15) let vehicles the convoy had passed rear-end the parked cars - 5 hits in 600 runs, a possible failure while doing as told | high | the lay-by is protected: no collisions while pulling in, parked and charging; only traffic ahead drives on; at the jump-start leftover traffic is spent (beside) or gone (ahead) | fixed; test; soak of 600 autopilot runs: 0 hits in the lay-by |
| H19 | (audit 2) Alongside lane still flipped with Navie on a lane line (+-0.5), and briefly overlapped Navie | medium | Kiko keeps his lane while Navie is 0.7+ lanes away, otherwise moves to the nearest lane 0.85+ away; drops back before crossing; the manoeuvre latches once started | fixed; test wobbles around 0.2, +-0.5 and 0 |
| H20 | (audit 2) Small overlap at the lay-by gap; road under the HUD with very large insets | low | lay-by gap 6.0; flatter view allowed so the road starts below the HUD | fixed |
| H16 | Touch alternative to dragging | - | a quick tap on the pad steps one lane toward that side (lane buttons remain in Settings) | added; convoy-checks |
| H17 | Chapter arc | - | meet (lay-by, cough) -> understand (cards) -> learn (single-hazard stretch) -> varied convoy (closures, trucks, weaves, potholes, traffic) -> jump-start -> calm stretch -> busier convoy -> alongside arrival -> friendship card -> parol gift in the garage; shield taught in play the first time a hazard nears either car | done |

Two independent audit passes (separate reviewers given the code and screenshots, not the
conclusions): pass 1 found H10-H15, pass 2 confirmed H10 (360 cases) and H11 (486 cases) and found
H18-H20; it confirmed no soft-lock across Story seeds 1-30 with the autopilot and a blind driver.

Evidence: `node scripts/test-road-trip.js` 62/62 (was 52); headless checks 26/26 (original) and
12/12 convoy checks at each of 390x844, 320x568 and 844x390 (`convoy-checks.js`); autopilot
sweep 10 seeds x 4 presets x 4 missions: all won; convoy soak 150 seeds x 4 presets: 600/600 won,
0 Kiko hits, alongside 600/600, lay-by 8.7-9.1 s; Grand Prix still 17/17 and unchanged; app
bundles in Metro (iOS, 200). The autopilot sees every hazard instantly, so these numbers say a
path always exists, not how hard it feels to a person.

## I. Third brief: Tollbound Heroes (25-26 Oct)

**The brief's named weaknesses -> what changed** (captures in the session scratchpad:
`roadtrip/tb-390x844/`, before/after sheets `roadtrip/tbc-*.png`, before captures `roadtrip/before-tollbound/`):

| Weakness | Now |
| --- | --- |
| Teammates invisible while driving | Two sidekicks fly in formation beside the hero (pre-drawn frames, a gold halo when evolved); badges with status words in the dock. |
| Small gears on a distant boss | Machine closer (z 25); each open gear gets an oversized, outlined, turning gear glyph, a target ring and a label (OPENING / OPEN / OPEN x2 / LOCKED ON). |
| Weak hit and phase feedback | Gear hits flash white, kick the camera and pulse the Jam bar; phase banners sit in the radio slot (never over the machine); a hit squashes the hero's car with a red glow; bot pops have a minimum size; TEAM HONK has a white fade, rings, confetti and a banner; the machine powers down in smoke. |
| Repetitive automatic pulses | Small horn rings, rate-limited sound; power-up lines explained once per run; sidekick barks take turns and never repeat back to back. |
| Jam meter contradiction | "Jam meter N%" counts DOWN with phase ticks; briefing, help, HUD ("reach 0% to win"), screen-reader text and results all say the same. |
| Game UI vs phone/OS overlays | Nothing in the safe-area zones, no imitation system UI; the HUD behind a dialog is inert. |

**Separate audits** (independent reviewers, deterministic seeds; reproductions in the scratchpad's `audit-*` folders):

1. *Sidekick behaviour + boss logic and fairness* - 1 high, 9 medium, 8 low. Fixed:
   - A charged Team Honk could still be lost to throws already in flight. Everything is now knocked
     aside when it charges: 0/240 runs with live throws (was 15-25 of 40 per hero and difficulty).
   - Checkpoints said "Safe stop - the road is clear" with hazards still around (10/30 m1, 14/30
     Snapshot, 35/105 Endless, 169/720 boss breaks). They now wait for a clear road: 0 in all.
   - Gear damage ignored hero strength (Kiko cleared phases 2.4x faster); now all three heroes take
     14-18 s per phase on Standard. DAMAGE_MULT_CAP now caps damage x fire rate.
   - Pip aims at the far gear in phase 2; Silip's jam marks a bot for double damage instead of changing
     timing the director had checked; Gear Scan no longer holds lane changes (same reason); boss
     telegraphs include scouting bonuses; sparks spawn in view and outside telegraphed lanes; Kiko's
     auto-assist fires Gear Scan at a lined-up gear or a group of bots; Jepoy's shield hits count as
     hits (Bolts, goals); Second Wind is not offered when it cannot help; the simulation itself keeps
     Kiko out of his own convoy as hero; banking in Endless pays more than crashing; the test bot
     respects Route Sense slow-motion.
2. *Progression, evolution, saves and lifecycle* - 1 high, 4 medium, 7 low. Fixed:
   - If Android killed the page in the background, it reloaded from the save read at launch and could
     fork and later overwrite newer progress. It now remounts from the latest stored save, and storage
     reports a stale write instead of "saved".
   - Settings changes were never stored on the phone (no revision bump).
   - A v2 save that lost its version number was re-migrated (resetting heroes and evolutions).
   - Silip is granted for a v1 Snapshot clear; the roster is reconciled from completed missions on load.
   - The Snapshot briefing keeps its labelled snapshot card on Retry.
   - Runs are committed at the finish, not ~2 s later on the results screen.
   - An unseen "after" story scene plays on the next win; Android back works on every mission overlay;
     one backup per unreadable save; "Ready to evolve" only when XP, Cores and Bolts all suffice;
     Endless distance frozen at the end and rounded once.
3. *Input, UI clarity, accessibility and small screens* - 4 high, 14 medium, 14 low. Fixed:
   - Toasts covering the hero (now placed from the camera, under the car or above it).
   - The badge dock covering the hero with lane buttons (the camera now reserves the bottom controls).
   - The Endless objective flooding the screen-reader live region (thousands of updates per run).
   - The title could not scroll in short landscape (exit unreachable).
   - Stale checkpoint radio line; power-ups announced three times; goal-done said twice.
   - Focus escaping dialogs (HUD inert, Esc skips a checkpoint, key hint shown); assistive-technology
     clicks on the signature and lane buttons; Esc during the countdown.
   - Zero-height XP bars; switch label contrast; Team screen focus loss and no comparison (table added).
   - Jepoy saying "Careful, Navie"; alternating lines turning into repeats; tab semantics; roles on HUD
     labels; reduced motion for Silip's ring and Kiko's sputter; "1:60" durations; "+ +50%".
4. *Visuals, animation and the full journey* - 2 high, 15 medium, 10 low. Fixed:
   - Navie drawn twice in every garage story scene (including the opening).
   - Some traffic was purple, the bots' colour.
   - Gear Cores never mentioned on first-clear results; the unlock listed twice.
   - Chatter hiding tutorial and lay-by instructions (instructions keep the slot there).
   - TEAM HONK auto-fired after 6 s (now 15 s, or at once with the auto-assist) and a late tap spent
     the signature; weak honk, defeat, hit and pop feedback.
   - Evolved forms hard to tell apart in play (halo); a flat evolution moment (card glow, new form
     pops, READY badge on Collection).
   - Navie under the garage button panel; returning v1 players told nothing (one-time intro); a slow
     first start (Play -> opening -> mission 1 briefing); per-hero voice lines; radio names in each
     character's colour; the garage back arrow goes to the title.

**Still open (by choice, or not done yet):** pinch zoom stays off (the in-game text size replaces
it); map node spacing at 320 px with 140% text; the garage board still says "TEAM NAVIE" with Navie
front-centre whichever hero is chosen; the garage bubble tail always points at the centre car;
results portrait cropping; Team picks equip at once (no preview-then-confirm; the comparison table
helps); evolved Pip, Mila, Bumbo and Silip differ from their base forms mainly by the halo at
gameplay size; Endless opens after mission 1 (intended).

**Verification after the fixes:** 76 Node tests; browser checks 26/26 and convoy 12/12; layouts at
390x844, 320x568, 844x390 and 360x640 at 140% text with lane buttons (no horizontal overflow);
balance sweep - every hero with the starter team on Story, Standard and Expert, a slow-reacting bot,
never pressing the button, all 15 sidekick pairs and no sidekicks at all: 10/10 wins each; convoy
soak 150 seeds x 4 presets: 600/600 wins, 0 hits in the lay-by, alongside 600/600, 3 Kiko hits in
total (0 before bots joined the convoy); Grand Prix 17/17 with its bundle unchanged (32 modules, no
Tollbound art); app type-check clean; the Android export bundles on SDK 58. The autopilot sees every
hazard, so these numbers prove a path exists, not how hard it feels.

**Performance** (same harness as below). Midway, the new build was clearly slower (M1 at CPU 6x:
32-52 fps). The hero, formation sidekicks, gantry sign, labels and gear glyph were drawn as vector
art every frame, and a box-shadow glow plus per-frame ring updates repainted the whole HUD layer.
Fixed with pre-drawn sprite frames, portraits redrawn only when the face changes, rings that move in
steps, and separate compositor layers. Two final runs:

| Scenario | before (convoy build) | Tollbound, run 1 | run 2 |
| --- | --- | --- | --- |
| M1 journey, CPU 4x | 136 fps | 130 fps, p95 7.2 ms | 138 fps |
| M3 finale, CPU 4x | 101 fps | 115 fps, p95 14 ms | 113 fps |
| M1 journey, CPU 6x | 83 fps | 91 fps, p95 14 ms | 76 fps, p95 21 ms |
| M3 finale, CPU 6x + reduced motion | 83 fps | 88 fps | 88 fps |
| M2 convoy, CPU 6x | 88 fps | 92 fps | 95 fps |

The last jump (52 -> 76-91 fps at 6x) is larger than the last two fixes explain; the earlier runs
may have shared the machine with other work. Unthrottled, everything holds 144 Hz. Page 887 KB
before gzip. **Still not measured on a real phone.**

**Not verified:** human play (plan in `PLAYTEST.md`); real-device frame rate, audio and screen
readers; the brief asks to review a video's dialogue, but no video was attached.

## J. Fourth brief: arcade skin (29 Oct)

Presentation only (DESIGN.md section 10 -> 11). How "no mechanic changed" was checked:

- `core/` has no edits; `node scripts/test-road-trip.js` 76/76 and `test-grand-prix.js` 23/23 pass.
- Touch areas measured in headless Chrome before and after: signature button 100 x 100 at the same
  place, pause 52 x 52 (moved 1 px), pad 390 x 203, lane buttons 84 x 84.
- The earlier behaviour checks: 26/26 (keyboard and drag steering, tap-to-step, pause on blur and
  hidden page, resume countdown, touch targets >= 44 px on every screen, visible focus, 20 mission
  entries without leaks, corrupt or missing storage) and the convoy's 12/12 (cards before the run,
  camera keeps Kiko and new hazards clear of the HUD, radio and goal never together, the signature's
  states distinct in class and words, HUD text contrast - lowest 8.3:1).
- Shots at 390 x 844, 320 x 568, 844 x 390, 140% text and lane buttons: no horizontal overflow.

Found and fixed along the way: a banner showing the word "null" (`replaceChildren` turns a null
child into text); the TEAM HONK cut-in too wide for a phone; the route-bar faces sliding off the bar
onto the pause button at the start; the pad hint squeezed into a column at 140% text (already so
before: the pad's side room was in rem); the 320 px chip row and medallion dock too wide; the Bolt
counter's solid fallback colour losing to a more specific rule.

**Frame rate.** A first A/B (old page vs new, interleaved, CPU 6x) showed the convoy 58 -> 50 fps.
Switching parts off at runtime pinned it on the signature orb's turning rays (a layer rotating
inside a round clip): with them still, the convoy ran 55-75 fps instead of 45-66. The rays are now a
still shine. Medians after the fix, three to six interleaved runs each:

| Scenario (CPU 6x) | old look | arcade skin |
| --- | --- | --- |
| M2 convoy | 58 fps | 65 fps |
| M1 journey, reduced motion | 81 fps | 81 fps |
| M3 finale | 38-47 fps | 40-46 fps |

Unthrottled everything holds 144 Hz in both. Spread between runs is large today (the finale ranged
31-56 fps), so read these as "no regression found", not as a gain. Page 952 KB before gzip (was
891 KB). **Still not measured on a real phone.**

Known and left: in landscape the radio card can cover the leftmost horizon warning while someone is
talking (as before this pass); the TEAM HONK cut-in plays over the road for 1.5 s, at a moment when
the road has just been cleared.

## K. The whole road (2 Nov)

Request: all the exits, no chapters, more sidekicks. Design in DESIGN.md section 12.

| # | Check | How | Result |
|---|---|---|---|
| K1 | All 20 exits on the map in the real order | test against `nlexSegments.ts` | pass |
| K2 | Every passed exit is really signed on its mission's road | test on `gantries` | pass |
| K3 | No "chapter" in anything a player reads | test over missions, scenes, banter, radio, sidekicks | pass |
| K4 | All 16 stops completable on Story, Relaxed, Standard (8 seeds), most on Expert | autopilot sweep | pass |
| K5 | Each new sidekick does its job, and finishes a stop, a convoy and a boss | tests, plus each effect seen frozen on the real page | pass |
| K6 | Sidekicks join at the right stop, a damaged save gets them back, older saves keep progress | tests, plus a real-page load | pass |
| K7 | Stop, convoy and both new bosses played to results through the real map button | `north-flow.js` in headless Chrome | pass, no page errors |
| K8 | Earlier real-page checks still hold | `checks.js` 26/26, `convoy-checks.js` 12/12 | pass |
| K9 | Grand Prix, which shares the art, still builds and passes | 23 tests | pass |

Found by looking, fixed:

| Problem | Fix |
|---|---|
| Map road twice the size of its dots on a 2x screen (tests all passed) | canvas given a CSS size |
| New sidekick art ran up to 19 px outside the sprite box, so it would clip in play | `FIT` scale; the sheet's check now passes |
| San Fernando and Sta. Ines scenes showed a "BOCAUE BARRIER" sign and the Arena dome | `sign` on the plaza, `landmark` on the fiesta backdrop |
| A new sidekick stood on the boss's head, and went off the top in landscape | stands beside machines; clamped below the title |
| Play below the fold on small phones and at large text | sticky actions in the map sheet |
| Garage buttons cut off at 320 px when Team shows NEW | row children allowed to shrink |
| Map sheet over the Bolts pill and the road in landscape | border-box sheet, road width set to the free side |
| Long mission titles grew the garage button to three lines | it now names the next place |
| Found on Ysa's phone, not by any check: the Team line-up was drawn at a fixed height, so with a notch the sidekicks sat behind the header over an empty middle | the line-up measures the free space and centres there; landscape now puts it beside the choices |
| Tall sheets (briefing, pause with Settings open) filled the whole screen, title at 18 px behind a notch | border-box sheet, kept clear of the top safe area |
| Ysa: Settings too wordy (463 words, nearly five screens of scrolling) | 99 words on screen: self-explanatory controls lost their descriptions, How to play opens on tap, each difficulty is one line, the keyboard list is gone (the keys still work) |
| Every results screen crushed its top section (team, score, Bolts) on a tall sheet: 113 px of 406 on a notched phone, 13 px on small ones. Found by looking, no check caught it | the section keeps its height and the sheet scrolls |
| Ysa: Endless too wordy (briefing 198 words, checkpoint 92) | Endless only, the shared screens are unchanged for story missions: rules cut to two lines, team reduced to faces and names, controls hint and checkpoint footnote dropped |
| Endless briefing said "runs never fail" on Story, where Endless really allows 5 dents | it now gives Endless's own rule, and a test holds the two together |
| Ysa: Collection too wordy (twelve near full-screen cards) | one row per sidekick (faces, name, role, XP), everything else opens on tap; a Ready badge shows who can evolve; the three longest descriptions shortened |
| Silip's unlock rule was white on a white card, unreadable | no longer uses the light-on-dark note style |
| Ysa: Team too wordy (259 words, about seven screens of scrolling) | one line per signature, sidekick cards reduced to name and role (their full rules remain in the Collection, the briefing and for screen readers), strengths and the comparison table behind More |
| Ysa: tap to open for Difficulty, Assists, Controls, Sound and Display too | closed rows; Difficulty's row names the current level, and the briefing's Change opens it directly |
| Also from that phone: a grey band under Done, because the screen and its footer both reserved the home bar (the story title did the same with the notch) | the last piece of each screen reserves it, once |

Every check before 2 Nov ran with no safe area, which is how the Team bug got through. Screens are now also
checked with `--safe-top` 59 px and `--safe-bottom` 34 px set, and in landscape with 47 px at the sides.

Known and left alone: Jepoy's jeepney still reads ARENA all the way north, and a roadside billboard
reads ARENA FIESTA as far as Dau. The new bosses repeat Barrikada's lines in the fight itself (their
reveal scenes are their own). Walis rarely acts for the autopilot, which steers round cones early; it
was tested with a cone placed straight ahead, so how often it helps a real player is not known. The driving
controls still reserve the home bar twice (`.hud` padding plus each button's offset), so they sit about 34 px
higher than intended on a notched phone; not moved, because they are near the swipe-home area and that needs a phone to judge.

## L. The clay pass (3 Nov)

The brief came as a Markdown file. It mentions five screenshots and a reference collage, but only the file arrived, so
each audit item below was tried in the running game. Before shots come from the previous build, same save, same size
(390x844 at 2x), in headless Chrome. Ooblets' public media page was only looked at for the general idea of tactile, rounded
materials; nothing was taken from it.

### The brief's audit list

| # | Item | Found in the running game? | Cause | Correction | Status |
| --- | --- | --- | --- | --- | --- |
| L1 | Glossy portraits against a flat road | Yes | Vector portraits and a flat road drew in unrelated styles | Everything is baked from one clay renderer with one light | fixed |
| L2 | Big eyes, thick outlines, shiny buttons | Yes | Old face and button styles | Per-character matte faces with one highlight; flat buttons with soft shadows | fixed |
| L3 | Empty grey triangle road | Yes | Plain gradient road, little scenery | `Roadscape`: worn asphalt, verges, patchwork fields, clusters, overpass, signs, four moods | fixed |
| L4 | HUD too big | Yes | Three heavy rows | Top share of portrait height now 0.13 to 0.25 at 320 to 412 px wide | fixed |
| L5 | Truncated destination | Yes, at 320 px | Both names competed for one row | At 360 px and under, only "To X" shows; the destination is always whole | fixed |
| L6 | Team and Collection controls crowding settings | Yes | Too many controls in the top bar | Top bar is back, title, Collection; settings live in the garage | fixed |
| L7 | Permanent steering pill and oversized signature | Yes | Hint had no end; button sized for the old HUD | Hint only during the tutorial, help in pause; compact signature with a cooldown ring | fixed |
| L8 | Front-facing sidekicks in gold rings | Yes | Old medallions | Rear sprites beside the car; status tiles apart from the road | fixed |
| L9 | Ambiguous rings, starbursts and coins | Yes | Same star burst for everything | Bolts are hex nuts; pickups give small soft puffs; pulses have their own arc | fixed |
| L10 | Team sheet cropping stats behind the action | Yes | Sheet taller than its space, action on top | Scrolling panel above a fixed footer; last row reachable at all sizes | fixed |
| L11 | Tall checkpoint cards with keyboard hints | Yes | Gain and cost sentences with badges, number badges, and a keys line even on touch | Two labelled number rows per card; hints only with a real mouse and keyboard | fixed |
| L12 | Coins or effects near edges or the lower HUD | Partly | Not placement (tests below): Bolts fly to the counter, and sidekicks at z -0.9 drew over the old medallions | Shorter flight, faded when passed, formation at z -0.45 | fixed |
| L13 | Black pill, floating circle, right-edge overlay | No | Not in any capture at any size: they belong to the device or the capture | None | not ours |

### Found while testing

| # | Finding | Sev. | Evidence | Correction | Status |
| --- | --- | --- | --- | --- | --- |
| L14 | A touch on a sidekick status tile fell through and steered the car | major | `ob-interact`: x 0.000 to -0.543 | The dock takes its own touches (`pointer-events: auto; touch-action: none`) | fixed, rechecked |
| L15 | Brow tilt was inverted: "worried" looked angry and "determined" looked worried; cheeks and lashes went inward | major | Large expression sheet; the model lists eyes by its own left and right, which reverse facing the viewer | `clayFaces.ts` goes by where each eye landed on screen | fixed, rechecked |
| L16 | Kuya Jepoy's face sat behind the hood, Kidlat's mouth was invisible, Berto's face was lost in hat shadow, Tiko's blaze missed the eyes | major | Large face sheet | Windscreen flush with the body; mouth moved onto the panel; salakot pushed back; longer blaze | fixed |
| L17 | Landscape: the barriers ended in a cut face at the bottom of the screen | minor | Crop of a landscape run | Walls now run past the bottom of the picture | fixed |
| L18 | Road edges and field dikes stepped visibly, and gravel specks looked square up close | minor | Crop at 2x | Finer rows on both, round specks and reflectors | fixed |
| L19 | Text contrast: tabs, tile subtitles, gains, passed map numbers below 4.5:1 | minor | `ob-contrast`: lowest 2.4:1 | Darker `--ink-2` and `--good`, paler locked map nodes, backings for text over the picture. Lowest visible text now 4.77:1 | fixed |
| L20 | `ctx.filter` used for locked previews, which iOS WebViews may ignore | minor | Code reading; not reproduced on iOS | Removed; a locked character previews in colour and the panel says how to earn them | fixed |
| L21 | Hazard outlines were rectangles | minor | Screenshot | The outline follows the sprite's real shape | fixed |
| L22 | A first run unlocked five characters at once, from the proposed thresholds | major | Road timeline with two drivers | Thresholds tuned against measured play (DESIGN.md section 13) and held by a test | fixed |
| L23 | Upgrading a long-time save could queue a long chain of reveal pop-ups | minor | Before-and-after captures | Everyone joins, 3 reveals at most; "Later" pauses the rest until the next visit | fixed |
| L24 | Endless changed its mood with a visible jump | minor | Code reading | The change happens behind a moment of soft haze | fixed |

### Checks run

All in headless Chrome on the development laptop, at the sizes named. **None of this is from a real phone or an emulator.** The `ob-*.js` browser scripts named below ran from a scratch folder and are not in the repo.

| Check | How | Result |
| --- | --- | --- |
| Rules, saves, every hero and sidekick behaviour | `node scripts/test-road-trip.js` | 156 passed, 0 failed |
| Grand Prix, which reads Road Trip art | `node scripts/test-grand-prix.js`, plus its build | 23 passed |
| Types | `npx tsc --noEmit -p .` | clean |
| Save migration 2 to 3, repeated, idempotent rewards | tests `roster.test.ts`, `save.test.ts` | pass |
| Upgrade maths: +30% multiplies by 1.30; 18 s to 22.5 s; preview equals applied | tests, then read off the real card | pass |
| Echo recursion, Duwi limit, synergy caps, determinism | tests | pass |
| Pickups and hazards stay on the road, seeded, every stop | `placement.test.ts` | pass |
| Equip every character, either slot, with reload | `placement.test.ts` | pass |
| Real touches: signature and tiles do not steer, drag does | `ob-interact.js` | pass after L14 |
| Tile tap does not equip or spend; one action in the footer | `ob-interact.js` | pass |
| Double tap on a checkpoint card applies once | `ob-interact.js` | pass |
| Duwi reshuffle: changes offers, is spent, gone next time | `ob-interact.js` | pass |
| Reveal then equip, one at a time, not repeated | `ob-interact.js` | pass |
| Pause, background, resume, rotate mid-run | `ob-interact.js` (visibility simulated) | pass |
| Reduced motion: particles at 30%, road does not bend | `ob-interact.js` | pass |
| Layout at 320x568, 360x640, 390x844, 412x915, 360x560, 768x1024, 1280x800, 844x390 | `ob-layout.js`: overlap, cut text, sideways scroll, footer | none |
| Text contrast, 13 screens | `ob-contrast.js` | lowest visible 4.77:1 (the only entries under the line are hidden screen-reader text) |
| Every hero and sidekick driven in the real page; sprites all present | `ob-soak.js` | no missing art, 0 console logs |
| A brand-new player, from the title through a first run | `ob-newplayer.js`, real taps and a real drag | reaches the first drive in about 5 s if they skip the story; no console errors |
| The first pass of the road, two drivers | `economy.test.ts`, an autopilot and a sloppy driver | at most 1 by goal on the first run, at most 3 on any run |
| The real app still bundles | Metro on this laptop, iOS dev bundle | HTTP 200 |
| Memory over repeated runs | `ob-soak.js` | heap flat at about 10 MB (`performance.memory` is bucketed, so this is coarse) |

### Performance

390x844 at 2x, 6x CPU throttle in Chrome on the development laptop, autopilot, interleaved old build and new, two rounds. This
is a comparison between builds, not a phone measurement.

| Stop | Old fps | Old JS mean / p95 (ms) | New fps | New JS mean / p95 (ms) |
| --- | --- | --- | --- | --- |
| Tambubong | 96.8 | 4.53 / 8.5 | 54.0 | 9.79 / 14.15 |
| Sta. Rita (rain, convoy) | 103.3 | 4.21 / 7.45 | 56.5 | 10.13 / 13.85 |
| Finale | 69.5 | 7.81 / 14.05 | 50.4 | 11.14 / 16.85 |

The clay road costs about twice the main-thread time of the old one. Frame rate falls from well above 60 to about 50 to 56 at this
throttle. A device that stays under about 34 fps for three seconds drops to coarser rows, less scenery and 1.5x resolution
for the rest of the session (measured at the same throttle: finale 54.7 to 68.8 fps, Sta. Rita 56.0 to 72.2 fps).

The generated page is about 2.5 MB, up from about 1.1 MB at the last commit, because the art is inlined. Metro bundles the real app with it (iOS dev bundle, HTTP 200). It has not been timed loading in a real WebView.

## M. Character polish (4 Nov)

All in headless Chrome on the development laptop, 390x844 at 2x. **Not on a phone or an emulator.**

### What had to stay the same

| Check | Result |
| --- | --- |
| `core/` (mechanics, collisions, movement, abilities, hit boxes): SHA-1 of all 20 files before and after | 0 changed |
| `web/render/camera.ts`, `web/render/roadscape.ts`, `web/input.ts` | byte-identical |
| Road, traffic, hazard, scenery and garage sprites: manifest hashes | 74 of 74 unchanged, none added |
| Formation and hero positions | come from `core/` and the camera, both unchanged; each hero view's anchor is the same road point |

### Findings while building

| # | Finding | Evidence | Correction | Status |
| --- | --- | --- | --- | --- |
| M1 | Blending rear and turned views showed a double car, four tail lights mid-turn | Steering frames | Discrete views with a new baked `mid` angle | fixed |
| M2 | Paint ran across parts: cap seams down the rear window, a white opening onto the cabin | First bake | `on` limits a paint to one group | fixed |
| M3 | Dark rims painted over the tail lights' lenses | Second bake | Rim limited to the body | fixed |
| M4 | Metal reflected white: Ligaya's bell, Barya's coin and Gearo's shell washed out | Face sheet | Metal reflects in its own colour | fixed |
| M5 | Sago's jelly was read as pale glass | Sidekick sheet | Own `jelly` material | fixed |
| M6 | Navie's brows hid behind the visor and the smile ran into the headlights | Team crop | Eyes lowered, smaller smile, cleaner rims | fixed |
| M7 | Turning right mirrored the sprite, so the N on Navie's cap and plate read backwards | Full driving frame | Navie has its own right-hand views | fixed |

### Checks run

| Check | Result |
| --- | --- |
| Game tests, including the new `art.test.ts` | 161 passed |
| Grand Prix tests and build | 23 passed |
| TypeScript | clean |
| Real touches: steering, signature, tiles, checkpoints, Duwi, reveals, pause, background, rotation, reduced motion | all pass |
| All 12 heroes and 27 sidekicks driven in the page; every sprite present | no missing art, 0 console logs |
| Memory over repeated runs | flat, about 10 MB (coarse reading) |
| Road covered by each rear sprite (opaque area) | Bumbo +11%, Pip +9%, Mila +7%; everyone else within 3%. Navie's rear is narrower, 4.02 to 3.78 units |

### Performance

390x844 at 2x, Chrome CPU slowed 6 times, autopilot, Navie with Bumbo and Mila, alternating builds, two rounds. The laptop ran slower than on 3 Nov, so compare only within this table. It was measured before sidekicks were reduced to 6 rows, so it slightly overstates the cost.

| Stop | Before fps | Before JS mean / p95 (ms) | After fps | After JS mean / p95 (ms) |
| --- | --- | --- | --- | --- |
| Tambubong | 50.4 | 10.43 / 14.2 | 44.0 | 11.67 / 17.9 |
| Sta. Rita | 46.9 | 13.03 / 19.6 | 44.3 | 13.25 / 20.4 |
| Finale | 44.2 | 13.05 / 21.65 | 43.8 | 13.2 / 22.9 |

The baked art as a whole grew from about 970 KB to 1206 KB, 12 new `mid` views and 2 for Navie's right-hand side among it, and the game page to about 2.8 MB.

## N. Sculpted fronts (4 Nov)

Ysa's brief: the characters look good from behind but awkward from the front. Fix the real models, for all heroes and sidekicks, in every screen. Leave the road, scenery, camera, mechanics, abilities and rear views alone.

### Why the fronts were weaker

Rear views were pure geometry. On the front, eyes, brows, mouths and cheeks were 2D drawings over the finished picture, so they took no light and looked as if they floated. Face panels were painted ovals. Headlights were oversized discs. Nothing on a face was designed together. Details are in DESIGN section 15.

### Findings while building

| Finding | Fix |
|---|---|
| Eyes rendered as skin, with no opening measured: `look()` chose the shell over the ball | `solo` parts in `sdf.js` |
| Irregular white halos round lamps: the lens won in the blend region | Lens is `solo` |
| Navie's N was mirrored in some views, from `pose.flip !== view.flip` with undefined | `(pose.flip === true) !== view.flip` |
| Smile looked like a zip | 20 steps, larger blend, no dimples |
| Marbling on smooth panels | `FRONT_LIGHT.smooth` |
| Jepoy's moustache turned gold: the body stripe paint covered it | Moustache painted last |
| Crossfading rear and turn views showed a double car | Discrete views, with `mid` between |
| Silip's eyes were tiny and crowded by the arms, Sibat squinted either side of a point, Ilaw's eyes were too small, Kalaw's were hidden by casque and beak | `frontParts` for each |
| Ulap's eyes came out unequal on the cloud's lumps (641 against 531 px) | A smooth mound under the face |
| Saranggola's eyes showed through the paper in the turntable | A pad behind the face |
| Page grew by over 1.2 MB | In-between angles baked smaller and at lower quality: 3.7 MB page, 1734 KB of sprites (2103 KB before the trim) |

### Checks run

| Check | Result |
|---|---|
| All 20 `core/` files against the hashes taken before the brief | All the same |
| `camera.ts`, `roadscape.ts`, `input.ts` against copies taken before the brief | All the same |
| World and scenery sprites | 74 of 74 byte-identical |
| Road views (`rear`, `mid`, `turn`) | 63 byte-identical. `s.bumbo.rear` and `s.mila.rear` changed, because the brief asked for their antennae to attach naturally |
| Road Trip tests | 166 passed, including new art tests: every front view has two measured openings, dead-ahead symmetry, eye proportion, iris inside its opening, far eye narrows on a turn |
| Grand Prix | Rebuilt, 23 passed |
| Typecheck | No errors outside Clean Air Shift, which is separate concurrent work |
| Turntable of all 39 (front, both three-quarters, both sides, behind) | Reviewed by eye. Four sidekicks reshaped as a result |
| Expressions and angles (celebrate, worried, determined, hurt, surprised, sleepy; 0, 15, 35, 55 degrees; evolved) | Reviewed by eye on a sample. Closed lids are skin-coloured, not grey |
| Garage, Team, Collection, story, in the running game | Reviewed by eye. Picking a hero swings them in and settles them |
| Soak: every hero and sidekick driving | No console errors, heap flat at 13 MB |
| Real touches, layout at each screen size, text contrast | All passed. The only low-contrast text is the invisible screen-reader line |

### Performance

Headless Chrome with the CPU throttled four times, interleaved runs against the build from before this brief. The sidekick and hero rendering code is unchanged apart from choosing a view.

| Measure | Before | After |
|---|---|---|
| Page size | 2834 KB | 3694 KB |
| Time until the game is up | 780 ms | 836 ms |
| Heap on Team | 10 MB | 10 MB |
| Tambubong fps, JS mean | 50.3, 10.8 ms | 50.8, 10.6 ms |
| Sta. Rita fps, JS mean | 57.9, 10.5 ms | 59.1, 10.0 ms |
| m3 finale fps, JS mean | 53.1, 11.5 ms | 51.7, 11.6 ms |

The driving differences are within the noise between runs. Metro also has to send the larger page to a phone, which these numbers do not include.

## O. The collection (5 Nov)

Ysa's brief: move all heroes and sidekicks to a cute, matte, hand-painted look inspired by Ooblets; add 4 heroes and 6 sidekicks with working abilities and real unlocks; keep the expressway and gameplay exactly as they are. Design in DESIGN section 16.

### What had to stay the same, and how it was proved

Taken before any change: a fingerprint of play (`golden`), copies of the road code, and copies of all art.

| Check | Result |
|---|---|
| Gameplay fingerprint: 123 seeded autopilot runs of all 12 old heroes and all 27 old sidekicks over 8 roads, hashing car position, speed, hazards, pick-ups, shields, dents and every event, tick by tick | 123 compared, 0 differ |
| `camera.ts`, `roadscape.ts`, `input.ts` | Unchanged |
| World and scenery sprites | 74 of 74 byte-identical |
| Rear view outlines (`rear`, `mid`, `turn`, Navie's right-hand views, sidekick rears) | 65 of 65 identical in shape, in size and on their anchors; repainted in the new finish |
| `core/` files | 13 unchanged. 7 changed additively: dialogue, progression, roster, rosterNew, sim, types, unlocks. The fingerprint is what proves they play the same |

### Findings while building

| Finding | Fix |
|---|---|
| Eyes were washed out on anyone with a painted face panel: paint with no target also coloured the eye seated in it | `sdf.js`: a seated part only takes paint aimed at it by name |
| Navie's eyes looked clipped: they sat on the steep top of the windscreen | Moved down to where the surface faces forward |
| Smiles were barely visible: the paint stopped at the floor of its own groove | Paint reaches past the groove |
| Radyo's feet, Dahon's feet and Ginto's wheels were not touching their bodies | Moved in and blended |
| First unlock numbers made one stop deliver 4 new characters | Retuned from a measured drive of the whole road |
| A bought sidekick's celebration waited behind anyone already queued | Bought goes first |
| Five requested names were taken | New close names, listed in DESIGN section 16 |

### Checks run

| Check | Result |
|---|---|
| Road Trip tests | 191 passed. 25 are new in `collection.test.ts`: each new ability does what it says, within its caps; autopilot finishes real missions with every new character; counters read real data; exact unlock thresholds; buying refuses what it should and charges once; old saves keep everything |
| Grand Prix | Rebuilt, 23 passed |
| Typecheck | No errors outside Clean Air Shift, which is separate concurrent work |
| Real clicks and a real restart (`ob-collect`) | Locked tile shows real progress (60/150); locked hero cannot be chosen; buying spends 350 once; celebration plays; can be equipped straight away; cannot be bought twice; unlock, Bolts and team all survive a page restart |
| Soak: every hero and sidekick driving | No console errors, no missing art, heap flat at 14 MB |
| Real touches, layouts at 8 screen sizes, text contrast | All passed. The only low-contrast text is the invisible screen-reader line |
| Turntable: front, both three-quarters, both sides, behind | All 49 characters reviewed by eye after the last model change |
| Expressions | Sample of 4 heroes across 6 feelings, by eye |

### Performance

Headless Chrome with software rendering and the CPU throttled four times, interleaved against the build from before this brief. The laptop ran much slower this sitting than the day before (about 18 fps against 50), so only the comparison within a sitting means anything.

| Measure | Before | After |
|---|---|---|
| Page size | 3694 KB | 4087 KB |
| Sprites | 298, 1734 KB | 356, 1976 KB |
| Time until the game is up | 669 ms | 693 ms |
| Team stage frame time | 33.3 ms | 33.3 ms |
| Tambubong fps, first run | 19.8 | 18.2 |
| Sta. Rita fps, first run | 16.9 | 16.0 |
| m3 finale fps, first run | 19.2 | 17.3 |

The new build came out about 5% lower in both run orders. A page with the new code and the old art gave no consistent answer on whether art or code is responsible, and separate runs differed by as much as the gap itself, so most of this may be noise. It should be judged on a real phone.

## P. Softer, rounder, more lovable (5 Nov)

Ysa's brief: section O is still too plain and stiff; push much further toward a cozy, collectible, Ooblets-inspired look, and keep the game the same. Design in DESIGN section 17.

### Findings while building

| Finding | Fix |
|---|---|
| Pale cap and face looked dirty under the new mottling | Mottling fades out on pale colours |
| Colours washed out under the first version of the finish | Less lift toward cream, richer midtones |
| Smiles read as pale bands with dark edges: the nap lit the groove's sides | A smile is now a line of paint in a very shallow crease |
| Navie's hood was lumpy where separate bulges creased against each other | One round form, a painted bumper |
| Pale panes wrapped onto the sides once bodies got shorter | `remapSpec` scales how far a pane reaches |
| Saranggola's face showed through to its back | Shallower paint |
| Sampy's mouth was hidden by petals, Kape's sat on its stripe, Amihan's on a crease, Piko's chalk looked like glare by the eyes | Each moved |
| Navie came out 8% narrower on the road, where a hero is sized by its model | Widened to within 2% of before |
| A full-screen glow redrawn each frame made the Team stage miss more frames on a slow CPU | Painted once, then reused |

### Checks run

| Check | Result |
|---|---|
| Gameplay fingerprint: 123 seeded runs of all old heroes and sidekicks | 123 compared, 0 differ |
| `camera.ts`, `roadscape.ts`, `input.ts` | Unchanged |
| World and scenery sprites | 74 of 74 byte-identical |
| Rear views | Reshaped on purpose, to match the fronts. Widths within about 5% of before. Hit boxes unchanged |
| Tests | Road Trip 191 passed, Grand Prix 23 passed. The art test now allows deliberate asymmetry |
| Typecheck | No errors outside Clean Air Shift |
| Soak with every hero and sidekick; real touches; 8 layouts; contrast; real-click buying and restart | All pass, no console errors. The only low-contrast text is the invisible screen-reader line |
| Turntable: all 49 from front, three-quarters, sides and behind | Reviewed by eye |
| Expressions | Sample of 4 heroes and 6 sidekicks across 6 feelings, by eye |
| Full collection | Garage and Collection with 16/16 and 33/33 reviewed by eye |

### Performance

Headless Chrome, software rendering, CPU throttled four times, against the build from before section O. A sitting-to-sitting swing was large again (about 18 fps in one run, 11 in the next), so only each pair means anything.

| Measure | Before | After |
|---|---|---|
| Page size | 3694 KB | About 3945 KB |
| Time until the game is up | 665 ms | 662 ms |
| Tambubong fps, new second then new first | 18.7, 10.8 | 18.6, 11.9 |
| Sta. Rita fps | 17.3, 9.8 | 17.0, 10.0 |
| m3 finale fps | 18.1, 10.8 | 18.4, 11.4 |

Driving is level within noise. A real phone is still the real test.

### After section P: Navie and the sidekicks reverted

Ysa asked for Navie and all 33 sidekicks to go back to the section O look. Their 177 sprites hash exactly to the section O renders, and a redraw of three with today's code differs by 0 bytes. The Team screen, compared side by side with section O, matches. Road Trip 191 and Grand Prix 23 tests pass, the gameplay fingerprint shows 0 of 123 runs differing, and soak, real touches and buying all pass. The other 15 heroes keep the section P look, so the two finishes now sit side by side on the Team screen.

## Q. The approved reference (5 Nov)

Ysa supplied a final, approved picture of the Team screen. Everyone was rebuilt to it. Design in DESIGN section 18.

### Findings while building

| Finding | Fix |
|---|---|
| A big visor shell turned the top of the windscreen blue | `look()` colours by each part's raw distance and ignores cuts, so a large part wrapped round a surface takes it over. The visor became one thin bent part |
| The inside of the mouth showed body blue | The cut's floor was in front of it. The cut is painted, with a plate in front for the bake to measure |
| Hairline marks on the windscreen under the eyes | A wide shallow dimple rippled. Navie has no dimple and a flatter eye instead |
| Lamps half buried on rounder bodies | Each lamp now finds a surface that faces forward |
| Smiles looked smudged | A groove under them caught the light. A smile is now a line of paint |
| Navie came out too tall and narrow against the picture | Crown, cabin and hood all brought down, and the body raised so the tyres show |
| A talking mouth left a hard patch and dark corners | A larger cover with a soft edge |
| A faint ring round Navie's bigger eyes when a lid moved | Lids reach just past the opening |
| Bumbo's dark porthole read as one big eye on the road | A pale patch instead |

### Checks run

| Check | Result |
|---|---|
| Down the middle of Navie, top to bottom, in pixels | Button, white panel, blue ring and N, visor, white windscreen, blue hood, dark mouth, pink tongue, blue, white N, bumper |
| Windscreen between and below the eyes, in 3 views | 0 blue and 0 dark pixels: no extra N and nothing else on it |
| Gameplay fingerprint | 123 compared, 0 differ |
| `camera.ts`, `roadscape.ts`, `input.ts` | Unchanged |
| Scenery, traffic, road and machine sprites | 74 of 74 unchanged |
| Navie's road width | 3.87 units against 3.78, within 3%. Hit box unchanged. Berto is 4.5% narrower, from the shorter horns |
| Tests | Road Trip 193 passed (2 new, on the approved face), Grand Prix 23 passed |
| Typecheck | No errors outside Clean Air Shift |
| Soak with everyone; real touches; real-click buying and restart | All pass, no console errors |
| Removing the old finishes | 356 sprites, 0 to draw; three sample redraws differ by 0 bytes |
| By eye | Team beside the picture, Collection, Garage, unlock card, road view, Navie at 11 angles, expressions and talking |

### Performance

Headless Chrome, software rendering, against the section P build. Art grew from 1878 KB to 1944 KB of WebP. Driving is level within noise.

| Stretch | Before | After |
|---|---|---|
| Tambubong fps | 53.5 | 57.3 |
| Sta. Rita fps | 51.2 | 47.0 |
| m3 finale fps | 51.5 | 53.0 |

A real phone is still the real test.

### After section Q: Navie's size and windshield

Against Ysa's second picture. Navie on the Team stage: 350 wide, as in the picture (was 380), gaps to the sidekicks 17 and 22 (picture 20 and 15). Windshield above the eyes in 5 views: 0 blue pixels. Only 12 sprites changed, all Navie's; rear views stay within 1 pixel, at the same scale and `wide`. Tests 193 and 23 passed, gameplay fingerprint 0 of 123 differ, soak and real touches pass. Looked at on 360x640, 375x667, 390x844, 430x932, 768x1024 and 844x390: whole cap visible, nothing overlapping.

## R. Sidekicks get past what is on the road (5 Nov)

Ysa's report: sidekicks pass through traps. Design in DESIGN section 19.

### Findings while building

| Finding | Fix |
|---|---|
| A sidekick snapped to the road when the thing under it was zapped mid-jump | It falls at a limited speed |
| A sidekick could move a full lane in one tick: steering beside a truck flipped the nearest free spot to its far side | It keeps its side until past, and sideways speed is limited. Most in one tick is now 0.10 lanes, and a test holds it |
| Vehicles side by side could leave a sidekick standing inside one of them | Things too close to fit between count as one block |
| Cars were treated as 0.56 tall from one sprite, but the van shape is 0.65, so flyers would have clipped it | Corrected, and a test holds every height to the baked art |

### Checks run

| Check | Result |
|---|---|
| Every stop, 45 s each, runner and flyer, real sim | No tick where one is through anything. Over 720 s: 183 jumps and 73 sidesteps, highest jump 0.64 lanes, widest sidestep 0.46 lanes |
| Gameplay fingerprint | 123 compared, 0 differ. `sim.ts` does not import the new file |
| `camera.ts`, `roadscape.ts`, `input.ts` | Unchanged |
| Tests | Road Trip 203 passed (10 new), Grand Prix 23 passed |
| Soak with everyone; real touches | Pass, no console errors |
| Real page, things placed in their path | Looked at frame by frame: over a barrier and a cone, beside a truck and a bus |
| Performance against the build before | Level within noise: 58.9 to 58.7, 51.9 to 53.2, 56.7 to 58.2 fps |

## S. A hundred levels and a broken road (6 Nov)

Ysa's request: 100 levels between the NLEX exits, heroes and sidekicks arriving by level, and broken road that looks broken. Design in DESIGN section 20.

### Findings while building

| Finding | Fix |
|---|---|
| Roadside signs use the same id counter as hazards, so changing the number of signs on m1 or m2 would change the whole run after them | Story missions keep their sign count and positions; only the sign text changed |
| The broken road's slabs stretched into spikes as they passed under the car, because near points were squashed onto the screen's bottom edge | Only points behind the camera are held back; slabs fade by their nearest edge, and the near torn edge lies flat under the camera |
| A level that stops short of the exit said "Arrived at NLEX Harbor Link!" | It says "Level N cleared!"; only the level that reaches the exit says arrived |
| Generated levels listed a postcard rule but have no postcard | They have their own rules, with broken road named |

### Checks run

| Check | Result |
|---|---|
| Story missions replayed against the build before | Same outcome, time, Bolts, bots and dents on every one. The only differences are the m1 and m2 sign texts, which are part of the fingerprint |
| Autopilot through all 100 levels in order (test) | Finishes every level within 10 tries and ends with the whole roster |
| Arrival pace (test) | At most two arrivals per level, the first by Level 3, never more than 5 levels without someone, never more than 14 between heroes |
| Every exit (test) | Reached by its own level, with an exit sign, at the real km |
| Old saves (test and real page) | A version 3 save keeps its place; one at the old Pulilan stop opens on Level 57 |
| Real page, results | Level 3: "Level 3 cleared!", "Sidekick joined: Bantay", Tarsi next at 3/5 levels. Level 6: "Arrived at NLEX Harbor Link!", Workshop opened, exit reached |
| Map on a fresh, mid-game and migrated save | 100 nodes, exit names, joiner faces, no console errors |
| Sidekick dodging (test) | Every fourth level and every story level, no tick where one is through anything |
| Frame rate in headless Chrome | About 60 fps on Level 50, Level 71 and Tambubong |
| Soak and real touches | Heap stable, no console errors |
| Tests | Road Trip 206 passed, Grand Prix 23 passed, TypeScript clean. The Road Trip run takes about 3 minutes now, up from about 2, because the autopilot drives all 100 levels |

### Fewer words (same day)

Ysa asked for less text. Removed: the title tagline, the Journey Map note, and the route and objective lines on a level's sheet (a locked level still says which level to clear). In the Collection, a hero shows the signature in one line and bare stat bars, and a sidekick shows what it does in one line; bios, quotes, trade-offs, team-ups and the Reach / How often / Limit rows are gone from there. The Team screen still has that detail. Panels went from 51-109 words to 18-44. Found while doing it: `append(null)` printed "null" on the sheet, and Snapshot and Endless would have said "clear Level -1"; both fixed.

## Performance (measured, not promised)

Headless Chrome 155 on the development PC (Windows 11), phone emulation 390x844 @2x, autopilot
driving, frame times from `requestAnimationFrame` deltas over 12 s, main-thread cost from the
DevTools Performance domain. Headless Chrome is not vsync-limited to 60 Hz (it ran ~144 Hz).

| Scenario | fps | p95 frame | frames > 33 ms | script / frame |
| --- | --- | --- | --- | --- |
| M1 journey, no throttle | 144 | 7.4 ms | 0% | 3.2 ms |
| M3 finale, no throttle | 144 | 7.1 ms | 0% | 3.3 ms |
| M3 finale, CPU 4x | 132 | 13.9 ms | 0% | 12.1 ms |
| M1 journey, CPU 6x | 122 | 13.9 ms | 0.2% | 11.9 ms |
| M3 finale, CPU 6x + reduced motion | 84 | 20.9 ms | 0.8% | 13.5 ms |

After the second brief (richer roadside, convoy camera). The busier world costs frame time under
heavy throttling; ground, sky and warm light are now drawn once per size, and Kiko from 24 cached
frames, which brought the convoy at 6x from 68 to 88 fps:

| Scenario | fps | p95 frame | frames > 33 ms | script / frame |
| --- | --- | --- | --- | --- |
| M2 convoy, no throttle | 144 | 7.2 ms | 0% | 3.3 ms |
| M2 convoy, CPU 6x | 88 | 14.3 ms | 0.2% | 12.1 ms |
| M1 journey, CPU 6x | 83 (was 122) | 14.0 ms | 0% | 10.9 ms |
| M3 finale, CPU 6x + reduced motion | 84 | 20.8 ms | 0.2% | 13.2 ms |

Run-to-run spread at 6x is about +/-8 fps. Page now 667 KB before gzip.

Page size 603 KB (171 KB gzipped): 407 KB JavaScript, 172 KB embedded Nunito Black, 24 KB CSS; it
ships inside the app bundle, so there is no runtime transfer. JS heap ~3 MB while driving.
Reduced motion caps the canvas at 1.5x pixel ratio, cuts particles to 30%, removes shake, parallax
and road bends. **Not measured on an iPhone or Android phone** - the 60 fps / 30 fps targets are
unverified on real hardware.

## Not verified / remaining

- **Section S has not been played on a real phone.** Pacing across 100 levels is tuned against the autopilot, not a person. Whether the broken road reads as broken at phone size and speed is Ysa's call.

- **Section R has not been felt on a real phone.** Whether the jumps look right at speed is a judgement to make there. Sidekicks still pass through Kiko's car and the boss machine, which are not hazards.

- **Section Q has not been seen on a real phone by me.** Not every character was reviewed in every expression at every angle.

- **Section P is a judgement of taste, and only Ysa can make it.** The look has not been seen on a real phone by me. Not every character was reviewed in every expression at every angle.

- **The collection (section O) has not been judged on a real phone.** Whether the look is what Ysa pictured is theirs to say, and the reference images the brief mentioned never arrived. Frame rate on a phone is unmeasured. Unlock pacing is tuned against the autopilot, not a person.
- Not every character was checked in every expression at every angle; sample sheets were reviewed.

- **Sculpted fronts (section N) have not been seen on a real phone by anyone yet.** Whether they read as cute at phone size is the question the whole brief turns on, and only Ysa's own eye can settle it. The expression and angle sheets covered a sample of the cast, not all 39 in every combination.
- A baked smile stays on a worried or hurt face, which shows the feeling through eyes and brows instead. Rotation goes in steps between baked angles.

- **Character polish (section M) has not run on a real phone.** The page is larger again, and the new look's feel in a real WebView is unknown.

- **The clay pass (section L) has not run on a real phone or an emulator.** Everything there is headless Chrome. Unknown until then: load time of the 2.5 MB page in a real WebView, frame rate, heat, and how WebP decoding behaves on old devices.
- The attached screenshots and reference collage the clay brief mentions never arrived; only the Markdown did.

- The whole road (section K) has been played by the autopilot and headless Chrome only: no person and no
  phone yet, so the difficulty rise over 16 stops is untested as felt. Frame rates were not re-measured.
- Human playtesting (fun, comfort, fairness as felt) - not done. Fresh-player test to run:
  1. First minute: can they steer, collect a Bolt and dodge a cone without help?
  2. Controls: drag pad vs lane buttons - which, and why? Any finger over the car?
  3. Fairness: did any hit feel unavoidable? (Note the seed from the pause menu.)
  4. Characters: who do they remember, and one word for each?
  5. Replay: would they replay a mission for the postcard or a cleaner run?
- Real-device performance, WebView audio on iOS with the silent switch, VoiceOver/TalkBack.
- Exact mascot matching for in-game art (A8).
- Arcade scores are local to the phone per account; nothing is server-verified or competitive by design.
