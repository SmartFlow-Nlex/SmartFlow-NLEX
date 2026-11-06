import type { CharacterId, Expression, HeroId, SidekickId } from '../../core/types';
import { isMachine } from '../../core/types';
import { drawClayFace, type BakedFace, type FaceAnimState } from './clayFaces';
import type { Ctx } from './kit';

/**
 * The game's art: baked clay sprites, inlined into the page by
 * scripts/build-road-trip.js from assets/art/ and decoded on first use. Nothing
 * here blocks: a sprite that is not decoded yet simply is not drawn this frame,
 * and `preload` is how a scene makes sure its cast is ready before it is seen.
 *
 * Faces are not baked. Each front view knows where its eyes and mouth landed, and
 * clayFaces.ts paints them on, so expressions, blinks and talking cost no art.
 */

export interface SpriteMeta {
  /** data URL */
  u: string;
  w: number;
  h: number;
  /** Where the model's ground point falls in the picture. */
  ax: number;
  ay: number;
  /** Picture pixels per model unit. */
  ppu: number;
  /** Width of the model in units (cars), when the scene gave it. */
  wide?: number;
  face?: BakedFace;
  /** Named places in the picture (rooms). */
  points?: Record<string, number[]>;
}

export interface ClaySprite extends SpriteMeta {
  img: CanvasImageSource;
  name: string;
  /** The last tint asked for, kept on the sprite. */
  tintKey?: string;
  tintCopy?: HTMLCanvasElement;
}

declare global {
  interface Window {
    __TB_ART__?: Record<string, SpriteMeta>;
  }
}

const decoded = new Map<string, ClaySprite>();
const pending = new Map<string, Promise<ClaySprite | null>>();

function manifest(): Record<string, SpriteMeta> {
  return window.__TB_ART__ ?? {};
}

export function hasArt(name: string): boolean {
  return manifest()[name] !== undefined;
}

export function preloadOne(name: string): Promise<ClaySprite | null> {
  const known = decoded.get(name);
  if (known !== undefined) {
    return Promise.resolve(known);
  }
  const running = pending.get(name);
  if (running !== undefined) {
    return running;
  }
  const meta = manifest()[name];
  if (meta === undefined) {
    return Promise.resolve(null);
  }
  const job = new Promise<ClaySprite | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const sprite: ClaySprite = { ...meta, img, name };
      decoded.set(name, sprite);
      pending.delete(name);
      resolve(sprite);
    };
    img.onerror = () => {
      // A sprite that cannot load is left out; the game carries on without it.
      pending.delete(name);
      resolve(null);
    };
    img.src = meta.u;
  });
  pending.set(name, job);
  return job;
}

export function preload(names: readonly string[]): Promise<unknown> {
  return Promise.all(names.map(preloadOne));
}

/** The sprite if it is ready; otherwise starts it and returns null for this frame. */
export function art(name: string): ClaySprite | null {
  const known = decoded.get(name);
  if (known !== undefined) {
    return known;
  }
  void preloadOne(name);
  return null;
}

/** Heroes wearing letters: a mirror would turn them backwards, so these have their own right-hand views. */
const LETTERED: ReadonlySet<HeroId> = new Set<HeroId>(['navie']);

export function hasRightViews(hero: HeroId): boolean {
  return LETTERED.has(hero);
}

/** Everything a hero or sidekick needs on the road. */
export function teamArt(hero: HeroId, sidekicks: readonly (SidekickId | null)[]): string[] {
  const names = [`h.${hero}.rear`, `h.${hero}.mid`, `h.${hero}.turn`, ...(LETTERED.has(hero) ? [`h.${hero}.midR`, `h.${hero}.turnR`] : [])];
  for (const id of sidekicks) {
    if (id !== null) {
      names.push(`s.${id}.rear`);
    }
  }
  return names;
}

// -- mood tints: one multiplied copy per sprite and mood, made once ------------------

const tints = new Map<string, HTMLCanvasElement>();

/** A copy of a sprite under a colour wash (dusk, rain). `tint` null: the sprite itself. */
export function tinted(sprite: ClaySprite, tint: string | null): CanvasImageSource {
  if (tint === null) {
    return sprite.img;
  }
  // Most frames ask for the same thing dozens of times: no string building for that.
  if (sprite.tintKey === tint && sprite.tintCopy !== undefined) {
    return sprite.tintCopy;
  }
  const key = `${sprite.name}|${tint}`;
  let canvas = tints.get(key);
  if (canvas === undefined) {
    if (tints.size > 120) {
      tints.clear();
    }
    canvas = document.createElement('canvas');
    canvas.width = sprite.w;
    canvas.height = sprite.h;
    const c = canvas.getContext('2d')!;
    c.drawImage(sprite.img, 0, 0);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = tint;
    c.fillRect(0, 0, sprite.w, sprite.h);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(sprite.img, 0, 0);
    tints.set(key, canvas);
  }
  sprite.tintKey = tint;
  sprite.tintCopy = canvas;
  return canvas;
}

export function clearTints(): void {
  tints.clear();
}

/** A pure-white copy of a sprite's shape, for the flash when something is hit. */
export function flashCopy(sprite: ClaySprite): CanvasImageSource {
  const key = `${sprite.name}|flash`;
  let canvas = tints.get(key);
  if (canvas === undefined) {
    canvas = document.createElement('canvas');
    canvas.width = sprite.w;
    canvas.height = sprite.h;
    const c = canvas.getContext('2d')!;
    c.drawImage(sprite.img, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = '#FFF8E8';
    c.fillRect(0, 0, sprite.w, sprite.h);
    tints.set(key, canvas);
  }
  return canvas;
}

// -- hazard outlines: the sprite's own shape, grown a little, kept once made ---------

const outlines = new Map<string, { canvas: HTMLCanvasElement; pad: number }>();

function outlineCopy(sprite: ClaySprite, heavy: boolean): { canvas: HTMLCanvasElement; pad: number } {
  const key = `${sprite.name}|${heavy ? 2 : 1}`;
  let made = outlines.get(key);
  if (made === undefined) {
    const pad = Math.max(2, Math.round(Math.max(sprite.w, sprite.h) * (heavy ? 0.03 : 0.018)));
    const mask = document.createElement('canvas');
    mask.width = sprite.w;
    mask.height = sprite.h;
    const m = mask.getContext('2d')!;
    m.drawImage(sprite.img, 0, 0);
    m.globalCompositeOperation = 'source-in';
    m.fillStyle = '#FAF4E2';
    m.fillRect(0, 0, sprite.w, sprite.h);
    const canvas = document.createElement('canvas');
    canvas.width = sprite.w + pad * 2;
    canvas.height = sprite.h + pad * 2;
    const c = canvas.getContext('2d')!;
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      c.drawImage(mask, pad + Math.cos(a) * pad, pad + Math.sin(a) * pad);
    }
    made = { canvas, pad };
    outlines.set(key, made);
  }
  return made;
}

/** Draw this just before the sprite, with the same x, y and k: a pale ring that follows its real shape. */
export function blitOutline(ctx: Ctx, sprite: ClaySprite, x: number, y: number, k: number, heavy = false): void {
  const { canvas, pad } = outlineCopy(sprite, heavy);
  ctx.drawImage(canvas, x - (sprite.ax + pad) * k, y - (sprite.ay + pad) * k, canvas.width * k, canvas.height * k);
}

/** Draws a sprite with its bottom centre (or ground anchor) at (x, y), `k` screen px per picture px. */
export function blitClay(ctx: Ctx, sprite: ClaySprite, x: number, y: number, k: number, source: CanvasImageSource = sprite.img, flip = false): void {
  if (flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(source, -sprite.ax * k, -sprite.ay * k, sprite.w * k, sprite.h * k);
    ctx.restore();
    return;
  }
  ctx.drawImage(source, x - sprite.ax * k, y - sprite.ay * k, sprite.w * k, sprite.h * k);
}

/**
 * Draws a sprite with its upper part swayed sideways by `bend` px at the very top,
 * easing to nothing at `from` of its height. That is what makes a cap trail a turn and
 * an antenna wave without a separate sprite for either. A flat sprite stays one draw.
 */
export function blitBent(ctx: Ctx, sprite: ClaySprite, x: number, y: number, k: number, source: CanvasImageSource = sprite.img, bend = 0, from = 0.3, rows = 10): void {
  if (Math.abs(bend) < 0.08) {
    blitClay(ctx, sprite, x, y, k, source);
    return;
  }
  const left = x - sprite.ax * k;
  const top = y - sprite.ay * k;
  const sh = sprite.h / rows;
  for (let i = 0; i < rows; i += 1) {
    const sy = i * sh;
    const height = 1 - (i + 0.5) / rows;
    const q = height <= from ? 0 : (height - from) / (1 - from);
    // One source pixel of overlap, so no hairline shows between rows.
    const take = i < rows - 1 ? sh + 1 : sh;
    ctx.drawImage(source, 0, sy, sprite.w, take, left + bend * q * q, top + sy * k, sprite.w * k, take * k);
  }
}

/** The colour a character is known by: for the soft backing and the selected edge of its tile. */
const TINTS: Partial<Record<CharacterId | SidekickId, string>> = {
  navie: '#3C7FD6', jepoy: '#BE4B3F', kiko: '#69AFA4', berto: '#7D8690', ligaya: '#CF7C74', hiraya: '#4A4FA8', sinta: '#D9973F', amihan: '#7FBFDA', kidlat: '#3C5258', nico: '#3F8A7E', alon: '#3C6E9A', tiko: '#9C6240', ningning: '#B7A3E6', simoy: '#7FC8AE', sikat: '#EE9A38', tali: '#EC7B6C',
  kono: '#B59AE0', kislap: '#E9C24C', dahon: '#7FC89A', radyo: '#4FA7A0', ginto: '#D9A92E', hamog: '#8FB8DC',
  pip: '#4A95E2', bumbo: '#F4872F', mila: '#F58DAF', kumpuni: '#6E9E5E', bantay: '#C99E6C', silip: '#5B9E9C', walis: '#8FC6AE', barya: '#E3B24C', sibat: '#C65B50', tala: '#E9B54C', ilaw: '#E9B54C', maso: '#B58A58',
  parolito: '#E9B54C', bibing: '#D9A25E', kape: '#9C7A5C', sago: '#C68FB8', sampy: '#9CB98A', kawayan: '#A6B568', kalaw: '#E0A84C', tarsi: '#A98A68', piko: '#8F928A', saranggola: '#D97C6C', duwi: '#A85C3C', silaw: '#D9B84C', bitu: '#E08A4C', gearo: '#3F7F76', ulap: '#7FB0D0',
};

export function characterTint(id: CharacterId | SidekickId): string {
  return TINTS[id] ?? '#3C7FD6';
}

/** The inline style that gives a tile its character's colours: `--tile-edge` for the selected edge, `--tile-soft` behind the portrait. */
export function tileColours(id: CharacterId | SidekickId): string {
  const hex = characterTint(id);
  const n = parseInt(hex.slice(1), 16);
  return `--tile-edge:${hex};--tile-soft:rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.26)`;
}

/** A soft pool of shade on the ground: separate from the sprite, so a hop lifts the character and not its shadow. */
export function softShadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.26): void {
  const c = shadowDot();
  const before = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = before;
}

let dot: HTMLCanvasElement | null = null;
function shadowDot(): HTMLCanvasElement {
  if (dot === null) {
    dot = document.createElement('canvas');
    dot.width = 64;
    dot.height = 64;
    const c = dot.getContext('2d')!;
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(32,42,52,1)');
    g.addColorStop(0.55, 'rgba(32,42,52,0.7)');
    g.addColorStop(1, 'rgba(32,42,52,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  }
  return dot;
}

// -- the cast, by the same names the story and garage already call -----------------------

export interface CharacterPose {
  expr: Expression;
  anim: FaceAnimState;
  hop?: number;
  tilt?: number;
  shadow?: boolean;
  /** Mirror (faces the other way). */
  flip?: boolean;
  /** Degrees turned away from facing you; negative turns the other way. Heroes rest at 15. */
  yaw?: number;
}

export function characterSprite(id: CharacterId): string {
  if (id === 'radio') {
    return 'c.radio';
  }
  return isMachine(id) ? `m.${id}` : `h.${id}.front`;
}

/** The angles a front is baked at, in degrees away from dead ahead. Turned the other way, it is a mirror image (or, for lettering, its own view). */
const FRONT_VIEWS: readonly [number, string][] = [[0, 'face'], [15, 'front'], [35, 'q'], [55, 'q2']];

/** The sprite for a character turned `yaw` degrees from facing you, nearest of what was baked. */
function viewFor(prefix: string, id: string, yaw: number): { name: string; flip: boolean } {
  const want = Math.abs(yaw);
  let best = FRONT_VIEWS[1];
  let gap = Infinity;
  for (const view of FRONT_VIEWS) {
    if (Math.abs(view[0] - want) < gap && (window.__TB_ART__ ?? {})[`${prefix}.${id}.${view[1]}`] !== undefined) {
      gap = Math.abs(view[0] - want);
      best = view;
    }
  }
  const name = `${prefix}.${id}.${best[1]}`;
  if (yaw >= 0 || best[0] === 0) {
    return { name, flip: false };
  }
  const own = `${name}R`;
  return (window.__TB_ART__ ?? {})[own] !== undefined ? { name: own, flip: false } : { name, flip: true };
}

/**
 * A character seen from the front, standing at (x, y), `size` px tall-ish.
 * Everyone is drawn at one scale per model unit, so a jeepney stays bigger than a
 * coupe. A little squash and stretch comes from the hop.
 */
export function drawCharacter(ctx: Ctx, id: CharacterId, x: number, y: number, size: number, pose: CharacterPose): void {
  const hero = !isMachine(id) && id !== 'radio';
  const view = hero ? viewFor('h', id, pose.yaw ?? 15) : { name: characterSprite(id), flip: false };
  const sprite = art(view.name) ?? art(characterSprite(id));
  if (sprite === null) {
    return;
  }
  const unitPx = isMachine(id) ? size * 0.2135 : id === 'radio' ? size / 2.8 : size / 3.9;
  const k = unitPx / sprite.ppu;
  const hop = (pose.hop ?? 0) * (size / 200);
  if (pose.shadow !== false) {
    const rx = (sprite.w * k) / 2.05;
    softShadow(ctx, x, y - 1, rx, Math.max(4, rx * 0.2), hop > 2 ? 0.18 : 0.28);
  }
  // Springy: stretches going up, settles flat. Standing still, a slow breath.
  const stretch = Math.min(0.05, hop / Math.max(40, size * 0.6));
  const breath = pose.anim.t === 0 ? 0 : Math.sin(pose.anim.t * 1.7 + id.length) * (id === 'navie' ? 0.006 : 0.013);
  ctx.save();
  ctx.translate(x, y - hop);
  ctx.rotate(pose.tilt ?? 0);
  ctx.scale(((pose.flip === true) !== view.flip ? -1 : 1) * (1 - stretch - breath * 0.5), 1 + stretch + breath);
  ctx.drawImage(sprite.img, -sprite.w * k * 0.5, -sprite.h * k, sprite.w * k, sprite.h * k);
  if (sprite.face !== undefined) {
    ctx.translate(-sprite.w * k * 0.5, -sprite.h * k);
    ctx.scale(k, k);
    drawClayFace(ctx, id, sprite.face, pose.expr, pose.anim);
  }
  ctx.restore();
}

export interface SidekickPoseLite {
  expr: Expression;
  t: number;
  blink: number;
  talk: number;
  lookX: number;
  evolved: boolean;
  action: number;
  /** Degrees turned away from facing you; negative turns the other way. */
  yaw?: number;
  /** 0-1 through a spin of whatever it has on top, if it has anything. */
  spin?: number;
}

/** How each sidekick moves: slow and grand, or quick and busy. Bob height, bob speed, squash, tilt. */
const RHYTHM: Partial<Record<SidekickId, [number, number, number, number]>> = {
  pip: [6, 3.0, 0.025, 0.06],
  bumbo: [4, 2.6, 0.06, 0.03],
  mila: [5, 3.2, 0.04, 0.08],
  kumpuni: [2, 3.0, 0.02, 0.02],
  bantay: [2, 5.0, 0.04, 0.02],
  silip: [6, 2.0, 0, 0.04],
  walis: [2, 2.6, 0.03, 0.03],
  barya: [6, 2.4, 0, 0.1],
  sibat: [3, 4.0, 0, 0.03],
  tala: [5, 1.4, 0.02, 0.05],
  ilaw: [1, 1.6, 0.01, 0.01],
  maso: [2, 1.8, 0.05, 0.05],
  parolito: [4, 1.5, 0, 0.06],
  bibing: [1, 1.8, 0.05, 0],
  kape: [1, 1.2, 0.03, 0.02],
  sago: [3, 3.2, 0.09, 0],
  sampy: [3, 1.2, 0.03, 0.05],
  kawayan: [1, 2.0, 0.02, 0.04],
  kalaw: [4, 2.4, 0.01, 0.03],
  tarsi: [2, 0.9, 0.02, 0.01],
  piko: [7, 4.4, 0.08, 0],
  saranggola: [7, 1.8, 0, 0.12],
  duwi: [1, 2.6, 0.03, 0.03],
  silaw: [7, 3.0, 0, 0.05],
  bitu: [5, 1.3, 0, 0.1],
  gearo: [1, 6.0, 0.02, 0.01],
  ulap: [5, 1.0, 0.04, 0.02],
  kono: [2, 3.0, 0.03, 0.03],
  kislap: [6, 3.4, 0.02, 0.05],
  dahon: [1, 1.1, 0.04, 0.02],
  radyo: [2, 4.2, 0.02, 0.02],
  ginto: [2, 3.6, 0.04, 0.03],
  hamog: [4, 0.9, 0.04, 0.02],
};

export function sidekickRhythm(id: SidekickId): [number, number, number, number] {
  return RHYTHM[id] ?? [3, 2.4, 0.02, 0.03];
}

/** How much of a sidekick sways above its body: long things wave, solid things barely do. */
const SWAY: Partial<Record<SidekickId, number>> = {
  dahon: 0.4, radyo: 0.3, kislap: 0.2, kono: 0.15, mila: 1, bumbo: 0.85, saranggola: 0.8, sampy: 0.55, parolito: 0.55, kawayan: 0.5, duwi: 0.45, walis: 0.45, tarsi: 0.4, silaw: 0.4, pip: 0.3, kalaw: 0.3, bantay: 0.3, kumpuni: 0.3, kape: 0.25, ilaw: 0.2, maso: 0.2, gearo: 0.12, barya: 0.1, bibing: 0.1,
};

export function sidekickSway(id: SidekickId): number {
  return SWAY[id] ?? 0.22;
}

/**
 * How each hero stands and reacts on the Team stage. bob: how high the idle bounce goes, and how fast; tilt: how far it rocks.
 * Picked, each does its own short thing. None of this exists on the road, where movement belongs to the game.
 */
type HeroFlourish = 'confident' | 'honk' | 'shy' | 'slow' | 'dance' | 'cool' | 'nod' | 'tilt' | 'zap' | 'peer' | 'rock' | 'prance' | 'star' | 'proud' | 'cheer';
const HERO_MOTION: Record<HeroId, { bob: number; speed: number; tilt: number; lean: number; flourish: HeroFlourish }> = {
  navie: { bob: 1.4, speed: 1.6, tilt: 0.004, lean: 0, flourish: 'confident' },
  jepoy: { bob: 1.6, speed: 1.1, tilt: 0.01, lean: -0.012, flourish: 'honk' },
  kiko: { bob: 1.5, speed: 2.0, tilt: 0.014, lean: -0.03, flourish: 'shy' },
  berto: { bob: 1.0, speed: 0.7, tilt: 0.012, lean: 0.016, flourish: 'slow' },
  ligaya: { bob: 2.6, speed: 2.4, tilt: 0.024, lean: 0.03, flourish: 'dance' },
  hiraya: { bob: 1.2, speed: 1.0, tilt: 0.014, lean: -0.022, flourish: 'cool' },
  sinta: { bob: 1.3, speed: 1.3, tilt: 0.008, lean: 0.012, flourish: 'nod' },
  amihan: { bob: 2.3, speed: 1.9, tilt: 0.024, lean: 0.032, flourish: 'tilt' },
  kidlat: { bob: 1.5, speed: 3.0, tilt: 0.008, lean: 0.012, flourish: 'zap' },
  nico: { bob: 1.0, speed: 1.2, tilt: 0.014, lean: -0.034, flourish: 'peer' },
  alon: { bob: 1.9, speed: 0.9, tilt: 0.026, lean: 0.022, flourish: 'rock' },
  tiko: { bob: 2.6, speed: 2.6, tilt: 0.02, lean: 0.038, flourish: 'prance' },
  ningning: { bob: 2.3, speed: 2.1, tilt: 0.018, lean: 0.026, flourish: 'star' },
  simoy: { bob: 1.8, speed: 1.4, tilt: 0.024, lean: -0.032, flourish: 'tilt' },
  sikat: { bob: 1.8, speed: 1.5, tilt: 0.008, lean: -0.014, flourish: 'proud' },
  tali: { bob: 2.2, speed: 1.9, tilt: 0.016, lean: 0.022, flourish: 'cheer' },
};

/** 0-1 through an occasional small gesture: most of the time 0, every few seconds a brief rise and fall. */
function idleBeat(t: number, seed: number): number {
  const every = 5.4 + (seed % 3);
  const at = (t + seed) % every;
  return at < 0.55 ? Math.sin((at / 0.55) * Math.PI) : 0;
}

/** How long a hero's reaction to being picked lasts, in seconds. */
export const FLOURISH_SECONDS = 0.9;

export function heroFlourishIsStars(id: HeroId): boolean {
  return HERO_MOTION[id].flourish === 'star';
}

/** A hero's bounce and rock at time t, `since` seconds after being picked. */
export function heroMotion(id: HeroId, t: number, since: number): { hop: number; tilt: number } {
  const m = HERO_MOTION[id];
  let hop = Math.abs(Math.sin(t * m.speed)) * m.bob;
  let tilt = m.lean + Math.sin(t * m.speed * 0.5 + id.length) * m.tilt;
  if (since >= FLOURISH_SECONDS) {
    if (id === 'navie') {
      return { hop, tilt };
    }
    // Now and then, for no reason, a tiny wiggle.
    const beat = idleBeat(t, id.length * 1.3);
    return { hop: hop + beat * 5, tilt: tilt + Math.sin(beat * Math.PI * 2) * 0.022 };
  }
  const q = since / FLOURISH_SECONDS;
  const fade = 1 - q;
  const one = Math.sin(q * Math.PI);
  switch (m.flourish) {
    case 'confident':
      hop = one * 16;
      break;
    case 'honk':
      hop = Math.abs(Math.sin(q * Math.PI * 2)) * 12 * fade;
      break;
    case 'shy':
      hop = one * 6;
      tilt = Math.sin(q * Math.PI * 2) * 0.03 * fade;
      break;
    case 'slow':
      tilt = Math.sin(q * Math.PI * 2) * 0.028;
      break;
    case 'dance':
      hop = Math.abs(Math.sin(q * Math.PI * 3)) * 10 * fade;
      tilt = Math.sin(q * Math.PI * 4) * 0.06 * fade;
      break;
    case 'cool':
      tilt = -one * 0.04;
      hop = one * 4;
      break;
    case 'nod':
      hop = Math.abs(Math.sin(q * Math.PI * 2)) * 6 * fade;
      break;
    case 'tilt':
      tilt = Math.sin(q * Math.PI * 2) * 0.055 * fade;
      hop = one * 8;
      break;
    case 'zap':
      hop = Math.abs(Math.sin(q * Math.PI * 5)) * 6 * fade;
      break;
    case 'peer':
      tilt = one * 0.05;
      break;
    case 'rock':
      tilt = Math.sin(q * Math.PI * 2) * 0.05 * fade;
      break;
    case 'prance':
      hop = Math.abs(Math.sin(q * Math.PI * 3)) * 14 * fade;
      tilt = Math.sin(q * Math.PI * 3) * 0.03 * fade;
      break;
    case 'star':
      hop = one * 14;
      tilt = Math.sin(q * Math.PI * 2) * 0.03 * fade;
      break;
    case 'proud':
      hop = one * 22;
      break;
    case 'cheer':
      hop = Math.abs(Math.sin(q * Math.PI * 2)) * 18 * fade;
      tilt = Math.sin(q * Math.PI * 4) * 0.035 * fade;
      break;
  }
  return { hop, tilt };
}

/** A sidekick's reaction to being picked: how far it lifts (in stage px at full size), and, for one with something to spin, how far round it has gone. */
export function sidekickMotion(id: SidekickId, since: number): { lift: number; spin: number } {
  if (since >= FLOURISH_SECONDS) {
    return { lift: 0, spin: 0 };
  }
  const q = since / FLOURISH_SECONDS;
  switch (id) {
    case 'bumbo':
      return { lift: Math.sin(q * Math.PI) * 10, spin: q };
    case 'mila':
    case 'kislap':
    case 'hamog':
    case 'parolito':
      // Floaters: up slowly, and slowly down.
      return { lift: Math.sin(q * Math.PI) * 26, spin: 0 };
    case 'kono':
    case 'dahon':
    case 'tarsi':
      return { lift: Math.sin(q * Math.PI) * 8, spin: 0 };
    default:
      return { lift: Math.sin(q * Math.PI) * 20, spin: 0 };
  }
}

/** Sidekicks with a part on top that can really spin: how far down the sprite it reaches. Only that part turns. */
const SPINNERS: Partial<Record<SidekickId, number>> = { bumbo: 0.2 };

/** The top of a sprite turned about its upright axis: a flat thing, narrowing and widening, is what spinning looks like from here. */
function blitSpun(ctx: Ctx, sprite: ClaySprite, x: number, y: number, k: number, reach: number, angle: number): void {
  const left = x - sprite.ax * k;
  const top = y - sprite.ay * k;
  const cut = Math.round(sprite.h * reach);
  ctx.drawImage(sprite.img, 0, cut, sprite.w, sprite.h - cut, left, top + cut * k, sprite.w * k, (sprite.h - cut) * k);
  ctx.save();
  ctx.translate(left + sprite.w * k * 0.5, 0);
  ctx.scale(Math.max(0.12, Math.abs(Math.cos(angle))), 1);
  ctx.drawImage(sprite.img, 0, 0, sprite.w, cut, -sprite.w * k * 0.5, top, sprite.w * k, cut * k);
  ctx.restore();
}

/** A sidekick from the front, standing or hovering at the origin of the current transform (88 units = 1 model unit). */
export function drawSidekick(ctx: Ctx, id: SidekickId, pose: SidekickPoseLite): void {
  const view = pose.evolved ? { name: `s.${id}.evo`, flip: false } : viewFor('s', id, pose.yaw ?? 15);
  const sprite = art(view.name) ?? art(`s.${id}.${pose.evolved ? 'evo' : 'front'}`);
  if (sprite === null) {
    return;
  }
  const k = 88 / sprite.ppu;
  const [bob, speed, squash, tilt] = sidekickRhythm(id);
  const phase = pose.t * speed;
  const up = (0.5 + 0.5 * Math.sin(phase)) * bob * 1.6 + pose.action * 22;
  const sq = Math.sin(phase * 2) * squash;
  const sway = pose.t === 0 ? 0 : Math.sin(phase * 0.8 + 0.6) * 5 * sidekickSway(id);
  ctx.save();
  ctx.translate(0, -up);
  ctx.rotate(Math.sin(phase * 0.7) * tilt);
  ctx.scale((view.flip ? -1 : 1) * (1 + sq), 1 - sq);
  const spinner = SPINNERS[id];
  if (spinner !== undefined && (pose.spin ?? 0) > 0) {
    blitSpun(ctx, sprite, (sprite.ax - sprite.w * 0.5) * k, (sprite.ay - sprite.h) * k, k, spinner, (pose.spin ?? 0) * Math.PI * 3);
  } else {
    blitBent(ctx, sprite, (sprite.ax - sprite.w * 0.5) * k, (sprite.ay - sprite.h) * k, k, sprite.img, sway, 0.58);
  }
  if (sprite.face !== undefined) {
    ctx.translate(-sprite.w * k * 0.5, -sprite.h * k);
    ctx.scale(k, k);
    drawClayFace(ctx, id, sprite.face, pose.expr, { t: pose.t, blink: pose.blink, talk: pose.talk, lookX: pose.lookX, lookY: 0 });
  }
  ctx.restore();
}

/** Blink timing: mostly open, a quick close every few seconds, offset per character. */
export function blinkAt(t: number, seed = 0): number {
  const cycle = 3.6 + (seed % 3) * 0.9;
  const at = (t + seed * 1.37) % cycle;
  if (at > 0.14) {
    return 0;
  }
  return 1 - Math.abs(at - 0.07) / 0.07;
}

// -- portraits for the interface ---------------------------------------------------------------

export interface PortraitOptions {
  expr?: Expression;
  evolved?: boolean;
  /** Tight on the face (small chips) instead of the whole body. */
  crop?: boolean;
  /** Dark and blank: someone not yet earned. Its shape still reads. */
  locked?: boolean;
}

/**
 * A portrait as a canvas element: it appears the moment its art is decoded, so a
 * long list of faces never holds up the screen. Size is in CSS px.
 */
export function portraitEl(className: string, id: CharacterId | SidekickId, size: number, kind: 'character' | 'sidekick', options: PortraitOptions = {}): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ratio = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * ratio);
  canvas.height = Math.round(size * ratio);
  canvas.className = className;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.setAttribute('aria-hidden', 'true');
  const name = kind === 'sidekick' ? `s.${id}.${options.evolved ? 'evo' : 'front'}` : characterSprite(id as CharacterId);
  void preloadOne(name).then((sprite) => {
    if (sprite === null) {
      return;
    }
    const c = canvas.getContext('2d')!;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintPortrait(c, sprite, id, size, options, kind);
    if (options.locked === true) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(53,72,68,0.92)';
      c.fillRect(0, 0, canvas.width, canvas.height);
    }
  });
  return canvas;
}

function paintPortrait(c: Ctx, sprite: ClaySprite, id: CharacterId | SidekickId, size: number, options: PortraitOptions, kind_: 'character' | 'sidekick'): void {
  const expr = options.expr ?? 'happy';
  if (options.crop === true && sprite.face !== undefined) {
    // Around the eyes and mouth, showing what makes the character who it is.
    const f = sprite.face;
    const eyes = f.eyes;
    const cx = eyes.reduce((s, e) => s + e[0], 0) / eyes.length;
    const cy = (eyes.reduce((s, e) => s + e[1], 0) / eyes.length + f.mouth[1]) / 2;
    const span = Math.max(sprite.w * 0.62, Math.abs(f.mouth[1] - eyes[0][1]) * 3.4);
    const k = size / span;
    c.save();
    c.translate(size / 2 - cx * k, size / 2 - cy * k);
    c.scale(k, k);
    c.drawImage(sprite.img, 0, 0);
    drawClayFace(c, id, f, expr, { t: 0, blink: 0, talk: 0, lookX: 0, lookY: 0 });
    c.restore();
    return;
  }
  // One scale per model unit for everyone of a kind, so a tile shows real proportions; only what would not fit is reduced.
  const unit = (size / (kind_ === 'sidekick' ? 2.75 : 4.5)) / sprite.ppu;
  const k = Math.min(unit, (size * 0.96) / sprite.w, (size * 0.84) / sprite.h);
  if (options.locked !== true) {
    softShadow(c, size / 2, size * 0.93, Math.min(size * 0.46, sprite.w * k * 0.46), size * 0.055, 0.3);
  }
  c.save();
  c.translate((size - sprite.w * k) / 2, size * 0.95 - sprite.h * k);
  c.scale(k, k);
  c.drawImage(sprite.img, 0, 0);
  if (sprite.face !== undefined) {
    drawClayFace(c, id, sprite.face, expr, { t: 0, blink: 0, talk: 0, lookX: 0, lookY: 0 });
  }
  c.restore();
}
