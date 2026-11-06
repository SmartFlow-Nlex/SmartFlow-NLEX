import { FACTORS, VEHICLES } from './emissions';

/**
 * The maintenance depot in The Eco Expressway: a fictional facility and one ordinary day.
 * Deterministic, with the same factors as everything else in the game.
 *
 * Boundary: electricity the depot draws from the grid (Luzon-Visayas grid factor) and
 * diesel its service trucks burn while parked with engines running. Solar power the
 * depot makes on its own roof reduces what it draws, up to its own daytime use. Making
 * panels and lamps is left out, as building vehicles is on the transport board.
 *
 * Every wattage, hour count and the solar yield are game assumptions, listed with the
 * calculation so a player can see them. They are not measurements of any real depot.
 */

export type Repair = 'sensor' | 'leak' | 'idling';
export type Upgrade = 'ledFloods' | 'ledTubes' | 'solar' | 'noIdle';

export interface UpgradeOption {
  id: Upgrade;
  label: string;
  blurb: string;
  /** Crew hours to install. */
  hours: number;
  /** What has to be delivered for it. */
  cargo: { id: string; label: string; kg: number; enclosed: boolean } | null;
}

export const UPGRADE_OPTIONS: readonly UpgradeOption[] = [
  { id: 'ledFloods', label: 'LED floodlights', blurb: '12 yard lamps, 400 W each now, 150 W as LEDs.', hours: 4, cargo: { id: 'floods', label: 'LED floodlights', kg: 60, enclosed: true } },
  { id: 'ledTubes', label: 'LED workshop tubes', blurb: '20 tubes, 36 W each now, 18 W as LEDs.', hours: 2, cargo: { id: 'tubes', label: 'LED tubes', kg: 25, enclosed: true } },
  { id: 'solar', label: 'Solar roof', blurb: '10 kW of panels on the workshop roof.', hours: 6, cargo: { id: 'panels', label: 'Solar panels and rails', kg: 560, enclosed: false } },
  { id: 'noIdle', label: 'Engine-off rule', blurb: 'Signs and a rule: engines off while parked. Nothing to deliver.', hours: 1, cargo: null },
];

/** The installers have one working day. */
export const CREW_HOURS = 8;

export const ASSUMPTIONS = {
  floods: { count: 12, wattsOld: 400, wattsLed: 150, nightHours: 12 },
  tubes: { count: 20, wattsOld: 36, wattsLed: 18, hours: 10 },
  compressor: { kw: 7.5, hours: 10, dutyGood: 0.4, dutyLeaking: 0.6 },
  otherKWh: 60,
  trucks: { count: 3, idleHoursNow: 1.5, idleHoursFixed: 0.75, idleHoursRule: 0.25 },
  solar: { kWp: 10, kWhPerKWpDay: 4.2, daytimeShare: 0.55 },
};

export interface FacilityState {
  repairs: readonly Repair[];
  upgrades: readonly Upgrade[];
}

export interface FacilityResult {
  lines: { label: string; kWh: number }[];
  gridKWh: number;
  solarKWh: number;
  idleL: number;
  co2Kg: number;
}

export function facilityDay(s: FacilityState): FacilityResult {
  const a = ASSUMPTIONS;
  const has = (r: Repair): boolean => s.repairs.includes(r);
  const up = (u: Upgrade): boolean => s.upgrades.includes(u);
  /* A broken daylight sensor leaves the yard lamps on all day as well as all night. */
  const floodHours = has('sensor') ? a.floods.nightHours : 24;
  const floods = (a.floods.count * (up('ledFloods') ? a.floods.wattsLed : a.floods.wattsOld) * floodHours) / 1000;
  const tubes = (a.tubes.count * (up('ledTubes') ? a.tubes.wattsLed : a.tubes.wattsOld) * a.tubes.hours) / 1000;
  const compressor = a.compressor.kw * a.compressor.hours * (has('leak') ? a.compressor.dutyGood : a.compressor.dutyLeaking);
  const used = floods + tubes + compressor + a.otherKWh;
  /* Solar only counts against what the depot uses while the sun is up. */
  const daytimeUse = (floods * (24 - floodHours)) / 24 + tubes + compressor + a.otherKWh * a.solar.daytimeShare;
  const solarKWh = up('solar') ? Math.min(a.solar.kWp * a.solar.kWhPerKWpDay, daytimeUse) : 0;
  const gridKWh = used - solarKWh;
  const idleHours = up('noIdle') ? a.trucks.idleHoursRule : has('idling') ? a.trucks.idleHoursFixed : a.trucks.idleHoursNow;
  const idleL = a.trucks.count * idleHours * VEHICLES.truck.idleLPerH;
  return {
    lines: [
      { label: 'Yard floodlights', kWh: floods },
      { label: 'Workshop lights', kWh: tubes },
      { label: 'Air compressor', kWh: compressor },
      { label: 'Offices and tools', kWh: a.otherKWh },
    ],
    gridKWh,
    solarKWh,
    idleL,
    co2Kg: gridKWh * FACTORS.grid.value + idleL * FACTORS.diesel.value,
  };
}

/** The depot as the Wasteworks left it. */
export const DEPOT_BEFORE: FacilityState = { repairs: [], upgrades: [] };

export const crewHours = (upgrades: readonly Upgrade[]): number => upgrades.reduce((a, u) => a + (UPGRADE_OPTIONS.find((o) => o.id === u)?.hours ?? 0), 0);
