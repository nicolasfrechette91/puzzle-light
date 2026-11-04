import { Board, type Bends } from '../core/board';
import type { Color } from '../core/color';
import { History } from '../core/history';
import { parseGrid, parseInventory, parseLevel, toLevelData, type LevelData } from '../core/level';
import { KINDS, type Kind, type Lock, type Piece } from '../core/piece';
import { slotKey } from '../core/token';

/** What a click on the board paints. */
export interface Brush {
  kind: Kind | 'erase';
  color: Color;
  rot: number;
  link: number;
  lock: Lock;
}

export interface Meta {
  id: string;
  name: string;
  note: string;
  par?: number;
  bends: Bends;
}

export const MIN_W = 3;
export const MIN_H = 3;
export const MAX_W = 12;
export const MAX_H = 10;

/** Kinds that are puzzle structure: never movable, never in the tray (D-013). */
const STRUCTURE: ReadonlySet<Kind> = new Set(['wall', 'emitter', 'target', 'glass']);

/** The lock a brush can really give this kind (e.g. walls are always fixed). */
export function effectiveLock(kind: Kind, lock: Lock): Lock {
  if (lock === 'free' && STRUCTURE.has(kind)) return KINDS[kind].rotSteps > 1 ? 'rotate' : 'fixed';
  if (lock === 'rotate' && KINDS[kind].rotSteps === 1) return 'fixed';
  return lock;
}

export const canGoInTray = (kind: Kind): boolean => !STRUCTURE.has(kind);

/** Load level data without the play-time validation, so half-finished levels can be edited. */
function loadLoose(level: LevelData): { board: Board; meta: Meta } {
  const grid = parseGrid(level.grid);
  const inv = parseInventory(level.inv).filter((s) => s.count > 0);
  const bends: Bends = level.bends === 90 ? 90 : 45;
  const meta: Meta = { id: level.id, name: level.name, note: level.note ?? '', bends };
  if (level.par !== undefined) meta.par = level.par;
  return { board: new Board(grid.w, grid.h, grid.cells, inv, bends), meta };
}

/**
 * An editable level with undo. Edits never throw on puzzle rules (a lone
 * portal is fine while building); `problem()` says what would stop it from
 * being played.
 */
export class EditorModel {
  board!: Board;
  meta!: Meta;
  private readonly history: History<string>;
  private readonly listeners = new Set<() => void>();

  constructor(level: LevelData) {
    this.load(level);
    this.history = new History(JSON.stringify(this.toLevel()), (s) => s);
  }

  static blank(w = 7, h = 5): EditorModel {
    const rows = Array.from({ length: h }, () => Array.from({ length: w }, () => '.').join(' '));
    return new EditorModel({ id: 'draft', name: 'Untitled', grid: rows });
  }

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private load(level: LevelData): void {
    const { board, meta } = loadLoose(level);
    this.board = board;
    this.meta = meta;
  }

  /** Record the current state (coalescing same-tag edits, e.g. one paint stroke) and notify. */
  private commit(tag?: string): void {
    this.history.push(JSON.stringify(this.toLevel()), tag);
    for (const fn of this.listeners) fn();
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  undo(): void {
    const s = this.history.undo();
    if (s) this.restore(s);
  }

  redo(): void {
    const s = this.history.redo();
    if (s) this.restore(s);
  }

  /** Replace everything with another level (recorded, so it can be undone). */
  replace(level: LevelData): void {
    this.load(level);
    this.commit();
  }

  private restore(json: string): void {
    this.load(JSON.parse(json) as LevelData);
    for (const fn of this.listeners) fn();
  }

  toLevel(): LevelData {
    const meta: Omit<LevelData, 'grid' | 'inv'> = { id: this.meta.id, name: this.meta.name.trim() || 'Untitled' };
    if (this.meta.note.trim()) meta.note = this.meta.note.trim();
    if (this.meta.bends === 90) meta.bends = 90;
    if (this.meta.par !== undefined) meta.par = this.meta.par;
    const data = toLevelData(this.board, meta);
    if (data.inv) {
      for (const [k, v] of Object.entries(data.inv)) if (v === 0) delete data.inv[k];
      if (!Object.keys(data.inv).length) delete data.inv;
    }
    return data;
  }

  /** Why this level can't be played yet, or null. */
  problem(): string | null {
    try {
      parseLevel(this.toLevel());
    } catch (e) {
      return (e as Error).message;
    }
    if (!this.board.cells.some((p) => p?.kind === 'emitter')) return 'add an emitter';
    if (!this.board.cells.some((p) => p?.kind === 'target')) return 'add a target';
    return null;
  }

  private pieceFrom(brush: Brush): Piece | null {
    if (brush.kind === 'erase') return null;
    const info = KINDS[brush.kind];
    const p: Piece = {
      kind: brush.kind,
      rot: info.rotSteps > 1 ? this.snap(brush.kind, brush.rot % info.rotSteps) : 0,
      color: info.colored ? brush.color || 7 : 0,
      lock: effectiveLock(brush.kind, brush.lock),
    };
    if (info.linked) p.link = brush.link;
    return p;
  }

  /** With bends 90, 8-position pieces stay on even orientations. */
  private snap(kind: Kind, rot: number): number {
    return this.meta.bends === 90 && KINDS[kind].rotSteps === 8 ? rot - (rot % 2) : rot;
  }

  /** Paint one cell. `stroke` groups a drag into one undo step. Returns false if nothing changed. */
  paint(i: number, brush: Brush, stroke?: string): boolean {
    const next = this.pieceFrom(brush);
    const cur = this.board.cells[i];
    if (JSON.stringify(cur ?? null) === JSON.stringify(next)) return false;
    this.board.cells[i] = next;
    this.commit(stroke);
    return true;
  }

  /** Turn any piece, whatever its lock (the designer sets the starting orientation). */
  rotateAt(i: number, delta: number): boolean {
    const p = this.board.cells[i];
    if (!p) return false;
    const steps = KINDS[p.kind].rotSteps;
    if (steps === 1) return false;
    const stride = this.board.stride(p);
    p.rot = (((p.rot + delta * stride) % steps) + steps) % steps;
    this.commit(`rot:${i}`);
    return true;
  }

  /** Resize, keeping the top-left content. */
  resize(w: number, h: number): boolean {
    w = Math.max(MIN_W, Math.min(MAX_W, w));
    h = Math.max(MIN_H, Math.min(MAX_H, h));
    if (w === this.board.w && h === this.board.h) return false;
    const cells: (Piece | null)[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(this.board.at(x, y));
    this.board = new Board(w, h, cells, this.board.inv, this.meta.bends);
    this.commit();
    return true;
  }

  /** Add one piece like the brush to the tray. */
  addToTray(brush: Brush): boolean {
    if (brush.kind === 'erase' || !canGoInTray(brush.kind)) return false;
    const proto = { ...this.pieceFrom(brush)!, lock: 'free' as Lock };
    const key = slotKey(proto);
    const slot = this.board.inv.find((s) => slotKey(s.proto) === key);
    if (slot) slot.count++;
    else this.board.inv.push({ proto, count: 1 });
    this.commit();
    return true;
  }

  removeFromTray(slot: number): boolean {
    const s = this.board.inv[slot];
    if (!s) return false;
    s.count--;
    if (s.count <= 0) this.board.inv.splice(slot, 1);
    this.commit();
    return true;
  }

  setMeta(patch: Partial<Meta>): void {
    const bendsChanged = patch.bends !== undefined && patch.bends !== this.meta.bends;
    this.meta = { ...this.meta, ...patch };
    if ('par' in patch && patch.par === undefined) delete this.meta.par;
    if (bendsChanged) {
      // Snap existing pieces onto the new grid of orientations.
      const cells = this.board.cells.map((p) => (p ? { ...p, rot: this.snap(p.kind, p.rot) } : null));
      const inv = this.board.inv.map((s) => ({ ...s, proto: { ...s.proto, rot: this.snap(s.proto.kind, s.proto.rot) } }));
      this.board = new Board(this.board.w, this.board.h, cells, inv, this.meta.bends);
    }
    this.commit('meta');
  }
}
