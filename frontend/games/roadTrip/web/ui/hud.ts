import { CHARACTER_NAMES, isSidekickSpeaker, speakerName, type ShownLine } from '../../core/dialogue';
import type { MissionDef } from '../../core/missions';
import { HERO_DEFS, POWERUP_DEFS, SIDEKICK_DEFS } from '../../core/roster';
import type { SidekickState, SimState } from '../../core/sim';
import { isMachine, type CharacterId, type Expression, type HeroId, type PowerUpKind, type SidekickId, type SteeringMode } from '../../core/types';
import { art, drawCharacter, drawSidekick, portraitEl } from '../art/clay';
import { icon } from './arcadeIcons';
import { markIcon, signatureIcon } from './clayIcons';
import { canvasEl, h } from './dom';

/**
 * The driving HUD, in HTML over the canvas. The road is the point: what you need
 * is in two thin rows at the top, a small status strip and one button at the bottom.
 *
 * - Top row: pause; where you are (from, to, a thin bar with your hero on it, or
 *   the machine's Jam meter); your Bolts.
 * - Second row: health as hearts; the goal as a small chip with its count.
 * - A brief callout for what people say, one or two lines, gone in a moment.
 * - Bottom: the sidekicks' status tiles (they act by themselves, so they are not
 *   buttons) and the hero's signature: its own icon, a ring for the recharge.
 * - The steering hint only shows until you have steered.
 *
 * Ready, assisting and recovering differ by shape and motion as well as colour.
 * Text is touched only when it changes; motion is transform/opacity only.
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

interface Badge {
  el: HTMLElement;
  ring: HTMLElement;
  mark: HTMLElement;
  kind: 'status' | 'acts';
}

interface PowerBadge {
  el: HTMLElement;
  num: HTMLElement;
}

/** Decorative pops are skipped under reduced motion (the body carries the setting). */
function calm(): boolean {
  return document.body.classList.contains('reduce-motion');
}

function pop(el: Element, size = 1.22): void {
  if (!calm() && typeof el.animate === 'function') {
    el.animate([{ transform: 'scale(1)' }, { transform: `scale(${size})` }, { transform: 'scale(1)' }], { duration: 240, easing: 'ease-out' });
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
  private callout: HTMLElement;
  private calloutFace: HTMLCanvasElement;
  private calloutCtx: CanvasRenderingContext2D;
  private calloutLine: HTMLElement;
  private goal: HTMLElement;
  private goalTag: HTMLElement;
  private goalText: HTMLElement;
  private weather: HTMLElement;
  private meter: HTMLElement;
  private card: HTMLElement | null = null;
  private toastEl: HTMLElement;
  private countdownEl: HTMLElement;
  private bannerEl: HTMLElement;
  private padHint: HTMLElement;
  private badges: Badge[] = [];
  private abilityCount: HTMLElement;
  private readonly slot: HTMLElement;
  private last = new Map<string, string>();
  private toastT = 0;
  private goT = 0;
  private bannerT = 0;
  private readonly hero: HeroId;
  private readonly mission: MissionDef;
  private readonly dock: HTMLElement;
  /** The hint goes away for good once the player has steered. */
  private steered = false;

  constructor(mission: MissionDef, hero: HeroId, steering: SteeringMode, abilitySide: 'left' | 'right', onPause: () => void) {
    this.hero = hero;
    this.mission = mission;
    const heroDef = HERO_DEFS[hero];
    const pause = h('button', { class: 'icon-btn hud-pause', attrs: { 'aria-label': 'Pause' }, onClick: onPause }, [icon('pause')]);
    const finale = mission.kind === 'finale';
    const endless = mission.kind === 'endless';
    this.progressFill = h('div', { class: `tb-fill${finale ? ' jam' : ''}` });
    this.marker = h('div', { class: `tb-marker${finale ? ' hidden' : ''}`, attrs: { 'aria-hidden': 'true' } }, [portraitEl('tb-marker-face', hero, 18, 'character', { crop: true })]);
    const ticks = finale ? [h('span', { class: 'tb-tick', attrs: { style: 'left:66%' } }), h('span', { class: 'tb-tick', attrs: { style: 'left:33%' } })] : [];
    this.routeLeft = h('span', { class: 'tb-from', text: finale ? 'Jam' : endless ? 'Endless' : mission.from });
    this.routeRight = h('span', { class: 'tb-to', text: finale ? 'to 0%' : endless ? 'next stop' : mission.to });
    if (finale) {
      this.phaseChip = h('span', { class: 'tb-phase', text: 'Phase 1' });
    }
    this.progressBar = h(
      'div',
      {
        class: `tb-route${finale ? ' boss' : ''}`,
        attrs: {
          role: 'progressbar',
          'aria-label': finale ? `${CHARACTER_NAMES[mission.machine ?? 'barrikada']}'s Jam meter: empty it to win` : endless ? 'Distance to the next checkpoint' : `Route, ${mission.from} to ${mission.to}`,
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-valuenow': finale ? '100' : '0',
        },
      },
      [
        h('div', { class: 'tb-names' }, [this.routeLeft, this.phaseChip, this.routeRight]),
        h('div', { class: 'tb-bar' }, [this.progressFill, ...ticks, this.marker]),
      ],
    );

    this.boltsText = h('span', { class: 'n', text: '0' });
    const nut = document.createElement('canvas');
    nut.className = 'tb-nut';
    nut.width = 48;
    nut.height = 48;
    nut.setAttribute('aria-hidden', 'true');
    const drawNut = (): void => {
      const s = art('p.bolt0');
      if (s === null) {
        setTimeout(drawNut, 80);
        return;
      }
      const c = nut.getContext('2d')!;
      const k = 44 / Math.max(s.w, s.h);
      c.drawImage(s.img, 24 - (s.w * k) / 2, 24 - (s.h * k) / 2, s.w * k, s.h * k);
    };
    drawNut();
    this.boltsChip = h('div', { class: 'tb-bolts', attrs: { role: 'img', 'aria-label': 'Bolts picked up: 0' } }, [nut, this.boltsText]);

    this.heroSegs = h('span', { class: 'tb-hearts' });
    this.heroChip = h('div', { class: 'tb-health' }, [this.heroSegs]);
    if (mission.kind === 'convoy') {
      this.kikoChip = h('div', { class: 'tb-health tb-kiko' });
    }
    this.honkChip = h('div', { class: 'tb-honk hidden' });
    this.powersEl = h('div', { class: 'tb-powers' });
    this.goalTag = h('span', { class: 'tb-goal-tag', text: 'Goal' });
    this.goalText = h('span', { class: 'tb-goal-text' });
    // Not a live region: the Endless distance changes every metre. Goal changes are announced by the mission.
    this.goal = h('div', { class: 'tb-goal hidden' }, [this.goalTag, this.goalText]);
    this.weather = h('div', { class: 'tb-weather hidden', attrs: { role: 'status' } });
    this.meter = h('div', { class: 'tb-meter hidden', attrs: { role: 'img' } });

    const { canvas, ctx } = canvasEl(30, 30, 'tb-callout-face');
    this.calloutFace = canvas;
    this.calloutCtx = ctx;
    this.calloutLine = h('span', { class: 'tb-callout-line' });
    // Visual; the same line goes to the screen-reader live region.
    this.callout = h('div', { class: 'tb-callout hidden', attrs: { 'aria-hidden': 'true' } }, [this.calloutFace, this.calloutLine]);
    this.slot = h('div', { class: 'hud-msg' }, [this.callout]);
    this.toastEl = h('div', { class: 'toast', attrs: { role: 'status' } });
    this.countdownEl = h('div', { class: 'countdown', attrs: { 'aria-live': 'assertive' } });
    this.bannerEl = h('div', { class: 'phase-banner', attrs: { 'aria-live': 'assertive' } });

    this.padHint = h('span', { class: 'pad-hint hidden', text: 'Drag or tap here to steer' });
    const pad = h('div', { class: `pad${steering === 'drag' ? '' : ' hidden'}`, attrs: { 'aria-hidden': 'true' } }, [this.padHint]);
    const left = h('button', { class: `lane-btn left${steering === 'lanes' ? '' : ' hidden'}`, attrs: { 'aria-label': 'One lane left', tabindex: '-1' } }, [icon('back', 'chev')]);
    const right = h('button', { class: `lane-btn right${steering === 'lanes' ? '' : ' hidden'}`, attrs: { 'aria-label': 'One lane right', tabindex: '-1' } }, [icon('back', 'chev flip')]);
    this.abilityCount = h('span', { class: 'tb-sig-count', attrs: { 'aria-hidden': 'true' } });
    // The button keeps a full square touch area; the round face is drawn inside it.
    const ability = h('button', { class: `tb-sig ${abilitySide}`, attrs: { 'aria-label': heroDef.signature.name, tabindex: '-1' } }, [
      h('span', { class: 'tb-sig-ring', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'tb-sig-face' }, [signatureIcon(hero), this.abilityCount]),
    ]);
    this.dock = h('div', { class: `tb-dock ${abilitySide === 'right' ? 'left' : 'right'}`, attrs: { role: 'group', 'aria-label': 'Sidekicks' } });
    const controls = h('div', { class: `controls ${abilitySide}-handed${steering === 'lanes' ? ' lanes-mode' : ''}` }, [pad, left, right, this.dock, ability]);
    this.cutIn = h('div', { class: 'honk-cutin', attrs: { 'aria-hidden': 'true' } });
    const root = h('div', { class: 'hud' }, [
      h('div', { class: 'tb-top' }, [pause, this.progressBar, this.boltsChip]),
      h('div', { class: 'tb-sub' }, [this.heroChip, ...(this.kikoChip !== null ? [this.kikoChip] : []), this.honkChip, this.meter, this.weather, this.powersEl, this.goal]),
      this.bannerEl,
      this.slot,
      this.toastEl,
      this.countdownEl,
      this.cutIn,
      controls,
    ]);
    this.el = { root, pause, pad, left, right, ability };
    if (steering === 'drag') {
      const mark = (): void => {
        this.steered = true;
      };
      pad.addEventListener('pointerdown', mark, { once: true });
    }
  }

  /** Builds the sidekick tiles for the run's (fixed) team. */
  setSidekicks(sidekicks: readonly SidekickState[]): void {
    this.dock.replaceChildren();
    this.badges = [];
    for (const k of sidekicks) {
      const ring = h('span', { class: 'tb-tile-ring' });
      const mark = h('span', { class: 'tb-tile-mark' });
      const name = k.evolved ? SIDEKICK_DEFS[k.id].evolvedName : SIDEKICK_DEFS[k.id].name;
      const kind = SIDEKICK_DEFS[k.id].kind === 'status' || k.stats.cooldown === 0 ? 'status' : 'acts';
      const el = h('div', { class: `tb-tile tb-${kind}${k.evolved ? ' evolved' : ''}`, attrs: { role: 'img', 'aria-label': name } }, [ring, portraitEl('tb-tile-face', k.id, 34, 'sidekick', { evolved: k.evolved }), mark]);
      this.dock.append(el);
      this.badges.push({ el, ring, mark, kind });
    }
  }

  /** Where collected Bolts fly to (the counter's icon), in CSS px. */
  boltTarget(): { x: number; y: number } | null {
    const r = this.boltsChip.querySelector('.tb-nut')?.getBoundingClientRect();
    return r === undefined || r.width === 0 ? null : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** TEAM HONK fires: a short banner with the hero and both sidekicks. Decoration only; a plain fade under reduced motion. */
  honkCutIn(hero: HeroId, sidekicks: readonly SidekickState[]): void {
    const faces = [portraitEl('cutin-hero', hero, 76, 'character', { expr: 'celebrate' }), ...sidekicks.map((k) => portraitEl('cutin-mate', k.id, 52, 'sidekick', { expr: 'celebrate', evolved: k.evolved }))];
    this.cutIn.replaceChildren(h('div', { class: 'cutin-band' }, [h('div', { class: 'cutin-team' }, faces), h('strong', { class: 'cutin-text', text: 'TEAM HONK!' })]));
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

  /** The lowest point of the top bands, callout included, so the horizon never jumps when a line appears. */
  reservedTop(): number {
    const slot = this.slot;
    if (getComputedStyle(slot).position === 'fixed') {
      const sub = this.el.root.querySelector<HTMLElement>('.tb-sub');
      return sub !== null ? sub.getBoundingClientRect().bottom : 0;
    }
    return slot.getBoundingClientRect().top + 46;
  }

  /** Height of the bottom controls from the screen's bottom edge (CSS px), for the camera fit. */
  reservedBottom(): number {
    const tops = Array.from(this.el.root.querySelectorAll<HTMLElement>('.tb-sig, .tb-dock, .lane-btn'))
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .map((r) => r.top);
    return tops.length === 0 ? 0 : Math.max(0, window.innerHeight - Math.min(...tops));
  }

  /** Toasts sit just below the wheels, above the controls: never on the road ahead. */
  placeToast(cam: { playerY: number; lane0: number; landscape: boolean }): void {
    if (cam.landscape) {
      this.toastEl.style.removeProperty('top');
      this.toastEl.style.removeProperty('bottom');
      return;
    }
    const controlsTop = window.innerHeight - this.reservedBottom();
    const below = cam.playerY + 8;
    const toastH = Math.max(30, this.toastEl.getBoundingClientRect().height);
    const top = below + toastH <= controlsTop - 2 ? below : controlsTop - toastH - 2;
    this.toastEl.style.top = `${Math.round(top)}px`;
    this.toastEl.style.bottom = 'auto';
  }

  setObjective(text: string, tag = 'Goal'): void {
    this.set('objective', `${tag}|${text}`, () => {
      this.goalText.textContent = text;
      this.goalTag.textContent = tag;
      this.goal.classList.toggle('hidden', text === '');
    });
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastT = 1.4;
  }

  /** A short banner (boss phases), so the machine stays in view; clears itself. */
  banner(title: string, sub: string, tone: 'phase' | 'gold' = 'phase'): void {
    const phase = /^Phase (\d) · (.+)$/.exec(title);
    const parts = [h('strong', { text: phase !== null ? phase[2] : title }), h('span', { text: sub })];
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
        pop(this.countdownEl, 1.25);
      }
    });
  }

  go(): void {
    this.countdown('Go!');
    this.goT = 0.6;
  }

  pulseBar(): void {
    this.progressBar.classList.remove('hit');
    void this.progressBar.offsetWidth;
    this.progressBar.classList.add('hit');
  }

  get showingCards(): boolean {
    return this.card !== null;
  }

  /** Player-paced onboarding in the message slot: one card at a time, Next or Skip. Calls `onDone` once. */
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
      const dots = h('div', { class: 'card-dots', attrs: { 'aria-hidden': 'true' } }, cards.map((_, i) => h('span', { class: `card-dot${i === index ? ' on' : ''}` })));
      const last = index === cards.length - 1;
      const next = h('button', { class: 'btn primary card-next', text: last ? "Let's go!" : 'Next', onClick: () => advance() });
      const skip = h('button', { class: 'btn ghost card-skip', text: 'Skip', onClick: () => finish() });
      const body: HTMLElement[] = [h('div', { class: 'card-who', text: CHARACTER_NAMES[c.speaker] }), h('div', { class: 'card-title', text: c.title }), h('p', { class: 'card-text', text: c.text })];
      const row: Node[] = [portraitEl('card-portrait', c.speaker, 56, 'character', { expr: c.expr }), h('div', { class: 'card-body' }, body)];
      if (c.art !== undefined) {
        const artEl = canvasEl(120, 96, 'card-art');
        c.art(artEl.ctx, 120, 96);
        row.push(artEl.canvas);
      }
      const el = h('div', { class: 'onboard', attrs: { role: 'dialog', 'aria-label': `${c.title}, ${index + 1} of ${cards.length}` } }, [
        h('div', { class: 'card-row' }, row as HTMLElement[]),
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
      this.progressFill.style.transform = `scaleX(${pct / 100})`;
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
          this.phaseChip.className = `tb-phase p${phase}`;
          pop(this.phaseChip, 1.2);
        }
      });
    } else if (this.mission.kind === 'endless') {
      this.set('endless', String(Math.floor(s.route / 10)), () => {
        this.routeLeft.textContent = `${Math.floor(s.route / 10) * 10} m`;
      });
    }
    this.set('bolts', String(s.boltsCollected), () => {
      this.boltsText.textContent = String(s.boltsCollected);
      this.boltsChip.setAttribute('aria-label', `Bolts picked up: ${s.boltsCollected}`);
      if (s.boltsCollected > 0) {
        pop(this.boltsChip, 1.1);
      }
    });

    // Health: hearts that empty with each dent, named in words for screen readers.
    const p = s.player;
    this.set('hero', `${p.dents}/${p.maxDents}`, () => {
      const name = HERO_DEFS[this.hero].name;
      if (p.maxDents === null) {
        this.heroSegs.replaceChildren(h('span', { class: 'chip-note', text: p.dents === 0 ? 'No dents' : `${p.dents} dent${p.dents === 1 ? '' : 's'}` }));
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
        const changed = segs[left < before ? left : left - 1];
        if (shown && before !== left && changed !== undefined) {
          pop(changed, 1.5);
        }
        this.heroChip.setAttribute('aria-label', `${name}'s condition: ${left} of ${p.maxDents} left`);
        this.heroChip.setAttribute('role', 'img');
        this.heroChip.classList.toggle('warn', left === 1);
      }
    });

    // Kiko's engine (the convoy's escort).
    const k = s.kiko;
    if (this.kikoChip !== null && k !== null) {
      this.set('kiko', `${k.engine}/${k.maxEngine}`, () => {
        const parts: Node[] = [portraitEl('tb-kiko-face', 'kiko', 20, 'character', { crop: true })];
        if (k.maxEngine === null) {
          this.kikoChip!.setAttribute('aria-label', "Kiko's engine: Story mode, it never gives out");
        } else {
          const segs = h('span', { class: 'tb-hearts' });
          for (let i = 0; i < k.maxEngine; i += 1) {
            segs.append(h('span', { class: `pip-engine${i < k.engine ? ' on' : ' lost'}` }, [icon('engine')]));
          }
          parts.push(segs);
          this.kikoChip!.setAttribute('aria-label', `Kiko's engine: ${k.engine} of ${k.maxEngine}`);
          this.kikoChip!.classList.toggle('warn', k.engine === 1);
        }
        this.kikoChip!.setAttribute('role', 'img');
        this.kikoChip!.replaceChildren(...parts);
      });
    }

    // Team Honk charge (finale phase 3).
    const sparks = s.boss !== null && s.boss.phase === 3 ? s.boss.sparks : -1;
    this.set('honk', String(sparks), () => {
      this.honkChip.classList.toggle('hidden', sparks < 0);
      if (sparks >= 0) {
        const pips = h('span', { class: 'tb-sparks' });
        for (let i = 0; i < 3; i += 1) {
          pips.append(h('span', { class: `tb-spark${i < sparks ? ' on' : ''}` }));
        }
        this.honkChip.replaceChildren(h('span', { class: 'tb-goal-tag', text: 'Honk' }), pips);
        this.honkChip.setAttribute('aria-label', `Team Honk charge: ${sparks} of 3 signal sparks`);
        this.honkChip.setAttribute('role', 'img');
        if (sparks > 0) {
          pop(pips.children[sparks - 1], 1.5);
        }
      }
    });

    // What the hero is storing, when it stores anything.
    const meter = this.hero === 'ligaya' ? s.rhythm : this.hero === 'kidlat' ? s.charge : -1;
    if (meter >= 0) {
      const max = this.hero === 'ligaya' ? 3 : 10;
      this.set('meter', String(meter), () => {
        this.meter.classList.remove('hidden');
        const dots = Array.from({ length: max }, (_, i) => h('span', { class: `tb-m${i < meter ? ' on' : ''}` }));
        this.meter.replaceChildren(...dots);
        this.meter.setAttribute('aria-label', `${this.hero === 'ligaya' ? 'Rhythm' : 'Charge'}: ${meter} of ${max}`);
      });
    }

    // Weather and road, in a small chip: told by shape, with the word.
    const w = s.weather;
    const weatherText = s.onRough && s.brace <= 0 ? 'rough' : w.kind !== 'none' && w.phase !== 'calm' ? `${w.kind}-${w.phase}` : '';
    this.set('weather', weatherText, () => {
      this.weather.classList.toggle('hidden', weatherText === '');
      if (weatherText !== '') {
        const kind = weatherText === 'rough' ? 'rough' : w.kind;
        const label = weatherText === 'rough' ? 'Rough road' : w.kind === 'gust' ? (w.phase === 'warn' ? 'Gust coming' : 'Gust') : w.phase === 'warn' ? 'Rain coming' : 'Rain';
        this.weather.className = `tb-weather is-${kind}`;
        this.weather.replaceChildren(markIcon(kind as 'rough' | 'gust' | 'rain'), h('span', { text: label }));
      }
    });

    // Power-ups: a small badge each, seconds on it.
    for (const kind of Object.keys(s.powers) as PowerUpKind[]) {
      const power = s.powers[kind]!;
      let badge = this.powerBadges.get(kind);
      if (badge === undefined) {
        const num = h('span', { class: 'n' });
        badge = { el: h('div', { class: `tb-power pw-${kind}`, attrs: { role: 'img' } }, [num]), num };
        this.powerBadges.set(kind, badge);
        this.powersEl.append(badge.el);
        pop(badge.el, 1.3);
      }
      const secs = Math.ceil(power.left);
      const b = badge;
      this.set(`power-${kind}`, String(secs), () => {
        b.num.textContent = `${secs}`;
        b.el.setAttribute('aria-label', `${POWERUP_DEFS[kind].name}: ${secs} seconds left`);
      });
    }
    for (const [kind, badge] of this.powerBadges) {
      if (s.powers[kind] === undefined) {
        badge.el.remove();
        this.powerBadges.delete(kind);
        this.last.delete(`power-${kind}`);
      }
    }

    // The callout: a line of what someone said, and their face.
    const showing = radio !== null && this.card === null;
    this.set('slot', showing ? 'on' : 'off', () => {
      this.callout.classList.toggle('hidden', !showing);
    });
    this.set('radio', radio === null ? '' : `${radio.speaker}|${radio.text}`, () => {
      if (radio !== null) {
        this.calloutLine.textContent = radio.text;
        this.paintCallout(radio.speaker as CharacterId | SidekickId, radio.expr === 'idle' ? 'speaking' : radio.expr, s);
      }
    });

    this.updateSidekickBadges(s, t);
    this.updateAbility(s, abilityReady, abilityMode);

    // Steering hint: on the very first road, until the first touch.
    const wantHint = !this.steered && s.tutorial !== null;
    this.set('hint', wantHint ? 'on' : 'off', () => this.padHint.classList.toggle('hidden', !wantHint));

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

  private paintCallout(speaker: CharacterId | SidekickId, expr: Expression, s: SimState): void {
    const ctx = this.calloutCtx;
    ctx.clearRect(0, 0, 30, 30);
    if (isSidekickSpeaker(speaker as never)) {
      const evolved = s.sidekicks.find((m) => m.id === speaker)?.evolved ?? false;
      ctx.save();
      ctx.translate(15, 29);
      ctx.scale(0.14, 0.14);
      drawSidekick(ctx, speaker as SidekickId, { expr, t: 0, blink: 0, talk: 0, lookX: 0, evolved, action: 0 });
      ctx.restore();
    } else {
      const big = isMachine(speaker as CharacterId);
      drawCharacter(ctx, speaker as CharacterId, 15, 30, big ? 22 : 32, { expr, anim: { t: 0, blink: 0, talk: 0, lookX: 0, lookY: 0 }, shadow: false });
    }
    void speakerName;
  }

  /**
   * Three states, each with its own shape: ready (a solid ring and a small
   * dot), assisting (a hop and a burst of ticks) and recovering (the ring is an
   * arc that fills, and the face sits back). Always-on helpers just have a ring.
   */
  private updateSidekickBadges(s: SimState, t: number): void {
    s.sidekicks.forEach((k, i) => {
      const badge = this.badges[i];
      if (badge === undefined) {
        return;
      }
      const stats = k.stats;
      let state: 'ready' | 'acting' | 'recovering' | 'spent' = 'ready';
      let share = 1;
      let words = 'ready';
      if (k.action > 0.45) {
        state = 'acting';
        words = 'helping now';
      } else if (k.id === 'kumpuni' && k.uses >= stats.count) {
        state = 'spent';
        words = 'used up';
        share = 0;
      } else if (k.id === 'bantay') {
        share = k.charged ? 1 : 1 - Math.max(0, k.cooldown) / stats.cooldown;
        state = k.charged ? 'ready' : 'recovering';
        words = k.charged ? 'guarding' : 'recharging';
      } else if (badge.kind === 'acts' && stats.cooldown > 0) {
        share = 1 - Math.max(0, Math.min(stats.cooldown, k.cooldown)) / stats.cooldown;
        state = k.cooldown > 0.35 ? 'recovering' : 'ready';
        words = state === 'recovering' ? 'recharging' : 'ready';
      } else {
        words = 'always on';
      }
      this.set(`badge${i}`, state, () => {
        badge.el.classList.remove('s-ready', 's-acting', 's-recovering', 's-spent');
        badge.el.classList.add(`s-${state}`);
        const def = SIDEKICK_DEFS[k.id];
        badge.el.setAttribute('aria-label', `${k.evolved ? def.evolvedName : def.name}: ${words}`);
        if (state === 'acting') {
          pop(badge.el, 1.18);
        }
      });
      const deg = Math.round(Math.max(0, Math.min(1, share)) * 12) * 30;
      this.set(`ring${i}`, String(deg), () => badge.ring.style.setProperty('--deg', `${deg}deg`));
    });
    void t;
  }

  /** Ready, running, recharging, unavailable and TEAM HONK: each by shape, number and colour together. */
  private updateAbility(s: SimState, ready: boolean, mode: 'signature' | 'honk'): void {
    if (this.el.ability === null) {
      return;
    }
    const p = s.player;
    const name = HERO_DEFS[this.hero].signature.name;
    let look: 'ready' | 'active' | 'cooldown' | 'off' | 'honk';
    let label: string;
    let share: number;
    let count = '';
    if (mode === 'honk') {
      look = 'honk';
      label = 'Team Honk, press it';
      share = 1;
    } else if (p.signature > 0) {
      look = 'active';
      count = String(Math.ceil(p.signature));
      label = `${name}: on, ${count} seconds`;
      share = p.signature / p.signatureMax;
    } else if (ready) {
      look = 'ready';
      label = `${name}: ready`;
      share = 1;
    } else if (s.ending !== null || s.rescue !== null || s.boss?.stage === 'honk' || s.boss?.stage === 'down') {
      look = 'off';
      label = `${name}: not now`;
      share = 0;
    } else if (this.hero === 'kidlat' && p.cooldown <= 0) {
      look = 'off';
      count = `${s.charge}/3`;
      label = `${name}: needs charge, ${s.charge} of 3`;
      share = s.charge / 3;
    } else {
      look = 'cooldown';
      count = String(Math.ceil(p.cooldown));
      label = `${name}: recharging, ${count} seconds`;
      share = 1 - p.cooldown / Math.max(0.1, p.cooldownMax);
    }
    this.set('ability', `${look}|${count}`, () => {
      const btn = this.el.ability!;
      const was = btn.classList.contains('is-ready') || btn.classList.contains('is-honk');
      btn.classList.remove('is-ready', 'is-active', 'is-cooldown', 'is-off', 'is-honk');
      btn.classList.add(`is-${look}`);
      this.abilityCount.textContent = count;
      btn.setAttribute('aria-label', label);
      if (!was && (look === 'ready' || look === 'honk')) {
        pop(btn.querySelector('.tb-sig-face')!, 1.14);
      }
    });
    const deg = Math.round(Math.max(0, Math.min(1, share)) * 36) * 10;
    this.set('ring', String(deg), () => {
      this.el.ability!.style.setProperty('--deg', `${deg}deg`);
    });
  }
}
