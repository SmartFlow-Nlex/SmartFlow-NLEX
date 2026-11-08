import { LINES } from '../core/content';
import { currentStep, hasFlag, HORNBILL_MISSION } from '../core/mission';
import type { Interaction, Prop } from './game';
import { addExtras, anyHero, navieKey, type MissionContext, type MissionScript } from './missions/base';
import type { Actor } from './anim';
import type { Vec3 } from './gl/math';
import type { HeroId } from './models';
import { creekZ } from './world/zones';

/**
 * The Hornbill Homecoming, in three steps: find the hurt hornbill (Sukat scans it from the
 * bank), clear the path (the fallen trunk and the washed-out crossing), and help the
 * ranger (bring the kit, plant two saplings, and watch him go home). Every step can be
 * entered fresh from a save. The specialist does all the handling; the heroes keep back.
 */

export type { MissionContext } from './missions/base';

/** Where to put the team when a step is entered from a save. */
const SPAWN_BY_STEP: Record<string, string> = { find: 'spawn', path: 'bank', help: 'crossing' };

/** The kit, unloaded from the rangers' truck by the crossing. */
const KIT_AT: [number, number] = [3.2, -11.5];
const TRUCK_AT: [number, number, number] = [3.5, -33, 0.15];

/** How close anyone may walk to the bird. It must never close off the crossing or the bank. */
const KEEP_OUT = 7;

export class HornbillScript implements MissionScript {
  private logRoll = 0;
  private logGoing = false;
  private logProp: Prop | null = null;
  private readonly def = HORNBILL_MISSION;
  private extrasTick: ((dt: number) => void) | null = null;

  constructor(private readonly ctx: MissionContext) {}

  private has(flag: string): boolean {
    return hasFlag(this.ctx.run(), flag);
  }

  private step(): string | null {
    return currentStep(this.def, this.ctx.run())?.id ?? null;
  }

  private prop(mesh: string, x: number, z: number, visible: () => boolean, opts: { y?: number; yaw?: number; scale?: number } = {}): Prop {
    const g = this.ctx.game;
    const p: Prop = { mesh: g.props[mesh], x, y: opts.y ?? g.zone.height(x, z), z, yaw: opts.yaw ?? 0, scale: opts.scale ?? 1, visible };
    g.worldProps.push(p);
    return p;
  }

  /* ---- Building the forest for the current step ---- */

  enterForest(spawnAt?: string): void {
    const { game: g, upgrades } = this.ctx;
    g.loadZone('forest', upgrades());
    const s = g.zone.spots;
    this.logProp = this.prop('log', s.log[0], s.log[1], () => !this.has('logCleared') || this.logGoing);
    this.prop('brokenBridge', 0, creekZ(0), () => !this.has('crossingOpen'), { y: 0 });
    this.prop('vineBridge', 0, creekZ(0), () => this.has('bridgeVine'), { y: 0 });
    this.prop('ropeBridge', 0, creekZ(0), () => this.has('bridgeRope'), { y: 0 });
    g.bridgeOpen = () => this.has('crossingOpen');
    g.dynamicColliders = () => {
      if (this.has('logCleared')) {
        return [];
      }
      const out = [];
      for (let x = -6; x <= 5; x += 1) {
        out.push({ x, z: -25, r: 0.9 });
      }
      return out;
    };
    /* Once the track is clear, the rangers' truck comes up and the camp goes up. */
    const camp = (): boolean => this.has('logCleared');
    this.prop('tent', s.tent[0], s.tent[1], camp, { yaw: -0.5 });
    g.worldProps.push({ mesh: g.vehicleMesh('pickup'), x: TRUCK_AT[0], y: g.zone.height(TRUCK_AT[0], TRUCK_AT[1]), z: TRUCK_AT[1], yaw: TRUCK_AT[2], scale: 1, visible: camp });
    const carried = (): boolean => g.carrying.some((c) => c.id === 'kit');
    this.prop('crateKit', KIT_AT[0], KIT_AT[1], () => camp() && !this.has('kitDelivered') && !carried());
    this.prop('crateKit', s.tent[0] - 3.2, s.tent[1] + 2.4, () => this.has('kitDelivered'));
    /* Two saplings to plant, once the specialist has the bird. */
    for (const [flag, spot] of [['plantC', s.stakeC], ['plantD', s.stakeD]] as [string, [number, number]][]) {
      this.prop('stake', spot[0], spot[1], () => !this.has(flag) && this.has('assessed'));
      this.prop('sapling', spot[0], spot[1], () => this.has(flag), { scale: 1.4 });
    }
    this.prop('wheel', s.wheel[0], s.wheel[1], () => true);
    this.prop('channel', 0, 0, () => this.has('channelRestored'), { y: 0 });
    this.prop('carrier', s.tent[0] + 2.4, s.tent[1] - 3, () => this.has('assessed') && !this.has('released'));
    this.placePeople();
    this.placeBird();
    this.buildInteractions();
    this.extrasTick = addExtras(this.ctx, (f) => this.has(f)).tick;
    const where = spawnAt ?? SPAWN_BY_STEP[this.step() ?? 'find'] ?? 'spawn';
    const [sx, sz] = s[where];
    g.placeTeam(sx, sz, where === 'spawn' || where === 'crossing' ? 0 : 0.2);
    g.audio.setHum(0);
  }

  private placePeople(): void {
    const g = this.ctx.game;
    const s = g.zone.spots;
    if (this.has('logCleared')) {
      g.placeNpc('ranger', s.tent[0] + 3.2, s.tent[1] + 3, -2.4);
      g.placeNpc('vet', s.tent[0] - 1, s.tent[1] + 3.4, 2.5);
    } else {
      g.placeNpc('ranger', s.ranger[0], s.ranger[1], -0.6);
    }
  }

  private placeBird(): void {
    const g = this.ctx.game;
    const [bx, bz] = g.zone.spots.bird;
    const b = g.bird;
    b.x = bx + 0.8;
    b.z = bz + 0.3;
    b.y = g.zone.height(bx, bz) + 2.72;
    b.yaw = Math.PI + 0.3;
    b.scale = 1.3;
    g.birdVisible = !this.has('assessed');
    g.birdState = { hurt: 1, flap: 0, alert: 0 };
    g.keepOut = this.has('assessed') ? null : { x: bx, z: bz, r: KEEP_OUT, text: LINES.tooClose };
  }

  private buildInteractions(): void {
    const { game: g } = this.ctx;
    const s = g.zone.spots;
    const list: Interaction[] = [
      {
        id: 'scanBird',
        x: s.bank[0],
        z: s.bank[1],
        radius: 7,
        suggest: 'sukat',
        when: () => this.step() === 'find',
        by: { sukat: { label: 'Scan the bird', hold: 0.6, pose: 'scan', run: () => this.scanBird() } },
      },
      {
        id: 'log',
        x: s.log[0],
        z: s.log[1],
        radius: 5,
        stretchRadius: 9,
        suggest: 'dayo',
        when: () => this.step() === 'path' && !this.has('logCleared'),
        by: {
          dayo: { label: 'Push the trunk aside', hold: 1, pose: 'work', run: () => this.clearLog('dayo') },
          baging: { label: 'Stretch and drag the trunk', hold: 0.8, pose: 'stretch', run: () => this.clearLog('baging') },
        },
      },
      {
        id: 'crossing',
        x: s.crossing[0],
        z: s.crossing[1],
        radius: 4.5,
        suggest: 'baging',
        when: () => this.step() === 'path' && !this.has('crossingOpen'),
        by: {
          baging: { label: 'Stretch a vine bridge', hold: 0.9, pose: 'stretch', run: () => this.openCrossing('vine') },
          awit: { label: 'Fly a rope across', hold: 0.7, pose: 'glide', run: () => this.openCrossing('rope') },
        },
      },
      {
        id: 'crate-kit',
        x: KIT_AT[0],
        z: KIT_AT[1],
        radius: 3,
        when: () => this.step() === 'help' && !this.has('kitDelivered') && g.carrying.length === 0,
        by: anyHero({ label: 'Pick up the kit', hold: 0, run: () => this.pickUpKit() }),
      },
      {
        id: 'tentDrop',
        x: s.tent[0] - 2,
        z: s.tent[1] + 3,
        radius: 4.5,
        when: () => g.carrying.some((c) => c.id === 'kit'),
        by: anyHero({ label: 'Give the kit to the ranger', hold: 0, run: () => this.deliverKit() }),
      },
    ];
    for (const [flag, spot] of [['plantC', s.stakeC], ['plantD', s.stakeD]] as [string, [number, number]][]) {
      list.push({
        id: flag,
        x: spot[0],
        z: spot[1],
        radius: 2.8,
        when: () => this.step() === 'help' && this.has('assessed') && !this.has(flag),
        by: anyHero({ label: 'Plant a sapling', hold: 0.6, pose: 'work', run: () => this.plant(flag, spot) }),
      });
    }
    /* Optional: the dry channel. Two ways to open it. */
    list.push({
      id: 'wheel',
      x: s.wheel[0],
      z: s.wheel[1],
      radius: 3.6,
      suggest: 'awit',
      when: () => this.has('crossingOpen') && !this.has('channelRestored') && g.carrying.length === 0,
      by: {
        dayo: { label: 'Turn the sluice wheel', hold: 2, pose: 'work', run: () => this.openChannel() },
        awit: {
          label: 'Play the sluice’s tune',
          hold: 0,
          pose: 'flute',
          run: async () => {
            if (await this.ctx.flutePuzzle()) {
              await this.openChannel();
            }
          },
        },
      },
    });
    /* Optional: clues for Sukat's scanner. */
    for (const [id, spot, line] of [['feather', s.clueA, LINES.clueFeather], ['netting', s.clueB, LINES.clueNetting], ['fig', s.clueC, LINES.clueFig]] as [string, [number, number], string][]) {
      list.push({
        id: `clue-${id}`,
        x: spot[0],
        z: spot[1],
        radius: 3.4,
        suggest: 'sukat',
        /* The fig clue is across the creek: offered once the crossing is open. */
        when: () => !this.has(`clue:${id}`) && (id !== 'fig' || this.has('crossingOpen')),
        by: {
          sukat: {
            label: 'Scan this clue',
            hold: 0.5,
            pose: 'scan',
            run: async () => {
              g.audio.play('scan');
              this.ctx.flag(`clue:${id}`);
              await this.line('sukat', 'Sukat', line);
            },
          },
        },
      });
      this.prop('ring', spot[0], spot[1], () => !this.has(`clue:${id}`) && g.active === 'sukat', { scale: 0.7 });
    }
    g.interactions = list;
  }

  /** The same forest later on: the saplings grown, and the animals about. */
  enterForestForSeason(): void {
    const { game: g, upgrades } = this.ctx;
    g.loadZone('forest', upgrades());
    const s = g.zone.spots;
    this.prop('ropeBridge', 0, creekZ(0), () => true, { y: 0 });
    g.bridgeOpen = () => true;
    const scale = 1.8;
    for (const spot of [s.stakeC, s.stakeD]) {
      this.prop('sapling', spot[0], spot[1], () => true, { scale });
      this.prop('sapling', spot[0] + 2.4, spot[1] + 1.8, () => true, { scale: scale * 0.7 });
    }
    g.placeTeam(s.watch[0], s.watch[1], -0.8);
    g.interactions = [];
    this.extrasTick = addExtras(this.ctx, () => true).tick;
    g.interactions = [];
  }

  /* ---- Small helpers for scenes ---- */

  private faceAndFrame(n: Actor): void {
    const g = this.ctx.game;
    const h = g.heroes[g.active];
    const toHero = Math.atan2(h.x - n.x, h.z - n.z);
    n.yaw = toHero;
    const view = toHero + 0.75;
    g.cameraTo([n.x + Math.sin(view) * 5.4, n.y + 2.1, n.z + Math.cos(view) * 5.4], [n.x, n.y + 0.55, n.z], 5);
  }

  private async line(portrait: string, speaker: string, text: string): Promise<void> {
    this.ctx.game.busy = true;
    await this.ctx.hud.say(speaker, portrait, text);
    this.ctx.game.busy = false;
    this.ctx.hud.setHudHidden(false);
  }

  private async scene(fn: () => Promise<void>): Promise<void> {
    const { game: g, hud } = this.ctx;
    g.busy = true;
    hud.setHudHidden(true);
    await fn();
    g.busy = false;
    g.releaseCamera();
    hud.setHudHidden(false);
    hud.banner(null);
  }

  private frameBird(dist = 5): void {
    const g = this.ctx.game;
    const b = g.bird;
    const target: Vec3 = [b.x, b.y + 1, b.z];
    g.cameraTo([b.x + 2.2, b.y + 1.4, b.z - dist], target, 2.5);
  }

  private done(x: number, y: number, z: number): void {
    this.ctx.game.burst('sparkle', x, y, z, 10);
    this.ctx.game.audio.play('star');
  }

  /* ---- The MissionScript side ---- */

  enter(spawnAt?: string): void {
    this.enterForest(spawnAt);
  }

  afterDispatch(): void {
    /* No dispatch in the simplified mission. */
  }

  async opening(): Promise<void> {
    const { game: g, hud } = this.ctx;
    await this.scene(async () => {
      this.frameBird(9);
      g.audio.play('hornbill');
      g.birdState.alert = 1;
      await hud.say('Dayo', 'dayo', LINES.open1);
      await hud.say('Sukat', 'sukat', LINES.open2);
      g.birdState.alert = 0;
    });
  }

  /* ---- Step 1: find the hornbill ---- */

  private async scanBird(): Promise<void> {
    const { game: g, hud } = this.ctx;
    g.audio.play('scan');
    await this.scene(async () => {
      this.frameBird(4.5);
      await hud.say('Sukat', 'sukat', LINES.scan1);
      this.faceAndFrame(g.npcs.ranger);
      g.npcs.ranger.pose = 'wave';
      await hud.say('Ranger Ligaya', 'ranger', LINES.scan2);
      g.npcs.ranger.pose = 'none';
    });
    this.ctx.flag('birdScanned');
    const s = g.zone.spots;
    this.done(s.bank[0], 1.5, s.bank[1]);
  }

  /* ---- Step 2: clear the path ---- */

  private async clearLog(by: HeroId): Promise<void> {
    const { game: g } = this.ctx;
    this.logGoing = true;
    g.audio.play(by === 'baging' ? 'stretch' : 'ok');
    this.ctx.flag('logCleared');
    this.logRoll = 0;
    g.burst('leaf', g.zone.spots.log[0], 1, g.zone.spots.log[1], 14);
    await this.line(by, by === 'baging' ? 'Baging' : 'Dayo', by === 'baging' ? LINES.logBaging : LINES.logDayo);
    /* The truck comes through, and the camp goes up across the creek. */
    this.placePeople();
  }

  private async openCrossing(how: 'vine' | 'rope'): Promise<void> {
    const { game: g, hud } = this.ctx;
    await this.scene(async () => {
      g.cameraTo([6, 4.2, -9], [0, 0.8, 0], 2.5);
      g.audio.play(how === 'vine' ? 'stretch' : 'whoosh');
      await this.ctx.wait(0.6);
      this.ctx.flag(how === 'vine' ? 'bridgeVine' : 'bridgeRope');
      this.ctx.flag('crossingOpen');
      g.audio.play('done');
      g.burst('sparkle', 0, 1, creekZ(0), 12);
      await hud.say(how === 'vine' ? 'Baging' : 'Awit', how === 'vine' ? 'baging' : 'awit', how === 'vine' ? LINES.bridgeVine : LINES.bridgeRope);
    });
  }

  /* ---- Step 3: help the ranger ---- */

  private pickUpKit(): void {
    const g = this.ctx.game;
    g.carrying.push({ id: 'kit', mesh: g.props.crateKit });
    g.heroes[g.active].pose = 'carry';
    g.heroes[g.active].squash = 0.7;
    g.audio.play('pickup');
  }

  private async deliverKit(): Promise<void> {
    const { game: g, hud } = this.ctx;
    g.carrying = [];
    g.heroes[g.active].pose = 'none';
    g.audio.play('drop');
    this.ctx.flag('kitDelivered');
    const vet = g.npcs.vet;
    await this.scene(async () => {
      this.faceAndFrame(vet);
      await hud.say('Dr. Mayumi', 'vet', LINES.assess1);
    });
    await this.ctx.fade(() => {
      this.ctx.flag('assessed');
      g.birdVisible = false;
      g.keepOut = null;
    }, 1.1);
    await this.scene(async () => {
      this.faceAndFrame(vet);
      await hud.say('Dr. Mayumi', 'vet', LINES.assess3b);
      this.faceAndFrame(g.npcs.ranger);
      await hud.say('Ranger Ligaya', 'ranger', LINES.assess5);
    });
  }

  private async plant(flag: string, spot: [number, number]): Promise<void> {
    const g = this.ctx.game;
    g.audio.play('ok');
    g.burst('leaf', spot[0], g.zone.height(spot[0], spot[1]) + 0.8, spot[1], 12);
    const last = ['plantC', 'plantD'].every((f) => f === flag || this.has(f));
    if (!last) {
      this.ctx.flag(flag);
      g.notice(LINES.planted);
      return;
    }
    /* The last sapling: the bird goes home, then the mission is done. */
    await this.release(flag);
  }

  private async openChannel(): Promise<void> {
    const { game: g, hud } = this.ctx;
    const [x, z] = g.zone.spots.wheel;
    await this.scene(async () => {
      g.cameraTo([x - 6, g.zone.height(x, z) + 5, z + 2], [-24, 0, 18], 2);
      this.ctx.flag('channelRestored');
      g.audio.play('done');
      await hud.say('Sukat', 'sukat', LINES.channel);
    });
  }

  /** Called every frame: small things that move by themselves. */
  tick(dt: number): void {
    if (this.logGoing && this.logProp !== null) {
      this.logRoll += dt;
      this.logProp.x -= dt * 7;
      this.logProp.yaw += dt * 0.5;
      this.logProp.y -= dt * 0.25;
      if (this.logRoll > 1.6) {
        this.logGoing = false;
      }
    }
    this.extrasTick?.(dt);
    this.updateGuide();
  }

  private updateGuide(): void {
    const g = this.ctx.game;
    const step = currentStep(this.def, this.ctx.run());
    if (step === null || step.zone !== g.zoneId) {
      g.guide = null;
      return;
    }
    const s = g.zone.spots;
    let target: [number, number] | null = null;
    if (step.id === 'find') {
      target = s.bank;
    } else if (step.id === 'path') {
      target = !this.has('logCleared') ? s.log : s.crossing;
    } else if (step.id === 'help') {
      if (g.carrying.length > 0) {
        target = [s.tent[0] - 2, s.tent[1] + 3];
      } else if (!this.has('kitDelivered')) {
        target = KIT_AT;
      } else if (!this.has('assessed')) {
        target = [s.tent[0], s.tent[1] + 3];
      } else {
        target = !this.has('plantD') ? s.stakeD : s.stakeC;
      }
    }
    g.guide = target;
  }

  /* ---- The homecoming ---- */

  private async release(lastFlag: string): Promise<void> {
    const { game: g, hud } = this.ctx;
    const [wx, wz] = g.zone.spots.watch;
    const [nx, nz] = g.zone.spots.roost;
    const y0 = g.zone.height(wx, wz);
    const ny = g.zone.height(nx, nz);
    g.busy = true;
    await this.ctx.fade(() => {
      g.birdVisible = true;
      g.birdState = { hurt: 0, flap: 0, alert: 0.3 };
      g.bird.x = wx - 3;
      g.bird.z = wz + 2.6;
      g.bird.y = y0 + 0.2;
      g.bird.yaw = Math.atan2(nx - g.bird.x, nz - g.bird.z);
      g.placeNpc('vet', wx - 1.4, wz + 0.6, -0.6);
      g.placeNpc('ranger', wx + 1.4, wz + 0.2, -1);
      g.placeTeam(wx + 1, wz - 2.5, -0.4);
    }, 1.2);
    await this.scene(async () => {
      hud.banner(LINES.timeJump);
      const b = g.bird;
      g.cameraTo([b.x + 2.6, b.y + 2, b.z - 5], [b.x, b.y + 1, b.z], 3);
      await hud.say('Dr. Mayumi', 'vet', LINES.release1);
      g.audio.play('hornbill');
      /* The flight home. */
      const start: Vec3 = [b.x, b.y, b.z];
      const end: Vec3 = [nx + 0.7, ny + 5.88, nz - 0.9];
      g.birdState.flap = 1;
      const seconds = this.ctx.reduceMotion() ? 1 : 3.4;
      let t = 0;
      while (t < seconds) {
        const stepDt = 1 / 30;
        await this.ctx.wait(stepDt);
        t += stepDt;
        const k = Math.min(1, t / seconds);
        b.x = start[0] + (end[0] - start[0]) * k;
        b.z = start[2] + (end[2] - start[2]) * k;
        b.y = start[1] + (end[1] - start[1]) * k + Math.sin(k * Math.PI) * 4;
        g.cameraTo([b.x + 6.3, b.y + 0.8, b.z - 3.6], [b.x, b.y - 0.4, b.z], 3);
      }
      g.birdState.flap = 0;
      b.yaw = 3.4;
      g.audio.play('hornbill');
      await hud.say('Ranger Ligaya', 'ranger', LINES.release2);
      g.celebrate();
      await hud.say('Navie', navieKey('clear'), LINES.release3);
      hud.banner(null);
    });
    this.ctx.flag(lastFlag);
    this.ctx.flag('released');
    this.ctx.finish();
  }
}

/** The next-season scene: the forest again, later on, labelled as an illustration. */
export async function nextSeason(ctx: MissionContext, script: HornbillScript): Promise<void> {
  const { game: g, hud } = ctx;
  script.enterForestForSeason();
  const [wx, wz] = g.zone.spots.watch;
  const [nx, nz] = g.zone.spots.roost;
  g.busy = true;
  hud.setHudHidden(true);
  hud.banner(LINES.seasonBanner);
  g.cameraTo([wx + 1, g.zone.height(wx, wz) + 6, wz + 1], [-22, 0.5, 28], 3);
  await ctx.wait(0.4);
  await hud.say('Ranger Ligaya', 'ranger', LINES.season1);
  g.birdVisible = true;
  g.birdState = { hurt: 0, flap: 0, alert: 0 };
  g.bird.x = nx + 0.7;
  g.bird.z = nz - 0.9;
  g.bird.y = g.zone.height(nx, nz) + 5.88;
  g.bird.yaw = 3.4;
  g.cameraTo([nx + 7, g.zone.height(nx, nz) + 6.2, nz - 4.5], [nx + 0.7, g.zone.height(nx, nz) + 5.4, nz - 0.9], 3);
  g.audio.play('hornbill');
  await hud.say('Sukat', 'sukat', LINES.season2);
  await hud.say('Sukat', 'sukat', LINES.season3);
  hud.banner(null);
  g.releaseCamera();
  g.busy = false;
  hud.setHudHidden(false);
}
