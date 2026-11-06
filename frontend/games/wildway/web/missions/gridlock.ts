import { NLEX_LINES as L } from '../../core/content';
import { GRIDLOCK_MISSION } from '../../core/mission';
import { BOCAUE_PLAZA, failureLane, simulatePlaza, withTagDown, type LaneMode, type PlazaProblem, type PlazaResult } from '../../core/plaza';
import type { Prop } from '../game';
import type { HeroId, VehicleKind } from '../models';
import { PLAZA_LANE_X } from '../world/nlexZones';
import { anyHero, HERO_NAME, navieKey, ScriptBase } from './base';

/**
 * The Great NLEX Gridlock, at a made-up toll plaza, in five stages: watch the queue build
 * and find the faults; repair them, each a different way; set the lanes; cope when a tag
 * reader fails; and finish with what the simulation actually shows. The heroes never set
 * foot on the lanes: the faults are reached from the service walkways, and the staff
 * tunnel takes them across.
 */

/** The lanes the player switched on most recently: after the surprise, the second setting. */
export const lanesFromFlags = (flags: readonly string[]): LaneMode[] | null => {
  for (let i = flags.length - 1; i >= 0; i -= 1) {
    if (flags[i].startsWith('lanes:')) {
      return flags[i].slice(6).split(',') as LaneMode[];
    }
  }
  return null;
};

/** The lane whose tag reader failed, if it has. */
export const failedLane = (flags: readonly string[]): number | null => {
  const f = flags.find((x) => x.startsWith('fail:'));
  return f === undefined ? null : Number(f.slice(5));
};

/** The plaza as it stands for this run: with the failed reader, once it has failed. */
export const plazaFor = (flags: readonly string[]): PlazaProblem => {
  const lane = failedLane(flags);
  return lane === null ? BOCAUE_PLAZA : withTagDown(BOCAUE_PLAZA, lane);
};

/** Where the staff tunnel lets the team out: clear of the tunnel door and of the control room. */
export const tunnelExit = (door: readonly [number, number], side: number): [number, number] => [door[0] + side * 3.2, door[1] + 2.6];

const SPAWN: Record<string, string> = { survey: 'spawn', repair: 'overlook', lanes: 'console', reopen: 'console', surprise: 'console' };
const REPAIRS = ['fixSignal', 'fixCable', 'fixSensor', 'removeJammer', 'powerOn'] as const;

interface Car {
  p: Prop;
  lane: number;
  paid: boolean;
  wait: number;
  index: number;
}

type Signal = 'go' | 'stop' | 'dark';

const hoursText = (r: PlazaResult): string => {
  const v = r.carHours + r.truckHours;
  return v.toFixed(v < 10 ? 1 : 0);
};

export class GridlockScript extends ScriptBase {
  protected readonly def = GRIDLOCK_MISSION;
  private cars: Car[] = [];
  private puffs: { p: Prop; lane: number }[] = [];
  private flowing = false;
  /** How many queued cars are drawn: the intro shows the queue building. */
  private queueShown = Infinity;
  private t = 0;
  private sensorExplained = false;

  enter(spawnAt?: string): void {
    if (this.step() === 'call') {
      this.enterCenter(() => this.call());
      return;
    }
    this.enterPlaza(spawnAt);
  }

  async opening(): Promise<void> {
    if (this.step() === 'call') {
      await this.line(navieKey('alert'), 'Navie', L.incoming);
    }
  }

  afterDispatch(): void {
    /* No dispatch in this mission. */
  }

  private async call(): Promise<void> {
    const g = this.ctx.game;
    await this.navie(L.gridCall1, 'alert');
    await this.navie(L.gridCall2, 'traffic');
    await this.say('Dayo', 'dayo', L.gridCall3);
    await this.navie(L.gridCall4, 'clear');
    this.ctx.flag('callTaken');
    await this.ctx.fade(() => {
      g.releaseCamera();
      this.enterPlaza('spawn');
      this.queueShown = 0;
    }, 0.6);
    await this.intro();
  }

  /** Stage 1: the queue builds while the camera sweeps along it. */
  private async intro(): Promise<void> {
    const g = this.ctx.game;
    await this.scene(async () => {
      g.cameraTo([-6, 18, -70], [0, 0, -30], 1.4);
      const steps = this.ctx.reduceMotion() ? 1 : 24;
      for (let i = 1; i <= steps; i += 1) {
        this.queueShown = Math.ceil((this.cars.length * i) / steps);
        await this.ctx.wait(0.1);
      }
      this.queueShown = Infinity;
      await this.navie(L.gridIntro1, 'traffic');
      g.cameraTo([30, 7, -32], [24, 1.5, -20], 2.5);
      await this.say('Sukat', 'sukat', L.gridArrive);
    });
  }

  /* ---- The plaza ---- */

  private modes(): LaneMode[] {
    return lanesFromFlags(this.ctx.run().flags) ?? [...BOCAUE_PLAZA.jammed];
  }

  private failed(): number | null {
    return this.has('replanned') ? null : failedLane(this.ctx.run().flags);
  }

  private signal(i: number): Signal {
    if (this.failed() === i) {
      return 'stop';
    }
    if (this.has('lanesSet')) {
      return this.modes()[i] === 'closed' ? 'stop' : 'go';
    }
    const jammedOpen = BOCAUE_PLAZA.jammed[i] !== 'closed';
    if (!this.has('fixSignal')) {
      return jammedOpen ? 'go' : 'dark';
    }
    return jammedOpen ? 'go' : 'stop';
  }

  private repaired(): boolean {
    return REPAIRS.every((f) => this.has(f));
  }

  private enterPlaza(spawnAt?: string): void {
    const g = this.ctx.game;
    g.loadZone('plaza', this.ctx.upgrades());
    const s = g.zone.spots;
    g.carrying = [];
    this.cars = [];
    this.puffs = [];
    this.queueShown = Infinity;
    this.flowing = this.has('reopened');
    g.placeNpc('staff', s.staff[0], s.staff[1], -2.4);
    PLAZA_LANE_X.forEach((x, i) => {
      this.prop('sigGo', x, -4.98, () => this.signal(i) === 'go', { y: 5.85, yaw: Math.PI });
      this.prop('sigStop', x, -4.98, () => this.signal(i) === 'stop', { y: 5.85, yaw: Math.PI });
      this.prop('sigDark', x, -4.98, () => this.signal(i) === 'dark', { y: 5.85, yaw: Math.PI });
    });
    /* Lane 4 is coned off for repairs. */
    for (const z of [-9, -6.5, 5, 8]) {
      this.prop('cone', PLAZA_LANE_X[3], z, () => true, { y: 0 });
    }
    this.prop('jammer', 18.5, -2.2, () => !this.has('removeJammer'), { y: 0, yaw: Math.PI / 2 });
    this.prop('cableCut', 20.2, 2.6, () => !this.has('fixCable'), { y: 0 });
    this.prop('cableFixed', 20.2, 2.6, () => this.has('fixCable'), { y: 0 });
    this.prop('sensorBad', -17.6, -8.6, () => !this.has('fixSensor'), { y: 2.35, yaw: Math.PI / 2 });
    this.prop('sensorGood', -17.6, -8.6, () => this.has('fixSensor'), { y: 2.35, yaw: Math.PI / 2 });
    this.prop('powerCell', s.cell[0] + 0.9, s.cell[1], () => this.has('removeJammer') && !this.has('powerOn') && !g.carrying.some((c) => c.id === 'cell'), { y: 0 });
    this.prop('tyreMarks', s.clueTyres[0], s.clueTyres[1] - 1, () => true, { y: 0.02, yaw: 0.2 });
    this.prop('flyer', s.clueFlyer[0] - 0.8, s.clueFlyer[1], () => !this.has('clue:flyer'), { y: 0.02 });
    /* The queue: every lane jammed until the plaza reopens. Trucks only in the wide lanes. */
    const kinds: VehicleKind[] = ['sedan', 'van', 'pickup', 'sedan', 'evan', 'sedan', 'van'];
    let index = 0;
    for (let k = 0; k < 9; k += 1) {
      for (let i = 0; i < PLAZA_LANE_X.length; i += 1) {
        const wide = i === 0 || i === 5;
        const kind: VehicleKind = wide && k % 3 === 1 ? 'truck' : kinds[(i * 3 + k) % kinds.length];
        const z = -9.5 - k * 7.6 - (i % 2) * 2.2;
        const lane = i;
        const n = index;
        const p = this.prop(g.vehicleMesh(kind), PLAZA_LANE_X[i], z, () => n < this.queueShown && (!this.flowing || this.modes()[lane] !== 'closed'), { y: 0, yaw: 0 });
        this.cars.push({ p, lane, paid: false, wait: 0, index });
        index += 1;
        if (k < 3) {
          this.puffs.push({ p: this.prop('puff', PLAZA_LANE_X[i] + 0.4, z - 2.4, () => n < this.queueShown && (!this.flowing || this.failed() === lane), { y: 0.5, scale: 0.8 }), lane });
        }
      }
    }
    const fix = (flag: string, who: HeroId, label: string, hold: number, pose: 'climb' | 'glide' | 'work' | 'stretch') => ({ label, hold, pose, run: () => this.fix(flag, who) });
    g.interactions = [
      {
        id: 'overlook',
        x: s.overlook[0],
        z: s.overlook[1],
        radius: 4,
        suggest: 'sukat',
        when: () => this.step() === 'survey',
        by: { sukat: { label: 'Scan the plaza', hold: 1, pose: 'scan', run: () => this.survey() } },
      },
      {
        id: 'clueTyres',
        x: s.clueTyres[0],
        z: s.clueTyres[1],
        radius: 2.6,
        suggest: 'sukat',
        when: () => !this.has('clue:tyres'),
        by: { sukat: { label: 'Look at the tyre marks', hold: 0.6, pose: 'scan', run: () => this.clue('tyres', L.gridClueTyres) } },
      },
      {
        id: 'clueFlyer',
        x: s.clueFlyer[0],
        z: s.clueFlyer[1],
        radius: 2.6,
        suggest: 'sukat',
        when: () => !this.has('clue:flyer'),
        by: { sukat: { label: 'Look at the flyer', hold: 0.6, pose: 'scan', run: () => this.clue('flyer', L.gridClueFlyer) } },
      },
      {
        id: 'signal',
        x: s.signal[0],
        z: s.signal[1],
        radius: 3.6,
        suggest: 'dayo',
        when: () => this.step() === 'repair' && !this.has('fixSignal'),
        by: { dayo: fix('fixSignal', 'dayo', 'Climb up and reset the signals', 1.2, 'climb'), awit: fix('fixSignal', 'awit', 'Fly up and reset the signals', 0.8, 'glide') },
      },
      {
        id: 'cable',
        x: s.cable[0],
        z: s.cable[1],
        radius: 3.2,
        stretchRadius: 4.5,
        suggest: 'baging',
        when: () => this.step() === 'repair' && !this.has('fixCable'),
        by: { baging: fix('fixCable', 'baging', 'Stretch the cut ends together', 1.2, 'stretch'), dayo: fix('fixCable', 'dayo', 'Splice in a new length of cable', 2, 'work') },
      },
      {
        id: 'sensor',
        x: s.sensor[0],
        z: s.sensor[1],
        radius: 3,
        suggest: 'sukat',
        when: () => this.step() === 'repair' && !this.has('fixSensor'),
        by: { sukat: { label: 'Calibrate the toll sensor', hold: 0.6, pose: 'scan', run: () => this.calibrate() } },
      },
      {
        id: 'jammer',
        x: s.jammer[0],
        z: s.jammer[1],
        radius: 3,
        stretchRadius: 4.5,
        suggest: 'dayo',
        when: () => this.step() === 'repair' && !this.has('removeJammer'),
        by: { dayo: fix('removeJammer', 'dayo', 'Pull the jammer out', 1, 'work'), baging: fix('removeJammer', 'baging', 'Stretch in and unplug it', 0.8, 'stretch') },
      },
      {
        id: 'cell',
        x: s.cell[0],
        z: s.cell[1],
        radius: 2.6,
        suggest: 'dayo',
        when: () => this.step() === 'repair' && this.has('removeJammer') && !this.has('powerOn') && g.carrying.length === 0,
        by: { dayo: { label: 'Lift a fresh power cell', hold: 0.6, pose: 'work', run: () => this.takeCell() } },
      },
      {
        id: 'door',
        x: s.door[0],
        z: s.door[1],
        radius: 2.6,
        suggest: 'dayo',
        when: () => g.carrying.some((c) => c.id === 'cell'),
        by: { dayo: { label: 'Plug in the power cell', hold: 0.8, pose: 'work', run: () => this.plugCell() } },
      },
      {
        id: 'console',
        x: s.console[0],
        z: s.console[1],
        radius: 3.4,
        when: () => this.step() === 'lanes' || this.step() === 'surprise',
        by: anyHero({ label: 'Set the lanes at the console', hold: 0, run: () => (this.step() === 'surprise' ? this.replan() : this.setLanes()) }),
      },
      {
        id: 'reopen',
        x: s.console[0],
        z: s.console[1],
        radius: 3.4,
        when: () => this.step() === 'reopen',
        by: anyHero({ label: 'Reopen the plaza', hold: 0, run: () => this.reopen() }),
      },
      { id: 'tunnelW', x: s.tunnelW[0], z: s.tunnelW[1], radius: 2.4, when: () => true, by: anyHero({ label: 'Take the staff tunnel across', hold: 0, run: () => this.tunnel(1) }) },
      { id: 'tunnelE', x: s.tunnelE[0], z: s.tunnelE[1], radius: 2.4, when: () => true, by: anyHero({ label: 'Take the staff tunnel across', hold: 0, run: () => this.tunnel(-1) }) },
    ];
    this.extras();
    const where = spawnAt ?? SPAWN[this.step() ?? 'survey'] ?? 'spawn';
    const [sx, sz] = s[where];
    /* At the console, face the control room so the camera stays outside it. */
    g.placeTeam(sx, sz, where === 'console' ? Math.PI / 2 : -0.4);
  }

  private async survey(): Promise<void> {
    const g = this.ctx.game;
    g.audio.play('scan');
    await this.scene(async () => {
      g.cameraTo([29, 9.5, -16], [6, 1.5, -1], 3);
      await this.say('Sukat', 'sukat', L.gridScan1);
      g.cameraTo([24, 4, -6], [18.5, 0.4, -2.2], 3);
      await this.say('Awit', 'awit', L.gridScan2);
      await this.navie(L.gridScan3, 'alert');
    });
    this.ctx.flag('plazaSurveyed');
  }

  private async clue(id: string, text: string): Promise<void> {
    this.ctx.game.audio.play('scan');
    this.ctx.flag(`clue:${id}`);
    await this.line('sukat', 'Sukat', text);
  }

  /** Stage 2: every fault is fixed a different way. */
  private async fix(flag: string, who: HeroId): Promise<void> {
    const g = this.ctx.game;
    g.audio.play(who === 'baging' ? 'stretch' : who === 'awit' ? 'whoosh' : 'ok');
    if (flag === 'fixCable') {
      const ok = await this.ctx.circuit('cable', 'Junction box', L.gridCablePuzzle, 'power');
      if (!ok) {
        g.notice('The wires are still crossed. Come back whenever you like.');
        return;
      }
      g.burst('spark', 20.6, 1.6, 3.2, 18);
      this.ctx.flag(flag);
      await this.line(who, HERO_NAME[who], L.gridCableDone);
    } else {
      this.ctx.flag(flag);
      if (flag === 'fixSignal') {
        g.burst('spark', -17.4, 6.2, -3.6, 16);
      } else {
        g.burst('spark', 18.5, 0.8, -2.2, 18);
      }
      const text = flag === 'fixSignal' ? (who === 'awit' ? L.gridSignalAwit : L.gridSignalDayo) : L.gridJammer;
      await this.line(who, HERO_NAME[who], text);
    }
    await this.afterRepair();
  }

  private async calibrate(): Promise<void> {
    const g = this.ctx.game;
    if (!this.sensorExplained) {
      this.sensorExplained = true;
      await this.line('sukat', 'Sukat', L.gridSensorIntro);
    }
    const ok = await this.ctx.dials('sensor', 'Lane 1 toll sensor', ['Gain', 'Offset', 'Timing'], 'Change the dials, then test. The sensor only says how many are right.');
    if (!ok) {
      g.notice('The sensor is still out of tune. Come back whenever you like.');
      return;
    }
    g.burst('sparkle', -17.6, 2.6, -8.6, 10);
    this.ctx.flag('fixSensor');
    await this.line('sukat', 'Sukat', L.gridSensorDone);
    await this.afterRepair();
  }

  private takeCell(): void {
    this.pickUp('cell', 'powerCell');
    void this.line('dayo', 'Dayo', L.gridPowerCell);
  }

  private async plugCell(): Promise<void> {
    const g = this.ctx.game;
    g.carrying = g.carrying.filter((c) => c.id !== 'cell');
    g.heroes[g.active].pose = 'none';
    g.audio.play('done');
    g.burst('spark', 21.9, 2.2, 9, 20);
    this.ctx.flag('powerOn');
    await this.line(navieKey('clear'), 'Navie', L.gridPowerDone);
    await this.afterRepair();
  }

  private async afterRepair(): Promise<void> {
    if (!this.repaired()) {
      const left = REPAIRS.filter((f) => !this.has(f)).length;
      this.ctx.game.notice(`${REPAIRS.length - left} of ${REPAIRS.length} fixed.`);
      return;
    }
    const staff = this.ctx.game.npcs.staff;
    staff.pose = 'cheer';
    this.ctx.game.audio.play('done');
    await this.line(navieKey('clear'), 'Navie', L.gridRepaired);
    staff.pose = 'none';
  }

  /** Stage 3: the lanes. */
  private async setLanes(): Promise<void> {
    const modes = await this.ctx.lanePuzzle(BOCAUE_PLAZA);
    if (modes === null) {
      return;
    }
    this.ctx.flag(`lanes:${modes.join(',')}`);
    this.ctx.flag('lanesSet');
    await this.line(navieKey('clear'), 'Navie', L.gridReady);
  }

  /** Stage 4: the plaza reopens, and then a tag reader fails. */
  private async reopen(): Promise<void> {
    const g = this.ctx.game;
    const lane = failureLane(BOCAUE_PLAZA, this.modes());
    await this.scene(async () => {
      g.cameraTo([30, 15, -34], [0, 1, -8], 2.2);
      await this.ctx.wait(0.8);
      this.flowing = true;
      g.audio.play('done');
      await this.ctx.wait(this.ctx.reduceMotion() ? 0.4 : 2.4);
      await this.navie(L.gridOpen1, 'clear');
      this.ctx.flag(`fail:${lane}`);
      this.ctx.flag('reopened');
      g.audio.play('deny');
      g.cameraTo([PLAZA_LANE_X[lane] + 9, 6, -22], [PLAZA_LANE_X[lane], 1, -6], 2.6);
      await this.ctx.wait(this.ctx.reduceMotion() ? 0.2 : 0.9);
      await this.say('Sukat', 'sukat', `${L.gridFail1} Lane ${BOCAUE_PLAZA.lanes[lane].id}.`);
      await this.navie(L.gridFail2, 'alert');
    });
  }

  /** Stage 4, continued: set the lanes again with the broken reader. Stage 5: the honest ending. */
  private async replan(): Promise<void> {
    const g = this.ctx.game;
    const plaza = plazaFor(this.ctx.run().flags);
    const modes = await this.ctx.lanePuzzle(plaza);
    if (modes === null) {
      return;
    }
    this.ctx.flag(`lanes:${modes.join(',')}`);
    const before = simulatePlaza(BOCAUE_PLAZA, BOCAUE_PLAZA.jammed);
    const after = simulatePlaza(plaza, modes);
    const longest = Math.max(...after.lanes.map((l) => l.averageMin));
    await this.scene(async () => {
      g.cameraTo([30, 15, -34], [0, 1, -8], 2.2);
      this.ctx.flag('replanned');
      g.audio.play('done');
      await this.ctx.wait(this.ctx.reduceMotion() ? 0.3 : 1.6);
      await this.say('Sukat', 'sukat', L.gridFixed);
      await this.say('Sukat', 'sukat', `In this made-up hour, the jammed plaza would leave vehicles stopped with engines running for ${hoursText(before)} hours in all. With your lanes: ${hoursText(after)}.`);
      /* Only what the simulation shows: if anyone is still in line, say so. */
      await this.say(
        'Sukat',
        'sukat',
        after.leftWaiting > 0
          ? `${after.leftWaiting} ${after.leftWaiting === 1 ? 'car that pulled up' : 'cars that pulled up'} in the last moments ${after.leftWaiting === 1 ? 'was' : 'were'} still in line as the hour ended. The slowest lane averaged ${longest.toFixed(1)} minutes.`
          : `Nobody was left in line at the end of the hour. The slowest lane averaged ${longest.toFixed(1)} minutes.`,
      );
      this.cheer();
      g.npcs.staff.pose = 'cheer';
      await this.navie(L.gridOpen2, 'hello');
      g.npcs.staff.pose = 'none';
    });
    this.ctx.finish();
  }

  private tunnel(toSide: number): Promise<void> {
    const g = this.ctx.game;
    g.audio.play('whoosh');
    return this.ctx.fade(() => {
      const s = g.zone.spots;
      g.placeTeam(...tunnelExit(toSide > 0 ? s.tunnelE : s.tunnelW, toSide), toSide > 0 ? 1.2 : -1.2);
    }, 0.3);
  }

  /* ---- Every frame ---- */

  tick(dt: number): void {
    this.t += dt;
    const g = this.ctx.game;
    if (g.zoneId === 'plaza') {
      if (this.flowing) {
        const modes = this.modes();
        const failed = this.failed();
        for (const c of this.cars) {
          if (modes[c.lane] === 'closed') {
            continue;
          }
          /* Cash lanes stop at the booth; tag lanes roll through slowly; a failed reader holds its lane. */
          if (!c.paid && c.p.z > -2.2 && c.p.z < -0.6) {
            c.wait += dt;
            if (failed === c.lane || c.wait < (modes[c.lane] === 'cash' ? 1.4 : 0.25)) {
              continue;
            }
            c.paid = true;
          }
          /* Queue up behind a stopped car rather than drive through it. */
          if (failed === c.lane && !c.paid) {
            const ahead = this.cars.filter((o) => o.lane === c.lane && o !== c && o.p.z > c.p.z && !o.paid);
            const gap = ahead.length === 0 ? Infinity : Math.min(...ahead.map((o) => o.p.z)) - c.p.z;
            if (gap < 6.4 || c.p.z > -2.2) {
              continue;
            }
          }
          const near = Math.abs(c.p.z) < 8;
          c.p.z += dt * (near ? 4 : 10);
          if (c.p.z > 74) {
            c.p.z -= 150;
            c.paid = false;
            c.wait = 0;
          }
        }
      }
      this.puffs.forEach(({ p }, i) => {
        const k = (this.t * 0.8 + i * 0.37) % 1;
        p.y = 0.5 + k * 1.2;
        p.scale = 0.5 + k * 0.7;
      });
    }
    this.tickExtras(dt);
    this.updateGuide();
  }

  private updateGuide(): void {
    const g = this.ctx.game;
    const step = this.step();
    const s = g.zone.spots;
    const h = g.heroes[g.active];
    let target: [number, number] | null = null;
    if (step === 'call') {
      target = s.navie ?? null;
    } else if (step === 'survey') {
      target = s.overlook;
    } else if (step === 'repair') {
      const left: [number, number][] = [];
      if (g.carrying.some((c) => c.id === 'cell')) {
        left.push(s.door);
      } else {
        if (!this.has('fixSignal')) {
          left.push(s.signal);
        }
        if (!this.has('fixSensor')) {
          left.push(s.sensor);
        }
        if (!this.has('fixCable')) {
          left.push(s.cable);
        }
        if (!this.has('removeJammer')) {
          left.push(s.jammer);
        } else if (!this.has('powerOn')) {
          left.push(s.cell);
        }
      }
      /* Prefer what is on this side of the lanes. */
      const here = left.filter((p) => Math.sign(p[0]) === Math.sign(h.x));
      target = this.nearest(here.length > 0 ? here : left);
    } else if (step === 'lanes' || step === 'reopen' || step === 'surprise') {
      target = s.console;
      /* From the tunnel side, the arrow leads round the control room, not through it. */
      if (h.x > 20.8 && h.z > 13.6) {
        target = [20.6, 14.8];
      }
    }
    /* The lanes are crossed only by the staff tunnel. */
    if (target !== null && g.zoneId === 'plaza' && Math.sign(target[0]) !== Math.sign(h.x)) {
      target = h.x < 0 ? s.tunnelW : s.tunnelE;
    }
    this.guideTo(target);
  }
}
