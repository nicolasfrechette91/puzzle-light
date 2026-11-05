import { describe, expect, it } from 'vitest';
import type { DailyResult } from '../src/core/daily';
import { DailyStore } from '../src/game/daily-store';
import { EndlessStore } from '../src/game/endless-store';
import { GENERATOR_VERSION } from '../src/core/generate';
import { Progress } from '../src/game/progress';
import { Settings } from '../src/game/settings';
import { loadMyLevels } from '../src/editor/storage';
import { stubStorage } from './storage-stub';

/** Saved data can be corrupt, hand-edited or from another version: reading it must never break the game (D-071). */

const today = '2026-11-20';
const result = (date: string): DailyResult => ({ date, moves: 7, perfect: 5, timeMs: 61_000, hints: 0, progress: [0, 1, 2] });

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

describe('best moves (D-081)', () => {
  it('saves a hinted solve but marks it, and lets an unhinted solve replace it', () => {
    const data = stubStorage();
    const p = new Progress();
    expect(p.recordMoves('2-4', { moves: 5, hinted: true }, 4)).toBe(true);
    expect(p.movesBest('2-4')).toEqual({ moves: 5, hinted: true });
    expect(p.recordMoves('2-4', { moves: 3, hinted: true }, 4)).toBe(true); // fewer, both hinted
    expect(p.recordMoves('2-4', { moves: 9 }, 4)).toBe(true); // more moves, but no hint
    expect(p.movesBest('2-4')).toEqual({ moves: 9 });
    expect(p.recordMoves('2-4', { moves: 4, hinted: true }, 4)).toBe(false); // a hint never beats an unhinted best
    expect(p.recordMoves('2-4', { moves: 9 }, 4)).toBe(false);
    expect(p.recordMoves('2-4', { moves: 4 }, 4)).toBe(true);
    expect(new Progress().get('2-4')).toEqual({ solved: true, moves: 4, perfect: 4 });
    expect(JSON.parse(data.get('puzzle-light:progress')!).levels['2-4'].movesHinted).toBeUndefined();
  });

  it('keys generated levels apart from the campaign, and adds a perfect count learnt later', () => {
    stubStorage();
    const p = new Progress();
    p.recordMoves('gen2-medium-12345', { moves: 6 }, null);
    p.setPerfect('gen2-medium-12345', 5);
    p.setPerfect('1-1', 1); // nothing saved for it: nothing to add to
    const again = new Progress();
    expect(again.get('gen2-medium-12345')).toEqual({ solved: true, moves: 6, perfect: 5 });
    expect(again.get('1-1')).toBeUndefined();
  });

  it('drops malformed move fields when read', () => {
    stubStorage({
      'puzzle-light:progress': JSON.stringify({
        levels: {
          '1-1': { solved: true, moves: 4, movesHinted: true, perfect: 3 },
          '1-2': { solved: true, moves: 'four', movesHinted: true, perfect: -1 },
          '1-3': { solved: true, moves: 2.5, perfect: '3' },
          '1-4': { solved: true, moves: 6, movesHinted: 'yes' },
          'gen2-easy-7': { solved: true, moves: 3 },
        },
      }),
    });
    const p = new Progress();
    expect(p.get('1-1')).toEqual({ solved: true, moves: 4, movesHinted: true, perfect: 3 });
    expect(p.get('1-2')).toEqual({ solved: true });
    expect(p.get('1-3')).toEqual({ solved: true });
    expect(p.movesBest('1-4')).toEqual({ moves: 6 });
    expect(p.movesBest('gen2-easy-7')).toEqual({ moves: 3 });
    expect(p.recordMoves('1-2', { moves: 8 }, 3)).toBe(true);
  });

  it('reads the move counter setting strictly', () => {
    for (const [raw, on] of [['{"movesAfterSolve":true}', true], ['{"movesAfterSolve":"yes"}', false], ['[1]', false], ['{oops', false]] as const) {
      stubStorage({ 'puzzle-light:settings': raw });
      expect(new Settings().movesAfterSolve, raw).toBe(on);
    }
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

  it('reads results saved before moves were redefined, when perfect was called par', () => {
    const old = { date: today, moves: 9, par: 5, timeMs: 61_000, hints: 0, progress: [0, 1, 2] };
    stubStorage({ 'puzzle-light:daily': JSON.stringify({ streak: { current: 1, best: 1, last: today }, results: { [today]: old } }) });
    expect(new DailyStore().result(today)).toEqual({ date: today, moves: 9, perfect: 5, timeMs: 61_000, hints: 0, progress: [0, 1, 2] });
  });

  it('regenerates today’s level when the cached copy is unreadable', () => {
    const key = `puzzle-light:daily-level:v${GENERATOR_VERSION}:${today}`;
    const good = { level: { id: `daily-${today}`, name: 'Quiet Lantern', grid: ['Er0 . Tr'], inv: {} }, perfect: 3 };
    for (const bad of [
      { ...good, level: { ...good.level, grid: ['Er0 Zz Tr'] } },
      { ...good, level: { ...good.level, grid: 'Er0 . Tr' } },
      { ...good, perfect: 'three' },
      { level: null, perfect: 3 },
      { level: good.level, movesPar: 3 }, // cached before moves were redefined (D-083): made again
      'x',
    ]) {
      stubStorage({ [key]: JSON.stringify(bad) });
      expect(new DailyStore().cachedLevel(today), JSON.stringify(bad)).toBeNull();
    }
    stubStorage({ [key]: JSON.stringify(good) });
    expect(new DailyStore().cachedLevel(today)?.perfect).toBe(3);
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

describe('endless history (D-073)', () => {
  const key = `puzzle-light:endless-history:v${GENERATOR_VERSION}`;

  it('keeps a well-formed history and only ever grows it', () => {
    const data = stubStorage();
    const e = new EndlessStore();
    expect(e.history('easy')).toEqual([]);
    e.setHistory('easy', [5, 6, 7]);
    e.setHistory('easy', [5]); // a shorter one (e.g. from an older tab) is ignored
    expect(new EndlessStore().history('easy')).toEqual([5, 6, 7]);
    expect(JSON.parse(data.get(key)!)).toEqual({ easy: [5, 6, 7] });
  });

  it('drops a malformed history', () => {
    for (const bad of ['{"easy":[1,"x"]}', '{"easy":[-1]}', '{"easy":[4294967296]}', '{"easy":3}', '[1]']) {
      stubStorage({ [key]: bad });
      expect(new EndlessStore().history('easy'), bad).toEqual([]);
    }
  });
});
