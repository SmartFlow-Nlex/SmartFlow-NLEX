import { MISSIONS } from '../core/missions';
import { barrierOpen, teamOpen, workshopOpen } from '../core/progression';
import { JOURNEY, SIDEKICKS, type CharacterId, type Expression, type SaveData, type TeammateId } from '../core/types';
import { SIDEKICK_BOX, drawSidekick } from './art/sidekicks';
import { SpriteCache, blit } from './art/sprites';
import { blinkAt, drawCharacter } from './art/cast';
import { drawGarageBackground, garageLayout, type GarageLayout, type GarageLook } from './art/garage';
import { makeCanvas, rgba } from './art/kit';
import type { Scene } from './appApi';

/** Canvas scenes for the garage, the map and story backdrops. */

export function garageLook(save: SaveData): GarageLook {
  const postcards: string[] = [];
  for (const id of JOURNEY) {
    const card = MISSIONS[id].postcard;
    if (card !== null && save.missions[id]?.foundPostcard === true) {
      postcards.push(card.id);
    }
  }
  return {
    teamBoard: teamOpen(save),
    workshop: workshopOpen(save),
    banderitas: (save.upgrades.banderitas ?? 0) > 0,
    fiesta: barrierOpen(save),
    kikoParol: save.missions['m2-convoy']?.completed === true,
    postcards,
    evening: 0,
  };
}

interface Actor {
  id: CharacterId;
  expr: Expression;
  /** Seconds left of an arrival drive-in. */
  arriving: number;
  sleeping: boolean;
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
  /** The dock's sidekicks as pre-drawn sprites: up to twelve of them, every frame, would be too heavy to redraw. */
  private readonly dockSprites = new SpriteCache();

  constructor(private readonly getSave: () => SaveData) {
    this.syncActors();
  }

  syncActors(): void {
    const save = this.getSave();
    const wanted: CharacterId[] = [...save.heroes];
    for (const id of wanted) {
      if (!this.actors.has(id)) {
        this.actors.set(id, { id, expr: 'idle', arriving: 0, sleeping: false });
      }
    }
    this.background = null;
  }

  /** Plays a friend's drive-in. */
  arrive(id: TeammateId): void {
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
      actor.sleeping = false;
    }
    this.idle = 0;
  }

  /** Where a character's head is, for speech bubbles (CSS px). */
  headOf(id: CharacterId): { x: number; y: number } | null {
    const bay = this.layout.bays[id as 'navie' | 'jepoy' | 'kiko'];
    if (bay === undefined || !this.actors.has(id)) {
      return null;
    }
    return { x: bay[0], y: bay[1] - this.layout.carSize * (id === 'jepoy' ? 0.95 : id === 'kiko' ? 0.8 : 1.0) };
  }

  resize(width: number, height: number, dpr: number): void {
    this.layout = garageLayout(width, height);
    this.dpr = dpr;
    this.background = null;
    this.dockSprites.resolution = Math.min(2.2, dpr * ((this.layout.carSize * 0.36) / 175));
    this.dockSprites.clear();
  }

  private ensureBackground(): HTMLCanvasElement {
    if (this.background === null) {
      const { width, height } = this.layout;
      const { canvas, ctx } = makeCanvas(width, height, this.dpr);
      drawGarageBackground(ctx, this.layout, garageLook(this.getSave()), 0);
      this.background = canvas;
    }
    return this.background;
  }

  draw(ctx: CanvasRenderingContext2D, _t: number, dt: number): void {
    this.t += dt;
    this.idle += dt;
    const { width, height, bays, carSize } = this.layout;
    const look = garageLook(this.getSave());
    if (look.banderitas || look.fiesta) {
      // Animated flags: draw live.
      drawGarageBackground(ctx, this.layout, look, this.t);
    } else {
      ctx.drawImage(this.ensureBackground(), 0, 0, width, height);
    }
    // Dim the room but not the cast, so faces stay bright behind menus.
    if (this.dim > 0) {
      ctx.fillStyle = `rgba(10,22,41,${this.dim})`;
      ctx.fillRect(0, 0, width, height);
    }
    if (!this.cast) {
      return;
    }
    const order: CharacterId[] = ['jepoy', 'kiko', 'navie'];
    for (const id of order) {
      const actor = this.actors.get(id);
      if (actor === undefined) {
        continue;
      }
      const bay = bays[id as 'navie' | 'jepoy' | 'kiko'];
      let x = bay[0];
      let y = bay[1];
      // Back row smaller, for depth; Navie in front at full size.
      let size = carSize * (id === 'jepoy' ? 0.9 : id === 'kiko' ? 0.74 : 1);
      if (actor.arriving > 0) {
        // Driving in from the open door: small and high, then home.
        actor.arriving = Math.max(0, actor.arriving - dt);
        const k = 1 - actor.arriving / 2.2;
        const e = k * k * (3 - 2 * k);
        size *= 0.35 + 0.65 * e;
        y = this.layout.floorY - carSize * 0.1 + (bay[1] - this.layout.floorY + carSize * 0.1) * e;
        x = width / 2 + (bay[0] - width / 2) * e;
      }
      // Rest after a long quiet spell (Jepoy naps first).
      if (this.idle > (id === 'jepoy' ? 25 : 40) && this.speaker === null && actor.arriving === 0) {
        actor.sleeping = true;
      }
      const speaking = this.speaker?.id === id;
      const expr: Expression = speaking ? this.speaker!.expr : actor.sleeping ? 'idle' : actor.expr;
      const hop = actor.arriving > 0 ? Math.abs(Math.sin(this.t * 10)) * 6 : speaking ? Math.abs(Math.sin(this.t * 6)) * 3 : Math.sin(this.t * 2.2 + x) * 1.2;
      drawCharacter(ctx, id, x, y, size, {
        expr,
        anim: {
          t: this.t,
          blink: actor.sleeping ? 1 : blinkAt(this.t, id.length),
          talk: speaking ? 0.5 + 0.5 * Math.sin(this.t * 16) : 0,
          lookX: Math.sin(this.t * 0.4 + x) * 0.4,
          lookY: 0,
        },
        hop,
      });
      if (actor.sleeping) {
        ctx.font = `900 ${size * 0.12}px "Nunito Black", system-ui`;
        ctx.fillStyle = rgba('#10284C', 0.7);
        ctx.textAlign = 'center';
        for (let i = 0; i < 3; i += 1) {
          const k = (this.t * 0.4 + i / 3) % 1;
          ctx.globalAlpha = 1 - k;
          ctx.fillText('z', x + size * (0.25 + k * 0.2), y - size * (1.0 + k * 0.4));
        }
        ctx.globalAlpha = 1;
      }
    }
    this.drawSidekickDock(ctx, width, carSize);
  }

  /**
   * The collected sidekicks hover over their charging dock above the bays -
   * the garage visibly fills up as the collection grows (evolved ones show
   * their evolved form; the two on the current team hover a little higher).
   */
  private drawSidekickDock(ctx: CanvasRenderingContext2D, width: number, carSize: number): void {
    const save = this.getSave();
    const owned = SIDEKICKS.filter((id) => save.sidekicks[id] !== undefined);
    if (owned.length === 0) {
      return;
    }
    // More than six: two rails, the second above the first.
    const perRow = 6;
    const rows = Math.ceil(owned.length / perRow);
    const fit = owned.length > perRow ? 0.8 : 1;
    for (let row = 0; row < rows; row += 1) {
      const onRow = owned.slice(row * perRow, (row + 1) * perRow);
      const y = this.layout.floorY - carSize * (1.55 + row * 0.42);
      const spacing = Math.min(width * 0.15, (width * 0.9) / onRow.length);
      const start = width / 2 - (spacing * (onRow.length - 1)) / 2;
      // The dock rail.
      ctx.fillStyle = 'rgba(16,40,76,0.35)';
      ctx.fillRect(start - spacing * 0.5, y + 4, spacing * onRow.length, 5);
      onRow.forEach((id, i) => {
        const onTeam = save.loadout.sidekicks.includes(id);
        const evolved = save.sidekicks[id]?.evolved === true;
        const blink = blinkAt(this.t, 7 + i + row * 6) > 0.5 ? 1 : 0;
        const sprite = this.dockSprites.get(`${id}|${evolved ? 1 : 0}|${onTeam ? 1 : 0}|${blink}`, SIDEKICK_BOX, (c) =>
          drawSidekick(c, id, { expr: onTeam ? 'happy' : 'idle', t: 0, blink, talk: 0, lookX: 0, evolved, action: 0 }),
        );
        const bob = Math.sin(this.t * 2 + i + row) * 3 + (onTeam ? -8 : 0);
        blit(ctx, sprite, start + i * spacing, y + bob, (carSize * (onTeam ? 0.36 : 0.3) * fit) / 175);
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
    ctx.fillStyle = '#F2EAD6';
    ctx.fillRect(0, 0, this.width, this.height);
  }

  dispose(): void {}
}
