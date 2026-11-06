import { circuitSolved, circuitStart, covered, dialsRight, loadProblem, loadSolved, parseCircuit, powered, rotateTile, solveLoad, turnCells, E, N, S, W, type CircuitLevel, type DialLevel, type LoadLevel, type Placement, type Tile } from '../../core/puzzles';
import { button, h, icon } from '../dom';

/**
 * The puzzle screens: rotate-the-pieces circuits (cables, water channels, solar wiring),
 * a three-dial sensor calibration solved by deduction, and packing a van. Each one can be
 * left and tried again, explains itself in one line, and offers a hint.
 */

export interface PuzzleHandle {
  el: HTMLElement;
  /** Development only: finish the puzzle as a player who knew the answer would. */
  solve: () => void;
}

const shell = (kicker: string, title: string, navie: string, hintText: HTMLElement, body: HTMLElement, foot: HTMLElement[]): HTMLElement =>
  h(
    'div',
    { class: 'screen menu board puzzle' },
    h('div', { class: 'board-top' }, h('div', { class: 'kicker', text: kicker }), h('h2', { text: title })),
    h('div', { class: 'scroll' }, h('div', { class: 'navie-row hint' }, h('img', { class: 'navie-img small', attrs: { src: navie, alt: 'Navie' } }), hintText), body),
    h('div', { class: 'board-foot' }, ...foot),
  );

/* ---- Circuits ---- */

const END: Record<number, [number, number]> = { [N]: [50, 0], [E]: [100, 50], [S]: [50, 100], [W]: [0, 50] };

function tileSvg(t: Tile, on: boolean, theme: 'power' | 'water'): string {
  const color = on ? (theme === 'water' ? '#3fa9f5' : '#ffc32d') : '#8b98ad';
  const lines = [N, E, S, W]
    .filter((bit) => (t.mask & bit) !== 0)
    .map((bit) => `<line x1="50" y1="50" x2="${END[bit][0]}" y2="${END[bit][1]}" stroke="${color}" stroke-width="20" stroke-linecap="round"/>`)
    .join('');
  const hub = t.kind === 'source' ? `<circle cx="50" cy="50" r="24" fill="${theme === 'water' ? '#1464e8' : '#14c46b'}"/>` : t.kind === 'sink' ? `<circle cx="50" cy="50" r="22" fill="${on ? '#14c46b' : '#3d4350'}" stroke="#ffffff" stroke-width="6"/>` : t.mask !== 0 ? `<circle cx="50" cy="50" r="11" fill="${color}"/>` : '';
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">${lines}${hub}</svg>`;
}

export function circuitPuzzle(o: { level: CircuitLevel; kicker: string; theme: 'power' | 'water'; navie: string; hint: string; reduce: boolean; onDone: (ok: boolean) => void }): PuzzleHandle {
  let grid = circuitStart(o.level);
  const goal = parseCircuit(o.level.solution);
  let moves = 0;
  let finished = false;
  const board = h('div', { class: 'circuit-grid', attrs: { role: 'group', 'aria-label': o.level.title } });
  board.style.setProperty('--cols', String(grid[0].length));
  const hintText = h('p', { class: 'hint-text', text: o.hint });
  const status = h('div', { class: 'lane-problems', attrs: { role: 'status', 'aria-live': 'polite' } });
  const finish = (ok: boolean): void => {
    if (!finished) {
      finished = true;
      o.onDone(ok);
    }
  };
  const render = (turned: [number, number] | null = null): void => {
    const on = powered(grid);
    const sinks = grid.flat().filter((t) => t.kind === 'sink').length;
    const lit = grid.flatMap((row, y) => row.filter((t, x) => t.kind === 'sink' && on[y][x])).length;
    board.replaceChildren(
      ...grid.flatMap((row, y) =>
        row.map((t, x) => {
          const b = h('button', {
            class: `ctile ${t.kind} ${on[y][x] ? 'on' : ''} ${turned !== null && turned[0] === x && turned[1] === y && !o.reduce ? 'turn' : ''}`,
            html: tileSvg(t, on[y][x], o.theme),
            attrs: { type: 'button', 'aria-label': `${t.kind === 'source' ? 'Start' : t.kind === 'sink' ? 'End' : 'Piece'} ${y + 1}-${x + 1}${on[y][x] ? ', connected' : ''}` },
            onClick: () => {
              if (t.kind !== 'pipe' || finished) {
                return;
              }
              grid = rotateTile(grid, x, y);
              moves += 1;
              render([x, y]);
            },
          });
          return b;
        }),
      ),
    );
    const solved = circuitSolved(grid);
    status.replaceChildren(solved ? h('div', { class: 'verdict good' }, icon('check'), h('span', { text: 'Connected!' })) : h('div', { class: 'verdict worse' }, icon('info'), h('span', { text: `${lit} of ${sinks} connected. Tap a piece to turn it.` })));
    if (solved && !finished) {
      window.setTimeout(() => finish(true), o.reduce ? 200 : 700);
    }
  };
  const hint = (): void => {
    /* Turns one wrong piece the right way round. */
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[y].length; x += 1) {
        if (grid[y][x].kind === 'pipe' && grid[y][x].mask !== goal[y][x].mask) {
          for (let k = 0; k < 3 && grid[y][x].mask !== goal[y][x].mask; k += 1) {
            grid = rotateTile(grid, x, y);
          }
          hintText.textContent = 'There: one piece turned for you.';
          render([x, y]);
          return;
        }
      }
    }
  };
  render();
  const el = shell(o.kicker, o.level.title, o.navie, hintText, board, [
    status,
    h('div', { class: 'title-row' }, button('Not now', () => finish(false), { class: 'secondary', iconName: 'back' }), h('button', { class: 'text-btn', text: 'Hint', attrs: { type: 'button' }, onClick: hint })),
  ]);
  void moves;
  return {
    el,
    solve: () => {
      grid = goal.map((row) => row.map((t) => ({ ...t })));
      render();
    },
  };
}

/* ---- Dials ---- */

export function dialPuzzle(o: { level: DialLevel; kicker: string; names: readonly string[]; navie: string; hint: string; onDone: (ok: boolean) => void }): PuzzleHandle {
  const dials = o.level.target.map(() => 0);
  const history: { guess: number[]; right: number }[] = [];
  let finished = false;
  const hintText = h('p', { class: 'hint-text', text: o.hint });
  const row = h('div', { class: 'dial-row' });
  const log = h('div', { class: 'dial-log', attrs: { 'aria-live': 'polite' } });
  const finish = (ok: boolean): void => {
    if (!finished) {
      finished = true;
      o.onDone(ok);
    }
  };
  const label = (v: number): string => String.fromCharCode(65 + v);
  const render = (): void => {
    row.replaceChildren(
      ...dials.map((v, i) =>
        h(
          'button',
          {
            class: 'dial',
            attrs: { type: 'button', 'aria-label': `${o.names[i]}: ${label(v)}. Tap to change.` },
            onClick: () => {
              if (!finished) {
                dials[i] = (dials[i] + 1) % o.level.options;
                render();
              }
            },
          },
          h('span', { class: 'dial-name', text: o.names[i] }),
          h('span', { class: 'dial-face', text: label(v) }),
        ),
      ),
    );
    log.replaceChildren(
      ...history
        .slice(-5)
        .reverse()
        .map((t) => h('div', { class: 'dial-try' }, h('span', { class: 'dial-guess', text: t.guess.map(label).join(' ') }), h('span', { class: 'dial-dots' }, ...o.level.target.map((_, k) => h('span', { class: `dot ${k < t.right ? 'on' : ''}` }))), h('span', { text: `${t.right} right` }))),
    );
  };
  const test = (): void => {
    if (finished) {
      return;
    }
    const right = dialsRight(o.level, dials);
    history.push({ guess: [...dials], right });
    hintText.textContent = right === dials.length ? 'Calibrated!' : right === 0 ? 'None right. Every dial is wrong, so change them all.' : `${right} right. Change one dial at a time to find which.`;
    render();
    if (right === dials.length) {
      window.setTimeout(() => finish(true), 600);
    }
  };
  render();
  const el = shell(o.kicker, o.level.title, o.navie, hintText, h('div', {}, row, log), [
    button('Test the sensor', test, { class: 'big', iconName: 'check' }),
    h('div', { class: 'title-row' }, button('Not now', () => finish(false), { class: 'secondary', iconName: 'back' })),
  ]);
  return {
    el,
    solve: () => {
      o.level.target.forEach((t, i) => {
        dials[i] = t;
      });
      test();
    },
  };
}

/* ---- Packing the van ---- */

const PIECE_COLOR = ['#4aa24c', '#2ead5b', '#6b7488', '#e2452f', '#c79a5c', '#3fa9f5', '#ff7a1a'];

export function loadPuzzle(o: { level: LoadLevel; navie: string; hint: string; onDone: (ok: boolean) => void }): PuzzleHandle {
  const L = o.level;
  let placed: Placement[] = [];
  let selected: string | null = null;
  let turns = 0;
  let finished = false;
  const hintText = h('p', { class: 'hint-text', text: o.hint });
  const grid = h('div', { class: 'load-grid', attrs: { role: 'group', 'aria-label': 'The cargo bay' } });
  grid.style.setProperty('--cols', String(L.w));
  const tray = h('div', { class: 'load-tray' });
  const status = h('div', { class: 'lane-problems', attrs: { role: 'status', 'aria-live': 'polite' } });
  const meter = h('div', { class: 'lt-row' });
  const go = button('Pack it', () => (loadSolved(L, placed) ? finish(true) : undefined), { class: 'big', iconName: 'check' });
  const finish = (ok: boolean): void => {
    if (!finished) {
      finished = true;
      o.onDone(ok);
    }
  };
  const colorOf = (id: string): string => PIECE_COLOR[L.items.findIndex((i) => i.id === id) % PIECE_COLOR.length];
  const render = (message: string | null = null): void => {
    const owner = new Map<string, string>();
    for (const p of placed) {
      for (const [x, y] of covered(L, p)) {
        owner.set(`${x},${y}`, p.id);
      }
    }
    grid.replaceChildren(
      ...Array.from({ length: L.w * L.h }, (_, k) => {
        const x = k % L.w;
        const y = Math.floor(k / L.w);
        const id = owner.get(`${x},${y}`);
        const item = L.items.find((i) => i.id === id);
        const cell = h('button', {
          class: `lcell ${id !== undefined ? 'full' : ''}`,
          text: item !== undefined && covered(L, placed.find((p) => p.id === id) as Placement)[0].join() === `${x},${y}` ? item.label : '',
          attrs: { type: 'button', 'aria-label': item !== undefined ? `${item.label}. Tap to take it out.` : `Empty space ${y + 1}-${x + 1}` },
          onClick: () => {
            if (finished) {
              return;
            }
            if (id !== undefined) {
              placed = placed.filter((p) => p.id !== id);
              render();
              return;
            }
            if (selected === null) {
              render('Pick something from below first.');
              return;
            }
            const next = [...placed, { id: selected, x, y, turns }];
            const trial = loadProblem(L, next);
            if (trial !== null && (trial.includes('stick out') || trial.includes('same space'))) {
              render(trial);
              return;
            }
            placed = next;
            selected = null;
            turns = 0;
            render();
          },
        });
        if (id !== undefined) {
          cell.style.background = colorOf(id);
        }
        return cell;
      }),
    );
    tray.replaceChildren(
      ...L.items
        .filter((i) => !placed.some((p) => p.id === i.id))
        .map((i) => {
          const shape = turnCells(i.cells, i.id === selected ? turns : 0);
          const w = Math.max(...shape.map((c) => c[0])) + 1;
          const hh = Math.max(...shape.map((c) => c[1])) + 1;
          const mini = h('span', { class: 'lmini' });
          mini.style.setProperty('--cols', String(w));
          mini.style.setProperty('--rows', String(hh));
          for (let k = 0; k < w * hh; k += 1) {
            const on = shape.some(([cx, cy]) => cx === k % w && cy === Math.floor(k / w));
            const c = h('span', { class: `lm ${on ? 'on' : ''}` });
            if (on) {
              c.style.background = colorOf(i.id);
            }
            mini.append(c);
          }
          return h(
            'button',
            {
              class: `lpiece ${selected === i.id ? 'on' : ''} ${i.required === false ? 'extra' : ''}`,
              attrs: { type: 'button', 'aria-pressed': String(selected === i.id) },
              onClick: () => {
                if (selected === i.id) {
                  turns = (turns + 1) % 4;
                } else {
                  selected = i.id;
                  turns = 0;
                }
                render(i.required === false ? i.leaveBecause ?? null : null);
              },
            },
            mini,
            h('span', { class: 'lpiece-name', text: i.label }),
            h('span', { class: 'lpiece-kg', text: `${i.kg} kg` }),
          );
        }),
    );
    const kg = placed.reduce((a, p) => a + (L.items.find((i) => i.id === p.id)?.kg ?? 0), 0);
    meter.replaceChildren(h('span', { text: 'Load' }), h('b', { text: `${kg} of ${L.maxKg} kg` }));
    const problem = loadProblem(L, placed);
    const missing = L.items.filter((i) => i.required !== false && !placed.some((p) => p.id === i.id)).length;
    const text = message ?? problem ?? (missing > 0 ? `${missing} still to pack.` : null);
    status.replaceChildren(text === null ? h('div', { class: 'verdict good' }, icon('check'), h('span', { text: 'Everything fits, safely, in one van.' })) : h('div', { class: `verdict ${problem !== null ? 'bad' : 'worse'}` }, icon(problem !== null ? 'warn' : 'info'), h('span', { text })));
    go.disabled = !loadSolved(L, placed);
  };
  render();
  const el = shell('Loading bay', L.title, o.navie, hintText, h('div', {}, grid, h('h3', { class: 'tray-title', text: 'To pack' }), tray), [
    meter,
    status,
    h('div', { class: 'title-row' }, button('Not now', () => finish(false), { class: 'secondary', iconName: 'back' }), h('button', { class: 'text-btn', text: 'Turn', attrs: { type: 'button' }, onClick: () => { turns = (turns + 1) % 4; render(); } })),
    go,
  ]);
  return {
    el,
    solve: () => {
      placed = solveLoad(L) ?? [];
      render();
      finish(loadSolved(L, placed));
    },
  };
}
