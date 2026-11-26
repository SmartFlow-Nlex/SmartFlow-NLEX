"use client";

import { useEffect, useState } from "react";
import type { EChartsOption } from "echarts";
import { ChevronRight, Siren } from "lucide-react";
import DashboardChart from "./DashboardChart";
import { Shell, Empty, SourceBadge } from "./prescriptiveShell";
import { useThemeTokens } from "./useThemeTokens";
import { incidentHeatRamp } from "./IncidentHeatmaps";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

// Incident → Prescriptive: Clearance Response Protocol. A different question than the other two Prescriptive cards
// (where to place units; when to be on alert): once an incident is reported, when to escalate it. Data only since
// 2 Nov 2026: the rule is read off the measured Kaplan-Meier clearance curve (clearance-protocol.service.ts). The
// dispatch-count MILP it replaced rested on an assumed unit effect, costs, capacity, demand and response delay.

type SurvivalPoint = { minute: number; survival: number; atRisk: number };
type Chance = { p: number; lo: number; hi: number };

type ClearanceOk = {
  status: "ok";
  rule: { checkAtMinute: number; pastMinute: number; chance: Chance; openAtCheck: number; text: string };
  checkpoints: { label: "P25" | "P50" | "P80"; minute: number; stillOpen: number; openCount: number; medianRemainingMin: number | null; pastP95: Chance }[];
  survivalCurve: SurvivalPoint[];
  quantiles: { p50: number; p80: number; p95: number };
  kpi: { baselineMttr: number; rag: "green" | "amber" | "red"; targets: { greenMax: number; amberMax: number }; metricLabel: string; indicative: boolean };
  method: string[];
  scoringWindow: { from: string; to: string };
  sampleSize: number;
  censoredCount: number;
};
type ClearanceInsufficientData = { status: "insufficient_data"; sampleSize: number; scoringWindow: { from: string; to: string }; message: string };
type ClearanceResult = ClearanceOk | ClearanceInsufficientData;

const fmtMin = (m: number) => `${m.toFixed(0)} min`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/* Loading on every control change (19 Oct 2026, testers IN-15..IN-21: "not loading or reflecting changes"):
     - Retried, 3 s then 8 s apart, and cancellable: a cold backend answered the first request with a 503 or a
       dropped connection, and the panel used to sit on that error until a reload.
     - Changes are settled for DEBOUNCE_MS first, and a superseded request is aborted, not just ignored.
     - After SLOW_MS a note says a slow first read is still working.
     - Labels read `shown`, the filters the answer on screen was computed for, not the ones set now. */
const DEBOUNCE_MS = 250;
const SLOW_MS = 5000;
const RETRY_WAITS_MS = [3000, 8000];

function abortableWait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { window.clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

async function fetchClearance(url: string, signal: AbortSignal): Promise<ClearanceResult> {
  let last: unknown = null;
  for (let i = 0; i <= RETRY_WAITS_MS.length; i++) {
    try {
      const res = await fetch(url, { cache: "no-store", signal });
      // The body is read on errors too: the backend's 400/503 carry a message worth showing.
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) return json.data as ClearanceResult;
      // The 503 already starts "Clearance protocol unavailable:", which the error state prints itself.
      const msg = typeof json?.message === "string" ? json.message.replace(/^clearance protocol unavailable:\s*/i, "") : null;
      last = new Error(msg || `the server answered ${res.status}`);
      if (res.status >= 400 && res.status < 500) break; // a bad request will not get better by asking again
    } catch (e) {
      if (signal.aborted) throw e;
      // fetch's own TypeError ("Failed to fetch") means the backend never answered at all.
      last = e instanceof TypeError ? new Error("couldn't reach the SmartFlow server. It may be waking up — try again in a minute") : e;
    }
    if (i < RETRY_WAITS_MS.length) await abortableWait(RETRY_WAITS_MS[i], signal);
  }
  throw last instanceof Error ? last : new Error("no response from the server");
}

type ClearanceType = "accident" | "breakdown";
type Severity = "all" | "pdo" | "injury" | "fatal";
type Weather = "all" | "dry" | "wet";
/** The filters an answer on screen was computed for -- not necessarily the ones set now. */
type Shown = { type: ClearanceType; severity: Severity; weather: Weather };
const SEVERITY_LABEL: Record<Severity, string> = { all: "all", pdo: "PDO", injury: "injury", fatal: "fatal" };
const WEATHER_LABEL: Record<Weather, string> = { all: "all weather", dry: "dry", wet: "wet" };
const RAG_COLOR: Record<"green" | "amber" | "red", string> = { green: "var(--color-success)", amber: "var(--color-warning)", red: "var(--color-danger)" };

type Props = {
  // Same Range control every other Prescriptive card takes.
  months?: "3" | "12" | "all";
  from?: string;
  to?: string;
};

export default function ClearanceResponsePanel({ months = "12", from, to }: Props) {
  const T = useThemeTokens();
  const [type, setType] = useState<ClearanceType>("accident");
  const [severity, setSeverity] = useState<Severity>("injury");
  const [weather, setWeather] = useState<Weather>("all");
  const [data, setData] = useState<ClearanceResult | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  // Bumped by Try again: re-runs the effect with the same filters.
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    // Cleared here, not just on success, so a retry after a change shows "Updating…", not the last error.
    setError(null);
    setSlow(false);
    const params: Shown = { type, severity, weather };
    const qs = new URLSearchParams();
    qs.set("type", type);
    if (type === "accident") qs.set("severity", severity);
    qs.set("weather", weather);
    if (months) qs.set("months", months);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_MS);
    // Settles quick clicks into one request (and, on mount, React's development double-mount).
    const start = window.setTimeout(() => {
      fetchClearance(`${BACKEND}/api/incident/clearance-protocol?${qs}`, ctrl.signal)
        .then((d) => {
          if (ctrl.signal.aborted) return;
          setData(d);
          setShown(params);
        })
        .catch((e) => {
          if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "failed to load the clearance response protocol");
        })
        .finally(() => {
          if (ctrl.signal.aborted) return;
          window.clearTimeout(slowTimer);
          setLoading(false);
          setSlow(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(start);
      window.clearTimeout(slowTimer);
    };
  }, [type, severity, weather, months, from, to, attempt]);

  const hint =
    "When to escalate an incident that is still open, read off how long past incidents of the same kind took to clear (a Kaplan-Meier curve; day-long ones kept as still open, not dropped). Of the incidents still open at the median clearance time, the share that ran past the 80th percentile is the chance an open one will too. Type, severity and weather pick which past incidents count.";

  const controls = (
    <div className="inc-controls">
      <div className="inc-seg" role="group" aria-label="Incident type">
        {(["accident", "breakdown"] as const).map((v) => (
          <button key={v} onClick={() => setType(v)} aria-pressed={type === v} className={type === v ? "is-on" : ""}>
            {v === "accident" ? "Accident" : "Breakdown"}
          </button>
        ))}
      </div>
      {type === "accident" && (
        <div className="inc-seg" role="group" aria-label="Severity">
          {(["all", "pdo", "injury", "fatal"] as const).map((v) => (
            <button key={v} onClick={() => setSeverity(v)} aria-pressed={severity === v} className={severity === v ? "is-on" : ""}>
              {v === "all" ? "All" : v === "pdo" ? "PDO" : v === "injury" ? "Injury" : "Fatal"}
            </button>
          ))}
        </div>
      )}
      <div className="inc-seg" role="group" aria-label="Weather">
        {(["all", "dry", "wet"] as const).map((v) => (
          <button key={v} onClick={() => setWeather(v)} aria-pressed={weather === v} className={weather === v ? "is-on" : ""}>
            {v === "all" ? "All" : v === "dry" ? "Dry" : "Wet"}
          </button>
        ))}
      </div>
    </div>
  );

  const updating = loading && !error;
  const slowNote = "Reading this combination for the first time. Right after the server starts that can take up to a minute; it retries on its own.";
  const statusLine = (
    <>
      {updating && slow && <p className="inc-status-line" role="status">Still updating. {slowNote}</p>}
      {error && (
        <p className="inc-status-line is-warn" role="alert">
          Couldn&apos;t refresh with the current filters ({error}). Showing the last loaded result, which does not match them.
          <button type="button" className="btn-muted" onClick={retry}>Try again</button>
        </p>
      )}
    </>
  );

  if (loading && data === null) {
    return (
      <Shell title="Clearance Response Protocol" hint={hint} right={controls}>
        <Empty msg="Loading clearance response protocol…" note={slow ? slowNote : undefined} />
      </Shell>
    );
  }
  if (!data) {
    // Only reachable with no successful load yet, so there is nothing stale to fall back to.
    return (
      <Shell title="Clearance Response Protocol" hint={hint} right={controls}>
        <Empty kind="error" msg={`Clearance protocol unavailable: ${error ?? "no response from the server."}`} onRetry={retry} />
      </Shell>
    );
  }
  if (data.status === "insufficient_data") {
    return (
      <Shell title="Clearance Response Protocol" hint={hint} updating={updating} right={controls}>
        {statusLine}
        <div className="inc-busy-body" aria-busy={updating}>
          <Empty kind="nodata" msg={data.message} />
        </div>
      </Shell>
    );
  }
  // `shown` is always set alongside `data`; the fallback only satisfies the type checker.
  const at: Shown = shown ?? { type, severity, weather };
  const typeLabel = at.type === "breakdown" ? "breakdowns" : `${at.severity === "all" ? "" : `${SEVERITY_LABEL[at.severity]} `}accidents`;
  const rule = data.rule;
  const q = data.quantiles;

  /* Time bands (20 Nov 2026, replacing the survival curve, whose flat day-long tail took most of its width): the share
     of these incidents cleared within each band of minutes. Each share is S(start) - S(end) read off the same
     Kaplan-Meier curve (the backend's survivalAt), so day-long ones kept as still open land in the last band rather
     than being dropped. The band edges are fixed reading points plus the card's own green/amber targets, and 5 min
     when half clear inside the first band. */
  const curve = data.survivalCurve;
  const longest = curve.length > 0 ? curve[curve.length - 1].minute : 0;
  const S = (t: number) => {
    let s = 1;
    for (const p of curve) {
      if (p.minute > t) break;
      s = p.survival;
    }
    return s;
  };
  const { greenMax, amberMax } = data.kpi.targets;
  const edges = Array.from(new Set([...(q.p50 < 15 ? [5] : []), 15, 30, 45, 60, 90, 120, 180, greenMax, amberMax]))
    .filter((e) => e > 0)
    .sort((x, y) => x - y);
  // No empty bands past the longest clearance: the last band is "over" the last edge below it.
  const usable = edges.filter((e, i) => i === 0 || edges[i - 1] < longest);
  type Band = { label: string; from: number; to: number | null; share: number; cum: number };
  const bands: Band[] = [];
  let prev = 0;
  for (const e of usable) {
    bands.push({ label: `${prev}–${e} min`, from: prev, to: e, share: S(prev) - S(e), cum: 1 - S(e) });
    prev = e;
  }
  bands.push({ label: `Over ${prev} min`, from: prev, to: null, share: S(prev), cum: 1 });
  // Incident orange, not green/amber/red (20 Nov 2026, "match the colors"): three shades of the tab's heatmap ramp,
  // light within the target, deeper past it. Light ramp runs pale to deep, dark runs dim to bright, hence the indices.
  const heat = incidentHeatRamp(T.isDark);
  const zone = T.isDark ? { g: heat[3], a: heat[4], r: heat[5] } : { g: heat[2], a: heat[4], r: heat[5] };
  const zoneColor = (b: Band) => (b.to != null && b.to <= greenMax ? zone.g : b.to != null && b.to <= amberMax ? zone.a : zone.r);
  const checkBand = bands.findIndex((b) => rule.checkAtMinute >= b.from && (b.to == null || rule.checkAtMinute < b.to));
  const pctTxt = (v: number) => `${Math.round(v * 100)}%`;
  const approx = (v: number) => Math.round(v * data.sampleSize);

  const option: EChartsOption = {
    grid: { left: 8, right: 24, top: 8, bottom: 28, containLabel: true },
    tooltip: {
      trigger: "item",
      // Rendered into the tooltip's own DOM node (not canvas), so var() here resolves.
      formatter: (params: unknown) => {
        const b = bands[(params as { dataIndex: number }).dataIndex];
        if (!b) return "";
        const head = `<b>${b.to == null ? `Took over ${fmtMin(b.from)}` : `Cleared in ${b.from}–${b.to} min`}</b>`;
        const body = `${pctTxt(b.share)} of these ${typeLabel} (about ${approx(b.share)} of ${data.sampleSize})`;
        const tail =
          b.to == null
            ? `<br/><span style="color:var(--text-muted)">Includes ${data.censoredCount} still open at 24 h; the longest took ${fmtMin(longest)}.</span>`
            : `<br/><span style="color:var(--text-muted)">${pctTxt(b.cum)} cleared within ${fmtMin(b.to)}</span>`;
        return `${head}<br/>${body}${tail}`;
      },
    },
    xAxis: {
      type: "value", min: 0, max: (v: { max: number }) => Math.min(1, Math.ceil((v.max + 0.06) * 10) / 10),
      axisLabel: { color: T.chartText, formatter: (v: number) => `${Math.round(v * 100)}%` },
      splitLine: { lineStyle: { color: T.chartSplit } },
    },
    yAxis: {
      type: "category", inverse: true, data: bands.map((b) => b.label),
      axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: T.textSecondary, fontSize: 12 },
    },
    series: [
      {
        type: "bar",
        barWidth: "62%",
        data: bands.map((b) => ({ value: b.share, itemStyle: { color: zoneColor(b), borderRadius: [0, 5, 5, 0] } })),
        label: {
          show: true,
          position: "right",
          formatter: (p: unknown) => {
            const i = (p as { dataIndex: number }).dataIndex;
            const b = bands[i];
            const cum = b.to == null ? "" : `  {c|${pctTxt(b.cum)} by ${b.to} min}`;
            const chk = i === checkBand ? `  {k|◂ check at ${fmtMin(rule.checkAtMinute)}}` : "";
            return `{v|${pctTxt(b.share)}}${cum}${chk}`;
          },
          rich: {
            v: { color: T.textPrimary, fontWeight: 700, fontSize: 12 },
            c: { color: T.textMuted, fontSize: 11 },
            k: { color: T.textPrimary, fontWeight: 700, fontSize: 11 },
          },
        },
      },
    ],
  };

  return (
    <Shell title="Clearance Response Protocol" hint={hint} updating={updating} right={controls}>
      {statusLine}
      <div className="inc-busy-body" aria-busy={updating}>
        {/* The rule first, as a banner, with its three supporting facts (reference layout, 20 Nov 2026). */}
        <section className="px-hero">
          <div className="px-hero-head">
            <span className="px-icon is-warm" aria-hidden="true"><Siren size={22} strokeWidth={2} /></span>
            <h4>{rule.text}</h4>
            <SourceBadge kind="history" detail={`${data.sampleSize} measured clearance times of ${typeLabel}, ${WEATHER_LABEL[at.weather]}, Kaplan-Meier`} />
          </div>
          <dl className="px-hero-facts">
            <div>
              <dt>How sure</dt>
              <dd>95% range <b>{pct(rule.chance.lo)}–{pct(rule.chance.hi)}</b>, from the {rule.openAtCheck} of {data.sampleSize} still open at {fmtMin(rule.checkAtMinute)}</dd>
            </div>
            <div>
              <dt>Measured</dt>
              <dd>P50 <b>{fmtMin(q.p50)}</b> · P80 <b>{fmtMin(q.p80)}</b> · P95 <b>{fmtMin(q.p95)}</b> · n = {data.sampleSize}</dd>
            </div>
            <div>
              <dt>Vs target</dt>
              <dd>
                Mean {fmtMin(data.kpi.baselineMttr)},{" "}
                <span style={{ color: RAG_COLOR[data.kpi.rag], fontWeight: 700, textTransform: "uppercase" }}>{data.kpi.rag}</span> against{" "}
                {data.kpi.targets.greenMax} / {data.kpi.targets.amberMax} min{data.kpi.indicative ? " (indicative: not lane clearance)" : ""}
              </dd>
            </div>
          </dl>
          <details className="px-details">
            <summary><ChevronRight size={15} strokeWidth={2.4} aria-hidden="true" />Details</summary>
            <ul>
              {data.method.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </details>
        </section>

        {/* All and property-damage-only crashes (17 Nov 2026). With the 0-minute recording defaults left out, half
            of them are still logged as cleared within about 5 minutes, so the rule checks at minute 5. Those short
            times are not one repeated default (they cluster on whole and five-minute marks like hand-entered times,
            and most have their own blockage time), so they are kept rather than cut at a chosen minimum; the card
            says where the rule is dependable instead. */}
        {at.type === "accident" && (at.severity === "all" || at.severity === "pdo") && q.p50 <= 10 && (
          <p className="inc-caption">
            Half of these crashes were logged as cleared within {fmtMin(q.p50)} of the report, mostly minor ones, so the
            check comes very early. The rule is most dependable for injury and fatal crashes.
          </p>
        )}

        <section className="px-panel">
          <div className="px-panel-head">
            <h4>Share cleared in each time band</h4>
            <p className="px-curve-key" aria-hidden="true">
              <span><i className="is-g" style={{ background: zone.g }} />Within the {greenMax}-min target</span>
              <span><i className="is-a" style={{ background: zone.a }} />{greenMax}–{amberMax} min</span>
              <span><i className="is-r" style={{ background: zone.r }} />Over {amberMax} min</span>
            </p>
          </div>
          <DashboardChart option={option} height={bands.length * 34 + 40} />
          <p className="px-note">
            Grey figures are the running total. The last band includes the {data.censoredCount} still open at 24 h; the longest took {fmtMin(longest)}.
          </p>
        </section>

        <section className="px-panel px-panel-flush">
          <div className="px-table-wrap">
            <table className="px-table">
              <thead>
                <tr>
                  <th>Still open at</th>
                  <th>Share of all</th>
                  <th>Median time left</th>
                  <th>Runs past P95 ({fmtMin(q.p95)})</th>
                </tr>
              </thead>
              <tbody>
                {data.checkpoints.map((c) => (
                  <tr key={c.label} className={c.label === "P50" ? "is-first" : undefined}>
                    <td className="px-name">{fmtMin(c.minute)} <span className="is-muted">({c.label})</span></td>
                    <td>{pct(c.stillOpen)} <span className="is-muted">· {c.openCount} events</span></td>
                    <td>{c.medianRemainingMin == null ? "—" : `${fmtMin(c.medianRemainingMin)} more`}</td>
                    <td className="px-strong">
                      {pct(c.pastP95.p)} <span className="is-muted" style={{ fontWeight: 400 }}>({pct(c.pastP95.lo)}–{pct(c.pastP95.hi)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {/* Which filters these numbers answer, so a result still on screen from before a change is never mistaken for the new one. */}
        <p className="px-note">
          {at.type === "breakdown" ? "Breakdowns" : `${SEVERITY_LABEL[at.severity][0].toUpperCase()}${SEVERITY_LABEL[at.severity].slice(1)} accidents`},{" "}
          {WEATHER_LABEL[at.weather]} · n = {data.sampleSize} ({data.censoredCount} still open at 24 h) · {data.scoringWindow.from} to {data.scoringWindow.to} · {data.kpi.metricLabel}
        </p>
      </div>
    </Shell>
  );
}
