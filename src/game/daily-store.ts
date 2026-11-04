import { type DailyResult, isDate, streakAfterSolve, streakOn, type StreakState } from '../core/daily';
import { GENERATOR_VERSION } from '../core/generate';
import { checkLevelData, parseLevel, type LevelData } from '../core/level';
import { isCount, isRecord, readJson as read, removeKeys, writeJson as write } from './local-store';

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

const isResult = (r: unknown, date: string): r is DailyResult =>
  isRecord(r) &&
  r.date === date &&
  isCount(r.moves) &&
  isCount(r.par) &&
  isCount(r.hints) &&
  typeof r.timeMs === 'number' &&
  r.timeMs >= 0 &&
  Array.isArray(r.progress) &&
  r.progress.every((p) => p === 0 || p === 1 || p === 2);

/** Stored daily data with anything malformed dropped, so date maths never sees a bad date (D-071). */
function clean(raw: unknown): Stored {
  const d = isRecord(raw) ? raw : {};
  const s = isRecord(d.streak) ? d.streak : {};
  const streak: StreakState = { current: isCount(s.current) ? s.current : 0, best: isCount(s.best) ? s.best : 0 };
  if (isDate(s.last)) streak.last = s.last;
  const results: Record<string, DailyResult> = {};
  if (isRecord(d.results)) for (const [date, r] of Object.entries(d.results)) if (isDate(date) && isResult(r, date)) results[date] = r;
  return { streak, results };
}

export class DailyStore {
  private data: Stored = clean(read(KEY));

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

  /** Today's level as cached, or null (generate it again) if there is none or it doesn't load. */
  cachedLevel(date: string): CachedDaily | null {
    const c = read<unknown>(`${LEVEL_PREFIX}v${GENERATOR_VERSION}:${date}`);
    if (!isRecord(c) || !isCount(c.movesPar)) return null;
    try {
      const level = checkLevelData(c.level, { id: `daily-${date}`, name: 'Daily' });
      parseLevel(level);
      return { level, movesPar: c.movesPar };
    } catch {
      return null;
    }
  }

  cacheLevel(date: string, c: CachedDaily): void {
    removeKeys(LEVEL_PREFIX); // only today's level is worth keeping
    write(`${LEVEL_PREFIX}v${GENERATOR_VERSION}:${date}`, c);
  }
}
