import { colorLetter, parseColor } from './color';
import { KINDS, KIND_BY_CODE, type Lock, type Piece } from './piece';

/**
 * Cell token grammar: `Kind [colour] [digit] [lock]`, or `.` for empty floor.
 *   Kind   one of `#` or an upper-case letter (see KINDS)
 *   colour r g b y m c w   (required for coloured kinds, forbidden otherwise)
 *   digit  orientation 0..7 (defaults to 0; only for rotatable kinds)
 *   lock   none = fixed, `~` = rotatable in place, `*` = free
 */
const TOKEN_RE = /^([#A-Z])([rgybmcw])?([0-7])?([~*])?$/;

export class TokenError extends Error {}

export function parseToken(tok: string): Piece | null {
  if (tok === '.') return null;
  const m = TOKEN_RE.exec(tok);
  if (!m) throw new TokenError(`Bad token "${tok}"`);
  const kind = KIND_BY_CODE[m[1]!];
  if (!kind) throw new TokenError(`Unknown piece "${m[1]}" in "${tok}"`);
  const info = KINDS[kind];
  const color = m[2] ? parseColor(m[2])! : 0;
  if (info.colored && !color) throw new TokenError(`"${tok}": ${kind} needs a colour`);
  if (!info.colored && m[2]) throw new TokenError(`"${tok}": ${kind} has no colour`);
  if (m[3] !== undefined && info.rotSteps === 1) throw new TokenError(`"${tok}": ${kind} has no orientation`);
  const rot = m[3] !== undefined ? Number(m[3]) : 0;
  const lock: Lock = m[4] === '~' ? 'rotate' : m[4] === '*' ? 'free' : 'fixed';
  return { kind, rot, color, lock };
}

/** Canonical token. Orientation is always written for rotatable kinds. */
export function formatToken(p: Piece | null, withLock = true): string {
  if (!p) return '.';
  const info = KINDS[p.kind];
  let s = info.code;
  if (info.colored) s += colorLetter(p.color);
  if (info.rotSteps > 1) s += String(p.rot);
  if (withLock) s += p.lock === 'rotate' ? '~' : p.lock === 'free' ? '*' : '';
  return s;
}

/** Identity of a piece for inventory purposes: kind + colour, ignoring orientation and lock. */
export function slotKey(p: Piece): string {
  const info = KINDS[p.kind];
  return info.code + (info.colored ? colorLetter(p.color) : '');
}
