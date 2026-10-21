import type { SceneMark } from "./scenarios/adapter";
import type { FamilyKey } from "./scenarios/catalogue";
import type { RainIntensity } from "./scenarios/assumptions";

/**
 * Canvas art for scenario events: what each one looks like ON THE ROAD, in place of the amber triangle
 * marker every family used to get. Pure drawing, no React and no engine: everything here reads a
 * SceneMark (adapter.ts's sceneMarks — the family, the running phase and how far through it, the lanes
 * and stretch the event is actually holding) plus the geometry render() already computed, and paints.
 *
 * Nothing here changes what the engine does. A wreck is drawn only where the closure the engine is
 * honouring says lanes are blocked (SceneMark.closedLanes is empty when an event yielded its closure to
 * the operator's), and responders arrive and leave by phase, so the picture stays a picture of the model,
 * not a second model. Animation runs off `g.t`, seconds of real time that stop while the run is paused.
 */

/**
 * The part of the 2D canvas context the scene art uses, and no more. A real CanvasRenderingContext2D
 * satisfies it, and so does a recording stand-in, which is how verify.ts runs the drawing code in Node and
 * checks what it paints (how much rain, that a paused clock freezes it, that a pending event draws nothing).
 */
export type SceneCtx = Pick<
  CanvasRenderingContext2D,
  | "save" | "restore" | "translate" | "scale" | "rotate" | "beginPath" | "closePath" | "moveTo" | "lineTo" | "arc" | "arcTo" | "ellipse" | "rect"
  | "fill" | "stroke" | "clip" | "fillRect" | "strokeRect" | "fillText" | "createLinearGradient" | "setLineDash"
  | "fillStyle" | "strokeStyle" | "lineWidth" | "lineJoin" | "font" | "textAlign" | "textBaseline"
>;

export type SceneGeometry = {
  readonly ctx: SceneCtx;
  readonly cssW: number;
  readonly roadTop: number;
  readonly roadH: number;
  readonly laneH: number;
  /** Metres along the road in the direction of travel -> screen x (mirrored for southbound). */
  readonly xPx: (m: number) => number;
  /** +1: traffic runs left to right on screen; -1: right to left. */
  readonly fwd: 1 | -1;
  /** Centre y of an engine lane's slot (accounts for Both mode's reversed NB block). */
  readonly laneCenterY: (engineLane: number) => number;
  /** Screen y of the road's outer (shoulder-side) edge, and which way "outward" points (-1 up, +1 down). */
  readonly outerEdgeY: number;
  readonly outward: 1 | -1;
  /** Size of a "hero" car in px: the scene's vehicles are drawn larger than traffic so they read as the event. */
  readonly carLen: number;
  readonly carWid: number;
  /** Seconds of animation clock; frozen while the run is paused. */
  readonly t: number;
  /** Ground past the road edge that rain falls on too: the toll plazas' and service areas' footprints, screen px
   *  (UAT 16 Oct 2026, SB-13: "Rain renders on the road but not at toll gates"). None: the road only, as before. */
  readonly wetAreas?: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[];
};

/* ── small helpers ─────────────────────────────────────────────────────────── */

/** Deterministic pseudo-random in [0, 1) from a number: stable drop positions without any per-drop state. */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (v: number): number => {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
};
/** 0 until `from`, 1 from `to`, eased in between. */
const ramp = (f: number, from: number, to: number): number => smooth((f - from) / Math.max(1e-6, to - from));
const wrap = (v: number, period: number): number => ((v % period) + period) % period;

function rrect(ctx: SceneCtx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Run `paint` in a local frame centred on (x, y), rotated `angle`, with +x pointing the way traffic travels. */
function inFrame(g: SceneGeometry, x: number, y: number, angle: number, paint: () => void): void {
  g.ctx.save();
  g.ctx.translate(x, y);
  g.ctx.scale(g.fwd, 1);
  g.ctx.rotate(angle);
  paint();
  g.ctx.restore();
}

/* ── vehicles (top-down, centred, nose toward +x) ──────────────────────────── */

type CarStyle = { readonly body: string; readonly roof: string; readonly glass: string };
const GLASS = "rgba(186,214,250,0.92)";

function paintCar(ctx: SceneCtx, len: number, wid: number, s: CarStyle): void {
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  rrect(ctx, -len / 2 + 1.5, -wid / 2 + 2.5, len, wid, wid * 0.32);
  ctx.fill();
  ctx.fillStyle = s.body;
  rrect(ctx, -len / 2, -wid / 2, len, wid, wid * 0.32);
  ctx.fill();
  ctx.fillStyle = s.glass;
  rrect(ctx, len * 0.14, -wid * 0.4, len * 0.2, wid * 0.8, wid * 0.14); // windscreen
  ctx.fill();
  rrect(ctx, -len * 0.38, -wid * 0.36, len * 0.12, wid * 0.72, wid * 0.1); // rear glass
  ctx.fill();
  ctx.fillStyle = s.roof;
  rrect(ctx, -len * 0.24, -wid * 0.36, len * 0.36, wid * 0.72, wid * 0.16);
  ctx.fill();
}

function paintTruck(ctx: SceneCtx, len: number, wid: number, cab: string, trailer: string): void {
  const cabLen = len * 0.27;
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  rrect(ctx, -len / 2 + 1.5, -wid / 2 + 2.5, len, wid, 3);
  ctx.fill();
  ctx.fillStyle = trailer;
  rrect(ctx, -len / 2, -wid / 2, len - cabLen - len * 0.03, wid, 2.5);
  ctx.fill();
  ctx.strokeStyle = "rgba(15,23,42,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = cab;
  rrect(ctx, len / 2 - cabLen, -wid * 0.46, cabLen, wid * 0.92, wid * 0.22);
  ctx.fill();
  ctx.fillStyle = GLASS;
  rrect(ctx, len / 2 - cabLen * 0.45, -wid * 0.36, cabLen * 0.32, wid * 0.72, wid * 0.1);
  ctx.fill();
}

/** Four amber lamps at the corners, lit half the time: the universal "I am stopped" signal. */
function paintHazards(ctx: SceneCtx, len: number, wid: number, on: boolean): void {
  if (!on) return;
  const r = Math.max(1.6, wid * 0.12);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = (sx * len) / 2;
      const y = sy * wid * 0.42;
      ctx.fillStyle = "rgba(251,191,36,0.28)";
      ctx.beginPath();
      ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** A roof light bar whose two halves alternate: police (red/blue), ambulance (red/white), tow (amber). */
function paintLightBar(ctx: SceneCtx, wid: number, t: number, a: string, b: string, rate: number, at = 0): void {
  const phase = Math.floor(t * rate) % 2 === 0;
  const w = wid * 0.34;
  for (const side of [-1, 1] as const) {
    const lit = (side === -1) === phase;
    const c = side === -1 ? a : b;
    ctx.fillStyle = lit ? c : "rgba(30,41,59,0.85)";
    rrect(ctx, at - w / 2, side === -1 ? -wid * 0.44 : wid * 0.44 - w, w, w, 1.2);
    ctx.fill();
    if (lit) {
      ctx.fillStyle = c.replace(")", ",0.30)").replace("rgb(", "rgba(");
      ctx.beginPath();
      ctx.arc(at, side * wid * 0.28, wid * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPolice(g: SceneGeometry, x: number, y: number, angle = 0): void {
  const len = g.carLen * 1.05;
  const wid = g.carWid;
  inFrame(g, x, y, angle, () => {
    paintCar(g.ctx, len, wid, { body: "#f8fafc", roof: "#1e3a8a", glass: GLASS });
    paintLightBar(g.ctx, wid, g.t, "rgb(239,68,68)", "rgb(59,130,246)", 5, len * 0.02);
  });
}

function drawAmbulance(g: SceneGeometry, x: number, y: number): void {
  const len = g.carLen * 1.5;
  const wid = g.carWid * 1.08;
  inFrame(g, x, y, 0, () => {
    const c = g.ctx;
    paintCar(c, len, wid, { body: "#f8fafc", roof: "#e2e8f0", glass: GLASS });
    c.fillStyle = "#dc2626";
    c.fillRect(-len * 0.12, -wid * 0.09, len * 0.24, wid * 0.18); // cross
    c.fillRect(-len * 0.04, -wid * 0.25, len * 0.08, wid * 0.5);
    paintLightBar(c, wid, g.t, "rgb(239,68,68)", "rgb(248,250,252)", 4, len * 0.26);
  });
}

function drawTow(g: SceneGeometry, x: number, y: number, heavy = false): void {
  const len = g.carLen * (heavy ? 2.3 : 1.7);
  const wid = Math.min(g.laneH * 0.78, g.carWid * (heavy ? 1.25 : 1.1));
  inFrame(g, x, y, 0, () => {
    const c = g.ctx;
    paintTruck(c, len, wid, "#f59e0b", "#334155");
    c.fillStyle = "#f59e0b"; // flatbed markings
    c.fillRect(-len * 0.44, -wid * 0.08, len * 0.4, wid * 0.16);
    if (heavy) {
      c.strokeStyle = "#f59e0b"; // crane boom
      c.lineWidth = Math.max(1.5, wid * 0.12);
      c.beginPath();
      c.moveTo(-len * 0.05, 0);
      c.lineTo(-len * 0.5, wid * 0.32);
      c.stroke();
    }
    const on = Math.floor(g.t * 3) % 2 === 0;
    c.fillStyle = on ? "#fde047" : "#a16207";
    c.beginPath();
    c.arc(len * 0.2, 0, Math.max(2, wid * 0.16), 0, Math.PI * 2);
    c.fill();
    if (on) {
      c.fillStyle = "rgba(253,224,71,0.30)";
      c.beginPath();
      c.arc(len * 0.2, 0, wid * 0.8, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/* ── road furniture ─────────────────────────────────────────────────────────── */

function drawCone(g: SceneGeometry, x: number, y: number, r: number): void {
  const c = g.ctx;
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.arc(x + 1, y + 1.5, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#f97316";
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#f8fafc";
  c.beginPath();
  c.arc(x, y, r * 0.62, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#f97316";
  c.beginPath();
  c.arc(x, y, r * 0.3, 0, Math.PI * 2);
  c.fill();
}

/* ── people ──────────────────────────────────────────────────────────────────
 *
 * Seen from directly above, a standing person is a head and a pair of
 * shoulders — not a stick figure, which is a side-on idea and reads as a
 * smudge at this scale. Shoulders are an ellipse across the body's width, the
 * head a smaller circle inside it, and that silhouette is legible down to
 * about five pixels, which is where these end up on a laptop.
 *
 * `sway` gives each figure a small independent drift so a group does not look
 * like a row of pins. It is driven by the caller's clock and the figure's own
 * seed, so it stays smooth and does not depend on frame rate.
 */
export type PersonRole = "responder" | "civilian" | "worker" | "medic";

const PERSON_KIT: Record<PersonRole, { readonly torso: string; readonly vest: string | null; readonly head: string }> = {
  // Hi-vis over a dark uniform: the vest is what the eye picks up at this size.
  responder: { torso: "#1f2937", vest: "#fde047", head: "#6b4f3a" },
  worker: { torso: "#ea580c", vest: "#facc15", head: "#6b4f3a" },
  // Paramedics: white, with the red band of the ambulance service.
  medic: { torso: "#f1f5f9", vest: "#dc2626", head: "#6b4f3a" },
  // A driver who has got out of the car. No vest — that is the point of them:
  // the operator should be able to see who is protected and who is not.
  civilian: { torso: "#334155", vest: null, head: "#7a5a43" },
};

const CIVILIAN_SHIRTS = ["#2563eb", "#b91c1c", "#0f766e", "#f1f5f9", "#7c3aed", "#ea580c"];

export function drawPerson(
  g: SceneGeometry,
  x: number,
  y: number,
  role: PersonRole,
  seed: number,
  scale = 1,
): void {
  const c = g.ctx;
  const base = PERSON_KIT[role];
  // Drivers and passengers in their own clothes, so they read as people and not as dark dots on the tarmac.
  const kit = role === "civilian" ? { ...base, torso: CIVILIAN_SHIRTS[Math.abs(Math.round(seed)) % CIVILIAN_SHIRTS.length] } : base;
  // Shoulder half-width. Tied to lane height so people stay in proportion when
  // the canvas is short and the cars shrink with it.
  const w = Math.max(1.6, g.laneH * 0.105 * scale);
  const h = w * 1.18;
  // Weight shifting, not walking: a few tenths of a pixel, phase per figure.
  const sx = Math.sin(g.t * 1.7 + seed * 2.39) * w * 0.16;
  const sy = Math.cos(g.t * 1.3 + seed * 1.71) * w * 0.12;
  const px = x + sx;
  const py = y + sy;

  c.fillStyle = "rgba(0,0,0,0.30)";
  c.beginPath();
  c.ellipse(px + 0.8, py + 1.3, w, h * 0.92, 0, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = kit.torso;
  c.beginPath();
  c.ellipse(px, py, w, h, 0, 0, Math.PI * 2);
  c.fill();

  if (kit.vest) {
    // A band across the shoulders rather than a full fill, so the dark uniform
    // still reads underneath and the figure does not become a yellow blob.
    c.save();
    c.beginPath();
    c.ellipse(px, py, w, h, 0, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = kit.vest;
    c.fillRect(px - w, py - h * 0.34, w * 2, h * 0.68);
    c.restore();
  }

  c.fillStyle = kit.head;
  c.beginPath();
  c.arc(px, py - h * 0.1, w * 0.52, 0, Math.PI * 2);
  c.fill();
}

function drawBarrel(g: SceneGeometry, x: number, y: number, r: number): void {
  const c = g.ctx;
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.arc(x + 1, y + 1.5, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#f97316";
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#f8fafc";
  c.lineWidth = Math.max(1, r * 0.34);
  for (const k of [0.68, 0.32]) {
    c.beginPath();
    c.arc(x, y, r * k, 0, Math.PI * 2);
    c.stroke();
  }
}

/** A warning triangle set out behind a stopped vehicle: red frame, white face. */
function drawWarningTriangle(g: SceneGeometry, x: number, y: number, s: number): void {
  const c = g.ctx;
  const tip = g.fwd; // points the way traffic is coming FROM, i.e. faces oncoming drivers
  c.save();
  c.translate(x, y);
  c.beginPath();
  c.moveTo(-tip * s, 0);
  c.lineTo(tip * s * 0.7, -s * 0.85);
  c.lineTo(tip * s * 0.7, s * 0.85);
  c.closePath();
  c.fillStyle = "#f8fafc";
  c.fill();
  c.lineWidth = Math.max(1.5, s * 0.32);
  c.strokeStyle = "#dc2626";
  c.lineJoin = "round";
  c.stroke();
  c.restore();
}

/** A yellow diamond caution sign on a post at the road's edge, with a glyph on it. */
function drawCautionSign(g: SceneGeometry, x: number, glyph: string): void {
  const c = g.ctx;
  const s = Math.max(9, Math.min(15, g.laneH * 0.32));
  const y = g.outerEdgeY + g.outward * (s * 0.9);
  c.save();
  c.translate(x, y);
  c.rotate(Math.PI / 4);
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.fillRect(-s * 0.55 + 1, -s * 0.55 + 1.5, s * 1.1, s * 1.1);
  c.fillStyle = "#fbbf24";
  c.fillRect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1);
  c.strokeStyle = "#1f2937";
  c.lineWidth = 1.2;
  c.strokeRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9);
  c.restore();
  c.fillStyle = "#1f2937";
  c.font = `800 ${Math.round(s * 0.82)}px system-ui`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(glyph, x, y + 0.5);
}

/** Cones set in a diagonal taper from the lane edge into the lane, upstream of the obstruction. */
function drawTaper(g: SceneGeometry, xStart: number, y: number, toward: 1 | -1, count: number, spanPx: number): void {
  const r = Math.max(2.2, Math.min(4.4, g.laneH * 0.07));
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 1 : i / (count - 1);
    drawCone(g, xStart + g.fwd * spanPx * f, y - toward * g.laneH * 0.46 * (1 - f) + toward * g.laneH * 0.0, r);
  }
}

/** A lit arrow board (as on a work or patrol truck) pointing sideways; its chevrons chase. */
function drawArrowBoard(g: SceneGeometry, x: number, y: number, w: number, h: number, toward: 1 | -1): void {
  const c = g.ctx;
  c.fillStyle = "#0f172a";
  rrect(c, x - w / 2, y - h / 2, w, h, 1.5);
  c.fill();
  const step = Math.floor(g.t * 3) % 3;
  for (let i = 0; i < 3; i++) {
    const lit = i <= step;
    c.fillStyle = lit ? "#fbbf24" : "rgba(251,191,36,0.16)";
    const cx = x - w * 0.28 + i * w * 0.28;
    c.beginPath();
    c.moveTo(cx - w * 0.06, y - toward * h * 0.28);
    c.lineTo(cx + w * 0.06, y);
    c.lineTo(cx - w * 0.06, y + toward * h * 0.28);
    c.lineTo(cx - w * 0.02, y);
    c.closePath();
    c.fill();
  }
}

function drawDebris(g: SceneGeometry, x: number, y: number, spreadX: number, spreadY: number, seed: number, n: number, piece = Math.max(1.5, g.carWid * 0.18)): void {
  const c = g.ctx;
  const palette = ["#94a3b8", "#475569", "#ef4444", "#e2e8f0", "#0f172a", "#38bdf8"];
  for (let i = 0; i < n; i++) {
    const px = x + (hash(seed + i) - 0.5) * spreadX * 2;
    const py = y + (hash(seed + i + 40) - 0.5) * spreadY * 2;
    c.save();
    c.translate(px, py);
    c.rotate(hash(seed + i + 80) * Math.PI);
    c.fillStyle = palette[Math.floor(hash(seed + i + 120) * palette.length)];
    const s = Math.min(1.2, piece * 0.5) + hash(seed + i + 160) * piece;
    c.fillRect(-s, -s * 0.45, s * 2, s * 0.9);
    c.restore();
  }
}

/** Rising, fading puffs over a wreck. */
function drawSmoke(g: SceneGeometry, x: number, y: number, size: number, strength: number): void {
  const c = g.ctx;
  for (let i = 0; i < 7; i++) {
    const cycle = wrap(g.t * 0.35 + hash(i * 3) * 2, 1);
    const px = x + (hash(i * 7) - 0.5) * size * 0.9 + Math.sin(g.t + i) * size * 0.08;
    const py = y - g.outward * cycle * size * 1.1;
    c.fillStyle = `rgba(226,232,240,${(1 - cycle) * 0.34 * strength})`;
    c.beginPath();
    c.arc(px, py, size * (0.16 + cycle * 0.34), 0, Math.PI * 2);
    c.fill();
  }
}

/* ── weather ──────────────────────────────────────────────────────────────────── */

const RAIN: Readonly<Record<RainIntensity, { readonly density: number; readonly speed: number; readonly len: number; readonly alpha: number; readonly width: number; readonly tint: number; readonly ripples: number }>> = {
  light: { density: 1 / 1700, speed: 380, len: 9, alpha: 0.62, width: 1.2, tint: 0.07, ripples: 4 },
  moderate: { density: 1 / 800, speed: 580, len: 13, alpha: 0.74, width: 1.4, tint: 0.13, ripples: 9 },
  heavy: { density: 1 / 400, speed: 800, len: 18, alpha: 0.86, width: 1.7, tint: 0.2, ripples: 18 },
};

/** The look of rain at a level between 0 (dry) and 3 (heavy): the named intensities at 1, 2 and 3, blended between
 *  them, and thinning out to nothing below light — so rain builds and eases instead of switching. */
function rainLook(level: number): (typeof RAIN)[RainIntensity] {
  const l = Math.max(0, Math.min(3, level));
  if (l <= 1) {
    const b = RAIN.light;
    return { ...b, density: b.density * l, alpha: b.alpha * (0.4 + 0.6 * l), tint: b.tint * l, ripples: Math.round(b.ripples * l) };
  }
  const [a, b] = l <= 2 ? [RAIN.light, RAIN.moderate] : [RAIN.moderate, RAIN.heavy];
  const f = l <= 2 ? l - 1 : l - 2;
  const mix = (x: number, y: number) => x + (y - x) * f;
  return {
    density: mix(a.density, b.density), speed: mix(a.speed, b.speed), len: mix(a.len, b.len), alpha: mix(a.alpha, b.alpha),
    width: mix(a.width, b.width), tint: mix(a.tint, b.tint), ripples: Math.round(mix(a.ripples, b.ripples)),
  };
}

/** The drops are sky blue so they read against dark asphalt: the near layer #9CDDEC, the far layer #87CEFA. */
const DROP_NEAR_RGB = "156,221,236";
const DROP_FAR_RGB = "135,206,250";

/**
 * Rain over one carriageway: a wet, cool tint on the tarmac, streaks of falling drops in two depth
 * layers (the near layer longer, faster and brighter), and rings spreading where drops land. The
 * drops are deterministic from the clock — nothing is stored per drop — and drawn as one path per
 * layer, so even heavy rain is a couple of strokes a frame.
 */
export function drawRain(g: SceneGeometry, intensity: RainIntensity | number): void {
  const cfg = rainLook(typeof intensity === "number" ? intensity : RAIN_LEVEL_OF[intensity]);
  const c = g.ctx;
  const wet = g.wetAreas ?? [];
  // The band the drops fall through: the road, stretched to take in any plaza beside it. Clipped to exactly the road
  // and those footprints, so nothing falls on the verge or the median between them.
  const y0 = Math.min(g.roadTop, ...wet.map((r) => r.y));
  const w = g.cssW;
  const h = Math.max(g.roadTop + g.roadH, ...wet.map((r) => r.y + r.h)) - y0;
  c.save();
  c.beginPath();
  c.rect(0, g.roadTop, w, g.roadH);
  for (const r of wet) c.rect(r.x, r.y, r.w, r.h);
  c.clip();

  const sheen = c.createLinearGradient(0, y0, 0, y0 + h);
  sheen.addColorStop(0, `rgba(30,64,120,${cfg.tint * 0.55})`);
  sheen.addColorStop(1, `rgba(30,64,120,${cfg.tint})`);
  c.fillStyle = sheen;
  c.fillRect(0, y0, w, h);

  const slant = 0.2;
  const total = Math.round(w * h * cfg.density);
  for (let layer = 0; layer < 2; layer++) {
    const near = layer === 1;
    const len = cfg.len * (near ? 1.5 : 1);
    const speed = cfg.speed * (near ? 1.3 : 0.85);
    c.strokeStyle = `rgba(${near ? DROP_NEAR_RGB : DROP_FAR_RGB},${cfg.alpha * (near ? 1 : 0.85)})`;
    c.lineWidth = cfg.width * (near ? 1.2 : 0.9);
    c.beginPath();
    const n = Math.round(total * (near ? 0.4 : 0.6));
    for (let i = 0; i < n; i++) {
      const seed = i + layer * 7919;
      const y = wrap(hash(seed + 0.5) * h + g.t * speed, h + len);
      const x = wrap(hash(seed) * w + y * slant, w);
      c.moveTo(x, y0 + y - len);
      c.lineTo(x + len * slant, y0 + y);
    }
    c.stroke();
  }

  c.lineWidth = 1;
  for (let r = 0; r < cfg.ripples; r++) {
    const cycle = wrap(g.t * 0.85 + hash(r * 5) * 3, 1);
    const px = hash(r * 3 + 1) * w;
    const py = g.roadTop + hash(r * 3 + 2) * g.roadH;
    c.strokeStyle = `rgba(${DROP_NEAR_RGB},${(1 - cycle) * 0.7})`;
    c.beginPath();
    c.ellipse(px, py, 1.5 + cycle * 8, 0.7 + cycle * 3.4, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

/* ── flood ───────────────────────────────────────────────────────────────────── */

/**
 * Standing, FLOWING water over the flooded lane(s): a shoreline that ripples, a body of water that
 * darkens toward its middle, streaks and glints sliding along the direction of travel, and foam along the
 * edges. Drawn over the closure hatch so the lane reads as under water, with the depth-gauge post and a
 * caution sign at the upstream end.
 */
/** Puddles gathering on the flood's outer lane while it rains, before the water closes anything: more and larger
 *  as the pooling phase runs on, so the flood is seen coming. */
function drawPooling(g: SceneGeometry, m: SceneMark): void {
  if (m.water == null) return;
  const c = g.ctx;
  const a = g.xPx(m.water.fromM);
  const b = g.xPx(m.water.toM);
  const left = Math.min(a, b);
  const w = Math.max(30, Math.abs(b - a));
  const f = Math.max(0, Math.min(1, m.phaseFraction));
  const top = g.laneCenterY(m.water.outerLane) - g.laneH / 2;
  const n = Math.max(3, Math.round((w / 26) * (0.35 + 0.65 * f)));
  c.save();
  for (let i = 0; i < n; i++) {
    const px = left + hash(i * 7 + 3) * w;
    // nearer the shoulder edge of the lane: water runs to the low side first
    const edge = g.outward > 0 ? top + g.laneH * (0.62 + hash(i * 7 + 5) * 0.3) : top + g.laneH * (0.08 + hash(i * 7 + 5) * 0.3);
    const rx = (4 + hash(i * 7 + 1) * 10) * (0.4 + 0.9 * f);
    const ry = Math.max(1.2, rx * 0.28);
    c.fillStyle = `rgba(56,128,168,${0.32 + 0.4 * f})`;
    c.beginPath();
    c.ellipse(px, edge, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = `rgba(226,242,255,${0.25 + 0.25 * f})`;
    c.lineWidth = 0.8;
    c.stroke();
  }
  c.restore();
}

function drawFlood(g: SceneGeometry, m: SceneMark): void {
  if (m.phaseId === "pooling") {
    drawPooling(g, m);
    return;
  }
  if (m.stretch === null || m.closedLanes.length === 0) return;
  const c = g.ctx;
  const a = g.xPx(m.stretch.fromM);
  const b = g.xPx(m.stretch.toM);
  const left = Math.min(a, b);
  const w = Math.max(30, Math.abs(b - a));
  /* How much of each lane is under water: it spreads in over the rising phase, and shrinks over the draining one,
     rather than appearing whole the instant a lane closes. */
  const grow =
    m.phaseId === "rising" ? 0.45 + 0.55 * ramp(m.phaseFraction, 0, 0.9)
      : m.phaseId === "draining" ? 1 - 0.5 * ramp(m.phaseFraction, 0.1, 1)
        : ramp(m.phaseFraction, 0, 0.06);
  /* Side-by-side lanes under water are one sheet of it, not a strip per lane with dry seams between: group the closed
     lanes into runs of neighbours and draw each run as one body. */
  const sorted = [...m.closedLanes].sort((x, y) => x - y);
  const runs: number[][] = [];
  for (const l of sorted) {
    const last = runs[runs.length - 1];
    if (last && l === last[last.length - 1] + 1) last.push(l);
    else runs.push([l]);
  }
  for (const run of runs) {
    const lane = run[0];
    const spanH = g.laneH * run.length;
    const top = Math.min(...run.map((l) => g.laneCenterY(l))) - g.laneH / 2;
    const inset = g.laneH * 0.06;
    const h = spanH - inset * 2;
    const seed = lane * 13 + 1;
    const edge = (x: number, side: number): number => Math.sin(x * 0.11 + seed + side * 2) * 1.8 + Math.sin(x * 0.27 - g.t * 0.9 + side) * 1.1;

    c.save();
    c.beginPath();
    const step = 6;
    for (let x = 0; x <= w; x += step) c.lineTo(left + x, top + inset + edge(left + x, 0) - (1 - grow) * h * 0.4);
    for (let y = 0; y <= h; y += step) c.lineTo(left + w + edge(top + y, 3) * 0.6, top + inset + y);
    for (let x = w; x >= 0; x -= step) c.lineTo(left + x, top + inset + h + edge(left + x, 1) + (1 - grow) * h * 0.4);
    for (let y = h; y >= 0; y -= step) c.lineTo(left + edge(top + y, 2) * 0.6, top + inset + y);
    c.closePath();
    c.clip();

    const body = c.createLinearGradient(0, top, 0, top + spanH);
    body.addColorStop(0, "rgba(72,146,181,0.84)");
    body.addColorStop(0.5, "rgba(38,104,142,0.90)");
    body.addColorStop(1, "rgba(72,146,181,0.84)");
    c.fillStyle = body;
    c.fillRect(left - 4, top, w + 8, spanH);

    // flowing streaks: sine lines whose phase runs with the traffic, so the water visibly moves
    const lines = Math.max(3, Math.round(spanH / 6));
    for (let i = 0; i < lines; i++) {
      const y = top + inset + ((i + 0.5) / lines) * h;
      const lambda = 24 + hash(seed + i) * 26;
      const amp = 1.1 + hash(seed + i + 9) * 1.7;
      const speed = 34 + hash(seed + i + 17) * 34;
      c.strokeStyle = `rgba(226,242,255,${0.16 + hash(seed + i + 3) * 0.2})`;
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x <= w + 4; x += 3) {
        const px = left + x;
        const py = y + Math.sin(((px - g.fwd * g.t * speed) / lambda) * Math.PI * 2) * amp;
        if (x === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
    }
    // glints
    for (let i = 0; i < Math.max(4, Math.round(w / 34)); i++) {
      const gx = left + wrap(hash(seed + i * 5) * w + g.fwd * g.t * (22 + hash(i) * 22), w);
      const gy = top + inset + hash(seed + i * 5 + 1) * h;
      const tw = 0.5 + 0.5 * Math.sin(g.t * 3 + i * 1.7);
      c.fillStyle = `rgba(255,255,255,${0.14 + tw * 0.4})`;
      c.beginPath();
      c.ellipse(gx, gy, 2.4 + tw * 1.8, 0.8, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();

    // foam at the shoreline
    c.strokeStyle = "rgba(240,249,255,0.5)";
    c.lineWidth = 1.2;
    c.beginPath();
    for (let x = 0; x <= w; x += step) {
      const px = left + x;
      const py = top + inset + edge(px, 0) - (1 - grow) * h * 0.4;
      if (x === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
  }

  drawCautionSign(g, g.xPx(m.stretch.fromM) - g.fwd * (g.laneH * 0.4 + 6), "≋");
  // depth gauge: a striped post at the downstream end
  const gx = g.xPx(m.stretch.toM) + g.fwd * 4;
  const gy = g.outerEdgeY + g.outward * 3;
  c.fillStyle = "#f8fafc";
  c.fillRect(gx - 1.5, Math.min(gy, gy + g.outward * g.laneH * 0.5), 3, g.laneH * 0.5);
  c.fillStyle = "#dc2626";
  for (let i = 0; i < 4; i += 2) c.fillRect(gx - 1.5, Math.min(gy, gy + g.outward * g.laneH * 0.5) + (i * g.laneH * 0.5) / 4, 3, (g.laneH * 0.5) / 4);
}

/* ── the run-up to an event ─────────────────────────────────────────
 *
 * The vehicles of a scene are picked out of the traffic a few seconds before it is due and are seen driving into it
 * (the engine's crashAt), so the event itself is no longer telegraphed by drawing: what an operator watches is the
 * real cars. What is left here is a marker for WHERE to look — a ring closing on the spot as the clock runs down,
 * with a halo underneath so it can be found between pulses. Purely presentational; it touches nothing.
 */

/** How long before it starts the marker begins. */
const IMMINENT_LEAD_S = 12;

/** 0 at the far edge of the lead-in, 1 at the instant it fires. */
function imminence(m: SceneMark): number {
  if (m.state !== "pending" || m.secondsUntilStart === null) return 0;
  if (m.secondsUntilStart > IMMINENT_LEAD_S) return 0;
  return 1 - m.secondsUntilStart / IMMINENT_LEAD_S;
}

export function isImminent(m: SceneMark): boolean {
  return imminence(m) > 0;
}

function drawImminent(g: SceneGeometry, m: SceneMark): void {
  const f = imminence(m);
  if (f <= 0) return;
  const c = g.ctx;
  const x = g.xPx(m.xM);
  const y = m.lane === null ? g.outerEdgeY + g.outward * g.carWid * 0.2 : g.laneCenterY(m.lane);
  // The pulse quickens from about one a second to four, so the urgency is legible without reading the countdown.
  const phase = wrap(g.t * (1 + f * 3), 1);
  const tint =
    m.family === "scheduled_roadworks" ? "249,115,22" :
    m.family === "rain" || m.family === "flood" ? "56,189,248" :
    m.family === "breakdown_in_lane" || m.family === "breakdown_shoulder" ? "250,204,21" :
    "239,68,68";
  const r0 = g.laneH * (1.5 - 1.05 * phase);
  c.strokeStyle = `rgba(${tint},${(0.12 + 0.5 * f) * (1 - phase)})`;
  c.lineWidth = Math.max(1.2, g.laneH * 0.06);
  c.beginPath();
  c.arc(x, y, Math.max(2, r0), 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = `rgba(${tint},${0.05 + 0.13 * f})`;
  c.beginPath();
  c.arc(x, y, g.laneH * 0.52, 0, Math.PI * 2);
  c.fill();
}

/* ── the scene's own vehicles ───────────────────────────────────────────────────
 *
 * The wrecks and the responders are AGENTS — vehicles in the engine, drawn with the traffic by the canvas — and
 * everything else in a scene (the people, the cones, the skid marks and the debris) is drawn here, AROUND them. The
 * canvas hands over where each of them was drawn this frame, by event. The people used to be put at fixed offsets
 * from the event's point while the vehicles they belonged to were wherever the engine had them, so they stood on
 * empty road; and a police car, an ambulance and a tow truck were painted here as well as driving in as agents, so
 * there were two of each.
 */

/** One of a scene's vehicles as the canvas drew it this frame. */
export type SceneActor = {
  readonly kind: "wreck" | "police" | "ambulance" | "tow" | "works";
  /** Centre of the sprite, its drawn length and width (px), and the angle it is drawn at (radians). */
  readonly cx: number;
  readonly cy: number;
  readonly len: number;
  readonly wid: number;
  readonly yaw: number;
  /** Seconds since it came to rest (a wreck) or parked (a responder); null while it is still moving. */
  readonly still: number | null;
  /** Packing up: driving off with the rest of the scene. */
  readonly departing: boolean;
  readonly onShoulder: boolean;
  /** Wrecks: how it came to rest. */
  readonly look: "crash" | "stalled" | "overturned" | null;
};
/** Each event's vehicles, by event id. */
export type SceneActors = ReadonlyMap<string, readonly SceneActor[]>;
const NO_ACTORS: SceneActors = new Map();

type Cast = {
  /** Front of the scene first. */
  readonly wrecks: readonly SceneActor[];
  readonly police: SceneActor | null;
  readonly ambulance: SceneActor | null;
  readonly tow: SceneActor | null;
  /** Front first. */
  readonly works: readonly SceneActor[];
  /** Packing up: the people are back in the vehicles. */
  readonly leaving: boolean;
  /** The width the scene's vehicles are drawn at (px): everything else in the scene is sized from it, so a person, a
   *  cone or a skid mark is in proportion to the cars round it, at any zoom. */
  readonly unit: number;
};

function castOf(g: SceneGeometry, all: readonly SceneActor[]): Cast {
  const frontFirst = (a: SceneActor, b: SceneActor): number => g.fwd * (b.cx - a.cx);
  const one = (k: SceneActor["kind"]): SceneActor | null => all.find((a) => a.kind === k) ?? null;
  const wids = all.map((a) => a.wid).sort((a, b) => a - b);
  return {
    wrecks: all.filter((a) => a.kind === "wreck").sort(frontFirst),
    police: one("police"),
    ambulance: one("ambulance"),
    tow: one("tow"),
    works: all.filter((a) => a.kind === "works").sort(frontFirst),
    leaving: all.some((a) => a.departing),
    unit: wids.length > 0 ? wids[Math.floor(wids.length / 2)] : g.carWid,
  };
}

/** Parked (or at rest), not leaving, for at least `s` seconds. */
function stillFor(a: SceneActor | null, s: number): a is SceneActor {
  return a !== null && a.still !== null && !a.departing && a.still >= s;
}

type Pt = { readonly x: number; readonly y: number };
/** A point by a vehicle: `along` of its own lengths ahead of its centre (negative: behind it), `across` lane heights outward. */
function by(g: SceneGeometry, a: SceneActor, along: number, across: number): Pt {
  return { x: a.cx + g.fwd * along * a.len, y: a.cy + g.outward * across * g.laneH };
}
/** Walking from one spot to another, eased in and out. */
function walk(p: Pt, q: Pt, f: number): Pt {
  const e = smooth(f);
  return { x: p.x + (q.x - p.x) * e, y: p.y + (q.y - p.y) * e };
}
/** Beside a vehicle, between it and the edge of its lane: where people stand when they cannot stand anywhere else. */
const EDGE = 0.34;
/** A person in proportion to the scene's vehicles: shoulders about a quarter of a car's width across. */
function person(g: SceneGeometry, c: Cast, p: Pt, role: PersonRole, seed: number): void {
  drawPerson(g, p.x, p.y, role, seed, (c.unit * 0.26) / Math.max(1, g.laneH * 0.105));
}

/** The white flash at the moment of contact — brief, and only once. */
function drawImpactFlash(g: SceneGeometry, x: number, y: number, size: number, k: number): void {
  if (k <= 0) return;
  const c = g.ctx;
  const r = size * (0.25 + 0.9 * (1 - k));
  c.strokeStyle = `rgba(255,255,255,${0.85 * k})`;
  c.lineWidth = Math.max(1.5, size * 0.08 * k);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = `rgba(255,236,190,${0.32 * k})`;
  c.beginPath();
  c.arc(x, y, r * 0.55, 0, Math.PI * 2);
  c.fill();
}

/** Two black tyre marks running back from a vehicle's tail, `length` px, curling across the lane if it skidded round. */
function skidBehind(g: SceneGeometry, w: SceneActor, length: number, curl: number): void {
  const c = g.ctx;
  const tail = by(g, w, -0.5, 0);
  c.strokeStyle = "rgba(2,6,23,0.5)";
  c.lineWidth = Math.max(1, w.wid * 0.13);
  for (const off of [-0.3, 0.3]) {
    c.beginPath();
    c.moveTo(tail.x - g.fwd * length, tail.y + off * w.wid - curl * g.laneH * 0.3);
    c.lineTo(tail.x - g.fwd * length * 0.4, tail.y + off * w.wid - curl * g.laneH * 0.08);
    c.lineTo(tail.x, tail.y + off * w.wid);
    c.stroke();
  }
}

const CRASH_FAMILIES: readonly FamilyKey[] = ["minor_collision", "multi_vehicle_collision", "self_accident", "overturned_vehicle"];

/**
 * What a crash leaves ON the road — skid marks behind each vehicle that braked into it, broken glass and bits of
 * bodywork where each one hit the next, an overturned load's spilled cargo. Drawn UNDER the traffic (the canvas calls
 * this before the vehicles), so the wrecks sit on their own skid marks and nothing is painted over a car.
 */
export function drawSceneGround(g: SceneGeometry, marks: readonly SceneMark[], actors: SceneActors = NO_ACTORS): void {
  for (const m of marks) {
    if (m.state !== "active" || !CRASH_FAMILIES.includes(m.family)) continue;
    const present = actors.get(m.eventId) ?? [];
    /* Once the scene is packing up, the road has been swept. All of this is placed from where each wreck IS, so
       while they drove away the skid marks and the broken glass drove away with them, trailing behind each car
       down the lane. */
    if (present.some((a) => a.departing)) continue;
    const c = castOf(g, present);
    if (c.wrecks.length === 0) continue;
    const seed = Math.abs(Math.round(m.xM));
    const skidded = m.family === "self_accident" || m.family === "overturned_vehicle";
    c.wrecks.forEach((w, i) => skidBehind(g, w, w.len * (skidded ? 2.6 : 1.5) * (i === 0 ? 1 : 0.8), skidded ? Math.sign(w.yaw || 1) : 0));
    const piece = Math.max(1.2, c.unit * 0.12);
    for (let i = 0; i + 1 < c.wrecks.length; i++) {
      const a = by(g, c.wrecks[i], -0.5, 0);
      const b = by(g, c.wrecks[i + 1], 0.5, 0);
      drawDebris(g, (a.x + b.x) / 2, (a.y + b.y) / 2, c.unit * 0.9, c.unit * 0.55, seed + i * 17, 7, piece);
    }
    const front = by(g, c.wrecks[0], 0.6, 0);
    drawDebris(g, front.x, front.y, c.unit * 0.9, c.unit * 0.55, seed + 3, m.family === "multi_vehicle_collision" ? 9 : 5, piece);
    if (m.family === "overturned_vehicle") {
      const w = c.wrecks[0];
      // Fuel or oil, under it, and its load spilled round it — inside its own lane.
      g.ctx.fillStyle = "rgba(15,23,42,0.35)";
      g.ctx.beginPath();
      g.ctx.ellipse(w.cx - g.fwd * w.len * 0.15, w.cy, w.len * 0.42, w.wid * 0.75, 0, 0, Math.PI * 2);
      g.ctx.fill();
      const spill = ["#dc2626", "#2563eb", "#eab308", "#16a34a", "#a855f7"];
      for (let i = 0; i < 9; i++) {
        const px = w.cx + g.fwd * (hash(m.xM + i) - 0.75) * w.len * 1.1;
        const py = w.cy + (hash(m.xM + i + 30) - 0.5) * Math.min(g.laneH * 0.7, w.wid * 2.2);
        inFrame(g, px, py, hash(m.xM + i + 60) * Math.PI, () => {
          g.ctx.fillStyle = spill[i % spill.length];
          g.ctx.fillRect(-w.wid * 0.16, -w.wid * 0.11, w.wid * 0.32, w.wid * 0.22);
        });
      }
    }
  }
}

/* A crash (a collision of any size, a self accident, an overturned vehicle) once it has happened.
 *
 * In the order it happens on the road. A flash as each vehicle is hit, and smoke from the worst of it. The people in
 * the vehicles get out once they have stopped (climbing out of one on its side takes longer) and stand beside them,
 * inside the shut lane. The police set out cones behind their car, nearest first, and an officer stands at the back of
 * it watching the traffic past; the paramedics walk from the ambulance's back doors to the casualties and stay with
 * them; the recovery crew walk from the truck to the hitch. When the scene packs up everyone is back in a vehicle and
 * the vehicles drive off (the canvas draws those). */
function drawCrash(g: SceneGeometry, m: SceneMark, c: Cast): void {
  const seed = Math.abs(Math.round(m.xM));
  const overturned = m.family === "overturned_vehicle";
  const heavy = overturned || m.family === "multi_vehicle_collision";
  for (const w of c.wrecks) {
    if (w.still !== null && w.still < 0.6) {
      const p = by(g, w, 0.5, 0);
      drawImpactFlash(g, p.x, p.y, w.len, 1 - w.still / 0.6);
    }
  }
  const lead = c.wrecks[0] ?? null;
  if (lead && (heavy || m.family === "self_accident") && !c.leaving) {
    const s = lead.still ?? 0;
    const k = ramp(s, 0.8, 4) * (1 - ramp(s, 150, 420));
    if (k > 0.02) drawSmoke(g, lead.cx, lead.cy, lead.len * 1.2, k);
  }
  if (c.leaving || lead === null) return;

  const cop = c.police;
  if (stillFor(cop, 2)) {
    const out = cop.onShoulder ? 0.4 : -EDGE;
    person(g, c, walk(by(g, cop, 0.1, cop.onShoulder ? 0.3 : EDGE * 0.6), by(g, cop, -0.35, out), ramp(cop.still!, 2, 6)), "responder", seed + 11);
    if (!cop.onShoulder && cop.still! >= 6) {
      const n = Math.min(5, 1 + Math.floor((cop.still! - 6) / 1.4));
      const r = Math.max(1.8, Math.min(4.4, cop.wid * 0.17));
      for (let i = 0; i < n; i++) {
        const f = i / 4;
        const p = by(g, cop, -0.7 - f * 2.2, -0.4 * f);
        drawCone(g, p.x, p.y, r);
      }
    }
  }

  const outAfter = overturned ? 6 : 3;
  c.wrecks.forEach((w, i) => {
    if (!stillFor(w, outAfter)) return;
    const side = i % 2 === 0 ? 1 : -1;
    const p = walk(by(g, w, 0.05, side * 0.12), by(g, w, -0.2, side * EDGE), ramp(w.still!, outAfter, outAfter + 4));
    person(g, c, p, "civilian", seed + 5 + i);
  });

  const amb = c.ambulance;
  if (stillFor(amb, 2)) {
    const doors = by(g, amb, -0.5, 0);
    for (let k = 0; k < 2; k++) {
      const w = c.wrecks[Math.min(k, c.wrecks.length - 1)];
      const p = walk(doors, by(g, w, 0.25, (k === 0 ? -1 : 1) * EDGE), ramp(amb.still!, 2 + k * 1.3, 10 + k * 1.3));
      person(g, c, p, "medic", seed + 31 + k);
    }
  }

  const tow = c.tow;
  if (stillFor(tow, 2)) {
    const hitch = walk(by(g, tow, -0.5, 0), by(g, lead, 0.5, 0), 0.5);
    person(g, c, walk(by(g, tow, 0.2, EDGE), { x: hitch.x, y: lead.cy + g.outward * g.laneH * EDGE }, ramp(tow.still!, 2, 6)), "worker", seed + 41);
    if (heavy) person(g, c, walk(by(g, tow, 0.2, -EDGE), by(g, lead, 0, -EDGE), ramp(tow.still!, 3, 9)), "worker", seed + 47);
  }
}

/* A breakdown. In a lane, the driver stays in the vehicle — traffic is queued right up behind it and squeezing past,
 * and there is nowhere safe to stand — and the patrol, stopped on the shoulder beside it, puts an officer out where the
 * traffic can see them. On the shoulder, the driver gets out on the verge side and sets a warning triangle out behind.
 * Either way the recovery operator walks from the truck to the hitch once it has pulled in in front. */
function drawBreakdown(g: SceneGeometry, m: SceneMark, c: Cast, onShoulder: boolean): void {
  const seed = Math.abs(Math.round(m.xM));
  const car = c.wrecks[0] ?? null;
  if (car === null || c.leaving) return;
  if (onShoulder && stillFor(car, 3)) {
    const t = car.still!;
    const tail = car.cx - g.fwd * (car.len / 2);
    const cop = c.police;
    const triX = stillFor(cop, 0) ? (tail + cop.cx + g.fwd * (cop.len / 2)) / 2 : tail - g.fwd * car.len;
    const tri = { x: triX, y: car.cy };
    const verge = (x: number): Pt => ({ x, y: car.cy + g.outward * (car.wid / 2 + c.unit * 0.45) });
    const p = t < 7 ? walk(verge(car.cx), verge(triX), ramp(t, 3, 7)) : walk(verge(triX), verge(car.cx - g.fwd * car.len * 0.2), ramp(t, 7.5, 11));
    person(g, c, p, "civilian", seed + 3);
    if (t >= 7) drawWarningTriangle(g, tri.x, tri.y, Math.max(3, car.wid * 0.32));
  }
  const cop = c.police;
  if (stillFor(cop, 2)) {
    const verge = cop.wid / 2 + c.unit * 0.45;
    person(g, c, walk(by(g, cop, 0.1, 0.1), { x: cop.cx + g.fwd * cop.len * 0.4, y: cop.cy + g.outward * verge }, ramp(cop.still!, 2, 5)), "responder", seed + 11);
  }
  const tow = c.tow;
  if (stillFor(tow, 2)) {
    const hitch = walk(by(g, tow, -0.5, 0), by(g, car, 0.5, 0), 0.5);
    const off = onShoulder ? car.wid / 2 + c.unit * 0.45 : g.laneH * EDGE;
    person(g, c, walk(by(g, tow, 0.2, 0), { x: hitch.x, y: car.cy + g.outward * off }, ramp(tow.still!, 2, 6)), "worker", seed + 41);
  }
}

/* Roadworks: the work area and its barrels belong to the stretch the closure holds; the works trucks are agents (they
 * drive in and park in the lane), so the arrow board goes on the back of the last one, and the gang get out of them. */
/** Seconds the crew takes to set the cones out along a work zone, and to pick them up again at the end. */
const WORKS_LAY_S = 30;

function drawRoadworks(g: SceneGeometry, m: SceneMark, c: Cast): void {
  if (m.stretch === null || m.closedLanes.length === 0) return;
  /* How much of the zone is coned off: set out from the taper forward over the first half-minute, picked up from the
     far end back over the last — rather than the whole work zone appearing and vanishing in one frame. */
  const laid = Math.max(0.04, Math.min(1, (m.elapsedS ?? WORKS_LAY_S) / WORKS_LAY_S, (m.remainingS ?? WORKS_LAY_S) / WORKS_LAY_S));
  const a = g.xPx(m.stretch.fromM);
  const bFull = g.xPx(m.stretch.toM);
  const b = a + (bFull - a) * laid;
  const left = Math.min(a, b);
  const right = Math.max(a, b);
  const lane = m.closedLanes[0];
  const laneY = g.laneCenterY(lane);
  const top = laneY - g.laneH / 2;
  const ctx = g.ctx;
  // the work area: a hatched, dusty patch inside the closed lane
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top + g.laneH * 0.08, Math.max(right - left, 20), g.laneH * 0.84);
  ctx.clip();
  ctx.fillStyle = "rgba(120,90,50,0.34)";
  ctx.fillRect(left, top, right - left + 20, g.laneH);
  ctx.strokeStyle = "rgba(251,146,60,0.32)";
  ctx.lineWidth = 3;
  for (let x = left - g.laneH; x < right + 20; x += 11) {
    ctx.beginPath();
    ctx.moveTo(x, top + g.laneH);
    ctx.lineTo(x + g.laneH, top);
    ctx.stroke();
  }
  ctx.restore();

  const r = Math.max(2.3, Math.min(4.6, g.laneH * 0.07));
  const span = Math.max(right - left, 20);
  // taper upstream: cones run diagonally from the neighbouring lane's edge into the closed lane
  // (sized off the whole zone, not the part coned so far: the taper goes out first, at its full length)
  const fullSpan = Math.max(Math.abs(bFull - a), 20);
  const taperStart = g.xPx(m.stretch.fromM) - g.fwd * Math.min(g.carLen * 3.2, fullSpan * 0.35);
  drawTaper(g, taperStart, laneY, g.outward, 5, Math.min(g.carLen * 3.2, fullSpan * 0.35));
  // barrels along the work area's edges
  const barrels = Math.max(2, Math.floor(span / (g.carLen * 1.3)));
  for (let i = 0; i <= barrels; i++) {
    const x = left + (span * i) / barrels;
    drawBarrel(g, x, top + g.laneH * 0.1, r);
    drawBarrel(g, x, top + g.laneH * 0.9, r);
  }
  // barrier across the downstream end, once the cones reach it
  const endX = g.fwd === 1 ? right : left;
  if (laid >= 0.98) {
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(endX - 1.5, top + g.laneH * 0.08, 3, g.laneH * 0.84);
  ctx.fillStyle = "#f97316";
  for (let i = 0; i < 4; i += 2) ctx.fillRect(endX - 1.5, top + g.laneH * 0.08 + (i * g.laneH * 0.84) / 4, 3, (g.laneH * 0.84) / 4);
  }
  drawCautionSign(g, taperStart - g.fwd * (g.carLen * 1.4), "!");

  // The arrow board on the back of the last works truck, lit once it is parked.
  const last = c.works.length > 0 ? c.works[c.works.length - 1] : null;
  if (stillFor(last, 0) && !c.leaving) {
    const tail = by(g, last, -0.5, 0);
    drawArrowBoard(g, tail.x - g.fwd * last.len * 0.22, last.cy, last.len * 0.42, Math.max(6, last.wid * 0.7), g.outward);
  }
  /* The gang: out of the trucks once they are parked and into the work area, and a banksman out by the taper watching
     the traffic come past. A work zone with nobody in it is the wrong picture — people standing in it is the whole
     reason the lane is shut. */
  if (c.leaving) return;
  const crewFrom = c.works.find((w) => stillFor(w, 3)) ?? null;
  if (crewFrom === null) return;
  const t = crewFrom.still!;
  for (let i = 0; i < 4; i++) {
    const wx = left + span * (0.3 + i * 0.17);
    const wy = laneY + (hash(m.xM + i) - 0.5) * g.laneH * 0.46;
    person(g, c, walk(by(g, crewFrom, 0, i % 2 === 0 ? EDGE : -EDGE), { x: wx, y: wy }, ramp(t, 3 + i * 0.8, 10 + i * 0.8)), "worker", m.xM + i * 7);
  }
  person(g, c, walk(by(g, crewFrom, -0.4, EDGE), { x: taperStart + g.fwd * g.carLen * 0.6, y: laneY + g.outward * g.laneH * 0.36 }, ramp(t, 4, 14)), "worker", m.xM + 91);
}

/* ── the panel's preview ────────────────────────────────────────────────────────
 *
 * The picker's preview has no engine behind it, so it makes up the cast for the phase it is showing and paints them
 * with the simple vehicles above; the people, the cones and the marks round them are the same code the road uses. */

/** A small made-up cast for a preview scene: the vehicles in it, parked where the engine would put them, for this phase. */
export function previewCast(g: SceneGeometry, m: SceneMark): readonly SceneActor[] {
  if (m.state !== "active") return [];
  const out: SceneActor[] = [];
  const f = m.phaseFraction;
  const shoulder = m.family === "breakdown_shoulder";
  const breakdown = shoulder || m.family === "breakdown_in_lane";
  const crash = CRASH_FAMILIES.includes(m.family);
  // The preview has no shoulder strip: a shoulder scene stands along the road's outer edge.
  const shoulderY = g.outerEdgeY - g.outward * g.carWid * 0.75;
  const y = shoulder ? shoulderY : g.laneCenterY(m.lane ?? 1);
  const x = g.xPx(m.xM);
  const leaving = (crash && m.phaseId === "clearing") || (breakdown && m.phaseId === "service" && f > 0.75);
  const go = leaving ? g.fwd * smooth((m.phaseId === "clearing" ? f : (f - 0.75) / 0.25)) * g.cssW * 0.7 : 0;
  const still = (from: number): number | null => (leaving ? null : Math.max(0, 1.2 + f * 14 - from));
  const car = { len: g.carLen, wid: g.carWid };
  const n = m.family === "multi_vehicle_collision" ? 4 : m.family === "minor_collision" ? 2 : 1;
  const wreckLen = m.family === "overturned_vehicle" ? car.len * 2 : breakdown && m.vehicle === "truck" ? car.len * 2.2 : breakdown && m.vehicle === "bus" ? car.len * 1.8 : car.len;
  for (let i = 0; i < n; i++) {
    out.push({
      kind: "wreck", cx: x - g.fwd * (wreckLen / 2 + i * car.len * 1.04) + go, cy: y, len: wreckLen, wid: car.wid,
      yaw: breakdown ? 0 : (i % 2 === 0 ? 1 : -1) * (m.family === "self_accident" ? 0.45 : 0.18), still: still(0), departing: leaving, onShoulder: shoulder,
      look: breakdown ? "stalled" : m.family === "overturned_vehicle" && !leaving ? "overturned" : "crash",
    });
  }
  const rearX = x - g.fwd * (wreckLen + (n - 1) * car.len * 1.04);
  const park = (kind: SceneActor["kind"], cx: number, cy: number, len: number, from: number, onShoulder: boolean): void => {
    out.push({ kind, cx: cx + go, cy, len, wid: car.wid * (kind === "tow" ? 1.1 : 1), yaw: 0, still: still(from), departing: leaving, onShoulder, look: null });
  };
  if (crash) {
    park("police", rearX - g.fwd * car.len * 1.1, y, car.len * 1.05, 0, false);
    if (m.phaseId !== "blocked" || f > 0.25) park("ambulance", rearX - g.fwd * car.len * 2.5, y, car.len * 1.4, 3, false);
    if (m.phaseId === "tow" || m.phaseId === "clearing") park("tow", x + g.fwd * car.len * 1.25, y, car.len * 1.8, 0, false);
  } else if (breakdown) {
    park("police", shoulder ? rearX - g.fwd * car.len * 1.4 : x - g.fwd * wreckLen * 0.5, shoulder ? y : shoulderY, car.len * 1.05, 0, true);
    if (m.phaseId === "service") park("tow", x + g.fwd * car.len * 1.25, y, car.len * 1.8, 0, shoulder);
  } else if (m.family === "scheduled_roadworks" && m.stretch !== null) {
    const a = g.xPx(m.stretch.fromM);
    park("works", a + g.fwd * car.len * 3.4, y, car.len * 1.6, 0, false);
    park("works", a + g.fwd * car.len * 1.4, y, car.len * 1.6, 0, false);
  }
  return out;
}

/** Paint a preview cast's vehicles, simply (the road draws real agents with the traffic's own sprites). */
export function drawPreviewVehicles(g: SceneGeometry, cast: readonly SceneActor[]): void {
  const blink = Math.floor(g.t * 2.2) % 2 === 0;
  for (const a of cast) {
    switch (a.kind) {
      case "wreck":
        inFrame(g, a.cx, a.cy, a.yaw, () => {
          if (a.look === "overturned") {
            g.ctx.fillStyle = "#334155";
            rrect(g.ctx, -a.len / 2, -a.wid / 2, a.len, a.wid, 2.5);
            g.ctx.fill();
            g.ctx.fillStyle = "#0f172a";
            for (const wx of [-0.32, -0.12, 0.3]) {
              g.ctx.beginPath();
              g.ctx.arc(a.len * wx, -a.wid * 0.3, a.wid * 0.14, 0, Math.PI * 2);
              g.ctx.fill();
            }
          } else if (a.len > g.carLen * 1.3) paintTruck(g.ctx, a.len, a.wid, "#6d28d9", "#c7d2fe");
          else paintCar(g.ctx, a.len, a.wid, { body: a.look === "stalled" ? "#64748b" : "#b45309", roof: "#94a3b8", glass: GLASS });
          paintHazards(g.ctx, a.len, a.wid, blink);
        });
        break;
      case "police":
        drawPolice(g, a.cx, a.cy);
        break;
      case "ambulance":
        drawAmbulance(g, a.cx, a.cy);
        break;
      case "tow":
        drawTow(g, a.cx, a.cy, a.len > g.carLen * 2);
        break;
      case "works":
        inFrame(g, a.cx, a.cy, 0, () => paintTruck(g.ctx, a.len, Math.min(g.laneH * 0.7, a.wid * 1.2), "#eab308", "#facc15"));
        break;
      default:
        break;
    }
  }
}

/**
 * Whether an event is drawn as a scene right now (so it does not also get the amber triangle marker).
 * An event that has not started, or that is running but holds nothing on the road (it yielded the
 * closure to the operator's own), gets no scene — a wreck the engine is not honouring would be a lie.
 */
export function hasSceneArt(m: SceneMark): boolean {
  // A pending event earns a scene for the last few seconds before it fires,
  // so it is not seen to appear out of nothing. See drawImminent.
  if (m.state !== "active") return isImminent(m);
  switch (m.family) {
    case "rain":
    case "breakdown_in_lane":
    case "breakdown_shoulder":
      return true;
    case "flood":
      return m.closedLanes.length > 0 || (m.phaseId === "pooling" && m.water != null);
    case "scheduled_roadworks":
      return m.closedLanes.length > 0;
    case "minor_collision":
    case "multi_vehicle_collision":
    case "self_accident":
    case "overturned_vehicle":
      return m.closedLanes.length > 0 || m.phaseId === "clearing";
    default:
      return assertNeverFamily(m.family);
  }
}

/**
 * Draw every active scenario event on this carriageway as a scene, round the vehicles that are in it (`actors`, from
 * the canvas). Called by drawCarriageway after the traffic and before the labels. An event about to start gets the
 * marker that says where to look; one that has not started otherwise is left to the faint pending marker.
 */
export function drawScenes(g: SceneGeometry, marks: readonly SceneMark[], actors: SceneActors = NO_ACTORS): void {
  for (const m of marks) {
    if (!hasSceneArt(m)) continue;
    if (m.state !== "active") {
      drawImminent(g, m);
      continue;
    }
    const c = castOf(g, actors.get(m.eventId) ?? []);
    switch (m.family) {
      case "flood":
        break; // the water goes UNDER the traffic: drawWater, called earlier by drawCarriageway
      case "scheduled_roadworks":
        drawRoadworks(g, m, c);
        break;
      case "breakdown_in_lane":
        drawBreakdown(g, m, c, false);
        break;
      case "breakdown_shoulder":
        drawBreakdown(g, m, c, true);
        break;
      case "minor_collision":
      case "multi_vehicle_collision":
      case "self_accident":
      case "overturned_vehicle":
        drawCrash(g, m, c);
        break;
      case "rain":
        break; // weather, painted over everything by drawWeather
      default:
        return assertNeverFamily(m.family);
    }
  }
}

/** Weather sits over the traffic and the scenes, under the labels. */
export function drawWeather(g: SceneGeometry, marks: readonly SceneMark[]): void {
  let level = 0;
  let cap: number | null = null;
  for (const m of marks) {
    if (m.state !== "active" || (m.family !== "rain" && m.family !== "flood") || m.intensity === null) continue;
    // The heaviest rain falling wins; the sign shows the strictest cap in force.
    const l = m.rainLevel ?? RAIN_LEVEL_OF[m.intensity];
    if (l > level) level = l;
    if (m.capKmh !== null && (cap === null || m.capKmh < cap)) cap = m.capKmh;
  }
  if (level > 0.02) drawRain(g, level);
  if (cap !== null) drawSpeedSign(g, cap);
}

const RAIN_LEVEL_OF: Readonly<Record<RainIntensity, number>> = { light: 1, moderate: 2, heavy: 3 };

/**
 * A speed-limit roundel at the upstream end of the road: what tells the operator rain has capped traffic,
 * now that the engine's orange speed-zone wash (which rain's whole-segment zone would paint across the entire
 * carriageway) is left off for it.
 */
function drawSpeedSign(g: SceneGeometry, kmh: number): void {
  const c = g.ctx;
  const r = Math.max(7, Math.min(13, g.laneH * 0.32));
  // On the first lane line at the upstream end: clear of the canvas's own caption (top-left) and header (top-right).
  const x = g.xPx(0) + g.fwd * (r + 14);
  const y = g.roadTop + g.laneH;
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.beginPath();
  c.arc(x + 1, y + 1.5, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#f8fafc";
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = Math.max(2, r * 0.24);
  c.strokeStyle = "#dc2626";
  c.beginPath();
  c.arc(x, y, r - c.lineWidth / 2, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = "#0f172a";
  c.font = `800 ${Math.round(r * 0.95)}px system-ui`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(String(kmh), x, y + 0.5);
  c.textAlign = "left";
  c.textBaseline = "top";
}

/** Flood water goes UNDER the traffic (a car that has not yet been stopped drives through it). */
export function drawWater(g: SceneGeometry, marks: readonly SceneMark[]): void {
  for (const m of marks) if (m.family === "flood" && hasSceneArt(m)) drawFlood(g, m);
}

function assertNeverFamily(family: never): never {
  throw new Error(`Unhandled scenario family: ${JSON.stringify(family)}`);
}

/* ── lane reallocation ─────────────────────────────────────────────────────── */

/**
 * The lanes a carriageway has been LENT by the other, where they are: the other carriageway's innermost lanes,
 * against the median. An amber wash and chevrons running the way the traffic using them goes, the scheme's name,
 * and a line of traffic cones along the edge away from the median (`away`: +1 when the lanes are below it, -1
 * above), between them and the other carriageway's own traffic.
 */
export function drawBorrowedLanes(g: SceneGeometry, borrowed: number, label: string, away: 1 | -1 = 1): void {
  if (borrowed <= 0) return;
  const c = g.ctx;
  for (let l = 0; l < borrowed; l++) {
    const top = g.laneCenterY(l) - g.laneH / 2;
    c.fillStyle = "rgba(250,204,21,0.11)";
    c.fillRect(0, top, g.cssW, g.laneH);
    const mid = top + g.laneH / 2;
    const size = Math.max(3, Math.min(7, g.laneH * 0.14));
    c.strokeStyle = "rgba(250,204,21,0.5)";
    c.lineWidth = 1.6;
    const spacing = 46;
    const shift = wrap(g.t * 34, spacing) * g.fwd;
    for (let x = -spacing; x < g.cssW + spacing; x += spacing) {
      const px = x + shift + (g.fwd === -1 ? spacing : 0);
      c.beginPath();
      c.moveTo(px - g.fwd * size, mid - size);
      c.lineTo(px, mid);
      c.lineTo(px - g.fwd * size, mid + size);
      c.stroke();
    }
  }
  // The cones, on an amber line, on the lane edge away from the median.
  const edgeY = g.laneCenterY(borrowed - 1) + (away * g.laneH) / 2;
  c.strokeStyle = "rgba(250,204,21,0.7)";
  c.lineWidth = 1.5;
  c.setLineDash([]);
  c.beginPath();
  c.moveTo(0, edgeY);
  c.lineTo(g.cssW, edgeY);
  c.stroke();
  const r = Math.max(2, Math.min(4.5, g.laneH * 0.09));
  const step = Math.max(14, r * 6);
  for (let x = step / 2; x < g.cssW; x += step) {
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.beginPath();
    c.arc(x + 0.8, edgeY + 0.8, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#f97316";
    c.beginPath();
    c.arc(x, edgeY, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff7ed";
    c.beginPath();
    c.arc(x, edgeY, r * 0.42, 0, Math.PI * 2);
    c.fill();
  }
  if (g.laneH >= 16) {
    c.font = "800 9px system-ui";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillStyle = "rgba(253,224,71,0.95)";
    c.fillText(label, 52, g.laneCenterY(0));
    c.textAlign = "left";
    c.textBaseline = "top";
  }
}
