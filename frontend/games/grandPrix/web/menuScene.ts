import { blinkAt, drawCharacter } from '../../roadTrip/web/art/cast';
import { makeCanvas, roundRect, vgrad } from '../../roadTrip/web/art/kit';
import { drawGround, drawSkyLayer } from '../../roadTrip/web/art/scenery';
import { drawGrandstand, drawRaceCar } from './art/raceArt';
import type { Scene } from './appApi';

/**
 * The menus' backdrop: the start straight at the Fiesta Grand Prix, the
 * grandstand, two rivals' cars on the grid, and Navie up front - waving,
 * happy, ready. Navie is Road Trip's drawing of the mascot, read as is.
 */
export class MenuScene implements Scene {
  private width = 390;
  private height = 844;
  private dpr = 1;
  private t = 0;
  private background: HTMLCanvasElement | null = null;
  dim = 0;

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.background = null;
  }

  private ensureBackground(): HTMLCanvasElement {
    if (this.background === null) {
      const w = this.width;
      const h = this.height;
      const { canvas, ctx } = makeCanvas(w, h, this.dpr);
      const horizon = h * 0.42;
      drawSkyLayer(ctx, w, horizon, 'morning', 'none');
      drawGround(ctx, w, h, horizon, 'morning');
      // Grandstands along the back.
      for (let i = 0; i < 3; i += 1) {
        ctx.save();
        ctx.translate(w * (0.18 + i * 0.32), horizon + h * 0.05);
        ctx.scale(w / 700, w / 700);
        drawGrandstand(ctx, i);
        ctx.restore();
      }
      // The start straight, with its checkered line.
      const top = horizon + h * 0.06;
      ctx.beginPath();
      ctx.moveTo(w * 0.38, top);
      ctx.lineTo(w * 0.62, top);
      ctx.lineTo(w * 1.3, h);
      ctx.lineTo(-w * 0.3, h);
      ctx.closePath();
      ctx.fillStyle = vgrad(ctx, top, h, [
        [0, '#5A6272'],
        [1, '#3E4554'],
      ]);
      ctx.fill();
      const lineY = h * 0.8;
      const cells = 14;
      const span = w * 1.3;
      for (let i = 0; i < cells; i += 1) {
        for (let r = 0; r < 2; r += 1) {
          ctx.fillStyle = (i + r) % 2 === 0 ? '#10284C' : '#FFFFFF';
          ctx.fillRect(-w * 0.15 + (span / cells) * i, lineY + r * 10, span / cells + 1, 10);
        }
      }
      // Two rivals on the grid behind.
      for (const [x, n, colour, build] of [[0.3, 7, '#FFB020', 'hatch'], [0.7, 2, '#E2453C', 'coupe']] as [number, number, string, 'hatch' | 'coupe'][]) {
        ctx.save();
        ctx.translate(w * x, top + h * 0.1);
        ctx.scale(w / 1400, w / 1400);
        drawRaceCar(ctx, build, colour, n, 0);
        ctx.restore();
      }
      // Banner.
      roundRect(ctx, w * 0.1, h * 0.04, w * 0.8, h * 0.035, 6);
      ctx.fillStyle = '#1464E8';
      ctx.fill();
      this.background = canvas;
    }
    return this.background;
  }

  draw(ctx: CanvasRenderingContext2D, _t: number, dt: number): void {
    this.t += dt;
    ctx.drawImage(this.ensureBackground(), 0, 0, this.width, this.height);
    if (this.dim > 0) {
      ctx.fillStyle = `rgba(10,22,41,${this.dim})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    const size = Math.min(this.width * 0.42, this.height * 0.24);
    drawCharacter(ctx, 'navie', this.width / 2, this.height * 0.78, size, {
      expr: Math.floor(this.t / 4) % 3 === 2 ? 'determined' : 'happy',
      anim: { t: this.t, blink: blinkAt(this.t, 1), talk: 0, lookX: Math.sin(this.t * 0.5) * 0.3, lookY: 0 },
      hop: Math.abs(Math.sin(this.t * 2.2)) * 3,
    });
  }

  dispose(): void {
    this.background = null;
  }
}
