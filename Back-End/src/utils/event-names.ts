/* One consistent way of writing every event name (5 Nov 2026, user request).
 *
 * The scraped event list (public.philippine_arena_events) is free text, and the same thing arrives written several
 * ways. The scraper is not part of this codebase, so names are standardized here, when they are read: whatever is
 * scraped next comes out consistent without anyone editing the table. Rules, all general (no title is listed by hand):
 *
 *   Shape. Every name ends up as one of:
 *     "Act - Tour"                      BLACKPINK - Born Pink World Tour
 *     "Event: detail · detail"          2023 FIBA Basketball World Cup Qualification: Philippines vs. Lebanon · …
 *     "Event (Performer, Performer…)"   Puregold OPM Con 2025 (SB19, BINI, G22, …)
 *     "Performer, Performer…"           KARD, BINI
 *   so line breaks, performer lists written before the event, and "/" between performers are rewritten into these.
 *   Several events on one day are joined with " + "; parts that describe the same event are merged into one.
 *
 *   Acts and performers. Every spelling of the same name takes one form: an all-capitals spelling is the act's own
 *   stylization (BLACKPINK, TWICE, BINI) and wins; otherwise the most frequent. This applies inside lineups too.
 *
 *   Tour and event names. Headline case: small words (of, the, to, vs. …) in lower case except at the start or after
 *   a colon; a name written entirely in capitals is converted; deliberate stylings found elsewhere in the list are kept
 *   (GUTS, H.E.R.E.H, SKZ, LaLaLa). The act's own name at the front of its tour is dropped ("BTS - BTS World Tour
 *   'Arirang'" -> "BTS - World Tour 'Arirang'"), and tours made of the same words are one tour, so that and
 *   "BTS - Arirang World Tour" become the same name. "vs" is always "vs.".
 *
 *   Different events are never merged: only how a name is written changes, not which event it is.
 */

const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "per", "the", "to", "via", "vs", "x"]);

const keyOf = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function upperShare(s: string): number {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return 0;
  return letters.replace(/[^A-Z]/g, "").length / letters.length;
}
const isAllCaps = (s: string) => /[A-Z]/.test(s) && upperShare(s) === 1;

/** "Act - Tour" on its first " - ". */
function splitDash(s: string): [string, string] {
  const m = s.match(/^(.*?)\s+[-–—]\s+(.*)$/);
  return m ? [m[1].trim(), m[2].trim()] : [s.trim(), ""];
}
const isList = (s: string) => /,|\s\/\s/.test(s);
const names = (s: string) => s.split(/\s*,\s*|\s+\/\s+/).map((x) => x.trim()).filter(Boolean);
const fixVs = (s: string) => s.replace(/\bvs\b\.?/gi, "vs.");
const fixColons = (s: string) => s.replace(/:(?=[A-Za-z])/g, ": ");

type Part =
  | { kind: "act"; artist: string; tour: string; lineup: string[] }
  | { kind: "event"; name: string; details: string[]; lineup: string[] }
  | { kind: "lineup"; lineup: string[] }
  | { kind: "single"; name: string };

function parsePart(raw: string): Part {
  const lines = raw.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) return { kind: "event", name: lines[0], details: lines.slice(1), lineup: [] };
  const one = lines[0] ?? "";
  const [left, right] = splitDash(one);
  if (right) {
    if (/^various\b/i.test(left)) return { kind: "event", name: right, details: [], lineup: [] };
    if (isList(left)) return { kind: "event", name: right, details: [], lineup: names(left) };
    if (isList(right)) return { kind: "event", name: left, details: [], lineup: names(right) };
    if (/\bvs\b/i.test(right) && !/\bvs\b/i.test(left)) return { kind: "event", name: left, details: [right], lineup: [] };
    return { kind: "act", artist: left, tour: right, lineup: [] };
  }
  if (isList(one)) return { kind: "lineup", lineup: names(one) };
  return { kind: "single", name: one };
}

const partsOf = (title: string) => String(title ?? "").split(" + ").map(parsePart);

/** Spellings to keep: everything the canon knows, built once from the whole event list. */
export type ArtistCanon = Map<string, string> & { words?: Map<string, string>; tours?: Map<string, string> };

function headline(s: string, words: Map<string, string> | undefined): string {
  const caps = upperShare(s) >= 0.6;
  const toks = fixVs(fixColons(s)).split(/(\s+)/);
  let start = true;
  return toks
    .map((w) => {
      if (/^\s+$/.test(w) || w === "") return w;
      const core = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, "");
      const lead = w.slice(0, w.indexOf(core.charAt(0)) >= 0 ? w.indexOf(core.charAt(0)) : 0);
      const tail = w.slice(lead.length + core.length);
      const k = keyOf(core);
      let out: string;
      const styled = words?.get(k);
      if (styled) out = styled;
      else if (/\d/.test(core)) out = caps ? core.toLowerCase() : core;
      else if (/[A-Za-z]\.[A-Za-z]/.test(core)) out = core;
      else if (!caps && core.length > 1 && (isAllCaps(core) || /\p{Ll}\p{Lu}/u.test(core))) out = core; // GUTS, LaLaLa
      else if (!start && SMALL.has(core.toLowerCase().replace(/\.$/, ""))) out = core.toLowerCase();
      else {
        const base = caps ? core.toLowerCase() : core;
        out = base.charAt(0).toUpperCase() + base.slice(1);
      }
      // The next word starts a new phrase after a colon, a plus or a dash.
      start = /[:+–—-]$/.test(tail) || /[:+]$/.test(core);
      return lead + out + tail;
    })
    .join("");
}

export function buildArtistCanon(titles: Iterable<string>): ArtistCanon {
  const all = [...titles].map((t) => String(t ?? ""));
  const parts = all.flatMap(partsOf);

  // Names of acts and performers.
  const seen = new Map<string, Map<string, number>>();
  const note = (n: string) => {
    if (!n) return;
    const k = keyOf(n);
    const c = seen.get(k) ?? new Map<string, number>();
    c.set(n, (c.get(n) ?? 0) + 1);
    seen.set(k, c);
  };
  for (const p of parts) {
    if (p.kind === "act") note(p.artist);
    if (p.kind === "single") note(p.name);
    if (p.kind === "lineup" || p.kind === "event") p.lineup.forEach(note);
  }
  const canon: ArtistCanon = new Map();
  for (const [k, counts] of seen) {
    const sp = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    canon.set(k, (sp.find(([s]) => isAllCaps(s)) ?? sp[0])[0]);
  }

  // Stylized words, from names written in mixed case on purpose (GUTS, H.E.R.E.H, SKZ).
  const words = new Map<string, string>();
  const sources = parts.flatMap((p) => (p.kind === "act" ? [p.tour] : p.kind === "event" ? [p.name] : []));
  for (const s of sources) {
    const ws = s.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, "")).filter((w) => /[A-Za-z]/.test(w));
    // A capitalised word is a deliberate styling only when most of its name is normal case (GUTS in "GUTS in
    // Manila"); in a half-capitalised name ("BE THE SUN World Tour") it is just shouting.
    const capsShare = ws.length ? ws.filter((w) => w.length > 1 && isAllCaps(w)).length / ws.length : 0;
    for (const core of ws) {
      const k = keyOf(core);
      if (/[A-Za-z]\.[A-Za-z]/.test(core)) words.set(k, core); // dotted initials always win: H.E.R.E.H
      else if (capsShare <= 0.34 && core.length > 1 && isAllCaps(core) && !/\./.test(words.get(k) ?? "")) words.set(k, core);
    }
  }
  canon.words = words;

  // One spelling per tour: the act's name dropped from its front, then tours made of the same words are one tour.
  canon.tours = new Map();
  const groups = new Map<string, { s: string; mixed: boolean; n: number }[]>();
  for (const p of parts) {
    if (p.kind !== "act") continue;
    const tour = dropArtist(p.artist, p.tour);
    const g = tourKey(p.artist, tour);
    const list = groups.get(g) ?? [];
    const shown = headline(tour, words);
    const hit = list.find((x) => x.s === shown);
    if (hit) hit.n += 1;
    else list.push({ s: shown, mixed: upperShare(tour) < 0.6, n: 1 });
    groups.set(g, list);
  }
  for (const [g, list] of groups) {
    list.sort((a, b) => Number(b.mixed) - Number(a.mixed) || b.n - a.n || a.s.length - b.s.length);
    canon.tours.set(g, list[0].s);
  }
  return canon;
}

function dropArtist(artist: string, tour: string): string {
  const esc = artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rest = tour.replace(new RegExp(`^${esc}\\s+`, "i"), "");
  return rest !== tour && rest.split(/\s+/).length >= 2 ? rest : tour;
}
function tourKey(artist: string, tour: string): string {
  const toks = [...new Set(tour.split(/[\s:]+/).map(keyOf).filter((t) => t && !SMALL.has(t)))].sort();
  return `${keyOf(artist)}|${toks.join(" ")}`;
}

const nameKey = (s: string) => keyOf(s).replace(/(ies|y|s)$/, "");

export function standardizeEventTitle(title: string | null | undefined, canon: ArtistCanon): string {
  if (!title) return title ?? "";
  const who = (n: string) => canon.get(keyOf(n)) ?? n;
  const parts = partsOf(title);

  // A lineup on the same day as one of its acts' own shows is that show's lineup.
  for (const l of parts.filter((p): p is Extract<Part, { kind: "lineup" }> => p.kind === "lineup")) {
    const act = parts.find((p): p is Extract<Part, { kind: "act" }> => p.kind === "act" && l.lineup.some((n) => keyOf(n) === keyOf(p.artist)));
    if (act) {
      act.lineup = l.lineup.filter((n) => keyOf(n) !== keyOf(act.artist));
      l.lineup = [];
    }
  }
  // Two parts naming the same event (a match card and its performers) are one.
  const merged: Part[] = [];
  for (const p of parts) {
    if (p.kind === "lineup" && p.lineup.length === 0) continue;
    if (p.kind === "event") {
      const same = merged.find((m): m is Extract<Part, { kind: "event" }> => m.kind === "event" && nameKey(m.name) === nameKey(p.name));
      if (same) {
        same.details.push(...p.details);
        same.lineup.push(...p.lineup);
        continue;
      }
    }
    merged.push(p);
  }

  const lineupText = (l: string[]) => (l.length ? ` (${l.map(who).join(", ")})` : "");
  return merged
    .map((p) => {
      if (p.kind === "single") return who(p.name);
      if (p.kind === "lineup") return p.lineup.map(who).join(", ");
      if (p.kind === "event") {
        const details = p.details.length ? `: ${p.details.map((d) => fixVs(d)).join(" · ")}` : "";
        return `${headline(p.name, canon.words)}${details}${lineupText(p.lineup)}`;
      }
      const artist = who(p.artist);
      const tour0 = dropArtist(p.artist, p.tour);
      let tour = canon.tours?.get(tourKey(p.artist, tour0)) ?? headline(tour0, canon.words);
      const esc = p.artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      tour = tour.replace(new RegExp(`\\b${esc}\\b`, "gi"), artist);
      return `${artist} - ${tour}${lineupText(p.lineup)}`;
    })
    .join(" + ");
}
