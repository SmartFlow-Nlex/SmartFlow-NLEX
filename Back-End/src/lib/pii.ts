/**
 * Mask personal details in free text before it leaves for the AI provider (security audit #15, 9 Nov 2026).
 *
 * The sandbox command box is the one place a person's own words reach the model. The command parser needs exits,
 * kilometres, lanes and times, never contact details, so emails, Philippine mobile numbers and plate-style codes are
 * replaced with a placeholder first. Plates are matched only in capitals (ABC 1234), the way they are written, so
 * ordinary words such as "for 2000 vehicles" are left alone.
 *
 * People's names are masked too since 24 Nov 2026 (security task S6), but only where the sentence itself says a
 * person is being named: "my name is ...", "ako si ...", "driver Juan Santos", "Engr. Reyes", "si/ni/kay Juan".
 * Any two capitalised words would be a name detector that also eats "San Fernando" and "Sta. Rita", which the
 * parser needs, so there is no such rule. A candidate after a cue is still left alone when it is a corridor place
 * (PLACES below), a road word ("Lane", "Exit", "Km"), or the start of a road named after a person
 * ("Gov. Halili Avenue").
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PH_MOBILE = /(?:\+?63|\b0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g;
/* Car plates, letters first. In capitals with or without a space ("ABC 1234"); in lower case only when written as one
   token ("abc1234", "abc-1234"), because "for 2000" and "add 1500" in lower case are ordinary command words. */
const PLATE = /\b[A-Z]{3}[ -]?\d{3,4}\b/g;
const PLATE_LOWER_GLUED = /\b[a-z]{3}-?\d{3,4}\b/g;
/* Motorcycle plates, digits first ("123 ABC", "1234-AB"; 19 Nov 2026 audit S22). In capitals only, and never the
   direction and unit words a sandbox command uses after a number ("1500 NB", "2000 VPH", "80 KPH"). */
const PLATE_DIGITS_FIRST = /\b\d{3,4}[ -]?(?!(?:NB|SB|KM|KPH|VPH|VEH|AM|PM|MIN|HR|HRS)\b)[A-Z]{2,3}\b/g;

/* ── People's names (24 Nov 2026) ─────────────────────────────────────────────────────────────────────────────── */

/** Corridor places a command names: the exits and plazas of lib/nlex-exits.ts and data/nlex-toll-plazas.ts, the
    SCTEX/TPLEX origins of etl/canonical-exit.ts, the service areas and the towns around them. A name candidate that
    is one of these, or the start of one ("Sta" of "Sta. Rita"), is a place and is never masked. */
const PLACES = [
  "Balintawak", "Karuhatan", "Valenzuela", "Paso de Blas", "Paso de Blas Valenzuela", "Lawang Bato", "Smart Connect",
  "Meycauayan", "Marilao", "Bocaue", "Bocaue Barrier", "Bocaue Interchange", "Balagtas", "Tabang", "Tabang Guiguinto",
  "Guiguinto", "Sta. Rita", "Santa Rita", "Sta. Rita Guiguinto", "Pulilan", "San Simon", "San Fernando", "Mexico",
  "Angeles", "Dau", "Mabalacat", "Sta. Ines", "Santa Ines", "Tambubong", "Mabiga", "Philippine Arena", "PH Arena",
  "Ciudad de Victoria", "Harbor Link", "NLEX Harbor Link", "Mindanao Avenue", "Mindanao", "Caloocan", "Quezon City",
  "Manila", "Maynila", "Malolos", "Plaridel", "Bulacan", "Pampanga", "Tarlac", "Concepcion", "Bamban", "Clark",
  "New Clark City", "Dinalupihan", "Tipo", "Subic", "Floridablanca", "Porac", "San Miguel", "San Jose del Monte",
  "Lakeshore", "Mega Station", "Petron", "Shell", "Caltex", "Total", "Seaoil", "Cleanfuel", "Jollibee", "Mang Inasal",
  "Inasal", "Drive and Dine", "Drive & Dine", "Halili", "Fortunato Halili", "MacArthur", "Mac Arthur", "Dulalia",
  "Tullahan", "Libtong", "Maysan", "Lias",
];
const norm = (s: string) => s.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
const PLACE_KEYS = PLACES.map(norm);
const isPlace = (candidate: string) => {
  const c = norm(candidate);
  // The place itself, the start of one ("Sta" of "Sta. Rita", "San" of "San Fernando"), or a place and more.
  return PLACE_KEYS.some((p) => p === c || p.startsWith(c + " ") || c.startsWith(p + " "));
};

/** Capitalised words that follow a cue without being a name: road words, directions, days, months, function words. */
const NOT_A_NAME = new Set(
  [
    "lane", "lanes", "linya", "km", "kilometer", "kilometre", "kilometro", "exit", "entry", "toll", "plaza", "booth",
    "barrier", "interchange", "ramp", "shoulder", "northbound", "southbound", "nb", "sb", "nlex", "sctex", "tplex",
    "road", "rd", "street", "st", "avenue", "ave", "highway", "hwy", "boulevard", "blvd", "bridge", "station", "gate",
    "service", "area", "hospital", "market", "center", "centre", "city", "town", "hall", "office", "terminal",
    "the", "a", "an", "in", "on", "at", "of", "for", "to", "from", "and", "or", "but", "is", "was", "na", "ang", "ng",
    "sa", "po", "ay", "si", "ni", "kay", "yung", "ung", "mga", "ito", "iyan", "please", "pls", "here", "there", "now",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "lunes", "martes", "miyerkules",
    "huwebes", "biyernes", "sabado", "linggo", "january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december", "rain", "flood", "crash", "accident", "breakdown",
    "collision", "truck", "bus", "car", "van", "motorcycle", "jeep", "jeepney", "trailer", "taxi", "police", "pnp",
    "mmda", "lto", "ltfrb", "dpwh", "patrol", "traffic", "emergency", "rescue", "ambulance", "tow",
  ],
);
/** The words after a name that make it the name of a road or building, not of a person ("Gov. Halili Avenue"). */
const NAMED_FOR = new Set(["avenue", "ave", "road", "rd", "street", "st", "highway", "hwy", "boulevard", "blvd",
  "bridge", "interchange", "exit", "hospital", "school", "university", "college", "hall", "market", "station",
  "plaza", "toll", "memorial", "park", "village", "subdivision", "drive", "dr"]);

/** Any capitalisation of a cue word: "driver", "Driver", "DRIVER". */
const anyCase = (w: string) => w.replace(/[a-z]/gi, (ch) => `[${ch.toLowerCase()}${ch.toUpperCase()}]`);

/* One name: capitalised words (Juan, Dela, O'Brien, Santos-Reyes) or initials (J.), joined by spaces and the
   lower-case particles of Filipino and Spanish surnames (dela Cruz, de los Santos), optionally ending Jr./Sr./III. */
const WORD = "(?:[A-ZÑ][a-zñ]+(?:[-'][A-ZÑa-zñ]+)?|[A-Z]\\.)";
const PARTICLE = "(?:de\\s+la|de\\s+los|de\\s+las|dela|delos|del|de|van|von|y)";
const NAME = `${WORD}(?:\\s+(?:${PARTICLE}\\s+)?${WORD}){0,3}(?:,?\\s+(?:Jr|Sr)\\.?|\\s+(?:II|III|IV))?`;

/* Cues that say "the next words are a person". Each is matched in any capitalisation; the name after it must be
   capitalised. Honorifics may carry a full stop (Engr., Dr.). Filipino kin titles (Kuya, Ate, Mang, Aling ...) are
   matched only capitalised, since "ate" is also an English word. */
const ROLE_CUES = [
  "driver", "drayber", "tsuper", "rider", "motorist", "motorcyclist", "passenger", "pasahero", "victim", "biktima",
  "owner", "may-ari", "complainant", "caller", "reporter", "witness", "patroller", "responder", "enforcer", "officer",
  "named", "called", "nagngangalang", "contact", "tawagan", "reported by", "requested by", "sent by", "filed by",
  "assigned to", "ayon kay", "name:", "si", "ni", "kay", "sina", "nina", "kina",
];
const HONORIFICS = ["mr", "mrs", "ms", "miss", "mx", "sir", "ma'am", "maam", "mam", "madam", "engr", "engineer", "dr",
  "atty", "attorney", "prof", "hon", "kap", "kapitan", "kgd", "konsehal", "mayor", "gov", "governor", "sgt", "cpl",
  "capt", "lt", "col", "maj", "po1", "po2", "po3", "spo1", "spo2", "spo3", "spo4"];
const KIN_TITLES = ["Kuya", "Ate", "Mang", "Aling", "Tito", "Tita", "Manong", "Manang", "Lolo", "Lola"];

const CUED_NAME = new RegExp(
  `(\\b(?:${[...ROLE_CUES.map((c) => anyCase(c).replace(/ /g, "\\s+")), ...HONORIFICS.map(anyCase), ...KIN_TITLES].join("|")})\\.?,?\\s+)(${NAME})`,
  "g",
);
/* "I am Juan" / "I'm Juan": only with a capital I and a capitalised name. */
const I_AM_NAME = new RegExp(`(\\bI(?:\\s+am|'m)\\s+)(${NAME})`, "g");
/* Cues strong enough that what follows is a name even typed in lower case: "my name is juan dela cruz". */
const SELF_CUES = ["my name is", "my name's", "pangalan ko ay", "ang pangalan ko ay", "pangalan ko",
  "ako po si", "ako ay si", "ako si"];
const SELF_NAME = new RegExp(
  `(\\b(?:${SELF_CUES.map((c) => anyCase(c).replace(/ /g, "\\s+")).join("|")})\\s*)((?:[A-Za-zÑñ][A-Za-zÑñ'.-]*)(?:\\s+[A-Za-zÑñ][A-Za-zÑñ'.-]*){0,3})`,
  "g",
);

/** Words that end a name typed in lower case after "my name is" / "ako si": the command carries on from here. */
const COMMAND_WORDS = new Set(["close", "open", "add", "put", "set", "remove", "clear", "run", "go", "show", "make",
  "block", "start", "stop", "pause", "play", "reset", "isara", "sarhan", "buksan", "alisin", "maglagay", "lagay",
  "ilagay", "gawin", "itakda", "pakita", "i-close", "pa-close", "paki", "pakisara", "and", "at", "tapos", "then",
  "with", "near", "lane", "here", "from", "my", "ang", "nasa", "ay", "po", "i", "im", "i'm", "we", "kami", "tayo"]);
const PARTICLE_WORD = /^(?:de|del|dela|delos|la|los|las|van|von|y)$/i;

/** Mask what the cue introduced, keeping the words after the name that are not part of it. */
function maskCandidate(cue: string, candidate: string, after: string, lowerCaseAllowed: boolean): string | null {
  const tokens = [...candidate.matchAll(/\S+/g)].map((m) => ({ raw: m[0], end: (m.index ?? 0) + m[0].length }));
  const kept: typeof tokens = [];
  for (const tok of tokens) {
    const t = tok.raw.replace(/[,.;:!?]+$/, "");
    const key = t.toLowerCase();
    if (!t || NOT_A_NAME.has(key) || /\d/.test(t)) break;
    if (lowerCaseAllowed && !/^[A-ZÑ]/.test(t) && COMMAND_WORDS.has(key)) break;
    if (!lowerCaseAllowed && !/^[A-ZÑ]/.test(t) && !PARTICLE_WORD.test(t)) break;
    kept.push(tok);
    // Punctuation ends the name ("si Juan, close lane 2"), except an initial's or a suffix's own full stop.
    if (tok.raw !== t && !/^(?:[A-Z]|Jr|Sr)\.$/.test(tok.raw)) break;
  }
  // Trailing particles are not part of a name -- and nothing at all is not a name.
  while (kept.length && PARTICLE_WORD.test(kept[kept.length - 1].raw.replace(/[,.;:!?]+$/, ""))) kept.pop();
  if (!kept.length) return null;
  const last = kept[kept.length - 1];
  const name = kept.map((k) => k.raw).join(" ").replace(/[,;:!?]+$/, "");
  if (isPlace(name)) return null;
  const restOfCandidate = candidate.slice(last.end);
  const nextWord = (restOfCandidate + after).replace(/^[\s.]+/, "").split(/[\s,.;:!?]+/)[0]?.toLowerCase() ?? "";
  if (NAMED_FOR.has(nextWord)) return null;
  const trailingPunct = last.raw.match(/[,;:!?]+$/)?.[0] ?? (/^(?:[A-Z]|Jr|Sr)\.$/.test(last.raw) ? "" : last.raw.match(/\.+$/)?.[0] ?? "");
  return `${cue}[name]${trailingPunct}${restOfCandidate}`;
}

/** Mask people's names introduced by a cue. Exported for the unit test (tests/unit/pii-names.test.ts). */
export function maskNames(text: string): { text: string; masked: number } {
  let masked = 0;
  const run = (input: string, re: RegExp, lowerCaseAllowed: boolean) =>
    input.replace(re, (whole: string, cue: string, candidate: string, offset: number, all: string) => {
      const out = maskCandidate(cue, candidate, all.slice(offset + whole.length), lowerCaseAllowed);
      if (out == null) return whole;
      masked++;
      return out;
    });
  let out = run(text, SELF_NAME, true);
  out = run(out, I_AM_NAME, false);
  out = run(out, CUED_NAME, false);
  return { text: out, masked };
}

export function maskPersonalDetails(text: string): { text: string; masked: number } {
  let masked = 0;
  const plate = () => { masked++; return "[plate]"; };
  const out = text
    .replace(EMAIL, () => { masked++; return "[email]"; })
    .replace(PH_MOBILE, () => { masked++; return "[phone]"; })
    .replace(PLATE, plate)
    .replace(PLATE_LOWER_GLUED, plate)
    .replace(PLATE_DIGITS_FIRST, plate);
  // Names last, so an address such as juan.santos@... is already "[email]" (24 Nov 2026).
  const names = maskNames(out);
  return { text: names.text, masked: masked + names.masked };
}

/**
 * The same masking for every string inside a parsed request body (24 Nov 2026): the narrative endpoints take labels,
 * reasons and event titles from the page, and any of them could carry a name or a number someone typed. Only
 * strings change; numbers, booleans and the shape of the object stay exactly as validated.
 */
export function maskStringsDeep<T>(value: T): T {
  if (typeof value === "string") return maskPersonalDetails(value).text as T;
  if (Array.isArray(value)) return value.map((v) => maskStringsDeep(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = maskStringsDeep(v);
    return out as T;
  }
  return value;
}
