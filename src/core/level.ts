import { Board, type InvSlot } from './board';
import { KINDS } from './piece';
import { formatToken, parseToken, slotKey } from './token';

/** Compact, hand-editable level description. See docs/DESIGN.md. */
export interface LevelData {
  id: string;
  name: string;
  /** Rows of whitespace-separated cell tokens. */
  grid: string[];
  /** Inventory: token (no lock suffix) → count. */
  inv?: Record<string, number>;
  /** Fewest pieces needed (optional challenge). */
  par?: number;
  /** Short line shown with the level (tutorial text). */
  note?: string;
}

export const MAX_SIZE = 24;

export class LevelError extends Error {}

export function parseGrid(grid: string[]): Board {
  if (!Array.isArray(grid) || grid.length === 0) throw new LevelError('grid must be a non-empty array of rows');
  const rows = grid.map((r) => r.trim().split(/\s+/));
  const h = rows.length;
  const w = rows[0]!.length;
  if (w > MAX_SIZE || h > MAX_SIZE) throw new LevelError(`grid ${w}×${h} exceeds ${MAX_SIZE}×${MAX_SIZE}`);
  rows.forEach((r, y) => {
    if (r.length !== w) throw new LevelError(`row ${y} has ${r.length} cells, expected ${w}`);
  });
  const cells = rows.flat().map((tok, i) => {
    try {
      return parseToken(tok);
    } catch (e) {
      throw new LevelError(`cell (${i % w},${(i / w) | 0}): ${(e as Error).message}`);
    }
  });
  return new Board(w, h, cells);
}

export function parseInventory(inv: Record<string, number> | undefined): InvSlot[] {
  const slots: InvSlot[] = [];
  for (const [tok, count] of Object.entries(inv ?? {})) {
    const proto = parseToken(tok);
    if (!proto) throw new LevelError(`inventory token "${tok}" is empty`);
    if (!Number.isInteger(count) || count < 0) throw new LevelError(`inventory "${tok}" count must be a non-negative integer`);
    const key = slotKey(proto);
    if (slots.some((s) => slotKey(s.proto) === key)) throw new LevelError(`inventory lists "${key}" twice`);
    slots.push({ proto: { ...proto, lock: 'free' }, count });
  }
  return slots;
}

/**
 * Build a playable board from level data. Throws LevelError on malformed input.
 * Every free piece on the grid gets a tray slot (possibly empty) so the tray
 * layout never changes while playing.
 */
export function parseLevel(data: LevelData): Board {
  const grid = parseGrid(data.grid);
  const inv = parseInventory(data.inv);
  for (const p of grid.cells) {
    if (p?.lock !== 'free') continue;
    const key = slotKey(p);
    if (!inv.some((s) => slotKey(s.proto) === key)) inv.push({ proto: { ...p, rot: 0 }, count: 0 });
  }
  return new Board(grid.w, grid.h, grid.cells, inv);
}

/** Render a board's grid as aligned token rows. */
export function formatGrid(b: Board): string[] {
  const toks = b.cells.map((p) => formatToken(p));
  const width = Math.max(...toks.map((t) => t.length)) + 1;
  const rows: string[] = [];
  for (let y = 0; y < b.h; y++) {
    rows.push(
      toks
        .slice(y * b.w, (y + 1) * b.w)
        .map((t) => t.padEnd(width))
        .join('')
        .trimEnd(),
    );
  }
  return rows;
}

/** Serialise a board (fresh or mid-play) back to level data. Empty slots are kept so slot order survives. */
export function toLevelData(b: Board, meta: Omit<LevelData, 'grid' | 'inv'>): LevelData {
  const inv: Record<string, number> = {};
  for (const s of b.inv) {
    // Orientation is only written when it differs from the default, so `{"M": 2}` round-trips.
    const rot = KINDS[s.proto.kind].rotSteps > 1 && s.proto.rot !== 0 ? String(s.proto.rot) : '';
    inv[slotKey(s.proto) + rot] = s.count;
  }
  const out: LevelData = { ...meta, grid: formatGrid(b) };
  if (Object.keys(inv).length) out.inv = inv;
  return out;
}
