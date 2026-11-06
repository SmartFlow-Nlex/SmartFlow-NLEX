import type { MissionRun } from '../core/mission';
import { newActor, pose, poseBird, type Actor, type ActionPose, type BirdState } from './anim';
import type { GameAudio } from './audio';
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
const CAMERA_DIST = 11.5;
const CAMERA_FOV = 0.8;
/** Followers: how many trail points behind the leader, and how far to the side. */
const FORMATION: readonly (readonly [number, number])[] = [
  [3, 1.9],
  [3, -1.9],
  [7, 0.8],
];

export class Game {
  zone!: Zone;
  zoneId: ZoneId | null = null;
  /** Pictures by name, for the zone's images. Filled by the app. */
  textures: Record<string, Texture> = {};
  /** The water's colours and flow: missions make it murky or clear. */
  water = { deep: [0.16, 0.56, 0.8] as Vec3, shallow: [0.27, 0.74, 0.9] as Vec3, foam: [0.93, 0.98, 1] as Vec3, flow: 1 };
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
  private readonly upgradesAtBuild: { list: readonly string[] } = { list: [] };

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
    this.guide = null;
    this.birdVisible = false;
    this.particles = [];
    this.audio.setRegion(id === 'forest' || id === 'river' ? 'forest' : 'station');
    this.audio.setHum(0);
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
    list.forEach((id, i) => {
      const a = this.heroes[id];
      const back = (i + 1) * 1.6;
      a.x = x - Math.sin(yaw) * back + (i - 1) * 0.6;
      a.z = z - Math.cos(yaw) * back;
      a.y = this.ground(a.x, a.z);
      a.yaw = yaw;
    });
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
    this.gliding = false;
    this.audio.play('switch');
    this.holding = null;
    this.heldFor = 0;
    this.trail = [];
    void old;
  }

  notice(text: string): void {
    if (this.time - this.lastNotice > 1.2) {
      this.lastNotice = this.time;
      this.onNotice?.(text);
    }
  }

  /** The interaction the active hero is standing at, whoever can do it. */
  nearby(): { it: Interaction; action: HeroAction | null } | null {
    const h = this.heroes[this.active];
    let best: Interaction | null = null;
    let bestD = Infinity;
    for (const it of this.interactions) {
      if (!it.when()) {
        continue;
      }
      const reach = this.active === 'baging' && it.stretchRadius !== undefined ? it.stretchRadius + this.vinesExtra : it.radius;
      const d = Math.hypot(h.x - it.x, h.z - it.z);
      if (d < reach && d < bestD) {
        best = it;
        bestD = d;
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

  snapCamera(): void {
    const h = this.heroes[this.active];
    this.target = [h.x, h.y + 1.3, h.z];
    const cp = Math.cos(this.camPitch);
    this.eye = [h.x - Math.sin(this.camYaw) * cp * this.camDist, h.y + 1.3 + Math.sin(this.camPitch) * this.camDist, h.z - Math.cos(this.camYaw) * cp * this.camDist];
  }

  get cameraYaw(): number {
    return this.camYaw;
  }

  /* ---- One frame ---- */

  update(dt: number): void {
    this.time += dt;
    this.frame += 1;
    this.beaconT += dt;
    this.input.poll();
    if (!this.paused) {
      if (!this.busy) {
        this.moveActive(dt);
      } else {
        const h = this.heroes[this.active];
        h.moveAmt += (0 - h.moveAmt) * ease(10, dt);
      }
      this.moveFollowers(dt);
    }
    if (!this.paused) {
      this.updateParticles(dt);
      if (this.cheerLeft > 0) {
        this.cheerLeft -= dt;
        for (const id of HERO_ORDER) {
          this.heroes[id].pose = this.cheerLeft > 0 ? 'cheer' : 'none';
        }
      }
    }
    for (const a of [...Object.values(this.heroes), ...Object.values(this.npcs), this.bird]) {
      a.t += this.paused ? 0 : dt;
      a.squash *= 1 - ease(8, dt);
      a.phase += a.moveAmt * dt * 11;
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
    if (amt > 0.05) {
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      /* Right of the camera is (-cos, sin): screen-right on the stick means that way. */
      const dirX = fx * -my + -fz * mx;
      const dirZ = fz * -my + fx * mx;
      const l = Math.hypot(dirX, dirZ) || 1;
      const wantYaw = Math.atan2(dirX / l, dirZ / l);
      h.yaw += angleTo(h.yaw, wantYaw) * ease(14, dt);
      this.tryMove(h, (dirX / l) * speed * amt * dt, (dirZ / l) * speed * amt * dt);
      if (this.camFree <= 0 && Math.abs(mx) > 0.15) {
        this.camYaw += angleTo(this.camYaw, wantYaw) * ease(0.9, dt) * Math.abs(mx);
      }
    }
    h.moveAmt += (amt - h.moveAmt) * ease(12, dt);
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

  private tryMove(h: Actor, dx: number, dz: number): void {
    const free = (x: number, z: number): boolean => {
      if (this.gliding) {
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
    if (!this.gliding) {
      for (const c of this.zone.colliders) {
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
        void act.run();
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

  private moveFollowers(dt: number): void {
    const lead = this.heroes[this.active];
    let i = 0;
    for (const id of HERO_ORDER) {
      if (id === this.active) {
        continue;
      }
      i += 1;
      const a = this.heroes[id];
      /* Spread out beside the leader rather than in a line down the camera's sight. */
      const [back, side] = FORMATION[i - 1];
      const idx = this.trail.length - 1 - back;
      const goal = idx >= 0 ? this.trail[idx] : null;
      const crossing = goal !== null && this.zone.id === 'forest' && Math.abs(goal.z - creekZ(goal.x)) < 7.5;
      const off = crossing ? 0 : side;
      const tx = goal === null ? a.x : goal.x + Math.cos(lead.yaw) * off;
      const tz = goal === null ? a.z : goal.z - Math.sin(lead.yaw) * off;
      const dx = tx - a.x;
      const dz = tz - a.z;
      const d = Math.hypot(dx, dz);
      /* Someone left too far behind just catches up, out of sight. */
      if (Math.hypot(a.x - lead.x, a.z - lead.z) > 20 && goal !== null) {
        a.x = goal.x;
        a.z = goal.z;
      } else if (d > 0.25) {
        const v = Math.min(d * 5, SPEED[id] * this.speedBoost * 1.15);
        a.x += (dx / d) * v * dt;
        a.z += (dz / d) * v * dt;
        a.yaw += angleTo(a.yaw, Math.atan2(dx, dz)) * ease(10, dt);
        a.moveAmt += (Math.min(1, v / SPEED[id]) - a.moveAmt) * ease(10, dt);
      } else {
        a.moveAmt += (0 - a.moveAmt) * ease(10, dt);
      }
      a.y += (this.ground(a.x, a.z) - a.y) * ease(14, dt);
      if (a.pose !== 'cheer') {
        a.pose = 'none';
      }
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
    const k = ease(7, dt);
    this.target[0] = lerp(this.target[0], tx, k);
    this.target[1] = lerp(this.target[1], h.y + 1.3, k);
    this.target[2] = lerp(this.target[2], tz, k);
    const cp = Math.cos(this.camPitch);
    const ex = this.target[0] - Math.sin(this.camYaw) * cp * this.camDist;
    const ez = this.target[2] - Math.cos(this.camYaw) * cp * this.camDist;
    let ey = this.target[1] + Math.sin(this.camPitch) * this.camDist;
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
    const e = ease(9, dt);
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
      r.setCut(this.eye, this.target, 2.5);
    } else {
      /* In a scene the view is chosen by hand: only clear leaves from right in front of the lens. */
      const e = this.eye;
      const t = this.target;
      r.setCut(e, [e[0] + (t[0] - e[0]) * 0.4, e[1] + (t[1] - e[1]) * 0.4, e[2] + (t[2] - e[2]) * 0.4], 1.8);
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
        r.draw(m, { model: placement(this.model, p.x, p.y, p.z, p.yaw, p.scale) });
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
      /* A follower wandering right up to the lens would hide the whole view. */
      const a = this.heroes[id];
      if (id === this.active || this.distance([a.x, a.y + 0.8, a.z]) > 4) {
        this.drawActor(a);
      }
    }
    for (const n of Object.values(this.npcs)) {
      if (n.visible) {
        this.drawActor(n);
      }
    }
    if (this.birdVisible) {
      poseBird(this.bird, this.birdState);
      const bones = this.bird.ch.rig.update();
      r.draw(this.bird.ch.mesh, { model: placement(this.model, this.bird.x, this.bird.y, this.bird.z, this.bird.yaw, this.bird.scale), bones });
    }
    this.drawCarried();
    this.drawParticles();
    this.drawBeacon();
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

  /** Everyone cheers for a moment, under a shower of confetti. */
  celebrate(seconds = 2.4): void {
    this.cheerLeft = seconds;
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

  private drawActor(a: Actor): void {
    pose(a);
    const bones = a.ch.rig.update();
    this.r.draw(a.ch.mesh, { model: placement(this.model, a.x, a.y, a.z, a.yaw, a.scale), bones });
  }

  private drawCarried(): void {
    const h = this.heroes[this.active];
    this.carrying.forEach((c, i) => {
      const top = h.kind === 'baging' ? 1.5 : h.kind === 'sukat' ? 1.5 : 2.02;
      this.r.draw(c.mesh, { model: placement(this.model, h.x, h.y + top + i * 0.66, h.z, h.yaw, 0.92) });
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
