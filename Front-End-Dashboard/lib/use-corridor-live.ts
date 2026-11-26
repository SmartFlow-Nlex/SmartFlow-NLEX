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
import { isFeatureCollection } from "./live-feed";
import { startVisiblePoll } from "./use-visible-poll";

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
  /** True when the last read failed: unreachable, refused (e.g. 429), an error body, or no `features`.
   *  Not the same as stale, which is a good answer whose newest jam is old. Never read as a clear road. */
  failed: boolean;
};

/**
 * The live corridor, read once for the whole Overview.
 *
 * The same feed, the same 25 s cache and the same rules (corridorStatusFromFeed,
 * tallyExitStatuses, slowestReading) the hero card and the Live Corridor Status
 * panel already used, so the headline, the counts, the hotspot list and the
 * corridor ribbon cannot disagree. Re-reads every 60 s.
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
        /* strict: a 429, a 500 or a body without `features` is a failed read, never "no jams". That used to
           come through as statuses=[] with failed:false, and the Overview said "Flowing" with 0 reports while
           the road panel beside it said "Feed unavailable" (audit 2026-11-19, P8-02).
           maxStaleMs = the TTL: each 60 s tick waits for a fresh read rather than being shown the previous
           tick's answer from the memo (G-8). */
        const fc = await cachedJson<RealtimeFC>(`${BACKEND}/api/map-comparison/real-time`, 25_000, undefined, {
          strict: true,
          maxStaleMs: 25_000,
        });
        if (cancelled) return;
        if (!isFeatureCollection(fc)) throw new Error("Feed unavailable");
        const statuses = corridorStatusFromFeed(fc as Parameters<typeof corridorStatusFromFeed>[0], exits);
        const newestAt = fc.feed?.newestAt ?? null;
        /* Age from the feed's own newest jam and this clock, as the Map page does, rather than the server's
           figure, which was fixed when the answer was made and goes on reading "1.7 min" from a cache. */
        const newestMs = newestAt ? new Date(newestAt).getTime() : NaN;
        const ageMinutes = Number.isFinite(newestMs)
          ? Math.max(0, (Date.now() - newestMs) / 60_000)
          : (fc.feed?.ageMinutes ?? null);
        setState({
          statuses,
          tally: tallyExitStatuses(exits, statuses),
          slowest: slowestReading(statuses),
          ageMinutes,
          windowMinutes: fc.feed?.windowMinutes ?? null,
          newestAt,
          stale: Boolean(fc.feed?.stale),
          loading: false,
          failed: false,
        });
      } catch {
        // The last good reading is kept for reference, but `failed` makes every view say the feed is unavailable.
        if (!cancelled) setState((s) => ({ ...s, loading: false, failed: true }));
      }
    };
    // Paused while the tab is hidden, refreshed once on return (lib/use-visible-poll.ts).
    const stop = startVisiblePoll(load, 60_000, { immediate: true });
    return () => {
      cancelled = true;
      stop();
    };
  }, [exits]);

  return { exits, ...state };
}
