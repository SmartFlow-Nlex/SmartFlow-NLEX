import type { CommitOutcome } from '../core/progression';
import type { TrafficSnapshot } from '../core/scenario';
import type { MissionId, RunResult, SaveData } from '../core/types';
import type { AudioEngine } from './audio';

/** What screens and the mission runner may ask of the app shell. */
export interface AppApi {
  readonly save: SaveData;
  readonly audio: AudioEngine;
  /** True when the player asked to see the tutorial again. */
  readonly replayTutorial: boolean;
  readonly debug: boolean;
  /** Development only: the autopilot drives. */
  readonly autoplay: boolean;
  /** Commits a finished run (exactly once per run id) and persists the save. */
  commitRun: (result: RunResult) => CommitOutcome;
  /** Replaces the save with a changed copy and persists it. */
  update: (save: SaveData) => void;
  goGarage: () => void;
  goWorkshop: () => void;
  goMap: (focusMission?: string) => void;
  goTitle: () => void;
  startMission: (id: MissionId) => void;
  playStory: (id: string, then: () => void) => void;
  openTeam: (back: () => void) => void;
  openCollection: (back: () => void) => void;
  openSettings: (back: () => void, openDifficulty?: boolean) => void;
  requestSnapshot: (exitId: string, direction: 'northbound' | 'southbound') => Promise<{ snapshot: TrafficSnapshot | null; error: string | null }>;
  /** Moves keyboard focus into a newly shown overlay or screen. */
  focusInto: (el: HTMLElement) => void;
  setReplayTutorial: (on: boolean) => void;
  exitGame: () => void;
}

/** A canvas renderer for the current screen. */
export interface Scene {
  resize: (width: number, height: number, dpr: number) => void;
  draw: (ctx: CanvasRenderingContext2D, t: number, dt: number) => void;
  dispose: () => void;
}
