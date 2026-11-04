import { describe, expect, it } from 'vitest';
import { closerToMiddle, generate, inBand, signature, structureCap, TIER_SPECS, type Tier } from '../src/core/generate';
import { parseLevel } from '../src/core/level';
import { canRotate } from '../src/core/piece';
import { rng, seedFrom } from '../src/core/random';
import { solve } from '../src/core/solver';
import { trace } from '../src/core/trace';

describe('rng', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = rng(42);
    const b = rng(42);
    const c = rng(43);
    const xs = Array.from({ length: 20 }, () => a.int(1000));
    expect(Array.from({ length: 20 }, () => b.int(1000))).toEqual(xs);
    expect(Array.from({ length: 20 }, () => c.int(1000))).not.toEqual(xs);
  });

  it('covers its range evenly enough and shuffles into permutations', () => {
    const r = rng(7);
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) counts[r.int(6)]++;
    for (const n of counts) expect(n).toBeGreaterThan(850);
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('hashes strings to stable seeds', () => {
    expect(seedFrom('2026-11-04')).toBe(seedFrom('2026-11-04'));
    expect(seedFrom('2026-11-04')).not.toBe(seedFrom('2026-11-05'));
    expect(seedFrom('')).toBe(0x811c9dc5);
  });
});

describe('inBand', () => {
  it('matches log2(nodes) + decisions in [lo, hi) exactly', () => {
    expect(inBand(32, 1, [6, 10])).toBe(true); // log2 32 + 1 = 6
    expect(inBand(31, 1, [6, 10])).toBe(false); // just under 6
    expect(inBand(256, 2, [6, 10])).toBe(false); // exactly 10 is outside
    expect(inBand(255, 2, [6, 10])).toBe(true);
  });
});

describe('closerToMiddle', () => {
  it('compares |difficulty − middle| exactly', () => {
    // Band [10, 15): the middle is 12.5. 2^12 → 12 (0.5 away); 2^14 → 14 (1.5 away).
    expect(closerToMiddle([2 ** 12, 0], [2 ** 14, 0], [10, 15])).toBe(true);
    expect(closerToMiddle([2 ** 14, 0], [2 ** 12, 0], [10, 15])).toBe(false);
    // 12 and 13 are both 0.5 away: neither is strictly closer.
    expect(closerToMiddle([2 ** 12, 0], [2 ** 13, 0], [10, 15])).toBe(false);
    expect(closerToMiddle([2 ** 13, 0], [2 ** 12, 0], [10, 15])).toBe(false);
    // Decisions count like doubling the states.
    expect(closerToMiddle([2 ** 10, 2], [2 ** 10, 0], [10, 15])).toBe(true);
  });

  it('keeps every tier’s aim inside its band and centred, so a level in the aim beats any outside it', () => {
    for (const t of ['easy', 'medium', 'hard'] as Tier[]) {
      const { band, aim } = TIER_SPECS[t];
      expect(aim[0]).toBeGreaterThan(band[0]);
      expect(aim[1]).toBeLessThan(band[1]);
      expect(aim[0] - band[0]).toBe(band[1] - aim[1]);
    }
  });
});

/** Every acceptance rule, re-checked independently of the generator. */
function accepted(tier: Tier, seed: number) {
  const g = generate({ seed, tier });
  expect(g, `${tier} seed ${seed}`).not.toBeNull();
  const level = g!.level;
  const b = parseLevel(level);
  expect(trace(b).solved, 'not solved at the start').toBe(false);
  const r = solve(b);
  expect(r.complete).toBe(true);
  expect(r.count, 'unique').toBe(1);
  const s = r.solutions[0]!;
  const tray = b.inv.reduce((n, slot) => n + slot.count, 0);
  expect(s.pieces, 'every tray piece is used').toBe(tray);
  const used = new Set(s.placements.map((p) => p.cell));
  b.cells.forEach((p, i) => {
    if (p && canRotate(p)) expect(used.has(i), `rotatable piece at ${i} matters`).toBe(true);
  });
  expect(inBand(r.nodes, s.decisions, TIER_SPECS[tier].band), 'difficulty in band').toBe(true);
  const structure = b.cells.filter((p) => p?.kind === 'wall' || p?.kind === 'glass').length;
  expect(structure, 'at most a quarter walls and glass').toBeLessThanOrEqual(structureCap(b));
  expect(g!.signature).toBe(signature(b, s));
  return g!;
}

describe('generate', () => {
  it('is deterministic: the same seed gives the same level', () => {
    expect(generate({ seed: 11, tier: 'medium' })).toEqual(generate({ seed: 11, tier: 'medium' }));
    expect(generate({ seed: 11, tier: 'easy' })!.level).not.toEqual(generate({ seed: 12, tier: 'easy' })!.level);
  });

  it('accepts only unique, all-pieces-matter, in-band levels (easy)', () => {
    for (let seed = 1; seed <= 12; seed++) accepted('easy', seed);
  });

  it('… medium', () => {
    for (let seed = 1; seed <= 4; seed++) accepted('medium', seed);
  });

  it('… hard', () => {
    accepted('hard', 1);
  }, 60_000);

  it('keeps easy levels to 90° bends', () => {
    expect(generate({ seed: 3, tier: 'easy' })!.level.bends).toBe(90);
  });

  it('passes over solutions it is told to avoid', () => {
    const first = generate({ seed: 5, tier: 'easy' })!;
    const other = generate({ seed: 5, tier: 'easy', avoid: (sig) => sig === first.signature })!;
    expect(other.signature).not.toBe(first.signature);
  });

  it('describes a level’s layout of light, not its colours or walls', () => {
    const a = parseLevel({ id: 'a', name: 'a', grid: ['Er0 . . .', '. # . Tr'], inv: { M: 1 } });
    const b = parseLevel({ id: 'b', name: 'b', grid: ['Eg0 . . .', '. . . Tg'], inv: { M: 1 } });
    expect(signature(a, solve(a).solutions[0]!)).toBe(signature(b, solve(b).solutions[0]!));
    expect(signature(a, solve(a).solutions[0]!)).toBe('4x2 E0@0,0 T@3,1 M1@2,0');
  });

  it('produces a pinned level for a pinned seed (bump GENERATOR_VERSION when this changes on purpose)', () => {
    const g = generate({ seed: 1, tier: 'easy' })!;
    expect({ name: g.level.name, grid: g.level.grid, inv: g.level.inv }).toMatchSnapshot();
  });
});
