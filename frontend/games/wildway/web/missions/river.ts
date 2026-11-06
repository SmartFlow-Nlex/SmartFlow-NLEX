import { NLEX_LINES as L, SORT_REASON } from '../../core/content';
import { RIVER_ITEMS, RIVER_MISSION, WASTE_LABEL, type WasteKind } from '../../core/mission';
import { VEHICLES } from '../../core/emissions';
import { RIVER_TRANSPORT } from '../../core/transport';
import type { Interaction } from '../game';
import type { Vec3 } from '../gl/math';
import type { HeroId, VehicleKind } from '../models';
import { riverZ } from '../world/nlexZones';
import { anyHero, HERO_NAME, navieKey, ScriptBase } from './base';

/**
 * River Rescue, at a made-up creek in a made-up barangay. The oil is left to the
 * specialist: the heroes report it and keep back.
 */

/* Murky but still plainly water: grey-green, not the brown of the banks. */
const MURKY = { deep: [0.3, 0.38, 0.26] as Vec3, shallow: [0.45, 0.53, 0.36] as Vec3, foam: [0.84, 0.86, 0.76] as Vec3, flow: 0.12 };
const CLEAR = { deep: [0.16, 0.5, 0.72] as Vec3, shallow: [0.3, 0.7, 0.82] as Vec3, foam: [0.93, 0.98, 1] as Vec3, flow: 1 };

/** Where each piece lies. Floating ones are reached from a spot on the bank. */
const LITTER_AT: Record<string, [number, number]> = {
  bottle: [-6, riverZ(-6) + 1.4],
  husk: [13, riverZ(13) - 1.4],
  can: [-24, 6.6],
  jar: [9, -7.2],
  leaves: [-30, -6.6],
  peels: [17, 7.2],
  wrappers: [-3, 7.4],
  slipper: [25, -7.6],
};
const BANK_FOR: Record<string, [number, number]> = {
  bottle: [-6, riverZ(-6) + 4.6],
  husk: [13, riverZ(13) - 4.6],
};

const BIN_SPOT: Record<WasteKind, string> = { bio: 'binBio', recycle: 'binRecycle', residual: 'binResidual' };
const SPAWN: Record<string, string> = { meet: 'spawn', survey: 'officer', hazard: 'footbridge', collect: 'bins', rack: 'bins', gate: 'bankEast', plan: 'bankEast' };

export class RiverScript extends ScriptBase {
  protected readonly def = RIVER_MISSION;

  enter(spawnAt?: string): void {
    if (this.step() === 'call') {
      this.enterCenter(() => this.call());
      return;
    }
    this.enterRiver(spawnAt);
  }

  async opening(): Promise<void> {
    if (this.step() === 'call') {
      await this.line(navieKey('alert'), 'Navie', L.incoming);
    }
  }

  private async call(): Promise<void> {
    const g = this.ctx.game;
    await this.navie(L.riverCall1, 'alert');
    await this.navie(L.riverCall2, 'thinking');
    this.ctx.flag('callTaken');
    await this.ctx.fade(() => {
      g.releaseCamera();
      this.enterRiver('spawn');
    }, 0.6);
  }

  private sorted(id: string): boolean {
    return this.has(`sorted:${id}`);
  }

  private enterRiver(spawnAt?: string): void {
    const g = this.ctx.game;
    g.loadZone('river', this.ctx.upgrades());
    const s = g.zone.spots;
    g.carrying = [];
    g.water = this.has('flowRestored') ? { ...CLEAR } : { ...MURKY };
    g.placeNpc('paz', s.officer[0] - 0.4, s.officer[1] + 1.4, 3.1);
    if (this.stepAtLeast('hazard') && !this.has('hazardSafe')) {
      g.placeNpc('bautista', s.hazardTalk[0] + 1.2, s.hazardTalk[1] - 0.6, -0.8);
    }
    /* Rubbish, until it has been picked up. */
    for (const item of RIVER_ITEMS) {
      const [x, z] = LITTER_AT[item.id];
      const carried = (): boolean => g.carrying.some((c) => c.id === item.id);
      this.prop(item.id, x, z, () => !this.sorted(item.id) && !carried(), { y: item.floating ? -0.9 : undefined, yaw: x * 0.7 });
    }
    this.prop('drum', s.drum[0], s.drum[1], () => !this.has('hazardSafe'), { yaw: 0.4 });
    this.prop('oilSheen', s.drum[0] + 1, riverZ(s.drum[0] + 1) - 1, () => !this.has('hazardSafe'), { y: -0.86 });
    this.prop('rackJunk', 31.3, riverZ(31.3), () => !this.has('rackCleared'), { y: -0.35 });
    /* Reeds along the banks, once the water runs clean. */
    for (const x of [-34, -21, -9, 10, 19, 26]) {
      for (const side of [-1, 1]) {
        this.prop('reeds', x + side * 1.5, riverZ(x) + side * 4.2, () => this.has('flowRestored'), { yaw: x });
      }
    }
    /* The plan's vehicles, once dispatched. */
    const plan = this.ctx.run().plan;
    if (plan !== null && this.has('planChosen')) {
      const fleet = RIVER_TRANSPORT.fleets.find((f) => f.id === plan.fleetId);
      fleet?.trips.forEach((trip, i) => {
        this.prop(g.vehicleMesh(VEHICLES[trip.vehicleId].id as VehicleKind), 36.5, 4 + i * 6.5, () => true, { y: 1.45, yaw: Math.PI });
      });
    }
    const list: Interaction[] = [
      {
        id: 'officer',
        x: s.officer[0],
        z: s.officer[1],
        radius: 3.6,
        when: () => this.step() === 'meet',
        by: anyHero({ label: 'Talk to Kagawad Paz', hold: 0, run: () => this.meet() }),
      },
      {
        id: 'survey',
        x: s.footbridge[0],
        z: s.footbridge[1],
        radius: 3.6,
        suggest: 'sukat',
        when: () => this.step() === 'survey',
        by: { sukat: { label: 'Scan the creek', hold: 1, pose: 'scan', run: () => this.survey() } },
      },
      {
        id: 'hazard',
        x: s.hazardTalk[0],
        z: s.hazardTalk[1],
        radius: 3.6,
        when: () => this.step() === 'hazard',
        by: anyHero({ label: 'Tell Engr. Bautista about the drum', hold: 0, run: () => this.hazard() }),
      },
      {
        id: 'rack',
        x: s.rack[0],
        z: s.rack[1],
        radius: 3,
        stretchRadius: 4.6,
        suggest: 'baging',
        when: () => this.step() === 'rack',
        by: {
          baging: { label: 'Stretch and pull out the rubbish', hold: 1.2, pose: 'stretch', run: () => this.rack('baging') },
          dayo: { label: 'Rake out the trash rack', hold: 2, pose: 'work', run: () => this.rack('dayo') },
        },
      },
      {
        id: 'gate',
        x: s.gate[0],
        z: s.gate[1],
        radius: 2.8,
        suggest: 'dayo',
        when: () => this.step() === 'gate',
        by: {
          dayo: { label: 'Turn the floodgate wheel', hold: 1.6, pose: 'work', run: () => this.openGate() },
          baging: { label: 'Wind the floodgate open', hold: 2.2, pose: 'stretch', run: () => this.openGate() },
        },
      },
      {
        id: 'dispatch',
        x: s.dispatch[0],
        z: s.dispatch[1],
        radius: 3.6,
        when: () => this.step() === 'plan',
        by: anyHero({ label: 'Plan the collection run', hold: 0, run: () => this.plan() }),
      },
    ];
    for (const item of RIVER_ITEMS) {
      const [x, z] = item.floating ? BANK_FOR[item.id] : LITTER_AT[item.id];
      const when = (): boolean => this.stepAtLeast('collect') && !this.sorted(item.id) && !g.carrying.some((c) => c.id === item.id) && this.canCarryMore();
      const take = (): void => this.pickUp(item.id, item.id);
      list.push(
        item.floating
          ? { id: `item-${item.id}`, x, z, radius: 2.4, stretchRadius: 3.6, suggest: 'baging', when, by: { baging: { label: `Stretch and fish out the ${item.label}`, hold: 0.8, pose: 'stretch', run: take } } }
          : { id: `item-${item.id}`, x, z, radius: 2.2, when, by: anyHero({ label: `Pick up the ${item.label}`, hold: 0, run: take }) },
      );
    }
    for (const kind of ['bio', 'recycle', 'residual'] as WasteKind[]) {
      const [x, z] = s[BIN_SPOT[kind]];
      list.push({
        id: `bin-${kind}`,
        x,
        z: z - 0.9,
        radius: 1.1,
        when: () => g.carrying.length > 0,
        by: anyHero({ label: `Put it in ${WASTE_LABEL[kind]}`, hold: 0, run: () => this.sortInto(kind) }),
      });
    }
    g.interactions = list;
    const where = spawnAt ?? SPAWN[this.step() ?? 'meet'] ?? 'spawn';
    const [sx, sz] = s[where];
    g.placeTeam(sx, sz - (where === 'bins' ? 2.5 : 0), where === 'spawn' ? 1.6 : 2.6);
  }

  afterDispatch(): void {
    this.enterRiver('dispatch');
    void this.finale();
  }

  /* ---- Steps ---- */

  private async meet(): Promise<void> {
    const n = this.ctx.game.npcs.paz;
    await this.scene(async () => {
      this.faceAndFrame(n);
      n.pose = 'wave';
      await this.say('Kagawad Paz', 'paz', L.riverMeet1);
      n.pose = 'none';
      await this.say('Kagawad Paz', 'paz', L.riverMeet2);
    });
    this.ctx.flag('officerMet');
  }

  private async survey(): Promise<void> {
    const g = this.ctx.game;
    g.audio.play('scan');
    await this.scene(async () => {
      g.cameraTo([10, 6, -9], [-6, -0.6, riverZ(-6)], 3);
      await this.say('Sukat', 'sukat', L.riverScan1);
      g.cameraTo([20, 4, -12], [26, 0.2, -5], 3);
      await this.say('Dayo', 'dayo', L.riverScan2);
    });
    this.ctx.flag('riverSurveyed');
    const s = g.zone.spots;
    g.placeNpc('bautista', s.hazardTalk[0] + 1.2, s.hazardTalk[1] - 0.6, -0.8);
  }

  private async hazard(): Promise<void> {
    const g = this.ctx.game;
    const n = g.npcs.bautista;
    await this.scene(async () => {
      this.faceAndFrame(n);
      await this.say('Engr. Bautista', 'bautista', L.riverHazard1);
    });
    await this.ctx.fade(() => {
      this.ctx.flag('hazardSafe');
      n.visible = false;
    }, 1.1);
    await this.line('bautista', 'Engr. Bautista', L.riverHazard2);
  }

  private sortInto(kind: WasteKind): void {
    const g = this.ctx.game;
    const right = g.carrying.filter((c) => RIVER_ITEMS.find((i) => i.id === c.id)?.kind === kind);
    if (right.length === 0) {
      const item = RIVER_ITEMS.find((i) => i.id === g.carrying[0].id);
      if (item !== undefined) {
        g.audio.play('deny');
        g.notice(`Not this bin. The ${item.label} goes in ${WASTE_LABEL[item.kind]}: ${SORT_REASON[item.kind]}.`);
      }
      return;
    }
    g.carrying = g.carrying.filter((c) => !right.includes(c));
    if (g.carrying.length === 0) {
      g.heroes[g.active].pose = 'none';
    }
    g.audio.play('drop');
    for (const c of right) {
      this.ctx.flag(`sorted:${c.id}`);
    }
    const left = RIVER_ITEMS.filter((i) => !this.sorted(i.id)).length;
    g.notice(left === 0 ? 'All sorted! Now the trash rack.' : `Into ${WASTE_LABEL[kind]}. ${left} left to collect.`);
  }

  private async rack(who: HeroId): Promise<void> {
    this.ctx.game.audio.play(who === 'baging' ? 'stretch' : 'ok');
    this.ctx.flag('rackCleared');
    await this.line(who, HERO_NAME[who], who === 'baging' ? L.riverRackBaging : L.riverRackDayo);
  }

  private async openGate(): Promise<void> {
    const g = this.ctx.game;
    await this.scene(async () => {
      g.cameraTo([22, 5, -6], [8, -0.6, 0], 2.2);
      g.audio.play('done');
      this.ctx.flag('flowRestored');
      const from = { ...g.water };
      const steps = this.ctx.reduceMotion() ? 1 : 30;
      for (let i = 1; i <= steps; i += 1) {
        const k = i / steps;
        const mixV = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
        g.water = { deep: mixV(from.deep, CLEAR.deep), shallow: mixV(from.shallow, CLEAR.shallow), foam: mixV(from.foam, CLEAR.foam), flow: from.flow + (CLEAR.flow - from.flow) * k };
        await this.ctx.wait(0.05);
      }
      const n = g.npcs.paz;
      await this.say('Kagawad Paz', 'paz', L.riverGate1);
      void n;
    });
  }

  private async plan(): Promise<void> {
    await this.line(navieKey('thinking'), 'Navie', L.riverPlan);
    await this.ctx.openBoard();
  }

  private async finale(): Promise<void> {
    const g = this.ctx.game;
    const n = g.npcs.paz;
    g.placeNpc('paz', g.zone.spots.dispatch[0] - 2, g.zone.spots.dispatch[1] - 2.5, 2.4);
    await this.scene(async () => {
      this.faceAndFrame(n);
      await this.say('Kagawad Paz', 'paz', L.riverDone1);
      await this.say('Sukat', 'sukat', L.riverDone2);
      await this.navie(L.celebrate, 'clear');
    });
    this.ctx.finish();
  }

  /* ---- Every frame ---- */

  tick(): void {
    const g = this.ctx.game;
    const s = g.zone.spots;
    const step = this.step();
    let target: [number, number] | null = null;
    if (step === 'call') {
      target = s.navie ?? null;
    } else if (step === 'meet') {
      target = s.officer;
    } else if (step === 'survey') {
      target = s.footbridge;
    } else if (step === 'hazard') {
      target = s.hazardTalk;
    } else if (step === 'collect') {
      if (g.carrying.length > 0) {
        const item = RIVER_ITEMS.find((i) => i.id === g.carrying[0].id);
        const spot = item === undefined ? null : s[BIN_SPOT[item.kind]];
        target = spot === null ? null : [spot[0], spot[1] - 0.9];
      } else {
        target = this.nearest(RIVER_ITEMS.filter((i) => !this.sorted(i.id)).map((i) => (i.floating ? BANK_FOR[i.id] : LITTER_AT[i.id])));
      }
    } else if (step === 'rack') {
      target = s.rack;
    } else if (step === 'gate') {
      target = s.gate;
    } else if (step === 'plan') {
      target = s.dispatch;
    }
    this.guideTo(target);
  }
}
