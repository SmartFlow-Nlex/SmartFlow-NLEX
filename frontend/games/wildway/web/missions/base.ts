import type { Upgrade } from '../../core/facility';
import { currentStep, hasFlag, type MissionDef, type MissionRun, type ZoneId } from '../../core/mission';
import type { LaneMode, PlazaProblem } from '../../core/plaza';
import { COLLECTIBLES, discoveryFor, type FaunaKind, type GearId } from '../../core/progression';
import type { Actor } from '../anim';
import type { Agent } from '../fauna';
import { wildlifeFor } from '../world/wildlife';
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
  /** Eco Delivery Rush's vehicle choice: sets the run's plan. False if the player backs out. */
  chooseVehicle: () => Promise<boolean>;
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

export interface ExtrasOptions {
  /** A photo of this kind is wanted now even if it is already in the field notes: a mission or quest step. */
  wants?: (kind: FaunaKind) => boolean;
  /** Told about every photo taken, after the field note is written. */
  onPhoto?: (kind: FaunaKind, agent: Agent) => void;
}

export function addExtras(ctx: MissionContext, flagOn: (flag: string) => boolean, opts: ExtrasOptions = {}): { tick: (dt: number) => void } {
  const g = ctx.game;
  const zone = g.zoneId;
  const spots = g.zone.spots;
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
  /* The animals that live here, and a photo button for each kind that follows the nearest one. */
  const plan = zone === null ? [] : wildlifeFor(zone, { flag: flagOn });
  for (const sp of plan) {
    g.fauna.spawn(sp);
  }
  const photos: { kind: FaunaKind; it: Interaction; agent: Agent | null }[] = [];
  for (const kind of Array.from(new Set(plan.map((p) => p.kind)))) {
    const d = discoveryFor(kind);
    if (d === null) {
      continue;
    }
    const entry: { kind: FaunaKind; it: Interaction; agent: Agent | null } = { kind, agent: null, it: null as unknown as Interaction };
    const wanted = (): boolean => !ctx.hasDiscovered(d.id) || (opts.wants?.(kind) ?? false);
    const snap = async (): Promise<void> => {
      const a = entry.agent;
      if (a === null) {
        return;
      }
      /* Like a real camera: frame the animal for a moment (even the owl up its tree), then the flash. */
      const h = g.heroes[g.active];
      const dx = a.x - h.x;
      const dz = a.z - h.z;
      const dd = Math.hypot(dx, dz) || 1;
      const ux = dx / dd;
      const uz = dz / dd;
      /* High in a tree, look down on it from above the leaves; the eagle from below; the rest at eye level. */
      const high = a.y - g.zone.height(a.x, a.z) > 3;
      const big = kind === 'egret' || kind === 'macaque' || kind === 'owl';
      const back = kind === 'eagle' ? 13 : high ? 5.2 : big ? 4.4 : 2.8;
      const side = kind === 'eagle' ? 1.1 : big ? 1.6 : 2.1;
      const lift = kind === 'eagle' ? -7 : high ? 2.8 : 0.9;
      g.busy = true;
      g.photoCut = true;
      g.fauna.notice(a, { x: a.x - ux * back, z: a.z - uz * back });
      /* The camera follows the animal while it frames it: swallows and the eagle keep flying. */
      const frame = (): void => {
        const ty = a.y + 0.2 * a.scale;
        g.cameraTo([a.x - ux * back - uz * side, ty + lift, a.z - uz * back + ux * side], [a.x, ty, a.z], 6);
      };
      const zoom = ctx.reduceMotion() ? 0.35 : 0.75;
      for (let t = 0; t < zoom; t += 1 / 20) {
        frame();
        await ctx.wait(1 / 20);
      }
      g.audio.play('snap');
      ctx.hud.flash();
      g.burst('sparkle', a.x, a.y + 0.35 * a.scale, a.z, 6);
      const fresh = ctx.discover(d.id);
      if (!fresh) {
        ctx.hud.notice(`Photo: ${d.name}`, 1.6);
      }
      await ctx.wait(ctx.reduceMotion() ? 0.3 : 0.6);
      g.releaseCamera();
      g.photoCut = false;
      g.busy = false;
      opts.onPhoto?.(kind, a);
    };
    const label = `Photo: ${d.name}`;
    const by = anyHero({ label, hold: 0.4, run: snap });
    by.sukat = { label, hold: 0.4, pose: 'scan', run: snap };
    /* From a distance: the eagle overhead, the owl in its tree, the rest a few steps away. */
    const radius = kind === 'eagle' ? 30 : kind === 'owl' ? 12 : kind === 'swallow' ? 5 : kind === 'fish' || kind === 'dragonfly' ? 8.5 : 7;
    /* Birds flying overhead lose to an animal right in front of the team. */
    entry.it = { id: `photo-${kind}`, x: 0, z: 0, radius, priority: kind === 'swallow' || kind === 'eagle' ? -2 : -1, when: () => entry.agent !== null && wanted(), by };
    g.interactions.push(entry.it);
    photos.push(entry);
  }
  return {
    tick: (dt: number) => {
      t += dt;
      const h0 = g.heroes[g.active];
      for (const ph of photos) {
        ph.agent = g.fauna.nearest(ph.kind, h0.x, h0.z);
        if (ph.agent !== null) {
          ph.it.x = ph.agent.x;
          ph.it.z = ph.agent.z;
        }
      }
      for (const pt of patches) {
        pt.p.yaw = t * 1.2;
      }
      /* Sukat's lens: what is hidden nearby glints now and then, animals not yet photographed too. */
      sparkle -= dt;
      if (ctx.hasGear('lens') && sparkle <= 0) {
        sparkle = 1.1;
        const h = g.heroes[g.active];
        for (const pt of patches) {
          if (!ctx.hasCollected(pt.id) && Math.hypot(pt.p.x - h.x, pt.p.z - h.z) < 14) {
            g.burst('sparkle', pt.p.x, pt.p.y + 0.2, pt.p.z, 3);
          }
        }
        for (const ph of photos) {
          const a = ph.agent;
          const d = discoveryFor(ph.kind);
          if (a !== null && d !== null && !ctx.hasDiscovered(d.id) && Math.hypot(a.x - h.x, a.z - h.z) < 14) {
            g.burst('sparkle', a.x, a.y + 0.5 * a.scale, a.z, 2);
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
  protected extras(opts: ExtrasOptions = {}): void {
    this.extrasTick = addExtras(this.ctx, (f) => this.has(f), opts).tick;
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

  /** The first moment in a place: the camera on whoever greets the team, one short line, then play. */
  protected async greet(n: Actor | null, speaker: string, portrait: string, text: string): Promise<void> {
    await this.scene(async () => {
      if (n !== null) {
        this.faceAndFrame(n);
        n.pose = 'wave';
      }
      await this.say(speaker, portrait, text);
      if (n !== null) {
        n.pose = 'none';
      }
    });
  }

  /** A step is done: a check, a sparkle and a happy sound. */
  protected stepDone(x: number, y: number, z: number): void {
    const g = this.ctx.game;
    g.burst('sparkle', x, y, z, 10);
    g.audio.play('star');
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
