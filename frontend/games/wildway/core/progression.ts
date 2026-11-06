import type { ZoneId } from './mission';

/** The four heroes, as the save knows them. */
export type HeroId = 'dayo' | 'baging' | 'sukat' | 'awit';

/**
 * Everything a player collects outside the main story, as data: Guardian patches hidden
 * in each place, wildlife they can stop and observe, short side quests at the Command
 * Center, workshop gear that changes how the heroes play, and achievements.
 *
 * None of it touches the measures that matter. Patches, quests and achievements earn
 * Guardian Points, a game currency, and points never turn into kilograms of CO2,
 * animals or habitat. Each reward is granted once: everything is keyed by id.
 */

/* ---- Guardian patches: one hero can reach each ---- */

export interface Collectible {
  id: string;
  zone: ZoneId;
  /** The spot in the zone (zone.spots) where it is. */
  spot: string;
  label: string;
  /** Who can get it, and how: the reason the team needs everyone. */
  hero: HeroId | null;
  how: string;
}

export const PATCH_POINTS = 5;

export const COLLECTIBLES: readonly Collectible[] = [
  { id: 'p-center-roof', zone: 'station', spot: 'patch1', label: 'Command Center patch', hero: 'awit', how: 'On the workshop roof. Glide up.' },
  { id: 'p-center-gap', zone: 'station', spot: 'patch2', label: 'Seedling patch', hero: 'baging', how: 'Behind the garden fence. Stretch for it.' },
  { id: 'p-center-crate', zone: 'station', spot: 'patch3', label: 'Toolbox patch', hero: 'dayo', how: 'Under a heavy crate. Lift it.' },
  { id: 'p-plaza-roof', zone: 'plaza', spot: 'patch1', label: 'Toll plaza patch', hero: 'awit', how: 'On the canopy. Glide up.' },
  { id: 'p-plaza-drain', zone: 'plaza', spot: 'patch2', label: 'Lane signal patch', hero: 'baging', how: 'Down a drain grate. Stretch in.' },
  { id: 'p-plaza-scan', zone: 'plaza', spot: 'patch3', label: 'Traffic counter patch', hero: 'sukat', how: 'Hidden in the counter data. Scan it.' },
  { id: 'p-creek-reeds', zone: 'river', spot: 'patch1', label: 'Creek patch', hero: 'baging', how: 'Snagged in the far reeds. Stretch across.' },
  { id: 'p-creek-tree', zone: 'river', spot: 'patch2', label: 'Kingfisher patch', hero: 'awit', how: 'Up the mango tree. Glide up.' },
  { id: 'p-creek-stone', zone: 'river', spot: 'patch3', label: 'Stepping-stone patch', hero: 'dayo', how: 'Under a big stone. Lift it.' },
  { id: 'p-depot-roof', zone: 'depot', spot: 'patch1', label: 'Solar patch', hero: 'awit', how: 'On the workshop roof. Glide up.' },
  { id: 'p-depot-meter', zone: 'depot', spot: 'patch2', label: 'Meter patch', hero: 'sukat', how: 'In the old meter log. Scan it.' },
  { id: 'p-depot-pipe', zone: 'depot', spot: 'patch3', label: 'Wrench patch', hero: 'baging', how: 'Behind the compressor. Stretch in.' },
  { id: 'p-yard-shelf', zone: 'yard', spot: 'patch1', label: 'Supply yard patch', hero: 'dayo', how: 'Top of the racks. Climb up.' },
  { id: 'p-yard-tag', zone: 'yard', spot: 'patch2', label: 'Parcel patch', hero: 'sukat', how: 'A mislabelled parcel. Scan it.' },
  { id: 'p-yard-gutter', zone: 'yard', spot: 'patch3', label: 'Delivery van patch', hero: 'awit', how: 'In the shed gutter. Glide up.' },
];

/* ---- Wildlife observations: common animals, kept apart from the Atlas's 100 species ---- */

export interface Discovery {
  id: string;
  zone: ZoneId;
  spot: string;
  name: string;
  /** A plain, checkable fact about the animal in general, never about this made-up place. */
  fact: string;
  /** Shown only once this flag is set in the run, if any: wildlife returns after a cleanup. */
  afterFlag?: string;
}

export const DISCOVERY_POINTS = 5;

export const DISCOVERIES: readonly Discovery[] = [
  { id: 'd-butterfly', zone: 'station', spot: 'critter1', name: 'Butterflies', fact: 'Butterflies taste with their feet: sensors on their legs tell them which leaves suit their eggs.' },
  { id: 'd-swallow', zone: 'plaza', spot: 'critter1', name: 'Swallows', fact: 'Swallows catch flying insects in mid-air, and often nest under roofs and bridges.' },
  { id: 'd-dragonfly', zone: 'river', spot: 'critter1', name: 'Dragonflies', fact: 'Young dragonflies live underwater for months before they fly, so they need clean, flowing water.', afterFlag: 'flowRestored' },
  { id: 'd-frog', zone: 'river', spot: 'critter2', name: 'A frog', fact: 'Frogs breathe partly through their skin, which is why polluted water harms them quickly.', afterFlag: 'flowRestored' },
  { id: 'd-gecko', zone: 'depot', spot: 'critter1', name: 'A house gecko', fact: 'House geckos hunt the insects that gather round lights at night.' },
  { id: 'd-sparrow', zone: 'yard', spot: 'critter1', name: 'Tree sparrows (maya)', fact: 'The Eurasian tree sparrow, the maya, is one of the most common birds in Philippine towns.' },
];

/* ---- Side quests at the Command Center: short, once each, no timers ---- */

export interface SideQuest {
  id: string;
  title: string;
  /** One line on the notice board. */
  task: string;
  /** Flags (kept in save.sideFlags) that finish it. */
  needs: readonly string[];
  points: number;
}

export const SIDE_QUESTS: readonly SideQuest[] = [
  { id: 'sq-tidy', title: 'Tidy the Command Center', task: 'Put 4 bits of litter in the recycling bin.', needs: ['tidy:1', 'tidy:2', 'tidy:3', 'tidy:4'], points: 20 },
  { id: 'sq-weather', title: 'Fix the weather station', task: 'Rewire it at the monitoring station.', needs: ['weather:fixed'], points: 20 },
  { id: 'sq-sensors', title: 'Check the air sensors', task: 'Sukat scans the 3 air-quality sensors.', needs: ['sensor:1', 'sensor:2', 'sensor:3'], points: 15 },
  { id: 'sq-quiz', title: 'Navie’s Atlas quiz', task: 'Answer 3 questions from the Wildlife Atlas.', needs: ['quiz:done'], points: 15 },
];

export const sideQuestDone = (sideFlags: readonly string[], q: SideQuest): boolean => q.needs.every((n) => sideFlags.includes(n));

/* ---- Workshop gear: each one changes how a hero plays ---- */

export type GearId = 'boots' | 'lens' | 'kite' | 'vines';

export interface Gear {
  id: GearId;
  title: string;
  /** What it does, exactly. */
  effect: string;
  cost: number;
  hero: HeroId | null;
}

export const GEAR: readonly Gear[] = [
  { id: 'boots', title: 'Trail boots', effect: 'The whole team walks 10% faster.', cost: 40, hero: null },
  { id: 'lens', title: 'Sukat’s field lens', effect: 'Hidden patches and wildlife sparkle when you are near.', cost: 50, hero: 'sukat' },
  { id: 'kite', title: 'Awit’s long kite', effect: 'Glides last half as long again.', cost: 40, hero: 'awit' },
  { id: 'vines', title: 'Baging’s long vines', effect: 'Stretches reach 1 m further.', cost: 40, hero: 'baging' },
];

/** The numbers each gear changes, so the world and the tests use the same ones. */
export const GEAR_EFFECT = { bootsSpeed: 1.1, kiteSeconds: 4.5 * 1.5, baseKiteSeconds: 4.5, vinesExtra: 1, lensRange: 14 };

/* ---- Atlas quiz: every question is built from the checked species records ---- */

export interface QuizQuestion {
  /** The species whose checked range is quoted. */
  answer: string;
  options: readonly string[];
}

export const QUIZ: readonly QuizQuestion[] = [
  { answer: 'sp-003', options: ['sp-003', 'sp-004', 'sp-006'] },
  { answer: 'sp-004', options: ['sp-002', 'sp-004', 'sp-008'] },
  { answer: 'sp-007', options: ['sp-005', 'sp-001', 'sp-007'] },
];

/* ---- Achievements ---- */

/** What an achievement rule can see: a narrow view of the save, so rules stay pure. */
export interface AchievementView {
  missions: readonly string[];
  /** Missions whose best simulated plan beat the usual way. */
  missionsBelowBaseline: readonly string[];
  collectibles: readonly string[];
  discoveries: readonly string[];
  sideQuests: readonly string[];
  gear: readonly string[];
  nlexMissionIds: readonly string[];
}

export interface Achievement {
  id: string;
  title: string;
  blurb: string;
  icon: 'star' | 'truck' | 'leaf' | 'paw' | 'tree' | 'check' | 'book' | 'people' | 'gear' | 'map';
  rule: (v: AchievementView) => boolean;
}

export const ACHIEVEMENT_POINTS = 10;

const did = (id: string) => (v: AchievementView): boolean => v.missions.includes(id);

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'a-first', title: 'First call answered', blurb: 'Finish any mission.', icon: 'star', rule: (v) => v.missions.length > 0 },
  { id: 'a-plaza', title: 'Plaza unjammed', blurb: 'Finish The Great NLEX Gridlock.', icon: 'truck', rule: did('nlex-gridlock') },
  { id: 'a-creek', title: 'Creek flowing', blurb: 'Finish Creek Rescue.', icon: 'leaf', rule: did('nlex-river') },
  { id: 'a-solar', title: 'Sun on the roof', blurb: 'Finish Solar Power Rescue.', icon: 'star', rule: did('nlex-eco') },
  { id: 'a-delivery', title: 'Packed and sent', blurb: 'Finish Eco Delivery Rush.', icon: 'truck', rule: did('nlex-delivery') },
  { id: 'a-hornbill', title: 'Home to the ridge', blurb: 'Finish The Hornbill Homecoming.', icon: 'paw', rule: did('hornbill-homecoming') },
  { id: 'a-corridor', title: 'Corridor Guardians', blurb: 'Finish every NLEX mission.', icon: 'map', rule: (v) => v.nlexMissionIds.every((id) => v.missions.includes(id)) },
  { id: 'a-lighter', title: 'Lighter footprint', blurb: 'Beat the usual way’s simulated CO2 in 3 missions.', icon: 'leaf', rule: (v) => v.missionsBelowBaseline.length >= 3 },
  { id: 'a-patches', title: 'Sharp eyes', blurb: 'Find 5 Guardian patches.', icon: 'check', rule: (v) => v.collectibles.length >= 5 },
  { id: 'a-allpatches', title: 'Every patch', blurb: 'Find all 15 Guardian patches.', icon: 'star', rule: (v) => COLLECTIBLES.every((c) => v.collectibles.includes(c.id)) },
  { id: 'a-notes', title: 'Field notes', blurb: 'Observe 4 kinds of wildlife.', icon: 'book', rule: (v) => v.discoveries.length >= 4 },
  { id: 'a-neighbour', title: 'Good neighbours', blurb: 'Finish every Command Center side quest.', icon: 'people', rule: (v) => SIDE_QUESTS.every((q) => v.sideQuests.includes(q.id)) },
  { id: 'a-equipped', title: 'Fully equipped', blurb: 'Get all four pieces of workshop gear.', icon: 'gear', rule: (v) => GEAR.every((g) => v.gear.includes(g.id)) },
];

export const newAchievements = (view: AchievementView, have: readonly string[]): string[] => ACHIEVEMENTS.filter((a) => !have.includes(a.id) && a.rule(view)).map((a) => a.id);

/* ---- The Command Center changes as missions are finished ---- */

export interface Decoration {
  id: string;
  label: string;
  missionId: string;
}

/** Built automatically, never bought: the Command Center remembers what the team has done. */
export const DECORATIONS: readonly Decoration[] = [
  { id: 'dec-plaza', label: 'A working model of the plaza’s lane lights', missionId: 'nlex-gridlock' },
  { id: 'dec-creek', label: 'The creek cleanup display: the sorted bins, and the drum the specialist took away', missionId: 'nlex-river' },
  { id: 'dec-solar', label: 'Solar lamps along the path, lit from a panel of their own', missionId: 'nlex-eco' },
  { id: 'dec-delivery', label: 'The field van, parked with spare seedling trays', missionId: 'nlex-delivery' },
  { id: 'dec-hornbill', label: 'A hornbill nest-box model by the Atlas', missionId: 'hornbill-homecoming' },
];

export const decorationsFor = (missionsDone: readonly string[]): string[] => DECORATIONS.filter((d) => missionsDone.includes(d.missionId)).map((d) => d.id);
