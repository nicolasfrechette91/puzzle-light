import { generate, GENERATOR_VERSION, type Generated, type Tier } from './generate';
import { seedFrom } from './random';

/**
 * Endless mode (D-058): each tier is a numbered sequence of generated levels,
 * "Easy #1", "Easy #2", …, the same for everyone. Level `n` of a tier always
 * comes from the same seed, so a player resumes exactly where they stopped.
 */
export function endlessSeed(tier: Tier, n: number): number {
  return seedFrom(`puzzle-light/endless/v${GENERATOR_VERSION}/${tier}/${n}`);
}

/** Level `n` (from 1) of a tier. Deterministic; null only if generation failed (then the game moves on). */
export function endlessLevel(tier: Tier, n: number): Generated | null {
  const g = generate({ seed: endlessSeed(tier, n), tier });
  if (!g) return null;
  g.level.id = `endless-${tier}-${n}`;
  return g;
}
