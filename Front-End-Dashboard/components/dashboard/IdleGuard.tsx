"use client";

import { useEffect, useRef, useState } from "react";
import LoadingGate from "./LoadingGate";
import { LAST_ACTIVITY_KEY, lastActivity, markActivity } from "../../lib/account-device";

/**
 * Signs the reader out after a spell without activity (19 Oct 2026, user request: "idle time for 15 mins
 * as its default", adjustable in Settings).
 *
 * Activity is pointer, key, wheel, touch and scroll, in any open tab: the time of the last one is shared
 * through localStorage (lib/account-device.ts), so working in one tab keeps the others signed in too. A
 * minute before the limit the notice card asks "Are you still there?" with a countdown; any activity, or
 * its button, carries on. At the limit `onTimeout` runs (the layout signs out and returns to sign-in).
 *
 * A browser left past the limit -- closed overnight, say -- is signed out as soon as the dashboard opens
 * again, since the last activity it remembers is older than the limit. On a remembered device that means
 * the password again but not the code.
 */
const WARN_BEFORE_MS = 60_000;
const WRITE_EVERY_MS = 5_000; // activity is frequent; the shared timestamp need not be

export default function IdleGuard({ minutes, onTimeout }: { minutes: number; onTimeout: () => void }) {
  const limit = minutes * 60_000;
  const [warnLeft, setWarnLeft] = useState<number | null>(null);
  const lastWrite = useRef(0);
  const timedOut = useRef(false);
  const fire = useRef(onTimeout);
  fire.current = onTimeout;

  useEffect(() => {
    timedOut.current = false;
    // Opened after being away past the limit: out at once. Otherwise this counts as activity.
    const last = lastActivity();
    if (last && Date.now() - last >= limit) {
      timedOut.current = true;
      fire.current();
      return;
    }
    markActivity();
    lastWrite.current = Date.now();

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite.current < WRITE_EVERY_MS) return;
      lastWrite.current = now;
      markActivity(now);
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    const onVisible = () => { if (document.visibilityState === "visible") onActivity(); };
    document.addEventListener("visibilitychange", onVisible);

    const tick = window.setInterval(() => {
      if (timedOut.current) return;
      const idle = Date.now() - (lastActivity() || lastWrite.current);
      if (idle >= limit) {
        timedOut.current = true;
        setWarnLeft(null);
        fire.current();
      } else if (idle >= limit - WARN_BEFORE_MS) {
        setWarnLeft(Math.max(1, Math.ceil((limit - idle) / 1000)));
      } else {
        setWarnLeft(null);
      }
    }, 1000);

    // Another tab's activity clears this tab's warning straight away.
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVITY_KEY) setWarnLeft(null);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(tick);
    };
  }, [limit]);

  if (warnLeft == null) return null;
  return (
    <LoadingGate
      overlay
      badge="clock"
      tone="warn"
      title="Are you still there?"
      detail={`You've been inactive for ${minutes - 1} minute${minutes - 1 === 1 ? "" : "s"}. For security, you'll be signed out soon.`}
      countdown={{ left: warnLeft, total: Math.round(WARN_BEFORE_MS / 1000), label: "Signing you out in" }}
      action={{
        label: "Stay signed in",
        onClick: () => {
          markActivity();
          lastWrite.current = Date.now();
          setWarnLeft(null);
        },
      }}
    />
  );
}
