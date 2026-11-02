/**
 * Generates the Rush Hour puzzles in frontend/games/rushHour/levels.ts.
 *
 *   node scripts/generate-rush-hour-levels.js
 *
 * Our own puzzles, not copies of any published set. Each comes from a random
 * 6x6 toll plaza: every position its vehicles can reach is mapped, the number
 * of moves each position needs is measured back from the solved ones, and the
 * hardest position is kept (or one at a chosen difficulty). So every puzzle is
 * solvable and its minimum is exact. A move is one vehicle sliding any
 * distance, as in the board game.
 *
 * Seeded, so running it again gives the same puzzles.
 */
const fs = require('fs');
const path = require('path');

const SIZE = 6;
const EXIT_ROW = 2;
const LETTERS = 'BCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Clusters bigger than this are skipped: slow to map, and rarely where the hard puzzles are. */
const MAX_STATES = 80000;
/** How long to search for, at most - plenty of puzzles turn up long before. */
const BUDGET_MS = Number(process.env.BUDGET_S ?? 480) * 1000;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261023);
const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/** Vehicles of a 36-character layout: 'o' empty, 'A' Navie, other letters the rest. */
function parse(layout) {
  const cells = new Map();
  for (let i = 0; i < layout.length; i += 1) {
    const ch = layout[i];
    if (ch === 'o') continue;
    if (!cells.has(ch)) cells.set(ch, []);
    cells.get(ch).push(i);
  }
  return [...cells.entries()].map(([id, idx]) => {
    const rows = idx.map((i) => Math.floor(i / SIZE));
    const cols = idx.map((i) => i % SIZE);
    return { id, row: Math.min(...rows), col: Math.min(...cols), len: idx.length, horiz: new Set(rows).size === 1 };
  });
}

/** Every layout one slide away. */
function neighbours(layout) {
  const out = [];
  for (const v of parse(layout)) {
    const step = v.horiz ? 1 : SIZE;
    const first = v.row * SIZE + v.col;
    const last = first + (v.len - 1) * step;
    // Backwards (left / up).
    for (let k = 1; ; k += 1) {
      const cell = first - k * step;
      if (v.horiz ? v.col - k < 0 : v.row - k < 0) break;
      if (layout[cell] !== 'o') break;
      out.push(slide(layout, v, -k));
    }
    // Forwards (right / down).
    for (let k = 1; ; k += 1) {
      const cell = last + k * step;
      if (v.horiz ? v.col + v.len - 1 + k >= SIZE : v.row + v.len - 1 + k >= SIZE) break;
      if (layout[cell] !== 'o') break;
      out.push(slide(layout, v, k));
    }
  }
  return out;
}

function slide(layout, v, k) {
  const chars = layout.split('');
  const step = v.horiz ? 1 : SIZE;
  const first = v.row * SIZE + v.col;
  for (let i = 0; i < v.len; i += 1) chars[first + i * step] = 'o';
  for (let i = 0; i < v.len; i += 1) chars[first + (i + k) * step] = v.id;
  return chars.join('');
}

/** Navie's car at the exit: its right end in the last column of the exit row. */
const isSolved = (layout) => layout[EXIT_ROW * SIZE + SIZE - 1] === 'A' && layout[EXIT_ROW * SIZE + SIZE - 2] === 'A';

/** Letters renamed in reading order, so the same puzzle always reads the same. */
function canonical(layout) {
  const map = new Map([['o', 'o'], ['A', 'A']]);
  let next = 0;
  return layout.split('').map((ch) => {
    if (!map.has(ch)) map.set(ch, LETTERS[next++]);
    return map.get(ch);
  }).join('');
}

function randomBoard() {
  const grid = new Array(SIZE * SIZE).fill('o');
  const col = randInt(0, 3);
  grid[EXIT_ROW * SIZE + col] = 'A';
  grid[EXIT_ROW * SIZE + col + 1] = 'A';
  const target = randInt(8, 13);
  let placed = 0;
  for (let attempt = 0; attempt < 400 && placed < target; attempt += 1) {
    const len = rng() < 0.72 ? 2 : 3;
    const horiz = rng() < 0.5;
    const row = horiz ? randInt(0, SIZE - 1) : randInt(0, SIZE - len);
    const c = horiz ? randInt(0, SIZE - len) : randInt(0, SIZE - 1);
    // A car across the exit row could never leave it: the puzzle would be unsolvable.
    if (horiz && row === EXIT_ROW) continue;
    const cells = [];
    for (let i = 0; i < len; i += 1) cells.push(horiz ? row * SIZE + c + i : (row + i) * SIZE + c);
    if (cells.some((i) => grid[i] !== 'o')) continue;
    for (const i of cells) grid[i] = LETTERS[placed];
    placed += 1;
  }
  return grid.join('');
}

/**
 * Every position reachable from `start`, with the fewest moves each needs to
 * finish (moves are reversible, so it is measured outward from the solved
 * positions). Null when none is solvable or the cluster is too big.
 *
 * Inside a cluster the vehicles never change, only where they are along their
 * lanes - so a position is kept as one character per vehicle, not a whole
 * board. Several times faster than re-reading 36 cells for every position.
 */
function distances(start) {
  const vs = parse(start);
  const fixed = vs.map((v) => (v.horiz ? v.row : v.col));
  const target = vs.findIndex((v) => v.id === 'A');
  const startKey = String.fromCharCode(...vs.map((v) => 48 + (v.horiz ? v.col : v.row)));
  const cellOf = (i, pos) => (vs[i].horiz ? fixed[i] * SIZE + pos : pos * SIZE + fixed[i]);
  const grid = new Uint8Array(SIZE * SIZE);
  const next = (key) => {
    grid.fill(0);
    for (let i = 0; i < vs.length; i += 1) {
      const pos = key.charCodeAt(i) - 48;
      for (let k = 0; k < vs[i].len; k += 1) grid[cellOf(i, pos + k)] = 1;
    }
    const out = [];
    for (let i = 0; i < vs.length; i += 1) {
      const pos = key.charCodeAt(i) - 48;
      for (let p = pos - 1; p >= 0 && grid[cellOf(i, p)] === 0; p -= 1) {
        out.push(key.slice(0, i) + String.fromCharCode(48 + p) + key.slice(i + 1));
      }
      for (let end = pos + vs[i].len; end < SIZE && grid[cellOf(i, end)] === 0; end += 1) {
        out.push(key.slice(0, i) + String.fromCharCode(48 + end - vs[i].len + 1) + key.slice(i + 1));
      }
    }
    return out;
  };
  const solved = (key) => key.charCodeAt(target) - 48 === SIZE - 2;
  const toLayout = (key) => {
    const chars = new Array(SIZE * SIZE).fill('o');
    for (let i = 0; i < vs.length; i += 1) {
      const pos = key.charCodeAt(i) - 48;
      for (let k = 0; k < vs[i].len; k += 1) chars[cellOf(i, pos + k)] = vs[i].id;
    }
    return chars.join('');
  };

  const seen = new Set([startKey]);
  const queue = [startKey];
  for (let i = 0; i < queue.length; i += 1) {
    for (const n of next(queue[i])) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
        if (seen.size > MAX_STATES) return null;
      }
    }
  }
  const dist = new Map();
  const frontier = queue.filter(solved);
  if (frontier.length === 0) return null;
  for (const s of frontier) dist.set(s, 0);
  for (let i = 0; i < frontier.length; i += 1) {
    const d = dist.get(frontier[i]);
    for (const n of next(frontier[i])) {
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        frontier.push(n);
      }
    }
  }
  // Back to whole boards for the rest of the script.
  const boards = new Map();
  for (const [key, d] of dist) boards.set(key, d);
  return { dist: boards, toLayout };
}

/** Fewest moves from `layout` to solved, by a plain search - the check on every kept puzzle. */
function solveLength(layout) {
  if (isSolved(layout)) return 0;
  const seen = new Set([layout]);
  let level = [layout];
  for (let depth = 1; level.length > 0; depth += 1) {
    const next = [];
    for (const s of level) {
      for (const n of neighbours(s)) {
        if (seen.has(n)) continue;
        if (isSolved(n)) return depth;
        seen.add(n);
        next.push(n);
      }
    }
    level = next;
  }
  return -1;
}

// ---------------------------------------------------------------- generate

const byMoves = new Map(); // minMoves -> [{ layout, cluster }]
const used = new Set();
let boards = 0;
const started = Date.now();
while (Date.now() - started < BUDGET_MS) {
  boards += 1;
  if (boards % 250 === 0) {
    const hardest = Math.max(0, ...byMoves.keys());
    console.log(`  ${boards} boards, ${((Date.now() - started) / 1000).toFixed(0)}s, hardest so far ${hardest} moves`);
  }
  const found = distances(randomBoard());
  if (found === null) continue;
  const { dist, toLayout } = found;
  // The hardest position in this cluster, plus a few easier ones from it.
  let hardest = null;
  const wanted = new Map();
  for (const [s, d] of dist) {
    if (d < 3) continue;
    if (hardest === null || d > hardest.d) hardest = { s, d };
    if (!wanted.has(d) || rng() < 0.02) wanted.set(d, s);
  }
  if (hardest === null) continue;
  for (const [d, s] of [[hardest.d, hardest.s], ...wanted]) {
    const key = canonical(toLayout(s));
    if (used.has(key)) continue;
    used.add(key);
    if (!byMoves.has(d)) byMoves.set(d, []);
    // Which random board it came from: puzzles from one board look alike.
    byMoves.get(d).push({ layout: key, cluster: boards });
  }
}
console.log(`searched ${boards} boards in ${((Date.now() - started) / 1000).toFixed(0)}s`);
console.log('puzzles found per minimum:', [...byMoves.entries()].sort((a, b) => a[0] - b[0]).map(([d, l]) => `${d}:${l.length}`).join(' '));

/**
 * Takes a puzzle needing `moves`, else the nearest still free - harder first,
 * then easier - so the set adapts to how hard the puzzles found turned out.
 */
const usedClusters = new Set();
function take(moves) {
  // First from a board no other puzzle came from, so no two look alike; only
  // then from one already used.
  for (const fresh of [true, false]) {
    for (let step = 0; step <= 60; step += 1) {
      for (const d of step === 0 ? [moves] : [moves + step, moves - step]) {
        const list = byMoves.get(d);
        if (d < 3 || list === undefined) continue;
        const free = list.filter((p) => !fresh || !usedClusters.has(p.cluster));
        if (free.length === 0) continue;
        // Prefer busier boards - more vehicles look and play more like a jam.
        const vehicles = (p) => new Set(p.layout.replace(/o/g, '')).size;
        const pick = free.sort((a, b) => vehicles(b) - vehicles(a))[0];
        list.splice(list.indexOf(pick), 1);
        usedClusters.add(pick.cluster);
        return { layout: pick.layout, minMoves: d };
      }
    }
  }
  return null;
}

// 30 levels, from 3 moves up to the hardest puzzle found, the last few kept hard.
const hardestFound = Math.max(...byMoves.keys());
const LEVEL_COUNT = 30;
const levelTargets = Array.from({ length: LEVEL_COUNT }, (_, i) =>
  Math.round(3 + ((hardestFound - 3) * i) / (LEVEL_COUNT - 1)),
);
// The hardest first, so the top levels get the rare hard puzzles before the
// daily pool can; then put back in order.
const levels = levelTargets
  .map((moves, i) => ({ i, moves }))
  .sort((a, b) => b.moves - a.moves)
  .map(({ i, moves }) => ({ i, ...take(moves) }))
  .sort((a, b) => a.i - b.i)
  .map(({ i, layout, minMoves }) => ({ id: `level-${i + 1}`, layout, minMoves }))
  // Levels must never get easier as you go: order by the minimum actually taken.
  .sort((a, b) => a.minMoves - b.minMoves)
  .map((level, i) => ({ ...level, id: `level-${i + 1}` }));
// 60 daily puzzles, medium to hard, mixed so neighbouring days differ.
const dailySpan = Math.max(1, hardestFound - 12);
const daily = [];
for (let i = 0; i < 60; i += 1) {
  const p = take(12 + ((i * 7) % (dailySpan + 1)));
  if (p !== null) daily.push({ id: `daily-${i + 1}`, ...p });
}

// Check every one with an independent search before writing it out.
for (const p of [...levels, ...daily]) {
  if (!p.layout) throw new Error(`no puzzle for ${p.id}`);
  const n = solveLength(p.layout);
  if (n !== p.minMoves) throw new Error(`${p.id}: expected ${p.minMoves} moves, search found ${n}`);
}
console.log(`levels: ${levels.map((l) => l.minMoves).join(',')}`);
console.log(`daily: ${daily.length} puzzles, ${Math.min(...daily.map((d) => d.minMoves))}-${Math.max(...daily.map((d) => d.minMoves))} moves`);

const row = (p) => `  { id: '${p.id}', layout: '${p.layout}', minMoves: ${p.minMoves} },`;
const out = `/**
 * Rush Hour puzzles - GENERATED by scripts/generate-rush-hour-levels.js; do
 * not edit by hand. Each layout is 36 characters, the 6x6 board row by row:
 * 'o' is empty, 'A' is Navie's car, every other letter one vehicle. Every
 * puzzle was solved by the generator, and \`minMoves\` is its exact minimum
 * (one move = one vehicle sliding any distance).
 */

export interface RushHourPuzzle {
  id: string;
  layout: string;
  minMoves: number;
}

/** The levels, easiest first. */
export const RUSH_HOUR_LEVELS: RushHourPuzzle[] = [
${levels.map(row).join('\n')}
];

/** Today's puzzle comes from here, one a day in turn. */
export const RUSH_HOUR_DAILY: RushHourPuzzle[] = [
${daily.map(row).join('\n')}
];
`;
const target = path.join(__dirname, '..', 'frontend', 'games', 'rushHour', 'levels.ts');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out);
console.log(`wrote ${path.relative(process.cwd(), target)}`);
