/* TC-UT-14  Incidents / Clearance protocol input validation
 * src/validators/incident.validator.ts: ClearanceProtocolQuerySchema
 * (the query schema for GET /api/incident/clearance-protocol). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ClearanceProtocolQuerySchema } from "../../src/validators/incident.validator.js";

test("TC-UT-14a: maxUnits 7 is rejected", () => {
  assert.equal(ClearanceProtocolQuerySchema.safeParse({ maxUnits: "7" }).success, false);
});

test("TC-UT-14b: maxUnits 0 is rejected", () => {
  assert.equal(ClearanceProtocolQuerySchema.safeParse({ maxUnits: "0" }).success, false);
});

test("TC-UT-14c: unitEffect 1.2 is rejected", () => {
  assert.equal(ClearanceProtocolQuerySchema.safeParse({ unitEffect: "1.2" }).success, false);
});

test("TC-UT-14d: no severity given defaults to injury", () => {
  const r = ClearanceProtocolQuerySchema.parse({});
  assert.equal(r.severity, "injury");
});

test("TC-UT-14e: no maxUnits/unitCostPerHour/deltaResponseMin defaults to 4 / 1500 / 15", () => {
  const r = ClearanceProtocolQuerySchema.parse({});
  assert.equal(r.maxUnits, 4);
  assert.equal(r.unitCostPerHour, 1500);
  assert.equal(r.deltaResponseMin, 15);
});
