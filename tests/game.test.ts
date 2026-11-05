import { describe, expect, it } from 'vitest';
import type { PlaySolve } from '../src/core/moves';
import { Game } from '../src/game/game';
import { ALL_LEVELS } from '../src/levels';

const solutionsOf = (g: Game) => (g as unknown as { played: PlaySolve | null }).played?.solutions ?? null;
const answer = (solutions: PlaySolve['solutions']): PlaySolve => ({ solutions, perfect: null, exact: true });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('hint solving (D-077)', () => {
  it('ignores the answer to a request it has replaced, even for the same level', async () => {
    const g = new Game([ALL_LEVELS[0]!], 0);
    const calls: { resolve: (p: PlaySolve) => void; reject: (e: Error) => void }[] = [];
    g.solveAsync = () => new Promise((resolve, reject) => calls.push({ resolve, reject }));
    g.prepareHints();
    g.load(0); // the same level again: a new request replaces the first
    expect(calls).toHaveLength(2);
    calls[0]!.reject(new Error('cancelled'));
    await flush();
    // The stale failure must not trigger the main-thread fallback solve.
    expect(solutionsOf(g)).toBeNull();
    calls[1]!.resolve(answer([]));
    await flush();
    expect(solutionsOf(g)).toEqual([]);
  });

  it('still falls back to solving here when the current request fails', async () => {
    const g = new Game([ALL_LEVELS[0]!], 0);
    g.solveAsync = () => Promise.reject(new Error('worker stopped'));
    g.prepareHints();
    await flush();
    expect(solutionsOf(g)!.length).toBeGreaterThan(0);
  });
});
