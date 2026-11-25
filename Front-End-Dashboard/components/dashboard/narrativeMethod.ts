/**
 * "How it is computed" for every Narrative Explanation (24 Nov 2026, user request).
 *
 * Written here, not by the language model: the AI summary reads the figures, but how those figures are produced
 * is a fact of the pipeline, and a model asked to describe a method can describe the wrong one. Each card gets:
 *
 *   method   what is measured and how, as the card's own code and endpoint document it;
 *   reading  this card's own figures in plain words (computed from the request body, never typed in);
 *   choice   why the model shown is the one in use, and why the others are not, from the same rows.
 *
 * A figure that is missing drops its sentence; nothing is filled in by hand.
 */

type Body = Record<string, unknown>;
export type MethodSections = { method: string[]; reading: string[]; choice: string[] };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const day = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
const pct = (v: number | null, d = 1) => (v == null ? null : `${v.toFixed(d)}%`);
/** A share that may arrive as 0–1 or as 0–100, as a percentage. */
const asPct = (v: number | null) => (v == null ? null : v <= 1 ? v * 100 : v);
const fmtN = (v: number, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const rows = (v: unknown): Body[] => (Array.isArray(v) ? (v as Body[]) : []);
const empty = (): MethodSections => ({ method: [], reading: [], choice: [] });

/** "0.77: its misses are 23% smaller than <baseline>'s", or larger. */
function ratioReading(name: string, v: number, baseline: string): string {
  const d = Math.round(Math.abs(1 - v) * 100);
  if (d < 1) return `${name} ${v.toFixed(3)}: about the same error as ${baseline}.`;
  return `${name} ${v.toFixed(3)}: its misses are ${d}% ${v < 1 ? "smaller" : "larger"} than those of ${baseline}.`;
}

function forecast(b: Body, label: (m: string) => string): MethodSections {
  const q = str(b.quantity) ?? "volume";
  const scored = num(b.scoredDays);
  const from = day(str(b.windowStart));
  const to = day(str(b.windowEnd));
  const h = num(b.horizonDays);
  const unit = q === "emissions" ? "tonnes of CO₂" : q === "incidents" ? "incidents" : "vehicles";
  const perDay = q === "emissions" ? "t" : q === "incidents" ? "incidents" : "vehicles";
  const baseline = q === "emissions" ? "the best simple baseline" : q === "incidents" ? "the naive weekly baseline" : "repeating the same day last week";
  const s = empty();

  s.method.push(
    `Tested on days the models never saw${scored != null ? `: ${fmtN(scored)} days` : ""}${from && to ? `, ${from} to ${to}` : ""}${h != null ? `, each forecast up to ${h} day${h === 1 ? "" : "s"} ahead` : ""}. Each model is fitted only on earlier days, then compared with what actually happened.`,
  );
  s.method.push(`WMAPE = total of the daily misses ÷ total actual ${unit} × 100. MAE = average miss per day. RMSE = the same, with large misses weighted more.`);
  s.method.push("R² = 1 − (squared misses ÷ squared spread of the actual days around their average): the share of the ups and downs explained.");
  s.method.push(
    q === "emissions"
      ? "MASE = the model's WMAPE ÷ the best simple baseline's WMAPE on the same days; below 1 beats it."
      : `MASE = the model's error ÷ the error of ${baseline} on the same days; below 1 beats it.`,
  );
  if (q === "emissions")
    s.method.push("CO₂ is not measured: it is the traffic series × the per-class EMEP/EEA Guidebook 2023 emission factors × the distance each trip drove.");
  const w = str(b.weatherMode);
  if (w) s.method.push(w === "with" ? "Scores are for the models given rainfall as an input." : "Scores are for the models without weather input.");

  const ms = rows(b.metrics);
  const lead =
    ms.find((m) => num(m.rank) === 1) ??
    [...ms].filter((m) => m.accepted !== false && num(m.wmape) != null).sort((x, y) => num(x.wmape)! - num(y.wmape)!)[0] ??
    null;
  if (lead) {
    const name = label(String(lead.model));
    const wm = num(lead.wmape);
    const mae = num(lead.mae);
    const r2 = num(lead.r2);
    const mase = num(lead.mase);
    if (wm != null) s.reading.push(`WMAPE ${pct(wm, 2)}: for every 100 ${unit} that actually occurred, ${name} was off by about ${wm.toFixed(1)}.`);
    if (mae != null) s.reading.push(`MAE ${fmtN(mae, q === "volume" ? 0 : 2)}: on a typical day the forecast is off by about ${fmtN(mae, q === "volume" ? 0 : 2)} ${perDay}.`);
    if (r2 != null) s.reading.push(`R² ${r2.toFixed(3)}: it explains about ${Math.round(r2 * 100)}% of the day-to-day ups and downs.`);
    if (mase != null) s.reading.push(ratioReading("MASE", mase, baseline));
  }

  if (q === "incidents") {
    const ok = ms.filter((m) => num(m.mase) != null && num(m.mase)! <= 1).map((m) => label(String(m.model)));
    const no = ms.filter((m) => num(m.mase) != null && num(m.mase)! > 1);
    s.choice.push("The champion is picked among models with MASE of 1 or less (they beat the naive weekly baseline), then by the best R² or MAE.");
    if (ok.length) s.choice.push(`Eligible among those shown: ${ok.join(", ")}.`);
    for (const m of no) s.choice.push(`${label(String(m.model))}: not eligible, MASE ${num(m.mase)!.toFixed(3)} is above 1.`);
  } else if (ms.length) {
    if (lead) {
      const lw = num(lead.wmape);
      const lowest = lw != null && ms.every((m) => num(m.wmape) == null || num(m.wmape)! >= lw);
      s.choice.push(`${label(String(lead.model))} is ranked first by the pipeline${lw != null ? ` (WMAPE ${pct(lw, 2)}${lowest && ms.length > 1 ? ", the lowest of the models shown" : ""})` : ""}.`);
    }
    for (const m of ms) {
      if (m === lead) continue;
      const why = str(m.rejectedReason) ?? (m.accepted === false ? "failed the acceptance test" : null);
      const wm = num(m.wmape);
      s.choice.push(`${label(String(m.model))}: ${why ? why : `ranked lower${wm != null ? ` (WMAPE ${pct(wm, 2)})` : ""}`}.`);
    }
  }
  return s;
}

const BY_ENDPOINT: Record<string, (b: Body, label: (m: string) => string) => MethodSections> = {
  "/api/ai-insight/model-narrative": forecast,

  "/api/ai-insight/congestion-narrative": (b) => {
    const s = empty();
    const sit = (b.situation ?? {}) as Body;
    const sev = num(sit.severeBelowKmh);
    const heavy = num(sit.heavyBelowKmh);
    s.method.push(
      `Each exit-hour is labelled from its forecast speed${sev != null && heavy != null ? `: Severe below ${sev} km/h, Heavy below ${heavy} km/h, otherwise Moving` : ""}.`,
      "Accuracy = exit-hours given the right state ÷ all exit-hours scored, on hours held out from training.",
      "Each hour ahead is compared with persistence: the state now, carried forward unchanged.",
    );
    const hz = rows(b.horizons);
    for (const hh of hz.slice(0, 3)) {
      const a = asPct(num(hh.accuracy));
      const p = asPct(num(hh.persistence));
      const hr = num(hh.horizon);
      if (a != null && hr != null)
        s.reading.push(`${hr} h ahead: right for ${a.toFixed(1)}% of exit-hours${p != null ? `, against ${p.toFixed(1)}% for carrying the current state forward (${a >= p ? "+" : ""}${(a - p).toFixed(1)} points)` : ""}.`);
    }
    const m = rows(b.models)[0];
    if (m) {
      const a = asPct(num(m.accuracy));
      s.choice.push(`${String(m.model)}${a != null ? `, ${a.toFixed(1)}% accurate overall` : ""}: ${m.accepted === false ? `not accepted${str(m.rejectedReason) ? `, ${str(m.rejectedReason)}` : ""}` : "accepted, as it beats persistence on the held-out hours"}.`);
    }
    return s;
  },

  "/api/ai-insight/event-surge-narrative": (b, label) => {
    const s = empty();
    const c = (b.coverage ?? {}) as Body;
    const n = num(c.eventDays);
    const no = (b.noAdjustment ?? null) as Body | null;
    const noW = no ? num(no.wmape) : null;
    s.method.push(
      "Uplift = traffic at an exit on a Philippine Arena event day ÷ traffic on a matched normal day.",
      `Each method is scored by WMAPE on event days it was not fitted on${n != null ? ` (${n} event days${str(c.firstEvent) && str(c.lastEvent) ? `, ${day(str(c.firstEvent))} to ${day(str(c.lastEvent))}` : ""})` : ""}.`,
      `The benchmark is ignoring the event${noW != null ? ` (WMAPE ${pct(noW)})` : ""}.`,
    );
    const sit = (b.situation ?? {}) as Body;
    if (num(sit.upliftPct) != null) s.reading.push(`On this day traffic at the affected exits runs ${pct(num(sit.upliftPct))} above a normal day${num(sit.totalAdded) != null ? `, about ${fmtN(num(sit.totalAdded)!)} extra vehicles` : ""}.`);
    const ms = rows(b.models).filter((m) => num(m.wmape) != null).sort((x, y) => num(x.wmape)! - num(y.wmape)!);
    if (ms[0]) {
      const w = num(ms[0].wmape)!;
      s.reading.push(`${label(String(ms[0].model))} misses event-day traffic by ${pct(w)}${noW != null ? `, against ${pct(noW)} if the event were ignored` : ""}.`);
      s.choice.push(`${label(String(ms[0].model))} is used: the lowest WMAPE on the held-out event days.`);
      for (const m of ms.slice(1)) s.choice.push(`${label(String(m.model))}: higher error (${pct(num(m.wmape))})${m.accepted === false ? ", not accepted" : ""}.`);
    }
    return s;
  },

  "/api/ai-insight/fleet-mix-narrative": (b, label) => {
    const s = empty();
    const sit = (b.situation ?? {}) as Body;
    const w = num(sit.windowDays);
    const v = num(sit.validatedDays);
    s.method.push(
      "The three class shares are forecast together, since they always add up to 100%.",
      "Error = Aitchison distance between forecast and actual shares. SKILL = a model's distance ÷ the best simple baseline's (weekday average, same day last year, last week); accepted only below 1.",
      `Heavy share = Class 2 + Class 3${w != null ? `, compared as ${w}-day averages` : ""}.${v != null ? ` Tested ${v} days ahead.` : ""} A surge day is one whose forecast heavy share runs more than 1.5 standard deviations above its training average.`,
    );
    const now = num(sit.heavyNowPct);
    const next = num(sit.heavyNextPct);
    if (now != null && next != null) s.reading.push(`Heavy share ${now.toFixed(1)}% now, ${next.toFixed(1)}% forecast: a change of ${(next - now >= 0 ? "+" : "")}${(next - now).toFixed(1)} percentage points.`);
    const ms = rows(b.models);
    const champ = ms.find((m) => num(m.rank) === 1 && m.accepted) ?? null;
    if (champ && num(champ.skill) != null) s.reading.push(ratioReading("SKILL", num(champ.skill)!, "the best baseline"));
    if (champ) s.choice.push(`${label(String(champ.model))}: ranked first and accepted (SKILL below 1).`);
    for (const m of ms) if (m !== champ) s.choice.push(`${label(String(m.model))}: ${m.accepted ? "accepted, ranked lower" : str(m.rejectedReason) ?? "not accepted"}${num(m.skill) != null ? ` (SKILL ${num(m.skill)!.toFixed(3)})` : ""}.`);
    return s;
  },

  "/api/ai-insight/high-incident-day-narrative": (b) => {
    const s = empty();
    const auc = num(b.auc);
    const base = asPct(num(b.baseRate));
    const n = num(b.n);
    const p = num(b.rainPValue);
    s.method.push(
      `The model scores each day's chance of being a high-incident day${n != null ? `, fitted on ${fmtN(n)} days` : ""}.`,
      "AUC = the chance a randomly chosen real high-incident day is scored above a randomly chosen normal day (0.5 is a coin toss).",
      "The rain and volume curves are the model's own fitted chances at each level, not observed frequencies.",
    );
    if (auc != null) s.reading.push(`AUC ${auc.toFixed(2)}: a real high-incident day is scored above a normal one ${Math.round(auc * 100)}% of the time${base != null ? `, where ${base.toFixed(1)}% of all days are high-incident days` : ""}.`);
    if (p != null) s.reading.push(`Rainfall p-value ${p.toFixed(3)}: ${p < 0.05 ? "significant, below 0.05" : "not significant (0.05 or above), so the rain curve's slope should not be read as a real effect"}.`);
    return s;
  },

  "/api/ai-insight/incident-models-narrative": (b, label) => {
    const s = empty();
    s.method.push(
      "Severity: accuracy = incidents given the right severity class ÷ all scored; ordinal MAE = average number of severity levels a prediction is off.",
      "Clearance: concordance index = the share of incident pairs whose clearance times the model puts in the right order (0.5 is random).",
      "Secondary risk: AUC = the chance a real secondary incident is scored above a non-event, read against how often they happen.",
    );
    const sev = (b.severity ?? {}) as Body;
    const champ = str(sev.champion);
    const ms = rows(sev.models);
    const cm = ms.find((m) => m.model === champ) ?? ms[0];
    if (cm) {
      const a = asPct(num(cm.accuracy));
      const o = num(cm.maeOrdinal);
      s.reading.push(`${label(String(cm.model))}: right class for ${a != null ? `${a.toFixed(1)}%` : "—"} of incidents${o != null ? `, off by ${o.toFixed(2)} severity levels on average` : ""}.`);
    }
    const ci = num(((b.clearance ?? {}) as Body).concordanceIndex);
    if (ci != null) s.reading.push(`Clearance concordance ${ci.toFixed(2)}: it orders ${Math.round(ci * 100)}% of incident pairs correctly by how long they take to clear.`);
    const auc = num(((b.secondaryRisk ?? {}) as Body).auc);
    if (auc != null) s.reading.push(`Secondary-risk AUC ${auc.toFixed(2)}: a real secondary incident is scored above a non-event ${Math.round(auc * 100)}% of the time.`);
    if (champ) s.choice.push(`Severity model in use: ${label(champ)}.`);
    for (const m of ms) if (m.model !== champ && num(m.accuracy) != null) s.choice.push(`${label(String(m.model))}: ${asPct(num(m.accuracy))!.toFixed(1)}% accurate.`);
    return s;
  },

  "/api/ai-insight/clearance-narrative": (b) => {
    const s = empty();
    const groups = rows(b.groups);
    const total = groups.reduce((t, g) => t + (num(g.n) ?? 0), 0);
    s.method.push(
      `Measured, not forecast: each line is the share of incidents of that kind still blocking the road as the minutes pass${total ? `, from ${fmtN(total)} recorded incidents` : ""}.`,
      "Median = the minute by which half of them had cleared. Still open at 60 and 120 minutes is read straight off the same curve.",
    );
    const sorted = groups.filter((g) => num(g.medianMin) != null).sort((x, y) => num(y.medianMin)! - num(x.medianMin)!);
    for (const g of sorted.slice(0, 2)) {
      const o = asPct(num(g.stillOpen60));
      s.reading.push(`${String(g.group)}: half cleared within ${num(g.medianMin)!.toFixed(0)} min${o != null ? `; ${o.toFixed(0)}% still open after an hour` : ""}${num(g.n) != null ? ` (${fmtN(num(g.n)!)} incidents)` : ""}.`);
    }
    return s;
  },

  "/api/ai-insight/breakdown-response-narrative": (b) => {
    const s = empty();
    const mae = num(b.maeMinutes);
    s.method.push(
      "Each bar is the model's predicted median response time for that group of breakdown dispatches.",
      "MAE = the average gap, in minutes, between predicted and actual response on dispatches held out from training.",
      "Responses recorded as over 24 hours are treated as data-entry noise and excluded, as in the Descriptive tab's figures.",
    );
    if (mae != null) s.reading.push(`MAE ${mae.toFixed(1)} min: on a typical dispatch the prediction is off by about ${mae.toFixed(1)} minutes.`);
    const g = rows(b.groups).filter((x) => num(x.predictedMedianMin) != null).sort((x, y) => num(y.predictedMedianMin)! - num(x.predictedMedianMin)!);
    if (g[0]) s.reading.push(`Slowest: ${String(g[0].group)}, ${num(g[0].predictedMedianMin)!.toFixed(1)} min predicted${num(g[0].n) != null ? ` (${fmtN(num(g[0].n)!)} dispatches)` : ""}.`);
    if (str(b.championModel)) s.choice.push(`${str(b.championModel)}: the model that held up best on the chronological, held-out dispatches.`);
    return s;
  },

  "/api/ai-insight/corridor-risk-narrative": (b) => {
    const s = empty();
    const g = (b.gwr ?? null) as Body | null;
    const l = (b.spatialLstm ?? null) as Body | null;
    if (g) s.method.push("GWR describes where risk sits along the corridor; it is fitted on the exits themselves and forecasts nothing. Its leave-one-exit-out MAE predicts each exit from a fit without it.");
    if (l) s.method.push(`The per-exit forecast${str(l.servedModel) ? ` (${str(l.servedModel)})` : ""} ranks exits by expected incidents; MAE = average miss in incidents per exit, on days held out in time.`);
    s.method.push("A t-value beyond about ±2 marks a factor that matters locally at that exit.");
    if (g && num(g.loocvMae) != null) s.reading.push(`GWR leave-one-exit-out MAE ${num(g.loocvMae)!.toFixed(2)}: predicting an exit it has not seen, it is off by about ${num(g.loocvMae)!.toFixed(2)} incidents.`);
    if (l && num(l.mae) != null) s.reading.push(`Forecast MAE ${num(l.mae)!.toFixed(2)}: on a held-out day each exit's expected incidents are off by about ${num(l.mae)!.toFixed(2)}.`);
    if (l && str(l.servedModel) && num(l.lstmMae) != null)
      s.choice.push(`${str(l.servedModel)} is served: the Spatial LSTM's own MAE was ${num(l.lstmMae)!.toFixed(2)}, against ${num(l.mae) != null ? num(l.mae)!.toFixed(2) : "—"} for the model in use.`);
    return s;
  },

  "/api/ai-insight/ranking-narrative": (b) => {
    const s = empty();
    const d = str(b.metricDescription);
    if (d) s.method.push(`${d.replace(/\.$/, "")}.`);
    s.method.push(`Each row = the average of that risk over its incidents${str(b.groupBy) ? `, grouped by ${str(b.groupBy)}` : ""}; n is how many incidents the average rests on.`);
    const r = rows(b.rows).filter((x) => num(x.value) != null).sort((x, y) => num(y.value)! - num(x.value)!);
    if (r[0]) s.reading.push(`Highest: ${String(r[0].label)}, ${num(r[0].value)!.toFixed(1)}%${num(r[0].n) != null ? ` over ${fmtN(num(r[0].n)!)} incidents${num(r[0].n)! < 30 ? ", a small sample, so less certain" : ""}` : ""}.`);
    return s;
  },
};

/** The method notes for a narrative, or empty sections when the endpoint is not one this file knows. */
export function narrativeMethod(endpoint: string | undefined, body: unknown, label: (m: string) => string = (m) => m): MethodSections {
  const fn = BY_ENDPOINT[endpoint ?? "/api/ai-insight/model-narrative"];
  if (!fn || !body || typeof body !== "object") return empty();
  try {
    return fn(body as Body, label);
  } catch {
    return empty();
  }
}
