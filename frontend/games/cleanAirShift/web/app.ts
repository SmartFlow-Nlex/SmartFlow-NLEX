import { botAct, calibratedDaily, newBotMemory, SKILLS, type BotSkill } from '../core/bot';
import { DAYS, type DayDef } from '../core/days';
import { carKmFor, CLASS_LABEL, IDLE_KG_PER_MIN } from '../core/factors';
import { PERKS } from '../core/perks';
import {
  bumpRevision,
  currentStreak,
  isUnlocked,
  loadSave,
  manilaDateKey,
  recordShift,
  serializeSave,
  type GameSpeed,
  type SaveData,
  type TextScale,
} from '../core/save';
import { outcome, startShift, startSim, type ShiftOutcome, type ShiftRun } from '../core/shift';
import { createSim, step, STEP_S, totalDuration, type Sim } from '../core/sim';
import { GameAudio } from './audio';
import { button, h, icon, ICONS } from './dom';
import type { Host } from './host';
import { RushRunner } from './rush';
import { artUrl, LOOK_COLOR, loadPictures, Stage, type Pictures } from './stage';

/**
 * The whole page: the menus, the flow of a shift from briefing to stars, and the
 * save. The plaza itself is in rush.ts and stage.ts, the rules in core/.
 */

const kg = (v: number): string => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
const whole = (v: number): string => Math.round(v).toLocaleString('en-US');
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const minutesText = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

const NAVIE_FACTS = [
  'A large truck waiting in line burns about 4 times what a car burns.',
  'Large trucks are 8% of NLEX trips but 23% of its CO₂.',
  'A queue grows while a lane is blocked, so twice the blockage is about four times the idling.',
  'Turning an engine off during a long stop saves more than it costs to restart.',
];

export class CleanAirApp {
  private root!: HTMLElement;
  private save!: SaveData;
  private readonly audio = new GameAudio();
  private pictures: Pictures = new Map();
  private runner: RushRunner | null = null;
  private attract: Attract | null = null;
  private run: ShiftRun | null = null;
  private runId = '';
  private saveFailed = false;
  private backAction: (() => void) | null = null;
  private dailyCache: { key: string; def: DayDef } | null = null;
  private readonly cleanups: (() => void)[] = [];
  private factIndex = 0;
  /** Development only, set from the browser console with ?debug=1. */
  devAutopilot: BotSkill | null = null;
  devTimeScale = 1;
  readonly devSkills = SKILLS;
  readonly devDays = DAYS;

  constructor(private readonly host: Host) {}

  start(root: HTMLElement): void {
    this.root = root;
    this.save = loadSave(this.host.boot.save).save;
    if (this.host.boot.reduceMotion) {
      this.save.settings.reduceMotion = true;
    }
    this.factIndex = this.save.shiftsFinished % NAVIE_FACTS.length;
    if (!this.host.boot.storageOk) {
      this.saveFailed = true;
    }
    const { insets } = this.host.boot;
    const style = document.documentElement.style;
    if (insets.top > 0 || insets.bottom > 0) {
      style.setProperty('--safe-top', `${insets.top}px`);
      style.setProperty('--safe-bottom', `${insets.bottom}px`);
      style.setProperty('--safe-left', `${insets.left}px`);
      style.setProperty('--safe-right', `${insets.right}px`);
    }
    this.applySettings();
    this.cleanups.push(
      this.host.onMessage((message) => {
        switch (message.type) {
          case 'pause':
            this.runner?.pause();
            this.audio.suspend();
            break;
          case 'back':
            this.goBack();
            break;
          case 'saved':
            this.saveFailed = false;
            break;
          case 'saveFailed':
            this.saveFailed = true;
            break;
          default:
            break;
        }
      }),
    );
    const hide = (): void => {
      if (document.hidden) {
        this.runner?.pause();
        this.audio.suspend();
      }
    };
    const blur = (): void => this.runner?.pause();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', blur);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', hide));
    this.cleanups.push(() => window.removeEventListener('blur', blur));
    const tap = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', tap);
    this.cleanups.push(() => window.removeEventListener('pointerdown', tap));
    if (this.host.boot.debug) {
      (window as unknown as { __cas: unknown }).__cas = this;
    }
    void loadPictures().then((pictures) => {
      this.pictures = pictures;
      this.showTitle();
      this.host.send({ type: 'ready' });
    });
  }

  dispose(): void {
    this.closeLive();
    this.cleanups.forEach((fn) => fn());
  }

  /* ---- Plumbing ---- */

  private applySettings(): void {
    const s = this.save.settings;
    document.documentElement.style.setProperty('--text-scale', String(s.textScale));
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
    this.audio.setEnabled(s.sound);
  }

  private persist(next: SaveData): void {
    this.save = bumpRevision(next);
    this.host.send({ type: 'save', save: serializeSave(this.save), revision: this.save.revision });
  }

  private closeLive(): void {
    this.runner?.dispose();
    this.runner = null;
    this.attract?.dispose();
    this.attract = null;
  }

  private show(el: HTMLElement, back: (() => void) | null): void {
    this.closeLive();
    this.backAction = back;
    this.root.replaceChildren(el);
    const scroller = el.querySelector<HTMLElement>('.scroll');
    if (scroller !== null) {
      scroller.scrollTop = 0;
    }
  }

  private goBack(): void {
    if (this.runner !== null) {
      if (this.runner.isPaused) {
        this.runner.resume();
      } else {
        this.runner.pause();
      }
      return;
    }
    if (this.backAction !== null) {
      this.audio.play('tap');
      this.backAction();
    } else {
      this.host.send({ type: 'exit' });
    }
  }

  private tapThen(fn: () => void): () => void {
    return () => {
      this.audio.unlock();
      this.audio.play('tap');
      fn();
    };
  }

  /** The screen frame most menus share: a back button, a heading and a scrolling body. */
  private page(title: string, onBack: () => void, ...children: (HTMLElement | null)[]): HTMLElement {
    return h(
      'div',
      { class: 'screen menu' },
      h(
        'div',
        { class: 'menu-top' },
        h('button', { class: 'round-btn', label: 'Back', attrs: { type: 'button' }, html: ICONS.back, onClick: this.tapThen(onBack) }),
        h('h2', { text: title }),
      ),
      h('div', { class: 'scroll' }, ...children),
    );
  }

  /* ---- Title ---- */

  private nextShiftIndex(): number {
    for (let i = 0; i < DAYS.length; i += 1) {
      if ((this.save.shifts[DAYS[i].id]?.stars ?? 0) === 0) {
        return i;
      }
    }
    return DAYS.length - 1;
  }

  showTitle(): void {
    const today = manilaDateKey();
    const streak = currentStreak(this.save.daily, today);
    const dailyOpen = isUnlocked(this.save, DAYS, 1);
    const next = this.nextShiftIndex();
    const nextDay = DAYS[next];
    const playedAny = Object.keys(this.save.shifts).length > 0;
    const backdrop = h('canvas', { class: 'attract-canvas', attrs: { 'aria-hidden': 'true' } });
    const backdropBox = h('div', { class: 'attract' }, backdrop);
    const total = this.save.totalSaved;
    const fact = NAVIE_FACTS[this.factIndex % NAVIE_FACTS.length];

    const el = h(
      'div',
      { class: 'screen title' },
      backdropBox,
      h('div', { class: 'title-shade' }),
      h(
        'div',
        { class: 'title-top' },
        h('button', { class: 'round-btn glass', label: 'Back to the Arcade', attrs: { type: 'button' }, html: ICONS.back, onClick: this.tapThen(() => this.host.send({ type: 'exit' })) }),
        h('button', { class: 'round-btn glass', label: 'Settings', attrs: { type: 'button' }, html: ICONS.gear, onClick: this.tapThen(() => this.showSettings(() => this.showTitle())) }),
      ),
      h(
        'div',
        { class: 'title-head' },
        h('div', { class: 'title-kicker', text: "Navie's Arcade" }),
        h('h1', { class: 'title-name' }, h('span', { text: 'Carbon' }), h('span', { class: 'accent', text: 'Rush' })),
        h('p', { class: 'title-tag', text: 'Toll Plaza Rescue' }),
      ),
      h(
        'div',
        { class: 'title-foot' },
        h('div', { class: 'navie-says' }, h('img', { class: 'navie-head big', attrs: { src: artUrl('happy'), alt: '' } }), h('div', { class: 'navie-says-text', text: fact })),
        total > 0
          ? h('div', { class: 'saved-pill' }, icon('leaf'), h('span', { text: `${kg(total)} kg of CO₂ avoided so far, like ${whole(carKmFor(total))} km of car driving` }))
          : null,
        button(playedAny ? `Play ${nextDay.title}: ${nextDay.plaza}` : 'Start your first shift', this.tapThen(() => this.showBrief(nextDay)), { iconName: 'play', class: 'big' }),
        h(
          'div',
          { class: 'title-row' },
          button(
            dailyOpen ? (streak > 0 ? `Today's shift · ${streak} day streak` : "Today's shift") : "Today's shift",
            this.tapThen(() => {
              if (dailyOpen) {
                this.openDaily();
              }
            }),
            { class: `secondary ${dailyOpen ? '' : 'locked'}`, iconName: dailyOpen ? 'calendar' : 'lock', label: dailyOpen ? "Today's shift" : "Today's shift, opens after Shift 1" },
          ),
        ),
        h(
          'div',
          { class: 'title-row two' },
          button('Shifts', this.tapThen(() => this.showShifts()), { class: 'secondary', iconName: 'list' }),
          button('How to play', this.tapThen(() => this.showHowTo(() => this.showTitle())), { class: 'secondary', iconName: 'book' }),
        ),
        this.saveFailed ? h('p', { class: 'save-warn', text: 'Progress could not be saved on this phone.' }) : null,
      ),
    );
    this.show(el, null);
    this.attract = new Attract(backdrop, this.pictures, this.save.settings.reduceMotion);
    this.factIndex += 1;
  }

  /* ---- Shifts ---- */

  private stars(count: number, cls = ''): HTMLElement {
    const row = h('div', { class: `stars ${cls}`.trim(), label: `${count} of 3 stars`, attrs: { role: 'img' } });
    for (let i = 0; i < 3; i += 1) {
      row.append(h('span', { class: `star ${i < count ? 'on' : ''}`, html: ICONS.star }));
    }
    return row;
  }

  showShifts(): void {
    const today = manilaDateKey();
    const list = h('div', { class: 'shift-list' });
    DAYS.forEach((def, i) => {
      const record = this.save.shifts[def.id];
      const open = isUnlocked(this.save, DAYS, i);
      list.append(
        h(
          'button',
          {
            class: `shift-card ${open ? '' : 'locked'}`,
            attrs: { type: 'button' },
            label: open ? `${def.title}, ${def.plaza}, ${record?.stars ?? 0} stars` : `${def.title}, ${def.plaza}, locked`,
            onClick: this.tapThen(() => {
              if (open) {
                this.showBrief(def);
              } else {
                this.audio.play('deny');
              }
            }),
          },
          h('div', { class: 'shift-num', text: String(i + 1) }),
          h(
            'div',
            { class: 'shift-info' },
            h('div', { class: 'shift-plaza', text: def.plaza }),
            h(
              'div',
              { class: 'shift-sub' },
              open
                ? record !== undefined && record.bestSaved > 0
                  ? `Best: ${kg(record.bestSaved)} kg avoided`
                  : `${def.lanes} lanes, ${def.waves.length} waves`
                : `Finish ${DAYS[i - 1].plaza} to open`,
            ),
          ),
          open ? this.stars(record?.stars ?? 0, 'small') : icon('lock', 'muted-icon'),
        ),
      );
    });
    const streak = currentStreak(this.save.daily, today);
    const dailyOpen = isUnlocked(this.save, DAYS, 1);
    const doneToday = this.save.daily.lastDate === today;
    const daily = h(
      'button',
      {
        class: `shift-card daily ${dailyOpen ? '' : 'locked'}`,
        attrs: { type: 'button' },
        onClick: this.tapThen(() => {
          if (dailyOpen) {
            this.openDaily();
          } else {
            this.audio.play('deny');
          }
        }),
      },
      h('div', { class: 'shift-num', html: ICONS.calendar }),
      h(
        'div',
        { class: 'shift-info' },
        h('div', { class: 'shift-plaza', text: "Today's shift" }),
        h('div', { class: 'shift-sub', text: dailyOpen ? (streak > 0 ? `${streak} day streak · best ${this.save.daily.bestStreak}` : 'New traffic every day') : 'Finish Meycauayan to open' }),
      ),
      dailyOpen ? this.stars(doneToday ? this.save.daily.stars : 0, 'small') : icon('lock', 'muted-icon'),
    );
    this.show(this.page('Shifts', () => this.showTitle(), daily, list), () => this.showTitle());
  }

  private openDaily(): void {
    const key = manilaDateKey();
    if (this.dailyCache === null || this.dailyCache.key !== key) {
      this.dailyCache = { key, def: calibratedDaily(key) };
    }
    this.showBrief(this.dailyCache.def);
  }

  /* ---- A shift, start to end ---- */

  showBrief(def: DayDef): void {
    const run = startShift(def);
    const record = this.save.shifts[def.id];
    const target = (count: number, text: string): HTMLElement => h('div', { class: 'target' }, this.stars(count, 'small'), h('span', { text }));
    const back = (): void => (def.id.startsWith('daily-') ? this.showTitle() : this.showShifts());
    const el = this.page(
      def.title,
      back,
      h(
        'div',
        { class: 'card brief' },
        h('div', { class: 'brief-plaza', text: def.plaza }),
        h('p', { class: 'lead', text: def.brief }),
        h(
          'div',
          { class: 'brief-facts' },
          this.fact(minutesText(totalDuration(def)), 'on the clock'),
          this.fact(String(def.waves.length), 'waves'),
          this.fact(`${def.staff}/${def.lanes}`, 'booths staffed'),
        ),
        def.fresh.length > 0 ? h('div', { class: 'fresh' }, h('div', { class: 'fresh-title', text: 'New here' }), ...def.fresh.map((line) => h('div', { class: 'fresh-line' }, icon('next'), h('span', { text: line })))) : null,
      ),
      h(
        'div',
        { class: 'card' },
        h('h3', { text: 'Your CO₂ budget' }),
        h('p', {
          class: 'muted',
          text: `With nobody managing the plaza, this traffic would burn about ${kg(run.unmanaged.total)} kg of CO₂ while idling. Stay under ${kg(run.budget)} kg or the shift ends in smog.`,
        }),
        target(1, `Cut at least ${pct(def.need[0])}`),
        target(2, `Cut at least ${pct(def.need[1])}`),
        target(3, `Cut at least ${pct(def.need[2])}`),
        record !== undefined && record.bestSaved > 0 ? h('p', { class: 'best-line', text: `Your best: ${kg(record.bestSaved)} kg avoided` }) : null,
      ),
      button('Start the shift', this.tapThen(() => this.beginShift(run)), { iconName: 'play', class: 'big' }),
    );
    this.show(el, back);
  }

  private fact(value: string, label: string): HTMLElement {
    return h('div', { class: 'fact' }, h('div', { class: 'fact-value', text: value }), h('div', { class: 'fact-label', text: label }));
  }

  private beginShift(run: ShiftRun): void {
    this.run = run;
    this.runId = `${run.def.id}-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(16)}`;
    this.closeLive();
    const sim = startSim(run);
    const runner = new RushRunner(
      {
        audio: this.audio,
        pictures: this.pictures,
        reduceMotion: () => this.save.settings.reduceMotion,
        gameSpeed: () => this.save.settings.gameSpeed,
        coachSeen: () => this.save.coachSeen,
        markCoachSeen: (ids) => {
          const merged = Array.from(new Set([...this.save.coachSeen, ...ids]));
          if (merged.length !== this.save.coachSeen.length) {
            this.persist({ ...this.save, coachSeen: merged });
          }
        },
        soundOn: () => this.save.settings.sound,
        setSound: (on) => this.changeSettings({ sound: on }),
        onDone: (done) => this.showResult(done, false),
        onSmog: (smog) => this.showResult(smog, true),
        onRestart: () => this.showBrief(run.def),
        onQuit: () => (run.def.id.startsWith('daily-') ? this.showTitle() : this.showShifts()),
        debug: this.host.boot.debug,
      },
      run,
      sim,
    );
    runner.autopilot = this.devAutopilot;
    runner.timeScale = this.devTimeScale;
    this.runner = runner;
    this.backAction = null;
    this.root.replaceChildren(runner.el);
    runner.start();
  }

  /** Managed and unmanaged, side by side, growing to their real heights. */
  private compareColumns(result: ShiftOutcome): HTMLElement {
    const biggest = Math.max(result.used, result.unmanaged, 0.001);
    const column = (label: string, value: number, cls: string, delay: number): HTMLElement => {
      const fill = h('div', { class: `col-fill ${cls}` });
      fill.style.setProperty('--grow', String(Math.max(0.03, value / biggest)));
      fill.style.animationDelay = `${delay}ms`;
      return h('div', { class: 'col' }, h('div', { class: 'col-value', text: `${kg(value)} kg` }), h('div', { class: 'col-track' }, fill), h('div', { class: 'col-label', text: label }));
    };
    return h('div', { class: 'columns' }, column('You', result.used, 'you', 300), column('No-manager baseline', result.unmanaged, 'none', 100));
  }

  private stat(value: string, label: string): HTMLElement {
    return h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: value }), h('div', { class: 'stat-label', text: label }));
  }

  private animatedStars(count: number): HTMLElement {
    const row = h('div', { class: 'stars big', label: `${count} of 3 stars`, attrs: { role: 'img' } });
    for (let i = 0; i < 3; i += 1) {
      const star = h('span', { class: `star ${i < count ? 'on pop' : ''}`, html: ICONS.star });
      star.style.animationDelay = `${250 + i * 240}ms`;
      row.append(star);
      if (i < count) {
        window.setTimeout(() => this.audio.play('star'), 250 + i * 240);
      }
    }
    return row;
  }

  private confetti(host: HTMLElement, pieces: number): void {
    if (this.save.settings.reduceMotion) {
      return;
    }
    const colors = ['#ffc32d', '#1464e8', '#2ead5b', '#ffffff', '#ff8a1f'];
    const layer = h('div', { class: 'confetti', attrs: { 'aria-hidden': 'true' } });
    for (let i = 0; i < pieces; i += 1) {
      const bit = h('span', { class: 'bit' });
      bit.style.left = `${(i * 137) % 100}%`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${(i * 53) % 500}ms`;
      bit.style.setProperty('--drift', `${((i * 71) % 90) - 45}px`);
      layer.append(bit);
    }
    host.append(layer);
    window.setTimeout(() => layer.remove(), 2600);
  }

  private showResult(sim: Sim, smog: boolean): void {
    const run = this.run as ShiftRun;
    const result = outcome(run, sim, smog);
    const before = this.save;
    const wasUnlocked = DAYS.map((_, i) => isUnlocked(before, DAYS, i));
    const best = before.shifts[run.def.id]?.bestSaved ?? 0;
    this.persist(recordShift(before, this.runId, run.def, result));
    const index = DAYS.findIndex((d) => d.id === run.def.id);
    const nextDay = index >= 0 && index + 1 < DAYS.length ? DAYS[index + 1] : null;
    const newlyOpen = nextDay !== null && !wasUnlocked[index + 1] && isUnlocked(this.save, DAYS, index + 1);
    const nextOpen = nextDay !== null && isUnlocked(this.save, DAYS, index + 1);
    const isBest = result.finished && result.saved > best && best > 0;
    const finale = run.def.finale === true && result.finished;

    const headline = !result.finished ? 'Smog Alert!' : finale ? 'End of the road! Shift Complete!' : 'Shift Complete!';
    const mood = !result.finished ? 'alert' : result.stars === 3 ? 'excited' : 'happy';

    const actions = h(
      'div',
      { class: 'result-actions' },
      !result.finished ? button('Try again', this.tapThen(() => this.showBrief(run.def)), { class: 'big', iconName: 'retry' }) : null,
      nextOpen && nextDay !== null ? button(`Next: ${nextDay.plaza}`, this.tapThen(() => this.showBrief(nextDay)), { iconName: 'next', class: result.finished ? 'big' : 'secondary' }) : null,
      result.finished ? button('Play it again', this.tapThen(() => this.showBrief(run.def)), { class: nextOpen ? 'secondary' : 'big', iconName: 'retry' }) : null,
      button('All shifts', this.tapThen(() => this.showShifts()), { class: 'secondary', iconName: 'list' }),
    );

    const head = h(
      'div',
      { class: `result-head ${result.finished ? '' : 'smog'}` },
      h('div', { class: 'title-kicker', text: `${run.def.title} · ${run.def.plaza}` }),
      h('h2', { text: headline }),
      result.finished ? this.animatedStars(result.stars) : h('div', { class: 'smog-icon', html: ICONS.cloud }),
      result.finished
        ? h('div', { class: 'saved-big' }, h('span', { class: 'saved-num', text: kg(result.saved) }), h('span', { class: 'saved-unit', text: 'kg of CO₂ avoided (est.)' }))
        : h('p', { class: 'smog-text', text: `The CO₂ budget ran out with ${minutesText(result.smogLeft as number)} left.` }),
      result.finished ? h('p', { class: 'saved-km', text: `About the same as driving a car ${whole(result.carKm)} km` }) : null,
      isBest ? h('div', { class: 'best-pill', text: 'New best' }) : null,
      h('img', { class: 'result-navie', attrs: { src: artUrl(mood), alt: '' } }),
    );

    const el = h(
      'div',
      { class: 'screen menu result' },
      h(
        'div',
        { class: 'scroll no-top' },
        head,
        newlyOpen && nextDay !== null ? h('div', { class: 'unlock' }, icon('star'), h('span', { text: `${nextDay.plaza} is now open!` })) : null,
        h(
          'div',
          { class: 'card' },
          h('h3', { text: result.finished ? `You cut idling CO₂ by ${pct(result.share)}` : 'Up to that moment' }),
          this.compareColumns(result),
          h(
            'div',
            { class: 'stats' },
            this.stat(`${kg(result.used)} kg`, 'estimated CO₂ generated'),
            this.stat(`${kg(result.saved)} kg`, 'estimated CO₂ avoided'),
            this.stat(String(result.longestQueue), 'vehicles in your longest queue'),
            this.stat(`${result.handled}/${result.emergencies}`, 'emergencies handled'),
          ),
          this.insight(result),
        ),
        !result.finished ? h('div', { class: 'card tip' }, h('h3', { text: 'Try this' }), h('p', { text: tipFor(run.def, result) })) : null,
        actions,
        h('button', { class: 'text-btn', text: 'Where do these numbers come from?', attrs: { type: 'button' }, onClick: this.tapThen(() => this.showSources(() => this.showTitle())) }),
      ),
    );
    this.show(el, () => this.showShifts());
    if (result.finished) {
      this.confetti(el, finale ? 60 : result.stars * 12);
      this.audio.play(result.stars === 3 ? 'win' : 'clear');
    } else {
      this.audio.play('alarm');
    }
  }

  private insight(result: ShiftOutcome): HTMLElement | null {
    const vehicles = result.arrivedByClass[0] + result.arrivedByClass[1] + result.arrivedByClass[2];
    const heavy = result.arrivedByClass[1] + result.arrivedByClass[2];
    const co2 = result.byClass[0] + result.byClass[1] + result.byClass[2];
    if (vehicles === 0 || co2 <= 0) {
      return null;
    }
    const heavyCo2 = (result.byClass[1] + result.byClass[2]) / co2;
    return h('p', { class: 'insight' }, h('strong', { text: 'Buses and trucks ' }), `were ${pct(heavy / vehicles)} of your traffic but ${pct(heavyCo2)} of your CO₂.`);
  }

  /* ---- How to play, numbers, settings ---- */

  showHowTo(back: () => void): void {
    const item = (title: string, text: string, iconName: keyof typeof ICONS): HTMLElement =>
      h('div', { class: 'how' }, icon(iconName, 'how-icon'), h('div', {}, h('h3', { text: title }), h('p', { class: 'muted', text })));
    const look = (key: string, label: string): HTMLElement => {
      const dot = h('span', { class: 'legend-dot' });
      dot.style.background = LOOK_COLOR[key];
      return h('span', { class: 'legend-item' }, dot, h('span', { text: label }));
    };
    const el = this.page(
      'How to play',
      back,
      h(
        'div',
        { class: 'card' },
        item('Waiting burns CO₂', 'Every vehicle standing in line fills the bar at the top. Fill it and the shift ends in smog. One second here is one minute at the plaza.', 'cloud'),
        item('Tap booths to open or close them', 'You only have so many crews. A booth finishes its line before it closes, and only then is its crew free, so plan ahead.', 'person'),
        h('div', { class: 'legend' }, look('open', 'Open'), look('busy', 'Busy'), look('closed', 'Closed'), look('fault', 'Fault')),
        item('Swipe approaching vehicles', 'Swipe left or right to send a vehicle, and those behind it, to another lane. Once a vehicle has joined a line, it stays. You can also tap a vehicle, then tap a lane.', 'next'),
        item('Yellow ₱ means no load', 'Only a ₱ lane can take these drivers. Get them there before they reach another booth, or they block it.', 'flame'),
        item('Handle emergencies', 'Tap ? when a driver cannot pay, ! to send a tow to a breakdown, and the wrench to repair a failed reader. A blocked lane gets worse fast.', 'gear'),
        item('Engines Off', 'Everyone behind the front of each line switches off for 8 minutes. You get only a few, so save them for the worst moments.', 'leaf'),
        item('Beat the no-manager number', 'The white mark on the bar is what this same traffic burns with nobody in charge. Stars depend on how far below it you finish.', 'star'),
      ),
      h(
        'div',
        { class: 'card' },
        h('h3', { text: 'Changes you can pick between waves' }),
        ...PERKS.map((perk) => h('p', { class: 'muted small-text' }, h('strong', { text: `${perk.title}: ` }), perk.blurb)),
      ),
      button('Where the numbers come from', this.tapThen(() => this.showSources(() => this.showHowTo(back))), { class: 'secondary', iconName: 'book' }),
    );
    this.show(el, back);
  }

  showSources(back: () => void): void {
    const rows = [0, 1, 2].map((c) => h('tr', {}, h('td', { text: CLASS_LABEL[c] }), h('td', { class: 'num', text: `${IDLE_KG_PER_MIN[c].toFixed(3)} kg` })));
    const el = this.page(
      'The numbers',
      back,
      h(
        'div',
        { class: 'card' },
        h('h3', { text: 'CO₂ per minute of idling' }),
        h('table', { class: 'facts-table' }, h('tbody', {}, ...rows)),
        h('p', { class: 'muted small-text', text: 'These are the same rates the SmartFlow NLEX dashboard uses. Fuel burned while idling: Argonne National Laboratory (2010, 2015). CO₂ per gallon: US EPA (2026). They are US figures, because none were found for the Philippine fleet.' }),
      ),
      h(
        'div',
        { class: 'card' },
        h('h3', { text: 'How the score stays fair' }),
        h('p', { class: 'muted', text: 'Your shift and the no-manager comparison run the same rules on exactly the same vehicles. Your CO₂ only goes up: clearing a line slows what you burn from then on, but never takes back what was already burned.' }),
      ),
      h(
        'div',
        { class: 'card' },
        h('h3', { text: 'What is real and what is game' }),
        h('p', { class: 'muted', text: 'Real: the idling rates, the class mix in most waves (78% cars, 14% buses and small trucks, 8% large trucks) and the 196 g of CO₂ per km behind the car comparison (EMEP/EEA Guidebook 2023).' }),
        h('p', { class: 'muted', text: 'Made for the game: the traffic, lane counts, booth times and emergencies. One second of play counts as one minute of idling. So the kg show how queues turn into CO₂. They are estimates, not measurements of any NLEX plaza.' }),
      ),
    );
    this.show(el, back);
  }

  private changeSettings(change: Partial<SaveData['settings']>): void {
    this.persist({ ...this.save, settings: { ...this.save.settings, ...change } });
    this.applySettings();
  }

  showSettings(back: () => void): void {
    const s = this.save.settings;
    const seg = <T extends string | number>(title: string, value: T, options: { value: T; label: string }[], onPick: (v: T) => void, note?: string): HTMLElement =>
      h(
        'div',
        { class: 'setting' },
        h('h3', { text: title }),
        note !== undefined ? h('p', { class: 'muted small-text', text: note }) : null,
        h(
          'div',
          { class: 'seg-row', attrs: { role: 'radiogroup', 'aria-label': title } },
          ...options.map((o) =>
            h('button', {
              class: `seg-btn ${o.value === value ? 'on' : ''}`,
              text: o.label,
              attrs: { type: 'button', role: 'radio', 'aria-checked': String(o.value === value) },
              onClick: this.tapThen(() => {
                onPick(o.value);
                this.showSettings(back);
              }),
            }),
          ),
        ),
      );
    const el = this.page(
      'Settings',
      back,
      h(
        'div',
        { class: 'card' },
        seg('Sound', s.sound ? 'on' : 'off', [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], (v) => this.changeSettings({ sound: v === 'on' })),
        seg<GameSpeed>('Game speed', s.gameSpeed, [{ value: 0.7, label: '70%' }, { value: 0.85, label: '85%' }, { value: 1, label: '100%' }], (v) => this.changeSettings({ gameSpeed: v }), 'Slower gives more time to think. The score is not affected.'),
        seg('Reduce motion', s.reduceMotion ? 'on' : 'off', [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }], (v) => this.changeSettings({ reduceMotion: v === 'on' }), 'Less smoke and fewer animations.'),
        seg<TextScale>('Text size', s.textScale, [{ value: 1, label: '100%' }, { value: 1.2, label: '120%' }, { value: 1.4, label: '140%' }], (v) => this.changeSettings({ textScale: v })),
      ),
    );
    this.show(el, back);
  }
}

const tipFor = (def: DayDef, result: ShiftOutcome): string => {
  if (def.redirect && result.moves < 10) {
    return 'Swipe more approaching vehicles out of long lines, before they join them. Each one you move also shortens the wait for everyone behind it.';
  }
  if (result.handled < result.emergencies) {
    return 'Tap warnings the moment they appear. A lane blocked for 18 minutes costs far more than one blocked for 4.';
  }
  return 'Watch which way the traffic leans at the start of each wave, and move your crews there early. A booth has to finish its line before its crew is free.';
};

/** The plaza running by itself behind the title. */
class Attract {
  private raf = 0;
  private last = 0;
  private sim!: Sim;
  private memory = newBotMemory();
  private readonly stage: Stage;
  private disposed = false;
  private seed = 77;
  private readonly observer: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, pictures: Pictures, private readonly still: boolean) {
    this.stage = new Stage(canvas, pictures, still);
    this.fresh();
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(canvas.parentElement as HTMLElement);
    this.layout();
    if (still) {
      for (let i = 0; i < 60 * 25; i += 1) {
        this.tick(STEP_S);
      }
      this.stage.draw(this.sim, 0.016);
      return;
    }
    for (let i = 0; i < 60 * 12; i += 1) {
      this.tick(STEP_S);
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private fresh(): void {
    const def = DAYS[2];
    this.sim = createSim(def, { seed: this.seed });
    this.memory = newBotMemory();
    this.seed += 1;
  }

  private layout(): void {
    this.stage.layout(this.sim.laneCount, 'SmartFlow', this.sim.lanes.map((lane) => lane.type));
    if (this.still) {
      this.stage.draw(this.sim, 0.016);
    }
  }

  private tick(dt: number): void {
    botAct(this.sim, SKILLS.good, this.memory, dt);
    step(this.sim, dt);
    if (this.sim.done) {
      this.fresh();
    }
  }

  private frame = (now: number): void => {
    if (this.disposed) {
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
    this.stage.draw(this.sim, dt);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
  }
}
