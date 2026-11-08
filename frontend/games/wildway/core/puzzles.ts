/**
 * The puzzle kit: three kinds, all deterministic and pure, so tests can prove every level
 * solvable and the scrambled start unsolved.
 *
 *   Circuit  rotate pipe tiles until every outlet is connected to the source
 *            (cables, water valves, solar wiring)
 *   Dials    tune three dials to a hidden setting; each test says how many are right
 *            (sensor calibration, diagnostics)
 *   Loading  pack items into a cargo bay without overlap, within the weight, keeping
 *            items that must stay apart apart
 */

/* ---- Circuit ---- */

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export type TileKind = 'empty' | 'source' | 'sink' | 'pipe' | 'fixed';

export interface Tile {
  kind: TileKind;
  /** Which sides it connects: N, E, S, W bits. */
  mask: number;
}

export interface CircuitLevel {
  id: string;
  title: string;
  /** Rows of two-character cells: kind (S source, K sink, P pipe, F fixed pipe, . empty) and a hex mask. */
  solution: readonly string[];
  /** Turns the pipes from the solution to make the start. */
  seed: number;
}

export const rotateMask = (mask: number, turns: number): number => {
  let m = mask;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i += 1) {
    m = ((m << 1) | (m >> 3)) & 15;
  }
  return m;
};

export function parseCircuit(rows: readonly string[]): Tile[][] {
  return rows.map((row) => {
    const out: Tile[] = [];
    for (let i = 0; i < row.length; i += 2) {
      const k = row[i];
      const mask = parseInt(row[i + 1], 16) || 0;
      out.push({ kind: k === 'S' ? 'source' : k === 'K' ? 'sink' : k === 'P' ? 'pipe' : k === 'F' ? 'fixed' : 'empty', mask });
    }
    return out;
  });
}

/** The scrambled start: every free pipe turned 1 to 3 quarter turns from its solved position. */
export function circuitStart(level: CircuitLevel): Tile[][] {
  return parseCircuit(level.solution).map((row, y) => row.map((t, x) => (t.kind === 'pipe' ? { ...t, mask: rotateMask(t.mask, 1 + ((x * 7 + y * 3 + level.seed) % 3)) } : { ...t })));
}

export const rotateTile = (grid: Tile[][], x: number, y: number): Tile[][] =>
  grid.map((row, yy) => row.map((t, xx) => (xx === x && yy === y && t.kind === 'pipe' ? { ...t, mask: rotateMask(t.mask, 1) } : t)));

const DIRS: readonly [number, number, number, number][] = [
  [N, 0, -1, S],
  [E, 1, 0, W],
  [S, 0, 1, N],
  [W, -1, 0, E],
];

/** Every tile reached from a source through matching ends. */
export function powered(grid: Tile[][]): boolean[][] {
  const on = grid.map((row) => row.map(() => false));
  const stack: [number, number][] = [];
  grid.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'source') {
        on[y][x] = true;
        stack.push([x, y]);
      }
    }),
  );
  while (stack.length > 0) {
    const [x, y] = stack.pop() as [number, number];
    const t = grid[y][x];
    for (const [bit, dx, dy, back] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if ((t.mask & bit) === 0 || ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[ny].length || on[ny][nx]) {
        continue;
      }
      const n = grid[ny][nx];
      if (n.kind !== 'empty' && (n.mask & back) !== 0) {
        on[ny][nx] = true;
        stack.push([nx, ny]);
      }
    }
  }
  return on;
}

export function circuitSolved(grid: Tile[][]): boolean {
  const on = powered(grid);
  return grid.every((row, y) => row.every((t, x) => t.kind !== 'sink' || on[y][x]));
}

export const CIRCUITS: Record<string, CircuitLevel> = {
  cable: {
    id: 'cable',
    title: 'Reconnect the RFID scanner',
    seed: 1,
    solution: ['P3P6PAPC', 'S2P9PAP5', 'P3PAPCK1'],
  },
  weather: {
    id: 'weather',
    title: 'Rewire the weather station',
    seed: 2,
    solution: ['S4PAP6K8', 'P3PEP9PC', 'P6P5P5P3', 'P9P3PAK8'],
  },
  valves: {
    id: 'valves',
    title: 'Route the water round the blockage',
    seed: 3,
    solution: ['P6PAPCP3P9', 'P5P6PAPCP6', 'S2P9P3P5PA', 'P3PAP6P3K8'],
  },
  solar: {
    id: 'solar',
    title: 'Wire the solar roof to the depot',
    seed: 4,
    solution: ['P6P3S4P9PC', 'P5PAP5P6P5', 'P3P6PBPCP9', 'P9P5P6P3PC', 'K2P9P3PAK1'],
  },
  /* The simplified Solar Power Rescue: one small board, two panel strings to the box. */
  solarLite: {
    id: 'solarLite',
    title: 'Connect the solar panels',
    seed: 5,
    solution: ['P6PAP6K8', 'S2PAPD.0', 'P3P5P3K8'],
  },
};

/* ---- Dials ---- */

export interface DialLevel {
  id: string;
  title: string;
  /** How many settings each dial has. */
  options: number;
  target: readonly number[];
}

export const DIALS: Record<string, DialLevel> = {
  sensor: { id: 'sensor', title: 'Calibrate the toll sensor', options: 4, target: [2, 0, 3] },
};

/** How many dials are on the right setting: the only feedback, like a code lock. */
export const dialsRight = (level: DialLevel, guess: readonly number[]): number => level.target.reduce((a, t, i) => a + (guess[i] === t ? 1 : 0), 0);

/* ---- Loading ---- */

export interface LoadItem {
  id: string;
  label: string;
  /** Cells it covers, from its top-left, before turning. */
  cells: readonly (readonly [number, number])[];
  kg: number;
  /** Must not share an edge with items carrying any of these tags. */
  keepFrom?: readonly string[];
  tag?: string;
  /** False for something the trip does not need: packing it is never required. */
  required?: boolean;
  /** Why it stays behind, when it is not needed. */
  leaveBecause?: string;
}

export interface LoadLevel {
  id: string;
  title: string;
  w: number;
  h: number;
  maxKg: number;
  items: readonly LoadItem[];
}

export interface Placement {
  id: string;
  x: number;
  y: number;
  turns: number;
}

export const turnCells = (cells: readonly (readonly [number, number])[], turns: number): [number, number][] => {
  let out = cells.map(([x, y]) => [x, y] as [number, number]);
  for (let i = 0; i < turns % 4; i += 1) {
    out = out.map(([x, y]) => [-y, x] as [number, number]);
  }
  const mx = Math.min(...out.map((c) => c[0]));
  const my = Math.min(...out.map((c) => c[1]));
  return out.map(([x, y]) => [x - mx, y - my] as [number, number]);
};

export const covered = (level: LoadLevel, p: Placement): [number, number][] => {
  const item = level.items.find((i) => i.id === p.id);
  return item === undefined ? [] : turnCells(item.cells, p.turns).map(([x, y]) => [x + p.x, y + p.y] as [number, number]);
};

/** Why a set of placements is not allowed, or null if it is. */
export function loadProblem(level: LoadLevel, placed: readonly Placement[]): string | null {
  const owner = new Map<string, string>();
  for (const p of placed) {
    for (const [x, y] of covered(level, p)) {
      if (x < 0 || y < 0 || x >= level.w || y >= level.h) {
        return 'That would stick out of the cargo bay.';
      }
      const key = `${x},${y}`;
      if (owner.has(key)) {
        return 'Two things cannot share the same space.';
      }
      owner.set(key, p.id);
    }
  }
  const kg = placed.reduce((a, p) => a + (level.items.find((i) => i.id === p.id)?.kg ?? 0), 0);
  if (kg > level.maxKg) {
    return `That is ${kg} kg, and the van takes ${level.maxKg} kg.`;
  }
  for (const p of placed) {
    const item = level.items.find((i) => i.id === p.id);
    if (item?.keepFrom === undefined) {
      continue;
    }
    for (const [x, y] of covered(level, p)) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const other = owner.get(`${x + dx},${y + dy}`);
        const otherItem = level.items.find((i) => i.id === other);
        if (other !== undefined && other !== p.id && otherItem?.tag !== undefined && item.keepFrom.includes(otherItem.tag)) {
          return `The ${item.label} must not touch the ${otherItem.label}.`;
        }
      }
    }
  }
  return null;
}

export const loadSolved = (level: LoadLevel, placed: readonly Placement[]): boolean =>
  loadProblem(level, placed) === null && level.items.every((i) => i.required === false || placed.some((p) => p.id === i.id));

export const LOADS: Record<string, LoadLevel> = {
  delivery: {
    id: 'delivery',
    title: 'Load the field van',
    w: 4,
    h: 3,
    maxKg: 300,
    items: [
      { id: 'seedlings', label: 'seedling trays', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], kg: 80 },
      { id: 'tents', label: 'field tents', cells: [[0, 0], [1, 0]], kg: 30 },
      { id: 'traps', label: 'camera-trap kit', cells: [[0, 0], [0, 1]], kg: 20, tag: 'electronics' },
      { id: 'medkit', label: 'specialist kit', cells: [[0, 0]], kg: 40, tag: 'electronics' },
      { id: 'rope', label: 'rope and tools', cells: [[0, 0]], kg: 25 },
      { id: 'water', label: 'water jugs', cells: [[0, 0]], kg: 20, keepFrom: ['electronics'] },
      { id: 'generator', label: 'spare generator', cells: [[0, 0], [1, 0]], kg: 150, required: false, leaveBecause: 'The field station has power. It would only add weight.' },
    ],
  },
};

/** Finds a solution by search, for tests and the development bot. */
export function solveLoad(level: LoadLevel): Placement[] | null {
  const items = level.items.filter((i) => i.required !== false).sort((a, b) => b.cells.length - a.cells.length);
  const placed: Placement[] = [];
  const go = (i: number): boolean => {
    if (i === items.length) {
      return loadSolved(level, placed);
    }
    for (let turns = 0; turns < 4; turns += 1) {
      for (let y = 0; y < level.h; y += 1) {
        for (let x = 0; x < level.w; x += 1) {
          placed.push({ id: items[i].id, x, y, turns });
          if (loadProblem(level, placed) === null && go(i + 1)) {
            return true;
          }
          placed.pop();
        }
      }
    }
    return false;
  };
  return go(0) ? [...placed] : null;
}
