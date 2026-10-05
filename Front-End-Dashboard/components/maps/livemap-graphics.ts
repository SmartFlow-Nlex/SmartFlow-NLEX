/**
 * Night Corridor map graphics for the Live Map (REDESIGN_PROMPT.md 5c).
 *
 * Every helper here draws from values the map already holds -- the snapped jam
 * features, the corridor ribbons and their levels, the report pins -- and
 * draws nothing, or the no-data style, where a value is missing. None of them
 * changes what the existing layers show.
 */
import type mapboxgl from "mapbox-gl";
import type { MapPalette } from "../../lib/map-palette";
import { corridorKm } from "./corridor-km";

/* ------------------------------------------------------------------------ */
/* Style images                                                              */
/* ------------------------------------------------------------------------ */

const paint = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): ImageData | null => {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  draw(ctx);
  return ctx.getImageData(0, 0, w, h);
};

const rgba = (px: Uint8ClampedArray, i: number, rgb: readonly number[], a: number) => {
  px[i] = rgb[0];
  px[i + 1] = rgb[1];
  px[i + 2] = rgb[2];
  px[i + 3] = Math.round(a * 255);
};

const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};

/**
 * The images the new layers use:
 *   lm-chevron-fwd / lm-chevron-back  the carriageway arrows, drawn as icons so
 *     they do not depend on a basemap's glyph server (the CARTO dark style has
 *     no glyph for the old "❯" character, so a text arrow would vanish there);
 *   lm-hatch                           the forecast finish's diagonal hatch;
 *   lm-closure                         the black-and-white closure stripes.
 */
export function addNightCorridorImages(map: mapboxgl.Map, P: MapPalette) {
  const arrow = P.arrow;
  const chevron = (dir: 1 | -1) =>
    paint(32, 32, (ctx) => {
      ctx.strokeStyle = arrow;
      ctx.lineWidth = 4.6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (dir === 1) {
        ctx.moveTo(11, 8);
        ctx.lineTo(21, 16);
        ctx.lineTo(11, 24);
      } else {
        ctx.moveTo(21, 8);
        ctx.lineTo(11, 16);
        ctx.lineTo(21, 24);
      }
      ctx.stroke();
    });
  const fwd = chevron(1);
  const back = chevron(-1);
  if (fwd && !map.hasImage("lm-chevron-fwd")) map.addImage("lm-chevron-fwd", fwd, { pixelRatio: 2 });
  if (back && !map.hasImage("lm-chevron-back")) map.addImage("lm-chevron-back", back, { pixelRatio: 2 });

  /* 16 px tile, stripes every 8 px at 45 degrees, so it tiles seamlessly; a
     line pattern is scaled to the line's width, so the stripes stay diagonal
     at every zoom. */
  const hatch = paint(16, 16, (ctx) => {
    const img = ctx.createImageData(16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        if ((x + y) % 8 < 3) rgba(img.data, i, P.hatch, P.hatchAlpha);
        else rgba(img.data, i, [0, 0, 0], 0);
      }
    ctx.putImageData(img, 0, 0);
  });
  if (hatch && !map.hasImage("lm-hatch")) map.addImage("lm-hatch", hatch);

  const light = hexRgb(P.ink === "#0b1220" ? "#ffffff" : "#e9edf5");
  const dark = hexRgb(P.ink === "#0b1220" ? "#283043" : "#121a2a");
  const closure = paint(16, 16, (ctx) => {
    const img = ctx.createImageData(16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) rgba(img.data, (y * 16 + x) * 4, (x + y) % 8 < 4 ? light : dark, 1);
    ctx.putImageData(img, 0, 0);
  });
  if (closure && !map.hasImage("lm-closure")) map.addImage("lm-closure", closure);
}

/* ------------------------------------------------------------------------ */
/* Directional flow dashes                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Speed bands for the flow dashes, in km/h of the jam's own measured speed
 * (Waze speed_kmh on a live jam; the typical in-jam speed the forecast carries
 * on a predicted queue). `rate` is how fast the dashes travel, in line widths
 * per second, roughly a tenth of the band's middle speed: a crawl stays a
 * crawl. Banding is only a quantisation of the measured value; a jam with no
 * speed is not banded at all and gets the static no-data dash.
 */
export const FLOW_BANDS = [
  { id: "b1", min: 0.01, max: 10, rate: 0.6 },
  { id: "b2", min: 10, max: 20, rate: 1.5 },
  { id: "b3", min: 20, max: 40, rate: 3 },
  { id: "b4", min: 40, max: 70, rate: 5.5 },
  { id: "b5", min: 70, max: 100000, rate: 8 },
] as const;

const DASH = 1.1;
const GAP = 2.2;
const PERIOD = DASH + GAP;
const STEP = 0.1;

/** The dash pattern shifted `s` line widths along the line (0 <= s < period). */
export function dashAt(s: number): number[] {
  return s < DASH ? [DASH - s, GAP, s, 0] : [0, PERIOD - s, DASH, s - DASH];
}

/** Quantised phase for a band at time `ms`: northbound travels up the line, southbound down it. */
export function dashPhase(ms: number, rate: number, dir: "NB" | "SB"): number {
  const travelled = (ms / 1000) * rate * (dir === "NB" ? -1 : 1);
  const s = ((travelled % PERIOD) + PERIOD) % PERIOD;
  return (Math.round(s / STEP) * STEP) % PERIOD;
}

export const STATIC_DASH = [DASH, GAP];

/* ------------------------------------------------------------------------ */
/* Formatting, matching the queue card                                       */
/* ------------------------------------------------------------------------ */

export const fmtDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`;

export const fmtDelayShort = (sec: number) => {
  const m = Math.round(sec / 60);
  return m < 1 ? "+<1 min" : m < 60 ? `+${m} min` : `+${Math.floor(m / 60)} h ${m % 60} min`;
};

/** "1.2 km · +8 min · SB" from a jam's real values; a value Waze did not send is left out. */
export function calloutText(p: Record<string, unknown>): string {
  const pre = p.predicted === true ? "~" : "";
  const len = p.length_m == null ? null : Number(p.length_m);
  const delay = p.delay_seconds == null ? null : Number(p.delay_seconds);
  const parts: string[] = [];
  if (len != null && Number.isFinite(len) && len > 0) parts.push(pre + fmtDistance(len));
  // A predicted delay is typical, so it reads like the card's "~4 min".
  if (delay != null && Number.isFinite(delay) && delay > 0) parts.push(pre ? fmtDelayShort(delay).replace("+", "~") : fmtDelayShort(delay));
  if (p.direction === "NB" || p.direction === "SB") parts.push(String(p.direction));
  return parts.join(" · ");
}

export const levelWord = (lvl: number) => (lvl >= 3 ? "congested" : lvl >= 1 ? "slow" : lvl >= 0 ? "clear" : "nodata");

/** Screen shift that puts a point on its carriageway: the ribbons' own line-offset, east for NB. */
export function carriagewayShift(zoom: number, dir: "NB" | "SB" | null): number {
  if (!dir) return 0;
  const px = zoom <= 15 ? 7 : 7 + ((Math.pow(2, Math.min(zoom, 18) - 15) - 1) / 7) * 17;
  return dir === "NB" ? px : -px;
}

/* ------------------------------------------------------------------------ */
/* Jam callouts                                                              */
/* ------------------------------------------------------------------------ */

type Box = { x0: number; x1: number; y0: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * A small leader-line label per queue: its real length, delay and direction,
 * set out from the queue's head on the side of its own carriageway. Labels
 * that would land on another label or on an exit name stand down until the
 * zoom makes room, worst queues first.
 */
export function createJamCallouts(
  map: mapboxgl.Map,
  Marker: typeof mapboxgl.Marker,
  container: HTMLElement,
) {
  type Item = {
    marker: mapboxgl.Marker;
    el: HTMLElement;
    plate: HTMLElement;
    at: [number, number];
    dir: "NB" | "SB";
    prio: number;
    w: number;
  };
  let items: Item[] = [];

  const clear = () => {
    items.forEach((it) => it.marker.remove());
    items = [];
  };

  const set = (features: GeoJSON.Feature[]) => {
    clear();
    for (const f of features) {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      if (p.feature_type !== "jam_mark" || p.direction_source == null || f.geometry?.type !== "Point") continue;
      const dir = p.direction === "SB" ? "SB" : p.direction === "NB" ? "NB" : null;
      if (!dir) continue;
      const text = calloutText(p);
      if (!text) continue;
      const lvl = Number(p.level ?? -1);
      const el = document.createElement("div");
      el.className = "lm-callout";
      el.dataset.level = levelWord(lvl);
      el.dataset.side = dir === "NB" ? "east" : "west";
      if (p.predicted === true) el.dataset.predicted = "1";
      el.setAttribute("aria-hidden", "true");
      const lead = document.createElement("span");
      lead.className = "lm-callout-lead";
      const plate = document.createElement("span");
      plate.className = "lm-callout-plate";
      plate.textContent = text;
      el.append(lead, plate);
      const at = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const marker = new Marker({ element: el, anchor: "center" }).setLngLat(at).addTo(map);
      items.push({
        marker,
        el,
        plate,
        at,
        dir,
        prio: lvl * 100000 + Number(p.length_m ?? 0),
        w: 0,
      });
    }
    layout();
  };

  const layout = () => {
    if (!items.length) return;
    const zoom = map.getZoom();
    const crect = container.getBoundingClientRect();
    const width = container.clientWidth;
    const height = container.clientHeight;
    const obstacles: Box[] = [];
    container.querySelectorAll<HTMLElement>(".custom-toll-marker .toll-pin-name").forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.width === 0) return;
      obstacles.push({ x0: r.left - crect.left, x1: r.right - crect.left, y0: r.top - crect.top, y1: r.bottom - crect.top });
    });
    const placed: Box[] = [];
    /* Worst first, and only a few across the whole corridor: at corridor
       zoom a dozen labels bury the road they describe. Zooming in lifts the
       cap; every queue keeps its glow and its card either way. */
    const cap = zoom < 10.5 ? 4 : zoom < 12 ? 8 : Infinity;
    let shown = 0;
    for (const it of [...items].sort((a, b) => b.prio - a.prio)) {
      const shift = carriagewayShift(zoom, it.dir);
      it.marker.setOffset([shift, 0]);
      if (!it.w) it.w = it.plate.offsetWidth || 90;
      const p = map.project(it.at);
      const x = p.x + shift;
      const east = it.dir === "NB";
      const box: Box = east
        ? { x0: x + 16, x1: x + 16 + it.w, y0: p.y - 40, y1: p.y - 18 }
        : { x0: x - 16 - it.w, x1: x - 16, y0: p.y - 40, y1: p.y - 18 };
      const off = box.x0 < 2 || box.x1 > width - 2 || box.y0 < 2 || p.y > height + 8;
      const hit = placed.some((b) => overlaps(box, b)) || obstacles.some((b) => overlaps(box, b));
      const show = !off && !hit && shown < cap;
      if (show) shown++;
      it.el.style.visibility = show ? "visible" : "hidden";
      if (show) placed.push({ x0: box.x0 - 4, x1: box.x1 + 4, y0: box.y0 - 3, y1: box.y1 + 3 });
    }
  };

  return { set, layout, clear };
}

/* ------------------------------------------------------------------------ */
/* Corridor strip snapshot                                                   */
/* ------------------------------------------------------------------------ */

export type StripSegment = { order: number; dir: "NB" | "SB"; from: number; to: number; level: number; name: string };
export type StripJam = {
  dir: "NB" | "SB";
  from: number;
  to: number;
  level: number;
  lengthM: number | null;
  delayS: number | null;
  speed: number | null;
  predicted: boolean;
  where: string | null;
};
export type StripAlert = {
  km: number;
  dir: "NB" | "SB" | null;
  type: string;
  unconfirmed: boolean;
  detail: Record<string, unknown>;
};
export type CorridorSnapshot = {
  kind: "live" | "forecast";
  segments: StripSegment[];
  jams: StripJam[];
  tails: { dir: "NB" | "SB"; from: number; to: number; level: number }[];
  alerts: StripAlert[];
  /** hours_ahead the forecast rows carry, straight from the payload. */
  hoursAhead: number | null;
  /** The live feed's own freshness block (/real-time `feed`), or null. */
  feed: { newestAt: string | null; ageMinutes: number | null; stale: boolean } | null;
  receivedAt: number;
};

const lineKm = (coords: number[][]): [number, number] | null => {
  if (!coords || coords.length < 2) return null;
  const K = corridorKm();
  const a = K.locate(coords[0]).km;
  const b = K.locate(coords[coords.length - 1]).km;
  return [Math.min(a, b), Math.max(a, b)];
};

/**
 * What the strip needs, from exactly what the map was just handed: the
 * corridor ribbons with their levels, the snapped queues, the forecast tails
 * and the report pins.
 */
export function buildSnapshot(args: {
  kind: "live" | "forecast";
  feed: GeoJSON.FeatureCollection & { feed?: unknown };
  corridor: GeoJSON.FeatureCollection;
  exitKmByOrder: number[];
  alertOf: (p: Record<string, unknown>, coords: [number, number]) => StripAlert | null;
}): CorridorSnapshot {
  const { kind, feed, corridor, exitKmByOrder, alertOf } = args;
  const segments: StripSegment[] = [];
  for (const f of corridor.features ?? []) {
    const q = f.properties as { segment_order?: number; direction?: string; level?: number; segment_name?: string } | null;
    if (!q?.segment_order) continue;
    const from = exitKmByOrder[q.segment_order - 1];
    const to = exitKmByOrder[q.segment_order];
    if (from == null || to == null) continue;
    segments.push({
      order: q.segment_order,
      dir: q.direction === "SB" ? "SB" : "NB",
      from,
      to,
      level: Number(q.level ?? -1),
      name: String(q.segment_name ?? ""),
    });
  }
  const jams: StripJam[] = [];
  const tails: CorridorSnapshot["tails"] = [];
  const alerts: StripAlert[] = [];
  let hoursAhead: number | null = null;
  for (const f of feed.features ?? []) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (p.feature_type === "forecast" && p.hours_ahead != null && Number.isFinite(Number(p.hours_ahead))) {
      hoursAhead = Math.max(hoursAhead ?? 0, Number(p.hours_ahead));
    }
    if (p.feature_type === "jam" && p.direction_source != null && f.geometry?.type === "LineString") {
      const span = lineKm(f.geometry.coordinates as number[][]);
      if (!span) continue;
      jams.push({
        dir: p.direction === "SB" ? "SB" : "NB",
        from: span[0],
        to: span[1],
        level: Number(p.level ?? -1),
        lengthM: p.length_m == null ? null : Number(p.length_m),
        delayS: p.delay_seconds == null ? null : Number(p.delay_seconds),
        speed: p.speed == null ? null : Number(p.speed),
        predicted: p.predicted === true,
        where: typeof p.nearest_exit === "string" ? p.nearest_exit : null,
      });
    } else if (p.feature_type === "jam_tail" && f.geometry?.type === "LineString") {
      const span = lineKm(f.geometry.coordinates as number[][]);
      if (span) tails.push({ dir: p.direction === "SB" ? "SB" : "NB", from: span[0], to: span[1], level: Number(p.level ?? -1) });
    } else if (p.feature_type === "alert" && f.geometry?.type === "Point" && p.type !== "JAM") {
      const a = alertOf(p, f.geometry.coordinates as [number, number]);
      if (a) alerts.push(a);
    }
  }
  const raw = (feed as { feed?: { newestAt?: string | null; ageMinutes?: number | null; stale?: boolean } }).feed;
  return {
    kind,
    segments,
    jams,
    tails,
    alerts,
    hoursAhead,
    feed: raw ? { newestAt: raw.newestAt ?? null, ageMinutes: raw.ageMinutes ?? null, stale: !!raw.stale } : null,
    receivedAt: Date.now(),
  };
}
