import { describe, expect, it } from 'vitest';
import { formatGrid, LevelError, parseLevel, toLevelData } from '../src/core/level';
import { formatToken, parseToken, TokenError } from '../src/core/token';
import { board } from './helpers';

describe('tokens', () => {
  it('parses every field', () => {
    expect(parseToken('.')).toBeNull();
    expect(parseToken('#')).toEqual({ kind: 'wall', rot: 0, color: 0, lock: 'fixed' });
    expect(parseToken('Eg3')).toEqual({ kind: 'emitter', rot: 3, color: 2, lock: 'fixed' });
    expect(parseToken('Ty')).toEqual({ kind: 'target', rot: 0, color: 3, lock: 'fixed' });
    expect(parseToken('M5~')).toEqual({ kind: 'mirror', rot: 5, color: 0, lock: 'rotate' });
    expect(parseToken('M*')).toEqual({ kind: 'mirror', rot: 0, color: 0, lock: 'free' });
  });

  it('parses the optics pieces', () => {
    expect(parseToken('S3~')).toEqual({ kind: 'splitter', rot: 3, color: 0, lock: 'rotate' });
    expect(parseToken('P*')).toEqual({ kind: 'prism', rot: 0, color: 0, lock: 'free' });
    expect(parseToken('Fc')).toEqual({ kind: 'filter', rot: 0, color: 6, lock: 'fixed' });
    expect(parseToken('G')).toEqual({ kind: 'glass', rot: 0, color: 0, lock: 'fixed' });
    expect(parseToken('X*')).toEqual({ kind: 'hole', rot: 0, color: 0, lock: 'free' });
    expect(parseToken('O7')).toEqual({ kind: 'portal', rot: 0, color: 0, lock: 'fixed', link: 7 });
    expect(parseToken('O')).toMatchObject({ link: 0 });
  });

  it('rejects malformed tokens', () => {
    for (const bad of ['', 'Q', 'E0', 'Mr2', 'T', 'Tr3', '#1', 'M8', 'M9', 'M2~*', 'm2', 'Exx', 'P2', 'F', 'Fr1', 'Gr', 'X3', 'Or1']) {
      expect(() => parseToken(bad), bad).toThrow(TokenError);
    }
  });

  it('formats canonically and round-trips', () => {
    for (const tok of ['.', '#', 'Er0', 'Eb7~', 'Tw', 'M0', 'M3~', 'M6*', 'S5~', 'P', 'P*', 'Fm', 'G', 'X*', 'O3', 'O1*']) {
      expect(formatToken(parseToken(tok))).toBe(tok);
    }
    expect(formatToken(parseToken('M'))).toBe('M0');
  });
});

describe('levels', () => {
  const data = {
    id: 'x',
    name: 'X',
    grid: ['Er0 .  M2~', '.   #  Tr'],
    inv: { M: 2, M3: 1 } as Record<string, number>,
  };

  it('rejects duplicated inventory kinds', () => {
    expect(() => parseLevel(data)).toThrow(LevelError);
  });

  it('parses size, cells and inventory', () => {
    const b = parseLevel({ ...data, inv: { M3: 2 } });
    expect([b.w, b.h]).toEqual([3, 2]);
    expect(b.at(2, 0)).toMatchObject({ kind: 'mirror', rot: 2, lock: 'rotate' });
    expect(b.at(1, 1)?.kind).toBe('wall');
    expect(b.inv).toEqual([{ proto: { kind: 'mirror', rot: 3, color: 0, lock: 'free' }, count: 2 }]);
  });

  it('rejects ragged rows and bad tokens with a location', () => {
    expect(() => board(['. .', '.'])).toThrow(/row 1/);
    expect(() => board(['. Zq'])).toThrow(/cell \(1,0\)/);
    expect(() => board(['.'], { M: -1 })).toThrow(/non-negative/);
    expect(() => board(['.'], { M: 1.5 })).toThrow(/non-negative/);
  });

  it('round-trips through toLevelData, including mid-play state', () => {
    const b = board(['Er0 . . .', '.   # . Tg'], { M: 2 });
    b.place(0, b.idx(2, 0));
    b.rotate(b.idx(2, 0), 3);
    const saved = toLevelData(b, { id: 'x', name: 'X' });
    expect(saved.grid).toEqual(['Er0 .   M3* .', '.   #   .   Tg']);
    expect(saved.inv).toEqual({ M: 1 });
    expect(parseLevel(saved).key()).toBe(b.key());
    // Placing the last piece keeps an empty slot so the tray does not reflow.
    b.place(0, b.idx(3, 0));
    const empty = toLevelData(b, { id: 'x', name: 'X' });
    expect(empty.inv).toEqual({ M: 0 });
    expect(parseLevel(empty).key()).toBe(b.key());
  });

  it('gives pre-placed free pieces an empty tray slot', () => {
    const b = board(['M3* . Er0']);
    expect(b.inv).toEqual([{ proto: { kind: 'mirror', rot: 0, color: 0, lock: 'free' }, count: 0 }]);
    expect(b.pickUp(0)).toBe(true);
    expect(b.inv).toHaveLength(1);
    expect(b.inv[0]!.count).toBe(1);
  });

  it('requires portals in pairs across grid and tray', () => {
    expect(() => board(['Er0 O1 Tr'])).toThrow(/pair 1 has 1 portal,/);
    expect(() => board(['O1 O1 O1'])).toThrow(/pair 1 has 3 portals/);
    expect(() => board(['O1 . O2'], { O1: 1 })).toThrow(/pair 2/);
    expect(board(['O1 . O2 O2'], { O1: 1 }).inv[0]).toMatchObject({ proto: { kind: 'portal', link: 1 }, count: 1 });
  });

  it('aligns columns', () => {
    expect(formatGrid(board(['Er0 . M2~']))).toEqual(['Er0 .   M2~']);
  });
});
