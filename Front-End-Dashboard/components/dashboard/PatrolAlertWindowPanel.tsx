"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Shell, Empty, ActionCard } from "./prescriptiveShell";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const fmtHour = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);

// Single-hue sequential ramp for the shape bars: the incident magnitude ramp
// (--inc-heat-lo -> --inc-heat-hi, app/styles/nc-incident.css), which follows
// the theme. It replaced a fixed light-grey-to-navy RGB ramp whose peak end
// vanished on the Night Corridor dark stage.
function heatShade(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  return `color-mix(in oklab, var(--inc-heat-hi) ${(clamped * 100).toFixed(1)}%, var(--inc-heat-lo))`;
}

// Color by RANK within the table's own values, not by linear position between
// min and max. Real incident-by-hour data isn't evenly spread: a handful of
// quiet overnight hours sit well below a wide daytime "plateau" that's all
// bunched within a narrow band near the top -- linear min-max scaling then
// spends most of the ramp on the rare very-low hours and crams the entire
// plateau into a sliver near the dark end, so only the single tallest peak
// stands out and every other busy hour looks the same (confirmed against the
// actual data: that's exactly the "still not strong enough" result). Ranking
// first guarantees the ramp's steps are spread evenly across however the real
// values are distributed, however clustered -- whatever shape the data takes
// on a given Range, not just the one shape this was eyeballed against.
// O(n^2) over ~168 cells (7 days x 24h) is a few thousand comparisons, far
// below anything worth a sort-and-binary-search for.
function percentileOf(v: number, all: number[]): number {
  let lower = 0;
  let equal = 0;
  for (const x of all) {
    if (x < v) lower++;
    else if (x === v) equal++;
  }
  return all.length <= 1 ? 0 : (lower + equal / 2) / (all.length - 1);
}

// Same Mon..Sun display order the Descriptive tab's own Time-of-Day chart
// uses (DOW_ORDER/DOW_LABELS in incident/page.tsx) — kept in sync by hand so
// this card's day order matches that chart's, not JS's Sun-first getDay().
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

type HeatmapPoint = { dow: number; hour: number; v: number };
type AnalyticsSlice = { heatmap: HeatmapPoint[]; range: { from: string; to: string } };

// Built on the Descriptive tab's own Hour x Day-of-week incident frequency
// (/api/incident/analytics' `heatmap`, the exact table its Time-of-Day chart
// already renders as Weekday/Weekend lines) -- not a separately-modeled
// hourly forecast, since the predictive pipeline only ever outputs a DAILY
// count (see incident.service.ts's own comment on why getIncidentHourlyFromDb
// spreads a daily total rather than forecasting hourly). This panel turns
// that same measured profile into an operational answer the Descriptive
// chart doesn't give, broken out by each of the 7 days rather than just a
// weekday/weekend split: not just *when* incidents peak, but the *window* of
// hours patrol should treat as elevated-risk, defined per day as every hour
// whose average sits above that specific day's own mean -- the same "above
// its own median/mean, not a fixed threshold" rule the rest of the
// Prescriptive tab uses, so a Friday with a sharper evening spike gets a
// different window than a flatter Tuesday instead of both being forced into
// one "weekday" bucket.
type Profile = { hours: number[]; mean: number; peakHour: number; windows: [number, number][] };

function buildProfile(hourly: number[]): Profile {
  const mean = hourly.reduce((s, v) => s + v, 0) / 24;
  const peakHour = hourly.indexOf(Math.max(...hourly));
  const windows: [number, number][] = [];
  let start: number | null = null;
  for (let h = 0; h < 24; h++) {
    const elevated = hourly[h] > mean;
    if (elevated && start === null) start = h;
    if (!elevated && start !== null) {
      windows.push([start, h]);
      start = null;
    }
  }
  if (start !== null) windows.push([start, 24]);
  return { hours: hourly, mean, peakHour, windows };
}

const windowLabel = ([start, end]: [number, number]) => `${fmtHour(start)} – ${fmtHour(end % 24)}`;
const windowSpanHours = ([start, end]: [number, number]) => end - start;

type DayRow = { label: string; dow: number; days: number; profile: Profile; primary: [number, number] | null };

type Props = {
  // Same Range control every other Prescriptive card takes — each day's
  // profile is measured over whichever window is selected, so a corridor
  // whose rhythm has shifted recently will show that shift here too.
  months?: "3" | "12" | "all";
  from?: string;
  to?: string;
};

export default function PatrolAlertWindowPanel({ months = "12", from, to }: Props) {
  const [data, setData] = useState<AnalyticsSlice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams();
    if (months) qs.set("months", months);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`${BACKEND}/api/incident/analytics?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setData({ heatmap: json.data.heatmap, range: json.data.range });
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the hourly incident profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [months, from, to]);

  if (loading && data === null) return <Empty msg="Loading patrol alert schedule…" />;
  if (error || !data || data.heatmap.length === 0) {
    return <Empty kind={error ? "error" : "nodata"} msg={`Patrol alert schedule unavailable: ${error ?? "no hourly incident data for this Range."}`} />;
  }

  // How many of each specific weekday (not just weekday-vs-weekend) fall in
  // the selected Range, so e.g. three Fridays' incidents are averaged over
  // three days, not folded into a five-day "weekday" denominator.
  const dowCount = Array(7).fill(0);
  const end = new Date(`${data.range.to}T00:00:00`);
  for (const d = new Date(`${data.range.from}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) dowCount[d.getDay()]++;

  const hourByDow: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of data.heatmap) hourByDow[r.dow][r.hour] += r.v;

  const rows: DayRow[] = DOW_ORDER.map((dow, i) => {
    const days = dowCount[dow];
    const hourly = hourByDow[dow].map((v) => (days > 0 ? v / days : 0));
    const profile = buildProfile(hourly);
    const primary =
      days === 0
        ? null
        : profile.windows.length > 0
          ? [...profile.windows].sort((a, b) => windowSpanHours(b) - windowSpanHours(a))[0]
          : ([profile.peakHour, (profile.peakHour + 1) % 24] as [number, number]);
    return { label: DOW_LABELS[i], dow, days, profile, primary };
  });

  const withWindow = rows.filter((r) => r.primary != null) as (DayRow & { primary: [number, number] })[];
  if (withWindow.length === 0) {
    return <Empty kind="nodata" msg="Patrol alert schedule unavailable: no days in the selected Range have incident data." />;
  }
  const widest = [...withWindow].sort((a, b) => windowSpanHours(b.primary) - windowSpanHours(a.primary))[0];
  const allHours = rows.flatMap((r) => r.profile.hours);
  const maxHour = Math.max(...allHours, 1e-9);

  return (
    <Shell
      title="Patrol Alert Schedule"
      hint="Hours patrol should treat as elevated-risk, one row per day of the week, from the Descriptive tab's own Hour x Day-of-week incident frequency — the same table its Time-of-Day chart draws Weekday/Weekend lines from, broken out further here since different weekdays (and Saturday vs Sunday) don't share one rhythm. A window is any run of hours whose average incident count sits above that specific day's own mean, so it's sized to this corridor's measured rhythm rather than a fixed span like 'rush hour.'"
    >
      <ActionCard
        lead
        icon={Clock}
        title={`${widest.label}: longest alert window`}
        facts={[
          { label: "Action", value: "Treat these hours as elevated-risk for patrol" },
          { label: "Where", value: "Whole corridor, all logged incidents" },
          {
            label: "When",
            value: (
              <>
                <b>{windowLabel(widest.primary)}</b> ({windowSpanHours(widest.primary)}h), peaking around <b>{fmtHour(widest.profile.peakHour)}</b>
              </>
            ),
          },
          { label: "Basis", value: "Hours above that day's own mean" },
          { label: "Confidence", value: <>Measured over {rows.map((r) => `${r.label} ${r.days}`).join(", ")} days</> },
        ]}
        details={
          <>
            <p style={{ margin: 0 }}>
              <strong>{widest.label}</strong> needs the longest alert window: <strong>{windowLabel(widest.primary)}</strong>{" "}
              ({windowSpanHours(widest.primary)}h), peaking around <strong>{fmtHour(widest.profile.peakHour)}</strong>.
              Every other day&apos;s own window is in the table below — none of them share a single rush-hour assumption.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              Hours patrol should treat as elevated-risk, one row per day of the week, from the Descriptive tab&apos;s own Hour x
              Day-of-week incident frequency — the same table its Time-of-Day chart draws Weekday/Weekend lines from, broken out
              further here since different weekdays (and Saturday vs Sunday) don&apos;t share one rhythm. A window is any run of hours
              whose average incident count sits above that specific day&apos;s own mean, so it&apos;s sized to this corridor&apos;s
              measured rhythm rather than a fixed span like &apos;rush hour.&apos;
            </p>
            <p style={{ margin: "8px 0 0" }}>
              Each day&apos;s window is measured over however many of that weekday fell in the selected Range (
              {rows.map((r) => `${r.label} ${r.days}`).join(", ")}) and recomputed from that day&apos;s own hourly rhythm —
              it is not a fixed rush-hour assumption shared across days.
            </p>
          </>
        }
      />

      {/* Evidence: every day's own window and its 24-hour shape. */}
      <div className="inc-table-wrap">
        <table className="inc-table inc-sched">
          <thead>
            <tr>
              <th>Day</th>
              <th style={{ textAlign: "left" }}>Alert window</th>
              <th style={{ textAlign: "left" }}>Peak hour</th>
              <th style={{ textAlign: "left" }}>Shape (12 AM – 12 AM)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dow}>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.label}</td>
                {r.primary == null ? (
                  <>
                    <td colSpan={2} className="is-none">
                      No {r.label} in this Range
                    </td>
                    <td />
                  </>
                ) : (
                  <>
                    <td className={r.dow === widest.dow ? "is-widest" : undefined} style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                      {windowLabel(r.primary)}
                    </td>
                    <td className="is-muted" style={{ textAlign: "left", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{fmtHour(r.profile.peakHour)}</td>
                    <td style={{ textAlign: "left" }}>
                      <div className="inc-shape">
                        {r.profile.hours.map((v, h) => {
                          const pct = Math.max((v / maxHour) * 100, 6);
                          return (
                            <div key={h} title={`${fmtHour(h)}: ${v.toFixed(2)} incidents/day avg`}>
                              {/* Height is linear (true magnitude); shade is by RANK
                                  among all 168 cells, computed against the table's
                                  shared allHours so a shade means the same relative
                                  rank in every row (see percentileOf). */}
                              <i style={{ height: `${pct}%`, background: heatShade(percentileOf(v, allHours)) }} />
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
