"use client";

import { useEffect, useRef } from "react";

/**
 * Polling that stops while nobody can see the page.
 *
 * Every poller ran on a bare setInterval, in a hidden tab as much as a visible one: one Live Map tab left in the
 * background made about 170 requests per 15 minutes against a rate limit of 200 shared by everyone behind the same
 * address (audit 2026-11-19, P8-01 / P8-05). This keeps the same intervals but:
 *
 *  - pauses while `document.hidden`;
 *  - on becoming visible, runs once straight away if a tick was missed, then carries on at the usual interval
 *    (a tab hidden for two seconds does not refetch);
 *  - never overlaps itself: the next tick is set only after the previous call has settled, so a slow answer cannot
 *    land after a newer one.
 *
 * `fn` handles its own errors; a throw here is swallowed so the poll keeps going.
 */
export function startVisiblePoll(
  fn: () => unknown,
  everyMs: number,
  opts: { immediate?: boolean } = {},
): () => void {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // When the last call started. -Infinity means "never", so the first visible moment runs at once.
  let lastRun = -Infinity;
  const hidden = () => typeof document !== "undefined" && document.hidden;

  const clear = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const schedule = () => {
    clear();
    if (stopped || running || hidden()) return;
    timer = setTimeout(run, Math.max(0, lastRun + everyMs - Date.now()));
  };
  const run = async () => {
    timer = null;
    if (stopped || running) return;
    if (hidden()) return; // the visibility listener picks it up again
    running = true;
    lastRun = Date.now();
    try {
      await fn();
    } catch {
      /* the caller reports its own failures */
    } finally {
      running = false;
      schedule();
    }
  };
  const onVisibility = () => {
    if (hidden()) clear();
    else schedule();
  };

  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  if (opts.immediate) void run();
  else {
    lastRun = Date.now();
    schedule();
  }

  return () => {
    stopped = true;
    clear();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };
}

/**
 * startVisiblePoll as a hook. Runs `fn` on mount (unless `immediate: false`) and then every `everyMs` while the tab
 * is visible; `enabled: false` stops it (a closed modal, say). The latest `fn` is always the one called.
 */
export function useVisiblePoll(
  fn: () => unknown,
  everyMs: number,
  opts: { enabled?: boolean; immediate?: boolean } = {},
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const enabled = opts.enabled ?? true;
  const immediate = opts.immediate ?? true;
  useEffect(() => {
    if (!enabled) return;
    return startVisiblePoll(() => fnRef.current(), everyMs, { immediate });
  }, [enabled, everyMs, immediate]);
}
