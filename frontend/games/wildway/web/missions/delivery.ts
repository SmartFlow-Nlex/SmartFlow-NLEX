import { NLEX_LINES as L } from '../../core/content';
import { VEHICLES } from '../../core/emissions';
import { DELIVERY_ITEMS, DELIVERY_MISSION, DELIVERY_PICKS } from '../../core/mission';
import type { HeroAction, Interaction, Prop } from '../game';
import type { HeroId, VehicleKind } from '../models';
import { YARD_STAGE, YARD_VAN } from '../world/nlexZones';
import { anyHero, navieKey, ScriptBase } from './base';

/**
 * Eco Delivery Rush, at a made-up supply yard, in three steps: collect four supplies (one
 * for each hero), choose the vehicle, and send it off. Each supply goes straight into the
 * van, so nobody carries anything across the yard. The vehicle choice runs the transport
 * model, so its CO2 figures are calculated.
 */

/** Where each supply sits in the yard: on the rack, in the cage, on the gutter... */
const ITEM_AT: Record<string, { x: number; y: number; z: number; mesh: string }> = {
  seedlings: { x: 14, y: 0.52, z: -4.4, mesh: 'itemSeedlings' },
  tents: { x: 9, y: 4.28, z: 17, mesh: 'itemTents' },
  traps: { x: -4, y: 0, z: -6, mesh: 'itemTraps' },
  medkit: { x: -24.6, y: 0, z: -6, mesh: 'itemMedkit' },
  rope: { x: -6, y: 6.05, z: 9.7, mesh: 'itemRope' },
  water: { x: -14, y: 0, z: -13, mesh: 'itemWater' },
};

const PICK: Record<string, { hero: HeroId; label: string; pose: HeroAction['pose']; hold: number }> = {
  tents: { hero: 'dayo', label: 'Climb up for the tents', pose: 'climb', hold: 0.8 },
  medkit: { hero: 'baging', label: 'Stretch for the kit', pose: 'stretch', hold: 0.7 },
  rope: { hero: 'awit', label: 'Glide up for the rope', pose: 'glide', hold: 0.7 },
  traps: { hero: 'sukat', label: 'Find the camera kit', pose: 'scan', hold: 0.7 },
};

/** The road out: through the gate and away down the access road. */
const ROUTE: readonly [number, number][] = [
  [6, -14],
  [3, -21],
  [0, -27],
  [0, -70],
];

export class DeliveryScript extends ScriptBase {
  protected readonly def = DELIVERY_MISSION;
  private convoy: { p: Prop; d: number }[] = [];
  private driving = -1;
  private dust = 0;

  private got(id: string): boolean {
    return this.has(`got:${id}`);
  }

  /** The vehicles the chosen plan sends, or the field van before there is a plan. */
  private fleet(): VehicleKind[] {
    const plan = this.ctx.run().plan;
    const f = plan === null ? null : DELIVERY_MISSION.transport?.fleets.find((x) => x.id === plan.fleetId) ?? null;
    return f === null || !this.has('planChosen') ? ['van'] : f.trips.map((t) => VEHICLES[t.vehicleId].id as VehicleKind);
  }

  enter(spawnAt?: string): void {
    const g = this.ctx.game;
    g.loadZone('yard', this.ctx.upgrades());
    const s = g.zone.spots;
    g.carrying = [];
    this.convoy = [];
    this.driving = -1;
    g.placeNpc('ben', s.supervisor[0], s.supervisor[1] + 1.2, Math.PI);
    this.fleet().forEach((kind, i) => {
      const p = this.prop(g.vehicleMesh(kind), YARD_VAN[0] + i * 4.6, YARD_VAN[1], () => !this.has('sent'), { y: 0, yaw: Math.PI });
      this.convoy.push({ p, d: -i * 7 });
    });
    for (const id of DELIVERY_PICKS) {
      const at = ITEM_AT[id];
      this.prop(at.mesh, at.x, at.z, () => !this.got(id), { y: at.y, yaw: id === 'tents' ? 0 : 0.3 });
    }
    /* Two crates that look like the camera kit: Sukat can tell which is which. */
    for (const x of [-6, -2]) {
      this.prop('itemDecoy', x, -6, () => true, { y: 0, yaw: 0.3 });
    }
    /* The supplies by the van: the seedlings and the water from the start, the rest as they come. */
    DELIVERY_ITEMS.forEach((item, i) => {
      const ready = (): boolean => !DELIVERY_PICKS.includes(item.id) || this.got(item.id);
      this.prop(ITEM_AT[item.id].mesh, YARD_STAGE[0] - (i % 3) * 1.1, YARD_STAGE[1] - Math.floor(i / 3) * 1.1, () => ready() && !this.has('sent'), { y: 0, yaw: i });
    });
    const list: Interaction[] = [
      {
        id: 'choose',
        x: s.van[0],
        z: s.van[1],
        radius: 3.2,
        when: () => this.step() === 'choose',
        by: anyHero({ label: 'Choose a vehicle', hold: 0, run: () => this.choose() }),
      },
      {
        id: 'send',
        x: s.van[0],
        z: s.van[1],
        radius: 3.2,
        when: () => this.step() === 'send' && this.driving < 0,
        by: anyHero({ label: 'Send it off!', hold: 0, run: () => this.send() }),
      },
    ];
    for (const id of DELIVERY_PICKS) {
      const pick = PICK[id];
      const item = DELIVERY_ITEMS.find((i) => i.id === id);
      const [x, z] = s[item?.spot ?? 'items'];
      list.push({
        id: `item-${id}`,
        x,
        z,
        radius: 2.8,
        stretchRadius: id === 'medkit' ? 4.4 : undefined,
        suggest: pick.hero,
        when: () => this.step() === 'gather' && !this.got(id),
        by: { [pick.hero]: { label: pick.label, hold: pick.hold, pose: pick.pose, run: () => this.take(id) } },
      });
    }
    g.interactions = list;
    this.extras();
    const where = spawnAt ?? (this.step() === 'gather' ? 'spawn' : 'van');
    const [sx, sz] = where === 'spawn' ? [1, -22] : s[where];
    g.placeTeam(sx, sz - (where === 'van' ? 3 : 0), where === 'spawn' ? 0 : Math.PI);
  }

  async opening(): Promise<void> {
    await this.greet(this.ctx.game.npcs.ben, 'Kuya Ben', 'ben', L.delArrive);
  }

  afterDispatch(): void {
    /* The vehicle is chosen on its own screen. */
  }

  /* ---- Steps ---- */

  /** Step 1: each supply goes straight into the van. */
  private async take(id: string): Promise<void> {
    const g = this.ctx.game;
    const at = ITEM_AT[id];
    g.audio.play(id === 'traps' ? 'scan' : 'pickup');
    g.burst(at.y > 1 ? 'dust' : 'sparkle', at.x, at.y + 0.5, at.z, 8);
    g.burst('sparkle', YARD_STAGE[0], 1, YARD_STAGE[1], 8);
    this.ctx.flag(`got:${id}`);
    const left = DELIVERY_PICKS.filter((k) => !this.got(k)).length;
    const label = DELIVERY_ITEMS.find((i) => i.id === id)?.label ?? id;
    g.notice(`${label.charAt(0).toUpperCase()}${label.slice(1)}: packed!`);
    if (left === 0) {
      this.stepDone(YARD_STAGE[0], 1.2, YARD_STAGE[1]);
      await this.line('ben', 'Kuya Ben', L.delAllGot);
    }
  }

  /** Step 2: pick the vehicle. The yard is rebuilt with what was chosen. */
  private async choose(): Promise<void> {
    const chosen = await this.ctx.chooseVehicle();
    if (!chosen) {
      return;
    }
    await this.ctx.fade(() => this.enter('van'), 0.4);
    this.stepDone(YARD_VAN[0], 2, YARD_VAN[1]);
    await this.line(navieKey('clear'), 'Navie', L.delChosen);
  }

  /** Step 3: the chosen vehicles drive out of the gate. */
  private async send(): Promise<void> {
    const g = this.ctx.game;
    const ben = g.npcs.ben;
    await this.scene(async () => {
      g.cameraTo([-8, 6, -30], [3, 1, -18], 2);
      ben.pose = 'wave';
      await this.say('Kuya Ben', 'ben', L.delSend);
      this.driving = 0;
      g.audio.play('whoosh');
      await this.ctx.wait(this.ctx.reduceMotion() ? 1 : 4.2);
      /* Out of sight down the road: stop following, and come back to the yard. */
      this.driving = -1;
      g.cameraTo([-6, 7, -32], [2, 1, -16], 2);
      ben.pose = 'none';
      this.cheer();
      await this.navie(L.delDone, 'clear');
    });
    this.ctx.flag('sent');
    this.ctx.finish();
  }

  /* ---- Every frame ---- */

  private along(d: number): { x: number; z: number; yaw: number } {
    let left = Math.max(0, d);
    for (let i = 0; i < ROUTE.length - 1; i += 1) {
      const [ax, az] = ROUTE[i];
      const [bx, bz] = ROUTE[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (left <= len || i === ROUTE.length - 2) {
        const k = Math.min(1, left / len);
        return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, yaw: Math.atan2(bx - ax, bz - az) };
      }
      left -= len;
    }
    return { x: ROUTE[0][0], z: ROUTE[0][1], yaw: Math.PI };
  }

  tick(dt: number): void {
    const g = this.ctx.game;
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
          g.burst('dust', at.x - Math.sin(at.yaw) * 2.4, 0.3, at.z - Math.cos(at.yaw) * 2.4, 3);
        }
      }
      if (this.dust <= 0) {
        this.dust = 0.14;
      }
      const lead = this.along(this.driving);
      g.cameraTo([lead.x - 9, 6, lead.z + 8], [lead.x, 1, lead.z], 3);
    }
    const s = g.zone.spots;
    const step = this.step();
    let target: [number, number] | null = null;
    if (step === 'gather') {
      /* The nearest supply still to fetch. */
      const open = DELIVERY_PICKS.filter((id) => !this.got(id)).map((id) => s[DELIVERY_ITEMS.find((i) => i.id === id)?.spot ?? 'items']);
      target = this.nearest(open);
    } else if (step === 'choose' || step === 'send') {
      target = s.van;
    }
    /* Round the warehouse, the racks, the office and the cage, never into them. */
    this.guideTo(
      this.around(target, 'yard', [
        { x0: -25.3, z0: 8.6, x1: 1.3, z1: 21.3 },
        { x0: 3.9, z0: 15, x1: 16.1, z1: 19.1 },
        { x0: 16.7, z0: 6.8, x1: 28.3, z1: 17.3 },
        { x0: -28.4, z0: -10.4, x1: -20.6, z1: -1.6 },
      ]),
    );
  }
}
