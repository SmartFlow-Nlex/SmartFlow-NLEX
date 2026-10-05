"use client";

import { useEffect, useState } from "react";
import { BACKEND, authedJson } from "../../lib/api";

/**
 * Active maintenance closures for the Live Map, read-only.
 *
 * Reads the existing GET /api/maintenance/list through the app's own client
 * helper (authedJson). Nothing is written. "Active" is the schedule's own
 * lifecycle status, in_progress: the operator has marked the work as under
 * way. start_km / end_km are read exactly as the Maintenance page reads them,
 * as km posts.
 *
 * One request is shared by every map on the page (and the corridor strip),
 * refreshed once a minute while anything is listening. A failure leaves the
 * last good list in place, or none: a closure is never drawn from a guess.
 */

export type Closure = {
  id: string;
  title: string;
  description: string | null;
  start_km: number;
  end_km: number;
  direction: "NB" | "SB" | "Both";
  lane_closure: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type Body = { success?: boolean; data?: Closure[] };

let current: Closure[] | null = null;
let inflight: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(c: Closure[] | null) => void>();

const load = (): Promise<void> => {
  if (inflight) return inflight;
  inflight = authedJson<Body>(`${BACKEND}/api/maintenance/list`, { cache: "no-store" })
    .then((b) => {
      if (b?.success && Array.isArray(b.data)) {
        current = b.data.filter(
          (s) => s.status === "in_progress" && Number.isFinite(Number(s.start_km)) && Number.isFinite(Number(s.end_km)),
        );
        listeners.forEach((l) => l(current));
      }
    })
    .catch(() => {
      /* Unreachable or refused: keep what we had. */
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

export function useActiveClosures(): Closure[] | null {
  const [list, setList] = useState<Closure[] | null>(current);
  useEffect(() => {
    listeners.add(setList);
    if (current) setList(current);
    load();
    if (!timer) timer = setInterval(load, 60_000);
    return () => {
      listeners.delete(setList);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return list;
}
