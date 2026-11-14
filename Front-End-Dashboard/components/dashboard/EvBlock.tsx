"use client";

import { useState, type ReactNode } from "react";

/** One numbered step of a validation window: the number and title always show, the body opens on a click.
 *  The first step starts open, so the window opens short with the most important answer showing (2026-10-26).
 *  Shared by the congestion map's and the event surge card's validation details (13 Nov 2026). */
export default function EvBlock({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(n === 1);
  const toggle = () => setOpen((o) => !o);
  return (
    <div className="nct-ev-block">
      <button type="button" className="nct-ev-n" onClick={toggle} aria-expanded={open}
        aria-label={`${open ? "Close" : "Open"} step ${n}`} style={{ cursor: "pointer", border: "none", font: "inherit" }}>
        {n}
      </button>
      <div style={{ minWidth: 0 }}>
        <button type="button" className="nct-ev-title" onClick={toggle} aria-expanded={open}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none",
                   border: "none", padding: 0, cursor: "pointer", font: "inherit", fontWeight: 600, color: "inherit" }}>
          <span>{title}</span>
          <span aria-hidden="true" style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)",
                transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▶</span>
        </button>
        {open && <div className="nct-ev-body">{children}</div>}
      </div>
    </div>
  );
}
