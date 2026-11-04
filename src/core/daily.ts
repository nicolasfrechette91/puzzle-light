import type { Board } from './board';
import { generate, GENERATOR_VERSION, type Generated, type Tier } from './generate';
import { KINDS } from './piece';
import { seedFrom } from './random';
import type { Solution } from './solver';

/**
 * The daily puzzle: one generated level per calendar date, the same for
 * everyone on that date (D-054). Dates are plain `YYYY-MM-DD` strings so this
 * module stays pure; the browser decides what "today" is.
 */

/** Puzzle #1. */
export const DAILY_EPOCH = '2026-11-04';
export const DAILY_TIER: Tier = 'medium';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `YYYY-MM-DD` date string, as the daily functions expect. */
export const isDate = (s: unknown): s is string => typeof s === 'string' && DATE_RE.test(s);

/** Days since 1970-01-01 for a calendar date (no time zones involved). */
export function dayNumber(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`bad date ${date}`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

export function dateFromDay(day: number): string {
  const d = new Date(day * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const addDays = (date: string, n: number): string => dateFromDay(dayNumber(date) + n);

/** 1 for the first daily puzzle, 2 for the next day, … */
export const dailyNumber = (date: string): number => dayNumber(date) - dayNumber(DAILY_EPOCH) + 1;

export function dailySeed(date: string): number {
  return seedFrom(`puzzle-light/daily/v${GENERATOR_VERSION}/${date}`);
}

/** The puzzle for a date. Deterministic; null only if generation failed (it hasn't in testing). */
export function dailyLevel(date: string): Generated | null {
  const g = generate({ seed: dailySeed(date), tier: DAILY_TIER, maxAttempts: 1500 });
  if (!g) return null;
  g.level.id = `daily-${date}`;
  return g;
}

/**
 * The fewest player actions that solve the level: each tray piece placed
 * (one action) and turned from its tray orientation to its solution
 * orientation, and each rotate-only piece turned, the short way round.
 */
export function movesPar(start: Board, s: Solution): number {
  let moves = 0;
  for (const { cell, piece } of s.placements) {
    const from = piece.lock === 'free' ? (start.inv.find((sl) => sl.proto.kind === piece.kind && sl.proto.color === piece.color && sl.proto.link === piece.link)?.proto.rot ?? 0) : (start.cells[cell]?.rot ?? 0);
    if (piece.lock === 'free') moves++;
    const steps = KINDS[piece.kind].rotSteps;
    if (steps > 1) {
      const stride = start.stride(piece);
      const positions = steps / stride;
      const d = ((((piece.rot - from) / stride) % positions) + positions) % positions;
      moves += Math.min(d, positions - d);
    }
  }
  return moves;
}

export interface StreakState {
  /** Last date a daily was solved. */
  last?: string;
  current: number;
  best: number;
}

/** The streak after solving `date` (solving the same day twice changes nothing). */
export function streakAfterSolve(s: StreakState, date: string): StreakState {
  if (s.last === date) return s;
  const current = s.last && addDays(s.last, 1) === date ? s.current + 1 : 1;
  return { last: date, current, best: Math.max(s.best, current) };
}

/** The streak as it stands on `today` (it lapses after a missed day). */
export function streakOn(s: StreakState, today: string): number {
  if (!s.last) return 0;
  return s.last === today || addDays(s.last, 1) === today ? s.current : 0;
}

export interface DailyResult {
  date: string;
  moves: number;
  par: number;
  timeMs: number;
  hints: number;
  /** After each move: 0 = no target lit, 1 = some, 2 = all. */
  progress: (0 | 1 | 2)[];
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const SQUARE = ['⬛', '🟨', '🟩'] as const;
const ROW = 8;
const MAX_SQUARES = 40;

/**
 * Spoiler-free share text. One square per move, showing how many targets were
 * lit after it (none / some / all); nothing about where any piece went.
 */
export function shareText(r: DailyResult, streak: number, url: string): string {
  const squares = r.progress.map((p) => SQUARE[p]);
  const shown = squares.length > MAX_SQUARES ? [...squares.slice(0, MAX_SQUARES - 1), '…'] : squares;
  const rows: string[] = [];
  for (let i = 0; i < shown.length; i += ROW) rows.push(shown.slice(i, i + ROW).join(''));
  const verdict = r.moves <= r.par ? '✦ par' : `par ${r.par}`;
  const extras = [`${r.moves} moves (${verdict})`, formatTime(r.timeMs)];
  if (r.hints) extras.push(`💡${r.hints}`);
  if (streak > 1) extras.push(`🔥${streak}`);
  return [`Puzzle Light · Daily #${dailyNumber(r.date)}`, ...rows, extras.join(' · '), url].join('\n');
}
