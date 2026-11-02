import { isMachine, type CharacterId } from '../../core/types';
import { drawCharacter } from '../art/cast';
import { makeCanvas, roundRect, type Ctx } from '../art/kit';
import { C } from '../art/palette';
import { drawPickup, type PickupLook } from '../art/vehicles';

/**
 * Small images for the HTML interface, drawn with the game's own art at the
 * device's pixel ratio and cached as data URLs.
 */

const cache = new Map<string, string>();

/** Draws once at the device ratio and caches the data URL (shared with teamIcons.ts). */
export function render(key: string, size: number, draw: (ctx: Ctx, size: number) => void): string {
  const known = cache.get(key);
  if (known !== undefined) {
    return known;
  }
  const ratio = Math.min(3, window.devicePixelRatio || 1);
  const { canvas, ctx } = makeCanvas(size, size, ratio);
  draw(ctx, size);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export function pickupIcon(kind: PickupLook, size = 24): string {
  return render(`pickup-${kind}-${size}`, size, (ctx, s) => {
    ctx.translate(s / 2, s / 2);
    ctx.scale(s / 100, s / 100);
    drawPickup(ctx, kind, 0);
  });
}

/** A head-and-shoulders portrait (cap to bumper top) for menus and the team board. */
export function portrait(id: CharacterId, size = 64, expr: 'idle' | 'happy' = 'happy'): string {
  return render(`portrait-${id}-${size}-${expr}`, size, (ctx, s) => {
    // Jepoy is taller (signboard) and the machine's face is its lens: frame each.
    const charSize = s * (id === 'jepoy' ? 1.1 : isMachine(id) ? 0.85 : 1.25);
    const base = s * (id === 'jepoy' ? 1.08 : isMachine(id) ? 1.42 : 1.12);
    drawCharacter(ctx, id, s / 2, base, charSize, {
      expr,
      anim: { t: 0, blink: 0, talk: 0, lookX: 0, lookY: 0 },
      shadow: false,
    });
  });
}

/** Dent slot: a little shield-shaped badge, full or cracked. */
export function dentIcon(dented: boolean, size = 22): string {
  return render(`dent-${dented}-${size}`, size, (ctx, s) => {
    ctx.save();
    ctx.scale(s / 24, s / 24);
    roundRect(ctx, 3, 4, 18, 16, 6);
    ctx.fillStyle = dented ? '#9AA6B6' : C.navieBody;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = dented ? '#4C5868' : C.navieOutline;
    ctx.stroke();
    if (dented) {
      // A crack - shape, not just colour.
      ctx.strokeStyle = '#2B323E';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(9, 5);
      ctx.lineTo(13, 11);
      ctx.lineTo(10, 14);
      ctx.lineTo(15, 19);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', 12, 12.5);
    }
    ctx.restore();
  });
}

export function shieldIcon(size = 30): string {
  return render(`shield-${size}`, size, (ctx, s) => {
    ctx.scale(s / 30, s / 30);
    ctx.beginPath();
    ctx.moveTo(15, 2);
    ctx.lineTo(27, 7);
    ctx.quadraticCurveTo(27, 22, 15, 28);
    ctx.quadraticCurveTo(3, 22, 3, 7);
    ctx.closePath();
    ctx.fillStyle = C.yellow;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#7A5200';
    ctx.stroke();
    ctx.fillStyle = '#7A5200';
    ctx.font = '900 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('J', 15, 15);
  });
}
