import { STEP } from '../core/config';
import { commitRun, equipSidekick, selectHero } from '../core/progression';
import { JOURNEY } from '../core/levels';
import { HERO_DEFS, MAGNET_CAP, PROTECTION_CAP_S, SIDEKICK_DEFS, WARNING_TEAM_CAP } from '../core/roster';
import { defaultSave, loadSave, serializeSave } from '../core/save';
import { DrivingSim, NO_INPUT, type HazardEntity, type SimOptions } from '../core/sim';
import { applyUnlocks, counterValue, heroRule, ruleProgress, sidekickRule } from '../core/unlocks';
import { HEROES, SIDEKICKS, emptyTally, type HeroId, type RunResult, type SaveData, type SidekickId } from '../core/types';
import { assert, test } from './harness';
import { loadout, playMission, simOptions } from './play';

/**
 * The four heroes and six sidekicks who joined the collection: that each really does
 * what it says through the game's own mechanics, and that earning them is real.
 */

const NEW_HEROES: HeroId[] = ['ningning', 'simoy', 'sikat', 'tali'];
const NEW_SIDEKICKS: SidekickId[] = ['kono', 'kislap', 'dahon', 'radyo', 'ginto', 'hamog'];

const sim = (hero: HeroId, sidekicks: [SidekickId | null, SidekickId | null] = [null, null], over: Partial<SimOptions> = {}, evolved: Partial<Record<SidekickId, boolean>> = {}): DrivingSim => {
  const s = new DrivingSim(simOptions('m1-garage', { skipTutorial: true, loadout: loadout(hero, sidekicks, evolved), ...over }));
  s.state.hazards = [];
  s.state.pickups = [];
  return s;
};

const foeAt = (s: DrivingSim, x: number, z: number, hp = 40): HazardEntity => {
  const f: HazardEntity = { id: 9000 + Math.floor(z * 10) + Math.floor((x + 2) * 3), kind: 'drumbot', x, z, halfW: 0.3, len: 0.7, ownSpeed: 0, thrown: 0, spent: false, clearedHero: false, clearedKiko: false, practice: false, knocked: -1, knockDir: 0, laneChange: null, hp, maxHp: hp, hurtT: 99, stun: 0, slowT: 0, marked: 0, counted: false };
  s.state.hazards.push(f);
  return f;
};

const steps = (s: DrivingSim, n: number): void => {
  for (let i = 0; i < n; i += 1) {
    s.state.hazards = s.state.hazards.filter((h) => h.id >= 9000);
    s.state.pickups = s.state.pickups.filter((p) => p.id >= 900);
    s.step(STEP, NO_INPUT);
    s.drainEvents();
  }
};

const useAbility = (s: DrivingSim): void => {
  s.step(STEP, { axis: 0, targetX: null, ability: true });
  s.drainEvents();
};

const pickup = (s: DrivingSim, id: number, kind: 'bolt' | 'wrench', x: number, z: number): { x: number } => {
  const item = { id, kind, power: null, x, z, collected: false, collectedT: -1, hidden: false, revealed: false };
  s.state.pickups.push(item as never);
  return item;
};

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

// -- who is here -------------------------------------------------------------------------------------

test('collection: the new ones joined and nobody left: every old id is still here', () => {
  for (const id of ['navie', 'jepoy', 'kiko', 'berto', 'ligaya', 'hiraya', 'sinta', 'amihan', 'kidlat', 'nico', 'alon', 'tiko', ...NEW_HEROES] as HeroId[]) {
    assert.ok(HEROES.includes(id), `${id} is a hero`);
  }
  for (const id of ['pip', 'bumbo', 'mila', 'kumpuni', 'bantay', 'silip', 'walis', 'barya', 'sibat', 'tala', 'ilaw', 'maso', 'parolito', 'bibing', 'kape', 'sago', 'sampy', 'kawayan', 'kalaw', 'tarsi', 'piko', 'saranggola', 'duwi', 'silaw', 'bitu', 'gearo', 'ulap', ...NEW_SIDEKICKS] as SidekickId[]) {
    assert.ok(SIDEKICKS.includes(id), `${id} is a sidekick`);
  }
  assert.equal(HEROES.length, 16);
  assert.equal(SIDEKICKS.length, 33);
});

test('collection: no two characters of any kind share a name', () => {
  const names = [...HEROES.map((id) => HERO_DEFS[id].name), ...SIDEKICKS.map((id) => SIDEKICK_DEFS[id].name)];
  assert.equal(new Set(names).size, names.length, names.filter((n, i) => names.indexOf(n) !== i).join(', '));
});

test('collection: every new character can be earned, and says how', () => {
  for (const id of NEW_HEROES) {
    const rule = heroRule(id);
    assert.ok(rule !== null, `${id} has a rule`);
    assert.equal(ruleProgress(defaultSave(), rule!).value, 0, `${id} starts at nothing`);
    assert.ok(rule!.text.length > 10, `${id} says what it needs`);
  }
  for (const id of NEW_SIDEKICKS) {
    assert.ok(sidekickRule(id) !== null, `${id} has a way in`);
  }
});

// -- what the heroes do --------------------------------------------------------------------------------

test('hero: Star Horn is the Spread Horn: three lanes, for as long as it says', () => {
  const s = sim('ningning');
  assert.equal(s.state.powers.spread, undefined);
  useAbility(s);
  assert.ok(s.state.powers.spread !== undefined, 'the horn spreads');
  assert.ok(Math.abs(s.state.powers.spread!.left - 5) < 0.1, `for 5 s, got ${s.state.powers.spread!.left}`);
  assert.equal(s.state.player.cooldown, s.state.player.cooldownMax, 'and it has to recharge');
  steps(s, Math.ceil(5.2 / STEP));
  assert.equal(s.state.powers.spread, undefined, 'and then it stops');
});

test('hero: Breeze Sense slows the road as Route Sense does, with no lane arrow', () => {
  const navie = sim('navie');
  const simoy = sim('simoy');
  useAbility(navie);
  useAbility(simoy);
  steps(navie, 5);
  steps(simoy, 5);
  assert.ok(simoy.state.slowmo > 0, 'the road slows');
  assert.ok(Math.abs(simoy.state.speed - navie.state.speed) < 0.01, 'by the same amount');
  assert.ok(navie.state.routeHint !== null, 'Navie gets the arrow');
  assert.equal(simoy.state.routeHint, null, 'Simoy does not');
  assert.ok(simoy.state.warningLead > sim('jepoy').state.warningLead, 'and warnings come earlier');
});

test('hero: Sun Shield is the Bubble Shield: real protection, never stacking past the cap', () => {
  const s = sim('sikat');
  useAbility(s);
  assert.ok(s.state.player.shield > 3 && s.state.player.shield <= 3.5, `shield ${s.state.player.shield}`);
  assert.ok(s.state.powers.bubble !== undefined);
  // Everything on the road at once still cannot pass the cap.
  const both = sim('sikat', ['kawayan', null], {}, { kawayan: true });
  useAbility(both);
  assert.ok(both.state.player.shield <= PROTECTION_CAP_S);
});

test('hero: Sikat really has its extra dent, and it shows on the bars', () => {
  assert.equal(HERO_DEFS.sikat.extraDents, 1);
  assert.ok(HERO_DEFS.sikat.stats.toughness > HERO_DEFS.navie.stats.toughness);
});

test('hero: Team Rally makes sidekicks act twice as often, and Tali a little more always', () => {
  const shots = (hero: HeroId, rally: boolean): number => {
    const s = sim(hero, ['pip', null]);
    foeAt(s, 0, 20, 100000);
    if (rally) {
      useAbility(s);
    }
    let n = 0;
    for (let i = 0; i < Math.ceil(6 / STEP); i += 1) {
      s.state.player.x = 0;
      s.step(STEP, NO_INPUT);
      n += s.drainEvents().filter((e) => e.type === 'sidekick' && e.action === 'shot').length;
    }
    return n;
  };
  const plain = shots('navie', false);
  const passive = shots('tali', false);
  const rallied = shots('tali', true);
  assert.ok(passive >= plain, `Tali's sidekicks are not slower: ${passive} against ${plain}`);
  assert.ok(rallied >= plain * 1.7, `rally nearly doubles them: ${rallied} against ${plain}`);
});

test('hero: every new hero finishes a real mission, a boss and a convoy on the autopilot', () => {
  for (const hero of NEW_HEROES) {
    for (const mission of ['tambubong', 'm3-finale', 'm2-convoy'] as const) {
      const out = playMission(mission, { seed: 31, skipTutorial: true, loadout: loadout(hero, ['pip', 'mila']), difficulty: 'story', autoAbility: true, bot: { useAbility: true } });
      assert.equal(out.outcome, 'success', `${hero} on ${mission}`);
    }
  }
});

// -- what the sidekicks do --------------------------------------------------------------------------------

test('sidekick: Kono pops bots, and only bots', () => {
  const s = sim('navie', ['kono', null]);
  s.state.sidekicks[0].cooldown = 0;
  s.state.player.signature = 0;
  const foe = foeAt(s, 0, 14, 100);
  let popped = 0;
  for (let i = 0; i < Math.ceil(0.4 / STEP); i += 1) {
    s.step(STEP, NO_INPUT);
    popped += s.drainEvents().filter((e) => e.type === 'sidekick' && e.id === 'kono' && e.action === 'shot').length;
  }
  assert.equal(popped, 1, 'one blast, then it waits');
  assert.ok(s.state.sidekicks[0].cooldown > 2, 'a real recharge');
  void foe;

  const empty = sim('navie', ['kono', null]);
  empty.state.sidekicks[0].cooldown = 0;
  const car = foeAt(empty, 0, 14, 0);
  (car as { kind: string }).kind = 'car';
  (car as { maxHp: number }).maxHp = 0;
  let wasted = 0;
  for (let i = 0; i < Math.ceil(0.4 / STEP); i += 1) {
    empty.step(STEP, NO_INPUT);
    wasted += empty.drainEvents().filter((e) => e.type === 'sidekick' && e.id === 'kono').length;
  }
  assert.equal(wasted, 0, 'never at traffic');
});

test('sidekick: Kislap draws in Bolts for a moment, then rests; it never touches wrenches', () => {
  const s = sim('navie', ['kislap', null]);
  s.state.sidekicks[0].cooldown = 0;
  s.state.player.x = 0;
  const bolt = pickup(s, 900, 'bolt', 1, 6);
  const wrench = pickup(s, 901, 'wrench', 1, 6);
  const from = bolt.x;
  steps(s, 8);
  assert.ok(bolt.x < from - 0.01, `the Bolt comes closer: ${bolt.x}`);
  assert.equal(wrench.x, 1, 'the wrench stays put');
  assert.ok(s.state.sidekicks[0].cooldown > 5, 'and it has to rest');

  const without = sim('navie');
  const far = pickup(without, 900, 'bolt', 1, 6);
  steps(without, 8);
  assert.equal(far.x, 1, 'without Kislap a Bolt that far out stays where it is');
});

test('sidekick: Dahon draws in wrenches, and a wrench still fixes exactly what it fixes', () => {
  const s = sim('navie', ['dahon', null]);
  s.state.player.x = 0;
  s.state.player.dents = 2;
  const wrench = pickup(s, 900, 'wrench', 1, 6);
  const bolt = pickup(s, 901, 'bolt', 1, 6);
  steps(s, 8);
  assert.ok(wrench.x < 0.99, `the wrench comes closer: ${wrench.x}`);
  assert.equal(bolt.x, 1, 'the Bolt stays put');
  wrench.x = 0;
  (wrench as unknown as { z: number }).z = 0.5;
  steps(s, 4);
  assert.equal(s.state.player.dents, 1, 'one wrench, one dent');
  assert.ok(SIDEKICK_DEFS.dahon.evolved.range <= MAGNET_CAP, 'and it stays under the magnet cap');
});

test('sidekick: Radyo brings warnings forward, and the team cap still holds', () => {
  const base = sim('navie').state.warningLead;
  const radyo = sim('navie', ['radyo', null]).state.warningLead;
  assert.ok(Math.abs(radyo - base - SIDEKICK_DEFS.radyo.base.power) < 0.001, `${radyo} against ${base}`);
  const everything = sim('kiko', ['radyo', 'silip'], {}, { radyo: true, silip: true }).state.warningLead;
  assert.ok(everything - base <= WARNING_TEAM_CAP + 0.001, `the team bonus is capped: ${everything - base}`);
});

test('sidekick: Ginto pays extra for each bot, up to its limit, and counts nothing toward unlocks', () => {
  const s = sim('navie', ['ginto', null]);
  const before = s.state.boltsCollected;
  const coinsBefore = s.state.tally.coins;
  for (let i = 0; i < 3; i += 1) {
    foeAt(s, 0, 8 + i * 0.1, 0.01);
    s.state.hazards[s.state.hazards.length - 1].id = 9500 + i;
  }
  steps(s, Math.ceil(2 / STEP));
  const gained = s.state.boltsCollected - before;
  assert.ok(s.state.foesDefeated >= 1, 'bots went down');
  assert.ok(gained >= s.state.foesDefeated, `at least one Bolt a bot: ${gained} for ${s.state.foesDefeated}`);
  assert.equal(s.state.tally.coins - coinsBefore, 0, 'none of it counts as picked up');

  const capped = sim('navie', ['ginto', null]);
  for (let i = 0; i < 40; i += 1) {
    foeAt(capped, 0, 8, 0.01);
    capped.state.hazards[capped.state.hazards.length - 1].id = 9600 + i;
    steps(capped, 12);
    capped.state.player.dents = 0;
  }
  assert.ok(capped.state.boltsCollected <= SIDEKICK_DEFS.ginto.base.count, `capped at its limit: ${capped.state.boltsCollected}`);
});

test('sidekick: Hamog shields just before a hit, then rests, and never stacks', () => {
  const s = sim('navie', ['hamog', null]);
  s.state.sidekicks[0].cooldown = 0;
  s.state.player.x = 0;
  const cone = foeAt(s, 0, 5, 0);
  (cone as { kind: string }).kind = 'cone';
  (cone as { maxHp: number }).maxHp = 0;
  steps(s, 4);
  assert.ok(s.state.player.shield > 0 && s.state.player.shield <= SIDEKICK_DEFS.hamog.base.power, `a short shield: ${s.state.player.shield}`);
  assert.ok(s.state.sidekicks[0].cooldown > 20, 'then a long rest');

  const clear = sim('navie', ['hamog', null]);
  clear.state.sidekicks[0].cooldown = 0;
  steps(clear, 20);
  assert.equal(clear.state.player.shield, 0, 'nothing coming, no shield');

  const already = sim('jepoy', ['hamog', null]);
  useAbility(already);
  already.state.sidekicks[0].cooldown = 0;
  const shieldBefore = already.state.player.shield;
  foeAt(already, 0, 5, 0);
  steps(already, 2);
  assert.ok(already.state.player.shield <= shieldBefore, 'it waits while another shield is up');
  assert.equal(already.state.sidekicks[0].cooldown, 0, 'without spending itself');
});

test('sidekick: every new sidekick finishes a mission and a boss on the autopilot, evolved or not', () => {
  for (const id of NEW_SIDEKICKS) {
    for (const mission of ['tambubong', 'm3-finale'] as const) {
      for (const evolved of [false, true]) {
        const out = playMission(mission, { seed: 41, skipTutorial: true, loadout: loadout('navie', [id, 'mila'], { [id]: evolved }), difficulty: 'story', bot: { useAbility: true } });
        assert.equal(out.outcome, 'success', `${id} on ${mission}${evolved ? ', evolved' : ''}`);
      }
    }
  }
});

test('collection: a two-sidekick team stays two: a new one cannot fill both slots', () => {
  let save: SaveData = { ...defaultSave(), sidekicks: { ...defaultSave().sidekicks, kono: { xp: 0, evolved: false } } };
  save = equipSidekick(save, 0, 'kono');
  save = equipSidekick(save, 1, 'kono');
  assert.equal(save.loadout.sidekicks.filter((id) => id === 'kono').length, 1);
  assert.equal(save.loadout.sidekicks.length, 2);
});

// -- earning them ---------------------------------------------------------------------------------------

test('unlocks: the counters read real numbers from the save, and only ever real ones', () => {
  const save = defaultSave();
  assert.equal(counterValue(save, 'km'), 0);
  assert.equal(counterValue(save, 'endlessBest'), 0);
  assert.equal(counterValue(save, 'barkadas'), 0);
  assert.equal(counterValue({ ...save, tally: { ...save.tally, metres: 12400 } }, 'km'), 12, 'whole kilometres');
  assert.equal(counterValue({ ...save, endless: { ...save.endless, bestDistance: 1234 } }, 'endlessBest'), 1234);
  assert.equal(counterValue({ ...save, friendship: { pip: 10, mila: 9, navie: 25 } }, 'barkadas'), 2, 'Barkada is 10 runs together');
});

test('unlocks: driving really adds road to the total, and the same run is never counted twice', () => {
  const out = playMission('tambubong', { seed: 5, skipTutorial: true });
  const result = out.sim.result('road-1', 'success');
  assert.ok(result.tally.metres > 500, `a stop is a real distance: ${result.tally.metres}`);
  assert.equal(result.tally.metres, Math.round(result.tally.metres), 'whole metres in the save');
  const once = commitRun(defaultSave(), result).save;
  assert.equal(once.tally.metres, result.tally.metres);
  assert.equal(commitRun(once, result).save.tally.metres, result.tally.metres, 'a retry adds nothing');
});

/** A save that has cleared the first n levels. */
const clearedTo = (n: number): SaveData => {
  const save = defaultSave();
  const missions: SaveData['missions'] = {};
  JOURNEY.slice(0, n).forEach((id) => {
    missions[id] = { completed: true, clears: 1, bestScore: 0, bestDents: 0, foundPostcard: false };
  });
  return { ...save, missions };
};

test('unlocks: each new hero arrives at its level, and not one level before', () => {
  for (const id of NEW_HEROES) {
    const level = HERO_DEFS[id].unlock.level!;
    assert.ok(level >= 2 && level <= 100, `${id} joins on the road (${level})`);
    assert.ok(!applyUnlocks(clearedTo(level - 1)).heroes.includes(id), `${id} is not early`);
    const earned = applyUnlocks(clearedTo(level));
    assert.ok(earned.heroes.includes(id), `${id} arrives`);
    assert.ok(earned.save.reveals.includes(`hero:${id}`), `${id} gets a reveal`);
    assert.equal(applyUnlocks(earned.save).heroes.length, 0, `${id} arrives once`);
  }
});

test('unlocks: a locked character cannot be chosen, and an earned one can at once', () => {
  const save = defaultSave();
  assert.equal(selectHero(save, 'ningning'), save, 'no hero who is not earned');
  assert.equal(equipSidekick(save, 0, 'kono'), save, 'no sidekick who is not earned');
  const earned = applyUnlocks(clearedTo(Math.max(HERO_DEFS.ningning.unlock.level!, SIDEKICK_DEFS.kono.unlock.level!))).save;
  assert.equal(selectHero(earned, 'ningning').loadout.hero, 'ningning');
  assert.equal(equipSidekick(earned, 0, 'kono').loadout.sidekicks[0], 'kono');
});

test('unlocks: Kislap and Dahon join at a level now, and anyone bought before stays, equipped', () => {
  for (const id of ['kislap', 'dahon'] as SidekickId[]) {
    assert.ok(SIDEKICK_DEFS[id].unlock.level !== null, `${id} joins at a level`);
  }
  let save: SaveData = { ...defaultSave(), sidekicks: { ...defaultSave().sidekicks, dahon: { xp: 30, evolved: false } }, heroes: ['navie', 'ningning'] };
  save = equipSidekick(save, 1, 'dahon');
  save = selectHero(save, 'ningning');
  const back = loadSave(serializeSave(save)).save;
  assert.equal(back.sidekicks.dahon?.xp, 30, 'nobody is taken away');
  assert.equal(back.loadout.sidekicks[1], 'dahon');
  assert.equal(back.loadout.hero, 'ningning');
});

test('saves: a save from before the new cast keeps everything and starts the new count at nothing', () => {
  const old = JSON.parse(serializeSave({ ...defaultSave(), bolts: 777, heroes: ['navie', 'jepoy', 'berto'], tally: { ...emptyTally(), bots: 90, coins: 500 } })) as Record<string, unknown>;
  delete (old.tally as Record<string, unknown>).metres;
  const back = loadSave(JSON.stringify(old)).save;
  assert.equal(back.bolts, 777);
  assert.deepEqual(back.heroes, ['navie', 'jepoy', 'berto']);
  assert.equal(back.tally.bots, 90, 'real progress stays');
  assert.equal(back.tally.metres, 0, 'nothing invented for what was not measured');
  assert.equal(ruleProgress(back, heroRule('ningning')!).value, 0, 'heroes are earned by level, and this save is at the start of the road');
});

test('saves: a save with characters this version does not know loads without them, and does not crash', () => {
  const save = JSON.parse(serializeSave(defaultSave())) as Record<string, unknown>;
  save.heroes = ['navie', 'somebody'];
  (save.sidekicks as Record<string, unknown>).nobody = { xp: 1, evolved: false };
  const back = loadSave(JSON.stringify(save)).save;
  assert.ok(!(back.heroes as string[]).includes('somebody'));
  assert.equal((back.sidekicks as Record<string, unknown>).nobody, undefined);
});
