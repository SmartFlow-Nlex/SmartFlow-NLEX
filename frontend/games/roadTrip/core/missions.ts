import type { PatternTag } from './patterns';
import type { MachineId, MissionId } from './types';

/**
 * A short goal shown during a stretch of road ("Zap 6 bots", "Grab 15 Bolts",
 * "No dents for this stretch"). Done goals pay a small bonus.
 */
export interface GoalDef {
  kind: 'foes' | 'bolts' | 'clean';
  count: number;
  text: string;
}

/**
 * The whole story is one road: Balintawak to Sta. Ines, every NLEX exit.
 * Exits are real and in real order (frontend/constants/nlexSegments.ts,
 * checked by a test); distances are compressed for play and the story events
 * are fictional - the map says so.
 */

export type SectionDef =
  /** Interactive tutorial: scripted steps, nothing can dent the car. */
  | { kind: 'tutorial' }
  | {
      kind: 'patterns';
      length: number;
      /** Pools to draw from, with weights. */
      pools: { tag: PatternTag; weight: number }[];
      /** Seconds of empty road between patterns at density 1 (scaled by the preset). */
      gap: [number, number];
      goal?: GoalDef;
    }
  /** A safe stop on an empty stretch: the game freezes and offers three temporary upgrades. */
  | { kind: 'checkpoint' }
  /** Convoy: Kiko stalls; a protected lay-by where Navie lines up and pushes. */
  | { kind: 'rescue' }
  /** Last stretch: no hazards, the exit sign, the slow-down. */
  | { kind: 'arrive'; length: number }
  /** Finale encounter, driven by the encounter's own phases. */
  | { kind: 'boss' };

export interface Gantry {
  /** Distance into the mission. */
  at: number;
  title: string;
  sub: string;
}

export interface Postcard {
  id: string;
  title: string;
  caption: string;
  /** Distance into the mission where it lies on the road. */
  at: number;
  lane: number;
}

export interface MissionDef {
  id: MissionId;
  /** Its stop along the road, from 1; 0 for the side modes (Snapshot, Endless). */
  number: number;
  /** Boss missions: which road machine is at the end of this stretch. */
  machine?: MachineId;
  title: string;
  kind: 'journey' | 'convoy' | 'finale' | 'scenario' | 'endless';
  kindLabel: string;
  from: string;
  to: string;
  /** Lighting of the drive. */
  time: 'morning' | 'noon' | 'sunset';
  objective: string;
  win: string;
  fail: string;
  /** Short rules shown on the briefing and in the pause menu. */
  rules: string[];
  sections: SectionDef[];
  gantries: Gantry[];
  postcard: Postcard | null;
  rewards: { firstClear: number; replay: number };
  requires: MissionId | null;
  scenes: { before: string | null; after: string | null };
}

const JOURNEY_POOLS = (hard: boolean): { tag: PatternTag; weight: number }[] => [
  { tag: 'easy', weight: hard ? 2 : 5 },
  { tag: 'medium', weight: hard ? 4 : 2 },
  { tag: 'traffic', weight: 2 },
  { tag: 'pickup', weight: 2 },
  ...(hard ? [{ tag: 'hard' as PatternTag, weight: 1.5 }] : []),
];

const ROAD_RULES = [
  'Steer around cones, barriers, potholes and slower traffic.',
  "Your horn pulses fire by themselves: they zap the jam gang's purple bots (never traffic). Bots drop Bolts.",
  'Wrenches fix one dent. A postcard hides on this road - optional.',
];

/** What a stretch of road is mostly made of. */
type RoadMix = 'balanced' | 'roadworks' | 'bots' | 'traffic' | 'scenic';

function roadPools(mix: RoadMix, tier: number): { tag: PatternTag; weight: number }[] {
  const lean = (name: RoadMix, amount: number): number => (mix === name ? amount : 0);
  return [
    { tag: 'easy', weight: Math.max(1, 4 - tier) + lean('roadworks', 2) + lean('scenic', 2) },
    { tag: 'medium', weight: 2 + tier * 0.5 + lean('roadworks', 3) },
    { tag: 'hard', weight: tier * 0.5 },
    { tag: 'traffic', weight: 2 + lean('traffic', 4) },
    { tag: 'bots', weight: 3 + lean('bots', 3) - lean('roadworks', 1.5) },
    { tag: 'mixed', weight: 1 + tier * 0.4 + lean('bots', 1) },
    { tag: 'pickup', weight: 1.5 + lean('scenic', 2) },
    { tag: 'powerup', weight: 0.6 },
  ];
}

interface LegOptions {
  id: MissionId;
  title: string;
  from: string;
  to: string;
  /** Real kilometres between the two exits, for the signs. */
  km: number;
  time: MissionDef['time'];
  /** 1 (just past Bocaue) to 5 (the last exits): how busy the road is. */
  tier: number;
  mix?: RoadMix;
  objective: string;
  goals: [GoalDef, GoalDef];
  postcard: Omit<Postcard, 'at'>;
  rewards: MissionDef['rewards'];
  scenes: MissionDef['scenes'];
}

/** The gaps between patterns, by how far north the road is. */
const legGap = (tier: number): [number, number] => [Math.max(0.75, 1.15 - tier * 0.07), Math.max(1.05, 1.55 - tier * 0.07)];

/** A drive between two exits: a busy stretch, a safe checkpoint, a busier one, then the exit. */
function leg(number: number, requires: MissionId, o: LegOptions): MissionDef {
  const first = 500 + o.tier * 15;
  const second = 520 + o.tier * 20;
  const mix = o.mix ?? 'balanced';
  return {
    id: o.id,
    number,
    title: o.title,
    kind: 'journey',
    kindLabel: 'Journey',
    from: o.from,
    to: o.to,
    time: o.time,
    objective: o.objective,
    win: `Reach the ${o.to} exit.`,
    fail: 'Too many dents before the exit.',
    rules: ROAD_RULES,
    sections: [
      { kind: 'patterns', length: first, pools: roadPools(mix, Math.max(0, o.tier - 1)), gap: legGap(o.tier - 1), goal: o.goals[0] },
      { kind: 'checkpoint' },
      { kind: 'patterns', length: second, pools: roadPools(mix, o.tier), gap: legGap(o.tier), goal: o.goals[1] },
      { kind: 'arrive', length: 150 },
    ],
    gantries: [
      { at: 120, title: o.to, sub: `${o.km} km` },
      { at: first + second - 60, title: o.to, sub: 'Exit' },
    ],
    postcard: { ...o.postcard, at: Math.round(first + second * 0.45) },
    rewards: o.rewards,
    requires,
    scenes: o.scenes,
  };
}

/** Kiko drives behind you again, with something fragile on board. */
function convoyLeg(number: number, requires: MissionId, o: LegOptions & { rescue: boolean; rules: string[]; win: string }): MissionDef {
  const sections: SectionDef[] = [
    { kind: 'patterns', length: 220, pools: [{ tag: 'convoyLearn', weight: 3 }, { tag: 'convoy', weight: 2 }, { tag: 'pickup', weight: 1 }], gap: [2.0, 2.6] },
    {
      kind: 'patterns',
      length: 420,
      pools: [{ tag: 'convoy', weight: 4 }, { tag: 'traffic', weight: 1 }, { tag: 'pickup', weight: 1 }, { tag: 'convoyPart', weight: 1 }, { tag: 'bots', weight: 2 }],
      gap: [1.5, 2.1],
      goal: o.goals[0],
    },
    ...(o.rescue ? ([{ kind: 'rescue' }] as SectionDef[]) : []),
    { kind: 'checkpoint' },
    {
      kind: 'patterns',
      length: 520,
      pools: [{ tag: 'convoy', weight: 5 }, { tag: 'traffic', weight: 1.5 }, { tag: 'pickup', weight: 1 }, { tag: 'convoyPart', weight: 1 }, { tag: 'bots', weight: 2 }, { tag: 'mixed', weight: 1.5 }],
      gap: [1.25, 1.85],
      goal: o.goals[1],
    },
    { kind: 'arrive', length: 150 },
  ];
  return {
    id: o.id,
    number,
    title: o.title,
    kind: 'convoy',
    kindLabel: 'Convoy',
    from: o.from,
    to: o.to,
    time: o.time,
    objective: o.objective,
    win: o.win,
    fail: "Kiko's engine gives out, or too many dents.",
    rules: o.rules,
    sections,
    gantries: [
      { at: 120, title: o.to, sub: `${o.km} km` },
      { at: 1100, title: o.to, sub: 'Exit' },
    ],
    postcard: { ...o.postcard, at: 900 },
    rewards: o.rewards,
    requires,
    scenes: o.scenes,
  };
}

const CONVOY_RULES = [
  'Kiko drives right behind you, on the path you drive.',
  'He steers slower than you: change lanes early and smoothly.',
  "Gear pick-ups fix Kiko's engine.",
];

const BOSS_RULES = [
  'Fantasy showdown: your horn pulses and your sidekicks hit only the machine and its bots.',
  'Line up with an OPEN gear (bright ring + target mark) to knock the Jam meter down. Dodge what it throws.',
  'Three phases, each announced, with a safe break between. Phase 3: grab 3 signal sparks, then press TEAM HONK.',
];

export const MISSIONS: Record<MissionId, MissionDef> = {
  'm1-garage': {
    id: 'm1-garage',
    number: 1,
    title: 'Out of the Garage',
    kind: 'journey',
    kindLabel: 'Journey',
    from: 'Balintawak',
    to: 'Meycauayan',
    time: 'morning',
    objective: 'Drive from Balintawak to Meycauayan.',
    win: 'Reach the Meycauayan exit.',
    fail: 'Too many dents before the exit.',
    rules: [
      'Steer around cones, barriers, potholes and slower traffic.',
      "Your horn pulses fire by themselves: they zap Barrikada's purple bots (never traffic). Bots drop Bolts.",
      'Bolts are your reward currency. Wrenches fix one dent. A postcard hides on the road - optional.',
    ],
    sections: [
      { kind: 'tutorial' },
      {
        kind: 'patterns',
        length: 520,
        pools: [{ tag: 'easy', weight: 5 }, { tag: 'pickup', weight: 3 }, { tag: 'traffic', weight: 1 }, { tag: 'bots', weight: 3 }, { tag: 'powerup', weight: 0.6 }],
        gap: [1.1, 1.6],
        goal: { kind: 'bolts', count: 15, text: 'Grab 15 Bolts' },
      },
      { kind: 'checkpoint' },
      {
        kind: 'patterns',
        length: 520,
        pools: [...JOURNEY_POOLS(false), { tag: 'bots', weight: 3 }, { tag: 'mixed', weight: 2 }, { tag: 'powerup', weight: 0.6 }],
        gap: [0.9, 1.4],
        goal: { kind: 'foes', count: 8, text: "Zap 8 of Barrikada's bots" },
      },
      { kind: 'arrive', length: 150 },
    ],
    gantries: [
      { at: 120, title: 'NLEX Harbor Link', sub: 'Valenzuela' },
      { at: 470, title: 'Paso de Blas', sub: 'Valenzuela' },
      { at: 1050, title: 'Meycauayan', sub: 'Exit 1 km' },
    ],
    postcard: {
      id: 'pc-sierra',
      title: 'Morning over the Sierra Madre',
      caption: 'Mountains glowing east of the expressway as the city wakes up.',
      at: 760,
      lane: 1,
    },
    rewards: { firstClear: 60, replay: 20 },
    requires: null,
    scenes: { before: 'opening', after: 'meet-jepoy' },
  },
  'm2-convoy': {
    id: 'm2-convoy',
    number: 2,
    title: "Kiko's Convoy",
    kind: 'convoy',
    kindLabel: 'Convoy & rescue',
    from: 'Marilao',
    to: 'CDV / Ph. Arena',
    time: 'noon',
    objective: 'Guide Kiko and his parol lanterns to the Arena exit.',
    win: 'Bring Kiko to the CDV / Ph. Arena exit.',
    fail: "Kiko's engine gives out, or too many dents.",
    rules: [
      'Kiko drives right behind you, on the path you drive.',
      'He steers slower than you: change lanes early and smoothly.',
      "Kuya's Shield covers both cars. Gear pick-ups fix Kiko's engine.",
    ],
    sections: [
      // Learn: one hazard at a time, wide gaps.
      { kind: 'patterns', length: 200, pools: [{ tag: 'convoyLearn', weight: 4 }, { tag: 'pickup', weight: 1 }], gap: [2.4, 3.0] },
      {
        kind: 'patterns',
        length: 400,
        pools: [{ tag: 'convoy', weight: 4 }, { tag: 'traffic', weight: 1 }, { tag: 'pickup', weight: 1 }, { tag: 'convoyPart', weight: 1 }, { tag: 'bots', weight: 2 }],
        gap: [1.6, 2.2],
        goal: { kind: 'foes', count: 5, text: 'Zap 5 bots before they reach Kiko' },
      },
      { kind: 'rescue' },
      { kind: 'checkpoint' },
      // A calm stretch after the lay-by.
      { kind: 'patterns', length: 120, pools: [{ tag: 'pickup', weight: 1 }, { tag: 'powerup', weight: 0.5 }], gap: [1.4, 1.8] },
      {
        kind: 'patterns',
        length: 520,
        pools: [{ tag: 'convoy', weight: 5 }, { tag: 'traffic', weight: 1.5 }, { tag: 'pickup', weight: 1 }, { tag: 'convoyPart', weight: 1 }, { tag: 'bots', weight: 2 }, { tag: 'mixed', weight: 1.5 }],
        gap: [1.3, 1.9],
        goal: { kind: 'clean', count: 1, text: 'No dents on this stretch' },
      },
      { kind: 'arrive', length: 150 },
    ],
    gantries: [
      { at: 40, title: 'Marilao', sub: 'Exit' },
      { at: 200, title: 'CDV / Ph. Arena', sub: '4 km' },
      { at: 900, title: 'CDV / Ph. Arena', sub: '2 km' },
      { at: 1280, title: 'CDV / Ph. Arena', sub: 'Exit' },
    ],
    postcard: {
      id: 'pc-parol',
      title: "Lola's parol",
      caption: 'A capiz-shell star lantern that slipped off Kiko\'s truck bed.',
      at: 980,
      lane: -1,
    },
    rewards: { firstClear: 80, replay: 25 },
    requires: 'm1-garage',
    scenes: { before: 'meet-kiko', after: 'arena-arrival' },
  },
  'm3-finale': {
    id: 'm3-finale',
    number: 3,
    machine: 'barrikada',
    title: 'Jam at Bocaue Barrier',
    kind: 'finale',
    kindLabel: 'Boss showdown',
    from: 'CDV / Ph. Arena',
    to: 'Bocaue Barrier',
    time: 'sunset',
    objective: "Reset Haring Barrikada's jammed gears and reopen the toll plaza.",
    win: "Empty the machine's Jam meter (it counts DOWN from 100%).",
    fail: 'Too many dents.',
    rules: BOSS_RULES,
    sections: [{ kind: 'boss' }],
    gantries: [],
    postcard: {
      id: 'pc-plaza',
      title: 'Bocaue Barrier at sunset',
      caption: 'The toll plaza, reopened, under an orange sky.',
      at: 0,
      lane: 0,
    },
    rewards: { firstClear: 120, replay: 35 },
    requires: 'm2-convoy',
    scenes: { before: 'machine-reveal', after: 'resolution' },
  },
  'bocaue-interchange': leg(4, 'm3-finale', {
    id: 'bocaue-interchange',
    title: 'The Road North',
    from: 'Bocaue Barrier',
    to: 'Bocaue Interchange',
    km: 1,
    time: 'morning',
    tier: 1,
    objective: 'Set off north, past the reopened barrier, to Bocaue Interchange.',
    goals: [
      { kind: 'bolts', count: 15, text: 'Grab 15 Bolts' },
      { kind: 'foes', count: 8, text: 'Zap 8 bots' },
    ],
    postcard: { id: 'pc-pagoda', title: "Bocaue's river fiesta", caption: 'The floating pagoda the town parades down the Bocaue River each July.', lane: -1 },
    rewards: { firstClear: 70, replay: 25 },
    scenes: { before: 'road-north', after: null },
  }),
  tambubong: leg(5, 'bocaue-interchange', {
    id: 'tambubong',
    title: 'Cones Everywhere',
    from: 'Bocaue Interchange',
    to: 'Tambubong',
    km: 3,
    time: 'morning',
    tier: 1,
    mix: 'roadworks',
    objective: 'Weave through the cones the jam gang left, all the way to Tambubong.',
    goals: [
      { kind: 'clean', count: 1, text: 'No dents on this stretch' },
      { kind: 'bolts', count: 18, text: 'Grab 18 Bolts' },
    ],
    postcard: { id: 'pc-fireworks', title: 'Bocaue fireworks stalls', caption: 'Row after row of stalls, getting ready for New Year.', lane: 1 },
    rewards: { firstClear: 75, replay: 25 },
    scenes: { before: 'to-tambubong', after: 'meet-walis' },
  }),
  tabang: leg(6, 'tambubong', {
    id: 'tabang',
    title: 'Loose Bots at Tabang',
    from: 'Tambubong',
    to: 'Tabang',
    km: 3,
    time: 'noon',
    tier: 2,
    mix: 'bots',
    objective: 'The road machine at Tabang has gone dark. Clear its loose bots and reach the exit.',
    goals: [
      { kind: 'foes', count: 10, text: 'Zap 10 bots' },
      { kind: 'foes', count: 12, text: 'Zap 12 more bots' },
    ],
    postcard: { id: 'pc-nursery', title: 'Guiguinto plant nurseries', caption: 'Green as far as you can see, in the garden town of Bulacan.', lane: 0 },
    rewards: { firstClear: 80, replay: 25 },
    scenes: { before: 'to-tabang', after: null },
  }),
  balagtas: leg(7, 'tabang', {
    id: 'balagtas',
    title: "The Poet's Town",
    from: 'Tabang',
    to: 'Balagtas',
    km: 3,
    time: 'noon',
    tier: 2,
    mix: 'scenic',
    objective: 'Bolts are scattered all over the road to Balagtas. Pick up as many as you can.',
    goals: [
      { kind: 'bolts', count: 22, text: 'Grab 22 Bolts' },
      { kind: 'bolts', count: 25, text: 'Grab 25 more Bolts' },
    ],
    postcard: { id: 'pc-poet', title: 'The town of Balagtas', caption: 'Named for Francisco Balagtas, who wrote Florante at Laura.', lane: -1 },
    rewards: { firstClear: 85, replay: 25 },
    scenes: { before: 'to-balagtas', after: 'meet-barya' },
  }),
  'sta-rita': convoyLeg(8, 'balagtas', {
    id: 'sta-rita',
    title: 'Handle With Care',
    from: 'Balagtas',
    to: 'Sta. Rita',
    km: 3,
    time: 'noon',
    tier: 3,
    rescue: false,
    objective: 'Guide Kiko and a truck full of potted plants to Sta. Rita.',
    win: 'Bring Kiko to the Sta. Rita exit.',
    rules: CONVOY_RULES,
    goals: [
      { kind: 'foes', count: 6, text: 'Zap 6 bots before they reach Kiko' },
      { kind: 'clean', count: 1, text: 'No dents on this stretch' },
    ],
    postcard: { id: 'pc-pots', title: 'Pots along the highway', caption: 'Clay pots and young trees, stacked for sale by the road in Guiguinto.', lane: 1 },
    rewards: { firstClear: 95, replay: 30 },
    scenes: { before: 'to-sta-rita', after: null },
  }),
  pulilan: leg(9, 'sta-rita', {
    id: 'pulilan',
    title: 'Carabao Country',
    from: 'Sta. Rita',
    to: 'Pulilan',
    km: 7,
    time: 'sunset',
    tier: 3,
    objective: 'Keep the farm road clear all the way to Pulilan.',
    goals: [
      { kind: 'foes', count: 10, text: 'Zap 10 bots' },
      { kind: 'clean', count: 1, text: 'No dents on this stretch' },
    ],
    postcard: { id: 'pc-carabao', title: 'The kneeling carabaos', caption: "Pulilan's festival, where carabaos kneel as they pass the church.", lane: 0 },
    rewards: { firstClear: 95, replay: 30 },
    scenes: { before: 'to-pulilan', after: 'meet-sibat' },
  }),
  'san-simon': leg(10, 'pulilan', {
    id: 'san-simon',
    title: 'Into Pampanga',
    from: 'Pulilan',
    to: 'San Simon',
    km: 8,
    time: 'morning',
    tier: 3,
    mix: 'bots',
    objective: 'Cross into Pampanga and push through the jam gang to San Simon.',
    goals: [
      { kind: 'foes', count: 12, text: 'Zap 12 bots' },
      { kind: 'bolts', count: 25, text: 'Grab 25 Bolts' },
    ],
    postcard: { id: 'pc-rice', title: 'Rice fields of San Simon', caption: 'Flat, gold-green fields as you cross from Bulacan into Pampanga.', lane: -1 },
    rewards: { firstClear: 100, replay: 30 },
    scenes: { before: 'to-san-simon', after: null },
  }),
  'san-fernando': {
    id: 'san-fernando',
    number: 11,
    machine: 'prinsipe',
    title: 'Lights Out in San Fernando',
    kind: 'finale',
    kindLabel: 'Boss showdown',
    from: 'San Simon',
    to: 'San Fernando',
    time: 'sunset',
    objective: "Reset Prinsipe Barrikada's jammed gears and bring back the giant lanterns.",
    win: "Empty the machine's Jam meter (it counts DOWN from 100%).",
    fail: 'Too many dents.',
    rules: BOSS_RULES,
    sections: [{ kind: 'boss' }],
    gantries: [],
    postcard: { id: 'pc-lantern', title: 'The giant lanterns', caption: 'San Fernando, the Christmas capital, and its huge parols of light.', at: 0, lane: 0 },
    rewards: { firstClear: 140, replay: 40 },
    requires: 'san-simon',
    scenes: { before: 'prinsipe-reveal', after: 'lantern-city' },
  },
  mexico: leg(12, 'san-fernando', {
    id: 'mexico',
    title: 'Under Mount Arayat',
    from: 'San Fernando',
    to: 'Mexico',
    km: 7,
    time: 'morning',
    tier: 3,
    mix: 'scenic',
    objective: 'A long, open stretch with the mountain ahead. Drive on to Mexico.',
    goals: [
      { kind: 'bolts', count: 28, text: 'Grab 28 Bolts' },
      { kind: 'clean', count: 1, text: 'No dents on this stretch' },
    ],
    postcard: { id: 'pc-arayat', title: 'Mount Arayat', caption: 'The lone mountain rising out of the Pampanga plain.', lane: 1 },
    rewards: { firstClear: 105, replay: 30 },
    scenes: { before: 'to-mexico', after: null },
  }),
  angeles: convoyLeg(13, 'mexico', {
    id: 'angeles',
    title: 'Sizzling Delivery',
    from: 'Mexico',
    to: 'Angeles',
    km: 7,
    time: 'noon',
    tier: 4,
    rescue: true,
    objective: 'Guide Kiko and a truck of hot sisig plates to Angeles before they go cold.',
    win: 'Bring Kiko to the Angeles exit.',
    rules: CONVOY_RULES,
    goals: [
      { kind: 'foes', count: 8, text: 'Zap 8 bots before they reach Kiko' },
      { kind: 'clean', count: 1, text: 'No dents on this stretch' },
    ],
    postcard: { id: 'pc-sisig', title: 'Sisig in Angeles', caption: "A sizzling plate from the city that calls itself sisig's home.", lane: -1 },
    rewards: { firstClear: 115, replay: 35 },
    scenes: { before: 'to-angeles', after: 'meet-ilaw' },
  }),
  dau: leg(14, 'angeles', {
    id: 'dau',
    title: 'Bus Rush at Dau',
    from: 'Angeles',
    to: 'Dau',
    km: 6,
    time: 'noon',
    tier: 4,
    mix: 'traffic',
    objective: 'Buses and trucks everywhere. Thread through the traffic to Dau.',
    goals: [
      { kind: 'clean', count: 1, text: 'No dents on this stretch' },
      { kind: 'foes', count: 12, text: 'Zap 12 bots' },
    ],
    postcard: { id: 'pc-terminal', title: 'Dau bus terminal', caption: 'Buses to the north leave from here, all day long.', lane: 0 },
    rewards: { firstClear: 115, replay: 35 },
    scenes: { before: 'to-dau', after: 'meet-maso' },
  }),
  sctex: leg(15, 'dau', {
    id: 'sctex',
    title: 'Where the Roads Meet',
    from: 'Dau',
    to: 'SCTEX',
    km: 3,
    time: 'sunset',
    tier: 5,
    objective: 'The hardest road yet. Reach the SCTEX interchange - one exit to go.',
    goals: [
      { kind: 'foes', count: 14, text: 'Zap 14 bots' },
      { kind: 'clean', count: 1, text: 'No dents on this stretch' },
    ],
    postcard: { id: 'pc-sctex', title: 'The SCTEX interchange', caption: 'Where NLEX meets the long road to Subic and Tarlac.', lane: 1 },
    rewards: { firstClear: 125, replay: 35 },
    scenes: { before: 'to-sctex', after: null },
  }),
  'sta-ines': {
    id: 'sta-ines',
    number: 16,
    machine: 'reyna',
    title: 'The Last Exit',
    kind: 'finale',
    kindLabel: 'Final showdown',
    from: 'SCTEX',
    to: 'Sta. Ines',
    time: 'sunset',
    objective: "Reset Reyna Barrikada's gears at the end of NLEX and open every exit for good.",
    win: "Empty the machine's Jam meter (it counts DOWN from 100%).",
    fail: 'Too many dents.',
    rules: BOSS_RULES,
    sections: [{ kind: 'boss' }],
    gantries: [],
    postcard: { id: 'pc-pinatubo', title: 'Pinatubo in the distance', caption: 'The volcano to the west, past the last exit of NLEX.', at: 0, lane: 0 },
    rewards: { firstClear: 200, replay: 50 },
    requires: 'sctex',
    scenes: { before: 'reyna-reveal', after: 'end-of-the-road' },
  },
  snapshot: {
    id: 'snapshot',
    number: 0,
    title: 'Snapshot Challenge',
    kind: 'scenario',
    kindLabel: 'Optional challenge',
    from: 'Balintawak',
    to: 'Bocaue Barrier',
    time: 'noon',
    objective: 'A replayable drive whose traffic comes from a frozen forecast snapshot.',
    win: 'Reach the end of the run.',
    fail: 'Too many dents.',
    rules: [
      'Traffic density follows the snapshot shown before you start.',
      'An arcade interpretation - not a vehicle count or a simulation.',
    ],
    sections: [
      { kind: 'patterns', length: 550, pools: [...JOURNEY_POOLS(true), { tag: 'bots', weight: 2 }], gap: [0.8, 1.3] },
      { kind: 'checkpoint' },
      { kind: 'patterns', length: 550, pools: [...JOURNEY_POOLS(true), { tag: 'bots', weight: 2 }, { tag: 'mixed', weight: 2 }], gap: [0.8, 1.3] },
      { kind: 'arrive', length: 130 },
    ],
    gantries: [{ at: 1080, title: 'End of run', sub: 'Snapshot Challenge' }],
    postcard: null,
    rewards: { firstClear: 30, replay: 30 },
    requires: 'm1-garage',
    scenes: { before: null, after: null },
  },
  endless: {
    id: 'endless',
    number: 0,
    title: 'Endless Expressway',
    kind: 'endless',
    kindLabel: 'Endless - replayable',
    from: 'Balintawak',
    to: 'as far as you can',
    time: 'noon',
    objective: 'Drive as far as you can. The road keeps getting busier.',
    win: 'No finish. Every 700 m, pick an upgrade or bank your run.',
    fail: 'Out of dents (Story mode: 5).',
    rules: ['Your best distance and score stay on this phone.'],
    sections: endlessCycle(0),
    gantries: [],
    postcard: null,
    rewards: { firstClear: 0, replay: 0 },
    requires: 'm1-garage',
    scenes: { before: null, after: null },
  },
};

/**
 * Endless Expressway: the same systems, no finish line. The road comes in
 * 700 m cycles, each a little busier (denser patterns, more of the hard and
 * mixed pools), with a safe checkpoint between cycles. The simulation adds
 * cycles as it reaches them.
 */
export function endlessCycle(n: number): SectionDef[] {
  const tier = Math.min(6, n);
  return [
    {
      kind: 'patterns',
      length: 700,
      pools: [
        { tag: 'easy', weight: Math.max(1, 5 - tier) },
        { tag: 'medium', weight: 2 + tier * 0.5 },
        { tag: 'hard', weight: tier * 0.6 },
        { tag: 'traffic', weight: 2 },
        { tag: 'bots', weight: 3 },
        { tag: 'mixed', weight: 1 + tier * 0.5 },
        { tag: 'pickup', weight: 1.5 },
        { tag: 'powerup', weight: 0.6 },
      ],
      gap: [Math.max(0.6, 1.2 - tier * 0.1), Math.max(0.9, 1.6 - tier * 0.1)],
      goal: n % 2 === 0 ? { kind: 'foes', count: 8 + tier * 2, text: `Zap ${8 + tier * 2} bots` } : { kind: 'bolts', count: 20 + tier * 4, text: `Grab ${20 + tier * 4} Bolts` },
    },
    { kind: 'checkpoint' },
  ];
}


/** Total length of the drivable sections, for the progress bar. */
export function missionLength(def: MissionDef): number {
  let total = 0;
  for (const section of def.sections) {
    if (section.kind === 'patterns' || section.kind === 'arrive') {
      total += section.length;
    }
  }
  return total;
}

/**
 * Every NLEX exit along the road, south to north, and the stop that reaches it.
 * Exits with no stop of their own (`passedOn`) are driven past, sign and all, on the way to a stop.
 */
export interface JourneyExit {
  /** The id in frontend/constants/nlexSegments.ts. */
  id: string;
  name: string;
  province: 'Metro Manila' | 'Bulacan' | 'Pampanga';
  /** The mission that ends here. */
  mission: MissionId | null;
  /** The mission that drives past it. */
  passedOn: MissionId | null;
}

export const JOURNEY_EXITS: readonly JourneyExit[] = [
  { id: 'balintawak', name: 'Balintawak', province: 'Metro Manila', mission: null, passedOn: null },
  { id: 'harbor-link', name: 'NLEX Harbor Link', province: 'Metro Manila', mission: null, passedOn: 'm1-garage' },
  { id: 'paso-de-blas', name: 'Paso de Blas', province: 'Metro Manila', mission: null, passedOn: 'm1-garage' },
  { id: 'meycauayan', name: 'Meycauayan', province: 'Bulacan', mission: 'm1-garage', passedOn: null },
  { id: 'marilao', name: 'Marilao', province: 'Bulacan', mission: null, passedOn: 'm2-convoy' },
  { id: 'cdv-ph-arena', name: 'CDV / Ph. Arena', province: 'Bulacan', mission: 'm2-convoy', passedOn: null },
  { id: 'bocaue-barrier', name: 'Bocaue Barrier', province: 'Bulacan', mission: 'm3-finale', passedOn: null },
  { id: 'bocaue-interchange', name: 'Bocaue Interchange', province: 'Bulacan', mission: 'bocaue-interchange', passedOn: null },
  { id: 'tambubong', name: 'Tambubong', province: 'Bulacan', mission: 'tambubong', passedOn: null },
  { id: 'tabang', name: 'Tabang', province: 'Bulacan', mission: 'tabang', passedOn: null },
  { id: 'balagtas', name: 'Balagtas', province: 'Bulacan', mission: 'balagtas', passedOn: null },
  { id: 'sta-rita', name: 'Sta. Rita', province: 'Bulacan', mission: 'sta-rita', passedOn: null },
  { id: 'pulilan', name: 'Pulilan', province: 'Bulacan', mission: 'pulilan', passedOn: null },
  { id: 'san-simon', name: 'San Simon', province: 'Pampanga', mission: 'san-simon', passedOn: null },
  { id: 'san-fernando', name: 'San Fernando', province: 'Pampanga', mission: 'san-fernando', passedOn: null },
  { id: 'mexico', name: 'Mexico', province: 'Pampanga', mission: 'mexico', passedOn: null },
  { id: 'angeles', name: 'Angeles', province: 'Pampanga', mission: 'angeles', passedOn: null },
  { id: 'dau', name: 'Dau', province: 'Pampanga', mission: 'dau', passedOn: null },
  { id: 'sctex', name: 'SCTEX', province: 'Pampanga', mission: 'sctex', passedOn: null },
  { id: 'sta-ines', name: 'Sta. Ines', province: 'Pampanga', mission: 'sta-ines', passedOn: null },
];
