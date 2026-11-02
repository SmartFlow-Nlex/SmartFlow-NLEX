import { announce, button, h } from '../../roadTrip/web/ui/dom';
import { portrait } from '../../roadTrip/web/ui/icons';
import { createRaceBot } from '../core/bot';
import { LAPS, MAX_FRAME, PRESETS, STEP } from '../core/config';
import { createFlow, type Flow } from '../core/flow';
import { ITEM_DEFS } from '../core/items';
import { formatTime, nextCupTrack, ordinal, standings, type CommitOutcome } from '../core/progression';
import { NO_RACE_INPUT, RaceSim, type RaceEvent } from '../core/race';
import { newRunId, newSeed } from '../core/rng';
import { TRACKS } from '../core/tracks';
import type { RaceMode, TrackId } from '../core/types';
import type { GpApi, Scene } from './appApi';
import { RaceInputController } from './input';
import { RaceRenderer } from './render/raceRenderer';
import { gpSettingsPanel } from './ui/gpSettings';
import { carName, rivalList } from './ui/gpScreens';
import { RaceHud } from './ui/raceHud';

/**
 * One race, briefing to results, through the flow state machine. The race is
 * stepped at a fixed rate from the frame time (scaled by the game-speed
 * assist, capped after interruptions) and committed once.
 */

export class RaceRunner implements Scene {
  readonly root: HTMLElement;
  private readonly flow: Flow;
  private readonly renderer = new RaceRenderer();
  private readonly input: RaceInputController;
  private sim: RaceSim;
  private hud: RaceHud | null = null;
  private overlay: HTMLElement | null = null;
  private seed = newSeed();
  private runId = '';
  private accumulator = 0;
  private countdown = 0;
  private endT = 0;
  private outcome: CommitOutcome | null = null;
  private disposed = false;
  private readonly bot = createRaceBot();

  constructor(private readonly app: GpApi, private readonly mode: RaceMode, private readonly track: TrackId) {
    this.flow = createFlow();
    this.root = h('div', { class: 'mission' });
    this.sim = this.makeSim();
    this.input = new RaceInputController({
      playerX: () => this.sim.player.x,
      slide: () => this.sim.player.slide,
      laneWidthPx: () => this.renderer.laneAt(0),
      onPause: () => this.pause(),
      onActivity: () => this.app.audio.unlock(),
    });
    this.showBriefing();
  }

  private makeSim(): RaceSim {
    const save = this.app.save;
    return new RaceSim({
      track: this.track,
      mode: this.mode,
      difficulty: save.settings.difficulty,
      seed: this.seed,
      upgrades: save.upgrades,
      autoSteer: save.settings.autoSteer,
      items: this.mode === 'cup' && save.settings.items,
      ghost: this.mode === 'trial' ? save.tracks[this.track]?.ghost ?? null : null,
    });
  }

  // -- Scene ------------------------------------------------------------------

  resize(width: number, height: number, dpr: number): void {
    this.renderer.resize(width, height, dpr);
    this.reserve();
  }

  private reserve(): void {
    requestAnimationFrame(() => {
      if (this.hud !== null && !this.disposed) {
        this.renderer.setTopInset(this.hud.reservedTop());
      }
    });
  }

  draw(ctx: CanvasRenderingContext2D, _t: number, frameDt: number): void {
    const dt = Math.min(MAX_FRAME, frameDt);
    const state = this.flow.state;
    if (state === 'countdown') {
      this.tickCountdown(dt);
    } else if (state === 'racing') {
      this.stepRace(dt, false);
    } else if (state === 'finished') {
      this.stepRace(dt, true);
      this.endT -= dt;
      if (this.endT <= 0 && this.flow.send('showResults') !== null) {
        this.showResults();
      }
    }
    const s = this.sim.state;
    const settings = this.app.save.settings;
    this.renderer.particles.density = settings.reduceMotion ? 0.3 : 1;
    this.renderer.draw(ctx, s, state === 'paused' || state === 'briefing' ? 0 : dt, {
      reduceMotion: settings.reduceMotion,
      showLine: settings.showLine,
      stripes: (this.app.save.upgrades.stripes ?? 0) > 0,
      ghost: this.mode === 'trial',
    });
    const racing = state === 'racing' || state === 'finished';
    this.app.audio.setEngine(racing ? this.sim.player.speed : 0, s.boostT > 0);
    this.hud?.update(s, this.ghostDelta(), state === 'paused' ? 0 : dt);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.app.audio.setEngine(0, false);
    this.input.detach();
    this.renderer.dispose();
    this.root.replaceChildren();
  }

  // -- flow -------------------------------------------------------------------------

  private setOverlay(el: HTMLElement | null): void {
    this.overlay?.remove();
    this.overlay = el;
    if (el !== null) {
      this.root.append(el);
      this.app.focusInto(el);
    }
  }

  private sheet(title: string, children: (Node | null)[]): HTMLElement {
    return h('div', { class: 'overlay', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gp-sheet-title' } }, [
      h('div', { class: 'sheet' }, [h('h2', { class: 'sheet-title', id: 'gp-sheet-title', text: title }), ...children]),
    ]);
  }

  private showBriefing(): void {
    this.hud?.root.remove();
    this.hud = null;
    const def = TRACKS[this.track];
    const settings = this.app.save.settings;
    const preset = PRESETS[settings.difficulty];
    const record = this.app.save.tracks[this.track];
    const start = button('Start', () => this.begin(), { icon: '▶' });
    start.setAttribute('data-autofocus', '');
    const cupNo = this.mode === 'cup' ? this.app.save.cup.raced + 1 : 0;
    this.setOverlay(
      this.sheet(def.name, [
        h('div', { class: 'chips' }, [
          h('span', { class: 'chip on', text: this.mode === 'cup' ? `Cup race ${cupNo} of 3` : 'Time Trial' }),
          h('span', { class: 'chip', text: `${LAPS} laps · ${'★'.repeat(def.rating)}` }),
        ]),
        h('p', { class: 'lead', text: def.blurb }),
        h('p', { class: 'muted', text: def.place }),
        this.mode === 'cup'
          ? h('div', { class: 'card soft' }, [
              h('h3', { text: `You start ${ordinal(preset.gridSlot)} of 6` }),
              h('p', { class: 'small-text', text: 'Bends push you outward - steer into them. Grass is slow. Drive close behind a rival to draft. Turbo cells charge the BOOST button; blue chevrons boost you for free.' }),
              settings.items
                ? h('p', { class: 'small-text', text: 'Items are on: drive through a ? gift box, then tap ITEM (or X). Boosts and shields help you; oil, coconuts, sipa balls and red lights spin or slow the rivals - and they can do it to you. The mini map (top right) shows where everyone is.' })
                : h('p', { class: 'small-text', text: 'Items are off (Settings). The mini map (top right) shows where everyone is.' }),
              rivalList(),
            ])
          : h('div', { class: 'card soft' }, [
              h('p', { text: record?.bestTotal ? `Your best: ${formatTime(record.bestTotal)} (lap ${formatTime(record.bestLap ?? 0)}). The see-through Navie is your best run.` : 'First run on this track: set a time, and next time your ghost races you.' }),
            ]),
        h('div', { class: 'card soft row-title' }, [
          h('div', {}, [h('h3', { text: `Difficulty: ${preset.label}` }), h('p', { class: 'muted small-text', text: `${settings.autoSteer ? 'Auto-steer ON' : 'Auto-steer off'} · ${settings.showLine ? 'fast line shown' : 'fast line hidden'}` })]),
          button('Change', () => this.app.openSettings(() => this.app.startRace(this.mode, this.track)), { variant: 'ghost', class: 'small' }),
        ]),
        h('p', { class: 'muted small-text', text: settings.steering === 'drag' ? 'Steer: drag in the pad under your car (or ← →). Boost: the BOOST button (or Space). Pause: Esc.' : 'Steer: tap ‹ › to change racing line (or ← →). Boost: the BOOST button (or Space). Pause: Esc.' }),
        h('div', { class: 'actions' }, [start, button('Back', () => { if (this.flow.send('quit') !== null) { this.app.goMenu(); } }, { variant: 'secondary' })]),
      ]),
    );
  }

  private begin(): void {
    if (this.flow.send('start') === null) {
      return;
    }
    this.app.audio.unlock();
    this.runId = newRunId(this.seed);
    this.sim = this.makeSim();
    this.accumulator = 0;
    this.outcome = null;
    this.setOverlay(null);
    const settings = this.app.save.settings;
    const hud = new RaceHud(this.mode, settings.steering, settings.boostSide, () => this.pause());
    this.hud = hud;
    this.root.prepend(hud.root);
    this.input.configure(settings.steering, settings.sensitivity);
    this.input.reset();
    this.input.attach({ pad: hud.pad, left: hud.left, right: hud.right, boost: hud.boost, item: hud.item });
    this.reserve();
    this.app.audio.playMusic(true);
    this.startLights();
  }

  private startLights(): void {
    this.countdown = 3.4;
    this.hud?.setLights(0);
  }

  private tickCountdown(dt: number): void {
    const before = this.countdown;
    this.countdown -= dt;
    // 3.4 -> 2.6 get ready, then one red lamp per 0.8 s, then green.
    const lamps = this.countdown > 2.6 ? 0 : this.countdown > 1.8 ? 1 : this.countdown > 1.0 ? 2 : this.countdown > 0.2 ? 3 : 'go';
    const lampsBefore = before > 2.6 ? 0 : before > 1.8 ? 1 : before > 1.0 ? 2 : before > 0.2 ? 3 : 'go';
    if (lamps !== lampsBefore) {
      this.app.audio.sfx(lamps === 'go' ? 'go' : 'count');
      if (lamps === 'go') {
        announce('Go!');
      }
    }
    this.hud?.setLights(lamps);
    if (this.countdown <= 0) {
      this.flow.send('go');
      this.input.setEnabled(true);
      setTimeout(() => this.hud?.setLights(''), 600);
    }
  }

  private stepRace(dt: number, coasting: boolean): void {
    this.accumulator += dt * this.app.save.settings.gameSpeed;
    let steps = 0;
    while (this.accumulator >= STEP && steps < 8) {
      const input = coasting ? NO_RACE_INPUT : this.app.autoplay ? this.bot(this.sim) : this.input.poll();
      this.sim.step(STEP, input);
      this.accumulator -= STEP;
      steps += 1;
    }
    if (steps >= 8) {
      this.accumulator = 0;
    }
    this.handle(this.sim.drainEvents());
  }

  private ghostDelta(): number | null {
    const s = this.sim.state;
    if (this.mode !== 'trial' || s.ghostCar === null || this.sim.player.speed < 1) {
      return null;
    }
    return (s.ghostCar.distance - this.sim.player.distance) / Math.max(5, this.sim.player.speed);
  }

  private handle(events: RaceEvent[]): void {
    const audio = this.app.audio;
    for (const e of events) {
      switch (e.type) {
        case 'lap':
          audio.sfx('lap');
          this.hud?.toast(`Lap ${e.lap + 1}${e.best ? ' · best lap!' : ''}`);
          announce(`Lap ${e.lap + 1} of ${LAPS}. Last lap ${formatTime(e.time)}.`);
          break;
        case 'finalLap':
          audio.sfx('finalLap');
          this.hud?.toast('Final lap!');
          break;
        case 'bump':
          audio.sfx('bump');
          this.renderer.kick(5);
          break;
        case 'wall':
          audio.sfx('wall');
          this.renderer.kick(7);
          break;
        case 'grass':
          this.hud?.toast('Grass is slow - back to the track!');
          break;
        case 'pad':
          audio.sfx('pad');
          break;
        case 'turbo':
          audio.sfx('turbo');
          this.hud?.toast('Turbo +1');
          break;
        case 'bolt':
          audio.sfx('bolt');
          break;
        case 'boost':
          audio.sfx('boost');
          break;
        case 'boostEmpty':
          audio.sfx('deny');
          this.hud?.toast('No turbo - grab a turbo cell or draft');
          break;
        case 'place':
          if (e.gained) {
            audio.sfx('up');
          }
          announce(`Now ${ordinal(e.place)}`);
          break;
        case 'itemGet':
          if (e.who === 'navie') {
            audio.sfx('box');
            setTimeout(() => {
              if (!this.disposed) {
                audio.sfx('roll');
              }
            }, 850);
            announce(`Item: ${ITEM_DEFS[e.item].name}. ${ITEM_DEFS[e.item].text}`);
          }
          break;
        case 'itemUse':
          if (e.who === 'navie') {
            audio.sfx(e.item === 'turbo' ? 'boost' : 'itemUse');
          }
          break;
        case 'spun':
          if (e.who === 'navie') {
            audio.sfx('spin');
            this.renderer.kick(8);
            this.hud?.toast(`Spun out by ${e.by === 'navie' ? 'your own' : carName(e.by) + "'s"} ${ITEM_DEFS[e.cause].name}!`);
          } else if (e.by === 'navie') {
            audio.sfx('up');
            this.hud?.toast(`Hit ${carName(e.who)}!`);
          }
          break;
        case 'blocked':
          if (e.who === 'navie') {
            audio.sfx('shieldBlock');
            this.hud?.toast('Bubble Shield blocked it!');
          }
          break;
        case 'incoming':
          audio.sfx('incoming');
          this.hud?.warn(`Sipa Ball from ${carName(e.by)}!`);
          announce(`Warning: a sipa ball from ${carName(e.by)} is coming.`);
          break;
        case 'redLight':
          if (e.by === 'navie') {
            this.hud?.toast('Red light! Everyone ahead slows down');
          } else if (e.navieSlowed) {
            audio.sfx('deny');
            this.hud?.toast(`Red light from ${carName(e.by)} - slowed!`);
          }
          break;
        case 'finish':
          audio.sfx('finish');
          this.input.setEnabled(false);
          if (this.flow.send('finish') !== null) {
            this.endT = 2;
            this.hud?.toast(this.mode === 'cup' ? `Finished ${ordinal(e.place)}!` : 'Finished!');
          }
          break;
      }
    }
  }

  pause(): void {
    const state = this.flow.state;
    if ((state !== 'racing' && state !== 'countdown') || this.flow.send('pause') === null) {
      return;
    }
    this.input.setEnabled(false);
    this.hud?.setLights('');
    this.app.audio.setEngine(0, false);
    const resume = button('Resume', () => {
      if (this.flow.send('resume') !== null) {
        this.setOverlay(null);
        this.input.reset();
        this.startLights();
      }
    }, { icon: '▶' });
    resume.setAttribute('data-autofocus', '');
    const settingsHolder = h('div', {});
    this.setOverlay(
      this.sheet('Paused', [
        h('div', { class: 'actions' }, [
          resume,
          button('Restart', () => { if (this.flow.send('restart') !== null) { this.seed = newSeed(); this.sim = this.makeSim(); this.showBriefing(); } }, { variant: 'secondary' }),
          button('Quit to menu', () => { if (this.flow.send('quit') !== null) { this.app.goMenu(); } }, { variant: 'ghost' }),
        ]),
        h('p', { class: 'muted small-text', text: this.mode === 'cup' ? 'Quitting gives up this race (no points). The cup waits for you.' : 'Quitting keeps your old best time.' }),
        button('Settings', () => settingsHolder.replaceChildren(gpSettingsPanel(this.app, { inRace: true, onChange: () => this.rebuildControls() })), { variant: 'ghost', class: 'small' }),
        settingsHolder,
      ]),
    );
  }

  /** Steering mode or boost side changed in the pause menu. */
  private rebuildControls(): void {
    if (this.hud === null) {
      return;
    }
    const s = this.app.save.settings;
    this.hud.root.remove();
    this.input.detach();
    const hud = new RaceHud(this.mode, s.steering, s.boostSide, () => this.pause());
    this.hud = hud;
    this.root.prepend(hud.root);
    this.input.configure(s.steering, s.sensitivity);
    this.input.attach({ pad: hud.pad, left: hud.left, right: hud.right, boost: hud.boost, item: hud.item });
    this.reserve();
  }

  hostPause(): void {
    this.pause();
  }

  // -- results ---------------------------------------------------------------------

  private showResults(): void {
    const result = this.sim.result(this.runId);
    this.flow.commitOnce(() => {
      this.outcome = this.app.commitRace(result);
    });
    this.hud?.root.remove();
    this.hud = null;
    this.input.detach();
    this.app.audio.playMusic(false);
    const out = this.outcome!;
    const payout = out.payout;
    const s = this.sim.state;
    const save = this.app.save;
    const title = this.mode === 'cup' ? `${ordinal(result.place)} place!` : `Time ${formatTime(result.totalTime)}`;
    const cont = button(
      this.mode === 'cup' ? (out.cupFinished ? 'Cup results' : `Next: ${TRACKS[nextCupTrack(save)].name}`) : 'Back to menu',
      () => {
        if (this.flow.send('leave') === null) {
          return;
        }
        if (this.mode === 'cup' && !out.cupFinished) {
          this.app.startRace('cup', nextCupTrack(this.app.save));
        } else {
          this.app.goMenu();
        }
      },
    );
    cont.setAttribute('data-autofocus', '');
    if (out.cupFinished && out.cupRank !== null && out.cupRank <= 3) {
      this.app.audio.sfx('trophy');
    }
    const table =
      this.mode === 'cup'
        ? h('div', { class: 'card soft' }, [
            h('h3', { text: out.cupFinished ? 'Final cup standings' : `Cup standings after race ${save.cup.raced}` }),
            h('ol', { class: 'standings' }, standings(save).map(([id, pts]) => h('li', { class: id === 'navie' ? 'me' : '' }, [h('span', { text: carName(id) }), h('strong', { text: `${pts} pts` })]))),
          ])
        : null;
    this.setOverlay(
      this.sheet(title, [
        h('div', { class: 'results-hero' }, [
          h('img', { class: 'results-face', attrs: { src: portrait('navie', 96, result.place <= 3 ? 'happy' : 'idle'), alt: '' } }),
          h('div', {}, [
            h('p', { class: 'lead', text: this.mode === 'cup' ? `${TRACKS[this.track].name}` : TRACKS[this.track].name }),
            h('p', { class: 'muted', text: `Total ${formatTime(result.totalTime)} · best lap ${formatTime(result.bestLap)}` }),
            ...payout.notes.map((n) => h('p', { class: 'trophy-note', text: n })),
          ]),
        ]),
        h('div', { class: 'card soft' }, [
          h('h3', { text: 'Bolts earned' }),
          h('table', { class: 'payout' }, payout.lines.map((l) => h('tr', {}, [h('th', { attrs: { scope: 'row' } }, [l.label, h('span', { class: 'note', text: l.note })]), h('td', { text: `+${l.amount}` })]))),
          h('div', { class: 'total' }, [h('span', { text: `Total +${payout.total} Bolts` })]),
        ]),
        table,
        h('p', { class: 'muted small-text', text: `Laps: ${s.lapTimes.map((t) => formatTime(t)).join(' · ')}. Each race is paid once.` }),
        h('div', { class: 'actions' }, [
          cont,
          button(this.mode === 'cup' ? 'Practise this track' : 'Race again', () => {
            if (this.mode === 'cup') {
              // A cup race is not re-run inside the cup; "again" starts this track as a time trial.
              if (this.flow.send('leave') !== null) {
                this.app.startRace('trial', this.track);
              }
              return;
            }
            if (this.flow.send('again') !== null) {
              this.seed = newSeed();
              this.sim = this.makeSim();
              this.showBriefing();
            }
          }, { variant: 'secondary', ariaLabel: this.mode === 'cup' ? 'Practise this track in a time trial' : 'Race again' }),
        ]),
      ]),
    );
  }

  // -- development hooks -------------------------------------------------------------

  debugBegin(): void {
    this.begin();
    this.countdown = 0.01;
  }

  debugAdvance(seconds: number): void {
    const end = this.sim.state.time + seconds;
    while (this.sim.state.time < end && this.flow.state === 'racing') {
      this.sim.step(STEP, this.app.autoplay ? this.bot(this.sim) : NO_RACE_INPUT);
      this.handle(this.sim.drainEvents());
    }
  }

  get debugState(): { flow: string; sim: RaceSim } {
    return { flow: this.flow.state, sim: this.sim };
  }
}
