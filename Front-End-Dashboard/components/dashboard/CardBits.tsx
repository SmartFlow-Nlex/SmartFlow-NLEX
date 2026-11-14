import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Lightbulb } from "lucide-react";

/**
 * The two pieces every analytics chart card shares (4 Nov 2026, user request):
 *   - CardIcon: the rounded tile beside the title, in the tab's own accent.
 *   - CardInsight: the quick-insight strip under the chart. Its text must be computed from the data the card
 *     draws, never written as a fixed claim; pass nothing (or null) while there is no data and it renders nothing.
 * Styles: app/styles/nlex-daylight.css, "Chart card icon and quick insight".
 */
export function CardIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="nc-card-icon" aria-hidden="true">
      <Icon size={20} strokeWidth={2} />
    </span>
  );
}

export function CardInsight({ lead, children }: { lead: string; children?: ReactNode }) {
  return (
    <p className="nc-card-insight">
      <Lightbulb className="nc-card-insight-icon" size={16} strokeWidth={2.2} aria-hidden="true" />
      <span>
        <b>{lead}</b>
        {children ? <> {children}</> : null}
      </span>
    </p>
  );
}
