import { NLEX_LINES as L } from '../../core/content';
import { VEHICLES } from '../../core/emissions';
import { DELIVERY_ITEMS, DELIVERY_MISSION } from '../../core/mission';
import type { HeroAction, Interaction, Prop } from '../game';
import type { HeroId, VehicleKind } from '../models';
import { YARD_STAGE, YARD_VAN } from '../world/nlexZones';
import { anyHero, navieKey, ScriptBase } from './base';

/**
 * Eco Delivery Rush, at a made-up supply yard in Balintawak. Six supplies, each reached a
 * different way; a van packed tight; a plan for the run; and the van leaving through the
 * gate. The field team it supplies is the one at Malaya Ridge, where the hornbill
 * expedition goes next.
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

const PICK: Record<string, { hero: HeroId | null; label: string; pose?: HeroAction['pose']; hold: number }> = {
  seedlings: { hero: null, label: 'Pick up the seedling trays', hold: 0 },
  tents: { hero: 'dayo', label: 'Climb the rack for the tents', pose: 'climb', hold: 1 },
  traps: { hero: null, label: 'Pick up the camera-trap kit', hold: 0 },
  medkit: { hero: 'baging', label: 'Stretch through the cage for the kit', pose: 'stretch', hold: 0.8 },
  rope: { hero: 'awit', label: 'Glide up to the gutter for the rope', pose: 'glide', hold: 0.8 },
  water: { hero: null, label: 'Pick up the water jugs', hold: 0 },
};

const SPAWN: Record<string, string> = { meet: 'spawn', gather: 'supervisor', load: 'stage', plan: 'desk', send: 'van' };

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

  enter(spawnAt?: string): void {
    if (this.step() === 'call') {
      this.enterCenter(() => this.call());
      return;
    }
    this.enterYard(spawnAt);
  }

  async opening(): Promise<void> {
    if (this.step() === 'call') {
      await this.line(navieKey('alert'), 'Navie', L.incoming);
    }
  }

  private async call(): Promise<void> {
    const g = this.ctx.game;
    await this.navie(L.delCall1, 'alert');
    await this.navie(L.delCall2, 'thinking');
    this.ctx.flag('callTaken');
    await this.ctx.fade(() => {
      g.releaseCamera();
      this.enterYard('spawn');
    }, 0.6);
    await this.line('dayo', 'Dayo', L.delArrive);
  }

  private got(id: string): boolean {
    return this.has(`got:${id}`);
  }

  private carried(id: string): boolean {
    return this.ctx.game.carrying.some((c) => c.id === id);
  }

  /** The vehicles the chosen plan sends, or the field van before there is a plan. */
  private fleet(): VehicleKind[] {
    const plan = this.ctx.run().plan;
    const f = plan === null ? null : DELIVERY_MISSION.transport?.fleets.find((x) => x.id === plan.fleetId) ?? null;
    return f === null || !this.has('planChosen') ? ['van'] : f.trips.map((t) => VEHICLES[t.vehicleId].id as VehicleKind);
  }

  private enterYard(spawnAt?: string): void {
    const g = this.ctx.game;
    g.loadZone('yard', this.ctx.upgrades());
    const s = g.zone.spots;
    g.carrying = [];
    this.convoy = [];
    this.driving = -1;
    g.placeNpc('ben', s.supervisor[0], s.supervisor[1] + 1.2, Math.PI);
    /* The vehicles at the loading bay: the chosen plan's, once there is one. */
    this.fleet().forEach((kind, i) => {
      const p = this.prop(g.vehicleMesh(kind), YARD_VAN[0] + i * 4.6, YARD_VAN[1], () => !this.has('sent'), { y: 0, yaw: Math.PI });
      this.convoy.push({ p, d: -i * 7 });
    });
    for (const item of DELIVERY_ITEMS) {
      const at = ITEM_AT[item.id];
      this.prop(at.mesh, at.x, at.z, () => !this.got(item.id) && !this.carried(item.id), { y: at.y, yaw: item.id === 'tents' ? 0 : 0.3 });
    }
    /* Two crates that look like the camera-trap kit, and are not. */
    for (const x of [-6, -2]) {
      this.prop('itemDecoy', x, -6, () => true, { y: 0, yaw: 0.3 });
    }
    /* What the team has found, piled by the van until it is packed. */
    DELIVERY_ITEMS.forEach((item, i) => {
      this.prop(ITEM_AT[item.id].mesh, YARD_STAGE[0] - (i % 3) * 1.1, YARD_STAGE[1] - Math.floor(i / 3) * 1.1, () => this.got(item.id) && !this.has('loaded'), { y: 0, yaw: i });
    });
    const list: Interaction[] = [
      {
        id: 'supervisor',
        x: s.supervisor[0],
        z: s.supervisor[1],
        radius: 3.4,
        when: () => this.step() === 'meet',
        by: anyHero({ label: 'Talk to Kuya Ben', hold: 0, run: () => this.meet() }),
      },
      {
        id: 'scanCrates',
        x: s.itemTraps[0],
        z: s.itemTraps[1],
        radius: 3,
        suggest: 'sukat',
        when: () => this.step() === 'gather' && !this.has('trapsFound'),
        by: { sukat: { label: 'Scan the three crates', hold: 0.8, pose: 'scan', run: () => this.scanCrates() } },
      },
      {
        id: 'stage',
        x: s.stage[0],
        z: s.stage[1],
        radius: 2.8,
        when: () => this.step() === 'gather' && this.ctx.game.carrying.length > 0,
        by: anyHero({ label: 'Put it by the van', hold: 0, run: () => this.stage() }),
      },
      {
        id: 'load',
        x: s.van[0],
        z: s.van[1],
        radius: 3,
        when: () => this.step() === 'load',
        by: anyHero({ label: 'Pack the van', hold: 0, run: () => this.load() }),
      },
      {
        id: 'desk',
        x: s.desk[0],
        z: s.desk[1],
        radius: 3,
        when: () => this.step() === 'plan',
        by: anyHero({ label: 'Plan the run to the ridge', hold: 0, run: () => this.plan() }),
      },
      {
        id: 'send',
        x: s.van[0],
        z: s.van[1],
        radius: 3.2,
        when: () => this.step() === 'send' && this.driving < 0,
        by: anyHero({ label: 'Send it off', hold: 0, run: () => this.send() }),
      },
    ];
    for (const item of DELIVERY_ITEMS) {
      const pick = PICK[item.id];
      const [x, z] = s[item.spot];
      const action: HeroAction = { label: pick.label, hold: pick.hold, pose: pick.pose, run: () => this.take(item.id) };
      list.push({
        id: `item-${item.id}`,
        x,
        z,
        radius: 2.6,
        stretchRadius: item.id === 'medkit' ? 4.4 : undefined,
        suggest: pick.hero ?? undefined,
        when: () => this.step() === 'gather' && !this.got(item.id) && !this.carried(item.id) && this.canCarryMore() && (item.id !== 'traps' || this.has('trapsFound')),
        by: pick.hero === null ? anyHero(action) : { [pick.hero]: action },
      });
    }
    g.interactions = list;
    this.extras();
    const where = spawnAt ?? SPAWN[this.step() ?? 'meet'] ?? 'spawn';
    const [sx, sz] = s[where];
    g.placeTeam(sx, sz - (where === 'supervisor' ? 2.6 : 0), where === 'spawn' ? 0 : Math.PI);
  }

  afterDispatch(): void {
    this.enterYard('van');
    void this.line(navieKey('clear'), 'Navie', 'Packed, planned and ready. Send it off from the van.');
  }

  /* ---- Steps ---- */

  private async meet(): Promise<void> {
    const n = this.ctx.game.npcs.ben;
    await this.scene(async () => {
      this.faceAndFrame(n);
      n.pose = 'wave';
      await this.say('Kuya Ben', 'ben', L.delMeet1);
      n.pose = 'none';
      await this.say('Kuya Ben', 'ben', L.delMeet2);
    });
    this.ctx.flag('supervisorMet');
  }

  private async scanCrates(): Promise<void> {
    const g = this.ctx.game;
    g.audio.play('scan');
    g.burst('sparkle', -4, 1, -6, 8);
    this.ctx.flag('trapsFound');
    await this.line('sukat', 'Sukat', L.delTraps);
  }

  private take(id: string): void {
    const at = ITEM_AT[id];
    this.pickUp(id, at.mesh);
    if (at.y > 1) {
      this.ctx.game.burst('dust', at.x, at.y, at.z, 6);
    }
  }

  private async stage(): Promise<void> {
    const g = this.ctx.game;
    const ids = g.carrying.map((c) => c.id).filter((id) => DELIVERY_ITEMS.some((i) => i.id === id));
    g.carrying = [];
    g.heroes[g.active].pose = 'none';
    g.audio.play('drop');
    g.burst('sparkle', YARD_STAGE[0], 1, YARD_STAGE[1], 8);
    for (const id of ids) {
      this.ctx.flag(`got:${id}`);
    }
    const left = DELIVERY_ITEMS.filter((i) => !this.got(i.id)).length;
    if (left > 0) {
      g.notice(`${DELIVERY_ITEMS.length - left} of ${DELIVERY_ITEMS.length} by the van.`);
      return;
    }
    await this.line(navieKey('clear'), 'Navie', L.delAllGot);
  }

  private async load(): Promise<void> {
    const ok = await this.ctx.loadVan('delivery', 'Tap a piece, then a space. Tap it again to turn it. No water next to electronics.');
    if (!ok) {
      this.ctx.game.notice('Still to pack. Come back whenever you like.');
      return;
    }
    this.ctx.flag('loaded');
    this.ctx.game.audio.play('done');
    await this.line('ben', 'Kuya Ben', L.delLoaded);
  }

  private async plan(): Promise<void> {
    await this.line(navieKey('thinking'), 'Navie', L.delPlan);
    await this.ctx.openBoard();
  }

  /** The van, and anything else the plan sends, drive out of the gate. */
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
    if (step === 'call') {
      target = s.navie ?? null;
    } else if (step === 'meet') {
      target = s.supervisor;
    } else if (step === 'gather') {
      /* Nobody can switch heroes while carrying: then only point at what this hero can take. */
      const carrying = g.carrying.length > 0;
      const open = DELIVERY_ITEMS.filter((i) => !this.got(i.id) && !this.carried(i.id)).filter((i) => !carrying || ((i.hero === null || i.hero === g.active) && (i.id !== 'traps' || this.has('trapsFound'))));
      if (carrying && (!this.canCarryMore() || open.length === 0)) {
        target = s.stage;
      } else {
        const spots = open.map((i) => (i.id === 'traps' && !this.has('trapsFound') ? s.itemTraps : s[i.spot]));
        target = spots.length === 0 ? s.stage : this.nearest(spots);
      }
    } else if (step === 'load' || step === 'send') {
      target = s.van;
    } else if (step === 'plan') {
      target = s.desk;
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
