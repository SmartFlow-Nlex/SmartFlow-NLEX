/* A scenario event AT a plaza: is it made of the vehicles that were there, does
 * the booth shut, do the vehicles behind squeeze across, does the response drive
 * in, and does it all clear afterwards?
 *
 *   ./node_modules/.bin/tsx ../smartflow_scripts/4_studies_audits/sandbox_validation/diagnostics/facilityscene.ts
 */
import { TrafficSim } from "../../../../Front-End-Dashboard/app/dashboard/scenario-sandbox/simulation";
import { boothDwellFor, DRAW_W_FRAC, SERVICE_DWELL_S, type FacilitySpec } from "../../../../Front-End-Dashboard/app/dashboard/scenario-sandbox/facilities";

const DT = 0.05;
const ins = (P: any, Q: any, clear: number) => {
  let n = 0;
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    const u = P.tu + (P.u - P.tu) * t, w = P.tw + (P.w - P.tw) * t;
    const lo = Math.min(Q.tu, Q.u), hi = Math.max(Q.tu, Q.u);
    if (u < lo || u > hi || hi - lo < 1e-6) continue;
    const qw = Q.tw + (Q.w - Q.tw) * ((u - Q.tu) / (Q.u - Q.tu));
    if (Math.abs(w - qw) < clear) n++;
  }
  return n;
};

function scene(label: string, spec: FacilitySpec, inflow: number, site: { kind: "booth" | "pump" | "approach"; stations: number[] }, family: string) {
  const sim: any = new TrafficSim(
    { length: 1300, laneCount: 4, inflowVehPerHour: inflow, seed: 21, warmupS: 0, facilities: [spec] },
    { closedLanes: [false, false, false, false], closurePoint: 1300, closureEnd: 1300, incidents: [], speedLimitKmh: null, speedZone: [0, 0] } as any,
  );
  const f = sim.fac.list[0];
  for (let i = 0; i < 240 / DT; i++) sim.step(DT);
  /* Since 2026-10-06 nothing is put down at the booth: the vehicles there are brought to rest (braking first if
     moving), and an empty lane waits for the next one to drive up. So a scene vehicle is checked to have been SEEN
     driving — in the plaza or on the road — before it became the scene, over the whole run. */
  const seen = new Set<number>([...f.agents, ...sim.vehicles].map((a: any) => a.id));
  const ok = sim.facilityEventStart("evt-1", { facilityId: spec.id, ...site }, family);
  const wreckIds = new Set<number>();
  let fromTraffic = 0;
  let restedAt: number | null = null;
  let maxQueued = 0, overlapTicks = 0, ticks = 0, diverted = 0;
  const responderArrived = new Map<string, number>();
  const pathAt = new Map<number, number>();
  for (const a of f.agents) pathAt.set(a.id, a.fac.path);
  for (let i = 0; i < 300 / DT; i++) {
    sim.step(DT);
    for (const a of [...f.agents, ...sim.vehicles]) {
      if (a.sceneKey === "evt-1" && a.role === "wreck" && !wreckIds.has(a.id)) {
        wreckIds.add(a.id);
        if (seen.has(a.id)) fromTraffic++;
        if (restedAt === null) restedAt = sim.time - 240;
      }
      seen.add(a.id);
    }
    if (i % 4) continue;
    ticks++;
    const st = sim.facilityStats()[0];
    maxQueued = Math.max(maxQueued, st.queued);
    for (const a of f.agents) {
      if (a.role === "responder" && a.fac.stuck && !responderArrived.has(a.responderKind)) responderArrived.set(a.responderKind, sim.time - 240);
      const prev = pathAt.get(a.id);
      if (prev != null && prev !== a.fac.path && f.paths[prev].role === "booth" && f.paths[a.fac.path].role === "booth") diverted++;
      pathAt.set(a.id, a.fac.path);
    }
    const ag = f.agents;
    let hit = false;
    for (let x = 0; x < ag.length && !hit; x++) for (let y = x + 1; y < ag.length; y++) {
      const A = ag[x], B = ag[y];
      if (A.fac.path === B.fac.path ? Math.min(A.fac.s, B.fac.s) - Math.max(A.fac.s - A.length, B.fac.s - B.length) > 0.05 : ins(A.fac, B.fac, DRAW_W_FRAC * f.pitch) > 0) { hit = true; break; }
    }
    if (hit) overlapTicks++;
  }
  const during = sim.facilityStats()[0];
  sim.facilityEventEnd("evt-1");
  for (let i = 0; i < 300 / DT; i++) sim.step(DT);
  const left = f.agents.filter((a: any) => a.sceneKey === "evt-1").length + sim.vehicles.filter((v: any) => v.sceneKey === "evt-1" && v.role === "wreck" && !v.departing).length;
  const after = sim.facilityStats()[0];
  console.log(`\n${label}: ${family} at ${site.kind} ${site.stations.join(",")}`);
  const n = wreckIds.size;
  console.log(`   started ${ok}; scene vehicles ${n}, ${fromTraffic} of them seen driving first${restedAt !== null ? `, at rest +${restedAt.toFixed(0)}s` : ""}${n && fromTraffic === n ? "  ok" : n ? "  <-- ONE APPEARED" : family === "scheduled_roadworks" ? "  ok (works: no vehicle of its own)" : "  <-- NOBODY CAME"}`);
  console.log(`   during: open ${during.openStations}/${during.stations}, max queued ${maxQueued}, squeezed across ${diverted}, responders parked: ${[...responderArrived].map(([k, t]) => `${k} +${t.toFixed(0)}s`).join(", ") || "none"}, overlap ticks ${((100 * overlapTicks) / ticks).toFixed(2)}%`);
  console.log(`   5 min after release: scene vehicles still there ${left}, open ${after.openStations}/${after.stations}, queued ${after.queued}  ${left === 0 && after.openStations === after.stations ? "ok" : "<-- NOT CLEARED"}`);
}

const pay = boothDwellFor(350);
scene("EXIT PLAZA", { id: "x", kind: "exit_ramp", name: "x", x: 600, booths: 3, serviceSec: pay, turnFraction: 0.12, tollMode: "pay" }, 4200, { kind: "booth", stations: [1] }, "minor_collision");
scene("EXIT PLAZA", { id: "x", kind: "exit_ramp", name: "x", x: 600, booths: 3, serviceSec: pay, turnFraction: 0.12, tollMode: "pay" }, 4200, { kind: "approach", stations: [] }, "self_accident");
scene("ENTRY PLAZA", { id: "e", kind: "entry_ramp", name: "e", x: 200, booths: 3, serviceSec: pay, arrivalsVehPerHour: 800, tollMode: "pay" }, 3000, { kind: "booth", stations: [0, 1] }, "breakdown_in_lane");
scene("BARRIER", { id: "b", kind: "barrier", name: "b", x: 600, booths: 12, serviceSec: pay, tollMode: "pay" }, 3200, { kind: "booth", stations: [4] }, "multi_vehicle_collision");
scene("SERVICE AREA", { id: "s", kind: "service_area", name: "s", x: 400, booths: 4, serviceSec: SERVICE_DWELL_S, turnFraction: 0.02 }, 4200, { kind: "pump", stations: [2] }, "scheduled_roadworks");
