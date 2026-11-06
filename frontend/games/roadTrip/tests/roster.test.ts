import { STEP, PRESETS } from '../core/config';
import { MISSIONS } from '../core/missions';
import { missionMood } from '../core/moods';
import { clearReveal, commitRun, buyUpgrade, equipSidekick, selectHero } from '../core/progression';
import { HERO_DEFS, RUN_UPGRADES, SIDEKICK_DEFS, heroStats, sidekickTags, type RunUpgradeId } from '../core/roster';
import { defaultSave, loadSave, serializeSave } from '../core/save';
import { DrivingSim, NO_INPUT, type HazardEntity, type SimOptions } from '../core/sim';
import { KAPE_RUN_CAP, BONUS_BOLTS_CAP, SIGNATURE_CD_FLOOR, RECOVERY_BONUS_CAP, activeSynergies, previewUpgrade, pulseInterval, runMods, signatureCooldown } from '../core/tuning';
import { applyUnlocks, counterValue, earnedCharms, friendshipLevel, heroRule, ruleProgress, sidekickRule } from '../core/unlocks';
import { HEROES, JOURNEY, SIDEKICKS, emptyTally, type HeroId, type MissionId, type RunResult, type SaveData, type SidekickId } from '../core/types';
import { assert, test } from './harness';
import { loadout, playMission, simOptions } from './play';

const run = (over: Partial<RunResult> = {}): RunResult => ({
  runId: 'r1',
  missionId: 'tambubong',
  seed: 1,
  difficulty: 'standard',
  outcome: 'success',
  hero: 'navie',
  sidekicks: ['pip', 'mila'],
  tally: emptyTally(),
  boltsCollected: 0,
  foesDefeated: 0,
  goalsDone: 0,
  distance: 0,
  dents: 0,
  maxDents: 3,
  shieldBlocks: 0,
  repairsUsed: 0,
  kikoEngineLeft: null,
  kikoEngineMax: null,
  teamHonk: false,
  postcardFound: false,
  durationS: 60,
  ...over,
});

const sim = (hero: HeroId, sidekicks: [SidekickId | null, SidekickId | null] = [null, null], missionId: MissionId = 'm1-garage', over: Partial<SimOptions> = {}, evolved: Partial<Record<SidekickId, boolean>> = {}): DrivingSim =>
  new DrivingSim(simOptions(missionId, { skipTutorial: true, loadout: loadout(hero, sidekicks, evolved), ...over }));

const foeAt = (s: DrivingSim, x: number, z: number, hp = 40): HazardEntity => {
  const f: HazardEntity = { id: 9000 + Math.floor(z * 10) + Math.floor((x + 2) * 3), kind: 'drumbot', x, z, halfW: 0.3, len: 0.7, ownSpeed: 0, thrown: 0, spent: false, clearedHero: false, clearedKiko: false, practice: false, knocked: -1, knockDir: 0, laneChange: null, hp, maxHp: hp, hurtT: 99, stun: 0, slowT: 0, marked: 0, counted: false };
  s.state.hazards.push(f);
  return f;
};

/** A road with nothing placed on it, so an ability can be measured alone. */
const clearRoad = (s: DrivingSim): void => {
  s.state.hazards = [];
  s.state.pickups = [];
};

const steps = (s: DrivingSim, n: number, input = NO_INPUT): void => {
  for (let i = 0; i < n; i += 1) {
    s.step(STEP, input);
    s.drainEvents();
  }
};

const useAbility = (s: DrivingSim): void => {
  s.step(STEP, { axis: 0, targetX: null, ability: true });
};

// -- the roster itself -----------------------------------------------------------------------

test('roster: twelve heroes with a real passive, signature, limit, bio and voice', () => {
  assert.equal(HEROES.length, 16);
  for (const id of HEROES) {
    const h = HERO_DEFS[id];
    assert.equal(h.id, id);
    assert.ok(h.passive.length > 0 && h.bio.length > 0 && h.tradeOff.length > 0 && h.signature.name.length > 0, `${id} is described`);
    assert.ok(h.lines.length >= 3, `${id} has lines`);
    assert.ok(h.tags.length > 0, `${id} has tags`);
  }
  assert.equal(new Set(HEROES.map((id) => HERO_DEFS[id].signature.name)).size, 16, 'no two signatures alike');
});

test('roster: sidekicks keep the original twelve and add the file\'s new companions, each its own job', () => {
  assert.equal(SIDEKICKS.length, 33);
  for (const id of ['pip', 'bumbo', 'mila', 'kumpuni', 'bantay', 'silip', 'walis', 'barya', 'sibat', 'tala', 'ilaw', 'maso'] as SidekickId[]) {
    assert.ok(SIDEKICKS.includes(id), `${id} stays`);
  }
  for (const id of SIDEKICKS) {
    const d = SIDEKICK_DEFS[id];
    assert.equal(d.id, id);
    assert.ok(d.evolvedName !== d.name, `${id} evolves into something`);
    assert.ok(sidekickTags(id).length > 0, `${id} has a tag`);
    assert.ok(d.describe(d.base).what.length > 0 && d.describe(d.evolved).limits.length > 0, `${id} explains itself`);
    assert.ok(d.barks.action.length > 0, `${id} has a voice`);
  }
  assert.equal(new Set(SIDEKICKS.map((id) => SIDEKICK_DEFS[id].role)).size, SIDEKICKS.length, 'no two do the same job');
});

test('roster: every hero bar is worked out from the numbers that drive the car', () => {
  for (const id of HEROES) {
    assert.deepEqual(HERO_DEFS[id].stats, heroStats(HERO_DEFS[id]), id);
    for (const value of Object.values(HERO_DEFS[id].stats)) {
      assert.ok(value >= 1 && value <= 5, `${id} bar in range`);
    }
  }
  assert.ok(HERO_DEFS.amihan.stats.steering > HERO_DEFS.berto.stats.steering, 'quicker hands read quicker');
  assert.ok(HERO_DEFS.jepoy.stats.toughness > HERO_DEFS.amihan.stats.toughness, 'an extra dent reads tougher');
});

test('roster: later heroes are sideways, not stronger: nobody beats Navie on everything', () => {
  const navie = HERO_DEFS.navie.stats;
  for (const id of HEROES) {
    if (id === 'navie') {
      continue;
    }
    const s = HERO_DEFS[id].stats;
    const better = s.steering > navie.steering || s.toughness > navie.toughness || s.power > navie.power || s.scouting > navie.scouting;
    const worse = s.steering < navie.steering || s.toughness < navie.toughness || s.power < navie.power || s.scouting < navie.scouting;
    assert.ok(better || worse || HERO_DEFS[id].tradeOff.length > 0, `${id} is a different shape`);
    assert.ok(!(better && !worse) || HERO_DEFS[id].signature.cooldown >= 9, `${id} pays for it`);
  }
});

// -- saves and unlocks -------------------------------------------------------------------------

test('save: a version 2 save keeps every owned character, Bolt and setting, and gains totals', () => {
  const v2 = { ...JSON.parse(serializeSave(defaultSave())), version: 2 } as Record<string, unknown>;
  delete v2.tally;
  delete v2.reveals;
  delete v2.friendship;
  Object.assign(v2, {
    bolts: 777,
    lifetimeBolts: 2000,
    gearCores: 4,
    heroes: ['navie', 'jepoy', 'kiko'],
    sidekicks: { pip: { xp: 90, evolved: false }, mila: { xp: 0, evolved: true }, walis: { xp: 10, evolved: false } },
    loadout: { hero: 'kiko', sidekicks: ['walis', 'mila'] },
    missions: { 'm1-garage': { completed: true, clears: 2, bestScore: 80, bestDents: 0, foundPostcard: true } },
  });
  const { save } = loadSave(JSON.stringify(v2));
  assert.equal(save.version, 4);
  assert.equal(save.bolts, 777);
  assert.equal(save.gearCores, 4);
  assert.ok(['navie', 'jepoy', 'kiko'].every((h) => save.heroes.includes(h as HeroId)));
  assert.equal(save.sidekicks.mila?.evolved, true);
  assert.equal(save.sidekicks.pip?.xp, 90);
  assert.equal(save.loadout.hero, 'kiko');
  assert.deepEqual(save.loadout.sidekicks, ['walis', 'mila']);
  assert.equal(save.tally.coins, 2000, 'totals start from what the save can prove');
  assert.equal(save.tally.bots, 0, 'and what it cannot know starts at zero');
  // Reading it twice changes nothing.
  const again = loadSave(serializeSave(save)).save;
  assert.deepEqual(again.heroes, save.heroes);
  assert.equal(Object.keys(again.sidekicks).length, Object.keys(save.sidekicks).length);
  assert.deepEqual(again.tally, save.tally);
});

test('save: unknown characters are dropped safely; a damaged tally falls back to zero', () => {
  const { save } = loadSave(JSON.stringify({ ...JSON.parse(serializeSave(defaultSave())), heroes: ['navie', 'ghost'], sidekicks: { pip: { xp: 0, evolved: false }, phantom: { xp: 5 } }, tally: { chains: 'many', bots: -5 }, friendship: { navie: 'lots', ghost: 3 } }));
  assert.deepEqual(save.heroes, ['navie']);
  assert.equal((save.sidekicks as Record<string, unknown>).phantom, undefined);
  assert.equal(save.tally.chains, 0);
  assert.equal(save.tally.bots, 0);
  assert.deepEqual(save.friendship, {});
});

test('unlocks: everyone but the starters joins at a level that can be reached, and earning is idempotent', () => {
  const newHeroes = HEROES.filter((id) => heroRule(id) !== null);
  const newSidekicks = SIDEKICKS.filter((id) => sidekickRule(id) !== null);
  assert.equal(newHeroes.length, HEROES.length - 1, 'every hero but Navie');
  assert.equal(newSidekicks.length, SIDEKICKS.length - 2, 'every sidekick but Pip and Mila');
  let save: SaveData = defaultSave();
  for (const [id, rule] of [...newHeroes.map((h) => [h, heroRule(h)!] as const), ...newSidekicks.map((k) => [k, sidekickRule(k)!] as const)]) {
    const progress = ruleProgress(save, rule);
    assert.ok(progress.target >= 1 && progress.target <= JOURNEY.length && progress.text === `Clear Level ${progress.target}`, `${id} says what it needs`);
    assert.equal(progress.done, false, `${id} is not free`);
  }
  // Clear the whole road; everyone arrives once.
  const missions: SaveData['missions'] = {};
  for (const id of JOURNEY) {
    missions[id] = { completed: true, clears: 1, bestScore: 1, bestDents: 0, foundPostcard: false };
  }
  save = { ...save, missions };
  const first = applyUnlocks(save);
  assert.equal(first.heroes.length, newHeroes.length);
  assert.equal(first.sidekicks.length, newSidekicks.length);
  assert.equal(first.save.reveals.length, newHeroes.length + newSidekicks.length);
  const second = applyUnlocks(first.save);
  assert.equal(second.heroes.length, 0, 'nobody arrives twice');
  assert.equal(second.save, first.save, 'the save is untouched the second time');
  assert.equal(new Set(first.save.reveals).size, first.save.reveals.length, 'no reveal queued twice');
});

test('save: upgrading a long-time save welcomes everyone earned, but only a few with a fanfare', () => {
  const v2 = { ...JSON.parse(serializeSave(defaultSave())), version: 2 } as Record<string, unknown>;
  delete v2.tally;
  delete v2.reveals;
  delete v2.friendship;
  const JOURNEY_DONE = Object.fromEntries(['m1-garage', 'm2-convoy', 'm3-finale', 'bocaue-interchange', 'tambubong', 'tabang', 'balagtas', 'sta-rita'].map((id) => [id, { completed: true, clears: 3, bestScore: 80, bestDents: 0, foundPostcard: true }]));
  Object.assign(v2, { lifetimeBolts: 5000, missions: JOURNEY_DONE, records: { checkpoints: 20, cleanStretches: 20 } });
  const { save } = loadSave(JSON.stringify(v2));
  const earned = counterValue(save, 'postcards');
  assert.ok(earned >= 3, 'the postcards were counted');
  assert.ok(save.heroes.includes('nico'), 'three postcards brought Nico');
  assert.ok(save.sidekicks.tarsi !== undefined, 'and Tarsi');
  assert.atMost(save.reveals.length, 3, 'no long chain of pop-ups');
  // A later load adds nothing, and a normal run still reveals as usual.
  assert.deepEqual(loadSave(serializeSave(save)).save.reveals, save.reveals);
});

test('unlocks: a run pays once: replaying the same run id adds nothing, and a reveal plays once', () => {
  const tally = emptyTally();
  tally.cleanStretches = 3;
  tally.coins = 40;
  // Clearing Berto's level, with every level before it done.
  const bertoLevel = HERO_DEFS.berto.unlock.level!;
  const missions: SaveData['missions'] = {};
  for (const id of JOURNEY.slice(0, bertoLevel - 1)) {
    missions[id] = { completed: true, clears: 1, bestScore: 1, bestDents: 0, foundPostcard: false };
  }
  const first = commitRun({ ...defaultSave(), missions }, run({ tally, missionId: JOURNEY[bertoLevel - 1] }));
  assert.ok(first.save.heroes.includes('berto'), `Level ${bertoLevel} brings Berto`);
  assert.ok(first.save.sidekicks.sampy === undefined, 'Sampy waits for a later level');
  assert.ok(first.payout.unlocks.includes('Hero unlocked: Berto'));
  assert.ok(first.save.reveals.includes('hero:berto'));
  const before = first.save.bolts;
  const again = commitRun(first.save, run({ tally }));
  assert.equal(again.duplicate, true);
  assert.equal(again.save.tally.coins, 40, 'not counted twice');
  assert.equal(again.save.bolts, before);
  const seen = clearReveal(first.save, 'hero:berto');
  assert.ok(!seen.reveals.includes('hero:berto'));
  assert.equal(clearReveal(seen, 'hero:berto'), seen, 'clearing again does nothing');
  assert.ok(seen.heroes.includes('berto'), 'seeing the reveal does not take the hero away');
});

test('unlocks: buying in the Workshop counts, and postcards are read from the missions', () => {
  let save: SaveData = { ...defaultSave(), bolts: 500, heroes: ['navie', 'kiko'] };
  assert.equal(counterValue(save, 'workshop'), 0);
  save = buyUpgrade(save, 'steering').save;
  save = buyUpgrade(save, 'bumper').save;
  assert.equal(counterValue(save, 'workshop'), 2, 'both tasks counted');
  assert.ok(!save.heroes.includes('sinta') && save.sidekicks.gearo === undefined, 'nobody joins for shopping: characters come with levels');
  assert.equal(counterValue({ ...save, missions: { mexico: { completed: true, clears: 1, bestScore: 0, bestDents: 0, foundPostcard: true } } }, 'arayatPostcards'), 1);
});

test('team: choosing needs the character to be owned; a locked one changes nothing', () => {
  const save = defaultSave();
  assert.equal(selectHero(save, 'kidlat'), save);
  assert.equal(equipSidekick(save, 0, 'kape'), save);
  const owned = { ...save, heroes: [...save.heroes, 'kidlat' as HeroId] };
  assert.equal(selectHero(owned, 'kidlat').loadout.hero, 'kidlat');
});

test('friendship: cosmetic levels only, from runs driven together', () => {
  assert.equal(friendshipLevel(0).level, 0);
  assert.equal(friendshipLevel(3).level, 1);
  assert.equal(friendshipLevel(30).next, null);
  const out = commitRun(defaultSave(), run());
  assert.equal(out.save.friendship.navie, 1);
  assert.equal(out.save.friendship.pip, 1);
  assert.deepEqual(earnedCharms(defaultSave()), []);
  const again = commitRun(out.save, run({ runId: 'r2' }));
  assert.equal(again.save.friendship.pip, 2);
});

// -- upgrade mathematics ---------------------------------------------------------------------------

test('upgrades: +30% pulse rate multiplies the rate by 1.30', () => {
  const m = runMods(['overclock']);
  const before = 1 / pulseInterval(HERO_DEFS.navie, runMods([]));
  const after = 1 / pulseInterval(HERO_DEFS.navie, m);
  assert.ok(Math.abs(after / before - 1.3) < 1e-9, `rate went ${before} -> ${after}`);
  assert.ok(Math.abs(m.steering - 0.92) < 1e-9, 'and costs what the card says');
});

test('upgrades: Squad Drill is 25% more often, and an 18 s signature becomes 22.5 s', () => {
  const m = runMods(['squadDrill']);
  assert.equal(m.sidekickRate, 1.25);
  assert.equal(signatureCooldown(18, m), 22.5);
  const s = sim('navie');
  clearRoad(s);
  (s as unknown as { applyRunUpgrade(id: RunUpgradeId): void }).applyRunUpgrade('squadDrill');
  const base = s.state.player.cooldownMax;
  useAbility(s);
  assert.ok(Math.abs(s.state.player.cooldown - base * 1.25) < 0.02, `recharge ${s.state.player.cooldown} from base ${base}`);
});

test('upgrades: what the card previews is what the road does, for every upgrade and hero', () => {
  for (const hero of HEROES) {
    for (const id of Object.keys(RUN_UPGRADES) as RunUpgradeId[]) {
      const rows = previewUpgrade(id, hero, [], 18);
      assert.ok(rows.length >= 1, `${id} previews something for ${hero}`);
      assert.ok(rows.some((r) => r.kind === 'gain') && rows.some((r) => r.kind === 'cost'), `${id} shows a gain and a cost`);
    }
  }
  const rows = previewUpgrade('squadDrill', 'navie', [], 18);
  assert.equal(rows.find((r) => r.label === 'Signature recharge')?.to, '22.5 s');
  const wide = previewUpgrade('wideHorn', 'navie', [], 18);
  assert.equal(wide.find((r) => r.label === 'Pulse damage')?.to, '0.75');
  const clock = previewUpgrade('overclock', 'navie', [], 18);
  assert.equal(clock.find((r) => r.label === 'Pulses per second')?.to, (1.3 / HERO_DEFS.navie.pulse.every).toFixed(1));
});

test('upgrades: multipliers stack in any order to the same result, and the floors hold', () => {
  const a = runMods(['overclock', 'sturdy', 'wideHorn', 'lookout']);
  const b = runMods(['lookout', 'wideHorn', 'sturdy', 'overclock']);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.steering - 0.92 * 0.9) < 1e-9);
  assert.ok(Math.abs(a.pulseDamage - 0.75 * 0.85) < 1e-9);
  assert.ok(pulseInterval({ pulse: { every: 0.1, damage: 1, pattern: 'single' } }, runMods(['overclock'])) >= 0.12, 'pulse floor');
  assert.ok(signatureCooldown(30, { ...runMods([]), signatureCooldown: 0.01 }) >= SIGNATURE_CD_FLOOR, 'signature floor');
  assert.deepEqual(runMods(['overclock', 'overclock']), runMods(['overclock']), 'each upgrade counts once');
});

test('checkpoint: picking twice cannot apply an upgrade twice, and the road stays frozen', () => {
  const s = sim('navie', [null, null], 'tambubong');
  (s as unknown as { openChoice(): void }).openChoice();
  const choice = s.state.choice!;
  const pick = choice.options[0];
  const d = s.state.distance;
  const t = s.state.time;
  steps(s, 120);
  assert.equal(s.state.distance, d, 'frozen while choosing');
  assert.equal(s.state.time, t, 'timers frozen too');
  s.choose(pick);
  s.choose(pick);
  assert.equal(s.state.runUpgrades.filter((u) => u === pick).length, 1);
  (s as unknown as { applyRunUpgrade(id: RunUpgradeId): void }).applyRunUpgrade(pick);
  assert.equal(s.state.runUpgrades.filter((u) => u === pick).length, 1, 'never a duplicate');
});

test('Duwi: reshuffles a checkpoint once, the new offer sticks, and it cannot be spent again', () => {
  const s = sim('navie', ['duwi', null], 'tambubong');
  (s as unknown as { openChoice(): void }).openChoice();
  assert.equal(s.state.rerollsLeft, 1);
  const before = [...s.state.choice!.options];
  assert.equal(s.reroll(), true);
  const after = [...s.state.choice!.options];
  assert.ok(JSON.stringify(after) !== JSON.stringify(before), 'the offer changed');
  assert.equal(s.state.rerollsLeft, 0);
  assert.equal(s.reroll(), false);
  assert.deepEqual(s.state.choice!.options, after, 'the refused reroll changed nothing');
  const without = sim('navie', [null, null], 'tambubong');
  (without as unknown as { openChoice(): void }).openChoice();
  assert.equal(without.reroll(), false, 'no Duwi, no reroll');
});

// -- heroes on the road ---------------------------------------------------------------------------------

test('hero: Star Sweep reaches every lane; traffic is never a target', () => {
  const s = sim('hiraya');
  clearRoad(s);
  const left = foeAt(s, -1, 18);
  const right = foeAt(s, 1, 22);
  const car: HazardEntity = { ...foeAt(s, 0, 20), kind: 'car', hp: 0, maxHp: 0, id: 77 };
  s.state.hazards[s.state.hazards.length - 1] = car;
  const hp = left.hp;
  useAbility(s);
  assert.ok(left.hp < hp && right.hp < hp, 'both lanes hit');
  assert.equal(car.spent, false, 'the car is not touched');
});

test('hero: Capacitor needs charge, spends it all, and only base pulses fill it', () => {
  const s = sim('kidlat');
  clearRoad(s);
  assert.equal(s.abilityReady(), false, 'nothing stored');
  useAbility(s);
  assert.equal(s.state.player.cooldown, 0, 'a refused release costs nothing');
  s.state.charge = 8;
  const inLane = foeAt(s, 0, 20);
  const other = foeAt(s, 1, 20);
  const hp = inLane.hp;
  useAbility(s);
  assert.ok(hp - inLane.hp >= 4, 'hits hard');
  assert.equal(other.hp, hp, 'one lane only');
  assert.equal(s.state.charge, 0);
  // A generated pulse lands: nothing stored.
  const k = sim('kidlat', ['bitu', null]);
  clearRoad(k);
  k.state.hazards.length = 0;
  (k as unknown as { addPulse(p: object): void }).addPulse({ x: 0, z: 1, damage: 1, from: 'bitu', tx: 0 });
  foeAt(k, 0, 3);
  for (let i = 0; i < 20; i += 1) {
    (k as unknown as { movePulses(dt: number): void }).movePulses(STEP);
  }
  assert.equal(k.state.charge, 0, 'beads store nothing');
});

test('hero: Echo Trick repeats a pulse once; echoes make no echoes and advance no counter', () => {
  const s = sim('tiko', ['bitu', null]);
  clearRoad(s);
  s.state.echo = 6;
  const internal = s as unknown as { firePulses(dt: number): void; beadCount: number; echoes: unknown[]; updateRoad(dt: number, t: number): void; pulseT: number };
  internal.pulseT = 0;
  internal.firePulses(STEP);
  assert.equal(s.state.pulses.filter((p) => p.base).length, 1);
  assert.equal(internal.echoes.length, 1, 'one echo queued');
  assert.equal(internal.beadCount, 1, 'counted once');
  for (let i = 0; i < 12; i += 1) {
    internal.updateRoad(STEP, 0);
  }
  assert.equal(internal.echoes.length, 0);
  assert.equal(s.state.pulses.filter((p) => !p.base && p.from === 'hero').length, 1, 'one echo fired');
  assert.equal(internal.beadCount, 1, 'the echo did not advance Bitu');
  assert.ok(s.state.pulses.find((p) => !p.base)!.damage < s.state.pulses.find((p) => p.base)!.damage, 'and it is weaker');
});

test('hero: Rally Beat readies the sidekicks, strengthens one assist, and respects the cap', () => {
  const s = sim('ligaya', ['maso', null]);
  clearRoad(s);
  s.state.rhythm = 3;
  s.state.sidekicks[0].cooldown = 4;
  useAbility(s);
  assert.equal(s.state.rhythm, 0, 'spends the meter');
  assert.ok(s.state.sidekicks[0].cooldown <= 0.25, 'ready at once');
  const foe = foeAt(s, 0, 15);
  const hp = foe.hp;
  steps(s, 30);
  const first = hp - foe.hp;
  assert.ok(Math.abs(first - SIDEKICK_DEFS.maso.base.power * 1.75) < 0.5 || first >= SIDEKICK_DEFS.maso.base.power * 1.7, `boosted swing was ${first}`);
  const again = foe.hp;
  s.state.sidekicks[0].cooldown = 0;
  steps(s, 5);
  assert.ok(again - foe.hp <= SIDEKICK_DEFS.maso.base.power + 2.5, 'the next one is ordinary');
});

test('hero: dropping a chain loses a beat, never health', () => {
  const s = sim('ligaya');
  clearRoad(s);
  s.state.rhythm = 2;
  s.state.chain.count = 3;
  const dents = s.state.player.dents;
  s.state.chain.t = 5;
  steps(s, 2);
  assert.equal(s.state.rhythm, 1);
  assert.equal(s.state.chain.count, 0);
  assert.equal(s.state.player.dents, dents);
});

test('hero: Roadside Repair fixes one dent at the next checkpoint, once a run', () => {
  const s = sim('sinta', [null, null], 'tambubong');
  clearRoad(s);
  s.state.player.dents = 2;
  useAbility(s);
  assert.equal(s.state.repairBooked, true);
  assert.equal(s.state.player.dents, 2, 'not yet');
  const open = s as unknown as { reachedCheckpoint(): void };
  open.reachedCheckpoint();
  assert.equal(s.state.player.dents, 1, 'fixed at the stop');
  assert.equal(s.state.repairSpent, true);
  s.state.player.cooldown = 0;
  s.state.player.signature = 0;
  useAbility(s);
  assert.equal(s.state.repairBooked, false, 'cannot book again');
  open.reachedCheckpoint();
  assert.equal(s.state.player.dents, 1, 'no second repair');
});

test('hero: Load Brace rolls over a cone, but a car still dents', () => {
  const s = sim('berto');
  clearRoad(s);
  s.state.brace = 2;
  const make = (kind: 'cone' | 'car', z: number): HazardEntity => {
    const h = foeAt(s, 0, z, 0);
    h.kind = kind;
    h.maxHp = 0;
    h.hp = 0;
    return h;
  };
  const cone = make('cone', 0.2);
  steps(s, 2);
  assert.equal(s.state.player.dents, 0);
  assert.equal(cone.spent, true);
  s.state.player.invulnerable = 0;
  make('car', 0.2);
  steps(s, 2);
  assert.equal(s.state.player.dents, 1);
});

test('hero: Windstep steers quicker but grants no immunity; gusts are reduced, not removed', () => {
  const s = sim('amihan', [null, null], 'tabang');
  clearRoad(s);
  const internal = s as unknown as { steerNow(): number; gustFactor(h: HeroId): number };
  const plain = internal.steerNow();
  const gust = internal.gustFactor('amihan');
  assert.ok(gust < 1 && gust > 0);
  useAbility(s);
  assert.ok(Math.abs(internal.steerNow() / plain - 1.25) < 1e-6);
  assert.ok(internal.gustFactor('amihan') >= 0.2 - 1e-9, 'never fully gone');
  const f = foeAt(s, s.state.player.x, 0.1, 5);
  f.kind = 'drumbot';
  steps(s, 2);
  assert.equal(s.state.player.dents, 1, 'still hit');
});

test('hero: Foam Break slows bots and leaves traffic alone', () => {
  const s = sim('alon');
  clearRoad(s);
  const bot = foeAt(s, 1, 30);
  const car = foeAt(s, -1, 30, 0);
  car.kind = 'car';
  car.maxHp = 0;
  useAbility(s);
  assert.ok(bot.slowT > 0);
  assert.equal(car.slowT, 0);
  const z0 = bot.z;
  const c0 = car.z;
  steps(s, 30);
  assert.ok(z0 - bot.z < c0 - car.z, 'the bot has come less far than the car');
});

test('hero: Case Finder reveals what is already there; it adds no Bolts', () => {
  const s = sim('nico', [null, null], 'tambubong');
  clearRoad(s);
  s.state.pickups.push({ id: 900, kind: 'bolt', power: null, x: 0, z: 50, collected: false, collectedT: -1, hidden: true, revealed: false, passed: false });
  const count = s.state.pickups.length;
  useAbility(s);
  assert.equal(s.state.pickups.length, count);
  assert.equal(s.state.pickups[0].revealed, true);
  assert.equal(s.state.boltsCollected, 0);
  assert.ok(s.hiddenShowZ() > sim('navie').hiddenShowZ(), 'and sees further anyway');
});

// -- sidekicks -----------------------------------------------------------------------------------------------

const chainOf = (s: DrivingSim, n: number): void => {
  for (let i = 0; i < n; i += 1) {
    (s as unknown as { chainBolt(): void }).chainBolt();
  }
};

test('sidekick: Kape takes time off the signature per chain, up to its run cap', () => {
  const s = sim('navie', ['kape', null]);
  clearRoad(s);
  s.state.player.cooldown = 100;
  for (let i = 0; i < 40; i += 1) {
    s.state.sidekicks[0].cooldown = 0;
    chainOf(s, 5);
  }
  assert.ok(100 - s.state.player.cooldown <= KAPE_RUN_CAP + 1e-9, `took ${100 - s.state.player.cooldown}`);
  assert.ok(100 - s.state.player.cooldown >= KAPE_RUN_CAP - 0.01, 'and reached it');
});

test('sidekick: Piko pays every third chain, capped, and counters do not count it', () => {
  const s = sim('navie', ['piko', null]);
  clearRoad(s);
  chainOf(s, 5 * 2);
  assert.equal(s.state.boltsCollected, 0);
  chainOf(s, 5);
  assert.equal(s.state.boltsCollected, SIDEKICK_DEFS.piko.base.power);
  chainOf(s, 5 * 60);
  assert.ok(s.state.boltsCollected <= BONUS_BOLTS_CAP);
  assert.equal(s.state.tally.coins, 0, 'no progression counter moved');
});

test('sidekick: Bibing sends you off with a small shield that never adds up', () => {
  const s = sim('navie', ['bibing', null], 'tambubong');
  (s as unknown as { openChoice(): void }).openChoice();
  s.choose(null);
  assert.equal(s.state.player.shield, SIDEKICK_DEFS.bibing.base.power);
  const again = sim('navie', ['bibing', null], 'tambubong');
  again.state.player.shield = 5;
  (again as unknown as { openChoice(): void }).openChoice();
  again.choose(null);
  assert.equal(again.state.player.shield, 5, 'the longer one counts');
});

test('sidekick: Kawayan lengthens a shield but never makes one; everything stays capped', () => {
  const s = sim('jepoy', ['kawayan', null]);
  clearRoad(s);
  steps(s, 60);
  assert.equal(s.state.player.shield, 0, 'no shield of its own');
  useAbility(s);
  assert.ok(s.state.player.shield > HERO_DEFS.jepoy.signature.seconds, 'longer');
  assert.ok(s.state.player.shield <= 6, 'capped');
  assert.equal(activeSynergies('jepoy', ['kawayan', null]).length, 1);
});

test('sidekick: Gearo mends a shield up to its length and never makes one', () => {
  const s = sim('jepoy', ['gearo', null]);
  clearRoad(s);
  steps(s, 300);
  assert.equal(s.state.player.shield, 0);
  useAbility(s);
  const full = s.state.player.shieldMax;
  s.state.player.shield = full - 2;
  s.state.sidekicks[0].cooldown = 0;
  steps(s, 2);
  assert.ok(s.state.player.shield > full - 2 + 0.5);
  s.state.player.shield = full - 0.1;
  s.state.sidekicks[0].cooldown = 0;
  steps(s, 2);
  assert.ok(s.state.player.shield <= full);
});

test('sidekick: Sampy lengthens the safe moment after a hit; the hit still lands', () => {
  const plain = sim('navie');
  const helped = sim('navie', ['sampy', null]);
  for (const s of [plain, helped]) {
    clearRoad(s);
    foeAt(s, 0, 0.1, 5);
    s.step(STEP, NO_INPUT);
  }
  assert.equal(helped.state.player.dents, 1);
  const extra = helped.state.player.invulnerable - plain.state.player.invulnerable;
  assert.ok(extra > 0.3 && extra <= RECOVERY_BONUS_CAP + 0.01, `extra ${extra}`);
});

test('sidekick: Bantay buffers once, on the last dent, and never heals', () => {
  const s = sim('navie', ['bantay', null], 'm1-garage', { settings: { difficulty: 'standard', gameSpeed: 1, warningBoost: 0, autoAbility: false } });
  clearRoad(s);
  s.state.sidekicks[0].charged = false;
  s.state.sidekicks[0].cooldown = 999;
  const max = s.state.player.maxDents!;
  s.state.player.dents = max - 2;
  foeAt(s, 0, 0.1, 5);
  s.step(STEP, NO_INPUT);
  assert.equal(s.state.player.dents, max - 1);
  assert.ok(s.state.player.invulnerable > PRESETS.standard.invulnerable, 'buffered');
  assert.equal((s as unknown as { bufferUsed: boolean }).bufferUsed, true, 'spent');
});

test('sidekick: Saranggola retrieves one missed plain Bolt, and never a postcard', () => {
  const s = sim('navie', ['saranggola', null]);
  clearRoad(s);
  s.state.sidekicks[0].cooldown = 0;
  s.state.pickups.push({ id: 901, kind: 'postcard', power: null, x: 1, z: -1, collected: false, collectedT: -1, hidden: false, revealed: false, passed: false });
  s.state.player.x = -1;
  steps(s, 30);
  assert.equal(s.state.missedBolts, 0, 'a postcard is not a missed Bolt');
  assert.equal(s.state.boltsCollected, 0);
  s.state.missedBolts = 2;
  s.state.sidekicks[0].cooldown = 0;
  steps(s, 2);
  assert.equal(s.state.boltsCollected, 1, 'just one');
  assert.equal(s.state.missedBolts, 1);
  assert.ok(s.state.sidekicks[0].cooldown > 10, 'then rests');
});

test('sidekick: Sago and Kalaw never touch traffic speed; Parolito only shows, never collects', () => {
  const s = sim('navie', ['sago', 'parolito']);
  clearRoad(s);
  const car = foeAt(s, 1, 20, 0);
  car.kind = 'car';
  car.maxHp = 0;
  s.state.sidekicks[0].cooldown = 0;
  steps(s, 5);
  assert.equal(car.slowT, 0, 'the car is left alone');
  const bot = foeAt(s, 0, 25);
  s.state.sidekicks[0].cooldown = 0;
  steps(s, 5);
  assert.ok(bot.slowT > 0, 'the bot is not');
  s.state.pickups.push({ id: 902, kind: 'bolt', power: null, x: 1, z: 40, collected: false, collectedT: -1, hidden: true, revealed: false, passed: false });
  s.state.sidekicks[1].cooldown = 0;
  const bolts = s.state.boltsCollected;
  steps(s, 3);
  assert.equal(s.state.pickups.find((p) => p.id === 902)?.revealed, true);
  assert.equal(s.state.boltsCollected, bolts);
  const k = sim('navie', ['kalaw', null]);
  clearRoad(k);
  const c2 = foeAt(k, 1, 30, 0);
  c2.kind = 'car';
  c2.maxHp = 0;
  c2.ownSpeed = 0.4;
  k.state.sidekicks[0].cooldown = 0;
  steps(k, 3);
  assert.ok(c2.marked > 0, 'Kalaw marks it');
  assert.equal(c2.ownSpeed, 0.4, 'and leaves it be');
});

test('sidekick: Bitu throws one bead every fifth pulse, or every fourth with Kidlat', () => {
  const count = (hero: HeroId): number => {
    const s = sim(hero, ['bitu', null]);
    clearRoad(s);
    const internal = s as unknown as { firePulses(dt: number): void; pulseT: number };
    let at = 0;
    for (let i = 1; i <= 20 && at === 0; i += 1) {
      internal.pulseT = 0;
      internal.firePulses(STEP);
      if (s.state.pulses.some((p) => p.from === 'bitu')) {
        at = i;
      }
    }
    return at;
  };
  assert.equal(count('navie'), 5);
  assert.equal(count('kidlat'), 4);
});

test('sidekick: Ulap shortens weather; a gust still pushes; Silaw needs a dim stretch to matter', () => {
  const windows = (sidekicks: [SidekickId | null, SidekickId | null]): number => {
    const s = sim('navie', sidekicks, 'tabang');
    clearRoad(s);
    s.state.weather.t = 0.01;
    steps(s, 2);
    s.state.weather.t = 0;
    steps(s, 1);
    return s.state.weather.phase === 'active' ? s.state.weather.t : -1;
  };
  assert.ok(windows(['ulap', null]) < windows([null, null]), 'a shorter gust');
  assert.ok(missionMood('pulilan').dim && !missionMood('tambubong').dim);
});

// -- the road's new systems --------------------------------------------------------------------------------------

test('road: five Bolts in a row make a chain; a hit breaks it', () => {
  const s = sim('navie');
  clearRoad(s);
  chainOf(s, 4);
  assert.equal(s.state.chain.total, 0);
  chainOf(s, 1);
  assert.equal(s.state.chain.total, 1);
  assert.equal(s.state.tally.chains, 1);
  chainOf(s, 3);
  foeAt(s, 0, 0.1, 5);
  s.step(STEP, NO_INPUT);
  assert.equal(s.state.chain.count, 0);
});

test('road: gust and rain only happen where the stretch says, and a warning always comes first', () => {
  const calm = sim('navie', [null, null], 'tambubong');
  assert.equal(calm.state.weather.kind, 'none');
  const s = sim('navie', [null, null], 'tabang');
  assert.equal(s.state.weather.kind, 'gust');
  let sawWarn = false;
  let order = 'ok';
  for (let i = 0; i < 60 * 80 && s.state.outcome === null; i += 1) {
    s.state.hazards = [];
    s.step(STEP, NO_INPUT);
    for (const e of s.drainEvents()) {
      if (e.type === 'weather' && e.phase === 'warn') {
        sawWarn = true;
      }
      if (e.type === 'weather' && e.phase === 'active' && !sawWarn) {
        order = 'active before warn';
      }
    }
    if (s.state.choice !== null) {
      s.choose(null);
    }
  }
  assert.equal(order, 'ok');
  assert.ok(sawWarn, 'the wind came and was announced');
});

test('road: rough patches ease steering and speed, and Berto feels them less', () => {
  const internal = (h: HeroId): { s: DrivingSim; steer: () => number } => {
    const s = sim(h, [null, null], 'tambubong');
    clearRoad(s);
    return { s, steer: () => (s as unknown as { steerNow(): number }).steerNow() };
  };
  const a = internal('navie');
  const plain = a.steer();
  a.s.state.onRough = true;
  assert.ok(a.steer() < plain);
  const b = internal('berto');
  const bPlain = b.steer();
  b.s.state.onRough = true;
  assert.ok(b.steer() / bPlain > a.steer() / plain, 'half the penalty');
});

test('road: a stash is hidden until close, then an ordinary pick-up', () => {
  const s = sim('navie', [null, null], 'tambubong');
  clearRoad(s);
  let found = false;
  for (let i = 0; i < 60 * 70 && !found && s.state.outcome === null; i += 1) {
    s.state.hazards = [];
    s.step(STEP, NO_INPUT);
    s.drainEvents();
    if (s.state.choice !== null) {
      s.choose(null);
    }
    found = s.state.pickups.some((p) => p.hidden);
  }
  assert.ok(found, 'a stash appeared');
  const stash = s.state.pickups.filter((p) => p.hidden);
  assert.equal(stash.length, 3);
  assert.ok(stash[0].z > s.hiddenShowZ(), 'it starts out of sight');
});

test('determinism: the same seed and inputs give the same run, weather included', () => {
  const trace = (): string => {
    const s = sim('amihan', ['ulap', 'sago'], 'sctex', { seed: 41 });
    for (let i = 0; i < 60 * 40 && s.state.outcome === null; i += 1) {
      s.step(STEP, { axis: 0, targetX: Math.sin(i / 40), ability: i % 600 === 0 });
      s.drainEvents();
      if (s.state.choice !== null) {
        s.choose(s.state.choice.options[0] ?? null);
      }
    }
    const st = s.state;
    return JSON.stringify([st.distance, st.player.x, st.player.dents, st.boltsCollected, st.weather, st.rough.length, st.tally]);
  };
  assert.equal(trace(), trace());
});

// -- every team reaches the end of the road -----------------------------------------------------------------------

test('play: every hero finishes a stretch and a boss on the autopilot', () => {
  for (const hero of HEROES) {
    const drive = playMission('bocaue-interchange', { difficulty: 'standard', seed: 11, loadout: loadout(hero, ['pip', 'mila'], {}), skipTutorial: true, bot: { useAbility: true } });
    assert.equal(drive.sim.state.outcome, 'success', `${hero} on the road: ${drive.sim.state.player.dents} dents`);
  }
  for (const hero of ['berto', 'kidlat', 'tiko', 'amihan'] as HeroId[]) {
    const boss = playMission('m3-finale', { difficulty: 'relaxed', seed: 5, loadout: loadout(hero, ['pip', 'mila'], {}), skipTutorial: true, bot: { useAbility: true } });
    assert.equal(boss.sim.state.outcome, 'success', `${hero} at the machine`);
  }
});

test('play: every new sidekick drives a whole stretch without breaking anything', () => {
  const list = SIDEKICKS.filter((id) => sidekickRule(id) !== null);
  for (let i = 0; i < list.length; i += 2) {
    const team: [SidekickId, SidekickId | null] = [list[i], list[i + 1] ?? null];
    const out = playMission('balagtas', { difficulty: 'standard', seed: 21 + i, loadout: loadout('navie', team, {}), skipTutorial: true, bot: { useAbility: true } });
    assert.equal(out.sim.state.outcome, 'success', `${team.join('+')}`);
  }
});

test('play: weather and rough road stay fair: a careful bot gets through every kind of stretch', () => {
  for (const id of ['tabang', 'sta-rita', 'san-simon', 'dau', 'sctex'] as MissionId[]) {
    assert.ok(MISSIONS[id] !== undefined);
    const out = playMission(id, { difficulty: 'standard', seed: 3, skipTutorial: true, bot: { useAbility: true } });
    assert.equal(out.sim.state.outcome, 'success', `${id}: ${out.sim.state.player.dents} dents`);
  }
});
