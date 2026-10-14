/* Is the wreck made of the cars that were driving there?
 *
 * The scene art used to DRAW crashed cars while addIncident deleted whatever
 * was on the spot, so the wreck was never the traffic — it was a picture over
 * a gap. Worse, a collision is a `closure` effect in the adapter and never
 * called addIncident at all, so once the drawing was removed collisions had
 * no vehicles in them whatsoever.
 *
 * This checks the property that matters: after a crash, the wrecked vehicles
 * are agents that existed BEFORE it, and the responders arrive by driving.
 *
 * Since 2026-10-06 a crash is not instant: crashAt picks the vehicles out of
 * the traffic approaching the point and they are seen to crash there over the
 * next few seconds (the first stops, the next fails to). So the scene is given
 * a minute to come together before it is counted, and the responders, which
 * come up the hard shoulder, are looked for there too.
 */
import { TrafficSim } from "../../../../Front-End-Dashboard/app/dashboard/scenario-sandbox/simulation";

const DT = 0.05;

function run(want: number) {
  const sim: any = new TrafficSim(
    { length: 1000, laneCount: 4, inflowVehPerHour: 4200, seed: 4242, warmupS: 0 },
    {
      closedLanes: [false, false, false, false],
      closurePoint: 600, closureEnd: 800,
      incidents: [], speedLimitKmh: null, speedZone: [0, 0],
    } as any,
  );

  for (let i = 0; i < 90 / DT; i++) sim.step(DT);

  // Who is on the road, and where, immediately before the crash.
  const before = new Map<number, number>();
  for (const v of sim.vehicles) before.set(v.id, v.x);

  const t0 = sim.time;
  sim.crashAt(2, 700, want);
  const everyone = () => [...sim.vehicles, ...sim.shoulder];

  // The scene comes together out of the traffic, then the response comes in.
  const seen = new Set<string>();
  const arrivedAt = new Map<string, number>();
  const wreckIds = new Set<number>();
  for (let i = 0; i < 180 / DT; i++) {
    sim.step(DT);
    for (const v of everyone()) {
      if (v.role === "wreck") wreckIds.add(v.id);
      if (v.role !== "responder") continue;
      seen.add(v.responderKind);
      if (v.stillSince != null && !arrivedAt.has(v.responderKind)) arrivedAt.set(v.responderKind, sim.time - t0);
    }
  }
  const wrecks = [...wreckIds];
  const fromTraffic = wrecks.filter((id) => before.has(id)).length;

  const stillWrecked = everyone().filter((v: any) => v.role === "wreck").length;
  return { want, wrecks: wrecks.length, fromTraffic, stillWrecked, seen: [...seen].sort(), arrivedAt };
}

/* Does the scene END? releaseScene should put everything back in motion so it
   leaves by driving off, rather than the wreck blocking its lane forever. */
function runLifecycle() {
  const sim: any = new TrafficSim(
    { length: 1000, laneCount: 4, inflowVehPerHour: 4200, seed: 99, warmupS: 0 },
    { closedLanes: [false, false, false, false], closurePoint: 600, closureEnd: 800,
      incidents: [], speedLimitKmh: null, speedZone: [0, 0] } as any,
  );
  for (let i = 0; i < 90 / DT; i++) sim.step(DT);
  sim.crashAt(2, 700, 2, "evt-1");
  for (let i = 0; i < 90 / DT; i++) sim.step(DT);
  const all = () => [...sim.vehicles, ...sim.shoulder];
  const atPeak = all().filter((v: any) => v.sceneKey === "evt-1").length;
  sim.releaseScene("evt-1");
  for (let i = 0; i < 180 / DT; i++) sim.step(DT);
  const left = all().filter((v: any) => v.sceneKey === "evt-1").length;
  const stuck = all().filter((v: any) => v.role === "wreck" && v.v === 0).length;
  console.log(`
LIFECYCLE  scene agents at peak: ${atPeak}   still present 3 min after release: ${left}   wrecks still frozen: ${stuck}`);
  console.log(`           ${left === 0 && stuck === 0 ? "ok - the scene drove away and the lane is clear" : "<-- SOMETHING IS STILL BLOCKING"}`);
}

for (const want of [1, 2, 4]) {
  const r = run(want);
  const ok = r.fromTraffic === r.wrecks && r.wrecks > 0;
  console.log(
    `crash of ${want}: ${r.wrecks} wrecked, ${r.fromTraffic} of them were ALREADY ON THE ROAD` +
      `  ${ok ? "ok" : "<-- SYNTHESISED"}`,
  );
  console.log(
    `            responders that drove in: ${r.seen.join(", ") || "none"}` +
      `   parked: ${[...r.arrivedAt.entries()].map(([k, t]) => `${k}@${t.toFixed(0)}s`).join(", ") || "none"}`,
  );
  console.log(`            wrecks still there 3 min on (no event to end it, so they should be): ${r.stillWrecked}`);
}
runLifecycle();
