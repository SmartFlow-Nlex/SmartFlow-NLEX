import { CHARACTER_NAMES, isSidekickSpeaker, speakerName, type ShownLine } from '../../core/dialogue';
import type { MissionDef } from '../../core/missions';
import { HERO_DEFS, POWERUP_DEFS, SIDEKICK_DEFS } from '../../core/roster';
import type { SidekickState, SimState } from '../../core/sim';
import { isMachine, type CharacterId, type Expression, type HeroId, type PowerUpKind, type SidekickId, type SteeringMode } from '../../core/types';
import { blinkAt, drawCharacter } from '../art/cast';
import { drawPowerUp } from '../art/powerups';
import { drawSidekick } from '../art/sidekicks';
import { icon } from './arcadeIcons';
import { canvasEl, h } from './dom';
import { pickupIcon, portrait } from './icons';

/**
 * The driving HUD (Tollbound Heroes), in HTML over the canvas:
 *
 * - Top, compact: pause; one progress bar (the route, with the hero's face
 *   riding it; in the finale Barrikada's Jam meter, emptying as you win, with
 *   its phase marks and the phase number; in Endless the distance and the
 *   next checkpoint); one row of chips - the hero's condition as hearts,
 *   Kiko's engine in the convoy, Bolts, the Team Honk sparks, and round
 *   power-up badges whose ring drains with the time left.
 * - One message slot: an onboarding card before a run, else a radio line,
 *   else the goal with its icon and progress. Never two at once.
 * - Bottom: the drag pad (or lane buttons), the two sidekick medallions with
 *   their recharge ring and state in a word, and the hero's signature orb:
 *   Ready / On / Recharge / Unavailable by shape, word and colour together;
 *   it becomes TEAM HONK when the finale's charge is full.
 * - A short ribbon banner for boss phases; a cut-in when TEAM HONK fires.
 *
 * Text is only touched when it changes; white text always sits on navy.
 * Decorative motion is transform/opacity only, and none under reduced motion.
 */

export interface HudElements {
  root: HTMLElement;
  pause: HTMLButtonElement;
  pad: HTMLElement;
  left: HTMLButtonElement;
  right: HTMLButtonElement;
  ability: HTMLButtonElement | null;
}

export interface OnboardCard {
  speaker: CharacterId;
  expr: Expression;
  title: string;
  text: string;
  /** A small diagram drawn beside the text. */
  art?: (ctx: CanvasRenderingContext2D, w: number, hgt: number) => void;
}

export type AbilityLook = 'ready' | 'active' | 'cooldown' | 'off' | 'honk';

interface Badge {
  el: HTMLElement;
  ctx: CanvasRenderingContext2D;
  state: HTMLElement;
  ring: HTMLElement;
}

interface PowerBadge {
  el: HTMLElement;
  num: HTMLElement;
}

/** What a sidekick's badge says at the moment it acts (default: "Hit!"). */
const ACTION_WORD: Partial<Record<SidekickId, string>> = { silip: 'Jammed!', walis: 'Swept!', ilaw: 'Slow!', maso: 'Bonk!' };

/** Decorative pops are skipped under reduced motion (the body carries the setting). */
function calm(): boolean {
  return document.body.classList.contains('reduce-motion');
}

/** A quick scale pop (compositor-only). */
function pop(el: Element, size = 1.22): void {
  if (!calm() && typeof el.animate === 'function') {
    el.animate([{ transform: 'scale(1)' }, { transform: `scale(${size})` }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  }
}

export class Hud {
  readonly el: HudElements;
  private progressFill: HTMLElement;
  private progressBar: HTMLElement;
  private routeLeft: HTMLElement;
  private routeRight: HTMLElement;
  private marker: HTMLElement;
  private boltsText: HTMLElement;
  private boltsChip: HTMLElement;
  private heroChip: HTMLElement;
  private heroSegs: HTMLElement;
  private kikoChip: HTMLElement | null = null;
  private honkChip: HTMLElement;
  private powersEl: HTMLElement;
  private readonly powerBadges = new Map<PowerUpKind, PowerBadge>();
  private phaseChip: HTMLElement | null = null;
  private cutIn: HTMLElement;
  private cutInT = 0;
  private abilityCount: HTMLElement | null = null;
  private slot: HTMLElement;
  private radio: HTMLElement;
  private radioWho: HTMLElement;
  private radioLine: HTMLElement;
  private portraitCtx: CanvasRenderingContext2D;
  private objective: HTMLElement;
  private objectiveIcon: HTMLElement;
  private objectiveText: HTMLElement;
  private card: HTMLElement | null = null;
  private toastEl: HTMLElement;
  private countdownEl: HTMLElement;
  private bannerEl: HTMLElement;
  private badges: Badge[] = [];
  private abilityState: HTMLElement | null = null;
  private abilityGlyph: HTMLElement | null = null;
  private abilityName: HTMLElement | null = null;
  private last = new Map<string, string>();
  private toastT = 0;
  private goT = 0;
  private bannerT = 0;
  private badgeT = 0;
  private readonly portraitFrames = new Map<string, HTMLCanvasElement>();
  private readonly hero: HeroId;
  private readonly mission: MissionDef;

  constructor(mission: MissionDef, hero: HeroId, steering: SteeringMode, abilitySide: 'left' | 'right', onPause: () => void) {
    this.hero = hero;
    this.mission = mission;
    const heroDef = HERO_DEFS[hero];
    const pause = h('button', { class: 'icon-btn hud-pause', attrs: { 'aria-label': 'Pause' }, onClick: onPause }, [icon('pause')]);
    const finale = mission.kind === 'finale';
    const endless = mission.kind === 'endless';
    this.progressFill = h('div', { class: `bar-fill${finale ? ' jam' : ''}` });
    // The hero's own face rides the route bar (Kiko's just behind in the convoy).
    this.marker = h('div', { class: `bar-marker${mission.kind === 'convoy' ? ' convoy' : ''}${finale ? ' hidden' : ''}`, attrs: { 'aria-hidden': 'true' } }, [
      ...(mission.kind === 'convoy' ? [h('img', { class: 'dot kiko', attrs: { src: portrait('kiko', 20), alt: '' } })] : []),
      h('img', { class: 'dot navie', attrs: { src: portrait(hero, 24), alt: '' } }),
    ]);
    const ticks = finale ? [h('span', { class: 'bar-tick', attrs: { style: 'left:66%' } }), h('span', { class: 'bar-tick', attrs: { style: 'left:33%' } })] : [];
    this.routeLeft = h('span', { text: finale ? 'Jam meter' : endless ? 'Endless' : mission.from });
    this.routeRight = h('span', { text: finale ? 'reach 0% to win' : endless ? 'next checkpoint' : mission.to });
    if (finale) {
      this.phaseChip = h('span', { class: 'phase-chip', text: 'Phase 1' });
    }
    this.progressBar = h(
      'div',
      {
        class: `hud-progress${finale ? ' boss' : ''}${mission.kind === 'convoy' ? ' convoy' : ''}`,
        attrs: {
          role: 'progressbar',
          'aria-label': finale ? `${CHARACTER_NAMES[mission.machine ?? 'barrikada']}'s Jam meter: empty it to win` : endless ? 'Distance to the next checkpoint' : `Route, ${mission.from} to ${mission.to}`,
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-valuenow': finale ? '100' : '0',
        },
      },
      [
        finale ? h('img', { class: 'boss-face', attrs: { src: portrait(mission.machine ?? 'barrikada', 40), alt: '' } }) : null,
        h('div', { class: 'hud-progress-body' }, [
          h('div', { class: 'hud-route' }, [this.routeLeft, this.phaseChip, this.routeRight]),
          h('div', { class: 'bar' }, [this.progressFill, ...ticks, this.marker]),
        ]),
      ],
    );

    this.heroSegs = h('span', { class: 'cond-segs' });
    this.heroChip = h('div', { class: 'chip chip-hero' }, [h('img', { class: 'chip-face', attrs: { src: portrait(hero, 28), alt: '' } }), this.heroSegs]);
    if (mission.kind === 'convoy') {
      this.kikoChip = h('div', { class: 'chip chip-kiko' });
    }
    this.boltsText = h('span', { class: 'n', text: '0' });
    this.boltsChip = h('div', { class: 'chip chip-bolts', attrs: { role: 'img', 'aria-label': 'Bolts picked up: 0' } }, [
      h('img', { class: 'chip-icon', attrs: { src: pickupIcon('bolt', 26), alt: '' } }),
      this.boltsText,
    ]);
    this.honkChip = h('div', { class: 'chip chip-honk hidden' });
    this.powersEl = h('div', { class: 'hud-powers' });

    const { canvas, ctx } = canvasEl(44, 44, 'radio-portrait');
    this.portraitCtx = ctx;
    this.radioWho = h('div', { class: 'radio-who' });
    this.radioLine = h('div', { class: 'radio-line' });
    // The radio is visual; the same line goes to the screen-reader live region.
    this.radio = h('div', { class: 'radio hidden', attrs: { 'aria-hidden': 'true' } }, [canvas, h('div', { class: 'radio-text' }, [this.radioWho, this.radioLine])]);
    this.objectiveIcon = h('span', { class: 'objective-tag', text: 'Goal' });
    this.objectiveText = h('span', { class: 'objective-text' });
    // Not a live region: the Endless distance changes every metre. Goal changes are announced by the mission.
    this.objective = h('div', { class: 'objective hidden' }, [this.objectiveIcon, this.objectiveText]);
    this.slot = h('div', { class: 'hud-msg' }, [this.radio, this.objective]);
    this.toastEl = h('div', { class: 'toast', attrs: { role: 'status' } });
    this.countdownEl = h('div', { class: 'countdown', attrs: { 'aria-live': 'assertive' } });
    this.bannerEl = h('div', { class: 'phase-banner', attrs: { 'aria-live': 'assertive' } });

    const pad = h('div', { class: `pad${steering === 'drag' ? '' : ' hidden'}`, attrs: { 'aria-hidden': 'true' } }, [h('span', { class: 'pad-hint', text: 'Drag or tap to steer' })]);
    const left = h('button', { class: `lane-btn left${steering === 'lanes' ? '' : ' hidden'}`, attrs: { 'aria-label': 'One lane left', tabindex: '-1' } }, [icon('back', 'chev')]);
    const right = h('button', { class: `lane-btn right${steering === 'lanes' ? '' : ' hidden'}`, attrs: { 'aria-label': 'One lane right', tabindex: '-1' } }, [icon('back', 'chev flip')]);
    this.abilityState = h('span', { class: 'ability-state' });
    this.abilityGlyph = h('span', { class: 'ability-glyph', attrs: { 'aria-hidden': 'true' } });
    this.abilityName = h('span', { class: 'ability-name', text: heroDef.signature.name });
    this.abilityCount = h('span', { class: 'ability-count', attrs: { 'aria-hidden': 'true' } });
    // The button keeps its full square touch area; the round orb is drawn inside it.
    const ability = h('button', { class: `ability-btn ${abilitySide}`, attrs: { 'aria-label': heroDef.signature.name, tabindex: '-1' } }, [
      h('span', { class: 'ability-orb' }, [h('span', { class: 'ability-rays', attrs: { 'aria-hidden': 'true' } }), h('img', { class: 'ability-face', attrs: { src: portrait(hero, 44), alt: '' } }), this.abilityCount, this.abilityState]),
      this.abilityGlyph,
      this.abilityName,
    ]);
    const dock = h('div', { class: `sidekick-dock ${abilitySide === 'right' ? 'left' : 'right'}`, attrs: { role: 'group', 'aria-label': 'Sidekicks' } });
    const controls = h('div', { class: `controls ${abilitySide}-handed${steering === 'lanes' ? ' lanes-mode' : ''}` }, [pad, left, right, dock, ability]);
    this.cutIn = h('div', { class: 'honk-cutin', attrs: { 'aria-hidden': 'true' } });
    const root = h('div', { class: 'hud' }, [
      h('div', { class: 'hud-top' }, [pause, this.progressBar]),
      h('div', { class: 'hud-status' }, [this.heroChip, ...(this.kikoChip !== null ? [this.kikoChip] : []), this.boltsChip, this.honkChip, this.powersEl]),
      this.bannerEl,
      this.slot,
      this.toastEl,
      this.countdownEl,
      this.cutIn,
      controls,
    ]);
    this.el = { root, pause, pad, left, right, ability };
    this.dock = dock;
  }

  private dock: HTMLElement;

  /** Builds the two sidekick badges for the run's (fixed) team. */
  setSidekicks(sidekicks: readonly SidekickState[]): void {
    this.dock.replaceChildren();
    this.badges = [];
    for (const k of sidekicks) {
      const { canvas, ctx } = canvasEl(46, 46, 'badge-face');
      const ring = h('span', { class: 'badge-ring' });
      const state = h('span', { class: 'badge-state' });
      const name = k.evolved ? SIDEKICK_DEFS[k.id].evolvedName : SIDEKICK_DEFS[k.id].name;
      // A round medallion (face inside its recharge ring), the name, and the state on a pill.
      const el = h('div', { class: `sidekick-badge sk-${k.id}${k.evolved ? ' evolved' : ''}`, attrs: { role: 'img', 'aria-label': name } }, [
        h('span', { class: 'badge-medal' }, [ring, canvas]),
        state,
        h('span', { class: 'badge-name', text: name.split(' ')[0] }),
      ]);
      this.dock.append(el);
      this.badges.push({ el, ctx, state, ring });
    }
  }

  /** Where collected Bolts fly to (the counter's icon), in CSS px. */
  boltTarget(): { x: number; y: number } | null {
    const r = this.boltsChip.querySelector('.chip-icon')?.getBoundingClientRect();
    return r === undefined || r.width === 0 ? null : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /**
   * TEAM HONK fires: a short cut-in sweeping across the screen - the hero and
   * both sidekicks over sun rays and the call itself. Decoration only (never
   * blocks a touch); a plain fade under reduced motion.
   */
  honkCutIn(hero: HeroId, sidekicks: readonly SidekickState[]): void {
    const faces = [
      h('img', { class: 'cutin-hero', attrs: { src: portrait(hero, 96), alt: '' } }),
      ...sidekicks.map((k) => {
        const { canvas, ctx } = canvasEl(56, 56, 'cutin-mate');
        ctx.translate(28, 60);
        ctx.scale(0.3, 0.3);
        drawSidekick(ctx, k.id, { expr: 'celebrate', t: 0, blink: 0, talk: 0, lookX: 0, evolved: k.evolved, action: 1 });
        return canvas;
      }),
    ];
    this.cutIn.replaceChildren(
      h('span', { class: 'cutin-rays' }),
      h('div', { class: 'cutin-band' }, [h('div', { class: 'cutin-team' }, faces), h('strong', { class: 'cutin-text', text: 'TEAM HONK!' })]),
    );
    this.cutIn.classList.remove('show');
    void this.cutIn.offsetWidth;
    this.cutIn.classList.add('show');
    this.cutInT = 1.5;
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.last.get(key) !== value) {
      this.last.set(key, value);
      apply();
    }
  }

  /**
   * The lowest point the top bands can reach while driving, CSS px: the
   * message slot at its largest (a two-line radio line), so the camera's
   * horizon does not jump when a line appears. In landscape the slot sits
   * beside the road and only the top bar counts.
   */
  reservedTop(): number {
    const slot = this.slot;
    if (getComputedStyle(slot).position === 'fixed') {
      const status = this.el.root.querySelector<HTMLElement>('.hud-status');
      return status !== null ? status.getBoundingClientRect().bottom : 0;
    }
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const radio = Math.max(44 + 0.6 * rem, rem * (0.78 * 1.2 + 2 * 0.9 * 1.25 + 0.6));
    return slot.getBoundingClientRect().top + radio;
  }

  /** Height of the bottom controls from the screen's bottom edge (CSS px), for the camera fit. */
  reservedBottom(): number {
    const tops = Array.from(this.el.root.querySelectorAll<HTMLElement>('.sidekick-dock, .ability-btn, .lane-btn'))
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .map((r) => r.top);
    return tops.length === 0 ? 0 : Math.max(0, window.innerHeight - Math.min(...tops));
  }

  /**
   * Toasts sit just below the hero's wheels, above the controls; where that gap is too small
   * (short screens, lane buttons, big text) they go just above the hero's roof instead - never on it.
   */
  placeToast(cam: { playerY: number; lane0: number; landscape: boolean }): void {
    if (cam.landscape) {
      this.toastEl.style.removeProperty('top');
      this.toastEl.style.removeProperty('bottom');
      return;
    }
    const controlsTop = window.innerHeight - this.reservedBottom();
    const below = cam.playerY + 6;
    const toastH = Math.max(34, this.toastEl.getBoundingClientRect().height);
    const top = below + toastH <= controlsTop - 4 ? below : cam.playerY - cam.lane0 * 0.85 - toastH - 6;
    this.toastEl.style.top = `${Math.round(top)}px`;
    this.toastEl.style.bottom = 'auto';
  }

  setObjective(text: string, icon = 'Goal'): void {
    this.set('objective', `${icon}|${text}`, () => {
      this.objectiveText.textContent = text;
      this.objectiveIcon.textContent = icon;
    });
  }

  /** Brief feedback, shown just above the controls - never over the road ahead. */
  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastT = 1.6;
  }

  /** A short banner (boss phases) in the radio's place, so the boss stays in view; clears itself. */
  banner(title: string, sub: string, tone: 'phase' | 'gold' = 'phase'): void {
    // "Phase 2 · Barrier Sweep" reads as a numbered badge and a title on the ribbon.
    const phase = /^Phase (\d) · (.+)$/.exec(title);
    const parts = [h('strong', { text: phase !== null ? phase[2] : title }), h('span', { text: sub })];
    if (phase !== null) {
      parts.unshift(h('em', { class: 'banner-badge', text: `Phase ${phase[1]}` }));
    }
    this.bannerEl.replaceChildren(...parts);
    this.bannerEl.classList.toggle('gold', tone === 'gold');
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    this.el.root.classList.add('bannering');
    this.bannerT = 2.2;
  }

  countdown(text: string): void {
    this.set('countdown', text, () => {
      this.countdownEl.textContent = text;
      this.countdownEl.classList.toggle('show', text !== '');
      this.countdownEl.classList.toggle('go', text === 'Go!');
      if (text !== '') {
        pop(this.countdownEl, 1.35);
      }
    });
  }

  /** The start call: "Go!" for half a second, then the road is clear. */
  go(): void {
    this.countdown('Go!');
    this.goT = 0.6;
  }

  /** Briefly brightens the progress bar (a hit on the machine). */
  pulseBar(): void {
    this.progressBar.classList.remove('hit');
    void this.progressBar.offsetWidth;
    this.progressBar.classList.add('hit');
  }

  get showingCards(): boolean {
    return this.card !== null;
  }

  /**
   * Player-paced onboarding in the message slot: one card at a time, Next
   * (or Enter / Space) to continue, Skip to start straight away. Calls
   * `onDone` once.
   */
  showCards(cards: OnboardCard[], onDone: () => void): void {
    let index = 0;
    let done = false;
    const finish = (): void => {
      if (done) {
        return;
      }
      done = true;
      window.removeEventListener('keydown', onKey, true);
      this.card?.remove();
      this.card = null;
      onDone();
    };
    const render = (): void => {
      const c = cards[index];
      const { canvas, ctx } = canvasEl(56, 56, 'card-portrait');
      drawCharacter(ctx, c.speaker, 28, isMachine(c.speaker) ? 80 : 76, isMachine(c.speaker) ? 46 : 78, {
        expr: c.expr,
        anim: { t: 0, blink: 0, talk: 0, lookX: 0, lookY: 0 },
        shadow: false,
      });
      const dots = h('div', { class: 'card-dots', attrs: { 'aria-hidden': 'true' } }, cards.map((_, i) => h('span', { class: `card-dot${i === index ? ' on' : ''}` })));
      const last = index === cards.length - 1;
      const next = h('button', { class: 'btn primary card-next', text: last ? "Let's go!" : 'Next', onClick: () => advance() });
      const skip = h('button', { class: 'btn ghost card-skip', text: 'Skip', onClick: () => finish() });
      const body: HTMLElement[] = [h('div', { class: 'card-who', text: CHARACTER_NAMES[c.speaker] }), h('div', { class: 'card-title', text: c.title }), h('p', { class: 'card-text', text: c.text })];
      const row: HTMLElement[] = [canvas, h('div', { class: 'card-body' }, body)];
      if (c.art !== undefined) {
        const art = canvasEl(120, 96, 'card-art');
        c.art(art.ctx, 120, 96);
        row.push(art.canvas);
      }
      const el = h('div', { class: 'onboard', attrs: { role: 'dialog', 'aria-label': `${c.title}, ${index + 1} of ${cards.length}` } }, [
        h('div', { class: 'card-row' }, row),
        h('div', { class: 'card-actions' }, [dots, h('div', { class: 'card-buttons' }, last ? [next] : [skip, next])]),
      ]);
      this.card?.remove();
      this.card = el;
      this.slot.append(el);
      next.focus();
    };
    const advance = (): void => {
      if (index >= cards.length - 1) {
        finish();
        return;
      }
      index += 1;
      render();
    };
    const onKey = (e: KeyboardEvent): void => {
      // Only while the card has focus (not under the pause menu).
      if (this.card === null || !this.card.contains(document.activeElement)) {
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        advance();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish();
      }
    };
    window.addEventListener('keydown', onKey, true);
    render();
  }

  update(s: SimState, progress: number, radio: ShownLine | null, abilityReady: boolean, abilityMode: 'signature' | 'honk', t: number, dt: number): void {
    const pct = Math.round(progress * 100);
    this.set('progress', String(pct), () => {
      this.progressFill.style.width = `${pct}%`;
      this.marker.style.left = `${pct}%`;
      this.progressBar.setAttribute('aria-valuenow', String(pct));
    });
    if (s.boss !== null) {
      this.set('jamLabel', String(Math.ceil(s.boss.jam)), () => {
        this.routeLeft.textContent = `Jam ${Math.ceil(s.boss!.jam)}%`;
        this.progressBar.setAttribute('aria-valuetext', `Jam ${Math.ceil(s.boss!.jam)}% left`);
      });
      const phase = s.boss.phase;
      this.set('phase', String(phase), () => {
        if (this.phaseChip !== null) {
          this.phaseChip.textContent = `Phase ${phase}`;
          this.phaseChip.className = `phase-chip p${phase}`;
          pop(this.phaseChip, 1.3);
        }
      });
    } else if (this.mission.kind === 'endless') {
      this.set('endless', String(Math.floor(s.route / 10)), () => {
        this.routeLeft.textContent = `Endless · ${Math.floor(s.route)} m`;
      });
    }
    this.set('bolts', String(s.boltsCollected), () => {
      this.boltsText.textContent = String(s.boltsCollected);
      this.boltsChip.setAttribute('aria-label', `Bolts picked up: ${s.boltsCollected}`);
      if (s.boltsCollected > 0) {
        pop(this.boltsChip, 1.14);
      }
    });

    // The hero's condition: hearts that crack and empty with each dent, named in words.
    const p = s.player;
    this.set('hero', `${p.dents}/${p.maxDents}`, () => {
      const name = HERO_DEFS[this.hero].name;
      if (p.maxDents === null) {
        this.heroSegs.replaceChildren(h('span', { class: 'chip-note', text: p.dents === 0 ? 'no dents' : `${p.dents} dent${p.dents === 1 ? '' : 's'}` }));
        this.heroChip.setAttribute('aria-label', `${name}: ${p.dents} dents. Story mode never fails.`);
      } else {
        const left = p.maxDents - p.dents;
        const segs: HTMLElement[] = [];
        for (let i = 0; i < p.maxDents; i += 1) {
          segs.push(h('span', { class: `pip-heart${i < left ? ' on' : ' lost'}` }, [icon('heart')]));
        }
        const shown = this.heroSegs.childElementCount > 0;
        const before = this.heroSegs.querySelectorAll('.pip-heart.on').length;
        this.heroSegs.replaceChildren(...segs);
        // The heart just lost (or won back) pops.
        const changed = segs[left < before ? left : left - 1];
        if (shown && before !== left && changed !== undefined) {
          pop(changed, 1.5);
        }
        this.heroChip.setAttribute('aria-label', `${name}'s condition: ${left} of ${p.maxDents} left`);
        this.heroChip.classList.toggle('warn', left === 1);
      }
    });

    // Kiko's engine (the convoy's escort).
    const k = s.kiko;
    if (this.kikoChip !== null && k !== null) {
      this.set('kiko', `${k.engine}/${k.maxEngine}`, () => {
        const parts: HTMLElement[] = [h('img', { class: 'chip-face', attrs: { src: portrait('kiko', 28), alt: '' } })];
        if (k.maxEngine === null) {
          parts.push(h('span', { class: 'chip-note', text: 'engine OK' }));
          this.kikoChip!.setAttribute('aria-label', "Kiko's engine: Story mode, it never gives out");
        } else {
          const segs = h('span', { class: 'cond-segs' });
          for (let i = 0; i < k.maxEngine; i += 1) {
            segs.append(h('span', { class: `pip-engine${i < k.engine ? ' on' : ' lost'}` }, [icon('engine')]));
          }
          parts.push(segs);
          this.kikoChip!.setAttribute('aria-label', `Kiko's engine: ${k.engine} of ${k.maxEngine}`);
          this.kikoChip!.classList.toggle('warn', k.engine === 1);
        }
        this.kikoChip!.replaceChildren(...parts);
      });
    }

    // Team Honk charge (finale phase 3).
    const sparks = s.boss !== null && s.boss.phase === 3 ? s.boss.sparks : -1;
    this.set('honk', String(sparks), () => {
      this.honkChip.classList.toggle('hidden', sparks < 0);
      if (sparks >= 0) {
        const pips = h('span', { class: 'pips' });
        for (let i = 0; i < 3; i += 1) {
          pips.append(h('img', { class: `spark-pip${i < sparks ? ' on' : ''}`, attrs: { src: pickupIcon('spark', 24), alt: '' } }));
        }
        this.honkChip.replaceChildren(h('span', { class: 'chip-label', text: 'Honk' }), pips);
        this.honkChip.setAttribute('aria-label', `Team Honk charge: ${sparks} of 3 signal sparks`);
        this.honkChip.classList.toggle('full', sparks >= 3);
        if (sparks > 0) {
          pop(pips.children[sparks - 1], 1.6);
        }
      }
    });

    // Power-ups: a round badge each, its ring draining with the time left, the seconds on a tab.
    for (const kind of Object.keys(s.powers) as PowerUpKind[]) {
      const power = s.powers[kind]!;
      let badge = this.powerBadges.get(kind);
      if (badge === undefined) {
        const { canvas, ctx } = canvasEl(26, 26, 'power-icon');
        ctx.translate(13, 13);
        ctx.scale(0.16, 0.16);
        drawPowerUp(ctx, kind, 0);
        const num = h('span', { class: 'n' });
        badge = { el: h('div', { class: `chip chip-power pw-${kind}`, attrs: { role: 'img' } }, [canvas, num]), num };
        this.powerBadges.set(kind, badge);
        this.powersEl.append(badge.el);
        pop(badge.el, 1.3);
      }
      const secs = Math.ceil(power.left);
      const b = badge;
      this.set(`power-${kind}`, String(secs), () => {
        b.num.textContent = `${secs}s`;
        b.el.setAttribute('aria-label', `${POWERUP_DEFS[kind].name}: ${secs} seconds left`);
        b.el.classList.toggle('ending', secs <= 2);
      });
      const deg = Math.round(Math.max(0, Math.min(1, power.left / Math.max(0.1, power.total))) * 36) * 10;
      this.set(`powerRing-${kind}`, String(deg), () => b.el.style.setProperty('--deg', `${deg}deg`));
    }
    for (const [kind, badge] of this.powerBadges) {
      if (s.powers[kind] === undefined) {
        badge.el.remove();
        this.powerBadges.delete(kind);
        this.last.delete(`power-${kind}`);
        this.last.delete(`powerRing-${kind}`);
      }
    }

    // The message slot: onboarding card, else the radio, else the goal.
    const mode = this.card !== null ? 'card' : radio !== null ? 'radio' : this.objectiveText.textContent ? 'objective' : 'none';
    this.set('slot', mode, () => {
      this.radio.classList.toggle('hidden', mode !== 'radio');
      this.objective.classList.toggle('hidden', mode !== 'objective');
    });
    this.set('radio', radio === null ? '' : `${radio.speaker}|${radio.text}`, () => {
      if (radio !== null) {
        this.radioWho.textContent = speakerName(radio.speaker);
        // Each character's own colour, as in the garage bubbles (sidekicks share the radio grey).
        this.radioWho.className = `radio-who who-${isSidekickSpeaker(radio.speaker) ? 'radio' : radio.speaker}`;
        this.radioLine.textContent = radio.text;
      }
    });
    if (radio !== null && mode === 'radio') {
      // Frames are cached by face (expression, eyes open/shut, mouth in three steps), then only copied.
      const talking = radio.left > 0.4 ? 0.5 + 0.5 * Math.sin(t * 18) : 0;
      const talk = talking > 0.66 ? 1 : talking > 0.2 ? 0.5 : 0;
      const sidekick = isSidekickSpeaker(radio.speaker);
      const blink = blinkAt(t, sidekick ? 3 : radio.speaker.length) > 0.5 ? 1 : 0;
      const expr = radio.expr === 'idle' ? 'speaking' : radio.expr;
      const evolved = sidekick && (s.sidekicks.find((m) => m.id === radio.speaker)?.evolved ?? false);
      const key = `${radio.speaker}|${expr}|${blink}|${talk}|${evolved}`;
      this.set('portrait', key, () => {
        const ctx = this.portraitCtx;
        let frame = this.portraitFrames.get(key);
        if (frame === undefined) {
          if (this.portraitFrames.size > 80) {
            this.portraitFrames.clear();
          }
          frame = document.createElement('canvas');
          frame.width = ctx.canvas.width;
          frame.height = ctx.canvas.height;
          const f = frame.getContext('2d')!;
          f.setTransform(ctx.getTransform());
          if (sidekick) {
            f.translate(22, 44);
            f.scale(0.24, 0.24);
            drawSidekick(f, radio.speaker as SidekickId, { expr, t: 0, blink, talk, lookX: 0, evolved, action: 0 });
          } else {
            // Frame the face: the machine's face is its lens, high on a wide body.
            const big = isMachine(radio.speaker);
            drawCharacter(f, radio.speaker as CharacterId, 22, big ? 62 : 60, big ? 37 : 61, {
              expr,
              anim: { t: 0, blink, talk, lookX: 0, lookY: 0 },
              shadow: false,
            });
          }
          this.portraitFrames.set(key, frame);
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.drawImage(frame, 0, 0);
        ctx.restore();
      });
    }

    this.updateSidekickBadges(s, t, dt);
    this.updateAbility(s, abilityReady, abilityMode);

    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) {
        this.toastEl.classList.remove('show');
      }
    }
    if (this.goT > 0) {
      this.goT -= dt;
      if (this.goT <= 0) {
        this.countdown('');
      }
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) {
        this.bannerEl.classList.remove('show');
        this.el.root.classList.remove('bannering');
      }
    }
    if (this.cutInT > 0) {
      this.cutInT -= dt;
      if (this.cutInT <= 0) {
        this.cutIn.classList.remove('show');
        this.cutIn.replaceChildren();
      }
    }
  }

  /** Each badge: the sidekick's face (its mood), a ring for its recharge, and its state in a word. */
  private updateSidekickBadges(s: SimState, t: number, dt: number): void {
    this.badgeT -= dt;
    const redraw = this.badgeT <= 0;
    if (redraw) {
      this.badgeT = 1 / 15;
    }
    s.sidekicks.forEach((k, i) => {
      const badge = this.badges[i];
      if (badge === undefined) {
        return;
      }
      const stats = k.stats;
      let label: string;
      let share = 1;
      switch (k.id) {
        case 'mila':
          label = s.powers.magnet !== undefined ? 'Mega pull' : 'Pulling';
          break;
        case 'barya':
          label = 'Counting';
          break;
        case 'tala':
          label = s.player.cooldown > 0 ? 'Charging' : 'Glowing';
          break;
        case 'kumpuni':
          label = k.uses >= stats.count ? 'Used up' : s.player.dents > 0 && k.cooldown <= 0 ? 'Fixing' : k.cooldown > 0 ? `${Math.ceil(k.cooldown)} s` : `${stats.count - k.uses} fix`;
          share = k.uses >= stats.count ? 0 : stats.cooldown > 0 ? 1 - k.cooldown / stats.cooldown : 1;
          break;
        case 'bantay':
          label = k.charged ? 'Guarding' : `${Math.ceil(Math.max(0, k.cooldown))} s`;
          share = k.charged ? 1 : 1 - Math.max(0, k.cooldown) / stats.cooldown;
          break;
        default:
          label = k.action > 0.6 ? ACTION_WORD[k.id] ?? 'Hit!' : k.cooldown > 0.35 ? 'Reload' : 'Ready';
          share = stats.cooldown > 0 ? 1 - Math.max(0, k.cooldown) / stats.cooldown : 1;
      }
      this.set(`badge${i}`, label, () => {
        badge.state.textContent = label;
        badge.el.setAttribute('aria-label', `${k.evolved ? SIDEKICK_DEFS[k.id].evolvedName : SIDEKICK_DEFS[k.id].name}: ${label}`);
        badge.el.classList.toggle('off', label === 'Used up');
      });
      // In twelve clock-like steps: a conic ring repaints on every change, and Pip recharges about once a second.
      const deg = Math.round(Math.max(0, Math.min(1, share)) * 12) * 30;
      this.set(`ring${i}`, String(deg), () => badge.ring.style.setProperty('--deg', `${deg}deg`));
      // Redrawn only when the face changes (mood, blink, action in steps): the art is too heavy for every frame.
      const blink = blinkAt(t, 5 + i);
      const b = blink > 0.66 ? 1 : blink > 0.2 ? 0.5 : 0;
      const a = k.action > 0.66 ? 1 : k.action > 0.2 ? 0.5 : 0;
      if (redraw) {
        this.set(`face${i}`, `${k.mood}|${b}|${a}|${k.evolved}`, () => {
          const ctx = badge.ctx;
          ctx.clearRect(0, 0, 46, 46);
          ctx.save();
          ctx.translate(23, 49 - a * 3);
          ctx.scale(0.24, 0.24);
          drawSidekick(ctx, k.id, { expr: k.mood, t: 0, blink: b, talk: 0, lookX: 0, evolved: k.evolved, action: a });
          ctx.restore();
        });
      }
    });
  }

  /**
   * Five states, each by shape, word and colour together: Ready (full yellow
   * ring, "Ready - tap"), On (blue, seconds left draining), Recharge (grey ring
   * filling, seconds to go), Unavailable (dimmed, dashed) and TEAM HONK
   * (orange, big, pulsing) when the finale's charge is full.
   */
  private updateAbility(s: SimState, ready: boolean, mode: 'signature' | 'honk'): void {
    if (this.el.ability === null) {
      return;
    }
    const p = s.player;
    const name = HERO_DEFS[this.hero].signature.name;
    let look: AbilityLook;
    let label: string;
    let share: number;
    if (mode === 'honk') {
      look = 'honk';
      label = 'Press!';
      share = 1;
    } else if (p.signature > 0) {
      look = 'active';
      label = `On · ${Math.ceil(p.signature)} s`;
      share = p.signature / p.signatureMax;
    } else if (ready) {
      look = 'ready';
      label = 'Ready · tap';
      share = 1;
    } else if (s.ending !== null || s.rescue !== null || s.boss?.stage === 'honk' || s.boss?.stage === 'down') {
      look = 'off';
      label = 'Not now';
      share = 0;
    } else {
      look = 'cooldown';
      label = `Recharge ${Math.ceil(p.cooldown)} s`;
      share = 1 - p.cooldown / p.cooldownMax;
    }
    this.set('ability', `${look}|${label}`, () => {
      const btn = this.el.ability!;
      const was = btn.classList.contains('is-ready') || btn.classList.contains('is-honk');
      btn.classList.remove('is-ready', 'is-active', 'is-cooldown', 'is-off', 'is-honk');
      btn.classList.add(`is-${look}`);
      this.abilityName!.textContent = look === 'honk' ? 'TEAM HONK' : name;
      // While it counts (recharging or on), the seconds are the big number on the orb; the word stays under it.
      const counting = look === 'cooldown' || look === 'active';
      this.abilityCount!.textContent = counting ? String(Math.ceil(look === 'active' ? p.signature : p.cooldown)) : '';
      this.abilityState!.textContent = look === 'cooldown' ? 'Recharge' : look === 'active' ? 'On' : label;
      this.abilityGlyph!.textContent = look === 'active' ? 'ON' : look === 'off' ? '–' : '';
      btn.setAttribute('aria-label', look === 'honk' ? 'Team Honk: charged, press it' : `${name}: ${label}`);
      // Just charged: the orb pops once.
      if (!was && (look === 'ready' || look === 'honk')) {
        pop(btn.querySelector('.ability-orb')!, 1.12);
      }
    });
    const deg = Math.round(Math.max(0, Math.min(1, share)) * 36) * 10;
    this.set('ring', String(deg), () => {
      this.el.ability!.style.setProperty('--deg', `${deg}deg`);
    });
  }
}
