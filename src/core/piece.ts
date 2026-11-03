import type { Color } from './color';

export type Kind = 'wall' | 'emitter' | 'target' | 'mirror';

/**
 * How the player may interact with a piece:
 * - `fixed`  part of the puzzle, untouchable
 * - `rotate` stays in place but can be rotated
 * - `free`   can be moved, rotated and returned to the inventory
 */
export type Lock = 'fixed' | 'rotate' | 'free';

export interface Piece {
  kind: Kind;
  /** Orientation step (0 ≤ rot < rotSteps). Emitter: direction. Mirror: line angle in 22.5° steps. */
  rot: number;
  /** Colour mask: emitter output or target requirement; 0 for colourless kinds. */
  color: Color;
  lock: Lock;
}

export interface KindInfo {
  /** Token letter used in level JSON. */
  code: string;
  /** Number of distinct orientations (1 = orientation-free). */
  rotSteps: number;
  /** Visual rotation per step, in degrees. */
  rotDeg: number;
  /** Whether the token carries a colour letter. */
  colored: boolean;
}

export const KINDS: Readonly<Record<Kind, KindInfo>> = {
  wall: { code: '#', rotSteps: 1, rotDeg: 0, colored: false },
  emitter: { code: 'E', rotSteps: 8, rotDeg: 45, colored: true },
  target: { code: 'T', rotSteps: 1, rotDeg: 0, colored: true },
  mirror: { code: 'M', rotSteps: 8, rotDeg: 22.5, colored: false },
};

export const KIND_BY_CODE: Readonly<Record<string, Kind>> = Object.fromEntries(
  (Object.keys(KINDS) as Kind[]).map((k) => [KINDS[k].code, k]),
);

export const canRotate = (p: Piece): boolean => p.lock !== 'fixed' && KINDS[p.kind].rotSteps > 1;

export const canMove = (p: Piece): boolean => p.lock === 'free';

export const rotDegrees = (p: Piece): number => p.rot * KINDS[p.kind].rotDeg;
