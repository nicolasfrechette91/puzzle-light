import { checkLevelData, parseLevel, type LevelData } from './level';

/**
 * Share codes: a level as minified JSON, UTF-8, base64url, prefixed with a
 * format version. Plain and dependency-free; a typical level is ~400 chars.
 */
const VERSION = '1';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Only the fields a level needs, in a stable order. */
function strip(level: LevelData): LevelData {
  const out: LevelData = { id: level.id, name: level.name, grid: level.grid };
  if (level.note) out.note = level.note;
  if (level.bends === 90) out.bends = 90;
  if (level.inv && Object.keys(level.inv).length) out.inv = level.inv;
  if (level.par !== undefined) out.par = level.par;
  return out;
}

export function encodeLevel(level: LevelData): string {
  const compact = { ...strip(level), grid: level.grid.map((r) => r.trim().split(/\s+/).join(' ')) };
  return `${VERSION}.${toBase64Url(new TextEncoder().encode(JSON.stringify(compact)))}`;
}

export class ShareError extends Error {}

/** Decode and validate a share code. Throws ShareError with a readable reason. */
export function decodeLevel(code: string): LevelData {
  const dot = code.indexOf('.');
  if (dot < 0 || code.slice(0, dot) !== VERSION) throw new ShareError('unknown share code format');
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(code.slice(dot + 1))));
  } catch {
    throw new ShareError('share code is damaged');
  }
  let level: LevelData;
  try {
    level = strip(checkLevelData(data, { id: 'shared', name: 'Untitled' }));
  } catch {
    throw new ShareError('share code does not contain a level');
  }
  try {
    parseLevel(level);
  } catch (e) {
    throw new ShareError(`shared level is invalid: ${(e as Error).message}`);
  }
  return level;
}
