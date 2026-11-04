import { checkLevelData, type LevelData } from '../core/level';
import { readJson as read, writeJson as write } from '../game/local-store';

/**
 * Browser storage for the editor. Every access is guarded: private windows,
 * blocked storage or quota errors simply mean nothing is remembered.
 */
const DRAFT = 'puzzle-light:draft';
const MINE = 'puzzle-light:my-levels';

export const loadDraft = (): LevelData | null => read<LevelData>(DRAFT);
export const saveDraft = (level: LevelData): boolean => write(DRAFT, level);

/** Saved levels, each with its field types checked; unreadable entries are skipped (D-071). */
export function loadMyLevels(): LevelData[] {
  const list = read<unknown[]>(MINE);
  if (!Array.isArray(list)) return [];
  return list.flatMap((l) => {
    try {
      return [checkLevelData(l, { id: 'draft', name: 'Untitled' })];
    } catch {
      return [];
    }
  });
}

export function saveMyLevel(level: LevelData): boolean {
  const list = loadMyLevels().filter((l) => l.id !== level.id);
  list.unshift(level);
  return write(MINE, list);
}

export function deleteMyLevel(id: string): boolean {
  return write(
    MINE,
    loadMyLevels().filter((l) => l.id !== id),
  );
}
