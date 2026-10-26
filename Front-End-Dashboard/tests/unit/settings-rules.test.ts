/* TC-UT-22  Settings / Password and inactivity rules
 * Password: app/dashboard/settings/page.tsx savePassword() checks
 *   `pw.length < 8` then `pw !== pw2` before calling Supabase (inline; the two
 *   checks are extracted). Supabase's own server-side policy is not exercised.
 * Inactivity: lib/account-device.ts — IDLE_CHOICES (the only values the page
 *   offers) and idleMinutesOf(metadata), which falls back to
 *   DEFAULT_IDLE_MINUTES for anything outside the choices. A value outside
 *   the list therefore cannot be chosen and is not honoured if stored. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE_CHOICES, DEFAULT_IDLE_MINUTES, idleMinutesOf } from "../../lib/account-device.ts";
import { readSource, between, evaluate } from "../../../Back-End/tests/support/source-extract.ts";

const src = readSource("Front-End-Dashboard/app/dashboard/settings/page.tsx");
const checks = between(src, "if (pw.length < 8)", "setSavingPw(true);", "async function savePassword");
const { pwError } = evaluate<any>([
  `const pwError = (pw: string, pw2: string) => { let msg = ""; const setPwError = (m: string) => { msg = m; }; (() => { ${checks} })(); return msg; };`,
], ["pwError"]);

test('TC-UT-22a: password "abcdefg" (7) is rejected', () => {
  const msg = pwError("abcdefg", "abcdefg");
  console.log(`  error="${msg}"`);
  assert.equal(msg, "Use at least 8 characters.");
});

test('TC-UT-22b: password "abcdefgh" (8) is accepted', () => {
  const msg = pwError("abcdefgh", "abcdefgh");
  console.log(`  error="${msg}"`);
  assert.equal(msg, "");
});

for (const [id, minutes] of [["c", 4], ["d", 61]] as const) {
  test(`TC-UT-22${id}: idle time ${minutes} is rejected`, () => {
    const effective = idleMinutesOf({ idle_minutes: minutes });
    console.log(`  offered=${JSON.stringify(IDLE_CHOICES)} stored ${minutes} -> effective ${effective}`);
    assert.equal((IDLE_CHOICES as readonly number[]).includes(minutes), false);
    assert.notEqual(effective, minutes);
  });
}

test("TC-UT-22e: idle time not set -> 15 minutes", () => {
  console.log(`  effective=${idleMinutesOf({})} default=${DEFAULT_IDLE_MINUTES}`);
  assert.equal(idleMinutesOf({}), 15);
  assert.equal(idleMinutesOf(null), 15);
});
