"use client";

import { useMemo, useState, type ReactNode } from "react";

/**
 * Click-to-sort column headers for the "View all" tables (5 Nov 2026, user request).
 * Click a header to sort by it; click again to flip ascending / descending. The arrow shows the current order.
 * Styles: app/styles/nlex-daylight.css, "Sortable table headers".
 */
export type SortDir = "asc" | "desc";
export type SortCol<T> = {
  key: string;
  label: ReactNode;
  /** The value rows are ordered by. Omit for a column that cannot be sorted. */
  value?: (row: T) => number | string | null | undefined;
  /** Right-aligned numeric column. */
  num?: boolean;
  /** Which way a first click sorts: numbers start largest-first, text A–Z. */
  firstDir?: SortDir;
  /** An ordering with no column of its own (e.g. the opening order); not drawn as a header. */
  hidden?: boolean;
};

export function useSortedRows<T>(rows: T[], cols: SortCol<T>[], initial: { key: string; dir: SortDir }) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sort.key);
    if (!col?.value) return rows;
    const get = col.value;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // blanks last, whichever way
      if (y == null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * sign;
    });
  }, [rows, cols, sort]);
  const toggle = (key: string) =>
    setSort((s) => {
      if (s.key === key) return { key, dir: s.dir === "asc" ? "desc" : "asc" };
      const col = cols.find((c) => c.key === key);
      return { key, dir: col?.firstDir ?? (col?.num ? "desc" : "asc") };
    });
  return { sorted, sort, toggle };
}

export function SortHead<T>({ cols, sort, onSort }: { cols: SortCol<T>[]; sort: { key: string; dir: SortDir }; onSort: (key: string) => void }) {
  return (
    <thead>
      <tr>
        {cols.filter((c) => !c.hidden).map((c) => {
          const active = sort.key === c.key;
          return (
            <th
              key={c.key}
              className={c.num ? "st-num" : undefined}
              aria-sort={c.value ? (active ? (sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
            >
              {c.value ? (
                <button type="button" className={`st-sort${active ? " is-active" : ""}`} onClick={() => onSort(c.key)}>
                  <span>{c.label}</span>
                  <svg className="st-arrow" width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
                    <path d="M5 1.5 8.5 5h-7z" className={active && sort.dir === "asc" ? "on" : undefined} />
                    <path d="M5 10.5 1.5 7h7z" className={active && sort.dir === "desc" ? "on" : undefined} />
                  </svg>
                </button>
              ) : (
                c.label
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
