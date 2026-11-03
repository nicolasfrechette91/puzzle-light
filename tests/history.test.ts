import { describe, expect, it } from 'vitest';
import { History } from '../src/core/history';

const make = () => new History<number>(0, String);

describe('History', () => {
  it('undoes and redoes', () => {
    const h = make();
    h.push(1);
    h.push(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe(1);
    expect(h.current).toBe(1);
  });

  it('ignores no-op pushes', () => {
    const h = make();
    expect(h.push(0)).toBe(false);
    expect(h.canUndo).toBe(false);
  });

  it('drops the redo branch on a new push', () => {
    const h = make();
    h.push(1);
    h.push(2);
    h.undo();
    h.push(3);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe(1);
  });

  it('coalesces a streak of same-tag pushes', () => {
    const h = make();
    h.push(1, 'rot:5');
    h.push(2, 'rot:5');
    h.push(3, 'rot:5');
    expect(h.depth).toBe(1);
    expect(h.undo()).toBe(0);
  });

  it('removes a streak that returns to its start', () => {
    const h = make();
    h.push(1);
    h.push(2, 'rot:5');
    h.push(1, 'rot:5');
    expect(h.current).toBe(1);
    expect(h.depth).toBe(1);
  });

  it('does not coalesce across an undo or a different tag', () => {
    const h = make();
    h.push(1, 'a');
    h.push(2, 'b');
    h.push(3, 'a');
    expect(h.depth).toBe(3);
    h.undo();
    h.push(4, 'b');
    expect(h.depth).toBe(3);
  });
});
