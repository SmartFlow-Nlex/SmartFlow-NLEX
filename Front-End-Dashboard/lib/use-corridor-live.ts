"use client";

import { useEffect, useState } from "react";
import { cachedJson } from "./cached-json";
import {
  corridorStatusFromFeed,
  slowestReading,
  tallyExitStatuses,
  type CorridorTally,
  type ExitStatus,
} from "./corridor-status";
import { useNlexExits, type NlexExit } from "./nlex-exits";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

type Feed = { newestAt?: string | null; ageMinutes?: number | null; stale?: boolean; windowMinutes?: number | null };
type RealtimeFC = { features?: unknown[]; feed?: Feed };

export type CorridorLive = {
  exits: NlexExit[];
  statuses: ExitStatus[];
  tally: CorridorTally | null;
  slowest: { exit: string; speedKmh: number } | null;
  ageMinutes: number | null;
  windowMinutes: number | null;
  newestAt: string | null;
  stale: boolean;
  /** True until the first feed read has answered. */
  loading: boolean;
  /** True when the feed could not be read at all (not merely stale). */
  failed: boolean;
};

/**
 * The live corridor, read once for the whole Overview.
 *
 * The same feed, the same 25 s cache and the same rules (corridorStatusFromFeed,
 * tallyExitStatuses, slowestReading) the hero card and the Live Corridor Status
 * panel already used, so the counts, the 3D corridor and the readout cannot
 * disagree. Re-reads every 60 s.
 */
export function useCorridorLive(): CorridorLive {
  const { exits } = useNlexExits();
  const [state, setState] = useState<Omit<CorridorLive, "exits">>({
    statuses: [],
    tally: null,
    slowest: null,
    ageMinutes: null,
    windowMinutes: null,
    newestAt: null,
    stale: false,
    loading: true,
    failed: false,
  });

  useEffect(() => {
    if (!exits.length) return;
    let cancelled = false;
    const load = async () => {
      try {
        const fc = await cachedJson<RealtimeFC>(`${BACKEND}/api/map-comparison/real-time`, 25_000);
        if (cancelled) return;
        const statuses = fc?.features
          ? corridorStatusFromFeed(fc as Parameters<typeof corridorStatusFromFeed>[0], exits)
          : [];
        setState({
          statuses,
          tally: tallyExitStatuses(exits, statuses),
          slowest: slowestReading(statuses),
          ageMinutes: fc?.feed?.ageMinutes ?? null,
          windowMinutes: fc?.feed?.windowMinutes ?? null,
          newestAt: fc?.feed?.newestAt ?? null,
          stale: Boolean(fc?.feed?.stale),
          loading: false,
          failed: false,
        });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false, failed: true }));
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [exits]);

  return { exits, ...state };
}
