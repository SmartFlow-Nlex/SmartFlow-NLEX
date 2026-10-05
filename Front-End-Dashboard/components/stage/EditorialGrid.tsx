"use client";

import { useEffect, useRef } from "react";
import { onStage } from "./stage-bus";

/**
 * Editorial grid furniture: five vertical hairlines on the content columns,
 * each carrying two dots that drift with progress (the <main> scroll on
 * dashboard pages, the story on sign-in). Ornament only, so aria-hidden, and
 * the dots hold still under prefers-reduced-motion.
 *
 * Dot i starts at (i*17)%80+10 percent and travels speed 90+(i*55)%180 percent
 * per unit of progress, reversed on even i, wrapping 0-100.
 */
const LINES = 5;

export default function EditorialGrid({ variant }: { variant: "signin" | "dashboard" }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const dots = Array.from(root.querySelectorAll<HTMLElement>(".eg-dot"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const place = (progress: number) => {
      dots.forEach((d, i) => {
        const start = ((i * 17) % 80) + 10;
        const speed = 90 + ((i * 55) % 180);
        const dir = i % 2 === 0 ? -1 : 1;
        const raw = start + dir * speed * (reduced ? 0 : progress);
        const pos = ((raw % 100) + 100) % 100;
        d.style.top = `${pos}%`;
      });
    };
    place(0);

    if (variant === "signin") {
      // The story is the sign-in page's progress: ease toward its position.
      let target = 0;
      let now = 0;
      let raf = 0;
      const tick = () => {
        now += (target - now) * 0.06;
        place(now);
        if (Math.abs(target - now) > 0.0005) raf = requestAnimationFrame(tick);
      };
      const off = onStage((e) => {
        if (e.type !== "story") return;
        target = e.count > 1 ? e.index / (e.count - 1) : 0;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
      });
      return () => {
        off();
        cancelAnimationFrame(raf);
      };
    }

    // Dashboard: follow the inner <main> scroller (the document never scrolls).
    let main: HTMLElement | null = null;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!main) return;
        const max = main.scrollHeight - main.clientHeight;
        place(max > 1 ? main.scrollTop / max : 0);
      });
    };
    const attach = () => {
      const next = document.querySelector<HTMLElement>("main.ds-main");
      if (next === main) return;
      main?.removeEventListener("scroll", onScroll);
      main = next;
      main?.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    };
    attach();
    const poll = window.setInterval(attach, 1000);
    return () => {
      window.clearInterval(poll);
      main?.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [variant]);

  return (
    <div ref={rootRef} className="eg-grid" data-variant={variant} aria-hidden="true">
      {Array.from({ length: LINES }, (_, line) => (
        <span key={line} className="eg-line" style={{ ["--eg-i" as string]: line }}>
          <i className="eg-dot" />
          <i className="eg-dot" />
        </span>
      ))}
    </div>
  );
}
