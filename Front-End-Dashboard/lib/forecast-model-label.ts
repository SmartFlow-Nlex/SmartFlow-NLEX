/**
 * What the forecast map card says about the congestion model it draws.
 *
 * The card read "Same hour last week · 72% accurate · beat 6 others", in a success style. Each part overstated
 * (audit 2026-11-19, H4 / P4-02):
 *  - "Same hour last week" is a simple baseline (last week's state repeated), served because no tested model beat
 *    it on the selection score. The card did not say so.
 *  - 72% is plain accuracy, which the protocol does not select on. Always predicting "Clear" scores higher here
 *    (78.5% at audit time), because most exit-hours are clear.
 *  - "6 others" counted the other baselines as models it beat.
 *
 * This names what is served, says when it is a baseline, shows the score it was picked on (macro-F1, averaged
 * over forecast-hour bands; train_congestion_horizon.py `score`), and puts plain accuracy beside the
 * always-"Clear" rate so it cannot be read as a success on its own. It changes no number and no selection: every
 * figure is the trainer's, read from /api/map-comparison/forecast (`model`) and the stored evaluation
 * (/api/traffic/forecast `congestionEval`, gold.ml_congestion_eval).
 */

/** The trainer's baselines (BASELINE_NAMES), with the words the card uses for each. */
const BASELINES: Record<string, string> = {
  "Same hour last week": "Same hour last week",
  "Persistence (now)": "Today's state carried forward",
  "Exit-hour profile": "Usual state for the exit and hour",
  "Majority class": "Always the most common state",
};

export function isCongestionBaseline(name: string | null | undefined): boolean {
  return !!name && Object.prototype.hasOwnProperty.call(BASELINES, name);
}

/** The served model's name as the card prints it: a baseline says it is one. */
export function servedModelName(name: string | null | undefined): string | null {
  if (!name) return null;
  return isCongestionBaseline(name) ? `${BASELINES[name]} (simple baseline)` : name;
}

/** The part of the card's `model` block this needs (Back-End map-comparison.service getForecastModelInfo). */
export type ServedModelInfo = {
  name: string | null;
  /** Plain accuracy over horizons 1-168 (gold.ml_model_metrics.r2 holds it). */
  accuracy: number | null;
};

/** The part of the stored evaluation this needs (gold.ml_congestion_eval payload). */
export type CongestionEvalLite = {
  model?: string | null;
  served_baseline?: boolean | null;
  /** The selection score: mean macro-F1 over the horizon bands. */
  score?: number | null;
  macro_f1?: number | null;
  class_share?: Record<string, number> | null;
  selection?: { vs_best_baseline_significant?: boolean | null } | null;
  candidates?: { model: string; kind?: string | null }[] | null;
};

export type ServedModelText = {
  isBaseline: boolean;
  /** "Same hour last week (simple baseline)". */
  name: string;
  /** The selection score, e.g. "balanced score 0.44", or null when the evaluation is not loaded. */
  pill: string | null;
  /** How it was picked, one sentence fragment. */
  pickedBy: string;
  /** Plain accuracy with the always-"Clear" rate beside it, or null with no accuracy. */
  accuracyNote: string | null;
  /** The footer tile: the selection score when known, else plain accuracy, labelled as such. */
  tile: { label: string; value: string; title: string };
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function describeServedModel(m: ServedModelInfo, evalIn: CongestionEvalLite | null | undefined): ServedModelText | null {
  if (!m.name) return null;
  // The evaluation is only used when it describes the model being served: two writers have shared these tables.
  const ev = evalIn && evalIn.model === m.name ? evalIn : null;
  const isBaseline = ev?.served_baseline === true || isCongestionBaseline(m.name);
  const score = finite(ev?.score) ? ev!.score : finite(ev?.macro_f1) ? ev!.macro_f1 : null;
  const tested = ev?.candidates ? ev.candidates.filter((c) => c.kind === "candidate" && c.model !== m.name).length : null;
  const allClear = finite(ev?.class_share?.Low) ? ev!.class_share!.Low : null;

  let pickedBy: string;
  if (isBaseline) {
    pickedBy = tested != null && tested > 0
      ? `None of the ${tested} models tested beat it on balanced score (macro-F1), so this simple baseline is served`
      : "No tested model beat it on balanced score (macro-F1), so this simple baseline is served";
  } else {
    const sig = ev?.selection?.vs_best_baseline_significant;
    const vsBase = sig === true ? "; it beat the best simple baseline"
      : sig === false ? "; its lead over the best simple baseline is not significant" : "";
    pickedBy = tested != null
      ? `Picked on balanced score (macro-F1) from ${tested + 1} models tested${vsBase}`
      : `Picked on balanced score (macro-F1)${vsBase}`;
  }

  const accuracyNote = finite(m.accuracy)
    ? allClear != null
      ? `Right on ${pct(m.accuracy)} of exit-hours; always predicting Clear: ${pct(allClear)}`
      : `Right on ${pct(m.accuracy)} of exit-hours (plain accuracy)`
    : null;

  const accText = finite(m.accuracy) ? `Plain accuracy is ${pct(m.accuracy)}` : "";
  const clearText = allClear != null ? `; always predicting Clear would score ${pct(allClear)}` : "";
  const tile = score != null
    ? {
        label: "Balanced score",
        value: score.toFixed(2),
        title: "The score the forecast was picked on: macro-F1, which weighs Clear, Slow and Congested equally, "
          + "averaged over forecast-hour bands (1 is perfect). "
          + (accText ? `${accText}${clearText}, so accuracy alone flatters a forecast that rarely calls congestion.` : ""),
      }
    : {
        label: "Plain accuracy",
        value: finite(m.accuracy) ? pct(m.accuracy) : "—",
        title: "Share of exit-hours right in the latest held-out test. Not the score the forecast was picked on "
          + "(macro-F1): most exit-hours are clear, so always predicting Clear also scores high here.",
      };

  return {
    isBaseline,
    name: servedModelName(m.name) ?? m.name,
    pill: score != null ? `balanced score ${score.toFixed(2)}` : null,
    pickedBy,
    accuracyNote,
    tile,
  };
}
