/**
 * Seeded, deterministic randomness for the generator. `src/core` stays pure:
 * nothing here reads `Math.random` or the clock, and every operation is exact
 * 32-bit integer arithmetic, so a seed produces the same stream in every
 * JavaScript engine.
 */
export interface Rng {
  /** Integer in [0, n). */
  int(n: number): number;
  /** True with probability num/den (exact, no floating point). */
  chance(num: number, den: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** A new array with the items in a random order (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** A new 32-bit seed, for deriving independent sub-streams. */
  fork(): number;
}

/** mulberry32: small, fast, good enough for level generation. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const int = (n: number): number => {
    if (n <= 0) throw new Error('rng.int needs n > 0');
    // Rejection sampling keeps the distribution exactly uniform.
    const limit = Math.floor(0x100000000 / n) * n;
    for (;;) {
      const x = next();
      if (x < limit) return x % n;
    }
  };
  return {
    int,
    chance: (num, den) => int(den) < num,
    pick: (items) => {
      if (!items.length) throw new Error('rng.pick on an empty list');
      return items[int(items.length)]!;
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    fork: () => next(),
  };
}

/** A stable 32-bit seed from a string (FNV-1a), e.g. a date or a share code. */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
