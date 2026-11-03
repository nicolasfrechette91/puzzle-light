import type { LevelData } from '../core/level';
import tutorial from './tutorial.json';

export interface Pack {
  id: string;
  name: string;
  levels: LevelData[];
}

/** Level packs in play order. M1 ships a tutorial; M4 replaces it with five worlds. */
export const PACKS: Pack[] = [{ id: 'tutorial', name: 'Tutorial', levels: tutorial as LevelData[] }];

export const ALL_LEVELS: LevelData[] = PACKS.flatMap((p) => p.levels);
