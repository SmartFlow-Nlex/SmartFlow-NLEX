"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Calendar, Check, ChevronDown, Info, MapPin, MoreVertical, Plus, Search, Trash2, Wrench, X } from "lucide-react";
import PageHeader from "../../../components/dashboard/PageHeader";
import StateNote from "../../../components/stage/StateNote";
import styles from "../traffic/traffic.module.css";
import { supabase } from "../../../lib/supabase";

import { useToast } from "../../../lib/toast";
import { SortableTh, useTableSort } from "../../../lib/table-sort";
import { useNlexExits, exitNearestKm, displayExitName, CORRIDOR_KM, type NlexExit } from "../../../lib/nlex-exits";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";


/* A closure is on one carriageway, so the form asks for one. "Both" is no
   longer offered for new work; rows saved with it before still display as
   such (see Schedule.direction), and editing one asks for a side. */
const DIRECTIONS = ["NB", "SB"] as const;
const DIRECTION_LABEL: Record<(typeof DIRECTIONS)[number], string> = {
  NB: "Northbound",
  SB: "Southbound",
};
/* A closure names the lanes it takes, counted from the median: Lane 1 is the
   inner (fast) lane. It is stored as text, e.g. "Lane 1 + Lane 2", so the
   mobile app and map popups show it as written. "None", "Shoulder only",
   "Full closure" and the older "1 lane" / "2 lanes" are still understood. */
const LANE_OPTIONS = ["Lane 1", "Lane 2", "Lane 3", "Shoulder"] as const;
const LANE_HINT: Record<string, string> = { "Lane 1": "inner", "Lane 3": "outer" };

const closureText = (lanes: string[], full: boolean, legacy: string) => {
  if (full) return "Full closure";
  const picked = LANE_OPTIONS.filter((l) => lanes.includes(l));
  if (picked.length === 0) return legacy || "None";
  if (picked.length === 1 && picked[0] === "Shoulder") return "Shoulder only";
  return picked.join(" + ");
};

const parseClosure = (text: string) => {
  if (text === "Full closure") return { lanes: [] as string[], full: true, legacy: "" };
  if (text === "None") return { lanes: [] as string[], full: false, legacy: "" };
  if (text === "Shoulder only") return { lanes: ["Shoulder"], full: false, legacy: "" };
  const lanes = text.split(" + ").filter((l) => (LANE_OPTIONS as readonly string[]).includes(l));
  return { lanes, full: false, legacy: lanes.length ? "" : text };
};

const DAY_MS = 86_400_000;

/* Every time on this page is Philippine Time (UTC+8, no daylight saving),
   whatever the viewer's browser or the server thinks. Dates typed into the form
   are read as PHT, stored as exact instants, and shown back in PHT. */
const TZ = "Asia/Manila";
const PH_OFFSET_MS = 8 * 3_600_000;
const phShift = (ms: number) => new Date(ms + PH_OFFSET_MS); // read with getUTC*
const phDayStart = (ms: number) => Math.floor((ms + PH_OFFSET_MS) / DAY_MS) * DAY_MS - PH_OFFSET_MS;
const phDate = (ms: number) => phShift(ms).toISOString().slice(0, 10);
const phTime = (ms: number) => phShift(ms).toISOString().slice(11, 16);
const phToMs = (date: string, time: string) => new Date(`${date}T${time || "00:00"}:00+08:00`).getTime();

// How many lanes a closure takes: Infinity for a full closure, 0 when no lane
// (a shoulder alone is not a lane).
const closedLanes = (text: string) => {
  if (text === "Full closure") return Infinity;
  const legacy = text.match(/^(\d) lanes?$/);
  if (legacy) return Number(legacy[1]);
  return text.match(/Lane/g)?.length ?? 0;
};

// "Lane 1 closed", "Shoulder closure", "Full closure", "No closure".
const closureLabel = (text: string) => {
  if (text === "None") return "No closure";
  if (text === "Shoulder only") return "Shoulder closure";
  if (text === "Full closure") return text;
  return `${text} closed`;
};

const closureSeverity =(text: string): "low" | "mid" | "high" => {
  if (text === "Full closure") return "high";
  if (text === "None" || text === "Shoulder only") return "low";
  return "mid";
};

const closureRank = (text: string) => {
  if (text === "None") return 0;
  if (text === "Shoulder only") return 1;
  if (text === "Full closure") return 100;
  const m = text.match(/^(\d) lanes?$/);
  return m ? Number(m[1]) + 1 : (text.match(/Lane/g)?.length ?? 1) + 1;
};

type Status = "scheduled" | "in_progress" | "completed" | "cancelled";

type Schedule = {
  id: string;
  title: string;
  description: string | null;
  start_km: number;
  end_km: number;
  direction: "NB" | "SB" | "Both";
  lane_closure: string;
  starts_at: string;
  ends_at: string;
  status: Status;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_META: Record<Status, { label: string; badge: string }> = {
  scheduled: { label: "Scheduled", badge: "blue" },
  in_progress: { label: "In Progress", badge: "yellow" },
  completed: { label: "Completed", badge: "green" },
  cancelled: { label: "Cancelled", badge: "red" },
};

// What a row can transition to (mirrors the backend guard).
// Reverts let operators undo mistakes: reopen a completed job, restore a
// cancelled one, or send an in-progress job back to scheduled.
const NEXT_ACTIONS: Record<Status, { to: Status; label: string }[]> = {
  scheduled: [{ to: "in_progress", label: "Start work" }],
  in_progress: [
    { to: "completed", label: "Mark completed" },
    { to: "scheduled", label: "Revert to scheduled" },
  ],
  completed: [{ to: "in_progress", label: "Reopen work" }],
  cancelled: [{ to: "scheduled", label: "Restore schedule" }],
};

/* Same carriageway, overlapping km and time, then by what is closed:
     critical    — the same lane (or either job is a full closure)
     operational — different lanes: the stretch is shared but traffic can still
                   use the lanes the other job leaves open
     nearby      — same carriageway, close by, not overlapping
     opposing    — the other carriageway, overlapping km
   Only critical blocks saving by default. */
type ConflictKind = "critical" | "operational" | "nearby" | "opposing";
const CONFLICT_LABEL: Record<ConflictKind, string> = {
  critical: "Critical conflict",
  operational: "Operational conflict",
  nearby: "Nearby work",
  opposing: "Opposing carriageway",
};

// Whether two closures take any of the same lane. An old "1 lane" / "2 lanes"
// row does not say which lanes, so it is assumed to clash.
const lanesClash = (aText: string, bText: string) => {
  const a = parseClosure(aText);
  const b = parseClosure(bText);
  if (a.full || b.full || a.legacy || b.legacy) return true;
  return a.lanes.some((l) => b.lanes.includes(l));
};
const NEARBY_KM = 2;

const SOON_MS =2 * 60 * 60 * 1000;
const MAX_ALERTS = 4;

const fmtClock = (iso: string) => {
  const d = new Date(iso);
  const sameDay = phDayStart(d.getTime()) === phDayStart(Date.now());
  return d.toLocaleString("en-US", sameDay
    ? { timeZone: TZ, hour: "numeric", minute: "2-digit" }
    : { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const fmtWindow =(startIso: string, endIso: string) => {
  const opt: Intl.DateTimeFormatOptions = { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return `${new Date(startIso).toLocaleString("en-US", opt)} → ${new Date(endIso).toLocaleString("en-US", opt)}`;
};

const kmRange = (s: Schedule) =>
  `Km ${s.start_km}${s.end_km !== s.start_km ? `–${s.end_km}` : ""}`;

// Nearest exit to a km-post, against the shared corridor list.
const nearestExitName = (exits: NlexExit[], km: number) => {
  const x = exitNearestKm(exits, km);
  return x ? displayExitName(x.exit_name) : "-";
};

// Modern dropdown — same look and behavior as the Traffic tab's custom select
function Select({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const clickOut = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", clickOut);
    return () => document.removeEventListener("mousedown", clickOut);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`${styles.customSelectWrap} nc-ops-select`} ref={ref}>
      <button
        type="button"
        className={`${styles.customSelectBtn} nc-ops-select-btn`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className={`nc-ops-select-value${selected ? "" : " is-placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} aria-hidden="true" className="nc-ops-chevron" />
      </button>
      {open && (
        <div className={`${styles.customSelectMenu} nc-ops-select-menu`}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`${styles.customSelectOption} ${value === o.value ? styles.customSelectOptionActive : ""} nc-ops-select-opt`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
              {value === o.value && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="nc-ops-tick" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The badge only reports status. Everything that changes the row lives in the
// actions menu beside it, with the destructive items kept apart at the bottom.
function StatusControl({
  schedule,
  disabled,
  onAdvance,
  onEdit,
  onView,
  onCancel,
  onDelete,
}: {
  schedule: Schedule;
  disabled: boolean;
  onAdvance: (to: Status) => void;
  onEdit: () => void;
  onView: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const clickOut = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", clickOut);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", clickOut);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const meta = STATUS_META[schedule.status];
  const live = schedule.status === "scheduled" || schedule.status === "in_progress";
  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className={`${styles.customSelectWrap} nc-ops-status`} ref={ref} onClick={(e) => e.stopPropagation()}>
      <span className={`ms-badge ${meta.badge}`}>{meta.label}</span>
      <button
        type="button"
        className="nc-ops-kebab"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${schedule.title}`}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className={`${styles.customSelectMenu} nc-ops-status-menu`} role="menu">
          <p className="nc-ops-menu-head">Actions</p>
          {NEXT_ACTIONS[schedule.status].map((a) => (
            <button key={a.to} type="button" role="menuitem" className={`${styles.customSelectOption} nc-ops-select-opt`} onClick={choose(() => onAdvance(a.to))}>
              {a.label}
            </button>
          ))}
          {live && (
            <button type="button" role="menuitem" className={`${styles.customSelectOption} nc-ops-select-opt`} onClick={choose(onEdit)}>
              Edit schedule
            </button>
          )}
          <button type="button" role="menuitem" className={`${styles.customSelectOption} nc-ops-select-opt`} onClick={choose(onView)}>
            View details
          </button>
          {live && (
            <button type="button" role="menuitem" className={`${styles.customSelectOption} nc-ops-select-opt`} onClick={choose(onCancel)}>
              Cancel schedule…
            </button>
          )}
          <hr className="nc-ops-menu-sep" />
          <button type="button" role="menuitem" className={`${styles.customSelectOption} nc-ops-select-opt is-danger`} onClick={choose(onDelete)}>
            Delete…
          </button>
        </div>
      )}
    </div>
  );
}

const todayLocal = () => phDate(Date.now());

const emptyForm = {
  title: "",
  description: "",
  startKm: "",
  endKm: "",
  direction: "NB" as (typeof DIRECTIONS)[number],
  lanes: ["Shoulder"] as string[],
  fullClosure: false,
  lanesLegacy: "",
  startDate: "",
  startTime: "08:00",
  endDate: "",
  endTime: "17:00",
};

/* The numbers behind the KPI tiles and alerts, for any list of schedules. The
   tiles run it on the filtered list so they describe what is on screen; the
   alert bar runs it on everything so a problem never hides behind a filter. */
function analyse(list: Schedule[], now: number) {
    const live = list.filter((s) => s.status === "scheduled" || s.status === "in_progress");
    const active = live.filter((s) => s.status === "in_progress");
    const kmAffected = active.reduce((sum, s) => sum + Math.abs(s.end_km - s.start_km), 0);

    const upcoming = live
      .filter((s) => s.status === "scheduled" && new Date(s.starts_at).getTime() > now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const startingSoon = upcoming.filter((s) => new Date(s.starts_at).getTime() - now <= SOON_MS);

    // Two live jobs conflict when they share a carriageway, a stretch of road
    // and a stretch of time. Touching at a single exit is not an overlap.
    const conflicts: [Schedule, Schedule, ConflictKind][] = [];
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        if (a.direction !== b.direction && a.direction !== "Both" && b.direction !== "Both") continue;
        if (!(new Date(a.starts_at) < new Date(b.ends_at) && new Date(b.starts_at) < new Date(a.ends_at))) continue;
        const aLo = Math.min(a.start_km, a.end_km), aHi = Math.max(a.start_km, a.end_km);
        const bLo = Math.min(b.start_km, b.end_km), bHi = Math.max(b.start_km, b.end_km);
        const point = aLo === aHi || bLo === bHi;
        if (point ? aLo <= bHi && bLo <= aHi : aLo < bHi && bLo < aHi)
          conflicts.push([a, b, lanesClash(a.lane_closure, b.lane_closure) ? "critical" : "operational"]);
      }
    }

  return { live, active, kmAffected, upcoming, startingSoon, conflicts, next: upcoming[0] ?? null };
}

export default function MaintenancePage() {
  // Same corridor list as the map and the AI sandbox. See lib/nlex-exits.
  const { exits: NLEX_EXITS } = useNlexExits();
  const toast = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "tomorrow" | "week" | "custom">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"all" | "NB" | "SB">("all");
  const [closureFilter, setClosureFilter] = useState<"all" | "none" | "one" | "multi" | "full">("all");
  const [searchQuery, setSearchQuery] = useState("");
  // "View all" on the alert bar: narrow every view to the jobs that raised an alert.
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [view, setView] = useState<"table" | "timeline" | "corridor">("table");
  const [range, setRange] = useState<"today" | "next24" | "week">("today");
  const [corridorScope, setCorridorScope] = useState<"now" | "today" | "next24" | "week">("now");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  // Start of the job when the edit form opened, so an in-progress job whose
  // start has already passed can still be edited without moving its start.
  const originalStartRef = useRef<string>("");
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverConflict, setServerConflict] = useState(false);

  const [detail, setDetail] = useState<Schedule | null>(null);
  const [actor, setActor] = useState("dashboard");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setActor(session.user.email);
    });
  }, []);
  const [cancelTarget, setCancelTarget] = useState<Schedule | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  /*
   * Deleting is deliberately separate from cancelling, and both are offered.
   *
   * Cancelling keeps the row and writes a reason, which is what a schedule that
   * was called off should leave behind — the corridor record still shows work
   * was planned for that window. Deleting erases it, which is only right for a
   * row that should never have existed, such as a duplicate or a typo.
   *
   * The API has supported DELETE since the endpoint was written; the page never
   * called it, so a mistaken entry could be cancelled but not removed and sat in
   * the list permanently.
   */
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
  const [mutating, setMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/maintenance/list`, { cache: "no-store" });
      const json = await r.json();
      if (!json.success) throw new Error(json.message ?? "Request failed");
      setSchedules(json.data);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ---------- Derived ----------
  // Ticks every minute so "starting soon" and the overdue alerts stay current
  // without a refetch.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const ops = useMemo(() => {
    const { live, active, kmAffected, startingSoon, conflicts, upcoming } = analyse(schedules, now);

    const alerts: { key: string; text: string; reason: string; schedule: Schedule; ids: string[] }[] = [];
    for (const s of live) {
      const where = `${s.direction} ${kmRange(s)}`;
      if (s.status === "scheduled" && new Date(s.starts_at).getTime() <= now)
        alerts.push({ key: `late-${s.id}`, schedule: s, ids: [s.id], reason: "Start overdue", text: `"${s.title}" (${where}) is still scheduled but its start time has passed` });
      if (s.status === "in_progress" && new Date(s.ends_at).getTime() <= now)
        alerts.push({ key: `over-${s.id}`, schedule: s, ids: [s.id], reason: "Past end time", text: `"${s.title}" (${where}) has run past its end time` });
    }
    for (const [a, b, kind] of conflicts)
      alerts.push({ key: `x-${a.id}-${b.id}`, schedule: a, ids: [a.id, b.id], reason: `${CONFLICT_LABEL[kind]} with "${b.title}"`, text: `${CONFLICT_LABEL[kind]}: ${a.direction} ${kmRange(a)} "${a.title}" overlaps "${b.title}" (${b.direction} ${kmRange(b)})` });

    const issueIds = new Set(alerts.flatMap((a) => a.ids));
    return { active, kmAffected, startingSoon, conflicts, next: upcoming[0] ?? null, alerts, issueIds };
  }, [schedules, now]);

  const filteredVisible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const d0 = phDayStart(now);
    let from = -Infinity;
    let to = Infinity;
    if (dateFilter === "today") { from = d0; to = d0 + DAY_MS; }
    else if (dateFilter === "tomorrow") { from = d0 + DAY_MS; to = d0 + 2 * DAY_MS; }
    else if (dateFilter === "week") {
      // Calendar week, Monday to Sunday.
      const monday = d0 - ((phShift(now).getUTCDay() + 6) % 7) * DAY_MS;
      from = monday; to = monday + 7 * DAY_MS;
    } else if (dateFilter === "custom") {
      if (customFrom) from = phToMs(customFrom, "00:00");
      if (customTo) to = phToMs(customTo, "00:00") + DAY_MS;
    }
    return schedules.filter((s) => {
      if (issuesOnly && !ops.issueIds.has(s.id)) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (directionFilter !== "all" && s.direction !== directionFilter && s.direction !== "Both") return false;
      if (closureFilter !== "all") {
        const n = closedLanes(s.lane_closure);
        if (closureFilter === "none" ? n !== 0 : closureFilter === "one" ? n !== 1 : closureFilter === "multi" ? n < 2 || n === Infinity : n !== Infinity)
          return false;
      }
      // A job is on a day if its window overlaps it, not just if it starts then.
      if (dateFilter !== "all" && !(new Date(s.starts_at).getTime() < to && new Date(s.ends_at).getTime() > from)) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        kmRange(s).toLowerCase().includes(q) ||
        s.direction.toLowerCase().includes(q)
      );
    });
  }, [schedules, statusFilter, directionFilter, closureFilter, dateFilter, customFrom, customTo, searchQuery, now, issuesOnly, ops]);

  const kpi = useMemo(() => analyse(filteredVisible, now), [filteredVisible, now]);

  const filtersActive = issuesOnly || statusFilter !== "all" || directionFilter !== "all" || closureFilter !== "all" || dateFilter !== "all" || searchQuery.trim() !== "";
  const clearFilters = () => {
    setStatusFilter("all"); setDirectionFilter("all"); setClosureFilter("all");
    setDateFilter("all"); setCustomFrom(""); setCustomTo(""); setSearchQuery(""); setIssuesOnly(false);
  };

  // Status sorts along the lifecycle, not the alphabet: scheduled work is what
  // an operator acts on, cancelled work is what they ignore. A-Z would open with
  // "cancelled" and bury "scheduled" in the middle.
  const STATUS_RANK: Record<Status, number> = { scheduled: 0, in_progress: 1, completed: 2, cancelled: 3 };
  const { sorted: visible, sort, toggle } = useTableSort(
    filteredVisible,
    {
      status: (s) => STATUS_RANK[s.status],
      title: (s) => s.title,
      location: (s) => s.start_km,
      direction: (s) => s.direction,
      closure: (s) => closureRank(s.lane_closure),
      window: (s) => new Date(s.starts_at),
    },
    // Soonest first by default: the next window to happen is the useful default,
    // and it is what someone scanning this page is looking for.
    { key: "window", dir: "asc" },
  );

  // ---------- Mutations ----------
  const changeStatus = async (s: Schedule, to: Status, reason?: string) => {
    if (mutating) return; // ignore double-fires while a request is in flight
    setMutating(true);
    setActionError(null);
    try {
      const r = await fetch(`${BACKEND}/api/maintenance/${s.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user": actor },
        body: JSON.stringify(reason ? { status: to, reason } : { status: to }),
      });
      const json = await r.json();
      if (!json.success) throw new Error(json.message ?? "Update failed");
      await refresh();
      setDetail(null);
      setCancelTarget(null);
      setCancelReason("");
      toast.success(`"${s.title}" is now ${STATUS_META[to].label.toLowerCase()}.`);
    } catch (e) {
      // Re-sync with the database so a stale row never sits next to the error
      await refresh();
      const msg = e instanceof Error ? e.message : "Update failed";
      setActionError(msg);
      setTimeout(() => setActionError(null), 5000);
      toast.error(`Could not update "${s.title}".`, msg);
    } finally {
      setMutating(false);
    }
  };

  const removeSchedule = async (s: Schedule) => {
    if (mutating) return; // ignore double-fires while a request is in flight
    setMutating(true);
    setActionError(null);
    try {
      const r = await fetch(`${BACKEND}/api/maintenance/${s.id}`, {
        method: "DELETE",
        headers: { "x-user": actor },
      });
      const json = await r.json();
      // A 404 here means someone else removed it first. The row is gone either
      // way, so the list is refreshed rather than an error raised over a state
      // the operator already wanted.
      if (!json.success && r.status !== 404) throw new Error(json.message ?? "Delete failed");
      await refresh();
      setDeleteTarget(null);
      setDetail(null);
      toast.success(`"${s.title}" was deleted.`);
    } catch (e) {
      await refresh();
      const msg = e instanceof Error ? e.message : "Delete failed";
      setActionError(msg);
      setTimeout(() => setActionError(null), 5000);
      toast.error(`Could not delete "${s.title}".`, msg);
    } finally {
      setMutating(false);
    }
  };

  const openEdit = (s: Schedule) => {
    const starts = new Date(s.starts_at);
    const ends = new Date(s.ends_at);
    const dateOf = (d: Date) => phDate(d.getTime());
    const timeOf = (d: Date) => phTime(d.getTime());
    setForm({
      title: s.title,
      description: s.description ?? "",
      // Stored low-to-high; a southbound form reads in travel order, high to low.
      startKm: String(s.direction === "SB" ? Math.max(s.start_km, s.end_km) : Math.min(s.start_km, s.end_km)),
      endKm: String(s.direction === "SB" ? Math.min(s.start_km, s.end_km) : Math.max(s.start_km, s.end_km)),
      // Older rows may say "Both", which the form no longer offers. They open
      // as northbound if they run up the km posts, southbound if down.
      direction: s.direction === "Both" ? "NB" : s.direction,
      lanes: parseClosure(s.lane_closure).lanes,
      fullClosure: parseClosure(s.lane_closure).full,
      lanesLegacy: parseClosure(s.lane_closure).legacy,
      startDate: dateOf(starts),
      startTime: timeOf(starts),
      endDate: dateOf(ends),
      endTime: timeOf(ends),
    });
    setEditId(s.id);
    originalStartRef.current = `${dateOf(starts)}T${timeOf(starts)}`;
    setFormError(null);
    setDetail(null);
    setFormOpen(true);
  };

  const submitForm = async (force = false) => {
    const startKm = Number(form.startKm);
    const endKm = Number(form.endKm);
    if (form.title.trim().length < 3) return setFormError("Give the work a short title (at least 3 characters).");
    if (form.startKm === "" || form.endKm === "" || Number.isNaN(startKm) || Number.isNaN(endKm))
      return setFormError("Enter a start km and an end km.");
    if (startKm < KM_MIN || startKm > KM_MAX || endKm < KM_MIN || endKm > KM_MAX)
      return setFormError(`Km posts on this corridor run from ${KM_MIN} (${displayExitName(byKm[0]?.exit_name ?? "")}) to ${KM_MAX} (${displayExitName(byKm[byKm.length - 1]?.exit_name ?? "")}).`);
    // Start is where traffic reaches the works first: northbound runs up the
    // km posts, southbound down them.
    if (form.direction === "NB" ? endKm < startKm : endKm > startKm)
      return setFormError(
        form.direction === "NB"
          ? "Northbound runs up the km posts, so the end must be at a higher km than the start."
          : "Southbound runs down the km posts, so the end must be at a lower km than the start.",
      );
    if (!form.startDate || !form.endDate) return setFormError("Start and end date are required.");
    const startsAt = new Date(phToMs(form.startDate, form.startTime));
    const endsAt = new Date(phToMs(form.endDate, form.endTime));
    if (endsAt <= startsAt) return setFormError("The window must end after it starts.");
    const startChanged = !editId || `${form.startDate}T${form.startTime || "00:00"}` !== originalStartRef.current;
    if (startChanged && startsAt.getTime() < Date.now())
      return setFormError("The start can't be in the past. Pick a date and time from now onward.");
    if (!force && conflicts.some((c) => c.kind === "critical"))
      return setFormError("This closes the same lane as existing work. Change the window, location or lanes, or choose Schedule anyway.");

    setSaving(true);
    setFormError(null);
    setServerConflict(false);
    try {
      const r = await fetch(editId ? `${BACKEND}/api/maintenance/${editId}` : `${BACKEND}/api/maintenance/schedule`, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "x-user": actor },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          // The API, map and mobile app all read start..end as a span from the
          // lower km post to the higher one; direction carries the travel order.
          startKm: Math.min(startKm, endKm),
          endKm: Math.max(startKm, endKm),
          direction: form.direction,
          laneClosure: closureText(form.lanes, form.fullClosure, form.lanesLegacy),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          // The panel above is a preview; the API makes the real decision and
          // only accepts overlapping work when told it is intentional.
          ...(force ? { allowOverlap: true } : {}),
        }),
      });
      const json = await r.json();
      if (!json.success && json.code === "conflict") {
        // Someone else (another operator, the mobile app) got there first, or the
        // preview was stale. Same choice as the panel: change it, or confirm.
        setServerConflict(true);
        setFormError(json.message?.replace(/ Resend with allowOverlap: true to schedule it anyway\./, "") + " Change the window or location, or choose Schedule anyway.");
        return;
      }
      if (!json.success) throw new Error(json.message ?? "Save failed");
      const wasEdit = editId !== null;
      await refresh();
      setFormOpen(false);
      setForm(emptyForm);
      setEditId(null);
      toast.success(
        wasEdit ? `Updated "${form.title.trim()}".` : `Scheduled "${form.title.trim()}".`,
        `${form.direction} · Km ${startKm}–${endKm} · ${closureText(form.lanes, form.fullClosure, form.lanesLegacy)}`,
      );
    } catch (e) {
      // Kept inline as well as in the toast: the form stays open on failure, so
      // the message belongs next to the fields that need fixing.
      const msg = e instanceof Error ? e.message : "Save failed — is the backend running?";
      setFormError(msg);
      toast.error(editId ? "Could not save your changes." : "Could not schedule the work.", msg);
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  /* Exits along the corridor by km post, and the corridor's ends. The km of
     each exit is the NLEX km post (Balintawak 12 -> Sta. Ines 88.25; see
     lib/nlex-exits), so picking an exit fills its km and nobody has to type
     one. The box stays editable for works that start between two exits. */
  const byKm = useMemo(() => [...NLEX_EXITS].sort((a, b) => a.km - b.km), [NLEX_EXITS]);
  const KM_MIN = byKm[0]?.km ?? 0;
  const KM_MAX = byKm[byKm.length - 1]?.km ?? CORRIDOR_KM;

  /* Checks the form against existing live work as it is filled in.
     critical    — same carriageway, overlapping km and time, same lane (or a full closure)
     operational — same carriageway, overlapping km and time, different lanes
     nearby      — same carriageway, km within NEARBY_KM of each other, overlapping time
     opposing    — other carriageway, overlapping km, overlapping time
     Only critical blocks the save (with a Schedule anyway override). */
  const conflicts = useMemo(() => {
    const out: { s: Schedule; kind: ConflictKind; detail: string }[] = [];
    if (!formOpen || form.startKm === "" || form.endKm === "" || !form.startDate || !form.endDate) return out;
    const sKm = Number(form.startKm), eKm = Number(form.endKm);
    const from = phToMs(form.startDate, form.startTime);
    const to = phToMs(form.endDate, form.endTime);
    if ([sKm, eKm, from, to].some(Number.isNaN) || to <= from) return out;
    const lo = Math.min(sKm, eKm), hi = Math.max(sKm, eKm);
    const closure = closureText(form.lanes, form.fullClosure, form.lanesLegacy);
    for (const s of schedules) {
      if (s.id === editId || (s.status !== "scheduled" && s.status !== "in_progress")) continue;
      const oFrom = Math.max(from, new Date(s.starts_at).getTime());
      const oTo = Math.min(to, new Date(s.ends_at).getTime());
      if (oTo <= oFrom) continue;
      const sLo = Math.min(s.start_km, s.end_km), sHi = Math.max(s.start_km, s.end_km);
      const kmLo = Math.max(lo, sLo), kmHi = Math.min(hi, sHi);
      const point = lo === hi || sLo === sHi;
      const kmOverlap = point ? kmLo <= kmHi : kmLo < kmHi;
      const sameWay = s.direction === form.direction || s.direction === "Both";
      const mins = Math.round((oTo - oFrom) / 60_000);
      const dur = `${Math.floor(mins / 60) > 0 ? `${Math.floor(mins / 60)}h ` : ""}${mins % 60 ? `${mins % 60}m` : ""}`.trim();
      if (kmOverlap) {
        out.push({ s, kind: !sameWay ? "opposing" : lanesClash(closure, s.lane_closure) ? "critical" : "operational", detail: ` Overlap: Km ${kmLo}–${kmHi} · ${dur}` });
      } else if (sameWay) {
        const gap = Math.max(lo - sHi, sLo - hi);
        if (gap <= NEARBY_KM) out.push({ s, kind: "nearby", detail: ` ${gap.toFixed(1)} km apart · ${dur} of shared time` });
      }
    }
    const rank: Record<ConflictKind, number> = { critical: 0, operational: 1, nearby: 2, opposing: 3 };
    return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
  }, [formOpen, form, schedules, editId]);
  const hasCritical = conflicts.some((c) => c.kind === "critical");

  /* Timeline and corridor are for planning, so with no status filter they show
     only live work. Picking Completed or Cancelled in the filter shows those. */
  const planned = useMemo(
    () => (statusFilter === "all" ? visible.filter((s) => s.status === "scheduled" || s.status === "in_progress") : visible),
    [visible, statusFilter],
  );

  const timeline = useMemo(() => {
    // Next 24h starts at the current hour so the axis ticks land on clean hours.
    const startMs = range === "next24" ? Math.floor(now / 3_600_000) * 3_600_000 : phDayStart(now);
    const endMs = startMs + (range === "week" ? 7 : 1) * 86_400_000;
    const span = endMs - startMs;
    const ticks: { pct: number; label: string }[] = [];
    if (range === "today") {
      for (let h = 0; h < 24; h += 3) ticks.push({ pct: (h / 24) * 100, label: `${String(h).padStart(2, "0")}:00` });
    } else if (range === "next24") {
      for (let h = 0; h < 24; h += 3)
        ticks.push({ pct: (h / 24) * 100, label: new Date(startMs + h * 3_600_000).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }) });
    } else {
      for (let d = 0; d < 7; d++)
        ticks.push({ pct: (d / 7) * 100, label: new Date(startMs + d * 86_400_000).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", day: "numeric" }) });
    }
    const rows = planned
      .map((s) => ({ s, from: new Date(s.starts_at).getTime(), to: new Date(s.ends_at).getTime() }))
      .filter((r) => r.to > startMs && r.from < endMs)
      .sort((a, b) => a.from - b.from)
      .map((r) => {
        const left = ((Math.max(r.from, startMs) - startMs) / span) * 100;
        const width = Math.max(((Math.min(r.to, endMs) - Math.max(r.from, startMs)) / span) * 100, 0.8);
        return { s: r.s, left, width };
      });
    const nowPct = ((now - startMs) / span) * 100;
    const label = range === "today"
      ? new Date(now).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" })
      : range === "next24" ? "Next 24 hours" : "Next 7 days";
    return { ticks, rows, nowPct, label };
  }, [planned, now, range]);

  /* One lane per carriageway; jobs that overlap in km stack into sub-rows so
     none hides another. A "Both" job is drawn on each carriageway. */
  const corridor = useMemo(() => {
    const span = Math.max(KM_MAX - KM_MIN, 1);
    const pct = (km: number) => ((km - KM_MIN) / span) * 100;
    // Time scope: without one, work planned for next month looks like it is on
    // the road today. "Now" is what is actually in progress.
    const dayStart = phDayStart(now);
    const winFrom = corridorScope === "today" ? dayStart : now;
    const winTo = corridorScope === "today" ? dayStart + DAY_MS : corridorScope === "next24" ? now + DAY_MS : now + 7 * DAY_MS;
    const scoped = planned.filter((s) => {
      const st = new Date(s.starts_at).getTime();
      const en = new Date(s.ends_at).getTime();
      if (corridorScope === "now") return s.status === "in_progress" || (statusFilter !== "all" && st <= now && en > now);
      return st < winTo && en > winFrom;
    });
    const lane = (dir: "NB" | "SB") => {
      const items = scoped
        .filter((s) => s.direction === dir || s.direction === "Both")
        .map((s) => ({ s, lo: Math.min(s.start_km, s.end_km), hi: Math.max(s.start_km, s.end_km) }))
        .sort((a, b) => a.lo - b.lo);
      const rowEnds: number[] = [];
      const placed = items.map((it) => {
        let r = rowEnds.findIndex((end) => end <= it.lo);
        if (r === -1) r = rowEnds.length;
        rowEnds[r] = it.hi;
        return { s: it.s, row: r, left: pct(it.lo), width: Math.max(pct(it.hi) - pct(it.lo), 0.6) };
      });
      return { dir, rows: Math.max(rowEnds.length, 1), placed };
    };
    const ticks: { pct: number; label: string }[] = [];
    for (let km = Math.ceil(KM_MIN / 10) * 10; km <= KM_MAX; km += 10) ticks.push({ pct: pct(km), label: `Km ${km}` });
    return { lanes: [lane("NB"), lane("SB")], ticks, exitPcts: byKm.map((x) => pct(x.km)), count: scoped.length };
  }, [planned, byKm, KM_MIN, KM_MAX, corridorScope, now, statusFilter]);

  /* Switching direction reverses the stretch: the end becomes where traffic
     now arrives first. Km 20 -> 30 northbound, toggle to SB and it reads
     Km 30 -> 20. */
  const setDirection = (d: (typeof DIRECTIONS)[number]) =>
    setForm((f) => (f.direction === d ? f : { ...f, direction: d, startKm: f.endKm, endKm: f.startKm }));

  const segmentNote =
    form.startKm !== "" && form.endKm !== "" && !Number.isNaN(Number(form.startKm)) && !Number.isNaN(Number(form.endKm))
      ? `${Math.abs(Number(form.endKm) - Number(form.startKm)).toFixed(1)} km · near ${nearestExitName(NLEX_EXITS, Number(form.startKm))} → ${nearestExitName(NLEX_EXITS, Number(form.endKm))}`
      : null;

  const check = (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="nc-ops-check" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <section className={`${styles.page} nc-ops nc-ops-maint`}>
      <PageHeader
        icon={Wrench}
        title="Maintenance Overview"
        subtitle="Scheduled roadworks, closures, and asset upkeep across NLEX"
        actions={
          <button className="btn-primary nc-ops-new" onClick={() => { setFormError(null); setEditId(null); setForm(emptyForm); setFormOpen(true); }}>
            <Plus size={15} aria-hidden="true" /> Schedule Maintenance
          </button>
        }
      />

      {/* Row A — filters + primary action */}
      <div className={`${styles.filterRow} nc-ops-filters`}>
        <div className={styles.filterGroup}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4h11M4.5 8h7M6.5 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <span className={styles.filterLabel}>Status</span>
          <div className={`${styles.segmented} nc-ops-status-filter`}>
            {(["all", "scheduled", "in_progress", "completed", "cancelled"] as const).map((s) => (
              <button key={s} className={statusFilter === s ? "active" : ""} onClick={() => setStatusFilter(s)} aria-pressed={statusFilter === s}>
                {statusFilter === s && check}
                {s === "all" ? "All" : STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className={`${styles.filterGroup} nc-ops-filter-sel`}>
          <span className={styles.filterLabel}>Date</span>
          <Select
            value={dateFilter}
            placeholder="Any date"
            options={[
              { label: "Any date", value: "all" },
              { label: "Today", value: "today" },
              { label: "Tomorrow", value: "tomorrow" },
              { label: "This week", value: "week" },
              { label: "Custom…", value: "custom" },
            ]}
            onChange={(v) => setDateFilter(v as typeof dateFilter)}
          />
          {dateFilter === "custom" && (
            <>
              <input type="date" className="ms-input nc-ops-filter-date" aria-label="From date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
              <span aria-hidden="true">–</span>
              <input type="date" className="ms-input nc-ops-filter-date" aria-label="To date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
        </div>

        <div className={`${styles.filterGroup} nc-ops-filter-sel`}>
          <span className={styles.filterLabel}>Direction</span>
          <Select
            value={directionFilter}
            placeholder="All"
            options={[
              { label: "All", value: "all" },
              { label: "NB Northbound", value: "NB" },
              { label: "SB Southbound", value: "SB" },
            ]}
            onChange={(v) => setDirectionFilter(v as typeof directionFilter)}
          />
        </div>

        <div className={`${styles.filterGroup} nc-ops-filter-sel`}>
          <span className={styles.filterLabel}>Closure</span>
          <Select
            value={closureFilter}
            placeholder="All"
            options={[
              { label: "All", value: "all" },
              { label: "No lane closure", value: "none" },
              { label: "1 lane", value: "one" },
              { label: "2+ lanes", value: "multi" },
              { label: "Full closure", value: "full" },
            ]}
            onChange={(v) => setClosureFilter(v as typeof closureFilter)}
          />
        </div>

        {issuesOnly && (
          <button type="button" className="btn-muted nc-ops-clear" onClick={() => setIssuesOnly(false)}>
            Needs attention only · {visible.length} ✕
          </button>
        )}

        {filtersActive && (
          <button type="button" className="btn-muted nc-ops-clear" onClick={clearFilters}>Clear filters</button>
        )}

        <label className="ms-search-bar nc-ops-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search schedules</span>
          <input type="text" placeholder="Search schedules…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </label>
      </div>

      {/* Row B — what needs attention right now */}
      <div className={`${styles.kpiRow} ds-rise`}>
        <article className={styles.kpiTile}>
          <h3>Active Now</h3>
          <div className={styles.kpiValue}>{loading ? "…" : `${kpi.active.length} ${kpi.active.length === 1 ? "work" : "works"}`}</div>
          <p className={styles.kpiHint}>{kpi.kmAffected > 0 ? `${kpi.kmAffected.toFixed(1)} km affected` : "no active roadwork"}</p>
        </article>
        <article className={styles.kpiTile}>
          <h3>Starting Soon</h3>
          <div className={styles.kpiValue}>{loading ? "…" : `${kpi.startingSoon.length} ${kpi.startingSoon.length === 1 ? "work" : "works"}`}</div>
          <p className={styles.kpiHint}>within the next 2 hrs</p>
        </article>
        <article className={styles.kpiTile}>
          <h3>Conflicts</h3>
          <div className={styles.kpiValue} style={!loading && kpi.conflicts.length > 0 ? { color: kpi.conflicts.some((c) => c[2] === "critical") ? "var(--color-danger)" : "var(--color-warning)" } : undefined}>
            {loading ? "…" : kpi.conflicts.length}
          </div>
          <p className={styles.kpiHint}>
            {kpi.conflicts.length > 0
              ? `${kpi.conflicts.filter((c) => c[2] === "critical").length} critical · ${kpi.conflicts.filter((c) => c[2] === "operational").length} operational`
              : "no overlapping work zones"}
          </p>
        </article>
        <article className={styles.kpiTile}>
          <h3>Next Up</h3>
          <div className={styles.kpiValue}>{loading ? "…" : kpi.next ? fmtClock(kpi.next.starts_at) : "—"}</div>
          <p className={styles.kpiHint}>{kpi.next ? `${kpi.next.direction} · ${kmRange(kpi.next)}` : filtersActive ? "nothing upcoming in this view" : "nothing upcoming"}</p>
        </article>
      </div>

      {/* Operational alerts */}
      {!loading && !error && (
        ops.alerts.length > 0 ? (
          <div className="nc-ops-alerts" role="status">
            <AlertTriangle size={18} aria-hidden="true" className="nc-ops-alerts-icon" />
            <div className="nc-ops-alerts-body">
              <p className="nc-ops-alerts-title">
                {ops.alerts.length === 1
                  ? "Maintenance window requires attention"
                  : `${ops.alerts.length} maintenance windows require attention`}
              </p>
              <ul className="nc-ops-alerts-list">
                {ops.alerts.slice(0, MAX_ALERTS).map((a, i) => (
                  <li key={a.key}>
                    <button type="button" className="nc-ops-alerts-row" onClick={() => { setActionError(null); setDetail(a.schedule); }}>
                      <span className="nc-ops-alerts-n">{i + 1}</span>
                      <strong>{a.schedule.title}</strong>
                      <span className="nc-ops-alerts-reason">{a.reason}</span>
                      <span className="nc-ops-sub">{a.schedule.direction} {kmRange(a.schedule)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <button type="button" className="btn-muted nc-ops-alerts-view" onClick={() => setIssuesOnly(true)}>
              {ops.alerts.length > MAX_ALERTS ? `View all ${ops.alerts.length}` : "View issues"} →
            </button>
          </div>
        ) : schedules.length > 0 ? (
          <p className="nc-ops-alerts-ok"><Check size={13} aria-hidden="true" /> No conflicts or overdue windows</p>
        ) : null
      )}

      {/* Row C — schedule list */}
      <article className={`${styles.chartCard} ${styles.chart1} nc-ops-card`}>
        <div className={`${styles.chartHead} nc-ops-card-head`}>
          <div className={styles.headText}>
            <h3>Maintenance Schedules</h3>
            <p className={styles.subtitle}>
              {loading ? "Loading…" : `${visible.length} of ${schedules.length} shown · All times PHT (UTC+8)`}
            </p>
          </div>
          <div className={`${styles.segmented} nc-ops-view-switch`} role="group" aria-label="View">
            {(["table", "timeline", "corridor"] as const).map((v) => (
              <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)} aria-pressed={view === v}>
                {v === "table" ? "Table" : v === "timeline" ? "Timeline" : "Corridor"}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <StateNote kind="offline">Live data unavailable — is the backend running on port 4000?</StateNote>
        ) : !loading && schedules.length === 0 ? (
          <StateNote kind="nodata">No maintenance scheduled yet — create the first one.</StateNote>
        ) : !loading && visible.length === 0 ? (
          <StateNote kind="nodata">Nothing matches the current filters.</StateNote>
        ) : view === "timeline" ? (
          <div className="nc-ops-tl">
            <div className="nc-ops-tl-bar">
              <strong>{timeline.label}</strong>
              <div className={`${styles.segmented} nc-ops-range`} role="group" aria-label="Range">
                {(["today", "next24", "week"] as const).map((r) => (
                  <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)} aria-pressed={range === r}>
                    {r === "today" ? "Today" : r === "next24" ? "Next 24h" : "7 days"}
                  </button>
                ))}
              </div>
            </div>
            <div className="nc-ops-tl-grid">
              <div className="nc-ops-tl-label" />
              <div className="nc-ops-tl-axis">
                {timeline.ticks.map((t) => <span key={t.label} style={{ left: `${t.pct}%` }}>{t.label}</span>)}
              </div>
            </div>
            {timeline.rows.length === 0 ? (
              <p className="nc-ops-tl-empty">No maintenance in this range.</p>
            ) : (
              timeline.rows.map(({ s, left, width }) => (
                <div key={s.id} className="nc-ops-tl-grid">
                  <div className="nc-ops-tl-label">
                    <strong>{s.title}</strong>
                    <span className="nc-ops-sub">{s.direction} · {kmRange(s)}</span>
                  </div>
                  <div className="nc-ops-tl-track">
                    {timeline.ticks.map((t) => <i key={t.label} className="nc-ops-tl-gridline" style={{ left: `${t.pct}%` }} />)}
                    {timeline.nowPct >= 0 && timeline.nowPct <= 100 && <i className="nc-ops-tl-now" style={{ left: `${timeline.nowPct}%` }} />}
                    <button
                      type="button"
                      className={`nc-ops-bar is-${s.status}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${s.title} · ${fmtWindow(s.starts_at, s.ends_at)}`}
                      onClick={() => { setActionError(null); setDetail(s); }}
                    >
                      {fmtClock(s.starts_at)}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : view === "corridor" ? (
          <div className="nc-ops-cor">
            <div className="nc-ops-tl-bar">
              <strong>
                Corridor · {{ now: "Current work", today: "Today's work", next24: "Next 24 hours", week: "Next 7 days" }[corridorScope]}
                {" · "}{corridor.count} {corridor.count === 1 ? "job" : "jobs"}
                {updatedAt ? ` · Updated ${new Date(updatedAt).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })}` : ""}
              </strong>
              <div className={`${styles.segmented} nc-ops-range`} role="group" aria-label="Corridor time scope">
                {(["now", "today", "next24", "week"] as const).map((k) => (
                  <button key={k} className={corridorScope === k ? "active" : ""} onClick={() => setCorridorScope(k)} aria-pressed={corridorScope === k}>
                    {k === "now" ? "Now" : k === "today" ? "Today" : k === "next24" ? "Next 24h" : "7 Days"}
                  </button>
                ))}
              </div>
            </div>
            <div className="nc-ops-cor-axis">
              {corridor.ticks.map((t) => <span key={t.label} style={{ left: `${t.pct}%` }}>{t.label}</span>)}
            </div>
            {corridor.lanes.map((l) => (
              <div key={l.dir} className="nc-ops-cor-lane">
                <div className="nc-ops-cor-name">{l.dir} <span className="nc-ops-sub">{DIRECTION_LABEL[l.dir]}</span></div>
                <div className="nc-ops-cor-road" style={{ height: l.rows * 30 + 12 }}>
                  {corridor.exitPcts.map((p, i) => <i key={i} className="nc-ops-tl-gridline" style={{ left: `${p}%` }} />)}
                  {l.placed.map(({ s, row, left, width }) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`nc-ops-bar is-${s.status}`}
                      style={{ left: `${left}%`, width: `${width}%`, top: 6 + row * 30 }}
                      title={`${s.title} · ${kmRange(s)} · ${fmtWindow(s.starts_at, s.ends_at)}`}
                      onClick={() => { setActionError(null); setDetail(s); }}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {corridor.count === 0 && <p className="nc-ops-tl-empty">No maintenance in this scope.</p>}
          </div>
        ) : (
          <div className={`${styles.plazaTableWrap} nc-ops-table-wrap`}>
            <table className={`${styles.plazaTable} nc-ops-table`}>
              <thead>
                <tr>
                  <SortableTh label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                  <SortableTh label="Work" sortKey="title" sort={sort} onToggle={toggle} />
                  <SortableTh label="Location" sortKey="location" sort={sort} onToggle={toggle} />
                  <SortableTh label="Direction" sortKey="direction" sort={sort} onToggle={toggle} />
                  <SortableTh label="Closure" sortKey="closure" sort={sort} onToggle={toggle} />
                  <SortableTh label="Window" sortKey="window" sort={sort} onToggle={toggle} />
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id} className={styles.clickableRow} onClick={() => { setActionError(null); setDetail(s); }}>
                    <td className="nc-ops-td-status">
                      <StatusControl
                        schedule={s}
                        disabled={mutating}
                        onAdvance={(to) => changeStatus(s, to)}
                        onEdit={() => openEdit(s)}
                        onView={() => { setActionError(null); setDetail(s); }}
                        onDelete={() => { setActionError(null); setDeleteTarget(s); }}
                        onCancel={() => { setActionError(null); setCancelReason(""); setCancelTarget(s); }}
                      />
                    </td>
                    <td className="nc-ops-td-work">
                      <strong>{s.title}</strong>
                      {s.description && (
                        <span className="nc-ops-sub is-clip">
                          {s.description}
                        </span>
                      )}
                    </td>
                    <td className="nc-ops-td-loc nc-ops-num" data-label="Location">{kmRange(s)}</td>
                    <td className="nc-ops-td-dir" data-label="Direction">
                      <span className={`nc-ops-dir is-${s.direction}`}>{s.direction}</span>
                    </td>
                    <td className="nc-ops-td-closure" data-label="Closure">
                      <span className={`nc-ops-closure is-${closureSeverity(s.lane_closure)}`}>{s.lane_closure}</span>
                    </td>
                    <td className="nc-ops-td-window nc-ops-num" data-label="Window">{fmtWindow(s.starts_at, s.ends_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {actionError && !detail && !cancelTarget && !deleteTarget && (
          <p className="nc-ops-error is-card">{actionError}</p>
        )}
      </article>

      {/* Detail modal */}
      {detail && (
        <div className={`${styles.detailBackdrop} nc-ops-backdrop`} role="dialog" aria-modal="true" aria-label={detail.title} onClick={() => setDetail(null)}>
          <div className={`${styles.detailModal} nc-ops-modal is-detail`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailAccent} />
            <div className={`${styles.detailHeader} nc-ops-modal-head`}>
              <div className={styles.detailIcon}><Wrench size={18} aria-hidden="true" /></div>
              <div className={styles.detailTitles}>
                <h3>{detail.title}</h3>
                <p><span className={`ms-badge ${STATUS_META[detail.status].badge}`}>{STATUS_META[detail.status].label}</span></p>
              </div>
              <button className={styles.detailClose} onClick={() => setDetail(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className={styles.detailBody}>
              {([
                ["Location", `${kmRange(detail)} · ${detail.direction}`],
                ["Near", `${nearestExitName(NLEX_EXITS, detail.start_km)} → ${nearestExitName(NLEX_EXITS, detail.end_km)}`],
                ["Lane closure", detail.lane_closure],
                ["Window", fmtWindow(detail.starts_at, detail.ends_at)],
                ["Description", detail.description || "—"],
                ...(detail.status_reason ? ([["Reason", detail.status_reason]] as [string, string][]) : []),
                ["Created", new Date(detail.created_at).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })],
              ] as [string, string][]).map(([k, v], i) => (
                <div key={k} className={`${styles.detailRow} ${i % 2 === 0 ? styles.detailRowAlt : ""} nc-ops-detail-row`}>
                  <span className={styles.detailKey}>{k}</span>
                  <span className={`${styles.detailVal} nc-ops-num`}>{v}</span>
                </div>
              ))}
            </div>
            {actionError && <p className="nc-ops-error is-modal">{actionError}</p>}
            {/* Always rendered, because Delete applies to every status. The
                live-only actions are gated individually inside: a completed or
                already-cancelled schedule has nothing to advance or call off,
                and the API answers 409 if asked, but it can still be removed. */}
            <div className="nc-ops-actions is-wrap">
              {(detail.status === "scheduled" || detail.status === "in_progress") && (
                <button className="btn-muted" disabled={mutating} onClick={() => openEdit(detail)}>
                  Edit details
                </button>
              )}
              {NEXT_ACTIONS[detail.status].map((a) => (
                <button key={a.to} className="btn-primary" disabled={mutating} onClick={() => changeStatus(detail, a.to)}>
                  {mutating ? "Saving…" : a.label}
                </button>
              ))}
              {(detail.status === "scheduled" || detail.status === "in_progress") && (
                <button
                  className="btn-muted"
                  disabled={mutating}
                  onClick={() => { setCancelReason(""); setCancelTarget(detail); setDetail(null); }}
                >
                  Cancel schedule
                </button>
              )}
              <button
                className="btn-danger nc-ops-push"
                disabled={mutating}
                onClick={() => { setDeleteTarget(detail); setDetail(null); }}
              >
                <Trash2 size={14} aria-hidden="true" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete-confirmation modal.
          No reason field: a reason is for a schedule that is being called off and
          kept, which is what Cancel does. This erases the row, so the only thing
          worth asking is whether the operator means it. The copy spells out the
          difference, because "cancel" and "delete" sitting side by side is
          otherwise a guess. */}
      {deleteTarget && (
        <div className={`${styles.detailBackdrop} nc-ops-backdrop`} role="dialog" aria-modal="true" aria-label="Delete schedule" onClick={() => setDeleteTarget(null)}>
          <div className={`${styles.detailModal} nc-ops-modal is-confirm`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailAccent} />
            <div className={`${styles.detailHeader} nc-ops-modal-head`}>
              <div className={`${styles.detailIcon} nc-ops-icon-danger`}><Trash2 size={18} aria-hidden="true" /></div>
              <div className={styles.detailTitles}>
                <h3>Delete this schedule?</h3>
                <p className="nc-ops-num">{deleteTarget.title} · {kmRange(deleteTarget)}</p>
              </div>
              <button className={styles.detailClose} onClick={() => setDeleteTarget(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="nc-ops-modal-body">
              <p className="nc-ops-prose">
                This removes the record entirely. If the work was planned and then called
                off, use <strong>Cancel schedule</strong> instead — that keeps the entry and
                its reason on the corridor record.
              </p>
              {actionError && <p className="nc-ops-error">{actionError}</p>}
            </div>
            <div className="nc-ops-actions">
              <button
                className="btn-danger is-solid"
                disabled={mutating}
                onClick={() => removeSchedule(deleteTarget)}
              >
                {mutating ? "Deleting…" : "Delete permanently"}
              </button>
              <button className="btn-muted" disabled={mutating} onClick={() => setDeleteTarget(null)}>
                Keep it
              </button>
            </div>
            <div className={`${styles.detailFooter} nc-ops-modal-foot`}>
              <Info size={14} aria-hidden="true" />
              <p>This cannot be undone.</p>
            </div>
          </div>
        </div>
      )}

      {/* Cancel-with-reason modal */}
      {cancelTarget && (
        <div className={`${styles.detailBackdrop} nc-ops-backdrop`} role="dialog" aria-modal="true" aria-label="Cancel schedule" onClick={() => setCancelTarget(null)}>
          <div className={`${styles.detailModal} nc-ops-modal is-confirm`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailAccent} />
            <div className={`${styles.detailHeader} nc-ops-modal-head`}>
              <div className={`${styles.detailIcon} nc-ops-icon-danger`}><AlertTriangle size={18} aria-hidden="true" /></div>
              <div className={styles.detailTitles}>
                <h3>Cancel this maintenance schedule?</h3>
                <p className="nc-ops-num">{cancelTarget.title} · {kmRange(cancelTarget)}</p>
              </div>
              <button className={styles.detailClose} onClick={() => setCancelTarget(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="nc-ops-modal-body">
              <p className="nc-ops-prose">
                The schedule will be marked as cancelled and removed from active maintenance
                planning. You can restore it later.
              </p>
              <div className="ms-input-group">
                <label htmlFor="ms-cancel-reason">Cancellation reason <span className="ms-req">*</span></label>
                <textarea
                  id="ms-cancel-reason"
                  className="ms-input ms-textarea"
                  rows={3}
                  placeholder="Why is this work being cancelled?"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
              {actionError && <p className="nc-ops-error">{actionError}</p>}
            </div>
            <div className="nc-ops-actions">
              <button
                className="btn-danger is-solid"
                disabled={mutating || !cancelReason.trim()}
                onClick={() => changeStatus(cancelTarget, "cancelled", cancelReason.trim())}
              >
                {mutating ? "Cancelling…" : "Cancel Schedule"}
              </button>
              <button className="btn-muted" disabled={mutating} onClick={() => setCancelTarget(null)}>
                Keep it
              </button>
            </div>
            <div className={`${styles.detailFooter} nc-ops-modal-foot`}>
              <Info size={14} aria-hidden="true" />
              <p>A cancelled schedule stays on record and can be restored.</p>
            </div>
          </div>
        </div>
      )}

      {/* Schedule form modal */}
      {formOpen && (
        <div className={`${styles.detailBackdrop} nc-ops-backdrop`} role="dialog" aria-modal="true" aria-label="Schedule maintenance" onClick={() => !saving && setFormOpen(false)}>
          <div className={`${styles.detailModal} nc-ops-modal is-form`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailAccent} />
            <div className={`${styles.detailHeader} nc-ops-modal-head`}>
              <div className={styles.detailIcon}><Wrench size={18} aria-hidden="true" /></div>
              <div className={styles.detailTitles}>
                <h3>{editId ? "Edit Maintenance" : "Schedule Maintenance"}</h3>
              </div>
              <button className={styles.detailClose} onClick={() => setFormOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="nc-ops-form-body">
              <div className="ms-input-group">
                <label htmlFor="ms-title">Title <span className="ms-req">*</span></label>
                <input
                  id="ms-title"
                  type="text"
                  className="ms-input"
                  placeholder="e.g. Road resurfacing, toll booth repair…"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              </div>

              <p className="ms-section-label">Location</p>
              {/* Direction first: it decides which way the stretch runs, so the
                  start and end read in travel order. */}
              <div className="ms-input-group">
                <label id="ms-direction-label">Direction <span className="ms-req">*</span></label>
                <div className="nc-ops-seg2" role="group" aria-labelledby="ms-direction-label">
                  {DIRECTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={form.direction === d ? "active" : ""}
                      onClick={() => setDirection(d)}
                      aria-pressed={form.direction === d}
                    >
                      {form.direction === d && check}
                      {d} <span className="nc-ops-seg2-name">{DIRECTION_LABEL[d]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="nc-ops-grid-loc">
                <div className="ms-input-group">
                  <label htmlFor="ms-start-km">Start Km <span className="ms-req">*</span></label>
                  <input
                    id="ms-start-km"
                    type="number" step={0.01} min={KM_MIN} max={KM_MAX} className="ms-input nc-ops-num"
                    placeholder={form.direction === "NB" ? "e.g. 32" : "e.g. 38"} value={form.startKm}
                    onChange={(e) => set("startKm", e.target.value)}
                  />
                  {form.startKm !== "" && !Number.isNaN(Number(form.startKm)) && (
                    <span className="nc-ops-sub">Near {nearestExitName(NLEX_EXITS, Number(form.startKm))}</span>
                  )}
                </div>
                <div className="ms-input-group">
                  <label htmlFor="ms-end-km">End Km <span className="ms-req">*</span></label>
                  <input
                    id="ms-end-km"
                    type="number" step={0.01} min={KM_MIN} max={KM_MAX} className="ms-input nc-ops-num"
                    placeholder={form.direction === "NB" ? "e.g. 38" : "e.g. 32"} value={form.endKm}
                    onChange={(e) => set("endKm", e.target.value)}
                  />
                  {form.endKm !== "" && !Number.isNaN(Number(form.endKm)) && (
                    <span className="nc-ops-sub">Near {nearestExitName(NLEX_EXITS, Number(form.endKm))}</span>
                  )}
                </div>
              </div>

              {segmentNote && (
                <p className="nc-ops-segment-note">
                  <MapPin size={13} aria-hidden="true" /> {DIRECTION_LABEL[form.direction]} · {segmentNote}
                </p>
              )}

              <div className="ms-input-group">
                <label id="ms-lanes-label">Lanes closed ({form.direction})</label>
                <div className="nc-ops-lanes" role="group" aria-labelledby="ms-lanes-label">
                  <span className="nc-ops-lanes-edge" aria-hidden="true">Median</span>
                  {LANE_OPTIONS.map((l) => {
                    const on = form.fullClosure || form.lanes.includes(l);
                    return (
                      <button
                        key={l}
                        type="button"
                        disabled={form.fullClosure}
                        className={on ? "active" : ""}
                        aria-pressed={on}
                        onClick={() => setForm((f) => ({
                          ...f,
                          lanesLegacy: "",
                          lanes: f.lanes.includes(l) ? f.lanes.filter((x) => x !== l) : [...f.lanes, l],
                        }))}
                      >
                        {l}{LANE_HINT[l] ? <span className="nc-ops-seg2-name"> {LANE_HINT[l]}</span> : null}
                      </button>
                    );
                  })}
                  <span className="nc-ops-lanes-edge" aria-hidden="true">Road edge</span>
                  <button
                    type="button"
                    className={`is-full${form.fullClosure ? " active" : ""}`}
                    aria-pressed={form.fullClosure}
                    onClick={() => setForm((f) => ({ ...f, fullClosure: !f.fullClosure, lanesLegacy: "" }))}
                  >
                    Full closure
                  </button>
                </div>
                <span className="nc-ops-sub">
                  {form.lanesLegacy
                    ? `Currently saved as “${form.lanesLegacy}” — pick the lanes to be specific.`
                    : `Saved as: ${closureText(form.lanes, form.fullClosure, form.lanesLegacy)} · Lanes are counted from the median, in the direction of travel: Lane 1 is the inner (fast) lane, the highest lane number is the outer (slow) lane. Same for NB and SB.`}
                </span>
              </div>

              <p className="ms-section-label">Window · PHT (UTC+8)</p>
              <div className="nc-ops-grid-win">
                <div className="ms-input-group">
                  <label htmlFor="ms-start-date">Start date <span className="ms-req">*</span></label>
                  <input id="ms-start-date" type="date" min={editId ? undefined : todayLocal()} className="ms-input" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
                </div>
                <div className="ms-input-group">
                  <label htmlFor="ms-start-time">Start time</label>
                  <input id="ms-start-time" type="time" className="ms-input" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
                </div>
                <div className="ms-input-group">
                  <label htmlFor="ms-end-date">End date <span className="ms-req">*</span></label>
                  <input id="ms-end-date" type="date" min={form.startDate || (editId ? undefined : todayLocal())} className="ms-input" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
                </div>
                <div className="ms-input-group">
                  <label htmlFor="ms-end-time">End time</label>
                  <input id="ms-end-time" type="time" className="ms-input" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
                </div>
              </div>

              <div className="ms-input-group">
                <label htmlFor="ms-description">Description</label>
                <textarea
                  id="ms-description"
                  className="ms-input ms-textarea"
                  rows={2}
                  placeholder="Scope of work, crew, equipment, traffic advisory notes…"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>

              {conflicts.length > 0 && (
                <div className={`nc-ops-conflict${hasCritical ? " is-direct" : ""}`} role="status">
                  <p className="nc-ops-conflict-title">
                    <AlertTriangle size={15} aria-hidden="true" />
                    {hasCritical
                      ? "Critical scheduling conflict"
                      : conflicts.some((c) => c.kind === "operational")
                        ? "Operational conflict: same stretch, different lanes"
                        : "Heads up: other work in this area"}
                  </p>
                  <ul>
                    {conflicts.slice(0, 3).map((c) => (
                      <li key={c.s.id}>
                        <i className={`nc-ops-sev is-${c.kind}`} aria-hidden="true" /><strong>{CONFLICT_LABEL[c.kind]}</strong> — &quot;{c.s.title}&quot; on {c.s.direction} {kmRange(c.s)} ({c.s.lane_closure}), {fmtWindow(c.s.starts_at, c.s.ends_at)}.
                        <span className="nc-ops-conflict-detail">{c.detail}</span>
                      </li>
                    ))}
                    {conflicts.length > 3 && <li className="nc-ops-alerts-more">+{conflicts.length - 3} more</li>}
                  </ul>
                  {hasCritical && (
                    <button type="button" className="btn-muted" disabled={saving} onClick={() => submitForm(true)}>
                      Schedule anyway
                    </button>
                  )}
                </div>
              )}

              {formError && <p className="nc-ops-error">{formError}</p>}
              {serverConflict && !hasCritical && (
                <button type="button" className="btn-muted" disabled={saving} onClick={() => submitForm(true)}>
                  Schedule anyway
                </button>
              )}
            </div>

            <div className="nc-ops-actions is-form">
              <button className="nc-pill" disabled={saving} onClick={() => submitForm()}>
                <Calendar size={15} aria-hidden="true" />
                {saving ? "Saving…" : editId ? "Save changes" : "Schedule Maintenance"}
              </button>
              <button className="btn-muted" disabled={saving} onClick={() => setFormOpen(false)}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
