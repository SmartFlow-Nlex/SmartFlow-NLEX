import { KIKO_LATERAL, PLAYER_BACK, PLAYER_FRONT, X_LIMIT } from './config';
import { kikoShadows, obstacleFor } from './director';
import type { Obstacle } from './reachability';
import type { DrivingSim, SimInput } from './sim';

/**
 * An autopilot that drives through the simulation's own input, used by the
 * tests (seeded play-throughs of every mission and preset) and by the
 * development harness to reach later screens. It looks at a few target
 * positions, checks the straight move there and a short stay against every
 * hazard - and in the convoy against Kiko's shadows - and picks the safest,
 * preferring pick-ups and open gears. It has no reaction delay beyond
 * `replanEvery`, so it measures whether a path exists, not how a human fares.
 * In the convoy it steers no faster than Kiko can, like a careful player.
 */

const CANDIDATES = [-1, -0.5, 0, 0.5, 1];
const LOOK = 2.4;
const SAMPLE = 0.05;

export interface BotOptions {
  /** Seconds between decisions (a crude reaction time). */
  replanEvery?: number;
  /** Use the active ability when a hit looks unavoidable. */
  useAbility?: boolean;
  /** Ignore hazards entirely (for "Story never fails" checks). */
  blind?: boolean;
}

export function createBot(options: BotOptions = {}): (sim: DrivingSim, dt: number) => SimInput {
  const replanEvery = options.replanEvery ?? 0;
  let since = Infinity;
  let target = 0;
  let aim = 0;
  let tutorialSide = -1;

  return (sim, dt) => {
    const s = sim.state;
    since += dt;
    if (s.rescue !== null && s.kiko !== null) {
      // The lay-by instruction: line up in front of Kiko.
      aim = s.kiko.x;
      return { axis: 0, targetX: s.kiko.x, ability: false };
    }
    if (options.blind) {
      return { axis: 0, targetX: 0, ability: false };
    }
    if (s.tutorial !== null && s.tutorial.step === 'steer') {
      // Show the tutorial both directions.
      if (s.player.x < -0.7) {
        tutorialSide = 1;
      } else if (s.player.x > 0.7) {
        tutorialSide = -1;
      }
      return { axis: 0, targetX: tutorialSide, ability: false };
    }
    if (since >= replanEvery) {
      since = 0;
      target = choose(sim);
    }
    let ability = false;
    if (sim.abilityMode() === 'honk') {
      // Team Honk is charged: press it.
      ability = true;
    } else if (options.useAbility && sim.abilityReady()) {
      ability = hitSoon(sim, s.player.x, 0.35);
    }
    if (s.kiko === null) {
      aim = target;
    } else {
      // Ease the target across so the path stays one Kiko can follow.
      const step = KIKO_LATERAL * 0.92 * dt;
      aim += Math.max(-step, Math.min(step, target - aim));
    }
    return { axis: 0, targetX: aim, ability };
  };
}

function obstaclesOf(sim: DrivingSim): Obstacle[] {
  const s = sim.state;
  const out: Obstacle[] = [];
  for (const h of s.hazards) {
    if (h.spent || h.knocked >= 0) {
      continue;
    }
    // During Route Sense the road moves at 60% while steering stays full speed.
    const o = obstacleFor(h.kind, h.x, h.z, s.speed * (s.slowmo > 0 ? 0.6 : 1));
    const lc = h.laneChange;
    if (lc !== null && !lc.done) {
      // Treat a car that will change lanes as covering both.
      o.x = (lc.fromX + lc.toX) / 2;
      o.halfW += Math.abs(lc.toX - lc.fromX) / 2;
    }
    out.push(o);
  }
  return out;
}

/** First time (s) the move from x to c, then staying at c, touches an obstacle; LOOK+travel if never. */
function firstContact(obstacles: readonly Obstacle[], x: number, c: number, lateral: number, pad: number, half: number): number {
  const travel = Math.abs(c - x) / (lateral * 0.9);
  const horizon = travel + LOOK;
  for (let t = 0; t <= horizon; t += SAMPLE) {
    const p = t >= travel ? c : x + (c - x) * (t / Math.max(travel, 1e-6));
    for (const o of obstacles) {
      const near = o.z - o.approach * t;
      if (near < PLAYER_FRONT && near + o.len > PLAYER_BACK && Math.abs(p - o.x) < o.halfW + half + pad) {
        return t;
      }
    }
  }
  return horizon;
}

function choose(sim: DrivingSim): number {
  const s = sim.state;
  const x = s.player.x;
  const heroLateral = s.preset.lateral * s.hero.steer;
  const lateral = s.kiko !== null ? Math.min(heroLateral, KIKO_LATERAL * 0.92) : heroLateral;
  let obstacles = obstaclesOf(sim);
  if (s.kiko !== null && s.rescue === null) {
    obstacles = [...obstacles, ...kikoShadows(obstacles.filter((o) => o.z + o.len > s.kiko!.z - 0.75), s.kiko.z, s.speed)];
  }
  let best = x;
  let bestScore = -Infinity;
  for (const raw of CANDIDATES) {
    const c = Math.max(-X_LIMIT, Math.min(X_LIMIT, raw));
    const contact = firstContact(obstacles, x, c, lateral, 0.07, s.hero.hitHalfW);
    const travel = Math.abs(c - x) / (lateral * 0.9);
    let score = (contact - travel) * 10 - Math.abs(c - x) * 0.6;
    // Pick-ups close ahead in this lane.
    for (const p of s.pickups) {
      if (!p.collected && p.z > 0 && p.z < 22 && Math.abs(p.x - c) < 0.3) {
        score += p.kind === 'bolt' ? 1.5 : 6;
      }
    }
    // Open gears in the finale.
    if (s.boss !== null) {
      for (const gear of s.boss.gears) {
        if (gear.state !== 'closed' && Math.abs(gear.x - c) < 0.3) {
          score += gear.state === 'open' ? 5 : 2;
        }
      }
    }
    // Prefer lane centres.
    if (Math.abs(raw - Math.round(raw)) > 0.01) {
      score -= 1.5;
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function hitSoon(sim: DrivingSim, x: number, within: number): boolean {
  const obstacles = obstaclesOf(sim);
  return firstContact(obstacles, x, x, sim.state.preset.lateral * sim.state.hero.steer, 0, sim.state.hero.hitHalfW) < within;
}
