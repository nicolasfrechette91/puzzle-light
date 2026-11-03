import type { Board } from '../core/board';
import { History } from '../core/history';
import { parseLevel, type LevelData } from '../core/level';
import { trace, type Trace } from '../core/trace';

export type GameEvent =
  /** Board or history changed. */
  | 'change'
  /** The board just went from unsolved to solved through a player action. */
  | 'solved'
  /** A different level was loaded. */
  | 'level';

/**
 * Game controller: owns the current level, its board, undo history and trace.
 * All player actions go through `apply`, which works on a copy so stored
 * history snapshots are never mutated.
 */
export class Game {
  readonly levels: LevelData[];
  index = 0;
  level!: LevelData;
  board!: Board;
  trace!: Trace;
  solved = false;
  /** Level ids solved this session (persisted in M6). */
  readonly completed = new Set<string>();

  private history!: History<Board>;
  private listeners = new Set<(e: GameEvent) => void>();

  constructor(levels: LevelData[], start = 0) {
    if (levels.length === 0) throw new Error('no levels');
    this.levels = levels;
    this.load(start);
  }

  on(fn: (e: GameEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  load(index: number): void {
    this.index = Math.max(0, Math.min(this.levels.length - 1, index));
    this.level = this.levels[this.index]!;
    const b = parseLevel(this.level);
    this.history = new History(b, (s) => s.key());
    this.solved = false;
    this.setBoard(b.clone(), false);
    this.emit('level');
  }

  get hasPrev(): boolean {
    return this.index > 0;
  }

  get hasNext(): boolean {
    return this.index < this.levels.length - 1;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  /** Free (player-controlled) pieces on the board — the number compared against par. */
  get piecesUsed(): number {
    return this.board.cells.reduce((n, p) => n + (p?.lock === 'free' ? 1 : 0), 0);
  }

  /** Run `action` on a copy of the board; record and publish it if it changed anything. */
  apply(action: (b: Board) => boolean, tag?: string): boolean {
    const next = this.board.clone();
    if (!action(next) || !this.history.push(next, tag)) return false;
    this.setBoard(next.clone(), true);
    return true;
  }

  rotate(cell: number, delta: number): boolean {
    return this.apply((b) => b.rotate(cell, delta), `rot:${cell}`);
  }

  place(slot: number, cell: number): boolean {
    return this.apply((b) => b.place(slot, cell));
  }

  move(from: number, to: number): boolean {
    return this.apply((b) => b.move(from, to));
  }

  pickUp(cell: number): boolean {
    return this.apply((b) => b.pickUp(cell));
  }

  undo(): void {
    const s = this.history.undo();
    if (s) this.setBoard(s.clone(), true);
  }

  redo(): void {
    const s = this.history.redo();
    if (s) this.setBoard(s.clone(), true);
  }

  /** Back to the level's starting state. Recorded in history, so it can be undone. */
  reset(): void {
    const fresh = parseLevel(this.level);
    if (this.history.push(fresh)) this.setBoard(fresh.clone(), true);
  }

  next(): void {
    if (this.hasNext) this.load(this.index + 1);
  }

  prev(): void {
    if (this.hasPrev) this.load(this.index - 1);
  }

  private setBoard(b: Board, announce: boolean): void {
    this.board = b;
    this.trace = trace(b);
    const was = this.solved;
    this.solved = this.trace.solved;
    if (this.solved) this.completed.add(this.level.id);
    this.emit('change');
    if (announce && this.solved && !was) this.emit('solved');
  }
}
