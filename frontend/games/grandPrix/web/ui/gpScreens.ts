import { announce, button, h } from '../../../roadTrip/web/ui/dom';
import { pickupIcon } from '../../../roadTrip/web/ui/icons';
import { UPGRADE_DEFS, buyUpgrade, canBuy, formatTime, nextCupTrack, ordinal, resetCup, standings } from '../../core/progression';
import { RIVALS } from '../../core/race';
import { TRACKS } from '../../core/tracks';
import { TRACKS_IN_CUP, UPGRADES } from '../../core/types';
import type { GpApi, Scene } from '../appApi';
import { MenuScene } from '../menuScene';
import { gpSettingsPanel } from './gpSettings';

/** The Grand Prix's menu screens. */

export interface Screen {
  el: HTMLElement;
  scene: Scene | null;
  onBack?: () => boolean;
  dispose?: () => void;
}

function boltsPill(app: GpApi): HTMLElement {
  return h('div', { class: 'bolts-pill', attrs: { 'aria-label': `${app.save.bolts} Bolts` } }, [
    h('img', { class: 'stat-icon', attrs: { src: pickupIcon('bolt', 22), alt: '' } }),
    h('span', { text: String(app.save.bolts) }),
  ]);
}

function topbar(title: string, back: (() => void) | null, backLabel: string, right: HTMLElement[]): HTMLElement {
  return h('header', { class: 'topbar' }, [
    back !== null ? h('button', { class: 'icon-btn', attrs: { 'aria-label': backLabel }, onClick: back }, [h('span', { class: 'back-glyph', text: '←', attrs: { 'aria-hidden': 'true' } })]) : null,
    h('h1', { class: 'topbar-title', text: title }),
    h('div', { class: 'topbar-right' }, right),
  ]);
}

export function carName(id: string): string {
  return id === 'navie' ? 'Navie' : `#${id}`;
}

export function titleScreen(app: GpApi, storageOk: boolean): Screen {
  const scene = new MenuScene();
  scene.dim = 0.25;
  const go = button('Race!', () => {
    app.audio.unlock();
    app.audio.sfx('tap');
    app.goMenu();
  }, { icon: '▶' });
  go.setAttribute('data-autofocus', '');
  const el = h('div', { class: 'screen title-screen gp-title' }, [
    h('p', { class: 'safety', text: 'For passengers and parked drivers only. Never play while driving.' }),
    h('div', { class: 'title-block' }, [
      h('h1', { class: 'game-title' }, [h('span', { text: 'Navie' }), h('span', { text: 'Grand Prix' })]),
      h('p', { class: 'chapter-label', text: 'Racing belongs on the track. On NLEX, Navie drives safe.' }),
    ]),
    h('div', { class: 'title-actions' }, [
      go,
      button('Settings', () => app.openSettings(() => app.goTitle()), { variant: 'secondary' }),
      button('Back to the Arcade', () => app.exitGame(), { variant: 'ghost' }),
    ]),
    h('p', { class: 'title-note', text: storageOk ? 'Progress is saved on this phone for your account.' : 'Progress cannot be saved on this phone right now - it lasts until you close the game.' }),
  ]);
  return { el, scene, onBack: () => (app.exitGame(), true) };
}

export function menuScreen(app: GpApi): Screen {
  const scene = new MenuScene();
  scene.dim = 0.5;
  const save = app.save;
  const cup = save.cup;
  const cupDone = cup.raced >= 3;
  const next = nextCupTrack(save);
  const table = standings(save);
  const race = button(cupDone ? 'Start a new cup' : cup.raced === 0 ? `Race 1: ${TRACKS[next].name}` : `Race ${cup.raced + 1}: ${TRACKS[next].name}`, () => {
    if (cupDone) {
      app.update(resetCup(app.save));
      app.startRace('cup', 'palayan');
    } else {
      app.startRace('cup', next);
    }
  }, { icon: '▶', class: 'big' });
  race.setAttribute('data-autofocus', '');
  const cupCard = h('section', { class: 'card' }, [
    h('div', { class: 'row-title' }, [h('h2', { text: 'Fiesta Grand Prix' }), save.trophy !== null ? h('span', { class: 'chip next', text: `Best: ${['Gold', 'Silver', 'Bronze'][save.trophy - 1]}` }) : null]),
    h('p', { class: 'muted', text: '3 races, 6 cars, 3 laps each. Points for every place; the most points wins the trophy.' }),
    h('ol', { class: 'cup-tracks' }, TRACKS_IN_CUP.map((id, i) =>
      h('li', { class: i < cup.raced ? 'done' : i === cup.raced && !cupDone ? 'next' : '' }, [
        h('strong', { text: TRACKS[id].name }),
        h('span', { class: 'muted', text: ` - ${'★'.repeat(TRACKS[id].rating)}${save.tracks[id]?.bestPlace ? `, best ${ordinal(save.tracks[id]!.bestPlace!)}` : ''}` }),
      ]),
    )),
    cup.raced > 0 && table.length > 0
      ? h('p', { class: 'small-text', text: `Standings: ${table.slice(0, 3).map(([id, pts]) => `${carName(id)} ${pts}`).join(' · ')}${table.findIndex(([id]) => id === 'navie') > 2 ? ` · Navie ${save.cup.points.navie ?? 0}` : ''}` })
      : null,
    race,
    cup.raced > 0 && !cupDone ? button('Restart this cup', () => { app.update(resetCup(app.save)); app.goMenu(); }, { variant: 'ghost', class: 'small' }) : null,
  ]);
  const trialCard = h('section', { class: 'card' }, [
    h('h2', { text: 'Time Trial' }),
    h('p', { class: 'muted', text: 'Just you, 3 laps, and the ghost of your best run.' }),
    ...TRACKS_IN_CUP.map((id) => {
      const record = save.tracks[id];
      return h('div', { class: 'trial-row' }, [
        h('div', {}, [
          h('strong', { text: TRACKS[id].name }),
          h('p', { class: 'muted small-text', text: record?.bestTotal ? `Best ${formatTime(record.bestTotal)} · lap ${formatTime(record.bestLap ?? 0)}` : 'No time yet' }),
        ]),
        button('Race', () => app.startRace('trial', id), { variant: 'secondary', class: 'small', ariaLabel: `Time trial: ${TRACKS[id].name}` }),
      ]);
    }),
  ]);
  const el = h('div', { class: 'screen panel-screen' }, [
    topbar('Grand Prix', () => app.goTitle(), 'Back', [boltsPill(app)]),
    h('div', { class: 'scroll' }, [
      cupCard,
      trialCard,
      h('div', { class: 'row' }, [
        h('div', { class: 'cell' }, [button('Pit (upgrades)', () => app.openPit(() => app.goMenu()), { variant: 'secondary' })]),
        h('div', { class: 'cell' }, [button('Settings', () => app.openSettings(() => app.goMenu()), { variant: 'secondary' })]),
      ]),
    ]),
  ]);
  app.audio.playMusic(false);
  return { el, scene, onBack: () => (app.goTitle(), true) };
}

export function pitScreen(app: GpApi, back: () => void): Screen {
  const scene = new MenuScene();
  scene.dim = 0.55;
  const body = h('div', { class: 'scroll' });
  const pill = h('div', {});
  const render = (): void => {
    pill.replaceChildren(boltsPill(app));
    body.replaceChildren(
      h('div', { class: 'card soft' }, [
        h('p', { text: 'Bolts come from places in the cup, your first podium on each track, trophies, time trials and the Bolts on the track.' }),
        h('p', { class: 'muted small-text', text: 'Upgrades are optional - every race can be won without them.' }),
      ]),
      ...UPGRADES.map((id) => {
        const def = UPGRADE_DEFS[id];
        const level = app.save.upgrades[id] ?? 0;
        const check = canBuy(app.save, id);
        const pips = h('span', { class: 'pips', attrs: { 'aria-label': `Level ${level} of ${def.costs.length}` } });
        for (let i = 0; i < def.costs.length; i += 1) {
          pips.append(h('span', { class: `pip${i < level ? ' on' : ''}` }));
        }
        const label = check.ok ? `Buy for ${check.cost} Bolts` : check.reason === 'maxed' ? 'Max level' : `Need ${(check.cost ?? 0) - app.save.bolts} more Bolts (${check.cost})`;
        return h('div', { class: 'card upgrade' }, [
          h('div', { class: 'row-title' }, [h('h3', { text: def.name }), pips]),
          h('p', { text: def.effect }),
          h('p', { class: 'muted small-text', text: def.note }),
          def.cosmetic ? h('span', { class: 'chip', text: 'Looks only' }) : null,
          button(label, () => {
            const out = buyUpgrade(app.save, id);
            if (out.bought) {
              app.update(out.save);
              app.audio.sfx('buy');
              announce(`${def.name} bought.`);
              render();
            } else {
              app.audio.sfx('deny');
            }
          }, { disabled: !check.ok, variant: check.ok ? 'primary' : 'secondary' }),
        ]);
      }),
    );
  };
  render();
  const el = h('div', { class: 'screen panel-screen' }, [topbar('Pit', back, 'Back', [pill]), body, h('div', { class: 'actions footer' }, [button('Done', back)])]);
  return { el, scene, onBack: () => (back(), true) };
}

export function settingsScreen(app: GpApi, back: () => void): Screen {
  const scene = new MenuScene();
  scene.dim = 0.6;
  const el = h('div', { class: 'screen panel-screen' }, [
    topbar('Settings', back, 'Back', []),
    h('div', { class: 'scroll' }, [gpSettingsPanel(app, { inRace: false })]),
    h('div', { class: 'actions footer' }, [button('Done', back)]),
  ]);
  return { el, scene, onBack: () => (back(), true) };
}

/** The rivals, as the briefing lists them: number, colour, habit. */
export function rivalList(): HTMLElement {
  return h('ul', { class: 'rival-list' }, RIVALS.map((r) =>
    h('li', {}, [h('span', { class: 'swatch', style: { background: r.colour }, attrs: { 'aria-hidden': 'true' } }), h('strong', { text: `#${r.number}` }), ` ${r.note}`]),
  ));
}
