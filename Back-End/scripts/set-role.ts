/**
 * Assign a dashboard role on the server (security audit finding #1, 9 Nov 2026).
 *
 *   npx tsx scripts/set-role.ts                      list every account and its role
 *   npx tsx scripts/set-role.ts <email> <role>       role: data-analyst | tcc-operator | incident-operator | pending
 *
 * An account appears in the list the first time it signs in. New accounts start as "pending" (no access).
 */
import { db } from "../src/config/db";
import { listRoles, setRole, ROLES, PENDING_ROLE } from "../src/lib/user-roles";
import os from "os";

(async () => {
  const [email, role] = process.argv.slice(2);
  if (!email) {
    for (const r of await listRoles()) console.log(`${(r.email ?? "?").padEnd(36)} ${r.role.padEnd(18)} ${r.source.padEnd(10)} ${r.granted_at}`);
  } else if (!role || ![...ROLES, PENDING_ROLE].includes(role as never)) {
    console.log(`Role must be one of: ${[...ROLES, PENDING_ROLE].join(", ")}`);
    process.exitCode = 1;
  } else {
    const n = await setRole(email, role, `script:${os.userInfo().username}`);
    console.log(n ? `${email} is now ${role}.` : `${email} has not signed in yet, so it is not in the list. Ask them to sign in once, then run this again.`);
    if (!n) process.exitCode = 1;
  }
  await db?.end();
})();
