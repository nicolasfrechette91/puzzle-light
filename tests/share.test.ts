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

  // Hand-made links: anything mistyped must not reach the HUD or the editor (D-070).
  const raw = (o: unknown) => '1.' + btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const grid = ['Er0 . . .', '. . . Tr'];

  it('give mistyped ids and names a default', () => {
    for (const id of [5, null, {}, ['a']]) expect(decodeLevel(raw({ id, name: 'x', grid })).id).toBe('shared');
    expect(decodeLevel(raw({ grid })).name).toBe('Untitled');
    expect(decodeLevel(raw({ name: 12, grid })).name).toBe('Untitled');
  });

  it('drop a mistyped note or par', () => {
    const l = decodeLevel(raw({ name: 'x', grid, note: 5, par: 'x' }));
    expect(l.note).toBeUndefined();
    expect(l.par).toBeUndefined();
    expect(decodeLevel(raw({ name: 'x', grid, par: -3 })).par).toBeUndefined();
    expect(decodeLevel(raw({ name: 'x', grid, par: 1.5 })).par).toBeUndefined();
    expect(decodeLevel(raw({ name: 'x', grid, par: 2, note: 'hi' }))).toMatchObject({ par: 2, note: 'hi' });
  });

  it('reject a tray that is not a token → count object', () => {
    for (const inv of ['abc', [1], 3]) expect(() => decodeLevel(raw({ name: 'x', grid, inv }))).toThrow(ShareError);
    expect(decodeLevel(raw({ name: 'x', grid, inv: null })).inv).toBeUndefined();
  });
});
