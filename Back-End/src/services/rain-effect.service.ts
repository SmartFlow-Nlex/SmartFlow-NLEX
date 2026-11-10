import { db } from "../config/db.js";
import { cached } from "../utils/ttl-cache.js";

/**
 * Rain's association with traffic, incidents and jams, like for like (9 Nov 2026, the user: "properly show the
 * association").
 *
 * The dashboard used to show weather as a raw correlation (rainfall r = -0.15 with daily volume). A raw correlation
 * mixes rain with the season it falls in: the rainy months are also school months and typhoon months. So every
 * rainy day here is compared only with DRY days of the SAME WEEKDAY within six weeks of it, the same kind of local
 * baseline the event-impact chart uses, and the effect is given per rain band so a dose-response shows (or does not).
 *
 * What it can and cannot claim: traffic cannot cause rain, so a difference that survives this matching is not
 * reverse causation; it is still an association, because something else that comes with rain (a class suspension,
 * say) is part of what is measured. The wording on the dashboard says "associated with", never "causes".
 *
 * Rules, shared with the rest of the dashboard:
 *  - Daily rain = the weather points averaged each hour (one per coordinate), summed over the Manila day. A rain day
 *    is at least 1.0 mm, as on the event-impact chart; a dry day is under 1.0 mm.
 *  - Hourly rain = the same hourly average. A wet hour is over 0.3 mm, as on the Dry/Wet toggle.
 *  - Left out: public holidays and the day either side, 24 Dec - 2 Jan, Philippine Arena event days, days with fewer
 *    than 20 recorded weather hours, and the 2026 record after 24 May, which still holds broken, missing and
 *    synthetic days (client re-extract pending; move RECORD_REAL_THROUGH when it is loaded).
 *  - Ranges are 95% intervals from resampling whole months (whole days for the hourly jam figures), because rainy
 *    days come in spells: resampling single days would make the ranges look tighter than the data supports.
 */

const RECORD_REAL_THROUGH = "2026-05-24";
const DRY_DAY_MM = 1.0;
const WET_HOUR_MM = 0.3;
const BASELINE_WINDOW_DAYS = 42;
const LIVE_JAMS_FROM = "2026-08-04"; // the live Waze feed's first day (see congestion-history)

const DAY_BANDS = [
  { band: "light" as const, from: 1, to: 10 },
  { band: "moderate" as const, from: 10, to: 30 },
  { band: "heavy" as const, from: 30, to: null },
];
const HOUR_BANDS = [
  { band: "light" as const, from: WET_HOUR_MM, to: 2.5 },
  { band: "moderate or heavy" as const, from: 2.5, to: null },
];

export type DayEffect = {
  band: string;
  mmFrom: number;
  mmTo: number | null;
  days: number;
  months: number;
  /** Percent change against dry same-weekday days nearby, and its 95% range. */
  effectPct: number | null;
  lowPct: number | null;
  highPct: number | null;
};

export type HourEffect = {
  band: string;
  mmPerHourFrom: number;
  mmPerHourTo: number | null;
  exitHours: number;
  days: number;
  jamPct: number | null;
  dryJamPct: number | null;
  jamDiffPts: number | null;
  jamLowPts: number | null;
  jamHighPts: number | null;
  delayMin: number | null;
  dryDelayMin: number | null;
  delayDiffMin: number | null;
  delayLowMin: number | null;
  delayHighMin: number | null;
};

/** Exit-hours with a Waze flood report against rainy hours without one, same exit, hour and part of the week. */
export type FloodEffect = {
  exitHours: number;
  days: number;
  jamPct: number | null;
  rainyJamPct: number | null;
  /** 95% range of the difference in jam share, in points. */
  jamLowPts: number | null;
  jamHighPts: number | null;
  delayMin: number | null;
  rainyDelayMin: number | null;
  /** 95% range of the difference in delay, in minutes. */
  delayLowMin: number | null;
  delayHighMin: number | null;
};

export type RainEffect = {
  volume: DayEffect[];
  accidents: { anyRain: DayEffect; bands: DayEffect[] };
  allIncidents: { anyRain: DayEffect };
  jams: { from: string; to: string | null; bands: HourEffect[]; flood: FloodEffect };
  method: {
    dryDayMm: number;
    wetHourMm: number;
    baselineWindowDays: number;
    recordThrough: string;
    daysUsed: number;
    dryDays: number;
  };
};

type Cluster = { sum: number; n: number };

/** 95% interval of the mean, resampling whole clusters. Seeded, so the dashboard shows the same range on every load. */
function clusterInterval(items: { cluster: string; v: number }[], reps = 2000): [number, number] | null {
  if (items.length === 0) return null;
  const by = new Map<string, Cluster>();
  for (const it of items) {
    const c = by.get(it.cluster) ?? { sum: 0, n: 0 };
    c.sum += it.v;
    c.n += 1;
    by.set(it.cluster, c);
  }
  const cl = [...by.values()];
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const means: number[] = [];
  for (let b = 0; b < reps; b++) {
    let s = 0;
    let n = 0;
    for (let i = 0; i < cl.length; i++) {
      const c = cl[Math.floor(rnd() * cl.length)];
      s += c.sum;
      n += c.n;
    }
    if (n > 0) means.push(s / n);
  }
  means.sort((a, z) => a - z);
  return [means[Math.floor(0.025 * means.length)], means[Math.min(means.length - 1, Math.floor(0.975 * means.length))]];
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const round = (v: number | null, dp = 1) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(dp)));

type DayRow = { d: string; vol: number; mm: number; acc: number; brk: number };

function dayEffect(
  rows: DayRow[],
  dryRows: DayRow[],
  band: { band: string; from: number; to: number | null },
  metric: (r: DayRow) => number,
): DayEffect {
  const t = (r: DayRow) => Date.parse(`${r.d}T00:00:00Z`) / 864e5;
  const eff: { cluster: string; v: number }[] = [];
  for (const r of rows) {
    if (r.mm < band.from || (band.to != null && r.mm >= band.to)) continue;
    const tr = t(r);
    const base = dryRows.filter((x) => {
      const dt = t(x) - tr;
      return dt % 7 === 0 && Math.abs(dt) <= BASELINE_WINDOW_DAYS && x.d !== r.d;
    });
    if (base.length < 2) continue;
    const bm = mean(base.map(metric));
    if (bm == null || !(bm > 0)) continue;
    eff.push({ cluster: r.d.slice(0, 7), v: metric(r) / bm - 1 });
  }
  const ci = clusterInterval(eff);
  const m = mean(eff.map((e) => e.v));
  return {
    band: band.band,
    mmFrom: band.from,
    mmTo: band.to,
    days: eff.length,
    months: new Set(eff.map((e) => e.cluster)).size,
    effectPct: round(m == null ? null : m * 100),
    lowPct: round(ci ? ci[0] * 100 : null),
    highPct: round(ci ? ci[1] * 100 : null),
  };
}

async function compute(): Promise<RainEffect | null> {
  if (!db) return null;
  const day = await db.query(
    `WITH pts AS (
       SELECT timestamp_utc, round(latitude::numeric, 3) la, round(longitude::numeric, 3) lo, AVG(rainfall) r
       FROM public.hourly_weather
       WHERE (timestamp_utc + interval '8 hours')::date <= $1::date
       GROUP BY 1, 2, 3),
     hr AS (SELECT timestamp_utc, AVG(r) r FROM pts GROUP BY 1),
     rain AS (SELECT (timestamp_utc + interval '8 hours')::date d, SUM(r) mm, COUNT(*) hours FROM hr GROUP BY 1),
     acc AS (SELECT event_start_date::date d, COUNT(*) n FROM silver.nlex_accident_events_clean GROUP BY 1),
     brk AS (SELECT event_encoded_date::date d, COUNT(*) n FROM silver.nlex_breakdown_events_clean GROUP BY 1)
     SELECT v.date::text d, v.total_volume::float vol, rain.mm::float mm,
            COALESCE(acc.n, 0)::int acc, COALESCE(brk.n, 0)::int brk
     FROM gold.daily_traffic_volume_corrected v
     JOIN rain ON rain.d = v.date
     LEFT JOIN acc ON acc.d = v.date
     LEFT JOIN brk ON brk.d = v.date
     WHERE v.total_volume > 0 AND v.date <= $1::date AND rain.hours >= 20
       AND NOT EXISTS (SELECT 1 FROM public.ph_holidays h WHERE h.date_day BETWEEN v.date - 1 AND v.date + 1)
       AND NOT EXISTS (SELECT 1 FROM philippine_arena_events e WHERE e.start_date = v.date)
       AND NOT (to_char(v.date, 'MM-DD') >= '12-24' OR to_char(v.date, 'MM-DD') <= '01-02')
     ORDER BY 1`,
    [RECORD_REAL_THROUGH],
  );
  const rows: DayRow[] = day.rows.map((r: any) => ({ d: r.d, vol: Number(r.vol), mm: Number(r.mm), acc: Number(r.acc), brk: Number(r.brk) }));
  const dryRows = rows.filter((r) => r.mm < DRY_DAY_MM);

  const vol = (r: DayRow) => r.vol;
  const accRate = (r: DayRow) => (r.acc / r.vol) * 1e6;
  const allRate = (r: DayRow) => ((r.acc + r.brk) / r.vol) * 1e6;
  const anyRain = { band: "any rain", from: DRY_DAY_MM, to: null };

  // Live jams, hour by hour: each wet hour at an exit against dry hours at the same exit, the same hour of day and the
  // same part of the week (weekday or weekend). A jam counts in every hour it lasted, up to 12 h, as on the flood check.
  const jam = await db.query(
    `WITH jams AS (
       SELECT nlex_exit_id e, delay_seconds,
              date_trunc('hour', first_seen_at + interval '8 hours') a,
              date_trunc('hour', COALESCE(cleared_at, last_seen_at, first_seen_at) + interval '8 hours') b
       FROM silver.fact_waze_jams WHERE nlex_exit_id IS NOT NULL AND first_seen_at >= $1::date - interval '8 hours'),
     jh AS (SELECT e, h, MAX(delay_seconds) dly FROM jams, generate_series(a, LEAST(b, a + interval '12 hours'), interval '1 hour') h GROUP BY 1, 2),
     lim AS (SELECT date_trunc('hour', MAX(first_seen_at) + interval '8 hours') - interval '1 hour' AS last FROM silver.fact_waze_jams),
     pts AS (SELECT timestamp_utc, round(latitude::numeric, 3) la, round(longitude::numeric, 3) lo, AVG(rainfall) r
             FROM public.hourly_weather WHERE timestamp_utc >= $1::date - interval '1 day' GROUP BY 1, 2, 3),
     wx AS (SELECT date_trunc('hour', timestamp_utc + interval '8 hours') h, AVG(r) r FROM pts GROUP BY 1),
     fl AS (SELECT DISTINCT nlex_exit_id e, h FROM silver.fact_incident_log,
              generate_series(date_trunc('hour', first_seen_at + interval '8 hours'),
                              LEAST(date_trunc('hour', COALESCE(cleared_at, last_seen_at, first_seen_at) + interval '8 hours'),
                                    date_trunc('hour', first_seen_at + interval '8 hours') + interval '12 hours'), interval '1 hour') h
            WHERE subtype = 'HAZARD_WEATHER_FLOOD' AND corridor_match = 'ON_CORRIDOR' AND nlex_exit_id IS NOT NULL),
     ex AS (SELECT DISTINCT e FROM jh),
     grid AS (SELECT ex.e, g.h FROM ex, lim, generate_series($1::timestamp, lim.last, interval '1 hour') g(h))
     SELECT g.e, g.h::date::text d, EXTRACT(hour FROM g.h)::int hod, (EXTRACT(isodow FROM g.h) >= 6) wkend,
            w.r::float r, (jh.e IS NOT NULL) jam, COALESCE(jh.dly, 0)::float dly,
            EXISTS (SELECT 1 FROM fl WHERE fl.e = g.e AND fl.h = g.h) flood
     FROM grid g JOIN wx w ON w.h = g.h LEFT JOIN jh ON jh.e = g.e AND jh.h = g.h`,
    [LIVE_JAMS_FROM],
  );
  type JamRow = { e: number; d: string; hod: number; wkend: boolean; r: number; jam: boolean; dly: number; flood: boolean };
  const jr: JamRow[] = jam.rows.map((x: any) => ({ e: x.e, d: x.d, hod: x.hod, wkend: x.wkend, r: Number(x.r), jam: x.jam, dly: Number(x.dly), flood: x.flood }));
  const cellKey = (x: JamRow) => `${x.e}|${x.hod}|${x.wkend}`;
  const dryCell = new Map<string, { jam: number; dly: number; n: number }>();
  for (const x of jr) {
    if (x.r > WET_HOUR_MM) continue;
    const c = dryCell.get(cellKey(x)) ?? { jam: 0, dly: 0, n: 0 };
    c.jam += x.jam ? 1 : 0;
    c.dly += x.dly;
    c.n += 1;
    dryCell.set(cellKey(x), c);
  }
  const hourBands: HourEffect[] = HOUR_BANDS.map((b) => {
    const dj: { cluster: string; v: number }[] = [];
    const dd: { cluster: string; v: number }[] = [];
    let wetJam = 0, dryJam = 0, wetDly = 0, dryDly = 0;
    for (const x of jr) {
      if (!(x.r > b.from) || (b.to != null && x.r >= b.to)) continue;
      const c = dryCell.get(cellKey(x));
      if (!c || c.n < 5) continue;
      const bj = c.jam / c.n;
      const bd = c.dly / c.n / 60;
      dj.push({ cluster: x.d, v: (x.jam ? 1 : 0) - bj });
      dd.push({ cluster: x.d, v: x.dly / 60 - bd });
      wetJam += x.jam ? 1 : 0;
      dryJam += bj;
      wetDly += x.dly / 60;
      dryDly += bd;
    }
    const n = dj.length;
    const ji = clusterInterval(dj);
    const di = clusterInterval(dd);
    return {
      band: b.band,
      mmPerHourFrom: b.from,
      mmPerHourTo: b.to,
      exitHours: n,
      days: new Set(dj.map((v) => v.cluster)).size,
      jamPct: round(n ? (wetJam / n) * 100 : null),
      dryJamPct: round(n ? (dryJam / n) * 100 : null),
      jamDiffPts: round(n ? (mean(dj.map((v) => v.v)) ?? 0) * 100 : null),
      jamLowPts: round(ji ? ji[0] * 100 : null),
      jamHighPts: round(ji ? ji[1] * 100 : null),
      delayMin: round(n ? wetDly / n : null),
      dryDelayMin: round(n ? dryDly / n : null),
      delayDiffMin: round(n ? mean(dd.map((v) => v.v)) : null),
      delayLowMin: round(di ? di[0] : null),
      delayHighMin: round(di ? di[1] : null),
    };
  });
  /* Flood reports (8-9 Nov 2026, the adviser's question): each exit-hour with an active Waze flood report against
     WET hours with no flood report at the same exit, hour of day and part of the week, so the comparison is flood
     against rain, not flood against a dry road. Drivers already stuck may report water more readily, so this is the
     weakest of the associations here: shown as a link, never a cause. */
  const wetCell = new Map<string, { jam: number; dly: number; n: number }>();
  for (const x of jr) {
    if (!(x.r > WET_HOUR_MM) || x.flood) continue;
    const c = wetCell.get(cellKey(x)) ?? { jam: 0, dly: 0, n: 0 };
    c.jam += x.jam ? 1 : 0;
    c.dly += x.dly;
    c.n += 1;
    wetCell.set(cellKey(x), c);
  }
  const fj: { cluster: string; v: number }[] = [];
  const fd: { cluster: string; v: number }[] = [];
  let fJam = 0, wJam = 0, fDly = 0, wDly = 0;
  for (const x of jr) {
    if (!x.flood) continue;
    const c = wetCell.get(cellKey(x));
    if (!c || c.n < 3) continue;
    const bj = c.jam / c.n;
    const bd = c.dly / c.n / 60;
    fj.push({ cluster: x.d, v: (x.jam ? 1 : 0) - bj });
    fd.push({ cluster: x.d, v: x.dly / 60 - bd });
    fJam += x.jam ? 1 : 0; wJam += bj; fDly += x.dly / 60; wDly += bd;
  }
  const fn = fj.length;
  const fji = clusterInterval(fj);
  const fdi = clusterInterval(fd);
  const flood: FloodEffect = {
    exitHours: fn,
    days: new Set(fj.map((v) => v.cluster)).size,
    jamPct: round(fn ? (fJam / fn) * 100 : null),
    rainyJamPct: round(fn ? (wJam / fn) * 100 : null),
    jamLowPts: round(fji ? fji[0] * 100 : null),
    jamHighPts: round(fji ? fji[1] * 100 : null),
    delayMin: round(fn ? fDly / fn : null),
    rainyDelayMin: round(fn ? wDly / fn : null),
    delayLowMin: round(fdi ? fdi[0] : null),
    delayHighMin: round(fdi ? fdi[1] : null),
  };
  const lastJamDay = jr.length ? jr.reduce((m, x) => (x.d > m ? x.d : m), jr[0].d) : null;

  return {
    volume: DAY_BANDS.map((b) => dayEffect(rows, dryRows, b, vol)),
    accidents: {
      anyRain: dayEffect(rows, dryRows, anyRain, accRate),
      bands: DAY_BANDS.map((b) => dayEffect(rows, dryRows, b, accRate)),
    },
    allIncidents: { anyRain: dayEffect(rows, dryRows, anyRain, allRate) },
    jams: { from: LIVE_JAMS_FROM, to: lastJamDay, bands: hourBands, flood },
    method: {
      dryDayMm: DRY_DAY_MM,
      wetHourMm: WET_HOUR_MM,
      baselineWindowDays: BASELINE_WINDOW_DAYS,
      recordThrough: RECORD_REAL_THROUGH,
      daysUsed: rows.length,
      dryDays: dryRows.length,
    },
  };
}

/** Six hours: the daily record changes only on an upload, and the live jam figures move slowly. */
export async function getRainEffect(): Promise<RainEffect | null> {
  try {
    return await cached("rain-effect", 6 * 60 * 60_000, compute);
  } catch (error) {
    console.error("Rain effect computation failed:", error);
    return null;
  }
}
