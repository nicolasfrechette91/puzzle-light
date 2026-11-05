import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/core/level';
import { beats, isPerfect, MoveCounter, perfectMoves, solutionMoves, solveForPlay, solveParts, type SolveSummary } from '../src/core/moves';
import { canMove } from '../src/core/piece';
import { HINT_SOLVE, solve, type Solution } from '../src/core/solver';
import { slotKey } from '../src/core/token';
import { Game } from '../src/game/game';
import { ALL_LEVELS } from '../src/levels';
import { board } from './helpers';

const levelIndex = (id: string) => ALL_LEVELS.findIndex((l) => l.id === id);
const gameAt = (id: string) => new Game(ALL_LEVELS, levelIndex(id));
/** Cells of the rotate-only pieces, in board order. */
const turnable = (g: Game) => g.board.cells.flatMap((p, i) => (p?.lock === 'rotate' ? [i] : []));
const fixedCell = (g: Game) => g.board.cells.findIndex((p) => p?.lock === 'fixed');

describe('move counter (D-079)', () => {
  it('counts a run of turns of one piece as one move', () => {
    const c = new MoveCounter();
    expect(c.record('rotate', 4)).toBe(true);
    expect(c.record('rotate', 4)).toBe(false);
    expect(c.record('rotate', 4)).toBe(false);
    expect(c.count).toBe(1);
    c.record('rotate', 9); // another piece: a new move
    c.record('rotate', 4); // back to the first: a new run
    expect(c.count).toBe(3);
  });

  it('counts placing, moving and removing; undo, redo and reset end a run without counting', () => {
    const c = new MoveCounter();
    c.record('place');
    c.record('move');
    c.record('pickUp');
    expect(c.count).toBe(3);
    c.record('rotate', 2);
    let expected = 4;
    for (const k of ['undo', 'redo', 'reset'] as const) {
      expect(c.record(k)).toBe(false);
      expect(c.count).toBe(expected);
      expect(c.record('rotate', 2)).toBe(true); // the run was broken, so turning again is a new move
      expected++;
    }
    expect(c.count).toBe(7);
  });
});

describe('moves in the game', () => {
  it('groups turns like undo does, across hints and taps that change nothing', () => {
    const g = gameAt('1-2'); // two rotate-only mirrors
    const [a, b] = turnable(g) as [number, number];
    g.rotate(a, 1);
    g.rotate(a, 1);
    g.rotate(a, -1);
    expect(g.moves).toBe(1);
    g.rotate(fixedCell(g), 1); // a fixed piece doesn't turn: no move, and the run goes on
    g.hint();
    g.rotate(a, 1);
    expect(g.moves).toBe(1);
    g.rotate(b, 1);
    expect(g.moves).toBe(2);
  });

  it('counts a run that comes full circle once, though undo drops that step', () => {
    const g = gameAt('1-1'); // one mirror with 4 positions (90° bends)
    const [a] = turnable(g) as [number];
    for (let k = 0; k < 4; k++) g.rotate(a, 1);
    expect(g.canUndo).toBe(false);
    g.rotate(a, 1);
    expect(g.moves).toBe(1);
  });

  it('never subtracts for undo or reset, and goes back to 0 only when the level starts again', () => {
    const g = gameAt('1-2');
    const [a, b] = turnable(g) as [number, number];
    g.rotate(a, 1);
    g.rotate(b, 1);
    g.undo();
    g.undo();
    expect(g.moves).toBe(2);
    g.redo();
    expect(g.moves).toBe(2);
    g.rotate(a, 1);
    g.reset();
    expect(g.moves).toBe(3);
    g.undo(); // undoing the reset
    expect(g.moves).toBe(3);
    g.load(g.index); // restarting the level
    expect(g.moves).toBe(0);
  });

  it('counts placing and moving a tray piece', () => {
    const g = gameAt('1-3'); // one tray mirror
    const cell = g.board.cells.findIndex((p, i) => p === null && i > 0);
    g.place(0, cell);
    g.rotate(cell, 1);
    g.rotate(cell, 1);
    const to = g.board.cells.findIndex((p) => p === null);
    g.move(cell, to);
    g.pickUp(to);
    expect(g.moves).toBe(4);
  });
});

/** Play a solution through the game the direct way: place tray pieces, turn each piece once. */
function play(g: Game, sol: Solution): void {
  const turnTo = (cell: number, rot: number) => {
    for (let k = 0; k < 8 && g.board.cells[cell]!.rot !== rot; k++) g.rotate(cell, 1);
  };
  for (const { cell, piece } of sol.placements) {
    if (piece.lock === 'free') {
      const slot = g.board.inv.findIndex((s) => s.count > 0 && slotKey(s.proto) === slotKey(piece));
      expect(g.place(slot, cell)).toBe(true);
    }
    turnTo(cell, piece.rot);
  }
}

describe('perfect (D-080)', () => {
  it('is one move per placement and one per piece that turns, whatever the angle', () => {
    // A tray mirror placed and turned: 2.
    const b = board(['Er0 . . .', '.   . . Tr'], { M: 1 });
    expect(perfectMoves(b, solve(b).solutions)).toBe(2);
    // A rotate-only mirror turned 6 steps is still one move.
    const r = board(['Er0 . M0~ .', '.   . .   .', '.   . Tr  .']);
    expect(solve(r).solutions[0]!.moves).toEqual(['M2~@2,0']);
    expect(perfectMoves(r, solve(r).solutions)).toBe(1);
    expect(perfectMoves(r, [])).toBeNull();
  });

  it('counts movable pieces that start on the board', () => {
    const perfect = (grid: string[], inv?: Record<string, number>) => {
      const b = board(grid, inv);
      return perfectMoves(b, solve(b).solutions);
    };
    // In place, only turned: 1.
    expect(perfect(['Er0 . M0* .', '.   . .   .', '.   . Tr  .'])).toBe(1);
    // Moved, already facing the right way (a move keeps the orientation): 1.
    expect(perfect(['Er0 . . .', '.   . . Tr', 'M2* . . .'])).toBe(1);
    // Parked where no light goes: it may stay, so only the tray mirror counts: 2.
    expect(perfect(['Er0 . . .', 'X*  . . Tr'], { M: 1 })).toBe(2);
    // In the way: clearing it is a move.
    expect(perfect(['Er0 X* . Tr'])).toBe(1);
  });

  it('is the fewest over all solutions, which need not use the fewest pieces', () => {
    const b = parseLevel(ALL_LEVELS[levelIndex('4-5')]!); // par 1
    const sols = solve(b).solutions;
    expect(perfectMoves(b, sols)).toBe(2);
    const cheapest = sols.filter((s) => solutionMoves(b, s) === 2).map((s) => s.pieces);
    expect(cheapest).toContain(1);
    expect(cheapest).toContain(2); // so ◎ perfect and ✦ par stay separate marks
  });

  it('can be reached in exactly that many moves on every bundled level', () => {
    for (const level of ALL_LEVELS) {
      const g = new Game([level], 0);
      const start = parseLevel(level);
      if (start.cells.some((p) => p && canMove(p))) continue; // 1-5 is covered by the movable-piece cases above
      const sols = solve(start, { maxSolutions: 50 }).solutions;
      const best = sols.reduce((a, s) => (solutionMoves(start, s) < solutionMoves(start, a) ? s : a));
      play(g, best);
      expect(g.solved, level.id).toBe(true);
      expect(g.moves, level.id).toBe(perfectMoves(start, sols));
    }
  }, 60_000);
});

describe('perfect beyond the 50 solutions hints keep (D-089)', () => {
  // A 4×4 block of turnable mirrors: 1,664 solutions. The cheapest, one tray
  // mirror dropped in the corner as it comes (1 move), sorts far behind the
  // first 50, which all route through the block and turn two or more mirrors.
  const block = { id: 'block', name: 'Block', bends: 90 as const, inv: { M2: 1 }, grid: ['Er0 M0~ M0~ M0~ M0~ .', '.   M0~ M0~ M0~ M0~ .', '.   M0~ M0~ M0~ M0~ .', '.   M0~ M0~ M0~ M0~ Tr'] };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('is the minimum over every solution, not just the kept ones', () => {
    const b = parseLevel(block);
    const played = solveForPlay(b);
    expect(played.solutions).toHaveLength(50);
    expect(perfectMoves(b, played.solutions)).toBe(2); // what the game used to show
    expect(played).toMatchObject({ perfect: 1, exact: true });
    const g = new Game([block], 0); // no worker: the game solves here
    expect(g.perfect).toBe(1);
    expect(g.perfectEstimate).toBeNull();
  });

  it('is only an estimate when the search stops early: shown as ~, never ◎ or saved', async () => {
    const played = solveForPlay(parseLevel(block), { ...HINT_SOLVE, maxNodes: 3000 });
    expect(played.exact).toBe(false);
    expect(played.perfect).not.toBeNull();
    const g = new Game([block], 0);
    g.solveAsync = () => Promise.resolve(played);
    g.prepareHints();
    await flush();
    expect(g.perfect).toBeNull(); // what bests save and ◎ needs
    expect(g.perfectEstimate).toBe(played.perfect);
    const parts = solveParts({ moves: 1, hints: 0, newBest: false }, g.perfect, g.perfectEstimate);
    expect(parts.map((p) => p.text)).toEqual(['Solved in 1 move', `perfect ~${played.perfect}`]);
    expect(parts[1]!.title).toMatch(/estimate/);
  });
});

describe('bests (D-081)', () => {
  it('replace on fewer moves, and an unhinted solve always beats a hinted one', () => {
    expect(beats({ moves: 9 }, undefined)).toBe(true);
    expect(beats({ moves: 7 }, { moves: 9 })).toBe(true);
    expect(beats({ moves: 9 }, { moves: 9 })).toBe(false);
    expect(beats({ moves: 12 }, { moves: 5, hinted: true })).toBe(true);
    expect(beats({ moves: 3, hinted: true }, { moves: 9 })).toBe(false);
    expect(beats({ moves: 4, hinted: true }, { moves: 5, hinted: true })).toBe(true);
  });

  it('are perfect only without a hint', () => {
    expect(isPerfect({ moves: 6 }, 6)).toBe(true);
    expect(isPerfect({ moves: 6, hinted: true }, 6)).toBe(false);
    expect(isPerfect({ moves: 7 }, 6)).toBe(false);
    expect(isPerfect({ moves: 6 }, null)).toBe(false);
  });
});

describe('solved banner (D-082)', () => {
  const text = (s: Partial<SolveSummary>, perfect: number | null = 6) =>
    solveParts({ moves: 9, hints: 0, newBest: false, ...s }, perfect)
      .map((p) => p.text)
      .join(' · ');

  it('reads "Solved in 9 moves · best 7 · perfect 6"', () => {
    expect(text({ before: { moves: 7 } })).toBe('Solved in 9 moves · best 7 · perfect 6');
    expect(text({})).toBe('Solved in 9 moves · perfect 6');
    expect(text({}, null)).toBe('Solved in 9 moves');
    expect(text({ moves: 1 }, null)).toBe('Solved in 1 move');
  });

  it('highlights a new best and marks a perfect solve', () => {
    expect(solveParts({ moves: 7, hints: 0, newBest: true, before: { moves: 9 } }, 6)).toEqual([
      { text: 'Solved in 7 moves' },
      { text: 'new best', mark: 'best' },
      { text: 'perfect 6' },
    ]);
    expect(solveParts({ moves: 6, hints: 0, newBest: true, before: { moves: 9 } }, 6)).toEqual([
      { text: 'Solved in 6 moves' },
      { text: '◎ perfect', mark: 'perfect' },
    ]);
  });

  it('says when a hint helped, now or in the saved best', () => {
    expect(text({ moves: 6, hints: 1 })).toBe('Solved in 6 moves with a hint · perfect 6');
    expect(text({ hints: 2, before: { moves: 7, hinted: true } })).toBe('Solved in 9 moves with hints · best 7 with a hint · perfect 6');
  });
});
