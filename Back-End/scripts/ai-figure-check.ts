/**
 * Offline checks for the AI narratives' figure check (src/services/ai-figure-check.ts and checkFigures in
 * ai-insight.service.ts): hand-written replies, honest and not, against the messages the endpoints really
 * build. No model is called and nothing is written, so this is free and exact. Run from Back-End:
 *
 *   npx tsx scripts/ai-figure-check.ts
 */
import { figuresIn, knownFigures, plainVerdict, sectionFacts, unknownFigures } from "../src/services/ai-figure-check.js";
import { checkFigures, messagesForCheck, type Insight } from "../src/services/ai-insight.service.js";

let checks = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) failures.push(`${name}${detail ? `  -> ${detail}` : ""}`);
}
const unknownIn = (text: string, payload: string, extra: number[] = []) => unknownFigures([text], knownFigures(payload, extra));

/* ── reading figures ── */
{
  const f = figuresIn("WMAPE 5.6%, about 12,000 vehicles, 1.2 million trips, CO2 and PM2.5, R2 0.91, d1-7, 7 days");
  const raw = f.map((x) => x.raw).join(" | ");
  check("figures: names (CO2, PM2.5, R2, d1) are not read as quantities", !/^2$|2\.5/.test(raw) && raw.includes("0.91"), raw);
  check("figures: a thousands separator is one figure", f.some((x) => x.value === 12000 && Math.abs(x.tol - 500) < 1e-6), raw);
  check("figures: 'million' scales the figure and its rounding", f.some((x) => x.value === 1.2e6 && Math.abs(x.tol - 50000) < 1), raw);
  check("figures: '7 days' is a quantity, not a count", f.some((x) => x.value === 7 && x.measured), raw);
}

/* ── the CO2 forecast message: protocol from the warehouse, figures checked ── */
const co2 = messagesForCheck.forecast(
  {
    quantity: "emissions",
    horizonDays: 7,
    scoredDays: 364,
    windowStart: "2025-05-25",
    windowEnd: "2026-05-24",
    metrics: [
      { model: "Derived + calendar ratio", wmape: 5.6311, mae: 41.2, mase: 0.769, rank: 1, accepted: true, diagnosis: "tied with Derived (weekday ratio) - lead not significant" },
      { model: "Derived (weekday ratio)", wmape: 5.8936, mase: 0.805, rank: 2, accepted: true },
      { model: "MSTL", wmape: 7.82, mase: 1.069, accepted: false, rejectedReason: "mean WMAPE 7.82% does not beat the best baseline (Baseline: last year (scaled)) 7.32%" },
    ],
  },
  { origins: 26, days: 90, bestBaseline: "Baseline: last year (scaled)" },
);
check("CO2 message: no '7 days ahead' from the card", !/7 days ahead/.test(co2), co2);
check("CO2 message: the rolling-origin protocol is stated", /26 forecasts of 90 days each/.test(co2), co2);
check("CO2 message: MASE is against the best baseline, not 'repeating last week'", /Baseline: last year \(scaled\)/.test(co2) && !/repeating last week/.test(co2), co2);
check("CO2 message: the 15% target is in the message", /15% or less/.test(co2), co2);
{
  const good =
    "Derived + calendar ratio is the one to trust: a WMAPE of 5.6% is well inside the 15% target, and its MASE of 0.77 beats the best baseline. " +
    "It is level with Derived (weekday ratio) at 5.89%. MSTL was rejected: 7.82% does not beat 7.32%. It was tested on 26 forecasts of up to 90 days.";
  check("CO2: an honest reply passes", unknownIn(good, co2).length === 0, unknownIn(good, co2).join(", "));
  check("CO2: a made-up percentage fails", unknownIn("Derived + calendar ratio is about 23% better than the baseline.", co2).join() === "23%");
  check("CO2: 'tested 7 days ahead' fails (7 days is not in the message)", unknownIn("It was tested 7 days ahead.", co2).join() === "7");
  check("CO2: a worked example fails", unknownIn("A 5.6% error means a 40,000-tonne month is read within 2,240 tonnes.", co2).length === 2);
  check("CO2: more precision than given fails", unknownIn("Its WMAPE is 5.6411%.", co2).join() === "5.6411%");
}

/* ── checkFigures: what the panel gets ── */
{
  const roster = ["Derived + calendar ratio", "Derived (weekday ratio)", "MSTL"];
  const reply: Insight = {
    summary: "Derived + calendar ratio scores WMAPE 5.6%.",
    perModel: [{ model: "MSTL", verdict: "Rejected, 12% behind the baseline." }],
    caveat: null,
  };
  const out = checkFigures(reply, { endpoint: "test", user: co2, roster, summary: "Ranked first: Derived + calendar ratio, WMAPE 5.63." });
  check("checkFigures: a reply with an unknown figure is replaced by the plain read-out", out.source === "template", JSON.stringify(out));
  check("checkFigures: the plain read-out lists each model's own line", out.perModel.length === 3 && out.perModel[0].verdict.startsWith("WMAPE 5.63"), JSON.stringify(out.perModel));
  check("checkFigures: 'Derived' never takes the line of 'Derived (weekday ratio)'", plainVerdict("Derived", co2) === null);
  check("checkFigures: the prompt's capitalised labels are written out", /beats the benchmark/.test(out.perModel[0].verdict) && !/BEATS/.test(out.perModel[0].verdict), out.perModel[0].verdict);
  const ok = checkFigures({ ...reply, perModel: [{ model: "MSTL", verdict: "Rejected: 7.82% does not beat 7.32%." }] }, { endpoint: "test", user: co2, roster });
  check("checkFigures: an honest reply is kept and marked as the AI's", ok.source === "ai" && ok.summary === reply.summary);
  const empty = checkFigures({ summary: "No summary was produced.", perModel: [], caveat: null }, { endpoint: "test", user: co2, roster });
  check("checkFigures: a reply with no summary is replaced too", empty.source === "template");
}

/* ── fleet mix: best baseline and the 30-day protocol, not persistence and 7 days ── */
{
  const fleet = messagesForCheck.fleetMix(
    {
      models: [
        { model: "Prophet + holidays", rank: 1, accepted: true, maePp: 0.618, heavyWmape: 3.1, heavyR2: 0.41, skill: 0.584, diagnosis: "Aitchison 0.0644 (mean of d1-7, d8-14, d15-30)" },
        { model: "Prophet", rank: 6, accepted: false, skill: 1.053, rejectedReason: "Aitchison 0.1160 does not beat the best baseline (Baseline: weekday average) 0.1102" },
      ],
      situation: { champion: "Prophet + holidays", heavyNowPct: 21.9, heavyNextPct: 22.4, windowDays: 30, projectionDays: 30, validatedDays: 7, surgeDays: 0 },
    },
    { origins: 26, days: 30, bestBaseline: "Baseline: weekday average" },
  );
  check("fleet message: the best baseline is named", /BEST BASELINE: Baseline: weekday average/.test(fleet), fleet);
  check("fleet message: no persistence label", !/PERSISTENCE/.test(fleet) && /BEATS-BEST-BASELINE/.test(fleet), fleet);
  check("fleet message: tested up to 30 days ahead, not 7", /26 forecasts of 30 days each/.test(fleet) && !/validated at 7/.test(fleet), fleet);
  const good = "Heavy vehicles stay near 22.4% of traffic, a change of less than one point. Prophet + holidays beats the best baseline with a skill of 0.58 and a typical miss of 0.62 pp.";
  check("fleet: an honest reply passes", unknownIn(good, fleet, [100]).length === 0, unknownIn(good, fleet, [100]).join(", "));
  check("fleet: a computed change fails", unknownIn("The heavy share rises 0.7 points.", fleet, [100]).join() === "0.7");
}

/* ── congestion: the shared check replaces the old percentage-only test ── */
{
  const cong = messagesForCheck.congestion({
    models: [{ model: "Dual-path LSTM", accuracy: 0.723, accepted: true }],
    baseline: { model: "Exit-hour profile", accuracy: 0.651 },
    horizons: [
      { horizon: 1, accuracy: 0.74, persistence: 0.7, n: 12345 },
      { horizon: 12, accuracy: 0.71, persistence: 0.62, n: 12001 },
    ],
    situation: { exitsTotal: 20, exitsSevere: 3, hoursCovered: 24 },
  });
  check("congestion: quoting the given accuracies passes", unknownIn("It is right 72.3% of the time, 74% one hour ahead and 71% at 12 hours ahead.", cong).length === 0);
  check("congestion: a percentage it was not given fails", unknownIn("It is right 80% of the time.", cong).join() === "80%");
  check("congestion: an hour ahead it was not tested at fails", unknownIn("At 48 hours ahead it holds up.", cong).join() === "48");
}

/* ── incident read-outs: the coin toss, a complement of the base rate, and the section fallback ── */
{
  const inc = [
    "MODEL 3 - Secondary incident risk",
    'A "secondary" incident is one following the first within 2 km.',
    "- AUC 0.680 (0.5 is a coin toss), base rate 4.0% - the share of incidents actually followed by a second one, scored on 1,812 incidents",
  ].join("\n");
  const good = "AUC 0.68 sits well above 0.5; with a base rate of 4%, a model that flags nothing would be right 96% of the time.";
  check("incidents: base rate, its complement and the coin toss pass", unknownIn(good, inc, [0.5]).length === 0, unknownIn(good, inc, [0.5]).join(", "));
  check("incidents: an AUC turned into an accuracy fails", unknownIn("It is 68.5% accurate.", inc, [0.5]).join() === "68.5%");
  const s = sectionFacts("Secondary incident risk", inc) ?? "";
  check("incidents: the section fallback reads the model's lines", /AUC 0\.680/.test(s) && /base rate 4\.0%/.test(s), s);
}

/* ── the explain briefing: facts only ── */
{
  const facts = "FACTS\n  - Total volume 1,234,567 vehicles, up 1.2% on the previous 90 days.\n  - Congestion index 0.42 versus 0.40 previously.";
  check("explain: rounding to 1.2 million passes", unknownIn("Volume rose 1.2% to about 1.2 million vehicles.", facts).length === 0);
  check("explain: a figure not in the facts fails", unknownIn("Volume rose 3% over the period.", facts).join() === "3%");
}

console.log(`ai-figure-check: ${checks} checks, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
