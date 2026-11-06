import type { LevelId, MissionId, StoryMissionId } from './types';

/**
 * The hundred levels: the whole of NLEX, Balintawak to Sta. Ines, cut into levels
 * that sit between its real exits. Every stretch between two exits has at least two
 * levels, and the rest are shared out by real distance, so a long stretch has more.
 * The story missions keep their places: each is the level that reaches its exit
 * (the tutorial is level 1). Everything about a level that is not story is planned
 * here, so the missions, the look of the road and the map all agree.
 *
 * Nothing here imports at run time, so any module can use it.
 */

export const LEVEL_COUNT = 100;
/** Every stretch between two exits gets at least this many levels. */
const MIN_PER_STRETCH = 2;

export type Province = 'Metro Manila' | 'Bulacan' | 'Pampanga';

export interface ExitInfo {
  /** The id in frontend/constants/nlexSegments.ts. */
  id: string;
  name: string;
  province: Province;
  /** Kilometres from Balintawak, as in frontend/constants/nlexSegments.ts. */
  km: number;
}

/** Every NLEX exit, south to north, in real order (checked against frontend/constants/nlexSegments.ts by a test). */
export const EXITS: readonly ExitInfo[] = [
  { id: 'balintawak', name: 'Balintawak', province: 'Metro Manila', km: 0 },
  { id: 'harbor-link', name: 'NLEX Harbor Link', province: 'Metro Manila', km: 5 },
  { id: 'paso-de-blas', name: 'Paso de Blas', province: 'Metro Manila', km: 7 },
  { id: 'meycauayan', name: 'Meycauayan', province: 'Bulacan', km: 14 },
  { id: 'marilao', name: 'Marilao', province: 'Bulacan', km: 18 },
  { id: 'cdv-ph-arena', name: 'CDV / Ph. Arena', province: 'Bulacan', km: 22 },
  { id: 'bocaue-barrier', name: 'Bocaue Barrier', province: 'Bulacan', km: 24 },
  { id: 'bocaue-interchange', name: 'Bocaue Interchange', province: 'Bulacan', km: 25 },
  { id: 'tambubong', name: 'Tambubong', province: 'Bulacan', km: 28 },
  { id: 'tabang', name: 'Tabang', province: 'Bulacan', km: 31 },
  { id: 'balagtas', name: 'Balagtas', province: 'Bulacan', km: 34 },
  { id: 'sta-rita', name: 'Sta. Rita', province: 'Bulacan', km: 37 },
  { id: 'pulilan', name: 'Pulilan', province: 'Bulacan', km: 44 },
  { id: 'san-simon', name: 'San Simon', province: 'Pampanga', km: 52 },
  { id: 'san-fernando', name: 'San Fernando', province: 'Pampanga', km: 60 },
  { id: 'mexico', name: 'Mexico', province: 'Pampanga', km: 67 },
  { id: 'angeles', name: 'Angeles', province: 'Pampanga', km: 74 },
  { id: 'dau', name: 'Dau', province: 'Pampanga', km: 80 },
  { id: 'sctex', name: 'SCTEX', province: 'Pampanga', km: 83 },
  { id: 'sta-ines', name: 'Sta. Ines', province: 'Pampanga', km: 86 },
];

/** Where each story mission sits: the stretch it drives (by index; stretch i runs from exit i to exit i + 1). */
const STORY_STRETCH: Record<StoryMissionId, number> = {
  'm1-garage': 0,
  'm2-convoy': 4,
  'm3-finale': 5,
  'bocaue-interchange': 6,
  tambubong: 7,
  tabang: 8,
  balagtas: 9,
  'sta-rita': 10,
  pulilan: 11,
  'san-simon': 12,
  'san-fernando': 13,
  mexico: 14,
  angeles: 15,
  dau: 16,
  sctex: 17,
  'sta-ines': 18,
};

/** What a stretch of road is mostly made of. */
export type RoadMix = 'balanced' | 'roadworks' | 'bots' | 'traffic' | 'scenic';
export type TimeOfDay = 'morning' | 'noon' | 'sunset';
export type LevelWeather = 'none' | 'gust' | 'rain';
export type LevelMood = 'morning' | 'town' | 'lantern' | 'rain';
export type LevelLandmark = 'city' | 'arena' | 'plaza' | 'none' | 'arayat' | 'pinatubo' | 'lanterns';

export interface LevelPlan {
  /** 1 to 100. */
  level: number;
  id: MissionId;
  /** The story mission this level is, or null for a road level. */
  story: StoryMissionId | null;
  /** Which stretch between exits it drives, and where in that stretch (step of steps, from 0). */
  stretch: number;
  step: number;
  steps: number;
  from: string;
  to: string;
  /** Whether this level ends at the exit. */
  reachesExit: boolean;
  /** Kilometres still to go to the exit when this level ends (0 at the exit). */
  kmLeft: number;
  /** How busy the road is: about 0.3 at the start to 5 at the end. */
  tier: number;
  mix: RoadMix;
  time: TimeOfDay;
  mood: LevelMood;
  weather: LevelWeather;
  dim: boolean;
  rough: boolean;
  landmark: LevelLandmark;
  province: Province;
}

/** How many levels each stretch between exits gets: at least two, the rest by real distance (largest remainders). */
export function levelsPerStretch(): number[] {
  const kms = EXITS.slice(1).map((exit, i) => exit.km - EXITS[i].km);
  const total = kms.reduce((sum, km) => sum + km, 0);
  const spare = LEVEL_COUNT - MIN_PER_STRETCH * kms.length;
  const shares = kms.map((km) => (km / total) * spare);
  const counts = shares.map((share) => MIN_PER_STRETCH + Math.floor(share));
  let left = LEVEL_COUNT - counts.reduce((sum, n) => sum + n, 0);
  const order = shares.map((share, i) => ({ i, rest: share - Math.floor(share) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) {
      break;
    }
    counts[i] += 1;
    left -= 1;
  }
  return counts;
}

/** How busy a level's road is, rising smoothly along the whole journey. */
function tierAt(level: number): number {
  const points: [number, number][] = [[1, 0.3], [30, 1.2], [37, 1.6], [49, 2.6], [64, 3.2], [79, 3.6], [92, 4.4], [100, 5]];
  for (let i = 1; i < points.length; i += 1) {
    const [l1, t1] = points[i];
    const [l0, t0] = points[i - 1];
    if (level <= l1) {
      return Math.round((t0 + ((t1 - t0) * (level - l0)) / (l1 - l0)) * 100) / 100;
    }
  }
  return 5;
}

const MIXES: readonly RoadMix[] = ['balanced', 'roadworks', 'bots', 'traffic', 'scenic'];
/** The scenery each stretch shows: city in Metro Manila, the arena, Mt. Arayat in Pampanga, Pinatubo at the end. */
const STRETCH_LANDMARK: readonly LevelLandmark[] = ['city', 'city', 'city', 'city', 'arena', 'arena', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'arayat', 'arayat', 'arayat', 'pinatubo', 'pinatubo'];

function roadLevelLook(level: number, stretch: number, province: Province): Pick<LevelPlan, 'mix' | 'time' | 'mood' | 'weather' | 'dim' | 'rough' | 'landmark'> {
  // The first few are gentle; after that the mix changes every level, never twice in a row.
  const mix: RoadMix = level <= 4 ? (level % 2 === 0 ? 'scenic' : 'balanced') : MIXES[(level * 2 + stretch) % MIXES.length];
  const time: TimeOfDay = (['morning', 'morning', 'noon', 'noon', 'sunset'] as const)[level % 5];
  const weather: LevelWeather = level > 8 && level % 9 === 4 ? 'rain' : level > 6 && level % 7 === 3 ? 'gust' : 'none';
  const town = province === 'Metro Manila' || stretch % 3 === 0;
  const mood: LevelMood = weather === 'rain' ? 'rain' : time === 'sunset' ? 'lantern' : time === 'noon' && town ? 'town' : 'morning';
  const landmark = STRETCH_LANDMARK[stretch] === 'none' && stretch === 13 && time === 'sunset' ? 'lanterns' : STRETCH_LANDMARK[stretch];
  return { mix, time, mood, weather, dim: time === 'sunset', rough: level >= 3, landmark };
}

const roadLevelId = (level: number): LevelId => `lv-${level}`;

function buildPlan(): LevelPlan[] {
  const counts = levelsPerStretch();
  const plan: LevelPlan[] = [];
  const storyAt = new Map<number, StoryMissionId>();
  for (const [id, stretch] of Object.entries(STORY_STRETCH) as [StoryMissionId, number][]) {
    storyAt.set(stretch, id);
  }
  counts.forEach((steps, stretch) => {
    const from = EXITS[stretch];
    const to = EXITS[stretch + 1];
    const km = to.km - from.km;
    const story = storyAt.get(stretch) ?? null;
    // The tutorial opens the first stretch; every other story mission is the level that reaches its exit.
    const storyStep = story === null ? -1 : story === 'm1-garage' ? 0 : steps - 1;
    for (let step = 0; step < steps; step += 1) {
      const level = plan.length + 1;
      const isStory = step === storyStep;
      const kmLeft = Math.round(km * (1 - (step + 1) / steps) * 10) / 10;
      plan.push({
        level,
        id: isStory ? story! : roadLevelId(level),
        story: isStory ? story : null,
        stretch,
        step,
        steps,
        from: from.name,
        to: to.name,
        reachesExit: step === steps - 1,
        kmLeft,
        tier: tierAt(level),
        province: to.province,
        ...roadLevelLook(level, stretch, to.province),
      });
    }
  });
  return plan;
}

export const LEVEL_PLAN: readonly LevelPlan[] = buildPlan();

/** The whole story, in the order it is played: level 1 first. */
export const JOURNEY: readonly MissionId[] = LEVEL_PLAN.map((p) => p.id);

const BY_ID = new Map<MissionId, LevelPlan>(LEVEL_PLAN.map((p) => [p.id, p]));

/** A level's plan; undefined for the side modes (Snapshot, Endless). */
export function levelPlan(id: MissionId): LevelPlan | undefined {
  return BY_ID.get(id);
}

/** A mission's level number, 1 to 100; 0 for the side modes. */
export function levelOf(id: MissionId): number {
  return BY_ID.get(id)?.level ?? 0;
}

export function isRoadLevel(id: string): id is LevelId {
  return /^lv-\d+$/.test(id);
}

/** Every exit, and the level that reaches it (null for Balintawak, where the road starts). */
export interface JourneyExit extends ExitInfo {
  level: number | null;
}

export const JOURNEY_EXITS: readonly JourneyExit[] = EXITS.map((exit, i) => ({
  ...exit,
  level: i === 0 ? null : LEVEL_PLAN.filter((p) => p.stretch === i - 1 && p.reachesExit)[0].level,
}));

/**
 * Spreads `count` unlocks over the levels, a little closer together early on, so the
 * first hours bring someone new often. Levels already taken by the story are skipped.
 */
export function spreadLevels(count: number, taken: ReadonlySet<number>, first = 3, last = 99): number[] {
  const out: number[] = [];
  const used = new Set(taken);
  for (let i = 0; i < count; i += 1) {
    let level = Math.round(first + (last - first) * ((i + 0.5) / count) ** 1.12);
    while (used.has(level) && level < last) {
      level += 1;
    }
    while (used.has(level)) {
      level -= 1;
    }
    used.add(level);
    out.push(level);
  }
  return out;
}
