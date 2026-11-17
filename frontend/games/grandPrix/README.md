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

## Arcade polish: easier steering, a racing HUD, a lower camera, NLEX highways (17 Nov 2026)

Ysa's brief asked for a Mario Kart-*inspired* presentation, with nothing copied. Everything here is original and drawn in code: no Mario Kart assets, icons, music or sounds. Navie and the rival cars are drawn exactly as before. The tracks, laps, cup, Bolts, records and saves are unchanged. A recording of Parol Night Circuit was the example.

**Why steering was hard.**
- Bends push the car outward by adding to a "slide" every moment.
- The old drag pad set a *position*, so holding a line through a long bend meant sliding the thumb further and further inward until it ran off the pad.
- Keys and taps crossed at full speed for any press.

**Steering now** (`web/input.ts`, `core/race.ts`):
- **Touch** (the default). Put a thumb down anywhere on the lower screen and lean it left or right of where it landed.
  - How far it leans sets how fast the car crosses the road, *in proportion*. This is the new analog `steer` input.
  - The bend still pushes at its own rate, so a long bend is held with a small, steady lean.
  - The origin follows a thumb that runs past full lock, and lifting the thumb straightens up.
  - A floating indicator shows the thumb's lean.
- **Buttons**: hold ◀ or ▶ (they ease in), let go to straighten.
- **Tilt**: shown only where the phone has it, with a "Set level" calibration. The Start tap asks an iPhone for permission. With no tilt readings after 1.5 s, the race falls back to touch and says so.
- **Lanes**: the old one-tap-per-line mode, kept.
- **Keys** steer analog in every mode except Lanes.
- **Steering feel**: Easy, Normal or Advanced. It sets the thumb travel for full lock, the response curve (a dead zone, then gentle near the centre), the strongest turn (Easy stops at 85%) and the smoothing. Smoothing runs once per simulation step, so it is the same at any frame rate.
- **Steering assist** (on by default):
  - takes 45% of the bends' push (auto-steer still takes 88%);
  - settles a barely-steered car faster, so it never weaves;
  - softens sudden changes a little.
- **Settings**: old saves get Touch, Easy and the assist on. The old `sensitivity` number still scales the thumb travel.

**HUD** (`web/ui/raceHud.ts`, `web/styles.css`):
- **Place**: a big badge (1st, 2nd and so on), gold, silver or bronze on the podium. It pops with a green ▲ or red ▼ when places change, with a sparkle ring for taking the lead.
- **Lap**: LAP 2/3 in a rounded panel, amber on the final lap, and a big FINAL LAP! banner.
- **Mini map**: 112 px, a smooth outline, a chequered start, and a glowing Navie dot.
- **Item slot**: a chunky box with a dashed "?" when empty, a jittering roulette, a pop when it lands, and a glowing ring when ready.
- **Boost**: a big round button with three energy cells. It turns orange with a breathing ring when charged, and blue with a draining ring while it burns.
- **Start**: a 3-2-1-GO! that pops in big numbers over the start lights.
- **Finish**: a "1st!" banner with confetti and Navie hopping.

**Camera and motion** (`web/render/raceRenderer.ts`):
- The camera is lower and closer: Navie is about 23% bigger and the road ahead is still in view.
- It swoops in from a wider view during the countdown, and widens 7% while boosting, with speed streaks. Reduced motion turns both off.
- Lean, suspension, hops, the camera's follow and the zoom are eased by time, not per frame.
- Rival cars bounce lightly and their wheels turn (four frames each).

**NLEX highway** (closed-course fantasy, never real traffic):
- dashed lanes, edge lines everywhere, wider kerbs in bends;
- concrete barriers with reflectors;
- expressway streetlights;
- green overhead signs with an NLEX text badge and short place names;
- a "NAVIE GRAND PRIX" overpass on every track;
- glowing gift boxes.

At night (Parol): twinkling stars, a far-off town with lit windows, warm light pools under the lamps, glowing signs, and brighter swaying parols.

**Results and briefing**:
- **Briefing**: a card with a picture of the circuit, the place, laps, stars and one line. The rules and rivals are behind "How to race".
- **Results**: a medal-coloured place, Navie hopping, the time large, the Bolts total counting up to exactly the amount paid, and standings with each car's colour.

**Sound**: a first-place fanfare, a soft tyre scrub in hard bends, and drums and a lead line in the racing music. It is all still synthesised and follows the volume sliders.

**Checked**:
- 28 unit tests, 5 of them new. They cover: letting go holds a straight line; steering is proportional and reaches 90% in under 0.12 s; a long bend is held with a steady lean; the assist halves early drift; and a player-like analog driver finishes every track on every difficulty.
- In the test browser:
  - every mode works (Buttons gave −0.79 while held and 0 on release; tilt fell back to touch);
  - signs and an overpass appear on all three tracks;
  - no controls overlap at 360 × 640.
- Frame times (headless Chrome, CPU slowed 4×, mid-race, median): Palayan and Sierra 7.2–7.8 ms (were 7.0), Parol 8.4–10 ms (was 7.0). The first sight of each rival frame used to cost a 200 ms stall; the renderer now draws every sprite during the countdown (`prewarm`), and the worst frame is about 20–50 ms.

## Steering wheel, Navie's start screen, fewer words (17 Nov 2026, second pass)

Ysa's second brief, with a recording of a Palayan cup race, had three priorities. Gameplay, tracks, cup, Bolts, records and saves are unchanged. This replaces parts of the section above: the touch slide control is gone, and the wheel is the default.
1. A real steering wheel instead of the slide control.
2. A much cuter Navie on the start screen.
3. Far fewer words.

**The steering wheel** (`web/input.ts`, `web/ui/gpIcons.ts`, `web/ui/raceHud.ts`):
- **What it looks like:** a chunky blue rim with white piping, ten-to-two grips, a yellow top marker so a turn is easy to see, three white spokes, and a navy hub with an N. It is inline SVG, turned with a CSS `rotate`, so it costs nothing per frame.
- **Where it sits:** bottom left, opposite the boost. The Boost button setting mirrors both.
- **How it steers:** the wheel follows the thumb's *angle* round its centre, clockwise for right, counted from wherever the thumb landed, so a touch never jumps.
  - It turns at most 110° each way on Easy, 100° on Normal and 90° on Advanced.
  - How far it is turned sets the analog `steer`, through a 5% dead zone and a gentle curve. Easy tops out at 90%.
  - The pointer is captured, so a thumb that slides off the wheel keeps steering.
  - A thumb on the hub, where angles swing wildly, steers by sliding sideways.
  - Let go and it springs back: in 0.13 s on Easy, 0.095 s on Normal and 0.07 s on Advanced. Held arrow keys turn it too.
  - The touch area is 14 px bigger than the wheel all round. Boost and item are separate buttons, so two thumbs work together.
- **Other modes:** Buttons, Tilt (it now falls back to the wheel) and Lanes are kept. A saved `'drag'` reads as `'wheel'`, and a test holds that.
- **Measured in the test browser with real touch events:**
  - touching causes no jump;
  - 60° clockwise gives steer 0.36 and the car moves right;
  - it clamps at −110°;
  - after letting go it reads −45°, −21°, −8°, −4°, −2° and −1° over 0.6 s;
  - steering and boost work at the same time.

**Navie on the start screen** (`web/menuScene.ts`): Navie is Tollbound Heroes' finished model, read from its baked art and never redrawn, with the same face, cap and N.
- `scripts/build-grand-prix.js` inlines only Navie's views, about 150 KB, and `roadTrip/web/art/clay.ts` draws them, read only.
- Navie is shown front-three-quarter, as the right-hand view, so the lettering reads correctly, in a pool of light on the start line.
- Movement: breathes, blinks and bounces a little. Every 7.5 s an excited hop with a puff of exhaust ends with Navie turned to look at you for two seconds. A tap gives a happy hop with sparkles. Start Race gives a crouch, a hop and a dash off to the right, about 1 s (none with Reduce motion).
- Navie's position and size come from the measured empty middle of the screen, so Navie fits any phone; held sideways, Navie takes the left half.
- **In the race** Navie is the same model: the rear view on straights, a quarter or full turn as it swings across (its own right-hand views), at the old width. Racing Stripes are painted onto each view once.
- **Results and standings** use the same model.

**The start screen's place:** race morning at a small pit stop, original, not the Tollbound Heroes screen.
- an elevated expressway on pillars, with a green sign carrying an NLEX text badge;
- a pit garage and a GO NAVIE! grandstand;
- bunting with twinkling fairy lights, a waving chequered flag, cones, a tyre stack, palms, hills and drifting clouds.

It is painted once per size; each frame adds only the moving parts.

**Menus:**
- **Start screen:** the title with back and settings buttons, Navie, a "Race 1/3 · Palayan Circuit" chip, a big yellow Start Race button (the next cup race), three tiles (Cup, Time Trial, Garage), Records, the Bolts, and the safety line. The Arcade safety line stays at the top.
- **New screens:** Cup ("3 Races · 6 Racers · Win the Cup!", track rows with pictures, standings), Time Trial ("Beat your best time!"), Records (best cup, Bolts earned, each track's best place, time and lap), and the Garage (was the Pit; one line per upgrade and a bolt price).

**Fewer words:**
- **Track blurbs** are three-part tags such as "Easy · Wide turns · Rice fields".
- **Briefing:** "Rotate to steer" with a wheel icon, and the rules as four short lines behind the fold.
- **In the race:** messages are a few words ("Spun out!", "Blocked!", "Grass is slow!"); the screen reader still hears the full sentence.
- **Results:** one Bolts number with short lines.
- **Settings and difficulty:** help in a few words each, and difficulty cards show just a tag.
- **Kept on purpose:** both safety lines and every accessible label.

**Race screen:**
- **Top:** pause and place on the left, lap and time in the middle, the mini map (100 px) on the right.
- **Gone:** the Bolts counter and the cup's best-lap chip. The time trial's ghost gap stays.
- **Item:** sits beside the boost, a little higher. Above 340 px wide it never meets the wheel; narrower, it goes above the boost.
- **Fit:** checked with no overlaps at 360×640, 375×667, 390×844, 414×896 and 430×932, with a notch and home bar added.

**Scenery:** each circuit has its own horizon, painted once:
- **Palayan:** a lone round mountain, palms and houses.
- **Sierra Madre:** three ridges in the sunset haze.
- **Parol:** a giant lantern on a pole over the town.

All three also get a far-off elevated expressway (lit at night).

**Performance** (headless Chrome, CPU slowed 4×, median, then worst frame, best of two runs):

| Screen | Before | After |
|---|---|---|
| Race, Palayan | 7.5 / 21 ms | 7.0 / 18 ms |
| Race, Parol | 10.2–10.9 / 22–56 ms | 7.5–8.7 / 18–23 ms |
| Race, Sierra | 8.0–8.8 / 22 ms | 7.0–7.3 / 15–20 ms |
| Start screen | 7.0 / 14 ms | 7.0 / 18–19 ms |

- **Why races got faster:** Navie is now one picture instead of a vector drawing every frame.
- **Warm-up:** each of Navie's views is drawn once, tiny and hidden, before it is first needed. The first look on the start screen used to cost a 45 ms frame.

**Checked:** 29 unit tests (one new: the wheel default and old saves), the type check, and browser runs of every mode on all three tracks, the start screen, menus, briefing, results, five portrait sizes and landscape. The page is 829 KB (was 547 KB).

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
