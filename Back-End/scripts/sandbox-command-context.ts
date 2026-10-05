/**
 * A sandbox state for testing the command parser, as the dashboard sends it: route Paso de Blas → Marilao,
 * the window on Meycauayan (Km 20.0–20.6), both carriageways 4 lanes, northbound with lane 4 closed and a
 * 60 km/h zone, one collision on the road, July 2026's forecast days loaded on Wed 1 July, the clock at 19:59.
 * The places are a sample of the corridor's, on and off the route, with the ids and booth counts the
 * dashboard uses; the run is playing at 1x, not full screen. Shared by sandbox-command-check.ts and sandbox-command-eval.ts.
 */
import type { SandboxContext } from "../src/services/sandbox-command.service.js";

/** The corridor's exits, as Front-End-Dashboard/lib/nlex-exits.ts has them (km posts). */
const EXITS: [number, string, number][] = [
  [1, "Balintawak", 12], [2, "NLEX Harbor Link", 13.63], [3, "Paso De Blas Valenzuela", 15.44], [4, "Meycauayan", 20.21],
  [5, "Marilao", 23.73], [6, "CDV/PH Arena", 26.05], [7, "Bocaue Barrier", 27.2], [8, "Bocaue Interchange", 27.82],
  [9, "Tambubong", 28.81], [10, "Tabang Guiguinto", 32.69], [11, "Balagtas", 33.09], [12, "Sta. Rita Guiguinto", 38.55],
  [13, "Pulilan", 45.33], [14, "San Simon", 56.91], [15, "San Fernando", 65.78], [16, "Mexico", 72.78],
  [17, "Angeles", 81.15], [18, "Dau", 83.05], [19, "SCTEX", 85.23], [20, "Sta. Ines", 88.25],
];

export function sandboxTestContext(): SandboxContext {
  const win = { fromKm: 20.0, toKm: 20.6 };
  const route = { fromKm: 15.44, toKm: 23.73 };
  const place = (id: string, name: string, kind: "exit_ramp" | "entry_ramp" | "service_area" | "barrier", direction: "NB" | "SB", km: number, stations: number) => ({
    id, name, kind, direction, km, stations,
    inWindow: km >= win.fromKm && km <= win.toKm,
    onRoute: km >= route.fromKm && km <= route.toKm,
  });
  return {
    laneCount: 4,
    segmentLengthM: 600,
    exits: EXITS.map(([exit_id, exit_name, km]) => ({ exit_id, exit_name, km })),
    closedLanes: [4],
    speedLimitKmh: 60,
    incidentCount: 0,
    view: "Both",
    focus: "NB",
    route: { originExitId: 3, destinationExitId: 5, ...route },
    window: win,
    directions: {
      NB: { lanes: 4, lanesFromRoad: 4, closedLanes: [4], closure: { fromKm: 20.3, toKm: 20.6 }, speedLimitKmh: 60, zone: { fromKm: 20.1, toKm: 20.5 }, inflowVehPerHour: 5200, inflowSource: "record" },
      SB: { lanes: 4, lanesFromRoad: 4, closedLanes: [], closure: null, speedLimitKmh: null, zone: null, inflowVehPerHour: 3900, inflowSource: "record" },
    },
    places: [
      place("entry:3:SB", "Paso de Blas Valenzuela Toll Plaza (entry)", "entry_ramp", "SB", 15.37, 4),
      place("entry:3:NB", "Paso de Blas Valenzuela Toll Plaza (entry)", "entry_ramp", "NB", 15.56, 3),
      place("sa:drive-dine", "NLEX Drive & Dine", "service_area", "SB", 16.8, 4),
      place("entry:4:SB", "Meycauayan Toll Plaza (entry)", "entry_ramp", "SB", 20.03, 5),
      place("entry:4:NB", "Meycauayan Toll Plaza (entry)", "entry_ramp", "NB", 20.33, 3),
      place("sa:petron-marilao", "Petron NLEX-Marilao", "service_area", "NB", 22.5, 4),
      place("entry:5:SB", "Marilao Toll Plaza (entry)", "entry_ramp", "SB", 23.55, 4),
      place("barrier:7:SB", "Bocaue Barrier Toll Plaza", "barrier", "SB", 27.2, 24),
      place("sa:petron-bocaue", "Petron NLEX South Bocaue", "service_area", "SB", 30.2, 4),
      place("sa:shell-balagtas", "Shell NLEX North Balagtas", "service_area", "NB", 32.1, 4),
      place("exit:14:NB", "San Simon Toll Plaza (exit)", "exit_ramp", "NB", 56.71, 2),
      place("entry:14:NB", "San Simon Toll Plaza (entry)", "entry_ramp", "NB", 57.08, 2),
      place("exit:14:SB", "San Simon Toll Plaza (exit)", "exit_ramp", "SB", 57.11, 2),
      place("sa:mega-station", "Mega Station", "service_area", "SB", 62.6, 4),
      place("exit:15:NB", "San Fernando Toll Plaza (exit)", "exit_ramp", "NB", 65.9, 7),
      place("entry:15:SB", "San Fernando Toll Plaza (entry)", "entry_ramp", "SB", 65.58, 5),
    ],
    events: [{ id: "NB:ev1", name: "Minor collision #1", direction: "NB", km: 20.3, startMin: 0, endMin: 42 }],
    reallocation: null,
    clock: { hour: 19, minute: 59 },
    nowMin: 3,
    forecastDay: "2026-07-01",
    forecastDays: Array.from({ length: 31 }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`),
    playback: { running: true, speed: 1, fullScreen: false },
  };
}
