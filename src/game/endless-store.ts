import { GENERATOR_VERSION, TIERS, type Tier } from '../core/generate';
import { isRecord, readJson, writeJson } from './local-store';

/** Endless mode progress: the tier last played, and per tier the level to play next and how many were solved. */
const KEY = 'puzzle-light:endless';
/** Solution ids per tier (easy only, D-073); they belong to one generator version. */
const HISTORY_KEY = `puzzle-light:endless-history:v${GENERATOR_VERSION}`;
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;

interface TierState {
  next: number;
  solved: number;
}

interface Stored {
  tier: Tier;
  tiers: Record<Tier, TierState>;
}

const count = (v: unknown, min: number): number => (typeof v === 'number' && Number.isInteger(v) && v >= min ? v : min);

/** Stored endless progress with anything malformed set back to its default (D-071). */
function clean(raw: unknown): Stored {
  const d = isRecord(raw) ? raw : {};
  const tiers = {} as Record<Tier, TierState>;
  for (const t of TIERS) {
    const s = isRecord(d.tiers) && isRecord(d.tiers[t]) ? d.tiers[t] : {};
    tiers[t] = { next: count(s.next, 1), solved: count(s.solved, 0) };
  }
  return { tier: TIERS.includes(d.tier as Tier) ? (d.tier as Tier) : 'easy', tiers };
}

export class EndlessStore {
  private data: Stored;
  private readonly histories: Partial<Record<Tier, number[]>> = {};

  constructor() {
    this.data = clean(readJson(KEY));
    const h = readJson<Partial<Record<Tier, unknown>>>(HISTORY_KEY);
    for (const t of TIERS) {
      const ids = h?.[t];
      // Anything malformed is dropped (D-071): the worker then rebuilds it, just more slowly.
      if (Array.isArray(ids) && ids.every(isId)) this.histories[t] = ids;
    }
  }

  /** The saved solution history of a tier (see EndlessSeries.history). */
  history(t: Tier): number[] {
    return this.histories[t] ?? [];
  }

  /** Keep a longer history from the worker. */
  setHistory(t: Tier, ids: number[]): void {
    if (ids.length <= this.history(t).length) return;
    this.histories[t] = ids;
    writeJson(HISTORY_KEY, this.histories);
  }

  get tier(): Tier {
    return this.data.tier;
  }

  set tier(t: Tier) {
    if (t === this.data.tier) return;
    this.data.tier = t;
    writeJson(KEY, this.data);
  }

  /** A copy of the progress per tier, for a backup (D-091). The solution history is left out: it is rebuilt when needed. */
  snapshot(): Stored {
    return structuredClone(this.data);
  }

  /**
   * Merge a backup's progress, cleaned as saved data is (D-071). The numbered
   * sequence is the same everywhere, so each tier keeps the further point
   * and the larger solved count. Returns how many tiers moved on.
   */
  merge(raw: unknown): number {
    const incoming = clean(raw);
    let moved = 0;
    for (const t of TIERS) {
      const mine = this.data.tiers[t];
      const theirs = incoming.tiers[t];
      if (theirs.next <= mine.next && theirs.solved <= mine.solved) continue;
      mine.next = Math.max(mine.next, theirs.next);
      mine.solved = Math.max(mine.solved, theirs.solved);
      moved++;
    }
    writeJson(KEY, this.data);
    return moved;
  }

  /** The level number to play next in a tier. */
  next(t: Tier): number {
    return this.data.tiers[t].next;
  }

  solved(t: Tier): number {
    return this.data.tiers[t].solved;
  }

  /** Level `n` is done with (solved or skipped): the tier moves past it. */
  finish(t: Tier, n: number, solved: boolean): void {
    const s = this.data.tiers[t];
    s.next = Math.max(s.next, n + 1);
    if (solved) s.solved++;
    writeJson(KEY, this.data);
  }
}
