import { NLEX_LINES as L } from '../../core/content';
import { GRIDLOCK_MISSION } from '../../core/mission';
import { BOCAUE_PLAZA, withTagDown, type LaneMode, type PlazaProblem } from '../../core/plaza';
import type { Prop } from '../game';
import type { VehicleKind } from '../models';
import { PLAZA_LANE_X } from '../world/nlexZones';
import { anyHero, navieKey, ScriptBase } from './base';

/**
 * The Great NLEX Gridlock, at a made-up toll plaza, in three steps: find the broken RFID
 * scanner, fix it, and open the lanes so the traffic moves. The lane choice still runs the
 * plaza's simulated hour, so the results are calculated, not invented. The heroes stay on
 * the service walkways: everything they need is on the east side.
 */

/** The lanes the player switched on most recently. */
export const lanesFromFlags = (flags: readonly string[]): LaneMode[] | null => {
  for (let i = flags.length - 1; i >= 0; i -= 1) {
    if (flags[i].startsWith('lanes:')) {
      return flags[i].slice(6).split(',') as LaneMode[];
    }
  }
  return null;
};

/** The lane whose tag reader failed, in runs from before the simplification. */
export const failedLane = (flags: readonly string[]): number | null => {
  const f = flags.find((x) => x.startsWith('fail:'));
  return f === undefined ? null : Number(f.slice(5));
};

/** The plaza a run was scored on: the old surprise's broken reader, if that run had one. */
export const plazaFor = (flags: readonly string[]): PlazaProblem => {
  const lane = failedLane(flags);
  return lane === null ? BOCAUE_PLAZA : withTagDown(BOCAUE_PLAZA, lane);
};

/** Where the staff tunnel lets the team out: clear of the tunnel door and of the control room. */
export const tunnelExit = (door: readonly [number, number], side: number): [number, number] => [door[0] + side * 3.2, door[1] + 2.6];

/** The RFID scanner by the last booth, on the east walkway. */
export const SCANNER: [number, number] = [19.6, -2.6];
const POST: [number, number] = [18.3, -3.9];

interface Car {
  p: Prop;
  lane: number;
  paid: boolean;
  wait: number;
}

type Signal = 'go' | 'stop' | 'dark';

export class GridlockScript extends ScriptBase {
  protected readonly def = GRIDLOCK_MISSION;
  private cars: Car[] = [];
  private puffs: { p: Prop; lane: number }[] = [];
  private flowing = false;
  private t = 0;

  enter(spawnAt?: string): void {
    const g = this.ctx.game;
    g.loadZone('plaza', this.ctx.upgrades());
    const s = g.zone.spots;
    g.carrying = [];
    this.cars = [];
    this.puffs = [];
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
    this.prop('rfidPost', POST[0], POST[1], () => !this.has('scannerFixed'), { y: 0, yaw: Math.PI / 2 });
    this.prop('rfidPostOk', POST[0], POST[1], () => this.has('scannerFixed'), { y: 0, yaw: Math.PI / 2 });
    this.prop('jammer', 18.6, -2.2, () => !this.has('scannerFixed'), { y: 0, yaw: Math.PI / 2 });
    this.prop('tyreMarks', s.clueTyres[0], s.clueTyres[1] - 1, () => true, { y: 0.02, yaw: 0.2 });
    this.prop('flyer', s.clueFlyer[0] - 0.8, s.clueFlyer[1], () => !this.has('clue:flyer'), { y: 0.02 });
    g.dynamicColliders = () => [{ x: POST[0], z: POST[1], r: 0.4 }];
    /* The queue: every lane jammed until the plaza reopens. Trucks only in the wide lanes. */
    const kinds: VehicleKind[] = ['sedan', 'van', 'pickup', 'sedan', 'evan', 'sedan', 'van'];
    for (let k = 0; k < 9; k += 1) {
      for (let i = 0; i < PLAZA_LANE_X.length; i += 1) {
        const wide = i === 0 || i === 5;
        const kind: VehicleKind = wide && k % 3 === 1 ? 'truck' : kinds[(i * 3 + k) % kinds.length];
        const z = -9.5 - k * 7.6 - (i % 2) * 2.2;
        const lane = i;
        const p = this.prop(g.vehicleMesh(kind), PLAZA_LANE_X[i], z, () => !this.flowing || this.modes()[lane] !== 'closed', { y: 0, yaw: 0 });
        this.cars.push({ p, lane, paid: false, wait: 0 });
        if (k < 3) {
          this.puffs.push({ p: this.prop('puff', PLAZA_LANE_X[i] + 0.4, z - 2.4, () => !this.flowing, { y: 0.5, scale: 0.8 }), lane });
        }
      }
    }
    g.interactions = [
      {
        id: 'scanner',
        x: SCANNER[0],
        z: SCANNER[1],
        radius: 3.6,
        suggest: 'sukat',
        when: () => this.step() === 'find',
        by: { sukat: { label: 'Scan the scanner', hold: 0.7, pose: 'scan', run: () => this.find() } },
      },
      {
        id: 'fix',
        x: SCANNER[0],
        z: SCANNER[1],
        radius: 3.6,
        when: () => this.step() === 'fix',
        by: anyHero({ label: 'Fix the scanner', hold: 0.5, pose: 'work', run: () => this.fix() }),
      },
      {
        id: 'console',
        x: s.console[0],
        z: s.console[1],
        radius: 3.4,
        when: () => this.step() === 'flow',
        by: anyHero({ label: 'Open the lanes', hold: 0, run: () => this.openLanes() }),
      },
      {
        id: 'clueTyres',
        x: s.clueTyres[0],
        z: s.clueTyres[1],
        radius: 2.6,
        suggest: 'sukat',
        when: () => !this.has('clue:tyres'),
        by: { sukat: { label: 'Look at the tyre marks', hold: 0.5, pose: 'scan', run: () => this.clue('tyres', L.gridClueTyres) } },
      },
      {
        id: 'clueFlyer',
        x: s.clueFlyer[0],
        z: s.clueFlyer[1],
        radius: 2.6,
        suggest: 'sukat',
        when: () => !this.has('clue:flyer'),
        by: { sukat: { label: 'Look at the flyer', hold: 0.5, pose: 'scan', run: () => this.clue('flyer', L.gridClueFlyer) } },
      },
      { id: 'tunnelW', x: s.tunnelW[0], z: s.tunnelW[1], radius: 2.4, when: () => true, by: anyHero({ label: 'Take the staff tunnel across', hold: 0, run: () => this.tunnel(1) }) },
      { id: 'tunnelE', x: s.tunnelE[0], z: s.tunnelE[1], radius: 2.4, when: () => true, by: anyHero({ label: 'Take the staff tunnel across', hold: 0, run: () => this.tunnel(-1) }) },
    ];
    this.extras();
    const where = spawnAt ?? (this.step() === 'flow' ? 'console' : 'spawn');
    const [sx, sz] = where === 'spawn' ? [25.5, -17] : s[where];
    /* At the console, face the control room so the camera stays outside it. */
    g.placeTeam(sx, sz, where === 'console' ? Math.PI / 2 : -0.4);
  }

  async opening(): Promise<void> {
    const g = this.ctx.game;
    await this.scene(async () => {
      g.cameraTo([-6, 18, -70], [0, 0, -30], 1.6);
      await this.ctx.wait(this.ctx.reduceMotion() ? 0.3 : 1.4);
      await this.navie(L.gridArrive, 'traffic');
    });
  }

  afterDispatch(): void {
    /* No dispatch in this mission. */
  }

  /* ---- The plaza ---- */

  private modes(): LaneMode[] {
    return lanesFromFlags(this.ctx.run().flags) ?? [...BOCAUE_PLAZA.jammed];
  }

  private signal(i: number): Signal {
    if (this.has('lanesSet')) {
      return this.modes()[i] === 'closed' ? 'stop' : 'go';
    }
    const jammedOpen = BOCAUE_PLAZA.jammed[i] !== 'closed';
    return jammedOpen ? 'go' : this.has('scannerFixed') ? 'stop' : 'dark';
  }

  /** Step 1: Sukat finds what is wrong. */
  private async find(): Promise<void> {
    const g = this.ctx.game;
    g.audio.play('scan');
    await this.scene(async () => {
      g.cameraTo([SCANNER[0] + 5, 3.4, SCANNER[1] - 6], [POST[0], 1.6, POST[1]], 3);
      await this.say('Sukat', 'sukat', L.gridFound1);
      await this.navie(L.gridFound2, 'alert');
    });
    this.ctx.flag('scannerFound');
    this.stepDone(POST[0], 2.6, POST[1]);
  }

  /** Step 2: pull the jammer, then join the wires. */
  private async fix(): Promise<void> {
    const g = this.ctx.game;
    g.audio.play('ok');
    g.burst('spark', 18.6, 0.8, -2.2, 12);
    const ok = await this.ctx.circuit('cable', 'RFID scanner', L.gridFixPuzzle, 'power');
    if (!ok) {
      g.notice('Come back any time.');
      return;
    }
    g.burst('spark', POST[0], 2.4, POST[1], 18);
    this.ctx.flag('scannerFixed');
    this.stepDone(POST[0], 2.6, POST[1]);
    await this.line(navieKey('clear'), 'Navie', L.gridFixed);
  }

  /** Step 3: open the lanes, and watch the traffic move. */
  private async openLanes(): Promise<void> {
    const g = this.ctx.game;
    const modes = await this.ctx.lanePuzzle(BOCAUE_PLAZA);
    if (modes === null) {
      return;
    }
    this.ctx.flag(`lanes:${modes.join(',')}`);
    this.ctx.flag('lanesSet');
    await this.scene(async () => {
      g.cameraTo([30, 15, -34], [0, 1, -8], 2.2);
      await this.ctx.wait(0.6);
      this.flowing = true;
      g.audio.play('done');
      await this.ctx.wait(this.ctx.reduceMotion() ? 0.4 : 2.2);
      this.cheer();
      g.npcs.staff.pose = 'cheer';
      await this.navie(L.gridOpen, 'clear');
      await this.navie(L.gridDone, 'hello');
      g.npcs.staff.pose = 'none';
    });
    this.ctx.flag('reopened');
    this.ctx.finish();
  }

  private async clue(id: string, text: string): Promise<void> {
    this.ctx.game.audio.play('scan');
    this.ctx.flag(`clue:${id}`);
    await this.line('sukat', 'Sukat', text);
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
        for (const c of this.cars) {
          if (modes[c.lane] === 'closed') {
            continue;
          }
          /* Cash lanes stop at the booth; RFID lanes roll through slowly. */
          if (!c.paid && c.p.z > -2.2 && c.p.z < -0.6) {
            c.wait += dt;
            if (c.wait < (modes[c.lane] === 'cash' ? 1.4 : 0.25)) {
              continue;
            }
            c.paid = true;
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
    if (step === 'find' || step === 'fix') {
      target = SCANNER;
    } else if (step === 'flow') {
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
