"use client";

import { useEffect, useState } from "react";
import type { EChartsOption } from "echarts";
import DashboardChart from "./DashboardChart";
import InfoTooltip from "./InfoTooltip";
import StateNote from "../stage/StateNote";
import { useChartTheme, seriesRamp } from "../../lib/chart-theme";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/**
 * Projected CO2 reduction by strategy — computed, replacing the three literals
 * ("Strategy X/Y/Z" at 8/14/22) this card used to carry behind an
 * "Illustrative" chip. Reads /api/emissions/prescriptive; the derivations and
 * the one negative result are in docs/emissions-optimiser-spec.md.
 *
 * The one thing this component must get right visually: two of the three bars
 * are bounded by what the corridor has ALREADY achieved, and one is a policy
 * target nothing in the record supports. Drawing all three the same colour
 * would quietly equate them, so the unbounded one is drawn hollow and says so
 * in its own line. That distinction is the whole reason the old chip existed.
 */

type Strategy = {
  key: "fleet_mix" | "clearance" | "deployment";
  label: string;
  reductionPct: number;
  reductionTonnes: number;
  lever: string;
  evidenceBounded: boolean;
  /** For a scenario: what the record does show, in one sentence. */
  evidenceNote?: string;
  /** Monte Carlo 5th–95th percentile, where the saving depends on which incidents happen. */
  range?: { lowTonnes: number; highTonnes: number; lowPct: number; highPct: number; runs: number } | null;
  assumptions: string[];
};

type Payload = {
  strategies: Strategy[];
  /** Strategies the Range cannot support, and why: left out, not drawn at 0%. */
  unavailable?: { key: Strategy["key"]; label: string; reason: string }[];
  /** Set when the Range holds no emissions at all. */
  noData?: string | null;
  basis: {
    from: string;
    to: string;
    actualCo2Tonnes: number;
    incidentsFrom: string | null;
    incidentsTo: string | null;
    incidentsCounted: number;
    recordFrom?: string;
    recordTo?: string;
  };
};

const fmtT = (n: number) => Math.round(n).toLocaleString("en-US");

/* The tonnes are over the Range, not per year. "A year" was printed whatever
 * the Range, which made a two-month figure read as an annual one. */
function over(from: string, to: string): string {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (!Number.isFinite(days) || days <= 0) return `over ${from} to ${to}`;
  if (days >= 360 && days <= 370) return "a year";
  if (days >= 28) return `over these ${Math.round(days / 30.44)} months`;
  return `over these ${days} days`;
}

export default function PrescriptiveEmissionsPanel({
  months,
  from,
  to,
}: {
  months: "3" | "12" | "all";
  from?: string;
  to?: string;
}) {
  const T = useChartTheme();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams();
    if (from && to) {
      qs.set("from", from);
      qs.set("to", to);
    } else {
      qs.set("months", months);
    }
    fetch(`${BACKEND}/api/emissions/prescriptive?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setData(json.data as Payload);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Request failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [months, from, to]);

  /* The evidence card's head: the title, ⓘ and intro that used to sit in
     page.tsx. Here so the loading, error and no-data states keep them. */
  const evidenceHead = (
    <div className="nc-em-card-head">
      <h3>
        Projected % Emission Reduction by Strategy
        <InfoTooltip text="Computed from the warehouse over the selected Range. Faster clearance and peak deployment are bounded by response times this corridor has already achieved; the heavy-vehicle bar is a policy target and is drawn hollow to say so. Emissions here are linear in volume with no congestion term, so shifting trips between hours saves nothing and is deliberately not offered as a strategy." />
      </h3>
      <p className="nc-em-context">
        CO₂ avoided per strategy, as a share of what the corridor actually emitted over the Range.
      </p>
    </div>
  );

  if (loading) {
    return (
      <article className="chart-card nc-em-span nc-em-rx-evidence">
        {evidenceHead}
        <p className="nc-em-loading">Computing strategies…</p>
      </article>
    );
  }
  if (error || !data) {
    return (
      <article className="chart-card nc-em-span nc-em-rx-evidence">
        {evidenceHead}
        <StateNote kind="error" title="Strategies unavailable">
          {error ?? "No data returned."}
        </StateNote>
      </article>
    );
  }
  // A Range with no emissions in it: say so, rather than draw three bars at
  // zero that would read as "nothing saves anything".
  if (data.noData) {
    return (
      <article className="chart-card nc-em-span nc-em-rx-evidence">
        {evidenceHead}
        <StateNote kind="nodata" title="No emissions data in this Range">
          <span style={{ display: "block", maxWidth: "78ch" }}>{data.noData}</span>
        </StateNote>
      </article>
    );
  }
  const unavailable = data.unavailable ?? [];

  // Largest first: the ranking is the finding, so it should not depend on the
  // order the service happens to return.
  const rows = [...data.strategies].sort((a, b) => b.reductionPct - a.reductionPct);

  /* Same teal step as before (the emissions ramp's middle step, per theme),
     read from the ramp rather than retyped. */
  const BAR = seriesRamp("emissions", T)[1];

  /* Ranked bars, drawn horizontally: the strategy names read on one line
     beside their bar instead of wrapping under it. Same bars, same order,
     same tooltip. */
  const option: EChartsOption = {
    grid: { left: 8, right: 56, top: 8, bottom: 34, containLabel: true },
    yAxis: {
      type: "category",
      inverse: true,
      data: rows.map((s) => s.label),
      axisTick: { show: false },
      axisLabel: { color: T.ink, fontSize: 11, interval: 0, width: 120, overflow: "break", lineHeight: 15 },
    },
    xAxis: {
      type: "value",
      name: "% of corridor CO₂",
      nameLocation: "middle",
      nameGap: 26,
      nameTextStyle: { color: T.text, fontSize: 11 },
      splitNumber: 4,
      axisLabel: { color: T.text, hideOverlap: true, formatter: (v: number) => `${v}%` },
      splitLine: { lineStyle: { color: T.split } },
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const p = (params as { dataIndex: number }[])[0];
        const s = rows[p.dataIndex];
        if (!s) return "";
        return (
          `<b>${s.label}</b><br/>` +
          `${s.reductionPct.toFixed(2)}% of corridor CO₂ &middot; ${fmtT(s.reductionTonnes)} t avoided<br/>` +
          (s.range
            ? `<span style="opacity:.8">Monte Carlo range (5th–95th of ${s.range.runs} runs): ${fmtT(s.range.lowTonnes)}–${fmtT(s.range.highTonnes)} t</span><br/>`
            : "") +
          `<span style="opacity:.8">${s.lever}</span><br/><br/>` +
          (s.evidenceBounded
            ? `<span style="opacity:.8">Bounded by what this corridor has already achieved.</span>`
            : `<b>Policy target — not demonstrated by any observed change.</b>`)
        );
      },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 26,
        data: rows.map((s) => ({
          value: s.reductionPct,
          itemStyle: s.evidenceBounded
            ? { color: BAR, borderRadius: [0, 4, 4, 0] }
            : // Hollow, so a scenario cannot be mistaken for a measured result.
              {
                color: "transparent",
                borderColor: BAR,
                borderWidth: 2,
                borderType: "dashed",
                borderRadius: [0, 4, 4, 0],
              },
        })),
        label: {
          show: true,
          position: "right",
          color: T.ink,
          fontSize: 11,
          fontFamily: T.fontFamily,
          formatter: (p: { value?: unknown }) => `${Number(p.value ?? 0).toFixed(2)}%`,
        },
      },
    ],
  };

  const scenario = rows.find((s) => !s.evidenceBounded);
  /* THE RECOMMENDATION.
   *
   * Three bars and a percentage is analysis, not advice — the tab is called
   * Prescriptive and was not prescribing anything. What an operator needs is
   * one named action, what it is worth, and what NOT to do.
   *
   * The pick is the largest EVIDENCE-BOUNDED strategy, deliberately not the
   * largest bar: the heavy-vehicle scenario is far bigger, but nothing in the
   * record ties a lower heavy share to anything NLEX controls (its lowest
   * months are holiday months), so leading with it would be recommending a
   * number rather than an action. */
  const doable = rows.filter((s) => s.evidenceBounded);
  const lead = doable[0] ?? null;
  const second = doable[1] ?? null;

  const period = over(data.basis.from, data.basis.to);
  const maxPct = Math.max(...rows.map((s) => s.reductionPct), 0.0001);

  /* Ranked action cards. Each answers first (tonnes avoided), then reads as
     labelled rows: Action, Where, When, Effect, Basis, Confidence. The full
     sentence each card replaced, and the service's own assumptions, sit
     behind Details on the same card. The order is the recommendation's: the
     lead, then the second, then the policy scenario. */
  type Tone = "lead" | "then" | "scenario";
  const ActionCard = ({
    s, rank, tone, tag, note, details,
  }: {
    s: Strategy; rank: number; tone: Tone; tag: string; note?: React.ReactNode; details: React.ReactNode;
  }) => (
    <li className="chart-card nc-em-acard" data-tone={tone}>
      <div className="nc-em-acard-answer">
        <div className="nc-em-acard-top">
          <span className="nc-em-acard-rank" aria-hidden="true">{rank}</span>
          <span className="nc-em-action-tag">{tag}</span>
          {s.evidenceBounded
            ? <span className="pill green">Evidence-bounded</span>
            : <span className="pill nc-em-pill-hollow">Policy target</span>}
        </div>
        <h3>{s.label}</h3>
        <p className="nc-em-answer">
          <b>{fmtT(s.reductionTonnes)} t</b>
          <span>CO₂ avoided {period}</span>
        </p>
      </div>
      <div className="nc-em-acard-body">
        <dl className="nc-em-rows">
          <div>
            <dt>Action</dt>
            <dd className="nc-em-cap">{s.lever}</dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>Corridor-wide</dd>
          </div>
          <div>
            <dt>When</dt>
            <dd>Estimated over {data.basis.from} to {data.basis.to}</dd>
          </div>
          <div>
            <dt>Effect</dt>
            <dd>
              <span className="nc-em-inline-bar" aria-hidden="true">
                <i
                  className={s.evidenceBounded ? "" : "is-hollow"}
                  style={{ width: `${Math.max(2, (s.reductionPct / maxPct) * 100)}%`, ["--bar-c" as string]: BAR }}
                />
              </span>
              {s.reductionPct.toFixed(2)}% of what the corridor emitted
            </dd>
          </div>
          <div>
            <dt>Basis</dt>
            <dd>
              {s.evidenceBounded
                ? "Bounded by response times this corridor has already delivered"
                : "Policy target — not demonstrated by any observed change"}
            </dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>
              {s.range
                ? <>Likely {fmtT(s.range.lowTonnes)}–{fmtT(s.range.highTonnes)} t · 5th–95th of {s.range.runs} Monte Carlo runs</>
                : "No Monte Carlo range returned for this strategy"}
            </dd>
          </div>
          {note && (
            <div className="is-note">
              <dt>Note</dt>
              <dd>{note}</dd>
            </div>
          )}
        </dl>
        <details className="nc-details">
          <summary>Details</summary>
          {details}
          {s.assumptions?.length ? (
            <ul className="nc-em-action-assumptions">
              {s.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : null}
        </details>
      </div>
    </li>
  );

  let rank = 0;

  return (
    <>
      {(lead || scenario) && (
        <ol className="nc-em-span nc-em-acards" aria-label="Recommended actions, ranked">
          {lead ? (
            <ActionCard
              s={lead}
              rank={++rank}
              tone="lead"
              tag="Do this"
              details={
                <p>
                  <b>{lead.label}.</b> {lead.lever}.{" "}
                  Worth <b>{fmtT(lead.reductionTonnes)} t</b> of CO₂ {period}
                  {lead.range && <> (likely {fmtT(lead.range.lowTonnes)}–{fmtT(lead.range.highTonnes)} t)</>}:{" "}
                  {lead.reductionPct.toFixed(2)}% of what the corridor emitted. Bounded by response times this corridor has{" "}
                  <b>already delivered</b>, so it asks for no capability it does not have.
                </p>
              }
            />
          ) : (
            <li className="chart-card nc-em-acard" data-tone="none">
              <div className="nc-em-acard-answer">
                <div className="nc-em-acard-top">
                  <span className="nc-em-acard-rank" aria-hidden="true">—</span>
                  <span className="nc-em-action-tag">Nothing to do yet</span>
                </div>
              </div>
              <div className="nc-em-acard-body">
                <p className="nc-em-action-text">
                  No evidence-bounded strategy can be computed for this Range. {unavailable[0]?.reason}
                </p>
              </div>
            </li>
          )}

          {second && (
            <ActionCard
              s={second}
              rank={++rank}
              tone="then"
              tag="Then"
              note={<><b>Do not add these two together.</b> It is a subset of #1, not an addition.</>}
              details={
                <p>
                  <b>{second.label}</b> — {second.lever} — worth {fmtT(second.reductionTonnes)} t.{" "}
                  <b>Do not add these two together.</b> This one applies the same clearance floor to fewer hours, so it
                  is a subset of the first, not an addition to it.
                </p>
              }
            />
          )}

          {scenario && (
            <ActionCard
              s={scenario}
              rank={++rank}
              tone="scenario"
              tag="Not on this evidence"
              note={<>Far the largest figure, but a policy question for MPTC, not an operational one.</>}
              details={
                <>
                  <p>
                    <b>{scenario.label}</b> would be worth {fmtT(scenario.reductionTonnes)} t — far the largest figure
                    here — but it is a policy question for MPTC, not an operational one. {scenario.evidenceNote}
                  </p>
                  <p><b>Policy target — not demonstrated by any observed change.</b></p>
                </>
              }
            />
          )}
        </ol>
      )}

      <article className="chart-card nc-em-span nc-em-rx-evidence">
        {evidenceHead}
        <figure className="nc-em-rx-chart">
          <figcaption className="nc-em-rx-chart-head">
            <span>Ranked by size</span>
            <span className="nc-em-rx-key">
              <span><i className="is-solid" style={{ background: BAR }} />Evidence-bounded</span>
              <span><i className="is-hollow" style={{ borderColor: BAR }} />Policy target (hollow)</span>
            </span>
          </figcaption>
          <DashboardChart option={option} height={Math.max(180, rows.length * 62 + 50)} />
        </figure>

        {/* The basis, as labelled rows rather than a paragraph. */}
        <dl className="nc-em-rows nc-em-basis-rows">
          <div>
            <dt>Actually emitted</dt>
            <dd>{fmtT(data.basis.actualCo2Tonnes)} t over {data.basis.from} to {data.basis.to}</dd>
          </div>
          {unavailable.length > 0 ? (
            <div className="is-note">
              <dt>Not computed</dt>
              <dd>
                <b>Not computed for this Range:</b> {unavailable.map((u) => u.label).join(" and ")}. {unavailable[0].reason}
              </dd>
            </div>
          ) : (
            <div>
              <dt>Incidents</dt>
              <dd>{data.basis.incidentsCounted.toLocaleString()} cleared incidents in the same window</dd>
            </div>
          )}
        </dl>
        <details className="nc-details">
          <summary>How this is measured</summary>
          <p>
            Against {fmtT(data.basis.actualCo2Tonnes)} t actually emitted over {data.basis.from} to {data.basis.to}.
            {unavailable.length === 0 && (
              <>
                {" "}Incident-based strategies use {data.basis.incidentsCounted.toLocaleString()} cleared incidents in the
                same window.
              </>
            )}
          </p>
          {scenario && (
            <p>
              <b>{scenario.label}</b> is drawn hollow because it is a policy target, not a demonstrated change. The
              other two are bounded by response times already delivered on this corridor, and their ranges come from a
              Monte Carlo resampling of the incidents.
            </p>
          )}
        </details>
      </article>
    </>
  );
}
