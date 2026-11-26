"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { isRole, type Role } from "./auth-access";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export type ServerRole = Role | "pending";

/* The signed-in account's role as the SERVER decides it (GET /api/auth/role), for pages that need to know what the
   API will let this user do (21 Nov 2026, audit G-4). The shell asks the same question to build the menu; this keeps
   the pages independent of it. One answer per account per tab: the role is set by an administrator and does not
   change while the user works. A failed lookup is not kept, so the next page that asks tries again. */
let cache: { userId: string; role: Promise<ServerRole | null> } | null = null;

async function lookup(token: string): Promise<ServerRole | null> {
  const r = await fetch(`${BACKEND}/api/auth/role`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`role ${r.status}`);
  const role = (await r.json())?.data?.role;
  return role === "pending" ? "pending" : isRole(role) ? role : null;
}

async function serverRole(): Promise<ServerRole | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  if (cache?.userId !== session.user.id) {
    const entry = {
      userId: session.user.id,
      role: lookup(session.access_token).catch(() => {
        if (cache === entry) cache = null;
        return null;
      }),
    };
    cache = entry;
  }
  return cache.role;
}

/** The server's role for this account, or null until it has answered (or if it could not be asked). */
export function useServerRole(): ServerRole | null {
  const [role, setRole] = useState<ServerRole | null>(null);
  useEffect(() => {
    let cancelled = false;
    serverRole()
      .then((r) => {
        if (!cancelled) setRole(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return role;
}
