import { describe, expect, it } from 'vitest';
import { board } from './helpers';

describe('Board', () => {
  const make = () => board(['Er0 .   M2   M4~', '.   M1* #    .'], { M: 1 });

  it('places from inventory onto empty floor only', () => {
    const b = make();
    expect(b.place(0, b.idx(2, 0))).toBe(false); // occupied
    expect(b.place(0, b.idx(1, 0))).toBe(true);
    expect(b.at(1, 0)).toMatchObject({ kind: 'mirror', lock: 'free' });
    expect(b.inv[0]!.count).toBe(0);
    expect(b.place(0, b.idx(0, 1))).toBe(false); // slot empty
  });

  it('moves only free pieces onto empty cells', () => {
    const b = make();
    expect(b.move(b.idx(2, 0), b.idx(1, 0))).toBe(false); // fixed
    expect(b.move(b.idx(3, 0), b.idx(1, 0))).toBe(false); // rotate-only
    expect(b.move(b.idx(1, 1), b.idx(2, 1))).toBe(false); // onto wall
    expect(b.move(b.idx(1, 1), b.idx(0, 1))).toBe(true);
    expect(b.at(0, 1)).toMatchObject({ rot: 1, lock: 'free' });
    expect(b.at(1, 1)).toBeNull();
  });

  it('returns free pieces to the matching slot', () => {
    const b = make();
    expect(b.pickUp(b.idx(2, 0))).toBe(false);
    expect(b.pickUp(b.idx(1, 1))).toBe(true);
    expect(b.inv).toHaveLength(1);
    expect(b.inv[0]!.count).toBe(2);
    expect(b.invCount()).toBe(2);
  });

  it('creates a slot when a piece has none (boards built without parseLevel)', () => {
    const b = board(['M3* .']);
    b.inv.length = 0;
    expect(b.pickUp(0)).toBe(true);
    expect(b.inv).toEqual([{ proto: { kind: 'mirror', rot: 0, color: 0, lock: 'free' }, count: 1 }]);
  });

  it('rotates rotatable pieces with wrap-around in both directions', () => {
    const b = make();
    const i = b.idx(3, 0);
    expect(b.rotate(b.idx(2, 0), 1)).toBe(false); // fixed
    expect(b.rotate(i, 5)).toBe(true);
    expect(b.at(3, 0)!.rot).toBe(1);
    expect(b.rotate(i, -3)).toBe(true);
    expect(b.at(3, 0)!.rot).toBe(6);
    expect(b.rotate(b.idx(0, 0), 1)).toBe(false); // fixed emitter
  });

  it('clones deeply and keys canonically', () => {
    const b = make();
    const c = b.clone();
    c.rotate(c.idx(3, 0), 1);
    c.place(0, c.idx(1, 0));
    expect(b.at(3, 0)!.rot).toBe(4);
    expect(b.inv[0]!.count).toBe(1);
    expect(c.key()).not.toBe(b.key());
    expect(b.clone().key()).toBe(b.key());
  });
});
