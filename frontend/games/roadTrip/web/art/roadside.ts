import { BRAND_FONT, ellipsePath, groundShadow, rgba, rgrad, roundRect, shade, vgrad, type Ctx } from './kit';
import { C, TIMES, type TimeOfDay } from './palette';

/**
 * Road Trip's richer roadside (second pass, 24 Oct): layered trees with warm
 * light and grounded shadows, bamboo, nipa huts, power pylons, km posts, an
 * SOS call box and readable traffic signs, plus a tree line on the horizon
 * and a warm light wash. Kept apart from scenery.ts, which Grand Prix also
 * draws, so the racing game's look does not change with this one.
 *
 * Props are drawn in a 200-unit box, origin at the bottom centre; light comes
 * from the upper right (the sun is on the right at morning and noon).
 */

export type RoadsideKind = 'mango' | 'acaciaBig' | 'palmTall' | 'bamboo' | 'banana' | 'hedge' | 'nipa' | 'pylon' | 'kmpost' | 'sos' | 'signSlow' | 'signKeep' | 'signExit';

/** Sprite box per kind, [left, top, right, bottom] in prop units. */
export const ROADSIDE_BOX: Record<RoadsideKind, [number, number, number, number]> = {
  mango: [-130, -250, 130, 16],
  acaciaBig: [-150, -230, 150, 16],
  palmTall: [-110, -290, 110, 16],
  bamboo: [-90, -280, 90, 16],
  banana: [-90, -170, 90, 16],
  hedge: [-110, -70, 110, 14],
  nipa: [-120, -170, 120, 16],
  pylon: [-90, -420, 90, 14],
  kmpost: [-30, -80, 30, 10],
  sos: [-40, -130, 40, 12],
  signSlow: [-70, -190, 70, 12],
  signKeep: [-70, -190, 70, 12],
  signExit: [-110, -200, 110, 12],
};

/** A leafy clump: dark base, mid body, warm highlight on the sun side. */
function foliage(ctx: Ctx, blobs: [number, number, number][], base: string): void {
  for (const [x, y, r] of blobs) {
    ellipsePath(ctx, x + r * 0.08, y + r * 0.12, r, r * 0.82);
    ctx.fillStyle = shade(base, -0.28);
    ctx.fill();
  }
  for (const [x, y, r] of blobs) {
    ellipsePath(ctx, x, y, r * 0.94, r * 0.76);
    ctx.fillStyle = base;
    ctx.fill();
  }
  for (const [x, y, r] of blobs) {
    ellipsePath(ctx, x + r * 0.28, y - r * 0.3, r * 0.5, r * 0.36);
    ctx.fillStyle = rgba(shade(base, 0.35), 0.75);
    ctx.fill();
  }
}

function trunk(ctx: Ctx, x0: number, w: number, top: number, colour = '#7A5636'): void {
  ctx.beginPath();
  ctx.moveTo(x0 - w * 0.6, 0);
  ctx.quadraticCurveTo(x0 - w * 0.4, top * 0.5, x0 - w * 0.3, top);
  ctx.lineTo(x0 + w * 0.3, top);
  ctx.quadraticCurveTo(x0 + w * 0.45, top * 0.5, x0 + w * 0.6, 0);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  // Sunlit edge.
  ctx.fillStyle = 'rgba(255,230,180,0.25)';
  ctx.fillRect(x0 + w * 0.1, top, w * 0.2, -top);
}

function post(ctx: Ctx, x: number, top: number, w = 7, colour = '#8F9BAB'): void {
  ctx.fillStyle = colour;
  ctx.fillRect(x - w / 2, top, w, -top);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x + w * 0.1, top, w * 0.25, -top);
}

function signPlate(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, edge: string): void {
  roundRect(ctx, x - w / 2, y - h / 2, w, h, Math.min(w, h) * 0.14);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

export function drawRoadside(ctx: Ctx, kind: RoadsideKind, variant: number): void {
  switch (kind) {
    case 'mango': {
      groundShadow(ctx, -18, 4, 120, 18, 0.3);
      trunk(ctx, 0, 22, -96);
      ctx.strokeStyle = '#6B4A2E';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -80);
      ctx.lineTo(-34, -126);
      ctx.moveTo(2, -86);
      ctx.lineTo(38, -132);
      ctx.stroke();
      const g = variant % 2 === 0 ? '#3E8C38' : '#357F3A';
      foliage(ctx, [[-58, -138, 52], [52, -146, 56], [-6, -182, 64], [-28, -118, 44], [30, -112, 42], [6, -214, 38]], g);
      break;
    }
    case 'acaciaBig': {
      groundShadow(ctx, -20, 4, 140, 18, 0.3);
      trunk(ctx, 0, 18, -110);
      ctx.strokeStyle = '#6B4A2E';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -100);
      ctx.quadraticCurveTo(-40, -140, -86, -150);
      ctx.moveTo(0, -104);
      ctx.quadraticCurveTo(46, -146, 92, -152);
      ctx.stroke();
      // The wide umbrella crown of a roadside acacia (rain tree).
      foliage(ctx, [[-96, -160, 40], [-48, -178, 52], [10, -188, 58], [66, -176, 50], [110, -158, 36], [-14, -160, 44]], variant % 2 === 0 ? '#4C9A3C' : '#3F8F3E');
      break;
    }
    case 'palmTall': {
      groundShadow(ctx, -10, 4, 70, 12, 0.28);
      ctx.strokeStyle = '#8A6A44';
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      const lean = variant % 2 === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(20 * lean, -140, 8 * lean, -250);
      ctx.stroke();
      // Trunk rings.
      ctx.strokeStyle = 'rgba(70,48,24,0.35)';
      ctx.lineWidth = 2;
      for (let y = -20; y > -240; y -= 18) {
        const k = -y / 250;
        const x = 20 * lean * 2 * k * (1 - k) + 8 * lean * k * k;
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y + 2);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(8 * lean, -250);
      for (let i = 0; i < 9; i += 1) {
        const a = -Math.PI / 2 + (i - 4) * 0.4;
        ctx.save();
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(46, -22, 92, 16);
        ctx.quadraticCurveTo(46, 0, 0, 8);
        ctx.closePath();
        ctx.fillStyle = i % 3 === 0 ? '#2F8433' : i % 3 === 1 ? '#3F9B3A' : '#5DB547';
        ctx.fill();
        ctx.restore();
      }
      // Coconuts.
      for (const [x, y] of [[-6, 6], [6, 8], [0, 12]]) {
        ellipsePath(ctx, x, y, 7, 7);
        ctx.fillStyle = '#6B5124';
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'bamboo': {
      groundShadow(ctx, -6, 4, 84, 13, 0.28);
      const stems = [-40, -22, -6, 10, 26, 42];
      stems.forEach((x, i) => {
        const top = -200 - ((i * 37 + variant * 13) % 70);
        const bend = (i - 2.5) * 9;
        ctx.strokeStyle = i % 2 === 0 ? '#7FA83A' : '#6D9932';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + bend * 0.3, top * 0.6, x + bend, top);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(40,60,20,0.5)';
        ctx.lineWidth = 2;
        for (let y = -30; y > top; y -= 32) {
          const k = y / top;
          const nx = x + bend * k * k;
          ctx.beginPath();
          ctx.moveTo(nx - 4, y);
          ctx.lineTo(nx + 4, y);
          ctx.stroke();
        }
      });
      // Feathery leaves hanging out.
      foliage(ctx, [[-50, -210, 30], [34, -230, 34], [-10, -250, 30], [50, -180, 26], [-46, -160, 24]], '#5C9E3A');
      break;
    }
    case 'banana': {
      groundShadow(ctx, 0, 4, 70, 11, 0.28);
      ctx.fillStyle = '#7D9A47';
      ctx.fillRect(-7, -90, 14, 90);
      for (let i = 0; i < 6; i += 1) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.55;
        ctx.save();
        ctx.translate(0, -90);
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(36, -26, 80, -6);
        ctx.quadraticCurveTo(40, 12, 0, 6);
        ctx.closePath();
        ctx.fillStyle = i % 2 === 0 ? '#5DAE3E' : '#73C04B';
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,80,20,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(4, 3);
        ctx.lineTo(74, -4);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'hedge': {
      groundShadow(ctx, 0, 4, 110, 12, 0.26);
      foliage(ctx, [[-78, -26, 30], [-34, -34, 36], [14, -32, 34], [62, -28, 32], [92, -20, 22]], variant % 2 === 0 ? '#4E9E3A' : '#469436');
      // Flowers on some (gumamela).
      if (variant % 3 === 0) {
        for (const [x, y] of [[-50, -40], [6, -52], [52, -36], [-12, -24]]) {
          ellipsePath(ctx, x, y, 6, 5);
          ctx.fillStyle = '#E8455A';
          ctx.fill();
        }
      }
      break;
    }
    case 'nipa': {
      groundShadow(ctx, -10, 6, 120, 16, 0.3);
      // Stilts.
      ctx.fillStyle = '#6B4A2E';
      for (const x of [-70, -24, 24, 70]) {
        ctx.fillRect(x - 5, -40, 10, 40);
      }
      // Woven walls.
      roundRect(ctx, -84, -104, 168, 66, 4);
      ctx.fillStyle = '#D9B77A';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,84,40,0.35)';
      ctx.lineWidth = 2;
      for (let x = -78; x < 84; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, -104);
        ctx.lineTo(x, -38);
        ctx.stroke();
      }
      // Window with a capiz panel open.
      ctx.fillStyle = '#5A3E22';
      ctx.fillRect(-20, -90, 40, 30);
      ctx.fillStyle = '#F2E6C8';
      ctx.fillRect(22, -90, 22, 30);
      // Thatched roof.
      ctx.beginPath();
      ctx.moveTo(-110, -96);
      ctx.lineTo(0, -166);
      ctx.lineTo(110, -96);
      ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -166, -96, [
        [0, '#B98B47'],
        [1, '#8E6631'],
      ]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,50,20,0.4)';
      for (let i = -4; i <= 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * 4, -160);
        ctx.lineTo(i * 26, -98);
        ctx.stroke();
      }
      // Sunlit right slope.
      ctx.beginPath();
      ctx.moveTo(0, -166);
      ctx.lineTo(110, -96);
      ctx.lineTo(60, -96);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,225,160,0.22)';
      ctx.fill();
      break;
    }
    case 'pylon': {
      // A steel transmission tower: the kind that marches across the paddies.
      ctx.strokeStyle = '#8D99A8';
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-60, 0);
      ctx.lineTo(-14, -400);
      ctx.lineTo(14, -400);
      ctx.lineTo(60, 0);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 9; i += 1) {
        const y0 = -i * 44;
        const y1 = y0 - 44;
        const w0 = 60 - (46 * -y0) / 400;
        const w1 = 60 - (46 * -y1) / 400;
        ctx.beginPath();
        ctx.moveTo(-w0, y0);
        ctx.lineTo(w1, y1);
        ctx.moveTo(w0, y0);
        ctx.lineTo(-w1, y1);
        ctx.stroke();
      }
      ctx.lineWidth = 5;
      for (const y of [-300, -360]) {
        ctx.beginPath();
        ctx.moveTo(-80, y);
        ctx.lineTo(80, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#C9D3DE';
      for (const x of [-76, 76]) {
        for (const y of [-300, -360]) {
          ctx.fillRect(x - 3, y, 6, 14);
        }
      }
      break;
    }
    case 'kmpost': {
      groundShadow(ctx, 0, 3, 26, 5, 0.3);
      roundRect(ctx, -18, -70, 36, 70, [12, 12, 2, 2]);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#6B7686';
      ctx.stroke();
      ctx.fillStyle = '#1F6B3A';
      ctx.fillRect(-18, -70 + 14, 36, 4);
      ctx.font = `900 18px ${BRAND_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.ink;
      ctx.fillText(String(20 + (variant % 9) * 2), 0, -34);
      ctx.font = `900 10px ${BRAND_FONT}`;
      ctx.fillText('KM', 0, -16);
      break;
    }
    case 'sos': {
      groundShadow(ctx, 0, 3, 34, 6, 0.3);
      post(ctx, 0, -60, 9);
      roundRect(ctx, -30, -124, 60, 66, 8);
      ctx.fillStyle = '#F2B01E';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#6B4A00';
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, -22, -116, 44, 20, 4);
      ctx.fill();
      ctx.font = `900 16px ${BRAND_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#C62828';
      ctx.fillText('SOS', 0, -105);
      // Handset.
      roundRect(ctx, -14, -88, 28, 22, 6);
      ctx.fillStyle = '#20242C';
      ctx.fill();
      break;
    }
    case 'signSlow':
    case 'signKeep': {
      groundShadow(ctx, 0, 3, 40, 6, 0.28);
      post(ctx, 0, -110, 8);
      if (kind === 'signSlow') {
        // Diamond warning sign.
        ctx.save();
        ctx.translate(0, -146);
        ctx.rotate(Math.PI / 4);
        roundRect(ctx, -40, -40, 80, 80, 8);
        ctx.fillStyle = '#FFC32D';
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#20242C';
        ctx.stroke();
        ctx.restore();
        ctx.font = `900 21px ${BRAND_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#20242C';
        ctx.fillText('SLOW', 0, -154);
        ctx.font = `900 14px ${BRAND_FONT}`;
        ctx.fillText('DOWN', 0, -134);
      } else {
        signPlate(ctx, 0, -148, 96, 80, '#FFFFFF', '#20242C');
        // Keep-right arrow.
        ctx.strokeStyle = '#20242C';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-18, -128);
        ctx.lineTo(10, -160);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-6, -166);
        ctx.lineTo(14, -166);
        ctx.lineTo(14, -146);
        ctx.stroke();
        ctx.font = `900 12px ${BRAND_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#20242C';
        ctx.fillText('KEEP RIGHT', 0, -116);
      }
      break;
    }
    case 'signExit': {
      groundShadow(ctx, 0, 3, 90, 8, 0.28);
      post(ctx, -60, -120, 9);
      post(ctx, 60, -120, 9);
      signPlate(ctx, 0, -158, 200, 76, '#1F7A45', '#FFFFFF');
      ctx.font = `900 24px ${BRAND_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      const names = ['DRIVE SAFE', 'INGAT PO!', 'NEXT EXIT 2 KM', 'BUCKLE UP'];
      ctx.fillText(names[variant % names.length], 0, -158);
      break;
    }
  }
}

/** Distant trees along the horizon, two layers, the far one hazed. Drawn into the cached sky. */
export function drawTreeLine(ctx: Ctx, w: number, horizon: number, time: TimeOfDay): void {
  const look = TIMES[time];
  const layer = (seed: number, height: number, colour: string): void => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(-40, horizon + 1);
    let x = -40;
    let i = 0;
    while (x < w + 40) {
      const r = height * (0.45 + 0.55 * Math.abs(Math.sin(i * 12.9898 + seed)));
      const step = r * (1.1 + 0.5 * Math.abs(Math.sin(i * 78.233 + seed)));
      ctx.arc(x + step / 2, horizon - r * 0.5, Math.max(1, step / 2), Math.PI, 0);
      x += step;
      i += 1;
    }
    ctx.lineTo(w + 40, horizon + 1);
    ctx.closePath();
    ctx.fill();
  };
  const unit = Math.max(4, horizon * 0.03);
  layer(2.1, unit * 1.2, shade(look.field, -0.05));
  ctx.fillStyle = vgrad(ctx, horizon - unit * 2, horizon + 1, [
    [0, 'rgba(255,255,255,0)'],
    [1, look.haze],
  ]);
  ctx.fillRect(-40, horizon - unit * 2, w + 80, unit * 2 + 1);
  layer(5.7, unit * 0.9, shade(look.field, -0.3));
}

/** A warm wash from the sun's side and a soft vignette at the bottom: one gradient pass each. */
export function drawWarmLight(ctx: Ctx, w: number, h: number, horizon: number, time: TimeOfDay): void {
  const sunset = time === 'sunset';
  const sx = sunset ? w * 0.28 : w * 0.85;
  ctx.fillStyle = rgrad(ctx, sx, horizon * 0.4, 0, Math.max(w, h) * 0.9, [
    [0, sunset ? 'rgba(255,170,90,0.22)' : 'rgba(255,236,180,0.16)'],
    [1, 'rgba(255,236,180,0)'],
  ]);
  ctx.fillRect(0, 0, w, h);
}
