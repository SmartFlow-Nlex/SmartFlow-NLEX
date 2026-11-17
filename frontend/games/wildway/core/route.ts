/**
 * The NLEX Eco Adventure map: the 18 mainline exits from Balintawak north to Dau, with the
 * names and in the order of Expressway.ph's NLEX exits guide (read 11 November 2026,
 * https://www.expressway.ph/guides/nlex-exits). One disagreement is recorded rather than
 * hidden: Wikipedia's exit table (https://en.wikipedia.org/wiki/E1_expressway_(Philippines))
 * puts Tabang (km 32.9) half a kilometre before Balagtas (km 33.4); the guide's order is
 * kept. Dau is where NLEX ends and the road carries on as SCTEX, so no SCTEX exit, nor the
 * Harbor Link or the Connector, appears here.
 *
 * Each stop is a theme for a made-up mission, never a claim about a real place or incident.
 * Pure data: the map, the tests and the progress summary all read it.
 */

export type Province = 'Metro Manila' | 'Bulacan' | 'Pampanga';

/** The little picture on each stop's card. */
export type Landmark = 'city' | 'route' | 'parcel' | 'creek' | 'crate' | 'scanner' | 'arena' | 'plaza' | 'wrench' | 'tyre' | 'box' | 'signal' | 'rain' | 'cargo' | 'sun' | 'patrol' | 'moon' | 'flag';

export interface ExitStop {
  id: string;
  name: string;
  province: Province;
  /** A few words: what kind of place the game makes of it. */
  theme: string;
  landmark: Landmark;
  /** Mission ids at this stop, the main one first. Built or planned. */
  missions: readonly string[];
}

export const NLEX_EXITS: readonly ExitStop[] = [
  { id: 'balintawak', name: 'Balintawak', province: 'Metro Manila', theme: 'Urban gateway', landmark: 'city', missions: ['eco-traffic-start', 'nlex-delivery'] },
  { id: 'mindanao-avenue', name: 'Mindanao Avenue', province: 'Metro Manila', theme: 'Service routes', landmark: 'route', missions: ['green-route'] },
  { id: 'karuhatan', name: 'Karuhatan', province: 'Metro Manila', theme: 'Delivery hub', landmark: 'parcel', missions: ['smart-delivery'] },
  { id: 'valenzuela', name: 'Valenzuela', province: 'Metro Manila', theme: 'Community creek', landmark: 'creek', missions: ['nlex-river'] },
  { id: 'meycauayan', name: 'Meycauayan', province: 'Bulacan', theme: 'Cargo yard', landmark: 'crate', missions: ['eco-cargo'] },
  { id: 'marilao', name: 'Marilao', province: 'Bulacan', theme: 'Toll lanes', landmark: 'scanner', missions: ['rfid-rescue'] },
  { id: 'ciudad-de-victoria', name: 'Ciudad de Victoria', province: 'Bulacan', theme: 'Event access', landmark: 'arena', missions: ['event-traffic'] },
  { id: 'bocaue', name: 'Bocaue', province: 'Bulacan', theme: 'Toll plaza', landmark: 'plaza', missions: ['nlex-gridlock'] },
  { id: 'tambubong', name: 'Tambubong', province: 'Bulacan', theme: 'Maintenance yard', landmark: 'wrench', missions: ['green-maintenance'] },
  { id: 'balagtas', name: 'Balagtas', province: 'Bulacan', theme: 'Service garage', landmark: 'tyre', missions: ['fuel-saver'] },
  { id: 'tabang', name: 'Tabang', province: 'Bulacan', theme: 'Supply depot', landmark: 'box', missions: ['eco-supply'] },
  { id: 'sta-rita', name: 'Sta. Rita', province: 'Bulacan', theme: 'Traffic control', landmark: 'signal', missions: ['traffic-flow'] },
  { id: 'pulilan', name: 'Pulilan', province: 'Bulacan', theme: 'Rainy drains', landmark: 'rain', missions: ['rainy-day'] },
  { id: 'san-simon', name: 'San Simon', province: 'Pampanga', theme: 'Cargo dispatch', landmark: 'cargo', missions: ['clean-cargo'] },
  { id: 'san-fernando', name: 'San Fernando', province: 'Pampanga', theme: 'Solar depot', landmark: 'sun', missions: ['nlex-eco'] },
  { id: 'mexico', name: 'Mexico', province: 'Pampanga', theme: 'Patrol base', landmark: 'patrol', missions: ['eco-patrol'] },
  { id: 'angeles', name: 'Angeles', province: 'Pampanga', theme: 'Night shift', landmark: 'moon', missions: ['night-shift'] },
  { id: 'dau', name: 'Dau', province: 'Pampanga', theme: 'Final challenge', landmark: 'flag', missions: ['wasteworks-finale'] },
];

/**
 * Missions on the map that are not built yet. They are shown honestly as In development:
 * nothing about them can be played, completed or counted until their gameplay exists.
 */
export interface PlannedMission {
  id: string;
  title: string;
  locationId: string;
  summary: string;
  tasks: readonly string[];
}

export const PLANNED_MISSIONS: readonly PlannedMission[] = [
  { id: 'eco-traffic-start', title: 'Eco Traffic Start', locationId: 'balintawak', summary: 'Fix the signals so cars stop idling.', tasks: ['Find the traffic problem', 'Fix the signal box', 'Restore the traffic flow'] },
  { id: 'rfid-rescue', title: 'RFID Rescue', locationId: 'marilao', summary: 'Repair a toll scanner and free the lanes.', tasks: ['Find the faulty scanner', 'Repair it', 'Restore the traffic flow'] },
  { id: 'event-traffic', title: 'Event Traffic Hero', locationId: 'ciudad-de-victoria', summary: 'Plan safe lanes for a big event crowd.', tasks: ['Check the queues', 'Choose a lane plan', 'Get the traffic moving'] },
  { id: 'eco-supply', title: 'Eco Supply Run', locationId: 'tabang', summary: 'Deliver equipment with the right vehicle.', tasks: ['Gather the supplies', 'Choose a vehicle', 'Deliver the equipment'] },
  { id: 'traffic-flow', title: 'Traffic Flow Fix', locationId: 'sta-rita', summary: 'Retime the signals and smooth the flow.', tasks: ['Find the control panel', 'Solve the traffic puzzle', 'Restore safe flow'] },
  { id: 'clean-cargo', title: 'Clean Cargo Mission', locationId: 'san-simon', summary: 'Pack shared deliveries into fewer trips.', tasks: ['Collect the cargo', 'Choose the vehicle', 'Send the dispatch'] },
  { id: 'wasteworks-finale', title: 'The Wasteworks Showdown', locationId: 'dau', summary: 'Beat the Wasteworks in one last eco challenge.', tasks: ['Repair the system', 'Plan the transport', 'Restore NLEX operations'] },
];

export const exitById = (id: string): ExitStop | null => NLEX_EXITS.find((e) => e.id === id) ?? null;

export const plannedById = (id: string): PlannedMission | null => PLANNED_MISSIONS.find((m) => m.id === id) ?? null;
