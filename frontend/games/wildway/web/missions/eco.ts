import { NLEX_LINES as L } from '../../core/content';
import { facilityDay } from '../../core/facility';
import { depotRepairs, ECO_MISSION } from '../../core/mission';
import type { HeroAction, Interaction, Prop } from '../game';
import type { HeroId } from '../models';
import { DEPOT_POLES } from '../world/nlexZones';
import { anyHero, HERO_NAME, ScriptBase } from './base';

/**
 * Solar Power Rescue, at a made-up maintenance depot, in three steps: find the power
 * switch, connect the solar panels (one small wiring puzzle), and switch the system on.
 * The panels are on the roof already. What the roof makes comes from the same simulated
 * day as the results, and only the roof is credited: the mission makes no other repairs.
 */

const TRUCKS: readonly [number, number][] = [
  [6, -6.5],
  [12, -6.5],
  [18, -6.5],
];

export class EcoScript extends ScriptBase {
  protected readonly def = ECO_MISSION;
  private panels: Prop | null = null;
  private shimmer = 0;
  private t = 0;

  enter(spawnAt?: string): void {
    const g = this.ctx.game;
    g.loadZone('depot', this.ctx.upgrades());
    const s = g.zone.spots;
    g.carrying = [];
    g.placeNpc('ramos', s.chief[0], s.chief[1] + 1, 3.3);
    for (const [x, z] of DEPOT_POLES) {
      this.prop('lampOff', x, z, () => true, { y: 8.85 });
    }
    TRUCKS.forEach(([x, z], i) => {
      this.prop(g.vehicleMesh('truck'), x, z, () => true, { y: 0, yaw: Math.PI });
      g.placeNpc(`driver${i + 1}`, s[`driver${i + 1}`][0], s[`driver${i + 1}`][1] + 0.4, 0);
    });
    this.panels = this.prop('panels', -10, 13, () => true, { y: 6.3 });
    this.prop('junctionBad', -20.8, 10.4, () => !this.has('fixWiring'), { y: 5.3, yaw: Math.PI / 2 });
    this.prop('inverterOn', 0.47, 13.4, () => this.has('installDone') || this.shimmer > 0, { y: 2.4 });
    this.prop('tubesLit', -10, 7.9, () => this.has('installDone') || this.shimmer > 0, { y: 4.4 });
    const act = (label: string, hold: number, pose: HeroAction['pose'], run: () => void | Promise<void>): HeroAction => ({ label, hold, pose, run });
    const list: Interaction[] = [
      {
        id: 'find',
        x: s.inverter[0],
        z: s.inverter[1],
        radius: 3.2,
        when: () => this.step() === 'find',
        by: anyHero(act('Check the power switch', 0.5, 'work', () => this.find())),
      },
      {
        id: 'wiring',
        x: s.wiring[0],
        z: s.wiring[1],
        radius: 3,
        suggest: 'dayo',
        when: () => this.step() === 'connect',
        by: { dayo: act('Climb up to the roof box', 1, 'climb', () => this.rewire('dayo')), awit: act('Glide up to the roof box', 0.7, 'glide', () => this.rewire('awit')) },
      },
      {
        id: 'switch',
        x: s.inverter[0],
        z: s.inverter[1],
        radius: 3.2,
        when: () => this.step() === 'switch',
        by: anyHero(act('Switch on the solar power', 0.5, 'work', () => this.switchOn())),
      },
    ];
    g.interactions = list;
    this.extras();
    const where = spawnAt ?? (this.step() === 'find' ? 'spawn' : 'meter');
    const [sx, sz] = where === 'spawn' ? [1, -20] : s[where];
    g.placeTeam(sx, sz - (where === 'meter' ? 2.5 : 0), where === 'spawn' ? 0 : 3.1);
  }

  async opening(): Promise<void> {
    await this.greet(this.ctx.game.npcs.ramos, 'Chief Ramos', 'ramos', L.ecoArrive);
  }

  afterDispatch(): void {
    /* No dispatch in this mission. */
  }

  /* ---- Steps ---- */

  private async find(): Promise<void> {
    const g = this.ctx.game;
    g.audio.play('scan');
    await this.scene(async () => {
      g.cameraTo([-14, 12, -6], [-20.5, 5.5, 10.4], 2.4);
      await this.say('Sukat', 'sukat', L.ecoFound);
    });
    this.ctx.flag('switchFound');
    this.stepDone(2.6, 2.4, 13.4);
  }

  private async rewire(who: HeroId): Promise<void> {
    const g = this.ctx.game;
    g.audio.play(who === 'awit' ? 'whoosh' : 'ok');
    const ok = await this.ctx.circuit('solarLite', 'Solar panels', L.ecoWiring, 'power');
    if (!ok) {
      g.notice('Come back any time.');
      return;
    }
    g.burst('spark', -20.6, 5.8, 10.4, 18);
    this.ctx.flag('fixWiring');
    this.stepDone(-20.6, 6, 10.4);
    await this.line(who, HERO_NAME[who], L.ecoWired);
  }

  /** The solar comes on: what it makes is the simulated day's own figure. */
  private async switchOn(): Promise<void> {
    const g = this.ctx.game;
    const day = facilityDay({ repairs: depotRepairs(this.ctx.run()), upgrades: ['solar'] });
    await this.scene(async () => {
      g.cameraTo([-2, 15, -8], [-10, 6.3, 13], 2.2);
      await this.say('Chief Ramos', 'ramos', L.ecoSolarOn);
      g.audio.play('done');
      this.shimmer = this.ctx.reduceMotion() ? 0.4 : 2.6;
      for (let i = 0; i < 5; i += 1) {
        g.burst('sparkle', -17.5 + i * 3.6, 6.9, 13 + (i % 2) * 2, 6);
      }
      await this.ctx.wait(this.ctx.reduceMotion() ? 0.3 : 1.6);
      g.cameraTo([10, 6, -6], [-4, 3, 8], 2.2);
      this.cheer();
      g.npcs.ramos.pose = 'cheer';
      await this.say('Chief Ramos', 'ramos', L.ecoOn);
      await this.say('Sukat', 'sukat', `The roof makes ${day.solarKWh.toFixed(0)} kWh a day. Simulated.`);
      g.npcs.ramos.pose = 'none';
      await this.navie(L.celebrate, 'clear');
    });
    this.ctx.flag('installDone');
    this.ctx.finish();
  }

  /* ---- Every frame ---- */

  tick(dt: number): void {
    this.t += dt;
    this.tickExtras(dt);
    if (this.panels !== null) {
      this.shimmer = Math.max(0, this.shimmer - dt);
      this.panels.y = 6.3 + (this.shimmer > 0 ? Math.abs(Math.sin(this.t * 9)) * 0.08 : 0);
    }
    const g = this.ctx.game;
    const s = g.zone.spots;
    const step = this.step();
    const target: [number, number] | null = step === 'find' || step === 'switch' ? s.inverter : step === 'connect' ? s.wiring : null;
    /* Round the workshop and the office, never into them. */
    this.guideTo(
      this.around(target, 'depot', [
        { x0: -21.3, z0: 6.7, x1: 1.3, z1: 19.3 },
        { x0: 9.7, z0: 10.9, x1: 22.3, z1: 19.7 },
      ]),
    );
  }
}
