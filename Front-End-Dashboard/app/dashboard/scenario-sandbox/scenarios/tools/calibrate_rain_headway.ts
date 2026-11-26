/**
 * Finds the rain headway factors in ASSUMPTIONS.RAIN_EFFECT: for each intensity, the factor on every driver's time
 * headway that, with the free-flow ratio already on desired speed, makes the engine lose the share of capacity the
 * NLEx study measured (Mejia & Sigua 2018: -3.67% light, -7.6% moderate, -17.44% heavy). Read-only use of
 * simulation.ts; prints the factors, writes nothing.
 *
 *   cd Back-End
 *   ./node_modules/.bin/tsx ../Front-End-Dashboard/app/dashboard/scenario-sandbox/scenarios/tools/calibrate_rain_headway.ts [light|moderate|heavy]
 *
 * Capacity is measured exactly as tools/measure_rain_cap.ts measures it (admitted flow at 3,000 veh/h/lane of demand,
 * 4 lanes, 1 km, three seeds, 1,500 s, sampled from 900 s), so the search and the check are the same instrument.
 * Bisection on the factor between 1 and 1.8, eight steps (to about 0.003), stopping early once within 0.25 percentage
 * points. About two minutes per intensity; pass one intensity to run only that one.
 */
import { NLEX_RAIN_FREE_FLOW_KMH, RAIN_INTENSITIES, type RainIntensity } from "../assumptions";
import { measureRain, paperDrop } from "./measure_rain_cap";

const only = process.argv[2] as RainIntensity | undefined;
const dry = measureRain(3000).flowPerLane;
console.log(`dry capacity ${dry.toFixed(1)} veh/h/lane`);
for (const i of RAIN_INTENSITIES) {
  if (only && only !== i) continue;
  const v0Factor = NLEX_RAIN_FREE_FLOW_KMH[i] / NLEX_RAIN_FREE_FLOW_KMH.clear;
  const target = paperDrop(i).capacityPct;
  let lo = 1;
  let hi = 1.8;
  let best = { f: 1, drop: 0 };
  for (let k = 0; k < 8; k++) {
    const f = (lo + hi) / 2;
    const drop = ((measureRain(3000, { weather: { v0Factor, headwayFactor: f } }).flowPerLane - dry) / dry) * 100;
    if (Math.abs(drop - target) < Math.abs(best.drop - target) || k === 0) best = { f, drop };
    console.log(`  ${i}: T x ${f.toFixed(4)} -> capacity ${drop.toFixed(2)}% (target ${target.toFixed(2)}%)`);
    if (Math.abs(drop - target) < 0.25) break;
    if (drop > target) lo = f; // not enough loss yet: lengthen the headway
    else hi = f;
  }
  console.log(`${i}: v0 x ${v0Factor.toFixed(4)}, headway x ${best.f.toFixed(3)} -> ${best.drop.toFixed(2)}% (paper ${target.toFixed(2)}%)`);
}
