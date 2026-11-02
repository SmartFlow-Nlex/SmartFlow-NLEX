import type { CommitOutcome } from '../core/progression';
import type { RaceMode, RaceResult, SaveData, TrackId } from '../core/types';
import type { RaceAudio } from './audio';

/** What screens and the race runner may ask of the Grand Prix shell. */
export interface GpApi {
  readonly save: SaveData;
  readonly audio: RaceAudio;
  readonly debug: boolean;
  readonly autoplay: boolean;
  update: (save: SaveData) => void;
  commitRace: (result: RaceResult) => CommitOutcome;
  goTitle: () => void;
  goMenu: () => void;
  openPit: (back: () => void) => void;
  openSettings: (back: () => void) => void;
  startRace: (mode: RaceMode, track: TrackId) => void;
  focusInto: (el: HTMLElement) => void;
  exitGame: () => void;
}

export interface Scene {
  resize: (width: number, height: number, dpr: number) => void;
  draw: (ctx: CanvasRenderingContext2D, t: number, dt: number) => void;
  dispose: () => void;
}
