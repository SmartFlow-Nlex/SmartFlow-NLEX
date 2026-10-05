"use client";

import { useEffect, useRef, useState, type ElementType } from "react";

/**
 * A display title that blurs up letter by letter, once, when it mounts.
 *
 * The characters are split by React, never by touching innerHTML. The element
 * carries the whole title as its accessible name and the per-letter spans are
 * aria-hidden, so a screen reader hears one word, not a spelling. Words are
 * kept whole so a title wraps between words only. The motion itself is CSS
 * (`.tr-char`), cancelled under prefers-reduced-motion.
 *
 * The letters wait for the title's own font before they move (7 Oct 2026, user
 * request: the Overview title "popped"). Self-hosted fonts load on first use, so
 * a title used to start its reveal in the fallback face and jump to the real one
 * mid-animation. Now the reveal starts once the face is ready, or after
 * FONT_WAIT_MS at most, so a slow or missing font never holds the title back.
 */

const FONT_WAIT_MS = 900;

// Warm the display faces as soon as this module loads (while the session check
// is still on screen), so by the time a title mounts its face is usually ready.
if (typeof document !== "undefined" && document.fonts) {
  for (const f of ["700 expanded 64px Saira", "700 64px Inter"]) document.fonts.load(f).catch(() => undefined);
}

export default function TitleReveal({
  text,
  as: Tag = "h1",
  className,
  id,
  delay = 0,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  id?: string;
  /** Seconds before the first letter moves. */
  delay?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof document === "undefined" || !document.fonts) {
      setReady(true);
      return;
    }
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        setReady(true);
      }
    };
    const cs = getComputedStyle(el);
    const stretch = cs.fontStretch && cs.fontStretch !== "100%" && cs.fontStretch !== "normal" ? `${cs.fontStretch} ` : "";
    const face = `${cs.fontStyle} ${cs.fontWeight} ${stretch}${cs.fontSize} ${cs.fontFamily}`;
    const timer = window.setTimeout(go, FONT_WAIT_MS);
    let check: Promise<unknown>;
    try {
      check = document.fonts.check(face) ? Promise.resolve() : document.fonts.load(face);
    } catch {
      check = Promise.resolve();
    }
    check.then(go, go);
    return () => {
      done = true;
      window.clearTimeout(timer);
    };
  }, []);

  let index = 0;
  const words = text.split(" ");
  const classes = ["tr-title", className, ready ? "tr-ready" : null].filter(Boolean).join(" ");
  return (
    <Tag ref={ref} className={classes} aria-label={text} id={id} style={{ ["--tr-letters" as string]: Array.from(text.replace(/ /g, "")).length }}>
      {words.map((word, w) => (
        <span key={w} className="tr-word" aria-hidden="true">
          {Array.from(word).map((ch, c) => {
            const i = index++;
            return (
              <span key={c} className="tr-char" style={{ animationDelay: `${delay + i * 0.035}s` }}>
                {ch}
              </span>
            );
          })}
          {w < words.length - 1 ? <span className="tr-space"> </span> : null}
        </span>
      ))}
    </Tag>
  );
}
