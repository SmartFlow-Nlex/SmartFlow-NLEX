import { starPath } from '../../../roadTrip/web/art/faces';
import { BRAND_FONT, ellipsePath, groundShadow, hgrad, paint, rgrad, roundRect, shade, sheen, vgrad, type Ctx } from '../../../roadTrip/web/art/kit';
import { UNITS_PER_LANE } from '../../../roadTrip/web/art/vehicles';
import type { Build } from '../../core/race';

/**
 * Grand Prix art, drawn in code with the same kit as Navie's Road Trip (read
 * from there, never changed): rival race cars, the track furniture and the
 * pick-ups. Rivals are plain cars - no faces, no names - told apart by shape,
 * colour and a big racing number. Units: one lane = 312.5, origin bottom centre.
 */

function tyres(ctx: Ctx, half: number, w: number, h: number, phase: number): void {
  for (const side of [-1, 1]) {
    const x = side < 0 ? -half : half - w;
    roundRect(ctx, x, -h, w, h, 8);
    ctx.fillStyle = vgrad(ctx, -h, 0, [
      [0, '#3A4252'],
      [1, '#10141B'],
    ]);
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, -h, w, h, 8);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 3;
    const off = (phase * 27) % 9;
    for (let y = -h - 9 + off; y < 0; y += 9) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + 3);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function tail(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = vgrad(ctx, y - h / 2, y + h / 2, [
    [0, '#FF9A8A'],
    [0.5, '#E2453C'],
    [1, '#9E1F18'],
  ]);
  ctx.fill();
}

function numberPlate(ctx: Ctx, n: number, y: number, size: number, light: boolean): void {
  ellipsePath(ctx, 0, y, size, size * 0.8);
  ctx.fillStyle = light ? '#10284C' : '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = light ? '#FFFFFF' : '#10284C';
  ctx.stroke();
  ctx.font = `900 ${size * 1.05}px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = light ? '#FFFFFF' : '#10284C';
  ctx.fillText(String(n), 0, y + 2);
}

/** A rival's rear view. */
export function drawRaceCar(ctx: Ctx, build: Build, colour: string, n: number, wheel: number): void {
  const half = 0.31 * UNITS_PER_LANE;
  const dark = shade(colour, -0.55);
  const light = colour === '#F1F3F6';
  groundShadow(ctx, 0, -2, half + 14, 13, 0.32);
  if (build === 'coupe') {
    tyres(ctx, half, 36, 34, wheel);
    roundRect(ctx, -half, -86, half * 2, 66, [30, 30, 14, 14]);
    paint(ctx, colour, -86, -20, dark, 3);
    // Low roof and a rear wing.
    roundRect(ctx, -half + 34, -122, half * 2 - 68, 40, [20, 20, 4, 4]);
    paint(ctx, colour, -122, -82, dark, 3);
    roundRect(ctx, -half + 44, -116, half * 2 - 88, 26, 8);
    ctx.fillStyle = vgrad(ctx, -116, -90, [
      [0, '#6E8DB8'],
      [1, '#1F2F4A'],
    ]);
    ctx.fill();
    roundRect(ctx, -half - 6, -100, half * 2 + 12, 10, 4);
    ctx.fillStyle = '#20242C';
    ctx.fill();
    tail(ctx, -half + 30, -58, 34, 12);
    tail(ctx, half - 30, -58, 34, 12);
    numberPlate(ctx, n, -52, 22, light);
  } else if (build === 'hatch') {
    tyres(ctx, half - 4, 32, 34, wheel);
    roundRect(ctx, -half + 6, -132, half * 2 - 12, 112, [36, 36, 14, 14]);
    paint(ctx, colour, -132, -20, dark, 3);
    roundRect(ctx, -half + 34, -124, half * 2 - 68, 40, 12);
    ctx.fillStyle = vgrad(ctx, -124, -84, [
      [0, '#6E8DB8'],
      [1, '#1F2F4A'],
    ]);
    ctx.fill();
    tail(ctx, -half + 32, -64, 26, 18);
    tail(ctx, half - 32, -64, 26, 18);
    numberPlate(ctx, n, -52, 22, light);
  } else if (build === 'pickup') {
    tyres(ctx, half, 38, 38, wheel);
    roundRect(ctx, -half, -150, half * 2, 52, [16, 16, 0, 0]);
    paint(ctx, colour, -150, -98, dark, 3);
    roundRect(ctx, -half + 26, -144, half * 2 - 52, 32, 8);
    ctx.fillStyle = vgrad(ctx, -144, -112, [
      [0, '#6E8DB8'],
      [1, '#1F2F4A'],
    ]);
    ctx.fill();
    roundRect(ctx, -half, -100, half * 2, 80, 10);
    paint(ctx, colour, -100, -20, dark, 3);
    // Roll bar.
    ctx.strokeStyle = '#C9D3DE';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-half + 20, -100);
    ctx.lineTo(-half + 20, -132);
    ctx.lineTo(half - 20, -132);
    ctx.lineTo(half - 20, -100);
    ctx.stroke();
    tail(ctx, -half + 22, -50, 20, 26);
    tail(ctx, half - 22, -50, 20, 26);
    numberPlate(ctx, n, -62, 24, light);
  } else {
    tyres(ctx, half - 2, 32, 34, wheel);
    roundRect(ctx, -half, -176, half * 2, 156, [22, 22, 12, 12]);
    paint(ctx, colour, -176, -20, dark, 3);
    roundRect(ctx, -half + 22, -166, half * 2 - 44, 46, 10);
    ctx.fillStyle = vgrad(ctx, -166, -120, [
      [0, '#6E8DB8'],
      [1, '#1F2F4A'],
    ]);
    ctx.fill();
    ctx.strokeStyle = shade(colour, -0.3);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -116);
    ctx.lineTo(0, -24);
    ctx.stroke();
    tail(ctx, -half + 20, -60, 18, 34);
    tail(ctx, half - 20, -60, 18, 34);
    numberPlate(ctx, n, -78, 26, light);
  }
  // A racing stripe on every rival, in a darker shade of its colour.
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = light ? '#1464E8' : '#FFFFFF';
  ctx.fillRect(-10, build === 'van' ? -176 : build === 'pickup' ? -150 : -132, 20, 18);
  ctx.restore();
  void hgrad;
  void sheen;
}

/** White racing stripes over Navie's rear (the Pit's decoration). Same units as drawNavieRear. */
export function drawNavieStripes(ctx: Ctx): void {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#FFFFFF';
  for (const x of [-14, 6]) {
    ctx.beginPath();
    ctx.rect(x, -186, 8, 30);
    ctx.rect(x, -80, 8, 20);
    ctx.fill();
  }
  ctx.restore();
}

/** Start / finish gantry across the track, screen px. */
export function drawStartGantry(ctx: Ctx, left: number, right: number, roadY: number, lanePx: number): void {
  const h = lanePx * 1.9;
  const top = roadY - h;
  const postW = Math.max(3, lanePx * 0.08);
  ctx.fillStyle = '#E9EEF4';
  ctx.fillRect(left - postW / 2, top, postW, h);
  ctx.fillRect(right - postW / 2, top, postW, h);
  const bannerH = lanePx * 0.42;
  ctx.save();
  roundRect(ctx, left - postW, top - bannerH * 0.5, right - left + postW * 2, bannerH, 4);
  ctx.clip();
  // Checkered banner.
  const cell = bannerH / 2;
  for (let x = left - postW, i = 0; x < right + postW; x += cell, i += 1) {
    for (let r = 0; r < 2; r += 1) {
      ctx.fillStyle = (i + r) % 2 === 0 ? '#10284C' : '#FFFFFF';
      ctx.fillRect(x, top - bannerH * 0.5 + r * cell, cell + 0.5, cell + 0.5);
    }
  }
  ctx.restore();
  if (lanePx > 14) {
    const w = Math.min(right - left, lanePx * 2.6);
    roundRect(ctx, (left + right) / 2 - w / 2, top - bannerH * 0.42, w, bannerH * 0.84, 4);
    ctx.fillStyle = '#1464E8';
    ctx.fill();
    ctx.font = `900 ${lanePx * 0.22}px ${BRAND_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('FIESTA GRAND PRIX', (left + right) / 2, top, w * 0.94);
  }
}

/** A grandstand by the track: 200-unit box, origin bottom centre. */
export function drawGrandstand(ctx: Ctx, variant: number): void {
  roundRect(ctx, -110, -120, 220, 120, 6);
  ctx.fillStyle = '#D9DEE6';
  ctx.fill();
  const colours = ['#E2453C', '#FFC32D', '#1464E8', '#2EAD5B', '#FF8FA3', '#FFFFFF'];
  for (let row = 0; row < 4; row += 1) {
    ctx.fillStyle = '#9AA6B6';
    ctx.fillRect(-104, -112 + row * 26, 208, 4);
    for (let i = 0; i < 12; i += 1) {
      ellipsePath(ctx, -96 + i * 17.5 + (row % 2) * 6, -100 + row * 26, 6, 7);
      ctx.fillStyle = colours[(i * 7 + row * 3 + variant) % colours.length];
      ctx.fill();
    }
  }
  ctx.fillStyle = '#1464E8';
  ctx.fillRect(-114, -132, 228, 14);
}

/** Tyre wall stack: 200-unit box. */
export function drawTyreWall(ctx: Ctx): void {
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 4; i += 1) {
      const x = -60 + i * 40 + (row % 2) * 20;
      const y = -20 - row * 34;
      ellipsePath(ctx, x, y, 22, 18);
      ctx.fillStyle = '#20242C';
      ctx.fill();
      ellipsePath(ctx, x, y, 9, 7);
      ctx.fillStyle = row === 1 ? '#E2453C' : '#F4F7FB';
      ctx.fill();
    }
  }
}

/** Turbo cell: a glowing canister with a lightning bolt, 100-unit box centred. */
export function drawTurboCell(ctx: Ctx, t: number): void {
  const k = 1 + Math.sin(t * 6) * 0.06;
  ctx.save();
  ctx.scale(k, k);
  ellipsePath(ctx, 0, 0, 48, 48);
  ctx.fillStyle = rgrad(ctx, 0, 0, 0, 48, [
    [0, 'rgba(255,240,140,0.85)'],
    [1, 'rgba(255,190,40,0)'],
  ]);
  ctx.fill();
  roundRect(ctx, -22, -32, 44, 64, 12);
  ctx.fillStyle = vgrad(ctx, -32, 32, [
    [0, '#FFE680'],
    [1, '#F5A300'],
  ]);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#7A4A00';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(4, -22);
  ctx.lineTo(-10, 4);
  ctx.lineTo(1, 4);
  ctx.lineTo(-4, 24);
  ctx.lineTo(12, -4);
  ctx.lineTo(1, -4);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();
}

/** Night sky with a moon and stars, down to the horizon. */
export function drawNightSky(ctx: Ctx, w: number, horizon: number): void {
  ctx.fillStyle = vgrad(ctx, 0, horizon, [
    [0, '#0B1233'],
    [1, '#3A2A66'],
  ]);
  ctx.fillRect(-40, 0, w + 80, horizon + 2);
  for (let i = 0; i < 40; i += 1) {
    const x = ((i * 97) % 100) / 100 * w;
    const y = ((i * 53) % 100) / 100 * horizon * 0.8;
    ctx.fillStyle = `rgba(255,255,255,${0.4 + ((i * 31) % 50) / 100})`;
    ctx.fillRect(x, y, 2, 2);
  }
  ellipsePath(ctx, w * 0.8, horizon * 0.25, horizon * 0.07, horizon * 0.07);
  ctx.fillStyle = '#FFF6D8';
  ctx.fill();
  // City glow and distant hills.
  ctx.fillStyle = vgrad(ctx, horizon * 0.7, horizon, [
    [0, 'rgba(255,160,90,0)'],
    [1, 'rgba(255,160,90,0.45)'],
  ]);
  ctx.fillRect(-40, horizon * 0.7, w + 80, horizon * 0.3);
  ctx.beginPath();
  ctx.moveTo(-40, horizon);
  for (let i = 0; i <= 20; i += 1) {
    ctx.lineTo(-40 + ((w + 80) * i) / 20, horizon - horizon * (0.06 + 0.05 * Math.sin(i * 1.3)));
  }
  ctx.lineTo(w + 40, horizon);
  ctx.closePath();
  ctx.fillStyle = '#1E1838';
  ctx.fill();
  void starPath;
}
