import type { HeroId, MissionId, PowerUpKind, SidekickId } from './types';

/**
 * Tollbound Heroes: who can drive, who can fly along, and the rules that keep
 * any team fair. One hero (a playable car with its own handling, automatic
 * horn pulses and a signature ability on the button) plus two sidekicks
 * (small hovering companions that act on their own). Everything here is data
 * and pure functions; the simulation reads it, the screens describe it.
 *
 * Stacking rules and caps (enforced in sim.ts with these numbers):
 * - Protection never stacks in time: shield, bubble and the like take the
 *   LONGER of the two, never the sum, and no window exceeds PROTECTION_CAP_S.
 *   Bantay's guard does not recharge while any protection is up.
 * - Repairs that are not road wrenches are capped per run (REPAIR_CAP).
 * - Damage multipliers multiply but are capped (DAMAGE_MULT_CAP); so is
 *   magnet reach (MAGNET_CAP) and warning lead from the team (WARNING_TEAM_CAP).
 * - A run's loadout is fixed when it starts.
 */

export const PROTECTION_CAP_S = 6;
export const REPAIR_CAP = 3;
export const DAMAGE_MULT_CAP = 2;
export const MAGNET_CAP = 2;
export const WARNING_TEAM_CAP = 1;

// -- heroes -------------------------------------------------------------------

export interface HeroDef {
  id: HeroId;
  name: string;
  role: string;
  /** One line of personality (from the story). */
  blurb: string;
  /** Steering speed as a share of the difficulty's. */
  steer: number;
  /** Half-width of the hitbox (lanes). */
  hitHalfW: number;
  /** Seconds between automatic horn pulses, damage per pulse, and how they fly. */
  pulse: { every: number; damage: number; pattern: 'single' | 'twin' };
  /** Extra dents before failing (Jepoy is sturdy). */
  extraDents: number;
  /** Extra warning seconds (Kiko scouts). */
  warning: number;
  /** `short` is the Team screen's one line; `text` is the full rule the briefing and pause menu give. */
  signature: { name: string; text: string; short: string; seconds: number; cooldown: number };
  strength: string;
  tradeOff: string;
  /** 0-5 for the Team screen comparison bars. */
  stats: { steering: number; toughness: number; power: number; scouting: number };
  /** How the hero is earned. */
  unlock: { after: MissionId | null; text: string };
}

export const HERO_DEFS: Record<HeroId, HeroDef> = {
  navie: {
    id: 'navie',
    name: 'Navie',
    role: 'All-rounder',
    blurb: "SmartFlow's guide: cheerful, quick to help, always finds the way.",
    steer: 1,
    hitHalfW: 0.26,
    pulse: { every: 0.34, damage: 1, pattern: 'single' },
    extraDents: 0,
    warning: 0,
    signature: {
      name: 'Route Sense',
      text: 'The road slows to 60% for 4 s and a green arrow shows the clearest lane. Your steering stays full speed.',
      short: 'Slows the road and shows the clearest lane.',
      seconds: 4,
      cooldown: 18,
    },
    strength: 'Balanced handling.',
    tradeOff: 'No protection.',
    stats: { steering: 3, toughness: 2, power: 3, scouting: 3 },
    unlock: { after: null, text: 'From the start' },
  },
  jepoy: {
    id: 'jepoy',
    name: 'Kuya Jepoy',
    role: 'Protector',
    blurb: 'Loud, warm big brother of the road; the town band rides in the back.',
    steer: 0.88,
    hitHalfW: 0.3,
    pulse: { every: 0.46, damage: 1.6, pattern: 'single' },
    extraDents: 1,
    warning: 0,
    signature: {
      name: "Kuya's Shield",
      text: 'A 4 s honk-shield: hazards and bots bounce off, and bounced bots take a hit.',
      short: 'Hazards and bots bounce off for 4 s.',
      seconds: 4,
      cooldown: 16,
    },
    strength: 'One extra dent, heavy horn.',
    tradeOff: 'Steers slower, a little wider.',
    stats: { steering: 2, toughness: 5, power: 4, scouting: 1 },
    unlock: { after: 'm1-garage', text: 'Joins after "Out of the Garage"' },
  },
  kiko: {
    id: 'kiko',
    name: 'Kiko',
    role: 'Scout & tech',
    blurb: "Shy, careful and clever with tools; Lola's lanterns ride in the back.",
    steer: 1.1,
    hitHalfW: 0.22,
    pulse: { every: 0.28, damage: 0.4, pattern: 'twin' },
    extraDents: 0,
    warning: 0.6,
    signature: {
      name: 'Gear Scan',
      text: 'For 5 s every bot and open gear is marked and takes double damage.',
      short: 'Marks bots and gears for double damage.',
      seconds: 5,
      cooldown: 16,
    },
    strength: 'Nimble, earlier warnings.',
    tradeOff: 'Weakest horn.',
    stats: { steering: 5, toughness: 1, power: 2, scouting: 5 },
    unlock: { after: 'm2-convoy', text: "Joins after \"Kiko's Convoy\"" },
  },
};

/** Missions a hero cannot drive (story reasons), with why. */
export function heroBlockedFor(hero: HeroId, mission: MissionId): string | null {
  if (hero === 'kiko' && (mission === 'm2-convoy' || mission === 'sta-rita' || mission === 'angeles')) {
    return 'Kiko is the one being escorted in this mission.';
  }
  return null;
}

// -- sidekicks -----------------------------------------------------------------

export type SidekickRole = 'shot' | 'chain' | 'magnet' | 'repair' | 'guard' | 'scout' | 'sweep' | 'bolts' | 'pierce' | 'charge' | 'slow' | 'heavy';

export interface SidekickStats {
  /** Seconds between actions (0 = always on). */
  cooldown: number;
  /** Reach ahead (units) or radius (lanes, for the magnet). */
  range: number;
  /** Damage per hit, or seconds of effect, depending on the role. */
  power: number;
  /** Targets per action, or uses per run. */
  count: number;
}

export interface SidekickDef {
  id: SidekickId;
  name: string;
  evolvedName: string;
  role: SidekickRole;
  roleLabel: string;
  blurb: string;
  base: SidekickStats;
  evolved: SidekickStats;
  /** Plain-language rules for the Collection screen. */
  describe: (s: SidekickStats) => { what: string; range: string; cooldown: string; targets: string; limits: string };
  /** What the evolution changes, in one line. */
  evolution: string;
  unlock: { after: MissionId | 'endless-1000' | null; text: string };
  /** Short reactions it says on the radio. */
  barks: { action: string[]; hurt: string; cheer: string };
}

const sec = (n: number): string => `${n % 1 === 0 ? n : n.toFixed(1)} s`;

export const SIDEKICK_DEFS: Record<SidekickId, SidekickDef> = {
  pip: {
    id: 'pip',
    name: 'Pip',
    evolvedName: 'Pip Turbo',
    role: 'shot',
    roleLabel: 'Focused shots',
    blurb: 'A tricycle that learned to fly. Eager, quick, never sits still.',
    base: { cooldown: 1.1, range: 30, power: 1, count: 1 },
    evolved: { cooldown: 0.85, range: 34, power: 1, count: 2 },
    describe: (s) => ({
      what: `Fires ${s.count === 1 ? 'a dart' : `${s.count} darts`} at the nearest bot or open gear ahead.`,
      range: `${s.range} m ahead, any lane`,
      cooldown: sec(s.cooldown),
      targets: "Barrikada's bots and open gears only - never traffic",
      limits: 'One target per dart; cannot hit what is behind the car.',
    }),
    evolution: 'Pip Turbo: two darts per volley, faster reload, longer reach.',
    unlock: { after: null, text: 'From the start' },
    barks: { action: ['Pip-pip! Got it!', 'Bullseye!', 'Next one!'], hurt: 'Whoa, careful!', cheer: 'Pip-pip-hooray!' },
  },
  bumbo: {
    id: 'bumbo',
    name: 'Bumbo',
    evolvedName: 'Bumbo Max',
    role: 'chain',
    roleLabel: 'Chain zaps',
    blurb: 'A chubby little bus with a horn-dish. Jolly, loud, loves a crowd.',
    base: { cooldown: 3.2, range: 26, power: 1, count: 2 },
    evolved: { cooldown: 2.6, range: 30, power: 1, count: 3 },
    describe: (s) => ({
      what: `A zap that chains across up to ${s.count} bots or open gears at once.`,
      range: `${s.range} m ahead, all lanes`,
      cooldown: sec(s.cooldown),
      targets: 'Bots and open gears only',
      limits: 'Waits until at least one target is in range; weak against a single tough bot.',
    }),
    evolution: 'Bumbo Max: chains to 3 targets and recharges faster.',
    unlock: { after: 'm3-finale', text: 'Joins after "Jam at Bocaue Barrier"' },
    barks: { action: ['BZZT! Sabay-sabay!', 'Zap party!', 'Kuryente!'], hurt: 'Aray, my dish!', cheer: 'Honk honk hooray!' },
  },
  mila: {
    id: 'mila',
    name: 'Mila',
    evolvedName: 'Mila Maxi',
    role: 'magnet',
    roleLabel: 'Pick-up magnet',
    blurb: 'A scooter with a magnet for handlebars. Cheerful, collects everything.',
    base: { cooldown: 0, range: 1.1, power: 0, count: 0 },
    evolved: { cooldown: 0, range: 1.6, power: 1, count: 0 },
    describe: (s) => ({
      what: s.power > 0 ? 'Pulls Bolts, parts and power-up capsules toward you.' : 'Pulls Bolts and parts toward you.',
      range: `${s.range} lanes around the car, from 8 m ahead`,
      cooldown: 'Always on',
      targets: s.power > 0 ? 'Bolts, wrenches, parts, sparks, power-ups' : 'Bolts, wrenches, parts, sparks',
      limits: 'Never pulls hazards; capped at 2 lanes with power-ups.',
    }),
    evolution: 'Mila Maxi: wider pull, and catches power-up capsules too.',
    unlock: { after: null, text: 'From the start' },
    barks: { action: ['Shiny! Mine!', 'Come to Mila!', 'Magnet time!'], hurt: 'Eep!', cheer: 'So many Bolts!' },
  },
  kumpuni: {
    id: 'kumpuni',
    name: 'Kumpuni',
    evolvedName: 'Kumpuni Pro',
    role: 'repair',
    roleLabel: 'Repairs',
    blurb: 'A fussy little repair kart. Cannot see a dent without fixing it.',
    base: { cooldown: 35, range: 0, power: 0, count: 1 },
    evolved: { cooldown: 26, range: 0, power: 0, count: 2 },
    describe: (s) => ({
      what: 'Fixes one dent when you have one and its tools are ready.',
      range: 'Your car',
      cooldown: sec(s.cooldown),
      targets: 'Dents',
      limits: `${s.count} repair${s.count === 1 ? '' : 's'} per run; all non-wrench repairs together are capped at ${REPAIR_CAP}.`,
    }),
    evolution: 'Kumpuni Pro: two repairs per run and a shorter wait.',
    unlock: { after: 'm2-convoy', text: "Built in Kiko's workshop after the convoy" },
    barks: { action: ['Tsk, a dent. Fixed!', 'Good as new, po!', 'Hold still...'], hurt: 'My toolbox!', cheer: 'Not a scratch!' },
  },
  bantay: {
    id: 'bantay',
    name: 'Bantay',
    evolvedName: 'Bantay Gold',
    role: 'guard',
    roleLabel: 'Guard',
    blurb: 'A brave bulldog of a patrol scooter. Takes the hit so you do not.',
    base: { cooldown: 24, range: 0, power: 0, count: 1 },
    evolved: { cooldown: 18, range: 0, power: 0, count: 1 },
    describe: (s) => ({
      what: 'Holds a guard charge that absorbs one hit, then recharges.',
      range: 'Your car',
      cooldown: `${sec(s.cooldown)} to recharge`,
      targets: 'Hazards, bots and thrown objects',
      limits: 'One charge at a time; does not recharge while another shield is up.',
    }),
    evolution: 'Bantay Gold: recharges in 18 s instead of 24.',
    unlock: { after: 'm1-garage', text: 'Joins after "Out of the Garage"' },
    barks: { action: ['Arf! Blocked!', 'Not on my watch!', 'Bantay is here!'], hurt: 'Grr...', cheer: 'Good team! Arf!' },
  },
  silip: {
    id: 'silip',
    name: 'Silip',
    evolvedName: 'Silip Radar',
    role: 'scout',
    roleLabel: 'Scout & jam',
    blurb: 'A curious camera drone. Peeks around every corner first.',
    base: { cooldown: 10, range: 40, power: 0.4, count: 1 },
    evolved: { cooldown: 7, range: 48, power: 0.7, count: 1 },
    describe: (s) => ({
      what: `Warnings come ${s.power} s earlier, and it jams the most dangerous bot now and then.`,
      range: `${s.range} m ahead`,
      cooldown: sec(s.cooldown),
      targets: 'Bots and the machine; never traffic',
      limits: `Team warning bonus capped at ${WARNING_TEAM_CAP} s. A jam means double damage for 1.5 s, or the machine's next throw delayed.`,
    }),
    evolution: 'Silip Radar: earlier warnings and jams more often.',
    unlock: { after: 'endless-1000', text: 'Reach 1,000 m in Endless Expressway (or clear the Snapshot Challenge)' },
    barks: { action: ['Silip sees it!', 'Jammed!', 'Peekaboo!'], hurt: 'My lens!', cheer: 'Clear road ahead!' },
  },
  walis: {
    id: 'walis',
    name: 'Walis',
    evolvedName: 'Walis Turbo',
    role: 'sweep',
    roleLabel: 'Road sweeper',
    blurb: 'A tidy little street sweeper. Cannot stand a cone out of place.',
    base: { cooldown: 12, range: 16, power: 0, count: 1 },
    evolved: { cooldown: 9, range: 20, power: 0, count: 2 },
    describe: (s) => ({
      what: `Sweeps ${s.count === 1 ? 'the nearest cone or barrier' : `the ${s.count} nearest cones or barriers`} out of your lane.`,
      range: `${s.range} m ahead, your lane`,
      cooldown: sec(s.cooldown),
      targets: 'Cones and barriers only - not traffic, potholes or bots',
      limits: 'Only what is really in your way; waits if the lane is clear.',
    }),
    evolution: 'Walis Turbo: sweeps two at a time, sooner and from further away.',
    unlock: { after: 'tambubong', text: 'Joins at Tambubong' },
    barks: { action: ['Swish! All clean!', 'Out of the way, cone!', 'Spotless!'], hurt: 'My bristles!', cheer: 'What a tidy road!' },
  },
  barya: {
    id: 'barya',
    name: 'Barya',
    evolvedName: 'Barya Ginto',
    role: 'bolts',
    roleLabel: 'Bolt finder',
    blurb: 'A flying toll coin. Counts everything, twice, for fun.',
    base: { cooldown: 0, range: 0, power: 0.25, count: 0 },
    evolved: { cooldown: 0, range: 0, power: 0.5, count: 0 },
    describe: (s) => ({
      what: `+${Math.round(s.power * 100)}% Bolts from pick-ups: about one Bolt in ${Math.round(1 / s.power)} counts double.`,
      range: 'Every Bolt you pick up',
      cooldown: 'Always on',
      targets: 'Bolts',
      limits: 'Adds to Bolt Rush; does not help in a fight.',
    }),
    evolution: 'Barya Ginto: +50% Bolts instead of +25%.',
    unlock: { after: 'balagtas', text: 'Joins at Balagtas' },
    barks: { action: ['Ka-ching!', 'One more for the bank!', 'I counted that!'], hurt: 'My shine!', cheer: 'We are rich!' },
  },
  sibat: {
    id: 'sibat',
    name: 'Sibat',
    evolvedName: 'Sibat Kidlat',
    role: 'pierce',
    roleLabel: 'Piercing shot',
    blurb: 'A thin little dart of a jet. Fast, serious, never misses a line.',
    base: { cooldown: 6, range: 38, power: 1, count: 1 },
    evolved: { cooldown: 4.5, range: 44, power: 1.5, count: 1 },
    describe: (s) => ({
      what: 'A lance up the busiest lane hits every bot and gear in it.',
      range: `${s.range} m ahead, one lane`,
      cooldown: sec(s.cooldown),
      targets: 'Bots and open gears only - never traffic',
      limits: 'Waits until a target is in range; one lane per shot.',
    }),
    evolution: 'Sibat Kidlat: harder hits, faster reload, longer reach.',
    unlock: { after: 'pulilan', text: 'Joins at Pulilan' },
    barks: { action: ['Straight through!', 'Whoosh!', 'In a line, please.'], hurt: 'Off target!', cheer: 'Bullseye, all of them!' },
  },
  tala: {
    id: 'tala',
    name: 'Tala',
    evolvedName: 'Tala Liwanag',
    role: 'charge',
    roleLabel: 'Signature charger',
    blurb: 'A tiny parol star that never went out. Warm, calm, always glowing.',
    base: { cooldown: 0, range: 0, power: 0.25, count: 0 },
    evolved: { cooldown: 0, range: 0, power: 0.5, count: 0 },
    describe: (s) => ({
      what: `Your hero's signature recharges ${Math.round(s.power * 100)}% faster.`,
      range: 'Your car',
      cooldown: 'Always on',
      targets: 'Your signature',
      limits: 'Not while the signature is on; does not make it last longer.',
    }),
    evolution: 'Tala Liwanag: the signature recharges 50% faster instead of 25%.',
    unlock: { after: 'san-fernando', text: 'Joins at San Fernando' },
    barks: { action: ['Almost ready!', 'Shine on!', 'Charged with light!'], hurt: 'My flame!', cheer: 'All the stars are out!' },
  },
  ilaw: {
    id: 'ilaw',
    name: 'Ilaw',
    evolvedName: 'Ilaw Bantay',
    role: 'slow',
    roleLabel: 'Emergency red light',
    blurb: 'A pocket traffic light. Very strict, very kind, loves a safe road.',
    base: { cooldown: 22, range: 9, power: 1.5, count: 1 },
    evolved: { cooldown: 16, range: 11, power: 2, count: 1 },
    describe: (s) => ({
      what: `Slows the road for ${s.power} s just before a hit, and shows the clearest lane.`,
      range: `${s.range} m ahead, your lane`,
      cooldown: sec(s.cooldown),
      targets: 'Anything that can hit you, traffic included',
      limits: 'Does not stack with Route Sense: the longer of the two counts.',
    }),
    evolution: 'Ilaw Bantay: a longer hold, sooner, and it spots trouble earlier.',
    unlock: { after: 'angeles', text: 'Joins at Angeles' },
    barks: { action: ['Red light! Slow down!', 'Stop! Look! Steer!', 'Easy, easy!'], hurt: 'My lamps!', cheer: 'Green light, everyone!' },
  },
  maso: {
    id: 'maso',
    name: 'Maso',
    evolvedName: 'Maso Bigat',
    role: 'heavy',
    roleLabel: 'Heavy hitter',
    blurb: 'A small mallet with a big swing. Few words, very large opinions.',
    base: { cooldown: 5, range: 24, power: 3, count: 1 },
    evolved: { cooldown: 4, range: 28, power: 4.5, count: 1 },
    describe: (s) => ({
      what: `Slams the toughest bot or open gear ahead for ${s.power} damage.`,
      range: `${s.range} m ahead, any lane`,
      cooldown: sec(s.cooldown),
      targets: 'Bots and open gears only - never traffic',
      limits: 'One target per swing; slow between swings.',
    }),
    evolution: 'Maso Bigat: a heavier swing, more often, from further away.',
    unlock: { after: 'dau', text: 'Joins at Dau' },
    barks: { action: ['BONK!', 'Hammer time!', 'Hold still.'], hurt: 'Ow, my handle!', cheer: 'Nailed it!' },
  },
};

export function sidekickStats(id: SidekickId, evolved: boolean): SidekickStats {
  const def = SIDEKICK_DEFS[id];
  return evolved ? def.evolved : def.base;
}

// -- evolution -----------------------------------------------------------------

/** What evolving a sidekick costs. Predictable and earned: no random draws, no duplicates. */
export const EVOLVE_COST = { xp: 150, cores: 2, bolts: 80 };

/** XP each equipped sidekick earns from a committed run. */
export const SIDEKICK_XP = { success: 40, failure: 15, firstClear: 20 };

/** Gear Cores (the evolution material) per mission: first completion, then each later win. */
export const CORE_REWARDS: Partial<Record<MissionId, { first: number; replay: number }>> = {
  'm1-garage': { first: 1, replay: 1 },
  'm2-convoy': { first: 2, replay: 1 },
  'm3-finale': { first: 3, replay: 1 },
  'bocaue-interchange': { first: 1, replay: 0 },
  tambubong: { first: 1, replay: 0 },
  tabang: { first: 1, replay: 0 },
  balagtas: { first: 1, replay: 0 },
  'sta-rita': { first: 2, replay: 0 },
  pulilan: { first: 1, replay: 0 },
  'san-simon': { first: 1, replay: 0 },
  'san-fernando': { first: 3, replay: 1 },
  mexico: { first: 1, replay: 0 },
  angeles: { first: 2, replay: 0 },
  dau: { first: 1, replay: 0 },
  sctex: { first: 1, replay: 0 },
  'sta-ines': { first: 3, replay: 1 },
  snapshot: { first: 1, replay: 0 },
  endless: { first: 0, replay: 0 },
};

/** Endless distance milestones that pay a Gear Core the first time they are reached. */
export const ENDLESS_MILESTONES = [1000, 2000, 3000];

// -- in-run power-ups and checkpoint upgrades ----------------------------------------

export const POWERUP_DEFS: Record<PowerUpKind, { name: string; seconds: number; text: string }> = {
  spread: { name: 'Spread Horn', seconds: 8, text: 'Pulses fan out into three lanes.' },
  magnet: { name: 'Bolt Magnet', seconds: 10, text: 'Pick-ups fly to you from twice as far.' },
  bubble: { name: 'Bubble Shield', seconds: 4, text: 'Hazards bounce off. Never stacks past 6 s.' },
  rally: { name: 'Sidekick Rally', seconds: 8, text: 'Sidekicks act twice as often.' },
};

export type RunUpgradeId = 'wideHorn' | 'overclock' | 'boltRush' | 'sturdy' | 'squadDrill' | 'lookout' | 'secondWind';

export interface RunUpgradeDef {
  id: RunUpgradeId;
  name: string;
  gain: string;
  cost: string;
}

/** Temporary: they last only for the current run and are offered at safe checkpoints. */
export const RUN_UPGRADES: Record<RunUpgradeId, RunUpgradeDef> = {
  wideHorn: { id: 'wideHorn', name: 'Wide Horn', gain: 'Pulses also hit the lanes beside yours.', cost: 'Each pulse does 25% less damage.' },
  overclock: { id: 'overclock', name: 'Overclock', gain: 'Pulses fire 30% faster.', cost: 'Steering 8% slower.' },
  boltRush: { id: 'boltRush', name: 'Bolt Rush', gain: '+50% Bolts from pick-ups.', cost: 'Bots take one more hit.' },
  sturdy: { id: 'sturdy', name: 'Sturdy Frame', gain: '+1 dent before the run fails.', cost: 'Steering 10% slower.' },
  squadDrill: { id: 'squadDrill', name: 'Squad Drill', gain: 'Sidekicks act 25% more often.', cost: 'Signature recharges 25% slower.' },
  lookout: { id: 'lookout', name: 'Lookout', gain: 'Warnings 0.4 s earlier.', cost: 'Pulses do 15% less damage.' },
  secondWind: { id: 'secondWind', name: 'Second Wind', gain: 'Fixes a dent right now.', cost: 'Power-ups last 30% shorter.' },
};

export const RUN_UPGRADE_IDS = Object.keys(RUN_UPGRADES) as RunUpgradeId[];
/** At most this many run upgrades in one run. */
export const RUN_UPGRADE_CAP = 4;
