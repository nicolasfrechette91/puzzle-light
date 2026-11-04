import { colorLetter, parseColor } from './color';
import { KINDS, KIND_BY_CODE, type Lock, type Piece } from './piece';

/**
 * Cell token grammar: `Kind [colour] [digit] [lock]`, or `.` for empty floor.
 *   Kind   one of `#` or an upper-case letter (see KINDS)
 *   colour r g b y m c w   (required for coloured kinds, forbidden otherwise)
 *   digit  rotatable kinds: orientation 0..rotSteps-1 (default 0)
 *          portals: pair id 0..9 (default 0)
 *          forbidden for everything else
 *   lock   none = fixed, `~` = rotatable in place, `*` = free
 */
const TOKEN_RE = /^([#A-Z])([rgybmcw])?([0-9])?([~*])?$/;

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
  const digit = m[3] !== undefined ? Number(m[3]) : undefined;
  const lock: Lock = m[4] === '~' ? 'rotate' : m[4] === '*' ? 'free' : 'fixed';
  if (info.linked) return { kind, rot: 0, color, lock, link: digit ?? 0 };
  if (digit !== undefined && info.rotSteps === 1) throw new TokenError(`"${tok}": ${kind} has no orientation`);
  if (digit !== undefined && digit >= info.rotSteps) throw new TokenError(`"${tok}": orientation must be below ${info.rotSteps}`);
  return { kind, rot: digit ?? 0, color, lock };
}

/** Canonical token. Orientation is always written for rotatable kinds. */
export function formatToken(p: Piece | null, withLock = true): string {
  if (!p) return '.';
  const info = KINDS[p.kind];
  let s = info.code;
  if (info.colored) s += colorLetter(p.color);
  if (info.rotSteps > 1) s += String(p.rot);
  if (info.linked) s += String(p.link ?? 0);
  if (withLock) s += p.lock === 'rotate' ? '~' : p.lock === 'free' ? '*' : '';
  return s;
}

/** Identity of a piece for inventory purposes: kind + colour + pair id, ignoring orientation and lock. */
export function slotKey(p: Piece): string {
  const info = KINDS[p.kind];
  return info.code + (info.colored ? colorLetter(p.color) : '') + (info.linked ? String(p.link ?? 0) : '');
}
