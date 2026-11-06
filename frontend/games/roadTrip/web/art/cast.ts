import type { CharacterId, Expression, MachineId } from '../../core/types';
import { drawCheeks, drawExtras, drawEyes, drawMouth, starPath, type FaceAnim, type FaceStyle } from './faces';
import { BRAND_FONT, ellipsePath, groundShadow, hgrad, paint, rgba, rgrad, roundRect, shade, sheen, vgrad, type Ctx } from './kit';
import { C } from './palette';
import { drawBarrikada } from './boss';

/**
 * The cast, front view - used in the garage, story scenes and radio
 * portraits, where faces have to act. All drawn in a 200-unit box: origin at
 * the bottom centre, y up is negative.
 *
 * Navie is a project-native drawing of the canonical mascot
 * (frontend/assets/mascot-waving.png, mascot-loading.png): proportions were
 * measured off the render - cap ~38% of the height with a white front panel
 * and a ringed "N" badge, white windscreen face with the eyes, mirrors at eye
 * level, "N" on the bonnet, mouth between round headlights, chunky tyres.
 * Jepoy and Kiko reuse the same face rig and body treatment.
 */

export interface Pose {
  expr: Expression;
  anim: FaceAnim;
  /** Extra hop, units. */
  hop?: number;
  /** Tilt, radians. */
  tilt?: number;
  /** Draw the floor shadow. */
  shadow?: boolean;
}

export const NAVIE_FACE: FaceStyle = {
  eyeGap: 27,
  eyeY: -99,
  eyeRx: 17.5,
  eyeRy: 20,
  iris: C.navieIris,
  irisDark: '#1F5FBF',
  lashes: true,
  browColor: C.navieBrow,
  browWidth: 2.6,
  browRise: 3,
  browLength: 18,
  skin: '#FBFDFF',
  cheekX: 45,
  cheekY: -83,
  cheekR: 8.5,
  mouthX: 0,
  mouthY: -52,
  mouthW: 30,
  outline: C.navieOutline,
};

function tyres(ctx: Ctx, x0: number, x1: number, top: number, bottom: number): void {
  for (const side of [-1, 1]) {
    const a = side < 0 ? -x1 : x0;
    const w = x1 - x0;
    roundRect(ctx, a, top, w, bottom - top, 9);
    ctx.fillStyle = vgrad(ctx, top, bottom, [
      [0, '#3A4252'],
      [0.5, C.tyre],
      [1, '#141821'],
    ]);
    ctx.fill();
    // Tread blocks.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    for (let y = top + 6; y < bottom - 3; y += 6) {
      ctx.beginPath();
      ctx.moveTo(a + 4, y);
      ctx.lineTo(a + w - 4, y);
      ctx.stroke();
    }
  }
}

function headlight(ctx: Ctx, x: number, y: number, r: number, glow = 1): void {
  ctx.fillStyle = rgrad(ctx, x, y, 0, r * 1.9, [
    [0, `rgba(220,240,255,${0.35 * glow})`],
    [1, 'rgba(220,240,255,0)'],
  ]);
  ellipsePath(ctx, x, y, r * 1.9, r * 1.9);
  ctx.fill();
  ellipsePath(ctx, x, y, r, r);
  ctx.fillStyle = '#BFD9F5';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(20,62,142,0.7)';
  ctx.stroke();
  ellipsePath(ctx, x, y, r * 0.74, r * 0.74);
  ctx.fillStyle = rgrad(ctx, x, y, 0, r * 0.74, [
    [0, '#FFFFFF'],
    [0.6, '#EAF6FF'],
    [1, '#9CCBF2'],
  ], x - r * 0.25, y - r * 0.3);
  ctx.fill();
  ellipsePath(ctx, x - r * 0.3, y - r * 0.32, r * 0.22, r * 0.16);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

// -- Navie -------------------------------------------------------------------

export function drawNavieFront(ctx: Ctx, pose: Pose): void {
  const { expr, anim } = pose;
  const o = C.navieOutline;
  if (pose.shadow !== false) {
    groundShadow(ctx, 0, -2, 92, 10);
  }
  tyres(ctx, 52, 86, -40, 0);

  // Mirrors - ear-like, at eye level.
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 82, -92);
    ctx.rotate(side * 0.25);
    ellipsePath(ctx, 0, 0, 14, 12);
    paint(ctx, C.navieBody, -12, 12, o, 2.6);
    ellipsePath(ctx, side * 2, 1, 8.5, 7);
    ctx.fillStyle = vgrad(ctx, -7, 8, [
      [0, '#CFE6FF'],
      [1, '#7FB3F0'],
    ]);
    ctx.fill();
    ctx.restore();
  }

  // Body.
  ctx.beginPath();
  ctx.moveTo(-76, -22);
  ctx.bezierCurveTo(-86, -30, -86, -60, -80, -84);
  ctx.bezierCurveTo(-78, -106, -72, -120, -62, -126);
  ctx.lineTo(62, -126);
  ctx.bezierCurveTo(72, -120, 78, -106, 80, -84);
  ctx.bezierCurveTo(86, -60, 86, -30, 76, -22);
  ctx.bezierCurveTo(50, -14, -50, -14, -76, -22);
  ctx.closePath();
  paint(ctx, C.navieBody, -126, -16, o, 3);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-76, -22);
  ctx.bezierCurveTo(-86, -30, -86, -60, -80, -84);
  ctx.lineTo(80, -84);
  ctx.bezierCurveTo(86, -60, 86, -30, 76, -22);
  ctx.closePath();
  sheen(ctx, -40, -70, 40, 18, 0.28);
  ctx.restore();

  // Bumper band.
  roundRect(ctx, -72, -36, 144, 14, 7);
  ctx.fillStyle = vgrad(ctx, -36, -22, [
    [0, shade(C.navieBody, 0.25)],
    [1, shade(C.navieBody, -0.15)],
  ]);
  ctx.fill();

  // Windscreen face.
  ctx.beginPath();
  ctx.moveTo(-54, -134);
  ctx.lineTo(54, -134);
  ctx.quadraticCurveTo(68, -134, 66, -118);
  ctx.lineTo(62, -86);
  ctx.quadraticCurveTo(60, -76, 48, -76);
  ctx.lineTo(-48, -76);
  ctx.quadraticCurveTo(-60, -76, -62, -86);
  ctx.lineTo(-66, -118);
  ctx.quadraticCurveTo(-68, -134, -54, -134);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -134, -76, [
    [0, '#FFFFFF'],
    [0.7, '#F7FBFF'],
    [1, C.navieFaceShade],
  ]);
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = rgba(o, 0.55);
  ctx.stroke();

  drawCheeks(ctx, NAVIE_FACE, expr);
  drawEyes(ctx, NAVIE_FACE, expr, anim);

  // Bonnet "N".
  ctx.font = `900 16px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(12,40,100,0.25)';
  ctx.fillText('N', 0.8, -64.2);
  ctx.fillStyle = '#F2F6FB';
  ctx.fillText('N', 0, -65);

  headlight(ctx, -54, -48, 15);
  headlight(ctx, 54, -48, 15);
  drawMouth(ctx, NAVIE_FACE, expr, anim);

  // The cap sits a little higher than first drawn, so the brows show under the brim as in the render.
  ctx.save();
  ctx.translate(0, -10);
  drawNavieCap(ctx, o);
  ctx.restore();
  drawExtras(ctx, expr, -198, 90, anim);
}

function drawNavieCap(ctx: Ctx, o: string): void {
  // Dome.
  ctx.beginPath();
  ctx.moveTo(-70, -124);
  ctx.bezierCurveTo(-72, -164, -40, -186, 0, -186);
  ctx.bezierCurveTo(40, -186, 72, -164, 70, -124);
  ctx.closePath();
  paint(ctx, C.navieCap, -186, -124, o, 3);
  // White front panel.
  ctx.beginPath();
  ctx.moveTo(-40, -128);
  ctx.bezierCurveTo(-44, -158, -28, -178, 0, -180);
  ctx.bezierCurveTo(28, -178, 44, -158, 40, -128);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -180, -128, [
    [0, '#FFFFFF'],
    [1, '#E4ECF6'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(20,62,142,0.35)';
  ctx.stroke();
  // Panel seams.
  ctx.strokeStyle = 'rgba(20,62,142,0.25)';
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 56, -128);
    ctx.quadraticCurveTo(side * 52, -168, side * 14, -184);
    ctx.stroke();
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-70, -124);
  ctx.bezierCurveTo(-72, -164, -40, -186, 0, -186);
  ctx.bezierCurveTo(40, -186, 72, -164, 70, -124);
  ctx.closePath();
  sheen(ctx, -30, -173, 30, 11, 0.35);
  ctx.restore();
  // Badge: blue ring, white inside, blue "N".
  ellipsePath(ctx, 0, -152, 16, 16);
  ctx.fillStyle = C.nlexBlue;
  ctx.fill();
  ellipsePath(ctx, 0, -152, 11.5, 11.5);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.font = `900 16px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.nlexBlue;
  ctx.fillText('N', 0, -151);
  // Top button.
  ellipsePath(ctx, 0, -185, 6, 4);
  ctx.fillStyle = shade(C.navieCap, -0.1);
  ctx.fill();
  // Brim.
  ctx.beginPath();
  ctx.moveTo(-78, -122);
  ctx.bezierCurveTo(-50, -132, 50, -132, 78, -122);
  ctx.bezierCurveTo(66, -110, -66, -110, -78, -122);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -132, -110, [
    [0, shade(C.navieCap, 0.15)],
    [1, shade(C.navieCap, -0.3)],
  ]);
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = o;
  ctx.stroke();
  // Brim shadow on the face.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-64, -115);
  ctx.bezierCurveTo(-30, -109, 30, -109, 64, -115);
  ctx.lineTo(62, -106);
  ctx.bezierCurveTo(30, -101, -30, -101, -62, -106);
  ctx.closePath();
  ctx.fillStyle = 'rgba(20,62,142,0.12)';
  ctx.fill();
  ctx.restore();
}

// -- Kuya Jepoy (jeepney) -------------------------------------------------------

export const JEPOY_FACE: FaceStyle = {
  eyeGap: 31,
  eyeY: -121,
  eyeRx: 15,
  eyeRy: 17,
  iris: '#6B4A2B',
  irisDark: '#2E1B0E',
  lashes: false,
  browColor: '#2A1A12',
  browWidth: 6,
  browRise: 5,
  browLength: 22,
  skin: '#FFF6E6',
  cheekX: 52,
  cheekY: -102,
  cheekR: 8,
  mouthX: 0,
  mouthY: -44,
  mouthW: 30,
  outline: C.jepoyOutline,
};

export function drawJepoyFront(ctx: Ctx, pose: Pose): void {
  const { expr, anim } = pose;
  const o = C.jepoyOutline;
  if (pose.shadow !== false) {
    groundShadow(ctx, 0, -2, 104, 11);
  }
  tyres(ctx, 62, 96, -36, 0);

  // Long chrome mirror stalks.
  for (const side of [-1, 1]) {
    ctx.strokeStyle = C.chromeDark;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(side * 78, -112);
    ctx.lineTo(side * 106, -128);
    ctx.stroke();
    ellipsePath(ctx, side * 108, -132, 9, 11);
    ctx.fillStyle = hgrad(ctx, side * 99, side * 117, [
      [0, '#F2F6FA'],
      [1, C.chromeDark],
    ]);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#5B6573';
    ctx.stroke();
  }

  // Body: tall box, red with stripes.
  roundRect(ctx, -86, -150, 172, 132, [10, 10, 14, 14]);
  paint(ctx, C.jepoyBody, -150, -18, o, 3);
  // Stripes across the lower body (yellow + blue), the jeepney's livery.
  ctx.save();
  roundRect(ctx, -86, -150, 172, 132, [10, 10, 14, 14]);
  ctx.clip();
  ctx.fillStyle = C.jepoyStripe;
  ctx.fillRect(-86, -82, 172, 8);
  ctx.fillStyle = C.jepoyStripe2;
  ctx.fillRect(-86, -74, 172, 5);
  ctx.fillStyle = C.jepoyStripe;
  ctx.fillRect(-86, -38, 172, 4);
  sheen(ctx, -40, -140, 50, 16, 0.25);
  ctx.restore();

  // Roof canopy and signboard.
  roundRect(ctx, -98, -166, 196, 18, 8);
  paint(ctx, '#2D3445', -166, -148, '#11151F', 2.5);
  roundRect(ctx, -60, -196, 120, 30, 8);
  ctx.fillStyle = vgrad(ctx, -196, -166, [
    [0, '#FFFFFF'],
    [1, '#EAF0F7'],
  ]);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.jepoyBody;
  ctx.stroke();
  ctx.font = `900 19px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.jepoyBody;
  ctx.fillText('ARENA', 0, -180);
  // Little flags on the roof corners.
  for (const side of [-1, 1]) {
    ctx.strokeStyle = C.chromeDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(side * 90, -166);
    ctx.lineTo(side * 90, -196);
    ctx.stroke();
    ctx.fillStyle = side < 0 ? C.jepoyStripe : C.jepoyStripe2;
    ctx.beginPath();
    ctx.moveTo(side * 90, -196);
    ctx.lineTo(side * 90 + side * 14, -191);
    ctx.lineTo(side * 90, -186);
    ctx.closePath();
    ctx.fill();
  }

  // Two-pane windscreen: one eye in each pane, split by the centre pillar.
  for (const side of [-1, 1]) {
    roundRect(ctx, side < 0 ? -76 : 6, -144, 70, 50, 10);
    ctx.fillStyle = vgrad(ctx, -144, -94, [
      [0, '#FFFFFF'],
      [1, '#F3E6CF'],
    ]);
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = rgba(o, 0.6);
    ctx.stroke();
  }
  drawCheeks(ctx, JEPOY_FACE, expr);
  drawEyes(ctx, JEPOY_FACE, expr, anim);

  // Bonnet with the chrome star ornament.
  roundRect(ctx, -66, -92, 132, 22, 8);
  paint(ctx, C.jepoyBody, -92, -70, o, 2.4);
  starPath(ctx, 0, -100, 9, 5, 0.45);
  ctx.fillStyle = hgrad(ctx, -9, 9, [
    [0, '#FFFFFF'],
    [1, C.chromeDark],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#5B6573';
  ctx.stroke();

  // Chrome moustache grille - Kuya's moustache.
  ctx.beginPath();
  ctx.moveTo(0, -66);
  ctx.bezierCurveTo(-14, -74, -34, -72, -46, -60);
  ctx.bezierCurveTo(-38, -62, -30, -58, -26, -56);
  ctx.bezierCurveTo(-18, -60, -8, -60, 0, -56);
  ctx.bezierCurveTo(8, -60, 18, -60, 26, -56);
  ctx.bezierCurveTo(30, -58, 38, -62, 46, -60);
  ctx.bezierCurveTo(34, -72, 14, -74, 0, -66);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -74, -56, [
    [0, '#FFFFFF'],
    [0.5, C.chrome],
    [1, C.chromeDark],
  ]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#5B6573';
  ctx.stroke();

  // Double headlights each side.
  for (const side of [-1, 1]) {
    headlight(ctx, side * 70, -62, 9);
    headlight(ctx, side * 70, -40, 9);
  }
  drawMouth(ctx, JEPOY_FACE, expr, anim);

  // Chrome bumper.
  roundRect(ctx, -92, -26, 184, 12, 6);
  ctx.fillStyle = vgrad(ctx, -26, -14, [
    [0, '#FFFFFF'],
    [0.5, C.chrome],
    [1, C.chromeDark],
  ]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#5B6573';
  ctx.stroke();

  drawExtras(ctx, expr, -205, 100, anim);
}

// -- Kiko (multicab) ---------------------------------------------------------------

export const KIKO_FACE: FaceStyle = {
  eyeGap: 21,
  eyeY: -104,
  eyeRx: 14,
  eyeRy: 16,
  iris: '#22A699',
  irisDark: '#0F5C55',
  lashes: false,
  browColor: '#1D5E66',
  browWidth: 3,
  browRise: 4,
  browLength: 15,
  skin: '#F7FFFD',
  cheekX: 40,
  cheekY: -86,
  cheekR: 7,
  mouthX: 0,
  mouthY: -42,
  mouthW: 18,
  outline: C.kikoOutline,
};

function parol(ctx: Ctx, x: number, y: number, r: number, color: string, t: number): void {
  // Capiz star lantern with a tail.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 1.5 + x) * 0.06);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-3, r * 0.6);
  ctx.quadraticCurveTo(-6, r * 1.4, -2, r * 2);
  ctx.moveTo(3, r * 0.6);
  ctx.quadraticCurveTo(6, r * 1.4, 2, r * 2);
  ctx.stroke();
  starPath(ctx, 0, 0, r, 5, 0.5);
  ctx.fillStyle = rgrad(ctx, 0, 0, 0, r, [
    [0, '#FFFFFF'],
    [0.4, shade(color, 0.3)],
    [1, color],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = shade(color, -0.4);
  ctx.stroke();
  ctx.restore();
}

export function drawKikoFront(ctx: Ctx, pose: Pose): void {
  const { expr, anim } = pose;
  const o = C.kikoOutline;
  if (pose.shadow !== false) {
    groundShadow(ctx, 0, -2, 80, 9);
  }
  // Lanterns peeking over the cab from the truck bed behind.
  parol(ctx, -36, -160, 13, '#E2453C', anim.t);
  parol(ctx, 4, -168, 15, C.yellow, anim.t + 1);
  parol(ctx, 40, -158, 12, '#2BB3A3', anim.t + 2);

  tyres(ctx, 44, 70, -30, 0);
  for (const side of [-1, 1]) {
    ctx.strokeStyle = '#2A3140';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(side * 60, -104);
    ctx.lineTo(side * 78, -112);
    ctx.stroke();
    ellipsePath(ctx, side * 80, -114, 7, 9);
    ctx.fillStyle = '#2A3140';
    ctx.fill();
    ellipsePath(ctx, side * 80, -114, 4.5, 6);
    ctx.fillStyle = '#9FB3C8';
    ctx.fill();
  }

  // Boxy cab.
  roundRect(ctx, -64, -142, 128, 120, [16, 16, 12, 12]);
  paint(ctx, C.kikoBody, -142, -22, o, 3);
  ctx.save();
  roundRect(ctx, -64, -142, 128, 120, [16, 16, 12, 12]);
  ctx.clip();
  ctx.fillStyle = vgrad(ctx, -64, -22, [
    [0, shade(C.kikoTeal, 0.15)],
    [1, shade(C.kikoTeal, -0.2)],
  ]);
  ctx.fillRect(-64, -64, 128, 42);
  ctx.fillStyle = C.yellow;
  ctx.fillRect(-64, -68, 128, 4);
  sheen(ctx, -30, -130, 40, 14, 0.3);
  ctx.restore();

  // Student-driver sign on the roof.
  roundRect(ctx, -34, -156, 68, 16, 5);
  ctx.fillStyle = C.yellow;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#B07B00';
  ctx.stroke();
  ctx.font = `900 9px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#4A3300';
  ctx.fillText('STUDENT', 0, -147.5);

  // Windscreen face.
  roundRect(ctx, -54, -132, 108, 50, 12);
  ctx.fillStyle = vgrad(ctx, -132, -82, [
    [0, '#FFFFFF'],
    [1, '#DDF4F0'],
  ]);
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = rgba(o, 0.55);
  ctx.stroke();
  drawCheeks(ctx, KIKO_FACE, expr);
  drawEyes(ctx, KIKO_FACE, expr, anim);

  // Grille slots and small headlights.
  for (let i = -2; i <= 2; i += 1) {
    roundRect(ctx, i * 9 - 3, -60, 6, 10, 2);
    ctx.fillStyle = 'rgba(15,40,50,0.45)';
    ctx.fill();
  }
  headlight(ctx, -44, -50, 9);
  headlight(ctx, 44, -50, 9);
  drawMouth(ctx, KIKO_FACE, expr, anim);
  roundRect(ctx, -60, -28, 120, 9, 4);
  ctx.fillStyle = vgrad(ctx, -28, -19, [
    [0, '#5E6B7C'],
    [1, '#2E3644'],
  ]);
  ctx.fill();

  drawExtras(ctx, expr, -190, 78, anim);
}

// -- one entry point -------------------------------------------------------------------

/** Draws a character's front view with its bottom centre at (x, y), `size` px tall-ish. */
export function drawCharacter(ctx: Ctx, id: CharacterId, x: number, y: number, size: number, pose: Pose): void {
  if (id === 'radio') {
    drawRadioIcon(ctx, x, y - size / 2, size * 0.42, pose.anim.t);
    return;
  }
  const scale = size / 200;
  ctx.save();
  ctx.translate(x, y - (pose.hop ?? 0) * scale);
  ctx.rotate(pose.tilt ?? 0);
  ctx.scale(scale, scale);
  if (id === 'navie') {
    drawNavieFront(ctx, pose);
  } else if (id === 'jepoy') {
    drawJepoyFront(ctx, pose);
  } else if (id === 'kiko') {
    drawKikoFront(ctx, pose);
  } else {
    drawBarrikada(ctx, pose.expr, pose.anim.t, { skin: id as MachineId, shadow: pose.shadow !== false, gears: null });
  }
  ctx.restore();
}

/** The radio: a little speaker grille with sound waves. */
export function drawRadioIcon(ctx: Ctx, cx: number, cy: number, r: number, t: number): void {
  ctx.save();
  roundRect(ctx, cx - r, cy - r * 0.75, r * 2, r * 1.5, r * 0.3);
  ctx.fillStyle = vgrad(ctx, cy - r, cy + r, [
    [0, '#3A4A66'],
    [1, '#1A2438'],
  ]);
  ctx.fill();
  ctx.lineWidth = r * 0.08;
  ctx.strokeStyle = '#0A1220';
  ctx.stroke();
  ellipsePath(ctx, cx - r * 0.35, cy, r * 0.45, r * 0.45);
  ctx.fillStyle = '#0F1626';
  ctx.fill();
  ctx.fillStyle = C.yellow;
  roundRect(ctx, cx + r * 0.25, cy - r * 0.45, r * 0.55, r * 0.3, r * 0.08);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = r * 0.1;
  ctx.lineCap = 'round';
  for (let i = 1; i <= 2; i += 1) {
    const a = 0.5 + 0.5 * Math.sin(t * 6 - i);
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy, r * (0.55 + i * 0.25), -0.7, 0.7);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Idle blink: closed briefly every few seconds, offset per character. */
export function blinkAt(t: number, seed = 0): number {
  const period = 3.4 + (seed % 3) * 0.7;
  const phase = (t + seed * 1.37) % period;
  return phase < 0.12 ? Math.sin((phase / 0.12) * Math.PI) : 0;
}
