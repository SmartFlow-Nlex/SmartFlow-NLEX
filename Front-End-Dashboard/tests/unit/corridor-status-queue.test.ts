/* TC-UT-04  Overview / Longest queue, not summed
 * lib/corridor-status.ts: corridorStatusFromFeed(fc) -> ExitStatus[] — the
 * derivation behind the Overview hot list and the exit detail rail
 * (longestQueueMeters). Three overlapping Waze jam reports are laid on a real
 * stretch of the corridor geometry so the corridor guard keeps them. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { corridorStatusFromFeed } from "../../lib/corridor-status.ts";
import geometry from "../../components/maps/nlex-geometry.json" with { type: "json" };

const coords = (geometry as unknown as { coordinates: number[][] }).coordinates;
const k = Math.floor(coords.length / 2);
const stretch = coords.slice(k, k + 4);

const jam = (lengthM: number) => ({
  type: "Feature",
  properties: { feature_type: "jam", street: "NLEX", level: 2, speed: 25, length_m: lengthM, delay_seconds: 120, observed_at: "2026-10-24T08:00:00Z" },
  geometry: { type: "LineString", coordinates: stretch },
});

test("TC-UT-04: overlapping reports 300 m, 750 m, 450 m -> queue 750 m, not 1,500 m", () => {
  const rows = corridorStatusFromFeed({ features: [jam(300), jam(750), jam(450)] as any });
  console.log(`  rows=${JSON.stringify(rows.map((r) => ({ exit: r.exit, dir: r.direction, jamCount: r.jamCount, longestQueueMeters: r.longestQueueMeters })))}`);
  assert.equal(rows.length, 1, "all three reports belong to one exit-direction");
  assert.equal(rows[0].jamCount, 3);
  assert.equal(rows[0].longestQueueMeters, 750);
  assert.notEqual(rows[0].longestQueueMeters, 1500);
});
