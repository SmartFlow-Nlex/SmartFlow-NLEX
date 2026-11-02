import { SIDEKICKS, type Expression, type FoeKind, type PowerUpKind, type SidekickId } from '../../core/types';
import { blinkAt } from './cast';
import { drawFoe, FOE_BOX } from './foes';
import { BRAND_FONT, makeCanvas, roundRect, type Ctx } from './kit';
import { drawPowerUp, POWERUP_BOX, POWERUP_INFO } from './powerups';
import { drawSidekick, SIDEKICK_BOX, type SidekickPose } from './sidekicks';

/**
 * Development preview of the sidekicks, Barrikada's minions and the
 * power-ups (?sheet=crew in a dev build): every sidekick normal and evolved
 * in three expressions plus its action flash, every foe at full health,
 * hit, low health and in high-contrast mode, every power-up, and a strip at
 * gameplay size on asphalt. It also checks that nothing draws outside its
 * declared box and reports any overflow in the console.
 */

const NAMES: Record<SidekickId, [string, string]> = {
  pip: ['Pip', 'Pip Turbo'],
  bumbo: ['Bumbo', 'Bumbo Max'],
  mila: ['Mila', 'Mila Maxi'],
  kumpuni: ['Kumpuni', 'Kumpuni Pro'],
  bantay: ['Bantay', 'Bantay Gold'],
  silip: ['Silip', 'Silip Radar'],
  walis: ['Walis', 'Walis Turbo'],
  barya: ['Barya', 'Barya Ginto'],
  sibat: ['Sibat', 'Sibat Kidlat'],
  tala: ['Tala', 'Tala Liwanag'],
  ilaw: ['Ilaw', 'Ilaw Bantay'],
  maso: ['Maso', 'Maso Bigat'],
};

const FOES: FoeKind[] = ['conebot', 'drumbot', 'signbot'];
const POWERUPS: PowerUpKind[] = ['spread', 'magnet', 'bubble', 'rally'];

/** Set true while checking art to see each sprite's box. */
const SHOW_BOXES = false;

function label(ctx: Ctx, text: string, x: number, y: number, size = 13, colour = '#10284C'): void {
  ctx.font = `900 ${size}px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

function box(ctx: Ctx, b: [number, number, number, number]): void {
  if (!SHOW_BOXES) {
    return;
  }
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(16,40,76,0.35)';
  ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
  ctx.restore();
}

function pose(expr: Expression, t: number, evolved: boolean, action: number): SidekickPose {
  return { expr, t, blink: blinkAt(t), talk: 0.6, lookX: 0, evolved, action };
}

/** Draws each sprite over a range of times/poses into a padded canvas and counts pixels outside its box. */
function checkBounds(): string[] {
  const problems: string[] = [];
  const pad = 40;
  const test = (name: string, b: [number, number, number, number], draw: (ctx: Ctx) => void): void => {
    const w = b[2] - b[0] + pad * 2;
    const h = b[3] - b[1] + pad * 2;
    const { ctx } = makeCanvas(w, h, 1);
    ctx.translate(pad - b[0], pad - b[1]);
    draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(pad, pad, w - pad * 2, h - pad * 2);
    const data = ctx.getImageData(0, 0, w, h).data;
    let count = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 10) {
        count += 1;
        const px = ((i - 3) / 4) % w;
        const py = Math.floor((i - 3) / 4 / w);
        x0 = Math.min(x0, px);
        y0 = Math.min(y0, py);
        x1 = Math.max(x1, px);
        y1 = Math.max(y1, py);
      }
    }
    if (count > 0) {
      const ox = b[0] - pad;
      const oy = b[1] - pad;
      problems.push(`${name}: ${count} px outside its box, drawn extent x ${x0 + ox}..${x1 + ox}, y ${y0 + oy}..${y1 + oy}`);
    }
  };
  const exprs: Expression[] = ['idle', 'speaking', 'happy', 'worried', 'surprised', 'determined', 'hurt', 'celebrate'];
  for (const id of SIDEKICKS) {
    for (const evolved of [false, true]) {
      for (const expr of exprs) {
        for (const action of [0, 1]) {
          test(`${id}${evolved ? '+' : ''} ${expr} a${action}`, SIDEKICK_BOX, (ctx) => {
            for (const t of [0.3, 0.9, 1.5, 2.1, 2.7]) {
              drawSidekick(ctx, id, { expr, t, blink: 0, talk: 1, lookX: 1, evolved, action });
              drawSidekick(ctx, id, { expr, t: t + 0.2, blink: 0, talk: 1, lookX: -1, evolved, action: action * 0.5 });
            }
          });
        }
      }
    }
  }
  for (const kind of FOES) {
    test(kind, FOE_BOX[kind], (ctx) => {
      for (const t of [0.1, 0.5, 0.9, 1.3, 1.7]) {
        drawFoe(ctx, kind, { t, hurt: 0, hp: 1, outline: false });
        drawFoe(ctx, kind, { t, hurt: 1, hp: 0.2, outline: true });
        drawFoe(ctx, kind, { t: t + 0.13, hurt: 0.5, hp: 0.3, outline: false });
      }
    });
  }
  for (const kind of POWERUPS) {
    test(kind, POWERUP_BOX, (ctx) => {
      for (const t of [0.1, 0.4, 0.7, 1, 1.3, 1.6]) {
        drawPowerUp(ctx, kind, t);
      }
    });
  }
  return problems;
}

export function drawCrewSheet(ctx: Ctx, t: number): void {
  ctx.fillStyle = '#EEF6FF';
  // The foes and power-ups sit below however many sidekicks there are.
  const below = (SIDEKICKS.length - 6) * 162;
  ctx.fillRect(0, 0, 1200, 1600 + below);
  label(ctx, 'Tollbound Heroes - sidekicks, jam gang and power-ups', 600, 22, 20);

  // Sidekicks: one row each; normal idle/happy/hurt/action, then evolved.
  const cols: [Expression, boolean, number, string][] = [
    ['idle', false, 0, 'idle'],
    ['happy', false, 0, 'happy'],
    ['hurt', false, 0, 'hurt'],
    ['determined', false, 1, 'action'],
    ['idle', true, 0, 'idle'],
    ['happy', true, 0, 'happy'],
    ['hurt', true, 0, 'hurt'],
    ['determined', true, 1, 'action'],
  ];
  const s = 0.66;
  SIDEKICKS.forEach((id, row) => {
    const baseY = 186 + row * 162;
    ctx.fillStyle = row % 2 === 0 ? 'rgba(20,100,232,0.05)' : 'rgba(20,100,232,0.0)';
    ctx.fillRect(0, baseY - 140, 1200, 162);
    label(ctx, NAMES[id][0], 300, baseY - 128, 14, '#1464E8');
    label(ctx, NAMES[id][1], 900, baseY - 128, 14, '#C97A00');
    cols.forEach(([expr, evolved, action, name], col) => {
      const x = 75 + col * 150;
      ctx.save();
      ctx.translate(x, baseY);
      ctx.scale(s, s);
      box(ctx, SIDEKICK_BOX);
      drawSidekick(ctx, id, pose(expr, t + col * 0.37, evolved, action));
      ctx.restore();
      label(ctx, name, x, baseY + 13, 11, '#4C5868');
    });
  });
  ctx.fillStyle = 'rgba(16,40,76,0.25)';
  ctx.fillRect(599, 50, 2, SIDEKICKS.length * 162);

  // Foes.
  const foeTop = 1030 + below;
  label(ctx, "Haring Barrikada's jam gang", 600, foeTop, 16);
  const states: [string, { hurt: number; hp: number; outline: boolean }][] = [
    ['full', { hurt: 0, hp: 1, outline: false }],
    ['hit', { hurt: 1, hp: 1, outline: false }],
    ['low hp', { hurt: 0, hp: 0.3, outline: false }],
    ['outline', { hurt: 0, hp: 1, outline: true }],
  ];
  const cells: [FoeKind, string, { hurt: number; hp: number; outline: boolean }][] = [];
  for (const kind of FOES) {
    for (const [name, st] of states) {
      cells.push([kind, name, st]);
    }
  }
  cells.forEach(([kind, name, st], i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const x = 100 + col * 200;
    const y = foeTop + 165 + row * 180;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.6, 0.6);
    box(ctx, FOE_BOX[kind]);
    drawFoe(ctx, kind, { t: t + i * 0.21, ...st });
    ctx.restore();
    label(ctx, `${kind} - ${name}`, x, y + 16, 11, '#4C5868');
  });

  // Power-ups.
  const puY = 1500 + below;
  label(ctx, 'Power-ups', 260, 1410 + below, 16);
  POWERUPS.forEach((kind, i) => {
    const x = 70 + i * 128;
    ctx.save();
    ctx.translate(x, puY);
    ctx.scale(0.7, 0.7);
    box(ctx, POWERUP_BOX);
    drawPowerUp(ctx, kind, t + i * 0.5);
    ctx.restore();
    label(ctx, POWERUP_INFO[kind].name, x, puY + 66, 11, '#4C5868');
  });

  // Gameplay size on asphalt: sidekicks ~56 px tall, foes and power-ups as they'd appear near the car.
  const stripX = 540;
  const stripY = 1420 + below;
  roundRect(ctx, 10, stripY + 180, 1180, 170, 12);
  ctx.fillStyle = '#4A5262';
  ctx.fill();
  label(ctx, 'Sidekicks at gameplay size', 600, stripY + 194, 12, '#FFFFFF');
  roundRect(ctx, stripX, stripY, 650, 170, 12);
  ctx.fillStyle = '#4A5262';
  ctx.fill();
  label(ctx, 'At gameplay size', stripX + 325, stripY + 14, 12, '#FFFFFF');
  SIDEKICKS.forEach((id, i) => {
    for (const evolved of [false, true]) {
      ctx.save();
      ctx.translate(50 + i * 95, stripY + (evolved ? 340 : 275));
      ctx.scale(0.27, 0.27);
      drawSidekick(ctx, id, pose('idle', t + i, evolved, 0));
      ctx.restore();
    }
  });
  FOES.forEach((kind, i) => {
    ctx.save();
    ctx.translate(stripX + 80 + i * 80, stripY + 140);
    ctx.scale(0.3, 0.3);
    drawFoe(ctx, kind, { t: t + i, hurt: 0, hp: 1, outline: false });
    ctx.restore();
  });
  POWERUPS.forEach((kind, i) => {
    ctx.save();
    ctx.translate(stripX + 80 + i * 60, stripY + 50);
    ctx.scale(0.3, 0.3);
    drawPowerUp(ctx, kind, t + i);
    ctx.restore();
  });

  const problems = checkBounds();
  if (problems.length > 0) {
    console.warn(`crew sheet: ${problems.length} sprite(s) overflow their box\n${problems.join('\n')}`);
  } else {
    console.info('crew sheet: every sprite stays inside its box');
  }
}
