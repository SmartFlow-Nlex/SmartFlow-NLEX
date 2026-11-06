import type { Upgrade } from '../../core/facility';
import { currentStep, hasFlag, type MissionDef, type MissionRun } from '../../core/mission';
import type { LaneMode } from '../../core/plaza';
import type { Actor } from '../anim';
import type { Game, HeroAction, Interaction, Prop } from '../game';
import type { Mesh } from '../gl/renderer';
import type { HeroId } from '../models';
import type { NavieMood } from '../navieArt';
import type { Hud } from '../ui/hud';

/**
 * What every mission script gets from the app, and the helpers they share. A mission is
 * written against the world: which props stand where, what each hero can do at each
 * spot, and short scenes. Every step can be entered fresh from a save.
 */

export interface MissionContext {
  game: Game;
  hud: Hud;
  run: () => MissionRun;
  flag: (name: string) => void;
  /** The Eco Dispatch board for this mission's transport. */
  openBoard: () => Promise<void>;
  flutePuzzle: () => Promise<boolean>;
  /** The toll plaza console. Null if the player backs out. */
  lanePuzzle: () => Promise<LaneMode[] | null>;
  /** The depot's upgrade planner. Null if the player backs out. */
  energyPlanner: () => Promise<Upgrade[] | null>;
  wait: (seconds: number) => Promise<void>;
  /** Fades the screen, runs `fn` while it is dark, and fades back. */
  fade: (fn: () => void, seconds?: number) => Promise<void>;
  finish: () => void;
  reduceMotion: () => boolean;
  upgrades: () => readonly string[];
}

/** What the app needs from any mission script. */
export interface MissionScript {
  /** Builds the zone for the run's current step and places everyone. */
  enter(spawnAt?: string): void;
  /** A fresh start: the first moments. */
  opening(): Promise<void>;
  /** Every frame. */
  tick(dt: number): void;
  /** After the Eco Dispatch board: where the team goes next. */
  afterDispatch(): void;
}

export const HERO_IDS: readonly HeroId[] = ['dayo', 'baging', 'sukat', 'awit'];

export const anyHero = (action: HeroAction): Partial<Record<HeroId, HeroAction>> => {
  const out: Partial<Record<HeroId, HeroAction>> = {};
  for (const id of HERO_IDS) {
    out[id] = action;
  }
  return out;
};

export const HERO_NAME: Record<HeroId, string> = { dayo: 'Dayo', baging: 'Baging', sukat: 'Sukat', awit: 'Awit' };

/** Navie's portrait keys: the app's own mascot images, never redrawn. */
export const navieKey = (mood: NavieMood = 'hello'): string => `navie-${mood}`;

export abstract class ScriptBase implements MissionScript {
  protected abstract readonly def: MissionDef;

  constructor(protected readonly ctx: MissionContext) {}

  abstract enter(spawnAt?: string): void;
  abstract opening(): Promise<void>;
  abstract tick(dt: number): void;
  abstract afterDispatch(): void;

  protected has(flag: string): boolean {
    return hasFlag(this.ctx.run(), flag);
  }

  protected step(): string | null {
    return currentStep(this.def, this.ctx.run())?.id ?? null;
  }

  protected stepAtLeast(id: string): boolean {
    const want = this.def.steps.findIndex((s) => s.id === id);
    return this.ctx.run().step >= want;
  }

  protected prop(mesh: string | Mesh, x: number, z: number, visible: () => boolean, opts: { y?: number; yaw?: number; scale?: number } = {}): Prop {
    const g = this.ctx.game;
    const p: Prop = {
      mesh: typeof mesh === 'string' ? g.props[mesh] : mesh,
      x,
      y: opts.y ?? g.zone.height(x, z),
      z,
      yaw: opts.yaw ?? 0,
      scale: opts.scale ?? 1,
      visible,
    };
    g.worldProps.push(p);
    return p;
  }

  /** Navie, on the comms. */
  protected navie(text: string, mood: NavieMood = 'hello'): Promise<void> {
    return this.ctx.hud.say('Navie', navieKey(mood), text);
  }

  protected say(speaker: string, portrait: string, text: string): Promise<void> {
    return this.ctx.hud.say(speaker, portrait, text);
  }

  /** One line while playing, then control comes straight back. */
  protected async line(portrait: string, speaker: string, text: string): Promise<void> {
    this.ctx.game.busy = true;
    await this.ctx.hud.say(speaker, portrait, text);
    this.ctx.game.busy = false;
    this.ctx.hud.setHudHidden(false);
  }

  /** Several lines in a row, with the HUD hidden throughout. */
  protected async scene(fn: () => Promise<void>): Promise<void> {
    const { game: g, hud } = this.ctx;
    g.busy = true;
    hud.setHudHidden(true);
    await fn();
    g.busy = false;
    g.releaseCamera();
    hud.setHudHidden(false);
    hud.banner(null);
  }

  /** Someone talking: turned to the hero, with their face in frame above the speech bubble. */
  protected faceAndFrame(n: Actor): void {
    const g = this.ctx.game;
    const h = g.heroes[g.active];
    const toHero = Math.atan2(h.x - n.x, h.z - n.z);
    n.yaw = toHero;
    const view = toHero + 0.75;
    g.cameraTo([n.x + Math.sin(view) * 5.4, n.y + 2.1, n.z + Math.cos(view) * 5.4], [n.x, n.y + 0.55, n.z], 5);
  }

  /** Picks up something small: a hero carries one, Baging two. */
  protected pickUp(id: string, mesh: string): void {
    const g = this.ctx.game;
    g.carrying.push({ id, mesh: g.props[mesh] });
    g.heroes[g.active].pose = 'carry';
    g.heroes[g.active].squash = 0.7;
    g.audio.play('pickup');
  }

  protected canCarryMore(): boolean {
    const g = this.ctx.game;
    return g.carrying.length === 0 || (g.active === 'baging' && g.carrying.length < 2);
  }

  /* ---- The call at Navie's Mission Station ---- */

  /** The Command Center, with only the call to answer. */
  protected enterCenter(onCall: () => Promise<void>): void {
    const { game: g, upgrades } = this.ctx;
    g.loadZone('station', upgrades());
    const s = g.zone.spots;
    g.placeTeam(s.spawn[0], s.spawn[1], -0.6);
    g.placeNpc('joy', s.community[0] + 1, s.community[1] + 1, 1.2);
    g.placeNpc('ernesto', s.garden[0] + 2, s.garden[1] + 2, -2);
    const call: Interaction = {
      id: 'call',
      x: s.navie[0],
      z: s.navie[1],
      radius: 4,
      when: () => this.step() === 'call',
      by: anyHero({ label: 'Answer the call', hold: 0, run: () => this.answerCall(onCall) }),
    };
    g.interactions = [call];
  }

  private answerCall(onCall: () => Promise<void>): Promise<void> {
    const g = this.ctx.game;
    const [x, z] = g.zone.spots.navie;
    g.audio.play('ok');
    return this.scene(async () => {
      /* Facing Navie's screen. */
      g.cameraTo([x + Math.sin(2.6) * 6.5, 3.4, z + Math.cos(2.6) * 6.5], [x, 2.9, z], 5);
      await onCall();
    });
  }

  /** Points the guide at a named spot when the step is in this zone. */
  protected guideTo(target: [number, number] | null): void {
    const g = this.ctx.game;
    const step = currentStep(this.def, this.ctx.run());
    g.guide = step === null || step.zone !== g.zoneId ? null : target;
  }

  protected nearest(points: readonly [number, number][]): [number, number] | null {
    const g = this.ctx.game;
    const h = g.heroes[g.active];
    let best: [number, number] | null = null;
    let d = Infinity;
    for (const p of points) {
      const dd = Math.hypot(p[0] - h.x, p[1] - h.z);
      if (dd < d) {
        d = dd;
        best = p;
      }
    }
    return best;
  }
}
