import { dailyDay, type DayDef } from './days';
import { IDLE_KG_PER_MIN } from './factors';
import type { PerkId } from './perks';
import { budgetGone, outcome, perkOffers, pickPerk, startShift, startSim, type ShiftOutcome } from './shift';
import {
  accepts,
  canRedirect,
  clearBlock,
  enginesOff,
  inWrongLane,
  isActive,
  laneWait,
  redirectLane,
  repairBooth,
  staffInUse,
  step,
  STEP_S,
  toggleLane,
  waitAhead,
  type Lane,
  type Sim,
} from './sim';

/**
 * Players made of code. They use the same actions as a person, at a human pace, so
 * the balance tests can say whether a shift is winnable and how hard it is. The
 * page also uses one to play behind the title screen.
 */

export interface BotSkill {
  name: string;
  /** Seconds before reacting to trouble. */
  reaction: number;
  /** Seconds between swipes. */
  moveEvery: number;
  /** Seconds between thinking about booths. */
  laneEvery: number;
  /** Knows which vehicle is worth moving, not just that a line is long. */
  weighsClasses: boolean;
  usesEngines: boolean;
}

export const SKILLS: Record<'novice' | 'casual' | 'good' | 'expert', BotSkill> = {
  novice: { name: 'novice', reaction: 5, moveEvery: 4.5, laneEvery: 12, weighsClasses: false, usesEngines: false },
  casual: { name: 'casual', reaction: 3, moveEvery: 2.4, laneEvery: 7, weighsClasses: false, usesEngines: false },
  good: { name: 'good', reaction: 1.4, moveEvery: 1.3, laneEvery: 3.5, weighsClasses: true, usesEngines: true },
  expert: { name: 'expert', reaction: 0.7, moveEvery: 0.8, laneEvery: 1.8, weighsClasses: true, usesEngines: true },
};

export interface BotMemory {
  moveIn: number;
  laneIn: number;
  seenTrouble: Map<string, number>;
}

export const newBotMemory = (): BotMemory => ({ moveIn: 1, laneIn: 1.5, seenTrouble: new Map() });

/** The best swipe available: from which vehicle back, in which lane, to where. */
function bestSwipe(sim: Sim, skill: BotSkill): { lane: number; fromS: number; to: number } | null {
  let best: { lane: number; fromS: number; to: number } | null = null;
  let bestGain = 0.05;
  const waits = sim.lanes.map((lane) => laneWait(sim, lane));
  for (const lane of sim.lanes) {
    for (const v of lane.queue) {
      if (!canRedirect(v) || v.target !== null) {
        continue;
      }
      const ahead = waitAhead(sim, v);
      const weight = skill.weighsClasses ? IDLE_KG_PER_MIN[v.cls] : IDLE_KG_PER_MIN[0];
      for (const target of sim.lanes) {
        if (target.index === lane.index || !accepts(target, v) || target.fault !== null) {
          continue;
        }
        /* A no-load vehicle at the wrong lane will block the whole line. */
        const wrong = inWrongLane(sim, v) ? 4 : 0;
        const gain = (ahead - waits[target.index] + wrong) * weight;
        if (gain > bestGain) {
          bestGain = gain;
          best = { lane: lane.index, fromS: v.s, to: target.index };
        }
      }
    }
  }
  return best;
}

function nearestClosed(sim: Sim, to: Lane): Lane | null {
  let nearest: Lane | null = null;
  for (const lane of sim.lanes) {
    if (lane.status === 'closed' && lane.fault === null && (nearest === null || Math.abs(lane.index - to.index) < Math.abs(nearest.index - to.index))) {
      nearest = lane;
    }
  }
  return nearest;
}

function thinkBooths(sim: Sim): void {
  const open = sim.lanes.filter((lane) => isActive(lane) && lane.type === 'rfid');
  if (open.length === 0) {
    return;
  }
  let busiest = open[0];
  let quietest = open[0];
  for (const lane of open) {
    if (laneWait(sim, lane) > laneWait(sim, busiest)) {
      busiest = lane;
    }
    if (laneWait(sim, lane) < laneWait(sim, quietest)) {
      quietest = lane;
    }
  }
  const worst = laneWait(sim, busiest);
  if (worst < 4) {
    return;
  }
  const closed = nearestClosed(sim, busiest);
  if (closed === null) {
    return;
  }
  if (staffInUse(sim) < sim.staff) {
    toggleLane(sim, closed.index);
    return;
  }
  /* Out of staff: free a crew from the quiet end, if it is not next to the trouble anyway. */
  if (laneWait(sim, quietest) < 2.5 && Math.abs(quietest.index - busiest.index) > Math.abs(closed.index - busiest.index) && !sim.lanes.some((l) => l.status === 'closing')) {
    toggleLane(sim, quietest.index);
  }
}

function react(sim: Sim, skill: BotSkill, memory: BotMemory): void {
  const noticed = (key: string): boolean => {
    const since = memory.seenTrouble.get(key) ?? sim.t;
    memory.seenTrouble.set(key, since);
    return sim.t - since >= skill.reaction;
  };
  for (const lane of sim.lanes) {
    const front = lane.queue[0];
    if (front !== undefined && front.block !== null && noticed(`v${front.id}`)) {
      clearBlock(sim, front.id);
    }
    if (lane.fault === 'reader' && !lane.repairing && noticed(`f${lane.index}-${Math.floor(sim.t / 40)}`)) {
      repairBooth(sim, lane.index);
    }
  }
}

/** One step's worth of decisions. */
export function botAct(sim: Sim, skill: BotSkill, memory: BotMemory, dt: number): void {
  react(sim, skill, memory);
  memory.laneIn -= dt;
  if (memory.laneIn <= 0) {
    memory.laneIn = skill.laneEvery;
    thinkBooths(sim);
  }
  if (sim.rules.redirect) {
    memory.moveIn -= dt;
    if (memory.moveIn <= 0) {
      const swipe = bestSwipe(sim, skill);
      if (swipe !== null) {
        redirectLane(sim, swipe.lane, swipe.fromS, swipe.to);
        memory.moveIn = skill.moveEvery;
      } else {
        memory.moveIn = 0.3;
      }
    }
  }
  if (skill.usesEngines && sim.enginesLeft > 0 && sim.enginesTimer <= 0) {
    let parked = 0;
    for (const lane of sim.lanes) {
      parked += lane.queue.filter((v, i) => i >= 1 && v.state === 'queue').length;
    }
    if (parked >= 9) {
      enginesOff(sim);
    }
  }
}

/** Plays a whole shift. `pick` chooses among the changes offered (default: the first). */
export function playShift(def: DayDef, skill: BotSkill | null, pick?: (offers: PerkId[]) => PerkId | null): ShiftOutcome {
  const run = startShift(def);
  const sim = startSim(run, false);
  const memory = newBotMemory();
  const offered = new Set<number>();
  while (!sim.done) {
    if (skill !== null) {
      botAct(sim, skill, memory, STEP_S);
      const wave = sim.waveIndex - 1;
      if (wave >= 0 && def.perksAfter.includes(wave) && !offered.has(wave)) {
        offered.add(wave);
        const offers = perkOffers(run, sim, wave);
        const choice = pick === undefined ? offers[0] ?? null : pick(offers);
        if (choice !== null) {
          pickPerk(sim, choice);
        }
      }
    }
    step(sim, STEP_S);
    if (budgetGone(run, sim)) {
      return outcome(run, sim, true);
    }
  }
  return outcome(run, sim, false);
}

/**
 * Today's shift with star targets measured from the bots, so a hard day and an easy
 * day ask for the same skill. The same date always gives the same targets.
 */
export function calibratedDaily(dateKey: string): DayDef {
  const open: DayDef = { ...dailyDay(dateKey), need: [0, 0, 0] };
  const share = (skill: BotSkill): number => {
    const result = playShift(open, skill);
    return result.unmanaged > 0 ? 1 - result.used / result.unmanaged : 0;
  };
  const round = (v: number): number => Math.round(v * 100) / 100;
  const novice = share(SKILLS.novice);
  const casual = share(SKILLS.casual);
  const good = share(SKILLS.good);
  const three = Math.min(good - 0.005, Math.max(good * 0.97, casual + 0.02));
  const two = Math.min(casual, three - 0.03);
  const one = Math.max(0.1, Math.min(novice * 0.7, two - 0.05));
  return { ...open, need: [round(one), round(two), round(three)] };
}
