import type { Board } from '../core/board';
import { canMove, canRotate, type Piece } from '../core/piece';
import { trace, type Trace } from '../core/trace';
import type { Game } from './game';
import { cellAt, inBoard, slotAt, type Layout } from './layout';

/** Movement (px) before a press turns into a drag; touch is wobblier than a mouse. */
const DRAG_THRESHOLD_MOUSE = 5;
const DRAG_THRESHOLD_TOUCH = 10;
/** Holding still this long and releasing rotates counter-clockwise. */
export const LONG_PRESS_MS = 450;
/** On touch the carried piece floats above the finger so it stays visible. */
const TOUCH_LIFT = 0.8;

export type Source = { kind: 'cell'; cell: number } | { kind: 'slot'; slot: number } | { kind: 'none' };

interface Press {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  button: number;
  touch: boolean;
  source: Source;
  moved: boolean;
}

export interface Drag {
  piece: Piece;
  source: Source;
  /** Ghost centre, in canvas CSS px. */
  x: number;
  y: number;
  /** Board cell the piece would land on, or -1. */
  drop: number;
  /** Ghost is outside the board: releasing returns a board piece to the tray. */
  offBoard: boolean;
}

/** What the board would look like if the current drag were released now. */
export interface Preview {
  board: Board;
  trace: Trace;
}

/**
 * Turns pointer gestures into game actions:
 * tap = rotate clockwise; right-click or long-press = counter-clockwise;
 * drag = place / move / return to tray; tap slot then tap cell = place.
 */
export class Input {
  hoverCell = -1;
  hoverSlot = -1;
  selectedSlot = -1;
  drag: Drag | null = null;
  preview: Preview | null = null;
  /** Start time of a press that may become a long-press (for visual feedback). */
  pressStart: { cell: number; t0: number } | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly game: Game;
  private readonly layout: () => Layout;
  private press: Press | null = null;
  private previewKey = '';
  private wheelAcc = 0;

  constructor(canvas: HTMLCanvasElement, game: Game, layout: () => Layout) {
    this.canvas = canvas;
    this.game = game;
    this.layout = layout;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    game.on((e) => {
      // finishDrag clears `drag` before acting, so a change seen mid-drag came from
      // elsewhere (undo shortcut, level switch): the carried piece is stale.
      if (e === 'level' || this.drag) this.cancel();
      const slot = this.game.board.inv[this.selectedSlot];
      if (!slot || slot.count <= 0) this.selectedSlot = -1;
    });
  }

  /** Abort any gesture in progress (Escape, pointer cancel, level change). */
  cancel = (): void => {
    this.press = null;
    this.pressStart = null;
    this.drag = null;
    this.preview = null;
    this.previewKey = '';
    if (!this.game.board.inv[this.selectedSlot]?.count) this.selectedSlot = -1;
    this.updateCursor();
  };

  deselect(): void {
    this.selectedSlot = -1;
  }

  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onDown = (e: PointerEvent): void => {
    if (this.press || (e.button !== 0 && e.button !== 2)) return;
    const [x, y] = this.local(e);
    const L = this.layout();
    const slot = slotAt(L, x, y);
    const cell = cellAt(L, x, y);
    const source: Source = slot >= 0 ? { kind: 'slot', slot } : cell >= 0 ? { kind: 'cell', cell } : { kind: 'none' };
    this.press = {
      id: e.pointerId,
      x0: x,
      y0: y,
      t0: performance.now(),
      button: e.button,
      touch: e.pointerType !== 'mouse',
      source,
      moved: false,
    };
    const piece = cell >= 0 ? this.game.board.cells[cell] : null;
    this.pressStart = piece && canRotate(piece) && e.button === 0 ? { cell, t0: this.press.t0 } : null;
    this.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    const [x, y] = this.local(e);
    const L = this.layout();
    if (e.pointerType === 'mouse') {
      this.hoverCell = cellAt(L, x, y);
      this.hoverSlot = slotAt(L, x, y);
    }
    const p = this.press;
    if (p && e.pointerId === p.id) {
      const threshold = p.touch ? DRAG_THRESHOLD_TOUCH : DRAG_THRESHOLD_MOUSE;
      if (!p.moved && Math.hypot(x - p.x0, y - p.y0) > threshold) {
        p.moved = true;
        this.pressStart = null;
        if (p.button === 0) this.startDrag(p);
      }
      if (this.drag) this.updateDrag(x, y, p.touch);
    }
    this.updateCursor();
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    this.press = null;
    this.pressStart = null;
    if (this.drag) this.finishDrag();
    else if (!p.moved) {
      const ccw = p.button === 2 || performance.now() - p.t0 >= LONG_PRESS_MS;
      this.tap(p.source, ccw ? -1 : 1);
    }
    this.updateCursor();
  };

  private onLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      this.hoverCell = -1;
      this.hoverSlot = -1;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    const [x, y] = this.local(e);
    const cell = cellAt(this.layout(), x, y);
    const piece = cell >= 0 ? this.game.board.cells[cell] : null;
    if (!piece || !canRotate(piece)) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (Math.abs(dy) >= 50) {
      // A mouse-wheel notch: one step each.
      this.wheelAcc = 0;
      this.game.rotate(cell, Math.sign(dy));
    } else {
      // Trackpads send many small deltas: accumulate.
      this.wheelAcc += dy;
      if (Math.abs(this.wheelAcc) >= 60) {
        this.game.rotate(cell, Math.sign(this.wheelAcc));
        this.wheelAcc = 0;
      }
    }
  };

  private tap(source: Source, dir: number): void {
    const g = this.game;
    const b = g.board;
    if (source.kind === 'slot') {
      const s = b.inv[source.slot];
      this.selectedSlot = this.selectedSlot === source.slot || !s || s.count === 0 ? -1 : source.slot;
      return;
    }
    if (source.kind === 'cell') {
      const piece = b.cells[source.cell];
      if (piece && canRotate(piece)) {
        g.rotate(source.cell, dir);
        return;
      }
      if (!piece && this.selectedSlot >= 0) {
        g.place(this.selectedSlot, source.cell);
        return;
      }
    }
    this.selectedSlot = -1;
  }

  private startDrag(p: Press): void {
    const b = this.game.board;
    let piece: Piece | null = null;
    if (p.source.kind === 'cell') {
      const q = b.cells[p.source.cell];
      if (q && canMove(q)) piece = { ...q };
    } else if (p.source.kind === 'slot') {
      const s = b.inv[p.source.slot];
      if (s && s.count > 0) piece = { ...s.proto };
    }
    if (!piece) return;
    this.selectedSlot = -1;
    this.drag = { piece, source: p.source, x: p.x0, y: p.y0, drop: -1, offBoard: false };
  }

  private updateDrag(x: number, y: number, touch: boolean): void {
    const L = this.layout();
    const d = this.drag!;
    d.x = x;
    d.y = touch ? y - L.cell * TOUCH_LIFT : y;
    const cell = cellAt(L, d.x, d.y);
    const from = d.source.kind === 'cell' ? d.source.cell : -1;
    d.offBoard = !inBoard(L, d.x, d.y);
    d.drop = cell >= 0 && (cell === from || this.game.board.isEmpty(cell)) ? cell : -1;
    this.refreshPreview();
  }

  private refreshPreview(): void {
    const d = this.drag!;
    const key = `${JSON.stringify(d.source)}>${d.drop}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    const b = this.game.board.clone();
    if (d.source.kind === 'cell') {
      // Hovering somewhere invalid shows the piece lifted off the board.
      if (d.drop >= 0) b.move(d.source.cell, d.drop);
      else b.pickUp(d.source.cell);
    } else if (d.source.kind === 'slot' && d.drop >= 0) {
      b.place(d.source.slot, d.drop);
    }
    this.preview = { board: b, trace: trace(b) };
  }

  private finishDrag(): void {
    const d = this.drag!;
    this.drag = null;
    this.preview = null;
    this.previewKey = '';
    const g = this.game;
    if (d.source.kind === 'cell') {
      if (d.drop >= 0) g.move(d.source.cell, d.drop);
      else if (d.offBoard) g.pickUp(d.source.cell);
      // Dropped on an occupied cell: the piece snaps back.
    } else if (d.source.kind === 'slot' && d.drop >= 0) {
      g.place(d.source.slot, d.drop);
    }
  }

  private updateCursor(): void {
    const b = this.game.board;
    let cursor = 'default';
    if (this.drag) cursor = 'grabbing';
    else if (this.hoverSlot >= 0 && (b.inv[this.hoverSlot]?.count ?? 0) > 0) cursor = 'grab';
    else if (this.hoverCell >= 0) {
      const p = b.cells[this.hoverCell];
      if (p && canMove(p)) cursor = 'grab';
      else if (p && canRotate(p)) cursor = 'pointer';
      else if (!p && this.selectedSlot >= 0) cursor = 'copy';
    }
    if (this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
  }
}
