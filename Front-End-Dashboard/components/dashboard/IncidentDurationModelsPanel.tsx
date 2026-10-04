"use client";

import { useState } from "react";
import SecondaryIncidentRiskPanel from "./SecondaryIncidentRiskPanel";
import BreakdownResponseModel from "./BreakdownResponseModel";

// Merges two independent "how long / how severe" panels under one toggle
// instead of two always-visible cards, so the Predictive tab reads as three
// visualizations (Forecast, Ranking, this one) rather than four. Both halves
// are genuinely the same kind of question -- Secondary Incident Risk covers
// accident severity/clearance/secondary-risk (Ordinal Logistic/XGBoost/Cox
// PH, from accident_data), Response Time Breakdown covers breakdown dispatch
// response time (Cox PH/XGBoost, from breakdown_data) -- just scored on two
// different source tables, which is also why they stay two separate fetches
// rather than one merged component: neither one's internals are touched
// here, this only changes which is mounted.
export default function IncidentDurationModelsPanel() {
  const [source, setSource] = useState<"accident" | "breakdown">("accident");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div
        style={{
          display: "inline-flex", gap: "2px", padding: "3px", alignSelf: "flex-start",
          background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "999px",
        }}
      >
        {(["accident", "breakdown"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setSource(v)}
            style={{
              padding: "6px 18px", borderRadius: "999px", border: "none", cursor: "pointer",
              background: source === v ? "var(--page-accent, #4f46e5)" : "transparent",
              color: source === v ? "var(--text-on-dark)" : "var(--text-secondary)",
              fontWeight: 700, fontSize: "0.8rem",
            }}
          >
            {v === "accident" ? "Accident" : "Breakdown"}
          </button>
        ))}
      </div>
      {source === "accident" ? <SecondaryIncidentRiskPanel /> : <BreakdownResponseModel />}
    </div>
  );
}
