import { levelPlan } from './levels';
import type { MissionId, StoryMissionId } from './types';

/**
 * How each stretch of road feels. Moods are the look (morning fields, town edge,
 * lantern evening, rain). Weather is what it does to the car: a gust leans on you
 * for a few seconds, rain softens the steering. Both are fiction for the game,
 * never a claim about real conditions on NLEX. Rough patches are road repairs
 * anywhere past the first stop.
 */

export type Mood = 'morning' | 'town' | 'lantern' | 'rain';
export type Weather = 'none' | 'gust' | 'rain';

export interface StretchMood {
  mood: Mood;
  weather: Weather;
  /** Dim light: distant hazards are softer until they come closer (Silaw helps). */
  dim: boolean;
  /** Whether road repairs (rough patches) appear on this stretch. */
  rough: boolean;
}

const m = (mood: Mood, weather: Weather = 'none', dim = false, rough = true): StretchMood => ({ mood, weather, dim, rough });

const STORY_MOODS: Record<StoryMissionId | 'snapshot' | 'endless', StretchMood> = {
  'm1-garage': m('town', 'none', false, false),
  'm2-convoy': m('morning', 'none', false, false),
  'm3-finale': m('lantern', 'none', true, false),
  'bocaue-interchange': m('town'),
  tambubong: m('morning'),
  tabang: m('morning', 'gust'),
  balagtas: m('town'),
  'sta-rita': m('rain', 'rain'),
  pulilan: m('lantern', 'none', true),
  'san-simon': m('morning', 'gust'),
  'san-fernando': m('lantern', 'none', true, false),
  mexico: m('morning'),
  angeles: m('town'),
  dau: m('rain', 'rain'),
  sctex: m('morning', 'gust', true),
  'sta-ines': m('lantern', 'gust', true, false),
  snapshot: m('town', 'none', false, false),
  endless: m('morning'),
};

/** How a mission's road feels: the story's own, or the look its level was planned with (core/levels.ts). */
export function missionMood(id: MissionId): StretchMood {
  const story = (STORY_MOODS as Partial<Record<MissionId, StretchMood>>)[id];
  if (story !== undefined) {
    return story;
  }
  const plan = levelPlan(id);
  return plan === undefined ? STORY_MOODS.endless : m(plan.mood, plan.weather, plan.dim, plan.rough);
}

/** Endless drives through all four moods, one per cycle of road. */
export function endlessMood(cycle: number): StretchMood {
  const list: StretchMood[] = [m('morning'), m('town', 'gust'), m('rain', 'rain'), m('lantern', 'none', true)];
  return list[((cycle % list.length) + list.length) % list.length];
}

/** Stops whose postcards make up Tiko's little trail, under Mt. Arayat. */
export const ARAYAT_STOPS: readonly MissionId[] = ['mexico', 'angeles', 'dau'];
