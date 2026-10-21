import { TrafficSim, type Interventions } from "./simulation";
import { createEngineBinding, type ManualControls, type RoadFrame } from "./scenarios/adapter";
import { TrendLog } from "./trends";

/* ══════════════════════════════════════════════════════════════════════════════
   THE SAME RUN WITHOUT THE EVENTS — the "Before" of a before/after with scenario events

   Testers (UAT, 16 Oct 2026, SB-17, blocked for two of three): "Scenario events are not applied in the baseline
   comparison." The before/after compared a snapshot the operator captured against the road now. That measures a
   change made AFTER the capture, which suits a lane closed by hand; it cannot measure an event that is already on
   the road (a forecast day draws its incidents the moment the run is built, and an event placed before Capture is
   on both sides), and against a snapshot taken minutes earlier it also measures the traffic drifting.

   So a carriageway with events gets a twin: a second engine built from the live one's own config — the same seed,
   hour, inflow, lanes, ramps and plazas — holding the operator's own settings and nothing else, stepped alongside it
   at the same fixed step. The engine is deterministic, so until the first event touches the road (its vehicles are
   picked out of the traffic SCENE_LEAD_S before it starts) the two are the same run vehicle for vehicle, and from
   then on every difference between them is the events'. Both are read on the same moments of the same clock.

   What it does not copy, stated: the twin is built when the first event is added, from the live run's settings as
   they are then, and caught up from the start; a closure, limit or inflow the operator changed and changed back
   before that is not replayed into it. From the moment it exists every operator change is mirrored into both.
══════════════════════════════════════════════════════════════════════════════ */

/** The engine as the twin needs to see the live run: its config and its clock. */
type Live = Pick<TrafficSim, "cfg" | "time">;

export class NoEventTwin {
  readonly sim: TrafficSim;
  /** The twin's readouts over time, on the same 10 s grid as the live run's TrendLog: what "Before" is averaged from. */
  readonly trend = new TrendLog();
  private readonly binding = createEngineBinding();
  private readonly warmupS: number;

  /** `initial` is the starting Interventions the live run was built with (useDirectionSim's buildInterventions). */
  constructor(readonly live: Live, initial: Partial<Interventions>, private readonly dt: number) {
    // A shallow copy: the same seed, ramps and plazas (replicate() shares them across runs the same way), but its own
    // object, so the twin's inflow can be set without reaching into the live run's.
    this.sim = new TrafficSim({ ...live.cfg }, initial);
    this.warmupS = live.cfg.warmupS ?? 60;
  }

  /** The operator's own settings, with no events: what the live run holds minus everything a scenario put there. */
  apply(controls: ManualControls, frame: RoadFrame): void {
    this.binding.apply(this.sim, controls, [], frame);
  }

  /** An obstacle the operator dropped on the live road (not an event's). */
  addIncident(lane: number, x: number): void {
    this.sim.addIncident(lane, x);
  }

  clearIncidents(): void {
    this.binding.clearOperatorIncidents(this.sim);
  }

  /** Seconds the twin is behind the live run (0 once caught up). */
  get lagS(): number {
    return Math.max(0, this.live.time - this.sim.time);
  }

  /** Level with the live run: both have taken the same number of fixed steps. */
  get caughtUp(): boolean {
    return this.sim.time >= this.live.time - this.dt / 2;
  }

  /** One step, if the live run is ahead. Called after every live step, so once level it stays level. */
  stepAlong(): void {
    if (this.caughtUp) return;
    this.sim.step(this.dt);
    this.trend.record(this.sim, this.warmupS);
  }

  /** Step until level with the live run or `budgetMs` of wall time is spent. Returns whether it is level. */
  catchUp(budgetMs: number, now: () => number): boolean {
    const started = now();
    while (!this.caughtUp) {
      if (now() - started >= budgetMs) return false;
      this.stepAlong();
    }
    return true;
  }
}
