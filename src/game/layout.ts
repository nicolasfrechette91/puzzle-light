export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Screen geometry for one board, in CSS pixels relative to the canvas. */
export interface Layout {
  width: number;
  height: number;
  cols: number;
  rows: number;
  /** Board cell size. */
  cell: number;
  /** Board top-left corner. */
  bx: number;
  by: number;
  /** Tray panel behind the inventory slots (null when there is no inventory). */
  tray: Rect | null;
  slots: Rect[];
  trayAxis: 'row' | 'column';
}

const MAX_CELL = 88;
/** Gap between board and tray, in cells. */
const GAP = 0.4;
/** Tray padding around slots, in slots. */
const TRAY_PAD = 0.16;
/** Space between slots, in slots. */
const SLOT_GAP = 0.2;

/**
 * Fit the board plus inventory tray into the canvas, putting the tray below the
 * board or to its right, whichever allows bigger cells.
 */
export function computeLayout(width: number, height: number, cols: number, rows: number, slotCount: number): Layout {
  const pad = Math.max(10, Math.min(28, Math.min(width, height) * 0.04));
  const W = Math.max(1, width - 2 * pad);
  const H = Math.max(1, height - 2 * pad);
  const trayThick = 1 + 2 * TRAY_PAD; // in cells, assuming slot == cell

  let axis: 'row' | 'column' = 'row';
  let cell: number;
  if (slotCount === 0) {
    cell = Math.min(W / cols, H / rows);
  } else {
    const below = Math.min(W / cols, H / (rows + GAP + trayThick));
    const side = Math.min(W / (cols + GAP + trayThick), H / rows);
    if (side > below * 1.04) {
      axis = 'column';
      cell = side;
    } else {
      cell = below;
    }
  }
  cell = Math.max(8, Math.floor(Math.min(cell, MAX_CELL)));

  const boardW = cols * cell;
  const boardH = rows * cell;
  const slots: Rect[] = [];
  let tray: Rect | null = null;
  let bx: number;
  let by: number;

  if (slotCount === 0) {
    bx = pad + (W - boardW) / 2;
    by = pad + (H - boardH) / 2;
  } else {
    // Slots match board cells unless the tray would not fit along its axis.
    const along = axis === 'row' ? W : H;
    const units = slotCount + (slotCount - 1) * SLOT_GAP + 2 * TRAY_PAD;
    const slot = Math.floor(Math.min(cell, along / units));
    const inner = slot * TRAY_PAD;
    const trayLen = slot * units;
    const thick = slot + 2 * inner;
    const gap = cell * GAP;
    if (axis === 'row') {
      const blockW = Math.max(boardW, trayLen);
      const blockH = boardH + gap + thick;
      const ox = pad + (W - blockW) / 2;
      const oy = pad + (H - blockH) / 2;
      bx = ox + (blockW - boardW) / 2;
      by = oy;
      tray = { x: ox + (blockW - trayLen) / 2, y: by + boardH + gap, w: trayLen, h: thick };
    } else {
      const blockW = boardW + gap + thick;
      const blockH = Math.max(boardH, trayLen);
      const ox = pad + (W - blockW) / 2;
      const oy = pad + (H - blockH) / 2;
      bx = ox;
      by = oy + (blockH - boardH) / 2;
      tray = { x: bx + boardW + gap, y: oy + (blockH - trayLen) / 2, w: thick, h: trayLen };
    }
    for (let i = 0; i < slotCount; i++) {
      const offset = inner + i * slot * (1 + SLOT_GAP);
      slots.push(
        axis === 'row'
          ? { x: tray.x + offset, y: tray.y + inner, w: slot, h: slot }
          : { x: tray.x + inner, y: tray.y + offset, w: slot, h: slot },
      );
    }
  }

  return { width, height, cols, rows, cell, bx: Math.round(bx), by: Math.round(by), tray, slots, trayAxis: axis };
}

export function inBoard(L: Layout, px: number, py: number): boolean {
  return px >= L.bx && py >= L.by && px < L.bx + L.cols * L.cell && py < L.by + L.rows * L.cell;
}

/** Cell index under a point, or -1. */
export function cellAt(L: Layout, px: number, py: number): number {
  if (!inBoard(L, px, py)) return -1;
  const x = Math.floor((px - L.bx) / L.cell);
  const y = Math.floor((py - L.by) / L.cell);
  return y * L.cols + x;
}

/** Inventory slot under a point, or -1. */
export function slotAt(L: Layout, px: number, py: number): number {
  return L.slots.findIndex((r) => px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h);
}

export function inTray(L: Layout, px: number, py: number): boolean {
  const t = L.tray;
  return !!t && px >= t.x && py >= t.y && px < t.x + t.w && py < t.y + t.h;
}

export function cellCenter(L: Layout, i: number): [number, number] {
  return [L.bx + ((i % L.cols) + 0.5) * L.cell, L.by + (Math.floor(i / L.cols) + 0.5) * L.cell];
}
