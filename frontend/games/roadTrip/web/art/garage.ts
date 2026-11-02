import { starPath } from './faces';
import { BRAND_FONT, ellipsePath, rgrad, roundRect, shade, vgrad, type Ctx } from './kit';
import { C } from './palette';
import { drawParolStar } from './scenery';

/**
 * Navie's garage in Balintawak - the hub. A modest room that fills up as the
 * road goes on: the Team board when Jepoy joins, the workshop corner when
 * Kiko brings Lola's toolbox, the found postcards pinned to the wall, and
 * fiesta decorations at the end. Drawn in screen px for the given size.
 */

export interface GarageLook {
  teamBoard: boolean;
  workshop: boolean;
  banderitas: boolean;
  fiesta: boolean;
  /** Lola's parol, Kiko's thank-you after the convoy, hanging over Navie's bay. */
  kikoParol: boolean;
  postcards: string[];
  /** 0 day .. 1 evening (after the finale). */
  evening: number;
}

export interface GarageLayout {
  width: number;
  height: number;
  floorY: number;
  /** Where each bay's car stands (bottom centre) and its size. */
  bays: { navie: [number, number]; jepoy: [number, number]; kiko: [number, number] };
  carSize: number;
}

export function garageLayout(width: number, height: number): GarageLayout {
  const landscape = width > height;
  // Portrait: high enough that the front car clears the garage's button panel.
  const floorY = height * (landscape ? 0.86 : 0.63);
  const carSize = landscape ? Math.min(height * 0.36, width * 0.2) : Math.min(width * 0.36, height * 0.2);
  // Friends park in the back row (drawn smaller by the scene), Navie in front.
  return {
    width,
    height,
    floorY,
    bays: {
      navie: [width * 0.5, floorY + carSize * 0.3],
      jepoy: [width * (landscape ? 0.26 : 0.22), floorY + carSize * 0.02],
      kiko: [width * (landscape ? 0.74 : 0.79), floorY + carSize * 0.02],
    },
    carSize,
  };
}

export function drawGarageBackground(ctx: Ctx, layout: GarageLayout, look: GarageLook, t: number): void {
  const { width: w, height: h, floorY } = layout;
  // Back wall: warm plaster, darker toward the corners.
  ctx.fillStyle = vgrad(ctx, 0, floorY, [
    [0, look.evening > 0.5 ? '#3B3466' : '#F3E3C8'],
    [1, look.evening > 0.5 ? '#5A4A6E' : '#E9D2AE'],
  ]);
  ctx.fillRect(0, 0, w, floorY);
  // Wooden beams.
  ctx.fillStyle = shade('#9C6B43', look.evening > 0.5 ? -0.35 : 0);
  ctx.fillRect(0, h * 0.06, w, h * 0.022);
  for (const x of [w * 0.08, w * 0.92]) {
    ctx.fillRect(x - w * 0.012, 0, w * 0.024, floorY);
  }
  // Window with sky.
  const winW = w * 0.32;
  const winH = h * 0.12;
  const winX = w * 0.5 - winW / 2;
  const winY = h * 0.11;
  roundRect(ctx, winX, winY, winW, winH, 8);
  ctx.fillStyle = vgrad(ctx, winY, winY + winH, look.evening > 0.5 ? [[0, '#1E2A5A'], [1, '#FF9E6B']] : [[0, '#5FB2FF'], [1, '#E3F4FF']]);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#8A5A34';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(winX + winW / 2, winY);
  ctx.lineTo(winX + winW / 2, winY + winH);
  ctx.moveTo(winX, winY + winH / 2);
  ctx.lineTo(winX + winW, winY + winH / 2);
  ctx.stroke();
  // Calendar with the fiesta circled.
  const calX = w * 0.74;
  const calY = h * 0.12;
  roundRect(ctx, calX, calY, w * 0.13, h * 0.09, 4);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.fillStyle = C.danger;
  ctx.fillRect(calX, calY, w * 0.13, h * 0.02);
  ctx.strokeStyle = C.danger;
  ctx.lineWidth = 2;
  ellipsePath(ctx, calX + w * 0.085, calY + h * 0.055, w * 0.025, h * 0.015);
  ctx.stroke();
  ctx.font = `900 ${Math.max(7, w * 0.018)}px ${BRAND_FONT}`;
  ctx.fillStyle = '#4C5868';
  ctx.textAlign = 'center';
  ctx.fillText('FIESTA', calX + w * 0.065, calY + h * 0.083);
  // Shelf with paint cans.
  const shelfY = h * 0.3;
  ctx.fillStyle = '#8A5A34';
  ctx.fillRect(w * 0.62, shelfY, w * 0.3, h * 0.01);
  const cans = ['#E2453C', C.nlexBlue, C.yellow, '#2EAD5B'];
  cans.forEach((colour, i) => {
    roundRect(ctx, w * 0.64 + i * w * 0.065, shelfY - h * 0.04, w * 0.05, h * 0.04, 3);
    ctx.fillStyle = colour;
    ctx.fill();
  });

  // Team board (Jepoy's arrival).
  if (look.teamBoard) {
    const bx = w * 0.1;
    const by = h * 0.18;
    const bw = w * 0.3;
    const bh = h * 0.15;
    roundRect(ctx, bx, by, bw, bh, 6);
    ctx.fillStyle = '#C8955F';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#7A5230';
    ctx.stroke();
    ctx.font = `900 ${Math.max(8, w * 0.024)}px ${BRAND_FONT}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText('TEAM NAVIE', bx + bw / 2, by + bh * 0.2);
    // Little photo cards.
    const photos = look.workshop ? 3 : 2;
    for (let i = 0; i < photos; i += 1) {
      const px = bx + bw * (0.12 + i * 0.29);
      const py = by + bh * 0.35;
      ctx.save();
      ctx.translate(px + bw * 0.12, py + bh * 0.25);
      ctx.rotate((i - 1) * 0.08);
      roundRect(ctx, -bw * 0.12, -bh * 0.25, bw * 0.24, bh * 0.5, 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.fillStyle = [C.navieBody, C.jepoyBody, C.kikoTeal][i];
      ellipsePath(ctx, 0, -bh * 0.02, bw * 0.06, bw * 0.06);
      ctx.fill();
      ctx.restore();
    }
  }

  // Pinned postcards (one per find).
  // There are more postcards than wall: the five most recent finds stay up.
  look.postcards.slice(-5).forEach((id, i) => {
    const px = w * (0.43 + i * 0.07);
    const py = h * 0.27;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((i % 2 === 0 ? -1 : 1) * 0.1);
    roundRect(ctx, -w * 0.03, -h * 0.018, w * 0.06, h * 0.036, 2);
    ctx.fillStyle = '#FFFDF5';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#8A6A3A';
    ctx.stroke();
    ctx.fillStyle = id === 'pc-sierra' ? '#7FA7D6' : id === 'pc-parol' ? C.yellow : id.length % 2 === 0 ? '#FF9E6B' : '#7CC78A';
    ctx.fillRect(-w * 0.024, -h * 0.013, w * 0.026, h * 0.026);
    ellipsePath(ctx, 0, -h * 0.02, 2.5, 2.5);
    ctx.fillStyle = C.danger;
    ctx.fill();
    ctx.restore();
  });

  // Workshop corner (Kiko's arrival): pegboard with tools and Lola's red toolbox.
  if (look.workshop) {
    const px = w * 0.62;
    const py = h * 0.36;
    const pw = w * 0.32;
    const ph = h * 0.16;
    roundRect(ctx, px, py, pw, ph, 4);
    ctx.fillStyle = '#B9C6D6';
    ctx.fill();
    ctx.fillStyle = '#8A97A8';
    for (let i = 0; i < 9; i += 1) {
      for (let j = 0; j < 5; j += 1) {
        ellipsePath(ctx, px + pw * (0.08 + i * 0.105), py + ph * (0.12 + j * 0.19), 1.5, 1.5);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#4C5868';
    ctx.lineWidth = Math.max(3, w * 0.008);
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i += 1) {
      const tx = px + pw * (0.15 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(tx, py + ph * 0.25);
      ctx.lineTo(tx, py + ph * 0.75);
      ctx.stroke();
      ellipsePath(ctx, tx, py + ph * 0.22, w * 0.012, w * 0.012);
      ctx.stroke();
    }
    ctx.font = `900 ${Math.max(7, w * 0.02)}px ${BRAND_FONT}`;
    ctx.fillStyle = '#2B323E';
    ctx.textAlign = 'center';
    ctx.fillText("KIKO'S WORKSHOP", px + pw / 2, py + ph * 0.95);
  }

  // Floor.
  ctx.fillStyle = vgrad(ctx, floorY, h, [
    [0, look.evening > 0.5 ? '#6E6A80' : '#C9CDD3'],
    [1, look.evening > 0.5 ? '#4A4660' : '#A9AFB8'],
  ]);
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  for (const x of [w * 0.34, w * 0.66]) {
    ctx.beginPath();
    ctx.moveTo(x, floorY + 4);
    ctx.lineTo(x + (x - w / 2) * 0.6, h);
    ctx.stroke();
  }
  ellipsePath(ctx, w * 0.3, floorY + (h - floorY) * 0.6, w * 0.08, h * 0.012);
  ctx.fillStyle = 'rgba(30,30,40,0.12)';
  ctx.fill();
  if (look.workshop) {
    // Lola's toolbox against the back wall, behind Kiko's bay.
    const tx = w * 0.62;
    const ty = floorY + (h - floorY) * 0.02;
    roundRect(ctx, tx - w * 0.06, ty - h * 0.045, w * 0.12, h * 0.045, 4);
    ctx.fillStyle = C.danger;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#7E1D1A';
    ctx.stroke();
  }

  // Hanging bulb and its warm light.
  const bulbX = w * 0.5;
  const bulbY = h * 0.05;
  ctx.strokeStyle = '#4C5868';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bulbX, 0);
  ctx.lineTo(bulbX, bulbY);
  ctx.stroke();
  ellipsePath(ctx, bulbX, bulbY + 8, 8, 10);
  ctx.fillStyle = '#FFF3B0';
  ctx.fill();
  ctx.fillStyle = rgrad(ctx, bulbX, bulbY + 8, 0, h * 0.55, [
    [0, 'rgba(255,240,180,0.35)'],
    [1, 'rgba(255,240,180,0)'],
  ]);
  ctx.fillRect(0, 0, w, h);

  // Banderitas strings across the top.
  if (look.banderitas || look.fiesta) {
    const colours = [C.yellow, '#E2453C', C.nlexBlue, '#2EAD5B', '#FF8FA3'];
    for (let row = 0; row < 2; row += 1) {
      const y0 = h * (0.035 + row * 0.045);
      ctx.strokeStyle = '#6B4A2B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.quadraticCurveTo(w / 2, y0 + h * 0.03, w, y0);
      ctx.stroke();
      const flags = 14;
      for (let i = 0; i < flags; i += 1) {
        const u = (i + 0.5) / flags;
        const x = u * w;
        const y = y0 + h * 0.03 * 4 * u * (1 - u) * 0.5;
        const sway = Math.sin(t * 1.4 + i) * 1.5;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.018, y);
        ctx.lineTo(x + w * 0.018, y);
        ctx.lineTo(x + sway, y + h * 0.028);
        ctx.closePath();
        ctx.fillStyle = colours[(i + row) % colours.length];
        ctx.fill();
      }
    }
  }
  if (look.kikoParol) {
    const px = w * 0.5;
    const py = h * 0.15;
    ctx.strokeStyle = '#6B4A2B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, h * 0.06);
    ctx.lineTo(px, py - Math.min(w, h) * 0.045);
    ctx.stroke();
    drawParolStar(ctx, px, py, Math.min(w, h) * 0.05, C.kikoTeal, 0.5 + 0.2 * Math.sin(t * 1.8));
  }
  if (look.fiesta) {
    drawParolStar(ctx, w * 0.2, h * 0.11, Math.min(w, h) * 0.04, C.yellow, 0.4 + 0.15 * Math.sin(t * 1.5));
    drawParolStar(ctx, w * 0.8, h * 0.1, Math.min(w, h) * 0.035, '#E2453C', 0.4 + 0.15 * Math.sin(t * 1.5 + 1));
    // Framed photo of the fiesta.
    const fx = w * 0.43;
    const fy = h * 0.34;
    roundRect(ctx, fx, fy, w * 0.14, h * 0.07, 4);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8A5A34';
    ctx.stroke();
    starPath(ctx, fx + w * 0.07, fy + h * 0.035, Math.min(w, h) * 0.018, 5, 0.5);
    ctx.fillStyle = C.yellow;
    ctx.fill();
  }
}
