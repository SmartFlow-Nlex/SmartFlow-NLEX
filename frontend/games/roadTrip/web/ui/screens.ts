import { BANTER, CHARACTER_NAMES, SCENES, type SceneLine } from '../../core/dialogue';
import { JOURNEY_EXITS, MISSIONS } from '../../core/missions';
import { LEVEL_COUNT, levelPlan } from '../../core/levels';
import {
  UPGRADE_DEFS,
  buyUpgrade,
  canBuy,
  barrierOpen,
  canEvolve,
  clearReveal,
  equipSidekick,
  isCompleted,
  isUnlocked,
  joinersAt,
  journeyComplete,
  markSeen,
  recommendedMission,
  selectHero,
  upgradeLevel,
  workshopOpen,
  WORKSHOP_LEVEL,
} from '../../core/progression';
import { HERO_DEFS, SIDEKICK_DEFS, sidekickTags } from '../../core/roster';
import { activeSynergies, teamTags } from '../../core/tuning';
import { CHARMS, counterValue, earnedCharms, heroRule, ruleProgress, sidekickRule } from '../../core/unlocks';
import { HEROES, JOURNEY, SIDEKICKS, UPGRADES, type CharacterId, type HeroId, type MissionId, type SidekickId, type TeammateId } from '../../core/types';
import { art, portraitEl, tileColours } from '../art/clay';
import { makeCanvas } from '../art/kit';
import { drawMap, mapHeight, roadPoint } from '../art/mapArt';
import type { AppApi } from '../appApi';
import { GarageScene, MapScene } from '../scenes';
import { StoryScene } from '../story';
import { TeamStage } from '../title';
import { icon, withIcon } from './arcadeIcons';
import { announce, button, h } from './dom';
import { heroPanel, rosterTile, sidekickPanel, tagRow } from './rosterPanels';
import { settingsPanel } from './settings';

/**
 * The menu screens. Each returns its root element and what to do when it
 * goes away; the app shell swaps them and the canvas scene behind them.
 */

export interface Screen {
  el: HTMLElement;
  scene: import('../appApi').Scene | null;
  /** Android back / Escape: return true if handled. */
  onBack?: () => boolean;
  onKey?: (e: KeyboardEvent) => boolean;
  /** Called every frame (for bubbles that follow the scene). */
  tick?: (dt: number) => void;
  dispose?: () => void;
}

/** The clay Bolt, for the pills and totals. */
export function nutIcon(): HTMLCanvasElement {
  const nut = document.createElement('canvas');
  nut.className = 'stat-icon';
  nut.width = 48;
  nut.height = 48;
  nut.setAttribute('aria-hidden', 'true');
  const draw = (): void => {
    const s = art('p.bolt0');
    if (s === null) {
      setTimeout(draw, 60);
      return;
    }
    const k = 44 / Math.max(s.w, s.h);
    nut.getContext('2d')!.drawImage(s.img, 24 - (s.w * k) / 2, 24 - (s.h * k) / 2, s.w * k, s.h * k);
  };
  draw();
  return nut;
}

function boltsPill(app: AppApi): HTMLElement {
  return h('div', { class: 'bolts-pill', attrs: { 'aria-label': `${app.save.bolts} Bolts` } }, [
    nutIcon(),
    h('span', { text: String(app.save.bolts) }),
  ]);
}

/** The screen bar; the main screens carry the game's name as a small kicker over their title. */
function topbar(title: string, left: HTMLElement | null, right: HTMLElement[], kicker = false): HTMLElement {
  const heading = kicker ? h('h1', { class: 'topbar-title' }, [h('span', { class: 'topbar-kicker', text: 'Tollbound Heroes' }), h('span', { text: title })]) : h('h1', { class: 'topbar-title', text: title });
  return h('header', { class: 'topbar' }, [left, heading, h('div', { class: 'topbar-right' }, right)]);
}

function backButton(label: string, onClick: () => void): HTMLButtonElement {
  return h('button', { class: 'icon-btn', attrs: { 'aria-label': label }, onClick }, [icon('back')]);
}

// -- title ------------------------------------------------------------------------

export function titleScreen(app: AppApi, storageOk: boolean): Screen {
  const scene = new TeamStage(() => app.save);
  scene.floor = 0.7;
  const started = app.save.scenesSeen.includes('opening');
  const go = button(started ? 'Continue' : 'Play', () => {
    app.audio.unlock();
    app.audio.sfx('tap');
    if (!app.save.scenesSeen.includes('opening')) {
      // Quick start: a brand-new player goes from the opening straight to the first mission's briefing.
      app.playStory('opening', () => (isCompleted(app.save, 'm1-garage') ? app.goGarage() : app.startMission('m1-garage')));
    } else {
      app.goGarage();
    }
  }, { class: 'big cta' });
  withIcon(go, 'play');
  go.setAttribute('data-autofocus', '');
  const el = h('div', { class: 'screen title-screen' }, [
    h('p', { class: 'safety', text: 'For passengers and parked drivers. Never play while driving.' }),
    h('div', { class: 'title-block' }, [
      h('h1', { class: 'game-title tollbound', attrs: { 'aria-label': 'Tollbound Heroes' } }, [
        h('span', { class: 'title-top', text: 'Tollbound', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'title-bottom', text: 'Heroes', attrs: { 'aria-hidden': 'true' } }),
      ]),
    ]),
    h('div', { class: 'title-actions' }, [
      go,
      h('div', { class: 'row' }, [
        withIcon(button('Team', () => app.openTeam(() => app.goTitle()), { variant: 'secondary' }), 'team'),
        withIcon(button('Settings', () => app.openSettings(() => app.goTitle()), { variant: 'secondary' }), 'gear'),
      ]),
      button('Back to SmartFlow', () => app.exitGame(), { variant: 'ghost' }),
    ]),
    h('p', { class: 'title-note', text: storageOk ? 'Progress is saved on this phone for your account.' : 'Progress cannot be saved on this phone right now - it lasts until you close the game.' }),
  ]);
  return { el, scene, onBack: () => (app.exitGame(), true) };
}

// -- garage -------------------------------------------------------------------------

export function garageScreen(app: AppApi): Screen {
  const scene = new GarageScene(() => app.save);
  const save = app.save;
  const bubble = h('div', { class: 'bubble hidden', attrs: { 'aria-live': 'polite' } });
  let bubbleSpeaker: CharacterId | null = null;
  const next = recommendedMission(save);
  const mapButton = button(next !== null ? `Journey Map · Level ${MISSIONS[next].number}` : 'Journey Map', () => app.goMap(), { class: 'big cta' });
  withIcon(mapButton, 'pin');
  mapButton.setAttribute('data-autofocus', '');

  const lockedNote = (text: string): HTMLElement => h('span', { class: 'lock-note', text });
  const teamButton = withIcon(button('Team', () => app.openTeam(() => app.goGarage()), { variant: 'secondary', ariaLabel: 'Team: choose your hero and two sidekicks' }), 'team');
  const evolveReady = SIDEKICKS.some((id) => canEvolve(save, id).ok);
  const collectionButton = withIcon(button('Collection', () => app.openCollection(() => app.goGarage()), {
    variant: 'secondary',
    class: evolveReady ? 'ready' : undefined,
    ariaLabel: evolveReady ? 'Collection: a sidekick is ready to evolve' : 'Collection: your sidekicks, XP and evolution',
  }), 'star');
  const workshopButton = workshopOpen(save)
    ? withIcon(button('Workshop', () => app.goWorkshop(), { variant: 'secondary', ariaLabel: 'Workshop: permanent upgrades for Bolts' }), 'wrench')
    : withIcon(button('Workshop', () => announce(`The Workshop opens at Level ${WORKSHOP_LEVEL}.`), { variant: 'secondary', class: 'locked', ariaLabel: `Workshop, locked: opens at Level ${WORKSHOP_LEVEL}` }), 'lock');
  const endlessOpen = isUnlocked(save, 'endless');
  const endlessButton = endlessOpen
    ? button(`Endless Expressway${save.endless.bestDistance > 0 ? ` · best ${save.endless.bestDistance} m` : ''}`, () => app.startMission('endless'), { variant: 'secondary' })
    : button('Endless Expressway', () => announce('Endless opens after Level 1.'), { variant: 'secondary', class: 'locked', ariaLabel: 'Endless Expressway, locked: opens after Level 1' });
  withIcon(endlessButton, endlessOpen ? 'infinity' : 'lock');

  // Arrivals the garage has not shown yet.
  const arrivals: { id: string; who: TeammateId | null; lines: SceneLine[]; badge: HTMLElement | null }[] = [];
  if (save.heroes.includes('jepoy') && !save.garageEvents.includes('jepoy-arrived')) {
    arrivals.push({
      id: 'jepoy-arrived',
      who: 'jepoy',
      badge: teamButton,
      lines: [
        { speaker: 'jepoy', expr: 'happy', text: 'Beep beep! Kuya Jepoy is moving in. Small garage, pero masaya!' },
        { speaker: 'navie', expr: 'happy', text: 'Welcome, Kuya! You can drive now too - pick a hero on the Team screen. And Bantay came with you!' },
      ],
    });
  }
  if (save.heroes.includes('kiko') && !save.garageEvents.includes('kiko-arrived')) {
    arrivals.push({
      id: 'kiko-arrived',
      who: 'kiko',
      badge: workshopButton,
      lines: [
        { speaker: 'kiko', expr: 'happy', text: "Lola's toolbox goes right... here. Ta-da! A workshop, po! I built Kumpuni from the spare parts." },
        { speaker: 'navie', expr: 'celebrate', text: 'Now we can spend Bolts on upgrades - and you can be a hero too, Kiko!' },
      ],
    });
  }
  // Players whose save came from Navie's Road Trip: what is new, once.
  if (save.garageEvents.includes('tollbound-intro-due') && !save.garageEvents.includes('tollbound-intro')) {
    arrivals.push({
      id: 'tollbound-intro',
      who: null,
      badge: teamButton,
      lines: [
        { speaker: 'navie', expr: 'celebrate', text: "Big news - we're the Tollbound Heroes now! Kuya Jepoy and Kiko can drive too, and little helpers joined the team." },
        { speaker: 'jepoy', expr: 'happy', text: 'Pip, Mila, Bantay, Kumpuni, Bumbo... pick a hero and two sidekicks on the Team screen!' },
        { speaker: 'kiko', expr: 'happy', text: 'And Gear Cores evolve them, po. The Collection shows what each one needs.' },
      ],
    });
  }
  if (barrierOpen(save) && !save.garageEvents.includes('fiesta')) {
    arrivals.push({
      id: 'fiesta',
      who: null,
      badge: mapButton,
      lines: [
        { speaker: 'jepoy', expr: 'celebrate', text: 'Fiesta in the garage! The band is still playing in my head.' },
        { speaker: 'kiko', expr: 'happy', text: 'Lola sent a parol for the wall, po.' },
        { speaker: 'navie', expr: 'determined', text: 'And the whole road north is on the map now. Every exit, all the way to Sta. Ines!' },
      ],
    });
  } else if (barrierOpen(save) && !save.garageEvents.includes('road-north')) {
    // Saves from before the road north: what is new, once.
    arrivals.push({
      id: 'road-north',
      who: null,
      badge: mapButton,
      lines: [
        { speaker: 'navie', expr: 'celebrate', text: 'Big news! The whole road north is on the map now. Every exit, all the way to Sta. Ines!' },
        { speaker: 'kiko', expr: 'happy', text: 'New sidekicks join along the way, po. Six of them!' },
      ],
    });
  }

  let lineIndex = 0;
  let banterT = 3;
  let banterIndex = 0;
  let banterLine: { line: SceneLine; t: number } | null = null;
  const nextButton = button('Next', () => advance(), { class: 'small' });
  const showBubble = (line: SceneLine | null, withNext: boolean): void => {
    if (line === null) {
      bubble.classList.add('hidden');
      scene.speaker = null;
      bubbleSpeaker = null;
      return;
    }
    bubbleSpeaker = line.speaker;
    scene.speaker = { id: line.speaker, expr: line.expr };
    bubble.replaceChildren(h('strong', { class: `who who-${line.speaker}`, text: CHARACTER_NAMES[line.speaker] }), h('p', { text: line.text }));
    if (withNext) {
      bubble.append(nextButton);
    }
    bubble.classList.remove('hidden');
    app.audio.voice(line.speaker, line.text);
  };
  const advance = (): void => {
    const event = arrivals[0];
    if (event === undefined) {
      return;
    }
    lineIndex += 1;
    if (lineIndex < event.lines.length) {
      showBubble(event.lines[lineIndex], true);
      nextButton.focus({ preventScroll: true });
      return;
    }
    // This arrival is done: remember it, badge what it opened.
    app.update(markSeen(app.save, 'garageEvents', event.id));
    event.badge?.classList.add('new');
    arrivals.shift();
    lineIndex = 0;
    if (arrivals.length > 0) {
      startArrival();
    } else {
      showBubble(null, false);
      (event.badge ?? mapButton).focus({ preventScroll: true });
    }
  };
  const startArrival = (): void => {
    const event = arrivals[0];
    if (event.who !== null) {
      scene.arrive(event.who);
    }
    app.audio.sfx(event.who === null ? 'win' : 'shield');
    setTimeout(() => {
      showBubble(event.lines[0], true);
      nextButton.focus({ preventScroll: true });
    }, event.who !== null ? 1600 : 300);
  };

  const stage = journeyComplete(save) ? 'done' : barrierOpen(save) ? 'north' : save.heroes.includes('kiko') ? 'kiko' : save.heroes.includes('jepoy') ? 'jepoy' : 'start';
  const banter = BANTER.filter((b) => b.stage === stage);

  const postcards = JOURNEY.filter((id) => save.missions[id]?.foundPostcard).length;
  const postcardTotal = JOURNEY.filter((id) => MISSIONS[id].postcard !== null).length;
  const stat = (label: string, value: string): HTMLElement => h('span', { class: 'tb-stat' }, [h('strong', { text: value }), h('span', { text: label })]);
  const el = h('div', { class: 'screen garage-screen' }, [
    topbar('Garage', backButton('Back to the title', () => app.goTitle()), [
      boltsPill(app),
      h('button', { class: 'icon-btn', attrs: { 'aria-label': 'Settings' }, onClick: () => app.openSettings(() => app.goGarage()) }, [icon('gear')]),
    ], true),
    bubble,
    h('div', { class: 'garage-bottom' }, [
      h('div', { class: 'tb-stats-row' }, [stat('Heroes', `${save.heroes.length}/${HEROES.length}`), stat('Sidekicks', `${Object.keys(save.sidekicks).length}/${SIDEKICKS.length}`), stat('Postcards', `${postcards}/${postcardTotal}`), stat('Cores', String(save.gearCores))]),
      mapButton,
      h('div', { class: 'row' }, [h('div', { class: 'cell' }, [teamButton]), h('div', { class: 'cell' }, [collectionButton])]),
      h('div', { class: 'row' }, [
        h('div', { class: 'cell' }, [workshopButton, workshopOpen(save) ? null : lockedNote(`Opens at Level ${WORKSHOP_LEVEL}`)]),
        h('div', { class: 'cell' }, [endlessButton, endlessOpen ? null : lockedNote('Opens after Level 1')]),
      ]),
    ]),
  ]);

  if (arrivals.length > 0) {
    setTimeout(startArrival, 400);
  } else if (save.reveals.length > 0) {
    if (revealsPaused) {
      revealsPaused = false;
    } else {
      setTimeout(() => showReveal(app, el, () => app.goGarage()), 500);
    }
  }
  app.audio.playMusic('garage');

  return {
    el,
    scene,
    // Back from the garage goes to the title (which leaves the game), like the arrow.
    onBack: () => (app.goTitle(), true),
    tick: (dt) => {
      if (arrivals.length === 0) {
        // Idle banter: one line, now and then.
        if (banterLine !== null) {
          banterLine.t -= dt;
          if (banterLine.t <= 0) {
            banterLine = null;
            showBubble(null, false);
            banterT = 9;
          }
        } else if (banter.length > 0) {
          banterT -= dt;
          if (banterT <= 0) {
            const entry = banter[banterIndex % banter.length];
            banterIndex += 1;
            const line = entry.lines[0];
            banterLine = { line, t: 4.5 };
            showBubble(line, false);
          }
        }
      }
      if (bubbleSpeaker !== null) {
        const head = scene.headOf(bubbleSpeaker);
        if (head !== null) {
          const width = bubble.offsetWidth;
          const x = Math.max(12, Math.min(window.innerWidth - width - 12, head.x - width / 2));
          bubble.style.left = `${x}px`;
          bubble.style.top = `${Math.max(70, head.y - bubble.offsetHeight - 12)}px`;
        }
      }
    },
  };
}

/**
 * Someone new has joined: a moment of its own, with who they are, one thing they
 * say, and a way to put them on the team. Plays once, whichever button is pressed.
 */
let revealsPaused = false;

/** Where each scrap of a reveal's confetti flies: across, down, spin, colour. */
const CONFETTI: readonly [number, number, number, string][] = [
  [-84, -76, -140, '#F3C75A'], [-52, -104, 90, '#E5705F'], [-14, -118, -60, '#69AFA4'], [26, -112, 150, '#F58DAF'], [62, -94, -110, '#3C7FD6'], [90, -62, 70, '#F3C75A'],
  [-98, -30, 120, '#69AFA4'], [100, -18, -130, '#E5705F'],
];

function showReveal(app: AppApi, host: HTMLElement, refresh: () => void): void {
  const next = app.save.reveals[0];
  if (next === undefined) {
    return;
  }
  const [kind, id] = next.split(':') as ['hero' | 'sidekick', string];
  const isHero = kind === 'hero';
  if (isHero ? HERO_DEFS[id as HeroId] === undefined : SIDEKICK_DEFS[id as SidekickId] === undefined) {
    app.update(clearReveal(app.save, next));
    return;
  }
  const name = isHero ? HERO_DEFS[id as HeroId].name : SIDEKICK_DEFS[id as SidekickId].name;
  const role = isHero ? HERO_DEFS[id as HeroId].role : SIDEKICK_DEFS[id as SidekickId].roleLabel;
  const line = isHero ? HERO_DEFS[id as HeroId].lines[0] : SIDEKICK_DEFS[id as SidekickId].barks.cheer;
  const ability = isHero ? `${HERO_DEFS[id as HeroId].signature.name}: ${HERO_DEFS[id as HeroId].signature.short}` : SIDEKICK_DEFS[id as SidekickId].describe(SIDEKICK_DEFS[id as SidekickId].base).what;
  app.audio.sfx('win');
  const close = (): void => {
    overlay.remove();
    app.update(clearReveal(app.save, next));
    refresh();
  };
  const equip = button(isHero ? `Drive with ${name}` : `Put ${name} on the team`, () => {
    if (isHero) {
      app.update(selectHero(app.save, id as HeroId));
    } else {
      const slots = app.save.loadout.sidekicks;
      app.update(equipSidekick(app.save, slots[0] === null ? 0 : 1, id as SidekickId));
    }
    close();
  }, { class: 'cta' });
  equip.setAttribute('data-autofocus', '');
  const overlay = h('div', { class: 'overlay tb-reveal-wrap', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `${name} joined the team` } }, [
    h('div', { class: 'tb-reveal' }, [
      h('p', { class: 'tb-reveal-kicker', text: isHero ? 'New hero' : 'New sidekick' }),
      h('span', { class: 'tb-reveal-stage' }, [
        portraitEl('tb-reveal-pic', id as HeroId, 170, isHero ? 'character' : 'sidekick', { expr: 'celebrate' }),
        ...CONFETTI.map(([x, y, r, colour]) => h('span', { class: 'tb-confetti', attrs: { style: `--cx:${x}px;--cy:${y}px;--cr:${r}deg;background:${colour}` } })),
      ]),
      h('h2', { text: name }),
      h('p', { class: 'tb-panel-role', text: role }),
      h('p', { class: 'tb-reveal-blurb', text: ability }),
      h('p', { class: 'tb-quote', text: `"${line}"` }),
      h('div', { class: 'actions' }, [equip, button('Later', () => {
        // "Later" means not now: anyone else waiting can wait for the next visit too.
        revealsPaused = true;
        close();
      }, { variant: 'secondary' })]),
    ]),
  ]);
  host.append(overlay);
  equip.focus({ preventScroll: true });
}

// -- journey map ------------------------------------------------------------------------

type NodeId = MissionId | 'garage';

/**
 * The whole road, Balintawak at the bottom to Sta. Ines at the top: a hundred levels
 * between the real exits. Each exit's name sits by the level that reaches it, and a small
 * portrait by a level shows who joins when it is cleared. It scrolls, and opens on the next level.
 */
export function mapScreen(app: AppApi, focus?: string): Screen {
  const scene = new MapScene();
  const save = app.save;
  const recommended = recommendedMission(save);
  const sheetEl = h('div', { class: 'map-sheet', attrs: { 'aria-live': 'polite' } });
  const road = h('div', { class: 'map-road' });
  const scroller = h('div', { class: 'map-scroll' }, [road]);
  const atOf = (level: number): number => level / LEVEL_COUNT;
  const exitAt = JOURNEY_EXITS.map((exit) => atOf(exit.level ?? 0));
  const nodes: { id: NodeId; at: number; el: HTMLButtonElement }[] = [];
  const nameOf = (id: HeroId | SidekickId, hero: boolean): string => (hero ? HERO_DEFS[id as HeroId].name : SIDEKICK_DEFS[id as SidekickId].name);

  const missionSheet = (id: MissionId): void => {
    const def = MISSIONS[id];
    const record = save.missions[id];
    const unlocked = isUnlocked(save, id);
    const play = withIcon(button(record?.completed ? 'Play again' : 'Play', () => app.startMission(id), { class: 'cta', disabled: !unlocked }), unlocked ? 'play' : 'lock');
    play.setAttribute('data-autofocus', '');
    const sceneId = def.scenes.before;
    const joiners = joinersAt(id);
    const joinChip = (who: HeroId | SidekickId, hero: boolean): HTMLElement => {
      const owned = hero ? save.heroes.includes(who as HeroId) : save.sidekicks[who as SidekickId] !== undefined;
      return h('span', { class: 'chip joins' }, [icon('star'), owned ? `${nameOf(who, hero)} joined here` : `${nameOf(who, hero)} joins here`]);
    };
    sheetEl.append(
      h('div', { class: 'chips' }, [
        h('span', { class: 'chip on', text: def.number > 0 ? `Level ${def.number} · ${def.kindLabel}` : def.kindLabel }),
        record?.completed ? h('span', { class: 'chip done', text: 'Completed' }) : null,
        id === recommended ? h('span', { class: 'chip next', text: 'Next level' }) : null,
        ...joiners.heroes.map((who) => joinChip(who, true)),
        ...joiners.sidekicks.map((who) => joinChip(who, false)),
      ]),
      h('h2', { text: def.title }),
      ...(unlocked ? [] : [h('p', { class: 'muted', text: `Locked: clear Level ${def.requires !== null ? MISSIONS[def.requires].number : 1} first.` })]),
      h('dl', { class: 'facts' }, [
        h('dt', { text: 'First completion' }),
        h('dd', { text: `+${def.rewards.firstClear} Bolts` }),
        h('dt', { text: 'Replay' }),
        h('dd', { text: `+${def.rewards.replay} Bolts` }),
        def.postcard !== null ? h('dt', { text: 'Optional' }) : null,
        def.postcard !== null ? h('dd', { text: record?.foundPostcard ? `Postcard found: ${def.postcard.title}` : 'A postcard is hidden on this road' }) : null,
        record?.completed ? h('dt', { text: 'Best' }) : null,
        record?.completed ? h('dd', { text: `${record.bestScore} Bolts, ${record.bestDents ?? 0} dents` }) : null,
      ]),
      h('div', { class: 'actions' }, [
        play,
        sceneId !== null && save.scenesSeen.includes(sceneId) ? button('Story again', () => app.playStory(sceneId, () => app.goMap(id)), { variant: 'secondary' }) : null,
      ]),
    );
  };

  const describe = (id: NodeId): void => {
    sheetEl.replaceChildren();
    for (const node of nodes) {
      node.el.setAttribute('aria-pressed', String(node.id === id));
      node.el.classList.toggle('selected', node.id === id);
    }
    if (id === 'garage') {
      sheetEl.append(h('h2', { text: "Navie's Garage" }), h('p', { class: 'muted', text: 'Balintawak - home, and where NLEX begins. Team, workshop and your postcards.' }), button('Go to the garage', () => app.goGarage()));
      return;
    }
    missionSheet(id);
  };

  const addNode = (id: NodeId, at: number, label: string | null, kind: 'home' | 'mission' | 'side', state: string, glyph: string, joiners: HTMLElement | null = null): void => {
    const el = h(
      'button',
      {
        class: `map-node node-${kind} ${state}`,
        attrs: { 'aria-label': `${kind === 'mission' ? `Level ${glyph}${label !== null ? `, ${label}` : ''}` : label ?? glyph}${state.startsWith('done') ? ', completed' : state.startsWith('next') ? ', next level' : state.startsWith('locked') ? ', locked' : ''}` },
        onClick: () => {
          app.audio.sfx('tap');
          describe(id);
        },
      },
      [h('span', { class: 'node-dot', attrs: { 'aria-hidden': 'true' }, text: glyph }), label !== null ? h('span', { class: 'node-label', text: label }) : null, joiners],
    );
    nodes.push({ id, at, el });
    road.append(el);
  };

  addNode('garage', 0, 'Balintawak · Garage', 'home', 'done', '⌂');
  const exitName = new Map(JOURNEY_EXITS.filter((e) => e.level !== null).map((e) => [e.level as number, e.name]));
  JOURNEY.forEach((id) => {
    const def = MISSIONS[id];
    const state = isCompleted(save, id) ? 'done' : id === recommended ? 'next' : isUnlocked(save, id) ? 'open' : 'locked';
    const kind = def.kind === 'finale' ? ' boss' : levelPlan(id)?.story !== null ? ' story' : '';
    const joining = joinersAt(id);
    const faces = [...joining.heroes.map((who) => ({ who: who as HeroId | SidekickId, hero: true })), ...joining.sidekicks.map((who) => ({ who: who as HeroId | SidekickId, hero: false }))];
    // Who joins here: their faces by the level, in colour, so the road shows what is coming.
    const joiners = faces.length === 0 ? null : h('span', { class: 'node-joiners', attrs: { 'aria-label': `${faces.map((f) => nameOf(f.who, f.hero)).join(' and ')} ${faces.length === 1 ? 'joins' : 'join'} here` } }, faces.map((f) => portraitEl('node-face', f.who, 30, f.hero ? 'character' : 'sidekick')));
    addNode(id, atOf(def.number), exitName.get(def.number) ?? null, 'mission', `${state}${kind}${faces.length > 0 ? ' reward' : ''}`, String(def.number), joiners);
  });
  const snapshotAt = exitAt[JOURNEY_EXITS.findIndex((e) => e.id === 'marilao')];
  addNode('snapshot', snapshotAt, 'Snapshot', 'side', isUnlocked(save, 'snapshot') ? 'open' : 'locked', '★');

  /** How far the blue line runs: to the furthest level cleared. */
  const completedTo = (): number => {
    let reached = 0;
    JOURNEY.forEach((id) => {
      if (isCompleted(save, id)) {
        reached = atOf(MISSIONS[id].number);
      }
    });
    return reached;
  };

  const height = mapHeight(LEVEL_COUNT + 1);
  const place = (): void => {
    const w = scroller.clientWidth || window.innerWidth;
    const snapshotX = w * 0.8;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const { canvas, ctx } = makeCanvas(w, height, ratio);
    canvas.className = 'map-canvas';
    canvas.style.width = `${w}px`;
    canvas.style.height = `${height}px`;
    canvas.setAttribute('aria-hidden', 'true');
    drawMap(ctx, w, height, JOURNEY_EXITS, exitAt, completedTo(), snapshotAt, snapshotX);
    road.querySelector('.map-canvas')?.remove();
    road.prepend(canvas);
    road.style.height = `${height}px`;
    for (const node of nodes) {
      const [x, y] = roadPoint(w, height, node.at);
      // Anchor the dot (not the whole button) on the road. The side trip is centred on its spot.
      node.el.style.left = node.id === 'snapshot' ? `${snapshotX}px` : `${x - 24}px`;
      node.el.style.top = `${y - 24}px`;
    }
  };
  window.addEventListener('resize', place);

  const el = h('div', { class: 'screen map-screen' }, [
    topbar('Journey Map', backButton('Back to the garage', () => app.goGarage()), [boltsPill(app)], true),
    scroller,
    sheetEl,
  ]);
  const start = (focus as NodeId | undefined) ?? recommended ?? 'sta-ines';
  describe(start);
  // Once laid out: draw the road, and open on the level that matters.
  requestAnimationFrame(() => {
    place();
    const node = nodes.find((n) => n.id === start);
    if (node !== undefined) {
      const y = roadPoint(scroller.clientWidth || window.innerWidth, height, node.at)[1];
      scroller.scrollTop = y - scroller.clientHeight / 2;
    }
  });
  return {
    el,
    scene,
    onBack: () => (app.goGarage(), true),
    dispose: () => window.removeEventListener('resize', place),
  };
}

// -- team (loadout) ----------------------------------------------------------------------

/**
 * Team. A stage with who you have chosen; two tabs; a grid you can browse; and one
 * panel about whoever you are looking at. Looking is not choosing: tapping a tile
 * only shows them. The one button at the bottom does the choosing, and says exactly
 * what it will do. The scroll area stops above that button, so nothing hides behind it.
 */
export function teamScreen(app: AppApi, back: () => void): Screen {
  const scene = new TeamStage(() => app.save);
  const stageSpace = h('div', { class: 'team-stage-space', attrs: { 'aria-hidden': 'true' } });
  scene.space = stageSpace;
  const body = h('div', { class: 'scroll team-scroll' });
  const footer = h('div', { class: 'actions footer tb-footer' });
  let tab: 'hero' | 'sidekick' = 'hero';
  let slot: 0 | 1 = app.save.loadout.sidekicks[0] === null ? 0 : app.save.loadout.sidekicks[1] === null ? 1 : 0;
  let lookingHero: HeroId = app.save.loadout.hero;
  let lookingSidekick: SidekickId = app.save.loadout.sidekicks[slot] ?? app.save.loadout.sidekicks[0] ?? app.save.loadout.sidekicks[1] ?? 'pip';

  const syncStage = (): void => {
    const save = app.save;
    scene.previewHero = tab === 'hero' && lookingHero !== save.loadout.hero ? lookingHero : null;
    scene.previewSidekick = tab === 'sidekick' && !save.loadout.sidekicks.includes(lookingSidekick) ? lookingSidekick : null;
    scene.previewSlot = slot;
  };

  const renderFooter = (): void => {
    const save = app.save;
    footer.replaceChildren();
    if (tab === 'hero') {
      const d = HERO_DEFS[lookingHero];
      if (!save.heroes.includes(lookingHero)) {
        footer.append(button(`${d.name} is not here yet`, () => undefined, { disabled: true, variant: 'secondary' }));
      } else if (save.loadout.hero === lookingHero) {
        footer.append(button('Done', back, { class: 'cta' }));
      } else {
        footer.append(button(`Drive with ${d.name}`, () => {
          app.update(selectHero(app.save, lookingHero));
          app.audio.sfx('tap');
          scene.cheer(lookingHero);
          announce(`${d.name} is your hero.`);
          rerender(`hero-${lookingHero}`);
        }, { class: 'cta' }));
      }
      return;
    }
    const d = SIDEKICK_DEFS[lookingSidekick];
    const inSlot = save.loadout.sidekicks.indexOf(lookingSidekick);
    if (save.sidekicks[lookingSidekick] === undefined) {
      footer.append(button(`${d.name} is not here yet`, () => undefined, { disabled: true, variant: 'secondary' }));
    } else if (inSlot === slot) {
      footer.append(button(`Take ${d.name} out of slot ${slot + 1}`, () => {
        app.update(equipSidekick(app.save, slot, null));
        app.audio.sfx('tap');
        rerender(`sk-${lookingSidekick}`);
      }, { variant: 'secondary' }), button('Done', back, { class: 'cta' }));
    } else {
      footer.append(button(`Put ${d.name} in slot ${slot + 1}`, () => {
        app.update(equipSidekick(app.save, slot, lookingSidekick));
        app.audio.sfx('tap');
        scene.cheer(lookingSidekick);
        announce(`${d.name} is in slot ${slot + 1}.`);
        rerender(`sk-${lookingSidekick}`);
      }, { class: 'cta' }));
    }
  };

  let teamRoot: HTMLElement | null = null;
  const render = (): void => {
    const save = app.save;
    body.replaceChildren();
    const tabs = h('div', { class: 'tb-tabs', attrs: { role: 'tablist', 'aria-label': 'Team' } }, (['hero', 'sidekick'] as const).map((id) =>
      h('button', {
        class: `tb-tab${tab === id ? ' on' : ''}`,
        attrs: { role: 'tab', 'aria-selected': String(tab === id), 'data-key': `tab-${id}` },
        onClick: () => {
          tab = id;
          app.audio.sfx('tap');
          rerender(`tab-${id}`);
        },
      }, [id === 'hero' ? `Heroes ${save.heroes.length}/${HEROES.length}` : `Sidekicks ${Object.keys(save.sidekicks).length}/${SIDEKICKS.length}`]),
    ));
    body.append(tabs);
    if (tab === 'hero') {
      const grid = h('div', { class: 'tb-grid tb-browser', attrs: { role: 'group', 'aria-label': 'Heroes' } });
      for (const id of HEROES) {
        const d = HERO_DEFS[id];
        const owned = save.heroes.includes(id);
        const rule = heroRule(id);
        grid.append(rosterTile({
          id,
          kind: 'character',
          name: d.name,
          sub: d.role,
          owned,
          selected: lookingHero === id,
          equipped: save.loadout.hero === id ? 'Driving' : null,
          progress: rule !== null ? ruleProgress(save, rule) : null,
          key: `hero-${id}`,
          onClick: () => {
            lookingHero = id;
            app.audio.sfx('tap');
            rerender(`hero-${id}`);
          },
        }));
      }
      body.append(grid, heroPanel(save, lookingHero, false));
    } else {
      const slots = h('div', { class: 'tb-slots', attrs: { role: 'radiogroup', 'aria-label': 'Sidekick slot' } });
      ([0, 1] as const).forEach((i) => {
        const id = save.loadout.sidekicks[i];
        slots.append(h('button', {
          class: `tb-slot${slot === i ? ' on' : ''}`,
          attrs: { style: id !== null ? tileColours(id) : '', 'data-key': `slot-${i}`, role: 'radio', 'aria-checked': String(slot === i), 'aria-label': `Slot ${i + 1}: ${id === null ? 'empty' : SIDEKICK_DEFS[id].name}` },
          onClick: () => {
            slot = i;
            if (id !== null) {
              lookingSidekick = id;
            }
            rerender(`slot-${i}`);
          },
        }, [
          id !== null ? portraitEl('tb-slot-face', id, 40, 'sidekick', { evolved: save.sidekicks[id]?.evolved === true }) : h('span', { class: 'tb-slot-face empty' }, [icon('team')]),
          h('span', { class: 'tb-slot-text' }, [h('span', { text: `Slot ${i + 1}` }), h('strong', { text: id === null ? 'Empty' : SIDEKICK_DEFS[id].name })]),
        ]));
      });
      body.append(slots);
      // What this team is good at.
      const team = save.loadout.sidekicks.filter((x): x is SidekickId => x !== null);
      const tags = teamTags(HERO_DEFS[save.loadout.hero].tags, team.map((k) => sidekickTags(k)));
      const pairs = activeSynergies(save.loadout.hero, save.loadout.sidekicks);
      body.append(h('div', { class: 'tb-teamline' }, [tagRow(tags.map((t) => t.tag).slice(0, 4)), ...pairs.map((p) => h('p', { class: 'tb-synergy' }, [h('strong', { text: `${p.name}: ` }), p.text]))]));
      const grid = h('div', { class: 'tb-grid tb-browser', attrs: { role: 'group', 'aria-label': 'Sidekicks' } });
      for (const id of SIDEKICKS) {
        const d = SIDEKICK_DEFS[id];
        const progress = save.sidekicks[id];
        const inSlot = save.loadout.sidekicks.indexOf(id);
        const rule = sidekickRule(id);
        grid.append(rosterTile({
          id,
          kind: 'sidekick',
          name: progress?.evolved ? d.evolvedName : d.name,
          sub: d.roleLabel,
          owned: progress !== undefined,
          evolved: progress?.evolved === true,
          selected: lookingSidekick === id,
          equipped: inSlot >= 0 ? `Slot ${inSlot + 1}` : null,
          progress: rule !== null ? ruleProgress(save, rule) : null,
          key: `sk-${id}`,
          onClick: () => {
            lookingSidekick = id;
            app.audio.sfx('tap');
            rerender(`sk-${id}`);
          },
        }));
      }
      body.append(grid, sidekickPanel(app, lookingSidekick, false, () => {
        rerender(`sk-${lookingSidekick}`);
        if (app.save.reveals[0] === `sidekick:${lookingSidekick}` && teamRoot !== null) {
          showReveal(app, teamRoot, () => rerender(`sk-${lookingSidekick}`));
        }
      }));
    }
    syncStage();
    renderFooter();
  };
  /** Re-draws after a pick without losing the place: same scroll, focus back on the same control. */
  const rerender = (key: string): void => {
    const top = body.scrollTop;
    const across = body.querySelector<HTMLElement>('.tb-browser')?.scrollLeft ?? 0;
    render();
    body.scrollTop = top;
    const strip = body.querySelector<HTMLElement>('.tb-browser');
    if (strip !== null) {
      strip.scrollLeft = key.startsWith('tab-') ? 0 : across;
    }
    const picked = body.querySelector<HTMLElement>(`[data-key="${key}"]`);
    picked?.focus({ preventScroll: true });
  };
  render();
  // Open on whoever is chosen, wherever in the list they are.
  requestAnimationFrame(() => body.querySelector<HTMLElement>('.tb-tilecard.selected')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  const el = h('div', { class: 'screen panel-screen team-screen' }, [
    topbar('Team', backButton('Back', back), [button('Collection', () => app.openCollection(() => app.openTeam(back)), { variant: 'ghost', class: 'small' })]),
    stageSpace,
    body,
    footer,
  ]);
  teamRoot = el;
  return { el, scene, onBack: () => (back(), true) };
}

// -- collection (who you have met, who is still out there) --------------------------------------

/**
 * Collection: everyone in one place. Unlocking, improving and friendship are kept
 * apart: the progress bar is about joining, Evolve about getting stronger, and the
 * friendship line changes nothing on the road.
 */
export function collectionScreen(app: AppApi, back: () => void): Screen {
  const scene = new GarageScene(() => app.save);
  scene.dim = 0.3;
  scene.cast = false;
  const body = h('div', { class: 'scroll tb-collection' });
  const wallet = h('div', { class: 'wallet' });
  const panel = h('div', { class: 'tb-collection-panel' });
  let looking: { kind: 'hero'; id: HeroId } | { kind: 'sidekick'; id: SidekickId } = { kind: 'hero', id: app.save.loadout.hero };
  const render = (): void => {
    const save = app.save;
    wallet.replaceChildren(boltsPill(app), h('div', { class: 'bolts-pill cores', attrs: { 'aria-label': `${save.gearCores} Gear Cores` } }, [icon('gear', 'core-glyph'), h('span', { text: String(save.gearCores) })]));
    const top = body.scrollTop;
    body.replaceChildren();
    const heroGrid = h('div', { class: 'tb-grid' });
    for (const id of HEROES) {
      const d = HERO_DEFS[id];
      const rule = heroRule(id);
      heroGrid.append(rosterTile({ id, kind: 'character', name: d.name, sub: d.role, owned: save.heroes.includes(id), selected: looking.kind === 'hero' && looking.id === id, equipped: save.loadout.hero === id ? 'Driving' : null, progress: rule !== null ? ruleProgress(save, rule) : null, key: `c-h-${id}`, onClick: () => {
        looking = { kind: 'hero', id };
        app.audio.sfx('tap');
        render();
      } }));
    }
    const skGrid = h('div', { class: 'tb-grid' });
    for (const id of SIDEKICKS) {
      const d = SIDEKICK_DEFS[id];
      const progress = save.sidekicks[id];
      const rule = sidekickRule(id);
      const ready = progress !== undefined && canEvolve(save, id).ok;
      const inSlot = save.loadout.sidekicks.indexOf(id);
      skGrid.append(rosterTile({ id, kind: 'sidekick', name: progress?.evolved ? d.evolvedName : d.name, sub: ready ? 'Ready to evolve' : d.roleLabel, owned: progress !== undefined, evolved: progress?.evolved === true, selected: looking.kind === 'sidekick' && looking.id === id, equipped: inSlot >= 0 ? `Slot ${inSlot + 1}` : null, progress: rule !== null ? ruleProgress(save, rule) : null, key: `c-s-${id}`, onClick: () => {
        looking = { kind: 'sidekick', id };
        app.audio.sfx('tap');
        render();
      } }));
    }
    const charms = earnedCharms(save);
    body.append(
      h('h2', { class: 'section-title', text: `Heroes ${save.heroes.length}/${HEROES.length}` }),
      heroGrid,
      h('h2', { class: 'section-title', text: `Sidekicks ${Object.keys(save.sidekicks).length}/${SIDEKICKS.length}` }),
      skGrid,
      h('h2', { class: 'section-title', text: `Travel charms ${charms.length}/${CHARMS.length}` }),
      h('ul', { class: 'tb-charms' }, CHARMS.map((c) => h('li', { class: charms.includes(c.id) ? 'on' : '' }, [h('strong', { text: c.name }), h('span', { text: charms.includes(c.id) ? 'In the garage' : c.how })]))),
      h('p', { class: 'tb-muted small-text', text: `Postcards found: ${counterValue(save, 'postcards')}. Charms decorate the garage; they change nothing on the road.` }),
    );
    body.scrollTop = top;
    panel.replaceChildren(looking.kind === 'hero' ? heroPanel(save, looking.id, true) : sidekickPanel(app, looking.id, true, () => {
      render();
      // Evolving just redraws; someone newly bought is celebrated first.
      if (looking.kind === 'sidekick' && app.save.reveals[0] === `sidekick:${looking.id}`) {
        showReveal(app, panel, render);
      }
    }));
    panel.scrollTop = 0;
  };
  render();
  const el = h('div', { class: 'screen panel-screen tb-collection-screen' }, [topbar('Collection', backButton('Back', back), [wallet]), body, panel]);
  return { el, scene, onBack: () => (back(), true) };
}

// -- workshop -----------------------------------------------------------------------------

export function workshopScreen(app: AppApi, back: () => void): Screen {
  const scene = new GarageScene(() => app.save);
  scene.dim = 0.3;
  scene.cast = false;
  const body = h('div', { class: 'scroll' });
  const pillHolder = h('div', {});
  const render = (): void => {
    pillHolder.replaceChildren(boltsPill(app));
    body.replaceChildren(
      h('p', { class: 'muted small-text', text: 'Optional: every mission can be finished without these.' }),
    );
    for (const id of UPGRADES) {
      const def = UPGRADE_DEFS[id];
      const level = upgradeLevel(app.save, id);
      const check = canBuy(app.save, id);
      const pips = h('span', { class: 'pips', attrs: { 'aria-label': `Level ${level} of ${def.costs.length}` } });
      for (let i = 0; i < def.costs.length; i += 1) {
        pips.append(h('span', { class: `pip${i < level ? ' on' : ''}` }));
      }
      const reason = check.ok
        ? `Buy for ${check.cost} Bolts`
        : check.reason === 'maxed'
          ? 'Max level'
          : check.reason === 'cost'
            ? `Need ${check.cost! - app.save.bolts} more Bolts (${check.cost})`
            : def.requires === 'jepoy'
              ? 'Needs Kuya Jepoy'
              : def.requires === 'kiko'
                ? 'Needs Kiko'
                : 'Locked';
      body.append(
        h('div', { class: 'card upgrade' }, [
          h('div', { class: 'row-title' }, [h('h3', { text: def.name }), pips]),
          h('p', { text: def.effect }),
          h('p', { class: 'muted small-text', text: def.note }),
          def.cosmetic ? h('span', { class: 'chip', text: 'Decoration' }) : null,
          button(
            reason,
            () => {
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
            { disabled: !check.ok, variant: check.ok ? 'primary' : 'secondary' },
          ),
        ]),
      );
    }
  };
  render();
  const el = h('div', { class: 'screen panel-screen' }, [
    topbar("Kiko's Workshop", backButton('Back', back), [pillHolder]),
    body,
    h('div', { class: 'actions footer' }, [button('Done', back, { class: 'cta' })]),
  ]);
  return { el, scene, onBack: () => (back(), true) };
}

// -- settings -----------------------------------------------------------------------------

export function settingsScreen(app: AppApi, back: () => void, openDifficulty = false): Screen {
  const scene = new GarageScene(() => app.save);
  scene.dim = 0.3;
  scene.cast = false;
  const done = button('Done', back, { class: 'cta' });
  const el = h('div', { class: 'screen panel-screen' }, [
    topbar('Settings & help', backButton('Back', back), [], true),
    h('div', { class: 'scroll' }, [settingsPanel(app, { inMission: false, openDifficulty })]),
    h('div', { class: 'actions footer' }, [done]),
  ]);
  return { el, scene, onBack: () => (back(), true) };
}

// -- story --------------------------------------------------------------------------------

/** Typewriter pacing: a beat after commas, a longer one after sentences and ellipses. */
function pauseAfter(ch: string): number {
  return ch === ',' || ch === ';' || ch === '-' ? 0.12 : ch === '.' || ch === '!' || ch === '?' ? 0.3 : 0;
}

export function storyScreen(app: AppApi, sceneId: string, then: () => void): Screen {
  const story = SCENES[sceneId];
  const scene = new StoryScene(story.backdrop, story.cast, () => app.save, () => app.save.settings.reduceMotion, story.stage, story);
  let index = 0;
  let shown = 0;
  let hold = 0;
  let typing = false;
  const name = h('div', { class: 'story-name' });
  const visible = h('p', { class: 'story-text', attrs: { 'aria-hidden': 'true' } });
  const spoken = h('p', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });
  const next = button('Next', () => advance(), { class: 'story-next' });
  next.setAttribute('data-autofocus', '');
  const counter = h('span', { class: 'story-count', attrs: { 'aria-hidden': 'true' } });
  const pointer = h('span', { class: 'story-pointer', attrs: { 'aria-hidden': 'true' } });
  const logPanel = h('div', { class: 'story-log hidden', attrs: { role: 'dialog', 'aria-label': 'Story so far' } });
  const finish = (): void => {
    app.update(markSeen(app.save, 'scenesSeen', sceneId));
    then();
  };
  const placePointer = (): void => {
    const x = scene.speakerX();
    pointer.classList.toggle('hidden', x === null);
    if (x !== null) {
      pointer.style.left = `${Math.max(28, Math.min(window.innerWidth - 28, x))}px`;
    }
  };
  const show = (i: number): void => {
    const line = story.lines[i];
    scene.setLine(line);
    name.textContent = CHARACTER_NAMES[line.speaker];
    name.className = `story-name who-${line.speaker}`;
    spoken.textContent = `${CHARACTER_NAMES[line.speaker]}: ${line.text}`;
    counter.textContent = `${i + 1} / ${story.lines.length}`;
    next.querySelector('span:last-child')!.textContent = i === story.lines.length - 1 ? 'Continue' : 'Next';
    app.audio.voice(line.speaker, line.text);
    if (line.action === 'sputter') {
      app.audio.sfx('cough');
    } else if (line.action === 'honk') {
      app.audio.sfx('honk');
    } else if (line.action === 'gift') {
      app.audio.sfx('postcard');
    }
    placePointer();
    if (app.save.settings.textSpeed === 'instant' || app.save.settings.reduceMotion) {
      visible.textContent = line.text;
      typing = false;
    } else {
      shown = 0;
      hold = 0;
      typing = true;
      visible.textContent = '';
    }
    scene.setTalking(typing);
  };
  const advance = (): void => {
    const line = story.lines[index];
    if (typing) {
      // First press finishes the line; the next one moves on.
      typing = false;
      scene.setTalking(false);
      visible.textContent = line.text;
      return;
    }
    app.audio.sfx('tap');
    index += 1;
    if (index >= story.lines.length) {
      finish();
      return;
    }
    show(index);
  };
  const openLog = (): void => {
    logPanel.replaceChildren(
      h('h2', { text: story.title }),
      ...story.lines.slice(0, index + 1).map((l) => h('p', {}, [h('strong', { text: `${CHARACTER_NAMES[l.speaker]}: ` }), l.text])),
      button('Close', () => {
        logPanel.classList.add('hidden');
        next.focus({ preventScroll: true });
      }),
    );
    logPanel.classList.remove('hidden');
    (logPanel.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  };
  // Log and Skip live in the dialogue box: in reach, and clear of the top corners.
  const box = h('div', { class: 'story-box' }, [
    pointer,
    h('div', { class: 'story-head' }, [name, counter]),
    visible,
    spoken,
    h('div', { class: 'story-actions' }, [
      button('Log', openLog, { variant: 'ghost', class: 'small', ariaLabel: 'Story so far' }),
      button('Skip', finish, { variant: 'ghost', class: 'small', ariaLabel: 'Skip this scene' }),
      next,
    ]),
  ]);
  box.addEventListener('click', (e) => {
    if (e.target === box || e.target === visible) {
      advance();
    }
  });
  const el = h('div', { class: 'screen story-screen' }, [
    h('div', { class: 'story-top' }, [h('span', { class: 'story-title', text: story.title })]),
    box,
    logPanel,
  ]);
  show(0);
  return {
    el,
    scene,
    onBack: () => (finish(), true),
    onKey: (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && logPanel.classList.contains('hidden') && document.activeElement !== next) {
        e.preventDefault();
        advance();
        return true;
      }
      return false;
    },
    tick: (dt) => {
      placePointer();
      if (!typing) {
        return;
      }
      if (hold > 0) {
        // A natural pause at punctuation: the mouth rests too.
        hold -= dt;
        scene.setTalking(false);
        return;
      }
      scene.setTalking(true);
      const line = story.lines[index].text;
      const before = Math.floor(shown);
      shown = Math.min(line.length, shown + dt * 44);
      const now = Math.floor(shown);
      visible.textContent = line.slice(0, now);
      if (now > before) {
        const ch = line[now - 1];
        const nextCh = line[now] ?? ' ';
        if (nextCh === ' ' || nextCh === '.') {
          hold = pauseAfter(ch);
        }
      }
      if (shown >= line.length) {
        typing = false;
        scene.setTalking(false);
      }
    },
  };
}
