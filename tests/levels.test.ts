import { describe, expect, it } from 'vitest';
import type { Board } from '../src/core/board';
import { parseLevel } from '../src/core/level';
import { parseToken } from '../src/core/token';
import { trace } from '../src/core/trace';
import { ALL_LEVELS } from '../src/levels';

/**
 * Known solutions, as "token@x,y" for the final state of each player-controlled
 * piece. M3's solver will replace this with an exhaustive uniqueness check.
 */
const SOLUTIONS: Record<string, string[]> = {
  't-01': ['M6~@3,2'],
  't-02': ['M1*@4,1'],
  't-03': ['M2*@2,1', 'M1*@2,5'],
  't-04': ['M7*@4,5'],
  't-05': ['M1*@4,1', 'M7*@4,3'],
  't-06': ['M1*@3,1', 'M7*@3,5'],
};

/** Apply a solution: clear all player-controlled pieces back to the tray, then set the listed ones. */
function apply(b: Board, moves: string[]): Board {
  const out = b.clone();
  out.cells.forEach((p, i) => {
    if (p?.lock === 'free') out.pickUp(i);
  });
  for (const m of moves) {
    const [tok, at] = m.split('@') as [string, string];
    const [x, y] = at.split(',').map(Number) as [number, number];
    const want = parseToken(tok)!;
    const i = out.idx(x, y);
    if (want.lock === 'free') {
      const slot = out.inv.findIndex((s) => s.proto.kind === want.kind && s.proto.color === want.color && s.count > 0);
      expect(out.place(slot, i, want.rot), m).toBe(true);
    } else {
      const p = out.cells[i]!;
      expect(p.kind).toBe(want.kind);
      expect(out.rotate(i, want.rot - p.rot) || want.rot === p.rot, m).toBe(true);
    }
  }
  return out;
}

describe('bundled levels', () => {
  it('have unique ids', () => {
    const ids = ALL_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const level of ALL_LEVELS) {
    describe(level.id, () => {
      const b = parseLevel(level);

      it('parses and is a real puzzle', () => {
        const t = trace(b);
        expect(t.targets.length).toBeGreaterThan(0);
        expect(t.solved).toBe(false);
      });

      it('is solved by its known solution', () => {
        const moves = SOLUTIONS[level.id];
        expect(moves, 'missing known solution').toBeDefined();
        const solved = apply(b, moves!);
        expect(trace(solved).solved).toBe(true);
        if (level.par !== undefined) expect(moves!.filter((m) => m.includes('*')).length).toBeLessThanOrEqual(level.par);
      });
    });
  }
});
