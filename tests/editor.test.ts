import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/core/level';
import { solve } from '../src/core/solver';
import { EditorModel, effectiveLock, type Brush } from '../src/editor/model';
import { ALL_LEVELS } from '../src/levels';

const brush = (kind: Brush['kind'], extra: Partial<Brush> = {}): Brush => ({ kind, color: 1, rot: 0, link: 1, lock: 'fixed', ...extra });

describe('EditorModel', () => {
  it('builds a playable level from a blank board', () => {
    const m = EditorModel.blank(5, 3);
    expect(m.problem()).toMatch(/emitter/);
    m.paint(m.board.idx(0, 1), brush('emitter'));
    expect(m.problem()).toMatch(/target/);
    m.paint(m.board.idx(4, 1), brush('target'));
    expect(m.problem()).toBeNull();
    expect(m.toLevel().grid).toEqual(['.   .   .   .   .', 'Er0 .   .   .   Tr', '.   .   .   .   .']);
  });

  it('round-trips every bundled level unchanged', () => {
    for (const l of ALL_LEVELS) {
      const m = new EditorModel(l);
      expect(parseLevel(m.toLevel()).key(), l.id).toBe(parseLevel(l).key());
    }
  });

  it('reports puzzle-rule problems instead of throwing', () => {
    const m = EditorModel.blank(4, 2);
    m.paint(0, brush('emitter'));
    m.paint(3, brush('target'));
    m.paint(1, brush('portal', { link: 2 }));
    expect(m.problem()).toMatch(/portal pair 2 has 1 portal/);
    m.paint(5, brush('portal', { link: 2 }));
    expect(m.problem()).toBeNull();
  });

  it('keeps structure pieces out of the player’s hands', () => {
    expect(effectiveLock('wall', 'free')).toBe('fixed');
    expect(effectiveLock('emitter', 'free')).toBe('rotate');
    expect(effectiveLock('glass', 'rotate')).toBe('fixed');
    expect(effectiveLock('mirror', 'free')).toBe('free');
    const m = EditorModel.blank();
    expect(m.addToTray(brush('target'))).toBe(false);
    expect(m.addToTray(brush('mirror', { rot: 3 }))).toBe(true);
    expect(m.addToTray(brush('mirror'))).toBe(true);
    expect(m.toLevel().inv).toEqual({ M3: 2 });
    m.removeFromTray(0);
    m.removeFromTray(0);
    expect(m.toLevel().inv).toBeUndefined();
  });

  it('rotates any piece, respecting bends', () => {
    const m = EditorModel.blank(3, 3);
    m.paint(4, brush('mirror'));
    m.rotateAt(4, 1);
    expect(m.board.cells[4]!.rot).toBe(1);
    m.setMeta({ bends: 90 });
    expect(m.board.cells[4]!.rot).toBe(0); // snapped to an even orientation
    m.rotateAt(4, 1);
    expect(m.board.cells[4]!.rot).toBe(2);
  });

  it('resizes keeping the top-left corner, within limits', () => {
    const m = EditorModel.blank(4, 3);
    m.paint(m.board.idx(1, 1), brush('wall'));
    m.resize(6, 5);
    expect([m.board.w, m.board.h]).toEqual([6, 5]);
    expect(m.board.at(1, 1)?.kind).toBe('wall');
    m.resize(1, 99);
    expect([m.board.w, m.board.h]).toEqual([3, 10]);
  });

  it('undoes and redoes edits, grouping a paint stroke', () => {
    const m = EditorModel.blank(4, 2);
    m.paint(0, brush('wall'), 's1');
    m.paint(1, brush('wall'), 's1');
    m.paint(2, brush('wall'), 's1');
    m.paint(3, brush('emitter'));
    m.undo();
    expect(m.board.cells[3]).toBeNull();
    expect(m.board.cells[2]?.kind).toBe('wall');
    m.undo();
    expect(m.board.cells.filter(Boolean)).toHaveLength(0);
    m.redo();
    expect(m.board.cells.filter(Boolean)).toHaveLength(3);
  });

  it('produces levels the solver can check', () => {
    const m = EditorModel.blank(5, 3);
    m.paint(m.board.idx(0, 0), brush('emitter'));
    m.paint(m.board.idx(4, 2), brush('target'));
    m.addToTray(brush('mirror'));
    m.addToTray(brush('mirror'));
    const r = solve(parseLevel(m.toLevel()));
    expect(r.complete).toBe(true);
    expect(r.count).toBeGreaterThan(0);
  });
});
