/**
 * The mission state machine. Every screen change of a run goes through
 * `send`, which accepts only the transitions listed here and ignores the
 * rest - a double tap on "Continue", a second "finished" from the simulation
 * or a pause arriving during the results cannot run anything twice.
 *
 *   briefing -> countdown -> playing <-> paused
 *                                 |         \-> briefing (retry) / return (quit)
 *                                 v
 *                       success | failure -> results -> return | briefing (replay)
 *
 * Resuming from a pause goes through the countdown again (safe resume).
 */

export type FlowState = 'briefing' | 'countdown' | 'playing' | 'paused' | 'success' | 'failure' | 'results' | 'return';

export type FlowEvent =
  | 'start'
  | 'countdownDone'
  | 'pause'
  | 'resume'
  | 'retry'
  | 'quit'
  | 'succeed'
  | 'fail'
  | 'showResults'
  | 'replay'
  | 'leave';

const TRANSITIONS: Record<FlowState, Partial<Record<FlowEvent, FlowState>>> = {
  briefing: { start: 'countdown', quit: 'return' },
  countdown: { countdownDone: 'playing', pause: 'paused' },
  playing: { pause: 'paused', succeed: 'success', fail: 'failure' },
  paused: { resume: 'countdown', retry: 'briefing', quit: 'return' },
  success: { showResults: 'results' },
  failure: { showResults: 'results' },
  results: { replay: 'briefing', leave: 'return' },
  return: {},
};

export interface Flow {
  readonly state: FlowState;
  /** Returns the new state, or null when the event is not allowed now. */
  send: (event: FlowEvent) => FlowState | null;
  /** True once the results for this run were committed - see `commitOnce`. */
  readonly committed: boolean;
  /** Runs `commit` the first time it is called for this run, never again. */
  commitOnce: (commit: () => void) => boolean;
  /** Called with (from, to, event) after every accepted transition. */
  onChange: (listener: (from: FlowState, to: FlowState, event: FlowEvent) => void) => () => void;
}

export function createFlow(initial: FlowState = 'briefing'): Flow {
  let state: FlowState = initial;
  let committed = false;
  const listeners = new Set<(from: FlowState, to: FlowState, event: FlowEvent) => void>();
  return {
    get state() {
      return state;
    },
    get committed() {
      return committed;
    },
    send(event) {
      const to = TRANSITIONS[state][event];
      if (to === undefined) {
        return null;
      }
      const from = state;
      state = to;
      if (to === 'briefing') {
        // A new attempt is a new run with its own commit.
        committed = false;
      }
      listeners.forEach((listener) => listener(from, to, event));
      return to;
    },
    commitOnce(commit) {
      if (committed) {
        return false;
      }
      committed = true;
      commit();
      return true;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function allowedEvents(state: FlowState): FlowEvent[] {
  return Object.keys(TRANSITIONS[state]) as FlowEvent[];
}
