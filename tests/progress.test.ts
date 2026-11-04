import { describe, expect, it } from 'vitest';
import { resumeIndex, unlockedWorlds } from '../src/game/progress';
import { PACKS } from '../src/levels';

const solvedSet = (ids: string[]) => (id: string) => ids.includes(id);
const firstN = (w: number, n: number) => PACKS[w]!.levels.slice(0, n).map((l) => l.id);

describe('world gates', () => {
  it('open only the first world at the start', () => {
    expect(unlockedWorlds(PACKS, () => false)).toEqual([true, false, false, false, false]);
  });

  it('open the next world after six solves, never skipping a closed one', () => {
    expect(unlockedWorlds(PACKS, solvedSet(firstN(0, 5)))[1]).toBe(false);
    expect(unlockedWorlds(PACKS, solvedSet(firstN(0, 6)))).toEqual([true, true, false, false, false]);
    // Solves in world 3 do not open world 4 while world 3 itself is still closed.
    expect(unlockedWorlds(PACKS, solvedSet([...firstN(0, 6), ...firstN(2, 8)]))).toEqual([true, true, false, false, false]);
  });

  it('cap the requirement at the world size', () => {
    const tiny = [{ levels: [{ id: 'a' }, { id: 'b' }] }, { levels: [{ id: 'c' }] }];
    expect(unlockedWorlds(tiny, solvedSet(['a', 'b']))).toEqual([true, true]);
  });

  it('resume at the last open level, else the first unsolved one', () => {
    expect(resumeIndex(PACKS, () => false)).toBe(0);
    expect(resumeIndex(PACKS, solvedSet(['1-1', '1-2']))).toBe(2);
    expect(resumeIndex(PACKS, solvedSet(['1-1']), '1-4')).toBe(3);
    expect(resumeIndex(PACKS, solvedSet(['1-1']), '3-2')).toBe(1); // remembered level is locked
    expect(resumeIndex(PACKS, solvedSet(['1-1', '1-4', '1-5']), '1-4')).toBe(5); // solved: move on
    const all = PACKS.flatMap((p) => p.levels.map((l) => l.id));
    expect(resumeIndex(PACKS, solvedSet(all), '2-3')).toBe(11); // everything solved: stay put
  });
});
