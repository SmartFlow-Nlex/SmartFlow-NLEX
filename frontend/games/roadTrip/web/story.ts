import type { SceneBackdrop, SceneLine, StoryScene as StoryDef } from '../core/dialogue';
import { isMachine, type CharacterId, type Expression, type SaveData } from '../core/types';
import { art, blinkAt, characterSprite, drawCharacter, drawSidekick, preload, softShadow, tinted } from './art/clay';
import { makeCanvas, rgba, roundRect, shade } from './art/kit';
import { C } from './art/palette';
import { drawGantry, drawParolStar } from './art/scenery';
import { MOODS, Roadscape, type Landmark } from './render/roadscape';
import type { Camera } from './render/camera';
import type { Mood } from '../core/moods';
import type { Scene } from './appApi';
import { GarageScene } from './scenes';

/**
 * A story scene, staged (second pass, 24 Oct). The camera sits close: less
 * sky, the cast large and staggered in depth (front, middle, back) so each
 * has a place, a facing and a reaction. The speaker talks only while their
 * line is still being written out, everyone blinks and idles on their
 * suspension, and lines can carry a bit of action - Kiko's engine coughing
 * (shake, uneven idle, exhaust puffs), a hop, Jepoy's horn, a gift.
 */

interface Staged {
  id: CharacterId;
  x: number;
  depth: number;
  face: 1 | -1;
}

const ACTION_S = 1.4;

export class StoryScene implements Scene {
  private width = 390;
  private height = 844;
  private dpr = 1;
  private t = 0;
  private background: HTMLCanvasElement | null = null;
  private readonly scape = new Roadscape();
  private artReady = false;
  private garage: GarageScene | null = null;
  private readonly staged: Staged[];
  private line: SceneLine | null = null;
  private talking = false;
  private actionT = 99;
  private lastExpr = new Map<CharacterId, Expression>();
  /** Seconds since Kiko handed over the parol (-1: not yet, or put away). */
  private giftT = -1;
  private puffs: { x: number; y: number; vx: number; vy: number; life: number; r: number }[] = [];

  constructor(
    private readonly backdrop: SceneBackdrop,
    cast: CharacterId[],
    getSave: () => SaveData,
    private readonly reduceMotion: () => boolean,
    stage: StoryDef['stage'] = undefined,
    private readonly extra: Pick<StoryDef, 'sign' | 'time' | 'landmark' | 'guest'> = {},
  ) {
    void preload([...cast.map((id) => characterSprite(id)), ...(extra.guest !== undefined ? [`s.${extra.guest}.front`] : []), ...this.scenery().map(([n]) => `w.${n}`), 'b.hillsFar', 'b.hillsNear', 'b.arayat', 'b.pinatubo', 'b.skyline', 'c.cloud0', 'c.cloud1', 'c.cloud2']).then(() => {
      this.artReady = true;
      this.background = null;
    });
    this.scape.setMood(this.moodOf(), this.landmarkOf());
    if (backdrop === 'garage') {
      this.garage = new GarageScene(getSave);
      // The story stages its own cast; the garage only provides the room (else Navie stands there twice).
      this.garage.cast = false;
    }
    const people = cast.filter((id) => id !== 'radio' && !isMachine(id));
    this.staged = people.map((id, i) => {
      const given = stage?.[id];
      // Default staging: alternate front and back so nobody stands in a flat row.
      return given !== undefined
        ? { id, ...given }
        : { id, x: (i + 1) / (people.length + 1), depth: i % 2 === 0 ? 0.9 : 0.55, face: (i < people.length / 2 ? 1 : -1) as 1 | -1 };
    });
    const machine = cast.find((id) => isMachine(id));
    if (machine !== undefined) {
      this.staged.unshift({ id: machine, x: 0.5, depth: 0, face: 1 });
    }
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.background = null;
    this.scape.resize(dpr);
    this.garage?.resize(width, height, dpr);
  }

  private moodOf(): Mood {
    switch (this.backdrop) {
      case 'plaza':
      case 'fiesta':
        return 'lantern';
      case 'meycauayan':
        return 'morning';
      case 'marilao':
      case 'arena':
        return 'town';
      case 'exit':
        return this.extra.time === 'sunset' ? 'lantern' : this.extra.time === 'morning' ? 'morning' : 'town';
      default:
        return 'morning';
    }
  }

  private landmarkOf(): Landmark {
    if (this.backdrop === 'exit') {
      return this.extra.landmark ?? 'none';
    }
    return this.backdrop === 'arena' || this.backdrop === 'plaza' || this.backdrop === 'fiesta' ? 'plaza' : 'none';
  }

  /** What stands behind the cast, by place: [sprite, x across the width, how far back (0 near - 1 far), size]. */
  private scenery(): [string, number, number, number][] {
    switch (this.backdrop) {
      case 'layby':
        return [['narra', 0.14, 0.72, 1.2], ['sos', 0.86, 0.3, 1.1], ['hedge', 0.32, 0.5, 1.0], ['banana', 0.72, 0.68, 0.95]];
      case 'meycauayan':
        return [['nipa', 0.16, 0.7, 1.05], ['mango', 0.84, 0.72, 1.2], ['haystack', 0.32, 0.62, 0.7], ['carabao', 0.66, 0.5, 0.7]];
      case 'marilao':
        return [['shop', 0.13, 0.7, 1.05], ['sari', 0.84, 0.62, 1.05], ['pole', 0.36, 0.72, 1.0], ['lamp', 0.64, 0.6, 1.0]];
      case 'arena':
        return [['billboard', 0.18, 0.7, 1.15], ['stall', 0.82, 0.58, 1.0], ['lamp', 0.5, 0.72, 1.1], ['flowers', 0.34, 0.42, 0.9]];
      case 'plaza':
        return [['parolPost', 0.14, 0.66, 1.1], ['parolPost', 0.86, 0.66, 1.1], ['stall', 0.3, 0.72, 0.8]];
      case 'fiesta':
        return [['stall', 0.16, 0.6, 1.1], ['parolPost', 0.84, 0.6, 1.15], ['stall', 0.72, 0.74, 0.8], ['parolPost', 0.3, 0.76, 0.9]];
      case 'exit':
        return this.extra.landmark === 'lanterns'
          ? [['parolPost', 0.15, 0.62, 1.15], ['parolPost', 0.85, 0.62, 1.15], ['shop', 0.3, 0.75, 0.85]]
          : [['mango', 0.13, 0.7, 1.15], ['signExit', 0.86, 0.5, 1.15], ['bamboo', 0.34, 0.74, 0.95], ['hedge', 0.66, 0.5, 0.9]];
      default:
        return [];
    }
  }

  /** A new line: its speaker, expression, reactions and action. */
  setLine(line: SceneLine): void {
    this.line = line;
    this.lastExpr.set(line.speaker, line.expr);
    for (const [id, expr] of Object.entries(line.react ?? {})) {
      this.lastExpr.set(id as CharacterId, expr as Expression);
    }
    this.actionT = line.action !== undefined ? 0 : 99;
    // The gift stays in view until the mood changes.
    if (line.action === 'gift') {
      this.giftT = 0;
    } else if (line.expr === 'worried') {
      this.giftT = -1;
    }
  }

  /** The mouth moves only while the line is being written out. */
  setTalking(talking: boolean): void {
    this.talking = talking;
  }

  get speaker(): CharacterId | null {
    return this.line?.speaker ?? null;
  }

  /** Screen x of a character, for the dialogue box's pointer (CSS px), or null. */
  speakerX(): number | null {
    const id = this.speaker;
    const s = this.staged.find((p) => p.id === id);
    return s !== undefined ? s.x * this.width : null;
  }

  // -- layout ------------------------------------------------------------------

  private get horizon(): number {
    return this.height * (this.backdrop === 'fiesta' ? 0.36 : 0.3);
  }

  /** The ground line where the front row stands. */
  private get front(): number {
    // Clear of the dialogue box (about 220 px tall) on short phones.
    return Math.min(this.height * 0.72, this.height - 225);
  }

  private place(p: Staged): { x: number; y: number; size: number } {
    const w = this.width;
    const h = this.height;
    const base = Math.min(w * 0.42, h * 0.23);
    const k = 0.7 + 0.3 * p.depth;
    return { x: p.x * w, y: this.front - (1 - p.depth) * h * 0.07, size: base * k };
  }

  // -- backdrop ----------------------------------------------------------------

  /** One still picture of the place, in the same light as the road. */
  private ensureBackground(): HTMLCanvasElement {
    if (this.background !== null) {
      return this.background;
    }
    const w = this.width;
    const h = this.height;
    const horizon = this.horizon;
    const front = this.front;
    const { canvas, ctx } = makeCanvas(w, h, Math.min(2, this.dpr));
    const look = MOODS[this.moodOf()];
    const cam: Camera = { width: w, height: h, horizonY: horizon, playerY: front, centreX: w / 2, lane0: w * 0.26, depth: 7, camX: 0, curve: 0, landscape: false };
    this.scape.drawSky(ctx, cam, 0);
    // The same ground as the road, with the cast standing on it.
    this.scape.drawGround(ctx, cam, 3, -3);
    const yRoad = horizon + (front - horizon) * 0.32;
    const items = [...this.scenery()].sort((a, b) => b[2] - a[2]);
    for (const [name, x, depth, size] of items) {
      const s = art(`w.${name}`);
      if (s === null) {
        continue;
      }
      const y = yRoad + (front - yRoad) * (1 - depth) * 0.72;
      const unit = (w * 0.16 * size * (1.25 - depth * 0.55)) / 2.2;
      const k = unit / s.ppu;
      softShadow(ctx, x * w, y, s.w * k * 0.5, s.w * k * 0.09, 0.22);
      // Whatever stands to the side is pushed out past the road.
      ctx.drawImage(tinted(s, look.tint), x * w - s.ax * k, y - s.ay * k, s.w * k, s.h * k);
    }
    // A named place gets its overhead sign; the plaza gets its canopy lamps.
    if (this.backdrop === 'exit' || this.backdrop === 'meycauayan' || this.backdrop === 'marilao') {
      const name = this.backdrop === 'exit' ? this.extra.sign ?? 'Exit' : this.backdrop === 'meycauayan' ? 'Meycauayan' : 'Marilao';
      drawGantry(ctx, w * 0.14, w * 0.86, yRoad + 2, w * 0.13, name, 'Exit');
    }
    if (this.artReady) {
      this.background = canvas;
    }
    return canvas;
  }

  // -- drawing -----------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D, _t: number, dt: number): void {
    this.t += dt;
    this.actionT += dt;
    const w = this.width;
    const h = this.height;
    const still = this.reduceMotion();
    if (this.garage !== null) {
      this.garage.draw(ctx, 0, 0);
      ctx.fillStyle = 'rgba(10,22,41,0.12)';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.drawImage(this.ensureBackground(), 0, 0, w, h);
    }
    if (this.backdrop === 'fiesta') {
      const colours = [C.yellow, '#E2453C', '#2BB3A3', '#FF8FA3', '#5FD3FF'];
      for (let i = 0; i < 7; i += 1) {
        const glow = still ? 0.45 : 0.35 + 0.2 * Math.sin(this.t * 1.2 + i);
        drawParolStar(ctx, w * (0.08 + i * 0.14), h * (0.1 + (i % 2) * 0.05), Math.min(w, h) * 0.035, colours[i % colours.length], glow);
      }
    }

    const line = this.line;
    const action = line?.action;
    const acting = this.actionT < ACTION_S;
    const speaker = this.speaker;
    const speakerStage = this.staged.find((p) => p.id === speaker);
    // Back to front.
    const order = [...this.staged].sort((a, b) => a.depth - b.depth);
    for (const p of order) {
      const { x, y, size } = this.place(p);
      if (isMachine(p.id)) {
        const big = Math.min(w * 0.36, h * 0.22);
        drawCharacter(ctx, p.id, w / 2, this.front - h * 0.1, big, {
          expr: speaker === p.id ? line!.expr : this.lastExpr.get(p.id) ?? 'determined',
          anim: { t: this.t, blink: 0, talk: 0, lookX: 0, lookY: 0 },
          hop: speaker === p.id && this.talking && !still ? Math.abs(Math.sin(this.t * 6)) * 4 : 0,
        });
        continue;
      }
      const speaking = speaker === p.id;
      const expr = speaking ? line!.expr : this.lastExpr.get(p.id) ?? 'idle';
      // Suspension: a gentle idle bob for everyone, a livelier one for the speaker.
      let hop = still ? 0 : (Math.sin(this.t * 2.2 + p.x * 9) + 1) * 1.5 + (speaking && this.talking ? Math.abs(Math.sin(this.t * 9)) * 4 : 0);
      let tilt = 0;
      let shakeX = 0;
      // Kiko's weak engine: an uneven idle in the lay-by, a full cough on "sputter" lines.
      const kikoWeak = p.id === 'kiko' && this.backdrop === 'layby';
      if (kikoWeak && !still) {
        const rough = Math.max(0, Math.sin(this.t * 7.1) * Math.sin(this.t * 2.3));
        shakeX += rough * 1.6;
        tilt += rough * 0.015;
      }
      if (acting && line !== null) {
        const k = 1 - this.actionT / ACTION_S;
        if (action === 'sputter' && p.id === line.speaker && !still) {
          shakeX += Math.sin(this.actionT * 55) * 5 * k;
          tilt += Math.sin(this.actionT * 31) * 0.05 * k;
          hop += Math.abs(Math.sin(this.actionT * 18)) * 6 * k;
        } else if ((action === 'hop' || action === 'honk') && p.id === line.speaker && !still) {
          hop += Math.abs(Math.sin(this.actionT * 7)) * 18 * k;
        }
      }
      // Exhaust puffs: Kiko coughs, or idles roughly now and then.
      if (p.id === 'kiko' && dt > 0) {
        const coughing = acting && action === 'sputter' && line?.speaker === 'kiko';
        const chance = coughing ? dt * 22 : kikoWeak ? dt * 1.2 : 0;
        if (Math.random() < chance) {
          this.puffs.push({ x: x + size * 0.32, y: y - size * 0.12, vx: size * (0.1 + Math.random() * 0.15), vy: -size * (0.15 + Math.random() * 0.1), life: 1, r: size * (0.04 + Math.random() * 0.03) });
        }
      }
      // Who they look at: the speaker; the speaker looks at whoever they face.
      const target = speaking ? null : speakerStage;
      const lookX = target !== undefined && target !== null ? Math.sign(target.x - p.x) * 0.5 : p.face * 0.35;
      if (!speaking && speaker !== null && speaker !== 'radio') {
        ctx.globalAlpha = 0.94;
      }
      drawCharacter(ctx, p.id, x + shakeX, y, size * (speaking ? 1.03 : 1), {
        expr: expr === 'speaking' && !speaking ? 'idle' : expr,
        anim: {
          t: this.t,
          blink: blinkAt(this.t, p.x * 10 + 1),
          talk: speaking && this.talking ? 0.5 + 0.5 * Math.sin(this.t * 16) : 0,
          lookX,
          lookY: 0,
        },
        hop,
        tilt,
      });
      ctx.globalAlpha = 1;
      // The speaker's marker: a small yellow chevron over their head.
      if (speaking) {
        const my = y - size * 1.08 - hop * (size / 200);
        ctx.fillStyle = C.yellow;
        ctx.strokeStyle = '#6B4A00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.06, my - size * 0.06);
        ctx.lineTo(x + size * 0.06, my - size * 0.06);
        ctx.lineTo(x, my + size * 0.02);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Jepoy's horn.
      if (acting && action === 'honk' && p.id === 'jepoy' && line?.speaker === 'jepoy') {
        const k = Math.min(1, this.actionT / 0.3);
        ctx.globalAlpha = Math.max(0, 1 - this.actionT / ACTION_S);
        roundRect(ctx, x - size * 0.3, y - size * 1.42, size * 0.6, size * 0.2, size * 0.08);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = C.jepoyBody;
        ctx.stroke();
        ctx.font = `900 ${size * 0.12 * (0.8 + 0.2 * k)}px "Nunito Black", system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.jepoyBody;
        ctx.fillText('BEEP BEEP!', x, y - size * 1.32);
        ctx.globalAlpha = 1;
      }
    }
    // The sidekick this scene introduces: small, hovering over the cast's heads.
    if (this.extra.guest !== undefined) {
      const base = Math.min(w * 0.42, h * 0.23);
      const bob = still ? 0 : Math.sin(this.t * 2.2) * 5;
      ctx.save();
      // Beside a machine rather than on top of it.
      const beside = this.staged.some((p) => isMachine(p.id));
      const scale = (base * 0.62) / 175;
      // Below the title pill even on a short, wide screen.
      const gy = Math.max(52 + 190 * scale, this.front - base * (beside ? 1.72 : 1.32));
      ctx.translate(w * (beside ? 0.84 : 0.5), gy + bob);
      ctx.scale(scale, scale);
      drawSidekick(ctx, this.extra.guest, { expr: 'happy', t: this.t, blink: blinkAt(this.t, 3), talk: 0, lookX: 0, evolved: false, action: 0 });
      ctx.restore();
    }
    // A gift: Lola's parol rises between Kiko and Navie and glows.
    if (this.giftT >= 0) {
      const kiko = this.staged.find((p) => p.id === 'kiko');
      const navie = this.staged.find((p) => p.id === 'navie');
      if (kiko !== undefined && navie !== undefined) {
        const a = this.place(kiko);
        const b = this.place(navie);
        this.giftT += dt;
        const k = Math.min(1, this.giftT / 1.2);
        const gx = a.x + (b.x - a.x) * 0.5;
        const gy = Math.min(a.y, b.y) - a.size * (0.9 + 0.35 * k);
        drawParolStar(ctx, gx, gy, a.size * 0.16, C.kikoTeal, still ? 0.6 : 0.5 + 0.2 * Math.sin(this.t * 3));
      }
    }
    // Puffs.
    for (const puff of this.puffs) {
      puff.life -= dt * 1.1;
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.r += dt * puff.r * 0.9;
      ctx.fillStyle = rgba('#8A929C', Math.max(0, puff.life) * 0.55);
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
      ctx.fill();
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
    // The radio, when it speaks.
    if (speaker === 'radio') {
      roundRect(ctx, w * 0.74, h * 0.15, w * 0.22, w * 0.2, 14);
      ctx.fillStyle = rgba('#FFFFFF', 0.9);
      ctx.fill();
      drawCharacter(ctx, 'radio', w * 0.85, h * 0.15 + w * 0.17, Math.min(w, h) * 0.15, {
        expr: 'speaking',
        anim: { t: this.t, blink: 0, talk: 0, lookX: 0, lookY: 0 },
      });
    }
    void shade;
  }

  dispose(): void {
    this.background = null;
    this.garage?.dispose();
  }
}
