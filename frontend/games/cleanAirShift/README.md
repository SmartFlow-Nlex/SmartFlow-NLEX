# Carbon Rush: Toll Plaza Rescue

A fast toll plaza traffic game in Navie's Arcade, about how queues turn into CO2. It began as Clean Air Shift, and the
folder, route (`/arcade/clean-air-shift`) and save key (`smartflow.cleanAirShift.<email>`) keep that name so nobody loses
progress. It only reads Rush Hour's vehicle pictures and the app's mascot art, and changes nothing in the other games.

## What it is

Each shift is about 90 seconds of traffic waves. Every vehicle left waiting burns CO2 at its class's real idling rate and fills
the shift's budget; fill it and the shift ends in a smog alert. Stars depend on how far below "no manager" (exactly the same
vehicles with nobody at the controls) you finish.

- **Tap a booth** (on the plaza, or its chip below) to open or close it. Crews are limited. A booth never closes on a vehicle it
  is serving: it stops taking traffic, finishes its line, then closes, and only then is its crew free.
- **Swipe across a lane** to send approaching vehicles elsewhere: the one under your finger and those behind it. Or tap a
  vehicle, then a lane. They steer across over time, wait for a gap, and never overlap. Once a vehicle has joined a line, it stays.
- **Reload lanes**: a vehicle with a yellow ₱ has no load and can only pay at a ₱ lane. If it reaches another booth it blocks it.
- **Emergencies**: tag problems (tap ?), breakdowns (tap ! for Navie's tow), reader faults (tap the wrench, then a short repair),
  booth closures (announced first; the crew is free meanwhile), surges and convoys (announced first).
- **Engines Off**: everyone behind the front of each line stops idling for 8 minutes.
- **Between waves**, two changes appear for a few seconds without stopping the game (extra staff, truck signs...). Optional.

Booth colours: green open, yellow busy (or opening, closing), red closed, orange malfunctioning. Each has a mark as well.

| Plaza | Adds |
|---|---|
| Meycauayan | Booths only, tutorial |
| Marilao | Swiping, reload lane, tag problems |
| Bocaue Barrier | Faster waves, surges, convoys, Engines Off |
| Balintawak | Reader faults, breakdowns |
| San Fernando | Few crews, truck-heavy traffic |
| Dau | Everything, five waves, finale |

**Today's shift**: same for everyone on a Manila date, with star targets measured from the bots so hard and easy days ask for the
same skill. Tips the first time each thing comes up freeze the shift and ask for the one action they teach.

## Where the numbers come from

`core/factors.ts` copies the dashboard's figures (SmartFlow-NLEX: `Back-End/src/services/emissions-source.ts`,
`docs/emissions-optimiser-spec.md`). **If the dashboard's factors change, change them here too**; a test pins them.

| | kg CO2 per idling minute | |
|---|---|---|
| Class 1, cars | 0.0444 | 0.3 gal/h gasoline (Argonne 2010), 8,887 g/gal (US EPA 2026) |
| Class 2, buses and small trucks | 0.1357 | 0.8 gal/h diesel (Argonne 2015), 10,180 g/gal |
| Class 3, large trucks | 0.1697 | 1 gal/h diesel (Argonne 2010), 10,180 g/gal |

Also real: the fleet mix (78.07 / 13.51 / 8.42% of trips) in most waves, and 196.1 g/km (EMEP/EEA 2023) behind "like driving a
car N km". Made for the game: traffic, lane counts, booth times, emergencies. One second of play is one minute at the plaza.
The kg show how queues become CO2; they are **estimates, not measurements of any NLEX plaza**, and the in-game "The numbers"
page says so. "No manager" is this game's own comparison, not a claim about real plazas.

**Fairness rules the tests hold:** the player and "no manager" get the same vehicles, because a change that altered demand would
break the comparison (a carpool upgrade was removed for this reason). CO2 only ever rises: clearing a line slows what is burned
next, and only the haze clears. Vehicles never teleport, overlap or change lanes once in line.

## Code

- `core/` pure TypeScript: `sim.ts` (the rules, deterministic, every player action), `days.ts` (plazas and waves as data),
  `shift.ts` (budget, comparison, stars), `perks.ts`, `bot.ts` (players at a human pace, for balance, the title backdrop and today's
  targets), `save.ts`, `factors.ts`.
- `web/` the page: `plazaArt.ts` (painted plaza), `stage.ts` (canvas), `rush.ts` (HUD, touches, clock), `coach.ts` (tips), `app.ts`
  (menus, results, save), `audio.ts`, `host.ts`, `dom.ts`, `styles.css`.
- `assets/` Navie's mood pictures, baked small from `frontend/assets/mascot-*.png`.
- `host/storage.ts` the phone's side of the save.

**Build after any edit:** `node scripts/build-clean-air-shift.js` writes `generated/cleanAirShiftHtml.ts`, the only thing the app
loads. `--html out.html` also writes a browser copy; open it with `?fresh=1`. `window.__cas` is the app there:
`__cas.devAutopilot = __cas.devSkills.good`, `__cas.devTimeScale = 3`.

**Tests:** `node scripts/test-clean-air-shift.js`. `--table` prints what each bot does on every shift. After changing traffic or
booth times, read the table and reset `need` in `days.ts`: one star just under the novice bot's cut, two around casual, three just
under good. `balance.test.ts` holds that line (doing nothing always ends in smog; good play always reaches three stars).
Judge pressure by the average line per open booth, not the longest line: one fault during a surge makes a long line for anyone.
