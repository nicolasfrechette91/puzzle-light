import { canMove, canRotate, KINDS, type Piece } from './piece';
import { formatToken, slotKey } from './token';

/** A stack of identical pieces waiting in the player's tray. */
export interface InvSlot {
  /** Template for placed pieces (lock is always `free`). */
  proto: Piece;
  count: number;
}

/**
 * The complete, serialisable state of a puzzle: a grid where every cell holds
 * at most one piece, plus the inventory. Mutating methods return `false` and
 * leave the board untouched when the move is illegal, so callers (UI, solver)
 * can attempt moves freely.
 */
export class Board {
  readonly w: number;
  readonly h: number;
  readonly cells: (Piece | null)[];
  readonly inv: InvSlot[];

  constructor(w: number, h: number, cells: (Piece | null)[], inv: InvSlot[] = []) {
    if (cells.length !== w * h) throw new Error(`Board ${w}×${h} needs ${w * h} cells, got ${cells.length}`);
    this.w = w;
    this.h = h;
    this.cells = cells;
    this.inv = inv;
  }

  static empty(w: number, h: number): Board {
    return new Board(w, h, new Array<Piece | null>(w * h).fill(null));
  }

  get size(): number {
    return this.w * this.h;
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  x(i: number): number {
    return i % this.w;
  }

  y(i: number): number {
    return (i / this.w) | 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  at(x: number, y: number): Piece | null {
    return this.inBounds(x, y) ? this.cells[this.idx(x, y)]! : null;
  }

  isEmpty(i: number): boolean {
    return i >= 0 && i < this.size && this.cells[i] === null;
  }

  clone(): Board {
    return new Board(
      this.w,
      this.h,
      this.cells.map((p) => (p ? { ...p } : null)),
      this.inv.map((s) => ({ proto: { ...s.proto }, count: s.count })),
    );
  }

  /** Place one piece from inventory slot `slot` onto empty cell `i`. */
  place(slot: number, i: number, rot?: number): boolean {
    const s = this.inv[slot];
    if (!s || s.count <= 0 || !this.isEmpty(i)) return false;
    const steps = KINDS[s.proto.kind].rotSteps;
    s.count--;
    this.cells[i] = { ...s.proto, rot: rot === undefined ? s.proto.rot : ((rot % steps) + steps) % steps, lock: 'free' };
    return true;
  }

  /** Move a free piece to an empty cell. */
  move(from: number, to: number): boolean {
    const p = this.cells[from];
    if (!p || !canMove(p) || from === to || !this.isEmpty(to)) return false;
    this.cells[to] = p;
    this.cells[from] = null;
    return true;
  }

  /** Return a free piece to the inventory. */
  pickUp(i: number): boolean {
    const p = this.cells[i];
    if (!p || !canMove(p)) return false;
    this.cells[i] = null;
    const key = slotKey(p);
    const slot = this.inv.find((s) => slotKey(s.proto) === key);
    if (slot) slot.count++;
    else this.inv.push({ proto: { ...p, rot: 0, lock: 'free' }, count: 1 });
    return true;
  }

  /** Rotate a piece by `delta` steps (positive = clockwise). */
  rotate(i: number, delta: number): boolean {
    const p = this.cells[i];
    if (!p || !canRotate(p) || delta === 0) return false;
    const steps = KINDS[p.kind].rotSteps;
    p.rot = (((p.rot + delta) % steps) + steps) % steps;
    return true;
  }

  /** Number of pieces currently waiting in the inventory. */
  invCount(): number {
    return this.inv.reduce((n, s) => n + s.count, 0);
  }

  /** Canonical string of the whole state; equal keys ⇔ equal boards. */
  key(): string {
    return `${this.w}x${this.h}:${this.cells.map((p) => formatToken(p)).join(' ')}|${this.inv
      .map((s) => `${formatToken(s.proto, false)}=${s.count}`)
      .join(',')}`;
  }
}
