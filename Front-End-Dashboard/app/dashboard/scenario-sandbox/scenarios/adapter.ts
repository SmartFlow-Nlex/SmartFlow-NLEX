import type { Interventions } from "../simulation";
import { ASSUMPTIONS, closureStretch, incidentSlotsFor, operatorLaneToEngineIndex, type ClosureStretch, type RainIntensity } from "./assumptions";
import { TEMPLATE_BY_FAMILY, assertNever, phaseOffsetFractions, type CarriagewayReach, type FamilyKey, type PhaseDef, type ScenarioVariant, type VehicleKind } from "./catalogue";
import { resolveDuration, type CalibrationLevel, type DurationMode, type ResolvedDuration } from "./sampler";

/* ══════════════════════════════════════════════════════════════════════════════
   SCENARIO ADAPTER

   Turns scenario events into the engine's own Interventions, and keeps that
   apart from what the operator has set by hand.

   ONE pure function does the work: composeInterventions(manual, events, simTime,
   road) -> { interventions, owners }. Everything else here either prepares its
   inputs (addEvent stores an event with its duration already resolved) or
   applies its result (EngineBinding.apply). The animation loop and the
   live-apply effect both go through EngineBinding.apply, so there is exactly one
   place where "what does the engine hold right now" is decided, and neither
   caller can overwrite the other's result.

   Who owns what, while an event runs:
     closure stretch  the one closurePoint/closureEnd pair. A collision event
                      owns it in every phase that blocks a lane. The operator may
                      close MORE lanes on it, never reopen the event's, and cannot
                      move it.
     speed zone       a shoulder breakdown owns it for its whole duration, unless
                      the operator is using it (a speed limit is set), in which
                      case the event yields and changes nothing.
     incidents        the engine keeps a list, so events add their own and the
                      operator's stay. An in-lane breakdown adds stalled
                      obstacles for its whole duration, removed when it ends.

   Times: an event's schedule is in seconds after the END OF WARM-UP. The engine
   clock (sim.time) counts from 0 including warm-up; scenarioTimeS converts, and
   every comparison here is made on the converted value so the animation loop and
   composeInterventions can never disagree about which phase is current.

   This file does not touch simulation.ts. Where a scenario would need the
   engine to do something it cannot, the event is flagged, never approximated
   silently.
══════════════════════════════════════════════════════════════════════════════ */

/** One of the engine's stalled obstacles. */
export type Incident = Interventions["incidents"][number];

/**
 * Which carriageway an event runs on. Two independent TrafficSims, one per
 * direction (see the page's useDirectionSim) — this is what tells their
 * events apart. An event carries this explicitly (rather than direction being
 * implicit in which per-direction list it sits in) because a message, an
 * event row, or a future persisted record all need to NAME the direction
 * without first reconstructing it from list membership.
 */
export type Direction = "NB" | "SB";

/** The road an event runs on. `laneCount` and `segmentLengthM` come from the engine itself (see EngineBinding.apply). */
export type Road = {
  readonly laneCount: number;
  readonly segmentLengthM: number;
  /** Toll plazas and service areas on this stretch, by id — what a site event may name. Absent: not checked. */
  readonly facilityIds?: ReadonlySet<string>;
  /** Seconds of warm-up. An event's times are counted from the end of it. */
  readonly warmupS: number;
  /** Metres along the simulated stretch, in the direction of travel, for an app km-post. May fall outside [0, segmentLengthM]. */
  readonly metresAt: (km: number) => number;
};

/** What the operator has set by hand, apart from incidents. */
export type ManualControls = {
  readonly closedLanes: readonly boolean[];
  readonly closurePoint: number;
  readonly closureEnd: number;
  readonly showClosurePreview: boolean;
  readonly speedLimitKmh: number | null;
  readonly speedZone: readonly [number, number];
};

/** Everything the operator has set by hand, including the incidents they placed. */
export type ManualInterventions = ManualControls & { readonly incidents: readonly Incident[] };

/** The part of the operator's settings a closure event has to be checked against. */
export type ManualClosure = Pick<ManualControls, "closedLanes" | "closurePoint" | "closureEnd">;

/** Two stretches closer than this (metres, at each end) are the same stretch. */
export const SAME_STRETCH_TOL_M = 0.5;

/**
 * True when the operator has a closure of their own (any lane closed by hand) on a
 * stretch that is not `stretch`. Lanes are never moved from the operator's stretch
 * onto an event's, so such an event closes its own lanes on its own stretch beside
 * the operator's (composeInterventions) rather than taking the shared one. A closure
 * on the very same stretch is no conflict: nothing would move.
 */
export function manualClosureConflicts(manual: ManualClosure, stretch: { readonly closurePointM: number; readonly closureEndM: number }): boolean {
  if (!manual.closedLanes.some(Boolean)) return false;
  return Math.abs(manual.closurePoint - stretch.closurePointM) > SAME_STRETCH_TOL_M || Math.abs(manual.closureEnd - stretch.closureEndM) > SAME_STRETCH_TOL_M;
}

/** Seconds since the end of warm-up: the clock event schedules are written in. Negative during warm-up. */
export function scenarioTimeS(simTimeS: number, road: Pick<Road, "warmupS">): number {
  return simTimeS - road.warmupS;
}

/** A phase shorter than this is treated as zero-length and skipped (a phase share of 0 or 1, or a duration that rounds to nothing). */
export const ZERO_PHASE_S = 1e-6;

/* ─────────────────────────────────────────────────────────────────────────────
   Events
───────────────────────────────────────────────────────────────────────────── */

export type ScheduledPhase = {
  readonly id: string;
  readonly label: string;
  /** Where the phase starts and how long it lasts, in seconds from the start of the event. */
  readonly offsetS: number;
  readonly durationS: number;
  readonly minutes: number;
  /** Zero-length: never applied, no engine change, but still listed. */
  readonly skipped: boolean;
  /** For the operator: "<label> — 12 min", or "<label> — 0 min (skipped)". */
  readonly text: string;
  /** Lanes this phase blocks (see ASSUMPTIONS.LANES_BLOCKED). */
  readonly lanesBlocked: number;
  /** How far downstream of the event the scene extends in this phase; null for families that do not use a closure. */
  readonly wreckLengthM: number | null;
};

/**
 * Where an event happens when it is not on the carriageway itself: at a toll
 * plaza's booths, a service area's pumps, or on the road into either.
 *
 * A breakdown at a booth or a vehicle hitting the toll equipment does not close
 * a lane of the expressway; it shuts a booth, and the plaza loses that share of
 * its capacity. Whether that reaches the expressway is then the plaza's doing —
 * its queue grows until it spills back — which is exactly the effect an operator
 * placing an event "at the toll gate" wants to see.
 */
export type EventSite = {
  readonly facilityId: string;
  readonly facilityName: string;
  readonly kind: "booth" | "pump" | "approach";
  /** Booths or pumps it shuts, 0-based across the plaza from the road outward; empty on the approach. */
  readonly stations: readonly number[];
};

/**
 * A scenario event, stored with everything resolved: the duration is drawn ONCE,
 * when the event is added, and kept here. Nothing downstream re-samples, so a
 * rebuild or a re-render replays the same event.
 */
export type ScenarioEvent = {
  readonly id: string;
  /** For messages: "Breakdown in a lane #2". */
  readonly name: string;
  /** Which carriageway this event runs on. Also which per-direction list it is stored in — see verify.ts's directionBucketsConsistent, which checks the two never drift apart. */
  readonly direction: Direction;
  readonly variant: ScenarioVariant;
  /** Operator lane number (1-based); null for a shoulder breakdown, which has no lane. */
  readonly lane: number | null;
  /**
   * Extra operator lane numbers (1-based) the operator explicitly added, on top of `lane` — only ever
   * non-empty for a "closure" family where blocking more than one lane is plausible (multi-vehicle
   * collision, overturned vehicle, flood, scheduled roadworks; see ScenarioPanel's MULTI_LANE_FAMILIES).
   * When non-empty, composeInterventions closes exactly `lane` plus these, replacing the automatic
   * outward-spill guess (blockedLanes()) for this event. Empty for every other event, which keeps the
   * automatic behaviour exactly as before this existed.
   */
  readonly extraLanes: readonly number[];
  /** App km-post. Converted to metres against the current stretch when used, so a route change moves nothing silently. */
  readonly positionKm: number;
  /**
   * The stretch the operator gave — "within Km 12.30–12.40" — low km to high, or null/absent when a single km was
   * given. When set it IS where the event is: a collision, flood or roadworks closes exactly this stretch (every
   * phase that blocks a lane), a shoulder breakdown slows traffic over exactly this stretch, and positionKm — the
   * wreck, the stalled vehicle — is placed inside it (positionInStretch). Without it the event is a point and its
   * closure is laid out round the point by the assumptions (UPSTREAM_BUFFER_M before it, CLOSURE_LENGTH_M after),
   * which put most of a "12.30–12.40" collision outside 12.30–12.40.
   */
  readonly stretchKm?: KmStretch | null;
  /** Seconds after the end of warm-up. */
  readonly startS: number;
  /** How the duration was chosen, kept so the operator can see it (a sampled event keeps its seed). */
  readonly duration: DurationMode;
  /**
   * The resolved duration and where it came from: minutes, response share,
   * calibration entry / level / n / low-sample flag, whether a cap applied and the
   * level and n it came from, and the uncapped draw. Kept whole so nothing has to
   * be re-derived later.
   */
  readonly resolved: ResolvedDuration;
  /** In order. Includes skipped (zero-length) phases. */
  readonly phases: readonly ScheduledPhase[];
  /** startS plus the whole duration, in seconds after the end of warm-up. */
  readonly endS: number;
  /** At a plaza or service area instead of on a lane; null on the carriageway. */
  readonly site: EventSite | null;
};

/** A stretch of road, app km, `fromKm` the lower. */
export type KmStretch = { readonly fromKm: number; readonly toKm: number };

/** The shortest stretch an event may be given, m: below this it is a point, and should be given as one. */
export const MIN_EVENT_STRETCH_M = 20;

/**
 * Where inside a stretch an event's own point goes (the wreck's front, the stalled vehicle's nose), app km.
 *
 * A collision's vehicles come to rest just DOWNSTREAM of its point — a pile about six metres a vehicle long
 * (the engine's crashAt) — and its police, ambulance and cones stand UPSTREAM of it, so the point is a little
 * before the middle, leaving the pile inside the stretch's far end. Roadworks park two trucks at the point and
 * 26 m behind it, so theirs is further on. Anything else is the middle. "Upstream" is the end traffic comes in
 * at: the low km northbound, the high km southbound.
 */
export function positionInStretch(variant: ScenarioVariant, direction: Direction, s: KmStretch): number {
  const lo = Math.min(s.fromKm, s.toKm);
  const hi = Math.max(s.fromKm, s.toKm);
  const len = (hi - lo) * 1000;
  let along: number;
  switch (variant.family) {
    case "minor_collision":
    case "multi_vehicle_collision":
    case "self_accident":
    case "overturned_vehicle": {
      const pile = (sceneOf(variant)?.want ?? 1) * 6 + 4;
      along = Math.max(0, Math.min(Math.max(len * 0.45, Math.min(30, len * 0.3)), len - pile - 2));
      break;
    }
    case "scheduled_roadworks":
      along = len * 0.6;
      break;
    default:
      along = len / 2;
  }
  const km = direction === "NB" ? lo + along / 1000 : hi - along / 1000;
  return Number(km.toFixed(4));
}

/** An event's own stretch in metres along the run, low to high; null when it has none. */
export function eventStretchM(event: Pick<ScenarioEvent, "stretchKm">, road: Pick<Road, "metresAt">): { readonly fromM: number; readonly toM: number } | null {
  const s = event.stretchKm;
  if (!s) return null;
  const a = road.metresAt(s.fromKm);
  const b = road.metresAt(s.toKm);
  return { fromM: Math.min(a, b), toM: Math.max(a, b) };
}

export type NewEventSpec = {
  readonly variant: ScenarioVariant;
  readonly direction: Direction;
  /** Operator lane number, 1-based. Ignored for a shoulder breakdown. */
  readonly lane: number | null;
  /** Extra operator lane numbers (1-based), beyond `lane`. See ScenarioEvent.extraLanes. Optional — every caller that doesn't care about multi-lane events (which is most of them) can omit it and gets none, same as before this field existed. */
  readonly extraLanes?: readonly number[];
  readonly positionKm: number;
  /** A stretch instead of a point (see ScenarioEvent.stretchKm). positionKm is then worked out from it. Ignored for rain and at a plaza. */
  readonly stretchKm?: KmStretch | null;
  /** Minutes after the end of warm-up. */
  readonly startMinutes: number;
  readonly duration: DurationMode;
  /** At a plaza or service area. Omit for the carriageway. */
  readonly site?: EventSite | null;
};

export type AddResult =
  | { readonly ok: true; readonly events: readonly ScenarioEvent[]; readonly event: ScenarioEvent }
  | { readonly ok: false; readonly reason: string };

function fmtMinutes(minutes: number): string {
  const digits = minutes < 1 ? 2 : 1;
  return `${Number(minutes.toFixed(digits))} min`;
}

function buildPhases<Id extends string>(
  phases: readonly PhaseDef<Id>[],
  resolved: ResolvedDuration,
  lanesBlocked: Readonly<Record<Id, number>>,
  wreckLengthM: Readonly<Record<Id, number>> | null,
): readonly ScheduledPhase[] {
  const fractions = phaseOffsetFractions(phases, resolved.responseShare);
  const totalS = resolved.minutes * 60;
  return phases.map((p, i): ScheduledPhase => {
    const start = fractions[i];
    const end = i + 1 < phases.length ? fractions[i + 1] : 1;
    const offsetS = start * totalS;
    const durationS = Math.max(0, (end - start) * totalS);
    const skipped = durationS < ZERO_PHASE_S;
    const minutes = skipped ? 0 : durationS / 60;
    return {
      id: p.id,
      label: p.label,
      offsetS,
      durationS: skipped ? 0 : durationS,
      minutes,
      skipped,
      text: skipped ? `${p.label} — 0 min (skipped)` : `${p.label} — ${fmtMinutes(minutes)}`,
      lanesBlocked: lanesBlocked[p.id],
      wreckLengthM: wreckLengthM === null ? null : wreckLengthM[p.id],
    };
  });
}

/**
 * The phases of a variant for a resolved duration. One case per family, so a new
 * family cannot be forgotten. Exported so a test can lay out a synthetic duration
 * (a response share of exactly 0 or 1) without going through the sampler.
 */
export function schedulePhases(variant: ScenarioVariant, resolved: ResolvedDuration): readonly ScheduledPhase[] {
  const blocked = ASSUMPTIONS.LANES_BLOCKED.value;
  const wreck = ASSUMPTIONS.CLOSURE_LENGTH_M.value;
  switch (variant.family) {
    case "breakdown_in_lane":
      return buildPhases(TEMPLATE_BY_FAMILY.breakdown_in_lane.phases, resolved, blocked.breakdown_in_lane, null);
    case "breakdown_shoulder":
      return buildPhases(TEMPLATE_BY_FAMILY.breakdown_shoulder.phases, resolved, blocked.breakdown_shoulder, null);
    case "minor_collision":
      return buildPhases(TEMPLATE_BY_FAMILY.minor_collision.phases, resolved, blocked.minor_collision, wreck.minor_collision);
    case "multi_vehicle_collision":
      return buildPhases(TEMPLATE_BY_FAMILY.multi_vehicle_collision.phases, resolved, blocked.multi_vehicle_collision, wreck.multi_vehicle_collision);
    case "self_accident":
      return buildPhases(TEMPLATE_BY_FAMILY.self_accident.phases, resolved, blocked.self_accident, wreck.self_accident);
    case "overturned_vehicle":
      return buildPhases(TEMPLATE_BY_FAMILY.overturned_vehicle.phases, resolved, blocked.overturned_vehicle, wreck.overturned_vehicle);
    case "flood":
      return buildPhases(TEMPLATE_BY_FAMILY.flood.phases, resolved, blocked.flood, wreck.flood);
    case "scheduled_roadworks":
      return buildPhases(TEMPLATE_BY_FAMILY.scheduled_roadworks.phases, resolved, blocked.scheduled_roadworks, wreck.scheduled_roadworks);
    case "rain":
      return buildPhases(TEMPLATE_BY_FAMILY.rain.phases, resolved, blocked.rain, null);
    default:
      return assertNever(variant);
  }
}

/** Which engine lever an event's family pulls. */
type Effect = "incident" | "speed_zone" | "closure";
function effectOf(family: FamilyKey): Effect {
  switch (family) {
    case "breakdown_in_lane":
      return "incident";
    case "breakdown_shoulder":
      return "speed_zone";
    case "minor_collision":
    case "multi_vehicle_collision":
    case "self_accident":
    case "overturned_vehicle":
    case "flood":
    case "scheduled_roadworks":
      return "closure";
    case "rain":
      return "speed_zone";
    default:
      return assertNever(family);
  }
}

/**
 * Seconds before an event with vehicles in it starts that the engine picks them out of the traffic approaching the
 * spot. They drive on as everyone does and it happens to them on time — so the event is seen coming, and made of
 * cars that were already on the road, rather than appearing.
 */
export const SCENE_LEAD_S = 12;

/** The engine classes of the breakdown vehicle kinds (the engine's own: car 1, bus 2, truck 3). */
const ENGINE_CLASS: Readonly<Record<VehicleKind, 1 | 2 | 3>> = { car: 1, bus: 2, truck: 3 };

/** How a family's scene is made of the traffic (the engine's crashAt), or null for one with no vehicles in it. */
export type SceneSpec = {
  readonly kind: "collision" | "pileup" | "self" | "overturn" | "breakdown" | "shoulder";
  /** How many vehicles. */
  readonly want: number;
  /** The class to pick if one is coming: the one that broke down, or a truck to overturn. */
  readonly prefer: 1 | 2 | 3 | null;
  /** Whether a recovery truck is sent (at the tow or service phase). A minor collision's cars are driven off. */
  readonly tow: boolean;
};

/** A breakdown's lead: it coasts to a stop with its hazards on, which from expressway speed takes about a quarter of
 *  a minute, and a little more is allowed for a vehicle of the kind asked for to come along. Picked SCENE_LEAD_S
 *  ahead like a crash, every breakdown came to rest half a minute after its start time. */
export const BREAKDOWN_LEAD_S = 40;
/** A works convoy's pace up the shoulder (m/s, door to door), and how far short of its place it decides where to park. */
/* The works trucks' drive in, in their own lane at about 13 m/s, and the seconds to pull up and get the board lit: they
   are parked a little before the lane shuts, which is what a crew setting out a closure does. */
const WORKS_PACE_MPS = 13;
const WORKS_SETTLE_S = 10;

/**
 * How long before its start an event has to begin being set up on the road, seconds; 0 for one that needs nothing.
 *
 *   - a crash: SCENE_LEAD_S, to pick its vehicles out of the approaching traffic;
 *   - a breakdown: BREAKDOWN_LEAD_S;
 *   - roadworks: the works trucks' drive from the entrance, so that they reach the lane as it closes. Sent at the
 *     start, they arrived half a minute later on a short window and three minutes later on a long one, and until
 *     then the "works" were a closed lane with nothing in it. Capped: on a very long window they are simply late.
 */
export function sceneLeadS(event: Pick<ScenarioEvent, "variant" | "site" | "positionKm">, road: Pick<Road, "metresAt">): number {
  if (event.site) return 0;
  if (event.variant.family === "scheduled_roadworks") {
    const at = road.metresAt(event.positionKm);
    return Number.isFinite(at) ? Math.max(0, Math.min(240, Math.round(at / WORKS_PACE_MPS + WORKS_SETTLE_S))) : 0;
  }
  const scene = sceneOf(event.variant);
  if (scene === null) return 0;
  return scene.kind === "breakdown" || scene.kind === "shoulder" ? BREAKDOWN_LEAD_S : SCENE_LEAD_S;
}

/**
 * When the first responder should be AT the scene, seconds after the event's start — read off the event's own
 * phases, which is where its response time is.
 *
 *   - Followed by a tow or service phase: three-quarters of a minute before that phase begins, so the label's
 *     "awaiting response" is true for nearly all of it and the police are there when the recovery is called.
 *   - Not followed by one (a minor collision: blocked, then cleared): half way through the blocked phase — they
 *     are what gets the lane cleared, so they are there for the second half of it.
 * Never under 20 s: nobody is on scene the instant it happens.
 */
export function responseArrivalS(event: Pick<ScenarioEvent, "phases">): number {
  const live = event.phases.filter((p) => !p.skipped);
  if (live.length === 0) return 20;
  const first = live[0];
  const next = live[1];
  const recovery = next !== undefined && (next.id === "tow" || next.id === "service");
  return Math.max(20, recovery ? first.durationS - 45 : first.durationS * 0.5);
}

export function sceneOf(variant: ScenarioVariant): SceneSpec | null {
  switch (variant.family) {
    case "minor_collision":
      return { kind: "collision", want: 2, prefer: null, tow: false };
    case "multi_vehicle_collision":
      return { kind: "pileup", want: 4, prefer: null, tow: true };
    case "self_accident":
      return { kind: "self", want: 1, prefer: null, tow: true };
    case "overturned_vehicle":
      return { kind: "overturn", want: 1, prefer: 3, tow: true };
    case "breakdown_in_lane":
      return { kind: "breakdown", want: 1, prefer: ENGINE_CLASS[variant.vehicle], tow: true };
    case "breakdown_shoulder":
      return { kind: "shoulder", want: 1, prefer: ENGINE_CLASS[variant.vehicle], tow: true };
    case "flood":
    case "scheduled_roadworks":
    case "rain":
      return null;
    default:
      return assertNever(variant);
  }
}

/** The vehicle a breakdown variant is about, for its obstacle length. Null for the accident families. */
function breakdownVehicle(variant: ScenarioVariant): VehicleKind | null {
  switch (variant.family) {
    case "breakdown_in_lane":
    case "breakdown_shoulder":
      return variant.vehicle;
    case "minor_collision":
    case "multi_vehicle_collision":
    case "self_accident":
    case "overturned_vehicle":
    case "flood":
    case "scheduled_roadworks":
    case "rain":
      return null;
    default:
      return assertNever(variant);
  }
}

/**
 * The speed zone and limit a speed_zone-effect variant places at `positionM` on
 * `road`. Null for a family whose effect is not speed_zone (effectOf would not
 * have routed it here; the caller breaks rather than applying anything). A
 * shoulder breakdown's zone is local to its position (GAWK_ZONE_M); rain's is
 * the WHOLE segment regardless of position (RAIN_ZONE) at the cap for its
 * intensity (RAIN_SPEED_KMH) — positionKm still drives the event's canvas marker,
 * just not the zone extent.
 */
function speedZoneWindow(variant: ScenarioVariant, positionM: number, road: Road): { readonly zone: readonly [number, number]; readonly limitKmh: number } | null {
  switch (variant.family) {
    case "breakdown_shoulder": {
      const zone = ASSUMPTIONS.GAWK_ZONE_M.value;
      return {
        zone: [Math.max(0, positionM - zone.upstream), Math.min(road.segmentLengthM, positionM + zone.downstream)],
        limitKmh: ASSUMPTIONS.GAWK_SPEED_KMH.value.breakdown_shoulder,
      };
    }
    case "rain":
      return { zone: [0, road.segmentLengthM], limitKmh: ASSUMPTIONS.RAIN_SPEED_KMH.value[variant.intensity] };
    case "breakdown_in_lane":
    case "minor_collision":
    case "multi_vehicle_collision":
    case "self_accident":
    case "overturned_vehicle":
    case "flood":
    case "scheduled_roadworks":
      return null;
    default:
      return assertNever(variant);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Validity
───────────────────────────────────────────────────────────────────────────── */

/**
 * Why an event cannot run on this road, as sentences; empty when it can. Used when
 * an event is added (then it is refused) and on every compose (then a road that no
 * longer suits it flags it and it goes inert, but it is never dropped).
 */
export function eventProblems(event: ScenarioEvent, road: Road): readonly string[] {
  const problems: string[] = [];
  if (event.site) {
    if (road.facilityIds && !road.facilityIds.has(event.site.facilityId)) {
      problems.push(`${event.site.facilityName} is not on the simulated stretch`);
    }
    return problems;
  }
  const effect = effectOf(event.variant.family);
  const positionM = road.metresAt(event.positionKm);
  const own = eventStretchM(event, road);
  if (own !== null && event.stretchKm) {
    const range = `Km ${event.stretchKm.fromKm.toFixed(2)}–${event.stretchKm.toKm.toFixed(2)}`;
    if (!Number.isFinite(own.fromM) || !Number.isFinite(own.toM) || own.fromM < -1 || own.toM > road.segmentLengthM + 1) {
      problems.push(`${range} runs outside the simulated stretch`);
    } else if (own.toM - own.fromM < MIN_EVENT_STRETCH_M - 0.5) {
      problems.push(`${range} is shorter than ${MIN_EVENT_STRETCH_M} m; give a single km instead`);
    }
  } else if (!Number.isFinite(positionM) || positionM < 0 || positionM > road.segmentLengthM) {
    problems.push(`Km ${event.positionKm.toFixed(2)} is outside the simulated stretch`);
  }
  if (effect !== "speed_zone") {
    if (event.lane === null) problems.push("it has no lane");
    else if (operatorLaneToEngineIndex(event.lane, road.laneCount) === null) {
      problems.push(`lane ${event.lane} does not exist on a ${road.laneCount}-lane road`);
    }
  }
  if (effect === "closure") {
    for (const opLane of event.extraLanes) {
      if (operatorLaneToEngineIndex(opLane, road.laneCount) === null) {
        problems.push(`extra lane ${opLane} does not exist on a ${road.laneCount}-lane road`);
      }
    }
    // With extra lanes added by hand, "every lane" is judged against what was actually
    // requested (deduped, same resolution composeInterventions uses), not the assumption's
    // phase count — an operator asking for 3 lanes on a 3-lane road is refused even though
    // the family's own LANES_BLOCKED figure might be smaller.
    const base = event.lane === null ? null : operatorLaneToEngineIndex(event.lane, road.laneCount);
    const manualCount = event.extraLanes.length > 0 && base !== null
      ? manualBlockedLanes(base, event.extraLanes, road.laneCount).length
      : null;
    for (const p of event.phases) {
      if (p.skipped || p.lanesBlocked <= 0) continue;
      const count = manualCount ?? p.lanesBlocked;
      // A flood may close the whole carriageway (the engine queues traffic behind it); nothing else may.
      if (count >= road.laneCount && event.variant.family !== "flood") problems.push(`"${p.label}" blocks ${count} lane${count === 1 ? "" : "s"}, which is every lane of a ${road.laneCount}-lane road`);
      else if (own === null && p.wreckLengthM !== null && Number.isFinite(positionM) && closureStretch(positionM, p.wreckLengthM, road.segmentLengthM) === null) {
        problems.push(`"${p.label}" leaves no closure stretch at Km ${event.positionKm.toFixed(2)}`);
      }
    }
  }
  return problems;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Timeline
───────────────────────────────────────────────────────────────────────────── */
export type EventState = "pending" | "active" | "done";

export function eventState(event: ScenarioEvent, scenarioT: number): EventState {
  if (scenarioT < event.startS) return "pending";
  if (scenarioT < event.endS) return "active";
  return "done";
}

/** The phase running at `scenarioT`: never a skipped one, and null before the event, after it, or in a gap. */
export function phaseAt(event: ScenarioEvent, scenarioT: number): ScheduledPhase | null {
  if (eventState(event, scenarioT) !== "active") return null;
  for (const p of event.phases) {
    if (p.skipped) continue;
    const from = event.startS + p.offsetS;
    if (scenarioT >= from && scenarioT < from + p.durationS) return p;
  }
  return null;
}

export type EventProgress = {
  readonly state: EventState;
  readonly phase: ScheduledPhase | null;
  /** Seconds into the event (0 before it starts, its length after it ends). */
  readonly elapsedS: number;
  readonly remainingS: number;
  /** Seconds left in the current phase; null when no phase is running. */
  readonly phaseRemainingS: number | null;
  /** Seconds until the event starts; 0 once it has. */
  readonly startsInS: number;
};

export function eventProgress(event: ScenarioEvent, scenarioT: number): EventProgress {
  const state = eventState(event, scenarioT);
  const total = event.endS - event.startS;
  const elapsedS = Math.min(total, Math.max(0, scenarioT - event.startS));
  const phase = phaseAt(event, scenarioT);
  return {
    state,
    phase,
    elapsedS,
    remainingS: total - elapsedS,
    phaseRemainingS: phase === null ? null : event.startS + phase.offsetS + phase.durationS - scenarioT,
    startsInS: Math.max(0, event.startS - scenarioT),
  };
}

/**
 * Every moment the state an event asks of the engine can change, in seconds after
 * the end of warm-up: its start, the start of each phase that has a length, and
 * its end. Only events that are valid on this road count. Sorted, no repeats.
 */
export function boundaryTimes(events: readonly ScenarioEvent[], road: Road): readonly number[] {
  const out = new Set<number>();
  for (const e of events) {
    if (eventProblems(e, road).length > 0) continue;
    out.add(e.startS);
    // A scene made of vehicles starts picking them out of the traffic a little early, and a works convoy sets off early (sceneLeadS).
    const lead = sceneLeadS(e, road);
    if (lead > 0) out.add(e.startS - lead);
    for (const p of e.phases) if (!p.skipped) out.add(e.startS + p.offsetS);
    out.add(e.endS);
  }
  return [...out].sort((a, b) => a - b);
}

/** The first boundary strictly after `scenarioT`, or null when none is left. */
export function nextBoundaryAfter(events: readonly ScenarioEvent[], road: Road, scenarioT: number): number | null {
  for (const t of boundaryTimes(events, road)) if (t > scenarioT) return t;
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Conflicts: an exclusive resource cannot be held by two events at once
───────────────────────────────────────────────────────────────────────────── */
type ExclusiveResource = "closure_stretch" | "speed_zone";
type Window = { readonly resource: ExclusiveResource; readonly fromS: number; readonly toS: number };

/**
 * When an event needs one of the engine's single-instance levers, in seconds after
 * the end of warm-up. A collision holds the closure stretch from the start of its
 * first lane-blocking phase to the end of its last; a shoulder breakdown holds the
 * speed zone for its whole duration. An in-lane breakdown uses the incident list,
 * which the engine shares, so it holds nothing exclusive.
 */
export function resourceWindows(event: ScenarioEvent): readonly Window[] {
  // At a plaza or service area it holds a booth, not the closure stretch or the speed zone.
  if (event.site) return [];
  const effect = effectOf(event.variant.family);
  switch (effect) {
    case "incident":
      return [];
    case "speed_zone":
      return [{ resource: "speed_zone", fromS: event.startS, toS: event.endS }];
    case "closure": {
      const blocking = event.phases.filter((p) => !p.skipped && p.lanesBlocked > 0);
      if (blocking.length === 0) return [];
      const from = Math.min(...blocking.map((p) => event.startS + p.offsetS));
      const to = Math.max(...blocking.map((p) => event.startS + p.offsetS + p.durationS));
      return [{ resource: "closure_stretch", fromS: from, toS: to }];
    }
    default:
      return assertNever(effect);
  }
}

function minutesAfterWarmup(s: number): string {
  return `+${Number((s / 60).toFixed(1))} min`;
}

/**
 * The first overlap between a new event and the events already stored, worded for the operator.
 * Null when there is none. Named to the candidate's carriageway: `existing` is always that same
 * direction's own event list (each direction keeps its own — see useDirectionSim), so a conflict
 * is always within one carriageway, never across the median.
 */
function conflictMessage(existing: readonly ScenarioEvent[], candidate: ScenarioEvent): string | null {
  const site = candidate.site;
  if (site) {
    // Two scenes in one booth lane at once cannot both be shown honestly; a booth can only break down once.
    for (const other of existing) {
      const o = other.site;
      if (!o || o.facilityId !== site.facilityId) continue;
      const clash = site.kind === "approach" || o.kind === "approach" || site.stations.some((x) => o.stations.includes(x));
      if (clash && candidate.startS < other.endS && other.startS < candidate.endS) {
        return (
          `${candidate.direction}: Cannot add "${candidate.name}" at ${site.facilityName}: "${other.name}" is already there from ` +
          `${minutesAfterWarmup(other.startS)} to ${minutesAfterWarmup(other.endS)}. Pick another booth or move one of them in time. Nothing was changed.`
        );
      }
    }
    return null;
  }
  // On the carriageway, events overlap freely: each has a closure or speed zone of its own (composeInterventions).
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Adding and removing events
───────────────────────────────────────────────────────────────────────────── */

/** "Breakdown in a lane #2"; rain names its intensity instead ("Heavy rain #1", "Light rain #2"). */
export function eventName(variant: ScenarioVariant, seq: number): string {
  if (variant.family === "rain") return `${variant.intensity[0].toUpperCase()}${variant.intensity.slice(1)} rain #${seq}`;
  return `${TEMPLATE_BY_FAMILY[variant.family].displayName} #${seq}`;
}

/**
 * Store a new event, or refuse it and say why. The duration is resolved here,
 * once. `seq` numbers the event for its name and id ("Breakdown in a lane #2"),
 * and the caller keeps it counting up, so a name is never reused. The stored
 * event's `direction` is exactly `spec.direction` — addEvent does not infer or
 * validate it against `events`/`road`, because it does not know which
 * per-direction list it was called for. Whoever stores the result into a
 * per-direction list must go through addEventToBucket, which does know and
 * refuses a mismatch (see directionBucketsConsistent).
 * Refused when the event cannot run on `road` (see eventProblems), or when it is at
 * a booth or pump another event holds at an overlapping time. Nothing else limits
 * how many events run at once: on the carriageway each has a closure or speed zone
 * of its own (composeInterventions). `manual` is kept for the callers' sake.
 */
export function addEvent(events: readonly ScenarioEvent[], spec: NewEventSpec, road: Road, seq: number, manual: ManualClosure): AddResult {
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError(`seq must be a positive integer, got ${seq}`);
  const name = eventName(spec.variant, seq);
  if (!Number.isFinite(spec.startMinutes) || spec.startMinutes < 0) {
    return { ok: false, reason: `Cannot add "${name}": its start must be zero or more minutes after warm-up, got ${spec.startMinutes}.` };
  }
  let resolved: ResolvedDuration;
  try {
    resolved = resolveDuration(spec.variant, spec.duration);
  } catch (e) {
    if (e instanceof RangeError) return { ok: false, reason: `Cannot add "${name}": ${e.message}.` };
    throw e;
  }
  const startS = spec.startMinutes * 60;
  // A stretch, where the operator gave one: it decides the point. Rain is the whole road; a plaza has its booths.
  const stretchKm: KmStretch | null =
    spec.stretchKm && !spec.site && spec.variant.family !== "rain"
      ? { fromKm: Math.min(spec.stretchKm.fromKm, spec.stretchKm.toKm), toKm: Math.max(spec.stretchKm.fromKm, spec.stretchKm.toKm) }
      : null;
  const event: ScenarioEvent = {
    id: `ev${seq}`,
    name,
    direction: spec.direction,
    variant: spec.variant,
    lane: spec.site ? null : effectOf(spec.variant.family) === "speed_zone" ? null : spec.lane,
    extraLanes: !spec.site && effectOf(spec.variant.family) === "closure" ? (spec.extraLanes ?? []) : [],
    positionKm: stretchKm ? positionInStretch(spec.variant, spec.direction, stretchKm) : spec.positionKm,
    stretchKm,
    startS,
    duration: spec.duration,
    resolved,
    phases: schedulePhases(spec.variant, resolved),
    endS: startS + resolved.minutes * 60,
    site: spec.site ?? null,
  };
  if (events.some((e) => e.id === event.id)) throw new RangeError(`an event with id ${event.id} already exists`);
  if (event.phases.every((p) => p.skipped)) {
    return { ok: false, reason: `Cannot add "${name}": its duration (${resolved.minutes} min) leaves every phase with no length.` };
  }
  const problems = eventProblems(event, road);
  if (problems.length > 0) return { ok: false, reason: `Cannot add "${name}": ${problems.join("; ")}.` };
  // Another event, or the operator's own closure, on the road at the same time is no reason to refuse: each event
  // closes its own lanes on its own stretch (composeInterventions). Only a booth already taken is.
  void manual;
  const conflict = conflictMessage(events, event);
  if (conflict !== null) return { ok: false, reason: conflict };
  return { ok: true, events: [...events, event], event };
}

/**
 * True when every event's own `.direction` field matches the direction it is filed under in
 * `byDirection` — the invariant a per-direction bucket (see useDirectionSim) must never break.
 * False is a hard failure: an event whose stored direction disagrees with its list membership
 * would show the wrong carriageway in its own row, or let a conflict check compare across the
 * median. Pure and total over any Direction keys actually present, so a caller can check a
 * partial map (e.g. only NB, in NB-only view) without an SB entry.
 */
export function directionBucketsConsistent(byDirection: Readonly<Partial<Record<Direction, readonly ScenarioEvent[]>>>): boolean {
  return DIRECTIONS.every((direction) => (byDirection[direction] ?? []).every((event) => eventFitsBucket(direction, event)));
}

const DIRECTIONS = ["NB", "SB"] as const;

/**
 * Which carriageways one "Add event" goes to. One carriageway on screen: that one. Both on screen: both only
 * if the family can go on both (CarriagewayReach) AND the operator chose Both — otherwise the focused
 * carriageway alone. Pure; the panel calls it and verify.ts pins every combination.
 */
export function addTargets(reach: CarriagewayReach, view: readonly Direction[], focus: Direction, wantBoth: boolean): readonly Direction[] {
  // Rain falls on the whole road: both carriageways, even the one not on screen.
  if (reach === "both") return ["NB", "SB"];
  if (view.length < 2) return [view[0] ?? focus];
  return reach === "one_or_both" && wantBoth ? [...view] : [focus];
}

/** The one rule: an event may sit in a direction's list only if it names that direction. */
function eventFitsBucket(bucket: Direction, event: { readonly direction: Direction }): boolean {
  return event.direction === bucket;
}

/** Why `bucket`'s list refuses an event that names another carriageway. */
export function wrongCarriagewayMessage(bucket: Direction, eventDirection: Direction): string {
  return `${bucket}: refused an event that names ${eventDirection} as its carriageway. An event is stored only in its own carriageway's list. Nothing was changed.`;
}

/** Why `bucket`'s list refuses everything once it holds an event that names the other carriageway. */
export function inconsistentBucketMessage(bucket: Direction): string {
  return `${bucket}: refused because this carriageway's event list already holds an event that names the other carriageway, which must never happen. Nothing was changed; reload the page to clear the events.`;
}

/**
 * addEvent for a per-direction list, with the direction invariant ENFORCED instead of assumed:
 * an event whose `direction` is not this list's is refused with a clear reason and nothing is
 * stored, checked first so it is never masked by an unrelated refusal (a conflict, a bad start),
 * and the list that would result is checked with directionBucketsConsistent before it is handed
 * back — so a list that was already corrupted by some other caller also stops taking events
 * rather than carrying the error on. Same return shape as addEvent.
 */
export function addEventToBucket(bucket: Direction, events: readonly ScenarioEvent[], spec: NewEventSpec, road: Road, seq: number, manual: ManualClosure): AddResult {
  if (!eventFitsBucket(bucket, spec)) return { ok: false, reason: wrongCarriagewayMessage(bucket, spec.direction) };
  const r = addEvent(events, spec, road, seq, manual);
  if (!r.ok) return r;
  const stored = bucket === "NB" ? { NB: r.events } : { SB: r.events };
  if (!directionBucketsConsistent(stored)) return { ok: false, reason: inconsistentBucketMessage(bucket) };
  return r;
}

const LEVEL_TEXT: Readonly<Record<CalibrationLevel, string>> = {
  cause_vehicle: "cause × vehicle",
  cause: "cause",
  vehicle: "vehicle",
  label: "collision type",
  family: "family",
  // Never actually shown: resolutionView() suppresses the calibration line whenever mode is "manual",
  // which every draw for a NO_CALIBRATION_FAMILIES member is. Present only so the Record is total.
  none: "no calibration",
};

/** A calibration level in words. */
export function describeLevel(level: CalibrationLevel): string {
  return LEVEL_TEXT[level];
}

/** Seconds as m:ss, or h:mm:ss from an hour up. */
export function formatClock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * The resolved duration in words, for the operator: how it was chosen, which
 * calibration level it came from and how many events that rests on, a low-sample
 * warning, and, when the cap applied, what was drawn and what it was cut to and
 * why. Everything comes from the stored resolution; nothing is re-derived.
 */
export function describeResolution(event: ScenarioEvent): string {
  const r = event.resolved;
  const how =
    r.mode === "sampled" ? "sampled" : r.mode === "p50" ? "median" : r.mode === "p90" ? "90th percentile" : "entered by the operator";
  const parts = [`${fmtMinutes(r.minutes)} ${how}`];
  if (r.mode !== "manual") {
    parts.push(`calibrated at ${LEVEL_TEXT[r.level]} level, n = ${r.n.toLocaleString("en-US")}${r.lowSample ? " (low sample)" : ""}`);
  }
  if (r.capped && r.capMinutes !== null && r.capLevel !== null && r.capN !== null) {
    parts.push(`capped: drew ${fmtMinutes(r.uncappedMinutes)}, cut to ${fmtMinutes(r.capMinutes)}, the 99th percentile of ${LEVEL_TEXT[r.capLevel]} level (n = ${r.capN.toLocaleString("en-US")})`);
  }
  return parts.join(" · ");
}

/** Events without `id`. Removing one gives back exactly what it changed: the next apply no longer asks for it. */
export function removeEvent(events: readonly ScenarioEvent[], id: string): readonly ScenarioEvent[] {
  return events.filter((e) => e.id !== id);
}

/* ─────────────────────────────────────────────────────────────────────────────
   Ownership
───────────────────────────────────────────────────────────────────────────── */
export type Owner = {
  readonly eventId: string;
  readonly eventName: string;
  readonly phaseId: string;
  readonly phaseLabel: string;
};

export type ClosureOwnership = Owner & {
  /** Engine lane indices the event is blocking, ascending. The operator cannot reopen these. */
  readonly lanes: readonly number[];
  readonly closurePointM: number;
  readonly closureEndM: number;
};
export type SpeedZoneOwnership = Owner & { readonly zone: readonly [number, number]; readonly limitKmh: number };
export type IncidentOwnership = Owner & {
  /** `${eventId}:${slot}`: how the binding tells this incident from the operator's. */
  readonly key: string;
  readonly slot: number;
  readonly lane: number;
  readonly x: number;
};
/** An event that would have taken a lever but stands aside because the operator is using it. */
export type YieldedEvent = Owner &
  (
    | { readonly resource: "speed_zone"; readonly reason: "operator_limit_active" }
    | { readonly resource: "closure_stretch"; readonly reason: "operator_closure_active" }
  );

/** For the event's row: what is suspended and why. */
export function describeYield(y: YieldedEvent): string {
  switch (y.resource) {
    case "speed_zone":
      return "Speed zone suspended — operator speed limit active";
    case "closure_stretch":
      return "Closure suspended — operator lane closure active";
    default:
      return assertNever(y);
  }
}
export type InvalidEvent = { readonly eventId: string; readonly eventName: string; readonly problems: readonly string[] };
/** Two events claiming the same exclusive lever at once. addEvent never allows it; if it ever occurs the earlier event wins and the other is listed here. */
export type SuppressedEvent = { readonly eventId: string; readonly eventName: string; readonly resource: ExclusiveResource; readonly heldBy: string };

export type Ownership = {
  /** The closure stretch the operator's controls show: the first event closing lanes, with the operator's lanes on it. */
  readonly closure: ClosureOwnership | null;
  readonly speedZone: SpeedZoneOwnership | null;
  /** Every further event closing lanes at the same time, each on its own lanes and stretch (Interventions.closures). */
  readonly extraClosures: readonly ClosureOwnership[];
  /** Every further event with a speed zone at the same time, each with its own zone and limit (Interventions.speedZones). */
  readonly extraSpeedZones: readonly SpeedZoneOwnership[];
  readonly incidents: readonly IncidentOwnership[];
  readonly yielded: readonly YieldedEvent[];
  readonly invalid: readonly InvalidEvent[];
  readonly suppressed: readonly SuppressedEvent[];
};

export const NO_OWNERS: Ownership = { closure: null, speedZone: null, extraClosures: [], extraSpeedZones: [], incidents: [], yielded: [], invalid: [], suppressed: [] };

/** "<event> — <phase>", for "Driven by: ...". */
export function describeOwner(o: Owner): string {
  return `${o.eventName} — ${o.phaseLabel}`;
}

/** Engine lane indices a scenario is blocking, as a flag per lane. */
export function scenarioLockedLanes(owners: Ownership, laneCount: number): boolean[] {
  const locked = Array<boolean>(laneCount).fill(false);
  for (const c of [owners.closure, ...owners.extraClosures]) if (c !== null) for (const i of c.lanes) if (i >= 0 && i < laneCount) locked[i] = true;
  return locked;
}

/** A short string that changes exactly when ownership does, so a UI can skip a redundant state update. */
export function ownershipKey(o: Ownership): string {
  const c = o.closure === null ? "-" : `${o.closure.eventId}/${o.closure.phaseId}/${o.closure.lanes.join(",")}`;
  const z = o.speedZone === null ? "-" : `${o.speedZone.eventId}/${o.speedZone.phaseId}`;
  const i = o.incidents.map((x) => `${x.key}@${x.lane}:${x.x}`).join(";");
  const y = o.yielded.map((x) => `${x.eventId}/${x.resource}`).join(",");
  const v = o.invalid.map((x) => x.eventId).join(",");
  const s = o.suppressed.map((x) => x.eventId).join(",");
  const ec = o.extraClosures.map((x) => `${x.eventId}/${x.phaseId}/${x.lanes.join(",")}`).join(";");
  const ez = o.extraSpeedZones.map((x) => `${x.eventId}/${x.phaseId}`).join(";");
  return [c, z, i, y, v, s, ec, ez].join("|");
}

/* ─────────────────────────────────────────────────────────────────────────────
   composeInterventions: the ONE pure function
───────────────────────────────────────────────────────────────────────────── */
export type Composition = {
  /** What the engine should hold: the operator's settings with the scenario's laid over them. `closureDraft` is display-only and not part of this. */
  readonly interventions: Interventions;
  readonly owners: Ownership;
};

/** The lanes a phase blocks: the event's own lane, then outward (higher engine index) first, then inward. See ASSUMPTIONS.SPILL_LANE_ORDER. */
function blockedLanes(baseIndex: number, count: number, laneCount: number): readonly number[] {
  const lanes = [baseIndex];
  let outward = baseIndex + 1;
  let inward = baseIndex - 1;
  while (lanes.length < count) {
    if (outward < laneCount) lanes.push(outward++);
    else if (inward >= 0) lanes.push(inward--);
    else break;
  }
  return lanes.sort((a, b) => a - b);
}

/**
 * The lanes a phase blocks when the operator has explicitly added extra lanes (see
 * ScenarioEvent.extraLanes): `baseIndex` plus each extra converted the same way through
 * operatorLaneToEngineIndex, dropping any that don't exist on this road and any duplicates
 * of `baseIndex` or each other. Replaces blockedLanes()'s automatic outward-spill guess for
 * this event only — used exactly when `extraLanes` is non-empty, never otherwise.
 */
function manualBlockedLanes(baseIndex: number, extraLanes: readonly number[], laneCount: number): readonly number[] {
  const lanes = new Set<number>([baseIndex]);
  for (const opLane of extraLanes) {
    const idx = operatorLaneToEngineIndex(opLane, laneCount);
    if (idx !== null) lanes.add(idx);
  }
  return [...lanes].sort((a, b) => a - b);
}

/**
 * The lanes a flood holds in its current phase, out of the lanes it was given. Water collects on the low, shoulder
 * side first and leaves the crown of the road first, so while it rises and while it drains only the outer half of
 * the given lanes is under water (higher engine index = further out); in its flooded phase all of them are. Any
 * other family holds what it was given.
 */
function floodLanesAt(family: FamilyKey, phaseId: string, given: readonly number[]): readonly number[] {
  if (family !== "flood" || given.length <= 1) return given;
  if (phaseId === "rising" || phaseId === "draining") {
    const keep = Math.ceil(given.length / 2);
    return [...given].sort((a, b) => b - a).slice(0, keep).sort((a, b) => a - b);
  }
  return given;
}

/** The rain a flood brings in each phase: heavy until the water starts to drain, then light. */
export function floodRainOf(phaseId: string): RainIntensity | null {
  switch (phaseId) {
    case "pooling":
    case "rising":
    case "flooded":
      return "heavy";
    case "draining":
      return "light";
    default:
      return null;
  }
}

function ownerOf(event: ScenarioEvent, phase: ScheduledPhase): Owner {
  return { eventId: event.id, eventName: event.name, phaseId: phase.id, phaseLabel: phase.label };
}

/**
 * The engine's interventions at engine time `simTimeS`, given what the operator
 * has set and the scenario events, and who owns each lever.
 *
 * Rules (each is checked in verify.ts):
 *   - Events that are not valid on `road` (a lane that no longer exists, a position
 *     off the stretch, a phase that would block every lane) own nothing and change
 *     nothing; they are listed in `owners.invalid`.
 *   - Closure stretch: while a collision event is in a phase that blocks lanes, its
 *     lanes and its stretch replace the operator's stretch. Its lanes are always
 *     closed. Lanes the operator closes WHILE it owns the stretch are kept on top
 *     (never fewer lanes than the scenario blocks, extra ones allowed), on the
 *     event's stretch. If the operator already has a closure on a different
 *     stretch when the event would take over (`previous` says who already held the
 *     stretch a moment ago; an event that did keeps it), or another event already
 *     holds it, the event closes its own lanes on its own stretch instead
 *     (owners.extraClosures → Interventions.closures). There is no limit on how
 *     many run at once (an adviser's requirement, 2026-10-05; the road used to
 *     have one closure, so a second collision was refused).
 *   - Speed zone: the first event's zone and limit replace the operator's for its
 *     duration. Every further one, and every one while the operator has a limit of
 *     their own, runs alongside as a zone of its own (owners.extraSpeedZones →
 *     Interventions.speedZones); where zones overlap the engine takes the lowest.
 *   - Incidents: the operator's, then one per obstacle slot for each in-lane
 *     breakdown that is running.
 *   - Zero-length phases are never current, so they change nothing.
 * Nothing here reads a clock or the engine, and nothing is mutated. `previous` is the
 * ownership the last composition returned (NO_OWNERS at the start of a run); it only
 * decides who KEEPS the closure stretch, see above.
 */
export function composeInterventions(
  manual: ManualInterventions,
  events: readonly ScenarioEvent[],
  simTimeS: number,
  road: Road,
  previous: Ownership = NO_OWNERS,
): Composition {
  const t = scenarioTimeS(simTimeS, road);
  const ordered = [...events].sort((a, b) => a.startS - b.startS || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let closure: ClosureOwnership | null = null;
  let speedZone: SpeedZoneOwnership | null = null;
  const extraClosures: ClosureOwnership[] = [];
  const extraSpeedZones: SpeedZoneOwnership[] = [];
  const incidents: IncidentOwnership[] = [];
  const yielded: YieldedEvent[] = [];
  const invalid: InvalidEvent[] = [];
  const suppressed: SuppressedEvent[] = [];

  for (const event of ordered) {
    const problems = eventProblems(event, road);
    if (problems.length > 0) {
      invalid.push({ eventId: event.id, eventName: event.name, problems });
      continue;
    }
    const phase = phaseAt(event, t);
    if (phase === null) continue;
    // At a plaza or service area: the facility layer shuts the booth; nothing on the carriageway changes.
    if (event.site) continue;
    const positionM = road.metresAt(event.positionKm);
    const effect = effectOf(event.variant.family);
    // A flood brings its rain: heavy over the whole road until it starts to drain, then light (floodRainOf).
    if (event.variant.family === "flood") {
      const intensity = floodRainOf(phase.id);
      if (intensity !== null) {
        const held: SpeedZoneOwnership = { ...ownerOf(event, phase), zone: [0, road.segmentLengthM], limitKmh: ASSUMPTIONS.RAIN_SPEED_KMH.value[intensity] };
        if (manual.speedLimitKmh === null && speedZone === null) speedZone = held;
        else extraSpeedZones.push(held);
      }
    }
    switch (effect) {
      case "closure": {
        if (phase.lanesBlocked <= 0 || phase.wreckLengthM === null || event.lane === null) break;
        const base = operatorLaneToEngineIndex(event.lane, road.laneCount);
        // The operator's own stretch, exactly, where they gave one; otherwise laid out round the point.
        const own = eventStretchM(event, road);
        const stretch: ClosureStretch | null = own
          ? { closurePointM: Math.max(0, own.fromM), closureEndM: Math.min(road.segmentLengthM, own.toM), clampedStart: own.fromM < 0, clampedEnd: own.toM > road.segmentLengthM }
          : closureStretch(positionM, phase.wreckLengthM, road.segmentLengthM);
        if (base === null || stretch === null) break;
        const held: ClosureOwnership = {
          ...ownerOf(event, phase),
          lanes: floodLanesAt(
            event.variant.family,
            phase.id,
            event.extraLanes.length > 0
              ? manualBlockedLanes(base, event.extraLanes, road.laneCount)
              : blockedLanes(base, phase.lanesBlocked, road.laneCount),
          ),
          closurePointM: stretch.closurePointM,
          closureEndM: stretch.closureEndM,
        };
        // The shared stretch if it is free and the operator's own closure is not elsewhere; otherwise a closure of its own.
        const keeping = previous.closure !== null && previous.closure.eventId === event.id;
        if (closure === null && (keeping || !manualClosureConflicts(manual, stretch))) closure = held;
        else extraClosures.push(held);
        break;
      }
      case "speed_zone": {
        const found = speedZoneWindow(event.variant, positionM, road);
        if (found === null) break;
        // A shoulder breakdown given a stretch slows traffic over exactly that stretch (rain is always the whole road).
        const own = event.variant.family === "rain" ? null : eventStretchM(event, road);
        const window = own ? { zone: [Math.max(0, own.fromM), Math.min(road.segmentLengthM, own.toM)] as const, limitKmh: found.limitKmh } : found;
        const held: SpeedZoneOwnership = { ...ownerOf(event, phase), zone: window.zone, limitKmh: window.limitKmh };
        // The shared zone if the operator has no limit of their own and no event has it; otherwise a zone of its own.
        if (manual.speedLimitKmh === null && speedZone === null) speedZone = held;
        else extraSpeedZones.push(held);
        break;
      }
      case "incident": {
        const vehicle = breakdownVehicle(event.variant);
        const laneIndex = event.lane === null ? null : operatorLaneToEngineIndex(event.lane, road.laneCount);
        if (vehicle === null || laneIndex === null) break;
        // The vehicle's front is at the event position and it extends upstream, one engine slot at a time.
        const slots = incidentSlotsFor(vehicle);
        const slotM = ASSUMPTIONS.ENGINE_INCIDENT_SLOT_M.value;
        for (let k = 0; k < slots; k++) {
          const x = positionM - k * slotM;
          if (x < 0) continue;
          incidents.push({ ...ownerOf(event, phase), key: `${event.id}:${k}`, slot: k, lane: laneIndex, x });
        }
        break;
      }
      default:
        return assertNever(effect);
    }
  }

  const closedLanes = Array.from({ length: road.laneCount }, (_, i) => Boolean(manual.closedLanes[i]) || (closure !== null && closure.lanes.includes(i)));
  const interventions: Interventions = {
    closedLanes,
    closurePoint: closure === null ? manual.closurePoint : closure.closurePointM,
    closureEnd: closure === null ? manual.closureEnd : closure.closureEndM,
    showClosurePreview: closure === null ? manual.showClosurePreview : false,
    incidents: [...manual.incidents.map((i): Incident => ({ lane: i.lane, x: i.x })), ...incidents.map((i): Incident => ({ lane: i.lane, x: i.x }))],
    speedLimitKmh: speedZone === null ? manual.speedLimitKmh : speedZone.limitKmh,
    speedZone: speedZone === null ? [manual.speedZone[0], manual.speedZone[1]] : [speedZone.zone[0], speedZone.zone[1]],
    closures: extraClosures.map((c) => ({
      lanes: Array.from({ length: road.laneCount }, (_, i) => c.lanes.includes(i)),
      from: c.closurePointM,
      to: c.closureEndM,
    })),
    speedZones: extraSpeedZones.map((z) => ({ from: z.zone[0], to: z.zone[1], kmh: z.limitKmh })),
  };
  return { interventions, owners: { closure, speedZone, extraClosures, extraSpeedZones, incidents, yielded, invalid, suppressed } };
}

/* ─────────────────────────────────────────────────────────────────────────────
   EngineBinding: applying a composition to a running engine
───────────────────────────────────────────────────────────────────────────── */

/** The part of TrafficSim the binding needs. TrafficSim satisfies it; a test can too. */
export type EngineLike = {
  readonly time: number;
  readonly cfg: { readonly length: number; readonly laneCount: number };
  interventions: Interventions;
  addIncident(lane: number, x: number): void;
  /** Make a scene out of the traffic approaching (lane, x): `want` vehicles, of `kind`, due in `inS` seconds; the
   *  response follows once they are at rest. Once per scene key. */
  crashAt?(lane: number, x: number, want: number, sceneKey?: string, kind?: SceneSpec["kind"], prefer?: 1 | 2 | 3 | null, inS?: number, stopAt?: number, respondS?: number): unknown;
  /** The scene's tow (or service) phase has begun: send the recovery truck. */
  dispatchTow?(sceneKey: string): void;
  /** Send a scenario vehicle to drive in and hold station. */
  dispatchResponder?(kind: "ambulance" | "police" | "tow" | "works", lane: number, holdAtX: number, delayS: number, sceneKey?: string): void;
  /** Everything this scene put on the road packs up and drives away. */
  releaseScene?(sceneKey: string): void;
  /** The lanes reopen before the scene is over: the casualties leave the lane, the police wait on the shoulder. */
  reopenScene?(sceneKey: string): void;
  /** Start a scene at a plaza or service area: strand the vehicles there, shut the booths, send a tow. */
  facilityEventStart?(sceneKey: string, site: EventSite, family: string, respondS?: number): boolean;
  /** End it: the booths reopen and the scene is recovered. */
  facilityEventEnd?(sceneKey: string): void;
  /** Which facilities exist, for checking a site event can run. */
  readonly fac?: { readonly list: readonly { readonly spec: { readonly id: string } }[] };
};

/** What a caller supplies besides the engine: where warm-up ends and how km-posts map to metres on the current stretch. */
export type RoadFrame = Pick<Road, "warmupS" | "metresAt">;

export type EngineBinding = {
  /**
   * Compose and apply. THE only way scenario state reaches the engine, called from
   * the animation loop when a phase boundary is crossed and from the live-apply
   * effect when the operator changes something. Idempotent: applying the same
   * inputs again changes nothing. Returns the composition so the caller can show
   * who owns what.
   */
  apply(sim: EngineLike, controls: ManualControls, events: readonly ScenarioEvent[], frame: RoadFrame): Composition;
  /** The incidents the operator placed: everything the engine holds except what a scenario put there. */
  operatorIncidents(sim: EngineLike): readonly Incident[];
  /** Remove the operator's incidents only; a running scenario's are left in place. */
  clearOperatorIncidents(sim: EngineLike): void;
  /** Whether an incident in the engine's list is one a scenario put there (for drawing it differently). */
  isScenarioIncident(incident: Incident): boolean;
  /** The ownership the last apply produced. */
  previousOwners(): Ownership;
  /** Forget which incidents are scenario-owned and who held what. Call when the engine it was bound to is replaced. */
  reset(): void;
};

/** The road as the engine itself sees it: lane count and length are the engine's, not the page's, so they cannot be stale. */
export function roadOf(sim: Pick<EngineLike, "cfg"> & Partial<Pick<EngineLike, "fac">>, frame: RoadFrame): Road {
  const facilityIds = sim.fac ? new Set(sim.fac.list.map((f) => f.spec.id)) : undefined;
  return { laneCount: sim.cfg.laneCount, segmentLengthM: sim.cfg.length, warmupS: frame.warmupS, metresAt: frame.metresAt, facilityIds };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Driving a run: the two loops the page needs, kept here so they can be tested
   without a browser
───────────────────────────────────────────────────────────────────────────── */

/** The engine as the loops below step it. */
export type SteppableEngine = EngineLike & { step(dt: number): void };

/**
 * Call after each engine step. Once the scenario clock has reached `dueS` (a phase
 * boundary), applies the composition and returns the next due time; otherwise does
 * nothing. `dueS` is on the scenario clock (seconds after warm-up); start it at
 * -Infinity so the first step applies. Infinity means no boundary is left.
 */
export function applyAtBoundary(
  binding: EngineBinding,
  sim: EngineLike,
  controls: ManualControls,
  events: readonly ScenarioEvent[],
  frame: RoadFrame,
  dueS: number,
): { readonly dueS: number; readonly composition: Composition | null } {
  const road = roadOf(sim, frame);
  const now = scenarioTimeS(sim.time, road);
  if (now < dueS) return { dueS, composition: null };
  const composition = binding.apply(sim, controls, events, frame);
  const next = nextBoundaryAfter(events, road, now);
  return { dueS: next === null ? Infinity : next, composition };
}

/**
 * Fast-forward: step the engine, rendering nothing, until the scenario clock
 * reaches `targetS` or `budgetMs` of wall time has been spent, whichever is first.
 * Call again to continue. Returns whether the target was reached and how many steps
 * this call took. The engine steps at fixed `dt`, so it can overshoot the target by
 * less than one step. `now` is the wall clock (performance.now in a browser).
 */
export function stepToScenarioTime(
  sim: SteppableEngine,
  frame: RoadFrame,
  targetS: number,
  dt: number,
  budgetMs: number,
  now: () => number,
): { readonly reached: boolean; readonly steps: number } {
  if (!(dt > 0)) throw new RangeError(`dt must be positive, got ${dt}`);
  const started = now();
  let steps = 0;
  // The wall clock is read every step: a step costs from about 0.5 ms (600 m) to 3 ms (3 km), far more than reading it.
  while (scenarioTimeS(sim.time, frame) < targetS) {
    if (now() - started >= budgetMs) return { reached: false, steps };
    sim.step(dt);
    steps++;
  }
  return { reached: true, steps };
}

/**
 * Scenario incidents are tracked by OBJECT: each one the binding puts into the
 * engine's list is remembered under its owner key, so it can be removed exactly and
 * the operator's are never touched, even when an operator's sits at the same spot.
 * A new one goes in through the engine's own addIncident, which also absorbs any
 * vehicle standing on that spot, exactly as when the operator drops one.
 */
export function createEngineBinding(): EngineBinding {
  const owned = new Map<string, Incident>();
  let previous: Ownership = NO_OWNERS;
  /* Events whose scene has been started: "on" while it stands on the road, "site" for one in a plaza or service area,
     "off" once it has been cleared. A scene is a one-off: apply() runs on every phase boundary and on every operator
     edit, and without this a four-car pile-up would acquire four more cars each time. */
  const scenes = new Map<string, "on" | "clearing" | "site" | "off">();
  /** Scenes whose recovery truck has been sent for. */
  const towed = new Set<string>();

  const isOwned = (i: Incident): boolean => {
    for (const o of owned.values()) if (o === i) return true;
    return false;
  };
  const operatorIncidents = (sim: EngineLike): readonly Incident[] => sim.interventions.incidents.filter((i) => !isOwned(i));

  return {
    apply(sim, controls, events, frame) {
      const road = roadOf(sim, frame);
      const composition = composeInterventions({ ...controls, incidents: operatorIncidents(sim) }, events, sim.time, road, previous);
      previous = composition.owners;
      const next = composition.interventions;
      // Field by field: closureDraft belongs to the operator's click-to-place mode and must survive.
      sim.interventions.closedLanes = next.closedLanes;
      sim.interventions.closurePoint = next.closurePoint;
      sim.interventions.closureEnd = next.closureEnd;
      sim.interventions.showClosurePreview = next.showClosurePreview;
      sim.interventions.speedLimitKmh = next.speedLimitKmh;
      sim.interventions.speedZone = next.speedZone;
      sim.interventions.closures = next.closures;
      sim.interventions.speedZones = next.speedZones;

      /* The vehicles of each event's scene — made of the traffic, never put down on the road.
       *
       * Done BEFORE the incidents below: an in-lane breakdown's incident slots ARE the vehicle its scene is bringing to
       * a stop there, and the engine knows that only if the scene exists when they arrive. Otherwise it takes them for
       * an accident of their own and makes one there. */
      const now = scenarioTimeS(sim.time, road);
      const listed = new Set(events.map((e) => e.id));
      // An event taken off the list mid-scene: its vehicles pack up and leave, as they would at its end.
      for (const [id, where] of [...scenes]) {
        if (listed.has(id)) continue;
        if (where === "on" || where === "clearing") sim.releaseScene?.(id);
        if (where === "site") sim.facilityEventEnd?.(id);
        scenes.delete(id);
        towed.delete(id);
      }
      for (const e of events) {
        const state = eventState(e, now);

        /* At a plaza or service area: the scene is the facility's. It starts
           once, with the vehicles that are actually in the booth lane, and it
           ends by being recovered — the booth reopens and the queue drains. */
        if (e.site) {
          if (state === "active" && !scenes.has(e.id) && typeof sim.facilityEventStart === "function") {
            if (sim.facilityEventStart(e.id, e.site, e.variant.family, responseArrivalS(e))) scenes.set(e.id, "site");
          }
          if (state === "done" && scenes.get(e.id) === "site" && typeof sim.facilityEventEnd === "function") {
            sim.facilityEventEnd(e.id);
            scenes.set(e.id, "off");
          }
          continue;
        }

        const family = e.variant.family;
        const lane = e.lane === null ? null : operatorLaneToEngineIndex(e.lane, road.laneCount);
        const scene = sceneOf(e.variant);
        const startsIn = e.startS - now;
        const lead = sceneLeadS(e, road);
        // Moved back to the future after it ran: it can run again.
        if (state === "pending" && startsIn > lead && scenes.get(e.id) === "off") {
          scenes.delete(e.id);
          towed.delete(e.id);
        }

        /* Starting — SCENE_LEAD_S early for a scene made of vehicles: that is when they are picked out of the traffic
         * approaching the spot, so they are seen driving into it and it happens on time.
         *
         * A collision crashes the traffic that is there (the first vehicle stops hard, the next fails to). A breakdown
         * slows with its hazards on and stops. Roadworks are not a crash — nothing collides — so they get a works
         * convoy that drives in and parks in the lane it is closing, which is what makes the closure appear to be set
         * up rather than to switch on. A flood is not a crash either: the water closes the lane (drawn by drawWater)
         * and traffic moves out of it. Rain has no vehicles in it at all. */
        const due = state === "active" || (state === "pending" && lead > 0 && startsIn <= lead + 1e-6);
        if (due && !scenes.has(e.id) && eventProblems(e, road).length === 0) {
          if (family === "scheduled_roadworks") {
            if (lane !== null && typeof sim.dispatchResponder === "function") {
              const at = road.metresAt(e.positionKm);
              // Timed to reach the lane as it closes (sceneLeadS); close to the entrance that is no head start at all.
              const wait = Math.max(0, startsIn - lead);
              sim.dispatchResponder("works", lane, at, wait, e.id);
              sim.dispatchResponder("works", lane, at - 26, wait + 14, e.id);
              scenes.set(e.id, "on");
            }
          } else if (scene !== null && typeof sim.crashAt === "function") {
            sim.crashAt(lane ?? road.laneCount - 1, road.metresAt(e.positionKm), scene.want, e.id, scene.kind, scene.prefer, Math.max(0, startsIn), undefined, responseArrivalS(e));
            scenes.set(e.id, "on");
          }
        }

        // The recovery truck goes out when the tow (or, for a breakdown, the service) phase begins.
        const phase = state === "active" ? phaseAt(e, now) : null;
        if (scene?.tow && phase !== null && (phase.id === "tow" || phase.id === "service") && scenes.get(e.id) === "on" && !towed.has(e.id)) {
          sim.dispatchTow?.(e.id);
          towed.add(e.id);
        }

        /* Finished — or, for a collision, its lanes reopened (the clearing phase): the scene packs up and drives away
           rather than being deleted where it stands, and the lane is free again as the label says. Without the second
           a wreck stood in a lane the engine had reopened, and traffic queued behind it for the rest of the event. */
        const reopened = phase !== null && scene !== null && effectOf(family) === "closure" && phase.lanesBlocked === 0;
        if (reopened && scenes.get(e.id) === "on" && typeof sim.reopenScene === "function") {
          sim.reopenScene(e.id);
          scenes.set(e.id, "clearing");
        }
        if ((state === "done" || reopened) && (scenes.get(e.id) === "on" || (state === "done" && scenes.get(e.id) === "clearing"))) {
          sim.releaseScene?.(e.id);
          scenes.set(e.id, "off");
        }
      }

      // Scenario incidents: drop the ones no longer wanted, add or repair the ones wanted.
      const wanted = new Map(composition.owners.incidents.map((i) => [i.key, i] as const));
      for (const [key, obj] of [...owned]) {
        if (wanted.has(key)) continue;
        sim.interventions.incidents = sim.interventions.incidents.filter((i) => i !== obj);
        owned.delete(key);
      }
      for (const w of composition.owners.incidents) {
        const have = owned.get(w.key);
        if (have !== undefined && have.lane === w.lane && have.x === w.x && sim.interventions.incidents.includes(have)) continue;
        if (have !== undefined) {
          sim.interventions.incidents = sim.interventions.incidents.filter((i) => i !== have);
          owned.delete(w.key);
        }
        sim.addIncident(w.lane, w.x);
        const list = sim.interventions.incidents;
        const added = list[list.length - 1];
        if (added !== undefined && added.lane === w.lane && added.x === w.x) owned.set(w.key, added);
      }
      return composition;
    },
    operatorIncidents,
    clearOperatorIncidents(sim) {
      sim.interventions.incidents = sim.interventions.incidents.filter((i) => isOwned(i));
    },
    isScenarioIncident: isOwned,
    previousOwners: () => previous,
    reset() {
      owned.clear();
      scenes.clear();
      towed.clear();
      previous = NO_OWNERS;
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Views for the UI. Everything the Add panel, the event rows, the readouts and
   the canvas show is built here from the stored events, so it is tested without
   a browser and the components only lay it out.
───────────────────────────────────────────────────────────────────────────── */

export type ResolutionView = {
  /** "47 min · sampled". */
  readonly headline: string;
  /** "Level: cause × vehicle · n = 1,446"; null for a duration the operator typed in (no calibration behind it). */
  readonly calibration: string | null;
  /**
   * NO_CALIBRATION_NOTE when the variant's FAMILY has no calibration.json entry at all (r.level === "none" —
   * only true for a NO_CALIBRATION_FAMILIES member); null otherwise, including for an ordinary manual draw on
   * an otherwise-calibrated family (mode "manual" alone is not enough: that also happens for the 5 calibrated
   * families whenever the operator picks Manual for one event, which is not the same claim). Shown as a badge,
   * not just inferred from the Sampled/Median/90th buttons being absent, so it reads the same way in the Add
   * panel preview and in an already-added event's row (both go through this same view / ResolutionBlock).
   */
  readonly noCalibration: string | null;
  /** "Low sample (n = 129)" when the entry behind the duration has fewer than LOW_SAMPLE_N events. */
  readonly lowSample: string | null;
  /** "Capped at 217.2 min (from cause × vehicle)" when a sampled draw hit the cap. */
  readonly capped: string | null;
  /** What was drawn before the cap, and what the cap is. Present exactly when `capped` is. */
  readonly cappedDetail: string | null;
};

/** The exact badge text for a family with no NLEX calibration data at all (see ASSUMPTIONS.NO_CALIBRATION_FAMILIES). */
export const NO_CALIBRATION_NOTE = "No NLEX calibration data — duration is operator-set.";

/** The resolved duration as the operator reads it. Built from the stored resolution only. */
export function resolutionView(r: ResolvedDuration): ResolutionView {
  const how = r.mode === "sampled" ? "sampled" : r.mode === "p50" ? "median" : r.mode === "p90" ? "90th percentile" : "entered by you";
  const calibrated = r.mode !== "manual";
  const capped = r.capped && r.capMinutes !== null && r.capLevel !== null && r.capN !== null;
  return {
    headline: `${fmtMinutes(r.minutes)} · ${how}`,
    calibration: calibrated ? `Level: ${LEVEL_TEXT[r.level]} · n = ${r.n.toLocaleString("en-US")}` : null,
    noCalibration: r.level === "none" ? NO_CALIBRATION_NOTE : null,
    lowSample: calibrated && r.lowSample ? `Low sample (n = ${r.n.toLocaleString("en-US")})` : null,
    capped: capped && r.capMinutes !== null && r.capLevel !== null ? `Capped at ${fmtMinutes(r.capMinutes)} (from ${LEVEL_TEXT[r.capLevel]})` : null,
    cappedDetail:
      capped && r.capLevel !== null && r.capN !== null
        ? `Drew ${fmtMinutes(r.uncappedMinutes)}. The cap is the 99th percentile of the ${LEVEL_TEXT[r.capLevel]} level (n = ${r.capN.toLocaleString("en-US")}).`
        : null,
  };
}

/** A running event, with the phase it is in and whether it is standing aside for something the operator has set. */
export type ActiveEvent = { readonly eventId: string; readonly name: string; readonly phaseLabel: string; readonly suspended: boolean };

/**
 * What is actually on the road, as the readouts (recommendation, before/after,
 * baseline, the assistant's context) should see it: the operator's settings with
 * the scenario's laid over them. Not the operator's settings alone.
 */
export type EffectiveState = {
  readonly closedLanes: readonly boolean[];
  readonly speedLimitKmh: number | null;
  /** Events with an obstacle on the road now (a truck is one, however many engine slots it takes). */
  readonly scenarioIncidents: number;
  /** Events that are running and valid, with the phase each is in. */
  readonly active: readonly ActiveEvent[];
};

export function effectiveState(
  manual: Pick<ManualControls, "closedLanes" | "speedLimitKmh">,
  owners: Ownership,
  events: readonly ScenarioEvent[],
  scenarioT: number,
  laneCount: number,
): EffectiveState {
  const locked = scenarioLockedLanes(owners, laneCount);
  const invalid = new Set(owners.invalid.map((i) => i.eventId));
  const suspended = new Set(owners.yielded.map((y) => y.eventId));
  const active: ActiveEvent[] = [];
  for (const e of events) {
    if (invalid.has(e.id) || eventState(e, scenarioT) !== "active") continue;
    const phase = phaseAt(e, scenarioT);
    active.push({ eventId: e.id, name: e.name, phaseLabel: phase === null ? "running" : phase.label, suspended: suspended.has(e.id) });
  }
  return {
    closedLanes: Array.from({ length: laneCount }, (_, i) => Boolean(manual.closedLanes[i]) || locked[i]),
    speedLimitKmh: owners.speedZone === null ? manual.speedLimitKmh : owners.speedZone.limitKmh,
    scenarioIncidents: new Set(owners.incidents.map((i) => i.eventId)).size,
    active,
  };
}

/** "Minor collision #1 — Lane blocked: awaiting response", one per running event; a suspended one says so. */
export function describeActiveEvents(active: readonly ActiveEvent[]): readonly string[] {
  return active.map((a) => `${a.name} — ${a.phaseLabel}${a.suspended ? " (suspended)" : ""}`);
}

/**
 * What a "skip to next phase" to `targetS` is skipping through, for its progress
 * line: the event and phase that end at that boundary, and when that interval began
 * (the start of the phase, so time already spent in it counts as done). A skip to an
 * event's start has no phase yet: it is the wait for the event, from `nowS`.
 */
export function describeBoundary(events: readonly ScenarioEvent[], road: Road, targetS: number, nowS: number): { readonly label: string; readonly intervalStartS: number } | null {
  const eps = 1e-9;
  for (const e of events) {
    if (eventProblems(e, road).length > 0) continue;
    if (Math.abs(e.startS - targetS) < eps) return { label: `Waiting for ${e.name} to start`, intervalStartS: nowS };
  }
  for (const e of events) {
    if (eventProblems(e, road).length > 0) continue;
    const ends = Math.abs(e.endS - targetS) < eps || e.phases.some((p) => !p.skipped && Math.abs(e.startS + p.offsetS - targetS) < eps);
    if (!ends) continue;
    const phase = phaseAt(e, nowS);
    return phase === null ? { label: e.name, intervalStartS: nowS } : { label: `${e.name} — ${phase.label}`, intervalStartS: e.startS + phase.offsetS };
  }
  return null;
}

export type CanvasMark = {
  readonly eventId: string;
  readonly name: string;
  readonly kind: "incident" | "closure" | "speed_zone";
  readonly state: "pending" | "active";
  /** Metres along the stretch, in the direction of travel. */
  readonly xM: number;
  /** Engine lane index; null for a shoulder breakdown, which is beside the road. */
  readonly lane: number | null;
  /** The phase label and time left in it, or when the event starts. */
  readonly text: string;
  /** Seconds until it starts; null once it is running. Lets the canvas build
   *  up to an event rather than have it appear from nothing. */
  readonly secondsUntilStart: number | null;
  /** Seconds since it started; null before. The impact animation needs ABSOLUTE
   *  time: phaseFraction is a share of a phase that may run for minutes, and a
   *  collision does not take minutes. */
  readonly secondsSinceStart: number | null;
  /** At a plaza or service area: labelled there by the facility layer, never drawn on a lane. */
  readonly site?: EventSite | null;
};

/** One mark per event that has not finished and can run on this road, for the canvas to label. Pure; the canvas calls it each frame. */
export function canvasMarks(events: readonly ScenarioEvent[], road: Road, simTimeS: number): readonly CanvasMark[] {
  const t = scenarioTimeS(simTimeS, road);
  const marks: CanvasMark[] = [];
  for (const e of events) {
    if (eventProblems(e, road).length > 0) continue;
    const state = eventState(e, t);
    if (state === "done") continue;
    const effect = effectOf(e.variant.family);
    const lane = e.lane === null ? null : operatorLaneToEngineIndex(e.lane, road.laneCount);
    const phase = phaseAt(e, t);
    marks.push({
      eventId: e.id,
      name: e.name,
      kind: effect === "incident" ? "incident" : effect === "closure" ? "closure" : "speed_zone",
      state: state === "pending" ? "pending" : "active",
      secondsUntilStart: state === "pending" ? Math.max(0, e.startS - t) : null,
      secondsSinceStart: state === "pending" ? null : Math.max(0, t - e.startS),
      xM: road.metresAt(e.positionKm),
      lane,
      text:
        state === "pending"
          ? `Starts in ${formatClock(e.startS - t)}`
          : phase === null
            ? "Running"
            : `${phase.label} · ${formatClock(e.startS + phase.offsetS + phase.durationS - t)} left`,
      site: e.site,
    });
  }
  return marks;
}

/**
 * What the canvas needs to DRAW a scenario event as a scene (stalled vehicle, wreck, responders, water,
 * work zone, rain) rather than a marker: a CanvasMark plus the family, the running phase and how far
 * through it, which lanes and what stretch the event is actually holding closed, and the rain
 * intensity / breakdown vehicle where they apply.
 */
export type SceneMark = CanvasMark & {
  readonly family: FamilyKey;
  /** The running phase ("blocked", "tow", "clearing", "waiting", "service", "active"); null before the event starts. */
  readonly phaseId: string | null;
  /** How far through that phase it is, 0 to 1; 0 before it starts. */
  readonly phaseFraction: number;
  /** Engine lanes this event is holding closed right now. Empty when it holds none — including when it yielded the closure to the operator's own, so no wreck is drawn where traffic is not actually blocked. */
  readonly closedLanes: readonly number[];
  /** The closure stretch it holds, metres along the road in the direction of travel; null when it holds none. */
  readonly stretch: { readonly fromM: number; readonly toM: number } | null;
  /** Rain only. */
  readonly intensity: RainIntensity | null;
  /** Rain only: the speed the event caps traffic to (ASSUMPTIONS.RAIN_SPEED_KMH), for the speed-limit sign. */
  readonly capKmh: number | null;
  /** Breakdowns only. */
  readonly vehicle: VehicleKind | null;
  /** Floods only: the stretch and the outermost lane the water will cover, known before any lane closes, so the
   *  pooling phase can show water gathering where the flood is about to be. */
  readonly water?: { readonly fromM: number; readonly toM: number; readonly outerLane: number } | null;
  /** Rain and flood only: how hard it is raining on the picture right now, 0 (dry) to 3 (heavy) — 1 light, 2 moderate.
   *  It builds up over the first minute or so and eases off at the end rather than switching on and off, and a
   *  flood's heavy rain eases to light as the water drains (rainLevelOf). Drawing only: the speed cap is the
   *  engine's, set by `intensity`. */
  readonly rainLevel?: number;
  /** Seconds since the event started and until it ends (0 before it starts and after it ends), for what is set out
   *  and packed away over time: a work zone's cones. */
  readonly elapsedS?: number;
  readonly remainingS?: number;
};

const RAIN_LEVEL: Readonly<Record<RainIntensity, number>> = { light: 1, moderate: 2, heavy: 3 };
/** The rain's build-up and easing-off: 90 s, or a sixth of a short event. */
const rainRampS = (e: ScenarioEvent) => Math.min(90, Math.max(5, (e.endS - e.startS) / 6));

/** How hard it is raining for this event at scenario time t (see SceneMark.rainLevel). */
function rainLevelOf(e: ScenarioEvent, t: number, phase: ScheduledPhase | null): number {
  if (t < e.startS || t >= e.endS) return 0;
  const ramp = rainRampS(e);
  const envelope = Math.min(1, (t - e.startS) / ramp, (e.endS - t) / ramp);
  if (e.variant.family === "rain") return RAIN_LEVEL[e.variant.intensity] * envelope;
  if (e.variant.family !== "flood" || phase === null) return 0;
  // Heavy until the water starts to drain, then easing to light over the first part of the draining.
  if (phase.id !== "draining") return RAIN_LEVEL.heavy * envelope;
  const into = Math.max(0, Math.min(1, (t - (e.startS + phase.offsetS)) / Math.max(1, ramp)));
  return Math.min(RAIN_LEVEL.heavy - (RAIN_LEVEL.heavy - RAIN_LEVEL.light) * into, RAIN_LEVEL.heavy * envelope);
}

/** Where a flood's water lies on the road: its own stretch, or 150 m laid out round its point; and its outermost lane. */
function floodWaterOf(e: ScenarioEvent, road: Road): { readonly fromM: number; readonly toM: number; readonly outerLane: number } | null {
  if (e.lane === null) return null;
  const base = operatorLaneToEngineIndex(e.lane, road.laneCount);
  if (base === null) return null;
  const lanes = e.extraLanes.length > 0 ? manualBlockedLanes(base, e.extraLanes, road.laneCount) : [base];
  const own = eventStretchM(e, road);
  const stretch = own
    ? { closurePointM: Math.max(0, own.fromM), closureEndM: Math.min(road.segmentLengthM, own.toM) }
    : closureStretch(road.metresAt(e.positionKm), ASSUMPTIONS.CLOSURE_LENGTH_M.value.flood.flooded, road.segmentLengthM);
  if (stretch === null) return null;
  return { fromM: stretch.closurePointM, toM: stretch.closureEndM, outerLane: Math.max(...lanes) };
}

/**
 * One SceneMark per event that has not finished and can run on this road. `owners` is what the engine
 * binding last applied for this carriageway: an event is drawn holding lanes only if it OWNS the
 * closure, so the picture never shows a wreck the engine is not honouring. Pure; the canvas calls it
 * each frame.
 */
export function sceneMarks(events: readonly ScenarioEvent[], road: Road, simTimeS: number, owners: Ownership): readonly SceneMark[] {
  const t = scenarioTimeS(simTimeS, road);
  const byId = new Map(events.map((e) => [e.id, e] as const));
  const out: SceneMark[] = [];
  for (const mark of canvasMarks(events, road, simTimeS)) {
    const e = byId.get(mark.eventId);
    if (e === undefined) continue;
    // Its scene is drawn in the plaza (facilityArt), from the vehicles actually stranded there.
    if (e.site) continue;
    const phase = mark.state === "pending" ? null : phaseAt(e, t);
    const start = phase === null ? 0 : e.startS + phase.offsetS;
    const fraction = phase === null || !(phase.durationS > 0) ? 0 : Math.max(0, Math.min(1, (t - start) / phase.durationS));
    const holds = [owners.closure, ...owners.extraClosures].find((c) => c !== null && c.eventId === e.id) ?? null;
    out.push({
      ...mark,
      family: e.variant.family,
      phaseId: phase === null ? null : phase.id,
      phaseFraction: fraction,
      closedLanes: holds === null ? [] : holds.lanes,
      stretch: holds === null ? null : { fromM: holds.closurePointM, toM: holds.closureEndM },
      intensity: e.variant.family === "rain" ? e.variant.intensity : e.variant.family === "flood" && phase !== null ? floodRainOf(phase.id) : null,
      capKmh: e.variant.family === "rain"
        ? ASSUMPTIONS.RAIN_SPEED_KMH.value[e.variant.intensity]
        : e.variant.family === "flood" && phase !== null && floodRainOf(phase.id) !== null
          ? ASSUMPTIONS.RAIN_SPEED_KMH.value[floodRainOf(phase.id) as RainIntensity]
          : null,
      vehicle: breakdownVehicle(e.variant),
      water: e.variant.family === "flood" ? floodWaterOf(e, road) : null,
      rainLevel: e.variant.family === "rain" || e.variant.family === "flood" ? rainLevelOf(e, t, phase) : 0,
      elapsedS: Math.max(0, Math.min(e.endS - e.startS, t - e.startS)),
      remainingS: Math.max(0, Math.min(e.endS - e.startS, e.endS - t)),
    });
  }
  return out;
}