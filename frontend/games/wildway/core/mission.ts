import { UPGRADE_OPTIONS, type Upgrade } from './facility';
import { DELIVERY_TRANSPORT, depotTransport, HORNBILL_TRANSPORT, RIVER_TRANSPORT, type DepotCargo, type Plan, type TransportProblem } from './transport';

/**
 * Missions as data, and the state machine that runs them: a mission is an ordered list
 * of steps, each finished by flags the world sets. Pure, so saving, resuming and replays
 * can be tested without drawing anything.
 */

export type ZoneId = 'forest' | 'station' | 'plaza' | 'river' | 'depot' | 'yard';

export interface MissionStep {
  id: string;
  zone: ZoneId;
  /** Strings key for the one line shown on screen. */
  objective: string;
  /** Flags that finish this step. */
  needs: readonly string[];
  /** Named spot the on-screen guide points to. */
  target: string | null;
}

export interface StoryIndividual {
  id: string;
  speciesId: string;
  /** Optional nickname; the species is always shown with it. */
  defaultNickname: string;
}

export interface MissionDef {
  id: string;
  title: string;
  chapter: number;
  /** A wildlife expedition, or an NLEX environmental mission. */
  kind: 'wildlife' | 'nlex';
  /** Its stop on the NLEX map, or the partner station an expedition goes to. */
  locationId: string;
  /** One line for the briefing. */
  summary: string;
  /** What in it is made up, said plainly on the briefing. */
  fiction: string;
  /** Results that are not wildlife habitat: a plaza flowing, a waterway cleared, a depot wasting less. */
  environmentObjectives: readonly { id: string; label: string }[];
  speciesIds: readonly string[];
  regionId: string;
  storyIndividuals: readonly StoryIndividual[];
  requiredTasks: readonly string[];
  serviceConstraints: string;
  /** Null when the mission has no dispatch, or builds it from the player's choices (see missionTransport). */
  transport: TransportProblem | null;
  rescueObjectives: readonly string[];
  habitatObjectives: readonly { id: string; label: string }[];
  evidenceReferences: readonly string[];
  rewards: { guardianPoints: number; plannedWell: number; optionalChannel: number; perClue: number };
  steps: readonly MissionStep[];
}

export const HORNBILL_MISSION: MissionDef = {
  id: 'hornbill-homecoming',
  title: 'The Hornbill Homecoming',
  chapter: 1,
  kind: 'wildlife',
  locationId: 'malaya-ridge',
  summary: 'A hurt hornbill needs help at Malaya Ridge!',
  fiction: 'Malaya Ridge is made up, far from NLEX: no hornbills live beside the expressway.',
  environmentObjectives: [],
  speciesIds: ['sp-009'],
  regionId: 'malaya-ridge',
  storyIndividuals: [{ id: 'hornbill-male-1', speciesId: 'sp-009', defaultNickname: 'Kalaw' }],
  requiredTasks: ['Find the hornbill', 'Clear the path', 'Help the ranger'],
  serviceConstraints: 'The rangers bring the specialist and the kit once the track is clear.',
  /* No transport plan in the simplified mission: the carbon lessons live in the NLEX missions. */
  transport: null,
  rescueObjectives: ['Get the specialist and the kit to the bird'],
  habitatObjectives: [{ id: 'malaya-corridor', label: 'Malaya Ridge forest gap replanted' }],
  evidenceReferences: [
    'https://iucnhornbills.org/northern-rufous-hornbill/',
    'https://en.wikipedia.org/wiki/Rufous_hornbill',
    'https://manilaoceanpark.com/philippine_biodome/rufous-hornbill/',
    'https://tribune.net.ph/2026/09/09/juvenile-serpent-eagle-rescued-in-malapatan',
    'https://www.sunstar.com.ph/article/1923022/zamboanga/local-news/denr-places-under-rehab-injured-falcon-dumagat',
  ],
  rewards: { guardianPoints: 100, plannedWell: 25, optionalChannel: 15, perClue: 5 },
  steps: [
    { id: 'find', zone: 'forest', objective: 'obj.find', needs: ['birdScanned'], target: 'bird' },
    { id: 'path', zone: 'forest', objective: 'obj.path', needs: ['logCleared', 'crossingOpen'], target: 'log' },
    { id: 'help', zone: 'forest', objective: 'obj.help', needs: ['kitDelivered', 'plantC', 'plantD'], target: 'tent' },
  ],
};

const NLEX_REWARDS = { guardianPoints: 100, plannedWell: 25, optionalChannel: 0, perClue: 5 };

export const GRIDLOCK_MISSION: MissionDef = {
  id: 'nlex-gridlock',
  title: 'The Great NLEX Gridlock',
  chapter: 0,
  kind: 'nlex',
  locationId: 'bocaue',
  summary: 'A broken RFID scanner has jammed a toll plaza!',
  fiction: 'A made-up toll plaza. Every traffic number is invented for the game.',
  environmentObjectives: [{ id: 'plaza-flow', label: 'Toll plaza flowing again' }],
  speciesIds: [],
  regionId: 'bocaue-plaza',
  storyIndividuals: [],
  requiredTasks: ['Find the broken scanner', 'Fix the scanner', 'Get the traffic moving'],
  serviceConstraints: 'Lane 4 stays closed for repairs. Three toll collectors are on shift.',
  transport: null,
  rescueObjectives: [],
  habitatObjectives: [],
  evidenceReferences: [],
  rewards: NLEX_REWARDS,
  steps: [
    { id: 'find', zone: 'plaza', objective: 'obj.gridFind', needs: ['scannerFound'], target: 'scanner' },
    { id: 'fix', zone: 'plaza', objective: 'obj.gridFix', needs: ['scannerFixed'], target: 'scanner' },
    { id: 'flow', zone: 'plaza', objective: 'obj.gridFlow', needs: ['reopened'], target: 'console' },
  ],
};

export type WasteKind = 'bio' | 'recycle' | 'residual';

export const RIVER_ITEMS: readonly { id: string; label: string; kind: WasteKind; floating: boolean }[] = [
  { id: 'bottle', label: 'plastic bottle', kind: 'recycle', floating: true },
  { id: 'can', label: 'drink can', kind: 'recycle', floating: false },
  { id: 'jar', label: 'glass jar', kind: 'recycle', floating: false },
  { id: 'leaves', label: 'banana leaves', kind: 'bio', floating: false },
  { id: 'peels', label: 'fruit peels', kind: 'bio', floating: false },
  { id: 'husk', label: 'coconut husk', kind: 'bio', floating: true },
  { id: 'wrappers', label: 'snack wrappers', kind: 'residual', floating: false },
  { id: 'slipper', label: 'broken slipper', kind: 'residual', floating: false },
];

export const WASTE_LABEL: Record<WasteKind, string> = { bio: 'Biodegradable', recycle: 'Recyclables', residual: 'Residual' };

/** The five pieces the team picks up in the simplified mission, west to east along the creek. */
export const CREEK_LITTER: readonly string[] = ['can', 'bottle', 'wrappers', 'jar', 'peels'];

export const RIVER_MISSION: MissionDef = {
  id: 'nlex-river',
  title: 'Creek Rescue',
  chapter: 0,
  kind: 'nlex',
  locationId: 'valenzuela',
  summary: 'Let’s clean up a creek blocked by rubbish!',
  fiction: 'A made-up creek and barangay. No real waterway is described.',
  environmentObjectives: [{ id: 'creek-clean', label: 'Community creek cleared and flowing' }],
  speciesIds: [],
  regionId: 'valenzuela-creek',
  storyIndividuals: [],
  requiredTasks: ['Collect the litter', 'Clear the blockage', 'Spot the returning wildlife'],
  serviceConstraints: 'Waste goes into the barangay’s sorted sacks.',
  transport: null,
  rescueObjectives: [],
  habitatObjectives: [],
  evidenceReferences: [],
  rewards: NLEX_REWARDS,
  steps: [
    { id: 'collect', zone: 'river', objective: 'obj.riverCollect', needs: CREEK_LITTER.map((id) => `sorted:${id}`), target: 'litter' },
    { id: 'clear', zone: 'river', objective: 'obj.riverClear', needs: ['flowRestored'], target: 'rack' },
    { id: 'wildlife', zone: 'river', objective: 'obj.riverWildlife', needs: ['spot:fish', 'spot:dragonfly', 'spot:frog'], target: 'wildlife' },
  ],
};

export const ECO_MISSION: MissionDef = {
  id: 'nlex-eco',
  title: 'Solar Power Rescue',
  chapter: 0,
  kind: 'nlex',
  locationId: 'san-fernando',
  summary: 'The depot’s new solar roof won’t switch on!',
  fiction: 'A made-up depot. Every wattage and the solar yield are game assumptions.',
  environmentObjectives: [{ id: 'depot-lean', label: 'Depot running on solar' }],
  speciesIds: [],
  regionId: 'san-fernando-depot',
  storyIndividuals: [],
  requiredTasks: ['Find the power switch', 'Connect the solar panels', 'Turn on the solar power'],
  serviceConstraints: 'The panels are on the roof already: only the wiring is scrambled.',
  transport: null,
  rescueObjectives: [],
  habitatObjectives: [],
  evidenceReferences: [],
  rewards: NLEX_REWARDS,
  steps: [
    { id: 'find', zone: 'depot', objective: 'obj.ecoFind', needs: ['switchFound'], target: 'inverter' },
    { id: 'connect', zone: 'depot', objective: 'obj.ecoConnect', needs: ['fixWiring'], target: 'wiring' },
    { id: 'switch', zone: 'depot', objective: 'obj.ecoSwitch', needs: ['installDone'], target: 'inverter' },
  ],
};

/** What the team gathers at the yard. Each takes a different hero to reach, or anyone. */
export const DELIVERY_ITEMS: readonly { id: string; label: string; spot: string; hero: 'dayo' | 'baging' | 'sukat' | 'awit' | null }[] = [
  { id: 'seedlings', label: 'seedling trays', spot: 'itemSeedlings', hero: null },
  { id: 'tents', label: 'field tents', spot: 'itemTents', hero: 'dayo' },
  { id: 'traps', label: 'camera-trap kit', spot: 'itemTraps', hero: 'sukat' },
  { id: 'medkit', label: 'specialist kit', spot: 'itemMedkit', hero: 'baging' },
  { id: 'rope', label: 'rope and tools', spot: 'itemRope', hero: 'awit' },
  { id: 'water', label: 'water jugs', spot: 'itemWater', hero: null },
];

/** The four the team fetches, one for each hero. The seedlings and the water are by the van already. */
export const DELIVERY_PICKS: readonly string[] = ['tents', 'medkit', 'rope', 'traps'];

/** The simplified run: only the vehicle is chosen. The route and the time are fixed. */
export const DELIVERY_ROUTE = 'nlex';
export const DELIVERY_DEPARTURE = 'late';
export const DELIVERY_CHOICES: readonly string[] = ['two-vans', 'one-van', 'evan', 'pickup-all'];

export const DELIVERY_MISSION: MissionDef = {
  id: 'nlex-delivery',
  title: 'Eco Delivery Rush',
  chapter: 0,
  kind: 'nlex',
  locationId: 'balintawak',
  summary: 'The field team needs supplies by noon!',
  fiction: 'A made-up supply yard and a made-up run. Distances and loads are invented for the game.',
  environmentObjectives: [{ id: 'delivery-packed', label: 'Field supplies packed and sent' }],
  speciesIds: [],
  regionId: 'balintawak-yard',
  storyIndividuals: [],
  requiredTasks: ['Collect the supplies', 'Choose a greener vehicle', 'Send the delivery'],
  serviceConstraints: 'Two technicians and everything they need at the ridge by 12:00 noon.',
  transport: DELIVERY_TRANSPORT,
  rescueObjectives: [],
  habitatObjectives: [],
  evidenceReferences: [],
  rewards: NLEX_REWARDS,
  steps: [
    { id: 'gather', zone: 'yard', objective: 'obj.yardGather', needs: DELIVERY_PICKS.map((id) => `got:${id}`), target: 'items' },
    { id: 'choose', zone: 'yard', objective: 'obj.yardChoose', needs: ['planChosen'], target: 'van' },
    { id: 'send', zone: 'yard', objective: 'obj.yardSend', needs: ['sent'], target: 'van' },
  ],
};

export const MISSIONS: readonly MissionDef[] = [GRIDLOCK_MISSION, HORNBILL_MISSION, RIVER_MISSION, ECO_MISSION, DELIVERY_MISSION];

/** The upgrades a depot run chose, from its flags. */
export const chosenUpgrades = (run: MissionRun): Upgrade[] => {
  const picked = UPGRADE_OPTIONS.filter((o) => run.flags.includes(`up:${o.id}`)).map((o) => o.id);
  /* The simplified mission has no planner: connecting and switching on the roof is the upgrade. */
  return picked.length > 0 ? picked : run.flags.includes('installDone') ? ['solar'] : [];
};

/** The repairs a depot run actually made. The simplified mission makes none, so none are credited. */
export const depotRepairs = (run: MissionRun): ('sensor' | 'leak' | 'idling')[] => [
  ...(run.flags.includes('fixSensor') ? (['sensor'] as const) : []),
  ...(run.flags.includes('fixLeak') ? (['leak'] as const) : []),
  ...(run.flags.includes('engineOff') ? (['idling'] as const) : []),
];

/** The transport problem for a run: fixed for most missions, built from the player's choices at the depot. */
export function missionTransport(def: MissionDef, run: MissionRun): TransportProblem | null {
  /* Runs saved before the simplification kept their plans: they are scored on the problem they planned. */
  if (def.id === HORNBILL_MISSION.id && run.plan !== null) {
    return HORNBILL_TRANSPORT;
  }
  if (def.id === RIVER_MISSION.id && run.plan !== null) {
    return RIVER_TRANSPORT;
  }
  if (def.id === ECO_MISSION.id) {
    if (run.plan === null) {
      return null;
    }
    const cargo: DepotCargo[] = UPGRADE_OPTIONS.filter((o) => chosenUpgrades(run).includes(o.id) && o.cargo !== null).map((o) => o.cargo as DepotCargo);
    return depotTransport(cargo);
  }
  return def.transport;
}

export const missionById = (id: string): MissionDef | null => MISSIONS.find((m) => m.id === id) ?? null;

export interface MissionRun {
  missionId: string;
  /** Unique per attempt, so a retried or repeated completion is only ever counted once. */
  runId: string;
  step: number;
  flags: string[];
  plan: Plan | null;
  /** Which version of the missions' steps this run was started under. */
  v?: number;
}

/**
 * 2: the simplified three-step missions. A run left half-way under the old, longer steps
 * would resume in a muddle, so it is not resumed: the mission simply starts afresh.
 * Finished missions are kept in the save's records and are not affected.
 */
export const RUN_VERSION = 2;

export const newRun = (missionId: string, runId: string): MissionRun => ({ missionId, runId, step: 0, flags: [], plan: null, v: RUN_VERSION });

export const hasFlag = (run: MissionRun, flag: string): boolean => run.flags.includes(flag);

export const isFinished = (def: MissionDef, run: MissionRun): boolean => run.step >= def.steps.length;

export const currentStep = (def: MissionDef, run: MissionRun): MissionStep | null => def.steps[run.step] ?? null;

/** Sets a flag and moves on past any step that is now finished. Setting a flag twice changes nothing. */
export function setFlag(def: MissionDef, run: MissionRun, flag: string): MissionRun {
  const flags = run.flags.includes(flag) ? run.flags : [...run.flags, flag];
  let step = run.step;
  while (step < def.steps.length && def.steps[step].needs.every((n) => flags.includes(n))) {
    step += 1;
  }
  return { ...run, flags, step };
}

/** Checks a run read back from a save still makes sense for this mission. */
export function restoreRun(def: MissionDef, raw: unknown): MissionRun | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const r = raw as Partial<MissionRun>;
  if (r.missionId !== def.id || typeof r.runId !== 'string' || !Array.isArray(r.flags) || !r.flags.every((f) => typeof f === 'string') || r.v !== RUN_VERSION) {
    return null;
  }
  const plan = r.plan !== null && typeof r.plan === 'object' && typeof r.plan.fleetId === 'string' && typeof r.plan.routeId === 'string' && typeof r.plan.departureId === 'string' ? r.plan : null;
  let run: MissionRun = { missionId: def.id, runId: r.runId, step: 0, flags: [], plan, v: RUN_VERSION };
  for (const flag of r.flags) {
    run = setFlag(def, run, flag);
  }
  /* A run past planning must have a plan it can be scored on. */
  if (run.flags.includes('planChosen') && run.plan === null) {
    return null;
  }
  return run;
}
