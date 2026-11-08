import { DONE_LINES, NLEX_LINES as L } from '../../core/content';
import { FACTORS, VEHICLES } from '../../core/emissions';
import { ASSUMPTIONS, crewHours, CREW_HOURS, facilityDay, UPGRADE_OPTIONS, type Upgrade } from '../../core/facility';
import { HORNBILL_MISSION, MISSIONS, type MissionDef } from '../../core/mission';
import { missionOpen, NLEX_STOPS, progress } from '../../core/nlex';
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

/** Each stop's simulated condition, before and after its mission. Made-up, like the places. */
const CONDITION: Record<string, [string, string]> = {
  'nlex-gridlock': ['Toll plaza jammed', 'Toll plaza flowing'],
  'nlex-river': ['Creek blocked', 'Creek flowing'],
  'nlex-eco': ['Solar roof off', 'Solar roof on'],
  'nlex-delivery': ['Supplies waiting', 'Supplies sent'],
};

export type MissionStatus = 'done' | 'open' | 'locked';
const statusOf = (save: SaveData, def: MissionDef): MissionStatus => (save.missions[def.id] !== undefined ? 'done' : missionOpen(save, def.id) ? 'open' : 'locked');

/* ---- The NLEX Operations Board ---- */

export function opsBoardScreen(o: { save: SaveData; navie: string; onMission: (def: MissionDef) => void; onBriefing: () => void; onBack: () => void }): HTMLElement {
  const missionCard = (def: MissionDef): HTMLElement => {
    const st = statusOf(o.save, def);
    const best = o.save.missions[def.id];
    return h(
      'button',
      { class: `ops-mission ${st}`, attrs: { type: 'button', 'aria-disabled': String(st === 'locked') }, onClick: () => (st !== 'locked' ? o.onMission(def) : undefined) },
      h('span', { class: 'ops-mission-title', text: def.title }),
      h('span', { class: 'ops-mission-goal', text: GOAL[def.id] ?? '' }),
      h(
        'span',
        { class: `ops-pill ${st}` },
        st === 'done' ? icon('check') : st === 'locked' ? icon('lock') : icon('play'),
        h('span', { text: st === 'done' ? (best.bestSavedKg > 0.05 ? `Done · ${kg(best.bestSavedKg)} less CO₂` : 'Done') : st === 'locked' ? 'After the Gridlock' : 'Play' }),
      ),
    );
  };
  /* North at the top: Dau first, Balintawak last. */
  const stops = [...NLEX_STOPS].reverse().map((stop) => {
    const def = stop.missionId === null ? null : MISSIONS.find((m) => m.id === stop.missionId) ?? null;
    let body: HTMLElement;
    if (stop.id === 'balintawak') {
      body = h('button', { class: 'ops-mission open', attrs: { type: 'button' }, onClick: () => o.onBriefing() }, h('span', { class: 'ops-mission-title', text: 'Navie’s welcome' }), h('span', { class: 'ops-mission-goal', text: 'What the Command Center does' }));
    } else if (def !== null) {
      body = missionCard(def);
    } else {
      body = h('div', { class: 'ops-mission soon' }, h('span', { class: 'ops-mission-title', text: stop.theme }), h('span', { class: 'ops-pill locked' }, icon('lock'), h('span', { text: 'Coming soon' })));
    }
    const done = def !== null && o.save.missions[def.id] !== undefined;
    return h(
      'div',
      { class: 'ops-stop' },
      h('div', { class: `ops-dot ${done ? 'done' : def !== null || stop.id === 'balintawak' ? 'live' : ''}` }),
      h(
        'div',
        { class: 'ops-stop-body' },
        h('div', { class: 'ops-stop-name', text: stop.name }),
        h('div', { class: 'ops-stop-theme', text: stop.theme }),
        def !== null && CONDITION[def.id] !== undefined ? h('div', { class: `ops-condition ${done ? 'good' : 'bad'}` }, h('span', { text: CONDITION[def.id][done ? 1 : 0] }), h('span', { class: 'sim-tag tiny', text: 'Simulated' })) : null,
        body,
      ),
    );
  });
  const hornbill = HORNBILL_MISSION;
  return page(
    'NLEX Operations Board',
    o.onBack,
    h('div', { class: 'navie-row' }, h('img', { class: 'navie-img', attrs: { src: o.navie, alt: 'Navie' } }), h('p', { class: 'lead-line', text: L.idle })),
    h('p', { class: 'muted small-text', text: 'Made-up missions. All numbers are simulated.' }),
    h('div', { class: 'ops-line' }, ...stops),
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'kicker', text: 'Wildlife missions' }),
      missionCard(hornbill),
    ),
  );
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

export function nlexResults(o: { def: MissionDef; report: CompletionReport; parts: (SimPart & { lines: string[] })[]; navie: string; achievements?: readonly string[]; next?: string | null; onHow: (id: string) => void; onNext: () => void }): HTMLElement {
  const { def, report } = o;
  const column = (label: string, value: number, max: number, cls: string): HTMLElement => {
    const fill = h('div', { class: `col-fill ${cls}` });
    fill.style.setProperty('--grow', String(Math.max(0.03, value / Math.max(max, 0.001))));
    return h('div', { class: 'col' }, h('div', { class: 'col-value', text: kg(value) }), h('div', { class: 'col-track' }, fill), h('div', { class: 'col-label', text: label }));
  };
  const saved = o.parts.reduce((a, p) => a + p.baselineKg - p.planKg, 0);
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
      h(
        'div',
        { class: 'result-chips' },
        ...def.environmentObjectives.slice(0, 1).map((ob) => chip('leaf', ob.label)),
        o.parts.length > 0 ? chip('truck', Math.abs(saved) < 0.05 ? 'Same CO₂ as before' : `${kg(Math.abs(saved))} ${saved > 0 ? 'less' : 'more'} CO₂`, true) : null,
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
