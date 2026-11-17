import { NLEX_LINES as L } from '../../core/content';
import { choiceOf, ECO_RUNS, ECO_RUN_MISSIONS } from '../../core/ecoRuns';
import { VEHICLES } from '../../core/emissions';
import { isFinished, type MissionDef } from '../../core/mission';
import type { HeroAction, Interaction, Prop } from '../game';
import { hex, type Vec3 } from '../gl/math';
import type { VehicleKind } from '../models';
import { DEPOT_POLES, YARD_VAN } from '../world/nlexZones';
import { DAY } from '../world/zones';
import { anyHero, navieKey, ScriptBase, type MissionContext } from './base';

/**
 * The Eco Runs, played: one script for all of them, driven by a small config per mission.
 * Each step is one of five kinds: inspect points, collect items, a puzzle, a plan (with an
 * optional loading puzzle and send-off), or a send-off. Places are the existing yard, depot
 * and creek, given their own light (morning, sunset, overcast, night, rain), helper and
 * props, so no two missions look alike. Bonus finds are optional and never block a step.
 */

type XZ = readonly [number, number];
interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

type EnvName = 'morning' | 'sunset' | 'overcast' | 'night' | 'rain';

const sun = (x: number, y: number, z: number): Vec3 => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};

/** The light for each mood, from the game's daylight. */
export const ENVS: Record<EnvName, typeof DAY> = {
  morning: { ...DAY, sun: sun(0.8, 0.5, 0.3), skyTop: hex('#5fb6ef'), skyBottom: hex('#ffe7c6'), fog: hex('#ffe9d4'), lightTint: [1.1, 1.0, 0.86], shadowTint: [0.62, 0.6, 0.88] },
  sunset: { ...DAY, sun: sun(-0.8, 0.38, 0.4), skyTop: hex('#5a7fd6'), skyBottom: hex('#ffc590'), fog: hex('#ffd2aa'), lightTint: [1.14, 0.93, 0.8], shadowTint: [0.56, 0.5, 0.84] },
  overcast: { ...DAY, skyTop: hex('#9db3c7'), skyBottom: hex('#e4ebf1'), fog: hex('#dde5ec'), fogNear: 40, fogFar: 150, lightTint: [0.97, 0.99, 1.02], shadowTint: [0.74, 0.78, 0.88] },
  night: { ...DAY, sun: sun(0.3, 0.9, -0.3), skyTop: hex('#0e1b3d'), skyBottom: hex('#2b4475'), fog: hex('#1f3158'), fogNear: 34, fogFar: 125, lightTint: [0.3, 0.37, 0.58], shadowTint: [0.06, 0.09, 0.24], skinLightTint: [0.74, 0.78, 0.94], skinShadowTint: [0.36, 0.4, 0.62] },
  rain: { ...DAY, skyTop: hex('#71859a'), skyBottom: hex('#bcc7d1'), fog: hex('#aeb9c4'), fogNear: 26, fogFar: 115, lightTint: [0.88, 0.92, 0.98], shadowTint: [0.62, 0.68, 0.82] },
};

interface Speaker {
  npc: string;
  name: string;
  portrait: string;
}

type PuzzleCfg =
  | { type: 'circuit'; level: string; kicker: string; hint: string }
  | { type: 'dials'; level: string; kicker: string; names: readonly string[]; hint: string };

export type EcoStep =
  | { kind: 'inspect'; points: readonly { at: XZ; label: string }[]; line: string; by?: Speaker }
  | { kind: 'collect'; items: readonly { at: XZ; mesh: string; label: string }[]; action: string; line: string }
  | { kind: 'puzzle'; at: XZ; label: string; puzzle: PuzzleCfg; line: string }
  | { kind: 'plan'; at: XZ; label: string; load?: { level: string; hint: string; line: string }; send?: string }
  | { kind: 'send'; at: XZ; label: string };

export interface EcoRunConfig {
  def: MissionDef;
  zone: 'yard' | 'depot' | 'river';
  env: EnvName;
  greeter: Speaker & { at: XZ; yaw: number; line: string };
  spawn: XZ;
  spawnYaw: number;
  /** Where the vehicles park, which way each next one stands, and the road out. */
  park: XZ;
  parkYaw: number;
  parkStep: XZ;
  road: readonly XZ[];
  /** The vehicles before anything is chosen; transport runs show the chosen fleet afterwards. */
  vehicles: readonly VehicleKind[];
  boxes: readonly Box[];
  steps: readonly [EcoStep, EcoStep, EcoStep];
  bonus: { mesh: string; label: string; at: readonly XZ[] };
  /** Props of its own: a cargo pile, a drain, lamps. */
  decor?: (s: EcoRunScript) => void;
  /** Where the camera watches the send-off from, relative to the park. */
  sendView: XZ;
}

/* ---- Places ---- */

const YARD_BOXES: readonly Box[] = [
  { x0: -25.3, z0: 8.6, x1: 1.3, z1: 21.3 },
  { x0: 3.9, z0: 15, x1: 16.1, z1: 19.1 },
  { x0: 16.7, z0: 6.8, x1: 28.3, z1: 17.3 },
  { x0: -28.4, z0: -10.4, x1: -20.6, z1: -1.6 },
];
const DEPOT_BOXES: readonly Box[] = [
  { x0: -21.3, z0: 6.7, x1: 1.3, z1: 19.3 },
  { x0: 9.7, z0: 10.9, x1: 22.3, z1: 19.7 },
];
const YARD_PLACE = { zone: 'yard' as const, spawn: [1, -22] as XZ, spawnYaw: 0, park: YARD_VAN as XZ, parkYaw: Math.PI, parkStep: [4.6, 0] as XZ, road: [[6, -14], [3, -21], [0, -27], [0, -70]] as XZ[], boxes: YARD_BOXES, sendView: [-14, -16] as XZ };
const DEPOT_PLACE = { zone: 'depot' as const, spawn: [1, -20] as XZ, spawnYaw: 0, park: [-6.5, -15] as XZ, parkYaw: Math.PI, parkStep: [-4.2, 0] as XZ, road: [[-6.5, -15], [-4, -26], [-1, -36], [0, -80]] as XZ[], boxes: DEPOT_BOXES, sendView: [10, -16] as XZ };
const RIVER_PLACE = { zone: 'river' as const, spawn: [-26, 10] as XZ, spawnYaw: 1.6, park: [14, 14.2] as XZ, parkYaw: Math.PI / 2, parkStep: [-5, 0] as XZ, road: [[14, 14.2], [30, 14.4], [45, 14.6], [90, 14.8]] as XZ[], boxes: [] as Box[], sendView: [-4, -10] as XZ };

const YARD_PLAN: XZ = [6.4, -10];
const DEPOT_PLAN: XZ = [-6.5, -19.6];
const RIVER_PLAN: XZ = [14, 11];

const def = (id: string): MissionDef => ECO_RUN_MISSIONS.find((m) => m.id === id) as MissionDef;

export const ECO_CONFIGS: Record<string, EcoRunConfig> = {
  'green-route': {
    def: def('green-route'),
    ...YARD_PLACE,
    env: 'morning',
    greeter: { npc: 'driver1', name: 'Driver Ana', portrait: 'driver', at: [10.6, -12], yaw: Math.PI, line: L.routeArrive },
    vehicles: ['van'],
    steps: [
      {
        kind: 'collect',
        items: [
          { at: [14, -2.4], mesh: 'crateGreen', label: 'Road signs' },
          { at: [-4, -3.6], mesh: 'crateKit', label: 'Cones' },
          { at: [-14, -11.8], mesh: 'crateKit', label: 'Repair toolkit' },
        ],
        action: 'Load it up',
        line: L.routePacked,
      },
      { kind: 'plan', at: YARD_PLAN, label: 'Choose the route' },
      { kind: 'send', at: YARD_PLAN, label: 'Send the crew!' },
    ],
    bonus: { mesh: 'bottle', label: 'Recyclables', at: [[23.6, -13.6], [-18, 3.8], [-9, -9]] },
  },
  'smart-delivery': {
    def: def('smart-delivery'),
    ...YARD_PLACE,
    env: 'overcast',
    greeter: { npc: 'ben', name: 'Kuya Ben', portrait: 'ben', at: [10.6, -12], yaw: Math.PI, line: L.smartArrive },
    vehicles: ['van', 'van'],
    steps: [
      {
        kind: 'collect',
        items: [
          { at: [14, -2.4], mesh: 'itemDecoy', label: 'Tool order' },
          { at: [-4, -3.6], mesh: 'itemDecoy', label: 'Paint tins' },
          { at: [-14, -11.8], mesh: 'crateKit', label: 'More tools' },
          { at: [-6, -17.6], mesh: 'itemTraps', label: 'Printed forms' },
        ],
        action: 'Pick it up',
        line: L.smartPacked,
      },
      { kind: 'plan', at: YARD_PLAN, label: 'Plan the deliveries' },
      { kind: 'send', at: YARD_PLAN, label: 'Send it off!' },
    ],
    bonus: { mesh: 'can', label: 'Recyclables', at: [[23.6, -13.6], [-18, 3.8], [12, -20]] },
  },
  'eco-cargo': {
    def: def('eco-cargo'),
    ...YARD_PLACE,
    env: 'sunset',
    greeter: { npc: 'joy', name: 'Ate Joy', portrait: 'joy', at: [10.6, -12], yaw: Math.PI, line: L.cargoArrive },
    vehicles: ['truck'],
    steps: [
      { kind: 'inspect', points: [{ at: [-4, -3.6], label: 'Check the supplies' }], line: L.cargoFound },
      { kind: 'plan', at: YARD_PLAN, label: 'Pick a vehicle', load: { level: 'cargo', hint: 'Pack what the site needs. Keep the survey kit away from the cement.', line: L.cargoLoaded } },
      { kind: 'send', at: YARD_PLAN, label: 'Send the cargo!' },
    ],
    bonus: { mesh: 'jar', label: 'Recyclables', at: [[23.6, -13.6], [-18, 3.8], [16, -9]] },
    decor: (s) => {
      for (const [x, z, m, yaw] of [
        [-5.4, -6.2, 'crateKit', 0.2],
        [-3.2, -6.4, 'crateGreen', -0.3],
        [-4.2, -7.6, 'itemDecoy', 0.6],
        [-2, -7.2, 'drum', 0],
      ] as [number, number, string, number][]) {
        s.decorProp(m, x, z, () => !s.flagged('sent'), { yaw });
      }
    },
  },
  'green-maintenance': {
    def: def('green-maintenance'),
    ...DEPOT_PLACE,
    env: 'overcast',
    greeter: { npc: 'ramos', name: 'Chief Ramos', portrait: 'ramos', at: [12, 9], yaw: 3.3, line: L.maintArrive },
    vehicles: ['sedan', 'sedan', 'pickup'],
    steps: [
      {
        kind: 'inspect',
        points: [
          { at: [26.4, -20.4], label: 'Check the lamp post' },
          { at: [10, -14], label: 'Check the sign' },
        ],
        line: L.maintChecked,
      },
      {
        kind: 'collect',
        items: [
          { at: [-20.6, 1.5], mesh: 'itemRope', label: 'Ladder' },
          { at: [-26.4, -22], mesh: 'crateKit', label: 'Spare lamps' },
          { at: [-10, 4.6], mesh: 'itemTraps', label: 'Test meter' },
        ],
        action: 'Grab it',
        line: L.maintTools,
      },
      { kind: 'plan', at: DEPOT_PLAN, label: 'Plan the dispatch', send: 'Send the crew!' },
    ],
    bonus: { mesh: 'can', label: 'Recyclables', at: [[23.4, 15.4], [-4, 6.4], [30, 10]] },
  },
  'fuel-saver': {
    def: def('fuel-saver'),
    ...DEPOT_PLACE,
    env: 'morning',
    greeter: { npc: 'tech', name: 'Tech Rio', portrait: 'tech', at: [-2.4, -21.5], yaw: 2.6, line: L.fuelArrive },
    vehicles: ['van'],
    steps: [
      { kind: 'inspect', points: [{ at: DEPOT_PLAN, label: 'Check the van' }], line: L.fuelFound, by: { npc: 'tech', name: 'Tech Rio', portrait: 'tech' } },
      { kind: 'puzzle', at: DEPOT_PLAN, label: 'Pump up the tyres', puzzle: { type: 'dials', level: 'tyres', kicker: 'Tyre pressure', names: ['Front left', 'Front right', 'Back left', 'Back right'], hint: 'The door sticker says 35 psi front, 32 psi back.' }, line: L.fuelFixed },
      { kind: 'plan', at: DEPOT_PLAN, label: 'Plan the test run', send: 'Start the test run!' },
    ],
    bonus: { mesh: 'bottle', label: 'Recyclables', at: [[23.4, 15.4], [-31.4, 5.6], [-4, 6.4]] },
  },
  'night-shift': {
    def: def('night-shift'),
    ...DEPOT_PLACE,
    env: 'night',
    greeter: { npc: 'staff', name: 'Ate Lyn', portrait: 'staff', at: [14, 8.6], yaw: 3.3, line: L.nightArrive },
    vehicles: [],
    steps: [
      { kind: 'inspect', points: [{ at: [16, 10.4], label: 'Check the control room' }], line: L.nightFound },
      { kind: 'puzzle', at: [16, 10.4], label: 'Repair the controller', puzzle: { type: 'circuit', level: 'lighting', kicker: 'Lighting controller', hint: 'Join the wires so power reaches the lamps.' }, line: L.nightFixed },
      { kind: 'plan', at: [16, 10.4], label: 'Set the lighting' },
    ],
    bonus: { mesh: 'jar', label: 'Recyclables', at: [[-4, 6.4], [-31.4, 5.6], [23.4, 15.4]] },
    decor: (s) => s.lamps(),
  },
  'rainy-day': {
    def: def('rainy-day'),
    ...RIVER_PLACE,
    env: 'rain',
    greeter: { npc: 'paz', name: 'Kagawad Paz', portrait: 'paz', at: [-11.4, 11.9], yaw: 3.1, line: L.rainArrive },
    vehicles: ['van', 'truck'],
    steps: [
      { kind: 'inspect', points: [{ at: [24.5, 9.5], label: 'Check the drain' }], line: L.rainFound },
      {
        kind: 'collect',
        items: [
          { at: [22.4, 8.4], mesh: 'leaves', label: 'Leaves' },
          { at: [26.6, 8.2], mesh: 'rackJunk', label: 'Branches' },
          { at: [24.2, 11.2], mesh: 'wrappers', label: 'Rubbish' },
        ],
        action: 'Clear it',
        line: L.rainCleared,
      },
      { kind: 'plan', at: RIVER_PLAN, label: 'Plan the crew’s trip', send: 'Send the crew!' },
    ],
    bonus: { mesh: 'can', label: 'Recyclables', at: [[-20, 4], [7, 5.9], [-9, 6]] },
  },
  'eco-patrol': {
    def: def('eco-patrol'),
    ...RIVER_PLACE,
    env: 'sunset',
    greeter: { npc: 'bautista', name: 'Inspector Bautista', portrait: 'bautista', at: [-17, 11.4], yaw: 1.7, line: L.patrolArrive },
    vehicles: ['sedan'],
    steps: [
      {
        kind: 'inspect',
        points: [
          { at: [-6, 9], label: 'Check the culvert' },
          { at: [9, 9.4], label: 'Check the signs' },
          { at: [24.5, 9.5], label: 'Check the fence' },
        ],
        line: L.patrolFound,
      },
      { kind: 'plan', at: RIVER_PLAN, label: 'Plan the patrol' },
      { kind: 'send', at: RIVER_PLAN, label: 'Start the patrol!' },
    ],
    bonus: { mesh: 'bottle', label: 'Recyclables', at: [[-20, 4], [7, 5.9], [-9, 6]] },
  },
};

/* ---- The script ---- */

export class EcoRunScript extends ScriptBase {
  protected readonly def: MissionDef;
  private convoy: { p: Prop; d: number }[] = [];
  private driving = -1;
  private dust = 0;
  private drops = 0;
  private t = 0;
  private ending = false;
  private lampProps: { p: Prop; safety: boolean; x: number; z: number }[] = [];

  constructor(
    ctx: MissionContext,
    private readonly cfg: EcoRunConfig,
  ) {
    super(ctx);
    this.def = cfg.def;
  }

  /** For configs: is this flag set? */
  flagged(flag: string): boolean {
    return this.has(flag);
  }

  /** For configs: a prop of the place. */
  decorProp(mesh: string, x: number, z: number, visible: () => boolean, opts: { y?: number; yaw?: number; scale?: number } = {}): Prop {
    return this.prop(mesh, x, z, visible, opts);
  }

  private stepIs(i: number): boolean {
    return this.ctx.run().step === i;
  }

  /** The vehicles parked now: the chosen fleet once there is one. */
  private fleet(): VehicleKind[] {
    const run = this.ctx.run();
    const eco = ECO_RUNS[this.def.id];
    if (eco?.transport !== undefined && run.plan !== null && this.has('decided')) {
      const f = eco.transport.problem.fleets.find((x) => x.id === run.plan?.fleetId);
      if (f !== undefined) {
        return f.trips.map((t) => VEHICLES[t.vehicleId].id as VehicleKind);
      }
    }
    if (eco?.transport !== undefined && this.cfg.vehicles.length === 0) {
      return eco.transport.problem.fleets[0].trips.map((t) => VEHICLES[t.vehicleId].id as VehicleKind);
    }
    return [...this.cfg.vehicles];
  }

  enter(spawnAt?: string): void {
    const g = this.ctx.game;
    const c = this.cfg;
    g.loadZone(c.zone, this.ctx.upgrades());
    g.zone.env = ENVS[c.env];
    g.rain = c.env === 'rain' ? 1 : 0;
    if (c.env === 'rain') {
      g.water = { deep: [0.3, 0.42, 0.5], shallow: [0.42, 0.56, 0.62], foam: [0.86, 0.92, 0.95], flow: 2 };
    }
    g.carrying = [];
    this.convoy = [];
    this.driving = -1;
    this.lampProps = [];
    g.placeNpc(c.greeter.npc, c.greeter.at[0], c.greeter.at[1], c.greeter.yaw);
    this.fleet().forEach((kind, i) => {
      const p = this.prop(g.vehicleMesh(kind), c.park[0] + c.parkStep[0] * i, c.park[1] + c.parkStep[1] * i, () => !this.has('sent') || this.driving >= 0, { y: 0, yaw: c.parkYaw });
      this.convoy.push({ p, d: -i * 7 });
    });
    c.decor?.(this);
    const list: Interaction[] = [];
    c.steps.forEach((st, si) => this.addStep(list, st, si));
    this.addBonus(list);
    g.interactions = list;
    this.extras();
    const at = spawnAt === 'park' || this.ctx.run().step > 0 ? this.cfg.steps[Math.min(2, this.ctx.run().step)] : null;
    if (at !== null && 'at' in at) {
      g.placeTeam(at.at[0] - 1.5, at.at[1] - 2.5, 0.4);
    } else {
      g.placeTeam(c.spawn[0], c.spawn[1], c.spawnYaw);
    }
  }

  private addStep(list: Interaction[], st: EcoStep, si: number): void {
    if (st.kind === 'inspect') {
      st.points.forEach((pt, i) => {
        this.prop('beacon', pt.at[0], pt.at[1], () => this.stepIs(si) && !this.has(`seen:${i}`), { y: 0 });
        const action: HeroAction = { label: pt.label, hold: 0.6, pose: 'work', run: () => this.inspect(st, i) };
        const by = anyHero(action);
        by.sukat = { ...action, pose: 'scan' };
        list.push({ id: `seen-${i}`, x: pt.at[0], z: pt.at[1], radius: 2.8, when: () => this.stepIs(si) && !this.has(`seen:${i}`), by });
      });
    } else if (st.kind === 'collect') {
      st.items.forEach((it, i) => {
        this.prop(it.mesh, it.at[0], it.at[1], () => !this.has(`got:${i}`), { yaw: i * 1.3 });
        list.push({
          id: `got-${i}`,
          x: it.at[0],
          z: it.at[1],
          radius: 2.6,
          stretchRadius: 4,
          when: () => this.stepIs(si) && !this.has(`got:${i}`),
          by: anyHero({ label: `${st.action}: ${it.label.toLowerCase()}`, hold: 0.4, pose: 'work', run: () => this.take(st, i) }),
        });
      });
    } else if (st.kind === 'puzzle') {
      list.push({ id: 'puzzle', x: st.at[0], z: st.at[1], radius: 3, when: () => this.stepIs(si) && !this.has('fixed'), by: anyHero({ label: st.label, hold: 0.3, pose: 'work', run: () => this.puzzle(st) }) });
    } else if (st.kind === 'plan') {
      list.push({ id: 'plan', x: st.at[0], z: st.at[1], radius: 3.2, when: () => this.stepIs(si) && !this.has('decided'), by: anyHero({ label: st.label, hold: 0, run: () => this.plan() }) });
      if (st.load !== undefined) {
        const load = st.load;
        list.push({ id: 'load', x: st.at[0], z: st.at[1], radius: 3.2, when: () => this.stepIs(si) && this.has('decided') && !this.has('loaded'), by: anyHero({ label: 'Pack the cargo', hold: 0, run: () => this.load(load) }) });
      }
      if (st.send !== undefined) {
        list.push({ id: 'send', x: st.at[0], z: st.at[1], radius: 3.2, when: () => this.stepIs(si) && this.has('decided') && !this.has('sent') && this.driving < 0, by: anyHero({ label: st.send, hold: 0, run: () => this.send() }) });
      }
    } else {
      list.push({ id: 'send', x: st.at[0], z: st.at[1], radius: 3.2, when: () => this.stepIs(si) && !this.has('sent') && this.driving < 0, by: anyHero({ label: st.label, hold: 0, run: () => this.send() }) });
    }
  }

  /** Optional finds: never in the way of a mission button, counted once each. */
  private addBonus(list: Interaction[]): void {
    const b = this.cfg.bonus;
    b.at.forEach((at, i) => {
      const flag = `clue:bonus-${this.def.id}-${i}`;
      const p = this.prop(b.mesh, at[0], at[1], () => !this.has(flag), { yaw: i * 2.1 });
      list.push({
        id: `bonus-${i}`,
        x: at[0],
        z: at[1],
        radius: 2.2,
        priority: -1,
        when: () => !this.has(flag) && !isFinished(this.def, this.ctx.run()),
        by: anyHero({
          label: `Bonus: pick it up`,
          hold: 0.3,
          run: () => {
            const g = this.ctx.game;
            this.ctx.flag(flag);
            g.burst('sparkle', p.x, p.y + 0.4, p.z, 10);
            g.audio.play('star');
            const n = b.at.filter((_, k) => this.has(`clue:bonus-${this.def.id}-${k}`)).length;
            g.notice(`${L.bonusFound} ${b.label} ${n} of ${b.at.length}`);
          },
        }),
      });
    });
  }

  async opening(): Promise<void> {
    const c = this.cfg.greeter;
    await this.greet(this.ctx.game.npcs[c.npc] ?? null, c.name, c.portrait, c.line);
  }

  afterDispatch(): void {
    /* The plan is made on its own board. */
  }

  /* ---- Steps ---- */

  private async inspect(st: Extract<EcoStep, { kind: 'inspect' }>, i: number): Promise<void> {
    const g = this.ctx.game;
    const pt = st.points[i];
    g.audio.play('scan');
    g.burst('sparkle', pt.at[0], 1.2, pt.at[1], 10);
    this.ctx.flag(`seen:${i}`);
    const left = st.points.filter((_, k) => !this.has(`seen:${k}`)).length;
    if (left > 0) {
      g.notice(`Checked! ${st.points.length - left} of ${st.points.length}`);
      return;
    }
    this.stepDone(pt.at[0], 1.4, pt.at[1]);
    const who = st.by ?? { npc: 'sukat', name: 'Sukat', portrait: 'sukat' };
    await this.line(who.portrait, who.name, st.line);
  }

  private async take(st: Extract<EcoStep, { kind: 'collect' }>, i: number): Promise<void> {
    const g = this.ctx.game;
    const it = st.items[i];
    g.audio.play('pickup');
    g.burst(this.cfg.zone === 'river' ? 'leaf' : 'sparkle', it.at[0], 0.8, it.at[1], 10);
    this.ctx.flag(`got:${i}`);
    const left = st.items.filter((_, k) => !this.has(`got:${k}`)).length;
    if (left > 0) {
      g.notice(`${it.label}: got it! ${st.items.length - left} of ${st.items.length}`);
      return;
    }
    this.stepDone(it.at[0], 1.2, it.at[1]);
    if (this.cfg.env === 'rain') {
      for (let k = 0; k < 6; k += 1) {
        g.burst('splash', 24.5 + Math.sin(k) * 1.2, 0.2, 9.5 + Math.cos(k) * 1.2, 6);
      }
    }
    await this.line(this.cfg.greeter.portrait, this.cfg.greeter.name, st.line);
  }

  private async puzzle(st: Extract<EcoStep, { kind: 'puzzle' }>): Promise<void> {
    const g = this.ctx.game;
    const p = st.puzzle;
    const ok = p.type === 'circuit' ? await this.ctx.circuit(p.level, p.kicker, p.hint, 'power') : await this.ctx.dials(p.level, p.kicker, p.names, p.hint);
    if (!ok) {
      g.notice('Come back any time.');
      return;
    }
    g.burst('spark', st.at[0], 1.6, st.at[1], 16);
    this.ctx.flag('fixed');
    this.stepDone(st.at[0], 1.6, st.at[1]);
    await this.line(this.cfg.greeter.portrait, this.cfg.greeter.name, st.line);
  }

  /** The choice board; the place is rebuilt with what was chosen. */
  private async plan(): Promise<void> {
    const chosen = await this.ctx.ecoChoice();
    if (!chosen) {
      return;
    }
    if (ECO_RUNS[this.def.id]?.transport !== undefined) {
      await this.ctx.fade(() => this.enter('park'), 0.4);
    }
    const st = this.cfg.steps.find((s) => s.kind === 'plan');
    if (st !== undefined && 'at' in st) {
      this.stepDone(st.at[0], 1.8, st.at[1]);
    }
    if (isFinished(this.def, this.ctx.run())) {
      await this.finale();
    } else if (this.def.id !== 'eco-cargo') {
      await this.line(navieKey('clear'), 'Navie', 'Good plan!');
    }
  }

  private async load(load: { level: string; hint: string; line: string }): Promise<void> {
    const ok = await this.ctx.loadVan(load.level, load.hint);
    if (!ok) {
      this.ctx.game.notice('Come back any time.');
      return;
    }
    this.ctx.flag('loaded');
    const [x, z] = this.cfg.park;
    this.stepDone(x, 1.6, z);
    await this.line(this.cfg.greeter.portrait, this.cfg.greeter.name, load.line);
  }

  /** The chosen vehicles drive away down the road. */
  private async send(): Promise<void> {
    const g = this.ctx.game;
    const n = g.npcs[this.cfg.greeter.npc];
    await this.scene(async () => {
      const [px, pz] = this.cfg.park;
      g.cameraTo([px + this.cfg.sendView[0], 6, pz + this.cfg.sendView[1]], [px, 1, pz], 2);
      if (n !== undefined) {
        n.pose = 'wave';
      }
      await this.say(this.cfg.greeter.name, this.cfg.greeter.portrait, L.sendOff);
      this.driving = 0;
      g.audio.play('whoosh');
      await this.ctx.wait(this.ctx.reduceMotion() ? 1 : 3.6);
      this.driving = -1;
      if (n !== undefined) {
        n.pose = 'none';
      }
      this.cheer();
      await this.navie(L.celebrate, 'clear');
    });
    this.ctx.flag('sent');
    this.ctx.finish();
  }

  /** A mission that ends on its choice (the night shift): the lamps change, then the cheer. */
  private async finale(): Promise<void> {
    if (this.ending) {
      return;
    }
    this.ending = true;
    const g = this.ctx.game;
    await this.scene(async () => {
      g.cameraTo([2, 9, -14], [10, 4, 4], 2.2);
      g.audio.play('done');
      await this.ctx.wait(this.ctx.reduceMotion() ? 0.3 : 1.2);
      if (choiceOf(this.ctx.run()) === 'smart') {
        await this.say(this.cfg.greeter.name, this.cfg.greeter.portrait, L.nightSafe);
      }
      this.cheer();
      await this.navie(L.celebrate, 'clear');
    });
    this.ctx.finish();
  }

  /* ---- The night shift's lamps ---- */

  /** The yard lamps: all burning until the plan; then as the setting says, safety lamps always on. */
  lamps(): void {
    DEPOT_POLES.forEach(([x, z], i) => {
      const safety = i % 3 === 0;
      const lit = (): boolean => this.lampLit(safety, x, z);
      this.lampProps.push({ p: this.prop('lampOn', x, z, lit, { y: 8.85 }), safety, x, z });
      this.prop('lampOff', x, z, () => !lit(), { y: 8.85 });
    });
  }

  private lampLit(safety: boolean, x: number, z: number): boolean {
    const choice = choiceOf(this.ctx.run());
    if (choice === null || choice === 'stuck' || choice === 'dusk') {
      return true;
    }
    if (safety) {
      return true;
    }
    /* On sensors: a lamp lights when someone walks near it. */
    const h = this.ctx.game.heroes[this.ctx.game.active];
    return Math.hypot(h.x - x, h.z - z) < 12;
  }

  /* ---- Every frame ---- */

  private along(d: number): { x: number; z: number; yaw: number } {
    const road = this.cfg.road;
    let left = Math.max(0, d);
    for (let i = 0; i < road.length - 1; i += 1) {
      const [ax, az] = road[i];
      const [bx, bz] = road[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (left <= len || i === road.length - 2) {
        const k = Math.min(1, left / len);
        return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, yaw: Math.atan2(bx - ax, bz - az) };
      }
      left -= len;
    }
    return { x: road[0][0], z: road[0][1], yaw: this.cfg.parkYaw };
  }

  tick(dt: number): void {
    const g = this.ctx.game;
    this.t += dt;
    this.tickExtras(dt);
    if (this.driving >= 0) {
      this.driving += dt * (this.ctx.reduceMotion() ? 18 : 9) * Math.min(1, 0.3 + this.driving * 0.1);
      this.dust -= dt;
      for (const c of this.convoy) {
        const at = this.along(this.driving + c.d);
        c.p.x = at.x;
        c.p.z = at.z;
        c.p.yaw = at.yaw;
        if (this.dust <= 0 && this.driving + c.d > 0) {
          g.burst(this.cfg.env === 'rain' ? 'splash' : 'dust', at.x - Math.sin(at.yaw) * 2.4, 0.3, at.z - Math.cos(at.yaw) * 2.4, 3);
        }
      }
      if (this.dust <= 0) {
        this.dust = 0.14;
      }
      const lead = this.along(this.driving);
      g.chaseCamera(lead.x, lead.z, lead.yaw);
    }
    /* Rain: splashes round the team. */
    if (this.cfg.env === 'rain') {
      this.drops -= dt;
      if (this.drops <= 0) {
        this.drops = this.ctx.reduceMotion() ? 0.5 : 0.09;
        const h = g.heroes[g.active];
        const a = this.t * 7.3;
        g.burst('splash', h.x + Math.sin(a) * 5, g.zone.height(h.x, h.z) + 0.1, h.z + Math.cos(a * 1.3) * 5, 2);
      }
    }
    const run = this.ctx.run();
    const st = this.cfg.steps[run.step];
    let target: [number, number] | null = null;
    if (st !== undefined) {
      if (st.kind === 'inspect') {
        target = this.nearest(st.points.filter((_, i) => !this.has(`seen:${i}`)).map((p) => [p.at[0], p.at[1]] as [number, number]));
      } else if (st.kind === 'collect') {
        target = this.nearest(st.items.filter((_, i) => !this.has(`got:${i}`)).map((p) => [p.at[0], p.at[1]] as [number, number]));
      } else {
        target = [st.at[0], st.at[1]];
      }
    }
    this.guideTo(this.around(target, this.cfg.zone, this.cfg.boxes));
  }
}

export const ecoConfig = (id: string): EcoRunConfig | null => ECO_CONFIGS[id] ?? null;
