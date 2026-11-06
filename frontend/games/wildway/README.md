# NLEX: Wildway Guardians

A third-person 3D wildlife rescue adventure in the SmartFlow NLEX Arcade. Tagline: *Change the journey. Protect their future.*

**What exists today is a vertical slice.** It has three playable NLEX missions and 1 of 100 species with a playable wildlife mission. The other 99 species are on the roster with honest labels. This document says what is built and what is only planned.

**The flow:** the SmartFlow NLEX Eco Command Center, then an NLEX mission or a wildlife expedition, each with its own simulated emissions decision, then results that keep every measure apart, then back to the Command Center.

## Run, build, test

```
node scripts/build-wildway.js                 rebuild generated/wildwayHtml.ts (required after any edit)
node scripts/build-wildway.js --html out.html also write a page you can open in a desktop browser
node scripts/test-wildway.js                  unit tests
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
| `core/nlex.ts` | The NLEX line of stops, what opens when, and the progress totals. |
| `core/species.ts`, `core/speciesFacts.ts` | The 100-species roster and the checked records. |
| `core/mission.ts` | Missions as data, and the step machine that saves and resumes. |
| `core/save.ts` | Versioned save, atomic mission completion, upgrades, patches, side quests, gear, achievements. |
| `core/progression.ts` | Patches, wildlife observations, side quests, gear, the Atlas quiz, achievements and Command Center decorations, as data. |
| `core/puzzles.ts` | The puzzle kit: circuits, sensor dials, van packing. Pure, with solvability tests. |
| `core/registry.ts` | Which models and animations exist. |
| `core/content.ts` | Everything the game says, in one place, ready for a Filipino version beside it. |
| `web/gl/` | Our own WebGL 1 toon renderer: bands of light, outlines, rigid skinning, stylised water. |
| `web/models.ts`, `web/anim.ts` | Characters built from code, and their animation. |
| `web/world/` | Terrain, scenery and the six zones: Malaya Ridge, the Command Center, the toll plaza, the creek, the depot, the supply yard. |
| `web/game.ts` | The live world: movement, camera, followers, interactions. |
| `web/hornbill.ts`, `web/missions/` | The five mission scripts, and what they share: patches and wildlife in every zone. |
| `web/hub.ts` | The living Command Center: people walking about, the patrol car, side quests, trophies, decorations. |
| `web/navieArt.ts` | Navie, generated: resized copies of the app's own mascot images. |
| `web/app.ts`, `web/ui/` | Menus, flow, save handling, puzzle screens (`ui/puzzles.ts`), Command Center screens (`ui/hubScreens.ts`). |
| `tests/` | Unit tests. |

## Original characters, not Adventure Time

The brief named Finn, Jake, BMO and Marceline. Those are copyrighted characters, so the game uses original ones in the same four roles and the same family of art style: bold outlines, flat colour, a few bands of light, squash and stretch.

| Brief's role | Character | What they do in the game |
| --- | --- | --- |
| Field Guardian | Dayo | Moves heavy things, climbs, builds |
| Rescue Partner | Baging, a vine sprite | Stretches across gaps, reaches far things, carries two loads |
| Eco Analyst | Sukat, a weather-station robot | Scans from a distance, keeps the Atlas |
| Aerial Scout | Awit | Rides a kite to scout, plays a bamboo flute for sound puzzles |

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

**The line.** The Operations Board shows six stops south to north in their real order: Balintawak, Valenzuela, Bocaue, San Fernando, Angeles and Dau. They are themes for made-up missions, never real incidents. Angeles and Dau have no mission yet and say so. The Great NLEX Gridlock opens the line, and the other two missions open after it. The hornbill expedition is open from the start.

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

## The gameplay expansion

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

Measured in Chrome on the development PC, at phone size (390 × 844, double density), on 6 November 2026. **These numbers say what the game asks of a device. They do not predict a phone's frame rate, because no phone has run it yet.**

| Place | Triangles | Draw calls | Geometry | Frame time on the PC |
| --- | --- | --- | --- | --- |
| Malaya Ridge | about 80,000 | 54 | 8.9 MB | 6.9 ms median |
| Toll plaza | about 78,000 | 42 | 7.4 MB | 6.9 ms median |
| Eco Command Center | about 58,000 | 41 | 6.5 MB | 6.9 ms median |
| Maintenance depot | about 39,000 | 44 | 5.0 MB | 6.9 ms median |
| Barangay creek | about 22,000 | 21 | 3.6 MB | 6.9 ms median |
| Supply yard (new) | about 40,000 | 45 | 5.4 MB | 6.9 ms median |
| Command Center as played, every mission done | about 62,000 | 56 | | 7.0 ms median, 8.6 ms p95 |

The PC's frame time is capped by its 144 Hz screen. JavaScript memory read about 45 MB in the busiest Command Center. The page is 1,048 KB, of which 218 KB is Navie's art.

The expansion's moving props (people, the patrol car, trophies, decorations, critters, patches) would have taken the Command Center to 123 draw calls. Props are now skipped when off screen, using each mesh's own bounding sphere, which brings it to 56.

Triangle counts went up on 6 November. That is not new detail: an old culling bug had been hiding scenery near the edges of a tall phone screen, and the fix draws it.

**For slow phones:** Settings has a Smoother option, which lowers the drawing resolution and drops scenery outlines. If frames average over 38 ms across 120 frames, the game switches to it once by itself and says so.

## Built, and not built

**Built on 6 November:** the Eco Command Center, Navie as mission guide, the NLEX Operations Board, the Environmental Progress dashboard, three NLEX missions in three new places, the toll plaza and depot models, three eco upgrades unlocked by missions.

**Built before:** Field Station hub, four switchable heroes with working abilities, The Hornbill Homecoming, Malaya Ridge as the exploration zone, the transport board, rescue-support and habitat objectives, separate results, Atlas with all 100 entries, checkpoints, the next-season scene, recap, Beyond the Game, workshop, gallery, settings.

**Built in the expansion (second round, 6 November):** see "The gameplay expansion" above.

**Planned, not built:** RFID Rescue (Marilao), Rainy Day Rescue (Pulilan), Night Shift Guardians (Angeles), The Eco Convoy (Dau), The Wasteworks Showdown (the finale), and a wildlife follow-up visit to the hornbill. These are the brief's Priority 3.

**Not built yet:** missions at Angeles and Dau, the other nine Chapter 1 missions, Chapters 2 to 10, 99 species models, a Filipino translation (the text is structured for one), guest save merge, voice acting, recorded music.

**Partly built:** Controller code exists, but has not been tested with a real controller.
