/** Development art sheets and a bare driving view, for checking art in a browser (debug builds only). */
import { createBot } from '../core/bot';
import { STEP } from '../core/config';
import { DrivingSim } from '../core/sim';
import { EXPRESSIONS, type MissionId } from '../core/types';
import { DriveRenderer } from './render/drive';
import { drawCharacter, blinkAt } from './art/cast';
import { drawCrewSheet } from './art/crewSheet';
import { drawFoe } from './art/foes';
import { makeCanvas } from './art/kit';
import { drawPowerUp } from './art/powerups';
import { drawBarrier, drawCone, drawJepoyRear, drawKikoRear, drawLaneBoard, drawNavieRear, drawPickup, drawPothole, drawTrafficRear } from './art/vehicles';
import { LOOKS } from './mission';

function sheet(): void {
  const { canvas, ctx } = makeCanvas(1200, 1500, 1);
  document.body.appendChild(canvas);
  ctx.fillStyle = '#DFF1FF';
  ctx.fillRect(0, 0, 1200, 1500);
  const ids = ['navie', 'jepoy', 'kiko', 'barrikada'] as const;
  ids.forEach((id, row) => {
    EXPRESSIONS.forEach((expr, col) => {
      const size = id === 'barrikada' ? 70 : 120;
      drawCharacter(ctx, id, 75 + col * 145, 160 + row * 190, size, {
        expr,
        anim: { t: 1.3, blink: blinkAt(1.3), talk: 0.6, lookX: 0, lookY: 0 },
      });
    });
  });
  const rear = (x: number, y: number, s: number, draw: () => void): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    draw();
    ctx.restore();
  };
  rear(110, 1080, 0.6, () => drawNavieRear(ctx, { wheel: 0.3 }));
  rear(280, 1080, 0.6, () => drawKikoRear(ctx, { wheel: 0.3, t: 1 }));
  rear(450, 1080, 0.6, () => drawJepoyRear(ctx, { wheel: 0.3, t: 1 }));
  rear(620, 1080, 0.6, () => drawTrafficRear(ctx, 'car', '#E2453C', { wheel: 0.3 }));
  rear(800, 1080, 0.6, () => drawTrafficRear(ctx, 'truck', '', { wheel: 0.3 }));
  rear(1010, 1080, 0.6, () => drawTrafficRear(ctx, 'bus', '', { wheel: 0.3 }));
  rear(100, 1300, 0.6, () => drawCone(ctx, false));
  rear(220, 1300, 0.6, () => drawCone(ctx, true));
  rear(400, 1300, 0.6, () => drawBarrier(ctx, false));
  rear(600, 1300, 0.6, () => drawPothole(ctx, false));
  rear(760, 1300, 0.6, () => drawLaneBoard(ctx, 1, 'LANE CLOSED'));
  (['bolt', 'wrench', 'postcard', 'part', 'spark'] as const).forEach((kind, i) => {
    rear(100 + i * 110, 1420, 0.7, () => drawPickup(ctx, kind, 0.4));
  });
}

function compare(): void {
  const { canvas, ctx } = makeCanvas(1200, 520, 1);
  document.body.appendChild(canvas);
  ctx.fillStyle = '#DFF1FF';
  ctx.fillRect(0, 0, 1200, 520);
  drawCharacter(ctx, 'navie', 230, 470, 400, { expr: 'idle', anim: { t: 0.5, blink: 0, talk: 0, lookX: 0, lookY: 0 } });
  drawCharacter(ctx, 'navie', 640, 470, 400, { expr: 'happy', anim: { t: 0.5, blink: 0, talk: 0, lookX: 0, lookY: 0 } });
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 860, 60, 300, 346);
  img.src = new URLSearchParams(location.search).get('ref') ?? '';
}

function faces(id: 'navie' | 'jepoy' | 'kiko' | 'barrikada'): void {
  const { canvas, ctx } = makeCanvas(1200, 700, 1);
  document.body.appendChild(canvas);
  ctx.fillStyle = '#DFF1FF';
  ctx.fillRect(0, 0, 1200, 700);
  EXPRESSIONS.forEach((expr, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    drawCharacter(ctx, id, 150 + col * 300, 320 + row * 340, id === 'barrikada' ? 150 : 270, {
      expr,
      anim: { t: 0.8, blink: 0, talk: 0.7, lookX: 0, lookY: 0 },
    });
    ctx.fillStyle = '#10284C';
    ctx.font = '600 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(expr, 150 + col * 300, 340 + row * 340);
  });
}

function drive(): void {
  const params = new URLSearchParams(location.search);
  const missionId = (params.get('mission') ?? 'm1-garage') as MissionId;
  const seconds = Number(params.get('t') ?? '20');
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const { canvas, ctx } = makeCanvas(w, h, dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  document.body.appendChild(canvas);
  const sim = new DrivingSim({
    missionId,
    seed: Number(params.get('seed') ?? '3'),
    settings: { difficulty: 'standard', gameSpeed: 1, warningBoost: Number(params.get('warn') ?? '0'), autoAbility: false },
    loadout: { hero: (params.get('hero') as 'navie' | 'jepoy' | 'kiko' | null) ?? 'navie', sidekicks: ['pip', 'mila'], evolved: {} },
    upgrades: {},
    skipTutorial: params.get('tutorial') !== '1',
    scenario: null,
  });
  const bot = createBot({ useAbility: true });
  for (let i = 0; i < seconds * 60 && sim.state.outcome === null; i += 1) {
    sim.step(STEP, bot(sim, STEP));
    sim.drainEvents();
  }
  const renderer = new DriveRenderer();
  renderer.resize(w, h, dpr);
  renderer.setLook(LOOKS[missionId]);
  renderer.resize(w, h, dpr);
  let last = performance.now();
  let t = 0;
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    if (params.get('run') === '1') {
      sim.step(STEP, bot(sim, STEP));
      sim.drainEvents();
    }
    renderer.draw(ctx, sim.state, t, dt, { reduceMotion: false, hazardOutlines: params.get('outline') === '1' });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}


/** Barrikada's bots (healthy, hurt, low), the power-up capsules and the pick-ups, large. */
function foes(): void {
  const { canvas, ctx } = makeCanvas(1200, 900, 1);
  document.body.appendChild(canvas);
  ctx.fillStyle = '#4A5262';
  ctx.fillRect(0, 0, 1200, 900);
  const at = (x: number, y: number, s: number, draw: () => void): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    draw();
    ctx.restore();
  };
  (['conebot', 'drumbot', 'signbot'] as const).forEach((kind, row) => {
    [
      { t: 0, hurt: 0, hp: 1 },
      { t: 0.5, hurt: 0, hp: 1 },
      { t: 0, hurt: 1, hp: 0.66 },
      { t: 0, hurt: 0, hp: 0.33 },
    ].forEach((o, col) => at(130 + col * 200, 230 + row * 230, 0.85, () => drawFoe(ctx, kind, { ...o, outline: false })));
    at(930, 230 + row * 230, 0.85, () => drawFoe(ctx, kind, { t: 0, hurt: 0, hp: 1, outline: true }));
  });
  (['spread', 'magnet', 'bubble', 'rally'] as const).forEach((kind, i) => at(100 + i * 150, 820, 0.7, () => drawPowerUp(ctx, kind, 0.2)));
  (['bolt', 'wrench', 'part', 'spark'] as const).forEach((kind, i) => at(720 + i * 120, 820, 0.8, () => drawPickup(ctx, kind, 0.4)));
}

export function runDevSheet(name: string): void {
  if (name === 'foes') {
    foes();
  } else if (name === 'drive') {
    drive();
  } else if (name === 'cast') {
    sheet();
  } else if (name === 'crew') {
    const { canvas, ctx } = makeCanvas(1200, 2960, 1);
    document.body.appendChild(canvas);
    drawCrewSheet(ctx, Number(new URLSearchParams(location.search).get('t') ?? '1.3'));
  } else if (name === 'compare') {
    compare();
  } else if (name.startsWith('faces-')) {
    faces(name.slice(6) as 'navie');
  }
}
