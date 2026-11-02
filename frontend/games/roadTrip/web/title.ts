import type { HeroId, SaveData, SidekickId } from '../core/types';
import { blinkAt, drawCharacter } from './art/cast';
import { drawSidekick } from './art/sidekicks';
import type { Scene } from './appApi';
import { GarageScene } from './scenes';

/**
 * Tollbound Heroes' title and Team stage: the garage behind, the three heroes
 * in front (the chosen one centred and a little larger), and the two equipped
 * sidekicks hovering beside them - blinking, bobbing, now and then reacting.
 * Heroes not yet unlocked stand in as dark silhouettes, so the line-up hints
 * at what is to come without spoiling who.
 */
/** The whole line-up's height, in units of the hero's size. */
const LINE_UP_HEIGHT = 1.49;

export class TeamStage implements Scene {
  private readonly garage: GarageScene;
  private width = 390;
  private height = 844;
  private t = 0;
  /** Where the line-up stands, as a share of the height. */
  floor = 0.66;
  /**
   * The part of the screen left free for the line-up (Team): it is centred there and sized to
   * fit, wherever the phone's notch and the sheet have put that space. Overrides `floor`.
   */
  space: HTMLElement | null = null;
  /** Seconds since a hero was picked (a hop of joy). */
  private hopT = 9;
  private hopId: HeroId | SidekickId | null = null;

  constructor(private readonly getSave: () => SaveData) {
    this.garage = new GarageScene(getSave);
    this.garage.dim = 0.45;
    this.garage.cast = false;
  }

  /** A small celebratory hop for whoever was just chosen. */
  cheer(id: HeroId | SidekickId): void {
    this.hopId = id;
    this.hopT = 0;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.garage.resize(width, height, dpr);
  }

  draw(ctx: CanvasRenderingContext2D, t: number, dt: number): void {
    this.t += dt;
    this.hopT += dt;
    this.garage.draw(ctx, t, dt);
    const save = this.getSave();
    const w = this.width;
    const hgt = this.height;
    const chosen = save.loadout.hero;
    const order: HeroId[] = (['jepoy', 'navie', 'kiko'] as HeroId[]).sort((a, b) => (a === chosen ? 0 : 1) - (b === chosen ? 0 : 1));
    // Chosen hero centre; the other two behind, either side.
    const slots = [
      { x: 0.5, scale: 1, y: 0 },
      { x: 0.2, scale: 0.78, y: -0.21 },
      { x: 0.8, scale: 0.78, y: -0.21 },
    ];
    let base = Math.min(w * 0.36, hgt * 0.2);
    // Low enough that the sidekicks hovering above never slip under the top bar on short screens.
    let floor = Math.max(hgt * this.floor, base * 0.95 + 110);
    let left = 0;
    let across = w;
    const free = this.space?.getBoundingClientRect();
    if (free !== undefined && free.height > 0) {
      // From the hero's wheels to the top of a sidekick hovering above: LINE_UP_HEIGHT * base.
      base = Math.min(free.width * 0.36, (free.height * 0.92) / LINE_UP_HEIGHT);
      floor = free.bottom - (free.height - base * LINE_UP_HEIGHT) / 2;
      left = free.left;
      across = free.width;
    }
    const draws = order.map((id, i) => ({ id, ...slots[i] }));
    // Back row first.
    for (const d of [draws[1], draws[2], draws[0]]) {
      const unlocked = save.heroes.includes(d.id);
      const hop = this.hopId === d.id && this.hopT < 0.6 ? Math.sin((this.hopT / 0.6) * Math.PI) * 26 : Math.abs(Math.sin(this.t * 1.6 + d.x * 7)) * 2;
      ctx.save();
      if (!unlocked) {
        ctx.filter = 'brightness(0.15) saturate(0)';
        ctx.globalAlpha = 0.8;
      }
      drawCharacter(ctx, d.id, left + across * d.x, floor + base * d.y, base * d.scale, {
        expr: !unlocked ? 'idle' : d.id === chosen ? 'happy' : 'idle',
        anim: { t: this.t, blink: blinkAt(this.t, d.x * 10), talk: 0, lookX: d.x < 0.5 ? 0.3 : d.x > 0.5 ? -0.3 : 0, lookY: 0 },
        hop,
      });
      ctx.restore();
    }
    // The two equipped sidekicks hover above the chosen hero's shoulders.
    save.loadout.sidekicks.forEach((id, i) => {
      if (id === null || save.sidekicks[id] === undefined) {
        return;
      }
      const side = i === 0 ? -1 : 1;
      const sx = left + across * (0.5 + side * 0.17);
      const bob = Math.sin(this.t * 2.4 + i * 1.7) * 5;
      const hop = this.hopId === id && this.hopT < 0.6 ? Math.sin((this.hopT / 0.6) * Math.PI) * 22 : 0;
      const sy = floor - base * 0.95 + bob - hop;
      const scale = (base * 0.5) / 175;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(scale, scale);
      drawSidekick(ctx, id, {
        expr: this.hopId === id && this.hopT < 1.2 ? 'celebrate' : 'happy',
        t: this.t + i,
        blink: blinkAt(this.t, 4 + i),
        talk: 0,
        lookX: -side * 0.3,
        evolved: save.sidekicks[id]?.evolved === true,
        action: this.hopId === id && this.hopT < 0.5 ? 1 - this.hopT / 0.5 : 0,
      });
      ctx.restore();
    });
  }

  dispose(): void {
    this.garage.dispose();
  }
}
