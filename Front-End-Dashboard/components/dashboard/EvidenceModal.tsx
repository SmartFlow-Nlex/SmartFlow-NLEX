"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, ShieldCheck, X } from "lucide-react";

/**
 * A model's validation evidence: a one-line strip on the card (title and the
 * headline figures as pills) that opens the full evidence -- every table,
 * figure and note -- in a modal, so the card stays short.
 *
 * The modal is portalled into the dashboard shell (falling back to <body>) so
 * the page accent still applies, and `scopeClass` re-applies a page's own
 * scoping class inside it (Emissions styles live under `.viz-emissions`).
 * Esc, the close button and a click on the backdrop close it; focus moves to
 * the close button on open, is kept inside while open, and returns to whatever
 * opened it. Pass `open` / `onOpenChange` to open it from elsewhere on the card
 * (Incidents' trust pills), and `hideTrigger` when those are the only way in.
 */
export default function EvidenceModal({
  title = "Validation evidence",
  subtitle,
  strip,
  children,
  className,
  scopeClass,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
  icon,
}: {
  title?: string;
  /** One line under the modal title. */
  subtitle?: ReactNode;
  /** The headline figures, shown as pills on the strip. */
  strip?: ReactNode;
  /** The full evidence. */
  children: ReactNode;
  /** Extra classes on the strip's wrapper. */
  className?: string;
  /** A page-scoping class the evidence's styles depend on. */
  scopeClass?: string;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Render no strip: something else on the card opens the modal. */
  hideTrigger?: boolean;
  /** The icon beside the modal title; defaults to the validation shield, null for none. */
  icon?: ReactNode | null;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setOpenState(v);
    onOpenChange?.(v);
  };
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement as HTMLElement | null;
    const trigger = active && active !== document.body ? active : triggerRef.current;
    const main = document.querySelector<HTMLElement>("main.ds-main");
    const prevOverflow = main?.style.overflow ?? "";
    if (main) main.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (main) main.style.overflow = prevOverflow;
      trigger?.focus();
    };
    // setOpen is recreated each render; the effect only cares about open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const host = typeof document !== "undefined" ? document.querySelector(".ds-shell") ?? document.body : null;

  return (
    <div className={hideTrigger ? "ev-trust is-bare" : `nct-trust ev-trust${className ? ` ${className}` : ""}`}>
      {!hideTrigger && <button
        ref={triggerRef}
        type="button"
        className="nct-trust-strip ev-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="nct-trust-title" style={{ order: 1 }}>
          <span className="nct-trust-icon" aria-hidden="true">
            <ShieldCheck size={15} strokeWidth={2.2} />
          </span>
          {title}
        </span>
        <span className="nct-trust-toggle ev-open" style={{ order: 2 }}>
          View <Maximize2 size={13} strokeWidth={2.2} aria-hidden="true" />
        </span>
        {strip && <span aria-hidden className="nct-trust-break" style={{ order: 3 }} />}
        {strip}
      </button>}

      {open &&
        host &&
        createPortal(
          <div className="ds-modal-backdrop ev-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div ref={dialogRef} className="ds-modal ev-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
              <header className="ds-modal-head ev-head">
                <div>
                  <h2 id={titleId}>
                    {icon !== null && (
                      <span className="nct-trust-icon" aria-hidden="true">
                        {icon ?? <ShieldCheck size={15} strokeWidth={2.2} />}
                      </span>
                    )}
                    {title}
                  </h2>
                  {subtitle && <p>{subtitle}</p>}
                </div>
                <button ref={closeRef} type="button" className="ds-modal-close" aria-label="Close" onClick={() => setOpen(false)}>
                  <X size={16} />
                </button>
              </header>
              <div className={`ev-body${scopeClass ? ` ${scopeClass}` : ""}`}>{children}</div>
            </div>
          </div>,
          host,
        )}
    </div>
  );
}
