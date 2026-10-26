/* TC-UT-01  Roles and Access / Role-to-page access rule
 * lib/auth-access.ts: canAccess(role, pathname), isRole, FALLBACK_ROLE.
 * A missing or malformed role is resolved exactly as app/dashboard/layout.tsx
 * does it: isRole(metadata?.role) ? metadata.role : FALLBACK_ROLE. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccess, isRole, FALLBACK_ROLE, type Role } from "../../lib/auth-access.ts";

const resolve = (raw: unknown): Role => (isRole(raw) ? raw : FALLBACK_ROLE);

const cases: Array<[string, unknown, string, boolean]> = [
  ["a", "data-analyst", "/dashboard/audit-log", true],
  ["b", "tcc-operator", "/dashboard/audit-log", false],
  ["c", "tcc-operator", "/dashboard/scenario-sandbox", true],
  ["d", "incident-operator", "/dashboard/scenario-sandbox", false],
  ["e", undefined, "/dashboard/traffic", true],
  ["f", undefined, "/dashboard/sustainability", false],
  ["g", "Admin123", "/dashboard/data-management", false],
];

for (const [id, raw, path, expected] of cases) {
  test(`TC-UT-01${id}: role=${String(raw)} ${path} -> ${expected ? "allowed" : "denied"}`, () => {
    assert.equal(canAccess(resolve(raw), path), expected);
  });
}

test("TC-UT-01: missing or malformed role is treated as Incident operator", () => {
  assert.equal(FALLBACK_ROLE, "incident-operator");
  assert.equal(resolve(undefined), "incident-operator");
  assert.equal(resolve("Admin123"), "incident-operator");
});
