import { checkLevelData, type LevelData } from '../core/level';

/**
 * Browser storage for the editor. Every access is guarded: private windows,
 * blocked storage or quota errors simply mean nothing is remembered.
 */
const DRAFT = 'puzzle-light:draft';
const MINE = 'puzzle-light:my-levels';

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

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
