"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Brain, CalendarClock, CheckCircle2, Database, ScanSearch, UploadCloud } from "lucide-react";
import PageHeader from "../../../components/dashboard/PageHeader";
import StateNote from "../../../components/stage/StateNote";
import { apiFetch, BACKEND } from "../../../lib/api";


type PipelineGateLog = {
  gate: string;
  passed: boolean;
  details: string;
};

type EtlResult = {
  upload_id: string | null;
  dry_run: boolean;
  filename: string;
  file_format: string;
  source_type: string;
  dataset_type: string;
  classification: {
    type: string;
    confidence: number;
    reason: string;
  };
  destination: string | null;
  published: { table: string; rows: number }[];
  comparison?: Comparison | null;
  day_screen?: DayScreen | null;
  profile?: TollProfile | null;
  can_undo?: boolean;
  stats: {
    total_rows_parsed: number;
    rows_accepted: number;
    rows_rejected: number;
    rows_inserted: number;
    rows_updated: number;
    rows_already_loaded: number;
    rows_failed: number;
    rows_skipped_transform: number;
  };
  pipeline_gates: PipelineGateLog[];
  rejected_sample: { row: Record<string, unknown>; reason: string }[];
  errors: string[];
  warnings: string[];
  duration_ms: number;
};

type UploadModule = "traffic" | "incidents" | "emissions" | "not_accepted";

type UploadFormat = {
  type: string;
  label: string;
  module: UploadModule;
  columns: string[];
  needs: "all" | number;
  lands: string[];
  shows: string;
  reupload: string;
  recordEnd: boolean;
  accepted: boolean;
};

type UploadRecord = {
  id: string;
  filename: string;
  dataset_type: string | null;
  status: string;
  processed_records: number;
  /** available | blocked | undone | expired, or null for an upload made before undo existed. */
  undo?: string | null;
  undo_blocked_by?: string | null;
  uploaded_at: string;
};

/** One model group in a weekly batch, as weekly_retrain.py records it in gold.ml_batch_runs. */
type RetrainGroup = {
  key: string;
  title: string;
  status: string;
  changes: string[];
  reason: string;
  comparisons: string[];
  checks: string[];
};

type RetrainRun = {
  id: number;
  started_at: string;
  finished_at: string | null;
  trigger: string;
  status: string;
  summary: string | null;
  groups: RetrainGroup[];
};

type Retraining = {
  schedule: { day: string; time: string; timezone: string; next: string };
  runs: RetrainRun[];
};

/** The file against what is already loaded for the same keys (Back-End/src/etl/compare.ts). */
type Comparison =
  | {
      kind: "toll";
      plazaDays: number;
      replaced: number;
      loadedTotal: number;
      fileTotal: number;
      threshold: number;
      flagged: number;
      examples: { date: string; plaza: string; loaded: number; file: number }[];
    }
  | { kind: "records"; matched: number; changed: number };

/** Every day of a toll file, and whether it was loaded (Back-End/src/etl/day-screen.ts). */
type ScreenedDay = { date: string; status: "loaded" | "held" | "missing" | "outside"; trips: number; hours: number; plazas: number; reason?: string };
type DayScreen = {
  window: { from?: string; to?: string } | null;
  completeness: boolean;
  days: ScreenedDay[];
  loaded: number;
  held: number;
  missing: number;
  outside: number;
  rowsLeftOut: number;
  thresholds: { minShareOfWeekday: number; minShareOfPlazas: number };
};

/** A toll file against the same period a year earlier (Back-End/src/etl/compare.ts profileToll). */
type TollProfile = {
  months: { month: string; days: number; perDay: number; priorDays: number; priorPerDay: number | null; ratio: number | null }[];
  plazas: { plaza: string; perDay: number; priorPerDay: number | null; ratio: number | null; flagged: boolean }[];
  classShare: { file: number[]; prior: number[] | null };
  threshold: number;
  minVolume: number;
  flagged: number;
};

/** What undoing an upload removes and puts back (Back-End/src/etl/undo.ts). */
type UndoResult = {
  uploadId: number;
  dryRun: boolean;
  done: boolean;
  tables: { table: string; removed: number; restored: number }[];
  removed: number;
  restored: number;
  error?: string;
};

type Mode = "check" | "load";

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-US");
const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

/** Green: new models live. Amber: something to look at, last week's models kept. Red: the batch could not put things back. */
function retrainPill(status: string): string {
  if (status === "retrained") return "green";
  if (status === "running") return "blue";
  if (status === "failed" || status === "restore failed") return "red";
  if (status === "kept previous" || status === "cannot run here" || status === "needs attention" || status === "interrupted") return "amber";
  return "";
}

/** Nothing answered at BACKEND: the server is not running, or not on this address. */
class BackendDown extends Error {}

/** A backend endpoint's `data`. Throws BackendDown when nothing answers, or the endpoint's own error otherwise. */
async function getData<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(`${BACKEND}${path}`);
  } catch {
    throw new BackendDown();
  }
  const body = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    throw new Error(body?.message ? `${body.message}${response.status === 401 ? " — sign in again" : ""}` : `not authorized (${response.status})`);
  }
  if (!body?.success) {
    // A 404 here means a backend started before this endpoint existed.
    throw new Error(body?.error ?? body?.message ?? `${path} answered ${response.status}${response.status === 404 ? " (restart the backend to pick up this page's endpoints)" : ""}`);
  }
  return body.data as T;
}

const day = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

/** The upload layouts, grouped by the dashboard area they feed. */
const UPLOAD_MODULES: { key: UploadModule; title: string }[] = [
  { key: "traffic", title: "Traffic" },
  { key: "incidents", title: "Incidents" },
  { key: "emissions", title: "Emissions & air quality" },
  { key: "not_accepted", title: "Not accepted" },
];

const pct = (from: number, to: number) => (from ? `${to >= from ? "+" : ""}${(((to - from) / from) * 100).toFixed(1)}%` : "—");

/** "Is this the right file?": the upload against what is already loaded for the same keys. */
function ComparisonPanel({ c, check }: { c: Comparison; check: boolean }) {
  if (c.kind === "records") {
    return (
      <section className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>Compared with what&apos;s loaded</h3>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          {c.matched === 0
            ? "None of these records is loaded yet."
            : `${n(c.matched)} of these records are already loaded: ${n(c.changed)} ${check ? "would change" : "changed"}, ${n(c.matched - c.changed)} identical.`}
        </p>
      </section>
    );
  }
  return (
    <section className="panel" style={{ marginTop: 16, borderColor: c.flagged ? "var(--color-warning-border)" : undefined }}>
      <h3 style={{ margin: 0 }}>Compared with what&apos;s loaded</h3>
      <p className="muted" style={{ margin: "6px 0 0" }}>
        {c.replaced === 0
          ? `All ${n(c.plazaDays)} plaza-days are new: nothing already loaded ${check ? "would be" : "was"} replaced.`
          : `${n(c.replaced)} of ${n(c.plazaDays)} plaza-days are already loaded. Their total ${check ? "would go" : "went"} from ${n(c.loadedTotal)} to ${n(c.fileTotal)} (${pct(c.loadedTotal, c.fileTotal)}).`}
      </p>
      {c.flagged > 0 && (
        <>
          <p style={{ margin: "10px 0 6px", color: "var(--color-warning)", fontWeight: 600 }}>
            {n(c.flagged)} plaza-{c.flagged === 1 ? "day changes" : "days change"} by more than {Math.round(c.threshold * 100)}%.{" "}
            {check ? "Make sure this is the right file before loading it." : "If this was the wrong file, undo it in Recent uploads."}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>PLAZA</th>
                  <th style={{ textAlign: "right" }}>LOADED</th>
                  <th style={{ textAlign: "right" }}>IN THE FILE</th>
                  <th style={{ textAlign: "right" }}>CHANGE</th>
                </tr>
              </thead>
              <tbody>
                {c.examples.map((x) => (
                  <tr key={`${x.date}-${x.plaza}`}>
                    <td>{day(x.date)}</td>
                    <td>{x.plaza}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n(x.loaded)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n(x.file)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct(x.loaded, x.file)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.flagged > c.examples.length && (
            <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.8rem" }}>
              The {c.examples.length} largest changes of {n(c.flagged)}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

const DAY_STATUS: Record<ScreenedDay["status"], { label: string; color: string }> = {
  loaded: { label: "Loaded", color: "var(--color-success)" },
  held: { label: "Held back: incomplete", color: "var(--color-warning)" },
  missing: { label: "Not in the file", color: "var(--color-danger)" },
  outside: { label: "Outside the dates chosen", color: "var(--border-default)" },
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Every day of a toll file, a month to a row: loaded, held back as incomplete, missing, or outside the dates chosen. */
function CoveragePanel({ d, check }: { d: DayScreen; check: boolean }) {
  const byMonth = new Map<string, ScreenedDay[]>();
  for (const x of d.days) {
    const k = x.date.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(x);
  }
  const notes = d.days.filter((x) => x.status === "held" || x.status === "missing");
  return (
    <section className="panel" style={{ marginTop: 16, borderColor: d.held || d.missing ? "var(--color-warning-border)" : undefined }}>
      <h3 style={{ margin: 0 }}>Days in this file</h3>
      <p className="muted" style={{ margin: "6px 0 10px" }}>
        {n(d.loaded)} {d.loaded === 1 ? "day" : "days"} {check ? "would load" : "loaded"}
        {d.held > 0 && <> · <span style={{ color: "var(--color-warning)", fontWeight: 600 }}>{n(d.held)} held back as incomplete</span></>}
        {d.missing > 0 && <> · <span style={{ color: "var(--color-danger)", fontWeight: 600 }}>{n(d.missing)} not in the file</span></>}
        {d.outside > 0 && <> · {n(d.outside)} outside the dates chosen</>}
        {d.window && <> · dates chosen: {d.window.from ? day(d.window.from) : "file start"} to {d.window.to ? day(d.window.to) : "file end"}</>}
      </p>
      {d.completeness && (
        <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.82rem" }}>
          This file replaces each day it holds whole, so a day only loads if it is complete: all 24 hours (apart from toll-holiday
          hours), at least {Math.round(d.thresholds.minShareOfWeekday * 100)}% of a usual day for its weekday, and at least{" "}
          {Math.round(d.thresholds.minShareOfPlazas * 100)}% of the usual plazas. Real low days, such as typhoons and Good Friday, stay above that.
        </p>
      )}
      <div style={{ display: "grid", gap: 6 }}>
        {[...byMonth.entries()].map(([ym, list]) => (
          <div key={ym} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 72, flex: "none", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{monthLabel(ym)}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {list.map((x) => (
                <span
                  key={x.date}
                  title={`${day(x.date)}: ${DAY_STATUS[x.status].label}${x.status !== "missing" ? ` · ${n(x.trips)} trips, ${x.hours} h, ${x.plazas} plazas` : ""}${x.reason ? ` · ${x.reason}` : ""}`}
                  aria-label={`${x.date} ${DAY_STATUS[x.status].label}`}
                  style={{ width: 13, height: 13, borderRadius: 3, background: DAY_STATUS[x.status].color, display: "inline-block" }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.78rem", display: "flex", gap: 14, flexWrap: "wrap" }}>
        {(Object.keys(DAY_STATUS) as ScreenedDay["status"][]).map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: DAY_STATUS[k].color, display: "inline-block" }} />
            {DAY_STATUS[k].label}
          </span>
        ))}
      </p>
      {notes.length > 0 && (
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>DATE</th>
                <th>STATUS</th>
                <th>WHY</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((x) => (
                <tr key={x.date}>
                  <td style={{ whiteSpace: "nowrap" }}>{day(x.date)}</td>
                  <td style={{ whiteSpace: "nowrap", color: DAY_STATUS[x.status].color, fontWeight: 600 }}>{DAY_STATUS[x.status].label}</td>
                  <td style={{ whiteSpace: "normal" }}>{x.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.8rem" }}>
            These days {check ? "would be" : "were"} left alone in the warehouse. Ask the source for them again rather than load part of a day.
          </p>
        </div>
      )}
    </section>
  );
}

/** A toll file against the same period a year earlier: is it plausible? */
function ProfilePanel({ p }: { p: TollProfile }) {
  const [all, setAll] = useState(false);
  const change = (r: number | null) => (r == null ? "—" : `${r >= 1 ? "+" : ""}${((r - 1) * 100).toFixed(1)}%`);
  const shown = all ? p.plazas : p.plazas.filter((x) => x.flagged);
  const num = { textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const };
  return (
    <section className="panel" style={{ marginTop: 16, borderColor: p.flagged ? "var(--color-warning-border)" : undefined }}>
      <h3 style={{ margin: 0 }}>Compared with the same period last year</h3>
      <p className="muted" style={{ margin: "6px 0 10px" }}>
        The real yardstick for a new period: the same months a year earlier, as already loaded.
        {p.classShare.prior && (
          <> Class mix {p.classShare.file.map((v) => `${v.toFixed(1)}%`).join(" / ")}, a year earlier {p.classShare.prior.map((v) => `${v.toFixed(1)}%`).join(" / ")}.</>
        )}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>MONTH</th>
              <th style={num}>DAYS</th>
              <th style={num}>TRIPS / DAY</th>
              <th style={num}>A YEAR EARLIER</th>
              <th style={num}>CHANGE</th>
            </tr>
          </thead>
          <tbody>
            {p.months.map((m) => (
              <tr key={m.month}>
                <td>{monthLabel(m.month)}</td>
                <td style={num}>{m.days}</td>
                <td style={num}>{n(m.perDay)}</td>
                <td style={num}>{m.priorPerDay == null ? "—" : n(m.priorPerDay)}</td>
                <td style={{ ...num, color: m.ratio != null && Math.abs(m.ratio - 1) > p.threshold ? "var(--color-warning)" : undefined }}>{change(m.ratio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "12px 0 6px", fontWeight: 600, color: p.flagged ? "var(--color-warning)" : "var(--text-primary)" }}>
        {p.flagged
          ? `${n(p.flagged)} ${p.flagged === 1 ? "plaza moves" : "plazas move"} more than ${Math.round(p.threshold * 100)}% from a year earlier.`
          : `No plaza moves more than ${Math.round(p.threshold * 100)}% from a year earlier.`}{" "}
        <button type="button" className="btn-muted" style={{ marginLeft: 6, padding: "2px 10px" }} onClick={() => setAll(!all)}>
          {all ? "Show only the flagged" : `Show all ${p.plazas.length} plazas`}
        </button>
      </p>
      {shown.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>PLAZA</th>
                <th style={num}>TRIPS / DAY</th>
                <th style={num}>A YEAR EARLIER</th>
                <th style={num}>CHANGE</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.plaza}>
                  <td>{x.plaza}</td>
                  <td style={num}>{n(x.perDay)}</td>
                  <td style={num}>{x.priorPerDay == null ? "—" : n(x.priorPerDay)}</td>
                  <td style={{ ...num, color: x.flagged ? "var(--color-warning)" : undefined, fontWeight: x.flagged ? 600 : undefined }}>{change(x.ratio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.8rem" }}>
        Flagged when a plaza carrying at least {n(p.minVolume)} trips a day moves more than {Math.round(p.threshold * 100)}%. A flag asks for a
        look, not a rejection: a new interchange or a lasting shift moves a plaza too.
      </p>
    </section>
  );
}

/** A rejected row, shortened to its first few filled fields so the table stays readable. */
function rowPreview(row: Record<string, unknown>): string {
  return Object.entries(row)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
    .join(" · ");
}

export default function DataManagementPage() {
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState<Mode | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EtlResult | null>(null);
  const [success, setSuccess] = useState<boolean | null>(null);
  // Optional: load only these dates (both toll layouts and every dated record upload honour it).
  const [win, setWin] = useState<{ from: string; to: string }>({ from: "", to: "" });
  // A picked file waits here, unsent, until the operator chooses what to do with it. Loading writes to the warehouse
  // and this page has no undo, so choosing a file must not be the same act as sending it.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // The file last sent, so a passing check can be loaded without picking it again.
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [formats, setFormats] = useState<{ recordEnd: string; formats: UploadFormat[] } | null>(null);
  const [history, setHistory] = useState<UploadRecord[] | null>(null);
  const [retraining, setRetraining] = useState<Retraining | null>(null);
  // A request that failed must not look like an empty answer: "No uploads recorded yet" or an endless "Loading…"
  // when the backend is simply not running reads as if the data were gone.
  const [backendDown, setBackendDown] = useState(false);
  const [formatsError, setFormatsError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [retrainingError, setRetrainingError] = useState("");

  const failed = useCallback((setMessage: (m: string) => void) => (e: unknown) => {
    if (e instanceof BackendDown) setBackendDown(true);
    else setMessage(e instanceof Error ? e.message : String(e));
  }, []);

  const loadHistory = useCallback(() => {
    getData<UploadRecord[]>("/api/upload/history?limit=12")
      .then((d) => { setHistory(d); setHistoryError(""); })
      .catch(failed(setHistoryError));
  }, [failed]);

  const loadAll = useCallback(() => {
    setBackendDown(false);
    setFormatsError("");
    setRetrainingError("");
    getData<{ recordEnd: string; formats: UploadFormat[] }>("/api/upload/formats")
      .then(setFormats)
      .catch(failed(setFormatsError));
    getData<Retraining>("/api/upload/retraining?limit=6")
      .then(setRetraining)
      .catch(failed(setRetrainingError));
    loadHistory();
  }, [failed, loadHistory]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Undo: the upload being undone, what the undo would change (a rolled-back run), and how it went.
  const [undoTarget, setUndoTarget] = useState<UploadRecord | null>(null);
  const [undoPreview, setUndoPreview] = useState<UndoResult | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoNote, setUndoNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function postUndo(id: string, check: boolean): Promise<UndoResult> {
    let response: Response;
    try {
      response = await apiFetch(`${BACKEND}/api/upload/${id}/undo${check ? "?mode=check" : ""}`, { method: "POST" });
    } catch {
      setBackendDown(true);
      throw new Error(`The backend at ${BACKEND} is not answering.`);
    }
    const body = await response.json().catch(() => null);
    if (!body?.data) throw new Error(body?.error ?? `Undo answered ${response.status}`);
    return { ...body.data, error: body.data.error ?? body.error } as UndoResult;
  }

  async function startUndo(u: UploadRecord) {
    setUndoNote(null);
    setUndoTarget(u);
    setUndoPreview(null);
    setUndoBusy(true);
    try {
      setUndoPreview(await postUndo(u.id, true));
    } catch (e) {
      setUndoPreview({ uploadId: Number(u.id), dryRun: true, done: false, tables: [], removed: 0, restored: 0, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setUndoBusy(false);
    }
  }

  async function confirmUndo() {
    if (!undoTarget) return;
    const id = undoTarget.id;
    setUndoBusy(true);
    try {
      const r = await postUndo(id, false);
      const main = r.tables[0];
      setUndoNote(r.done
        ? { ok: true, text: `Upload #${id} undone: ${n(main?.removed ?? r.removed)} rows taken out, ${n(main?.restored ?? r.restored)} put back.${r.error ? ` ${r.error}` : ""}` }
        : { ok: false, text: r.error ?? `Upload #${id} was not undone.` });
    } catch (e) {
      setUndoNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setUndoBusy(false);
      setUndoTarget(null);
      setUndoPreview(null);
      loadHistory();
    }
  }

  const notLoaded = (message: string) => (backendDown ? "Not loaded: the backend is not answering (see above)." : message);

  useEffect(() => {
    if (!pendingFile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingFile(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingFile]);

  // A year of hourly toll data takes a minute or two; a counter says it is still working.
  useEffect(() => {
    if (!loading) return;
    const t0 = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setPendingFile(file);
    // Reset the input so the same file can be picked again after cancelling; the File itself is kept in state.
    event.target.value = "";
  }

  async function uploadFile(file: File, mode: Mode) {
    setFileName(file.name);
    setLastFile(file);
    setError("");
    setResult(null);
    setSuccess(null);
    setLoading(mode);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // apiFetch attaches the session token and, if it has expired, renews it
      // and replays the upload once. The endpoint now requires the data-analyst
      // role (see Back-End/src/routes/upload.routes.ts), so an unauthenticated
      // post would otherwise be refused here.
      const qs = new URLSearchParams();
      if (mode === "check") qs.set("mode", "check");
      if (win.from) qs.set("from", win.from);
      if (win.to) qs.set("to", win.to);
      const response = await apiFetch(`${BACKEND}/api/upload/file${qs.toString() ? `?${qs}` : ""}`, {
        method: "POST",
        body: formData, // fetch will automatically set the correct multipart boundary headers
      });

      const payload = await response.json();

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          payload.message ||
            "Your session is no longer valid for uploading. Sign in again as a Data Analyst.",
        );
      }

      if (!response.ok && !payload.data) {
        throw new Error(payload.error || "An error occurred during upload.");
      }

      setSuccess(payload.success);
      if (payload.data) {
        setResult(payload.data as EtlResult);
      } else {
        setError(payload.error || "Upload failed without additional details.");
      }
    } catch (err) {
      setSuccess(false);
      // fetch rejects with a TypeError ("Failed to fetch") only when nothing answered at all.
      if (err instanceof TypeError) {
        setBackendDown(true);
        setError(`The backend at ${BACKEND} is not answering, so the file was not sent. Start it with npm run dev in the Back-End folder, then try again.`);
      } else {
        setError(err instanceof Error ? err.message : "Unable to process the uploaded file.");
      }
    } finally {
      setLoading(null);
      if (mode === "load") loadHistory();
    }
  }

  function confirmUpload(mode: Mode) {
    if (!pendingFile) return;
    const file = pendingFile;
    setPendingFile(null);
    void uploadFile(file, mode);
  }

  /** The format a result matched, for its plain-language name. Two layouts share "emissions"; the table tells them apart. */
  const matched = useMemo(() => {
    if (!result || !formats) return null;
    const same = formats.formats.filter((f) => f.type === result.dataset_type);
    return same.find((f) => result.destination && f.lands[0] === result.destination) ?? same[0] ?? null;
  }, [result, formats]);

  const s = result?.stats;
  const nextRetrain = retraining ? when(retraining.schedule.next) : null;
  const lastRetrain = retraining?.runs[0] ?? null;

  return (
    <section className="ds-content ds-long dm-page">
      <PageHeader
        icon={Brain}
        title="Data Management"
        subtitle="Upload datasets — the ETL pipeline classifies, validates, and loads them into the AWS database"
        actions={backendDown ? <span className="pill red">Backend offline</span> : <span className="pill blue">ETL Pipeline Ready</span>}
      />

      {backendDown && (
        <section className="dm-offline">
          <StateNote kind="offline" role="alert" title="The backend is not answering">
            <p>
              Nothing replied at <code>{BACKEND}</code>, so the upload layouts, the upload history and the retraining status cannot load,
              and an upload would not go through. Nothing has been deleted: they are in the database. Start the backend with{" "}
              <code>npm run dev</code> in the <code>Back-End</code> folder, then try again.
            </p>
            <button type="button" className="btn-muted" onClick={loadAll}>Try again</button>
          </StateNote>
        </section>
      )}

      <article className="upload-zone">
        {/* Was a literal "?" - a placeholder glyph that shipped. The drop
            target's only picture said "I do not know what this is". */}
        <div className="upload-icon"><UploadCloud size={30} strokeWidth={2} aria-hidden="true" /></div>
        <h2>Upload Batch Dataset</h2>
        <p>
          Choose a CSV, JSON or Excel file. The pipeline recognises its layout, validates every row, and loads it where the dashboards read it.
          Check a file first to see exactly what a load would do.
        </p>
        {/* The view's one white pill. The input is visually hidden rather than display:none, so Tab reaches it
            and Space/Enter open the picker; the label shows its focus ring. Click-to-pick only: there is no drop handling. */}
        <label className="nc-pill dm-pick" style={{ cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? (loading === "check" ? "Checking..." : "Loading...") : "Select File"}
          <input
            type="file"
            accept=".csv,.tsv,.json,.xlsx,.xls"
            onChange={handleFileChange}
            className="sr-only"
            disabled={Boolean(loading)}
          />
        </label>
        <small>{fileName || "No file selected yet"}</small>
        {loading && (
          <small className="dm-progress">
            {loading === "check" ? "Checking" : "Loading"} {fileName}: {elapsed} s. A year of hourly toll data takes one to two minutes.
          </small>
        )}
      </article>

      {pendingFile && (
        <div
          className="ds-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            // Only a click on the backdrop itself cancels; one that started inside the dialog does not.
            if (e.target === e.currentTarget) setPendingFile(null);
          }}
        >
          <div className="ds-modal" role="dialog" aria-modal="true" aria-labelledby="upload-confirm-title" style={{ width: "min(500px, 100%)" }}>
            <header className="ds-modal-head">
              <h2 id="upload-confirm-title">What should happen to this file?</h2>
            </header>
            <div className="ds-modal-body">
              <p className="ds-modal-note" style={{ fontSize: "0.86rem", color: "var(--text-primary)" }}>
                <strong style={{ wordBreak: "break-all" }}>{pendingFile.name}</strong>
                <br />
                {formatSize(pendingFile.size)}
              </p>
              <p className="ds-modal-note">
                <b>Check only</b> runs every step against the warehouse, then undoes it: you see what would load, what would be skipped
                and why, and nothing is written. <b>Upload &amp; load</b> writes it. A load can be undone from Recent uploads, and
                uploading the same file again never doubles it.
              </p>
              <fieldset style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 12px", margin: "10px 0 0" }}>
                <legend style={{ fontSize: "0.8rem", padding: "0 4px", color: "var(--text-secondary)" }}>Load only these dates (optional)</legend>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <label style={{ fontSize: "0.82rem", display: "inline-flex", gap: 6, alignItems: "center" }}>
                    From
                    <input type="date" value={win.from} max={win.to || undefined} onChange={(e) => setWin({ ...win, from: e.target.value })} />
                  </label>
                  <label style={{ fontSize: "0.82rem", display: "inline-flex", gap: 6, alignItems: "center" }}>
                    To
                    <input type="date" value={win.to} min={win.from || undefined} onChange={(e) => setWin({ ...win, to: e.target.value })} />
                  </label>
                  {(win.from || win.to) && (
                    <button type="button" className="btn-muted" style={{ padding: "2px 10px" }} onClick={() => setWin({ from: "", to: "" })}>
                      Clear
                    </button>
                  )}
                </div>
                <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.78rem" }}>
                  Leave empty to load every day the file holds. Days outside are left out and reported.
                </p>
              </fieldset>
            </div>
            <footer className="ds-modal-foot">
              <button type="button" className="btn-muted" onClick={() => setPendingFile(null)}>
                Cancel
              </button>
              <button type="button" className="btn-muted" autoFocus onClick={() => confirmUpload("check")}>
                Check only
              </button>
              <button type="button" className="btn-primary" onClick={() => confirmUpload("load")}>
                Upload &amp; load
              </button>
            </footer>
          </div>
        </div>
      )}

      {undoTarget && (
        <div
          className="ds-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !undoBusy) setUndoTarget(null);
          }}
        >
          <div className="ds-modal" role="dialog" aria-modal="true" aria-labelledby="undo-title" style={{ width: "min(500px, 100%)" }}>
            <header className="ds-modal-head">
              <h2 id="undo-title">Undo upload #{undoTarget.id}?</h2>
            </header>
            <div className="ds-modal-body">
              <p className="ds-modal-note" style={{ color: "var(--text-primary)", wordBreak: "break-all" }}>
                <strong>{undoTarget.filename}</strong>
              </p>
              {undoBusy && !undoPreview ? (
                <p className="ds-modal-note">Working out what it would change…</p>
              ) : undoPreview?.error ? (
                <p className="ds-modal-note bad">{undoPreview.error}</p>
              ) : undoPreview ? (
                <p className="ds-modal-note">
                  This takes out the {n(undoPreview.tables[0]?.removed ?? undoPreview.removed)} rows this upload wrote and puts back
                  the {n(undoPreview.tables[0]?.restored ?? undoPreview.restored)} it replaced, everywhere they were published.
                  The data is then as it was before the upload.
                </p>
              ) : null}
            </div>
            <footer className="ds-modal-foot">
              <button type="button" className="btn-muted" disabled={undoBusy} onClick={() => setUndoTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={undoBusy || !undoPreview || Boolean(undoPreview.error)}
                onClick={() => void confirmUndo()}
              >
                {undoBusy && undoPreview ? "Undoing…" : "Undo upload"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {!result && !error && (
        <ol className="ds-steps" aria-label="What happens after you upload">
          <li>
            <span className="ds-step-icon"><ScanSearch size={18} aria-hidden="true" /></span>
            <b>Classify</b>
            <span>The file is matched against the layouts below by its columns. An unrecognised file is rejected here rather than half-loaded.</span>
          </li>
          <li>
            <span className="ds-step-icon"><CheckCircle2 size={18} aria-hidden="true" /></span>
            <b>Validate</b>
            <span>Each quality gate runs in turn: rows off the corridor, unreadable, or after the record&apos;s end are set aside with the reason.</span>
          </li>
          <li>
            <span className="ds-step-icon"><Database size={18} aria-hidden="true" /></span>
            <b>Load &amp; publish</b>
            <span>Rows are written, then published to the tables the dashboards read, in one transaction. Rows already loaded are skipped.</span>
          </li>
          <li>
            <span className="ds-step-icon"><CalendarClock size={18} aria-hidden="true" /></span>
            <b>Retrain weekly</b>
            <span>Loading does not retrain the models. Every Sunday night one batch retrains and re-tests the models whose data changed, and keeps the new ones only if they pass.</span>
          </li>
        </ol>
      )}

      {error && (
        <section className="dm-result-error">
          <StateNote kind="error" title="Pipeline Error">
            <p className="bad">{error}</p>
          </StateNote>
        </section>
      )}

      {result && s && (
        <>
          <section className="panel" style={{ marginTop: 16 }}>
            <h2>{result.dry_run ? "Check result — nothing was written" : success ? "Loaded" : "Not loaded"}</h2>
            <p className={success ? "ok" : "bad"}>{result.classification.reason}</p>
            {result.dataset_type === "unknown" ? (
              <p className="muted">This file does not match any layout the pipeline accepts. See &ldquo;What can I upload?&rdquo; below.</p>
            ) : (
              <p className="muted">
                Detected: <strong>{matched?.label ?? result.dataset_type}</strong> ({Math.round(result.classification.confidence * 100)}% of its columns)
                {result.destination && <> · {result.dry_run ? "would load into" : "loaded into"} <code>{result.destination}</code></>}
                {result.published.length > 0 && <> · then {result.published.map((p) => <span key={p.table}><code>{p.table}</code> ({n(p.rows)}) </span>)}</>}
                {matched?.shows && <> · shows on {matched.shows}</>}
              </p>
            )}
            {!result.dry_run && success && s.rows_inserted + s.rows_updated > 0 && (
              <p className="muted">
                The models pick these rows up in the weekly retrain{nextRetrain ? <>, next on <b>{nextRetrain}</b></> : " on Sunday night"}.
                {result.can_undo && " Wrong file? Undo it in Recent uploads below."}
              </p>
            )}
            {result.dry_run && success && lastFile && (
              <button type="button" className="btn-primary" style={{ marginTop: 8 }} disabled={Boolean(loading)} onClick={() => void uploadFile(lastFile, "load")}>
                Load it now
              </button>
            )}
          </section>

          {result.day_screen && <CoveragePanel d={result.day_screen} check={result.dry_run} />}
          {result.profile && <ProfilePanel p={result.profile} />}
          {result.comparison && <ComparisonPanel c={result.comparison} check={result.dry_run} />}

          <div className="mini-stats-grid" style={{ marginTop: 16 }}>
            <article className="mini-stat">
              <h3>Rows in the file</h3>
              <strong>{n(s.total_rows_parsed)}</strong>
              <p>{n(s.rows_accepted)} passed the gates · {n(s.rows_rejected)} set aside</p>
            </article>
            <article className="mini-stat">
              <h3>{result.dry_run ? "Would be written (AWS)" : "Written (AWS)"}</h3>
              <strong className="ok">{n(s.rows_inserted)}</strong>
              <p>
                {n(s.rows_updated)} updated · {n(s.rows_already_loaded)} already loaded
                {s.rows_failed > 0 && <span className="bad"> · {n(s.rows_failed)} refused</span>}
              </p>
            </article>
            <article className="mini-stat">
              <h3>Set aside</h3>
              <strong className={s.rows_rejected > 0 ? "bad" : undefined}>{n(s.rows_rejected)}</strong>
              <p>{(result.duration_ms / 1000).toFixed(1)} s · {result.file_format.toUpperCase()}</p>
            </article>
          </div>

          <div className="table-card" style={{ marginTop: 16 }}>
            <h3 style={{ padding: '16px 20px', margin: 0, borderBottom: '1px solid var(--border-default)' }}>ETL Validation Gates</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>GATE</th>
                    <th>STATUS</th>
                    <th>DETAILS</th>
                  </tr>
                </thead>
                <tbody>
                  {result.pipeline_gates.map((gate, index) => (
                    <tr key={index}>
                      <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{gate.gate}</td>
                      <td>
                        {gate.passed ? (
                          <span className="pill green">PASSED</span>
                        ) : (
                          <span className="pill red">FAILED</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "normal", minWidth: 320 }}>{gate.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.rejected_sample.length > 0 && (
            <div className="table-card" style={{ marginTop: 16 }}>
              <h3 style={{ padding: '16px 20px', margin: 0, borderBottom: '1px solid var(--border-default)' }}>
                Rows set aside (first {result.rejected_sample.length} of {n(s.rows_rejected)})
              </h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>WHY</th>
                      <th>ROW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rejected_sample.map((r, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: "normal", minWidth: 220 }}>{r.reason}</td>
                        <td className="dm-row-preview" style={{ whiteSpace: "normal" }}>{rowPreview(r.row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(result.errors.length > 0 || result.warnings.length > 0) && (
            <section className="panel" style={{ marginTop: 16 }}>
              {result.errors.length > 0 && (
                <>
                  <h3 className="bad">Pipeline Errors</h3>
                  <ul className="bad" style={{ paddingLeft: 20 }}>
                    {result.errors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                    {result.errors.length > 10 && <li>...and {result.errors.length - 10} more errors</li>}
                  </ul>
                </>
              )}
              {result.warnings.length > 0 && (
                <>
                  <h3 className="warn" style={{ marginTop: result.errors.length > 0 ? 16 : 0 }}>Notes</h3>
                  <ul style={{ color: 'var(--text-secondary)', paddingLeft: 20 }}>
                    {result.warnings.slice(0, 10).map((warn, i) => <li key={i}>{warn}</li>)}
                    {result.warnings.length > 10 && <li>...and {result.warnings.length - 10} more</li>}
                  </ul>
                </>
              )}
            </section>
          )}
        </>
      )}

      {!formats && (backendDown || formatsError) && (
        <section className="panel" style={{ marginTop: 16 }}>
          <b>What can I upload?</b> <span className="bad">— {notLoaded(`not loaded: ${formatsError}`)}</span>
        </section>
      )}

      {formats && (
        <details className="panel dm-formats" style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer" }}>
            What can I upload?{" "}
            <span className="muted">
              — {formats.formats.filter((f) => f.accepted).length} layouts; rows dated after {day(formats.recordEnd)} (the record&apos;s end) are set
              aside, except air-quality readings
            </span>
          </summary>
          <div className="dm-format-groups">
            {UPLOAD_MODULES.map((m) => {
              const list = formats.formats.filter((f) => f.module === m.key);
              if (list.length === 0) return null;
              return (
                <section key={m.key} className={`dm-format-group${list.length > 2 ? " is-wide" : ""}`} aria-label={m.title}>
                  <h4>{m.title}</h4>
                  <ul>
                    {list.map((f) => (
                      <li key={f.label} className={f.accepted ? undefined : "is-off"}>
                        <b>{f.label}</b>
                        <span>{f.accepted ? `Shows on ${f.shows}.` : f.shows}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </details>
      )}

      <div className="table-card" style={{ marginTop: 16 }}>
        <h3 style={{ padding: '16px 20px', margin: 0, borderBottom: '1px solid var(--border-default)' }}>Recent uploads</h3>
        {undoNote && (
          <p className={undoNote.ok ? "ok" : "bad"} style={{ padding: "10px 20px 0", margin: 0 }}>{undoNote.text}</p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>FILE</th>
                <th>LAYOUT</th>
                <th>STATUS</th>
                <th style={{ textAlign: "right" }}>ROWS WRITTEN</th>
                <th>WHEN</th>
                <th aria-label="Undo" />
              </tr>
            </thead>
            <tbody>
              {history === null ? (
                backendDown || historyError ? (
                  <tr><td colSpan={7} className="dm-state-cell"><StateNote kind="error" size={44}>{notLoaded(`Not loaded: ${historyError}`)}</StateNote></td></tr>
                ) : (
                  <tr><td colSpan={7} className="muted">Loading…</td></tr>
                )
              ) : history.length === 0 ? (
                <tr><td colSpan={7} className="dm-state-cell"><StateNote kind="nodata" size={44}>No uploads recorded yet. Checks are not recorded: they change nothing.</StateNote></td></tr>
              ) : (
                history.map((u) => (
                  <tr key={u.id}>
                    <td className="muted">{u.id}</td>
                    <td style={{ wordBreak: "break-all" }}>{u.filename}</td>
                    <td>{formats?.formats.find((f) => f.type === u.dataset_type)?.label ?? u.dataset_type ?? "—"}</td>
                    <td><span className={`pill ${u.status === "processed" ? "green" : u.status === "failed" ? "red" : "amber"}`}>{u.status}</span></td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n(u.processed_records)}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{when(u.uploaded_at)}</td>
                    <td style={{ textAlign: "right" }}>
                      {(u.undo === "available" || u.undo === "blocked") && (
                        <button
                          type="button"
                          className="btn-muted"
                          style={{ minHeight: 30, padding: "0 12px" }}
                          disabled={u.undo === "blocked" || Boolean(undoTarget)}
                          title={u.undo === "blocked" ? `Undo #${u.undo_blocked_by ?? "the later upload"} first: it changed the same data after this one` : "Put the data back as it was before this upload"}
                          onClick={() => void startUndo(u)}
                        >
                          Undo
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-card" style={{ marginTop: 16 }}>
        <h3 style={{ padding: '16px 20px', margin: 0, borderBottom: '1px solid var(--border-default)' }}>Weekly model retraining</h3>
        <p className="muted" style={{ padding: "12px 20px 0", margin: 0 }}>
          Uploads do not retrain the models. Every Sunday at 10:00 PM one batch retrains and re-tests each model group whose data
          changed since it was last trained. New models go live only if they pass the tests; otherwise last week&apos;s stay.
          {nextRetrain && <> Next batch: <b>{nextRetrain}</b>.</>}
        </p>
        {retraining === null ? (
          backendDown || retrainingError ? (
            <div className="dm-state-block"><StateNote kind="error" size={44}>{notLoaded(`Not loaded: ${retrainingError}`)}</StateNote></div>
          ) : (
            <p className="muted" style={{ padding: "8px 20px 16px", margin: 0 }}>Loading…</p>
          )
        ) : !lastRetrain ? (
          <div className="dm-state-block"><StateNote kind="nodata" size={44}>No batch has run yet.</StateNote></div>
        ) : (
          <>
            <p style={{ padding: "8px 20px 0", margin: 0 }}>
              Last batch #{lastRetrain.id} · {when(lastRetrain.started_at)}
              {lastRetrain.finished_at && <> to {clock(lastRetrain.finished_at)}</>} · {lastRetrain.trigger}{" "}
              <span className={`pill ${retrainPill(lastRetrain.status)}`}>{lastRetrain.status}</span>
              {lastRetrain.summary && <span className="muted"> · {lastRetrain.summary}</span>}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>MODEL GROUP</th>
                    <th>RESULT</th>
                    <th>DETAIL</th>
                  </tr>
                </thead>
                <tbody>
                  {lastRetrain.groups.map((g) => (
                    <tr key={g.key}>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>{g.title}</td>
                      <td><span className={`pill ${retrainPill(g.status)}`}>{g.status}</span></td>
                      <td style={{ whiteSpace: "normal", minWidth: 320 }}>
                        {g.reason}
                        {g.comparisons.map((c) => <div key={c} className="muted">{c}</div>)}
                        {g.status !== "unchanged" && g.changes.slice(0, 2).map((c) => <div key={c} className="muted">Data: {c}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {retraining.runs.length > 1 && (
              <p className="muted" style={{ padding: "8px 20px 16px", margin: 0 }}>
                Earlier:{" "}
                {retraining.runs.slice(1).map((r, i) => (
                  <span key={r.id}>{i > 0 && " · "}#{r.id} {when(r.started_at)} — {r.status}</span>
                ))}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
