import { describe, expect, it } from 'vitest';
import type { Board } from '../src/core/board';
import { nextHint } from '../src/core/hint';
import { parseLevel } from '../src/core/level';
import { applySolution, solve } from '../src/core/solver';
import { trace } from '../src/core/trace';
import { SAMPLES } from './fixtures';
import { board } from './helpers';

const lvl = (id: string) => parseLevel(SAMPLES.find((l) => l.id === id)!);
const at = (b: Board, x: number, y: number) => b.idx(x, y);

describe('nextHint', () => {
  it('walks the beam from the emitter onward', () => {
    const start = lvl('t-03');
    const sols = solve(start).solutions;
    const b = start.clone();
    const first = nextHint(start, b, sols);
    expect(first).toMatchObject({ kind: 'place', slot: 0, cell: at(b, 2, 1), piece: { kind: 'mirror', rot: 2 } });
    b.place(0, at(b, 2, 1), 2);
    expect(nextHint(start, b, sols)).toMatchObject({ kind: 'place', cell: at(b, 2, 5), piece: { rot: 1 } });
    b.place(0, at(b, 2, 5), 1);
    expect(trace(b).solved).toBe(true);
    expect(nextHint(start, b, sols)).toBeNull();
  });

  it('asks to turn a piece that is in the right place', () => {
    const start = lvl('t-03');
    const b = start.clone();
    b.place(0, at(b, 2, 1), 0);
    expect(nextHint(start, b, solve(start).solutions)).toEqual({ kind: 'rotate', cell: at(b, 2, 1), rot: 2 });
  });

  it('turns rotate-only pieces', () => {
    const start = lvl('t-01');
    expect(nextHint(start, start.clone(), solve(start).solutions)).toEqual({ kind: 'rotate', cell: start.idx(3, 2), rot: 6 });
  });

  it('borrows a misplaced piece when the tray is empty', () => {
    const start = lvl('t-03');
    const b = start.clone();
    b.place(0, at(b, 1, 1), 2); // wrong cell
    b.place(0, at(b, 2, 1), 2); // right
    expect(nextHint(start, b, solve(start).solutions)).toMatchObject({ kind: 'move', from: at(b, 1, 1), cell: at(b, 2, 5) });
  });

  it('clears a cell that a step needs', () => {
    const start = lvl('t-03');
    const b = start.clone();
    b.place(0, at(b, 2, 1), 2);
    b.cells[at(b, 2, 5)] = { kind: 'hole', rot: 0, color: 0, lock: 'free' }; // something else sits where the mirror goes
    expect(nextHint(start, b, solve(start).solutions)).toEqual({ kind: 'remove', cell: at(b, 2, 5) });
  });

  it('removes an extra piece that spoils an otherwise complete solution', () => {
    const start = board(['Er0 . . .', '.   . . Tr', '.   . . .'], { M: 2 });
    const sols = solve(start).solutions;
    const b = applySolution(start, sols[0]!);
    expect(trace(b).solved).toBe(true);
    b.place(0, at(b, 1, 0), 2); // the spare mirror, upstream, turns the beam south
    expect(trace(b).solved).toBe(false);
    expect(nextHint(start, b, sols)).toEqual({ kind: 'remove', cell: at(b, 1, 0) });
  });

  it('gives nothing without solutions', () => {
    const start = board(['Er0 # Tr']);
    expect(nextHint(start, start.clone(), [])).toBeNull();
  });
});
