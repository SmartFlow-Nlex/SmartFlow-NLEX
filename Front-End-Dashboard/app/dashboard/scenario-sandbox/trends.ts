/* The readouts over time, for the Trends charts under the road.
 *
 * The strip of readouts (speed, throughput, queue, CO2) is a snapshot: it said
 * where the road is, never how it got there, so a crash's cost — the speed
 * falling, the queue growing, and how long the road took to recover — could
 * only be watched, not read. This keeps a sample every TREND_STEP_S of
 * simulated time from the end of the warm-up (before it the road is still
 * filling and nothing is comparable), one log per carriageway.
 *
 * A log belongs to one run: handed a different engine (a rebuild, a reset, a
 * new window) it starts again, so a new run never draws on top of an old one.
 * Sampling reads the engine's metrics(), which only reads. */

/** One reading. `t` is seconds after the end of the warm-up — scenario time, the base events are timed in. */
export type TrendSample = {
  readonly t: number;
  readonly speedKmh: number;
  readonly throughputPerMin: number;
  readonly queueM: number;
  readonly co2KgPerMin: number;
};

/** Seconds of simulated time between samples: an hour is 360 points, enough to see a queue grow and drain. */
export const TREND_STEP_S = 10;
/** The most a log keeps: six hours of simulated time. Older samples are dropped first. */
export const TREND_MAX_SAMPLES = 2160;

/** How far back a baseline, and the "now" it is compared with, are averaged: one minute of simulated time. */
export const COMPARE_WINDOW_S = 60;

/**
 * The mean of the last `windowS` of samples, or null with fewer than three (too few to call an average).
 *
 * A baseline was one instant against another instant. Speed and queue length move from second to second, so
 * the same road gave -4% or +6% depending on when the button was pressed. A minute's mean on each side is what
 * the comparison is actually about: how the road was running, against how it is running.
 */
export function recentAverage(samples: readonly TrendSample[], windowS = COMPARE_WINDOW_S): Omit<TrendSample, "t"> | null {
  if (samples.length === 0) return null;
  const from = samples[samples.length - 1].t - windowS;
  const recent = samples.filter((x) => x.t > from);
  if (recent.length < 3) return null;
  const mean = (f: (x: TrendSample) => number) => recent.reduce((a, x) => a + f(x), 0) / recent.length;
  return { speedKmh: mean((x) => x.speedKmh), throughputPerMin: mean((x) => x.throughputPerMin), queueM: mean((x) => x.queueM), co2KgPerMin: mean((x) => x.co2KgPerMin) };
}

type Sampled = {
  readonly time: number;
  metrics(): { avgSpeedKmh: number; throughputPerMin: number; longestQueueM: number; co2RatePerMin: number };
};

export class TrendLog {
  private run: object | null = null;
  private list: TrendSample[] = [];
  private next = 0;

  /** The samples so far, oldest first. */
  get samples(): readonly TrendSample[] {
    return this.list;
  }

  /** The samples of `sim`'s run: none when the log still holds an older run's (rebuilt while paused). */
  samplesOf(sim: object | null): readonly TrendSample[] {
    return sim !== null && sim === this.run ? this.list : [];
  }

  /** Sample `sim` if a sample is due. Cheap when none is: one comparison. Returns true when it took one. */
  record(sim: Sampled, warmupS: number): boolean {
    if (sim !== this.run) {
      this.run = sim;
      this.list = [];
      this.next = 0;
    }
    const t = sim.time - warmupS;
    if (t < this.next) return false;
    const m = sim.metrics();
    this.list.push({ t, speedKmh: m.avgSpeedKmh, throughputPerMin: m.throughputPerMin, queueM: m.longestQueueM, co2KgPerMin: m.co2RatePerMin });
    if (this.list.length > TREND_MAX_SAMPLES) this.list.splice(0, this.list.length - TREND_MAX_SAMPLES);
    // The next one on the grid, not TREND_STEP_S after this one: a late sample (a skip's slice) does not shift the rest.
    this.next = (Math.floor(t / TREND_STEP_S) + 1) * TREND_STEP_S;
    return true;
  }
}
