import { describe, expect, it } from 'vitest';
import type { Board } from '../src/core/board';
import { parseLevel, type LevelData } from '../src/core/level';
import { parseToken } from '../src/core/token';
import { trace } from '../src/core/trace';
import { ALL_LEVELS, PACKS } from '../src/levels';
import { SAMPLES } from './fixtures';
import { SOLUTIONS } from './solutions';

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
      const slot = out.inv.findIndex(
        (s) => s.proto.kind === want.kind && s.proto.color === want.color && s.proto.link === want.link && s.count > 0,
      );
      expect(out.place(slot, i, want.rot), m).toBe(true);
    } else {
      const p = out.cells[i]!;
      expect(p.kind).toBe(want.kind);
      p.rot = want.rot;
    }
  }
  return out;
}

function structure(level: LevelData) {
  const b = parseLevel(level);
  const t = trace(b);
  expect(level.name.length).toBeGreaterThan(0);
  expect(t.targets.length, 'has targets').toBeGreaterThan(0);
  expect(t.solved, 'not solved at the start').toBe(false);
  if (level.note) expect(level.note.length, 'note fits one line on a phone').toBeLessThanOrEqual(90);
  expect(b.w * b.h, 'board stays small').toBeLessThanOrEqual(10 * 8);
}

describe('worlds', () => {
  it('have 40+ levels with unique ids', () => {
    const ids = ALL_LEVELS.map((l) => l.id);
    expect(ids.length).toBeGreaterThanOrEqual(40);
    expect(new Set([...ids, ...SAMPLES.map((l) => l.id)]).size).toBe(ids.length + SAMPLES.length);
  });

  it('number levels by world', () => {
    PACKS.forEach((p, w) => p.levels.forEach((l, i) => expect(l.id).toBe(`${w + 1}-${i + 1}`)));
  });

  it('keep world 1 to 90° bends (D-001, D-009)', () => {
    for (const l of PACKS[0]!.levels) expect(l.bends, l.id).toBe(90);
  });

  for (const level of ALL_LEVELS) it(`${level.id} is well formed`, () => structure(level));
});

describe('sample fixtures', () => {
  for (const level of SAMPLES) {
    it(`${level.id} is well formed and solved by its designed solution`, () => {
      structure(level);
      expect(trace(apply(parseLevel(level), SOLUTIONS[level.id]!)).solved).toBe(true);
    });
  }
});
