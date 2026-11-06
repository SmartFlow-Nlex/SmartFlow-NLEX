import { commitRun, type CommitOutcome } from '../core/progression';
import { crackTexture } from './render/brokenRoad';
import { loadSave, serializeSave } from '../core/save';
import { validateSnapshot, type TrafficSnapshot } from '../core/scenario';
import { HEROES, JOURNEY, SIDEKICKS, type MissionId, type RunResult, type SaveData } from '../core/types';
import { applyUnlocks } from '../core/unlocks';
import type { AppApi, Scene } from './appApi';
import { AudioEngine } from './audio';
import type { Host, InMessage } from './host';
import { MissionRunner } from './mission';
import { focusFirst, h } from './ui/dom';
import { collectionScreen, garageScreen, mapScreen, settingsScreen, storyScreen, teamScreen, titleScreen, workshopScreen, type Screen } from './ui/screens';
import { MISSIONS } from '../core/missions';

/**
 * The page's shell: owns the save, the one canvas, the current screen and its
 * scene, and the frame loop.
 *
 * Lifecycle: the loop runs only while the page is visible. Hiding the page
 * (app to background, phone locked) pauses a running mission, suspends audio
 * and stops the loop; showing it again restarts the loop with a fresh clock,
 * so nothing jumps. Leaving the screen in the app destroys the WebView, and
 * with it every listener, timer and sound.
 */

export class App implements AppApi {
  save: SaveData;
  readonly audio = new AudioEngine();
  replayTutorial = false;
  autoplay = false;
  readonly debug: boolean;
  private readonly host: Host;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private screenRoot!: HTMLElement;
  private toastEl!: HTMLElement;
  private screen: Screen | null = null;
  mission: MissionRunner | null = null;
  private scene: Scene | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf: number | null = null;
  private lastFrame = 0;
  private t = 0;
  private readonly storageOk: boolean;
  private saveWarned = false;
  private snapshotWaiters: ((m: Extract<InMessage, { type: 'snapshot' }>) => void)[] = [];
  readonly frameTimes: number[] = [];
  private readonly cleanups: (() => void)[] = [];

  constructor(host: Host) {
    this.host = host;
    this.debug = host.boot.debug;
    const loaded = loadSave(host.boot.save);
    this.save = loaded.save;
    this.storageOk = host.boot.storageOk;
    if (host.boot.save === null || loaded.issues.includes('empty')) {
      // First run: start from the phone's reduced-motion preference.
      this.save = { ...this.save, settings: { ...this.save.settings, reduceMotion: host.boot.reduceMotion } };
    }
    if (loaded.issues.includes('not-json') || loaded.issues.includes('not-object') || loaded.issues.includes('newer-version')) {
      this.host.send({ type: 'log', level: 'warn', message: `Tollbound Heroes save could not be read (${loaded.issues.join(', ')}); started fresh.` });
    }
  }

  // -- start ------------------------------------------------------------------

  start(root: HTMLElement): void {
    this.canvas = h('canvas', { id: 'world', attrs: { 'aria-hidden': 'true' } });
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.screenRoot = h('div', { id: 'screen-root' });
    this.toastEl = h('div', { class: 'app-toast', attrs: { role: 'status' } });
    root.replaceChildren(this.canvas, this.screenRoot, this.toastEl, h('div', { id: 'sr-live', class: 'sr-only', attrs: { 'aria-live': 'polite' } }));
    // Safe areas: the larger of what CSS reports and what the app measured.
    const insets = this.host.boot.insets;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--safe-top', `max(env(safe-area-inset-top, 0px), ${insets.top}px)`);
    rootStyle.setProperty('--safe-bottom', `max(env(safe-area-inset-bottom, 0px), ${insets.bottom}px)`);
    rootStyle.setProperty('--safe-left', `max(env(safe-area-inset-left, 0px), ${insets.left}px)`);
    rootStyle.setProperty('--safe-right', `max(env(safe-area-inset-right, 0px), ${insets.right}px)`);
    this.applySettings();

    const on = <K extends keyof WindowEventMap>(target: Window | Document, type: K, fn: (e: WindowEventMap[K]) => void): void => {
      target.addEventListener(type, fn as EventListener);
      this.cleanups.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(window, 'resize', () => this.resize());
    on(window, 'orientationchange', () => setTimeout(() => this.resize(), 120));
    const visibility = (): void => (document.hidden ? this.onHidden() : this.onVisible());
    document.addEventListener('visibilitychange', visibility);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', visibility));
    on(window, 'pagehide', () => this.onHidden());
    on(window, 'blur', () => this.mission?.hostPause());
    on(window, 'pointerdown', () => this.audio.unlock());
    on(window, 'keydown', (e) => this.onKey(e));
    this.cleanups.push(this.host.onMessage((m) => this.onHostMessage(m)));

    this.resize();
    this.goTitle();
    this.startLoop();
    this.host.send({ type: 'ready' });
    if (this.debug) {
      this.installDebug();
    }
  }

  dispose(): void {
    this.stopLoop();
    this.cleanups.forEach((fn) => fn());
    this.cleanups.length = 0;
    this.leaveScreen();
    this.audio.dispose();
  }

  // -- loop -------------------------------------------------------------------

  private startLoop(): void {
    if (this.raf !== null) {
      return;
    }
    this.lastFrame = performance.now();
    const frame = (now: number): void => {
      this.raf = requestAnimationFrame(frame);
      const raw = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      // Reduced-effects devices: cap at 30 fps.
      const dt = Math.min(0.1, Math.max(0, raw));
      if (this.debug) {
        this.frameTimes.push(raw * 1000);
        if (this.frameTimes.length > 600) {
          this.frameTimes.shift();
        }
      }
      this.t += dt;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (this.scene !== null) {
        this.scene.draw(this.ctx, this.t, dt);
      } else {
        this.ctx.fillStyle = '#0A1629';
        this.ctx.fillRect(0, 0, this.width, this.height);
      }
      this.screen?.tick?.(dt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stopLoop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  private onHidden(): void {
    this.mission?.hostPause();
    this.audio.suspend();
    this.stopLoop();
  }

  private onVisible(): void {
    this.audio.resume();
    this.startLoop();
  }

  /** Set once a road has run slowly: the rest of this session draws fewer pixels and less scenery. */
  slowDevice = false;

  noteSlowDevice(): void {
    if (!this.slowDevice) {
      this.slowDevice = true;
      this.resize();
    }
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = Math.min(this.save.settings.reduceMotion || this.slowDevice ? 1.5 : 2, window.devicePixelRatio || 1);
    if (width === this.width && height === this.height && ratio === this.dpr) {
      return;
    }
    this.width = width;
    this.height = height;
    this.dpr = ratio;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.scene?.resize(width, height, ratio);
  }

  // -- host -------------------------------------------------------------------

  private onHostMessage(m: InMessage): void {
    switch (m.type) {
      case 'pause':
        this.mission?.hostPause();
        this.audio.suspend();
        break;
      case 'resumeAllowed':
        this.audio.resume();
        break;
      case 'back':
        if (this.screen?.onBack?.() !== true) {
          this.exitGame();
        }
        break;
      case 'saved':
        break;
      case 'saveFailed':
        if (!this.saveWarned) {
          this.saveWarned = true;
          this.toast('Progress could not be saved on this phone. It is kept until you close the game.');
        }
        break;
      case 'snapshot': {
        const waiters = this.snapshotWaiters;
        this.snapshotWaiters = [];
        waiters.forEach((w) => w(m));
        break;
      }
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.screen?.onKey?.(e) === true) {
      return;
    }
    if (e.key === 'Escape' && this.mission === null) {
      if (this.screen?.onBack?.() === true) {
        e.preventDefault();
      }
    }
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    setTimeout(() => this.toastEl.classList.remove('show'), 4200);
  }

  // -- save -------------------------------------------------------------------

  private persist(): void {
    if (!this.storageOk) {
      return;
    }
    this.host.send({ type: 'save', save: serializeSave(this.save), revision: this.save.revision });
  }

  update(save: SaveData): void {
    const resized = save.settings.reduceMotion !== this.save.settings.reduceMotion;
    this.save = save;
    this.applySettings();
    this.persist();
    if (resized) {
      this.width = 0;
      this.resize();
    }
  }

  commitRun(result: RunResult): CommitOutcome {
    const out = commitRun(this.save, result);
    if (!out.duplicate) {
      this.save = out.save;
      this.persist();
    }
    return out;
  }

  private applySettings(): void {
    const s = this.save.settings;
    document.documentElement.style.setProperty('--text-scale', String(s.textScale));
    // Lets the stylesheet re-flow tight layouts for big text (media queries cannot see the text scale).
    document.documentElement.toggleAttribute('data-big-text', s.textScale > 1.1);
    document.body.classList.toggle('reduce-motion', s.reduceMotion);
    this.audio.setVolumes({ master: s.master, music: s.music, effects: s.effects, voices: s.voices });
  }

  setReplayTutorial(on: boolean): void {
    this.replayTutorial = on;
  }

  // -- navigation -----------------------------------------------------------------

  private leaveScreen(): void {
    this.screen?.dispose?.();
    this.screen?.el.remove();
    if (this.scene !== null) {
      this.scene.dispose();
    }
    this.mission = null;
    this.screen = null;
    this.scene = null;
  }

  private show(screen: Screen): void {
    this.leaveScreen();
    this.screen = screen;
    this.scene = screen.scene;
    this.scene?.resize(this.width, this.height, this.dpr);
    this.screenRoot.append(screen.el);
    this.focusInto(screen.el);
  }

  focusInto(el: HTMLElement): void {
    requestAnimationFrame(() => focusFirst(el));
  }

  goTitle(): void {
    this.show(titleScreen(this, this.storageOk));
  }

  goGarage(): void {
    this.show(garageScreen(this));
  }

  goMap(focus?: string): void {
    this.show(mapScreen(this, focus));
  }

  goWorkshop(): void {
    this.show(workshopScreen(this, () => this.goGarage()));
  }

  openTeam(back: () => void): void {
    this.show(teamScreen(this, back));
  }

  openCollection(back: () => void): void {
    this.show(collectionScreen(this, back));
  }

  openSettings(back: () => void, openDifficulty = false): void {
    this.show(settingsScreen(this, back, openDifficulty));
  }

  playStory(id: string, then: () => void): void {
    this.show(storyScreen(this, id, then));
  }

  startMission(id: MissionId): void {
    const before = MISSIONS[id].scenes.before;
    if (before !== null && !this.save.scenesSeen.includes(before)) {
      this.playStory(before, () => this.runMission(id));
      return;
    }
    this.runMission(id);
  }

  private runMission(id: MissionId, seed?: number): void {
    const runner = new MissionRunner(this, id, { seed });
    this.show({ el: runner.root, scene: runner, onBack: () => runner.back() });
    this.mission = runner;
  }

  requestSnapshot(exitId: string, direction: 'northbound' | 'southbound'): Promise<{ snapshot: TrafficSnapshot | null; error: string | null }> {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve({ snapshot: null, error: 'No answer from the forecast in 8 s' });
        }
      }, 8000);
      this.snapshotWaiters.push((m) => {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve({ snapshot: validateSnapshot(m.snapshot), error: m.error ?? null });
      });
      this.host.send({ type: 'requestSnapshot', exitId, direction });
    });
  }

  exitGame(): void {
    this.mission?.hostPause();
    this.host.send({ type: 'exit' });
  }

  // -- development tools (debug builds only) ------------------------------------------

  private installDebug(): void {
    (window as unknown as { __rt: unknown }).__rt = {
      app: this,
      go: (where: string, arg?: string) => {
        if (where === 'garage') this.goGarage();
        else if (where === 'map') this.goMap(arg);
        else if (where === 'team') this.openTeam(() => this.goGarage());
        else if (where === 'collection') this.openCollection(() => this.goGarage());
        else if (where === 'workshop') this.goWorkshop();
        else if (where === 'settings') this.openSettings(() => this.goGarage());
        else if (where === 'story') this.playStory(arg ?? 'opening', () => this.goGarage());
        else if (where === 'mission') this.runMission((arg ?? 'm1-garage') as MissionId, 7);
        else this.goTitle();
      },
      setSave: (save: SaveData) => this.update(save),
      /** Development only: a save cleared up to level n, with everyone that earns (what a real player there would have). */
      clearTo: (n: number) => {
        const missions = { ...this.save.missions };
        JOURNEY.slice(0, n).forEach((id) => {
          missions[id] = missions[id]?.completed === true ? missions[id] : { completed: true, clears: 1, bestScore: 0, bestDents: 0, foundPostcard: false };
        });
        this.update(applyUnlocks({ ...this.save, missions, tutorialDone: this.save.tutorialDone || n > 0, reveals: [] }).save);
      },
      /** Development only: everyone on the roster, in memory, for checking art and behaviour. */
      unlockAll: () => {
        const sidekicks = { ...this.save.sidekicks };
        for (const id of SIDEKICKS) {
          sidekicks[id] = sidekicks[id] ?? { xp: 0, evolved: false };
        }
        this.save = { ...this.save, heroes: [...HEROES], sidekicks, reveals: [] };
      },
      autoplay: (on: boolean) => {
        this.autoplay = on;
      },
      mission: () => this.mission,
      frames: () => this.frameTimes.slice(),
      scene: () => this.scene,
      /** Development only: a broken stretch's texture, flat, for checking how it is painted. */
      crackTexture,
    };
  }
}
