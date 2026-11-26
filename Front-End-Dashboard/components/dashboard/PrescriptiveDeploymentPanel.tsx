"use client";

import { useEffect, useState } from "react";
import { fmtInt } from "./incidentPredictive.shared";
import { BarChart3, CalendarDays, ChevronDown, ChevronRight, Layers, ListOrdered, MapPin, PieChart, Target, Truck } from "lucide-react";
import { Shell, Empty, SourceBadge, Banner } from "./prescriptiveShell";
// km arrives MEASURED (exits and segment midpoints); shown as the official km post.
import { fmtKm, kmMeasured, KM_POST_END, KM_POST_START } from "../../lib/km-post";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

// Built directly on top of the Predictive tab's own "Predicted Incidents
// Ranking" numbers, not a separately-modeled hotspot table — this panel's
// whole point is to be a solution FOR that ranking, so it reads the exact
// same corridorForecast/kmSegmentForecast /api/incident/predictive already
// returns (and PredictiveCorridorChart already renders) rather than an
// independent per-exit prediction that could show a different top corridor
// than what the user already saw. Mirrors incidentPredictive.shared.ts's
// CorridorForecastPoint/KmSegmentForecastPoint shapes; kept in sync by hand.
type CorridorForecastPoint = { exitId: number; exitName: string; km: number; predictedIncidents: number };
type KmSegmentForecastPoint = { segmentStart: number; segmentEnd: number; label: string; predictedIncidents: number };
type PredictiveSlice = {
  corridorForecast: CorridorForecastPoint[] | null;
  kmSegmentForecast: KmSegmentForecastPoint[] | null;
  corridorForecastModel: string | null;
  corridorForecastDays: number;
  /** The champion's daily forecast for the Future days, oldest first, to sum over the validated window. */
  futureDaily: { date: string; predicted: number | null }[];
  /** The rolling-origin study: which forecast ranges beat the benchmark. `note` names the benchmark and both errors. */
  horizonAccuracy: { hLo: number; hHi: number; usable: boolean; mase: number | null; note?: string | null }[];
};

/** An official km-post span, from measured ends: "Km 25–30". */
const kmSpan = (lo: number, hi: number) => (Math.abs(hi - lo) < 0.05 ? `Km ${fmtKm(lo)}` : `Km ${fmtKm(lo)}–${fmtKm(hi)}`);

/** km, lo and hi are MEASURED. An exit is a point (lo = hi = km); a segment spans lo to hi, km its middle. */
type Row = { key: string; label: string; km: number; lo: number; hi: number; predictedIncidents: number };
type Placed = Row & { order: number; cumShare: number };

/* The placement order (2 Nov 2026, "no assumptions"). It replaced a Maximal Covering solve whose answer depended on a
   fleet size and a coverage radius the operator had to make up: no NLEX patrol or tow fleet data exists, and no
   radius is measured. Now each forecast incident counts at its own exit (or km segment), as the Predictive tab's
   ranking already splits it, and units are placed busiest first: unit 1 where most forecast incidents are, unit 2 at
   the next, and so on. After each unit, `cumShare` is the share of all forecast incidents at the sites staffed so
   far, so the operator reads off their own fleet: "3 units -> 31%". Every number is the forecast's. */
function placementOrder(rows: Row[]): Placed[] {
  const total = rows.reduce((t, r) => t + r.predictedIncidents, 0);
  let run = 0;
  return rows
    .slice()
    .sort((a, b) => b.predictedIncidents - a.predictedIncidents)
    .map((r, i) => {
      run += r.predictedIncidents;
      return { ...r, order: i + 1, cumShare: total > 0 ? run / total : 0 };
    });
}

/* The plan on one line of road (reference layout, 20 Nov 2026): the corridor from the first to the last km post, a bar
   at each exit or segment for its forecast incidents, and the first `marked` places as numbered pins with their names
   above. Positions are MEASURED km; ticks are labelled with the official posts. */
function CorridorStrip({ rows, placed, marked }: { rows: Row[]; placed: Placed[]; marked: number }) {
  const W = 1000;
  const H = 150;
  const padX = 24;
  const base = 112;
  const lo = Math.min(kmMeasured(KM_POST_START), ...rows.map((r) => r.lo));
  const hi = Math.max(kmMeasured(KM_POST_END), ...rows.map((r) => r.hi));
  const x = (km: number) => padX + ((km - lo) / Math.max(hi - lo, 1)) * (W - 2 * padX);
  const top = Math.max(1, ...rows.map((r) => r.predictedIncidents));
  const ticks: number[] = [];
  for (let post = Math.ceil(KM_POST_START / 10) * 10; post <= KM_POST_END; post += 10) ticks.push(kmMeasured(post));
  const first = placed.slice(0, marked);
  const firstKeys = new Set(first.map((p) => p.key));
  // Left to right; a name sits on the higher row when it would touch the one before it.
  const byKm = first.slice().sort((a, b) => a.km - b.km);
  const pillW = (label: string) => Math.min(150, label.length * 6.4 + 22);
  let lastRight = [-Infinity, -Infinity];
  const pins = byKm.map((p) => {
    const w = pillW(p.label);
    const cx = Math.min(W - 4 - w / 2, Math.max(4 + w / 2, x(p.km)));
    const row = cx - w / 2 > lastRight[1] + 6 ? 1 : 0;
    lastRight = row === 1 ? [lastRight[0], cx + w / 2] : [cx + w / 2, lastRight[1]];
    return { p, w, cx, y: row === 1 ? 40 : 8 };
  });
  return (
    <figure className="px-strip">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Placement order: ${first.map((p) => `${p.order}. ${p.label}`).join(", ")}`}>
        <line className="px-strip-road" x1={x(lo)} x2={x(hi)} y1={base} y2={base} />
        {rows.map((r) => {
          const h = Math.max(2, (r.predictedIncidents / top) * 44);
          const w = r.hi - r.lo > 0.05 ? Math.max(3, x(r.hi) - x(r.lo) - 1) : 6;
          return (
            <rect key={r.key} className={`px-strip-bar${firstKeys.has(r.key) ? " is-staffed" : ""}`} x={r.hi - r.lo > 0.05 ? x(r.lo) : x(r.km) - 3} y={base - h} width={w} height={h} rx={1.5}>
              <title>{`${r.label} · ${kmSpan(r.lo, r.hi)} · ${Math.round(r.predictedIncidents).toLocaleString()} forecast incidents`}</title>
            </rect>
          );
        })}
        {/* Stems first, so a name on the lower row sits over a neighbour's stem rather than under it. */}
        {pins.map(({ p, y }) => (
          <line key={`stem-${p.key}`} className="px-strip-stem" x1={x(p.km)} x2={x(p.km)} y1={y + 24} y2={base - 11} />
        ))}
        {pins.map(({ p, w, cx, y }) => (
          <g key={`unit-${p.key}`} className="px-strip-pin">
            <rect className="px-strip-pill" x={cx - w / 2} y={y} width={w} height={24} rx={12} />
            <text className="px-strip-name" x={cx} y={y + 16} textAnchor="middle">{p.label}</text>
            <circle className="px-strip-dot" cx={x(p.km)} cy={base} r={11} />
            <text className="px-strip-num" x={x(p.km)} y={base + 4.5} textAnchor="middle">{p.order}</text>
          </g>
        ))}
        {ticks.map((t) => (
          <g key={`t-${t}`} className="px-strip-tick">
            <line x1={x(t)} x2={x(t)} y1={base + 12} y2={base + 17} />
            <text x={x(t)} y={base + 32} textAnchor="middle">Km {fmtKm(t, 0)}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

type Props = {
  // The Prescriptive tab's own Range control, threaded through the same way
  // PredictiveIncidentChart takes it — corridorForecast's apportionment
  // shares are computed from incidents within this window (verified: the
  // per-exit split shifts a few points between 3mo/12mo/all, even though the
  // published total forecast itself doesn't), so the placement order can move
  // with Range. Defaults to 12mo, this panel's original fixed window, when unset.
  months?: "3" | "12" | "all";
  from?: string;
  to?: string;
};

export default function PrescriptiveDeploymentPanel({ months = "12", from, to }: Props) {
  const [view, setView] = useState<"exit" | "km">("exit");
  const [predictive, setPredictive] = useState<PredictiveSlice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Cleared here, not just on success -- otherwise a retry after a control
    // change renders as a stale-refresh warning (the PREVIOUS attempt's
    // error) while it's still in flight, instead of "Updating…".
    setError(null);
    const qs = new URLSearchParams();
    if (months) qs.set("months", months);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`${BACKEND}/api/incident/predictive?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setPredictive({
          corridorForecast: json.data.corridorForecast,
          kmSegmentForecast: json.data.kmSegmentForecast,
          corridorForecastModel: json.data.corridorForecastModel,
          corridorForecastDays: json.data.corridorForecastDays,
          futureDaily: (json.data.daily ?? [])
            .filter((d: { predictionType?: string | null }) => d.predictionType === "future")
            .map((d: { date: string; predicted: number | null }) => ({ date: d.date, predicted: d.predicted }))
            .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date)),
          horizonAccuracy: json.data.horizonAccuracy ?? [],
        });
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the predicted-incidents ranking");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [months, from, to]);

  const hint =
    "Where to place patrol and tow-truck units, in order: the first unit where the incident forecast expects the most incidents, the next at the second, and so on. Each line gives the share of all forecast incidents covered by the units placed so far, so you read off your own fleet size. Incidents count at their own exit (or km segment), split by each one's share of past incidents in the Range; the total is the forecast over the days where its error is lower than the best simple benchmark's.";

  if (loading && predictive === null) {
    return (
      <Shell title="Resource Staging & Patrol Repositioning" hint={hint}>
        <Empty msg="Loading patrol deployment…" />
      </Shell>
    );
  }

  /* The forecast window that passes its accuracy test. The counts used to be the whole 90-day forecast, most of which
     loses to the benchmark (gold horizon study: days 15-90 fail). The first run of horizon buckets that pass is used
     instead; each exit keeps its share and the total becomes the forecast's sum over those days, so the rescaling is
     exact. With no passing bucket the full horizon stays, labelled as beyond the validated range. */
  const buckets = (predictive?.horizonAccuracy ?? []).slice().sort((a, b) => a.hLo - b.hLo);
  const firstOk = buckets.findIndex((b) => b.usable);
  /* "Usable" is the trainer's rule: the forecast's error in that range is lower than the best simple benchmark's
     (17 Nov 2026: the card said "beats repeating last week (MASE 0.75)", which is a different benchmark). The
     benchmark and both errors are read from the study's note, e.g. "(Baseline: weekday average, MAE 15.84 vs 14.64)". */
  let win: { lo: number; hi: number; firstHi: number; base: string | null; baseMae: number | null; mae: number | null } | null = null;
  if (firstOk >= 0) {
    let hi = buckets[firstOk].hHi;
    for (let i = firstOk + 1; i < buckets.length && buckets[i].usable && buckets[i].hLo === hi + 1; i++) hi = buckets[i].hHi;
    const m = /Baseline:\s*([^,()]+),\s*MAE\s*([\d.]+)\s*vs\s*([\d.]+)/i.exec(buckets[firstOk].note ?? "");
    win = { lo: buckets[firstOk].hLo, hi, firstHi: buckets[firstOk].hHi, base: m ? m[1].trim() : null, baseMae: m ? Number(m[2]) : null, mae: m ? Number(m[3]) : null };
  }
  const future = predictive?.futureDaily ?? [];
  const sumDays = (lo: number, hi: number) => future.slice(lo - 1, hi).reduce((t, d) => t + (d.predicted ?? 0), 0);
  const allFuture = sumDays(1, future.length);
  const scale = win && allFuture > 0 && future.length >= win.hi ? sumDays(win.lo, win.hi) / allFuture : 1;
  const validated = win != null && scale !== 1;
  const winLabel = validated ? `days ${win!.lo}–${win!.hi} ahead` : `the ${predictive?.corridorForecastDays ?? future.length}-day forecast`;
  /* The calendar days the placement is for, checked against TODAY (system audit 19 Nov 2026, P5-3): "days 1–14 ahead"
     counts from the incident record's end, so in November it named 25 May to 7 Jun 2026 as if they were coming. */
  const winFrom = (validated ? future[win!.lo - 1] : future[0])?.date?.slice(0, 10) ?? null;
  const winTo = (validated ? future[win!.hi - 1] : future[future.length - 1])?.date?.slice(0, 10) ?? null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const dayWithYear = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const windowPast = winFrom != null && winFrom < today;

  const useKmView = view === "km" && predictive?.kmSegmentForecast != null && predictive.kmSegmentForecast.length > 0;
  const exitRows: Row[] = (predictive?.corridorForecast ?? []).map((x) => ({
    key: `exit-${x.exitId}`, label: x.exitName, km: x.km, lo: x.km, hi: x.km, predictedIncidents: x.predictedIncidents * scale,
  }));
  const kmRows: Row[] = (predictive?.kmSegmentForecast ?? []).map((x) => ({
    key: `seg-${x.segmentStart}`, label: x.label, km: (x.segmentStart + x.segmentEnd) / 2, lo: x.segmentStart, hi: x.segmentEnd,
    predictedIncidents: x.predictedIncidents * scale,
  }));
  const rows: Row[] = useKmView ? kmRows : exitRows;

  // Only reachable with no successful load yet -- predictive === null -- or a
  // genuinely empty ranking, so there is nothing stale to fall back to; a
  // later refresh failure with data already loaded is handled below instead
  // of wiping the panel.
  if (!predictive || rows.length === 0) {
    return (
      <Shell title="Resource Staging & Patrol Repositioning" hint={hint}>
        <Empty kind={error ? "error" : "nodata"} msg={`Patrol deployment unavailable: ${error ?? "no Predicted Incidents Ranking data — check the Predictive tab's corridor card."}`} />
      </Shell>
    );
  }

  const placed = placementOrder(rows);
  const total = rows.reduce((t, r) => t + r.predictedIncidents, 0);
  const at = (n: number) => placed[Math.min(n, placed.length) - 1];
  // Milestones for the headline: how many units reach a quarter, half and three quarters of the forecast incidents.
  const unitsFor = (share: number) => (placed.find((p) => p.cumShare >= share - 1e-9)?.order ?? placed.length);
  const TOP_ROWS = 5;
  const visible = showAll ? placed : placed.slice(0, TOP_ROWS);
  const unitWord = useKmView ? "segment" : "exit";
  const modelName = predictive.corridorForecastModel ? `${predictive.corridorForecastModel} ` : "";

  const staged = placed.slice(0, 3).map((p) => p.label).join(", ") + (placed.length > 3 ? ", …" : "");
  const n3 = Math.min(3, placed.length);
  const n5 = Math.min(5, placed.length);
  return (
    <Shell
      title="Resource Staging & Patrol Repositioning"
      hint={hint}
      updating={loading && !error}
      right={
        <div className="inc-controls">
          <div className="inc-seg" role="group" aria-label="Group by">
            {(["exit", "km"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                disabled={v === "km" && (predictive.kmSegmentForecast == null || predictive.kmSegmentForecast.length === 0)}
                aria-pressed={view === v}
                className={view === v ? "is-on" : ""}
              >
                {v === "exit" ? "By Exit" : "By Km"}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {error && (
        <div role="alert" style={{ fontSize: "0.78rem", color: "var(--color-warning)" }}>
          Couldn&apos;t refresh ({error}) — showing the last loaded result.
        </div>
      )}

      {/* The answer (reference layout, 20 Nov 2026): the order, what the first units cover, and the total. The
          reference's "units to stage / reposition" are what these figures are: the share covered by the first 3 and
          the first 5 units placed. */}
      <div className="px-sum">
        <div className="px-sum-item px-sum-lead">
          <span className="px-icon is-ring" aria-hidden="true"><Target size={22} strokeWidth={2.2} /></span>
          <span>
            <small>Recommended staging order</small>
            <b title={placed.slice(0, 5).map((p) => `${p.order}. ${p.label}`).join(", ")}>{staged}</b>
          </span>
        </div>
        <div className="px-sum-item">
          <span className="px-icon" aria-hidden="true"><Truck size={20} strokeWidth={2} /></span>
          <span>
            <small>First {n3} {unitWord}s staffed</small>
            <b>cover {(at(n3).cumShare * 100).toFixed(0)}%</b>
          </span>
        </div>
        <div className="px-sum-item">
          <span className="px-icon" aria-hidden="true"><PieChart size={20} strokeWidth={2} /></span>
          <span>
            <small>First {n5} {unitWord}s staffed</small>
            <b>cover {(at(n5).cumShare * 100).toFixed(0)}%</b>
          </span>
        </div>
        <div className="px-sum-item">
          <span className="px-icon" aria-hidden="true"><Layers size={20} strokeWidth={2} /></span>
          <span>
            <small>Forecast incidents</small>
            <b>{fmtInt(total)}</b>
          </span>
        </div>
        <SourceBadge kind="forecast" detail={`The ${modelName}incident forecast for ${winLabel}, split by each ${unitWord}'s share of past incidents`} />
      </div>

      {/* The calendar days, checked against today (system audit 19 Nov 2026, P5-3). */}
      {windowPast && winFrom && winTo && (
        <Banner>
          <b>
            This placement is for {dayWithYear(winFrom)} to {dayWithYear(winTo)},{" "}
            {winTo < today ? "days already past" : "and its first days are already past"}:
          </b>{" "}
          today is {dayWithYear(today)}. The incident forecast starts the day after the incident record ends, so placing units
          for the coming days needs newer incident data and a retrain.
        </Banner>
      )}

      <div className="px-sum is-warm">
        <div className="px-sum-item">
          <span className="px-icon is-warm" aria-hidden="true"><CalendarDays size={20} strokeWidth={2} /></span>
          <span>
            <small>Timeframe</small>
            <b>{validated ? `Days ${win!.lo}–${win!.hi} ahead` : "The full forecast"}</b>
            <em>
              {validated
                ? <>Where the forecast&apos;s error is lower than {win!.base ? `the ${win!.base}'s` : "the best simple benchmark's"}{win!.mae != null && win!.baseMae != null ? ` (${win!.mae.toFixed(2)} vs ${win!.baseMae.toFixed(2)} incidents a day)` : ""}</>
                : <>No stretch of it beats the best simple benchmark</>}
              {winFrom && winTo && <>; {dayWithYear(winFrom)} to {dayWithYear(winTo)}</>}
            </em>
          </span>
        </div>
        <div className="px-sum-item">
          <span className="px-icon is-warm" aria-hidden="true"><BarChart3 size={20} strokeWidth={2} /></span>
          <span>
            <small>Half of the forecast</small>
            <b>{unitsFor(0.5)} {unitWord}s staffed</b>
            <em>busiest first, from the top of the order</em>
          </span>
        </div>
        <div className="px-sum-item">
          <span className="px-icon is-warm" aria-hidden="true"><ListOrdered size={20} strokeWidth={2} /></span>
          <span>
            <small>Three quarters of it</small>
            <b>{unitsFor(0.75)} {unitWord}s staffed</b>
            <em>no fleet size is assumed: read your own off the table</em>
          </span>
        </div>
      </div>

      <section className="px-panel">
        <div className="px-panel-head">
          <span className="px-chip" aria-hidden="true"><MapPin size={17} strokeWidth={2.2} /></span>
          <h4>Recommended Unit Placement Along NLEX</h4>
          <div className="px-legend">
            <span><i className="is-unit" />Placement order (1st–{ordinal(Math.min(5, placed.length))})</span>
            <span><i className="is-bar" />Forecast incidents</span>
          </div>
        </div>
        <CorridorStrip rows={rows} placed={placed} marked={Math.min(5, placed.length)} />
      </section>

      <section className="px-panel">
        <div className="px-panel-head">
          <span className="px-chip" aria-hidden="true"><ListOrdered size={17} strokeWidth={2.2} /></span>
          <h4>{useKmView ? "Segment" : "Exit"} Prioritization &amp; Coverage</h4>
        </div>
        <div className="px-table-wrap">
          <table className="px-table">
            <thead>
              <tr>
                <th className="is-num">#</th>
                <th>{useKmView ? "Segment" : "Exit"}</th>
                <th className="is-c">Km post</th>
                <th className="is-c">Forecast incidents</th>
                <th>Coverage with units 1–n</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.key} className={p.order === 1 ? "is-first" : undefined}>
                  <td className="is-num"><span className={`px-order${p.order <= 5 ? " is-top" : ""}`}>{p.order}</span></td>
                  <td className="px-name">{p.label}</td>
                  {/* Official km post (lib/km-post.ts). */}
                  <td className="is-c is-muted">{kmSpan(p.lo, p.hi).replace("Km ", "")}</td>
                  <td className="is-c px-strong">{fmtInt(p.predictedIncidents)}</td>
                  <td>
                    <span className="px-cov">
                      <span className="px-cov-bar" aria-hidden="true"><i style={{ width: `${(p.cumShare * 100).toFixed(1)}%` }} /></span>
                      <b>{(p.cumShare * 100).toFixed(0)}%</b>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {placed.length > TOP_ROWS && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="px-more" aria-expanded={showAll}>
            {showAll ? `Show the first ${TOP_ROWS}` : `Show all ${placed.length} ${useKmView ? "segments" : "exits"}`}
            {showAll ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
          </button>
        )}
      </section>
    </Shell>
  );
}

function ordinal(n: number): string {
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}
