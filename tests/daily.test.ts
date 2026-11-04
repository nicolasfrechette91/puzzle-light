import { describe, expect, it } from 'vitest';
import {
  addDays,
  dailyLevel,
  dailyNumber,
  dailySeed,
  dayNumber,
  formatTime,
  movesPar,
  shareText,
  streakAfterSolve,
  streakOn,
} from '../src/core/daily';
import { parseLevel } from '../src/core/level';
import { solve } from '../src/core/solver';
import { trace } from '../src/core/trace';
import { board } from './helpers';

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
      expect(movesPar(b, r.solutions[0]!)).toBeGreaterThanOrEqual(r.solutions[0]!.pieces);
    }
  }, 60_000);
});

describe('movesPar', () => {
  it('counts placements plus the shortest turns', () => {
    // One tray mirror placed and turned 45° (one tap): 2 actions.
    const b = board(['Er0 . . .', '.   . . Tr'], { M: 1 });
    expect(movesPar(b, solve(b).solutions[0]!)).toBe(2);
    // A rotate-only mirror needing a turn of 6 steps goes the short way: 2 taps back.
    const r = board(['Er0 . M0~ .', '.   . .   .', '.   . Tr  .']);
    const sol = solve(r).solutions[0]!;
    expect(sol.moves).toEqual(['M2~@2,0']);
    expect(movesPar(r, sol)).toBe(2);
  });

  it('uses 90° steps on bends-90 boards', () => {
    const b = parseLevel({ id: 'x', name: 'x', grid: ['Er0 . M0~', '.   . .', '.   . Tr'], bends: 90 });
    expect(movesPar(b, solve(b).solutions[0]!)).toBe(1); // — to \\ is one 90° tap
  });
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

describe('share text', () => {
  const result = { date: '2026-11-06', moves: 9, par: 5, timeMs: 83_000, hints: 0, progress: [0, 0, 1, 1, 0, 1, 1, 1, 2] as (0 | 1 | 2)[] };

  it('shows the journey, not the solution', () => {
    expect(shareText(result, 3, 'https://example.test/')).toBe(
      ['Puzzle Light · Daily #3', '⬛⬛🟨🟨⬛🟨🟨🟨', '🟩', '9 moves (par 5) · 1:23 · 🔥3', 'https://example.test/'].join('\n'),
    );
  });

  it('marks par, hints, and long games', () => {
    const t = shareText({ ...result, moves: 5, hints: 2, progress: Array(60).fill(1) as 1[] }, 1, 'u');
    expect(t).toContain('5 moves (✦ par)');
    expect(t).toContain('💡2');
    expect(t).not.toContain('🔥');
    expect(t.split('\n').slice(1, -2).join('')).toContain('…');
  });

  it('formats times', () => {
    expect(formatTime(5_400)).toBe('0:05');
    expect(formatTime(3_725_000)).toBe('1:02:05');
  });
});
