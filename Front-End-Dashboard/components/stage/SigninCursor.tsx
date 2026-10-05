"use client";

import { useEffect, useRef, useState } from "react";
import { useEffectsOn } from "../../lib/effects";

/**
 * The sign-in page's double-ring cursor: an inner dot that snaps to the pointer
 * and an outer ring that follows with lerp 0.2. Sign-in only (the dashboard
 * keeps the native cursor, because charts and maps need precision), only for a
 * fine pointer, and off under reduced motion. Over form fields the native
 * cursor comes back and the rings step aside.
 */
const FIELD = "input, textarea, select, [contenteditable='true']";

export default function SigninCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [allowed, setEnabled] = useState(false);
  // The custom cursor is one of the background effects: the switch turns it off too.
  const [effects] = useEffectsOn();
  const enabled = allowed && effects;

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setEnabled(fine.matches && !reduced.matches);
    sync();
    fine.addEventListener("change", sync);
    reduced.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      root.classList.remove("si-cursor-on");
      return;
    }
    root.classList.add("si-cursor-on");
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;
    let x = -100;
    let y = -100;
    let rx = -100;
    let ry = -100;
    let raf = 0;
    let shown = false;

    const tick = () => {
      rx += (x - rx) * 0.2;
      ry += (y - ry) * 0.2;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = Math.abs(x - rx) + Math.abs(y - ry) > 0.2 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const target = e.target as Element | null;
      const overField = !!target?.closest?.(FIELD);
      const overAction = !overField && !!target?.closest?.("button, a, label, [role='button']");
      root.classList.toggle("si-cursor-native", overField);
      ring.classList.toggle("is-action", overAction);
      if (!shown) {
        shown = true;
        rx = x;
        ry = y;
        dot.classList.add("is-shown");
        ring.classList.add("is-shown");
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      shown = false;
      dot.classList.remove("is-shown");
      ring.classList.remove("is-shown");
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      root.classList.remove("si-cursor-on", "si-cursor-native");
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <div ref={ringRef} className="si-cursor-ring" aria-hidden="true" />
      <div ref={dotRef} className="si-cursor-dot" aria-hidden="true" />
    </>
  );
}
