/** Guarded localStorage JSON: private windows, blocked storage or quota errors just mean "not remembered". */
export function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // not remembered
  }
}

// Stored data may be corrupt, hand-edited or from another version: readers
// check every field with these and drop what doesn't fit (D-071).

/** A plain JSON object (not null, not an array). */
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A whole number ≥ 0. */
export const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
