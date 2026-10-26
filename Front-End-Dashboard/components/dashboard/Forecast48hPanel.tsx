"use client";

import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import DashboardChart from "./DashboardChart";
import InfoTooltip from "./InfoTooltip";
import StateNote from "../stage/StateNote";
import { useTrafficPalette } from "./trafficPalette";
import { useChartTheme } from "../../lib/chart-theme";
import { forecastLineStyle, lineStyle, withAlpha } from "../../lib/chart-kit";

/* The 48-hour hourly forecast (GET /api/traffic/forecast/48h), issued by
   smartflow_scripts/3_training_testing/traffic_hourly_48h/forecast_48h.py from
   the latest upload. The chart shows the recorded 72 hours before the forecast
   (solid) and the 48 forecast hours (dashed) with the model's 80% band where one
   was calibrated; the slider reads one forecast hour's own values. Every figure
   on the card comes from the run: the model, whether a plaza fell back to the
   previous method, how old the history is, and how the model did on 2025. */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

type Hour = {
  ts: string; horizon: number;
  class1: number; class2: number; class3: number; total: number;
  lo: number | null; hi: number | null;
  classBands: { lo1: number; hi1: number; lo2: number; hi2: number; lo3: number; hi3: number } | null;
  actual: number | null;
};
type Run = {
  runId: number; issuedAt: string; originTs: string; historyEnd: string; historySynthetic: boolean;
  model: string; modelLabel: string; status: "ok" | "partial_fallback" | "fallback";
  seriesModel: number; seriesFallback: number; fallbackReasons: Record<string, string>;
  intervalLevel: number | null;
  freshness: { hoursSinceHistoryEnd: number; stale: boolean; windowPast: boolean };
  backtest: {
    window: { first: string; last: string } | null;
    seriesWape: number | null; seriesMae: number | null; corridorWape: number | null; corridorMape: number | null;
    byHorizon: Record<string, number>; naiveSeriesWape: number | null; currentSeriesWape: number | null;
    bandCoverage: number | null; corridorBandCoverage: number | null; trainedThrough: string | null; why: string | null;
  } | null;
};
type Payload = {
  run: Run;
  selection: { exit: string | null; direction: string | null; matched: number; corridor?: boolean; bandAvailable?: boolean; methods?: string[]; unsplitExcluded?: string[] };
  series: { key: string; exit: string; direction: string | null; role: string | null; tollSystem: string | null; method: string }[];
  hours: Hour[];
  history: { ts: string; class1: number; class2: number; class3: number; total: number }[];
};
type ClassKey = "all" | "1" | "2" | "3";

const fmtVeh = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtTs = (ts: string, withDay = true) => {
  const d = new Date(ts);
  const h = d.getHours();
  const hh = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
  return withDay ? `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${hh}` : hh;
};
const fmtDate = (ts: string) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function pick(h: { class1: number; class2: number; class3: number; total: number }, c: ClassKey) {
  return c === "all" ? h.total : c === "1" ? h.class1 : c === "2" ? h.class2 : h.class3;
}

export default function Forecast48hPanel() {
  const P = useTrafficPalette();
  const t = useChartTheme();
  const [exit, setExit] = useState("");
  const [direction, setDirection] = useState<"" | "NB" | "SB">("");
  const [cls, setCls] = useState<ClassKey>("all");
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none" | "error">("loading");
  const [sel, setSel] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setState((s) => (s === "ok" ? s : "loading"));
    const qs = new URLSearchParams();
    if (exit) qs.set("exit", exit);
    if (direction) qs.set("direction", direction);
    fetch(`${BACKEND}/api/traffic/forecast/48h?${qs}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) { setState("none"); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        setData(j.data as Payload);
        setState("ok");
      })
      .catch((err) => { if (!cancelled) { console.error("48h forecast", err); setState("error"); } });
    return () => { cancelled = true; };
  }, [exit, direction]);

  const exits = useMemo(() => [...new Set((data?.series ?? []).map((s) => s.exit))].sort(), [data?.series]);
  const dirsForExit = useMemo(() => {
    const d = new Set((data?.series ?? []).filter((s) => !exit || s.exit === exit).map((s) => s.direction));
    return { NB: d.has("NB"), SB: d.has("SB") };
  }, [data?.series, exit]);

  const hours = data?.hours ?? [];
  const cur = hours[Math.min(sel, hours.length) - 1];
  const run = data?.run;

  // Band for the chosen class: the total band, or a class band when one series is selected.
  const bandOf = (h: Hour): [number, number] | null => {
    if (cls === "all") return h.lo != null && h.hi != null ? [h.lo, h.hi] : null;
    if (!h.classBands) return null;
    const b = h.classBands;
    return cls === "1" ? [b.lo1, b.hi1] : cls === "2" ? [b.lo2, b.hi2] : [b.lo3, b.hi3];
  };

  const option = useMemo<EChartsOption | null>(() => {
    if (!data || !hours.length) return null;
    const hist = data.history;
    const x = [...hist.map((h) => h.ts), ...hours.map((h) => h.ts)];
    const nH = hist.length;
    const rec = [...hist.map((h) => pick(h, cls)), ...hours.map((h) => (h.actual != null && cls === "all" ? h.actual : null))];
    const fc = [...Array(Math.max(nH - 1, 0)).fill(null), nH ? pick(hist[nH - 1], cls) : null, ...hours.map((h) => pick(h, cls))].slice(-x.length);
    const bands = hours.map(bandOf);
    const hasBand = bands.some((b) => b != null);
    const lo = [...Array(nH).fill(null), ...bands.map((b) => (b ? b[0] : null))];
    const width = [...Array(nH).fill(null), ...bands.map((b) => (b ? Math.max(b[1] - b[0], 0) : null))];
    const selTs = cur?.ts;
    return {
      grid: { left: 56, right: 18, top: 28, bottom: 40 },
      tooltip: {
        trigger: "axis",
        formatter: (ps: unknown) => {
          const arr = ps as { axisIndex: number; dataIndex: number }[];
          const i = arr[0]?.dataIndex ?? 0;
          const lines = [`<b>${fmtTs(x[i])}</b>`];
          if (rec[i] != null) lines.push(`Recorded: <b>${fmtVeh(rec[i] as number)}</b> veh/h`);
          if (i >= nH) {
            const h = hours[i - nH];
            lines.push(`Forecast (+${h.horizon} h): <b>${fmtVeh(pick(h, cls))}</b> veh/h`);
            const b = bands[i - nH];
            if (b) lines.push(`Band (nominal ${Math.round((run?.intervalLevel ?? 0.8) * 100)}%): ${fmtVeh(b[0])} – ${fmtVeh(b[1])}`);
          }
          return lines.join("<br/>");
        },
        extraCssText: P.tooltipCss,
      },
      xAxis: {
        type: "category", data: x, boundaryGap: false,
        axisLabel: { interval: 11, formatter: (v: string) => fmtTs(v, new Date(v).getHours() === 0) },
      },
      yAxis: { type: "value", name: "veh/h", nameGap: 12, axisLabel: { formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)) } },
      series: [
        ...(hasBand ? [
          { name: "band-lo", type: "line" as const, data: lo, stack: "band", symbol: "none", lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
          { name: "Band", type: "line" as const, data: width, stack: "band", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: withAlpha(P.model, 0.18) }, silent: true },
        ] : []),
        { name: "Recorded", type: "line" as const, data: rec, ...lineStyle(P.accent), connectNulls: false },
        {
          name: "Forecast", type: "line" as const, data: fc, ...forecastLineStyle(P.model),
          markLine: {
            silent: true, symbol: ["none", "none"], animation: false,
            lineStyle: { color: t.ink, width: 1, type: "solid" as const, opacity: 0.6 },
            label: { formatter: "Forecast from", position: "insideEndTop" as const, color: t.ink, fontSize: 11, fontWeight: 600 },
            data: [{ xAxis: hours[0].ts }],
          },
          markPoint: selTs ? {
            symbol: "circle", symbolSize: 10, animation: false,
            itemStyle: { color: P.model, borderColor: P.surface, borderWidth: 2 },
            label: { show: false },
            data: [{ coord: [selTs, pick(cur, cls)] }],
          } : undefined,
        },
      ],
    } as EChartsOption;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cls, sel, P, t]);

  if (state === "loading" && !data) {
    return <article className="chart-card wide nct-card"><StateNote kind="loading">Loading the 48-hour forecast…</StateNote></article>;
  }
  if (state === "none") {
    return (
      <article className="chart-card wide nct-card">
        <StateNote kind="nodata" title="No 48-hour forecast has been issued yet">
          It is written by forecast_48h.py after the weekly retrain. Until then the daily forecast above is the only traffic forecast.
        </StateNote>
      </article>
    );
  }
  if (state === "error" || !data || !run) {
    return (
      <article className="chart-card wide nct-card">
        <StateNote kind="error" role="alert" title="The 48-hour forecast could not be loaded">The server did not answer. Nothing is shown rather than an old or made-up figure.</StateNote>
      </article>
    );
  }

  const bt = run.backtest;
  const level = Math.round((run.intervalLevel ?? 0.8) * 100);
  const band = cur ? bandOf(cur) : null;
  const where = exit ? `${exit}${direction ? ` ${direction}` : ""}` : direction ? `All ${direction} plazas` : "The whole corridor";
  const statusPill = run.status === "ok"
    ? <span className="pill green" title={bt?.why ?? undefined}>✓ tested on 2025 · {bt?.seriesWape?.toFixed(1)}% error per plaza-hour</span>
    : run.status === "partial_fallback"
      ? <span className="pill amber" title={Object.entries(run.fallbackReasons).map(([k, v]) => `${k}: ${v}`).join("\n")}>{run.seriesFallback} plaza{run.seriesFallback === 1 ? "" : "s"} on the previous method</span>
      : <span className="pill red" title={Object.values(run.fallbackReasons)[0] ?? undefined}>Model unavailable · previous method shown</span>;

  return (
    <article className="chart-card wide nct-card">
      <div className="nct-card-head-split">
        <h3 className="nct-title">
          Next 48 Hours, Hour by Hour
          <InfoTooltip text={`Vehicles per hour paying at each toll plaza, forecast for the 48 hours after the latest upload. Model: ${run.modelLabel}. It reads the last 72 hours, the last 8 weeks of daily totals and the calendar of the forecast hours (holidays, year-end, Arena events). It never sees the weather of the hours it predicts. A trip is counted once, where it paid, so the plazas add up to the corridor. This counts toll transactions, not road congestion.`} />
        </h3>
        <div className="nct-pill-row">
          <span className="pill purple">Forecast · {run.modelLabel}</span>
          {statusPill}
        </div>
      </div>

      {(run.freshness.stale || run.historySynthetic) && (
        <div className="nct-finding nct-finding-text" data-tone="slow" role="note">
          {run.freshness.windowPast ? <>This forecast covers <b>{fmtTs(hours[0].ts)}</b> to <b>{fmtTs(hours[hours.length - 1].ts)}</b>, already in the past: </> : <>Forecast from </>}
          the record ends <b>{fmtDate(run.historyEnd)}</b>, the latest upload, {run.freshness.hoursSinceHistoryEnd >= 48 ? `${Math.round(run.freshness.hoursSinceHistoryEnd / 24)} days ago` : `${run.freshness.hoursSinceHistoryEnd} hours ago`}.
          {run.historySynthetic && <> The 2026 history it starts from is the team&apos;s <b>synthetic</b> data, not the client&apos;s records, so read it as a demonstration of the method.</>}
          {" "}A new forecast is issued after the next upload and weekly retrain.
        </div>
      )}

      <div className="nct-toolbar">
        <label className="nct-group">
          <span className="nct-group-label">Plaza</span>
          <select className="nct-select" value={exit} onChange={(e) => { setExit(e.target.value); setDirection(""); }} style={{ maxWidth: 260 }}>
            <option value="">Whole corridor</option>
            {exits.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="nct-group">
          <span className="nct-group-label">Direction</span>
          <select className="nct-select" value={direction} onChange={(e) => setDirection(e.target.value as "" | "NB" | "SB")}>
            <option value="">{exit ? "As recorded" : "Both"}</option>
            {dirsForExit.NB && <option value="NB">Northbound</option>}
            {dirsForExit.SB && <option value="SB">Southbound</option>}
          </select>
        </label>
        <label className="nct-group">
          <span className="nct-group-label">Class</span>
          <select className="nct-select" value={cls} onChange={(e) => setCls(e.target.value as ClassKey)}>
            <option value="all">All classes</option>
            <option value="1">Class 1 (cars, jeepneys)</option>
            <option value="2">Class 2 (buses, small trucks)</option>
            <option value="3">Class 3 (large trucks)</option>
          </select>
        </label>
      </div>

      {data.selection.matched === 0 ? (
        <StateNote kind="nodata">No plaza series matches {where}.</StateNote>
      ) : (
        <>
          <label className="nct-range" style={{ marginTop: 4 }}>
            <span className="nct-range-head">
              Forecast hour <b>{cur ? `${fmtTs(cur.ts)} · +${cur.horizon} h` : "—"}</b>
            </span>
            <input type="range" min={1} max={Math.max(hours.length, 1)} value={sel} onChange={(e) => setSel(Number(e.target.value))}
              aria-label="Forecast hour" aria-valuetext={cur ? `${fmtTs(cur.ts)}, ${fmtVeh(pick(cur, cls))} vehicles per hour` : undefined} />
          </label>

          {cur && (
            <div className="nct-stats" style={{ marginTop: 10 }}>
              <div className="nct-stat">
                <span className="nct-stat-value" style={{ color: P.model }}>{fmtVeh(pick(cur, cls))}</span>
                <span className="nct-stat-label">{where} · veh/h forecast</span>
              </div>
              <div className="nct-stat">
                <span className="nct-stat-value">{band ? `${fmtVeh(band[0])} – ${fmtVeh(band[1])}` : "—"}</span>
                <span className="nct-stat-label">{band ? `band (nominal ${level}%, see test below)` : data.selection.corridor || data.selection.matched === 1 ? "band not available" : "band: pick one plaza and direction"}</span>
              </div>
              {cls === "all" && (
                <div className="nct-stat">
                  <span className="nct-stat-value">{fmtVeh(cur.class1)} / {fmtVeh(cur.class2)} / {fmtVeh(cur.class3)}</span>
                  <span className="nct-stat-label">Class 1 / 2 / 3</span>
                </div>
              )}
              <div className="nct-stat">
                <span className="nct-stat-value">{cur.actual != null && cls === "all" ? fmtVeh(cur.actual) : "—"}</span>
                <span className="nct-stat-label">{cur.actual != null ? "recorded since" : "not recorded yet"}</span>
              </div>
            </div>
          )}

          {option && <div style={{ marginTop: 8 }}><DashboardChart option={option} height={300} /></div>}
          {(data.selection.unsplitExcluded?.length ?? 0) > 0 && (
            <p className="nct-dim" style={{ marginTop: 4 }}>
              Direction totals leave out plazas the record does not split by direction: {[...new Set(data.selection.unsplitExcluded)].join(", ")}.
            </p>
          )}
        </>
      )}

      {bt && (
        <div className="nct-finding nct-finding-text" data-tone="accent" style={{ marginTop: 10 }}>
          Tested on the real 2025 record ({bt.window ? `${fmtDate(bt.window.first)} – ${fmtDate(bt.window.last)}` : "2025"}), forecasts it never trained on:
          {" "}<b>{bt.seriesWape?.toFixed(1)}%</b> error per plaza-hour
          {bt.currentSeriesWape != null && <> (previous method {bt.currentSeriesWape.toFixed(1)}%, same hour last week {bt.naiveSeriesWape?.toFixed(1)}%)</>},
          {" "}<b>{bt.corridorWape?.toFixed(1)}%</b> on the corridor total.
          {(() => {
            // The band is calibrated on Jan-Jun 2025 and checked on Jul-Dec. State what it actually held there
            // rather than its nominal level: it held less than 80% (the rainy season and Christmas are not in the
            // calibration half), least of all on holidays.
            const cov = data.selection.corridor ? bt.corridorBandCoverage : bt.bandCoverage;
            return cov != null ? <> The shaded band is nominally {level}%; on July–December 2025 it held <b>{Math.round(cov * 100)}%</b> of actual {data.selection.corridor ? "corridor hours" : "plaza-hours"}, and fewer on holidays.</> : null;
          })()}
          <span className="nct-finding-kv">
            <span className="nct-kv-k">By hours ahead</span>
            <span>{Object.entries(bt.byHorizon).map(([h, w]) => `+${h} h ${Number(w).toFixed(1)}%`).join(" · ")}</span>
          </span>
          <span className="nct-finding-kv">
            <span className="nct-kv-k">Issued</span>
            <span>{new Date(run.issuedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · run {run.runId} · {run.seriesModel} of {run.seriesModel + run.seriesFallback} plazas on the model</span>
          </span>
        </div>
      )}
    </article>
  );
}
