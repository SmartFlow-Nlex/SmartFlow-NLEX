"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { cachedJson } from "../../../lib/cached-json";
import { authedJson } from "../../../lib/api";
import { Activity, ClipboardList, Eye, Upload, Users } from "lucide-react";
import PageHeader from "../../../components/dashboard/PageHeader";
import StateNote from "../../../components/stage/StateNote";
import CustomSelect from "../../../components/dashboard/CustomSelect";
import InfoTooltip from "../../../components/dashboard/InfoTooltip";
import DashboardChart from "../../../components/dashboard/DashboardChart";
import { useThemeTokens } from "../../../components/dashboard/useThemeTokens";
import { withAlpha } from "../../../lib/chart-kit";
import type { EChartsOption } from "echarts";
import { SortableTh, useTableSort } from "../../../lib/table-sort";
import { logActivity } from "../../../lib/backend-auth";
import { fmtKmRange } from "../../../lib/km-post";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/** Entries per request to the list; older pages load on request. */
const PAGE_SIZE = 500;

/** An entry as the backend stores it (Back-End/src/services/audit.ts). */
type RawLog = {
  id: number;
  timestamp: string;
  user_id: string;
  action: string;
  target_resource: string;
  details: Record<string, unknown> | null;
  module?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  outcome?: string | null;
  duration_ms?: number | string | null;
  actor_role?: string | null;
};

type LogRow = {
  id: number;
  timestamp: string;
  user: string;
  role: string | null;
  category: string;
  action: string;
  details: string;
  severity: string;
};

/** The audit summary (Back-End/src/services/audit-insights.service.ts). */
type Insights = {
  days: number;
  totals: { actions: number; views: number; users: number; unidentified: number };
  daily: { day: string; actions: number; views: number }[];
  modules: { module: string; actions: number }[];
  pages: { path: string; views: number; users: number }[];
  users: { user: string; role: string | null; actions: number; last: string }[];
  uploads: {
    loaded: number; failed: number; undone: number; checked: number; undoRefused: number;
    avgLoadMs: number | null; waitingForRetrain: number; oldestWaiting: string | null; lastTrained: string | null; nextRetrain: string;
  };
  maintenance: {
    dwell: { status: string; changes: number; avgMs: number | null; maxMs: number | null }[];
    turnaround: { completed: number; avgMs: number | null };
    open: number; overrunning: number; lateToStart: number;
    /** Still "scheduled" after the whole planned window has ended (sent by the backend since 17 Nov 2026). */
    overdue?: number;
    items: { id: string; title: string; status: string; since: string; flag: string | null }[];
  };
  models: {
    groups: { group: string; title: string | null; outcome: string; at: string }[];
    lastBatch: { id: number; started_at: string; status: string; summary: string | null } | null;
    /** The hourly congestion refresh's own audit entries (model.live_refresh), last 24 hours. */
    hourly?: {
      hoursPublished: number;
      failed: number;
      last: { at: string; outcome: string; model: string | null; accuracy: string | null; reason: string | null; host: string | null } | null;
    };
  };
};

const MODULE_LABEL: Record<string, string> = {
  data_management: "Data Management",
  maintenance: "Maintenance",
  mobile_app: "Mobile App",
  model_training: "Model Training",
  navigation: "Navigation",
  session: "Sign-in",
  audit_log: "Audit Log",
  upload: "Data Management",
  mobile_config: "Mobile App",
};

const PAGE_LABEL: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/traffic": "Traffic",
  "/dashboard/incident": "Incidents",
  "/dashboard/sustainability": "Emissions",
  "/dashboard/map-comparison": "Map",
  "/dashboard/maintenance": "Maintenance",
  "/dashboard/mobile": "Mobile App",
  "/dashboard/scenario-sandbox": "Scenario Sandbox",
  "/dashboard/data-management": "Data Management",
  "/dashboard/audit-log": "Audit Log",
  "/dashboard/ai-sandbox": "AI Sandbox",
};

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-US");

/** 42 s, 7 min, 5.3 h, 2.1 d. */
function span(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  // Non-breaking spaces: a number and its unit never wrap apart.
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 48 * 3600) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} d`;
}

const ago = (iso: string | null) => (iso ? span(Date.now() - new Date(iso).getTime()) : "—");
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const status = (s: string) => s.replace(/_/g, " ");

// One readable row per entry: the module, what was done, the record's move from one status to
// the next, the outcome and how long it took. Older entries kept these in `details` only.
function mapLog(r: RawLog): LogRow {
  const [domain, ...rest] = String(r.action).split(".");
  const category = MODULE_LABEL[r.module ?? domain] ?? cap(domain);
  const action = rest.length ? rest.join(".").split("_").map(cap).join(" ") : r.action;
  const d = r.details ?? {};
  const bits: string[] = [];
  if (typeof d.title === "string") bits.push(d.title);
  if (typeof d.filename === "string") bits.push(d.filename);
  // Maintenance logs carry the stored (measured) km; show the official posts.
  if (d.startKm != null && d.endKm != null) bits.push(fmtKmRange(Number(d.startKm), Number(d.endKm), 2));
  const from = r.from_status ?? null;
  const to = r.to_status ?? (typeof d.to === "string" ? d.to : null);
  if (from && to && from !== to) bits.push(`${status(from)} → ${status(to)}`);
  else if (to && !from) bits.push(`→ ${status(to)}`);
  if (r.duration_ms != null && r.duration_ms !== "") {
    bits.push(r.action === "maintenance.status_changed" ? `after ${span(Number(r.duration_ms))} ${from ? status(from) : ""}`.trim() : span(Number(r.duration_ms)));
  }
  if (typeof d.rows_written === "number") bits.push(`${n(d.rows_written)} rows`);
  if (typeof d.reason === "string" && d.reason) bits.push(`reason: ${d.reason}`);
  if (r.action === "page.viewed") bits.push(PAGE_LABEL[r.entity_id ?? ""] ?? r.entity_id ?? "");
  const outcome = (r.outcome ?? "").toLowerCase();
  const severity =
    outcome === "restore failed" || r.action === "model.restore_failed"
      ? "Critical"
      : ["failed", "refused", "kept previous", "cannot run here", "cancelled"].includes(outcome) ||
          to === "cancelled" || action.toLowerCase().includes("deleted")
        ? "Warning"
        : "Info";
  return {
    id: r.id,
    timestamp: r.timestamp,
    user: r.user_id,
    role: r.actor_role ?? null,
    category,
    action:
      r.outcome && !["success", "passed"].includes(r.outcome) && r.outcome.toLowerCase() !== action.toLowerCase()
        ? `${action} (${r.outcome})`
        : action,
    details: bits.filter(Boolean).join(" · ") || r.target_resource,
    severity,
  };
}

/** A row of labelled bars, longest first; values relative to the largest. */
function Bars({ rows }: { rows: { label: string; value: number; text?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="audit-empty">Nothing recorded yet.</p>;
  return (
    <ul className="audit-bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="audit-bar-label" title={r.label}>{r.label}</span>
          <span className="audit-bar-track"><span className="audit-bar-fill" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="audit-bar-value">{r.text ?? n(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Label / value rows for the insight cards (21 Nov 2026: replaces run-on sentences). */
function KV({ rows }: { rows: ({ k: string; v: ReactNode; sub?: ReactNode; warn?: boolean } | null | false)[] }) {
  return (
    <dl className="audit-kv">
      {rows.filter(Boolean).map((r) => {
        const row = r as { k: string; v: ReactNode; sub?: ReactNode; warn?: boolean };
        return (
          <div key={row.k} className={row.warn ? "is-warn" : undefined}>
            <dt>{row.k}</dt>
            <dd>
              {row.v}
              {row.sub && <small>{row.sub}</small>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** A details cell kept to two lines, with More / Less when the text runs longer. */
function DetailCell({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 110;
  return (
    <div className={`audit-detail${long && !open ? " is-clamped" : ""}`}>
      <span title={long && !open ? text : undefined}>{text}</span>
      {long && (
        <button type="button" className="audit-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

/** Every day of the period, oldest first, with the quiet ones as zeros: a gap is information too. */
function everyDay(data: Insights): { day: string; actions: number; views: number }[] {
  const byDay = new Map(data.daily.map((d) => [d.day, d]));
  const manilaToday = Date.parse(new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10));
  return Array.from({ length: data.days }, (_, i) => {
    const day = new Date(manilaToday - (data.days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return byDay.get(day) ?? { day, actions: 0, views: 0 };
  });
}

/** "Sep 9" for a yyyy-mm-dd day. */
function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The congestion model the hourly refresh trains, as /api/map-comparison/forecast reports it. */
type HourlyModel = { name: string | null; trainedAt: string | null; maxHorizon: number | null };

/** "Fri, Nov 14" for a yyyy-mm-dd day, for the chart's tooltip. */
function dayLong(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Actions and page views per day, stacked: dated axis, a total over each day, and a tooltip (21 Nov 2026). */
function ActivityChart({ days }: { days: { day: string; actions: number; views: number }[] }) {
  const T = useThemeTokens();
  // ECharts draws on canvas, so the CSS tokens are read as literals.
  const css = (name: string, fb: string) =>
    typeof window === "undefined" ? fb : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
  const actionInk = T.accent;
  const viewInk = withAlpha(css("--color-purple", "#8b7cf6"), T.isDark ? 0.7 : 0.55);
  const option: EChartsOption = {
    grid: { left: 8, right: 8, top: 22, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const i = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0;
        const d = days[i];
        if (!d) return "";
        const dot = (c: string) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:6px"></span>`;
        return `<b>${dayLong(d.day)}</b><br/>${dot(actionInk)}Actions <b>${n(d.actions)}</b><br/>${dot(viewInk)}Page views <b>${n(d.views)}</b><br/><span style="color:var(--text-muted)">Total ${n(d.actions + d.views)}</span>`;
      },
    },
    xAxis: {
      type: "category",
      data: days.map((d) => dayLabel(d.day)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: T.chartSplit } },
      axisLabel: { color: T.chartText, fontSize: 11, interval: Math.max(0, Math.ceil(days.length / 10) - 1) },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: T.chartText, fontSize: 11 },
      splitLine: { lineStyle: { color: T.chartSplit } },
    },
    series: [
      { name: "Page views", type: "bar", stack: "day", barWidth: "62%", data: days.map((d) => d.views), itemStyle: { color: viewInk } },
      {
        name: "Actions",
        type: "bar",
        stack: "day",
        data: days.map((d) => d.actions),
        itemStyle: { color: actionInk, borderRadius: [3, 3, 0, 0] },
        // The day's total over its bar; quiet days stay unlabelled.
        label: {
          show: true,
          position: "top",
          color: T.textSecondary,
          fontSize: 10,
          formatter: (p: unknown) => {
            const d = days[(p as { dataIndex: number }).dataIndex];
            const t = d ? d.actions + d.views : 0;
            return t > 0 ? String(t) : "";
          },
        },
      },
    ],
  };
  return <DashboardChart option={option} height={220} />;
}

function InsightsSection({ data, hourly }: { data: Insights; hourly: HourlyModel | null }) {
  const days = everyDay(data);
  const m = data.maintenance;
  const u = data.uploads;
  // Only the upload outcomes that happened: "0 failed · 0 undone · 0 checked" said nothing.
  const uploadBits = [
    u.failed > 0 && `${n(u.failed)} failed`,
    u.undone > 0 && `${n(u.undone)} undone`,
    u.checked > 0 && `${n(u.checked)} checked`,
  ].filter(Boolean).join(" · ");
  return (
    /* Planned rows (21 Nov 2026): the daily chart across the top, then pages, maintenance and uploads (similar
       heights), then module and users. The overdue job list and the model results were dropped from here: the
       Maintenance and Data Management pages show them in full. */
    <div className="audit-insights is-rows">
      <article className="audit-card is-wide">
        <h3 className="audit-card-head">
          Activity per day
          <span className="audit-legend"><span className="audit-key actions" /> actions <span className="audit-key views" /> page views</span>
        </h3>
        {data.daily.length === 0 ? <p className="audit-empty">Nothing recorded yet.</p> : <ActivityChart days={days} />}
      </article>

      <article className="audit-card is-third">
        <h3>Most-used pages</h3>
        <Bars rows={data.pages.map((p) => ({ label: PAGE_LABEL[p.path] ?? p.path, value: p.views, text: `${n(p.views)} · ${p.users} ${p.users === 1 ? "user" : "users"}` }))} />
      </article>

      <article className="audit-card is-third">
        <h3>Where maintenance waits</h3>
        <Bars rows={m.dwell.map((d) => ({ label: cap(status(d.status)), value: d.avgMs ?? 0, text: `${span(d.avgMs)} avg` }))} />
        <KV
          rows={[
            m.turnaround.completed > 0 && { k: "Scheduled → completed", v: <b>{span(m.turnaround.avgMs)}</b>, sub: `${m.turnaround.completed} jobs` },
            { k: "Open", v: <b>{n(m.open)}</b> },
            (m.overdue ?? 0) > 0 && { k: "Overdue", v: <b>{n(m.overdue)}</b>, warn: true },
            m.overrunning > 0 && { k: "Past planned end", v: <b>{n(m.overrunning)}</b>, warn: true },
            m.lateToStart > 0 && { k: "Late to start", v: <b>{n(m.lateToStart)}</b>, warn: true },
          ]}
        />
      </article>

      <article className="audit-card is-third">
        <h3>Uploads &amp; retraining</h3>
        <KV
          rows={[
            { k: "Uploads loaded", v: <b>{n(u.loaded)}</b>, sub: uploadBits || undefined, warn: u.failed > 0 },
            u.avgLoadMs != null && { k: "Average load", v: <b>{span(u.avgLoadMs)}</b> },
            { k: "Next weekly retrain", v: <b>{when(u.nextRetrain)}</b>, sub: u.waitingForRetrain > 0 ? `${n(u.waitingForRetrain)} uploads waiting${u.oldestWaiting ? `, oldest ${ago(u.oldestWaiting)}` : ""}` : undefined },
            data.models.lastBatch
              ? { k: "Last batch", v: <b>{cap(data.models.lastBatch.status)}</b>, sub: when(data.models.lastBatch.started_at) }
              : { k: "Last batch", v: <span className="audit-muted">none yet</span> },
            data.models.hourly?.last
              ? {
                  /* From the refresh's own audit entries: how many of the last 24 clock hours have a published run. A
                     refresh that never started leaves no entry, so it shows as a gap. */
                  k: "Hourly refresh",
                  v: <b>{data.models.hourly.hoursPublished} of 24 h{data.models.hourly.failed > 0 ? ` · ${data.models.hourly.failed} failed` : ""}</b>,
                  sub: `Last ${when(data.models.hourly.last.at)}`,
                  warn: data.models.hourly.hoursPublished < 20 || data.models.hourly.failed > 0,
                }
              : hourly?.trainedAt
                ? { k: "Hourly traffic model", v: <b>{hourly.name ?? "model"}</b>, sub: `trained ${when(hourly.trainedAt)}` }
                : null,
          ]}
        />
      </article>

      <article className="audit-card is-half">
        <h3>Activity by module</h3>
        <Bars rows={data.modules.map((x) => ({ label: MODULE_LABEL[x.module] ?? cap(x.module), value: x.actions }))} />
      </article>

      <article className="audit-card is-half">
        <h3>Most active users</h3>
        {data.users.length === 0 ? (
          <p className="audit-empty">No signed-in activity yet.</p>
        ) : (
          <Bars rows={data.users.map((x) => ({ label: `${x.user}${x.role ? ` (${x.role})` : ""}`, value: x.actions }))} />
        )}
        {data.totals.unidentified > 0 && (
          /* These are recent, not old (17 Nov 2026 audit): mostly idle sign-outs, sign-ins and settings changes the page
             reported without a sign-in the server could verify, such as after the session had already expired. */
          <p className="audit-note audit-muted audit-anon">
            + {n(data.totals.unidentified)} anonymous {data.totals.unidentified === 1 ? "action" : "actions"}
            <InfoTooltip text="Sent by the page without a sign-in the server could confirm, for example an idle sign-out sent after the session had expired, so they are recorded as anonymous." />
          </p>
        )}
      </article>
    </div>
  );
}

export default function AuditLogPage() {
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedSeverity, setSelectedSeverity] = useState("All");
  const [selectedDateRange, setSelectedDateRange] = useState("All Time");

  const [auditLogs, setAuditLogs] = useState<LogRow[]>([]);
  // The hourly congestion refresh writes 24 entries a day; like page views they stay out of the list unless asked for.
  const [showHourly, setShowHourly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [days, setDays] = useState(30);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  /* The list comes a page at a time, newest first (17 Nov 2026 audit: it loaded the newest 500 of about 600, so
     "All Time" silently left the oldest out). While a page comes back full there may be older entries, and the
     table says so and offers to load them. */
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const fetchPage = useCallback(
    (before?: string) =>
      authedJson<{ success: boolean; message?: string; data: RawLog[] }>(
        `${BACKEND}/api/audit-log/list?limit=${PAGE_SIZE}${showHourly ? "&include_hourly=1" : ""}${before ? `&end_date=${encodeURIComponent(before)}` : ""}`,
      ).then((json) => {
        if (!json.success) throw new Error(json.message ?? "Request failed");
        return json.data;
      }),
    [showHourly],
  );

  useEffect(() => {
    fetchPage()
      .then((rows) => {
        setAuditLogs(rows.map(mapLog));
        setHasOlder(rows.length >= PAGE_SIZE);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [fetchPage]);

  const loadOlder = () => {
    const oldest = auditLogs.reduce<string | null>((o, l) => (!o || new Date(l.timestamp) < new Date(o) ? l.timestamp : o), null);
    if (!oldest) return;
    setLoadingOlder(true);
    fetchPage(new Date(oldest).toISOString())
      .then((rows) => {
        // end_date is inclusive, so the oldest entry already shown comes back: keep each id once.
        setAuditLogs((cur) => {
          const seen = new Set(cur.map((l) => l.id));
          return [...cur, ...rows.map(mapLog).filter((l) => !seen.has(l.id))];
        });
        setHasOlder(rows.length >= PAGE_SIZE);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoadingOlder(false));
  };

  useEffect(() => {
    setInsightsError(null);
    authedJson<{ success: boolean; message?: string; data: Insights }>(`${BACKEND}/api/audit-log/summary?days=${days}`)
      .then((json) => {
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setInsights(json.data);
      })
      .catch((e) => setInsightsError(e instanceof Error ? e.message : "Failed to load"));
  }, [days]);

  // Fallback for the retraining card until the hourly refresh writes its own audit entries (a trainer older
  // than 2026-10-25 does not): its latest run, as it rides on the forecast the Live Map reads.
  const [hourly, setHourly] = useState<HourlyModel | null>(null);
  useEffect(() => {
    cachedJson<{ model?: HourlyModel | null }>(`${BACKEND}/api/map-comparison/forecast?hours=1`, 60_000)
      .then((json) => setHourly(json.model ?? null))
      .catch(() => setHourly(null));
  }, []);

  const categories = useMemo(
    () => [...new Set(auditLogs.map((l) => l.category))].sort(),
    [auditLogs]
  );

  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfLast7Days = new Date(startOfToday);
  startOfLast7Days.setDate(startOfLast7Days.getDate() - 6);
  const startOfLast30Days = new Date(startOfToday);
  startOfLast30Days.setDate(startOfLast30Days.getDate() - 29);

  const filteredLogs = auditLogs.filter((log) => {
    const searchMatch = searchText.trim().toLowerCase();
    const matchesSearch =
      !searchMatch ||
      log.user.toLowerCase().includes(searchMatch) ||
      log.details.toLowerCase().includes(searchMatch) ||
      log.action.toLowerCase().includes(searchMatch);

    const matchesCategory = selectedCategory === "All" || log.category === selectedCategory;
    const matchesSeverity = selectedSeverity === "All" || log.severity === selectedSeverity;

    const timestamp = new Date(log.timestamp);
    const matchesDateRange =
      selectedDateRange === "All Time" ||
      (selectedDateRange === "Today" && timestamp >= startOfToday) ||
      (selectedDateRange === "Last 7 Days" && timestamp >= startOfLast7Days) ||
      (selectedDateRange === "Last 30 Days" && timestamp >= startOfLast30Days);

    return matchesSearch && matchesCategory && matchesSeverity && matchesDateRange;
  });

  // Severity sorts by rank, not alphabetically — "Critical" before "Info"
  // matters, and A-Z would put Critical, Info, Warning in a meaningless order.
  const SEVERITY_RANK: Record<string, number> = { Critical: 0, Warning: 1, Info: 2 };
  const { sorted: visibleLogs, sort, toggle } = useTableSort(filteredLogs, {
    id: (l) => l.id,
    timestamp: (l) => new Date(l.timestamp),
    user: (l) => l.user,
    category: (l) => l.category,
    action: (l) => l.action,
    details: (l) => l.details,
    severity: (l) => SEVERITY_RANK[l.severity] ?? 99,
  });

  const exportJSON = () => {
    // Exports what is on screen, in the order it is on screen.
    const dataStr = JSON.stringify(visibleLogs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().split('T')[0];
    a.download = `audit_logs_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    void logActivity({ type: "audit.exported", rows: visibleLogs.length, format: "json" });
  };

  const t = insights?.totals;
  const u = insights?.uploads;

  return (
    <section className="ds-content ds-long audit-page">
      <PageHeader
        icon={ClipboardList}
        title="Audit Log"
        subtitle="Who did what, and when"
        actions={
          <CustomSelect
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            prefix="Insights"
            options={[
              { label: "Last 7 days", value: "7" },
              { label: "Last 30 days", value: "30" },
              { label: "Last 90 days", value: "90" },
            ]}
          />
        }
      />
      <div className="tab-stat-grid compact audit-kpis">
        <article className="tab-stat-card">
          <div className="stat-content">
            <h3>Actions</h3>
            <div className="value">{t ? n(t.actions) : "—"}</div>
          </div>
          <div className="icon-box tone-blue"><Activity size={20} /></div>
        </article>
        <article className="tab-stat-card">
          <div className="stat-content">
            <h3>Active users</h3>
            <div className="value">{t ? n(t.users) : "—"}</div>
          </div>
          <div className="icon-box tone-green"><Users size={20} /></div>
        </article>
        <article className="tab-stat-card">
          <div className="stat-content">
            <h3>Page views</h3>
            <div className="value">{t ? n(t.views) : "—"}</div>
          </div>
          <div className="icon-box tone-purple"><Eye size={20} /></div>
        </article>
        <article className="tab-stat-card">
          <div className="stat-content">
            <h3>Uploads loaded</h3>
            <div className="value">{u ? n(u.loaded) : "—"}</div>
          </div>
          <div className="icon-box tone-red"><Upload size={20} /></div>
        </article>
      </div>

      {insightsError && (
        <div className="audit-insights-error">
          <StateNote kind="error" size={44}>
            <span className="audit-warn">Insights unavailable: {insightsError}</span>
          </StateNote>
        </div>
      )}
      {insights && <InsightsSection data={insights} hourly={hourly} />}

      <section className="table-card audit-log-table" style={{ marginTop: 16 }}>
        <div className="table-toolbar">
          <input
            aria-label="Search logs"
            placeholder="Search logs..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <CustomSelect
            value={selectedCategory}
            onChange={setSelectedCategory}
            options={[{ label: "All categories", value: "All" }, ...categories.map((c) => ({ label: c, value: c }))]}
          />
          <CustomSelect
            value={selectedSeverity}
            onChange={setSelectedSeverity}
            options={[
              { label: "All severities", value: "All" },
              { label: "Info", value: "Info" },
              { label: "Warning", value: "Warning" },
              { label: "Critical", value: "Critical" },
            ]}
          />
          <CustomSelect
            value={selectedDateRange}
            onChange={setSelectedDateRange}
            options={[
              { label: "All time", value: "All Time" },
              { label: "Today", value: "Today" },
              { label: "Last 7 days", value: "Last 7 Days" },
              { label: "Last 30 days", value: "Last 30 Days" },
            ]}
          />
          {/* The hourly congestion refresh writes 24 entries a day, so it is opt-in: a switch, not a bare checkbox. */}
          <button
            type="button"
            role="switch"
            aria-checked={showHourly}
            className={`audit-switch${showHourly ? " is-on" : ""}`}
            onClick={() => setShowHourly((v) => !v)}
            title="Include the hourly congestion model refreshes (24 a day)"
          >
            <i aria-hidden="true" />
            Hourly refreshes
          </button>
          <span className="audit-toolbar-gap" />
          <button className="nc-pill audit-export" onClick={exportJSON}>Export JSON</button>
          <button
            className="btn-muted audit-reset"
            onClick={() => {
              setSearchText("");
              setSelectedCategory("All");
              setSelectedSeverity("All");
              setSelectedDateRange("All Time");
              setShowHourly(false);
            }}
          >
            Reset
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                  <SortableTh label="ID" sortKey="id" sort={sort} onToggle={toggle} />
                  <SortableTh label="TIMESTAMP" sortKey="timestamp" sort={sort} onToggle={toggle} />
                  <SortableTh label="USER" sortKey="user" sort={sort} onToggle={toggle} />
                  <SortableTh label="CATEGORY" sortKey="category" sort={sort} onToggle={toggle} />
                  <SortableTh label="ACTION" sortKey="action" sort={sort} onToggle={toggle} />
                  <SortableTh label="DETAILS" sortKey="details" sort={sort} onToggle={toggle} />
                  <SortableTh label="SEVERITY" sortKey="severity" sort={sort} onToggle={toggle} />
                </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>Loading…</td></tr>
              )}
              {error && !loading && (
                <tr><td colSpan={7} className="audit-state-cell"><StateNote kind="error" size={44}>Live data unavailable — is the backend running on port 4000?</StateNote></td></tr>
              )}
              {!loading && !error && visibleLogs.length === 0 && (
                <tr><td colSpan={7} className="audit-state-cell"><StateNote kind="nodata" size={44}>{auditLogs.length > 0 ? "No entries match these filters." : "No audit events yet."}</StateNote></td></tr>
              )}
              {visibleLogs.map((log) => (
                <tr key={log.id}>
                  <td className="audit-id">{`#${String(log.id).padStart(3, '0')}`}</td>
                  <td className="audit-time">{new Date(log.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" })}</td>
                  <td>
                    {log.user}
                    {log.role && <div className="audit-muted audit-role">{log.role}</div>}
                  </td>
                  <td>
                    {/* A neutral hairline pill: colour on this row is kept for Severity, so a
                        category never reads as a status (Maintenance used to be danger red). */}
                    <span className="badge audit-cat">
                      {log.category.toLowerCase()}
                    </span>
                  </td>
                  <td>{log.action}</td>
                  <td><DetailCell text={log.details} /></td>
                  <td><span className={`pill ${log.severity === "Critical" ? "red" : log.severity === "Warning" ? "amber" : "blue"}`}>{log.severity}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !error && hasOlder && (
          <p className="audit-note audit-muted" style={{ padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span>Showing the newest {n(auditLogs.length)} entries; filters cover only these.</span>
            <button type="button" className="nc-pill" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? "Loading…" : "Load older entries"}
            </button>
          </p>
        )}
      </section>
    </section>
  );
}
