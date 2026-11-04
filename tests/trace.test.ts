import { describe, expect, it } from 'vitest';
import { E, S, SE } from '../src/core/dir';
import { parseGrid } from '../src/core/level';
import { segments, trace } from '../src/core/trace';
import { board, rng } from './helpers';

const lit = (t: ReturnType<typeof trace>, cell: number, dir: number) => t.out[cell * 8 + dir]!;

describe('trace', () => {
  it('runs straight into a target', () => {
    const b = board(['Er0 . . Tr']);
    const t = trace(b);
    expect(t.solved).toBe(true);
    expect(t.targets).toEqual([{ cell: 3, want: 1, got: 1, ok: true }]);
    expect([0, 1, 2].map((c) => lit(t, c, E))).toEqual([1, 1, 1]);
  });

  it('is stopped by walls and the board edge', () => {
    const t = trace(board(['Er0 # Tr']));
    expect(t.solved).toBe(false);
    expect(t.hit[1]).toBe(1);
    const off = trace(board(['Tr . Er0']));
    expect(off.solved).toBe(false);
    expect(off.steps).toBe(1); // emitted, then left the board
  });

  it('needs at least one target to be solved', () => {
    expect(trace(board(['Er0 . .'])).solved).toBe(false);
  });

  it('reflects off mirrors, including diagonals', () => {
    const b = board([
      'Er0 . M2 .', //
      '.   . .  .',
      '.   . M3 .',
      '.   . .  Tr',
    ]);
    const t = trace(b);
    expect(lit(t, b.idx(2, 0), S)).toBe(1); // "\" turned it south
    expect(lit(t, b.idx(2, 2), SE)).toBe(1); // rot 3 bends south-bound light 45° to south-east
    expect(t.solved).toBe(true);
  });

  it('passes along parallel mirrors and bounces back off perpendicular ones', () => {
    const pass = trace(board(['Er0 M0 Tr']));
    expect(pass.solved).toBe(true);
    const back = trace(board(['Er0 . M4 Tr']));
    expect(back.solved).toBe(false);
    expect(back.hit[0]).toBe(1); // came home to the emitter
  });

  it('requires the exact colour and mixes additively', () => {
    expect(trace(board(['Er0 . Tg'])).targets[0]!.ok).toBe(false);
    // Red from the west and green from the north meet in a yellow target.
    const mix = board([
      '.   .  Eg2', //
      'Er0 .  Ty',
    ]);
    // Green goes south from (2,0) into (2,1): the target. Red goes east into it too.
    const t = trace(mix);
    expect(t.targets[0]).toMatchObject({ want: 3, got: 3, ok: true });
    // Targets absorb, and red + green + blue overshoots a yellow target to white.
    const over = trace(board(['.   Eb2 .', 'Er0 Ty  .', '.   Eg6 .']));
    expect(over.targets[0]).toMatchObject({ want: 3, got: 7, ok: false });
  });

  it('merges identical beams instead of re-tracing them', () => {
    // Two red emitters feed the same corridor through a mirror; the merged part is expanded once.
    const b = board([
      'Er0 . . M6 . . Tr', //
      '.   . . .  . . .',
      '.   . . Er6 . . .',
    ]);
    const t = trace(b);
    expect(t.solved).toBe(true);
    // (3,0) leaves east once even though two paths reach it.
    expect(lit(t, b.idx(3, 0), E)).toBe(1);
  });

  it('equals the union of each emitter traced alone, within the state bound', () => {
    // Optics act on each beam independently, so the fixpoint must be the OR of
    // single-emitter traces regardless of which emitter is processed first.
    const rand = rng(12345);
    const toks = () => {
      const r = rand(30);
      if (r < 11) return '.';
      if (r < 14) return '#';
      if (r < 16) return `E${'rgbw'[rand(4)]}${rand(8)}`;
      if (r < 18) return `T${'rgbycmw'[rand(7)]}`;
      if (r < 21) return `M${rand(8)}`;
      if (r < 23) return `S${rand(8)}`;
      if (r < 24) return 'P';
      if (r < 25) return `F${'rgbycmw'[rand(7)]}`;
      if (r < 26) return 'G';
      if (r < 27) return 'X';
      return `O${rand(2)}`; // often unpaired or over-paired: both must behave
    };
    for (let round = 0; round < 400; round++) {
      const w = 3 + rand(6);
      const h = 3 + rand(6);
      const grid = Array.from({ length: h }, () => Array.from({ length: w }, toks).join(' '));
      const all = parseGrid(grid);
      const full = trace(all);
      expect(full.steps).toBeLessThanOrEqual(all.size * 8 * 3);
      const out = new Uint8Array(full.out.length);
      const hit = new Uint8Array(full.hit.length);
      all.cells.forEach((p, i) => {
        if (p?.kind !== 'emitter') return;
        const solo = all.clone();
        solo.cells.forEach((q, j) => {
          // A hole absorbs like an emitter does without changing corner blocking.
          if (q?.kind === 'emitter' && j !== i) solo.cells[j] = { kind: 'hole', rot: 0, color: 0, lock: 'fixed' };
        });
        const t = trace(solo);
        t.out.forEach((m, k) => (out[k]! |= m));
        t.hit.forEach((m, k) => (hit[k]! |= m));
      });
      expect(full.out).toEqual(out);
      expect(full.hit).toEqual(hit);
    }
  });

  it('builds render segments that stop at walls and edges', () => {
    const b = board(['Er0 . #', '. . .']);
    const segs = segments(b, trace(b));
    expect(segs).toEqual([
      { x1: 0.5, y1: 0.5, x2: 1.5, y2: 0.5, color: 1, end: 'center' },
      { x1: 1.5, y1: 0.5, x2: 2, y2: 0.5, color: 1, end: 'face' },
    ]);
    const edge = board(['. Er6']);
    expect(segments(edge, trace(edge))).toEqual([{ x1: 1.5, y1: 0.5, x2: 1.5, y2: 0, color: 1, end: 'edge' }]);
    const pinch = board(['Er1 #', '#   Tr']);
    expect(segments(pinch, trace(pinch))).toEqual([{ x1: 0.5, y1: 0.5, x2: 1, y2: 1, color: 1, end: 'corner' }]);
  });
});
