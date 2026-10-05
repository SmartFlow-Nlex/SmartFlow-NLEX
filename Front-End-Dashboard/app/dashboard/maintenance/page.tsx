"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Calendar, ChevronDown, Info, MapPin, Plus, Search, Trash2, Wrench, X } from "lucide-react";
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
const LANE_CLOSURES = ["None", "Shoulder only", "1 lane", "2 lanes", "Full closure"] as const;

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

const fmtWindow = (startIso: string, endIso: string) => {
  const opt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
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

// The status badge IS the control: click it to see the allowed transitions.
function StatusControl({
  schedule,
  disabled,
  onAdvance,
  onCancel,
}: {
  schedule: Schedule;
  disabled: boolean;
  onAdvance: (to: Status) => void;
  onCancel: () => void;
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

  const meta = STATUS_META[schedule.status];
  const advances = NEXT_ACTIONS[schedule.status];
  const canCancel = schedule.status === "scheduled" || schedule.status === "in_progress";

  if (advances.length === 0 && !canCancel) {
    return <span className={`ms-badge ${meta.badge}`}>{meta.label}</span>;
  }

  return (
    <div className={`${styles.customSelectWrap} nc-ops-status`} ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`ms-badge ${meta.badge} nc-ops-status-btn`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="Change status"
      >
        {meta.label}
        <ChevronDown size={12} aria-hidden="true" className="nc-ops-chevron" />
      </button>
      {open && (
        <div className={`${styles.customSelectMenu} nc-ops-status-menu`}>
          {advances.map((a) => (
            <button
              key={a.to}
              type="button"
              className={`${styles.customSelectOption} nc-ops-select-opt`}
              onClick={() => {
                setOpen(false);
                onAdvance(a.to);
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="nc-ops-tick is-lead" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {a.label}
            </button>
          ))}
          {canCancel && (
            <button
              type="button"
              className={`${styles.customSelectOption} nc-ops-select-opt is-danger`}
              onClick={() => {
                setOpen(false);
                onCancel();
              }}
            >
              <X size={13} aria-hidden="true" className="nc-ops-tick is-lead" />
              Cancel schedule…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const emptyForm = {
  title: "",
  description: "",
  startKm: "",
  endKm: "",
  direction: "NB" as (typeof DIRECTIONS)[number],
  laneClosure: "Shoulder only" as (typeof LANE_CLOSURES)[number],
  startDate: "",
  startTime: "08:00",
  endDate: "",
  endTime: "17:00",
};

export default function MaintenancePage() {
  // Same corridor list as the map and the AI sandbox. See lib/nlex-exits.
  const { exits: NLEX_EXITS } = useNlexExits();
  const toast = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
  const counts = useMemo(() => {
    const by = { scheduled: 0, in_progress: 0, completed: 0, cancelled: 0 };
    for (const s of schedules) by[s.status]++;
    return by;
  }, [schedules]);

  const nextWindow = useMemo(() => {
    const upcoming = schedules
      .filter((s) => s.status === "scheduled" && new Date(s.starts_at) > new Date())
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return upcoming[0] ?? null;
  }, [schedules]);

  const kmUnderWork = useMemo(
    () =>
      schedules
        .filter((s) => s.status === "in_progress")
        .reduce((sum, s) => sum + Math.abs(s.end_km - s.start_km), 0),
    [schedules]
  );

  const filteredVisible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return schedules.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        kmRange(s).toLowerCase().includes(q) ||
        s.direction.toLowerCase().includes(q)
      );
    });
  }, [schedules, statusFilter, searchQuery]);

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
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setForm({
      title: s.title,
      description: s.description ?? "",
      startKm: String(s.start_km),
      endKm: String(s.end_km),
      // Older rows may say "Both", which the form no longer offers. They open
      // as northbound if they run up the km posts, southbound if down.
      direction: s.direction === "Both" ? (s.end_km >= s.start_km ? "NB" : "SB") : s.direction,
      laneClosure: s.lane_closure as (typeof LANE_CLOSURES)[number],
      startDate: dateOf(starts),
      startTime: timeOf(starts),
      endDate: dateOf(ends),
      endTime: timeOf(ends),
    });
    setEditId(s.id);
    setFormError(null);
    setDetail(null);
    setFormOpen(true);
  };

  const submitForm = async () => {
    const startKm = Number(form.startKm);
    const endKm = Number(form.endKm);
    if (form.title.trim().length < 3) return setFormError("Give the work a short title (at least 3 characters).");
    if (form.startKm === "" || form.endKm === "" || Number.isNaN(startKm) || Number.isNaN(endKm))
      return setFormError("Pick a start exit and an end exit.");
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
    const startsAt = new Date(`${form.startDate}T${form.startTime || "00:00"}`);
    const endsAt = new Date(`${form.endDate}T${form.endTime || "00:00"}`);
    if (endsAt <= startsAt) return setFormError("The window must end after it starts.");

    setSaving(true);
    setFormError(null);
    try {
      const r = await fetch(editId ? `${BACKEND}/api/maintenance/${editId}` : `${BACKEND}/api/maintenance/schedule`, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "x-user": actor },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          startKm,
          endKm,
          direction: form.direction,
          laneClosure: form.laneClosure,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        }),
      });
      const json = await r.json();
      if (!json.success) throw new Error(json.message ?? "Save failed");
      const wasEdit = editId !== null;
      await refresh();
      setFormOpen(false);
      setForm(emptyForm);
      setEditId(null);
      toast.success(
        wasEdit ? `Updated "${form.title.trim()}".` : `Scheduled "${form.title.trim()}".`,
        `${form.direction} · Km ${startKm}–${endKm} · ${form.laneClosure}`,
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

  /* In the order a driver meets them: northbound up the km posts, southbound
     down. The end list starts after the start exit, so an end the traffic
     reaches BEFORE the start cannot be picked. */
  const inTravelOrder = form.direction === "NB" ? byKm : [...byKm].reverse();
  const exitOption = (x: NlexExit) => ({ label: `${displayExitName(x.exit_name)} · Km ${x.km}`, value: String(x.km) });
  const startOptions = inTravelOrder.map(exitOption);
  const startKmNum = form.startKm === "" ? null : Number(form.startKm);
  const endOptions = inTravelOrder
    .filter((x) => startKmNum == null || (form.direction === "NB" ? x.km >= startKmNum : x.km <= startKmNum))
    .map(exitOption);

  const pickStart = (v: string) =>
    setForm((f) => {
      const s = Number(v);
      const e = f.endKm === "" ? null : Number(f.endKm);
      // An end now behind the start, in travel order, is cleared rather than
      // left contradicting it.
      const endStillAhead = e == null || (f.direction === "NB" ? e >= s : e <= s);
      return { ...f, startKm: v, endKm: endStillAhead ? f.endKm : "" };
    });

  /* Switching direction reverses the stretch: the end becomes where traffic
     now arrives first. Picked Meycauayan -> Bocaue northbound, toggle to SB and
     it reads Bocaue -> Meycauayan. */
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
      <PageHeader icon={Wrench} title="Maintenance Overview" subtitle="Scheduled roadworks, closures, and asset upkeep across NLEX" />

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

        <label className="ms-search-bar nc-ops-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search schedules</span>
          <input type="text" placeholder="Search schedules…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </label>
      </div>

      {/* Row B — KPI tiles */}
      <div className={`${styles.kpiRow} ds-rise`}>
        <article className={styles.kpiTile}>
          <h3>In Progress</h3>
          <div className={styles.kpiValue}>{loading ? "…" : counts.in_progress}</div>
          <p className={styles.kpiHint}>{kmUnderWork > 0 ? `${kmUnderWork.toFixed(1)} km under work right now` : "no active roadwork"}</p>
        </article>
        <article className={styles.kpiTile}>
          <h3>Scheduled</h3>
          <div className={styles.kpiValue}>{loading ? "…" : counts.scheduled}</div>
          <p className={styles.kpiHint}>
            {nextWindow
              ? `next: ${new Date(nextWindow.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${kmRange(nextWindow)}`
              : "nothing upcoming"}
          </p>
        </article>
        <article className={styles.kpiTile}>
          <h3>Completed</h3>
          <div className={styles.kpiValue}>{loading ? "…" : counts.completed}</div>
          <p className={styles.kpiHint}>all time</p>
        </article>
        <article className={styles.kpiTile}>
          <h3>Cancelled</h3>
          <div className={styles.kpiValue}>{loading ? "…" : counts.cancelled}</div>
          <p className={styles.kpiHint}>all time</p>
        </article>
      </div>

      {/* Row C — schedule list */}
      <article className={`${styles.chartCard} ${styles.chart1} nc-ops-card`}>
        <div className={`${styles.chartHead} nc-ops-card-head`}>
          <div className={styles.headText}>
            <h3>Maintenance Schedules</h3>
            <p className={styles.subtitle}>
              {loading ? "Loading…" : `${visible.length} of ${schedules.length} shown`}
            </p>
          </div>
          <button className="btn-primary nc-ops-new" onClick={() => { setFormError(null); setEditId(null); setForm(emptyForm); setFormOpen(true); }}>
            <Plus size={15} aria-hidden="true" /> Schedule Maintenance
          </button>
        </div>

        {error ? (
          <StateNote kind="offline">Live data unavailable — is the backend running on port 4000?</StateNote>
        ) : !loading && schedules.length === 0 ? (
          <StateNote kind="nodata">No maintenance scheduled yet — create the first one.</StateNote>
        ) : !loading && visible.length === 0 ? (
          <StateNote kind="nodata">Nothing matches the current filters.</StateNote>
        ) : (
          <div className={`${styles.plazaTableWrap} nc-ops-table-wrap`}>
            <table className={`${styles.plazaTable} nc-ops-table`}>
              <thead>
                <tr>
                  <SortableTh label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                  <SortableTh label="Work" sortKey="title" sort={sort} onToggle={toggle} />
                  <SortableTh label="Location" sortKey="location" sort={sort} onToggle={toggle} />
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
                    <td className="nc-ops-td-loc" data-label="Location">
                      <span className="nc-ops-num">{kmRange(s)}</span> · {s.direction}
                      <span className="nc-ops-sub">{s.lane_closure}</span>
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
                ["Created", new Date(detail.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })],
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
                <h3>Cancel this schedule?</h3>
                <p className="nc-ops-num">{cancelTarget.title} · {kmRange(cancelTarget)}</p>
              </div>
              <button className={styles.detailClose} onClick={() => setCancelTarget(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="nc-ops-modal-body">
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
                {mutating ? "Cancelling…" : "Cancel schedule"}
              </button>
              <button className="btn-muted" disabled={mutating} onClick={() => setCancelTarget(null)}>
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
                  exit lists below follow it. */}
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
                  <label>Start exit <span className="ms-req">*</span></label>
                  <Select
                    value={form.startKm}
                    placeholder={form.direction === "NB" ? "Where it begins, going north…" : "Where it begins, going south…"}
                    options={startOptions}
                    onChange={pickStart}
                  />
                </div>
                <div className="ms-input-group">
                  <label htmlFor="ms-start-km">Start Km</label>
                  <input
                    id="ms-start-km"
                    type="number" step={0.01} min={KM_MIN} max={KM_MAX} className="ms-input nc-ops-num"
                    placeholder="auto" value={form.startKm}
                    title="Filled from the exit. Adjust only if the works start between two exits."
                    onChange={(e) => set("startKm", e.target.value)}
                  />
                </div>
                <div className="ms-input-group">
                  <label>End exit <span className="ms-req">*</span></label>
                  <Select
                    value={form.endKm}
                    placeholder={form.startKm === "" ? "Pick the start first…" : "Where it ends…"}
                    options={endOptions}
                    onChange={(v) => set("endKm", v)}
                  />
                </div>
                <div className="ms-input-group">
                  <label htmlFor="ms-end-km">End Km</label>
                  <input
                    id="ms-end-km"
                    type="number" step={0.01} min={KM_MIN} max={KM_MAX} className="ms-input nc-ops-num"
                    placeholder="auto" value={form.endKm}
                    title="Filled from the exit. Adjust only if the works end between two exits."
                    onChange={(e) => set("endKm", e.target.value)}
                  />
                </div>
              </div>

              {segmentNote && (
                <p className="nc-ops-segment-note">
                  <MapPin size={13} aria-hidden="true" /> {DIRECTION_LABEL[form.direction]} · {segmentNote}
                </p>
              )}

              <div className="ms-form-row">
                <div className="ms-input-group">
                  <label>Lane closure</label>
                  <Select
                    value={form.laneClosure}
                    placeholder="Select lane closure"
                    options={LANE_CLOSURES.map((l) => ({ label: l, value: l }))}
                    onChange={(v) => set("laneClosure", v as (typeof LANE_CLOSURES)[number])}
                  />
                </div>
              </div>

              <p className="ms-section-label">Window</p>
              <div className="nc-ops-grid-win">
                <div className="ms-input-group">
                  <label htmlFor="ms-start-date">Start date <span className="ms-req">*</span></label>
                  <input id="ms-start-date" type="date" className="ms-input" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
                </div>
                <div className="ms-input-group">
                  <label htmlFor="ms-start-time">Start time</label>
                  <input id="ms-start-time" type="time" className="ms-input" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
                </div>
                <div className="ms-input-group">
                  <label htmlFor="ms-end-date">End date <span className="ms-req">*</span></label>
                  <input id="ms-end-date" type="date" min={form.startDate || undefined} className="ms-input" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
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

              {formError && <p className="nc-ops-error">{formError}</p>}
            </div>

            <div className="nc-ops-actions is-form">
              <button className="nc-pill" disabled={saving} onClick={submitForm}>
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
