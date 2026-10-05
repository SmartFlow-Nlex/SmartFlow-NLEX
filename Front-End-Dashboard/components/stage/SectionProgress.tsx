"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Section progress: thin dashes at the right edge, one per real section of a
 * long page, filled as you read. Each dash is a button that jumps to its
 * section, so the stack doubles as a keyboard table of contents.
 *
 * Sections are the elements a page marks with `data-section="<heading>"`.
 * Shown only when a page has three or more. It scrolls the shell's inner
 * <main> (the document itself never scrolls) and never touches the URL.
 */
type Section = { el: HTMLElement; label: string };

export default function SectionProgress() {
  const pathname = usePathname();
  const [sections, setSections] = useState<Section[]>([]);
  const [fills, setFills] = useState<number[]>([]);

  // Find the page's sections; re-scan as panels mount and data arrives.
  useEffect(() => {
    let alive = true;
    const scan = () => {
      if (!alive) return;
      const main = document.querySelector<HTMLElement>("main.ds-main");
      if (!main) return;
      const found = Array.from(main.querySelectorAll<HTMLElement>("[data-section]"))
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ el, label: el.dataset.section || "Section" }));
      setSections((prev) =>
        prev.length === found.length && prev.every((p, i) => p.el === found[i].el && p.label === found[i].label) ? prev : found,
      );
    };
    scan();
    const mo = new MutationObserver(() => scan());
    const main = document.querySelector<HTMLElement>("main.ds-main");
    if (main) mo.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-section"] });
    const t = window.setInterval(scan, 1500);
    return () => {
      alive = false;
      mo.disconnect();
      window.clearInterval(t);
    };
  }, [pathname]);

  // Fill each dash by how far its section has been read.
  useEffect(() => {
    const main = document.querySelector<HTMLElement>("main.ds-main");
    if (!main || sections.length < 3) return;
    let raf = 0;
    const measure = () => {
      const top = main.getBoundingClientRect().top;
      const view = main.clientHeight;
      const next = sections.map(({ el }) => {
        const r = el.getBoundingClientRect();
        const start = r.top - top - view * 0.35;
        const read = -start / Math.max(r.height, 1);
        return Math.max(0, Math.min(1, read));
      });
      // At the very bottom, everything has been read.
      if (main.scrollTop + view >= main.scrollHeight - 2) next.fill(1);
      setFills((prev) => (prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 0.01) ? prev : next));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    main.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      main.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [sections]);

  if (sections.length < 3) return null;

  const current = fills.reduce((best, f, i) => (f > 0 ? i : best), 0);

  const jump = (el: HTMLElement) => {
    const main = document.querySelector<HTMLElement>("main.ds-main");
    if (!main) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const topbar = parseFloat(getComputedStyle(main).getPropertyValue("--ds-topbar-h")) || 64;
    const y = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - topbar - 16;
    main.scrollTo({ top: Math.max(0, y), behavior: reduced ? "auto" : "smooth" });
    // Move focus with the reader so the keyboard path continues from there.
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  };

  return (
    <nav className="sp-progress" aria-label="Sections on this page">
      {sections.map((s, i) => (
        <button
          key={i}
          type="button"
          className={`sp-dash${i === current ? " is-current" : ""}`}
          aria-label={`Jump to ${s.label}`}
          aria-current={i === current ? "true" : undefined}
          title={s.label}
          onClick={() => jump(s.el)}
        >
          <span className="sp-fill" style={{ transform: `scaleY(${fills[i] ?? 0})` }} />
        </button>
      ))}
    </nav>
  );
}
