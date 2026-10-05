import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import TitleReveal from "../stage/TitleReveal";
import PageGroupName from "./PageGroupName";

/** Shared title block for every dashboard tab. Styles live in globals.css
    (`.ds-page-header`) so both layout families — the CSS-grid analytics pages
    and the plain `.ds-content` pages — render an identical header.

    Night Corridor pattern: an eyebrow naming the page's group (with the page's
    icon), the Italiana title that blurs up letter by letter on arrival, a
    one-line description of what the page answers, and the page's own controls
    on the same baseline (wrapping below on narrow screens). */
export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  accent,
  aside,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Which analytics domain this page belongs to. Sets --page-accent, which
   *  the header and the mode tabs colour themselves from, so Traffic,
   *  Incidents and Emissions are identifiable before a word is read. */
  accent?: "traffic" | "incident" | "emissions";
  /** Decoration at the far end of the header (the Overview mascot). */
  aside?: ReactNode;
}) {
  return (
    <header className="ds-page-header" data-accent={accent}>
      <div className="ds-page-header-text">
        <p className="ds-page-eyebrow">
          <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
          <PageGroupName />
        </p>
        <TitleReveal as="h1" text={title} className="ds-page-title" />
        {subtitle ? <p className="ds-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ds-page-header-actions">{actions}</div> : null}
      {aside ? <div className="ds-page-header-aside">{aside}</div> : null}
    </header>
  );
}
