import { describe, expect, it } from 'vitest';
import type { DailyResult } from '../src/core/daily';
import { DailyStore } from '../src/game/daily-store';
import { GENERATOR_VERSION } from '../src/core/generate';
import { Progress } from '../src/game/progress';
import { loadMyLevels } from '../src/editor/storage';
import { stubStorage } from './storage-stub';

/** Saved data can be corrupt, hand-edited or from another version: reading it must never break the game (D-071). */

const today = '2026-11-20';
const result = (date: string): DailyResult => ({ date, moves: 7, par: 5, timeMs: 61_000, hints: 0, progress: [0, 1, 2] });

describe('saved progress', () => {
  it('survives a progress record whose levels are missing or not objects', () => {
    for (const raw of ['{"levels":null}', '{"levels":[1,2]}', '{"levels":"x"}', '[]', '7', '{oops']) {
      stubStorage({ 'puzzle-light:progress': raw });
      const p = new Progress();
      expect(p.solved('1-1'), raw).toBe(false);
      p.markSolved('1-1', 2, 0);
      expect(p.solved('1-1'), raw).toBe(true);
    }
  });

  it('drops malformed level entries and fields but keeps good ones', () => {
    stubStorage({
      'puzzle-light:progress': JSON.stringify({
        levels: { '1-1': 'x', '1-2': null, '1-3': { solved: true, best: 2, hints: 1 }, '1-4': { solved: true, best: 'two', hints: -1 }, '1-5': { solved: 'yes' } },
        last: 42,
      }),
    });
    const p = new Progress();
    expect(p.solved('1-3')).toBe(true);
    expect(p.get('1-3')).toEqual({ solved: true, best: 2, hints: 1 });
    expect(p.get('1-4')).toEqual({ solved: true });
    expect(p.solved('1-5')).toBe(false);
    expect(p.last).toBeUndefined();
    p.markSolved('1-1', 3, 0); // used to throw: "Cannot create property 'solved' on string"
    expect(p.get('1-1')).toEqual({ solved: true, best: 3, hints: 0 });
  });
});

describe('daily store', () => {
  it('survives a streak with an unreadable date', () => {
    stubStorage({ 'puzzle-light:daily': JSON.stringify({ streak: { last: 'garbage', current: 4, best: 9 }, results: {} }) });
    const d = new DailyStore();
    expect(d.streak(today)).toBe(0);
    expect(d.best).toBe(9);
    d.record(result(today));
    expect(d.streak(today)).toBe(1);
  });

  it('survives missing or malformed results', () => {
    for (const results of [null, 'x', [1]]) {
      stubStorage({ 'puzzle-light:daily': JSON.stringify({ streak: { current: 0, best: 0 }, results }) });
      const d = new DailyStore();
      expect(d.result(today)).toBeUndefined();
      d.record(result(today));
      expect(d.result(today)?.moves).toBe(7);
    }
  });

  it('keeps only well-formed results and streak numbers', () => {
    stubStorage({
      'puzzle-light:daily': JSON.stringify({
        streak: { last: '2026-11-19', current: 'lots', best: -2 },
        results: { [today]: { moves: 'x' }, '2026-11-19': result('2026-11-19'), 'not-a-date': result('not-a-date') },
      }),
    });
    const d = new DailyStore();
    expect(d.result(today)).toBeUndefined();
    expect(d.result('2026-11-19')?.moves).toBe(7);
    expect(d.result('not-a-date')).toBeUndefined();
    expect(d.streak(today)).toBe(0);
    expect(d.best).toBe(0);
  });

  it('regenerates today’s level when the cached copy is unreadable', () => {
    const key = `puzzle-light:daily-level:v${GENERATOR_VERSION}:${today}`;
    const good = { level: { id: `daily-${today}`, name: 'Quiet Lantern', grid: ['Er0 . Tr'], inv: {} }, movesPar: 3 };
    for (const bad of [
      { ...good, level: { ...good.level, grid: ['Er0 Zz Tr'] } },
      { ...good, level: { ...good.level, grid: 'Er0 . Tr' } },
      { ...good, movesPar: 'three' },
      { level: null, movesPar: 3 },
      'x',
    ]) {
      stubStorage({ [key]: JSON.stringify(bad) });
      expect(new DailyStore().cachedLevel(today), JSON.stringify(bad)).toBeNull();
    }
    stubStorage({ [key]: JSON.stringify(good) });
    expect(new DailyStore().cachedLevel(today)?.movesPar).toBe(3);
  });
});

describe('my levels', () => {
  it('reads saved levels with well-typed fields only', () => {
    stubStorage({
      'puzzle-light:my-levels': JSON.stringify([
        { id: 7, name: 'Mine', note: 3, par: 'x', grid: ['Er0 . Tr'] },
        { id: 'u-1', name: 'Ok', grid: ['Er0 . Tr'], note: 'hi', par: 1 },
        { id: 'u-2', name: 'Bad grid', grid: [1, 2] },
        null,
      ]),
    });
    const mine = loadMyLevels();
    expect(mine.map((l) => l.name)).toEqual(['Mine', 'Ok']);
    expect(typeof mine[0]!.id).toBe('string');
    expect(mine[0]!.note).toBeUndefined();
    expect(mine[0]!.par).toBeUndefined();
    expect(mine[1]).toMatchObject({ id: 'u-1', note: 'hi', par: 1 });
  });
});
