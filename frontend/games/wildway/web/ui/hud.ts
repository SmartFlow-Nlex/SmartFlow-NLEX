import { button, h, icon, ICONS, setText } from '../dom';
import type { Portraits, HeroId } from '../models';

/**
 * The exploration HUD: only the current objective, the prompt for what is in reach, the
 * team, and the guide arrow. Plus the speech line, which is always readable as subtitles.
 */

export const HERO_INFO: Record<HeroId, { name: string; role: string; can: string }> = {
  dayo: { name: 'Dayo', role: 'Field Guardian', can: 'Moves obstacles, climbs, and builds restoration gear.' },
  baging: { name: 'Baging', role: 'Rescue Partner', can: 'A vine sprite who stretches across gaps, reaches far things and carries two loads at once.' },
  sukat: { name: 'Sukat', role: 'Eco Analyst', can: 'A weather-station robot who scans from a safe distance, compares plans and fills the Atlas.' },
  awit: { name: 'Awit', role: 'Aerial Scout', can: 'Rides a kite to scout from above, and plays a bamboo flute for sound puzzles.' },
};

export interface HudHandlers {
  onPause: () => void;
  onHero: (id: HeroId) => void;
  onActionDown: () => void;
  onActionUp: () => void;
  onAbilityDown: () => void;
  onAbilityUp: () => void;
  onAtlas: () => void;
}

export class Hud {
  readonly el: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly guide: HTMLElement;
  private readonly guideArrow: HTMLElement;
  private readonly guideDist: HTMLElement;
  private readonly heroBtns = new Map<HeroId, HTMLButtonElement>();
  private readonly actionBtn: HTMLButtonElement;
  private readonly actionText: HTMLElement;
  private readonly actionFill: HTMLElement;
  private readonly abilityBtn: HTMLButtonElement;
  private readonly abilityFill: HTMLElement;
  private readonly noticeEl: HTMLElement;
  private readonly speech: HTMLElement;
  private speechShownAt = 0;
  private readonly speechImg: HTMLImageElement;
  private readonly speechName: HTMLElement;
  private readonly speechText: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private readonly live: HTMLElement;
  readonly stick: HTMLElement;
  readonly knob: HTMLElement;
  readonly surface: HTMLElement;
  private noticeLeft = 0;
  private resolveSpeech: (() => void) | null = null;
  autoAdvance = false;
  private lastAction = '';

  constructor(private readonly portraits: Portraits, handlers: HudHandlers) {
    this.surface = h('div', { class: 'touch-surface' });
    this.knob = h('div', { class: 'stick-knob' });
    this.stick = h('div', { class: 'stick', attrs: { 'aria-hidden': 'true' } }, this.knob);
    this.objective = h('div', { class: 'objective-text' });
    this.guideArrow = h('span', { class: 'guide-arrow', html: ICONS.next });
    this.guideDist = h('span', { class: 'guide-dist' });
    this.guide = h('div', { class: 'guide' }, this.guideArrow, this.guideDist);
    const top = h(
      'div',
      { class: 'hud-top' },
      h('button', { class: 'round-btn', label: 'Pause', attrs: { type: 'button' }, html: ICONS.pause, onClick: () => handlers.onPause() }),
      h('div', { class: 'objective' }, this.objective, this.guide),
      h('button', { class: 'round-btn', label: 'Open the Wildlife Atlas', attrs: { type: 'button' }, html: ICONS.book, onClick: () => handlers.onAtlas() }),
    );
    const team = h('div', { class: 'team', attrs: { role: 'group', 'aria-label': 'Choose a hero' } });
    for (const id of ['dayo', 'baging', 'sukat', 'awit'] as HeroId[]) {
      const b = h(
        'button',
        { class: 'hero-btn', label: `${HERO_INFO[id].name}, ${HERO_INFO[id].role}`, attrs: { type: 'button' }, onClick: () => handlers.onHero(id) },
        h('img', { attrs: { src: portraits[id] ?? '', alt: '' } }),
      );
      this.heroBtns.set(id, b);
      team.append(b);
    }
    this.actionText = h('span', { class: 'action-text' });
    this.actionFill = h('span', { class: 'action-fill' });
    this.actionBtn = h('button', { class: 'action-btn hidden', attrs: { type: 'button' } }, this.actionFill, this.actionText);
    const hold = (el: HTMLElement, down: () => void, up: () => void): void => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        down();
      });
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    hold(this.actionBtn, handlers.onActionDown, handlers.onActionUp);
    this.abilityFill = h('span', { class: 'ability-fill' });
    this.abilityBtn = h('button', { class: 'ability-btn hidden', label: 'Glide on the kite', attrs: { type: 'button' } }, this.abilityFill, h('span', { class: 'ability-text', text: 'Glide' }));
    hold(this.abilityBtn, handlers.onAbilityDown, handlers.onAbilityUp);
    this.noticeEl = h('div', { class: 'notice hidden' });
    this.speechImg = h('img', { class: 'speech-img', attrs: { alt: '' } });
    this.speechName = h('div', { class: 'speech-name' });
    this.speechText = h('div', { class: 'speech-text' });
    this.speech = h(
      'button',
      { class: 'speech hidden', attrs: { type: 'button' }, onClick: () => this.tapSpeech() },
      this.speechImg,
      h('span', { class: 'speech-body' }, this.speechName, this.speechText, h('span', { class: 'speech-tap', text: 'Tap to continue', attrs: { 'aria-hidden': 'true' } })),
    );
    this.bannerEl = h('div', { class: 'scene-banner hidden' });
    this.live = h('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });
    this.el = h(
      'div',
      { class: 'hud' },
      this.surface,
      this.stick,
      top,
      team,
      h('div', { class: 'hud-actions' }, this.abilityBtn, this.actionBtn),
      this.noticeEl,
      this.bannerEl,
      this.speech,
      this.live,
    );
  }

  setObjective(text: string): void {
    this.objective.classList.toggle('hidden', text === '');
    setText(this.objective, text);
    setText(this.live, text);
  }

  setGuide(angle: number | null, dist: number): void {
    this.guide.classList.toggle('hidden', angle === null);
    if (angle !== null) {
      this.guideArrow.style.transform = `rotate(${(angle - Math.PI / 2).toFixed(3)}rad)`;
      setText(this.guideDist, `${Math.max(1, Math.round(dist))} m`);
    }
  }

  setActive(id: HeroId): void {
    for (const [hero, b] of this.heroBtns) {
      b.classList.toggle('on', hero === id);
      b.setAttribute('aria-pressed', String(hero === id));
    }
  }

  /** What the big button does now. `suggest` means another hero is needed, and it says who. */
  setAction(label: string | null, progress: number, suggest: boolean): void {
    const shown = label !== null;
    this.actionBtn.classList.toggle('hidden', !shown);
    if (shown && this.lastAction !== label) {
      this.lastAction = label;
      setText(this.actionText, label);
      this.actionBtn.setAttribute('aria-label', label);
    }
    this.actionBtn.classList.toggle('suggest', suggest);
    this.actionFill.style.transform = `scaleX(${progress.toFixed(3)})`;
  }

  setAbility(visible: boolean, share: number): void {
    this.abilityBtn.classList.toggle('hidden', !visible);
    this.abilityFill.style.transform = `scaleY(${share.toFixed(3)})`;
  }

  notice(text: string, seconds = 2.6): void {
    setText(this.noticeEl, text);
    setText(this.live, text);
    this.noticeEl.classList.remove('hidden');
    this.noticeLeft = seconds;
  }

  tick(dt: number): void {
    if (this.noticeLeft > 0) {
      this.noticeLeft -= dt;
      if (this.noticeLeft <= 0) {
        this.noticeEl.classList.add('hidden');
      }
    }
  }

  banner(text: string | null): void {
    this.bannerEl.classList.toggle('hidden', text === null);
    if (text !== null) {
      setText(this.bannerEl, text);
    }
  }

  /** Shows a line, and resolves when it has been read. */
  /** The tap that started a line must not also skip it: its click lands here a moment later. */
  private tapSpeech(): void {
    if (performance.now() - this.speechShownAt > 280) {
      this.advanceSpeech();
    }
  }

  say(speaker: string, portrait: string, text: string): Promise<void> {
    this.speechShownAt = performance.now();
    setText(this.speechName, speaker);
    setText(this.speechText, text);
    setText(this.live, `${speaker}: ${text}`);
    if (portrait !== '') {
      this.speechImg.src = this.portraits[portrait] ?? '';
    }
    this.speechImg.classList.toggle('hidden', portrait === '');
    this.speech.classList.remove('hidden');
    this.setHudHidden(true);
    return new Promise((resolve) => {
      this.resolveSpeech = resolve;
      if (this.autoAdvance) {
        window.setTimeout(() => this.advanceSpeech(), 5);
      }
    });
  }

  advanceSpeech(): void {
    if (this.resolveSpeech !== null) {
      const done = this.resolveSpeech;
      this.resolveSpeech = null;
      this.speech.classList.add('hidden');
      done();
    }
  }

  get speaking(): boolean {
    return this.resolveSpeech !== null;
  }

  setHudHidden(hidden: boolean): void {
    this.el.classList.toggle('scene', hidden);
  }

  dispose(): void {
    this.el.remove();
  }
}

export const makeCardIcon = (name: keyof typeof ICONS): HTMLElement => icon(name, 'card-icon');
export const makeBtn = button;
