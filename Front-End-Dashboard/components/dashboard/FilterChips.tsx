"use client";

import { X } from "lucide-react";

/**
 * The filters in force, beside the filter bar (5 Nov 2026, user request): the Range always, as its exact dates; any
 * other filter once it is moved off its default, with a × to put it back. Styles: app/styles/nlex-daylight.css, "Active filter chips".
 */
export type FilterChip = {
  key: string;
  label: string;
  value: string;
  /** Set when the filter is off its default: the × returns it there. */
  onClear?: () => void;
  /** What the × returns to, for its label ("12 months", "all weather"). */
  resetTo?: string;
};

/** "2025-07-01" -> "Jul 1, 2025": the exact dates a Range covers, in words. */
export function rangeText(from?: string | null, to?: string | null): string | null {
  if (!from || !to) return null;
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${f(from)} – ${f(to)}`;
}

export default function FilterChips({ chips }: { chips: FilterChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="fc-row" role="group" aria-label="Filters in use">
      {chips.map((c) => (
        <span key={c.key} className={`fc-chip${c.onClear ? " is-set" : ""}`}>
          <span className="fc-label">{c.label}</span>
          <span className="fc-value">
            {c.value}
            {c.onClear ? (
              <button
                type="button"
                onClick={c.onClear}
                aria-label={`Clear the ${c.label.toLowerCase()} filter${c.resetTo ? `, back to ${c.resetTo}` : ""}`}
                title={c.resetTo ? `Back to ${c.resetTo}` : "Clear"}
              >
                <X size={12} strokeWidth={2.4} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </span>
      ))}
    </div>
  );
}
