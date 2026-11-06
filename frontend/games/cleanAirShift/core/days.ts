import { FLEET_MIX } from './factors';
import { createRng } from './rng';
import type { LaneType, PlazaRules, WaveDef, WaveEvent } from './sim';

/**
 * The shifts, as data: six plazas in order, plus one built from today's date. Each
 * is one run of short traffic waves, about 90 seconds. Plaza names are real NLEX
 * exits, but lane counts and traffic here are made for the game.
 *
 * Mechanics arrive one plaza at a time:
 *   Meycauayan      booths only
 *   Marilao         redirecting, and the reload lane
 *   Bocaue Barrier  faster waves, surges, Engines Off
 *   Balintawak      reader faults and breakdowns
 *   San Fernando    little staff, heavy trucks
 *   Dau             all of it, and the most surges
 *
 * `need` is the share of the unmanaged CO2 the player must cut for one, two and
 * three stars. One star is also the shift's budget: use it up and the shift ends.
 * tests/balance.test.ts holds these to what the bots can actually do.
 */

export interface DayDef extends PlazaRules {
  id: string;
  /** Short name, as in "Shift 3". */
  title: string;
  plaza: string;
  seed: number;
  need: readonly [number, number, number];
  /** One line for the briefing. */
  brief: string;
  /** What this plaza adds, for the briefing. */
  fresh: readonly string[];
  /** Tutorial tips to show the first time. */
  coach: readonly string[];
  /** Waves after which a change can be picked (0 is the first wave). */
  perksAfter: readonly number[];
  /** The end of the road: a bigger celebration. */
  finale?: boolean;
}

const RFID: LaneType = 'rfid';
const RELOAD: LaneType = 'reload';

/** Truck-heavy traffic, for truck windows and truck days. */
const TRUCK_HEAVY: readonly [number, number, number] = [0.56, 0.2, 0.24];

const trouble = (...items: [number, 'tag' | 'breakdown' | 'reader' | 'closure'][]): WaveEvent[] => items.map(([t, kind]) => ({ t, kind }));

const surge = (t: number, count: number, lane: number, warning: string): WaveEvent => ({ t, kind: 'surge', count, lane, warning });

const convoy = (t: number, count: number, cls: 1 | 2, lane: number, warning: string): WaveEvent => ({ t, kind: 'convoy', count, cls, lane, warning });

type WaveShape = Omit<WaveDef, 'id' | 'label' | 'note' | 'events'> & { events?: WaveEvent[]; note?: string; label?: string };

const warmUp = (w: WaveShape): WaveDef => ({ id: 'warmup', label: 'Warm-Up', note: 'Easy traffic. Get set.', events: [], ...w });
const rushHour = (w: WaveShape): WaveDef => ({ id: 'rush', label: 'Rush Hour', note: 'More vehicles. Balance your lanes!', events: [], ...w });
const problem = (w: WaveShape): WaveDef => ({ id: 'problem', label: 'Unexpected Problem', note: 'Something is going wrong. Stay sharp!', events: [], ...w });
const finalSurge = (w: WaveShape): WaveDef => ({ id: 'surge', label: 'Final Surge', note: 'Last push. Keep it moving!', events: [], ...w });

export const DAYS: readonly DayDef[] = [
  {
    id: 'meycauayan',
    title: 'Shift 1',
    plaza: 'Meycauayan',
    lanes: 4,
    staff: 3,
    startOpen: [0, 1],
    redirect: false,
    engines: 0,
    seed: 1101,
    need: [0.22, 0.39, 0.51],
    brief: 'A gentle first shift. Put your booth staff where the traffic is.',
    fresh: ['Tap a booth to open or close it'],
    coach: ['budget', 'open', 'swap', 'closure'],
    perksAfter: [],
    waves: [
      warmUp({ duration: 12, rate: [0.85, 1.1, 1.15], habit: [0.5, 0.36, 0.1, 0.04], mix: FLEET_MIX }),
      rushHour({ duration: 20, note: 'Traffic is leaning right. Move your booths!', rate: [1.15, 1.6, 1.35], habit: [0.04, 0.08, 0.38, 0.5], mix: FLEET_MIX }),
      problem({ duration: 15, note: 'A booth is closing soon. Open another!', rate: [1.25, 1.45, 1.25], habit: [0.1, 0.25, 0.35, 0.3], mix: FLEET_MIX, events: trouble([5, 'closure']) }),
      finalSurge({ duration: 16, note: 'Traffic swings left. Last push!', rate: [1.3, 1.7, 0.9], habit: [0.5, 0.34, 0.12, 0.04], mix: FLEET_MIX }),
    ],
  },
  {
    id: 'marilao',
    title: 'Shift 2',
    plaza: 'Marilao',
    lanes: 5,
    laneTypes: [RFID, RFID, RFID, RFID, RELOAD],
    staff: 4,
    startOpen: [0, 1, 2, 4],
    redirect: true,
    engines: 0,
    seed: 2207,
    need: [0.16, 0.44, 0.52],
    brief: 'Catch vehicles before they join a line, and get no-load drivers to the reload lane.',
    fresh: ['Swipe approaching vehicles to a shorter lane', 'No-load vehicles need the reload lane'],
    coach: ['redirect', 'reload', 'tag'],
    perksAfter: [1],
    waves: [
      warmUp({ duration: 18, rate: [1.4, 1.8, 1.85], habit: [0.42, 0.3, 0.16, 0.08, 0.04], mix: FLEET_MIX, reloadShare: 0.1 }),
      rushHour({ duration: 28, rate: [1.85, 2.45, 2], habit: [0.1, 0.16, 0.26, 0.4, 0.08], heavyHabit: [0.06, 0.14, 0.3, 0.44, 0.06], mix: FLEET_MIX, reloadShare: 0.12 }),
      problem({ duration: 20, note: 'A toll tag is about to fail. Be ready to tap!', rate: [1.85, 2.2, 1.85], habit: [0.34, 0.3, 0.2, 0.1, 0.06], mix: FLEET_MIX, reloadShare: 0.12, events: trouble([4, 'tag'], [13, 'tag']) }),
      finalSurge({ duration: 22, rate: [1.95, 2.55, 1.25], habit: [0.16, 0.2, 0.26, 0.3, 0.08], mix: FLEET_MIX, reloadShare: 0.14, events: [surge(9, 6, 0, 'A wave of cars arrives on the left soon!')] }),
    ],
  },
  {
    id: 'bocaue',
    title: 'Shift 3',
    plaza: 'Bocaue Barrier',
    lanes: 5,
    laneTypes: [RELOAD, RFID, RFID, RFID, RFID],
    staff: 4,
    startOpen: [0, 1, 2, 3],
    redirect: true,
    engines: 1,
    seed: 3313,
    need: [0.24, 0.45, 0.62],
    brief: 'Faster waves, sudden surges and truck convoys. Your Engines Off is ready.',
    fresh: ['Faster waves and surges', 'Engines Off: everyone behind the front of a line switches off'],
    coach: ['engines'],
    perksAfter: [0, 2],
    waves: [
      warmUp({ duration: 14, rate: [1.1, 1.4, 1.45], habit: [0.06, 0.34, 0.3, 0.2, 0.1], mix: FLEET_MIX, reloadShare: 0.1 }),
      rushHour({ duration: 28, rate: [1.45, 1.8, 1.5], habit: [0.05, 0.1, 0.16, 0.31, 0.38], heavyHabit: [0.04, 0.1, 0.2, 0.3, 0.36], mix: FLEET_MIX, reloadShare: 0.12, events: [surge(14, 6, 4, 'Rush on the right lanes soon!')] }),
      problem({ duration: 22, note: 'A truck convoy is on its way.', rate: [1.2, 1.35, 1.15], habit: [0.05, 0.22, 0.28, 0.25, 0.2], mix: TRUCK_HEAVY, reloadShare: 0.1, events: [convoy(9, 6, 2, 1, 'Truck convoy coming, on the left lanes!'), ...trouble([4, 'tag'], [18, 'breakdown'])] }),
      finalSurge({ duration: 26, rate: [1.45, 1.85, 0.95], habit: [0.06, 0.38, 0.3, 0.16, 0.1], mix: FLEET_MIX, reloadShare: 0.13, events: [surge(10, 7, 1, 'Huge wave on the left soon!'), ...trouble([17, 'tag'])] }),
    ],
  },
  {
    id: 'balintawak',
    title: 'Shift 4',
    plaza: 'Balintawak',
    lanes: 6,
    laneTypes: [RFID, RFID, RFID, RELOAD, RFID, RFID],
    staff: 4,
    startOpen: [2, 3, 4, 5],
    redirect: true,
    engines: 1,
    seed: 4421,
    need: [0.42, 0.68, 0.79],
    brief: 'The busiest gate on the road, and its toll readers are playing up.',
    fresh: ['Toll reader faults: tap the wrench to repair', 'Breakdowns: tap to send a tow'],
    coach: ['reader', 'breakdown'],
    perksAfter: [0, 2],
    waves: [
      warmUp({ duration: 14, rate: [1.55, 1.95, 2], habit: [0.34, 0.26, 0.18, 0.05, 0.1, 0.07], mix: FLEET_MIX, reloadShare: 0.1 }),
      rushHour({ duration: 28, rate: [2, 2.35, 2.05], habit: [0.26, 0.24, 0.2, 0.06, 0.14, 0.1], heavyHabit: [0.08, 0.16, 0.3, 0.06, 0.24, 0.16], mix: FLEET_MIX, reloadShare: 0.11, events: trouble([12, 'reader']) }),
      problem({ duration: 24, note: 'Readers are failing. Repair them fast!', rate: [1.65, 1.85, 1.65], habit: [0.14, 0.2, 0.22, 0.06, 0.22, 0.16], mix: TRUCK_HEAVY, reloadShare: 0.1, events: trouble([3, 'reader'], [11, 'breakdown'], [18, 'tag']) }),
      finalSurge({ duration: 24, rate: [2, 2.5, 1.25], habit: [0.08, 0.12, 0.18, 0.06, 0.26, 0.3], mix: FLEET_MIX, reloadShare: 0.12, events: [surge(8, 8, 5, 'Big wave on the right soon!'), ...trouble([14, 'reader'])] }),
    ],
  },
  {
    id: 'san-fernando',
    title: 'Shift 5',
    plaza: 'San Fernando',
    lanes: 5,
    laneTypes: [RFID, RFID, RFID, RFID, RELOAD],
    staff: 3,
    startOpen: [1, 2, 4],
    redirect: true,
    engines: 2,
    seed: 5531,
    need: [0.29, 0.49, 0.67],
    brief: 'Truck day, and you are short of staff. Trucks burn nearly four times what a car burns standing still.',
    fresh: ['Fewer staff than ever', 'Twice the Engines Off, and you will need them'],
    coach: [],
    perksAfter: [0, 2],
    waves: [
      warmUp({ duration: 14, rate: [0.8, 0.95, 1], habit: [0.34, 0.3, 0.2, 0.12, 0.04], mix: [0.62, 0.17, 0.21], reloadShare: 0.08 }),
      rushHour({ duration: 28, rate: [1.05, 1.25, 1.05], habit: [0.06, 0.12, 0.24, 0.52, 0.06], heavyHabit: [0.06, 0.1, 0.24, 0.54, 0.06], mix: [0.5, 0.22, 0.28], reloadShare: 0.1, events: trouble([20, 'tag']) }),
      problem({ duration: 24, note: 'Truck convoy, and a reader is failing!', rate: [0.85, 1, 0.85], habit: [0.4, 0.3, 0.16, 0.08, 0.06], heavyHabit: [0.44, 0.3, 0.14, 0.08, 0.04], mix: [0.42, 0.22, 0.36], reloadShare: 0.1, events: [convoy(10, 4, 2, 0, 'Truck convoy on the left soon!'), ...trouble([4, 'reader'], [19, 'closure'])] }),
      finalSurge({ duration: 24, rate: [1.05, 1.35, 0.7], habit: [0.08, 0.2, 0.3, 0.36, 0.06], mix: [0.56, 0.2, 0.24], reloadShare: 0.1, events: [surge(9, 5, 3, 'Rush on the right soon!'), ...trouble([15, 'breakdown'])] }),
    ],
  },
  {
    id: 'dau',
    title: 'Shift 6',
    plaza: 'Dau',
    lanes: 6,
    laneTypes: [RELOAD, RFID, RFID, RFID, RFID, RELOAD],
    staff: 5,
    startOpen: [0, 1, 2, 3, 5],
    redirect: true,
    engines: 2,
    seed: 6647,
    need: [0.36, 0.6, 0.75],
    brief: 'The end of the road. Holy Week getaway: buses by the dozen, and everyone left at once.',
    fresh: ['Everything you have learned', 'Five waves and the most surges yet'],
    coach: [],
    perksAfter: [0, 2],
    finale: true,
    waves: [
      warmUp({ duration: 13, note: 'The getaway begins.', rate: [1.9, 2.3, 2.35], habit: [0.04, 0.34, 0.28, 0.18, 0.12, 0.04], mix: [0.72, 0.22, 0.06], reloadShare: 0.1 }),
      rushHour({ duration: 24, rate: [2.35, 2.9, 2.45], habit: [0.04, 0.12, 0.18, 0.28, 0.34, 0.04], heavyHabit: [0.04, 0.24, 0.3, 0.2, 0.18, 0.04], mix: [0.72, 0.22, 0.06], reloadShare: 0.12, events: [convoy(11, 7, 1, 4, 'A line of provincial buses arrives soon, on the right.')] }),
      problem({ duration: 22, rate: [2.1, 2.45, 2.1], habit: [0.04, 0.24, 0.26, 0.22, 0.2, 0.04], mix: [0.66, 0.18, 0.16], reloadShare: 0.12, events: trouble([3, 'reader'], [10, 'breakdown'], [16, 'closure']) }),
      { ...rushHour({ duration: 19, rate: [2.2, 2.8, 2.3], habit: [0.04, 0.36, 0.28, 0.16, 0.12, 0.04], mix: [0.72, 0.22, 0.06], reloadShare: 0.13, events: [surge(7, 9, 1, 'Everyone is coming home at once, on the left!'), ...trouble([13, 'tag'])] }), id: 'surge2', label: 'Second Surge', note: 'A second wave of getaway traffic!' },
      finalSurge({ duration: 22, note: 'One last surge, then you are done!', rate: [2.35, 3.1, 1.5], habit: [0.04, 0.14, 0.2, 0.28, 0.3, 0.04], mix: [0.72, 0.22, 0.06], reloadShare: 0.13, events: [surge(8, 10, 4, 'The biggest wave yet, on the right!'), ...trouble([13, 'reader'], [17, 'tag'])] }),
    ],
  },
];

export const dayById = (id: string): DayDef | null => DAYS.find((d) => d.id === id) ?? null;

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return (h >>> 0) % 2147483646 + 1;
};

const DAILY_PLAZAS = ['Sta. Ines', 'Dau', 'Angeles', 'Mexico', 'San Fernando', 'San Simon', 'Pulilan', 'Sta. Rita', 'Tabang', 'Bocaue Barrier', 'Marilao', 'Meycauayan', 'Paso de Blas', 'Balintawak'];

/** Lean weights toward one lane; reload lanes get few tagged drivers. */
function lean(types: readonly LaneType[], toward: number, strength: number): number[] {
  const lanes = types.length;
  const out = types.map((type, i) => (type === RELOAD ? 0.05 : Math.max(0.05, 1 - (Math.abs(i - toward) / lanes) * strength)));
  const total = out.reduce((a, b) => a + b, 0);
  return out.map((w) => Math.round((w / total) * 100) / 100);
}

/** Today's shift: the same for everyone on the same date. `dateKey` is YYYY-MM-DD. */
export function dailyDay(dateKey: string): DayDef {
  const seed = hash(`clean-air-${dateKey}`);
  const rng = createRng(seed);
  const wide = rng.chance(0.5);
  const lanes = wide ? 6 : 5;
  const staff = wide ? 5 : 4;
  const scale = (wide ? 1.26 : 1) * (0.95 + rng.next() * 0.12);
  const plaza = DAILY_PLAZAS[Math.floor(rng.next() * DAILY_PLAZAS.length)];
  const reloadAt = rng.chance(0.5) ? 0 : lanes - 1;
  const types: LaneType[] = Array.from({ length: lanes }, (_, i) => (i === reloadAt ? RELOAD : RFID));
  const farEnd = reloadAt === 0 ? lanes - 1 : 0;
  const nearEnd = reloadAt === 0 ? 1 : lanes - 2;
  const startFar = rng.chance(0.5);
  const first = startFar ? farEnd : nearEnd;
  const second = startFar ? nearEnd : farEnd;
  /* Staff starts at the end the first wave is NOT leaning toward, so there is work to do at once. */
  const rfidLanes = types.map((t, i) => (t === RFID ? i : -1)).filter((i) => i >= 0);
  const startOpen = [reloadAt, ...[...rfidLanes].sort((a, b) => Math.abs(a - second) - Math.abs(b - second)).slice(0, staff - 1)];
  const time = (a: number, b: number): number => Math.round(a + rng.next() * (b - a));
  const r = (a: number, b: number, c: number): [number, number, number] => [a * scale, b * scale, c * scale];
  const middle = Math.floor(lanes / 2);
  const troubleKinds: ('reader' | 'breakdown' | 'closure' | 'tag')[] = ['reader', 'breakdown', 'closure', 'tag'];
  const pickTrouble = (): 'reader' | 'breakdown' | 'closure' | 'tag' => troubleKinds[Math.floor(rng.next() * troubleKinds.length)];
  return {
    id: `daily-${dateKey}`,
    title: "Today's shift",
    plaza,
    lanes,
    laneTypes: types,
    staff,
    startOpen,
    redirect: true,
    engines: 1,
    seed,
    need: [0.25, 0.46, 0.62],
    brief: 'A new plaza and new traffic every day, the same for everyone.',
    fresh: [],
    coach: [],
    perksAfter: [0, 2],
    waves: [
      warmUp({ duration: 14, rate: r(1.3, 1.65, 1.7), habit: lean(types, first, 1.3), mix: FLEET_MIX, reloadShare: 0.1 }),
      rushHour({ duration: 28, rate: r(1.7, 2.1, 1.75), habit: lean(types, second, 1.5), heavyHabit: lean(types, middle, 1.2), mix: FLEET_MIX, reloadShare: 0.12, events: [surge(time(10, 18), 7, second, 'A wave of traffic is coming soon!')] }),
      problem({ duration: 22, rate: r(1.5, 1.7, 1.45), habit: lean(types, middle, 0.9), mix: TRUCK_HEAVY, reloadShare: 0.1, events: [{ t: time(3, 6), kind: pickTrouble() }, { t: time(13, 18), kind: pickTrouble() }] }),
      finalSurge({ duration: 26, rate: r(1.7, 2.2, 1.1), habit: lean(types, first, 1.5), mix: FLEET_MIX, reloadShare: 0.13, events: [surge(time(8, 13), 8, first, 'The last big wave is coming!'), { t: time(15, 20), kind: pickTrouble() }] }),
    ],
  };
}
