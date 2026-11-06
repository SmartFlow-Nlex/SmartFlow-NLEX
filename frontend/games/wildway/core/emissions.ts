/**
 * The transport emissions model: deterministic, with no drawing and no mission script
 * in it, so it can be tested and explained on its own.
 *
 * ACCOUNTING BOUNDARY (the same for every vehicle):
 *   Combustion vehicles: CO2 from burning fuel in the vehicle (tailpipe).
 *   Electric vehicles: CO2 from generating the electricity drawn at the charger.
 *   Left out for both: producing and transporting fuel, and building or scrapping the
 *   vehicle. So this is neither a fuel-cycle nor a life-cycle result, and the game never
 *   says it is. Results are kg CO2, not CO2e: other gases are not modelled.
 *
 * Every result is a simulation for a fictional journey. Numbers imported from elsewhere
 * keep their geography on the record and are shown as illustrative.
 */

export const CALCULATION_VERSION = 'wildway-transport-1';

export const BOUNDARY_TEXT =
  'Combustion vehicles count the CO₂ from fuel burned in the vehicle. Electric vehicles count the CO₂ from generating the electricity drawn at the charger. Producing fuel and building vehicles are left out for both, so this is not a full life-cycle result.';

export type SourceStatus = 'sourced' | 'illustrative';

/** One number the model depends on, with where it came from. */
export interface EmissionFactor {
  id: string;
  value: number;
  units: string;
  geography: string;
  year: number | null;
  sourceUrl: string | null;
  gasesIncluded: string;
  accountingBoundary: string;
  uncertaintyOrLimitations: string;
  status: SourceStatus;
  version: string;
}

const GALLON_L = 3.78541;

export const FACTORS: Record<string, EmissionFactor> = {
  gasoline: {
    id: 'gasoline',
    value: 8.887 / GALLON_L,
    units: 'kg CO2 per litre',
    geography: 'United States',
    year: 2026,
    sourceUrl: 'https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle',
    gasesIncluded: 'CO2 only',
    accountingBoundary: 'Tailpipe',
    uncertaintyOrLimitations: 'US EPA figure of 8,887 g per gallon, converted to litres. Depends mostly on fuel chemistry, but fuel blends differ. Illustrative for the Philippines.',
    status: 'illustrative',
    version: CALCULATION_VERSION,
  },
  diesel: {
    id: 'diesel',
    value: 10.18 / GALLON_L,
    units: 'kg CO2 per litre',
    geography: 'United States',
    year: 2026,
    sourceUrl: 'https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle',
    gasesIncluded: 'CO2 only',
    accountingBoundary: 'Tailpipe',
    uncertaintyOrLimitations: 'US EPA figure of 10,180 g per gallon, converted to litres. Illustrative for the Philippines.',
    status: 'illustrative',
    version: CALCULATION_VERSION,
  },
  grid: {
    id: 'grid',
    value: 0.731,
    units: 'kg CO2 per kWh drawn at the charger',
    geography: 'Luzon-Visayas grid, Philippines',
    year: 2024,
    sourceUrl: 'https://doe.gov.ph/national-grid-emission-factor',
    gasesIncluded: 'CO2 only',
    accountingBoundary: 'Grid-connected power plants, per kWh generated. Upstream fuel and transmission losses are not in the figure.',
    uncertaintyOrLimitations: 'Philippine DOE National Grid Emission Factor, 2022-2024 window, operating margin. The DOE publishes it for Clean Development Mechanism baselines; choosing the operating margin for an electric van is a modelling choice made here. The combined margins are 0.7446 and 0.7582.',
    status: 'sourced',
    version: CALCULATION_VERSION,
  },
};

export type Energy = 'gasoline' | 'diesel' | 'electric' | 'none';

export interface VehicleModel {
  id: string;
  name: string;
  energy: Energy;
  /** Passengers, not counting the driver. */
  seats: number;
  cargoKg: number;
  /** Has a closed, clean compartment. */
  enclosed: boolean;
  /** Fuel use while moving, L/km. */
  lPerKm: number;
  /** Fuel use standing still with the engine on, L/h. */
  idleLPerH: number;
  /** Electricity from the battery while moving, kWh/km. */
  kWhPerKm: number;
  /** Electricity for lights, cooling and so on while the vehicle is on, kW. */
  auxKw: number;
  /** Charge available today, kWh. */
  usableKWh: number;
  /** Where the fuel or energy figures come from. */
  basis: string;
  /** Separate bins: this many kinds of sorted cargo can ride without mixing. */
  compartments?: number;
  /**
   * True when kWhPerKm was measured at the charger, so it already includes what is lost
   * in charging. Then no charging loss is added: that would count it twice.
   */
  energyAtCharger?: boolean;
}

/**
 * Fuel figures are worked back from the dashboard's own factors (EMEP/EEA Guidebook 2023
 * g CO2/km, Argonne idling gal/h, both documented in SmartFlow-NLEX
 * docs/emissions-optimiser-spec.md) so the game's sums match the same sources. They
 * describe typical European fleets and US idling, not the Philippine fleet.
 */
const litresPerKm = (gPerKm: number, factorId: 'gasoline' | 'diesel'): number => gPerKm / 1000 / FACTORS[factorId].value;
const litresPerHour = (galPerHour: number): number => galPerHour * GALLON_L;

export const VEHICLES: Record<string, VehicleModel> = {
  sedan: { id: 'sedan', name: 'Station car', energy: 'gasoline', seats: 3, cargoKg: 60, enclosed: true, lPerKm: litresPerKm(196.1, 'gasoline'), idleLPerH: litresPerHour(0.3), kWhPerKm: 0, auxKw: 0, usableKWh: 0, basis: 'EMEP/EEA petrol car; Argonne idling' },
  van: { id: 'van', name: 'Field van', energy: 'diesel', seats: 5, cargoKg: 400, enclosed: true, lPerKm: litresPerKm(251.2, 'diesel'), idleLPerH: litresPerHour(0.4), kWhPerKm: 0, auxKw: 0, usableKWh: 0, basis: 'EMEP/EEA diesel light commercial vehicle; idling assumed slightly above a car' },
  pickup: { id: 'pickup', name: 'Utility pickup', energy: 'diesel', seats: 1, cargoKg: 700, enclosed: false, lPerKm: litresPerKm(251.2, 'diesel'), idleLPerH: litresPerHour(0.4), kWhPerKm: 0, auxKw: 0, usableKWh: 0, basis: 'EMEP/EEA diesel light commercial vehicle; idling assumed slightly above a car' },
  truck: { id: 'truck', name: 'Depot truck', energy: 'diesel', seats: 1, cargoKg: 3000, enclosed: false, lPerKm: litresPerKm(492.9, 'diesel'), idleLPerH: litresPerHour(0.8), kWhPerKm: 0, auxKw: 0, usableKWh: 0, basis: 'EMEP/EEA truck 7.5-16 t; Argonne medium-duty idling' },
  segtruck: { id: 'segtruck', name: 'Three-bin garbage truck', energy: 'diesel', seats: 1, cargoKg: 2500, enclosed: true, lPerKm: litresPerKm(492.9, 'diesel'), idleLPerH: litresPerHour(0.8), kWhPerKm: 0, auxKw: 0, usableKWh: 0, compartments: 3, basis: 'EMEP/EEA truck 7.5-16 t; Argonne medium-duty idling. Three separate bins is a game assumption.' },
  etrike: { id: 'etrike', name: 'Barangay e-trike', energy: 'electric', seats: 1, cargoKg: 250, enclosed: false, lPerKm: 0, idleLPerH: 0, kWhPerKm: 0.118, auxKw: 0, usableKWh: 5, energyAtCharger: true, basis: 'Electric tricycles at UP Diliman used 0.111-0.125 kWh per km, measured at the charger (Abaya et al. 2019); the middle is used. Load limit and battery size are game assumptions.' },
  evan: { id: 'evan', name: 'Electric van', energy: 'electric', seats: 5, cargoKg: 350, enclosed: true, lPerKm: 0, idleLPerH: 0, kWhPerKm: 0.28, auxKw: 1.2, usableKWh: 32, basis: 'Energy use 0.28 kWh/km from electric delivery vans in Rome (Fiori & Marzano 2018, net of regeneration, at the wheels); no Philippine van figure was found. Standing load and battery size are game assumptions.' },
};

/**
 * Share of the electricity drawn at the charger that never reaches the battery. Counted
 * once, here. fueleconomy.gov gives about 10% combined, as a rounded US estimate; the
 * Rome van figure above is measured at the wheels, so the loss does apply to it.
 */
export const CHARGING_LOSS = 0.1;

export interface JourneyConditions {
  distanceKm: number;
  /** Minutes standing still with the engine or systems on. */
  stationaryMin: number;
  /** Stop-and-go adjustment to moving energy use: 1 means free-flowing. */
  movingFactor: number;
  /**
   * True if `movingFactor` already includes time spent standing still. Then stationary
   * time is not added again, because that would count the same idling twice.
   */
  factorIncludesIdling?: boolean;
}

export interface JourneyResult {
  /** kg CO2. */
  co2Kg: number;
  /** Litres of fuel; 0 for electric. */
  fuelL: number;
  /** Of that fuel, litres burned standing still. */
  idleFuelL: number;
  /** kWh drawn from the battery. */
  batteryKWh: number;
  /** kWh drawn at the charger: battery use plus charging losses. */
  chargerKWh: number;
}

/** One vehicle, one journey. */
export function journey(v: VehicleModel, c: JourneyConditions): JourneyResult {
  const stationaryH = c.factorIncludesIdling === true ? 0 : c.stationaryMin / 60;
  if (v.energy === 'electric') {
    const batteryKWh = c.distanceKm * v.kWhPerKm * c.movingFactor + stationaryH * v.auxKw;
    const chargerKWh = v.energyAtCharger === true ? batteryKWh : batteryKWh / (1 - CHARGING_LOSS);
    return { co2Kg: chargerKWh * FACTORS.grid.value, fuelL: 0, idleFuelL: 0, batteryKWh, chargerKWh };
  }
  if (v.energy === 'none') {
    return { co2Kg: 0, fuelL: 0, idleFuelL: 0, batteryKWh: 0, chargerKWh: 0 };
  }
  const idleFuelL = stationaryH * v.idleLPerH;
  const fuelL = c.distanceKm * v.lPerKm * c.movingFactor + idleFuelL;
  return { co2Kg: fuelL * FACTORS[v.energy].value, fuelL, idleFuelL, batteryKWh: 0, chargerKWh: 0 };
}

export interface Savings {
  /** Baseline minus plan, kg CO2. Negative when the plan does worse: it is never hidden. */
  savedKg: number;
  /** Only when the baseline is above zero. */
  percent: number | null;
}

export function savings(baselineKg: number, planKg: number): Savings {
  return { savedKg: baselineKg - planKg, percent: baselineKg > 0 ? ((baselineKg - planKg) / baselineKg) * 100 : null };
}
