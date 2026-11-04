import type { Color } from './color';

export type Kind =
  | 'wall'
  | 'emitter'
  | 'target'
  | 'mirror'
  | 'splitter'
  | 'prism'
  | 'filter'
  | 'glass'
  | 'hole'
  | 'portal';

/**
 * How the player may interact with a piece:
 * - `fixed`  part of the puzzle, untouchable
 * - `rotate` stays in place but can be rotated
 * - `free`   can be moved, rotated and returned to the inventory
 */
export type Lock = 'fixed' | 'rotate' | 'free';

export interface Piece {
  kind: Kind;
  /** Orientation step (0 ≤ rot < rotSteps). Emitter: direction. Mirror/splitter: line angle in 22.5° steps. */
  rot: number;
  /** Colour mask: emitter output, target requirement, filter pass band; 0 for colourless kinds. */
  color: Color;
  lock: Lock;
  /** Portal pair id (0..9); only present on portals. */
  link?: number;
}

export interface KindInfo {
  /** Token letter used in level JSON. */
  code: string;
  /** Human-readable name. */
  name: string;
  /** Number of distinct orientations (1 = orientation-free). */
  rotSteps: number;
  /** Visual rotation per step, in degrees. */
  rotDeg: number;
  /** Whether the token carries a colour letter. */
  colored: boolean;
  /** Whether the token's digit is a pair id (portals) rather than an orientation. */
  linked: boolean;
  /** Blocks diagonal light squeezing between it and another corner-blocker. */
  cornerBlock: boolean;
}

const info = (code: string, name: string, extra: Partial<KindInfo> = {}): KindInfo => ({
  code,
  name,
  rotSteps: 1,
  rotDeg: 0,
  colored: false,
  linked: false,
  cornerBlock: false,
  ...extra,
});

export const KINDS: Readonly<Record<Kind, KindInfo>> = {
  wall: info('#', 'wall', { cornerBlock: true }),
  emitter: info('E', 'emitter', { rotSteps: 8, rotDeg: 45, colored: true }),
  target: info('T', 'target', { colored: true }),
  mirror: info('M', 'mirror', { rotSteps: 8, rotDeg: 22.5 }),
  splitter: info('S', 'splitter', { rotSteps: 8, rotDeg: 22.5 }),
  // The prism's fan follows the incoming beam, so it has no orientation of its own.
  prism: info('P', 'prism'),
  filter: info('F', 'filter', { colored: true }),
  glass: info('G', 'glass'),
  hole: info('X', 'black hole'),
  portal: info('O', 'portal', { linked: true }),
};

export const KIND_BY_CODE: Readonly<Record<string, Kind>> = Object.fromEntries(
  (Object.keys(KINDS) as Kind[]).map((k) => [KINDS[k].code, k]),
);

export const canRotate = (p: Piece): boolean => p.lock !== 'fixed' && KINDS[p.kind].rotSteps > 1;

export const canMove = (p: Piece): boolean => p.lock === 'free';

export const rotDegrees = (p: Piece): number => p.rot * KINDS[p.kind].rotDeg;
