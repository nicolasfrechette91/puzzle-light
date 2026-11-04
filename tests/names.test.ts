import { describe, expect, it } from 'vitest';
import { dailyName, endlessName, levelName, NAME_COUNT } from '../src/core/names';

describe('level names', () => {
  it('never repeat within the first 4,096 slots of a sequence', () => {
    expect(NAME_COUNT).toBe(4096);
    for (const key of [0, 0x3a1, 0x5c7]) {
      const names = new Set(Array.from({ length: NAME_COUNT }, (_, slot) => levelName(slot, key)));
      expect(names.size).toBe(NAME_COUNT);
    }
  });

  it('are two words, from lists without duplicates', () => {
    const all = Array.from({ length: NAME_COUNT }, (_, slot) => levelName(slot, 0).split(' '));
    expect(all.every((w) => w.length === 2)).toBe(true);
    expect(new Set(all.map((w) => w[0])).size).toBe(64);
    expect(new Set(all.map((w) => w[1])).size).toBe(64);
  });

  it('keep the daily and endless medium apart, and each tier free of repeats', () => {
    const daily = Array.from({ length: 2048 }, (_, k) => dailyName(k + 1));
    const medium = Array.from({ length: 2048 }, (_, k) => endlessName('medium', k + 1));
    expect(new Set([...daily, ...medium]).size).toBe(4096);
    for (const t of ['easy', 'hard'] as const) expect(new Set(Array.from({ length: 4096 }, (_, k) => endlessName(t, k + 1))).size).toBe(4096);
  });
});
