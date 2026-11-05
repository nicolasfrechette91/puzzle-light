import type { Board } from '../core/board';
import { nextHint, type Hint } from '../core/hint';
import { History } from '../core/history';
import { parseLevel, type LevelData } from '../core/level';
import { MoveCounter, solveForPlay, type MoveKind, type PlaySolve } from '../core/moves';
import { trace, type Trace } from '../core/trace';

/** The player action behind the latest 'change' (for sound and effects). */
export type GameAction = 'rotate' | 'place' | 'move' | 'pickUp' | 'undo' | 'redo' | 'reset' | 'hint' | 'load';

export type GameEvent =
  /** Board or history changed. */
  | 'change'
  /** The board just went from unsolved to solved through a player action. */
  | 'solved'
  /** A different level was loaded. */
  | 'level'
  /** The level's solutions arrived: hints and the perfect count are ready. */
  | 'solutions';

/**
 * Game controller: owns the current level, its board, undo history and trace.
 * All player actions go through `apply`, which works on a copy so stored
 * history snapshots are never mutated.
 */
export class Game {
  levels: LevelData[];
  index = 0;
  level!: LevelData;
  board!: Board;
  trace!: Trace;
  solved = false;
  /** The hint currently on display; cleared by any board change. */
  hintShown: Hint | null = null;
  /** Hints asked for on this level. */
  hintsUsed = 0;
  lastAction: GameAction = 'load';
  /** Rotation direction of the latest rotate action. */
  lastDelta = 0;
  /** Whether level `i` may be played (world gates in the campaign). */
  isOpen: (i: number) => boolean = () => true;
  /**
   * Solves a level off the main thread (D-061): its solutions for hints and
   * its perfect count (D-089). Without it, the first hint solves synchronously.
   */
  solveAsync: ((level: LevelData) => Promise<PlaySolve>) | null = null;
  /** A hint was asked for and waits for the solutions. */
  hintPending = false;

  private history!: History<Board>;
  private start!: Board;
  private counter = new MoveCounter();
  /** The level solved for play: hint solutions and the perfect count, once known. */
  private played: PlaySolve | null = null;
  private solving: LevelData | null = null;
  private solveToken = 0;
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

  /** Switch to another list of levels (campaign, a test level, a shared level). */
  setLevels(levels: LevelData[], index = 0): void {
    if (levels.length === 0) throw new Error('no levels');
    this.levels = levels;
    this.load(index);
  }

  load(index: number): void {
    this.index = Math.max(0, Math.min(this.levels.length - 1, index));
    this.level = this.levels[this.index]!;
    const b = parseLevel(this.level);
    this.start = b.clone();
    this.played = null;
    this.counter = new MoveCounter(); // starting a level again is the only way back to 0 (D-079)
    this.solving = null;
    this.hintPending = false;
    this.hintShown = null;
    this.hintsUsed = 0;
    this.history = new History(b, (s) => s.key());
    this.solved = false;
    this.lastAction = 'load';
    this.setBoard(b.clone(), false);
    this.prepareHints();
    this.emit('level');
  }

  /** Start finding the current level's solutions in the background, if a worker is available. */
  prepareHints(): void {
    if (!this.solveAsync || this.played || this.solving === this.level) return;
    const level = this.level;
    this.solving = level;
    // Only the newest request counts: an older one may still answer (or fail as
    // cancelled, D-077), even for this same level loaded a second time.
    const token = ++this.solveToken;
    const done = (p: PlaySolve | null) => {
      if (token !== this.solveToken || this.level !== level) return;
      this.solving = null;
      this.played = p ?? solveForPlay(this.start);
      this.emit('solutions');
      if (this.hintPending) {
        this.hintPending = false;
        this.hint();
      }
    };
    this.solveAsync(level).then(done, () => done(null));
  }

  get hasPrev(): boolean {
    return this.index > 0 && this.isOpen(this.index - 1);
  }

  get hasNext(): boolean {
    return this.index < this.levels.length - 1 && this.isOpen(this.index + 1);
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

  /** Moves made since the level was started (D-079). */
  get moves(): number {
    return this.counter.count;
  }

  /**
   * The fewest moves that solve the level (D-080), or null until its
   * solutions are known (the 'solutions' event says when), or if the solver
   * couldn't prove a minimum (see `perfectEstimate`). Without a worker it
   * solves here, as the first hint does.
   */
  get perfect(): number | null {
    if (!this.played && !this.solveAsync) this.played = solveForPlay(this.start);
    return this.played?.exact ? this.played.perfect : null;
  }

  /**
   * The fewest moves found when the search stopped before checking every
   * solution: an estimate, shown as "perfect ~6", never saved and never ◎ (D-089).
   */
  get perfectEstimate(): number | null {
    return this.played && !this.played.exact ? this.played.perfect : null;
  }

  /**
   * Run `action` on a copy of the board; if it changed anything, record it in
   * the history (turns of one piece share an undo step, D-004), count the
   * move and publish it.
   */
  private apply(kind: MoveKind, action: (b: Board) => boolean, cell?: number): boolean {
    const next = this.board.clone();
    if (!action(next) || !this.history.push(next, kind === 'rotate' ? `rot:${cell}` : undefined)) return false;
    this.counter.record(kind, cell);
    this.setBoard(next.clone(), true);
    return true;
  }

  rotate(cell: number, delta: number): boolean {
    this.lastAction = 'rotate';
    this.lastDelta = delta;
    return this.apply('rotate', (b) => b.rotate(cell, delta), cell);
  }

  place(slot: number, cell: number): boolean {
    this.lastAction = 'place';
    return this.apply('place', (b) => b.place(slot, cell));
  }

  move(from: number, to: number): boolean {
    this.lastAction = 'move';
    return this.apply('move', (b) => b.move(from, to));
  }

  pickUp(cell: number): boolean {
    this.lastAction = 'pickUp';
    return this.apply('pickUp', (b) => b.pickUp(cell));
  }

  /** Undo, redo and reset end a run of turns but never change the move count. */
  undo(): void {
    const s = this.history.undo();
    this.lastAction = 'undo';
    if (!s) return;
    this.counter.record('undo');
    this.setBoard(s.clone(), true);
  }

  redo(): void {
    const s = this.history.redo();
    this.lastAction = 'redo';
    if (!s) return;
    this.counter.record('redo');
    this.setBoard(s.clone(), true);
  }

  /** Back to the level's starting state. Recorded in history, so it can be undone. */
  reset(): void {
    const fresh = parseLevel(this.level);
    this.lastAction = 'reset';
    if (!this.history.push(fresh)) return;
    this.counter.record('reset');
    this.setBoard(fresh.clone(), true);
  }

  /**
   * Show the next step towards the nearest solution. The level is solved once:
   * in the background when it loads (then a hint asked for early arrives as
   * soon as the solutions do), or else here, the first time.
   */
  hint(): Hint | null {
    if (this.solved) return null;
    if (!this.played && this.solveAsync) {
      this.prepareHints();
      this.hintPending = true;
      this.lastAction = 'hint';
      this.emit('change');
      return null;
    }
    if (!this.played) {
      this.played = solveForPlay(this.start);
      this.emit('solutions');
    }
    this.hintShown = nextHint(this.start, this.board, this.played.solutions);
    if (this.hintShown) this.hintsUsed++;
    this.lastAction = 'hint';
    this.emit('change');
    return this.hintShown;
  }

  next(): void {
    if (this.hasNext) this.load(this.index + 1);
  }

  prev(): void {
    if (this.hasPrev) this.load(this.index - 1);
  }

  private setBoard(b: Board, announce: boolean): void {
    this.board = b;
    this.hintShown = null;
    this.trace = trace(b);
    const was = this.solved;
    this.solved = this.trace.solved;
    if (this.solved) this.hintPending = false;
    this.emit('change');
    if (announce && this.solved && !was) this.emit('solved');
  }
}
