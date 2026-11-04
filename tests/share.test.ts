import { describe, expect, it } from 'vitest';
import { decodeLevel, encodeLevel, ShareError } from '../src/core/share';
import { ALL_LEVELS } from '../src/levels';

describe('share codes', () => {
  it('round-trip every bundled level', () => {
    for (const l of ALL_LEVELS) {
      const back = decodeLevel(encodeLevel(l));
      expect(back.name).toBe(l.name);
      expect(back.grid.map((r) => r.split(/\s+/))).toEqual(l.grid.map((r) => r.trim().split(/\s+/)));
      expect(back.inv).toEqual(l.inv);
      expect(back.par).toBe(l.par);
      expect(back.bends).toBe(l.bends);
    }
  });

  it('are URL-safe and reasonably short', () => {
    const code = encodeLevel(ALL_LEVELS[ALL_LEVELS.length - 1]!);
    expect(code).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(700);
  });

  it('keep unicode names', () => {
    const l = { id: 'x', name: 'Lumière ✦ 光', grid: ['Er0 . Tr'] };
    expect(decodeLevel(encodeLevel(l)).name).toBe('Lumière ✦ 光');
  });

  it('reject garbage with a readable reason', () => {
    expect(() => decodeLevel('nope')).toThrow(ShareError);
    expect(() => decodeLevel('2.abc')).toThrow(/format/);
    expect(() => decodeLevel('1.!!!')).toThrow(/damaged/);
    const notLevel = '1.' + btoa(JSON.stringify({ hello: 1 })).replace(/=+$/, '');
    expect(() => decodeLevel(notLevel)).toThrow(/does not contain/);
    const bad = encodeLevel({ id: 'x', name: 'x', grid: ['Er0 O1 Tr'] });
    expect(() => decodeLevel(bad)).toThrow(/invalid: portal pair/);
  });
});
