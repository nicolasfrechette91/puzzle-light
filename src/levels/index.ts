import type { LevelData } from '../core/level';
import optics from './optics.json';
import tutorial from './tutorial.json';

export interface Pack {
  id: string;
  name: string;
  levels: LevelData[];
}

/** Level packs in play order. These are samples; M4 replaces them with five worlds. */
export const PACKS: Pack[] = [
  { id: 'tutorial', name: 'Tutorial', levels: tutorial as unknown as LevelData[] },
  { id: 'optics', name: 'Optics', levels: optics as unknown as LevelData[] },
];

export const ALL_LEVELS: LevelData[] = PACKS.flatMap((p) => p.levels);
