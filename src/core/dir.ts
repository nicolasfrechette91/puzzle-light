/**
 * Eight beam directions, numbered clockwise on screen (y grows downward),
 * starting East: 0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE.
 */
export type Dir = number;

export const E = 0;
export const SE = 1;
export const S = 2;
export const SW = 3;
export const W = 4;
export const NW = 5;
export const N = 6;
export const NE = 7;

export const DX: readonly number[] = [1, 1, 0, -1, -1, -1, 0, 1];
export const DY: readonly number[] = [0, 1, 1, 1, 0, -1, -1, -1];
export const DIR_NAMES: readonly string[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

/** Rotate a direction by `steps` × 45° clockwise (negative = counter-clockwise). */
export const turn = (d: Dir, steps: number): Dir => (d + steps) & 7;

export const opposite = (d: Dir): Dir => (d + 4) & 7;

export const isDiagonal = (d: Dir): boolean => (d & 1) === 1;

/**
 * Reflect a beam travelling in direction `d` off a double-sided mirror whose
 * line lies at `k × 22.5°` (k in 0..7). Reflection across a line at angle θ maps
 * angle α to 2θ − α, and with θ = k·22.5°, α = d·45° that is exactly `k − d`.
 */
export const reflect = (k: number, d: Dir): Dir => (k - d) & 7;
