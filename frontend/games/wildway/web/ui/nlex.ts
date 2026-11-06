import { NLEX_LINES as L } from '../../core/content';
import { FACTORS, VEHICLES } from '../../core/emissions';
import { ASSUMPTIONS, crewHours, CREW_HOURS, facilityDay, UPGRADE_OPTIONS, type Upgrade } from '../../core/facility';
import { HORNBILL_MISSION, MISSIONS, type MissionDef } from '../../core/mission';
import { missionOpen, NLEX_STOPS, progress } from '../../core/nlex';
import { BOCAUE_PLAZA, CLASS_LABEL, plazaSolved, simulatePlaza, type LaneMode, type PlazaProblem, type PlazaResult, type VehicleClass } from '../../core/plaza';
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
  'nlex-gridlock': 'Cut the time cars spend stopped with engines running',
  'nlex-river': 'Collect sorted waste with fewer, cleaner trips',
  'nlex-eco': 'Cut a day of wasted energy at the depot',
  'hornbill-homecoming': 'Supply the rescue with a lower-emission run',
};

/** Each stop's simulated condition, before and after its mission. Made-up, like the places. */
const CONDITION: Record<string, [string, string]> = {
  'nlex-gridlock': ['Toll plaza jammed', 'Toll plaza flowing'],
  'nlex-river': ['Creek blocked', 'Creek flowing'],
  'nlex-eco': ['Depot wasting energy', 'Depot running lean'],
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
        h('span', { text: st === 'done' ? `Done. Best: ${kg(best.bestSavedKg)} CO₂ less, simulated` : st === 'locked' ? 'Opens after The Great NLEX Gridlock' : 'Open' }),
      ),
    );
  };
  /* North at the top: Dau first, Balintawak last. */
  const stops = [...NLEX_STOPS].reverse().map((stop) => {
    const def = stop.missionId === null ? null : MISSIONS.find((m) => m.id === stop.missionId) ?? null;
    let body: HTMLElement;
    if (stop.id === 'balintawak') {
      body = h('button', { class: 'ops-mission open', attrs: { type: 'button' }, onClick: () => o.onBriefing() }, h('span', { class: 'ops-mission-title', text: 'Navie’s briefing' }), h('span', { class: 'ops-mission-goal', text: 'How the Command Center works, and why transport choices matter' }));
    } else if (def !== null) {
      body = missionCard(def);
    } else {
      body = h('div', { class: 'ops-mission soon' }, h('span', { class: 'ops-mission-title', text: stop.theme }), h('span', { class: 'ops-pill locked' }, icon('lock'), h('span', { text: 'In production: no mission here yet' })));
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
    h('p', { class: 'muted small-text', text: 'A stylised line, north at the top. The stops are themes for made-up missions, not real incidents. Traffic and emissions in every mission are simulated.' }),
    h('div', { class: 'ops-line' }, ...stops),
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'kicker', text: 'Wildlife expeditions' }),
      h('p', { class: 'muted small-text', text: 'The Command Center plans the supply runs. The animals live far from the expressway, in their own habitats.' }),
      missionCard(hornbill),
    ),
  );
}

/* ---- A briefing, for any mission ---- */

export function missionBriefing(def: MissionDef, navie: string, onGo: () => void, onBack: () => void): HTMLElement {
  const jobs =
    def.kind === 'wildlife'
      ? [
          { i: 'paw' as const, t: 'Help the animal' },
          { i: 'tree' as const, t: 'Mend its habitat' },
          { i: 'truck' as const, t: 'Plan the transport' },
        ]
      : [
          { i: 'warn' as const, t: 'Fix the problem' },
          { i: 'leaf' as const, t: 'Help the place' },
          { i: 'truck' as const, t: 'Cut the emissions' },
        ];
  return page(
    def.kind === 'wildlife' ? `Chapter ${def.chapter}` : 'NLEX mission',
    onBack,
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'kicker', text: def.kind === 'wildlife' ? 'Field report' : 'Alert from Navie' }),
      h('h2', { text: def.title }),
      h('div', { class: 'navie-row' }, h('img', { class: 'navie-img', attrs: { src: navie, alt: 'Navie' } }), h('p', { class: 'lead', text: def.summary })),
      h('p', { class: 'muted', text: def.fiction }),
    ),
    h(
      'div',
      { class: 'card' },
      h('h3', { text: 'Three separate jobs' }),
      h('div', { class: 'triple' }, ...jobs.map((j) => h('div', { class: 'triple-item' }, icon(j.i), h('span', { text: j.t })))),
      h('p', { class: 'muted small-text', text: 'Each has its own result. Saving CO₂ does not rescue an animal, and points convert into nothing.' }),
    ),
    button('Head out', onGo, { class: 'big', iconName: 'play' }),
  );
}

/* ---- The toll plaza console ---- */

const MODE_LABEL: Record<LaneMode, string> = { tag: 'Toll tag', cash: 'Cash', closed: 'Closed' };

export function lanePuzzle(o: { plaza?: PlazaProblem; initial: readonly LaneMode[]; navie: string; reduce: boolean; onDone: (modes: LaneMode[] | null) => void; onHow: (r: PlazaResult) => void }): HTMLElement {
  const P = o.plaza ?? BOCAUE_PLAZA;
  let modes: LaneMode[] = o.initial.map((m, i) => (P.lanes[i].underRepair ? 'closed' : m));
  const jam = simulatePlaza(P, P.jammed);
  const down = P.tagDown ?? [];
  const hints = [...(down.length > 0 ? [`Lane ${down.map((i) => P.lanes[i].id).join(', ')} has no working tag reader: cash, or closed.`] : []), L.gridLaneHintCash, L.gridLaneHintTruck, L.gridLaneHintRepair, L.gridLaneHintStaff];
  let hintAt = 0;
  const lanesEl = h('div', { class: 'lanes' });
  const totals = h('div', { class: 'lane-totals' });
  const problems = h('div', { class: 'lane-problems', attrs: { role: 'status', 'aria-live': 'polite' } });
  const go = button('Switch on these lanes', () => (plazaSolved(simulatePlaza(P, modes)) ? o.onDone(modes) : undefined), { class: 'big', iconName: 'check' });
  const hintText = h('p', { class: 'hint-text', text: down.length > 0 ? hints[0] : 'Tap a lane to change it. Each change runs the hour again.' });
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
          { class: `lane ${modes[i]} ${lane.underRepair ? 'repair' : ''} ${down.includes(i) ? 'broken' : ''}`, attrs: { type: 'button', 'aria-label': `Lane ${lane.id}${lane.wide ? ', wide' : ''}: ${MODE_LABEL[modes[i]]}${lane.underRepair ? ', coned off for repairs' : ''}${down.includes(i) ? ', tag reader down' : ''}` }, onClick: cycle },
          h('span', { class: 'lane-num', text: String(lane.id) }),
          down.includes(i) ? h('span', { class: 'lane-broken', text: 'No tag' }) : null,
          h('span', { class: 'lane-mode', text: lane.underRepair ? 'Repairs' : MODE_LABEL[modes[i]] }),
          lane.wide ? h('span', { class: 'lane-tag', text: 'Wide' }) : h('span', { class: 'lane-tag blank', text: ' ' }),
          h('span', { class: 'lane-q' }, fill),
          h('span', { class: 'lane-min', text: modes[i] === 'closed' ? '–' : `${fmt(rep.averageMin)} min` }),
        );
      }),
    );
    const hours = r.carHours + r.truckHours;
    totals.replaceChildren(
      h('div', { class: 'lt-row' }, h('span', { text: 'Stopped with engines on' }), h('b', { text: `${fmt(hours)} h` })),
      h('div', { class: 'lt-row' }, h('span', { text: 'Jammed plaza, same hour' }), h('b', { text: `${fmt(jam.carHours + jam.truckHours)} h` })),
      h('div', { class: 'lt-row' }, h('span', { text: 'CO₂ from idling' }), h('b', { text: kg(r.co2Kg) }), h('span', { class: 'sim-tag', text: 'Simulated' })),
    );
    const list = [...r.problems];
    if (r.problems.length === 0 && !plazaSolved(r)) {
      list.push(r.leftWaiting > P.lanes.length ? `${r.leftWaiting} vehicles are still queuing at the end of the hour: the lines keep growing.` : 'One lane is still too slow. Spread the load.');
    }
    problems.replaceChildren(...(list.length === 0 ? [h('div', { class: 'verdict good' }, icon('check'), h('span', { text: 'Safe, staffed, and every line keeps moving.' }))] : list.map((t) => h('div', { class: 'verdict bad' }, icon('warn'), h('span', { text: t })))));
    go.disabled = !plazaSolved(r);
  };
  render();
  const hint = (): void => {
    hintText.textContent = hints[hintAt % hints.length];
    hintAt += 1;
  };
  return h(
    'div',
    { class: 'screen menu board' },
    h('div', { class: 'board-top' }, h('div', { class: 'kicker', text: 'Control room console' }), h('h2', { text: down.length > 0 ? 'Set the lanes again' : 'Set the six lanes' })),
    h(
      'div',
      { class: 'scroll' },
      h('div', { class: 'card' }, h('h3', { text: 'This hour at the plaza' }), ...(['tagCar', 'cashCar', 'tagTruck', 'cashTruck'] as VehicleClass[]).map((c) => h('div', { class: 'need-line' }, icon(c.includes('Truck') ? 'truck' : 'people'), h('span', { text: `${CLASS_LABEL[c]}: ${P.perHour[c]}` }))), h('p', { class: 'muted small-text', text: 'Invented traffic for a made-up plaza. Trucks need a wide lane. Three toll collectors are on shift.' })),
      lanesEl,
      h('div', { class: 'navie-row hint' }, h('img', { class: 'navie-img small', attrs: { src: o.navie, alt: 'Navie' } }), hintText, h('button', { class: 'text-btn', text: 'Hint', attrs: { type: 'button' }, onClick: hint })),
    ),
    h('div', { class: 'board-foot' }, totals, problems, h('div', { class: 'title-row' }, button('Back', () => o.onDone(null), { class: 'secondary', iconName: 'back' }), h('button', { class: 'text-btn', text: 'How this was calculated', attrs: { type: 'button' }, onClick: () => o.onHow(simulatePlaza(P, modes)) })), go),
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
  const hintText = h('p', { class: 'hint-text', text: L.ecoPlanHint });
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
  return h(
    'div',
    { class: 'screen menu results' },
    h(
      'div',
      { class: 'scroll no-top' },
      h('div', { class: 'result-head' }, h('div', { class: 'kicker light', text: def.title }), h('h2', { text: 'Mission complete' }), h('img', { class: 'result-bird navie-result', attrs: { src: o.navie, alt: 'Navie' } })),
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'tally-head' }, icon('leaf'), h('h3', { text: 'The place' })),
        ...def.environmentObjectives.map((ob) => h('p', { class: 'tally', text: ob.label })),
        h('p', { class: 'muted', text: report.firstCompletion ? 'Added to your environmental objectives.' : 'Already counted: replays do not add to the total.' }),
      ),
      ...o.parts.map((part) => {
        const saved = part.baselineKg - part.planKg;
        const pct = part.baselineKg > 0 ? (saved / part.baselineKg) * 100 : null;
        return h(
          'div',
          { class: 'card' },
          h('div', { class: 'tally-head' }, icon('truck'), h('h3', { text: part.label }), h('span', { class: 'sim-tag', text: 'Simulated' })),
          h('div', { class: 'columns' }, column('Baseline', part.baselineKg, Math.max(part.baselineKg, part.planKg), 'base'), column('Your plan', part.planKg, Math.max(part.baselineKg, part.planKg), 'you')),
          h('p', { class: `tally ${saved < 0 ? 'worse' : ''}`, text: Math.abs(saved) < 0.05 ? 'About the same as the baseline.' : `${kg(Math.abs(saved))} CO₂ ${saved > 0 ? 'less' : 'more'} than the baseline${pct !== null ? ` (${Math.abs(pct).toFixed(0)}%)` : ''}` }),
          ...part.lines.map((t) => h('p', { class: 'muted reason', text: t })),
          h('button', { class: 'text-btn', text: 'How this was calculated', attrs: { type: 'button' }, onClick: () => o.onHow(part.id) }),
        );
      }),
      h('div', { class: 'card points' }, h('div', { class: 'tally-head' }, icon('star'), h('h3', { text: 'Guardian Points' })), h('p', { class: 'tally', text: report.points > 0 ? `+${report.points}` : 'None new this time' }), h('p', { class: 'muted small-text', text: 'A game currency for Command Center upgrades. It is not a measure of CO₂, animals or places.' })),
      (o.achievements ?? []).length > 0 ? h('div', { class: 'card' }, h('div', { class: 'tally-head' }, icon('star'), h('h3', { text: 'Achievements' })), ...(o.achievements ?? []).map((t) => h('p', { class: 'tally', text: t }))) : null,
      h('p', { class: 'muted small-text', text: 'Less CO₂ does not rescue an animal or heal a place by itself. These are separate results, and the game keeps them apart.' }),
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
