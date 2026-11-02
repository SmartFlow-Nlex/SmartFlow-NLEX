/**
 * Rush Hour's rules: a 6x6 toll plaza, vehicles that slide only the way they
 * face, and Navie's car to be driven out of the exit on the right of row 3.
 *
 * Pure functions over a list of vehicles - no React - so the play screen, the
 * hint and the tests share one set of rules (the same ones the puzzle
 * generator in scripts/ used to measure each puzzle).
 *
 * The 'worklet' ones also run on the UI thread, where a drag is handled, so a
 * car's limits come from the same rules the moment it is grabbed.
 */

export const SIZE = 6;
/** The row with the exit, counted from 0 at the top. */
export const EXIT_ROW = 2;
/** Navie's car. */
export const TARGET = 'A';

export interface Vehicle {
  /** One letter; 'A' is Navie. */
  id: string;
  row: number;
  col: number;
  /** 2 for a car, 3 for a truck. */
  length: number;
  horizontal: boolean;
}

/** A slide of one vehicle: + is right or down, - left or up, in cells. */
export interface Move {
  id: string;
  offset: number;
}

/** Vehicles of a 36-character layout: 'o' empty, 'A' Navie, other letters the rest. */
export function parseLayout(layout: string): Vehicle[] {
  const cells = new Map<string, number[]>();
  for (let i = 0; i < layout.length; i += 1) {
    const ch = layout[i];
    if (ch === 'o') {
      continue;
    }
    const list = cells.get(ch) ?? [];
    list.push(i);
    cells.set(ch, list);
  }
  return [...cells.entries()].map(([id, indexes]) => {
    const rows = indexes.map((i) => Math.floor(i / SIZE));
    const cols = indexes.map((i) => i % SIZE);
    return {
      id,
      row: Math.min(...rows),
      col: Math.min(...cols),
      length: indexes.length,
      horizontal: new Set(rows).size === 1,
    };
  });
}

/** Which vehicle, if any, is on each of the 36 cells. */
function occupancy(vehicles: Vehicle[]): (string | null)[] {
  'worklet';
  const grid: (string | null)[] = new Array(SIZE * SIZE).fill(null);
  for (const v of vehicles) {
    for (let i = 0; i < v.length; i += 1) {
      grid[v.horizontal ? v.row * SIZE + v.col + i : (v.row + i) * SIZE + v.col] = v.id;
    }
  }
  return grid;
}

/** How far a vehicle can slide back (min, <= 0) and forward (max, >= 0) right now. */
export function slideRange(vehicles: Vehicle[], id: string): { min: number; max: number } {
  'worklet';
  const v = vehicles.find((item) => item.id === id);
  if (v === undefined) {
    return { min: 0, max: 0 };
  }
  const grid = occupancy(vehicles);
  const free = (row: number, col: number): boolean =>
    row >= 0 && row < SIZE && col >= 0 && col < SIZE && grid[row * SIZE + col] === null;
  let min = 0;
  while (v.horizontal ? free(v.row, v.col + min - 1) : free(v.row + min - 1, v.col)) {
    min -= 1;
  }
  let max = 0;
  while (
    v.horizontal
      ? free(v.row, v.col + v.length + max)
      : free(v.row + v.length + max, v.col)
  ) {
    max += 1;
  }
  return { min, max };
}

/** The board after a slide. The slide is assumed legal - see slideRange. */
export function applyMove(vehicles: Vehicle[], move: Move): Vehicle[] {
  'worklet';
  return vehicles.map((v) =>
    v.id !== move.id
      ? v
      : v.horizontal
        ? { ...v, col: v.col + move.offset }
        : { ...v, row: v.row + move.offset },
  );
}

/** Navie's car has reached the exit. */
export function isSolved(vehicles: Vehicle[]): boolean {
  const navie = vehicles.find((v) => v.id === TARGET);
  return navie !== undefined && navie.col + navie.length === SIZE;
}

/**
 * The shortest way from here to the exit, or null if there is none (or the
 * search grew past `limit` positions). Breadth-first, so the first move of the
 * answer is always a best next move - which is what the Hint shows.
 *
 * The vehicles never change during a search, only where each one is along its
 * lane, so a position is one character per vehicle rather than a board. That
 * made the search about five times faster - it runs on the phone, while the
 * player waits for the hint.
 */
export function solve(vehicles: Vehicle[], limit = 300000): Move[] | null {
  if (isSolved(vehicles)) {
    return [];
  }
  const count = vehicles.length;
  const along = (v: Vehicle): number => (v.horizontal ? v.col : v.row);
  const lane = vehicles.map((v) => (v.horizontal ? v.row : v.col));
  const target = vehicles.findIndex((v) => v.id === TARGET);
  const cellOf = (i: number, pos: number): number =>
    vehicles[i].horizontal ? lane[i] * SIZE + pos : pos * SIZE + lane[i];
  const grid = new Uint8Array(SIZE * SIZE);
  const fill = (key: string): void => {
    grid.fill(0);
    for (let i = 0; i < count; i += 1) {
      const pos = key.charCodeAt(i) - 48;
      for (let k = 0; k < vehicles[i].length; k += 1) {
        grid[cellOf(i, pos + k)] = 1;
      }
    }
  };
  const withPos = (key: string, i: number, pos: number): string =>
    key.slice(0, i) + String.fromCharCode(48 + pos) + key.slice(i + 1);

  const startKey = String.fromCharCode(...vehicles.map((v) => 48 + along(v)));
  const parent = new Map<string, { from: string; index: number; offset: number } | null>([[startKey, null]]);
  let frontier = [startKey];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const key of frontier) {
      fill(key);
      for (let i = 0; i < count; i += 1) {
        const pos = key.charCodeAt(i) - 48;
        const candidates: number[] = [];
        for (let p = pos - 1; p >= 0 && grid[cellOf(i, p)] === 0; p -= 1) {
          candidates.push(p);
        }
        for (let end = pos + vehicles[i].length; end < SIZE && grid[cellOf(i, end)] === 0; end += 1) {
          candidates.push(end - vehicles[i].length + 1);
        }
        for (const p of candidates) {
          const after = withPos(key, i, p);
          if (parent.has(after)) {
            continue;
          }
          parent.set(after, { from: key, index: i, offset: p - pos });
          if (i === target && p + vehicles[i].length === SIZE) {
            const path: Move[] = [];
            let at = after;
            for (let step = parent.get(at); step !== null && step !== undefined; step = parent.get(at)) {
              path.unshift({ id: vehicles[step.index].id, offset: step.offset });
              at = step.from;
            }
            return path;
          }
          if (parent.size > limit) {
            return null;
          }
          next.push(after);
        }
      }
    }
    frontier = next;
  }
  return null;
}

/** 3 stars at the minimum, 2 within half as many again, 1 for any finish. */
export function starsFor(moves: number, minMoves: number): 1 | 2 | 3 {
  if (moves <= minMoves) {
    return 3;
  }
  return moves <= Math.ceil(minMoves * 1.5) ? 2 : 1;
}
