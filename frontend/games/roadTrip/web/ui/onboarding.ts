import type { HeroId } from '../../core/types';
import { roundRect } from '../art/kit';
import type { OnboardCard } from './hud';

/**
 * The convoy's onboarding: two or three short cards before the first run,
 * each with a top-down diagram, replacing the old radio line plus yellow
 * banner. Shown until the mission is completed once; after that the run
 * starts with just the compact objective.
 */

type Ctx = CanvasRenderingContext2D;

/** A little top-down road: three lanes, dashes. Returns the lane centre x for -1/0/1. */
function road(ctx: Ctx, w: number, h: number): (lane: number) => number {
  ctx.fillStyle = '#4A5262';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#6CC24A';
  ctx.fillRect(0, 0, w * 0.1, h);
  ctx.fillRect(w * 0.9, 0, w * 0.1, h);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const x of [w * 0.1 + (w * 0.8) / 3, w * 0.1 + (w * 1.6) / 3]) {
    for (let y = 2; y < h; y += 14) {
      ctx.fillRect(x - 1, y, 2, 7);
    }
  }
  return (lane) => w * 0.5 + lane * ((w * 0.8) / 3);
}

function car(ctx: Ctx, x: number, y: number, body: string, trim: string): void {
  ctx.fillStyle = 'rgba(10,22,41,0.3)';
  ctx.fillRect(x - 8, y - 11, 18, 24);
  ctx.fillStyle = body;
  roundRect(ctx, x - 9, y - 13, 18, 24, 6);
  ctx.fill();
  ctx.fillStyle = trim;
  ctx.fillRect(x - 6, y - 8, 12, 6);
}

function navie(ctx: Ctx, x: number, y: number): void {
  car(ctx, x, y, '#3A8CF4', '#1E3A66');
}

function kiko(ctx: Ctx, x: number, y: number): void {
  car(ctx, x, y, '#F4F7FA', '#1FA597');
}

function dots(ctx: Ctx, points: [number, number][], colour: string): void {
  ctx.fillStyle = colour;
  for (const [x, y] of points) {
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** S-curve samples from (x0, y0) to (x1, y1). */
function curve(x0: number, y0: number, x1: number, y1: number, n: number, sharp = false): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const k = sharp ? Math.min(1, Math.max(0, (u - 0.45) / 0.1)) : u * u * (3 - 2 * u);
    out.push([x0 + (x1 - x0) * k, y0 + (y1 - y0) * u]);
  }
  return out;
}

const followArt = (ctx: Ctx, w: number, h: number): void => {
  const lane = road(ctx, w, h);
  dots(ctx, curve(lane(1), h - 18, lane(0), 26, 9), '#2FD1BF');
  navie(ctx, lane(0), 22);
  kiko(ctx, lane(1), h - 16);
};

const smoothArt = (ctx: Ctx, w: number, h: number): void => {
  const lane = road(ctx, w, h);
  dots(ctx, curve(lane(-1), h - 8, lane(0), 8, 10), '#2FD1BF');
  dots(ctx, curve(lane(0), h - 8, lane(1), 8, 10, true), '#FFB020');
  ctx.font = '900 15px system-ui';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2FD1BF';
  ctx.fillText('✓', lane(-1) + 4, 18);
  ctx.fillStyle = '#FFB020';
  ctx.fillText('!', lane(1) + 10, h - 30);
};

const shieldArt = (ctx: Ctx, w: number, h: number): void => {
  const lane = road(ctx, w, h);
  navie(ctx, lane(0), 30);
  kiko(ctx, lane(0), h - 24);
  ctx.strokeStyle = '#FFC93C';
  ctx.fillStyle = 'rgba(255,201,60,0.18)';
  ctx.lineWidth = 3;
  for (const y of [30, h - 24]) {
    ctx.beginPath();
    ctx.ellipse(lane(0) + 1, y, 17, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // A cone bouncing away.
  ctx.fillStyle = '#FF7A1A';
  ctx.beginPath();
  ctx.moveTo(lane(-1) + 8, 2);
  ctx.lineTo(lane(-1) + 14, 14);
  ctx.lineTo(lane(-1) + 2, 14);
  ctx.closePath();
  ctx.fill();
};

const partArt = (ctx: Ctx, w: number, h: number): void => {
  const lane = road(ctx, w, h);
  navie(ctx, lane(0), h * 0.45);
  kiko(ctx, lane(0), h - 14);
  ctx.fillStyle = '#21B3A2';
  ctx.strokeStyle = '#0B4A43';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(lane(0) + 1, 14, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
};

export function convoyCards(hero: HeroId): OnboardCard[] {
  const cards: OnboardCard[] = [
    {
      speaker: 'kiko',
      expr: 'worried',
      title: 'Kiko follows your path',
      text: "I'll drive right behind you, po - on the exact line you take. Where you go, I go a moment later.",
      art: followArt,
    },
    {
      speaker: hero,
      expr: 'determined',
      title: 'Change lanes early and smoothly',
      text: 'Kiko steers slower than I do. Swerve too sharply and he cuts the corner - an amber ! means slow your moves down.',
      art: smoothArt,
    },
  ];
  if (hero === 'jepoy') {
    cards.push({
      speaker: 'jepoy',
      expr: 'happy',
      title: "Kuya's Shield covers you both",
      text: 'Tap my button when something gets close: hazards bounce off me and Kiko for a few seconds. Then it recharges.',
      art: shieldArt,
    });
  } else {
    cards.push({
      speaker: 'kiko',
      expr: 'happy',
      title: 'Gear parts fix my engine',
      text: 'Each bump costs my engine a bar. Drive over the teal gear parts and I get one back.',
      art: partArt,
    });
  }
  return cards;
}
