"use client";

// Shared chrome for the Incident tab's Prescriptive cards — Shell/Banner/Foot/
// Empty, mirroring the Traffic tab's Booth Staffing Plan shell
// (PrescriptiveTrafficPanels.tsx). Extracted here once a second Prescriptive
// card needed the same pieces, rather than duplicated a second time.

import InfoTooltip from "./InfoTooltip";

export const CARD: React.CSSProperties = { padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 };

export function Shell({ title, hint, children, right }: { title: string; hint: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="chart-card wide" style={CARD}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
            {title} <InfoTooltip text={hint} />
          </h3>
        </div>
        {right}
      </div>
      {children}
    </article>
  );
}

export const Banner = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: "color-mix(in srgb, var(--page-accent, #4f46e5) 9%, transparent)",
      border: "1px solid color-mix(in srgb, var(--page-accent, #4f46e5) 28%, transparent)",
      borderRadius: 10, padding: "12px 14px", fontSize: "0.85rem", lineHeight: 1.5, color: "var(--text-primary)",
    }}
  >
    {children}
  </div>
);

export const Foot = ({ children }: { children: React.ReactNode }) => (
  <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.45 }}>{children}</p>
);

export const Empty = ({ msg }: { msg: string }) => (
  <article className="chart-card wide" style={{ ...CARD, minHeight: 220, justifyContent: "center", alignItems: "center", color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center" }}>
    {msg}
  </article>
);
