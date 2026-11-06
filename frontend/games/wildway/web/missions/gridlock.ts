import { NLEX_LINES as L } from '../../core/content';
import { GRIDLOCK_MISSION } from '../../core/mission';
import { BOCAUE_PLAZA, simulatePlaza, type LaneMode } from '../../core/plaza';
import type { Prop } from '../game';
import type { HeroId, VehicleKind } from '../models';
import { PLAZA_LANE_X } from '../world/nlexZones';
import { anyHero, HERO_NAME, navieKey, ScriptBase } from './base';

/**
 * The Great NLEX Gridlock, at a made-up toll plaza. The heroes never set foot on the
 * lanes: the faults are reached from the service walkways, and the staff tunnel takes
 * them from one side to the other.
 */

export const lanesFromFlags = (flags: readonly string[]): LaneMode[] | null => {
  const f = flags.find((x) => x.startsWith('lanes:'));
  return f === undefined ? null : (f.slice(6).split(',') as LaneMode[]);
};

/** Where the staff tunnel lets the team out: clear of the tunnel door and of the control room. */
export const tunnelExit = (door: readonly [number, number], side: number): [number, number] => [door[0] + side * 3.2, door[1] + 2.6];

const SPAWN: Record<string, string> = { survey: 'spawn', repair: 'overlook', lanes: 'console', reopen: 'console' };

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
  private puffs: Prop[] = [];
  private flowing = false;
  private t = 0;

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
    }, 0.6);
    await this.say('Sukat', 'sukat', L.gridArrive);
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
    if (!this.has('fixSignal')) {
      return jammedOpen ? 'go' : 'dark';
    }
    return jammedOpen ? 'go' : 'stop';
  }

  private enterPlaza(spawnAt?: string): void {
    const g = this.ctx.game;
    g.loadZone('plaza', this.ctx.upgrades());
    const s = g.zone.spots;
    this.cars = [];
    this.puffs = [];
    this.flowing = this.has('reopened');
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
    /* The queue: every lane jammed until the plaza reopens. Trucks only in the wide lanes. */
    const kinds: VehicleKind[] = ['sedan', 'van', 'pickup', 'sedan', 'evan', 'sedan', 'van'];
    for (let i = 0; i < PLAZA_LANE_X.length; i += 1) {
      const wide = i === 0 || i === 5;
      for (let k = 0; k < 9; k += 1) {
        const kind: VehicleKind = wide && k % 3 === 1 ? 'truck' : kinds[(i * 3 + k) % kinds.length];
        const z = -9.5 - k * 7.6 - (i % 2) * 2.2;
        const lane = i;
        const p = this.prop(g.vehicleMesh(kind), PLAZA_LANE_X[i], z, () => !this.flowing || this.modes()[lane] !== 'closed', { y: 0, yaw: 0 });
        this.cars.push({ p, lane, paid: false, wait: 0 });
        if (k < 3) {
          this.puffs.push(this.prop('puff', PLAZA_LANE_X[i] + 0.4, z - 2.4, () => !this.flowing, { y: 0.5, scale: 0.8 }));
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
        id: 'signal',
        x: s.signal[0],
        z: s.signal[1],
        radius: 3.6,
        suggest: 'dayo',
        when: () => this.step() === 'repair' && !this.has('fixSignal'),
        by: { dayo: fix('fixSignal', 'dayo', 'Climb the ladder and reset the signals', 1.2, 'climb'), awit: fix('fixSignal', 'awit', 'Fly up and reset the signals', 0.8, 'glide') },
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
        id: 'console',
        x: s.console[0],
        z: s.console[1],
        radius: 3.4,
        when: () => this.step() === 'lanes',
        by: anyHero({ label: 'Set the lanes at the console', hold: 0, run: () => this.setLanes() }),
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

  private async fix(flag: string, who: HeroId): Promise<void> {
    const g = this.ctx.game;
    g.audio.play(who === 'baging' ? 'stretch' : who === 'awit' ? 'whoosh' : 'ok');
    this.ctx.flag(flag);
    const text =
      flag === 'fixSignal' ? (who === 'awit' ? L.gridSignalAwit : L.gridSignalDayo) : flag === 'fixCable' ? (who === 'baging' ? L.gridCableBaging : L.gridCableDayo) : L.gridJammer;
    await this.line(who, HERO_NAME[who], text);
    if (this.has('fixSignal') && this.has('fixCable') && this.has('removeJammer')) {
      g.audio.play('done');
      await this.line(navieKey('clear'), 'Navie', L.gridRepaired);
    }
  }

  private async setLanes(): Promise<void> {
    const modes = await this.ctx.lanePuzzle();
    if (modes === null) {
      return;
    }
    this.ctx.flag(`lanes:${modes.join(',')}`);
    this.ctx.flag('lanesSet');
    await this.line(navieKey('clear'), 'Navie', L.gridReady);
  }

  private async reopen(): Promise<void> {
    const g = this.ctx.game;
    const before = simulatePlaza(BOCAUE_PLAZA, BOCAUE_PLAZA.jammed);
    const after = simulatePlaza(BOCAUE_PLAZA, this.modes());
    const hours = (r: typeof before): string => (r.carHours + r.truckHours).toFixed(r.carHours + r.truckHours < 10 ? 1 : 0);
    await this.scene(async () => {
      g.cameraTo([30, 15, -34], [0, 1, -8], 2.2);
      await this.ctx.wait(0.8);
      this.flowing = true;
      g.audio.play('done');
      await this.ctx.wait(this.ctx.reduceMotion() ? 0.4 : 2);
      await this.navie(L.gridOpen1, 'clear');
      await this.say('Sukat', 'sukat', `In this made-up hour of traffic, the jammed plaza would leave vehicles stopped with engines running for ${hours(before)} hours in all. With your lanes: ${hours(after)}.`);
      await this.navie(L.gridOpen2, 'hello');
    });
    this.ctx.flag('reopened');
    this.ctx.finish();
  }

  private tunnel(toSide: number): Promise<void> {
    const g = this.ctx.game;
    g.audio.play('whoosh');
    return this.ctx.fade(() => {
      const s = g.zone.spots;
      const [x, z] = toSide > 0 ? s.tunnelE : s.tunnelW;
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
          /* Cash lanes stop at the booth; tag lanes roll through slowly. */
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
      } else {
        this.puffs.forEach((p, i) => {
          const k = (this.t * 0.8 + i * 0.37) % 1;
          p.y = 0.5 + k * 1.2;
          p.scale = 0.5 + k * 0.7;
        });
      }
    }
    this.updateGuide();
  }

  private updateGuide(): void {
    const g = this.ctx.game;
    const step = this.step();
    const s = g.zone.spots;
    let target: [number, number] | null = null;
    if (step === 'call') {
      target = s.navie ?? null;
    } else if (step === 'survey') {
      target = s.overlook;
    } else if (step === 'repair') {
      const left: [number, number][] = [];
      if (!this.has('fixSignal')) {
        left.push(s.signal);
      }
      if (!this.has('fixCable')) {
        left.push(s.cable);
      }
      if (!this.has('removeJammer')) {
        left.push(s.jammer);
      }
      /* Prefer what is on this side of the lanes. */
      const h = g.heroes[g.active];
      const here = left.filter((p) => Math.sign(p[0]) === Math.sign(h.x));
      target = this.nearest(here.length > 0 ? here : left);
    } else if (step === 'lanes' || step === 'reopen') {
      target = s.console;
      /* From the tunnel side, the arrow leads round the control room, not through it. */
      const h = g.heroes[g.active];
      if (h.x > 20.8 && h.z > 13.6) {
        target = [20.6, 14.8];
      }
    }
    /* The lanes are crossed only by the staff tunnel. */
    if (target !== null && g.zoneId === 'plaza') {
      const h = g.heroes[g.active];
      if (Math.sign(target[0]) !== Math.sign(h.x)) {
        target = h.x < 0 ? s.tunnelW : s.tunnelE;
      }
    }
    this.guideTo(target);
  }
}
