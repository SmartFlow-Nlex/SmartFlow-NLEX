/** Development sheets, for checking art in a browser (debug builds only, reached with ?sheet=...). */
import { createBot } from '../core/bot';
import { STEP } from '../core/config';
import { DrivingSim } from '../core/sim';
import { EXPRESSIONS, HEROES, SIDEKICKS, type HeroId, type MissionId, type SidekickId } from '../core/types';
import { art, blinkAt, drawCharacter, drawSidekick, preload } from './art/clay';
import { makeCanvas } from './art/kit';
import { DriveRenderer } from './render/drive';
import { LOOKS } from './mission';

/** Every hero and sidekick: rear, turned and front, with a run of expressions. Whatever is missing shows as a gap. */
function roster(): void {
  const names = [
    ...HEROES.flatMap((id) => [`h.${id}.rear`, `h.${id}.turn`, `h.${id}.front`]),
    ...SIDEKICKS.flatMap((id) => [`s.${id}.front`, `s.${id}.evo`, `s.${id}.rear`]),
  ];
  const { canvas, ctx } = makeCanvas(1200, 2300, 1);
  document.body.appendChild(canvas);
  ctx.fillStyle = '#E9DFC6';
  ctx.fillRect(0, 0, 1200, 2300);
  void preload(names).then(() => {
    HEROES.forEach((id, row) => {
      const y = 96 + row * 96;
      const rear = art(`h.${id}.rear`);
      const turn = art(`h.${id}.turn`);
      if (rear !== null) {
        const k = 72 / rear.h;
        ctx.drawImage(rear.img, 16, y - 72, rear.w * k, 72);
      }
      if (turn !== null) {
        const k = 72 / turn.h;
        ctx.drawImage(turn.img, 90, y - 72, turn.w * k, 72);
      }
      (['idle', 'happy', 'worried', 'surprised', 'determined', 'hurt', 'celebrate'] as const).forEach((expr, col) => {
        drawCharacter(ctx, id as HeroId, 200 + col * 86, y, 78, { expr, anim: { t: 1, blink: 0, talk: 0, lookX: 0, lookY: 0 } });
      });
    });
    SIDEKICKS.forEach((id, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const x = 60 + col * 196;
      const y = 1290 + row * 160;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(0.5, 0.5);
      drawSidekick(ctx, id as SidekickId, { expr: 'happy', t: 0, blink: 0, talk: 0, lookX: 0, evolved: false, action: 0 });
      ctx.restore();
      ctx.save();
      ctx.translate(x + 94, y);
      ctx.scale(0.42, 0.42);
      drawSidekick(ctx, id as SidekickId, { expr: 'celebrate', t: 0, blink: 0, talk: 0, lookX: 0, evolved: true, action: 0 });
      ctx.restore();
      ctx.fillStyle = '#354844';
      ctx.font = '700 12px sans-serif';
      ctx.fillText(id, x - 20, y + 18);
    });
    void EXPRESSIONS;
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
    loadout: { hero: (params.get('hero') as HeroId | null) ?? 'navie', sidekicks: [(params.get('a') as SidekickId | null) ?? 'pip', (params.get('b') as SidekickId | null) ?? 'mila'], evolved: {} },
    upgrades: {},
    skipTutorial: params.get('tutorial') !== '1',
    scenario: null,
  });
  const bot = createBot({ useAbility: true });
  for (let i = 0; i < seconds * 60 && sim.state.outcome === null; i += 1) {
    if (sim.state.choice !== null) {
      sim.choose(sim.state.choice.options[0] ?? null);
    }
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
  void blinkAt;
}

/** Everyone large enough to judge a face: each hero calm and delighted, then each sidekick. */
function faces(): void {
  const names = [...HEROES.map((id) => `h.${id}.front`), ...SIDEKICKS.map((id) => `s.${id}.front`)];
  const { canvas, ctx } = makeCanvas(1240, 2100, 1);
  document.body.appendChild(canvas);
  ctx.fillStyle = '#E9DFC6';
  ctx.fillRect(0, 0, 1240, 2100);
  const label = (text: string, x: number, y: number): void => {
    ctx.fillStyle = '#354844';
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
  };
  void preload(names).then(() => {
    const anim = { t: 1, blink: 0, talk: 0, lookX: 0, lookY: 0 };
    HEROES.forEach((id, i) => {
      const x = 80 + (i % 4) * 306;
      const y = 170 + Math.floor(i / 4) * 200;
      drawCharacter(ctx, id as HeroId, x, y, 140, { expr: 'idle', anim });
      drawCharacter(ctx, id as HeroId, x + 150, y, 140, { expr: 'celebrate', anim });
      label(id, x + 75, y + 18);
    });
    (['navie', 'ligaya', 'sinta'] as const).forEach((id, row) => {
      (['idle', 'worried', 'determined', 'surprised', 'hurt', 'celebrate'] as const).forEach((expr, col) => {
        drawCharacter(ctx, id, 90 + col * 200, 1620 + row * 200, 170, { expr, anim });
        if (row === 0) {
          label(expr, 90 + col * 200, 1450);
        }
      });
    });
    SIDEKICKS.forEach((id, i) => {
      const x = 80 + (i % 7) * 176;
      const y = 800 + Math.floor(i / 7) * 172;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(0.72, 0.72);
      drawSidekick(ctx, id as SidekickId, { expr: 'idle', t: 0, blink: 0, talk: 0, lookX: 0, evolved: false, action: 0 });
      ctx.restore();
      label(id, x, y + 18);
    });
  });
}

/** One character, large, in several expressions and at every angle it has: ?sheet=close&who=navie */
function closeUp(): void {
  const who = new URLSearchParams(location.search).get('who') ?? 'navie';
  const hero = (HEROES as readonly string[]).includes(who);
  const prefix = hero ? 'h' : 's';
  const names = ['front', 'face', 'q', 'q2'].map((v) => `${prefix}.${who}.${v}`);
  const { canvas, ctx } = makeCanvas(1240, 860, 1);
  document.body.appendChild(canvas);
  ctx.fillStyle = '#E9DFC6';
  ctx.fillRect(0, 0, 1240, 860);
  void preload(names).then(() => {
    // &talk=0.8 shows a talking mouth.
    const anim = { t: 0, blink: 0, talk: Number(new URLSearchParams(location.search).get('talk') ?? 0), lookX: 0, lookY: 0 };
    (['idle', 'happy', 'determined', 'worried', 'celebrate', 'hurt'] as const).forEach((expr, i) => {
      const x = 215 + (i % 3) * 405;
      const y = 400;
      if (i < 3) {
        if (hero) {
          drawCharacter(ctx, who as HeroId, x, y, 370, { expr, anim });
        } else {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(1.45, 1.45);
          drawSidekick(ctx, who as SidekickId, { expr, t: 0, blink: 0, talk: 0, lookX: 0, evolved: false, action: 0 });
          ctx.restore();
        }
      }
    });
    (['worried', 'celebrate', 'hurt', 'surprised', 'idle', 'idle'] as const).forEach((expr, i) => {
      const x = 110 + i * 205;
      const y = 830;
      const yaw = i === 4 ? 0 : i === 5 ? 35 : 15;
      if (hero) {
        drawCharacter(ctx, who as HeroId, x, y, 190, { expr, anim, yaw });
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(0.8, 0.8);
        drawSidekick(ctx, who as SidekickId, { expr, t: 0, blink: expr === 'idle' && i === 5 ? 0.6 : 0, talk: 0, lookX: 0, evolved: false, action: 0, yaw });
        ctx.restore();
      }
    });
  });
}

/** Everyone large, for judging faces: ?sheet=big&who=heroes|kicks&expr=idle&yaw=15&from=0&count=12 */
function bigSheet(): void {
  const q = new URLSearchParams(location.search);
  const heroes = q.get('who') !== 'kicks';
  const expr = (q.get('expr') ?? 'idle') as (typeof EXPRESSIONS)[number];
  const yaw = Number(q.get('yaw') ?? 15);
  const from = Number(q.get('from') ?? 0);
  const count = Number(q.get('count') ?? (heroes ? 12 : 27));
  const list = (heroes ? HEROES : SIDEKICKS).slice(from, from + count);
  const cols = heroes ? 4 : 6;
  const cell = heroes ? 310 : 206;
  const tall = heroes ? 350 : 262;
  const rows = Math.ceil(list.length / cols);
  const { canvas, ctx } = makeCanvas(cols * cell, rows * tall, 1);
  document.body.appendChild(canvas);
  ctx.fillStyle = '#E9DFC6';
  ctx.fillRect(0, 0, cols * cell, rows * tall);
  const views = ['face', 'front', 'q', 'q2', 'frontR', 'qR', 'q2R', 'evo'];
  void preload(list.flatMap((id) => views.map((v) => `${heroes ? 'h' : 's'}.${id}.${v}`))).then(() => {
    const anim = { t: 0, blink: 0, talk: 0, lookX: 0, lookY: 0 };
    list.forEach((id, i) => {
      const x = cell / 2 + (i % cols) * cell;
      const y = (Math.floor(i / cols) + 1) * tall - 26;
      if (heroes) {
        drawCharacter(ctx, id as HeroId, x, y, 268, { expr, anim, yaw });
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(0.98, 0.98);
        drawSidekick(ctx, id as SidekickId, { expr, t: 0, blink: 0, talk: 0, lookX: 0, evolved: q.get('evo') === '1', action: 0, yaw });
        ctx.restore();
      }
      ctx.fillStyle = '#354844';
      ctx.font = '700 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(id, x, y + 18);
    });
  });
}

export function runDevSheet(name: string): void {
  if (name === 'big') {
    bigSheet();
  } else if (name === 'close') {
    closeUp();
  } else if (name === 'drive') {
    drive();
  } else if (name === 'faces') {
    faces();
  } else {
    roster();
  }
}
