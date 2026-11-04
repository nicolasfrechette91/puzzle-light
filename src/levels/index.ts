import type { LevelData } from '../core/level';
import world1 from './world1.json';
import world2 from './world2.json';
import world3 from './world3.json';
import world4 from './world4.json';
import world5 from './world5.json';
import world6 from './world6.json';
import world7 from './world7.json';

/** A world: one new idea, introduced and then remixed with earlier ones. */
export interface Pack {
  id: string;
  name: string;
  /** One line describing the world's idea. */
  blurb: string;
  levels: LevelData[];
  /** `stars`: opens once every ✦ in the worlds before it is earned (the Expert bonus, D-062). */
  gate?: 'stars';
}

/** Worlds in play order (structure: DECISIONS D-023). */
export const PACKS: Pack[] = [world1, world2, world3, world4, world5, world6, world7] as unknown as Pack[];

export const ALL_LEVELS: LevelData[] = PACKS.flatMap((p) => p.levels);
