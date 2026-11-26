"use client";

import { useEffect, useRef } from "react";
import { useToast } from "../../lib/toast";
import { onServerSlow, SERVER_WAKING, SERVER_WAKING_DETAIL } from "../../lib/server-status";

/** After the notice goes, it is not shown again for this long: a run of slow polls should not flash it on and off. */
const QUIET_AFTER_MS = 2 * 60_000;

/**
 * "The server may be waking up", while a read to it has been waiting more than a few seconds (21 Nov 2026, audit A9).
 *
 * The hosted server sleeps when idle and takes up to a minute to wake. The first pages opened after that used to sit
 * on their loading states with nothing to say why. The shell's fetch wrapper (lib/backend-auth.ts) reports a slow
 * read; this shows one notice for it and takes it down when the reads have answered. Renders nothing itself.
 */
export default function ServerWakeNotice() {
  const { show, dismiss } = useToast();
  const id = useRef<number | null>(null);
  const hiddenAt = useRef(0);

  useEffect(() => {
    const off = onServerSlow((slow) => {
      if (slow) {
        if (id.current == null && Date.now() - hiddenAt.current > QUIET_AFTER_MS) {
          id.current = show("info", SERVER_WAKING, SERVER_WAKING_DETAIL, { sticky: true });
        }
      } else if (id.current != null) {
        dismiss(id.current);
        id.current = null;
        hiddenAt.current = Date.now();
      }
    });
    return () => {
      off();
      if (id.current != null) dismiss(id.current);
      id.current = null;
    };
  }, [show, dismiss]);

  return null;
}
