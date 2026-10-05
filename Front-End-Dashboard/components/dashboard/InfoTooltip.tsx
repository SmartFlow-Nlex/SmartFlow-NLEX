"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

// The "i" icon beside a card title (or KPI tile) and its hover/focus popup —
// one shared implementation so every one of these looks and behaves
// identically, instead of five hand-copied native `title` attributes that
// inherit the browser's own (unstylable, plain) tooltip box.
//
// Portal + fixed-position tracking is ported from IncidentNarrative.tsx's
// MetricHint, for the same reason that component needed it: several of
// these cards sit inside a horizontally-scrollable container (`overflow-x:
// auto` also computes overflow-y as "auto", per the CSS spec — a same-
// element visible/non-visible mix isn't allowed), which clips a normally
// absolutely-positioned tooltip before it ever reaches the page. Rendering
// into document.body via a portal, positioned in viewport (`fixed`)
// coordinates measured from the trigger, escapes that entirely.
//
// The popup then measures itself and is kept inside the window: shifted
// sideways when the icon sits near an edge (a KPI tile beside the sidebar
// used to push half of it off-screen), and flipped below the icon when there
// is no room above. The arrow still points at the icon.
const EDGE = 12;

export default function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; bottom: number; left: number } | null>(null);
  const [place, setPlace] = useState<{ top: number; left: number; arrow: number; below: boolean } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  const measure = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 });
  };

  useLayoutEffect(() => {
    if (!show || !pos || !tipRef.current) {
      setPlace(null);
      return;
    }
    const r = tipRef.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    // Inside the dashboard, keep clear of the sidebar too: the content column is the bound.
    const main = document.querySelector("main.ds-main")?.getBoundingClientRect();
    const minLeft = main && pos.left > main.left ? main.left + EDGE : EDGE;
    const left = Math.max(minLeft, Math.min(pos.left - r.width / 2, vw - EDGE - r.width));
    // Above the icon unless that would run off the top of the window or under the
    // dashboard's sticky top bar; then below it.
    const bar = document.querySelector(".ds-topbar")?.getBoundingClientRect();
    const minTop = (bar && bar.bottom > 0 ? bar.bottom : 0) + EDGE;
    const below = pos.top - 9 - r.height < minTop;
    const top = below ? pos.bottom + 9 : pos.top - 9 - r.height;
    setPlace({ top, left, arrow: Math.max(14, Math.min(r.width - 14, pos.left - left)), below });
  }, [show, pos, text]);
  const open = () => {
    measure();
    setShow(true);
  };
  const close = () => setShow(false);

  useEffect(() => {
    if (!show) return;
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  return (
    <>
    {/* A word joiner, so a title never wraps between its last word and the icon. */}
    {"\u2060"}
    <span
      ref={ref}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      tabIndex={0}
      role="button"
      aria-label={text}
      style={{
        display: "inline-flex", verticalAlign: "middle", marginLeft: "5px",
        color: show ? "var(--action)" : "var(--text-muted)", cursor: "help",
        transition: "color 120ms ease",
      }}
    >
      <Info size={13} strokeWidth={2.25} aria-hidden="true" />
      {show &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            style={{
              position: "fixed",
              top: place ? place.top : pos.top,
              left: place ? place.left : 0,
              visibility: place ? "visible" : "hidden",
              background: "var(--bg-raised)",
              border: "1px solid var(--border-strong)",
              color: "var(--text-primary)",
              padding: "11px 14px",
              borderRadius: 10,
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-body)",
              fontWeight: 300,
              lineHeight: 1.5,
              letterSpacing: 0,
              textTransform: "none",
              width: "max-content",
              maxWidth: 320,
              zIndex: 2147483647,
              boxShadow: "var(--shadow-lg)",
              textAlign: "left",
              pointerEvents: "none",
            }}
          >
            {text}
            <span
              style={{
                position: "absolute",
                ...(place?.below ? { bottom: "100%" } : { top: "100%" }),
                left: place ? place.arrow : "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                ...(place?.below
                  ? { borderBottom: "6px solid var(--border-strong)" }
                  : { borderTop: "6px solid var(--border-strong)" }),
              }}
            />
          </span>,
          document.body
        )}
    </span>
    </>
  );
}
