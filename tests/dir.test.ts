import { describe, expect, it } from 'vitest';
import { DX, DY, E, N, NE, opposite, reflect, S, SE, turn, W } from '../src/core/dir';

describe('directions', () => {
  it('are unit steps clockwise from east', () => {
    const angles = DX.map((dx, d) => Math.atan2(DY[d]!, dx) * (180 / Math.PI));
    angles.forEach((a, d) => expect(((a + 360) % 360)).toBeCloseTo(d * 45));
  });

  it('turn and opposite wrap', () => {
    expect(turn(E, -1)).toBe(NE);
    expect(turn(NE, 1)).toBe(E);
    expect(opposite(E)).toBe(W);
    expect(opposite(N)).toBe(S);
  });
});

describe('reflect', () => {
  it('matches the classic \\ and / mirrors', () => {
    expect(reflect(2, E)).toBe(S); // "\" turns east-bound light south
    expect(reflect(6, E)).toBe(N); // "/" turns it north
    expect(reflect(2, N)).toBe(W);
    expect(reflect(6, S)).toBe(W);
  });

  it('bends by 45° on the in-between orientations', () => {
    expect(reflect(1, E)).toBe(SE);
    expect(reflect(7, E)).toBe(NE);
  });

  it('passes parallel light and returns perpendicular light', () => {
    for (let d = 0; d < 8; d++) {
      expect(reflect((2 * d) & 7, d)).toBe(d); // mirror line parallel to the beam
      expect(reflect((2 * d + 4) & 7, d)).toBe(opposite(d)); // perpendicular
    }
  });

  it('is an involution and reversible', () => {
    for (let k = 0; k < 8; k++)
      for (let d = 0; d < 8; d++) {
        expect(reflect(k, reflect(k, d))).toBe(d);
        // Light retracing its path in reverse comes back out the way it came in.
        expect(reflect(k, opposite(reflect(k, d)))).toBe(opposite(d));
      }
  });
});
