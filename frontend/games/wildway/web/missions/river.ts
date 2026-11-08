import { NLEX_LINES as L } from '../../core/content';
import { CREEK_LITTER, RIVER_ITEMS, RIVER_MISSION, WASTE_LABEL } from '../../core/mission';
import type { FaunaKind } from '../../core/progression';
import type { Interaction } from '../game';
import type { Vec3 } from '../gl/math';
import type { HeroId } from '../models';
import { riverZ } from '../world/nlexZones';
import { anyHero, HERO_NAME, navieKey, ScriptBase } from './base';

const RIVER_WATER_Y = -0.9;

/**
 * Creek Rescue, at a made-up creek in a made-up barangay, in three steps: pick up the
 * litter, clear the blocked trash rack, and spot the animals that come back once the water
 * runs clean. Each piece goes straight into the barangay's sorted sacks, and the game says
 * which: no trips to the bins.
 */

/* Murky but still plainly water: grey-green, not the brown of the banks. */
const MURKY = { deep: [0.3, 0.38, 0.26] as Vec3, shallow: [0.45, 0.53, 0.36] as Vec3, foam: [0.84, 0.86, 0.76] as Vec3, flow: 0.12 };
const CLEAR = { deep: [0.16, 0.5, 0.72] as Vec3, shallow: [0.3, 0.7, 0.82] as Vec3, foam: [0.93, 0.98, 1] as Vec3, flow: 1 };

/** Where each piece lies, west to east along the north bank. The bottle floats. */
const LITTER_AT: Record<string, [number, number]> = {
  can: [-24, 6.6],
  bottle: [-6, riverZ(-6) + 1.4],
  wrappers: [-3, 7.4],
  jar: [8.5, 7.6],
  peels: [17, 7.2],
};
const BOTTLE_BANK: [number, number] = [-6, riverZ(-6) + 4.6];

/** The animals step 3 asks for. */
const RETURNING: readonly FaunaKind[] = ['fish', 'dragonfly', 'frog'];

export class RiverScript extends ScriptBase {
  protected readonly def = RIVER_MISSION;

  private sorted(id: string): boolean {
    return this.has(`sorted:${id}`);
  }

  enter(spawnAt?: string): void {
    const g = this.ctx.game;
    g.loadZone('river', this.ctx.upgrades());
    const s = g.zone.spots;
    g.carrying = [];
    g.water = this.has('flowRestored') ? { ...CLEAR } : { ...MURKY };
    g.placeNpc('paz', s.officer[0] - 0.4, s.officer[1] + 1.4, 3.1);
    for (const id of CREEK_LITTER) {
      const item = RIVER_ITEMS.find((i) => i.id === id);
      const [x, z] = LITTER_AT[id];
      this.prop(id, x, z, () => !this.sorted(id), { y: item?.floating === true ? RIVER_WATER_Y : undefined, yaw: x * 0.7 });
    }
    this.prop('rackJunk', 31.3, riverZ(31.3), () => !this.has('rackCleared'), { y: -0.35 });
    /* Reeds along the banks, once the water runs clean. */
    for (const x of [-34, -21, -9, 10, 19, 26]) {
      for (const side of [-1, 1]) {
        this.prop('reeds', x + side * 1.5, riverZ(x) + side * 4.2, () => this.has('flowRestored'), { yaw: x });
      }
    }
    const list: Interaction[] = [
      {
        id: 'rack',
        x: s.rack[0],
        z: s.rack[1],
        radius: 3,
        stretchRadius: 4.6,
        suggest: 'baging',
        when: () => this.step() === 'clear',
        by: {
          baging: { label: 'Stretch and clear the blockage', hold: 1, pose: 'stretch', run: () => this.clearRack('baging') },
          dayo: { label: 'Rake out the blockage', hold: 1.4, pose: 'work', run: () => this.clearRack('dayo') },
        },
      },
    ];
    for (const id of CREEK_LITTER) {
      const item = RIVER_ITEMS.find((i) => i.id === id);
      const floating = item?.floating === true;
      const [x, z] = floating ? BOTTLE_BANK : LITTER_AT[id];
      const when = (): boolean => this.step() === 'collect' && !this.sorted(id);
      const take = (): void => this.pick(id);
      list.push(
        floating
          ? { id: `item-${id}`, x, z, radius: 2.6, stretchRadius: 3.8, suggest: 'baging', when, by: { baging: { label: `Stretch for the ${item?.label ?? id}`, hold: 0.6, pose: 'stretch', run: take } } }
          : { id: `item-${id}`, x, z, radius: 2.4, when, by: anyHero({ label: `Pick up the ${item?.label ?? id}`, hold: 0, run: take }) },
      );
    }
    g.interactions = list;
    this.extras({
      wants: (kind) => this.step() === 'wildlife' && RETURNING.includes(kind) && !this.has(`spot:${kind}`),
      onPhoto: (kind) => this.spotted(kind),
    });
    const where = spawnAt ?? (this.stepAtLeast('clear') ? 'bankEast' : 'spawn');
    const [sx, sz] = s[where];
    g.placeTeam(sx, sz, where === 'spawn' ? 1.6 : 2.6);
  }

  async opening(): Promise<void> {
    await this.greet(this.ctx.game.npcs.paz, 'Kagawad Paz', 'paz', L.riverArrive);
  }

  afterDispatch(): void {
    /* No dispatch in this mission. */
  }

  /* ---- Steps ---- */

  /** Step 1: every piece goes straight into the right sorted sack. */
  private pick(id: string): void {
    const g = this.ctx.game;
    const item = RIVER_ITEMS.find((i) => i.id === id);
    const [x, z] = LITTER_AT[id];
    g.audio.play('pickup');
    g.burst(item?.kind === 'bio' ? 'leaf' : 'sparkle', x, (item?.floating === true ? RIVER_WATER_Y : g.zone.height(x, z)) + 0.6, z, 10);
    if (item?.floating === true) {
      g.burst('splash', x, RIVER_WATER_Y + 0.4, z, 10);
    }
    this.ctx.flag(`sorted:${id}`);
    const left = CREEK_LITTER.filter((k) => !this.sorted(k)).length;
    g.notice(item === undefined ? 'Picked up!' : `${WASTE_LABEL[item.kind]}!`);
    if (left === 0) {
      void this.line(navieKey('clear'), 'Navie', L.riverAllPicked);
    }
  }

  /** Step 2: the blockage comes out, the water runs clean, and life comes back. */
  private async clearRack(who: HeroId): Promise<void> {
    const g = this.ctx.game;
    g.audio.play(who === 'baging' ? 'stretch' : 'ok');
    this.ctx.flag('rackCleared');
    await this.scene(async () => {
      g.cameraTo([22, 5, -6], [8, -0.6, 0], 2.2);
      await this.say(HERO_NAME[who], who, who === 'baging' ? L.riverRackBaging : L.riverRackDayo);
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
      g.burst('splash', 30, -0.3, riverZ(30), 20);
      await this.say('Kagawad Paz', 'paz', L.riverFlow);
      g.cameraTo([24, 4, 14], [16, -0.6, riverZ(16)], 2.2);
      await this.ctx.wait(this.ctx.reduceMotion() ? 0.2 : 0.9);
      await this.navie(L.riverAnimals, 'hello');
    });
    this.stepDone(30.5, 1.6, 4.6);
  }

  /** Step 3: a photo of each returning animal. */
  private async spotted(kind: FaunaKind): Promise<void> {
    if (this.step() !== 'wildlife' || !RETURNING.includes(kind) || this.has(`spot:${kind}`)) {
      return;
    }
    this.ctx.flag(`spot:${kind}`);
    const left = RETURNING.filter((k) => !this.has(`spot:${k}`)).length;
    if (left > 0) {
      return;
    }
    const g = this.ctx.game;
    const h = g.heroes[g.active];
    await this.scene(async () => {
      /* The team on the bank, with the creek and its wildlife behind them. */
      g.cameraTo([h.x + 4.5, h.y + 3.2, h.z + 5.5], [h.x, h.y + 0.8, h.z - 1.5], 3);
      this.cheer();
      await this.navie(L.riverDone, 'clear');
      await this.navie(L.celebrate, 'hello');
    });
    this.ctx.finish();
  }

  /* ---- Every frame ---- */

  tick(dt: number): void {
    this.tickExtras(dt);
    const g = this.ctx.game;
    const s = g.zone.spots;
    const step = this.step();
    let target: [number, number] | null = null;
    if (step === 'collect') {
      const open = CREEK_LITTER.filter((id) => !this.sorted(id)).map((id) => (id === 'bottle' ? BOTTLE_BANK : LITTER_AT[id]));
      target = open[0] ?? null;
    } else if (step === 'clear') {
      target = s.rack;
    } else if (step === 'wildlife') {
      /* The nearest animal still to photograph. */
      const h = g.heroes[g.active];
      let best: [number, number] | null = null;
      let d = Infinity;
      for (const kind of RETURNING.filter((k) => !this.has(`spot:${k}`))) {
        const a = g.fauna.nearest(kind, h.x, h.z);
        if (a !== null) {
          /* Stand on the bank, not in the water. */
          const bankZ = a.z > riverZ(a.x) ? Math.max(a.z, riverZ(a.x) + 4.4) : Math.min(a.z, riverZ(a.x) - 4.4);
          const dd = Math.hypot(a.x - h.x, a.z - h.z);
          if (dd < d) {
            d = dd;
            best = [a.x, kind === 'frog' ? a.z : bankZ];
          }
        }
      }
      target = best;
    }
    this.guideTo(target);
  }
}
