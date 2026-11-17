# NLEX: Wildway Guardians

A third-person 3D wildlife rescue adventure in the SmartFlow NLEX Arcade. Tagline: *Change the journey. Protect their future.*

**What exists today is a vertical slice.** It has four playable NLEX missions and 1 of 100 species with a playable wildlife mission, plus 14 kinds of animated wildlife to photograph across six places. The other 99 species are on the roster with honest labels. This document says what is built and what is only planned.

**The flow:** the SmartFlow NLEX Eco Command Center, then an NLEX mission or a wildlife expedition, each with its own simulated emissions decision, then results that keep every measure apart, then back to the Command Center.

## Run, build, test

```
node scripts/build-wildway.js                 rebuild generated/wildwayHtml.ts (required after any edit)
node scripts/build-wildway.js --html out.html also write a page you can open in a desktop browser
node scripts/test-wildway.js                  unit tests (core rules, the characters' bones, faces and blinking, the scenery kit)
node scripts/test-wildway.js --plans          every plan the transport board can make, with its result
node scripts/prepare-wildway-art.js           copy Navie from frontend/assets into web/navieArt.ts (only if the mascot changes)
```

Developer URL flags for the browser copy: `?fresh=1` (new save), `?debug=1` (exposes `window.__ww`), `?reduce=1` (reduced motion), `?top=59&bottom=34` (safe areas).

The game is one self-contained HTML page in a WebView, with no network use, no libraries and no asset files. The route is `app/arcade/wildway-guardians.tsx`.

## Layout

| Folder | What is in it |
| --- | --- |
| `core/emissions.ts` | The emissions model, factors with sources, vehicles. No drawing. |
| `core/transport.ts` | Hard constraints, plan evaluation, comparison, and the hornbill, creek and depot transport problems. |
| `core/plaza.ts` | The toll plaza: one simulated hour, second by second. |
| `core/facility.ts` | The depot: one simulated day of energy use. |
| `core/route.ts` | The 18 NLEX mainline exits in order, the missions at each, and the planned ones. Sources in the header. |
| `core/nlex.ts` | What opens when, each mission's state (available, locked, completed, in development), and the progress totals. |
| `core/ecoRuns.ts` | The eight Eco Run missions: their choices, the transport problems and models behind them, and their outcomes. |
| `core/species.ts`, `core/speciesFacts.ts` | The 100-species roster and the checked records. |
| `core/mission.ts` | Missions as data, and the step machine that saves and resumes. |
| `core/save.ts` | Versioned save, atomic mission completion, upgrades, patches, side quests, gear, achievements. |
| `core/progression.ts` | Patches, wildlife observations, side quests, gear, the Atlas quiz, achievements and Command Center decorations, as data. |
| `core/puzzles.ts` | The puzzle kit: circuits, sensor dials, van packing. Pure, with solvability tests. |
| `core/registry.ts` | Which models and animations exist. |
| `core/content.ts` | Everything the game says, in one place, ready for a Filipino version beside it. |
| `web/gl/` | Our own WebGL 1 toon renderer: bands of light, outlines, rigid skinning, stylised water. |
| `web/models.ts`, `web/anim.ts` | Characters built from code, with faces on bones of their own, and their animation: blinks, feelings, idle habits, walking, cheering. |
| `web/world/` | Terrain, scenery and the six zones: Malaya Ridge, the Command Center, the toll plaza, the creek, the depot, the supply yard. |
| `web/world/buildings.ts` | The kit for cute buildings: windows, doors, awnings, lanterns, roofs with eaves, and cosy houses in three styles. |
| `web/game.ts` | The live world: movement, camera (with the player's zoom), followers, interactions. |
| `web/input.ts` | Touch stick, camera drag, pinch zoom, mouse wheel, keys and controller. |
| `web/hornbill.ts`, `web/missions/` | The five original mission scripts, the Eco Run engine (`missions/ecoRun.ts`) that plays the eight new ones, and what they share: patches and wildlife in every zone. |
| `web/hub.ts` | The living Command Center: people walking about, the patrol car, side quests, trophies, decorations, the animal activities. |
| `web/fauna.ts` | The animals: their models, behaviour loops, reactions and drawing. |
| `web/world/wildlife.ts` | Which animals live in which place, and when (the creek's wildlife returns once it is clean). |
| `web/navieArt.ts` | Navie, generated: resized copies of the app's own mascot images. |
| `web/app.ts`, `web/ui/` | Menus, flow, save handling, puzzle screens (`ui/puzzles.ts`), Command Center screens (`ui/hubScreens.ts`). |
| `tests/` | Unit tests. |

## Original characters, not Adventure Time

The brief named Finn, Jake, BMO and Marceline. Those are copyrighted characters, so the game uses original ones in the same four roles and the same family of art style: bold outlines, flat colour, a few bands of light, squash and stretch.

| Brief's role | Character | What they do in the game |
| --- | --- | --- |
| Field Guardian | Dayo, drawn as Navie as a boy | Moves heavy things, climbs, builds |
| Rescue Partner | Baging, a little elf helper in an orange cap and tunic, with stretchy arms | Stretches across gaps, reaches far things, carries two loads |
| Eco Analyst | Sukat, a pocket field console that walks | Scans from a distance, keeps the Atlas |
| Aerial Scout | Awit, drawn as the Tollbound hero Amihan as a girl | Rides a kite to scout, plays a bamboo flute for sound puzzles |

Using the licensed cast would take a licence from the rights holder. The cast is isolated in `web/models.ts` and `HERO_INFO` in `web/ui/hud.ts`.

## How the emissions numbers work

Everything is deterministic and separate from drawing. Every result in the game carries a **Simulated** label and a "How this was calculated" view. These are not measurements. The journey is fictional.

**The sums**

- Fuel = distance × L/km × a traffic adjustment + stationary hours × idle L/h
- CO₂ = fuel × the fuel's kg CO₂/L
- Electric = (distance × kWh/km × traffic adjustment + stationary hours × standing load) ÷ (1 − charging loss) × grid kg CO₂/kWh
- Every journey counts both ways. A whole vehicle is counted, however many people are on board.

**Boundary.** Combustion vehicles: CO₂ from fuel burned in the vehicle. Electric vehicles: CO₂ from generating the electricity drawn at the charger. Left out of both: producing and transporting fuel, and building or scrapping vehicles. So this is neither fuel-cycle nor life-cycle. It is kg CO₂, not CO₂e.

**Idling is never counted twice.** If a traffic factor already includes standing time, `factorIncludesIdling` turns off the separate idling term. Charging loss is applied once, in `journey()`.

**Factors** (`FACTORS` in `core/emissions.ts`)

| Number | Value | Source | Status |
| --- | --- | --- | --- |
| Gasoline | 8.887 kg/gal ÷ 3.78541 = 2.35 kg/L | US EPA | US figure, labelled illustrative |
| Diesel | 10.18 kg/gal ÷ 3.78541 = 2.69 kg/L | US EPA | US figure, labelled illustrative |
| Grid electricity | 0.7310 kg/kWh | Philippine DOE National Grid Emission Factor, Luzon-Visayas, 2022-2024, operating margin | Sourced. CO₂ only. |
| Electric van energy | 0.28 kWh/km | Fiori & Marzano 2018, Rome delivery vans, net of regeneration, at the wheels, read second-hand | Illustrative. No Philippine van figure was found. |
| Charging loss | 10% | fueleconomy.gov, rounded US estimate | Illustrative. Applied because the Rome figure excludes charging. |

**Assumptions to know about**

- Using the operating margin for an electric van is a modelling choice made here. The DOE publishes these for Clean Development Mechanism baselines and does not say which to use for a vehicle. The combined margins are 0.7446 and 0.7582.
- Vehicle fuel use comes from the dashboard's own factors (EMEP/EEA Guidebook 2023, Argonne idling, documented in `SmartFlow-NLEX/docs/emissions-optimiser-spec.md`). They describe European fleets and US idling, not Philippine vehicles.
- Route distances, traffic windows, minutes stuck, the electric van's standing load and its battery size are invented for the game.
- Because the numbers depend on these assumptions, the size of the difference between plans is illustrative. The direction is what the game teaches: shared loads and a clearer road use less.

**What the game refuses to do**

- It never rewards cancelling a needed journey. There is no such option, and every plan must move the same people and cargo.
- It has no speed reward. Road decisions stay in planning.
- It keeps the shortest route from being automatically best: through town at the school run burns more than the longer road.
- It keeps negative savings negative and shows a percentage only when the baseline is above zero.
- It does not convert CO₂ into animals, trees or points. Points are a game currency, kept apart from every other measure.
- It does not claim one trip changed the climate, regrew anything or removed emissions by planting trees.

## Species data

`publicationState` is the honest measure:

| State | Count | Meaning |
| --- | --- | --- |
| `playable` | 1 | Checked facts and a real mission (Rufous hornbill) |
| `facts-verified` | 9 | The rest of Chapter 1: checked facts, no mission |
| `registered` | 90 | A name on the list. No facts shown, no mission, no model. |

The Chapter 1 records were checked on 2026-11-05 **by an AI research pass reading source pages, not by a person.** A person should review them before any public release. Known limits:

- **Global categories** are IUCN citations as carried in GBIF, because iucnredlist.org refused automated reads.
- **Philippine categories:** DAO 2019-09 itself could not be opened. A category appears only where a DENR office or a journal paper states it, with `basis` saying which. It is left out, with `pendingNote` saying why, for the pangolin (sources conflict), crocodile, cockatoo, hornbill and eagle-owl (secondary sources only).
- **Climate evidence** is recorded for three species and is not strong: a named threat, or a link between temperature and behaviour. The other seven say none has been recorded. The hornbill is one of those seven, so the game makes no climate claim about it.
- **Hornbill eye colour and body length** conflict between sources, so the model uses a plain stylised eye. Check identified photos, or ask the IUCN Hornbill Specialist Group, before finalising the model.

## The story and the biology

- The Luzon form has a red bill with a black base, not the yellow of the southern forms. The model and script follow this.
- A sealed female depends on the male, and evidence from other hornbill species says his absence can mean she and the chicks are lost. So this mission is set outside the nesting months, and Dr. Mayumi says why that mattered. No source gives how long a sealed female survives without food, so the game does not say.
- The plausible but unsourced parts are fiction: a hornbill snagged in discarded netting, an on-site vet check, rangers as first responders, and the length of care. The game shows no care length, and labels the time jump as illustrative.
- Real sources describe DENR wildlife officers as first responders. Ranger Ligaya belongs to the fictional station, and the game names no real agency as taking part. Sukat's notes say what a real person should do: report it to the nearest DENR office, and don't capture, keep or unnecessarily handle it.

## The NLEX integration

Added on 6 November 2026, on top of the slice above, and without removing any of it.

**The Command Center.** The Greenway Field Station grounds became the SmartFlow NLEX Eco Command Center. Every building is still there. New: Navie's Mission Station (a kiosk whose screen shows Navie), the NLEX Operations Board, the Environmental Progress screen, and the Eco Dispatch Station (the transport board). A first visit starts with Navie's welcome.

**Navie is the app's own mascot, never redrawn.** `scripts/prepare-wildway-art.js` makes resized copies of `frontend/assets/mascot-*.png`. They appear in speech bubbles and on the kiosk screen. Navie is the mission guide, not a playable hero, and nobody in the game gives Navie a he or a she.

**The line.** (Since 12 November, all 18 mainline stops: see "The 18-stop campaign" below.) The Operations Board showed six stops south to north in their real order: Balintawak, Valenzuela, Bocaue, San Fernando, Angeles and Dau. They are themes for made-up missions, never real incidents. Angeles and Dau have no mission yet and say so. The Great NLEX Gridlock opens the line, and the other two missions open after it. The hornbill expedition is open from the start.

| Mission | Stop | What the player does | Simulated comparison |
| --- | --- | --- | --- |
| The Great NLEX Gridlock | Bocaue | Scan the plaza, fix the signal, the cable and the Wasteworks jammer, set the six lanes, reopen (expanded below) | One hour of plaza idling, against the jammed plaza |
| Creek Rescue (first called River Rescue) | Valenzuela | Meet the barangay officer, leave the oil to the specialist, collect and sort 8 pieces of rubbish, clear the trash rack, open the floodgate, plan the collection | The collection run, against three truck runs |
| Solar Power Rescue (first called The Eco Expressway) | San Fernando | Audit the depot, fix the sensor, the air leak and the idling, choose upgrades within the crew's 8 hours, plan the delivery, install | One depot day, plus the delivery run |
| The Hornbill Homecoming | Malaya Ridge (fictional) | As before, now starting with a call to the Command Center | The supply run |

Each place is made up, and each briefing says so. The plaza has six lanes, with service walkways and a staff tunnel: heroes never walk on the lanes. Every repair has two hero options.

**The toll plaza model (`core/plaza.ts`).** One hour, stepped second by second. Arrivals are evenly spaced by type. Each vehicle joins the open lane it may use with the least work queued ahead. Counted: time stopped with the engine on, in line and at the booth. Fuel and CO₂ use the same idling figures and factors as the transport board.

Game assumptions:
- Traffic per hour: 900 tag cars, 240 cash cars, 60 tag trucks, 60 cash trucks.
- Booth seconds: 6, 24, 8 and 32 for the same four.
- Three toll collectors on shift. Lane 4 is coned off. Trucks need a wide lane.

Only 6 of the 729 lane settings are legal and keep the lines short.

**The depot model (`core/facility.ts`).** One ordinary day. Counted: grid electricity at the Luzon-Visayas factor, and diesel burned by trucks parked with engines running. Solar reduces grid draw, up to the depot's daytime use. Every wattage, hour count and the solar yield (4.2 kWh per kW a day) is a game assumption, listed in the game's "How this was calculated".

**The creek dispatch.** Sorted waste may share a vehicle only if it has enough separate bins. The barangay e-trike's energy figure (0.111–0.125 kWh per km, Abaya et al. 2019, UP Diliman) was measured at the charger. So no charging loss is added to it, unlike the Rome van figure, which was measured at the wheels.

**Measures.** NLEX environmental objectives are a new, separate measure: "Toll plaza flowing again", "Community creek cleared and flowing" and "Depot energy waste cut". They are never counted as wildlife habitat, and NLEX missions claim no animals.

The progress dashboard's CO₂ total adds each mission's best simulated saving once. It spans different time bases (a plaza hour, a delivery, a depot day), and the dashboard says so.

The save went to version 2. Version 1 saves load unchanged, and an unfinished version 1 hornbill run resumes after the new call step.

## The 18-stop campaign: the NLEX Eco Adventure map

Added on 12 November 2026. It replaces the six-stop Operations Board with all 18 NLEX mainline exits, adds eight playable missions, and puts a CO₂ card on every result. Nothing older was removed: the Gridlock, Creek Rescue, Solar Power Rescue, Eco Delivery Rush and the Hornbill Homecoming play as before, at the same stops, with the same saves.

**The line (`core/route.ts`).** Balintawak, Mindanao Avenue, Karuhatan, Valenzuela, Meycauayan, Marilao, Ciudad de Victoria, Bocaue, Tambubong, Balagtas, Tabang, Sta. Rita, Pulilan, San Simon, San Fernando, Mexico, Angeles, Dau. Names and order follow Expressway.ph's NLEX exits guide (https://www.expressway.ph/guides/nlex-exits), checked against Wikipedia's E1 expressway article (https://en.wikipedia.org/wiki/E1_expressway_(Philippines)). They disagree on one thing: Wikipedia puts Tabang (km 32.9) half a kilometre before Balagtas (km 33.4). The guide's order is kept, and the file says so. Dau is where NLEX ends, so no SCTEX exit, Harbor Link or Connector appears. Each stop is a theme for a made-up mission. Exit names are public geography; every number is invented and labelled simulated.

**Every stop is honest about its state.** A mission is Available, Locked (finish the Gridlock first), Completed, or In development. A planned mission shows its title, one line and three tasks, then "In development". It has no Play button and no fake results.

| # | Stop | Mission | State | Place and mood |
| --- | --- | --- | --- | --- |
| 1 | Balintawak | Eco Delivery Rush, plus Eco Traffic Start | Playable, plus in development | Supply yard |
| 2 | Mindanao Avenue | Green Route Rescue | Playable (new) | Supply yard, morning |
| 3 | Karuhatan | Smart Delivery | Playable (new) | Supply yard, overcast |
| 4 | Valenzuela | Creek Rescue | Playable | Creek |
| 5 | Meycauayan | Eco Cargo Challenge | Playable (new) | Supply yard, sunset |
| 6 | Marilao | RFID Rescue | In development | |
| 7 | Ciudad de Victoria | Event Traffic Hero | In development | |
| 8 | Bocaue | The Great NLEX Gridlock | Playable | Toll plaza |
| 9 | Tambubong | Green Maintenance | Playable (new) | Depot, overcast |
| 10 | Balagtas | Fuel Saver Challenge | Playable (new) | Depot, morning |
| 11 | Tabang | Eco Supply Run | In development | |
| 12 | Sta. Rita | Traffic Flow Fix | In development | |
| 13 | Pulilan | Rainy Day Rescue | Playable (new) | Creek, rain |
| 14 | San Simon | Clean Cargo Mission | In development | |
| 15 | San Fernando | Solar Power Rescue | Playable | Depot |
| 16 | Mexico | Eco Patrol | Playable (new) | Creek, sunset |
| 17 | Angeles | Night Shift Guardians | Playable (new) | Depot, night |
| 18 | Dau | The Wasteworks Showdown | In development | |

12 of 18 stops have a playable mission. The four traffic missions wait for the toll plaza, whose lanes, walkways and staff tunnel need their own level work. The other three wait for a place of their own.

**The eight new missions (`core/ecoRuns.ts`, `web/missions/ecoRun.ts`).** Each has three steps: find or collect, fix or pack, then one choice. The choice board shows each option's simulated CO₂, and the greenest option gets a badge. An option that breaks a rule is shown with the reason and cannot be picked:
- seats
- cargo weight
- a route too narrow for the vehicle
- printed forms that must ride enclosed
- safety lamps that must stay on

Shortest is not always greenest: the jammed avenue is 4 km shorter than the expressway and still burns more. A worse choice shows a worse number, and the result says "More CO₂ than the usual way this time."

| Mission | What the choice is | Model |
| --- | --- | --- |
| Green Route Rescue | Avenue, expressway, or back lanes (too narrow) | Transport model, varying the route |
| Smart Delivery | Two vans, one van, the electric van, or a pickup (forms must ride enclosed) | Transport model |
| Eco Cargo Challenge | Truck, pickup, one van (over 400 kg), or two vans, after packing the bay | Transport model plus the packing puzzle |
| Green Maintenance | A vehicle per job, one van, the electric van, or the truck (one passenger seat) | Transport model |
| Fuel Saver Challenge | Engine on, engine off, or a long warm-up, after pumping the tyres | Diesel van; tyre penalty 0.2% per psi (fueleconomy.gov); idling litres per hour |
| Night Shift Guardians | Lamps stuck on, dusk to dawn, safety lamps plus sensors, or all off (refused) | 12 lamps of 400 W, grid factor 0.731 |
| Rainy Day Rescue | Van and truck, one van, pickup and car, or the truck alone (seats) | Transport model |
| Eco Patrol | Back to base each time, the reported order, or one loop | Transport model, varying the route |

All factors are the ones already documented above. The new game assumptions are in the code with their sources, and in each mission's "How this was calculated".

**The CO₂ card.** Every result now shows Baseline CO₂, Your CO₂, CO₂ saved, and the percentage. The percentage appears only when the baseline is above zero. One short line follows, and the card is labelled Simulated. A mission without a trip or energy choice, such as a clean-up, says "No CO₂ is claimed here" and claims nothing. Wildlife and clean-up are never turned into CO₂. A replay changes a mission's saving only if it beats the best, so the total never counts a mission twice.

**Bonus finds.** Each new mission hides three recyclables around its place. They are optional, take about half a minute, and give points and a Bonus 0/3 count on the map. They never give CO₂.

**The map.** A portrait road from Balintawak (top) to Dau (bottom):
- province signs, numbered markers that pulse when a stop is open, and cars driving the road
- a progress strip: stops cleared out of 18, total simulated CO₂ less, animals, habitats and badges, each kept separate
- Navie hops and speaks for the stop you pick ("Start at Bocaue!" on a new save)
- a stop's panel lists its missions, playable first, each with one line, three tasks, its best saving and its bonus count

Reduce Motion stops the cars, pulses and rain. The Command Center board now shows the 18 stops as dots and "x of 18 stops cleared".

**Moods.** The yard, depot and creek get five lights: morning, sunset, overcast, night and rain. Each new mission also has its own helper, props and decor. At night the ground and trees go dark, while people and animals keep a brighter light, so faces stay readable (`skinLightTint` in the renderer). Rain adds streaks, puddle splashes and a grey sky.

**Tests.** `tests/campaign.test.ts` checks:
- the 18 names and their order, with no SCTEX exits
- every mission is either built or planned, at its own stop
- the states
- every board has at least two feasible options, a saving is possible but not universal, and the board and the result agree
- the refusal reasons, the tyre and lighting arithmetic, and that clean-up claims no CO₂
- replays never double count, and bonus finds are counted

`scripts/test-wildway.js` runs it with the rest.

## The smoothness and polish pass

Added on 14 November 2026, at Ysa's request, with a recording of Smart Delivery as the example. The aim was to fix what made play feel stiff or cluttered, in the shared systems, so every mission gets it. Nothing about the missions, the characters' looks, the CO₂ sums, the map or the saves changed.

**What the recording showed:**
- a plain dark screen while a place builds;
- the greeting shot filled by a parked van;
- a follower walking big across the bottom of the view;
- the "got it" toast over the team;
- a bare grey yard floor.

**Moving (`web/game.ts`, `web/input.ts`)**
- The leader's speed now eases toward the stick instead of jumping. It reaches 90% of full speed in about 0.12 s and stops in about 0.3 m. A hard reversal passes through zero, so the hero pivots instead of sliding round.
- Facing turns quickly for small changes and a beat slower for a U-turn.
- The walk cycle turns with the distance really covered, and blends with the real speed. Feet no longer keep stepping after the body has stopped, and nobody runs on the spot against a wall.
- Each body leans a little into speeding up and back on stopping (`tilt`, applied in `pose()` for every body plan).
- The joystick has a small dead zone and a quick ramp (full speed a little before the rim). Its base follows a thumb that runs past the rim, so turning back needs no long swipe.

**Followers**
- They steer instead of chasing trail points: they slow as they arrive and keep personal space from each other (1.2 m) and a wider berth from the leader.
- They give way sideways when the leader walks toward them, as in a U-turn.
- They walk round colliders and walls, like the leader. One stuck for over a second slips past, as before.
- They keep out of the strip between the camera and the leader. The third follower walks wider.
- Far behind, they hurry. Only far behind *and* out of sight do they catch up in one go.
- Standing about, each turns slowly toward the way the leader faces, a little differently.

**Camera**
- Followers near the lens fade out smoothly (between 5.4 m and 3.4 m) instead of popping out of sight. The renderer has a per-draw `fade` for this.
- Mission props and NPCs are now drawn with the see-through cut. Anything within 3.6 m of the lens also thins out (`setCut`'s `near`), so a van beside the camera no longer fills half the screen.
- After a hero switch, the camera glides across for 0.7 s instead of snapping.
- Talk shots (`frameTalk`, shared by every mission and the hornbill story) score a ring of angles with `viewBlock`. It counts props nearer than the speaker and how much of the frame they would fill, colliders, walls and rising ground. The usual over-the-shoulder angle wins unless it is blocked. From a wide angle, the speaker turns three-quarters to the lens.
- The drive-off shot is a chase view from behind and above the vehicle, never inside the ground (`chaseCamera`).

**Using things**
- The leader looks at whatever is in reach. A soft ring pulses under it, and the small prop there hops gently.
- Starting an action turns the leader to face it. Finishing one plays a quick reach and a pleased face.
- Any small prop that vanishes right beside the leader (an item, a bonus find, a patch) flies in a little arc to the hero and ends in a sparkle. This works in every mission without touching the mission scripts.

**HUD and transitions** (`web/ui/hud.ts`, `web/app.ts`, `web/styles.css`)
- The "got it, 2 of 4" toast now sits just under the objective, where the eye already is, never over the team. It pops in.
- The objective gives a small bump when its count goes up. A green tick pops beside it when a step is done.
- The fade shows Navie bobbing with three dots while a place builds. They are painted before the build starts, because the build holds the page. They appear only after 140 ms, so quick builds never flash them. The dark hold is shortened by the time the build took. Errors still surface: the build is not wrapped to hide them.

**Results** (`web/ui/nlex.ts`)
- The CO₂ tiles pop in one after another, and their numbers count up. Each settles on exactly the text it showed before, from the same simulation (a count-up never changes a value). Reduced motion shows the final numbers at once.

**Sound** (`web/audio.ts`)
- Soft footsteps for the leader, by surface: grass and earth, paving in the NLEX places, wood on bridges, splashes in shallow water.
- Quiet beds under each place: distant traffic at the plaza (fainter at the yard and depot), and running water by the creek and the forest stream.
- All sound is still synthesised and still follows the Sound switch.

**Places** (`web/world/nlexZones.ts`, `floorPaint`)
- The supply yard and the depot floors now have:
  - slab joints;
  - parking bays where the vans stand, with a yellow kerb line;
  - a dashed yellow walkway from the gate to the office;
  - a white arrow on the way out;
  - grass tufts and flowers at the fence foot.
- All of it is flat or tiny, with no colliders, and draws its own random numbers, so no path, button or tree moved.

**Light** (`web/gl/renderer.ts`): characters' shadow sides are lifted a touch, and their rim light is a little stronger, so faces stay readable and the team stands off busy ground.

**Measured** (headless Chrome, CPU slowed 4×, phone screen, scratchpad scripts `perf2.js` and `movemetrics.js`):

| | Before | After |
|---|---|---|
| Frame time, every place, standing (median) | 6.9–7.0 ms | 6.9–7.0 ms |
| Frame time, walking (median) | 6.9–7.8 ms | 7.0–8.2 ms |
| Leader to 90% speed | instant | 0.12 s |
| Stop distance | 0 (with feet still stepping) | 0.33 m |
| Walk cycle per metre while stopping | stepped on the spot | the same as at full speed |
| Frames with a follower between lens and leader (hub test walk) | 1,400 of 1,990 | about 450 of 1,990 |
| Frames with two teammates closer than 0.9 m | 574 | 140–250 |

Headless Chrome draws without a phone's GPU, so frame times are for comparison, not a promise for any one phone. Building a place took 130–570 ms on the slowed CPU, which is what the loading mark covers.

**Not done in this pass:**
- No volume sliders: Sound and Music stay on/off switches.
- No new animal behaviours: the animals already look at heroes, fly off when startled and react to photos, each on its own timing.
- No new environment models beyond the floor paint and tufts.
- No change to the 7 In development stops.

## Awit becomes Amihan as a girl

Added on 13 November 2026, at Ysa's request, with the Team screen picture from Tollbound Heroes as the reference. Awit was Ligaya as a girl; she is now **Amihan as a girl**. Amihan is the Wind dancer, a pale sky-blue kite coupe with a cream bubble, a mint bumper, coral sail fins and a diamond kite in four panes. The fit is close: Awit is the Aerial Scout, and she rides a kite. Only her looks and gestures changed. Her name, role, kite glide, flute, speed, missions and saves are as they were. Navie, Dayo, Baging, Sukat and Amihan herself are unchanged.

**The outfit, from Amihan's parts** (`makeAwit` in `web/models.ts`):
- **Sky-blue dress.** Puffed sleeves with cream cuffs. Amihan's cream bubble becomes a round collar with a little coral bow, and her headlights become two cream buttons.
- **Skirt.** Her mint bumper becomes a sash and the band painted round the hem. Her coral sails become a big bow at the back of the waist, which is what the play camera sees most.
- **A new bell-shaped skirt.** It is a surface of revolution (`lathe`) that flares softly at the hem, with a frill of cream scallops peeking out under it. The old cone skirt let the tops of her legs poke through at the waist. The bell covers them.
- **Navy shoes** with cream soles and cream discs, like Amihan's wheels.
- **Colours:** sky `#a6d6ea`, cream `#fff7e9`, mint `#7fc8b9`, coral `#ef917d`, jade `#6fbcae`, wood `#8c6e46`.

**The kite, in Amihan's panes.** Both her kites use one builder (`amihanKite`). Each is cream at the top and bottom, coral on the left and jade on the right, on wooden spars, and drawn on both faces.
- **On her back:** the big glide kite. A thin string now joins its three ribbon bows, which used to float.
- **In her hair:** nothing. A little kite clip on a stick replaced Ligaya's gold horn at first, but it looked as if a kite were floating above her head, so Ysa asked for it to be removed (13 November). The bone it hung on (`bob`, 15) is now free.

**Smoother hair.** Her hair is now a single smooth shell over the head (`hairShell`). A function draws its edge all the way round:
- a rounded fringe of three soft points, swept slightly to one side;
- side hair down to the jaw, with tips that curl in;
- a low nape.

One surface has no lumps or seams, unlike the old stacked ellipsoids. A lighter band of vertex colour across the crown catches the light. Ears are not drawn for this style, because the hair covers them.

**Twin tails.** Two tails are tied high at the back with coral bows. Each is a smooth tapering curve (`sweep`) that springs up and out before it falls to a round tip. They hang on the head's spare bone (`extra2`, which pivots between the ties), so they:
- trail as she runs and bounce with each step;
- sway with her humming;
- flare out when she hops, cheers or twirls, and stream back when she glides.

**A cuter face.**
- Eyes are a little smaller and set lower, with a dusky-blue iris, a sky-blue crescent, two glints and lashes.
- The smile is smaller and rose-coloured, and the blush is softer and pinker.
- Her head is 10% bigger than other people's (it was 6%). Her skin tone is unchanged.

**Gestures** (`web/anim.ts`):
- Her walk is lighter: a smaller, softer arm swing held slightly out from the dress, and a skip in each step.
- Standing, her toes turn in slightly, her hands rest just out from the dress, and a soft bob joins her humming sway.
- Her habits (the twirl and the hands-under-chin pose) and her victory hops are kept, now with the tails flying.

**The sidebar portrait** is still baked from the model, so it shows the new look. Its camera stands a step back, so her twin tails fit in the frame.

**Cost:** about 13,250 triangles (was 11,100), still one draw call, two with the outline. That is a little under the elf helper (about 13,700), which remains the heaviest hero.

**Checked:** all 127 tests pass. They include the crate-on-head test (the back kite is skipped, since it rides folded small) and the face test (blinks, happy eyes, open mouth). She was checked from eight sides, in the glide, carry, cheer and flute poses, and in the play camera on a phone screen, standing, walking and zoomed out.

## Baging becomes a little elf helper

Added on 11 November 2026, after the professor asked for the companion to feel like a cute dwarf or elf helper rather than a goblin. The reference was a picture of little helper elves in coloured stocking caps; the orange-cap elf was followed, as the brief recommended. Elves in stocking caps with pointed ears, tunics, belts and boots are a classic archetype, and Baging is an original take on it, not a copy of any one picture. It is the same character in every way that matters to play: name, role (Rescue Partner), speed, the stretchy reach, carrying two loads, missions and saves.

**The look** (`makeBaging` in `web/models.ts`):
- **Cap**: an orange stocking cap with a fluffy cream trim, rising to a floppy tip with a cream pom-pom (on its own bone, so it bobs), and a little leaf pinned to the trim (*baging* is a vine).
- **Face**: soft peach skin, big shiny eyes, thin brows, a small button nose, rosy cheeks and a sweet smile; a ginger fringe under the cap, tufts over the ears and hair round the back.
- **Ears**: soft pointed ears, out to the sides and a little up, smaller than the goblin's.
- **Body** (first version; the tunic is orange now, see below): a big head on a short, round body; a green tunic that flares at the hem, with cream trim, a brown belt with a gold buckle and a soft cream collar; short arms with cream cuffs and small hands; tiny legs in brown tights and little boots with curled-up toes and cream cuffs.

**Personality** (`web/anim.ts`): sweet rather than sneaky. The sly hand-rub became a tiny wave up on tiptoe; the shimmy is a happy little dance; the proud stance smiles instead of grinning; the cap's tip bobs with every step and folds back when it carries something; the ears still bob and flick; the stretch and the victory jump stay.

**Portraits** (team buttons, team screen, speech) come from this model; the portrait camera was moved back to fit the cap.

**Cost:** about 12,500 triangles; one draw call, two with the outline.

**One orange costume (11 November, last).** The elves in the reference each wear an outfit that matches their cap, so Baging's does too now: the cap stays orange, and the tunic is a softer shade of the same orange, with cream trim, a brown belt with a gold buckle and brown boots. Green is gone from the outfit; only the little leaf pin on the cap keeps a touch of it, for the name.
- **Costume**: a cream petal collar (eight soft points lying on the shoulders) in place of the plain collar, the cream-trimmed hem, cream cuffs, the gold buckle, and boots with curled toes and cream cuffs.
- **Hair**: light brown instead of ginger, so it no longer runs into the orange.
- **Face**: sweeter: slightly bigger eyes set a little lower, a tinier rosy nose, a wider smile, rosier cheeks.
- **Shape**: a bigger head on a smaller, rounder body, tiny hands, and a cap whose tip curves over more smoothly to a fluffy pom-pom.
- **Motion**: the proud stance became *eager to help*: fists up in front of the chest, two quick hops on tiptoe and a big smile. The cap's tip also bounces when it is happy.

About 13,700 triangles now.

## Baging becomes a forest goblin

Added on 11 November 2026: the dog is gone, and Baging is now a cute, cheeky forest goblin, everywhere it appears (in play, the team buttons, the team screen, speech portraits, mission scenes and the victory dance, which all draw the same model). The brief came with the Goblin from Supercell's Clash Royale as its reference. That is a copyrighted character, so Baging is not a version of it: it is an original goblin built on the classic goblin traits that belong to nobody (green skin, big pointed ears, a big round nose, a toothy grin), with its own look. In particular it does not wear that goblin's blue suspenders and brown trousers.

**The look** (`makeBaging` in `web/models.ts`): a big, round, bald head with a sprig of three leaves on top (*baging* is a vine); big pointed ears out to the sides, tapering to a tip, with a pink inner ear; big shiny eyes and thick dark-green brows; a big, soft, round nose; a wide grin with two little teeth and a tongue, which grows when it is happy; soft blush. A short, chubby body in a cream tunic with a vine for a belt, a satchel on a strap across the chest, a mustard scarf with a tail that flutters behind, brown shorts, short arms with round hands and a thumb, and big bare feet with three little toes each.

**Same role, same abilities:** name, role (Rescue Partner), speed, the stretchy reach across gaps (its arms still stretch), carrying two loads, every mission and the saves are unchanged. It uses the same 16-bone rig: the dog's tail bone now carries the scarf's tail, and the ear bones the big ears. The team screen now says "A cheeky forest goblin with stretchy arms: reaches across gaps, grabs far things, carries two loads."

**Personality** (`web/anim.ts`): the ears bob with every hop and now and then give a quick flick; the scarf streams back when walking; a new cheeky hand-rub, with hands together in front, a sly glance to the side, one brow up and a big grin; the goofy shimmy, the long-arm stretch, the curious head tilt and the stretchy victory jump with ears and scarf flying stay. Its happy face is a big toothy grin.

**Cost:** about 9,800 triangles; one draw call, two with the outline.

**A bolder goblin (11 November, later).** The next brief asked for Baging to look much closer to the reference goblin. It stays original, with no blue suspenders and not matched to the Clash Royale goblin, but the classic goblin traits are pushed much harder, so it reads as a goblin rather than a green chibi:
- **Ears**: much bigger, reaching well out to the sides (about twice the head's width tip to tip), tapering to a sharp tip in three steps, with a clean pink inside.
- **Brows**: thick (`browH`), dark green, angled down towards the nose (`browTilt`) for a sly, plotting look.
- **Nose**: bigger and rounder, standing well out from the face, a warm light green.
- **Mouth**: a smirk (`smirk` lifts one corner) with the two teeth showing.
- **Head**: a little wider than tall, with a soft brow ridge for the brows and full cheeks under the eyes, so it looks less like a baby; the eyes are a touch smaller.
- **Colour**: a brighter goblin green, darker brows, and clean pink blush and inner ears (pink mixed into green turned a muddy tan).
- **Motion**: it shifts from foot to foot when standing about, and has a fourth habit, a proud stance with chest out, chin up and the biggest grin, alongside the stretch, the shimmy and the sly hand-rub.

About 10,900 triangles now.

## Baging, simpler and goofier

Added on 10 November 2026. The brief came with a picture of Jake the Dog and asked for Baging to follow it. Jake is a copyrighted character, so Baging was not modelled on that picture; Ysa chose instead to make it a simpler, goofier original cartoon dog. It keeps its own details (the caramel eye patch, the red collar with a green leaf tag, the curly vine tail with two leaves) and its own face, so it reads as a goofy yellow cartoon dog, not as Jake.

**What changed** (`makeBaging` in `web/models.ts`):
- **Body**: one soft bean (it was a puppy's round chest and belly), with a pale tummy, and the big round head sitting right on it with no neck.
- **Limbs**: thin, rubbery arms and legs with plain round ends, no paw detail (they were chunky, with cream paws and toe creases).
- **Face**: bigger, simpler eyes, a round snout standing out low on the face with a button nose on top, the little w of a smile under it.
- **Ears**: long, slim droopy ears hanging beside the face (they were broad floppy ears). Small ears on top were tried and dropped: on the round head they read as a bear's.
- **Colour**: a clean warm cartoon yellow; the tail and ears a deeper gold.

**Motion** (`web/anim.ts`): a rubberier squash and stretch in its idle bounce, and a third habit, the periscope: the whole pup stretches up tall and thin, peers about and boings back. The long-arm stretch, the goofy wiggle, the head tilt, the tail and ear motion and the victory jump are as before.

**Cost:** about 8,400 triangles (was 9,600 after the polish); one draw call, two with the outline.

## Final character polish

Added on 10 November 2026, a polish pass on the whole cast: Baging turned yellow, and every character got smoother. Nothing about play changed; Navie is untouched.

**Baging is golden yellow now** (it was green): a warm cartoon yellow, with a cream muzzle, belly and paws, golden-orange floppy ears and tail, a caramel patch round one eye, a red collar with a green leaf tag, and two green leaves at the tail's tip, so the vine in its name still shows. Its smile is now a little w under the nose, and its paws have toe creases. It keeps its own details (the eye patch, collar, leaf tag and vine tail), so it is still an original pup rather than a copy of anyone's.

**Smoother shapes.** `MeshBuilder` has a `detail` setting that cuts big shapes finer (heads, bodies, limbs, hair, caps, the console's box), while small parts stay as they were. The four heroes use 1.3, passers-by 1.15, scenery 1. Silhouettes and outlines come out rounder, without the facets that showed on heads and arms.

**Softer finish** (the character shader in `web/gl/renderer.ts`, shared with the animals): wider, gentler light bands, a slightly lifted shadow side, a soft rim light, and a faint satin sheen where the light glances off (broad and dim, so nothing looks like plastic). Characters and animals also get a slightly finer contour than the scenery, for cleaner edges.

**Faces and hands:** every blush now fades into the face through a paler halo; every person's mitten hand has a little thumb. Sukat's box has rounder corners and shoulder joints.

**Softer motion:** the leader turns a little more gently and settles more softly when the stick is let go. Only the facing and the walk cycle changed; movement still follows the stick exactly.

**Cost:** Dayo about 12,700 triangles (was 8,500), Awit 11,100 (was 7,500), Baging 9,600 (was 5,800), Sukat 7,600 (was 5,100); still one draw call each, two with the outline.

## Baging the vine pup, and Sukat the pocket console

Added on 10 November 2026, after the professor asked for the green companion to feel like a stretchy cartoon dog and the robot to feel like a little game-console friend (the brief named Jake and BMO). Both are copyrighted characters, so, as with the rest of the cast (see "Original characters" above), these are original designs that take the qualities asked for, not the looks: no orange bulldog with jowls, no teal console with its button layout. Names, roles, abilities, speeds, missions, controls and saves are as they were.

**Baging is now a stretchy green vine pup** (it was a round vine sprite with the face on its body). A round dog head on its own bone, wider than tall, with a pale muzzle, a dark button nose with a glint, a smile under it, big shiny eyes, a dark patch round one eye, rosy cheeks; floppy ears ending in a leaf's point, each on its own bone; a red collar with a gold leaf tag; a round body with a pale belly, short legs on big round paws, stretchy arms; a curly vine tail with a leaf at the tip, on its own bone. It stays green, and the leaf and vine details keep its name (*baging* is a vine) and its vine abilities.

**Sukat is now a pocket field console that walks** (it was a round robot on one wheel). A softly boxy cream body over an orange base; a big dark screen in a soft bezel, with Sukat's screen-green face on it; below the screen a round orange weather dial, a yellow and a blue button and a little speaker; yellow ear lights; a battery hatch with a sun sticker on the back; short arms and short legs with round orange feet; and its anemometer cups on a springy antenna. It keeps Sukat's own cream, orange and navy.

**New motion** (`web/anim.ts`):
- Baging: a happy bounce even standing still, a tail that never stops (faster when walking, a blur when happy), ears that flap out with every hop, a head that bobs and turns to look, a curious tilt with one ear up, the big stretch with arms growing long, and a goofy wiggle with the tongue out. Its victory dance is a stretchy jump with the tail whirling and the ears flying. Reaching across gaps still stretches its arms.
- Sukat: a waddle on its little legs, a happy bob, an antenna that springs with every step, cups turning in the breeze; a scanning twirl and a beep-boop wave. While it scans, a line sweeps the screen, its eyes go wide and dart about, its arms come up and the cups whirl. Its victory dance is hops and a spin with the antenna boinging.

**Portraits** in the speech bubbles, the team buttons and the team screen are baked from these models, so they changed with them (the portrait cameras were moved to frame the new shapes).

**Cost:** Baging is about 5,800 triangles (was 4,500), Sukat about 5,100 (was 4,400). Each is still one draw call, two with the outline. Baging uses all 16 bones; Sukat 15.

## Dayo and Awit, from Navie and the Tollbound Heroes

Added on 10 November 2026: the two people on the team now look like human counterparts of characters from SmartFlow's own Tollbound Heroes game, so the Arcade's games feel like one family. Only their looks and gestures changed: names, roles, abilities, speeds, missions, controls and saves are as they were. Navie and the Tollbound Heroes themselves are unchanged; they were only the reference (the Team screen recording Ysa sent, and the baked hero art in `frontend/games/roadTrip/assets/art`).

**Dayo is Navie as a boy.** Navie's cap (blue crown, white front with the blue circled N, a wide blue brim, a white button), Navie's blue on a top with Navie's white N on the chest, big blue eyes with a dark rim, a light crescent and two glints, brown brows, pink blush, and Navie's open grin with a tongue, which grows when he is happy. Two round cream buttons sit where Navie's headlights are, the field pack is blue and white with round reflectors, and his navy shoes have white soles and a grey disc on the side, like Navie's wheels.

**Awit is Ligaya as a girl.** (Redrawn as Amihan on 13 November; see "Awit becomes Amihan as a girl".) Ligaya is the Rhythm bard, a coral fiesta microbus with a cream face and a gold horn; she was picked because she reads most clearly as a girl among the heroes in the recording (Navie, Kuya Jepoy, Ligaya, Nico, Amihan), and because Awit means "song" and already plays a flute. Awit wears Ligaya's coral with the cream face as a round collar, the cream bumper as a waistband and a hem, and the headlights as two cream buttons; a little navy bow takes the window colour. Ligaya's gold horn is a hair clip on its own springy bone, so it bobs as she walks and tips aside when she carries something. The round side knobs became pigtail puffs tied with coral bobbles. Her eyes are Ligaya's dark ovals, bigger, with little lashes; her shoes are navy with gold discs, like Ligaya's wheels. The kite is now coral with a cream diamond on both faces and gold spars.

**For both:** heads 6% bigger than everyone else's, bigger hands and feet, and socks, so they stand out in a crowd and read at phone size.

**New gestures** (`web/anim.ts`):
- Dayo can't keep still: a light bob on his toes. Now and then he gives two confident nods, a thumbs-up with the cap hopping by itself (the short arms cannot reach the brim), or a cheerful wave with a bounce. His victory dance is a big wave with one arm and a fist pump with the other.
- Awit sways as if humming. Now and then she sways side to side swinging her arms, twirls on tiptoe, or clasps her hands under her chin with her head tilted and one foot kicked up. Her victory dance is little hops with a twist and a kick, hands waving high.

**Portraits** in the speech bubbles, the team buttons and the team screen are baked from these same models when the game starts, so they changed with them.

**Cost:** Dayo is about 8,500 triangles (was 6,200) and Awit about 7,500 (was 5,700). Each is still one draw call, two with the outline, and each place's frame time on the PC is unchanged (6.9 to 7.0 ms median). All people now have 16 bones (the last one carries Awit's horn), the most the renderer allows.

## A greener, cosier world

Added on 9 November 2026, after the professor asked for a cuter, livelier world. The gameplay, missions, saves, carbon numbers and animals are unchanged, and so is every layout: nothing that blocks movement was moved, and every new piece that does block was placed only where it keeps clear of every button, collider and path.

**Plants** (`web/world/scenery.ts`, shared by every place):
- **Trees**: rounder, layered crowns with lighter tops, flared roots, an extra clump on some so no two silhouettes match, and a fourth palette. One round tree in three is in blossom or fruit.
- **Palms** have arching fronds, coconuts and a ringed trunk; **bamboo** has knots and extra leaves.
- **Bushes** have three or four lobes in three palettes, and some flower; **rocks** get moss and pebbles; **stumps** show their rings, some with little mushrooms.
- **Grass** tufts are fuller, with sunny tips; **ferns** arch; **flowers** come in clusters of five-petal flowers with a yellow eye.
- **New pieces**: reeds with cattails, hedges, planters (flowers, a round shrub or a small palm), raised flower beds, benches, garden lamps, climbing vines, picket fences, mushrooms.
- **Soft shading for leaves**: anything that sways is lit with wider, gentler bands, so crowns and bushes read round without extra geometry. Shadow sides everywhere are lifted a little, so walls facing away from the sun stay warm instead of turning blue.

**Houses** (`web/world/buildings.ts`): every house on the creek's banks is now a cosy one, on the same footprint as before, in three styles picked by where it stands: a hip roof with a chimney, a front gable with a round attic window, or a nipa hut with thatch and woven walls. Each has a footing and corner posts, a panelled door with a knob, a step and an awning, a lantern, framed windows with shutters and a flower box, side windows, pots by the door and a flower bed. Four more stand outside the supply yard's back fence.

**Buildings**, through the same kit (framed windows, doors, awnings, lanterns, roofs with eaves):
- **Command Center**: the clinic has a door with an awning, windows down both sides and a proper paw sign; the workshop has a wide double door on the end facing the plaza (its old door was a board stuck through the wall); both roofs now turn with their buildings. The Atlas hut has round windows, a framed door and flower beds round it. Lanterns hang in the briefing pavilion and the community space; vines climb the tower; benches with flower pots face the plaza; lamps line the paths; flowers, grass and pebbles edge the paths.
- **Toll plaza**: potted plants at the ends of the lane islands, windows with flower boxes and an awning on the control room, an awning on the shed, lamps along the walkways and flower beds beyond them, a bench by the start.
- **Barangay creek**: the hall has shuttered windows with flower boxes, lanterns and planters; benches and lamps along the north bank. The reeds that come back after the clean-up now have cattails.
- **Depot and supply yard**: framed windows, awnings and planters on the offices, high windows on the workshop and warehouse, hedges inside the back fences, flower beds along the side fences, potted trees in the open, a zebra crossing inside each gate.
- **Malaya Ridge**: reeds along both banks of the stream, and mushrooms on the forest floor.
- Walls are less rounded everywhere, so buildings read as buildings rather than soap bars.

**Kept the same, on purpose:** each place's layout comes from one random sequence, and every plant builder still draws exactly as many numbers from it as before (a test checks), so no tree or bush moved. New variety comes from each plant's own position. The reachability check passes in every place at every stage.

**Limits.** No phone has run this yet. Places cost 21% to 41% more triangles than before (see Performance); draw calls barely changed, because scenery is merged per 26 m patch. A patch that fills up now starts a fresh mesh, so none can pass the 16-bit index limit (a test checks). The garden's raised beds, the depot's open concrete and the plaza's lanes are left open, because missions use them.

## Cuter characters

Added on 9 November 2026, after the professor asked for cuter, more expressive characters. Nothing about the missions changed: the objectives, the carbon calculations, the rewards, the wildlife system and the save are as they were. The cast is still the original one (the brief again named Finn, Jake, BMO and Marceline; see "Original characters" above), and Navie is still the app's own picture, never redrawn.

**The real 3D models were reworked**, in `web/models.ts`. The characters are built from code, so the geometry itself changed, not just pictures:
- **People** (Dayo, Awit, every NPC): a bigger, rounder head (about 40% of their height), a short soft body, stubby legs with big round shoes, short chubby arms with mitten hands, small ears, a button nose. They stand about 1.55 m instead of 1.72 m.
- **Faces**: big shiny eyes with two glints each, set low on the face; soft brows; a small curved smile; rosy cheeks.
- **Baging** kept its vine-sprite shape then; it became a vine pup on 10 November (see "Baging the vine pup" above).
- **Sukat** kept its round robot body, cups and wheel then, with a screen-green face and pink cheek lights; it became a walking pocket console on 10 November.
- **Every NPC looks different** now: their own hairstyle (ponytail, bun, bob, curly, spiky, side part, grey with a moustache), build and accessories (glasses, safety glasses, a stethoscope, a radio, a clipboard, binoculars, a wrench, hats and caps). Each keeps their old colours.
- **Softer shading on characters and animals only**: the same bands of light, wider and gentler, so faces never get a hard shadow edge. The scenery keeps its crisp look. Fine face details have no outline, so glasses and smiles stay thin.

**Faces move.** Each face is on bones of its own (eyes, closed "happy" eyes, two brows, the smile, an open mouth). A part not in use shrinks to a point inside the head. So faces cost no extra draw calls, and no new meshes.

| Feeling | Eyes | Brows | Mouth | When |
| --- | --- | --- | --- | --- |
| Happy | closed, ^ ^ | up a little | open smile | a step done, a celebration, switching hero, a photo of a new animal |
| Surprised | wide | up | a small "o" | the first photo of a new animal, finding the hidden bird |
| Worried | a little smaller | tilted up in the middle | a flat line | arriving at a rescue (the hornbill, the creek) |
| Curious | open | one up | a smaller smile | another mission's arrival, a new animal close by |

Everyone blinks every few seconds, out of step with each other; some blink twice.

**More life, in `web/anim.ts`:**
- **Idle**: breathing, a sway, and every few seconds a look around, a curious head tilt or a habit of their own: Dayo nods, gives a thumbs-up or waves, Awit twirls on tiptoe or strikes a cute pose (see "Dayo and Awit" above), Baging stretches its arms long or does a goofy wiggle, Sukat does a scanning spin or a beep-boop wave. NPCs check a radio, read a clipboard, wave, stretch, look through binoculars or swing a wrench.
- **Walking** is bouncier, with a small squash at each footfall, and characters lean into turns.
- **Switching hero**: the new leader hops and smiles.
- **A step done**: the leader does a short victory dance (Dayo waves and pumps a fist with the cap bouncing, Baging jumps with its arms stretched long and its tail whirling, Sukat hops and spins with the antenna boinging, Awit hops with a twist and a kick). Moving cuts it short. Animals nearby stop and look round.
- **Heads turn** to things: heroes look at the nearest animal, and people look at the team and wave the first time it comes close.
- **Carrying**: a crate now rides on the head, both hands up to steady it, because short chibi arms cannot reach above a big head.

**Animals** (`web/fauna.ts`): eyes have a second glint and the small birds' are a little bigger; birds, the egret, the eagle, the owl, frogs and macaques blink (fish and geckos do not: they have no eyelids that blink). Songbirds and macaques tilt their heads now and then, curious. Butterflies flap smoothly and have a darker edge and a second spot on each wing. The frog has a gentle smile. Species colours and shapes are unchanged. The hornbill gets a slightly bigger eye with a glint, and blinks.

**Navie** is the app's own picture, never redrawn. It now moves: a gentle car-suspension bounce while speaking, a small pop as each line appears, a soft bob in menus, and three happy hops on a finished mission. Reduce Motion turns all of it off.

**Camera**: a touch closer (10.6 m, was 11.5) and aimed a little lower, for the shorter cast; the dialogue portraits frame head and shoulders. In a photo, the leader is hidden if standing right in front of the lens, as followers already were.

**Camera zoom** (added 12 November 2026). The player can pull the camera back to see more of the world, but never closer than the default view (10.6 m). The farthest is 1.9 times that (about 20 m). Ways to zoom:
- **Phone:** pinch with two fingers. Two fingers on the right half work at any time. A pinch across the middle also works when both fingers land together, before either moves, so the move stick never steals it.
- **Computer:** the mouse wheel, or the + and - keys.
- **Controller:** the triggers.

The zoom eases in smoothly, lasts while you change places, and is ignored while paused. Scripted scenes and photos keep their own cameras.

As the camera pulls back it tilts a little further down (up to 0.2 rad more). The see-through fade around the line of sight also widens (2.5 m up to 4.5 m), so the toll plaza canopy and nearby roofs dissolve instead of hiding the team. At the default view nothing changed. Fully zoomed out, frame time is unchanged in every place, and triangles rise by at most about 10% (the Command Center).

**Tests** (`tests/characters.test.ts`): every character stays within the renderer's 16 bones and 16-bit indices, every vertex follows a real bone, every face has its parts, the feelings show and wear off, everyone blinks every few seconds, and two people rarely blink together.

**Limits.** No phone has run this yet. Characters cost more triangles than before (about 4,400 to 6,200 each, up from about 1,700 to 2,100); draw calls are unchanged. "Happy eyes" and the open mouth are separate small shapes swapped in, not a deforming face, so expressions change instantly rather than morphing. Short arms cannot reach above the head, so waves and the radio are held at the side of the head.

## Simpler missions and more animals

Added on 8 November 2026, after the professor's feedback: more animals, less reading, simpler missions. Nothing was removed from the world: the Command Center, Navie, the cast, the five missions, the 100-species roster, the emissions models and the save all carry on.

**Three steps per mission, and no trip back to Navie.** A mission starts from Navie's menu or the Operations Board and goes straight to its place. The HUD shows the mission's short name, the step as one line, and dots with a count (1/3) that tick as steps finish.

| Mission | Step 1 | Step 2 | Step 3 |
| --- | --- | --- | --- |
| The Great NLEX Gridlock | Find the broken scanner (Sukat scans the RFID scanner) | Fix the scanner (one wiring puzzle) | Get the traffic moving (open the lanes; Hint fills one lane in) |
| Creek Rescue | Pick up the litter (5 pieces, each straight into the right sorted sack) | Clear the blockage (Baging or Dayo; the water runs clean) | Spot the animals coming back (photograph a fish, a dragonfly and a frog) |
| Solar Power Rescue | Find the power switch | Connect the solar panels (a small 4×3 wiring puzzle) | Turn on the solar power (the lights and the inverter come on) |
| Eco Delivery Rush | Collect the supplies (one for each hero, straight into the van) | Choose a greener vehicle (four cards, each with its simulated CO₂) | Send the delivery |
| The Hornbill Homecoming | Find the hurt hornbill (Sukat scans it from the bank) | Clear the path (the trunk, then the crossing) | Help the ranger (bring the kit, plant two saplings, watch the release) |

A bot plays each mission in 12 to 25 seconds with every line skipped; with reading and walking that comes to roughly two to five minutes.

**What was taken out to get there** (shared code stays): the call at Navie's station; the Gridlock's survey, five repairs, power cell and tag-reader surprise; the creek's oil trail, floodgate puzzle, replanting and collection-run plan; the depot's audit, four repairs, crew-day planner and installers' delivery plan; the yard's packing puzzle and full transport board; the hornbill's station planning, quiet-zone signs, generator and two of the four saplings.

**Carbon, still calculated.** The Gridlock runs the plaza's simulated hour on the lanes the player opens. Solar Power Rescue runs the depot's simulated day with the roof on, and credits nothing else, because the simplified mission makes no other repairs. Eco Delivery Rush runs the transport model for each vehicle on the fixed 10:00 AM run by NLEX: the electric van is greenest, at 25.1 kg against the usual way's 54.9 kg. Creek Rescue and the hornbill mission have no CO₂ result now. Their results are the creek flowing, the bird helped and the gap replanted. Every results screen opens with a few short lines; "See the numbers" opens the breakdown and how it was calculated.

**Animals everywhere** (`web/fauna.ts`, `web/world/wildlife.ts`). There are 14 kinds, drawn larger than life so they read from the play camera. Each has a small skeleton and its own behaviour loop:
- sparrows peck and hop in flocks; bulbuls and fantails move between bushes, rocks and trees; swallows loop overhead
- a kingfisher dives; an egret wades and strikes; butterflies visit real flower heads; dragonflies hover and dart
- frogs sit, puff their throats and hop into the water; fish show their fins and leap; a gecko scurries
- macaques sit, groom and keep their distance; a Philippine eagle soars; a Philippine eagle-owl roosts

Each animal is offset in time, so a flock never moves in step. They react to the team: small birds fly off, frogs hide in the water, macaques walk away.

| Place | Animals out |
| --- | --- |
| Command Center | 36: sparrows, bulbuls, a fantail, butterflies, swallows, a gecko |
| Malaya Ridge | 29: butterflies, bulbuls, a fantail, a kingfisher, dragonflies, frogs, fish, macaques, the eagle, the eagle-owl |
| Toll plaza | 24, on the verges only: sparrows, bulbuls, butterflies, swallows, egrets |
| Creek | 8 while it is dirty; 24 once it is clean: fish, dragonflies, frogs, an egret, a kingfisher, butterflies, a fantail |
| Depot, supply yard | 13 each: sparrows, bulbuls, butterflies, swallows, and a gecko or a fantail |

Nothing is put on a traffic lane. The two Atlas species appear only in the Luzon forest, inside their checked ranges, and their photo notes quote their checked cards. Small birds prefer low perches (bushes, rocks, stumps) so they stay in view; the scenery records these, and tree-tops and flower heads, as it is planted.

**Photos.** Any hero can photograph an animal from a few steps away. The camera frames it (leaves in the way fade out), the animal pauses and turns to look, there is a flash, and the first photo of each kind adds a field note (+5 points). The facts are in the Gallery's field notes, not on screen. A photo button always loses to a mission's button, and birds flying overhead lose to an animal right in front of the team.

**Short animal activities** at the Command Center, once each and under a minute: Butterfly Watch (watch 3 garden butterflies), Find the Bird (follow a song, louder as you get close, to a fantail hiding in a bush), Wildlife Spotter (photograph 3 kinds there). The litter quest is now called Habitat Helper. A new achievement, Wildlife photographer, is for 10 kinds.

**Less reading.** Every objective is 3 to 7 words, mission descriptions are one sentence, Navie speaks one short sentence at a time, and a results screen opens with one cheer. Tests check the word counts.

**The world reacts.** The creek turns from murky to clear and its wildlife comes back. The plaza's lane lights turn green and the queues roll through. The depot's lights and inverter come on. At Malaya Ridge, the saplings have grown by next season (labelled as an illustrative story moment). One trip's CO₂ is never shown restoring a habitat.

**Saves.** Finished missions keep their records, and a replay with nothing measured never replaces a measured best. A mission left half-way under the old, longer steps is not resumed: it starts afresh, because its old steps no longer exist.

**Limits.** No phone has run this yet; the figures below are from the PC. The Philippine eagle and the eagle-owl are the only other Atlas species with a model: they are seen and photographed, not played. The rufous hornbill is still the only species with a mission, and 97 species have no model yet. Fish show themselves by their fins and their leaps, because the water is drawn opaque.

## The gameplay expansion

*Parts of the missions in this section were simplified on 8 November 2026: see the section above. The shared systems, the Command Center and the progression still apply.*

Added on 6 November 2026, second round, without removing anything. The cast, the art style and the core mechanics are unchanged.

**Shared systems.**
- *Puzzles* (`core/puzzles.ts`, `web/ui/puzzles.ts`): four rotate-the-pieces circuits (the booth cable, the weather station, the creek's water channels, the depot's roof wiring), a three-dial sensor calibration solved by deduction (the sensor only says how many dials are right), and packing the van. Every one can be left and come back to, and offers a hint. Tests prove each circuit solvable from its start and not already solved, and the van packable.
- *Patches and wildlife* in every zone: 15 Guardian patches, each reachable only by one hero, and 6 kinds of common wildlife Sukat can observe (butterflies, swallows, dragonflies, a frog, a house gecko, tree sparrows). Each fact is a plain, general one about the animal, never about a made-up place. Dragonflies and the frog appear only after the creek runs clean.
- *Feedback*: sparks off repairs, confetti and the team cheering at the end of a mission, splashes, leaves, a sparkle on anything found.
- *Navigation*: the objective shows how many parts are done (for example 2/5). A hint button asks Navie what to do now and who can do it. A Go button appears when the objective is more than 24 m away and fades the team most of the way. The guide arrow can be turned off in Settings; the hint button still shows it for a while.

**The living Command Center (`web/hub.ts`).** People walk about and stop to talk when you come near, with lines that change once missions are done. A patrol car drives a loop and stops for the team. Two maintenance vehicles are parked by the gate.
- *Stations*: Navie's Mission Station is a menu (missions, side quests, the Atlas quiz, recent achievements). The Eco Workshop sells field gear and Command Center improvements. The Guardian Achievement Gallery has trophies on pedestals, patches, field notes and mission records. There is a notice board.
- *Side quests*: four short jobs, each paid once, with no timers: tidy 4 bits of litter into the recycling bin; rewire the weather station (circuit); check 3 air-quality sensors (Sukat); and Navie's Atlas quiz, where each question quotes a checked species record.
- *Gear* changes play: trail boots (walk 10% faster), Sukat's field lens (hidden patches and wildlife sparkle within 14 m), Awit's long kite (glides last half as long again), Baging's long vines (1 m more reach).
- *Decorations* appear on their own as missions are finished: the plaza's lane-light model, the creek cleanup display, solar path lamps, the field van with seedling trays, and a hornbill nest-box model.

**The missions now.**

| Mission | What changed |
| --- | --- |
| The Great NLEX Gridlock | Five stages. The queue builds while the camera sweeps along it, and two optional clues can be scanned. There are five repairs, each done a different way: the signal (climb or glide), the cable (stretch or splice, then a circuit), the toll sensor (Sukat, dials), the jammer, then Dayo carries a power cell to the control room. Next come the lanes. Then a tag reader fails on one of the player's own tag lanes, the lane stops, and the lanes must be set again under that new rule. The ending reads the simulation: if cars are still in line when the hour ends, it says how many. |
| Creek Rescue (was River Rescue) | Sukat follows an oil trail to the drum. The specialist still does the handling. The floodgate is a water-channel circuit. Afterwards, native grass is replanted at three spots on the bare bank. That is a new environment objective, not wildlife habitat. |
| Solar Power Rescue (was The Eco Expressway) | The Wasteworks scrambled the depot's roof wiring: a circuit puzzle among the repairs. The planner is now "Balance the crew day": the solar roof is this mission's job and takes 6 of the 8 hours, so the choice is what fits in the rest. After installing comes a switch-on scene. Its kWh figure is the simulated day's own, and it says when the roof could make more than the depot uses in daylight. |
| Eco Delivery Rush (new, Balintawak) | A new supply yard. Six supplies, four of which need one particular hero: tents on a high rack (Dayo), a kit in a locked cage (Baging), rope on the gutter (Awit), and three look-alike crates (Sukat finds the right one). Then pack the van, plan the run to the ridge, and watch the chosen vehicles drive out of the gate. If the hornbill expedition has not been played, "To Malaya Ridge" starts it. |

**The delivery run's numbers.** These are game assumptions: 52 km by NLEX and the provincial road, or 46 km by the old national road, and two technicians plus 215 kg by noon. The usual way is two vans loaded loose, at 54.9 kg CO₂, simulated. The best plan is the electric van at 10:00 AM by NLEX, at 25.1 kg. The e-van cannot go at 6:00 (it is on the clinic run), and at 8:00 traffic would drain its battery.

**The Gridlock's surprise.** The failed reader is always one of the player's own tag lanes. Tests check that for every working setting, at least one working setting remains once that reader is down.

**Save version 3** adds patches, field notes, side quest progress, gear, achievements and the guide setting. Version 2 saves load with those empty. Every grant is keyed by id, so it is given once. Points still never turn into kilograms, animals or places.

**Achievements**: 13, from "First call answered" to "Corridor Guardians", each 10 points, once. They are read from the save, so replays cannot earn them twice.

## Separate measures

These never convert into one another, and replays don't inflate them: individuals helped, species helped (capped at 100), habitat objectives, simulated emissions, Guardian Points, and self-reported Beyond the Game badges.

## Performance

Measured in Chrome on the development PC, at phone size (390 × 844, double density), on 6 November 2026, and again on 8 November with the animals (the second table). **These numbers say what the game asks of a device. They do not predict a phone's frame rate, because no phone has run it yet.**

| Place | Triangles | Draw calls | Geometry | Frame time on the PC |
| --- | --- | --- | --- | --- |
| Malaya Ridge | about 80,000 | 54 | 8.9 MB | 6.9 ms median |
| Toll plaza | about 78,000 | 42 | 7.4 MB | 6.9 ms median |
| Eco Command Center | about 58,000 | 41 | 6.5 MB | 6.9 ms median |
| Maintenance depot | about 39,000 | 44 | 5.0 MB | 6.9 ms median |
| Barangay creek | about 22,000 | 21 | 3.6 MB | 6.9 ms median |
| Supply yard (new) | about 40,000 | 45 | 5.4 MB | 6.9 ms median |
| Command Center as played, every mission done | about 62,000 | 56 | | 7.0 ms median, 8.6 ms p95 |

**With the animals, as played** (8 November): each place with its mission's props and animals, the normal camera.

| Place | Animals out | Draw calls | Triangles | Frame time on the PC |
| --- | --- | --- | --- | --- |
| Command Center | 36 | 71 | about 67,000 | 7.0 ms median, 8.2 ms p95 |
| Malaya Ridge | 29 | 79 | about 91,000 | 7.0 ms median, 8.2 ms p95 |
| Toll plaza | 24 | 56 | about 90,000 | 7.0 ms median, 8.0 ms p95 |
| Creek, cleaned | 24 | 37 | about 26,000 | 7.0 ms median, 8.0 ms p95 |
| Maintenance depot | 13 | 63 | about 53,000 | 6.9 ms median, 7.9 ms p95 |
| Supply yard | 13 | 59 | about 44,000 | 6.9 ms median, 8.0 ms p95 |

**With the cuter characters** (9 November): the same places, measured the same way.

| Place | Animals out | Draw calls | Triangles | Frame time on the PC |
| --- | --- | --- | --- | --- |
| Command Center | 36 | 73 | about 103,000 | 7.0 ms median, 8.1 ms p95 |
| Malaya Ridge | 29 | 73 | about 106,000 | 6.9 ms median, 8.1 ms p95 |
| Toll plaza | 24 | 55 | about 108,000 | 7.0 ms median, 8.1 ms p95 |
| Creek, cleaned | 24 | 36 | about 44,000 | 6.9 ms median, 8.0 ms p95 |
| Maintenance depot | 13 | 63 | about 81,000 | 6.9 ms median, 7.9 ms p95 |
| Supply yard | 13 | 59 | about 62,000 | 7.0 ms median, 8.0 ms p95 |

The extra triangles are the rounder heads, faces and hair: each character is still one draw call (two with its outline).

**With the greener world** (9 November, later): the same places, measured the same way.

| Place | Draw calls | Triangles | Frame time on the PC |
| --- | --- | --- | --- |
| Command Center | 74 | about 135,000 (was 102,000) | 6.9 ms median, 7.8 ms p95 |
| Malaya Ridge | 69 | about 150,000 (was 107,000) | 6.9 ms median, 7.9 ms p95 |
| Toll plaza | 56 | about 138,000 (was 109,000) | 6.9 ms median, 7.7 ms p95 |
| Creek, cleaned | 37 | about 57,000 (was 45,000) | 6.9 ms median, 7.9 ms p95 |
| Maintenance depot | 70 | about 98,000 (was 81,000) | 6.9 ms median, 7.7 ms p95 |
| Supply yard | 64 | about 86,000 (was 62,000) | 7.0 ms median, 8.0 ms p95 |

Tiny details (blossom dots, flowers, reeds, pebbles, window glints) are drawn without an outline, which halves their cost. The page is now 1,136 KB.

Each animal is one draw (its outline is dropped beyond 24 m), animals off screen or over 64 m away are skipped, and only animals on the ground near the camera get a shadow. The page is now 1,061 KB.

The PC's frame time is capped by its 144 Hz screen. JavaScript memory read about 45 MB in the busiest Command Center. The page is 1,048 KB, of which 218 KB is Navie's art.

The expansion's moving props (people, the patrol car, trophies, decorations, critters, patches) would have taken the Command Center to 123 draw calls. Props are now skipped when off screen, using each mesh's own bounding sphere, which brings it to 56.

Triangle counts went up on 6 November. That is not new detail: an old culling bug had been hiding scenery near the edges of a tall phone screen, and the fix draws it.

**For slow phones:** Settings has a Smoother option, which lowers the drawing resolution and drops scenery outlines. If frames average over 38 ms across 120 frames, the game switches to it once by itself and says so.

## Built, and not built

**Built on 6 November:** the Eco Command Center, Navie as mission guide, the NLEX Operations Board, the Environmental Progress dashboard, three NLEX missions in three new places, the toll plaza and depot models, three eco upgrades unlocked by missions.

**Built before:** Field Station hub, four switchable heroes with working abilities, The Hornbill Homecoming, Malaya Ridge as the exploration zone, the transport board, rescue-support and habitat objectives, separate results, Atlas with all 100 entries, checkpoints, the next-season scene, recap, Beyond the Game, workshop, gallery, settings.

**Built in the expansion (second round, 6 November):** see "The gameplay expansion" above.

**Built on 14 November:** the smoothness and polish pass: eased movement and a better stick, steering followers that keep out of the view, fades instead of pop-outs, clear talk shots, highlights, reach and fly-in pickups, a loading mark on the dark screen, the toast under the objective, count-up CO₂ tiles, footsteps and ambient beds, floor paint in the yard and depot. See "The smoothness and polish pass" above.

**Built on 13 November:** the kite hair clip removed from Awit at Ysa's request, because it looked like a kite floating above her head.

**Built on 13 November:** Awit redrawn as the Tollbound hero Amihan as a girl: a sky-blue dress with a cream collar, mint trim, coral bows and a bell skirt with a frill; smooth hair in one piece with swinging twin tails; Amihan's four-pane kite; a cuter face; a lighter walk. See "Awit becomes Amihan as a girl" above.

**Built on 12 November:** the NLEX Eco Adventure map with all 18 mainline stops, eight new playable missions, the CO₂ card on every result, bonus finds, five lighting moods and rain. See "The 18-stop campaign" above.

**Built on 11 November, final:** the elf helper in one orange costume: an orange tunic to match the cap, a cream petal collar, light-brown hair, a sweeter face, a bigger head, a fluffy pom-pom, an eager-to-help gesture. See "One orange costume" above.

**Built on 11 November, last:** Baging became a little elf helper: orange stocking cap with a pom-pom, soft pointed ears, a sweet face, a green tunic with a buckled belt, curled boots, a tiny wave. See "Baging becomes a little elf helper" above.

**Built on 11 November, later:** a bolder goblin: bigger ears, thick sly brows, a bigger nose, a smirk, a brow ridge and cheeks, cleaner pinks, a proud-stance habit. See "A bolder goblin" above.

**Built on 11 November:** Baging replaced: the dog is now an original, cheeky forest goblin, with a hand-rub habit, flicking ears and a fluttering scarf. See "Baging becomes a forest goblin" above.

**Built on 10 November, after the polish:** Baging made simpler and goofier: a bean body, thin rubbery limbs, bigger simple eyes, a round snout, long slim droopy ears, and a periscope stretch. See "Baging, simpler and goofier" above.

**Built on 10 November, last:** a polish pass: Baging golden yellow, every character cut finer and shaded more softly, softer blush, thumbs, gentler turning. See "Final character polish" above.

**Built on 10 November, later:** Baging redrawn as a stretchy green vine pup and Sukat as a walking pocket console, with new idle motion, scanning and victory dances. See "Baging the vine pup, and Sukat the pocket console" above.

**Built on 10 November:** Dayo redrawn as Navie as a boy and Awit as the Tollbound hero Ligaya as a girl, with new idle gestures and victory dances. See "Dayo and Awit, from Navie and the Tollbound Heroes" above.

**Built on 9 November, later:** a greener, cosier world: rounder trees and bushes, flowers in clusters, fuller grass, reeds, hedges, planters, flower beds, benches and lamps; cosy houses in three styles; windows, doors, awnings and lanterns on the Command Center, plaza, creek, depot and yard buildings. See "A greener, cosier world" above.

**Built on 9 November:** cuter, rounder characters with faces that blink and show four feelings, idle habits for every character, bouncier walking, victory dances, people who notice and wave, softer shading on characters, cuter animal eyes and head tilts, Navie's bounce. See "Cuter characters" above.

**Built on 8 November:** three-step missions, short text everywhere, 14 kinds of animated wildlife in every place, photos and field notes, three animal activities at the Command Center, a simpler lane screen and vehicle choice, short results with the numbers one tap away. See "Simpler missions and more animals" above.

**Planned, not built (In development on the map):** Eco Traffic Start (Balintawak), RFID Rescue (Marilao), Event Traffic Hero (Ciudad de Victoria), Eco Supply Run (Tabang), Traffic Flow Fix (Sta. Rita), Clean Cargo Mission (San Simon), The Wasteworks Showdown (Dau), and a wildlife follow-up visit to the hornbill.

**Not built yet:** the seven planned missions above, the other Chapter 1 missions, Chapters 2 to 10, 97 species models, a Filipino translation (the text is structured for one), guest save merge, voice acting, recorded music.

**Partly built:** Controller code exists, but has not been tested with a real controller.
