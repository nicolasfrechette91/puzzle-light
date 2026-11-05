import type { Board } from './board';
import { KINDS, type Piece } from './piece';
import { applySolution, HINT_SOLVE, solve, type Solution, type SolveOptions } from './solver';
import { slotKey } from './token';
import { trace } from './trace';

/**
 * Moves (D-079): placing, moving or removing a piece is one move, and so is a
 * run of consecutive turns of the same piece, grouped as undo groups them
 * (D-004). Undo, redo and reset end a run but never change the count; only
 * starting the level again does.
 */

/** A player action that changed the board. */
export type MoveKind = 'rotate' | 'place' | 'move' | 'pickUp' | 'undo' | 'redo' | 'reset';

export class MoveCounter {
  /** Moves since the level was started. */
  count = 0;
  /** The cell whose piece is being turned in the current run, if any. */
  private turning: number | null = null;

  /** Note an action that changed the board; true if it began a new move. */
  record(kind: MoveKind, cell?: number): boolean {
    if (kind === 'rotate' && cell !== undefined) {
      if (this.turning === cell) return false;
      this.turning = cell;
      this.count++;
      return true;
    }
    this.turning = null;
    if (kind === 'undo' || kind === 'redo' || kind === 'reset') return false;
    this.count++;
    return true;
  }
}

// ── perfect: the fewest moves that solve a level (D-080) ──

interface Spot {
  cell: number;
  rot: number;
}

/** Turning a piece costs one move, whatever the angle. */
const turn = (from: number, to: number, p: Piece) => (KINDS[p.kind].rotSteps > 1 && from !== to ? 1 : 0);

/**
 * Moves to turn `start` into the board a solution describes, the cheapest way:
 *
 * * a rotate-only piece that must turn: 1;
 * * a tray piece: 1 to place it, plus 1 if it must turn from its tray orientation;
 * * a movable piece already on the board: 0 if it is in place, else 1 to move it
 *   (a move keeps its orientation), plus 1 if it must turn;
 * * a movable piece the solution doesn't use: 1 to clear it if it sits where a
 *   piece must go or would change the light, else it may stay.
 */
export function solutionMoves(start: Board, sol: Pick<Solution, 'placements'>): number {
  let moves = 0;
  const targets = new Map<string, { piece: Piece; spots: Spot[] }>();
  for (const { cell, piece } of sol.placements) {
    if (piece.lock !== 'free') {
      const p = start.cells[cell];
      if (p) moves += turn(p.rot, piece.rot, p);
      continue;
    }
    const key = slotKey(piece);
    const t = targets.get(key) ?? { piece, spots: [] };
    t.spots.push({ cell, rot: piece.rot });
    targets.set(key, t);
  }

  // Movable pieces that start on the board. One the solution doesn't use may
  // stay where it is if the solved board, with it there, is still solved.
  const wanted = new Set(sol.placements.map((p) => p.cell));
  const solved = applySolution(start, sol);
  const withPieces = (cells: number[]): Board => {
    const b = solved.clone();
    for (const c of cells) b.cells[c] = { ...start.cells[c]! };
    return b;
  };
  const onBoard = new Map<string, { spot: Spot; stays: boolean }[]>();
  start.cells.forEach((p, cell) => {
    if (p?.lock !== 'free') return;
    const key = slotKey(p);
    const list = onBoard.get(key) ?? [];
    list.push({ spot: { cell, rot: p.rot }, stays: !wanted.has(cell) && trace(withPieces([cell])).solved });
    onBoard.set(key, list);
  });

  const stayers: number[] = [];
  for (const key of new Set([...targets.keys(), ...onBoard.keys()])) {
    const { piece, spots: want } = targets.get(key) ?? { piece: null, spots: [] };
    const have = (onBoard.get(key) ?? []).slice(0, 24); // the bitmask below; no real level comes close
    const slots = start.inv.filter((s) => slotKey(s.proto) === key);
    const trayRot = slots[0]?.proto.rot ?? 0;
    // Cheapest assignment of the wanted spots to pieces on the board or in the
    // tray, memoised on (spot, board pieces used, tray pieces left). Groups are tiny.
    const memo = new Map<string, { cost: number; used: number }>();
    const best = (i: number, used: number, tray: number): { cost: number; used: number } => {
      if (i === want.length) {
        let cost = 0;
        have.forEach((h, k) => {
          if (!(used & (1 << k)) && !h.stays) cost++;
        });
        return { cost, used };
      }
      const memoKey = `${i}/${used}/${tray}`;
      const hit = memo.get(memoKey);
      if (hit) return hit;
      const w = want[i]!;
      let out = { cost: Infinity, used };
      if (tray > 0) {
        const r = best(i + 1, used, tray - 1);
        const c = r.cost + 1 + turn(trayRot, w.rot, piece!);
        if (c < out.cost) out = { cost: c, used: r.used };
      }
      have.forEach((h, k) => {
        if (used & (1 << k)) return;
        const r = best(i + 1, used | (1 << k), tray);
        const c = r.cost + (h.spot.cell === w.cell ? 0 : 1) + turn(h.spot.rot, w.rot, piece!);
        if (c < out.cost) out = { cost: c, used: r.used };
      });
      memo.set(memoKey, out);
      return out;
    };
    const r = best(0, 0, slots.reduce((n, s) => n + s.count, 0));
    if (r.cost === Infinity) return Infinity; // too few pieces: not a solution of this board
    moves += r.cost;
    have.forEach((h, k) => {
      if (!(r.used & (1 << k)) && h.stays) stayers.push(h.spot.cell);
    });
  }

  // Each piece left in place was checked alone; if together they spoil the light, clear them.
  if (stayers.length > 1 && !trace(withPieces(stayers)).solved) moves += stayers.length;
  return moves;
}

/** The level's perfect score: the fewest moves over its known solutions, or null if none is known. */
export function perfectMoves(start: Board, solutions: readonly Pick<Solution, 'placements'>[]): number | null {
  let min = Infinity;
  for (const s of solutions) min = Math.min(min, solutionMoves(start, s));
  return Number.isFinite(min) ? min : null;
}

/** What playing a level needs from one solve (D-089). */
export interface PlaySolve {
  /** The best solutions, as many as hints keep (fewest pieces first). */
  solutions: Solution[];
  /** The fewest moves over every solution found, not just the kept ones; null if none was found. */
  perfect: number | null;
  /** The search finished, so `perfect` is the true minimum; otherwise it is only the best known (an estimate). */
  exact: boolean;
}

/**
 * Solve a level for play: hints keep the best few solutions, but perfect is
 * the minimum over all of them. The fewest-move solution can sort far behind
 * the first 50 (it may use more pieces but turn none), and scanning every
 * solution costs little next to the search itself (D-089).
 */
export function solveForPlay(start: Board, opts: SolveOptions = HINT_SOLVE): PlaySolve {
  const r = solve(start, { ...opts, maxSolutions: Infinity });
  return { solutions: r.solutions.slice(0, opts.maxSolutions ?? 20), perfect: perfectMoves(start, r.solutions), exact: r.complete };
}

// ── bests (D-081) ──

/** A saved best: the fewest moves, and whether that solve used a hint. */
export interface MoveBest {
  moves: number;
  hinted?: true;
}

/** Should `next` replace `old` as the best? An unhinted solve always beats a hinted one. */
export function beats(next: MoveBest, old: MoveBest | undefined): boolean {
  if (!old) return true;
  if (!next.hinted !== !old.hinted) return !next.hinted;
  return next.moves < old.moves;
}

/** A perfect solve: no hint, and no more moves than the perfect score. */
export const isPerfect = (b: MoveBest, perfect: number | null | undefined): boolean =>
  !b.hinted && perfect !== null && perfect !== undefined && b.moves <= perfect;

// ── the solved banner (D-082) ──

export interface SolveSummary {
  moves: number;
  /** Hints asked for during this play. */
  hints: number;
  /** The saved best before this solve; absent on a first solve or where nothing is saved. */
  before?: MoveBest;
  /** This solve replaced an earlier best. */
  newBest: boolean;
}

/** One piece of the solved banner; `perfect` and `best` get their own quiet styles. */
export interface BannerPart {
  text: string;
  mark?: 'perfect' | 'best';
  /** A tooltip, where the words need explaining. */
  title?: string;
}

/** Why a perfect count can be approximate (D-089). */
export const ESTIMATE_TIP = 'An estimate: this level has too many ways to solve it for the solver to check them all';

/** The perfect mark (D-082). */
export const PERFECT_MARK = '◎';

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * "Solved in 9 moves · best 7 · perfect 6", as parts. `estimate` is the best
 * known count when the solver couldn't prove a minimum: it reads "perfect ~6"
 * and never earns ◎ (D-089).
 */
export function solveParts(s: SolveSummary, perfect: number | null, estimate: number | null = null): BannerPart[] {
  const hinted = s.hints > 0;
  const parts: BannerPart[] = [{ text: `Solved in ${plural(s.moves, 'move')}${hinted ? (s.hints === 1 ? ' with a hint' : ' with hints') : ''}` }];
  if (isPerfect({ moves: s.moves }, perfect) && !hinted) return [...parts, { text: `${PERFECT_MARK} perfect`, mark: 'perfect' }];
  if (s.newBest) parts.push({ text: 'new best', mark: 'best' });
  else if (s.before) parts.push({ text: `best ${s.before.moves}${s.before.hinted ? ' with a hint' : ''}` });
  if (perfect !== null) parts.push({ text: `perfect ${perfect}` });
  else if (estimate !== null) parts.push({ text: `perfect ~${estimate}`, title: ESTIMATE_TIP });
  return parts;
}
