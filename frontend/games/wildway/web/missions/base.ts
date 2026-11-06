import type { Upgrade } from '../../core/facility';
import { currentStep, hasFlag, type MissionDef, type MissionRun, type ZoneId } from '../../core/mission';
import type { LaneMode, PlazaProblem } from '../../core/plaza';
import { COLLECTIBLES, DISCOVERIES, type GearId } from '../../core/progression';
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
  /** The toll plaza console, for the plaza as it stands. Null if the player backs out. */
  lanePuzzle: (plaza?: PlazaProblem) => Promise<LaneMode[] | null>;
  /** The puzzle kit: true when solved, false when the player leaves it for now. */
  circuit: (levelId: string, kicker: string, hint: string, theme?: 'power' | 'water') => Promise<boolean>;
  dials: (levelId: string, kicker: string, names: readonly string[], hint: string) => Promise<boolean>;
  loadVan: (levelId: string, hint: string) => Promise<boolean>;
  /** Patches and wildlife: each counted once, ever. True if it was new. */
  collect: (id: string) => boolean;
  discover: (id: string) => boolean;
  hasCollected: (id: string) => boolean;
  hasDiscovered: (id: string) => boolean;
  hasGear: (id: GearId) => boolean;
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

/* ---- Patches and wildlife, in any zone ---- */

/** Where each patch sits, relative to its spot: up on a roof, in the reeds, under a stone. */
const PATCH_AT: Record<string, { dx: number; dz: number; y: number }> = {
  'p-center-roof': { dx: 2.2, dz: -0.6, y: 4.6 },
  'p-center-gap': { dx: 0, dz: -2.4, y: 0.5 },
  'p-center-crate': { dx: 0, dz: -0.3, y: 0.35 },
  'p-plaza-roof': { dx: 2.6, dz: 0, y: 7.5 },
  'p-plaza-drain': { dx: 1.2, dz: 0, y: 0.25 },
  'p-plaza-scan': { dx: -1.2, dz: 0, y: 1.7 },
  'p-creek-reeds': { dx: 0, dz: -3.6, y: -0.6 },
  'p-creek-tree': { dx: -1.8, dz: 1.4, y: 3.6 },
  'p-creek-stone': { dx: -1, dz: -1.2, y: 0.9 },
  'p-depot-roof': { dx: 0, dz: 2.2, y: 6.6 },
  'p-depot-meter': { dx: 1.2, dz: 1, y: 1.6 },
  'p-depot-pipe': { dx: 1.2, dz: -2.2, y: 0.6 },
  'p-yard-shelf': { dx: 0, dz: 2.8, y: 4.75 },
  'p-yard-tag': { dx: 0, dz: 1.6, y: 0.7 },
  'p-yard-gutter': { dx: 0, dz: 2.1, y: 6.35 },
};

const PATCH_ACTION: Record<HeroId, { label: string; pose: HeroAction['pose']; hold: number }> = {
  awit: { label: 'Glide up for the patch', pose: 'glide', hold: 0.8 },
  dayo: { label: 'Lift it for the patch', pose: 'work', hold: 1 },
  baging: { label: 'Stretch for the patch', pose: 'stretch', hold: 0.8 },
  sukat: { label: 'Scan for the patch', pose: 'scan', hold: 0.8 },
};

type CritterMove = 'flutter' | 'hover' | 'hop' | 'circle' | 'crawl';

/** How each kind of wildlife looks and moves where it is found. */
const CRITTER: Record<string, { mesh: string; n: number; move: CritterMove; dx: number; dz: number; y: number }> = {
  'd-butterfly': { mesh: 'butterfly', n: 4, move: 'flutter', dx: -3, dz: -3.6, y: 1.4 },
  'd-swallow': { mesh: 'swallow', n: 3, move: 'circle', dx: 0, dz: -2.4, y: 4.6 },
  'd-dragonfly': { mesh: 'dragonfly', n: 3, move: 'hover', dx: 0, dz: -3.4, y: -0.2 },
  'd-frog': { mesh: 'frog', n: 1, move: 'hop', dx: 0, dz: -2.4, y: 0 },
  'd-gecko': { mesh: 'gecko', n: 1, move: 'crawl', dx: -2.3, dz: 0, y: 2.2 },
  'd-sparrow': { mesh: 'sparrow', n: 3, move: 'hop', dx: 1.4, dz: -2, y: 0 },
};

/**
 * Adds the zone's hidden patches and its wildlife to the world. Each patch needs one
 * hero; wildlife is observed by Sukat from where the team stands, never handled.
 * `flagOn` says whether a run flag is set, for wildlife that returns after a cleanup.
 */
export function addExtras(ctx: MissionContext, flagOn: (flag: string) => boolean): { tick: (dt: number) => void } {
  const g = ctx.game;
  const zone = g.zoneId;
  const spots = g.zone.spots;
  const critters: { p: Prop; move: CritterMove; x: number; y: number; z: number; k: number }[] = [];
  const patches: { p: Prop; id: string }[] = [];
  let t = 0;
  let sparkle = 0;
  for (const c of COLLECTIBLES.filter((x) => x.zone === zone)) {
    const spot = spots[c.spot];
    const at = PATCH_AT[c.id];
    if (spot === undefined || at === undefined) {
      continue;
    }
    const [x, z] = spot;
    const p: Prop = { mesh: g.props.patch, x: x + at.dx, y: g.zone.height(x + at.dx, z + at.dz) + at.y, z: z + at.dz, yaw: 0, scale: 1, visible: () => !ctx.hasCollected(c.id) };
    g.worldProps.push(p);
    patches.push({ p, id: c.id });
    const hero = c.hero ?? 'dayo';
    const act = PATCH_ACTION[hero];
    const action: HeroAction = {
      label: act.label,
      hold: act.hold,
      pose: act.pose,
      run: () => {
        if (ctx.collect(c.id)) {
          g.burst('sparkle', p.x, p.y, p.z, 12);
          g.audio.play('star');
        }
      },
    };
    g.interactions.push({
      id: `patch-${c.id}`,
      x,
      z,
      radius: 2.2,
      stretchRadius: c.hero === 'baging' ? 3.6 : undefined,
      suggest: c.hero ?? undefined,
      when: () => !ctx.hasCollected(c.id),
      by: c.hero === null ? anyHero(action) : { [c.hero]: action },
    });
  }
  for (const d of DISCOVERIES.filter((x) => x.zone === zone)) {
    const spot = spots[d.spot];
    const look = CRITTER[d.id];
    if (spot === undefined || look === undefined) {
      continue;
    }
    const [x, z] = spot;
    const shown = (): boolean => d.afterFlag === undefined || flagOn(d.afterFlag);
    for (let i = 0; i < look.n; i += 1) {
      const cx = x + look.dx + (i - (look.n - 1) / 2) * 0.9;
      const cz = z + look.dz + (i % 2) * 0.5;
      const cy = (g.zone.waterY !== null && look.move === 'hover' ? g.zone.waterY : g.zone.height(cx, cz)) + look.y + 0.4;
      const p: Prop = { mesh: g.props[look.mesh], x: cx, y: cy, z: cz, yaw: i, scale: 1, visible: shown };
      g.worldProps.push(p);
      critters.push({ p, move: look.move, x: cx, y: cy, z: cz, k: i * 1.7 });
    }
    g.interactions.push({
      id: `observe-${d.id}`,
      x,
      z,
      radius: 3.2,
      suggest: 'sukat',
      when: () => shown() && !ctx.hasDiscovered(d.id),
      by: {
        sukat: {
          label: `Observe: ${d.name.toLowerCase()}`,
          hold: 1,
          pose: 'scan',
          run: async () => {
            g.audio.play('scan');
            if (ctx.discover(d.id)) {
              g.busy = true;
              await ctx.hud.say('Sukat', 'sukat', `${d.name}! ${d.fact}`);
              g.busy = false;
              ctx.hud.setHudHidden(false);
            }
          },
        },
      },
    });
  }
  return {
    tick: (dt: number) => {
      t += dt;
      const calm = ctx.reduceMotion() ? 0.35 : 1;
      for (const c of critters) {
        const k = t * calm + c.k;
        if (c.move === 'flutter') {
          c.p.x = c.x + Math.sin(k * 0.9) * 1.6;
          c.p.z = c.z + Math.cos(k * 0.7) * 1.2;
          c.p.y = c.y + Math.abs(Math.sin(k * 3.1)) * 0.5;
          c.p.yaw = k * 0.9 + Math.sin(k * 6) * 0.4;
          c.p.scale = 0.8 + Math.abs(Math.sin(k * 14)) * 0.4;
        } else if (c.move === 'hover') {
          c.p.x = c.x + Math.sin(k * 0.6) * 2.2 + Math.sin(k * 3) * 0.2;
          c.p.z = c.z + Math.cos(k * 0.45) * 1;
          c.p.y = c.y + Math.sin(k * 2) * 0.15;
          c.p.yaw = Math.cos(k * 0.6);
        } else if (c.move === 'circle') {
          c.p.x = c.x + Math.sin(k * 0.8) * 4;
          c.p.z = c.z + Math.cos(k * 0.8) * 4;
          c.p.y = c.y + Math.sin(k * 1.7) * 0.6;
          c.p.yaw = k * 0.8 + Math.PI / 2;
        } else if (c.move === 'hop') {
          const hop = (k * 0.7) % 1;
          c.p.y = c.y + (hop < 0.25 ? Math.sin((hop / 0.25) * Math.PI) * 0.35 : 0);
          c.p.x = c.x + Math.sin(Math.floor(k * 0.7) * 2.3) * 0.6;
          c.p.z = c.z + Math.cos(Math.floor(k * 0.7) * 1.7) * 0.6;
          c.p.yaw = Math.floor(k * 0.7) * 1.3;
        } else {
          c.p.z = c.z + Math.sin(k * 0.3) * 0.8;
          c.p.yaw = Math.cos(k * 0.3) > 0 ? 0 : Math.PI;
        }
      }
      for (const pt of patches) {
        pt.p.yaw = t * 1.2;
      }
      /* Sukat's lens: what is hidden nearby glints now and then. */
      sparkle -= dt;
      if (ctx.hasGear('lens') && sparkle <= 0) {
        sparkle = 1.1;
        const h = g.heroes[g.active];
        for (const pt of patches) {
          if (!ctx.hasCollected(pt.id) && Math.hypot(pt.p.x - h.x, pt.p.z - h.z) < 14) {
            g.burst('sparkle', pt.p.x, pt.p.y + 0.2, pt.p.z, 3);
          }
        }
      }
    },
  };
}

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
  private extrasTick: ((dt: number) => void) | null = null;

  constructor(protected readonly ctx: MissionContext) {}

  /** Call after the zone's own interactions are set: adds its patches and wildlife. */
  protected extras(): void {
    this.extrasTick = addExtras(this.ctx, (f) => this.has(f)).tick;
  }

  protected tickExtras(dt: number): void {
    this.extrasTick?.(dt);
  }

  /** The team cheers, with confetti. */
  protected cheer(): void {
    this.ctx.game.celebrate();
  }

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

  /**
   * Where the arrow should point so it never leads into a wall: if the straight line to the
   * target crosses a building, the corner that makes the shortest way round comes first.
   */
  protected around(target: [number, number] | null | undefined, zone: ZoneId, boxes: readonly { x0: number; z0: number; x1: number; z1: number }[]): [number, number] | null {
    const g = this.ctx.game;
    /* Only in the place these buildings stand; a spot not in this place is no target at all. */
    if (target === null || target === undefined || g.zoneId !== zone) {
      return target ?? null;
    }
    const h = g.heroes[g.active];
    const crosses = (ax: number, az: number, bx: number, bz: number, b: { x0: number; z0: number; x1: number; z1: number }): boolean => {
      for (let i = 1; i < 24; i += 1) {
        const x = ax + ((bx - ax) * i) / 24;
        const z = az + ((bz - az) * i) / 24;
        if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) {
          return true;
        }
      }
      return false;
    };
    const clear = (a: [number, number], b: [number, number]): boolean => boxes.every((box) => !crosses(a[0], a[1], b[0], b[1], box));
    const here: [number, number] = [h.x, h.z];
    if (clear(here, target)) {
      return target;
    }
    /* Shortest way round, through building corners that can be stood on. */
    const m = 1.2;
    const nodes: [number, number][] = [here];
    for (const b of boxes) {
      for (const c of [[b.x0 - m, b.z0 - m], [b.x1 + m, b.z0 - m], [b.x0 - m, b.z1 + m], [b.x1 + m, b.z1 + m]] as [number, number][]) {
        const reached = Math.hypot(c[0] - h.x, c[1] - h.z) < 1;
        if (!reached && g.zone.walkable(c[0], c[1]) && boxes.every((box) => !(c[0] > box.x0 && c[0] < box.x1 && c[1] > box.z0 && c[1] < box.z1))) {
          nodes.push(c);
        }
      }
    }
    nodes.push(target);
    const n = nodes.length;
    const dist = nodes.map((_, i) => (i === 0 ? 0 : Infinity));
    const first = nodes.map(() => -1);
    const done = nodes.map(() => false);
    for (let k = 0; k < n; k += 1) {
      let u = -1;
      for (let i = 0; i < n; i += 1) {
        if (!done[i] && (u < 0 || dist[i] < dist[u])) {
          u = i;
        }
      }
      if (u < 0 || dist[u] === Infinity) {
        break;
      }
      done[u] = true;
      for (let v = 0; v < n; v += 1) {
        if (done[v] || !clear(nodes[u], nodes[v])) {
          continue;
        }
        const d = dist[u] + Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1]);
        if (d < dist[v]) {
          dist[v] = d;
          first[v] = u === 0 ? v : first[u];
        }
      }
    }
    const step = first[n - 1];
    /* A corner already reached hands over to the next one. */
    return step > 0 ? nodes[step] : target;
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
