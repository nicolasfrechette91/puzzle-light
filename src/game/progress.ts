import type { LevelData } from '../core/level';

/** Levels to solve in a world to open the next one (D-036). */
export const UNLOCK_THRESHOLD = 6;

export interface LevelProgress {
  solved: boolean;
  /** Fewest free pieces used in a solve. */
  best?: number;
  /** Fewest hints used in a solve. */
  hints?: number;
}

export interface WorldLike {
  levels: readonly Pick<LevelData, 'id' | 'par'>[];
}

/** Which worlds are open: the first always, then each after `threshold` solves in the previous one. */
export function unlockedWorlds(worlds: readonly WorldLike[], solved: (id: string) => boolean, threshold = UNLOCK_THRESHOLD): boolean[] {
  const open: boolean[] = [];
  worlds.forEach((_w, i) => {
    if (i === 0) return open.push(true);
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
export function resumeIndex(worlds: readonly WorldLike[], solved: (id: string) => boolean, last?: string): number {
  const open = unlockedWorlds(worlds, solved);
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

/** Progress saved in localStorage. Every access is guarded; failures just forget. */
export class Progress {
  private data: Stored = { levels: {} };

  constructor() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as Stored) : null;
      if (parsed && typeof parsed.levels === 'object') this.data = parsed;
    } catch {
      // start fresh
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // not remembered
    }
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
  parMet(level: Pick<LevelData, 'id' | 'par'>): boolean {
    const p = this.data.levels[level.id];
    return level.par !== undefined && p?.best !== undefined && p.best <= level.par;
  }
}
