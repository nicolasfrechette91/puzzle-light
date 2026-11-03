import type { Board } from './board';
import type { Color } from './color';
import { DX, DY, reflect } from './dir';

export interface TargetState {
  cell: number;
  want: Color;
  got: Color;
  ok: boolean;
}

export interface Trace {
  /** Colour mask of light leaving cell `c` in direction `d`, at index `c * 8 + d`. */
  out: Uint8Array;
  /** Colour mask absorbed at each cell (targets, walls, emitters). */
  hit: Uint8Array;
  /** Every target on the board, in cell order. */
  targets: TargetState[];
  /** Every target receives exactly its colour (and there is at least one target). */
  solved: boolean;
  /** Number of (cell, dir) propagation steps processed; useful for profiling and loop tests. */
  steps: number;
}

/**
 * Trace all beams on the board to a fixpoint.
 *
 * Each `(cell, dir, channel)` is expanded at most once: `emit` only forwards
 * colour bits that were not already leaving that cell in that direction. That
 * makes loops terminate, makes merging beams cheap, and keeps the result
 * independent of processing order.
 */
export function trace(b: Board): Trace {
  const { w, h, cells } = b;
  const n = w * h;
  const out = new Uint8Array(n * 8);
  const hit = new Uint8Array(n);
  const queue: number[] = [];

  const emit = (cell: number, dir: number, mask: number): void => {
    const k = cell * 8 + dir;
    const add = mask & ~out[k]!;
    if (add) {
      out[k]! |= add;
      queue.push(k, add);
    }
  };

  for (let i = 0; i < n; i++) {
    const p = cells[i];
    if (p && p.kind === 'emitter') emit(i, p.rot, p.color);
  }

  let head = 0;
  while (head < queue.length) {
    const k = queue[head++]!;
    const mask = queue[head++]!;
    const cell = k >> 3;
    const dir = k & 7;
    const x = (cell % w) + DX[dir]!;
    const y = ((cell / w) | 0) + DY[dir]!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue; // leaves the board
    const j = y * w + x;
    const p = cells[j];
    if (!p) {
      emit(j, dir, mask);
      continue;
    }
    switch (p.kind) {
      case 'mirror':
        emit(j, reflect(p.rot, dir), mask);
        break;
      case 'wall':
      case 'emitter':
      case 'target':
        hit[j]! |= mask;
        break;
    }
  }

  const targets: TargetState[] = [];
  for (let i = 0; i < n; i++) {
    const p = cells[i];
    if (p && p.kind === 'target') targets.push({ cell: i, want: p.color, got: hit[i]!, ok: hit[i] === p.color });
  }

  return {
    out,
    hit,
    targets,
    solved: targets.length > 0 && targets.every((t) => t.ok),
    steps: queue.length / 2,
  };
}

/** A straight piece of beam in cell units (cell centres sit at x + 0.5). */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: Color;
  /** The beam stops at the far end against an obstacle or the board edge. */
  blocked: boolean;
}

/**
 * Turn a trace into drawable segments: one per lit `(cell, dir)`, from the
 * cell centre to the next centre, or to the shared face when the next cell
 * absorbs light without showing it (walls, emitters) or is off the board.
 */
export function segments(b: Board, t: Trace): Segment[] {
  const { w, h, cells } = b;
  const segs: Segment[] = [];
  for (let k = 0; k < t.out.length; k++) {
    const color = t.out[k]!;
    if (!color) continue;
    const cell = k >> 3;
    const dir = k & 7;
    const cx = (cell % w) + 0.5;
    const cy = ((cell / w) | 0) + 0.5;
    const nx = (cell % w) + DX[dir]!;
    const ny = ((cell / w) | 0) + DY[dir]!;
    const next = nx >= 0 && ny >= 0 && nx < w && ny < h ? cells[ny * w + nx] : undefined;
    const stopAtFace = next === undefined || (next !== null && (next.kind === 'wall' || next.kind === 'emitter'));
    const len = stopAtFace ? 0.5 : 1;
    segs.push({ x1: cx, y1: cy, x2: cx + DX[dir]! * len, y2: cy + DY[dir]! * len, color, blocked: stopAtFace });
  }
  return segs;
}
