import { describe, expect, it } from 'vitest';
import { endlessLevel, endlessSeed } from '../src/core/endless';
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
    const grids = new Set<string>();
    for (let n = 1; n <= count; n++) {
      const g = endlessLevel(tier, n);
      expect(g, `${tier} #${n}`).not.toBeNull();
      const r = solve(parseLevel(g!.level), { stopAfter: 2 });
      expect(r.complete && r.count, `${tier} #${n} is unique`).toBe(1);
      const [lo, hi] = TIER_SPECS[tier].band;
      expect(g!.difficulty).toBeGreaterThanOrEqual(lo);
      expect(g!.difficulty).toBeLessThanOrEqual(hi);
      grids.add(g!.level.grid.join('/'));
    }
    expect(grids.size).toBe(count);
  };

  it('makes valid easy levels, each in its difficulty band', () => check('easy', 10));
  it('makes valid medium levels', () => check('medium', 4));
  it('makes valid hard levels', () => check('hard', 2), 60_000);
});
