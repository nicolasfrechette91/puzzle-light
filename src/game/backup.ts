import type { DailyStore } from './daily-store';
import type { EndlessStore } from './endless-store';
import { isRecord } from './local-store';
import type { Progress } from './progress';

/**
 * Progress backup (D-091): the campaign and move bests, the daily results and
 * streak, and endless progress, as one JSON file the player keeps. Settings,
 * sound and editor levels are left out (the editor has its own export).
 */
export const BACKUP_KIND = 'puzzle-light/progress';
export const BACKUP_VERSION = 1;
/** A real backup is a few kilobytes; anything far bigger isn't one. */
export const BACKUP_MAX_BYTES = 2_000_000;
export const TOO_LARGE = 'That file is too large to be a progress backup.';

export interface Stores {
  progress: Progress;
  daily: DailyStore;
  endless: EndlessStore;
}

export interface Backup {
  kind: typeof BACKUP_KIND;
  version: number;
  /** When it was made (ISO time), for the player's sake only. */
  exported: string;
  progress: ReturnType<Progress['snapshot']>;
  daily: ReturnType<DailyStore['snapshot']>;
  endless: ReturnType<EndlessStore['snapshot']>;
}

export const backupFileName = (date: string): string => `puzzle-light-progress-${date}.json`;

export function makeBackup(s: Stores, now = new Date()): Backup {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exported: now.toISOString(),
    progress: s.progress.snapshot(),
    daily: s.daily.snapshot(),
    endless: s.endless.snapshot(),
  };
}

export type ReadResult = { ok: true; sections: { progress: unknown; daily: unknown; endless: unknown } } | { ok: false; reason: string };

/**
 * Check a file's text is a backup this version can read. Only the envelope is
 * checked here; each store cleans its own section field by field as it
 * merges it, exactly as it cleans what it reads from localStorage (D-071).
 */
export function readBackup(text: string): ReadResult {
  if (text.length > BACKUP_MAX_BYTES) return { ok: false, reason: TOO_LARGE };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file isn’t a progress backup (it isn’t JSON).' };
  }
  if (!isRecord(raw) || raw.kind !== BACKUP_KIND) return { ok: false, reason: 'That file isn’t a Puzzle Light progress backup.' };
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    return { ok: false, reason: 'That backup is damaged (it has no version).' };
  }
  if (raw.version > BACKUP_VERSION) return { ok: false, reason: 'That backup comes from a newer Puzzle Light; reload the page and try again.' };
  return { ok: true, sections: { progress: raw.progress, daily: raw.daily, endless: raw.endless } };
}

export interface Restored {
  levels: number;
  dailies: number;
  tiers: number;
}

/** Merge a read backup into this device's progress: nothing here is ever lost or made worse (D-091). */
export function restoreBackup(s: Stores, sections: { progress: unknown; daily: unknown; endless: unknown }): Restored {
  return { levels: s.progress.merge(sections.progress), dailies: s.daily.merge(sections.daily), tiers: s.endless.merge(sections.endless) };
}

/** What an import did, in a sentence. */
export function describeRestore(r: Restored): string {
  const parts: string[] = [];
  if (r.levels) parts.push(`${r.levels} level${r.levels === 1 ? '' : 's'}`);
  if (r.dailies) parts.push(`${r.dailies} daily result${r.dailies === 1 ? '' : 's'}`);
  if (r.tiers) parts.push('endless progress');
  return parts.length ? `Imported ${parts.join(', ')}.` : 'Nothing new in that backup: this device is already ahead.';
}
