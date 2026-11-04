/**
 * Every localStorage access in the game and the editor goes through here.
 * Private windows, blocked storage or quota errors just mean "not
 * remembered" (D-034): reads give null, writes report false.
 */
export function readString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Parsed JSON, or null if missing, unreadable or not JSON. */
export function readJson<T>(key: string): T | null {
  const raw = readString(key);
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  return writeString(key, JSON.stringify(value));
}

/** Remove every key that starts with `prefix`. */
export function removeKeys(prefix: string): void {
  try {
    const s = window.localStorage;
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k?.startsWith(prefix)) s.removeItem(k);
    }
  } catch {
    // nothing to remove, or not allowed to
  }
}

// Stored data may be corrupt, hand-edited or from another version: readers
// check every field with these and drop what doesn't fit (D-071).

/** A plain JSON object (not null, not an array). */
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A whole number ≥ 0. */
export const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
