import type { Board } from './board';
import { canMove, canRotate, type Piece } from './piece';
import { applySolution, isActive, type Placement, type Solution } from './solver';
import { arrivals, nextCell, portalPartners, trace, type Trace } from './trace';

/** The single next step a hint suggests. */
export type Hint =
  /** Put a tray piece on `cell` with orientation `rot`. */
  | { kind: 'place'; slot: number; cell: number; piece: Piece }
  /** Drag the piece at `from` to `cell` (and turn it to `piece.rot`). */
  | { kind: 'move'; from: number; cell: number; piece: Piece }
  /** Turn the piece at `cell` to `rot`. */
  | { kind: 'rotate'; cell: number; rot: number }
  /** Take the piece at `cell` off the board: it is in the way. */
  | { kind: 'remove'; cell: number };

/** Order in which light first reaches each cell (emitters first); Infinity if never. */
export function lightOrder(b: Board, t: Trace): number[] {
  const order = new Array<number>(b.size).fill(Infinity);
  const partner = portalPartners(b);
  const queue: number[] = [];
  b.cells.forEach((p, i) => {
    if (p?.kind === 'emitter') {
      order[i] = queue.length;
      queue.push(i);
    }
  });
  let n = queue.length;
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!;
    for (let d = 0; d < 8; d++) {
      if (!t.out[c * 8 + d]) continue;
      const j = nextCell(b, c, d);
      if (j < 0) continue;
      for (const k of [j, partner[j]!]) {
        if (k >= 0 && order[k] === Infinity) {
          order[k] = n++;
          queue.push(k);
        }
      }
    }
  }
  return order;
}

const samePiece = (a: Piece, b: Piece) => a.kind === b.kind && a.color === b.color && a.link === b.link;

function satisfied(b: Board, pl: Placement): boolean {
  const p = b.cells[pl.cell];
  return !!p && samePiece(p, pl.piece) && p.rot === pl.piece.rot && (pl.piece.lock !== 'free' || p.lock === 'free');
}

/** Free pieces on the board that change the light but belong to no step of `sol`. */
function intruders(b: Board, t: Trace, sol: Solution): number[] {
  const wanted = new Set(sol.placements.map((p) => p.cell));
  const out: number[] = [];
  b.cells.forEach((p, i) => {
    if (!p || !canMove(p) || wanted.has(i)) return;
    const active = p.kind === 'portal' ? t.lit[i] !== 0 : isActive(p, arrivals(b, t, i));
    if (active) out.push(i);
  });
  return out;
}

/**
 * The next step towards the solution closest to the current board, or null if
 * the board is already solved or no solution is known.
 *
 * Steps are suggested in the order light reaches them in the finished
 * solution, so following hints walks the beam from the emitter onward.
 */
export function nextHint(start: Board, board: Board, solutions: readonly Solution[]): Hint | null {
  const now = trace(board);
  if (now.solved || solutions.length === 0) return null;

  // Closest solution: fewest unmet steps, then fewest pieces in the way.
  let best = solutions[0]!;
  let bestScore = Infinity;
  for (const sol of solutions) {
    const unmet = sol.placements.filter((pl) => !satisfied(board, pl)).length;
    const score = unmet * 100 + intruders(board, now, sol).length;
    if (score < bestScore) {
      bestScore = score;
      best = sol;
    }
  }

  const solved = applySolution(start, best);
  const order = lightOrder(solved, trace(solved));
  const steps = best.placements.filter((pl) => !satisfied(board, pl)).sort((a, b) => order[a.cell]! - order[b.cell]! || a.cell - b.cell);

  const step = steps[0];
  if (!step) {
    // Every step is in place, so something else is spoiling the light.
    const extra = intruders(board, now, best).sort((a, b) => order[a]! - order[b]! || a - b);
    return extra.length ? { kind: 'remove', cell: extra[0]! } : null;
  }

  const here = board.cells[step.cell];
  if (step.piece.lock !== 'free') return { kind: 'rotate', cell: step.cell, rot: step.piece.rot };
  if (here && samePiece(here, step.piece) && canRotate(here)) return { kind: 'rotate', cell: step.cell, rot: step.piece.rot };
  if (here) return { kind: 'remove', cell: step.cell };
  const slot = board.inv.findIndex((s) => s.count > 0 && samePiece(s.proto, step.piece));
  if (slot >= 0) return { kind: 'place', slot, cell: step.cell, piece: step.piece };
  // No spare in the tray: borrow a matching piece that isn't where any step wants it.
  const wanted = new Set(best.placements.filter((pl) => satisfied(board, pl)).map((pl) => pl.cell));
  const from = board.cells.findIndex((p, i) => !!p && p.lock === 'free' && samePiece(p, step.piece) && !wanted.has(i));
  return from >= 0 ? { kind: 'move', from, cell: step.cell, piece: step.piece } : null;
}
