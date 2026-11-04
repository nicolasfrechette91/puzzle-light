import { describe, expect, it } from 'vitest';
import type { Board } from '../src/core/board';
import { parseLevel, type LevelData } from '../src/core/level';
import { canMove, canRotate } from '../src/core/piece';
import { isActive, solve } from '../src/core/solver';
import { formatToken } from '../src/core/token';
import { arrivals, trace } from '../src/core/trace';
import { SAMPLES } from './fixtures';
import { board, rng } from './helpers';
import { SOLUTIONS } from './solutions';

const level = (grid: string[], inv?: Record<string, number>, extra: Partial<LevelData> = {}): Board =>
  parseLevel({ id: 't', name: 't', grid, ...(inv ? { inv } : {}), ...extra });

/** Every solution signature, by plain enumeration of all placements and orientations. */
function bruteForce(b0: Board): Set<string> {
  const b = b0.clone();
  b.cells.forEach((p, i) => {
    if (p && canMove(p)) b.pickUp(i);
  });
  const rotCells = b.cells.flatMap((p, i) => (p && canRotate(p) ? [i] : []));
  const pieces: number[] = [];
  b.inv.forEach((s, slot) => {
    for (let k = 0; k < s.count; k++) pieces.push(slot);
  });
  const sigs = new Set<string>();

  const leaf = () => {
    const t = trace(b);
    if (!t.solved) return;
    const moves: string[] = [];
    b.cells.forEach((p, i) => {
      if (!p || !(p.lock === 'free' || canRotate(p))) return;
      const active = p.kind === 'portal' ? t.lit[i] !== 0 : isActive(p, arrivals(b, t, i));
      if (active) moves.push(`${formatToken(p)}@${i % b.w},${(i / b.w) | 0}`);
    });
    sigs.add(moves.join(' '));
  };
  const rotate = (k: number) => {
    if (k === rotCells.length) return leaf();
    const p = b.cells[rotCells[k]!]!;
    const start = p.rot;
    for (const r of b.rotations(p)) {
      p.rot = r;
      rotate(k + 1);
    }
    p.rot = start;
  };
  const place = (k: number, minCell: number) => {
    if (k === pieces.length) return rotate(0);
    const slot = pieces[k]!;
    const same = pieces[k + 1] === slot;
    place(k + 1, same ? Infinity : 0); // leave this piece (and its identical siblings) unused
    for (let c = minCell; c < b.size; c++) {
      if (!b.isEmpty(c)) continue;
      for (const r of b.rotations(b.inv[slot]!.proto)) {
        b.place(slot, c, r);
        place(k + 1, same ? c + 1 : 0);
        b.pickUp(c);
      }
    }
  };
  place(0, 0);
  return sigs;
}

const signatures = (b: Board) => new Set(solve(b, { maxSolutions: Infinity }).solutions.map((s) => s.moves.join(' ')));

describe('solve', () => {
  it('finds a rotation-only solution', () => {
    const r = solve(board(['Er0 . M4~', '.   . .', '.   . Tr']));
    expect(r).toMatchObject({ complete: true, count: 1, minPieces: 0 });
    expect(r.solutions[0]!.moves).toEqual(['M2~@2,0']);
    expect(r.solutions[0]!.decisions).toBe(1);
  });

  it('proves a level unsolvable', () => {
    const r = solve(board(['Er0 # .', '.   . Tr'], { M: 1 }));
    expect(r).toMatchObject({ complete: true, count: 0, minPieces: Infinity, difficulty: Infinity });
  });

  it('counts genuinely different solutions, best first', () => {
    // One 45° mirror at (2,0), or two mirrors via (1,1) or via (0,1).
    const r = solve(board(['Er0 . . .', '.   . . .', 'Tr  # # #'], { M: 2 }));
    expect(r.complete).toBe(true);
    expect(r.solutions.map((s) => s.moves)).toEqual([
      ['M3*@2,0'],
      ['M2*@1,0', 'M5*@1,1'],
      ['M3*@1,0', 'M5*@0,1'],
    ]);
    expect(r.minPieces).toBe(1);
  });

  it('does not count idle extra pieces as new solutions', () => {
    const r = solve(board(['Er0 . . .', '.   . . Tr'], { M: 3 }));
    expect(r.minPieces).toBe(1);
    expect(r.solutions[0]!.moves).toEqual(['M1*@2,0']);
    expect(r.solutions.every((s) => s.pieces >= 1)).toBe(true);
  });

  it('moves pieces that start on the board', () => {
    const r = solve(board(['Er0 M4* . .', '.   .   . Tr']));
    expect(r.solutions[0]!.moves).toEqual(['M1*@2,0']);
  });

  it('places a portal twin on a cell no light reaches yet', () => {
    // Light dies in the lone fixed portal; the only useful exit is the dark cell (3,2).
    const r = solve(level(['Er0 O1 # . .', '.   .  # . .', '.   .  # . Tr'], { O1: 1 }));
    expect(r).toMatchObject({ complete: true, count: 1 });
    expect(r.solutions[0]!.moves).toEqual(['O1*@3,2']);
    // …and an exit that can never work is reported as unsolvable.
    expect(solve(level(['Er0 O1 # .', '.   .  # .', '.   .  # Tr'], { O1: 1 }))).toMatchObject({ complete: true, count: 0 });
  });

  it('respects bends: 90', () => {
    const grid = ['Er0 . . .', '.   . . #', '.   . . Tr'];
    // With 45° bends one diagonal mirror does it…
    expect(solve(level(grid, { M: 1 })).solutions.map((s) => s.moves)).toEqual([['M1*@1,0']]);
    // …with 90° bends it can't, and two mirrors are needed.
    expect(solve(level(grid, { M: 1 }, { bends: 90 }))).toMatchObject({ complete: true, count: 0 });
    expect(solve(level(grid, { M: 2 }, { bends: 90 })).solutions.map((s) => s.moves)).toEqual([
      ['M2*@1,0', 'M2*@1,2'],
      ['M2*@2,0', 'M2*@2,2'],
    ]);
  });

  it('decides prism flips and rotatable emitters', () => {
    const prism = solve(board(['.   .  Tb', 'Ew0 P~ Tg', '.   .  Tr']));
    expect(prism.solutions[0]!.moves).toEqual(['P1~@1,1']);
    const emitter = solve(board(['Er0~ . Tr', '.    . .']));
    expect(emitter.count).toBe(1);
    expect(emitter.solutions[0]!.moves).toEqual(['Er0~@0,0']);
    expect(emitter.solutions[0]!.decisions).toBe(0);
  });

  it('honours its budgets', () => {
    const big = board(['Er0 . . . . .', '. . . . . .', '. . . . . .', '. . . . . Tr'], { M: 3 });
    expect(solve(big, { maxNodes: 10 })).toMatchObject({ complete: false, stopped: 'nodes' });
    let clock = 0;
    expect(solve(big, { deadline: 5, now: () => clock++ })).toMatchObject({ complete: false, stopped: 'time' });
    expect(solve(big, { stopAfter: 1 })).toMatchObject({ complete: false, stopped: 'enough', count: 1 });
  });

  it('is deterministic and leaves the input alone', () => {
    const b = board(['Er0 M4* . .', '.   .   . Tr'], { S: 1 });
    const key = b.key();
    const a = solve(b);
    expect(solve(b)).toEqual(a);
    expect(b.key()).toBe(key);
  });
});

describe('solve agrees with brute force', () => {
  // Random tiny levels: the solver's solution set must equal plain enumeration's.
  const rand = rng(2024);
  const pick = <T,>(xs: readonly T[]): T => xs[rand(xs.length)]!;

  /**
   * A random 4×4 level. Most are solvable by construction: free pieces are
   * scattered first, the board is traced, and targets go where light lands,
   * wanting whatever colour arrives there. The solver then has to rediscover
   * that arrangement (and any others) from the tray.
   */
  const randomLevel = (): Board | null => {
    const w = 4;
    const h = 4;
    const bends90 = rand(4) === 0;
    const dir = () => (bends90 ? 2 * rand(4) : rand(8));
    const cells: string[] = Array.from({ length: w * h }, () => (rand(7) === 0 ? '#' : '.'));
    const empty = () => {
      const open = cells.flatMap((c, i) => (c === '.' ? [i] : []));
      return open.length ? open[rand(open.length)]! : -1;
    };
    const put = (tok: string) => {
      const i = empty();
      if (i >= 0) cells[i] = tok;
      return i;
    };
    for (let n = 1 + rand(2); n > 0; n--) put(`E${pick(['r', 'g', 'b', 'w'])}${dir()}`);
    if (rand(3) === 0) put(pick(['M', 'S', ...(bends90 ? [] : ['P'])]) + (bends90 ? 2 * rand(4) : rand(2)) + '~');
    if (rand(4) === 0) put(pick(['G', 'Fr', 'X', 'M2']));
    if (rand(5) === 0) {
      put('O1');
      put('O1*');
    }
    const kinds = ['M', 'S', 'Fr', 'Fy', 'X', ...(bends90 ? [] : ['P'])];
    for (let n = rand(3); n > 0; n--) {
      const k = pick(kinds);
      const rot = k === 'M' || k === 'S' ? String(bends90 ? 2 * rand(4) : rand(8)) : k === 'P' ? String(rand(2)) : '';
      put(`${k}${rot}*`);
    }
    const grid = () => Array.from({ length: h }, (_, y) => cells.slice(y * w, y * w + w).join(' '));
    const extra = bends90 ? { bends: 90 as const } : {};
    let b = level(grid(), undefined, extra);
    if (rand(5) > 0) {
      // Solvable by construction: targets where light currently lands.
      const lit = trace(b).lit;
      const spots = cells.flatMap((c, i) => (c === '.' && lit[i] ? [i] : []));
      if (!spots.length) return null;
      for (let n = 1 + rand(2); n > 0 && spots.length; n--) cells[spots.splice(rand(spots.length), 1)[0]!] = 'Tw';
      b = level(grid(), undefined, extra);
      const t = trace(b);
      for (const tg of t.targets) {
        if (!tg.got) return null; // an earlier target swallowed its light
        cells[tg.cell] = `T${'.rgybmcw'[tg.got]}`;
      }
    } else {
      for (let n = 1 + rand(2); n > 0; n--) put(`T${pick(['r', 'g', 'b', 'y', 'w'])}`);
    }
    return level(grid(), undefined, extra);
  };

  it('on 150 random levels', () => {
    let solvable = 0;
    for (let n = 0; n < 150; ) {
      const b = randomLevel();
      if (!b) continue;
      n++;
      const expected = bruteForce(b);
      if (expected.size) solvable++;
      expect(signatures(b), b.key()).toEqual(expected);
    }
    expect(solvable).toBeGreaterThan(80);
  });
});

describe('sample levels', () => {
  for (const lv of SAMPLES) {
    const expected = SOLUTIONS[lv.id];
    if (!expected) continue;
    it(`${lv.id} has exactly the designed solution`, () => {
      const r = solve(parseLevel(lv));
      expect(r.complete).toBe(true);
      expect(r.solutions.map((s) => s.moves)).toEqual([expected]);
      if (lv.par !== undefined) expect(r.minPieces).toBe(lv.par);
    });
  }
});
