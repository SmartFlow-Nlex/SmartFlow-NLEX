import { db } from "../config/db.js";

/**
 * Who may do what, decided on the server (9 Nov 2026, security audit finding #1).
 *
 * The role used to be read from Supabase `user_metadata.role`. Users can write their own user_metadata (the
 * dashboard itself does, from the browser), and sign-up was open, so anyone could create an account and give it
 * the top role. The role now comes, in order, from:
 *
 *   1. `app_metadata.role`, which only the Supabase service role can set;
 *   2. public.app_user_roles, the server's own list (Back-End/scripts/set-role.ts manages it);
 *   3. for an account created before ROLE_LIST_START that is not yet listed, its user_metadata role, copied into
 *      the list once (source "migrated"), so the team keeps working. From then on user_metadata is ignored;
 *   4. otherwise "pending": signed in, no access to any protected route until an administrator assigns a role.
 *
 * Accounts created after ROLE_LIST_START can therefore never pick their own role.
 */

export const ROLES = ["data-analyst", "tcc-operator", "incident-operator"] as const;
export type Role = (typeof ROLES)[number];
export const PENDING_ROLE = "pending";
export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/** Accounts that existed before the server-side list. Later accounts start as pending. */
const ROLE_LIST_START = Date.parse("2026-11-10T00:00:00+08:00");

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      if (!db) return;
      await db.query(`
        CREATE TABLE IF NOT EXISTS public.app_user_roles (
          user_id    uuid PRIMARY KEY,
          email      text,
          role       text NOT NULL,
          source     text NOT NULL,
          granted_by text,
          granted_at timestamptz NOT NULL DEFAULT now()
        )`);
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

const cache = new Map<string, { at: number; role: string }>();
const CACHE_MS = 60_000;

type SupabaseUser = {
  id: string;
  email?: string | null;
  created_at?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

/** The caller's role as the server decides it; "pending" when nobody has assigned one. Fails closed. */
export async function resolveRole(user: SupabaseUser): Promise<string> {
  if (isRole(user.app_metadata?.role)) return user.app_metadata!.role as string;
  if (!db) return PENDING_ROLE;
  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.role;
  try {
    await ensureTable();
    const { rows } = await db.query(`SELECT role FROM public.app_user_roles WHERE user_id = $1`, [user.id]);
    let role: string = rows[0]?.role ?? "";
    if (!role) {
      const created = Date.parse(user.created_at ?? "");
      const legacy = Number.isFinite(created) && created < ROLE_LIST_START && isRole(user.user_metadata?.role);
      role = legacy ? (user.user_metadata!.role as string) : PENDING_ROLE;
      await db.query(
        `INSERT INTO public.app_user_roles (user_id, email, role, source) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id, user.email ?? null, role, legacy ? "migrated" : "signed-up"],
      );
    }
    cache.set(user.id, { at: Date.now(), role });
    return role;
  } catch (error) {
    console.error("[roles] could not read the role list; denying:", error instanceof Error ? error.message : error);
    return PENDING_ROLE;
  }
}

/** For scripts/set-role.ts. */
export async function setRole(email: string, role: string, grantedBy: string): Promise<number> {
  if (!db) throw new Error("No database");
  await ensureTable();
  const r = await db.query(
    `UPDATE public.app_user_roles SET role = $2, source = 'assigned', granted_by = $3, granted_at = now() WHERE lower(email) = lower($1)`,
    [email, role, grantedBy],
  );
  cache.clear();
  return r.rowCount ?? 0;
}

export async function listRoles(): Promise<{ email: string | null; role: string; source: string; granted_at: string }[]> {
  if (!db) return [];
  await ensureTable();
  const { rows } = await db.query(`SELECT email, role, source, granted_at::text FROM public.app_user_roles ORDER BY granted_at`);
  return rows;
}
