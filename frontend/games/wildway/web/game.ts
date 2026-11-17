import type { MissionRun } from '../core/mission';
import { newActor, pose, poseBird, react, type Actor, type ActionPose, type BirdState, type Expr } from './anim';
import type { GameAudio } from './audio';
import { Fauna } from './fauna';
import { angleTo, clamp, ease, lerp, placement, mat4, type Vec3 } from './gl/math';
import { MeshBuilder } from './gl/builder';
import type { Mesh, Renderer } from './gl/renderer';
import type { InputController } from './input';
import { makeAwit, makeBaging, makeChief, makeDayo, makeDriver, makeHornbill, makeOfficer, makeRanger, makeResident, makeSpecialist, makeSukat, makeVet, makeVehicle, type HeroId, type VehicleKind } from './models';
import type { ZoneId } from '../core/mission';
import type { Texture } from './gl/renderer';
import { buildDepot, buildNlexProps, buildPlaza, buildRiver, buildYard } from './world/nlexZones';
import { BRIDGE, buildForest, buildForestProps, buildStation, creekZ, type Zone } from './world/zones';

/**
 * The live 3D world: the loaded zone, the team, the camera and the rules of moving
 * around. It knows nothing about any particular mission: missions (hornbill.ts) give it
 * interactions and props, and it reports what the player does.
 */

export const HERO_ORDER: readonly HeroId[] = ['dayo', 'baging', 'sukat', 'awit'];

export interface HeroAction {
  label: string;
  /** Seconds to hold; 0 for a tap. */
  hold: number;
  pose?: ActionPose;
  run: () => void | Promise<void>;
}

/** Something the player can do at a spot. Different heroes can solve it in different ways. */
export interface Interaction {
  id: string;
  x: number;
  z: number;
  radius: number;
  /** Baging's stretch reaches further. */
  stretchRadius?: number;
  by: Partial<Record<HeroId, HeroAction>>;
  when: () => boolean;
  /** Who to suggest when the active hero cannot do it. */
  suggest?: HeroId;
  /** Lower loses: an animal's photo button never hides a mission's button. */
  priority?: number;
}

export interface Prop {
  mesh: Mesh;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  visible: () => boolean;
}

interface Follow {
  x: number;
  z: number;
}

/** Something just picked up, flying in a little arc to the hero before it vanishes. */
interface Flyer {
  mesh: Mesh;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  t: number;
}

/** What a hero is walking on, for the sound of their steps. */
export type Surface = 'grass' | 'hard' | 'wood' | 'water';

/** Little bursts of feedback: sparks off a repair, confetti, splashes, leaves, a sparkle. */
export type BurstKind = 'spark' | 'confetti' | 'splash' | 'leaf' | 'sparkle' | 'dust';

interface Particle {
  mesh: Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  spin: number;
  yaw: number;
  scale: number;
  gravity: number;
}

const MAX_PARTICLES = 90;

const SPEED: Record<HeroId, number> = { dayo: 6.2, baging: 5.6, sukat: 5.2, awit: 6.6 };
/* A touch closer than before, for the rounder, shorter cast: faces read without hiding the world.
   This is also the closest the player can zoom: pinching only pulls back from here, up to CAMERA_DIST_MAX. */
const CAMERA_DIST = 10.6;
export const CAMERA_DIST_MIN = CAMERA_DIST;
export const CAMERA_DIST_MAX = CAMERA_DIST * 1.9;
/** Pulled right back, the camera also tilts this much further down, so roofs and canopies near it don't hide the team. */
const ZOOM_TILT = 0.2;
/** What the follow camera looks at, above the leader's feet. */
const CAMERA_AIM = 1.15;
const CAMERA_FOV = 0.8;
/** Followers: how many trail points behind the leader, and how far to the side. The third walks wide
    and a little further back, never straight down the camera's line of sight. */
const FORMATION: readonly (readonly [number, number])[] = [
  [3, 1.8],
  [3, -1.8],
  [6, 2.9],
];
/** How fast the leader picks up speed and settles: quick enough to feel instant, soft enough not to snap. */
const ACCEL = 24;
const DECEL = 20;
/** Teammates never crowd closer than this, to each other or to the leader. */
const PERSONAL_SPACE = 1.2;
/** Followers fade out smoothly as they come right up to the lens, instead of popping out of view. */
const LENS_FADE_NEAR = 3.4;
const LENS_FADE_FAR = 5.4;
/** Anything drawn with the cut also thins out this close to the lens (big props beside the camera). */
const LENS_CLEAR = 3.6;

export class Game {
  zone!: Zone;
  zoneId: ZoneId | null = null;
  /** Pictures by name, for the zone's images. Filled by the app. */
  textures: Record<string, Texture> = {};
  /** The water's colours and flow: missions make it murky or clear. */
  water = { deep: [0.16, 0.56, 0.8] as Vec3, shallow: [0.27, 0.74, 0.9] as Vec3, foam: [0.93, 0.98, 1] as Vec3, flow: 1 };
  /** Above 0 while it rains in this place: the app draws rain over the world. Reset with every place. */
  rain = 0;
  props: Record<string, Mesh> = {};
  worldProps: Prop[] = [];
  dynamicColliders: () => { x: number; z: number; r: number }[] = () => [];
  bridgeOpen = (): boolean => false;
  interactions: Interaction[] = [];
  /** Where the on-screen guide points. */
  guide: [number, number] | null = null;
  heroes!: Record<HeroId, Actor>;
  active: HeroId = 'dayo';
  npcs: Record<string, Actor> = {};
  bird!: Actor;
  birdState: BirdState = { hurt: 1, flap: 0, alert: 0 };
  birdVisible = false;
  /** Bird sprites are kept out of this radius until the specialist has assessed it. */
  keepOut: { x: number; z: number; r: number; text: string } | null = null;
  carrying: { id: string; mesh: Mesh }[] = [];
  /** True during scripted moments: no walking, no acting. */
  busy = false;
  paused = false;
  time = 0;
  frame = 0;
  fps = 60;
  /** Called with the crate or carried things etc. */
  onNotice: ((text: string) => void) | null = null;
  run: MissionRun | null = null;
  heldFor = 0;
  holding: Interaction | null = null;
  private lastAction: Interaction | null = null;
  private camYaw = 0;
  private camPitch = 0.46;
  private camDist = CAMERA_DIST;
  /** Where the player's zoom is heading; camDist eases toward it. */
  private camZoom = CAMERA_DIST;
  private camFree = 0;
  private target: Vec3 = [0, 0, 0];
  eye: Vec3 = [0, 3, -8];
  private override: { eye: Vec3; target: Vec3; k: number } | null = null;
  private trail: Follow[] = [];
  private lastSafe = { x: 0, z: 0 };
  private readonly model = mat4();
  private vehicleMeshes: Partial<Record<VehicleKind, Mesh>> = {};
  private glideLeft = 0;
  gliding = false;
  private beaconT = 0;
  private lastNotice = 0;
  highDetail = true;
  showShadows = true;
  /** Workshop gear: walking speed, kite time and vine reach. Set by the app from the save. */
  speedBoost = 1;
  glideMax = 4.5;
  vinesExtra = 0;
  /** Fewer, gentler particles. */
  reduceMotion = false;
  /** Whether the beacon is drawn: the guidance setting, or a hint just asked for. */
  showBeacon = true;
  private particles: Particle[] = [];
  private particleMeshes: Record<BurstKind, Mesh[]> = { spark: [], confetti: [], splash: [], leaf: [], sparkle: [], dust: [] };
  private cheerLeft = 0;
  /** The leader's short victory dance after a step. */
  private winLeft = 0;
  /** For leaning into turns, and for noticing animals and greeting people. */
  private readonly prevYaw = new Map<Actor, number>();
  private readonly lookAt = new Map<Actor, { x: number; y: number; z: number; id: number } | null>();
  private readonly greeted = new Map<Actor, number>();
  private lookTick = 0;
  private readonly upgradesAtBuild: { list: readonly string[] } = { list: [] };
  /** Each hero's velocity (the leader's eases toward the stick; followers steer), and where it stood last frame. */
  private readonly vel = new Map<Actor, { x: number; z: number; stuck: number }>();
  private readonly lastPos = new Map<Actor, { x: number; z: number; speed: number }>();
  /** Things just picked up, on their way to the hero. */
  private flyers: Flyer[] = [];
  private readonly propSeen = new WeakMap<Prop, boolean>();
  /** For a moment after switching heroes, the camera glides across rather than snapping. */
  private switchBlend = 0;
  /** The leader turns to face what it just used. */
  private faceTo: { yaw: number; t: number } | null = null;
  /** The small prop at the spot in reach, which bobs to say "this one". */
  private highlighted: Prop | null = null;
  /** Told about each footstep of the leader. */
  onStep: ((surface: Surface) => void) | null = null;
  /** The animals living in the loaded zone. */
  readonly fauna: Fauna;
  /** Taking a photo: leaves between the lens and the animal fade out of the way. */
  photoCut = false;

  constructor(
    readonly r: Renderer,
    readonly audio: GameAudio,
    private readonly input: InputController,
  ) {
    this.heroes = {
      dayo: newActor('dayo', makeDayo(r), 0, 0, 0),
      baging: newActor('baging', makeBaging(r), 0, 0, 0),
      sukat: newActor('sukat', makeSukat(r), 0, 0, 0),
      awit: newActor('awit', makeAwit(r), 0, 0, 0),
    };
    this.npcs = {
      ranger: newActor('person', makeRanger(r), 0, 0, 0),
      vet: newActor('person', makeVet(r), 0, 0, 0),
      joy: newActor('person', makeResident(r, '#ef6c8f', '#3a4a7a'), 0, 0, 0),
      ernesto: newActor('person', makeResident(r, '#f0a24a', '#4a5a3a', '#a06a42'), 0, 0, 0),
      paz: newActor('person', makeOfficer(r), 0, 0, 0),
      bautista: newActor('person', makeSpecialist(r), 0, 0, 0),
      ramos: newActor('person', makeChief(r), 0, 0, 0),
      driver1: newActor('person', makeDriver(r, '#e2452f'), 0, 0, 0),
      driver2: newActor('person', makeDriver(r, '#2fae6b'), 0, 0, 0),
      driver3: newActor('person', makeDriver(r, '#7d5cff'), 0, 0, 0),
      ben: newActor('person', makeDriver(r, '#ffc32d'), 0, 0, 0),
      tech: newActor('person', makeDriver(r, '#14995c'), 0, 0, 0),
      staff: newActor('person', makeResident(r, '#1e5bb8', '#33405a', '#8d5a3b'), 0, 0, 0),
    };
    this.buildParticles();
    this.fauna = new Fauna(r);
    this.bird = newActor('bird', makeHornbill(r), 0, 0, 0, 0, 1.3);
    input.onSwitch = (i) => {
      if (!this.busy && !this.paused) {
        this.switchHero(HERO_ORDER[i]);
      }
    };
    input.onCycle = () => {
      if (!this.busy && !this.paused) {
        this.switchHero(HERO_ORDER[(HERO_ORDER.indexOf(this.active) + 1) % HERO_ORDER.length]);
      }
    };
  }

  vehicleMesh(kind: VehicleKind): Mesh {
    let m = this.vehicleMeshes[kind];
    if (m === undefined) {
      m = makeVehicle(this.r, kind);
      this.vehicleMeshes[kind] = m;
    }
    return m;
  }

  /** Swaps the zone: frees the old one, builds the new one. */
  loadZone(id: ZoneId, upgrades: readonly string[]): void {
    if (this.zoneId !== null && this.zone !== undefined) {
      this.r.release(this.zone.meshes);
    }
    this.upgradesAtBuild.list = upgrades;
    const builders: Record<ZoneId, () => Zone> = {
      forest: () => buildForest(this.r),
      station: () => buildStation(this.r, upgrades),
      plaza: () => buildPlaza(this.r),
      river: () => buildRiver(this.r),
      depot: () => buildDepot(this.r),
      yard: () => buildYard(this.r),
    };
    this.zone = builders[id]();
    this.zoneId = id;
    if (Object.keys(this.props).length === 0) {
      this.props = { ...buildForestProps(this.r), ...buildNlexProps(this.r) };
    }
    this.water = { deep: [0.16, 0.56, 0.8], shallow: [0.27, 0.74, 0.9], foam: [0.93, 0.98, 1], flow: 1 };
    this.worldProps = [];
    this.interactions = [];
    this.dynamicColliders = () => [];
    this.bridgeOpen = () => false;
    this.keepOut = null;
    this.rain = 0;
    this.guide = null;
    this.birdVisible = false;
    this.particles = [];
    this.flyers = [];
    this.highlighted = null;
    this.audio.setRegion(id === 'forest' || id === 'river' ? 'forest' : 'station', { traffic: id === 'plaza' ? 1 : id === 'yard' || id === 'depot' ? 0.45 : 0, water: id === 'river' || id === 'forest' ? (id === 'river' ? 1 : 0.6) : 0 });
    this.audio.setHum(0);
    /* A fresh set of animals for the new place: the mission or the hub fills it. */
    const z = this.zone;
    const plaza = id === 'plaza';
    this.fauna.clear({
      height: (x, zz) => z.height(x, zz),
      waterY: z.waterY,
      water: (x, zz) => z.waterY !== null && z.height(x, zz) < z.waterY - 0.3,
      land: (x, zz) =>
        (z.waterY === null || z.height(x, zz) > z.waterY + 0.12) &&
        !z.colliders.some((c) => Math.hypot(c.x - x, c.z - zz) < c.r + 0.25) &&
        (!plaza || Math.abs(x) > 18.8) &&
        Math.abs(x) < 70 &&
        Math.abs(zz) < 80,
      perches: z.perches ?? [],
      flowers: z.flowers ?? [],
      burst: (kind, x, y, zz, n) => this.burst(kind, x, y, zz, n),
    });
    for (const npc of Object.values(this.npcs)) {
      npc.visible = false;
    }
  }

  ground(x: number, z: number): number {
    const h = this.zone.height(x, z);
    const deck = this.deckAt(x, z);
    if (deck !== null) {
      return Math.max(h, deck);
    }
    return this.zone.waterY === null ? h : Math.max(h, this.zone.waterY);
  }

  /** Where the arrow points right now. A target over the creek means the crossing comes first. */
  get guideNow(): [number, number] | null {
    if (this.guide === null) {
      return null;
    }
    /* Any zone split by water: the forest's creek, or a zone that says which side is which. */
    const forest = this.zone.id === 'forest';
    const sideOf = forest ? (x: number, z: number): number => z - creekZ(x) : this.zone.side;
    const bridge = forest ? { x: 0, z: creekZ(0), halfLength: BRIDGE.halfLength } : this.zone.bridges?.[0];
    if (sideOf === undefined || bridge === undefined) {
      return this.guide;
    }
    const h = this.heroes[this.active];
    const heroSide = sideOf(h.x, h.z);
    const targetSide = sideOf(this.guide[0], this.guide[1]);
    if (heroSide * targetSide >= 0) {
      return this.guide;
    }
    const end = (side: number): [number, number] => [bridge.x, bridge.z + Math.sign(side) * (bridge.halfLength + 0.8)];
    const near = end(heroSide);
    if (this.onBridge(h.x, h.z) || Math.hypot(h.x - near[0], h.z - near[1]) < 1.8) {
      return end(targetSide);
    }
    return near;
  }

  private onBridge(x: number, z: number): boolean {
    return this.deckAt(x, z) !== null;
  }

  /** The deck height of a walkable bridge here, or null. The forest's opens with the mission. */
  private deckAt(x: number, z: number): number | null {
    if (this.zone.id === 'forest') {
      return this.bridgeOpen() && Math.abs(x) < BRIDGE.halfWidth && Math.abs(z - creekZ(0)) < BRIDGE.halfLength ? BRIDGE.deck : null;
    }
    for (const b of this.zone.bridges ?? []) {
      if (Math.abs(x - b.x) < b.halfWidth && Math.abs(z - b.z) < b.halfLength) {
        return b.deck;
      }
    }
    return null;
  }

  /** Puts the whole team at a spot, the leader facing `yaw`. */
  /** Somewhere a hero can stand, at or near (x, z): a spawn spot can never trap anyone. */
  standableNear(x: number, z: number): [number, number] {
    const ok = (px: number, pz: number): boolean =>
      (this.zone.walkable(px, pz) || this.onBridge(px, pz)) && this.zone.colliders.every((c) => Math.hypot(c.x - px, c.z - pz) > c.r + 0.45);
    if (ok(x, z)) {
      return [x, z];
    }
    for (let r = 0.5; r <= 10; r += 0.5) {
      for (let k = 0; k < 24; k += 1) {
        const a = (k / 24) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (ok(px, pz)) {
          return [px, pz];
        }
      }
    }
    return [x, z];
  }

  placeTeam(x0: number, z0: number, yaw: number): void {
    const [x, z] = this.standableNear(x0, z0);
    const list = HERO_ORDER.filter((h) => h !== this.active);
    const lead = this.heroes[this.active];
    lead.x = x;
    lead.z = z;
    lead.y = this.ground(x, z);
    lead.yaw = yaw;
    this.lastSafe = { x, z };
    this.trail = [];
    this.faceTo = null;
    list.forEach((id, i) => {
      const a = this.heroes[id];
      /* In the formation's own places, so nobody has to shuffle into line after a fade. */
      const [backPts, side] = FORMATION[i];
      const back = backPts * 0.45 + 0.4;
      const [fx, fz] = this.standableNear(x - Math.sin(yaw) * back + Math.cos(yaw) * side, z - Math.cos(yaw) * back - Math.sin(yaw) * side);
      a.x = fx;
      a.z = fz;
      a.y = this.ground(a.x, a.z);
      a.yaw = yaw;
    });
    for (const id of HERO_ORDER) {
      const a = this.heroes[id];
      this.vel.set(a, { x: 0, z: 0, stuck: 0 });
      this.lastPos.set(a, { x: a.x, z: a.z, speed: 0 });
      a.moveAmt = 0;
    }
    this.camYaw = yaw;
    this.snapCamera();
  }

  placeNpc(id: string, x: number, z: number, yaw: number): void {
    const n = this.npcs[id];
    n.x = x;
    n.z = z;
    n.y = this.ground(x, z);
    n.yaw = yaw;
    n.visible = true;
  }

  switchHero(id: HeroId): void {
    if (id === this.active || this.busy || this.carrying.length > 0) {
      if (this.carrying.length > 0 && id !== this.active) {
        this.notice('Put down what you are carrying first.');
        this.audio.play('deny');
      }
      return;
    }
    const old = this.heroes[this.active];
    const next = this.heroes[id];
    old.pose = 'none';
    this.active = id;
    next.squash = 1;
    next.hopT = 0.42;
    react(next, 'happy', 0.9);
    this.gliding = false;
    this.audio.play('switch');
    this.holding = null;
    this.heldFor = 0;
    this.trail = [];
    this.faceTo = null;
    this.switchBlend = 0.7;
    /* The old leader keeps its momentum as a follower; the new one starts from where it stands. */
    this.vel.set(next, { x: 0, z: 0, stuck: 0 });
    void old;
  }

  notice(text: string): void {
    if (this.time - this.lastNotice > 1.2) {
      this.lastNotice = this.time;
      this.onNotice?.(text);
    }
  }

  /** The last answer of `nearby`, for the rest of the frame: the HUD, the look, the ring and the bob all ask. */
  private nearCache: { frame: number; x: number; z: number; active: HeroId; count: number; value: { it: Interaction; action: HeroAction | null } | null } | null = null;

  /** The interaction the active hero is standing at, whoever can do it. */
  nearby(): { it: Interaction; action: HeroAction | null } | null {
    const h = this.heroes[this.active];
    const c = this.nearCache;
    if (c !== null && c.frame === this.frame && c.x === h.x && c.z === h.z && c.active === this.active && c.count === this.interactions.length) {
      return c.value;
    }
    const value = this.findNearby();
    this.nearCache = { frame: this.frame, x: h.x, z: h.z, active: this.active, count: this.interactions.length, value };
    return value;
  }

  private findNearby(): { it: Interaction; action: HeroAction | null } | null {
    const h = this.heroes[this.active];
    let best: Interaction | null = null;
    let bestD = Infinity;
    for (const it of this.interactions) {
      if (!it.when()) {
        continue;
      }
      const reach = this.active === 'baging' && it.stretchRadius !== undefined ? it.stretchRadius + this.vinesExtra : it.radius;
      const d = Math.hypot(h.x - it.x, h.z - it.z);
      /* Anything with a lower priority only wins when nothing else is in reach. */
      const score = d - (it.priority ?? 0) * 1000;
      if (d < reach && score < bestD) {
        best = it;
        bestD = score;
      }
    }
    if (best === null) {
      return null;
    }
    return { it: best, action: best.by[this.active] ?? null };
  }

  /* ---- Camera for scripted moments ---- */

  cameraTo(eye: Vec3, target: Vec3, k = 3): void {
    this.override = { eye, target, k };
  }

  releaseCamera(): void {
    this.override = null;
  }

  /**
   * Following a vehicle as it drives away: behind it and a little to the side, high enough to see over
   * the fence and never down in the ground, easing along so it reads as one smooth shot.
   */
  chaseCamera(x: number, z: number, yaw: number): void {
    const ex = x - Math.sin(yaw) * 11 + Math.cos(yaw) * 4;
    const ez = z - Math.cos(yaw) * 11 - Math.sin(yaw) * 4;
    const ey = Math.max(this.ground(x, z) + 6.5, this.zone.height(ex, ez) + 4.5);
    this.cameraTo([ex, ey, ez], [x + Math.sin(yaw) * 3, this.ground(x, z) + 1, z + Math.cos(yaw) * 3], 2.4);
  }

  /**
   * Someone talking, framed over the shoulder with their face above the speech bubble: the usual angle,
   * unless something big (a van, a shelf, a wall) would fill the frame from there; then the clearest of
   * a few others, a little further back so the hero shows too.
   */
  frameTalk(n: Actor): void {
    const toHero = n.yaw;
    const target: Vec3 = [n.x, n.y + 0.55, n.z];
    let best = { eye: [n.x + Math.sin(toHero + 0.75) * 5.4, n.y + 2.1, n.z + Math.cos(toHero + 0.75) * 5.4] as Vec3, off: 0.75, score: Infinity };
    for (const off of [0.75, -0.75, 1.1, -1.1, 0.4, -0.4, 1.7, -1.7, 2.4, -2.4, Math.PI]) {
      const view = toHero + off;
      const usual = off === 0.75;
      const dist = usual ? 5.4 : 6.6;
      const eye: Vec3 = [n.x + Math.sin(view) * dist, n.y + (usual ? 2.1 : 2.7), n.z + Math.cos(view) * dist];
      const score = this.viewBlock(eye, target) + Math.abs(Math.abs(off) - 0.75) * 0.3 + (off < 0 ? 0.05 : 0);
      if (score < best.score - 0.01) {
        best = { eye, off, score };
      }
    }
    /* From well round to the side, the speaker turns three-quarters to the lens, so the face always shows. */
    if (Math.abs(best.off) > 1.2) {
      n.yaw = toHero + best.off - Math.sign(best.off) * 0.55;
    }
    this.cameraTo(best.eye, target, 5);
  }

  /**
   * How badly something blocks a view from `eye` to `target`: props, colliders and buildings near the
   * lens or across the line of sight, and ground rising into it. 0 is a clear view. Scripted shots use
   * it to pick the clearest of a few angles.
   */
  viewBlock(eye: Vec3, target: Vec3): number {
    let score = 0;
    if (!this.zone.walkable(eye[0], eye[2]) && !this.onBridge(eye[0], eye[2])) {
      score += 1.5;
    }
    /* Big things nearer than the subject and inside the frame: the more of the view they would fill, the worse.
       Behind the subject they are just the setting. */
    const tx = target[0] - eye[0];
    const ty = target[1] - eye[1];
    const tz = target[2] - eye[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    for (const p of this.worldProps) {
      const rad = p.mesh.radius * p.scale;
      if (rad < 0.6 || !p.visible()) {
        continue;
      }
      const m = p.mesh;
      const c = Math.cos(p.yaw);
      const sn = Math.sin(p.yaw);
      const dx = p.x + (m.center[0] * c + m.center[2] * sn) * p.scale - eye[0];
      const dy = p.y + m.center[1] * p.scale - eye[1];
      const dz = p.z + (-m.center[0] * sn + m.center[2] * c) * p.scale - eye[2];
      const dl = Math.hypot(dx, dy, dz) || 1;
      if (dl - rad > tl - 0.3) {
        continue;
      }
      const size = Math.atan(rad / Math.max(0.5, dl));
      const off = Math.acos(clamp((dx * tx + dy * ty + dz * tz) / (dl * tl), -1, 1));
      if (off < CAMERA_FOV * 0.6 + size) {
        score += Math.max(0, size - 0.16) * 9;
      }
    }
    for (const c of this.zone.colliders) {
      const gap = Math.hypot(c.x - eye[0], c.z - eye[2]) - c.r;
      if (gap < 1.6) {
        score += (1.6 - gap) * 0.8;
      }
    }
    for (let i = 0; i <= 8; i += 1) {
      const t = (i / 8) * 0.85;
      const x = lerp(eye[0], target[0], t);
      const y = lerp(eye[1], target[1], t);
      const z = lerp(eye[2], target[2], t);
      /* Something right at the lens fills the frame; further along it only hides a part. */
      const w = 1.6 - t;
      if (this.zone.height(x, z) > y - 0.2) {
        score += w;
      }
      for (const c of this.zone.colliders) {
        if (Math.abs(c.x - x) < c.r + 0.6 && Math.abs(c.z - z) < c.r + 0.6 && Math.hypot(c.x - x, c.z - z) < c.r + 0.4) {
          score += w;
        }
      }
      for (const p of this.worldProps) {
        if (!p.visible()) {
          continue;
        }
        const m = p.mesh;
        const c = Math.cos(p.yaw);
        const sn = Math.sin(p.yaw);
        const cx = p.x + (m.center[0] * c + m.center[2] * sn) * p.scale;
        const cy = p.y + m.center[1] * p.scale;
        const cz = p.z + (-m.center[0] * sn + m.center[2] * c) * p.scale;
        if (Math.hypot(cx - x, cy - y, cz - z) < m.radius * p.scale * 0.85 + 0.3) {
          score += w * 1.2;
        }
      }
    }
    return score;
  }

  snapCamera(): void {
    this.camDist = this.camZoom;
    const h = this.heroes[this.active];
    this.target = [h.x, h.y + CAMERA_AIM, h.z];
    const pitch = this.viewPitch;
    const cp = Math.cos(pitch);
    this.eye = [h.x - Math.sin(this.camYaw) * cp * this.camDist, h.y + CAMERA_AIM + Math.sin(pitch) * this.camDist, h.z - Math.cos(this.camYaw) * cp * this.camDist];
  }

  get cameraYaw(): number {
    return this.camYaw;
  }

  /** The follow camera's distance and where the zoom is heading (for tests and the dev hooks). */
  get cameraDistance(): { now: number; target: number } {
    return { now: this.camDist, target: this.camZoom };
  }

  /** How far the player has zoomed out: 0 at the default view, 1 at the farthest. */
  private get zoomOut(): number {
    return clamp((this.camDist - CAMERA_DIST_MIN) / (CAMERA_DIST_MAX - CAMERA_DIST_MIN), 0, 1);
  }

  /** The follow camera's pitch: the player's, tilted down a little more as they zoom out. */
  private get viewPitch(): number {
    return Math.min(1.12, this.camPitch + ZOOM_TILT * this.zoomOut);
  }

  /* ---- One frame ---- */

  update(dt: number): void {
    this.time += dt;
    this.frame += 1;
    this.beaconT += dt;
    this.input.poll();
    /* Pinch, wheel, keys or triggers: never closer than the default view, at most CAMERA_DIST_MAX back. Ignored while paused. */
    const zoom = this.input.takeZoom();
    if (!this.paused && zoom !== 1) {
      this.camZoom = clamp(this.camZoom * zoom, CAMERA_DIST_MIN, CAMERA_DIST_MAX);
    }
    this.camDist += (this.camZoom - this.camDist) * ease(10, dt);
    this.switchBlend = Math.max(0, this.switchBlend - dt);
    if (!this.paused) {
      if (!this.busy) {
        this.moveActive(dt);
      } else {
        /* A scene stops the leader where it stands; the walk cycle settles from the measured speed. */
        const v = this.vel.get(this.heroes[this.active]);
        if (v !== undefined) {
          v.x = 0;
          v.z = 0;
        }
      }
      this.moveFollowers(dt);
      this.measureHeroes(dt);
      this.watchPickups();
      this.updateFlyers(dt);
    }
    if (!this.paused) {
      this.fauna.reduceMotion = this.reduceMotion;
      this.fauna.update(dt, HERO_ORDER.map((id) => this.heroes[id]));
      this.updateParticles(dt);
      if (this.cheerLeft > 0) {
        this.cheerLeft -= dt;
        for (const id of HERO_ORDER) {
          this.heroes[id].pose = this.cheerLeft > 0 ? 'cheer' : 'none';
        }
      }
      this.updateVictory(dt);
      this.updateLooks(dt);
    }
    const heroes = HERO_ORDER.map((id) => this.heroes[id]);
    for (const a of [...heroes, ...Object.values(this.npcs), this.bird]) {
      a.t += this.paused ? 0 : dt;
      a.squash *= 1 - ease(8, dt);
      if (a.kind === 'person' || a.kind === 'bird') {
        a.phase += a.moveAmt * dt * 11;
      }
      if (!this.paused) {
        a.exprT = Math.max(0, a.exprT - dt);
        a.hopT = Math.max(0, a.hopT - dt);
        a.waveT = Math.max(0, a.waveT - dt);
        a.reachT = Math.max(0, a.reachT - dt);
        /* Lean into turns: the turning rate, smoothed, and only when moving. */
        const was = this.prevYaw.get(a) ?? a.yaw;
        const rate = dt > 0 ? clamp(angleTo(was, a.yaw) / dt, -6, 6) : 0;
        this.prevYaw.set(a, a.yaw);
        a.lean += (rate * 0.12 * a.moveAmt - a.lean) * ease(8, dt);
      }
    }
    this.updateCamera(dt);
  }

  private moveActive(dt: number): void {
    const h = this.heroes[this.active];
    const look = this.input.takeLook();
    if (look.x !== 0 || look.y !== 0) {
      this.camYaw -= look.x * 0.006;
      this.camPitch = clamp(this.camPitch + look.y * 0.004, 0.12, 1.05);
      this.camFree = 2.4;
    }
    this.camFree = Math.max(0, this.camFree - dt);
    const mx = this.input.state.moveX;
    const my = this.input.state.moveY;
    const amt = Math.min(1, Math.hypot(mx, my));
    this.handleGlide(dt);
    const carrying = this.carrying.length > 0;
    const speed = SPEED[this.active] * this.speedBoost * (this.gliding ? 1.35 : 1) * (carrying ? 0.82 : 1);
    const v = this.velOf(h);
    let wx = 0;
    let wz = 0;
    if (amt > 0.05) {
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      /* Right of the camera is (-cos, sin): screen-right on the stick means that way. */
      const dirX = fx * -my + -fz * mx;
      const dirZ = fz * -my + fx * mx;
      const l = Math.hypot(dirX, dirZ) || 1;
      const wantYaw = Math.atan2(dirX / l, dirZ / l);
      /* Facing turns fast for a small change and a beat slower for a big one, so a U-turn reads as a turn, not a flip. */
      const turn = angleTo(h.yaw, wantYaw);
      h.yaw += turn * ease(Math.abs(turn) > 1.6 ? 10 : 13, dt);
      wx = (dirX / l) * speed * amt;
      wz = (dirZ / l) * speed * amt;
      this.faceTo = null;
      if (this.camFree <= 0 && Math.abs(mx) > 0.15) {
        this.camYaw += angleTo(this.camYaw, wantYaw) * ease(0.9, dt) * Math.abs(mx);
      }
    } else if (this.faceTo !== null) {
      /* Just used something: turn to it, briefly. */
      h.yaw += angleTo(h.yaw, this.faceTo.yaw) * ease(12, dt);
      this.faceTo.t -= dt;
      if (this.faceTo.t <= 0) {
        this.faceTo = null;
      }
    }
    /* Velocity eases toward the stick: up to speed in about a tenth of a second, and a short, soft stop.
       A hard reversal passes through zero, so the hero pivots instead of sliding round. */
    const k = ease(amt > 0.05 ? ACCEL : DECEL, dt);
    v.x += (wx - v.x) * k;
    v.z += (wz - v.z) * k;
    if (Math.hypot(v.x, v.z) > 0.02) {
      this.tryMove(h, v.x * dt, v.z * dt, this.gliding);
    } else {
      v.x = 0;
      v.z = 0;
    }
    const lift = this.gliding ? 2.4 : 0;
    h.lift += (lift - h.lift) * ease(5, dt);
    h.y += (this.ground(h.x, h.z) + h.lift - h.y) * ease(16, dt);
    if (!this.gliding && h.pose === 'glide') {
      h.pose = 'none';
      h.squash = 0.8;
    }
    /* Landing on the ledge or the far slopes: nobody stays anywhere they could not walk away from. */
    if (!this.gliding) {
      if (this.zone.walkable(h.x, h.z) || this.onBridge(h.x, h.z)) {
        this.lastSafe = { x: h.x, z: h.z };
      } else if (h.lift < 0.4) {
        h.x = this.lastSafe.x;
        h.z = this.lastSafe.z;
        h.squash = 0.8;
        this.notice('Back on solid ground.');
      }
    }
    if (this.keepOut !== null) {
      const k = this.keepOut;
      const d = Math.hypot(h.x - k.x, h.z - k.z);
      if (d < k.r) {
        h.x = k.x + ((h.x - k.x) / (d || 1)) * k.r;
        h.z = k.z + ((h.z - k.z) / (d || 1)) * k.r;
        this.notice(k.text);
      }
    }
    if (this.trail.length === 0 || Math.hypot(this.trail[this.trail.length - 1].x - h.x, this.trail[this.trail.length - 1].z - h.z) > 0.45) {
      this.trail.push({ x: h.x, z: h.z });
      if (this.trail.length > 40) {
        this.trail.shift();
      }
    }
    this.handleAction(dt);
  }

  private handleGlide(dt: number): void {
    const h = this.heroes[this.active];
    if (this.active !== 'awit') {
      this.gliding = false;
      return;
    }
    const wants = this.input.state.abilityHeld || this.input.keyAbility;
    const overWater = this.zone.waterY !== null && this.zone.height(h.x, h.z) < this.zone.waterY + 0.2;
    if (wants && !this.gliding && this.glideLeft > 0.4) {
      this.gliding = true;
      h.pose = 'glide';
      h.squash = -0.5;
      this.audio.play('whoosh');
    }
    if (this.gliding) {
      this.glideLeft = Math.max(0, this.glideLeft - dt);
      h.pose = 'glide';
      /* Never drop anyone in the water: the kite holds until there is land below. */
      if ((!wants || this.glideLeft <= 0) && !overWater) {
        this.gliding = false;
      }
    } else {
      this.glideLeft = Math.min(this.glideMax, this.glideLeft + dt * 1.2);
    }
  }

  get glideShare(): number {
    return this.glideLeft / this.glideMax;
  }

  /** Colliders bucketed into 4 m cells (each in every cell its circle, plus a body's width, touches), so a step checks only its neighbours. */
  private colliderGrid: { zone: Zone; count: number; cells: Map<number, { x: number; z: number; r: number }[]> } | null = null;
  private static readonly NO_COLLIDERS: { x: number; z: number; r: number }[] = [];

  private collidersNear(x: number, z: number): readonly { x: number; z: number; r: number }[] {
    const list = this.zone.colliders;
    let g = this.colliderGrid;
    if (g === null || g.zone !== this.zone || g.count !== list.length) {
      const cells = new Map<number, { x: number; z: number; r: number }[]>();
      for (const c of list) {
        const pad = c.r + 0.5;
        for (let cx = Math.floor((c.x - pad) / 4); cx <= Math.floor((c.x + pad) / 4); cx += 1) {
          for (let cz = Math.floor((c.z - pad) / 4); cz <= Math.floor((c.z + pad) / 4); cz += 1) {
            const key = cx * 4096 + cz;
            const bucket = cells.get(key);
            if (bucket === undefined) {
              cells.set(key, [c]);
            } else {
              bucket.push(c);
            }
          }
        }
      }
      g = { zone: this.zone, count: list.length, cells };
      this.colliderGrid = g;
    }
    return g.cells.get(Math.floor(x / 4) * 4096 + Math.floor(z / 4)) ?? Game.NO_COLLIDERS;
  }

  private velOf(a: Actor): { x: number; z: number; stuck: number } {
    let v = this.vel.get(a);
    if (v === undefined) {
      v = { x: 0, z: 0, stuck: 0 };
      this.vel.set(a, v);
    }
    return v;
  }

  /**
   * Each hero's real ground speed this frame drives its walk: the cycle turns with the distance
   * covered (so feet don't slide), and the walk blends in and out with how fast it is really going
   * (so nobody runs on the spot against a wall). Speeding up leans the body in; stopping, a little back.
   */
  private measureHeroes(dt: number): void {
    if (dt <= 0) {
      return;
    }
    for (const id of HERO_ORDER) {
      const a = this.heroes[id];
      const last = this.lastPos.get(a) ?? { x: a.x, z: a.z, speed: 0 };
      let moved = Math.hypot(a.x - last.x, a.z - last.z);
      /* A jump of metres is a fade or a placement, not a step. */
      if (moved > 3) {
        moved = 0;
      }
      const speed = Math.min(moved / dt, 14);
      const smooth = last.speed + (speed - last.speed) * ease(18, dt);
      const accel = (smooth - last.speed) / dt;
      a.tilt += (clamp(accel * 0.012, -0.22, 0.2) - a.tilt) * ease(9, dt);
      const before = a.phase;
      a.phase += moved * (11 / SPEED[id]);
      const want = clamp(smooth / SPEED[id], 0, 1);
      a.moveAmt += (want - a.moveAmt) * ease(want > a.moveAmt ? 14 : 10, dt);
      if (id === this.active && a.lift < 0.3 && Math.floor(before / Math.PI) !== Math.floor(a.phase / Math.PI) && smooth > 1.2) {
        this.onStep?.(this.surfaceAt(a.x, a.z));
      }
      this.lastPos.set(a, { x: a.x, z: a.z, speed: smooth });
    }
  }

  /** What is underfoot here: a bridge deck, shallow water, paving in the NLEX places, or grass and earth. */
  surfaceAt(x: number, z: number): Surface {
    if (this.deckAt(x, z) !== null) {
      return 'wood';
    }
    if (this.zone.waterY !== null && this.zone.height(x, z) < this.zone.waterY + 0.05) {
      return 'water';
    }
    return this.zone.id === 'plaza' || this.zone.id === 'yard' || this.zone.id === 'depot' ? 'hard' : 'grass';
  }

  private tryMove(h: Actor, dx: number, dz: number, glide = false, ghost = false): void {
    const free = (x: number, z: number): boolean => {
      if (ghost) {
        return true;
      }
      if (glide) {
        if (this.zone.id !== 'forest') {
          return this.zone.walkable(x, z);
        }
        /* The kite does not skip the crossing: splitting the crew over the creek would strand them. */
        const sameSide = Math.sign(z - creekZ(x)) === Math.sign(h.z - creekZ(h.x));
        return Math.abs(x) < 68 && Math.abs(z) < 80 && (sameSide || this.bridgeOpen());
      }
      return this.zone.walkable(x, z) || this.onBridge(x, z);
    };
    let nx = h.x + dx;
    let nz = h.z + dz;
    if (!free(nx, nz)) {
      if (free(nx, h.z)) {
        nz = h.z;
      } else if (free(h.x, nz)) {
        nx = h.x;
      } else {
        return;
      }
    }
    if (!glide && !ghost) {
      for (const c of this.collidersNear(nx, nz)) {
        const cx = nx - c.x;
        const cz = nz - c.z;
        const min = c.r + 0.4;
        if (Math.abs(cx) < min && Math.abs(cz) < min) {
          const d = Math.hypot(cx, cz);
          if (d < min) {
            nx = c.x + (cx / (d || 1)) * min;
            nz = c.z + (cz / (d || 1)) * min;
          }
        }
      }
      for (const c of this.dynamicColliders()) {
        const cx = nx - c.x;
        const cz = nz - c.z;
        const d = Math.hypot(cx, cz);
        const min = c.r + 0.4;
        if (d < min) {
          nx = c.x + (cx / (d || 1)) * min;
          nz = c.z + (cz / (d || 1)) * min;
        }
      }
      if (!free(nx, nz)) {
        return;
      }
    }
    h.x = nx;
    h.z = nz;
  }

  private handleAction(dt: number): void {
    const held = this.input.state.actionHeld || this.input.keyAction;
    const near = this.nearby();
    if (near === null || near.action === null) {
      this.holding = null;
      this.heldFor = 0;
      if (!held) {
        this.lastAction = null;
      }
      return;
    }
    const h = this.heroes[this.active];
    if (held && this.lastAction !== near.it) {
      if (this.holding !== near.it) {
        /* Starting on something: turn to face it. */
        this.faceTo = { yaw: Math.atan2(near.it.x - h.x, near.it.z - h.z), t: 0.6 };
      }
      this.holding = near.it;
      this.heldFor += dt;
      if (near.action.pose !== undefined) {
        h.pose = near.action.pose;
      }
      if (this.heldFor >= near.action.hold) {
        const act = near.action;
        this.holding = null;
        this.heldFor = 0;
        this.lastAction = near.it;
        if (this.carrying.length === 0) {
          h.pose = 'none';
        }
        /* A quick reach toward it, and a pleased face. */
        this.faceTo = { yaw: Math.atan2(near.it.x - h.x, near.it.z - h.z), t: 0.45 };
        h.reachT = 0.42;
        if (h.exprT <= 0) {
          react(h, 'happy', 0.8);
        }
        void act.run();
        this.nearCache = null;
      }
    } else {
      if (this.holding !== null) {
        if (this.carrying.length === 0) {
          h.pose = 'none';
        }
      }
      this.holding = null;
      this.heldFor = 0;
      if (!held) {
        this.lastAction = null;
      }
    }
  }

  /**
   * Followers steer like people walking with a friend: toward their place in the formation, slowing
   * as they arrive, keeping a little personal space, walking round obstacles, and staying out of the
   * strip between the camera and the leader so the view stays clear. Someone far behind hurries;
   * only when far behind and out of sight do they catch up in one go.
   */
  private moveFollowers(dt: number): void {
    const lead = this.heroes[this.active];
    /* The camera's line to the leader, on the ground. */
    const ex = this.eye[0];
    const ez = this.eye[2];
    const lx = lead.x - ex;
    const lz = lead.z - ez;
    const ll = Math.hypot(lx, lz) || 1;
    const ux = lx / ll;
    const uz = lz / ll;
    let i = 0;
    for (const id of HERO_ORDER) {
      if (id === this.active) {
        continue;
      }
      i += 1;
      const a = this.heroes[id];
      const v = this.velOf(a);
      const [back, side] = FORMATION[i - 1];
      const idx = this.trail.length - 1 - back;
      const goal = idx >= 0 ? this.trail[idx] : null;
      const crossing = goal !== null && this.zone.id === 'forest' && Math.abs(goal.z - creekZ(goal.x)) < 7.5;
      const off = crossing ? 0 : side;
      let tx = goal === null ? a.x : goal.x + Math.cos(lead.yaw) * off;
      let tz = goal === null ? a.z : goal.z - Math.sin(lead.yaw) * off;
      if (goal !== null && !crossing && this.override === null) {
        /* Never stand in the strip between the lens and the leader: step out to the nearer side. */
        const rx = tx - ex;
        const rz = tz - ez;
        const along = rx * ux + rz * uz;
        const lateral = -rx * uz + rz * ux;
        if (along > 0 && along < ll - 0.5) {
          const clearW = 1.6 + 0.9 * (1 - along / ll);
          if (Math.abs(lateral) < clearW) {
            const s = Math.abs(lateral) > 0.05 ? Math.sign(lateral) : side >= 0 ? 1 : -1;
            const push = clearW - Math.abs(lateral);
            const px = tx - uz * s * push;
            const pz = tz + ux * s * push;
            if (this.zone.walkable(px, pz)) {
              tx = px;
              tz = pz;
            }
          }
        }
        if (!this.zone.walkable(tx, tz) && !this.onBridge(tx, tz)) {
          /* A place in the formation over a wall or the water: walk the leader's own path instead. */
          tx = goal.x;
          tz = goal.z;
        }
      }
      const fromLead = Math.hypot(a.x - lead.x, a.z - lead.z);
      if (goal !== null && fromLead > 22 && !this.r.visible([a.x, a.y + 0.8, a.z], 1.2)) {
        /* Far behind and out of sight: catch up in one go, unseen. */
        const [gx, gz] = this.standableNear(goal.x, goal.z);
        a.x = gx;
        a.z = gz;
        a.y = this.ground(gx, gz);
        v.x = 0;
        v.z = 0;
        this.lastPos.set(a, { x: a.x, z: a.z, speed: 0 });
      } else {
        const dx = tx - a.x;
        const dz = tz - a.z;
        const d = Math.hypot(dx, dz);
        /* Hurry when left behind; ease off to a stop on arriving. */
        const max = SPEED[id] * this.speedBoost * (fromLead > 9 ? 1.45 : 1.12);
        const want = d > 0.4 ? Math.min(max, (d - 0.25) * 3.4) : 0;
        let wx = d > 0.001 ? (dx / d) * want : 0;
        let wz = d > 0.001 ? (dz / d) * want : 0;
        /* Give way: standing in front of a leader who is walking this way (a U-turn), step to the side
           instead of waiting to be walked into. */
        const lv = this.velOf(lead);
        const ls = Math.hypot(lv.x, lv.z);
        if (ls > 1) {
          const hx = lv.x / ls;
          const hz = lv.z / ls;
          const ox = a.x - lead.x;
          const oz = a.z - lead.z;
          const ahead = ox * hx + oz * hz;
          const beside = -ox * hz + oz * hx;
          if (ahead > -0.3 && ahead < 3 && Math.abs(beside) < 1.6) {
            const sideSign = Math.abs(beside) > 0.05 ? Math.sign(beside) : side >= 0 ? 1 : -1;
            const k2 = (1.6 - Math.abs(beside)) / 1.6;
            wx = -hz * sideSign * 5 * k2 + wx * 0.3;
            wz = hx * sideSign * 5 * k2 + wz * 0.3;
          }
        }
        /* Personal space: a gentle push apart from anyone too close. */
        for (const o of HERO_ORDER) {
          if (o === id) {
            continue;
          }
          const b = this.heroes[o];
          const sx = a.x - b.x;
          const sz = a.z - b.z;
          const sd = Math.hypot(sx, sz);
          /* The leader gets a wider berth: followers step aside as it walks toward them. */
          const min = o === this.active ? PERSONAL_SPACE + 0.5 : PERSONAL_SPACE;
          if (sd < min) {
            const push = ((min - sd) / min) * (o === this.active ? 9 : 6);
            const nx = sd > 0.001 ? sx / sd : Math.cos(a.seed * 6.3);
            const nz = sd > 0.001 ? sz / sd : Math.sin(a.seed * 6.3);
            wx += nx * push;
            wz += nz * push;
          }
        }
        const k = ease(9, dt);
        v.x += (wx - v.x) * k;
        v.z += (wz - v.z) * k;
        const sp = Math.hypot(v.x, v.z);
        if (sp > 0.03) {
          const bx = a.x;
          const bz = a.z;
          /* Walls and obstacles stop followers too; one stuck for a while slips past, as before. */
          this.tryMove(a, v.x * dt, v.z * dt, false, v.stuck > 1.2);
          const got = Math.hypot(a.x - bx, a.z - bz);
          v.stuck = got < sp * dt * 0.25 && d > 1.5 ? v.stuck + dt : Math.max(0, v.stuck - dt * 2);
        } else {
          v.x = 0;
          v.z = 0;
          v.stuck = 0;
        }
        if (sp > 0.6) {
          a.yaw += angleTo(a.yaw, Math.atan2(v.x, v.z)) * ease(9, dt);
        } else if (a.lookW < 0.3) {
          /* Standing about: turn slowly to roughly the way the leader faces, each a little differently. */
          a.yaw += angleTo(a.yaw, lead.yaw + (a.seed - 0.5) * 0.9) * ease(1.4, dt);
        }
      }
      a.y += (this.ground(a.x, a.z) - a.y) * ease(14, dt);
      if (a.pose !== 'cheer') {
        a.pose = 'none';
      }
    }
  }

  /* ---- Picking things up ---- */

  /** A small prop that vanishes right beside the leader was just picked up: it flies to the hero. */
  private watchPickups(): void {
    const h = this.heroes[this.active];
    for (const p of this.worldProps) {
      const vis = p.visible();
      const was = this.propSeen.get(p);
      this.propSeen.set(p, vis);
      if (was === true && !vis && p.mesh.radius * p.scale < 1.4 && Math.hypot(p.x - h.x, p.z - h.z) < 5 && this.flyers.length < 6) {
        this.flyers.push({ mesh: p.mesh, x: p.x, y: p.y, z: p.z, yaw: p.yaw, scale: p.scale, t: 0 });
      }
    }
  }

  private updateFlyers(dt: number): void {
    const h = this.heroes[this.active];
    for (let i = this.flyers.length - 1; i >= 0; i -= 1) {
      const f = this.flyers[i];
      f.t += dt / (this.reduceMotion ? 0.2 : 0.42);
      if (f.t >= 1) {
        this.flyers.splice(i, 1);
        this.burst('sparkle', h.x, h.y + (h.ch.carryTop ?? 1.5) - 0.2, h.z, this.reduceMotion ? 2 : 5);
      }
    }
  }

  private drawFlyers(): void {
    const h = this.heroes[this.active];
    for (const f of this.flyers) {
      const e = f.t * f.t * (3 - 2 * f.t);
      const tx = h.x;
      const ty = h.y + (h.ch.carryTop ?? 1.5) - 0.2;
      const tz = h.z;
      const x = lerp(f.x, tx, e);
      const z = lerp(f.z, tz, e);
      const y = lerp(f.y, ty, e) + Math.sin(f.t * Math.PI) * 0.9;
      const s = f.scale * (1 - 0.72 * e) * (1 + Math.sin(f.t * Math.PI) * 0.15);
      this.r.draw(f.mesh, { model: placement(this.model, x, y, z, f.yaw + f.t * 5, s) });
    }
  }

  private updateCamera(dt: number): void {
    const h = this.heroes[this.active];
    if (this.override !== null) {
      const k = ease(this.override.k, dt);
      for (let i = 0; i < 3; i += 1) {
        this.eye[i] = lerp(this.eye[i], this.override.eye[i], k);
        this.target[i] = lerp(this.target[i], this.override.target[i], k);
      }
      return;
    }
    const tx = h.x + Math.sin(h.yaw) * h.moveAmt * 0.6;
    const tz = h.z + Math.cos(h.yaw) * h.moveAmt * 0.6;
    /* Just after a switch the camera glides over to the new leader instead of jumping. */
    const k = ease(this.switchBlend > 0 ? 3.5 : 7, dt);
    this.target[0] = lerp(this.target[0], tx, k);
    this.target[1] = lerp(this.target[1], h.y + CAMERA_AIM, k);
    this.target[2] = lerp(this.target[2], tz, k);
    const pitch = this.viewPitch;
    const cp = Math.cos(pitch);
    const ex = this.target[0] - Math.sin(this.camYaw) * cp * this.camDist;
    const ez = this.target[2] - Math.cos(this.camYaw) * cp * this.camDist;
    let ey = this.target[1] + Math.sin(pitch) * this.camDist;
    /* Check along the line of sight: rise over any ground that would come between. */
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const gx = lerp(this.target[0], ex, t);
      const gz = lerp(this.target[2], ez, t);
      const line = lerp(this.target[1], ey, t);
      const clear = this.zone.height(gx, gz) + 1.1;
      if (line < clear) {
        ey += (clear - line) / t;
      }
    }
    const e = ease(this.switchBlend > 0 ? 5 : 9, dt);
    this.eye[0] = lerp(this.eye[0], ex, e);
    this.eye[1] = lerp(this.eye[1], ey, e);
    this.eye[2] = lerp(this.eye[2], ez, e);
  }

  /* ---- Drawing ---- */

  draw(): void {
    const r = this.r;
    const zone = this.zone;
    r.begin(this.eye, this.target, CAMERA_FOV, zone.env, this.time);
    if (this.override === null) {
      /* Further back, more lies between the lens and the team: the see-through tube widens with the zoom.
         Anything right beside the lens (a van, a crate stack) thins out too. */
      r.setCut(this.eye, this.target, 2.5 + 2 * this.zoomOut, LENS_CLEAR);
    } else {
      /* In a scene the view is chosen by hand: only clear leaves from right in front of the lens. */
      const e = this.eye;
      const t = this.target;
      const k = this.photoCut ? 0.85 : 0.4;
      r.setCut(e, [e[0] + (t[0] - e[0]) * k, e[1] + (t[1] - e[1]) * k, e[2] + (t[2] - e[2]) * k], this.photoCut ? 2.6 : 1.8, 2.4);
    }
    const near = this.busy ? null : this.nearby();
    this.highlighted = null;
    if (near !== null && near.action !== null) {
      let best = 1.6;
      for (const p of this.worldProps) {
        const d = Math.hypot(p.x - near.it.x, p.z - near.it.z);
        if (d < best && p.mesh.radius * p.scale < 1.4 && p.visible()) {
          best = d;
          this.highlighted = p;
        }
      }
    }
    r.draw(zone.cloudMesh, { noOutline: true });
    r.draw(zone.geometry.terrain, { noOutline: true });
    if (zone.geometry.water !== null) {
      r.water(zone.geometry.water, this.water.deep, this.water.shallow, this.water.foam, this.water.flow);
    }
    for (const c of zone.geometry.chunks) {
      if (!r.visible(c.center, c.radius)) {
        continue;
      }
      if (c.solid !== null) {
        r.draw(c.solid, { noOutline: !this.highDetail, cut: true });
      }
      if (c.soft !== null && (this.highDetail || this.distance(c.center) < 50)) {
        r.draw(c.soft, { noOutline: true, cut: true });
      }
    }
    for (const p of this.worldProps) {
      /* Off-screen props cost a draw call each: skip them, using the mesh's own bounding sphere. */
      const m = p.mesh;
      const c = Math.cos(p.yaw);
      const sn = Math.sin(p.yaw);
      const cx = p.x + (m.center[0] * c + m.center[2] * sn) * p.scale;
      const cz = p.z + (-m.center[0] * sn + m.center[2] * c) * p.scale;
      if (p.visible() && r.visible([cx, p.y + m.center[1] * p.scale, cz], m.radius * p.scale + 0.5)) {
        /* The thing in reach hops gently, to say "this one". */
        const hop = p === this.highlighted && !this.reduceMotion ? Math.abs(Math.sin(this.time * 5)) * 0.14 : 0;
        const grow = p === this.highlighted ? 1 + Math.sin(this.time * 5) * 0.04 : 1;
        r.draw(m, { model: placement(this.model, p.x, p.y + hop, p.z, p.yaw, p.scale * grow), cut: true });
      }
    }
    for (const im of zone.images ?? []) {
      const t = this.textures[im.key];
      if (t !== undefined && r.visible([im.x, im.y, im.z], Math.max(im.w, im.h))) {
        r.image(t, placement(this.model, im.x, im.y, im.z, im.yaw, 1), im.w, im.h);
      }
    }
    this.drawShadows();
    for (const id of HERO_ORDER) {
      /* A follower wandering right up to the lens would hide the whole view; so would the leader, in a photo.
         Followers fade out smoothly as they get close, rather than popping out of sight. */
      const a = this.heroes[id];
      if (id === this.active) {
        if (!this.photoCut) {
          this.drawActor(a);
        }
        continue;
      }
      const d = this.distance([a.x, a.y + 0.8, a.z]);
      const fade = 1 - clamp((d - LENS_FADE_NEAR) / (LENS_FADE_FAR - LENS_FADE_NEAR), 0, 1);
      if (fade < 0.97) {
        this.drawActor(a, fade);
      }
    }
    for (const n of Object.values(this.npcs)) {
      if (n.visible) {
        this.drawActor(n, 0, true);
      }
    }
    this.fauna.draw(this.eye, (x, y, z, radius) => r.blob(x, y, z, radius, [0.05, 0.09, 0.2, 0.28]));
    if (this.birdVisible) {
      poseBird(this.bird, this.birdState);
      const bones = this.bird.ch.rig.update();
      r.draw(this.bird.ch.mesh, { model: placement(this.model, this.bird.x, this.bird.y, this.bird.z, this.bird.yaw, this.bird.scale), bones });
    }
    this.drawCarried();
    this.drawFlyers();
    this.drawParticles();
    this.drawBeacon();
    this.drawReach(near);
  }

  /** A soft pulsing ring under whatever is in reach, unless the guide's own ring is already there. */
  private drawReach(near: { it: Interaction; action: HeroAction | null } | null): void {
    if (near === null || near.action === null || this.busy) {
      return;
    }
    const guide = this.guideNow;
    if (guide !== null && this.showBeacon && Math.hypot(guide[0] - near.it.x, guide[1] - near.it.z) < 1) {
      return;
    }
    const y = this.ground(near.it.x, near.it.z);
    const pulse = 0.62 + (this.reduceMotion ? 0 : Math.sin(this.time * 5) * 0.06);
    this.r.draw(this.props.ring, { model: placement(this.model, near.it.x, y + 0.05, near.it.z, -this.time * 0.6, pulse), noOutline: true });
  }

  /* ---- Feedback ---- */

  private buildParticles(): void {
    const one = (fn: (b: MeshBuilder) => void): Mesh => {
      const b = new MeshBuilder();
      fn(b);
      return this.r.mesh(b, false);
    };
    this.particleMeshes = {
      spark: ['#ffd24a', '#ff9a3c', '#fff6c2'].map((c) => one((b) => b.ball(0, 0, 0, 0.09, c, 3, 5))),
      confetti: ['#e2452f', '#ffc32d', '#1464e8', '#2ead5b', '#ff4fa3', '#7d5cff'].map((c) => one((b) => b.rbox(0, 0, 0, 0.22, 0.03, 0.12, c, 0.1))),
      splash: ['#bfe9ff', '#7fd0ff', '#ffffff'].map((c) => one((b) => b.ball(0, 0, 0, 0.1, c, 3, 5))),
      leaf: ['#5ebf56', '#7fd06a', '#3f9f4d'].map((c) => one((b) => b.ellipsoid(0, 0, 0, 0.16, 0.03, 0.08, c, { rows: 2, cols: 5 }))),
      sparkle: ['#fff6c2', '#ffffff'].map((c) =>
        one((b) => {
          b.rbox(0, 0, 0, 0.36, 0.06, 0.06, c, 0.1);
          b.rbox(0, 0, 0, 0.06, 0.36, 0.06, c, 0.1);
        }),
      ),
      dust: ['#d5d0c4', '#c7c2b6'].map((c) => one((b) => b.ball(0, 0, 0, 0.22, c, 3, 6))),
    };
  }

  /** A burst of particles at a spot. Reduced motion keeps a few, slow and small. */
  burst(kind: BurstKind, x: number, y: number, z: number, count = 14): void {
    const meshes = this.particleMeshes[kind];
    const n = this.reduceMotion ? Math.min(count, 4) : count;
    const speed = this.reduceMotion ? 0.4 : 1;
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const up = kind === 'confetti' ? 5 + Math.random() * 3 : kind === 'leaf' ? 1.6 + Math.random() : kind === 'dust' ? 0.6 + Math.random() * 0.6 : 2.4 + Math.random() * 2;
      const out = kind === 'sparkle' ? 0.6 : kind === 'dust' ? 1.4 : 1.8 + Math.random() * 1.6;
      const max = kind === 'confetti' ? 2.2 : kind === 'sparkle' ? 0.9 : 1 + Math.random() * 0.5;
      this.particles.push({
        mesh: meshes[i % meshes.length],
        x,
        y,
        z,
        vx: Math.cos(a) * out * speed,
        vy: up * speed,
        vz: Math.sin(a) * out * speed,
        life: max,
        max,
        spin: (Math.random() - 0.5) * 8,
        yaw: a,
        scale: kind === 'sparkle' ? 0.7 + Math.random() * 0.6 : 1,
        gravity: kind === 'confetti' ? 3 : kind === 'leaf' ? 1.2 : kind === 'sparkle' ? 0 : kind === 'dust' ? -0.4 : 9,
      });
    }
  }

  /** A feeling on the team's faces: the leader's, or everyone's. */
  reactTeam(expr: Expr, seconds: number, who: 'active' | 'all' = 'all'): void {
    for (const id of HERO_ORDER) {
      if (who === 'all' || id === this.active) {
        react(this.heroes[id], expr, seconds);
      }
    }
  }

  /** A step done: the leader does a short victory dance, unless busy carrying; moving cuts it short. */
  victory(seconds = 1.2): void {
    this.winLeft = seconds;
    this.reactTeam('happy', seconds + 0.6);
    /* Animals close by stop and look round at the fuss. */
    const h = this.heroes[this.active];
    for (const f of this.fauna.agents) {
      if (f.shown && f.mode !== 'hide' && Math.hypot(f.x - h.x, f.z - h.z) < 7) {
        this.fauna.notice(f, { x: h.x, z: h.z });
      }
    }
  }

  private updateVictory(dt: number): void {
    if (this.winLeft <= 0) {
      return;
    }
    const h = this.heroes[this.active];
    this.winLeft -= dt;
    const free = this.carrying.length === 0 && (h.pose === 'none' || h.pose === 'cheer') && this.cheerLeft <= 0;
    if (this.winLeft <= 0 || h.moveAmt > 0.35 || !free) {
      this.winLeft = 0;
      if (h.pose === 'cheer' && this.cheerLeft <= 0) {
        h.pose = 'none';
      }
      return;
    }
    h.pose = 'cheer';
  }

  /**
   * Heads turn to things worth a look: heroes to the nearest animal, people to the team
   * (with a wave the first time it comes close). A new animal gets a curious look.
   */
  private updateLooks(dt: number): void {
    this.lookTick -= dt;
    if (this.lookTick <= 0) {
      this.lookTick = 0.25;
      const lead = this.heroes[this.active];
      for (const id of HERO_ORDER) {
        const a = this.heroes[id];
        let best: { x: number; y: number; z: number; id: number } | null = null;
        let bestD = 5.5;
        for (const f of this.fauna.agents) {
          if (!f.shown || f.mode === 'hide') {
            continue;
          }
          const d = Math.hypot(f.x - a.x, f.z - a.z);
          if (d < bestD) {
            bestD = d;
            best = { x: f.x, y: f.y + 0.15 * f.scale, z: f.z, id: f.id };
          }
        }
        /* The leader looks at whatever is in reach first: it reads as "I can use this". */
        if (id === this.active && !this.busy) {
          const near = this.nearby();
          if (near !== null && near.action !== null) {
            best = { x: near.it.x, y: this.ground(near.it.x, near.it.z) + 0.5, z: near.it.z, id: -2 };
          }
        }
        const was = this.lookAt.get(a) ?? null;
        if (best !== null && best.id >= 0 && (was === null || was.id !== best.id) && a.exprT <= 0) {
          react(a, 'curious', 1.3);
        }
        this.lookAt.set(a, best);
      }
      for (const n of Object.values(this.npcs)) {
        if (!n.visible) {
          continue;
        }
        const d = Math.hypot(lead.x - n.x, lead.z - n.z);
        this.lookAt.set(n, d < 6.5 ? { x: lead.x, y: lead.y + 1.1, z: lead.z, id: -1 } : null);
        const last = this.greeted.get(n) ?? -99;
        if (d < 3.4 && this.time - last > 16 && n.pose === 'none' && !this.busy) {
          this.greeted.set(n, this.time);
          n.waveT = 1.6;
          react(n, 'happy', 2);
        }
      }
    }
    for (const a of [...HERO_ORDER.map((id) => this.heroes[id]), ...Object.values(this.npcs)]) {
      const at = this.lookAt.get(a) ?? null;
      if (at !== null && a.moveAmt < 0.6) {
        const yawTo = angleTo(a.yaw, Math.atan2(at.x - a.x, at.z - a.z));
        const flat = Math.hypot(at.x - a.x, at.z - a.z);
        const eyeY = a.y + (a.kind === 'person' || a.kind === 'dayo' || a.kind === 'awit' ? 1.15 : 0.75);
        a.lookYaw += (clamp(yawTo, -1.1, 1.1) - a.lookYaw) * ease(6, dt);
        a.lookPitch += (clamp(-Math.atan2(at.y - eyeY, Math.max(0.5, flat)), -0.5, 0.35) - a.lookPitch) * ease(6, dt);
        a.lookW += ((Math.abs(yawTo) < 2.2 ? 1 : 0) - a.lookW) * ease(4, dt);
      } else {
        a.lookW += (0 - a.lookW) * ease(4, dt);
      }
    }
  }

  /** Everyone cheers for a moment, under a shower of confetti. */
  celebrate(seconds = 2.4): void {
    this.cheerLeft = seconds;
    this.reactTeam('happy', seconds + 0.8);
    const h = this.heroes[this.active];
    this.burst('confetti', h.x, h.y + 2.4, h.z, 28);
    this.audio.play('star');
  }

  get particleCount(): number {
    return this.particles.length;
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      const drag = p.gravity === 3 || p.gravity === 1.2 ? 0.9 : 1;
      p.vx *= drag ** (dt * 60 * 0.05);
      p.vz *= drag ** (dt * 60 * 0.05);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.yaw += p.spin * dt;
    }
  }

  private drawParticles(): void {
    for (const p of this.particles) {
      const k = p.life / p.max;
      const s = p.scale * (0.35 + 0.65 * Math.min(1, k * 2));
      this.r.draw(p.mesh, { model: placement(this.model, p.x, p.y, p.z, p.yaw, s), noOutline: true });
    }
  }

  private distance(c: Vec3): number {
    return Math.hypot(c[0] - this.eye[0], c[1] - this.eye[1], c[2] - this.eye[2]);
  }

  private drawShadows(): void {
    if (!this.showShadows) {
      return;
    }
    const r = this.r;
    const shadow: [number, number, number, number] = [0.05, 0.09, 0.2, 0.34];
    for (const id of HERO_ORDER) {
      const a = this.heroes[id];
      r.blob(a.x, this.ground(a.x, a.z) + 0.05, a.z, 0.62 - a.lift * 0.06, shadow);
    }
    for (const n of Object.values(this.npcs)) {
      if (n.visible) {
        r.blob(n.x, this.ground(n.x, n.z) + 0.05, n.z, 0.6, shadow);
      }
    }
  }

  /** `fade` 0..1 thins the whole figure out (a follower right at the lens); `cut` lets the see-through tube clear it. */
  private drawActor(a: Actor, fade = 0, cut = false): void {
    pose(a);
    const bones = a.ch.rig.update();
    this.r.draw(a.ch.mesh, { model: placement(this.model, a.x, a.y, a.z, a.yaw, a.scale), bones, fade, cut });
  }

  private drawCarried(): void {
    const h = this.heroes[this.active];
    this.carrying.forEach((c, i) => {
      const top = h.ch.carryTop ?? 1.5;
      this.r.draw(c.mesh, { model: placement(this.model, h.x, h.y + top + i * 0.62, h.z, h.yaw, 0.86) });
    });
  }

  private drawBeacon(): void {
    const guide = this.guideNow;
    if (guide === null || this.busy || !this.showBeacon) {
      return;
    }
    const [x, z] = guide;
    const y = this.ground(x, z);
    const bob = Math.sin(this.beaconT * 3) * 0.2;
    this.r.draw(this.props.beacon, { model: placement(this.model, x, y + 3.4 + bob, z, this.beaconT * 1.6, 1) });
    const pulse = 1 + Math.sin(this.beaconT * 3) * 0.08;
    this.r.draw(this.props.ring, { model: placement(this.model, x, y + 0.04, z, this.beaconT * 0.4, 1.3 * pulse), noOutline: true });
  }
}
