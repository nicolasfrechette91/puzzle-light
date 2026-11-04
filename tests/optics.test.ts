import { describe, expect, it } from 'vitest';
import { BLUE, CYAN, GREEN, RED, WHITE } from '../src/core/color';
import { E, N, NE, S, SE, W } from '../src/core/dir';
import { parseGrid } from '../src/core/level';
import { trace } from '../src/core/trace';
import { board } from './helpers';

const lit = (t: ReturnType<typeof trace>, cell: number, dir: number) => t.out[cell * 8 + dir]!;
const got = (grid: string[]) => trace(board(grid)).targets.map((t) => t.got);

describe('corners', () => {
  it('blocks a diagonal beam between two walls touching at a corner', () => {
    const b = board(['Er1 #', '#   Tr']);
    const t = trace(b);
    expect(t.solved).toBe(false);
    expect(t.lit[3]).toBe(0);
    expect(t.steps).toBe(1);
  });

  it('lets it pass when only one side is a wall, or the other side is glass', () => {
    expect(trace(board(['Er1 #', '.   Tr'])).solved).toBe(true);
    expect(trace(board(['Er1 .', '#   Tr'])).solved).toBe(true);
    expect(trace(board(['Er1 #', 'G   Tr'])).solved).toBe(true);
  });

  it('does not affect orthogonal beams', () => {
    expect(trace(board(['#   #', 'Er0 Tr', '#   #'])).solved).toBe(true);
  });
});

describe('splitter', () => {
  it('transmits and reflects', () => {
    const t = trace(board(['Er0 S2 Tr', '.   Tr .']));
    expect(t.solved).toBe(true);
  });

  it('is a single beam when parallel', () => {
    const b = board(['Er0 S0 Tr']);
    const t = trace(b);
    expect(t.solved).toBe(true);
    expect(lit(t, 1, E)).toBe(RED);
  });

  it('terminates on a true loop and lights it in both directions', () => {
    // The south-going half circles through four mirrors and re-enters the
    // splitter going south: exactly the state it left in. Processing must stop.
    const b = board([
      '.   .  M6 .  M2', //
      'Er0 .  S2 .  .',
      '.   .  M2 .  M6',
    ]);
    const t = trace(b);
    const at = (x: number, y: number) => b.idx(x, y);
    expect(lit(t, at(2, 1), S)).toBe(RED);
    expect(lit(t, at(2, 2), E)).toBe(RED);
    expect(lit(t, at(4, 2), N)).toBe(RED);
    expect(lit(t, at(4, 0), W)).toBe(RED);
    expect(lit(t, at(2, 0), S)).toBe(RED);
    expect(lit(t, at(2, 1), E)).toBe(RED);
    expect(t.steps).toBeLessThan(20);
  });
});

describe('prism', () => {
  const fan = ['.   .  Tr', 'Ew0 P  Tg', '.   .  Tb'];

  it('splits white into red left, green straight, blue right', () => {
    const t = trace(board(fan));
    expect(t.solved).toBe(true);
    expect(lit(t, 4, NE)).toBe(RED);
    expect(lit(t, 4, E)).toBe(GREEN);
    expect(lit(t, 4, SE)).toBe(BLUE);
  });

  it('acts per channel on mixed and pure light', () => {
    expect(got(['.   .  Tr', 'Ey0 P  Tg', '.   .  Tb'])).toEqual([RED, GREEN, 0]);
    expect(got(['.   .  Tr', 'Eb0 P  Tg', '.   .  Tb'])).toEqual([0, 0, BLUE]);
  });

  it('turns relative to the incoming direction', () => {
    // Travelling south, "left" is east: red leaves south-east.
    const t = trace(board(['.  Ew2 .', '.  P   .', 'Tb Tg  Tr']));
    expect(t.solved).toBe(true);
  });
});

describe('filter', () => {
  it('passes only the matching channels (bitwise AND)', () => {
    expect(trace(board(['Ew0 Fr Tr'])).solved).toBe(true);
    expect(trace(board(['Ew0 Fy Ty'])).solved).toBe(true);
    expect(got(['Ec0 Fy Tg'])).toEqual([GREEN]);
  });

  it('absorbs what it blocks', () => {
    const t = trace(board(['Eg0 Fr Tr']));
    expect(t.targets[0]!.got).toBe(0);
    expect(t.hit[1]).toBe(GREEN);
    expect(trace(board(['Ew0 Fr Tr'])).hit[1]).toBe(CYAN);
  });
});

describe('glass and black holes', () => {
  it('glass passes light but takes the cell', () => {
    const b = board(['Er0 G Tr'], { M: 1 });
    expect(trace(b).solved).toBe(true);
    expect(b.place(0, 1)).toBe(false);
  });

  it('a black hole absorbs everything and can come from the tray', () => {
    const b = board(['Ew0 . Tw'], { X: 1 });
    expect(trace(b).solved).toBe(true);
    expect(b.place(0, 1)).toBe(true);
    const t = trace(b);
    expect(t.solved).toBe(false);
    expect(t.hit[1]).toBe(WHITE);
  });
});

describe('portals', () => {
  it('teleports light, keeping its direction', () => {
    const b = board(['Er0 O1 # .', '.   #  O1 Tr']);
    const t = trace(b);
    expect(t.solved).toBe(true);
    expect(lit(t, b.idx(2, 1), E)).toBe(RED);
    expect(t.lit[b.idx(2, 1)]).toBe(RED); // the exit portal glows too
  });

  it('works both ways', () => {
    expect(trace(board(['Tr O1 # O1 Er4'])).solved).toBe(true);
  });

  it('keeps pairs separate', () => {
    // Red enters pair 1 and comes out of the other pair-1 portal, next to the wrong target.
    expect(got(['Er0 O1 # O2 Tr', '.   O2 # O1 Tg'])).toEqual([0, RED]);
    expect(got(['Er0 O1 # O2 Tr', 'Eg0 O2 # O1 Tg'])).toEqual([GREEN, RED]);
  });

  it('absorbs light when unpaired (e.g. half placed from the tray)', () => {
    const t = trace(parseGrid(['Er0 O1 Tr']));
    expect(t.solved).toBe(false);
    expect(t.hit[1]).toBe(RED);
  });

  it('places from the tray by pair id', () => {
    const b = board(['Er0 . # .  Tr'], { O4: 2 });
    expect(b.inv).toHaveLength(1);
    b.place(0, 1);
    expect(trace(b).solved).toBe(false);
    b.place(0, 3);
    expect(trace(b).solved).toBe(true);
    b.pickUp(1);
    expect(b.inv[0]!.count).toBe(1);
  });
});

describe('mixing', () => {
  it('recombines a split beam into a secondary colour', () => {
    // The prism fans white out; two mirrors steer red and blue into one magenta target.
    const b = board([
      '.   .  .  .  .  .  .',
      '.   .  .  .  M7 .  Tm',
      '.   .  .  .  .  .  .',
      'Ew0 .  P  .  .  .  Tg',
      '.   .  .  M0 .  .  .',
    ]);
    const t = trace(b);
    expect(t.targets.map((x) => [x.want, x.got])).toEqual([
      [RED | BLUE, RED | BLUE],
      [GREEN, GREEN],
    ]);
    // Blue's diagonal crosses green's path at (4,3) without either changing.
    expect(lit(t, b.idx(4, 3), E)).toBe(GREEN);
    expect(lit(t, b.idx(4, 3), NE)).toBe(BLUE);
    expect(t.solved).toBe(true);
  });
});
