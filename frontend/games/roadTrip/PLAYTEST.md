# Tollbound Heroes - human playtest plan

Everything so far was checked by tests, an autopilot and headless-browser captures. None of that
says whether the game is fun, readable or fair **for people on phones**. This plan covers that gap.

## Goals (what we need to learn)

1. Can a first-time player understand, without help, what the hero, the sidekicks, the horn, the
   signature button, power-ups, checkpoints and the Jam meter do?
2. Is the difficulty right per preset (Story / Relaxed / Standard / Expert)? Which hits feel unfair?
3. Do the three heroes feel different, and does any team feel clearly best or useless?
4. Is the finale readable: which gear to line up with, when the phase changes, when TEAM HONK is ready?
5. Is progression understood and motivating (XP, Gear Cores, evolutions, unlock order)?
6. Does it run smoothly and stay stable on real mid-range phones (Android and iPhone)?

## Participants and devices

- 6-8 players: 3 who rarely play mobile games, 3 regular players, ideally 1-2 who use larger text
  or reduced motion day to day. Classmates are fine; nobody who worked on the game.
- Devices: at least one mid/low Android (2-4 GB RAM), one recent Android, one iPhone; one small
  screen (about 5", 360x640 CSS) and one large. Note OS version, Expo Go version, battery level.
- Run through Expo Go from the dev server (SDK 58). Phones on silent-off so sound can be judged.

## Session (about 30 minutes each, one player at a time)

| Step | Minutes | What the player does | What we watch / record |
| --- | --- | --- | --- |
| 0 | 2 | Fresh account (or Settings -> Reset progress). Open Arcade -> Tollbound Heroes. | Do they find Play? Read the safety line? |
| 1 | 6 | Opening story (they may skip) -> garage -> mission 1 with the tutorial. Think aloud. | Time to first successful steer; do they notice the horn hitting bots; do they read sidekick badges; reaction to the checkpoint (do they understand the road is paused?). |
| 2 | 3 | Results -> garage -> Team screen. "Change something about your team." | Do they understand hero vs sidekick, the stat bars, and that the team is fixed during a run? |
| 3 | 7 | Mission 2 (convoy). | Do they keep Kiko safe; do they use the signature; any "that wasn't fair" moments (note time and what hit). |
| 4 | 7 | Mission 3 (finale) on their chosen preset. | Can they say which gear to line up with? Do they notice the phase banners? Do they press TEAM HONK themselves or wait for the auto-honk? |
| 5 | 3 | Endless Expressway for 2 minutes with a different hero. | Does the second hero feel different? |
| 6 | 2 | Collection screen: "What would you need to evolve Pip?" | Can they read the missing items? |

Then the questions below. If a player gets stuck for more than 60 s, help once and note it.

## Questions afterwards (1-5 scale + one sentence why)

1. I always knew what I was supposed to be doing. 2. When I got hit, I understood why.
3. The sidekicks were useful / I could tell what each one did. 4. The signature button was worth using.
5. The boss fight was clear (which gear, which phase, when to honk). 6. The game felt smooth.
7. I want to evolve a sidekick / unlock the next one. 8. The text was easy to read on my phone.
9. The screens and buttons looked polished and I could tell what each icon meant.
Open: What was confusing? What was the best moment? Anything that felt unfair or annoying
(e.g. repeated lines, too many sounds, things covering the road)?

Arcade skin (29 Oct) - watch for: do they notice the "!" signs at the horizon before the hazard
arrives; do they read the hearts as the hero's dents; does the TEAM HONK cut-in delight or get in
the way; does anyone mistake a bot for traffic or the reverse.

## What to log (one row per player, per mission)

Outcome, dents taken, time, preset, hero + sidekicks, run seed (pause menu shows it), signature uses,
checkpoint picks, and every "unfair" moment with the seed and the time. On Android, turn on
"Profile GPU rendering" (Developer options) for the finale and note whether bars stay under the
green line; on iPhone note any visible stutter. Note battery drop over the session and phone heat.

## Success criteria (to call this version ready)

- 5 of 6 first-time players finish mission 1 on Relaxed or Standard without help.
- Average >= 4 on questions 1, 2 and 5; nobody below 3 on question 2 (fairness).
- Every "unfair hit" report is reproduced from its seed and either fixed or explained by a telegraph
  the player missed (then the telegraph gets clearer).
- No crash, freeze or lost progress on any device; finale visibly smooth on the mid-range Android.

## After the sessions

Group the notes by goal 1-6, replay every reported seed with `node scripts/test-road-trip.js`-style
harness or the browser copy (`?debug=1`, pause menu seed), fix in priority order (fairness >
clarity > balance > polish), and repeat with 3 new players.

## Added 2 Nov: the whole road

Sixteen stops are too many for one 30-minute session. Give each player a save at a different point
(a stop in Bulacan, San Fernando, or the last three), and ask:

- Does the road feel like one journey, or like the same level repeated? At which stop did it start to?
- Does the difficulty rise too fast or too slowly? Note the stop where they first lost.
- Did they notice a new sidekick joining, and did they choose to equip it? Which six do they remember?
- Could they tell what Walis, Ilaw and Tala were doing without being told?
- Did they find the next stop on the map straight away, and did they try the small passed exits?
