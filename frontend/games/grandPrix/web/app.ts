import { focusFirst, h } from '../../roadTrip/web/ui/dom';
import { commitRace, type CommitOutcome } from '../core/progression';
import { loadSave, serializeSave } from '../core/save';
import type { RaceMode, RaceResult, SaveData, TrackId } from '../core/types';
import type { GpApi, Scene } from './appApi';
import { RaceAudio } from './audio';
import type { Host, InMessage } from './host';
import { RaceRunner } from './raceRunner';
import { menuScreen, pitScreen, settingsScreen, titleScreen, type Screen } from './ui/gpScreens';

/**
 * The Grand Prix page shell: the save, one canvas, the current screen and
 * scene, the frame loop. The loop runs only while the page is visible; hiding
 * it pauses a race and suspends sound. Leaving the screen in the app destroys
 * the WebView and everything in it.
 */

export class GpApp implements GpApi {
  save: SaveData;
  readonly audio = new RaceAudio();
  readonly debug: boolean;
  autoplay = false;
  private readonly storageOk: boolean;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private screenRoot!: HTMLElement;
  private toastEl!: HTMLElement;
  private screen: Screen | null = null;
  private scene: Scene | null = null;
  race: RaceRunner | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf: number | null = null;
  private last = 0;
  private t = 0;
  private saveWarned = false;
  readonly frameTimes: number[] = [];
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly host: Host) {
    this.debug = host.boot.debug;
    this.storageOk = host.boot.storageOk;
    const loaded = loadSave(host.boot.save);
    this.save = loaded.save;
    if (loaded.issues.includes('empty')) {
      this.save = { ...this.save, settings: { ...this.save.settings, reduceMotion: host.boot.reduceMotion } };
    }
    if (loaded.issues.some((i) => i === 'not-json' || i === 'not-object' || i === 'newer-version')) {
      host.send({ type: 'log', level: 'warn', message: `Grand Prix save could not be read (${loaded.issues.join(', ')}); started fresh.` });
    }
  }

  start(root: HTMLElement): void {
    this.canvas = h('canvas', { id: 'world', attrs: { 'aria-hidden': 'true' } });
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.screenRoot = h('div', { id: 'screen-root' });
    this.toastEl = h('div', { class: 'app-toast', attrs: { role: 'status' } });
    root.replaceChildren(this.canvas, this.screenRoot, this.toastEl, h('div', { id: 'sr-live', class: 'sr-only', attrs: { 'aria-live': 'polite' } }));
    const insets = this.host.boot.insets;
    const style = document.documentElement.style;
    style.setProperty('--safe-top', `max(env(safe-area-inset-top, 0px), ${insets.top}px)`);
    style.setProperty('--safe-bottom', `max(env(safe-area-inset-bottom, 0px), ${insets.bottom}px)`);
    style.setProperty('--safe-left', `max(env(safe-area-inset-left, 0px), ${insets.left}px)`);
    style.setProperty('--safe-right', `max(env(safe-area-inset-right, 0px), ${insets.right}px)`);
    this.applySettings();
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void): void => {
      window.addEventListener(type, fn as EventListener);
      this.cleanups.push(() => window.removeEventListener(type, fn as EventListener));
    };
    on('resize', () => this.resize());
    on('orientationchange', () => setTimeout(() => this.resize(), 120));
    on('pagehide', () => this.onHidden());
    on('blur', () => this.race?.hostPause());
    on('pointerdown', () => this.audio.unlock());
    on('keydown', (e) => {
      if (e.key === 'Escape' && this.race === null && this.screen?.onBack?.() === true) {
        e.preventDefault();
      }
    });
    const visibility = (): void => (document.hidden ? this.onHidden() : this.onVisible());
    document.addEventListener('visibilitychange', visibility);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', visibility));
    this.cleanups.push(this.host.onMessage((m) => this.onHost(m)));
    this.resize();
    this.goTitle();
    this.startLoop();
    this.host.send({ type: 'ready' });
    if (this.debug) {
      (window as unknown as { __gp: unknown }).__gp = {
        app: this,
        race: () => this.race,
        frames: () => this.frameTimes.slice(),
        autoplay: (v: boolean) => {
          this.autoplay = v;
        },
        go: (where: string, a?: string, b?: string) => {
          if (where === 'race') this.startRace((a ?? 'cup') as RaceMode, (b ?? 'palayan') as TrackId);
          else if (where === 'pit') this.openPit(() => this.goMenu());
          else if (where === 'settings') this.openSettings(() => this.goMenu());
          else if (where === 'menu') this.goMenu();
          else this.goTitle();
        },
      };
    }
  }

  dispose(): void {
    this.stopLoop();
    this.cleanups.forEach((fn) => fn());
    this.leave();
    this.audio.dispose();
  }

  private startLoop(): void {
    if (this.raf !== null) {
      return;
    }
    this.last = performance.now();
    const frame = (now: number): void => {
      this.raf = requestAnimationFrame(frame);
      const raw = (now - this.last) / 1000;
      this.last = now;
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
      }
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
    this.race?.hostPause();
    this.audio.suspend();
    this.stopLoop();
  }

  private onVisible(): void {
    this.audio.resume();
    this.startLoop();
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = Math.min(this.save.settings.reduceMotion ? 1.5 : 2, window.devicePixelRatio || 1);
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

  private onHost(m: InMessage): void {
    if (m.type === 'pause') {
      this.race?.hostPause();
      this.audio.suspend();
    } else if (m.type === 'resumeAllowed') {
      this.audio.resume();
    } else if (m.type === 'back') {
      if (this.race !== null) {
        this.race.hostPause();
      } else if (this.screen?.onBack?.() !== true) {
        this.exitGame();
      }
    } else if (m.type === 'saveFailed' && !this.saveWarned) {
      this.saveWarned = true;
      this.toastEl.textContent = 'Progress could not be saved on this phone. It is kept until you close the game.';
      this.toastEl.classList.add('show');
      setTimeout(() => this.toastEl.classList.remove('show'), 4200);
    }
  }

  private persist(): void {
    if (this.storageOk) {
      this.host.send({ type: 'save', save: serializeSave(this.save), revision: this.save.revision });
    }
  }

  update(save: SaveData): void {
    const motion = save.settings.reduceMotion !== this.save.settings.reduceMotion;
    this.save = save;
    this.applySettings();
    this.persist();
    if (motion) {
      this.width = 0;
      this.resize();
    }
  }

  commitRace(result: RaceResult): CommitOutcome {
    const out = commitRace(this.save, result);
    if (!out.duplicate) {
      this.save = out.save;
      this.persist();
    }
    return out;
  }

  private applySettings(): void {
    const s = this.save.settings;
    document.documentElement.style.setProperty('--text-scale', String(s.textScale));
    document.body.classList.toggle('reduce-motion', s.reduceMotion);
    this.audio.setVolumes({ master: s.master, music: s.music, effects: s.effects });
  }

  private leave(): void {
    this.screen?.dispose?.();
    this.screen?.el.remove();
    this.scene?.dispose();
    this.screen = null;
    this.scene = null;
    this.race = null;
  }

  private show(screen: Screen): void {
    this.leave();
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

  goMenu(): void {
    this.show(menuScreen(this));
  }

  openPit(back: () => void): void {
    this.show(pitScreen(this, back));
  }

  openSettings(back: () => void): void {
    this.show(settingsScreen(this, back));
  }

  startRace(mode: RaceMode, track: TrackId): void {
    const runner = new RaceRunner(this, mode, track);
    this.show({ el: runner.root, scene: runner, onBack: () => (runner.pause(), true) });
    this.race = runner;
  }

  exitGame(): void {
    this.race?.hostPause();
    this.host.send({ type: 'exit' });
  }
}
