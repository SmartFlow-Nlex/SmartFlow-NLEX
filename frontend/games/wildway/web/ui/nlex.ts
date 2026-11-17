import { DONE_LINES, NLEX_LINES as L } from '../../core/content';
import { FACTORS, VEHICLES } from '../../core/emissions';
import { ASSUMPTIONS, crewHours, CREW_HOURS, facilityDay, UPGRADE_OPTIONS, type Upgrade } from '../../core/facility';
import { HORNBILL_MISSION, MISSIONS, type MissionDef } from '../../core/mission';
import { bonusFound, missionOpen, missionState, progress, type MissionState } from '../../core/nlex';
import { ECO_RUNS, type EcoHow, type EcoRun } from '../../core/ecoRuns';
import { NLEX_EXITS, plannedById, type ExitStop, type Landmark } from '../../core/route';
import { allModeSets, BOCAUE_PLAZA, plazaSolved, simulatePlaza, type LaneMode, type PlazaProblem, type PlazaResult } from '../../core/plaza';
import { evaluatePlan, type TransportProblem, type Violation } from '../../core/transport';
import { UPGRADES, upgradeUnlocked, type CompletionReport, type SaveData, type SimPart } from '../../core/save';
import { button, h, icon } from '../dom';
import { page } from './screens';

/**
 * The NLEX screens: the Operations Board, briefings, the two puzzles, the progress
 * dashboard and results. Every simulated number is labelled Simulated, and the measures
 * are never added into one another.
 */

const kg = (v: number): string => `${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)} kg`;
const fmt = (v: number, digits = 1): string => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(digits));

const GOAL: Record<string, string> = {
  'nlex-gridlock': 'Fix the RFID scanner, move the traffic',
  'nlex-river': 'Clean the creek, welcome the wildlife',
  'nlex-eco': 'Switch on the depot’s solar power',
  'nlex-delivery': 'Send the supplies the greener way',
  'hornbill-homecoming': 'Help a hurt hornbill home',
};

export type MissionStatus = 'done' | 'open' | 'locked';
const statusOf = (save: SaveData, def: MissionDef): MissionStatus => (save.missions[def.id] !== undefined ? 'done' : missionOpen(save, def.id) ? 'open' : 'locked');

/* ---- The NLEX Eco Adventure map ---- */

const LANDMARK_ICON: Record<Landmark, Parameters<typeof icon>[0]> = {
  city: 'city',
  route: 'route',
  parcel: 'box',
  creek: 'drop',
  crate: 'box',
  scanner: 'plaza',
  arena: 'arena',
  plaza: 'plaza',
  wrench: 'wrench',
  tyre: 'tyre',
  box: 'box',
  signal: 'signal',
  rain: 'drop',
  cargo: 'truck',
  sun: 'sun',
  patrol: 'car',
  moon: 'moon',
  flag: 'flag',
};

interface MapMission {
  id: string;
  title: string;
  summary: string;
  tasks: readonly string[];
  state: MissionState;
  def: MissionDef | null;
}

const mapMissions = (save: SaveData, stop: ExitStop): MapMission[] =>
  stop.missions.map((id) => {
    const def = MISSIONS.find((m) => m.id === id) ?? null;
    const plan = plannedById(id);
    return {
      id,
      title: def?.title ?? plan?.title ?? id,
      summary: def?.summary ?? plan?.summary ?? '',
      tasks: def?.requiredTasks ?? plan?.tasks ?? [],
      state: missionState(save, id),
      def,
    };
  });

/** What a stop's card leads with: a mission to play or replay, else the first planned one. */
const leadMission = (list: MapMission[]): MapMission => list.find((m) => m.state === 'open') ?? list.find((m) => m.state === 'done') ?? list.find((m) => m.state === 'locked') ?? list[0];

const STATE_LABEL: Record<MissionState, string> = { done: 'Completed', open: 'Available', locked: 'Locked', dev: 'In development' };
/** In a stop's panel: something to play first, planned missions last. */
const STATE_ORDER: Record<MissionState, number> = { open: 0, done: 1, locked: 2, dev: 3 };

/** A stop's best simulated result, in a few words. */
function bestText(save: SaveData, id: string): string | null {
  const r = save.missions[id];
  if (r === undefined || Math.abs(r.bestSavedKg) < 0.05) {
    return null;
  }
  return r.bestSavedKg > 0 ? `${kg(r.bestSavedKg)} less CO₂` : `${kg(-r.bestSavedKg)} more CO₂`;
}

export function adventureMap(o: { save: SaveData; navie: string; navieHappy: string; reduce: boolean; onPlay: (def: MissionDef) => void; onBriefing: () => void; onBack: () => void }): HTMLElement {
  const save = o.save;
  const p = progress(save, []);
  const chip = (name: Parameters<typeof icon>[0], text: string, cls = ''): HTMLElement => h('div', { class: `eco-chip ${cls}` }, icon(name), h('span', { text }));
  const strip = h(
    'div',
    { class: 'eco-strip', attrs: { role: 'group', 'aria-label': 'Progress' } },
    chip('star', `${p.stopsCleared}/${p.stopsTotal} stops`),
    chip('leaf', `${kg(p.savedKg)} CO₂ less`, 'sim'),
    chip('paw', `${p.animals} animals`),
    chip('tree', `${p.habitats} habitats`),
    chip('check', `${p.achievements} badges`),
  );
  const navieImg = h('img', { class: 'navie-img eco-navie', attrs: { src: o.navie, alt: 'Navie' } });
  /* Until the Gridlock is done, Bocaue is the only open stop: say so. */
  const idle = save.missions['nlex-gridlock'] === undefined ? 'Start at Bocaue!' : 'Pick a stop!';
  const bubble = h('p', { class: 'eco-bubble', text: idle });
  const detail = h('div', { class: 'eco-detail hidden', attrs: { role: 'dialog', 'aria-label': 'Stop' } });
  let selected: string | null = null;
  const cards = new Map<string, HTMLElement>();

  const openStop = (stop: ExitStop): void => {
    selected = stop.id;
    for (const [id, el] of cards) {
      el.classList.toggle('picked', id === stop.id);
    }
    const list = mapMissions(save, stop);
    const lead = leadMission(list);
    bubble.textContent = lead.state === 'dev' ? 'Coming soon!' : lead.summary;
    navieImg.src = lead.state === 'dev' ? o.navie : o.navieHappy;
    if (!o.reduce) {
      navieImg.classList.remove('hop');
      void navieImg.offsetWidth;
      navieImg.classList.add('hop');
    }
    detail.replaceChildren(
      h(
        'div',
        { class: 'eco-detail-top' },
        h('div', {}, h('div', { class: 'kicker', text: `${stop.province} · ${stop.theme}` }), h('h2', { text: stop.name })),
        h('button', { class: 'round-btn', label: 'Close', attrs: { type: 'button' }, onClick: () => close() }, icon('cross')),
      ),
      ...[...list].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]).map((m) => {
        const best = bestText(save, m.id);
        const bonus = ECO_RUNS[m.id] !== undefined ? bonusFound(save, m.id) : null;
        const action =
          m.state === 'dev'
            ? h('div', { class: 'eco-soon' }, icon('hat'), h('span', { text: 'In development' }))
            : m.state === 'locked'
              ? h('div', { class: 'eco-soon' }, icon('lock'), h('span', { text: 'Finish the Gridlock first' }))
              : button(m.state === 'done' ? 'Replay' : 'Play', () => (m.def !== null ? o.onPlay(m.def) : undefined), { class: 'big', iconName: 'play' });
        return h(
          'div',
          { class: `eco-mission ${m.state}` },
          h('h3', { text: m.title }),
          h('p', { class: 'eco-mission-line', text: m.summary }),
          h('ol', { class: 'eco-tasks' }, ...m.tasks.slice(0, 3).map((t, i) => h('li', {}, h('span', { class: 'brief-num', text: String(i + 1) }), h('span', { text: t })))),
          best !== null || bonus !== null
            ? h('div', { class: 'eco-mission-best' }, best !== null ? h('span', { class: 'eco-best' }, icon('leaf'), h('span', { text: best }), h('span', { class: 'sim-tag tiny', text: 'Simulated' })) : null, bonus !== null ? h('span', { class: 'eco-bonus' }, icon('star'), h('span', { text: `Bonus ${bonus}/3` })) : null)
            : null,
          action,
        );
      }),
    );
    detail.classList.remove('hidden');
  };
  const close = (): void => {
    selected = null;
    detail.classList.add('hidden');
    for (const el of cards.values()) {
      el.classList.remove('picked');
    }
    bubble.textContent = idle;
    navieImg.src = o.navie;
  };

  const stops: HTMLElement[] = [];
  let province: string | null = null;
  NLEX_EXITS.forEach((stop, i) => {
    if (stop.province !== province) {
      province = stop.province;
      stops.push(h('div', { class: 'eco-province' }, h('span', { text: stop.province })));
    }
    const list = mapMissions(save, stop);
    const lead = leadMission(list);
    const cleared = list.some((m) => m.state === 'done');
    const state: MissionState = cleared ? 'done' : lead.state;
    const card = h(
      'button',
      { class: `eco-card ${state}`, attrs: { type: 'button', 'aria-label': `${stop.name}: ${lead.title}, ${STATE_LABEL[state]}` }, onClick: () => (selected === stop.id ? close() : openStop(stop)) },
      h('span', { class: 'eco-landmark' }, icon(LANDMARK_ICON[stop.landmark])),
      h('span', { class: 'eco-card-text' }, h('span', { class: 'eco-name', text: stop.name }), h('span', { class: 'eco-title', text: lead.title })),
      h(
        'span',
        { class: `eco-pill ${state}` },
        icon(state === 'done' ? 'star' : state === 'open' ? 'play' : state === 'locked' ? 'lock' : 'hat'),
        h('span', { text: STATE_LABEL[state] }),
      ),
      list.length > 1 ? h('span', { class: 'eco-more', text: `+${list.length - 1}` }) : null,
    );
    cards.set(stop.id, card);
    stops.push(h('div', { class: `eco-stop ${state} ${i % 2 === 0 ? 'l' : 'r'}` }, h('span', { class: `eco-marker ${state}` }, h('span', { text: String(i + 1) })), card));
  });

  const road = h(
    'div',
    { class: 'eco-road', attrs: { 'aria-hidden': 'true' } },
    ...(o.reduce ? [] : [0, 1, 2].map((k) => h('span', { class: `eco-car c${k}` }, icon('car')))),
    ...[8, 23, 38, 54, 70, 86].map((t, k) => {
      const tree = h('span', { class: `eco-tree ${k % 2 === 0 ? 'a' : 'b'}` }, icon('tree'));
      tree.style.top = `${t}%`;
      return tree;
    }),
  );

  const hornbill = HORNBILL_MISSION;
  const hst = statusOf(save, hornbill);
  const root = page(
    'NLEX Eco Adventure',
    o.onBack,
    strip,
    h('div', { class: 'navie-row eco-navie-row' }, navieImg, bubble, h('button', { class: 'text-btn', text: 'Welcome', attrs: { type: 'button' }, onClick: () => o.onBriefing() })),
    h('div', { class: 'eco-compass muted small-text' }, icon('next'), h('span', { text: 'Northbound: Balintawak to Dau. Made-up missions, simulated numbers.' })),
    h('div', { class: 'eco-map' }, road, ...stops),
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'kicker', text: 'Wildlife mission' }),
      h(
        'button',
        { class: `ops-mission ${hst}`, attrs: { type: 'button' }, onClick: () => o.onPlay(hornbill) },
        h('span', { class: 'ops-mission-title', text: hornbill.title }),
        h('span', { class: 'ops-mission-goal', text: GOAL[hornbill.id] ?? '' }),
        h('span', { class: `ops-pill ${hst}` }, icon(hst === 'done' ? 'check' : 'play'), h('span', { text: hst === 'done' ? 'Done' : 'Play' })),
      ),
    ),
  );
  root.classList.add('eco-map-screen');
  root.append(detail);
  return root;
}

/* ---- An Eco Run's choice board ---- */

/** A little route drawing for a route option. */
function routeSketch(points: readonly (readonly [number, number])[]): HTMLElement {
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const stops = points
    .slice(1)
    .filter(([x, y], i, all) => !(x === points[0][0] && y === points[0][1]) && all.findIndex(([a, b]) => a === x && b === y) === i)
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#ffc32d" stroke="#17233f" stroke-width="3"/>`)
    .join('');
  const [bx, by] = points[0];
  return h('span', {
    class: 'eco-sketch',
    html: `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${d}" fill="none" stroke="#1464e8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>${stops}<rect x="${bx - 7}" y="${by - 7}" width="14" height="14" rx="3" fill="#2fae6b" stroke="#17233f" stroke-width="3"/></svg>`,
  });
}

export function ecoChoiceBoard(o: { run: EcoRun; navie: string; onPick: (id: string) => void; onBack: () => void; onHow: (id: string) => void }): HTMLElement {
  const options = o.run.options();
  const greenest = options.filter((x) => x.co2Kg !== null).sort((a, b) => (a.co2Kg as number) - (b.co2Kg as number))[0]?.id ?? null;
  let picked: string | null = null;
  const list = h('div', { class: 'vehicle-list eco-options' });
  const go = button('Choose', () => (picked !== null ? o.onPick(picked) : undefined), { class: 'big', iconName: 'check' });
  const render = (): void => {
    list.replaceChildren(
      ...options.map((op) =>
        h(
          'button',
          {
            class: `vehicle-card eco-option ${picked === op.id ? 'on' : ''} ${op.co2Kg === null ? 'no' : ''}`,
            attrs: { type: 'button', 'aria-pressed': String(picked === op.id), 'aria-disabled': String(op.co2Kg === null) },
            onClick: () => {
              if (op.co2Kg !== null) {
                picked = op.id;
                render();
              }
            },
          },
          op.sketch !== undefined ? routeSketch(op.sketch) : null,
          h('span', { class: 'vehicle-name', text: op.label }),
          op.sub !== '' ? h('span', { class: 'eco-option-sub', text: op.sub }) : null,
          op.co2Kg !== null ? h('span', { class: 'vehicle-kg', text: `${kg(op.co2Kg)} CO₂` }) : h('span', { class: 'vehicle-why', text: op.refused ?? '' }),
          op.id === greenest ? h('span', { class: 'vehicle-badge' }, icon('leaf'), h('span', { text: 'Greenest' })) : null,
        ),
      ),
    );
    go.disabled = picked === null;
  };
  render();
  return h(
    'div',
    { class: 'screen menu board eco-choice' },
    h('div', { class: 'board-top' }, h('div', { class: 'kicker', text: o.run.choiceKicker }), h('h2', { text: o.run.choiceTitle })),
    h('div', { class: 'scroll' }, h('div', { class: 'navie-row hint' }, h('img', { class: 'navie-img small', attrs: { src: o.navie, alt: 'Navie' } }), h('p', { class: 'hint-text', text: 'Less CO₂ is greener!' })), list, h('p', { class: 'muted small-text center', text: 'Simulated CO₂ for each choice.' })),
    h('div', { class: 'board-foot' }, h('div', { class: 'title-row' }, button('Back', () => o.onBack(), { class: 'secondary', iconName: 'back' }), h('button', { class: 'text-btn', text: 'See the numbers', attrs: { type: 'button' }, onClick: () => o.onHow(picked ?? greenest ?? options[0].id) })), go),
  );
}

/** How a non-transport Eco Run was worked out: the sums and the assumptions. */
export function ecoHowSheet(title: string, how: EcoHow, onClose: () => void): HTMLElement {
  return sheet(title, onClose, [
    h('p', { class: 'sim-tag', text: 'Simulated' }),
    h('p', { text: how.intro }),
    h('h3', { text: 'The sums' }),
    ...how.sums.map((t) => h('p', { class: 'muted', text: t })),
    h('table', { class: 'facts-table' }, h('tbody', {}, ...how.rows.map(([a, b, c]) => row(a, b, c)))),
    h('p', { class: 'muted small-text', text: how.sources }),
    h('p', { class: 'muted small-text', text: 'Kg CO₂ only, not CO₂e. Emissions, animal rescues and habitat work are separate results.' }),
  ]);
}

/* ---- A briefing, for any mission ---- */

export function missionBriefing(def: MissionDef, navie: string, onGo: () => void, onBack: () => void): HTMLElement {
  return page(
    def.kind === 'wildlife' ? 'Wildlife mission' : 'NLEX mission',
    onBack,
    h(
      'div',
      { class: 'card brief' },
      h('h2', { text: def.title }),
      h('div', { class: 'navie-row' }, h('img', { class: 'navie-img', attrs: { src: navie, alt: 'Navie' } }), h('p', { class: 'lead', text: def.summary })),
      h('ol', { class: 'brief-steps' }, ...def.requiredTasks.map((t, i) => h('li', {}, h('span', { class: 'brief-num', text: String(i + 1) }), h('span', { text: t })))),
      h('p', { class: 'muted small-text', text: def.fiction }),
    ),
    button('Let’s go!', onGo, { class: 'big', iconName: 'play' }),
  );
}

/* ---- The toll plaza console ---- */

const MODE_LABEL: Record<LaneMode, string> = { tag: 'RFID', cash: 'Cash', closed: 'Closed' };

/** What is wrong with a lane setting, in a few words. */
function laneProblems(P: PlazaProblem, modes: readonly LaneMode[], r: PlazaResult): string[] {
  const out: string[] = [];
  if (modes.filter((m) => m === 'cash').length > P.cashStaff) {
    out.push(L.gridLaneHintStaff);
  }
  for (const i of P.tagDown ?? []) {
    if (modes[i] === 'tag') {
      out.push(`Lane ${P.lanes[i].id}’s RFID is down: cash or closed.`);
    }
  }
  const has = (m: LaneMode, wide: boolean): boolean => P.lanes.some((l, i) => modes[i] === m && (!wide || l.wide));
  if (!has('tag', false)) {
    out.push('Cars with RFID tags need an RFID lane.');
  } else if (!has('tag', true)) {
    out.push('Trucks with tags need a wide RFID lane: 1 or 6.');
  }
  if (!has('cash', false)) {
    out.push('Cash cars need a cash lane.');
  } else if (!has('cash', true)) {
    out.push('Cash trucks need a wide cash lane: 1 or 6.');
  }
  if (out.length === 0 && !plazaSolved(r)) {
    out.push(r.leftWaiting > P.lanes.length ? 'The lines keep growing. Open more lanes!' : 'One lane is too slow. Spread the cars out.');
  }
  return out;
}

/** Working settings, worked out once per plaza the first time a hint is asked for. */
const SOLVED = new Map<string, LaneMode[][]>();
function workingSettings(P: PlazaProblem): LaneMode[][] {
  const key = (P.tagDown ?? []).join(',');
  let list = SOLVED.get(key);
  if (list === undefined) {
    list = allModeSets(P)
      .filter((m) => P.lanes.every((l, i) => !l.underRepair || m[i] === 'closed'))
      .filter((m) => plazaSolved(simulatePlaza(P, m)));
    SOLVED.set(key, list);
  }
  return list;
}

export function lanePuzzle(o: { plaza?: PlazaProblem; initial: readonly LaneMode[]; navie: string; reduce: boolean; onDone: (modes: LaneMode[] | null) => void; onHow: (r: PlazaResult) => void }): HTMLElement {
  const P = o.plaza ?? BOCAUE_PLAZA;
  let modes: LaneMode[] = o.initial.map((m, i) => (P.lanes[i].underRepair ? 'closed' : m));
  const down = P.tagDown ?? [];
  const tips = [L.gridLaneHintCash, L.gridLaneHintTruck, L.gridLaneHintStaff, L.gridLaneHintRepair];
  let tipAt = 0;
  const lanesEl = h('div', { class: 'lanes' });
  const status = h('div', { class: 'lane-problems', attrs: { role: 'status', 'aria-live': 'polite' } });
  const go = button('Open the plaza!', () => (plazaSolved(simulatePlaza(P, modes)) ? o.onDone(modes) : undefined), { class: 'big', iconName: 'check' });
  const tipText = h('p', { class: 'hint-text', text: 'Tap a lane to change it.' });
  const render = (): void => {
    const r = simulatePlaza(P, modes);
    lanesEl.replaceChildren(
      ...P.lanes.map((lane, i) => {
        const rep = r.lanes[i];
        const fill = h('div', { class: 'lane-fill' });
        fill.style.setProperty('--q', String(Math.min(1, rep.averageMin / 6)));
        const cycle = (): void => {
          if (lane.underRepair) {
            return;
          }
          const order: LaneMode[] = ['tag', 'cash', 'closed'];
          modes = modes.map((m, k) => (k === i ? order[(order.indexOf(m) + 1) % order.length] : m));
          render();
        };
        return h(
          'button',
          { class: `lane ${modes[i]} ${lane.underRepair ? 'repair' : ''} ${down.includes(i) ? 'broken' : ''}`, attrs: { type: 'button', 'aria-label': `Lane ${lane.id}${lane.wide ? ', wide' : ''}: ${MODE_LABEL[modes[i]]}${lane.underRepair ? ', under repair' : ''}` }, onClick: cycle },
          h('span', { class: 'lane-num', text: String(lane.id) }),
          h('span', { class: 'lane-mode', text: lane.underRepair ? 'Repair' : MODE_LABEL[modes[i]] }),
          lane.wide ? h('span', { class: 'lane-tag', text: 'Wide' }) : h('span', { class: 'lane-tag blank', text: ' ' }),
          h('span', { class: 'lane-q' }, fill),
        );
      }),
    );
    const list = laneProblems(P, modes, r);
    status.replaceChildren(list.length === 0 ? h('div', { class: 'verdict good' }, icon('check'), h('span', { text: 'Traffic moving!' })) : h('div', { class: 'verdict bad' }, icon('warn'), h('span', { text: list[0] })));
    go.disabled = list.length > 0;
  };
  render();
  /* A hint sets one lane right: towards the working setting closest to what is on screen. */
  const hint = (): void => {
    const near = workingSettings(P)
      .map((m) => ({ m, diff: m.filter((x, i) => x !== modes[i]).length }))
      .sort((a, b) => a.diff - b.diff || simulatePlaza(P, a.m).co2Kg - simulatePlaza(P, b.m).co2Kg)[0];
    const i = near === undefined ? -1 : near.m.findIndex((x, k) => x !== modes[k]);
    if (near === undefined || i < 0) {
      tipText.textContent = tips[tipAt % tips.length];
      tipAt += 1;
      return;
    }
    modes = modes.map((m, k) => (k === i ? near.m[i] : m));
    tipText.textContent = `Lane ${P.lanes[i].id}: ${MODE_LABEL[near.m[i]]}.`;
    render();
  };
  return h(
    'div',
    { class: 'screen menu board' },
    h('div', { class: 'board-top' }, h('div', { class: 'kicker', text: 'Control room' }), h('h2', { text: 'Open the lanes!' })),
    h(
      'div',
      { class: 'scroll' },
      h('div', { class: 'navie-row hint' }, h('img', { class: 'navie-img small', attrs: { src: o.navie, alt: 'Navie' } }), tipText, h('button', { class: 'text-btn', text: 'Hint', attrs: { type: 'button' }, onClick: hint })),
      lanesEl,
      h('div', { class: 'lane-legend' }, h('span', { class: 'chip tag', text: 'RFID: fast' }), h('span', { class: 'chip cash', text: 'Cash: slow' }), h('span', { class: 'chip closed', text: 'Closed' })),
    ),
    h('div', { class: 'board-foot' }, status, h('div', { class: 'title-row' }, button('Back', () => o.onDone(null), { class: 'secondary', iconName: 'back' }), h('button', { class: 'text-btn', text: 'See the numbers', attrs: { type: 'button' }, onClick: () => o.onHow(simulatePlaza(P, modes)) })), go),
  );
}

/* ---- Eco Delivery Rush: the vehicle ---- */

const FLEET_NAME: Record<string, string> = { 'two-vans': 'Two vans', 'one-van': 'One van', evan: 'Electric van', 'pickup-all': 'Pickup truck', 'van-pickup': 'Van and pickup' };
const WHY_NOT: Record<Violation['kind'], string> = {
  enclosed: 'The kit needs a roof',
  capacity: 'Too full',
  seats: 'Not enough seats',
  deadline: 'Too late',
  battery: 'Battery too low',
  availability: 'Not free yet',
  route: 'Road closed',
  unserved: 'Leaves things behind',
  overserved: 'Counted twice',
  compatibility: 'Loads must stay apart',
};

/** Pick the vehicle: each card shows its simulated CO2 for the round trip, and the greenest is marked. */
export function vehicleChooser(o: { problem: TransportProblem; choices: readonly string[]; routeId: string; departureId: string; navie: string; onPick: (fleetId: string) => void; onBack: () => void; onHow: (fleetId: string) => void }): HTMLElement {
  const results = o.choices.map((id) => ({ id, r: evaluatePlan(o.problem, { fleetId: id, routeId: o.routeId, departureId: o.departureId }) }));
  const greenest = results.filter((x) => x.r.feasible).sort((a, b) => a.r.co2Kg - b.r.co2Kg)[0]?.id ?? null;
  let picked: string | null = null;
  const list = h('div', { class: 'vehicle-list' });
  const go = button('Choose', () => (picked !== null ? o.onPick(picked) : undefined), { class: 'big', iconName: 'check' });
  const render = (): void => {
    list.replaceChildren(
      ...results.map(({ id, r }) => {
        const trips = r.trips.length;
        return h(
          'button',
          {
            class: `vehicle-card ${picked === id ? 'on' : ''} ${r.feasible ? '' : 'no'}`,
            attrs: { type: 'button', 'aria-pressed': String(picked === id), 'aria-disabled': String(!r.feasible) },
            onClick: () => {
              if (r.feasible) {
                picked = id;
                render();
              }
            },
          },
          h('span', { class: 'vehicle-icons' }, ...Array.from({ length: trips }, () => icon('truck'))),
          h('span', { class: 'vehicle-name', text: FLEET_NAME[id] ?? id }),
          r.feasible ? h('span', { class: 'vehicle-kg', text: `${kg(r.co2Kg)} CO₂` }) : h('span', { class: 'vehicle-why', text: WHY_NOT[r.violations[0]?.kind ?? 'route'] }),
          id === greenest ? h('span', { class: 'vehicle-badge' }, icon('leaf'), h('span', { text: 'Greenest' })) : null,
        );
      }),
    );
    go.disabled = picked === null;
  };
  render();
  return h(
    'div',
    { class: 'screen menu board' },
    h('div', { class: 'board-top' }, h('div', { class: 'kicker', text: 'Run to the ridge, 10:00 AM' }), h('h2', { text: 'Choose a vehicle' })),
    h('div', { class: 'scroll' }, h('div', { class: 'navie-row hint' }, h('img', { class: 'navie-img small', attrs: { src: o.navie, alt: 'Navie' } }), h('p', { class: 'hint-text', text: 'Less CO₂ is greener!' })), list, h('p', { class: 'muted small-text center', text: 'CO₂ for the round trip. Simulated.' })),
    h('div', { class: 'board-foot' }, h('div', { class: 'title-row' }, button('Back', () => o.onBack(), { class: 'secondary', iconName: 'back' }), h('button', { class: 'text-btn', text: 'See the numbers', attrs: { type: 'button' }, onClick: () => o.onHow(picked ?? greenest ?? o.choices[0]) })), go),
  );
}

export function plazaHow(r: PlazaResult, onClose: () => void): HTMLElement {
  const P = BOCAUE_PLAZA;
  const jam = simulatePlaza(P, P.jammed);
  return sheet('How the plaza was calculated', onClose, [
    h('p', { class: 'sim-tag', text: 'Simulated' }),
    h('p', { text: 'One hour of made-up traffic at a made-up plaza, stepped through second by second. Vehicles arrive evenly and join the open lane they may use with the least work ahead of them.' }),
    h('h3', { text: 'What is counted' }),
    h('p', { class: 'muted', text: 'Time each vehicle is stopped with its engine on, in line and at the booth. Driving through is the same either way, so it is left out. Vehicles still waiting at the end are counted only up to the end of the hour.' }),
    h('h3', { text: 'The sums' }),
    h('p', { class: 'muted', text: `Fuel = hours stopped × idling fuel per hour (cars ${fmt(VEHICLES.sedan.idleLPerH, 2)} L/h, trucks ${fmt(VEHICLES.truck.idleLPerH, 2)} L/h). CO₂ = fuel × ${fmt(FACTORS.gasoline.value, 2)} kg/L for cars (gasoline) and ${fmt(FACTORS.diesel.value, 2)} kg/L for trucks (diesel).` }),
    h('p', { class: 'muted', text: `Seconds at the booth: tag car ${P.serviceSeconds.tagCar}, cash car ${P.serviceSeconds.cashCar}, tag truck ${P.serviceSeconds.tagTruck}, cash truck ${P.serviceSeconds.cashTruck}. All invented for the game.` }),
    h('h3', { text: 'This hour' }),
    h('table', { class: 'facts-table' }, h('tbody', {}, row('Jammed plaza', `${fmt(jam.carHours + jam.truckHours)} h stopped`, kg(jam.co2Kg)), row('Your lanes', `${fmt(r.carHours + r.truckHours)} h stopped`, kg(r.co2Kg)))),
    h('p', { class: 'muted small-text', text: 'Idling figures: Argonne National Laboratory, as on the transport board. Fuel factors: US EPA, illustrative for the Philippines. Kg CO₂ only, not CO₂e.' }),
  ]);
}

/* ---- The depot's upgrade planner ---- */

export function energyPlanner(o: { navie: string; locked?: readonly Upgrade[]; onDone: (picks: Upgrade[] | null) => void; onHow: (picks: Upgrade[]) => void }): HTMLElement {
  const locked = o.locked ?? [];
  let picks: Upgrade[] = [...locked];
  const repaired = { repairs: ['sensor', 'leak', 'idling'] as const, upgrades: [] as Upgrade[] };
  const now = facilityDay({ repairs: [...repaired.repairs], upgrades: [] });
  const list = h('div', { class: 'upgrade-list' });
  const foot = h('div', { class: 'lane-totals' });
  const verdict = h('div', { class: 'lane-problems', attrs: { role: 'status', 'aria-live': 'polite' } });
  const go = button('Order these upgrades', () => (picks.length > 0 && crewHours(picks) <= CREW_HOURS ? o.onDone(picks) : undefined), { class: 'big', iconName: 'check' });
  const hintText = h('p', { class: 'hint-text', text: 'Pick what fits in the crew’s day.' });
  const render = (): void => {
    const day = facilityDay({ repairs: [...repaired.repairs], upgrades: picks });
    const hours = crewHours(picks);
    list.replaceChildren(
      ...UPGRADE_OPTIONS.map((u) => {
        const on = picks.includes(u.id);
        const fixed = locked.includes(u.id);
        const alone = facilityDay({ repairs: [...repaired.repairs], upgrades: [u.id] });
        return h(
          'button',
          { class: `upgrade ${on ? 'on' : ''} ${fixed ? 'fixed' : ''}`, attrs: { type: 'button', 'aria-pressed': String(on), 'aria-disabled': String(fixed) }, onClick: () => {
            if (fixed) {
              return;
            }
            picks = on ? picks.filter((x) => x !== u.id) : [...picks, u.id];
            render();
          } },
          h('span', { class: 'upgrade-body' }, h('span', { class: 'upgrade-title', text: fixed ? `${u.label} (this mission’s job)` : u.label }), h('span', { class: 'upgrade-text', text: `${u.blurb} On its own: ${kg(now.co2Kg - alone.co2Kg)} less a day.` })),
          h('span', { class: 'upgrade-cost' }, fixed ? h('span', { text: `${u.hours} h` }) : on ? icon('check') : h('span', { text: `${u.hours} h` })),
        );
      }),
    );
    const meter = h('div', { class: 'crew-meter' });
    meter.style.setProperty('--crew', String(Math.min(1, hours / CREW_HOURS)));
    meter.classList.toggle('over', hours > CREW_HOURS);
    foot.replaceChildren(
      h('div', { class: 'lt-row' }, h('span', { text: 'Crew time' }), h('b', { text: `${hours} of ${CREW_HOURS} h` })),
      meter,
      h('div', { class: 'lt-row' }, h('span', { text: 'Depot today, after your repairs' }), h('b', { text: `${kg(now.co2Kg)} a day` })),
      h('div', { class: 'lt-row' }, h('span', { text: 'With these upgrades' }), h('b', { text: `${kg(day.co2Kg)} a day` }), h('span', { class: 'sim-tag', text: 'Simulated' })),
    );
    verdict.replaceChildren(
      hours > CREW_HOURS
        ? h('div', { class: 'verdict bad' }, icon('warn'), h('span', { text: `That is ${hours} hours of work, and the installers have ${CREW_HOURS}.` }))
        : picks.length === 0
          ? h('div', { class: 'verdict worse' }, icon('info'), h('span', { text: 'Choose at least one upgrade.' }))
          : h('div', { class: 'verdict good' }, icon('check'), h('span', { text: 'That fits in the crew’s day.' })),
    );
    go.disabled = picks.length === 0 || hours > CREW_HOURS;
  };
  render();
  return h(
    'div',
    { class: 'screen menu board' },
    h('div', { class: 'board-top' }, h('div', { class: 'kicker', text: 'Depot office' }), h('h2', { text: locked.length > 0 ? 'Balance the crew day' : 'Choose the upgrades' })),
    h('div', { class: 'scroll' }, h('div', { class: 'navie-row hint' }, h('img', { class: 'navie-img small', attrs: { src: o.navie, alt: 'Navie' } }), hintText), list),
    h('div', { class: 'board-foot' }, foot, verdict, h('div', { class: 'title-row' }, button('Back', () => o.onDone(null), { class: 'secondary', iconName: 'back' }), h('button', { class: 'text-btn', text: 'How this was calculated', attrs: { type: 'button' }, onClick: () => o.onHow(picks) })), go),
  );
}

export function depotHow(picks: readonly Upgrade[], onClose: () => void): HTMLElement {
  const a = ASSUMPTIONS;
  const before = facilityDay({ repairs: [], upgrades: [] });
  const after = facilityDay({ repairs: ['sensor', 'leak', 'idling'], upgrades: [...picks] });
  return sheet('How the depot was calculated', onClose, [
    h('p', { class: 'sim-tag', text: 'Simulated' }),
    h('p', { text: 'One ordinary day at a made-up depot. Every wattage and hour below is a game assumption.' }),
    h('h3', { text: 'What is counted' }),
    h('p', { class: 'muted', text: 'Electricity drawn from the grid, and diesel burned by trucks parked with engines running. Solar made on the roof reduces what is drawn, up to what the depot uses by day. Making the panels and lamps is not counted.' }),
    h('h3', { text: 'The assumptions' }),
    h('table', { class: 'facts-table' }, h('tbody', {},
      row('Yard lamps', `${a.floods.count} × ${a.floods.wattsOld} W, LED ${a.floods.wattsLed} W`, `${a.floods.nightHours} h a night, 24 h with the sensor taped over`),
      row('Workshop tubes', `${a.tubes.count} × ${a.tubes.wattsOld} W, LED ${a.tubes.wattsLed} W`, `${a.tubes.hours} h a day`),
      row('Compressor', `${a.compressor.kw} kW`, `${Math.round(a.compressor.dutyGood * 100)}% of ${a.compressor.hours} h, ${Math.round(a.compressor.dutyLeaking * 100)}% with the leak`),
      row('Trucks idling', `${a.trucks.count} trucks`, `${a.trucks.idleHoursNow} h a day each, ${a.trucks.idleHoursFixed} h when asked, ${a.trucks.idleHoursRule} h with the rule`),
      row('Solar roof', `${a.solar.kWp} kW`, `${a.solar.kWhPerKWpDay} kWh per kW a day`),
    )),
    h('h3', { text: 'The sums' }),
    h('p', { class: 'muted', text: `CO₂ = grid kWh × ${FACTORS.grid.value} kg/kWh (Philippine DOE, Luzon-Visayas grid) + idling diesel × ${fmt(FACTORS.diesel.value, 2)} kg/L.` }),
    h('table', { class: 'facts-table' }, h('tbody', {}, row('As the Wasteworks left it', `${fmt(before.gridKWh)} kWh, ${fmt(before.idleL)} L`, kg(before.co2Kg)), row('Repaired, with your upgrades', `${fmt(after.gridKWh)} kWh, ${fmt(after.idleL)} L`, kg(after.co2Kg)))),
  ]);
}

/* ---- Environmental Progress Dashboard ---- */

export function progressDashboard(o: { save: SaveData; ecoUpgrades: readonly string[]; onBack: () => void }): HTMLElement {
  const p = progress(o.save, o.ecoUpgrades);
  const tile = (value: string, label: string, sim = false): HTMLElement => h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: value }), h('div', { class: 'stat-label', text: label }), sim ? h('span', { class: 'sim-tag tiny', text: 'Simulated' }) : null);
  const rows = MISSIONS.filter((m) => o.save.missions[m.id] !== undefined).map((m) => {
    const r = o.save.missions[m.id];
    return h('tr', {}, h('td', { text: m.title }), h('td', { class: 'num', text: kg(r.bestSavedKg) }), h('td', { text: m.id === 'nlex-gridlock' ? 'one hour at the plaza' : m.id === 'nlex-eco' ? 'a depot day and a delivery' : 'one delivery run' }));
  });
  return page(
    'Environmental Progress',
    o.onBack,
    h('p', { class: 'muted small-text', text: 'Each measure stands on its own. None of them converts into another.' }),
    h('div', { class: 'stat-grid' }, tile(kg(p.savedKg), 'CO₂ less than the baseline plans', true), tile(`${p.nlexDone} of ${p.nlexTotal}`, 'NLEX missions completed'), tile(String(p.environment), 'NLEX environmental objectives')),
    h('div', { class: 'stat-grid' }, tile(String(p.animals), 'individual animals helped'), tile(`${p.species} of 100`, 'species helped'), tile(String(p.habitats), 'habitat objectives')),
    h('div', { class: 'stat-grid' }, tile(`${o.ecoUpgrades.filter((id) => { const u = UPGRADES.find((x) => x.id === id); return u !== undefined && upgradeUnlocked(o.save, u); }).length} / ${p.ecoUpgrades}`, 'eco upgrades unlocked / built'), tile(String(o.save.guardianPoints), 'Guardian Points, a game currency'), tile(String(p.missionsDone), 'missions completed in all')),
    rows.length > 0
      ? h('div', { class: 'card' }, h('h3', { text: 'Where the CO₂ figure comes from' }), h('table', { class: 'facts-table' }, h('tbody', {}, ...rows)), h('p', { class: 'muted small-text', text: 'Each mission’s best result counts once, for the time span its scenario covers. A plan worse than the baseline counts against the total. All simulated.' }))
      : h('div', { class: 'card' }, h('p', { class: 'muted', text: 'Finish a mission and its simulated result appears here.' })),
  );
}

/* ---- Results for an NLEX mission ---- */

/** The short cheer for a real saving, per mission. Only shown when the result really is lower. */
const GOOD_LINES: Record<string, string> = {
  'nlex-gridlock': 'Less idling, less CO₂!',
  'nlex-eco': 'Sunshine instead of grid power!',
  'nlex-delivery': 'A greener way to deliver!',
};

/**
 * Counts a number up from zero for show, then settles on exactly the text it would have shown anyway:
 * the animation never changes a value. Reduced motion shows the final text at once.
 */
function countUp(el: HTMLElement, target: number, fmt: (v: number) => string, delayMs: number): void {
  const final = fmt(target);
  const still = document.documentElement.classList.contains('reduce-motion') || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (still || !Number.isFinite(target)) {
    el.textContent = final;
    return;
  }
  el.textContent = fmt(0);
  const dur = 700;
  let start = -1;
  const step = (now: number): void => {
    if (start < 0) {
      start = now + delayMs;
    }
    const k = Math.min(1, Math.max(0, (now - start) / dur));
    const e = 1 - (1 - k) ** 3;
    el.textContent = k >= 1 ? final : fmt(target * e);
    if (k < 1 && el.isConnected !== false) {
      requestAnimationFrame(step);
    } else {
      el.textContent = final;
    }
  };
  requestAnimationFrame(step);
}

/** Baseline, result, saving and percentage, worked out from the mission's own parts. */
function carbonCard(def: MissionDef, parts: readonly SimPart[]): HTMLElement {
  if (parts.length === 0) {
    return h('div', { class: 'card carbon-card none' }, icon('info'), h('p', { text: 'No CO₂ is claimed here: this mission is about the place itself, not a trip or energy.' }));
  }
  const base = parts.reduce((a, p) => a + p.baselineKg, 0);
  const plan = parts.reduce((a, p) => a + p.planKg, 0);
  const saved = base - plan;
  const pct = base > 0 ? (saved / base) * 100 : null;
  const line = saved > 0.05 ? (ECO_RUNS[def.id]?.goodLine ?? GOOD_LINES[def.id] ?? 'Less CO₂ than the usual way!') : saved < -0.05 ? 'More CO₂ than the usual way this time.' : 'About the same as the usual way.';
  let order = 0;
  /* Each tile pops in a beat after the last, and its number counts up to the simulated value. */
  const cell = (label: string, value: number, fmt: (v: number) => string, cls = ''): HTMLElement => {
    const num = h('div', { class: 'carbon-value', text: fmt(value) });
    const tile = h('div', { class: `carbon-cell ${cls}` }, num, h('div', { class: 'carbon-label', text: label }));
    tile.style.setProperty('--i', String(order));
    countUp(num, value, fmt, 250 + order * 140);
    order += 1;
    return tile;
  };
  const savedFmt = (v: number): string => (saved >= 0 ? kg(v) : `−${kg(v)}`);
  return h(
    'div',
    { class: `card carbon-card ${saved < -0.05 ? 'worse' : ''}` },
    h('div', { class: 'carbon-grid' }, cell('Baseline CO₂', base, kg), cell('Your CO₂', plan, kg, 'you'), cell('CO₂ saved', Math.abs(saved), savedFmt, 'saved'), pct !== null ? cell('Saved', pct, (v) => `${v.toFixed(0)}%`, 'saved') : null),
    h('div', { class: 'carbon-foot' }, h('p', { class: 'carbon-line', text: line }), h('span', { class: 'sim-tag tiny', text: 'Simulated' })),
  );
}

export function nlexResults(o: { def: MissionDef; report: CompletionReport; parts: (SimPart & { lines: string[] })[]; navie: string; achievements?: readonly string[]; next?: string | null; onHow: (id: string) => void; onNext: () => void }): HTMLElement {
  const { def, report } = o;
  const column = (label: string, value: number, max: number, cls: string): HTMLElement => {
    const fill = h('div', { class: `col-fill ${cls}` });
    fill.style.setProperty('--grow', String(Math.max(0.03, value / Math.max(max, 0.001))));
    return h('div', { class: 'col' }, h('div', { class: 'col-value', text: kg(value) }), h('div', { class: 'col-track' }, fill), h('div', { class: 'col-label', text: label }));
  };
  const chip = (name: Parameters<typeof icon>[0], text: string, sim = false): HTMLElement => h('div', { class: 'result-chip' }, icon(name), h('span', { text }), sim ? h('span', { class: 'sim-tag tiny', text: 'Simulated' }) : null);
  /* The full breakdown, one tap away. */
  const details = h(
    'div',
    { class: 'result-details hidden' },
    ...o.parts.map((part) => {
      const s = part.baselineKg - part.planKg;
      const pct = part.baselineKg > 0 ? (s / part.baselineKg) * 100 : null;
      return h(
        'div',
        { class: 'card' },
        h('div', { class: 'tally-head' }, icon('truck'), h('h3', { text: part.label }), h('span', { class: 'sim-tag', text: 'Simulated' })),
        h('div', { class: 'columns' }, column('Before', part.baselineKg, Math.max(part.baselineKg, part.planKg), 'base'), column('You', part.planKg, Math.max(part.baselineKg, part.planKg), 'you')),
        h('p', { class: `tally ${s < 0 ? 'worse' : ''}`, text: Math.abs(s) < 0.05 ? 'About the same as before.' : `${kg(Math.abs(s))} CO₂ ${s > 0 ? 'less' : 'more'}${pct !== null ? ` (${Math.abs(pct).toFixed(0)}%)` : ''}` }),
        ...part.lines.map((t) => h('p', { class: 'muted reason', text: t })),
        h('button', { class: 'text-btn', text: 'How this was calculated', attrs: { type: 'button' }, onClick: () => o.onHow(part.id) }),
      );
    }),
    h('p', { class: 'muted small-text', text: report.firstCompletion ? 'Points are a game currency, not CO₂ or animals.' : 'Already counted: replays do not add to the totals.' }),
    h('p', { class: 'muted small-text', text: 'Less CO₂ does not rescue an animal or heal a place by itself. The game keeps these results apart.' }),
  );
  const more = h('button', { class: 'text-btn', text: o.parts.length > 0 ? 'See the numbers' : 'More', attrs: { type: 'button', 'aria-expanded': 'false' } });
  more.addEventListener('click', () => {
    const open = details.classList.toggle('hidden') === false;
    more.setAttribute('aria-expanded', String(open));
    more.textContent = open ? 'Hide the numbers' : o.parts.length > 0 ? 'See the numbers' : 'More';
  });
  return h(
    'div',
    { class: 'screen menu results' },
    h(
      'div',
      { class: 'scroll no-top' },
      h('div', { class: 'result-head' }, h('div', { class: 'kicker light', text: def.title }), h('h2', { text: 'Mission complete!' }), h('img', { class: 'result-bird navie-result', attrs: { src: o.navie, alt: 'Navie' } }), h('p', { class: 'result-cheer', text: DONE_LINES[def.id] ?? L.celebrate })),
      carbonCard(def, o.parts),
      h(
        'div',
        { class: 'result-chips' },
        ...def.environmentObjectives.slice(0, 1).map((ob) => chip('leaf', ob.label)),
        chip('star', report.points > 0 ? `+${report.points} points` : 'Already counted'),
        ...(o.achievements ?? []).map((t) => chip('check', t)),
      ),
      more,
      details,
      button(o.next ?? 'Back to the Command Center', o.onNext, { class: 'big', iconName: 'next' }),
    ),
  );
}

function row(a: string, b: string, c: string): HTMLElement {
  return h('tr', {}, h('td', { text: a }), h('td', { class: 'num', text: b }), h('td', { text: c }));
}

function sheet(title: string, onClose: () => void, body: HTMLElement[]): HTMLElement {
  return h(
    'div',
    { class: 'overlay', attrs: { role: 'dialog', 'aria-label': title } },
    h('div', { class: 'sheet' }, h('div', { class: 'sheet-top' }, h('h2', { text: title }), h('button', { class: 'round-btn', label: 'Close', attrs: { type: 'button' }, onClick: () => onClose() }, icon('cross'))), h('div', { class: 'sheet-body' }, ...body)),
  );
}
