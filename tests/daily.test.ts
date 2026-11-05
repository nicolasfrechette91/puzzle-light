import { describe, expect, it } from 'vitest';
import {
  addDays,
  dailyLevel,
  dailyNumber,
  dailySeed,
  dailySolvedNote,
  dailyStatus,
  dayNumber,
  formatTime,
  shareText,
  streakAfterSolve,
  streakFromDates,
  streakOn,
} from '../src/core/daily';
import { parseLevel } from '../src/core/level';
import { perfectMoves } from '../src/core/moves';
import { solve } from '../src/core/solver';
import { trace } from '../src/core/trace';

describe('dates', () => {
  it('counts calendar days without time zones', () => {
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // across a DST change in many zones
    expect(dailyNumber('2026-11-04')).toBe(1);
    expect(dailyNumber('2026-11-05')).toBe(2);
    expect(() => dayNumber('4/11/2026')).toThrow();
  });
});

describe('daily level', () => {
  it('is the same for everyone on a date and different the next day', () => {
    expect(dailySeed('2026-11-04')).toBe(dailySeed('2026-11-04'));
    expect(dailySeed('2026-11-04')).not.toBe(dailySeed('2026-11-05'));
    const a = dailyLevel('2026-11-04')!;
    expect(dailyLevel('2026-11-04')!.level).toEqual(a.level);
    expect(dailyLevel('2026-11-05')!.level.grid).not.toEqual(a.level.grid);
    expect(a.level.id).toBe('daily-2026-11-04');
  });

  it('generates a proper puzzle for the next two weeks', () => {
    for (let k = 0; k < 14; k++) {
      const date = addDays('2026-11-04', k);
      const g = dailyLevel(date);
      expect(g, date).not.toBeNull();
      const b = parseLevel(g!.level);
      expect(trace(b).solved).toBe(false);
      const r = solve(b);
      expect(r.count, date).toBe(1);
      expect(perfectMoves(b, r.solutions)).toBeGreaterThanOrEqual(r.solutions[0]!.pieces);
    }
  }, 60_000);
});

describe('streaks', () => {
  it('grow on consecutive days and restart after a gap', () => {
    let s = { current: 0, best: 0 };
    s = streakAfterSolve(s, '2026-11-04');
    s = streakAfterSolve(s, '2026-11-05');
    expect(s).toEqual({ last: '2026-11-05', current: 2, best: 2 });
    expect(streakAfterSolve(s, '2026-11-05')).toBe(s); // same day again
    expect(streakOn(s, '2026-11-06')).toBe(2); // still alive until the day is missed
    expect(streakOn(s, '2026-11-07')).toBe(0);
    s = streakAfterSolve(s, '2026-11-08');
    expect(s).toEqual({ last: '2026-11-08', current: 1, best: 2 });
  });
});

describe('daily status (D-090)', () => {
  it('keeps the ticking time out of the words screen readers announce', () => {
    expect(dailyStatus(6, null)).toEqual({ text: 'Perfect is 6 moves. The clock starts with your first move.', clock: null });
    const early = dailyStatus(6, 1_000);
    const later = dailyStatus(6, 83_000);
    expect(early.text).toBe(later.text); // nothing new to announce while the clock runs
    expect(early.text).not.toMatch(/\d:\d\d/);
    expect([early.clock, later.clock]).toEqual(['0:01', '1:23']);
  });

  it('announces the time once, in the solved banner', () => {
    expect(dailySolvedNote({ timeMs: 83_000 }, 3)).toBe('1:23 · 🔥 3');
    expect(dailySolvedNote({ timeMs: 83_000 }, 1)).toBe('1:23');
  });
});

describe('streak from dates (D-091)', () => {
  it('adds up any set of solved days, in any order', () => {
    expect(streakFromDates(['2026-11-07', '2026-11-04', '2026-11-05', '2026-11-05'])).toEqual({ last: '2026-11-07', current: 1, best: 2 });
    expect(streakFromDates([])).toEqual({ current: 0, best: 0 });
  });
});

describe('share text', () => {
  const result = { date: '2026-11-06', moves: 9, perfect: 5, timeMs: 83_000, hints: 0, progress: [0, 0, 1, 1, 0, 1, 1, 1, 2] as (0 | 1 | 2)[] };

  it('shows the journey, not the solution', () => {
    expect(shareText(result, 3, 'https://example.test/')).toBe(
      ['Puzzle Light · Daily #3', '⬛⬛🟨🟨⬛🟨🟨🟨', '🟩', '9 moves (perfect 5) · 1:23 · 🔥3', 'https://example.test/'].join('\n'),
    );
  });

  it('marks a perfect solve, hints, and long games', () => {
    expect(shareText({ ...result, moves: 5 }, 1, 'u')).toContain('5 moves (◎ perfect) · 1:23');
    const t = shareText({ ...result, moves: 5, hints: 2, progress: Array(60).fill(1) as 1[] }, 1, 'u');
    expect(t).toContain('5 moves (perfect 5)'); // a hint keeps the perfect mark away (D-081)
    expect(t).toContain('💡2');
    expect(t).not.toContain('🔥');
    expect(t.split('\n').slice(1, -2).join('')).toContain('…');
  });

  it('formats times', () => {
    expect(formatTime(5_400)).toBe('0:05');
    expect(formatTime(3_725_000)).toBe('1:02:05');
  });
});
