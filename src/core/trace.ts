import type { Board } from './board';
import { BLUE, GREEN, RED, type Color } from './color';
import { DX, DY, reflect } from './dir';
import { KINDS } from './piece';

/** `nextCell` result: the beam leaves the grid. */
export const OFF_BOARD = -1;
/** `nextCell` result: a diagonal beam is pinched between two corner-blocking cells (walls). */
export const CORNER = -2;

/**
 * Where light leaving `cell` towards `dir` arrives: a cell index, OFF_BOARD,
 * or CORNER when a diagonal step would squeeze between two walls that touch
 * at a corner.
 */
export function nextCell(b: Board, cell: number, dir: number): number {
  const { w, h, cells } = b;
  const cx = cell % w;
  const cy = (cell / w) | 0;
  const x = cx + DX[dir]!;
  const y = cy + DY[dir]!;
  if (x < 0 || y < 0 || x >= w || y >= h) return OFF_BOARD;
  if (dir & 1) {
    const side1 = cells[cy * w + x];
    const side2 = cells[y * w + cx];
    if (side1 && side2 && KINDS[side1.kind].cornerBlock && KINDS[side2.kind].cornerBlock) return CORNER;
  }
  return y * w + x;
}

/**
 * Partner cell for every portal whose pair id appears exactly twice; -1 for
 * other cells and for unpaired portals (which absorb light).
 */
export function portalPartners(b: Board): Int32Array {
  const partner = new Int32Array(b.size).fill(-1);
  const byLink = new Map<number, number[]>();
  b.cells.forEach((p, i) => {
    if (p?.kind !== 'portal') return;
    const link = p.link ?? 0;
    const list = byLink.get(link);
    if (list) list.push(i);
    else byLink.set(link, [i]);
  });
  for (const list of byLink.values()) {
    if (list.length !== 2) continue;
    partner[list[0]!] = list[1]!;
    partner[list[1]!] = list[0]!;
  }
  return partner;
}

export interface Arrival {
  /** Direction the light is travelling as it enters. */
  dir: number;
  mask: Color;
}

/** Light entering `cell` from its neighbours (teleported light is not included). */
export function arrivals(b: Board, t: Trace, cell: number): Arrival[] {
  const { w, h } = b;
  const x = cell % w;
  const y = (cell / w) | 0;
  const list: Arrival[] = [];
  for (let d = 0; d < 8; d++) {
    const px = x - DX[d]!;
    const py = y - DY[d]!;
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    const from = py * w + px;
    const mask = t.out[from * 8 + d]!;
    if (mask && nextCell(b, from, d) === cell) list.push({ dir: d, mask });
  }
  return list;
}

export interface TargetState {
  cell: number;
  want: Color;
  got: Color;
  ok: boolean;
}

export interface Trace {
  /** Colour mask of light leaving cell `c` in direction `d`, at index `c * 8 + d`. */
  out: Uint8Array;
  /** Colour mask of light entering each cell (including light leaving an exit portal). */
  lit: Uint8Array;
  /** Colour mask absorbed at each cell (targets, walls, emitters, holes, filters, lone portals). */
  hit: Uint8Array;
  /** Every target on the board, in cell order. */
  targets: TargetState[];
  /** Every target receives exactly its colour (and there is at least one target). */
  solved: boolean;
  /** Number of (cell, dir, colours) propagation steps processed. */
  steps: number;
}

/**
 * Trace all beams on the board to a fixpoint.
 *
 * Each `(cell, dir, channel)` is expanded at most once: `emit` only forwards
 * colour bits that were not already leaving that cell in that direction. That
 * makes loops terminate, makes merging beams cheap, and keeps the result
 * independent of processing order. Every interaction acts on each colour
 * channel independently, so forwarding only the new bits is exact.
 */
export function trace(b: Board): Trace {
  const { cells } = b;
  const n = b.size;
  const out = new Uint8Array(n * 8);
  const lit = new Uint8Array(n);
  const hit = new Uint8Array(n);
  const partner = portalPartners(b);
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
    const dir = k & 7;
    const j = nextCell(b, k >> 3, dir);
    if (j < 0) continue; // left the board or pinched in a corner
    lit[j]! |= mask;
    const p = cells[j];
    if (!p) {
      emit(j, dir, mask);
      continue;
    }
    switch (p.kind) {
      case 'glass':
        emit(j, dir, mask);
        break;
      case 'mirror':
        emit(j, reflect(p.rot, dir), mask);
        break;
      case 'splitter':
        emit(j, dir, mask);
        emit(j, reflect(p.rot, dir), mask);
        break;
      case 'prism': {
        // State 0: red bends 45° left of travel, blue 45° right; state 1 swaps them. Green goes straight.
        const redTurn = p.rot ? 1 : 7;
        if (mask & RED) emit(j, (dir + redTurn) & 7, RED);
        if (mask & GREEN) emit(j, dir, GREEN);
        if (mask & BLUE) emit(j, (dir + 8 - redTurn) & 7, BLUE);
        break;
      }
      case 'filter': {
        const pass = mask & p.color;
        if (pass) emit(j, dir, pass);
        if (mask & ~p.color) hit[j]! |= mask & ~p.color;
        break;
      }
      case 'portal': {
        const q = partner[j]!;
        if (q >= 0) {
          lit[q]! |= mask;
          emit(q, dir, mask);
        } else hit[j]! |= mask;
        break;
      }
      case 'wall':
      case 'emitter':
      case 'target':
      case 'hole':
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
    lit,
    hit,
    targets,
    solved: targets.length > 0 && targets.every((t) => t.ok),
    steps: queue.length / 2,
  };
}

/**
 * How a drawn beam segment ends:
 * - `center` reaches the next cell's centre (floor, optics, targets, holes, portals)
 * - `face`   stops at the face of a wall or emitter
 * - `corner` is pinched at the corner between two walls
 * - `edge`   leaves the board
 */
export type SegmentEnd = 'center' | 'face' | 'corner' | 'edge';

/** A straight piece of beam in cell units (cell centres sit at x + 0.5). */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: Color;
  end: SegmentEnd;
}

/** Turn a trace into drawable segments: one per lit `(cell, dir)`. */
export function segments(b: Board, t: Trace): Segment[] {
  const { w, cells } = b;
  const segs: Segment[] = [];
  for (let k = 0; k < t.out.length; k++) {
    const color = t.out[k]!;
    if (!color) continue;
    const cell = k >> 3;
    const dir = k & 7;
    const cx = (cell % w) + 0.5;
    const cy = ((cell / w) | 0) + 0.5;
    const j = nextCell(b, cell, dir);
    let end: SegmentEnd;
    if (j === OFF_BOARD) end = 'edge';
    else if (j === CORNER) end = 'corner';
    else {
      const p = cells[j];
      end = p && (p.kind === 'wall' || p.kind === 'emitter') ? 'face' : 'center';
    }
    const len = end === 'center' ? 1 : 0.5;
    segs.push({ x1: cx, y1: cy, x2: cx + DX[dir]! * len, y2: cy + DY[dir]! * len, color, end });
  }
  return segs;
}
