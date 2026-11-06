import { MISSIONS } from './missions';
import { CORE_REWARDS, ENDLESS_MILESTONES, EVOLVE_COST, SIDEKICK_DEFS, SIDEKICK_XP, heroBlockedFor } from './roster';
import { JOURNEY, SIDEKICKS } from './types';
import { levelOf, levelPlan } from './levels';
import { PROCESSED_RUNS_KEPT, bumpRevision } from './save';
import { HERO_DEFS } from './roster';
import { addTally, applyUnlocks, levelsCleared } from './unlocks';
import type {
  HeroId,
  MissionId,
  MissionRecord,
  Payout,
  PayoutLine,
  RunResult,
  SaveData,
  SidekickId,
  UpgradeId,
} from './types';

/**
 * Bolts, unlocks, upgrades and the team. Every function here is pure: it
 * takes a save and returns a new one, so a reward and the progress it unlocks
 * are always committed together, as one save write.
 */

// -- what is open ------------------------------------------------------------

export function isCompleted(save: SaveData, id: MissionId): boolean {
  return save.missions[id]?.completed === true;
}

export function isUnlocked(save: SaveData, id: MissionId): boolean {
  const requires = MISSIONS[id].requires;
  return requires === null || isCompleted(save, requires);
}

/** The mission the map recommends: the first stop on the road not yet completed. */
export function recommendedMission(save: SaveData): MissionId | null {
  for (const id of JOURNEY) {
    if (!isCompleted(save, id)) {
      return id;
    }
  }
  return null;
}

/** Bocaue Barrier is open: the fiesta is on in the garage, and the road north begins. */
export function barrierOpen(save: SaveData): boolean {
  return isCompleted(save, 'm3-finale');
}

/** Sta. Ines is reached: the whole of NLEX is open. */
export function journeyComplete(save: SaveData): boolean {
  return isCompleted(save, 'sta-ines');
}

/** Who a level brings along: the heroes and sidekicks that join when it is cleared. */
export function joinersAt(id: MissionId): { heroes: HeroId[]; sidekicks: SidekickId[] } {
  const level = levelOf(id);
  if (level === 0) {
    return { heroes: [], sidekicks: [] };
  }
  return {
    heroes: (Object.keys(HERO_DEFS) as HeroId[]).filter((h) => HERO_DEFS[h].unlock.level === level),
    sidekicks: SIDEKICKS.filter((s) => SIDEKICK_DEFS[s].unlock.level === level),
  };
}

/** The Workshop opens here: early enough that Bolts always have somewhere to go. */
export const WORKSHOP_LEVEL = 6;

/** The Team screen is open from the start (Navie and two sidekicks); Kiko's arrival opens the Workshop. */
export function teamOpen(_save: SaveData): boolean {
  return true;
}

export function workshopOpen(save: SaveData): boolean {
  return levelsCleared(save) >= WORKSHOP_LEVEL || save.heroes.includes('kiko');
}

export function hasSidekick(save: SaveData, id: SidekickId): boolean {
  return save.sidekicks[id] !== undefined;
}

// -- rewards -------------------------------------------------------------------

export const CLEAN_BONUS = { none: 20, one: 10 };
export const POSTCARD_BONUS = 15;
export const TEAMWORK_CAP = 25;

function teamworkLines(result: RunResult): PayoutLine[] {
  const lines: PayoutLine[] = [];
  if (result.shieldBlocks > 0) {
    lines.push({ label: "Kuya's Shield", amount: 10, note: `Blocked ${result.shieldBlocks} hit${result.shieldBlocks === 1 ? '' : 's'}` });
  }
  if (result.repairsUsed > 0) {
    lines.push({ label: 'Spare Parts', amount: 10, note: `Fixed ${result.repairsUsed} dent${result.repairsUsed === 1 ? '' : 's'}` });
  }
  if (result.kikoEngineLeft !== null && result.kikoEngineMax !== null) {
    if (result.kikoEngineLeft >= Math.min(2, result.kikoEngineMax)) {
      lines.push({ label: 'Kept Kiko safe', amount: 15, note: "Kiko's engine stayed strong" });
    } else if (result.kikoEngineLeft >= 1) {
      lines.push({ label: 'Kept Kiko going', amount: 5, note: 'Kiko made it, a bit shaken' });
    }
  }
  if (result.teamHonk) {
    lines.push({ label: 'Team Honk', amount: 15, note: 'The whole team, together' });
  }
  if (result.goalsDone > 0) {
    lines.push({ label: 'Road goals', amount: 5 * result.goalsDone, note: `${result.goalsDone} short goal${result.goalsDone === 1 ? '' : 's'} done` });
  }
  // Teamwork is capped, so no single trick dominates the score.
  let left = TEAMWORK_CAP;
  return lines.map((line) => {
    const amount = Math.min(line.amount, left);
    left -= amount;
    return { ...line, amount };
  }).filter((line) => line.amount > 0);
}

/** The results-screen breakdown for a run, before it is committed. */
export function computePayout(save: SaveData, result: RunResult): Payout {
  const def = MISSIONS[result.missionId];
  const record = save.missions[result.missionId];
  const firstClear = result.outcome === 'success' && record?.completed !== true && result.missionId !== 'endless';
  const lines: PayoutLine[] = [];

  const xp = xpFor(save, result, firstClear);
  if (result.outcome === 'abandoned') {
    return { lines: [], total: 0, firstClear: false, unlocks: [], cores: 0, xp: [], newBest: false };
  }

  if (result.missionId === 'endless') {
    return endlessPayout(save, result, xp);
  }

  if (result.outcome === 'failure') {
    // A try still earns something: half the Bolts picked up on the way.
    const half = Math.floor(result.boltsCollected / 2);
    if (half > 0) {
      lines.push({ label: 'Bolts picked up', amount: half, note: `Half of ${result.boltsCollected} - the run did not finish` });
    }
    return { lines, total: half, firstClear: false, unlocks: [], cores: 0, xp, newBest: false };
  }

  if (result.boltsCollected > 0) {
    lines.push({ label: 'Bolts picked up', amount: result.boltsCollected, note: 'Collected on the road' });
  }
  lines.push(
    firstClear
      ? { label: 'First completion', amount: def.rewards.firstClear, note: 'Paid once, the first time' }
      : { label: 'Completion', amount: def.rewards.replay, note: 'Replay reward' },
  );
  if (result.dents === 0) {
    lines.push({ label: 'Clean driving', amount: CLEAN_BONUS.none, note: 'No dents' });
  } else if (result.dents === 1) {
    lines.push({ label: 'Clean driving', amount: CLEAN_BONUS.one, note: 'Only 1 dent' });
  }
  lines.push(...teamworkLines(result));
  if (result.postcardFound && def.postcard !== null) {
    if (record?.foundPostcard === true) {
      lines.push({ label: 'Postcard', amount: 0, note: 'Already in your collection' });
    } else {
      lines.push({ label: 'Postcard found', amount: POSTCARD_BONUS, note: def.postcard.title });
    }
  }

  const unlocks: string[] = [];
  if (firstClear && JOURNEY.includes(result.missionId)) {
    const level = levelOf(result.missionId);
    const plan = levelPlan(result.missionId);
    if (result.missionId === 'm1-garage') {
      unlocks.push('Snapshot Challenge and Endless Expressway unlocked');
    }
    if (level === WORKSHOP_LEVEL && !save.heroes.includes('kiko')) {
      unlocks.push('Workshop opened in the garage');
    }
    if (result.missionId === 'm2-convoy') {
      unlocks.push("Lola's parol now hangs in your garage");
    } else if (result.missionId === 'm3-finale') {
      unlocks.push('Bocaue Barrier reopened!', 'Fiesta decorations in the garage', 'The road north is open on the map');
    } else if (result.missionId === 'sta-ines') {
      unlocks.push('You drove the whole of NLEX: every exit is open!');
    }
    if (plan !== undefined && plan.reachesExit && result.missionId !== 'sta-ines') {
      unlocks.push(`Exit reached: ${plan.to}`);
    }
    const next = JOURNEY[JOURNEY.indexOf(result.missionId) + 1];
    if (next !== undefined) {
      unlocks.push(`Next: Level ${levelOf(next)}, ${MISSIONS[next].title}`);
    }
  }
  const coreDef = CORE_REWARDS[result.missionId];
  const cores = coreDef === undefined ? 0 : firstClear ? coreDef.first : coreDef.replay;

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return { lines, total, firstClear, unlocks, cores, xp, newBest: false };
}

/** XP for each equipped sidekick from this run (only sidekicks the player owns). */
function xpFor(save: SaveData, result: RunResult, firstClear: boolean): Payout['xp'] {
  if (result.outcome === 'abandoned') {
    return [];
  }
  const amount = result.outcome === 'success' ? SIDEKICK_XP.success + (firstClear ? SIDEKICK_XP.firstClear : 0) : SIDEKICK_XP.failure;
  const out: Payout['xp'] = [];
  for (const id of result.sidekicks) {
    const progress = id === null ? undefined : save.sidekicks[id];
    if (id === null || progress === undefined || out.some((x) => x.id === id)) {
      continue;
    }
    out.push({ id, amount, readyToEvolve: !progress.evolved && progress.xp + amount >= EVOLVE_COST.xp });
  }
  return out;
}

/** Endless Expressway: score from distance and play; Gear Cores for first-time milestones only. */
export const ENDLESS_BOLTS_CAP = 80;

function endlessPayout(save: SaveData, result: RunResult, xp: Payout['xp']): Payout {
  const lines: PayoutLine[] = [];
  if (result.boltsCollected > 0) {
    lines.push({ label: 'Bolts picked up', amount: result.boltsCollected, note: 'Collected on the road' });
  }
  // Banking at a checkpoint keeps the whole distance reward; a run that ends in a crash keeps 70%.
  const banked = result.outcome === 'success';
  const distanceBolts = Math.floor(Math.min(ENDLESS_BOLTS_CAP, result.distance / 25) * (banked ? 1 : 0.7));
  if (distanceBolts > 0) {
    lines.push({
      label: 'Distance',
      amount: distanceBolts,
      note: `${Math.round(result.distance)} m (capped at ${ENDLESS_BOLTS_CAP}${banked ? ', banked in full' : ', 70% after a crash'})`,
    });
  }
  const newMilestones = ENDLESS_MILESTONES.filter((m) => result.distance >= m && !save.endless.milestones.includes(m));
  const unlocks: string[] = [];
  if (result.distance >= 1000 && save.sidekicks.silip === undefined) {
    unlocks.push('Sidekick joined: Silip');
  }
  for (const m of newMilestones) {
    unlocks.push(`Milestone: ${m} m - a Gear Core`);
  }
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const score = endlessScore(result);
  return { lines, total, firstClear: false, unlocks, cores: newMilestones.length, xp, newBest: score > save.endless.bestScore };
}

/** Endless score: distance, bots and Bolts. Local to this phone; not a verified ranking. */
export function endlessScore(result: Pick<RunResult, 'distance' | 'foesDefeated' | 'boltsCollected' | 'dents'>): number {
  return Math.round(result.distance) + result.foesDefeated * 10 + result.boltsCollected * 2;
}

export interface CommitOutcome {
  save: SaveData;
  payout: Payout;
  /** True when this run id was already committed: nothing changed, nothing paid. */
  duplicate: boolean;
}

/**
 * Pays a finished run exactly once. A retry, a reload or a second "finish"
 * for the same run id returns the save unchanged with `duplicate: true`.
 * Bolts, mission records, recruits and the run id all change in the one
 * returned save.
 */
export function commitRun(save: SaveData, result: RunResult, now: Date = new Date()): CommitOutcome {
  if (save.processedRuns.includes(result.runId)) {
    return { save, payout: { lines: [], total: 0, firstClear: false, unlocks: [], cores: 0, xp: [], newBest: false }, duplicate: true };
  }
  const payout = computePayout(save, result);
  const previous: MissionRecord = save.missions[result.missionId] ?? {
    completed: false,
    clears: 0,
    bestScore: 0,
    bestDents: null,
    foundPostcard: false,
  };
  const success = result.outcome === 'success';
  const record: MissionRecord = {
    completed: previous.completed || success,
    clears: previous.clears + (success ? 1 : 0),
    bestScore: success ? Math.max(previous.bestScore, payout.total) : previous.bestScore,
    bestDents: success ? Math.min(previous.bestDents ?? Number.MAX_SAFE_INTEGER, result.dents) : previous.bestDents,
    foundPostcard: previous.foundPostcard || (success && result.postcardFound),
  };

  // Who joins is worked out from the levels cleared, by applyUnlocks below.
  const heroes = [...save.heroes];
  const sidekicks = { ...save.sidekicks };
  for (const gain of payout.xp) {
    const progress = sidekicks[gain.id];
    if (progress !== undefined) {
      sidekicks[gain.id] = { ...progress, xp: progress.xp + gain.amount };
    }
  }
  let endless = save.endless;
  if (result.missionId === 'endless') {
    const newMilestones = ENDLESS_MILESTONES.filter((m) => result.distance >= m && !endless.milestones.includes(m));
    endless = {
      bestDistance: Math.max(endless.bestDistance, Math.round(result.distance)),
      bestScore: Math.max(endless.bestScore, endlessScore(result)),
      runs: endless.runs + 1,
      milestones: [...endless.milestones, ...newMilestones],
    };
  }

  const played = result.outcome !== 'abandoned';
  const friendship = { ...save.friendship };
  if (played) {
    for (const id of [result.hero, ...result.sidekicks]) {
      if (id !== null) {
        friendship[id] = (friendship[id] ?? 0) + 1;
      }
    }
  }
  const next: SaveData = {
    ...save,
    bolts: save.bolts + payout.total,
    lifetimeBolts: save.lifetimeBolts + payout.total,
    gearCores: save.gearCores + payout.cores,
    missions: result.missionId === 'endless' ? save.missions : { ...save.missions, [result.missionId]: record },
    heroes,
    sidekicks,
    endless,
    tutorialDone: save.tutorialDone || (success && result.missionId === 'm1-garage'),
    processedRuns: [...save.processedRuns, result.runId].slice(-PROCESSED_RUNS_KEPT),
    tally: played ? addTally(save.tally, result.tally) : save.tally,
    friendship,
  };
  // The reward and whoever it unlocks are one save write.
  const earned = applyUnlocks(next);
  const lines = [...earned.heroes.map((id) => `Hero unlocked: ${HERO_DEFS[id].name}`), ...earned.sidekicks.map((id) => `Sidekick joined: ${SIDEKICK_DEFS[id].name}`)];
  const finalPayout = lines.length > 0 ? { ...payout, unlocks: [...lines, ...payout.unlocks], newlyUnlocked: lines } : payout;
  return { save: bumpRevision(earned.save, now), payout: finalPayout, duplicate: false };
}

// -- loadout --------------------------------------------------------------------

/** Chooses the hero (only unlocked heroes). */
export function selectHero(save: SaveData, id: HeroId, now: Date = new Date()): SaveData {
  if (!save.heroes.includes(id) || save.loadout.hero === id) {
    return save;
  }
  return bumpRevision({ ...save, loadout: { ...save.loadout, hero: id } }, now);
}

/** Puts an owned sidekick in slot 0 or 1 (or empties it); the same sidekick never fills both. */
export function equipSidekick(save: SaveData, slot: 0 | 1, id: SidekickId | null, now: Date = new Date()): SaveData {
  if (id !== null && save.sidekicks[id] === undefined) {
    return save;
  }
  const sidekicks: [SidekickId | null, SidekickId | null] = [...save.loadout.sidekicks];
  const other = slot === 0 ? 1 : 0;
  if (id !== null && sidekicks[other] === id) {
    // Swap rather than duplicate.
    sidekicks[other] = sidekicks[slot];
  }
  sidekicks[slot] = id;
  return bumpRevision({ ...save, loadout: { ...save.loadout, sidekicks } }, now);
}

/** The hero for a mission: the chosen one, unless the story forbids it (then Navie). */
export function heroFor(save: SaveData, mission: MissionId): HeroId {
  const hero = save.loadout.hero;
  return heroBlockedFor(hero, mission) === null ? hero : 'navie';
}

// -- evolution ---------------------------------------------------------------------

export interface EvolveCheck {
  ok: boolean;
  /** What is missing, in words; null when ready. */
  missing: string | null;
}

export function canEvolve(save: SaveData, id: SidekickId): EvolveCheck {
  const progress = save.sidekicks[id];
  if (progress === undefined) {
    return { ok: false, missing: 'Not in your collection yet' };
  }
  if (progress.evolved) {
    return { ok: false, missing: 'Already evolved' };
  }
  const need: string[] = [];
  if (progress.xp < EVOLVE_COST.xp) {
    need.push(`${EVOLVE_COST.xp - progress.xp} more XP`);
  }
  if (save.gearCores < EVOLVE_COST.cores) {
    need.push(`${EVOLVE_COST.cores - save.gearCores} more Gear Core${EVOLVE_COST.cores - save.gearCores === 1 ? '' : 's'}`);
  }
  if (save.bolts < EVOLVE_COST.bolts) {
    need.push(`${EVOLVE_COST.bolts - save.bolts} more Bolts`);
  }
  return need.length === 0 ? { ok: true, missing: null } : { ok: false, missing: `Needs ${need.join(', ')}` };
}

/** Spends the cost and evolves the sidekick in one save; unchanged if not allowed. */
export function evolveSidekick(save: SaveData, id: SidekickId, now: Date = new Date()): { save: SaveData; evolved: boolean } {
  const check = canEvolve(save, id);
  const progress = save.sidekicks[id];
  if (!check.ok || progress === undefined) {
    return { save, evolved: false };
  }
  const next: SaveData = {
    ...save,
    bolts: save.bolts - EVOLVE_COST.bolts,
    gearCores: save.gearCores - EVOLVE_COST.cores,
    sidekicks: { ...save.sidekicks, [id]: { ...progress, evolved: true } },
  };
  return { save: bumpRevision(next, now), evolved: true };
}

export function sidekickName(save: SaveData, id: SidekickId): string {
  return save.sidekicks[id]?.evolved ? SIDEKICK_DEFS[id].evolvedName : SIDEKICK_DEFS[id].name;
}

// -- upgrades ---------------------------------------------------------------------

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** Effect per level, in words. */
  effect: string;
  costs: number[];
  /** Why it is worth it / what it does not do. */
  note: string;
  requires: 'workshop' | 'jepoy' | 'kiko';
  cosmetic?: boolean;
}

export const UPGRADE_DEFS: Record<UpgradeId, UpgradeDef> = {
  bumper: {
    id: 'bumper',
    name: 'Sturdy Bumper',
    effect: '+1 dent before a run fails',
    costs: [80, 140],
    note: 'More room for mistakes. Does nothing in Story mode, where runs never fail.',
    requires: 'workshop',
  },
  steering: {
    id: 'steering',
    name: 'Quick Steering',
    effect: '+8% steering speed',
    costs: [60, 110],
    note: 'Reach gaps sooner. Drag steering also feels a little livelier.',
    requires: 'workshop',
  },
  shieldTuning: {
    id: 'shieldTuning',
    name: 'Shield Tuning',
    effect: "Kuya's Shield lasts 5.5 s instead of 4 s",
    costs: [90],
    note: 'Only helps when Kuya Jepoy is the hero. Still capped at 6 s of protection.',
    requires: 'jepoy',
  },
  spareKit: {
    id: 'spareKit',
    name: 'Spare Kit',
    effect: "Kumpuni's repairs: one more per run",
    costs: [90],
    note: 'Only helps with Kumpuni equipped. All non-wrench repairs stay capped at 3 per run.',
    requires: 'kiko',
  },
  banderitas: {
    id: 'banderitas',
    name: 'Fiesta Banderitas',
    effect: 'Colourful flags across the garage',
    costs: [40],
    note: 'Decoration only - no effect on driving.',
    requires: 'workshop',
    cosmetic: true,
  },
};

export function upgradeLevel(save: SaveData, id: UpgradeId): number {
  return save.upgrades[id] ?? 0;
}

export type BuyRefusal = 'locked' | 'maxed' | 'cost';

/**
 * One shape for yes and no (the root tsconfig is not strict, where a
 * discriminated union would not narrow): `reason` is null when `ok`.
 */
export interface BuyCheck {
  ok: boolean;
  reason: BuyRefusal | null;
  /** Price of the next level; null when maxed. */
  cost: number | null;
}

export function canBuy(save: SaveData, id: UpgradeId): BuyCheck {
  const def = UPGRADE_DEFS[id];
  const level = upgradeLevel(save, id);
  if (!workshopOpen(save) || (def.requires === 'jepoy' && !save.heroes.includes('jepoy')) || (def.requires === 'kiko' && !save.sidekicks.kumpuni)) {
    return { ok: false, reason: 'locked', cost: def.costs[level] ?? null };
  }
  if (level >= def.costs.length) {
    return { ok: false, reason: 'maxed', cost: null };
  }
  const cost = def.costs[level];
  if (save.bolts < cost) {
    return { ok: false, reason: 'cost', cost };
  }
  return { ok: true, reason: null, cost };
}

/** Spends Bolts and raises the level in one save; unchanged if not allowed. */
export function buyUpgrade(save: SaveData, id: UpgradeId, now: Date = new Date()): { save: SaveData; bought: boolean } {
  const check = canBuy(save, id);
  if (!check.ok || check.cost === null) {
    return { save, bought: false };
  }
  const next: SaveData = {
    ...save,
    bolts: save.bolts - check.cost,
    upgrades: { ...save.upgrades, [id]: upgradeLevel(save, id) + 1 },
  };
  // A Workshop task can be what someone was waiting for.
  return { save: bumpRevision(applyUnlocks(next).save, now), bought: true };
}

/** A reveal has been shown: it never plays again. */
export function clearReveal(save: SaveData, id: string, now: Date = new Date()): SaveData {
  if (!save.reveals.includes(id)) {
    return save;
  }
  return bumpRevision({ ...save, reveals: save.reveals.filter((r) => r !== id) }, now);
}

/** Marks a story scene or garage moment as seen. */
export function markSeen(save: SaveData, kind: 'scenesSeen' | 'garageEvents', id: string, now: Date = new Date()): SaveData {
  if (save[kind].includes(id)) {
    return save;
  }
  return bumpRevision({ ...save, [kind]: [...save[kind], id] }, now);
}
