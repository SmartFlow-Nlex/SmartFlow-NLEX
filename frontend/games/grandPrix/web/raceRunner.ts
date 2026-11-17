import { portraitEl } from '../../roadTrip/web/art/clay';
import { announce, button, h } from '../../roadTrip/web/ui/dom';
import { createRaceBot } from '../core/bot';
import { LAPS, MAX_FRAME, PRESETS, STEP } from '../core/config';
import { createFlow, type Flow } from '../core/flow';
import { ITEM_DEFS } from '../core/items';
import { formatTime, nextCupTrack, ordinal, standings, type CommitOutcome } from '../core/progression';
import { NO_RACE_INPUT, RIVALS, RaceSim, type RaceEvent } from '../core/race';
import { newRunId, newSeed } from '../core/rng';
import { TRACKS, curveAt } from '../core/tracks';
import type { RaceMode, SteeringMode, TrackId } from '../core/types';
import type { GpApi, Scene } from './appApi';
import { RaceInputController, requestTilt } from './input';
import { RaceRenderer } from './render/raceRenderer';
import { gpIcon } from './ui/gpIcons';
import { gpSettingsPanel } from './ui/gpSettings';
import { carName, rivalList } from './ui/gpScreens';
import { RaceHud, trackPreview } from './ui/raceHud';

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
  /** The steering used this race: the setting, unless tilt turned out to be unavailable. */
  private steeringNow: SteeringMode = 'wheel';
  private tiltFailed = false;

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
      onTiltUnavailable: () => {
        /* No tilt from this phone (or no permission): steer with the wheel for the rest of the race. */
        this.tiltFailed = true;
        this.rebuildControls();
        this.hud?.toast('No tilt here - use the wheel');
      },
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
      steerAssist: save.settings.steerAssist,
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
    /* Tyres scrub softly in hard bends at speed. */
    const p = this.sim.player;
    this.app.audio.setTyres(racing ? Math.abs(curveAt(s.track, p.distance, s.length)) * (p.speed / 28) ** 2 * 1.4 : 0);
    this.renderer.setIntro(state === 'countdown' && this.countdown > 0 && !settings.reduceMotion ? Math.min(1, this.countdown / 3.4) : 0);
    this.hud?.update(s, this.ghostDelta(), state === 'paused' ? 0 : dt);
    if (state !== 'racing' || this.app.autoplay) {
      this.input.settle(dt);
    }
    this.hud?.steer(this.input.wheelAngle, state === 'racing' && this.input.gripped, this.input.steerValue);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.app.audio.setEngine(0, false);
    this.app.audio.setTyres(0);
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
    const start = button('Start', () => this.begin(), { icon: '▶', class: 'big' });
    start.setAttribute('data-autofocus', '');
    const cupNo = this.mode === 'cup' ? this.app.save.cup.raced + 1 : 0;
    /* The rules live behind a fold, one short line each; the card itself is pictures and chips. */
    const how = h('details', { class: 'how-to' }, [
      h('summary', {}, [gpIcon('info', 'gp-ico'), h('span', { text: 'How to race' })]),
      h('ul', { class: 'how-list' }, [
        h('li', { text: 'Steer into bends. Grass is slow.' }),
        h('li', { text: 'Turbo cells fill BOOST. Blue arrows boost for free.' }),
        h('li', { text: 'Stay close behind a car to draft.' }),
        this.mode === 'cup'
          ? h('li', { text: settings.items ? 'Drive through ? boxes, then tap ITEM.' : 'Items are off.' })
          : h('li', { text: record?.bestTotal ? 'The see-through Navie is your best run.' : 'Your best run comes back as a ghost.' }),
      ]),
      this.mode === 'cup' ? rivalList() : null,
    ]);
    const facts = h('div', { class: 'brief-facts' }, [
      h('p', { class: 'brief-place', text: `📍 ${def.place}` }),
      h('div', { class: 'chips' }, [
        h('span', { class: 'chip on', text: this.mode === 'cup' ? `Race ${cupNo}/3` : 'Time Trial' }),
        h('span', { class: 'chip', text: `${LAPS} laps` }),
        h('span', { class: 'chip stars', text: '★'.repeat(def.rating) + '☆'.repeat(3 - def.rating), attrs: { 'aria-label': `Difficulty ${def.rating} of 3` } }),
        this.mode === 'cup' ? h('span', { class: 'chip next', text: `Start ${ordinal(preset.gridSlot)}` }) : null,
      ]),
      h('p', { class: 'lead brief-blurb', text: def.blurb }),
      this.mode === 'trial' && record?.bestTotal ? h('p', { class: 'brief-best', text: `Best ${formatTime(record.bestTotal)}` }) : null,
    ]);
    const steerText: Record<SteeringMode, string> = { wheel: 'Rotate to steer', buttons: 'Hold ◀ ▶ to steer', tilt: 'Tilt to steer', lanes: 'Tap ◀ ▶ to change lane' };
    this.setOverlay(
      this.sheet(def.name, [
        h('div', { class: `brief-card ${def.time}` }, [trackPreview(def), facts]),
        h('div', { class: 'brief-steer' }, [
          gpIcon('wheel', 'gp-ico big'),
          h('div', { class: 'brief-steer-text' }, [h('strong', { text: steerText[settings.steering] }), h('span', { class: 'muted small-text', text: `${preset.label}${settings.steerAssist ? ' · Assist on' : ''}` })]),
          button('Change', () => this.app.openSettings(() => this.app.startRace(this.mode, this.track)), { variant: 'ghost', class: 'small' }),
        ]),
        how,
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
    this.tiltFailed = false;
    this.steeringNow = settings.steering;
    if (settings.steering === 'tilt') {
      /* The Start tap is the gesture an iPhone needs before it shares the tilt. */
      void requestTilt();
    }
    this.mountControls();
    this.input.reset();
    /* Draw every rival, pick-up and prop once now, behind the lights, so nothing stalls mid-race. */
    this.renderer.prewarm(this.sim.state);
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
      this.renderer.hop();
      setTimeout(() => this.hud?.setLights(''), 600);
      setTimeout(() => this.hud?.hideHint(), 6000);
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
          this.hud?.toast(e.best ? `Lap ${e.lap + 1} · Best lap!` : `Lap ${e.lap + 1}`);
          announce(`Lap ${e.lap + 1} of ${LAPS}. Last lap ${formatTime(e.time)}.`);
          break;
        case 'finalLap':
          audio.sfx('finalLap');
          this.hud?.showBanner('FINAL LAP!', 'final');
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
          this.hud?.toast('Grass is slow!');
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
          this.hud?.toast('No turbo yet');
          break;
        case 'place':
          if (e.gained) {
            audio.sfx(e.place === 1 ? 'first' : 'up');
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
            this.hud?.toast('Spun out!');
            announce(`Spun out by ${e.by === 'navie' ? 'your own' : carName(e.by) + "'s"} ${ITEM_DEFS[e.cause].name}.`);
          } else if (e.by === 'navie') {
            audio.sfx('up');
            this.hud?.toast(`Hit ${carName(e.who)}!`);
          }
          break;
        case 'blocked':
          if (e.who === 'navie') {
            audio.sfx('shieldBlock');
            this.hud?.toast('Blocked!');
          }
          break;
        case 'incoming':
          audio.sfx('incoming');
          this.hud?.warn('Sipa Ball incoming!');
          announce(`Warning: a sipa ball from ${carName(e.by)} is coming.`);
          break;
        case 'redLight':
          if (e.by === 'navie') {
            this.hud?.toast('Red light!');
          } else if (e.navieSlowed) {
            audio.sfx('deny');
            this.hud?.toast('Red light - slowed!');
          }
          break;
        case 'finish':
          audio.sfx('finish');
          this.input.setEnabled(false);
          if (this.flow.send('finish') !== null) {
            this.endT = 2.6;
            /* A big banner, confetti over the line, and Navie hops for joy on a podium. */
            this.hud?.showBanner(this.mode === 'cup' ? `${ordinal(e.place)}!` : 'FINISH!', this.mode === 'cup' && e.place === 1 ? 'first' : 'finish');
            this.renderer.celebrate(this.mode === 'trial' || e.place <= 3, this.app.save.settings.reduceMotion);
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
    this.app.audio.setTyres(0);
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
        h('p', { class: 'muted small-text', text: this.mode === 'cup' ? 'Quit = no points this race.' : 'Your best time is kept.' }),
        button('Settings', () => settingsHolder.replaceChildren(gpSettingsPanel(this.app, { inRace: true, onChange: () => this.rebuildControls() })), { variant: 'ghost', class: 'small' }),
        settingsHolder,
      ]),
    );
  }

  /** Builds the HUD and controls for the steering in use, and wires the input to them. */
  private mountControls(): void {
    const s = this.app.save.settings;
    this.hud?.root.remove();
    this.input.detach();
    const hud = new RaceHud(this.mode, this.steeringNow, s.boostSide, () => this.pause());
    this.hud = hud;
    this.root.prepend(hud.root);
    this.input.configure(this.steeringNow, s.sensitivity, s.steerFeel, s.steerAssist, s.tiltZero);
    this.input.attach({ wheelZone: hud.wheelZone, wheel: hud.wheel, left: hud.left, right: hud.right, boost: hud.boost, item: hud.item });
    this.reserve();
  }

  /** Steering mode, feel or boost side changed in the pause menu (or tilt fell back to touch). */
  private rebuildControls(): void {
    if (this.hud === null) {
      return;
    }
    const chosen = this.app.save.settings.steering;
    this.steeringNow = chosen === 'tilt' && this.tiltFailed ? 'wheel' : chosen;
    const enabled = this.flow.state === 'racing';
    this.mountControls();
    this.input.setEnabled(enabled);
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
    const save = this.app.save;
    const title = this.mode === 'cup' ? (result.place === 1 ? 'You win!' : result.place <= 3 ? 'Podium!' : 'Finished!') : 'Time Trial';
    const cont = button(
      this.mode === 'cup' ? (out.cupFinished ? 'Cup results' : `Next: ${TRACKS[nextCupTrack(save)].name}`) : 'Menu',
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
    const colourOf = (id: string): string => (id === 'navie' ? '#3A8CF4' : RIVALS.find((r) => String(r.number) === id)?.colour ?? '#9aa6b6');
    const table =
      this.mode === 'cup'
        ? h('div', { class: 'card soft' }, [
            h('h3', { text: out.cupFinished ? 'Final standings' : `Standings · ${save.cup.raced}/3` }),
            h(
              'ol',
              { class: 'standings' },
              standings(save).map(([id, pts], i) =>
                h('li', { class: id === 'navie' ? 'me' : '' }, [
                  h('span', { class: 'st-rank', text: String(i + 1) }),
                  id === 'navie' ? portraitEl('st-face', 'navie', 28, 'character', { expr: 'happy', crop: true }) : h('span', { class: 'st-swatch', attrs: { style: `background:${colourOf(id)}` } }),
                  h('span', { class: 'st-name', text: carName(id) }),
                  h('strong', { text: `${pts} pts` }),
                ]),
              ),
            ),
          ])
        : null;
    /* The total counts up for show; it settles on exactly the amount paid. */
    const totalEl = h('span', { text: `+${payout.total}` });
    if (!this.app.save.settings.reduceMotion && payout.total > 0) {
      let t0 = -1;
      const tick = (now: number): void => {
        if (t0 < 0) {
          t0 = now + 300;
        }
        const k = Math.min(1, Math.max(0, (now - t0) / 800));
        totalEl.textContent = `+${k >= 1 ? payout.total : Math.round(payout.total * (1 - (1 - k) ** 3))}`;
        if (k < 1 && !this.disposed) {
          requestAnimationFrame(tick);
        }
      };
      totalEl.textContent = '+0';
      requestAnimationFrame(tick);
    }
    const rank = this.mode === 'cup' ? result.place : 0;
    const badge = h('div', { class: 'result-pos', attrs: { 'data-rank': rank >= 1 && rank <= 3 ? String(rank) : 'n' } }, this.mode === 'cup'
      ? [h('span', { class: 'rp-num', text: String(result.place) }), h('span', { class: 'rp-suf', text: ordinal(result.place).replace(/^\d+/, '') })]
      : [h('span', { class: 'rp-word', text: 'TIME' })]);
    this.setOverlay(
      this.sheet(title, [
        h('div', { class: `results-hero${result.place <= 3 || this.mode === 'trial' ? ' happy' : ''}` }, [
          badge,
          portraitEl('results-face', 'navie', 96, 'character', { expr: result.place <= 3 || this.mode === 'trial' ? 'celebrate' : 'happy' }),
          h('div', { class: 'results-text' }, [
            h('p', { class: 'lead', text: TRACKS[this.track].name }),
            h('p', { class: 'result-time', text: formatTime(result.totalTime) }),
            h('p', { class: 'muted small-text', text: `Best lap ${formatTime(result.bestLap)}` }),
            ...payout.notes.map((n) => h('p', { class: 'trophy-note', text: n })),
          ]),
        ]),
        h('div', { class: 'card soft bolts-card' }, [
          h('div', { class: 'bolts-total' }, [gpIcon('bolt', 'gp-ico big'), totalEl, h('span', { class: 'bolts-word', text: 'Bolts' })]),
          h('ul', { class: 'bolts-lines' }, payout.lines.map((l) => h('li', {}, [h('span', { text: l.label }), h('strong', { text: `+${l.amount}` })]))),
        ]),
        table,
        h('div', { class: 'actions' }, [
          cont,
          button(this.mode === 'cup' ? 'Practice' : 'Race again', () => {
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
