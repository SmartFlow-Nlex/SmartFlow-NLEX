import { db } from "../config/db.js";
import { cached } from "../utils/ttl-cache.js";

/**
 * Rain falling on the corridor NOW, per exit, for the Live Map (11 Nov 2026, user request).
 *
 * Source: Open-Meteo's forecast service, `current=` block, at the same twenty exit points the weather table holds
 * (public.hourly_weather, one point per exit). `current` is the model's 15-minute nowcast: `precipitation` is the
 * rain that fell in the 15 minutes before `time`. Free, no key, one request for all twenty points; only the exits'
 * public coordinates are sent.
 *
 * Why not just the weather table: its hourly job (fetch_weather_open_meteo.py) reads Open-Meteo's historical
 * service, which runs about two hours behind, and only while this PC is on. It is still the fallback when
 * Open-Meteo cannot be reached, as long as its newest hour is at most three hours old; older than that is not
 * "live" and nothing is shown.
 *
 * Intensity follows PAGASA's rainfall-intensity bands (mm per hour): light < 2.5, moderate 2.5-7.5,
 * heavy 7.5-15, intense 15 and above (PAGASA's intense and torrential together).
 */

export type RainIntensity = "none" | "light" | "moderate" | "heavy" | "intense";

export type LiveRainPoint = {
  name: string;
  lat: number;
  lon: number;
  /** Rain in the interval before `asOf`, mm. */
  mm: number;
  /** The same as a rate, mm per hour. */
  mmPerHour: number;
  raining: boolean;
  intensity: RainIntensity;
  thunder: boolean;
  /** WMO weather code (Open-Meteo); null from the weather table. */
  code: number | null;
  /** Air temperature at 2 m, degrees C; null when the source did not give one. */
  tempC: number | null;
};

/** The corridor as one reading, for the Map's live band (13 Nov 2026): the mean temperature across the exits and
 *  the condition most of them report. */
export type CorridorWeather = {
  tempC: number | null;
  /** "Clear", "Partly cloudy", "Light rain", ...; null when no exit reported a condition (weather-table fallback). */
  condition: string | null;
  /** The WMO code behind `condition`. */
  code: number | null;
};

export type LiveRain = {
  /** Manila wall time the reading describes, ISO with +08:00. */
  asOf: string;
  source: "open-meteo-current" | "weather-table";
  intervalMin: number;
  points: LiveRainPoint[];
  rainingCount: number;
  corridor: CorridorWeather;
};

/* Five minutes, the map's own poll. Open-Meteo's current block is a 15-minute slot, but its value for that slot can
   change as newer model data arrives (a trace drizzle at Balintawak read 0.0, then 0.1, for the same 21:15 slot on
   11 Nov 2026), so a longer hold showed a stale "dry" for up to a quarter of an hour. */
const CACHE_MS = 5 * 60_000;
const POINTS_CACHE_MS = 24 * 60 * 60_000;
const TABLE_MAX_AGE_H = 3;

/* WMO codes that mean precipitation is falling: drizzle 51-57, rain 61-67, showers 80-82, thunderstorm 95-99
   (snow codes cannot occur here). */
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const THUNDER_CODES = new Set([95, 96, 99]);

/* WMO weather codes in words, as Open-Meteo documents them. */
export function conditionOf(code: number | null): string | null {
  if (code == null) return null;
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code === 61 || code === 80) return "Light rain";
  if (code === 63 || code === 81) return "Rain";
  if (code === 65 || code === 82 || code === 66 || code === 67) return "Heavy rain";
  if (code >= 95) return "Thunderstorm";
  return null;
}

/* One reading for the corridor: the mean temperature, and the condition most exits share. Rain is named whenever a
   quarter or more of the exits have it, even if the rest are dry, because that is the condition that matters on the
   road; the wettest code among them is the one named. */
function corridorOf(points: LiveRainPoint[]): CorridorWeather {
  const temps = points.map((p) => p.tempC).filter((t): t is number => t != null && Number.isFinite(t));
  const tempC = temps.length ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null;
  const codes = points.map((p) => p.code).filter((c): c is number => c != null);
  if (!codes.length) {
    const wet = points.filter((p) => p.raining).length;
    return { tempC, condition: wet > 0 ? (wet >= points.length / 4 ? "Rain" : null) : null, code: null };
  }
  const wetCodes = codes.filter((c) => RAIN_CODES.has(c));
  if (wetCodes.length && wetCodes.length >= codes.length / 4) {
    const code = Math.max(...wetCodes);
    return { tempC, condition: conditionOf(code), code };
  }
  const count = new Map<number, number>();
  for (const c of codes) count.set(c, (count.get(c) ?? 0) + 1);
  const code = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  return { tempC, condition: conditionOf(code), code };
}

export function intensityOf(mmPerHour: number, raining: boolean): RainIntensity {
  if (!raining) return "none";
  if (mmPerHour >= 15) return "intense";
  if (mmPerHour >= 7.5) return "heavy";
  if (mmPerHour >= 2.5) return "moderate";
  return "light";
}

type Pt = { name: string; lat: number; lon: number };

async function exitPoints(): Promise<Pt[] | null> {
  return cached("live-rain:points", POINTS_CACHE_MS, async () => {
    if (!db) return null;
    try {
      const r = await db.query<{ name: string; lat: string | number; lon: string | number }>(
        `SELECT DISTINCT ON (location_name) location_name AS name, latitude AS lat, longitude AS lon
           FROM public.hourly_weather
          WHERE timestamp_utc > now() - interval '7 days'
          ORDER BY location_name, timestamp_utc DESC`,
      );
      const pts = r.rows
        .map((x) => ({ name: x.name, lat: Number(x.lat), lon: Number(x.lon) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .sort((a, b) => a.lat - b.lat);
      return pts.length ? pts : null;
    } catch (err) {
      console.error("live-rain: exit points unavailable:", (err as Error).message);
      return null;
    }
  });
}

/** "2026-11-11T21:00" (Manila, from Open-Meteo with timezone=Asia/Manila) -> "2026-11-11T21:00:00+08:00". */
const manilaIso = (local: string) => (local.length === 16 ? `${local}:00+08:00` : `${local}+08:00`);

async function fromOpenMeteo(pts: Pt[]): Promise<LiveRain | null> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${pts.map((p) => p.lat.toFixed(5)).join(",")}` +
    `&longitude=${pts.map((p) => p.lon.toFixed(5)).join(",")}` +
    "&current=precipitation,weather_code,temperature_2m&timezone=Asia%2FManila";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as unknown;
    const list = (Array.isArray(body) ? body : [body]) as {
      current?: { time?: string; interval?: number; precipitation?: number; weather_code?: number; temperature_2m?: number };
    }[];
    if (list.length !== pts.length) throw new Error(`expected ${pts.length} points, got ${list.length}`);
    let asOf = "";
    let intervalS = 900;
    const points = pts.map((p, i) => {
      const c = list[i]?.current ?? {};
      if (c.time && c.time > asOf) asOf = c.time;
      if (Number(c.interval) > 0) intervalS = Number(c.interval);
      const mm = Math.max(0, Number(c.precipitation ?? 0)) || 0;
      const code = Number.isFinite(Number(c.weather_code)) ? Number(c.weather_code) : null;
      const raining = mm > 0 || (code != null && RAIN_CODES.has(code));
      const mmPerHour = Math.round(((mm * 3600) / (Number(c.interval) > 0 ? Number(c.interval) : 900)) * 10) / 10;
      return {
        ...p, mm, mmPerHour, raining, intensity: intensityOf(mmPerHour, raining),
        thunder: code != null && THUNDER_CODES.has(code), code,
        tempC: Number.isFinite(Number(c.temperature_2m)) ? Number(c.temperature_2m) : null,
      };
    });
    if (!asOf) throw new Error("no current time in the response");
    return {
      asOf: manilaIso(asOf), source: "open-meteo-current", intervalMin: Math.round(intervalS / 60), points,
      rainingCount: points.filter((p) => p.raining).length,
      corridor: corridorOf(points),
    };
  } catch (err) {
    console.warn("live-rain: Open-Meteo current unavailable, trying the weather table:", (err as Error).message);
    return null;
  }
}

async function fromWeatherTable(): Promise<LiveRain | null> {
  if (!db) return null;
  try {
    const r = await db.query<{ name: string; lat: string; lon: string; mm: string | null; t: string | null; at: string }>(
      `SELECT location_name AS name, latitude AS lat, longitude AS lon, rainfall AS mm, temperature AS t,
              to_char(timestamp_utc AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS') AS at
         FROM public.hourly_weather
        WHERE timestamp_utc = (SELECT max(timestamp_utc) FROM public.hourly_weather
                                WHERE timestamp_utc > now() - make_interval(hours => $1))`,
      [TABLE_MAX_AGE_H],
    );
    if (!r.rows.length) return null;
    const points = r.rows
      .map((x) => {
        const mm = Math.max(0, Number(x.mm ?? 0)) || 0;
        const raining = mm > 0;
        return {
          name: x.name, lat: Number(x.lat), lon: Number(x.lon), mm, mmPerHour: mm, raining,
          intensity: intensityOf(mm, raining), thunder: false, code: null,
          tempC: x.t == null || !Number.isFinite(Number(x.t)) ? null : Number(x.t),
        };
      })
      .sort((a, b) => a.lat - b.lat);
    return {
      asOf: `${r.rows[0].at}+08:00`, source: "weather-table", intervalMin: 60, points,
      rainingCount: points.filter((p) => p.raining).length,
      corridor: corridorOf(points),
    };
  } catch (err) {
    console.error("live-rain: weather table unavailable:", (err as Error).message);
    return null;
  }
}

/** Current rain at every exit; null when neither source has a reading from the last three hours. */
export async function getLiveRain(): Promise<LiveRain | null> {
  return cached("live-rain", CACHE_MS, async () => {
    const pts = await exitPoints();
    return (pts ? await fromOpenMeteo(pts) : null) ?? (await fromWeatherTable());
  });
}
