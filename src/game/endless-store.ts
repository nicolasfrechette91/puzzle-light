import { GENERATOR_VERSION, TIERS, type Tier } from '../core/generate';
import { readJson, writeJson } from './local-store';

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

export class EndlessStore {
  private data: Stored;
  private readonly histories: Partial<Record<Tier, number[]>> = {};

  constructor() {
    const d = readJson<Partial<Stored>>(KEY);
    const tiers = {} as Record<Tier, TierState>;
    for (const t of TIERS) {
      const s = d?.tiers?.[t];
      tiers[t] = { next: count(s?.next, 1), solved: count(s?.solved, 0) };
    }
    this.data = { tier: d?.tier && TIERS.includes(d.tier) ? d.tier : 'easy', tiers };
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
