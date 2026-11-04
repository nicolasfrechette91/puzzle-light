import type { Board } from '../src/core/board';
import { parseLevel, type LevelData } from '../src/core/level';

/** Parse a grid literal (rows of tokens) with an optional inventory. */
export function board(grid: string[], inv?: Record<string, number>): Board {
  const data: LevelData = { id: 'test', name: 'test', grid };
  if (inv) data.inv = inv;
  return parseLevel(data);
}

/** Small deterministic PRNG (mulberry32): `rand(n)` returns an integer in [0, n). */
export function rng(seed: number): (n: number) => number {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) % n);
  };
}
