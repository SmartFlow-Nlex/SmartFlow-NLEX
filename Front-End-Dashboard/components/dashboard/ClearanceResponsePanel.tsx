"use client";

import { useEffect, useState } from "react";
import type { EChartsOption } from "echarts";
import { Siren } from "lucide-react";
import DashboardChart from "./DashboardChart";
import { Shell, Empty, ActionCard } from "./prescriptiveShell";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

// Incident → Prescriptive: Clearance Response Protocol. A different question
// than the other two Prescriptive cards (where to station units; when to be
// on alert): given an incident has just been reported, how many units to
// dispatch now and whether to escalate at a fixed decision point. Backed by
// clearance-protocol.service.ts -- a Kaplan-Meier clearance-time curve cut
// into scenarios, fed into a two-stage stochastic MILP (YALPS). See that
// file's own module doc comment for the full method and every assumption.

type ScenarioLabel = "fast" | "typical" | "slow" | "extreme";
const SCENARIO_ORDER: ScenarioLabel[] = ["fast", "typical", "slow", "extreme"];
const SCENARIO_TITLE: Record<ScenarioLabel, string> = { fast: "Fast", typical: "Typical", slow: "Slow", extreme: "Extreme" };

type SurvivalPoint = { minute: number; survival: number; atRisk: number };

type ClearanceOk = {
  status: "ok";
  recommendation: {
    unitsAtDispatch: number;
    escalateAtMinute: number;
    escalationUnitsByScenario: Record<ScenarioLabel, number>;
    action: string;
    when: string;
    effect: string;
    confidence: string;
  };
  survivalCurve: SurvivalPoint[];
  quantiles: { p50: number; p80: number; p95: number };
  scenarios: { label: ScenarioLabel; probability: number; durationMin: number; delayVehHours: number; recourseUnits: number; effectiveDurationMin: number }[];
  kpi: { projectedMttr: number; baselineMttr: number; rag: "green" | "amber" | "red"; targets: { greenMax: number; amberMax: number }; metricLabel: string; indicative: boolean };
  evpi: number;
  vss: number;
  assumptions: string[];
  sensitivity: { beta: number; delayCostMultiplier: number; unitsAtDispatch: number; maxEscalation: number }[];
  deltaSensitivity: { deltaResponseMin: number; unitsAtDispatch: number; maxEscalation: number; derivedCostPerUncoveredIncident: number }[];
  scoringWindow: { from: string; to: string };
  sampleSize: number;
  censoredCount: number;
};
type ClearanceInsufficientData = { status: "insufficient_data"; sampleSize: number; scoringWindow: { from: string; to: string }; message: string };
type ClearanceResult = ClearanceOk | ClearanceInsufficientData;

const fmtMin = (m: number) => `${m.toFixed(0)} min`;
const fmtPhp = (n: number) => `₱${Math.round(n).toLocaleString("en-US")}`;
const RAG_COLOR: Record<"green" | "amber" | "red", string> = { green: "var(--color-success)", amber: "var(--color-warning)", red: "var(--color-danger)" };

type Props = {
  // Same Range control every other Prescriptive card takes.
  months?: "3" | "12" | "all";
  from?: string;
  to?: string;
};

export default function ClearanceResponsePanel({ months = "12", from, to }: Props) {
  const [type, setType] = useState<"accident" | "breakdown">("accident");
  const [severity, setSeverity] = useState<"all" | "pdo" | "injury" | "fatal">("injury");
  const [weather, setWeather] = useState<"all" | "dry" | "wet">("all");
  const [demandLevel, setDemandLevel] = useState<"offpeak" | "normal" | "peak">("normal");
  const [maxUnits, setMaxUnits] = useState(4);
  const [beta, setBeta] = useState(0.25);
  const [deltaResponseMin, setDeltaResponseMin] = useState(15);
  const [data, setData] = useState<ClearanceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("type", type);
    if (type === "accident") qs.set("severity", severity);
    qs.set("weather", weather);
    qs.set("demandLevel", demandLevel);
    qs.set("maxUnits", String(maxUnits));
    qs.set("unitEffect", String(beta));
    qs.set("deltaResponseMin", String(deltaResponseMin));
    if (months) qs.set("months", months);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`${BACKEND}/api/incident/clearance-protocol?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setData(json.data);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the clearance response protocol");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, severity, weather, demandLevel, maxUnits, beta, deltaResponseMin, months, from, to]);

  const hint =
    "How many units to dispatch the moment an incident is reported, and whether to escalate at a fixed decision point — a Kaplan-Meier clearance-time curve (right-censored at 24h, not dropped) cut into fast/typical/slow/extreme scenarios at its own P50/P80/P95, fed into a two-stage stochastic covering-style MILP (YALPS). Each unit is priced at an hourly rate PLUS a coverage-opportunity cost — not a flat guess, but derived from the same queueing model (what a new incident's extra wait, Δ, would cost in delay if this unit weren't free) — so the model can't just recommend the whole fleet every time. Demand, capacity, unit-effect and Δ are stated assumptions, not measured — see Details.";

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
      <div className="inc-seg" role="group" aria-label="Demand level">
        {(["offpeak", "normal", "peak"] as const).map((v) => (
          <button key={v} onClick={() => setDemandLevel(v)} aria-pressed={demandLevel === v} className={demandLevel === v ? "is-on" : ""}>
            {v === "offpeak" ? "Off-peak" : v === "normal" ? "Normal" : "Peak"}
          </button>
        ))}
      </div>
      <label className="inc-slider">
        <span className="inc-slider-top">
          <span>Max units</span>
          <b>{maxUnits}</b>
        </span>
        <input type="range" min={1} max={6} step={1} value={maxUnits} onChange={(e) => setMaxUnits(Number(e.target.value))} />
      </label>
      <label className="inc-slider">
        <span className="inc-slider-top">
          <span>Unit effect (β, assumption)</span>
          <b>{beta.toFixed(2)}</b>
        </span>
        <input type="range" min={0} max={1} step={0.05} value={beta} onChange={(e) => setBeta(Number(e.target.value))} />
      </label>
      <label className="inc-slider">
        <span className="inc-slider-top">
          <span>Response delay Δ (assumption)</span>
          <b>{deltaResponseMin} min</b>
        </span>
        <input type="range" min={5} max={30} step={5} value={deltaResponseMin} onChange={(e) => setDeltaResponseMin(Number(e.target.value))} />
      </label>
    </div>
  );

  if (loading && data === null) {
    return (
      <Shell title="Clearance Response Protocol" hint={hint} right={controls}>
        <Empty msg="Loading clearance response protocol…" />
      </Shell>
    );
  }
  if (error || !data) {
    return (
      <Shell title="Clearance Response Protocol" hint={hint} right={controls}>
        <Empty kind="error" msg={`Clearance protocol unavailable: ${error ?? "no response from the server."}`} />
      </Shell>
    );
  }
  if (data.status === "insufficient_data") {
    return (
      <Shell title="Clearance Response Protocol" hint={hint} right={controls}>
        <Empty kind="nodata" msg={data.message} />
      </Shell>
    );
  }

  const curve = data.survivalCurve;
  const maxMinute = curve.length > 0 ? Math.max(curve[curve.length - 1].minute, data.recommendation.escalateAtMinute) : 60;

  type MLPoint = { xAxis: number; lineStyle?: { type?: "dashed" | "solid"; color?: string; width?: number }; label?: { show: boolean; formatter?: string; color?: string; fontSize?: number; position?: "insideEndTop" | "insideStartTop" } };
  const markLineData: MLPoint[] = [
    { xAxis: data.quantiles.p50, lineStyle: { type: "dashed", color: "var(--text-muted)", width: 1.5 }, label: { show: true, formatter: `P50 ${Math.round(data.quantiles.p50)}m`, color: "var(--text-muted)", fontSize: 10 } },
    { xAxis: data.quantiles.p80, lineStyle: { type: "dashed", color: "var(--text-muted)", width: 1.5 }, label: { show: true, formatter: `P80 ${Math.round(data.quantiles.p80)}m`, color: "var(--text-muted)", fontSize: 10 } },
    { xAxis: data.quantiles.p95, lineStyle: { type: "dashed", color: "var(--text-muted)", width: 1.5 }, label: { show: true, formatter: `P95 ${Math.round(data.quantiles.p95)}m`, color: "var(--text-muted)", fontSize: 10 } },
    { xAxis: data.recommendation.escalateAtMinute, lineStyle: { type: "solid", color: "var(--page-accent)", width: 2 }, label: { show: true, formatter: "Escalate", color: "var(--page-accent)", fontSize: 10, position: "insideStartTop" } },
  ];

  type MAPoint = { xAxis: number; itemStyle?: { color: string } };
  const markAreaData: [MAPoint, MAPoint][] = [
    [{ xAxis: 0, itemStyle: { color: "color-mix(in srgb, var(--color-success) 10%, transparent)" } }, { xAxis: data.kpi.targets.greenMax }],
  ];

  const option: EChartsOption = {
    grid: { left: 56, right: 24, top: 24, bottom: 48 },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = params as { dataIndex: number; value: [number, number] }[];
        if (items.length === 0) return "";
        const idx = items[0].dataIndex;
        const point = curve[idx];
        if (!point) return "";
        return `<b>${point.minute.toFixed(0)} min since report</b><br/>${(point.survival * 100).toFixed(1)}% still uncleared<br/><span style="color:var(--text-muted)">${point.atRisk} at risk</span>`;
      },
    },
    xAxis: { type: "value", name: "Minutes since report", nameLocation: "middle", nameGap: 28, min: 0, max: maxMinute, axisLabel: { color: "var(--text-muted)" }, splitLine: { show: false } },
    yAxis: {
      type: "value", name: "Still uncleared", nameLocation: "middle", nameGap: 44, min: 0, max: 1,
      axisLabel: { color: "var(--text-muted)", formatter: (v: number) => `${Math.round(v * 100)}%` },
      splitLine: { lineStyle: { color: "var(--border-default)" } },
    },
    series: [
      {
        type: "line",
        step: "end",
        showSymbol: false,
        data: curve.map((p) => [p.minute, p.survival]),
        lineStyle: { width: 2.5, color: "var(--page-accent, #4f46e5)" },
        itemStyle: { color: "var(--page-accent, #4f46e5)" },
        markLine: { silent: true, symbol: "none", label: { show: false }, data: markLineData },
        markArea: { silent: true, data: markAreaData },
      },
    ],
  };

  const chosen = data.recommendation;

  return (
    <Shell title="Clearance Response Protocol" hint={hint} right={controls}>
      <ActionCard
        lead
        icon={Siren}
        title={`Dispatch ${chosen.unitsAtDispatch} unit${chosen.unitsAtDispatch === 1 ? "" : "s"}; decide at minute ${chosen.escalateAtMinute}`}
        facts={[
          { label: "Action", value: chosen.action },
          { label: "When", value: chosen.when },
          { label: "Effect", value: chosen.effect },
          { label: "Confidence", value: chosen.confidence },
          { label: "EVPI", value: <>{fmtPhp(data.evpi)} — cost of not knowing the scenario in advance</> },
          { label: "VSS", value: <>{fmtPhp(data.vss)} — what planning for one average incident would cost extra</> },
        ]}
        details={
          <>
            <p style={{ margin: 0 }}>
              The clearance-time curve is a Kaplan-Meier estimate over {data.sampleSize} {type}{type === "accident" && severity !== "all" ? ` (${severity})` : ""} events
              in the selected Range/weather ({data.censoredCount} right-censored at 1440 min, not dropped). It is cut into four scenarios at its own
              P50/P80/P95 ({fmtMin(data.quantiles.p50)} / {fmtMin(data.quantiles.p80)} / {fmtMin(data.quantiles.p95)}), each given a probability
              read directly off the curve (so the four sum to exactly 1) and a representative duration (the conditional median of the real events in that band).
            </p>
            <p style={{ margin: "8px 0 0" }}>
              A two-stage stochastic mixed-integer program (YALPS) then picks how many units to dispatch at minute 0, and — separately per scenario — whether to
              add more at minute {chosen.escalateAtMinute} (this set&apos;s own P50, the point at which an incident is no longer a &quot;fast&quot; one). Queue delay
              uses the deterministic vertical-queueing formula for a temporary capacity drop.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              <strong>EVPI</strong> ({fmtPhp(data.evpi)}) is the gap between this plan and the best anyone could do with perfect foreknowledge of which scenario it
              would be — the ceiling on how much better any staffing policy could possibly get. <strong>VSS</strong> ({fmtPhp(data.vss)}) is the gap between this
              plan and the best FIXED plan built for one &quot;average&quot; incident instead of the real scenario spread — the evidence that solving this
              stochastically, rather than against a single mean duration, is worth doing.
            </p>
            <p style={{ margin: "8px 0 0", fontWeight: 600 }}>Assumptions</p>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {data.assumptions.map((a) => (
                <li key={a} style={{ marginBottom: 4 }}>{a}</li>
              ))}
            </ul>
            <p style={{ margin: "8px 0 0", fontWeight: 600 }}>Sensitivity</p>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)" }}>
              Recommended (units, max escalation) for unit-effect β and delay cost away from the values above — the two parameters that are pure assumptions,
              not measured figures.
            </p>
            <div style={{ overflowX: "auto", marginTop: 6 }}>
              <table className="inc-table" style={{ fontSize: "0.76rem" }}>
                <thead>
                  <tr>
                    <th>β</th>
                    <th>0.5x delay cost</th>
                    <th>1x (current)</th>
                    <th>2x delay cost</th>
                  </tr>
                </thead>
                <tbody>
                  {[0.1, 0.15, 0.25, 0.35, 0.5].map((b) => {
                    const row = data.sensitivity.filter((s) => s.beta === b);
                    const cell = (m: number) => {
                      const s = row.find((r) => r.delayCostMultiplier === m);
                      return s ? `${s.unitsAtDispatch}u${s.maxEscalation > 0 ? ` +${s.maxEscalation}` : ""}` : "—";
                    };
                    return (
                      <tr key={b}>
                        <td style={{ fontWeight: b === beta ? 700 : 500 }}>{b.toFixed(2)}</td>
                        <td className="is-muted">{cell(0.5)}</td>
                        <td style={{ fontWeight: 600 }}>{cell(1)}</td>
                        <td className="is-muted">{cell(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p style={{ margin: "12px 0 0", fontWeight: 600 }}>Sensitivity to Δ (response delay)</p>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)" }}>
              Δ feeds the derived coverage-opportunity cost (above) directly — how much it, and the recommendation, move with it.
            </p>
            <div style={{ overflowX: "auto", marginTop: 6 }}>
              <table className="inc-table" style={{ fontSize: "0.76rem" }}>
                <thead>
                  <tr>
                    <th>Δ (min)</th>
                    <th>Units, escalation</th>
                    <th>Derived cost/incident</th>
                  </tr>
                </thead>
                <tbody>
                  {data.deltaSensitivity.map((s) => (
                    <tr key={s.deltaResponseMin}>
                      <td style={{ fontWeight: s.deltaResponseMin === deltaResponseMin ? 700 : 500 }}>{s.deltaResponseMin}</td>
                      <td style={{ fontWeight: 600 }}>{s.unitsAtDispatch}u{s.maxEscalation > 0 ? ` +${s.maxEscalation}` : ""}</td>
                      <td className="is-muted">{fmtPhp(s.derivedCostPerUncoveredIncident)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        }
      />

      <DashboardChart option={option} height={320} />

      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, var(--bg-surface-hover) 100%, transparent)", border: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: RAG_COLOR[data.kpi.rag], flex: "none" }} />
          <span style={{ fontSize: "0.85rem" }}>
            Projected mean clearance <strong>{fmtMin(data.kpi.projectedMttr)}</strong> vs baseline <strong>{fmtMin(data.kpi.baselineMttr)}</strong>
            {" — "}
            <span style={{ color: RAG_COLOR[data.kpi.rag], fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>{data.kpi.rag}</span>
            {" "}against the {type} target ({data.kpi.targets.greenMax} / {data.kpi.targets.amberMax} min)
            {data.kpi.indicative && (
              <span style={{ marginLeft: 6, fontSize: "0.68rem", fontWeight: 700, color: "var(--color-warning)", border: "1px solid var(--color-warning)", borderRadius: 999, padding: "1px 6px" }}>
                INDICATIVE
              </span>
            )}
          </span>
        </div>
        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", paddingLeft: 20 }}>
          Metric: {data.kpi.metricLabel}
          {data.kpi.indicative && " — not a direct read of the manuscript's lane-clearance target; see Details."}
        </span>
      </div>

      <div className="inc-table-wrap">
        <table className="inc-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Probability</th>
              <th>Duration (raw)</th>
              <th>With protocol</th>
              <th>Queue delay</th>
              <th>Recourse</th>
            </tr>
          </thead>
          <tbody>
            {SCENARIO_ORDER.map((label) => {
              const s = data.scenarios.find((x) => x.label === label);
              if (!s) return null;
              return (
                <tr key={label}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{SCENARIO_TITLE[label]}</td>
                  <td className="is-muted">{(s.probability * 100).toFixed(0)}%</td>
                  <td className="is-muted">{fmtMin(s.durationMin)}</td>
                  <td style={{ fontWeight: 600 }}>{fmtMin(s.effectiveDurationMin)}</td>
                  <td className="is-muted">{s.delayVehHours.toFixed(1)} veh-hr</td>
                  <td>{s.recourseUnits > 0 ? <span className="inc-staffed">+{s.recourseUnits}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
