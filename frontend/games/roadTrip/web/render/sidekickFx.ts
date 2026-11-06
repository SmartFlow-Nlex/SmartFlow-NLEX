import type { SidekickId } from '../../core/types';
import type { Ctx } from '../art/kit';

/**
 * A small flourish on a sidekick when it uses its ability: Bumbo's dish rings, Mila's
 * magnet hums, Bibing steams. It is decoration on top of what the ability already
 * draws, and it stays within about one body of the character, so it never hides the
 * road. The ability itself is untouched.
 */

/** How long a flourish lasts, in seconds. */
export const FX_SECONDS = 0.6;

type Kind =
  | 'ripple' | 'magnet' | 'thrust' | 'plus' | 'shieldUp' | 'glint' | 'dust' | 'coin' | 'streak' | 'star' | 'lamps' | 'bang'
  | 'halo' | 'steam' | 'bubbles' | 'petals' | 'leaves' | 'feathers' | 'ribbon' | 'sparks' | 'cog' | 'drops';

const FX: Record<SidekickId, { kind: Kind; a: string; b: string }> = {
  pip: { kind: 'thrust', a: '#FFC97A', b: '#8CC4F2' },
  bumbo: { kind: 'ripple', a: '#FFC63F', b: '#F4872F' },
  mila: { kind: 'magnet', a: '#5FD6BC', b: '#FFF4DC' },
  kumpuni: { kind: 'plus', a: '#8FCB7A', b: '#F4F7E8' },
  bantay: { kind: 'shieldUp', a: '#E5705F', b: '#FBF2DC' },
  silip: { kind: 'glint', a: '#BFE6F2', b: '#FFFFFF' },
  walis: { kind: 'dust', a: '#EDE3C8', b: '#B7D9C6' },
  barya: { kind: 'coin', a: '#F3C75A', b: '#FFF0B8' },
  sibat: { kind: 'streak', a: '#E5705F', b: '#FBF2DC' },
  tala: { kind: 'star', a: '#FFD76A', b: '#FFF6CC' },
  ilaw: { kind: 'lamps', a: '#E5705F', b: '#F3C75A' },
  maso: { kind: 'bang', a: '#F3C75A', b: '#FBF2DC' },
  parolito: { kind: 'halo', a: '#FFD98A', b: '#E5705F' },
  bibing: { kind: 'steam', a: '#FBF6EA', b: '#F0D9A8' },
  kape: { kind: 'steam', a: '#F4EBDD', b: '#B99A7A' },
  sago: { kind: 'bubbles', a: '#D79CCB', b: '#F6DDF0' },
  sampy: { kind: 'petals', a: '#FFFDF5', b: '#DDEBCC' },
  kawayan: { kind: 'leaves', a: '#8FBF6A', b: '#C7D97F' },
  kalaw: { kind: 'feathers', a: '#EFE4CF', b: '#E0A84C' },
  tarsi: { kind: 'glint', a: '#F3C75A', b: '#FFFFFF' },
  piko: { kind: 'dust', a: '#FBF7EC', b: '#D9D9CC' },
  saranggola: { kind: 'ribbon', a: '#E9B54C', b: '#69AFA4' },
  duwi: { kind: 'sparks', a: '#F3A65A', b: '#FFE2A8' },
  silaw: { kind: 'halo', a: '#FFE58F', b: '#CFE7A0' },
  bitu: { kind: 'sparks', a: '#E08A4C', b: '#A69488' },
  gearo: { kind: 'cog', a: '#D9B25A', b: '#7FBDAF' },
  ulap: { kind: 'drops', a: '#8FC4E6', b: '#D5EAF6' },
  kono: { kind: 'bang', a: '#C4A8E8', b: '#F8F1FC' },
  kislap: { kind: 'halo', a: '#FFE58F', b: '#FFF6CC' },
  dahon: { kind: 'leaves', a: '#8CC89A', b: '#C7E6B8' },
  radyo: { kind: 'ripple', a: '#7FD0C6', b: '#E4F1E8' },
  ginto: { kind: 'coin', a: '#F3C75A', b: '#FFF0B8' },
  hamog: { kind: 'shieldUp', a: '#BFDAF2', b: '#F2F8FD' },
};

function dot(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.6, r), 0, Math.PI * 2);
  ctx.fill();
}

function sparkle(ctx: Ctx, x: number, y: number, r: number): void {
  const n = r * 0.24;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + n, y - n, x + r, y);
  ctx.quadraticCurveTo(x + n, y + n, x, y + r);
  ctx.quadraticCurveTo(x - n, y + n, x - r, y);
  ctx.quadraticCurveTo(x - n, y - n, x, y - r);
  ctx.fill();
}

function petal(ctx: Ctx, x: number, y: number, rx: number, ry: number, turn: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.6, rx), Math.max(0.5, ry), turn, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draws the flourish. (x, y) is the middle of the character's feet on screen, `u`
 * its pixels per model unit, `top` how tall it stands in pixels, `p` the progress 0-1.
 */
export function sidekickFx(ctx: Ctx, id: SidekickId, x: number, y: number, u: number, top: number, p: number): void {
  if (p <= 0 || p >= 1) {
    return;
  }
  const { kind, a, b } = FX[id];
  const fade = 1 - p;
  const out = Math.sin(p * Math.PI * 0.5);
  const mid = y - top * 0.5;
  const before = ctx.globalAlpha;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = before * Math.min(1, fade * 1.5);
  switch (kind) {
    case 'ripple': {
      // Rings leaving the dish, in the dish's own gold.
      ctx.lineWidth = Math.max(1, u * 0.11);
      for (let i = 0; i < 2; i += 1) {
        const q = Math.min(1, out + i * 0.28);
        ctx.strokeStyle = i === 0 ? a : b;
        ctx.beginPath();
        ctx.arc(x + u * 0.1, y - top - u * 0.1, u * (0.35 + q * 0.75), Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
      }
      break;
    }
    case 'magnet': {
      // The two tips hum: small arcs reaching out from each, and a spark drawn in between them.
      ctx.lineWidth = Math.max(1, u * 0.1);
      ctx.strokeStyle = a;
      for (const s of [-1, 1]) {
        const tx = x + s * u * (s > 0 ? 0.74 : 0.93);
        const ty = y - top + u * (s > 0 ? 0.12 : 0.32);
        for (let i = 0; i < 2; i += 1) {
          ctx.beginPath();
          ctx.arc(tx, ty, u * (0.22 + (i + out) * 0.17), s > 0 ? -Math.PI * 0.42 : Math.PI * 1.42, s > 0 ? Math.PI * 0.12 : Math.PI * 0.88, s < 0);
          ctx.stroke();
        }
      }
      ctx.fillStyle = b;
      sparkle(ctx, x, y - top * (0.74 - out * 0.08), u * 0.2 * fade + u * 0.05);
      break;
    }
    case 'thrust': {
      ctx.fillStyle = a;
      for (let i = 0; i < 3; i += 1) {
        dot(ctx, x + Math.sin(i * 2.4) * u * 0.16, y - top * 0.42 + out * u * (0.45 + i * 0.34), u * (0.17 - i * 0.04) * fade);
      }
      ctx.fillStyle = b;
      sparkle(ctx, x, y - top - out * u * 0.3, u * 0.22 * fade);
      break;
    }
    case 'plus': {
      ctx.strokeStyle = a;
      ctx.lineWidth = Math.max(1, u * 0.13);
      for (const [dx, delay] of [[-0.5, 0], [0.55, 0.22]] as const) {
        const q = Math.min(1, out + delay);
        const px = x + dx * u;
        const py = y - top * 0.8 - q * u * 0.75;
        const r = u * 0.16;
        ctx.beginPath();
        ctx.moveTo(px - r, py);
        ctx.lineTo(px + r, py);
        ctx.moveTo(px, py - r);
        ctx.lineTo(px, py + r);
        ctx.stroke();
      }
      break;
    }
    case 'shieldUp': {
      ctx.strokeStyle = a;
      ctx.lineWidth = Math.max(1.2, u * 0.14);
      const py = y - top - u * 0.1 - out * u * 0.4;
      ctx.beginPath();
      ctx.moveTo(x - u * 0.34, py + u * 0.14);
      ctx.lineTo(x, py - u * 0.14);
      ctx.lineTo(x + u * 0.34, py + u * 0.14);
      ctx.stroke();
      break;
    }
    case 'glint': {
      ctx.fillStyle = a;
      sparkle(ctx, x + u * 0.3, mid - u * 0.3, u * (0.18 + 0.28 * Math.sin(p * Math.PI)));
      ctx.fillStyle = b;
      sparkle(ctx, x - u * 0.34, mid + u * 0.1, u * 0.16 * Math.sin(p * Math.PI));
      break;
    }
    case 'dust': {
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? a : b;
        const s = i < 2 ? -1 : 1;
        dot(ctx, x + s * u * (0.45 + (i % 2) * 0.25) * (0.7 + out * 0.8), y - u * 0.1 - out * u * (0.12 + (i % 2) * 0.16), u * (0.17 - (i % 2) * 0.04) * (0.5 + fade * 0.7));
      }
      break;
    }
    case 'coin': {
      ctx.fillStyle = a;
      for (let i = 0; i < 3; i += 1) {
        const q = Math.min(1, out + i * 0.14);
        const px = x + (i - 1) * u * 0.42 * q;
        const py = y - top - q * u * (0.55 - Math.abs(i - 1) * 0.2);
        petal(ctx, px, py, u * 0.15 * Math.abs(Math.cos(p * 7 + i)) + u * 0.03, u * 0.15, 0);
      }
      break;
    }
    case 'streak': {
      ctx.lineWidth = Math.max(1, u * 0.09);
      for (const s of [-1, 1]) {
        ctx.strokeStyle = s < 0 ? a : b;
        const px = x + s * u * 0.42;
        const py = y - top * 0.7 - out * u * 0.75;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + u * 0.48 * fade);
        ctx.stroke();
      }
      break;
    }
    case 'star': {
      ctx.fillStyle = a;
      sparkle(ctx, x, y - top - u * 0.18, u * (0.14 + 0.32 * Math.sin(p * Math.PI)));
      ctx.fillStyle = b;
      sparkle(ctx, x + u * 0.56, mid, u * 0.15 * Math.sin(p * Math.PI));
      sparkle(ctx, x - u * 0.56, mid - u * 0.3, u * 0.12 * Math.sin(p * Math.PI));
      break;
    }
    case 'lamps': {
      const colours = [a, b, '#7FC68E'];
      colours.forEach((c, i) => {
        const q = Math.max(0, Math.min(1, p * 3 - i * 0.7));
        ctx.fillStyle = c;
        ctx.globalAlpha = before * q * Math.min(1, fade * 2);
        dot(ctx, x + (i - 1) * u * 0.34, y - top - u * 0.26, u * 0.11);
      });
      break;
    }
    case 'bang': {
      ctx.lineWidth = Math.max(1, u * 0.1);
      ctx.strokeStyle = a;
      const cy = y - top * 0.7;
      for (let i = 0; i < 6; i += 1) {
        const ang = (i / 6) * Math.PI * 2 + 0.3;
        const r0 = u * (0.62 + out * 0.3);
        const r1 = r0 + u * 0.24 * fade;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(x + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();
      }
      break;
    }
    case 'halo': {
      // A warm breath of light round the body, never over the road ahead.
      const r = u * (0.85 + out * 0.3);
      const g = ctx.createRadialGradient(x, mid, r * 0.25, x, mid, r);
      g.addColorStop(0, a);
      g.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = g;
      ctx.globalAlpha = before * 0.5 * Math.sin(p * Math.PI);
      ctx.beginPath();
      ctx.arc(x, mid, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'steam': {
      ctx.lineWidth = Math.max(1, u * 0.11);
      for (const s of [-1, 1]) {
        ctx.strokeStyle = s < 0 ? a : b;
        const px = x + s * u * 0.26;
        const py = y - top - out * u * 0.42;
        const wob = Math.sin(p * 7 + s) * u * 0.07;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.bezierCurveTo(px + u * 0.14 + wob, py - u * 0.16, px - u * 0.14 + wob, py - u * 0.3, px + wob, py - u * 0.46);
        ctx.stroke();
      }
      break;
    }
    case 'bubbles': {
      ctx.lineWidth = Math.max(0.8, u * 0.06);
      for (let i = 0; i < 4; i += 1) {
        const q = Math.min(1, out * (0.7 + i * 0.16));
        ctx.strokeStyle = i % 2 === 0 ? a : b;
        ctx.beginPath();
        ctx.arc(x + Math.cos(i * 2.1) * u * 0.55, y - top * 0.72 - q * u * (0.5 + i * 0.12), u * (0.09 + i * 0.022), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'petals':
    case 'leaves': {
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? a : b;
        const s = i < 2 ? -1 : 1;
        const px = x + s * u * (0.45 + i * 0.09) * (0.7 + out * 0.6);
        const py = mid - u * 0.3 + i * u * 0.09 + out * u * 0.34;
        petal(ctx, px, py, u * 0.15, u * 0.075, p * 4 + i * 1.3);
      }
      break;
    }
    case 'feathers': {
      ctx.lineWidth = Math.max(1, u * 0.1);
      for (let i = 0; i < 2; i += 1) {
        ctx.strokeStyle = i === 0 ? a : b;
        const py = y - top - u * 0.1 - out * u * (0.2 + i * 0.28);
        ctx.beginPath();
        ctx.moveTo(x - u * 0.28, py + u * 0.12);
        ctx.quadraticCurveTo(x, py - u * 0.1, x + u * 0.28, py + u * 0.12);
        ctx.stroke();
      }
      break;
    }
    case 'ribbon': {
      ctx.lineWidth = Math.max(1, u * 0.11);
      for (const s of [-1, 1]) {
        ctx.strokeStyle = s < 0 ? a : b;
        ctx.beginPath();
        for (let i = 0; i <= 8; i += 1) {
          const q = i / 8;
          const px = x + s * u * (0.24 + q * 0.62 * out);
          const py = y - u * 0.12 - top * 0.1 + Math.sin(q * 7 + p * 9) * u * 0.09;
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
      }
      break;
    }
    case 'sparks': {
      const cy = y - top * 0.72;
      for (let i = 0; i < 5; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? a : b;
        const ang = (i / 5) * Math.PI * 2 + 0.6;
        dot(ctx, x + Math.cos(ang) * u * (0.46 + out * 0.42), cy + Math.sin(ang) * u * (0.36 + out * 0.34), u * 0.07 * (0.5 + fade));
      }
      break;
    }
    case 'cog': {
      ctx.strokeStyle = a;
      ctx.lineWidth = Math.max(1, u * 0.08);
      const cx = x + u * 0.58;
      const cy = y - top - u * 0.04;
      const r = u * 0.18;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 6; i += 1) {
        const ang = (i / 6) * Math.PI * 2 + p * 6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.lineTo(cx + Math.cos(ang) * r * 1.42, cy + Math.sin(ang) * r * 1.42);
        ctx.stroke();
      }
      break;
    }
    case 'drops': {
      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = i === 1 ? b : a;
        petal(ctx, x + (i - 1) * u * 0.42, y - top * 0.2 + out * u * (0.28 + (i % 2) * 0.16), u * 0.06, u * 0.12, 0);
      }
      break;
    }
  }
  ctx.restore();
}
