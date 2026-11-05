import type { LevelData } from '../core/level';
import { beats, type MoveBest } from '../core/moves';
import { PACKS } from '../levels';
import { isCount, isRecord, readJson, writeJson } from './local-store';

/** Levels to solve in a world to open the next one (D-036). */
export const UNLOCK_THRESHOLD = 6;

export interface LevelProgress {
  solved: boolean;
  /** Fewest free pieces used in a solve. */
  best?: number;
  /** Fewest hints used in a solve. */
  hints?: number;
  /** Fewest moves in a solve (D-081); an unhinted solve always replaces a hinted one. */
  moves?: number;
  /** The solve behind `moves` used a hint. */
  movesHinted?: true;
  /** The level's perfect move count, kept so the level select never has to solve. */
  perfect?: number;
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

/** Ids of the bundled campaign levels: the only levels the game resumes at. */
const CAMPAIGN_IDS: ReadonlySet<string> = new Set(PACKS.flatMap((p) => p.levels.map((l) => l.id)));

/**
 * Records are keyed by level: a hand-made level by its id, a generated one by
 * `generatedId` (generator version, tier and seed; D-081). Only campaign ids
 * count towards world gates.
 */
interface Stored {
  levels: Record<string, LevelProgress>;
  last?: string;
}

/**
 * Stored progress with anything malformed dropped: only solved levels, with
 * valid counts (D-071), and a last level only if it is a campaign level (D-084).
 */
function clean(raw: unknown, campaign: ReadonlySet<string>): Stored {
  const out: Stored = { levels: {} };
  if (!isRecord(raw)) return out;
  if (isRecord(raw.levels)) {
    for (const [id, p] of Object.entries(raw.levels)) {
      if (!isRecord(p) || p.solved !== true) continue;
      const level: LevelProgress = { solved: true };
      if (isCount(p.best)) level.best = p.best;
      if (isCount(p.hints)) level.hints = p.hints;
      if (isCount(p.moves)) {
        level.moves = p.moves;
        if (p.movesHinted === true) level.movesHinted = true;
      }
      if (isCount(p.perfect)) level.perfect = p.perfect;
      out.levels[id] = level;
    }
  }
  if (typeof raw.last === 'string' && campaign.has(raw.last)) out.last = raw.last;
  return out;
}

/** Progress saved in localStorage. Every access is guarded; failures just forget. */
export class Progress {
  private readonly campaign: ReadonlySet<string>;
  private data: Stored;

  /** `campaign`: the level ids the game may resume at (the bundled worlds unless a test says otherwise). */
  constructor(campaign: ReadonlySet<string> = CAMPAIGN_IDS) {
    this.campaign = campaign;
    this.data = clean(readJson(KEY), campaign);
  }

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

  /** Remember the campaign level being played; any other level (daily, endless, shared, test) is ignored. */
  setLast(id: string): void {
    if (this.data.last === id || !this.campaign.has(id)) return;
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

  /** The best move count saved for a level, if any. */
  movesBest(id: string): MoveBest | undefined {
    const p = this.data.levels[id];
    if (p?.moves === undefined) return undefined;
    return p.movesHinted ? { moves: p.moves, hinted: true } : { moves: p.moves };
  }

  /**
   * Save a solve's move count; returns whether it became the best. A solve
   * with a hint is saved but marked, and never replaces an unhinted best.
   */
  recordMoves(id: string, solve: MoveBest, perfect: number | null): boolean {
    const p = this.data.levels[id] ?? { solved: true };
    p.solved = true;
    const better = beats(solve, this.movesBest(id));
    if (better) {
      p.moves = solve.moves;
      if (solve.hinted) p.movesHinted = true;
      else delete p.movesHinted;
    }
    if (perfect !== null) p.perfect = perfect;
    this.data.levels[id] = p;
    this.save();
    return better;
  }

  /** The level's perfect count became known after it was solved. */
  setPerfect(id: string, perfect: number): void {
    const p = this.data.levels[id];
    if (!p || p.perfect === perfect) return;
    p.perfect = perfect;
    this.save();
  }

  /** Did the best solve meet par? */
  parMet = (level: Pick<LevelData, 'id' | 'par'>): boolean => {
    const p = this.data.levels[level.id];
    return level.par !== undefined && p?.best !== undefined && p.best <= level.par;
  };
}
