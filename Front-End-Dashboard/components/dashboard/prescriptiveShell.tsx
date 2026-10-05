"use client";

// Shared chrome for the Incident tab's Prescriptive cards — Shell/Banner/Foot/
// Empty, mirroring the Traffic tab's Booth Staffing Plan shell
// (PrescriptiveTrafficPanels.tsx). Extracted here once a second Prescriptive
// card needed the same pieces, rather than duplicated a second time.
//
// Night Corridor: Prescriptive reads as action cards. ActionCard states the
// action, then where / when / expected effect / confidence as labelled facts,
// with the basis and full reasoning behind "Details" on the same card.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import InfoTooltip from "./InfoTooltip";
import StateNote from "../stage/StateNote";

export const CARD: React.CSSProperties = { padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 };

export function Shell({ title, hint, children, right }: { title: string; hint: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="chart-card wide inc-card">
      <div className="inc-card-head">
        <div className="inc-card-titles">
          <h3 className="inc-card-title">
            {title} <InfoTooltip text={hint} />
          </h3>
        </div>
        {right}
      </div>
      {children}
    </article>
  );
}

export const Banner = ({ children }: { children: React.ReactNode }) => <div className="inc-note">{children}</div>;

export const Foot = ({ children }: { children: React.ReactNode }) => <p className="inc-caption">{children}</p>;

/** Loading (no `kind`) or an unavailable state (`kind`), which keeps its own words beside the mascot. */
export const Empty = ({ msg, kind }: { msg: string; kind?: "nodata" | "error" }) => (
  <article className="chart-card wide inc-card" style={{ minHeight: 220, justifyContent: "center" }}>
    {kind ? (
      <StateNote kind={kind} role={kind === "error" ? "alert" : undefined}>
        {msg}
      </StateNote>
    ) : (
      <div className="inc-loading" role="status">
        {msg}
      </div>
    )}
  </article>
);

export type ActionFact = { label: string; value: ReactNode };

export function ActionCard({
  icon: Icon,
  title,
  lede,
  facts,
  details,
  lead,
  tag,
  children,
}: {
  icon: LucideIcon;
  /** The action itself. */
  title: ReactNode;
  /** One short line of context (about 25 words at most). */
  lede?: ReactNode;
  /** Where, when, expected effect, confidence: whichever the data supports. */
  facts: ActionFact[];
  /** The basis and full reasoning, behind "Details". */
  details?: ReactNode;
  /** The card's primary recommendation, drawn with the page accent. */
  lead?: boolean;
  /** A short computed verdict pill beside the title. */
  tag?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`inc-action${lead ? " is-lead" : ""}`}>
      <div className="inc-action-head">
        <span className="inc-action-icon">
          <Icon size={16} strokeWidth={2} aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h4 className="inc-action-title">{title}</h4>
          {lede ? (
            <p className="inc-action-lede" style={{ marginTop: 6 }}>
              {lede}
            </p>
          ) : null}
        </div>
        {tag ? <div className="inc-action-tag">{tag}</div> : null}
      </div>
      {facts.length > 0 && (
        <dl className="inc-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      {details ? (
        <details className="nc-details">
          <summary>Details</summary>
          <div>{details}</div>
        </details>
      ) : null}
    </section>
  );
}
