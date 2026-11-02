import { createBot } from '../core/bot';
import { STEP, MAX_FRAME } from '../core/config';
import { CHARACTER_NAMES, RADIO, RadioDirector, speakerName } from '../core/dialogue';
import { createFlow, type Flow } from '../core/flow';
import { MISSIONS, type MissionDef } from '../core/missions';
import { heroFor } from '../core/progression';
import { POWERUP_DEFS, RUN_UPGRADES, SIDEKICK_DEFS } from '../core/roster';
import { newRunId, newSeed } from '../core/rng';
import { mapSnapshot, type ScenarioConfig, type TrafficSnapshot } from '../core/scenario';
import { DrivingSim, NO_INPUT, type SimEvent } from '../core/sim';
import type { MissionId, Payout, RunResult } from '../core/types';
import type { AudioEngine } from './audio';
import { InputController } from './input';
import { laneAt, screenX } from './render/camera';
import { DriveRenderer, type DriveLook } from './render/drive';
import { announce } from './ui/dom';
import { Hud } from './ui/hud';
import { convoyCards } from './ui/onboarding';
import { briefingOverlay, checkpointOverlay, pauseOverlay, resultsOverlay, type OverlayApi } from './ui/missionOverlays';
import type { AppApi, Scene } from './appApi';

/**
 * One mission, from briefing to results. All screen changes go through the
 * flow state machine (core/flow.ts); results are committed once per run.
 * The simulation advances in fixed steps from the frame time, scaled by the
 * "game speed" assist and capped so an interruption never jumps the road.
 */

export const LOOKS: Record<MissionId, DriveLook> = {
  'm1-garage': {
    time: 'morning',
    landmark: 'city',
    props: ['house', 'billboard', 'lamp'],
    near: ['mango', 'palmTall', 'banana', 'hedge', 'acaciaBig'],
    far: ['nipa', 'pylon', 'mango', 'bamboo'],
    camera: 'solo',
  },
  'm2-convoy': {
    time: 'noon',
    landmark: 'arena',
    props: ['billboard', 'lamp', 'house'],
    near: ['acaciaBig', 'bamboo', 'mango', 'hedge', 'banana'],
    far: ['pylon', 'nipa', 'acaciaBig', 'bamboo'],
    camera: 'convoy',
  },
  'm3-finale': {
    time: 'sunset',
    landmark: 'plaza',
    props: ['banderitas', 'lamp'],
    near: ['palmTall', 'hedge', 'mango'],
    far: ['nipa', 'palmTall', 'pylon'],
    camera: 'solo',
  },
  'bocaue-interchange': { time: 'morning', landmark: 'none', props: ['banderitas', 'lamp', 'billboard'], near: ['mango', 'hedge', 'banana', 'acaciaBig'], far: ['nipa', 'pylon', 'bamboo'], camera: 'solo' },
  tambubong: { time: 'morning', landmark: 'none', props: ['lamp', 'house', 'billboard'], near: ['hedge', 'mango', 'acaciaBig', 'banana'], far: ['pylon', 'nipa', 'mango'], camera: 'solo' },
  tabang: { time: 'noon', landmark: 'none', props: ['house', 'lamp', 'billboard'], near: ['banana', 'mango', 'hedge', 'palmTall'], far: ['nipa', 'bamboo', 'pylon'], camera: 'solo' },
  balagtas: { time: 'noon', landmark: 'none', props: ['house', 'banderitas', 'lamp'], near: ['acaciaBig', 'hedge', 'banana', 'mango'], far: ['nipa', 'mango', 'bamboo'], camera: 'solo' },
  'sta-rita': { time: 'noon', landmark: 'none', props: ['billboard', 'lamp', 'house'], near: ['banana', 'hedge', 'palmTall', 'mango', 'bamboo'], far: ['nipa', 'bamboo', 'acaciaBig'], camera: 'convoy' },
  pulilan: { time: 'sunset', landmark: 'none', props: ['lamp', 'house'], near: ['acaciaBig', 'bamboo', 'hedge', 'mango'], far: ['nipa', 'acaciaBig', 'mango'], camera: 'solo' },
  'san-simon': { time: 'morning', landmark: 'none', props: ['billboard', 'lamp'], near: ['hedge', 'banana', 'mango', 'bamboo'], far: ['pylon', 'nipa', 'pylon'], camera: 'solo' },
  'san-fernando': { time: 'sunset', landmark: 'lanterns', props: ['banderitas', 'lamp'], near: ['palmTall', 'hedge', 'mango'], far: ['nipa', 'palmTall', 'pylon'], camera: 'solo' },
  mexico: { time: 'morning', landmark: 'arayat', props: ['lamp', 'billboard'], near: ['acaciaBig', 'mango', 'hedge', 'banana'], far: ['nipa', 'mango', 'bamboo'], camera: 'solo' },
  angeles: { time: 'noon', landmark: 'arayat', props: ['billboard', 'lamp', 'house'], near: ['mango', 'acaciaBig', 'hedge', 'palmTall'], far: ['pylon', 'nipa', 'acaciaBig'], camera: 'convoy' },
  dau: { time: 'noon', landmark: 'city', props: ['billboard', 'lamp', 'house'], near: ['hedge', 'palmTall', 'mango'], far: ['pylon', 'pylon', 'nipa'], camera: 'solo' },
  sctex: { time: 'sunset', landmark: 'pinatubo', props: ['lamp', 'billboard'], near: ['acaciaBig', 'hedge', 'bamboo'], far: ['pylon', 'nipa', 'acaciaBig'], camera: 'solo' },
  'sta-ines': { time: 'sunset', landmark: 'pinatubo', props: ['banderitas', 'lamp'], near: ['palmTall', 'hedge', 'acaciaBig'], far: ['nipa', 'pylon', 'bamboo'], camera: 'solo' },
  snapshot: {
    time: 'noon',
    landmark: 'none',
    props: ['lamp', 'billboard'],
    near: ['acaciaBig', 'hedge', 'mango', 'banana'],
    far: ['pylon', 'nipa', 'bamboo'],
    camera: 'solo',
  },
  endless: {
    time: 'morning',
    landmark: 'city',
    props: ['billboard', 'lamp', 'house'],
    near: ['mango', 'palmTall', 'bamboo', 'hedge', 'acaciaBig', 'banana'],
    far: ['nipa', 'pylon', 'mango', 'bamboo'],
    camera: 'solo',
  },
};

/** What the button refuses, in words. */
const ABILITY_REFUSALS = { cooldown: 'Signature recharging', active: 'Already running', none: 'Nothing to do now' } as const;

export class MissionRunner implements Scene {
  readonly root: HTMLElement;
  readonly def: MissionDef;
  private readonly flow: Flow;
  private readonly renderer = new DriveRenderer();
  private readonly input: InputController;
  private sim: DrivingSim;
  private radio = new RadioDirector();
  private hud: Hud | null = null;
  private overlay: HTMLElement | null = null;
  /** Power-up kinds whose radio explanation was already given this run. */
  private readonly powersExplained = new Set<string>();
  private readonly barkTurn = new Map<string, number>();
  private seed: number;
  private runId = '';
  private accumulator = 0;
  private countdownT = 0;
  private endT = 0;
  private snapshot: TrafficSnapshot | null = null;
  private scenario: ScenarioConfig | null = null;
  private lastPulseCount = 0;
  private seenSign = false;
  private lastPayout: Payout | null = null;
  private lastResult: RunResult | null = null;
  private firstBump = true;
  /** The signature lesson has been given this run. */
  private signatureTaught = false;
  private firstBotSeen = false;
  /** A checkpoint choice is on screen. */
  private choosing = false;
  private disposed = false;
  /** Development autopilot (debug builds). */
  readonly bot = createBot({ useAbility: true });
  private readonly unsubscribe: (() => void)[] = [];
  private t = 0;

  constructor(private readonly app: AppApi, missionId: MissionId, options: { seed?: number; snapshot?: TrafficSnapshot | null } = {}) {
    this.def = MISSIONS[missionId];
    this.flow = createFlow();
    this.seed = options.seed ?? newSeed();
    this.snapshot = options.snapshot ?? null;
    this.scenario = this.snapshot !== null ? mapSnapshot(this.snapshot) : null;
    this.root = document.createElement('div');
    this.root.className = 'mission';
    this.renderer.setLook(LOOKS[missionId]);
    this.sim = this.makeSim();
    this.input = new InputController({
      playerX: () => this.sim.state.player.x,
      laneWidthPx: () => laneAt(this.renderer.cam, 0),
      carScreenX: () => screenX(this.renderer.cam, this.sim.state.player.x, 0),
      onPause: () => this.pause(),
      onActivity: () => this.app.audio.unlock(),
    });
    this.unsubscribe.push(
      this.flow.onChange((from, to) => {
        this.input.setEnabled(to === 'playing');
        if (to === 'paused' || to === 'results') {
          this.radio.clear();
        }
        void from;
      }),
    );
    this.showBriefing();
  }

  get audio(): AudioEngine {
    return this.app.audio;
  }

  private makeSim(): DrivingSim {
    const save = this.app.save;
    const settings = save.settings;
    return new DrivingSim({
      missionId: this.def.id,
      seed: this.seed,
      settings: { difficulty: settings.difficulty, gameSpeed: settings.gameSpeed, warningBoost: settings.warningBoost, autoAbility: settings.autoAbility },
      loadout: {
        hero: heroFor(save, this.def.id),
        sidekicks: [save.loadout.sidekicks[0], save.loadout.sidekicks[1]].map((id) => (id !== null && save.sidekicks[id] !== undefined ? id : null)) as [typeof save.loadout.sidekicks[0], typeof save.loadout.sidekicks[1]],
        evolved: Object.fromEntries(Object.entries(save.sidekicks).map(([id, p]) => [id, p?.evolved === true])),
      },
      upgrades: save.upgrades,
      skipTutorial: save.tutorialDone && !this.app.replayTutorial,
      scenario: this.scenario,
    });
  }

  // -- Scene ----------------------------------------------------------------

  resize(width: number, height: number, dpr: number): void {
    this.renderer.resize(width, height, dpr);
    this.reserveHudSpace();
  }

  /** After layout: keep the road below the HUD's top stack. */
  private reserveHudSpace(): void {
    requestAnimationFrame(() => {
      if (this.hud !== null && !this.disposed) {
        this.renderer.setInsets(this.hud.reservedTop(), this.hud.reservedBottom());
        this.hud.placeToast(this.renderer.cam);
      }
    });
  }

  draw(ctx: CanvasRenderingContext2D, _t: number, frameDt: number): void {
    const dt = Math.min(MAX_FRAME, frameDt);
    this.t += dt;
    const state = this.flow.state;
    if (state === 'countdown') {
      this.tickCountdown(dt);
    } else if (state === 'playing') {
      this.tickPlaying(dt);
    } else if (state === 'success' || state === 'failure') {
      // Let the last moment play out, then the results.
      this.endT -= dt;
      this.stepSim(dt, NO_INPUT);
      if (this.endT <= 0 && this.flow.send('showResults') !== null) {
        this.showResults();
      }
    }
    this.renderer.particles.density = this.app.save.settings.reduceMotion ? 0.3 : 1;
    this.renderer.draw(ctx, this.sim.state, this.t, state === 'paused' ? 0 : dt, {
      reduceMotion: this.app.save.settings.reduceMotion,
      hazardOutlines: this.app.save.settings.hazardOutlines,
    });
    if (this.hud !== null) {
      // While the tutorial or the lay-by teaches something, its instruction keeps the message slot
      // (radio lines are still read out to screen readers).
      const s = this.sim.state;
      const pinned = s.tutorial !== null || s.rescue !== null;
      this.hud.update(s, this.sim.progress(), pinned ? null : this.radio.current, this.sim.abilityReady(), this.sim.abilityMode(), this.t, state === 'paused' ? 0 : dt);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.input.detach();
    this.unsubscribe.forEach((fn) => fn());
    this.renderer.dispose();
    this.root.replaceChildren();
  }

  // -- flow ---------------------------------------------------------------------

  private overlayApi(): OverlayApi {
    return {
      app: this.app,
      def: this.def,
      sim: this.sim,
      seed: this.seed,
      radioLog: this.radio.log,
      snapshot: this.snapshot,
      scenario: this.scenario,
    };
  }

  private setOverlay(el: HTMLElement | null): void {
    this.overlay?.remove();
    this.overlay = el;
    // The HUD behind a dialog is inert: Tab stays in the dialog, screen readers do not wander behind it.
    this.hud?.el.root.toggleAttribute('inert', el !== null);
    if (el !== null) {
      this.root.append(el);
      this.app.focusInto(el);
    }
  }

  private showBriefing(): void {
    this.hud?.el.root.remove();
    this.hud = null;
    this.app.audio.playMusic('garage');
    // The Snapshot briefing always shows (and reads) the snapshot with its source label - also on a retry.
    const needsSnapshot = this.def.id === 'snapshot';
    const overlay = briefingOverlay(this.overlayApi(), {
      onStart: () => this.begin(),
      onBack: () => {
        if (this.flow.send('quit') !== null) {
          this.app.goMap();
        }
      },
      onSnapshot: needsSnapshot
        ? (snapshot) => {
            this.snapshot = snapshot;
            this.scenario = mapSnapshot(snapshot);
            this.sim = this.makeSim();
          }
        : null,
    });
    this.setOverlay(overlay);
  }

  /** Briefing -> countdown: a brand-new run with its own id. */
  private begin(): void {
    if (this.def.id === 'snapshot' && this.snapshot === null) {
      return;
    }
    if (this.flow.send('start') === null) {
      return;
    }
    this.app.audio.unlock();
    this.runId = newRunId(this.seed);
    this.sim = this.makeSim();
    this.radio = new RadioDirector();
    this.radio.machine = this.def.machine ?? 'barrikada';
    this.accumulator = 0;
    this.lastPulseCount = 0;
    this.seenSign = false;
    this.firstBump = true;
    this.signatureTaught = false;
    this.firstBotSeen = false;
    this.choosing = false;
    this.radio.hero = this.sim.state.hero.id;
    this.setOverlay(null);
    this.buildHud();
    // First time through the convoy: the onboarding cards, at the player's pace, then the countdown.
    // Only the first convoy teaches it; later ones just get on with the drive.
    const firstTime = this.def.id === 'm2-convoy' && this.app.save.missions[this.def.id]?.completed !== true;
    if (this.def.kind === 'convoy' && firstTime && this.hud !== null && !this.app.autoplay) {
      this.countdownT = Number.POSITIVE_INFINITY;
      this.hud.showCards(convoyCards(this.sim.state.hero.id), () => {
        if (this.flow.state === 'countdown') {
          this.startCountdown();
        }
      });
    } else {
      this.startCountdown();
    }
    this.app.audio.playMusic(this.def.kind === 'finale' ? 'boss' : 'drive');
    this.radio.trigger(this.def.id === 'm1-garage' ? 'm1-start' : this.def.id === 'm2-convoy' ? 'm2-start' : this.def.kind === 'finale' ? 'boss-intro' : RADIO[`start-${this.def.id}`] !== undefined ? `start-${this.def.id}` : 'm1-route');
  }

  private buildHud(): void {
    const settings = this.app.save.settings;
    const hud = new Hud(this.def, this.sim.state.hero.id, settings.steering, settings.abilitySide, () => this.pause());
    hud.setSidekicks(this.sim.state.sidekicks);
    this.hud = hud;
    this.root.prepend(hud.el.root);
    hud.el.root.toggleAttribute('inert', this.overlay !== null);
    this.input.configure(settings.steering, settings.sensitivity);
    this.input.reset();
    this.input.attach({ pad: hud.el.pad, left: hud.el.left, right: hud.el.right, ability: hud.el.ability });
    hud.setObjective(...this.objective());
    this.reserveHudSpace();
  }

  private startCountdown(seconds = 3): void {
    this.countdownT = seconds;
    this.hud?.countdown(String(Math.ceil(seconds)));
    this.app.audio.sfx('count');
  }

  private tickCountdown(dt: number): void {
    const before = Math.ceil(this.countdownT);
    this.countdownT -= dt;
    const now = Math.ceil(this.countdownT);
    if (this.countdownT <= 0) {
      this.hud?.countdown('');
      if (this.flow.send('countdownDone') !== null) {
        this.app.audio.sfx('go');
        this.hud?.go();
      }
      return;
    }
    if (now !== before) {
      this.hud?.countdown(String(now));
      this.app.audio.sfx('count');
    }
  }

  private stepSim(dt: number, input: typeof NO_INPUT | null): void {
    // Game speed assist: the whole simulation runs slower.
    this.accumulator += dt * this.app.save.settings.gameSpeed;
    let steps = 0;
    while (this.accumulator >= STEP && steps < 8) {
      const live = this.app.autoplay ? this.bot(this.sim, STEP) : this.input.poll();
      this.sim.step(STEP, input ?? live);
      this.accumulator -= STEP;
      steps += 1;
    }
    if (steps >= 8) {
      this.accumulator = 0;
    }
    this.handleEvents(this.sim.drainEvents());
  }

  private tickPlaying(dt: number): void {
    this.stepSim(dt, null);
    this.radio.update(dt, this.sim.state.danger);
    const line = this.radio.current;
    if (line !== null && line.left === line.total) {
      // A new line: voice it and read it out.
      this.app.audio.voice(line.speaker, line.text);
      announce(`${speakerName(line.speaker)}: ${line.text}`);
    }
    const [objective, icon] = this.objective();
    this.hud?.setObjective(objective, icon);
    // Horn pulses (sound only when a new one leaves the car; the sound itself is rate-limited).
    const pulses = this.sim.state.pulses.length;
    if (pulses > this.lastPulseCount) {
      this.app.audio.sfx('pulse');
    }
    this.lastPulseCount = pulses;
    if (!this.seenSign && this.sim.state.signs.some((s) => s.sign === 'closure')) {
      this.seenSign = true;
      this.radio.trigger('m2-closure');
    }
    if (!this.firstBotSeen && this.sim.state.hazards.some((h) => h.maxHp > 0 && !h.practice && h.z < 50)) {
      this.firstBotSeen = true;
      this.radio.trigger('firstBot');
    }
    this.teachSignature();
    if (this.sim.state.choice !== null && !this.choosing) {
      this.openCheckpoint();
    }
  }

  /**
   * A checkpoint: the simulation is frozen (it does not step while a choice
   * is open), the run is paused, and three temporary upgrades are offered.
   * After the pick, a short countdown resumes the run.
   */
  private openCheckpoint(): void {
    const choice = this.sim.state.choice;
    if (choice === null || this.flow.send('pause') === null) {
      return;
    }
    this.choosing = true;
    this.app.audio.sfx('postcard');
    this.setOverlay(
      checkpointOverlay(this.overlayApi(), choice, (id, bank) => {
        if (!this.choosing) {
          return;
        }
        this.choosing = false;
        this.sim.choose(id, bank);
        this.app.audio.sfx('buy');
        this.setOverlay(null);
        if (this.flow.send('resume') !== null) {
          this.input.reset();
          this.startCountdown(bank ? 0.01 : 2);
        }
        if (id !== null) {
          this.hud?.toast(`${RUN_UPGRADES[id].name} - for this run`);
        }
      }),
    );
    if (this.app.autoplay) {
      // The development autopilot takes the first offer after a beat, so long recordings keep driving.
      window.setTimeout(() => (this.root.querySelector('.upgrade-choice') as HTMLButtonElement | null)?.click(), 600);
    }
  }

  /**
   * The signature, taught through play: the first time a hazard is about to
   * reach the hero (or Kiko) while the signature is ready, the hero calls it
   * out and the button bounces. Once per run, and never if it was already used.
   */
  private teachSignature(): void {
    const s = this.sim.state;
    if (this.signatureTaught || !this.sim.abilityReady() || this.sim.abilityMode() !== 'signature' || s.rescue !== null || s.time < 8 || s.tutorial !== null) {
      return;
    }
    if (s.player.signature > 0 || s.player.cooldown > 0) {
      this.signatureTaught = true;
      return;
    }
    const soon = s.hazards.some((h) => {
      if (h.spent || h.practice) {
        return false;
      }
      const approach = s.speed * (1 - h.ownSpeed + h.thrown);
      const t = approach > 0 ? h.z / approach : Infinity;
      return t > 0.4 && t < 1.3 && Math.abs(h.x - s.player.x) < h.halfW + 0.35;
    });
    if (soon) {
      this.signatureTaught = true;
      this.radio.trigger(`teach-${s.hero.id}`);
      const btn = this.hud?.el.ability;
      if (btn) {
        btn.classList.remove('hint');
        void btn.offsetWidth;
        btn.classList.add('hint');
      }
    }
  }

  /**
   * Android back / the host's 'back': presses the open overlay's back button (briefing: Back to
   * map, checkpoint: Skip, pause: Resume, results: Continue), else pauses a run. Always handled -
   * during the last moment of a run it simply waits, so a run is never dropped by leaving.
   */
  back(): boolean {
    const target = this.overlay?.querySelector<HTMLElement>('[data-back]');
    if (target) {
      target.click();
    } else {
      this.pause();
    }
    return true;
  }

  pause(): void {
    const state = this.flow.state;
    if ((state !== 'playing' && state !== 'countdown') || this.choosing) {
      return;
    }
    if (this.flow.send('pause') === null) {
      return;
    }
    this.hud?.countdown('');
    this.app.audio.sfx('tap');
    this.setOverlay(
      pauseOverlay(this.overlayApi(), {
        onResume: () => this.resume(),
        onRestart: () => {
          if (this.flow.send('retry') !== null) {
            this.seed = newSeed();
            this.sim = this.makeSim();
            this.showBriefing();
          }
        },
        onQuit: () => {
          if (this.flow.send('quit') !== null) {
            this.app.goMap();
          }
        },
        onSettingsChanged: () => {
          const s = this.app.save.settings;
          this.input.configure(s.steering, s.sensitivity);
          if (this.hud !== null) {
            // Rebuild the controls for a new steering mode or hand.
            this.hud.el.root.remove();
            this.input.detach();
            this.buildHud();
          }
        },
      }),
    );
  }

  /** The host app went to the background, or the page lost focus. */
  hostPause(): void {
    this.pause();
  }

  private resume(): void {
    if (this.flow.send('resume') === null) {
      return;
    }
    this.setOverlay(null);
    this.input.reset();
    if (this.hud?.showingCards) {
      // Back to the onboarding card; its button starts the countdown.
      this.hud.el.root.querySelector<HTMLElement>('.card-next')?.focus();
      return;
    }
    this.startCountdown();
  }

  // -- events -------------------------------------------------------------------

  /** A sidekick's short bark: chatter only (dropped on a busy road), never the same line twice in a row. */
  private bark(id: keyof typeof SIDEKICK_DEFS, kind: 'action' | 'hurt' | 'cheer'): void {
    const def = SIDEKICK_DEFS[id];
    const lines = kind === 'action' ? def.barks.action : [kind === 'hurt' ? def.barks.hurt : def.barks.cheer];
    // In turn, so the same bark never comes twice in a row.
    const key = `${id}-${kind}`;
    const index = ((this.barkTurn.get(key) ?? -1) + 1) % lines.length;
    this.barkTurn.set(key, index);
    const text = lines[index];
    this.radio.say({ id: `bark-${id}-${kind}`, speaker: id, expr: kind === 'hurt' ? 'worried' : kind === 'cheer' ? 'celebrate' : 'happy', text, priority: 0, cooldown: kind === 'action' ? 14 : 20 });
  }

  private handleEvents(events: SimEvent[]): void {
    const audio = this.app.audio;
    const s = this.sim.state;
    const cam = this.renderer.cam;
    const carX = screenX(cam, s.player.x, 0);
    const carY = cam.playerY - laneAt(cam, 0) * 0.3;
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          if (e.who === 'hero') {
            audio.sfx('hit');
            this.renderer.kick(7);
            this.renderer.particles.spawn(carX, carY, 14, '#C9D3DE', { speed: 160, size: 4 });
            this.radio.trigger(e.dents === 1 ? 'firstHit' : 'hit');
            if (s.player.maxDents !== null && e.dents === s.player.maxDents - 1) {
              this.radio.trigger('lastDent');
            }
            const mate = s.sidekicks[0];
            if (mate !== undefined && e.dents > 1) {
              this.bark(mate.id, 'hurt');
            }
          } else {
            audio.sfx('bump');
            this.radio.trigger('kikoHit');
            if (s.kiko !== null && s.kiko.engine === 1) {
              this.radio.trigger('kikoLow');
            }
          }
          break;
        case 'practiceBump':
          audio.sfx('bump');
          if (this.firstBump) {
            this.firstBump = false;
            this.hud?.toast('Practice cone - no dent!');
          }
          break;
        case 'pickup': {
          const colour = e.kind === 'bolt' ? '#FFC93C' : e.kind === 'spark' ? '#5FD3FF' : e.kind === 'part' ? '#21B3A2' : e.kind === 'powerup' ? '#FFFFFF' : '#FFFFFF';
          this.renderer.particles.spawn(carX, carY - laneAt(cam, 0) * 0.3, e.kind === 'bolt' ? 5 : 12, colour, { kind: 'star', speed: 90, size: 5 });
          // The look of it: a Bolt flies up into the counter; a wrench heals; a capsule bursts in its colour.
          if (e.kind === 'bolt') {
            const to = this.hud?.boltTarget() ?? null;
            if (to !== null) {
              this.renderer.flyBolt(carX, carY - laneAt(cam, 0) * 0.3, to.x, to.y);
            }
          } else if (e.kind === 'wrench') {
            this.renderer.healBurst(carX, carY);
          } else if (e.kind === 'powerup' && e.power !== null) {
            this.renderer.powerBurst(carX, carY, e.power);
          } else if (e.kind === 'spark') {
            this.renderer.sparkBurst(carX, carY);
          }
          audio.sfx(e.kind === 'bolt' ? 'bolt' : e.kind === 'wrench' ? 'wrench' : e.kind === 'postcard' ? 'postcard' : e.kind === 'part' ? 'part' : e.kind === 'powerup' ? 'postcard' : 'spark');
          if (e.kind === 'bolt' && s.boltsCollected === 1) {
            this.radio.trigger('firstBolt');
          } else if (e.kind === 'wrench') {
            this.radio.trigger('wrench');
          } else if (e.kind === 'postcard') {
            this.radio.trigger('postcard');
            this.hud?.toast('Postcard found!');
          } else if (e.kind === 'spark') {
            this.radio.trigger('spark');
          }
          break;
        }
        case 'power': {
          const def = POWERUP_DEFS[e.kind];
          // The toast (a live region) says it every time; the radio explains each kind once per run.
          this.hud?.toast(`${def.name}: ${Math.round(e.seconds)} s`);
          if (!this.powersExplained.has(e.kind)) {
            this.powersExplained.add(e.kind);
            this.radio.trigger('power', { name: def.name, text: def.text });
          }
          break;
        }
        case 'powerEnd':
          break;
        case 'signature':
          audio.sfx(e.hero === 'jepoy' ? 'shield' : e.hero === 'kiko' ? 'spark' : 'go');
          if (e.hero === 'jepoy') {
            this.renderer.jepoyShowT = 0;
          }
          this.radio.trigger(`signature-${e.hero}`);
          break;
        case 'shieldBlock':
          audio.sfx('block');
          this.radio.trigger('shieldBlock');
          break;
        case 'repair':
          audio.sfx('repair');
          this.hud?.toast(e.by === 'wrench' ? 'Dent fixed!' : `${SIDEKICK_DEFS[e.by].name} fixed a dent!`);
          if (e.by !== 'wrench') {
            this.bark(e.by, 'action');
          } else {
            this.radio.trigger('wrench');
          }
          break;
        case 'abilityUnavailable':
          audio.sfx('deny');
          this.hud?.toast(ABILITY_REFUSALS[e.reason]);
          break;
        case 'abilityReady':
          break;
        case 'laneSignal':
          audio.sfx('signal');
          this.radio.trigger('laneSignal');
          break;
        case 'kikoStrain':
          this.radio.trigger('kikoStrain');
          break;
        case 'kikoAlongside':
          this.radio.trigger(this.def.id === 'm2-convoy' ? 'kikoAlongside' : 'kikoAlongside-north');
          break;
        case 'kikoFixed':
          this.radio.trigger('kikoFixed');
          break;
        case 'foeHit':
          this.renderer.burst(e.x, e.z, false, e.by);
          break;
        case 'foeDown':
          audio.sfx('gear');
          this.renderer.burst(e.x, e.z, true, e.by);
          if (e.streak === 5) {
            this.radio.trigger('botStreak');
          }
          if (e.by === 'pip' || e.by === 'bumbo' || e.by === 'sibat' || e.by === 'maso') {
            this.bark(e.by, 'action');
          }
          break;
        case 'sidekick':
          if (e.action === 'guard') {
            audio.sfx('block');
            this.bark(e.id, 'action');
            this.hud?.toast(`${SIDEKICK_DEFS[e.id].name} blocked it!`);
          } else if (e.action === 'jam') {
            audio.sfx('signal');
          } else if (e.action === 'chain' || e.action === 'pierce') {
            audio.sfx('spark');
          } else if (e.action === 'slam') {
            audio.sfx('clank');
          } else if (e.action === 'sweep') {
            audio.sfx('part');
            this.bark(e.id, 'action');
          } else if (e.action === 'slow') {
            audio.sfx('signal');
            this.bark(e.id, 'action');
          }
          break;
        case 'checkpoint':
          break;
        case 'runUpgrade':
          break;
        case 'goal':
          announce(`New goal: ${e.text}`);
          break;
        case 'goalDone':
          audio.sfx('postcard');
          // Said once, by the radio (also read out); no second toast with the same words.
          this.radio.trigger('goalDone', { text: e.text });
          break;
        case 'section':
          if (e.kind === 'patterns' && this.def.id === 'm1-garage' && e.index === 1) {
            this.radio.trigger('m1-route');
          }
          break;
        case 'tutorialStep':
          audio.sfx('tap');
          announce(this.objective()[0]);
          break;
        case 'rescue':
          this.radio.trigger(`rescue-${e.phase}`);
          if (e.phase === 'push') {
            audio.sfx('repair');
            this.renderer.particles.spawn(carX, carY - 30, 16, '#FFC93C', { kind: 'star', speed: 120 });
          }
          break;
        case 'bossStage':
          if (e.stage === 'down') {
            this.renderer.downBurst();
          }
          if (e.stage === 'fight' && e.phase === 1) {
            this.renderer.phaseBurst(1);
            this.hud?.banner('Phase 1 · Shifting Gears', 'Line up with the open gear');
            this.radio.trigger('boss-p1');
          } else if (e.stage === 'break' && e.phase === 2) {
            this.renderer.kick(9);
            this.renderer.phaseBurst(2);
            this.hud?.banner('Phase 2 · Barrier Sweep', 'Two gears at once - your sidekicks help');
            this.radio.trigger('boss-p2');
            this.radio.trigger('boss-p2-tip');
          } else if (e.stage === 'break' && e.phase === 3) {
            this.renderer.kick(9);
            this.renderer.phaseBurst(3);
            this.hud?.banner('Phase 3 · Overheat', 'Grab 3 sparks, then TEAM HONK');
            this.radio.trigger('boss-p3');
            this.radio.trigger('boss-p3-tip');
          } else if (e.stage === 'honkReady') {
            audio.sfx('win');
            this.hud?.banner('Team Honk charged!', 'Press the TEAM HONK button', 'gold');
            this.radio.trigger('honkReady');
            const btn = this.hud?.el.ability;
            if (btn) {
              btn.classList.remove('hint');
              void btn.offsetWidth;
              btn.classList.add('hint');
            }
          } else if (e.stage === 'honk') {
            this.radio.trigger('teamHonk');
          } else if (e.stage === 'down') {
            this.radio.trigger('boss-down');
          }
          break;
        case 'gearOpen':
          this.radio.trigger('gearOpen');
          break;
        case 'gearHit':
          audio.sfx('gear');
          this.renderer.gearBurst(e.x, e.by);
          this.hud?.pulseBar();
          this.radio.trigger('gearHit');
          break;
        case 'clank':
          audio.sfx('clank');
          break;
        case 'teamHonk':
          audio.sfx('honk');
          this.renderer.kick(16);
          this.renderer.flash(0.55);
          this.renderer.honkBurst();
          this.hud?.banner('TEAM HONK!', 'Sabay-sabay - the whole team at once', 'gold');
          this.hud?.honkCutIn(s.hero.id, s.sidekicks);
          for (const mate of s.sidekicks) {
            this.bark(mate.id, 'cheer');
          }
          break;
        case 'gantry':
          this.radio.trigger(`gantry-${e.title}`);
          break;
        case 'progress':
          if (e.mark === 0.5) {
            this.radio.trigger('halfway');
          }
          break;
        case 'ending':
          this.radio.trigger(e.outcome === 'success' ? 'success' : e.reason === 'kiko' ? 'failKiko' : 'failDents');
          audio.sfx(e.outcome === 'success' ? 'win' : 'fail');
          break;
        case 'finished':
          if (this.flow.send(e.outcome === 'success' ? 'succeed' : 'fail') !== null) {
            this.endT = 0.6;
            // Commit now, not when the results appear: if the page is killed in between, nothing is lost.
            this.commitResult();
          }
          break;
        case 'fallback':
          break;
      }
    }
  }

  // -- results ------------------------------------------------------------------

  /** Pays the run out once (idempotent: the flow and the save's processed-run ids both guard it). */
  private commitResult(): void {
    const outcome = this.sim.state.outcome === 'success' ? 'success' : 'failure';
    const result = this.sim.result(this.runId, outcome);
    this.flow.commitOnce(() => {
      const committed = this.app.commitRun(result);
      this.lastPayout = committed.payout;
      this.lastResult = result;
    });
  }

  private showResults(): void {
    const outcome = this.sim.state.outcome === 'success' ? 'success' : 'failure';
    const result = this.sim.result(this.runId, outcome);
    this.commitResult();
    this.hud?.el.root.remove();
    this.hud = null;
    this.input.detach();
    this.app.audio.playMusic('garage');
    const firstClear = this.lastPayout?.firstClear === true;
    this.setOverlay(
      resultsOverlay(this.overlayApi(), this.lastResult ?? result, this.lastPayout ?? { lines: [], total: 0, firstClear: false, unlocks: [], cores: 0, xp: [], newBest: false }, {
        onContinue: () => {
          if (this.flow.send('leave') === null) {
            return;
          }
          // The 'after' scene plays on the first win that continues - also when the first clear was retried.
          const after = this.def.scenes.after;
          if (outcome === 'success' && after !== null && !this.app.save.scenesSeen.includes(after)) {
            this.app.playStory(after, () => this.app.goGarage());
          } else if (outcome === 'success' && firstClear) {
            this.app.goGarage();
          } else {
            this.app.goMap();
          }
        },
        onRetry: () => {
          if (this.flow.send('replay') !== null) {
            this.seed = newSeed();
            this.sim = this.makeSim();
            this.showBriefing();
          }
        },
      }),
    );
  }

  // -- development hooks (used by the headless test harness) ------------------------

  /** Skips the briefing. */
  debugBegin(): void {
    this.begin();
  }

  /** Runs the simulation forward without drawing (autopilot or no input). */
  debugAdvance(seconds: number): void {
    const end = this.sim.state.time + seconds;
    while (this.sim.state.time < end && this.sim.state.outcome === null) {
      if (this.sim.state.choice !== null) {
        // The autopilot takes the first offer; the overlay is not shown in fast-forward.
        this.sim.choose(this.sim.state.choice.options[0] ?? null);
      }
      this.sim.step(STEP, this.app.autoplay ? this.bot(this.sim, STEP) : NO_INPUT);
      this.handleEvents(this.sim.drainEvents());
      this.radio.update(STEP, this.sim.state.danger);
    }
  }

  get debugState(): { flow: string; sim: DrivingSim } {
    return { flow: this.flow.state, sim: this.sim };
  }

  // -- objective text -------------------------------------------------------------

  /** The short objective and its tag ([text, tag]). */
  private objective(): [string, string] {
    const s = this.sim.state;
    const steering = this.app.save.settings.steering;
    if (s.tutorial !== null) {
      switch (s.tutorial.step) {
        case 'steer':
          return [steering === 'drag' ? 'Practice: drag left and right in the pad under your car (or hold ← →).' : 'Practice: tap ‹ and › to change lanes (or press ← →).', 'Learn'];
        case 'bolts':
          return [`Collect Bolts - the golden nuts (${Math.min(3, s.tutorial.bolts)}/3).`, 'Learn'];
        case 'cones':
          return ['Weave around the cones. Practice cones cannot dent you.', 'Learn'];
        case 'pulse':
          return [`Your horn fires by itself: line up with the purple bots (${s.tutorial.zapped}/2).`, 'Learn'];
        case 'wrench':
          return ['Grab the wrench - wrenches fix one dent.', 'Learn'];
        case 'go':
          return ['Nice! The real road starts now.', 'Learn'];
      }
    }
    if (s.rescue !== null) {
      switch (s.rescue.phase) {
        case 'slowing':
          return ['Kiko is pulling into the safe lay-by...', 'Lay-by'];
        case 'align':
          return [`Line up in front of Kiko and hold steady - ${Math.round(s.rescue.progress * 100)}%`, 'Lay-by'];
        case 'push':
          return ["Jump-starting Kiko's engine...", 'Lay-by'];
        case 'resume':
          return ['Kiko is running again - back on the road!', 'Lay-by'];
      }
    }
    if (s.boss !== null) {
      const b = s.boss;
      if (b.stage === 'intro') {
        return [`${CHARACTER_NAMES[this.def.machine ?? 'barrikada']} is waking up...`, 'Boss'];
      }
      if (b.stage === 'honkReady') {
        return ['TEAM HONK is charged - press the button!', 'Honk'];
      }
      if (b.stage === 'honk') {
        return ['SABAY-SABAY - everyone honks together!', 'Honk'];
      }
      if (b.stage === 'down') {
        return ['The gears are resetting...', 'Boss'];
      }
      if (b.stage === 'break') {
        return ['Safe break - grab the wrench.', 'Break'];
      }
      if (b.phase === 1) {
        return ['Line up with the OPEN gear (bright ring + target).', 'Phase 1'];
      }
      if (b.phase === 2) {
        return ['Take one open gear - your sidekicks hit the other. Dodge the sweeps.', 'Phase 2'];
      }
      return [`Grab signal sparks to charge TEAM HONK (${b.sparks}/3).`, 'Phase 3'];
    }
    if (s.goal !== null && !s.goal.done) {
      if (s.goal.kind === 'clean') {
        return [s.goal.failed ? 'Clean stretch missed - keep going!' : s.goal.text, 'Goal'];
      }
      return [`${s.goal.text} - ${Math.min(s.goal.progress, s.goal.count)}/${s.goal.count}`, 'Goal'];
    }
    if (s.kiko !== null) {
      if (s.kiko.strain > 0.5) {
        return ['Smoother! Kiko is cutting the corner.', 'Convoy'];
      }
      return ['Lead Kiko - change lanes early', 'Convoy'];
    }
    if (this.def.kind === 'endless') {
      return [`${Math.floor(s.route)} m · bank your run at a checkpoint`, 'Endless'];
    }
    return [this.def.kind === 'scenario' ? 'Reach the end of the run.' : `Drive to ${this.def.to}.`, 'Goal'];
  }
}
