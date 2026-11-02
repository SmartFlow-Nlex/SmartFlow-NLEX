# Tollbound Heroes (formerly Navie's Road Trip) - design and implementation plan

A character-driven arcade road adventure inside Navie's Arcade (the game-controller button in every
tab's header -> `app/arcade/index.tsx` -> "Tollbound Heroes", route `/arcade/tollbound-heroes`;
the old `/arcade/road-trip` route still works). Brief: Ysa's professor, 24 Oct 2026
("EverWing-inspired companions, power-ups, patterned challenges and progression, but an original
driving adventure about friendship and teamwork, built around the app's existing mascot").

**Renamed and upgraded on 25 Oct 2026 (third brief).** Sections 1-9 describe the game as built for
the first two briefs and still hold for the road, story, fairness sweep and accessibility basics;
**section 10 describes what the third brief changed** (hero + sidekicks, run variety, the boss,
the new screens and the save migration). The code folder, save key and test names keep the
`roadTrip` name so routes and saves stay compatible.

## 1. What was inspected

| Area | Files | What it means for the game |
| --- | --- | --- |
| Platform | `package.json`, `frontend/package.json` | Expo SDK 57, React Native 0.86, run in **Expo Go**: no custom native modules. Installed: Skia 2.6.2, Reanimated 4.5.1, react-native-webview 13.16.1, AsyncStorage 2.2.0, TypeScript 5. No game engine, no esbuild, no test runner configured (jest is listed but has no config or tests). |
| Navigation | `app/_layout.tsx`, `app/arcade/*` | expo-router Stack, every screen draws its own header; Arcade screens have `gestureEnabled: false` (Ysa: only the back button leaves). |
| Accounts | `frontend/auth/AuthProvider.tsx` (`useAuth().session.email`) | Progress is kept per account, as Rush Hour (`frontend/games/rushHour/progress.ts`) and the chat history do. |
| Storage | `frontend/games/rushHour/progress.ts` | AsyncStorage, key per lower-cased email, in-memory copy, failed writes are not fatal. |
| Design tokens | `frontend/theme/palette.ts`, `theme/tokens.ts` | NLEX blue #1464E8, navy #10284C, sky #DFF1FF, yellow #FFC32D; Nunito Black for brand titles. The game uses the same family of colours. |
| Mascot | `frontend/assets/mascot-*.png`, `C:\Users\Bela\Downloads\mascot` (designer source) | **Canonical Navie**: rounded blue compact car, blue cap with a white front panel and a blue ringed "N" badge, big blue eyes with lashes on a white windscreen face, pink cheeks, white "N" on the bonnet, smiling mouth between round headlights, side mirrors like ears, chunky black tyres with silver hubs. 3D-rendered, front or three-quarter view only. No rear view, no expression sheet beyond the mood videos (thinking, traffic, clear, alert, hello, waving, loading). |
| Maps / geography | `frontend/constants/nlexSegments.ts` | The 20 exits SmartFlow forecasts, north to south with km from Balintawak. Chapter 1 uses Balintawak (0) -> Meycauayan (14) -> Marilao (18) -> CDV / Ph. Arena (22) -> Bocaue Barrier (24, toll plaza), in real order. |
| Forecasts | `frontend/lib/forecastApi.ts`, `frontend/lib/feeds/forecast.ts` | `fetchForecastTimeline()` + `fetchStretchForecast(hoursAhead)` give each stretch's queue chance (0-1), typical delay and NB/SB share - the optional scenario adapter reads these. |
| WebView precedent | `frontend/components/map/MapboxSegmentMap.tsx` | Inline `source={{ html }}`, `scrollEnabled={false}`, `bounces={false}`, JSON `onMessage` bridge - the same pattern hosts the game. |
| Existing game | `frontend/games/rushHour/*`, `frontend/components/games/RushHourBoard.tsx` | Pure engine module + generated data + per-account progress hook; reused as the structural model. |

No `AGENTS.md` exists in the repository.

## 2. Architecture

**The game runs in a full-screen WebView** (canvas 2D for the world, HTML for menus and dialogue),
written in TypeScript with a small purpose-built engine. Reasons, from the inspection:

- Phaser was evaluated (the brief suggests it for web apps). This is not a web app: the game must run
  offline inside Expo Go, so Phaser (about 1 MB minified) would be inlined into the WebView page, and
  its scene, loader and physics systems are not needed for a lane-based driver. A ~100 KB engine
  that does exactly perspective road + sprites + fixed-step simulation is smaller and fully ours.
- Native Skia + Reanimated was the other option. It would make menus native, but nothing about it
  can be played or measured from a desktop; the WebView page runs unchanged in headless Chrome, so
  every screen can be screenshotted, played with keyboard and touch, and timed (FPS) during
  development. HTML menus also give real buttons, focus order and screen-reader text.
- The WebView is torn down when the screen unmounts, which destroys the canvas, loop, listeners and
  audio with it - re-entering cannot stack loops.

```
frontend/games/roadTrip/
  core/        pure TypeScript - no DOM, no React Native. Bundled into the page, imported by the
               RN host (save validation, scenario adapter) and by the Node tests.
    rng.ts            seeded RNG (mulberry32) - every run has a reproducible seed
    config.ts         world units, tuning, the four difficulty presets
    types.ts          shared types
    save.ts           versioned save: defaults, validation, migration
    progression.ts    Bolts, first-clear vs replay rewards, idempotent run commits, upgrades, team
    missions.ts       the journey's mission definitions and JOURNEY_EXITS
    patterns.ts       designed obstacle pattern library
    reachability.ts   safe-path check (time x lateral-position sweep)
    director.ts       picks, varies, validates and falls back on patterns per section
    sim.ts            fixed-step driving simulation: player, hazards, pickups, abilities,
                      convoy AI, staged rescue, finale encounter
    flow.ts           mission state machine (briefing ... return), guarded transitions
    dialogue.ts       authored story scenes, radio lines, garage banter + radio director
    scenario.ts       optional traffic-snapshot adapter: snapshot format, mapping rules, synthetic fallback
  web/         the page: art, renderer, input, audio, DOM screens, boot + host bridge
  generated/   roadTripHtml.ts - the built page as one string (do not edit; rebuild)
  host/        React Native side: per-account storage, forecast snapshot fetch
app/arcade/road-trip.tsx   the RN screen hosting the WebView
scripts/build-road-trip.js bundles web/ + core/ with the TypeScript compiler into generated/
scripts/test-road-trip.js  compiles core/ + tests with TypeScript and runs them with node:test
```

World coordinates are independent of the screen: lanes are 1 unit wide (three lanes, x in
[-1.5, 1.5]), distance ahead z in units, speeds in units/s. The renderer projects them with a
perspective camera recomputed on resize/rotation.

The simulation runs at a fixed 1/60 s step from an accumulator; a frame longer than 100 ms is
clamped (no big jumps after interruption). The page pauses on `visibilitychange`, `blur`,
`pagehide` and when the RN host reports the app going to the background; held inputs are cleared
and resuming needs a tap plus a 3-2-1 countdown.

## 3. The experience (the first three stops; the whole road is in section 12)

Loop: choose a destination on the map -> prepare teammates -> drive the mission -> story beat ->
Bolts -> improve the garage -> next destination unlocks.

Cast (built from Navie's visual language: rounded bodies, windscreen faces, big glossy eyes with
highlights, blush, round headlights, ear-like mirrors, chunky tyres, soft gradients and a dark
outline):

| Character | Vehicle | Personality / voice | Motivation | Relationship | Abilities (passive / active) |
| --- | --- | --- | --- | --- | --- |
| **Navie** (hero) | the existing mascot | cheerful, helpful, a little careful; the app's guide voice | help everyone get where they are going | - | - |
| **Kuya Jepoy** | jeepney | loud, warm, teasing big brother; Taglish ("Tara na!", "Kapit lang!") | get his passengers - the town band - to the Arena fiesta | mentor who teases Navie for being too careful | Pasada Pro (pick-up magnet) / Kuya's Shield (4 s protection) |
| **Kiko** | multicab mini-truck with a student-driver plate | shy, anxious, polite ("po"), earnest | deliver his Lola's parol lanterns to the fiesta - his first big delivery | Navie becomes his guide and friend | Early Lookout (warnings earlier) / Spare Parts (instant repair, 2 per run) |
| **Haring Barrikada** | fictional road-works machine (finale opponent) | booming, glitchy, not evil - its safety sensor is broken | "keep the road safe" by closing everything | reformed at the end; points to Chapter 2 | - |

Missions:
1. **Out of the Garage** (journey, Balintawak -> Meycauayan): interactive tutorial (steer, Bolts,
   cones, wrench), then a scenic route; meet Jepoy at the end. Jepoy joins: the Team board opens.
2. **Kiko's Convoy** (convoy/rescue, Marilao -> CDV / Ph. Arena). Revised 24 Oct after a second
   brief - see `AUDIT.md` section H. Story first: a roadside-assistance lay-by where Kiko's engine
   coughs and the friends react. Then two or three onboarding cards (first run only): Kiko follows
   your path; change lanes early and smoothly; Kuya's Shield covers you both. The drive:
   - **Following.** Kiko drives `KIKO_GAP` = 6.5 units *behind* Navie and steers for Navie's
     recorded position at his point on the road (the path is sampled by distance), at
     `KIKO_LATERAL` = 2.3 units/s against Navie's 3.0-3.5. A swerve sharper than he can steer
     leaves him off the line ("strain": an amber ! beside him, a radio line once, the objective).
     Navie's path between the two cars is drawn as a teal dotted ribbon.
   - **Collisions.** Each hazard can hit each car once. Navie meets it first, Kiko gap/speed later.
     A hazard that hits either car, or that the shield knocks aside, is spent for both. One met
     while a car is protected (after its own hit) passes that car only. Kuya's Shield covers both.
     The two cars never touch (fixed gap, Kiko on Navie's path).
   - **Recovery and failure.** A hit costs Kiko one engine bar, 1.6 s of protection and a visible
     cough (shake, grey puffs); gear parts give a bar back; the run fails when his engine reaches 0
     (Story: never).
   - **Fairness.** Every placement must leave a path for the convoy: hazards are copied as "Kiko
     shadows" timed for Navie's hitbox - static ones where they are (Kiko meets them where Navie
     did), traffic further ahead by (speed - approach) x gap/speed, lane changes sooner by the same
     delay - and the sweep assumes no more than 85% of *Kiko's* steering speed.
   - **Pacing.** Learn (single hazards, wide gaps) -> convoy patterns with traffic, weaves and
     potholes -> lay-by jump-start (Kiko parks behind, Navie lines up in front, cables charge while
     you hold steady - no mashing) -> a calm pick-up stretch -> busier convoy -> the empty last
     stretch, where Kiko pulls up alongside to arrive together. The shield is taught in play: the
     first time a hazard is about to reach either car while it is ready, Jepoy calls it out and the
     button bounces.
   - **Ending.** A friendship card on the results; at the Arena Kiko gives Navie Lola's parol, which
     then hangs over Navie's bay in the garage. Kiko joins: the Workshop opens.
3. **Jam at Bocaue Barrier** (finale, fantasy showdown at the toll plaza, closed to traffic): three
   telegraphed phases - Cone Volley, Barrier Sweep, Overheat - with Navie's horn pulses firing
   automatically at the machine's jammed gears only; repair drops between phases; "Team Honk" with
   Jepoy and Kiko ends it. Resolution at the fiesta, garage celebration, the machine's chip points
   north, and the road carries on (section 12).

Optional: **Snapshot Challenge** - a replayable run whose traffic density comes from a frozen
SmartFlow forecast snapshot, or a clearly labelled synthetic one when the forecast is unavailable.

## 4. Fairness rules

- Hazards appear only at the horizon (never on the player) and are checked before they are placed:
  the reachability sweep starts from the player's position at spawn time, waits a reaction allowance
  (difficulty dependent), then expands the reachable lateral positions at 85% of the real steering
  speed, removing every position a hazard (padded by the car's half-width and a margin) blocks at
  each time step. A pattern is placed only if some position survives past it; otherwise mirrored /
  shifted variants are tried, then a safe fallback (pick-ups or empty road).
- Convoy sections check Kiko's path too: hazards are shadowed for his arrival gap/speed later, and
  the sweep assumes his slower steering (see Kiko's Convoy above).
- One collision = one dent: the hazard is marked spent and the car gets post-hit protection.
- Seeds: every run's seed is shown in the pause menu; the tests replay seeds.

## 5. Progression

One currency, **Bolts**. Sources: collected on the road, completion, clean driving, teamwork,
discoveries (one postcard per mission, first find only). First completion pays the full completion
reward; replays pay a smaller one. Every run has an id; a run already committed is never paid
again, and the save (progress + Bolts + unlocks) is written as one object with a rising revision.
Upgrades are bounded (2 levels at most) and none is needed to finish the chapter on its starter
equipment. No timers, no paid or random items, no streak penalties.

## 6. Accessibility

Four presets (Story, Relaxed, Standard, Expert) with the changes listed on screen; game speed,
longer warnings, automatic teammate ability, drag or lane-button steering with sensitivity,
left/right-handed ability button, text size, reduced motion (no shake, fewer particles, no
parallax), high-visibility hazard outlines, separate music / effects / voice volumes. Hazards carry
shapes and stripes, not only colour. Menus are HTML buttons with visible focus and keyboard support;
radio lines are mirrored to a screen-reader live region; story text advances at the player's pace
with skip and a log. Primary touch targets are at least 48 CSS px.

## 7. Asset provenance

| Asset | Source |
| --- | --- |
| Navie (all in-game drawings) | Project-native canvas drawing written for this game, matched to the canonical render in `frontend/assets/mascot-waving.png` / `mascot-loading.png` (designer art by Ysa's team). The canonical render itself is shown on the Arcade card. |
| Jepoy, Kiko, Haring Barrikada, traffic, scenery, garage, map, icons | Project-native canvas drawing written for this game (no external images). |
| Brand title font | Nunito Black (SIL OFL), from the app's own `@expo-google-fonts/nunito`. |
| Sound | Synthesised at runtime with Web Audio (no audio files). |

## 8. Implementation sequence (all done, 24 Oct 2026)

1. core (rng, config, save, progression, missions, patterns, reachability, director, sim, flow,
   dialogue, scenario, bot) + Node tests.
2. web: art + sprite cache, renderer, input, audio, DOM screens, boot/bridge.
3. Build script, RN host screen (`app/arcade/road-trip.tsx`), Arcade card, route registration.
4. Headless-Chrome harness: screenshots per screen, scripted play-throughs, frame times.
5. Audit passes A-G (AUDIT.md), fixes, re-checks.

## 9. Working on it

- **Edit** `core/` or `web/`, then **rebuild**: `node scripts/build-road-trip.js` (writes
  `generated/roadTripHtml.ts`; add `--html out.html` for a browser copy with debug tools: open it
  with `?debug=1`, `?fresh=1`, `?sheet=cast|faces-navie|compare|drive`). The app only ever loads
  the generated file - forgetting to rebuild ships the old game.
- **Test**: `node scripts/test-road-trip.js` (76 tests: flow, reachability, fairness, seeded
  play-throughs of every mission and preset, heroes, sidekicks, caps, power-ups, checkpoints,
  goals, Endless, rewards, evolution, saves and the v1 -> v2 migration, snapshot adapter, radio).
- Debug API in the browser copy: `window.__rt.go('mission', 'm2-convoy')`,
  `__rt.mission().debugBegin()`, `__rt.autoplay(true)`, `__rt.mission().debugAdvance(30)`.
- Controls: drag pad under the car (sensitivity 0.5-2x) or lane buttons; keys Left/Right or A/D,
  Space/Shift/E for the signature (TEAM HONK in the finale), 1-3 at a checkpoint, Esc/P pause,
  Enter advances story text.
- Tuning lives in `core/config.ts` (presets, abilities), `core/missions.ts` (sections, rewards),
  `core/patterns.ts` (pattern library), `core/progression.ts` (bonuses, upgrade costs).
- Save key on the phone: `smartflow.roadTrip.<email>` (AsyncStorage); unreadable saves are copied
  to `.unreadable-<time>` before being replaced.

## 10. Tollbound Heroes (third brief, 25 Oct 2026)

### Identity
The player-facing name is **Tollbound Heroes** everywhere: Arcade card, page title, loading label,
title logo ("A SmartFlow NLEX game - Chapter 1: Fiesta at the Arena"), a small "Tollbound Heroes"
kicker over the Garage, Journey Map and Settings & help headers, the help text and the reset prompt.
SmartFlow NLEX stays the parent (title line, "Back to SmartFlow"). The title is a team line-up in
front of the garage (chosen hero in front, the others behind, locked heroes as silhouettes, the two
equipped sidekicks hovering) with blinking, bobbing and a hop when picked, and **Play/Continue,
Team, Settings, Back to SmartFlow**.

### Hero + two sidekicks
The **hero** is the only collision body: its own steering speed and hitbox, an **automatic horn**
(pulses that knock out Barrikada's bots and hit open boss gears - never traffic), and one
**signature** on the button (optional automatic assist in Settings). **Sidekicks** hover beside and
just behind the hero (`FORMATION_X` 0.7 lanes, tucked behind at the road edge; evolved ones wear a gold halo), never collide,
and act on their own. The convoy's escort Kiko is a separate NPC, not a sidekick.

| Hero | Feel | Horn | Signature (cooldown) | Strength | Trade-off | Earned |
| --- | --- | --- | --- | --- | --- | --- |
| Navie | balanced, hitbox 0.26 | every 0.34 s, 1 dmg | Route Sense: road at 60% for 4 s + green arrow on the clearest lane (18 s) | buys time anywhere | no protection | start |
| Kuya Jepoy | 12% slower, hitbox 0.30 | every 0.46 s, 1.6 dmg | Kuya's Shield: 4 s, bounced bots take a hit (16 s) | +1 dent before failing | slower, wider | after mission 1 |
| Kiko | 10% faster, hitbox 0.22 | twin darts every 0.28 s, 0.4 dmg each | Gear Scan: 5 s of x2 damage on bots and gears (16 s; the auto-assist fires it at a lined-up gear or 2+ bots) | warnings 0.6 s earlier | weakest pulses | after mission 2 (not in the convoy he is escorted in) |

| Sidekick | Role | Base -> evolved | Earned |
| --- | --- | --- | --- |
| Pip | focused darts at the nearest bot/gear | 1 dart / 1.1 s, 30 range -> 2 darts / 0.85 s, 34 | start |
| Mila | pick-up magnet | 1.1 lanes -> 1.6 lanes, also pulls power-ups | start |
| Bantay | guard: absorbs one hit | recharge 24 s -> 18 s (never while other protection is up) | after mission 1 |
| Kumpuni | repairs a dent | 1 per run, 35 s -> 2 per run, 26 s | after mission 2 |
| Bumbo | chain zap | 2 targets / 3.2 s -> 3 / 2.6 s | after mission 3 |
| Silip | scout + jam | warnings +0.4 s (also lengthens boss telegraphs), jams the most threatening bot (x2 damage for 1.5 s) or delays a throw, every 10 s -> +0.7 s / 7 s | 1,000 m in Endless or a Snapshot clear |

**Caps** (`core/roster.ts`): protection windows take the longer, never the sum, and never exceed 6 s;
non-wrench repairs at most 3 per run; damage multipliers capped at x2; magnet reach x2; team warning
lead +1 s. The loadout is fixed when a run starts (the pause menu's Team tab shows it, locked).

**XP and evolution** are predictable: every equipped sidekick gets 40 XP for a win (15 for a
failure, +20 on a first clear). Evolving costs 150 XP + 2 Gear Cores + 80 Bolts, once, and changes
both the look and the numbers. Gear Cores come from first clears (1/2/3 for missions 1-3, 1 for the
Snapshot), 1 per later win of missions 1-3, and the Endless milestones (1,000 / 2,000 / 3,000 m, once each).
No random draws, no duplicates, no paid items.

### Run variety
- **Power-ups** (capsules on the road): Spread Horn 8 s, Bolt Magnet 10 s, Bubble Shield 4 s,
  Sidekick Rally 8 s; a radio line, a toast and a HUD chip with seconds left; picking the same one
  again refreshes it, never stacks.
- **Checkpoints** (a calm stretch in missions 1, 2, the Snapshot, between boss phases and every
  700 m in Endless): it opens only once nothing is left on the road around the car (a boss break
  knocks the machine's throws aside first), then the simulation freezes and three temporary run
  upgrades are offered, each with a gain and a cost (keys 1-3, Esc to skip). At most 4 per run.
  In Endless a checkpoint can also bank the run: banking keeps the whole distance reward, a crash 70%.
- **Road goals** per section ("Zap 8 bots", "Collect 15 Bolts", "Clean stretch") with icon + progress.
- **Gradual introduction**: the tutorial adds a "pulse" step; mission 1 then brings bots and the
  first power-ups, mixed patterns (bots with barriers or traffic) only after its checkpoint; the
  convoy and finale build on that.
- **Quick start**: a new player's Play goes opening (skippable) -> mission 1 briefing directly;
  Continue goes straight to the garage; the convoy cards only show on a first run.
- **Endless Expressway** (after mission 1): escalating 700 m cycles on the same systems; local best
  distance and score are shown as "your best on this phone - not a verified ranking".

### Barrikada, rebuilt for readability
Closer (z 25), with each phase announced by a banner in the radio slot (so the machine stays in view)
and a short tip: **1 Shifting Gears** (line up with the open gear), **2 Barrier Sweep** (two gears
open at once - sidekick darts and zaps land on the second), **3 Overheat** (grab 3 sparks, then
TEAM HONK). Open gears get an oversized outlined, turning gear glyph, a target ring with corner
ticks and a label (OPENING / OPEN / OPEN x2 / LOCKED ON - shape, word and colour, not colour
alone); hits flash the gear white, kick the camera and pulse the Jam bar. The **Jam meter counts
down** (100% -> 0%) with ticks at the phase floors, and every text says so. **TEAM HONK**: the charge
shows as three spark pips; when full the button turns orange, says "TEAM HONK - Press!", and fires
by itself after 15 s if not pressed (at once with the auto-assist; never a soft-lock); sparks keep
coming after a miss. The moment it is charged, everything still on the road is knocked aside, so a
won fight can no longer be lost while the button waits. The honk itself: a white fade, rings from the
machine, confetti and a banner; the machine powers down in smoke. Gear damage follows each hero's
pulse strength (phase times within about 14-18 s for all three heroes on Standard, no sidekicks).
Bots are clearly fantasy machines (cone-bots, drum-bots, sign-bots with faces and HP pips); real
traffic is never targeted.

### Screens
Garage (status line: postcards, sidekicks n/6, Gear Cores; Map, Team, Collection, Workshop, Endless),
**Team** (hero cards with stat bars, signature, strength/trade-off; two slots; sidekick grid with
range/cooldown/targets/limits; the stage cheers the pick), **Collection** (evolution previews
before -> after, XP bar, what is missing, Evolve), Workshop (permanent upgrades, unchanged), Map.
**Results** lead with the celebration (team portraits, Bolts total, the headline reward), then XP and
unlocks; the Bolts breakdown is a collapsible "Details".

### Saves
`SAVE_VERSION` 2, same key. `migrate()` v1 -> v2: recruited friends become heroes; sidekicks are
granted by what was already completed (Bantay for mission 1, Kumpuni for 2, Bumbo for 3) plus the
starter Pip and Mila; Gear Cores for past first clears; the old team board is dropped;
`processedRuns` is kept so old runs are never paid again. Reading validates heroes, sidekicks,
loadout (no duplicate slot, owned only) and Endless records.

### Performance work (see AUDIT.md section I)
Formation sidekicks, the hero, the gantry sign, text tags and the gear glyph are pre-drawn sprites;
badge faces and the radio portrait redraw only when the face changes; HUD rings move in steps and
the HUD's changing parts sit on their own compositor layers.

## 11. Arcade skin (fourth brief, 29 Oct 2026)

A presentation-only pass toward a cute, polished mobile-arcade look (EverWing was the reference for
the *feel*: compact HUD, round ability button, boss bar, character cards; nothing of its art or
layout was copied). **No mechanic changed**: `core/` is untouched, the 76 tests pass unchanged, and
every control keeps its box (signature 100 x 100, lane buttons 84 x 84, pause 52 x 52, the pad).

- **Style**: navy panels with a dark outline and a light top edge; numbers and titles in Nunito
  Black with an outline; gold for rewards and the main call to action; icons are one inline-SVG
  family drawn in `web/ui/arcadeIcons.ts` (currentColor, aria-hidden).
- **HUD** (`web/ui/hud.ts`): the hero's face rides the route bar (Kiko's just behind it); condition as
  hearts that crack, Kiko's engine as teal pips; a gold Bolt counter that pops when it grows; power-ups
  as round badges whose ring drains with the time left; sidekick medallions with the recharge ring and a
  state pill; the signature as a round orb inside the unchanged button - gold when ready, blue with the
  seconds when on, grey with the seconds when recharging, dashed when unavailable, orange-red for TEAM
  HONK. Ribbon banners for boss phases (a numbered badge, gold for the honk), and a 1.5 s TEAM HONK
  cut-in (hero and sidekicks over rays; decoration only, `pointer-events: none`).
- **Boss**: the Jam meter is a purple boss bar with Barrikada's face, a striped orange fill, phase
  ticks and a PHASE chip (hidden under 380 px, where the banner still names each phase); open gears
  glow gold (green when lined up) behind the existing glyph, ring and label; a shock ring in the
  phase's colour at each phase change; sparks get a turning cyan halo.
- **Road** (`web/render/drive.ts`, `web/art/foes.ts`): Barrikada's bots keep their violet body and
  glowing red-orange eyes but have cheeky faces (two eyes, brows, a one-fang grin, blush; > < when
  hit), a violet glow on the road (traffic never has one) and a small march hop drawn above their
  unchanged road position. Warnings are pre-drawn rounded signs with a chevron, spread so left, middle
  and right never overlap. The horn wave, the knocked-out "pop", the Bolt flying to the counter, the
  wrench's green crosses and each capsule's burst are cached sprites or pooled particles.
- **Menus and overlays**: chunky outlined buttons (gold CTA for Play, Continue, Journey Map, Start,
  Resume); hero and sidekick cards tinted per character with a gold frame and a check when chosen, a
  lock when not yet earned, and a hop on the card just picked; checkpoint upgrades as picture cards
  with a GAIN row and a COST row (an up / down tag and the words, never colour alone); ribbon titles
  with an icon on every sheet; results with rays behind the team and a gold Bolt total.
- **Motion and access**: decorative motion is transform / opacity only; reduced motion turns off the CSS
  animations, the pops (`hud.ts`), the Bolt flights and the warning pulse. Every gradient the HUD text
  sits on has a solid colour under it (contrast checked: lowest 8.3:1). Big text keeps the pad hint and
  the orb readable (the pad's side room is in px; orb and medallion text is capped).

## 12. The whole road (fifth request, 2 Nov 2026)

Ysa asked for all the exits in the game, no more chapters in the story, and more sidekicks to unlock.
The game is now one journey, Balintawak to Sta. Ines, with nothing called a chapter anywhere a player
can read (a test checks this).

### The road

Every one of the 20 canonical exits (`frontend/constants/nlexSegments.ts`) is on the map, in the real
order, as `JOURNEY_EXITS`; a test compares the two lists. `JOURNEY` in `core/types.ts` is the 16
missions in order, each requiring the one before.

| # | Stop | Kind | Who joins |
|---|---|---|---|
| 1 | Meycauayan (passes Harbor Link, Paso de Blas) | journey, tutorial | Kuya Jepoy, Bantay |
| 2 | CDV / Ph. Arena (passes Marilao) | convoy | Kiko, Kumpuni |
| 3 | Bocaue Barrier | boss: Haring Barrikada | Bumbo |
| 4 | Bocaue Interchange | journey | |
| 5 | Tambubong | journey | Walis |
| 6 | Tabang | journey | |
| 7 | Balagtas | journey | Barya |
| 8 | Sta. Rita | convoy | |
| 9 | Pulilan | journey | Sibat |
| 10 | San Simon | journey | |
| 11 | San Fernando | boss: Prinsipe Barrikada | Tala |
| 12 | Mexico | journey | |
| 13 | Angeles | convoy with a rescue | Ilaw |
| 14 | Dau | journey | Maso |
| 15 | SCTEX | journey | |
| 16 | Sta. Ines | final boss: Reyna Barrikada | |

**Three exits have no level of their own.** Harbor Link, Paso de Blas and Marilao are driven past under
their gantry signs on missions 1 and 2, and are small dots on the map whose sheet says so and offers
that mission. Splitting them out would have meant rebuilding the tutorial and the first convoy, which
carry the most tested part of the game. It is a data change plus a story beat if it is ever wanted.

New stops are data (`leg` and `convoyLeg` in `core/missions.ts`), reusing the sim's section types. The
tier rises along the road through `roadPools` and `legGap`. There is no new mechanic for a stop. The
new bosses are the same three-phase fight as Barrikada, in new colours (`SKINS` in `web/art/boss.ts`)
with their own name on the HUD and radio (`RadioDirector.machine`).

Kiko cannot be picked as the driver on any convoy (`heroBlockedFor`). The convoy teaching cards and the
friendship card belong to mission 2 only.

### The six new sidekicks

Each joins by `SIDEKICK_DEFS[id].unlock.after`, and `core/save.ts` derives the roster from finished
stops, so a damaged save gets them back. Silip still comes from the Endless 1000 m milestone.

| Sidekick | Job | How it differs |
|---|---|---|
| Walis | sweeps cones and barriers out of the hero's lane | the only one that touches roadworks; never traffic |
| Barya | passive: some Bolts count double | 25%, evolved 50% |
| Sibat | a lance through the busiest lane | hits everything in that lane at once |
| Tala | passive: the hero's signature recharges faster | 25%, evolved 50% |
| Ilaw | holds the road back just before a hit | long cooldown; the same slow as Route Sense |
| Maso | one heavy swing at an open gear, or the toughest bot | slow and strong |

Their art is in `web/art/sidekicks.ts`. `FIT` scales the tall and wide ones so they stay inside the one
`SIDEKICK_BOX`; `?sheet=crew` reports any overflow, because the sprite cache would clip it.

### Screens

- **Map.** A tall scrolling sheet (`web/art/mapArt.ts`, one canvas drawn once), DOM nodes on top, and
  it opens on the next stop. The scroll belongs to `.map-scroll`, and `.actions` is sticky so Play is
  always reachable. In landscape the road keeps to the 54% the sheet leaves free.
- **Story.** `backdrop: 'exit'` is any stop: its own gantry sign, time of day and horizon. `plaza` takes
  `sign`, and `fiesta` takes a `landmark` in place of the Arena dome. `guest` hovers a new sidekick over
  the cast, or beside a machine.
- **Garage.** The dock draws cached sprites in two rails above six sidekicks (up to twelve vector
  sidekicks a frame would be too heavy). The postcard wall shows the five most recent.
- **Old saves.** Still version 2. Progress is untouched, and a one-time `road-north` garage event tells a
  returning player what is new.
