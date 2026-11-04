import { describe, expect, it } from 'vitest';
import { EndlessSeries, endlessLevel, endlessSeed, solutionId } from '../src/core/endless';
import { TIER_SPECS, TIERS, type Tier } from '../src/core/generate';
import { parseLevel } from '../src/core/level';
import { solve } from '../src/core/solver';

describe('endless sequence', () => {
  it('gives every tier and number its own seed', () => {
    const seeds = new Set<number>();
    for (const t of TIERS) for (let n = 1; n <= 50; n++) seeds.add(endlessSeed(t, n));
    expect(seeds.size).toBe(150);
    expect(endlessSeed('easy', 7)).toBe(endlessSeed('easy', 7));
  });

  it('is the same level for everyone and numbered by tier', () => {
    const a = endlessLevel('easy', 3)!;
    expect(endlessLevel('easy', 3)!.level).toEqual(a.level);
    expect(a.level.id).toBe('endless-easy-3');
    expect(endlessLevel('easy', 4)!.level.grid).not.toEqual(a.level.grid);
  });

  const check = (tier: Tier, count: number) => {
    const series = new EndlessSeries(tier);
    const grids = new Set<string>();
    const names = new Set<string>();
    for (let n = 1; n <= count; n++) {
      const g = series.level(n);
      expect(g, `${tier} #${n}`).not.toBeNull();
      const r = solve(parseLevel(g!.level), { stopAfter: 2 });
      expect(r.complete && r.count, `${tier} #${n} is unique`).toBe(1);
      const [lo, hi] = TIER_SPECS[tier].band;
      expect(g!.difficulty).toBeGreaterThanOrEqual(lo);
      expect(g!.difficulty).toBeLessThanOrEqual(hi);
      grids.add(g!.level.grid.join('/'));
      names.add(g!.level.name);
    }
    expect(grids.size).toBe(count);
    expect(names.size, 'no repeated names').toBe(count);
  };

  it('makes valid easy levels, each in its difficulty band', () => check('easy', 10));
  it('makes valid medium levels', () => check('medium', 4));
  it('makes valid hard levels', () => check('hard', 2), 60_000);
});

describe('easy never repeats a solution (D-073)', () => {
  it('keeps the first 150 easy levels’ solutions distinct, at difficulty 6 or more', () => {
    const series = new EndlessSeries('easy');
    const sigs = new Set<string>();
    for (let n = 1; n <= 150; n++) {
      const g = series.level(n)!;
      expect(g.difficulty).toBeGreaterThanOrEqual(6);
      sigs.add(g.signature);
    }
    expect(sigs.size).toBe(150);
    expect(series.history()).toEqual([...sigs].map(solutionId));
  });

  it('gives the same level whether made in order, from scratch, or from a saved history', () => {
    const inOrder = new EndlessSeries('easy');
    for (let n = 1; n < 40; n++) inOrder.level(n);
    const expected = inOrder.level(40)!.level;
    expect(new EndlessSeries('easy').level(40)!.level).toEqual(expected);
    const restored = new EndlessSeries('easy');
    restored.restore(inOrder.history().slice(0, 39));
    expect(restored.level(40)!.level).toEqual(expected);
  });

  it('keeps no history for tiers that may repeat', () => {
    const s = new EndlessSeries('medium');
    s.level(1);
    expect(s.history()).toEqual([]);
  });
});
