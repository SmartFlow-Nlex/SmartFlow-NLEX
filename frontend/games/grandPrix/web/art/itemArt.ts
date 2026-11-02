import { starPath } from '../../../roadTrip/web/art/faces';
import { ellipsePath, rgrad, roundRect, vgrad, type Ctx } from '../../../roadTrip/web/art/kit';
import type { ItemId } from '../../core/items';

/**
 * Item art for the Grand Prix, drawn in code: the gift box on the track and
 * one icon per item (HUD button, track sprites). Units: drawn centred on the
 * origin in a box of about +/-55, like the turbo cell.
 */

/** The fiesta gift box: a wrapped cube with a ribbon and a big "?" that bobs and turns. */
export function drawItemBox(ctx: Ctx, t: number): void {
  const k = 1 + Math.sin(t * 5) * 0.05;
  ctx.save();
  ctx.scale(k, k);
  // Glow.
  ellipsePath(ctx, 0, 0, 58, 58);
  ctx.fillStyle = rgrad(ctx, 0, 0, 0, 58, [
    [0, 'rgba(255,255,255,0.7)'],
    [1, 'rgba(255,120,200,0)'],
  ]);
  ctx.fill();
  const hue = (t * 90) % 360;
  roundRect(ctx, -38, -38, 76, 76, 14);
  ctx.fillStyle = vgrad(ctx, -38, 38, [
    [0, `hsl(${hue}, 85%, 68%)`],
    [1, `hsl(${(hue + 60) % 360}, 80%, 52%)`],
  ]);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#10284C';
  ctx.stroke();
  // Ribbon.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-7, -38, 14, 76);
  ctx.fillRect(-38, -7, 76, 14);
  // The "?".
  ctx.font = '900 46px "Nunito Black", system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#10284C';
  ctx.strokeText('?', 0, 3);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('?', 0, 3);
  ctx.restore();
}

/** An item's icon, centred, about 100 units across. `t` animates the star and the bubble. */
export function drawItemIcon(ctx: Ctx, item: ItemId, t = 0): void {
  ctx.save();
  ctx.lineJoin = 'round';
  switch (item) {
    case 'turbo': {
      ellipsePath(ctx, 0, 0, 44, 44);
      ctx.fillStyle = vgrad(ctx, -44, 44, [
        [0, '#5FD3FF'],
        [1, '#1464E8'],
      ]);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#10284C';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(8, -32);
      ctx.lineTo(-16, 6);
      ctx.lineTo(0, 6);
      ctx.lineTo(-8, 32);
      ctx.lineTo(18, -6);
      ctx.lineTo(2, -6);
      ctx.closePath();
      ctx.fillStyle = '#FFE066';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.stroke();
      break;
    }
    case 'oil': {
      ctx.beginPath();
      ctx.moveTo(-40, 8);
      ctx.bezierCurveTo(-46, -18, -16, -26, 0, -18);
      ctx.bezierCurveTo(16, -30, 48, -16, 40, 6);
      ctx.bezierCurveTo(50, 26, 14, 34, 0, 26);
      ctx.bezierCurveTo(-18, 36, -48, 28, -40, 8);
      ctx.closePath();
      ctx.fillStyle = '#1B1F2A';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      // Rainbow sheen.
      for (const [c, r] of [['rgba(255,90,200,0.55)', 20], ['rgba(90,200,255,0.5)', 13], ['rgba(255,230,90,0.45)', 7]] as [string, number][]) {
        ellipsePath(ctx, -8, -2, r * 1.3, r * 0.55);
        ctx.strokeStyle = c;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      break;
    }
    case 'coconut': {
      ellipsePath(ctx, 0, 0, 40, 38);
      ctx.fillStyle = rgrad(ctx, 0, 0, 4, 42, [
        [0, '#A0703C'],
        [1, '#5B3714'],
      ], -12, -12);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#2E1A08';
      ctx.stroke();
      // Husk fibres and the three "eyes".
      ctx.strokeStyle = 'rgba(46,26,8,0.5)';
      ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * 12, -34);
        ctx.quadraticCurveTo(i * 18, 0, i * 12, 34);
        ctx.stroke();
      }
      ctx.fillStyle = '#2E1A08';
      for (const [x, y] of [[-9, -14], [9, -14], [0, -2]] as [number, number][]) {
        ellipsePath(ctx, x, y, 5, 6);
        ctx.fill();
      }
      break;
    }
    case 'sipa': {
      // A woven rattan ball with a ribbon tail.
      ctx.beginPath();
      ctx.moveTo(18, 28);
      ctx.quadraticCurveTo(36, 46, 52, 40);
      ctx.strokeStyle = '#E2453C';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke();
      ellipsePath(ctx, 0, 0, 38, 38);
      ctx.fillStyle = rgrad(ctx, 0, 0, 4, 40, [
        [0, '#FFE39A'],
        [1, '#D99A2B'],
      ], -10, -12);
      ctx.fill();
      ctx.save();
      ellipsePath(ctx, 0, 0, 38, 38);
      ctx.clip();
      ctx.strokeStyle = 'rgba(122,74,0,0.65)';
      ctx.lineWidth = 3;
      for (let i = -3; i <= 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-40, i * 12 - 20);
        ctx.lineTo(40, i * 12 + 20);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-40, i * 12 + 20);
        ctx.lineTo(40, i * 12 - 20);
        ctx.stroke();
      }
      ctx.restore();
      ellipsePath(ctx, 0, 0, 38, 38);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#7A4A00';
      ctx.stroke();
      break;
    }
    case 'bubble': {
      const k = 1 + Math.sin(t * 4) * 0.04;
      ellipsePath(ctx, 0, 0, 42 * k, 42 * k);
      ctx.fillStyle = rgrad(ctx, 0, 0, 10, 44, [
        [0, 'rgba(180,240,255,0.35)'],
        [1, 'rgba(60,180,255,0.75)'],
      ]);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1E8FD6';
      ctx.stroke();
      ellipsePath(ctx, -14, -16, 10, 6, -0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      break;
    }
    case 'star': {
      ctx.rotate(Math.sin(t * 3) * 0.12);
      starPath(ctx, 0, 2, 46, 5, 0.47);
      ctx.fillStyle = vgrad(ctx, -46, 46, [
        [0, '#FFF0A0'],
        [1, '#FFB020'],
      ]);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#8A5A00';
      ctx.stroke();
      ctx.fillStyle = '#10284C';
      ellipsePath(ctx, -9, -2, 4, 6);
      ctx.fill();
      ellipsePath(ctx, 9, -2, 4, 6);
      ctx.fill();
      break;
    }
    case 'redLight': {
      roundRect(ctx, -20, -44, 40, 88, 12);
      ctx.fillStyle = '#2B323E';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#10141B';
      ctx.stroke();
      const lamps: [number, string][] = [[-26, '#FF4A3D'], [0, '#5A4A20'], [26, '#1F4A2E']];
      for (const [y, c] of lamps) {
        ellipsePath(ctx, 0, y, 12, 12);
        ctx.fillStyle = c;
        ctx.fill();
      }
      ellipsePath(ctx, 0, -26, 20, 20);
      ctx.fillStyle = 'rgba(255,74,61,0.3)';
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}
