import type { LevelData } from '../../src/core/level';
import samples from './samples.json';

/** The M1/M2 sample levels, kept as solver regression fixtures (DECISIONS D-022). */
export const SAMPLES = samples as unknown as LevelData[];
