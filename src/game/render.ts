import type { Board } from '../core/board';
import { rgba, type Color } from '../core/color';
import { canMove, canRotate, rotDegrees, type Piece } from '../core/piece';
import { segments, type Segment, type Trace } from '../core/trace';
import type { Game } from './game';
import { LONG_PRESS_MS, type Input } from './input';
import type { Layout } from './layout';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const BG = '#05070d';
const TILE = 'rgba(150,170,230,0.03)';
const TILE_EDGE = 'rgba(150,170,230,0.05)';
const ACCENT = [190, 210, 255] as const;
const accent = (a: number) => `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},${a})`;

/** Beam glow passes, wide and faint to narrow and bright: [width in cells, alpha]. */
const BEAM_PASSES: readonly (readonly [number, number])[] = [
  [0.5, 0.04],
  [0.28, 0.08],
  [0.14, 0.2],
  [0.065, 0.8],
];

interface PieceStyle {
  /** Colour arriving at a target. */
  got?: Color;
  ok?: boolean;
  /** Seconds, for gentle animation. */
  time: number;
  alpha?: number;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private segCache: { trace: Trace; segs: Segment[] } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
  }

  draw(game: Game, input: Input, L: Layout, nowMs: number): void {
    const ctx = this.ctx;
    const time = nowMs / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const view = input.preview ?? { board: game.board, trace: game.trace };

    this.background(L);
    this.floor(view.board, L, input);
    this.beams(view.board, view.trace, L, time, game.solved && !input.preview);
    this.pieces(view.board, view.trace, L, time);
    this.interaction(game.board, input, L, nowMs);
    this.tray(game.board, input, L, time);
    this.ghost(input, L, time);
  }

  private background(L: Layout): void {
    const ctx = this.ctx;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, L.width, L.height);
    const cx = L.bx + (L.cols * L.cell) / 2;
    const cy = L.by + (L.rows * L.cell) / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(L.width, L.height) * 0.75);
    g.addColorStop(0, 'rgba(38,50,92,0.32)');
    g.addColorStop(1, 'rgba(5,7,13,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.width, L.height);
  }

  private floor(b: Board, L: Layout, input: Input): void {
    const ctx = this.ctx;
    const s = L.cell;
    const tiles = new Path2D();
    const walls = new Path2D();
    const open = new Path2D();
    const placing = input.drag !== null || input.selectedSlot >= 0;
    for (let i = 0; i < b.size; i++) {
      const x = L.bx + (i % b.w) * s;
      const y = L.by + Math.floor(i / b.w) * s;
      const p = b.cells[i];
      if (p?.kind === 'wall') walls.roundRect(x + 1, y + 1, s - 2, s - 2, s * 0.12);
      else tiles.roundRect(x + 1.5, y + 1.5, s - 3, s - 3, s * 0.14);
      if (placing && !p) open.roundRect(x + 1.5, y + 1.5, s - 3, s - 3, s * 0.14);
    }
    ctx.fillStyle = TILE;
    ctx.fill(tiles);
    ctx.strokeStyle = TILE_EDGE;
    ctx.lineWidth = 1;
    ctx.stroke(tiles);
    if (placing) {
      ctx.fillStyle = accent(0.035);
      ctx.fill(open);
    }
    // Walls read as raised blocks: lighter face, top highlight, dark base edge.
    const wg = ctx.createLinearGradient(0, L.by, 0, L.by + L.rows * s);
    wg.addColorStop(0, '#2c3550');
    wg.addColorStop(1, '#222a40');
    ctx.fillStyle = wg;
    ctx.fill(walls);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke(walls);
    ctx.beginPath();
    for (let i = 0; i < b.size; i++) {
      if (b.cells[i]?.kind !== 'wall') continue;
      const x = L.bx + (i % b.w) * s;
      const y = L.by + Math.floor(i / b.w) * s;
      ctx.moveTo(x + s * 0.16, y + 2.5);
      ctx.lineTo(x + s * 0.84, y + 2.5);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < b.size; i++) {
      if (b.cells[i]?.kind !== 'wall') continue;
      const x = L.bx + (i % b.w) * s;
      const y = L.by + Math.floor(i / b.w) * s;
      ctx.moveTo(x + s * 0.16, y + s - 2.5);
      ctx.lineTo(x + s * 0.84, y + s - 2.5);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
  }

  private segmentsFor(b: Board, t: Trace): Segment[] {
    if (this.segCache?.trace !== t) this.segCache = { trace: t, segs: segments(b, t) };
    return this.segCache.segs;
  }

  private beams(b: Board, t: Trace, L: Layout, time: number, solved: boolean): void {
    const ctx = this.ctx;
    const s = L.cell;
    const segs = this.segmentsFor(b, t);
    if (segs.length === 0) return;

    // One path per colour, so overlapping same-colour strokes do not double up.
    const paths = new Map<Color, Path2D>();
    for (const g of segs) {
      let p = paths.get(g.color);
      if (!p) paths.set(g.color, (p = new Path2D()));
      p.moveTo(L.bx + g.x1 * s, L.by + g.y1 * s);
      p.lineTo(L.bx + g.x2 * s, L.by + g.y2 * s);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const shimmer = (solved ? 1.2 : 1) * (0.94 + 0.06 * Math.sin(time * 1.7));
    for (const [width, alpha] of BEAM_PASSES) {
      ctx.lineWidth = Math.max(1, s * width);
      for (const [color, path] of paths) {
        ctx.strokeStyle = rgba(color, Math.min(1, alpha * shimmer));
        ctx.stroke(path);
      }
    }
    ctx.lineWidth = Math.max(0.75, s * 0.022);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    for (const path of paths.values()) ctx.stroke(path);

    // Soft splash where a beam hits a wall or emitter.
    for (const g of segs) {
      if (!g.blocked) continue;
      const ex = g.x2;
      const ey = g.y2;
      if (ex <= 0 || ey <= 0 || ex >= b.w || ey >= b.h) continue; // leaving the board
      const px = L.bx + ex * s;
      const py = L.by + ey * s;
      const r = s * 0.24;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, rgba(g.color, 0.55));
      grad.addColorStop(1, rgba(g.color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  private pieces(b: Board, t: Trace, L: Layout, time: number): void {
    const s = L.cell;
    const got = new Map(t.targets.map((x) => [x.cell, x]));
    for (let i = 0; i < b.size; i++) {
      const p = b.cells[i];
      if (!p || p.kind === 'wall') continue;
      const cx = L.bx + ((i % b.w) + 0.5) * s;
      const cy = L.by + (Math.floor(i / b.w) + 0.5) * s;
      const tgt = got.get(i);
      drawPiece(this.ctx, p, cx, cy, s, { time, got: tgt?.got ?? 0, ok: tgt?.ok ?? false });
    }
  }

  /** Hover outline, drop target and long-press progress. */
  private interaction(b: Board, input: Input, L: Layout, nowMs: number): void {
    const ctx = this.ctx;
    const s = L.cell;
    const outline = (i: number, color: string, width: number) => {
      const x = L.bx + (i % L.cols) * s;
      const y = L.by + Math.floor(i / L.cols) * s;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, s - 4, s - 4, s * 0.14);
      ctx.stroke();
    };
    if (input.drag) {
      if (input.drag.drop >= 0) outline(input.drag.drop, accent(0.55), 2);
      return;
    }
    const h = input.hoverCell;
    if (h >= 0) {
      const p = b.cells[h];
      const interactive = p ? canRotate(p) || canMove(p) : input.selectedSlot >= 0;
      if (interactive) outline(h, accent(p ? 0.16 : 0.4), 1.5);
    }
    const ps = input.pressStart;
    if (ps) {
      const k = (nowMs - ps.t0) / LONG_PRESS_MS;
      if (k > 0.25) {
        const [cx, cy] = [L.bx + ((ps.cell % L.cols) + 0.5) * s, L.by + (Math.floor(ps.cell / L.cols) + 0.5) * s];
        ctx.strokeStyle = accent(0.7);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        // Sweeps counter-clockwise: the direction a long-press will rotate.
        ctx.arc(cx, cy, s * 0.46, -Math.PI / 2, -Math.PI / 2 - TAU * Math.min(1, (k - 0.25) / 0.75), true);
        ctx.stroke();
      }
    }
  }

  private tray(b: Board, input: Input, L: Layout, time: number): void {
    const ctx = this.ctx;
    const t = L.tray;
    if (!t) return;
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(t.x, t.y, t.w, t.h, Math.min(t.w, t.h) * 0.22);
    ctx.fill();
    ctx.stroke();

    L.slots.forEach((r, i) => {
      const slot = b.inv[i];
      if (!slot) return;
      const dragging = input.drag?.source.kind === 'slot' && input.drag.source.slot === i;
      const count = slot.count - (dragging ? 1 : 0);
      const selected = input.selectedSlot === i;
      ctx.fillStyle = selected ? accent(0.08) : 'rgba(150,170,230,0.035)';
      ctx.strokeStyle = selected ? accent(0.7) : input.hoverSlot === i && count > 0 ? accent(0.2) : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, r.w * 0.16);
      ctx.fill();
      ctx.stroke();
      drawPiece(ctx, slot.proto, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.92, { time, alpha: count > 0 ? 1 : 0.22, tray: true });
      ctx.fillStyle = count > 0 ? 'rgba(225,232,250,0.85)' : 'rgba(225,232,250,0.3)';
      ctx.font = `600 ${Math.max(10, Math.round(r.w * 0.2))}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`×${count}`, r.x + r.w - r.w * 0.08, r.y + r.h - r.w * 0.04);
    });
  }

  private ghost(input: Input, L: Layout, time: number): void {
    const d = input.drag;
    if (!d) return;
    const ctx = this.ctx;
    ctx.save();
    // When the preview already shows the piece snapped into a cell, keep the ghost faint.
    const snapped = d.drop >= 0;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = L.cell * 0.3;
    ctx.shadowOffsetY = L.cell * 0.08;
    drawPiece(ctx, { ...d.piece, lock: 'free' }, d.x, d.y, L.cell * 1.05, { time, alpha: snapped ? 0.35 : 0.95 });
    ctx.restore();
  }
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  p: Piece,
  cx: number,
  cy: number,
  s: number,
  style: PieceStyle & { tray?: boolean },
): void {
  ctx.save();
  ctx.globalAlpha = style.alpha ?? 1;
  switch (p.kind) {
    case 'emitter':
      drawEmitter(ctx, p, cx, cy, s);
      break;
    case 'target':
      drawTarget(ctx, p, cx, cy, s, style.got ?? 0, style.ok ?? false, style.time);
      break;
    case 'mirror':
      drawMirror(ctx, p, cx, cy, s, style.tray ?? false);
      break;
    case 'wall':
      ctx.fillStyle = '#28304a';
      ctx.beginPath();
      ctx.roundRect(cx - s / 2 + 1, cy - s / 2 + 1, s - 2, s - 2, s * 0.12);
      ctx.fill();
      break;
  }
  ctx.restore();
}

function drawEmitter(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number): void {
  const r = s * 0.33;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotDegrees(p) * DEG);
  // Barrel pointing along the beam.
  ctx.fillStyle = '#232b3f';
  ctx.beginPath();
  ctx.roundRect(0, -s * 0.12, s * 0.47, s * 0.24, s * 0.06);
  ctx.fill();
  ctx.fillStyle = rgba(p.color, 0.9);
  ctx.fillRect(s * 0.4, -s * 0.07, s * 0.05, s * 0.14);
  ctx.restore();

  ctx.fillStyle = '#171d2c';
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(p.color, 0.9));
  g.addColorStop(0.45, rgba(p.color, 0.35));
  g.addColorStop(1, rgba(p.color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.05, 0, TAU);
  ctx.fill();
}

function drawTarget(
  ctx: CanvasRenderingContext2D,
  p: Piece,
  cx: number,
  cy: number,
  s: number,
  got: Color,
  ok: boolean,
  time: number,
): void {
  const R = s * 0.29;
  if (ok) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.8 + 0.2 * Math.sin(time * 2.2);
    const g = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, s * 0.8);
    g.addColorStop(0, rgba(p.color, 0.38 * pulse));
    g.addColorStop(1, rgba(p.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
    ctx.restore();
  }
  ctx.fillStyle = '#0c101a';
  ctx.beginPath();
  ctx.arc(cx, cy, R + s * 0.07, 0, TAU);
  ctx.fill();

  ctx.lineWidth = s * 0.065;
  ctx.strokeStyle = rgba(p.color, ok ? 1 : 0.55);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();

  // Eight notches hint that light can arrive from any direction.
  ctx.strokeStyle = 'rgba(5,7,13,0.9)';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.beginPath();
  for (let d = 0; d < 8; d++) {
    const a = d * 45 * DEG;
    ctx.moveTo(cx + Math.cos(a) * (R - s * 0.04), cy + Math.sin(a) * (R - s * 0.04));
    ctx.lineTo(cx + Math.cos(a) * (R + s * 0.04), cy + Math.sin(a) * (R + s * 0.04));
  }
  ctx.stroke();

  const r = s * 0.15;
  if (got) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.4);
    g.addColorStop(0, rgba(got, 1));
    g.addColorStop(0.7, rgba(got, ok ? 0.9 : 0.6));
    g.addColorStop(1, rgba(got, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.strokeStyle = rgba(p.color, 0.22);
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }
}

function drawMirror(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, tray: boolean): void {
  // Base communicates what the player may do: plate = movable, ring = rotatable, none = fixed.
  if (p.lock === 'free' && !tray) {
    ctx.fillStyle = '#192133';
    ctx.strokeStyle = 'rgba(170,195,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx - s * 0.42, cy - s * 0.42, s * 0.84, s * 0.84, s * 0.16);
    ctx.fill();
    ctx.stroke();
  }
  if (p.lock === 'rotate') {
    ctx.strokeStyle = 'rgba(170,195,255,0.28)';
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.setLineDash([s * 0.12, s * 0.07]);
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.41, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotDegrees(p) * DEG);
  const half = s * 0.37;
  const thick = Math.max(2, s * 0.085);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(4,6,10,0.85)';
  ctx.lineWidth = thick + Math.max(2, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(-half, 0);
  ctx.lineTo(half, 0);
  ctx.stroke();
  const g = ctx.createLinearGradient(0, -thick / 2, 0, thick / 2);
  g.addColorStop(0, '#f4f7ff');
  g.addColorStop(0.5, '#a3afc6');
  g.addColorStop(1, '#e6ecf8');
  ctx.strokeStyle = g;
  ctx.lineWidth = thick;
  ctx.stroke();
  ctx.restore();

  if (p.lock === 'fixed') {
    ctx.fillStyle = '#2a3245';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, s * 0.045), 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}
