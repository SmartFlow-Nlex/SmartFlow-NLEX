"use client";

/* The Traffic Prescriptive tab: three panels, one per row of the analytics
 * diagram, each acting on the Predictive tab's own forecast.
 *
 * They live in one file because they share a single cached fetch and a single
 * decision-logic module; splitting them would triple the boilerplate without
 * separating anything that is actually independent.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import SignalGlyph from "./SignalGlyph";
import InfoTooltip from "./InfoTooltip";
import StateNote from "../stage/StateNote";
import {
  loadForecast, championValue, topsisRank, manilaDate, loadPrescriptive,
  type ForecastPayload, type TrafficPrescriptive, type BoothHour,
} from "./prescriptiveTraffic.shared";

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtHour = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function useForecast() {
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadForecast()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => { alive = false; };
  }, []);
  return { data, error };
}

/* Night Corridor chrome for the three panels: a near-opaque card with a
   hairline, a 20 px headline with its method behind (i), and the panel's
   own controls on the same line. */
function Shell({ title, hint, children, right }: {
  title: string; hint: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <article className="chart-card wide nct-card">
      <div className="nct-card-head-split">
        <h3 className="nct-title">
          {title} <InfoTooltip text={hint} />
        </h3>
        {right}
      </div>
      {children}
    </article>
  );
}

const Banner = ({ tone = "info", children }: { tone?: "info" | "alert"; children: React.ReactNode }) => (
  <div className={`nct-banner${tone === "alert" ? " is-alert" : ""}`}>
    {tone === "alert" && <AlertTriangle size={18} strokeWidth={2} aria-hidden="true" className="nct-banner-icon" />}
    <div className="nct-banner-text">{children}</div>
  </div>
);

/* Empty, loading and error states keep their words; the mascot only
   decorates them (headlights dimmed for "no data", hazards for errors). */
const Empty = ({ msg }: { msg: string }) => {
  const kind = /unavailable/i.test(msg) ? "error" : /…$/.test(msg) ? "loading" : "nodata";
  return (
    <article className="chart-card wide nct-card nct-empty-card">
      <StateNote kind={kind} role={kind === "error" ? "alert" : undefined}>{msg}</StateNote>
    </article>
  );
};

const Foot = ({ children }: { children: React.ReactNode }) => (
  <p className="nct-foot">{children}</p>
);

/** One recommended action: what to do, where, when, the expected effect and
 *  its basis, and how sure. Fields the data does not carry are left out
 *  rather than filled in; the basis and reasoning sit behind Details. */
function ActionCard({ rank, signal, tag, tone = "info", action, lead, facts, details }: {
  rank?: number;
  signal?: "clear" | "slow" | "congested" | "none";
  tag?: ReactNode;
  tone?: "info" | "act" | "prepare" | "alert";
  action: ReactNode;
  lead?: ReactNode;
  facts: { k: string; v: ReactNode }[];
  details?: ReactNode;
}) {
  return (
    <div className={`nct-action is-${tone}`}>
      {rank != null && <span className="nct-action-rank" aria-label={`Rank ${rank}`}>{rank}</span>}
      <div className="nct-action-main">
        {(signal || tag) && (
          <div className="nct-action-tag">
            {signal && <SignalGlyph state={signal} size={20} title="" />}
            {tag}
          </div>
        )}
        <p className="nct-action-title">{action}</p>
        {lead && <p className="nct-action-lead">{lead}</p>}
        {facts.length > 0 && (
          <dl className="nct-action-facts">
            {facts.map((f) => (
              <div key={f.k}>
                <dt>{f.k}</dt>
                <dd>{f.v}</dd>
              </div>
            ))}
          </dl>
        )}
        {details && (
          <details className="nc-details nct-action-details">
            <summary>Details</summary>
            <div>{details}</div>
          </details>
        )}
      </div>
    </div>
  );
}

/* ==================================================================== 1 ====
 * Booth staffing plan, per plaza, per hour.
 *
 * The model moved to the backend (traffic-prescriptive.service.ts). Two things
 * were wrong with computing it here:
 *
 *   - it ran on props the DESCRIPTIVE tab happened to have loaded, so the
 *     recommendation changed when the operator moved a date range that has
 *     nothing to do with next week's staffing, and
 *   - it only ever covered each plaza's single busiest hour, because that is
 *     all the page had. "How many booths at 10am" had no answer.
 *
 * The server returns the full 24-hour profile per plaza, split weekday from
 * weekend, so the shift plan below is real. Throughput is still the operator's
 * dial; everything else is measured.
 */

function usePrescriptive(throughput: number) {
  const [data, setData] = useState<TrafficPrescriptive | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    setData(null);
    setError(null);
    loadPrescriptive(throughput)
      .then((d) => { if (!off) setData(d); })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [throughput]);
  return { data, error };
}

/** A 24-cell strip: one block per hour, height by booths needed. Where that
 *  is more than the plaza can open, the excess is hatched red on top: needed,
 *  but there is no booth for it. */
function HourStrip({ hours, peakHour, max }: { hours: BoothHour[]; peakHour: number; max: number }) {
  return (
    <div className="nct-hourstrip">
      {hours.map((h) => {
        const frac = max > 0 ? h.need / max : 0;
        const short = h.need - h.staffed;
        const isPeak = h.hour === peakHour;
        return (
          <div
            key={h.hour}
            title={
              `${fmtHour(h.hour)} — ${h.need} booth${h.need === 1 ? "" : "s"} for ${fmtInt(h.demand)} vehicles` +
              (short > 0 ? `; ${h.staffed} can open, so about ${fmtInt(h.unmet)} vehicles queue` : "")
            }
            style={{
              height: `${Math.max(8, frac * 100)}%`,
              display: "flex", flexDirection: "column",
              borderRadius: "2px 2px 0 0", overflow: "hidden",
            }}
          >
            {short > 0 && (
              <div style={{ flex: short, background: "repeating-linear-gradient(135deg, var(--color-danger) 0 2px, transparent 2px 4px)" }} />
            )}
            <div style={{
              flex: Math.max(1, h.staffed),
              background: isPeak ? "var(--page-accent)" : "color-mix(in srgb, var(--page-accent) 45%, transparent)",
            }} />
          </div>
        );
      })}
    </div>
  );
}

const listOf = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

export function BoothStaffingPanel() {
  const [rate, setRate] = useState(350);
  const [view, setView] = useState<"week" | "hour">("week");
  const [showAll, setShowAll] = useState(false);
  const { data, error } = usePrescriptive(rate);

  if (error) return <Empty msg={`Prescriptive traffic unavailable: ${error}`} />;
  if (!data) return <Empty msg="Computing the staffing plan…" />;
  if (data.week.length === 0 || !data.shiftPlan) return <Empty msg="No future days in the volume forecast." />;
  if (data.shiftPlan.plazas.length === 0) return <Empty msg="No plaza volumes are recorded to apportion the forecast with." />;

  const days = data.week;
  const plan = data.shiftPlan;
  const first = days[0];

  // Week table: booths to open at each plaza's peak, per day, ordered by the
  // busiest. "To open", not "needed": a plaza cannot open booths it does not
  // have, and where it would need more, the cell says so.
  const plazaNames = plan.plazas.map((p) => p.plaza);
  const byDay = new Map(days.map((d) => [d.date, new Map(d.plazas.map((p) => [p.plaza, p]))] as const));
  const rows = plazaNames.map((name) => {
    const p = plan.plazas.find((x) => x.plaza === name)!;
    const each = days.map((d) => byDay.get(d.date)!.get(name) ?? null);
    return {
      plaza: name,
      peakHour: p.peakHour,
      typical: p.typicalPeakStaffed,
      booths: p.booths,
      boothBasis: p.boothBasis,
      need: each.map((x) => x?.peakStaffed ?? 0),
      short: each.map((x) => x?.worstUnmet ?? null),
    };
  });
  const visible = showAll ? rows : rows.slice(0, 8);

  const corridorTypical = rows.reduce((s, r) => s + r.typical, 0);
  const biggest = [...rows].sort((a, b) => (b.need[0] - b.typical) - (a.need[0] - a.typical))[0];
  const daysUp = days.filter((_, i) => rows.some((r) => r.need[i] > r.typical)).length;
  const hourMax = Math.max(1, ...plan.plazas.flatMap((p) => p.hours.map((h) => h.need)));
  // Demand that every booth open would still not clear: worst first, and how
  // many other plaza-days run past their booths too.
  const worst = data.overCapacity[0] ?? null;
  const overDays = new Set(data.overCapacity.map((o) => `${o.date}|${o.plaza}`)).size;
  const noBooths = data.basis.plazasWithoutBooths;

  const Toggle = (
    <div className="nct-pills" role="group" aria-label="Plan view">
      {(["week", "hour"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          aria-pressed={view === v}
          className={`nct-pill-btn${view === v ? " is-on" : ""}`}
        >
          {v === "week" ? "Week ahead" : "Hour by hour"}
        </button>
      ))}
    </div>
  );

  return (
    <Shell
      title="Booth Staffing Plan"
      hint="Corridor forecast apportioned to each plaza by its measured share of volume, then across the day by that plaza's own hourly profile, split weekday from weekend. Divided by what one booth serves, and capped at the booths each plaza has (OpenStreetMap): demand beyond them is shown as queuing, not as booths that do not exist. Throughput is the one figure you set; the rest is measured."
      right={
        <div className="nct-panel-controls">
          {Toggle}
          <label className="nct-range">
            <span className="nct-range-head">
              <span>One booth serves</span><b>{rate} veh/hr</b>
            </span>
            <input type="range" min={150} max={800} step={25} value={rate}
              onChange={(e) => setRate(Number(e.target.value))} />
          </label>
        </div>
      }
    >
      <ActionCard
        rank={1}
        tag={<span className="nct-action-kicker">Staffing</span>}
        action={<>Open {first.totalPeakBooths} booths across the corridor at the peak</>}
        facts={[
          { k: "When", v: shortDay(first.date) },
          ...(first.totalPeakBooths !== corridorTypical
            ? [{ k: "Change", v: <>{first.totalPeakBooths > corridorTypical ? "+" : "\u2212"}{Math.abs(first.totalPeakBooths - corridorTypical)} versus a typical day</> }]
            : []),
          ...(biggest && biggest.need[0] !== biggest.typical
            ? [{ k: "Largest change", v: <><b>{biggest.plaza}</b> ({biggest.typical} → {biggest.need[0]}, peak {fmtHour(biggest.peakHour)})</> }]
            : []),
          {
            k: "Week ahead",
            v: daysUp > 0
              ? <>{daysUp} of the next {days.length} days need more than typical staffing somewhere on the corridor.</>
              : <>No day in the next {days.length} exceeds typical staffing anywhere.</>,
          },
        ]}
      />

      {worst && (
        <ActionCard
          tone="alert"
          tag={<span className="nct-action-kicker nct-bad">Not enough booths</span>}
          action={<>Divert traffic or post an advisory at {worst.plaza}</>}
          facts={[
            { k: "When", v: <>{shortDay(worst.date)} at {fmtHour(worst.hour)}</> },
            { k: "Where", v: <><b>{worst.plaza}</b>&apos;s {worst.where} booths</> },
            { k: "Effect", v: <>About <b>{fmtInt(worst.vehicles)} vehicles an hour</b> queue with every one of them open</> },
            { k: "Basis", v: <>Would need {worst.need} booths; there are {worst.booths}. Staffing cannot clear that.</> },
            ...(overDays > 1
              ? [{ k: "This week", v: <>{overDays - 1} more plaza-day{overDays - 1 === 1 ? "" : "s"} run past their booths too, marked <b className="nct-bad">!</b> below</> }]
              : []),
          ]}
        />
      )}

      {view === "hour" ? (
        <>
          <div className="nct-panel-intro nct-hour-head">
            <span>
              Booths needed hour by hour on <b>{shortDay(plan.date)}</b> ({plan.dayType})
              <InfoTooltip text={`Plazas do not peak together — the tallest bar is each plaza's own busiest hour.${plan.plazas.some((p) => p.unmetVehicles > 0) ? " Red hatching is need beyond the booths the plaza has." : ""}`} />
            </span>
            <span className="nct-key">
              <span className="nct-key-item"><i style={{ background: "var(--page-accent)" }} />Peak hour</span>
              <span className="nct-key-item"><i style={{ background: "color-mix(in srgb, var(--page-accent) 45%, transparent)" }} />Other hours</span>
              {plan.plazas.some((p) => p.unmetVehicles > 0) && (
                <span className="nct-key-item"><i className="nct-hatch" />Need beyond booths</span>
              )}
            </span>
          </div>
          <div className="nct-hour-rows">
            {(showAll ? plan.plazas : plan.plazas.slice(0, 8)).map((p) => (
              <div key={p.plaza} className="nct-hour-row">
                <div className="nct-hour-name">
                  {p.plaza}
                  <span>{p.sharePct}% of corridor</span>
                </div>
                <HourStrip hours={p.hours} peakHour={p.peakHour} max={hourMax} />
                <div className="nct-hour-peak" title={p.boothBasis}>
                  peak <b>{p.peakStaffed}</b>
                  {p.booths != null && <> of {p.booths}</>} at {fmtHour(p.peakHour)}
                  {p.worstUnmet && (
                    <span className="nct-hour-queue">
                      {fmtInt(p.worstUnmet.vehicles)}/h queue at {fmtHour(p.worstUnmet.hour)}
                      {/* Which booths: a plaza can have spare booths on one side while the other is full. */}
                      {p.worstUnmet.where && (
                        <span>{p.worstUnmet.where} full</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="nct-table-wrap">
          <table className="nct-table nct-booth-table">
            <thead>
              <tr>
                <th>Plaza</th>
                <th>Peak hour</th>
                <th className="num">Booths</th>
                <th className="num">Typical</th>
                {days.map((d) => (
                  <th key={d.date} className="num">
                    {new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
                    <span className="nct-th-sub">
                      {new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.plaza}>
                  <td className="strong" style={{ whiteSpace: "nowrap" }}>{r.plaza}</td>
                  <td className="dim" style={{ whiteSpace: "nowrap" }}>{fmtHour(r.peakHour)}</td>
                  <td
                    title={r.booths != null ? r.boothBasis : "No toll booths mapped in OpenStreetMap: not capped"}
                    className="num nct-dim"
                  >
                    {r.booths ?? "—"}
                  </td>
                  <td className="num dim">{r.typical}</td>
                  {r.need.map((n, i) => {
                    const delta = n - r.typical;
                    const short = r.short[i];
                    return (
                      <td key={days[i].date}
                        title={short ? `At ${fmtHour(short.hour)} the ${short.where ?? "plaza's"} booths are full: about ${fmtInt(short.vehicles)} vehicles an hour queue with every one of them open.` : undefined}
                        className={`num${delta !== 0 ? " strong" : ""}${delta > 0 ? " nct-bad" : delta < 0 ? " nct-ok" : ""}${delta > 0 || short ? " nct-cell-hot" : ""}`}>
                        {n}{delta !== 0 && <span className="nct-cell-delta">{delta > 0 ? `+${delta}` : delta}</span>}
                        {short && <b className="nct-bad nct-cell-flag">!</b>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 8 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="btn-muted" style={{ alignSelf: "flex-start" }}>
          {showAll ? "Show the 8 busiest" : `Show all ${rows.length} plazas`}
        </button>
      )}

      <div className="nct-basis">
        <span className="nct-kv-k">Basis</span>
        <span>
          {data.champion.model ?? "champion"} forecast
          {data.champion.wmapePct != null && <> · WMAPE {data.champion.wmapePct}%</>}
        </span>
        {!data.champion.accepted && (
          <span className="pill amber">Failed its acceptance gate · level less certain</span>
        )}
      </div>
      {data.basis.forecastFrom && data.basis.profileTo && data.basis.forecastFrom <= data.basis.profileTo && (
        <Banner tone="alert">
          <b>Its first day, {data.basis.forecastFrom}, is already inside the record, which now runs to {data.basis.profileTo}:</b>{" "}
          this plan is for days already past. Retrain the volume models to plan the coming week.
        </Banner>
      )}
      <details className="nc-details">
        <summary>How this is measured</summary>
        <div>
      <Foot>
        Volume is the {data.champion.model ?? "champion"} forecast
        {data.champion.wmapePct != null && <> (WMAPE {data.champion.wmapePct}%)</>}
        {!data.champion.accepted && <>, which did <b>not</b> pass its acceptance gate — the staffing SHAPE comes from measured profiles, the level it is scaled to is less certain</>}.
        {data.basis.forecastFrom && data.basis.profileTo && data.basis.forecastFrom <= data.basis.profileTo ? (
          // Traffic was loaded after the model was trained: the "week ahead" is then a stretch the record already holds.
          <> <b>Its first day, {data.basis.forecastFrom}, is already inside the record, which now runs to {data.basis.profileTo}:
          the model was trained before the latest traffic was loaded, so this plan is for days already past. Retrain the volume models to plan the coming week.</b>{" "}</>
        ) : (
          <> Its first day, {data.basis.forecastFrom}, follows the last recorded day.{" "}</>
        )}
        Profiles measured over {data.basis.profileFrom} to {data.basis.profileTo} across {data.basis.plazasProfiled} plazas.
        Booth counts are from {data.basis.boothsFrom}, since the warehouse holds none: each plaza&apos;s booths for the movement
        that pays there, per carriageway where known
        {noBooths.length > 0 && <>; {listOf(noBooths)} {noBooths.length === 1 ? "has" : "have"} none mapped, so {noBooths.length === 1 ? "it is" : "they are"} not capped</>}.
        Booth throughput is the one figure that is yours to set.
      </Foot>
        </div>
      </details>
    </Shell>
  );
}

/* ==================================================================== 2 ====
 * Congestion response advisory.
 */
export function CongestionResponsePanel() {
  /* The fuzzy controller runs server-side now (traffic-prescriptive.service.ts)
     against the same forecast rows this panel used to read. Same memberships,
     same nine rules, same centroid defuzzification — verified against an
     independent reimplementation on all 20 segments before this was switched
     over, because moving a model is only safe if it still gives the same
     answer. Throughput is irrelevant to this half, so the default is fine. */
  const [showRest, setShowRest] = useState(false);
  const { data, error } = usePrescriptive(350);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.congestion.map((c) => ({
      segment: c.segment,
      km: c.km ?? 0,
      // The server reports the hour its winning row came from, and always as
      // the probability of HIGH, so these read the same way round as before.
      first: c.hoursAhead,
      peak: c.probability,
      peakHour: c.hoursAhead,
      urgency: c.urgency,
      label: c.label,
    }));
  }, [data]);

  if (error) return <Empty msg={`Prescriptive traffic unavailable: ${error}`} />;
  if (!data) return <Empty msg="Ranking segments…" />;
  if (rows.length === 0) return <Empty msg="No congestion forecast available." />;

  const act = rows.filter((r) => r.label === "Act");
  const prepare = rows.filter((r) => r.label === "Prepare");
  const top = act.slice(0, 3);
  const rest = rows.filter((r) => !top.includes(r) && r.label !== "Monitor");
  const lead = top.length ? Math.min(...top.map((r) => r.first ?? 99)) : null;
  // A segment with no forecast rows is not a quiet segment. It is named, and
  // "corridor clear" is not said while any is missing.
  const missing = data.congestionMissing ?? [];

  const ACTION: Record<string, string> = {
    Act: "Deploy counter-flow and post VMS advisories before the first High hour.",
    Prepare: "Stage units nearby; hold the advisory until probability firms up.",
    Monitor: "No action; re-check next cycle.",
  };
  const tone = (l: string) => (l === "Act" ? "var(--color-danger)" : l === "Prepare" ? "var(--color-warning)" : "var(--text-muted)");
  // Km-post as served, for the "where" of each card (null stays unknown).
  const kmOf = (segment: string) => data.congestion.find((c) => c.segment === segment)?.km ?? null;
  const urgencyOf = (segment: string) => data.congestion.find((c) => c.segment === segment)?.urgency ?? null;

  return (
    <Shell
      title="Congestion Response Advisory"
      hint="Ranks segments by how likely High congestion is and how soon, through a fuzzy controller so a segment near a threshold reads as near a threshold rather than flipping an alert on and off. Counter-flow is disruptive and scarce, so the advisory goes to the three most urgent; the rest are listed, not alerted."
    >
      <Banner tone={act.length ? "alert" : "info"}>
        {top.length > 0 ? (
          <>
            <b className="nct-bad">Operator alert:</b> severe congestion predicted
            {lead != null && lead < 99 && <> within <b>{lead}h</b></>} — counter-flow advisory for{" "}
            <b>{top.map((r) => r.segment).join(", ")}</b>.
            {rest.length > 0 && <> {rest.length} more segment{rest.length === 1 ? "" : "s"} elevated but not advised.</>}
          </>
        ) : prepare.length > 0 ? (
          <><b>No segment reaches Act.</b> {prepare.length} at Prepare — stage, don&apos;t intervene.</>
        ) : missing.length > 0 ? (
          <><b>No forecast segment crosses Prepare</b> inside the 12-hour horizon, but {missing.length} segment{missing.length === 1 ? " has" : "s have"} no forecast at all.</>
        ) : (
          <><b>Corridor clear.</b> No segment crosses Prepare inside the 12-hour horizon.</>
        )}
      </Banner>

      {/* Ranked action cards: the action, where, when, how sure; the basis
          behind Details. */}
      <div className="nct-actions nct-actions-3">
        {(top.length ? top : rows.slice(0, 3)).map((r, i) => {
          const km = kmOf(r.segment);
          const urgency = urgencyOf(r.segment);
          return (
            <ActionCard
              key={r.segment}
              rank={i + 1}
              tone={r.label === "Act" ? "act" : r.label === "Prepare" ? "prepare" : "info"}
              signal={r.label === "Act" ? "congested" : r.label === "Prepare" ? "slow" : "none"}
              tag={<span className="nct-action-label" style={{ color: tone(r.label) }}>{r.label}</span>}
              action={ACTION[r.label]}
              facts={[
                { k: "Where", v: <><b>{r.segment}</b>{km != null && <span className="nct-dim"> · km {km}</span>}</> },
                ...(r.first != null
                  ? [
                      { k: "When", v: <>First High <b>+{r.first}h</b></> },
                      { k: "Confidence", v: <>Peak <b>{Math.round(r.peak * 100)}%</b> at +{r.peakHour}h</> },
                    ]
                  : [{ k: "When", v: <span style={{ fontStyle: "italic" }}>Never reaches High inside the horizon</span> }]),
              ]}
              details={
                <>
                  Ranked by the fuzzy controller from how likely High congestion is and how soon
                  {urgency != null && <> (urgency <b>{urgency.toFixed(2)}</b>)</>}, from the congestion forecast on the
                  Predictive tab. Counter-flow goes to the three most urgent segments only.
                </>
              }
            />
          );
        })}
      </div>

      {rest.length > 0 && (
        <div className="nct-panel-intro">
          <button type="button" onClick={() => setShowRest((v) => !v)} className="nct-link-btn" aria-expanded={showRest}>
            {showRest ? "Hide" : "Show"} the {rest.length} elevated segment{rest.length === 1 ? "" : "s"} not advised
          </button>
          {showRest && (
            <div className="nct-chip-row" style={{ marginTop: 10 }}>
              {rest.map((r) => (
                <span key={r.segment} className="nct-mini-chip">
                  <b style={{ color: tone(r.label) }}>{r.label}</b> · {r.segment}{r.first != null && <> · +{r.first}h</>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {missing.length > 0 && (
        <div className="nct-panel-intro">
          <b className="nct-warn">No forecast:</b> {listOf(missing)}. Not ranked, and not clear either:
          treat {missing.length === 1 ? "it" : "them"} as unknown until the congestion model next runs.
        </div>
      )}

      <details className="nc-details">
        <summary>How this is measured</summary>
        <div>
          <Foot>
            A volume-to-capacity ratio is not shown: it needs lane capacity, and no capacity or lane-count column exists anywhere in
            the warehouse. The predicted congestion state is what the data supports.
          </Foot>
        </div>
      </details>
    </Shell>
  );
}

/* ==================================================================== 3 ====
 * Event intervention ranking.
 */
export function EventInterventionPanel() {
  const { data, error } = useForecast();
  const ranked = useMemo(() => (data ? topsisRank(data.events) : []), [data]);

  if (error) return <Empty msg={`Forecast unavailable: ${error}`} />;
  if (!data) return <Empty msg="Loading forecast…" />;
  if (ranked.length === 0) return <Empty msg="No event surge forecast available." />;

  // The next scheduled Arena day, named so the plan can say what it is for.
  // The per-exit forecast for it lives on the Predictive tab's Event Surge
  // card, where a prediction belongs; this panel is the action on it.
  const next = (data.upcomingEvents ?? [])[0] ?? null;

  const top = ranked.slice(0, 3);
  const totalExtra = top.reduce((s, r) => s + r.extraVehicles, 0);
  const anchor = data.events.find((e) => e.material)?.anchorExit ?? null;
  const confidence = (w: number) => (w < 0.05 ? "firm" : w < 0.12 ? "fair" : "loose");

  return (
    <Shell
      title="Event Intervention Ranking"
      hint="Ranks exits for event-day intervention by closeness to an ideal option across four criteria: vehicles moved, uplift over baseline, how many events the estimate rests on, and the width of its confidence interval as a penalty (TOPSIS)."
    >
      <ActionCard
        rank={1}
        tag={<span className="nct-action-kicker">Event plan</span>}
        action={<>Event traffic management plan: {top.map((r) => r.exit).join(", ")}.</>}
        lead={<>Deploy patrol and advisory resources here first{anchor ? <> — the surge is anchored on {anchor}</> : null}.</>}
        facts={[
          { k: "Expected load", v: <>On an event day these three exits carry <b>{fmtInt(totalExtra)}</b> extra vehicles between them.</> },
          ...(next
            ? [{
                k: "Next up",
                v: <><b>{next.title.split(" - ")[0]}</b> on{" "}
                  <b>{new Date(`${next.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</b>
                  {next.isDerived ? " (recurring, inferred)" : ""}.</>,
              }]
            : []),
          { k: "Estimate", v: top.map((r) => `${r.exit}: ${confidence(r.uncertainty)}`).join(" · ") },
        ]}
      />

      <div className="nct-table-wrap">
        <table className="nct-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Exit</th>
              <th className="num">Extra vehicles</th>
              <th className="num">Uplift</th>
              <th className="num">Events seen</th>
              <th>Estimate</th>
              <th className="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {ranked.slice(0, 10).map((r) => (
              <tr key={r.exit} className={r.rank <= 3 ? "nct-row-top" : undefined}>
                <td className={`strong${r.rank <= 3 ? " nct-accent" : " nct-dim"}`}>{r.rank}</td>
                <td className="strong">{r.exit}</td>
                <td className="num">{fmtInt(r.extraVehicles)}</td>
                <td className="num">{r.uplift.toFixed(2)}×</td>
                <td className="num">{r.evidence}</td>
                <td className="dim">{confidence(r.uncertainty)} <span className="nct-dim">(±{(r.uncertainty / 2).toFixed(2)})</span></td>
                <td className="num strong">{r.closeness.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dated forecasts for the next Arena events. The ranking above says which
          exits matter on an event day in general; this says what to expect on a
          specific date -- the measured uplift applied to that weekday-in-that-
          month's baseline, the same construction the Predictive tab uses when
          given a date. */}
      <details className="nc-details">
        <summary>How this is measured</summary>
        <div>
          <Foot>
            Criteria weighted 0.40 vehicles / 0.25 uplift / 0.20 evidence / 0.15 interval width. &ldquo;Estimate&rdquo; reads the
            uplift interval: firm under ±0.025, fair under ±0.06. The per-exit forecast for each upcoming Arena date is on the
            Predictive tab&apos;s Event Surge card; this ranking is the deployment order for whichever date is chosen there.
          </Foot>
        </div>
      </details>
    </Shell>
  );
}
