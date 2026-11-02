/**
 * Is there still a way through? The check every pattern passes before it is
 * placed on the road.
 *
 * An empty lane is not enough: it has to be reachable in time. So this sweeps
 * forward in small time steps over a fine grid of lateral positions:
 *
 * 1. For the reaction allowance the driver is assumed to keep doing what they
 *    are doing (current position and sideways speed). A hazard on that line
 *    inside the allowance is unfair - nobody can react to it.
 * 2. After that, every step the set of positions the car could be in grows by
 *    what it can steer in one step - at `lateral`, a deliberately cautious
 *    share of the real top steering speed - and every position a hazard covers
 *    at that moment is removed. A hazard covers its own width plus the car's
 *    half-width plus a margin, for as long as it overlaps the car along the road.
 * 3. If any position survives until the last hazard has passed, there is a path.
 *
 * Lane-changing traffic covers both lanes from the moment its indicator starts
 * until the change is complete.
 */

export interface Obstacle {
  x: number;
  halfW: number;
  /** Near edge, distance ahead of the player's front bumper. */
  z: number;
  len: number;
  /** How fast it closes on the player, units/s (> 0). */
  approach: number;
  laneChange?: {
    toX: number;
    /** Seconds from now when its indicator starts. */
    signalT: number;
    /** Seconds from now when it starts moving across. */
    startT: number;
    duration: number;
  };
}

export interface Mover {
  x: number;
  vx: number;
  halfW: number;
  /** Its hitbox along the road, relative to the player's front bumper. */
  back: number;
  front: number;
  xMin: number;
  xMax: number;
  /** Steering speed the check assumes, units/s. */
  lateral: number;
  /** Seconds before the driver is assumed to respond. */
  reaction: number;
}

export interface SweepOptions {
  /** Grid spacing across the road. */
  dx?: number;
  /** Time step. */
  dt?: number;
  /** Extra clearance around every hazard. */
  margin?: number;
}

function lateralAt(o: Obstacle, t: number): { lo: number; hi: number } {
  const lc = o.laneChange;
  if (lc === undefined || t < lc.signalT) {
    return { lo: o.x - o.halfW, hi: o.x + o.halfW };
  }
  if (t <= lc.startT + lc.duration) {
    // Indicating or crossing: it may be anywhere between the two lanes.
    return { lo: Math.min(o.x, lc.toX) - o.halfW, hi: Math.max(o.x, lc.toX) + o.halfW };
  }
  return { lo: lc.toX - o.halfW, hi: lc.toX + o.halfW };
}

function overlapsAt(o: Obstacle, m: Mover, t: number): boolean {
  const near = o.z - o.approach * t;
  return near < m.front && near + o.len > m.back;
}

/** The last moment any obstacle still overlaps the mover's stretch of road. */
function endTime(obstacles: readonly Obstacle[], m: Mover): number {
  let end = 0;
  for (const o of obstacles) {
    if (o.approach > 0) {
      end = Math.max(end, (o.z + o.len - m.back) / o.approach);
    }
  }
  return end;
}

export function hasSafePath(obstacles: readonly Obstacle[], mover: Mover, options: SweepOptions = {}): boolean {
  const dx = options.dx ?? 0.02;
  const dt = options.dt ?? 1 / 40;
  const margin = options.margin ?? 0.05;
  const relevant = obstacles.filter((o) => o.approach > 0 && o.z + o.len > mover.back);
  if (relevant.length === 0) {
    return true;
  }
  const tEnd = endTime(relevant, mover);
  const pad = mover.halfW + margin;

  const blockedNow = (x: number, t: number): boolean => {
    for (const o of relevant) {
      if (overlapsAt(o, mover, t)) {
        const span = lateralAt(o, t);
        if (x >= span.lo - pad && x <= span.hi + pad) {
          return true;
        }
      }
    }
    return false;
  };

  // 1. Reaction allowance: the car carries on as it is.
  let t = 0;
  let x = mover.x;
  while (t < mover.reaction) {
    if (blockedNow(x, t)) {
      return false;
    }
    t += dt;
    x = Math.min(mover.xMax, Math.max(mover.xMin, x + mover.vx * dt));
  }
  if (t >= tEnd) {
    return true;
  }

  // 2. Sweep the reachable set.
  const cells = Math.floor((mover.xMax - mover.xMin) / dx) + 1;
  let current = new Uint8Array(cells);
  let next = new Uint8Array(cells);
  current[Math.min(cells - 1, Math.max(0, Math.round((x - mover.xMin) / dx)))] = 1;
  const spread = Math.max(1, Math.floor((mover.lateral * dt) / dx));

  while (t < tEnd) {
    t += dt;
    next.fill(0);
    // Grow by one step of steering.
    for (let i = 0; i < cells; i += 1) {
      if (current[i] === 1) {
        const from = Math.max(0, i - spread);
        const to = Math.min(cells - 1, i + spread);
        for (let j = from; j <= to; j += 1) {
          next[j] = 1;
        }
      }
    }
    // Remove what hazards cover now.
    for (const o of relevant) {
      if (!overlapsAt(o, mover, t)) {
        continue;
      }
      const span = lateralAt(o, t);
      const from = Math.max(0, Math.ceil((span.lo - pad - mover.xMin) / dx));
      const to = Math.min(cells - 1, Math.floor((span.hi + pad - mover.xMin) / dx));
      for (let j = from; j <= to; j += 1) {
        next[j] = 0;
      }
    }
    let any = false;
    for (let i = 0; i < cells; i += 1) {
      if (next[i] === 1) {
        any = true;
        break;
      }
    }
    if (!any) {
      return false;
    }
    const swap = current;
    current = next;
    next = swap;
  }
  return true;
}
