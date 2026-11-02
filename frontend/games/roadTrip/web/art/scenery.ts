import { starPath } from './faces';
import { BRAND_FONT, ellipsePath, rgba, rgrad, roundRect, shade, vgrad, type Ctx } from './kit';
import { C, TIMES, type TimeOfDay } from './palette';

/**
 * The world around the road: sky and distant layers (drawn once per size
 * into a cached canvas), roadside props (cached sprites), overhead exit
 * gantries and the toll plaza. Real places appear only as names on signs, in
 * their real order; the drawings are generic, not likenesses.
 */

export type Landmark = 'city' | 'arena' | 'plaza' | 'none' | 'arayat' | 'pinatubo' | 'lanterns';

function cloud(ctx: Ctx, x: number, y: number, s: number, alpha: number): void {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  for (const [dx, dy, r] of [[0, 0, 18], [16, -8, 22], [36, -2, 17], [24, 6, 16], [8, 8, 14]] as [number, number, number][]) {
    ellipsePath(ctx, x + dx * s, y + dy * s, r * s, r * s * 0.85);
    ctx.fill();
  }
}

/**
 * A soft mountain ridge. `east` > 0 makes it rise toward the right - the
 * Sierra Madre sits east of NLEX, on the right when driving north.
 */
function ridge(ctx: Ctx, w: number, base: number, peak: number, seed: number, colour: string, east = 0): void {
  ctx.beginPath();
  ctx.moveTo(-40, base);
  const steps = 48;
  let prevX = -40;
  let prevY = base;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const x = -40 + (w + 80) * u;
    const n =
      Math.sin(u * 9.1 + seed) * 0.45 +
      Math.sin(u * 23.7 + seed * 1.9) * 0.18 +
      Math.sin(u * 4.3 + seed * 0.7) * 0.37;
    const envelope = east > 0 ? 0.25 + 0.75 * Math.min(1, Math.max(0, (u - 0.2) / 0.6)) ** 1.4 * east + (1 - east) * 0.75 : 1;
    const y = base - peak * envelope * (0.55 + 0.45 * n);
    // Smooth through midpoints.
    ctx.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2);
    prevX = x;
    prevY = y;
  }
  ctx.lineTo(w + 40, base);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
}

/** Sky, sun, clouds, mountains and the distant landmark, down to the horizon. */
export function drawSkyLayer(ctx: Ctx, w: number, horizon: number, time: TimeOfDay, landmark: Landmark): void {
  const look = TIMES[time];
  ctx.fillStyle = vgrad(ctx, 0, horizon, [
    [0, look.skyTop],
    [1, look.skyBottom],
  ]);
  ctx.fillRect(-40, 0, w + 80, horizon + 2);
  // Sun.
  const sunX = time === 'sunset' ? w * 0.28 : w * 0.78;
  const sunY = time === 'sunset' ? horizon * 0.78 : horizon * 0.22;
  ctx.fillStyle = rgrad(ctx, sunX, sunY, 0, horizon * 0.5, [
    [0, rgba(look.sun, 0.95)],
    [0.18, rgba(look.sun, 0.7)],
    [1, rgba(look.sun, 0)],
  ]);
  ctx.fillRect(-40, 0, w + 80, horizon);
  ellipsePath(ctx, sunX, sunY, horizon * 0.07, horizon * 0.07);
  ctx.fillStyle = look.sun;
  ctx.fill();
  // Clouds.
  const s = Math.max(0.6, horizon / 240);
  cloud(ctx, w * 0.08, horizon * 0.25, s, 0.85);
  cloud(ctx, w * 0.55, horizon * 0.14, s * 0.8, 0.75);
  cloud(ctx, w * 0.82, horizon * 0.42, s * 0.7, 0.7);
  // Mountains: the Sierra Madre on the east (right, heading north).
  ridge(ctx, w, horizon, horizon * 0.2, 1.3, look.mountainFar);
  ridge(ctx, w, horizon, horizon * 0.36, 4.1, look.mountain, 1);
  // Mist between the ranges.
  ctx.fillStyle = vgrad(ctx, horizon * 0.7, horizon, [
    [0, 'rgba(255,255,255,0)'],
    [1, look.haze],
  ]);
  ctx.fillRect(-40, horizon * 0.7, w + 80, horizon * 0.3);
  ridge(ctx, w, horizon, horizon * 0.1, 7.7, shade(look.mountain, 0.18));

  if (landmark === 'city') {
    // A faint skyline behind, where the trip starts.
    ctx.fillStyle = rgba(look.mountain, 0.75);
    let x = w * 0.02;
    let i = 0;
    while (x < w * 0.38) {
      const bw = 10 + ((i * 37) % 14);
      const bh = horizon * (0.08 + ((i * 53) % 10) / 70);
      ctx.fillRect(x, horizon - bh, bw, bh);
      x += bw + 3;
      i += 1;
    }
  } else if (landmark === 'arena') {
    // A big dome on the right - "the Arena" in the story, drawn generically.
    const cx = w * 0.72;
    const r = horizon * 0.2;
    ctx.beginPath();
    ctx.ellipse(cx, horizon, r * 1.6, r, 0, Math.PI, 0);
    ctx.fillStyle = vgrad(ctx, horizon - r, horizon, [
      [0, '#F4F7FB'],
      [1, '#B9C6D6'],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,100,130,0.5)';
    ctx.lineWidth = 1.2;
    for (let k = 1; k < 5; k += 1) {
      ctx.beginPath();
      ctx.ellipse(cx, horizon, r * 1.6 * (k / 5), r, 0, Math.PI, 0);
      ctx.stroke();
    }
  } else if (landmark === 'arayat') {
    // A lone mountain rising straight out of the plain: Mount Arayat, in Pampanga.
    const cx = w * 0.68;
    const peak = horizon * 0.58;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.3, horizon);
    ctx.bezierCurveTo(cx - w * 0.14, horizon * 0.86, cx - w * 0.07, peak, cx, peak);
    ctx.bezierCurveTo(cx + w * 0.07, peak, cx + w * 0.14, horizon * 0.86, cx + w * 0.3, horizon);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, peak, horizon, [
      [0, look.mountain],
      [1, look.mountainFar],
    ]);
    ctx.fill();
  } else if (landmark === 'pinatubo') {
    // A wide volcano off to the west, its top blown off: Mount Pinatubo, past the last exit.
    const cx = w * 0.26;
    const top = horizon * 0.66;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.36, horizon);
    ctx.lineTo(cx - w * 0.09, top);
    ctx.lineTo(cx - w * 0.03, top + horizon * 0.035);
    ctx.lineTo(cx + w * 0.03, top + horizon * 0.02);
    ctx.lineTo(cx + w * 0.09, top);
    ctx.lineTo(cx + w * 0.36, horizon);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, top, horizon, [
      [0, look.mountain],
      [1, look.mountainFar],
    ]);
    ctx.fill();
  } else if (landmark === 'lanterns') {
    // San Fernando's giant lanterns, standing along the skyline.
    for (let i = 0; i < 6; i += 1) {
      const x = w * (0.08 + i * 0.17);
      const y = horizon * (0.74 + ((i * 37) % 10) / 90);
      const r = horizon * (0.06 + ((i * 53) % 6) / 200);
      ctx.fillStyle = rgba('#FFD27A', 0.28);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      for (let k = 0; k < 10; k += 1) {
        const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
        const rr = k % 2 === 0 ? r : r * 0.46;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = ['#FFD24A', '#FF7A9A', '#7FD3FF'][i % 3];
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(90,40,60,0.6)';
      ctx.stroke();
      ctx.fillStyle = rgba('#5A3A4A', 0.55);
      ctx.fillRect(x - 1, y + r * 0.7, 2, horizon - y - r * 0.7);
    }
  }
  // Haze at the horizon.
  ctx.fillStyle = vgrad(ctx, horizon - horizon * 0.18, horizon + 2, [
    [0, 'rgba(255,255,255,0)'],
    [1, look.haze],
  ]);
  ctx.fillRect(-40, horizon - horizon * 0.18, w + 80, horizon * 0.18 + 2);
}

/** Fields between the horizon and the road. */
export function drawGround(ctx: Ctx, w: number, h: number, horizon: number, time: TimeOfDay): void {
  const look = TIMES[time];
  ctx.fillStyle = vgrad(ctx, horizon, h, [
    [0, shade(look.field, 0.25)],
    [0.35, look.field],
    [1, shade(look.field, -0.18)],
  ]);
  ctx.fillRect(0, horizon, w, h - horizon);
  // Rice-paddy bands toward the horizon.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 9; i += 1) {
    const y = horizon + (h - horizon) * (i * i) / 81;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

// -- roadside props: drawn in a 200-unit box, origin at the bottom centre --------------

export type PropKind = 'palm' | 'acacia' | 'lamp' | 'billboard' | 'house' | 'banderitas' | 'bush';

export function drawProp(ctx: Ctx, kind: PropKind, variant: number): void {
  switch (kind) {
    case 'palm': {
      ctx.strokeStyle = '#8A6A44';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(14, -90, 4, -180);
      ctx.stroke();
      for (let i = 0; i < 7; i += 1) {
        const a = -Math.PI / 2 + (i - 3) * 0.45;
        ctx.save();
        ctx.translate(4, -180);
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(40, -18, 78, 10);
        ctx.quadraticCurveTo(40, -2, 0, 6);
        ctx.closePath();
        ctx.fillStyle = i % 2 === 0 ? '#3F9B3A' : '#58B544';
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'acacia': {
      ctx.fillStyle = '#7A5A38';
      ctx.fillRect(-7, -80, 14, 80);
      for (const [x, y, r] of [[-40, -110, 46], [30, -116, 50], [0, -140, 52], [-10, -100, 40]] as [number, number, number][]) {
        ellipsePath(ctx, x, y, r, r * 0.7);
        ctx.fillStyle = variant % 2 === 0 ? '#3E8E3A' : '#4C9C3E';
        ctx.fill();
      }
      ellipsePath(ctx, -14, -150, 30, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fill();
      break;
    }
    case 'bush': {
      for (const [x, y, r] of [[-30, -24, 30], [10, -30, 34], [40, -20, 24]] as [number, number, number][]) {
        ellipsePath(ctx, x, y, r, r * 0.75);
        ctx.fillStyle = '#4FA638';
        ctx.fill();
      }
      break;
    }
    case 'lamp': {
      ctx.fillStyle = '#9AA6B6';
      ctx.fillRect(-4, -200, 8, 200);
      ctx.strokeStyle = '#9AA6B6';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, -196);
      ctx.quadraticCurveTo(10, -214, variant % 2 === 0 ? 50 : -50, -210);
      ctx.stroke();
      roundRect(ctx, (variant % 2 === 0 ? 50 : -50) - 16, -214, 32, 9, 4);
      ctx.fillStyle = '#E9EEF4';
      ctx.fill();
      break;
    }
    case 'billboard': {
      ctx.fillStyle = '#6B7686';
      ctx.fillRect(-60, -120, 8, 120);
      ctx.fillRect(52, -120, 8, 120);
      roundRect(ctx, -100, -210, 200, 96, 8);
      const messages = ['DRIVE SAFE', 'SMARTFLOW NLEX', 'ARENA FIESTA', 'INGAT PO!'];
      const colours = [C.nlexBlue, C.navy, '#E2453C', C.kikoTeal];
      ctx.fillStyle = colours[variant % colours.length];
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.font = `900 28px ${BRAND_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(messages[variant % messages.length], 0, -162);
      break;
    }
    case 'house': {
      const walls = ['#F4E3C3', '#DDEBF7', '#F7D7D2', '#E3F2DA'];
      roundRect(ctx, -70, -100, 140, 100, 6);
      ctx.fillStyle = walls[variant % walls.length];
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-82, -96);
      ctx.lineTo(0, -150);
      ctx.lineTo(82, -96);
      ctx.closePath();
      ctx.fillStyle = variant % 2 === 0 ? '#C0533F' : '#4F6F9A';
      ctx.fill();
      ctx.fillStyle = '#5C86C2';
      ctx.fillRect(-46, -70, 30, 26);
      ctx.fillRect(16, -70, 30, 26);
      ctx.fillStyle = '#7A5A38';
      ctx.fillRect(-12, -46, 24, 46);
      break;
    }
    case 'banderitas': {
      // Fiesta flags on a pole (sunset / fiesta stretch).
      ctx.fillStyle = '#9AA6B6';
      ctx.fillRect(-4, -190, 8, 190);
      const colours = [C.yellow, '#E2453C', C.nlexBlue, '#2EAD5B', '#FF8FA3'];
      for (let i = 0; i < 6; i += 1) {
        const x = 4 + i * 22;
        const y = -186 + i * 6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 18, y + 2);
        ctx.lineTo(x + 9, y + 22);
        ctx.closePath();
        ctx.fillStyle = colours[(i + variant) % colours.length];
        ctx.fill();
      }
      break;
    }
  }
}

/** The green overhead exit sign, spanning the road. Coordinates in screen px. */
export function drawGantry(ctx: Ctx, left: number, right: number, roadY: number, lanePx: number, title: string, sub: string): void {
  const postH = lanePx * 2.1;
  const top = roadY - postH;
  ctx.fillStyle = '#7F8C9B';
  const postW = Math.max(2, lanePx * 0.06);
  ctx.fillRect(left - postW / 2, top, postW, postH);
  ctx.fillRect(right - postW / 2, top, postW, postH);
  ctx.fillRect(left, top + lanePx * 0.05, right - left, Math.max(1.5, lanePx * 0.04));
  const signW = Math.min(right - left, lanePx * 2.4);
  const signH = lanePx * 0.62;
  const x = (left + right) / 2 - signW / 2;
  const y = top - signH * 0.55;
  roundRect(ctx, x, y, signW, signH, Math.max(2, lanePx * 0.06));
  ctx.fillStyle = '#1E7A3E';
  ctx.fill();
  ctx.lineWidth = Math.max(1, lanePx * 0.025);
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  if (lanePx > 14) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 ${Math.max(6, lanePx * 0.2)}px ${BRAND_FONT}`;
    ctx.fillText(title, x + signW / 2, y + signH * 0.38, signW * 0.92);
    ctx.font = `700 ${Math.max(5, lanePx * 0.13)}px system-ui, sans-serif`;
    ctx.fillText(sub, x + signW / 2, y + signH * 0.74, signW * 0.92);
  }
}

/** The toll plaza canopy across the road at the finale (screen px). */
export function drawTollPlaza(ctx: Ctx, left: number, right: number, roadY: number, lanePx: number, open: boolean, sign = 'BOCAUE BARRIER'): void {
  const h = lanePx * 1.7;
  const top = roadY - h;
  const extra = lanePx * 0.8;
  // Booths.
  const booths = 5;
  for (let i = 0; i < booths; i += 1) {
    const bx = left - extra + ((right - left + extra * 2) * (i + 0.5)) / booths;
    roundRect(ctx, bx - lanePx * 0.18, roadY - lanePx * 0.6, lanePx * 0.36, lanePx * 0.6, 3);
    ctx.fillStyle = '#E9EEF4';
    ctx.fill();
    ctx.fillStyle = open ? '#2EAD5B' : '#E2453C';
    ctx.fillRect(bx - lanePx * 0.08, roadY - lanePx * 0.5, lanePx * 0.16, lanePx * 0.12);
  }
  // Canopy.
  roundRect(ctx, left - extra, top - lanePx * 0.3, right - left + extra * 2, lanePx * 0.34, 4);
  ctx.fillStyle = vgrad(ctx, top - lanePx * 0.3, top + lanePx * 0.04, [
    [0, '#2F78EA'],
    [1, '#174A9C'],
  ]);
  ctx.fill();
  if (lanePx > 12) {
    ctx.font = `900 ${lanePx * 0.18}px ${BRAND_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(sign, (left + right) / 2, top - lanePx * 0.13);
  }
  ctx.fillStyle = '#B9C6D6';
  for (let i = 0; i <= booths; i += 1) {
    const px = left - extra + ((right - left + extra * 2) * i) / booths;
    ctx.fillRect(px - 2, top, 4, h);
  }
}

/** Parol star for decorations. */
export function drawParolStar(ctx: Ctx, x: number, y: number, r: number, colour: string, glow = 0.5): void {
  ctx.fillStyle = rgrad(ctx, x, y, 0, r * 2, [
    [0, rgba(colour, glow)],
    [1, rgba(colour, 0)],
  ]);
  ellipsePath(ctx, x, y, r * 2, r * 2);
  ctx.fill();
  starPath(ctx, x, y, r, 5, 0.5);
  ctx.fillStyle = rgrad(ctx, x, y, 0, r, [
    [0, '#FFFFFF'],
    [0.5, shade(colour, 0.25)],
    [1, colour],
  ]);
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.strokeStyle = shade(colour, -0.4);
  ctx.stroke();
}
