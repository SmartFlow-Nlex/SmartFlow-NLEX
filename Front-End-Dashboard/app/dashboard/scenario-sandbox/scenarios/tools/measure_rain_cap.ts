/**
 * What rain does to the engine's capacity and average speed — the measurement quoted in ASSUMPTIONS.RAIN_EFFECT's
 * evidence. Read-only use of simulation.ts; nothing is written anywhere.
 *
 *   cd Back-End
 *   ./node_modules/.bin/tsx ../Front-End-Dashboard/app/dashboard/scenario-sandbox/scenarios/tools/measure_rain_cap.ts
 *
 * Method: 4 lanes, 1 km, no ramps, 60 s warm-up, 1,500 simulated seconds, statistics averaged over samples taken
 * every 10 s from t = 900 s, three seeds. Demand is per lane: 1,000 and 1,500 veh/h (moderate and busy, not
 * saturated, so rain acts on speed) and 3,000 veh/h (saturating, so admitted flow is the road's capacity as the
 * engine sees it). The paper's average speeds are over all the flows it observed, so neither fixed demand is the
 * same thing; the busier one sits closer to the road's rain capacity and loses more speed. Each rain
 * intensity is applied as the engine applies it since 19 Nov 2026 — Interventions.weather, a factor on every driver's
 * desired speed and one on every following headway (RAIN_EFFECT) — and compared with dry road and with the paper.
 * Until then rain was a speed cap over the whole road (RAIN_SPEED_KMH); those caps are measured too, for reference:
 * they took about 2% off capacity against the paper's 3.7-17.4%. Takes a few minutes.
 *
 * `measureRain` is also what tools/calibrate_rain_headway.ts searches with.
 */
import { pathToFileURL } from "node:url";
import { TrafficSim, type Weather } from "../../simulation";
import { ASSUMPTIONS, NLEX_RAIN_CAPACITY_PCU_H, NLEX_RAIN_AVG_SPEED_KMH, RAIN_INTENSITIES, type RainIntensity } from "../assumptions";

const DT = 0.05;
const RUN_S = 1500;
const SAMPLE_FROM_S = 900;
const SEEDS = [11, 23, 37];
const LANES = 4;
const LENGTH_M = 1000;

export type RainReading = { readonly flowPerLane: number; readonly speedKmh: number };
/** Rain as the engine takes it (weather), or the old whole-road cap (capKmh), or neither. */
export type RainCase = { readonly weather?: Weather | null; readonly capKmh?: number | null };

/** Admitted flow per lane (veh/h) and mean speed (km/h) at a per-lane demand, averaged over the seeds. */
export function measureRain(perLaneDemand: number, rain: RainCase = {}, seeds: readonly number[] = SEEDS): RainReading {
  let flow = 0;
  let speed = 0;
  for (const seed of seeds) {
    const inflow = perLaneDemand * LANES;
    const sim = new TrafficSim(
      { length: LENGTH_M, laneCount: LANES, inflowVehPerHour: inflow, seed, warmupS: 60 },
      {
        ...(rain.capKmh != null ? { speedLimitKmh: rain.capKmh, speedZone: [0, LENGTH_M] as [number, number] } : {}),
        weather: rain.weather ?? null,
      },
    );
    let next = SAMPLE_FROM_S;
    let unmet = 0;
    let speeds = 0;
    let n = 0;
    for (let i = 0; i < Math.round(RUN_S / DT); i++) {
      sim.step(DT);
      if (sim.time >= next) {
        const m = sim.metrics();
        unmet += m.unmetVehPerHour;
        speeds += m.avgSpeedKmh;
        n++;
        next += 10;
      }
    }
    flow += (inflow - unmet / n) / LANES;
    speed += speeds / n;
  }
  return { flowPerLane: flow / seeds.length, speedKmh: speed / seeds.length };
}

/** The paper's change against clear weather, %, for capacity and for average speed (Mejia & Sigua 2018). */
export function paperDrop(intensity: RainIntensity): { readonly capacityPct: number; readonly speedPct: number } {
  const c = NLEX_RAIN_CAPACITY_PCU_H;
  const s = NLEX_RAIN_AVG_SPEED_KMH;
  return { capacityPct: ((c[intensity] - c.clear) / c.clear) * 100, speedPct: ((s[intensity] - s.clear) / s.clear) * 100 };
}

const pct = (a: number, b: number): number => ((a - b) / b) * 100;

function main(): void {
  const effect = ASSUMPTIONS.RAIN_EFFECT.value;
  const caps = ASSUMPTIONS.RAIN_SPEED_KMH.value;
  const dryCap = measureRain(3000);
  const drySpeed = measureRain(1500);
  const dryMid = measureRain(1000);
  console.log(`dry: capacity ${dryCap.flowPerLane.toFixed(0)} veh/h/lane, speed ${dryMid.speedKmh.toFixed(1)} km/h at 1,000 veh/h/lane and ${drySpeed.speedKmh.toFixed(1)} at 1,500`);
  console.log("intensity | v0 x | T x | capacity vs dry (paper) | avg speed vs dry at 1,000 / 1,500 veh/h/lane (paper) | old cap: capacity, speed at 1,500");
  for (const i of RAIN_INTENSITIES) {
    const w = effect[i];
    const cap = measureRain(3000, { weather: w });
    const spd = measureRain(1500, { weather: w });
    const mid = measureRain(1000, { weather: w });
    const oldCap = measureRain(3000, { capKmh: caps[i] });
    const oldSpd = measureRain(1500, { capKmh: caps[i] });
    const p = paperDrop(i);
    console.log(
      `${i.padEnd(9)} | ${w.v0Factor.toFixed(4)} | ${w.headwayFactor.toFixed(3)} | ${pct(cap.flowPerLane, dryCap.flowPerLane).toFixed(1)}% (${p.capacityPct.toFixed(1)}%) | ` +
        `${pct(mid.speedKmh, dryMid.speedKmh).toFixed(1)}% / ${pct(spd.speedKmh, drySpeed.speedKmh).toFixed(1)}% (${p.speedPct.toFixed(1)}%) | ${caps[i]} km/h: ${pct(oldCap.flowPerLane, dryCap.flowPerLane).toFixed(1)}%, ${pct(oldSpd.speedKmh, drySpeed.speedKmh).toFixed(1)}%`,
    );
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
