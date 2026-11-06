import {
  FOES,
  KIKO_BACK,
  KIKO_FRONT,
  KIKO_GAP,
  KIKO_HALF_W,
  KIKO_LATERAL,
  KIKO_RESCUE_GAP,
  PICKUP_RADIUS,
  PLAYER_BACK,
  PLAYER_FRONT,
  PRESETS,
  PULSE_RANGE,
  PULSE_SPEED,
  SHIELD_TUNED_SECONDS,
  SPAWN_Z,
  DESPAWN_Z,
  X_LIMIT,
  type DifficultyPreset,
  type HazardKind,
  type PickupKind,
} from './config';
import {
  LANE_CHANGE,
  choosePattern,
  fairVariantOf,
  isFoeKind,
  isHazardKind,
  obstacleFor,
  specOf,
  type DirectorParams,
  type PlacementWorld,
} from './director';
import { MISSIONS, endlessCycle, missionLength, type GoalDef, type MissionDef, type SectionDef } from './missions';
import type { PatternTag, SignKind, Variant } from './patterns';
import type { Obstacle } from './reachability';
import { createRng, type Rng } from './rng';
import {
  DAMAGE_MULT_CAP,
  HERO_DEFS,
  MAGNET_CAP,
  POWERUP_DEFS,
  PROTECTION_CAP_S,
  REPAIR_CAP,
  RUN_UPGRADE_CAP,
  RUN_UPGRADE_IDS,
  WARNING_TEAM_CAP,
  heroBlockedFor,
  sidekickStats,
  type HeroDef,
  type RunUpgradeId,
  type SidekickStats,
} from './roster';
import type { ScenarioConfig } from './scenario';
import { endlessMood, missionMood, type Mood, type StretchMood, type Weather } from './moods';
import {
  ASSIST_INTERVAL_FLOOR,
  BONUS_BOLTS_CAP,
  CHAIN_GAP_S,
  CHAIN_LENGTH,
  GUST_PUSH,
  GUST_REDUCTION_CAP,
  hiddenShowZ,
  KAPE_RUN_CAP,
  NO_MODS,
  RAIN_STEER,
  RALLY_MULT_CAP,
  RECOVERY_BONUS_CAP,
  ROUGH_SPEED,
  ROUGH_STEER,
  SHIELD_EXTEND_CAP,
  WEATHER_TIME_CAP,
  activeSynergies,
  pulseInterval,
  runMods,
  signatureCooldown,
  type RunMods,
} from './tuning';
import { emptyTally, type FoeKind, type HeroId, type MissionId, type PowerUpKind, type RunResult, type Settings, type SidekickId, type Tally, type UpgradeId } from './types';

/**
 * The driving simulation. Fixed-step, deterministic for a seed and a sequence
 * of inputs, and free of any rendering or timing of its own: the page calls
 * `step(STEP, input)` from its loop and draws `state`.
 *
 * Tollbound Heroes (second brief): one hero (its own handling, automatic horn
 * pulses, a signature ability on the button) and two sidekicks that fly in
 * formation beside it and act on their own. Only the hero can be hit; the
 * sidekicks never collide with anything. Pulses and sidekick attacks affect
 * only Barrikada's bots and the machine's open gears - never traffic.
 */

export interface SimOptions {
  missionId: MissionId;
  seed: number;
  settings: Pick<Settings, 'difficulty' | 'gameSpeed' | 'warningBoost' | 'autoAbility'>;
  /** The run's team, fixed for the whole run. */
  loadout: { hero: HeroId; sidekicks: [SidekickId | null, SidekickId | null]; evolved: Partial<Record<SidekickId, boolean>> };
  upgrades: Partial<Record<UpgradeId, number>>;
  /** Skip the interactive tutorial (already done, or the player chose to). */
  skipTutorial: boolean;
  scenario: ScenarioConfig | null;
}

export interface SimInput {
  /** -1..1 held steering (keys); 0 = none. Ignored while `targetX` is set. */
  axis: number;
  /** Where the car should go (drag or lane buttons), or null. */
  targetX: number | null;
  /** True on the step the ability was pressed. */
  ability: boolean;
}

export const NO_INPUT: SimInput = { axis: 0, targetX: null, ability: false };

export interface HazardEntity {
  id: number;
  /** A road hazard, or one of Barrikada's bots (which have hit points). */
  kind: HazardKind | FoeKind;
  x: number;
  z: number;
  halfW: number;
  len: number;
  ownSpeed: number;
  thrown: number;
  /** Harmless from now on: it hit someone, the shield knocked it aside, or (a bot) it was zapped. */
  spent: boolean;
  /** Met while that car was protected: it can no longer hit that car (the other still can). */
  clearedHero: boolean;
  clearedKiko: boolean;
  /** Tutorial cones and bots: they bump, never dent. */
  practice: boolean;
  /** Seconds since it was knocked aside (or zapped), or -1. */
  knocked: number;
  knockDir: number;
  laneChange: { fromX: number; toX: number; signalAt: number | null; moveAt: number | null; done: boolean } | null;
  /** Bots: hit points left (0 for hazards). */
  hp: number;
  maxHp: number;
  /** Seconds since a pulse last hit it. */
  hurtT: number;
  /** Seconds a sidekick's jam keeps it from moving. */
  stun: number;
  /** Seconds of foam or jelly: it arrives later (bots and thrown things only). */
  slowT: number;
  /** Seconds of Kalaw's early mark over it. */
  marked: number;
  /** Already counted as passed, for the unlock totals. */
  counted: boolean;
}

export interface PickupEntity {
  id: number;
  kind: PickupKind;
  /** Power-up capsules only. */
  power: PowerUpKind | null;
  x: number;
  z: number;
  collected: boolean;
  /** Seconds since collected, for the pop animation; -1 before. */
  collectedT: number;
  /** A hidden stash: not drawn until close, or until someone reveals it. Driving over it still collects it. */
  hidden: boolean;
  revealed: boolean;
  /** Already counted as missed. */
  passed: boolean;
}

/** A stretch of road repairs. Drawn on the road; costs steering and speed while the car is on it. */
export interface RoughPatch {
  id: number;
  z: number;
  len: number;
}

export interface SignEntity {
  id: number;
  sign: SignKind;
  x: number;
  z: number;
  openX: number;
}

export interface GantryEntity {
  id: number;
  z: number;
  title: string;
  sub: string;
}

/** A horn pulse (the hero's) or a dart (Pip's). They fly ahead and stop at the first bot or gear they reach. */
export interface PulseEntity {
  id: number;
  x: number;
  z: number;
  big: boolean;
  damage: number;
  from: 'hero' | SidekickId;
  /** Darts steer toward this lateral position, at this sideways speed (set so they line up on arrival). */
  tx: number | null;
  lat: number;
  /** Units travelled (pulses stop at PULSE_RANGE). */
  travelled: number;
  /** A hero's own horn pulse. Echoes and beads are not: they advance no counter, so no loop can feed itself. */
  base: boolean;
}

/** Short-lived visual links: a chain zap, a jam ping, a repair spark, a guard block. */
export interface ZapEffect {
  id: number;
  kind: 'chain' | 'jam' | 'repair' | 'guard' | 'honk' | 'pierce' | 'slam' | 'sweep' | 'slow' | 'star' | 'lance' | 'foam' | 'reveal' | 'retrieve' | 'mend' | 'sip' | 'mark';
  slot: 0 | 1 | -1;
  x: number;
  z: number;
  t: number;
}

export interface Gear {
  x: number;
  state: 'closed' | 'telegraph' | 'open';
  t: number;
  /** Seconds left of the hit flash. */
  flash: number;
}

export interface BossState {
  phase: 1 | 2 | 3;
  stage: 'intro' | 'fight' | 'break' | 'honkReady' | 'honk' | 'down';
  t: number;
  /** 0-100: the machine's Jam meter. It counts DOWN; at 0 the plaza reopens. */
  jam: number;
  z: number;
  sway: number;
  gears: Gear[];
  cycleT: number;
  cycleLane: number;
  throwT: number;
  pending: { variant: Variant; release: number; lanes: number[]; openX: number | null } | null;
  pulseT: number;
  sparks: number;
  sparkT: number;
  /** Seconds since the last hit on the machine (animation). */
  hurtT: number;
  /** Lanes about to receive something (telegraph markers). */
  telegraph: number[];
  telegraphOpen: number | null;
  breakDropped: boolean;
  /** Gear hits so far (every third drops a Bolt). */
  hits: number;
  /** A checkpoint choice is offered once in each break. */
  breakChoiceDone: boolean;
}

/**
 * Kiko in the convoy (an escort, not a sidekick: he follows the hero's path
 * and can be hit). He drives `-z` behind the hero and steers for where the
 * hero was at his point on the road (`trail`, sampled by distance), at his own
 * slower steering speed.
 */
export interface KikoState {
  x: number;
  vx: number;
  /** The hero's path at Kiko's distance: where he is steering for. */
  targetX: number;
  /** Centre, relative to the hero's front bumper (negative: behind). */
  z: number;
  engine: number;
  maxEngine: number | null;
  invulnerable: number;
  wobble: number;
  /** Seconds since he was last hit (the sputter animation). */
  hitT: number;
  /** 0-1: how far he is off the hero's path (too sharp a swerve). */
  strain: number;
  trail: { d: number; x: number }[];
}

export type RescuePhase = 'slowing' | 'align' | 'push' | 'resume';

export interface RescueState {
  phase: RescuePhase;
  t: number;
  /** 0-1 of the gentle push. */
  progress: number;
  aligned: boolean;
}

export type TutorialStep = 'steer' | 'bolts' | 'cones' | 'pulse' | 'wrench' | 'go';
export const TUTORIAL_STEPS: readonly TutorialStep[] = ['steer', 'bolts', 'cones', 'pulse', 'wrench', 'go'];

export interface TutorialState {
  step: TutorialStep;
  t: number;
  sawLeft: boolean;
  sawRight: boolean;
  bolts: number;
  spawned: boolean;
  /** Cones bumped during practice (no dents). */
  bumps: number;
  retries: number;
  /** Practice bots zapped. */
  zapped: number;
}

/** A sidekick in the formation. */
export interface SidekickState {
  id: SidekickId;
  slot: 0 | 1;
  evolved: boolean;
  stats: SidekickStats;
  /** Seconds until it can act again. */
  cooldown: number;
  /** 0-1 flash of its last action (drawn on the sidekick). */
  action: number;
  /** Uses so far this run (repairs). */
  uses: number;
  /** Bantay: holding a guard charge. */
  charged: boolean;
  /** Where it flies (formation beside the hero; never collides). */
  x: number;
  z: number;
  /** Seconds since it last reacted (a bark or a hop). */
  reactT: number;
  /** What its face shows. */
  mood: 'idle' | 'happy' | 'determined' | 'worried' | 'celebrate';
}

export interface GoalState extends GoalDef {
  progress: number;
  done: boolean;
  failed: boolean;
}

export type SimEvent =
  | { type: 'hit'; who: 'hero' | 'kiko'; kind: HazardKind | FoeKind; dents: number }
  | { type: 'practiceBump' }
  | { type: 'pickup'; kind: PickupKind; power: PowerUpKind | null }
  | { type: 'signature'; hero: HeroId }
  | { type: 'shieldBlock' }
  | { type: 'repair'; by: SidekickId | 'wrench' | 'hero' }
  | { type: 'abilityUnavailable'; reason: 'cooldown' | 'active' | 'none' }
  | { type: 'abilityReady' }
  | { type: 'laneSignal' }
  | { type: 'kikoStrain' }
  | { type: 'kikoAlongside' }
  | { type: 'kikoFixed' }
  | { type: 'section'; kind: SectionDef['kind']; index: number }
  | { type: 'tutorialStep'; step: TutorialStep }
  | { type: 'rescue'; phase: RescuePhase }
  | { type: 'bossStage'; phase: 1 | 2 | 3; stage: BossState['stage'] }
  | { type: 'gearOpen' }
  | { type: 'gearHit'; x: number; by: 'hero' | SidekickId; jam: number }
  | { type: 'clank' }
  | { type: 'spark'; count: number }
  | { type: 'teamHonk' }
  | { type: 'foeHit'; x: number; z: number; by: 'hero' | SidekickId }
  | { type: 'foeDown'; x: number; z: number; kind: FoeKind; by: 'hero' | SidekickId; streak: number }
  | { type: 'sidekick'; id: SidekickId; slot: 0 | 1; action: 'shot' | 'chain' | 'jam' | 'repair' | 'guard' | 'charged' | 'pierce' | 'slam' | 'sweep' | 'slow' | 'reveal' | 'sendoff' | 'sip' | 'wade' | 'alert' | 'coins' | 'retrieve' | 'mend' | 'buffer' }
  | { type: 'chain'; total: number }
  | { type: 'chainBroken' }
  | { type: 'weather'; kind: Weather; phase: 'warn' | 'active' | 'calm' }
  | { type: 'rough'; on: boolean }
  | { type: 'reroll' }
  | { type: 'stashShown'; x: number; z: number }
  | { type: 'power'; kind: PowerUpKind; seconds: number }
  | { type: 'powerEnd'; kind: PowerUpKind }
  | { type: 'checkpoint'; options: RunUpgradeId[] }
  | { type: 'runUpgrade'; id: RunUpgradeId }
  | { type: 'goal'; text: string }
  | { type: 'goalDone'; text: string }
  | { type: 'gantry'; title: string }
  | { type: 'progress'; mark: number }
  | { type: 'fallback' }
  | { type: 'ending'; outcome: 'success' | 'failure'; reason: 'arrived' | 'defeated' | 'dents' | 'kiko' | 'banked' }
  | { type: 'finished'; outcome: 'success' | 'failure' };

export interface PlayerState {
  x: number;
  vx: number;
  targetX: number;
  dents: number;
  maxDents: number | null;
  invulnerable: number;
  /** Seconds of protection left (Kuya's Shield, a Bubble): hazards bounce off. Never more than PROTECTION_CAP_S. */
  shield: number;
  shieldMax: number;
  /** Seconds the signature ability is still running, its length, and its recharge. */
  signature: number;
  signatureMax: number;
  cooldown: number;
  cooldownMax: number;
  /** Seconds since the last hit (animation). */
  hitT: number;
}

export interface SimState {
  mission: MissionDef;
  preset: DifficultyPreset;
  seed: number;
  time: number;
  distance: number;
  /** Distance along the route, excluding the tutorial. */
  route: number;
  routeLength: number;
  speed: number;
  baseSpeed: number;
  sectionIndex: number;
  hero: HeroDef;
  player: PlayerState;
  sidekicks: SidekickState[];
  hazards: HazardEntity[];
  pickups: PickupEntity[];
  signs: SignEntity[];
  gantries: GantryEntity[];
  pulses: PulseEntity[];
  zaps: ZapEffect[];
  kiko: KikoState | null;
  rescue: RescueState | null;
  boss: BossState | null;
  tutorial: TutorialState | null;
  /** Navie's Route Sense: seconds of slowed road left, and the lane it points to. */
  slowmo: number;
  routeHint: number | null;
  /** Kiko's Gear Scan: seconds left. */
  scan: number;
  /** Active power-ups: seconds left of each. */
  powers: Partial<Record<PowerUpKind, { left: number; total: number }>>;
  runUpgrades: RunUpgradeId[];
  /** A checkpoint is open: the game is frozen until one is chosen. */
  choice: { options: RunUpgradeId[]; canBank: boolean } | null;
  goal: GoalState | null;
  goalsDone: number;
  /** Seconds of announcement before hazards come into view. */
  warningLead: number;
  /** 0-1: how busy the next 1.6 s are (radio stays quiet when high). */
  danger: number;
  boltsCollected: number;
  foesDefeated: number;
  /** Bots zapped in a row without being hit (for reactions). */
  streak: number;
  /** How this stretch looks and behaves. */
  mood: Mood;
  dim: boolean;
  weather: { kind: Weather; phase: 'calm' | 'warn' | 'active'; t: number; dir: number };
  rough: RoughPatch[];
  onRough: boolean;
  /** Bolts in a row right now, and the seconds since the last one. */
  chain: { count: number; t: number; total: number };
  /** Ligaya's rhythm meter (0-3). Kidlat's stored charge (0-10). */
  rhythm: number;
  charge: number;
  /** Seconds left: Load Brace, Windstep, Sinta's steady hands, Case Finder, Echo Trick. */
  brace: number;
  windstep: number;
  /** Simoy's Breeze Sense is what is slowing the road: the same slow, with no lane arrow. */
  breeze: number;
  steady: number;
  caseFinder: number;
  echo: number;
  /** Sinta: a repair waits for the next checkpoint; `repairSpent` once it has been used this run. */
  repairBooked: boolean;
  repairSpent: boolean;
  /** Where the postcard lies when someone can see it from afar. */
  postcardMark: { lane: number; dist: number } | null;
  /** Bolts passed without being picked up (Saranggola goes back for one). */
  missedBolts: number;
  /** Duwi's reshuffles left. */
  rerollsLeft: number;
  /** What this run adds to the unlock totals. */
  tally: Tally;
  shieldBlocks: number;
  repairsUsed: number;
  postcardFound: boolean;
  teamHonk: boolean;
  fallbacks: number;
  /** `route`: whole metres when the run ended (banked Endless runs keep rolling, the score does not). */
  ending: { outcome: 'success' | 'failure'; t: number; reason: string; route: number } | null;
  outcome: 'success' | 'failure' | null;
}

const GATE_MARGIN = 6;
const RESCUE_SLOW_S = 2.4;
const RESCUE_HOLD_S = 2.2;
const RESCUE_PUSH_S = 1.4;
const RESCUE_RESUME_S = 2.6;
/** Kiko's protection after a hit, and the off-path distance that counts as strain. */
const KIKO_INVULNERABLE = 1.6;
const KIKO_STRAIN_AT = 0.3;
const GEAR_HIT_HALF = 0.42;
/** The machine stands closer than before (was 33): its gears read larger. */
const BOSS_Z = 25;
/** Tutorial items appear nearer than the spawn line: the practice road is slow. */
const TUTORIAL_Z = 48;
/** Bounds on live entities and effects. */
const MAX_PULSES = 40;
const MAX_ZAPS = 16;
/** Sidekick formation: beside and a little behind the hero, kept on the road. */
const FORMATION_X = 0.68;
const FORMATION_Z = -0.45;
const POWER_ROTATION: PowerUpKind[] = ['spread', 'magnet', 'bubble', 'rally'];
/** Route Sense slows the road to this share. */
const SLOWMO_SHARE = 0.6;
/** What Walis can sweep away. */
const SWEEPABLE: ReadonlySet<string> = new Set(['cone', 'rollingCone', 'barrier', 'sweepBarrier']);
/** Team Honk fires by itself if the button is not pressed in this long (no soft-lock). */
/** Team Honk fires by itself after this long (never a soft-lock), but late enough to be the player's moment. */
const HONK_AUTO_S = 15;

export class DrivingSim {
  readonly state: SimState;
  private readonly rng: Rng;
  private readonly options: SimOptions;
  private readonly params: DirectorParams;
  private lateral: number;
  private nextId = 1;
  private events: SimEvent[] = [];
  private nextAt = 0;
  /** A checkpoint section waits for a clear road before it opens. */
  private checkpointWait = 0;
  private checkpointOpened = true;
  private routeOrigin = 0;
  private lastWrenchAt = -100;
  private lastPartAt = -100;
  private postcardPlaced = false;
  private gantriesPlaced = 0;
  private progressMarks = new Set<number>();
  private abilityWasReady = true;
  private lastHitAt = -100;
  private strainAnnounced = false;
  private alongsideAnnounced = false;
  /** The lane Kiko pulls up in at the arrival; kept while the hero stays clear of it. */
  private arriveLane: number | null = null;
  private arriveStarted = false;
  private sectionStarts: number[] = [];
  private keyHeldLast = false;
  private pulseT = 0;
  private powerCount = 0;
  private endlessCycles = 0;
  /** What the run's upgrades add up to (core/tuning.ts: the same numbers the checkpoint cards show). */
  private mods: RunMods = NO_MODS;
  private baseLateral = 0;
  /** Barya's Bolts, before any upgrade. */
  private boltBase = 1;
  /** Tala: how fast the signature recharges. */
  private signatureChargeMult = 1;
  private routeHintT = 0;
  /** Weather, repairs and stashes roll on their own stream: the hazards' road stays what it always was for a seed. */
  private readonly extras: Rng;
  private moodNow: StretchMood = missionMood('m1-garage');
  private nextRough = 0;
  private nextStash = 0;
  private stretchHits = 0;
  /** Ligaya's Rally Beat: multiplies the next assist. */
  private rallyNext = 1;
  private kapeTotal = 0;
  private bonusBolts = 0;
  /** Kislap: seconds its glimmer still draws Bolts in. Ginto: Bolts paid this run. */
  private glimmerT = 0;
  private gintoBolts = 0;
  private bufferUsed = false;
  private beadCount = 0;
  private echoes: { t: number; x: number; damage: number }[] = [];
  private readonly synergy = new Set<string>();

  constructor(options: SimOptions) {
    this.options = options;
    this.rng = createRng(options.seed);
    const base = MISSIONS[options.missionId];
    // Endless grows its own copy of the section list as it goes.
    const mission: MissionDef = base.kind === 'endless' ? { ...base, sections: [...base.sections] } : base;
    const preset = PRESETS[options.settings.difficulty];
    const scenario = options.scenario;
    // A hero the story keeps out of this mission (Kiko in his own convoy) drives as Navie - enforced here too.
    const hero = HERO_DEFS[heroBlockedFor(options.loadout.hero, options.missionId) === null ? options.loadout.hero : 'navie'];
    const steeringLevel = options.upgrades.steering ?? 0;
    this.extras = createRng((options.seed ^ 0x5bd1e995) >>> 0);
    this.baseLateral = preset.lateral * hero.steer * (1 + 0.08 * steeringLevel);
    this.lateral = this.baseLateral;
    this.moodNow = missionMood(options.missionId);
    for (const syn of activeSynergies(hero.id, options.loadout.sidekicks)) {
      this.synergy.add(syn.id);
    }
    const baseSpeed = preset.speed * (scenario?.speedScale ?? 1) * (mission.kind === 'finale' ? 0.82 : 1);
    // Story never fails - except Endless, which needs an end: five dents there.
    const presetDents = preset.maxDents === null && mission.kind === 'endless' ? 5 : preset.maxDents;
    // A frail hero still has room for one mistake.
    const maxDents = presetDents === null ? null : Math.max(2, presetDents + (options.upgrades.bumper ?? 0) + hero.extraDents);
    const sidekicks: SidekickState[] = [];
    options.loadout.sidekicks.forEach((id, slot) => {
      if (id === null || sidekicks.some((s) => s.id === id)) {
        return;
      }
      const evolved = options.loadout.evolved[id] === true;
      const stats = { ...sidekickStats(id, evolved) };
      if (id === 'kumpuni') {
        stats.count += options.upgrades.spareKit ?? 0;
      }
      sidekicks.push({
        id,
        slot: slot as 0 | 1,
        evolved,
        stats,
        // Ready to act shortly after the start (Bantay starts charged).
        cooldown: id === 'bantay' ? 0 : Math.min(0.6, stats.cooldown),
        action: 0,
        uses: 0,
        charged: id === 'bantay',
        x: (slot === 0 ? -1 : 1) * FORMATION_X,
        z: FORMATION_Z,
        reactT: 99,
        mood: 'idle',
      });
    });
    const silip = sidekicks.find((s) => s.id === 'silip');
    this.boltBase += sidekicks.find((s) => s.id === 'barya')?.stats.power ?? 0;
    this.signatureChargeMult += sidekicks.find((s) => s.id === 'tala')?.stats.power ?? 0;
    const radyo = sidekicks.find((s) => s.id === 'radyo');
    const teamWarning = Math.min(WARNING_TEAM_CAP, hero.warning + (silip?.stats.power ?? 0) + (radyo?.stats.power ?? 0));
    const signatureSeconds = hero.id === 'jepoy' && (options.upgrades.shieldTuning ?? 0) > 0 ? SHIELD_TUNED_SECONDS : hero.signature.seconds;

    this.params = {
      // The fairness check counts simulation seconds. At a slower game speed
      // one real second is only `gameSpeed` simulation seconds, so the same
      // real reaction time needs less simulation time.
      reaction: preset.reaction * options.settings.gameSpeed,
      lateral: this.fairLateral(hero.id),
      laneChanges: preset.laneChanges,
      hitHalfW: hero.hitHalfW,
    };

    // Section starts along the route (tutorial, rescue and checkpoints take no route distance).
    let at = 0;
    for (const section of mission.sections) {
      this.sectionStarts.push(at);
      if (section.kind === 'patterns' || section.kind === 'arrive') {
        at += section.length;
      }
    }

    const hasTutorial = mission.sections[0]?.kind === 'tutorial' && !options.skipTutorial;
    this.state = {
      mission,
      preset,
      seed: options.seed,
      time: 0,
      distance: 0,
      route: 0,
      routeLength: missionLength(mission),
      speed: baseSpeed * (hasTutorial ? 0.55 : 0.9),
      baseSpeed,
      sectionIndex: 0,
      hero,
      player: {
        x: 0,
        vx: 0,
        targetX: 0,
        dents: 0,
        maxDents,
        invulnerable: 0,
        shield: 0,
        shieldMax: Math.min(PROTECTION_CAP_S, signatureSeconds),
        signature: 0,
        signatureMax: signatureSeconds,
        cooldown: 0,
        cooldownMax: hero.signature.cooldown * preset.cooldown,
        hitT: 99,
      },
      sidekicks,
      hazards: [],
      pickups: [],
      signs: [],
      gantries: [],
      pulses: [],
      zaps: [],
      kiko:
        mission.kind === 'convoy'
          ? {
              x: 0,
              vx: 0,
              targetX: 0,
              z: -KIKO_GAP,
              engine: preset.kikoEngine ?? 3,
              maxEngine: preset.kikoEngine,
              invulnerable: 0,
              wobble: 0,
              hitT: 99,
              strain: 0,
              trail: [
                { d: -KIKO_GAP * 3, x: 0 },
                { d: 0, x: 0 },
              ],
            }
          : null,
      rescue: null,
      boss: null,
      tutorial: null,
      slowmo: 0,
      routeHint: null,
      scan: 0,
      powers: {},
      runUpgrades: [],
      choice: null,
      goal: null,
      goalsDone: 0,
      warningLead: preset.warning + options.settings.warningBoost + teamWarning,
      danger: 0,
      boltsCollected: 0,
      foesDefeated: 0,
      streak: 0,
      mood: this.moodNow.mood,
      dim: this.moodNow.dim,
      weather: { kind: this.moodNow.weather, phase: 'calm', t: 10 + this.extras.next() * 8, dir: 1 },
      rough: [],
      onRough: false,
      chain: { count: 0, t: 0, total: 0 },
      rhythm: 0,
      charge: 0,
      brace: 0,
      windstep: 0,
      breeze: 0,
      steady: 0,
      caseFinder: 0,
      echo: 0,
      repairBooked: false,
      repairSpent: false,
      postcardMark: null,
      missedBolts: 0,
      rerollsLeft: sidekicks.find((k) => k.id === 'duwi')?.stats.count ?? 0,
      tally: emptyTally(),
      shieldBlocks: 0,
      repairsUsed: 0,
      postcardFound: false,
      teamHonk: false,
      fallbacks: 0,
      ending: null,
      outcome: null,
    };
    this.nextRough = 90 + this.extras.next() * 60;
    this.nextStash = 120 + this.extras.next() * 80;
    this.enterSection(hasTutorial ? 0 : this.firstNonTutorial());
  }

  /** The worst steering this stretch can ask for: the fairness check plans with it, so weather never makes a pattern impossible. */
  private fairLateral(hero: HeroId): number {
    const rough = this.moodNow.rough ? (hero === 'berto' ? 1 - (1 - ROUGH_STEER) / 2 : ROUGH_STEER) : 1;
    const rain = this.moodNow.weather === 'rain' ? RAIN_STEER : 1;
    const gust = this.moodNow.weather === 'gust' ? GUST_PUSH * this.gustFactor(hero) : 0;
    return Math.max(0.5, this.lateral * rough * rain - gust);
  }

  /** How much of a gust reaches this hero. */
  private gustFactor(hero: HeroId): number {
    let reduction = hero === 'amihan' ? 0.34 : 0;
    if (this.state?.windstep > 0) {
      reduction += 0.6;
    }
    if (this.synergy.has('fairWeather')) {
      reduction += 0.15;
    }
    return 1 - Math.min(GUST_REDUCTION_CAP, reduction);
  }

  /** Steering right now: upgrades, road, weather and whatever the hero is doing. */
  private steerNow(): number {
    const s = this.state;
    let k = 1;
    if (s.onRough && s.brace <= 0) {
      k *= s.hero.id === 'berto' ? 1 - (1 - ROUGH_STEER) / 2 : ROUGH_STEER;
    }
    if (s.weather.kind === 'rain' && s.weather.phase === 'active') {
      k *= RAIN_STEER;
    }
    if (s.windstep > 0) {
      k *= 1.25;
    }
    if (s.steady > 0) {
      k *= 1.15;
    }
    return this.lateral * k;
  }

  /** Events since the last call (hits, pick-ups, story triggers). */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private emit(event: SimEvent): void {
    this.events.push(event);
  }

  private firstNonTutorial(): number {
    return this.state.mission.sections[0]?.kind === 'tutorial' ? 1 : 0;
  }

  private get section(): SectionDef | undefined {
    return this.state.mission.sections[this.state.sectionIndex];
  }

  // -- the step ---------------------------------------------------------------

  step(dt: number, input: SimInput): void {
    const s = this.state;
    if (s.outcome !== null || s.choice !== null) {
      // Finished, or frozen at a checkpoint while the player chooses.
      return;
    }
    s.time += dt;
    // Route Sense slows the world, not the hero's steering.
    const wdt = s.slowmo > 0 ? dt * SLOWMO_SHARE : dt;

    // Speed eases toward what the section wants.
    const target = this.targetSpeed();
    const rate = target < s.speed ? 7 : 5;
    s.speed += Math.max(-rate * wdt, Math.min(rate * wdt, target - s.speed));
    s.speed = Math.max(0, s.speed);
    const travel = s.speed * wdt;
    s.distance += travel;
    s.tally.metres += travel;
    if (this.section?.kind !== 'tutorial') {
      s.route = s.distance - this.routeOrigin;
    }

    this.moveEntities(wdt, travel);
    this.updateRoad(dt, travel);
    this.steer(dt, input);
    this.abilities(dt, input);
    this.updatePowers(dt);
    if (s.kiko !== null) {
      this.updateKiko(dt);
    }
    this.updateSidekicks(dt, wdt);
    this.firePulses(wdt);
    this.movePulses(wdt);
    this.collide();
    this.collectPickups(dt);
    this.sectionLogic(wdt);
    this.recycle();
    this.measureDanger();

    if (s.ending !== null) {
      s.ending.t -= dt;
      if (s.ending.t <= 0) {
        s.outcome = s.ending.outcome;
        this.emit({ type: 'finished', outcome: s.outcome });
      }
    }
  }

  private targetSpeed(): number {
    const base = this.targetSpeedRaw();
    const s = this.state;
    if (s.onRough && s.brace <= 0) {
      return base * (s.hero.id === 'berto' ? 1 - (1 - ROUGH_SPEED) / 2 : ROUGH_SPEED);
    }
    return base;
  }

  /** Weather, road repairs, hidden stashes and the chain clock. */
  private updateRoad(dt: number, travel: number): void {
    const s = this.state;
    const driving = this.section?.kind === 'patterns' && s.ending === null;
    // The weather's little cycle: calm, a warning you can see, a few seconds of it.
    const w = s.weather;
    if (w.kind !== 'none' && (driving || w.phase !== 'calm')) {
      w.t -= dt;
      if (w.t <= 0) {
        if (w.phase === 'calm') {
          w.phase = 'warn';
          w.t = 1.6;
          w.dir = this.extras.next() < 0.5 ? -1 : 1;
          this.emit({ type: 'weather', kind: w.kind, phase: 'warn' });
        } else if (w.phase === 'warn') {
          w.phase = 'active';
          const ulap = s.sidekicks.find((k) => k.id === 'ulap')?.stats.power ?? 0;
          w.t = (w.kind === 'gust' ? 4.5 : 9) * (1 - Math.min(WEATHER_TIME_CAP, ulap));
          this.emit({ type: 'weather', kind: w.kind, phase: 'active' });
        } else {
          w.phase = 'calm';
          w.t = 14 + this.extras.next() * 10;
          this.emit({ type: 'weather', kind: w.kind, phase: 'calm' });
        }
      }
    }
    if (w.kind === 'gust' && w.phase === 'active') {
      const easy = s.preset.id === 'story' ? 0.6 : 1;
      s.player.x = Math.max(-X_LIMIT, Math.min(X_LIMIT, s.player.x + w.dir * GUST_PUSH * this.gustFactor(s.hero.id) * easy * dt));
    }
    // Road repairs.
    for (const r of s.rough) {
      r.z -= travel;
    }
    s.rough = s.rough.filter((r) => r.z + r.len > DESPAWN_Z);
    if (driving && this.moodNow.rough && s.route >= this.nextRough) {
      const len = 16 + this.extras.next() * 10;
      s.rough.push({ id: this.nextId++, z: SPAWN_Z, len });
      this.nextRough = s.route + len + 110 + this.extras.next() * 110;
    }
    const on = s.rough.some((r) => r.z < PLAYER_FRONT && r.z + r.len > PLAYER_BACK);
    if (on !== s.onRough) {
      s.onRough = on;
      this.emit({ type: 'rough', on });
    }
    // Hidden stashes: three Bolts in a lane with nothing near them. Anyone can stumble on one.
    if (driving && s.tutorial === null && s.route >= this.nextStash) {
      this.nextStash = s.route + 170 + this.extras.next() * 110;
      const free = [-1, 0, 1].filter((lane) => !s.hazards.some((h) => !h.spent && Math.abs(h.x - lane) < h.halfW + 0.3 && h.z > SPAWN_Z - 8 && h.z < SPAWN_Z + 10));
      if (free.length > 0) {
        const lane = free[Math.floor(this.extras.next() * free.length)];
        for (let i = 0; i < 3; i += 1) {
          s.pickups.push({ id: this.nextId++, kind: 'bolt', power: null, x: lane, z: SPAWN_Z + i * 1.8, collected: false, collectedT: -1, hidden: true, revealed: false, passed: false });
        }
      }
    }
    // Who can see a postcard from afar.
    const card = s.mission.postcard;
    const tarsi = s.sidekicks.find((k) => k.id === 'tarsi');
    const range = Math.max(tarsi?.stats.range ?? 0, s.caseFinder > 0 ? 160 : 0);
    s.postcardMark = card !== null && !s.postcardFound && range > 0 && s.boss === null && card.at > s.route && card.at - s.route < range ? { lane: card.lane, dist: card.at - s.route } : null;
    // A pick-up chain ends when the Bolts stop coming.
    const c = s.chain;
    c.t += dt;
    const gap = CHAIN_GAP_S + (this.synergy.has('tempo') ? 0.4 : 0);
    if (c.count > 0 && c.t > gap) {
      c.count = 0;
      if (s.hero.id === 'ligaya' && s.rhythm > 0) {
        s.rhythm -= 1;
      }
      this.emit({ type: 'chainBroken' });
    }
    // Echoes come a moment after their pulse.
    if (this.echoes.length > 0) {
      for (const e of this.echoes) {
        e.t -= dt;
        if (e.t <= 0 && s.ending === null) {
          this.addPulse({ x: e.x, z: PLAYER_FRONT, damage: e.damage, from: 'hero', tx: null });
        }
      }
      this.echoes = this.echoes.filter((e) => e.t > 0);
    }
  }

  /** How far ahead a hidden stash shows by itself for this team. */
  hiddenShowZ(): number {
    return hiddenShowZ(this.state.hero.id, this.state.sidekicks.map((k) => k.id));
  }

  private targetSpeedRaw(): number {
    const s = this.state;
    const section = this.section;
    if (s.ending?.outcome === 'failure') {
      return s.baseSpeed * 0.35;
    }
    if (section === undefined) {
      return s.baseSpeed * 0.4;
    }
    switch (section.kind) {
      case 'tutorial':
        return s.tutorial?.step === 'go' ? s.baseSpeed : s.baseSpeed * 0.55;
      case 'rescue': {
        const phase = s.rescue?.phase;
        return phase === 'resume' ? s.baseSpeed : 0;
      }
      case 'arrive': {
        const end = this.sectionStarts[s.sectionIndex] + section.length;
        const left = end - s.route;
        return left < 45 ? s.baseSpeed * (0.45 + 0.55 * Math.max(0, left / 45)) : s.baseSpeed;
      }
      case 'boss': {
        const stage = s.boss?.stage;
        if (stage === 'honk' || stage === 'honkReady') {
          return s.baseSpeed * 0.35;
        }
        if (stage === 'down') {
          return s.baseSpeed * 0.3;
        }
        return s.baseSpeed;
      }
      default:
        return s.baseSpeed;
    }
  }

  private moveEntities(dt: number, travel: number): void {
    const s = this.state;
    for (const h of s.hazards) {
      // A jam (Silip) only marks a bot for double damage: speed and lane changes stay exactly as the
      // director planned them, so no placement it checked can change afterwards.
      h.stun = Math.max(0, h.stun - dt);
      h.hurtT += dt;
      h.marked = Math.max(0, h.marked - dt);
      if (h.slowT > 0) {
        h.slowT = Math.max(0, h.slowT - dt);
      }
      if (s.rescue !== null && h.ownSpeed > 0 && h.z > PLAYER_FRONT) {
        // In the lay-by the convoy slows to a stop; traffic ahead keeps its own speed and drives away.
        h.z -= (s.speed - h.ownSpeed * s.baseSpeed) * dt;
      } else {
        // Foam and jelly make it arrive later, but it never gets pushed into what the director put behind it.
        const held = h.slowT > 0 && !h.spent && !s.hazards.some((o) => o !== h && !o.spent && o.slowT <= 0 && o.z > h.z && o.z < h.z + 7);
        h.z -= s.speed * (1 - h.ownSpeed + h.thrown) * (held ? 0.62 : 1) * dt;
      }
      if (!h.counted && h.z + h.len < PLAYER_BACK) {
        h.counted = true;
        if (!h.spent && !h.practice) {
          s.tally.hazardsAvoided += 1;
        }
      }
      if (h.knocked >= 0) {
        h.knocked += dt;
        // Small things fly to the shoulder; traffic that was bumped steers off toward it.
        h.x += h.knockDir * (h.ownSpeed > 0 && h.maxHp === 0 ? 1.3 : 2.6) * dt;
        if (h.ownSpeed > 0 && h.maxHp === 0) {
          h.x = Math.max(-1.95, Math.min(1.95, h.x));
        }
      }
      const lc = h.laneChange;
      if (lc !== null && !lc.done && !h.spent) {
        if (lc.signalAt === null && h.z <= LANE_CHANGE.signalZ) {
          lc.signalAt = s.time;
          this.emit({ type: 'laneSignal' });
        }
        if (lc.signalAt !== null && lc.moveAt === null && s.time - lc.signalAt >= LANE_CHANGE.signalSeconds) {
          lc.moveAt = s.time;
        }
        if (lc.moveAt !== null) {
          const k = Math.min(1, (s.time - lc.moveAt) / LANE_CHANGE.duration);
          const eased = k * k * (3 - 2 * k);
          h.x = lc.fromX + (lc.toX - lc.fromX) * eased;
          if (k >= 1) {
            lc.done = true;
          }
        }
      }
    }
    for (const p of s.pickups) {
      p.z -= travel;
      if (p.collectedT >= 0) {
        p.collectedT += dt;
      }
      if (!p.passed && !p.collected && p.z < PLAYER_BACK - 0.6) {
        p.passed = true;
        if (p.kind === 'bolt' && !p.hidden) {
          s.missedBolts += 1;
        }
      }
    }
    for (const sign of s.signs) {
      sign.z -= travel;
    }
    for (const g of s.gantries) {
      g.z -= travel;
    }
    for (const z of s.zaps) {
      z.t += dt;
    }
    s.zaps = s.zaps.filter((z) => z.t < 0.45);
  }

  private steer(dt: number, input: SimInput): void {
    const p = this.state.player;
    if (input.targetX !== null) {
      p.targetX = Math.max(-X_LIMIT, Math.min(X_LIMIT, input.targetX));
    } else if (input.axis !== 0) {
      p.targetX = Math.max(-X_LIMIT, Math.min(X_LIMIT, p.x + input.axis * 3));
    } else if (Math.abs(p.targetX - p.x) > 0.001 && this.keyHeldLast) {
      // Keys released: stop where the car is rather than drifting on.
      p.targetX = p.x;
    }
    this.keyHeldLast = input.targetX === null && input.axis !== 0;
    // One movement model for every control and every hero: seek the target at
    // up to the hero's steering speed, with a short acceleration.
    const lateral = this.steerNow();
    const desired = Math.max(-lateral, Math.min(lateral, (p.targetX - p.x) * 10));
    const accel = 38;
    p.vx += Math.max(-accel * dt, Math.min(accel * dt, desired - p.vx));
    p.x += p.vx * dt;
    if (p.x <= -X_LIMIT || p.x >= X_LIMIT) {
      p.x = Math.max(-X_LIMIT, Math.min(X_LIMIT, p.x));
      p.vx = 0;
    }
    p.hitT += dt;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
  }

  // -- the hero's signature ability ---------------------------------------------------

  /** True while the button would do something (the signature, or Team Honk when it is charged). */
  abilityReady(): boolean {
    const s = this.state;
    if (s.boss?.stage === 'honkReady') {
      return true;
    }
    if (s.boss?.stage === 'honk' || s.boss?.stage === 'down') {
      return false;
    }
    if (s.hero.id === 'kidlat' && s.charge < 3) {
      return false;
    }
    return s.player.cooldown <= 0 && s.player.signature <= 0;
  }

  /** What the button does right now, for the HUD. */
  abilityMode(): 'signature' | 'honk' {
    return this.state.boss?.stage === 'honkReady' ? 'honk' : 'signature';
  }

  private abilities(dt: number, input: SimInput): void {
    const s = this.state;
    const p = s.player;
    p.shield = Math.max(0, p.shield - dt);
    p.signature = Math.max(0, p.signature - dt);
    s.slowmo = Math.max(0, s.slowmo - dt);
    s.scan = Math.max(0, s.scan - dt);
    s.brace = Math.max(0, s.brace - dt);
    s.windstep = Math.max(0, s.windstep - dt);
    s.breeze = Math.max(0, s.breeze - dt);
    s.steady = Math.max(0, s.steady - dt);
    s.caseFinder = Math.max(0, s.caseFinder - dt);
    s.echo = Math.max(0, s.echo - dt);
    if (p.signature <= 0) {
      p.cooldown = Math.max(0, p.cooldown - dt * this.signatureChargeMult);
    }
    if (s.slowmo > 0 && s.breeze <= 0) {
      this.routeHintT -= dt;
      if (this.routeHintT <= 0) {
        this.routeHintT = 0.25;
        s.routeHint = this.clearestLane();
      }
    } else {
      s.routeHint = null;
    }
    let use = input.ability;
    if (!use && this.options.settings.autoAbility && s.ending === null) {
      use = this.autoWants();
    }
    if (use) {
      this.useAbility(input.ability);
    }
    const ready = this.abilityReady();
    if (ready && !this.abilityWasReady) {
      this.emit({ type: 'abilityReady' });
    }
    this.abilityWasReady = ready;
  }

  private useAbility(byPlayer: boolean): void {
    const s = this.state;
    const p = s.player;
    if (s.boss?.stage === 'honkReady') {
      this.startHonk();
      return;
    }
    // A late or repeated tap during the honk itself must not spend the signature.
    if (s.boss?.stage === 'honk' || s.boss?.stage === 'down') {
      return;
    }
    if (s.ending !== null || s.choice !== null) {
      return;
    }
    if (p.signature > 0 || p.cooldown > 0) {
      if (byPlayer) {
        this.emit({ type: 'abilityUnavailable', reason: p.signature > 0 ? 'active' : 'cooldown' });
      }
      return;
    }
    if (s.hero.id === 'kidlat' && s.charge < 3) {
      if (byPlayer) {
        this.emit({ type: 'abilityUnavailable', reason: 'none' });
      }
      return;
    }
    p.signature = p.signatureMax;
    p.cooldown = signatureCooldown(p.cooldownMax, this.mods);
    switch (s.hero.id) {
      case 'navie':
        s.slowmo = p.signatureMax;
        this.routeHintT = 0;
        break;
      case 'jepoy':
        this.protect(p.signatureMax);
        break;
      case 'kiko':
        s.scan = p.signatureMax;
        break;
      case 'berto':
        s.brace = p.signatureMax;
        break;
      case 'ligaya':
        this.rallyBeat();
        break;
      case 'hiraya':
        this.starSweep();
        break;
      case 'sinta':
        s.steady = p.signatureMax;
        if (!s.repairSpent) {
          s.repairBooked = true;
        }
        break;
      case 'amihan':
        s.windstep = p.signatureMax;
        break;
      case 'kidlat':
        this.capacitor();
        break;
      case 'nico':
        s.caseFinder = p.signatureMax;
        for (const item of s.pickups) {
          if (item.hidden) {
            item.revealed = true;
          }
        }
        break;
      case 'alon':
        for (const h of s.hazards) {
          if (this.wades(h) && h.z > 1) {
            h.slowT = Math.max(h.slowT, p.signatureMax);
            this.addZap('foam', -1, h.x, h.z);
          }
        }
        break;
      case 'tiko':
        s.echo = p.signatureMax;
        break;
      case 'ningning':
        this.signaturePower('spread', p.signatureMax);
        break;
      case 'simoy':
        s.slowmo = Math.max(s.slowmo, p.signatureMax);
        s.breeze = p.signatureMax;
        break;
      case 'sikat':
        this.signaturePower('bubble', p.signatureMax);
        break;
      case 'tali':
        this.signaturePower('rally', p.signatureMax);
        break;
    }
    this.emit({ type: 'signature', hero: s.hero.id });
  }

  /** Protection never stacks in time: the longer window wins, capped. Kawayan makes any shield a little longer. */
  private protect(seconds: number): void {
    const s = this.state;
    const p = s.player;
    const kawayan = s.sidekicks.find((k) => k.id === 'kawayan');
    const extra = kawayan === undefined ? 0 : Math.min(SHIELD_EXTEND_CAP, kawayan.stats.power + (this.synergy.has('bulwark') ? 0.3 : 0));
    const length = Math.min(PROTECTION_CAP_S, seconds + extra);
    p.shield = Math.max(p.shield, length);
    p.shieldMax = Math.max(p.shield, length);
  }

  /** Bots and what the machine throws can be slowed. Traffic never can. */
  private wades(h: HazardEntity): boolean {
    return !h.spent && (h.maxHp > 0 || h.thrown > 0);
  }

  /** Ligaya: sidekicks ready at once, the next assist stronger by the meter. Spends the meter. */
  private rallyBeat(): void {
    const s = this.state;
    this.rallyNext = Math.min(RALLY_MULT_CAP, 1 + s.rhythm * 0.25);
    s.rhythm = 0;
    for (const k of s.sidekicks) {
      if (k.stats.cooldown > 0 && k.id !== 'kumpuni' && k.id !== 'bantay' && k.id !== 'kape') {
        k.cooldown = Math.min(k.cooldown, ASSIST_INTERVAL_FLOOR);
      }
      k.action = 1;
      k.mood = 'happy';
      k.reactT = 0;
    }
  }

  /** Hiraya: a weak pulse across every lane, on everything eligible in reach. */
  private starSweep(): void {
    const s = this.state;
    const damage = s.hero.pulse.damage * 1.5 * this.damageMult(true);
    this.addZap('star', -1, s.player.x, 18);
    for (const t of this.targetsAhead(34)) {
      this.addZap('star', -1, t.x, t.z);
      if (t.foe !== null) {
        this.damageFoe(t.foe, damage, 'hero');
      } else if (t.gear !== null) {
        this.hitGear(t.gear, 'hero', damage * 0.7);
      }
    }
  }

  /** Kidlat: all the stored charge, up one lane. */
  private capacitor(): void {
    const s = this.state;
    const lane = Math.max(-1, Math.min(1, Math.round(s.player.x)));
    const damage = (1 + s.charge * 0.5) * this.damageMult(true);
    const hits = this.targetsAhead(42).filter((t) => Math.abs(t.x - lane) < 0.6);
    this.addZap('lance', -1, lane, Math.max(26, ...hits.map((t) => t.z)));
    s.charge = 0;
    for (const t of hits) {
      if (t.foe !== null) {
        this.damageFoe(t.foe, damage, 'hero');
      } else if (t.gear !== null) {
        this.hitGear(t.gear, 'hero', damage * 0.8);
      }
    }
  }

  /** The lane with the most open road ahead (Route Sense's arrow). */
  private clearestLane(): number {
    const s = this.state;
    let best = 0;
    let bestFree = -1;
    for (const lane of [-1, 0, 1]) {
      let free = 60;
      for (const h of s.hazards) {
        if (h.spent || h.z + h.len < PLAYER_BACK || h.z > 60) {
          continue;
        }
        if (Math.abs(h.x - lane) < h.halfW + s.hero.hitHalfW + 0.05) {
          free = Math.min(free, h.z);
        }
      }
      // Prefer the current lane on ties, then the centre.
      const score = free - Math.abs(lane - s.player.x) * 0.5;
      if (score > bestFree) {
        bestFree = score;
        best = lane;
      }
    }
    return best;
  }

  /** Automatic assist: use the signature when it clearly helps, never wastefully. */
  private autoWants(): boolean {
    const s = this.state;
    const p = s.player;
    if (s.boss?.stage === 'honkReady') {
      return true;
    }
    if (p.cooldown > 0 || p.signature > 0 || p.invulnerable > 0 || p.shield > 0) {
      return false;
    }
    const botsNear = (): number => s.hazards.filter((h) => h.hp > 0 && !h.spent && h.z > PLAYER_FRONT && h.z < PULSE_RANGE * 0.7).length;
    switch (s.hero.id) {
      case 'hiraya':
      case 'tiko':
      case 'ningning':
      case 'tali':
        return botsNear() >= 2 || (s.boss?.gears.some((g) => g.state === 'open') ?? false);
      case 'ligaya':
        return s.rhythm >= 2 && (botsNear() >= 1 || s.boss !== null);
      case 'kidlat':
        return s.charge >= 6 && this.targetsAhead(42).some((t) => Math.abs(t.x - p.x) < 0.6);
      case 'sinta':
        return p.dents > 0 && !s.repairSpent && !s.repairBooked;
      case 'nico':
        return s.pickups.some((i) => i.hidden && !i.revealed && !i.collected) || s.postcardMark !== null;
      case 'alon':
        return s.hazards.filter((h) => this.wades(h) && h.z > 2 && h.z < 30).length >= 2;
      default:
        break;
    }
    if (s.hero.id === 'kiko') {
      // Gear Scan is for damage, not escape: when an open gear is lined up, or two or more bots are in range.
      const b = s.boss;
      if (b !== null && b.stage === 'fight') {
        return b.gears.some((g) => g.state === 'open' && Math.abs(g.x - p.x) < 0.45);
      }
      return s.hazards.filter((h) => h.hp > 0 && !h.spent && h.z > PLAYER_FRONT && h.z < PULSE_RANGE * 0.7).length >= 2;
    }
    for (const h of s.hazards) {
      if (h.spent || h.practice) {
        continue;
      }
      const approach = s.speed * (1 - h.ownSpeed + h.thrown);
      if (approach <= 0) {
        continue;
      }
      const t = (h.z - PLAYER_FRONT) / approach;
      const soon = s.hero.id === 'jepoy' ? 0.4 : 1.0;
      if (t >= 0 && t < soon && Math.abs(h.x - p.x) < h.halfW + s.hero.hitHalfW + 0.02) {
        return true;
      }
      // The shield covers the convoy: Kiko about to be hit counts too.
      const k = s.kiko;
      if (s.hero.id === 'jepoy' && k !== null && k.invulnerable <= 0 && s.rescue === null) {
        const tk = (h.z - (k.z + KIKO_FRONT)) / approach;
        if (tk >= 0 && tk < 0.4 && Math.abs(h.x - k.x) < h.halfW + KIKO_HALF_W) {
          return true;
        }
      }
    }
    return false;
  }

  // -- power-ups -----------------------------------------------------------------------

  private updatePowers(dt: number): void {
    const s = this.state;
    for (const kind of Object.keys(s.powers) as PowerUpKind[]) {
      const power = s.powers[kind]!;
      power.left -= dt;
      if (power.left <= 0) {
        delete s.powers[kind];
        this.emit({ type: 'powerEnd', kind });
      }
    }
  }

  private grantPower(kind: PowerUpKind): void {
    const s = this.state;
    const seconds = POWERUP_DEFS[kind].seconds * this.mods.powerTime * (s.hero.id === 'ningning' && kind === 'spread' ? 1.25 : 1);
    if (kind === 'bubble') {
      // Protection: the longer window wins, never the sum (capped).
      this.protect(seconds);
    }
    const current = s.powers[kind];
    // Picking the same power again refreshes it, never stacks past its own length.
    s.powers[kind] = { left: Math.max(current?.left ?? 0, seconds), total: seconds };
    this.emit({ type: 'power', kind, seconds });
  }

  /** A signature that works exactly as the capsule of that kind does, for its own length. */
  private signaturePower(kind: PowerUpKind, seconds: number): void {
    const s = this.state;
    if (kind === 'bubble') {
      this.protect(seconds);
    }
    const current = s.powers[kind];
    s.powers[kind] = { left: Math.max(current?.left ?? 0, seconds), total: Math.max(current?.total ?? 0, seconds) };
    this.emit({ type: 'power', kind, seconds });
  }

  private magnetRadius(): number {
    const s = this.state;
    const mila = s.sidekicks.find((k) => k.id === 'mila');
    const base = mila?.stats.range ?? 0.35;
    const mult = s.powers.magnet !== undefined ? 2 : 1;
    return Math.min(MAGNET_CAP, base * mult);
  }

  // -- sidekicks -----------------------------------------------------------------------

  private updateSidekicks(dt: number, wdt: number): void {
    const s = this.state;
    const p = s.player;
    const rally = s.powers.rally !== undefined ? 2 : 1;
    const rate = this.mods.sidekickRate * rally * (s.hero.id === 'tali' ? 1.1 : 1);
    for (const k of s.sidekicks) {
      // Formation: beside and slightly behind the hero, eased, kept on the road.
      const side = k.slot === 0 ? -1 : 1;
      let wantX = p.x + side * FORMATION_X;
      if (wantX < -1.2 || wantX > 1.2) {
        // At the road edge: tuck in behind instead of flying off the road.
        wantX = Math.max(-1.2, Math.min(1.2, wantX));
      }
      const wantZ = FORMATION_Z - (Math.abs(wantX - (p.x + side * FORMATION_X)) > 0.01 ? 0.7 : 0);
      k.x += (wantX - k.x) * Math.min(1, dt * 6);
      k.z += (wantZ - k.z) * Math.min(1, dt * 6);
      k.action = Math.max(0, k.action - dt * 3);
      k.reactT += dt;
      if (k.reactT > 2.5 && k.mood !== 'idle') {
        k.mood = 'idle';
      }
      if (s.ending !== null || s.tutorial !== null) {
        continue;
      }
      switch (k.id) {
        case 'pip':
          this.pipAct(k, wdt * rate);
          break;
        case 'bumbo':
          this.bumboAct(k, wdt * rate);
          break;
        case 'kumpuni':
          this.kumpuniAct(k, dt * rate);
          break;
        case 'bantay':
          this.bantayAct(k, dt * rate);
          break;
        case 'silip':
          this.silipAct(k, wdt * rate);
          break;
        case 'walis':
          this.walisAct(k, wdt * rate);
          break;
        case 'sibat':
          this.sibatAct(k, wdt * rate);
          break;
        case 'ilaw':
          this.ilawAct(k, dt * rate);
          break;
        case 'maso':
          this.masoAct(k, wdt * rate);
          break;
        case 'parolito':
          this.parolitoAct(k, wdt * rate);
          break;
        case 'kape':
          k.cooldown = Math.max(0, k.cooldown - dt * rate);
          break;
        case 'sago':
          this.sagoAct(k, wdt * rate);
          break;
        case 'kalaw':
          this.kalawAct(k, wdt * rate);
          break;
        case 'saranggola':
          this.saranggolaAct(k, dt * rate);
          break;
        case 'gearo':
          this.gearoAct(k, dt * rate);
          break;
        case 'kono':
          this.konoAct(k, wdt * rate);
          break;
        case 'kislap':
          this.kislapAct(k, dt, wdt * rate);
          break;
        case 'hamog':
          this.hamogAct(k, dt * rate);
          break;
        case 'dahon':
        case 'radyo':
        case 'ginto':
        case 'mila':
        case 'barya':
        case 'tala':
        case 'bibing':
        case 'sampy':
        case 'kawayan':
        case 'tarsi':
        case 'piko':
        case 'duwi':
        case 'silaw':
        case 'bitu':
        case 'ulap':
          // Always on, or triggered elsewhere (a checkpoint, a chain, a hit, a pulse).
          break;
      }
    }
  }

  private react(k: SidekickState, mood: SidekickState['mood'], action: SimEvent & { type: 'sidekick' }): void {
    k.action = 1;
    k.mood = mood;
    k.reactT = 0;
    // A Rally Beat strengthens one assist, then it is spent.
    if (action.action === 'shot' || action.action === 'chain' || action.action === 'pierce' || action.action === 'slam' || action.action === 'jam') {
      this.rallyNext = 1;
    }
    this.emit(action);
  }

  /** Kono: an extra horn blast, at bots only. */
  private konoAct(k: SidekickState, dt: number): void {
    k.cooldown -= dt;
    if (k.cooldown > 0) {
      return;
    }
    const target = this.targetsAhead(k.stats.range).filter((t) => t.foe !== null).sort((a, b) => a.z - b.z)[0];
    if (target === undefined) {
      k.cooldown = 0.2;
      return;
    }
    k.cooldown = k.stats.cooldown;
    this.addPulse({ x: k.x, z: k.z + 0.4, damage: k.stats.power * this.damageMult(false), from: k.id, tx: target.x, tz: target.z });
    this.react(k, 'determined', { type: 'sidekick', id: k.id, slot: k.slot, action: 'shot' });
  }

  /** Kislap: now and then, when there are Bolts near, draws them in for a moment. The pull itself is the magnet's own code. */
  private kislapAct(k: SidekickState, dt: number, charge: number): void {
    this.glimmerT = Math.max(0, this.glimmerT - dt);
    k.cooldown -= charge;
    if (k.cooldown > 0) {
      return;
    }
    const s = this.state;
    const near = s.pickups.some((i) => !i.collected && i.kind === 'bolt' && i.z > PLAYER_BACK && i.z < 12 && Math.abs(i.x - s.player.x) < k.stats.range);
    if (!near) {
      k.cooldown = 0.3;
      return;
    }
    k.cooldown = k.stats.cooldown;
    this.glimmerT = k.stats.power;
    this.react(k, 'happy', { type: 'sidekick', id: k.id, slot: k.slot, action: 'coins' });
  }

  /** Hamog: a short shield just before a hit, through the same protection as every other shield. */
  private hamogAct(k: SidekickState, dt: number): void {
    const s = this.state;
    const p = s.player;
    k.cooldown = Math.max(0, k.cooldown - dt);
    if (k.cooldown > 0 || p.shield > 0 || p.invulnerable > 0) {
      return;
    }
    const danger = s.hazards.some((h) => !h.spent && !h.clearedHero && h.z > 0.5 && h.z < k.stats.range && Math.abs(h.x - p.x) < h.halfW + s.hero.hitHalfW);
    if (!danger) {
      return;
    }
    this.protect(k.stats.power);
    k.cooldown = k.stats.cooldown;
    this.react(k, 'happy', { type: 'sidekick', id: k.id, slot: k.slot, action: 'sendoff' });
  }

  /** Parolito: lights up a hidden stash already ahead. */
  private parolitoAct(k: SidekickState, dt: number): void {
    k.cooldown -= dt;
    if (k.cooldown > 0) {
      return;
    }
    const found = this.state.pickups.filter((p) => p.hidden && !p.revealed && !p.collected && p.z > 6 && p.z < k.stats.range);
    if (found.length === 0) {
      k.cooldown = 0.5;
      return;
    }
    k.cooldown = k.stats.cooldown;
    for (const p of found) {
      p.revealed = true;
    }
    this.addZap('reveal', k.slot, found[0].x, found[0].z);
    this.emit({ type: 'stashShown', x: found[0].x, z: found[0].z });
    this.react(k, 'happy', { type: 'sidekick', id: k.id, slot: k.slot, action: 'reveal' });
  }

  /** Sago: gums up the nearest bot or thrown thing. */
  private sagoAct(k: SidekickState, dt: number): void {
    k.cooldown -= dt;
    if (k.cooldown > 0) {
      return;
    }
    const target = this.state.hazards.filter((h) => this.wades(h) && h.slowT <= 0 && h.z > 3 && h.z < k.stats.range).sort((a, b) => a.z - b.z)[0];
    if (target === undefined) {
      k.cooldown = 0.3;
      return;
    }
    k.cooldown = Math.max(ASSIST_INTERVAL_FLOOR, k.stats.cooldown);
    target.slowT = k.stats.power;
    this.addZap('foam', k.slot, target.x, target.z);
    this.react(k, 'happy', { type: 'sidekick', id: k.id, slot: k.slot, action: 'wade' });
  }

  /** Kalaw: an early mark over the next thing moving fast or changing lanes. */
  private kalawAct(k: SidekickState, dt: number): void {
    k.cooldown -= dt;
    if (k.cooldown > 0) {
      return;
    }
    const target = this.state.hazards
      .filter((h) => !h.spent && h.marked <= 0 && h.z > 6 && h.z < k.stats.range && (h.thrown > 0 || (h.laneChange !== null && !h.laneChange.done) || h.ownSpeed > 0))
      .sort((a, b) => Number(b.thrown > 0 || b.laneChange !== null) - Number(a.thrown > 0 || a.laneChange !== null) || a.z - b.z)[0];
    if (target === undefined) {
      k.cooldown = 0.4;
      return;
    }
    k.cooldown = k.stats.cooldown;
    target.marked = k.stats.power;
    this.addZap('mark', k.slot, target.x, target.z);
    this.react(k, 'determined', { type: 'sidekick', id: k.id, slot: k.slot, action: 'alert' });
  }

  /** Saranggola: goes back for one ordinary Bolt you missed. */
  private saranggolaAct(k: SidekickState, dt: number): void {
    const s = this.state;
    k.cooldown = Math.max(0, k.cooldown - dt);
    if (k.cooldown > 0 || s.missedBolts <= 0) {
      return;
    }
    s.missedBolts -= 1;
    s.boltsCollected += 1;
    k.cooldown = k.stats.cooldown;
    this.addZap('retrieve', k.slot, s.player.x, 0);
    this.react(k, 'happy', { type: 'sidekick', id: k.id, slot: k.slot, action: 'retrieve' });
  }

  /** Gearo: winds a little back into a shield that is up, never past its full length. */
  private gearoAct(k: SidekickState, dt: number): void {
    const p = this.state.player;
    k.cooldown = Math.max(0, k.cooldown - dt);
    if (k.cooldown > 0 || p.shield <= 0 || p.shield >= p.shieldMax - 0.05) {
      return;
    }
    p.shield = Math.min(p.shieldMax, p.shield + k.stats.power);
    k.cooldown = k.stats.cooldown;
    this.addZap('mend', k.slot, p.x, 0);
    this.react(k, 'happy', { type: 'sidekick', id: k.id, slot: k.slot, action: 'mend' });
  }

  /** Targets for sidekick attacks: live bots ahead within range, and the machine's open gears. */
  private targetsAhead(range: number): { foe: HazardEntity | null; gear: Gear | null; x: number; z: number }[] {
    const s = this.state;
    const out: { foe: HazardEntity | null; gear: Gear | null; x: number; z: number }[] = [];
    for (const h of s.hazards) {
      if (h.hp > 0 && !h.spent && h.z > 0.5 && h.z < range) {
        out.push({ foe: h, gear: null, x: h.x, z: h.z });
      }
    }
    const b = s.boss;
    if (b !== null && b.stage === 'fight') {
      for (const gear of b.gears) {
        if (gear.state === 'open') {
          out.push({ foe: null, gear, x: gear.x, z: b.z });
        }
      }
    }
    return out;
  }

  private pipAct(k: SidekickState, dt: number): void {
    k.cooldown -= dt;
    if (k.cooldown > 0) {
      return;
    }
    // Nearest first; at equal distance (the two open gears of phase 2) the one away from the hero's own pulses.
    const hx = this.state.player.x;
    const targets = this.targetsAhead(k.stats.range).sort((a, b) => a.z - b.z || Math.abs(b.x - hx) - Math.abs(a.x - hx));
    if (targets.length === 0) {
      k.cooldown = 0.2;
      return;
    }
    k.cooldown = k.stats.cooldown;
    // Darts: one per count, at the nearest targets (the same one twice if alone).
    for (let i = 0; i < k.stats.count; i += 1) {
      const t = targets[Math.min(i, targets.length - 1)];
      this.addPulse({ x: k.x, z: k.z + 0.4, damage: k.stats.power * this.damageMult(false), from: k.id, tx: t.x, tz: t.z });
    }
    this.react(k, 'determined', { type: 'sidekick', id: k.id, slot: k.slot, action: 'shot' });
  }

  private bumboAct(k: SidekickState, dt: number): void {
    k.cooldown -= dt;
    if (k.cooldown > 0) {
      return;
    }
    const targets = this.targetsAhead(k.stats.range).sort((a, b) => a.z - b.z).slice(0, k.stats.count);
    if (targets.length === 0) {
      k.cooldown = 0.25;
      return;
    }
    k.cooldown = k.stats.cooldown;
    for (const t of targets) {
      this.addZap('chain', k.slot, t.x, t.z);
      if (t.foe !== null) {
        this.damageFoe(t.foe, k.stats.power * this.damageMult(false), k.id);
      } else if (t.gear !== null) {
        this.hitGear(t.gear, k.id, k.stats.power * this.damageMult(false));
      }
    }
    this.react(k, 'happy', { type: 'sidekick', id: k.id, slot: k.slot, action: 'chain' });
  }

  private kumpuniAct(k: SidekickState, dt: number): void {
    const s = this.state;
    k.cooldown = Math.max(0, k.cooldown - dt);
    if (k.cooldown > 0 || k.uses >= k.stats.count || s.player.dents <= 0 || s.repairsUsed >= REPAIR_CAP) {
      return;
    }
    // A moment after a hit, so the dent registers before it is fixed.
    if (s.time - this.lastHitAt < 1) {
      return;
    }
    s.player.dents -= 1;
    s.repairsUsed += 1;
    k.uses += 1;
    k.cooldown = k.stats.cooldown;
    this.addZap('repair', k.slot, s.player.x, 0);
    this.react(k, 'happy', { type: 'sidekick', id: k.id, slot: k.slot, action: 'repair' });
    this.emit({ type: 'repair', by: k.id });
  }

  private bantayAct(k: SidekickState, dt: number): void {
    if (k.charged) {
      return;
    }
    // No recharge while any other protection is up: protection never piles up.
    if (this.state.player.shield > 0) {
      return;
    }
    k.cooldown -= dt;
    if (k.cooldown <= 0) {
      k.charged = true;
      k.cooldown = 0;
      this.react(k, 'determined', { type: 'sidekick', id: k.id, slot: k.slot, action: 'charged' });
    }
  }

  private silipAct(k: SidekickState, dt: number): void {
    const s = this.state;
    k.cooldown -= dt;
    if (k.cooldown > 0) {
      return;
    }
    // Jam the machine's next throw a moment (later is never less fair), or the nearest bot.
    const b = s.boss;
    if (b !== null && b.stage === 'fight' && b.pending !== null) {
      b.pending.release += 0.8;
      k.cooldown = k.stats.cooldown;
      this.addZap('jam', k.slot, 0, b.z);
      this.react(k, 'happy', { type: 'sidekick', id: k.id, slot: k.slot, action: 'jam' });
      return;
    }
    // The bot that threatens the hero most: in the hero's lane or changing lanes first, then the nearest.
    const px = s.player.x;
    const threat = (h: HazardEntity): number => (Math.abs(h.x - px) < 0.6 || (h.laneChange !== null && !h.laneChange.done) ? 0 : 1);
    const foe = s.hazards
      .filter((h) => h.hp > 0 && !h.spent && h.z > 2 && h.z < k.stats.range && h.stun <= 0)
      .sort((a, b2) => threat(a) - threat(b2) || a.z - b2.z)[0];
    if (foe === undefined) {
      k.cooldown = 0.3;
      return;
    }
    foe.stun = 1.5;
    k.cooldown = k.stats.cooldown;
    this.addZap('jam', k.slot, foe.x, foe.z);
    this.react(k, 'happy', { type: 'sidekick', id: k.id, slot: k.slot, action: 'jam' });
  }

  /** Walis: sweeps road clutter out of the hero's lane. Never traffic, never a bot, and a pothole is not going anywhere. */
  private walisAct(k: SidekickState, dt: number): void {
    const s = this.state;
    k.cooldown -= dt;
    if (k.cooldown > 0) {
      return;
    }
    const p = s.player;
    const inWay = s.hazards
      .filter((h) => !h.spent && SWEEPABLE.has(h.kind) && h.z > 1 && h.z < k.stats.range && Math.abs(h.x - p.x) < h.halfW + s.hero.hitHalfW)
      .sort((a, b) => a.z - b.z)
      .slice(0, k.stats.count);
    if (inWay.length === 0) {
      k.cooldown = 0.25;
      return;
    }
    k.cooldown = k.stats.cooldown;
    for (const h of inWay) {
      this.knock(h, h.x >= p.x ? 1 : -1);
      this.addZap('sweep', k.slot, h.x, h.z);
    }
    this.react(k, 'happy', { type: 'sidekick', id: k.id, slot: k.slot, action: 'sweep' });
  }

  /** Sibat: a lance up the lane with the most targets in it; it hits all of them. */
  private sibatAct(k: SidekickState, dt: number): void {
    const s = this.state;
    k.cooldown -= dt;
    if (k.cooldown > 0) {
      return;
    }
    const targets = this.targetsAhead(k.stats.range);
    if (targets.length === 0) {
      k.cooldown = 0.25;
      return;
    }
    const inLane = (lane: number): typeof targets => targets.filter((t) => Math.abs(t.x - lane) < 0.6);
    // The busiest lane; on a tie, the one nearest the hero.
    const lane = [-1, 0, 1].sort((a, b) => inLane(b).length - inLane(a).length || Math.abs(a - s.player.x) - Math.abs(b - s.player.x))[0];
    const hits = inLane(lane);
    k.cooldown = k.stats.cooldown;
    this.addZap('pierce', k.slot, lane, Math.max(...hits.map((t) => t.z), k.stats.range * 0.6));
    for (const t of hits) {
      if (t.foe !== null) {
        this.damageFoe(t.foe, k.stats.power * this.damageMult(false), k.id);
      } else if (t.gear !== null) {
        this.hitGear(t.gear, k.id, k.stats.power * this.damageMult(false));
      }
    }
    this.react(k, 'determined', { type: 'sidekick', id: k.id, slot: k.slot, action: 'pierce' });
  }

  /** Ilaw: when something is about to hit the hero, holds the road back for a moment (as Route Sense does). */
  private ilawAct(k: SidekickState, dt: number): void {
    const s = this.state;
    const p = s.player;
    k.cooldown = Math.max(0, k.cooldown - dt);
    if (k.cooldown > 0 || s.slowmo > 0 || p.shield > 0 || p.invulnerable > 0) {
      return;
    }
    const danger = s.hazards.some((h) => !h.spent && !h.clearedHero && h.z > 0.5 && h.z < k.stats.range && Math.abs(h.x - p.x) < h.halfW + s.hero.hitHalfW);
    if (!danger) {
      return;
    }
    s.slowmo = k.stats.power;
    k.cooldown = k.stats.cooldown;
    this.addZap('slow', k.slot, p.x, 0);
    this.react(k, 'determined', { type: 'sidekick', id: k.id, slot: k.slot, action: 'slow' });
  }

  /** Maso: one heavy swing at an open gear, else at the toughest bot in reach. */
  private masoAct(k: SidekickState, dt: number): void {
    k.cooldown -= dt;
    if (k.cooldown > 0) {
      return;
    }
    const targets = this.targetsAhead(k.stats.range);
    const target = targets.find((t) => t.gear !== null) ?? targets.sort((a, b) => (b.foe?.hp ?? 0) - (a.foe?.hp ?? 0) || a.z - b.z)[0];
    if (target === undefined) {
      k.cooldown = 0.25;
      return;
    }
    k.cooldown = k.stats.cooldown;
    this.addZap('slam', k.slot, target.x, target.z);
    if (target.gear !== null) {
      this.hitGear(target.gear, k.id, k.stats.power * this.damageMult(false));
    } else if (target.foe !== null) {
      this.damageFoe(target.foe, k.stats.power * this.damageMult(false), k.id);
    }
    this.react(k, 'determined', { type: 'sidekick', id: k.id, slot: k.slot, action: 'slam' });
  }

  /** True when nothing harmful is left beside or ahead of the hero. */
  private roadClear(): boolean {
    return !this.state.hazards.some((h) => !h.spent && h.z + h.len > PLAYER_BACK);
  }

  /**
   * Knocks everything still on the road to the shoulder (a beaten boss phase, Team Honk charged,
   * a checkpoint that waited long enough) - with a visible burst where it is in view.
   */
  private clearRoad(kind: ZapEffect['kind'] | null): void {
    for (const h of this.state.hazards) {
      if (!h.spent && h.z + h.len > PLAYER_BACK) {
        this.knock(h, h.x >= 0 ? 1 : -1);
        if (kind !== null && h.z < 40) {
          this.addZap(kind, -1, h.x, h.z);
        }
      }
    }
  }

  private addZap(kind: ZapEffect['kind'], slot: 0 | 1 | -1, x: number, z: number): void {
    const s = this.state;
    s.zaps.push({ id: this.nextId++, kind, slot, x, z, t: 0 });
    if (s.zaps.length > MAX_ZAPS) {
      s.zaps.shift();
    }
  }

  // -- horn pulses and damage -------------------------------------------------------------

  /**
   * Damage multiplier for the hero's pulses (`hero`) or a sidekick's hits. The cap covers total
   * output: damage x fire rate (Overclock, Rally, Squad Drill) never exceeds DAMAGE_MULT_CAP.
   * Wide Horn's and Lookout's costs (pulseDamageMult) are the hero's pulses only, as their text says.
   */
  private damageMult(hero: boolean): number {
    const scan = this.state.scan > 0 ? 2 : 1;
    const rate = hero ? 1 / this.mods.pulseInterval : this.mods.sidekickRate * (this.state.powers.rally !== undefined ? 2 : 1);
    const mult = (hero ? this.mods.pulseDamage : this.rallyNext) * scan;
    return Math.min(mult, Math.max(DAMAGE_MULT_CAP / rate, hero ? this.mods.pulseDamage : 1));
  }

  private addPulse(p: { x: number; z: number; damage: number; from: 'hero' | SidekickId; tx: number | null; tz?: number; big?: boolean; base?: boolean }): void {
    const s = this.state;
    if (s.pulses.length >= MAX_PULSES) {
      return;
    }
    // A dart closes on its target at its own speed plus the road's; it turns fast enough to line up in time.
    const closing = PULSE_SPEED + s.speed;
    const time = p.tz !== undefined ? Math.max(0.06, (p.tz - p.z) / closing) : 1;
    const lat = p.tx !== null ? Math.max(4, (Math.abs(p.tx - p.x) / time) * 1.25) : 0;
    s.pulses.push({ id: this.nextId++, x: p.x, z: p.z, big: p.big ?? false, damage: p.damage, from: p.from, tx: p.tx, lat, travelled: 0, base: p.base ?? false });
  }

  /** Automatic horn pulses: always on the road (bots), and at the machine in the finale. */
  private firePulses(dt: number): void {
    const s = this.state;
    const section = this.section;
    const quiet =
      s.ending !== null ||
      s.rescue !== null ||
      section === undefined ||
      section.kind === 'checkpoint' ||
      section.kind === 'arrive' ||
      (s.tutorial !== null && s.tutorial.step !== 'pulse' && s.tutorial.step !== 'go') ||
      (s.boss !== null && s.boss.stage !== 'fight');
    this.pulseT -= dt;
    if (quiet || this.pulseT > 0) {
      return;
    }
    const hero = s.hero;
    this.pulseT = pulseInterval(hero, this.mods);
    const damage = hero.pulse.damage * this.damageMult(true);
    const x = s.player.x;
    const lanes = s.powers.spread !== undefined || this.mods.wideHorn ? [-1, 0, 1] : [0];
    for (const dl of lanes) {
      const px = Math.max(-1.4, Math.min(1.4, x + dl));
      if (dl !== 0 && Math.abs(px - x) < 0.5) {
        continue;
      }
      if (hero.pulse.pattern === 'twin') {
        this.addPulse({ x: px - 0.13, z: PLAYER_FRONT, damage, from: 'hero', tx: null, base: true });
        this.addPulse({ x: px + 0.13, z: PLAYER_FRONT, damage, from: 'hero', tx: null, base: true });
      } else {
        this.addPulse({ x: px, z: PLAYER_FRONT, damage, from: 'hero', tx: null, base: true });
      }
      if (s.echo > 0) {
        // Tiko: an echo a moment later, weaker. Echoes make no echoes.
        this.echoes.push({ t: 0.12, x: px, damage: damage * 0.6 });
      }
    }
    // Bitu: every so many horn pulses, one small bead. Beads and echoes do not count.
    const bitu = s.sidekicks.find((k) => k.id === 'bitu');
    if (bitu !== undefined) {
      this.beadCount += 1;
      if (this.beadCount >= (this.synergy.has('static') ? 4 : bitu.stats.count)) {
        this.beadCount = 0;
        bitu.action = 1;
        this.addPulse({ x: bitu.x, z: bitu.z + 0.4, damage: bitu.stats.power * this.damageMult(false), from: 'bitu', tx: x });
      }
    }
  }

  private movePulses(dt: number): void {
    const s = this.state;
    const b = s.boss;
    for (const pulse of s.pulses) {
      if (pulse.big) {
        pulse.z += PULSE_SPEED * dt;
        continue;
      }
      const step = PULSE_SPEED * dt;
      pulse.z += step;
      pulse.travelled += step;
      if (pulse.tx !== null) {
        // Darts curve toward their target lane.
        pulse.x += Math.max(-pulse.lat * dt, Math.min(pulse.lat * dt, pulse.tx - pulse.x));
      }
      // The first live bot it reaches.
      for (const h of s.hazards) {
        if (h.hp <= 0 || h.spent) {
          continue;
        }
        if (pulse.z >= h.z - 0.2 && pulse.z - step <= h.z + h.len && Math.abs(pulse.x - h.x) < h.halfW + 0.14) {
          this.damageFoe(h, pulse.damage, pulse.from);
          this.landed(pulse);
          pulse.travelled = PULSE_RANGE + 1;
          break;
        }
      }
      if (pulse.travelled > PULSE_RANGE) {
        continue;
      }
      if (b !== null && pulse.z >= b.z - 1.5) {
        pulse.travelled = PULSE_RANGE + 1;
        if (b.stage !== 'fight') {
          continue;
        }
        const gear = b.gears.find((g) => g.state === 'open' && Math.abs(g.x - pulse.x) < GEAR_HIT_HALF);
        if (gear === undefined) {
          this.emit({ type: 'clank' });
          continue;
        }
        // A pulse carries its own damage (hero strength, multipliers, caps); sidekick darts land at 80%.
        this.hitGear(gear, pulse.from, pulse.from === 'hero' ? pulse.damage : pulse.damage * 0.8);
        this.landed(pulse);
      }
    }
    s.pulses = s.pulses.filter((p) => (p.big ? p.z < (b?.z ?? 60) + 2 : p.travelled <= PULSE_RANGE));
  }

  /** A hero's own pulse landed: it counts, and Kidlat stores it. Nothing else does. */
  private landed(pulse: PulseEntity): void {
    if (!pulse.base) {
      return;
    }
    const s = this.state;
    s.tally.basePulseHits += 1;
    if (s.hero.id === 'kidlat') {
      s.charge = Math.min(10, s.charge + 1);
    }
  }

  /** Damages a bot; at zero it is zapped (drops Bolts) and harmless. */
  private damageFoe(h: HazardEntity, damage: number, by: 'hero' | SidekickId): void {
    const s = this.state;
    // Jammed by Silip: shorted out, it takes double damage.
    h.hp = Math.max(0, h.hp - damage * (h.stun > 0 ? 2 : 1));
    h.hurtT = 0;
    this.emit({ type: 'foeHit', x: h.x, z: h.z, by });
    if (h.hp > 0) {
      return;
    }
    h.spent = true;
    h.knocked = 0;
    h.knockDir = 0;
    if (h.practice) {
      if (s.tutorial !== null) {
        s.tutorial.zapped += 1;
      }
    } else {
      s.foesDefeated += 1;
      s.streak += 1;
      const ginto = s.sidekicks.find((k) => k.id === 'ginto');
      if (ginto !== undefined && this.gintoBolts < ginto.stats.count) {
        // Plain Bolts in the bank: no goal, chain or unlock counts them.
        const bonus = Math.min(ginto.stats.power, ginto.stats.count - this.gintoBolts);
        this.gintoBolts += bonus;
        s.boltsCollected += bonus;
        this.react(ginto, 'celebrate', { type: 'sidekick', id: ginto.id, slot: ginto.slot, action: 'coins' });
      }
      if (s.goal !== null && s.goal.kind === 'foes' && !s.goal.done) {
        s.goal.progress += 1;
        this.checkGoal();
      }
      // Bolts spill a little ahead, in its lane: easy to drive through.
      const drop = isFoeKind(h.kind) ? FOES[h.kind].drop : 1;
      for (let i = 0; i < drop; i += 1) {
        this.spawnPickup('bolt', Math.max(-1, Math.min(1, Math.round(h.x))), Math.max(4, h.z + 1.5 + i * 1.6));
      }
    }
    this.emit({ type: 'foeDown', x: h.x, z: h.z, kind: h.kind as FoeKind, by, streak: s.streak });
  }

  /** `amount`: the hit's damage with multipliers already applied (1 = a plain Navie pulse). */
  private hitGear(gear: Gear, by: 'hero' | SidekickId, amount: number): void {
    const s = this.state;
    const b = s.boss!;
    if (b.stage !== 'fight' || gear.state !== 'open') {
      // A gear that closed (or a break that started) since the hit was aimed.
      return;
    }
    const dmg = (1.45 / s.preset.bossToughness) * amount;
    const floor = b.phase === 3 ? 8 : b.phase === 2 ? 33 : 66;
    b.jam = Math.max(floor, b.jam - dmg);
    gear.flash = 0.25;
    b.hurtT = 0;
    b.hits += 1;
    // Every third hit shakes a Bolt loose from the machine.
    if (b.hits % 3 === 0) {
      this.spawnPickup('bolt', gear.x, b.z - 3);
    }
    this.emit({ type: 'gearHit', x: gear.x, by, jam: b.jam });
    if (b.phase < 3 && b.jam <= floor) {
      b.phase = (b.phase + 1) as 2 | 3;
      b.stage = 'break';
      b.t = 0;
      b.breakDropped = false;
      b.breakChoiceDone = false;
      b.pending = null;
      b.telegraph = [];
      b.telegraphOpen = null;
      for (const g of b.gears) {
        g.state = 'closed';
      }
      // The machine stalls: whatever it had thrown is knocked aside, so the break really is safe.
      this.clearRoad('honk');
      this.emit({ type: 'bossStage', phase: b.phase, stage: 'break' });
    }
  }

  // -- Kiko (convoy) -------------------------------------------------------------

  private updateKiko(dt: number): void {
    const s = this.state;
    const k = s.kiko!;
    k.invulnerable = Math.max(0, k.invulnerable - dt);
    k.wobble = Math.max(0, k.wobble - dt);
    k.hitT += dt;

    // Record Navie's path by distance (a sample every few centimetres of road).
    const last = k.trail[k.trail.length - 1];
    if (s.distance - last.d >= 0.1) {
      k.trail.push({ d: s.distance, x: s.player.x });
    } else {
      last.x = s.player.x;
    }
    // Keep a little more road than he can be behind.
    while (k.trail.length > 2 && k.trail[1].d < s.distance - KIKO_GAP - 4) {
      k.trail.shift();
    }

    // The lay-by is protected (no collisions), so he can pull in at once. Pulling alongside at the
    // end waits until every hazard is behind him too; nothing is placed on the last stretch, so
    // once started it stays started.
    const laying = s.rescue !== null && s.rescue.phase !== 'resume';
    if (!this.arriveStarted && this.section?.kind === 'arrive' && s.hazards.every((h) => h.spent || h.z + h.len < k.z + KIKO_BACK)) {
      this.arriveStarted = true;
    }
    const arriving = this.arriveStarted && s.ending?.outcome !== 'failure';
    if (laying) {
      // The lay-by: he rolls in on the right, close behind; Navie lines up in front.
      k.targetX = 1;
      k.z += Math.max(-3 * dt, Math.min(3 * dt, -KIKO_RESCUE_GAP - k.z));
    } else if (arriving) {
      // The empty last stretch: he pulls up beside Navie, one lane over, to arrive together.
      // He keeps his lane while Navie stays clear of it (no flicker when Navie sits on a lane
      // line); otherwise he moves to the nearest lane well away from Navie.
      // Judged against where the hero is HEADING (not where it is mid-swerve), so a lane change
      // across the road does not send him back and forth.
      const heading = Math.max(-1.2, Math.min(1.2, s.player.targetX));
      if (this.arriveLane === null || Math.abs(this.arriveLane - heading) < 0.7) {
        let best = this.arriveLane ?? (k.x >= heading ? 1 : -1);
        let bestCost = Infinity;
        for (const lane of [-1, 0, 1]) {
          if (Math.abs(lane - heading) >= 0.85) {
            const cost = Math.abs(lane - k.x);
            if (cost < bestCost) {
              bestCost = cost;
              best = lane;
            }
          }
        }
        this.arriveLane = best;
      }
      k.targetX = this.arriveLane;
      // Beside Navie only when lined up and clear; otherwise drop back first, so he never cuts across Navie.
      const lined = Math.abs(k.x - k.targetX) < 0.25 && Math.abs(k.x - s.player.x) >= 0.75;
      const zWant = lined ? -1.6 : -4;
      k.z += Math.max(-2.5 * dt, Math.min(2 * dt, zWant - k.z));
      if (!this.alongsideAnnounced && k.z > -2.2) {
        this.alongsideAnnounced = true;
        this.emit({ type: 'kikoAlongside' });
      }
    } else {
      // Dropping back to his convoy gap (after the lay-by) as Navie pulls away.
      k.z += Math.max(-2.5 * dt, Math.min(2.5 * dt, -KIKO_GAP - k.z));
      k.targetX = this.trailAt(s.distance + k.z);
    }
    const desired = Math.max(-KIKO_LATERAL, Math.min(KIKO_LATERAL, (k.targetX - k.x) * 9));
    k.vx += Math.max(-24 * dt, Math.min(24 * dt, desired - k.vx));
    k.x += k.vx * dt;
    k.x = Math.max(-X_LIMIT, Math.min(X_LIMIT, k.x));

    // A swerve sharper than he can steer leaves him off Navie's line.
    const off = laying || arriving ? 0 : Math.abs(k.targetX - k.x);
    k.strain = Math.max(0, Math.min(1, (off - 0.1) / (KIKO_STRAIN_AT - 0.1)));
    if (off > KIKO_STRAIN_AT && !this.strainAnnounced && this.section?.kind !== 'tutorial') {
      this.strainAnnounced = true;
      this.emit({ type: 'kikoStrain' });
    }
  }

  /** Where Navie was at road distance `d`. */
  private trailAt(d: number): number {
    const trail = this.state.kiko!.trail;
    if (d <= trail[0].d) {
      return trail[0].x;
    }
    for (let i = trail.length - 1; i > 0; i -= 1) {
      const a = trail[i - 1];
      if (a.d <= d) {
        const b = trail[i];
        const span = b.d - a.d;
        return span > 1e-6 ? a.x + ((b.x - a.x) * Math.min(1, (d - a.d) / span)) : b.x;
      }
    }
    return trail[trail.length - 1].x;
  }

  // -- collisions -------------------------------------------------------------------

  /**
   * Collision rules. Only the hero (and, in the convoy, the escorted Kiko) can
   * be hit; sidekicks fly in formation and never collide. Each hazard or bot
   * can hit each car once. The hero meets it first; Kiko meets the same
   * stretch of road a moment later (gap / speed). A hazard that hits either
   * car, is knocked aside by a shield or guard, or (a bot) is zapped, is spent
   * for both. One met while a car is protected (after its own hit) passes that
   * car only. Protection order for the hero: shield / bubble, then Bantay's
   * guard charge, then a dent. The shield protects the whole convoy.
   */
  private collide(): void {
    const s = this.state;
    const p = s.player;
    const k = s.kiko;
    if (s.rescue !== null && s.rescue.phase !== 'resume') {
      // The protected lay-by: both cars are off the carriageway until they pull out again.
      return;
    }
    const half = s.hero.hitHalfW;
    for (const h of s.hazards) {
      if (h.spent || h.knocked >= 0) {
        continue;
      }
      if (k !== null && !h.clearedKiko && h.z < k.z + KIKO_FRONT && h.z + h.len > k.z + KIKO_BACK && Math.abs(h.x - k.x) < h.halfW + KIKO_HALF_W - 0.04) {
        this.hitKiko(h, k);
        continue;
      }
      if (h.clearedHero || h.z >= PLAYER_FRONT || h.z + h.len <= PLAYER_BACK) {
        continue;
      }
      if (Math.abs(h.x - p.x) >= h.halfW + half) {
        continue;
      }
      const dir = h.x >= p.x ? 1 : -1;
      if (h.practice) {
        this.knock(h, dir);
        p.hitT = 0;
        if (s.tutorial !== null) {
          s.tutorial.bumps += 1;
        }
        this.emit({ type: 'practiceBump' });
        continue;
      }
      if (p.shield > 0) {
        s.shieldBlocks += 1;
        if (h.hp > 0 && s.hero.id === 'jepoy' && p.signature > 0) {
          // Kuya's Shield: a bot that bounces off takes a hit (Bolts, goals and streaks as for any hit).
          this.damageFoe(h, s.hero.pulse.damage * this.damageMult(true), 'hero');
        }
        if (!h.spent || h.knocked < 0) {
          this.knock(h, dir);
        }
        this.emit({ type: 'shieldBlock' });
        continue;
      }
      if (s.brace > 0 && h.maxHp === 0 && (h.kind === 'cone' || h.kind === 'pothole' || h.kind === 'rollingCone')) {
        // Load Brace: small road clutter bounces off the tyres. Traffic and bots still count.
        this.knock(h, dir);
        p.hitT = Math.max(p.hitT, 0.2);
        this.emit({ type: 'practiceBump' });
        continue;
      }
      if (p.invulnerable > 0 || s.ending !== null) {
        // Protected: it passes the hero and can never hit the hero later in the same overlap.
        h.clearedHero = true;
        continue;
      }
      const guard = s.sidekicks.find((g) => g.id === 'bantay' && g.charged);
      if (guard !== undefined) {
        guard.charged = false;
        guard.cooldown = guard.stats.cooldown;
        this.knock(h, dir);
        s.shieldBlocks += 1;
        // A short grace after a block, so a pair of hazards is not one block and one dent.
        p.invulnerable = Math.max(p.invulnerable, 0.5);
        this.addZap('guard', guard.slot, p.x, 0);
        this.react(guard, 'determined', { type: 'sidekick', id: guard.id, slot: guard.slot, action: 'guard' });
        continue;
      }
      p.dents += 1;
      const sampy = s.sidekicks.find((m) => m.id === 'sampy');
      p.invulnerable = s.preset.invulnerable + Math.min(RECOVERY_BONUS_CAP, sampy?.stats.power ?? 0);
      p.hitT = 0;
      s.streak = 0;
      this.lastHitAt = s.time;
      this.stretchHits += 1;
      s.chain.count = 0;
      // Bantay, once a run: a brief buffer when a hit leaves you on the last dent. Never heals.
      const bantay = s.sidekicks.find((m) => m.id === 'bantay');
      if (bantay !== undefined && !this.bufferUsed && p.maxDents !== null && p.dents === p.maxDents - 1) {
        this.bufferUsed = true;
        p.invulnerable += 1.2;
        this.react(bantay, 'determined', { type: 'sidekick', id: bantay.id, slot: bantay.slot, action: 'buffer' });
      }
      this.knock(h, dir);
      for (const mate of s.sidekicks) {
        mate.mood = 'worried';
        mate.reactT = 0;
      }
      if (s.goal !== null && s.goal.kind === 'clean' && !s.goal.done) {
        s.goal.failed = true;
      }
      this.emit({ type: 'hit', who: 'hero', kind: h.kind, dents: p.dents });
      if (p.maxDents !== null && p.dents >= p.maxDents) {
        this.end('failure', 'dents');
      }
    }
  }

  private hitKiko(h: HazardEntity, k: KikoState): void {
    const s = this.state;
    const dir = h.x >= k.x ? 1 : -1;
    if (s.player.shield > 0) {
      this.knock(h, dir);
      s.shieldBlocks += 1;
      this.emit({ type: 'shieldBlock' });
      return;
    }
    if (k.invulnerable > 0 || s.ending !== null) {
      h.clearedKiko = true;
      return;
    }
    k.invulnerable = KIKO_INVULNERABLE;
    k.wobble = 0.6;
    k.hitT = 0;
    if (k.maxEngine !== null) {
      k.engine = Math.max(0, k.engine - 1);
    }
    this.knock(h, dir);
    this.emit({ type: 'hit', who: 'kiko', kind: h.kind, dents: s.player.dents });
    if (k.maxEngine !== null && k.engine <= 0) {
      this.end('failure', 'kiko');
    }
  }

  /**
   * Small things fly to the shoulder; traffic steers off toward it (so Kiko,
   * behind, never visibly drives through a car that just bumped the hero).
   * Either way, it is spent.
   */
  private knock(h: HazardEntity, dir: number): void {
    h.spent = true;
    if (h.knocked < 0) {
      h.knocked = 0;
      h.knockDir = dir;
    }
  }

  private collectPickups(dt: number): void {
    const s = this.state;
    const p = s.player;
    const radius = this.magnetRadius();
    // Kislap's glimmer reaches Bolts, Dahon reaches wrenches; neither touches anything else, and both stay under the magnet cap.
    const kislap = this.glimmerT > 0 ? s.sidekicks.find((k) => k.id === 'kislap') : undefined;
    const dahon = s.sidekicks.find((k) => k.id === 'dahon');
    const mila = s.sidekicks.find((k) => k.id === 'mila');
    const pullsPowerUps = mila !== undefined && mila.stats.power > 0;
    for (const item of s.pickups) {
      if (item.collected) {
        continue;
      }
      const pullable = item.kind !== 'postcard' && (item.kind !== 'powerup' || pullsPowerUps);
      let reach = radius;
      if (kislap !== undefined && item.kind === 'bolt') {
        reach = Math.max(reach, Math.min(MAGNET_CAP, kislap.stats.range * (s.powers.magnet !== undefined ? 2 : 1)));
      } else if (dahon !== undefined && item.kind === 'wrench') {
        reach = Math.max(reach, Math.min(MAGNET_CAP, dahon.stats.range));
      }
      if (pullable && item.z < 8 && item.z > PLAYER_BACK && Math.abs(item.x - p.x) < reach) {
        item.x += (p.x - item.x) * Math.min(1, dt * 7);
        if (mila !== undefined && mila.reactT > 1.2 && Math.abs(item.x - p.x) > 0.3) {
          mila.action = 1;
          mila.reactT = 0;
          mila.mood = 'happy';
        }
      }
      const r = PICKUP_RADIUS[item.kind] + (s.hero.id === 'alon' ? 0.06 : 0);
      if (item.z < PLAYER_FRONT + r && item.z > PLAYER_BACK - r && Math.abs(item.x - p.x) < r + s.hero.hitHalfW) {
        item.collected = true;
        item.collectedT = 0;
        this.onPickup(item);
      }
    }
  }

  private onPickup(item: PickupEntity): void {
    const s = this.state;
    const p = s.player;
    switch (item.kind) {
      case 'bolt': {
        const boltMult = this.boltBase + this.mods.boltBonus;
        const amount = boltMult > 1 && this.rng.chance(boltMult - 1) ? 2 : 1;
        s.boltsCollected += amount;
        s.tally.coins += amount;
        this.chainBolt();
        if (s.tutorial !== null) {
          s.tutorial.bolts += 1;
        }
        if (s.goal !== null && s.goal.kind === 'bolts' && !s.goal.done) {
          s.goal.progress += amount;
          this.checkGoal();
        }
        break;
      }
      case 'wrench':
        if (p.dents > 0) {
          p.dents -= 1;
          this.emit({ type: 'repair', by: 'wrench' });
        }
        break;
      case 'postcard':
        s.postcardFound = true;
        break;
      case 'part':
        if (s.kiko !== null && s.kiko.maxEngine !== null && s.kiko.engine < s.kiko.maxEngine) {
          s.kiko.engine += 1;
          this.emit({ type: 'kikoFixed' });
        }
        break;
      case 'spark':
        if (s.boss !== null) {
          s.boss.sparks = Math.min(3, s.boss.sparks + 1);
          this.emit({ type: 'spark', count: s.boss.sparks });
        }
        break;
      case 'powerup':
        if (item.power !== null) {
          this.grantPower(item.power);
        }
        break;
    }
    this.emit({ type: 'pickup', kind: item.kind, power: item.power });
  }

  /** One more Bolt in a row. Five make a chain. */
  private chainBolt(): void {
    const s = this.state;
    const c = s.chain;
    c.count += 1;
    c.t = 0;
    if (c.count < CHAIN_LENGTH) {
      return;
    }
    c.count = 0;
    c.total += 1;
    s.tally.chains += 1;
    this.emit({ type: 'chain', total: c.total });
    if (s.hero.id === 'ligaya') {
      s.rhythm = Math.min(3, s.rhythm + 1);
    }
    const kape = s.sidekicks.find((k) => k.id === 'kape');
    if (kape !== undefined && kape.cooldown <= 0 && this.kapeTotal < KAPE_RUN_CAP && s.player.cooldown > 0) {
      const off = Math.min(kape.stats.power, KAPE_RUN_CAP - this.kapeTotal, s.player.cooldown);
      s.player.cooldown -= off;
      this.kapeTotal += off;
      kape.cooldown = kape.stats.cooldown;
      this.addZap('sip', kape.slot, s.player.x, 0);
      this.react(kape, 'happy', { type: 'sidekick', id: kape.id, slot: kape.slot, action: 'sip' });
    }
    const piko = s.sidekicks.find((k) => k.id === 'piko');
    if (piko !== undefined && c.total % piko.stats.count === 0 && this.bonusBolts < BONUS_BOLTS_CAP) {
      // Plain Bolts in the bank: no goal, chain or unlock counts them.
      const bonus = Math.min(piko.stats.power, BONUS_BOLTS_CAP - this.bonusBolts);
      this.bonusBolts += bonus;
      s.boltsCollected += bonus;
      this.react(piko, 'celebrate', { type: 'sidekick', id: piko.id, slot: piko.slot, action: 'coins' });
    }
  }

  private end(outcome: 'success' | 'failure', reason: 'arrived' | 'defeated' | 'dents' | 'kiko' | 'banked'): void {
    const s = this.state;
    if (s.ending !== null) {
      return;
    }
    s.ending = { outcome, t: outcome === 'failure' ? 1.1 : 1.4, reason, route: Math.floor(s.route) };
    for (const mate of s.sidekicks) {
      mate.mood = outcome === 'success' ? 'celebrate' : 'worried';
      mate.reactT = 0;
    }
    this.emit({ type: 'ending', outcome, reason });
  }

  // -- short goals ---------------------------------------------------------------------

  private checkGoal(): void {
    const g = this.state.goal;
    if (g === null || g.done || g.failed) {
      return;
    }
    if (g.kind !== 'clean' && g.progress >= g.count) {
      this.completeGoal();
    }
  }

  private completeGoal(): void {
    const s = this.state;
    const g = s.goal!;
    g.done = true;
    s.goalsDone += 1;
    const t = s.tally;
    t.goals += 1;
    if (g.kind === 'foes') {
      t.scoutGoals += 1;
    } else if (g.kind === 'bolts') {
      t.courierGoals += 1;
    }
    if (s.weather.kind !== 'none') {
      t.weatherGoals += 1;
    }
    if (s.mood === 'lantern') {
      t.eveningGoals += 1;
    }
    if (s.dim) {
      t.duskGoals += 1;
    }
    for (const mate of s.sidekicks) {
      mate.mood = 'celebrate';
      mate.reactT = 0;
    }
    this.emit({ type: 'goalDone', text: g.text });
  }

  // -- checkpoints -----------------------------------------------------------------------

  /** Reaching a safe stop: what it counts for, and Sinta's booked repair comes good. */
  private reachedCheckpoint(): void {
    const s = this.state;
    const p = s.player;
    s.tally.checkpoints += 1;
    if (p.maxDents !== null && p.dents === p.maxDents - 1) {
      s.tally.lowHealthCheckpoints += 1;
    }
    if (s.repairBooked && !s.repairSpent && p.dents > 0 && s.repairsUsed < REPAIR_CAP) {
      p.dents -= 1;
      s.repairsUsed += 1;
      s.repairBooked = false;
      s.repairSpent = true;
      this.emit({ type: 'repair', by: 'hero' });
    }
  }

  /** The three offers for a checkpoint, from what the run does not have yet. */
  private offers(exclude: readonly RunUpgradeId[] = []): RunUpgradeId[] {
    const s = this.state;
    const available = RUN_UPGRADE_IDS.filter((id) => !s.runUpgrades.includes(id) && !exclude.includes(id) && !(id === 'secondWind' && (s.player.dents === 0 || s.repairsUsed >= REPAIR_CAP)));
    const options: RunUpgradeId[] = [];
    const pool = [...available];
    while (options.length < 3 && pool.length > 0 && s.runUpgrades.length < RUN_UPGRADE_CAP) {
      const index = Math.floor(this.rng.next() * pool.length);
      options.push(pool.splice(index, 1)[0]);
    }
    return options;
  }

  /**
   * Duwi: reshuffles the open checkpoint's offers. The new offer replaces the old
   * in the state, so nothing about closing the panel can draw again, and the count
   * only goes down. Returns false when there is nothing left to spend.
   */
  reroll(): boolean {
    const s = this.state;
    if (s.choice === null || s.rerollsLeft <= 0 || s.choice.options.length === 0) {
      return false;
    }
    let next = this.offers(s.choice.options);
    if (next.length < s.choice.options.length) {
      // Not enough new ones left: top up from the old offer rather than show fewer.
      const top = s.choice.options.filter((id) => !next.includes(id));
      next = [...next, ...top].slice(0, s.choice.options.length);
    }
    s.rerollsLeft -= 1;
    s.choice.options = next;
    this.emit({ type: 'reroll' });
    return true;
  }

  /** Opens a checkpoint: three different temporary upgrades the run does not have yet. */
  private openChoice(): void {
    const s = this.state;
    this.reachedCheckpoint();
    const canBank = s.mission.kind === 'endless';
    const options = this.offers();
    if (options.length === 0 && !canBank) {
      return;
    }
    s.choice = { options, canBank };
    this.emit({ type: 'checkpoint', options });
  }

  /**
   * Closes the checkpoint with the player's pick (or none). Endless can bank
   * the run here instead. The road ahead of a checkpoint is always empty.
   */
  choose(id: RunUpgradeId | null, bank = false): void {
    const s = this.state;
    if (s.choice === null) {
      return;
    }
    const allowed = id === null || s.choice.options.includes(id);
    if (!allowed) {
      return;
    }
    const canBank = s.choice.canBank;
    s.choice = null;
    if (bank && canBank) {
      this.end('success', 'banked');
      return;
    }
    if (id !== null) {
      this.applyRunUpgrade(id);
    }
    // Bibing's warm send-off.
    const bibing = s.sidekicks.find((k) => k.id === 'bibing');
    if (bibing !== undefined) {
      this.protect(bibing.stats.power);
      this.react(bibing, 'happy', { type: 'sidekick', id: bibing.id, slot: bibing.slot, action: 'sendoff' });
    }
    if (this.section?.kind === 'checkpoint') {
      this.nextAt = s.distance + 10;
      this.enterSection(s.sectionIndex + 1);
    }
  }

  private applyRunUpgrade(id: RunUpgradeId): void {
    const s = this.state;
    if (s.runUpgrades.includes(id) || s.runUpgrades.length >= RUN_UPGRADE_CAP) {
      return;
    }
    s.runUpgrades.push(id);
    s.tally.upgradesChosen += 1;
    // Everything numeric comes from one place, the same one the checkpoint card printed.
    const before = this.mods;
    this.mods = runMods(s.runUpgrades);
    this.lateral = this.baseLateral * this.mods.steering;
    this.params.lateral = this.fairLateral(s.hero.id);
    s.warningLead += this.mods.warning - before.warning;
    if (s.player.maxDents !== null) {
      s.player.maxDents += this.mods.dents - before.dents;
    }
    if (id === 'secondWind' && s.player.dents > 0 && s.repairsUsed < REPAIR_CAP) {
      s.player.dents -= 1;
      s.repairsUsed += 1;
    }
    this.emit({ type: 'runUpgrade', id });
  }

  // -- sections ---------------------------------------------------------------------

  private enterSection(index: number): void {
    const s = this.state;
    // Endless: the road goes on - add the next cycle when the last one is reached.
    if (s.mission.kind === 'endless' && index >= s.mission.sections.length) {
      this.endlessCycles += 1;
      let at = this.sectionStarts.length > 0 ? this.lastSectionEnd() : 0;
      // Endless drives through every mood, one per cycle; it changes at the safe stop.
      this.moodNow = endlessMood(this.endlessCycles);
      s.mood = this.moodNow.mood;
      s.dim = this.moodNow.dim;
      s.weather = { kind: this.moodNow.weather, phase: 'calm', t: 8 + this.extras.next() * 6, dir: 1 };
      this.params.lateral = this.fairLateral(s.hero.id);
      for (const section of endlessCycle(this.endlessCycles)) {
        s.mission.sections.push(section);
        this.sectionStarts.push(at);
        if (section.kind === 'patterns' || section.kind === 'arrive') {
          at += section.length;
        }
      }
      s.routeLength = at;
    }
    // Leaving a stretch of road without a dent: that counts, whatever its goal was.
    if (this.section?.kind === 'patterns') {
      if (this.stretchHits === 0) {
        s.tally.cleanStretches += 1;
        if (s.weather.kind !== 'none') {
          s.tally.weatherCleanStretches += 1;
        }
      }
      this.stretchHits = 0;
    }
    // A goal not finished by the end of its stretch: a clean stretch counts as done.
    const previous = s.goal;
    if (previous !== null && !previous.done) {
      if (previous.kind === 'clean' && !previous.failed) {
        this.completeGoal();
      }
    }
    s.goal = null;
    s.sectionIndex = index;
    const section = this.section;
    if (section === undefined) {
      return;
    }
    this.emit({ type: 'section', kind: section.kind, index });
    if (section.kind === 'tutorial') {
      s.tutorial = { step: 'steer', t: 0, sawLeft: false, sawRight: false, bolts: 0, spawned: false, bumps: 0, retries: 0, zapped: 0 };
      this.emit({ type: 'tutorialStep', step: 'steer' });
    } else if (section.kind === 'rescue') {
      s.rescue = { phase: 'slowing', t: 0, progress: 0, aligned: false };
      // Whatever is still beside or behind the convoy as it pulls over can no longer reach it.
      for (const h of s.hazards) {
        if (!h.spent && h.z < PLAYER_FRONT) {
          h.spent = true;
        }
      }
      this.emit({ type: 'rescue', phase: 'slowing' });
    } else if (section.kind === 'checkpoint') {
      // Opened from sectionLogic once the road is clear (the overlay promises a safe stop).
      this.checkpointWait = 0;
      this.checkpointOpened = false;
    } else if (section.kind === 'boss') {
      s.boss = {
        phase: 1,
        stage: 'intro',
        t: 0,
        jam: 100,
        z: BOSS_Z,
        sway: 0,
        gears: [-1, 0, 1].map((x) => ({ x, state: 'closed' as const, t: 0, flash: 0 })),
        cycleT: 0,
        cycleLane: 0,
        throwT: 1.2,
        pending: null,
        pulseT: 0,
        sparks: 0,
        sparkT: 0,
        hurtT: 9,
        telegraph: [],
        telegraphOpen: null,
        breakDropped: false,
        hits: 0,
        breakChoiceDone: false,
      };
      this.emit({ type: 'bossStage', phase: 1, stage: 'intro' });
    } else if (section.kind === 'patterns') {
      if (!Number.isFinite(this.nextAt) || this.nextAt < s.distance + 8) {
        this.nextAt = s.distance + 8;
      }
      if (section.goal !== undefined) {
        s.goal = { ...section.goal, progress: 0, done: false, failed: false };
        this.emit({ type: 'goal', text: section.goal.text });
      }
    }
  }

  private lastSectionEnd(): number {
    const sections = this.state.mission.sections;
    const last = sections.length - 1;
    const section = sections[last];
    return this.sectionStarts[last] + (section.kind === 'patterns' || section.kind === 'arrive' ? section.length : 0);
  }

  private sectionLogic(dt: number): void {
    const s = this.state;
    const section = this.section;
    if (section === undefined) {
      return;
    }
    this.placeGantries();
    switch (section.kind) {
      case 'tutorial':
        this.tutorialLogic(dt);
        break;
      case 'patterns':
        this.placePatterns();
        if (s.route >= this.sectionStarts[s.sectionIndex] + section.length) {
          this.enterSection(s.sectionIndex + 1);
        }
        break;
      case 'rescue':
        this.rescueLogic(dt);
        break;
      case 'checkpoint':
        if (!this.checkpointOpened) {
          this.checkpointWait += dt;
          if (this.checkpointWait > 6) {
            // Slow traffic still alongside after 6 s steers off to the shoulder.
            this.clearRoad(null);
          }
          if (this.roadClear()) {
            this.checkpointOpened = true;
            this.openChoice();
            if (s.choice === null) {
              // Nothing to offer: drive straight on.
              this.nextAt = s.distance + 10;
              this.enterSection(s.sectionIndex + 1);
            }
          }
        }
        break;
      case 'arrive':
        if (s.route >= this.sectionStarts[s.sectionIndex] + section.length - 0.5) {
          this.end('success', 'arrived');
        }
        break;
      case 'boss':
        this.bossLogic(dt);
        break;
    }
    if (section.kind !== 'boss' && section.kind !== 'tutorial' && s.mission.kind !== 'endless') {
      const fraction = s.route / s.routeLength;
      for (const mark of [0.5, 0.85]) {
        if (fraction >= mark && !this.progressMarks.has(mark)) {
          this.progressMarks.add(mark);
          this.emit({ type: 'progress', mark });
        }
      }
    }
  }

  private placeGantries(): void {
    const s = this.state;
    const list = s.mission.gantries;
    if (this.section?.kind === 'tutorial') {
      return;
    }
    while (this.gantriesPlaced < list.length) {
      const g = list[this.gantriesPlaced];
      const z = g.at - s.route;
      if (z > SPAWN_Z) {
        break;
      }
      this.gantriesPlaced += 1;
      if (z > 4) {
        s.gantries.push({ id: this.nextId++, z, title: g.title, sub: g.sub });
        this.emit({ type: 'gantry', title: g.title });
      }
    }
  }

  /** The obstacles on the road, for the fairness check (bots count, zapped or not). */
  private obstacles(): Obstacle[] {
    const s = this.state;
    const out: Obstacle[] = [];
    for (const h of s.hazards) {
      if (h.spent || h.practice) {
        continue;
      }
      const o = obstacleFor(h.kind, h.x, h.z, Math.max(s.speed, this.targetSpeed()));
      const lc = h.laneChange;
      if (lc !== null && !lc.done) {
        const approach = o.approach;
        const signalT = lc.signalAt !== null ? s.time - lc.signalAt : Math.max(0, (h.z - LANE_CHANGE.signalZ) / approach);
        const startT =
          lc.moveAt !== null
            ? -(s.time - lc.moveAt)
            : lc.signalAt !== null
              ? LANE_CHANGE.signalSeconds - (s.time - lc.signalAt)
              : signalT + LANE_CHANGE.signalSeconds;
        o.x = lc.fromX;
        o.laneChange = { toX: lc.toX, signalT: lc.signalAt !== null ? 0 : signalT, startT, duration: LANE_CHANGE.duration };
      }
      out.push(o);
    }
    return out;
  }

  private world(): PlacementWorld {
    const s = this.state;
    return {
      speed: Math.max(s.speed, this.targetSpeed()),
      player: { x: s.player.x, vx: s.player.vx },
      kiko: s.kiko !== null ? { x: s.kiko.x, vx: s.kiko.vx, z: s.kiko.z } : null,
      obstacles: this.obstacles(),
    };
  }

  /** Where placement must stop: before the next rescue, checkpoint, arrival or boss section. */
  private placementLimit(): number {
    const s = this.state;
    const sections = s.mission.sections;
    for (let i = s.sectionIndex + 1; i < sections.length; i += 1) {
      if (sections[i].kind !== 'patterns') {
        return this.routeOrigin + this.sectionStarts[i] - GATE_MARGIN - (s.kiko !== null ? KIKO_GAP + 4 : 0);
      }
    }
    return Number.POSITIVE_INFINITY;
  }

  private sectionAtRoute(route: number): SectionDef | undefined {
    const sections = this.state.mission.sections;
    let found: SectionDef | undefined;
    for (let i = 0; i < sections.length; i += 1) {
      const kind = sections[i].kind;
      if (kind === 'tutorial' || kind === 'rescue' || kind === 'checkpoint') {
        continue;
      }
      if (this.sectionStarts[i] <= route) {
        found = sections[i];
      }
    }
    return found;
  }

  private placePatterns(): void {
    const s = this.state;
    const spawnAhead = SPAWN_Z + s.warningLead * s.baseSpeed;
    const limit = this.placementLimit();
    let guard = 0;
    while (this.nextAt - s.distance <= spawnAhead && guard < 4) {
      guard += 1;
      const routeAt = this.nextAt - this.routeOrigin;
      const section = this.sectionAtRoute(routeAt);
      if (section === undefined || section.kind !== 'patterns') {
        return;
      }
      // Never nearer than the spawn line: nothing appears in the middle of the road.
      if (this.nextAt - s.distance < SPAWN_Z) {
        this.nextAt = s.distance + SPAWN_Z;
      }
      const startZ = this.nextAt - s.distance;
      const world = this.world();
      let variant: Variant | null = null;

      // The postcard: its own little stretch, on its lane, with nothing in the way.
      const card = s.mission.postcard;
      if (card !== null && !this.postcardPlaced && routeAt >= card.at - 10) {
        this.postcardPlaced = true;
        variant = {
          patternId: 'postcard',
          mirrored: false,
          shift: 0,
          stretch: 0,
          length: 6,
          items: [
            { kind: 'postcard', x: card.lane, dz: 2 },
            { kind: 'bolt', x: -card.lane, dz: 0 },
            { kind: 'bolt', x: -card.lane, dz: 2.4 },
          ],
        };
      } else if (s.player.dents > 0 && s.time - this.lastWrenchAt > (s.hero.id === 'sinta' ? 10 : 14)) {
        variant = fairVariantOf(this.rng, 'wrench-gift', world, startZ, this.params);
        if (variant !== null) {
          this.lastWrenchAt = s.time;
        }
      } else if (s.kiko !== null && s.kiko.maxEngine !== null && s.kiko.engine < s.kiko.maxEngine && s.time - this.lastPartAt > 11) {
        variant = fairVariantOf(this.rng, 'convoy-part', world, startZ, this.params);
        if (variant !== null) {
          this.lastPartAt = s.time;
        }
      }
      if (variant === null) {
        const pools = this.poolsFor(section);
        const choice = choosePattern(this.rng, pools, world, startZ, this.params);
        variant = choice.variant;
        if (choice.fallback) {
          s.fallbacks += 1;
          this.emit({ type: 'fallback' });
        }
      }
      if (this.nextAt + variant.length > limit) {
        // No room before the next gate: leave the rest of this stretch empty.
        this.nextAt = Number.POSITIVE_INFINITY;
        return;
      }
      this.spawnVariant(variant, startZ, false);
      const gap = this.rng.range(section.gap[0], section.gap[1]) / (s.preset.density * (this.options.scenario?.densityScale ?? 1));
      this.nextAt += variant.length + gap * s.baseSpeed;
    }
  }

  private poolsFor(section: Extract<SectionDef, { kind: 'patterns' }>): { tag: PatternTag; weight: number }[] {
    const scenario = this.options.scenario;
    if (scenario === null) {
      return section.pools;
    }
    // The snapshot shifts the mix toward (or away from) traffic.
    return section.pools.map((p) => (p.tag === 'traffic' ? { ...p, weight: p.weight * scenario.trafficWeight } : p));
  }

  private makeHazard(kind: HazardKind | FoeKind, x: number, z: number, practice: boolean, toX?: number): HazardEntity {
    const spec = specOf(kind);
    const hp = isFoeKind(kind) ? FOES[kind].hp + (practice ? 0 : this.mods.foeExtraHp) : 0;
    return {
      id: this.nextId++,
      kind,
      x,
      z,
      halfW: spec.halfW,
      len: spec.len,
      ownSpeed: spec.ownSpeed,
      thrown: spec.thrown,
      spent: false,
      clearedHero: false,
      clearedKiko: false,
      practice,
      knocked: -1,
      knockDir: 0,
      laneChange: toX !== undefined ? { fromX: x, toX, signalAt: null, moveAt: null, done: false } : null,
      hp,
      maxHp: hp,
      hurtT: 99,
      stun: 0,
      slowT: 0,
      marked: 0,
      counted: false,
    };
  }

  private spawnVariant(variant: Variant, startZ: number, practice: boolean): void {
    const s = this.state;
    for (const item of variant.items) {
      const z = startZ + item.dz;
      if (item.kind === 'sign') {
        s.signs.push({ id: this.nextId++, sign: item.sign ?? 'closure', x: item.x, z, openX: item.openX ?? item.x });
      } else if (isHazardKind(item.kind) || isFoeKind(item.kind)) {
        s.hazards.push(this.makeHazard(item.kind, item.x, z, practice, item.toX));
      } else if (item.kind === 'powerup') {
        // Capsules rotate through the four powers in order: predictable, never a lottery.
        const power = item.power ?? POWER_ROTATION[this.powerCount++ % POWER_ROTATION.length];
        s.pickups.push({ id: this.nextId++, kind: 'powerup', power, x: item.x, z, collected: false, collectedT: -1, hidden: false, revealed: false, passed: false });
      } else {
        s.pickups.push({ id: this.nextId++, kind: item.kind, power: null, x: item.x, z, collected: false, collectedT: -1, hidden: false, revealed: false, passed: false });
      }
    }
  }

  private spawnPickup(kind: PickupKind, x: number, z: number): void {
    this.state.pickups.push({ id: this.nextId++, kind, power: null, x, z, collected: false, collectedT: -1, hidden: false, revealed: false, passed: false });
  }

  // -- tutorial -----------------------------------------------------------------------

  private tutorialLogic(dt: number): void {
    const s = this.state;
    const tut = s.tutorial!;
    tut.t += dt;
    const advance = (step: TutorialStep): void => {
      tut.step = step;
      tut.t = 0;
      tut.spawned = false;
      tut.retries = 0;
      this.emit({ type: 'tutorialStep', step });
    };
    const anyAhead = (kind: PickupKind | 'cone' | 'bot'): boolean =>
      kind === 'cone'
        ? s.hazards.some((h) => h.practice && h.maxHp === 0 && h.z + h.len > PLAYER_BACK)
        : kind === 'bot'
          ? s.hazards.some((h) => h.practice && h.maxHp > 0 && !h.spent && h.z + h.len > PLAYER_BACK)
          : s.pickups.some((p) => p.kind === kind && !p.collected && p.z > PLAYER_BACK - 0.5);

    switch (tut.step) {
      case 'steer':
        if (s.player.x < -0.55) {
          tut.sawLeft = true;
        }
        if (s.player.x > 0.55) {
          tut.sawRight = true;
        }
        if (tut.sawLeft && tut.sawRight && tut.t > 1) {
          advance('bolts');
        }
        break;
      case 'bolts': {
        if (!tut.spawned) {
          tut.spawned = true;
          const lane = s.player.x > 0.3 ? -1 : s.player.x < -0.3 ? 1 : 1;
          for (let i = 0; i < 5; i += 1) {
            this.spawnPickup('bolt', lane, TUTORIAL_Z + i * 2.6);
          }
        }
        if (tut.bolts >= 3) {
          advance('cones');
        } else if (!anyAhead('bolt')) {
          tut.spawned = false;
          tut.retries += 1;
        }
        break;
      }
      case 'cones': {
        if (!tut.spawned) {
          tut.spawned = true;
          const rows: [number, number][] = [
            [-1, 0],
            [0, 1],
            [-1, 1],
          ];
          rows.forEach((lanes, i) => {
            for (const lane of lanes) {
              s.hazards.push(this.makeHazard('cone', lane, TUTORIAL_Z + i * 20, true));
            }
          });
        }
        if (tut.t > 2 && !anyAhead('cone')) {
          advance('pulse');
        }
        break;
      }
      case 'pulse': {
        // Two practice bots straight ahead: the horn fires by itself, so just line up.
        if (!tut.spawned) {
          tut.spawned = true;
          const lane = Math.max(-1, Math.min(1, Math.round(s.player.x)));
          s.hazards.push(this.makeHazard('conebot', lane, TUTORIAL_Z, true));
          s.hazards.push(this.makeHazard('conebot', lane === 1 ? 0 : lane + 1, TUTORIAL_Z + 14, true));
        }
        if (tut.zapped >= 2 || (tut.t > 2 && !anyAhead('bot') && tut.retries >= 1)) {
          advance('wrench');
        } else if (tut.t > 2 && !anyAhead('bot')) {
          tut.spawned = false;
          tut.retries += 1;
          tut.t = 0;
        }
        break;
      }
      case 'wrench': {
        if (!tut.spawned) {
          tut.spawned = true;
          this.spawnPickup('wrench', 0, TUTORIAL_Z);
        }
        const got = s.pickups.some((p) => p.kind === 'wrench' && p.collected);
        if (got || (tut.t > 2 && !anyAhead('wrench') && tut.retries >= 1)) {
          advance('go');
        } else if (tut.t > 2 && !anyAhead('wrench')) {
          tut.spawned = false;
          tut.retries += 1;
        }
        break;
      }
      case 'go':
        if (tut.t > 2.6) {
          s.tutorial = null;
          // Clean slate for the real road: practice pick-ups, cones and bots go.
          s.hazards = s.hazards.filter((h) => !h.practice);
          this.routeOrigin = s.distance;
          s.route = 0;
          this.nextAt = s.distance + 10;
          this.enterSection(s.sectionIndex + 1);
        }
        break;
    }
  }

  // -- convoy rescue ----------------------------------------------------------------------

  private rescueLogic(dt: number): void {
    const s = this.state;
    const r = s.rescue!;
    const k = s.kiko!;
    r.t += dt;
    switch (r.phase) {
      case 'slowing':
        if (r.t >= RESCUE_SLOW_S && s.speed < 0.2 && Math.abs(k.z + KIKO_RESCUE_GAP) < 0.3) {
          r.phase = 'align';
          r.t = 0;
          this.emit({ type: 'rescue', phase: 'align' });
        }
        break;
      case 'align':
        r.aligned = Math.abs(s.player.x - k.x) < 0.16;
        if (r.aligned) {
          // Steady alignment fills it; drifting away only pauses it. No mashing, no timer.
          r.progress = Math.min(1, r.progress + dt / RESCUE_HOLD_S);
        }
        if (r.progress >= 1) {
          r.phase = 'push';
          r.t = 0;
          this.emit({ type: 'rescue', phase: 'push' });
        }
        break;
      case 'push':
        if (r.t >= RESCUE_PUSH_S) {
          k.engine = k.maxEngine ?? k.engine;
          // Nothing was recorded while they were parked: start his trail afresh, a straight line
          // from where he is to where Navie is, so he does not chase old positions.
          k.trail = [
            { d: s.distance + k.z - 4, x: k.x },
            { d: s.distance + k.z, x: k.x },
            { d: s.distance, x: s.player.x },
          ];
          // Everything left from before the lay-by moved on timing the fairness check never saw:
          // what drove on ahead has taken an exit, and what drifted alongside the bay is harmless
          // as they pull out. The road ahead starts fresh.
          s.hazards = s.hazards.filter((h) => h.spent || h.z <= PLAYER_FRONT);
          for (const h of s.hazards) {
            h.spent = true;
          }
          r.phase = 'resume';
          r.t = 0;
          this.emit({ type: 'rescue', phase: 'resume' });
          this.emit({ type: 'kikoFixed' });
        }
        break;
      case 'resume':
        if (r.t >= RESCUE_RESUME_S) {
          s.rescue = null;
          this.nextAt = s.distance + 6;
          this.enterSection(s.sectionIndex + 1);
        }
        break;
    }
  }

  // -- finale ---------------------------------------------------------------------------------

  /**
   * Haring Barrikada. Intro, then three phases with a safe break (wrench, and
   * a checkpoint choice) between them:
   *  1. one gear opens at a time, shifting lanes - line up and the horn does the rest;
   *  2. both side gears open together while barrier sweeps come through - the
   *     hero can only cover one side, so the sidekicks' attacks matter;
   *  3. overheat: the core stays open but only a Team Honk finishes it. Three
   *     signal sparks charge it (they keep coming after a miss); when charged
   *     the button becomes TEAM HONK (it fires by itself after a few seconds).
   * The Jam meter counts DOWN from 100; at 0 the plaza reopens.
   */
  private bossLogic(dt: number): void {
    const s = this.state;
    const b = s.boss!;
    b.t += dt;
    b.hurtT += dt;
    b.sway = Math.sin(s.time * 0.9) * 0.35;
    for (const gear of b.gears) {
      gear.flash = Math.max(0, gear.flash - dt);
    }

    switch (b.stage) {
      case 'intro':
        if (b.t >= 3.2) {
          b.stage = 'fight';
          b.t = 0;
          this.emit({ type: 'bossStage', phase: b.phase, stage: 'fight' });
        }
        break;
      case 'fight':
        this.cycleGears(dt);
        this.machineThrows(dt);
        if (b.phase === 3) {
          this.offerSparks(dt);
        }
        break;
      case 'break':
        if (!b.breakDropped) {
          b.breakDropped = true;
          this.spawnPickup('wrench', 0, 22);
          if (b.phase === 3) {
            const card = s.mission.postcard;
            if (card !== null) {
              this.spawnPickup('postcard', this.rng.chance(0.5) ? -1 : 1, 30);
            }
          }
        }
        // A safe checkpoint: nothing is thrown during a break.
        if (!b.breakChoiceDone && b.t >= 1.2) {
          b.breakChoiceDone = true;
          this.openChoice();
          if (s.choice !== null) {
            return;
          }
        }
        if (b.t >= 4) {
          b.stage = 'fight';
          b.t = 0;
          b.cycleT = 0;
          b.throwT = 1.4;
          this.emit({ type: 'bossStage', phase: b.phase, stage: 'fight' });
        }
        break;
      case 'honkReady':
        // Waiting for the button (or the automatic assist); never a soft-lock.
        if (b.t >= HONK_AUTO_S) {
          this.startHonk();
        }
        break;
      case 'honk':
        if (b.t >= 1.6 && b.jam > 0) {
          b.jam = 0;
          b.hurtT = 0;
          s.pulses.push({ id: this.nextId++, x: 0, z: PLAYER_FRONT, big: true, damage: 0, from: 'hero', tx: null, lat: 0, travelled: 0, base: false });
          this.addZap('honk', -1, 0, b.z);
          s.teamHonk = true;
          this.emit({ type: 'teamHonk' });
        }
        if (b.t >= 3.0) {
          b.stage = 'down';
          b.t = 0;
          this.emit({ type: 'bossStage', phase: b.phase, stage: 'down' });
        }
        break;
      case 'down':
        if (b.t >= 1.2) {
          this.end('success', 'defeated');
        }
        break;
    }
  }

  private startHonk(): void {
    const s = this.state;
    const b = s.boss;
    if (b === null || b.stage !== 'honkReady') {
      return;
    }
    b.stage = 'honk';
    b.t = 0;
    for (const mate of s.sidekicks) {
      mate.mood = 'celebrate';
      mate.action = 1;
      mate.reactT = 0;
    }
    this.emit({ type: 'bossStage', phase: 3, stage: 'honk' });
  }

  private cycleGears(dt: number): void {
    const b = this.state.boss!;
    if (b.phase === 3) {
      // Overheated: the core stays open, but only a Team Honk finishes it.
      for (const gear of b.gears) {
        gear.state = gear.x === 0 ? 'open' : 'closed';
      }
      return;
    }
    b.cycleT -= dt;
    const telegraph = 0.9;
    const open = b.phase === 1 ? 3.0 : 2.6;
    const closed = b.phase === 1 ? 0.7 : 1.4;
    if (b.cycleT <= 0) {
      // Next cycle.
      const lanes = b.phase === 1 ? [this.nextGearLane(b.cycleLane)] : [-1, 1];
      b.cycleLane = lanes[0];
      for (const gear of b.gears) {
        gear.state = lanes.includes(gear.x) ? 'telegraph' : 'closed';
        gear.t = 0;
      }
      b.cycleT = telegraph + open + closed;
    }
    const elapsed = telegraph + open + closed - b.cycleT;
    for (const gear of b.gears) {
      if (gear.state === 'closed' && gear.t === 0 && elapsed < telegraph) {
        continue;
      }
      gear.t += dt;
      if (gear.state === 'telegraph' && elapsed >= telegraph) {
        gear.state = 'open';
        this.emit({ type: 'gearOpen' });
      } else if (gear.state === 'open' && elapsed >= telegraph + open) {
        gear.state = 'closed';
      }
    }
  }

  private nextGearLane(previous: number): number {
    const options = [-1, 0, 1].filter((lane) => lane !== previous);
    return this.rng.pick(options);
  }

  private machineThrows(dt: number): void {
    const s = this.state;
    const b = s.boss!;
    if (b.phase === 3 && b.sparks >= 3) {
      return;
    }
    if (b.pending !== null) {
      b.pending.release -= dt;
      if (b.pending.release <= 0) {
        this.spawnVariant(b.pending.variant, b.z - 1, false);
        b.pending = null;
        b.telegraph = [];
        b.telegraphOpen = null;
      }
      return;
    }
    b.throwT -= dt;
    if (b.throwT > 0) {
      return;
    }
    const story = s.preset.id === 'story';
    // Scouting counts in the finale too: half of the team's and Lookout's extra warning lengthens the telegraph.
    const scouting = Math.max(0, s.warningLead - s.preset.warning - this.options.settings.warningBoost);
    const telegraphS = (b.phase === 2 ? 1.0 : 0.9) + (story ? 0.4 : 0) + this.options.settings.warningBoost * 0.5 + scouting * 0.5;
    const pool: PatternTag = b.phase === 1 ? 'boss1' : b.phase === 2 ? 'boss2' : 'boss3';
    // Checked as if already thrown `telegraphS` earlier: the warning is the reaction window.
    const world = this.world();
    // 1.15 = the slowest thrown item, so the check is never more lenient than the throw.
    const probe = b.z - 1 + world.speed * 1.15 * telegraphS;
    const choice = choosePattern(this.rng, [{ tag: pool, weight: 1 }], world, probe, this.params, 3);
    if (!choice.fallback) {
      const lanes = choice.variant.items.filter((i) => isHazardKind(i.kind)).map((i) => i.x);
      const sign = choice.variant.items.find((i) => i.kind === 'sign');
      // Signs ride on the machine, not the road.
      const variant: Variant = { ...choice.variant, items: choice.variant.items.filter((i) => i.kind !== 'sign') };
      b.pending = { variant, release: telegraphS, lanes, openX: sign?.openX ?? null };
      b.telegraph = lanes;
      b.telegraphOpen = sign?.openX ?? null;
    }
    const every = (b.phase === 1 ? 1.9 : b.phase === 2 ? 2.3 : 2.6) / s.preset.density;
    b.throwT = every;
  }

  private offerSparks(dt: number): void {
    const s = this.state;
    const b = s.boss!;
    if (b.sparks >= 3) {
      if (b.stage === 'fight') {
        b.stage = 'honkReady';
        b.t = 0;
        b.pending = null;
        b.telegraph = [];
        // The charge is full: nothing can still hit the team while the button waits (no late failure).
        this.clearRoad('honk');
        this.emit({ type: 'bossStage', phase: 3, stage: 'honkReady' });
      }
      return;
    }
    // One spark at a time, always another after a miss: the charge can never become impossible.
    const onRoad = s.pickups.some((p) => p.kind === 'spark' && !p.collected && p.z > PLAYER_BACK);
    if (onRoad) {
      return;
    }
    b.sparkT -= dt;
    if (b.sparkT > 0) {
      return;
    }
    b.sparkT = 2.4;
    // In front of the machine (visible at once), in a lane with nothing arriving around the spark's
    // time and not one the machine is about to throw into.
    const z = b.z - 2;
    const lanes = [-1, 0, 1].filter(
      (lane) =>
        !b.telegraph.includes(lane) &&
        !(b.pending !== null && b.pending.lanes.includes(lane)) &&
        !s.hazards.some((h) => !h.spent && Math.abs(h.x - lane) < h.halfW + 0.4 && Math.abs(h.z - z) < 9),
    );
    if (lanes.length > 0) {
      this.spawnPickup('spark', this.rng.pick(lanes), z);
    }
  }

  // -- housekeeping -----------------------------------------------------------------------------

  private recycle(): void {
    const s = this.state;
    s.hazards = s.hazards.filter((h) => h.z + h.len > DESPAWN_Z && (h.knocked < 0 || h.knocked < (h.ownSpeed > 0 && h.maxHp === 0 ? 2.6 : 1.4)));
    s.pickups = s.pickups.filter((p) => (p.collected ? p.collectedT < 0.5 : p.z > DESPAWN_Z));
    s.signs = s.signs.filter((sign) => sign.z > DESPAWN_Z);
    s.gantries = s.gantries.filter((g) => g.z > DESPAWN_Z);
  }

  private measureDanger(): void {
    const s = this.state;
    let count = 0;
    for (const h of s.hazards) {
      if (h.spent || h.practice) {
        continue;
      }
      const approach = s.speed * (1 - h.ownSpeed + h.thrown);
      if (approach <= 0) {
        continue;
      }
      const t = (h.z - PLAYER_FRONT) / approach;
      if (t > 0 && t < 1.6 && Math.abs(h.x - s.player.x) < 1.1) {
        count += 1;
      } else if (s.kiko !== null) {
        const tk = (h.z - (s.kiko.z + KIKO_FRONT)) / approach;
        if (tk > 0 && tk < 1.2 && Math.abs(h.x - s.kiko.x) < 0.8) {
          count += 1;
        }
      }
    }
    if (s.boss !== null && s.boss.pending !== null) {
      count += 1;
    }
    s.danger = Math.min(1, count / 2);
  }

  // -- results ----------------------------------------------------------------------------------

  /**
   * Mission progress 0-1 for the HUD bar: the route travelled, or in the
   * finale the Jam LEFT (it counts down - the bar empties as you win).
   * Endless: progress to the next checkpoint.
   */
  progress(): number {
    const s = this.state;
    if (s.boss !== null) {
      return s.boss.jam / 100;
    }
    if (s.tutorial !== null) {
      return 0;
    }
    if (s.mission.kind === 'endless') {
      return Math.max(0, Math.min(1, (s.route % 700) / 700));
    }
    return Math.max(0, Math.min(1, s.route / s.routeLength));
  }

  result(runId: string, outcome: 'success' | 'failure' | 'abandoned'): RunResult {
    const s = this.state;
    const tally: Tally = {
      ...s.tally,
      bots: s.foesDefeated,
      metres: Math.round(s.tally.metres),
      shieldBlocks: s.shieldBlocks,
      collectionRuns: outcome === 'success' && s.postcardFound ? 1 : 0,
    };
    return {
      tally,
      runId,
      missionId: s.mission.id,
      seed: s.seed,
      difficulty: s.preset.id,
      outcome,
      hero: s.hero.id,
      sidekicks: [...this.options.loadout.sidekicks],
      boltsCollected: s.boltsCollected,
      foesDefeated: s.foesDefeated,
      dents: s.player.dents,
      maxDents: s.player.maxDents,
      shieldBlocks: s.shieldBlocks,
      repairsUsed: s.repairsUsed,
      kikoEngineLeft: s.kiko !== null ? s.kiko.engine : null,
      kikoEngineMax: s.kiko !== null ? s.kiko.maxEngine ?? s.kiko.engine : null,
      teamHonk: s.teamHonk,
      postcardFound: s.postcardFound,
      goalsDone: s.goalsDone,
      distance: s.ending !== null ? s.ending.route : Math.floor(s.route),
      durationS: s.time,
    };
  }
}
