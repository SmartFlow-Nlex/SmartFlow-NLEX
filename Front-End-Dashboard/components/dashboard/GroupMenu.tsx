"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * A grouped dropdown in the dashboard's own style (13 Nov 2026, user request "improve the drop down designs").
 *
 * A native <select> draws the browser's own list, which cannot be styled: a white box, bold grey group headings
 * and a solid blue bar on the chosen row. This is the same choice with sticky group headings, a main line and a
 * muted side note per option, small tags, and a tint with a check on the chosen one. Closes on Escape (without
 * closing anything behind it) or a click outside; Up/Down on the closed button steps through the options.
 * Styles: app/styles/nlex-daylight.css, "Grouped dropdown".
 */
export type GroupMenuItem = {
  value: string;
  main: ReactNode;
  /** A muted note on the right ("in 12 days"). */
  side?: ReactNode;
  /** Small tags after the main line ("Day 2", "Unverified"). */
  tags?: { label: string; tone?: "muted" | "warn" | "accent" }[];
};
export type GroupMenuGroup = { label?: string; items: GroupMenuItem[] };

export default function GroupMenu({
  value,
  onChange,
  groups,
  ariaLabel,
  buttonLabel,
  minWidth = 220,
  menuWidth = 420,
}: {
  value: string;
  onChange: (v: string) => void;
  groups: GroupMenuGroup[];
  ariaLabel: string;
  /** What the closed button shows; defaults to the chosen option's main line. */
  buttonLabel?: ReactNode;
  minWidth?: number;
  menuWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const flat = groups.flatMap((g) => g.items);
  const current = flat.find((i) => i.value === value) ?? flat[0];

  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", out);
    window.addEventListener("keydown", key, true);
    list.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
    return () => { document.removeEventListener("mousedown", out); window.removeEventListener("keydown", key, true); };
  }, [open]);

  const step = (d: 1 | -1) => {
    const i = flat.findIndex((x) => x.value === value);
    const next = flat[Math.max(0, Math.min(flat.length - 1, (i < 0 ? 0 : i) + d))];
    if (next) onChange(next.value);
  };

  return (
    <div className={`gm${open ? " is-open" : ""}`} ref={wrap} style={{ ["--gm-min" as string]: `${minWidth}px`, ["--gm-menu" as string]: `${menuWidth}px` }}>
      <button
        type="button"
        className="gm-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
          if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
        }}
      >
        <span className="gm-btn-main">{buttonLabel ?? current?.main ?? "—"}</span>
        <ChevronDown size={15} aria-hidden="true" className="gm-chev" />
      </button>
      {open && (
        <div className="gm-menu" role="listbox" aria-label={ariaLabel} ref={list}>
          {groups.map((g, gi) => (
            <div key={g.label ?? `g${gi}`} className="gm-group">
              {g.label && <div className="gm-head">{g.label}</div>}
              {g.items.map((it) => {
                const on = it.value === value;
                return (
                  <button
                    key={it.value}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`gm-opt${on ? " is-on" : ""}`}
                    onClick={() => { onChange(it.value); setOpen(false); }}
                  >
                    <span className="gm-check" aria-hidden="true">{on && <Check size={14} strokeWidth={2.6} />}</span>
                    <span className="gm-main">
                      {it.main}
                      {it.tags?.map((t) => (
                        <em key={t.label} className={`gm-tag is-${t.tone ?? "muted"}`}>{t.label}</em>
                      ))}
                    </span>
                    {it.side != null && <span className="gm-side">{it.side}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
