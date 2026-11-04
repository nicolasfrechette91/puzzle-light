import type { LevelData } from '../core/level';
import { isCount, isRecord, readJson, writeJson } from './local-store';

/** Levels to solve in a world to open the next one (D-036). */
export const UNLOCK_THRESHOLD = 6;

export interface LevelProgress {
  solved: boolean;
  /** Fewest free pieces used in a solve. */
  best?: number;
  /** Fewest hints used in a solve. */
  hints?: number;
}

type LevelRef = Pick<LevelData, 'id' | 'par'>;

export interface WorldLike {
  levels: readonly LevelRef[];
  /** `stars`: opens once every ✦ (par met) in the worlds before it is earned. */
  gate?: 'stars';
}

/** The ✦ a star-gated world asks for: every par level in the worlds before it. */
export function starsFor(worlds: readonly WorldLike[], index: number, parMet: (l: LevelRef) => boolean): { have: number; need: number } {
  const pars = worlds.slice(0, index).flatMap((w) => w.levels.filter((l) => l.par !== undefined));
  return { have: pars.filter(parMet).length, need: pars.length };
}

/**
 * Which worlds are open: the first always, then each after `threshold` solves
 * in the previous one; a star-gated world once every earlier ✦ is earned.
 */
export function unlockedWorlds(
  worlds: readonly WorldLike[],
  solved: (id: string) => boolean,
  parMet: (l: LevelRef) => boolean = () => false,
  threshold = UNLOCK_THRESHOLD,
): boolean[] {
  const open: boolean[] = [];
  worlds.forEach((w, i) => {
    if (i === 0) return open.push(true);
    if (w.gate === 'stars') {
      const s = starsFor(worlds, i, parMet);
      return open.push(s.need > 0 && s.have === s.need);
    }
    const prev = worlds[i - 1]!;
    const need = Math.min(threshold, prev.levels.length);
    open.push(open[i - 1]! && prev.levels.filter((l) => solved(l.id)).length >= need);
  });
  return open;
}

/**
 * Where to resume: the remembered level if it is open and unsolved; otherwise
 * the next open unsolved level after it, then the first open unsolved level
 * anywhere; with everything solved, the remembered level (or the first).
 */
export function resumeIndex(
  worlds: readonly WorldLike[],
  solved: (id: string) => boolean,
  last?: string,
  parMet?: (l: LevelRef) => boolean,
): number {
  const open = unlockedWorlds(worlds, solved, parMet);
  const flat = worlds.flatMap((w, wi) => w.levels.map((l) => ({ id: l.id, open: open[wi]! })));
  const todo = (i: number) => flat[i]!.open && !solved(flat[i]!.id);
  const lastAt = flat.findIndex((l) => l.id === last && l.open);
  if (lastAt >= 0 && todo(lastAt)) return lastAt;
  for (let i = Math.max(0, lastAt); i < flat.length; i++) if (todo(i)) return i;
  for (let i = 0; i < flat.length; i++) if (todo(i)) return i;
  return Math.max(0, lastAt);
}

const KEY = 'puzzle-light:progress';

interface Stored {
  levels: Record<string, LevelProgress>;
  last?: string;
}

/** Stored progress with anything malformed dropped: only solved levels, with valid counts (D-071). */
function clean(raw: unknown): Stored {
  const out: Stored = { levels: {} };
  if (!isRecord(raw)) return out;
  if (isRecord(raw.levels)) {
    for (const [id, p] of Object.entries(raw.levels)) {
      if (!isRecord(p) || p.solved !== true) continue;
      const level: LevelProgress = { solved: true };
      if (isCount(p.best)) level.best = p.best;
      if (isCount(p.hints)) level.hints = p.hints;
      out.levels[id] = level;
    }
  }
  if (typeof raw.last === 'string') out.last = raw.last;
  return out;
}

/** Progress saved in localStorage. Every access is guarded; failures just forget. */
export class Progress {
  private data: Stored = clean(readJson(KEY));

  private save(): void {
    writeJson(KEY, this.data);
  }

  get(id: string): LevelProgress | undefined {
    return this.data.levels[id];
  }

  solved = (id: string): boolean => this.data.levels[id]?.solved === true;

  get last(): string | undefined {
    return this.data.last;
  }

  setLast(id: string): void {
    if (this.data.last === id) return;
    this.data.last = id;
    this.save();
  }

  markSolved(id: string, pieces: number, hints: number): void {
    const p = this.data.levels[id] ?? { solved: false };
    p.solved = true;
    p.best = p.best === undefined ? pieces : Math.min(p.best, pieces);
    p.hints = p.hints === undefined ? hints : Math.min(p.hints, hints);
    this.data.levels[id] = p;
    this.save();
  }

  /** Did the best solve meet par? */
  parMet = (level: Pick<LevelData, 'id' | 'par'>): boolean => {
    const p = this.data.levels[level.id];
    return level.par !== undefined && p?.best !== undefined && p.best <= level.par;
  };
}
