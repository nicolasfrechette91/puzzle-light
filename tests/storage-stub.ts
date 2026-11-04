import { afterEach } from 'vitest';

/**
 * A `window.localStorage` for store tests in Node, preloaded with raw strings
 * (so tests can plant corrupt or old data). Removed again after each test.
 */
export function stubStorage(entries: Record<string, string> = {}): Map<string, string> {
  const data = new Map(Object.entries(entries));
  const localStorage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
  (globalThis as Record<string, unknown>).window = { localStorage };
  return data;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});
