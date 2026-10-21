/* The km a person is shown, everywhere: the official NLEX km post.
 *
 * Written twice: Front-End-Dashboard/lib/km-post.ts and
 * Back-End/src/lib/km-post.ts, identical but for kmPostSql() at the end of the
 * backend copy. The two packages cannot import from each other.
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
