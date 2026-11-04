import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/core/level';
import { KINDS, type Kind } from '../src/core/piece';
import { UNDECIDED } from '../src/core/solver';
import { portalPartners } from '../src/core/trace';
import { board } from './helpers';

/**
 * Assumptions the solver's pruning rests on. If a future piece breaks one,
 * these fail before the solver silently misses solutions.
 */
describe('solver assumptions', () => {
  /** Whether a level may let the player move a piece of this kind (D-013). */
  const movable = (kind: Kind): boolean => {
    const info = KINDS[kind];
    const tok = `${info.code}${info.colored ? 'r' : ''}${info.linked ? '1' : ''}*`;
    try {
      parseLevel({ id: 'x', name: 'x', grid: [`Er0 ${tok} ${info.linked ? tok : '.'} Tr`] });
      return true;
    } catch {
      return false;
    }
  };

  it('never moves or turns a piece that can pinch a corner', () => {
    // Only lit pieces matter to the search; a corner-blocker could change the light
    // without being lit, and an undecided rotate-only piece stands in as a black hole.
    for (const kind of Object.keys(KINDS) as Kind[]) {
      const turnable = KINDS[kind].rotSteps > 1;
      if (turnable || movable(kind)) expect(KINDS[kind].cornerBlock, `${kind} can be moved or turned`).toBe(false);
    }
    expect(KINDS[UNDECIDED.kind].cornerBlock, 'the undecided placeholder').toBe(false);
    expect(movable('mirror')).toBe(true); // the probe itself works
    expect(movable('wall')).toBe(false);
  });
});

describe('portalPartners', () => {
  it('can’t be written to when it is the shared "no portals" answer', () => {
    const b = board(['Er0 . Tr']);
    const shared = portalPartners(b) as unknown as number[];
    expect(() => {
      shared[0] = 2;
    }).toThrow(TypeError);
    expect(portalPartners(board(['Eg0 . Tg']))[0]).toBe(-1);
  });

  it('gives each caller its own pairing when portals exist', () => {
    const b = board(['Er0 O1 . O1 Tr']);
    const a = portalPartners(b) as unknown as number[];
    a[1] = 99;
    expect(portalPartners(b)[1]).toBe(3);
  });
});
