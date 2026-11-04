import { generate, GENERATOR_VERSION, TIER_SPECS, type Generated, type Tier } from './generate';
import { endlessName } from './names';
import { seedFrom } from './random';

/**
 * Endless mode (D-058): each tier is a numbered sequence of generated levels,
 * "Easy #1", "Easy #2", …, the same for everyone. Level `n` of a tier always
 * comes from the same seed, so a player resumes exactly where they stopped.
 */
export function endlessSeed(tier: Tier, n: number): number {
  return seedFrom(`puzzle-light/endless/v${GENERATOR_VERSION}/${tier}/${n}`);
}

/** A level's solution as one 32-bit number (a hash of its `signature`), cheap to store. */
export const solutionId = (signature: string): number => seedFrom(signature);

/**
 * One tier's sequence. In a `distinct` tier (easy) no level repeats an
 * earlier level's solution (D-073), so level `n` depends on levels 1…n−1.
 * Their solution ids are remembered here; `history` and `restore` let the
 * game keep them between visits, so it never has to replay the whole
 * sequence. Should the fresh puzzles ever run out, a level may repeat an old
 * one rather than fail. Other tiers make each level directly.
 */
export class EndlessSeries {
  readonly tier: Tier;
  /** Solution id of level k at index k − 1 (0 when level k couldn't be made). */
  private readonly ids: number[] = [];
  /** Solution id → the first level that has it. */
  private readonly firstWith = new Map<number, number>();

  constructor(tier: Tier) {
    this.tier = tier;
  }

  private get distinct(): boolean {
    return TIER_SPECS[this.tier].distinct === true;
  }

  private remember(n: number, id: number): void {
    if (this.ids.length === n - 1) this.ids.push(id);
    if (id && !this.firstWith.has(id)) this.firstWith.set(id, n);
  }

  private make(n: number): Generated | null {
    const opts = { seed: endlessSeed(this.tier, n), tier: this.tier, name: endlessName(this.tier, n) };
    let g = this.distinct ? generate({ ...opts, avoid: (sig) => (this.firstWith.get(solutionId(sig)) ?? Infinity) < n }) : null;
    // No fresh puzzle within the attempt budget (or not a distinct tier): take any.
    g ??= generate(opts);
    if (g) g.level.id = `endless-${this.tier}-${n}`;
    if (this.distinct) this.remember(n, g ? solutionId(g.signature) : 0);
    return g;
  }

  /** Level `n` (from 1). Deterministic; null only if generation failed (then the game moves on). */
  level(n: number): Generated | null {
    if (this.distinct) while (this.ids.length < n - 1) this.make(this.ids.length + 1);
    return this.make(n);
  }

  /** Solution ids of the levels made so far, in order (distinct tiers only; else empty). */
  history(): number[] {
    return [...this.ids];
  }

  /** Take over ids from an earlier `history()` (e.g. saved by the game) instead of making those levels again. */
  restore(ids: readonly number[]): void {
    if (!this.distinct) return;
    for (let k = this.ids.length; k < ids.length; k++) this.remember(k + 1, ids[k]!);
  }
}

/** Level `n` of a tier, from a fresh sequence (for one-off use; the game keeps an EndlessSeries per tier). */
export function endlessLevel(tier: Tier, n: number): Generated | null {
  return new EndlessSeries(tier).level(n);
}
