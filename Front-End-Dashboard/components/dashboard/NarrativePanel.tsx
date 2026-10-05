"use client";

import { useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import AiModelInsight, { type InsightMetric } from "./AiModelInsight";

/**
 * The shell every Narrative Explanation on the Predictive tab wears: indigo
 * wash, sparkle tile, a collapsed row that still carries the verdict as chips,
 * and one button that spends the model call.
 *
 * Collapsed by default everywhere. Generating costs a request to the language
 * model, so it is a deliberate action rather than something every page load
 * spends on a reader who may not scroll this far.
 *
 * The module-specific parts — which endpoint, what payload, what the chips say
 * — are props, because the three cards are scored in genuinely different ways:
 * error for the volume forecast, classification accuracy for the congestion
 * map, uplift error against doing nothing for the event surge. Sharing the
 * shell keeps them looking like one system; sharing a prompt would have made
 * one of them lie.
 */
export default function NarrativePanel({
  chips,
  contextLine,
  metrics,
  endpoint,
  subjectKey,
  buildBody,
  horizonDays = 1,
  labelFor,
}: {
  /** Kept for callers; the collapsed state is now a button with no room for it. */
  subtitle?: string;
  /** The headline verdict, visible before anyone opens the panel. */
  chips?: ReactNode;
  /** One muted line above the read-out saying what it was read from. */
  contextLine?: ReactNode;
  metrics: InsightMetric[];
  endpoint: string;
  subjectKey: string;
  buildBody: () => unknown;
  horizonDays?: number;
  labelFor?: (modelName: string) => string;
}) {
  const [open, setOpen] = useState(false);

  // Nothing but the button until it is pressed.
  if (!open) return <GenerateReportButton onClick={() => setOpen(true)} />;

  return (
    <section className="nc-narrative">
      <div className="nc-narrative-head">
        <span className="nc-narrative-icon">
          <FileText size={15} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <h4>Narrative Explanation</h4>

        <button type="button" className="btn-muted nc-narrative-hide" onClick={() => setOpen((v) => !v)}>
          Hide report
        </button>
      </div>

      <div className="nc-narrative-body">
        {chips && <div className="nc-narrative-chips">{chips}</div>}
        {contextLine && <p className="nc-narrative-context">{contextLine}</p>}
        <AiModelInsight
          quantity="volume"
          metrics={metrics}
          horizonDays={horizonDays}
          endpoint={endpoint}
          subjectKey={subjectKey}
          buildBody={buildBody}
          labelFor={labelFor}
        />
      </div>
    </section>
  );
}

/** Small pill for the collapsed row, so the cards' chips match each other. */
export function NarrativeChip({ tone = "neutral", children }: { tone?: "good" | "neutral"; children: ReactNode }) {
  const good = tone === "good";
  return (
    <span className={`pill${good ? " green" : ""}`} style={{ textTransform: "none", letterSpacing: 0, fontSize: "var(--fs-body)", fontWeight: 400 }}>
      {children}
    </span>
  );
}

/**
 * The one control a collapsed Narrative Explanation shows.
 *
 * Generating spends a language-model request, so it stays a deliberate press
 * rather than something every page load pays for on a reader who may never
 * scroll this far. Shared by all three cards so the offer looks identical
 * wherever it appears.
 */
export function GenerateReportButton({ onClick }: { onClick: () => void }) {
  return (
    // The wrapper is what makes the three cards agree. Returned bare, the
    // button inherited whatever alignment its parent happened to have -- a
    // flex row here, a grid cell there -- so the same control sat at a
    // different size and offset on each Predictive tab.
    <div className="ds-narrative-cta">
      <button type="button" className="ds-narrative-btn" onClick={onClick}>
        <FileText size={15} strokeWidth={2.2} aria-hidden="true" />
        Generate report
      </button>
    </div>
  );
}
