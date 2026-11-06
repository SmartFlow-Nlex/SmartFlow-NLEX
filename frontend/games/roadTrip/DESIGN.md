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

## 13. The clay road trip (sixth brief, 3 Nov 2026)

The brief asked for a charming Philippine road-trip game with tactile, handmade warmth, keeping this
game's own identity: vehicle heroes, two companion slots, the real route, and the personalities of Navie,
Kuya Jepoy, Kiko, Pip and Mila. Everything below is original art; nothing is copied from another game.

### Rendering: baked clay, not a new engine

The renderer stayed a 2D canvas in the WebView, because replacing it would have risked the whole game for a
look that sprites can give. What changed is where the sprites come from:

- `scripts/tollbound-art/` holds a small signed-distance modeller (`sdf.js`), a ray-marcher (`render.js`)
  and the models (`scenes/`). `bake.js` renders them in worker threads, caches them in `.cache/` (ignored by
  git), encodes WebP through headless Chrome, and writes `assets/art/*.webp` plus `manifest.json`.
- `web/art/clay.ts` draws those sprites; `web/art/clayFaces.ts` paints faces on at run time from the points
  the bake stored, so 8 expressions need no extra art. Eyes, brows and mouths vary per character.
- `web/render/roadscape.ts` is the new road: textures sampled row by row, painted lines as vector shapes,
  authored scenery clusters, overpass, hills and four moods.
- The build inlines the art as `window.__TB_ART__` in its own script; `generated/roadTripHtml.ts` is now about
  2.5 MB. Sprites decode on demand: `preload()` covers the active team and road, everything else is lazy.

Rebake with `node scripts/tollbound-art/bake.js [prefixes]`, then rebuild. After a bake, regenerate the
briefs with `node scripts/tollbound-art/write-briefs.js` (`assets/art/BRIEFS.md`: identity, silhouette,
palette, materials, views, scale, pivot, animation states and paths for every hero and companion).

### Direction

Palette tokens in `web/styles.css`: paper `#F8EDD8`, ink `#354844`, jade `#69AFA4`, guava `#D7A9A2`, gold
`#E9B54C`, Navie `#3E74B9`. Road colour comes from the mood. Type is Nunito at about 16 px, with Nunito Black for
headings. Rear view while driving; faces only in portraits, garage and cards. Hazards keep a contact shadow, and
scenery always stands past the guardrails.

### World moods (`core/moods.ts`)

`morning` (provincial fields), `town` (edge of town, overpass, sari-sari and stalls off the road), `lantern`
(Pampanga evening, parols) and `rain` (gentle, wet road). Each stop has one, and Endless cycles them. The garage
is the hub: tools, souvenirs, a postcard wall, and the unlocked heroes parked. Mood affects the look, plus
small capped rules (gust, rain, rough road) that are announced before they arrive.

### Roster: 12 heroes, 27 sidekicks

The brief proposed 18 sidekicks. The game already had 12 tied to the story and to saves, so all 12 stay and the
brief's new ones join them, for 27. Bantay was in both lists: same id, same guard job, same unlock after Mission 1,
redrawn as an aspin with a scarf, plus the once-per-run buffer. The brief's hero "Tala" is named **Hiraya** because
Tala is already a sidekick; the brief allowed working names.

`core/rosterNew.ts` holds the new definitions. `core/tuning.ts` holds the global caps (signature cooldown floor,
pulse interval floor, rally, recovery, shield extension, Bolt bonuses, weather reduction), the upgrade
preview maths, and five deliberate pairings (Ligaya + Piko, Kuya Jepoy + Kawayan, Nico + Tarsi, Kidlat + Bitu,
Amihan + Ulap). Hero stats are computed from the real numbers, so a bar can't drift from what the car does.

### Economy (`core/unlocks.ts`)

Unlock, improvement and friendship are separate. Original characters keep their story unlocks; new ones have one
measurable goal, kept in `save.tally`, shown as progress on locked tiles.

The brief's numbers were proposals, to be tuned against real play. Measured along the road, one stop gives about 100 to 150
Bolts, 30 to 50 hazards passed and 20 pick-up chains, so "100 Bolts" and "5 chains" fell inside the first mission, and a first
run brought five new characters at once. Now, with an autopilot and with a deliberately sloppy driver, a first run brings at most
one by goal (Tarsi, for the first postcard) on top of the story's own, no run brings more than three, and both drivers end
the first pass with people still to earn (a test holds this):

| Who | Brief | Now | Why |
| --- | --- | --- | --- |
| Ligaya | 2 chain objectives | 40 chains | Chains come about 20 per stop |
| Piko | 5 chains | 100 chains | Same |
| Kape | 100 Bolts | 300 Bolts | About 100 to 150 per stop |
| Sago | 20 hazards | 150 hazards | About 30 to 50 per stop |
| Sampy | 3 clean stretches | 6 | Berto keeps the 3; they no longer arrive together |
| Saranggola | 2 collection objectives | 3 runs with the postcard | "Or 3 chains" was true of every run |
| Duwi | 4 checkpoint upgrades | 6 | Spreads the early stops |
| Kidlat | not set | 100 bots | About the end of the first pass |
| Bitu | not set | 200 pulses | Late in the first pass |

After a save upgrade, everyone earned joins, but only the first 3 get a reveal. "Later" pauses any others until the next garage
visit. Friendship is runs together and gives
words only. Charms decorate the garage and change nothing on the road. A new character gets a reveal with an
equip button. `window.__rt.unlockAll()` (debug builds only) and `?sheet=roster|faces|drive` are the dev gallery.

### Screens

- **HUD:** route, health and Bolts in a compact block; pause on the left, all secondary settings inside pause; a
  measurable goal chip; callouts that leave; the steering hint only during the tutorial (help is in pause);
  signature bottom right with its cooldown ring; sidekick status tiles bottom left, not buttons, with state shown by
  shape and motion as well as colour. A touch on a tile does nothing, and does not fall through to steering.
- **Team:** a lively stage, Hero and Sidekick tabs, one horizontal strip of tiles, a scrolling panel with role,
  signature, passive, limit, labelled stats and unlock progress, and one action in the footer. Looking is not
  equipping.
- **Collection:** counts and progress for everyone, plus friendship, charms and evolution.
- **Checkpoint:** two lines per card, gain and cost, as the real numbers (`Signature recharge 18 s → 22.5 s`) from
  `previewUpgrade()`, the same calculation the run uses. The road is frozen behind it. "Continue without upgrade"
  is always there. Keyboard hints only show with a real mouse and keyboard. Duwi reshuffles once per run.
- **Briefing:** win and fail always; rules fold away once a stop is done; the team as faces and names.

### Saves

`SAVE_VERSION` 3. The 2 → 3 migration keeps everything and seeds `tally` from what the save already knows (lifetime
Bolts, checkpoints and clean stretches from records). It is idempotent, and `applyUnlocks` runs on load, so an old
save earns what it already deserves (with a reveal). `commitRun` applies tally, friendship and unlocks in the same
save write as the rewards, keyed by run id, so a repeated commit pays nothing twice.

### Limits worth knowing

- Baking needs Node and Chrome on the developer's machine. The game itself needs neither.
- Sprites are one fixed set of views, so a hero is not free to turn through every angle. Steering shows a three-quarter
  view mirrored for the other way.
- A fresh person has not played this, and no phone has run it yet (AUDIT.md section L).

## 14. Character polish (seventh brief, 4 Nov 2026)

Ysa asked for cuter, more polished heroes and sidekicks in the spirit of EverWing's character presentation, with
everything else left exactly as it was: road, scenery, camera, traffic, mechanics, controls, hit boxes, abilities. The quality
bar was `frontend/assets/mascot-loading.png`. Nothing in `core/` changed, and no road or scenery sprite was rebaked.

### Finish

`scenes/polish.js` moves character models onto a set of materials only they use (`gloss`, `satin`, `felt`, `pane`, `lens`, `lamp`,
`tread`, `chrome`, `jelly` in `render.js`), under softer light. Gloss has a clear coat reflecting a small procedural studio: sky, ground,
one big soft window of light, a cool strip. Metal reflects in its own colour. Tyres get ribs and a sidewall ring from the renderer, headlights
are glass domes in a rim, tail lights are candy lenses. The world's materials and code path are untouched, so traffic and scenery
still bake to identical sprites. Paint can be limited to one group with `on`, so a seam on a cap cannot run on down the car.

### Models

- **Navie** is remodelled towards the mascot: round hips, a bubble cabin, a wide curved visor. From behind, the cap now has six panel
  seams, a button, a small N badge and a white-edged half-moon opening with a strap, so it reads as a cap on the road.
- **Bumbo** is a saturated orange bean with a round porthole at the back and a tall bent antenna carrying the gold dish, tipped back so the gold
  shows from behind. **Mila** is candy pink, with two mint antennae rising in a U, uneven as if listening, ending in cream magnet tips. **Pip** has a striped
  parasol. All keep their colours, accessories and jobs.
- Every other hero and sidekick takes the finish, wheels, lamps and glass through the shared kit, with the same shapes.

### Motion (looks only, all in `render/drive.ts`)

- The lean is a soft spring instead of a straight chase, and a breath of squash goes with it.
- The car steps through three real views (`rear`, `mid`, `turn`, mirrored for the other side). Blending two views was tried first and showed four tail
  lights mid-turn. Navie wears letters, which a mirror turns backwards, so Navie alone also has `midR` and `turnR`.
- `blitBent` draws a sprite in rows with its top swayed, so Navie's cap trails a turn and Mila's antennae wave with no extra sprites.
- Flyers ride a slow swell and road sidekicks give small hops. Their tilt trails the car.
- `render/sidekickFx.ts`: each of the 27 has its own small flourish when its ability fires, within about one body of it. Reduced motion turns
  the sway, spring, squash and flourishes off.
- Contact shadows have two layers: broad soft shade and a tight dark line under the tyres. A flyer's shade softens as it rises.

### Faces and Team

Eyes have a big and a tiny catchlight, the same way round on everyone; iris eyes have a white, a deepening colour disc and a pupil; cheeks are soft blush.
Team tiles use one scale per kind of character with feet on one line, a contact shadow and a wash of the character's colour. Selected tiles lift 2 px with a thin edge in that colour,
a soft glow and a small bar. The stage has a pool of light on the floor. Names, abilities and the selection system are unchanged.

## 15. Sculpted fronts (eighth brief, 4 Nov 2026)

Ysa was happy with the characters from behind but not from the front: awkward, poorly proportioned, less polished. The brief was to fix the
models themselves, not to hide the problem, and to leave the rear views, road, scenery, camera, mechanics and abilities exactly as they were.

### Why the fronts were weaker

The rear views were pure geometry; the fronts were not. Inspecting the pipeline showed:

- **Faces were flat decals.** Eyes, brows, mouths and cheeks were 2D drawings painted over the finished picture at run time, so they had no depth, took no light or
  shadow, and were never occluded by anything. That is why they looked as if they floated.
- **Face panels were painted ovals** with a hard edge on a body built separately, so they read as stickers rather than windscreens.
- **Headlights were discs** up to two thirds the size of an eye, stuck on the nose, with the mouth squeezed between them.
- **Eyes, mouth and lamps were never designed together:** each was placed on its own, on whichever surface was nearby.

### What changed

`scenes/sculpt.js` puts the face into the model. It finds the real surface with a ray, so everything sits on the curve that is actually there, then:

- **Eyes:** a real ball, seated in a soft swelling of the skin, with a lid opening cut round it. The rim, the crease and the shadow are all geometry and light.
- **Smile:** a shallow groove cut along the surface, following its curve, in a deep shade of whatever it is cut into. On a car it sits where a grille would.
  Jepoy's grille itself is the smile: its slats hang deepest in the middle.
- **Lamps:** smaller glass domes in a thin dark seat. Radius is down to about half what it was.
- **Blush:** painted into the surface, so it curves with the face.
- **Windscreens:** a rounded pane with a seal in a deeper body colour, wrapping the cabin, in place of an oval.
- **Bumpers:** plump, and wrapped round the nose.
- Skin colour, material and shade come from the survey, so all 39 faces use one kit and match their own bodies.

`render.js` measures each eye opening as it draws (`track`), and `bake.js` stores it per view with the iris position, the foreshortening and the local skin colour. At run time
`clayFaces.ts` draws only what moves, always clipped to that opening: iris, pupil, catchlights, the lid's shade, and lids that close in the skin's own colour. So an eye cannot
float or stray outside its lid, at any angle. Machines (Barrikada and friends) keep their older painted faces; the brief was about heroes and sidekicks.

### Rear views

Rear jobs bake from each character's original part list and the sculpted front is its own list, so rear sprites keep the same hash and are not even redrawn. The exceptions are
Bumbo and Mila, whose antennae the brief asked to attach more naturally, seen from every side.

### Angles and motion

Fronts are baked at 0, 15, 35 and 55 degrees (`face`, `front`, `q`, `q2`) for heroes, and 0, 15, 35 for sidekicks. The other side is a mirror image, except Navie, whose lettering has
its own views. `viewFor` picks the nearest. Eyes look most of the way toward the viewer whichever way the body turns.

On the Team stage someone newly picked swings in from the side on a soft spring and settles at 15 degrees, with a moment of delight on their face; the two sidekicks turn slightly in toward
the hero. At rest: blinking, small quick glances (`idleGaze`) and a slow breath. Reduced motion holds them still at rest.

`node scripts/tollbound-art/review.js out.png [names]` renders any character from the front, both three-quarters, both sides and behind, for checking. It is not part of the game.

### Four that needed more than a face

Silip, Sibat, Ilaw and Kalaw have `frontParts`, a front model reshaped where the face goes. They keep their accessories and identity; their rear views still come from `make`.

- **Silip:** the lens was as wide as the face, and the eyes were squeezed up by the arms. It is now a smaller lens, set as a round nose between proper eyes.
- **Sibat:** a rounded nose in its own red, in place of a point aimed between the eyes.
- **Ilaw:** the amber lamp is the face, so it is the big one, with red and green smaller above and below.
- **Kalaw:** beak and casque are smaller and clear of the eyes, with the beak below them and the casque on top of the head.

Sago's pearls beside the face moved out to the flanks. Ulap has a smooth mound under the face, because the cloud's lumps made the eyes uneven. Saranggola has a pad behind the face, because the eyes showed through the paper.

### Limits

- Mouths: the baked smile is always there. Opening for speech or delight draws over it; a worried or hurt face keeps a small smile, and shows the feeling through eyes and brows.
- Rotation is in steps between baked angles, quick enough to read as a turn. It is not free rotation.
- The in-between angles are baked smaller than `front`, because only `front` is ever held: `face` 0.68, `q` 0.66 and `q2` 0.6 of its sharpness. Change `FRONT_YAWS` in `scenes/index.js` if one is ever held on screen.
- Bitu's pebbles and Ulap's raindrops float by design, as they did before. Amihan's ribbon tail is unchanged because it belongs to the rear view.

## 16. The collection (ninth brief, 5 Nov 2026)

Ysa asked for every hero and sidekick to move to a cute, whimsical, hand-painted look inspired by the charm of Ooblets (an original identity, nothing copied), with four new heroes, six new sidekicks and real unlocks. The expressway, camera, controls, collisions and every existing ability were to stay exactly as they were. The reference images the brief mentions did not arrive with it; only the text did.

### Names

Five of the ten names the brief asked for already belonged to someone, and the brief also said not to break existing characters. The new characters keep the brief's design, ability and unlock, under a close name of their own. Changing a display name is one line in `core/rosterNew.ts`.

| The brief's name | Already | New name | Why |
|---|---|---|---|
| Tala (hero) | a sidekick | Ningning | "Sparkle" |
| Amihan (hero) | a hero | Simoy | "Breeze" |
| Piko (sidekick) | a sidekick | Kono | "Cone" |
| Tiko (sidekick) | a hero | Radyo | "Radio" |
| Ulap (sidekick) | a sidekick | Hamog | "Mist" |

Sikat, Tali, Kislap, Dahon and Ginto kept their names.

### The look

- **Materials.** `render.js` has a new character finish: `painted`, `soft`, `felt`, `tin` and softer `pane`, `lens`, `lamp`, `tread`, `jelly`. Almost nothing is mirrored. Light wraps further, shadows warm toward plum, and a `brush` value paints broad blotches of warmer and cooler colour with a little direction in them. World materials are untouched, and the `finish` key in `CHARACTER_LIGHT` is part of each job's hash, so changing the finish redraws characters and nothing else.
- **Eyes.** Small dark ovals, seated in a soft dimple in the real surface by `scenes/sculpt.js`. They are part of the model. Only the glints and lids are drawn at run time, clipped to the outline the bake measured.
- **Faces belong together.** The mouth moved up beside the eyes wherever a windscreen is the face, so features read as one small face rather than eyes on the glass and a grin on the bumper.
- **Softer fronts.** Smaller seated lamps, panes that melt into the paint, Navie's bumper blended into the body.
- **Rear views are the same shapes in the new paint.** The rear part lists were not edited: 65 of 65 outlines are unchanged.

### No two faces alike

Three things combine, so the roster is not one face in many colours:

1. **Sculpted in the model** (`sculpt` in `heroes.js`, `FACE_TUNING` in `sidekicks.js`): eye height, width, spacing, tilt, colour, and smile shape (`smile`, `cat`, `smirk`, `wave`, `flat`).
2. **Resting lids and glints** (`RESTING` in `clayFaces.ts`): heavy lids (Berto, Kape, Dahon, Hamog), keen lids (Tiko, Ginto), a narrowed eye (Nico), a mouth a little open (Ligaya, Pip, Bantay), brows that stay on (Kuya Jepoy, Maso, Bitu). Everyone else shows small brows only for a strong feeling.
3. **How they move** (`HERO_MOTION` and `RHYTHM` in `clay.ts`): each hero has its own idle and its own reaction to being picked. Navie gives one confident bounce, Ligaya dances, Berto rocks slowly, Ningning throws tiny gold stars, Tali cheers. Bumbo's top really does spin, and floaters like Mila rise slowly.

None of the motion exists on the road, where movement belongs to the game.

### New heroes

Each is a real signature on the existing mechanics, never a new system.

| Hero | Role | Signature | Uses | Passive | Earned by |
|---|---|---|---|---|---|
| Ningning | Offensive | Star Horn, 5 s, 17 s recharge | Spread Horn | Spread capsules last a quarter longer | Clear 150 bots |
| Simoy | Control | Breeze Sense, 4 s, 16 s | Route Sense's slow, no arrow | Warnings 0.2 s earlier | Drive 25 km |
| Sikat | Defense | Sun Shield, 3.5 s, 18 s | Bubble Shield | One extra dent | Survive 2,000 m in Endless |
| Tali | Support | Team Rally, 6 s, 18 s | Sidekick Rally | Sidekicks act 10% more often | Barkada with 3 teammates |

### New sidekicks

| Sidekick | Ability | Uses | Earned by |
|---|---|---|---|
| Kono | Bot Pop: extra horn blast, bots only | The sidekick shot | Clear 60 bots |
| Kislap | Bolt Glimmer: draws in Bolts for 2.5 s, every 9 s | The magnet | 350 Bolts |
| Dahon | Wrench Helper: reach for wrenches | The magnet; repair value unchanged | 450 Bolts |
| Radyo | Scout Ping: warnings 0.25 s earlier | The warning lead, under the team cap | Dodge 450 hazards |
| Ginto | Bolt Bonus: 1 Bolt per bot, 15 a run | Plain Bolts, counted for nothing else | Collect 1,400 Bolts |
| Hamog | Shield Mist: 1.4 s shield just before a hit, every 28 s | The shield system, never stacking | Block 8 hits |

### Unlocks

Rules read numbers the save already holds. One new number was needed: `tally.metres`. It counts from now on, and older saves start at 0 rather than a guess. `km`, `endlessBest` and `barkadas` are read straight from the save.

Pacing is from a real drive of the whole road: 19 km, 146 bots, 589 hazards dodged, about 1,670 Bolts picked up, about 4,000 Bolts earned. `economy.test.ts` holds it: at most 3 arrivals on any stop.

`buySidekick` spends Bolts and adds the sidekick in one save. A purchase is celebrated at once, ahead of anyone still queued, and that sidekick can go on the team straight away. No new currency.

### Unlock celebration

The existing reveal card, with a short pop, a hop and a little confetti: under a second, skippable, off under reduced motion.

### Limits

- **These are real 3D models, baked.** Every character is modelled in 3D and rendered ahead of time to 7 angles (heroes) or 5 (sidekicks). The game shows those renders with live blinks, glints and motion. It is not a live 3D engine, which would need a new dependency and new performance risk on phones. Rotation goes in steps between the angles.
- **Navie in the game now has smaller eyes than `frontend/assets/mascot-loading.png`**, as the brief asked. The app's mascot art elsewhere was not changed, so the two differ.
- A baked smile stays on a worried or hurt face, which shows the feeling through eyes and brows.
- Bumbo's "spin" narrows and widens a flat top part: convincing for a quick flourish, not a true rotation.

## 17. Softer, rounder, more lovable (tenth brief, 5 Nov 2026)

Ysa judged section 16 "too plain, too stiff, too clean": closer, but still shiny toy cars with faces, and asked for a much stronger push toward a cozy, collectible, Ooblets-inspired feeling, without touching the game itself. Navie, Bumbo and Mila were brought up to standard first, then everyone else.

### Why section 16 still read as plain

| What it looked like | Why | What changed |
|---|---|---|
| A car with a face | The proportions were still a real car's: long, on full-size wheels | `scenes/chibi.js`: every hero is shorter and rounder on small chubby wheels. Navie and Bumbo and Mila were remodelled outright |
| Flat, plastic | Light was a smooth airbrushed gradient, with nothing painted about it | New finish in `render.js` (below) |
| Sticker faces | Stark cream ovals sitting on the body | Panels melt into the paint, in colours of each body |
| Generic, lifeless | One face formula, perfectly symmetrical | Bigger bean eyes with more sparkle, mouth quirks, one eye slightly different, heads tilted |
| Stiff | Upright, facing front | Everyone leans, tilts, breathes and now and then wiggles |

### The finish

The character branch of `render.js` is now closer to gouache on plush than to a lit model. Light falls in soft bands whose edges wander, as a brush leaves them, instead of a smooth gradient. The midtone is the paint colour itself, shadows turn warm plum rather than grey, lights lift toward warm cream. A soft pale edge (`nap`) gives silhouettes the look of a soft toy. Paint carries mottling and a fine tooth, reduced on pale colours so white never looks dirty. There is no mirror reflection left on any character. The world's materials and code path are untouched.

### The shapes

`chibify(parts, c)` works part by part rather than warping space, so a wheel stays a circle and an accessory keeps its shape. `SHAPE` in `heroes.js` and `sidekicks.js` sets each character's length, height, wheels and how pillowy corners get. Long vehicles shrink most, so a jeepney is still the longest and a coupe the lowest. `remapSpec` moves a face spec onto the new shape, so faces are still written in the model's own coordinates.

Rear views come from the same parts as fronts, so a character is the same round thing on the road as in the Team screen. This is a change from sections 15 and 16, which held rear shapes fixed. Road widths stayed within about 5% of before, so a character still fills the same part of a lane as its hit box. Hit boxes themselves are numbers in `core/` and did not change.

Mirrors became little ears, lamps grow out of the body instead of being dots stuck on it, and bumpers melt in.

### Pilot characters

- **Navie:** one round bean of a body and a big soft head with no neck, on tiny wheels, with a big cap at a jaunty angle and a patch N on the hood. The cap is tilted, which is why Navie's right-hand views still matter.
- **Bumbo:** a squashy mochi with a real two-bladed yellow propeller growing from a nub on its head. It wobbles at rest and spins when picked. Before, it was a funnel-shaped dish; Ysa's briefs call it a propeller, so its blurb and one line were updated. Its ability is unchanged.
- **Mila:** a round mochi on a small floating disc, in place of the scooter deck and wheels, with two antennae that don't quite agree.

### Faces

Bean eyes are a little larger, with brighter glints and light gathering low in the dark. `quirk` adds a small thing about the mouth: a fang (Kidlat, Piko, Ginto) or a bit of tongue (Tiko, Bantay). Smiles are a line of paint in a shallow crease, in shapes that vary by character. `eyeSizes` makes one eye a touch different. The art test now holds that faces stay balanced, rather than symmetrical.

### The Team stage

Warm light behind the team (painted once, then reused), sidekicks closer and leaning in, one a little nearer than the other, everyone at their own resting tilt (`lean` in `HERO_MOTION`), softer breathing, and now and then a small wiggle or hop. Sidekick glints still drift toward the hero.

### Also

The unlock card shows the ability. The Garage shelf holds 16, so past that everyone takes turns, moving along after each run. The ten newest have radio voices, and Ningning, Sikat and Tali have fitting ability sounds.

### Limits

Still baked 3D models, as in section 16. Faces are less symmetrical on purpose. The panel-free look is not used everywhere: heroes with dark bodies keep a pale face so the eyes can be read.

### Navie and the sidekicks went back (same day)

After seeing section 17, Ysa asked for Navie and the sidekicks to go back to how they looked before it: "I don't like the edit now". They now use the section 16 look again, called the classic finish in the code. The other 15 heroes keep section 17 for now, because Ysa named only Navie and the sidekicks, so the two looks do not fully match on the Team screen. That is Ysa's call to make.

- `CLASSIC_LIGHT` (`finish: 'painted-2'`) makes `render.js` use `CLASSIC_MATS` and the smoother shading branch. `polishClassic`, `classicWheels`, `classicMirrors` and `spec.classic` in `sculpt.js` hold the rest.
- `FACES[id].classic` gives those characters the quieter glints. Bumbo's funnel dish, Mila's scooter, their descriptions and Team stage spacing are all as they were.
- What stayed from section 17 for everyone: the unlock card's ability line, the Garage shelf taking turns, radio voices, ability sounds.
- Sprites were checked against the renders from before: 177 of 177 hashes matched, with nothing redrawn, and redrawing a sample with today's code gave 0 bytes of difference.

## 18. The approved reference (eleventh brief, 5 Nov 2026)

Ysa supplied a picture of the Team screen as the final, approved character design, with the brief "do not reinterpret it, implement it". This replaces the looks in sections 15, 16 and 17, including the split where Navie and the sidekicks went back to section 16. There is now one finish for the whole cast.

### Navie, top to bottom

Cap with a thick blue N in a ring; white windscreen with the eyes, brows and nothing else; pink cheeks at its lower corners; an open smile on the blue hood, between the lamps; a white N below the mouth; then the bumper. `scenes/navie.js` was rebuilt to this: a shorter crown, one smooth arc of a visor (`bend` in `sdf.js`), ball mirrors, chunky dark tyres with pale hubs, flat cream lamps with a pale ring. Rear views use the same body, cap and proportions.

### What is new in the toolkit

| Piece | Where | What it does |
|---|---|---|
| `dee` | `sdf.js` | A D-shaped slab, for an open mouth |
| `bend` | `sdf.js` | Bends a part along its length, so a visor is one arc rather than creased pieces |
| `openMouth` | `sculpt.js` | A real cut in the skin, with an inside and a tongue seated in it. The bake measures the opening in every view (`mouthOpen`, `mouthLid`) |
| `iris`, `eyeDepth` | `sculpt.js` | A coloured eye painted on the dark oval, and how far it domes out |
| Lamp seating | `sculpt.js` | A lamp slides up, then in, until the surface faces forward enough for the disc to lie whole |
| `drawOpenMouth` | `clayFaces.ts` | At rest the mouth is in the model. To talk or show another feeling, the opening is covered softly with the skin round it and a new mouth is drawn in the same place, so it stays attached at any angle |

### One finish

`CHARACTER_LIGHT` (`finish: 'approved-2'`) and `CHARACTER_MATS` in `render.js`: soft wrapped light, shadows that keep their colour, gentle highlights, slight hand-painted mottling, nothing metallic. The gouache and classic code paths were removed. Bump `finish` to redraw characters after changing their materials, because render code is not part of a sprite's hash.

### The others

- **Bumbo and Mila** were rebuilt to the picture: Bumbo round, with a cream face, pale spots, a purple band, a yellow propeller and an open smile; Mila with a smooth mint U, yellow bands, white tips and a mint floating base. Their blurbs and Bumbo's hurt line were updated to match. Their abilities were not touched.
- **Kuya Jepoy, Kiko, Berto and Ligaya** appear small in the picture, so they were moved toward it: Jepoy's gold dome and yellow lamps, Kiko's mint frame, Berto's big yellow salakot, Ligaya's truer red.
- **Everyone else** gets the finish, the lamps, crisp painted smiles and, for heroes, brows at rest.

### Where the picture was not followed exactly

- Kiko has a second smile on the hood in the picture. It reads as a mistake beside the one on the windscreen, so only one was kept.
- Berto's horns are short stubs, not gone: the picture barely shows them, but his bio says they are not removable.
- The picture's numbers (Heroes 8/12, Sidekicks 11/27), the sparkle marks and the star are not art: the screen still shows real counts, as the brief asked.
- Navie's eye has no white crescent at one side. Everything else about it follows the picture.

### Limits

The game has no meshes or skeletons, so there are none to update. Characters are signed-distance models baked into sprites from fixed angles. Turning between those angles is a change of sprite, as it always was. Shading is rendered, so it is smoother and less painterly than the picture.

### A second picture: size and windshield (same day)

Ysa supplied a newer picture, made from a screenshot of this build, with a brief asking for Navie 10 to 15% bigger on the Team screen and no blue on the windshield.

- **The windshield:** the blue was the tuft added under the visor to follow the first picture. It is gone from the model, so the white runs unbroken up to the visor.
- **The size:** measured at a phone's size, the build already drew Navie larger than the new picture (380 by 435 against 350 by 380, on a screen 851 wide), with Bumbo almost touching a mirror. The brief named the picture as the exact target and the earlier oversized version as something to avoid, so `STAGE_SIZE` in `title.ts` sets Navie to 0.92 of the base size, which matches the picture's width. This is 8% smaller than the build before it, not larger, and Ysa was told. It is one number if that is wrong. Only the Team stage reads it: the road, hit boxes, tiles and Garage do not.
- **The letter N:** its diagonal is now a `slant` part with level ends, in place of a rotated box whose corners left small notches.

Height still differs slightly (400 against 380), because the model was scaled evenly rather than stretched.

## 19. Sidekicks get past what is on the road (5 Nov 2026)

Ysa saw sidekicks going straight through traps and asked for them to dodge or jump. They held a fixed formation beside the hero with nothing telling them what was coming.

`core/sidekickDodge.ts` is how they move and nothing more. It reads the hazards and never writes to them, and `sim.ts` does not import it, so abilities, aiming and hits are the same as before. `drive.ts` adds its sideways shift and hop when it draws a sidekick.

| Who | What it goes over | What it goes round |
|---|---|---|
| Runner | Cone, rolling cone, barrier, sweeping barrier, pothole | Car, truck, bus, bots |
| Flyer | All of those but trucks and buses, by rising | Truck, bus |

- **A jump** is an arc set by distance rather than time, so it clears the thing at any speed, with about half a second in the air at road speed. It is high enough at both ends of the stretch where it is over the thing, not only at the top.
- **A sidestep** starts about 0.4 s ahead and eases to the nearest free spot, onto the shoulder if it must. Things too close together to fit between count as one block.
- **Alongside something, a sidekick stays on its side until it is past**, so the hero steering cannot drag it through a truck.
- **If a thing is zapped mid-jump**, the sidekick falls rather than snapping to the road.
- **Heights** in `HEIGHTS` are measured from the baked sprites, and a test holds them to the art. A redrawn trap must update them.

Not covered: only the sim's hazards are avoided. Kiko's car in a convoy and the boss machine are not on that list.

## 20. A hundred levels along NLEX, and a broken road that looks broken (6 Nov 2026)

Ysa asked for 100 levels spread between the real NLEX exits, every hero and sidekick arriving at a level, and broken road that looks like damaged asphalt rather than a rock.

### The plan (`core/levels.ts`)

Pure data with no runtime imports, so the map, the sim, the save and the tests read one table.

- **20 exits, 19 stretches.** Each stretch gets at least 2 levels. The other 62 are shared by the stretch's real length in km (largest remainder). Balintawak to Harbor Link is 6 levels and Pulilan to San Simon is 8, while the short Bocaue stretches are 3.
- **The level that reaches an exit is the last one of its stretch.** Every other level ends part way, and its sheet says how many km before the exit it stops.
- **The 16 story missions are levels too.** m1 is Level 1, and each other story mission is the last level of its stretch, so the bosses and convoys sit on the exits they always did (m2 at CDV, Level 27; Barrikada at the Bocaue barrier, Level 30; Sta. Ines is Level 100).
- **The other 84 levels are built by `roadLevel()`** from the plan:
  - a mix (balanced, roadworks, bots, traffic or scenic)
  - a time of day, with rain or gusts now and then
  - broken road from Level 3 on
  - a difficulty tier that climbs from 0.3 at Level 1 to 5 at Level 100, pinned at the story levels so the climb follows the story's own
  - two stretches of road with a checkpoint between, longer as the tier rises
- **Each level needs the one before.** Snapshot and Endless keep their own rules.

### Who joins where (`core/unlockLevels.ts`)

- Navie, Pip and Mila are there from the start.
- Story characters join where the story meets them. Kuya Jepoy joins at Meycauayan (Level 17); Kiko and Kumpuni join at m2; Bumbo at the barrier; Walis, Barya, Sibat, Tala, Ilaw and Maso at their stops.
- The other 36 are spread evenly between Level 2 and Level 99, in a fixed order (Bantay at 3, Tali at 97). No two arrive on one level unless the story puts them there, so most levels bring someone.
- The rule is "clear Level N". It reuses the unlock-rule UI, so Team, Collection and the results "Nearly here" card show "Clear Level N" and a bar of levels.
- **Buying sidekicks with Bolts is gone.** Characters already bought stay. Bolts still pay for upgrades and evolving.
- **The Workshop opens at Level 6** (the first exit), or with Kiko as before.

### Saves (version 4)

A version 3 save keeps its place. Old story progress maps onto the level of the stop it reached, and every level up to it counts as cleared. Anyone who should already have joined by then joins on load.

### The map

The map has 100 nodes on a winding road. Exit names sit on the level that reaches them, with the faces of whoever joins there. Story levels have a ring, bosses keep their mark, and Snapshot sits at Marilao.

### Broken road (`web/render/brokenRoad.ts`)

Potholes and broken stretches used to be baked sprites that read as rocks. They are now drawn flat on the road in perspective, with the same projection as the lane lines, and the same shape every time for the same id.

Redrawn the same day to Ysa's reference picture: cracked asphalt rather than torn-up road.

- **A pothole** is shallow and dark:
  - a sunken, crazed halo with cracks running out
  - a crumbling rim a little paler than the road
  - a mottled bottom, lit on the far wall and darkest on the near side
  - a puddle in rain, and the yellow outline when outlines are on
- **A broken stretch** stays grey asphalt, cracked all over:
  - big cracks round broken blocks about a lane wide, each with a pale lip and a dark core
  - fine crazing ("alligator" cells) in soft-edged patches between them
  - pale, dusty weathering, darker worn spots and flecks of aggregate
- **How a stretch is drawn:**
  - It is a texture painted once per stretch, in road units, on the road's own asphalt, grain and wheel tracks. Its damage thins out at both ends, so it meets the good road without a seam.
  - It is laid on the road in rows, like the road itself, from `drawGround` before the painted lines, so the lines stay on top.
  - Rows are at most 2 px tall and start and end on whole device pixels. Taller rows show cracks stepping sideways, and overlapping rows show stripes where they fade.
  - Behind the car, where the view stretches the road, the damage fades out (z from -0.2 down to -2.6), as the reference keeps that part plain.
- **Cost:**
  - The texture is painted in nine stages, one a frame, while the stretch is still fading in at the horizon. Each stage makes its canvas finish drawing (`settle`); canvas drawing is otherwise queued and would all land in one frame.
  - The fine crazing is one seamless tile, made when a level loads (`prepareBrokenRoad`), and stamped through a quarter-size soft mask. Stroking thousands of tiny walls per stretch took about 50 ms.
- Hits, sizes and where they appear are unchanged; only the drawing is new. The pothole and gravel sprites were removed from the bake (354 sprites).
