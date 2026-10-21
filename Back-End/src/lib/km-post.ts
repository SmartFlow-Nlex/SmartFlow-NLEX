/* The km a person is shown, everywhere: the official NLEX km post.
 *
 * Written twice: Front-End-Dashboard/lib/km-post.ts and
 * Back-End/src/lib/km-post.ts, identical but for the backend copy's exit names
 * (after KM_POST_END; the frontend names exits from its exit list, in
 * lib/nlex-exits.ts and lib/exit-lookup.ts) and kmPostSql() and the other SQL
 * helpers at its end. The two packages cannot import from each other.
 *
 * Two different numbers describe a place on the corridor, and both are kept:
 *
 *   - MEASURED km: where a thing really is, Balintawak (Km 12) plus its
 *     distance along the road's centreline. Every calculation uses this one:
 *     geometry, distances, lengths, rates per km, the sandbox's road. It is
 *     what the API returns as `km` and what the database stores.
 *   - OFFICIAL km post: the number the operator knows, from the official exit
 *     list below (user-supplied, 16 Oct 2026). Every km SHOWN uses this one.
 *
 * The two cannot simply be swapped. The official posts are whole numbers that
 * do not match the measured gaps (Balintawak to Harbor Link is 1.63 km of road
 * and 1 km of posts; Bocaue Barrier and Bocaue Interchange are 620 m apart and
 * share Km 27), so using them as distances would shorten, stretch and in one
 * place zero-out real lengths.
 *
 * kmPost() maps measured to official through the exits: each exit lands on
 * exactly its listed post, and a place between two exits gets the same share of
 * the way between their posts. So nothing shown between two exits can disagree
 * with them. Beyond either end of the corridor it carries on one for one.
 *
 * Older figures elsewhere were on two other scales; convert them first:
 *   - "ZERO" (Balintawak = 0, distance from the start; corridor_km, the gold
 *     spatial and weather tables, the old incident bins): measured = zero + 12.
 *   - DPWH chainage (StartKM / 1000, "Km 79+400"): already on the measured
 *     scale to within ~40 m (median offset 12.04 against our 12), so it goes
 *     through kmPost() as it is.
 */

/** [match key, measured km, official km post], south to north. */
const ANCHORS: readonly (readonly [string, number, number])[] = [
  ["balintawak", 12, 12],
  ["nlexharborlink", 13.63, 13],
  ["pasodeblasvalenzuela", 15.44, 15],
  ["meycauayan", 20.21, 20],
  ["marilao", 23.73, 23],
  ["cdvpharena", 26.05, 26],
  ["bocauebarrier", 27.2, 27],
  ["bocaueinterchange", 27.82, 27],
  ["tambubong", 28.81, 28],
  ["tabangguiguinto", 32.69, 32],
  ["balagtas", 33.09, 34],
  ["staritaguiguinto", 38.55, 38],
  ["pulilan", 45.33, 45],
  ["sansimon", 56.91, 56],
  ["sanfernando", 65.78, 65],
  ["mexico", 72.78, 72],
  ["angeles", 81.15, 81],
  ["dau", 83.05, 83],
  ["sctex", 85.23, 85],
  ["staines", 88.25, 87],
];

/** Lower-case letters and digits only, so "CDV/PH Arena", "Cdv/Ph Arena" and "cdv-ph arena" are one key. */
function keyOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const BY_KEY = new Map(ANCHORS.map(([k, m, p]) => [k, { measured: m, post: p }]));

/** The official km post of an exit, by name; undefined for a name not on the list. */
export function exitKmPost(name: string): number | undefined {
  return BY_KEY.get(keyOf(name))?.post;
}

/** The measured km of an exit, by name (where it really is); undefined for a name not on the list. */
export function exitMeasuredKm(name: string): number | undefined {
  return BY_KEY.get(keyOf(name))?.measured;
}

/** Official exits as [name key, measured, post] rows, south to north. */
export const KM_POST_ANCHORS = ANCHORS;

/** First and last official posts: Km 12 and Km 87. */
export const KM_POST_START = ANCHORS[0][2];
export const KM_POST_END = ANCHORS[ANCHORS.length - 1][2];

/* Each official exit's name as the dashboard prints it (Front-End-Dashboard/lib/nlex-exits.ts through its
   displayExitName), keyed as ANCHORS is. One map and one "nearest exit" for every backend text, so a km is
   named for the same exit in a narrative as on the page beside it (19 Oct 2026: the emissions Prescriptive
   cards and the maintenance narrative each had their own, one of them by post, one by measured km). Backend only. */
const EXIT_DISPLAY_NAME: Record<string, string> = {
  balintawak: "Balintawak", nlexharborlink: "NLEX Harbor Link", pasodeblasvalenzuela: "Paso de Blas Valenzuela",
  meycauayan: "Meycauayan", marilao: "Marilao", cdvpharena: "CDV/PH Arena", bocauebarrier: "Bocaue Barrier",
  bocaueinterchange: "Bocaue Interchange", tambubong: "Tambubong", tabangguiguinto: "Tabang Guiguinto",
  balagtas: "Balagtas", staritaguiguinto: "Sta. Rita Guiguinto", pulilan: "Pulilan", sansimon: "San Simon",
  sanfernando: "San Fernando", mexico: "Mexico", angeles: "Angeles", dau: "Dau", sctex: "SCTEX", staines: "Sta. Ines",
};

/** An official exit's display name, by its KM_POST_ANCHORS key. Backend only. */
export function exitDisplayName(key: string): string {
  return EXIT_DISPLAY_NAME[key] ?? key;
}

/**
 * The official exit nearest a MEASURED km, by display name. Nearest on the road, not by post: Bocaue Barrier
 * and Bocaue Interchange share Km 27, so by post every point between them would go to the Barrier. Backend only.
 */
export function nearestExitName(measured: number): string {
  let best = ANCHORS[0];
  for (const a of ANCHORS) if (Math.abs(a[1] - measured) < Math.abs(best[1] - measured)) best = a;
  return exitDisplayName(best[0]);
}

/** "near Pulilan" when one exit is nearest both ends of a measured stretch, else "Pulilan to San Simon", south
    to north: the wording of nearExitsText in the frontend's lib/exit-lookup.ts. Backend only. */
export function nearExitsText(aMeasured: number, bMeasured: number): string {
  const lo = nearestExitName(Math.min(aMeasured, bMeasured));
  const hi = nearestExitName(Math.max(aMeasured, bMeasured));
  return lo === hi ? `near ${lo}` : `${lo} to ${hi}`;
}

/** Measured km -> official km post. Exits land on their listed post exactly. */
export function kmPost(measured: number): number {
  if (!Number.isFinite(measured)) return measured;
  const first = ANCHORS[0];
  const last = ANCHORS[ANCHORS.length - 1];
  if (measured <= first[1]) return first[2] + (measured - first[1]);
  if (measured >= last[1]) return last[2] + (measured - last[1]);
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [, m0, p0] = ANCHORS[i];
    const [, m1, p1] = ANCHORS[i + 1];
    if (measured <= m1) return m1 === m0 ? p1 : p0 + ((measured - m0) / (m1 - m0)) * (p1 - p0);
  }
  return last[2];
}

/**
 * Official km post -> measured km: where to draw or store a post somebody typed
 * or picked. Where two exits share a post (Bocaue, Km 27) a post names a stretch,
 * not a point; the middle of that stretch is returned.
 */
export function kmMeasured(post: number): number {
  if (!Number.isFinite(post)) return post;
  const first = ANCHORS[0];
  const last = ANCHORS[ANCHORS.length - 1];
  if (post <= first[2]) return first[1] + (post - first[2]);
  if (post >= last[2]) return last[1] + (post - last[2]);
  // Every measured stretch whose posts cover this one; average the ends of a flat run.
  const hits: number[] = [];
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [, m0, p0] = ANCHORS[i];
    const [, m1, p1] = ANCHORS[i + 1];
    if (p0 === p1) {
      if (post === p0) hits.push(m0, m1);
    } else if (post >= p0 && post <= p1) {
      hits.push(m0 + ((post - p0) / (p1 - p0)) * (m1 - m0));
    }
  }
  if (hits.length === 0) return post;
  return (Math.min(...hits) + Math.max(...hits)) / 2;
}

/** A ZERO-scale figure (Balintawak = 0) as measured km. */
export function zeroToMeasured(zeroKm: number): number {
  return zeroKm + 12;
}

/**
 * The number to print after "Km": the official post, at most `digits`
 * decimals, trailing zeros dropped. An exit always prints whole ("Km 27").
 */
export function fmtKm(measured: number | null | undefined, digits = 1): string {
  if (measured == null || !Number.isFinite(measured)) return "—";
  const v = kmPost(measured);
  const f = 10 ** digits;
  const rounded = Math.round(v * f) / f;
  return String(Number(rounded.toFixed(digits)));
}

/** "Km a–b" for a measured span, each end as an official post. */
export function fmtKmRange(fromMeasured: number, toMeasured: number, digits = 1): string {
  return `Km ${fmtKm(fromMeasured, digits)}–${fmtKm(toMeasured, digits)}`;
}

/**
 * kmPost() as a SQL expression, for grouping in the database: `expr` is a
 * measured-km expression (e.g. "(corridor_km + 12)"). Backend only.
 */
export function kmPostSql(expr: string): string {
  const first = ANCHORS[0];
  const last = ANCHORS[ANCHORS.length - 1];
  const parts = [`WHEN (${expr}) <= ${first[1]} THEN ${first[2]} + ((${expr}) - ${first[1]})`];
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [, m0, p0] = ANCHORS[i];
    const [, m1, p1] = ANCHORS[i + 1];
    parts.push(
      m1 === m0
        ? `WHEN (${expr}) <= ${m1} THEN ${p1}`
        : `WHEN (${expr}) <= ${m1} THEN ${p0} + ((${expr}) - ${m0}) / ${m1 - m0} * ${p1 - p0}`,
    );
  }
  parts.push(`ELSE ${last[2]} + ((${expr}) - ${last[1]})`);
  return `(CASE ${parts.join(" ")} END)`;
}

/**
 * The official exits as a SQL VALUES list, `(key, measured, post)`, joined on
 * `kmKeySql(column)`: exit positions for queries that only have a name, in
 * place of gold.exit_km_post (hand-entered; it does not match the road). Backend only.
 */
export function exitKmValuesSql(): string {
  return `(VALUES ${ANCHORS.map(([k, m, p]) => `('${k}', ${m}::float8, ${p}::float8)`).join(", ")}) AS exit_km(key, measured, post)`;
}

/** The match key of a name column, as keyOf() builds it. Backend only. */
export function kmKeySql(col: string): string {
  return `lower(regexp_replace(${col}, '[^A-Za-z0-9]', '', 'g'))`;
}
