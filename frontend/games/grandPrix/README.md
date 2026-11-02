# Navie Grand Prix

A racing game in Navie's Arcade (`app/arcade/grand-prix.tsx`), separate from Navie's Road Trip:
its own folder, build, tests, save key (`smartflow.grandPrix.<email>`) and screen. Ysa, 24 Oct
2026: "a racing game but the user character is navie... rivals should be different from the road
trip cast, maybe no more names just normal cars... a new game, don't change anything to that".

## What it is

- **Fiesta Grand Prix cup**: 3 races (Palayan Circuit, Parol Night Circuit, Sierra Madre Ridge),
  6 cars, 3 laps; points 10-8-6-5-4-3; gold/silver/bronze trophy on points after race 3.
- **Time Trial** on each track against the ghost of your best run (saved per track).
- **Pit**: capped upgrades (engine, tyres, turbo) and a cosmetic (racing stripes), paid in Bolts.
- **Rivals** #2, #7, #11, #18, #24: plain cars (coupe, hatch, pickup, van) with their own habits
  (runs wide, blocks, steady, slow wide line, careful in bends). No names, no faces, no dialogue.
- Closed race tracks, never NLEX traffic; the title says "Racing belongs on the track. On NLEX,
  Navie drives safe."

## How it plays

The car accelerates by itself. Bends push it outward more the faster it goes ("slide"): drag
(or hold a key) into the bend to keep your line; the grass beyond the kerbs is slow. Drafting
behind a rival gives a small tow and charges the boost meter; turbo cells add a third; blue
chevrons boost for free. Controls: drag pad under the car or four-line buttons; keys Left/Right
or A/D, Space/Shift/Up to boost, X/E/Down for an item, Esc/P pause. Assists: auto-steer in bends, fast-line dots, game
speed 70-100%, four difficulties (Rookie, Easy, Standard, Pro), text size, reduced motion.

## Mini map and items (added 26 Oct 2026, Ysa's request)

- **Mini map** (top right, 96 px; 78 px on small phones): the whole circuit as a schematic loop and
  every car as a dot in its colour - Navie bigger, ringed in white; sipa balls and coconuts in flight
  show as small dots; the Time Trial ghost as a pale dot. The tracks are pseudo-3D (bends only bend
  the view), so `trackMap()` in `core/tracks.ts` builds the outline from the bends: it turns only
  in bends, always the same way round (so the loop never crosses itself), scaled to close.
- **Items, Mario Kart style** (Cup races only; Settings -> "Items in Cup races", on by default):
  rows of four gift boxes on every track (`BOX_ROWS`), back 2.5 s after being taken. A box rolls an
  item for 0.9 s (roulette on the ITEM button), then tap ITEM (or X / E / Down):
  Turbo Kick (speed burst), Oil Slick (dropped behind), Coconut Roll (straight ahead), Sipa Ball
  (homes on the car ahead; the target gets a red warning), Bubble Shield (blocks one hit, 8 s),
  Fiesta Star (4 s faster and unstoppable, bumped cars spin), Red Light (cars ahead slow 2.5 s).
  A hit car spins out for 1.1 s, then is protected for 2.6 s (no chain hits). The roll depends on
  place: leaders get mostly oil, coconuts and bubbles, the back of the pack turbos, stars and red
  lights. Rivals use items too (simple habits: oil when someone is close behind, coconuts when lined
  up); on Rookie they only ever roll Turbo, Bubble or Star - they never attack Navie.
  Code: `core/items.ts` (items, roll), `core/race.ts` (boxes, slicks, shots, hits, rival use),
  `web/art/itemArt.ts`, HUD in `web/ui/raceHud.ts`.
- Settings now save on the phone (they bump the save revision; before, the phone's storage
  treated a settings-only change as a repeat).

## Code

- `core/` pure TypeScript: `tracks.ts` (segments, items, fast line), `race.ts` (simulation, rival
  AI), `progression.ts` (cup, records, payouts once per race id, upgrades), `save.ts`, `flow.ts`,
  `bot.ts` (autopilot for tests/dev; goes for gift boxes and uses items at once), `config.ts` (tuning, presets).
- `web/` the page: `raceRenderer.ts`, `raceRunner.ts`, `ui/*`, `audio.ts` (engine hum), `input.ts`.
  It **reads** Road Trip's drawing kit (Navie, scenery, helpers) under `../roadTrip/web/` so Navie
  looks the same in both games; nothing in Road Trip was changed. Changing Road Trip's Navie
  drawing changes it here too.
- Build after any edit: `node scripts/build-grand-prix.js` (writes `generated/grandPrixHtml.ts`;
  `--html out.html` for a browser copy, open with `?debug=1`; `window.__gp` has `go`, `race()`,
  `autoplay`). Tests: `node scripts/test-grand-prix.js` (23).

## Verified (24 Oct)

17 unit tests (every track x difficulty finishable, determinism, bend push, auto-steer, boost
rules, one bump per touch, ghost record/replay, payouts once, cup and trophy, records, saves).
17 browser checks at 390x844 (keys, drag, line buttons, boost, pause on focus loss/hidden page,
touch targets >= 44 px on every screen, repeated entry: one loop and flat heap, reload keeps
progress, double-tapped Next paid once, corrupt save). 320x568 and landscape: no overflow.
Frame times in headless Chrome: 144 fps (browser cap), 121 fps with 6x CPU throttling. Balance
by autopilot: wins on Rookie/Easy; a perfect autopilot places 1-2 on Standard and 2-4 on Pro, a
sloppier one 1-4 and 4-5. **Not yet played by a person or on a phone.**
