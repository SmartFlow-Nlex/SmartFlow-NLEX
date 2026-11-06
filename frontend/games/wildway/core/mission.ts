import { UPGRADE_OPTIONS, type Upgrade } from './facility';
import { depotTransport, HORNBILL_TRANSPORT, RIVER_TRANSPORT, type DepotCargo, type Plan, type TransportProblem } from './transport';

/**
 * Missions as data, and the state machine that runs them: a mission is an ordered list
 * of steps, each finished by flags the world sets. Pure, so saving, resuming and replays
 * can be tested without drawing anything.
 */

export type ZoneId = 'forest' | 'station' | 'plaza' | 'river' | 'depot';

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
  summary: 'A rufous hornbill is in difficulty near a damaged forest access road at Malaya Ridge, in the Sierra Madre foothills.',
  fiction: 'Malaya Ridge and its partner station are fictional, far from NLEX: no hornbills live beside the expressway. The Command Center only plans the supply run.',
  environmentObjectives: [],
  speciesIds: ['sp-009'],
  regionId: 'malaya-ridge',
  storyIndividuals: [{ id: 'hornbill-male-1', speciesId: 'sp-009', defaultNickname: 'Kalaw' }],
  requiredTasks: ['Observe from a safe distance', 'Plan the deliveries', 'Restore access', 'Keep the area quiet', 'Remove the disturbance', 'Repair the forest connection'],
  serviceConstraints: 'Three staff and the assessment kit by 10:00 AM; saplings and tools by 11:30 AM.',
  transport: HORNBILL_TRANSPORT,
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
    { id: 'call', zone: 'station', objective: 'obj.call', needs: ['callTaken'], target: 'navie' },
    { id: 'walk', zone: 'forest', objective: 'obj.walk', needs: ['reachedBank'], target: 'bank' },
    { id: 'scan', zone: 'forest', objective: 'obj.scan', needs: ['birdScanned'], target: 'bird' },
    { id: 'ranger', zone: 'forest', objective: 'obj.ranger', needs: ['rangerAsked'], target: 'ranger' },
    { id: 'plan', zone: 'station', objective: 'obj.plan', needs: ['planChosen'], target: 'board' },
    { id: 'log', zone: 'forest', objective: 'obj.log', needs: ['logCleared'], target: 'log' },
    { id: 'cross', zone: 'forest', objective: 'obj.cross', needs: ['crossingOpen'], target: 'crossing' },
    { id: 'deliver', zone: 'forest', objective: 'obj.deliver', needs: ['kitDelivered', 'saplingsDelivered'], target: 'crates' },
    { id: 'signs', zone: 'forest', objective: 'obj.signs', needs: ['signA', 'signB'], target: 'signs' },
    { id: 'assess', zone: 'forest', objective: 'obj.assess', needs: ['assessed'], target: 'tent' },
    { id: 'noise', zone: 'forest', objective: 'obj.noise', needs: ['noiseFound'], target: 'noiseSpot' },
    { id: 'noiseOff', zone: 'forest', objective: 'obj.noiseOff', needs: ['noiseOff'], target: 'generator' },
    { id: 'plant', zone: 'forest', objective: 'obj.plant', needs: ['plantA', 'plantB', 'plantC', 'plantD'], target: 'stakes' },
    { id: 'release', zone: 'forest', objective: 'obj.release', needs: ['released'], target: 'tent' },
  ],
};

const NLEX_REWARDS = { guardianPoints: 100, plannedWell: 25, optionalChannel: 0, perClue: 5 };

export const GRIDLOCK_MISSION: MissionDef = {
  id: 'nlex-gridlock',
  title: 'The Great NLEX Gridlock',
  chapter: 0,
  kind: 'nlex',
  locationId: 'bocaue',
  summary: 'The Wasteworks has jammed a toll plaza. Cars are queuing with their engines running.',
  fiction: 'A made-up version of a toll plaza at Bocaue. None of this happened there, and every traffic number is invented for the game.',
  environmentObjectives: [{ id: 'plaza-flow', label: 'Toll plaza flowing again' }],
  speciesIds: [],
  regionId: 'bocaue-plaza',
  storyIndividuals: [],
  requiredTasks: ['Find the faults', 'Repair the signal, the cable and the jammer', 'Set the lanes safely', 'Reopen the plaza'],
  serviceConstraints: 'Lane 4 stays closed for repairs. Three toll collectors are on shift.',
  transport: null,
  rescueObjectives: [],
  habitatObjectives: [],
  evidenceReferences: [],
  rewards: NLEX_REWARDS,
  steps: [
    { id: 'call', zone: 'station', objective: 'obj.call', needs: ['callTaken'], target: 'navie' },
    { id: 'survey', zone: 'plaza', objective: 'obj.plazaSurvey', needs: ['plazaSurveyed'], target: 'overlook' },
    { id: 'repair', zone: 'plaza', objective: 'obj.plazaRepair', needs: ['fixSignal', 'fixCable', 'removeJammer'], target: 'faults' },
    { id: 'lanes', zone: 'plaza', objective: 'obj.plazaLanes', needs: ['lanesSet'], target: 'console' },
    { id: 'reopen', zone: 'plaza', objective: 'obj.plazaReopen', needs: ['reopened'], target: 'console' },
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

export const RIVER_MISSION: MissionDef = {
  id: 'nlex-river',
  title: 'River Rescue',
  chapter: 0,
  kind: 'nlex',
  locationId: 'valenzuela',
  summary: 'Rubbish is choking a creek in a community off the expressway. The water has stopped flowing.',
  fiction: 'A made-up creek and barangay near Valenzuela. No real waterway is described, and the waste amounts are invented for the game.',
  environmentObjectives: [{ id: 'creek-clean', label: 'Community creek cleared and flowing' }],
  speciesIds: [],
  regionId: 'valenzuela-creek',
  storyIndividuals: [],
  requiredTasks: ['Meet the barangay officer', 'Survey the creek', 'Leave the oil to the specialist', 'Collect and sort the rubbish', 'Clear the trash rack', 'Open the floodgate', 'Plan the collection run'],
  serviceConstraints: 'Waste stays sorted. Everything is collected before the afternoon rain.',
  transport: RIVER_TRANSPORT,
  rescueObjectives: [],
  habitatObjectives: [],
  evidenceReferences: [],
  rewards: NLEX_REWARDS,
  steps: [
    { id: 'call', zone: 'station', objective: 'obj.call', needs: ['callTaken'], target: 'navie' },
    { id: 'meet', zone: 'river', objective: 'obj.riverMeet', needs: ['officerMet'], target: 'officer' },
    { id: 'survey', zone: 'river', objective: 'obj.riverSurvey', needs: ['riverSurveyed'], target: 'footbridge' },
    { id: 'hazard', zone: 'river', objective: 'obj.riverHazard', needs: ['hazardSafe'], target: 'drum' },
    { id: 'collect', zone: 'river', objective: 'obj.riverCollect', needs: RIVER_ITEMS.map((i) => `sorted:${i.id}`), target: 'litter' },
    { id: 'rack', zone: 'river', objective: 'obj.riverRack', needs: ['rackCleared'], target: 'rack' },
    { id: 'gate', zone: 'river', objective: 'obj.riverGate', needs: ['flowRestored'], target: 'gate' },
    { id: 'plan', zone: 'river', objective: 'obj.riverPlan', needs: ['planChosen'], target: 'dispatch' },
  ],
};

export const ECO_MISSION: MissionDef = {
  id: 'nlex-eco',
  title: 'The Eco Expressway',
  chapter: 0,
  kind: 'nlex',
  locationId: 'san-fernando',
  summary: 'An expressway maintenance depot is wasting energy all day. The Wasteworks made sure of it.',
  fiction: 'A made-up maintenance depot near San Fernando. Every wattage and hour count is a game assumption, shown with the sums.',
  environmentObjectives: [{ id: 'depot-lean', label: 'Depot energy waste cut' }],
  speciesIds: [],
  regionId: 'san-fernando-depot',
  storyIndividuals: [],
  requiredTasks: ['Meet the depot chief', 'Audit the energy', 'Fix the sensor, the leak and the idling', 'Choose upgrades within the crew day', 'Plan the delivery', 'Install the upgrades'],
  serviceConstraints: 'The installers have one working day.',
  transport: null,
  rescueObjectives: [],
  habitatObjectives: [],
  evidenceReferences: [],
  rewards: NLEX_REWARDS,
  steps: [
    { id: 'call', zone: 'station', objective: 'obj.call', needs: ['callTaken'], target: 'navie' },
    { id: 'meet', zone: 'depot', objective: 'obj.depotMeet', needs: ['chiefMet'], target: 'chief' },
    { id: 'audit', zone: 'depot', objective: 'obj.depotAudit', needs: ['audited'], target: 'meter' },
    { id: 'repair', zone: 'depot', objective: 'obj.depotRepair', needs: ['fixSensor', 'fixLeak', 'engineOff'], target: 'faults' },
    { id: 'energy', zone: 'depot', objective: 'obj.depotEnergy', needs: ['energyPlanned'], target: 'office' },
    { id: 'plan', zone: 'depot', objective: 'obj.depotPlan', needs: ['planChosen'], target: 'dispatch' },
    { id: 'install', zone: 'depot', objective: 'obj.depotInstall', needs: ['installDone'], target: 'install' },
  ],
};

export const MISSIONS: readonly MissionDef[] = [GRIDLOCK_MISSION, HORNBILL_MISSION, RIVER_MISSION, ECO_MISSION];

/** The upgrades a depot run chose, from its flags. */
export const chosenUpgrades = (run: MissionRun): Upgrade[] => UPGRADE_OPTIONS.filter((o) => run.flags.includes(`up:${o.id}`)).map((o) => o.id);

/** The transport problem for a run: fixed for most missions, built from the player's choices at the depot. */
export function missionTransport(def: MissionDef, run: MissionRun): TransportProblem | null {
  if (def.id === ECO_MISSION.id) {
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
}

export const newRun = (missionId: string, runId: string): MissionRun => ({ missionId, runId, step: 0, flags: [], plan: null });

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
  if (r.missionId !== def.id || typeof r.runId !== 'string' || !Array.isArray(r.flags) || !r.flags.every((f) => typeof f === 'string')) {
    return null;
  }
  const plan = r.plan !== null && typeof r.plan === 'object' && typeof r.plan.fleetId === 'string' && typeof r.plan.routeId === 'string' && typeof r.plan.departureId === 'string' ? r.plan : null;
  let run: MissionRun = { missionId: def.id, runId: r.runId, step: 0, flags: [], plan };
  for (const flag of r.flags) {
    run = setFlag(def, run, flag);
  }
  /* A run past planning must have a plan it can be scored on. */
  if (run.flags.includes('planChosen') && run.plan === null) {
    return null;
  }
  return run;
}
