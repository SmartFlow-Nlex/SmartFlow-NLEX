import { HUB_LINES as H } from '../core/content';
import { decorationsFor, SIDE_QUESTS, sideQuestDone } from '../core/progression';
import type { SaveData } from '../core/save';
import type { Actor } from './anim';
import { angleTo, ease } from './gl/math';
import type { Agent } from './fauna';
import type { HeroAction, Interaction, Prop } from './game';
import { addExtras, anyHero, type MissionContext } from './missions/base';
import type { HeroId } from './models';
import { PATROL_RADIUS } from './world/zones';

/**
 * The Eco Command Center between missions: people going about their day, a patrol car
 * on its loop, short side quests, the trophies the team has earned, and decorations that
 * appear as missions are finished. Nothing here is timed, and nothing needs grinding.
 */

export type HubPlace = 'navie' | 'ops' | 'progress' | 'board' | 'atlas' | 'workshop' | 'gallery' | 'map' | 'feed' | 'notice';

export interface HubHooks {
  save: () => SaveData;
  /** A side quest step: saved, with its reward once the quest is done. */
  sideStep: (flag: string) => void;
  open: (place: HubPlace) => void;
}

interface Walker {
  id: string;
  path: readonly [number, number][];
  at: number;
  pause: number;
  talk: Interaction | null;
}

const TROPHIES: readonly { achievement: string; dx: number }[] = [
  { achievement: 'a-plaza', dx: -3.2 },
  { achievement: 'a-creek', dx: -1.6 },
  { achievement: 'a-solar', dx: 0 },
  { achievement: 'a-delivery', dx: 1.6 },
  { achievement: 'a-hornbill', dx: 3.2 },
];

const LITTER: readonly { n: number; mesh: string }[] = [
  { n: 1, mesh: 'can' },
  { n: 2, mesh: 'bottle' },
  { n: 3, mesh: 'jar' },
  { n: 4, mesh: 'can' },
];

/** Where the hidden fantail sings, for Find the Bird. */
const BIRD_BUSH: [number, number] = [-25, 13];

const PARKED: readonly { kind: 'truck' | 'pickup'; x: number; z: number; yaw: number }[] = [
  { kind: 'truck', x: -6.5, z: -33.5, yaw: 0.2 },
  { kind: 'pickup', x: 6.5, z: -33.5, yaw: -0.2 },
];

export class HubScript {
  private walkers: Walker[] = [];
  private patrol: Prop | null = null;
  private patrolA = 0;
  private anemometer: Prop | null = null;
  private extrasTick: ((dt: number) => void) | null = null;
  private t = 0;
  /** The butterflies of Butterfly Watch, and their buttons, which follow them. */
  private watch: { a: Agent; it: Interaction }[] = [];
  private bush: Prop | null = null;
  private song = 0;

  constructor(
    private readonly ctx: MissionContext,
    private readonly hooks: HubHooks,
  ) {}

  private flagOn(flag: string): boolean {
    return this.hooks.save().sideFlags.includes(flag);
  }

  private done(missionId: string): boolean {
    return this.hooks.save().missions[missionId] !== undefined;
  }

  private prop(mesh: string | Prop['mesh'], x: number, z: number, visible: () => boolean, opts: { y?: number; yaw?: number; scale?: number } = {}): Prop {
    const g = this.ctx.game;
    const p: Prop = { mesh: typeof mesh === 'string' ? g.props[mesh] : mesh, x, y: opts.y ?? g.zone.height(x, z), z, yaw: opts.yaw ?? 0, scale: opts.scale ?? 1, visible };
    g.worldProps.push(p);
    return p;
  }

  enter(): void {
    const g = this.ctx.game;
    const save = this.hooks.save();
    g.loadZone('station', save.upgrades);
    const s = g.zone.spots;
    g.carrying = [];
    g.placeTeam(s.spawn[0], s.spawn[1], 0.8);
    g.placeNpc('ranger', s.briefing[0] - 1, s.briefing[1] + 1.5, 3.1);
    g.placeNpc('vet', s.care[0] - 1, s.care[1] - 0.6, 0.6);
    const talk = (speaker: string, portrait: string, text: () => string) => (): void => {
      g.busy = true;
      void this.ctx.hud.say(speaker, portrait, text()).then(() => {
        g.busy = false;
        this.ctx.hud.setHudHidden(false);
      });
    };
    const all = (label: string, run: () => void): Partial<Record<HeroId, HeroAction>> => anyHero({ label, hold: 0, run });
    const open = (place: HubPlace) => (): void => this.hooks.open(place);
    const list: Interaction[] = [
      { id: 'navie', x: s.navie[0], z: s.navie[1], radius: 3.6, when: () => true, by: all('Talk to Navie', open('navie')) },
      { id: 'ops', x: s.ops[0], z: s.ops[1], radius: 3.8, when: () => true, by: all('NLEX Operations Board', open('ops')) },
      { id: 'progress', x: s.progress[0], z: s.progress[1], radius: 3.8, when: () => true, by: all('Environmental Progress', open('progress')) },
      { id: 'board', x: s.board[0], z: s.board[1], radius: 4, when: () => true, by: all('Eco Dispatch Station: past runs', open('board')) },
      { id: 'atlas', x: s.atlas[0], z: s.atlas[1], radius: 4, when: () => true, by: all('Open the Wildlife Atlas', open('atlas')) },
      { id: 'workshop', x: s.workshop[0], z: s.workshop[1], radius: 4, when: () => true, by: all('Eco Workshop', open('workshop')) },
      { id: 'gallery', x: s.gallery[0], z: s.gallery[1], radius: 3.4, when: () => true, by: all('Guardian Achievement Gallery', open('gallery')) },
      { id: 'tower', x: s.tower[0], z: s.tower[1], radius: 3.6, when: () => this.done('hornbill-homecoming'), by: all('Watch the habitat feed', open('feed')) },
      { id: 'map', x: s.map[0], z: s.map[1], radius: 3, when: () => true, by: all('World map', open('map')) },
      { id: 'notice', x: s.notice[0], z: s.notice[1], radius: 2.8, when: () => true, by: all('Notice board', open('notice')) },
      { id: 'care', x: s.care[0], z: s.care[1], radius: 3.6, when: () => true, by: all('Talk to Dr. Mayumi', talk('Dr. Mayumi', 'vet', () => H.vet)) },
      { id: 'briefing', x: s.briefing[0], z: s.briefing[1], radius: 3.6, when: () => true, by: all('Talk to Ranger Ligaya', talk('Ranger Ligaya', 'ranger', () => H.ranger)) },
    ];
    /* People going about their day. Their talk follows them. */
    this.walkers = [
      /* Routes kept clear of anything only one hero can do, so "Talk" is what the button offers. */
      { id: 'joy', path: [[-17, 4], [-9, 2.5], [-6, 1.5], [-9, 2.5]], at: 0, pause: 1, talk: null },
      { id: 'ernesto', path: [[-4.5, -18.8], [1.5, -18.6]], at: 0, pause: 2, talk: null },
      { id: 'tech', path: [[-12.5, -8.6], [-20.5, -8.2]], at: 0, pause: 0.5, talk: null },
    ];
    const lines: Record<string, [string, string, () => string]> = {
      joy: ['Ate Joy', 'joy', () => (this.done('nlex-river') ? H.joyAfterCreek : H.joy)],
      ernesto: ['Mang Ernesto', 'ernesto', () => (this.done('nlex-eco') ? H.ernestoAfterSolar : H.ernesto)],
      tech: ['Tech Rio', 'tech', () => (this.done('nlex-gridlock') ? H.techAfterPlaza : H.tech)],
    };
    for (const w of this.walkers) {
      const [x, z] = w.path[0];
      g.placeNpc(w.id, x, z, 0);
      const [name, portrait, text] = lines[w.id];
      w.talk = { id: `talk-${w.id}`, x, z, radius: 2.6, when: () => true, by: all(`Talk to ${name}`, talk(name, portrait, text)) };
      list.push(w.talk);
    }
    this.sideQuests(list);
    g.interactions = list;
    this.livingThings();
    this.extrasTick = addExtras(this.ctx, () => true, {
      /* Wildlife Spotter: three kinds photographed here, even ones already in the field notes. */
      wants: (kind) => !this.questDone('sq-spotter') && !this.flagOn(`spotted:${kind}`),
      onPhoto: (kind) => this.spotted(kind),
    }).tick;
    this.animalActivities();
  }

  private questDone(id: string): boolean {
    const q = SIDE_QUESTS.find((x) => x.id === id);
    return q !== undefined && sideQuestDone(this.hooks.save().sideFlags, q);
  }

  /* ---- Short animal activities ---- */

  private spotted(kind: string): void {
    if (this.questDone('sq-spotter') || this.flagOn(`spotted:${kind}`)) {
      return;
    }
    this.hooks.sideStep(`spotted:${kind}`);
    const n = this.hooks.save().sideFlags.filter((f) => f.startsWith('spotted:')).length;
    if (n <= 3) {
      this.hooks.sideStep(`spotter:${n}`);
      if (n < 3) {
        this.ctx.hud.notice(`Wildlife Spotter: ${n}/3`, 2);
      }
    }
  }

  private animalActivities(): void {
    const g = this.ctx.game;
    /* Butterfly Watch: each of the garden's three butterflies, watched once. */
    this.watch = [];
    g.fauna.agents
      .filter((a) => a.tag === 'watch')
      .forEach((a, i) => {
        const n = i + 1;
        const it: Interaction = {
          id: `bfly${n}`,
          x: a.x,
          z: a.z,
          radius: 5.5,
          when: () => !this.flagOn(`bfly:${n}`) && a.shown,
          by: anyHero({
            label: 'Watch the butterfly',
            hold: 0.6,
            run: () => {
              g.fauna.notice(a);
              g.burst('sparkle', a.x, a.y + 0.3, a.z, 6);
              g.audio.play('ok');
              this.ctx.discover('d-butterfly');
              this.hooks.sideStep(`bfly:${n}`);
              const seen = [1, 2, 3].filter((k) => this.flagOn(`bfly:${k}`)).length;
              if (seen < 3) {
                this.ctx.hud.notice(`Butterfly Watch: ${seen}/3`, 2);
              }
            },
          }),
        };
        g.interactions.push(it);
        this.watch.push({ a, it });
      });
    /* Find the Bird: a fantail hidden in a bush, found by its song. */
    const [bx, bz] = BIRD_BUSH;
    this.bush = this.prop('hideBush', bx, bz, () => true);
    g.fauna.spawn({ kind: 'fantail', n: 1, at: BIRD_BUSH, r: 2.2, when: () => this.flagOn('bird:found'), tag: 'hidden' });
    g.interactions.push({
      id: 'bush',
      x: bx,
      z: bz,
      radius: 3.4,
      when: () => !this.flagOn('bird:found'),
      by: anyHero({
        label: 'Look in the bush',
        hold: 0.5,
        run: () => {
          g.audio.play('chirp', 1);
          g.burst('leaf', bx, 1.2, bz, 12);
          this.hooks.sideStep('bird:found');
          this.ctx.discover('d-fantail');
          this.ctx.hud.notice(H.birdFound, 2.6);
        },
      }),
    });
    g.dynamicColliders = ((before) => () => [...before(), { x: bx, z: bz, r: 1 }])(g.dynamicColliders);
  }

  /* ---- Side quests ---- */

  private sideQuests(list: Interaction[]): void {
    const g = this.ctx.game;
    const s = g.zone.spots;
    /* Tidy up: four bits of litter, into the recycling bin. */
    for (const { n, mesh } of LITTER) {
      const [x, z] = s[`litter${n}`];
      const id = `litter${n}`;
      this.prop(mesh, x, z, () => !this.flagOn(`tidy:${n}`) && !g.carrying.some((c) => c.id === id), { yaw: n });
      list.push({
        id,
        x,
        z,
        radius: 2,
        when: () => !this.flagOn(`tidy:${n}`) && !g.carrying.some((c) => c.id === id) && (g.carrying.length === 0 || (g.active === 'baging' && g.carrying.length < 2)),
        by: anyHero({ label: 'Pick up the litter', hold: 0, run: () => this.pick(id, mesh) }),
      });
    }
    list.push({
      id: 'recycle',
      x: s.recycle[0],
      z: s.recycle[1],
      radius: 2.4,
      when: () => g.carrying.some((c) => c.id.startsWith('litter')),
      by: anyHero({ label: 'Put it in the recycling bin', hold: 0, run: () => this.binIt() }),
    });
    /* The weather station's wiring. */
    this.anemometer = this.prop('anemometer', -25, -8, () => true, { y: 4.3 });
    list.push({
      id: 'weather',
      x: s.weather[0],
      z: s.weather[1],
      radius: 2.8,
      when: () => !this.flagOn('weather:fixed'),
      by: anyHero({ label: 'Rewire the weather station', hold: 0, run: () => this.weather() }),
    });
    /* Three air-quality sensors for Sukat. */
    [1, 2, 3].forEach((n) => {
      const [x, z] = s[`sensor${n}`];
      const post = [[25.2, 8.8], [-11, -21.6], [9, 22.8]][n - 1];
      this.prop('airLightBad', post[0], post[1], () => !this.flagOn(`sensor:${n}`), { y: 1.75 });
      this.prop('airLightOk', post[0], post[1], () => this.flagOn(`sensor:${n}`), { y: 1.75 });
      list.push({
        id: `sensor${n}`,
        x,
        z,
        radius: 2.4,
        suggest: 'sukat',
        when: () => !this.flagOn(`sensor:${n}`),
        by: { sukat: { label: 'Check the air sensor', hold: 0.8, pose: 'scan', run: () => this.sensor(n, post as [number, number]) } },
      });
    });
  }

  private pick(id: string, mesh: string): void {
    const g = this.ctx.game;
    g.carrying.push({ id, mesh: g.props[mesh] });
    g.heroes[g.active].pose = 'carry';
    g.audio.play('pickup');
    if (!this.hooks.save().sideFlags.some((f) => f.startsWith('tidy:'))) {
      g.notice(H.tidyIntro);
    }
  }

  private binIt(): void {
    const g = this.ctx.game;
    const s = g.zone.spots;
    const mine = g.carrying.filter((c) => c.id.startsWith('litter'));
    g.carrying = g.carrying.filter((c) => !c.id.startsWith('litter'));
    g.heroes[g.active].pose = 'none';
    g.audio.play('drop');
    g.burst('sparkle', s.recycle[0], 1.6, s.recycle[1] - 1.8, 8);
    for (const c of mine) {
      this.hooks.sideStep(`tidy:${c.id.slice(6)}`);
    }
  }

  private async weather(): Promise<void> {
    const g = this.ctx.game;
    const ok = await this.ctx.circuit('weather', 'Weather station', H.weatherIntro, 'power');
    if (!ok) {
      return;
    }
    g.burst('spark', -25, 3.4, -8, 16);
    this.hooks.sideStep('weather:fixed');
    g.busy = true;
    await this.ctx.hud.say('Tech Rio', 'tech', H.weatherDone);
    g.busy = false;
    this.ctx.hud.setHudHidden(false);
  }

  private sensor(n: number, post: [number, number]): void {
    const g = this.ctx.game;
    g.audio.play('scan');
    g.burst('sparkle', post[0], 1.9, post[1], 6);
    this.hooks.sideStep(`sensor:${n}`);
  }

  /* ---- Trophies, decorations and the patrol ---- */

  private livingThings(): void {
    const g = this.ctx.game;
    const s = g.zone.spots;
    const save = this.hooks.save();
    const colliders: { x: number; z: number; r: number }[] = [];
    for (const t of TROPHIES) {
      const x = s.trophies[0] + t.dx;
      const z = s.trophies[1];
      this.prop('pedestal', x, z, () => true);
      this.prop('trophy', x, z, () => this.hooks.save().achievements.includes(t.achievement), { y: g.zone.height(x, z) + 0.9 });
      colliders.push({ x, z, r: 0.55 });
    }
    /* Each finished mission leaves something behind. */
    const decs = decorationsFor(Object.keys(save.missions));
    if (decs.includes('dec-plaza')) {
      this.prop('tollModel', s.decPlaza[0], s.decPlaza[1], () => true, { yaw: 2.6 });
      colliders.push({ x: s.decPlaza[0], z: s.decPlaza[1], r: 0.7 });
    }
    if (decs.includes('dec-creek')) {
      this.prop('creekDisplay', s.decCreek[0], s.decCreek[1], () => true, { yaw: Math.PI });
      colliders.push({ x: s.decCreek[0] - 1.2, z: s.decCreek[1], r: 0.7 }, { x: s.decCreek[0], z: s.decCreek[1], r: 0.7 }, { x: s.decCreek[0] + 1.6, z: s.decCreek[1], r: 0.7 });
    }
    if (decs.includes('dec-solar')) {
      for (const [x, z] of [[2.4, -10.5], [-2.4, -10.5], [2.4, -16], [-2.4, -16]] as [number, number][]) {
        this.prop('solarLamp', x, z, () => true, { yaw: x > 0 ? -Math.PI / 2 : Math.PI / 2 });
        colliders.push({ x, z, r: 0.3 });
      }
    }
    if (decs.includes('dec-delivery')) {
      const [x, z] = s.decVan;
      this.prop(g.vehicleMesh('van'), x, z, () => true, { yaw: Math.atan2(-z, x) });
      this.prop('seedlingRack', x - 2.6, z + 2.2, () => true, { yaw: 0.5 });
      colliders.push({ x, z, r: 1.4 }, { x: x + Math.sin(Math.atan2(-z, x)) * 1.6, z: z + Math.cos(Math.atan2(-z, x)) * 1.6, r: 1.2 }, { x: x - Math.sin(Math.atan2(-z, x)) * 1.6, z: z - Math.cos(Math.atan2(-z, x)) * 1.6, r: 1.2 });
    }
    if (decs.includes('dec-hornbill')) {
      this.prop('nestBox', s.decNest[0], s.decNest[1], () => true, { yaw: -2 });
      colliders.push({ x: s.decNest[0], z: s.decNest[1], r: 0.4 });
    }
    /* The heavy crate Dayo can lift, with a patch under it. */
    this.prop('itemDecoy', s.patch3[0], s.patch3[1] - 0.3, () => !save.collectibles.includes('p-center-crate') && !this.hooks.save().collectibles.includes('p-center-crate'), { scale: 1.3, yaw: 0.4 });
    this.prop('itemDecoy', s.patch3[0] + 1.1, s.patch3[1] - 1, () => this.hooks.save().collectibles.includes('p-center-crate'), { scale: 1.3, yaw: 1.1 });
    colliders.push({ x: s.patch3[0], z: s.patch3[1] - 0.3, r: 0.6 });
    for (const v of PARKED) {
      this.prop(g.vehicleMesh(v.kind), v.x, v.z, () => true, { yaw: v.yaw });
      colliders.push({ x: v.x - Math.sin(v.yaw) * 1.5, z: v.z - Math.cos(v.yaw) * 1.5, r: 1.3 }, { x: v.x + Math.sin(v.yaw) * 1.5, z: v.z + Math.cos(v.yaw) * 1.5, r: 1.3 });
    }
    this.patrol = this.prop(g.vehicleMesh('pickup'), 0, PATROL_RADIUS, () => true, { y: 0 });
    g.dynamicColliders = () => (this.patrol === null ? colliders : [...colliders, { x: this.patrol.x, z: this.patrol.z, r: 1.7 }]);
  }

  /* ---- Every frame ---- */

  tick(dt: number): void {
    const g = this.ctx.game;
    this.t += dt;
    const h = g.heroes[g.active];
    /* The patrol car: slows for anyone near its path, and stops for them. */
    if (this.patrol !== null) {
      const ahead = this.patrolA + 0.12;
      const ax = Math.sin(ahead) * PATROL_RADIUS;
      const az = Math.cos(ahead) * PATROL_RADIUS;
      const patrol = this.patrol;
      const blocked = Object.values(g.heroes).some((a) => Math.hypot(a.x - ax, a.z - az) < 4.2 || Math.hypot(a.x - patrol.x, a.z - patrol.z) < 3);
      if (!blocked && !g.busy) {
        this.patrolA += (dt * 4.2) / PATROL_RADIUS;
      }
      this.patrol.x = Math.sin(this.patrolA) * PATROL_RADIUS;
      this.patrol.z = Math.cos(this.patrolA) * PATROL_RADIUS;
      this.patrol.y = g.zone.height(this.patrol.x, this.patrol.z);
      this.patrol.yaw = this.patrolA + Math.PI / 2;
    }
    if (this.anemometer !== null && this.flagOn('weather:fixed')) {
      this.anemometer.yaw += dt * (this.ctx.reduceMotion() ? 1 : 4);
    }
    for (const w of this.walkers) {
      this.walk(g.npcs[w.id], w, dt);
    }
    this.extrasTick?.(dt);
    for (const { a, it } of this.watch) {
      it.x = a.x;
      it.z = a.z;
    }
    /* The hidden bird sings now and then: louder the closer the team is, and the bush rustles. */
    if (this.bush !== null && !this.flagOn('bird:found')) {
      this.song -= dt;
      const d = Math.hypot(h.x - BIRD_BUSH[0], h.z - BIRD_BUSH[1]);
      if (this.song <= 0) {
        this.song = 2.4 + Math.random();
        if (d < 34 && !g.busy) {
          g.audio.play('chirp', (1 - d / 34) ** 2);
        }
      }
      this.bush.scale = 1 + (this.song > 2.1 ? Math.sin(this.t * 40) * 0.04 : 0);
    } else if (this.bush !== null) {
      this.bush.scale = 1;
    }
    g.guide = null;
  }

  private walk(n: Actor, w: Walker, dt: number): void {
    const g = this.ctx.game;
    const h = g.heroes[g.active];
    const near = Math.hypot(h.x - n.x, h.z - n.z) < 2.2;
    if (w.talk !== null) {
      w.talk.x = n.x;
      w.talk.z = n.z;
    }
    /* Someone near, or a conversation going: stop and face them. */
    if (near || g.busy) {
      n.moveAmt += (0 - n.moveAmt) * ease(8, dt);
      if (near) {
        n.yaw += angleTo(n.yaw, Math.atan2(h.x - n.x, h.z - n.z)) * ease(6, dt);
      }
      return;
    }
    if (w.pause > 0) {
      w.pause -= dt;
      n.moveAmt += (0 - n.moveAmt) * ease(8, dt);
      return;
    }
    const [tx, tz] = w.path[(w.at + 1) % w.path.length];
    const dx = tx - n.x;
    const dz = tz - n.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) {
      w.at = (w.at + 1) % w.path.length;
      w.pause = 1.5 + ((w.at * 7) % 3);
      return;
    }
    const v = Math.min(d, 1.3 * dt);
    n.x += (dx / d) * v;
    n.z += (dz / d) * v;
    n.y = g.ground(n.x, n.z);
    n.yaw += angleTo(n.yaw, Math.atan2(dx, dz)) * ease(8, dt);
    n.moveAmt += (0.45 - n.moveAmt) * ease(6, dt);
  }
}
