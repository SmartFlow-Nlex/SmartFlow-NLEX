import type { FoeKind } from '../../core/types';
import { BRAND_FONT, ellipsePath, groundShadow, hgrad, paint, rgba, rgrad, roundRect, shade, sheen, vgrad, type Ctx } from './kit';
import { C } from './palette';

/**
 * Haring Barrikada's "jam gang": the fantasy minions the heroes' pulses hit.
 * They share one look so they never pass for road hazards (orange/white
 * cones, striped barriers), traffic (car rear views) or pick-ups (gold
 * nuts, teal gears, cyan sparks): violet machine bodies with magenta
 * trim, a cheeky face with two glowing red-orange eyes under magenta brow
 * plates, a little blinking antenna, and legs, treads or wheels. They face
 * the player because they come toward the camera.
 *
 * Units match vehicles.ts (one lane = 312.5 units, origin at the ground
 * point under the foe, y up negative): conebot ~120 wide, drumbot ~170,
 * signbot ~200.
 */

export const FOE_BOX: Record<FoeKind, [number, number, number, number]> = {
  conebot: [-95, -200, 95, 14],
  drumbot: [-120, -215, 120, 14],
  signbot: [-125, -245, 125, 14],
};

export interface FoeLook {
  t: number;
  /** 0..1: white flash + squash right after a hit. */
  hurt: number;
  /** 0..1 health left: cracks and sparks as it drops. */
  hp: number;
  /** High-contrast mode: thick black outline and a hatch pattern. */
  outline: boolean;
}

const GANG = {
  body: '#8340D6',
  dark: '#4A1C8C',
  trim: '#E046B4',
  ink: '#2A0B4A',
  metal: '#5B5370',
  metalLight: '#A49DBA',
};

interface Line {
  /** Outline colour. */
  c: string;
  /** Outline width. */
  w: number;
  hi: boolean;
}

function lineFor(o: FoeLook): Line {
  return o.outline ? { c: '#000000', w: 6, hi: true } : { c: GANG.ink, w: 3.5, hi: false };
}

function stroke(ctx: Ctx, l: Line, scale = 1): void {
  ctx.lineWidth = l.w * scale;
  ctx.strokeStyle = l.c;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** High-contrast hatch over the current path. */
function hatch(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = -h; i < w; i += 16) {
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

function rivets(ctx: Ctx, pts: [number, number][]): void {
  for (const [x, y] of pts) {
    ellipsePath(ctx, x, y, 3, 3);
    ctx.fillStyle = GANG.metalLight;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = GANG.ink;
    ctx.stroke();
  }
}

/**
 * The gang's face: two big glossy eyes with the gang's glowing red-orange
 * irises, stubby magenta brow plates tilted in mischief, a one-fang grin and
 * blush - cheeky troublemakers, not monsters. A hit squeezes the eyes shut
 * (> <) and pops the mouth open; low health makes the irises flicker.
 */
function gangFace(ctx: Ctx, x: number, y: number, r: number, o: FoeLook, l: Line): void {
  const flicker = o.hp < 0.4 ? 0.55 + 0.45 * Math.abs(Math.sin(o.t * 23)) : 1;
  const hurt = o.hurt > 0.5;
  // The gang's glow behind the face.
  ctx.fillStyle = rgrad(ctx, x, y, 0, r * 2.4, [
    [0, rgba(C.lens, 0.35 * flicker)],
    [1, rgba(C.lens, 0)],
  ]);
  ellipsePath(ctx, x, y, r * 2.4, r * 2.2);
  ctx.fill();
  // Blush.
  for (const side of [-1, 1]) {
    ellipsePath(ctx, x + side * r * 1.55, y + r * 0.72, r * 0.42, r * 0.24);
    ctx.fillStyle = 'rgba(255,128,196,0.55)';
    ctx.fill();
  }
  for (const side of [-1, 1]) {
    const ex = x + side * r * 0.92;
    if (hurt) {
      // Squeezed shut: > <
      ctx.beginPath();
      ctx.moveTo(ex - side * r * 0.5, y - r * 0.42);
      ctx.lineTo(ex + side * r * 0.35, y);
      ctx.lineTo(ex - side * r * 0.5, y + r * 0.42);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = r * 0.26;
      ctx.strokeStyle = GANG.ink;
      ctx.stroke();
      continue;
    }
    ellipsePath(ctx, ex, y, r * 0.78, r * 0.9);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    stroke(ctx, l, 0.75);
    // Iris looking slightly down at the hero, in the gang's lens colours.
    ctx.save();
    ellipsePath(ctx, ex, y, r * 0.78, r * 0.9);
    ctx.clip();
    ellipsePath(ctx, ex + side * -r * 0.06, y + r * 0.16, r * 0.56, r * 0.6);
    ctx.fillStyle = rgrad(ctx, ex, y + r * 0.2, 0, r * 0.62, [
      [0, `rgba(255,236,170,${flicker})`],
      [0.45, `rgba(255,150,60,${flicker})`],
      [0.8, C.lens],
      [1, '#8E1A14'],
    ]);
    ctx.fill();
    ellipsePath(ctx, ex + side * -r * 0.06, y + r * 0.2, r * 0.25, r * 0.28);
    ctx.fillStyle = '#3A0A08';
    ctx.fill();
    ctx.restore();
    ellipsePath(ctx, ex - r * 0.24, y - r * 0.24, r * 0.22, r * 0.2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ellipsePath(ctx, ex + r * 0.22, y + r * 0.34, r * 0.1, r * 0.09);
    ctx.fill();
    if (l.hi) {
      ellipsePath(ctx, ex, y, r * 0.78 + 2, r * 0.9 + 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
    }
    // Brow plate, tilted down toward the middle: up to something.
    ctx.beginPath();
    ctx.moveTo(ex - side * r * 0.62, y - r * 1.26);
    ctx.lineTo(ex + side * r * 0.5, y - r * 0.96);
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.34 + l.w * 1.6;
    ctx.strokeStyle = l.c;
    ctx.stroke();
    ctx.lineWidth = r * 0.34;
    ctx.strokeStyle = GANG.trim;
    ctx.stroke();
  }
  // Mouth: a lopsided grin with one fang; an O when hit.
  const my = y + r * 1.12;
  ctx.beginPath();
  if (hurt) {
    ctx.ellipse(x, my + r * 0.05, r * 0.26, r * 0.3, 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(x - r * 0.62, my - r * 0.12);
    ctx.quadraticCurveTo(x, my + r * 0.18, x + r * 0.62, my - r * 0.2);
    ctx.quadraticCurveTo(x + r * 0.1, my + r * 0.72, x - r * 0.62, my - r * 0.12);
  }
  ctx.fillStyle = '#3A0E2A';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, l.w * 0.6);
  ctx.strokeStyle = l.c;
  ctx.lineJoin = 'round';
  ctx.stroke();
  if (!hurt) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.36, my - r * 0.02);
    ctx.lineTo(x - r * 0.18, my + r * 0.3);
    ctx.lineTo(x - r * 0.06, my + r * 0.04);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }
}

function antenna(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, t: number, l: Line): void {
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = GANG.metal;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const on = Math.sin(t * 5) > 0 ? 1 : 0.45;
  ellipsePath(ctx, x1, y1, 11, 11);
  ctx.fillStyle = rgba(C.lens, 0.3 * on);
  ctx.fill();
  ellipsePath(ctx, x1, y1, 6, 6);
  ctx.fillStyle = on > 0.5 ? '#FF7A5A' : '#B23A2A';
  ctx.fill();
  stroke(ctx, l, 0.6);
}

/** Cracks, sparks and smoke by health. Cracks need the body path clip to be set by the caller via `inside`. */
function damage(ctx: Ctx, o: FoeLook, cracks: [number, number, number][], sparks: [number, number][]): void {
  if (o.hp > 0.7) {
    return;
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [x, y, s] of cracks) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 7 * s, y + 6);
    ctx.lineTo(x + 3 * s, y + 12);
    ctx.lineTo(x + 11 * s, y + 20);
    ctx.moveTo(x + 7 * s, y + 6);
    ctx.lineTo(x + 15 * s, y + 4);
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#1A0630';
    ctx.stroke();
  }
  ctx.restore();
  if (o.hp > 0.4) {
    return;
  }
  // Smoke puffs drifting up from the first spark point.
  const [sx, sy] = sparks[0];
  for (let i = 0; i < 3; i += 1) {
    const k = (o.t * 0.8 + i / 3) % 1;
    ellipsePath(ctx, sx + Math.sin(k * 6 + i) * 6, sy - 10 - k * 34, 7 + k * 9, 7 + k * 9);
    ctx.fillStyle = `rgba(90,86,104,${0.5 * (1 - k)})`;
    ctx.fill();
  }
  for (let i = 0; i < sparks.length; i += 1) {
    const [x, y] = sparks[i];
    const k = Math.sin(o.t * 19 + i * 2.1);
    if (k < 0.1) {
      continue;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.t * 9 + i);
    ctx.beginPath();
    for (let j = 0; j < 8; j += 1) {
      const a = (Math.PI * j) / 4;
      const r = j % 2 === 0 ? 9 * k : 3;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = '#FFF4A8';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#FF9A2A';
    ctx.stroke();
    ctx.restore();
  }
}

/** Little jointed legs. */
function leg(ctx: Ctx, hipX: number, hipY: number, side: -1 | 1, lift: number, l: Line): void {
  const footX = hipX + side * 10;
  const footY = -6 - lift;
  const kneeX = hipX + side * 14;
  const kneeY = (hipY + footY) / 2 - 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.lineWidth = 10 + l.w * 2;
  ctx.strokeStyle = l.c;
  ctx.stroke();
  ctx.lineWidth = 10;
  ctx.strokeStyle = GANG.metal;
  ctx.stroke();
  ellipsePath(ctx, kneeX, kneeY, 6, 6);
  ctx.fillStyle = GANG.trim;
  ctx.fill();
  stroke(ctx, l, 0.6);
  roundRect(ctx, footX - 14, footY - 4, 28, 10, 5);
  ctx.fillStyle = vgrad(ctx, footY - 4, footY + 6, [
    [0, GANG.metalLight],
    [1, '#2E2840'],
  ]);
  ctx.fill();
  stroke(ctx, l, 0.8);
}

function pincer(ctx: Ctx, x: number, y: number, side: -1 | 1, open: number, l: Line): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(side, 1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(14, 4);
  ctx.lineWidth = 8 + l.w * 2;
  ctx.strokeStyle = l.c;
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.strokeStyle = GANG.metal;
  ctx.stroke();
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(14, 4);
    ctx.quadraticCurveTo(24, 4 + dir * (6 + open * 4), 26, 4 + dir * (2 + open * 2));
    ctx.lineWidth = 5 + l.w;
    ctx.strokeStyle = l.c;
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = GANG.trim;
    ctx.stroke();
  }
  ctx.restore();
}

// -- conebot ------------------------------------------------------------------------------

function conebotSilhouette(ctx: Ctx, bounce: number): void {
  ctx.beginPath();
  ctx.ellipse(0, -84 - bounce, 50, 44, 0, 0, Math.PI * 2);
  ctx.moveTo(-34, -124 - bounce);
  ctx.lineTo(34, -124 - bounce);
  ctx.lineTo(8, -176 - bounce);
  ctx.lineTo(-8, -176 - bounce);
  ctx.closePath();
}

function drawConebot(ctx: Ctx, o: FoeLook, l: Line): void {
  const t = o.t;
  const step = t * 8;
  const bounce = Math.abs(Math.sin(step)) * 3;
  groundShadow(ctx, 0, -2, 58, 9, 0.32);
  leg(ctx, -20, -50 - bounce, -1, Math.max(0, Math.sin(step)) * 7, l);
  leg(ctx, 20, -50 - bounce, 1, Math.max(0, -Math.sin(step)) * 7, l);

  ctx.save();
  ctx.translate(0, -bounce);
  antenna(ctx, 30, -114, 46, -140, t, l);
  pincer(ctx, -48, -78, -1, 0.5 + 0.5 * Math.sin(t * 4), l);
  pincer(ctx, 48, -78, 1, 0.5 + 0.5 * Math.sin(t * 4 + 1), l);

  // Round machine body.
  ellipsePath(ctx, 0, -84, 50, 44);
  paint(ctx, GANG.body, -128, -40, null);
  ctx.save();
  ellipsePath(ctx, 0, -84, 50, 44);
  ctx.clip();
  ctx.fillStyle = vgrad(ctx, -62, -40, [
    [0, shade(GANG.dark, 0.15)],
    [1, GANG.dark],
  ]);
  ctx.fillRect(-52, -60, 104, 22);
  ctx.fillStyle = GANG.trim;
  ctx.fillRect(-52, -63, 104, 4);
  sheen(ctx, -22, -114, 26, 12, 0.35);
  ctx.restore();
  ellipsePath(ctx, 0, -84, 50, 44);
  if (l.hi) {
    hatch(ctx, -50, -128, 100, 88);
    ellipsePath(ctx, 0, -84, 50, 44);
  }
  stroke(ctx, l);
  rivets(ctx, [[-30, -52], [30, -52], [0, -48]]);
  ctx.save();
  ellipsePath(ctx, 0, -84, 50, 44);
  ctx.clip();
  damage(ctx, o, [[-38, -106, 1], [20, -70, -1]], [[24, -112]]);
  ctx.restore();
  gangFace(ctx, 0, -86, 15, o, l);

  // The cone "hat": orange with a magenta band and a black brim, worn at an angle.
  ctx.save();
  ctx.translate(0, -122);
  ctx.rotate(-0.12);
  ctx.beginPath();
  ctx.moveTo(-28, 0);
  ctx.lineTo(-8, -52);
  ctx.quadraticCurveTo(0, -58, 8, -52);
  ctx.lineTo(28, 0);
  ctx.closePath();
  ctx.fillStyle = hgrad(ctx, -28, 28, [
    [0, '#FFB06A'],
    [0.5, C.cone],
    [1, '#C9530A'],
  ]);
  ctx.fill();
  stroke(ctx, l);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = GANG.trim;
  ctx.fillRect(-30, -30, 60, 10);
  ctx.restore();
  roundRect(ctx, -36, -6, 72, 10, 5);
  ctx.fillStyle = '#2B2F38';
  ctx.fill();
  stroke(ctx, l, 0.8);
  ctx.restore();
  ctx.restore();
}

// -- drumbot -------------------------------------------------------------------------------

function drumSilhouette(ctx: Ctx): void {
  ctx.beginPath();
  ctx.rect(-70, -168, 140, 132);
  ctx.moveTo(70, -168);
  ctx.ellipse(0, -168, 70, 14, 0, 0, Math.PI * 2);
  ctx.moveTo(-88, -40);
  ctx.rect(-88, -40, 176, 38);
}

function drawDrumbot(ctx: Ctx, o: FoeLook, l: Line): void {
  const t = o.t;
  const rumble = Math.sin(t * 30) * 0.8;
  groundShadow(ctx, 0, -2, 96, 11, 0.34);

  // Treads.
  for (const side of [-1, 1]) {
    const x = side < 0 ? -88 : 30;
    roundRect(ctx, x, -40, 58, 38, 14);
    ctx.fillStyle = vgrad(ctx, -40, -2, [
      [0, '#4A4458'],
      [1, '#1C1828'],
    ]);
    ctx.fill();
    stroke(ctx, l);
    ctx.save();
    roundRect(ctx, x, -40, 58, 38, 14);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 4;
    const off = (t * 40) % 10;
    for (let y = -44 + off; y < 0; y += 10) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 58, y);
      ctx.stroke();
    }
    ctx.restore();
    for (const wx of [x + 16, x + 42]) {
      ellipsePath(ctx, wx, -21, 8, 8);
      ctx.fillStyle = GANG.metalLight;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = GANG.ink;
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(rumble, 0);
  antenna(ctx, 36, -174, 46, -204, t, l);
  // Clamp arms.
  pincer(ctx, -70, -96, -1, 0.5 + 0.5 * Math.sin(t * 3), l);
  pincer(ctx, 70, -96, 1, 0.5 + 0.5 * Math.sin(t * 3 + 2), l);

  // Drum body.
  roundRect(ctx, -70, -168, 140, 132, [4, 4, 14, 14]);
  ctx.fillStyle = hgrad(ctx, -70, 70, [
    [0, shade(GANG.body, -0.25)],
    [0.3, shade(GANG.body, 0.2)],
    [0.55, GANG.body],
    [1, shade(GANG.body, -0.4)],
  ]);
  ctx.fill();
  ctx.save();
  roundRect(ctx, -70, -168, 140, 132, [4, 4, 14, 14]);
  ctx.clip();
  // Ribs.
  for (const y of [-146, -66]) {
    ctx.fillStyle = vgrad(ctx, y - 6, y + 6, [
      [0, shade(GANG.trim, 0.2)],
      [1, shade(GANG.trim, -0.3)],
    ]);
    ctx.fillRect(-72, y - 6, 144, 12);
  }
  // Armour plate behind the eye.
  ctx.restore();
  roundRect(ctx, -46, -138, 92, 64, 12);
  paint(ctx, GANG.dark, -138, -74, l.c, l.w * 0.8);
  rivets(ctx, [[-38, -130], [38, -130], [-38, -82], [38, -82]]);
  roundRect(ctx, -70, -168, 140, 132, [4, 4, 14, 14]);
  if (l.hi) {
    hatch(ctx, -70, -168, 140, 132);
    roundRect(ctx, -70, -168, 140, 132, [4, 4, 14, 14]);
  }
  stroke(ctx, l);
  // Lid.
  ellipsePath(ctx, 0, -168, 70, 14);
  ctx.fillStyle = vgrad(ctx, -182, -154, [
    [0, shade(GANG.body, 0.35)],
    [1, GANG.dark],
  ]);
  ctx.fill();
  stroke(ctx, l);
  ellipsePath(ctx, 0, -169, 52, 8);
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(GANG.ink, 0.5);
  ctx.stroke();
  // Bung cap on the lid.
  ellipsePath(ctx, -26, -170, 9, 4);
  ctx.fillStyle = GANG.metalLight;
  ctx.fill();
  stroke(ctx, l, 0.5);

  ctx.save();
  roundRect(ctx, -70, -168, 140, 132, [4, 4, 14, 14]);
  ctx.clip();
  damage(ctx, o, [[-62, -126, 1], [48, -110, -1], [-20, -64, 1]], [[50, -150], [-54, -92]]);
  if (o.hp <= 0.4) {
    // A plate has popped: bare wiring shows.
    roundRect(ctx, 30, -64, 32, 22, 4);
    ctx.fillStyle = '#1A1426';
    ctx.fill();
    ctx.lineWidth = 2.5;
    for (const [c, dy] of [['#FFC32D', 0], ['#4FC3FF', 6], ['#FF5A3C', 12]] as [string, number][]) {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(32, -58 + dy);
      ctx.quadraticCurveTo(46, -50 + dy - 8, 60, -58 + dy);
      ctx.stroke();
    }
  }
  ctx.restore();
  gangFace(ctx, 0, -106, 19, o, l);
  ctx.restore();
}

// -- signbot --------------------------------------------------------------------------------

function signSilhouette(ctx: Ctx, sway: number): void {
  ctx.beginPath();
  ctx.save();
  ctx.translate(0, -110);
  ctx.rotate(sway);
  ctx.rect(-100, -96, 200, 92);
  ctx.restore();
  ctx.moveTo(52, -66);
  ctx.ellipse(0, -66, 52, 34, 0, 0, Math.PI * 2);
  ctx.moveTo(-18, -20);
  ctx.ellipse(-38, -20, 20, 20, 0, 0, Math.PI * 2);
  ctx.moveTo(58, -20);
  ctx.ellipse(38, -20, 20, 20, 0, 0, Math.PI * 2);
}

function drawSignbot(ctx: Ctx, o: FoeLook, l: Line): void {
  const t = o.t;
  const sway = Math.sin(t * 3) * 0.04;
  groundShadow(ctx, 0, -2, 84, 10, 0.32);

  // Wheels, seen side-on because it rolls sideways.
  for (const side of [-1, 1]) {
    const x = side * 38;
    ellipsePath(ctx, x, -20, 20, 20);
    ctx.fillStyle = rgrad(ctx, x, -20, 0, 20, [
      [0, '#4A4458'],
      [1, '#1C1828'],
    ]);
    ctx.fill();
    stroke(ctx, l);
    ellipsePath(ctx, x, -20, 10, 10);
    ctx.fillStyle = GANG.trim;
    ctx.fill();
    stroke(ctx, l, 0.6);
    ctx.save();
    ctx.translate(x, -20);
    ctx.rotate(t * 6);
    ctx.strokeStyle = GANG.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const a = (Math.PI * 2 * i) / 3;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Posts / arms up to the sign.
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 36, -80);
    ctx.lineTo(side * 54, -118);
    ctx.lineWidth = 10 + l.w * 2;
    ctx.strokeStyle = l.c;
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.strokeStyle = GANG.metal;
    ctx.stroke();
  }

  // Dome base with the eye.
  ellipsePath(ctx, 0, -66, 52, 34);
  paint(ctx, GANG.body, -100, -32, null);
  ctx.save();
  ellipsePath(ctx, 0, -66, 52, 34);
  ctx.clip();
  ctx.fillStyle = GANG.dark;
  ctx.fillRect(-54, -46, 108, 16);
  ctx.fillStyle = GANG.trim;
  ctx.fillRect(-54, -49, 108, 4);
  sheen(ctx, -20, -92, 24, 8, 0.35);
  ctx.restore();
  ellipsePath(ctx, 0, -66, 52, 34);
  if (l.hi) {
    hatch(ctx, -52, -100, 104, 68);
    ellipsePath(ctx, 0, -66, 52, 34);
  }
  stroke(ctx, l);
  ctx.save();
  ellipsePath(ctx, 0, -66, 52, 34);
  ctx.clip();
  damage(ctx, o, [[-44, -84, 1]], [[34, -88]]);
  ctx.restore();
  gangFace(ctx, 0, -70, 13, o, l);

  // The sign, swaying.
  ctx.save();
  ctx.translate(0, -110);
  ctx.rotate(sway);
  antenna(ctx, 84, -96, 92, -116, t, l);
  roundRect(ctx, -100, -96, 200, 92, 14);
  paint(ctx, GANG.body, -96, -4, null);
  ctx.save();
  roundRect(ctx, -100, -96, 200, 92, 14);
  ctx.clip();
  sheen(ctx, -60, -92, 60, 10, 0.3);
  ctx.restore();
  roundRect(ctx, -100, -96, 200, 92, 14);
  stroke(ctx, l);
  roundRect(ctx, -86, -84, 172, 68, 8);
  ctx.fillStyle = vgrad(ctx, -84, -16, [
    [0, '#FFF6FB'],
    [1, '#F1DDF0'],
  ]);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = GANG.trim;
  ctx.stroke();
  if (l.hi) {
    roundRect(ctx, -86, -84, 172, 68, 8);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
  }
  ctx.font = `900 27px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = GANG.dark;
  ctx.fillText('ROAD', 0, -64);
  ctx.fillText('CLOSED', 0, -36);
  // Little "jam" fist-bolts on the corners.
  rivets(ctx, [[-92, -88], [92, -88], [-92, -12], [92, -12]]);
  ctx.save();
  roundRect(ctx, -100, -96, 200, 92, 14);
  ctx.clip();
  damage(ctx, o, [[-70, -90, 1], [60, -40, -1]], [[-80, -20], [70, -86]]);
  ctx.restore();
  ctx.restore();
}

// -- entry point ---------------------------------------------------------------------------------

/** Origin = ground point under it; width scaled for a road lane of 312.5 units (conebot ~120 units wide, drumbot ~170, signbot ~200). */
export function drawFoe(ctx: Ctx, kind: FoeKind, o: { t: number; hurt: number; hp: number; outline: boolean }): void {
  const l = lineFor(o);
  const hurt = Math.max(0, Math.min(1, o.hurt));
  ctx.save();
  // Squash on the ground point when just hit.
  ctx.scale(1 + hurt * 0.12, 1 - hurt * 0.12);
  if (kind === 'conebot') {
    drawConebot(ctx, o, l);
  } else if (kind === 'drumbot') {
    drawDrumbot(ctx, o, l);
  } else {
    drawSignbot(ctx, o, l);
  }
  if (hurt > 0.01) {
    // White hit flash over the silhouette.
    if (kind === 'conebot') {
      conebotSilhouette(ctx, Math.abs(Math.sin(o.t * 8)) * 3);
    } else if (kind === 'drumbot') {
      drumSilhouette(ctx);
    } else {
      signSilhouette(ctx, Math.sin(o.t * 3) * 0.04);
    }
    ctx.fillStyle = `rgba(255,255,255,${0.62 * hurt})`;
    ctx.fill();
  }
  ctx.restore();
}
