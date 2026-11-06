import { botAct, newBotMemory, type BotSkill } from '../core/bot';
import { perkById, type PerkId } from '../core/perks';
import { budgetGone, perkOffers, pickPerk, unmanagedAt, type ShiftRun } from '../core/shift';
import {
  accepts,
  boothLook,
  canRedirect,
  clearBlock,
  ENGINES_S,
  enginesOff,
  findVehicle,
  inWrongLane,
  isDraining,
  laneWait,
  redirectLane,
  redirectVehicle,
  RELIEF_MINUTES,
  repairBooth,
  staffInUse,
  STAFFING_S,
  step,
  STEP_S,
  toggleLane,
  type RedirectResult,
  type Lane,
  type Sim,
  type Vehicle,
} from '../core/sim';
import type { GameAudio } from './audio';
import { coachDue, type CoachAction, type CoachMoment } from './coach';
import { button, h, icon, ICONS, setText } from './dom';
import { artUrl, CONGESTED_MINUTES, Stage, type Pictures, type StageUi, type SwipeView } from './stage';

/**
 * One shift being played: the top bar, the plaza, the booth chips, the touches and
 * the clock that steps the rules. Ends by calling back with done or smog.
 */

export interface RushHost {
  audio: GameAudio;
  pictures: Pictures;
  reduceMotion: () => boolean;
  gameSpeed: () => number;
  coachSeen: () => readonly string[];
  markCoachSeen: (ids: readonly string[]) => void;
  soundOn: () => boolean;
  setSound: (on: boolean) => void;
  onDone: (sim: Sim) => void;
  onSmog: (sim: Sim) => void;
  onRestart: () => void;
  onQuit: () => void;
  debug: boolean;
}

const DRAIN_SPEED = 2.6;
const SWIPE_START_PX = 9;
/** A short flick still counts as one lane over. */
const FLICK_PX = 18;
const PERK_SECONDS = 7;
/** Share of the budget where the air turns from Clean to Warning. */
const WARNING_AT = 0.6;

type Mood = 'idle' | 'happy' | 'worried' | 'excited' | 'alert';

const timerText = (seconds: number): string => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

interface LaneChip {
  el: HTMLButtonElement;
  dot: HTMLElement;
  main: HTMLElement;
  sub: HTMLElement;
  fill: HTMLElement;
  lastClass: string;
}

interface Press {
  pointerId: number;
  lane: number;
  fromS: number;
  vehicleId: number | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  swiping: boolean;
}

export class RushRunner {
  readonly el: HTMLElement;
  readonly sim: Sim;
  private readonly stage: Stage;
  private readonly canvas: HTMLCanvasElement;
  private readonly stageBox: HTMLElement;
  private readonly laneBar: HTMLElement;
  private readonly chips: LaneChip[] = [];
  private readonly timerEl: HTMLElement;
  private readonly waveEl: HTMLElement;
  private readonly pips: HTMLElement[] = [];
  private readonly barEl: HTMLElement;
  private readonly barFill: HTMLElement;
  private readonly barMark: HTMLElement;
  private readonly usedEl: HTMLElement;
  private readonly noManagerEl: HTMLElement;
  private readonly limitEl: HTMLElement;
  private readonly airEl: HTMLElement;
  private readonly smogBuddy: HTMLElement;
  private readonly staffEl: HTMLElement;
  private readonly enginesBtn: HTMLButtonElement;
  private readonly enginesText: HTMLElement;
  private readonly enginesFill: HTMLElement;
  private readonly navieImg: HTMLImageElement;
  private readonly navieText: HTMLElement;
  private readonly perkStrip: HTMLElement;
  private readonly navieRow: HTMLElement;
  private readonly liveEl: HTMLElement;
  private readonly coachEl: HTMLElement;
  private readonly coachText: HTMLElement;
  private readonly coachOk: HTMLButtonElement;
  private readonly bannerEl: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerNote: HTMLElement;
  private readonly finalEl: HTMLElement;
  private readonly introEl: HTMLElement;
  private readonly pauseEl: HTMLElement;
  private readonly soundBtn: HTMLButtonElement;

  private raf = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private paused = false;
  private disposed = false;
  private ended = false;
  private intro = 1.5;
  private press: Press | null = null;
  private selected: number | null = null;
  private coach: CoachMoment | null = null;
  private coachPending: string[] = [];
  private coachFresh: string[] = [];
  private milestones = [0.5, 0.75, 0.9];
  private lastStaffText = '';
  private lastFinal = -1;
  private mood: Mood = 'idle';
  private sayLeft = 0;
  private hintIn = 1;
  private rateSmooth = 0;
  private perkLeft = 0;
  private perkWave = -1;
  private resizeObserver: ResizeObserver | null = null;
  private readonly cleanups: (() => void)[] = [];
  /** Development only (see app.ts): a bot at the controls and a faster clock. */
  autopilot: BotSkill | null = null;
  private readonly autoMemory = newBotMemory();
  timeScale = 1;

  constructor(
    private readonly host: RushHost,
    private readonly run: ShiftRun,
    sim: Sim,
  ) {
    this.sim = sim;
    const def = run.def;

    this.timerEl = h('div', { class: 'hud-timer', text: timerText(sim.duration) });
    this.waveEl = h('div', { class: 'hud-wave' });
    const pipRow = h('div', { class: 'hud-pips' });
    def.waves.forEach(() => {
      const pip = h('span', { class: 'pip' });
      this.pips.push(pip);
      pipRow.append(pip);
    });
    this.barFill = h('div', { class: 'bar-fill' });
    this.barMark = h('div', { class: 'bar-mark' });
    this.barEl = h('div', { class: 'bar', attrs: { role: 'img', 'aria-label': 'CO2 budget used' } }, this.barFill, this.barMark);
    this.usedEl = h('span', { class: 'cap-you' });
    this.noManagerEl = h('span', { class: 'cap-none' });
    this.limitEl = h('span', { class: 'cap-limit' });
    this.airEl = h('span', { class: 'air-pill clean', text: 'Clean Air' });
    this.smogBuddy = h('div', { class: 'smog-buddy', html: SMOG_BUDDY, attrs: { 'aria-hidden': 'true' } });

    const hud = h(
      'div',
      { class: 'hud' },
      h(
        'div',
        { class: 'hud-row' },
        h('button', { class: 'hud-pause', label: 'Pause', attrs: { type: 'button' }, html: ICONS.pause, onClick: () => this.pause() }),
        h('div', { class: 'hud-where' }, h('div', { class: 'hud-plaza', text: def.plaza }), h('div', { class: 'hud-wave-row' }, pipRow, this.waveEl)),
        this.timerEl,
      ),
      h('div', { class: 'meter-row' }, this.airEl, h('div', { class: 'bar-wrap' }, this.barEl, this.smogBuddy)),
      h('div', { class: 'bar-caption' }, this.usedEl, this.noManagerEl, this.limitEl),
    );

    this.canvas = h('canvas', { class: 'stage-canvas', label: 'The toll plaza. Swipe approaching vehicles to another lane; tap a booth to open or close it; tap warning icons to help.' });
    this.liveEl = h('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });

    this.coachText = h('div', { class: 'coach-text' });
    this.coachOk = button('Got it', () => this.coachAction('ok'), { class: 'small coach-ok hidden' });
    this.coachEl = h(
      'div',
      { class: 'coach hidden' },
      h('img', { class: 'navie-head big', attrs: { src: artUrl('happy'), alt: '' } }),
      h(
        'div',
        { class: 'coach-body' },
        this.coachText,
        h('div', { class: 'coach-actions' }, h('button', { class: 'coach-skip', text: 'Skip tips', attrs: { type: 'button' }, onClick: () => this.skipCoach() }), this.coachOk),
      ),
    );

    this.bannerTitle = h('div', { class: 'banner-title' });
    this.bannerNote = h('div', { class: 'banner-note' });
    this.bannerEl = h('div', { class: 'wave-banner hidden', attrs: { 'aria-hidden': 'true' } }, this.bannerTitle, this.bannerNote);
    this.finalEl = h('div', { class: 'final-count hidden', attrs: { 'aria-hidden': 'true' } });

    this.introEl = h(
      'div',
      { class: 'intro' },
      h('div', { class: 'intro-small', text: def.title }),
      h('div', { class: 'intro-big', text: def.plaza }),
      h('div', { class: 'intro-clock', text: 'Get ready!' }),
    );

    this.soundBtn = button('', () => this.toggleSound(), { class: 'secondary' });
    this.pauseEl = h(
      'div',
      { class: 'overlay hidden' },
      h(
        'div',
        { class: 'card pause-card' },
        h('h2', { text: 'Paused' }),
        h('p', { class: 'muted', text: `${def.plaza}, ${def.title}` }),
        button('Keep going', () => this.resume(), { iconName: 'play' }),
        this.soundBtn,
        button('Restart the shift', () => this.host.onRestart(), { class: 'secondary', iconName: 'retry' }),
        button('Leave the shift', () => this.host.onQuit(), { class: 'secondary', iconName: 'back' }),
      ),
    );

    this.stageBox = h('div', { class: 'stage' }, this.canvas, this.bannerEl, this.finalEl, this.coachEl, this.introEl, this.liveEl);
    this.laneBar = h('div', { class: 'lane-bar' });

    this.navieImg = h('img', { class: 'navie-mood', attrs: { src: artUrl('happy'), alt: '' } });
    this.navieText = h('div', { class: 'navie-text' });
    this.staffEl = h('div', { class: 'staff' });
    this.navieRow = h('div', { class: 'navie-row' }, this.navieImg, this.navieText);
    this.perkStrip = h('div', { class: 'perk-strip hidden' });
    this.enginesFill = h('span', { class: 'engines-fill' });
    this.enginesText = h('span', { class: 'engines-text' });
    this.enginesBtn = h('button', { class: 'engines', label: 'Engines Off', attrs: { type: 'button' }, onClick: () => this.useEngines() }, this.enginesFill, icon('leaf'), this.enginesText);
    if (def.engines === 0) {
      this.enginesBtn.classList.add('hidden');
    }
    const actions = h('div', { class: 'action-bar' }, this.navieRow, this.perkStrip, this.staffEl, this.enginesBtn);

    this.el = h('div', { class: 'screen game' }, hud, this.stageBox, this.laneBar, actions, this.pauseEl);
    this.stage = new Stage(this.canvas, host.pictures, host.reduceMotion());
    this.coachPending = def.coach.filter((id) => !host.coachSeen().includes(id));
    this.buildChips();
    this.wireTouches();
  }

  /** Call after the element is in the page, when it has a size. */
  start(): void {
    this.relayout();
    this.resizeObserver = new ResizeObserver(() => this.relayout());
    this.resizeObserver.observe(this.stageBox);
    this.host.audio.play('rush');
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private relayout(): void {
    this.stage.layout(this.sim.laneCount, this.run.def.plaza, this.sim.lanes.map((lane) => lane.type));
    this.placeChips();
  }

  private buildChips(): void {
    for (const lane of this.sim.lanes) {
      const dot = h('span', { class: 'chip-dot' });
      const main = h('span', { class: 'chip-main' });
      const sub = h('span', { class: 'chip-sub' });
      const fill = h('span', { class: 'chip-fill' });
      const el = h('button', { class: 'lane-chip', attrs: { type: 'button' }, onClick: () => this.tapLane(lane.index) }, fill, dot, main, sub);
      this.chips.push({ el, dot, main, sub, fill, lastClass: '' });
      this.laneBar.append(el);
    }
  }

  private placeChips(): void {
    const gap = this.stage.laneW < 50 ? 1 : 2;
    this.chips.forEach((chip, i) => {
      chip.el.style.left = `${this.stage.roadLeft + this.stage.laneW * i + gap}px`;
      chip.el.style.width = `${this.stage.laneW - gap * 2}px`;
    });
  }

  /* ---- Touches ---- */

  private localPoint(e: PointerEvent): { x: number; y: number } {
    const box = this.canvas.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  private wireTouches(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => {
      if (this.press !== null && this.press.pointerId === e.pointerId) {
        this.press = null;
      }
    });
    const key = (e: KeyboardEvent): void => this.onKey(e);
    window.addEventListener('keydown', key);
    this.cleanups.push(() => window.removeEventListener('keydown', key));
  }

  private onDown(e: PointerEvent): void {
    this.host.audio.unlock();
    if (this.paused || this.intro > 0 || this.ended) {
      return;
    }
    const { x, y } = this.localPoint(e);
    const broken = this.stage.faultAt(this.sim, x, y);
    if (broken !== null) {
      this.repair(broken);
      return;
    }
    const stuck = this.stage.stuckAt(this.sim, x, y);
    if (stuck !== null) {
      this.help(stuck);
      return;
    }
    const booth = this.stage.boothAt(this.sim, x, y);
    if (booth !== null) {
      this.tapLane(booth.index);
      return;
    }
    const lane = this.stage.laneAt(x);
    const under = this.stage.approachingAt(this.sim, x, y);
    /* A swipe takes the vehicle under the finger and everything behind it. */
    const fromS = under !== null ? under.s - 0.05 : this.stage.sAt(y) - 0.7;
    this.press = { pointerId: e.pointerId, lane: under?.lane ?? lane, fromS, vehicleId: under?.id ?? null, startX: x, startY: y, x, y, swiping: false };
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // The pointer has already gone.
    }
  }

  private onMove(e: PointerEvent): void {
    const press = this.press;
    if (press === null || press.pointerId !== e.pointerId) {
      return;
    }
    const { x, y } = this.localPoint(e);
    press.x = x;
    press.y = y;
    if (!press.swiping && Math.abs(x - press.startX) > SWIPE_START_PX) {
      press.swiping = true;
      this.selected = null;
    }
  }

  /** Where a swipe would send traffic: the lane under the finger, or the next one for a short flick. */
  private swipeTarget(press: Press): number {
    const under = this.stage.laneAt(press.x);
    if (under !== press.lane) {
      return under;
    }
    const dx = press.x - press.startX;
    if (Math.abs(dx) >= FLICK_PX) {
      return Math.max(0, Math.min(this.sim.laneCount - 1, press.lane + Math.sign(dx)));
    }
    return press.lane;
  }

  private onUp(e: PointerEvent): void {
    const press = this.press;
    if (press === null || press.pointerId !== e.pointerId) {
      return;
    }
    this.press = null;
    if (press.swiping) {
      this.swipe(press);
      return;
    }
    /* A tap. On an approaching vehicle: choose it. Elsewhere: send the chosen one there. */
    if (this.selected !== null) {
      this.showRedirect(redirectVehicle(this.sim, this.selected, this.stage.laneAt(press.x)), this.stage.laneAt(press.x));
      this.selected = null;
      return;
    }
    if (press.vehicleId !== null && this.sim.rules.redirect) {
      this.selected = press.vehicleId;
      this.host.audio.play('pick');
      return;
    }
    if (this.sim.rules.redirect && this.stage.queuedAt(this.sim, press.x, press.y) !== null) {
      this.say('That one is already in line. Catch them earlier!', 'worried', 2.2);
    }
  }

  private swipe(press: Press): void {
    if (!this.sim.rules.redirect) {
      this.say('Tap the booths to manage traffic here. You can redirect vehicles at the next plaza.', 'idle', 3);
      return;
    }
    if (this.coach !== null && this.coach.action !== 'swipe') {
      this.host.audio.play('deny');
      return;
    }
    const to = this.swipeTarget(press);
    if (to === press.lane) {
      return;
    }
    this.showRedirect(redirectLane(this.sim, press.lane, press.fromS, to), to);
  }

  private showRedirect(result: RedirectResult, to: number): void {
    const x = this.stage.laneCenter(to);
    const y = this.stage.boothY + (this.stage.h - this.stage.boothY) * 0.62;
    switch (result.reason) {
      case 'ok':
        this.host.audio.play('drop');
        if (result.savedMinutes >= RELIEF_MINUTES) {
          this.host.audio.play('reward');
          this.stage.sparkle(x, y, '#7df0b0');
          this.stage.float(x, y - 14, `-${Math.round(result.savedMinutes)} min idling`, '#8df0b4');
          this.say(['Nice! Traffic is flowing!', 'Great job! Less idling!', 'Good call! That line can breathe.'][this.sim.moves % 3], 'happy', 2);
        }
        this.coachDone('swipe');
        break;
      case 'compat':
        this.host.audio.play('deny');
        this.say('No-load vehicles can only pay at a ₱ lane.', 'worried', 2.4);
        break;
      case 'closed':
        this.host.audio.play('deny');
        this.say('That booth is closed. Tap it to open it first.', 'worried', 2.4);
        break;
      case 'fault':
        this.host.audio.play('deny');
        this.say('That booth is out of order right now.', 'worried', 2.4);
        break;
      case 'none':
      case 'same':
        this.host.audio.play('deny');
        this.say('Nothing to move there. Only vehicles still approaching can change lanes.', 'idle', 2.4);
        break;
      default:
        break;
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (this.paused) {
        this.resume();
      } else {
        this.pause();
      }
    } else if (e.key === 'e' || e.key === 'E') {
      this.useEngines();
    } else if (/^[1-6]$/.test(e.key)) {
      const lane = Number(e.key) - 1;
      if (lane < this.sim.laneCount) {
        this.tapLane(lane);
      }
    }
  }

  /* ---- Actions ---- */

  private blockedByCoach(action: CoachAction): boolean {
    if (this.coach !== null && this.coach.action !== action) {
      this.host.audio.play('deny');
      return true;
    }
    return false;
  }

  private tapLane(index: number): void {
    this.host.audio.unlock();
    if (this.paused || this.intro > 0 || this.ended) {
      return;
    }
    const lane = this.sim.lanes[index];
    /* A chosen vehicle goes to the lane whose chip was tapped. */
    if (this.selected !== null) {
      this.showRedirect(redirectVehicle(this.sim, this.selected, index), index);
      this.selected = null;
      return;
    }
    if (lane.fault === 'reader') {
      this.repair(lane);
      return;
    }
    if (this.coach !== null) {
      if ((this.coach.action !== 'open' && this.coach.action !== 'close') || this.coach.laneButton !== index) {
        this.host.audio.play('deny');
        return;
      }
    }
    const result = toggleLane(this.sim, index);
    switch (result) {
      case 'opened':
        this.host.audio.play('open');
        this.stage.sparkle(this.stage.laneCenter(index), this.stage.boothY, '#7df0b0');
        this.coachDone('open');
        break;
      case 'closing':
        this.host.audio.play('close');
        this.say('It will close when its line is done. Then its crew is free.', 'idle', 2.6);
        this.coachDone('close');
        break;
      case 'closed':
        this.host.audio.play('close');
        this.coachDone('close');
        break;
      case 'cancelled':
        this.host.audio.play('open');
        break;
      case 'no-staff':
        this.host.audio.play('deny');
        this.say('All your staff are busy. Close a quiet booth to free a crew.', 'worried', 2.6);
        break;
      case 'last-lane':
        this.host.audio.play('deny');
        this.say('Keep at least one booth open.', 'worried', 2.2);
        break;
      case 'only-reload':
        this.host.audio.play('deny');
        this.say('No-load drivers need a ₱ lane, so this one stays open.', 'worried', 2.6);
        break;
      case 'blocked':
        this.host.audio.play('deny');
        this.say('Something is wrong at that booth. Sort it out first.', 'worried', 2.4);
        break;
    }
  }

  private help(v: Vehicle): void {
    if (v.block === null) {
      return;
    }
    const kind = v.block;
    if (this.blockedByCoach(kind)) {
      return;
    }
    if (clearBlock(this.sim, v.id)) {
      this.coachDone(kind);
    }
  }

  private repair(lane: Lane): void {
    if (this.blockedByCoach('repair')) {
      return;
    }
    if (repairBooth(this.sim, lane.index)) {
      this.host.audio.play('repair');
      this.say('Repair crew on it!', 'happy', 2);
      this.coachDone('repair');
    }
  }

  private useEngines(): void {
    this.host.audio.unlock();
    if (this.paused || this.intro > 0 || this.ended) {
      return;
    }
    if (this.blockedByCoach('engines')) {
      return;
    }
    if (enginesOff(this.sim)) {
      this.host.audio.play('engines');
      this.say(`Engines off for ${ENGINES_S} minutes. Less idling!`, 'happy', 2.6);
      this.coachDone('engines');
    } else {
      this.host.audio.play('deny');
    }
  }

  /* ---- Navie's words ---- */

  private setMood(mood: Mood): void {
    if (mood !== this.mood) {
      this.mood = mood;
      this.navieImg.src = artUrl(mood === 'idle' ? 'happy' : mood);
    }
  }

  private say(text: string, mood: Mood = 'idle', seconds = 2.8): void {
    setText(this.navieText, text);
    setText(this.liveEl, text);
    this.setMood(mood);
    this.sayLeft = seconds;
    this.hintIn = seconds + 1.5;
  }

  /** With nothing urgent to say, Navie reads the plaza. */
  private thinkAloud(): void {
    const sim = this.sim;
    let worst: Lane | null = null;
    for (const lane of sim.lanes) {
      if (worst === null || laneWait(sim, lane) > laneWait(sim, worst)) {
        worst = lane;
      }
    }
    if (worst !== null && laneWait(sim, worst) >= CONGESTED_MINUTES - 2) {
      this.say(`Watch out! Lane ${worst.index + 1} is filling up!`, 'worried', 2.4);
      return;
    }
    if (sim.lanes.some((lane) => lane.queue.some((v) => canRedirect(v) && inWrongLane(sim, v)))) {
      this.say('A ₱ driver is in the wrong lane. Swipe it to a ₱ lane!', 'alert', 2.4);
      return;
    }
    if (worst !== null && laneWait(sim, worst) < 5 && sim.t > 8) {
      this.say('Traffic is flowing. Good work!', 'happy', 2.2);
      return;
    }
    if (sim.rules.redirect) {
      this.say('Swipe approaching vehicles to shorter lanes.', 'idle', 2.2);
    } else {
      this.say('Open booths where the traffic is heading.', 'idle', 2.2);
    }
  }

  private showCoach(m: CoachMoment): void {
    this.coach = m;
    this.coachFresh.push(m.id);
    this.coachPending = this.coachPending.filter((id) => id !== m.id);
    setText(this.coachText, m.text);
    setText(this.liveEl, m.text);
    this.coachEl.classList.remove('hidden');
    let low = false;
    if (m.vehicleId !== null) {
      const v = findVehicle(this.sim, m.vehicleId);
      low = v !== null && this.stage.centerOf(v).y > this.stage.h * 0.5;
    }
    this.coachEl.classList.toggle('top', low);
    this.coachOk.classList.toggle('hidden', m.action !== 'ok');
    this.enginesBtn.classList.toggle('coach-point', m.enginesButton);
    this.barEl.classList.toggle('coach-point', m.barTip);
    this.press = null;
    this.selected = null;
  }

  private hideCoach(): void {
    this.coach = null;
    this.coachEl.classList.add('hidden');
    this.enginesBtn.classList.remove('coach-point');
    this.barEl.classList.remove('coach-point');
    this.host.markCoachSeen(this.coachFresh);
  }

  private coachAction(action: CoachAction): void {
    this.host.audio.unlock();
    this.host.audio.play('tap');
    this.coachDone(action);
  }

  private coachDone(action: CoachAction): void {
    if (this.coach !== null && this.coach.action === action) {
      this.hideCoach();
    }
  }

  private skipCoach(): void {
    this.coachFresh.push(...this.coachPending, 'budget', 'open', 'swap', 'closure', 'redirect', 'reload', 'tag', 'breakdown', 'reader', 'engines');
    this.coachPending = [];
    this.hideCoach();
  }

  /* ---- Waves and picks ---- */

  private announce(title: string, noteText: string): void {
    setText(this.bannerTitle, title);
    setText(this.bannerNote, noteText);
    this.bannerEl.classList.remove('hidden', 'go');
    /* Restart the animation. */
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('go');
    this.host.audio.play('wave');
  }

  private onWave(index: number): void {
    const wave = this.run.def.waves[index];
    this.announce(`Wave ${index + 1}: ${wave.label}`, wave.note);
    if (index > 0) {
      this.setMood('excited');
      setText(this.navieText, 'Wave cleared! Here comes the next one.');
      this.sayLeft = 2;
      this.hintIn = 3.5;
    }
    const after = index - 1;
    if (after >= 0 && this.run.def.perksAfter.includes(after)) {
      this.offerPerks(after);
    }
  }

  private offerPerks(afterWave: number): void {
    const offers = perkOffers(this.run, this.sim, afterWave);
    if (offers.length === 0) {
      return;
    }
    this.perkWave = afterWave;
    this.perkLeft = PERK_SECONDS;
    this.perkStrip.replaceChildren(
      h('div', { class: 'perk-label', text: 'Pick one!' }),
      ...offers.map((id) =>
        h('button', {
          class: 'perk-chip',
          text: perkById(id).title,
          label: `${perkById(id).title}. ${perkById(id).blurb}`,
          attrs: { type: 'button' },
          onClick: () => this.choosePerk(id),
        }),
      ),
    );
    this.perkStrip.classList.remove('hidden');
    this.navieRow.classList.add('hidden');
    this.host.audio.play('perk');
  }

  private choosePerk(id: PerkId): void {
    this.host.audio.unlock();
    if (this.paused || this.ended) {
      return;
    }
    pickPerk(this.sim, id);
    this.host.audio.play('perk');
    this.closePerks();
    this.say(perkById(id).blurb, 'excited', 3);
  }

  private closePerks(): void {
    this.perkLeft = 0;
    this.perkStrip.classList.add('hidden');
    this.navieRow.classList.remove('hidden');
  }

  /* ---- The clock ---- */

  private frame = (now: number): void => {
    if (this.disposed) {
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.advance(dt);
    if (this.ended || this.disposed) {
      return;
    }
    this.render(dt);
  };

  /** Time passes. The page's frames call this; tests can too. */
  advance(dt: number): void {
    if (this.paused || this.ended) {
      return;
    }
    if (this.intro > 0) {
      this.intro -= dt;
      if (this.intro <= 0) {
        this.introEl.classList.add('hidden');
        this.onWave(0);
      }
      return;
    }
    const sim = this.sim;
    if (this.coach === null && this.coachPending.length > 0) {
      const due = coachDue(sim, this.coachPending);
      if (due !== null) {
        this.showCoach(due);
      }
    }
    if (this.coach === null) {
      if (this.sayLeft > 0) {
        this.sayLeft -= dt;
      }
      this.hintIn -= dt;
      if (this.hintIn <= 0 && this.perkLeft <= 0) {
        this.thinkAloud();
      }
      if (this.perkLeft > 0) {
        this.perkLeft -= dt;
        if (this.perkLeft <= 0) {
          this.closePerks();
        }
      }
      const speed = this.host.gameSpeed() * (isDraining(sim) ? DRAIN_SPEED : 1) * this.timeScale;
      this.accumulator += dt * speed;
      let steps = 0;
      const stepLimit = 12 * Math.ceil(this.timeScale);
      while (this.accumulator >= STEP_S && steps < stepLimit) {
        if (this.autopilot !== null) {
          botAct(sim, this.autopilot, this.autoMemory, STEP_S);
        }
        step(sim, STEP_S);
        this.accumulator -= STEP_S;
        steps += 1;
        if (budgetGone(this.run, sim)) {
          this.finish('smog');
          return;
        }
        if (sim.done) {
          this.finish('done');
          return;
        }
      }
      if (steps >= stepLimit) {
        this.accumulator = 0;
      }
    }
    this.readNotes();
    this.checkMilestones();
    if (this.selected !== null) {
      const chosen = findVehicle(sim, this.selected);
      if (chosen === null || !canRedirect(chosen)) {
        this.selected = null;
      }
    }
  }

  private readNotes(): void {
    const sim = this.sim;
    for (const n of sim.notes) {
      switch (n.kind) {
        case 'wave':
          this.onWave(n.value);
          break;
        case 'block':
          this.host.audio.play('block');
          if (!this.coachPending.includes(n.what)) {
            this.say(n.what === 'tag' ? 'This driver cannot pay. Tap the ? to help!' : 'Breakdown! Tap the ! to send a tow.', 'alert', 3);
          }
          break;
        case 'unblocked': {
          const lane = this.stage.laneCenter(n.lane);
          if (n.auto) {
            this.say(n.what === 'tag' ? `That took ${Math.round(n.value)} minutes to sort out by itself.` : `That breakdown blocked the lane for ${Math.round(n.value)} minutes.`, 'worried', 2.6);
          } else {
            this.host.audio.play('clear');
            this.stage.sparkle(lane, this.stage.boothY + 40);
            this.stage.float(lane, this.stage.boothY + 30, n.what === 'tag' ? 'Line moving!' : `Cleared in ${Math.max(1, Math.round(n.value))} min`, '#ffd968');
            if (n.what === 'breakdown') {
              this.stage.navieDone();
            }
          }
          break;
        }
        case 'towCalled':
          this.say('On my way!', 'excited', 2);
          break;
        case 'fault':
          this.host.audio.play('block');
          if (n.what === 'reader') {
            if (!this.coachPending.includes('reader')) {
              this.say(`Lane ${n.lane + 1}'s reader failed! Tap the wrench.`, 'alert', 3);
            }
          } else {
            this.say(`Booth ${n.lane + 1} is shut. Its crew can open another!`, 'alert', 3);
          }
          break;
        case 'faultEnd':
          if (n.what === 'reader' && !n.auto) {
            this.host.audio.play('clear');
            this.stage.sparkle(this.stage.laneCenter(n.lane), this.stage.boothY + 30);
            this.say('Booth repaired. Good work!', 'happy', 2);
          } else if (n.what === 'closure') {
            this.say(`Booth ${n.lane + 1} is back.`, 'happy', 2);
          }
          break;
        case 'closureSoon':
          this.host.audio.play('warn');
          this.say(`Booth ${n.lane + 1} closes in ${n.value} minutes. Move traffic away!`, 'alert', 3.4);
          break;
        case 'warning':
          this.host.audio.play('warn');
          this.say(n.text, 'alert', 3.6);
          break;
        default:
          break;
      }
    }
    sim.notes.length = 0;
  }

  private checkMilestones(): void {
    const fraction = this.sim.co2 / this.run.budget;
    if (this.milestones.length > 0 && fraction >= this.milestones[0]) {
      const m = this.milestones.shift() as number;
      if (m === 0.75) {
        this.say('Smog is building! Clear those queues!', 'worried', 2.8);
      } else if (m >= 0.9) {
        this.host.audio.play('alarm');
        this.say('Almost out of budget!', 'alert', 2.8);
      }
    }
  }

  private finish(kind: 'done' | 'smog'): void {
    this.ended = true;
    this.press = null;
    this.readNotes();
    if (this.disposed) {
      return;
    }
    if (kind === 'done') {
      this.host.onDone(this.sim);
    } else {
      this.host.audio.play('alarm');
      this.host.onSmog(this.sim);
    }
  }

  /* ---- Showing it ---- */

  private render(dt: number): void {
    const sim = this.sim;
    const fraction = Math.min(1, sim.co2 / this.run.budget);
    const press = this.press;
    let swipe: SwipeView | null = null;
    if (press !== null && press.swiping) {
      const to = this.swipeTarget(press);
      const lane = sim.lanes[to];
      const anyone = sim.lanes[press.lane].queue.some((v) => v.s >= press.fromS && canRedirect(v) && accepts(lane, v));
      swipe = { from: press.lane, to, y: press.y, ok: anyone && lane.fault === null };
    }
    /* The air follows what is happening now, so it clears when traffic does. The kg never go down. */
    this.rateSmooth += (sim.rate - this.rateSmooth) * (1 - Math.exp(-1.4 * dt));
    const badRate = (this.run.budget / Math.max(1, sim.duration)) * 2;
    const haze = Math.min(1, Math.max(0, fraction - 0.15) * 0.55 + Math.pow(this.rateSmooth / badRate, 2) * 0.5);
    const ui: StageUi = {
      haze,
      selected: this.selected,
      swipe,
      ring: this.coach?.vehicleId ?? null,
      hintLane: this.coach?.hintLane ?? null,
      ringLane: this.coach?.laneButton ?? null,
      still: this.paused,
    };
    this.stage.draw(sim, this.paused ? 0 : dt, ui);
    this.renderHud(fraction);
    this.renderChips();
  }

  private renderHud(fraction: number): void {
    const sim = this.sim;
    const left = sim.duration - sim.t;
    setText(this.timerEl, timerText(left));
    this.timerEl.classList.toggle('final', left <= 10 && left > 0);
    const wave = this.run.def.waves[sim.waveIndex];
    setText(this.waveEl, isDraining(sim) ? 'Clearing the lines' : `Wave ${sim.waveIndex + 1}: ${wave.label}`);
    this.pips.forEach((pip, i) => {
      const cls = i < sim.waveIndex ? 'pip done' : i === sim.waveIndex ? 'pip now' : 'pip';
      if (pip.className !== cls) {
        pip.className = cls;
      }
    });
    const seconds = Math.ceil(left);
    if (seconds <= 5 && seconds > 0 && seconds !== this.lastFinal) {
      this.lastFinal = seconds;
      this.finalEl.textContent = String(seconds);
      this.finalEl.classList.remove('hidden', 'tick');
      void this.finalEl.offsetWidth;
      this.finalEl.classList.add('tick');
      this.host.audio.play('tick');
    } else if (seconds <= 0 && this.lastFinal !== 0) {
      this.lastFinal = 0;
      this.finalEl.classList.add('hidden');
    }

    this.barFill.style.transform = `scaleX(${fraction.toFixed(4)})`;
    const state = fraction >= WARNING_AT ? 'warning' : 'clean';
    const barClass = `bar-fill ${fraction > 0.85 ? 'hot' : fraction >= WARNING_AT ? 'warm' : ''}`;
    if (this.barFill.className !== barClass) {
      this.barFill.className = barClass;
    }
    setText(this.airEl, state === 'clean' ? 'Clean Air' : 'Warning');
    this.airEl.className = `air-pill ${state}`;
    this.smogBuddy.className = `smog-buddy ${fraction >= 0.85 ? 'big' : fraction >= WARNING_AT ? 'on' : ''}`;
    const unmanaged = unmanagedAt(this.run, sim.t);
    const mark = Math.min(1, unmanaged / this.run.budget);
    this.barMark.style.transform = `translateX(${(mark * 100).toFixed(2)}%)`;
    setText(this.usedEl, `You ${sim.co2.toFixed(0)} kg`);
    setText(this.noManagerEl, `No manager ${unmanaged.toFixed(0)} kg`);
    setText(this.limitEl, `Limit ${this.run.budget.toFixed(0)} kg`);

    const staffText = `${staffInUse(sim)}/${sim.staff}`;
    if (staffText !== this.lastStaffText) {
      this.lastStaffText = staffText;
      this.staffEl.replaceChildren(icon('person'), h('span', { class: 'staff-num', text: staffText }));
      this.staffEl.setAttribute('aria-label', `${staffInUse(sim)} of ${sim.staff} crews in use`);
    }

    const active = sim.enginesTimer > 0;
    setText(this.enginesText, active ? `${Math.ceil(sim.enginesTimer)}m` : `x${sim.enginesLeft}`);
    this.enginesBtn.classList.toggle('on', active);
    this.enginesBtn.disabled = !active && sim.enginesLeft <= 0;
    this.enginesFill.style.transform = active ? `scaleX(${(sim.enginesTimer / ENGINES_S).toFixed(3)})` : 'scaleX(0)';
  }

  private renderChips(): void {
    this.sim.lanes.forEach((lane: Lane, i) => {
      const chip = this.chips[i];
      const look = boothLook(lane);
      let cls = `lane-chip look-${look}`;
      let main = '';
      let sub = '';
      let label = '';
      const minutes = Math.round(laneWait(this.sim, lane));
      if (lane.fault === 'reader') {
        main = lane.repairing ? 'Fixing' : 'Fix!';
        sub = lane.repairing ? `${Math.ceil(lane.faultLeft)}m` : 'Reader';
        label = `Booth ${i + 1} reader has failed. Tap to repair.`;
      } else if (lane.fault === 'closure') {
        main = 'Shut';
        sub = `${Math.ceil(lane.faultLeft)}m`;
        label = `Booth ${i + 1} is shut for ${Math.ceil(lane.faultLeft)} more minutes.`;
      } else if (lane.status === 'closed') {
        main = 'Closed';
        sub = 'Tap';
        label = `Booth ${i + 1} is closed. Tap to open it.`;
      } else if (lane.status === 'opening') {
        main = 'Opening';
        sub = '...';
        label = `Booth ${i + 1} is being staffed.`;
      } else if (lane.status === 'closing') {
        main = 'Closing';
        sub = `${minutes}m`;
        label = `Booth ${i + 1} is closing after its line. Tap to keep it open.`;
      } else {
        if (minutes >= CONGESTED_MINUTES) {
          cls += ' jam';
        }
        main = this.stage.laneW < 52 ? `${minutes}m` : `${minutes} min`;
        sub = lane.type === 'reload' ? '₱ lane' : 'wait';
        label = `Booth ${i + 1} is open, ${minutes} minute wait${lane.type === 'reload' ? ', reload lane' : ''}. Tap to close it.`;
      }
      if (lane.type === 'reload') {
        cls += ' reload';
      }
      if (lane.status === 'opening' || lane.status === 'closing' || lane.fault !== null) {
        cls += ' word';
      }
      if (this.coach?.laneButton === i) {
        cls += ' coach-point';
      }
      if (chip.lastClass !== cls) {
        chip.el.className = cls;
        chip.lastClass = cls;
      }
      setText(chip.main, main);
      setText(chip.sub, sub);
      chip.el.setAttribute('aria-label', label);
      chip.fill.style.transform = lane.status === 'opening' ? `scaleY(${(1 - lane.staffing / STAFFING_S).toFixed(3)})` : 'scaleY(0)';
    });
  }

  /* ---- Pause and cleanup ---- */

  private toggleSound(): void {
    this.host.setSound(!this.host.soundOn());
    this.refreshSoundLabel();
  }

  private refreshSoundLabel(): void {
    const text = this.soundBtn.querySelector('span');
    const on = this.host.soundOn();
    if (text !== null) {
      text.textContent = on ? 'Sound: on' : 'Sound: off';
    } else {
      this.soundBtn.append(h('span', { text: on ? 'Sound: on' : 'Sound: off' }));
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    if (this.paused || this.ended) {
      return;
    }
    this.paused = true;
    this.press = null;
    this.refreshSoundLabel();
    this.pauseEl.classList.remove('hidden');
    this.host.audio.suspend();
  }

  resume(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    this.pauseEl.classList.add('hidden');
    this.host.audio.unlock();
    this.lastFrame = performance.now();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.cleanups.forEach((fn) => fn());
    this.el.remove();
  }
}

/** A small, sulky smog cloud that appears as the air gets worse. */
const SMOG_BUDDY = `<svg viewBox="0 0 44 34" width="100%" height="100%" aria-hidden="true">
  <path d="M10 30a8 8 0 0 1-1.500-15.800A11 11 0 0 1 30 10.500 7.500 7.500 0 0 1 35 30z" fill="#8b8579" stroke="#5f5a50" stroke-width="2"/>
  <circle cx="16" cy="19" r="2.400" fill="#fff"/><circle cx="26.500" cy="19" r="2.400" fill="#fff"/>
  <circle cx="16.500" cy="19.500" r="1.200" fill="#22201c"/><circle cx="27" cy="19.500" r="1.200" fill="#22201c"/>
  <path d="M12.500 15l5 1.600M30 15l-5 1.600" stroke="#3f3b34" stroke-width="1.800" stroke-linecap="round"/>
  <path d="M18 26c2-2 5-2 7 0" fill="none" stroke="#3f3b34" stroke-width="1.800" stroke-linecap="round"/>
</svg>`;
