/* ══════════════════════════════════════════════════════════════════════════════
   THE FIGURE CHECK FOR EVERY AI NARRATIVE (17 Nov 2026)

   Every narrative prompt says "never state a number that was not given to you",
   and until now only the congestion read-out checked that the reply obeyed. The
   other ten endpoints checked the JSON's shape and nothing else, so a percentage
   the model made up reached the page under the same label as one it was given.

   The rule, for every endpoint: each figure the reply writes must be one the
   model was sent (the user message, which is the payload) to within the rounding
   the reply itself uses. "5.6%" matches a payload 5.63; "5,800 vehicles" matches
   5,843 (rounding is allowed down to two significant figures); "5.71%" does not
   match 5.63. Also accepted:
     - the same figure as a fraction or a percentage (0.723 <-> 72.3%);
     - 100 minus a percentage the payload states (a 3.2% base rate -> "right
       96.8% of the time"): the one derived figure narratives routinely need;
     - whole numbers 0 to 10 written without a % sign or a unit: counts and
       ordinals ("3 of the 5 models", "Class 3", "rank 1"); "7 days" or
       "3 hours ahead" is a quantity and is checked, and a figure written with
       a unit never matches a percentage ("7 days" is not "7.32%" rounded);
     - figures a caller names explicitly (`extra`), e.g. 0.5 as a coin toss.
   Nothing else is derived: no differences or ratios between payload figures,
   which would let almost any invented number match something.

   A figure glued to a letter on its left is part of a name, not a quantity:
   CO2, R2, PM2.5, d1-7. Signs are ignored ("down 0.4%" against -0.4).

   A reply that fails is not shown; the caller serves a plain read-out composed
   from the same payload instead (see plainVerdict below and each caller).
══════════════════════════════════════════════════════════════════════════════ */

export type Figure = {
  /** As written, e.g. "5.6%" or "12,000". */
  raw: string;
  value: number;
  /** Half a unit of the last place the writer used: how far rounding can move it. */
  tol: number;
  /** Written with a % sign or "per cent". */
  percent: boolean;
  /** Followed by a unit of time, distance or traffic ("7 days", "3 h", "5 vehicles"): a quantity, not a count. */
  measured: boolean;
};

const UNIT_AFTER = /^\s*-?\s*(?:days?|weeks?|months?|years?|hours?|hrs?|h\b|minutes?|mins?|km|kilomet|vehicles?|tonnes?|t\b|pp\b|points?|percentage)/i;

const FIGURE =
  /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:\s*(million|billion|thousand)\b)?(\s*%|\s*per\s?cent\b)?/gi;
const SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };

/** Every figure written in `text`, with the tolerance its own rounding allows. */
export function figuresIn(text: string): Figure[] {
  const out: Figure[] = [];
  for (const m of text.matchAll(FIGURE)) {
    const at = m.index ?? 0;
    // Part of a name, not a quantity: CO2, R2, PM2.5, d1-7.
    if (at > 0 && /[A-Za-z_]/.test(text[at - 1])) continue;
    const whole = m[1].replace(/,/g, "");
    const dec = m[2] ?? "";
    const scale = m[3] ? SCALE[m[3].toLowerCase()] : 1;
    let unit: number;
    if (dec) unit = 10 ** -(dec.length - 1);
    // "7,800" or "12000" is a rounded figure: its trailing zeros are rounding, not precision, down to two
    // significant figures ("7,800" covers 7,750-7,850; "8,000" covers 7,950-8,050, not 7,843).
    // Plain 4-digit numbers are left exact, because they are usually years.
    else if (m[1].includes(",") || whole.length >= 5) unit = 10 ** Math.max(0, Math.min(whole.match(/0*$/)?.[0].length ?? 0, whole.length - 2));
    else unit = 1;
    out.push({
      raw: m[0].trim(),
      value: Number(whole + dec) * scale,
      tol: (unit * scale) / 2 + 1e-9,
      percent: Boolean(m[4]),
      measured: UNIT_AFTER.test(text.slice(at + m[0].length, at + m[0].length + 16)),
    });
  }
  return out;
}

/** A figure a reply may quote. `share` marks a percentage, or a figure converted to or from one. */
export type Known = { value: number; share: boolean };

/** The figures a reply may quote: everything in the payload sent to the model, plus `extra`. */
export function knownFigures(payload: string | string[], extra: number[] = []): Known[] {
  const known: Known[] = [];
  for (const text of Array.isArray(payload) ? payload : [payload]) {
    for (const f of figuresIn(text)) {
      known.push({ value: f.value, share: f.percent }, { value: f.value * 100, share: true }, { value: f.value / 100, share: true });
      if (f.percent && f.value <= 100) known.push({ value: 100 - f.value, share: true });
    }
  }
  return [...known, ...extra.map((value) => ({ value, share: false }))];
}

/** The figures in `texts` that match nothing in `known`. Empty means the reply passes. */
export function unknownFigures(texts: (string | null | undefined)[], known: Known[]): string[] {
  const bad: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const f of figuresIn(text)) {
      // A count or an ordinal ("3 of the 5 models", "Class 2", "rank 1"), but not "7 days" or "3 hours ahead".
      if (!f.percent && !f.measured && !f.raw.includes(".") && Number.isInteger(f.value) && f.value <= 10) continue;
      // "7 days" or "5,800 vehicles" is not a percentage the payload gave ("7.32%") rounded or converted.
      const pool = f.measured ? known.filter((k) => !k.share) : known;
      if (!pool.some((k) => Math.abs(Math.abs(k.value) - f.value) <= f.tol)) bad.push(f.raw);
    }
  }
  return bad;
}

/* ── The plain read-out ───────────────────────────────────────────────────────
   What a panel shows when the reply fails the check: each item's figures exactly
   as the payload states them, with the prompt's capitalised labels written out. */

const LABELS: [RegExp, string][] = [
  [/\bBEATS-BENCHMARK\b/g, "beats the benchmark"],
  [/\bFAILS-BENCHMARK\b/g, "does not beat the benchmark"],
  [/\bLEVEL-WITH-BENCHMARK\b/g, "level with the benchmark"],
  [/\bBEATS-BEST-BASELINE\b/g, "beats the best baseline"],
  [/\bFAILS-BEST-BASELINE\b/g, "does not beat the best baseline"],
  [/\bLEVEL-WITH-BEST-BASELINE\b/g, "level with the best baseline"],
  [/\bBASELINE \(not a candidate\)/g, "baseline (not a candidate)"],
  [/\s*-\s*THE HONEST FIGURE\b/g, ""],
];
const ACRONYMS = new Set(["WMAPE", "MAPE", "MAE", "RMSE", "MASE", "AUC", "GWR", "LSTM", "LOOCV", "NLEX", "PDO", "GRU", "XGB", "GBR", "MSTL", "PHT", "SCTEX", "TPLEX"]);

/** A payload fragment made readable: "BEATS-BENCHMARK, rank 1, accepted" -> "beats the benchmark, rank 1, accepted." */
export function tidyFacts(s: string): string {
  let t = s.trim();
  for (const [re, to] of LABELS) t = t.replace(re, to);
  t = t.replace(/\b[A-Z][A-Z-]{2,}\b/g, (w) => (ACRONYMS.has(w) ? w : w.toLowerCase()));
  t = t.replace(/\s+/g, " ").replace(/[\s,;]+$/, "");
  return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : t;
}

/**
 * The figures the payload states for one roster name, from a line written
 * "- <name>: ..." or "  <name>: ..." (a "(BASELINE ...)" note may sit between
 * the name and the colon). Null when the payload has no such line. Only that
 * note is skipped, so "Derived" never takes the line of "Derived (weekday ratio)".
 */
export function plainVerdict(name: string, payload: string): string | null {
  const want = name.toLowerCase();
  for (const line of payload.split("\n")) {
    const t = line.trim().replace(/^-\s*/, "").replace(/^#\d+\s+/, "");
    if (!t.toLowerCase().startsWith(want)) continue;
    const m = t.slice(name.length).match(/^(?:\s*\(BASELINE[^)]*\))?\s*:\s*(.+)$/);
    if (m) return tidyFacts(m[1]);
  }
  return null;
}

/** The lines under a payload heading "MODEL <n> - <name>", to the next blank line (at most `max`). */
export function sectionFacts(name: string, payload: string, max = 3): string | null {
  const lines = payload.split("\n");
  const at = lines.findIndex((l) => /^MODEL\b/i.test(l.trim()) && l.includes(name));
  if (at < 0) return null;
  const body: string[] = [];
  for (const l of lines.slice(at + 1)) {
    if (!l.trim() || body.length >= max) break;
    const b = l.trim().replace(/^-\s*/, "");
    body.push(/[.!?:]$/.test(b) ? b : `${b}.`);
  }
  return body.length ? tidyFacts(body.join(" ")) : null;
}

/** The rest of the first payload line that starts with `prefix` (e.g. "FIT:"). */
export function lineFacts(prefix: string, payload: string): string | null {
  const line = payload.split("\n").find((l) => l.trim().startsWith(prefix));
  return line ? tidyFacts(line.trim().slice(prefix.length)) : null;
}
