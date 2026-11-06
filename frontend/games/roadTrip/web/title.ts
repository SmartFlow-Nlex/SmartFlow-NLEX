import type { HeroId, SaveData, SidekickId } from '../core/types';
import { FLOURISH_SECONDS, blinkAt, characterSprite, drawCharacter, drawSidekick, heroFlourishIsStars, heroMotion, preload, sidekickMotion, softShadow } from './art/clay';
import type { Scene } from './appApi';
import { GarageScene } from './scenes';

/**
 * The title and Team stage: the garage behind, the hero in front, the two
 * sidekicks either side. A preview shows who you are looking at without choosing
 * them: looking is not equipping. The hero leans in when picked; the sidekicks
 * greet each other.
 */
/** A soft spring on how far someone has turned: picked, they swing round to face you and settle. */
class Turn {
  yaw = REST_YAW;
  private speed = 0;
  private who: string | null = null;

  /** Whoever stands here now. A new face swings in from the side. */
  step(who: string, dt: number, still: boolean): number {
    if (who !== this.who) {
      const first = this.who === null;
      this.who = who;
      if (!first && !still) {
        this.yaw = SWING_FROM;
        this.speed = 0;
      }
    }
    if (still) {
      this.yaw = REST_YAW;
      this.speed = 0;
      return this.yaw;
    }
    const h = Math.min(dt, 0.05);
    this.speed += ((REST_YAW - this.yaw) * 70 - this.speed * 10.5) * h;
    this.yaw += this.speed * h;
    return this.yaw;
  }

  swing(): void {
    this.yaw = SWING_FROM;
    this.speed = 0;
  }
}

/** A hero's size on this stage, against everyone's base size. Only this stage: the road and hit boxes never read it. Navie is set to the approved Team picture. */
const STAGE_SIZE: Partial<Record<HeroId, number>> = { navie: 0.92 };

const REST_YAW = 15;
const SWING_FROM = 55;

export class TeamStage implements Scene {
  private readonly garage: GarageScene;
  private width = 390;
  private height = 844;
  private t = 0;
  /** Where the line-up stands, as a share of the height. */
  floor = 0.66;
  /** The part of the screen left free for the line-up: it is centred there and sized to fit. */
  space: HTMLElement | null = null;
  /** Seconds since someone was picked (a hop of joy). */
  private hopT = 9;
  private hopId: HeroId | SidekickId | null = null;
  /** Looking at someone other than the chosen hero or team. */
  previewHero: HeroId | null = null;
  previewSidekick: SidekickId | null = null;
  /** Which slot a previewed sidekick would go in. */
  previewSlot: 0 | 1 = 0;
  /** Each one on stage, turned this many degrees from facing you, on a soft spring back to their resting angle. */
  private readonly turn = { hero: new Turn(), left: new Turn(), right: new Turn() };

  constructor(private readonly getSave: () => SaveData) {
    this.garage = new GarageScene(getSave);
    this.garage.dim = 0.12;
    this.garage.cast = false;
  }

  cheer(id: HeroId | SidekickId): void {
    this.hopId = id;
    this.hopT = 0;
    const save = this.getSave();
    if (save.settings.reduceMotion) {
      return;
    }
    if (id === (this.previewHero ?? save.loadout.hero)) {
      this.turn.hero.swing();
    } else if (id === save.loadout.sidekicks[0] || (this.previewSlot === 0 && id === this.previewSidekick)) {
      this.turn.left.swing();
    } else if (id === save.loadout.sidekicks[1] || (this.previewSlot === 1 && id === this.previewSidekick)) {
      this.turn.right.swing();
    }
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
    const heroId = this.previewHero ?? save.loadout.hero;
    let base = Math.min(w * 0.44, hgt * 0.24);
    let floor = Math.max(hgt * this.floor, base + 110);
    let cx = w / 2;
    let across = w;
    const free = this.space?.getBoundingClientRect();
    if (free !== undefined && free.height > 0) {
      base = Math.min(free.width * 0.42, free.height * 0.8);
      floor = free.bottom - free.height * 0.08;
      cx = free.left + free.width / 2;
      across = free.width;
    }
    void preload([characterSprite(heroId)]);
    const owned = save.heroes.includes(heroId);
    // Everyone stands in their own way, and reacts in their own way to being picked.
    const still = save.settings.reduceMotion;
    const motion = still ? { hop: 0, tilt: 0 } : heroMotion(heroId, this.t, this.hopId === heroId ? this.hopT : 9);
    // A soft pool of light on the floor, so the team stands together on something.
    ctx.save();
    ctx.translate(cx, floor - base * 0.01);
    ctx.scale(1, 0.2);
    const reach = Math.min(across * 0.52, base * 1.5);
    const pool = ctx.createRadialGradient(0, 0, reach * 0.1, 0, 0, reach);
    pool.addColorStop(0, 'rgba(255,250,232,0.62)');
    pool.addColorStop(0.6, 'rgba(255,250,232,0.3)');
    pool.addColorStop(1, 'rgba(255,250,232,0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, reach, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Someone not yet earned still shows in full, as a preview: the panel beside them says how to earn them.
    ctx.save();
    drawCharacter(ctx, heroId, cx, floor, base * (STAGE_SIZE[heroId] ?? 1), {
      expr: !owned ? 'idle' : this.hopId === heroId && this.hopT < 1.1 ? 'celebrate' : 'idle',
      anim: { t: this.t, blink: blinkAt(this.t, 3), talk: 0, lookX: 0, lookY: 0 },
      hop: motion.hop,
      tilt: motion.tilt,
      yaw: this.turn.hero.step(heroId, dt, save.settings.reduceMotion),
    });
    ctx.restore();
    if (!still && this.hopId === heroId && this.hopT < FLOURISH_SECONDS && heroFlourishIsStars(heroId)) {
      this.stars(ctx, cx, floor - base * 0.5, base, this.hopT / FLOURISH_SECONDS);
    }
    // The sidekicks either side; a preview stands in the slot it would take.
    const slots: (SidekickId | null)[] = [save.loadout.sidekicks[0], save.loadout.sidekicks[1]];
    if (this.previewSidekick !== null) {
      slots[this.previewSlot] = this.previewSidekick;
    }
    slots.forEach((id, i) => {
      if (id === null) {
        return;
      }
      const side = i === 0 ? -1 : 1;
      const x = cx + side * Math.min(across * 0.34, base * 0.82);
      const y = floor - base * 0.04;
      const reaction = still || this.hopId !== id ? { lift: 0, spin: 0 } : sidekickMotion(id, this.hopT);
      const scale = (base * 0.52) / 200;
      const ownedSk = save.sidekicks[id] !== undefined;
      void preload([`s.${id}.front`, `s.${id}.evo`]);
      softShadow(ctx, x, y, base * 0.16, base * 0.04, 0.26);
      ctx.save();
      ctx.translate(x, y - reaction.lift);
      ctx.scale(scale, scale);
      // Each stands turned a little in toward the hero, so the three read as a team.
      const held = (i === 0 ? this.turn.left : this.turn.right).step(id, dt, save.settings.reduceMotion);
      drawSidekick(ctx, id, {
        expr: !ownedSk ? 'idle' : this.hopId === id && this.hopT < 1.1 ? 'celebrate' : 'idle',
        t: this.t + i,
        blink: blinkAt(this.t, 4 + i),
        talk: 0,
        lookX: -side * 0.5,
        evolved: save.sidekicks[id]?.evolved === true,
        action: 0,
        yaw: side < 0 ? -held : held,
        spin: reaction.spin,
      });
      ctx.restore();
    });
  }

  /** A tiny flourish of gold stars, rising and fading: only Ningning's. */
  private stars(ctx: CanvasRenderingContext2D, x: number, y: number, base: number, q: number): void {
    ctx.save();
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = '#F4C552';
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI * (0.15 + i * 0.175);
      const reach = base * (0.42 + q * 0.26);
      const sx = x + Math.cos(a) * reach;
      const sy = y + Math.sin(a) * reach * 0.8 - q * base * 0.1;
      const r = base * 0.028 * (1 - q * 0.4);
      ctx.beginPath();
      for (let p = 0; p < 10; p += 1) {
        const ang = -Math.PI / 2 + (p * Math.PI) / 5;
        const len = p % 2 === 0 ? r : r * 0.45;
        ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  dispose(): void {
    this.garage.dispose();
  }
}
