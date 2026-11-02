import type { SceneBackdrop, SceneLine, StoryScene as StoryDef } from '../core/dialogue';
import { isMachine, type CharacterId, type Expression, type SaveData } from '../core/types';
import { blinkAt, drawCharacter } from './art/cast';
import { drawSidekick } from './art/sidekicks';
import { groundShadow, makeCanvas, rgba, roundRect, shade, vgrad } from './art/kit';
import { C, TIMES } from './art/palette';
import { drawRoadside, drawTreeLine, drawWarmLight, ROADSIDE_BOX, type RoadsideKind } from './art/roadside';
import { drawGantry, drawGround, drawParolStar, drawProp, drawSkyLayer, drawTollPlaza, type Landmark } from './art/scenery';
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
    this.garage?.resize(width, height, dpr);
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

  private ensureBackground(): HTMLCanvasElement {
    if (this.background !== null) {
      return this.background;
    }
    const w = this.width;
    const h = this.height;
    const horizon = this.horizon;
    const front = this.front;
    const { canvas, ctx } = makeCanvas(w, h, this.dpr);
    const prop = (kind: RoadsideKind, x: number, y: number, size: number, variant = 1): void => {
      const box = ROADSIDE_BOX[kind];
      ctx.save();
      ctx.translate(x, y);
      const s = size / 200;
      ctx.scale(s, s);
      void box;
      drawRoadside(ctx, kind, variant);
      ctx.restore();
    };
    const sky = (time: keyof typeof TIMES, landmark: Landmark): void => {
      drawSkyLayer(ctx, w, horizon, time, landmark);
      drawTreeLine(ctx, w, horizon, time);
      drawGround(ctx, w, h, horizon, time);
    };
    /** The expressway crossing behind the cast: carriageway, median wall, guardrail. */
    const expressway = (y0: number, y1: number): void => {
      ctx.fillStyle = C.asphalt;
      ctx.fillRect(0, y0, w, y1 - y0);
      ctx.fillStyle = '#F4F7FB';
      for (let x = 0; x < w; x += 46) {
        ctx.fillRect(x, (y0 + y1) / 2 - 1.5, 24, 3);
      }
      ctx.fillStyle = '#C3CAD3';
      ctx.fillRect(0, y0 - (y1 - y0) * 0.16, w, (y1 - y0) * 0.16);
      ctx.fillStyle = '#EEF2F6';
      ctx.fillRect(0, y0 - (y1 - y0) * 0.16, w, 2);
    };
    const guardrail = (y: number, post: number): void => {
      ctx.fillStyle = '#6F7B8A';
      for (let x = 6; x < w; x += post * 3.2) {
        ctx.fillRect(x, y - post, post * 0.18, post);
      }
      ctx.fillStyle = '#AEB8C4';
      ctx.fillRect(0, y - post * 0.95, w, post * 0.4);
      ctx.fillStyle = '#F4F7FA';
      ctx.fillRect(0, y - post * 0.95, w, 2);
    };
    const pavement = (y: number): void => {
      ctx.fillStyle = vgrad(ctx, y, h, [
        [0, '#B9C1CB'],
        [1, '#9AA4B1'],
      ]);
      ctx.fillRect(0, y, w, h - y);
    };

    switch (this.backdrop) {
      case 'garage':
        break;
      case 'layby': {
        // A roadside assistance lay-by beside NLEX at noon: trees and a kiosk behind,
        // the expressway beyond the guardrail, the bay with its markings in front.
        sky('noon', 'arena');
        const roadTop = horizon + (front - horizon) * 0.18;
        const roadBottom = horizon + (front - horizon) * 0.42;
        prop('pylon', w * 0.82, horizon + 6, h * 0.16, 0);
        prop('acaciaBig', w * 0.1, roadTop, w * 0.42, 1);
        prop('bamboo', w * 0.95, roadTop, w * 0.34, 2);
        expressway(roadTop, roadBottom);
        guardrail(roadBottom + (front - horizon) * 0.06, w * 0.03);
        pavement(roadBottom + (front - horizon) * 0.06);
        // The assistance kiosk.
        const kx = w * 0.62;
        const ky = roadBottom + (front - horizon) * 0.12;
        const kw = w * 0.34;
        const kh = h * 0.07;
        groundShadow(ctx, kx + kw / 2, ky + 2, kw * 0.6, kh * 0.12, 0.28);
        ctx.fillStyle = '#EEF2F6';
        ctx.fillRect(kx, ky - kh, kw, kh);
        ctx.fillStyle = C.nlexBlue;
        ctx.beginPath();
        ctx.moveTo(kx - kw * 0.06, ky - kh);
        ctx.lineTo(kx + kw * 0.5, ky - kh * 1.45);
        ctx.lineTo(kx + kw * 1.06, ky - kh);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#5C86C2';
        ctx.fillRect(kx + kw * 0.08, ky - kh * 0.72, kw * 0.32, kh * 0.4);
        ctx.fillStyle = '#7A5A38';
        ctx.fillRect(kx + kw * 0.62, ky - kh * 0.78, kw * 0.22, kh * 0.78);
        roundRect(ctx, kx + kw * 0.06, ky - kh * 1.08 - h * 0.028, kw * 0.88, h * 0.03, 5);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        // Sized to fit its board.
        let fontPx = Math.max(8, w * 0.028);
        ctx.font = `900 ${fontPx}px "Nunito Black", system-ui`;
        const maxText = kw * 0.8;
        const measured = ctx.measureText('ROADSIDE ASSISTANCE').width;
        if (measured > maxText) {
          fontPx *= maxText / measured;
          ctx.font = `900 ${fontPx}px "Nunito Black", system-ui`;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.navy;
        ctx.fillText('ROADSIDE ASSISTANCE', kx + kw / 2, ky - kh * 1.08 - h * 0.013);
        // Bay markings and the SOS box at the bay's edge.
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 10]);
        ctx.beginPath();
        ctx.moveTo(0, front - h * 0.1);
        ctx.lineTo(w, front - h * 0.1);
        ctx.stroke();
        ctx.setLineDash([]);
        prop('sos', w * 0.06, front - h * 0.1, w * 0.2, 0);
        prop('hedge', w * 0.42, ky, w * 0.3, 0);
        break;
      }
      case 'meycauayan':
      case 'marilao': {
        const time = this.backdrop === 'meycauayan' ? 'morning' : 'noon';
        sky(time, time === 'noon' ? 'arena' : 'city');
        const roadTop = horizon + (front - horizon) * 0.22;
        const roadBottom = horizon + (front - horizon) * 0.5;
        prop('mango', w * 0.08, roadTop, w * 0.4, 0);
        prop('palmTall', w * 0.94, roadTop, w * 0.36, 1);
        expressway(roadTop, roadBottom);
        drawGantry(ctx, w * 0.14, w * 0.86, roadTop + 2, w * 0.13, this.backdrop === 'meycauayan' ? 'Meycauayan' : 'Marilao', 'Exit');
        guardrail(roadBottom + (front - horizon) * 0.06, w * 0.03);
        pavement(roadBottom + (front - horizon) * 0.06);
        prop('hedge', w * 0.8, roadBottom + (front - horizon) * 0.1, w * 0.32, 1);
        break;
      }
      case 'exit': {
        // Any exit on the road: its own sign, its own light, and what is on the horizon there.
        sky(this.extra.time ?? 'noon', this.extra.landmark ?? 'none');
        const roadTop = horizon + (front - horizon) * 0.22;
        const roadBottom = horizon + (front - horizon) * 0.5;
        prop('acaciaBig', w * 0.08, roadTop, w * 0.4, 0);
        prop('palmTall', w * 0.94, roadTop, w * 0.36, 1);
        expressway(roadTop, roadBottom);
        drawGantry(ctx, w * 0.14, w * 0.86, roadTop + 2, w * 0.13, this.extra.sign ?? 'NLEX', 'Exit');
        guardrail(roadBottom + (front - horizon) * 0.06, w * 0.03);
        pavement(roadBottom + (front - horizon) * 0.06);
        prop('hedge', w * 0.8, roadBottom + (front - horizon) * 0.1, w * 0.32, 1);
        break;
      }
      case 'arena': {
        sky('noon', 'arena');
        const y = horizon + (front - horizon) * 0.3;
        prop('acaciaBig', w * 0.06, y, w * 0.42, 0);
        prop('palmTall', w * 0.96, y, w * 0.36, 0);
        pavement(y);
        // An empty stage, waiting for the fiesta.
        roundRect(ctx, w * 0.22, y - h * 0.09, w * 0.56, h * 0.09, 8);
        ctx.fillStyle = '#5A4A6E';
        ctx.fill();
        roundRect(ctx, w * 0.2, y - h * 0.125, w * 0.6, h * 0.04, 6);
        ctx.fillStyle = C.danger;
        ctx.fill();
        ctx.font = `900 ${Math.max(10, w * 0.035)}px "Nunito Black", system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('ARENA FIESTA', w / 2, y - h * 0.105);
        break;
      }
      case 'plaza': {
        sky('sunset', 'none');
        ctx.fillStyle = C.asphalt;
        ctx.fillRect(0, horizon + (front - horizon) * 0.3, w, h);
        drawTollPlaza(ctx, w * 0.12, w * 0.88, horizon + (front - horizon) * 0.55, w * 0.18, false, this.extra.sign?.toUpperCase());
        break;
      }
      case 'fiesta': {
        // Evening: lanterns and flags, gently twinkling (drawn live below). At the Arena, its dome;
        // further north, what is on that horizon instead.
        ctx.fillStyle = vgrad(ctx, 0, h, [
          [0, '#1E2A5A'],
          [0.5, '#5A3E7A'],
          [1, '#2A2440'],
        ]);
        ctx.fillRect(0, 0, w, h);
        const ground = horizon + h * 0.04;
        if (this.extra.landmark === 'pinatubo') {
          ctx.beginPath();
          ctx.moveTo(0, ground);
          ctx.lineTo(w * 0.3, ground - h * 0.14);
          ctx.lineTo(w * 0.42, ground - h * 0.12);
          ctx.lineTo(w * 0.52, ground - h * 0.15);
          ctx.lineTo(w, ground - h * 0.02);
          ctx.lineTo(w, ground);
          ctx.closePath();
          ctx.fillStyle = '#463C6E';
          ctx.fill();
        } else if (this.extra.landmark === 'lanterns') {
          // A town's rooftops, with the lit windows of a lantern city.
          const roof = w / 7;
          for (let i = 0; i < 7; i += 1) {
            const top = ground - h * (0.05 + ((i * 5) % 3) * 0.018);
            ctx.fillStyle = i % 2 === 0 ? '#3F3768' : '#4A4074';
            ctx.beginPath();
            ctx.moveTo(i * roof, ground);
            ctx.lineTo(i * roof, top);
            ctx.lineTo((i + 0.5) * roof, top - h * 0.025);
            ctx.lineTo((i + 1) * roof, top);
            ctx.lineTo((i + 1) * roof, ground);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#FFD27A';
            ctx.fillRect((i + 0.38) * roof, top + h * 0.012, roof * 0.24, h * 0.014);
          }
        } else {
          ctx.beginPath();
          ctx.ellipse(w * 0.5, ground, w * 0.42, h * 0.16, 0, Math.PI, 0);
          ctx.fillStyle = '#C9D3DE';
          ctx.fill();
        }
        ctx.fillStyle = '#3A3550';
        ctx.fillRect(0, horizon + h * 0.04, w, h);
        break;
      }
    }
    if (this.backdrop !== 'garage' && this.backdrop !== 'fiesta') {
      drawWarmLight(ctx, w, h, horizon, this.backdrop === 'plaza' ? 'sunset' : this.backdrop === 'exit' ? this.extra.time ?? 'noon' : 'noon');
    }
    void drawProp;
    this.background = canvas;
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
