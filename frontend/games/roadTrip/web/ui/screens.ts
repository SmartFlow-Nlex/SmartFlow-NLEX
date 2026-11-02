import { BANTER, CHARACTER_NAMES, SCENES, type SceneLine } from '../../core/dialogue';
import { JOURNEY_EXITS, MISSIONS } from '../../core/missions';
import {
  UPGRADE_DEFS,
  buyUpgrade,
  canBuy,
  barrierOpen,
  canEvolve,
  equipSidekick,
  evolveSidekick,
  isCompleted,
  isUnlocked,
  journeyComplete,
  markSeen,
  recommendedMission,
  selectHero,
  upgradeLevel,
  workshopOpen,
} from '../../core/progression';
import { EVOLVE_COST, HERO_DEFS, SIDEKICK_DEFS, sidekickStats, type SidekickDef } from '../../core/roster';
import { HEROES, JOURNEY, SIDEKICKS, UPGRADES, type CharacterId, type MissionId, type TeammateId } from '../../core/types';
import { makeCanvas } from '../art/kit';
import { drawMap, mapHeight, roadPoint } from '../art/mapArt';
import type { AppApi } from '../appApi';
import { GarageScene, MapScene } from '../scenes';
import { StoryScene } from '../story';
import { TeamStage } from '../title';
import { icon, withIcon } from './arcadeIcons';
import { announce, button, h } from './dom';
import { pickupIcon, portrait } from './icons';
import { sidekickPortrait } from './teamIcons';
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

function boltsPill(app: AppApi): HTMLElement {
  return h('div', { class: 'bolts-pill', attrs: { 'aria-label': `${app.save.bolts} Bolts` } }, [
    h('img', { class: 'stat-icon', attrs: { src: pickupIcon('bolt', 22), alt: '' } }),
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
    h('p', { class: 'safety', text: 'For passengers and parked drivers only. Never play while driving.' }),
    h('div', { class: 'title-block' }, [
      h('h1', { class: 'game-title tollbound', attrs: { 'aria-label': 'Tollbound Heroes' } }, [
        h('span', { class: 'title-top', text: 'Tollbound', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'title-bottom', text: 'Heroes', attrs: { 'aria-hidden': 'true' } }),
      ]),
      h('p', { class: 'route-label', text: 'A SmartFlow NLEX game · Balintawak to Sta. Ines' }),
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
  const mapButton = button(next !== null ? `Journey Map - next: ${MISSIONS[next].to}` : 'Journey Map', () => app.goMap(), { class: 'big cta' });
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
    : withIcon(button('Workshop', () => announce('The Workshop opens when Kiko joins.'), { variant: 'secondary', class: 'locked', ariaLabel: 'Workshop, locked: opens when Kiko joins' }), 'lock');
  const endlessOpen = isUnlocked(save, 'endless');
  const endlessButton = endlessOpen
    ? button(`Endless Expressway${save.endless.bestDistance > 0 ? ` · best ${save.endless.bestDistance} m` : ''}`, () => app.startMission('endless'), { variant: 'secondary' })
    : button('Endless Expressway', () => announce('Endless opens after Mission 1.'), { variant: 'secondary', class: 'locked', ariaLabel: 'Endless Expressway, locked: opens after Mission 1' });
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
  const el = h('div', { class: 'screen garage-screen' }, [
    topbar('Garage', backButton('Back to the title', () => app.goTitle()), [
      boltsPill(app),
      h('button', { class: 'icon-btn', attrs: { 'aria-label': 'Settings' }, onClick: () => app.openSettings(() => app.goGarage()) }, [icon('gear')]),
    ], true),
    bubble,
    h('div', { class: 'garage-bottom' }, [
      h('p', { class: 'garage-status', text: `Postcards ${postcards}/${postcardTotal} · Sidekicks ${Object.keys(save.sidekicks).length}/${SIDEKICKS.length} · Cores ${save.gearCores}` }),
      mapButton,
      h('div', { class: 'row' }, [h('div', { class: 'cell' }, [teamButton]), h('div', { class: 'cell' }, [collectionButton])]),
      h('div', { class: 'row' }, [
        h('div', { class: 'cell' }, [workshopButton, workshopOpen(save) ? null : lockedNote('Opens when Kiko joins')]),
        h('div', { class: 'cell' }, [endlessButton, endlessOpen ? null : lockedNote('Opens after Mission 1')]),
      ]),
    ]),
  ]);

  if (arrivals.length > 0) {
    setTimeout(startArrival, 400);
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

// -- journey map ------------------------------------------------------------------------

type NodeId = MissionId | 'garage' | `pass:${string}`;

/**
 * The whole road, Balintawak at the bottom to Sta. Ines at the top, one node per
 * exit. It scrolls, and opens on the next stop. An exit with no mission of its
 * own (`passedOn`) is a small dot that points to the mission that drives past it.
 */
export function mapScreen(app: AppApi, focus?: string): Screen {
  const scene = new MapScene();
  const save = app.save;
  const recommended = recommendedMission(save);
  const sheetEl = h('div', { class: 'map-sheet', attrs: { 'aria-live': 'polite' } });
  const road = h('div', { class: 'map-road' });
  const scroller = h('div', { class: 'map-scroll' }, [road]);
  const atOf = (i: number): number => i / (JOURNEY_EXITS.length - 1);
  const nodes: { id: NodeId; at: number; el: HTMLButtonElement }[] = [];

  const missionSheet = (id: MissionId): void => {
    const def = MISSIONS[id];
    const record = save.missions[id];
    const unlocked = isUnlocked(save, id);
    const play = withIcon(button(record?.completed ? 'Play again' : 'Play', () => app.startMission(id), { class: 'cta', disabled: !unlocked }), unlocked ? 'play' : 'lock');
    play.setAttribute('data-autofocus', '');
    const sceneId = def.scenes.before;
    const joiners = SIDEKICKS.filter((s) => SIDEKICK_DEFS[s].unlock.after === id && save.sidekicks[s] === undefined);
    sheetEl.append(
      h('div', { class: 'chips' }, [
        h('span', { class: 'chip on', text: def.number > 0 ? `Mission ${def.number} - ${def.kindLabel}` : def.kindLabel }),
        record?.completed ? h('span', { class: 'chip done', text: 'Completed' }) : null,
        id === recommended ? h('span', { class: 'chip next', text: 'Next stop' }) : null,
        ...joiners.map((s) => h('span', { class: 'chip joins' }, [icon('star'), `${SIDEKICK_DEFS[s].name} joins here`])),
      ]),
      h('h2', { text: def.title }),
      h('p', { class: 'muted', text: `${def.from} → ${def.to}` }),
      h('p', { text: unlocked ? def.objective : `Locked - finish "${MISSIONS[def.requires!].title}" first.` }),
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
    if (id.startsWith('pass:')) {
      const exit = JOURNEY_EXITS.find((e) => e.id === id.slice(5));
      const on = exit?.passedOn ?? null;
      if (exit !== undefined && on !== null) {
        const def = MISSIONS[on];
        const unlocked = isUnlocked(save, on);
        sheetEl.append(
          h('h2', { text: exit.name }),
          h('p', { class: 'muted', text: `You drive past this exit on the way to ${def.to}, in "${def.title}". Watch for its sign!` }),
          h('div', { class: 'actions' }, [withIcon(button(`Play "${def.title}"`, () => app.startMission(on), { class: 'cta', disabled: !unlocked }), unlocked ? 'play' : 'lock')]),
        );
      }
      return;
    }
    missionSheet(id as MissionId);
  };

  const addNode = (id: NodeId, at: number, label: string, kind: 'home' | 'mission' | 'pass' | 'side', state: string, glyph: string): void => {
    const el = h(
      'button',
      {
        class: `map-node node-${kind} ${state}`,
        attrs: { 'aria-label': `${label}${state === 'done' ? ', completed' : state === 'next' ? ', next stop' : state === 'locked' ? ', locked' : ''}` },
        onClick: () => {
          app.audio.sfx('tap');
          describe(id);
        },
      },
      [h('span', { class: 'node-dot', attrs: { 'aria-hidden': 'true' }, text: glyph }), h('span', { class: 'node-label', text: label })],
    );
    nodes.push({ id, at, el });
    road.append(el);
  };

  JOURNEY_EXITS.forEach((exit, i) => {
    const at = atOf(i);
    if (exit.mission !== null) {
      const id = exit.mission;
      const state = isCompleted(save, id) ? 'done' : id === recommended ? 'next' : isUnlocked(save, id) ? 'open' : 'locked';
      addNode(id, at, exit.name, 'mission', `${state}${MISSIONS[id].kind === 'finale' ? ' boss' : ''}`, String(MISSIONS[id].number));
    } else if (exit.passedOn !== null) {
      addNode(`pass:${exit.id}`, at, exit.name, 'pass', isCompleted(save, exit.passedOn) ? 'done' : 'open', '');
    } else {
      addNode('garage', at, `${exit.name} · Garage`, 'home', 'done', '⌂');
    }
  });
  const snapshotAt = atOf(JOURNEY_EXITS.findIndex((e) => e.id === 'marilao'));
  addNode('snapshot', snapshotAt, 'Snapshot', 'side', isUnlocked(save, 'snapshot') ? 'open' : 'locked', '★');

  /** How far the blue line runs: to the furthest exit whose mission is done. */
  const completedTo = (): number => {
    let reached = 0;
    JOURNEY_EXITS.forEach((exit, i) => {
      if (exit.mission !== null && isCompleted(save, exit.mission)) {
        reached = atOf(i);
      }
    });
    return reached;
  };

  const place = (): void => {
    const w = scroller.clientWidth || window.innerWidth;
    const hgt = mapHeight(JOURNEY_EXITS.length);
    const snapshotX = w * 0.74;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const { canvas, ctx } = makeCanvas(w, hgt, ratio);
    canvas.className = 'map-canvas';
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hgt}px`;
    canvas.setAttribute('aria-hidden', 'true');
    drawMap(ctx, w, hgt, JOURNEY_EXITS, completedTo(), snapshotAt, snapshotX);
    road.querySelector('.map-canvas')?.remove();
    road.prepend(canvas);
    road.style.height = `${hgt}px`;
    for (const node of nodes) {
      const [x, y] = roadPoint(w, hgt, node.at);
      // Anchor the dot (not the whole button) on the road.
      // (The side trip is centred on its spot, its label underneath.)
      node.el.style.left = node.id === 'snapshot' ? `${snapshotX}px` : `${x - 24}px`;
      node.el.style.top = `${y - 24}px`;
    }
  };
  window.addEventListener('resize', place);

  const el = h('div', { class: 'screen map-screen' }, [
    topbar('Journey Map', backButton('Back to the garage', () => app.goGarage()), [boltsPill(app)], true),
    h('p', { class: 'map-note', text: 'Real exits in real order, not to scale. The story is fictional.' }),
    scroller,
    sheetEl,
  ]);
  const start = (focus as NodeId | undefined) ?? recommended ?? 'sta-ines';
  describe(start);
  // Once laid out: draw the road, and open on the stop that matters.
  requestAnimationFrame(() => {
    place();
    const node = nodes.find((n) => n.id === start);
    if (node !== undefined) {
      const y = roadPoint(scroller.clientWidth || window.innerWidth, mapHeight(JOURNEY_EXITS.length), node.at)[1];
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

/** Where a locked sidekick joins, in a few words. `unlock.text` has the full rule. */
function joinLabel(d: SidekickDef): string {
  if (d.unlock.after === 'endless-1000') {
    return 'Endless: 1 km';
  }
  return d.unlock.after === null ? d.unlock.text : `Joins at ${MISSIONS[d.unlock.after].to}`;
}

function statBars(stats: Record<string, number>): HTMLElement {
  return h(
    'dl',
    { class: 'stat-bars' },
    Object.entries(stats).flatMap(([name, value]) => [
      h('dt', { text: name[0].toUpperCase() + name.slice(1) }),
      h('dd', { attrs: { 'aria-label': `${name} ${value} of 5` } }, [
        h('span', { class: 'stat-bar' }, Array.from({ length: 5 }, (_, i) => h('span', { class: `stat-pip${i < value ? ' on' : ''}` }))),
      ]),
    ]),
  );
}

/**
 * Team: one hero (three to choose, with their handling compared) and two
 * sidekicks (any two different ones you own). The line-up on the canvas shows
 * the current team and hops when someone is picked. The team is locked once a
 * run starts.
 */
export function teamScreen(app: AppApi, back: () => void): Screen {
  const scene = new TeamStage(() => app.save);
  const stageSpace = h('div', { class: 'team-stage-space', attrs: { 'aria-hidden': 'true' } });
  scene.space = stageSpace;
  const body = h('div', { class: 'scroll team-scroll' });
  let slot: 0 | 1 = 0;
  // Stays open while heroes are compared: every pick redraws the sheet.
  let moreOpen = false;
  const render = (): void => {
    const save = app.save;
    body.replaceChildren();
    // Heroes.
    body.append(h('h2', { class: 'section-title', text: 'Hero' }));
    const heroRow = h('div', { class: 'hero-cards', attrs: { role: 'radiogroup', 'aria-label': 'Hero' } });
    for (const id of HEROES) {
      const d = HERO_DEFS[id];
      const unlocked = save.heroes.includes(id);
      const on = save.loadout.hero === id;
      const card = h(
        'button',
        {
          class: `hero-card${on ? ' on' : ''}${unlocked ? '' : ' locked'}`,
          attrs: { 'data-key': `hero-${id}`, role: 'radio', 'aria-checked': String(on), 'aria-label': unlocked ? `${d.name}, ${d.role}` : `${d.name}, locked: ${d.unlock.text}` },
          onClick: () => {
            if (!unlocked) {
              app.audio.sfx('deny');
              announce(`${d.name}: ${d.unlock.text}.`);
              return;
            }
            app.update(selectHero(app.save, id));
            app.audio.sfx('tap');
            scene.cheer(id);
            announce(`${d.name} is your hero.`);
            rerender(`hero-${id}`);
          },
        },
        [
          h('img', { class: 'hero-face', attrs: { src: portrait(id, 64), alt: '' } }),
          h('strong', { class: 'hero-name', text: d.name }),
          h('span', { class: 'hero-role', text: unlocked ? d.role : 'Locked' }),
          on ? h('span', { class: 'pick-mark' }, [icon('check')]) : null,
          unlocked ? null : h('span', { class: 'pick-mark lock' }, [icon('lock')]),
        ],
      );
      heroRow.append(card);
    }
    body.append(heroRow);
    const hero = HERO_DEFS[save.loadout.hero];
    const more = h('details', { class: 'details', attrs: moreOpen ? { open: '' } : {} }, [
      h('summary', { text: 'More' }),
      h('p', { class: 'small-text good-note', text: `+ ${hero.strength}` }),
      h('p', { class: 'small-text cost-note', text: `- ${hero.tradeOff}` }),
    ]);
    more.addEventListener('toggle', () => {
      moreOpen = (more as HTMLDetailsElement).open;
    });
    body.append(
      h('div', { class: 'card hero-detail' }, [
        h('div', { class: 'row-title' }, [h('h3', { text: hero.signature.name }), h('span', { class: 'muted small-text', text: `Big button · ${hero.signature.cooldown} s recharge` })]),
        h('p', { class: 'small-text', text: hero.signature.short }),
        statBars(hero.stats),
        more,
      ]),
    );
    // Side by side: every unlocked hero's numbers, the chosen one highlighted.
    const open = HEROES.filter((id) => save.heroes.includes(id));
    if (open.length > 1) {
      const stats: [string, keyof typeof hero.stats][] = [['Steering', 'steering'], ['Toughness', 'toughness'], ['Power', 'power'], ['Scouting', 'scouting']];
      more.append(
        h('table', { class: 'compare' }, [
          h('caption', { class: 'small-text muted', text: 'Compare heroes (out of 5)' }),
          h('thead', {}, [h('tr', {}, [h('th', { text: '' }), ...open.map((id) => h('th', { class: id === save.loadout.hero ? 'on' : '', attrs: { scope: 'col' }, text: HERO_DEFS[id].name }))])]),
          h('tbody', {}, stats.map(([label, key]) => h('tr', {}, [h('th', { attrs: { scope: 'row' }, text: label }), ...open.map((id) => h('td', { class: id === save.loadout.hero ? 'on' : '', text: String(HERO_DEFS[id].stats[key]) }))]))),
        ]),
      );
    }
    // Sidekicks.
    body.append(h('h2', { class: 'section-title', text: 'Sidekicks' }), h('p', { class: 'muted small-text', text: 'Pick a slot, then a sidekick.' }));
    const slots = h('div', { class: 'slot-picks', attrs: { role: 'radiogroup', 'aria-label': 'Sidekick slot' } });
    ([0, 1] as const).forEach((i) => {
      const id = save.loadout.sidekicks[i];
      const on = slot === i;
      slots.append(
        h(
          'button',
          {
            class: `slot-pick${on ? ' on' : ''}`,
            attrs: { 'data-key': `slot-${i}`, role: 'radio', 'aria-checked': String(on), 'aria-label': `Slot ${i + 1}: ${id === null ? 'empty' : SIDEKICK_DEFS[id].name}` },
            onClick: () => {
              slot = i;
              rerender(`slot-${i}`);
            },
          },
          [
            id !== null ? h('img', { class: 'slot-face', attrs: { src: sidekickPortrait(id, 48, save.sidekicks[id]?.evolved === true), alt: '' } }) : h('span', { class: 'slot-face empty' }, [icon('team')]),
            h('span', { text: `Slot ${i + 1}` }),
            h('strong', { text: id === null ? 'Empty' : SIDEKICK_DEFS[id].name }),
          ],
        ),
      );
    });
    body.append(slots);
    const grid = h('div', { class: 'sidekick-grid' });
    for (const id of SIDEKICKS) {
      const d = SIDEKICK_DEFS[id];
      const progress = save.sidekicks[id];
      const owned = progress !== undefined;
      const inSlot = save.loadout.sidekicks.indexOf(id);
      const info = d.describe(sidekickStats(id, progress?.evolved === true));
      grid.append(
        h(
          'button',
          {
            class: `sidekick-card${inSlot >= 0 ? ' on' : ''}${owned ? '' : ' locked'}`,
            attrs: { 'data-key': `sk-${id}`, 'aria-label': owned ? `${d.name}, ${d.roleLabel}. ${info.what}${inSlot >= 0 ? ` In slot ${inSlot + 1}.` : ''}` : `${d.name}, locked: ${d.unlock.text}` },
            onClick: () => {
              if (!owned) {
                app.audio.sfx('deny');
                announce(`${d.name}: ${d.unlock.text}.`);
                return;
              }
              app.update(equipSidekick(app.save, slot, app.save.loadout.sidekicks[slot] === id ? null : id));
              app.audio.sfx('tap');
              scene.cheer(id);
              rerender(`sk-${id}`);
            },
          },
          [
            h('img', { class: 'sk-face', attrs: { src: sidekickPortrait(id, 64, progress?.evolved === true), alt: '' } }),
            h('strong', { text: progress?.evolved ? d.evolvedName : d.name }),
            h('span', { class: 'sk-role', text: owned ? d.roleLabel : joinLabel(d) }),
            inSlot >= 0 ? h('span', { class: 'chip on', text: `Slot ${inSlot + 1}` }) : null,
            inSlot >= 0 ? h('span', { class: 'pick-mark' }, [icon('check')]) : null,
            owned ? null : h('span', { class: 'pick-mark lock' }, [icon('lock')]),
          ],
        ),
      );
    }
    body.append(grid);
  };
  /** Re-draws after a pick without losing the place: same scroll, focus back on the same control. */
  const rerender = (key: string): void => {
    const top = body.scrollTop;
    render();
    body.scrollTop = top;
    const picked = body.querySelector<HTMLElement>(`[data-key="${key}"]`);
    picked?.classList.add('just-picked');
    picked?.focus({ preventScroll: true });
  };
  render();
  const done = button('Done', back);
  done.setAttribute('data-autofocus', '');
  const el = h('div', { class: 'screen panel-screen team-screen' }, [
    topbar('Team', backButton('Back', back), [withIcon(button('Collection', () => app.openCollection(() => app.openTeam(back)), { variant: 'ghost', class: 'small' }), 'star')]),
    stageSpace,
    body,
    h('div', { class: 'actions footer' }, [done]),
  ]);
  return { el, scene, onBack: () => (back(), true) };
}

// -- collection (sidekicks, XP, evolution) ----------------------------------------------------

export function collectionScreen(app: AppApi, back: () => void): Screen {
  const scene = new GarageScene(() => app.save);
  scene.dim = 0.55;
  const body = h('div', { class: 'scroll' });
  const wallet = h('div', { class: 'wallet' });
  // Open rows stay open through a redraw: evolving one redraws the whole list.
  const opened = new Set<string>();
  const render = (): void => {
    const save = app.save;
    wallet.replaceChildren(boltsPill(app), h('div', { class: 'bolts-pill cores', attrs: { 'aria-label': `${save.gearCores} Gear Cores` } }, [icon('gear', 'core-glyph'), h('span', { text: String(save.gearCores) })]));
    body.replaceChildren(
      h('details', { class: 'card soft details collection-how' }, [
        h('summary', { text: 'How to evolve' }),
        h('ul', { class: 'rules' }, [
          `Costs ${EVOLVE_COST.xp} XP, ${EVOLVE_COST.cores} Gear Cores and ${EVOLVE_COST.bolts} Bolts.`,
          'XP: every run a sidekick joins.',
          'Gear Cores: missions and Endless milestones.',
        ].map((line) => h('li', { text: line }))),
      ]),
    );
    for (const id of SIDEKICKS) {
      const d = SIDEKICK_DEFS[id];
      const progress = save.sidekicks[id];
      const owned = progress !== undefined;
      const evolved = progress?.evolved === true;
      const now = d.describe(sidekickStats(id, evolved));
      const check = canEvolve(save, id);
      const pct = Math.min(100, Math.round(((progress?.xp ?? 0) / EVOLVE_COST.xp) * 100));
      const card = h('details', { class: `card details collection-card${owned ? '' : ' locked'}`, attrs: { 'data-sk': id, tabindex: '-1', ...(opened.has(id) ? { open: '' } : {}) } }, [
        h('summary', {}, [
          h('div', { class: 'evolve-preview' }, [
            h('figure', {}, [h('img', { attrs: { src: sidekickPortrait(id, 84, false, owned ? 'happy' : 'idle'), alt: '' } })]),
            h('span', { class: 'evolve-arrow', text: '→', attrs: { 'aria-hidden': 'true' } }),
            h('figure', { class: evolved ? '' : 'future' }, [h('img', { attrs: { src: sidekickPortrait(id, 84, true, 'celebrate'), alt: '' } })]),
          ]),
          h('div', { class: 'collection-name' }, [
            h('div', { class: 'collection-title' }, [h('strong', { text: evolved ? d.evolvedName : d.name }), check.ok ? h('span', { class: 'chip next', text: 'Ready' }) : null]),
            h('span', { class: 'sk-role', text: owned ? d.roleLabel : joinLabel(d) }),
            owned && !evolved
              ? h('div', { class: 'xp-line' }, [
                  h('div', { class: 'xp-bar', attrs: { role: 'progressbar', 'aria-label': `${d.name} XP`, 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' } }, [h('div', { class: 'xp-fill', attrs: { style: `width:${pct}%` } })]),
                  h('span', { class: 'small-text', text: `${progress!.xp}/${EVOLVE_COST.xp}` }),
                ])
              : null,
          ]),
        ]),
        h('p', { class: 'muted small-text', text: d.blurb }),
        owned ? h('p', { text: now.what }) : h('p', { class: 'small-text', text: d.unlock.text }),
        owned
          ? h('dl', { class: 'facts' }, [
              h('dt', { text: 'Range' }),
              h('dd', { text: now.range }),
              h('dt', { text: 'Cooldown' }),
              h('dd', { text: now.cooldown }),
              h('dt', { text: 'Targets' }),
              h('dd', { text: now.targets }),
              h('dt', { text: 'Limits' }),
              h('dd', { text: now.limits }),
              h('dt', { text: evolved ? 'Evolved' : 'Evolves' }),
              h('dd', { text: d.evolution }),
            ])
          : null,
        owned && !evolved
          ? button(
              check.ok ? `Evolve (${EVOLVE_COST.cores} Cores, ${EVOLVE_COST.bolts} Bolts)` : check.missing ?? 'Not yet',
              () => {
                const out = evolveSidekick(app.save, id);
                if (out.evolved) {
                  app.update(out.save);
                  app.audio.sfx('win');
                  announce(`${d.name} evolved into ${d.evolvedName}!`);
                  render();
                  // Bring the new form into view with a moment of celebration.
                  const shown = body.querySelector<HTMLElement>(`[data-sk="${id}"]`);
                  shown?.classList.add('just-evolved');
                  shown?.scrollIntoView({ block: 'center' });
                  shown?.focus({ preventScroll: true });
                } else {
                  app.audio.sfx('deny');
                }
              },
              { disabled: !check.ok, variant: check.ok ? 'primary' : 'secondary' },
            )
          : null,
      ]);
      card.addEventListener('toggle', () => {
        if ((card as HTMLDetailsElement).open) {
          opened.add(id);
        } else {
          opened.delete(id);
        }
      });
      body.append(card);
    }
  };
  render();
  const el = h('div', { class: 'screen panel-screen' }, [topbar('Collection', backButton('Back', back), [wallet]), body, h('div', { class: 'actions footer' }, [button('Done', back)])]);
  return { el, scene, onBack: () => (back(), true) };
}

// -- workshop -----------------------------------------------------------------------------

export function workshopScreen(app: AppApi, back: () => void): Screen {
  const scene = new GarageScene(() => app.save);
  scene.dim = 0.5;
  const body = h('div', { class: 'scroll' });
  const pillHolder = h('div', {});
  const render = (): void => {
    pillHolder.replaceChildren(boltsPill(app));
    body.replaceChildren(
      h('div', { class: 'card soft' }, [
        h('p', { text: 'Earn Bolts on the road, by completing missions (the first time pays most), driving clean, teamwork and finding postcards.' }),
        h('p', { class: 'muted small-text', text: 'Upgrades are optional - every mission can be finished without them.' }),
      ]),
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
    h('div', { class: 'actions footer' }, [button('Done', back)]),
  ]);
  return { el, scene, onBack: () => (back(), true) };
}

// -- settings -----------------------------------------------------------------------------

export function settingsScreen(app: AppApi, back: () => void, openDifficulty = false): Screen {
  const scene = new GarageScene(() => app.save);
  scene.dim = 0.55;
  const done = button('Done', back);
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
