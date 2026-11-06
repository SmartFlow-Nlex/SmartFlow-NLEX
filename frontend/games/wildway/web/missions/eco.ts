import { NLEX_LINES as L } from '../../core/content';
import { VEHICLES } from '../../core/emissions';
import { ASSUMPTIONS, facilityDay, UPGRADE_OPTIONS, type Upgrade } from '../../core/facility';
import { chosenUpgrades, ECO_MISSION, missionTransport } from '../../core/mission';
import type { HeroAction, Interaction, Prop } from '../game';
import type { HeroId, VehicleKind } from '../models';
import { DEPOT_POLES } from '../world/nlexZones';
import { anyHero, HERO_NAME, navieKey, ScriptBase } from './base';

/**
 * Solar Power Rescue, at a made-up maintenance depot. Repairs first, including the roof
 * wiring the Wasteworks scrambled; then balancing the installers' day around the solar
 * roof; then the delivery, fitting everything, and switching the solar on. What the roof
 * makes comes from the same simulated day as the results.
 */

const TRUCKS: readonly [number, number][] = [
  [6, -6.5],
  [12, -6.5],
  [18, -6.5],
];
const INSTALL_SPOT: Record<Upgrade, string> = { ledFloods: 'installFloods', ledTubes: 'installTubes', solar: 'installSolar', noIdle: 'installSign' };
const SPAWN: Record<string, string> = { meet: 'spawn', audit: 'chief', repair: 'meter', energy: 'office', plan: 'office', install: 'dispatch' };

export class EcoScript extends ScriptBase {
  protected readonly def = ECO_MISSION;
  private puffs: Prop[] = [];
  private panels: Prop | null = null;
  private shimmer = 0;
  private t = 0;

  enter(spawnAt?: string): void {
    if (this.step() === 'call') {
      this.enterCenter(() => this.call());
      return;
    }
    this.enterDepot(spawnAt);
  }

  async opening(): Promise<void> {
    if (this.step() === 'call') {
      await this.line(navieKey('alert'), 'Navie', L.incoming);
    }
  }

  private async call(): Promise<void> {
    const g = this.ctx.game;
    await this.navie(L.ecoCall1, 'alert');
    await this.navie(L.ecoCall2, 'thinking');
    this.ctx.flag('callTaken');
    await this.ctx.fade(() => {
      g.releaseCamera();
      this.enterDepot('spawn');
    }, 0.6);
  }

  private installed(u: Upgrade): boolean {
    return this.has(`installed:${u}`);
  }

  private lightsOnByDay(): boolean {
    return !this.has('fixSensor');
  }

  private enterDepot(spawnAt?: string): void {
    const g = this.ctx.game;
    g.loadZone('depot', this.ctx.upgrades());
    const s = g.zone.spots;
    g.carrying = [];
    this.puffs = [];
    g.placeNpc('ramos', s.chief[0], s.chief[1] + 1, 3.3);
    /* Yard lamps: on in broad daylight until the sensor is fixed; LED heads once fitted. */
    for (const [x, z] of DEPOT_POLES) {
      this.prop('lampOn', x, z, () => this.lightsOnByDay() && !this.installed('ledFloods'), { y: 8.85 });
      this.prop('lampOff', x, z, () => !this.lightsOnByDay() && !this.installed('ledFloods'), { y: 8.85 });
      this.prop('lampLed', x, z, () => this.installed('ledFloods'), { y: 8.85 });
    }
    this.puffs.push(this.prop('puff', -23.4, 1.6, () => !this.has('fixLeak'), { y: 1.2, scale: 0.6 }));
    TRUCKS.forEach(([x, z], i) => {
      const n = i + 1;
      this.prop(g.vehicleMesh('truck'), x, z, () => true, { y: 0, yaw: Math.PI });
      this.puffs.push(this.prop('puff', x + 0.6, z + 3, () => !this.has(`driver${n}`) && !this.installed('noIdle'), { y: 0.6, scale: 0.7 }));
      g.placeNpc(`driver${n}`, s[`driver${n}`][0], s[`driver${n}`][1] + 0.4, 0);
    });
    this.panels = this.prop('panels', -10, 13, () => this.installed('solar'), { y: 6.3 });
    this.prop('junctionBad', -20.8, 10.4, () => !this.has('fixWiring'), { y: 5.3, yaw: Math.PI / 2 });
    this.prop('inverterOn', 0.47, 13.4, () => this.has('solarOn'), { y: 2.4 });
    this.prop('tubesLit', -10, 7.9, () => this.installed('ledTubes'), { y: 4.4 });
    this.prop('noIdleSign', s.installSign[0] + 1.2, s.installSign[1] - 1, () => this.installed('noIdle'), { yaw: Math.PI });
    for (const u of UPGRADE_OPTIONS) {
      const [x, z] = s[INSTALL_SPOT[u.id]];
      this.prop('stakeMark', x, z, () => this.step() === 'install' && chosenUpgrades(this.ctx.run()).includes(u.id) && !this.installed(u.id));
    }
    /* The plan's vehicles at the gate, once dispatched. */
    const run = this.ctx.run();
    const problem = missionTransport(this.def, run);
    if (run.plan !== null && this.has('planChosen') && problem !== null) {
      const fleet = problem.fleets.find((f) => f.id === (run.plan as { fleetId: string }).fleetId);
      fleet?.trips.forEach((trip, i) => {
        this.prop(g.vehicleMesh(VEHICLES[trip.vehicleId].id as VehicleKind), 6 + i * 5, -19, () => true, { y: 0, yaw: 0.2 });
      });
    }
    const act = (label: string, hold: number, pose: HeroAction['pose'], run: () => void | Promise<void>): HeroAction => ({ label, hold, pose, run });
    const list: Interaction[] = [
      { id: 'chief', x: s.chief[0], z: s.chief[1], radius: 3.6, when: () => this.step() === 'meet', by: anyHero(act('Talk to Chief Ramos', 0, undefined, () => this.meet())) },
      { id: 'meter', x: s.meter[0], z: s.meter[1], radius: 3.4, suggest: 'sukat', when: () => this.step() === 'audit', by: { sukat: act('Scan the energy meter', 1, 'scan', () => this.audit()) } },
      {
        id: 'sensor',
        x: s.sensor[0],
        z: s.sensor[1],
        radius: 3.2,
        suggest: 'dayo',
        when: () => this.step() === 'repair' && !this.has('fixSensor'),
        by: { dayo: act('Climb up and clear the sensor', 1.2, 'climb', () => this.fix('fixSensor', 'dayo')), awit: act('Fly up and clear the sensor', 0.8, 'glide', () => this.fix('fixSensor', 'awit')) },
      },
      {
        id: 'leak',
        x: s.leak[0],
        z: s.leak[1],
        radius: 3,
        stretchRadius: 4.4,
        suggest: 'baging',
        when: () => this.step() === 'repair' && !this.has('fixLeak'),
        by: { baging: act('Stretch behind and seal the leak', 1.2, 'stretch', () => this.fix('fixLeak', 'baging')), dayo: act('Tighten the leaking fitting', 1.6, 'work', () => this.fix('fixLeak', 'dayo')) },
      },
      {
        id: 'wiring',
        x: s.wiring[0],
        z: s.wiring[1],
        radius: 3,
        suggest: 'dayo',
        when: () => this.step() === 'repair' && !this.has('fixWiring'),
        by: { dayo: act('Climb up to the junction box', 1.2, 'climb', () => this.rewire('dayo')), awit: act('Fly up to the junction box', 0.8, 'glide', () => this.rewire('awit')) },
      },
      {
        id: 'inverter',
        x: s.inverter[0],
        z: s.inverter[1],
        radius: 3,
        when: () => this.step() === 'install' && chosenUpgrades(this.ctx.run()).every((u) => this.installed(u)) && !this.has('solarOn'),
        by: anyHero(act('Switch on the solar inverter', 0.6, 'work', () => this.switchOn())),
      },
      { id: 'office', x: s.office[0], z: s.office[1], radius: 3, when: () => this.step() === 'energy', by: anyHero(act('Balance the crew day', 0, undefined, () => this.planEnergy())) },
      { id: 'dispatch', x: s.dispatch[0], z: s.dispatch[1], radius: 3.4, when: () => this.step() === 'plan', by: anyHero(act('Plan the delivery', 0, undefined, () => this.planDelivery())) },
    ];
    TRUCKS.forEach((_, i) => {
      const n = i + 1;
      const [x, z] = s[`driver${n}`];
      list.push({ id: `driver${n}`, x, z, radius: 2.4, when: () => this.step() === 'repair' && !this.has(`driver${n}`), by: anyHero(act('Ask the driver to switch off', 0, undefined, () => this.driver(n))) });
    });
    const fitter: Record<Upgrade, Partial<Record<HeroId, HeroAction>>> = {
      ledFloods: { dayo: act('Climb up and fit the LED floodlights', 1.4, 'climb', () => this.install('ledFloods', 'dayo')), awit: act('Fly up and fit the LED floodlights', 1, 'glide', () => this.install('ledFloods', 'awit')) },
      ledTubes: anyHero(act('Fit the LED workshop tubes', 1.2, 'work', () => this.install('ledTubes', 'dayo'))),
      solar: { dayo: act('Carry the panels up and fit them', 2, 'climb', () => this.install('solar', 'dayo')), baging: act('Stretch up and fit the panels', 1.6, 'stretch', () => this.install('solar', 'baging')) },
      noIdle: anyHero(act('Put up the engine-off signs', 0.8, 'work', () => this.install('noIdle', 'dayo'))),
    };
    for (const u of UPGRADE_OPTIONS) {
      const [x, z] = s[INSTALL_SPOT[u.id]];
      list.push({
        id: `install-${u.id}`,
        x,
        z,
        radius: 3,
        stretchRadius: 4.2,
        suggest: u.id === 'solar' || u.id === 'ledFloods' ? 'dayo' : undefined,
        when: () => this.step() === 'install' && chosenUpgrades(this.ctx.run()).includes(u.id) && !this.installed(u.id),
        by: fitter[u.id],
      });
    }
    g.interactions = list;
    this.extras();
    const where = spawnAt ?? SPAWN[this.step() ?? 'meet'] ?? 'spawn';
    const [sx, sz] = s[where];
    g.placeTeam(sx, sz - (where === 'office' || where === 'chief' ? 2.5 : 0), where === 'spawn' || where === 'dispatch' ? 0 : 3.1);
  }

  afterDispatch(): void {
    this.enterDepot('dispatch');
    void this.line(navieKey('clear'), 'Navie', L.ecoInstall);
  }

  /* ---- Steps ---- */

  private async meet(): Promise<void> {
    const n = this.ctx.game.npcs.ramos;
    await this.scene(async () => {
      this.faceAndFrame(n);
      n.pose = 'wave';
      await this.say('Chief Ramos', 'ramos', L.ecoMeet1);
      n.pose = 'none';
    });
    this.ctx.flag('chiefMet');
  }

  private async audit(): Promise<void> {
    const g = this.ctx.game;
    g.audio.play('scan');
    await this.scene(async () => {
      g.cameraTo([16, 12, -30], [-4, 3, 0], 2.5);
      await this.say('Sukat', 'sukat', L.ecoAudit1);
      await this.navie(L.ecoAudit2, 'thinking');
    });
    this.ctx.flag('audited');
  }

  private async fix(flag: 'fixSensor' | 'fixLeak', who: HeroId): Promise<void> {
    this.ctx.game.audio.play(who === 'baging' ? 'stretch' : who === 'awit' ? 'whoosh' : 'ok');
    this.ctx.flag(flag);
    const text = flag === 'fixSensor' ? (who === 'awit' ? L.ecoSensorAwit : L.ecoSensorDayo) : who === 'baging' ? L.ecoLeakBaging : L.ecoLeakDayo;
    await this.line(who, HERO_NAME[who], text);
    await this.afterRepair();
  }

  private async driver(n: number): Promise<void> {
    const g = this.ctx.game;
    g.audio.play('ok');
    this.ctx.flag(`driver${n}`);
    await this.line('driver', 'Driver', L.ecoDriver);
    if ([1, 2, 3].every((k) => this.has(`driver${k}`))) {
      this.ctx.flag('engineOff');
    }
    await this.afterRepair();
  }

  private async rewire(who: HeroId): Promise<void> {
    const g = this.ctx.game;
    g.audio.play(who === 'awit' ? 'whoosh' : 'ok');
    const ok = await this.ctx.circuit('solar', 'Roof junction box', L.ecoWiring, 'power');
    if (!ok) {
      g.notice('Still a tangle. Come back whenever you like.');
      return;
    }
    g.burst('spark', -20.6, 5.8, 10.4, 18);
    this.ctx.flag('fixWiring');
    await this.line(who, HERO_NAME[who], L.ecoWiringDone);
    await this.afterRepair();
  }

  private async afterRepair(): Promise<void> {
    const left = ['fixSensor', 'fixLeak', 'engineOff', 'fixWiring'].filter((f) => !this.has(f)).length;
    if (left > 0) {
      this.ctx.game.notice(`${4 - left} of 4 fixed.`);
    }
    if (left === 0) {
      this.ctx.game.audio.play('done');
      await this.line('ramos', 'Chief Ramos', L.ecoRepaired);
    }
  }

  private async planEnergy(): Promise<void> {
    const picks = await this.ctx.energyPlanner();
    if (picks === null || picks.length === 0) {
      return;
    }
    for (const u of picks) {
      this.ctx.flag(`up:${u}`);
    }
    this.ctx.flag('energyPlanned');
    await this.line(navieKey('clear'), 'Navie', L.ecoPlan);
  }

  private async planDelivery(): Promise<void> {
    await this.ctx.openBoard();
  }

  private async install(u: Upgrade, who: HeroId): Promise<void> {
    const g = this.ctx.game;
    g.audio.play(who === 'baging' ? 'stretch' : 'done');
    this.ctx.flag(`installed:${u}`);
    const label = UPGRADE_OPTIONS.find((o) => o.id === u)?.label ?? u;
    const left = chosenUpgrades(this.ctx.run()).filter((x) => !this.installed(x));
    const [x, z] = g.zone.spots[INSTALL_SPOT[u]];
    g.burst('sparkle', x, u === 'solar' ? 6.6 : 1.6, z, 10);
    g.notice(left.length === 0 ? `${label}: in place. Now switch the solar on at the inverter.` : `${label}: in place. ${left.length} to go.`);
  }

  /** The solar comes on: what it makes is the simulated day's own figure. */
  private async switchOn(): Promise<void> {
    const g = this.ctx.game;
    const day = facilityDay({ repairs: ['sensor', 'leak', 'idling'], upgrades: chosenUpgrades(this.ctx.run()) });
    const could = ASSUMPTIONS.solar.kWp * ASSUMPTIONS.solar.kWhPerKWpDay;
    await this.scene(async () => {
      g.cameraTo([-2, 15, -8], [-10, 6.3, 13], 2.2);
      await this.say('Chief Ramos', 'ramos', L.ecoSolarOn);
      this.ctx.flag('solarOn');
      g.audio.play('done');
      this.shimmer = this.ctx.reduceMotion() ? 0.3 : 2.4;
      for (let i = 0; i < 5; i += 1) {
        g.burst('sparkle', -17.5 + i * 3.6, 6.9, 13 + (i % 2) * 2, 6);
      }
      await this.ctx.wait(this.ctx.reduceMotion() ? 0.3 : 1.6);
      await this.say(
        'Sukat',
        'sukat',
        day.solarKWh < could - 0.05
          ? `In this simulated day, the roof could make ${could.toFixed(0)} kWh, but the depot only uses ${day.solarKWh.toFixed(1)} kWh while the sun is up. Only that much is counted.`
          : `In this simulated day, the roof makes ${day.solarKWh.toFixed(0)} kWh, and all of it goes into what the depot uses while the sun is up.`,
      );
      g.cameraTo([22, 14, -32], [-6, 3, 4], 2.2);
      await this.say('Chief Ramos', 'ramos', L.ecoDone1);
      await this.say('Sukat', 'sukat', L.ecoDone2);
      this.cheer();
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
    this.puffs.forEach((p, i) => {
      const k = (this.t * 0.9 + i * 0.31) % 1;
      p.y = (i === 0 ? 1.2 : 0.6) + k * 1.4;
      p.scale = 0.4 + k * 0.7;
    });
    const g = this.ctx.game;
    const s = g.zone.spots;
    const step = this.step();
    let target: [number, number] | null = null;
    if (step === 'call') {
      target = s.navie ?? null;
    } else if (step === 'meet') {
      target = s.chief;
    } else if (step === 'audit') {
      target = s.meter;
    } else if (step === 'repair') {
      const left: [number, number][] = [];
      if (!this.has('fixSensor')) {
        left.push(s.sensor);
      }
      if (!this.has('fixLeak')) {
        left.push(s.leak);
      }
      for (const n of [1, 2, 3]) {
        if (!this.has(`driver${n}`)) {
          left.push(s[`driver${n}`]);
        }
      }
      if (!this.has('fixWiring')) {
        left.push(s.wiring);
      }
      target = this.nearest(left);
    } else if (step === 'energy') {
      target = s.office;
    } else if (step === 'plan') {
      target = s.dispatch;
    } else if (step === 'install') {
      const open = chosenUpgrades(this.ctx.run()).filter((u) => !this.installed(u));
      target = open.length === 0 ? s.inverter : this.nearest(open.map((u) => s[INSTALL_SPOT[u]]));
    }
    /* Round the workshop and the office, never into them. */
    this.guideTo(
      this.around(target, 'depot', [
        { x0: -21.3, z0: 6.7, x1: 1.3, z1: 19.3 },
        { x0: 9.7, z0: 10.9, x1: 22.3, z1: 19.7 },
      ]),
    );
  }
}
