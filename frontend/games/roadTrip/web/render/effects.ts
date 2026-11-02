import type { Ctx } from '../art/kit';

/**
 * Small visual effects in screen space: pick-up sparkles, hit debris,
 * exhaust puffs. A fixed pool, so nothing is allocated per frame; reduced
 * motion caps how many are spawned.
 */

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  colour: string;
  kind: 'dot' | 'star' | 'ring' | 'plus';
}

const POOL = 160;

export class Particles {
  private pool: Particle[] = Array.from({ length: POOL }, () => ({
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    max: 1,
    size: 1,
    colour: '#fff',
    kind: 'dot' as const,
  }));
  /** 0-1: share of requested particles actually spawned. */
  density = 1;

  spawn(x: number, y: number, count: number, colour: string, options: { speed?: number; size?: number; life?: number; up?: number; kind?: Particle['kind'] } = {}): void {
    const n = Math.max(1, Math.round(count * this.density));
    let made = 0;
    for (const p of this.pool) {
      if (made >= n) {
        break;
      }
      if (p.alive) {
        continue;
      }
      const a = Math.random() * Math.PI * 2;
      const speed = (options.speed ?? 80) * (0.4 + Math.random() * 0.8);
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed - (options.up ?? 40);
      p.max = (options.life ?? 0.6) * (0.7 + Math.random() * 0.6);
      p.life = p.max;
      p.size = (options.size ?? 4) * (0.6 + Math.random() * 0.8);
      p.colour = colour;
      p.kind = options.kind ?? 'dot';
      made += 1;
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) {
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      p.vx *= 1 - dt * 2;
    }
  }

  draw(ctx: Ctx): void {
    for (const p of this.pool) {
      if (!p.alive) {
        continue;
      }
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.colour;
      ctx.strokeStyle = p.colour;
      if (p.kind === 'ring') {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2 - k) * 2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'star') {
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x + s * 0.3, p.y - s * 0.3);
        ctx.lineTo(p.x + s, p.y);
        ctx.lineTo(p.x + s * 0.3, p.y + s * 0.3);
        ctx.lineTo(p.x, p.y + s);
        ctx.lineTo(p.x - s * 0.3, p.y + s * 0.3);
        ctx.lineTo(p.x - s, p.y);
        ctx.lineTo(p.x - s * 0.3, p.y - s * 0.3);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 'plus') {
        // A chunky repair "+".
        const s = p.size;
        ctx.fillRect(p.x - s, p.y - s * 0.34, s * 2, s * 0.68);
        ctx.fillRect(p.x - s * 0.34, p.y - s, s * 0.68, s * 2);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (const p of this.pool) {
      p.alive = false;
    }
  }

  get active(): number {
    return this.pool.filter((p) => p.alive).length;
  }
}
