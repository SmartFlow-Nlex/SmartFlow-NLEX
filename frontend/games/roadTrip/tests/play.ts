import { createBot, type BotOptions } from '../core/bot';
import { STEP } from '../core/config';
import { DrivingSim, type SimEvent, type SimInput, type SimOptions } from '../core/sim';
import type { Difficulty, HeroId, MissionId, SidekickId, UpgradeId } from '../core/types';
import type { ScenarioConfig } from '../core/scenario';

/** Starter equipment: what every player has (Navie, Pip and Mila). Every mission must be finishable with it. */
export const STARTER_LOADOUT: SimOptions['loadout'] = { hero: 'navie', sidekicks: ['pip', 'mila'], evolved: {} };

export function loadout(hero: HeroId, sidekicks: [SidekickId | null, SidekickId | null], evolved: Partial<Record<SidekickId, boolean>> = {}): SimOptions['loadout'] {
  return { hero, sidekicks, evolved };
}

export interface PlayOptions {
  difficulty?: Difficulty;
  seed?: number;
  loadout?: SimOptions['loadout'];
  upgrades?: Partial<Record<UpgradeId, number>>;
  skipTutorial?: boolean;
  scenario?: ScenarioConfig | null;
  bot?: BotOptions;
  /** Replace the bot entirely. */
  driver?: (sim: DrivingSim, dt: number) => SimInput;
  maxSeconds?: number;
  autoAbility?: boolean;
  gameSpeed?: number;
  /** Endless: bank the run at the first checkpoint. */
  bank?: boolean;
}

export function simOptions(missionId: MissionId, o: PlayOptions = {}): SimOptions {
  return {
    missionId,
    seed: o.seed ?? 1,
    settings: {
      difficulty: o.difficulty ?? 'standard',
      gameSpeed: o.gameSpeed ?? 1,
      warningBoost: 0,
      autoAbility: o.autoAbility ?? false,
    },
    loadout: o.loadout ?? STARTER_LOADOUT,
    upgrades: o.upgrades ?? {},
    skipTutorial: o.skipTutorial ?? false,
    scenario: o.scenario ?? null,
  };
}

/** Closes an open checkpoint with its first offer, as a hurried player would. */
export function autoChoose(sim: DrivingSim): void {
  if (sim.state.choice !== null) {
    sim.choose(sim.state.choice.options[0] ?? null);
  }
}

export interface Played {
  sim: DrivingSim;
  outcome: 'success' | 'failure' | 'timeout';
  events: SimEvent[];
  seconds: number;
}

export function playMission(missionId: MissionId, o: PlayOptions = {}): Played {
  const sim = new DrivingSim(simOptions(missionId, o));
  const drive = o.driver ?? createBot({ useAbility: true, ...o.bot });
  const events: SimEvent[] = [];
  const limit = o.maxSeconds ?? 400;
  let t = 0;
  while (sim.state.outcome === null && t < limit) {
    if (sim.state.choice !== null) {
      // Checkpoints: take the first offer (or drive on).
      sim.choose(sim.state.choice.options[0] ?? null, o.bank === true);
    }
    sim.step(STEP, drive(sim, STEP));
    for (const e of sim.drainEvents()) {
      events.push(e);
    }
    t += STEP;
  }
  return { sim, outcome: sim.state.outcome ?? 'timeout', events, seconds: t };
}
