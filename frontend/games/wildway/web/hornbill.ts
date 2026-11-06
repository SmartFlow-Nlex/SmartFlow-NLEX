import type { Actor } from './anim';
import { LINES, NLEX_LINES } from '../core/content';
import { currentStep, hasFlag, HORNBILL_MISSION } from '../core/mission';
import { VEHICLES } from '../core/emissions';
import { HORNBILL_TRANSPORT, type Plan } from '../core/transport';
import type { HeroAction, Interaction, Prop } from './game';
import { navieKey, type MissionContext, type MissionScript } from './missions/base';
import { clamp, type Vec3 } from './gl/math';
import type { HeroId, VehicleKind } from './models';
import { creekZ } from './world/zones';

/**
 * The Hornbill Homecoming, written against the game's world: which props stand where,
 * what each hero can do at each spot, and the short scripted moments. Every step can
 * be entered fresh from a save, so an interrupted mission resumes at its last checkpoint.
 */

export type { MissionContext } from './missions/base';

const HERO_IDS: readonly HeroId[] = ['dayo', 'baging', 'sukat', 'awit'];

const anyHero = (action: HeroAction): Partial<Record<HeroId, HeroAction>> => {
  const out: Partial<Record<HeroId, HeroAction>> = {};
  for (const id of HERO_IDS) {
    out[id] = action;
  }
  return out;
};

/** Where to put the team when a step is entered from a save. */
const SPAWN_BY_STEP: Record<string, string> = {
  walk: 'spawn',
  scan: 'bank',
  ranger: 'bank',
  log: 'arrive',
  cross: 'arrive',
  deliver: 'crossing',
  signs: 'tent',
  assess: 'tent',
  noise: 'tent',
  noiseOff: 'noiseSpot',
  plant: 'tent',
  release: 'watch',
};

const VEHICLE_SPOTS: [number, number, number][] = [
  [8, -46, 0.3],
  [12, -40, 0.1],
  [4, -52, 0.2],
];

/** How close anyone may walk to the bird. It must never close off the crossing or the bank. */
const KEEP_OUT = 7;

export class HornbillScript implements MissionScript {
  private cratesDown: Record<string, boolean> = {};
  private logRoll = 0;
  private logGoing = false;
  private readonly def = HORNBILL_MISSION;

  constructor(private readonly ctx: MissionContext) {}

  private has(flag: string): boolean {
    return hasFlag(this.ctx.run(), flag);
  }

  private step(): string | null {
    return currentStep(this.def, this.ctx.run())?.id ?? null;
  }

  private prop(mesh: string, x: number, z: number, visible: () => boolean, opts: { y?: number; yaw?: number; scale?: number } = {}): Prop {
    const g = this.ctx.game;
    const p: Prop = {
      mesh: g.props[mesh],
      x,
      y: opts.y ?? g.zone.height(x, z),
      z,
      yaw: opts.yaw ?? 0,
      scale: opts.scale ?? 1,
      visible,
    };
    g.worldProps.push(p);
    return p;
  }

  /* ---- Building a zone for the current step ---- */

  enterForest(spawnAt?: string): void {
    const { game: g, upgrades } = this.ctx;
    g.loadZone('forest', upgrades());
    const spots = g.zone.spots;
    this.cratesDown = {};
    /* The trunk across the track, and the bridge that the flood took. */
    const logProp = this.prop('log', spots.log[0], spots.log[1], () => !this.has('logCleared') || this.logGoing);
    this.logProp = logProp;
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
    /* The camp only exists once the team has come. */
    const arrived = (): boolean => this.has('planChosen');
    this.prop('tent', spots.tent[0], spots.tent[1], arrived, { yaw: -0.5 });
    /* The vehicles of the player's own plan, parked at the lay-by. */
    const plan: Plan | null = this.ctx.run().plan;
    if (plan !== null) {
      const fleet = HORNBILL_TRANSPORT.fleets.find((f) => f.id === plan.fleetId);
      fleet?.trips.forEach((trip, i) => {
        const [x, z, yaw] = VEHICLE_SPOTS[i % VEHICLE_SPOTS.length];
        g.worldProps.push({ mesh: g.vehicleMesh(VEHICLES[trip.vehicleId].id as VehicleKind), x, y: g.zone.height(x, z), z, yaw, scale: 1, visible: arrived });
      });
    }
    /* Crates at the vehicle until they have been carried to the tent. */
    this.crate('kit', 'crateKit', spots.vehicle[0] - 3, spots.vehicle[1] + 3, 'kitDelivered', spots.tent[0] - 3.2, spots.tent[1] + 2.4);
    this.crate('saplings', 'crateGreen', spots.vehicle[0] - 4.4, spots.vehicle[1] + 1.2, 'saplingsDelivered', spots.tent[0] - 4.2, spots.tent[1] + 1);
    /* Quiet-zone signs. */
    for (const [flag, spot, yaw] of [['signA', spots.signA, 0.8], ['signB', spots.signB, -0.8]] as [string, [number, number], number][]) {
      this.prop('sign', spot[0], spot[1], () => this.has(flag), { yaw });
      this.prop('stake', spot[0], spot[1], () => !this.has(flag) && this.stepAtLeast('signs'));
    }
    /* The forest gap: marked, then replanted. */
    for (const [flag, spot] of [['plantA', spots.stakeA], ['plantB', spots.stakeB], ['plantC', spots.stakeC], ['plantD', spots.stakeD]] as [string, [number, number]][]) {
      this.prop('stake', spot[0], spot[1], () => !this.has(flag) && this.stepAtLeast('plant'));
      this.prop('sapling', spot[0], spot[1], () => this.has(flag), { scale: 1.4 });
    }
    /* The noise on the ledge, and the sluice. */
    this.prop('generator', spots.generator[0], spots.generator[1], () => true);
    this.prop('wheel', spots.wheel[0], spots.wheel[1], () => true);
    this.prop('channel', 0, 0, () => this.has('channelRestored'), { y: 0 });
    this.prop('carrier', spots.tent[0] + 2.4, spots.tent[1] - 3, () => this.has('assessed') && !this.has('released'));
    /* People. */
    const after = this.has('planChosen');
    if (after) {
      g.placeNpc('ranger', spots.tent[0] + 3.2, spots.tent[1] + 3, -2.4);
      g.placeNpc('vet', spots.tent[0] - 1, spots.tent[1] + 3.4, 2.5);
    } else {
      g.placeNpc('ranger', spots.ranger[0], spots.ranger[1], -0.6);
    }
    this.placeBird();
    this.buildInteractions();
    const where = spawnAt ?? SPAWN_BY_STEP[this.step() ?? 'walk'] ?? 'spawn';
    const [sx, sz] = spots[where];
    g.placeTeam(sx, sz, where === 'spawn' || where === 'arrive' || where === 'crossing' ? 0 : 0.2);
    g.audio.setHum(this.has('noiseOff') ? 0 : 0.8);
  }

  private logProp: Prop | null = null;

  private stepAtLeast(id: string): boolean {
    const want = this.def.steps.findIndex((s) => s.id === id);
    return this.ctx.run().step >= want;
  }

  private crate(id: string, mesh: string, x: number, z: number, deliveredFlag: string, tx: number, tz: number): void {
    const g = this.ctx.game;
    const carried = (): boolean => g.carrying.some((c) => c.id === id);
    const stacked = this.prop(mesh, tx, tz, () => this.has(deliveredFlag));
    void stacked;
    this.prop(mesh, x, z, () => this.has('planChosen') && !this.has(deliveredFlag) && !carried());
    this.crateSpots[id] = [x, z];
    this.crateMesh[id] = mesh;
  }

  private readonly crateSpots: Record<string, [number, number]> = {};
  private readonly crateMesh: Record<string, string> = {};

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
    const list: Interaction[] = [];
    const at = this;
    const add = (it: Interaction): void => {
      list.push(it);
    };

    add({
      id: 'scanBird',
      x: s.bank[0],
      z: s.bank[1],
      radius: 7,
      suggest: 'sukat',
      when: () => at.step() === 'scan',
      by: { sukat: { label: 'Scan the bird', hold: 0.8, pose: 'scan', run: () => this.scanBird() } },
    });
    add({
      id: 'talkRanger',
      x: s.ranger[0],
      z: s.ranger[1],
      radius: 4,
      when: () => at.step() === 'ranger',
      by: anyHero({ label: 'Talk to Ranger Ligaya', hold: 0, run: () => this.talkRanger() }),
    });
    add({
      id: 'log',
      x: s.log[0],
      z: s.log[1],
      radius: 5,
      stretchRadius: 9,
      suggest: 'dayo',
      when: () => at.step() === 'log',
      by: {
        dayo: { label: 'Push the trunk aside', hold: 1.4, pose: 'work', run: () => this.clearLog('dayo') },
        baging: { label: 'Stretch and drag the trunk', hold: 1, pose: 'stretch', run: () => this.clearLog('baging') },
      },
    });
    add({
      id: 'crossing',
      x: s.crossing[0],
      z: s.crossing[1],
      radius: 4.5,
      suggest: 'baging',
      when: () => at.step() === 'cross',
      by: {
        baging: { label: 'Stretch a vine bridge', hold: 1.2, pose: 'stretch', run: () => this.openCrossing('vine') },
        awit: { label: 'Fly a rope across', hold: 0.8, pose: 'glide', run: () => this.openCrossing('rope') },
      },
    });
    for (const [id, deliveredFlag, label] of [['kit', 'kitDelivered', 'the assessment kit'], ['saplings', 'saplingsDelivered', 'the saplings']] as [string, string, string][]) {
      add({
        id: `crate-${id}`,
        x: this.crateSpots[id][0],
        z: this.crateSpots[id][1],
        radius: 3,
        when: () => at.stepAtLeast('log') && !this.has(deliveredFlag) && !g.carrying.some((c) => c.id === id) && (g.carrying.length === 0 || (g.active === 'baging' && g.carrying.length === 1)),
        by: anyHero({ label: `Pick up ${label}`, hold: 0, run: () => this.pickUp(id) }),
      });
    }
    add({
      id: 'tentDrop',
      x: s.tent[0] - 2,
      z: s.tent[1] + 3,
      radius: 4.5,
      when: () => g.carrying.length > 0,
      by: anyHero({ label: 'Set it down at the tent', hold: 0, run: () => this.drop() }),
    });
    for (const [flag, spot] of [['signA', s.signA], ['signB', s.signB]] as [string, [number, number]][]) {
      add({
        id: flag,
        x: spot[0],
        z: spot[1],
        radius: 3.2,
        when: () => at.step() === 'signs' && !this.has(flag),
        by: anyHero({
          label: 'Put up a quiet-zone sign',
          hold: 0.7,
          pose: 'work',
          run: () => {
            g.audio.play('flag');
            this.ctx.flag(flag);
          },
        }),
      });
    }
    add({
      id: 'assess',
      x: s.tent[0],
      z: s.tent[1] + 3,
      radius: 5,
      when: () => at.step() === 'assess',
      by: anyHero({ label: 'Tell Dr. Mayumi it is ready', hold: 0, run: () => this.assess() }),
    });
    add({
      id: 'noise',
      x: s.noiseSpot[0],
      z: s.noiseSpot[1],
      radius: 4.5,
      suggest: 'sukat',
      when: () => at.step() === 'noise',
      by: {
        sukat: { label: 'Take a noise reading', hold: 1, pose: 'scan', run: () => this.findNoise('sukat') },
        awit: { label: 'Scout from above', hold: 0.8, pose: 'glide', run: () => this.findNoise('awit') },
      },
    });
    add({
      id: 'generator',
      x: s.vines[0],
      z: s.vines[1],
      radius: 3.6,
      stretchRadius: 6,
      suggest: 'dayo',
      when: () => at.step() === 'noiseOff',
      by: {
        dayo: { label: 'Climb up and switch it off', hold: 0.8, pose: 'climb', run: () => this.noiseOff('dayo') },
        baging: { label: 'Stretch up and pull the cord', hold: 1.1, pose: 'stretch', run: () => this.noiseOff('baging') },
      },
    });
    for (const [flag, spot] of [['plantA', s.stakeA], ['plantB', s.stakeB], ['plantC', s.stakeC], ['plantD', s.stakeD]] as [string, [number, number]][]) {
      const planted = (): void => {
        g.audio.play('ok');
        this.ctx.flag(flag);
      };
      add({
        id: flag,
        x: spot[0],
        z: spot[1],
        radius: 2.8,
        stretchRadius: 6,
        suggest: 'dayo',
        when: () => at.step() === 'plant' && !this.has(flag),
        by: {
          dayo: { label: 'Plant a native sapling', hold: 0.9, pose: 'work', run: planted },
          baging: { label: 'Stretch and plant', hold: 1.2, pose: 'stretch', run: planted },
        },
      });
    }
    add({
      id: 'release',
      x: s.watch[0],
      z: s.watch[1],
      radius: 6,
      when: () => at.step() === 'release',
      by: anyHero({ label: 'See how it turned out', hold: 0, run: () => this.release() }),
    });
    /* Optional: the dry channel. Two ways to open it. */
    add({
      id: 'wheel',
      x: s.wheel[0],
      z: s.wheel[1],
      radius: 3.6,
      suggest: 'awit',
      when: () => at.stepAtLeast('deliver') && !this.has('channelRestored') && g.carrying.length === 0,
      by: {
        dayo: { label: 'Turn the stiff sluice wheel', hold: 2.6, pose: 'work', run: () => this.openChannel() },
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
    /* Optional: evidence for the Atlas, for Sukat's scanner. */
    for (const [id, spot, line] of [['feather', s.clueA, LINES.clueFeather], ['netting', s.clueB, LINES.clueNetting], ['fig', s.clueC, LINES.clueFig]] as [string, [number, number], string][]) {
      add({
        id: `clue-${id}`,
        x: spot[0],
        z: spot[1],
        radius: 3.4,
        suggest: 'sukat',
        when: () => !this.has(`clue:${id}`),
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

  /** The same forest later on: the gap replanted and grown, the noise gone. */
  enterForestForSeason(): void {
    const { game: g, upgrades } = this.ctx;
    g.loadZone('forest', upgrades());
    const s = g.zone.spots;
    this.prop('ropeBridge', 0, creekZ(0), () => true, { y: 0 });
    g.bridgeOpen = () => true;
    const scale = 1.8;
    for (const spot of [s.stakeA, s.stakeB, s.stakeC, s.stakeD]) {
      this.prop('sapling', spot[0], spot[1], () => true, { scale });
      this.prop('sapling', spot[0] + 2.4, spot[1] + 1.8, () => true, { scale: scale * 0.7 });
    }
    g.placeTeam(s.watch[0], s.watch[1], -0.8);
    g.interactions = [];
  }

  /* ---- Small helpers for scenes ---- */

  /** Someone talking: turned to the hero, with their face in frame above the speech bubble. */
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

  /** Runs lines in a row, with the HUD hidden throughout. */
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

  /* ---- The MissionScript side ---- */

  enter(spawnAt?: string): void {
    const step = currentStep(this.def, this.ctx.run());
    if (step !== null && step.zone === 'station') {
      this.enterStation();
    } else {
      this.enterForest(spawnAt);
    }
  }

  afterDispatch(): void {
    this.enterForest('arrive');
  }

  /* ---- The opening ---- */

  async opening(): Promise<void> {
    if (this.step() === 'call') {
      await this.line(navieKey('alert'), 'Navie', NLEX_LINES.incoming);
      return;
    }
    await this.forestOpening();
  }

  /** The Command Center takes Ranger Ligaya's call, then the team goes to Malaya Ridge. */
  private async takeCall(): Promise<void> {
    const { game: g, hud } = this.ctx;
    const [x, z] = g.zone.spots.navie;
    g.audio.play('ok');
    await this.scene(async () => {
      g.cameraTo([x + Math.sin(2.6) * 6.5, 3.4, z + Math.cos(2.6) * 6.5], [x, 2.9, z], 5);
      await hud.say('Navie', navieKey('alert'), LINES.call1);
      await hud.say('Ranger Ligaya', 'ranger', LINES.call2);
      await hud.say('Navie', navieKey('clear'), LINES.call3);
    });
    this.ctx.flag('callTaken');
    await this.ctx.fade(() => {
      g.releaseCamera();
      this.enterForest();
    });
    await this.forestOpening();
  }

  private async forestOpening(): Promise<void> {
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

  private async scanBird(): Promise<void> {
    const { game: g, hud } = this.ctx;
    g.audio.play('scan');
    await this.scene(async () => {
      this.frameBird(4.5);
      await hud.say('Sukat', 'sukat', LINES.scan1);
      await hud.say('Sukat', 'sukat', LINES.scan2);
      await hud.say('Dayo', 'dayo', LINES.scan3);
    });
    this.ctx.flag('birdScanned');
  }

  private async talkRanger(): Promise<void> {
    const { game: g, hud } = this.ctx;
    const n = g.npcs.ranger;
    await this.scene(async () => {
      this.faceAndFrame(n);
      n.pose = 'wave';
      await hud.say('Ranger Ligaya', 'ranger', LINES.ranger1);
      n.pose = 'none';
      await hud.say('Ranger Ligaya', 'ranger', LINES.ranger2);
      await hud.say('Ranger Ligaya', 'ranger', LINES.ranger3);
      await hud.say('Sukat', 'sukat', LINES.ranger4);
    });
    this.ctx.flag('rangerAsked');
    await this.ctx.fade(() => this.enterStation());
    await this.stationIntro();
  }

  /* ---- The field station, for planning ---- */

  enterStation(): void {
    const { game: g, upgrades } = this.ctx;
    g.loadZone('station', upgrades());
    const s = g.zone.spots;
    g.placeTeam(s.spawn[0], s.spawn[1], 0.8);
    g.placeNpc('joy', s.community[0] + 1, s.community[1] + 1, 1.2);
    g.placeNpc('ernesto', s.garden[0] + 2, s.garden[1] + 2, -2);
    g.interactions = [
      {
        id: 'call',
        x: s.navie[0],
        z: s.navie[1],
        radius: 4,
        when: () => this.step() === 'call',
        by: anyHero({ label: 'Answer the call', hold: 0, run: () => this.takeCall() }),
      },
      {
        id: 'board',
        x: s.board[0],
        z: s.board[1],
        radius: 4,
        when: () => this.step() === 'plan',
        by: anyHero({ label: 'Open the Eco Dispatch board', hold: 0, run: () => this.ctx.openBoard() }),
      },
    ];
  }

  private async stationIntro(): Promise<void> {
    await this.scene(async () => {
      const g = this.ctx.game;
      const s = g.zone.spots;
      g.cameraTo([s.board[0] - 5, 4, s.board[1] - 7], [s.board[0] + 2, 2.2, s.board[1] + 2], 2);
      await this.ctx.hud.say('Navie', navieKey('hello'), LINES.station1);
    });
  }

  /* ---- Access ---- */

  private async clearLog(by: HeroId): Promise<void> {
    const { game: g } = this.ctx;
    this.logGoing = true;
    g.audio.play(by === 'baging' ? 'stretch' : 'ok');
    this.ctx.flag('logCleared');
    this.logRoll = 0;
    await this.line(by, by === 'baging' ? 'Baging' : 'Dayo', by === 'baging' ? LINES.logBaging : LINES.logDayo);
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
    const { game: g } = this.ctx;
    if (g.zoneId === 'forest' && this.step() === 'walk') {
      const h = g.heroes[g.active];
      const [x, z] = g.zone.spots.bank;
      if (Math.hypot(h.x - x, h.z - z) < 4.5) {
        this.ctx.flag('reachedBank');
      }
    }
    this.updateGuide();
    this.updateHum();
  }

  private updateHum(): void {
    const g = this.ctx.game;
    if (g.zoneId !== 'forest' || this.has('noiseOff')) {
      return;
    }
    const h = g.heroes[g.active];
    const [x, z] = g.zone.spots.generator;
    g.audio.setHum(clamp(1.2 - Math.hypot(h.x - x, h.z - z) / 60, 0.1, 1));
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
    switch (step.target) {
      case 'crates': {
        if (g.carrying.length > 0) {
          target = [s.tent[0] - 2, s.tent[1] + 3];
        } else if (!this.has('crossingOpen')) {
          target = s.crossing;
        } else {
          const left = (['kit', 'saplings'] as const).find((id) => !this.has(`${id}Delivered`));
          target = left === undefined ? s.tent : this.crateSpots[left];
        }
        break;
      }
      case 'signs':
        target = !this.has('signA') ? s.signA : s.signB;
        break;
      case 'stakes': {
        const next = (['A', 'B', 'C', 'D'] as const).find((k) => !this.has(`plant${k}`));
        target = next === undefined ? s.watch : s[`stake${next}`];
        break;
      }
      case 'generator':
        target = s.vines;
        break;
      case 'bird':
        target = s.bank;
        break;
      case 'tent':
        target = step.id === 'release' ? s.watch : [s.tent[0], s.tent[1] + 3];
        break;
      default:
        target = step.target === null ? null : s[step.target] ?? null;
        break;
    }
    g.guide = target;
  }

  private async openCrossing(how: 'vine' | 'rope'): Promise<void> {
    const { game: g, hud } = this.ctx;
    await this.scene(async () => {
      g.cameraTo([6, 4.2, -9], [0, 0.8, 0], 2.5);
      g.audio.play(how === 'vine' ? 'stretch' : 'whoosh');
      await this.ctx.wait(0.7);
      this.ctx.flag(how === 'vine' ? 'bridgeVine' : 'bridgeRope');
      this.ctx.flag('crossingOpen');
      g.audio.play('done');
      if (how === 'vine') {
        await hud.say('Baging', 'baging', LINES.bridgeVine);
      } else {
        await hud.say('Awit', 'awit', LINES.bridgeRope);
      }
    });
  }

  private pickUp(id: string): void {
    const g = this.ctx.game;
    g.carrying.push({ id, mesh: g.props[this.crateMesh[id]] });
    g.heroes[g.active].pose = 'carry';
    g.heroes[g.active].squash = 0.7;
    g.audio.play('pickup');
  }

  private drop(): void {
    const g = this.ctx.game;
    for (const c of g.carrying) {
      this.ctx.flag(`${c.id}Delivered`);
    }
    g.carrying = [];
    g.heroes[g.active].pose = 'none';
    g.heroes[g.active].squash = 0.7;
    g.audio.play('drop');
  }

  /* ---- The specialist's work ---- */

  private async assess(): Promise<void> {
    const { game: g, hud } = this.ctx;
    const vet = g.npcs.vet;
    await this.scene(async () => {
      this.faceAndFrame(vet);
      await hud.say('Dr. Mayumi', 'vet', LINES.assess1);
      await hud.say('Dr. Mayumi', 'vet', LINES.assess2);
    });
    await this.ctx.fade(() => {
      this.ctx.flag('assessed');
      g.birdVisible = false;
      g.keepOut = null;
    }, 1.1);
    await this.scene(async () => {
      this.faceAndFrame(vet);
      await hud.say('Dr. Mayumi', 'vet', LINES.assess3);
      await hud.say('Dr. Mayumi', 'vet', LINES.assess3b);
      await hud.say('Dr. Mayumi', 'vet', LINES.assess4);
      await hud.say('Ranger Ligaya', 'ranger', LINES.assess5);
    });
  }

  /* ---- The disturbance ---- */

  private async findNoise(by: 'sukat' | 'awit'): Promise<void> {
    const { game: g, hud } = this.ctx;
    const [x, z] = g.zone.spots.generator;
    const y = g.zone.height(x, z);
    g.audio.play('scan');
    await this.scene(async () => {
      g.cameraTo([x - 7, y + 7.5, z - 9], [x, y - 0.8, z], 3);
      await hud.say(by === 'sukat' ? 'Sukat' : 'Awit', by, by === 'sukat' ? LINES.noiseSukat : LINES.noiseAwit);
    });
    this.ctx.flag('noiseFound');
  }

  private async noiseOff(by: HeroId): Promise<void> {
    const { game: g, hud } = this.ctx;
    const h = g.heroes[g.active];
    const [x, z] = g.zone.spots.generator;
    const y = g.zone.height(x, z);
    await this.scene(async () => {
      g.cameraTo([x - 6, y + 6, z - 8], [x, y - 0.6, z], 3);
      if (by === 'dayo') {
        h.pose = 'climb';
      }
      g.audio.play(by === 'baging' ? 'stretch' : 'ok');
      await this.ctx.wait(0.9);
      h.pose = 'none';
      this.ctx.flag('noiseOff');
      g.audio.setHum(0);
      g.audio.play('done');
      await hud.say(by === 'baging' ? 'Baging' : 'Dayo', by, LINES.noiseQuiet);
      await hud.say('Sukat', 'sukat', LINES.noiseAfter);
    });
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

  /* ---- The homecoming ---- */

  private async release(): Promise<void> {
    const { game: g, hud } = this.ctx;
    const [wx, wz] = g.zone.spots.watch;
    const [nx, nz] = g.zone.spots.roost;
    const y0 = g.zone.height(wx, wz);
    const ny = g.zone.height(nx, nz);
    await this.ctx.fade(() => {
      g.birdVisible = true;
      g.birdState = { hurt: 0, flap: 0, alert: 0.3 };
      g.bird.x = wx - 3;
      g.bird.z = wz + 2.6;
      g.bird.y = y0 + 0.2;
      g.bird.yaw = Math.atan2(nx - g.bird.x, nz - g.bird.z);
      g.placeNpc('vet', wx - 1.4, wz + 0.6, -0.6);
      g.placeNpc('ranger', wx + 1.4, wz + 0.2, -1);
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
      await hud.say('Sukat', 'sukat', LINES.release3);
      hud.banner(null);
    });
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
