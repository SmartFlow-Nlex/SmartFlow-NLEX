/**
 * The real numbers behind Carbon Rush. They are the dashboard's, so the
 * game and the Emissions tab agree. Sources, from the SmartFlow-NLEX repo:
 * Back-End/src/services/emissions-source.ts and docs/emissions-optimiser-spec.md.
 *
 * Idling: Argonne National Laboratory (Gaines, Levinson & McConnell 2010; Long-Haul
 * Truck Idling Burns Up Profits 2015) for the gallons an hour, US EPA (2026) for the
 * CO2 per gallon. These are US figures: none were found for the Philippine fleet.
 * Driving: EMEP/EEA Guidebook 2023, Class 1 central factor.
 * Fleet: NLEX class shares of trips in the corridor's record.
 *
 * If the dashboard's factors change, change them here too.
 */

/** NLEX toll class, as an index: 0 = Class 1 (light), 1 = Class 2 (buses, small trucks), 2 = Class 3 (large trucks). */
export type VehicleClass = 0 | 1 | 2;

export const CLASSES: readonly VehicleClass[] = [0, 1, 2];

export const CLASS_LABEL: readonly string[] = ['Cars', 'Buses and small trucks', 'Large trucks'];

const IDLE_GAL_PER_HOUR = [0.3, 0.8, 1] as const;
const KG_CO2_PER_GAL = [8.887, 10.18, 10.18] as const;

/** kg of CO2 one vehicle burns per minute at a standstill, by class. */
export const IDLE_KG_PER_MIN: readonly number[] = IDLE_GAL_PER_HOUR.map((gal, i) => (gal * KG_CO2_PER_GAL[i]) / 60);

/** g of CO2 per km for a Class 1 vehicle driving: used only to say what a saving is worth. */
export const CAR_G_PER_KM = 196.1;

/** Share of trips by class on the corridor. */
export const FLEET_MIX: readonly [number, number, number] = [0.7807, 0.1351, 0.0842];

/**
 * The game's clock: one second of play is one minute at the plaza, for the clock
 * on screen and for idling alike. It is what keeps the kg honest about the sped-up
 * time: a vehicle that waits 5 seconds has idled for 5 minutes at the rate above.
 */
export const MINUTES_PER_SECOND = 1;

/** How far a car would drive on this much CO2. */
export const carKmFor = (kg: number): number => (kg * 1000) / CAR_G_PER_KM;
