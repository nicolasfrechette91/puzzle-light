import { type DailyResult, streakAfterSolve, streakOn, type StreakState } from '../core/daily';
import { GENERATOR_VERSION } from '../core/generate';
import type { LevelData } from '../core/level';
import { readJson as read, writeJson as write } from './local-store';

/**
 * Daily puzzle storage: first result per date, the streak, and today's level
 * (cached so it isn't regenerated on every visit). Every access is guarded.
 */
const KEY = 'puzzle-light:daily';
const LEVEL_PREFIX = 'puzzle-light:daily-level:';

interface Stored {
  streak: StreakState;
  results: Record<string, DailyResult>;
}

export interface CachedDaily {
  level: LevelData;
  movesPar: number;
}

/** The player's local calendar date (D-054). */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Time until the next local midnight, e.g. "5h 12m". */
export function untilTomorrow(now = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

export class DailyStore {
  private data: Stored;

  constructor() {
    const d = read<Stored>(KEY);
    this.data = d && typeof d.results === 'object' && d.streak ? d : { streak: { current: 0, best: 0 }, results: {} };
  }

  result(date: string): DailyResult | undefined {
    return this.data.results[date];
  }

  streak(today: string): number {
    return streakOn(this.data.streak, today);
  }

  get best(): number {
    return this.data.streak.best;
  }

  /** Keep the first completion of a date; returns the result that counts. */
  record(r: DailyResult): DailyResult {
    const existing = this.data.results[r.date];
    if (existing) return existing;
    this.data.results[r.date] = r;
    this.data.streak = streakAfterSolve(this.data.streak, r.date);
    write(KEY, this.data);
    return r;
  }

  cachedLevel(date: string): CachedDaily | null {
    return read<CachedDaily>(`${LEVEL_PREFIX}v${GENERATOR_VERSION}:${date}`);
  }

  cacheLevel(date: string, c: CachedDaily): void {
    // Only today's level is worth keeping.
    try {
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i);
        if (k?.startsWith(LEVEL_PREFIX)) window.localStorage.removeItem(k);
      }
    } catch {
      // ignore
    }
    write(`${LEVEL_PREFIX}v${GENERATOR_VERSION}:${date}`, c);
  }
}
