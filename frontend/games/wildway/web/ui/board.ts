import { BOUNDARY_TEXT, CALCULATION_VERSION, CHARGING_LOSS, FACTORS, VEHICLES } from '../../core/emissions';
import { clockText, comparePlan, evaluatePlan, type Plan, type PlanResult, type TransportProblem, type Comparison } from '../../core/transport';
import { button, h, icon } from '../dom';

/**
 * The transport-planning board: choose vehicles, route and departure, and see at once
 * what that plan needs, whether it is possible, and what it is simulated to emit. A plan
 * that does not serve everyone cannot be dispatched, however low its number.
 */

const kg = (v: number): string => `${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)} kg`;

const row = (title: string, options: { id: string; label: string; sub: string; off?: boolean }[], current: string, onPick: (id: string) => void): HTMLElement =>
  h(
    'div',
    { class: 'plan-row' },
    h('h3', { text: title }),
    h(
      'div',
      { class: 'plan-options', attrs: { role: 'radiogroup', 'aria-label': title } },
      ...options.map((o) =>
        h(
          'button',
          {
            class: `plan-option ${o.id === current ? 'on' : ''} ${o.off === true ? 'off' : ''}`,
            attrs: { type: 'button', role: 'radio', 'aria-checked': String(o.id === current) },
            onClick: () => onPick(o.id),
          },
          h('span', { class: 'plan-option-label', text: o.label }),
          h('span', { class: 'plan-option-sub', text: o.sub }),
        ),
      ),
    ),
  );

/** The bars for the baseline and the plan. Colour is never the only signal: both are labelled with numbers. */
function compareBars(c: Comparison): HTMLElement {
  const max = Math.max(c.baseline.co2Kg, c.player.co2Kg, 0.001);
  const bar = (label: string, value: number, cls: string): HTMLElement => {
    const fill = h('div', { class: `cmp-fill ${cls}` });
    fill.style.width = `${Math.max(2, (value / max) * 100)}%`;
    return h('div', { class: 'cmp-row' }, h('div', { class: 'cmp-label', text: label }), h('div', { class: 'cmp-track' }, fill), h('div', { class: 'cmp-value', text: kg(value) }));
  };
  return h('div', { class: 'cmp' }, bar('Usual way', c.baseline.co2Kg, 'base'), bar('Your plan', c.player.co2Kg, 'you'));
}

export function savingsLine(c: Comparison): string {
  const { savedKg, percent } = c.savings;
  if (Math.abs(savedKg) < 0.05) {
    return 'About the same as the usual way.';
  }
  const pct = percent === null ? '' : ` (${Math.abs(percent).toFixed(0)}%)`;
  return savedKg > 0 ? `${kg(savedKg)} CO₂ less than the usual way${pct}` : `${kg(-savedKg)} CO₂ more than the usual way${pct}`;
}

export function howCalculated(problem: TransportProblem, c: Comparison, onClose: () => void): HTMLElement {
  const describe = (r: PlanResult): HTMLElement =>
    h(
      'div',
      { class: 'calc-plan' },
      ...r.trips.map((t) =>
        h(
          'p',
          { class: 'calc-line' },
          h('strong', { text: `${t.vehicle.name}: ` }),
          t.vehicle.energy === 'electric'
            ? `${t.distanceKm} km and ${t.stationaryMin} min standing, ${(t.outbound.batteryKWh + t.back.batteryKWh).toFixed(1)} kWh from the battery, ${(t.outbound.chargerKWh + t.back.chargerKWh).toFixed(1)} kWh at the charger, ${t.co2Kg.toFixed(1)} kg CO₂.`
            : `${t.distanceKm} km and ${t.stationaryMin} min idling, ${(t.outbound.fuelL + t.back.fuelL).toFixed(1)} L ${t.vehicle.energy}, ${t.co2Kg.toFixed(1)} kg CO₂.`,
        ),
      ),
    );
  const factor = (id: string): HTMLElement => {
    const f = FACTORS[id];
    return h(
      'tr',
      {},
      h('td', { text: id === 'grid' ? 'Electricity' : id === 'diesel' ? 'Diesel' : 'Gasoline' }),
      h('td', { class: 'num', text: `${f.value.toFixed(2)} kg/${id === 'grid' ? 'kWh' : 'L'}` }),
      h('td', { text: f.status === 'illustrative' ? `${f.geography}. Illustrative.` : f.geography }),
    );
  };
  return h(
    'div',
    { class: 'overlay', attrs: { role: 'dialog', 'aria-label': 'How this was calculated' } },
    h(
      'div',
      { class: 'sheet' },
      h('div', { class: 'sheet-top' }, h('h2', { text: 'How this was calculated' }), h('button', { class: 'round-btn', label: 'Close', attrs: { type: 'button' }, onClick: () => onClose() }, icon('cross'))),
      h(
        'div',
        { class: 'sheet-body' },
        h('p', { class: 'sim-tag', text: 'Simulated' }),
        h('p', { text: 'This is a simulation of a fictional journey, not a measurement.' }),
        h('h3', { text: 'The sums' }),
        h('p', { class: 'muted', text: 'Fuel = distance × fuel per km × a traffic adjustment + minutes standing still × fuel per minute of idling. CO₂ = fuel × the fuel’s CO₂ factor.' }),
        h('p', { class: 'muted', text: `Electric = battery use ÷ ${(1 - CHARGING_LOSS).toFixed(2)} (about 10% lost in charging, counted once) × the grid factor.` }),
        h('p', { class: 'muted', text: 'Every journey is counted there and back, and every plan has to move the same people and cargo.' }),
        h('h3', { text: 'The usual way' }),
        describe(c.baseline),
        h('h3', { text: 'Your plan' }),
        describe(c.player),
        h('h3', { text: 'What is counted' }),
        h('p', { class: 'muted', text: BOUNDARY_TEXT }),
        h('p', { class: 'muted', text: 'Only CO₂ is modelled, so results are kg CO₂, not CO₂e.' }),
        h('h3', { text: 'The factors' }),
        h('table', { class: 'facts-table' }, h('tbody', {}, factor('gasoline'), factor('diesel'), factor('grid'))),
        h('p', { class: 'muted small-text', text: `Fuel use: ${VEHICLES.van.basis}. Those figures describe other countries’ fleets, not the Philippines. Electric van: ${VEHICLES.evan.basis} Calculation version ${CALCULATION_VERSION}.` }),
        h('p', { class: 'muted small-text', text: 'Emissions, animal rescues and habitat work are separate results. A kilogram of CO₂ does not convert into an animal saved.' }),
      ),
    ),
  );
}

export function transportBoard(problem: TransportProblem, startPlan: Plan | null, onDispatch: (plan: Plan, c: Comparison) => void, onOverlay: (el: HTMLElement | null) => void): HTMLElement {
  let plan: Plan = startPlan ?? { ...problem.baseline };
  const root = h('div', { class: 'screen board' });
  const paint = (): void => {
    const c = comparePlan(problem, plan);
    const fleetRows = problem.fleets.map((f) => {
      const vehicles = f.trips.map((t) => VEHICLES[t.vehicleId].name).join(' + ');
      return { id: f.id, label: f.label, sub: vehicles };
    });
    const routes = problem.routes.map((r) => ({ id: r.id, label: r.label, sub: r.closedBecause !== undefined ? 'Closed' : `${r.distanceKm} km. ${r.blurb}`, off: r.closedBecause !== undefined }));
    const departures = problem.departures.map((d) => {
      const w = problem.routes.find((r) => r.id === plan.routeId)?.windows[d.id];
      return { id: d.id, label: d.label, sub: w === undefined ? '' : `${w.stationaryMin} min stuck each way` };
    });
    const ok = c.player.feasible;
    root.replaceChildren(
      h(
        'div',
        { class: 'board-top' },
        h('div', {}, h('div', { class: 'kicker', text: 'Transport board' }), h('h2', { text: 'Get the team and gear there' })),
      ),
      h(
        'div',
        { class: 'scroll' },
        h(
          'div',
          { class: 'card need' },
          h('h3', { text: 'What has to get there' }),
          h('div', { class: 'need-line' }, icon('people'), h('span', { text: `${problem.demand.people} staff, by ${clockText(problem.demand.peopleDeadline)}` })),
          ...problem.demand.cargo.map((item) => h('div', { class: 'need-line' }, icon('truck'), h('span', { text: `${item.label} (${item.kg} kg), by ${clockText(item.deadline)}${item.enclosed ? ', enclosed' : ''}` }))),
        ),
        row('Vehicles', fleetRows, plan.fleetId, (id) => {
          plan = { ...plan, fleetId: id };
          paint();
        }),
        row('Route', routes, plan.routeId, (id) => {
          plan = { ...plan, routeId: id };
          paint();
        }),
        row('Leave at', departures, plan.departureId, (id) => {
          plan = { ...plan, departureId: id };
          paint();
        }),
      ),
      h(
        'div',
        { class: 'board-foot' },
        h('div', { class: 'foot-head' }, h('span', { class: 'sim-tag', text: 'Simulated' }), h('button', { class: 'text-btn', text: 'How this was calculated', attrs: { type: 'button' }, onClick: () => onOverlay(howCalculated(problem, c, () => onOverlay(null))) })),
        compareBars(c),
        ok
          ? h('div', { class: `verdict ${c.savings.savedKg >= 0 ? 'good' : 'worse'}` }, icon(c.savings.savedKg >= 0 ? 'check' : 'warn'), h('span', { text: savingsLine(c) }))
          : h('div', { class: 'verdict bad' }, icon('warn'), h('span', { text: c.player.violations[0].text })),
        button(ok ? 'Dispatch this plan' : 'This plan cannot work', () => onDispatch(plan, c), { class: 'big', iconName: ok ? 'truck' : 'cross', disabled: !ok }),
      ),
    );
  };
  paint();
  return root;
}

export { evaluatePlan };
