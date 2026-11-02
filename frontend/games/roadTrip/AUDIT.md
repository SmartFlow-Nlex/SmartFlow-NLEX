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
