import { Board, type Bends } from './board';
import { BLUE, GREEN, RED, WHITE, type Color } from './color';
import { type LevelData, parseLevel, toLevelData } from './level';
import { canRotate, KINDS, type Kind, type Piece } from './piece';
import { rng, type Rng } from './random';
import { isActive, solve, type Solution, type SolveResult } from './solver';
import { slotKey } from './token';
import { arrivals, nextCell, trace } from './trace';

/**
 * Procedural levels, built "solution first" and verified by the solver.
 *
 * Each attempt:
 *   1. puts emitters on the border, facing inward;
 *   2. places pieces one at a time on cells light reaches, keeping only
 *      placements that change that light;
 *   3. puts targets where beams end, wanting whatever colour arrives;
 *   4. drops any piece that ended up making no difference;
 *   5. moves the pieces to the tray (or leaves some in place, rotatable, at a
 *      scrambled orientation) and scatters walls on cells the light never uses;
 *   6. asks the solver: while there is a second solution, blocks a cell only
 *      the rival uses (wall if the intended light never touches it, glass if it
 *      does), then removes walls that turn out not to matter.
 *
 * A level is accepted only if it has exactly one solution, every tray piece
 * and every rotatable piece is used in it, it isn't solved at the start, and
 * its difficulty is inside the tier's band. Everything is driven by a seeded
 * PRNG and exact integer comparisons, so a seed gives the same level in
 * every browser (D-050).
 */

/**
 * Bump when a change alters which level a seed produces. Daily puzzles and
 * shared endless levels are keyed by it, so old ones stay reproducible in
 * spirit and nobody is silently handed a different "today" mid-day.
 */
export const GENERATOR_VERSION = 1;

export type Tier = 'easy' | 'medium' | 'hard';
export const TIERS: readonly Tier[] = ['easy', 'medium', 'hard'];

interface KindChoice {
  kind: Kind;
  weight: number;
  /** Filter pass bands to choose from. */
  colors?: Color[];
}

export interface TierSpec {
  sizes: readonly (readonly [number, number])[];
  bends: Bends;
  emitters: readonly [number, number];
  emitterColors: readonly Color[];
  pieces: readonly [number, number];
  kinds: readonly KindChoice[];
  /** Chance (num/den) that a rotatable solution piece stays on the board, rotate-only. */
  rotateOnly: readonly [number, number];
  targets: readonly [number, number];
  /** Wall density on cells the solution's light never uses (num/den). */
  walls: readonly [number, number];
  /** Accepted difficulty: lo ≤ log2(states) + decisions < hi (D-015). */
  band: readonly [number, number];
}

export const TIER_SPECS: Readonly<Record<Tier, TierSpec>> = {
  easy: {
    sizes: [
      [5, 4],
      [6, 4],
      [5, 5],
      [6, 5],
    ],
    bends: 90,
    emitters: [1, 1],
    emitterColors: [RED, GREEN, BLUE],
    pieces: [1, 2],
    kinds: [{ kind: 'mirror', weight: 1 }],
    rotateOnly: [1, 3],
    targets: [1, 1],
    walls: [1, 6],
    band: [5, 10],
  },
  medium: {
    sizes: [
      [6, 5],
      [7, 5],
      [6, 6],
    ],
    bends: 45,
    emitters: [1, 2],
    emitterColors: [RED, GREEN, BLUE, WHITE],
    pieces: [2, 3],
    kinds: [
      { kind: 'mirror', weight: 4 },
      { kind: 'splitter', weight: 2 },
      { kind: 'filter', weight: 1, colors: [RED, GREEN, BLUE, 3, 5, 6] },
    ],
    rotateOnly: [1, 4],
    targets: [1, 2],
    walls: [1, 5],
    band: [10, 15],
  },
  hard: {
    // Measured: three pieces with half of them rotate-only keeps hard levels at
    // difficulty 14–17 while generating in about half a second (D-052).
    sizes: [
      [6, 5],
      [7, 5],
      [6, 6],
    ],
    bends: 45,
    emitters: [1, 2],
    emitterColors: [RED, GREEN, BLUE, WHITE, WHITE],
    pieces: [3, 3],
    kinds: [
      { kind: 'mirror', weight: 4 },
      { kind: 'splitter', weight: 2 },
      { kind: 'prism', weight: 2 },
      { kind: 'filter', weight: 1, colors: [RED, GREEN, BLUE, 3, 5, 6] },
      { kind: 'hole', weight: 1 },
    ],
    rotateOnly: [1, 2],
    targets: [2, 3],
    walls: [1, 5],
    band: [14, 19],
  },
};

export interface GenerateOptions {
  seed: number;
  tier: Tier;
  /** Attempts before giving up (each attempt is cheap). Default 400. */
  maxAttempts?: number;
  /**
   * Solver state budget for the final check. By default the most states an
   * in-band level can need: 2^(hi − fewest pieces), since difficulty is
   * log2(states) + decisions and decisions ≥ pieces. Repair checks get 4× that.
   */
  maxNodes?: number;
}

export interface Generated {
  level: LevelData;
  tier: Tier;
  seed: number;
  /** 1-based attempt that produced the level. */
  attempt: number;
  difficulty: number;
  solution: Solution;
}

/** Exact band test for log2(nodes) + decisions in [lo, hi), with no floating-point logarithms. */
export function inBand(nodes: number, decisions: number, [lo, hi]: readonly [number, number]): boolean {
  const v = nodes * 2 ** decisions;
  return v >= 2 ** lo && v < 2 ** hi;
}

const ADJECTIVES = ['Quiet', 'Pale', 'Silver', 'Distant', 'Gentle', 'Hidden', 'Folded', 'Tilted', 'Bright', 'Hollow', 'Still', 'Amber', 'Velvet', 'Glass', 'Paper', 'Lunar', 'Slow', 'Narrow', 'Open', 'Late'];
const NOUNS = ['Corridor', 'Lantern', 'Harbour', 'Garden', 'Signal', 'Window', 'Crossing', 'Orchard', 'Tide', 'Ember', 'Atrium', 'Meridian', 'Prism', 'Shore', 'Veil', 'Arc', 'Courtyard', 'Echo', 'Horizon', 'Lattice'];

const between = (R: Rng, [lo, hi]: readonly [number, number]) => lo + R.int(hi - lo + 1);

function weighted(R: Rng, kinds: readonly KindChoice[]): KindChoice {
  const total = kinds.reduce((n, k) => n + k.weight, 0);
  let x = R.int(total);
  for (const k of kinds) {
    if (x < k.weight) return k;
    x -= k.weight;
  }
  return kinds[kinds.length - 1]!;
}

const DIR_FROM_EDGE = { left: 0, top: 2, right: 4, bottom: 6 } as const;

function placeEmitters(R: Rng, b: Board, spec: TierSpec): boolean {
  const n = between(R, spec.emitters);
  const colors = R.shuffle(spec.emitterColors);
  for (let k = 0; k < n; k++) {
    let placed = false;
    for (let tries = 0; tries < 20 && !placed; tries++) {
      const edge = R.pick(['left', 'top', 'right', 'bottom'] as const);
      const along = edge === 'left' || edge === 'right' ? 1 + R.int(b.h - 2) : 1 + R.int(b.w - 2);
      const x = edge === 'left' ? 0 : edge === 'right' ? b.w - 1 : along;
      const y = edge === 'top' ? 0 : edge === 'bottom' ? b.h - 1 : along;
      const i = b.idx(x, y);
      const dir = DIR_FROM_EDGE[edge];
      const front = nextCell(b, i, dir);
      if (b.cells[i] || front < 0 || b.cells[front]) continue;
      b.cells[i] = { kind: 'emitter', rot: dir, color: colors[k % colors.length]!, lock: 'fixed' };
      placed = true;
    }
    if (!placed) return false;
  }
  return true;
}

const litCount = (b: Board) => trace(b).lit.reduce((n, v) => n + (v ? 1 : 0), 0);

/** Place one piece on a lit cell where it changes the light, preferring placements that keep more light on the board. */
function placePiece(R: Rng, b: Board, spec: TierSpec): number {
  const t = trace(b);
  const lit = R.shuffle(b.cells.flatMap((p, i) => (!p && t.lit[i] ? [i] : [])));
  let best: { cell: number; piece: Piece; score: number } | null = null;
  for (const cell of lit.slice(0, 10)) {
    const arr = arrivals(b, t, cell);
    const choice = weighted(R, spec.kinds);
    const color = choice.colors ? R.pick(choice.colors) : 0;
    const proto: Piece = { kind: choice.kind, rot: 0, color, lock: 'free' };
    for (const rot of R.shuffle(b.rotations(proto))) {
      const piece = { ...proto, rot };
      if (!isActive(piece, arr)) continue;
      b.cells[cell] = piece;
      const score = litCount(b);
      b.cells[cell] = null;
      if (!best || score > best.score) best = { cell, piece, score };
      break;
    }
  }
  if (!best) return -1;
  b.cells[best.cell] = best.piece;
  return best.cell;
}

/** Cells where light is about to leave the board or hit a wall: natural places for targets. */
function beamEnds(b: Board): number[] {
  const t = trace(b);
  const ends: number[] = [];
  for (let c = 0; c < b.size; c++) {
    if (b.cells[c] || !t.lit[c]) continue;
    for (let d = 0; d < 8; d++) {
      if (!t.out[c * 8 + d]) continue;
      const j = nextCell(b, c, d);
      if (j < 0 || b.cells[j]?.kind === 'wall') ends.push(c);
    }
  }
  return [...new Set(ends)];
}

interface Construction {
  /** Board with the solution in place (pieces free, targets set). */
  solved: Board;
  /** Cells holding the solution's pieces. */
  pieces: number[];
}

function construct(R: Rng, spec: TierSpec): Construction | null {
  const [w, h] = R.pick(spec.sizes);
  const b = new Board(w, h, new Array<Piece | null>(w * h).fill(null), [], spec.bends);
  if (!placeEmitters(R, b, spec)) return null;
  const emitterCells = new Set(b.cells.flatMap((p, i) => (p?.kind === 'emitter' ? [i] : [])));

  const pieces: number[] = [];
  for (let k = between(R, spec.pieces); k > 0; k--) {
    const c = placePiece(R, b, spec);
    if (c < 0) return null;
    pieces.push(c);
  }

  // Targets where beams end, away from emitters; want whatever arrives.
  const near = (c: number) => [...emitterCells].some((e) => Math.abs(b.x(c) - b.x(e)) + Math.abs(b.y(c) - b.y(e)) <= 1);
  const t0 = trace(b);
  const ends = R.shuffle(beamEnds(b).filter((c) => !near(c)));
  const others = R.shuffle(b.cells.flatMap((p, i) => (!p && t0.lit[i] && !near(i) && !ends.includes(i) ? [i] : [])));
  const spots = [...ends, ...others];
  const nTargets = between(R, spec.targets);
  if (spots.length < nTargets) return null;
  const targets = spots.slice(0, nTargets);
  for (const c of targets) b.cells[c] = { kind: 'target', rot: 0, color: WHITE, lock: 'fixed' };
  const t1 = trace(b);
  for (const tg of t1.targets) {
    if (!tg.got) return null; // an earlier target swallowed this one's light
    b.cells[tg.cell]!.color = tg.got;
  }

  // Drop pieces that make no difference now that targets absorb light.
  const t2 = trace(b);
  const kept = pieces.filter((c) => {
    const p = b.cells[c]!;
    const active = isActive(p, arrivals(b, t2, c));
    if (!active) b.cells[c] = null;
    return active;
  });
  if (!kept.length || !trace(b).solved) return null;
  return { solved: b, pieces: kept };
}

/** Turn the solved construction into the starting board: pieces to the tray or scrambled in place, plus walls. */
function makePuzzle(R: Rng, spec: TierSpec, c: Construction): { puzzle: Board; walls: number[] } {
  const solvedTrace = trace(c.solved);
  const cells = c.solved.cells.map((p) => (p ? { ...p } : null));
  const inv: Board['inv'] = [];
  for (const i of c.pieces) {
    const p = cells[i]!;
    const rotatable = KINDS[p.kind].rotSteps > 1;
    if (rotatable && R.chance(spec.rotateOnly[0], spec.rotateOnly[1])) {
      const others = c.solved.rotations(p).filter((r) => r !== p.rot);
      cells[i] = { ...p, rot: R.pick(others), lock: 'rotate' };
    } else {
      cells[i] = null;
      const proto: Piece = { ...p, rot: 0, lock: 'free' };
      const slot = inv.find((s) => slotKey(s.proto) === slotKey(proto));
      if (slot) slot.count++;
      else inv.push({ proto, count: 1 });
    }
  }
  const walls: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] || solvedTrace.lit[i] || c.pieces.includes(i)) continue;
    if (R.chance(spec.walls[0], spec.walls[1])) {
      cells[i] = { kind: 'wall', rot: 0, color: 0, lock: 'fixed' };
      walls.push(i);
    }
  }
  return { puzzle: new Board(c.solved.w, c.solved.h, cells, inv, spec.bends), walls };
}

/** Uniqueness check: stops at the second solution. */
function check(b: Board, maxNodes: number): SolveResult {
  return solve(b, { stopAfter: 2, maxNodes, maxSolutions: 2 });
}

/** Walls the tidy pass may try to remove (each try is a full search). */
const TIDY_LIMIT = 4;

/**
 * Build, repair and tidy one candidate. The result's `result` is a complete
 * search of the returned board (a uniqueness check that found exactly one
 * solution has searched everything), so no extra solve is needed.
 */
function attemptOnce(R: Rng, spec: TierSpec, maxNodes: number): { board: Board; result: SolveResult } | null {
  const c = construct(R, spec);
  if (!c) return null;
  const { puzzle, walls } = makePuzzle(R, spec, c);
  if (trace(puzzle).solved) return null;
  const intended = new Set(c.pieces);
  const solvedLit = trace(c.solved).lit;
  const unique = (r: SolveResult) => r.complete && r.count === 1;

  // Repair: block cells that only rival solutions use (with a roomier budget,
  // because rivals are still open at this stage).
  let r = check(puzzle, maxNodes * 4);
  for (let round = 0; round < 6 && !unique(r); round++) {
    if (r.count === 0 || (!r.complete && r.stopped !== 'enough')) return null;
    const rivalCells = r.solutions.flatMap((s) => s.placements.map((p) => p.cell)).filter((i) => !intended.has(i) && !puzzle.cells[i]);
    if (!rivalCells.length) return null; // rivals differ only in how shared pieces turn
    const i = R.pick(rivalCells);
    puzzle.cells[i] = { kind: solvedLit[i] ? 'glass' : 'wall', rot: 0, color: 0, lock: 'fixed' };
    if (!solvedLit[i]) walls.push(i);
    r = check(puzzle, maxNodes * 4);
  }
  if (!unique(r) || r.nodes > maxNodes) return null;
  // Opening the board only makes it harder; if it's already past the band, stop here.
  const decisions = r.solutions[0]!.decisions;
  if (r.nodes * 2 ** decisions >= 2 ** spec.band[1]) return null;

  // Tidy: remove walls the uniqueness doesn't depend on, while still in budget.
  for (const i of R.shuffle(walls).slice(0, TIDY_LIMIT)) {
    if (inBand(r.nodes, decisions, spec.band) && R.chance(1, 2)) break; // good enough; keep some walls for texture
    const saved = puzzle.cells[i];
    puzzle.cells[i] = null;
    const again = check(puzzle, maxNodes);
    if (unique(again) && again.nodes * 2 ** decisions < 2 ** spec.band[1]) r = again;
    else puzzle.cells[i] = saved;
  }
  return { board: puzzle, result: r };
}

/** Pieces the player controls must all matter: every tray piece placed, every rotatable piece active. */
function everyPieceMatters(b: Board, s: Solution): boolean {
  const tray = b.inv.reduce((n, slot) => n + slot.count, 0);
  if (s.pieces !== tray) return false;
  const used = new Set(s.placements.map((p) => p.cell));
  return b.cells.every((p, i) => !p || !canRotate(p) || p.lock !== 'rotate' || used.has(i));
}

/** Generate one level for a tier from a seed. Returns null if no attempt passed (rare). */
export function generate(opts: GenerateOptions): Generated | null {
  const spec = TIER_SPECS[opts.tier];
  const maxAttempts = opts.maxAttempts ?? 400;
  const maxNodes = opts.maxNodes ?? 2 ** (spec.band[1] - spec.pieces[0]);
  const master = rng(opts.seed);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const R = rng(master.fork());
    const got = attemptOnce(R, spec, maxNodes);
    if (!got) continue;
    const s = got.result.solutions[0]!;
    if (!everyPieceMatters(got.board, s)) continue;
    if (!inBand(got.result.nodes, s.decisions, spec.band)) continue;
    const name = `${R.pick(ADJECTIVES)} ${R.pick(NOUNS)}`;
    const meta: Omit<LevelData, 'grid' | 'inv'> = { id: `gen${GENERATOR_VERSION}-${opts.tier}-${opts.seed >>> 0}`, name };
    if (spec.bends === 90) meta.bends = 90;
    const level = toLevelData(got.board, meta);
    if (level.inv) for (const [k, v] of Object.entries(level.inv)) if (v === 0) delete level.inv[k];
    // Round-trip through the parser so what we hand out is exactly what players load.
    parseLevel(level);
    return { level, tier: opts.tier, seed: opts.seed >>> 0, attempt, difficulty: got.result.difficulty, solution: s };
  }
  return null;
}
