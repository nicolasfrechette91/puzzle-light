import { Board, type Bends, type InvSlot } from './board';
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
  /** Finest bend allowed: 90 keeps every beam orthogonal (world 1). Default 45. */
  bends?: Bends;
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
  const bends = data.bends ?? 45;
  if (bends !== 45 && bends !== 90) throw new LevelError(`bends must be 45 or 90, got ${String(data.bends)}`);
  if (bends === 90) {
    const pieces = [...grid.cells.map((p, i) => [p, `cell (${i % grid.w},${(i / grid.w) | 0})`] as const), ...inv.map((s) => [s.proto, 'inventory'] as const)];
    for (const [p, where] of pieces) {
      if (!p) continue;
      if (p.kind === 'prism') throw new LevelError(`${where}: prisms bend light 45°, not allowed with bends: 90`);
      if (KINDS[p.kind].rotSteps === 8 && p.rot % 2) throw new LevelError(`${where}: odd orientation not allowed with bends: 90`);
    }
  }

  // Portals come in pairs: each pair id must appear exactly twice across grid and tray.
  const portals = new Map<number, number>();
  const count = (link: number, k: number) => portals.set(link, (portals.get(link) ?? 0) + k);
  for (const p of grid.cells) if (p?.kind === 'portal') count(p.link ?? 0, 1);
  for (const s of inv) if (s.proto.kind === 'portal') count(s.proto.link ?? 0, s.count);
  for (const [link, k] of portals) {
    if (k !== 2) throw new LevelError(`portal pair ${link} has ${k} portal${k === 1 ? '' : 's'}, expected 2`);
  }

  for (const p of grid.cells) {
    if (p?.lock !== 'free') continue;
    const key = slotKey(p);
    if (!inv.some((s) => slotKey(s.proto) === key)) inv.push({ proto: { ...p, rot: 0 }, count: 0 });
  }
  // Walls, emitters and targets are puzzle structure: the solver relies on movable
  // pieces mattering only where light reaches them (see DECISIONS D-013).
  grid.cells.forEach((p, i) => {
    if (p?.lock === 'free' && (p.kind === 'wall' || p.kind === 'emitter' || p.kind === 'target'))
      throw new LevelError(`cell (${i % grid.w},${(i / grid.w) | 0}): a ${p.kind} cannot be movable`);
  });
  for (const s of inv) {
    if (s.proto.kind === 'wall' || s.proto.kind === 'emitter' || s.proto.kind === 'target')
      throw new LevelError(`inventory: a ${s.proto.kind} cannot be a tray piece`);
  }
  return new Board(grid.w, grid.h, grid.cells, inv, bends);
}

/**
 * Level data from outside the bundle (share links, saved drafts, pasted JSON)
 * with every field's type checked, so a number where a string belongs never
 * reaches the HUD or the editor (D-070). `grid` must be an array of strings
 * and `inv`, if present, an object; a mistyped `id` or `name` gets a default,
 * and a mistyped `note`, `par` (a non-negative integer) or `bends` is dropped.
 * Throws LevelError; the puzzle itself is checked by parseLevel.
 */
export function checkLevelData(d: unknown, defaults: { id: string; name: string }): LevelData {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new LevelError('not a level');
  const o = d as Record<string, unknown>;
  if (!Array.isArray(o.grid) || !o.grid.every((r) => typeof r === 'string')) throw new LevelError('grid must be an array of rows');
  const inv = o.inv ?? undefined;
  if (inv !== undefined && (typeof inv !== 'object' || Array.isArray(inv))) throw new LevelError('inv must map tokens to counts');
  const level: LevelData = {
    id: typeof o.id === 'string' ? o.id : defaults.id,
    name: typeof o.name === 'string' ? o.name : defaults.name,
    grid: [...(o.grid as string[])],
  };
  if (inv) level.inv = { ...(inv as Record<string, number>) };
  if (typeof o.note === 'string' && o.note) level.note = o.note;
  if (typeof o.par === 'number' && Number.isInteger(o.par) && o.par >= 0) level.par = o.par;
  if (o.bends === 90) level.bends = 90;
  return level;
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
  if (b.bends === 90) out.bends = 90;
  return out;
}
