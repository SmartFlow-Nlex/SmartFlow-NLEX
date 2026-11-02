/**
 * The race state machine. Screen changes go through `send`; anything not
 * listed is ignored, so a double tap or a late "finished" cannot run twice.
 *
 *   briefing -> countdown -> racing <-> paused
 *                               |        \-> briefing (restart) / exit (quit)
 *                               v
 *                           finished -> results -> exit | briefing (race again / next race)
 */

export type FlowState = 'briefing' | 'countdown' | 'racing' | 'paused' | 'finished' | 'results' | 'exit';
export type FlowEvent = 'start' | 'go' | 'pause' | 'resume' | 'restart' | 'quit' | 'finish' | 'showResults' | 'again' | 'leave';

const TRANSITIONS: Record<FlowState, Partial<Record<FlowEvent, FlowState>>> = {
  briefing: { start: 'countdown', quit: 'exit' },
  countdown: { go: 'racing', pause: 'paused' },
  racing: { pause: 'paused', finish: 'finished' },
  paused: { resume: 'countdown', restart: 'briefing', quit: 'exit' },
  finished: { showResults: 'results' },
  results: { again: 'briefing', leave: 'exit' },
  exit: {},
};

export interface Flow {
  readonly state: FlowState;
  send: (event: FlowEvent) => FlowState | null;
  /** Runs `commit` once per race (reset by a new briefing). */
  commitOnce: (commit: () => void) => boolean;
}

export function createFlow(): Flow {
  let state: FlowState = 'briefing';
  let committed = false;
  return {
    get state() {
      return state;
    },
    send(event) {
      const to = TRANSITIONS[state][event];
      if (to === undefined) {
        return null;
      }
      state = to;
      if (to === 'briefing') {
        committed = false;
      }
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
  };
}
