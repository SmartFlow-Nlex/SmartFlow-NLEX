import { starPath } from './faces';
import { BRAND_FONT, ellipsePath, groundShadow, hgrad, paint, rgba, rgrad, roundRect, shade, sheen, vgrad, type Ctx } from './kit';
import { C } from './palette';

/**
 * Rear views (what the camera sees while driving) and roadside things.
 *
 * Units: origin at the bottom centre, y up negative, and ONE LANE = 312.5
 * units across, so every sprite's drawn width matches its hitbox width in
 * the simulation (Navie's 0.64 lanes = 200 units). The renderer scales by
 * laneWidthPx / 312.5.
 */

export const UNITS_PER_LANE = 312.5;

function rearTyres(ctx: Ctx, half: number, w: number, h: number, phase: number): void {
  for (const side of [-1, 1]) {
    const x = side < 0 ? -half : half - w;
    roundRect(ctx, x, -h, w, h, 8);
    ctx.fillStyle = vgrad(ctx, -h, 0, [
      [0, '#3A4252'],
      [1, '#10141B'],
    ]);
    ctx.fill();
    // Tread lines rolling by.
    ctx.save();
    roundRect(ctx, x, -h, w, h, 8);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 3;
    const step = 9;
    const off = (phase * step * 3) % step;
    for (let y = -h - step + off; y < 0; y += step) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + 3);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function tailLight(ctx: Ctx, x: number, y: number, w: number, h: number, on: number): void {
  ctx.fillStyle = rgrad(ctx, x, y, 0, w * 1.4, [
    [0, `rgba(255,70,60,${0.25 + 0.35 * on})`],
    [1, 'rgba(255,70,60,0)'],
  ]);
  ellipsePath(ctx, x, y, w * 1.4, h * 1.6);
  ctx.fill();
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = vgrad(ctx, y - h / 2, y + h / 2, [
    [0, '#FF9A8A'],
    [0.5, C.tail],
    [1, '#9E1F18'],
  ]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#5E0F0B';
  ctx.stroke();
}

export interface RearPose {
  /** Wheel animation phase (distance travelled). */
  wheel: number;
  /** Brake / hurt glow 0-1. */
  brake?: number;
}

// -- Navie ---------------------------------------------------------------------

export function drawNavieRear(ctx: Ctx, pose: RearPose): void {
  const o = C.navieOutline;
  groundShadow(ctx, 0, -2, 112, 14, 0.32);
  rearTyres(ctx, 98, 34, 42, pose.wheel);
  for (const side of [-1, 1]) {
    ellipsePath(ctx, side * 96, -102, 13, 11);
    paint(ctx, C.navieBody, -113, -91, o, 2.5);
  }
  // Body.
  ctx.beginPath();
  ctx.moveTo(-90, -24);
  ctx.bezierCurveTo(-100, -40, -98, -86, -84, -106);
  ctx.bezierCurveTo(-74, -118, -60, -122, -48, -122);
  ctx.lineTo(48, -122);
  ctx.bezierCurveTo(60, -122, 74, -118, 84, -106);
  ctx.bezierCurveTo(98, -86, 100, -40, 90, -24);
  ctx.bezierCurveTo(56, -16, -56, -16, -90, -24);
  ctx.closePath();
  paint(ctx, C.navieBody, -122, -16, o, 3.5);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-90, -24);
  ctx.bezierCurveTo(-100, -40, -98, -86, -84, -106);
  ctx.lineTo(84, -106);
  ctx.bezierCurveTo(98, -86, 100, -40, 90, -24);
  ctx.closePath();
  sheen(ctx, -46, -96, 48, 16, 0.3);
  ctx.restore();
  // Rear window.
  ctx.beginPath();
  ctx.moveTo(-50, -116);
  ctx.lineTo(50, -116);
  ctx.quadraticCurveTo(62, -116, 64, -104);
  ctx.lineTo(66, -90);
  ctx.quadraticCurveTo(66, -82, 56, -82);
  ctx.lineTo(-56, -82);
  ctx.quadraticCurveTo(-66, -82, -66, -90);
  ctx.lineTo(-64, -104);
  ctx.quadraticCurveTo(-62, -116, -50, -116);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -116, -82, [
    [0, '#5C86C2'],
    [1, C.glass],
  ]);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = o;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-30, -112);
  ctx.lineTo(-44, -86);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-16, -112);
  ctx.lineTo(-26, -92);
  ctx.stroke();
  // Cap from behind: blue dome, snapback strap and opening.
  ctx.beginPath();
  ctx.moveTo(-66, -120);
  ctx.bezierCurveTo(-68, -166, -38, -186, 0, -186);
  ctx.bezierCurveTo(38, -186, 68, -166, 66, -120);
  ctx.closePath();
  paint(ctx, C.navieCap, -186, -120, o, 3);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-66, -120);
  ctx.bezierCurveTo(-68, -166, -38, -186, 0, -186);
  ctx.bezierCurveTo(38, -186, 68, -166, 66, -120);
  ctx.closePath();
  sheen(ctx, -28, -172, 28, 10, 0.35);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-20, -121);
  ctx.quadraticCurveTo(0, -150, 20, -121);
  ctx.closePath();
  ctx.fillStyle = '#E9EEF5';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(o, 0.6);
  ctx.stroke();
  roundRect(ctx, -24, -128, 48, 7, 3);
  ctx.fillStyle = shade(C.navieCap, -0.25);
  ctx.fill();
  ellipsePath(ctx, 0, -185, 6, 4);
  ctx.fillStyle = shade(C.navieCap, -0.1);
  ctx.fill();
  // Bumper, lights, plate.
  roundRect(ctx, -86, -38, 172, 16, 8);
  ctx.fillStyle = vgrad(ctx, -38, -22, [
    [0, shade(C.navieBody, 0.25)],
    [1, shade(C.navieBody, -0.2)],
  ]);
  ctx.fill();
  tailLight(ctx, -70, -62, 26, 15, pose.brake ?? 0);
  tailLight(ctx, 70, -62, 26, 15, pose.brake ?? 0);
  roundRect(ctx, -30, -58, 60, 19, 5);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(o, 0.6);
  ctx.stroke();
  ctx.font = `900 13px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.nlexBlue;
  ctx.fillText('NAVIE', 0, -48);
  ellipsePath(ctx, -50, -22, 8, 4);
  ctx.fillStyle = '#5C6574';
  ctx.fill();
}

// -- Kiko --------------------------------------------------------------------------

export function drawKikoRear(ctx: Ctx, pose: RearPose & { t: number }): void {
  const o = C.kikoOutline;
  groundShadow(ctx, 0, -2, 104, 12, 0.3);
  rearTyres(ctx, 86, 28, 34, pose.wheel);
  // Cab behind the bed.
  roundRect(ctx, -70, -168, 140, 70, [14, 14, 0, 0]);
  paint(ctx, C.kikoBody, -168, -98, o, 3);
  roundRect(ctx, -46, -158, 92, 28, 6);
  ctx.fillStyle = vgrad(ctx, -158, -130, [
    [0, '#5C86C2'],
    [1, C.glass],
  ]);
  ctx.fill();
  roundRect(ctx, -30, -182, 60, 14, 4);
  ctx.fillStyle = C.yellow;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#B07B00';
  ctx.stroke();
  // Parol lanterns stacked in the bed.
  const lanterns: [number, number, string, number][] = [
    [-50, -112, '#E2453C', 17],
    [-14, -122, C.yellow, 20],
    [26, -110, '#2BB3A3', 17],
    [58, -118, '#FF8FA3', 14],
  ];
  for (const [x, y, color, r] of lanterns) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(pose.t * 2 + x) * 0.08);
    starPath(ctx, 0, 0, r, 5, 0.5);
    ctx.fillStyle = rgrad(ctx, 0, 0, 0, r, [
      [0, '#FFFFFF'],
      [0.45, shade(color, 0.25)],
      [1, color],
    ]);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = shade(color, -0.4);
    ctx.stroke();
    ctx.restore();
  }
  // Tailgate.
  roundRect(ctx, -86, -96, 172, 74, 10);
  paint(ctx, C.kikoTeal, -96, -22, o, 3);
  ctx.save();
  roundRect(ctx, -86, -96, 172, 74, 10);
  ctx.clip();
  sheen(ctx, -40, -88, 46, 12, 0.3);
  ctx.restore();
  ctx.font = `900 15px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('SALAMAT PO!', 0, -66);
  tailLight(ctx, -70, -38, 18, 12, pose.brake ?? 0);
  tailLight(ctx, 70, -38, 18, 12, pose.brake ?? 0);
  roundRect(ctx, -86, -26, 172, 8, 4);
  ctx.fillStyle = '#2E3644';
  ctx.fill();
}

// -- Kuya Jepoy (ability appearance beside Navie) ---------------------------------------

export function drawJepoyRear(ctx: Ctx, pose: RearPose & { t: number }): void {
  const o = C.jepoyOutline;
  groundShadow(ctx, 0, -2, 116, 13, 0.3);
  rearTyres(ctx, 96, 30, 36, pose.wheel);
  roundRect(ctx, -96, -196, 192, 176, [12, 12, 10, 10]);
  paint(ctx, C.jepoyBody, -196, -20, o, 3.5);
  ctx.save();
  roundRect(ctx, -96, -196, 192, 176, [12, 12, 10, 10]);
  ctx.clip();
  ctx.fillStyle = C.jepoyStripe;
  ctx.fillRect(-96, -60, 192, 8);
  ctx.fillStyle = C.jepoyStripe2;
  ctx.fillRect(-96, -52, 192, 5);
  sheen(ctx, -50, -180, 50, 16, 0.25);
  ctx.restore();
  // Open back with the band inside.
  roundRect(ctx, -44, -168, 88, 120, 10);
  ctx.fillStyle = vgrad(ctx, -168, -48, [
    [0, '#2A1C24'],
    [1, '#120B10'],
  ]);
  ctx.fill();
  for (const [x, y, hat] of [[-22, -112, C.yellow], [8, -120, '#FFFFFF'], [26, -104, C.jepoyStripe2]] as [number, number, string][]) {
    ellipsePath(ctx, x, y, 11, 11);
    ctx.fillStyle = '#8D5A3B';
    ctx.fill();
    roundRect(ctx, x - 12, y - 20, 24, 8, 3);
    ctx.fillStyle = hat;
    ctx.fill();
  }
  // A trumpet catching the light.
  ctx.strokeStyle = C.yellow;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-10, -92);
  ctx.lineTo(12, -84);
  ctx.stroke();
  ellipsePath(ctx, 15, -83, 6, 8, 0.4);
  ctx.fillStyle = C.yellow;
  ctx.fill();
  // Chrome rails and step.
  for (const side of [-1, 1]) {
    roundRect(ctx, side * 50 - 3, -170, 6, 124, 3);
    ctx.fillStyle = hgrad(ctx, side * 50 - 3, side * 50 + 3, [
      [0, '#FFFFFF'],
      [1, C.chromeDark],
    ]);
    ctx.fill();
  }
  roundRect(ctx, -50, -46, 100, 12, 4);
  ctx.fillStyle = hgrad(ctx, -50, 50, [
    [0, C.chromeDark],
    [0.5, '#FFFFFF'],
    [1, C.chromeDark],
  ]);
  ctx.fill();
  ctx.font = `900 16px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.yellow;
  ctx.strokeStyle = o;
  ctx.lineWidth = 3;
  ctx.strokeText('INGAT!', 0, -182);
  ctx.fillText('INGAT!', 0, -182);
  tailLight(ctx, -74, -80, 20, 14, pose.brake ?? 0);
  tailLight(ctx, 74, -80, 20, 14, pose.brake ?? 0);
}

// -- traffic -------------------------------------------------------------------------------

export type TrafficKind = 'car' | 'truck' | 'bus';
export const CAR_COLOURS = ['#E2453C', '#F1F3F6', '#9AA6B6', '#2EAD5B', '#FFB020', '#7A5CE0'];

export function drawTrafficRear(ctx: Ctx, kind: TrafficKind, colour: string, pose: RearPose): void {
  if (kind === 'car') {
    const half = 0.31 * UNITS_PER_LANE;
    groundShadow(ctx, 0, -2, half + 12, 12, 0.3);
    rearTyres(ctx, half - 4, 30, 34, pose.wheel);
    roundRect(ctx, -half, -110, half * 2, 90, [26, 26, 14, 14]);
    paint(ctx, colour, -110, -20, shade(colour, -0.55), 3);
    roundRect(ctx, -half + 26, -150, half * 2 - 52, 46, [18, 18, 4, 4]);
    paint(ctx, colour, -150, -104, shade(colour, -0.55), 3);
    roundRect(ctx, -half + 34, -144, half * 2 - 68, 32, [12, 12, 3, 3]);
    ctx.fillStyle = vgrad(ctx, -144, -112, [
      [0, '#6E8DB8'],
      [1, '#1F2F4A'],
    ]);
    ctx.fill();
    tailLight(ctx, -half + 30, -76, 34, 14, pose.brake ?? 0.3);
    tailLight(ctx, half - 30, -76, 34, 14, pose.brake ?? 0.3);
    roundRect(ctx, -32, -60, 64, 18, 4);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.font = `900 11px ${BRAND_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1C2533';
    ctx.fillText('NLX 2026', 0, -51);
    return;
  }
  if (kind === 'truck') {
    const half = 0.38 * UNITS_PER_LANE;
    groundShadow(ctx, 0, -2, half + 14, 14, 0.32);
    rearTyres(ctx, half - 6, 34, 36, pose.wheel);
    roundRect(ctx, -half, -250, half * 2, 216, 8);
    paint(ctx, '#ECEFF3', -250, -34, '#5E6876', 3.5);
    ctx.strokeStyle = 'rgba(80,92,108,0.45)';
    ctx.lineWidth = 2;
    for (let y = -230; y < -40; y += 18) {
      ctx.beginPath();
      ctx.moveTo(-half + 12, y);
      ctx.lineTo(half - 12, y);
      ctx.stroke();
    }
    // Reflective chevrons.
    for (let i = -3; i <= 3; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? '#E2453C' : '#FFFFFF';
      ctx.fillRect(i * 30 - 15, -48, 30, 10);
    }
    tailLight(ctx, -half + 20, -30, 24, 12, pose.brake ?? 0.3);
    tailLight(ctx, half - 20, -30, 24, 12, pose.brake ?? 0.3);
    return;
  }
  const half = 0.4 * UNITS_PER_LANE;
  groundShadow(ctx, 0, -2, half + 14, 14, 0.32);
  rearTyres(ctx, half - 8, 34, 36, pose.wheel);
  roundRect(ctx, -half, -270, half * 2, 240, 18);
  paint(ctx, '#2E6FE0', -270, -30, '#122E66', 3.5);
  roundRect(ctx, -half + 16, -250, half * 2 - 32, 80, 10);
  ctx.fillStyle = vgrad(ctx, -250, -170, [
    [0, '#6E8DB8'],
    [1, '#1F2F4A'],
  ]);
  ctx.fill();
  roundRect(ctx, -half + 30, -262, half * 2 - 60, 18, 4);
  ctx.fillStyle = '#1A1A1A';
  ctx.fill();
  ctx.font = `900 13px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFB020';
  ctx.fillText('PAMPANGA', 0, -253);
  ctx.fillStyle = C.yellow;
  ctx.fillRect(-half, -150, half * 2, 14);
  tailLight(ctx, -half + 24, -66, 22, 30, pose.brake ?? 0.3);
  tailLight(ctx, half - 24, -66, 22, 30, pose.brake ?? 0.3);
}

// -- hazards ---------------------------------------------------------------------------------

export function drawCone(ctx: Ctx, outline: boolean, rolling = 0): void {
  const half = 0.16 * UNITS_PER_LANE;
  ctx.save();
  if (rolling !== 0) {
    // On its side, rolling toward you.
    groundShadow(ctx, 0, -2, half + 6, 8, 0.3);
    ctx.translate(0, -30);
    ctx.scale(1, 0.62);
    ctx.rotate(Math.PI / 2);
    ctx.translate(0, 60);
  } else {
    groundShadow(ctx, 0, -2, half + 6, 8, 0.3);
  }
  ctx.beginPath();
  ctx.moveTo(-half * 0.8, -12);
  ctx.lineTo(-10, -118);
  ctx.quadraticCurveTo(0, -126, 10, -118);
  ctx.lineTo(half * 0.8, -12);
  ctx.closePath();
  ctx.fillStyle = hgrad(ctx, -half, half, [
    [0, '#FFB06A'],
    [0.5, C.cone],
    [1, '#C9530A'],
  ]);
  ctx.fill();
  ctx.lineWidth = outline ? 6 : 3;
  ctx.strokeStyle = outline ? '#000000' : '#8A3A0A';
  ctx.stroke();
  ctx.save();
  ctx.clip();
  const spin = rolling * 40;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-half, -82 + (spin % 8), half * 2, 12);
  ctx.fillRect(-half, -50 + (spin % 8), half * 2, 14);
  ctx.restore();
  roundRect(ctx, -half, -14, half * 2, 14, 4);
  ctx.fillStyle = '#2B2F38';
  ctx.fill();
  if (outline) {
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBarrier(ctx: Ctx, outline: boolean, moving = false): void {
  const half = 0.46 * UNITS_PER_LANE;
  groundShadow(ctx, 0, -2, half + 8, 10, 0.3);
  // Legs.
  ctx.strokeStyle = '#D9DEE6';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * (half - 22), -66);
    ctx.lineTo(side * (half - 6), -4);
    ctx.moveTo(side * (half - 22), -66);
    ctx.lineTo(side * (half - 40), -4);
    ctx.stroke();
  }
  roundRect(ctx, -half, -118, half * 2, 52, 8);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-half, -118, half * 2, 52);
  ctx.fillStyle = C.cone;
  for (let x = -half - 52; x < half + 52; x += 52) {
    ctx.beginPath();
    ctx.moveTo(x, -66);
    ctx.lineTo(x + 26, -66);
    ctx.lineTo(x + 52, -118);
    ctx.lineTo(x + 26, -118);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  roundRect(ctx, -half, -118, half * 2, 52, 8);
  ctx.lineWidth = outline ? 7 : 3.5;
  ctx.strokeStyle = outline ? '#000000' : '#8A3A0A';
  ctx.stroke();
  // Steady amber lamp (it glows; it does not flash).
  ellipsePath(ctx, 0, -130, 12, 12);
  ctx.fillStyle = rgrad(ctx, 0, -130, 0, 12, [
    [0, '#FFF6C9'],
    [1, '#FFB020'],
  ]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8A5A00';
  ctx.stroke();
  if (moving) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-half + 20 + i * 60, -150 - i * 4);
      ctx.lineTo(-half + 50 + i * 60, -150 - i * 4);
      ctx.stroke();
    }
  }
}

export function drawPothole(ctx: Ctx, outline: boolean): void {
  const half = 0.22 * UNITS_PER_LANE;
  ellipsePath(ctx, 0, -14, half, 18);
  ctx.fillStyle = rgrad(ctx, 0, -12, 0, half, [
    [0, '#14161C'],
    [0.7, '#262A33'],
    [1, '#3A3F4B'],
  ]);
  ctx.fill();
  ctx.lineWidth = outline ? 6 : 2.5;
  ctx.strokeStyle = outline ? '#000000' : '#5A616E';
  ctx.stroke();
  ctx.strokeStyle = '#2A2E37';
  ctx.lineWidth = 2;
  for (const [x1, y1, x2, y2] of [[-half, -14, -half - 18, -22], [half, -12, half + 16, -4], [10, -30, 18, -40]]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  // Warning flag stuck beside it, so it reads by shape as well as colour.
  ctx.strokeStyle = '#D9DEE6';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(half - 6, -18);
  ctx.lineTo(half - 6, -84);
  ctx.stroke();
  ctx.fillStyle = C.cone;
  ctx.beginPath();
  ctx.moveTo(half - 6, -84);
  ctx.lineTo(half + 30, -74);
  ctx.lineTo(half - 6, -62);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8A3A0A';
  ctx.stroke();
}

// -- pick-ups -----------------------------------------------------------------------------------

export type PickupLook = 'bolt' | 'wrench' | 'postcard' | 'part' | 'spark';

/** Pick-ups in a 100-unit box centred on (0, 0). */
export function drawPickup(ctx: Ctx, kind: PickupLook, t: number): void {
  ctx.save();
  switch (kind) {
    case 'bolt': {
      const spin = Math.cos(t * 3);
      ctx.scale(0.35 + 0.65 * Math.abs(spin), 1);
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34);
      }
      ctx.closePath();
      ctx.fillStyle = rgrad(ctx, -10, -12, 2, 40, [
        [0, '#FFF2B0'],
        [0.5, C.bolt],
        [1, C.boltDark],
      ]);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#8A5A00';
      ctx.stroke();
      ellipsePath(ctx, 0, 0, 12, 12);
      ctx.fillStyle = '#8A5A00';
      ctx.fill();
      ellipsePath(ctx, 0, 0, 8, 8);
      ctx.fillStyle = '#FFF2B0';
      ctx.fill();
      break;
    }
    case 'wrench': {
      ctx.rotate(-0.6 + Math.sin(t * 2) * 0.1);
      ellipsePath(ctx, 0, 0, 44, 44);
      ctx.fillStyle = 'rgba(46,173,91,0.22)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(46,173,91,0.8)';
      ctx.stroke();
      roundRect(ctx, -8, -30, 16, 56, 7);
      ctx.fillStyle = hgrad(ctx, -8, 8, [
        [0, '#FFFFFF'],
        [1, '#8C9AAB'],
      ]);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#4C5868';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -34, 15, Math.PI * 0.15, Math.PI * 1.85, false);
      ctx.lineTo(0, -34);
      ctx.closePath();
      ctx.fillStyle = '#D5DDE7';
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'postcard': {
      ctx.rotate(Math.sin(t * 2) * 0.12);
      roundRect(ctx, -36, -26, 72, 52, 6);
      ctx.fillStyle = '#FFFDF5';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#8A6A3A';
      ctx.stroke();
      roundRect(ctx, -30, -20, 36, 40, 3);
      ctx.fillStyle = vgrad(ctx, -20, 20, [
        [0, '#7FC4FF'],
        [0.6, '#FFD27A'],
        [1, '#6CC24A'],
      ]);
      ctx.fill();
      roundRect(ctx, 12, -20, 16, 18, 2);
      ctx.fillStyle = C.danger;
      ctx.fill();
      ctx.strokeStyle = '#B9A27A';
      ctx.lineWidth = 2;
      for (const y of [6, 13]) {
        ctx.beginPath();
        ctx.moveTo(10, y);
        ctx.lineTo(30, y);
        ctx.stroke();
      }
      starPath(ctx, 34, -30, 9 + Math.sin(t * 6) * 2, 4, 0.3);
      ctx.fillStyle = C.yellow;
      ctx.fill();
      break;
    }
    case 'part': {
      ctx.rotate(t * 1.5);
      ctx.beginPath();
      for (let i = 0; i < 16; i += 1) {
        const a = (Math.PI * i) / 8;
        const r = i % 2 === 0 ? 34 : 26;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = rgrad(ctx, -8, -8, 2, 36, [
        [0, '#B5F5EC'],
        [0.5, C.part],
        [1, '#0E6B61'],
      ]);
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#0B4A43';
      ctx.stroke();
      ellipsePath(ctx, 0, 0, 10, 10);
      ctx.fillStyle = '#0B4A43';
      ctx.fill();
      break;
    }
    case 'spark': {
      const k = 1 + Math.sin(t * 8) * 0.08;
      ctx.scale(k, k);
      ellipsePath(ctx, 0, 0, 46, 46);
      ctx.fillStyle = rgrad(ctx, 0, 0, 0, 46, [
        [0, 'rgba(255,255,255,0.9)'],
        [0.4, 'rgba(95,211,255,0.6)'],
        [1, 'rgba(95,211,255,0)'],
      ]);
      ctx.fill();
      starPath(ctx, 0, 0, 30, 4, 0.32);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1F8FD6';
      ctx.stroke();
      ctx.rotate(Math.PI / 4);
      starPath(ctx, 0, 0, 18, 4, 0.35);
      ctx.fillStyle = C.yellow;
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// -- signs ----------------------------------------------------------------------------------------

/**
 * A lane-status board: three lane boxes, an X on closed lanes and a down
 * arrow on the open one - read by shape, not only colour. 100 units tall.
 */
export function drawLaneBoard(ctx: Ctx, openLane: number, label: string): void {
  roundRect(ctx, -110, -150, 220, 110, 12);
  ctx.fillStyle = '#1B2230';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.yellow;
  ctx.stroke();
  ctx.font = `900 22px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.yellow;
  ctx.fillText(label, 0, -128);
  for (let i = -1; i <= 1; i += 1) {
    const x = i * 66;
    const open = i === openLane;
    roundRect(ctx, x - 28, -110, 56, 56, 8);
    ctx.fillStyle = open ? '#1E7A3E' : '#7A1E1E';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#FFFFFF';
    ctx.beginPath();
    if (open) {
      ctx.moveTo(x, -102);
      ctx.lineTo(x, -66);
      ctx.moveTo(x - 14, -80);
      ctx.lineTo(x, -64);
      ctx.lineTo(x + 14, -80);
    } else {
      ctx.moveTo(x - 14, -96);
      ctx.lineTo(x + 14, -68);
      ctx.moveTo(x + 14, -96);
      ctx.lineTo(x - 14, -68);
    }
    ctx.stroke();
  }
  // Post.
  ctx.fillStyle = '#5D6878';
  ctx.fillRect(-6, -40, 12, 40);
}
