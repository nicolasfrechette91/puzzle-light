import type { Board } from '../src/core/board';
import { parseLevel, type LevelData } from '../src/core/level';

/** Parse a grid literal (rows of tokens) with an optional inventory. */
export function board(grid: string[], inv?: Record<string, number>): Board {
  const data: LevelData = { id: 'test', name: 'test', grid };
  if (inv) data.inv = inv;
  return parseLevel(data);
}
