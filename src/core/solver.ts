import type { Board } from './board';
import { BLUE, RED } from './color';
import { reflect } from './dir';
import { canMove, canRotate, type Piece } from './piece';
import { formatToken } from './token';
import { arrivals, portalPartners, trace, type Arrival, type Trace } from './trace';

/**
 * Exhaustive, beam-guided solver.
 *
 * Search space: every placement of tray pieces (including pieces that start on
 * the board as movable) on empty floor, every orientation of placed pieces, and
 * every orientation of rotate-only pieces.
 *
 * Pruning rests on one fact: a piece can only change the light if light reaches
 * its cell. So at each node the solver
 *   1. treats undecided rotate-only pieces as absorbers, and if light reaches one,
 *      branches on its orientation first;
 *   2. otherwise branches on placing a tray piece on a cell light currently
 *      enters, keeping only placements that actually change that light;
 *   3. plus, for a lit portal whose twin is still in the tray, every empty cell
 *      for the twin (the exit can usefully be anywhere).
 * If a solution exists, some piece of it is always on a lit cell of the
 * partial board (otherwise the partial board already lights the same cells),
 * so the search is complete. States are memoised, which removes the
 * placement-order permutations.
 *
 * Solutions are distinct by their *active* pieces: player-controlled pieces
 * that change the light passing them (see `isActive`). A mirror parked off the
 * beam, or a filter that only sees its own colour, does not make a new solution.
 *
 * Walls, emitters and targets are never movable (enforced by parseLevel), which
 * keeps "only lit pieces matter" true: a movable wall could pinch a corner
 * without being lit.
 */

export interface SolveOptions {
  /** Solutions kept in the result (the count keeps going). Default 20. */
  maxSolutions?: number;
  /** Stop once this many distinct solutions are known (e.g. 2 to test uniqueness). */
  stopAfter?: number;
  /** Abort after visiting this many states. Default 5 000 000. */
  maxNodes?: number;
  /** Abort when `now()` passes `deadline`. The clock is injected to keep the core pure. */
  deadline?: number;
  now?: () => number;
}

/** One piece of a solution: what ends up on which cell. */
export interface Placement {
  cell: number;
  piece: Piece;
}

export interface Solution {
  /** Final state of every active player-controlled piece, as `token@x,y`, in cell order. */
  moves: string[];
  /** The same, structured. Free pieces have lock `free`; rotate-only pieces keep `rotate`. */
  placements: Placement[];
  /** Free (tray/movable) pieces used. */
  pieces: number;
  /** Player decisions: pieces used plus rotate-only pieces turned away from their start. */
  decisions: number;
}

export interface SolveResult {
  /** The search space was exhausted, so `count` is exact. */
  complete: boolean;
  /** Why the search stopped early. */
  stopped?: 'nodes' | 'time' | 'enough';
  /** Distinct solutions found. */
  count: number;
  /** Best solutions first: fewest pieces, then fewest decisions. */
  solutions: Solution[];
  /** Fewest pieces in any solution found (Infinity if none). */
  minPieces: number;
  /** States visited. */
  nodes: number;
  /**
   * log2(states visited) + decisions in the best solution, rounded to 0.1.
   * A rough ordering key: bigger boards, more pieces and longer solutions score higher.
   */
  difficulty: number;
}

class Stop extends Error {
  readonly reason: 'nodes' | 'time' | 'enough';
  constructor(reason: 'nodes' | 'time' | 'enough') {
    super(reason);
    this.reason = reason;
  }
}

/** Placeholder for an undecided rotate-only piece: absorbs light, so reaching it is visible in `lit`. */
const UNDECIDED: Piece = { kind: 'hole', rot: 0, color: 0, lock: 'fixed' };

/**
 * Does a piece with this orientation change light arriving like this?
 * Inactive pieces pass all of it straight through unchanged.
 */
export function isActive(p: Piece, arr: readonly Arrival[]): boolean {
  switch (p.kind) {
    case 'mirror':
    case 'splitter':
      return arr.some((a) => reflect(p.rot, a.dir) !== a.dir);
    case 'prism':
      return arr.some((a) => a.mask & (RED | BLUE));
    case 'filter':
      return arr.some((a) => a.mask & ~p.color);
    case 'glass':
      return false;
    case 'emitter':
    case 'target':
      return true;
    default:
      return arr.length > 0; // holes, portals, walls: anything they receive is absorbed or redirected
  }
}

/** How hints solve a level: enough solutions to find the nearest one, and a generous cap. */
export const HINT_SOLVE: SolveOptions = { maxNodes: 2_000_000, maxSolutions: 50 };

export function solve(start: Board, opts: SolveOptions = {}): SolveResult {
  const maxSolutions = opts.maxSolutions ?? 20;
  const maxNodes = opts.maxNodes ?? 5_000_000;
  const stopAfter = opts.stopAfter ?? Infinity;
  const { now, deadline } = opts;

  // Normalise: every movable piece goes back to the tray; rotate-only pieces become undecided.
  const work = start.clone();
  work.cells.forEach((p, i) => {
    if (p && canMove(p)) work.pickUp(i);
  });
  const original = new Map<number, Piece>();
  work.cells.forEach((p, i) => {
    if (p && canRotate(p)) original.set(i, p);
  });
  const decided = new Map<number, number>(); // cell → chosen orientation
  for (const i of original.keys()) work.cells[i] = UNDECIDED;
  const decisionCells = [...original.keys()];
  // Emitters emit whether or not light reaches them, so they are decided up front.
  const emitterCells = decisionCells.filter((i) => original.get(i)!.kind === 'emitter');

  // The portal-twin rule only matters if a portal exists anywhere.
  const hasPortals = work.cells.some((p) => p?.kind === 'portal') || work.inv.some((s) => s.proto.kind === 'portal');
  const visited = new Set<string>();
  const found = new Map<string, Solution>();
  let nodes = 0;

  const stateKey = (): string => {
    let k = '';
    for (let i = 0; i < work.size; i++) {
      const p = work.cells[i];
      if (p && p.lock === 'free') k += `${i}:${formatToken(p)},`;
    }
    for (const i of decisionCells) k += decided.has(i) ? `${decided.get(i)}` : '_';
    return k;
  };

  const record = (t: Trace): void => {
    const moves: string[] = [];
    const placements: Placement[] = [];
    let pieces = 0;
    let decisions = 0;
    for (let i = 0; i < work.size; i++) {
      const p = work.cells[i];
      if (!p) continue;
      const free = p.lock === 'free';
      if (!free && !decided.has(i)) continue;
      const active = p.kind === 'portal' ? t.lit[i] !== 0 : isActive(p, arrivals(work, t, i));
      if (!active) continue;
      moves.push(`${formatToken(p)}@${i % work.w},${(i / work.w) | 0}`);
      placements.push({ cell: i, piece: { ...p } });
      if (free) {
        pieces++;
        decisions++;
      } else if (p.rot !== original.get(i)!.rot) decisions++;
    }
    const key = moves.join(' ');
    if (!found.has(key)) {
      found.set(key, { moves, placements, pieces, decisions });
      if (found.size >= stopAfter) throw new Stop('enough');
    }
  };

  const decide = (cell: number): void => {
    const orig = original.get(cell)!;
    for (const r of work.rotations(orig)) {
      work.cells[cell] = { ...orig, rot: r };
      decided.set(cell, r);
      visit();
    }
    work.cells[cell] = UNDECIDED;
    decided.delete(cell);
  };

  const placeAndVisit = (slot: number, cell: number, rot: number): void => {
    work.place(slot, cell, rot);
    visit();
    work.pickUp(cell);
  };

  function visit(): void {
    const key = stateKey();
    if (visited.has(key)) return;
    visited.add(key);
    nodes++;
    if (nodes > maxNodes) throw new Stop('nodes');
    if (now && deadline !== undefined && (nodes & 127) === 0 && now() > deadline) throw new Stop('time');

    const pending = emitterCells.find((i) => !decided.has(i));
    if (pending !== undefined) return decide(pending);

    const t = trace(work);
    const forced = decisionCells.find((i) => !decided.has(i) && t.lit[i]);
    if (forced !== undefined) return decide(forced);

    if (t.solved) record(t);
    if (work.invCount() === 0) return;

    // Place a tray piece where light currently enters, if it changes that light.
    for (let c = 0; c < work.size; c++) {
      if (work.cells[c] !== null || !t.lit[c]) continue;
      const arr = arrivals(work, t, c);
      work.inv.forEach((s, slot) => {
        if (s.count <= 0) return;
        for (const r of work.rotations(s.proto)) {
          if (isActive({ ...s.proto, rot: r }, arr)) placeAndVisit(slot, c, r);
        }
      });
    }

    // A lit portal still missing its twin: the twin's exit may go on any empty cell.
    if (!hasPortals) return;
    const partner = portalPartners(work);
    for (let q = 0; q < work.size; q++) {
      const p = work.cells[q];
      if (p?.kind !== 'portal' || partner[q]! >= 0 || !t.lit[q]) continue;
      const slot = work.inv.findIndex((s) => s.count > 0 && s.proto.kind === 'portal' && s.proto.link === p.link);
      if (slot < 0) continue;
      for (let c = 0; c < work.size; c++) {
        if (work.cells[c] === null && !t.lit[c]) placeAndVisit(slot, c, 0); // lit cells were covered above
      }
    }
  }

  let stopped: SolveResult['stopped'];
  try {
    visit();
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    stopped = e.reason;
  }

  const solutions = [...found.values()].sort(
    (a, b) => a.pieces - b.pieces || a.decisions - b.decisions || a.moves.join(' ').localeCompare(b.moves.join(' ')),
  );
  const best = solutions[0];
  const result: SolveResult = {
    complete: stopped === undefined,
    count: solutions.length,
    solutions: solutions.slice(0, maxSolutions),
    minPieces: best ? best.pieces : Infinity,
    nodes,
    difficulty: best ? Math.round((Math.log2(nodes) + best.decisions) * 10) / 10 : Infinity,
  };
  if (stopped) result.stopped = stopped;
  return result;
}

/**
 * The level's board with a solution applied: movable pieces cleared to the
 * tray, then every placement made. Pieces the solution doesn't mention keep
 * their starting state.
 */
export function applySolution(start: Board, solution: Pick<Solution, 'placements'>): Board {
  const b = start.clone();
  b.cells.forEach((p, i) => {
    if (p && canMove(p)) b.pickUp(i);
  });
  for (const { cell, piece } of solution.placements) {
    if (piece.lock === 'free') {
      const slot = b.inv.findIndex(
        (s) => s.count > 0 && s.proto.kind === piece.kind && s.proto.color === piece.color && s.proto.link === piece.link,
      );
      if (slot < 0 || !b.place(slot, cell, piece.rot)) throw new Error(`cannot place ${formatToken(piece)} at ${cell}`);
    } else {
      const p = b.cells[cell];
      if (!p || p.kind !== piece.kind) throw new Error(`no ${piece.kind} at ${cell}`);
      p.rot = piece.rot;
    }
  }
  return b;
}
