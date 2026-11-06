import { MISSIONS } from '../core/missions';
import { barrierOpen, workshopOpen } from '../core/progression';
import { earnedCharms } from '../core/unlocks';
import { JOURNEY, SIDEKICKS, type CharacterId, type Expression, type HeroId, type SaveData, type SidekickId } from '../core/types';
import { art, blinkAt, characterSprite, drawCharacter, drawSidekick, preload, softShadow } from './art/clay';
import { makeCanvas } from './art/kit';
import type { Scene } from './appApi';

/**
 * Canvas scenes for the garage and the map. The garage is one baked room; what
 * changes with progress (postcards on the board, charms, bunting, whoever has
 * joined) is drawn on it, in the room's own light.
 */

interface GarageLayout {
  width: number;
  height: number;
  floorY: number;
  carSize: number;
  /** Where the baked room lands on screen. */
  room: { x: number; y: number; k: number };
}

function garageLayout(width: number, height: number): GarageLayout {
  const landscape = width > height;
  const carSize = landscape ? Math.min(height * 0.42, width * 0.22) : Math.min(width * 0.42, height * 0.215);
  const floorY = height * (landscape ? 0.84 : 0.64);
  // The room's floor line (a known height in the picture) sits under the cars, and the width fills the screen.
  const sprite = art('b.garage');
  const w = sprite?.w ?? 781;
  const h = sprite?.h ?? 948;
  const k = Math.max(width / w, (height * 0.98) / h);
  // The bays' floor sits under the cars.
  const roomFloor = sprite?.points?.floor !== undefined ? sprite.points.floor[1] / h : 0.86;
  const y = Math.max(height - h * k, Math.min(0, floorY + carSize * 0.1 - h * k * roomFloor));
  return { width, height, floorY, carSize, room: { x: (width - w * k) / 2, y, k } };
}

interface Actor {
  id: CharacterId;
  expr: Expression;
  /** Seconds left of an arrival drive-in. */
  arriving: number;
  sleeping: boolean;
}

/** Everything the garage might show: decoded up front, so the room appears whole. */
export function garageArt(save: SaveData): string[] {
  const names = ['b.garage', 'p.postcard', 'd.parol', 'd.sampaguita', 'd.token'];
  for (const id of save.heroes) {
    names.push(characterSprite(id));
  }
  for (const id of Object.keys(save.sidekicks) as SidekickId[]) {
    names.push(`s.${id}.front`);
    if (save.sidekicks[id]?.evolved === true) {
      names.push(`s.${id}.evo`);
    }
  }
  return names;
}

export class GarageScene implements Scene {
  private layout: GarageLayout = garageLayout(390, 844);
  private background: HTMLCanvasElement | null = null;
  private dpr = 1;
  private t = 0;
  private actors = new Map<CharacterId, Actor>();
  /** Who is talking (for the bubble) and how. */
  speaker: { id: CharacterId; expr: Expression } | null = null;
  dim = 0;
  /** False on the title and Team stages, which stand their own line-up in front of the room. */
  cast = true;
  private idle = 0;
  private ready = false;

  constructor(private readonly getSave: () => SaveData) {
    this.syncActors();
    void preload(garageArt(getSave())).then(() => {
      this.ready = true;
      this.background = null;
      this.layout = garageLayout(this.layout.width, this.layout.height);
    });
  }

  syncActors(): void {
    const save = this.getSave();
    for (const id of save.heroes) {
      if (!this.actors.has(id)) {
        this.actors.set(id, { id, expr: 'idle', arriving: 0, sleeping: false });
      }
    }
    this.background = null;
  }

  /** Plays a friend's drive-in. */
  arrive(id: HeroId): void {
    this.syncActors();
    const actor = this.actors.get(id);
    if (actor !== undefined) {
      actor.arriving = 2.2;
      actor.expr = 'happy';
    }
  }

  setExpression(id: CharacterId, expr: Expression): void {
    const actor = this.actors.get(id);
    if (actor !== undefined) {
      actor.expr = expr;
    }
    this.idle = 0;
  }

  /**
   * Who stands where. The chosen hero in front, in the middle; up to four friends
   * behind, whoever is speaking always among them. The room never gets crowded,
   * however many heroes have joined.
   */
  private parking(): { id: CharacterId; x: number; y: number; size: number }[] {
    const save = this.getSave();
    const { width, floorY, carSize } = this.layout;
    const chosen = save.loadout.hero;
    const speaker = this.speaker?.id;
    const others = save.heroes.filter((h) => h !== chosen);
    const speaking = others.filter((h) => h === speaker);
    const arriving = others.filter((h) => this.actors.get(h)?.arriving ?? 0 > 0);
    const rest = others.filter((h) => h !== speaker && !arriving.includes(h)).reverse();
    const back = [...new Set([...speaking, ...arriving, ...rest])].slice(0, 4);
    const xs = back.length <= 2 ? [0.17, 0.83] : [0.13, 0.87, 0.33, 0.67];
    const out: { id: CharacterId; x: number; y: number; size: number }[] = back.map((id, i) => {
      const farther = i >= 2;
      return { id, x: width * xs[i], y: floorY - carSize * (farther ? 0.38 : 0.22), size: carSize * (farther ? 0.48 : 0.58) };
    });
    // Farthest first, the chosen one last, in front.
    out.sort((a, b) => a.y - b.y);
    out.push({ id: chosen, x: width / 2, y: floorY + carSize * 0.05, size: carSize });
    return out;
  }

  /** Where a character's head is, for speech bubbles (CSS px). */
  headOf(id: CharacterId): { x: number; y: number } | null {
    const spot = this.parking().find((p) => p.id === id);
    return spot === undefined ? null : { x: spot.x, y: spot.y - spot.size * 1.02 };
  }

  resize(width: number, height: number, dpr: number): void {
    this.layout = garageLayout(width, height);
    this.dpr = dpr;
    this.background = null;
  }

  /** The room, with everything that does not move: postcards, charms, the parol, bunting. */
  private ensureBackground(): HTMLCanvasElement | null {
    if (this.background !== null) {
      return this.background;
    }
    const room = art('b.garage');
    if (room === null) {
      return null;
    }
    const save = this.getSave();
    const { width, height, room: at } = this.layout;
    const { canvas, ctx } = makeCanvas(width, height, Math.min(2, this.dpr));
    ctx.fillStyle = '#E7D6B8';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(room.img, at.x, at.y, room.w * at.k, room.h * at.k);
    const P = (name: string, fallback: [number, number]): [number, number] => {
      const p = room.points?.[name] ?? fallback;
      return [at.x + p[0] * at.k, at.y + p[1] * at.k];
    };
    // Postcards on the corkboard, in rows, a little askew.
    const card = art('p.postcard');
    const found = JOURNEY.filter((id) => MISSIONS[id].postcard !== null && save.missions[id]?.foundPostcard === true);
    if (card !== null) {
      const [ax, ay] = P('corkA', [0, 0]);
      const [bx, by] = P('corkB', [100, 100]);
      // Only the part of the board this screen shows, so no card hangs off its edge.
      const left = Math.max(8, Math.min(ax, bx));
      const top = Math.min(ay, by);
      const across = Math.min(width - 8, Math.max(ax, bx)) - left;
      const down = Math.abs(by - ay);
      found.slice(0, 16).forEach((_, i) => {
        const x = left + across * (0.14 + (i % 4) * 0.24);
        const y = top + down * (0.16 + Math.floor(i / 4) * 0.23);
        const k = (across * 0.26) / card.w;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((((i * 37) % 11) - 5) * 0.012);
        ctx.drawImage(card.img, (-card.w * k) / 2, (-card.h * k) / 2, card.w * k, card.h * k);
        ctx.restore();
      });
    }
    // Lola's parol, if Kiko brought it; the charms along the sill.
    const parol = art('d.parol');
    if (save.missions['m2-convoy']?.completed === true && parol !== null) {
      const [x, y] = P('hook', [width * 0.7, height * 0.1]);
      const k = (width * 0.13) / parol.w;
      ctx.drawImage(parol.img, x - (parol.w * k) / 2, y, parol.w * k, parol.h * k);
    }
    earnedCharms(save).forEach((id, i) => {
      const s = art(`d.${id}`);
      if (s !== null) {
        const [sx, sy] = P('sill', [width * 0.5, height * 0.3]);
        const x = sx + (i - 1) * width * 0.09;
        const y = sy;
        const k = (width * 0.075) / s.w;
        ctx.drawImage(s.img, x - (s.w * k) / 2, y - s.h * k, s.w * k, s.h * k);
      }
    });
    // Fiesta bunting across the room, once the plaza is open or the Workshop has made some.
    if ((save.upgrades.banderitas ?? 0) > 0 || barrierOpen(save)) {
      const colours = ['#E9B54C', '#CF7C74', '#69AFA4', '#F8EDD8', '#3E74B9'];
      const rows = barrierOpen(save) ? 2 : 1;
      for (let row = 0; row < rows; row += 1) {
        const y0 = height * (0.06 + row * 0.07);
        ctx.strokeStyle = 'rgba(90,70,50,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= 20; i += 1) {
          const u = i / 20;
          const y = y0 + Math.sin(u * Math.PI) * height * 0.02;
          if (i === 0) {
            ctx.moveTo(width * u, y);
          } else {
            ctx.lineTo(width * u, y);
          }
        }
        ctx.stroke();
        for (let i = 0; i < 13; i += 1) {
          const u = (i + 0.5) / 13;
          const x = width * u;
          const y = y0 + Math.sin(u * Math.PI) * height * 0.02;
          const s = Math.min(width, height) * 0.024;
          ctx.fillStyle = colours[(i + row) % colours.length];
          ctx.beginPath();
          ctx.moveTo(x - s, y);
          ctx.lineTo(x + s, y);
          ctx.lineTo(x, y + s * 1.7);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    // Late light through the door, low on the floor.
    const glow = ctx.createLinearGradient(0, height * 0.5, 0, height);
    glow.addColorStop(0, 'rgba(255,240,205,0)');
    glow.addColorStop(1, 'rgba(255,240,205,0.28)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, height * 0.5, width, height * 0.5);
    this.background = canvas;
    return canvas;
  }

  draw(ctx: CanvasRenderingContext2D, _t: number, dt: number): void {
    this.t += dt;
    this.idle += dt;
    const { width, height, carSize } = this.layout;
    const bg = this.ready ? this.ensureBackground() : null;
    if (bg !== null) {
      ctx.drawImage(bg, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#E7D6B8';
      ctx.fillRect(0, 0, width, height);
    }
    if (this.dim > 0) {
      ctx.fillStyle = `rgba(53,72,68,${this.dim})`;
      ctx.fillRect(0, 0, width, height);
    }
    if (!this.cast) {
      return;
    }
    const spots = this.parking();
    this.drawShelf(ctx, width, carSize);
    for (const spot of spots) {
      const actor = this.actors.get(spot.id);
      if (actor === undefined) {
        continue;
      }
      let { x, y, size } = spot;
      if (actor.arriving > 0) {
        // Driving in from the door: small and high, then home.
        actor.arriving = Math.max(0, actor.arriving - dt);
        const k = 1 - actor.arriving / 2.2;
        const e = k * k * (3 - 2 * k);
        size *= 0.35 + 0.65 * e;
        y = this.layout.floorY + (y - this.layout.floorY) * e;
        x = width / 2 + (x - width / 2) * e;
      }
      if (this.idle > (spot.id === 'jepoy' ? 25 : 40) && this.speaker === null && actor.arriving === 0) {
        actor.sleeping = true;
      }
      const speaking = this.speaker?.id === spot.id;
      const expr: Expression = speaking ? this.speaker!.expr : actor.sleeping ? 'idle' : actor.expr;
      const hop = actor.arriving > 0 ? Math.abs(Math.sin(this.t * 10)) * 6 : speaking ? Math.abs(Math.sin(this.t * 6)) * 3 : (Math.sin(this.t * 2.2 + x) + 1) * 0.7;
      drawCharacter(ctx, spot.id, x, y, size, {
        expr,
        anim: {
          t: this.t,
          blink: actor.sleeping ? 1 : blinkAt(this.t, spot.id.length),
          talk: speaking ? 0.5 + 0.5 * Math.sin(this.t * 16) : 0,
          lookX: Math.sin(this.t * 0.4 + x) * 0.5,
          lookY: 0,
        },
        hop,
      });
      if (actor.sleeping) {
        ctx.font = `900 ${size * 0.12}px "Nunito Black", system-ui`;
        ctx.fillStyle = 'rgba(53,72,68,0.7)';
        ctx.textAlign = 'center';
        for (let i = 0; i < 3; i += 1) {
          const k = (this.t * 0.4 + i / 3) % 1;
          ctx.globalAlpha = 1 - k;
          ctx.fillText('z', x + size * (0.25 + k * 0.2), y - size * (1.0 + k * 0.4));
        }
        ctx.globalAlpha = 1;
      }
    }
    // The team's two sidekicks by the chosen hero; everyone else on the shelf above.
    const save = this.getSave();
    save.loadout.sidekicks.forEach((id, i) => {
      if (id === null || save.sidekicks[id] === undefined) {
        return;
      }
      const side = i === 0 ? -1 : 1;
      const x = width / 2 + side * carSize * 0.62;
      const y = this.layout.floorY + carSize * 0.09;
      const scale = (carSize * 0.42) / 200;
      softShadow(ctx, x, y, carSize * 0.14, carSize * 0.035, 0.24);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      drawSidekick(ctx, id, { expr: 'happy', t: this.t + i, blink: blinkAt(this.t, 4 + i), talk: 0, lookX: -side * 0.3, evolved: save.sidekicks[id]?.evolved === true, action: 0 });
      ctx.restore();
    });
  }

  /** Sidekicks not on the team wait on a long shelf: the room fills as the collection does. */
  private drawShelf(ctx: CanvasRenderingContext2D, width: number, carSize: number): void {
    const save = this.getSave();
    const waiting = SIDEKICKS.filter((id) => save.sidekicks[id] !== undefined && !save.loadout.sidekicks.includes(id));
    if (waiting.length === 0) {
      return;
    }
    // The shelf holds 16. Past that everyone gets a turn on it, moving along after each run.
    const start = waiting.length > 16 ? Object.values(save.friendship).reduce<number>((n, runs) => n + (runs ?? 0), 0) % waiting.length : 0;
    const owned = [...waiting.slice(start), ...waiting.slice(0, start)];
    const y = this.layout.floorY - carSize * 1.42;
    const rows = owned.length > 8 ? 2 : 1;
    ctx.fillStyle = 'rgba(122,90,60,0.9)';
    for (let row = 0; row < rows; row += 1) {
      const onRow = owned.slice(row * 8, (row + 1) * 8);
      const ry = y - row * carSize * 0.42;
      const spacing = (width * 0.9) / 8;
      const span = spacing * onRow.length;
      const left = (width - span) / 2;
      ctx.fillStyle = '#8E6A44';
      ctx.fillRect(left - 6, ry, span + 12, 5);
      ctx.fillStyle = 'rgba(53,44,32,0.22)';
      ctx.fillRect(left - 6, ry + 5, span + 12, 4);
      onRow.forEach((id, i) => {
        const scale = (carSize * 0.26) / 200;
        ctx.save();
        ctx.translate(left + spacing * (i + 0.5), ry);
        ctx.scale(scale, scale);
        drawSidekick(ctx, id, { expr: 'idle', t: this.t + i + row * 3, blink: blinkAt(this.t, 7 + i + row * 6) > 0.5 ? 1 : 0, talk: 0, lookX: 0, evolved: save.sidekicks[id]?.evolved === true, action: 0 });
        ctx.restore();
      });
    }
  }

  wake(): void {
    this.idle = 0;
    for (const actor of this.actors.values()) {
      actor.sleeping = false;
    }
  }

  dispose(): void {
    this.background = null;
  }
}

/** Behind the journey map: only the paper. The road itself scrolls, in the screen (ui/screens.ts). */
export class MapScene implements Scene {
  private width = 390;
  private height = 844;

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#F4EAD4';
    ctx.fillRect(0, 0, this.width, this.height);
  }

  dispose(): void {}
}
