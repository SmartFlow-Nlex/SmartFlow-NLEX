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

## Added 3 Nov: the clay pass

Give each player a save with about half the roster unlocked, plus one reveal waiting. Ask:

- Before anyone explains it: what do the two tiles at the bottom left do? Do they try to tap them?
- Can they tell a sidekick that is ready from one that is recharging, without colour? (Try once in greyscale.)
- At a glance, what is the road telling them: which lane, what is coming, how far to go? Did the scenery ever hide a
  hazard? Run this once in `lantern` and once in `rain`.
- In Team, do they press a tile expecting it to equip? Do they find the one action in the footer?
- At a checkpoint, can they say what they gain and lose before tapping? Did they ever take "Continue without upgrade"?
- Which hero and which sidekick do they want next, and why? Do the goals on locked tiles make sense?
- Heavy against nimble: can they feel the difference between Berto and Amihan with their eyes closed to the labels?

On the same phone, also note: time to first frame, whether it stays smooth in the busiest stops (m3 finale, Sta. Rita in
rain), whether the phone gets warm after ten minutes, and whether the faces load blank at any point.

## Added 4 Nov: character polish

- Without being told, what is on Navie's roof, seen from behind while driving? Do they say "cap"?
- Does steering feel smoother, or does the car seem to snap between angles?
- Can they tell Bumbo from Mila at a glance on the road? Did either sidekick ever hide a hazard?
- Did they notice a sidekick's small effect when its ability fired? Did it distract them?
- In Team, can they see at once which tile is selected, and that it differs from the one already driving?

## Added 4 Nov: sculpted fronts

- Open Garage and Team: what one word would they use for the characters' faces? Does anyone say "cute"? Does anyone say "stuck on"?
- Is any face hard to read at phone size? Watch for Ilaw, Silip, Sibat and Kalaw, which were reshaped most.
- Tap through a few heroes in Team: does the swing feel like a turn, or a jump between pictures?
- Do the characters feel alive at rest, with the blink and glances? Does anything about it look twitchy?
- Do they recognise a character from behind on the road as the one they picked from the front?

## Added 5 Nov: the collection

- Open Team: what one word would they use for the characters now? Do they say "cute"? Does anything still look plastic?
- Which character do they most want to unlock, and why? Which do they not care about?
- Are any of the 49 faces hard to tell apart, or hard to read at phone size?
- Do they notice the different personalities when tapping through heroes (Ligaya dancing, Berto rocking, Ningning's stars)?
- Is a locked character's goal clear from the tile and panel? Does the goal feel reachable, or like grinding?
- Would they spend 350 Bolts on Kislap, or save for upgrades? Does Bolt pricing feel fair?
- Do the new abilities feel useful and different? Is Ningning too strong? Is Tali worth choosing?
- On a real phone: is driving as smooth as before?

## Added 5 Nov: softer, rounder

- Open Team: do they say "cute" unprompted? Does anything still read as a car with a face?
- Would they want to collect them all? Which one first?
- Do Bumbo's propeller and the little idle wiggles feel charming, or busy?
- From behind on the road, can they still tell which lane the car fills? Do hits feel fair for the shape they see?

## Added 5 Nov: the approved look

- Put the Team screen next to the approved picture: what still looks different, and does it matter?
- Does Navie's mouth look attached while talking, and during a worried or determined line?
- From behind on the road, does Navie still read as Navie? Do hits feel fair for the shape they see?

## Added 5 Nov: sidekicks and traps

- Do they ever see a sidekick go through something? What was it?
- Do the jumps look natural at speed, or too busy on a stretch full of cones?
- Do the sidesteps ever look like the sidekick is about to hit the hero?

## Added 6 Nov: a hundred levels

- Does a level feel like a level, or like one long road cut up? Is any level too short or too long?
- Is there a stretch where nobody new joins for too long?
- Does the broken road read as broken asphalt at speed? Does it look flat, or like a bump?
- Is the difficulty rise between bosses smooth, or does a generated level ever feel harder than the boss after it?
