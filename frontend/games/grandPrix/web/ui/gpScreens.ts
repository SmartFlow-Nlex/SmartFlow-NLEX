import { announce, button, h } from '../../../roadTrip/web/ui/dom';
import { UPGRADE_DEFS, buyUpgrade, canBuy, formatTime, nextCupTrack, ordinal, resetCup, standings } from '../../core/progression';
import { RIVALS } from '../../core/race';
import { TRACKS } from '../../core/tracks';
import { TRACKS_IN_CUP, UPGRADES, type TrackId, type UpgradeId } from '../../core/types';
import type { GpApi, Scene } from '../appApi';
import { MenuScene } from '../menuScene';
import { gpIcon, type GpIcon } from './gpIcons';
import { gpSettingsPanel } from './gpSettings';
import { trackPreview } from './raceHud';

/**
 * The Grand Prix's menus. The start screen is mostly picture: the title, Navie at the pit stop,
 * the next race, one big Start Race button and three tiles (Cup, Time Trial, Garage), with Records
 * and the Bolts below. The other screens are short lists: a name, a number or one line each.
 */

export interface Screen {
  el: HTMLElement;
  scene: Scene | null;
  onBack?: () => boolean;
  dispose?: () => void;
}

const TROPHY = ['Gold', 'Silver', 'Bronze'];

function boltsPill(app: GpApi): HTMLElement {
  return h('div', { class: 'bolts-pill', attrs: { 'aria-label': `${app.save.bolts} Bolts` } }, [gpIcon('bolt', 'gp-ico'), h('span', { text: String(app.save.bolts) })]);
}

function topbar(title: string, back: (() => void) | null, backLabel: string, right: HTMLElement[]): HTMLElement {
  return h('header', { class: 'topbar' }, [
    back !== null ? h('button', { class: 'icon-btn', attrs: { 'aria-label': backLabel }, onClick: back }, [gpIcon('back', 'gp-ico')]) : null,
    h('h1', { class: 'topbar-title', text: title }),
    h('div', { class: 'topbar-right' }, right),
  ]);
}

/** A button with one of the Grand Prix icons and a short label. */
function iconButton(icon: GpIcon, label: string, onClick: () => void, cls: string, ariaLabel?: string): HTMLButtonElement {
  return h('button', { class: cls, attrs: ariaLabel ? { 'aria-label': ariaLabel } : undefined, onClick }, [gpIcon(icon, 'gp-ico'), h('span', { text: label })]);
}

function stars(n: number): HTMLElement {
  return h('span', { class: 'mini-stars', text: '★'.repeat(n) + '☆'.repeat(3 - n), attrs: { 'aria-label': `Difficulty ${n} of 3` } });
}

export function carName(id: string): string {
  return id === 'navie' ? 'Navie' : `#${id}`;
}

function panelScene(app: GpApi, dim: number): MenuScene {
  const scene = new MenuScene({ hero: false, reduceMotion: app.save.settings.reduceMotion });
  scene.dim = dim;
  return scene;
}

/** The start screen. */
export function titleScreen(app: GpApi, storageOk: boolean): Screen {
  const scene = new MenuScene({ hero: true, reduceMotion: app.save.settings.reduceMotion });
  const save = app.save;
  const cupDone = save.cup.raced >= 3;
  const next: TrackId = cupDone ? 'palayan' : nextCupTrack(save);
  const raceNo = cupDone ? 1 : save.cup.raced + 1;
  let leaving = false;
  const el = h('div', { class: 'screen gp-home' });
  const startRace = (): void => {
    if (leaving) {
      return;
    }
    leaving = true;
    app.audio.unlock();
    app.audio.sfx('whoosh');
    if (cupDone) {
      app.update(resetCup(app.save));
    }
    el.classList.add('leaving');
    const wait = scene.go();
    window.setTimeout(() => app.startRace('cup', next), wait * 1000);
  };
  const stage = h('div', { class: 'home-stage', attrs: { 'aria-hidden': 'true' } });
  stage.addEventListener('click', () => {
    scene.poke();
    app.audio.unlock();
    app.audio.sfx('tap');
  });
  const start = h('button', { class: 'btn big start-race', attrs: { 'data-autofocus': '', 'aria-label': `Start race ${raceNo} of 3: ${TRACKS[next].name}` }, onClick: startRace }, [
    gpIcon('flag', 'gp-ico'),
    h('span', { text: 'Start Race' }),
  ]);
  const preview = trackPreview(TRACKS[next], 44);
  preview.classList.add('next-thumb');
  const nextChip = h('button', { class: 'next-race', attrs: { 'aria-label': `Cup: race ${raceNo} of 3, ${TRACKS[next].name}` }, onClick: () => app.openCup() }, [
    preview,
    h('span', { class: 'next-text' }, [h('span', { class: 'next-no', text: `Race ${raceNo}/3` }), h('strong', { text: TRACKS[next].name })]),
    stars(TRACKS[next].rating),
  ]);
  el.append(
    h('p', { class: 'safety', text: 'For passengers and parked drivers only. Never play while driving.' }),
    h('header', { class: 'home-top' }, [
      h('button', { class: 'icon-btn round', attrs: { 'aria-label': 'Back to the Arcade' }, onClick: () => app.exitGame() }, [gpIcon('back', 'gp-ico')]),
      h('h1', { class: 'game-title home-title' }, [h('span', { text: 'Navie' }), h('span', { text: 'Grand Prix' })]),
      h('button', { class: 'icon-btn round', attrs: { 'aria-label': 'Settings' }, onClick: () => app.openSettings(() => app.goTitle()) }, [gpIcon('gear', 'gp-ico')]),
    ]),
    stage,
    h('div', { class: 'home-bottom' }, [
      nextChip,
      start,
      h('div', { class: 'home-tiles' }, [
        iconButton('cup', 'Cup', () => app.openCup(), 'home-tile'),
        iconButton('clock', 'Time Trial', () => app.openTrial(), 'home-tile'),
        iconButton('garage', 'Garage', () => app.openPit(() => app.goTitle()), 'home-tile'),
      ]),
      h('div', { class: 'home-foot' }, [iconButton('medal', 'Records', () => app.openRecords(), 'pill-btn'), boltsPill(app)]),
      h('p', { class: 'home-safe', text: 'Racing belongs on the track. On NLEX, Navie drives safe.' }),
      storageOk ? null : h('p', { class: 'home-safe warn', text: 'Progress is not saved on this phone right now.' }),
    ]),
  );
  /* Navie stands in the empty middle: measured, so it fits any phone. */
  const measure = (): void => {
    const r = stage.getBoundingClientRect();
    scene.setStage(r.height > 40 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
  };
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
  observer?.observe(stage);
  requestAnimationFrame(measure);
  app.audio.playMusic(false);
  return { el, scene, onBack: () => (app.exitGame(), true), dispose: () => observer?.disconnect() };
}

/** The Fiesta Grand Prix: three races, the standings, start or carry on. */
export function cupScreen(app: GpApi): Screen {
  const save = app.save;
  const cup = save.cup;
  const cupDone = cup.raced >= 3;
  const next = nextCupTrack(save);
  const table = standings(save);
  const race = button(cupDone ? 'New cup' : `Race ${cup.raced + 1}: ${TRACKS[next].name}`, () => {
    if (cupDone) {
      app.update(resetCup(app.save));
      app.startRace('cup', 'palayan');
    } else {
      app.startRace('cup', next);
    }
  }, { icon: '▶', class: 'big' });
  race.setAttribute('data-autofocus', '');
  const colourOf = (id: string): string => (id === 'navie' ? '#3A8CF4' : RIVALS.find((r) => String(r.number) === id)?.colour ?? '#9aa6b6');
  const el = h('div', { class: 'screen panel-screen' }, [
    topbar('Fiesta Grand Prix', () => app.goTitle(), 'Back', [boltsPill(app)]),
    h('div', { class: 'scroll' }, [
      h('section', { class: 'card' }, [
        h('div', { class: 'row-title' }, [h('p', { class: 'lead tagline', text: '3 Races · 6 Racers · Win the Cup!' }), save.trophy !== null ? h('span', { class: 'chip next', text: `Best: ${TROPHY[save.trophy - 1]}` }) : null]),
        h('ol', { class: 'track-rows' }, TRACKS_IN_CUP.map((id, i) => {
          const done = i < cup.raced;
          const isNext = i === cup.raced && !cupDone;
          const best = save.tracks[id]?.bestPlace ?? null;
          const thumb = trackPreview(TRACKS[id], 48);
          thumb.classList.add('row-thumb');
          return h('li', { class: `track-row${done ? ' done' : ''}${isNext ? ' next' : ''}` }, [
            thumb,
            h('div', { class: 'track-row-text' }, [h('strong', { text: TRACKS[id].name }), stars(TRACKS[id].rating)]),
            h('span', { class: `row-tag${done ? ' done' : isNext ? ' next' : ''}`, text: done ? '✓' : isNext ? 'Next' : best !== null ? ordinal(best) : '' }),
          ]);
        })),
        race,
        cup.raced > 0 && !cupDone ? button('Restart cup', () => { app.update(resetCup(app.save)); app.openCup(); }, { variant: 'ghost', class: 'small' }) : null,
      ]),
      cup.raced > 0 && table.length > 0
        ? h('section', { class: 'card soft' }, [
            h('h3', { text: `Standings · ${Math.min(3, cup.raced)}/3` }),
            h('ol', { class: 'standings' }, table.map(([id, pts], i) =>
              h('li', { class: id === 'navie' ? 'me' : '' }, [
                h('span', { class: 'st-rank', text: String(i + 1) }),
                h('span', { class: 'st-swatch', attrs: { style: `background:${colourOf(id)}` } }),
                h('span', { class: 'st-name', text: carName(id) }),
                h('strong', { text: `${pts}` }),
              ]),
            )),
          ])
        : null,
    ]),
  ]);
  return { el, scene: panelScene(app, 0.45), onBack: () => (app.goTitle(), true) };
}

/** Time Trial: one row per track, the best time, Race. */
export function trialScreen(app: GpApi): Screen {
  const save = app.save;
  const el = h('div', { class: 'screen panel-screen' }, [
    topbar('Time Trial', () => app.goTitle(), 'Back', []),
    h('div', { class: 'scroll' }, [
      h('section', { class: 'card' }, [
        h('p', { class: 'lead tagline', text: 'Beat your best time!' }),
        ...TRACKS_IN_CUP.map((id, i) => {
          const record = save.tracks[id];
          const thumb = trackPreview(TRACKS[id], 48);
          thumb.classList.add('row-thumb');
          const go = button('Race', () => app.startRace('trial', id), { variant: i === 0 ? 'primary' : 'secondary', class: 'small', ariaLabel: `Time trial: ${TRACKS[id].name}` });
          if (i === 0) {
            go.setAttribute('data-autofocus', '');
          }
          return h('div', { class: 'track-row' }, [
            thumb,
            h('div', { class: 'track-row-text' }, [h('strong', { text: TRACKS[id].name }), h('span', { class: 'muted small-text', text: record?.bestTotal ? `Best ${formatTime(record.bestTotal)}` : 'No time yet' })]),
            go,
          ]);
        }),
      ]),
    ]),
  ]);
  return { el, scene: panelScene(app, 0.45), onBack: () => (app.goTitle(), true) };
}

const UPGRADE_ICON: Record<UpgradeId, string> = { engine: '⚙️', tyres: '🛞', turbo: '⚡', stripes: '🎨' };

/** The Garage: four upgrades, each a name, one line, its level and a price. */
export function pitScreen(app: GpApi, back: () => void): Screen {
  const body = h('div', { class: 'scroll' });
  const pill = h('div', {});
  const render = (): void => {
    pill.replaceChildren(boltsPill(app));
    body.replaceChildren(
      h('p', { class: 'garage-note', text: 'Optional · Every race can be won without them' }),
      ...UPGRADES.map((id) => {
        const def = UPGRADE_DEFS[id];
        const level = app.save.upgrades[id] ?? 0;
        const check = canBuy(app.save, id);
        const pips = h('span', { class: 'pips', attrs: { 'aria-label': `Level ${level} of ${def.costs.length}` } });
        for (let i = 0; i < def.costs.length; i += 1) {
          pips.append(h('span', { class: `pip${i < level ? ' on' : ''}` }));
        }
        const label = check.ok ? `${check.cost}` : check.reason === 'maxed' ? 'Max' : `${check.cost}`;
        const buy = h('button', {
          class: `btn small buy${check.ok ? '' : ' secondary'}`,
          disabled: !check.ok,
          attrs: { 'aria-label': check.ok ? `Buy ${def.name} for ${check.cost} Bolts` : check.reason === 'maxed' ? `${def.name}: max level` : `${def.name}: needs ${check.cost} Bolts` },
          onClick: () => {
            const out = buyUpgrade(app.save, id);
            if (out.bought) {
              app.update(out.save);
              app.audio.sfx('buy');
              announce(`${def.name} bought.`);
              render();
            } else {
              app.audio.sfx('deny');
            }
          },
        }, [check.reason === 'maxed' ? null : gpIcon('bolt', 'gp-ico'), h('span', { text: label })]);
        return h('div', { class: 'card upgrade-row' }, [
          h('span', { class: 'upgrade-ico', text: UPGRADE_ICON[id], attrs: { 'aria-hidden': 'true' } }),
          h('div', { class: 'upgrade-text' }, [
            h('div', { class: 'row-title' }, [h('h3', { text: def.name }), pips]),
            h('p', { class: 'small-text', text: def.effect }),
            def.cosmetic ? h('span', { class: 'chip', text: 'Looks only' }) : null,
          ]),
          buy,
        ]);
      }),
    );
  };
  render();
  const el = h('div', { class: 'screen panel-screen' }, [topbar('Garage', back, 'Back', [pill]), body, h('div', { class: 'actions footer' }, [button('Done', back)])]);
  return { el, scene: panelScene(app, 0.5), onBack: () => (back(), true) };
}

/** Records: the best cup trophy, and each track's best place, time and lap. */
export function recordsScreen(app: GpApi): Screen {
  const save = app.save;
  const el = h('div', { class: 'screen panel-screen' }, [
    topbar('Records', () => app.goTitle(), 'Back', [boltsPill(app)]),
    h('div', { class: 'scroll' }, [
      h('section', { class: 'card records-top' }, [
        gpIcon('cup', 'gp-ico huge'),
        h('div', {}, [h('p', { class: 'muted small-text', text: 'Best cup' }), h('strong', { class: 'records-big', text: save.trophy !== null ? TROPHY[save.trophy - 1] : '-' })]),
        h('div', {}, [h('p', { class: 'muted small-text', text: 'Bolts earned' }), h('strong', { class: 'records-big', text: String(save.lifetimeBolts) })]),
      ]),
      ...TRACKS_IN_CUP.map((id) => {
        const r = save.tracks[id];
        const thumb = trackPreview(TRACKS[id], 56);
        thumb.classList.add('row-thumb');
        const cell = (label: string, value: string): HTMLElement => h('div', { class: 'rec-cell' }, [h('span', { class: 'muted small-text', text: label }), h('strong', { text: value })]);
        return h('section', { class: 'card record-row' }, [
          thumb,
          h('div', { class: 'record-body' }, [
            h('strong', { class: 'record-name', text: TRACKS[id].name }),
            h('div', { class: 'rec-cells' }, [
              cell('Cup', r?.bestPlace ? ordinal(r.bestPlace) : '-'),
              cell('Time', r?.bestTotal ? formatTime(r.bestTotal) : '-'),
              cell('Lap', r?.bestLap ? formatTime(r.bestLap) : '-'),
            ]),
          ]),
        ]);
      }),
    ]),
  ]);
  return { el, scene: panelScene(app, 0.5), onBack: () => (app.goTitle(), true) };
}

export function settingsScreen(app: GpApi, back: () => void): Screen {
  const el = h('div', { class: 'screen panel-screen' }, [
    topbar('Settings', back, 'Back', []),
    h('div', { class: 'scroll' }, [gpSettingsPanel(app, { inRace: false })]),
    h('div', { class: 'actions footer' }, [button('Done', back)]),
  ]);
  return { el, scene: panelScene(app, 0.55), onBack: () => (back(), true) };
}

/** The rivals, as the briefing's fold lists them: number, colour, habit. */
export function rivalList(): HTMLElement {
  return h('ul', { class: 'rival-list' }, RIVALS.map((r) =>
    h('li', {}, [h('span', { class: 'swatch', style: { background: r.colour }, attrs: { 'aria-hidden': 'true' } }), h('strong', { text: `#${r.number}` }), ` ${r.note}`]),
  ));
}
