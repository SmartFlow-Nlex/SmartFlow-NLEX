/**
 * Authorization check against a running server (24 Nov 2026, security task S5).
 *
 *   npx tsx scripts/authz-check.ts [baseUrl] [--only=A,B,C,P,D,E]     default http://localhost:4000, every group
 *
 * The adviser's questions: can a regular user reach admin-only features, can one user reach another's data, and can
 * permissions be bypassed with direct API requests? Hiding a button is not protection, so this asks the API itself.
 *
 * Without any accounts it checks:
 *   A. every protected route, with no token, answers 401 (and carries no data);
 *   B. a garbage token, an expired-looking JWT, an alg "none" JWT, a JWT signed with a made-up key, and a token sent
 *      in the wrong header (x-access-token, a cookie, ?access_token=, no "Bearer" scheme) all answer 401;
 *   C. spoofed identity, role, client-address and URL-rewrite headers grant nothing; path spellings (case, trailing
 *      slash, encoded letters, HEAD) do not get past the guard;
 *   P. the public status routes say no more than they should.
 *
 * With Supabase access tokens for test accounts in the environment it also checks, per role:
 *   AUTHZ_TOKEN_DATA_ANALYST, AUTHZ_TOKEN_TCC_OPERATOR, AUTHZ_TOKEN_INCIDENT_OPERATOR, AUTHZ_TOKEN_PENDING
 *     (the role names of src/lib/user-roles.ts; a token must be from a session that passed the authenticator code,
 *      i.e. its JWT says "aal": "aal2"), and optionally AUTHZ_TOKEN_AAL1 (a password-only session of any account)
 *   D. the server reads each token as the role its variable names (GET /api/auth/role);
 *      each role gets 2xx on every GET route its role allows and 403 on every route it does not;
 *      a role header sent beside a lower role's token changes nothing;
 *      cross-user: token A naming user B (query, header) still gets A's own answer, and a non-analyst asking the audit
 *      log for user B is refused. (No route takes a user id from the request -- see the route matrix below.)
 *   E. an AAL1 (password-only) token is refused with 401 mfa_required, with or without a forged x-device-trust pass.
 *
 * What it never does: write. Allowed-route checks use GET only, and GET /api/audit-log/export is not called with an
 * allowed token (it writes an "audit.exported" entry). Write routes are only ever sent by callers that must be
 * refused, and always with an empty or malformed body (maintenance ids that are not UUIDs, upload id 0, ?mode=check),
 * so even a broken guard would have nothing valid to write; in every one of these routes authenticateToken and
 * authorizeRoles run before the handler (src/routes/*.ts). The AI POST routes are the one exception, by design: an
 * allowed role sends them an empty body and must get 400 from the zod schema, which runs before any provider call
 * (controllers/ai-insight.controller.ts, sandbox-command.controller.ts), so no token is spent and nothing is stored.
 * Set AUTHZ_PROBE_WRITES=1 to also send allowed roles the malformed write requests (expected 400/404, never 2xx).
 *
 * Prints a PASS/FAIL table and exits 1 on any FAIL. Requests from this PC skip the rate limits
 * (middleware/client-ip.ts isLocalRequest); against a hosted server it paces itself.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import "dotenv/config";

const args = process.argv.slice(2);
const BASE = (args.find((a) => !a.startsWith("--")) ?? process.env.AUTHZ_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
/** --only=B,C runs just those groups (A no token, B bad token, C spoofed headers and paths, P public, D roles, E AAL1). */
const ONLY = new Set((args.find((a) => a.startsWith("--only="))?.slice(7) ?? "A,B,C,P,D,E").toUpperCase().split(","));
const PACE_MS = /localhost|127\.0\.0\.1/.test(BASE) ? 40 : 400;
const PROBE_WRITES = process.env.AUTHZ_PROBE_WRITES === "1";

type Role = "data-analyst" | "tcc-operator" | "incident-operator";
const ALL: Role[] = ["data-analyst", "tcc-operator", "incident-operator"];
const DA: Role[] = ["data-analyst"];
const OPS: Role[] = ["data-analyst", "tcc-operator"];

/** One protected route, as src/routes/*.ts mounts it. */
type Route = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  roles: Role[];
  /** True when calling it as an allowed role could change something (or send mail): never called that way. */
  writes: boolean;
  /** For allowed roles on a non-writing POST: the status that proves the guard let it through (zod's 400). */
  allowedStatus?: number[];
  body?: unknown;
};

const NOT_A_UUID = "authz-check-not-a-uuid";
const ROUTES: Route[] = [
  // auth.routes.ts
  { method: "POST", path: "/api/auth/trusted-device", roles: ALL, writes: true, body: {} },
  { method: "POST", path: "/api/auth/trusted-device/check", roles: ALL, writes: true, body: {} },
  { method: "POST", path: "/api/auth/password-changed", roles: ALL, writes: true, body: {} },
  // ai-insight.routes.ts: any signed-in role; an empty body is refused by zod before the provider is called.
  ...[
    "model-narrative", "congestion-narrative", "event-surge-narrative", "fleet-mix-narrative", "ranking-narrative",
    "explain", "incident-models-narrative", "clearance-narrative", "breakdown-response-narrative",
    "corridor-risk-narrative", "high-incident-day-narrative",
  ].map((p): Route => ({ method: "POST", path: `/api/ai-insight/${p}`, roles: ALL, writes: false, allowedStatus: [400], body: {} })),
  // ai-sandbox.routes.ts
  { method: "POST", path: "/api/ai-sandbox/command", roles: OPS, writes: false, allowedStatus: [400], body: {} },
  // audit-log.routes.ts
  { method: "GET", path: "/api/audit-log/list?limit=1", roles: DA, writes: false },
  { method: "GET", path: "/api/audit-log/summary?days=1", roles: DA, writes: false },
  { method: "GET", path: "/api/audit-log/export?limit=1", roles: DA, writes: true }, // writes an audit.exported entry
  /* data-management.routes.ts is not mounted in routes/index.ts (GET /api/data-management answers 404 for everyone;
     the Data Management page reads /api/upload/*), so it is not listed. Mount it and add it here together. */
  // emissions.routes.ts (the protected half)
  { method: "GET", path: "/api/emissions/index", roles: DA, writes: false },
  { method: "GET", path: "/api/emissions/peak-penalty", roles: DA, writes: false },
  { method: "GET", path: "/api/emissions/resilience", roles: DA, writes: false },
  // maintenance.routes.ts (the write half; ids are not UUIDs, so the handler answers 404 before the database)
  { method: "POST", path: "/api/maintenance/schedule", roles: OPS, writes: true, body: {} },
  { method: "PUT", path: `/api/maintenance/${NOT_A_UUID}`, roles: OPS, writes: true, body: {} },
  { method: "PATCH", path: `/api/maintenance/${NOT_A_UUID}/status`, roles: OPS, writes: true, body: {} },
  { method: "DELETE", path: `/api/maintenance/${NOT_A_UUID}`, roles: OPS, writes: true },
  // mobile-config.routes.ts
  { method: "PUT", path: "/api/mobile-config", roles: OPS, writes: true, body: {} },
  // upload.routes.ts (id 0 is refused by the handler before the database; mode=check rolls back anyway)
  { method: "POST", path: "/api/upload/file?mode=check", roles: DA, writes: true },
  { method: "POST", path: "/api/upload/0/undo?mode=check", roles: DA, writes: true },
  { method: "GET", path: "/api/upload/history?limit=1", roles: DA, writes: false },
  { method: "GET", path: "/api/upload/formats", roles: DA, writes: false },
  { method: "GET", path: "/api/upload/retraining?limit=1", roles: DA, writes: false },
];

/* ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

type Reply = { status: number; body: any; text: string };
let sent = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Reply> {
  await sleep(PACE_MS);
  sent++;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(BASE + path, {
        method,
        redirect: "manual",
        headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60_000),
      });
      const text = method === "HEAD" ? "" : await r.text();
      if (r.status === 429 && attempt < 2) {
        // Rate limited: wait and try once or twice more rather than hammer.
        await sleep(15_000 * (attempt + 1));
        continue;
      }
      let parsed: any = text;
      try { parsed = JSON.parse(text); } catch { /* not JSON */ }
      return { status: r.status, body: parsed, text };
    } catch (e) {
      // No answer: the dev server may be restarting (tsx watch). Wait and retry a few times before calling it.
      if (attempt < 4) { await sleep(3_000 * (attempt + 1)); continue; }
      return { status: 0, body: null, text: e instanceof Error ? e.message : String(e) };
    }
  }
}

/* ── Forged tokens ────────────────────────────────────────────────────────────────────────────────────────────── */

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const claims = (extra: Record<string, unknown> = {}) => ({
  sub: randomUUID(), aud: "authenticated", role: "authenticated", aal: "aal2", email: "authz-check@example.invalid",
  iss: "https://example.supabase.co/auth/v1", iat: now - 60, exp: now + 3600,
  app_metadata: { role: "data-analyst" }, user_metadata: { role: "data-analyst" }, ...extra,
});
const hs256 = (payload: unknown, key: Buffer) => {
  const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  return `${head}.${createHmac("sha256", key).update(head).digest("base64url")}`;
};
const FORGED = hs256(claims(), randomBytes(32)); // signed, with a key nobody else has
const TOKENS: { label: string; headers: Record<string, string>; query?: string }[] = [
  { label: "garbage bearer token", headers: { authorization: "Bearer not.a.jwt" } },
  { label: "expired-looking JWT", headers: { authorization: `Bearer ${hs256(claims({ iat: now - 7200, exp: now - 3600 }), randomBytes(32))}` } },
  { label: 'JWT with alg "none"', headers: { authorization: `Bearer ${b64({ alg: "none", typ: "JWT" })}.${b64(claims())}.` } },
  { label: "JWT signed with a made-up key", headers: { authorization: `Bearer ${FORGED}` } },
  { label: "token with no Bearer scheme", headers: { authorization: FORGED } },
  { label: "token in x-access-token", headers: { "x-access-token": FORGED, "x-supabase-auth": FORGED } },
  { label: "token in a cookie", headers: { cookie: `sb-access-token=${FORGED}; access_token=${FORGED}` } },
  { label: "token in ?access_token=", headers: {}, query: `access_token=${encodeURIComponent(FORGED)}` },
];
const withQuery = (path: string, q?: string) => (q ? `${path}${path.includes("?") ? "&" : "?"}${q}` : path);

/* ── Results ──────────────────────────────────────────────────────────────────────────────────────────────────── */

type Row = { group: string; what: string; expect: string; got: string; result: "PASS" | "FAIL" | "SKIP" | "WARN" };
const rows: Row[] = [];
const record = (group: string, what: string, expect: string, got: string, ok: boolean | "skip" | "warn") =>
  rows.push({ group, what, expect, got, result: ok === "skip" ? "SKIP" : ok === "warn" ? "WARN" : ok ? "PASS" : "FAIL" });
const gotOf = (r: Reply) => (r.status === 0 ? `no answer (${r.text.slice(0, 60)})` : `${r.status}${r.body?.code ? ` ${r.body.code}` : ""}`);
/** A refusal must not carry the data it refused. */
const noData = (r: Reply) => r.body == null || typeof r.body !== "object" || r.body.data === undefined;
const refusedWith = (r: Reply, status: number) => r.status === status && noData(r);

/* ── A, B, C, P: no accounts needed ───────────────────────────────────────────────────────────────────────────── */

async function noTokenChecks() {
  for (const rt of ROUTES) {
    const r = await call(rt.method, rt.path, {}, rt.body);
    record("A no token", `${rt.method} ${rt.path}`, "401", gotOf(r), refusedWith(r, 401));
  }
  const r = await call("GET", "/api/auth/role");
  record("A no token", "GET /api/auth/role", "401", gotOf(r), refusedWith(r, 401));
}

/** A spread of routes: a read, the caller's own role, an AI call, an upload read and a write. */
const SAMPLE: Route[] = [
  ROUTES.find((r) => r.path.startsWith("/api/audit-log/list"))!,
  ROUTES.find((r) => r.path.startsWith("/api/upload/history"))!,
  ROUTES.find((r) => r.path === "/api/ai-insight/model-narrative")!,
  ROUTES.find((r) => r.path === "/api/mobile-config")!,
  { method: "GET", path: "/api/auth/role", roles: ALL, writes: false },
];

async function badTokenChecks() {
  for (const t of TOKENS) {
    for (const rt of SAMPLE) {
      const r = await call(rt.method, withQuery(rt.path, t.query), t.headers, rt.body);
      record("B bad token", `${t.label}: ${rt.method} ${rt.path}`, "401", gotOf(r), refusedWith(r, 401));
    }
  }
}

const SPOOFS: { label: string; headers: Record<string, string> }[] = [
  { label: "identity/role headers", headers: {
    "x-user": "admin@example.invalid", "x-user-id": randomUUID(), "x-user-email": "admin@example.invalid",
    "x-user-role": "data-analyst", "x-role": "data-analyst", "x-forwarded-user": "admin", "x-auth-user": "admin",
    "x-supabase-role": "service_role", "x-hasura-role": "admin", role: "data-analyst", "x-admin": "true" } },
  { label: "client-address headers (127.0.0.1)", headers: {
    "x-forwarded-for": "127.0.0.1", "x-real-ip": "127.0.0.1", "cf-connecting-ip": "127.0.0.1", "x-client-ip": "127.0.0.1",
    "true-client-ip": "127.0.0.1", forwarded: "for=127.0.0.1", "x-forwarded-host": "localhost" } },
  { label: "URL-rewrite / method-override headers", headers: {
    "x-original-url": "/api/health", "x-rewrite-url": "/api/health", "x-http-method-override": "GET",
    "x-forwarded-prefix": "/api/health" } },
  { label: "forged x-device-trust pass", headers: { "x-device-trust": `${b64({ v: 2, sub: randomUUID(), iat: Date.now(), exp: Date.now() + 864e5 })}.${randomBytes(32).toString("base64url")}` } },
  { label: "x-cache-bypass", headers: { "x-cache-bypass": "1" } },
];

async function spoofChecks() {
  for (const s of SPOOFS) {
    for (const rt of SAMPLE.slice(0, 4)) {
      const r = await call(rt.method, rt.path, s.headers, rt.body);
      record("C spoofed headers", `${s.label}: ${rt.method} ${rt.path}`, "401", gotOf(r), refusedWith(r, 401));
    }
  }
  /* Path spellings. Express matches routes case-insensitively and ignores a trailing slash, so these reach the same
     guarded handler (401); a spelling that matches no route at all is 404. Either way: no data. */
  const paths: [string, string][] = [
    ["GET", "/api/AUDIT-LOG/list"], ["GET", "/api/audit-log/list/"], ["GET", "/api/audit-log/%6cist"],
    ["GET", "/api//audit-log/list"], ["GET", "/api/audit-log/./list"], ["GET", "/api/Upload/History"],
    ["GET", "/api/emissions/INDEX"], ["HEAD", "/api/audit-log/list"], ["HEAD", "/api/upload/history"],
  ];
  for (const [m, p] of paths) {
    const r = await call(m, p);
    const ok = [401, 404].includes(r.status) && noData(r);
    record("C path tricks", `${m} ${p}`, "401 or 404, no data", gotOf(r), ok);
  }
}

async function publicChecks() {
  for (const p of ["/api/ai-insight/status", "/api/ai-sandbox/command/status"]) {
    const r = await call("GET", p);
    const keys = r.body?.data && typeof r.body.data === "object" ? Object.keys(r.body.data).sort().join(",") : "";
    record("P public status", `GET ${p} says only configured/zdrEnforced`, "200 configured,zdrEnforced", `${r.status} ${keys}`,
      r.status === 200 && keys === "configured,zdrEnforced");
  }
  const r = await call("GET", "/api/auth/trusted-device/status");
  const keys = r.body?.data ? Object.keys(r.body.data).sort().join(",") : "";
  record("P public status", "GET /api/auth/trusted-device/status says only days/enabled", "200 days,enabled", `${r.status} ${keys}`,
    r.status === 200 && keys === "days,enabled");
}

/* ── D, E: with test accounts ─────────────────────────────────────────────────────────────────────────────────── */

const ROLE_TOKENS: { role: Role | "pending"; env: string }[] = [
  { role: "data-analyst", env: "AUTHZ_TOKEN_DATA_ANALYST" },
  { role: "tcc-operator", env: "AUTHZ_TOKEN_TCC_OPERATOR" },
  { role: "incident-operator", env: "AUTHZ_TOKEN_INCIDENT_OPERATOR" },
  { role: "pending", env: "AUTHZ_TOKEN_PENDING" },
];
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
const subOf = (t: string): string | null => {
  try { return JSON.parse(Buffer.from(t.split(".")[1] ?? "", "base64url").toString("utf8")).sub ?? null; } catch { return null; }
};
const aalOf = (t: string): string | null => {
  try { return JSON.parse(Buffer.from(t.split(".")[1] ?? "", "base64url").toString("utf8")).aal ?? null; } catch { return null; }
};

async function roleChecks(): Promise<number> {
  const have = ROLE_TOKENS.map((r) => ({ ...r, token: process.env[r.env]?.trim() })).filter((r) => r.token) as
    { role: Role | "pending"; env: string; token: string }[];
  if (!have.length) {
    record("D roles", "per-role checks", "tokens in AUTHZ_TOKEN_<ROLE>", "none set", "skip");
    return 0;
  }
  const usable: typeof have = [];
  for (const h of have) {
    if (aalOf(h.token) !== "aal2") {
      record("D roles", `${h.env}: token is from a session that passed the code`, 'JWT aal "aal2"', `aal ${aalOf(h.token)}`, "warn");
    }
    const r = await call("GET", "/api/auth/role", bearer(h.token));
    const ok = r.status === 200 && r.body?.data?.role === h.role;
    record("D roles", `${h.env}: server reads the role named by the variable`, `200 role ${h.role}`, `${gotOf(r)} role ${r.body?.data?.role ?? "-"}`, ok);
    if (ok) usable.push(h);
    else if (r.status === 401) record("D roles", `${h.env}: skipped`, "a live token", "token rejected (expired? sign in again)", "skip");
  }

  for (const h of usable) {
    for (const rt of ROUTES) {
      const what = `${h.role}: ${rt.method} ${rt.path}`;
      if (h.role === "pending") {
        const r = await call(rt.method, rt.path, bearer(h.token), rt.body);
        record("D roles", what, "403 role_pending", gotOf(r), refusedWith(r, 403) && r.body?.code === "role_pending");
        continue;
      }
      const allowed = rt.roles.includes(h.role);
      if (!allowed) {
        const r = await call(rt.method, rt.path, bearer(h.token), rt.body);
        record("D roles", what, "403 role_denied", gotOf(r), refusedWith(r, 403));
        continue;
      }
      if (rt.writes && !PROBE_WRITES) {
        record("D roles", what, "allowed (write route: not exercised)", "-", "skip");
        continue;
      }
      if (rt.method === "GET" && !rt.writes) {
        const r = await call("GET", rt.path, bearer(h.token));
        const ok = r.status >= 200 && r.status < 300;
        record("D roles", what, "2xx", gotOf(r), ok ? true : r.status === 503 ? "warn" : false);
        continue;
      }
      // A non-writing POST (AI, empty body -> zod 400), or with AUTHZ_PROBE_WRITES=1 a malformed write (400/404).
      const r = await call(rt.method, rt.path, bearer(h.token), rt.body);
      const want = rt.allowedStatus ?? [400, 404, 409];
      record("D roles", what, `${want.join("/")} (past the guard, nothing done)`, gotOf(r), want.includes(r.status));
    }
  }

  // A role header beside a lower role's token changes nothing.
  const low = usable.find((h) => h.role === "incident-operator") ?? usable.find((h) => h.role === "tcc-operator") ?? usable.find((h) => h.role === "pending");
  if (low) {
    const spoof = { ...bearer(low.token), "x-user-role": "data-analyst", "x-role": "data-analyst", role: "data-analyst" };
    const r = await call("GET", "/api/audit-log/list?limit=1", spoof);
    record("D roles", `${low.role} token + x-user-role: data-analyst: GET /api/audit-log/list`, "403", gotOf(r), refusedWith(r, 403));
  }

  // Cross-user: token A naming user B.
  if (usable.length >= 2) {
    const [a, b] = usable;
    const bId = subOf(b.token) ?? randomUUID();
    const r = await call("GET", `/api/auth/role?user_id=${bId}&userId=${bId}&email=other@example.invalid`,
      { ...bearer(a.token), "x-user-id": bId, "x-user": "other@example.invalid" });
    record("D cross-user", `${a.role} token naming ${b.role}'s user id: GET /api/auth/role`, `200 role ${a.role}`,
      `${gotOf(r)} role ${r.body?.data?.role ?? "-"}`, r.status === 200 && r.body?.data?.role === a.role);
    const nonAnalyst = usable.find((h) => h.role !== "data-analyst");
    if (nonAnalyst) {
      const other = usable.find((h) => h !== nonAnalyst)!;
      const r2 = await call("GET", `/api/audit-log/list?limit=1&user_id=${encodeURIComponent(subOf(other.token) ?? "x")}`, bearer(nonAnalyst.token));
      record("D cross-user", `${nonAnalyst.role} asks the audit log for another user's entries`, "403", gotOf(r2), refusedWith(r2, 403));
    }
    // A device pass for user B (forged) does not stand in for anything on user A's token.
    const r3 = await call("GET", "/api/auth/role", { ...bearer(a.token), "x-device-trust": "forged.pass" });
    record("D cross-user", `${a.role} token + someone else's (forged) device pass`, `200 role ${a.role}`,
      `${gotOf(r3)} role ${r3.body?.data?.role ?? "-"}`, r3.status === 200 && r3.body?.data?.role === a.role);
  } else {
    record("D cross-user", "token A asking for user B", "two AUTHZ_TOKEN_* accounts", `${usable.length} usable`, "skip");
  }
  return usable.length;
}

async function aal1Checks() {
  const t = process.env.AUTHZ_TOKEN_AAL1?.trim();
  if (!t) {
    record("E password-only", "AAL1 token refused", "AUTHZ_TOKEN_AAL1 set", "not set", "skip");
    return;
  }
  if (aalOf(t) !== "aal1") record("E password-only", "AUTHZ_TOKEN_AAL1 is a password-only session", 'JWT aal "aal1"', `aal ${aalOf(t)}`, "warn");
  for (const rt of [SAMPLE[0], SAMPLE[1], SAMPLE[4]]) {
    const r = await call(rt.method, rt.path, bearer(t), rt.body);
    record("E password-only", `AAL1: ${rt.method} ${rt.path}`, "401 mfa_required", gotOf(r), refusedWith(r, 401) && r.body?.code === "mfa_required");
    const forged = { ...bearer(t), "x-device-trust": `${b64({ v: 2, sub: subOf(t), iat: Date.now(), exp: Date.now() + 864e5 })}.${randomBytes(32).toString("base64url")}` };
    const r2 = await call(rt.method, rt.path, forged, rt.body);
    record("E password-only", `AAL1 + forged device pass: ${rt.method} ${rt.path}`, "401 mfa_required", gotOf(r2), refusedWith(r2, 401) && r2.body?.code === "mfa_required");
  }
}

/* ── Run ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

(async () => {
  const health = await call("GET", "/api/health");
  if (health.status === 0) {
    console.error(`No server at ${BASE}: ${health.text}`);
    process.exit(2);
  }
  console.log(`authz-check against ${BASE}${PROBE_WRITES ? " (AUTHZ_PROBE_WRITES=1)" : ""}\n`);
  if (ONLY.has("A")) await noTokenChecks();
  if (ONLY.has("B")) await badTokenChecks();
  if (ONLY.has("C")) await spoofChecks();
  if (ONLY.has("P")) await publicChecks();
  if (ONLY.has("D")) await roleChecks();
  if (ONLY.has("E")) await aal1Checks();

  const w = { group: 18, what: 74, expect: 30, got: 26 };
  const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  console.log(`${"RESULT".padEnd(6)}  ${cut("GROUP", w.group)} ${cut("CHECK", w.what)} ${cut("EXPECTED", w.expect)} GOT`);
  console.log("-".repeat(6 + 2 + w.group + 1 + w.what + 1 + w.expect + 1 + w.got));
  for (const r of rows) console.log(`${r.result.padEnd(6)}  ${cut(r.group, w.group)} ${cut(r.what, w.what)} ${cut(r.expect, w.expect)} ${r.got}`);
  const count = (k: Row["result"]) => rows.filter((r) => r.result === k).length;
  console.log(`\n${rows.length} checks: ${count("PASS")} pass, ${count("FAIL")} fail, ${count("WARN")} warn, ${count("SKIP")} skipped; ${sent} requests sent.`);
  if (count("SKIP")) console.log("Skipped checks need test accounts: see the header of scripts/authz-check.ts for the AUTHZ_TOKEN_* variables.");
  process.exit(count("FAIL") ? 1 : 0);
})();
