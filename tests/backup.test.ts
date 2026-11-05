import { describe, expect, it } from 'vitest';
import type { DailyResult } from '../src/core/daily';
import { BACKUP_KIND, BACKUP_MAX_BYTES, describeRestore, makeBackup, readBackup, restoreBackup, type Stores } from '../src/game/backup';
import { DailyStore } from '../src/game/daily-store';
import { EndlessStore } from '../src/game/endless-store';
import { Progress } from '../src/game/progress';
import { stubStorage } from './storage-stub';

/** Progress backup: export, then import onto this or another device (D-091). */

const result = (date: string, moves = 7): DailyResult => ({ date, moves, perfect: 5, timeMs: 61_000, hints: 0, progress: [0, 1, 2] });
const stores = (): Stores => ({ progress: new Progress(), daily: new DailyStore(), endless: new EndlessStore() });
const snapshots = (s: Stores) => ({ progress: s.progress.snapshot(), daily: s.daily.snapshot(), endless: s.endless.snapshot() });
/** A backup file as another device would have written it. */
const file = (sections: Record<string, unknown>) => JSON.stringify({ kind: BACKUP_KIND, version: 1, exported: '2026-11-05T10:00:00.000Z', ...sections });
const restore = (s: Stores, text: string) => {
  const read = readBackup(text);
  if (!read.ok) throw new Error(read.reason);
  return restoreBackup(s, read.sections);
};

describe('progress backup', () => {
  it('moves everything to a fresh device', () => {
    stubStorage();
    const a = stores();
    a.progress.markSolved('1-1', 1, 0);
    a.progress.recordMoves('1-1', { moves: 3 }, 2);
    a.progress.markSolved('1-2', 0, 1);
    a.progress.recordMoves('gen2-medium-5', { moves: 6, hinted: true }, 5);
    a.progress.setLast('1-2');
    a.daily.record(result('2026-11-04'));
    a.daily.record(result('2026-11-05'));
    a.endless.finish('easy', 1, true);
    a.endless.finish('easy', 2, true);
    a.endless.finish('hard', 1, false);
    const text = JSON.stringify(makeBackup(a, new Date('2026-11-05T10:00:00Z')));

    stubStorage(); // another device
    const b = stores();
    expect(restore(b, text)).toEqual({ levels: 3, dailies: 2, tiers: 2 });
    expect(snapshots(b)).toEqual(snapshots(a));
    expect(snapshots(stores())).toEqual(snapshots(a)); // and it was saved, not just held in memory
    expect(b.daily.streak('2026-11-05')).toBe(2);
  });

  it('merges without losing or worsening anything on this device', () => {
    stubStorage();
    const s = stores();
    s.progress.markSolved('1-1', 2, 1);
    s.progress.recordMoves('1-1', { moves: 5, hinted: true }, 4);
    s.progress.markSolved('1-2', 1, 0);
    s.progress.recordMoves('1-2', { moves: 3 }, 3);
    s.daily.record(result('2026-11-04', 9));
    for (let n = 1; n <= 3; n++) s.endless.finish('easy', n, true);

    const r = restore(
      s,
      file({
        progress: {
          levels: {
            '1-1': { solved: true, best: 1, hints: 0, moves: 7, perfect: 4 }, // more moves, but no hint: replaces
            '1-2': { solved: true, best: 2, moves: 4, perfect: 3 }, // worse: ignored
            '1-3': { solved: true, moves: 2, perfect: 2 },
          },
        },
        daily: { streak: { last: '2026-11-05', current: 1, best: 1 }, results: { '2026-11-04': result('2026-11-04', 5), '2026-11-05': result('2026-11-05') } },
        endless: { tier: 'medium', tiers: { easy: { next: 3, solved: 2 }, medium: { next: 5, solved: 4 } } },
      }),
    );

    expect(r).toEqual({ levels: 2, dailies: 1, tiers: 1 });
    expect(describeRestore(r)).toBe('Imported 2 levels, 1 daily result, endless progress.');
    expect(s.progress.get('1-1')).toEqual({ solved: true, best: 1, hints: 0, moves: 7, perfect: 4 });
    expect(s.progress.get('1-2')).toMatchObject({ best: 1, moves: 3 });
    expect(s.progress.movesBest('1-3')).toEqual({ moves: 2 });
    expect(s.daily.result('2026-11-04')?.moves).toBe(9); // this device's first completion stands
    expect(s.daily.result('2026-11-05')).toBeDefined();
    expect(s.daily.streak('2026-11-05')).toBe(2); // the two devices' days join up
    expect(s.endless.next('easy')).toBe(4);
    expect([s.endless.next('medium'), s.endless.solved('medium')]).toEqual([5, 4]);
    expect(s.endless.tier).toBe('easy'); // where this device was playing
  });

  it('changes nothing when the same backup is imported twice', () => {
    stubStorage();
    const s = stores();
    s.progress.markSolved('1-1', 1, 0);
    s.daily.record(result('2026-11-04'));
    const text = JSON.stringify(makeBackup(s));
    expect(restore(s, text)).toEqual({ levels: 0, dailies: 0, tiers: 0 });
    expect(describeRestore({ levels: 0, dailies: 0, tiers: 0 })).toMatch(/^Nothing new/);
  });

  it('cleans what it imports field by field, like any saved data', () => {
    stubStorage();
    const s = stores();
    s.progress.markSolved('2-1', 1, 0);
    s.progress.setLast('2-1');
    const r = restore(
      s,
      file({
        progress: {
          levels: { '1-1': 'x', '1-2': { solved: true, moves: 'many', perfect: -1, best: 1.5 }, '1-3': { solved: 'yes' }, '1-4': { solved: true, moves: 4, movesHinted: 'yes' } },
          last: 'daily-2026-11-05',
        },
        daily: { streak: { last: 'soon', current: -3, best: 'lots' }, results: { 'not-a-date': result('2026-11-04'), '2026-11-06': { moves: 3 } } },
        endless: { tier: 'impossible', tiers: { easy: { next: -4, solved: 'x' }, hard: 'x' } },
      }),
    );
    expect(r).toEqual({ levels: 2, dailies: 0, tiers: 0 });
    expect(s.progress.get('1-2')).toEqual({ solved: true });
    expect(s.progress.get('1-3')).toBeUndefined();
    expect(s.progress.movesBest('1-4')).toEqual({ moves: 4 });
    expect(s.progress.last).toBe('2-1');
    expect(s.daily.snapshot()).toEqual({ streak: { current: 0, best: 0 }, results: {} });
    expect(s.endless.snapshot().tier).toBe('easy');
  });

  it('refuses files that are not backups, and touches nothing', () => {
    const data = stubStorage({ 'puzzle-light:progress': '{"levels":{"1-1":{"solved":true}}}' });
    const before = new Map(data);
    for (const [text, reason] of [
      ['{oops', /isn’t JSON/],
      ['[1, 2]', /isn’t a Puzzle Light progress backup/],
      [JSON.stringify({ kind: 'puzzle-light/levels', version: 1 }), /isn’t a Puzzle Light progress backup/],
      [JSON.stringify({ kind: BACKUP_KIND }), /damaged/],
      [JSON.stringify({ kind: BACKUP_KIND, version: 2 }), /newer Puzzle Light/],
      [' '.repeat(BACKUP_MAX_BYTES + 1), /too large/],
    ] as const) {
      const read = readBackup(text);
      expect(read.ok, text.slice(0, 40)).toBe(false);
      if (!read.ok) expect(read.reason).toMatch(reason);
    }
    expect(data).toEqual(before);
  });
});
