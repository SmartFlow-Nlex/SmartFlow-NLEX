"use client";

import { useEffect, useState } from "react";
import { Clock, Lock } from "lucide-react";

/**
 * The dashboard's notice card: Navie, the animated mascot (public/loading.mp4, served as the cropped,
 * silent public/loading-mascot.mp4) in a round window, with a title, a line of detail and, for a notice
 * that leaves on its own, a countdown and a way to leave at once.
 *
 * Notices only (19 Oct 2026, user request). It used to be the loading screen as well -- the session check,
 * the route loader and a five-second "ready" hold -- and the user judged that unnecessary: a load now shows
 * the scenery until the page appears, and the card comes up only for something the reader has to be told,
 * such as a page their role cannot open (`tone="warn"`, from the dashboard layout).
 *
 * Warnings (`tone="warn"`: a page the role cannot open, the inactivity warning) show the police-car Navie
 * instead, animated (20 Oct 2026, user request): public/brand/police-warning.mp4, made from the user's
 * police_warning.mp4 cropped square around the car, without its sound, with police-warning.webp (its first
 * frame) as the poster and as the still picture under reduced motion. The clip's background is pure white,
 * so it sits on a white disc and its edges never show.
 *
 * The clip was rendered on a light grey studio backdrop, so it sits in a disc of that same grey and its
 * edge is feathered into it: the backdrop never shows as a rectangle in either theme. Under reduced motion
 * the still first frame (loading-mascot.webp) stands in and nothing moves.
 */
export default function LoadingGate({
  title,
  detail,
  tone = "busy",
  action,
  countdown,
  overlay = false,
  badge = "lock",
}: {
  title: string;
  detail?: string;
  tone?: "busy" | "warn";
  action?: { label: string; onClick: () => void };
  /** A notice that leaves on its own: seconds left, out of how many. Drains the ring and shows a chip. */
  countdown?: { left: number; total: number; label?: string };
  /** Float over the dashboard (e.g. the inactivity warning) rather than stand in for it. */
  overlay?: boolean;
  /** The small mark on a warning's disc: a lock for a refused page, a clock for inactivity. */
  badge?: "lock" | "clock";
}) {
  const [still, setStill] = useState(false);
  // A notice that opens part-way through its countdown starts its ring part-drained, not full.
  const [startedAt] = useState(() => (countdown ? countdown.total - countdown.left : 0));

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <div className={`ds-auth-gate ds-load${overlay ? " is-overlay" : ""}`} role={overlay ? "alertdialog" : "status"} aria-live="polite" data-tone={tone}>
      <div className="ds-load-card">
        <div
          className={`ds-load-ring${countdown ? " is-countdown" : ""}`}
          style={countdown ? ({ "--ds-load-total": `${countdown.total}s`, "--ds-load-delay": `-${Math.max(0, startedAt)}s` } as React.CSSProperties) : undefined}
          aria-hidden="true"
        >
          {tone === "warn" && (
            <span className="ds-load-badge">
              {badge === "clock" ? <Clock size={16} strokeWidth={2.4} /> : <Lock size={16} strokeWidth={2.4} />}
            </span>
          )}
          <div className={`ds-load-disc${tone === "warn" ? " is-police" : ""}`}>
            {tone === "warn" ? (
              still ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/brand/police-warning.webp" alt="" width={480} height={480} />
              ) : (
                <video src="/brand/police-warning.mp4" poster="/brand/police-warning.webp" autoPlay loop muted playsInline preload="auto" width={480} height={480} />
              )
            ) : still ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/loading-mascot.webp" alt="" width={480} height={480} />
            ) : (
              <video src="/loading-mascot.mp4" poster="/loading-mascot.webp" autoPlay loop muted playsInline preload="auto" width={480} height={480} />
            )}
          </div>
        </div>
        <span className="ds-load-brand">Navie</span>
        <p className="ds-load-title">{title}</p>
        {detail && <p className="ds-load-detail">{detail}</p>}
        {countdown && (
          <span className="ds-load-count">
            {countdown.label ?? "Returning to the Overview in"} <b>{countdown.left} s</b>
          </span>
        )}
        {action && (
          <button type="button" className={`${tone === "warn" ? "btn-primary" : "btn-muted"} ds-load-action`} onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
